import { fabric } from 'fabric';
import { useEditorStore } from '../store/useEditorStore';
import type {
  FabricObjectAnimation,
  FabricObjectAnimationConfig,
  TimelineAudioTrack,
  TimelineKeyframe,
  TimelineVideoTrack,
} from '../types/timeline';
import { getPosterTrack } from '../types/timeline';
import {
  evaluateKeyframeValue,
  evaluateObjectAnimationAtTime,
  normalizeObjectAnimation,
} from './animationEvaluator';
import { renderConnectorAnimationsAtTime } from './connectorAnimationManager';

export interface CanvasVideoBinding {
  object: fabric.Image;
  video: HTMLVideoElement;
  renderFrame: () => boolean;
  destroy: () => void;
}

export interface SceneTimelineRenderer {
  prepare: () => Promise<void>;
  render: (timeMs: number) => void;
  clear: () => void;
}

type AudioBinding = {
  track: TimelineAudioTrack;
  audio: HTMLAudioElement;
};

const numberValue = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const objectValue = (object: fabric.Object, key: string) => (
  object.get(key as keyof fabric.Object) as unknown
);

const getObjectId = (object: fabric.Object) => String(
  objectValue(object, 'id') || `timeline-object-${Math.random().toString(36).slice(2)}`,
);

type ObjectBaseState = {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
  visible: boolean;
  text?: string;
};

class MasterTimelineManager {
  private canvas: fabric.Canvas | null = null;
  private sceneRenderer: SceneTimelineRenderer | null = null;
  private videoBindings = new Map<string, CanvasVideoBinding>();
  private audioBindings = new Map<string, AudioBinding>();
  private animationFrame: number | null = null;
  private playbackStartedAt = 0;
  private playbackStartOffsetMs = 0;
  private lastStoreUpdate = 0;
  private currentTimeMs = 0;
  private audioContext: AudioContext | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private gainNodes = new WeakMap<HTMLMediaElement, GainNode>();
  /** Audio element pool for multi-track audio clips (voice-over, background music, sound effects) */
  private clipAudioElements = new Map<string, HTMLAudioElement>();
  /** Base-state cache: keyed by object id, stores the original transform at page load time */
  private objectBaseStates = new Map<string, ObjectBaseState>();
  private objectRemovedHandler = (event: fabric.IEvent) => {
    if (event.target) this.unregisterVideo(event.target);
  };

  /** Capture the base state of every object currently on the editor canvas.
   *  Must be called immediately after loadPageCanvas() completes, before any animation runs. */
  captureBaseStates() {
    if (!this.canvas) return;
    this.objectBaseStates.clear();
    this.canvas.getObjects().forEach((object) => {
      const id = getObjectId(object);
      const animationConfig = objectValue(object, 'animationConfig') as { fullText?: string } | undefined;
      this.objectBaseStates.set(id, {
        left: object.left ?? 0,
        top: object.top ?? 0,
        scaleX: object.scaleX ?? 1,
        scaleY: object.scaleY ?? 1,
        angle: object.angle ?? 0,
        opacity: object.opacity ?? 1,
        visible: object.visible !== false,
        text: 'text' in object
          ? String(animationConfig?.fullText ?? (object as fabric.Text).text ?? '')
          : undefined,
      });
    });
  }

  attachCanvas(canvas: fabric.Canvas) {
    if (this.canvas === canvas) return;
    this.detachCanvas();
    this.canvas = canvas;
    canvas.on('object:removed', this.objectRemovedHandler);
    this.currentTimeMs = useEditorStore.getState().timelineProject.currentTimeMs;
    this.captureBaseStates();
  }

  attachSceneRenderer(renderer: SceneTimelineRenderer | null) {
    this.sceneRenderer = renderer;
  }

