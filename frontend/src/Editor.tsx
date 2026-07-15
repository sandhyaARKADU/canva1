import React, { useLayoutEffect, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Toolbar } from './components/editor/Toolbar';
import { Sidebar } from './components/editor/Sidebar';
import { AIAssistant } from './components/editor/AIAssistant';
import { RoyaltyFreeAssets } from './components/editor/RoyaltyFreeAssets';
import { BrandKit } from './components/editor/BrandKit';
import { CanvasWorkspace } from './components/editor/CanvasWorkspace';
import { PropertiesPanel } from './components/editor/PropertiesPanel';
import { ZoomController } from './components/editor/ZoomController';
import { KeyboardShortcutsModal } from './components/editor/KeyboardShortcutsModal';
import { SmartResize } from './components/editor/SmartResize';
import { EffectsPanel } from './components/editor/EffectsPanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useEditorStore } from './store/useEditorStore';
import { Sparkles, Image, Layers, Palette, Wand2, Maximize } from 'lucide-react';

type RightPanel = 'ai' | 'assets' | 'brand' | 'properties' | 'effects' | 'resize';
const RIGHT_PANELS: RightPanel[] = ['ai', 'assets', 'brand', 'properties', 'effects', 'resize'];

const App: React.FC = () => {
  // Initialize canvas-level keyboard listeners
  useKeyboardShortcuts();
  const { id } = useParams<{ id: string }>();
  const setProjectId = useEditorStore((state) => state.setProjectId);
  const [rightPanel, setRightPanel] = useState<RightPanel>('ai');
  const [showShortcuts, setShowShortcuts] = useState(false);

  useLayoutEffect(() => {
    if (id) {
      setProjectId(id);
    }
  }, [id, setProjectId]);

  // Listen for ? key to open shortcuts modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputActive = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as any).contentEditable === 'true'
      );

      if (!isInputActive && e.key === '?') {
        e.preventDefault();
        setShowShortcuts(true);
      }

      if (e.key === 'Escape' && showShortcuts) {
        setShowShortcuts(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts]);

  useEffect(() => {
    const handleOpenPanel = (event: Event) => {
      const panel = (event as CustomEvent<{ panel?: RightPanel }>).detail?.panel;
      if (panel && RIGHT_PANELS.includes(panel)) {
        setRightPanel(panel);
      }
    };

    window.addEventListener('teckstudio:open-panel', handleOpenPanel);
    return () => window.removeEventListener('teckstudio:open-panel', handleOpenPanel);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      {/* Top action toolbar */}
      <Toolbar />

      {/* Main editor workspace panel */}
      <div className="flex-1 flex w-full overflow-hidden relative">
        {/* Left Side: Element insertion and Layer managers */}
        <Sidebar />

        {/* Center: Interactive design canvas */}
        <div className="flex-1 h-full relative flex flex-col overflow-hidden">
          <CanvasWorkspace />
          {/* Floating zoom widgets inside canvas workspace */}
          <ZoomController />
        </div>

        {/* Right Side: Properties, AI Tools, and Assets */}
        <div className="w-80 flex flex-col border-l border-zinc-800 min-h-0">
          {/* Panel Tabs */}
          <div className="flex border-b border-zinc-800 shrink-0">
            {[
              { id: 'ai' as RightPanel, label: 'AI Studio', icon: Sparkles, active: 'text-violet-400 border-b-2 border-violet-400 bg-violet-500/5' },
              { id: 'assets' as RightPanel, label: 'Assets', icon: Image, active: 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5' },
              { id: 'effects' as RightPanel, label: 'Effects', icon: Wand2, active: 'text-fuchsia-400 border-b-2 border-fuchsia-400 bg-fuchsia-500/5' },
              { id: 'resize' as RightPanel, label: 'Resize', icon: Maximize, active: 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5' },
              { id: 'brand' as RightPanel, label: 'Brand', icon: Palette, active: 'text-pink-400 border-b-2 border-pink-400 bg-pink-500/5' },
              { id: 'properties' as RightPanel, label: 'Props', icon: Layers, active: 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5' },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightPanel(tab.id)}
                  className={`flex items-center justify-center gap-1 py-2 px-2 text-[9px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    rightPanel === tab.id
                      ? tab.active
                      : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Panel Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {rightPanel === 'ai' && (
              <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-3 pb-24">
                <AIAssistant />
              </div>
            )}
            {rightPanel === 'assets' && <RoyaltyFreeAssets />}
            {rightPanel === 'effects' && (
              <div className="h-full overflow-y-auto p-4">
                <EffectsPanel />
              </div>
            )}
            {rightPanel === 'resize' && (
              <div className="h-full overflow-y-auto p-4">
                <SmartResize />
              </div>
            )}
            {rightPanel === 'brand' && <BrandKit />}
            {rightPanel === 'properties' && (
              <div className="h-full overflow-y-auto">
                <PropertiesPanel />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
};

export default App;
