import React, { useState, useRef, useEffect } from 'react';
import { Crop, Check, X, RotateCcw } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';
import { fabric } from 'fabric';

export const ImageCropper: React.FC = () => {
  const { canvas, selectedObject, saveHistory } = useEditorStore();
  const [isCropping, setIsCropping] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'free' | '1:1' | '4:3' | '16:9' | '3:4' | '9:16'>('free');
  const cropOverlayRef = useRef<fabric.Rect | null>(null);
  const cropHandlesRef = useRef<fabric.Rect[]>([]);

  const isImage = selectedObject?.type === 'image';

  useEffect(() => {
    if (!canvas || !selectedObject || !isImage || !isCropping) return;

    const img = selectedObject as fabric.Image;
    const bounds = img.getBoundingRect();

    // Create crop overlay
    const overlay = new fabric.Rect({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      fill: 'rgba(0, 0, 0, 0.5)',
      stroke: '#8b5cf6',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });
    canvas.add(overlay);
    cropOverlayRef.current = overlay;

    // Create crop handles
    const handleSize = 10;
    const handles = [
      { x: bounds.left - handleSize/2, y: bounds.top - handleSize/2, cursor: 'nw-resize' },
      { x: bounds.left + bounds.width - handleSize/2, y: bounds.top - handleSize/2, cursor: 'ne-resize' },
      { x: bounds.left - handleSize/2, y: bounds.top + bounds.height - handleSize/2, cursor: 'sw-resize' },
      { x: bounds.left + bounds.width - handleSize/2, y: bounds.top + bounds.height - handleSize/2, cursor: 'se-resize' },
    ];

    const handleObjects = handles.map((h) => {
      const handle = new fabric.Rect({
        left: h.x,
        top: h.y,
        width: handleSize,
        height: handleSize,
        fill: '#ffffff',
        stroke: '#8b5cf6',
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      canvas.add(handle);
      return handle;
    });
    cropHandlesRef.current = handleObjects;

    canvas.renderAll();

    return () => {
      if (cropOverlayRef.current) {
        canvas.remove(cropOverlayRef.current);
        cropOverlayRef.current = null;
      }
      cropHandlesRef.current.forEach(h => canvas.remove(h));
      cropHandlesRef.current = [];
      canvas.renderAll();
    };
  }, [canvas, selectedObject, isImage, isCropping]);

  const startCropping = () => {
    if (!isImage) return;
    setIsCropping(true);
  };

  const cancelCropping = () => {
    setIsCropping(false);
  };

  const applyCrop = () => {
    if (!canvas || !selectedObject || !isImage) return;

    const img = selectedObject as fabric.Image;
    const bounds = img.getBoundingRect();

    // Calculate crop dimensions based on aspect ratio
    const cropWidth = bounds.width;
    let cropHeight = bounds.height;

    if (aspectRatio === '1:1') {
      cropHeight = cropWidth;
    } else if (aspectRatio === '4:3') {
      cropHeight = cropWidth * 0.75;
    } else if (aspectRatio === '16:9') {
      cropHeight = cropWidth * 9/16;
    } else if (aspectRatio === '3:4') {
      cropHeight = cropWidth * 4/3;
    } else if (aspectRatio === '9:16') {
      cropHeight = cropWidth * 16/9;
    }

    // Create a clipping rectangle
    const clipPath = new fabric.Rect({
      left: bounds.left,
      top: bounds.top,
      width: cropWidth,
      height: cropHeight,
      absolutePositioned: true,
    });

    img.clipPath = clipPath;
    canvas.renderAll();
    saveHistory();

    setIsCropping(false);
  };

  const resetCrop = () => {
    if (!canvas || !selectedObject || !isImage) return;

    const img = selectedObject as fabric.Image;
    img.clipPath = undefined;
    canvas.renderAll();
    saveHistory();
  };

  if (!isImage) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Crop className="w-4 h-4 text-violet-400" />
        <span className="text-xs font-semibold text-zinc-400">Image Crop</span>
      </div>

      {!isCropping ? (
        <button
          onClick={startCropping}
          className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          <Crop className="w-3.5 h-3.5" />
          Start Cropping
        </button>
      ) : (
        <>
          {/* Aspect Ratio Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-1">
              {(['free', '1:1', '4:3', '16:9', '3:4', '9:16'] as const).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`py-1.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                    aspectRatio === ratio
                      ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {ratio === 'free' ? 'Free' : ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={cancelCropping}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              onClick={applyCrop}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Apply
            </button>
          </div>

          {/* Reset Button */}
          <button
            onClick={resetCrop}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-zinc-500 hover:text-zinc-300 text-[10px] font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Crop
          </button>
        </>
      )}
    </div>
  );
};
