import React, { useState, useEffect, useCallback } from 'react';
import {
  Square,
  Type,
  Layers,
  Upload,
  LayoutTemplate,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Trash2,
  Circle,
  Triangle,
  Minus,
  ArrowRight,
  Star,
  PenTool,
  Hexagon,
  Heart,
  MessageSquare,
  Sparkles,
  Search,
  FileText,
  History,
  Diamond,
  Pentagon,
  Plus,
  X,
  Check,
  Bookmark,
  Flame,
  Lock as LockIcon,
  Camera,
  Bell,
  Flag,
  Cloud,
  Eye as EyeIcon,
  Zap,
  Shield,
  Award,
  Quote,
  ArrowUp,
  ArrowDown,
  Pill
} from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';
import { useCanvasTools } from '../../hooks/useCanvasTools';
import { fabric } from 'fabric';
import { PagesPanel } from './PagesPanel';
import { HistoryPanel } from './HistoryPanel';
import { SECTOR_TEMPLATES } from '../../data/templates';
import { apiFetch } from '../../services/apiClient';

type Tab = 'templates' | 'elements' | 'shapes' | 'text' | 'draw' | 'uploads' | 'layers' | 'pages' | 'history';

interface BackendTemplate {
  id: string;
  name: string;
  description?: string | null;
  data?: string | null;
  thumbnail?: string | null;
  width: number;
  height: number;
  tags?: string | null;
}

