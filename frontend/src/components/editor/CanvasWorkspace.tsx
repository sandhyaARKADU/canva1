import React, { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/useEditorStore';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../config/design';
import { useSmartGuides } from '../../hooks/useSmartGuides';
import { useDistanceMeasurement } from '../../hooks/useDistanceMeasurement';
import { usePenTool } from '../../hooks/usePenTool';
import { useLassoSelection } from '../../hooks/useLassoSelection';
import {
  addObjectToCanvas,
  createElementObjectFromPayload,
  createFrameClipPathForObject,
  getFrameClipBoundsForObject,
  isFrameElementObject,
} from '../../utils/editorElementFactory';
import { enterInlineTextEditing, isEditableTextObject } from '../../utils/textSelectionStyles';
import { addStickerToCanvas } from '../../utils/stickerCanvas';
import type { StickerItem } from '../../types/editorFeatures';
import { installTextEffectSynchronization } from '../../utils/textEffects';
import type { EditorElement, ElementMetadata } from '../../types/elements';
import { PageSelectionOverlay } from './PageSelectionOverlay';
import {
  enterEditorialTagEditing,
  regroupEditorialTag,
  resizeEditorialTagText,
} from '../../utils/editorialPoster';
import {
  enterArchitectureCardEditing,
  regroupArchitectureNode,
} from '../../utils/architectureDiagram';
import {
  createDiagramConnector,
  getDiagramAnchorSelection,
  removeDiagramBendHandles,
  removeDiagramAnchors,
  showDiagramBendHandle,
  showDiagramAnchors,
  updateConnectorBendFromHandle,
  updateAllDiagramConnectors,
  updateAttachedConnectors,
} from '../../utils/diagramConnectors';
import type {
  DiagramAnchorSelection,
} from '../../utils/diagramConnectors';
import type { DiagramConnectorConfig } from '../../utils/architectureDiagramTypes';
import { installConnectorAnimationManager } from '../../utils/connectorAnimationManager';
import type { UploadedImageAsset } from '../../types/uploads';
import { uploadImageAsset } from '../../services/uploadsApi';
import { addUploadedImageToCanvas } from '../../utils/uploadedImageCanvas';
import { isRoundedHighlightText, synchronizeRoundedHighlightText } from '../../utils/roundedHighlightText';
import { insertDynamicMediaAsset } from '../../utils/canvasVideo';
import { masterTimelineManager } from '../../utils/masterTimelineManager';
import type { DynamicMediaAssetPayload } from '../../types/timeline';
import { PosterSceneRenderer } from '../../utils/sceneTimelineRenderer';
import {
  convertPosterRegionToText,
  enterPosterTextEditing,
  isPosterEditableText,
  normalizePosterEditableTextTransform,
  syncPosterEditableTextMetadata,
} from '../../utils/posterConversionCanvas';

export const CanvasWorkspace: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const previewInteractionRef = useRef(new Map<fabric.Object, {
    selectable: boolean;
    evented: boolean;
    hasControls: boolean;
  }>());
  const connectorModeRef = useRef(false);
  const connectorStartRef = useRef<DiagramAnchorSelection | null>(null);
  const connectorConfigRef = useRef<Partial<DiagramConnectorConfig>>({});
  const textHistoryTimerRef = useRef<number | null>(null);
  const { canvas, setCanvas, setSelectedObject, saveHistory, editorMode, projectId, isProjectLoading, projectLoadError, loadProject, clearProjectLoadError, canvasWidth, canvasHeight, timelinePreviewActive, zoom, showSafeArea, safeAreaMargin, showGrid } = useEditorStore();

  useSmartGuides(fabricRef.current);
  useDistanceMeasurement(fabricRef.current);
  usePenTool(fabricRef.current);
  useLassoSelection(fabricRef.current);

  useEffect(() => {
    if (!canvasRef.current || fabricRef.current) return;

    fabric.Object.prototype.borderColor = '#8b5cf6';
    fabric.Object.prototype.cornerColor = '#ffffff';
    fabric.Object.prototype.cornerStrokeColor = '#8b5cf6';
    fabric.Object.prototype.cornerStyle = 'circle';
    fabric.Object.prototype.cornerSize = 10;
    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.borderScaleFactor = 2;
    fabric.Object.prototype.padding = 6;

    const assignObjectId = (obj: fabric.Object) => {
      if (obj.get('id' as any)) return;
      const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `obj_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      obj.set({ id } as any);
    };

    const fc = new fabric.Canvas(canvasRef.current, {
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      backgroundColor: '#000000',
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      imageSmoothingEnabled: true,
    });

    console.log('[TECKSTUDIO] Canvas created:', { width: fc.getWidth(), height: fc.getHeight(), backgroundColor: fc.backgroundColor });

    fabricRef.current = fc;
    (canvasRef.current as any).__fabric = fc;
    ((fc as any).lowerCanvasEl as HTMLCanvasElement | undefined)?.setAttribute('data-fabric-canvas', 'lower');
    ((fc as any).upperCanvasEl as HTMLCanvasElement | undefined)?.setAttribute('data-fabric-canvas', 'upper');
    if ((fc as any).lowerCanvasEl) ((fc as any).lowerCanvasEl as any).__fabric = fc;
    if ((fc as any).upperCanvasEl) ((fc as any).upperCanvasEl as any).__fabric = fc;
    const removeTextEffectSynchronization = installTextEffectSynchronization(fc);
    const removeConnectorAnimationManager = installConnectorAnimationManager(fc);
    masterTimelineManager.attachCanvas(fc);
    if (previewCanvasRef.current) {
      masterTimelineManager.attachSceneRenderer(new PosterSceneRenderer(
        previewCanvasRef.current,
        () => {
          const state = useEditorStore.getState();
          return {
            pages: state.pages,
            timeline: state.timelineProject,
            width: fc.getWidth(),
            height: fc.getHeight(),
          };
        },
      ));
    }
    setCanvas(fc);

    // Sync canvas dimensions with store
    useEditorStore.getState().setCanvasDimensions(fc.getWidth(), fc.getHeight());

    // Fit-to-view helper: applies viewport transform to center and scale the canvas
    const fitCanvasToView = () => {
      const containerEl = containerRef.current;
      if (!containerEl) return;

      const containerWidth = containerEl.clientWidth;
      const containerHeight = containerEl.clientHeight;
      const store = useEditorStore.getState();
      const canvasW = store.canvasWidth || fc.getWidth() || 800;
      const canvasH = store.canvasHeight || fc.getHeight() || 800;

      // Calculate ideal zoom with padding
      const padding = 80;
      const scaleX = (containerWidth - padding) / canvasW;
      const scaleY = (containerHeight - padding) / canvasH;
      const idealZoom = Math.min(scaleX, scaleY, 1.0);

      // Calculate centering offset
      const scaledWidth = canvasW * idealZoom;
      const scaledHeight = canvasH * idealZoom;
      const offsetX = (containerWidth - scaledWidth) / 2;
      const offsetY = (containerHeight - scaledHeight) / 2;

      // Apply viewport transform
      fc.setViewportTransform([idealZoom, 0, 0, idealZoom, offsetX, offsetY]);
      store.setZoom(idealZoom);
      fc.renderAll();
      console.log('[TECKSTUDIO] fitCanvasToView:', { containerWidth, containerHeight, canvasW, canvasH, idealZoom, offsetX, offsetY });
    };

    // Initial fit-to-view after a short delay for layout to settle
    const initialFitTimer = window.setTimeout(fitCanvasToView, 500);

    const getArchitectureNodes = () => fc.getObjects().filter((object) => (
      object.get('teckstudioObjectType' as keyof fabric.Object) === 'architectureNode'
    ));

    const showSelectedNodeAnchors = (object?: fabric.Object | null) => {
      if (connectorModeRef.current) {
        removeDiagramBendHandles(fc);
        showDiagramAnchors(fc, getArchitectureNodes(), connectorStartRef.current);
        return;
      }
      const objectType = object?.get('teckstudioObjectType' as keyof fabric.Object);
      if (object && objectType === 'architectureNode') {
        removeDiagramBendHandles(fc);
        showDiagramAnchors(fc, [object]);
      } else if (object && objectType === 'diagramConnectorPath') {
        removeDiagramAnchors(fc);
        showDiagramBendHandle(fc, object);
      } else if (objectType === 'diagramBendHandle') {
        removeDiagramAnchors(fc);
      } else {
        removeDiagramAnchors(fc);
        removeDiagramBendHandles(fc);
      }
    };

    const openTextPropertiesPanel = (object: fabric.Object | null | undefined) => {
      const objectType = object?.get('objectType' as keyof fabric.Object);
      const teckstudioObjectType = object?.get('teckstudioObjectType' as keyof fabric.Object);
      const category = object?.get('elementCategory' as keyof fabric.Object);
      if (
        teckstudioObjectType === 'diagramArrow'
        || teckstudioObjectType === 'diagramConnectorPath'
        || category === 'Technical / Infographic'
      ) {
        window.dispatchEvent(new CustomEvent('teckstudio:open-panel', { detail: { panel: 'properties' } }));
        return;
      }
      if (
        objectType !== 'editable-import-text'
        && !isRoundedHighlightText(object)
      ) return;
      window.dispatchEvent(new CustomEvent('teckstudio:open-panel', { detail: { panel: 'text-styles' } }));
    };

    const isPosterHotspot = (object: fabric.Object | null | undefined) => (
      object?.get('posterConversionRole' as keyof fabric.Object) === 'ocr-hotspot'
    );

    const setPosterHotspotOutline = (object: fabric.Object | null | undefined, visible: boolean) => {
      if (!isPosterHotspot(object)) return;
      object?.set({
        stroke: visible ? 'rgba(139,92,246,0.9)' : 'rgba(139,92,246,0)',
      });
    };

    const clearPosterHotspotOutlines = (except?: fabric.Object | null) => {
      fc.getObjects().forEach((object) => {
        if (object !== except) setPosterHotspotOutline(object, false);
      });
    };

    const syncSelection = (e: fabric.IEvent) => {
      const selected = e.selected && e.selected.length > 0 ? e.selected[0] : null;
      clearPosterHotspotOutlines(selected);
      setPosterHotspotOutline(selected, true);
      setSelectedObject(selected);
      showSelectedNodeAnchors(selected);
      openTextPropertiesPanel(selected);
      fc.requestRenderAll();
      if (import.meta.env.DEV && selected) {
        console.debug('[TECKSTUDIO] Selected object', {
          type: selected.type,
          id: selected.get('id' as keyof fabric.Object),
          name: selected.get('name' as keyof fabric.Object),
          selectable: selected.selectable,
          evented: selected.evented,
          editable: selected.get('editable' as keyof fabric.Object),
          lockMovementX: selected.lockMovementX,
          lockMovementY: selected.lockMovementY,
          lockScalingX: selected.lockScalingX,
          lockScalingY: selected.lockScalingY,
          lockRotation: selected.lockRotation,
          hasControls: selected.hasControls,
          isEditing: isEditableTextObject(selected) ? selected.isEditing : false,
          parent: selected.group?.type || null,
          visible: selected.visible,
          opacity: selected.opacity,
          excludeFromExport: selected.get('excludeFromExport' as keyof fabric.Object),
        });
      }
    };

    const handleSelectionCleared = () => {
      clearPosterHotspotOutlines();
      setSelectedObject(null);
      if (!connectorModeRef.current) {
        removeDiagramAnchors(fc);
        removeDiagramBendHandles(fc);
      }
    };

    const handlePosterHotspotOver = (event: fabric.IEvent) => {
      setPosterHotspotOutline(event.target, true);
      fc.requestRenderAll();
    };

    const handlePosterHotspotOut = (event: fabric.IEvent) => {
      if (event.target !== fc.getActiveObject()) setPosterHotspotOutline(event.target, false);
      fc.requestRenderAll();
    };

    const stopConnectorMode = () => {
      connectorModeRef.current = false;
      connectorStartRef.current = null;
      connectorConfigRef.current = {};
      removeDiagramAnchors(fc);
      removeDiagramBendHandles(fc);
      showSelectedNodeAnchors(fc.getActiveObject());
    };

    const startConnectorMode = (event: Event) => {
      const detail = (event as CustomEvent<{ config?: Partial<DiagramConnectorConfig> }>).detail;
      connectorModeRef.current = true;
      connectorStartRef.current = null;
      connectorConfigRef.current = detail?.config || {};
      removeDiagramBendHandles(fc);
      showDiagramAnchors(fc, getArchitectureNodes());
    };

    const handleConnectorAnchorClick = (event: fabric.IEvent) => {
      const anchor = getDiagramAnchorSelection(event.target);
      if (!anchor) return;
      if (!connectorModeRef.current) {
        connectorModeRef.current = true;
        connectorConfigRef.current = {};
      }
      if (!connectorStartRef.current) {
        connectorStartRef.current = anchor;
        showDiagramAnchors(fc, getArchitectureNodes(), anchor);
        return;
      }
      const source = connectorStartRef.current;
      if (source.nodeId === anchor.nodeId) {
        connectorStartRef.current = anchor;
        showDiagramAnchors(fc, getArchitectureNodes(), anchor);
        return;
      }
      const config = connectorConfigRef.current;
      removeDiagramAnchors(fc);
      const objects = createDiagramConnector(fc, {
        sourceNodeId: source.nodeId,
        targetNodeId: anchor.nodeId,
        sourceAnchor: source.anchor,
        targetAnchor: anchor.anchor,
        routing: config.routing || 'elbow',
        style: config.style || 'solid',
        color: config.color || '#43D68A',
        width: config.width || 2,
        opacity: config.opacity ?? 0.9,
        dashLength: config.dashLength || 10,
        dashGap: config.dashGap || 8,
        startArrow: config.startArrow || 'none',
        endArrow: config.endArrow || 'arrow',
        arrowSize: config.arrowSize || 13,
        bendOffset: config.bendOffset || 0,
        curvature: config.curvature || 0.45,
        label: config.label || '',
        labelColor: config.labelColor || String(config.color || '#43D68A'),
        labelBackground: config.labelBackground || 'rgba(7, 10, 15, 0.88)',
        labelPosition: config.labelPosition || 0.5,
        labelOffset: config.labelOffset ?? -16,
        labelFontSize: config.labelFontSize || 11,
        labelVisible: config.labelVisible !== false,
        glow: Boolean(config.glow),
        glowBlur: config.glowBlur || 8,
        animation: config.animation,
      });
      const firstCardIndex = fc.getObjects().findIndex((object) => (
        object.get('teckstudioObjectType' as keyof fabric.Object) === 'architectureNode'
      ));
      objects.forEach((object, index) => fc.moveTo(object, Math.max(0, firstCardIndex) + index));
      connectorModeRef.current = false;
      connectorStartRef.current = null;
      connectorConfigRef.current = {};
      if (objects[0]) {
        fc.setActiveObject(objects[0]);
        setSelectedObject(objects[0]);
      }
      fc.requestRenderAll();
      saveHistory();
      window.dispatchEvent(new CustomEvent('teckstudio:connector-created'));
    };

    const syncActiveTextObject = () => {
      const activeObject = fc.getActiveObject();
      setSelectedObject(activeObject || null);
      if (activeObject && isEditableTextObject(activeObject)) {
        useEditorStore.getState().captureTextSelection();
        openTextPropertiesPanel(activeObject);
      }
    };

    const handleTextChanged = (event: fabric.IEvent) => {
      const architectureRole = event.target?.get('architectureRole' as keyof fabric.Object);
      if (architectureRole === 'architecture-card-title' || architectureRole === 'architecture-card-subtitle') {
        return;
      }
      if (event.target && resizeEditorialTagText(fc, event.target)) return;
      if (event.target) synchronizeRoundedHighlightText(event.target);
      if (syncPosterEditableTextMetadata(event.target)) {
        setSelectedObject(event.target || null);
      }
      if (textHistoryTimerRef.current) window.clearTimeout(textHistoryTimerRef.current);
      textHistoryTimerRef.current = window.setTimeout(() => {
        textHistoryTimerRef.current = null;
        saveHistory();
      }, 450);
    };

    const handleDoubleClick = (event: fabric.IEvent) => {
      if (!event.target) return;
      if (isPosterHotspot(event.target)) {
        if (event.target.get('posterConversionPending' as keyof fabric.Object) === true) return;
        const hotspot = event.target;
        hotspot.set({ posterConversionPending: true, evented: false } as Record<string, unknown>);
        fc.requestRenderAll();
        void convertPosterRegionToText(fc, hotspot)
          .then((result) => {
            saveHistory();
            enterPosterTextEditing(fc, result.text, { selectAll: true });
            setSelectedObject(result.text);
          })
          .catch((error) => {
            hotspot.set({ posterConversionPending: false, evented: true } as Record<string, unknown>);
            fc.setActiveObject(hotspot);
            setSelectedObject(hotspot);
            fc.requestRenderAll();
            console.error('[TECKSTUDIO] Unable to convert OCR text region:', error);
          });
        return;
      }
      if (isEditableTextObject(event.target)) {
        const entered = isPosterEditableText(event.target)
          ? enterPosterTextEditing(fc, event.target, { pointerEvent: event.e })
          : enterInlineTextEditing(fc, event.target, { pointerEvent: event.e });
        if (entered) {
          setSelectedObject(event.target);
          openTextPropertiesPanel(event.target);
          return;
        }
      }
      const subTargets = (event as fabric.IEvent & { subTargets?: fabric.Object[] }).subTargets || [];
      const architectureEditing = enterArchitectureCardEditing(fc, event.target, subTargets);
      const tagEditing = !architectureEditing && enterEditorialTagEditing(fc, event.target);
      if (!architectureEditing && !tagEditing) return;
      setSelectedObject(fc.getActiveObject() || null);
      if (architectureEditing) saveHistory();
    };

    const handleTextEditingExited = (event: fabric.IEvent) => {
      if (textHistoryTimerRef.current) {
        window.clearTimeout(textHistoryTimerRef.current);
        textHistoryTimerRef.current = null;
        saveHistory();
      }
      useEditorStore.setState({ textSelectionRange: null });
      syncActiveTextObject();
      const target = event.target;
      const editorialTagId = target?.get('editorialTagId' as keyof fabric.Object);
      if (editorialTagId && target?.get('editorialTagRole' as keyof fabric.Object) === 'text') {
        resizeEditorialTagText(fc, target);
        window.setTimeout(() => {
          const group = regroupEditorialTag(fc, String(editorialTagId));
          if (group) {
            setSelectedObject(group);
            saveHistory();
          }
        }, 0);
        return;
      }
      const role = target?.get('architectureRole' as keyof fabric.Object);
      const nodeId = target?.get('architectureNodeId' as keyof fabric.Object);
      if (
        !nodeId ||
        (role !== 'architecture-card-title' && role !== 'architecture-card-subtitle')
      ) return;
      window.setTimeout(() => {
        const group = regroupArchitectureNode(fc, String(nodeId));
        if (group) {
          setSelectedObject(group);
          saveHistory();
        }
      }, 0);
    };

    const handleDiagramNodeTransform = (event: fabric.IEvent) => {
      if (!event.target) return;
      if (event.target.get('teckstudioObjectType' as keyof fabric.Object) === 'diagramBendHandle') {
        updateConnectorBendFromHandle(fc, event.target);
        return;
      }
      updateAttachedConnectors(fc, event.target);
    };

    const handleObjectModified = (event: fabric.IEvent) => {
      if (event.target?.get('teckstudioObjectType' as keyof fabric.Object) === 'diagramBendHandle') {
        const path = updateConnectorBendFromHandle(fc, event.target);
        if (path) {
          fc.setActiveObject(path);
          setSelectedObject(path);
          showSelectedNodeAnchors(path);
        }
        saveHistory();
        return;
      }
      if (event.target && normalizePosterEditableTextTransform(event.target)) {
        setSelectedObject(event.target);
      }
      if (event.target) updateAttachedConnectors(fc, event.target);
      if (connectorModeRef.current) {
        showDiagramAnchors(fc, getArchitectureNodes(), connectorStartRef.current);
      } else {
        showSelectedNodeAnchors(event.target);
      }
      saveHistory();
    };

    const handleObjectAdded = (event: fabric.IEvent) => {
      if (event.target) assignObjectId(event.target);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && connectorModeRef.current) {
        event.preventDefault();
        stopConnectorMode();
        return;
      }
      const activeObject = fc.getActiveObject();
      if (!isEditableTextObject(activeObject)) return;

      const isMod = event.metaKey || event.ctrlKey;
      if (event.key === 'Escape' && activeObject.isEditing) {
        event.preventDefault();
        activeObject.exitEditing?.();
        fc.requestRenderAll();
        return;
      }

      if (!isMod) return;
      const store = useEditorStore.getState();
      store.captureTextSelection();

      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        store.setFontWeight(store.fontWeight === 'bold' || store.fontWeight === '700' ? 'normal' : 'bold');
      } else if (event.key.toLowerCase() === 'i') {
        event.preventDefault();
        store.setFontStyle(store.fontStyle === 'italic' ? 'normal' : 'italic');
      } else if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        store.setUnderline(!store.underline);
      } else if (event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('teckstudio:open-text-color'));
      }
    };

    fc.on('selection:created', syncSelection);
    fc.on('selection:updated', syncSelection);
    fc.on('selection:cleared', handleSelectionCleared);
    fc.on('object:moving', handleDiagramNodeTransform);
    fc.on('object:scaling', handleDiagramNodeTransform);
    fc.on('object:modified', handleObjectModified);
    fc.on('object:added', handleObjectAdded);
    fc.on('text:selection:changed', syncActiveTextObject);
    fc.on('text:editing:entered', syncActiveTextObject);
    fc.on('text:editing:exited', handleTextEditingExited);
    fc.on('text:changed', handleTextChanged);
    fc.on('mouse:dblclick', handleDoubleClick);
    fc.on('mouse:down', handleConnectorAnchorClick);
    fc.on('mouse:over', handlePosterHotspotOver);
    fc.on('mouse:out', handlePosterHotspotOut);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('teckstudio:start-connector-mode', startConnectorMode);
    const handleDynamicMediaAsset = (event: Event) => {
      const payload = (event as CustomEvent<DynamicMediaAssetPayload>).detail;
      if (!payload?.type) return;
      void insertDynamicMediaAsset(fc, payload).then((object) => {
        setSelectedObject(object);
        return useEditorStore.getState().saveHistory();
      }).catch((error) => {
        console.error('[TECKSTUDIO] Unable to insert dynamic media payload:', error);
      });
    };
    window.addEventListener('teckstudio:insert-dynamic-asset', handleDynamicMediaAsset);

    // Re-fit canvas on window resize
    const handleResize = () => {
      const containerEl = containerRef.current;
      if (!containerEl) return;

      const containerWidth = containerEl.clientWidth;
      const containerHeight = containerEl.clientHeight;
      const store = useEditorStore.getState();
      const canvasW = store.canvasWidth || fc.getWidth() || 800;
      const canvasH = store.canvasHeight || fc.getHeight() || 800;

      const padding = 80;
      const scaleX = (containerWidth - padding) / canvasW;
      const scaleY = (containerHeight - padding) / canvasH;
      const idealZoom = Math.min(scaleX, scaleY, 1.0);

      const scaledWidth = canvasW * idealZoom;
      const scaledHeight = canvasH * idealZoom;
      const offsetX = (containerWidth - scaledWidth) / 2;
      const offsetY = (containerHeight - scaledHeight) / 2;

      fc.setViewportTransform([idealZoom, 0, 0, idealZoom, offsetX, offsetY]);
      store.setZoom(idealZoom);
      fc.renderAll();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.clearTimeout(initialFitTimer);
      if (textHistoryTimerRef.current) window.clearTimeout(textHistoryTimerRef.current);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('teckstudio:start-connector-mode', startConnectorMode);
      window.removeEventListener('teckstudio:insert-dynamic-asset', handleDynamicMediaAsset);
      fc.off('selection:created', syncSelection);
      fc.off('selection:updated', syncSelection);
      fc.off('selection:cleared', handleSelectionCleared);
      fc.off('object:moving', handleDiagramNodeTransform);
      fc.off('object:scaling', handleDiagramNodeTransform);
      fc.off('object:modified', handleObjectModified);
      fc.off('object:added', handleObjectAdded);
      fc.off('text:selection:changed', syncActiveTextObject);
      fc.off('text:editing:entered', syncActiveTextObject);
      fc.off('text:editing:exited', handleTextEditingExited);
      fc.off('text:changed', handleTextChanged);
      fc.off('mouse:dblclick', handleDoubleClick);
      fc.off('mouse:down', handleConnectorAnchorClick);
      fc.off('mouse:over', handlePosterHotspotOver);
      fc.off('mouse:out', handlePosterHotspotOut);
      removeDiagramAnchors(fc);
      removeDiagramBendHandles(fc);
      removeConnectorAnimationManager();
      removeTextEffectSynchronization();
      masterTimelineManager.detachCanvas();
      fc.dispose();
      fabricRef.current = null;
      setCanvas(null);
      setSelectedObject(null);
    };
  }, []);

  // Re-fit canvas when project load completes or dimensions change
  useEffect(() => {
    if (!fabricRef.current || isProjectLoading) return;

    console.log('[TECKSTUDIO] Re-fit triggered:', { isProjectLoading, canvasWidth, canvasHeight });

    // Small delay to ensure layout is settled after project load
    const timer = setTimeout(() => {
      const containerEl = containerRef.current;
      if (!containerEl || !fabricRef.current) return;

      const containerWidth = containerEl.clientWidth;
      const containerHeight = containerEl.clientHeight;
      const store = useEditorStore.getState();
      const canvasW = store.canvasWidth || fabricRef.current.getWidth() || 800;
      const canvasH = store.canvasHeight || fabricRef.current.getHeight() || 800;

      console.log('[TECKSTUDIO] Re-fit executing:', { containerWidth, containerHeight, canvasW, canvasH });

      const padding = 80;
      const scaleX = (containerWidth - padding) / canvasW;
      const scaleY = (containerHeight - padding) / canvasH;
      const idealZoom = Math.min(scaleX, scaleY, 1.0);

      const scaledWidth = canvasW * idealZoom;
      const scaledHeight = canvasH * idealZoom;
      const offsetX = (containerWidth - scaledWidth) / 2;
      const offsetY = (containerHeight - scaledHeight) / 2;

      console.log('[TECKSTUDIO] Re-fit applying:', { idealZoom, offsetX, offsetY });

      fabricRef.current.setViewportTransform([idealZoom, 0, 0, idealZoom, offsetX, offsetY]);
      store.setZoom(idealZoom);
      updateAllDiagramConnectors(fabricRef.current);
      fabricRef.current.renderAll();
    }, 500);

    return () => clearTimeout(timer);
  }, [isProjectLoading, canvasWidth, canvasHeight]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (timelinePreviewActive) {
      previewInteractionRef.current.clear();
      canvas.discardActiveObject();
      canvas.selection = false;
      canvas.skipTargetFind = true;
      canvas.getObjects().forEach((object) => {
        previewInteractionRef.current.set(object, {
          selectable: object.selectable !== false,
          evented: object.evented !== false,
          hasControls: object.hasControls !== false,
        });
        object.set({ selectable: false, evented: false, hasControls: false });
      });
    } else {
      canvas.selection = true;
      canvas.skipTargetFind = false;
      previewInteractionRef.current.forEach((values, object) => {
        if (canvas.contains(object)) object.set(values);
      });
      previewInteractionRef.current.clear();
    }
    canvas.requestRenderAll();
  }, [timelinePreviewActive]);

  useEffect(() => {
    if (!fabricRef.current) return;
    fabricRef.current.getObjects().forEach((obj) => {
      obj.set({
        lockMovementX: editorMode === 'dev',
        lockMovementY: editorMode === 'dev',
        lockScalingX: editorMode === 'dev',
        lockScalingY: editorMode === 'dev',
        lockRotation: editorMode === 'dev',
        hasControls: editorMode !== 'dev',
      });
    });
    fabricRef.current.discardActiveObject();
    fabricRef.current.renderAll();
  }, [editorMode]);

  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;

    const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const fc = fabricRef.current;
      if (!fc) return;
      const ptr = fc.getPointer(e as any);
      const dynamicAssetPayloadRaw = e.dataTransfer?.getData('application/x-teckstudio-dynamic-asset');
      if (dynamicAssetPayloadRaw) {
        try {
          const payload = JSON.parse(dynamicAssetPayloadRaw) as DynamicMediaAssetPayload;
          void insertDynamicMediaAsset(fc, payload, ptr).then((object) => {
            useEditorStore.getState().setSelectedObject(object);
            return useEditorStore.getState().saveHistory();
          }).catch((error) => {
            console.error('[TECKSTUDIO] Unable to add dragged dynamic media:', error);
          });
        } catch (error) {
          console.error('[TECKSTUDIO] Invalid dynamic media payload:', error);
        }
        return;
      }
      const stickerPayloadRaw = e.dataTransfer?.getData('application/x-teckstudio-sticker');
      if (stickerPayloadRaw) {
        try {
          const sticker = JSON.parse(stickerPayloadRaw) as StickerItem;
          void addStickerToCanvas(fc, sticker, ptr).then((object) => {
            useEditorStore.getState().setSelectedObject(object);
            useEditorStore.getState().saveHistory();
          }).catch((error) => {
            console.error('[TECKSTUDIO] Unable to add dragged sticker:', error);
          });
        } catch (error) {
          console.error('[TECKSTUDIO] Invalid dragged sticker payload:', error);
        }
        return;
      }
      const elementPayloadRaw = e.dataTransfer?.getData('application/x-teckstudio-element');
      if (elementPayloadRaw) {
        try {
          const payload = JSON.parse(elementPayloadRaw) as EditorElement;
          if (payload.kind === 'video' && payload.sourceUrl) {
            void insertDynamicMediaAsset(fc, {
              id: payload.id,
              type: 'video',
              sourceUrl: payload.sourceUrl,
              posterUrl: payload.previewUrl || payload.thumbnailUrl,
              mimeType: payload.mimeType,
              name: payload.name,
              duration: payload.videoConfig?.duration,
              startTime: payload.videoConfig?.startTime,
              endTime: payload.videoConfig?.endTime,
              loop: payload.videoConfig?.loop,
              muted: payload.videoConfig?.muted,
            }, ptr).then((object) => {
              useEditorStore.getState().setSelectedObject(object);
              return useEditorStore.getState().saveHistory();
            }).catch((error) => {
              console.error('[TECKSTUDIO] Unable to add dragged video:', error);
            });
            return;
          }
          const object = createElementObjectFromPayload(payload, {
            fill: useEditorStore.getState().fillColor,
            stroke: useEditorStore.getState().strokeColor,
            strokeWidth: useEditorStore.getState().strokeWidth,
          });
          if (object) {
            addObjectToCanvas(fc, object, ptr);
            useEditorStore.getState().saveHistory();
          }
        } catch (error) {
          console.error('[TECKSTUDIO] Unable to add dragged element:', error);
        }
        return;
      }

      const uploadPayloadRaw = e.dataTransfer?.getData('application/x-teckstudio-upload');
      if (uploadPayloadRaw) {
        try {
          const asset = JSON.parse(uploadPayloadRaw) as UploadedImageAsset;
          void addUploadedImageToCanvas(fc, asset, ptr).then((object) => {
            useEditorStore.getState().setSelectedObject(object);
            useEditorStore.getState().saveHistory();
          }).catch((error) => {
            console.error('[TECKSTUDIO] Unable to add uploaded image:', error);
          });
        } catch (error) {
          console.error('[TECKSTUDIO] Invalid uploaded image payload:', error);
        }
        return;
      }

      const photoPayloadRaw = e.dataTransfer?.getData('application/x-teckstudio-photo');
      let photoPayload: EditorElement | null = null;
      if (photoPayloadRaw) {
        try {
          const parsed = JSON.parse(photoPayloadRaw) as EditorElement;
          if (parsed.kind === 'photo' && parsed.sourceUrl) photoPayload = parsed;
        } catch (error) {
          console.error('[TECKSTUDIO] Invalid dragged photo payload:', error);
        }
      }
      const imageSrc = photoPayload?.sourceUrl || e.dataTransfer?.getData('imageSrc');
      const imageName = photoPayload ? `Photo — ${photoPayload.name}` : e.dataTransfer?.getData('imageName') || 'Uploaded image';

      const findFrameAtPointer = () => {
        const point = new fabric.Point(ptr.x, ptr.y);
        return fc.getObjects().slice().reverse().find((object) => (
          isFrameElementObject(object) &&
          object.visible !== false &&
          object.containsPoint(point)
        ));
      };

      const addImageAtPointer = (src: string, name: string, metadata?: Partial<EditorElement>) => {
        fabric.Image.fromURL(src, (img) => {
          const maxWidth = Math.min(420, fc.getWidth() * 0.6);
          const maxHeight = Math.min(420, fc.getHeight() * 0.6);
          const scale = img.width && img.height ? Math.min(maxWidth / img.width, maxHeight / img.height, 1) : 1;
          const elementMetadata: ElementMetadata | undefined = metadata?.kind === 'photo' ? {
            id: window.crypto?.randomUUID ? `photo-${window.crypto.randomUUID()}` : `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            elementId: metadata.id || 'photo',
            elementKind: 'photo',
            displayName: metadata.name || name.replace(/^Photo\s+—\s+/, ''),
            category: metadata.category || 'Photos',
            subcategory: metadata.subcategory,
            sourceUrl: src,
            thumbnailUrl: metadata.thumbnailUrl,
            previewUrl: metadata.previewUrl,
            isPremium: metadata.isPremium,
            editable: true,
            provider: metadata.provider || 'asset-library',
            licence: metadata.licence || 'Project asset licence',
            photoConfig: {
              ...(metadata.photoConfig || {}),
              alt: metadata.name || name.replace(/^Photo\s+—\s+/, ''),
              naturalWidth: metadata.width,
              naturalHeight: metadata.height,
            },
            config: {
              ...(metadata.photoConfig || {}),
              alt: metadata.name || name.replace(/^Photo\s+—\s+/, ''),
              naturalWidth: metadata.width,
              naturalHeight: metadata.height,
            },
          } : undefined;
          img.set({
            left: ptr.x,
            top: ptr.y,
            originX: 'center',
            originY: 'center',
            scaleX: scale,
            scaleY: scale,
            name,
            id: elementMetadata?.id || (window.crypto?.randomUUID ? window.crypto.randomUUID() : `img_${Date.now()}_${Math.random().toString(36).slice(2)}`),
            displayName: elementMetadata?.displayName || name,
            objectType: metadata?.kind === 'photo' ? 'photo' : 'image',
            elementId: metadata?.id,
            elementKind: metadata?.kind,
            elementCategory: metadata?.category,
            elementTags: metadata?.tags,
            elementEditable: true,
            elementProvider: metadata?.provider,
            elementLicence: metadata?.licence,
            elementConfig: elementMetadata?.config,
            photoConfig: elementMetadata?.photoConfig,
            elementMetadata,
            sourceUrl: src,
            thumbnailUrl: metadata?.thumbnailUrl,
            provider: metadata?.provider,
            licence: metadata?.licence,
            naturalWidth: img.width || metadata?.width,
            naturalHeight: img.height || metadata?.height,
            mediaMimeType: metadata?.mimeType,
            staticExportSupported: true,
          } as any);
          fc.add(img);
          fc.setActiveObject(img);
          fc.renderAll();
          useEditorStore.getState().saveHistory();
        }, { crossOrigin: 'anonymous' });
      };

      const addImageToFrame = (frameObject: fabric.Object, src: string, name: string, metadata?: Partial<EditorElement>) => {
        fabric.Image.fromURL(src, (img) => {
          if (!img.width || !img.height) {
            console.error('[TECKSTUDIO] Unable to fill frame because image has no dimensions.');
            return;
          }
          const frameId = String(frameObject.get('id' as keyof fabric.Object) || frameObject.get('elementId' as keyof fabric.Object) || `frame_${Date.now()}`);
          const clipBounds = getFrameClipBoundsForObject(frameObject);
          const scale = Math.max(clipBounds.width / img.width, clipBounds.height / img.height);
          const oldFrameImages = fc.getObjects().filter((object) => (
            object.get('frameRole' as keyof fabric.Object) === 'content' &&
            object.get('frameId' as keyof fabric.Object) === frameId
          ));
          oldFrameImages.forEach((object) => fc.remove(object));
          img.set({
            left: clipBounds.left + clipBounds.width / 2,
            top: clipBounds.top + clipBounds.height / 2,
            originX: 'center',
            originY: 'center',
            scaleX: scale,
            scaleY: scale,
            clipPath: createFrameClipPathForObject(frameObject),
            name: `Framed Photo — ${metadata?.name || name.replace(/^Photo\s+—\s+/, '')}`,
            id: window.crypto?.randomUUID ? `frame-photo-${window.crypto.randomUUID()}` : `frame_photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            displayName: metadata?.name || name,
            objectType: 'photo',
            elementKind: 'photo',
            elementEditable: true,
            elementId: metadata?.id || 'framed-photo',
            elementCategory: metadata?.category || 'Photos',
            elementTags: metadata?.tags || [],
            elementProvider: metadata?.provider || 'asset-library',
            elementLicence: metadata?.licence || 'Project asset licence',
            sourceUrl: src,
            thumbnailUrl: metadata?.thumbnailUrl,
            originalWidth: img.width || metadata?.width,
            originalHeight: img.height || metadata?.height,
            naturalWidth: img.width || metadata?.width,
            naturalHeight: img.height || metadata?.height,
            mediaMimeType: metadata?.mimeType,
            frameId,
            frameRole: 'content',
            clipRole: 'image',
            frameConfig: frameObject.get('frameConfig' as keyof fabric.Object),
            photoConfig: {
              ...(metadata?.photoConfig || {}),
              alt: metadata?.name || name,
              naturalWidth: img.width || metadata?.width,
              naturalHeight: img.height || metadata?.height,
              imageScale: scale,
            },
            staticExportSupported: true,
          } as Record<string, unknown>);
          fc.add(img);
          frameObject.bringToFront();
          fc.setActiveObject(img);
          fc.requestRenderAll();
          useEditorStore.getState().setSelectedObject(img);
          useEditorStore.getState().saveHistory();
        }, { crossOrigin: 'anonymous' });
      };

      if (imageSrc) {
        const targetFrame = findFrameAtPointer();
        if (targetFrame) addImageToFrame(targetFrame, imageSrc, imageName, photoPayload || undefined);
        else addImageAtPointer(imageSrc, imageName, photoPayload || undefined);
        return;
      }

      const droppedFile = Array.from(e.dataTransfer?.files || []).find((file) => file.type.startsWith('image/'));
      const droppedVideo = Array.from(e.dataTransfer?.files || []).find((file) => file.type.startsWith('video/'));
      if (droppedVideo) {
        const sourceUrl = URL.createObjectURL(droppedVideo);
        void insertDynamicMediaAsset(fc, {
          type: 'video',
          sourceUrl,
          name: droppedVideo.name,
          mimeType: droppedVideo.type,
          loop: true,
          muted: false,
        }, ptr).then((object) => {
          useEditorStore.getState().setSelectedObject(object);
          return useEditorStore.getState().saveHistory();
        }).catch((error) => {
          URL.revokeObjectURL(sourceUrl);
          console.error('[TECKSTUDIO] Unable to add dropped video:', error);
        });
        return;
      }
      if (droppedFile) {
        void uploadImageAsset(droppedFile, projectId).then((asset) => (
          addUploadedImageToCanvas(fc, asset, ptr)
        )).then((object) => {
          useEditorStore.getState().setSelectedObject(object);
          useEditorStore.getState().saveHistory();
          window.dispatchEvent(new Event('teckstudio:uploads-changed'));
        }).catch((error) => {
          console.error('[TECKSTUDIO] Unable to upload dropped image:', error);
          window.alert(error instanceof Error ? error.message : 'Unable to upload the dropped image.');
        });
        return;
      }

      const shapeType = e.dataTransfer?.getData('shapeType');
      if (!fc || !shapeType) return;
      const { fillColor: fill, strokeColor: stroke, strokeWidth: sw } = useEditorStore.getState();
      let s: fabric.Object | null = null;
      const sOpts = { fill, stroke: sw > 0 ? stroke : undefined, strokeWidth: sw };

      switch (shapeType) {
        case 'rectangle': s = new fabric.Rect({ left: ptr.x - 75, top: ptr.y - 50, width: 150, height: 100, ...sOpts, rx: 8, ry: 8 }); break;
        case 'circle': s = new fabric.Circle({ left: ptr.x - 60, top: ptr.y - 60, radius: 60, ...sOpts }); break;
        case 'triangle': s = new fabric.Triangle({ left: ptr.x - 65, top: ptr.y - 55, width: 130, height: 110, ...sOpts }); break;
        case 'line': s = new fabric.Line([ptr.x - 100, ptr.y, ptr.x + 100, ptr.y], { stroke: stroke || '#000000', strokeWidth: sw > 0 ? sw : 4 }); break;
        case 'arrow': s = new fabric.Path('M 0 10 L 80 10 L 80 0 L 110 15 L 80 30 L 80 20 L 0 20 Z', { left: ptr.x - 55, top: ptr.y - 15, ...sOpts }); break;
        case 'star': s = new fabric.Path('M 50 0 L 65 35 L 100 35 L 72 57 L 83 91 L 50 70 L 17 91 L 28 57 L 0 35 L 35 35 Z', { left: ptr.x - 50, top: ptr.y - 45, ...sOpts }); break;
      }
      if (s) { fc.add(s); fc.setActiveObject(s); fc.renderAll(); useEditorStore.getState().saveHistory(); }
    };

    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);
    return () => { el.removeEventListener('dragover', handleDragOver); el.removeEventListener('drop', handleDrop); };
  }, [projectId]);

  const previewViewportTransform = canvas?.viewportTransform
    || [zoom, 0, 0, zoom, 0, 0];

  return (
    <div
      ref={containerRef}
      className="flex-1 h-full w-full bg-[#18181b] overflow-auto relative select-none"
      data-canvas-area
      style={{
        backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {isProjectLoading && (
        <div className="absolute top-5 left-1/2 z-20 -translate-x-1/2 rounded-2xl border border-violet-400/30 bg-zinc-950/95 px-4 py-2 text-xs font-semibold text-violet-100 shadow-xl shadow-black/30">
          Loading design canvas…
        </div>
      )}

      {projectLoadError && (
        <div className="absolute top-5 left-1/2 z-30 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-rose-500/30 bg-rose-950/95 p-4 text-sm text-rose-50 shadow-xl shadow-black/40">
          <div className="font-bold">Canvas could not load</div>
          <div className="mt-1 text-xs leading-5 text-rose-100/80">{projectLoadError}</div>
          <div className="mt-3 flex gap-2">
            {projectId && (
              <button type="button" onClick={() => loadProject(projectId)} className="rounded-xl bg-rose-200 px-3 py-1.5 text-xs font-bold text-rose-950 hover:bg-white">
                Retry
              </button>
            )}
            <button type="button" onClick={clearProjectLoadError} className="rounded-xl border border-rose-200/30 px-3 py-1.5 text-xs font-bold text-rose-100 hover:bg-rose-500/10">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="canvas-container shadow-2xl ring-1 ring-zinc-500/80 relative">
        <canvas ref={canvasRef} />
        <canvas
          ref={previewCanvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className={`pointer-events-none absolute left-0 top-0 z-[8] ${timelinePreviewActive ? 'block' : 'hidden'}`}
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transformOrigin: '0 0',
            transform: `matrix(${previewViewportTransform.join(',')})`,
          }}
          aria-hidden="true"
        />
        <PageSelectionOverlay />

        {showSafeArea && (
          <div
            className="pointer-events-none absolute z-[9] border-2 border-dashed border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
            style={{
              left: safeAreaMargin,
              top: safeAreaMargin,
              width: canvasWidth - safeAreaMargin * 2,
              height: canvasHeight - safeAreaMargin * 2,
            }}
          >
            <div className="absolute top-2 left-2 px-2 py-0.5 bg-cyan-950/90 text-[9px] font-bold text-cyan-300 rounded border border-cyan-500/50 shadow">
              Poster Safe Area (1080 × 1350)
            </div>
          </div>
        )}

        {showGrid && (
          <div
            className="pointer-events-none absolute left-0 top-0 z-[9]"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              backgroundImage: `linear-gradient(to right, rgba(139, 92, 246, 0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(139, 92, 246, 0.2) 1px, transparent 1px)`,
              backgroundSize: '108px 108px',
            }}
          />
        )}
      </div>
    </div>
  );
};
