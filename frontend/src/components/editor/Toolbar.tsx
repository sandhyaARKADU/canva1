import React, { useState } from 'react';
import {
  Undo2,
  Redo2,
  Trash2,
  Copy,
  RotateCcw,
  Download,
  Sparkles,
  ChevronDown,
  Home,
  Ruler,
  Share2,
  Keyboard,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../store/useEditorStore';
import { ShareModal } from './ShareModal';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { AutoSaveIndicator } from './AutoSaveIndicator';

export const Toolbar: React.FC = () => {
  const navigate = useNavigate();
  const {
    canvas,
    selectedObject,
    undo,
    redo,
    history,
    historyIndex,
    deleteSelected,
    duplicateSelected,
    clearCanvas,
    projectName,
    setProjectName,
    editorMode,
    setEditorMode,
    rulersEnabled,
    setRulersEnabled,
  } = useEditorStore();

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleExport = (type: 'png' | 'jpg' | 'svg') => {
    if (!canvas) return;
    
    // Discard active selection so selection boxes aren't in the exported image
    const activeObject = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.renderAll();

    setTimeout(() => {
      if (type === 'png') {
        const dataURL = canvas.toDataURL({
          format: 'png',
          multiplier: 2, // Export at 2x resolution for high quality
        });
        triggerDownload(dataURL, `${projectName}.png`);
      } else if (type === 'jpg') {
        // Force background white if transparent
        const oldBg = canvas.backgroundColor;
        if (!oldBg || oldBg === 'transparent') {
          canvas.setBackgroundColor('#ffffff', () => {});
        }
        
        const dataURL = canvas.toDataURL({
          format: 'jpeg',
          quality: 0.95,
          multiplier: 2,
        });
        triggerDownload(dataURL, `${projectName}.jpg`);
        
        if (!oldBg || oldBg === 'transparent') {
          canvas.setBackgroundColor(oldBg as string, () => {});
        }
      } else if (type === 'svg') {
        const svgContent = canvas.toSVG();
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${projectName}.svg`);
        URL.revokeObjectURL(url);
      }

      // Restore active selection if there was one
      if (activeObject) {
        canvas.setActiveObject(activeObject);
        canvas.renderAll();
      }
      setShowExportMenu(false);
    }, 50);
  };

  const triggerDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.download = name;
    link.href = url;
    link.click();
  };

  return (
    <header className="h-14 border-b border-zinc-800 bg-[#121214] px-6 flex items-center justify-between select-none z-20 shrink-0">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/')}
          className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer mr-2"
          title="Back to Home"
        >
          <Home className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
          <Sparkles className="w-5 h-5 text-violet-400 animate-pulse" />
          <span className="font-extrabold text-lg tracking-wider">TECKSTUDIO</span>
        </div>
        
        <div className="h-5 w-[1px] bg-zinc-800" />
        
        <input
          type="text"
          value={projectName}
          placeholder="Name your design"
          onChange={(e) => setProjectName(e.target.value)}
          className="bg-transparent border border-transparent hover:border-zinc-800 focus:border-violet-500 focus:bg-zinc-900 px-2 py-0.5 rounded text-sm text-zinc-100 font-semibold focus:outline-none transition-colors max-w-[200px]"
          title="Click to rename project"
        />
        <AutoSaveIndicator />
      </div>

      {/* History and Actions Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:text-zinc-600 disabled:hover:bg-transparent rounded-lg transition-colors cursor-pointer"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:text-zinc-600 disabled:hover:bg-transparent rounded-lg transition-colors cursor-pointer"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-zinc-800 mx-2" />

        {selectedObject && (
          <>
            <button
              onClick={duplicateSelected}
              className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Duplicate Selected (Ctrl+D)"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={deleteSelected}
              className="p-2 hover:bg-zinc-800 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
              title="Delete Selected (Delete/Backspace)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="h-4 w-[1px] bg-zinc-800 mx-2" />
          </>
        )}

        <button
          onClick={clearCanvas}
          className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
          title="Clear Entire Canvas"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {/* Mode Switcher and Export */}
      <div className="flex items-center gap-3">
        {/* Rulers Toggle */}
        <button
          onClick={() => setRulersEnabled(!rulersEnabled)}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${
            rulersEnabled
              ? 'bg-violet-600/15 text-violet-400 border border-violet-500/30'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
          }`}
          title={rulersEnabled ? 'Hide Rulers' : 'Show Rulers'}
        >
          <Ruler className="w-4 h-4" />
        </button>

        {/* Figma Design/Dev Switcher */}
        <div className="flex bg-zinc-900 border border-zinc-850 rounded-lg p-0.5">
          <button
            onClick={() => setEditorMode('design')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              editorMode === 'design' 
                ? 'bg-zinc-800 text-violet-400 border border-zinc-700/50 shadow-sm' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Design
          </button>
          <button
            onClick={() => setEditorMode('dev')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              editorMode === 'dev' 
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3 h-3 text-emerald-400" /> Dev Mode
          </button>
        </div>

        {/* Export Button & Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg hover:shadow-violet-600/15 focus:outline-none"
          >
            <Download className="w-3.5 h-3.5" />
            Export
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>

        {showExportMenu && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setShowExportMenu(false)}
            />
            <div className="absolute right-0 mt-2 w-44 bg-[#121214] border border-zinc-800 rounded-xl shadow-2xl p-1 z-40">
              <button
                onClick={() => handleExport('png')}
                className="w-full text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 px-3 py-2 rounded-lg transition-colors cursor-pointer flex flex-col"
              >
                <span className="font-semibold">PNG Image</span>
                <span className="text-[10px] text-zinc-500">Best for sharing (Transparent)</span>
              </button>
              <button
                onClick={() => handleExport('jpg')}
                className="w-full text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 px-3 py-2 rounded-lg transition-colors cursor-pointer flex flex-col"
              >
                <span className="font-semibold">JPG Image</span>
                <span className="text-[10px] text-zinc-500">Good for web (White bg)</span>
              </button>
              <button
                onClick={() => handleExport('svg')}
                className="w-full text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 px-3 py-2 rounded-lg transition-colors cursor-pointer flex flex-col"
              >
                <span className="font-semibold">SVG Vector</span>
                <span className="text-[10px] text-zinc-500">Scalable vector graphics</span>
              </button>
              <div className="border-t border-zinc-800 my-1" />
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  setShowShareModal(true);
                }}
                className="w-full text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="font-semibold">Share Design</span>
              </button>
            </div>
          </>
        )}
        </div>

        {/* Share Button */}
        <button
          onClick={() => setShowShareModal(true)}
          className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700"
          title="Share Design"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share
        </button>

        {/* Keyboard Shortcuts Button */}
        <button
          onClick={() => setShowShortcuts(true)}
          className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          title="Keyboard Shortcuts (?)"
        >
          <Keyboard className="w-4 h-4" />
        </button>
      </div>

      {/* Modals */}
      <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} />
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </header>
  );
};
