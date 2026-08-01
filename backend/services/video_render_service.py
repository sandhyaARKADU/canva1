from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from config import settings
from database import SessionLocal, VideoRenderJob


BACKEND_DIR = Path(__file__).resolve().parents[1]
RENDER_ROOT = BACKEND_DIR / "media" / "video-renders"
RENDER_ROOT.mkdir(parents=True, exist_ok=True)
ACTIVE_PROCESSES: dict[str, subprocess.Popen[str]] = {}
PROCESS_LOCK = threading.Lock()

FORMAT_CODECS = {
    "mp4": ("libx264", "video/mp4", ".mp4"),
    "webm": ("libvpx-vp9", "video/webm", ".webm"),
}
QUALITY_SETTINGS = {
    "draft": {"crf": "32", "preset": "veryfast"},
    "standard": {"crf": "24", "preset": "medium"},
    "high": {"crf": "18", "preset": "slow"},
}
TRANSITION_FILTERS = {
    "none": "fade",
    "fade": "fade",
    "crossfade": "fade",
    "slide-left": "slideleft",
    "slide-right": "slideright",
    "slide-up": "slideup",
    "slide-down": "slidedown",
    "zoom": "zoomin",
    "wipe-left": "wipeleft",
    "wipe-right": "wiperight",
}


class VideoRenderValidationError(ValueError):
    pass


def _poster_clips(timeline: dict[str, Any]) -> list[dict[str, Any]]:
    tracks = timeline.get("tracks")
    if not isinstance(tracks, list):
        raise VideoRenderValidationError("Timeline tracks are missing.")
    poster_track = next((track for track in tracks if track.get("type") == "poster"), None)
    clips = poster_track.get("clips") if isinstance(poster_track, dict) else None
    if not isinstance(clips, list) or not clips:
        raise VideoRenderValidationError("Add at least one poster clip before exporting.")
    if len(clips) > settings.MAX_VIDEO_RENDER_SCENES:
        raise VideoRenderValidationError(f"Video export supports up to {settings.MAX_VIDEO_RENDER_SCENES} scenes.")
    return clips


def validate_render_request(
    timeline: dict[str, Any],
    scene_count: int,
    output_format: str,
    width: int,
    height: int,
    fps: int,
    quality: str,
) -> tuple[list[dict[str, Any]], int]:
    if output_format not in FORMAT_CODECS:
        raise VideoRenderValidationError("Format must be mp4 or webm.")
    if fps not in {24, 30, 60}:
        raise VideoRenderValidationError("Frame rate must be 24, 30, or 60 FPS.")
    if width < 240 or height < 240 or width > 4096 or height > 4096:
        raise VideoRenderValidationError("Video dimensions must be between 240 and 4096 pixels.")
    if width % 2 or height % 2:
        raise VideoRenderValidationError("Video dimensions must be even numbers.")
    if quality not in QUALITY_SETTINGS:
        raise VideoRenderValidationError("Quality must be draft, standard, or high.")
    clips = _poster_clips(timeline)
    visible_clips = [clip for clip in clips if clip.get("visible", True)]
    if len(visible_clips) != scene_count:
        raise VideoRenderValidationError("The number of uploaded scenes does not match the visible timeline clips.")
    duration_ms = int(timeline.get("durationMs") or 0)
    if duration_ms <= 0 or duration_ms > 30 * 60 * 1000:
        raise VideoRenderValidationError("Timeline duration must be between 0.5 seconds and 30 minutes.")
    for clip in visible_clips:
        clip_duration = int(clip.get("durationMs") or 0)
        if clip_duration < 500 or clip_duration > 120_000:
            raise VideoRenderValidationError("Every poster clip must be between 0.5 and 120 seconds.")
    return visible_clips, duration_ms


