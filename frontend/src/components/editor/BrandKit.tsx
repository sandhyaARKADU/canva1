import React, { useState, useEffect } from 'react';
import {
  Palette,
  Type,
  Image,
  Plus,
  Trash2,
  Check,
  X,
  Upload,
  Copy,
} from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';
import { fabric } from 'fabric';
import { apiFetch, getAuthToken } from '../../services/apiClient';

// Brand Kit types
interface BrandColor {
  id: string;
  name: string;
  hex: string;
}

interface BrandFont {
  id: string;
  name: string;
  family: string;
  weight: string;
}

interface BrandLogo {
  id: string;
  name: string;
  src: string;
}

interface BrandKit {
  id?: string;
  colors: BrandColor[];
  fonts: BrandFont[];
  logos: BrandLogo[];
  name: string;
}

interface ApiBrandKit {
  id: string;
  name: string;
  colors: Array<{ id: string; name: string; hex_value: string }>;
  fonts: Array<{ id: string; name: string; family: string; weight: string }>;
  logos: Array<{ id: string; name: string; file_data: string; file_type: string }>;
}

interface ApiBrandKitList {
  brand_kits: ApiBrandKit[];
}

// Default brand kit
const DEFAULT_BRAND_KIT: BrandKit = {
  name: 'My Brand',
  colors: [
    { id: '1', name: 'Primary', hex: '#8b5cf6' },
    { id: '2', name: 'Secondary', hex: '#ec4899' },
    { id: '3', name: 'Accent', hex: '#06b6d4' },
    { id: '4', name: 'Dark', hex: '#18181b' },
    { id: '5', name: 'Light', hex: '#fafafa' },
  ],
  fonts: [
    { id: '1', name: 'Heading', family: 'Outfit', weight: 'bold' },
    { id: '2', name: 'Body', family: 'Inter', weight: 'normal' },
    { id: '3', name: 'Accent', family: 'Georgia', weight: 'normal' },
  ],
  logos: [],
};

const AVAILABLE_FONTS = [
  'Outfit',
  'Inter',
  'system-ui',
  'Arial',
  'Georgia',
  'Courier New',
  'Times New Roman',
  'Verdana',
  'Helvetica',
  'Roboto',
];

const normalizeBrandKit = (kit: ApiBrandKit): BrandKit => ({
  id: kit.id,
  name: kit.name,
  colors: kit.colors.map((color) => ({
    id: color.id,
    name: color.name,
    hex: color.hex_value,
  })),
  fonts: kit.fonts.map((font) => ({
    id: font.id,
    name: font.name,
    family: font.family,
    weight: font.weight,
  })),
  logos: kit.logos.map((logo) => ({
    id: logo.id,
    name: logo.name,
    src: logo.file_data,
  })),
});

const readApiError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null);
  return payload?.detail || payload?.error || fallback;
};

