import React, { useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/useEditorStore';
import type { FabricObjectAnimationType } from '../../types/timeline';
import type { DiagramConnectorAnimationConfig, DiagramConnectorAnimationDirection } from '../../utils/architectureDiagramTypes';
import {
  EyeOff,
  Eye,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ZoomIn,
  RotateCw,
  Expand,
  ShieldAlert,
} from 'lucide-react';

interface AnimationDef {
  label: string;
  icon: React.ReactNode;
  run: (obj: fabric.Object, canvas: fabric.Canvas) => void;
}


const OBJECT_ANIMATION_OPTIONS: Array<{ value: FabricObjectAnimationType | 'none'; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'fade-in', label: 'Fade In' },
  { value: 'scale-in', label: 'Scale In' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'slide-right', label: 'Slide Right' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-down', label: 'Slide Down' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'blink', label: 'Blink' },
  { value: 'draw', label: 'Draw In' },
];

const CONNECTOR_ANIMATION_OPTIONS: Array<{ value: DiagramConnectorAnimationConfig['type'] | 'none'; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'draw-in', label: 'Draw In' },
  { value: 'travelling-pulse', label: 'Traveling Dot' },
  { value: 'moving-dots', label: 'Flow' },
  { value: 'moving-dashes', label: 'Dash Flow' },
  { value: 'travelling-arrowhead', label: 'Traveling Arrow' },
  { value: 'flow-trail', label: 'Flow Trail' },
];

const CONNECTOR_DIRECTIONS: Array<{ value: DiagramConnectorAnimationDirection; label: string }> = [
  { value: 'forward', label: 'Left → Right / Forward' },
  { value: 'reverse', label: 'Right → Left / Reverse' },
  { value: 'forward-once', label: 'Forward Once' },
  { value: 'reverse-once', label: 'Reverse Once' },
  { value: 'bidirectional', label: 'Bidirectional' },
  { value: 'alternating', label: 'Alternating' },
];

const EASING_OPTIONS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;

const objectValue = (object: fabric.Object, key: string) => object.get(key as keyof fabric.Object) as unknown;
const isConnectorObject = (object: fabric.Object) => (
  objectValue(object, 'teckstudioObjectType') === 'diagramArrow' ||
  objectValue(object, 'teckstudioObjectType') === 'diagramConnectorPath'
);

const readNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const AnimationPanel: React.FC = () => {
  const { canvas, selectedObject, saveHistory } = useEditorStore();
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationType, setAnimationType] = useState<string>('none');
  const [startMs, setStartMs] = useState(0);
  const [durationMs, setDurationMs] = useState(800);
  const [delayMs, setDelayMs] = useState(0);
  const [easing, setEasing] = useState<typeof EASING_OPTIONS[number]>('ease-out');
  const [direction, setDirection] = useState<DiagramConnectorAnimationDirection>('forward');
  const [loop, setLoop] = useState(false);


  const selectedIsConnector = selectedObject ? isConnectorObject(selectedObject) : false;

  useEffect(() => {
    if (!selectedObject) return;
    if (isConnectorObject(selectedObject)) {
      const config = (
        objectValue(selectedObject, 'diagramArrowConfig') ||
        objectValue(selectedObject, 'diagramConnectorConfig') ||
        {}
      ) as { animation?: DiagramConnectorAnimationConfig };
      const animation = config.animation || {};
      setAnimationType(animation.enabled === true ? String(animation.type || 'moving-dashes') : 'none');
      setStartMs(readNumber(animation.delay, 0));
      setDurationMs(readNumber(animation.duration, 1200));
      setDelayMs(readNumber(animation.startDelay, 0));
      setEasing(animation.easing || 'linear');
      setDirection(animation.direction || 'forward');
      setLoop(animation.loop !== false && animation.direction !== 'forward-once' && animation.direction !== 'reverse-once');
      return;
    }
    const configured = objectValue(selectedObject, 'objectAnimations') as Array<Record<string, unknown>> | undefined;
    const legacy = objectValue(selectedObject, 'animationConfig') as Record<string, unknown> | undefined;
    const first = configured?.[0] || legacy || {};
    const nextType = String(first.type || first.animationType || 'none');
    setAnimationType(nextType);
    setStartMs(readNumber(first.startMs, 0));
    setDurationMs(readNumber(first.durationMs || first.duration, 800));
    setDelayMs(readNumber(first.delayMs || first.delay, 0));
    setEasing((first.easing as typeof EASING_OPTIONS[number]) || 'ease-out');
    setDirection('forward');
    setLoop(first.loop === true);
  }, [selectedObject]);

  if (!canvas || !selectedObject) return null;

  const commitTimelineAnimation = (patch: Partial<{
    animationType: string;
    startMs: number;
    durationMs: number;
    delayMs: number;
    easing: typeof EASING_OPTIONS[number];
    direction: DiagramConnectorAnimationDirection;
    loop: boolean;
  }>) => {
    const next = {
      animationType,
      startMs,
      durationMs,
      delayMs,
      easing,
      direction,
      loop,
      ...patch,
    };
    setAnimationType(next.animationType);
    setStartMs(next.startMs);
    setDurationMs(next.durationMs);
    setDelayMs(next.delayMs);
    setEasing(next.easing);
    setDirection(next.direction);
    setLoop(next.loop);

    if (selectedIsConnector) {
      const configKey = objectValue(selectedObject, 'teckstudioObjectType') === 'diagramConnectorPath'
        ? 'diagramConnectorConfig'
        : 'diagramArrowConfig';
      const currentConfig = (objectValue(selectedObject, configKey) || {}) as Record<string, unknown>;
      const currentAnimation = (currentConfig.animation || {}) as DiagramConnectorAnimationConfig;
      const connectorType = next.animationType === 'none' ? currentAnimation.type || 'moving-dashes' : next.animationType;
      const connectorAnimation: DiagramConnectorAnimationConfig = {
        ...currentAnimation,
        enabled: next.animationType !== 'none',
        type: connectorType as DiagramConnectorAnimationConfig['type'],
        direction: next.direction,
        duration: Math.max(100, next.durationMs),
        delay: Math.max(0, next.startMs),
        startDelay: Math.max(0, next.delayMs),
        easing: next.easing,
        loop: next.loop,
      };
      selectedObject.set({
        [configKey]: {
          ...currentConfig,
          animation: connectorAnimation,
        },
      } as Record<string, unknown>);
    } else if (next.animationType === 'none') {
      selectedObject.set({
        objectAnimations: [],
        animationConfig: { format: 'fabric-keyframe', animationType: 'none' },
      } as Record<string, unknown>);
    } else {
      const persisted = {
        id: crypto.randomUUID(),
        type: next.animationType as FabricObjectAnimationType,
        startMs: Math.max(0, next.startMs),
        durationMs: Math.max(100, next.durationMs),
        delayMs: Math.max(0, next.delayMs),
        easing: next.easing,
        loop: next.loop,
      };
      selectedObject.set({
        objectAnimations: [persisted],
        animationConfig: {
          format: 'fabric-keyframe',
          animationType: persisted.type,
          startMs: persisted.startMs,
          durationMs: persisted.durationMs,
          delayMs: persisted.delayMs,
          easing: persisted.easing,
          loop: persisted.loop,
        },
      } as Record<string, unknown>);
    }
    selectedObject.setCoords();
    canvas.requestRenderAll();
    saveHistory();
  };

  /* ------------------------------------------------------------------ */
  /*  Helper – wraps fabric.util.animate with a promise so we can chain  */
  /* ------------------------------------------------------------------ */
  const anim = (opts: {
    startValue: number;
    endValue: number;
    duration: number;
    onChange: (v: number) => void;
    onComplete?: () => void;
  }) =>
    new Promise<void>((resolve) => {
      fabric.util.animate({
        startValue: opts.startValue,
        endValue: opts.endValue,
        duration: opts.duration,
        easing: fabric.util.ease.easeOutCubic,
        onChange: (value: number) => {
          opts.onChange(value);
          canvas.renderAll();
        },
        onComplete: () => {
          opts.onComplete?.();
          canvas.renderAll();
          resolve();
        },
      });
    });

  /* ------------------------------------------------------------------ */
  /*  Animation definitions                                              */
  /* ------------------------------------------------------------------ */
  const animations: AnimationDef[] = [
    /* 1 – Fade In */
    {
      label: 'Fade In',
      icon: <Eye size={18} />,
      run: async (obj) => {
        const origOpacity = obj.get('opacity') ?? 1;
        obj.set('opacity', 0);
        canvas.renderAll();
        await anim({
          startValue: 0,
          endValue: origOpacity,
          duration: 800,
          onChange: (v) => obj.set('opacity', v),
          onComplete: () => obj.set('opacity', origOpacity),
        });
      },
    },

    /* 2 – Fade Out */
    {
      label: 'Fade Out',
      icon: <EyeOff size={18} />,
      run: async (obj) => {
        const origOpacity = obj.get('opacity') ?? 1;
        await anim({
          startValue: origOpacity,
          endValue: 0,
          duration: 400,
          onChange: (v) => obj.set('opacity', v),
        });
        await anim({
          startValue: 0,
          endValue: origOpacity,
          duration: 400,
          onChange: (v) => obj.set('opacity', v),
          onComplete: () => obj.set('opacity', origOpacity),
        });
      },
    },

    /* 3 – Slide Left */
    {
      label: 'Slide Left',
      icon: <ArrowLeft size={18} />,
      run: async (obj) => {
        const origLeft = obj.get('left') ?? 0;
        obj.set('left', -200);
        canvas.renderAll();
        await anim({
          startValue: -200,
          endValue: origLeft,
          duration: 600,
          onChange: (v) => obj.set('left', v),
          onComplete: () => obj.set('left', origLeft),
        });
      },
    },

    /* 4 – Slide Right */
    {
      label: 'Slide Right',
      icon: <ArrowRight size={18} />,
      run: async (obj) => {
        const origLeft = obj.get('left') ?? 0;
        const canvasRight = canvas.getWidth();
        obj.set('left', canvasRight);
        canvas.renderAll();
        await anim({
          startValue: canvasRight,
          endValue: origLeft,
          duration: 600,
          onChange: (v) => obj.set('left', v),
          onComplete: () => obj.set('left', origLeft),
        });
      },
    },

    /* 5 – Bounce */
    {
      label: 'Bounce',
      icon: <ArrowUpDown size={18} />,
      run: async (obj) => {
        const origTop = obj.get('top') ?? 0;
        for (let i = 0; i < 3; i++) {
          await anim({
            startValue: origTop,
            endValue: origTop - 50,
            duration: 1000 / 6,
            onChange: (v) => obj.set('top', v),
          });
          await anim({
            startValue: origTop - 50,
            endValue: origTop,
            duration: 1000 / 6,
            onChange: (v) => obj.set('top', v),
          });
        }
        obj.set('top', origTop);
        canvas.renderAll();
      },
    },

    /* 6 – Zoom In */
    {
      label: 'Zoom In',
      icon: <ZoomIn size={18} />,
      run: async (obj) => {
        const origScaleX = obj.get('scaleX') ?? 1;
        const origScaleY = obj.get('scaleY') ?? 1;
        obj.set({ scaleX: 0.1, scaleY: 0.1 });
        canvas.renderAll();
        await Promise.all([
          anim({
            startValue: 0.1,
            endValue: origScaleX,
            duration: 600,
            onChange: (v) => obj.set('scaleX', v),
          }),
          anim({
            startValue: 0.1,
            endValue: origScaleY,
            duration: 600,
            onChange: (v) => obj.set('scaleY', v),
          }),
        ]);
        obj.set({ scaleX: origScaleX, scaleY: origScaleY });
        canvas.renderAll();
      },
    },

    /* 7 – Rotate 360 */
    {
      label: 'Rotate 360',
      icon: <RotateCw size={18} />,
      run: async (obj) => {
        const origAngle = obj.get('angle') ?? 0;
        await anim({
          startValue: origAngle,
          endValue: origAngle + 360,
          duration: 800,
          onChange: (v) => obj.set('angle', v),
          onComplete: () => obj.set('angle', origAngle),
        });
      },
    },

    /* 8 – Pulse */
    {
      label: 'Pulse',
      icon: <Expand size={18} />,
      run: async (obj) => {
        const origScaleX = obj.get('scaleX') ?? 1;
        const origScaleY = obj.get('scaleY') ?? 1;
        for (let i = 0; i < 2; i++) {
          await Promise.all([
            anim({
              startValue: origScaleX,
              endValue: origScaleX * 1.15,
              duration: 250,
              onChange: (v) => obj.set('scaleX', v),
            }),
            anim({
              startValue: origScaleY,
              endValue: origScaleY * 1.15,
              duration: 250,
              onChange: (v) => obj.set('scaleY', v),
            }),
          ]);
          await Promise.all([
            anim({
              startValue: origScaleX * 1.15,
              endValue: origScaleX,
              duration: 250,
              onChange: (v) => obj.set('scaleX', v),
            }),
            anim({
              startValue: origScaleY * 1.15,
              endValue: origScaleY,
              duration: 250,
              onChange: (v) => obj.set('scaleY', v),
            }),
          ]);
        }
        obj.set({ scaleX: origScaleX, scaleY: origScaleY });
        canvas.renderAll();
      },
    },

    /* 9 – Shake */
    {
      label: 'Shake',
      icon: <ShieldAlert size={18} />,
      run: async (obj) => {
        const origLeft = obj.get('left') ?? 0;
        const step = 500 / 10; // 5 cycles, each = left + right = 2 steps
        for (let i = 0; i < 5; i++) {
          await anim({
            startValue: origLeft,
            endValue: origLeft + 10,
            duration: step,
            onChange: (v) => obj.set('left', v),
          });
          await anim({
            startValue: origLeft + 10,
            endValue: origLeft - 10,
            duration: step,
            onChange: (v) => obj.set('left', v),
          });
        }
        obj.set('left', origLeft);
        canvas.renderAll();
      },
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  Handler                                                            */
  /* ------------------------------------------------------------------ */
  const handleAnimate = async (def: AnimationDef) => {
    if (isAnimating || !selectedObject || !canvas) return;
    setIsAnimating(true);
    try {
      await def.run(selectedObject, canvas);
    } finally {
      (selectedObject as any).setCoords?.();
      canvas.renderAll();
      setIsAnimating(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div
      style={{
        background: 'rgba(24, 24, 27, 0.6)',
        border: '1px solid rgb(39, 39, 42)',
        borderRadius: '0.75rem',
        padding: '12px',
      }}
    >
      <h3
        style={{
          margin: '0 0 10px 0',
          fontSize: '13px',
          fontWeight: 600,
          color: '#d4d4d8',
          letterSpacing: '0.02em',
        }}
      >
        Animations
      </h3>

      <div className="mb-3 rounded-xl border border-white/[0.08] bg-zinc-950/60 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          Timeline Animation Settings
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <label className="flex flex-col gap-1 text-zinc-500">
            Animation Type
            <select
              value={animationType}
              onChange={(event) => commitTimelineAnimation({ animationType: event.target.value })}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-200 outline-none focus:border-violet-500"
            >
              {(selectedIsConnector ? CONNECTOR_ANIMATION_OPTIONS : OBJECT_ANIMATION_OPTIONS).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-zinc-500">
            Start Time (ms)
            <input type="number" min={0} step={100} value={startMs} onChange={(event) => commitTimelineAnimation({ startMs: Number(event.target.value) || 0 })} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-200 outline-none focus:border-violet-500" />
          </label>
          <label className="flex flex-col gap-1 text-zinc-500">
            Duration (ms)
            <input type="number" min={100} step={100} value={durationMs} onChange={(event) => commitTimelineAnimation({ durationMs: Number(event.target.value) || 800 })} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-200 outline-none focus:border-violet-500" />
          </label>
          <label className="flex flex-col gap-1 text-zinc-500">
            Delay (ms)
            <input type="number" min={0} step={100} value={delayMs} onChange={(event) => commitTimelineAnimation({ delayMs: Number(event.target.value) || 0 })} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-200 outline-none focus:border-violet-500" />
          </label>
          <label className="flex flex-col gap-1 text-zinc-500">
            Easing
            <select value={easing} onChange={(event) => commitTimelineAnimation({ easing: event.target.value as typeof EASING_OPTIONS[number] })} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-200 outline-none focus:border-violet-500">
              {EASING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          {selectedIsConnector && (
            <label className="flex flex-col gap-1 text-zinc-500">
              Direction
              <select value={direction} onChange={(event) => commitTimelineAnimation({ direction: event.target.value as DiagramConnectorAnimationDirection })} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-200 outline-none focus:border-violet-500">
                {CONNECTOR_DIRECTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-zinc-400">
          <input type="checkbox" checked={loop} onChange={(event) => commitTimelineAnimation({ loop: event.target.checked })} className="accent-violet-500" />
          Loop On/Off
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '6px',
        }}
      >
        {animations.map((def) => (
          <button
            key={def.label}
            disabled={isAnimating}
            onClick={() => handleAnimate(def)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '10px 4px',
              background: 'rgba(24, 24, 27, 0.6)',
              border: '1px solid rgb(39, 39, 42)',
              borderRadius: '0.75rem',
              color: '#a1a1aa',
              fontSize: '11px',
              cursor: isAnimating ? 'not-allowed' : 'pointer',
              opacity: isAnimating ? 0.5 : 1,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isAnimating) {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  'rgba(139,92,246,0.5)';
                (e.currentTarget as HTMLButtonElement).style.color = '#e4e4e7';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'rgb(39,39,42)';
              (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa';
            }}
          >
            {def.icon}
            <span>{def.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
