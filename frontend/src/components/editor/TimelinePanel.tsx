import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clapperboard,
  Copy,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Pause,
  Play,
  Plus,
  Repeat2,
  Sparkles,
  Trash2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/useEditorStore';
import {
  DEFAULT_SCENE_ANIMATION,
  getPosterTrack,
} from '../../types/timeline';
import type {
  AnimationPreset,
  FabricObjectAnimation,
  FabricObjectAnimationConfig,
  SceneAnimationConfig,
  SceneAnimationType,
  TimelineClip,
  TimelineTransitionType,
} from '../../types/timeline';
import { masterTimelineManager } from '../../utils/masterTimelineManager';
import { AddPosterMenu } from './timeline/AddPosterMenu';
import { MultiTrackAudioPanel } from './timeline/MultiTrackAudioPanel';
import { VoiceRecorderModal } from './timeline/VoiceRecorderModal';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ANIMATIONS: Array<{ value: SceneAnimationType; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'slide-right', label: 'Slide Right' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-down', label: 'Slide Down' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' },
  { value: 'pan-left', label: 'Pan Left' },
  { value: 'pan-right', label: 'Pan Right' },
  { value: 'pop', label: 'Pop' },
  { value: 'rotate', label: 'Rotate' },
  { value: 'pulse', label: 'Pulse' },
];

