import tempfile
import unittest
from pathlib import Path

from services.video_render_service import (
    VideoRenderValidationError,
    build_ffmpeg_command,
    build_frame_sequence_command,
    cleanup_render_inputs,
    validate_render_request,
)


def timeline(scene_count: int = 2):
    clips = [
        {
            "id": f"clip-{index}",
            "pageId": f"page-{index}",
            "durationMs": 3000,
            "visible": True,
            "animation": {
                "enter": {"type": "fade", "durationMs": 500},
                "hold": {"type": "zoom-in", "durationMs": 0},
                "exit": {"type": "slide-left", "durationMs": 500},
            },
        }
        for index in range(scene_count)
    ]
    return {
        "durationMs": scene_count * 3000 - max(scene_count - 1, 0) * 500,
        "tracks": [{"id": "poster-track", "type": "poster", "clips": clips}],
        "transitions": [
            {
                "id": f"transition-{index}",
                "fromClipId": clips[index]["id"],
                "toClipId": clips[index + 1]["id"],
                "type": "crossfade",
                "durationMs": 500,
            }
            for index in range(max(scene_count - 1, 0))
        ],
    }


class VideoRenderServiceTests(unittest.TestCase):
    def test_validate_request_accepts_supported_settings(self):
        clips, duration_ms = validate_render_request(
            timeline(),
            scene_count=2,
            output_format="mp4",
            width=1080,
            height=1350,
            fps=30,
            quality="high",
        )
        self.assertEqual(len(clips), 2)
        self.assertEqual(duration_ms, 5500)

    def test_validate_request_rejects_scene_mismatch(self):
        with self.assertRaises(VideoRenderValidationError):
            validate_render_request(
                timeline(),
                scene_count=1,
                output_format="mp4",
                width=1080,
                height=1350,
                fps=30,
                quality="high",
            )

    def test_validate_request_rejects_invalid_format_fps_and_resolution(self):
        invalid_settings = [
            {"output_format": "mov", "width": 1080, "height": 1350, "fps": 30},
            {"output_format": "mp4", "width": 1080, "height": 1350, "fps": 25},
            {"output_format": "mp4", "width": 239, "height": 1350, "fps": 30},
            {"output_format": "mp4", "width": 1081, "height": 1350, "fps": 30},
        ]
        for values in invalid_settings:
            with self.subTest(values=values), self.assertRaises(VideoRenderValidationError):
                validate_render_request(
                    timeline(),
                    scene_count=2,
                    quality="high",
                    **values,
                )

    def test_validate_request_rejects_empty_timeline(self):
        with self.assertRaises(VideoRenderValidationError):
            validate_render_request(
                {"durationMs": 0, "tracks": [{"type": "poster", "clips": []}]},
                scene_count=0,
                output_format="mp4",
                width=1080,
                height=1350,
                fps=30,
                quality="high",
            )

    def test_mp4_command_uses_browser_compatible_h264(self):
        command, duration_ms = build_ffmpeg_command(
            [Path("/tmp/scene-1.png"), Path("/tmp/scene-2.png")],
            timeline(),
            Path("/tmp/output.mp4"),
            "mp4",
            1080,
            1350,
            30,
            "high",
        )
        self.assertIn("libx264", command)
        self.assertIn("yuv420p", command)
        self.assertIn("+faststart", command)
        self.assertIn("xfade=transition=fade", " ".join(command))
        self.assertEqual(duration_ms, 5500)

    def test_webm_command_uses_vp9(self):
        command, _ = build_ffmpeg_command(
            [Path("/tmp/scene-1.png"), Path("/tmp/scene-2.png")],
            timeline(),
            Path("/tmp/output.webm"),
            "webm",
            1080,
            1350,
            30,
            "standard",
        )
        self.assertIn("libvpx-vp9", command)
        self.assertIn("yuv420p", command)
        self.assertIn("-row-mt", command)

    def test_frame_sequence_command_encodes_every_numbered_frame(self):
        command, duration_ms = build_frame_sequence_command(
            Path("/tmp/render-frames"),
            Path("/tmp/output.mp4"),
            "mp4",
            1080,
            1350,
            30,
            "high",
            360,
        )
        command_text = " ".join(command)
        self.assertIn("frame-%06d.png", command_text)
        self.assertIn("-frames:v 360", command_text)
        self.assertNotIn("-loop 1", command_text)
        self.assertIn("libx264", command)
        self.assertIn("yuv420p", command)
        self.assertEqual(duration_ms, 12000)

    def test_cleanup_render_inputs_removes_frames_but_keeps_output(self):
        with tempfile.TemporaryDirectory() as temporary_root:
            job_directory = Path(temporary_root) / "video_job"
            job_directory.mkdir()
            output_path = job_directory / "final.mp4"
            output_path.write_bytes(b"video")
            (job_directory / "frame-000000.png").write_bytes(b"frame")
            (job_directory / "scene-001.png").write_bytes(b"scene")
            (job_directory / "audio-000-input.mp3").write_bytes(b"audio")

            from services import video_render_service
            original_root = video_render_service.RENDER_ROOT
            video_render_service.RENDER_ROOT = Path(temporary_root)
            try:
                cleanup_render_inputs(job_directory, output_path)
            finally:
                video_render_service.RENDER_ROOT = original_root

            self.assertTrue(output_path.exists())
            self.assertFalse((job_directory / "frame-000000.png").exists())
            self.assertFalse((job_directory / "scene-001.png").exists())
            self.assertFalse((job_directory / "audio-000-input.mp3").exists())

    def test_frame_sequence_command_rejects_empty_sequence(self):
        with self.assertRaises(VideoRenderValidationError):
            build_frame_sequence_command(
                Path("/tmp/render-frames"),
                Path("/tmp/output.mp4"),
                "mp4",
                1080,
                1350,
                30,
                "high",
                0,
            )


if __name__ == "__main__":
    unittest.main()