def _animation_filter(
    clip: dict[str, Any],
    width: int,
    height: int,
    fps: int,
) -> str:
    duration_seconds = max(float(clip["durationMs"]) / 1000, 0.5)
    animation = clip.get("animation") or {}
    enter = animation.get("enter") or {}
    hold = animation.get("hold") or {}
    exit_animation = animation.get("exit") or {}
    enter_type = enter.get("type", "none")
    hold_type = hold.get("type", "none")
    exit_type = exit_animation.get("type", "none")
    enter_duration = min(max(float(enter.get("durationMs") or 600) / 1000, 0.1), duration_seconds / 2)
    exit_duration = min(max(float(exit_animation.get("durationMs") or 600) / 1000, 0.1), duration_seconds / 2)
    enter_delay = min(max(float(enter.get("delayMs") or 0) / 1000, 0), duration_seconds - enter_duration)
    exit_start = max(duration_seconds - exit_duration, 0)
    frame_count = max(int(duration_seconds * fps), 1)
    filters = [
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black",
        "setsar=1",
        f"fps={fps}",
        "format=yuv420p",
    ]

    selected_motion = enter_type if enter_type not in {"none", "fade"} else hold_type
    if selected_motion == "zoom-in":
        filters.append(
            f"zoompan=z='1+0.08*on/{frame_count}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps={fps}"
        )
    elif selected_motion == "zoom-out":
        filters.append(
            f"zoompan=z='1.08-0.08*on/{frame_count}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps={fps}"
        )
    elif selected_motion == "pan-left":
        filters.append(
            f"zoompan=z=1.08:x='(iw-iw/zoom)*on/{frame_count}':y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps={fps}"
        )
    elif selected_motion == "pan-right":
        filters.append(
            f"zoompan=z=1.08:x='(iw-iw/zoom)*(1-on/{frame_count})':y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps={fps}"
        )
    elif selected_motion == "pulse":
        filters.append(
            f"zoompan=z='1.015+0.015*sin(2*PI*on/{frame_count})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps={fps}"
        )

    if enter_type == "fade":
        filters.append(f"fade=t=in:st={enter_delay:.3f}:d={enter_duration:.3f}")
    elif enter_type == "slide-left":
        filters.extend([
            f"pad={width * 3}:{height}:{width}:0:color=black",
            f"crop={width}:{height}:x='if(lt(t,{enter_delay:.3f}),0,if(lt(t,{enter_delay + enter_duration:.3f}),{width}*(t-{enter_delay:.3f})/{enter_duration:.3f},{width}))':y=0",
        ])
    elif enter_type == "slide-right":
        filters.extend([
            f"pad={width * 3}:{height}:{width}:0:color=black",
            f"crop={width}:{height}:x='if(lt(t,{enter_delay:.3f}),{width * 2},if(lt(t,{enter_delay + enter_duration:.3f}),{width * 2}-{width}*(t-{enter_delay:.3f})/{enter_duration:.3f},{width}))':y=0",
        ])
    elif enter_type == "slide-up":
        filters.extend([
            f"pad={width}:{height * 3}:0:{height}:color=black",
            f"crop={width}:{height}:x=0:y='if(lt(t,{enter_delay:.3f}),0,if(lt(t,{enter_delay + enter_duration:.3f}),{height}*(t-{enter_delay:.3f})/{enter_duration:.3f},{height}))'",
        ])
    elif enter_type == "slide-down":
        filters.extend([
            f"pad={width}:{height * 3}:0:{height}:color=black",
            f"crop={width}:{height}:x=0:y='if(lt(t,{enter_delay:.3f}),{height * 2},if(lt(t,{enter_delay + enter_duration:.3f}),{height * 2}-{height}*(t-{enter_delay:.3f})/{enter_duration:.3f},{height}))'",
        ])
    if exit_type == "fade":
        filters.append(f"fade=t=out:st={exit_start:.3f}:d={exit_duration:.3f}")
    elif exit_type == "slide-left":
        filters.extend([
            f"pad={width * 3}:{height}:{width}:0:color=black",
            f"crop={width}:{height}:x='if(lt(t,{exit_start:.3f}),{width},{width}+{width}*(t-{exit_start:.3f})/{exit_duration:.3f})':y=0",
        ])
    elif exit_type == "slide-right":
        filters.extend([
            f"pad={width * 3}:{height}:{width}:0:color=black",
            f"crop={width}:{height}:x='if(lt(t,{exit_start:.3f}),{width},{width}-{width}*(t-{exit_start:.3f})/{exit_duration:.3f})':y=0",
        ])
    elif exit_type == "slide-up":
        filters.extend([
            f"pad={width}:{height * 3}:0:{height}:color=black",
            f"crop={width}:{height}:x=0:y='if(lt(t,{exit_start:.3f}),{height},{height}+{height}*(t-{exit_start:.3f})/{exit_duration:.3f})'",
        ])
    elif exit_type == "slide-down":
        filters.extend([
            f"pad={width}:{height * 3}:0:{height}:color=black",
            f"crop={width}:{height}:x=0:y='if(lt(t,{exit_start:.3f}),{height},{height}-{height}*(t-{exit_start:.3f})/{exit_duration:.3f})'",
        ])
    return ",".join(filters)