export const Sidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('shapes');
  const { canvas, selectedObject, setSelectedObject, saveHistory, updateObjectName, isPenMode, setPenMode } = useEditorStore();
  const {
    addRectangle,
    addRoundedRect,
    addPillShape,
    addCircle,
    addTriangle,
    addDiamond,
    addPentagon,
    addPolygon,
    addOctagon,
    addLine,
    addCross,
    addArrow,
    addArrowUp,
    addArrowDown,
    addStar,
    addHeart,
    addBadge,
    addShield,
    addSpeechBubble,
    addCloud,
    addLightning,
    addQuote,
    addBookmark,
    addFlame,
    addCheckmark,
    addXMark,
    addPlusMark,
    addMinusMark,
    addEye,
    addLock,
    addCamera,
    addBell,
    addFlag,
    addText
  } = useCanvasTools();

  // Local state for layers list
  const [layers, setLayers] = useState<fabric.Object[]>([]);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; src: string; name: string }>>([]);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [layerSearchQuery, setLayerSearchQuery] = useState('');
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [backendTemplates, setBackendTemplates] = useState<BackendTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');

  const getStableLayerId = useCallback((obj: fabric.Object) => {
    let id = obj.get('id' as any) as string | undefined;
    if (!id) {
      id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `obj_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      obj.set({ id } as any);
    }
    return id;
  }, []);

  const refreshLayers = useCallback(() => {
    if (!canvas) {
      setLayers([]);
      return;
    }
    canvas.getObjects().forEach((obj) => getStableLayerId(obj));
    setLayers([...canvas.getObjects()].reverse());
  }, [canvas, getStableLayerId]);

  // Update layers list on canvas changes
  useEffect(() => {
    if (!canvas) return;

    refreshLayers();

    // Event listeners
    canvas.on('object:added', refreshLayers);
    canvas.on('object:removed', refreshLayers);
    canvas.on('object:modified', refreshLayers);
    canvas.on('selection:created', refreshLayers);
    canvas.on('selection:updated', refreshLayers);
    canvas.on('selection:cleared', refreshLayers);

    return () => {
      canvas.off('object:added', refreshLayers);
      canvas.off('object:removed', refreshLayers);
      canvas.off('object:modified', refreshLayers);
      canvas.off('selection:created', refreshLayers);
      canvas.off('selection:updated', refreshLayers);
      canvas.off('selection:cleared', refreshLayers);
    };
  }, [canvas, refreshLayers]);

  const fetchBackendTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError('');
    try {
      const response = await apiFetch('/api/templates?limit=48', { auth: false });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Failed to load templates (${response.status})`);
      }
      setBackendTemplates(data?.templates || []);
    } catch (error) {
      setBackendTemplates([]);
      setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates.');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'templates' && backendTemplates.length === 0 && !templatesLoading) {
      fetchBackendTemplates();
    }
  }, [activeTab, backendTemplates.length, fetchBackendTemplates, templatesLoading]);

  // Manage Drawing Mode
  const [brushColor, setBrushColor] = useState('#8b5cf6');
  const [brushWidth, setBrushWidth] = useState(5);

  useEffect(() => {
    if (!canvas) return;
    if (activeTab === 'draw' && !isPenMode) {
      canvas.isDrawingMode = true;
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = brushColor;
        canvas.freeDrawingBrush.width = brushWidth;
      }
    } else {
      canvas.isDrawingMode = false;
    }

    if (activeTab !== 'draw') {
      setPenMode(false);
    }
    
    // Save history after drawing
    const handlePathCreated = () => saveHistory();
    
    if (activeTab === 'draw') {
      canvas.on('path:created', handlePathCreated);
    }
    
    return () => {
      canvas.off('path:created', handlePathCreated);
    };
  }, [activeTab, canvas, brushColor, brushWidth, saveHistory, isPenMode, setPenMode]);

  // Handle image uploads
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canvas) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const uploadId = `${file.name}-${Date.now()}`;

      fabric.Image.fromURL(dataUrl, (img) => {
        // Center image and fit inside canvas (e.g. max 400px width/height)
        const maxWidth = 400;
        const maxHeight = 400;
        let scale = 1;

        if (img.width && img.height) {
          const scaleX = maxWidth / img.width;
          const scaleY = maxHeight / img.height;
          scale = Math.min(scaleX, scaleY, 1);
        }

        img.set({
          left: 200,
          top: 200,
          scaleX: scale,
          scaleY: scale,
          name: file.name,
          id: uploadId,
        } as any);

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        saveHistory();
        refreshLayers();

        setUploadedImages((prev) => [
          { id: uploadId, src: dataUrl, name: file.name },
          ...prev,
        ]);
      });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  // Layer Ordering Operations
  const moveLayerUp = (obj: fabric.Object) => {
    if (!canvas) return;
    canvas.bringForward(obj);
    canvas.setActiveObject(obj);
    canvas.renderAll();
    refreshLayers();
    saveHistory();
  };

  const moveLayerDown = (obj: fabric.Object) => {
    if (!canvas) return;
    canvas.sendBackwards(obj);
    canvas.setActiveObject(obj);
    canvas.renderAll();
    refreshLayers();
    saveHistory();
  };

  const moveLayerToFront = (obj: fabric.Object) => {
    if (!canvas) return;
    canvas.bringToFront(obj);
    canvas.setActiveObject(obj);
    canvas.renderAll();
    refreshLayers();
    saveHistory();
  };

  const moveLayerToBack = (obj: fabric.Object) => {
    if (!canvas) return;
    canvas.sendToBack(obj);
    canvas.setActiveObject(obj);
    canvas.renderAll();
    refreshLayers();
    saveHistory();
  };

  const moveLayerToDisplayIndex = (obj: fabric.Object, displayIndex: number) => {
    if (!canvas) return;
    const objects = canvas.getObjects();
    const targetCanvasIndex = Math.max(0, Math.min(objects.length - 1, objects.length - 1 - displayIndex));
    canvas.moveTo(obj, targetCanvasIndex);
    canvas.setActiveObject(obj);
    canvas.renderAll();
    refreshLayers();
    saveHistory();
  };

  const toggleLayerLock = (obj: fabric.Object) => {
    if (!canvas) return;
    const isLocked = !obj.lockMovementX;
    
    obj.set({
      lockMovementX: isLocked,
      lockMovementY: isLocked,
      lockScalingX: isLocked,
      lockScalingY: isLocked,
      lockRotation: isLocked,
      hasControls: !isLocked, // Hide edit knobs if locked
    });
    
    // Refresh selections
    if (isLocked && canvas.getActiveObject() === obj) {
      canvas.discardActiveObject();
    }
    
    canvas.renderAll();
    refreshLayers();
    saveHistory();
  };

  const toggleLayerVisibility = (obj: fabric.Object) => {
    if (!canvas) return;
    obj.set('visible', !obj.visible);
    
    if (!obj.visible && canvas.getActiveObject() === obj) {
      canvas.discardActiveObject();
    }
    
    canvas.renderAll();
    refreshLayers();
    saveHistory();
  };

  const deleteLayer = (obj: fabric.Object) => {
    if (!canvas) return;
    canvas.remove(obj);
    canvas.discardActiveObject();
    canvas.renderAll();
    refreshLayers();
    saveHistory();
  };

  // Bulk layer operations
  const lockAllLayers = () => {
    if (!canvas) return;
    canvas.getObjects().forEach((obj) => {
      obj.set({
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
      } as any);
    });
    canvas.discardActiveObject();
    canvas.renderAll();
    saveHistory();
  };

  const unlockAllLayers = () => {
    if (!canvas) return;
    canvas.getObjects().forEach((obj) => {
      obj.set({
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: false,
        hasControls: true,
      } as any);
    });
    canvas.renderAll();
    saveHistory();
  };

  const getLayerName = (obj: fabric.Object, index: number) => {
    const customName = (obj as any).get('name');
    if (customName) return customName;

    if (obj.type === 'textbox' || obj.type === 'text') {
      const textObj = obj as fabric.Textbox;
      return `Text: "${textObj.text?.substring(0, 15) || '...'}"`;
    }
    if (obj.type === 'image') return `Image ${index + 1}`;
    if (obj.type === 'path') return `Path Shape ${index + 1}`;
    const typeStr = obj.type || 'layer';
    return typeStr.charAt(0).toUpperCase() + typeStr.slice(1) + ` ${index + 1}`;
  };

  const finishRenaming = (layerId: string) => {
    if (renameValue.trim()) {
      updateObjectName(layerId, renameValue.trim());
    }
    setEditingLayerId(null);
  };

  const getLayerIcon = (type: string) => {
    switch (type) {
      case 'text':
      case 'textbox':
      case 'i-text':
        return Type;
      case 'image':
        return Upload;
      case 'rect':
        return Square;
      case 'circle':
        return Circle;
      case 'triangle':
        return Triangle;
      case 'line':
        return Minus;
      case 'path':
        return PenTool;
      default:
        return Hexagon;
    }
  };

  // Load a sector template from templates.ts
  const loadSectorTemplate = (sectorKey: string, templateIndex: number = 0) => {
    if (!canvas) return;
    const templates = SECTOR_TEMPLATES[sectorKey];
    if (!templates || !templates[templateIndex]) return;

    const template = templates[templateIndex];
    canvas.clear();

    // Set canvas size based on first element dimensions
    const bgElement = template.elements.find((e: any) => e.type === 'rect' && e.props.selectable === false);
    if (bgElement) {
      canvas.setWidth(bgElement.props.width || 800);
      canvas.setHeight(bgElement.props.height || 800);
    }

    template.elements.forEach((el: any) => {
      let obj: fabric.Object | null = null;
      const p = el.props;

      switch (el.type) {
        case 'rect':
          obj = new fabric.Rect(p);
          break;
        case 'circle':
          obj = new fabric.Circle(p);
          break;
        case 'text':
          obj = new fabric.Textbox(p.text, p);
          break;
        case 'line':
          obj = new fabric.Line([p.x1, p.y1, p.x2, p.y2], {
            stroke: p.stroke || '#000',
            strokeWidth: p.strokeWidth || 1,
          });
          break;
        case 'polygon':
          obj = new fabric.Polygon(p.points || [], p);
          break;
      }

      if (obj) {
        canvas.add(obj);
      }
    });

    canvas.renderAll();
    saveHistory();
  };

  const loadBackendTemplate = (template: BackendTemplate) => {
    if (!canvas || !template.data) return;

    canvas.clear();
    canvas.setWidth(template.width || 800);
    canvas.setHeight(template.height || 800);
    canvas.loadFromJSON(template.data, () => {
      canvas.renderAll();
      saveHistory();
      refreshLayers();
      apiFetch(`/api/templates/${template.id}/use`, { method: 'POST', auth: false }).catch(() => undefined);
    });
  };

  // Preset Template loader (legacy)
  const loadTemplate = (templateType: 'instagram' | 'thumbnail' | 'card') => {
    if (!canvas) return;
    
    canvas.clear();
    
    if (templateType === 'instagram') {
      canvas.setBackgroundColor('#8b5cf6', () => {}); // Purple gradient start representation
      
      // Large title text
      const title = new fabric.Textbox('CREATIVE\nDESIGN', {
        left: 150,
        top: 250,
        width: 500,
        fontSize: 72,
        fontWeight: 'bold',
        fill: '#ffffff',
        fontFamily: 'Outfit',
        textAlign: 'center',
        lineHeight: 1.1,
      });

      // Subheading
      const subtitle = new fabric.Textbox('Grow your brand with Canva AI templates.', {
        left: 150,
        top: 450,
        width: 500,
        fontSize: 24,
        fill: '#f5f3ff',
        fontFamily: 'Outfit',
        textAlign: 'center',
      });

      // Decorative Circle
      const decoCircle = new fabric.Circle({
        left: 400,
        top: 50,
        radius: 120,
        fill: 'rgba(255,255,255,0.06)',
        selectable: true,
      });

      canvas.add(decoCircle, title, subtitle);
      
    } else if (templateType === 'thumbnail') {
      canvas.setBackgroundColor('#09090b', () => {});
      
      // Main background gradient card
      const rect = new fabric.Rect({
        left: 50,
        top: 50,
        width: 700,
        height: 700,
        fill: '#18181b',
        rx: 16,
        ry: 16,
        selectable: false,
      });

      const badge = new fabric.Rect({
        left: 100,
        top: 150,
        width: 140,
        height: 38,
        fill: '#ec4899',
        rx: 19,
        ry: 19,
      });

      const badgeText = new fabric.Textbox('NEW VIDEO', {
        left: 100,
        top: 158,
        width: 140,
        fontSize: 16,
        fontWeight: 'bold',
        fill: '#ffffff',
        fontFamily: 'Outfit',
        textAlign: 'center',
      });

      const title = new fabric.Textbox('How To Build A\nCanva Clone', {
        left: 100,
        top: 230,
        width: 600,
        fontSize: 64,
        fontWeight: 'bold',
        fill: '#ffffff',
        fontFamily: 'Outfit',
        textAlign: 'left',
        lineHeight: 1.1,
      });

      const star = new fabric.Path('M 50 0 L 65 35 L 100 35 L 72 57 L 83 91 L 50 70 L 17 91 L 28 57 L 0 35 L 35 35 Z', {
        left: 550,
        top: 120,
        width: 120,
        height: 120,
        fill: '#eab308',
      });

      canvas.add(rect, badge, badgeText, title, star);
      
    } else if (templateType === 'card') {
      canvas.setBackgroundColor('#ffffff', () => {});

      const border = new fabric.Rect({
        left: 40,
        top: 40,
        width: 720,
        height: 720,
        fill: 'transparent',
        stroke: '#e4e4e7',
        strokeWidth: 4,
        rx: 12,
        ry: 12,
        selectable: false,
      });

      const logoCircle = new fabric.Circle({
        left: 100,
        top: 120,
        radius: 40,
        fill: '#8b5cf6',
      });

      const name = new fabric.Textbox('Sandhya Arkadu', {
        left: 100,
        top: 250,
        width: 600,
        fontSize: 48,
        fontWeight: 'bold',
        fill: '#18181b',
        fontFamily: 'Outfit',
      });

      const title = new fabric.Textbox('Lead UI Engineer', {
        left: 100,
        top: 310,
        width: 600,
        fontSize: 24,
        fill: '#8b5cf6',
        fontFamily: 'Outfit',
      });

      const contact = new fabric.Textbox('sandhya.arkadu@example.com\n+1 (555) 019-2834\nwww.example.com', {
        left: 100,
        top: 480,
        width: 600,
        fontSize: 20,
        fill: '#71717a',
        fontFamily: 'Outfit',
        lineHeight: 1.5,
      });

      canvas.add(border, logoCircle, name, title, contact);
    }
    
    canvas.renderAll();
    saveHistory();
  };

  return (
    <aside className="w-80 h-full border-r border-zinc-800 bg-[#121214] flex select-none shrink-0 z-10">
      {/* Icon Tab Strip */}
      <div className="w-16 h-full border-r border-zinc-800 bg-[#121214] flex flex-col items-center py-4 gap-4 shrink-0">
        {[
          { id: 'templates', icon: LayoutTemplate, label: 'Templates' },
          { id: 'elements', icon: Sparkles, label: 'Elements' },
          { id: 'shapes', icon: Square, label: 'Shapes' },
          { id: 'text', icon: Type, label: 'Text' },
          { id: 'draw', icon: PenTool, label: 'Draw' },
          { id: 'uploads', icon: Upload, label: 'Uploads' },
          { id: 'pages', icon: FileText, label: 'Pages' },
          { id: 'layers', icon: Layers, label: 'Layers' },
          { id: 'history', icon: History, label: 'History' },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                isActive 
                  ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
              title={tab.label}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Panel */}
      <div className="flex-1 h-full p-5 flex flex-col overflow-y-auto">
        <h3 className="text-sm font-bold text-zinc-100 mb-4 capitalize">
          {activeTab}
        </h3>

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="flex flex-col gap-4">
            <p className="text-[10px] text-zinc-500">Click a template to load it onto the canvas</p>

            {templatesLoading && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-[10px] text-zinc-400">
                Loading backend templates...
              </div>
            )}

            {templatesError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[10px] text-red-200">
                {templatesError}
              </div>
            )}

            {backendTemplates.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Backend Templates</h4>
                  <button onClick={fetchBackendTemplates} className="text-[10px] font-semibold text-violet-300 hover:text-violet-200">
                    Refresh
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {backendTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => loadBackendTemplate(template)}
                      className="group text-left border border-zinc-800 hover:border-violet-500 rounded-xl overflow-hidden bg-zinc-900/40 p-2 transition-colors cursor-pointer"
                    >
                      <div className="h-16 bg-violet-950/60 rounded-lg flex items-center justify-center overflow-hidden">
                        {template.thumbnail ? (
                          <img src={template.thumbnail} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <LayoutTemplate className="h-5 w-5 text-violet-300" />
                        )}
                      </div>
                      <p className="text-[9px] text-zinc-300 mt-1 truncate">{template.name}</p>
                      <p className="text-[8px] text-zinc-600 truncate">{template.width}×{template.height}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!templatesLoading && backendTemplates.length === 0 && (
              <>

            {/* Sector Templates */}
            {Object.entries(SECTOR_TEMPLATES).map(([sectorKey, templates]) => (
              <div key={sectorKey}>
                <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider capitalize">
                  {sectorKey.replace(/-/g, ' ')}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {templates.map((template: any, idx: number) => (
                    <button
                      key={template.id}
                      onClick={() => loadSectorTemplate(sectorKey, idx)}
                      className="group text-left border border-zinc-800 hover:border-violet-500 rounded-xl overflow-hidden bg-zinc-900/40 p-2 transition-colors cursor-pointer"
                    >
                      <div className="h-16 bg-zinc-800 rounded-lg flex items-center justify-center overflow-hidden">
                        <span className="text-[9px] font-bold text-zinc-400 group-hover:text-violet-400 transition-colors text-center px-1">
                          {template.name}
                        </span>
                      </div>
                      <p className="text-[9px] text-zinc-500 mt-1 truncate">{template.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Legacy Templates */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Quick Templates</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => loadTemplate('instagram')}
                  className="group text-left border border-zinc-800 hover:border-violet-500 rounded-xl overflow-hidden bg-zinc-900/40 p-2 transition-colors cursor-pointer"
                >
                  <div className="h-16 bg-violet-600 rounded-lg flex items-center justify-center">
                    <span className="text-[9px] font-bold text-white">Instagram</span>
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1">Creative Post</p>
                </button>
                <button
                  onClick={() => loadTemplate('thumbnail')}
                  className="group text-left border border-zinc-800 hover:border-violet-500 rounded-xl overflow-hidden bg-zinc-900/40 p-2 transition-colors cursor-pointer"
                >
                  <div className="h-16 bg-zinc-800 rounded-lg flex items-center justify-center">
                    <span className="text-[9px] font-bold text-pink-400">YouTube</span>
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1">Thumbnail</p>
                </button>
                <button
                  onClick={() => loadTemplate('card')}
                  className="group text-left border border-zinc-800 hover:border-violet-500 rounded-xl overflow-hidden bg-zinc-900/40 p-2 transition-colors cursor-pointer"
                >
                  <div className="h-16 bg-white rounded-lg flex items-center justify-center">
                    <span className="text-[9px] font-bold text-zinc-800">Business Card</span>
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1">Card</p>
                </button>
              </div>
            </div>
              </>
            )}
          </div>
        )}

        {/* Elements Tab */}
        {activeTab === 'elements' && (
          <div className="flex flex-col gap-4">
            {/* Quick Elements */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Quick Elements</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Star', desc: '5-point star', onClick: addStar, icon: Star },
                  { label: 'Heart', desc: 'Classic heart', onClick: addHeart, icon: Heart },
                  { label: 'Speech Bubble', desc: 'Text callout', onClick: addSpeechBubble, icon: MessageSquare },
                  { label: 'Arrow', desc: 'Directional', onClick: addArrow, icon: ArrowRight },
                  { label: 'Badge', desc: 'Hexagonal', onClick: addPolygon, icon: Hexagon },
                  { label: 'Cloud', desc: 'Cloud shape', onClick: addCloud, icon: Cloud },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={item.onClick}
                      className="flex items-center gap-2 p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-300 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-zinc-200 truncate">{item.label}</h4>
                        <p className="text-[9px] text-zinc-500">{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Symbols */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Symbols</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { onClick: addCheckmark, label: 'Check', icon: Check },
                  { onClick: addXMark, label: 'X Mark', icon: X },
                  { onClick: addPlusMark, label: 'Plus', icon: Plus },
                  { onClick: addMinusMark, label: 'Minus', icon: Minus },
                  { onClick: addEye, label: 'Eye', icon: EyeIcon },
                  { onClick: addLock, label: 'Lock', icon: LockIcon },
                  { onClick: addFlame, label: 'Flame', icon: Flame },
                  { onClick: addShield, label: 'Shield', icon: Shield },
                  { onClick: addBookmark, label: 'Bookmark', icon: Bookmark },
                  { onClick: addQuote, label: 'Quote', icon: Quote },
                  { onClick: addCamera, label: 'Camera', icon: Camera },
                  { onClick: addBell, label: 'Bell', icon: Bell },
                ].map((shape, idx) => {
                  const Icon = shape.icon;
                  return (
                    <button
                      key={idx}
                      onClick={shape.onClick}
                      className="flex flex-col items-center justify-center p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer group"
                    >
                      <div className="text-zinc-400 group-hover:text-violet-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-300 mt-1">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Arrows */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Arrows</h4>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { onClick: addArrow, label: 'Right', icon: ArrowRight },
                  { onClick: addArrowUp, label: 'Up', icon: ArrowUp },
                  { onClick: addArrowDown, label: 'Down', icon: ArrowDown },
                  { onClick: addFlag, label: 'Flag', icon: Flag },
                ].map((shape, idx) => {
                  const Icon = shape.icon;
                  return (
                    <button
                      key={idx}
                      onClick={shape.onClick}
                      className="flex flex-col items-center justify-center p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer group"
                    >
                      <div className="text-zinc-400 group-hover:text-violet-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-semibold text-zinc-300 mt-1">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Shapes Tab */}
        {activeTab === 'shapes' && (
          <div className="flex flex-col gap-4">
            {/* Basic Shapes */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Basic</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { onClick: addRectangle, label: 'Rectangle', icon: Square },
                  { onClick: addRoundedRect, label: 'Rounded', icon: Square },
                  { onClick: addPillShape, label: 'Pill', icon: Pill },
                  { onClick: addCircle, label: 'Circle', icon: Circle },
                  { onClick: addTriangle, label: 'Triangle', icon: Triangle },
                  { onClick: addLine, label: 'Line', icon: Minus },
                ].map((shape, idx) => {
                  const Icon = shape.icon;
                  return (
                    <button
                      key={idx}
                      onClick={shape.onClick}
                      className="flex flex-col items-center justify-center p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer group"
                    >
                      <div className="text-zinc-400 group-hover:text-violet-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-300 mt-1">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Polygons */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Polygons</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { onClick: addDiamond, label: 'Diamond', icon: Diamond },
                  { onClick: addPentagon, label: 'Pentagon', icon: Pentagon },
                  { onClick: addPolygon, label: 'Hexagon', icon: Hexagon },
                  { onClick: addOctagon, label: 'Octagon', icon: Hexagon },
                  { onClick: addCross, label: 'Cross', icon: Plus },
                  { onClick: addBadge, label: 'Badge', icon: Award },
                ].map((shape, idx) => {
                  const Icon = shape.icon;
                  return (
                    <button
                      key={idx}
                      onClick={shape.onClick}
                      className="flex flex-col items-center justify-center p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer group"
                    >
                      <div className="text-zinc-400 group-hover:text-violet-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-300 mt-1">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Arrows & Direction */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Arrows</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { onClick: addArrow, label: 'Right', icon: ArrowRight },
                  { onClick: addArrowUp, label: 'Up', icon: ArrowUp },
                  { onClick: addArrowDown, label: 'Down', icon: ArrowDown },
                ].map((shape, idx) => {
                  const Icon = shape.icon;
                  return (
                    <button
                      key={idx}
                      onClick={shape.onClick}
                      className="flex flex-col items-center justify-center p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer group"
                    >
                      <div className="text-zinc-400 group-hover:text-violet-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-300 mt-1">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Symbols & Icons */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Symbols</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { onClick: addHeart, label: 'Heart', icon: Heart },
                  { onClick: addStar, label: 'Star', icon: Star },
                  { onClick: addFlame, label: 'Flame', icon: Flame },
                  { onClick: addShield, label: 'Shield', icon: Shield },
                  { onClick: addBookmark, label: 'Bookmark', icon: Bookmark },
                  { onClick: addQuote, label: 'Quote', icon: Quote },
                ].map((shape, idx) => {
                  const Icon = shape.icon;
                  return (
                    <button
                      key={idx}
                      onClick={shape.onClick}
                      className="flex flex-col items-center justify-center p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer group"
                    >
                      <div className="text-zinc-400 group-hover:text-violet-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-300 mt-1">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* UI Icons */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">UI Icons</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { onClick: addCheckmark, label: 'Check', icon: Check },
                  { onClick: addXMark, label: 'X Mark', icon: X },
                  { onClick: addPlusMark, label: 'Plus', icon: Plus },
                  { onClick: addMinusMark, label: 'Minus', icon: Minus },
                  { onClick: addEye, label: 'Eye', icon: EyeIcon },
                  { onClick: addLock, label: 'Lock', icon: LockIcon },
                ].map((shape, idx) => {
                  const Icon = shape.icon;
                  return (
                    <button
                      key={idx}
                      onClick={shape.onClick}
                      className="flex flex-col items-center justify-center p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer group"
                    >
                      <div className="text-zinc-400 group-hover:text-violet-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-300 mt-1">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Communication */}
            <div>
              <h4 className="text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Communication</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { onClick: addSpeechBubble, label: 'Bubble', icon: MessageSquare },
                  { onClick: addCloud, label: 'Cloud', icon: Cloud },
                  { onClick: addLightning, label: 'Lightning', icon: Zap },
                  { onClick: addCamera, label: 'Camera', icon: Camera },
                  { onClick: addBell, label: 'Bell', icon: Bell },
                  { onClick: addFlag, label: 'Flag', icon: Flag },
                ].map((shape, idx) => {
                  const Icon = shape.icon;
                  return (
                    <button
                      key={idx}
                      onClick={shape.onClick}
                      className="flex flex-col items-center justify-center p-3 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800 rounded-xl transition-all cursor-pointer group"
                    >
                      <div className="text-zinc-400 group-hover:text-violet-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-300 mt-1">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Text Tab */}
        {activeTab === 'text' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => addText('heading')}
              className="w-full text-left p-4 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800/40 rounded-xl transition-colors cursor-pointer group"
            >
              <h1 className="text-xl font-bold text-white leading-none m-0 group-hover:text-violet-400 transition-colors">
                Add a heading
              </h1>
              <span className="text-[10px] text-zinc-500 mt-1 block">54px Outfit Bold</span>
            </button>

            <button
              onClick={() => addText('subheading')}
              className="w-full text-left p-4 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800/40 rounded-xl transition-colors cursor-pointer group"
            >
              <h2 className="text-sm font-semibold text-zinc-200 leading-none m-0 group-hover:text-violet-400 transition-colors">
                Add a subheading
              </h2>
              <span className="text-[10px] text-zinc-500 mt-1 block">36px Outfit Semi-Bold</span>
            </button>

            <button
              onClick={() => addText('body')}
              className="w-full text-left p-4 bg-zinc-900/40 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-800/40 rounded-xl transition-colors cursor-pointer group"
            >
              <p className="text-xs text-zinc-400 leading-none m-0 group-hover:text-violet-400 transition-colors">
                Add body text
              </p>
              <span className="text-[10px] text-zinc-500 mt-1 block">28px Outfit Normal</span>
            </button>
          </div>
        )}

        {/* Draw Tab */}
        {activeTab === 'draw' && (
          <div className="flex flex-col gap-5">
            {/* Draw mode selector buttons */}
            <div className="grid grid-cols-2 gap-2 border border-zinc-800 rounded-lg p-0.5 bg-zinc-950">
              <button
                onClick={() => {
                  setPenMode(false);
                  if (canvas) canvas.isDrawingMode = true;
                }}
                className={`py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                  (!isPenMode && canvas?.isDrawingMode)
                    ? 'bg-zinc-850 text-violet-400 border border-zinc-800 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                Brush
              </button>
              <button
                onClick={() => {
                  if (canvas) canvas.isDrawingMode = false;
                  setPenMode(true);
                }}
                className={`py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                  isPenMode
                    ? 'bg-zinc-850 text-violet-400 border border-zinc-800 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                Pen Tool
              </button>
            </div>

            {isPenMode ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-xs text-emerald-400">
                <p className="font-bold mb-1 flex items-center gap-1">✦ Figma Vector Pen Active</p>
                <ul className="list-disc pl-4 space-y-1 mt-1 opacity-90">
                  <li>Click to place anchor points.</li>
                  <li>Double-click or press <strong>Enter</strong> to close the path.</li>
                  <li>Press <strong>Escape</strong> to finish open line.</li>
                </ul>
              </div>
            ) : (
              <div className="bg-violet-600/10 border border-violet-500/20 p-4 rounded-xl text-xs text-violet-300">
                <p className="font-semibold mb-1">Freehand Drawing Mode</p>
                <p className="opacity-80">Click and drag on the canvas to draw. Switch tabs to exit drawing mode.</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-zinc-400">Brush Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => setBrushColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-zinc-700 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={brushColor.toUpperCase()}
                  onChange={(e) => setBrushColor(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none text-center font-mono"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-zinc-400">Brush Width</label>
                <span className="text-xs text-zinc-400 font-mono font-bold">{brushWidth}px</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={brushWidth}
                onChange={(e) => setBrushWidth(parseInt(e.target.value))}
                className="w-full accent-violet-500 h-1 rounded-full cursor-pointer bg-zinc-800"
              />
            </div>
          </div>
        )}

        {/* Uploads Tab */}
        {activeTab === 'uploads' && (
          <div className="flex flex-col gap-4">
            <label className="border-2 border-dashed border-zinc-800 hover:border-violet-500 hover:bg-violet-500/5 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center">
              <Upload className="w-6 h-6 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-300">Upload Files</span>
              <span className="text-[10px] text-zinc-500">Supports PNG, JPG, JPEG</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
            
            <p className="text-[10px] text-zinc-500 text-center">
              Your uploaded images will appear directly on the canvas.
            </p>

            {uploadedImages.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-[0.2em] mb-3">Uploaded images</h4>
                <div className="grid grid-cols-2 gap-2">
                  {uploadedImages.map((image) => (
                    <button
                      key={image.id}
                      onClick={() => {
                        if (!canvas) return;
                        fabric.Image.fromURL(image.src, (img) => {
                          img.set({
                            left: 200,
                            top: 200,
                            scaleX: 1,
                            scaleY: 1,
                            name: image.name,
                            id: `${image.id}-copy-${Date.now()}`,
                          } as any);
                          canvas.add(img);
                          canvas.setActiveObject(img);
                          canvas.renderAll();
                          refreshLayers();
                          saveHistory();
                        });
                      }}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('imageSrc', image.src);
                        event.dataTransfer.setData('imageName', image.name);
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                      className="group overflow-hidden rounded-xl border border-zinc-800 hover:border-violet-500 transition-all"
                      title={`Add ${image.name}`}
                    >
                      <img src={image.src} alt={image.name} className="h-20 w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pages Tab */}
        {activeTab === 'pages' && (
          <PagesPanel />
        )}

        {/* Layers Tab */}
        {activeTab === 'layers' && (
          <div className="flex flex-col gap-3">
            {/* Layers Search Filter */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Filter layers..."
                value={layerSearchQuery}
                onChange={(e) => setLayerSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-750 focus:border-violet-500 rounded-lg py-1.5 pl-8 pr-3 text-xs text-zinc-205 outline-none transition-colors placeholder:text-zinc-600"
              />
            </div>

            {layers.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">
                No layers found. Add shapes or text to see them here!
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button onClick={lockAllLayers} className="text-[10px] font-bold bg-zinc-900/60 border border-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors">Lock all</button>
                  <button onClick={unlockAllLayers} className="text-[10px] font-bold bg-zinc-900/60 border border-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors">Unlock all</button>
                </div>

                <div className="flex flex-col gap-1.5 max-h-[450px] overflow-y-auto pr-1">
                  {layers
                    .map((layer, index) => ({ layer, index }))
                    .filter(({ layer, index }) => 
                      getLayerName(layer, index).toLowerCase().includes(layerSearchQuery.toLowerCase())
                    )
                    .map(({ layer, index }) => {
                      const isSelected = selectedObject === layer;
                      const isLocked = layer.lockMovementX;
                      const isVisible = layer.visible !== false;
                      const layerId = getStableLayerId(layer);
                      const LayerIcon = getLayerIcon(layer.type || 'layer');

                      return (
                        <div
                          key={layerId}
                          draggable={!editingLayerId}
                          onDragStart={(event) => {
                            event.dataTransfer.setData('layerId', layerId);
                            event.dataTransfer.effectAllowed = 'move';
                            setDraggedLayerId(layerId);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const sourceLayerId = event.dataTransfer.getData('layerId') || draggedLayerId;
                            if (!canvas || !sourceLayerId || sourceLayerId === layerId) return;
                            const sourceObject = canvas.getObjects().find((object) => getStableLayerId(object) === sourceLayerId);
                            if (sourceObject) moveLayerToDisplayIndex(sourceObject, index);
                            setDraggedLayerId(null);
                          }}
                          onDragEnd={() => setDraggedLayerId(null)}
                          onClick={() => {
                            if (canvas && isVisible) {
                              canvas.setActiveObject(layer);
                              canvas.renderAll();
                              setSelectedObject(layer);
                            }
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-violet-600/10 border-violet-500/40 text-violet-300 shadow-sm' 
                              : draggedLayerId === layerId
                                ? 'bg-violet-500/10 border-violet-500/30 text-violet-200'
                              : 'bg-zinc-900/30 border-zinc-850 hover:bg-zinc-850/30 text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <LayerIcon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-violet-400' : 'text-zinc-500'}`} />
                            {editingLayerId === layerId ? (
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => finishRenaming(layerId)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') finishRenaming(layerId);
                                  else if (e.key === 'Escape') setEditingLayerId(null);
                                }}
                                className="bg-zinc-950 border border-violet-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 focus:outline-none w-full max-w-[120px]"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span 
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingLayerId(layerId);
                                  setRenameValue((layer as any).get('name') || getLayerName(layer, index));
                                }}
                                className="font-medium truncate max-w-[110px] select-none" 
                                title="Double click to rename"
                              >
                                {getLayerName(layer, index)}
                              </span>
                            )}
                          </div>
                          
                          {/* Layer Controls */}
                          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleLayerVisibility(layer)}
                              className={`p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer`}
                              title={isVisible ? 'Hide Layer' : 'Show Layer'}
                            >
                              {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-600" />}
                            </button>
                            
                            <button
                              onClick={() => toggleLayerLock(layer)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                              title={isLocked ? 'Unlock Layer' : 'Lock Layer'}
                            >
                              {isLocked ? <Lock className="w-3.5 h-3.5 text-violet-400" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>

                            {/* Depth Ordering */}
                            <button
                              onClick={() => moveLayerToFront(layer)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                              title="Bring To Front"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveLayerUp(layer)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                              title="Bring Forward"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveLayerDown(layer)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                              title="Send Backward"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveLayerToBack(layer)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                              title="Send To Back"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            
                            <button
                              onClick={() => deleteLayer(layer)}
                              className="p-1 rounded hover:bg-zinc-850 hover:text-rose-400 text-zinc-650 cursor-pointer"
                              title="Delete Layer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <HistoryPanel />
        )}
      </div>
    </aside>
  );
};
