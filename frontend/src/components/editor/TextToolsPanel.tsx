import React, { useState } from 'react';
import { fabric } from 'fabric';
import { Palette, Sparkles, Type } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';
import { hasPartialTextSelection, transformTextCase } from '../../utils/textSelectionStyles';
import { applyTextEffect } from '../../utils/textEffects';
import { FontBrowserPanel } from './FontBrowserPanel';
import { TextEffectsPanel } from './TextEffectsPanel';

type TextPreset = {
  id: string;
  name: string;
  preview: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  fill: string;
  textAlign: fabric.Textbox['textAlign'];
  charSpacing?: number;
  lineHeight?: number;
  stroke?: string;
  strokeWidth?: number;
  shadow?: fabric.IShadowOptions;
  gradient?: string[];
};

const TEXT_PRESETS: TextPreset[] = [
  { id: 'modern-heading', name: 'Modern Heading', preview: 'Modern', text: 'Modern Heading', fontFamily: 'Outfit', fontSize: 72, fontWeight: 800, fill: '#ffffff', textAlign: 'center', charSpacing: 10, lineHeight: 1.05 },
  { id: 'bold-poster-title', name: 'Bold Poster Title', preview: 'POSTER', text: 'BOLD POSTER TITLE', fontFamily: 'Outfit', fontSize: 82, fontWeight: 900, fill: '#f8fafc', textAlign: 'center', charSpacing: 35, lineHeight: 0.95, stroke: '#111827', strokeWidth: 2 },
  { id: 'gradient-ai', name: 'Gradient AI', preview: 'AI', text: 'Gradient AI', fontFamily: 'Outfit', fontSize: 78, fontWeight: 900, fill: '#8b5cf6', textAlign: 'center', gradient: ['#8b5cf6', '#06b6d4'], shadow: { color: 'rgba(139,92,246,0.35)', blur: 18, offsetX: 0, offsetY: 8 } },
  { id: 'gold-luxury', name: 'Gold Luxury', preview: 'Luxury', text: 'Gold Luxury', fontFamily: 'Georgia', fontSize: 68, fontWeight: 700, fill: '#f59e0b', textAlign: 'center', gradient: ['#fef3c7', '#f59e0b', '#92400e'], charSpacing: 18 },
  { id: 'retro-outline', name: 'Retro Outline', preview: 'Retro', text: 'Retro Outline', fontFamily: 'Outfit', fontSize: 70, fontWeight: 900, fill: '#f97316', textAlign: 'center', stroke: '#111827', strokeWidth: 4, shadow: { color: '#facc15', blur: 0, offsetX: 6, offsetY: 6 } },
  { id: 'soft-shadow', name: 'Soft Shadow', preview: 'Soft', text: 'Soft Shadow', fontFamily: 'Inter', fontSize: 58, fontWeight: 700, fill: '#ffffff', textAlign: 'center', shadow: { color: 'rgba(0,0,0,0.35)', blur: 22, offsetX: 0, offsetY: 12 } },
  { id: 'corporate-heading', name: 'Corporate Heading', preview: 'Business', text: 'Corporate Heading', fontFamily: 'Inter', fontSize: 54, fontWeight: 800, fill: '#0f172a', textAlign: 'left', lineHeight: 1.15 },
  { id: 'sale-poster', name: 'Sale Poster', preview: 'SALE', text: 'SALE 50% OFF', fontFamily: 'Outfit', fontSize: 78, fontWeight: 900, fill: '#ef4444', textAlign: 'center', charSpacing: 20, stroke: '#ffffff', strokeWidth: 3 },
  { id: 'gold-highlight', name: 'Gold Highlight', preview: 'Gold', text: 'Gold Highlight', fontFamily: 'Playfair Display', fontSize: 62, fontWeight: 800, fill: '#fbbf24', textAlign: 'center', charSpacing: 8 },
  { id: 'technical-label', name: 'Technical Label', preview: 'Label', text: 'Technical Label', fontFamily: 'Courier New', fontSize: 28, fontWeight: 700, fill: '#67e8f9', textAlign: 'left', charSpacing: 40 },
];