def build_ffmpeg_command(
    scene_paths: list[Path],
    timeline: dict[str, Any],
    output_path: Path,
    output_format: str,
    width: int,
    height: int,
    fps: int,
    quality: str,
) -> tuple[list[str], int]:
    clips = [clip for clip in _poster_clips(timeline) if clip.get("visible", True)]
    if len(clips) != len(scene_paths):
        raise VideoRenderValidationError("Scene input count does not match the timeline.")
    transitions = timeline.get("transitions") if isinstance(timeline.get("transitions"), list) else []
    command = [
        settings.FFMPEG_BINARY,
        "-hide_banner",
        "-y",
    ]
    for scene_path, clip in zip(scene_paths, clips):
        duration_seconds = max(float(clip["durationMs"]) / 1000, 0.5)
        command.extend([
            "-loop", "1",
            "-framerate", str(fps),
            "-t", f"{duration_seconds:.3f}",
            "-i", str(scene_path),
        ])

    filter_parts: list[str] = []
    for index, clip in enumerate(clips):
        filter_parts.append(f"[{index}:v]{_animation_filter(clip, width, height, fps)}[v{index}]")

    chain_label = "v0"
    current_duration = float(clips[0]["durationMs"]) / 1000
    for index in range(1, len(clips)):
        previous = clips[index - 1]
        current = clips[index]
        transition = next((
            item for item in transitions
            if item.get("fromClipId") == previous.get("id") and item.get("toClipId") == current.get("id")
        ), None)
        transition_type = transition.get("type", "none") if transition else "none"
        requested_duration = float(transition.get("durationMs") or 0) / 1000 if transition else 0
        maximum_duration = min(float(previous["durationMs"]), float(current["durationMs"])) / 2000
        transition_duration = min(max(requested_duration, 0.001), maximum_duration)
        offset = max(current_duration - transition_duration, 0)
        output_label = f"x{index}"
        filter_parts.append(
            f"[{chain_label}][v{index}]xfade=transition={TRANSITION_FILTERS.get(transition_type, 'fade')}:"
            f"duration={transition_duration:.3f}:offset={offset:.3f}[{output_label}]"
        )
        current_duration += (float(current["durationMs"]) / 1000) - transition_duration
        chain_label = output_label

    command.extend(["-filter_complex", ";".join(filter_parts), "-map", f"[{chain_label}]"])
    codec, _, _ = FORMAT_CODECS[output_format]
    quality_settings = QUALITY_SETTINGS[quality]
    command.extend(["-c:v", codec, "-crf", quality_settings["crf"]])
    if output_format == "mp4":
        command.extend([
            "-preset", quality_settings["preset"],
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ])
    else:
        command.extend(["-pix_fmt", "yuv420p", "-b:v", "0", "-row-mt", "1", "-deadline", "good"])
    command.extend([
        "-r", str(fps),
        "-progress", "pipe:1",
        "-nostats",
        str(output_path),
    ])
    return command, int(current_duration * 1000)


