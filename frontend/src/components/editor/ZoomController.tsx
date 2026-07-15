import React from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';

export const ZoomController: React.FC = () => {
  const { zoom, setZoom, canvas } = useEditorStore();

  const handleZoomIn = () => {
    setZoom(zoom + 0.1);
  };

  const handleZoomOut = () => {
    setZoom(zoom - 0.1);
  };

  const handleFit = () => {
    if (!canvas) return;
    
    // Find parent element size
    const container = canvas.getElement().parentElement?.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const scaleX = (containerWidth - 120) / 800;
    const scaleY = (containerHeight - 120) / 800;
    const idealZoom = Math.min(scaleX, scaleY, 1.0);
    
    // Reset zoom and center
    setZoom(idealZoom);
    canvas.setViewportTransform([idealZoom, 0, 0, idealZoom, 0, 0]);
    
    // Center the viewport
    const vW = containerWidth;
    const vH = containerHeight;
    const cW = 800 * idealZoom;
    const cH = 800 * idealZoom;
    
    const offsetX = (vW - cW) / 2;
    const offsetY = (vH - cH) / 2;
    
    canvas.viewportTransform![4] = offsetX;
    canvas.viewportTransform![5] = offsetY;
    canvas.renderAll();
  };

  return (
    <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-[#121214]/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-zinc-800 shadow-xl select-none z-10">
      <button
        onClick={handleZoomOut}
        className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
        title="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      
      <span className="text-xs font-semibold text-zinc-300 w-12 text-center">
        {Math.round(zoom * 100)}%
      </span>
      
      <button
        onClick={handleZoomIn}
        className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
        title="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      
      <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
      
      <button
        onClick={handleFit}
        className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
        title="Fit to Screen"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
};
