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
import { DesignQualityPanel } from './components/editor/DesignQualityPanel';
import { ElementToolbar } from './components/editor/ElementToolbar';
import { ContextMenu } from './components/editor/ContextMenu';
import { ColorPaletteGenerator } from './components/editor/ColorPaletteGenerator';
import { TextStylesPanel } from './components/editor/TextStylesPanel';
import { EnhancedExportPanel } from './components/editor/EnhancedExportPanel';
import { SaveAsTemplate } from './components/editor/SaveAsTemplate';
import { BackgroundPatterns } from './components/editor/BackgroundPatterns';
import { TimelinePanel } from './components/editor/TimelinePanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useEditorStore } from './store/useEditorStore';
import { Sparkles, Image, Layers, Palette, Wand2, Maximize, ShieldCheck, Download, Grid3x3 } from 'lucide-react';

type RightPanel = 'ai' | 'assets' | 'brand' | 'properties' | 'effects' | 'resize' | 'audit' | 'colors' | 'text-styles' | 'export' | 'templates' | 'patterns';
const RIGHT_PANELS: RightPanel[] = ['ai', 'assets', 'brand', 'properties', 'effects', 'resize', 'audit', 'colors', 'text-styles', 'export', 'templates', 'patterns'];

const App: React.FC = () => {
  // Initialize canvas-level keyboard listeners
  useKeyboardShortcuts();
  const { id } = useParams<{ id: string }>();
  const setProjectId = useEditorStore((state) => state.setProjectId);
  const selectedObject = useEditorStore((state) => state.selectedObject);
  const [rightPanel, setRightPanel] = useState<RightPanel>('ai');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const isTextSelected = Boolean(
    selectedObject
    && ['text', 'i-text', 'textbox'].includes(selectedObject.type || ''),
  );

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

  useEffect(() => {
    if (localStorage.getItem('teckstudio_pending_brand_kit')) {
      setRightPanel('brand');
      return;
    }

    const pendingPanel = sessionStorage.getItem('teckstudio_pending_editor_panel');
    if (!pendingPanel) return;
    try {
      const payload = JSON.parse(pendingPanel) as { panel?: RightPanel };
      if (payload.panel && RIGHT_PANELS.includes(payload.panel)) {
        setRightPanel(payload.panel);
      }
    } finally {
      sessionStorage.removeItem('teckstudio_pending_editor_panel');
    }
  }, []);

  return (
    <div className="grid h-screen w-screen grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[#08080D] font-sans text-zinc-100">
      {/* Top action toolbar */}
      <Toolbar />

      {/* Main editor workspace panel */}
      <div className="relative flex min-h-0 w-full overflow-hidden">
        {/* Left Side: Element insertion and Layer managers */}
        <Sidebar />

        {/* Center: Interactive design canvas */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <CanvasWorkspace />
          {/* Floating selection toolbar — appears above selected elements */}
          <ElementToolbar />
          {/* Floating zoom widgets inside canvas workspace */}
          <ZoomController />
        </div>

        {/* Right Side: Properties, AI Tools, and Assets */}
        <div className="w-80 flex flex-col border-l border-zinc-800 min-h-0">
          {/* Panel Tabs */}
          <div className="flex border-b border-zinc-800 shrink-0 overflow-x-auto">
            {[
              { id: 'ai' as RightPanel, label: 'AI', icon: Sparkles, active: 'text-violet-400 border-b-2 border-violet-400 bg-violet-500/5' },
              { id: 'colors' as RightPanel, label: 'Colors', icon: Palette, active: 'text-orange-400 border-b-2 border-orange-400 bg-orange-500/5' },
              { id: 'assets' as RightPanel, label: 'Assets', icon: Image, active: 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5' },
              { id: 'effects' as RightPanel, label: 'Effects', icon: Wand2, active: 'text-fuchsia-400 border-b-2 border-fuchsia-400 bg-fuchsia-500/5' },
              { id: 'patterns' as RightPanel, label: 'Pattern', icon: Grid3x3, active: 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' },
              { id: 'resize' as RightPanel, label: 'Resize', icon: Maximize, active: 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5' },
              { id: 'brand' as RightPanel, label: 'Brand', icon: Palette, active: 'text-pink-400 border-b-2 border-pink-400 bg-pink-500/5' },
              { id: 'export' as RightPanel, label: 'Export', icon: Download, active: 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' },
              { id: 'audit' as RightPanel, label: 'Audit', icon: ShieldCheck, active: 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' },
              { id: 'properties' as RightPanel, label: 'Props', icon: Layers, active: 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5' },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightPanel(tab.id)}
                  className={`flex shrink-0 items-center justify-center gap-1 py-2 px-1.5 text-[9px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
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
            {rightPanel === 'colors' && (
              <div className="h-full overflow-y-auto">
                <ColorPaletteGenerator />
              </div>
            )}
            {rightPanel === 'text-styles' && (
              <div className="h-full overflow-y-auto">
                {isTextSelected ? <PropertiesPanel /> : <TextStylesPanel />}
              </div>
            )}
            {rightPanel === 'assets' && <RoyaltyFreeAssets />}
            {rightPanel === 'audit' && (
              <div className="h-full overflow-y-auto">
                <DesignQualityPanel />
              </div>
            )}
            {rightPanel === 'effects' && (
              <div className="h-full overflow-y-auto p-4">
                <EffectsPanel />
              </div>
            )}
            {rightPanel === 'patterns' && (
              <div className="h-full overflow-y-auto">
                <BackgroundPatterns />
              </div>
            )}
            {rightPanel === 'resize' && (
              <div className="h-full overflow-y-auto p-4">
                <SmartResize />
              </div>
            )}
            {rightPanel === 'brand' && <BrandKit />}
            {rightPanel === 'templates' && (
              <div className="h-full overflow-y-auto p-3">
                <SaveAsTemplate />
              </div>
            )}
            {rightPanel === 'export' && (
              <div className="h-full overflow-y-auto">
                <EnhancedExportPanel />
              </div>
            )}
            {rightPanel === 'properties' && (
              <div className="h-full overflow-y-auto">
                <PropertiesPanel />
              </div>
            )}
          </div>
        </div>
      </div>

      <TimelinePanel />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Right-click context menu */}
      <ContextMenu />
    </div>
  );
};

export default App;
