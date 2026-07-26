import React from 'react';
import { fabric } from 'fabric';
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
  Crosshair,
} from 'lucide-react';
import type { PageAlignment } from '../../utils/textSelectionStyles';
import { alignObjectToPage } from '../../utils/textSelectionStyles';

interface AlignAction {
  title: string;
  icon: React.ReactNode;
  alignment?: PageAlignment;
  action?: (obj: fabric.Object) => void;
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
  e.currentTarget.style.background = 'rgb(39, 39, 42)';
  e.currentTarget.style.color = '#e4e4e7';
};

const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'rgb(24, 24, 27)';
  e.currentTarget.style.color = '#a1a1aa';
};

export const AlignmentTools: React.FC = () => {
  const { canvas, selectedObject, saveHistory } = useEditorStore();
  const [pageMargin, setPageMargin] = React.useState(0);

  if (!canvas || !selectedObject) return null;

  const alignActions: AlignAction[] = [
    { title: 'Align Left to Page', icon: <AlignStartVertical size={16} />, alignment: 'left' },
    { title: 'Align Horizontal Center', icon: <AlignCenterVertical size={16} />, alignment: 'center-horizontal' },
    { title: 'Align Right to Page', icon: <AlignEndVertical size={16} />, alignment: 'right' },
    { title: 'Align Top to Page', icon: <AlignStartHorizontal size={16} />, alignment: 'top' },
    { title: 'Align Vertical Center', icon: <AlignCenterHorizontal size={16} />, alignment: 'center-vertical' },
    { title: 'Align Bottom to Page', icon: <AlignEndHorizontal size={16} />, alignment: 'bottom' },
    { title: 'Align to Page Center', icon: <Crosshair size={16} />, alignment: 'center' },
  ];

  const flipActions: AlignAction[] = [
    {
      title: 'Flip Horizontal',
      icon: <FlipHorizontal2 size={16} />,
      action: (obj) => obj.set('flipX', !obj.get('flipX')),
    },
    {
      title: 'Flip Vertical',
      icon: <FlipVertical2 size={16} />,
      action: (obj) => obj.set('flipY', !obj.get('flipY')),
    },
  ];

  const handleAction = (act: AlignAction) => {
    if (act.alignment) {
      alignObjectToPage(canvas, selectedObject, act.alignment, pageMargin);
    } else if (act.action) {
      act.action(selectedObject);
      selectedObject.setCoords();
      canvas.requestRenderAll();
    }
    saveHistory();
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Align to Page</span>
          <select
            value={pageMargin}
            onChange={(event) => setPageMargin(Number(event.target.value))}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 outline-none"
            title="Page margin"
          >
            <option value={0}>0px</option>
            <option value={16}>16px</option>
            <option value={24}>24px</option>
            <option value={32}>32px</option>
          </select>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px',
            justifyItems: 'center',
          }}
        >
          {alignActions.map((action) => (
            <button
              key={action.title}
              title={action.title}
              onClick={() => handleAction(action)}
              style={btnStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
            >
              {action.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-zinc-800" />

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Flip</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {flipActions.map((action) => (
            <button
              key={action.title}
              title={action.title}
              onClick={() => handleAction(action)}
              style={btnStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
            >
              {action.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
