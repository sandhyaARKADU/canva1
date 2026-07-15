import React, { useState } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/useEditorStore';
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

export const AnimationPanel: React.FC = () => {
  const { canvas, selectedObject } = useEditorStore();
  const [isAnimating, setIsAnimating] = useState(false);

  if (!canvas || !selectedObject) return null;

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
