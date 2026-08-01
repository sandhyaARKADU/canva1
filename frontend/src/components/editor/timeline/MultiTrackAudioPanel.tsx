import React, { useRef, useState } from 'react';
import {
  Mic,
  Music,
  Zap,
  Plus,
  Volume2,
  VolumeX,
  Trash2,
  Copy,
  Scissors,
  Radio,
} from 'lucide-react';
import { useEditorStore } from '../../../store/useEditorStore';
import type { AudioTrackType, TimelineAudioClip } from '../../../types/timeline';

interface MultiTrackAudioPanelProps {
  pixelsPerSecond: number;
  onOpenVoiceRecorder: () => void;
}

const TRACK_CONFIG: Record<
  AudioTrackType,
  { label: string; icon: React.ReactNode; color: string; border: string; bg: string; text: string }
> = {
  voiceover: {
    label: 'Voice-over',
    icon: <Mic className="h-3 w-3 text-violet-400" />,
    color: 'bg-violet-500/60',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
    text: 'text-violet-300',
  },
  bgmusic: {
    label: 'Background Music',
    icon: <Music className="h-3 w-3 text-emerald-400" />,
    color: 'bg-emerald-500/60',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
  },
  sfx: {
    label: 'Sound Effects',
    icon: <Zap className="h-3 w-3 text-amber-400" />,
    color: 'bg-amber-500/60',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
  },
};

