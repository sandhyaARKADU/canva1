import { create } from 'zustand';
import { fabric } from 'fabric';
import { apiFetch, getAuthToken } from '../services/apiClient';
import { CUSTOM_FABRIC_PROPERTIES } from '../utils/editorElementFactory';
import type { TextSelectionRange } from '../utils/textSelectionStyles';
import { ensureFontLoaded, preloadFontsFromCanvasJson } from '../utils/fontLoader';
import {
  applyTextEffect,
  isTextEffectSource,
  rehydrateTextEffects,
  removeGeneratedTextEffectLayers,
} from '../utils/textEffects';
import type { TextEffectConfig } from '../types/editorFeatures';
import { trackManualRoundedHighlightColorEdit } from '../utils/roundedHighlightText';
import {
  applyTextStylesToSelectionOrObject,
  captureTextSelection,
  clampFontSize,
  getFabricObjectId,
  isEditableTextObject,
  readSelectionStyleValue,
} from '../utils/textSelectionStyles';
import {
  assignNewArchitectureNodeIdentity,
  recolorArchitectureSymbol,
  setArchitectureSymbolStrokeWidth,
} from '../utils/architectureDiagram';
import { removeConnectorsForNode } from '../utils/diagramConnectors';
import { isPosterEditableText, rehydratePosterHotspots } from '../utils/posterConversionCanvas';
import { rehydrateCanvasVideos } from '../utils/canvasVideo';
import type {
  AudioDuckingConfig,
  EditorPage,
  SceneAnimationConfig,
  TimelineAudioClip,
  TimelineClip,
  TimelineFps,
  TimelinePlaybackState,
  TimelineProject,
  TimelineTransitionType,
} from '../types/timeline';
import {
  createDefaultTimelineProject,
  getPosterTrack,
  normalizeTimelineProject,
} from '../types/timeline';

const DEFAULT_CANVAS_BACKGROUND = '#000000';
const LEGACY_WHITE_BACKGROUNDS = new Set(['#fff', '#ffffff', 'white', 'rgb(255,255,255)', 'rgb(255, 255, 255)']);

const resolveBlankCanvasBackground = (background?: string | null) => {
  const normalized = background?.trim().toLowerCase();
  return !normalized || LEGACY_WHITE_BACKGROUNDS.has(normalized)
    ? DEFAULT_CANVAS_BACKGROUND
    : background as string;
};

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