export const BrandKit: React.FC = () => {
  const { canvas, saveHistory, setFillColor, setFontFamily, setFontWeight } = useEditorStore();
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [selectedKitId, setSelectedKitId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<'colors' | 'fonts' | 'logos'>('colors');
  const [newColor, setNewColor] = useState('#8b5cf6');
  const [newColorName, setNewColorName] = useState('');
  const [showAddColor, setShowAddColor] = useState(false);
  const [showAddFont, setShowAddFont] = useState(false);
  const [newFont, setNewFont] = useState({ name: '', family: 'Outfit', weight: 'normal' });

  const selectedKit = brandKits.find((kit) => kit.id === selectedKitId);
  const brandKit = selectedKit || brandKits[0] || DEFAULT_BRAND_KIT;

  const updateBrandKit = (updatedKit: BrandKit) => {
    setBrandKits((current) => {
      if (!updatedKit.id) return current;
      const exists = current.some((kit) => kit.id === updatedKit.id);
      return exists ? current.map((kit) => (kit.id === updatedKit.id ? updatedKit : kit)) : [updatedKit, ...current];
    });
    if (updatedKit.id) setSelectedKitId(updatedKit.id);
  };

  const fetchBrandKits = async () => {
    const token = getAuthToken();
    if (!token) {
      setBrandKits([]);
      setSelectedKitId('');
      setError('Sign in to use persistent brand kits in the editor.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/brand-kits');
      if (!response.ok) {
        throw new Error(await readApiError(response, `Failed to load brand kits (${response.status})`));
      }
      const payload = (await response.json()) as ApiBrandKitList;
      const kits = (payload.brand_kits || []).map(normalizeBrandKit);
      setBrandKits(kits);
      setSelectedKitId((current) => current || kits[0]?.id || '');
      if (kits.length === 0) {
        setError('No backend brand kit found. Add a color, font, or logo to create one.');
      }
    } catch (err) {
      setBrandKits([]);
      setSelectedKitId('');
      setError(err instanceof Error ? err.message : 'Failed to load brand kits.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBrandKits();
  }, []);

  const ensurePersistentKit = async () => {
    if (brandKit.id) return brandKit;

    const response = await apiFetch('/api/brand-kits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: brandKit.name || 'My Brand' }),
    });
    if (!response.ok) {
      throw new Error(await readApiError(response, `Failed to create brand kit (${response.status})`));
    }
    const createdKit = normalizeBrandKit((await response.json()) as ApiBrandKit);
    updateBrandKit(createdKit);
    return createdKit;
  };

  // ─── Color Operations ───────────────────────
  const addColor = async () => {
    if (!newColorName.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      const kit = await ensurePersistentKit();
      const response = await apiFetch(`/api/brand-kits/${kit.id}/colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newColorName.trim(), hex_value: newColor }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, `Failed to add color (${response.status})`));
      }
      const created = await response.json();
      updateBrandKit({
        ...kit,
        colors: [...kit.colors, { id: created.id, name: created.name, hex: created.hex_value }],
      });
      setNewColorName('');
      setShowAddColor(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add color.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeColor = async (id: string) => {
    if (!brandKit.id) return;
    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch(`/api/brand-kits/${brandKit.id}/colors/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readApiError(response, `Failed to remove color (${response.status})`));
      }
      updateBrandKit({
        ...brandKit,
        colors: brandKit.colors.filter((color) => color.id !== id),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove color.');
    } finally {
      setIsSaving(false);
    }
  };

  const applyColor = (hex: string) => {
    setFillColor(hex);
    if (canvas) {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        activeObject.set('fill', hex);
        canvas.renderAll();
        saveHistory();
      }
    }
  };

  // ─── Font Operations ────────────────────────
  const addFont = async () => {
    if (!newFont.name.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      const kit = await ensurePersistentKit();
      const response = await apiFetch(`/api/brand-kits/${kit.id}/fonts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFont.name.trim(), family: newFont.family, weight: newFont.weight }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, `Failed to add font (${response.status})`));
      }
      const created = await response.json();
      updateBrandKit({
        ...kit,
        fonts: [...kit.fonts, { id: created.id, name: created.name, family: created.family, weight: created.weight }],
      });
      setNewFont({ name: '', family: 'Outfit', weight: 'normal' });
      setShowAddFont(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add font.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeFont = async (id: string) => {
    if (!brandKit.id) return;
    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch(`/api/brand-kits/${brandKit.id}/fonts/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readApiError(response, `Failed to remove font (${response.status})`));
      }
      updateBrandKit({
        ...brandKit,
        fonts: brandKit.fonts.filter((font) => font.id !== id),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove font.');
    } finally {
      setIsSaving(false);
    }
  };

  const applyFont = (family: string, weight: string) => {
    setFontFamily(family);
    setFontWeight(weight);
    if (canvas) {
      const activeObject = canvas.getActiveObject();
      if (activeObject && (activeObject.type === 'text' || activeObject.type === 'textbox' || activeObject.type === 'i-text')) {
        (activeObject as any).set({ fontFamily: family, fontWeight: weight });
        canvas.renderAll();
        saveHistory();
      }
    }
  };

  // ─── Logo Operations ────────────────────────
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const src = event.target?.result as string;
      setIsSaving(true);
      setError('');
      try {
        const kit = await ensurePersistentKit();
        const response = await apiFetch(`/api/brand-kits/${kit.id}/logos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, file_data: src, file_type: file.type || 'image/png' }),
        });
        if (!response.ok) {
          throw new Error(await readApiError(response, `Failed to upload logo (${response.status})`));
        }
        const created = await response.json();
        updateBrandKit({
          ...kit,
          logos: [...kit.logos, { id: created.id, name: created.name, src: created.file_data }],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload logo.');
      } finally {
        setIsSaving(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeLogo = async (id: string) => {
    if (!brandKit.id) return;
    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch(`/api/brand-kits/${brandKit.id}/logos/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readApiError(response, `Failed to remove logo (${response.status})`));
      }
      updateBrandKit({
        ...brandKit,
        logos: brandKit.logos.filter((logo) => logo.id !== id),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove logo.');
    } finally {
      setIsSaving(false);
    }
  };

  const addLogoToCanvas = (src: string) => {
    if (!canvas) return;

    fabric.Image.fromURL(
      src,
      (img) => {
        if (!img) return;

        const maxSize = 200;
        const scale = Math.min(maxSize / (img.width || 1), maxSize / (img.height || 1), 1);

        img.set({
          left: canvas.getWidth() / 2 - ((img.width || 0) * scale) / 2,
          top: canvas.getHeight() / 2 - ((img.height || 0) * scale) / 2,
          scaleX: scale,
          scaleY: scale,
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        saveHistory();
      },
      { crossOrigin: 'anonymous' }
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-zinc-100">Brand Kit</h3>
          <span className="text-[10px] text-zinc-500">
            {brandKit.id ? 'Synced' : 'Backend ready'}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500">
          Your brand colors, fonts, and logos for consistent design
        </p>
        {brandKits.length > 1 && (
          <select
            value={selectedKitId}
            onChange={(event) => setSelectedKitId(event.target.value)}
            className="mt-3 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none"
          >
            {brandKits.map((kit) => (
              <option key={kit.id} value={kit.id}>{kit.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tab Selector */}
      <div className="flex border-b border-zinc-800">
        {[
          { id: 'colors' as const, label: 'Colors', icon: Palette },
          { id: 'fonts' as const, label: 'Fonts', icon: Type },
          { id: 'logos' as const, label: 'Logos', icon: Image },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] font-semibold transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'text-violet-400 border-b-2 border-violet-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-[11px] text-zinc-400">
            Loading brand kits from backend...
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
            {error}
          </div>
        )}
        {/* Colors Tab */}
        {activeTab === 'colors' && (
          <div className="flex flex-col gap-3">
            {brandKit.colors.map((color) => (
              <div
                key={color.id}
                className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl"
              >
                <button
                  onClick={() => applyColor(color.hex)}
                  className="w-10 h-10 rounded-lg border-2 border-zinc-700 hover:border-white/60 transition-all cursor-pointer shadow-md hover:scale-110"
                  style={{ backgroundColor: color.hex }}
                  title={`Apply ${color.name}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-200 truncate">{color.name}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">{color.hex}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(color.hex);
                    }}
                    className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                    title="Copy hex code"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => removeColor(color.id)}
                    disabled={!brandKit.id || isSaving}
                    className="p-1.5 hover:bg-zinc-850 hover:text-rose-400 rounded-lg text-zinc-600 transition-colors cursor-pointer"
                    title="Remove color"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add Color */}
            {showAddColor ? (
              <div className="flex flex-col gap-2 p-3 bg-zinc-900/50 border border-violet-500/30 rounded-xl">
                <input
                  type="text"
                  placeholder="Color name (e.g. Primary)"
                  value={newColorName}
                  onChange={(e) => setNewColorName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-zinc-700 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newColor.toUpperCase()}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addColor}
                    disabled={!newColorName.trim() || isSaving}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Check className="w-3 h-3" />
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddColor(false)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddColor(true)}
                className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-800 hover:border-violet-500/50 rounded-xl text-zinc-500 hover:text-violet-400 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs font-semibold">Add Color</span>
              </button>
            )}
          </div>
        )}

        {/* Fonts Tab */}
        {activeTab === 'fonts' && (
          <div className="flex flex-col gap-3">
            {brandKit.fonts.map((font) => (
              <div
                key={font.id}
                className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Type className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-200 truncate">{font.name}</p>
                  <p className="text-[10px] text-zinc-500">{font.family} • {font.weight}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => applyFont(font.family, font.weight)}
                    className="px-2 py-1 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded text-[10px] font-semibold transition-colors cursor-pointer"
                    title="Apply font"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => removeFont(font.id)}
                    disabled={!brandKit.id || isSaving}
                    className="p-1.5 hover:bg-zinc-850 hover:text-rose-400 rounded-lg text-zinc-600 transition-colors cursor-pointer"
                    title="Remove font"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add Font */}
            {showAddFont ? (
              <div className="flex flex-col gap-2 p-3 bg-zinc-900/50 border border-violet-500/30 rounded-xl">
                <input
                  type="text"
                  placeholder="Font name (e.g. Heading)"
                  value={newFont.name}
                  onChange={(e) => setNewFont({ ...newFont, name: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none"
                  autoFocus
                />
                <select
                  value={newFont.family}
                  onChange={(e) => setNewFont({ ...newFont, family: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none cursor-pointer"
                >
                  {AVAILABLE_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <select
                  value={newFont.weight}
                  onChange={(e) => setNewFont({ ...newFont, weight: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none cursor-pointer"
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="lighter">Light</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={addFont}
                    disabled={!newFont.name.trim() || isSaving}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Check className="w-3 h-3" />
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddFont(false)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddFont(true)}
                className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-800 hover:border-violet-500/50 rounded-xl text-zinc-500 hover:text-violet-400 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs font-semibold">Add Font</span>
              </button>
            )}
          </div>
        )}

        {/* Logos Tab */}
        {activeTab === 'logos' && (
          <div className="flex flex-col gap-3">
            {brandKit.logos.length > 0 ? (
              brandKit.logos.map((logo) => (
                <div
                  key={logo.id}
                  className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl"
                >
                  <img
                    src={logo.src}
                    alt={logo.name}
                    className="w-10 h-10 rounded-lg object-contain bg-white"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{logo.name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => addLogoToCanvas(logo.src)}
                      className="px-2 py-1 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded text-[10px] font-semibold transition-colors cursor-pointer"
                      title="Add to canvas"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => removeLogo(logo.id)}
                      disabled={!brandKit.id || isSaving}
                      className="p-1.5 hover:bg-zinc-850 hover:text-rose-400 rounded-lg text-zinc-600 transition-colors cursor-pointer"
                      title="Remove logo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-zinc-500">
                <Image className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-xs font-semibold">No logos yet</p>
                <p className="text-[10px] mt-1">Upload your brand logos</p>
              </div>
            )}

            {/* Upload Logo */}
            <label className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-800 hover:border-violet-500/50 rounded-xl text-zinc-500 hover:text-violet-400 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              <span className="text-xs font-semibold">Upload Logo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={isSaving}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
