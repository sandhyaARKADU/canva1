import type {
  AnimationPreset,
  FabricObjectAnimation,
  FabricObjectAnimationConfig,
  FabricObjectAnimationType,
  TimelineClip,
  TimelineKeyframe,
  TimelineProject,
  TimelineTransition,
} from '../types/timeline';

export type AnimationPhase = 'enter' | 'hold' | 'exit' | 'transition';

export interface SceneEvaluation {
  opacity: number;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  clipProgress: number;
  animationProgress: number;
  animationPhase: AnimationPhase;
}

export interface ActiveTransitionEvaluation {
  transition: TimelineTransition;
  fromClip: TimelineClip;
  toClip: TimelineClip;
  progress: number;
}

export interface ObjectAnimationEvaluation {
  opacity: number;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  visibleTextLength?: number;
  strokeProgress?: number;
  progress: number;
  active: boolean;
}

const clamp = (value: number, minimum = 0, maximum = 1) => (
  Math.min(Math.max(Number.isFinite(value) ? value : minimum, minimum), maximum)
);

export const easeAnimationProgress = (
  progress: number,
  easing: AnimationPreset['easing'] = 'linear',
) => {
  const value = clamp(progress);
  if (easing === 'ease-in') return value * value;
  if (easing === 'ease-out') return 1 - ((1 - value) * (1 - value));
  if (easing === 'ease-in-out') {
    return value < 0.5
      ? 2 * value * value
      : 1 - (Math.pow(-2 * value + 2, 2) / 2);
  }
  return value;
};

const applyPreset = (
  evaluation: SceneEvaluation,
  preset: AnimationPreset | undefined,
  progress: number,
  direction: 'enter' | 'hold' | 'exit',
  width: number,
  height: number,
) => {
  if (!preset || preset.type === 'none') return evaluation;
  const easedProgress = easeAnimationProgress(progress, preset.easing);
  const panDistanceX = width * 0.04;

  if (preset.type === 'fade') {
    evaluation.opacity *= direction === 'exit' ? 1 - easedProgress : easedProgress;
  }
  if (preset.type === 'slide-left') {
    evaluation.translateX += direction === 'exit'
      ? -width * easedProgress
      : width * (1 - easedProgress);
  }
  if (preset.type === 'slide-right') {
    evaluation.translateX += direction === 'exit'
      ? width * easedProgress
      : -width * (1 - easedProgress);
  }
  if (preset.type === 'slide-up') {
    evaluation.translateY += direction === 'exit'
      ? -height * easedProgress
      : height * (1 - easedProgress);
  }
  if (preset.type === 'slide-down') {
    evaluation.translateY += direction === 'exit'
      ? height * easedProgress
      : -height * (1 - easedProgress);
  }
  if (preset.type === 'zoom-in') {
    const scale = direction === 'exit'
      ? 1 + (0.25 * easedProgress)
      : 0.75 + (0.25 * easedProgress);
    evaluation.scaleX *= scale;
    evaluation.scaleY *= scale;
  }
  if (preset.type === 'zoom-out') {
    const scale = direction === 'exit'
      ? 1 - (0.25 * easedProgress)
      : 1.25 - (0.25 * easedProgress);
    evaluation.scaleX *= scale;
    evaluation.scaleY *= scale;
  }
  if (preset.type === 'pan-left') evaluation.translateX -= panDistanceX * easedProgress;
  if (preset.type === 'pan-right') evaluation.translateX += panDistanceX * easedProgress;
  if (preset.type === 'pop') {
    const overshoot = 1 + (2.70158 * Math.pow(easedProgress - 1, 3))
      + (1.70158 * Math.pow(easedProgress - 1, 2));
    const scale = direction === 'exit'
      ? 1 - (0.5 * easedProgress)
      : 0.5 + (0.5 * overshoot);
    evaluation.scaleX *= scale;
    evaluation.scaleY *= scale;
  }
  if (preset.type === 'rotate') {
    evaluation.rotation += 360 * easedProgress * (direction === 'exit' ? -1 : 1);
  }
  if (preset.type === 'pulse') {
    const pulseScale = 1 + (Math.sin(easedProgress * Math.PI) * 0.08);
    evaluation.scaleX *= pulseScale;
    evaluation.scaleY *= pulseScale;
  }
  evaluation.animationProgress = easedProgress;
  return evaluation;
};

