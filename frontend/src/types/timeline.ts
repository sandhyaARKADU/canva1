export type TimelinePlaybackState = 'playing' | 'paused' | 'seeking';
export type TimelineFps = 24 | 30 | 60;
export type TimelineTrackType = 'poster' | 'video' | 'audio';

export type SceneAnimationType =
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pop'
  | 'rotate'
  | 'pulse';

export type TimelineTransitionType =
  | 'none'
  | 'fade'
  | 'crossfade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom'
  | 'wipe-left'
  | 'wipe-right';

export interface AnimationPreset {
  type: SceneAnimationType;
  durationMs: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  delayMs?: number;
}

export type FabricObjectAnimationType =
  | 'none'
  | 'fade'
  | 'fade-in'
  | 'fade-out'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pop'
  | 'pulse'
  | 'rotate'
  | 'typewriter'
  | 'bounce'
  | 'float'
  | 'wobble'
  | 'shake'
  | 'draw';

export interface FabricObjectAnimation {
  id?: string;
  objectId?: string;
  type: FabricObjectAnimationType;
  startMs?: number;
  durationMs: number;
  delayMs?: number;
  easing?: AnimationPreset['easing'];
  loop?: boolean;
  distance?: number;
  rotationAmount?: number;
  from?: Record<string, number>;
  to?: Record<string, number>;
}

export interface FabricObjectAnimationConfig {
  format?: string;
  animationType?: FabricObjectAnimationType | string;
  durationMs?: number;
  duration?: number;
  delayMs?: number;
  delay?: number;
  startMs?: number;
  easing?: AnimationPreset['easing'];
  loop?: boolean;
  speed?: number;
  distance?: number;
  rotationAmount?: number;
  sourceAnimationId?: string;
  fullText?: string;
}

export interface SceneAnimationConfig {
  enter?: AnimationPreset;
  hold?: AnimationPreset;
  exit?: AnimationPreset;
}

export interface EditorPage {
  id: string;
  name: string;
  data: string;
  thumbnail?: string;
  updatedAt?: string;
}

export interface TimelineClip {
  id: string;
  sceneId: string;
  pageId: string;
  name: string;
  thumbnailUrl?: string;
  startMs: number;
  durationMs: number;
  trimStartMs?: number;
  trimEndMs?: number;
  animation?: SceneAnimationConfig;
  visible: boolean;
  locked: boolean;
}

export interface TimelineTrack {
  id: string;
  type: TimelineTrackType;
  clips: TimelineClip[];
}

export interface TimelineTransition {
  id: string;
  fromClipId: string;
  toClipId: string;
  type: TimelineTransitionType;
  durationMs: number;
}

export type AudioTrackType = 'voiceover' | 'bgmusic' | 'sfx';

export interface TimelineAudioTrack {
  id: string;
  assetUrl: string;
  startTime: number;
  endTime: number;
  trimStart: number;
  volume: number;
  muted: boolean;
}

export interface TimelineAudioClip {
  id: string;
  name: string;
  assetUrl: string;
  trackType: AudioTrackType;
  startTimeMs: number;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  volume: number; // 0.0 to 2.0 (0% to 200%)
  muted: boolean;
  solo?: boolean;
  locked?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  loop?: boolean;
}

export interface AudioDuckingConfig {
  enabled: boolean;
  duckingAmount: number; // 0.0 to 1.0 (e.g. 0.3 reduces bg music to 30% volume when voiceover plays)
}

export interface TimelineProject {
  version: 2;
  durationMs: number;
  currentTimeMs: number;
  fps: TimelineFps;
  zoom: number;
  collapsed: boolean;
  height: number;
  loopPreview: boolean;
  tracks: TimelineTrack[];
  transitions: TimelineTransition[];
  audio?: TimelineAudioTrack; // legacy single track support
  audioClips?: TimelineAudioClip[]; // multi-track audio clips
  audioDucking?: AudioDuckingConfig;
}

export const DEFAULT_SCENE_ANIMATION: SceneAnimationConfig = {
  enter: { type: 'none', durationMs: 600, easing: 'ease-out', delayMs: 0 },
  hold: { type: 'none', durationMs: 0, easing: 'linear', delayMs: 0 },
  exit: { type: 'none', durationMs: 600, easing: 'ease-in', delayMs: 0 },
};

export const createDefaultTimelineProject = (): TimelineProject => ({
  version: 2,
  durationMs: 0,
  currentTimeMs: 0,
  fps: 30,
  zoom: 1,
  collapsed: false,
  height: 230,
  loopPreview: false,
  tracks: [{ id: 'poster-track', type: 'poster', clips: [] }],
  transitions: [],
  audioClips: [],
  audioDucking: { enabled: true, duckingAmount: 0.3 },
});