def _update_job(job_id: str, **values: Any) -> bool:
    db = SessionLocal()
    try:
        job = db.query(VideoRenderJob).filter(VideoRenderJob.id == job_id).first()
        if not job:
            return False
        for key, value in values.items():
            setattr(job, key, value)
        job.updated_at = datetime.utcnow()
        db.commit()
        return bool(job.cancel_requested)
    finally:
        db.close()


def request_cancel(job_id: str) -> None:
    _update_job(job_id, cancel_requested=True, stage="Cancelling render")
    with PROCESS_LOCK:
        process = ACTIVE_PROCESSES.get(job_id)
    if process and process.poll() is None:
        process.terminate()


def cleanup_expired_render_files() -> None:
    cutoff = datetime.utcnow() - timedelta(hours=max(settings.VIDEO_RENDER_RETENTION_HOURS, 1))
    db = SessionLocal()
    try:
        expired_jobs = db.query(VideoRenderJob).filter(
            VideoRenderJob.completed_at.isnot(None),
            VideoRenderJob.completed_at < cutoff,
        ).all()
        for job in expired_jobs:
            if job.output_path:
                output_path = Path(job.output_path)
                if output_path.is_file() and RENDER_ROOT in output_path.parents:
                    shutil.rmtree(output_path.parent, ignore_errors=True)
                job.output_path = None
                job.stage = "Expired"
        db.commit()
    finally:
        db.close()


def safe_project_filename(project_name: str, extension: str) -> str:
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", project_name).strip("_")[:80] or "Project"
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M")
    return f"TECKSTUDIO_{safe_name}_{timestamp}{extension}"


def render_video_job(
    job_id: str,
    scene_paths: list[Path],
    project_name: str,
) -> None:
    db = SessionLocal()
    try:
        job = db.query(VideoRenderJob).filter(VideoRenderJob.id == job_id).first()
        if not job:
            return
        if job.cancel_requested:
            job.status = "cancelled"
            job.progress = 0
            job.stage = "Render cancelled"
            job.completed_at = datetime.utcnow()
            db.commit()
            return
        timeline = job.timeline_json
        output_format = job.format
        job_directory = RENDER_ROOT / job.id
        _, mime_type, extension = FORMAT_CODECS[output_format]
        output_path = job_directory / safe_project_filename(project_name, extension)
        command, duration_ms = build_ffmpeg_command(
            scene_paths,
            timeline,
            output_path,
            output_format,
            job.width,
            job.height,
            job.fps,
            job.quality,
        )
        job.status = "processing"
        job.progress = 12
        job.stage = f"Rendering {len(scene_paths)} poster scenes"
        db.commit()
    except Exception as error:
        db.close()
        _update_job(
            job_id,
            status="failed",
            progress=0,
            stage="Render setup failed",
            error_message=str(error)[:500],
            completed_at=datetime.utcnow(),
        )
        return
    finally:
        db.close()

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        with PROCESS_LOCK:
            ACTIVE_PROCESSES[job_id] = process
        started = time.monotonic()
        last_update = 0.0
        process_output: list[str] = []
        if process.stdout:
            for line in process.stdout:
                process_output.append(line)
                if len(process_output) > 80:
                    process_output.pop(0)
                if time.monotonic() - started > settings.VIDEO_RENDER_TIMEOUT_SECONDS:
                    process.terminate()
                    raise TimeoutError("Video rendering timed out.")
                if line.startswith("out_time_ms="):
                    rendered_ms = int(line.split("=", 1)[1].strip() or 0) // 1000
                    progress = min(15 + int((rendered_ms / max(duration_ms, 1)) * 80), 95)
                    if time.monotonic() - last_update >= 0.5:
                        cancelled = _update_job(
                            job_id,
                            progress=progress,
                            stage=f"Encoding video · {progress}%",
                        )
                        last_update = time.monotonic()
                        if cancelled:
                            process.terminate()
                            break
        return_code = process.wait(timeout=10)
        with PROCESS_LOCK:
            ACTIVE_PROCESSES.pop(job_id, None)
        db = SessionLocal()
        try:
            job = db.query(VideoRenderJob).filter(VideoRenderJob.id == job_id).first()
            if not job:
                return
            if job.cancel_requested:
                job.status = "cancelled"
                job.progress = 0
                job.stage = "Render cancelled"
                job.completed_at = datetime.utcnow()
                db.commit()
                output_path.unlink(missing_ok=True)
                return
            if return_code != 0 or not output_path.is_file():
                ffmpeg_output = "".join(process_output)
                print(f"[TECKSTUDIO] FFmpeg render failed for {job_id}: {ffmpeg_output[-2000:]}")
                raise RuntimeError("FFmpeg could not encode the requested video.")
            job.status = "completed"
            job.progress = 100
            job.stage = "Video ready to download"
            job.output_path = str(output_path)
            job.file_name = output_path.name
            job.mime_type = mime_type
            job.completed_at = datetime.utcnow()
            job.error_message = None
            db.commit()
        finally:
            db.close()
    except Exception as error:
        with PROCESS_LOCK:
            ACTIVE_PROCESSES.pop(job_id, None)
        _update_job(
            job_id,
            status="failed",
            stage="Video encoding failed",
            error_message=str(error)[:500],
            completed_at=datetime.utcnow(),
        )