const normalizeObjectAnimationType = (value: unknown): FabricObjectAnimationType => {
  const type = String(value || 'none').trim().toLowerCase();
  const exactTypes: FabricObjectAnimationType[] = [
    'none',
    'fade',
    'fade-in',
    'fade-out',
    'slide-left',
    'slide-right',
    'slide-up',
    'slide-down',
    'zoom-in',
    'zoom-out',
    'pan-left',
    'pan-right',
    'pop',
    'pulse',
    'rotate',
    'typewriter',
    'bounce',
    'float',
    'wobble',
    'shake',
    'draw',
  ];
  if (exactTypes.includes(type as FabricObjectAnimationType)) {
    return type as FabricObjectAnimationType;
  }
  if (type.includes('typewriter') || type.startsWith('word-')) return 'typewriter';
  if (type.includes('fade')) return type.includes('out') ? 'fade-out' : 'fade-in';
  if (type.includes('slide') || type.includes('swipe')) return 'slide-left';
  if (type.includes('zoom') || type.includes('scale')) return 'zoom-in';
  if (type.includes('pop')) return 'pop';
  if (type.includes('pulse') || type.includes('heart')) return 'pulse';
  if (type.includes('rotate') || type.includes('spin') || type.includes('loop')) return 'rotate';
  if (type.includes('bounce')) return 'bounce';
  if (type.includes('float') || type.includes('steam')) return 'float';
  if (type.includes('wobble')) return 'wobble';
  if (type.includes('shake')) return 'shake';
  if (type.includes('draw')) return 'draw';
  return 'none';
};

export const normalizeObjectAnimation = (
  config: FabricObjectAnimation | FabricObjectAnimationConfig | undefined,
  objectId?: string,
): FabricObjectAnimation | null => {
  if (!config) return null;
  const legacy = config as FabricObjectAnimationConfig;
  const speed = Math.max(Number(legacy.speed) || 1, 0.01);
  const durationMs = Math.max(
    Number((config as FabricObjectAnimation).durationMs)
      || Number(legacy.duration)
      || (2000 / speed),
    1,
  );
  const type = normalizeObjectAnimationType(
    (config as FabricObjectAnimation).type || legacy.animationType,
  );
  if (type === 'none') return null;
  return {
    id: (config as FabricObjectAnimation).id,
    objectId: (config as FabricObjectAnimation).objectId || objectId,
    type,
    startMs: Math.max(Number((config as FabricObjectAnimation).startMs ?? legacy.startMs) || 0, 0),
    durationMs,
    delayMs: Math.max(Number((config as FabricObjectAnimation).delayMs ?? legacy.delayMs ?? legacy.delay) || 0, 0),
    easing: (config as FabricObjectAnimation).easing || legacy.easing || 'ease-in-out',
    loop: (config as FabricObjectAnimation).loop ?? legacy.loop ?? false,
    distance: Number((config as FabricObjectAnimation).distance ?? legacy.distance) || undefined,
    rotationAmount: Number(
      (config as FabricObjectAnimation).rotationAmount ?? legacy.rotationAmount,
    ) || undefined,
    from: (config as FabricObjectAnimation).from,
    to: (config as FabricObjectAnimation).to,
  };
};

export const evaluateObjectAnimationAtTime = ({
  animation,
  localTimeMs,
  width,
  height,
  textLength = 0,
}: {
  animation: FabricObjectAnimation;
  localTimeMs: number;
  width: number;
  height: number;
  textLength?: number;
}): ObjectAnimationEvaluation => {
  const startMs = Math.max(animation.startMs || 0, 0) + Math.max(animation.delayMs || 0, 0);
  const elapsedMs = localTimeMs - startMs;
  const durationMs = Math.max(animation.durationMs, 1);
  const hasStarted = elapsedMs >= 0;
  const rawProgress = animation.loop && hasStarted
    ? ((elapsedMs % durationMs) + durationMs) % durationMs / durationMs
    : clamp(elapsedMs / durationMs);
  const progress = easeAnimationProgress(rawProgress, animation.easing || 'linear');
  const distanceX = animation.distance || width * 0.12;
  const distanceY = animation.distance || height * 0.12;
  const result: ObjectAnimationEvaluation = {
    opacity: 1,
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    progress,
    active: hasStarted,
  };

  if (animation.type === 'fade' || animation.type === 'fade-in') {
    result.opacity = progress;
  } else if (animation.type === 'fade-out') {
    result.opacity = 1 - progress;
  } else if (animation.type === 'slide-left') {
    result.translateX = distanceX * (1 - progress);
  } else if (animation.type === 'slide-right') {
    result.translateX = -distanceX * (1 - progress);
  } else if (animation.type === 'slide-up') {
    result.translateY = distanceY * (1 - progress);
  } else if (animation.type === 'slide-down') {
    result.translateY = -distanceY * (1 - progress);
  } else if (animation.type === 'zoom-in') {
    result.scaleX = 0.75 + (0.25 * progress);
    result.scaleY = result.scaleX;
  } else if (animation.type === 'zoom-out') {
    result.scaleX = 1.25 - (0.25 * progress);
    result.scaleY = result.scaleX;
  } else if (animation.type === 'pan-left') {
    result.translateX = -distanceX * progress;
  } else if (animation.type === 'pan-right') {
    result.translateX = distanceX * progress;
  } else if (animation.type === 'pop') {
    const overshoot = 1 + (2.70158 * Math.pow(progress - 1, 3))
      + (1.70158 * Math.pow(progress - 1, 2));
    result.scaleX = 0.5 + (0.5 * overshoot);
    result.scaleY = result.scaleX;
  } else if (animation.type === 'pulse') {
    result.scaleX = 1 + (Math.sin(progress * Math.PI) * 0.08);
    result.scaleY = result.scaleX;
  } else if (animation.type === 'rotate') {
    result.rotation = (animation.rotationAmount || 360) * progress;
  } else if (animation.type === 'typewriter') {
    result.visibleTextLength = Math.floor(textLength * progress);
  } else if (animation.type === 'bounce') {
    result.translateY = -Math.abs(Math.sin(progress * Math.PI)) * (animation.distance || 18);
  } else if (animation.type === 'float') {
    result.translateY = Math.sin(progress * Math.PI * 2) * (animation.distance || 12);
  } else if (animation.type === 'wobble') {
    result.rotation = Math.sin(progress * Math.PI * 2) * (animation.rotationAmount || 8);
  } else if (animation.type === 'shake') {
    result.translateX = Math.sin(progress * Math.PI * 4) * (animation.distance || 12);
  } else if (animation.type === 'draw') {
    result.strokeProgress = progress;
  }
  return result;
};

