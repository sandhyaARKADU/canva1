import React, { useState, useCallback } from 'react';
import {
  Download, FileImage, FileText, FileCode, Loader2,
  Settings, Check, AlertCircle, Layers,
} from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';

interface ExportSettings {
  format: 'png' | 'jpg' | 'svg' | 'pdf';
  quality: number;
  multiplier: number;
  dpi: number;
  backgroundColor: string;
  transparent: boolean;
  bleedMarks: boolean;
  watermark: boolean;
  watermarkText: string;
  watermarkOpacity: number;
}

const DPI_PRESETS = [
  { label: 'Web (72 DPI)', value: 72, multiplier: 1 },
  { label: 'Standard (150 DPI)', value: 150, multiplier: 2 },
  { label: 'Print (300 DPI)', value: 300, multiplier: 3 },
  { label: 'High-Res (600 DPI)', value: 600, multiplier: 6 },
];

const FORMAT_OPTIONS = [
  { format: 'png' as const, label: 'PNG', description: 'Best for web (Transparent)', icon: FileImage },
  { format: 'jpg' as const, label: 'JPG', description: 'Good for photos (White bg)', icon: FileImage },
  { format: 'svg' as const, label: 'SVG', description: 'Scalable vector graphics', icon: FileCode },
  { format: 'pdf' as const, label: 'PDF', description: 'Print-ready document', icon: FileText },
];