export const MultiTrackAudioPanel: React.FC<MultiTrackAudioPanelProps> = ({
  pixelsPerSecond,
  onOpenVoiceRecorder,
}) => {
  const store = useEditorStore();
  const timeline = store.timelineProject;
  const audioClips = timeline.audioClips || [];
  const ducking = timeline.audioDucking || { enabled: true, duckingAmount: 0.3 };

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [showDuckingSettings, setShowDuckingSettings] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTrackTypeRef = useRef<AudioTrackType>('bgmusic');

  const [draggingClip, setDraggingClip] = useState<{
    id: string;
    initialX: number;
    initialStartMs: number;
    type: 'move' | 'trim-left' | 'trim-right';
  } | null>(null);

  const selectedClip = audioClips.find((c) => c.id === selectedClipId);

  const handleUploadClick = (trackType: AudioTrackType) => {
    uploadTrackTypeRef.current = trackType;
    uploadInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const trackType = uploadTrackTypeRef.current;
    const name = file.name.replace(/\.[^/.]+$/, '');

    // Get approximate audio duration
    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => {
      const durationMs = (tempAudio.duration || 10) * 1000;
      const playheadMs = timeline.currentTimeMs || 0;

      const newClip: TimelineAudioClip = {
        id: `audio-${Date.now()}`,
        name,
        assetUrl: url,
        trackType,
        startTimeMs: playheadMs,
        durationMs,
        trimStartMs: 0,
        trimEndMs: 0,
        volume: 1.0,
        muted: false,
        loop: trackType === 'bgmusic',
      };

      store.addAudioClip(newClip);
      setSelectedClipId(newClip.id);
    };
  };

  // Dragging & Trimming Logic
  const handleMouseDown = (
    e: React.MouseEvent,
    clip: TimelineAudioClip,
    type: 'move' | 'trim-left' | 'trim-right',
  ) => {
    e.stopPropagation();
    setSelectedClipId(clip.id);
    setDraggingClip({
      id: clip.id,
      initialX: e.clientX,
      initialStartMs: clip.startTimeMs,
      type,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingClip) return;
    const clip = audioClips.find((c) => c.id === draggingClip.id);
    if (!clip) return;

    const deltaPx = e.clientX - draggingClip.initialX;
    const deltaMs = (deltaPx / pixelsPerSecond) * 1000;

    if (draggingClip.type === 'move') {
      const nextStartMs = Math.max(0, Math.round(draggingClip.initialStartMs + deltaMs));
      store.updateAudioClip(clip.id, { startTimeMs: nextStartMs });
    } else if (draggingClip.type === 'trim-left') {
      const maxTrim = clip.durationMs - clip.trimEndMs - 500;
      const nextTrimStart = Math.max(0, Math.min(maxTrim, Math.round(clip.trimStartMs + deltaMs)));
      store.updateAudioClip(clip.id, { trimStartMs: nextTrimStart });
    } else if (draggingClip.type === 'trim-right') {
      const maxTrim = clip.durationMs - clip.trimStartMs - 500;
      const nextTrimEnd = Math.max(0, Math.min(maxTrim, Math.round(clip.trimEndMs - deltaMs)));
      store.updateAudioClip(clip.id, { trimEndMs: nextTrimEnd });
    }
  };

  const handleMouseUp = () => {
    setDraggingClip(null);
  };

  const renderTrackRow = (trackType: AudioTrackType) => {
    const config = TRACK_CONFIG[trackType];
    const clips = audioClips.filter((c) => c.trackType === trackType);

    return (
      <div
        key={trackType}
        className="relative flex h-10 border-t border-zinc-800/80 bg-zinc-950/40"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Track Header */}
        <div className="absolute left-0 top-0 z-10 flex h-full w-40 items-center gap-1.5 border-r border-zinc-800 bg-zinc-950 px-2.5">
          {config.icon}
          <span className="truncate text-[10px] font-semibold text-zinc-300">{config.label}</span>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (trackType === 'voiceover') onOpenVoiceRecorder();
                else handleUploadClick(trackType);
              }}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              title={`Add ${config.label}`}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Clip Track Line */}
        <div className="relative ml-40 h-full flex-1 overflow-hidden">
          {clips.length === 0 ? (
            <div className="flex h-full items-center px-4 text-[9px] font-medium text-zinc-600">
              No {config.label.toLowerCase()} clips added
            </div>
          ) : (
            clips.map((clip) => {
              const effectiveDurationSec = (clip.durationMs - clip.trimStartMs - clip.trimEndMs) / 1000;
              const clipWidth = Math.max(effectiveDurationSec * pixelsPerSecond, 40);
              const leftPx = (clip.startTimeMs / 1000) * pixelsPerSecond;
              const isSelected = clip.id === selectedClipId;

              return (
                <div
                  key={clip.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedClipId(clip.id);
                  }}
                  onMouseDown={(e) => handleMouseDown(e, clip, 'move')}
                  className={`absolute top-1 flex h-8 cursor-grab select-none items-center overflow-hidden rounded-md border ${config.border} ${config.bg} ${
                    isSelected ? 'ring-2 ring-violet-400 ring-offset-1 ring-offset-black' : ''
                  }`}
                  style={{ left: leftPx, width: clipWidth }}
                >
                  {/* Left Trim Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, clip, 'trim-left')}
                    className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/20 hover:bg-white/50"
                  />

                  {/* Waveform Visualization */}
                  <div className="flex h-full flex-1 items-center px-2">
                    <div className="flex h-5 w-full items-center gap-0.5 overflow-hidden">
                      {Array.from({ length: Math.max(Math.floor(clipWidth / 4), 1) }).map((_, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-full ${config.color}`}
                          style={{
                            height: `${25 + Math.sin(i * 0.8) * 35 + Math.cos(i * 1.5) * 25}%`,
                            opacity: clip.muted ? 0.3 : 1.0,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <span className={`mr-2 shrink-0 truncate text-[8px] font-bold ${config.text}`}>
                    {clip.name} ({effectiveDurationSec.toFixed(1)}s)
                  </span>

                  {/* Right Trim Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, clip, 'trim-right')}
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/20 hover:bg-white/50"
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-950">
      {/* Hidden File Input for Audio Upload */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="audio/mp3,audio/wav,audio/mpeg,audio/aac,audio/m4a,audio/ogg"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Audio Quick Bar Actions */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-300">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Audio Tracks</span>
          <button
            type="button"
            onClick={onOpenVoiceRecorder}
            className="flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[9px] font-semibold text-violet-300 hover:bg-violet-500/20"
          >
            <Mic className="h-3 w-3 text-violet-400" />
            Record Voice
          </button>
          <button
            type="button"
            onClick={() => handleUploadClick('bgmusic')}
            className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            <Music className="h-3 w-3 text-emerald-400" />
            Add Music
          </button>
          <button
            type="button"
            onClick={() => handleUploadClick('sfx')}
            className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-300 hover:bg-amber-500/20"
          >
            <Zap className="h-3 w-3 text-amber-400" />
            Add Sound FX
          </button>
        </div>

        {/* Audio Ducking Control */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDuckingSettings(!showDuckingSettings)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-semibold transition-colors ${
              ducking.enabled
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-500'
            }`}
          >
            <Radio className="h-3 w-3" />
            <span>Audio Ducking {ducking.enabled ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>

      {/* Audio Ducking Drawer */}
      {showDuckingSettings && (
        <div className="flex items-center gap-4 border-b border-zinc-800/80 bg-indigo-950/20 px-4 py-2 text-xs text-zinc-300">
          <span className="text-[10px] font-semibold text-indigo-300">Background Music Auto-Ducking:</span>
          <label className="flex items-center gap-1.5 text-[10px]">
            <input
              type="checkbox"
              checked={ducking.enabled}
              onChange={(e) => store.setAudioDucking({ ...ducking, enabled: e.target.checked })}
              className="accent-indigo-500"
            />
            <span>Enable Ducking</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400">Reduce bg music to:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={ducking.duckingAmount}
              onChange={(e) =>
                store.setAudioDucking({ ...ducking, duckingAmount: parseFloat(e.target.value) })
              }
              className="h-1 w-24 accent-indigo-500"
            />
            <span className="font-mono text-[10px] text-indigo-300">
              {Math.round(ducking.duckingAmount * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Render Audio Tracks */}
      {renderTrackRow('voiceover')}
      {renderTrackRow('bgmusic')}
      {renderTrackRow('sfx')}

      {/* Selected Clip Control Inspector */}
      {selectedClip && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs text-zinc-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-violet-300">{selectedClip.name}</span>
            <span className="text-[10px] text-zinc-400">
              Starts: {(selectedClip.startTimeMs / 1000).toFixed(2)}s | Duration:{' '}
              {((selectedClip.durationMs - selectedClip.trimStartMs - selectedClip.trimEndMs) / 1000).toFixed(2)}s
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Volume slider (0-200%) */}
            <div className="flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-zinc-400" />
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.05}
                value={selectedClip.volume}
                onChange={(e) => store.updateAudioClip(selectedClip.id, { volume: parseFloat(e.target.value) })}
                className="h-1 w-20 accent-violet-500"
              />
              <span className="w-8 font-mono text-[10px] text-zinc-400">
                {Math.round(selectedClip.volume * 100)}%
              </span>
            </div>

            {/* Mute */}
            <button
              type="button"
              onClick={() => store.updateAudioClip(selectedClip.id, { muted: !selectedClip.muted })}
              className={`rounded p-1 ${selectedClip.muted ? 'bg-rose-500/20 text-rose-300' : 'text-zinc-400 hover:text-white'}`}
              title={selectedClip.muted ? 'Unmute' : 'Mute'}
            >
              {selectedClip.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>

            {/* Split */}
            <button
              type="button"
              onClick={() => store.splitAudioClipAtPlayhead(selectedClip.id)}
              className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[9px] text-zinc-300 hover:text-white"
              title="Split clip at current playhead position"
            >
              <Scissors className="h-3 w-3" />
              Split
            </button>

            {/* Duplicate */}
            <button
              type="button"
              onClick={() => store.duplicateAudioClip(selectedClip.id)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              title="Duplicate clip"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={() => {
                store.deleteAudioClip(selectedClip.id);
                setSelectedClipId(null);
              }}
              className="rounded p-1 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400"
              title="Delete clip"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