const GRADIENTS = [
  { id: 'purple-blue', name: 'Purple → Blue', colors: ['#8b5cf6', '#3b82f6'] },
  { id: 'pink-orange', name: 'Pink → Orange', colors: ['#ec4899', '#f97316'] },
  { id: 'cyan-blue', name: 'Cyan → Blue', colors: ['#06b6d4', '#2563eb'] },
  { id: 'green-teal', name: 'Green → Teal', colors: ['#22c55e', '#14b8a6'] },
  { id: 'gold-orange', name: 'Gold → Orange', colors: ['#fbbf24', '#f97316'] },
  { id: 'rainbow', name: 'Rainbow', colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'] },
];

const SOLID_COLORS = ['#ffffff', '#18181b', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

const isTextObject = (object: fabric.Object | null): object is fabric.Textbox => Boolean(object && ['text', 'i-text', 'textbox'].includes(object.type || ''));

const createTextGradient = (object: fabric.Textbox, colors: string[]) => new fabric.Gradient({
  type: 'linear',
  coords: {
    x1: 0,
    y1: 0,
    x2: object.width || 450,
    y2: 0,
  },
  colorStops: colors.map((color, index) => ({
    offset: colors.length === 1 ? 0 : index / (colors.length - 1),
    color,
  })),
});

export const TextToolsPanel: React.FC = () => {
  const {
    canvas,
    selectedObject,
    saveHistory,
    setFillColor,
    captureTextSelection,
    applyTextSelectionStyles,
    textSelectionRange,
  } = useEditorStore();
  const [message, setMessage] = useState('');

  const hasRange = isTextObject(selectedObject) && hasPartialTextSelection(selectedObject, textSelectionRange);

  const preserveSelection = (event?: React.MouseEvent<HTMLElement>) => {
    if (event && isTextObject(selectedObject)) event.preventDefault();
    captureTextSelection();
  };

  const applyPresetToSelectedText = (preset: TextPreset) => {
    if (!isTextObject(selectedObject)) return false;
    const partial = hasPartialTextSelection(selectedObject, textSelectionRange);
    const styles: Record<string, unknown> = {
      fontFamily: preset.fontFamily,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      fill: preset.gradient ? preset.gradient[0] : preset.fill,
      charSpacing: preset.charSpacing || 0,
      lineHeight: preset.lineHeight || 1.1,
      stroke: preset.stroke || '',
      strokeWidth: preset.strokeWidth || 0,
    };
    if (!partial) styles.textAlign = preset.textAlign;
    return applyTextSelectionStyles(styles);
  };

  const addTextPreset = (preset: TextPreset) => {
    if (!canvas) return;
    if (applyPresetToSelectedText(preset)) {
      setMessage(hasRange ? 'Preset applied to selected text.' : 'Preset applied to text box.');
      return;
    }

    const textbox = new fabric.Textbox(preset.text, {
      width: 560,
      fontFamily: preset.fontFamily,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      fill: preset.fill,
      textAlign: preset.textAlign,
      charSpacing: preset.charSpacing || 0,
      lineHeight: preset.lineHeight || 1.1,
      stroke: preset.stroke,
      strokeWidth: preset.strokeWidth || 0,
      shadow: preset.shadow ? new fabric.Shadow(preset.shadow) : undefined,
      left: canvas.getWidth() / 2 - 280,
      top: canvas.getHeight() / 2 - preset.fontSize / 2,
      name: `Text — ${preset.name}`,
      id: crypto.randomUUID(),
      objectType: 'text',
      textRole: 'heading',
      stylePresetId: preset.id,
    } as fabric.ITextboxOptions & Record<string, unknown>);

    if (preset.gradient) textbox.set('fill', createTextGradient(textbox, preset.gradient));
    canvas.add(textbox);
    canvas.setActiveObject(textbox);
    canvas.renderAll();
    saveHistory();
    setMessage('Text preset added.');
  };

  const applyGradient = (colors: string[]) => {
    if (isTextObject(selectedObject) && hasPartialTextSelection(selectedObject, textSelectionRange)) {
      applyTextSelectionStyles({ fill: colors[0] });
      setMessage('Applied the first gradient colour to the selected text range.');
      return;
    }
    if (!canvas || !isTextObject(selectedObject)) {
      setMessage('Select a text layer first.');
      return;
    }
    void applyTextEffect(canvas, selectedObject, { type: 'gradient', settings: { colors, angle: 0 } })
      .then(() => {
        saveHistory();
        setMessage('Gradient text effect applied.');
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to apply gradient.'));
  };

  const applyCase = (mode: 'upper' | 'lower' | 'capitalize') => {
    const result = transformTextCase(canvas, selectedObject, mode, textSelectionRange);
    if (result.applied) {
      saveHistory();
      setMessage('Text case updated.');
    } else {
      setMessage('Select a text layer first.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        {TEXT_PRESETS.slice(0, 3).map((preset) => (
          <button
            key={preset.id}
            type="button"
            onMouseDown={preserveSelection}
            onClick={() => addTextPreset(preset)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition hover:border-violet-500/50 hover:bg-zinc-800/40"
          >
            <span className="block text-xl font-black leading-none text-white">{preset.preview}</span>
            <span className="mt-1 block text-[10px] text-zinc-500">{preset.name}</span>
          </button>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <Type className="h-3.5 w-3.5" /> Text Presets
        </div>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_PRESETS.slice(3).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onMouseDown={preserveSelection}
              onClick={() => addTextPreset(preset)}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-left transition hover:border-violet-500/50"
            >
              <span className="block truncate text-sm font-black text-zinc-100">{preset.preview}</span>
              <span className="mt-1 block truncate text-[9px] text-zinc-500">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {message && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">{message}</div>}
      <FontBrowserPanel />
      {isTextObject(selectedObject) && (
        <div className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${hasRange ? 'border-violet-400/30 bg-violet-500/10 text-violet-100' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400'}`}>
          {hasRange ? 'Styling selected text' : 'Styling entire text box'}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <Palette className="h-3.5 w-3.5" /> Solid Colour
        </div>
        <div className="grid grid-cols-10 gap-1.5">
          {SOLID_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onMouseDown={preserveSelection}
              onClick={() => setFillColor(color)}
              className="h-6 rounded-md border border-zinc-800 transition hover:scale-110"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <Sparkles className="h-3.5 w-3.5" /> Gradient Text
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GRADIENTS.map((gradient) => (
            <button
              key={gradient.id}
              type="button"
              onMouseDown={preserveSelection}
              onClick={() => applyGradient(gradient.colors)}
              className="rounded-xl border border-zinc-800 p-3 text-left text-[10px] font-bold text-white transition hover:border-violet-500/50"
              style={{ background: `linear-gradient(135deg, ${gradient.colors.join(', ')})` }}
            >
              {gradient.name}
            </button>
          ))}
        </div>
      </div>

      <TextEffectsPanel />

      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Text Case</div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onMouseDown={preserveSelection} onClick={() => applyCase('upper')} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-[10px] font-bold text-zinc-300">UPPER</button>
          <button type="button" onMouseDown={preserveSelection} onClick={() => applyCase('lower')} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-[10px] font-bold text-zinc-300">lower</button>
          <button type="button" onMouseDown={preserveSelection} onClick={() => applyCase('capitalize')} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-[10px] font-bold text-zinc-300">Title</button>
        </div>
      </div>
    </div>
  );
};