  detachCanvas() {
    this.pause();
    this.sceneRenderer?.clear();
    this.sceneRenderer = null;
    if (this.canvas) this.canvas.off('object:removed', this.objectRemovedHandler);
    this.videoBindings.forEach((binding) => binding.destroy());
    this.videoBindings.clear();
    this.audioBindings.forEach(({ audio }) => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    });
    this.audioBindings.clear();
    this.canvas = null;
    useEditorStore.getState().setTimelineActiveVideoCount(0);
  }

  registerVideo(binding: CanvasVideoBinding) {
    const id = getObjectId(binding.object);
    this.unregisterVideo(binding.object);
    this.videoBindings.set(id, binding);
    this.connectMediaElement(binding.video);
    this.refreshDuration();
    useEditorStore.getState().setTimelineActiveVideoCount(this.videoBindings.size);
    this.synchronizeVideo(binding, this.currentTimeMs / 1000, false);
    this.canvas?.requestRenderAll();
  }

  unregisterVideo(object: fabric.Object) {
    const id = getObjectId(object);
    const binding = this.videoBindings.get(id);
    if (!binding) return;
    binding.destroy();
    this.videoBindings.delete(id);
    useEditorStore.getState().setTimelineActiveVideoCount(this.videoBindings.size);
  }

  registerAudio(track: TimelineAudioTrack) {
    const existing = this.audioBindings.get(track.id);
    if (existing) {
      existing.audio.pause();
      existing.audio.removeAttribute('src');
    }
    const audio = new Audio(track.assetUrl);
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.muted = useEditorStore.getState().timelineMuted || track.muted;
    this.audioBindings.set(track.id, { track, audio });
    this.connectMediaElement(audio);
    this.refreshDuration();
  }

  getVideoTracks(): TimelineVideoTrack[] {
    return Array.from(this.videoBindings.values()).map(({ object, video }) => {
      const startTime = numberValue(objectValue(object, 'timelineStart'), 0);
      const sourceDuration = numberValue(objectValue(object, 'mediaDuration'), video.duration || 0);
      const endTime = numberValue(objectValue(object, 'timelineEnd'), startTime + sourceDuration);
      return {
        objectId: getObjectId(object),
        name: String(objectValue(object, 'name') || 'Video'),
        objectType: 'video',
        startTime,
        endTime,
        keyframes: (objectValue(object, 'timelineKeyframes') as TimelineKeyframe[] | undefined) || [],
        assetUrl: String(objectValue(object, 'videoSrc') || video.currentSrc || video.src),
        posterUrl: String(objectValue(object, 'videoPosterFrame') || '') || undefined,
        mimeType: String(objectValue(object, 'videoMimeType') || '') || undefined,
        trimStart: numberValue(objectValue(object, 'timelineTrimStart'), 0),
        trimEnd: numberValue(objectValue(object, 'timelineTrimEnd'), sourceDuration),
        loop: objectValue(object, 'videoLoop') !== false,
        muted: objectValue(object, 'videoMuted') !== false,
        chromaKey: objectValue(object, 'chromaKeyConfig') as TimelineVideoTrack['chromaKey'],
        segmentationMaskUrl: String(objectValue(object, 'segmentationMaskUrl') || '') || undefined,
      };
    });
  }

  getAudioTracks() {
    return Array.from(this.audioBindings.values()).map(({ track }) => ({ ...track }));
  }

  /** Public alias for registerAudio, used by AudioTrackRow */
  bindAudioTrack(track: TimelineAudioTrack) {
    this.registerAudio(track);
  }

  getCurrentTime() {
    return this.currentTimeMs / 1000;
  }

  getCurrentTimeMs() {
    return this.currentTimeMs;
  }

  refreshDuration() {
    const state = useEditorStore.getState();
    if (state.timelineProject.durationMs > 0) return;
    const mediaEndMs = Math.max(
      0,
      ...this.getVideoTracks().map((track) => track.endTime * 1000),
      ...this.getAudioTracks().map((track) => track.endTime * 1000),
    );
    if (mediaEndMs > 0) {
      useEditorStore.setState({
        timelineProject: { ...state.timelineProject, durationMs: mediaEndMs },
      });
    }
  }

  async play() {
    const state = useEditorStore.getState();
    const durationMs = state.timelineProject.durationMs;
    if (durationMs <= 0) throw new Error('Add at least one poster page or video before playback.');
    if (this.currentTimeMs >= durationMs) this.seekMs(0);
    await this.sceneRenderer?.prepare();
    state.setTimelinePreviewActive(true);
    state.setTimelinePlaybackState('playing');
    this.playbackStartedAt = performance.now();
    this.playbackStartOffsetMs = this.currentTimeMs;
    this.syncMediaPlayback(true);
    this.synchronizeAll(true);
    if (this.animationFrame === null) this.animationFrame = requestAnimationFrame(this.tick);
  }

  pause() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.videoBindings.forEach(({ video }) => video.pause());
    this.audioBindings.forEach(({ audio }) => audio.pause());
    this.clipAudioElements.forEach((audio) => audio.pause());
    useEditorStore.getState().setTimelinePlaybackState('paused');
  }

  stop() {
    this.pause();
    this.currentTimeMs = 0;
    useEditorStore.getState().setTimelineCurrentTime(0);
    useEditorStore.getState().setTimelinePreviewActive(false);
    this.synchronizeAll(false);
    this.sceneRenderer?.clear();
  }

  seek(timeSeconds: number) {
    this.seekMs(timeSeconds * 1000);
  }

  seekMs(timeMs: number) {
    const state = useEditorStore.getState();
    const durationMs = state.timelineProject.durationMs;
    this.currentTimeMs = Math.min(Math.max(timeMs, 0), durationMs);
    state.setTimelinePlaybackState('seeking');
    this.synchronizeAll(false);
    state.setTimelineCurrentTime(this.currentTimeMs);
    state.setTimelinePlaybackState('paused');
  }

  setPlaybackRate(rate: number) {
    useEditorStore.getState().setTimelinePlaybackRate(rate);
    const playbackRate = useEditorStore.getState().timelinePlaybackRate;
    this.videoBindings.forEach(({ video }) => {
      video.playbackRate = playbackRate;
    });
    this.audioBindings.forEach(({ audio }) => {
      audio.playbackRate = playbackRate;
    });
  }

  setMuted(muted: boolean) {
    useEditorStore.getState().setTimelineMuted(muted);
    this.videoBindings.forEach(({ video }) => {
      video.muted = muted;
      const gain = this.gainNodes.get(video);
      if (gain) gain.gain.value = muted ? 0 : 1;
    });
    this.audioBindings.forEach(({ audio, track }) => {
      audio.muted = muted || track.muted;
      const gain = this.gainNodes.get(audio);
      if (gain) gain.gain.value = muted || track.muted ? 0 : track.volume;
    });
  }

  async unlockAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.audioDestination = this.audioContext.createMediaStreamDestination();
      this.videoBindings.forEach(({ video }) => this.connectMediaElement(video));
      this.audioBindings.forEach(({ audio }) => this.connectMediaElement(audio));
    }
    await this.audioContext.resume();
    useEditorStore.getState().setTimelineAudioUnlocked(true);
    this.setMuted(false);
  }

  getCaptureAudioTracks() {
    return this.audioDestination?.stream.getAudioTracks() || [];
  }

  private connectMediaElement(media: HTMLMediaElement) {
    if (!this.audioContext || this.mediaSources.has(media)) return;
    try {
      const source = this.audioContext.createMediaElementSource(media);
      const gain = this.audioContext.createGain();
      gain.gain.value = useEditorStore.getState().timelineMuted ? 0 : 1;
      source.connect(gain);
      gain.connect(this.audioContext.destination);
      if (this.audioDestination) gain.connect(this.audioDestination);
      this.mediaSources.set(media, source);
      this.gainNodes.set(media, gain);
    } catch (error) {
      console.warn('[TECKSTUDIO] Audio graph could not bind this media element:', error);
    }
  }

  private tick = () => {
    const state = useEditorStore.getState();
    if (state.timelinePlaybackState !== 'playing') {
      this.animationFrame = null;
      return;
    }
    const elapsedMs = (performance.now() - this.playbackStartedAt) * state.timelinePlaybackRate;
    this.currentTimeMs = Math.min(this.playbackStartOffsetMs + elapsedMs, state.timelineProject.durationMs);
    const durationMs = state.timelineProject.durationMs;

    if (this.currentTimeMs >= durationMs) {
      if (state.timelineProject.loopPreview) {
        this.playbackStartedAt = performance.now();
        this.playbackStartOffsetMs = 0;
        this.currentTimeMs = 0;
        this.synchronizeAll(true);
      } else {
        this.currentTimeMs = durationMs;
        this.synchronizeAll(false);
        state.setTimelineCurrentTime(this.currentTimeMs);
        this.pause();
        state.setTimelinePreviewActive(false);
        this.sceneRenderer?.clear();
        return;
      }
    } else {
      this.synchronizeAll(true);
    }

    const now = performance.now();
    if (now - this.lastStoreUpdate >= 33) {
      state.setTimelineCurrentTime(this.currentTimeMs);
      this.lastStoreUpdate = now;
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private synchronizeAll(playing: boolean) {
    const timeSeconds = this.currentTimeMs / 1000;
    const state = useEditorStore.getState();
    const timeline = state.timelineProject;
    const clips = getPosterTrack(timeline).clips.filter((clip) => clip.visible);

    this.sceneRenderer?.render(this.currentTimeMs);

    const activeClip = [...clips].reverse().find((candidate) => (
      this.currentTimeMs >= candidate.startMs && this.currentTimeMs <= candidate.startMs + candidate.durationMs
    )) || clips[0];

    if (activeClip && this.canvas) {
      const localTimeMs = Math.max(this.currentTimeMs - activeClip.startMs, 0);
      this.applyObjectTimeline(localTimeMs);
    }

    Array.from(this.videoBindings.values()).forEach((binding, index) => (
      this.synchronizeVideo(binding, timeSeconds, playing && index < 4)
    ));
    this.audioBindings.forEach((binding) => this.synchronizeAudio(binding, timeSeconds, playing));
    this.synchronizeAudioClips(this.currentTimeMs, playing);
  }

  private syncMediaPlayback(playing: boolean) {
    const timeSeconds = this.currentTimeMs / 1000;
    Array.from(this.videoBindings.values()).forEach((binding, index) => (
      this.synchronizeVideo(binding, timeSeconds, playing && index < 4)
    ));
    this.audioBindings.forEach((binding) => this.synchronizeAudio(binding, timeSeconds, playing));
  }

  private synchronizeVideo(binding: CanvasVideoBinding, time: number, playing: boolean) {
    const { object, video } = binding;
    const start = numberValue(objectValue(object, 'timelineStart'), 0);
    const fallbackDuration = numberValue(objectValue(object, 'mediaDuration'), video.duration || 0);
    const end = numberValue(objectValue(object, 'timelineEnd'), start + fallbackDuration);
    const trimStart = numberValue(objectValue(object, 'timelineTrimStart'), 0);
    const trimEnd = numberValue(objectValue(object, 'timelineTrimEnd'), fallbackDuration || video.duration);
    const clipDuration = Math.max(trimEnd - trimStart, 0.001);
    const inRange = time >= start && time <= end;
    const baseVisible = objectValue(object, 'timelineBaseVisible') !== false;
    object.set('visible', inRange && baseVisible);
    if (!inRange) {
      video.pause();
      return;
    }
    const loop = objectValue(object, 'videoLoop') !== false;
    const relativeTime = Math.max(time - start, 0);
    const mediaTime = trimStart + (loop ? relativeTime % clipDuration : Math.min(relativeTime, clipDuration));
    if (Number.isFinite(mediaTime) && Math.abs(video.currentTime - mediaTime) > 0.12) {
      try {
        video.currentTime = mediaTime;
      } catch {
        return;
      }
    }
    const state = useEditorStore.getState();
    video.playbackRate = state.timelinePlaybackRate;
    video.muted = state.timelineMuted || objectValue(object, 'videoMuted') === true;
    binding.renderFrame();
    if (playing && video.paused) {
      void video.play().catch(() => {
        video.muted = true;
        useEditorStore.getState().setTimelineMuted(true);
        void video.play().catch(() => undefined);
      });
    } else if (!playing) {
      video.pause();
    }
  }

  private synchronizeAudio(binding: AudioBinding, time: number, playing: boolean) {
    const { track, audio } = binding;
    const inRange = time >= track.startTime && time <= track.endTime;
    if (!inRange) {
      audio.pause();
      return;
    }
    const mediaTime = track.trimStart + (time - track.startTime);
    if (Math.abs(audio.currentTime - mediaTime) > 0.12) audio.currentTime = mediaTime;
    const state = useEditorStore.getState();
    audio.playbackRate = state.timelinePlaybackRate;
    audio.muted = state.timelineMuted || track.muted;
    if (playing && audio.paused) void audio.play().catch(() => undefined);
    if (!playing) audio.pause();
  }

  private synchronizeAudioClips(timeMs: number, playing: boolean) {
    const state = useEditorStore.getState();
    const timeline = state.timelineProject;
    const audioClips = timeline.audioClips || [];
    const ducking = timeline.audioDucking || { enabled: true, duckingAmount: 0.3 };

    // Check if any voice-over clip is currently active
    const isVoiceoverActive = audioClips.some((clip) => {
      if (clip.trackType !== 'voiceover' || clip.muted) return false;
      const effectiveDuration = clip.durationMs - clip.trimStartMs - clip.trimEndMs;
      return timeMs >= clip.startTimeMs && timeMs <= clip.startTimeMs + effectiveDuration;
    });

    const activeClipIds = new Set(audioClips.map((c) => c.id));

    // Cleanup removed audio elements
    this.clipAudioElements.forEach((audio, id) => {
      if (!activeClipIds.has(id)) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        this.clipAudioElements.delete(id);
      }
    });

    audioClips.forEach((clip) => {
      let audio = this.clipAudioElements.get(clip.id);
      if (!audio) {
        audio = new Audio(clip.assetUrl);
        this.clipAudioElements.set(clip.id, audio);
      }

      const effectiveDurationMs = Math.max(clip.durationMs - clip.trimStartMs - clip.trimEndMs, 100);
      const inRange = timeMs >= clip.startTimeMs && timeMs <= clip.startTimeMs + effectiveDurationMs;

      if (!inRange || clip.muted || state.timelineMuted) {
        audio.pause();
        return;
      }

      const relativeTimeSec = (timeMs - clip.startTimeMs) / 1000;
      const trimStartSec = clip.trimStartMs / 1000;
      const targetTimeSec = trimStartSec + relativeTimeSec;

      if (Math.abs(audio.currentTime - targetTimeSec) > 0.12) {
        try {
          audio.currentTime = targetTimeSec;
        } catch {
          // Ignore range error
        }
      }

      let volume = clip.volume;
      if (clip.trackType === 'bgmusic' && ducking.enabled && isVoiceoverActive) {
        volume *= ducking.duckingAmount;
      }

      if (clip.fadeInMs && clip.fadeInMs > 0 && relativeTimeSec * 1000 < clip.fadeInMs) {
        const fadeFactor = (relativeTimeSec * 1000) / clip.fadeInMs;
        volume *= Math.max(0, Math.min(1, fadeFactor));
      }

      const remainingMs = effectiveDurationMs - relativeTimeSec * 1000;
      if (clip.fadeOutMs && clip.fadeOutMs > 0 && remainingMs < clip.fadeOutMs) {
        const fadeFactor = remainingMs / clip.fadeOutMs;
        volume *= Math.max(0, Math.min(1, fadeFactor));
      }

      audio.volume = Math.max(0, Math.min(1, volume));
      audio.playbackRate = state.timelinePlaybackRate;

      if (playing && audio.paused) {
        void audio.play().catch(() => undefined);
      } else if (!playing) {
        audio.pause();
      }
    });
  }

  private applyObjectTimeline(localTimeMs: number) {
    if (!this.canvas) return;
    const localTimeSeconds = localTimeMs / 1000;
    const width = this.canvas.getWidth() || 800;
    const height = this.canvas.getHeight() || 800;

    this.canvas.getObjects().forEach((object) => {
      const objectId = getObjectId(object);

      // ── Restore base state before computing this frame's animation delta.
      // Without this, every frame starts from the PREVIOUS frame's already-animated
      // position, causing cumulative drift (e.g. opacity compounds toward 0).
      const base = this.objectBaseStates.get(objectId);
      if (base) {
        object.set({
          left: base.left,
          top: base.top,
          scaleX: base.scaleX,
          scaleY: base.scaleY,
          angle: base.angle,
          opacity: base.opacity,
          visible: base.visible,
        });
        if (base.text !== undefined) {
          (object as fabric.Text).set('text', base.text);
        }
      }

      const configuredAnimations = objectValue(object, 'objectAnimations') as FabricObjectAnimation[] | undefined;
      const legacyConfig = objectValue(object, 'animationConfig') as FabricObjectAnimationConfig | undefined;
      const animations = (
        configuredAnimations?.length ? configuredAnimations : [legacyConfig]
      ).flatMap((config) => {
        const normalized = normalizeObjectAnimation(config, objectId);
        return normalized ? [normalized] : [];
      });

      const keyframes = objectValue(object, 'timelineKeyframes') as TimelineKeyframe[] | undefined;
      const startSeconds = numberValue(objectValue(object, 'timelineStart'), 0);
      const endValue = objectValue(object, 'timelineEnd');
      const endSeconds = endValue === undefined ? Number.POSITIVE_INFINITY : numberValue(endValue, Number.POSITIVE_INFINITY);
      const baseVisible = base?.visible ?? object.get('visible') !== false;

      object.set('visible', baseVisible && localTimeSeconds >= startSeconds && localTimeSeconds <= endSeconds);

      if (animations.length > 0) {
        // Use restored base values as the starting point for deltas
        const baseLeft = base?.left ?? object.left ?? 0;
        const baseTop = base?.top ?? object.top ?? 0;
        const baseScaleX = base?.scaleX ?? object.scaleX ?? 1;
        const baseScaleY = base?.scaleY ?? object.scaleY ?? 1;
        const baseAngle = base?.angle ?? object.angle ?? 0;
        const baseOpacity = base?.opacity ?? object.opacity ?? 1;
        const fullText = base?.text ?? (object as fabric.Text).text ?? '';

        let opacity = baseOpacity;
        let left = baseLeft;
        let top = baseTop;
        let scaleX = baseScaleX;
        let scaleY = baseScaleY;
        let angle = baseAngle;
        let visibleTextLength: number | undefined;

        animations.forEach((animation) => {
          const evaluation = evaluateObjectAnimationAtTime({
            animation,
            localTimeMs: Math.max(localTimeMs - (startSeconds * 1000), 0),
            width,
            height,
            textLength: fullText.length,
          });
          opacity *= evaluation.opacity;
          left += evaluation.translateX;
          top += evaluation.translateY;
          scaleX *= evaluation.scaleX;
          scaleY *= evaluation.scaleY;
          angle += evaluation.rotation;
          if (evaluation.visibleTextLength !== undefined) {
            visibleTextLength = visibleTextLength === undefined
              ? evaluation.visibleTextLength
              : Math.min(visibleTextLength, evaluation.visibleTextLength);
          }
        });

        object.set({ opacity, left, top, scaleX, scaleY, angle });
        if ('text' in object && visibleTextLength !== undefined) {
          (object as fabric.Text).set('text', fullText.slice(0, visibleTextLength));
        }
      }

      if (keyframes?.length) {
        const objectTimeSeconds = localTimeSeconds - startSeconds;
        const properties = Array.from(new Set(keyframes.map((keyframe) => keyframe.property)));
        properties.forEach((property) => {
          const value = evaluateKeyframeValue(
            keyframes.filter((keyframe) => keyframe.property === property),
            objectTimeSeconds,
          );
          if (value !== undefined) object.set(property as keyof fabric.Object, value as never);
        });
      }
      object.setCoords();
    });

    this.canvas.renderAll();
    const context = (this.canvas as fabric.Canvas & { contextContainer?: CanvasRenderingContext2D }).contextContainer;
    if (context) {
      renderConnectorAnimationsAtTime(context, this.canvas, localTimeMs);
    }
  }
}

export const masterTimelineManager = new MasterTimelineManager();

