import { useEffect } from 'react';
import { fabric } from 'fabric';

export const useSmartGuides = (canvas: fabric.Canvas | null) => {
  useEffect(() => {
    if (!canvas) return;

    const aligningLineOffset = 5;
    const aligningLineWidth = 1;
    const aligningLineColor = '#8b5cf6'; // Brand purple

    let verticalLines: fabric.Line[] = [];
    let horizontalLines: fabric.Line[] = [];
    
    // Clean up old lines
    const clearGuidelines = () => {
      verticalLines.forEach((line) => canvas.remove(line));
      horizontalLines.forEach((line) => canvas.remove(line));
      verticalLines = [];
      horizontalLines = [];
    };

    const drawVerticalLine = (coords: [number, number, number, number]) => {
      const line = new fabric.Line(coords, {
        stroke: aligningLineColor,
        strokeWidth: aligningLineWidth,
        selectable: false,
        evented: false,
        strokeDashArray: [5, 5],
        opacity: 0.8,
        excludeFromExport: true,
        editorOnly: true,
        name: 'Smart vertical guide',
        teckstudioObjectType: 'editorGuide',
      } as fabric.ILineOptions & Record<string, unknown>);
      canvas.add(line);
      verticalLines.push(line);
    };

    const drawHorizontalLine = (coords: [number, number, number, number]) => {
      const line = new fabric.Line(coords, {
        stroke: aligningLineColor,
        strokeWidth: aligningLineWidth,
        selectable: false,
        evented: false,
        strokeDashArray: [5, 5],
        opacity: 0.8,
        excludeFromExport: true,
        editorOnly: true,
        name: 'Smart horizontal guide',
        teckstudioObjectType: 'editorGuide',
      } as fabric.ILineOptions & Record<string, unknown>);
      canvas.add(line);
      horizontalLines.push(line);
    };

    const handleObjectMoving = (e: fabric.IEvent) => {
      clearGuidelines();

      const activeObject = e.target;
      if (!activeObject) return;

      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      
      const objCenter = activeObject.getCenterPoint();

      // Check alignment with Canvas Center
      const canvasCenterX = canvasWidth / 2;
      const canvasCenterY = canvasHeight / 2;

      let snapped = false;

      // Snap to vertical center
      if (Math.abs(objCenter.x - canvasCenterX) < aligningLineOffset) {
        activeObject.set({
          left: canvasCenterX - (activeObject.width! * activeObject.scaleX!) / 2,
        });
        drawVerticalLine([canvasCenterX, 0, canvasCenterX, canvasHeight]);
        snapped = true;
      }
      
      // Snap to horizontal center
      if (Math.abs(objCenter.y - canvasCenterY) < aligningLineOffset) {
        activeObject.set({
          top: canvasCenterY - (activeObject.height! * activeObject.scaleY!) / 2,
        });
        drawHorizontalLine([0, canvasCenterY, canvasWidth, canvasCenterY]);
        snapped = true;
      }

      // Check alignment with other objects
      const objects = canvas.getObjects().filter((obj) => obj !== activeObject && obj.selectable);
      
      for (let i = 0; i < objects.length; i++) {
        const target = objects[i];
        const targetCenter = target.getCenterPoint();

        // Vertical Alignment checks (centers)
        if (Math.abs(objCenter.x - targetCenter.x) < aligningLineOffset) {
          activeObject.set({ left: targetCenter.x - (activeObject.width! * activeObject.scaleX!) / 2 });
          drawVerticalLine([targetCenter.x, 0, targetCenter.x, canvasHeight]);
          snapped = true;
        }

        // Horizontal Alignment checks (centers)
        if (Math.abs(objCenter.y - targetCenter.y) < aligningLineOffset) {
          activeObject.set({ top: targetCenter.y - (activeObject.height! * activeObject.scaleY!) / 2 });
          drawHorizontalLine([0, targetCenter.y, canvasWidth, targetCenter.y]);
          snapped = true;
        }
      }

      if (snapped) {
        canvas.renderAll();
      }
    };

    const handleMouseUp = () => {
      clearGuidelines();
      canvas.renderAll();
    };

    canvas.on('object:moving', handleObjectMoving);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      clearGuidelines();
      canvas.off('object:moving', handleObjectMoving);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [canvas]);
};
