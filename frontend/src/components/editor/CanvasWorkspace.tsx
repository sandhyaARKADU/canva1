import React, { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/useEditorStore';
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
import { isEditableTextObject } from '../../utils/textSelectionStyles';
import { addStickerToCanvas } from '../../utils/stickerCanvas';
import type { StickerItem } from '../../types/editorFeatures';
import { installTextEffectSynchronization } from '../../utils/textEffects';
import type { EditorElement, ElementMetadata } from '../../types/elements';
import { PageSelectionOverlay } from './PageSelectionOverlay';

export const CanvasWorkspace: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const { setCanvas, setSelectedObject, saveHistory, setZoom, editorMode, projectId, isProjectLoading, projectLoadError, loadProject, clearProjectLoadError, canvasWidth, canvasHeight } = useEditorStore();

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
      width: 800,
      height: 800,
      backgroundColor: '#ffffff',
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
    setTimeout(fitCanvasToView, 500);

    const syncSelection = (e: fabric.IEvent) => {
      setSelectedObject(e.selected && e.selected.length > 0 ? e.selected[0] : null);
    };

    const syncActiveTextObject = () => {
      const activeObject = fc.getActiveObject();
      setSelectedObject(activeObject || null);
      if (activeObject && isEditableTextObject(activeObject)) {
        useEditorStore.getState().captureTextSelection();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
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
    fc.on('selection:cleared', () => setSelectedObject(null));
    fc.on('object:modified', () => saveHistory());
    fc.on('object:added', (e) => { if (e.target) assignObjectId(e.target as fabric.Object); });
    fc.on('text:selection:changed', syncActiveTextObject);
    fc.on('text:editing:entered', syncActiveTextObject);
    fc.on('text:editing:exited', syncActiveTextObject);
    fc.on('text:changed', () => saveHistory());
    window.addEventListener('keydown', handleKeyDown);

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
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      removeTextEffectSynchronization();
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
      fabricRef.current.renderAll();
    }, 500);

    return () => clearTimeout(timer);
  }, [isProjectLoading, canvasWidth, canvasHeight]);

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
          const payload = JSON.parse(elementPayloadRaw);
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
      if (droppedFile) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result;
          if (typeof dataUrl === 'string') {
            const targetFrame = findFrameAtPointer();
            if (targetFrame) addImageToFrame(targetFrame, dataUrl, droppedFile.name);
            else addImageAtPointer(dataUrl, droppedFile.name);
          }
        };
        reader.readAsDataURL(droppedFile);
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
  }, []);

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

      <div className="canvas-container shadow-2xl relative">
        <canvas ref={canvasRef} />
        <PageSelectionOverlay />
      </div>
    </div>
  );
};
