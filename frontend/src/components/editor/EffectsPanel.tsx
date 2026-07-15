import React, { useEffect, useMemo, useState } from 'react';
import { fabric } from 'fabric';
import { Sparkles, Sun, Contrast, Droplets, Waves, FlipHorizontal, RotateCw, Image as ImageIcon } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';

type EffectState = {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  hue: number;
};

const DEFAULT_EFFECTS: EffectState = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  hue: 0,
};

const FILTER_PRESETS: Array<EffectState & { name: string }> = [
  { name: 'None', ...DEFAULT_EFFECTS },
  { name: 'Vintage', brightness: 110, contrast: 90, saturate: 80, blur: 0, hue: 15 },
  { name: 'Dramatic', brightness: 90, contrast: 130, saturate: 110, blur: 0, hue: 0 },
  { name: 'B&W', brightness: 100, contrast: 110, saturate: 0, blur: 0, hue: 0 },
  { name: 'Warm', brightness: 105, contrast: 100, saturate: 120, blur: 0, hue: 20 },
  { name: 'Cool', brightness: 100, contrast: 105, saturate: 90, blur: 0, hue: -20 },
  { name: 'Fade', brightness: 115, contrast: 85, saturate: 70, blur: 0, hue: 0 },
  { name: 'Vivid', brightness: 105, contrast: 115, saturate: 150, blur: 0, hue: 0 },
  { name: 'Noir', brightness: 80, contrast: 140, saturate: 0, blur: 0, hue: 0 },
  { name: 'Sepia', brightness: 100, contrast: 95, saturate: 50, blur: 0, hue: 30 },
  { name: 'Dreamy', brightness: 110, contrast: 90, saturate: 110, blur: 1, hue: 10 },
  { name: 'Grunge', brightness: 85, contrast: 125, saturate: 60, blur: 0, hue: -10 },
];

const getObjectEffects = (obj: fabric.Object | null): EffectState => {
  const saved = obj?.get('teckstudioEffects' as any) as Partial<EffectState> | undefined;
  return { ...DEFAULT_EFFECTS, ...(saved || {}) };
};

const buildImageFilters = (effects: EffectState): fabric.IBaseFilter[] => {
  const filters: fabric.IBaseFilter[] = [];
  const imageFilters = fabric.Image.filters as any;

  const brightness = (effects.brightness - 100) / 100;
  const contrast = (effects.contrast - 100) / 100;
  const saturation = (effects.saturate - 100) / 100;
  const blur = effects.blur / 10;

  if (brightness !== 0) filters.push(new imageFilters.Brightness({ brightness }));
  if (contrast !== 0) filters.push(new imageFilters.Contrast({ contrast }));
  if (saturation !== 0) filters.push(new imageFilters.Saturation({ saturation }));
  if (blur > 0) filters.push(new imageFilters.Blur({ blur }));
  if (effects.hue !== 0 && imageFilters.HueRotation) {
    filters.push(new imageFilters.HueRotation({ rotation: effects.hue / 180 }));
  }

  return filters;
};