export const EnhancedExportPanel: React.FC = () => {
  const { canvas, projectName } = useEditorStore();
  const [settings, setSettings] = useState<ExportSettings>({
    format: 'png',
    quality: 0.95,
    multiplier: 2,
    dpi: 150,
    backgroundColor: '#ffffff',
    transparent: false,
    bleedMarks: false,
    watermark: false,
    watermarkText: 'TECKSTUDIO',
    watermarkOpacity: 15,
  });
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState('');

  const updateSetting = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleDpiChange = (dpi: number, multiplier: number) => {
    updateSetting('dpi', dpi);
    updateSetting('multiplier', multiplier);
  };

  const triggerDownload = useCallback((url: string, name: string) => {
    const link = document.createElement('a');
    link.download = name;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleExport = async () => {
    if (!canvas) return;
    setExporting(true);
    setError('');
    setExported(false);

    try {
      const activeObject = canvas.getActiveObject();
      canvas.discardActiveObject();

      // Wait a frame for the canvas to render without selection
      await new Promise((r) => setTimeout(r, 50));

      // Add bleed marks if enabled
      if (settings.bleedMarks) {
        drawBleedMarks(canvas);
      }

      // Add watermark if enabled
      if (settings.watermark) {
        drawWatermark(canvas, settings.watermarkText, settings.watermarkOpacity);
      }

      const fileName = `${projectName || 'design'}`;

      if (settings.format === 'png') {
        const dataURL = canvas.toDataURL({
          format: 'png',
          multiplier: settings.multiplier,
        });
        triggerDownload(dataURL, `${fileName}.png`);
      } else if (settings.format === 'jpg') {
        // Temporarily set background for JPG
        const oldBg = canvas.backgroundColor;
        canvas.setBackgroundColor(settings.backgroundColor, () => {});
        canvas.renderAll();

        const dataURL = canvas.toDataURL({
          format: 'jpeg',
          quality: settings.quality,
          multiplier: settings.multiplier,
        });
        triggerDownload(dataURL, `${fileName}.jpg`);

        // Restore original background
        canvas.setBackgroundColor(oldBg || '#ffffff', () => {});
        canvas.renderAll();
      } else if (settings.format === 'svg') {
        const svgContent = canvas.toSVG();
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${fileName}.svg`);
        URL.revokeObjectURL(url);
      } else if (settings.format === 'pdf') {
        // Use jsPDF for PDF export
        const { default: jsPDF } = await import('jspdf');
        const dataURL = canvas.toDataURL({
          format: 'png',
          multiplier: settings.multiplier,
        });
        const pdf = new jsPDF({
          orientation: canvas.getWidth() > canvas.getHeight() ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.getWidth(), canvas.getHeight()],
        });
        pdf.addImage(dataURL, 'PNG', 0, 0, canvas.getWidth(), canvas.getHeight());
        pdf.save(`${fileName}.pdf`);
      }

      // Remove bleed marks and watermark after export
      if (settings.bleedMarks || settings.watermark) {
        canvas.renderAll();
        // Reload to remove temporary objects
        const json = canvas.toJSON();
        canvas.loadFromJSON(json, () => {
          canvas.renderAll();
        });
      }

      // Restore selection
      if (activeObject) {
        canvas.setActiveObject(activeObject);
        canvas.renderAll();
      }

      setExported(true);
      setTimeout(() => setExported(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const drawBleedMarks = (c: fabric.Canvas) => {
    const bleed = 12;
    const w = c.getWidth();
    const h = c.getHeight();
    const markLen = 20;
    const strokeOpts = { stroke: '#000000', strokeWidth: 0.5, selectable: false, evented: false };

    // Corner marks
    const corners = [
      [bleed, bleed], [w - bleed, bleed],
      [bleed, h - bleed], [w - bleed, h - bleed],
    ];

    corners.forEach(([x, y]) => {
      // Horizontal mark
      c.add(new fabric.Line([x - markLen, y, x + markLen, y], strokeOpts));
      // Vertical mark
      c.add(new fabric.Line([x, y - markLen, x, y + markLen], strokeOpts));
    });
  };

  const drawWatermark = (c: fabric.Canvas, text: string, opacity: number) => {
    const w = c.getWidth();
    const h = c.getHeight();
    const watermarkText = new fabric.Text(text, {
      left: w / 2,
      top: h / 2,
      fontSize: Math.min(w, h) * 0.08,
      fontFamily: 'Inter',
      fontWeight: 'bold',
      fill: '#000000',
      opacity: opacity / 100,
      angle: -30,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });
    c.add(watermarkText);
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Download className="w-4 h-4 text-violet-400" />
        <span className="text-xs font-bold text-zinc-200">Enhanced Export</span>
      </div>

      {/* Format Selection */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2.5">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Format</p>
        <div className="grid grid-cols-2 gap-1.5">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.format}
                onClick={() => updateSetting('format', opt.format)}
                className={`flex items-center gap-2 p-2 rounded-lg border transition-colors text-left ${
                  settings.format === opt.format
                    ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                    : 'border-zinc-800 bg-zinc-900/30 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <div>
                  <p className="text-[10px] font-semibold">{opt.label}</p>
                  <p className="text-[8px] text-zinc-500">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* DPI / Quality */}
      {(settings.format === 'png' || settings.format === 'jpg') && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2.5">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Quality</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DPI_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handleDpiChange(preset.value, preset.multiplier)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  settings.dpi === preset.value
                    ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                    : 'border-zinc-800 bg-zinc-900/30 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <p className="text-[10px] font-semibold">{preset.label}</p>
              </button>
            ))}
          </div>

          {settings.format === 'jpg' && (
            <div className="mt-2">
              <label className="text-[10px] text-zinc-500">JPEG Quality: {Math.round(settings.quality * 100)}%</label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={settings.quality}
                onChange={(e) => updateSetting('quality', parseFloat(e.target.value))}
                className="w-full h-1 accent-violet-500 bg-zinc-800 rounded cursor-pointer mt-1"
              />
            </div>
          )}
        </div>
      )}

      {/* Options */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2.5">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Options</p>

        {settings.format === 'png' && (
          <label className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.transparent}
              onChange={(e) => updateSetting('transparent', e.target.checked)}
              className="accent-violet-500"
            />
            <span className="text-[10px] text-zinc-300">Transparent background</span>
          </label>
        )}

        {settings.format !== 'svg' && settings.format !== 'pdf' && (
          <>
            <label className="flex items-center gap-2 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.bleedMarks}
                onChange={(e) => updateSetting('bleedMarks', e.target.checked)}
                className="accent-violet-500"
              />
              <span className="text-[10px] text-zinc-300">Add crop/bleed marks</span>
            </label>

            <label className="flex items-center gap-2 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.watermark}
                onChange={(e) => updateSetting('watermark', e.target.checked)}
                className="accent-violet-500"
              />
              <span className="text-[10px] text-zinc-300">Add watermark</span>
            </label>

            {settings.watermark && (
              <div className="ml-5 space-y-1.5">
                <input
                  type="text"
                  value={settings.watermarkText}
                  onChange={(e) => updateSetting('watermarkText', e.target.value)}
                  placeholder="Watermark text"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-zinc-200"
                />
                <div>
                  <label className="text-[9px] text-zinc-500">Opacity: {settings.watermarkOpacity}%</label>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    value={settings.watermarkOpacity}
                    onChange={(e) => updateSetting('watermarkOpacity', parseInt(e.target.value))}
                    className="w-full h-1 accent-violet-500 bg-zinc-800 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Export Button */}
      {error && (
        <div className="flex items-center gap-2 p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-[10px] text-rose-300">{error}</span>
        </div>
      )}

      <button
        onClick={handleExport}
        disabled={exporting || !canvas}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
          exported
            ? 'bg-emerald-600 text-white'
            : 'bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50'
        }`}
      >
        {exporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Exporting...
          </>
        ) : exported ? (
          <>
            <Check className="w-4 h-4" />
            Exported!
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Export {settings.format.toUpperCase()}
          </>
        )}
      </button>
    </div>
  );
};
