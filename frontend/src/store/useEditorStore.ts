import { create } from 'zustand';
import { fabric } from 'fabric';
import { apiFetch, getAuthToken } from '../services/apiClient';
import { CUSTOM_FABRIC_PROPERTIES } from '../utils/editorElementFactory';
import type { TextSelectionRange } from '../utils/textSelectionStyles';
import { preloadFontsFromCanvasJson } from '../utils/fontLoader';
import {
  applyTextEffect,
  isTextEffectSource,
  rehydrateTextEffects,
  removeGeneratedTextEffectLayers,
} from '../utils/textEffects';
import type { TextEffectConfig } from '../types/editorFeatures';
import {
  applyTextStylesToSelectionOrObject,
  captureTextSelection,
  clampFontSize,
  getFabricObjectId,
  isEditableTextObject,
  readSelectionStyleValue,
} from '../utils/textSelectionStyles';


function getCanvasDimensionsFromProjectData(projectData?: string | null) {
  if (!projectData) return null;
  try {
    const parsed = JSON.parse(projectData);
    if (Number(parsed?.width) > 0 && Number(parsed?.height) > 0) {
      return { width: Number(parsed.width), height: Number(parsed.height) };
    }
    const objects = Array.isArray(parsed?.objects) ? parsed.objects : [];
    const posterMetadata = objects.find((object: any) =>
      object?.teckstudioObjectType === 'posterSpecMetadata' &&
      Number(object?.posterSpecCanvasWidth) > 0 &&
      Number(object?.posterSpecCanvasHeight) > 0
    );
    if (posterMetadata) {
      return {
        width: Number(posterMetadata.posterSpecCanvasWidth),
        height: Number(posterMetadata.posterSpecCanvasHeight),
      };
    }
    const posterBackground = objects.find((object: any) =>
      object?.teckstudioObjectType === 'posterSpec' &&
      object?.posterRole === 'background' &&
      Number(object?.width) > 0 &&
      Number(object?.height) > 0
    );
    if (posterBackground) {
      return { width: Number(posterBackground.width), height: Number(posterBackground.height) };
    }
  } catch {
    return null;
  }
  return null;
}

type ProjectCanvasPayload = {
  data?: string | null;
  width?: number | null;
  height?: number | null;
  background_color?: string | null;
};

const positiveDimension = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

const DEFAULT_VIEWPORT_TRANSFORM: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

const createEmptyCanvasJson = (width: number, height: number, background = '#ffffff') => JSON.stringify({
  version: '5.3.0',
  width,
  height,
  viewportTransform: DEFAULT_VIEWPORT_TRANSFORM,
  objects: [],
  background,
});

const normalizeViewportTransform = (value: unknown): [number, number, number, number, number, number] => {
  if (!Array.isArray(value) || value.length < 6) return [...DEFAULT_VIEWPORT_TRANSFORM];
  const parsed = value.slice(0, 6).map((item) => Number(item));
  return parsed.every((item) => Number.isFinite(item))
    ? parsed as [number, number, number, number, number, number]
    : [...DEFAULT_VIEWPORT_TRANSFORM];
};

const ensureCanvasViewport = (canvas: fabric.Canvas) => {
  const viewportTransform = normalizeViewportTransform(canvas.viewportTransform);
  canvas.setViewportTransform(viewportTransform);
};

const isTextType = (type?: string | null) => ['text', 'i-text', 'textbox'].includes(type || '');

const normalizeTextStylesValue = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

function normalizeSerializedTextStyles(parsed: { objects?: unknown[] }) {
  parsed.objects?.forEach((object) => {
    if (!object || typeof object !== 'object') return;
    const fabricObject = object as { type?: string; styles?: unknown };
    if (isTextType(fabricObject.type)) {
      fabricObject.styles = normalizeTextStylesValue(fabricObject.styles);
    }
  });
}

function normalizeLoadedTextStyles(canvas: fabric.Canvas) {
  canvas.getObjects().forEach((object) => {
    if (!isTextType(object.type)) return;
    const textObject = object as fabric.Object & { styles?: unknown };
    textObject.styles = normalizeTextStylesValue(textObject.styles);
  });
}