const TRANSITIONS: Array<{ value: TimelineTransitionType; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'slide-right', label: 'Slide Right' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-down', label: 'Slide Down' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'wipe-left', label: 'Wipe Left' },
  { value: 'wipe-right', label: 'Wipe Right' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const formatTime = (timeMs: number, fps: number) => {
  const totalSeconds = Math.max(timeMs, 0) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);
  return `${minutes}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
};

const OBJECT_TYPE_COLORS: Record<string, string> = {
  text: 'bg-violet-500/20 border-violet-500/40 text-violet-200',
  image: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200',
  shape: 'bg-amber-500/20 border-amber-500/40 text-amber-200',
  diagram: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200',
  element: 'bg-rose-500/20 border-rose-500/40 text-rose-200',
};

// ─────────────────────────────────────────────────────────────────────────────
// Object Animation Track Row
// ─────────────────────────────────────────────────────────────────────────────

interface ObjectTrackEntry {
  id: string;
  objectId: string;
  label: string;
  objectType: string;
  animationType: string;
  startMs: number;
  durationMs: number;
}

function getObjectAnimationTracks(clip: TimelineClip | null, canvas: fabric.Canvas | null): ObjectTrackEntry[] {
  if (!clip) return [];

  if (!canvas) return [];
  const tracks: ObjectTrackEntry[] = [];
  canvas.getObjects().forEach((obj: fabric.Object) => {
    const record = obj as unknown as Record<string, unknown>;
    const id = String(record.id || '');
    if (!id) return;
    const name = String(record.name || record.type || 'Object');
    const type = String(record.type || 'shape');
    const objType = type.includes('text') ? 'text'
      : type.includes('image') ? 'image'
      : type.includes('diagram') || type.includes('connector') ? 'diagram'
      : 'shape';

    const animConfigs = record.objectAnimations as FabricObjectAnimation[] | undefined;
    const legacyConfig = record.animationConfig as FabricObjectAnimationConfig | undefined;

    const animations = animConfigs?.length ? animConfigs : (legacyConfig ? [legacyConfig] : []);
    animations.forEach((anim, animIdx) => {
      const animType = String((anim as FabricObjectAnimation).type || (anim as FabricObjectAnimationConfig).animationType || 'none');
      if (animType === 'none') return;
      const startMs = Number((anim as FabricObjectAnimation).startMs || (anim as FabricObjectAnimationConfig).startMs || 0);
      const durationMs = Math.max(
        Number((anim as FabricObjectAnimation).durationMs || (anim as FabricObjectAnimationConfig).durationMs || (anim as FabricObjectAnimationConfig).duration || 1000),
        200
      );
      tracks.push({
        id: `${id}-anim-${animIdx}`,
        objectId: id,
        label: name.length > 18 ? `${name.slice(0, 16)}…` : name,
        objectType: objType,
        animationType: animType.replace(/-/g, ' '),
        startMs: clip.startMs + startMs,
        durationMs,
      });
    });
  });
  return tracks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const TimelinePanel: React.FC = () => {
  const store = useEditorStore();
  const timeline = store.timelineProject;
  const clips = getPosterTrack(timeline).clips;
  const selectedClip = clips.find((clip) => clip.id === store.selectedTimelineClipId) || null;
  const trackScrollRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [isVoiceRecorderOpen, setIsVoiceRecorderOpen] = useState(false);
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const [transitionPair, setTransitionPair] = useState<{ fromId: string; toId: string } | null>(null);
  const [draftDuration, setDraftDuration] = useState<{ clipId: string; durationMs: number } | null>(null);
  const pixelsPerSecond = 84 * timeline.zoom;
  const trackWidth = Math.max((timeline.durationMs / 1000) * pixelsPerSecond + 240, 900);

  // Auto-scroll playhead into view during playback
  useEffect(() => {
    if (store.timelinePlaybackState !== 'playing' || !trackScrollRef.current) return;
    const playheadX = (timeline.currentTimeMs / 1000) * pixelsPerSecond;
    const viewport = trackScrollRef.current;
    if (playheadX > viewport.scrollLeft + viewport.clientWidth - 100) {
      viewport.scrollLeft = Math.max(playheadX - viewport.clientWidth + 100, 0);
    }
  }, [pixelsPerSecond, store.timelinePlaybackState, timeline.currentTimeMs]);

  const objectTracks = useMemo(
    () => getObjectAnimationTracks(selectedClip, (store.canvas as fabric.Canvas | null) ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedClip?.id, store.canvas]
  );

  // ── Playback ──────────────────────────────────────────────────────────────

  const play = async () => {
    setError('');
    try {
      store.syncActivePage();
      await masterTimelineManager.play();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Preview could not start.');
    }
  };

  // ── Resize handles ────────────────────────────────────────────────────────

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = timeline.height;
    const move = (moveEvent: PointerEvent) => store.setTimelineHeight(startHeight + (startY - moveEvent.clientY));
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      store.saveHistory();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  const startClipResize = (event: React.PointerEvent, clipId: string, durationMs: number) => {
    event.stopPropagation();
    const startX = event.clientX;
    let nextDuration = durationMs;
    const move = (moveEvent: PointerEvent) => {
      nextDuration = Math.max(500, durationMs + ((moveEvent.clientX - startX) / pixelsPerSecond) * 1000);
      setDraftDuration({ clipId, durationMs: nextDuration });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      setDraftDuration(null);
      store.setTimelineClipDuration(clipId, nextDuration);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  // ── Animation update ──────────────────────────────────────────────────────

  const updateAnimation = (
    section: keyof SceneAnimationConfig,
    key: keyof AnimationPreset,
    value: string | number,
  ) => {
    if (!selectedClip) return;
    const animation = selectedClip.animation || DEFAULT_SCENE_ANIMATION;
    const current = animation[section] || DEFAULT_SCENE_ANIMATION[section];
    if (!current) return;
    store.setTimelineClipAnimation(selectedClip.id, {
      ...animation,
      [section]: { ...current, [key]: value },
    });
  };

  // ── Playhead drag ─────────────────────────────────────────────────────────

  const seekFromRuler = (clientX: number, ruler: HTMLDivElement) => {
    const bounds = ruler.getBoundingClientRect();
    const scrollLeft = trackScrollRef.current?.scrollLeft || 0;
    const x = clientX - bounds.left + scrollLeft;
    masterTimelineManager.seekMs((x / pixelsPerSecond) * 1000);
  };

  const startPlayheadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const ruler = event.currentTarget;
    seekFromRuler(event.clientX, ruler);
    const move = (moveEvent: PointerEvent) => seekFromRuler(moveEvent.clientX, ruler);
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  // ── Fit timeline ──────────────────────────────────────────────────────────

  const fitTimeline = () => {
    const viewportWidth = trackScrollRef.current?.clientWidth || 900;
    const durationSeconds = Math.max(timeline.durationMs / 1000, 1);
    store.setTimelineZoom((viewportWidth - 80) / (84 * durationSeconds));
    if (trackScrollRef.current) trackScrollRef.current.scrollLeft = 0;
  };

  // ── Transition ────────────────────────────────────────────────────────────

  const activeTransition = transitionPair
    ? timeline.transitions.find((t) =>
        t.fromClipId === transitionPair.fromId && t.toClipId === transitionPair.toId
      )
    : null;

  // ── Ruler ticks ───────────────────────────────────────────────────────────

  const rulerTicks = useMemo(() => {
    const count = Math.ceil(timeline.durationMs / 500) + 2;
    return Array.from({ length: count }, (_, index) => index * 500);
  }, [timeline.durationMs]);

  // ─────────────────────────────────────────────────────────────────────────
  // Collapsed state
  // ─────────────────────────────────────────────────────────────────────────

  if (timeline.collapsed) {
    return (
      <div className="relative z-10 flex h-10 shrink-0 items-center gap-2 border-t border-zinc-800 bg-[#0d0d13] px-3">
        <button
          type="button"
          onClick={() => store.setTimelineCollapsed(false)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          title="Expand timeline"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <Clapperboard className="h-3.5 w-3.5 text-violet-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Timeline</span>
        <span className="text-[9px] text-zinc-600">
          {clips.length} scenes · {formatTime(timeline.durationMs, timeline.fps)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('teckstudio:open-video-export', { detail: { format: 'mp4' } }))}
          className="flex items-center gap-1 rounded-lg bg-violet-600 px-2 py-1 text-[9px] font-bold text-white hover:bg-violet-500"
        >
          <Download className="h-3 w-3" />
          Export
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Full timeline
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <section
      className="relative z-10 flex shrink-0 flex-col overflow-hidden border-t border-zinc-800 bg-[#0d0d13] text-zinc-200"
      style={{ height: timeline.height, minHeight: 160, maxHeight: '45vh' }}
      aria-label="Video timeline"
    >
      {/* Resize handle */}
      <div
        onPointerDown={startResize}
        className="absolute inset-x-0 top-0 z-20 h-1 cursor-row-resize bg-violet-500/20 transition-colors hover:bg-violet-500/60"
        title="Resize timeline"
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-zinc-800 px-2 pt-1">
        <button
          type="button"
          onClick={() => store.setTimelineCollapsed(true)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          title="Collapse timeline"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <Clapperboard className="h-3.5 w-3.5 text-violet-400" />
        <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">Timeline</span>

        {/* Transport controls */}
        <button
          type="button"
          onClick={() => masterTimelineManager.seekMs(0)}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800"
          title="Go to beginning"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            const frameMs = 1000 / timeline.fps;
            masterTimelineManager.seekMs(Math.max(0, timeline.currentTimeMs - frameMs));
          }}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800"
          title="Previous frame"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            store.timelinePlaybackState === 'playing'
              ? masterTimelineManager.pause()
              : void play()
          }
          className="rounded-lg bg-violet-600 p-1.5 text-white shadow-md hover:bg-violet-500"
          title={store.timelinePlaybackState === 'playing' ? 'Pause' : 'Play'}
        >
          {store.timelinePlaybackState === 'playing' ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            const frameMs = 1000 / timeline.fps;
            masterTimelineManager.seekMs(Math.min(timeline.durationMs, timeline.currentTimeMs + frameMs));
          }}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800"
          title="Next frame"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => masterTimelineManager.stop()}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800"
          title="Stop"
        >
          <CircleStop className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => masterTimelineManager.seekMs(timeline.durationMs)}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800"
          title="Go to end"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>

        {/* Time display */}
        <span className="w-24 text-center font-mono text-[9px] tabular-nums text-violet-300">
          {formatTime(timeline.currentTimeMs, timeline.fps)}
        </span>
        <span className="text-[9px] text-zinc-700">/</span>
        <span className="w-24 font-mono text-[9px] tabular-nums text-zinc-500">
          {formatTime(timeline.durationMs, timeline.fps)}
        </span>

        {/* FPS */}
        <select
          value={timeline.fps}
          onChange={(e) => store.setTimelineFps(Number(e.target.value) as 24 | 30 | 60)}
          className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[9px]"
          title="Frame rate"
        >
          <option value={24}>24 FPS</option>
          <option value={30}>30 FPS</option>
          <option value={60}>60 FPS</option>
        </select>

        {/* Zoom controls */}
        <button
          type="button"
          onClick={() => store.setTimelineZoom(timeline.zoom / 1.25)}
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800"
          title="Zoom timeline out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.05}
          value={timeline.zoom}
          onChange={(e) => store.setTimelineZoom(Number(e.target.value))}
          className="h-1 w-20 accent-violet-500"
          title="Timeline zoom"
        />
        <button
          type="button"
          onClick={() => store.setTimelineZoom(timeline.zoom * 1.25)}
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800"
          title="Zoom timeline in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <span className="w-8 text-center text-[8px] text-zinc-600">
          {Math.round(timeline.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={fitTimeline}
          className="rounded border border-zinc-800 px-2 py-1 text-[9px] text-zinc-400 hover:bg-zinc-800"
          title="Fit timeline"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={() => store.setTimelineLoopPreview(!timeline.loopPreview)}
          className={`rounded p-1.5 ${
            timeline.loopPreview ? 'bg-violet-500/15 text-violet-300' : 'text-zinc-500 hover:bg-zinc-800'
          }`}
          title="Loop preview"
        >
          <Repeat2 className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1" />

        {/* Add current page */}
        <button
          type="button"
          onClick={() => store.addPageToTimeline(store.activePageId)}
          className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-[9px] font-bold text-cyan-300 hover:bg-cyan-500/20"
        >
          <Plus className="h-3 w-3" />
          Add Current Page
        </button>

        {/* Export video */}
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('teckstudio:open-video-export', { detail: { format: 'mp4' } })
            )
          }
          className="flex items-center gap-1 rounded-lg bg-violet-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-violet-500"
        >
          <Download className="h-3 w-3" />
          Export Video
        </button>
      </header>

      {/* Error banner */}
      {error && (
        <div className="absolute right-3 top-12 z-30 rounded-lg border border-rose-500/30 bg-rose-950/95 px-3 py-1.5 text-[9px] text-rose-200">
          {error}
        </div>
      )}

      {/* ── Track area ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Left label column */}
        <aside className="flex w-32 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/40">
          {/* Object animation track labels */}
          {objectTracks.map((track) => (
            <div
              key={track.id}
              className="flex h-7 items-center gap-1.5 border-b border-zinc-800/50 px-2"
            >
              <div className={`h-2 w-2 shrink-0 rounded-full ${OBJECT_TYPE_COLORS[track.objectType]?.split(' ')[0].replace('/20', '/80') || 'bg-zinc-500'}`} />
              <span className="truncate text-[8px] text-zinc-400">{track.label}</span>
            </div>
          ))}

          {/* Poster track label */}
          <div className="flex h-16 items-center gap-2 border-b border-zinc-800 px-2">
            <Clapperboard className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <div>
              <div className="text-[9px] font-bold text-zinc-200">Poster scenes</div>
              <div className="text-[8px] text-zinc-600">{clips.length} clips</div>
            </div>
          </div>

          {/* Audio label */}
          <div className="h-9 border-t border-zinc-800/60" />
        </aside>

        {/* Scrollable track area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            ref={trackScrollRef}
            className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
          >
            <div style={{ width: trackWidth }} className="relative flex min-h-full flex-col">

              {/* Ruler */}
              <div
                className="relative h-7 shrink-0 cursor-pointer border-b border-zinc-800 bg-zinc-950/50"
                onPointerDown={startPlayheadDrag}
              >
                {rulerTicks.map((tickMs) => {
                  const isSecond = tickMs % 1000 === 0;
                  return (
                    <div
                      key={tickMs}
                      className="absolute bottom-0 top-0"
                      style={{ left: (tickMs / 1000) * pixelsPerSecond }}
                    >
                      <div
                        className={`absolute bottom-0 border-l ${isSecond ? 'border-zinc-600 h-3' : 'border-zinc-800 h-1.5'}`}
                      />
                      {isSecond && (
                        <span className="absolute left-1 top-0.5 font-mono text-[8px] text-zinc-500">
                          {tickMs / 1000}s
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Object animation tracks */}
              {objectTracks.map((track) => (
                <div
                  key={track.id}
                  className="relative h-7 shrink-0 border-b border-zinc-800/50 bg-zinc-950/10"
                >
                  <div
                    className={`absolute top-1 flex h-5 items-center overflow-hidden rounded border px-1.5 ${OBJECT_TYPE_COLORS[track.objectType] || 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
                    style={{
                      left: Math.max((track.startMs / 1000) * pixelsPerSecond, 0),
                      width: Math.max((track.durationMs / 1000) * pixelsPerSecond, 40),
                    }}
                    title={`${track.label} — ${track.animationType}`}
                  >
                    <span className="truncate text-[8px] font-medium">
                      {track.animationType}
                    </span>
                  </div>
                </div>
              ))}

              {/* Poster clip track */}
              <div className="relative h-16 shrink-0 border-b border-zinc-800/80 bg-zinc-950/20">
                {clips.length === 0 && (
                  <button
                    type="button"
                    onClick={() => store.addPageToTimeline(store.activePageId)}
                    className="absolute left-4 top-3 flex items-center gap-2 rounded-lg border border-dashed border-violet-500/40 px-4 py-2 text-[9px] font-bold text-violet-300 hover:bg-violet-500/10"
                  >
                    <Plus className="h-3 w-3" />
                    Add the current poster page as your first scene
                  </button>
                )}

                {clips.map((clip, index) => {
                  const displayDuration =
                    draftDuration?.clipId === clip.id
                      ? draftDuration.durationMs
                      : clip.durationMs;
                  const width = Math.max((displayDuration / 1000) * pixelsPerSecond, 50);
                  const transition = timeline.transitions.find(
                    (t) => t.fromClipId === clip.id && t.toClipId === clips[index + 1]?.id
                  );

                  return (
                    <React.Fragment key={clip.id}>
                      {/* Clip block */}
                      <div
                        draggable={!clip.locked}
                        onDragStart={() => setDraggedClipId(clip.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedClipId) store.reorderTimelineClip(draggedClipId, clip.id);
                          setDraggedClipId(null);
                        }}
                        onClick={() => {
                          store.setSelectedTimelineClipId(clip.id);
                          masterTimelineManager.seekMs(clip.startMs);
                          void store.switchPage(clip.pageId);
                        }}
                        className={`group absolute top-2 h-12 overflow-hidden rounded-lg border shadow-sm transition-shadow ${
                          store.selectedTimelineClipId === clip.id
                            ? 'border-violet-400 bg-violet-500/20 shadow-violet-500/20'
                            : 'border-cyan-500/30 bg-cyan-950/50 hover:border-cyan-400/60'
                        } ${clip.visible ? '' : 'opacity-45'}`}
                        style={{ left: (clip.startMs / 1000) * pixelsPerSecond, width }}
                      >
                        <div className="flex h-full items-center">
                          <div className="flex h-full w-4 shrink-0 cursor-grab items-center justify-center bg-black/20 text-zinc-600">
                            <GripVertical className="h-3 w-3" />
                          </div>
                          {clip.thumbnailUrl && (
                            <img
                              src={clip.thumbnailUrl}
                              alt=""
                              className="h-full w-10 shrink-0 object-cover"
                            />
                          )}
                          <div className="min-w-0 flex-1 px-1.5">
                            <div className="truncate text-[9px] font-bold text-zinc-200">
                              {clip.name}
                            </div>
                            <div className="flex items-center gap-1 text-[8px] text-zinc-500">
                              <span>{(displayDuration / 1000).toFixed(1)}s</span>
                              {clip.animation?.enter?.type !== 'none' && (
                                <Sparkles className="h-2.5 w-2.5 text-violet-400" />
                              )}
                              {clip.locked && <Lock className="h-2.5 w-2.5 text-amber-400" />}
                              {transition && (
                                <span className="rounded bg-amber-500/20 px-0.5 text-[7px] text-amber-300">
                                  ⇄
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Resize handle */}
                          <div
                            onPointerDown={(e) => startClipResize(e, clip.id, clip.durationMs)}
                            className="h-full w-2 cursor-ew-resize border-l border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/30"
                            title="Drag to change duration"
                          />
                        </div>
                      </div>

                      {/* "+" insert button between clips */}
                      {index < clips.length - 1 && (
                        <AddPosterMenu
                          afterClipId={clip.id}
                          style={{
                            position: 'absolute',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            left:
                              ((clip.startMs + clip.durationMs) / 1000) * pixelsPerSecond - 5,
                            zIndex: 15,
                          }}
                        />
                      )}

                      {/* Transition button between adjacent clips */}
                      {index < clips.length - 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setTransitionPair({ fromId: clip.id, toId: clips[index + 1].id })
                          }
                          className={`absolute top-[21px] z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border text-[8px] ${
                            transition
                              ? 'border-amber-400 bg-amber-500 text-black'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                          }`}
                          style={{
                            left:
                              ((clip.startMs + clip.durationMs) / 1000) * pixelsPerSecond + 16,
                          }}
                          title="Edit transition"
                        >
                          <Repeat2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* "+" Add after last clip */}
                {clips.length > 0 && (
                  <AddPosterMenu
                    afterClipId={clips[clips.length - 1]?.id || null}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      left:
                        (timeline.durationMs / 1000) * pixelsPerSecond + 8,
                      zIndex: 15,
                    }}
                  />
                )}
              </div>

              {/* Multi-Track Audio Panel */}
              <MultiTrackAudioPanel
                pixelsPerSecond={pixelsPerSecond}
                onOpenVoiceRecorder={() => setIsVoiceRecorderOpen(true)}
              />

              {/* Playhead */}
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-violet-400 shadow-[0_0_8px_#a78bfa]"
                style={{ left: (timeline.currentTimeMs / 1000) * pixelsPerSecond }}
              >
                <div className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 rounded-sm bg-violet-400" />
              </div>
            </div>
          </div>

          {/* ── Properties bar for selected clip ──────────────────────────── */}
          {selectedClip && (
            <div className="flex h-[68px] shrink-0 items-center gap-2 overflow-x-auto border-t border-zinc-800 bg-zinc-950/70 px-2">
              <div className="min-w-32">
                <div className="truncate text-[9px] font-bold text-zinc-200">{selectedClip.name}</div>
                <select
                  value={selectedClip.pageId}
                  onChange={(e) => store.replaceTimelineClipPage(selectedClip.id, e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-1 py-1 text-[8px]"
                  title="Replace poster page"
                >
                  {store.pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[8px] text-zinc-600">Duration</label>
                <input
                  type="number"
                  min={0.5}
                  max={120}
                  step={0.1}
                  value={(selectedClip.durationMs / 1000).toFixed(1)}
                  onChange={(e) =>
                    store.setTimelineClipDuration(selectedClip.id, Number(e.target.value) * 1000)
                  }
                  className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[9px]"
                />
                <div className="mt-1 flex gap-0.5">
                  {[1, 2, 3, 5, 10].map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => store.setTimelineClipDuration(selectedClip.id, seconds * 1000)}
                      className="rounded bg-zinc-800 px-1 text-[7px] text-zinc-400 hover:bg-zinc-700"
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Scene animations */}
              {(['enter', 'hold', 'exit'] as const).map((section) => {
                const preset =
                  (selectedClip.animation || DEFAULT_SCENE_ANIMATION)[section] ||
                  DEFAULT_SCENE_ANIMATION[section];
                if (!preset) return null;
                return (
                  <div key={section} className="min-w-36">
                    <label className="block text-[8px] capitalize text-zinc-600">{section}</label>
                    <select
                      value={preset.type}
                      onChange={(e) => updateAnimation(section, 'type', e.target.value)}
                      className="w-full rounded border border-zinc-800 bg-zinc-950 px-1 py-1 text-[8px]"
                    >
                      {ANIMATIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 flex gap-1">
                      <input
                        type="number"
                        min={100}
                        max={5000}
                        step={100}
                        value={preset.durationMs}
                        onChange={(e) =>
                          updateAnimation(section, 'durationMs', Number(e.target.value))
                        }
                        className="w-14 rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-[7px]"
                        title={`${section} duration ms`}
                      />
                      <input
                        type="number"
                        min={0}
                        max={5000}
                        step={100}
                        value={preset.delayMs || 0}
                        onChange={(e) =>
                          updateAnimation(section, 'delayMs', Number(e.target.value))
                        }
                        className="w-12 rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-[7px]"
                        title={`${section} delay ms`}
                      />
                      <select
                        value={preset.easing}
                        onChange={(e) => updateAnimation(section, 'easing', e.target.value)}
                        className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-[7px]"
                        title={`${section} easing`}
                      >
                        <option value="linear">Linear</option>
                        <option value="ease-in">Ease in</option>
                        <option value="ease-out">Ease out</option>
                        <option value="ease-in-out">Ease both</option>
                      </select>
                    </div>
                  </div>
                );
              })}

              {/* Clip action buttons */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => store.moveTimelineClip(selectedClip.id, 'left')}
                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800"
                  title="Move left"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => store.moveTimelineClip(selectedClip.id, 'right')}
                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800"
                  title="Move right"
                >
                  <ArrowRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => store.duplicateTimelineClip(selectedClip.id)}
                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800"
                  title="Duplicate clip"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    store.setTimelineClipLocked(selectedClip.id, !selectedClip.locked)
                  }
                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800"
                  title={selectedClip.locked ? 'Unlock clip' : 'Lock clip'}
                >
                  {selectedClip.locked ? (
                    <Unlock className="h-3 w-3" />
                  ) : (
                    <Lock className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    store.setTimelineClipVisible(selectedClip.id, !selectedClip.visible)
                  }
                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800"
                  title={selectedClip.visible ? 'Hide clip' : 'Show clip'}
                >
                  {selectedClip.visible ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => store.removeTimelineClip(selectedClip.id)}
                  className="rounded p-1.5 text-rose-500 hover:bg-rose-500/10"
                  title="Delete timeline clip"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Transition panel ─────────────────────────────────────────────── */}
      {transitionPair && (
        <div className="absolute bottom-3 right-3 z-40 w-64 rounded-xl border border-amber-500/30 bg-[#111119] p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-300">Scene Transition</span>
            <button
              type="button"
              onClick={() => setTransitionPair(null)}
              className="text-[9px] text-zinc-500 hover:text-zinc-300"
            >
              Close
            </button>
          </div>
          <select
            value={activeTransition?.type || 'none'}
            onChange={(e) =>
              store.setTimelineTransition(
                transitionPair.fromId,
                transitionPair.toId,
                e.target.value as TimelineTransitionType,
                activeTransition?.durationMs || 600
              )
            }
            className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[9px]"
          >
            {TRANSITIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="mt-2 block text-[8px] text-zinc-500">Duration (ms)</label>
          <input
            type="number"
            min={100}
            step={100}
            value={activeTransition?.durationMs || 600}
            onChange={(e) =>
              store.setTimelineTransition(
                transitionPair.fromId,
                transitionPair.toId,
                activeTransition?.type || 'crossfade',
                Number(e.target.value)
              )
            }
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[9px]"
          />
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                const toClip = clips.find((c) => c.id === transitionPair.toId);
                if (toClip) {
                  masterTimelineManager.seekMs(toClip.startMs);
                  void play();
                }
              }}
              className="rounded-lg border border-zinc-700 py-1.5 text-[8px] font-bold text-zinc-300 hover:bg-zinc-800"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() =>
                store.setAllTimelineTransitions(
                  activeTransition?.type || 'crossfade',
                  activeTransition?.durationMs || 600
                )
              }
              className="rounded-lg bg-amber-500 py-1.5 text-[8px] font-bold text-black hover:bg-amber-400"
            >
              Apply to all
            </button>
          </div>
        </div>
      )}

      {/* Voice-over Recorder Modal */}
      <VoiceRecorderModal
        isOpen={isVoiceRecorderOpen}
        onClose={() => setIsVoiceRecorderOpen(false)}
      />
    </section>
  );
};
