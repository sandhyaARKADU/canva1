import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, X, Sparkles, Shapes, BarChart3, Table2, Heart, Clock,
  Loader2, Layers, ChevronLeft, Info, Image, Film,
  Music, Mic, BoxIcon, Zap, FileSpreadsheet, LayoutGrid,
  RectangleHorizontal, Circle, Plus,
  Paintbrush, Frame,
  Smartphone, Monitor,
  UserRound, Globe2, Database, MessageSquare, Cpu, Cloud, Server,
  ShieldCheck, Radio, ListTree, Gauge, Workflow,
  ArrowRight, Network,
} from 'lucide-react';
import { apiFetch } from '../../services/apiClient';
import { useEditorStore } from '../../store/useEditorStore';
import { fabric } from 'fabric';
import { loadSVGElement } from '../../utils/svgElementUtils';
import { createFrameContainer, createGridContainer } from '../../utils/frameUtils';
import { createCustomShape } from '../../utils/lineUtils';
import { resolveAssetUrl, handleThumbnailError, DEFAULT_ASSET_FALLBACK_SVG } from '../../utils/assetUrlResolver';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  SHAPE_REGISTRY, SHAPE_CATEGORIES, SHAPES_BY_CATEGORY, searchShapes,
  type ShapeDefinition, type ShapeCategory,
} from '../../utils/shapeRegistry';
import {
  ANIMATION_REGISTRY, ANIMATION_CATEGORIES, ANIMATIONS_BY_CATEGORY,
  searchAnimations, getRecommendations, registerAnimation,
  type AnimationDefinition, type AnimationCategory,
} from '../../utils/animationRegistry';
import {
  GRAPHICS_REGISTRY, GRAPHIC_CATEGORIES, GRAPHICS_BY_CATEGORY, searchGraphics,
  type GraphicDefinition, type GraphicCategory,
} from '../../utils/graphicsRegistry';
import {
  FORMS_REGISTRY, FORM_CATEGORIES, FORMS_BY_CATEGORY, searchForms,
  type FormCategory,
} from '../../utils/formsRegistry';
import {
  CHART_ELEMENTS, ELEMENT_SECTIONS, createChartElement,
} from '../../utils/editorElementFactory';
import type { EditorElement } from '../../types/elements';
import {
  createArchitectureCard,
  createSegmentedHeaderBars,
  createStandaloneArchitectureSymbol,
  createStandaloneArchitectureChip,
  createStandaloneStatusDot,
  createStageTracker,
} from '../../utils/architectureDiagram';
import { createStandaloneDiagramArrow } from '../../utils/diagramConnectors';
import {
  ARCHITECTURE_ANIMATED_FLOW_PRESETS,
  ARCHITECTURE_ARROW_PRESETS,
  ARCHITECTURE_BOX_PRESETS,
  ARCHITECTURE_LIBRARY_CATEGORIES,
  ARCHITECTURE_SYMBOLS,
} from '../../utils/architectureLibrary';
import {
  getConnectorAnimationPreset,
} from '../../utils/architectureDiagramTypes';
import type { ArchitectureIconName } from '../../utils/architectureDiagramTypes';
import {
  TECHNICAL_ACCENTS,
  TECHNICAL_COMPONENT_ITEMS,
  TECHNICAL_DARK_BACKGROUND,
  TECHNICAL_ELEMENT_ITEMS,
  addTechnicalBackground,
  applyTechnicalAccent,
  centerObjectOnCanvas,
  createTechnicalComponent,
  createTechnicalElement,
  getTechnicalAccent,
  groupTechnicalObjects,
  type TechnicalAccentId,
  type TechnicalComponentId,
  type TechnicalElementId,
} from '../../utils/technicalInfographicDesign';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ElementCategoryTab = string;

export interface ElementItem {
  id: string;
  title: string;
  kind: string;
  category: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  sourceUrl?: string;
  svgData?: string;
  mimeType?: string;
  isPremium?: boolean;
  isAnimated?: boolean;
  tags?: string[];
}

export type GenerateMode = 'search' | 'generate' | 'icon' | 'illustration' | 'sticker' | 'pattern' | '3d';