def start_render_thread(job_id: str, scene_paths: list[Path], project_name: str) -> None:
    thread = threading.Thread(
        target=render_video_job,
        args=(job_id, scene_paths, project_name),
        daemon=True,
        name=f"video-render-{job_id}",
    )
    thread.start()


def build_frame_sequence_command(
    frame_directory: Path,
    output_path: Path,
    output_format: str,
    width: int,
    height: int,
    fps: int,
    quality: str,
    total_frames: int,
    audio_clips: list[dict[str, Any]] | None = None,
) -> tuple[list[str], int]:
    if output_format not in FORMAT_CODECS:
        raise VideoRenderValidationError("Format must be mp4 or webm.")
    if total_frames <= 0:
        raise VideoRenderValidationError("The frame sequence is empty.")
    codec, _, _ = FORMAT_CODECS[output_format]
    quality_settings = QUALITY_SETTINGS[quality]
    command = [
        settings.FFMPEG_BINARY,
        "-hide_banner",
        "-y",
        "-framerate", str(fps),
        "-start_number", "0",
        "-i", str(frame_directory / "frame-%06d.png"),
    ]

    valid_audio_inputs = []
    if audio_clips:
        for idx, clip in enumerate(audio_clips):
            url = clip.get('assetUrl') or clip.get('sourceUrl')
            if url and not clip.get('muted'):
                if str(url).startswith('http://') or str(url).startswith('https://') or Path(url).exists():
                    valid_audio_inputs.append((idx, url, clip))

    for _, url, _ in valid_audio_inputs:
        command.extend(["-i", str(url)])

    command.extend([
        "-frames:v", str(total_frames),
    ])

    vf_string = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
        "setsar=1,format=yuv420p"
    )
    command.extend(["-vf", vf_string, "-c:v", codec, "-crf", quality_settings["crf"]])

    if valid_audio_inputs:
        filter_parts = []
        mix_inputs = []
        for i, (_, _, clip) in enumerate(valid_audio_inputs, start=1):
            start_ms = int(clip.get('startTimeMs', clip.get('startTime', 0)))
            volume = float(clip.get('volume', 1.0))
            label = f"a{i}"
            filter_parts.append(f"[{i}:a]adelay={start_ms}|{start_ms},volume={volume:.2f}[{label}]")
            mix_inputs.append(f"[{label}]")

        if len(mix_inputs) > 1:
            mix_str = f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=first[outa]"
            filter_parts.append(mix_str)
            command.extend(["-filter_complex", ";".join(filter_parts), "-map", "0:v", "-map", "[outa]"])
        else:
            command.extend(["-filter_complex", ";".join(filter_parts), "-map", "0:v", "-map", f"[{mix_inputs[0][1:-1]}]"])

        audio_codec = "aac" if output_format == "mp4" else "libvorbis"
        command.extend(["-c:a", audio_codec, "-b:a", "192k"])

    if output_format == "mp4":
        command.extend([
            "-preset", quality_settings["preset"],
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ])
    else:
        command.extend([
            "-pix_fmt", "yuv420p",
            "-b:v", "0",
            "-row-mt", "1",
            "-deadline", "good",
        ])
    command.extend([
        "-r", str(fps),
        "-progress", "pipe:1",
        "-nostats",
        str(output_path),
    ])
    return command, round(total_frames * 1000 / fps)