export const EffectsPanel: React.FC = () => {
  const { canvas, selectedObject, saveHistory } = useEditorStore();
  const [effects, setEffects] = useState<EffectState>(DEFAULT_EFFECTS);

  const isImage = selectedObject?.type === 'image';
  const hasSelection = Boolean(selectedObject);

  useEffect(() => {
    setEffects(getObjectEffects(selectedObject));
  }, [selectedObject]);

  const activePresetName = useMemo(() => {
    const preset = FILTER_PRESETS.find((item) =>
      item.brightness === effects.brightness &&
      item.contrast === effects.contrast &&
      item.saturate === effects.saturate &&
      item.blur === effects.blur &&
      item.hue === effects.hue,
    );
    return preset?.name || '';
  }, [effects]);

  const applyEffects = (nextEffects: EffectState, persistHistory = true) => {
    if (!canvas || !selectedObject) return;

    selectedObject.set({ teckstudioEffects: nextEffects } as any);

    if (selectedObject.type === 'image') {
      const image = selectedObject as fabric.Image;
      image.filters = buildImageFilters(nextEffects);
      image.applyFilters();
    }

    selectedObject.setCoords();
    canvas.requestRenderAll();
    if (persistHistory) saveHistory();
  };

  const updateEffect = (key: keyof EffectState, value: number) => {
    const nextEffects = { ...effects, [key]: value };
    setEffects(nextEffects);
    applyEffects(nextEffects);
  };

  const applyPreset = (preset: EffectState) => {
    const nextEffects = {
      brightness: preset.brightness,
      contrast: preset.contrast,
      saturate: preset.saturate,
      blur: preset.blur,
      hue: preset.hue,
    };
    setEffects(nextEffects);
    applyEffects(nextEffects);
  };

  const handleFlip = (direction: 'horizontal' | 'vertical') => {
    if (!canvas || !selectedObject) return;

    if (direction === 'horizontal') {
      selectedObject.set('flipX', !selectedObject.flipX);
    } else {
      selectedObject.set('flipY', !selectedObject.flipY);
    }
    selectedObject.setCoords();
    canvas.requestRenderAll();
    saveHistory();
  };

  const handleRotate = (degrees: number) => {
    if (!canvas || !selectedObject) return;

    selectedObject.rotate(((selectedObject.angle || 0) + degrees) % 360);
    selectedObject.setCoords();
    canvas.requestRenderAll();
    saveHistory();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-fuchsia-400" />
        <span className="text-xs font-semibold text-zinc-400">Effects & Filters</span>
      </div>

      {!hasSelection && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-center">
          <ImageIcon className="mx-auto mb-2 h-7 w-7 text-zinc-600" />
          <p className="text-xs font-semibold text-zinc-300">Select an object first</p>
          <p className="mt-1 text-[10px] text-zinc-500">Image filters, flip, and rotate apply to the selected canvas layer.</p>
        </div>
      )}

      <div className={!hasSelection ? 'pointer-events-none opacity-40' : 'flex flex-col gap-4'}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Quick Presets</span>
            {!isImage && <span className="text-[9px] text-zinc-600">Select image for filters</span>}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                disabled={!isImage}
                className={`rounded-lg border px-2 py-1.5 text-[9px] font-semibold transition-colors ${
                  activePresetName === preset.name
                    ? 'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-fuchsia-500/40 hover:text-fuchsia-400'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <FilterSlider label="Brightness" icon={<Sun className="w-3 h-3" />} value={effects.brightness} onChange={(v) => updateEffect('brightness', v)} min={0} max={200} disabled={!isImage} />
          <FilterSlider label="Contrast" icon={<Contrast className="w-3 h-3" />} value={effects.contrast} onChange={(v) => updateEffect('contrast', v)} min={0} max={200} disabled={!isImage} />
          <FilterSlider label="Saturation" icon={<Droplets className="w-3 h-3" />} value={effects.saturate} onChange={(v) => updateEffect('saturate', v)} min={0} max={200} disabled={!isImage} />
          <FilterSlider label="Blur" icon={<Waves className="w-3 h-3" />} value={effects.blur} onChange={(v) => updateEffect('blur', v)} min={0} max={10} step={0.5} disabled={!isImage} />
          <FilterSlider label="Hue" icon={<RotateCw className="w-3 h-3" />} value={effects.hue} onChange={(v) => updateEffect('hue', v)} min={-180} max={180} disabled={!isImage} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleFlip('horizontal')}
            disabled={!hasSelection}
            className="flex items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 py-2 text-[10px] text-zinc-400 transition-colors hover:border-fuchsia-500/40 hover:text-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FlipHorizontal className="w-3 h-3" /> Flip H
          </button>
          <button
            onClick={() => handleFlip('vertical')}
            disabled={!hasSelection}
            className="flex items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 py-2 text-[10px] text-zinc-400 transition-colors hover:border-fuchsia-500/40 hover:text-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FlipHorizontal className="w-3 h-3 rotate-90" /> Flip V
          </button>
          <button
            onClick={() => handleRotate(45)}
            disabled={!hasSelection}
            className="flex items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 py-2 text-[10px] text-zinc-400 transition-colors hover:border-fuchsia-500/40 hover:text-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCw className="w-3 h-3" /> Rotate
          </button>
        </div>

        <button
          onClick={() => applyPreset(DEFAULT_EFFECTS)}
          disabled={!isImage}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 py-2 text-[10px] font-semibold text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset Image Filters
        </button>
      </div>
    </div>
  );
};

const FilterSlider: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
}> = ({ label, icon, value, onChange, min, max, step = 1, disabled = false }) => (
  <div className="flex items-center gap-2">
    <span className="w-3 text-zinc-500">{icon}</span>
    <span className="w-16 text-[9px] text-zinc-500">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(parseFloat(event.target.value))}
      className="h-1 flex-1 cursor-pointer rounded-full bg-zinc-800 accent-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
    />
    <span className="w-9 text-right font-mono text-[9px] text-zinc-400">{value}</span>
  </div>
);
