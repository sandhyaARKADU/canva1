import React, { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { useEditorStore } from '../../store/useEditorStore';
import { useSmartGuides } from '../../hooks/useSmartGuides';
import { useDistanceMeasurement } from '../../hooks/useDistanceMeasurement';
import { usePenTool } from '../../hooks/usePenTool';
import { useLassoSelection } from '../../hooks/useLassoSelection';

export const CanvasWorkspace: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const { setCanvas, setSelectedObject, saveHistory, setZoom, editorMode } = useEditorStore();

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
    });

    fabricRef.current = fc;
    (canvasRef.current as any).__fabric = fc;
    ((fc as any).lowerCanvasEl as HTMLCanvasElement | undefined)?.setAttribute('data-fabric-canvas', 'lower');
    ((fc as any).upperCanvasEl as HTMLCanvasElement | undefined)?.setAttribute('data-fabric-canvas', 'upper');
    if ((fc as any).lowerCanvasEl) ((fc as any).lowerCanvasEl as any).__fabric = fc;
    if ((fc as any).upperCanvasEl) ((fc as any).upperCanvasEl as any).__fabric = fc;
    setCanvas(fc);

    setTimeout(() => {
      const cw = containerRef.current?.clientWidth || 0;
      const ch = containerRef.current?.clientHeight || 0;
      setZoom(Math.min((cw - 120) / 800, (ch - 120) / 800, 1.0));
    }, 100);

    const syncSelection = (e: fabric.IEvent) => {
      setSelectedObject(e.selected && e.selected.length > 0 ? e.selected[0] : null);
    };

    fc.on('selection:created', syncSelection);
    fc.on('selection:updated', syncSelection);
    fc.on('selection:cleared', () => setSelectedObject(null));
    fc.on('object:modified', () => saveHistory());
    fc.on('object:added', (e) => { if (e.target) assignObjectId(e.target as fabric.Object); });

    return () => {
      fc.dispose();
      fabricRef.current = null;
      setCanvas(null);
      setSelectedObject(null);
    };
  }, []);

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
      const imageSrc = e.dataTransfer?.getData('imageSrc');
      const imageName = e.dataTransfer?.getData('imageName') || 'Uploaded image';

      const addImageAtPointer = (src: string, name: string) => {
        fabric.Image.fromURL(src, (img) => {
          const maxWidth = Math.min(420, fc.getWidth() * 0.6);
          const maxHeight = Math.min(420, fc.getHeight() * 0.6);
          const scale = img.width && img.height ? Math.min(maxWidth / img.width, maxHeight / img.height, 1) : 1;
          img.set({
            left: ptr.x,
            top: ptr.y,
            originX: 'center',
            originY: 'center',
            scaleX: scale,
            scaleY: scale,
            name,
            id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          } as any);
          fc.add(img);
          fc.setActiveObject(img);
          fc.renderAll();
          useEditorStore.getState().saveHistory();
        }, { crossOrigin: 'anonymous' });
      };

      if (imageSrc) {
        addImageAtPointer(imageSrc, imageName);
        return;
      }

      const droppedFile = Array.from(e.dataTransfer?.files || []).find((file) => file.type.startsWith('image/'));
      if (droppedFile) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result;
          if (typeof dataUrl === 'string') addImageAtPointer(dataUrl, droppedFile.name);
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
      className="flex-1 h-full w-full bg-[#18181b] overflow-auto flex items-center justify-center relative select-none"
      style={{
        backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      <div className="canvas-container shadow-2xl relative">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};