function normalizeProjectCanvasJson(project: ProjectCanvasPayload) {
  const fallbackWidth = positiveDimension(project.width, 800);
  const fallbackHeight = positiveDimension(project.height, 800);
  const fallbackBackground = project.background_color || '#ffffff';

  if (!project.data) {
    return {
      json: createEmptyCanvasJson(fallbackWidth, fallbackHeight, fallbackBackground),
      width: fallbackWidth,
      height: fallbackHeight,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(project.data);
  } catch {
    throw new Error('Project canvas data is invalid JSON. The design cannot be loaded.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Project canvas data is not a valid Fabric.js canvas object.');
  }

  if (parsed.objects === undefined) {
    parsed.objects = [];
  }
  if (!Array.isArray(parsed.objects)) {
    throw new Error('Project canvas objects are invalid. The design cannot be loaded.');
  }

  const dataDimensions = getCanvasDimensionsFromProjectData(project.data);
  const width = positiveDimension(parsed.width, dataDimensions?.width || fallbackWidth);
  const height = positiveDimension(parsed.height, dataDimensions?.height || fallbackHeight);
  parsed.version = parsed.version || '5.3.0';
  parsed.width = width;
  parsed.height = height;
  parsed.viewportTransform = normalizeViewportTransform(parsed.viewportTransform);
  parsed.background = parsed.background || parsed.backgroundColor || fallbackBackground;
  normalizeSerializedTextStyles(parsed);

  return { json: JSON.stringify(parsed), width, height };
}

const fallbackObjectName = (object: fabric.Object, index: number) => {
  const type = object.type || 'layer';
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} ${index + 1}`;
};

function prepareCanvasObjects(canvas: fabric.Canvas) {
  normalizeLoadedTextStyles(canvas);
  canvas.getObjects().forEach((object, index) => {
    if (!object.get('id' as keyof fabric.Object)) {
      object.set({ id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `obj_${Date.now()}_${Math.random().toString(36).slice(2)}` } as Record<string, unknown>);
    }
    if (!object.get('name' as keyof fabric.Object)) {
      object.set({ name: fallbackObjectName(object, index) } as Record<string, unknown>);
    }
    if (object.selectable === undefined) object.set('selectable', true);
    if (object.evented === undefined) object.set('evented', true);
    object.setCoords();
  });
}

function loadCanvasFromJson(canvas: fabric.Canvas, json: string) {
  return preloadFontsFromCanvasJson(json).then(() => new Promise<string>((resolve, reject) => {
    try {
      canvas.loadFromJSON(json, () => {
        void (async () => {
          ensureCanvasViewport(canvas);
          prepareCanvasObjects(canvas);
          await rehydrateTextEffects(canvas);
          canvas.discardActiveObject();
          canvas.renderAll();
          resolve(JSON.stringify(canvas.toJSON(CUSTOM_FABRIC_PROPERTIES)));
        })().catch(reject);
      });
    } catch (error) {
      reject(error);
    }
  }));
}

async function applyProjectCanvas(canvas: fabric.Canvas, project: ProjectCanvasPayload) {
  const normalized = normalizeProjectCanvasJson(project);
  console.log('[TECKSTUDIO] applyProjectCanvas:', { width: normalized.width, height: normalized.height, hasData: !!normalized.json });

  // Set canvas dimensions without touching viewport
  canvas.setDimensions({ width: normalized.width, height: normalized.height });

  console.log('[TECKSTUDIO] Canvas dimensions set:', { width: canvas.getWidth(), height: canvas.getHeight(), bgColor: canvas.backgroundColor });

  // Parse JSON but remove viewportTransform so it doesn't override fit-to-view
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(normalized.json);
  } catch {
    parsedJson = {};
  }
  // Reset viewport transform to identity before loading
  parsedJson.viewportTransform = [1, 0, 0, 1, 0, 0];
  const cleanJson = JSON.stringify(parsedJson);

  const loadedJson = await loadCanvasFromJson(canvas, cleanJson);
  console.log('[TECKSTUDIO] Canvas loaded:', { objects: canvas.getObjects().length, bgColor: canvas.backgroundColor });

  return { json: loadedJson, width: normalized.width, height: normalized.height };
}

function clearCanvasToProjectSize(canvas: fabric.Canvas, project: ProjectCanvasPayload = {}) {
  const width = positiveDimension(project.width, 800);
  const height = positiveDimension(project.height, 800);
  const background = project.background_color || '#ffffff';
  ensureCanvasViewport(canvas);
  canvas.clear();
  ensureCanvasViewport(canvas);
  canvas.setDimensions({ width, height });
  ensureCanvasViewport(canvas);
  canvas.setBackgroundColor(background, () => {
    ensureCanvasViewport(canvas);
    canvas.renderAll();
  });
  // Sync store dimensions
  useEditorStore.getState().setCanvasDimensions(width, height);
}


interface EditorState {
  canvas: fabric.Canvas | null;
  selectedObject: fabric.Object | null;
  zoom: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string; // 'normal' | 'bold'
  fontStyle: string; // 'normal' | 'italic'
  underline: boolean;
  textAlign: string; // 'left' | 'center' | 'right' | 'justify'
  textSelectionRange: TextSelectionRange | null;
  opacity: number;
  projectId: string | null;
  projectName: string;
  projectCreatedAt: string;
  projectUpdatedAt: string;
  isProjectLoading: boolean;
  projectLoadError: string;
  editorMode: 'design' | 'dev';
  isPenMode: boolean;
  rulersEnabled: boolean;
  showGuides: boolean;

  // Canvas dimensions (source of truth, synced with fabric.js)
  canvasWidth: number;
  canvasHeight: number;
  canvasBackgroundColor: string;
  currentPresetId: string | null;

  // Page selection state — true when no element is selected (page is "active")
  selectedPage: boolean;

  // History state
  history: string[];
  historyIndex: number;
  
  setCanvas: (canvas: fabric.Canvas | null) => void;
  setSelectedObject: (obj: fabric.Object | null) => void;
  setZoom: (zoom: number) => void;
  setFillColor: (color: string) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFontFamily: (family: string) => void;
  setFontSize: (size: number) => void;
  applyFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  setFontWeight: (weight: string) => void;
  setFontStyle: (style: string) => void;
  setUnderline: (underline: boolean) => void;
  setTextAlign: (align: string) => void;
  captureTextSelection: () => void;
  applyTextSelectionStyles: (styles: Record<string, unknown>) => boolean;
  setOpacity: (opacity: number) => void;
  setProjectId: (projectId: string) => void;
  setProjectName: (name: string) => void;
  saveProjectMeta: () => void;
  loadProject: (projectId: string) => void;
  clearProjectLoadError: () => void;
  setEditorMode: (mode: 'design' | 'dev') => void;
  setPenMode: (active: boolean) => void;
  setRulersEnabled: (enabled: boolean) => void;
  setShowGuides: (show: boolean) => void;
  updateObjectName: (objId: string, name: string) => void;

  // Canvas dimensions
  setCanvasDimensions: (width: number, height: number) => void;
  setCanvasBackgroundColor: (color: string) => void;
  setCurrentPreset: (presetId: string | null) => void;
  resizeCanvas: (width: number, height: number) => void;
  setSelectedPage: (selected: boolean) => void;

  // Operations
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  clearCanvas: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  canvas: null,
  selectedObject: null,
  zoom: 1,
  fillColor: '#8b5cf6', // purple accent default
  strokeColor: '#000000',
  strokeWidth: 0,
  fontFamily: 'Outfit',
  fontSize: 40,
  fontWeight: 'normal',
  fontStyle: 'normal',
  underline: false,
  textAlign: 'left',
  textSelectionRange: null,
  opacity: 1,
  projectId: null,
  projectName: '',
  projectCreatedAt: '',
  projectUpdatedAt: '',
  isProjectLoading: false,
  projectLoadError: '',
  editorMode: 'design',
  isPenMode: false,
  rulersEnabled: true,
  showGuides: true,

  // Canvas dimensions defaults
  canvasWidth: 800,
  canvasHeight: 800,
  canvasBackgroundColor: '#ffffff',
  currentPresetId: null,
  selectedPage: true, // Page is selected by default when editor opens

  history: [],
  historyIndex: -1,
  
  setCanvas: (canvas) => {
    set({ canvas });
    if (canvas) {
      set({ history: [], historyIndex: -1 });

      const { projectId } = get();
      console.log('[TECKSTUDIO] setCanvas called, projectId:', projectId);
      if (projectId) {
        get().loadProject(projectId);
      }
    }
  },

  setProjectId: (projectId) => {
    console.log('[TECKSTUDIO] setProjectId called:', projectId);
    set({ projectId });
    // If canvas already exists, load the project now
    const { canvas } = get();
    if (canvas && projectId) {
      console.log('[TECKSTUDIO] Canvas exists, loading project:', projectId);
      get().loadProject(projectId);
    }
  },
  
  setSelectedObject: (selectedObject) => {
    if (!selectedObject) {
      // When no element is selected, the page becomes active
      set({ selectedObject: null, textSelectionRange: null, selectedPage: true });
      return;
    }

    const capturedRange = captureTextSelection(selectedObject);
    const selectedFill = readSelectionStyleValue(selectedObject, 'fill', selectedObject.get('fill') || '#8b5cf6', capturedRange);
    const selectedStroke = readSelectionStyleValue(selectedObject, 'stroke', selectedObject.get('stroke') || '#000000', capturedRange);
    const selectedFontFamily = readSelectionStyleValue(selectedObject, 'fontFamily', (selectedObject as any).get('fontFamily') || 'Outfit', capturedRange);
    const selectedFontSize = readSelectionStyleValue(selectedObject, 'fontSize', (selectedObject as any).get('fontSize') || 40, capturedRange);
    const selectedFontWeight = readSelectionStyleValue(selectedObject, 'fontWeight', (selectedObject as any).get('fontWeight') || 'normal', capturedRange);
    const selectedFontStyle = readSelectionStyleValue(selectedObject, 'fontStyle', (selectedObject as any).get('fontStyle') || 'normal', capturedRange);
    const selectedUnderline = readSelectionStyleValue(selectedObject, 'underline', (selectedObject as any).get('underline') || false, capturedRange);

    const selectedObjectId = getFabricObjectId(selectedObject);

    // Sync object properties to store state. Mixed partial selections keep the current UI value.
    set((state) => {
      const retainedRange = state.textSelectionRange?.objectId === selectedObjectId ? state.textSelectionRange : null;
      return {
      selectedObject,
      selectedPage: false, // Element is selected, page is not
      textSelectionRange: capturedRange || retainedRange,
      fillColor: typeof selectedFill === 'string' && selectedFill !== 'Mixed' ? selectedFill : state.fillColor,
      strokeColor: typeof selectedStroke === 'string' && selectedStroke !== 'Mixed' ? selectedStroke : state.strokeColor,
      strokeWidth: selectedObject.get('strokeWidth') || 0,
      opacity: selectedObject.get('opacity') || 1,
      // Text properties (if it's a text object)
      fontFamily: typeof selectedFontFamily === 'string' && selectedFontFamily !== 'Mixed' ? selectedFontFamily : state.fontFamily,
      fontSize: typeof selectedFontSize === 'number' ? selectedFontSize : state.fontSize,
      fontWeight: selectedFontWeight !== 'Mixed' ? String(selectedFontWeight || 'normal') : state.fontWeight,
      fontStyle: selectedFontStyle !== 'Mixed' ? String(selectedFontStyle || 'normal') : state.fontStyle,
      underline: typeof selectedUnderline === 'boolean' ? selectedUnderline : state.underline,
      textAlign: (selectedObject as any).get('textAlign') || 'left',
    };
    });
  },
  
  setZoom: (zoom) => {
    const canvas = get().canvas;
    if (canvas) {
      // Limit zoom between 10% and 500%
      const boundedZoom = Math.min(Math.max(zoom, 0.1), 5.0);
      set({ zoom: boundedZoom });

      // Get current viewport transform and update just the scale
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const oldZoom = vpt[0] || 1;
      const ratio = boundedZoom / oldZoom;

      // Scale the translate values proportionally
      const newTranslateX = vpt[4] * ratio;
      const newTranslateY = vpt[5] * ratio;

      canvas.setViewportTransform([boundedZoom, 0, 0, boundedZoom, newTranslateX, newTranslateY]);
      canvas.renderAll();
    }
  },
  
  captureTextSelection: () => {
    const { selectedObject } = get();
    const range = captureTextSelection(selectedObject);
    if (range) set({ textSelectionRange: range });
  },

  applyTextSelectionStyles: (styles) => {
    const { canvas, selectedObject, textSelectionRange } = get();
    const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, styles, textSelectionRange);
    if (!result.applied) return false;
    if (result.textObject) {
      set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
    }
    get().saveHistory();
    return true;
  },

  setFillColor: (color) => {
    set({ fillColor: color });
    const { canvas, selectedObject, textSelectionRange } = get();
    if (canvas && selectedObject) {
      if (isEditableTextObject(selectedObject)) {
        const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { fill: color }, textSelectionRange);
        if (result.textObject) set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
      } else {
        selectedObject.set('fill', color);
        selectedObject.setCoords();
        canvas.requestRenderAll();
      }
      get().saveHistory();
    }
  },
  
  setStrokeColor: (color) => {
    set({ strokeColor: color });
    const { canvas, selectedObject, textSelectionRange } = get();
    if (canvas && selectedObject) {
      if (isEditableTextObject(selectedObject)) {
        const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { stroke: color }, textSelectionRange);
        if (result.textObject) set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
      } else {
        selectedObject.set('stroke', color);
        selectedObject.setCoords();
        canvas.requestRenderAll();
      }
      get().saveHistory();
    }
  },
  
  setStrokeWidth: (width) => {
    set({ strokeWidth: width });
    const { canvas, selectedObject, textSelectionRange } = get();
    if (canvas && selectedObject) {
      if (isEditableTextObject(selectedObject)) {
        const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { strokeWidth: width }, textSelectionRange);
        if (result.textObject) set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
      } else {
        selectedObject.set('strokeWidth', width);
        selectedObject.setCoords();
        canvas.requestRenderAll();
      }
      get().saveHistory();
    }
  },
  
  setFontFamily: (family) => {
    set({ fontFamily: family });
    const { canvas, selectedObject, textSelectionRange } = get();
    const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { fontFamily: family }, textSelectionRange);
    if (result.textObject) set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
    if (result.applied) get().saveHistory();
  },
  
  setFontSize: (size) => get().applyFontSize(size),

  applyFontSize: (size) => {
    const nextSize = clampFontSize(size);
    const { canvas, selectedObject, textSelectionRange } = get();
    const objectCanvas = isEditableTextObject(selectedObject) ? (selectedObject.canvas as fabric.Canvas | undefined) : undefined;
    const activeCanvas = canvas || objectCanvas || null;
    const activeObject = activeCanvas?.getActiveObject();
    const targetObject = isEditableTextObject(activeObject) ? activeObject : selectedObject;

    if (!activeCanvas || !isEditableTextObject(targetObject)) return;

    set({ fontSize: nextSize });
    const result = applyTextStylesToSelectionOrObject(activeCanvas, targetObject, { fontSize: nextSize }, textSelectionRange);
    if (result.textObject) set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
    if (result.applied) get().saveHistory();
  },

  increaseFontSize: () => {
    const { canvas, selectedObject, fontSize, textSelectionRange } = get();
    const activeObject = canvas?.getActiveObject();
    const targetObject = isEditableTextObject(activeObject) ? activeObject : selectedObject;
    const currentSize = isEditableTextObject(targetObject)
      ? readSelectionStyleValue<number>(targetObject, 'fontSize', fontSize, textSelectionRange)
      : fontSize;
    get().applyFontSize((typeof currentSize === 'number' ? currentSize : fontSize) + 1);
  },

  decreaseFontSize: () => {
    const { canvas, selectedObject, fontSize, textSelectionRange } = get();
    const activeObject = canvas?.getActiveObject();
    const targetObject = isEditableTextObject(activeObject) ? activeObject : selectedObject;
    const currentSize = isEditableTextObject(targetObject)
      ? readSelectionStyleValue<number>(targetObject, 'fontSize', fontSize, textSelectionRange)
      : fontSize;
    get().applyFontSize((typeof currentSize === 'number' ? currentSize : fontSize) - 1);
  },
  
  setFontWeight: (weight) => {
    set({ fontWeight: weight });
    const { canvas, selectedObject, textSelectionRange } = get();
    const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { fontWeight: weight }, textSelectionRange);
    if (result.textObject) set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
    if (result.applied) get().saveHistory();
  },
  
  setFontStyle: (style) => {
    set({ fontStyle: style });
    const { canvas, selectedObject, textSelectionRange } = get();
    const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { fontStyle: style }, textSelectionRange);
    if (result.textObject) set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
    if (result.applied) get().saveHistory();
  },
  
  setUnderline: (underline) => {
    set({ underline });
    const { canvas, selectedObject, textSelectionRange } = get();
    const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { underline }, textSelectionRange);
    if (result.textObject) set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
    if (result.applied) get().saveHistory();
  },
  
  setTextAlign: (align) => {
    set({ textAlign: align });
    const { canvas, selectedObject } = get();
    if (canvas && isEditableTextObject(selectedObject)) {
      selectedObject.set('textAlign', align);
      selectedObject.initDimensions?.();
      selectedObject.setCoords();
      canvas.requestRenderAll();
      get().saveHistory();
    }
  },
  
  setOpacity: (opacity) => {
    set({ opacity });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject) {
      selectedObject.set('opacity', opacity);
      canvas.renderAll();
      get().saveHistory();
    }
  },

  setProjectName: async (name) => {
    set({ projectName: name });
    const { projectId } = get();
    if (!projectId) return;
    const safeProjectName = name.trim() || 'New Design';

    // Handle localStorage projects
    if (projectId.startsWith('local_')) {
      const raw = localStorage.getItem('teckstudio_local_projects');
      const projects = raw ? JSON.parse(raw) : [];
      const idx = projects.findIndex((p: any) => p.id === projectId);
      if (idx >= 0) {
        projects[idx].name = safeProjectName;
        projects[idx].updatedAt = new Date().toISOString();
        localStorage.setItem('teckstudio_local_projects', JSON.stringify(projects));
      }
      return;
    }

    const token = getAuthToken();
    if (!token) return;

    try {
      await apiFetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: safeProjectName })
      });
    } catch (err) {
      console.error('Error renaming project on backend:', err);
    }
  },

  saveProjectMeta: () => {
    const { projectId, projectName } = get();
    if (!projectId) return;
    const safeProjectName = projectName.trim() || 'New Design';

    if (projectId.startsWith('local_')) {
      const raw = localStorage.getItem('teckstudio_local_projects');
      const projects = raw ? JSON.parse(raw) : [];
      const idx = projects.findIndex((p: any) => p.id === projectId);
      if (idx >= 0) {
        projects[idx].name = safeProjectName;
        projects[idx].updatedAt = new Date().toISOString();
        localStorage.setItem('teckstudio_local_projects', JSON.stringify(projects));
      }
      return;
    }

    const token = getAuthToken();
    if (!token) return;

    apiFetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: safeProjectName })
    }).catch(() => {});
  },

  loadProject: async (projectId) => {
    console.log('[TECKSTUDIO] loadProject called:', projectId);
    set({ projectId, isProjectLoading: true, projectLoadError: '' });

    const failLoad = (message: string, project?: ProjectCanvasPayload) => {
      const canvas = get().canvas;
      if (canvas) clearCanvasToProjectSize(canvas, project);
      set({ isProjectLoading: false, projectLoadError: message, selectedObject: null, history: [], historyIndex: -1 });
    };

    const finishLoad = async (project: ProjectCanvasPayload & { name?: string; createdAt?: string; updatedAt?: string }) => {
      const canvas = get().canvas;
      set({
        projectName: project.name || 'Untitled Design',
        projectCreatedAt: project.createdAt || '',
        projectUpdatedAt: project.updatedAt || '',
      });

      if (!canvas) {
        set({ isProjectLoading: false });
        return;
      }

      const loadedJson = await applyProjectCanvas(canvas, project);
      set({
        history: [loadedJson.json],
        historyIndex: 0,
        selectedObject: null,
        isProjectLoading: false,
        projectLoadError: '',
        canvasWidth: loadedJson.width,
        canvasHeight: loadedJson.height,
      });
    };

    if (projectId.startsWith('local_')) {
      try {
        const raw = localStorage.getItem('teckstudio_local_projects');
        const projects = raw ? JSON.parse(raw) : [];
        const project = projects.find((p: any) => p.id === projectId);
        console.log('[TECKSTUDIO] localStorage project found:', project ? 'yes' : 'no');
        if (!project) {
          failLoad('This local project could not be found. It may have been removed from this browser.');
          return;
        }
        await finishLoad(project);
      } catch (error) {
        failLoad(error instanceof Error ? error.message : 'Unable to load the local project canvas.');
      }
      return;
    }

    const token = getAuthToken();
    if (!token) {
      failLoad('Please sign in again to load this design.');
      return;
    }

    try {
      const response = await apiFetch(`/api/projects/${projectId}`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        failLoad(data?.detail || data?.error || `Unable to load this project (${response.status}).`);
        return;
      }

      const project = data?.project || data;
      if (!project?.id) {
        throw new Error('Backend returned an invalid project payload.');
      }
      await finishLoad(project);
    } catch (error) {
      failLoad(error instanceof Error ? error.message : 'Unable to load the project canvas.');
    }
  },

  clearProjectLoadError: () => set({ projectLoadError: '' }),
  
  setEditorMode: (editorMode) => {
    set({ editorMode });
    const { canvas } = get();
    if (canvas) {
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  },

  setPenMode: (isPenMode) => {
    set({ isPenMode });
    const { canvas } = get();
    if (canvas) {
      if (isPenMode) {
        canvas.isDrawingMode = false;
        canvas.discardActiveObject();
      }
      canvas.renderAll();
    }
  },

  setRulersEnabled: (rulersEnabled) => set({ rulersEnabled }),
  setShowGuides: (showGuides) => set({ showGuides }),

  setSelectedPage: (selected) => {
    set({ selectedPage: selected });
    // When selecting the page, deselect any element
    if (selected) {
      const { canvas } = get();
      if (canvas) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
      set({ selectedObject: null, textSelectionRange: null });
    }
  },

  setCanvasDimensions: (width, height) => {
    set({ canvasWidth: width, canvasHeight: height });
  },

  setCanvasBackgroundColor: (color) => {
    const { canvas } = get();
    set({ canvasBackgroundColor: color });
    if (canvas) {
      canvas.setBackgroundColor(color, () => canvas.renderAll());
      get().saveHistory();
    }
  },

  setCurrentPreset: (presetId) => set({ currentPresetId: presetId }),

  resizeCanvas: (width, height) => {
    const { canvas } = get();
    if (!canvas) return;
    const oldW = canvas.getWidth() || 800;
    const oldH = canvas.getHeight() || 800;
    const scaleX = width / oldW;
    const scaleY = height / oldH;
    const scale = Math.min(scaleX, scaleY);

    // Scale all objects proportionally
    canvas.getObjects().forEach((obj) => {
      const left = (obj.left || 0) * scaleX;
      const top = (obj.top || 0) * scaleY;
      obj.set({ left, top });
      if (obj.scaleX !== undefined) obj.set({ scaleX: (obj.scaleX || 1) * scaleX });
      if (obj.scaleY !== undefined) obj.set({ scaleY: (obj.scaleY || 1) * scaleY });
      obj.setCoords();
    });

    canvas.setWidth(width);
    canvas.setHeight(height);
    set({ canvasWidth: width, canvasHeight: height });
    canvas.renderAll();
    get().saveHistory();
  },

  updateObjectName: (objId, name) => {
    const { canvas } = get();
    if (!canvas) return;
    const obj = canvas.getObjects().find(o => (o as any).get('id') === objId);
    if (obj) {
      (obj as any).set('name', name);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  saveHistory: async () => {
    const canvas = get().canvas;
    if (!canvas) return;

    normalizeLoadedTextStyles(canvas);
    const json = JSON.stringify(canvas.toJSON(CUSTOM_FABRIC_PROPERTIES));
    const { history, historyIndex, projectId, projectName } = get();
    const safeProjectName = projectName.trim() || 'New Design';

    const newHistory = history.slice(0, historyIndex + 1);

    if (newHistory.length > 0 && newHistory[newHistory.length - 1] === json) {
      return;
    }

    const updatedHistory = [...newHistory, json];
    set({
      history: updatedHistory,
      historyIndex: newHistory.length,
    });

    if (projectId) {
      // Handle localStorage projects
      if (projectId.startsWith('local_')) {
        const raw = localStorage.getItem('teckstudio_local_projects');
        const projects = raw ? JSON.parse(raw) : [];
        const idx = projects.findIndex((p: any) => p.id === projectId);
        if (idx >= 0) {
          projects[idx].data = json;
          projects[idx].width = canvas.getWidth();
          projects[idx].height = canvas.getHeight();
          projects[idx].updatedAt = new Date().toISOString();
          localStorage.setItem('teckstudio_local_projects', JSON.stringify(projects));
          set({ projectUpdatedAt: projects[idx].updatedAt });
        }
        return;
      }

      const token = getAuthToken();
      if (!token) return;

      try {
        const response = await apiFetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: safeProjectName,
            data: json,
            width: canvas.getWidth(),
            height: canvas.getHeight(),
          })
        });
        const data = await response.json();
        const project = data.project || data;
        if (response.ok && project?.updatedAt) {
          set({ projectUpdatedAt: project.updatedAt });
        }
      } catch (err) {
        console.error('Error saving history on backend:', err);
      }
    }
  },
  
  
  undo: () => {
    const { canvas, history, historyIndex } = get();
    if (!canvas || historyIndex <= 0) return;
    
    const prevIndex = historyIndex - 1;
    const state = history[prevIndex];
    
    loadCanvasFromJson(canvas, state).then(() => {
      set({ historyIndex: prevIndex, selectedObject: null });
      localStorage.setItem('teckstudio_project_draft', state);
    }).catch((error) => {
      set({ projectLoadError: error instanceof Error ? error.message : 'Unable to restore undo state.' });
    });
  },
  
  redo: () => {
    const { canvas, history, historyIndex } = get();
    if (!canvas || historyIndex >= history.length - 1) return;
    
    const nextIndex = historyIndex + 1;
    const state = history[nextIndex];
    
    loadCanvasFromJson(canvas, state).then(() => {
      set({ historyIndex: nextIndex, selectedObject: null });
      localStorage.setItem('teckstudio_project_draft', state);
    }).catch((error) => {
      set({ projectLoadError: error instanceof Error ? error.message : 'Unable to restore redo state.' });
    });
  },
  
  clearHistory: () => {
    set({ history: [], historyIndex: -1 });
  },
  
  deleteSelected: () => {
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject) {
      // If it's an active selection group, delete all objects in it
      if (selectedObject.type === 'activeSelection') {
        const activeSelection = selectedObject as fabric.ActiveSelection;
        activeSelection.forEachObject((obj) => {
          const sourceId = String(obj.get('id' as keyof fabric.Object) || '');
          if (sourceId) removeGeneratedTextEffectLayers(canvas, sourceId);
          canvas.remove(obj);
        });
        canvas.discardActiveObject();
      } else {
        const sourceId = String(selectedObject.get('id' as keyof fabric.Object) || '');
        if (sourceId) removeGeneratedTextEffectLayers(canvas, sourceId);
        canvas.remove(selectedObject);
      }
      canvas.renderAll();
      set({ selectedObject: null, selectedPage: true });
      get().saveHistory();
    }
  },
  
  duplicateSelected: () => {
    const { canvas, selectedObject } = get();
    if (!canvas || !selectedObject) return;
    
    selectedObject.clone((clonedObj: fabric.Object) => {
      canvas.discardActiveObject();
      const clonedMetadata = CUSTOM_FABRIC_PROPERTIES.reduce<Record<string, unknown>>((acc, key) => {
        const value = selectedObject.get(key as keyof fabric.Object);
        if (value !== undefined) acc[key] = value;
        return acc;
      }, {});
      clonedObj.set({
        ...clonedMetadata,
        id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `obj_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: clonedMetadata.name ? `${String(clonedMetadata.name)} Copy` : selectedObject.get('name' as keyof fabric.Object),
        effectGroupId: undefined,
        effectGroupRole: undefined,
        sourceObjectId: undefined,
        generatedEffectLayer: false,
        left: (clonedObj.left || 0) + 15,
        top: (clonedObj.top || 0) + 15,
        evented: true,
      } as Record<string, unknown>);
      
      if (clonedObj.type === 'activeSelection') {
        // Active selection needs a canvas reference to set active object correctly
        clonedObj.canvas = canvas;
        (clonedObj as any).forEachObject((obj: fabric.Object) => {
          canvas.add(obj);
        });
        canvas.setActiveObject(clonedObj);
      } else {
        canvas.add(clonedObj);
        canvas.setActiveObject(clonedObj);
      }
      
      const clonedEffect = clonedObj.get('textEffectConfig' as keyof fabric.Object) as TextEffectConfig | undefined;
      const finishDuplicate = () => {
        canvas.requestRenderAll();
        set({ selectedObject: clonedObj });
        get().saveHistory();
      };
      if (clonedEffect && isTextEffectSource(clonedObj)) {
        void applyTextEffect(canvas, clonedObj, clonedEffect).then(finishDuplicate).catch((error) => {
          console.error('[TECKSTUDIO] Unable to duplicate linked text effect:', error);
          finishDuplicate();
        });
      } else {
        finishDuplicate();
      }
    });
  },
  
  clearCanvas: () => {
    const canvas = get().canvas;
    if (canvas) {
      canvas.clear();
      // Set background color back to white
      canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
      set({ selectedObject: null });
      get().saveHistory();
    }
  },
  
  groupSelected: () => {
    const { canvas, selectedObject } = get();
    if (!canvas || !selectedObject) return;

    if (selectedObject.type === 'activeSelection') {
      const activeSelection = selectedObject as fabric.ActiveSelection;
      activeSelection.toGroup();
      canvas.requestRenderAll();
      get().saveHistory();
    }
  },
  
  ungroupSelected: () => {
    const { canvas, selectedObject } = get();
    if (!canvas || !selectedObject) return;

    if (selectedObject.type === 'group') {
      const group = selectedObject as fabric.Group;
      group.toActiveSelection();
      canvas.requestRenderAll();
      get().saveHistory();
    }
  }
}));