def _ffprobe_binary() -> str:
    configured = Path(settings.FFMPEG_BINARY)
    if configured.is_absolute():
        sibling = configured.with_name("ffprobe")
        if sibling.is_file():
            return str(sibling)
    discovered = shutil.which("ffprobe")
    if not discovered:
        raise RuntimeError("FFprobe is required to verify rendered video output.")
    return discovered


def verify_video_output(
    output_path: Path,
    output_format: str,
    width: int,
    height: int,
    fps: int,
    total_frames: int,
) -> dict[str, Any]:
    command = [
        _ffprobe_binary(),
        "-v", "error",
        "-count_frames",
        "-select_streams", "v:0",
        "-show_entries",
        "stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_read_frames,duration",
        "-of", "json",
        str(output_path),
    ]
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("Rendered video verification failed.")
    try:
        stream = json.loads(completed.stdout)["streams"][0]
    except (KeyError, IndexError, json.JSONDecodeError) as error:
        raise RuntimeError("Rendered video metadata is invalid.") from error
    expected_codec = "h264" if output_format == "mp4" else "vp9"
    if stream.get("codec_name") != expected_codec:
        raise RuntimeError("Rendered video uses an unexpected codec.")
    if int(stream.get("width") or 0) != width or int(stream.get("height") or 0) != height:
        raise RuntimeError("Rendered video dimensions do not match the request.")
    if stream.get("pix_fmt") != "yuv420p":
        raise RuntimeError("Rendered video pixel format is not browser-compatible.")
    numerator, _, denominator = str(stream.get("r_frame_rate") or "0/1").partition("/")
    measured_fps = float(numerator or 0) / max(float(denominator or 1), 1)
    if abs(measured_fps - fps) > 0.01:
        raise RuntimeError("Rendered video frame rate does not match the request.")
    frame_count = int(stream.get("nb_read_frames") or 0)
    if frame_count != total_frames:
        raise RuntimeError("Rendered video frame count is incomplete.")
    return stream


