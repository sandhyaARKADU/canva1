import { create } from 'zustand';
import { fabric } from 'fabric';
import { apiFetch, getAuthToken } from '../services/apiClient';


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
  textAlign: string; // 'left' | 'center' | 'right'
  opacity: number;
  projectId: string | null;
  projectName: string;
  projectCreatedAt: string;
  projectUpdatedAt: string;
  editorMode: 'design' | 'dev';
  isPenMode: boolean;
  rulersEnabled: boolean;
  showGuides: boolean;
  
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
  setFontWeight: (weight: string) => void;
  setFontStyle: (style: string) => void;
  setUnderline: (underline: boolean) => void;
  setTextAlign: (align: string) => void;
  setOpacity: (opacity: number) => void;
  setProjectId: (projectId: string) => void;
  setProjectName: (name: string) => void;
  saveProjectMeta: () => void;
  loadProject: (projectId: string) => void;
  setEditorMode: (mode: 'design' | 'dev') => void;
  setPenMode: (active: boolean) => void;
  setRulersEnabled: (enabled: boolean) => void;
  setShowGuides: (show: boolean) => void;
  updateObjectName: (objId: string, name: string) => void;
  
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
  opacity: 1,
  projectId: null,
  projectName: '',
  projectCreatedAt: '',
  projectUpdatedAt: '',
  editorMode: 'design',
  isPenMode: false,
  rulersEnabled: true,
  showGuides: true,
  
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
      set({ selectedObject: null });
      return;
    }
    
    // Sync object properties to store state
    set({
      selectedObject,
      fillColor: (selectedObject.get('fill') as string) || '#8b5cf6',
      strokeColor: (selectedObject.get('stroke') as string) || '#000000',
      strokeWidth: selectedObject.get('strokeWidth') || 0,
      opacity: selectedObject.get('opacity') || 1,
      // Text properties (if it's a text object)
      fontFamily: (selectedObject as any).get('fontFamily') || 'Outfit',
      fontSize: (selectedObject as any).get('fontSize') || 40,
      fontWeight: (selectedObject as any).get('fontWeight') || 'normal',
      fontStyle: (selectedObject as any).get('fontStyle') || 'normal',
      underline: (selectedObject as any).get('underline') || false,
      textAlign: (selectedObject as any).get('textAlign') || 'left',
    });
  },
  
  setZoom: (zoom) => {
    const canvas = get().canvas;
    if (canvas) {
      // Limit zoom between 10% and 500%
      const boundedZoom = Math.min(Math.max(zoom, 0.1), 5.0);
      set({ zoom: boundedZoom });
      
      const center = canvas.getVpCenter();
      canvas.zoomToPoint({ x: center.x, y: center.y } as fabric.Point, boundedZoom);
      canvas.renderAll();
    }
  },
  
  setFillColor: (color) => {
    set({ fillColor: color });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject) {
      selectedObject.set('fill', color);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  setStrokeColor: (color) => {
    set({ strokeColor: color });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject) {
      selectedObject.set('stroke', color);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  setStrokeWidth: (width) => {
    set({ strokeWidth: width });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject) {
      selectedObject.set('strokeWidth', width);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  setFontFamily: (family) => {
    set({ fontFamily: family });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      (selectedObject as any).set('fontFamily', family);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  setFontSize: (size) => {
    set({ fontSize: size });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      (selectedObject as any).set('fontSize', size);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  setFontWeight: (weight) => {
    set({ fontWeight: weight });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      (selectedObject as any).set('fontWeight', weight);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  setFontStyle: (style) => {
    set({ fontStyle: style });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      (selectedObject as any).set('fontStyle', style);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  setUnderline: (underline) => {
    set({ underline });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      (selectedObject as any).set('underline', underline);
      canvas.renderAll();
      get().saveHistory();
    }
  },
  
  setTextAlign: (align) => {
    set({ textAlign: align });
    const { canvas, selectedObject } = get();
    if (canvas && selectedObject && (selectedObject.type === 'text' || selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      (selectedObject as any).set('textAlign', align);
      canvas.renderAll();
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

    // Always set project metadata first
    set({ projectId });

    // Handle localStorage projects
    if (projectId.startsWith('local_')) {
      const raw = localStorage.getItem('teckstudio_local_projects');
      const projects = raw ? JSON.parse(raw) : [];
      const project = projects.find((p: any) => p.id === projectId);
      console.log('[TECKSTUDIO] localStorage project found:', project ? 'yes' : 'no');
      if (project) {
        set({
          projectName: project.name,
          projectCreatedAt: project.createdAt,
          projectUpdatedAt: project.updatedAt,
        });
        const canvas = get().canvas;
        if (canvas && project.data) {
          const dataDimensions = getCanvasDimensionsFromProjectData(project.data);
          const width = dataDimensions?.width || project.width;
          const height = dataDimensions?.height || project.height;
          if (width && height) {
            canvas.setDimensions({ width, height });
          }
          canvas.loadFromJSON(project.data, () => {
            canvas.renderAll();
            set({ history: [project.data], historyIndex: 0 });
          });
        } else if (canvas) {
          canvas.setBackgroundColor('#ffffff', () => canvas.renderAll());
        }
      }
      return;
    }

    // Try backend
    const token = getAuthToken();
    if (!token) {
      // No valid token - just show empty canvas
      const canvas = get().canvas;
      if (canvas) {
        canvas.setBackgroundColor('#ffffff', () => canvas.renderAll());
      }
      return;
    }

    try {
      const response = await apiFetch(`/api/projects/${projectId}`);

      if (!response.ok) {
        // Token expired or project not found - show empty canvas
        const canvas = get().canvas;
        if (canvas) {
          canvas.setBackgroundColor('#ffffff', () => canvas.renderAll());
        }
        return;
      }

      const data = await response.json();
      const project = data.project || data;
      if (!project?.id) {
        throw new Error('Backend returned an invalid project payload');
      }
      set({
        projectName: project.name,
        projectCreatedAt: project.createdAt,
        projectUpdatedAt: project.updatedAt,
      });

      const canvas = get().canvas;
      if (!canvas) return;

      if (project.data) {
        const dataDimensions = getCanvasDimensionsFromProjectData(project.data);
        const width = dataDimensions?.width || project.width;
        const height = dataDimensions?.height || project.height;
        if (width && height) {
          canvas.setDimensions({ width, height });
        }
        canvas.loadFromJSON(project.data, () => {
          canvas.renderAll();
          set({ history: [project.data], historyIndex: 0 });
        });
      } else {
        canvas.setBackgroundColor('#ffffff', () => canvas.renderAll());
      }
    } catch {
      // Backend not available - show empty canvas
      const canvas = get().canvas;
      if (canvas) {
        canvas.setBackgroundColor('#ffffff', () => canvas.renderAll());
      }
    }
  },
  
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

    const json = JSON.stringify(canvas.toJSON([
      'id',
      'name',
      'selectable',
      'hasControls',
      'lockMovementX',
      'lockMovementY',
      'lockScalingX',
      'lockScalingY',
      'lockRotation',
      'teckstudioObjectType',
      'posterRole',
      'posterField',
      'posterCardIndex',
      'posterSpec',
      'posterSpecTheme',
      'posterSpecCanvasWidth',
      'posterSpecCanvasHeight',
    ]));
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
    
    canvas.off('object:modified');
    
    canvas.loadFromJSON(state, () => {
      canvas.renderAll();
      set({ historyIndex: prevIndex, selectedObject: null });
      
      // Update draft state in localStorage
      localStorage.setItem('teckstudio_project_draft', state);
      
      canvas.on('object:modified', () => get().saveHistory());
    });
  },
  
  redo: () => {
    const { canvas, history, historyIndex } = get();
    if (!canvas || historyIndex >= history.length - 1) return;
    
    const nextIndex = historyIndex + 1;
    const state = history[nextIndex];
    
    canvas.off('object:modified');
    
    canvas.loadFromJSON(state, () => {
      canvas.renderAll();
      set({ historyIndex: nextIndex, selectedObject: null });
      
      // Update draft state in localStorage
      localStorage.setItem('teckstudio_project_draft', state);
      
      canvas.on('object:modified', () => get().saveHistory());
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
          canvas.remove(obj);
        });
        canvas.discardActiveObject();
      } else {
        canvas.remove(selectedObject);
      }
      canvas.renderAll();
      set({ selectedObject: null });
      get().saveHistory();
    }
  },
  
  duplicateSelected: () => {
    const { canvas, selectedObject } = get();
    if (!canvas || !selectedObject) return;
    
    selectedObject.clone((clonedObj: fabric.Object) => {
      canvas.discardActiveObject();
      clonedObj.set({
        left: (clonedObj.left || 0) + 15,
        top: (clonedObj.top || 0) + 15,
        evented: true,
      });
      
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
      
      canvas.requestRenderAll();
      set({ selectedObject: clonedObj });
      get().saveHistory();
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
