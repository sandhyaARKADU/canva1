import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  FlipHorizontal2,
  FlipVertical2,
} from 'lucide-react';

const CANVAS_SIZE = 800;

interface AlignAction {
  title: string;
  icon: React.ReactNode;
  action: (obj: any, canvas: any) => void;
}

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  background: 'rgb(24, 24, 27)',
  border: '1px solid rgb(39, 39, 42)',
  borderRadius: '0.5rem',
  color: '#a1a1aa',
  cursor: 'pointer',
  padding: 0,
  transition: 'background 0.15s, color 0.15s',
};

const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
  (e.currentTarget as HTMLButtonElement).style.background = 'rgb(39, 39, 42)';
  (e.currentTarget as HTMLButtonElement).style.color = '#e4e4e7';
};

const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  (e.currentTarget as HTMLButtonElement).style.background = 'rgb(24, 24, 27)';
  (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa';
};

export const AlignmentTools: React.FC = () => {
  const { canvas, selectedObject, saveHistory } = useEditorStore();

  if (!canvas || !selectedObject) return null;

  const obj = selectedObject as any;

  /* ---- alignment actions ---- */
  const alignActions: AlignAction[] = [
    {
      title: 'Align Left',
      icon: <AlignStartVertical size={16} />,
      action: (o) => {
        o.set('left', 0);
      },
    },
    {
      title: 'Align Center H',
      icon: <AlignCenterVertical size={16} />,
      action: (o) => {
        const w = o.getScaledWidth();
        o.set('left', (CANVAS_SIZE - w) / 2);
      },
    },
    {
      title: 'Align Right',
      icon: <AlignEndVertical size={16} />,
      action: (o) => {
        const w = o.getScaledWidth();
        o.set('left', CANVAS_SIZE - w);
      },
    },
    {
      title: 'Align Top',
      icon: <AlignStartHorizontal size={16} />,
      action: (o) => {
        o.set('top', 0);
      },
    },
    {
      title: 'Align Middle V',
      icon: <AlignCenterHorizontal size={16} />,
      action: (o) => {
        const h = o.getScaledHeight();
        o.set('top', (CANVAS_SIZE - h) / 2);
      },
    },
    {
      title: 'Align Bottom',
      icon: <AlignEndHorizontal size={16} />,
      action: (o) => {
        const h = o.getScaledHeight();
        o.set('top', CANVAS_SIZE - h);
      },
    },
  ];

  const flipActions: AlignAction[] = [
    {
      title: 'Flip Horizontal',
      icon: <FlipHorizontal2 size={16} />,
      action: (o) => {
        o.set('flipX', !o.get('flipX'));
      },
    },
    {
      title: 'Flip Vertical',
      icon: <FlipVertical2 size={16} />,
      action: (o) => {
        o.set('flipY', !o.get('flipY'));
      },
    },
  ];

  const handleAction = (act: AlignAction) => {
    act.action(obj, canvas);
    obj.setCoords();
    canvas.renderAll();
    saveHistory();
  };

  /* ---- render ---- */
  return (
    <div>
      {/* Alignment buttons – two rows of 3 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '6px',
          justifyItems: 'center',
        }}
      >
        {alignActions.map((a) => (
          <button
            key={a.title}
            title={a.title}
            onClick={() => handleAction(a)}
            style={btnStyle}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            {a.icon}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'rgb(39, 39, 42)',
          margin: '10px 0',
        }}
      />

      {/* Flip buttons */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {flipActions.map((a) => (
          <button
            key={a.title}
            title={a.title}
            onClick={() => handleAction(a)}
            style={btnStyle}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            {a.icon}
          </button>
        ))}
      </div>
    </div>
  );
};