const createEmptyCanvasJson = (width: number, height: number, background = DEFAULT_CANVAS_BACKGROUND) => JSON.stringify({
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

const normalizeSerializedTextStylesValue = (value: unknown) => (
  Array.isArray(value) || (value && typeof value === 'object') ? value : {}
);

function normalizeSerializedTextStyles(parsed: { objects?: unknown[] }) {
  parsed.objects?.forEach((object) => {
    if (!object || typeof object !== 'object') return;
    const fabricObject = object as { type?: string; styles?: unknown };
    if (isTextType(fabricObject.type)) {
      fabricObject.styles = normalizeSerializedTextStylesValue(fabricObject.styles);
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
  const fallbackBackground = project.background_color || DEFAULT_CANVAS_BACKGROUND;

  if (!project.data) {
    return {
      json: createEmptyCanvasJson(
        fallbackWidth,
        fallbackHeight,
        resolveBlankCanvasBackground(fallbackBackground),
      ),
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
  const savedBackground = parsed.background || parsed.backgroundColor || fallbackBackground;
  parsed.background = parsed.objects.length === 0
    ? resolveBlankCanvasBackground(savedBackground)
    : savedBackground;
  normalizeSerializedTextStyles(parsed);

  return { json: JSON.stringify(parsed), width, height };
}

const fallbackObjectName = (object: fabric.Object, index: number) => {
  const type = object.type || 'layer';
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} ${index + 1}`;
};

const isEditorOnlyObject = (object: fabric.Object) => (
  object.get('editorOnly' as keyof fabric.Object) === true ||
  object.get('teckstudioObjectType' as keyof fabric.Object) === 'diagramAnchor' ||
  object.get('teckstudioObjectType' as keyof fabric.Object) === 'editorGuide'
);

const stripSerializedEditorObjects = (objects: unknown[]): unknown[] => objects
  .filter((object) => (
    !object ||
    typeof object !== 'object' ||
    !(object as { editorOnly?: boolean }).editorOnly
  ))
  .map((object) => {
    if (!object || typeof object !== 'object') return object;
    const serialized = object as {
      objects?: unknown[];
      strokeDashOffset?: number;
      teckstudioObjectType?: string;
    };
    const normalized = (
      serialized.teckstudioObjectType === 'diagramConnectorPath'
      || serialized.teckstudioObjectType === 'diagramArrowPath'
    )
      ? { ...serialized, strokeDashOffset: 0 }
      : serialized;
    return normalized.objects
      ? { ...normalized, objects: stripSerializedEditorObjects(normalized.objects) }
      : normalized;
  });

type ProjectEditorMetadata = {
  pages: EditorPage[];
  activePageId: string;
  timelineProject: TimelineProject;
};

const serializePageCanvas = (canvas: fabric.Canvas) => {
  const serialized = canvas.toJSON(CUSTOM_FABRIC_PROPERTIES) as { objects?: unknown[] };
  serialized.objects = stripSerializedEditorObjects(serialized.objects || []);
  return JSON.stringify(serialized);
};

const serializeCanvas = (canvas: fabric.Canvas, metadata?: ProjectEditorMetadata) => {
  const serialized = JSON.parse(serializePageCanvas(canvas)) as {
    teckstudioPages?: EditorPage[];
    teckstudioActivePageId?: string;
    teckstudioTimeline?: TimelineProject;
  };
  const state = metadata || {
    pages: useEditorStore.getState().pages,
    activePageId: useEditorStore.getState().activePageId,
    timelineProject: useEditorStore.getState().timelineProject,
  };
  serialized.teckstudioPages = state.pages;
  serialized.teckstudioActivePageId = state.activePageId;
  serialized.teckstudioTimeline = state.timelineProject;
  return JSON.stringify(serialized);
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
    const animationConfig = object.get('animationConfig' as keyof fabric.Object) as {
      animationType?: string;
      fullText?: string;
    } | undefined;
    if (
      animationConfig?.fullText !== undefined
      && String(animationConfig.animationType || '').toLowerCase().includes('typewriter')
      && 'text' in object
    ) {
      (object as fabric.Text).set('text', animationConfig.fullText);
    }
    if (object.selectable === undefined) object.set('selectable', true);
    if (object.evented === undefined) object.set('evented', true);
    object.setCoords();
  });
}

function loadCanvasFromJson(canvas: fabric.Canvas, json: string) {
  let parsedMetadata: {
    teckstudioPages?: EditorPage[];
    teckstudioActivePageId?: string;
    teckstudioTimeline?: TimelineProject;
  } = {};
  try {
    parsedMetadata = JSON.parse(json);
  } catch {
    parsedMetadata = {};
  }
  return preloadFontsFromCanvasJson(json).then(() => new Promise<string>((resolve, reject) => {
    try {
      canvas.loadFromJSON(json, () => {
        void (async () => {
          ensureCanvasViewport(canvas);
          canvas.getObjects().filter(isEditorOnlyObject).forEach((object) => canvas.remove(object));
          prepareCanvasObjects(canvas);
          rehydratePosterHotspots(canvas);
          await rehydrateTextEffects(canvas);
          await rehydrateCanvasVideos(canvas);
          const pages = Array.isArray(parsedMetadata.teckstudioPages) && parsedMetadata.teckstudioPages.length > 0
            ? parsedMetadata.teckstudioPages
            : [{
              id: 'page-1',
              name: 'Page 1',
              data: serializePageCanvas(canvas),
              updatedAt: new Date().toISOString(),
            }];
          const activePageId = pages.some((page) => page.id === parsedMetadata.teckstudioActivePageId)
            ? parsedMetadata.teckstudioActivePageId as string
            : pages[0].id;
          useEditorStore.setState({
            pages,
            activePageId,
            timelineProject: normalizeTimelineProject(parsedMetadata.teckstudioTimeline),
          });
          canvas.discardActiveObject();
          canvas.renderAll();
          resolve(serializeCanvas(canvas));
        })().catch(reject);
      });
    } catch (error) {
      reject(error);
    }
  }));
}

const loadPageCanvas = (canvas: fabric.Canvas, pageData: string) => (
  preloadFontsFromCanvasJson(pageData).then(() => new Promise<void>((resolve, reject) => {
    try {
      canvas.loadFromJSON(pageData, () => {
        void (async () => {
          ensureCanvasViewport(canvas);
          canvas.getObjects().filter(isEditorOnlyObject).forEach((object) => canvas.remove(object));
          prepareCanvasObjects(canvas);
          rehydratePosterHotspots(canvas);
          await rehydrateTextEffects(canvas);
          await rehydrateCanvasVideos(canvas);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          resolve();
        })().catch(reject);
      });
    } catch (error) {
      reject(error);
    }
  }))
);

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
  const background = project.background_color || DEFAULT_CANVAS_BACKGROUND;
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
  showSafeArea: boolean;
  safeAreaMargin: number;
  showGrid: boolean;

  // Page selection state — true when no element is selected (page is "active")
  selectedPage: boolean;
  pages: EditorPage[];
  activePageId: string;
  timelineProject: TimelineProject;
  timelinePlaybackState: TimelinePlaybackState;
  timelinePlaybackRate: number;
  timelineMuted: boolean;
  timelineAudioUnlocked: boolean;
  timelineRecording: boolean;
  timelineActiveVideoCount: number;
  selectedTimelineClipId: string | null;
  timelinePreviewActive: boolean;

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
  applyTextSelectionStyles: (styles: Record<string, unknown>, options?: { saveHistory?: boolean }) => boolean;
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
  syncActivePage: () => EditorPage[];
  addPage: () => void;
  duplicatePage: (pageId: string) => void;
  deletePage: (pageId: string, removeTimelineClips?: boolean) => void;
  movePage: (pageId: string, direction: 'up' | 'down') => void;
  renamePage: (pageId: string, name: string) => void;
  switchPage: (pageId: string) => Promise<void>;
  syncAllPages: () => Promise<EditorPage[]>;
  addPageToTimeline: (pageId: string) => void;
  insertPageAfterClip: (pageId: string, afterClipId: string | null) => void;
  createAndAddPage: (afterClipId: string | null) => void;
  duplicatePageAndAddToTimeline: (pageId: string, afterClipId: string | null) => void;
  removeTimelineClip: (clipId: string) => void;
  duplicateTimelineClip: (clipId: string) => void;
  moveTimelineClip: (clipId: string, direction: 'left' | 'right') => void;
  reorderTimelineClip: (clipId: string, targetClipId: string) => void;
  setTimelineClipDuration: (clipId: string, durationMs: number) => void;
  setTimelineClipAnimation: (clipId: string, animation: SceneAnimationConfig) => void;
  setTimelineClipLocked: (clipId: string, locked: boolean) => void;
  setTimelineClipVisible: (clipId: string, visible: boolean) => void;
  replaceTimelineClipPage: (clipId: string, pageId: string) => void;
  setTimelineTransition: (fromClipId: string, toClipId: string, type: TimelineTransitionType, durationMs: number) => void;
  setAllTimelineTransitions: (type: TimelineTransitionType, durationMs: number) => void;
  setTimelineCurrentTime: (currentTimeMs: number) => void;
  setTimelineFps: (fps: TimelineFps) => void;
  setTimelineZoom: (zoom: number) => void;
  setTimelineCollapsed: (collapsed: boolean) => void;
  setTimelineHeight: (height: number) => void;
  setTimelineLoopPreview: (loop: boolean) => void;
  setTimelinePlaybackState: (state: TimelinePlaybackState) => void;
  setTimelinePlaybackRate: (rate: number) => void;
  setTimelineMuted: (muted: boolean) => void;
  setTimelineAudioUnlocked: (unlocked: boolean) => void;
  setTimelineRecording: (recording: boolean) => void;
  setTimelineActiveVideoCount: (count: number) => void;
  setSelectedTimelineClipId: (clipId: string | null) => void;
  setTimelinePreviewActive: (active: boolean) => void;
  setTimelineProject: (project: TimelineProject) => void;

  // Audio Clip Actions
  toggleSafeArea: () => void;
  toggleGrid: () => void;
  addAudioClip: (clip: TimelineAudioClip) => void;
  updateAudioClip: (clipId: string, updates: Partial<TimelineAudioClip>) => void;
  deleteAudioClip: (clipId: string) => void;
  duplicateAudioClip: (clipId: string) => void;
  splitAudioClipAtPlayhead: (clipId: string) => void;
  setAudioDucking: (ducking: AudioDuckingConfig) => void;

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

  // Canvas dimensions defaults (1080 x 1080 Instagram Square standard)
  canvasWidth: 1080,
  canvasHeight: 1080,
  canvasBackgroundColor: DEFAULT_CANVAS_BACKGROUND,
  currentPresetId: null,
  showSafeArea: false,
  safeAreaMargin: 108, // 10% safe area
  showGrid: false,
  selectedPage: true, // Page is selected by default when editor opens
  pages: [{ id: 'page-1', name: 'Page 1', data: '' }],
  activePageId: 'page-1',
  timelineProject: createDefaultTimelineProject(),
  timelinePlaybackState: 'paused',
  timelinePlaybackRate: 1,
  timelineMuted: true,
  timelineAudioUnlocked: false,
  timelineRecording: false,
  timelineActiveVideoCount: 0,
  selectedTimelineClipId: null,
  timelinePreviewActive: false,

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

  applyTextSelectionStyles: (styles, options) => {
    const { canvas, selectedObject, textSelectionRange } = get();
    const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, styles, textSelectionRange);
    if (!result.applied) return false;
    if (result.textObject) {
      trackManualRoundedHighlightColorEdit(
        result.textObject,
        captureTextSelection(result.textObject) || textSelectionRange,
        styles.fill,
      );
      set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
    }
    if (options?.saveHistory !== false) get().saveHistory();
    return true;
  },

  setFillColor: (color) => {
    set({ fillColor: color });
    const { canvas, selectedObject, textSelectionRange } = get();
    if (canvas && selectedObject) {
      if (isEditableTextObject(selectedObject)) {
        const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { fill: color }, textSelectionRange);
        if (result.textObject) {
          trackManualRoundedHighlightColorEdit(
            result.textObject,
            captureTextSelection(result.textObject) || textSelectionRange,
            color,
          );
          set({ selectedObject: result.textObject, textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange });
        }
      } else {
        if (!recolorArchitectureSymbol(selectedObject, color)) selectedObject.set('fill', color);
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
        if (!recolorArchitectureSymbol(selectedObject, color)) selectedObject.set('stroke', color);
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
        if (!setArchitectureSymbolStrokeWidth(selectedObject, width)) selectedObject.set('strokeWidth', width);
        selectedObject.setCoords();
        canvas.requestRenderAll();
      }
      get().saveHistory();
    }
  },
  
  setFontFamily: (family) => {
    set({ fontFamily: family });
    const { canvas, selectedObject, textSelectionRange } = get();
    if (!canvas || !isEditableTextObject(selectedObject)) return;
    const center = selectedObject.getCenterPoint();
    const weightValue = selectedObject.get('fontWeight' as keyof fabric.Object);
    const weight = Number(weightValue) || (weightValue === 'bold' ? 700 : 400);
    const style = selectedObject.get('fontStyle' as keyof fabric.Object) === 'italic' ? 'italic' : 'normal';
    void ensureFontLoaded({
      id: family,
      family,
      source: 'built-in',
      weight,
      style,
    }).then(() => {
      if (!canvas.contains(selectedObject)) return;
      const result = applyTextStylesToSelectionOrObject(canvas, selectedObject, { fontFamily: family }, textSelectionRange);
      if (result.textObject) {
        result.textObject.setPositionByOrigin(center, 'center', 'center');
        result.textObject.initDimensions?.();
        result.textObject.setCoords();
        set({
          selectedObject: result.textObject,
          textSelectionRange: captureTextSelection(result.textObject) || textSelectionRange,
        });
        canvas.requestRenderAll();
      }
      if (result.applied) get().saveHistory();
    }).catch((error) => {
      console.error('[TECKSTUDIO] Unable to load selected font:', error);
    });
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
      const loadedBackground =
        typeof canvas.backgroundColor === 'string' && canvas.backgroundColor
          ? canvas.backgroundColor
          : DEFAULT_CANVAS_BACKGROUND;
      set({
        history: [loadedJson.json],
        historyIndex: 0,
        selectedObject: null,
        isProjectLoading: false,
        projectLoadError: '',
        canvasWidth: loadedJson.width,
        canvasHeight: loadedJson.height,
        canvasBackgroundColor: loadedBackground,
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

  syncActivePage: () => {
    const { canvas, pages, activePageId, timelineProject } = get();
    if (!canvas) return pages;
    const data = serializePageCanvas(canvas);
    let thumbnail: string | undefined;
    try {
      thumbnail = canvas.toDataURL({ format: 'png', multiplier: 0.18 });
    } catch {
      thumbnail = pages.find((page) => page.id === activePageId)?.thumbnail;
    }
    const updatedAt = new Date().toISOString();
    const nextPages = pages.map((page) => (
      page.id === activePageId ? { ...page, data, thumbnail, updatedAt } : page
    ));
    const activePage = nextPages.find((page) => page.id === activePageId);
    const nextTimeline = activePage
      ? {
        ...timelineProject,
        tracks: timelineProject.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => clip.pageId === activePageId ? {
            ...clip,
            name: activePage.name,
            thumbnailUrl: activePage.thumbnail,
          } : clip),
        })),
      }
      : timelineProject;
    set({ pages: nextPages, timelineProject: nextTimeline });
    return nextPages;
  },

  addPage: () => {
    const pages = get().syncActivePage();
    const canvas = get().canvas;
    const id = window.crypto?.randomUUID
      ? `page-${window.crypto.randomUUID()}`
      : `page-${Date.now()}`;
    const page: EditorPage = {
      id,
      name: `Page ${pages.length + 1}`,
      data: '',
      updatedAt: new Date().toISOString(),
    };
    set({ pages: [...pages, page], activePageId: id, selectedObject: null });
    if (canvas) {
      canvas.clear();
      canvas.setBackgroundColor(DEFAULT_CANVAS_BACKGROUND, () => canvas.requestRenderAll());
    }
    get().saveHistory();
  },

  duplicatePage: (pageId) => {
    const pages = get().syncActivePage();
    const sourceIndex = pages.findIndex((page) => page.id === pageId);
    if (sourceIndex < 0) return;
    const source = pages[sourceIndex];
    const copy: EditorPage = {
      ...source,
      id: window.crypto?.randomUUID
        ? `page-${window.crypto.randomUUID()}`
        : `page-${Date.now()}`,
      name: `${source.name} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    const nextPages = [...pages];
    nextPages.splice(sourceIndex + 1, 0, copy);
    set({ pages: nextPages });
    get().saveHistory();
  },

  deletePage: (pageId, removeTimelineClips = false) => {
    const { pages, activePageId, canvas, timelineProject } = get();
    if (pages.length <= 1) return;
    const nextPages = pages.filter((page) => page.id !== pageId);
    let nextTimeline = timelineProject;
    if (removeTimelineClips) {
      const posterTrack = getPosterTrack(timelineProject);
      const removedClipIds = new Set(posterTrack.clips.filter((clip) => clip.pageId === pageId).map((clip) => clip.id));
      nextTimeline = normalizeTimelineProject({
        ...timelineProject,
        tracks: timelineProject.tracks.map((track) => (
          track.type === 'poster'
            ? { ...track, clips: track.clips.filter((clip) => clip.pageId !== pageId) }
            : track
        )),
        transitions: timelineProject.transitions.filter((transition) => (
          !removedClipIds.has(transition.fromClipId) && !removedClipIds.has(transition.toClipId)
        )),
      });
    }
    const nextActivePageId = activePageId === pageId ? nextPages[0].id : activePageId;
    set({
      pages: nextPages,
      activePageId: nextActivePageId,
      timelineProject: nextTimeline,
      selectedTimelineClipId: null,
    });
    if (activePageId === pageId && canvas) {
      const target = nextPages[0];
      const data = target.data || createEmptyCanvasJson(canvas.getWidth(), canvas.getHeight());
      void loadPageCanvas(canvas, data).then(() => get().saveHistory()).catch((error) => {
        set({ projectLoadError: error instanceof Error ? error.message : 'Unable to load the remaining page.' });
      });
      return;
    }
    get().saveHistory();
  },

  movePage: (pageId, direction) => {
    const pages = [...get().pages];
    const index = pages.findIndex((page) => page.id === pageId);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= pages.length) return;
    const [page] = pages.splice(index, 1);
    pages.splice(nextIndex, 0, page);
    set({ pages });
    get().saveHistory();
  },

  renamePage: (pageId, name) => {
    const safeName = name.trim();
    if (!safeName) return;
    const pages = get().pages.map((page) => page.id === pageId ? { ...page, name: safeName } : page);
    const timelineProject = normalizeTimelineProject({
      ...get().timelineProject,
      tracks: get().timelineProject.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.pageId === pageId ? { ...clip, name: safeName } : clip),
      })),
    });
    set({ pages, timelineProject });
    get().saveHistory();
  },

  syncAllPages: async () => {
    // Ensures every page has serialized canvas data so the export renderer can load it.
    // Cycles through pages that have empty data: loads onto canvas → serializes → restores active page.
    const canvas = get().canvas;
    if (!canvas) return get().syncActivePage();

    const originalActivePageId = get().activePageId;
    // Save current page first
    let pages = get().syncActivePage();
    const emptyPageIds = pages
      .filter((page) => page.id !== originalActivePageId && !page.data)
      .map((page) => page.id);

    for (const pageId of emptyPageIds) {
      const target = get().pages.find((page) => page.id === pageId);
      if (!target) continue;
      const emptyJson = createEmptyCanvasJson(canvas.getWidth() || 800, canvas.getHeight() || 800);
      await loadPageCanvas(canvas, target.data || emptyJson);
      pages = get().syncActivePage();
    }

    // Restore the originally active page
    if (get().activePageId !== originalActivePageId) {
      const originalPage = pages.find((page) => page.id === originalActivePageId);
      if (originalPage && canvas) {
        await loadPageCanvas(canvas, originalPage.data ||
          createEmptyCanvasJson(canvas.getWidth() || 800, canvas.getHeight() || 800));
        set({ activePageId: originalActivePageId });
        pages = get().syncActivePage();
      }
    }
    // Recapture base states so the live canvas reflects the restored active page
    const { masterTimelineManager: tlManager } = await import('../utils/masterTimelineManager');
    tlManager.captureBaseStates();
    return pages;
  },

  switchPage: async (pageId) => {
    if (pageId === get().activePageId) return;
    const pages = get().syncActivePage();
    const target = pages.find((page) => page.id === pageId);
    const canvas = get().canvas;
    if (!target || !canvas) {
      set({ activePageId: pageId });
      return;
    }
    const data = target.data || createEmptyCanvasJson(canvas.getWidth(), canvas.getHeight());
    await loadPageCanvas(canvas, data);
    set({ activePageId: pageId, selectedObject: null, selectedPage: true });
    // Recapture base states after the new page's objects are loaded onto the canvas,
    // so masterTimelineManager.applyObjectTimeline() starts from correct base values.
    const { masterTimelineManager: tlManager } = await import('../utils/masterTimelineManager');
    tlManager.captureBaseStates();
    get().saveHistory();
  },

  addPageToTimeline: (pageId) => {
    const pages = get().syncActivePage();
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    const timeline = get().timelineProject;
    const posterTrack = getPosterTrack(timeline);
    const clip: TimelineClip = {
      id: window.crypto?.randomUUID ? `clip-${window.crypto.randomUUID()}` : `clip-${Date.now()}`,
      sceneId: page.id,
      pageId: page.id,
      name: page.name,
      thumbnailUrl: page.thumbnail,
      startMs: timeline.durationMs,
      durationMs: 3000,
      visible: true,
      locked: false,
    };
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      tracks: timeline.tracks.map((track) => (
        track.type === 'poster' ? { ...track, clips: [...posterTrack.clips, clip] } : track
      )),
    });
    set({ timelineProject: nextTimeline, selectedTimelineClipId: clip.id });
    get().saveHistory();
  },

  insertPageAfterClip: (pageId, afterClipId) => {
    const pages = get().syncActivePage();
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    const timeline = get().timelineProject;
    const posterTrack = getPosterTrack(timeline);
    const clip: TimelineClip = {
      id: window.crypto?.randomUUID ? `clip-${window.crypto.randomUUID()}` : `clip-${Date.now()}`,
      sceneId: page.id,
      pageId: page.id,
      name: page.name,
      thumbnailUrl: page.thumbnail,
      startMs: 0,
      durationMs: 5000,
      visible: true,
      locked: false,
    };
    const clips = [...posterTrack.clips];
    const insertIndex = afterClipId
      ? clips.findIndex((c) => c.id === afterClipId) + 1
      : clips.length;
    clips.splice(Math.max(insertIndex, 0), 0, clip);
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      tracks: timeline.tracks.map((track) =>
        track.type === 'poster' ? { ...track, clips } : track
      ),
    });
    set({ timelineProject: nextTimeline, selectedTimelineClipId: clip.id });
    get().saveHistory();
  },

  createAndAddPage: (afterClipId) => {
    const pages = get().syncActivePage();
    const canvas = get().canvas;
    const id = window.crypto?.randomUUID
      ? `page-${window.crypto.randomUUID()}`
      : `page-${Date.now()}`;
    const page: EditorPage = {
      id,
      name: `Page ${pages.length + 1}`,
      data: '',
      updatedAt: new Date().toISOString(),
    };
    set({ pages: [...pages, page], activePageId: id, selectedObject: null });
    if (canvas) {
      canvas.clear();
      canvas.setBackgroundColor('#000000', () => canvas.requestRenderAll());
    }
    // Now insert into timeline
    const timeline = get().timelineProject;
    const posterTrack = getPosterTrack(timeline);
    const clip: TimelineClip = {
      id: window.crypto?.randomUUID ? `clip-${window.crypto.randomUUID()}` : `clip-${Date.now()}`,
      sceneId: id,
      pageId: id,
      name: page.name,
      thumbnailUrl: undefined,
      startMs: 0,
      durationMs: 5000,
      visible: true,
      locked: false,
    };
    const clips = [...posterTrack.clips];
    const insertIndex = afterClipId
      ? clips.findIndex((c) => c.id === afterClipId) + 1
      : clips.length;
    clips.splice(Math.max(insertIndex, 0), 0, clip);
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      tracks: timeline.tracks.map((track) =>
        track.type === 'poster' ? { ...track, clips } : track
      ),
    });
    set({ timelineProject: nextTimeline, selectedTimelineClipId: clip.id });
    get().saveHistory();
  },

  duplicatePageAndAddToTimeline: (pageId, afterClipId) => {
    const pages = get().syncActivePage();
    const source = pages.find((page) => page.id === pageId);
    if (!source) return;
    const newId = window.crypto?.randomUUID
      ? `page-${window.crypto.randomUUID()}`
      : `page-${Date.now()}`;
    const copy: EditorPage = {
      ...source,
      id: newId,
      name: `${source.name} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    set({ pages: [...pages, copy] });
    get().insertPageAfterClip(newId, afterClipId);
  },

  removeTimelineClip: (clipId) => {
    const timeline = get().timelineProject;
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      tracks: timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.id !== clipId),
      })),
      transitions: timeline.transitions.filter((transition) => (
        transition.fromClipId !== clipId && transition.toClipId !== clipId
      )),
    });
    set({ timelineProject: nextTimeline, selectedTimelineClipId: null });
    get().saveHistory();
  },

  duplicateTimelineClip: (clipId) => {
    const timeline = get().timelineProject;
    const posterTrack = getPosterTrack(timeline);
    const index = posterTrack.clips.findIndex((clip) => clip.id === clipId);
    if (index < 0) return;
    const copy: TimelineClip = {
      ...posterTrack.clips[index],
      id: window.crypto?.randomUUID ? `clip-${window.crypto.randomUUID()}` : `clip-${Date.now()}`,
      name: `${posterTrack.clips[index].name} copy`,
    };
    const clips = [...posterTrack.clips];
    clips.splice(index + 1, 0, copy);
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      tracks: timeline.tracks.map((track) => track.type === 'poster' ? { ...track, clips } : track),
    });
    set({ timelineProject: nextTimeline, selectedTimelineClipId: copy.id });
    get().saveHistory();
  },

  moveTimelineClip: (clipId, direction) => {
    const timeline = get().timelineProject;
    const posterTrack = getPosterTrack(timeline);
    const clips = [...posterTrack.clips];
    const index = clips.findIndex((clip) => clip.id === clipId);
    const nextIndex = direction === 'left' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= clips.length) return;
    const [clip] = clips.splice(index, 1);
    clips.splice(nextIndex, 0, clip);
    const transitions = clips.slice(0, -1).flatMap((currentClip, transitionIndex) => {
      const previousBoundary = timeline.transitions.find((transition) => (
        transition.fromClipId === posterTrack.clips[transitionIndex]?.id
        && transition.toClipId === posterTrack.clips[transitionIndex + 1]?.id
      ));
      return previousBoundary ? [{
        ...previousBoundary,
        fromClipId: currentClip.id,
        toClipId: clips[transitionIndex + 1].id,
      }] : [];
    });
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      tracks: timeline.tracks.map((track) => track.type === 'poster' ? { ...track, clips } : track),
      transitions,
    });
    set({ timelineProject: nextTimeline });
    get().saveHistory();
  },

  reorderTimelineClip: (clipId, targetClipId) => {
    if (clipId === targetClipId) return;
    const timeline = get().timelineProject;
    const posterTrack = getPosterTrack(timeline);
    const clips = [...posterTrack.clips];
    const sourceIndex = clips.findIndex((clip) => clip.id === clipId);
    const targetIndex = clips.findIndex((clip) => clip.id === targetClipId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [clip] = clips.splice(sourceIndex, 1);
    clips.splice(targetIndex, 0, clip);
    const transitions = clips.slice(0, -1).flatMap((currentClip, transitionIndex) => {
      const previousBoundary = timeline.transitions.find((transition) => (
        transition.fromClipId === posterTrack.clips[transitionIndex]?.id
        && transition.toClipId === posterTrack.clips[transitionIndex + 1]?.id
      ));
      return previousBoundary ? [{
        ...previousBoundary,
        fromClipId: currentClip.id,
        toClipId: clips[transitionIndex + 1].id,
      }] : [];
    });
    set({
      timelineProject: normalizeTimelineProject({
        ...timeline,
        tracks: timeline.tracks.map((track) => track.type === 'poster' ? { ...track, clips } : track),
        transitions,
      }),
    });
    get().saveHistory();
  },

  setTimelineClipDuration: (clipId, durationMs) => {
    const timeline = get().timelineProject;
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      tracks: timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (
          clip.id === clipId ? { ...clip, durationMs } : clip
        )),
      })),
    });
    set({ timelineProject: nextTimeline });
    get().saveHistory();
  },

  setTimelineClipAnimation: (clipId, animation) => {
    const timeline = get().timelineProject;
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      tracks: timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, animation } : clip),
      })),
    });
    set({ timelineProject: nextTimeline });
    get().saveHistory();
  },

  setTimelineClipLocked: (clipId, locked) => {
    const timeline = get().timelineProject;
    set({
      timelineProject: normalizeTimelineProject({
        ...timeline,
        tracks: timeline.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, locked } : clip),
        })),
      }),
    });
    get().saveHistory();
  },

  setTimelineClipVisible: (clipId, visible) => {
    const timeline = get().timelineProject;
    set({
      timelineProject: normalizeTimelineProject({
        ...timeline,
        tracks: timeline.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, visible } : clip),
        })),
      }),
    });
    get().saveHistory();
  },

  replaceTimelineClipPage: (clipId, pageId) => {
    const page = get().pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    const timeline = get().timelineProject;
    set({
      timelineProject: normalizeTimelineProject({
        ...timeline,
        tracks: timeline.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => clip.id === clipId ? {
            ...clip,
            pageId: page.id,
            sceneId: page.id,
            name: page.name,
            thumbnailUrl: page.thumbnail,
          } : clip),
        })),
      }),
    });
    get().saveHistory();
  },

  setTimelineTransition: (fromClipId, toClipId, type, durationMs) => {
    const timeline = get().timelineProject;
    const clips = getPosterTrack(timeline).clips;
    const fromClip = clips.find((clip) => clip.id === fromClipId);
    const toClip = clips.find((clip) => clip.id === toClipId);
    if (!fromClip || !toClip) return;
    const maximumDuration = Math.floor(Math.min(fromClip.durationMs, toClip.durationMs) * 0.5);
    const safeDuration = type === 'none' ? 0 : Math.min(Math.max(durationMs, 100), maximumDuration);
    const transitions = timeline.transitions.filter((transition) => (
      !(transition.fromClipId === fromClipId && transition.toClipId === toClipId)
    ));
    if (type !== 'none') {
      transitions.push({
        id: window.crypto?.randomUUID ? `transition-${window.crypto.randomUUID()}` : `transition-${Date.now()}`,
        fromClipId,
        toClipId,
        type,
        durationMs: safeDuration,
      });
    }
    set({ timelineProject: normalizeTimelineProject({ ...timeline, transitions }) });
    get().saveHistory();
  },

  setAllTimelineTransitions: (type, durationMs) => {
    const timeline = get().timelineProject;
    const clips = getPosterTrack(timeline).clips;
    const transitions = clips.slice(0, -1).map((clip, index) => {
      const next = clips[index + 1];
      const maximumDuration = Math.floor(Math.min(clip.durationMs, next.durationMs) * 0.5);
      return {
        id: window.crypto?.randomUUID ? `transition-${window.crypto.randomUUID()}` : `transition-${Date.now()}-${index}`,
        fromClipId: clip.id,
        toClipId: next.id,
        type,
        durationMs: type === 'none' ? 0 : Math.min(Math.max(durationMs, 100), maximumDuration),
      };
    }).filter((transition) => transition.type !== 'none');
    set({ timelineProject: normalizeTimelineProject({ ...timeline, transitions }) });
    get().saveHistory();
  },

  setTimelineCurrentTime: (currentTimeMs) => {
    const timeline = get().timelineProject;
    set({
      timelineProject: {
        ...timeline,
        currentTimeMs: Math.min(Math.max(currentTimeMs, 0), timeline.durationMs),
      },
    });
  },
  setTimelineFps: (fps) => {
    set({ timelineProject: { ...get().timelineProject, fps } });
    get().saveHistory();
  },
  setTimelineZoom: (zoom) => set({
    timelineProject: {
      ...get().timelineProject,
      zoom: Math.min(Math.max(zoom, 0.25), 4),
    },
  }),
  setTimelineCollapsed: (collapsed) => {
    set({ timelineProject: { ...get().timelineProject, collapsed } });
    get().saveHistory();
  },
  setTimelineHeight: (height) => set({
    timelineProject: {
      ...get().timelineProject,
      height: Math.min(Math.max(height, 120), Math.round(window.innerHeight * 0.4)),
    },
  }),
  setTimelineLoopPreview: (loopPreview) => {
    set({ timelineProject: { ...get().timelineProject, loopPreview } });
    get().saveHistory();
  },
  setTimelinePlaybackState: (timelinePlaybackState) => set({ timelinePlaybackState }),
  setTimelinePlaybackRate: (timelinePlaybackRate) => set({
    timelinePlaybackRate: Math.min(Math.max(timelinePlaybackRate, 0.25), 4),
  }),
  setTimelineMuted: (timelineMuted) => set({ timelineMuted }),
  setTimelineAudioUnlocked: (timelineAudioUnlocked) => set({ timelineAudioUnlocked }),
  setTimelineRecording: (timelineRecording) => set({ timelineRecording }),
  setTimelineActiveVideoCount: (timelineActiveVideoCount) => set({ timelineActiveVideoCount }),
  setSelectedTimelineClipId: (selectedTimelineClipId) => set({ selectedTimelineClipId }),
  setTimelinePreviewActive: (timelinePreviewActive) => set({ timelinePreviewActive }),
  setTimelineProject: (timelineProject) => set({ timelineProject }),

  toggleSafeArea: () => set((state) => ({ showSafeArea: !state.showSafeArea })),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),

  addAudioClip: (clip) => {
    const timeline = get().timelineProject;
    const currentClips = timeline.audioClips || [];
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      audioClips: [...currentClips, clip],
    });
    set({ timelineProject: nextTimeline });
    get().saveHistory();
  },

  updateAudioClip: (clipId, updates) => {
    const timeline = get().timelineProject;
    const currentClips = timeline.audioClips || [];
    const nextClips = currentClips.map((c) => (c.id === clipId ? { ...c, ...updates } : c));
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      audioClips: nextClips,
    });
    set({ timelineProject: nextTimeline });
  },

  deleteAudioClip: (clipId) => {
    const timeline = get().timelineProject;
    const currentClips = timeline.audioClips || [];
    const nextClips = currentClips.filter((c) => c.id !== clipId);
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      audioClips: nextClips,
    });
    set({ timelineProject: nextTimeline });
    get().saveHistory();
  },

  duplicateAudioClip: (clipId) => {
    const timeline = get().timelineProject;
    const currentClips = timeline.audioClips || [];
    const target = currentClips.find((c) => c.id === clipId);
    if (!target) return;
    const copy: TimelineAudioClip = {
      ...target,
      id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${target.name} (Copy)`,
      startTimeMs: target.startTimeMs + (target.durationMs - target.trimStartMs - target.trimEndMs),
    };
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      audioClips: [...currentClips, copy],
    });
    set({ timelineProject: nextTimeline });
    get().saveHistory();
  },

  splitAudioClipAtPlayhead: (clipId) => {
    const timeline = get().timelineProject;
    const currentClips = timeline.audioClips || [];
    const target = currentClips.find((c) => c.id === clipId);
    if (!target) return;
    const playheadMs = timeline.currentTimeMs;
    const clipStartMs = target.startTimeMs;
    const effectiveDurationMs = target.durationMs - target.trimStartMs - target.trimEndMs;
    const clipEndMs = clipStartMs + effectiveDurationMs;

    if (playheadMs <= clipStartMs + 200 || playheadMs >= clipEndMs - 200) return;

    const splitOffsetMs = playheadMs - clipStartMs;
    const clip1Duration = target.trimStartMs + splitOffsetMs;
    const clip1: TimelineAudioClip = {
      ...target,
      trimEndMs: target.durationMs - clip1Duration,
    };
    const clip2: TimelineAudioClip = {
      ...target,
      id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startTimeMs: playheadMs,
      trimStartMs: clip1Duration,
    };
    const nextClips = currentClips.map((c) => (c.id === clipId ? clip1 : c)).concat(clip2);
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      audioClips: nextClips,
    });
    set({ timelineProject: nextTimeline });
    get().saveHistory();
  },

  setAudioDucking: (ducking) => {
    const timeline = get().timelineProject;
    const nextTimeline = normalizeTimelineProject({
      ...timeline,
      audioDucking: ducking,
    });
    set({ timelineProject: nextTimeline });
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
    const pages = get().syncActivePage();
    const { history, historyIndex, projectId, projectName, activePageId, timelineProject } = get();
    const json = serializeCanvas(canvas, { pages, activePageId, timelineProject });
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
          projects[idx].background_color =
            typeof canvas.backgroundColor === 'string' && canvas.backgroundColor
              ? canvas.backgroundColor
              : DEFAULT_CANVAS_BACKGROUND;
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
            background_color:
              typeof canvas.backgroundColor === 'string' && canvas.backgroundColor
                ? canvas.backgroundColor
                : DEFAULT_CANVAS_BACKGROUND,
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
          const nodeId = obj.get('architectureNodeId' as keyof fabric.Object);
          if (obj.get('teckstudioObjectType' as keyof fabric.Object) === 'architectureNode' && nodeId) {
            removeConnectorsForNode(canvas, String(nodeId));
          }
          canvas.remove(obj);
        });
        canvas.discardActiveObject();
      } else {
        const sourceId = String(selectedObject.get('id' as keyof fabric.Object) || '');
        if (sourceId) removeGeneratedTextEffectLayers(canvas, sourceId);
        const nodeId = selectedObject.get('architectureNodeId' as keyof fabric.Object);
        if (selectedObject.get('teckstudioObjectType' as keyof fabric.Object) === 'architectureNode' && nodeId) {
          removeConnectorsForNode(canvas, String(nodeId));
        }
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
      if (isPosterEditableText(selectedObject)) {
        clonedObj.set({
          posterConversionId: undefined,
          posterConversionRole: undefined,
          posterRegionId: undefined,
          posterTextBlockId: undefined,
          posterTextBlock: undefined,
          posterPatchAssetId: undefined,
          posterCleanPatchId: undefined,
          posterConverted: undefined,
          objectType: 'text',
          locked: false,
          selectable: true,
          evented: true,
          editable: true,
          lockMovementX: false,
          lockMovementY: false,
          lockScalingX: false,
          lockScalingY: false,
          lockRotation: false,
        } as Record<string, unknown>);
      }
      assignNewArchitectureNodeIdentity(clonedObj);
      
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
      canvas.setBackgroundColor(DEFAULT_CANVAS_BACKGROUND, canvas.renderAll.bind(canvas));
      set({ selectedObject: null, canvasBackgroundColor: DEFAULT_CANVAS_BACKGROUND });
      get().saveHistory();
    }
  },
  
  groupSelected: () => {
    const { canvas, selectedObject } = get();
    if (!canvas || !selectedObject) return;

    if (selectedObject.type === 'activeSelection') {
      const activeSelection = selectedObject as fabric.ActiveSelection;
      const children = activeSelection.getObjects();
      const architectureNodeIds = [...new Set(children
        .map((child) => child.get('architectureNodeId' as keyof fabric.Object))
        .filter(Boolean)
        .map(String))];
      const editorialTagIds = [...new Set(children
        .map((child) => child.get('editorialTagId' as keyof fabric.Object))
        .filter(Boolean)
        .map(String))];
      const architectureConfig = children[0]?.get('architectureNodeConfig' as keyof fabric.Object);
      const group = activeSelection.toGroup();
      if (architectureNodeIds.length === 1 && children.length >= 4) {
        const nodeId = architectureNodeIds[0];
        const config = architectureConfig && typeof architectureConfig === 'object'
          ? architectureConfig as Record<string, unknown>
          : {};
        group.set({
          id: nodeId,
          name: String(config.title || 'Architecture node'),
          objectType: 'architectureNode',
          teckstudioObjectType: 'architectureNode',
          architectureRole: 'architectureNode',
          architectureNodeId: nodeId,
          architectureNodeConfig: { ...config, nodeId },
          architectureIcon: config.icon,
          architectureAccentColor: config.accentColor,
          elementCategory: 'Technology',
          elementSubcategory: 'System Design',
          elementTags: ['architecture', 'diagram', 'node'],
          elementEditable: true,
          objectCaching: false,
          subTargetCheck: true,
          lockScalingX: true,
          lockScalingY: true,
        } as Record<string, unknown>);
        set({ selectedObject: group });
      } else if (editorialTagIds.length === 1 && children.length === 2) {
        const tagId = editorialTagIds[0];
        const textObject = children.find((child) => child.get('editorialTagRole' as keyof fabric.Object) === 'text') as fabric.IText | undefined;
        const active = textObject?.get('tagActive' as keyof fabric.Object) === true;
        group.set({
          id: tagId,
          name: `Tag — ${textObject?.text || 'Label'}`,
          objectType: 'editorial-tag',
          teckstudioObjectType: 'editorialTag',
          editorialRole: 'tag',
          editorialTagId: tagId,
          tagPaddingX: textObject?.get('tagPaddingX' as keyof fabric.Object),
          tagPaddingY: textObject?.get('tagPaddingY' as keyof fabric.Object),
          tagManualWidth: textObject?.get('tagManualWidth' as keyof fabric.Object) === true,
          tagActive: active,
          elementCategory: 'Technology',
          elementSubcategory: 'Developer labels',
          elementTags: ['editorial', 'tag', active ? 'active' : 'inactive'],
          elementEditable: true,
          objectCaching: false,
          subTargetCheck: true,
        } as Record<string, unknown>);
        set({ selectedObject: group });
      }
      canvas.requestRenderAll();
      get().saveHistory();
    }
  },
  
  ungroupSelected: () => {
    const { canvas, selectedObject } = get();
    if (!canvas || !selectedObject) return;

    if (selectedObject.type === 'group') {
      const group = selectedObject as fabric.Group;
      if (group.get('teckstudioObjectType' as keyof fabric.Object) === 'architectureNode') {
        const nodeId = group.get('architectureNodeId' as keyof fabric.Object);
        const config = group.get('architectureNodeConfig' as keyof fabric.Object);
        group.getObjects().forEach((child) => child.set({
          architectureNodeId: nodeId,
          architectureNodeConfig: config,
        } as Record<string, unknown>));
      }
      group.toActiveSelection();
      canvas.requestRenderAll();
      get().saveHistory();
    }
  }
}));
