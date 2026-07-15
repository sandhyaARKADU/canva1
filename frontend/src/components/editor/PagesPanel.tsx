import React, { useState } from 'react';
import { Plus, Trash2, Copy, ChevronUp, ChevronDown, FileText } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';

interface Page {
  id: string;
  name: string;
  data: string;
  thumbnail?: string;
}

const PAGES_STORAGE_KEY = 'teckstudio_pages';

function loadPages(): Page[] {
  try {
    const raw = localStorage.getItem(PAGES_STORAGE_KEY);
    if (raw) {
      const pages = JSON.parse(raw);
      if (pages.length > 0) return pages;
    }
  } catch {
    // Ignore invalid persisted page metadata.
  }
  return [{ id: 'page-1', name: 'Page 1', data: '' }];
}

function savePages(pages: Page[]) {
  localStorage.setItem(PAGES_STORAGE_KEY, JSON.stringify(pages));
}

export const PagesPanel: React.FC = () => {
  const { canvas, saveHistory } = useEditorStore();
  const [pages, setPages] = useState<Page[]>(loadPages);
  const [activePageId, setActivePageId] = useState('page-1');
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Persist pages to localStorage whenever they change
  React.useEffect(() => {
    savePages(pages);
  }, [pages]);

  // Save current page data before switching
  const saveCurrentPage = () => {
    if (!canvas) return;
    const currentPage = pages.find(p => p.id === activePageId);
    if (!currentPage) return;

    const canvasData = JSON.stringify(canvas.toJSON(['id', 'name']));
    setPages(prev => prev.map(p => 
      p.id === activePageId ? { ...p, data: canvasData } : p
    ));
  };

  // Switch to a different page
  const switchToPage = (pageId: string) => {
    if (pageId === activePageId) return;
    
    saveCurrentPage();
    
    const targetPage = pages.find(p => p.id === pageId);
    if (!targetPage || !canvas) {
      setActivePageId(pageId);
      return;
    }

    // Load target page data
    canvas.clear();
    if (targetPage.data) {
      canvas.loadFromJSON(targetPage.data, () => {
        canvas.renderAll();
      });
    } else {
      canvas.setBackgroundColor('#ffffff', () => canvas.renderAll());
    }
    
    setActivePageId(pageId);
    saveHistory();
  };

  // Add a new page
  const addPage = () => {
    saveCurrentPage();
    
    const newPageId = `page-${Date.now()}`;
    const newPage: Page = {
      id: newPageId,
      name: `Page ${pages.length + 1}`,
      data: ''
    };

    setPages(prev => [...prev, newPage]);
    setActivePageId(newPageId);

    // Clear canvas for new page
    if (canvas) {
      canvas.clear();
      canvas.setBackgroundColor('#ffffff', () => canvas.renderAll());
      saveHistory();
    }
  };

  // Duplicate a page
  const duplicatePage = (pageId: string) => {
    const sourcePage = pages.find(p => p.id === pageId);
    if (!sourcePage) return;

    saveCurrentPage();

    const newPageId = `page-${Date.now()}`;
    const newPage: Page = {
      id: newPageId,
      name: `${sourcePage.name} (Copy)`,
      data: sourcePage.data
    };

    const sourceIndex = pages.findIndex(p => p.id === pageId);
    const newPages = [...pages];
    newPages.splice(sourceIndex + 1, 0, newPage);
    setPages(newPages);
  };

  // Delete a page
  const deletePage = (pageId: string) => {
    if (pages.length <= 1) return; // Don't delete last page
    
    const newPages = pages.filter(p => p.id !== pageId);
    setPages(newPages);

    // If we deleted the active page, switch to the first available
    if (pageId === activePageId) {
      switchToPage(newPages[0].id);
    }
  };

  // Move page up/down
  const movePage = (pageId: string, direction: 'up' | 'down') => {
    const index = pages.findIndex(p => p.id === pageId);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;

    const newPages = [...pages];
    const [movedPage] = newPages.splice(index, 1);
    newPages.splice(newIndex, 0, movedPage);
    setPages(newPages);
  };

  // Start editing page name
  const startEditing = (pageId: string, currentName: string) => {
    setEditingPageId(pageId);
    setEditName(currentName);
  };

  // Finish editing page name
  const finishEditing = (pageId: string) => {
    if (editName.trim()) {
      setPages(prev => prev.map(p => 
        p.id === pageId ? { ...p, name: editName.trim() } : p
      ));
    }
    setEditingPageId(null);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-100">Pages</h3>
        <button
          onClick={addPage}
          className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Add Page"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto max-h-[400px]">
        {pages.map((page, index) => {
          const isActive = page.id === activePageId;
          return (
            <div
              key={page.id}
              onClick={() => switchToPage(page.id)}
              className={`relative p-3 rounded-xl border cursor-pointer transition-all ${
                isActive
                  ? 'bg-violet-600/10 border-violet-500/40 text-violet-300'
                  : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700 text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-violet-500/20' : 'bg-zinc-800'
                }`}>
                  <FileText className={`w-5 h-5 ${isActive ? 'text-violet-400' : 'text-zinc-500'}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  {editingPageId === page.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => finishEditing(page.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') finishEditing(page.id);
                        else if (e.key === 'Escape') setEditingPageId(null);
                      }}
                      className="w-full bg-zinc-900 border border-violet-500 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="text-xs font-semibold truncate block"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startEditing(page.id, page.name);
                      }}
                    >
                      {page.name}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-500">
                    {index === 0 ? 'Front' : index === pages.length - 1 ? 'Back' : ''}
                  </span>
                </div>

                {/* Page controls */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      movePage(page.id, 'up');
                    }}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 cursor-pointer"
                    title="Move Up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      movePage(page.id, 'down');
                    }}
                    disabled={index === pages.length - 1}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 cursor-pointer"
                    title="Move Down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicatePage(page.id);
                    }}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    title="Duplicate Page"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {pages.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePage(page.id);
                      }}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 cursor-pointer"
                      title="Delete Page"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