const clampDuration = (durationMs: number) => (
  Math.min(Math.max(Math.round(durationMs || 0), 500), 120_000)
);

export const getPosterTrack = (timeline: TimelineProject) => (
  timeline.tracks.find((track) => track.type === 'poster')
  || { id: 'poster-track', type: 'poster' as const, clips: [] }
);

export const normalizeTimelineProject = (timeline?: Partial<TimelineProject> | null): TimelineProject => {
  const fallback = createDefaultTimelineProject();
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : fallback.tracks;
  const posterTrack = tracks.find((track) => track.type === 'poster') || fallback.tracks[0];
  const transitions = Array.isArray(timeline?.transitions) ? timeline.transitions : [];
  let cursorMs = 0;
  const clips = posterTrack.clips.map((clip, index) => {
    const durationMs = clampDuration(clip.durationMs);
    const previous = posterTrack.clips[index - 1];
    const overlap = previous
      ? Math.min(
        transitions.find((transition) => transition.fromClipId === previous.id && transition.toClipId === clip.id)?.durationMs || 0,
        Math.floor(Math.min(previous.durationMs, durationMs) * 0.5),
      )
      : 0;
    cursorMs = Math.max(cursorMs - overlap, 0);
    const normalizedClip: TimelineClip = {
      ...clip,
      startMs: cursorMs,
      durationMs,
      visible: clip.visible !== false,
      locked: clip.locked === true,
      animation: clip.animation || DEFAULT_SCENE_ANIMATION,
    };
    cursorMs += durationMs;
    return normalizedClip;
  });
  const normalizedTracks = [
    { ...posterTrack, clips },
    ...tracks.filter((track) => track.type !== 'poster'),
  ];
  return {
    ...fallback,
    ...timeline,
    version: 2,
    fps: timeline?.fps === 24 || timeline?.fps === 60 ? timeline.fps : 30,
    zoom: Math.min(Math.max(Number(timeline?.zoom) || 1, 0.25), 4),
    height: Math.min(Math.max(Number(timeline?.height) || 210, 120), 480),
    durationMs: cursorMs,
    currentTimeMs: Math.min(Math.max(Number(timeline?.currentTimeMs) || 0, 0), cursorMs),
    tracks: normalizedTracks,
    transitions,
    audioClips: Array.isArray(timeline?.audioClips) ? timeline.audioClips : (fallback.audioClips || []),
    audioDucking: timeline?.audioDucking || fallback.audioDucking,
  };
};

export type TimelineAnimatableProperty =
  | 'left'
  | 'top'
  | 'scaleX'
  | 'scaleY'
  | 'angle'
  | 'opacity'
  | 'visible';

export interface TimelineKeyframe {
  id?: string;
  time: number;
  property: TimelineAnimatableProperty;
  value: number | boolean;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';
}

export interface ChromaKeyConfig {
  enabled: boolean;
  color: string;
  threshold: number;
  smoothing: number;
}

export interface TimelineObjectTrack {
  objectId: string;
  name: string;
  objectType: string;
  startTime: number;
  endTime: number;
  keyframes: TimelineKeyframe[];
}

export interface TimelineVideoTrack extends TimelineObjectTrack {
  assetUrl: string;
  posterUrl?: string;
  mimeType?: string;
  trimStart: number;
  trimEnd: number;
  loop: boolean;
  muted: boolean;
  chromaKey?: ChromaKeyConfig;
  segmentationMaskUrl?: string;
}

export interface TeckStudioTimelineSchema {
  schema: 'TeckStudioTimelineSchema';
  version: 2;
  generatedAt: string;
  timeline: TimelineProject;
  canvas: {
    width: number;
    height: number;
    background: string;
  };
  pages: EditorPage[];
  fabricState: Record<string, unknown>;
  objectTracks: TimelineObjectTrack[];
  videoTracks: TimelineVideoTrack[];
  audioTracks: TimelineAudioTrack[];
}

export interface DynamicMediaAssetPayload {
  id?: string;
  type: 'video' | 'image' | 'text';
  sourceUrl?: string;
  posterUrl?: string;
  mimeType?: string;
  name?: string;
  text?: string;
  duration?: number;
  startTime?: number;
  endTime?: number;
  trimStart?: number;
  trimEnd?: number;
  loop?: boolean;
  muted?: boolean;
  width?: number;
  height?: number;
  keyframes?: TimelineKeyframe[];
  chromaKey?: ChromaKeyConfig;
  segmentationMaskUrl?: string;
}