export const evaluateSceneAtTime = ({
  clip,
  globalTimeMs,
  width,
  height,
}: {
  clip: TimelineClip;
  globalTimeMs: number;
  width: number;
  height: number;
}): SceneEvaluation => {
  const localTimeMs = globalTimeMs - clip.startMs;
  const durationMs = Math.max(clip.durationMs, 1);
  const evaluation: SceneEvaluation = {
    opacity: 1,
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    clipProgress: clamp(localTimeMs / durationMs),
    animationProgress: 0,
    animationPhase: 'hold',
  };

  const enter = clip.animation?.enter;
  const enterDelayMs = Math.max(enter?.delayMs || 0, 0);
  const enterDurationMs = Math.max(enter?.durationMs || 0, 1);
  const enterEndMs = enterDelayMs + enterDurationMs;
  if (enter && enter.type !== 'none' && localTimeMs < enterEndMs) {
    evaluation.animationPhase = 'enter';
    return applyPreset(
      evaluation,
      enter,
      clamp((localTimeMs - enterDelayMs) / enterDurationMs),
      'enter',
      width,
      height,
    );
  }

  const exit = clip.animation?.exit;
  const exitDurationMs = Math.max(exit?.durationMs || 0, 1);
  const exitStartMs = durationMs - exitDurationMs - Math.max(exit?.delayMs || 0, 0);
  if (exit && exit.type !== 'none' && localTimeMs >= exitStartMs) {
    evaluation.animationPhase = 'exit';
    return applyPreset(
      evaluation,
      exit,
      clamp((localTimeMs - exitStartMs) / exitDurationMs),
      'exit',
      width,
      height,
    );
  }

  const hold = clip.animation?.hold;
  if (hold && hold.type !== 'none') {
    const holdDurationMs = Math.max(hold.durationMs || durationMs, 1);
    const holdDelayMs = Math.max(hold.delayMs || 0, 0);
    const holdTimeMs = Math.max(localTimeMs - holdDelayMs, 0);
    evaluation.animationPhase = 'hold';
    return applyPreset(
      evaluation,
      hold,
      (holdTimeMs % holdDurationMs) / holdDurationMs,
      'hold',
      width,
      height,
    );
  }
  return evaluation;
};

export const evaluateTransitionAtTime = (
  timeline: TimelineProject,
  clips: TimelineClip[],
  globalTimeMs: number,
): ActiveTransitionEvaluation | null => {
  for (const transition of timeline.transitions) {
    const fromClip = clips.find((clip) => clip.id === transition.fromClipId);
    const toClip = clips.find((clip) => clip.id === transition.toClipId);
    if (!fromClip || !toClip || transition.durationMs <= 0) continue;
    const transitionStartMs = toClip.startMs;
    const transitionEndMs = transitionStartMs + transition.durationMs;
    if (globalTimeMs >= transitionStartMs && globalTimeMs <= transitionEndMs) {
      return {
        transition,
        fromClip,
        toClip,
        progress: clamp((globalTimeMs - transitionStartMs) / transition.durationMs),
      };
    }
  }
  return null;
};

export const evaluateKeyframeValue = (
  keyframes: TimelineKeyframe[],
  timeSeconds: number,
): number | boolean | undefined => {
  if (keyframes.length === 0) return undefined;
  const sorted = [...keyframes].sort((first, second) => first.time - second.time);
  if (timeSeconds <= sorted[0].time) return sorted[0].value;
  if (timeSeconds >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  const nextIndex = sorted.findIndex((keyframe) => keyframe.time >= timeSeconds);
  const previous = sorted[nextIndex - 1];
  const next = sorted[nextIndex];
  if (typeof previous.value !== 'number' || typeof next.value !== 'number') return previous.value;
  if (next.easing === 'hold') return previous.value;
  const range = Math.max(next.time - previous.time, 0.0001);
  const progress = easeAnimationProgress(
    (timeSeconds - previous.time) / range,
    next.easing || 'linear',
  );
  return previous.value + ((next.value - previous.value) * progress);
};

export const frameTimestampMs = (frameIndex: number, fps: number) => (
  Math.max(frameIndex, 0) * 1000 / Math.max(fps, 1)
);