def render_frame_sequence_job(job_id: str, project_name: str) -> None:
    db = SessionLocal()
    try:
        job = db.query(VideoRenderJob).filter(VideoRenderJob.id == job_id).first()
        if not job:
            return
        if job.cancel_requested:
            job.status = "cancelled"
            job.progress = 0
            job.stage = "Render cancelled"
            job.completed_at = datetime.utcnow()
            db.commit()
            return
        job_directory = RENDER_ROOT / job.id
        _, mime_type, extension = FORMAT_CODECS[job.format]
        output_path = job_directory / safe_project_filename(project_name, extension)
        audio_clips = []
        if job.timeline_json:
            try:
                parsed_tl = json.loads(job.timeline_json)
                audio_clips = parsed_tl.get("audioClips") or []
                if not audio_clips and parsed_tl.get("audio"):
                    audio_clips = [parsed_tl.get("audio")]
            except Exception:
                pass

        command, duration_ms = build_frame_sequence_command(
            job_directory,
            output_path,
            job.format,
            job.width,
            job.height,
            job.fps,
            job.quality,
            job.total_frames,
            audio_clips,
        )
        job.status = "processing"
        job.progress = 72
        job.stage = "Encoding deterministic animation frames"
        db.commit()
    except Exception as error:
        db.close()
        _update_job(
            job_id,
            status="failed",
            stage="Render setup failed",
            error_message=str(error)[:500],
            completed_at=datetime.utcnow(),
        )
        return
    finally:
        db.close()

    process_output: list[str] = []
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        with PROCESS_LOCK:
            ACTIVE_PROCESSES[job_id] = process
        started = time.monotonic()
        last_update = 0.0
        if process.stdout:
            for line in process.stdout:
                process_output.append(line)
                if len(process_output) > 80:
                    process_output.pop(0)
                if time.monotonic() - started > settings.VIDEO_RENDER_TIMEOUT_SECONDS:
                    process.terminate()
                    raise TimeoutError("Video rendering timed out.")
                if line.startswith("out_time_ms="):
                    encoded_ms = int(line.split("=", 1)[1].strip() or 0) // 1000
                    progress = min(72 + int((encoded_ms / max(duration_ms, 1)) * 24), 96)
                    if time.monotonic() - last_update >= 0.5:
                        cancelled = _update_job(
                            job_id,
                            progress=progress,
                            stage=f"Encoding video · {progress}%",
                        )
                        last_update = time.monotonic()
                        if cancelled:
                            process.terminate()
                            break
        return_code = process.wait(timeout=10)
        with PROCESS_LOCK:
            ACTIVE_PROCESSES.pop(job_id, None)
        db = SessionLocal()
        try:
            job = db.query(VideoRenderJob).filter(VideoRenderJob.id == job_id).first()
            if not job:
                return
            if job.cancel_requested:
                job.status = "cancelled"
                job.progress = 0
                job.stage = "Render cancelled"
                job.completed_at = datetime.utcnow()
                db.commit()
                output_path.unlink(missing_ok=True)
                return
            if return_code != 0 or not output_path.is_file():
                print(f"[TECKSTUDIO] FFmpeg frame render failed for {job_id}: {''.join(process_output)[-2000:]}")
                raise RuntimeError("FFmpeg could not encode the animation frames.")
            job.progress = 98
            job.stage = "Verifying video output"
            db.commit()
            verify_video_output(
                output_path,
                job.format,
                job.width,
                job.height,
                job.fps,
                job.total_frames,
            )
            job.status = "completed"
            job.progress = 100
            job.stage = "Video ready to download"
            job.output_path = str(output_path)
            job.file_name = output_path.name
            job.mime_type = mime_type
            job.completed_at = datetime.utcnow()
            job.error_message = None
            db.commit()
            for frame_path in job_directory.glob("frame-*.png"):
                frame_path.unlink(missing_ok=True)
        finally:
            db.close()
    except Exception as error:
        with PROCESS_LOCK:
            ACTIVE_PROCESSES.pop(job_id, None)
        _update_job(
            job_id,
            status="failed",
            stage="Video encoding failed",
            error_message=str(error)[:500],
            completed_at=datetime.utcnow(),
        )


def start_frame_render_thread(job_id: str, project_name: str) -> None:
    thread = threading.Thread(
        target=render_frame_sequence_job,
        args=(job_id, project_name),
        daemon=True,
        name=f"video-frame-render-{job_id}",
    )
    thread.start()


def parse_timeline_json(value: str) -> dict[str, Any]:
    try:
        timeline = json.loads(value)
    except json.JSONDecodeError as error:
        raise VideoRenderValidationError("Timeline JSON is invalid.") from error
    if not isinstance(timeline, dict):
        raise VideoRenderValidationError("Timeline JSON must be an object.")
    return timeline