interface ElementsPanelProps {
  initialTab?: ElementCategoryTab;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY CONFIGURATION — single source of truth
// ═══════════════════════════════════════════════════════════════════════════════

type CategoryType = 'asset' | 'interactive' | 'unsupported';

interface CategoryConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  gradient: string;
  iconColor: string;
  type: CategoryType;
  /** For 'asset' type: query params sent to GET /api/elements */
  assetQuery?: Record<string, string>;
  /** For 'asset' type: subcategory chip labels */
  subcategories?: string[];
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: 'images', label: 'Photos', icon: Image,
    gradient: 'from-blue-500/30 to-cyan-500/30', iconColor: 'text-blue-400',
    type: 'asset',
    assetQuery: { category: 'images' },
    subcategories: ['Abstract', 'Nature', 'Business', 'Technology', 'Food & Drink', 'Fashion', 'Fitness', 'Travel', 'Architecture', 'Animals', 'People', 'Minimal'],
  },
  {
    id: 'graphics', label: 'Graphics', icon: Paintbrush,
    gradient: 'from-purple-500/30 to-pink-500/30', iconColor: 'text-purple-400',
    type: 'asset',
    assetQuery: { search: 'illustration,graphic,abstract,decorative' },
    subcategories: ['Illustrations', 'Decorative', 'Abstract', 'Business', 'Technology', 'Education', 'Medical', 'Social Media', 'Patterns'],
  },
  {
    id: 'videos', label: 'Videos', icon: Film,
    gradient: 'from-red-500/30 to-orange-500/30', iconColor: 'text-red-400',
    type: 'unsupported',
  },
  {
    id: 'code', label: 'Code', icon: BoxIcon,
    gradient: 'from-emerald-500/30 to-teal-500/30', iconColor: 'text-emerald-400',
    type: 'interactive',
  },
  {
    id: 'music', label: 'Music', icon: Music,
    gradient: 'from-yellow-500/30 to-amber-500/30', iconColor: 'text-yellow-400',
    type: 'unsupported',
  },
  {
    id: 'sound-effects', label: 'Sound Effects', icon: Zap,
    gradient: 'from-pink-500/30 to-rose-500/30', iconColor: 'text-pink-400',
    type: 'unsupported',
  },
  {
    id: 'voiceover', label: 'Voiceover', icon: Mic,
    gradient: 'from-violet-500/30 to-indigo-500/30', iconColor: 'text-violet-400',
    type: 'unsupported',
  },
  {
    id: 'architecture', label: 'Architecture', icon: Network,
    gradient: 'from-cyan-500/30 to-emerald-500/30', iconColor: 'text-cyan-400',
    type: 'interactive',
  },
  {
    id: 'technical-infographic', label: 'Technical Infographic', icon: Cpu,
    gradient: 'from-emerald-500/30 to-cyan-500/30', iconColor: 'text-emerald-400',
    type: 'interactive',
  },
  {
    id: 'shapes', label: 'Shapes', icon: Shapes,
    gradient: 'from-teal-500/30 to-cyan-500/30', iconColor: 'text-teal-400',
    type: 'interactive',
  },
  {
    id: '3d', label: '3D', icon: BoxIcon,
    gradient: 'from-indigo-500/30 to-blue-500/30', iconColor: 'text-indigo-400',
    type: 'asset',
    assetQuery: { search: '3d,isometric,render' },
    subcategories: ['Illustrations', 'Objects', 'Icons', 'Stickers', 'Product Renders', 'Isometric'],
  },
  {
    id: 'animations', label: 'Animations', icon: Zap,
    gradient: 'from-orange-500/30 to-yellow-500/30', iconColor: 'text-orange-400',
    type: 'interactive',
  },
  {
    id: 'charts', label: 'Charts', icon: BarChart3,
    gradient: 'from-green-500/30 to-emerald-500/30', iconColor: 'text-green-400',
    type: 'interactive',
  },
  {
    id: 'forms', label: 'Forms', icon: FileSpreadsheet,
    gradient: 'from-sky-500/30 to-blue-500/30', iconColor: 'text-sky-400',
    type: 'interactive',
  },
  {
    id: 'sheets', label: 'Sheets', icon: FileSpreadsheet,
    gradient: 'from-lime-500/30 to-green-500/30', iconColor: 'text-lime-400',
    type: 'unsupported',
  },
  {
    id: 'tables', label: 'Tables', icon: Table2,
    gradient: 'from-amber-500/30 to-yellow-500/30', iconColor: 'text-amber-400',
    type: 'interactive',
  },
  {
    id: 'frames', label: 'Frames', icon: Frame,
    gradient: 'from-rose-500/30 to-pink-500/30', iconColor: 'text-rose-400',
    type: 'interactive',
  },
  {
    id: 'grids', label: 'Grids', icon: LayoutGrid,
    gradient: 'from-fuchsia-500/30 to-purple-500/30', iconColor: 'text-fuchsia-400',
    type: 'interactive',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SHAPE / LINE / FRAME / GRID DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const FRAME_ITEMS = [
  { name: 'Rectangle', shape: 'rectangle' as const, icon: Frame },
  { name: 'Circle', shape: 'circle' as const, icon: Circle },
  { name: 'Rounded', shape: 'rounded' as const, icon: RectangleHorizontal },
  { name: 'Heart', shape: 'heart' as const, icon: Heart },
  { name: 'Polaroid', shape: 'rectangle' as const, icon: Image },
  { name: 'Phone', shape: 'rectangle' as const, icon: Smartphone },
  { name: 'Laptop', shape: 'rectangle' as const, icon: Monitor },
];

const GRID_ITEMS = [
  { name: '2 Column', layout: '2-col' as const, cells: 2 },
  { name: '3 Column', layout: '3-col' as const, cells: 3 },
  { name: '2×2 Grid', layout: '2x2' as const, cells: 4 },
  { name: 'Collage', layout: '2x2' as const, cells: 4 },
];

const TABLE_ITEMS = [
  { name: '3×3 Table', rows: 3, cols: 3 },
  { name: '4×4 Table', rows: 4, cols: 4 },
  { name: 'Pricing Table', rows: 3, cols: 4 },
  { name: 'Schedule', rows: 5, cols: 3 },
];

const createElementInstanceId = (prefix: string) => (
  window.crypto?.randomUUID
    ? `${prefix}_${window.crypto.randomUUID()}`
    : `${prefix}_${Math.random().toString(36).slice(2)}`
);

const CODE_ITEMS = [
  { name: 'Code Block', type: 'code-block', icon: BoxIcon },
  { name: 'Terminal', type: 'terminal', icon: Terminal },
  { name: 'Browser Window', type: 'browser', icon: Monitor },
  { name: 'IDE Mockup', type: 'ide', icon: Monitor },
];

function Terminal(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

const ARCHITECTURE_ICON_COMPONENTS: Record<ArchitectureIconName, React.ElementType> = {
  member: UserRound,
  globe: Globe2,
  gateway: Workflow,
  database: Database,
  chat: MessageSquare,
  router: Network,
  event: ListTree,
  chip: Cpu,
  workers: Layers,
  server: Server,
  cloud: Cloud,
  auth: ShieldCheck,
  stream: Radio,
  queue: ListTree,
  analytics: Gauge,
};

const GENERATE_MODES: { value: GenerateMode; label: string }[] = [
  { value: 'search', label: 'Search' },
  { value: 'generate', label: 'AI Generate' },
  { value: 'icon', label: 'Icon' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'pattern', label: 'Pattern' },
  { value: '3d', label: '3D Style' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ElementsPanel: React.FC<ElementsPanelProps> = ({ initialTab = 'all' }) => {
  const { canvas, saveHistory } = useEditorStore();

  // Navigation
  const [view, setView] = useState<'launcher' | 'category'>('launcher');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Shapes "See All" sub-view
  const [shapesSeeAll, setShapesSeeAll] = useState<ShapeCategory | null>(null);
  const [shapesSearch, setShapesSearch] = useState('');
  const shapesSearchDebounced = useDebouncedValue(shapesSearch, 200);

  const [architectureSearch, setArchitectureSearch] = useState('');
  const [architectureCategory, setArchitectureCategory] = useState('All');
  const architectureSearchDebounced = useDebouncedValue(architectureSearch, 150);
  const [technicalAccentId, setTechnicalAccentId] = useState<TechnicalAccentId>('green');

  // Animations "See All" sub-view
  const [animSeeAll, setAnimSeeAll] = useState<AnimationCategory | null>(null);
  const [animSearch, setAnimSearch] = useState('');
  const animSearchDebounced = useDebouncedValue(animSearch, 200);

  // Photos state
  const [photoMode, setPhotoMode] = useState<'search' | 'generate'>('search');
  const [photoPrompt, setPhotoPrompt] = useState('');
  const [photoGenerating, setPhotoGenerating] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoOrientation, setPhotoOrientation] = useState<string | null>(null);

  // Graphics state
  const [gfxSeeAll, setGfxSeeAll] = useState<GraphicCategory | null>(null);
  const [gfxSearch, setGfxSearch] = useState('');
  const gfxSearchDebounced = useDebouncedValue(gfxSearch, 200);

  // Forms state
  const [formSeeAll, setFormSeeAll] = useState<FormCategory | null>(null);
  const [formSearch, setFormSearch] = useState('');
  const formSearchDebounced = useDebouncedValue(formSearch, 200);

  // Charts state
  const [chartSeeAll, setChartSeeAll] = useState<string | null>(null);
  const [chartSearch, setChartSearch] = useState('');
  const chartSearchDebounced = useDebouncedValue(chartSearch, 200);
  const [showDataEditor, setShowDataEditor] = useState(false);
  const [dataEditorData, setDataEditorData] = useState<{ labels: string[]; datasets: { label: string; values: number[]; color: string }[] }>({
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      { label: 'Series A', values: [34, 58, 42, 76, 52, 68], color: '#8b5cf6' },
      { label: 'Series B', values: [22, 44, 64, 50, 38, 56], color: '#22d3ee' },
    ],
  });

  // Data
  const [elements, setElements] = useState<ElementItem[]>([]);
  const [recents, setRecents] = useState<ElementItem[]>([]);
  const [favorites, setFavorites] = useState<ElementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // AI
  const [aiPrompt, setAiPrompt] = useState('');
  const [generateMode, setGenerateMode] = useState<GenerateMode>('search');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Initialize from initialTab ──────────────────────────────────────────
  useEffect(() => {
    if (initialTab && initialTab !== 'all' && CATEGORY_CONFIGS.find((c) => c.id === initialTab)) {
      setActiveCategory(initialTab);
      setView('category');
    }
  }, [initialTab]);

  // ─── Fetch elements from backend ─────────────────────────────────────────
  const fetchElements = useCallback(async (category: string | null, query: string, pageNum: number, append: boolean) => {
    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const catConfig = category ? CATEGORY_CONFIGS.find((c) => c.id === category) : null;

      if (category === 'recents') {
        const res = await apiFetch('/api/elements/recent');
        if (res.ok) { const data = await res.json(); setRecents(data.recents || []); }
      } else if (category === 'favorites') {
        const res = await apiFetch('/api/elements/favorites');
        if (res.ok) { const data = await res.json(); setFavorites(data.favorites || []); }
      } else if (catConfig?.type === 'asset' && catConfig.assetQuery) {
        // Build query from category config
        const params = new URLSearchParams({ page: String(pageNum), limit: '30' });
        for (const [k, v] of Object.entries(catConfig.assetQuery)) {
          params.set(k, v);
        }
        if (activeSubcategory) params.set('subcategory', activeSubcategory);
        if (query) params.set('search', query);

        const res = await apiFetch(`/api/elements?${params.toString()}`);
        if (!controller.signal.aborted && res.ok) {
          const data = await res.json();
          const newElements = data.elements || [];
          setElements((prev) => append ? [...prev, ...newElements] : newElements);
          setHasMore(newElements.length === 30);
        }
      } else if (catConfig?.type === 'interactive') {
        // Interactive categories don't fetch from API — they have static pickers
        setElements([]);
        setHasMore(false);
      } else if (catConfig?.type === 'unsupported') {
        setElements([]);
        setHasMore(false);
      } else {
        // Generic search
        const params = new URLSearchParams({ page: String(pageNum), limit: '30' });
        if (category) params.set('category', category);
        if (query) params.set('search', query);
        const res = await apiFetch(`/api/elements?${params.toString()}`);
        if (!controller.signal.aborted && res.ok) {
          const data = await res.json();
          setElements((prev) => append ? [...prev, ...(data.elements || [])] : data.elements || []);
          setHasMore((data.elements || []).length === 30);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('[TECKSTUDIO] Elements fetch error:', err);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [activeSubcategory]);

  useEffect(() => {
    fetchElements(view === 'category' ? activeCategory : null, debouncedSearch, 1, false);
    setPage(1);
  }, [view, activeCategory, activeSubcategory, debouncedSearch, fetchElements]);

  // Cleanup abort controller on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // ─── Record usage ────────────────────────────────────────────────────────
  const recordRecentUse = async (elementId: string) => {
    try { await apiFetch('/api/elements/recent', { method: 'POST', body: JSON.stringify({ element_id: elementId }) }); } catch { /* */ }
  };

  // ─── Toggle favorite ─────────────────────────────────────────────────────
  const toggleFavorite = async (elementId: string) => {
    try {
      await apiFetch(`/api/elements/favorites/${elementId}`, { method: 'POST' });
      if (activeCategory === 'favorites') fetchElements('favorites', '', 1, false);
    } catch { /* */ }
  };

  // ─── Canvas centering helper ─────────────────────────────────────────────
  const centerOnCanvas = (obj: fabric.Object, size: number = 180) => {
    if (!canvas) return;
    obj.set({ left: (canvas.width || 800) / 2 - size / 2, top: (canvas.height || 800) / 2 - size / 2, scaleX: 0.5, scaleY: 0.5 });
  };

  // ─── Unified canvas insertion ────────────────────────────────────────────
  const handleInsertElement = async (item: ElementItem) => {
    if (!canvas) return;
    recordRecentUse(item.id);
    try {
      if (item.svgData || item.mimeType === 'image/svg+xml' || (item.sourceUrl && item.sourceUrl.endsWith('.svg'))) {
        const svgContent = item.svgData || resolveAssetUrl(item.sourceUrl || item.thumbnailUrl);
        if (svgContent) {
          const svgObj = await loadSVGElement(svgContent, { name: item.title });
          centerOnCanvas(svgObj);
          canvas.add(svgObj); canvas.setActiveObject(svgObj); canvas.renderAll(); saveHistory();
          return;
        }
      }
      const resolvedUrl = resolveAssetUrl(item.sourceUrl || item.thumbnailUrl);
      if (resolvedUrl && resolvedUrl !== DEFAULT_ASSET_FALLBACK_SVG) {
        fabric.Image.fromURL(resolvedUrl, (img) => {
          if (!img) return;
          centerOnCanvas(img, 180);
          img.set({ name: item.title, id: `elem_${item.id}_${Date.now()}` } as any);
          img.setCoords(); canvas.add(img); canvas.setActiveObject(img); canvas.renderAll(); saveHistory();
        }, { crossOrigin: 'anonymous' });
        return;
      }
      const shapeObj = createCustomShape('rectangle', { left: 350, top: 350 });
      canvas.add(shapeObj); canvas.setActiveObject(shapeObj); canvas.renderAll(); saveHistory();
    } catch (err) { console.error('[TECKSTUDIO] Canvas insert error:', err); }
  };

  // ─── Navigation ──────────────────────────────────────────────────────────
  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    setActiveSubcategory(null);
    setView('category');
    setSearchQuery('');
    setShapesSeeAll(null);
    setShapesSearch('');
    setArchitectureSearch('');
    setArchitectureCategory('All');
    setAnimSeeAll(null);
    setAnimSearch('');
    setPhotoMode('search'); setPhotoPrompt(''); setPhotoError(''); setPhotoOrientation(null);
    setGfxSeeAll(null); setGfxSearch('');
    setFormSeeAll(null); setFormSearch('');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const handleBack = () => {
    if (shapesSeeAll) { setShapesSeeAll(null); return; }
    if (animSeeAll) { setAnimSeeAll(null); return; }
    setView('launcher'); setActiveCategory(null); setActiveSubcategory(null); setSearchQuery('');
    setArchitectureSearch(''); setArchitectureCategory('All');
    setPhotoMode('search'); setPhotoPrompt(''); setPhotoError(''); setPhotoOrientation(null);
    setGfxSeeAll(null); setGfxSearch('');
    setFormSeeAll(null); setFormSearch('');
  };
  const handleSubcategoryClick = (sub: string) => {
    setActiveSubcategory((prev) => prev === sub ? null : sub);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const loadMore = () => {
    const nextPage = page + 1; setPage(nextPage);
    fetchElements(activeCategory, debouncedSearch, nextPage, true);
  };

  // ─── AI Generation ───────────────────────────────────────────────────────
  const handleGenerateAIElement = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true); setAiError('');
    try {
      const res = await apiFetch('/api/elements/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt, element_type: generateMode === 'search' ? 'icon' : generateMode, style: 'flat' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.element) {
          handleInsertElement(data.element);
          setRecentPrompts((prev) => [aiPrompt, ...prev.filter((p) => p !== aiPrompt)].slice(0, 5));
          setAiPrompt('');
        }
      } else { setAiError('Generation failed. Please try again.'); }
    } catch { setAiError('Network error.'); }
    finally { setAiLoading(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SHAPE CREATION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleAddFrame = (shape: 'rectangle' | 'circle' | 'rounded' | 'heart') => {
    if (!canvas) return;
    const frameGroup = createFrameContainer({ shape });
    canvas.add(frameGroup); canvas.setActiveObject(frameGroup); canvas.renderAll(); saveHistory();
  };

  const handleAddGrid = (layout: '2-col' | '3-col' | '2x2') => {
    if (!canvas) return;
    const gridGroup = createGridContainer(layout);
    canvas.add(gridGroup); canvas.setActiveObject(gridGroup); canvas.renderAll(); saveHistory();
  };

  const handleAddChart = (chartId: string) => {
    if (!canvas) return;
    try {
      const chartObj = createChartElement(chartId);
      chartObj.set({
        left: (canvas.width || 800) / 2 - 180,
        top: (canvas.height || 800) / 2 - 125,
      });
      canvas.add(chartObj);
      canvas.setActiveObject(chartObj);
      canvas.renderAll();
      saveHistory();
    } catch (err) {
      console.error('[TECKSTUDIO] Chart insert error:', err);
    }
  };

  const handleAddTable = (rows: number, cols: number) => {
    if (!canvas) return;
    const cellW = 80, cellH = 36;
    const tableW = cols * cellW, tableH = rows * cellH;
    const objects: fabric.Object[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isHeader = r === 0;
        objects.push(new fabric.Rect({
          left: c * cellW, top: r * cellH, width: cellW, height: cellH,
          fill: isHeader ? '#7c3aed' : (r % 2 === 0 ? '#1e1e2e' : '#27272a'),
          stroke: '#3f3f46', strokeWidth: 1, selectable: false,
        }));
        objects.push(new fabric.Text(isHeader ? `Header ${c + 1}` : `Cell`, {
          left: c * cellW + cellW / 2, top: r * cellH + cellH / 2,
          fontSize: 11, fill: '#d4d4d8', fontFamily: 'sans-serif',
          originX: 'center', originY: 'center', selectable: false,
        }));
      }
    }
    const group = new fabric.Group(objects, {
      left: (canvas.width || 800) / 2 - tableW / 2, top: (canvas.height || 800) / 2 - tableH / 2,
      id: createElementInstanceId(`table_${rows}x${cols}`), name: `${rows}×${cols} Table`,
    } as any);
    canvas.add(group); canvas.setActiveObject(group); canvas.renderAll(); saveHistory();
  };

  const insertTechnicalObjects = (objects: fabric.Object[], name: string, shouldGroup = objects.length > 1) => {
    if (!canvas || objects.length === 0) return;
    const object = shouldGroup ? groupTechnicalObjects(objects, name) : objects[0];
    centerObjectOnCanvas(canvas, object);
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.renderAll();
    saveHistory();
  };

  const handleAddTechnicalElement = (elementId: TechnicalElementId) => {
    const label = TECHNICAL_ELEMENT_ITEMS.find((item) => item.id === elementId)?.label || elementId;
    insertTechnicalObjects(createTechnicalElement(elementId, technicalAccentId), `Technical - ${label}`);
  };

  const handleAddTechnicalComponent = (componentId: TechnicalComponentId) => {
    const label = TECHNICAL_COMPONENT_ITEMS.find((item) => item.id === componentId)?.label || componentId;
    insertTechnicalObjects(createTechnicalComponent(componentId, technicalAccentId), label);
  };

  const handleApplyTechnicalAccent = () => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;
    applyTechnicalAccent(activeObject, technicalAccentId);
    canvas.renderAll();
    saveHistory();
  };

  const handleAddTechnicalBackground = () => {
    if (!canvas) return;
    addTechnicalBackground(canvas, technicalAccentId);
    canvas.renderAll();
    saveHistory();
  };

  const handleAddCodeBlock = (type: string) => {
    if (!canvas) return;
    const bg = new fabric.Rect({ width: 360, height: 240, fill: '#0d1117', stroke: '#30363d', strokeWidth: 1, rx: 8, ry: 8, originX: 'center', originY: 'center' });
    const title = new fabric.Text(type === 'terminal' ? '$ ' : type === 'browser' ? 'index.html' : 'code.ts', {
      fontSize: 11, fill: '#8b949e', fontFamily: 'monospace', originX: 'center', originY: 'center', top: -100,
    });
    const code = new fabric.Text('const app = createEditor();\napp.use(canvasPlugin);\napp.use(elementsPlugin);\napp.start();', {
      fontSize: 11, fill: '#c9d1d9', fontFamily: 'monospace', lineHeight: 1.6, originX: 'center', originY: 'center', top: 10,
    });
    const group = new fabric.Group([bg, title, code], {
      left: (canvas.width || 800) / 2 - 180, top: (canvas.height || 800) / 2 - 120,
      id: createElementInstanceId(`code_${type}`), name: `${type} code block`,
    } as any);
    canvas.add(group); canvas.setActiveObject(group); canvas.renderAll(); saveHistory();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: ASSET CARD (shared by all asset-based categories)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderAssetCard = (item: ElementItem) => {
    const resolvedThumb = resolveAssetUrl(item.thumbnailUrl || item.sourceUrl);
    return (
      <div
        key={item.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-teckstudio-photo', JSON.stringify({
            id: item.id, name: item.title, kind: 'photo', category: item.category,
            sourceUrl: item.sourceUrl || item.thumbnailUrl, thumbnailUrl: item.thumbnailUrl,
            tags: item.tags || [], isPremium: item.isPremium,
          }));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => handleInsertElement(item)}
        className="group relative aspect-square bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-violet-500/50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.03] hover:shadow-xl overflow-hidden"
        title={item.title}
      >
        <img src={resolvedThumb} alt="" loading="lazy"
          onError={(e) => handleThumbnailError(e, DEFAULT_ASSET_FALLBACK_SVG)}
          className="w-full h-full object-contain pointer-events-none p-1.5" />
        {item.isPremium && <span className="absolute top-1 left-1 bg-amber-400 text-amber-950 text-[7px] font-black px-1.5 py-0.5 rounded-full">PRO</span>}
        <button onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
          className="absolute bottom-1 right-1 p-1 rounded-md bg-black/70 text-zinc-400 hover:text-pink-400 opacity-0 group-hover:opacity-100 transition-all" title="Favorite">
          <Heart className="w-3 h-3" />
        </button>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[9px] font-medium text-white truncate block">{item.title}</span>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: SKELETON GRID
  // ═══════════════════════════════════════════════════════════════════════════

  const renderSkeleton = (count: number = 12) => (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-xl bg-[#12121B] border border-white/[0.08]/50" />
      ))}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: EMPTY STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const renderEmptyState = (message: string, sub?: string) => (
    <div className="text-center py-10 space-y-2">
      <Info className="w-8 h-8 text-zinc-600 mx-auto" />
      <p className="text-xs text-zinc-400">{message}</p>
      {sub && <p className="text-[10px] text-zinc-600">{sub}</p>}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: UNSUPPORTED CATEGORY
  // ═══════════════════════════════════════════════════════════════════════════

  const renderUnsupported = (cat: CategoryConfig) => (
    <div className="text-center py-12 space-y-3">
      <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center`}>
        <cat.icon className={`w-8 h-8 ${cat.iconColor}`} />
      </div>
      <p className="text-sm font-semibold text-zinc-300">{cat.label}</p>
      <p className="text-xs text-zinc-500 max-w-[220px] mx-auto">
        {cat.id === 'videos' && 'Video editing is coming soon. You can add images and shapes to your designs right now.'}
        {cat.id === 'music' && 'Audio tracks will be available when timeline editing is supported.'}
        {cat.id === 'sound-effects' && 'Sound effects will be available when audio playback is added.'}
        {cat.id === 'voiceover' && 'Voiceover recording and AI text-to-speech are coming soon.'}
        {cat.id === 'animations' && 'Animation support is coming soon. Static elements are fully supported.'}
        {cat.id === 'sheets' && 'Spreadsheet components are coming soon.'}
        {!['videos', 'music', 'sound-effects', 'voiceover', 'animations', 'sheets'].includes(cat.id) && 'This feature is under development.'}
      </p>
      <button onClick={handleBack} className="text-xs text-violet-400 hover:text-violet-300 font-semibold cursor-pointer">
        Browse other categories
      </button>
    </div>
  );

  const addArchitectureObject = (object: fabric.Object) => {
    if (!canvas) return;
    object.set({
      left: canvas.getWidth() / 2 - object.getScaledWidth() / 2,
      top: canvas.getHeight() / 2 - object.getScaledHeight() / 2,
    });
    object.setCoords();
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    saveHistory();
  };

  const renderArchitectureLibrary = () => {
    const query = architectureSearchDebounced.trim().toLowerCase();
    const matches = (name: string, keywords: string[], category = '') => (
      !query ||
      name.toLowerCase().includes(query) ||
      category.toLowerCase().includes(query) ||
      keywords.some((keyword) => keyword.toLowerCase().includes(query))
    );
    const symbols = ARCHITECTURE_SYMBOLS.filter((item) => (
      (architectureCategory === 'All' || item.category === architectureCategory) &&
      matches(item.name, item.keywords, item.category)
    ));
    const boxes = ARCHITECTURE_BOX_PRESETS.filter((item) => (
      architectureCategory === 'All' &&
      matches(item.name, item.keywords, 'architecture box card node')
    ));
    const arrows = ARCHITECTURE_ARROW_PRESETS.filter((item) => (
      architectureCategory === 'All' &&
      matches(item.name, item.keywords, 'arrows connectors flow')
    ));
    const animatedFlows = ARCHITECTURE_ANIMATED_FLOW_PRESETS.filter((item) => (
      architectureCategory === 'All' &&
      matches(item.name, item.keywords, 'animated flow arrows connectors')
    ));
    const components = [
      {
        id: 'component-status-dot',
        name: 'Status Dot',
        keywords: ['status', 'dot', 'node', 'endpoint'],
        icon: Circle,
        color: '#43D68A',
        create: () => createStandaloneStatusDot('#43D68A', 20),
      },
      {
        id: 'component-chip',
        name: 'Label Chip',
        keywords: ['chip', 'label', 'session', 'tools'],
        icon: BoxIcon,
        color: '#F2C94C',
        create: () => createStandaloneArchitectureChip('SESSION', '#F2C94C'),
      },
      {
        id: 'component-stage-flow',
        name: 'Stage Flow',
        keywords: ['stage', 'flow', 'request', 'context', 'infer', 'stream'],
        icon: Workflow,
        color: '#43D68A',
        create: () => createStageTracker({ left: 120, top: 180, width: 700, glow: true }),
      },
      {
        id: 'component-segments',
        name: 'Segmented Lines',
        keywords: ['segments', 'header', 'colored lines'],
        icon: Layers,
        color: '#55A6FF',
        create: () => createSegmentedHeaderBars(700, 180),
      },
    ].filter((item) => (
      architectureCategory === 'All' &&
      matches(item.name, item.keywords, 'diagram components')
    ));

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-200">
            <Network className="h-4 w-4" />
            Diagram Symbols & Components
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">
            Vector symbols, editable architecture boxes and reusable arrow marks. Select an item, then recolor, rotate, flip, duplicate or group it normally.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={architectureSearch}
            onChange={(event) => setArchitectureSearch(event.target.value)}
            placeholder="Search user, API, GPU, queue, arrow..."
            className="w-full rounded-lg border border-white/[0.08] bg-[#12121B] py-2 pl-8 pr-8 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-500"
          />
          {architectureSearch && (
            <button type="button" onClick={() => setArchitectureSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['All', ...ARCHITECTURE_LIBRARY_CATEGORIES].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setArchitectureCategory(category)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-semibold ${
                architectureCategory === category
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {components.length > 0 && (
          <div>
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Diagram Components</h4>
            <div className="grid grid-cols-2 gap-2">
              {components.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Add ${item.name}`}
                    onClick={() => addArchitectureObject(item.create())}
                    className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#11151D] p-2 text-left transition-all hover:border-cyan-500/50"
                  >
                    <Icon className="h-5 w-5 shrink-0" style={{ color: item.color }} />
                    <span className="text-[9px] font-semibold text-zinc-400">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {symbols.length > 0 && (
          <div>
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Vector Symbols</h4>
            <div className="grid grid-cols-3 gap-2">
              {symbols.map((item) => {
                const Icon = ARCHITECTURE_ICON_COMPONENTS[item.icon];
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Add ${item.name}`}
                    onClick={() => addArchitectureObject(createStandaloneArchitectureSymbol(item.icon, item.color, 74, item.name))}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.08] bg-[#11151D] p-2 transition-all hover:scale-[1.03] hover:border-cyan-500/50"
                  >
                    <Icon className="h-7 w-7" style={{ color: item.color }} />
                    <span className="line-clamp-2 text-center text-[9px] font-semibold leading-tight text-zinc-400">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {boxes.length > 0 && (
          <div>
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Architecture Boxes</h4>
            <div className="grid grid-cols-2 gap-2">
              {boxes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Add ${item.name}`}
                  onClick={() => addArchitectureObject(createArchitectureCard(item.config))}
                  className="rounded-xl border border-white/[0.08] bg-[#11151D] p-2 text-left transition-all hover:border-emerald-500/50"
                  style={{ borderLeftColor: item.config.accentColor || '#43D68A', borderLeftWidth: 4 }}
                >
                  <span className="block truncate text-[9px] font-black text-zinc-200">{item.config.title}</span>
                  <span className="block truncate text-[8px] text-zinc-500">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {arrows.length > 0 && (
          <div>
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Arrow Marks</h4>
            <div className="grid grid-cols-2 gap-2">
              {arrows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Add ${item.name}`}
                  onClick={() => addArchitectureObject(createStandaloneDiagramArrow({ ...item, color: '#55A6FF' }))}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#11151D] p-2 text-left transition-all hover:border-blue-500/50"
                >
                  <ArrowRight
                    className="h-6 w-8 shrink-0 text-blue-400"
                    style={{
                      transform: `rotate(${item.angle || 0}deg)`,
                      strokeWidth: item.width && item.width > 4 ? 3 : 1.8,
                    }}
                  />
                  <span className="text-[9px] font-semibold leading-tight text-zinc-400">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {animatedFlows.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Animated Flow</h4>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[7px] font-bold text-emerald-300">LIVE</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {animatedFlows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Add ${item.name}`}
                  onClick={() => {
                    const preset = item.presetId ? getConnectorAnimationPreset(item.presetId) : undefined;
                    const presetConfig = preset?.connector || {};
                    addArchitectureObject(createStandaloneDiagramArrow({
                      ...presetConfig,
                      ...item.config,
                      name: item.name,
                      color: item.config.color || presetConfig.color || '#43D68A',
                      animation: {
                        ...presetConfig.animation,
                        ...item.config.animation,
                        enabled: true,
                      },
                    }));
                  }}
                  className="group rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-[#11151D] p-2 text-left transition-all hover:border-emerald-400/60"
                >
                  <div className="mb-1.5 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#43D68A]" />
                    <div className="h-px flex-1 border-t border-dashed border-emerald-400/70" />
                    <ArrowRight className="h-3 w-3 text-emerald-400" />
                  </div>
                  <span className="block text-[9px] font-semibold leading-tight text-zinc-400 group-hover:text-emerald-200">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {symbols.length === 0 && boxes.length === 0 && arrows.length === 0 && animatedFlows.length === 0 && components.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-xs text-zinc-400">No matching architecture elements</p>
            <button type="button" onClick={() => { setArchitectureSearch(''); setArchitectureCategory('All'); }} className="mt-2 text-[10px] text-cyan-400">
              Clear filters
            </button>
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: SHAPES (interactive)
  // ═══════════════════════════════════════════════════════════════════════════

  const insertShape = (def: ShapeDefinition) => {
    if (!canvas) return;
    const shape = def.create();
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.renderAll();
    saveHistory();
  };

  const renderShapeCard = (def: ShapeDefinition) => (
    <button
      key={def.id}
      onClick={() => insertShape(def)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-teckstudio-element', JSON.stringify({ kind: 'shape', id: def.id }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="aspect-square bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-violet-500/50 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:scale-[1.03] group overflow-hidden"
      title={def.name}
    >
      <div className="w-full h-full flex items-center justify-center p-2" dangerouslySetInnerHTML={{ __html: def.thumbnail() }} />
      <span className="text-[9px] font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors text-center px-1 leading-tight truncate w-full">{def.name}</span>
    </button>
  );

  const renderShapeRow = (catDef: { id: ShapeCategory; label: string }, shapes: ShapeDefinition[]) => (
    <div key={catDef.id}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{catDef.label}</h4>
        {shapes.length > 5 && (
          <button onClick={() => { setShapesSeeAll(catDef.id); setShapesSearch(''); }}
            className="text-[10px] font-semibold text-violet-400 hover:text-violet-300 cursor-pointer">
            See all ({shapes.length})
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shapes.slice(0, 8).map((def) => (
          <div key={def.id} className="shrink-0 w-[72px]">
            {renderShapeCard(def)}
          </div>
        ))}
      </div>
    </div>
  );

  const renderShapesSeeAll = () => {
    if (!shapesSeeAll) return null;
    const catDef = SHAPE_CATEGORIES.find((c) => c.id === shapesSeeAll);
    const filteredShapes = shapesSearchDebounced
      ? searchShapes(shapesSearchDebounced).filter((s) => s.category === shapesSeeAll)
      : SHAPE_REGISTRY.filter((s) => s.category === shapesSeeAll);
    return (
      <div className="space-y-3">
        <button onClick={() => setShapesSeeAll(null)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Shapes
        </button>
        <h4 className="text-sm font-bold text-zinc-200">{catDef?.label || shapesSeeAll}</h4>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={shapesSearch} onChange={(e) => setShapesSearch(e.target.value)}
            placeholder={`Search ${catDef?.label?.toLowerCase() || 'shapes'}...`}
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-violet-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {shapesSearch && <button onClick={() => setShapesSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>
        {filteredShapes.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Info className="w-6 h-6 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">No matching shapes found</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filteredShapes.map((def) => renderShapeCard(def))}
          </div>
        )}
      </div>
    );
  };

  const renderShapes = () => {
    if (shapesSeeAll) return renderShapesSeeAll();

    const displayedSearch = shapesSearchDebounced
      ? searchShapes(shapesSearchDebounced)
      : null;

    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={shapesSearch} onChange={(e) => setShapesSearch(e.target.value)}
            placeholder="Search shapes..."
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-violet-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {shapesSearch && <button onClick={() => setShapesSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>

        {displayedSearch ? (
          <div>
            <p className="text-[10px] text-zinc-500 mb-2">{displayedSearch.length} shapes found</p>
            {displayedSearch.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Info className="w-6 h-6 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">No matching shapes found</p>
                <button onClick={() => setShapesSearch('')} className="text-[10px] text-violet-400 hover:text-violet-300 cursor-pointer">Clear search</button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {displayedSearch.map((def) => renderShapeCard(def))}
              </div>
            )}
          </div>
        ) : (
          SHAPE_CATEGORIES.map((catDef) => {
            const shapes = SHAPES_BY_CATEGORY[catDef.id] || [];
            if (shapes.length === 0) return null;
            return renderShapeRow(catDef, shapes);
          })
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: FRAMES (interactive)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderFrames = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Frame Shapes</h4>
        <div className="grid grid-cols-3 gap-2">
          {FRAME_ITEMS.map((f) => (
            <button key={f.name} onClick={() => handleAddFrame(f.shape)}
              className="bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-violet-500/50 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all hover:scale-[1.03] group">
              <div className={f.shape === 'circle' ? 'w-8 h-8 rounded-full border-2 border-dashed border-violet-400' : f.shape === 'rounded' ? 'w-8 h-8 rounded-lg border-2 border-dashed border-violet-400' : 'w-8 h-8 border-2 border-dashed border-violet-400'} />
              <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">{f.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-zinc-600 text-center">Drag an image onto a frame to fill it</p>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: GRIDS (interactive)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderGrids = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Grid Layouts</h4>
        <div className="grid grid-cols-2 gap-2">
          {GRID_ITEMS.map((g) => (
            <button key={g.name} onClick={() => handleAddGrid(g.layout)}
              className="bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-violet-500/50 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.03] group">
              <div className={`border border-violet-400/60 group-hover:border-violet-300 transition-colors rounded ${g.layout === '2x2' ? 'grid grid-cols-2 gap-0.5 w-10 h-10' : 'flex gap-0.5 w-10 h-10'}`}>
                {Array.from({ length: g.cells }).map((_, i) => <div key={i} className="bg-violet-400/30 rounded-sm" />)}
              </div>
              <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">{g.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-zinc-600 text-center">Drag images into grid cells</p>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: CHARTS (interactive — full category layout)
  // ═══════════════════════════════════════════════════════════════════════════

  const CHART_SECTIONS = (ELEMENT_SECTIONS.chart || []) as string[];

  const getChartsByCategory = (category: string) =>
    CHART_ELEMENTS.filter((el) => el.kind === 'chart' && el.category === category);

  const searchAllCharts = (q: string) => {
    const lower = q.toLowerCase();
    return CHART_ELEMENTS.filter((el) =>
      el.kind === 'chart' && (
        el.name.toLowerCase().includes(lower) ||
        el.category.toLowerCase().includes(lower) ||
        (el.tags || []).some((t) => t.toLowerCase().includes(lower))
      )
    );
  };

  const renderChartCard = (el: EditorElement, compact = false) => {
    const cfg = el.chartConfig;
    const chartType = cfg?.chartType || 'bar';
    const colors = cfg?.datasets?.map((d) => d.color || '#8b5cf6') || ['#8b5cf6', '#22d3ee'];

    return (
      <button
        key={el.id}
        onClick={() => handleAddChart(el.id)}
        className={`${compact ? 'w-[110px] shrink-0' : 'aspect-[4/3]'} bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-green-500/50 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:scale-[1.03] group overflow-hidden`}
        title={el.name}
      >
        <div className="w-full flex-1 flex items-end justify-center gap-[3px] px-3 pt-2 pb-1">
          {chartType.includes('pie') || chartType.includes('donut') ? (
            <div className="relative w-10 h-10">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                {(() => {
                  const segs = [35, 25, 22, 18]; let acc = 0;
                  return segs.map((seg, i) => { const dash = seg; const off = acc; acc += dash; return <circle key={i} cx="18" cy="18" r="15.9" fill="none" stroke={colors[i % colors.length]} strokeWidth="5" strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={`${-off}`} />; });
                })()}
              </svg>
              {chartType === 'donut' && <div className="absolute inset-0 flex items-center justify-center"><div className="w-5 h-5 rounded-full bg-[#12121B]" /></div>}
            </div>
          ) : chartType.includes('line') || chartType === 'area' ? (
            <svg viewBox="0 0 60 30" className="w-14 h-7">
              {chartType === 'area' && <path d="M2 24 L14 14 L26 18 L38 8 L50 12 L58 6 L58 30 L2 30 Z" fill={colors[0]} opacity="0.3" />}
              <polyline points="2,24 14,14 26,18 38,8 50,12 58,6" fill="none" stroke={colors[0]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : chartType.includes('scatter') || chartType.includes('bubble') ? (
            <svg viewBox="0 0 50 30" className="w-12 h-7">
              {[[10, 22, 4], [18, 12, 5], [28, 18, 3], [38, 8, 6], [44, 14, 4]].map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={colors[i % colors.length]} opacity="0.8" />)}
            </svg>
          ) : chartType === 'funnel' ? (
            <svg viewBox="0 0 50 30" className="w-12 h-7">
              <path d="M5 2 H45 L40 8 H10 Z" fill={colors[0]} opacity="0.9" />
              <path d="M10 11 H40 L36 17 H14 Z" fill={colors[1] || colors[0]} opacity="0.7" />
              <path d="M14 20 H36 L33 26 H17 Z" fill={colors[0]} opacity="0.5" />
            </svg>
          ) : chartType === 'gauge' ? (
            <svg viewBox="0 0 50 30" className="w-12 h-7">
              <path d="M8 26 A17 17 0 0 1 42 26" fill="none" stroke="#3f3f46" strokeWidth="4" strokeLinecap="round" />
              <path d="M8 26 A17 17 0 0 1 34 12" fill="none" stroke={colors[0]} strokeWidth="4" strokeLinecap="round" />
            </svg>
          ) : chartType === 'radar' ? (
            <svg viewBox="0 0 50 40" className="w-12 h-9">
              <polygon points="25,4 44,14 38,34 12,34 6,14" fill="none" stroke="#3f3f46" strokeWidth="1" />
              <polygon points="25,8 38,16 34,30 16,30 12,16" fill={colors[0]} opacity="0.4" stroke={colors[0]} strokeWidth="1.5" />
            </svg>
          ) : chartType === 'timeline' ? (
            <svg viewBox="0 0 60 16" className="w-14 h-4">
              <line x1="4" y1="8" x2="56" y2="8" stroke="#3f3f46" strokeWidth="2" />
              {[12, 24, 36, 48].map((cx, i) => <circle key={i} cx={cx} cy="8" r="4" fill={i % 2 ? (colors[1] || colors[0]) : colors[0]} />)}
            </svg>
          ) : (
            <>
              {(cfg?.datasets?.[0]?.values || [34, 58, 42, 76]).slice(0, 6).map((v, i) => (
                <div key={i} className="rounded-sm transition-all" style={{ width: '14%', height: `${Math.max(20, (v / 80) * 100)}%`, backgroundColor: i % 2 ? (colors[1] || colors[0]) : colors[0], opacity: 0.9 }} />
              ))}
            </>
          )}
        </div>
        <span className="text-[9px] font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors text-center px-1 leading-tight truncate w-full">{el.name}</span>
      </button>
    );
  };

  const renderChartRow = (categoryLabel: string, items: EditorElement[]) => {
    if (items.length === 0) return null;
    return (
      <div key={categoryLabel}>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{categoryLabel}</h4>
          {items.length > 4 && (
            <button onClick={() => { setChartSeeAll(categoryLabel); setChartSearch(''); }}
              className="text-[10px] font-semibold text-green-400 hover:text-green-300 cursor-pointer">
              See all ({items.length})
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.slice(0, 8).map((el) => renderChartCard(el, true))}
        </div>
      </div>
    );
  };

  const renderChartSeeAll = () => {
    if (!chartSeeAll) return null;
    const items = chartSearchDebounced
      ? searchAllCharts(chartSearchDebounced).filter((el) => el.category === chartSeeAll)
      : getChartsByCategory(chartSeeAll);
    return (
      <div className="space-y-3">
        <button onClick={() => setChartSeeAll(null)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Charts
        </button>
        <h4 className="text-sm font-bold text-zinc-200">{chartSeeAll}</h4>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={chartSearch} onChange={(e) => setChartSearch(e.target.value)}
            placeholder={`Search ${chartSeeAll.toLowerCase()}...`}
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-green-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {chartSearch && <button onClick={() => setChartSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>
        {items.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Info className="w-6 h-6 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">No matching charts found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((el) => renderChartCard(el))}
          </div>
        )}
      </div>
    );
  };

  const renderCharts = () => {
    if (chartSeeAll) return renderChartSeeAll();

    const filteredSearch = chartSearchDebounced ? searchAllCharts(chartSearchDebounced) : null;

    return (
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={chartSearch} onChange={(e) => setChartSearch(e.target.value)}
            placeholder="Search charts or describe the chart you need"
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-green-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {chartSearch && <button onClick={() => setChartSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>

        {/* Start with data */}
        <button onClick={() => setShowDataEditor(true)}
          className="w-full flex items-center gap-3 bg-green-500/10 border border-green-500/30 hover:border-green-500/60 rounded-xl px-4 py-3 transition-all cursor-pointer group">
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Plus className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-green-300 group-hover:text-green-200">Start with data</p>
            <p className="text-[10px] text-zinc-500">Import CSV or enter data to create a chart</p>
          </div>
        </button>

        {filteredSearch ? (
          <div>
            <p className="text-[10px] text-zinc-500 mb-2">{filteredSearch.length} charts found</p>
            {filteredSearch.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Info className="w-6 h-6 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">No matching charts found</p>
                <button onClick={() => setChartSearch('')} className="text-[10px] text-green-400 hover:text-green-300 cursor-pointer">Clear search</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {filteredSearch.map((el) => renderChartCard(el))}
              </div>
            )}
          </div>
        ) : (
          CHART_SECTIONS.map((section) => {
            const items = getChartsByCategory(section);
            return renderChartRow(section, items);
          })
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: TABLES (interactive)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderTables = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Table Presets</h4>
        <div className="grid grid-cols-2 gap-2">
          {TABLE_ITEMS.map((t) => (
            <button key={t.name} onClick={() => handleAddTable(t.rows, t.cols)}
              className="bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-violet-500/50 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all hover:scale-[1.03] group">
              <Table2 className="w-6 h-6 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors text-center">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: FORMS (interactive)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderForms = () => {
    if (formSeeAll) {
      const catDef = FORM_CATEGORIES.find((c) => c.id === formSeeAll);
      const filtered = formSearchDebounced
        ? searchForms(formSearchDebounced).filter((f) => f.category === formSeeAll)
        : FORMS_REGISTRY.filter((f) => f.category === formSeeAll);
      return (
        <div className="space-y-3">
          <button onClick={() => setFormSeeAll(null)}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Forms
          </button>
          <h4 className="text-sm font-bold text-zinc-200">{catDef?.label || formSeeAll}</h4>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input type="text" value={formSearch} onChange={(e) => setFormSearch(e.target.value)}
              placeholder={`Search ${catDef?.label?.toLowerCase() || 'forms'}...`}
              className="w-full bg-[#12121B] border border-white/[0.08] focus:border-sky-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
            {formSearch && <button onClick={() => setFormSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Info className="w-6 h-6 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400">No matching forms found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((tmpl) => (
                <button key={tmpl.id}
                  onClick={() => {
                    if (!canvas) return;
                    const obj = tmpl.create();
                    canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll(); saveHistory();
                  }}
                  className="bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-sky-500/50 rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] group text-left"
                  title={tmpl.name}
                >
                  <div className="w-full h-32 flex items-center justify-center bg-zinc-950/50 p-2" dangerouslySetInnerHTML={{ __html: tmpl.thumbnail() }} />
                  <div className="p-2 border-t border-white/[0.08]/60">
                    <span className="text-[10px] font-semibold text-zinc-300 group-hover:text-sky-300 transition-colors block truncate">{tmpl.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    const displayedSearch = formSearchDebounced ? searchForms(formSearchDebounced) : null;

    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={formSearch} onChange={(e) => setFormSearch(e.target.value)}
            placeholder="Search form templates..."
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-sky-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {formSearch && <button onClick={() => setFormSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>

        {displayedSearch ? (
          <div>
            <p className="text-[10px] text-zinc-500 mb-2">{displayedSearch.length} form templates</p>
            {displayedSearch.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Info className="w-6 h-6 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">No matching forms found</p>
                <button onClick={() => setFormSearch('')} className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer">Clear search</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {displayedSearch.map((tmpl) => (
                  <button key={tmpl.id}
                    onClick={() => {
                      if (!canvas) return;
                      const obj = tmpl.create();
                      canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll(); saveHistory();
                    }}
                    className="bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-sky-500/50 rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] group text-left"
                    title={tmpl.name}
                  >
                    <div className="w-full h-32 flex items-center justify-center bg-zinc-950/50 p-2" dangerouslySetInnerHTML={{ __html: tmpl.thumbnail() }} />
                    <div className="p-2 border-t border-white/[0.08]/60">
                      <span className="text-[10px] font-semibold text-zinc-300 group-hover:text-sky-300 transition-colors block truncate">{tmpl.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          FORM_CATEGORIES.map((catDef) => {
            const items = FORMS_BY_CATEGORY[catDef.id] || [];
            if (items.length === 0) return null;
            return (
              <div key={catDef.id}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{catDef.label}</h4>
                  {items.length > 3 && (
                    <button onClick={() => { setFormSeeAll(catDef.id); setFormSearch(''); }}
                      className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 cursor-pointer">
                      See all ({items.length})
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {items.slice(0, 4).map((tmpl) => (
                    <button key={tmpl.id}
                      onClick={() => {
                        if (!canvas) return;
                        const obj = tmpl.create();
                        canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll(); saveHistory();
                      }}
                      className="bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-sky-500/50 rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] group text-left"
                      title={tmpl.name}
                    >
                      <div className="w-full h-28 flex items-center justify-center bg-zinc-950/50 p-2" dangerouslySetInnerHTML={{ __html: tmpl.thumbnail() }} />
                      <div className="p-1.5 border-t border-white/[0.08]/60">
                        <span className="text-[9px] font-semibold text-zinc-400 group-hover:text-sky-300 transition-colors block truncate">{tmpl.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: CODE (interactive)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderTechnicalInfographic = () => {
    const accent = getTechnicalAccent(technicalAccentId);
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <h4 className="text-[10px] font-bold text-emerald-300 mb-2 uppercase tracking-wider">Technical Accent Theme</h4>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {TECHNICAL_ACCENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTechnicalAccentId(item.id)}
                className={`rounded-lg border p-2 text-left transition-colors ${technicalAccentId === item.id ? 'border-emerald-400 bg-zinc-950' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'}`}
                title={item.label}
              >
                <span className="block h-3 w-full rounded-full" style={{ backgroundColor: item.color }} />
                <span className="mt-1 block text-[8px] font-bold text-zinc-300 uppercase">{item.id}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={handleApplyTechnicalAccent} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[10px] font-bold text-zinc-300 hover:border-emerald-400 hover:text-emerald-300">Apply to Selected</button>
            <button type="button" onClick={handleAddTechnicalBackground} className="rounded-lg border border-zinc-800 bg-[#080D0B] px-3 py-2 text-[10px] font-bold text-emerald-300 hover:border-emerald-400">Dark Background</button>
          </div>
        </div>

        <div>
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Technical Infographic Components</h4>
          <div className="grid grid-cols-1 gap-2">
            {TECHNICAL_COMPONENT_ITEMS.map((component) => (
              <button key={component.id} type="button" onClick={() => handleAddTechnicalComponent(component.id)} className="flex items-center gap-2 p-3 bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer text-left group">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-300 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors"><Workflow className="w-4 h-4" /></div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-zinc-200 truncate">{component.label}</h4>
                  <p className="text-[9px] text-zinc-500">{component.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Technical / Infographic</h4>
          <div className="flex flex-col gap-3">
            {Array.from(new Set(TECHNICAL_ELEMENT_ITEMS.map((item) => item.group))).map((group) => (
              <div key={group}>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">{group}</p>
                <div className="grid grid-cols-2 gap-2">
                  {TECHNICAL_ELEMENT_ITEMS.filter((item) => item.group === group).map((item) => (
                    <button key={item.id} type="button" onClick={() => handleAddTechnicalElement(item.id)} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-2 text-left text-[10px] font-semibold text-zinc-300 hover:border-emerald-500/50 hover:bg-zinc-800">
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accent.color }} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] p-3 text-[10px] text-zinc-500" style={{ backgroundColor: TECHNICAL_DARK_BACKGROUND }}>
          Inserts are editable Fabric.js groups. Use the object toolbar/layers to ungroup, move, resize, and recolor individual parts.
        </div>
      </div>
    );
  };

  const renderCode = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Code Elements</h4>
        <div className="grid grid-cols-2 gap-2">
          {CODE_ITEMS.map((c) => (
            <button key={c.type} onClick={() => handleAddCodeBlock(c.type)}
              className="bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-violet-500/50 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.03] group">
              <c.icon className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-zinc-600 text-center">Visual code mockups — not executable code</p>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: GENERIC ASSET CATEGORY (images, graphics, 3d)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderAssetCategory = (cat: CategoryConfig) => {
    const subcats = cat.subcategories || [];
    return (
      <div className="space-y-4">
        {subcats.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {subcats.map((sub) => (
              <button key={sub} onClick={() => handleSubcategoryClick(sub)}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all cursor-pointer ${activeSubcategory === sub ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'}`}>
                {sub}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>{loading ? 'Loading...' : `${elements.length} elements`}</span>
          {activeSubcategory && <button onClick={() => setActiveSubcategory(null)} className="font-semibold text-violet-400 hover:text-violet-300">Clear</button>}
        </div>
        {loading && elements.length === 0 ? renderSkeleton()
          : elements.length === 0 ? renderEmptyState('No elements found', 'Try a different search or category')
          : <div className="grid grid-cols-3 gap-2">{elements.map((item) => renderAssetCard(item))}</div>}
        {hasMore && !loading && (
          <button onClick={loadMore} className="w-full bg-[#12121B] border border-white/[0.08] hover:border-violet-500/50 rounded-xl py-2.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer">
            Load more
          </button>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: RECENT / FAVORITES
  // ═══════════════════════════════════════════════════════════════════════════

  const renderRecent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>{loading ? 'Loading...' : `${recents.length} items`}</span>
      </div>
      {loading ? renderSkeleton(6)
        : recents.length === 0 ? renderEmptyState('No recent elements', 'Elements you use will appear here')
        : <div className="grid grid-cols-3 gap-2">{recents.map((item) => renderAssetCard(item))}</div>}
    </div>
  );

  const renderFavorites = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>{loading ? 'Loading...' : `${favorites.length} favorites`}</span>
      </div>
      {loading ? renderSkeleton(6)
        : favorites.length === 0 ? renderEmptyState('No favorites yet', 'Heart an element to save it here')
        : <div className="grid grid-cols-3 gap-2">{favorites.map((item) => renderAssetCard(item))}</div>}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: ANIMATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const insertAnimation = (def: AnimationDefinition) => {
    if (!canvas) return;
    const obj = def.create();
    const fullText = ['text', 'i-text', 'textbox'].includes(obj.type || '')
      ? String((obj as fabric.Text).text || '')
      : undefined;
    obj.set({
      animationConfig: {
        format: 'teckstudio-timestamp-v1',
        animationType: def.preset,
        durationMs: def.durationMs,
        delayMs: 0,
        easing: 'ease-in-out',
        loop: def.loop,
        sourceAnimationId: def.id,
        fullText,
      },
      isAnimated: true,
      animatedExportSupported: true,
      timelineBaseVisible: obj.visible !== false,
    } as Record<string, unknown>);
    canvas.add(obj);
    canvas.setActiveObject(obj);
    canvas.renderAll();
    saveHistory();
    // Start the animation
    const cleanup = def.animate(obj, canvas);
    registerAnimation(def.id, cleanup);
  };

  const renderAnimCard = (def: AnimationDefinition) => (
    <button
      key={def.id}
      onClick={() => insertAnimation(def)}
      className="aspect-square bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-orange-500/50 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:scale-[1.03] group overflow-hidden relative"
      title={def.name}
    >
      <div
        className="w-full h-full flex items-center justify-center p-2"
        dangerouslySetInnerHTML={{ __html: def.thumbnail() }}
      />
      <div className="absolute top-1 right-1 bg-orange-500/80 rounded-full w-3.5 h-3.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[7px] text-white font-bold">▶</span>
      </div>
      <span className="text-[9px] font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors text-center px-1 leading-tight truncate w-full">{def.name}</span>
    </button>
  );

  const renderAnimRow = (catDef: { id: AnimationCategory; label: string }, anims: AnimationDefinition[]) => (
    <div key={catDef.id}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{catDef.label}</h4>
        {anims.length > 5 && (
          <button onClick={() => { setAnimSeeAll(catDef.id); setAnimSearch(''); }}
            className="text-[10px] font-semibold text-orange-400 hover:text-orange-300 cursor-pointer">
            See all ({anims.length})
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {anims.slice(0, 6).map((def) => (
          <div key={def.id} className="shrink-0 w-[72px]">
            {renderAnimCard(def)}
          </div>
        ))}
      </div>
    </div>
  );

  const renderAnimationsSeeAll = () => {
    if (!animSeeAll) return null;
    const catDef = ANIMATION_CATEGORIES.find((c) => c.id === animSeeAll);
    const filtered = animSearchDebounced
      ? searchAnimations(animSearchDebounced).filter((a) => a.category === animSeeAll)
      : ANIMATION_REGISTRY.filter((a) => a.category === animSeeAll);
    return (
      <div className="space-y-3">
        <button onClick={() => setAnimSeeAll(null)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Animations
        </button>
        <h4 className="text-sm font-bold text-zinc-200">{catDef?.label || animSeeAll}</h4>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={animSearch} onChange={(e) => setAnimSearch(e.target.value)}
            placeholder={`Search ${catDef?.label?.toLowerCase() || 'animations'}...`}
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-orange-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {animSearch && <button onClick={() => setAnimSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Info className="w-6 h-6 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">No matching animations found</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filtered.map((def) => renderAnimCard(def))}
          </div>
        )}
      </div>
    );
  };

  const renderAnimations = () => {
    if (animSeeAll) return renderAnimationsSeeAll();

    const displayedSearch = animSearchDebounced ? searchAnimations(animSearchDebounced) : null;
    const recommended = getRecommendations();

    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={animSearch} onChange={(e) => setAnimSearch(e.target.value)}
            placeholder="Search animations..."
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-orange-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {animSearch && <button onClick={() => setAnimSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>

        {displayedSearch ? (
          <div>
            <p className="text-[10px] text-zinc-500 mb-2">{displayedSearch.length} animations found</p>
            {displayedSearch.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Info className="w-6 h-6 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">No matching animations found</p>
                <button onClick={() => setAnimSearch('')} className="text-[10px] text-orange-400 hover:text-orange-300 cursor-pointer">Clear search</button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {displayedSearch.map((def) => renderAnimCard(def))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Magic Recommendations */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Magic Recommendations</h4>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {recommended.slice(0, 6).map((def) => (
                  <div key={def.id} className="shrink-0 w-[72px]">{renderAnimCard(def)}</div>
                ))}
              </div>
            </div>

            {/* Category rows */}
            {ANIMATION_CATEGORIES.filter((c) => c.id !== 'recommendation').map((catDef) => {
              const anims = ANIMATIONS_BY_CATEGORY[catDef.id] || [];
              if (anims.length === 0) return null;
              return renderAnimRow(catDef, anims);
            })}
          </>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: PHOTOS (dedicated with search/generate, filters, masonry)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleGeneratePhoto = async () => {
    if (!photoPrompt.trim()) return;
    setPhotoGenerating(true);
    setPhotoError('');
    try {
      const res = await apiFetch('/api/ai/generate-image', {
        method: 'POST',
        body: JSON.stringify({ prompt: photoPrompt, width: 1024, height: 1024 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url || data.image_url) {
          const url = data.url || data.image_url;
          // Insert generated photo directly onto canvas
          if (canvas) {
            fabric.Image.fromURL(url, (img) => {
              if (!img) return;
              const maxW = Math.min(420, (canvas.width || 800) * 0.6);
              const maxH = Math.min(420, (canvas.height || 800) * 0.6);
              const scale = img.width && img.height ? Math.min(maxW / img.width, maxH / img.height, 1) : 1;
              img.set({
                left: (canvas.width || 800) / 2 - ((img.width || 200) * scale) / 2,
                top: (canvas.height || 800) / 2 - ((img.height || 200) * scale) / 2,
                scaleX: scale, scaleY: scale,
                name: `AI Photo: ${photoPrompt.substring(0, 30)}`,
                id: `ai_photo_${Date.now()}`,
              } as any);
              canvas.add(img); canvas.setActiveObject(img); canvas.renderAll(); saveHistory();
            }, { crossOrigin: 'anonymous' });
          }
          setPhotoPrompt('');
        } else {
          setPhotoError('No image was generated. Please try a different prompt.');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setPhotoError(errData.detail?.message || errData.detail || 'Generation failed. Please try again.');
      }
    } catch {
      setPhotoError('Network error. Please check your connection.');
    } finally {
      setPhotoGenerating(false);
    }
  };

  const renderPhotos = () => {
    const photoCat = CATEGORY_CONFIGS.find((c) => c.id === 'images');
    const subcats = photoCat?.subcategories || [];
    const currentDisplayElements = elements;

    const RECOMMENDED_CATEGORIES = [
      { label: 'Nature', query: 'nature landscape', color: 'from-green-500/20 to-emerald-500/20' },
      { label: 'Business', query: 'business office', color: 'from-blue-500/20 to-cyan-500/20' },
      { label: 'Technology', query: 'technology futuristic', color: 'from-purple-500/20 to-violet-500/20' },
      { label: 'Food', query: 'food photography', color: 'from-orange-500/20 to-amber-500/20' },
      { label: 'Travel', query: 'travel destination', color: 'from-pink-500/20 to-rose-500/20' },
      { label: 'Fitness', query: 'fitness workout', color: 'from-red-500/20 to-orange-500/20' },
    ];

    return (
      <div className="space-y-3">
        {/* Search / Generate Input */}
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={photoPrompt}
              onChange={(e) => setPhotoPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (photoMode === 'search') { setSearchQuery(photoPrompt); }
                  else { handleGeneratePhoto(); }
                }
              }}
              placeholder={photoMode === 'search' ? 'Search photos or describe an AI photo' : 'Describe the photo you want to generate'}
              className="w-full bg-[#12121B] border border-white/[0.08] focus:border-blue-500 rounded-xl pl-3 pr-20 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {photoPrompt && (
                <button onClick={() => { setPhotoPrompt(''); setSearchQuery(''); }} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => {
                  if (photoMode === 'search') { setSearchQuery(photoPrompt); }
                  else { handleGeneratePhoto(); }
                }}
                disabled={photoGenerating || !photoPrompt.trim()}
                className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {photoGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : photoMode === 'search' ? <Search className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Mode selector */}
          <div className="flex gap-1">
            <button onClick={() => setPhotoMode('search')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${photoMode === 'search' ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}>
              <Search className="w-3 h-3 inline mr-1" /> Search
            </button>
            <button onClick={() => setPhotoMode('generate')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${photoMode === 'generate' ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}>
              <Sparkles className="w-3 h-3 inline mr-1" /> AI Generate
            </button>
          </div>

          {/* Error */}
          {photoError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-[10px] text-red-300">
              {photoError}
              <button onClick={() => setPhotoError('')} className="ml-2 underline">Dismiss</button>
            </div>
          )}
        </div>

        {/* Orientation filters */}
        {photoMode === 'search' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {['All', 'Square', 'Landscape', 'Portrait'].map((orient) => (
              <button key={orient} onClick={() => setPhotoOrientation(orient === 'All' ? null : orient.toLowerCase())}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all cursor-pointer ${photoOrientation === (orient === 'All' ? null : orient.toLowerCase()) || (orient === 'All' && !photoOrientation) ? 'border-blue-500/50 bg-blue-500/15 text-blue-300' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'}`}>
                {orient}
              </button>
            ))}
          </div>
        )}

        {/* Subcategory chips */}
        {photoMode === 'search' && subcats.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {subcats.map((sub: string) => (
              <button key={sub} onClick={() => handleSubcategoryClick(sub)}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all cursor-pointer ${activeSubcategory === sub ? 'border-blue-500/50 bg-blue-500/15 text-blue-300' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'}`}>
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* Recommended categories - only show when no search query */}
        {photoMode === 'search' && !photoPrompt && !activeSubcategory && (
          <div>
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Recommended categories</h4>
            <div className="grid grid-cols-3 gap-2">
              {RECOMMENDED_CATEGORIES.map((cat) => (
                <button key={cat.label}
                  onClick={() => { setPhotoPrompt(cat.query); setSearchQuery(cat.query); }}
                  className={`bg-gradient-to-br ${cat.color} border border-white/[0.08]/60 hover:border-zinc-600 rounded-xl p-3 text-center cursor-pointer transition-all hover:scale-[1.03] group`}>
                  <span className="text-[10px] font-semibold text-zinc-300 group-hover:text-white transition-colors">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results count */}
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>{loading ? 'Loading photos...' : `${currentDisplayElements.length} photos`}</span>
          {activeSubcategory && (
            <button onClick={() => setActiveSubcategory(null)} className="font-semibold text-blue-400 hover:text-blue-300">Clear filter</button>
          )}
        </div>

        {/* Photo grid - masonry-style with varying heights */}
        {loading && currentDisplayElements.length === 0 ? (
          <div className="columns-2 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl bg-[#12121B] border border-white/[0.08]/50 mb-2" style={{ height: `${80 + (i % 3) * 40}px` }} />
            ))}
          </div>
        ) : currentDisplayElements.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <Image className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">No photos found</p>
            <p className="text-[10px] text-zinc-600">Try a different search or category</p>
          </div>
        ) : (
          <div className="columns-2 gap-2">
            {currentDisplayElements.map((item) => {
              const resolvedThumb = resolveAssetUrl(item.thumbnailUrl || item.sourceUrl);
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-teckstudio-photo', JSON.stringify({
                      id: item.id, name: item.title, kind: 'photo', category: item.category,
                      sourceUrl: item.sourceUrl || item.thumbnailUrl, thumbnailUrl: item.thumbnailUrl,
                      tags: item.tags || [], isPremium: item.isPremium,
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => handleInsertElement(item)}
                  className="group relative break-inside-avoid mb-2 bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-blue-500/50 rounded-xl cursor-pointer transition-all hover:shadow-xl overflow-hidden"
                  title={item.title}
                >
                  <img
                    src={resolvedThumb}
                    alt=""
                    loading="lazy"
                    onError={(e) => handleThumbnailError(e, DEFAULT_ASSET_FALLBACK_SVG)}
                    className="w-full object-cover pointer-events-none"
                    style={{ minHeight: '100px', maxHeight: '240px' }}
                  />
                  {/* Hover overlay with title and actions */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                    <div className="flex items-end justify-between">
                      <span className="text-[9px] font-medium text-white truncate flex-1 mr-1">{item.title}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
                          className="p-1 rounded-md bg-black/60 text-zinc-400 hover:text-pink-400 transition-colors"
                          title="Favorite"
                        >
                          <Heart className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleInsertElement(item); }}
                          className="p-1 rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          title="Add to canvas"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Premium badge */}
                  {item.isPremium && (
                    <span className="absolute top-1.5 left-1.5 bg-amber-400 text-amber-950 text-[7px] font-black px-1.5 py-0.5 rounded-full">PRO</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <button onClick={loadMore}
            className="w-full bg-[#12121B] border border-white/[0.08] hover:border-blue-500/50 rounded-xl py-2.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer">
            Load more
          </button>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: GRAPHICS (dedicated with AI & Technology library)
  // ═══════════════════════════════════════════════════════════════════════════

  const insertGraphic = (def: GraphicDefinition) => {
    if (!canvas) return;
    const svgContent = def.svg();
    loadSVGElement(svgContent, { name: def.name }).then((obj) => {
      centerOnCanvas(obj, 120);
      canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll(); saveHistory();
    }).catch(() => {
      // Fallback: insert as image from SVG data URI
      const dataUri = 'data:image/svg+xml;base64,' + btoa(svgContent);
      fabric.Image.fromURL(dataUri, (img) => {
        if (!img) return;
        centerOnCanvas(img, 120);
        img.set({ name: def.name, id: `gfx_${def.id}_${Date.now()}` } as any);
        img.setCoords(); canvas.add(img); canvas.setActiveObject(img); canvas.renderAll(); saveHistory();
      }, { crossOrigin: 'anonymous' });
    });
  };

  const renderGfxCard = (def: GraphicDefinition) => (
    <button
      key={def.id}
      onClick={() => insertGraphic(def)}
      className="aspect-square bg-[#12121B]/80 border border-white/[0.08]/60 hover:border-purple-500/50 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-all hover:scale-[1.03] group overflow-hidden relative"
      title={def.name}
    >
      <div className="w-full h-full flex items-center justify-center p-2" dangerouslySetInnerHTML={{ __html: def.svg() }} />
      <span className="text-[9px] font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors text-center px-1 leading-tight truncate w-full">{def.name}</span>
    </button>
  );

  const renderGfxRow = (catDef: { id: GraphicCategory; label: string }, items: GraphicDefinition[]) => (
    <div key={catDef.id}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{catDef.label}</h4>
        {items.length > 5 && (
          <button onClick={() => { setGfxSeeAll(catDef.id); setGfxSearch(''); }}
            className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 cursor-pointer">
            See all ({items.length})
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.slice(0, 6).map((def) => (
          <div key={def.id} className="shrink-0 w-[72px]">{renderGfxCard(def)}</div>
        ))}
      </div>
    </div>
  );

  const renderGraphicsSeeAll = () => {
    if (!gfxSeeAll) return null;
    const catDef = GRAPHIC_CATEGORIES.find((c) => c.id === gfxSeeAll);
    const filtered = gfxSearchDebounced
      ? searchGraphics(gfxSearchDebounced).filter((g) => g.category === gfxSeeAll)
      : GRAPHICS_REGISTRY.filter((g) => g.category === gfxSeeAll);
    return (
      <div className="space-y-3">
        <button onClick={() => setGfxSeeAll(null)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Graphics
        </button>
        <h4 className="text-sm font-bold text-zinc-200">{catDef?.label || gfxSeeAll}</h4>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={gfxSearch} onChange={(e) => setGfxSearch(e.target.value)}
            placeholder={`Search ${catDef?.label?.toLowerCase() || 'graphics'}...`}
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-purple-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {gfxSearch && <button onClick={() => setGfxSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Info className="w-6 h-6 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">No matching graphics found</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filtered.map((def) => renderGfxCard(def))}
          </div>
        )}
      </div>
    );
  };

  const renderGraphics = () => {
    if (gfxSeeAll) return renderGraphicsSeeAll();

    const displayedSearch = gfxSearchDebounced ? searchGraphics(gfxSearchDebounced) : null;

    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input type="text" value={gfxSearch} onChange={(e) => setGfxSearch(e.target.value)}
            placeholder="Search AI & Technology graphics..."
            className="w-full bg-[#12121B] border border-white/[0.08] focus:border-purple-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
          {gfxSearch && <button onClick={() => setGfxSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
        </div>

        {displayedSearch ? (
          <div>
            <p className="text-[10px] text-zinc-500 mb-2">{displayedSearch.length} graphics found</p>
            {displayedSearch.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Info className="w-6 h-6 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">No matching graphics found</p>
                <button onClick={() => setGfxSearch('')} className="text-[10px] text-purple-400 hover:text-purple-300 cursor-pointer">Clear search</button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {displayedSearch.map((def) => renderGfxCard(def))}
              </div>
            )}
          </div>
        ) : (
          GRAPHIC_CATEGORIES.map((catDef) => {
            const items = GRAPHICS_BY_CATEGORY[catDef.id] || [];
            if (items.length === 0) return null;
            return renderGfxRow(catDef, items);
          })
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: CATEGORY CONTENT ROUTER
  // ═══════════════════════════════════════════════════════════════════════════

  const renderCategoryContent = () => {
    if (!activeCategory) return null;
    if (activeCategory === 'recents') return renderRecent();
    if (activeCategory === 'favorites') return renderFavorites();

    const cat = CATEGORY_CONFIGS.find((c) => c.id === activeCategory);
    if (!cat) return renderEmptyState('Unknown category');

    if (cat.type === 'unsupported') return renderUnsupported(cat);
    if (cat.id === 'images') return renderPhotos();
    if (cat.id === 'graphics') return renderGraphics();
    if (cat.type === 'interactive') {
      switch (cat.id) {
        case 'architecture': return renderArchitectureLibrary();
        case 'technical-infographic': return renderTechnicalInfographic();
        case 'shapes': return renderShapes();
        case 'frames': return renderFrames();
        case 'grids': return renderGrids();
        case 'charts': return renderCharts();
        case 'tables': return renderTables();
        case 'forms': return renderForms();
        case 'code': return renderCode();
        case 'animations': return renderAnimations();
        default: return renderEmptyState('Coming soon');
      }
    }
    return renderAssetCategory(cat);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: LAUNCHER
  // ═══════════════════════════════════════════════════════════════════════════

  const renderLauncher = () => (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => handleCategoryClick('recents')}
          className="flex-1 flex items-center gap-2 bg-[#12121B]/80 border border-white/[0.08] hover:border-violet-500/50 rounded-xl p-3 transition-all cursor-pointer group">
          <Clock className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors" />
          <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors">Recent</span>
        </button>
        <button onClick={() => handleCategoryClick('favorites')}
          className="flex-1 flex items-center gap-2 bg-[#12121B]/80 border border-white/[0.08] hover:border-pink-500/50 rounded-xl p-3 transition-all cursor-pointer group">
          <Heart className="w-4 h-4 text-zinc-500 group-hover:text-pink-400 transition-colors" />
          <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors">Favorites</span>
        </button>
      </div>
      <div>
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Browse Categories</h4>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORY_CONFIGS.map((cat) => {
            const Icon = cat.icon;
            return (
              <button key={cat.id} onClick={() => handleCategoryClick(cat.id)}
                className={`relative overflow-hidden bg-gradient-to-br ${cat.gradient} border border-white/[0.08]/60 hover:border-zinc-600 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer hover:scale-[1.03] hover:shadow-lg group aspect-square`}
                title={cat.label}>
                <Icon className={`w-6 h-6 ${cat.iconColor} group-hover:scale-110 transition-transform`} />
                <span className="text-[10px] font-semibold text-zinc-300 group-hover:text-white transition-colors text-center leading-tight">{cat.label}</span>
                {cat.type === 'unsupported' && (
                  <span className="absolute top-1 right-1 text-[7px] font-bold text-zinc-500 bg-zinc-800/80 rounded px-1">SOON</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: AI PROMPT
  // ═══════════════════════════════════════════════════════════════════════════

  const renderAIPrompt = () => (
    <div className="space-y-2">
      <div className="relative">
        <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (generateMode === 'search') setSearchQuery(aiPrompt);
            else handleGenerateAIElement();
          }}
          placeholder="Describe the element you want"
          className="w-full bg-[#12121B] border border-white/[0.08] focus:border-violet-500 rounded-xl pl-3 pr-20 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {aiPrompt && <button onClick={() => { setAiPrompt(''); setSearchQuery(''); }} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-3.5 h-3.5" /></button>}
          <button onClick={() => {
            if (generateMode === 'search') setSearchQuery(aiPrompt);
            else handleGenerateAIElement();
          }}
            disabled={aiLoading || !aiPrompt.trim()}
            className="p-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-white disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : generateMode === 'search' ? <Search className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GENERATE_MODES.map((mode) => (
          <button key={mode.value} onClick={() => setGenerateMode(mode.value)}
            className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${generateMode === mode.value ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}>
            {mode.label}
          </button>
        ))}
      </div>
      {aiError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-[10px] text-red-300">{aiError}</div>}
      {recentPrompts.length > 0 && view === 'launcher' && (
        <div className="flex flex-wrap gap-1">
          {recentPrompts.map((p, i) => (
            <button key={i} onClick={() => { setAiPrompt(p); setSearchQuery(p); }}
              className="text-[9px] text-zinc-600 hover:text-zinc-400 bg-[#12121B]/50 border border-white/[0.08]/50 rounded-full px-2 py-0.5 transition-colors cursor-pointer">
              {p.length > 25 ? p.slice(0, 25) + '...' : p}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: SEARCH BAR (in category view)
  // ═══════════════════════════════════════════════════════════════════════════

  const renderSearchBar = () => {
    const cat = CATEGORY_CONFIGS.find((c) => c.id === activeCategory);
    if (!cat || cat.type !== 'asset') return null;
    // Photos category has its own integrated search — skip the generic search bar
    if (cat.id === 'images') return null;
    return (
      <div className="relative">
        <Search className="absolute left-3 w-3.5 h-3.5 text-zinc-500" />
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${cat.label.toLowerCase()}...`}
          className="w-full bg-[#12121B] border border-white/[0.08] focus:border-violet-500 rounded-lg pl-8 pr-8 py-2 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all" />
        {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const activeCatConfig = CATEGORY_CONFIGS.find((c) => c.id === activeCategory);

  const handleDataEditorApply = () => {
    if (!canvas) return;
    const chartId = 'chart-data-start';
    try {
      const chartObj = createChartElement(chartId);
      chartObj.set({
        left: (canvas.width || 800) / 2 - 180,
        top: (canvas.height || 800) / 2 - 125,
      });
      canvas.add(chartObj);
      canvas.setActiveObject(chartObj);
      canvas.renderAll();
      saveHistory();
    } catch (err) {
      console.error('[TECKSTUDIO] Data chart insert error:', err);
    }
    setShowDataEditor(false);
  };

  const handleDataEditorImportCSV = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.tsv,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.trim().split('\n').map((l) => l.split(/[,\t]/).map((c) => c.trim()));
        if (lines.length < 2) return;
        const headers = lines[0];
        const labels = lines.slice(1).map((r) => r[0] || '');
        const datasets = headers.slice(1).map((h, colIdx) => ({
          label: h,
          values: lines.slice(1).map((r) => parseFloat(r[colIdx + 1]) || 0),
          color: ['#8b5cf6', '#22d3ee', '#f97316', '#22c55e', '#ec4899'][colIdx % 5],
        }));
        setDataEditorData({ labels, datasets });
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const renderDataEditor = () => {
    if (!showDataEditor) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#12121B] border border-zinc-700 rounded-2xl w-[520px] max-h-[80vh] flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
            <h3 className="text-sm font-bold text-zinc-100">Data Editor</h3>
            <button onClick={() => setShowDataEditor(false)} className="text-zinc-500 hover:text-zinc-300 cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.08]">
            <button onClick={handleDataEditorImportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-green-500/50 text-[11px] font-semibold text-zinc-300 hover:text-green-300 transition-all cursor-pointer">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
            </button>
            <button onClick={() => {
              navigator.clipboard.readText().then((text) => {
                const lines = text.trim().split('\n').map((l) => l.split(/[,\t]/).map((c) => c.trim()));
                if (lines.length < 2) return;
                const headers = lines[0];
                const labels = lines.slice(1).map((r) => r[0] || '');
                const datasets = headers.slice(1).map((h, colIdx) => ({
                  label: h,
                  values: lines.slice(1).map((r) => parseFloat(r[colIdx + 1]) || 0),
                  color: ['#8b5cf6', '#22d3ee', '#f97316', '#22c55e', '#ec4899'][colIdx % 5],
                }));
                setDataEditorData({ labels, datasets });
              });
            }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-green-500/50 text-[11px] font-semibold text-zinc-300 hover:text-green-300 transition-all cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Paste Data
            </button>
            <button onClick={() => setDataEditorData({
              labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
              datasets: [
                { label: 'Series A', values: [34, 58, 42, 76, 52, 68], color: '#8b5cf6' },
                { label: 'Series B', values: [22, 44, 64, 50, 38, 56], color: '#22d3ee' },
              ],
            })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-green-500/50 text-[11px] font-semibold text-zinc-300 hover:text-green-300 transition-all cursor-pointer">
              Reset
            </button>
          </div>
          <div className="flex-1 overflow-auto px-5 py-3">
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  <th className="text-left py-1.5 px-2 text-zinc-500 font-semibold border-b border-white/[0.08]">Category</th>
                  {dataEditorData.datasets.map((ds, i) => (
                    <th key={i} className="text-left py-1.5 px-2 text-zinc-500 font-semibold border-b border-white/[0.08]">
                      <input value={ds.label} onChange={(e) => {
                        const nd = { ...dataEditorData, datasets: [...dataEditorData.datasets] };
                        nd.datasets[i] = { ...nd.datasets[i], label: e.target.value };
                        setDataEditorData(nd);
                      }}
                        className="bg-transparent text-zinc-300 outline-none w-full" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataEditorData.labels.map((label, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-white/[0.08]/50">
                    <td className="py-1 px-2">
                      <input value={label} onChange={(e) => {
                        const nd = { ...dataEditorData, labels: [...dataEditorData.labels] };
                        nd.labels[rowIdx] = e.target.value;
                        setDataEditorData(nd);
                      }}
                        className="bg-transparent text-zinc-300 outline-none w-full" />
                    </td>
                    {dataEditorData.datasets.map((ds, colIdx) => (
                      <td key={colIdx} className="py-1 px-2">
                        <input type="number" value={ds.values[rowIdx]} onChange={(e) => {
                          const nd = { ...dataEditorData, datasets: dataEditorData.datasets.map((d, ci) => ci === colIdx ? { ...d, values: d.values.map((v, ri) => ri === rowIdx ? parseFloat(e.target.value) || 0 : v) } : d) };
                          setDataEditorData(nd);
                        }}
                          className="bg-transparent text-zinc-300 outline-none w-full" />
                      </td>
                    ))}
                    <td className="py-1 px-1">
                      <button onClick={() => {
                        const nd = { ...dataEditorData, labels: dataEditorData.labels.filter((_, i) => i !== rowIdx), datasets: dataEditorData.datasets.map((d) => ({ ...d, values: d.values.filter((_, i) => i !== rowIdx) })) };
                        setDataEditorData(nd);
                      }} className="text-zinc-600 hover:text-red-400 cursor-pointer"><X className="w-3 h-3" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => {
              const nd = { ...dataEditorData, labels: [...dataEditorData.labels, `Row ${dataEditorData.labels.length + 1}`], datasets: dataEditorData.datasets.map((d) => ({ ...d, values: [...d.values, 0] })) };
              setDataEditorData(nd);
            }}
              className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-green-400 cursor-pointer">
              <Plus className="w-3 h-3" /> Add row
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.08]">
            <button onClick={() => setShowDataEditor(false)}
              className="px-4 py-2 rounded-lg text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
              Cancel
            </button>
            <button onClick={handleDataEditorApply}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-[11px] font-bold text-white transition-colors cursor-pointer">
              Apply Data
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
    {renderDataEditor()}
    <div className="flex flex-col h-full bg-[#101018] text-zinc-100 select-none overflow-hidden">
      <div className="p-3 border-b border-white/[0.08] space-y-2.5">
        <div className="flex items-center justify-between">
          {view === 'category' ? (
            <button onClick={handleBack} className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
              <h3 className="text-sm font-bold">{activeCatConfig?.label || 'Elements'}</h3>
            </button>
          ) : (
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" />
              <span>Elements</span>
            </h3>
          )}
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">TECKSTUDIO</span>
        </div>
        {activeCategory !== 'images' && renderAIPrompt()}
        {view === 'category' && renderSearchBar()}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 overscroll-contain">
        {view === 'launcher' ? renderLauncher() : renderCategoryContent()}
      </div>
    </div>
    </>
  );
};
