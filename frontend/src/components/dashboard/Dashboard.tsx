import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  FolderOpen,
  LayoutTemplate,
  Users,
  Trash2,
  Search,
  Plus,
  Star,
  Clock,
  MonitorPlay,
  FileText,
  Image,
  Palette,
  ArrowLeft,
  Upload,
  Type,
  Sparkles,
  ImagePlus,
  Bot,
  X,
} from 'lucide-react';
import { apiFetch, getAuthToken } from '../../services/apiClient';
import {
  DESIGN_TYPE_OPTIONS,
  TEMPLATE_CATEGORY_ROWS,
  TEMPLATE_FILTER_OPTIONS,
  VALID_TECH_POSTER_TEMPLATES,
  getThemeLabel,
  templateSearchText,
  type TechPosterTemplate,
} from '../../data/techPosterTemplates';
import { POSTER_SPEC_THEMES, createPosterSpecProjectData } from '../../utils/posterSpecRenderer';

const createClientProjectId = () => window.crypto?.randomUUID?.() ?? `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

type DashboardPage = 'home' | 'projects' | 'templates' | 'brand-hub' | 'shared' | 'trash';
type AiEntryPoint = 'chat' | 'poster' | 'image' | 'thumbnail';
type HomeAiTool = 'assistant' | 'image' | 'poster' | 'thumbnail';
type TemplateFilterKey = 'format' | 'orientation' | 'aspectRatio' | 'style' | 'industry' | 'theme';
type TemplateFilters = Record<TemplateFilterKey, string[]> & { access: 'All' | 'Free' | 'Premium' };

const EMPTY_TEMPLATE_FILTERS: TemplateFilters = {
  format: [],
  orientation: [],
  aspectRatio: [],
  style: [],
  industry: [],
  theme: [],
  access: 'All',
};

interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  data?: string;
}

interface DeletedProjectMeta {
  id: string;
  item_id: string;
  name: string;
  deletedAt: string;
  data?: string | null;
  width?: number | null;
  height?: number | null;
}

interface BackendTemplate {
  id: string;
  name: string;
  description?: string | null;
  data?: string | null;
  thumbnail?: string | null;
  width: number;
  height: number;
  tags?: string | null;
  use_count: number;
}

interface CreateDesignPreset {
  name: string;
  width: number;
  height: number;
  description: string;
  accent: string;
}

const CREATE_DESIGN_PRESETS: CreateDesignPreset[] = [
  { name: 'Poster', width: 800, height: 1132, description: 'Portrait marketing poster', accent: 'from-amber-500 to-orange-500' },
  { name: 'Instagram Post', width: 1080, height: 1080, description: 'Square social post', accent: 'from-pink-500 to-purple-500' },
  { name: 'YouTube Thumbnail', width: 1280, height: 720, description: '16:9 video thumbnail', accent: 'from-red-500 to-orange-500' },
  { name: 'Presentation', width: 1920, height: 1080, description: 'Widescreen slide', accent: 'from-blue-500 to-indigo-500' },
  { name: 'Instagram Story', width: 1080, height: 1920, description: 'Vertical story layout', accent: 'from-fuchsia-500 to-pink-500' },
  { name: 'Business Card', width: 1050, height: 600, description: 'Print-ready card', accent: 'from-zinc-400 to-zinc-600' },
];



const formatRelativeDate = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.max(1, Math.round(diffMinutes / 60));
  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  const diffDays = Math.max(1, Math.round(diffHours / 24));
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString();
};

// ─── Component ──────────────────────────────────────────────────────────────────
export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activePage, setActivePage] = useState<DashboardPage>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [homePrompt, setHomePrompt] = useState('');
  const [homeAiTool, setHomeAiTool] = useState<HomeAiTool>('assistant');
  const [homeUploads, setHomeUploads] = useState<File[]>([]);
  const [showIdeas, setShowIdeas] = useState(false);
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const homeUploadRef = useRef<HTMLInputElement | null>(null);
  const [savedDesigns, setSavedDesigns] = useState<ProjectMeta[]>([]);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [backendTemplates, setBackendTemplates] = useState<BackendTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [trashedDesigns, setTrashedDesigns] = useState<DeletedProjectMeta[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState('');
  const [showCreateDesignModal, setShowCreateDesignModal] = useState(false);
  const [customDesignSize, setCustomDesignSize] = useState({ width: 800, height: 800 });
  const [templateSearch, setTemplateSearch] = useState('');
  const [debouncedTemplateSearch, setDebouncedTemplateSearch] = useState('');
  const [selectedTemplateType, setSelectedTemplateType] = useState('All');
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState('All');
  const [templateSort, setTemplateSort] = useState('Recommended');
  const [templateFilters, setTemplateFilters] = useState<TemplateFilters>(EMPTY_TEMPLATE_FILTERS);
  const [showTemplateFilters, setShowTemplateFilters] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<string[]>(() => {
    const raw = localStorage.getItem('teckstudio_favorite_template_ids');
    return raw ? JSON.parse(raw) : [];
  });
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>(() => {
    const raw = localStorage.getItem('teckstudio_recent_template_ids');
    return raw ? JSON.parse(raw) : [];
  });
  const [recentlyUsedTemplateIds, setRecentlyUsedTemplateIds] = useState<string[]>(() => {
    const raw = localStorage.getItem('teckstudio_recently_used_template_ids');
    return raw ? JSON.parse(raw) : [];
  });

  // Get user profile info
  const storedUser = localStorage.getItem('teckstudio_user');
  const user = storedUser ? JSON.parse(storedUser) : { name: 'User' };

  // Show notification helper
  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const homeAiTools: Array<{ id: HomeAiTool; label: string; icon: React.ElementType; entryPoint: AiEntryPoint }> = [
    { id: 'assistant', label: 'AI Assistant', icon: Bot, entryPoint: 'chat' },
    { id: 'image', label: 'AI Image', icon: ImagePlus, entryPoint: 'image' },
    { id: 'poster', label: 'AI Poster', icon: FileText, entryPoint: 'poster' },
    { id: 'thumbnail', label: 'AI Thumbnail', icon: MonitorPlay, entryPoint: 'thumbnail' },
  ];

  const promptIdeas = [
    'Movie Poster',
    'Business Flyer',
    'Instagram Post',
    'Music Album',
    'Gaming Poster',
    'AI Conference',
    'Education',
    'Festival',
    'Sports',
    'Corporate',
    'Travel',
    'Restaurant',
    'Wedding Invitation',
  ];

  const selectedHomeTool = homeAiTools.find((tool) => tool.id === homeAiTool) || homeAiTools[0];

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTemplateSearch(templateSearch.trim().toLowerCase()), 160);
    return () => window.clearTimeout(timer);
  }, [templateSearch]);

  React.useEffect(() => {
    localStorage.setItem('teckstudio_favorite_template_ids', JSON.stringify(favoriteTemplateIds));
  }, [favoriteTemplateIds]);

  React.useEffect(() => {
    localStorage.setItem('teckstudio_recent_template_ids', JSON.stringify(recentTemplateIds));
  }, [recentTemplateIds]);

  React.useEffect(() => {
    localStorage.setItem('teckstudio_recently_used_template_ids', JSON.stringify(recentlyUsedTemplateIds));
  }, [recentlyUsedTemplateIds]);

  React.useEffect(() => {
    if (!previewTemplateId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewTemplateId(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [previewTemplateId]);

  const favoriteTemplates = React.useMemo(
    () => favoriteTemplateIds.map((id) => VALID_TECH_POSTER_TEMPLATES.find((template) => template.id === id)).filter(Boolean) as TechPosterTemplate[],
    [favoriteTemplateIds],
  );

  const recentlyViewedTemplates = React.useMemo(
    () => recentTemplateIds.map((id) => VALID_TECH_POSTER_TEMPLATES.find((template) => template.id === id)).filter(Boolean) as TechPosterTemplate[],
    [recentTemplateIds],
  );

  const recentlyUsedTemplates = React.useMemo(
    () => recentlyUsedTemplateIds.map((id) => VALID_TECH_POSTER_TEMPLATES.find((template) => template.id === id)).filter(Boolean) as TechPosterTemplate[],
    [recentlyUsedTemplateIds],
  );

  const activeFilterCount = React.useMemo(() => (
    templateFilters.format.length +
    templateFilters.orientation.length +
    templateFilters.aspectRatio.length +
    templateFilters.style.length +
    templateFilters.industry.length +
    templateFilters.theme.length +
    (templateFilters.access === 'All' ? 0 : 1)
  ), [templateFilters]);

  const filteredTemplates = React.useMemo(() => {
    const query = debouncedTemplateSearch;
    const matchesArray = (values: string[], selected: string[]) => selected.length === 0 || selected.some((value) => values.includes(value));
    const list = VALID_TECH_POSTER_TEMPLATES.filter((template) => {
      if (selectedTemplateType !== 'All' && template.designType !== selectedTemplateType) return false;
      if (selectedTemplateCategory !== 'All' && template.category !== selectedTemplateCategory) return false;
      if (query && !templateSearchText(template).includes(query)) return false;
      if (templateFilters.format.length && !templateFilters.format.includes(template.format)) return false;
      if (templateFilters.orientation.length && !templateFilters.orientation.includes(template.orientation)) return false;
      if (templateFilters.aspectRatio.length && !templateFilters.aspectRatio.includes(template.aspectRatio)) return false;
      if (!matchesArray(template.style, templateFilters.style)) return false;
      if (!matchesArray(template.industry, templateFilters.industry)) return false;
      if (templateFilters.theme.length && !templateFilters.theme.includes(getThemeLabel(template.themeId))) return false;
      if (templateFilters.access === 'Free' && !template.isFree) return false;
      if (templateFilters.access === 'Premium' && template.isFree) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (templateSort === 'Most Popular') return b.popularity - a.popularity;
      if (templateSort === 'Recently Added') return b.createdAt.localeCompare(a.createdAt);
      if (templateSort === 'Recently Used') {
        const aIndex = recentlyUsedTemplateIds.indexOf(a.id);
        const bIndex = recentlyUsedTemplateIds.indexOf(b.id);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }
      if (templateSort === 'A–Z') return a.name.localeCompare(b.name);
      return Number(b.isFeatured) - Number(a.isFeatured) || b.popularity - a.popularity;
    });
  }, [debouncedTemplateSearch, recentlyUsedTemplateIds, selectedTemplateCategory, selectedTemplateType, templateFilters, templateSort]);

  const previewTemplate = previewTemplateId
    ? VALID_TECH_POSTER_TEMPLATES.find((template) => template.id === previewTemplateId) || null
    : null;

  const handleHomeUploads = (files: FileList | null) => {
    if (!files) return;
    const allowedExtensions = ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp'];
    const accepted = Array.from(files).filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const valid = allowedExtensions.includes(extension);
      if (!valid) showNotification(`${file.name} is not supported`, 'error');
      return valid;
    });
    setHomeUploads((current) => [...current, ...accepted].slice(0, 8));
  };

  const enhanceHomePrompt = async () => {
    if (!homePrompt.trim() || enhancingPrompt) return;
    setEnhancingPrompt(true);
    try {
      const response = await apiFetch('/api/ai/generate-image-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: homePrompt,
          style: homeAiTool === 'image' ? 'photorealistic' : 'digital-art',
          aspect_ratio: homeAiTool === 'image' ? '1:1' : '4:5',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.enhanced_prompt) throw new Error(data.detail || 'Unable to enhance prompt');
      setEnhancedPrompt(data.enhanced_prompt);
    } catch {
      setEnhancedPrompt(`A professionally designed ${selectedHomeTool.label.toLowerCase()} based on: ${homePrompt}. Use clear visual hierarchy, premium typography, balanced spacing, relevant imagery, strong contrast, cohesive color palette, readable text, and production-ready composition.`);
    } finally {
      setEnhancingPrompt(false);
    }
  };

  const stashHomeUploadsForEditor = async () => {
    if (homeUploads.length === 0) return;
    const serialized = await Promise.all(homeUploads.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: reader.result,
      });
      reader.readAsDataURL(file);
    })));
    sessionStorage.setItem('teckstudio_pending_ai_uploads', JSON.stringify(serialized));
  };

  const generateFromHomeComposer = async () => {
    await stashHomeUploadsForEditor();
    handleCreateDesign(`${selectedHomeTool.label} Workspace`, undefined, undefined, selectedHomeTool.entryPoint, enhancedPrompt || homePrompt);
  };

  // Fetch user projects list from the backend only; UI state is not persistence proof.
  const fetchProjects = async () => {
    const token = getAuthToken();
    if (!token) {
      setSavedDesigns([]);
      showNotification('Please log in again to load saved designs.', 'error');
      setTimeout(() => navigate('/login'), 1200);
      return;
    }

    try {
      const response = await apiFetch('/api/projects');
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('teckstudio_auth_token');
          localStorage.removeItem('teckstudio_user');
          setTimeout(() => navigate('/login'), 1200);
        }
        throw new Error(data?.detail || data?.error || `Failed to load projects (${response.status})`);
      }
      setSavedDesigns(data?.projects || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load projects.';
      setSavedDesigns([]);
      showNotification(message, 'error');
    }
  };

  React.useEffect(() => {
    fetchProjects();
  }, []);

  const fetchTrash = async () => {
    const token = getAuthToken();
    if (!token) {
      setTrashedDesigns([]);
      setTrashError('Please log in again to load trash.');
      return;
    }

    setTrashLoading(true);
    setTrashError('');
    try {
      const response = await apiFetch('/api/projects/trash');
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Failed to load trash (${response.status})`);
      }
      setTrashedDesigns(data?.items || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load trash.';
      setTrashedDesigns([]);
      setTrashError(message);
      showNotification(message, 'error');
    } finally {
      setTrashLoading(false);
    }
  };

  React.useEffect(() => {
    if (activePage === 'trash') fetchTrash();
  }, [activePage]);

  const fetchBackendTemplates = async () => {
    setTemplatesLoading(true);
    setTemplatesError('');
    try {
      const response = await apiFetch('/api/templates?limit=48', { auth: false });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Failed to load templates (${response.status})`);
      }
      setBackendTemplates(data?.templates || []);
    } catch (error) {
      setBackendTemplates([]);
      setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates.');
    } finally {
      setTemplatesLoading(false);
    }
  };

  React.useEffect(() => {
    fetchBackendTemplates();
  }, []);

  const getEditorPath = (id: string, aiEntryPoint?: AiEntryPoint, prompt?: string) => {
    const params = new URLSearchParams();
    if (aiEntryPoint) params.set('ai', aiEntryPoint);
    if (prompt?.trim()) params.set('prompt', prompt.trim());
    const query = params.toString();
    return `/editor/${id}${query ? `?${query}` : ''}`;
  };

  const handleCreateDesign = async (name?: string, _width?: number, _height?: number, aiEntryPoint?: AiEntryPoint, prompt?: string, templateData?: string | null) => {
    const token = getAuthToken();
    const designName = name?.trim() || 'New Design';
    if (!token) {
      showNotification('Please log in again to create persistent designs.', 'error');
      setTimeout(() => navigate('/login'), 1200);
      return;
    }

    try {
      const newId = createClientProjectId();
      const response = await apiFetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: newId,
          name: designName,
          width: _width,
          height: _height,
          data: templateData || undefined,
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Failed to create design (${response.status})`);
      }
      const createdProject = data?.project || data;
      setSavedDesigns((current) => [createdProject, ...current.filter((project) => project.id !== createdProject.id)]);
      showNotification('Design created and saved.');
      navigate(getEditorPath(createdProject.id, aiEntryPoint, prompt));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create design.';
      showNotification(message, 'error');
    }
  };

  const handleCreateFromTemplate = async (template: BackendTemplate) => {
    await handleCreateDesign(template.name, template.width, template.height, undefined, undefined, template.data);
  };

  const rememberTemplateId = (ids: string[], id: string) => [id, ...ids.filter((item) => item !== id)].slice(0, 12);

  const openTemplatePreview = (template: TechPosterTemplate) => {
    setPreviewTemplateId(template.id);
    setRecentTemplateIds((current) => rememberTemplateId(current, template.id));
  };

  const toggleTemplateFavorite = (templateId: string) => {
    setFavoriteTemplateIds((current) => current.includes(templateId)
      ? current.filter((id) => id !== templateId)
      : rememberTemplateId(current, templateId));
  };

  const handleUseTechTemplate = async (template: TechPosterTemplate) => {
    setCreatingTemplateId(template.id);
    try {
      const clonedSpec = JSON.parse(JSON.stringify(template.posterSpec));
      const projectData = createPosterSpecProjectData(clonedSpec, template.themeId);
      setRecentlyUsedTemplateIds((current) => rememberTemplateId(current, template.id));
      await handleCreateDesign(`${template.name} Copy`, projectData.width, projectData.height, undefined, undefined, projectData.data);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to create project from template.', 'error');
    } finally {
      setCreatingTemplateId(null);
    }
  };

  const toggleTemplateFilter = (key: TemplateFilterKey, value: string) => {
    setTemplateFilters((current) => {
      const selected = current[key];
      return {
        ...current,
        [key]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
      };
    });
  };

  const clearTemplateFilterValue = (key: TemplateFilterKey, value: string) => {
    setTemplateFilters((current) => ({ ...current, [key]: current[key].filter((item) => item !== value) }));
  };

  const clearAllTemplateFilters = () => {
    setTemplateFilters(EMPTY_TEMPLATE_FILTERS);
    setSelectedTemplateType('All');
    setSelectedTemplateCategory('All');
  };

  const openCreateDesignFlow = () => {
    setShowCreateDesignModal(true);
  };

  const createPresetDesign = async (preset: CreateDesignPreset) => {
    setShowCreateDesignModal(false);
    await handleCreateDesign(preset.name, preset.width, preset.height);
  };

  const createCustomDesign = async () => {
    const width = Math.max(100, Math.round(customDesignSize.width || 800));
    const height = Math.max(100, Math.round(customDesignSize.height || 800));
    setShowCreateDesignModal(false);
    await handleCreateDesign('Custom Size', width, height);
  };

  const handleOpenDesign = (id: string) => {
    navigate(`/editor/${id}`);
  };

  const handleDeleteDesign = async (id: string) => {
    if (id.startsWith('local_')) {
      showNotification('This local-only design is not database-backed and cannot be verified as persisted.', 'error');
      return;
    }
    try {
      const response = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Failed to delete design (${response.status})`);
      }
      setSavedDesigns(prev => prev.filter(d => d.id !== id));
      await fetchTrash();
      showNotification('Design moved to trash.');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to delete design.', 'error');
    }
  };

  const handleRestoreDesign = async (deletedItemId: string) => {
    try {
      const response = await apiFetch(`/api/projects/trash/${deletedItemId}/restore`, { method: 'POST' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Failed to restore design (${response.status})`);
      }
      const restoredProject = data?.project || data;
      setSavedDesigns((current) => [restoredProject, ...current.filter((project) => project.id !== restoredProject.id)]);
      setTrashedDesigns((current) => current.filter((item) => item.id !== deletedItemId));
      showNotification('Design restored.');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to restore design.', 'error');
    }
  };

  const handlePermanentDelete = async (deletedItemId: string) => {
    try {
      const response = await apiFetch(`/api/projects/trash/${deletedItemId}`, { method: 'DELETE' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || data?.error || `Failed to permanently delete design (${response.status})`);
      }
      setTrashedDesigns((current) => current.filter((item) => item.id !== deletedItemId));
      showNotification('Design permanently deleted.');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to permanently delete design.', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Local logout must still succeed if the session is already expired.
    } finally {
      localStorage.removeItem('teckstudio_auth_token');
      localStorage.removeItem('teckstudio_user');
      navigate('/login');
    }
  };

  // ─── Sidebar Nav Items ──────────────────────────────────────────────────────
  const navItems: { id: DashboardPage; icon: React.ElementType; label: string }[] = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'projects', icon: FolderOpen, label: 'Projects' },
    { id: 'templates', icon: LayoutTemplate, label: 'Templates' },
    { id: 'brand-hub', icon: Star, label: 'Brand Hub' },
  ];

  const secondaryNavItems: { id: DashboardPage; icon: React.ElementType; label: string }[] = [
    { id: 'shared', icon: Users, label: 'Shared with you' },
    { id: 'trash', icon: Trash2, label: 'Trash' },
  ];

  // ─── Design Card Component ─────────────────────────────────────────────────
  const DesignCard = ({ design }: { design: { id: string; name: string; type: string; editedAt: string; gradient: string; thumbnail?: string } }) => (
    <div className="group cursor-pointer" onClick={() => handleOpenDesign(design.id)}>
      <div className="aspect-video bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden relative group-hover:border-violet-500/50 transition-all duration-300 mb-3 group-hover:shadow-lg group-hover:shadow-violet-500/5">
        {design.thumbnail ? (
          <img src={design.thumbnail} alt={design.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <div className={`absolute inset-0 bg-gradient-to-br ${design.gradient}`}></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <FileText className="w-8 h-8 text-zinc-500/40 mx-auto mb-1" />
                <span className="text-[10px] font-bold text-zinc-500/50 uppercase tracking-wider">{design.type}</span>
              </div>
            </div>
          </>
        )}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this design?')) {
                handleDeleteDesign(design.id);
              }
            }}
            className="w-8 h-8 rounded-full bg-zinc-900/80 flex items-center justify-center text-zinc-300 hover:text-rose-400 hover:bg-zinc-800 border border-zinc-700 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <h4 className="font-semibold text-zinc-200 text-sm">{design.name}</h4>
      <p className="text-xs text-zinc-500 mt-0.5">Edited {design.editedAt}</p>
    </div>
  );

  // ─── Page: Home ─────────────────────────────────────────────────────────────
  const renderHome = () => (
    <>
      <section className="mb-10">
        <h1 className="mx-auto max-w-5xl text-center text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
          Describe what you want to create
        </h1>

        <div className="mx-auto mt-8 max-w-6xl">
          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/75 p-1.5 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="flex min-w-max items-center gap-1">
              {homeAiTools.map((tool) => {
                const Icon = tool.icon;
                const active = homeAiTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setHomeAiTool(tool.id)}
                    className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                      active
                        ? 'border border-violet-400 bg-violet-500/15 text-violet-100 shadow-lg shadow-violet-500/10'
                        : 'border border-transparent text-zinc-300 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tool.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl shadow-black/25">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <span className="text-lg font-bold text-white">{selectedHomeTool.label}</span>
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-200">AI</span>
              <span>Generate editable visuals, attach files, enhance prompts, and continue in the editor.</span>
            </div>

            <div className="relative rounded-2xl border border-violet-500/70 bg-zinc-900/80 p-4 focus-within:border-violet-300">
              <textarea
                value={homePrompt}
                onChange={(event) => setHomePrompt(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && homePrompt.trim()) {
                    generateFromHomeComposer();
                  }
                }}
                placeholder="Describe your design in detail..."
                className="min-h-[220px] w-full resize-none border-0 bg-transparent p-2 text-base leading-8 text-zinc-100 outline-none placeholder:text-zinc-500"
              />
              <div className="absolute bottom-4 right-4 flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-500">{homePrompt.length}/2000</span>
                <button
                  type="button"
                  onClick={() => {
                    setHomePrompt('');
                    setEnhancedPrompt('');
                  }}
                  className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={enhanceHomePrompt}
                  disabled={!homePrompt.trim() || enhancingPrompt}
                  className="rounded-full border border-violet-400/60 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-100 transition-colors hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {enhancingPrompt ? 'Enhancing...' : 'Enhance prompt'}
                </button>
              </div>
            </div>

            {enhancedPrompt && (
              <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">Enhanced prompt</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEnhancedPrompt('')} className="text-xs font-semibold text-zinc-400 hover:text-white">Restore</button>
                    <button type="button" onClick={() => setHomePrompt(enhancedPrompt)} className="text-xs font-semibold text-violet-200 hover:text-white">Accept</button>
                  </div>
                </div>
                <textarea
                  value={enhancedPrompt}
                  onChange={(event) => setEnhancedPrompt(event.target.value)}
                  className="min-h-[92px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs leading-6 text-zinc-200 outline-none focus:border-violet-400/60"
                />
              </div>
            )}

            {homeUploads.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {homeUploads.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300">
                    {file.type.startsWith('image/') ? <ImagePlus className="h-3.5 w-3.5 text-fuchsia-300" /> : <FileText className="h-3.5 w-3.5 text-violet-300" />}
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button type="button" onClick={() => setHomeUploads((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="text-zinc-500 hover:text-rose-300">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {showIdeas && (
              <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                {promptIdeas.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => {
                      setHomePrompt(`Create a professional ${idea.toLowerCase()} with premium typography, strong visual hierarchy, cohesive colors, relevant imagery, and clear call to action.`);
                      setShowIdeas(false);
                    }}
                    className="rounded-full border border-zinc-700 bg-zinc-950/70 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-violet-400/50 hover:text-violet-100"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => homeUploadRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </button>
                <input
                  ref={homeUploadRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    handleHomeUploads(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowIdeas((current) => !current)}
                  className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
                >
                  <Sparkles className="h-4 w-4" />
                  Ideas
                </button>
              </div>
              <button
                type="button"
                onClick={generateFromHomeComposer}
                disabled={!homePrompt.trim() && !enhancedPrompt.trim()}
                className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-gradient-to-r from-indigo-500 to-fuchsia-600 px-9 text-lg font-black text-white shadow-xl shadow-violet-500/20 transition-all hover:from-indigo-400 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Generate
                <Sparkles className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Designs */}
      <section className="mb-12">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><Clock className="w-5 h-5 text-violet-300" /> Recent designs</h3>
          <button onClick={() => setActivePage('projects')} className="text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200 cursor-pointer">
            View all →
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Create New - Blank Canvas */}
          <div onClick={openCreateDesignFlow} className="group cursor-pointer">
            <div className="relative mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-dashed border-zinc-700/80 bg-gradient-to-br from-violet-950/70 via-zinc-950 to-fuchsia-950/60 transition-all duration-300 hover:border-violet-500/60 hover:shadow-lg hover:shadow-violet-500/10">
              <img src="https://picsum.photos/seed/design-canvas/400/225" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" crossOrigin="anonymous" />
              <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-violet-600/35 backdrop-blur-sm transition-colors group-hover:bg-violet-600/55">
                  <Plus className="w-7 h-7 text-white" />
                </div>
                <span className="text-sm font-semibold tracking-tight text-white">Create Design</span>
              </div>
            </div>
            <h4 className="text-sm font-semibold tracking-tight text-white">New Blank Canvas</h4>
            <p className="mt-0.5 text-xs text-zinc-400">Start from scratch</p>
          </div>

          {/* Instagram Post */}
          <div onClick={() => handleCreateDesign('Instagram Post', 1080, 1080)} className="group cursor-pointer">
            <div className="relative mb-3 aspect-square overflow-hidden rounded-2xl border border-zinc-800/80 transition-all duration-300 hover:border-pink-500/50 hover:shadow-lg hover:shadow-pink-500/10">
              <img src="https://picsum.photos/seed/fashion-model/400/400" alt="" className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />
              <div className="absolute inset-0 bg-gradient-to-t from-pink-900/90 via-pink-900/20 to-purple-900/30"></div>
              <div className="absolute top-3 left-3">
                <span className="text-[10px] bg-pink-500 text-white px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shadow-lg">Instagram</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h4 className="text-white font-extrabold text-xl leading-tight drop-shadow-lg">Summer Collection</h4>
                <p className="text-pink-200 text-xs mt-1 font-semibold">New Arrivals · Shop Now</p>
                <div className="flex gap-2 mt-2">
                  <span className="text-[9px] bg-white/20 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">#fashion</span>
                  <span className="text-[9px] bg-white/20 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">#style</span>
                </div>
              </div>
            </div>
            <h4 className="text-sm font-semibold tracking-tight text-white">Instagram Post</h4>
            <p className="mt-0.5 text-xs text-zinc-400">1080 × 1080</p>
          </div>

          {/* YouTube Thumbnail */}
          <div onClick={() => handleCreateDesign('YouTube Thumbnail', 1280, 720)} className="group cursor-pointer">
            <div className="relative mb-3 aspect-video overflow-hidden rounded-2xl border border-zinc-800/80 transition-all duration-300 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/10">
              <img src="https://picsum.photos/seed/tech-workspace/400/225" alt="" className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />
              <div className="absolute inset-0 bg-gradient-to-t from-red-950/90 via-red-900/20 to-black/50"></div>
              <div className="absolute top-3 right-3">
                <div className="bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-lg">
                  <MonitorPlay className="w-3 h-3" /> YouTube
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h4 className="text-white font-extrabold text-xl leading-tight drop-shadow-lg">10 Coding Tips You Need</h4>
                <p className="text-red-200 text-xs mt-1 font-semibold">Tutorial · 15 min watch</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-white/80">2.4K views</span>
                  <span className="text-[10px] text-white/80">3 days ago</span>
                </div>
              </div>
            </div>
            <h4 className="text-sm font-semibold tracking-tight text-white">YouTube Thumbnail</h4>
            <p className="mt-0.5 text-xs text-zinc-400">1280 × 720</p>
          </div>

          {/* Poster */}
          <div onClick={() => handleCreateDesign('Event Poster', 800, 1132)} className="group cursor-pointer">
            <div className="relative mb-3 aspect-[3/4] overflow-hidden rounded-2xl border border-zinc-800/80 transition-all duration-300 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10">
              <img src="https://picsum.photos/seed/concert-stage/300/400" alt="" className="absolute inset-0 w-full h-full object-cover" crossOrigin="anonymous" />
              <div className="absolute inset-0 bg-gradient-to-t from-amber-950/95 via-amber-900/30 to-black/40"></div>
              <div className="absolute top-4 left-4">
                <span className="text-[10px] bg-amber-500 text-black px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shadow-lg">Live Event</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-amber-300 text-xs font-bold uppercase tracking-widest">June 28, 2026</p>
                <h4 className="text-white font-extrabold text-2xl leading-tight mt-1 drop-shadow-lg">Music Festival</h4>
                <p className="text-amber-200/80 text-xs mt-2 font-semibold">Central Park · 7PM</p>
                <div className="mt-3 bg-amber-500 text-black text-[10px] font-bold px-3 py-1.5 rounded-lg inline-block">GET TICKETS →</div>
              </div>
            </div>
            <h4 className="text-sm font-semibold tracking-tight text-white">Event Poster</h4>
            <p className="mt-0.5 text-xs text-zinc-400">A4 Portrait</p>
          </div>

          {/* Existing Saved Designs */}
          {savedDesigns.length > 0 && savedDesigns.map((project) => (
            <DesignCard
              key={project.id}
              design={{
                id: project.id,
                name: project.name,
                type: project.id.startsWith('local_') ? 'Local Design' : 'Cloud Design',
                editedAt: formatRelativeDate(project.updatedAt),
                gradient: project.id.startsWith('local_') ? 'from-cyan-500/30 to-blue-500/30' : 'from-violet-500/30 to-fuchsia-500/30',
              }}
            />
          ))}
        </div>
      </section>

      {/* Quick Start Templates */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><LayoutTemplate className="w-5 h-5 text-violet-300" /> Popular templates</h3>
          <button onClick={() => setActivePage('templates')} className="text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200 cursor-pointer">
            See all →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {templatesLoading && (
            <div className="col-span-full rounded-2xl border border-zinc-800 bg-zinc-950/50 p-6 text-sm text-zinc-400">
              Loading backend templates...
            </div>
          )}
          {backendTemplates.slice(0, 6).map((template) => (
            <button
              key={template.id}
              onClick={() => handleCreateFromTemplate(template)}
              className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-left transition-all cursor-pointer hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/10"
            >
              <div className="flex aspect-square items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/40 to-fuchsia-600/30 text-center transition-transform duration-500 group-hover:scale-105">
                {template.thumbnail ? (
                  <img src={template.thumbnail} alt="" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <LayoutTemplate className="h-9 w-9 text-violet-100" />
                )}
              </div>
              <p className="mt-3 truncate text-xs font-bold text-white">{template.name}</p>
              <p className="mt-1 text-[10px] text-zinc-500">{template.width} × {template.height}</p>
            </button>
          ))}
          {!templatesLoading && backendTemplates.length === 0 && (
            <>
          {/* Instagram Posts */}
          <button onClick={() => setActivePage('templates')} className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 transition-all cursor-pointer hover:border-pink-500/50 hover:shadow-lg hover:shadow-pink-500/10">
            <img src="https://picsum.photos/seed/social-media/200/200" alt="" className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" crossOrigin="anonymous" />
            <div className="absolute inset-0 bg-gradient-to-t from-pink-900/90 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <span className="text-[10px] bg-pink-500 text-white px-2 py-0.5 rounded-full font-bold">250+</span>
              <p className="text-xs font-bold text-white mt-1">Instagram Posts</p>
            </div>
          </button>

          {/* Stories & Reels */}
          <button onClick={() => setActivePage('templates')} className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 transition-all cursor-pointer hover:border-fuchsia-500/50 hover:shadow-lg hover:shadow-fuchsia-500/10">
            <img src="https://picsum.photos/seed/stories-reels/200/200" alt="" className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" crossOrigin="anonymous" />
            <div className="absolute inset-0 bg-gradient-to-t from-fuchsia-900/90 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <span className="text-[10px] bg-fuchsia-500 text-white px-2 py-0.5 rounded-full font-bold">180+</span>
              <p className="text-xs font-bold text-white mt-1">Stories & Reels</p>
            </div>
          </button>

          {/* YouTube */}
          <button onClick={() => setActivePage('templates')} className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 transition-all cursor-pointer hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/10">
            <img src="https://picsum.photos/seed/youtube-creator/200/200" alt="" className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" crossOrigin="anonymous" />
            <div className="absolute inset-0 bg-gradient-to-t from-red-900/90 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">180+</span>
              <p className="text-xs font-bold text-white mt-1">YouTube Thumbnails</p>
            </div>
          </button>

          {/* Posters */}
          <button onClick={() => setActivePage('templates')} className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 transition-all cursor-pointer hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10">
            <img src="https://picsum.photos/seed/event-flyer/200/200" alt="" className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" crossOrigin="anonymous" />
            <div className="absolute inset-0 bg-gradient-to-t from-amber-900/90 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <span className="text-[10px] bg-amber-500 text-black px-2 py-0.5 rounded-full font-bold">300+</span>
              <p className="text-xs font-bold text-white mt-1">Posters</p>
            </div>
          </button>

          {/* Business Cards */}
          <button onClick={() => setActivePage('templates')} className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 transition-all cursor-pointer hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10">
            <img src="https://picsum.photos/seed/business-cards/200/200" alt="" className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" crossOrigin="anonymous" />
            <div className="absolute inset-0 bg-gradient-to-t from-blue-900/90 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">120+</span>
              <p className="text-xs font-bold text-white mt-1">Business Cards</p>
            </div>
          </button>

          {/* Presentations */}
          <button onClick={() => setActivePage('templates')} className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 transition-all cursor-pointer hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10">
            <img src="https://picsum.photos/seed/presentation/200/200" alt="" className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" crossOrigin="anonymous" />
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/90 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold">150+</span>
              <p className="text-xs font-bold text-white mt-1">Presentations</p>
            </div>
          </button>
            </>
          )}
        </div>
      </section>
    </>
  );

  // ─── Page: Projects ─────────────────────────────────────────────────────────
  const renderProjects = () => (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">All Projects</h2>
          <p className="mt-1 text-sm text-zinc-400">Browse every saved design from the studio.</p>
        </div>
        <button onClick={openCreateDesignFlow} className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/10 transition-all hover:from-violet-500 hover:to-fuchsia-500 cursor-pointer">
          <Plus className="w-4 h-4" /> New Design
        </button>
      </div>

      {/* All Designs */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">Your Designs ({savedDesigns.length})</h3>
        {savedDesigns.length === 0 ? (
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950/50 py-20 text-center text-zinc-500 backdrop-blur-sm">
            <FileText className="mx-auto mb-3 h-12 w-12 opacity-40" />
            <p className="font-semibold text-zinc-200">No designs yet</p>
            <p className="mt-1 text-xs text-zinc-400">Create your first design to get started</p>
            <button onClick={openCreateDesignFlow} className="mt-4 rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/10 cursor-pointer">
              Create Design
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {savedDesigns.map((project) => (
              <DesignCard
                key={project.id}
                design={{
                  id: project.id,
                  name: project.name,
                  type: project.id.startsWith('local_') ? 'Local Design' : 'Cloud Design',
                  editedAt: formatRelativeDate(project.updatedAt),
                  gradient: project.id.startsWith('local_') ? 'from-cyan-500/30 to-blue-500/30' : 'from-violet-500/30 to-fuchsia-500/30',
                }}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );

  // ─── Page: Templates ────────────────────────────────────────────────────────
  const renderTemplates = () => {
    const featuredTemplates = VALID_TECH_POSTER_TEMPLATES.filter((template) => template.isFeatured).slice(0, 8);
    const activeChips: Array<{ label: string; clear: () => void }> = [];
    if (selectedTemplateType !== 'All') activeChips.push({ label: selectedTemplateType, clear: () => setSelectedTemplateType('All') });
    if (selectedTemplateCategory !== 'All') activeChips.push({ label: selectedTemplateCategory, clear: () => setSelectedTemplateCategory('All') });
    (['format', 'orientation', 'aspectRatio', 'style', 'industry', 'theme'] as TemplateFilterKey[]).forEach((key) => {
      templateFilters[key].forEach((value) => activeChips.push({ label: value, clear: () => clearTemplateFilterValue(key, value) }));
    });
    if (templateFilters.access !== 'All') activeChips.push({ label: templateFilters.access, clear: () => setTemplateFilters((current) => ({ ...current, access: 'All' })) });

    const renderTemplateArtwork = (template: TechPosterTemplate, large = false) => {
      const theme = POSTER_SPEC_THEMES.find((item) => item.id === template.themeId) || POSTER_SPEC_THEMES[0];
      const cards = template.posterSpec.cards.slice(0, large ? 7 : 4);
      return (
        <div
          className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[inherit] ${large ? 'p-6' : 'p-4'}`}
          style={{ background: theme.background, color: theme.text }}
        >
          <div className="absolute -left-12 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl" style={{ background: theme.primary }} />
          <div className="absolute -bottom-14 -right-10 h-36 w-36 rounded-full opacity-20 blur-2xl" style={{ background: theme.accent }} />
          <div className="relative z-10 mb-3 text-[8px] font-bold uppercase tracking-[0.22em]" style={{ color: theme.primary }}>
            {template.layoutFamily}
          </div>
          <div className={`relative z-10 font-black leading-[0.96] ${large ? 'text-4xl' : 'text-lg'}`}>
            {template.posterSpec.title}
          </div>
          <div className={`relative z-10 mt-2 font-semibold ${large ? 'text-base' : 'text-[10px]'}`} style={{ color: theme.muted }}>
            {template.posterSpec.subtitle}
          </div>
          <div className={`relative z-10 mt-4 grid gap-2 ${large ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {cards.map((card) => (
              <div key={card.number} className="rounded-xl border p-2" style={{ background: theme.card, borderColor: theme.border }}>
                <div className="flex items-center gap-2">
                  <span className="rounded-md px-1.5 py-1 text-[9px] font-black" style={{ background: `${theme.primary}22`, color: theme.primary }}>
                    {String(card.number).padStart(2, '0')}
                  </span>
                  <span className={`truncate font-bold ${large ? 'text-xs' : 'text-[9px]'}`}>{card.title}</span>
                </div>
                {large && <p className="mt-1 line-clamp-2 text-[10px]" style={{ color: theme.muted }}>{card.description}</p>}
              </div>
            ))}
          </div>
          <div className="relative z-10 mt-auto pt-4 text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: theme.primary }}>
            {template.posterSpec.cta.tag}
          </div>
        </div>
      );
    };

    const renderTemplateCard = (template: TechPosterTemplate, compact = false) => {
      const isFavorite = favoriteTemplateIds.includes(template.id);
      return (
        <article key={template.id} className="group overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-950/70 shadow-lg shadow-black/10 transition-all hover:border-violet-400/50 hover:shadow-violet-500/10">
          <button
            type="button"
            onClick={() => openTemplatePreview(template)}
            className={`block w-full overflow-hidden rounded-t-3xl bg-zinc-900 text-left ${compact ? 'h-40' : 'h-52'}`}
            aria-label={`Preview ${template.name}`}
          >
            <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.025]">
              {renderTemplateArtwork(template)}
            </div>
          </button>
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-white">{template.name}</h3>
                <button
                  type="button"
                  onClick={() => setSelectedTemplateCategory(template.category)}
                  className="mt-1 text-[10px] font-semibold text-violet-300 hover:text-violet-200"
                >
                  {template.category}
                </button>
              </div>
              <button
                type="button"
                onClick={() => toggleTemplateFavorite(template.id)}
                className={`rounded-full border p-2 transition-colors ${isFavorite ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-zinc-800 text-zinc-500 hover:text-amber-300'}`}
                aria-label={isFavorite ? `Remove ${template.name} from favourites` : `Add ${template.name} to favourites`}
              >
                <Star className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">{template.description}</p>
            <div className="flex flex-wrap gap-1.5 text-[9px] font-semibold">
              <span className="rounded-full border border-zinc-800 px-2 py-1 text-zinc-400">{template.format}</span>
              <span className="rounded-full border border-zinc-800 px-2 py-1 text-zinc-400">{template.width}×{template.height}</span>
              <span className={`rounded-full px-2 py-1 ${template.isFree ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                {template.isFree ? 'Free' : 'Premium'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openTemplatePreview(template)}
                className="rounded-xl border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-violet-400/40 hover:text-violet-200"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => handleUseTechTemplate(template)}
                disabled={creatingTemplateId === template.id}
                className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                {creatingTemplateId === template.id ? 'Creating…' : 'Use Template'}
              </button>
            </div>
          </div>
        </article>
      );
    };

    const renderFilterGroup = (key: TemplateFilterKey, label: string, options: string[]) => (
      <div className="space-y-2">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">{label}</h4>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = templateFilters[key].includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleTemplateFilter(key, option)}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors ${selected ? 'border-violet-400/50 bg-violet-500/15 text-violet-200' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'}`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    );

    const similarTemplates = previewTemplate
      ? VALID_TECH_POSTER_TEMPLATES
        .filter((template) => template.id !== previewTemplate.id)
        .map((template) => ({
          template,
          score:
            (template.category === previewTemplate.category ? 4 : 0) +
            (template.layoutFamily === previewTemplate.layoutFamily ? 3 : 0) +
            (template.format === previewTemplate.format ? 2 : 0) +
            (template.themeId === previewTemplate.themeId ? 1 : 0) +
            template.tags.filter((tag) => previewTemplate.tags.includes(tag)).length,
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((item) => item.template)
      : [];

    return (
      <>
        <section className="mb-8 rounded-[2rem] border border-zinc-800/80 bg-gradient-to-br from-zinc-950 via-zinc-950 to-violet-950/30 p-6 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-black tracking-tight text-white">Templates</h2>
              <p className="mt-2 text-sm text-zinc-400">Choose a professionally designed starting point and customize every section.</p>
              <div className="mt-5 flex flex-col gap-3 lg:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={templateSearch}
                    onChange={(event) => setTemplateSearch(event.target.value)}
                    placeholder="Search templates, topics, industries, styles, or formats"
                    className="w-full rounded-2xl border border-zinc-800 bg-black/35 px-11 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-400/60"
                  />
                </div>
                <button onClick={() => handleCreateDesign('Blank Poster', 800, 1132)} className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:border-violet-400/50">
                  Create Blank Poster
                </button>
                <button onClick={() => handleCreateDesign('AI Poster', 800, 1132, 'poster', templateSearch || 'Create a technical poster')} className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500">
                  Generate with AI
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select value={templateSort} onChange={(event) => setTemplateSort(event.target.value)} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 outline-none">
                {['Recommended', 'Most Popular', 'Recently Added', 'Recently Used', 'A–Z'].map((option) => <option key={option}>{option}</option>)}
              </select>
              <button onClick={() => setShowTemplateFilters((current) => !current)} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-violet-400/50">
                Filters {activeFilterCount > 0 && <span className="ml-1 text-violet-300">({activeFilterCount})</span>}
              </button>
              <span className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-400">{filteredTemplates.length} templates</span>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {DESIGN_TYPE_OPTIONS.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedTemplateType(type)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${selectedTemplateType === type ? 'border-violet-400/60 bg-violet-500/15 text-violet-200' : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200'}`}
              >
                {type}
              </button>
            ))}
          </div>
        </section>

        {showTemplateFilters && (
          <section className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Filter templates</h3>
              <button onClick={clearAllTemplateFilters} className="text-xs font-semibold text-violet-300 hover:text-violet-200">Reset</button>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {renderFilterGroup('format', 'Format', TEMPLATE_FILTER_OPTIONS.format)}
              {renderFilterGroup('orientation', 'Orientation', TEMPLATE_FILTER_OPTIONS.orientation)}
              {renderFilterGroup('aspectRatio', 'Aspect Ratio', TEMPLATE_FILTER_OPTIONS.aspectRatio)}
              {renderFilterGroup('style', 'Style', TEMPLATE_FILTER_OPTIONS.style)}
              {renderFilterGroup('industry', 'Industry', TEMPLATE_FILTER_OPTIONS.industry)}
              {renderFilterGroup('theme', 'Theme', TEMPLATE_FILTER_OPTIONS.theme)}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">Access</h4>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_FILTER_OPTIONS.access.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setTemplateFilters((current) => ({ ...current, access: option as TemplateFilters['access'] }))}
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${templateFilters.access === option ? 'border-violet-400/50 bg-violet-500/15 text-violet-200' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeChips.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            {activeChips.map((chip) => (
              <button key={chip.label} onClick={chip.clear} className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-semibold text-violet-200">
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button onClick={clearAllTemplateFilters} className="rounded-full border border-zinc-800 px-3 py-1.5 text-[10px] font-semibold text-zinc-400 hover:text-zinc-200">Clear all</button>
          </div>
        )}

        {templatesError && (
          <div className="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
            Backend template sync is unavailable, so the local TechPoster template library is being used. {templatesError}
          </div>
        )}

        <section className="mb-10 grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="overflow-hidden rounded-[2rem] border border-violet-500/20 bg-gradient-to-br from-violet-600/20 via-cyan-500/10 to-zinc-950 p-6">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200">
                <Sparkles className="h-3 w-3" />
                TechPoster Studio
              </div>
              <h3 className="mt-4 text-2xl font-black text-white">Create technical posters faster with AI</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">Start with a template or describe your topic and generate an editable PosterSpec.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => handleCreateDesign('AI Poster', 800, 1132, 'poster', templateSearch || 'Explain system design for beginners')} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-zinc-950">Generate with AI</button>
                <button onClick={() => { setSelectedTemplateCategory('Software Engineering'); setSelectedTemplateType('Technical Posters'); }} className="rounded-xl border border-white/20 px-4 py-2 text-xs font-bold text-white">Explore Technical Templates</button>
              </div>
            </div>
          </div>
          <div className="rounded-[2rem] border border-zinc-800 bg-zinc-950/70 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><Clock className="h-4 w-4 text-violet-300" /> Template stats</h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-zinc-900/70 p-4"><div className="text-2xl font-black text-white">{VALID_TECH_POSTER_TEMPLATES.length}</div><div className="text-[10px] text-zinc-500">Valid templates</div></div>
              <div className="rounded-2xl bg-zinc-900/70 p-4"><div className="text-2xl font-black text-white">{TEMPLATE_CATEGORY_ROWS.length}</div><div className="text-[10px] text-zinc-500">Categories</div></div>
              <div className="rounded-2xl bg-zinc-900/70 p-4"><div className="text-2xl font-black text-white">{favoriteTemplateIds.length}</div><div className="text-[10px] text-zinc-500">Favourites</div></div>
              <div className="rounded-2xl bg-zinc-900/70 p-4"><div className="text-2xl font-black text-white">8</div><div className="text-[10px] text-zinc-500">Themes</div></div>
            </div>
          </div>
        </section>

        {favoriteTemplates.length > 0 && (
          <section className="mb-10">
            <h3 className="mb-4 text-lg font-bold text-white">Your Favourites</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{favoriteTemplates.slice(0, 4).map((template) => renderTemplateCard(template, true))}</div>
          </section>
        )}

        {recentlyViewedTemplates.length > 0 && (
          <section className="mb-10">
            <h3 className="mb-4 text-lg font-bold text-white">Recently Viewed</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{recentlyViewedTemplates.slice(0, 4).map((template) => renderTemplateCard(template, true))}</div>
          </section>
        )}

        {recentlyUsedTemplates.length > 0 && (
          <section className="mb-10">
            <h3 className="mb-4 text-lg font-bold text-white">Recently Used</h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{recentlyUsedTemplates.slice(0, 4).map((template) => renderTemplateCard(template, true))}</div>
          </section>
        )}

        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Featured Templates</h3>
              <p className="text-xs text-zinc-500">Curated editable PosterSpec templates for demo-ready technical posters.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{featuredTemplates.map((template) => renderTemplateCard(template, true))}</div>
        </section>

        {TEMPLATE_CATEGORY_ROWS.map((row) => {
          const rowTemplates = VALID_TECH_POSTER_TEMPLATES.filter((template) => template.category === row.title).slice(0, 8);
          if (rowTemplates.length === 0) return null;
          return (
            <section key={row.title} className="mb-10">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{row.title}</h3>
                  <p className="text-xs text-zinc-500">{row.description}</p>
                </div>
                <button onClick={() => setSelectedTemplateCategory(row.title)} className="shrink-0 text-xs font-bold text-violet-300 hover:text-violet-200">View All</button>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{rowTemplates.map((template) => renderTemplateCard(template, true))}</div>
            </section>
          );
        })}

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">All Templates</h3>
              <p className="text-xs text-zinc-500">{filteredTemplates.length} matching templates</p>
            </div>
          </div>
          {filteredTemplates.length === 0 ? (
            <div className="rounded-[2rem] border border-zinc-800 bg-zinc-950/70 p-10 text-center">
              <LayoutTemplate className="mx-auto h-10 w-10 text-zinc-600" />
              <h3 className="mt-4 text-lg font-bold text-white">No templates found</h3>
              <p className="mt-2 text-sm text-zinc-500">Try another keyword or remove some filters.</p>
              <div className="mt-5 flex justify-center gap-3">
                <button onClick={() => setTemplateSearch('')} className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200">Clear Search</button>
                <button onClick={clearAllTemplateFilters} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white">Clear All Filters</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {filteredTemplates.map((template) => renderTemplateCard(template))}
            </div>
          )}
        </section>

        {previewTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${previewTemplate.name} preview`}>
            <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50">
              <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="min-h-[520px] bg-zinc-900 p-6">{renderTemplateArtwork(previewTemplate, true)}</div>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">{previewTemplate.category}</p>
                      <h3 className="mt-2 text-2xl font-black text-white">{previewTemplate.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{previewTemplate.description}</p>
                    </div>
                    <button onClick={() => setPreviewTemplateId(null)} className="rounded-xl border border-zinc-800 p-2 text-zinc-400 hover:text-white" aria-label="Close template preview">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    {[
                      ['Format', previewTemplate.format],
                      ['Orientation', previewTemplate.orientation],
                      ['Dimensions', `${previewTemplate.width} × ${previewTemplate.height}`],
                      ['Aspect Ratio', previewTemplate.aspectRatio],
                      ['Theme', getThemeLabel(previewTemplate.themeId)],
                      ['Layout', previewTemplate.layoutFamily],
                      ['Editable Elements', `${previewTemplate.posterSpec.cards.length + 4}+`],
                      ['Creator', 'TechPoster Studio'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
                        <div className="mt-1 font-semibold text-zinc-200">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {previewTemplate.style.map((style) => <span key={style} className="rounded-full bg-violet-500/10 px-3 py-1 text-[10px] font-semibold text-violet-200">{style}</span>)}
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button onClick={() => toggleTemplateFavorite(previewTemplate.id)} className="rounded-xl border border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-200 hover:border-amber-400/40">
                      {favoriteTemplateIds.includes(previewTemplate.id) ? 'Remove Favourite' : 'Add Favourite'}
                    </button>
                    <button onClick={() => handleUseTechTemplate(previewTemplate)} disabled={creatingTemplateId === previewTemplate.id} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50">
                      {creatingTemplateId === previewTemplate.id ? 'Creating…' : 'Use This Template'}
                    </button>
                  </div>
                  {similarTemplates.length > 0 && (
                    <div className="mt-8">
                      <h4 className="mb-3 text-sm font-bold text-white">Similar Templates</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {similarTemplates.map((template) => (
                          <button key={template.id} onClick={() => openTemplatePreview(template)} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 text-left hover:border-violet-400/40">
                            <div className="h-24 overflow-hidden rounded-xl">{renderTemplateArtwork(template)}</div>
                            <div className="mt-2 truncate text-xs font-bold text-zinc-200">{template.name}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // ─── Page: Brand Hub ────────────────────────────────────────────────────────
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [brandKitName, setBrandKitName] = useState('');
  const [showNewKitForm, setShowNewKitForm] = useState(false);
  const [brandKitsLoading, setBrandKitsLoading] = useState(false);
  const [brandKitsLoaded, setBrandKitsLoaded] = useState(false);
  const [brandKitError, setBrandKitError] = useState('');
  const [creatingBrandKit, setCreatingBrandKit] = useState(false);
  const [activeKitTab, setActiveKitTab] = useState<'colors' | 'fonts' | 'logos'>('colors');
  const [newColor, setNewColor] = useState({ name: '', hex: '#8b5cf6' });
  const [newFont, setNewFont] = useState({ name: '', family: 'Outfit', weight: 'normal' });
  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);

  const readApiError = async (res: Response, fallback: string) => {
    const payload = await res.json().catch(() => null);
    if (Array.isArray(payload?.detail)) {
      return payload.detail.map((item: any) => item?.msg || item?.message || String(item)).join(', ');
    }
    return payload?.error || payload?.detail || fallback;
  };

  const fetchBrandKits = async () => {
    const token = getAuthToken();
    if (!token) {
      setBrandKits([]);
      setBrandKitsLoaded(true);
      setBrandKitError('Your current session is not backed by a valid backend token. Please log in again to manage brand kits.');
      return;
    }
    setBrandKitsLoading(true);
    setBrandKitError('');
    try {
      const res = await apiFetch('/api/brand-kits');
      if (res.ok) {
        const data = await res.json();
        setBrandKits(data.brand_kits || []);
      } else {
        throw new Error(await readApiError(res, `Failed to load brand kits (${res.status})`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load brand kits.';
      setBrandKitError(message);
      showNotification(message, 'error');
    } finally {
      setBrandKitsLoading(false);
      setBrandKitsLoaded(true);
    }
  };

  React.useEffect(() => {
    if (activePage === 'brand-hub') fetchBrandKits();
  }, [activePage]);

  const createBrandKit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const name = brandKitName.trim();
    if (!name) {
      setBrandKitError('Brand kit name is required.');
      showNotification('Brand kit name is required.', 'error');
      return;
    }
    if (creatingBrandKit) return;
    const token = getAuthToken();
    if (!token) {
      const message = 'Your current session is not backed by a valid backend token. Please log in again to create brand kits.';
      setBrandKitError(message);
      showNotification(message, 'error');
      return;
    }
    setCreatingBrandKit(true);
    setBrandKitError('');
    try {
      const res = await apiFetch('/api/brand-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Failed to create brand kit (${res.status})`));
      }
      const createdKit = await res.json();
      setBrandKits((current) => [createdKit, ...current.filter((kit) => kit.id !== createdKit.id)]);
      setBrandKitsLoaded(true);
      setBrandKitName('');
      setShowNewKitForm(false);
      showNotification('Brand kit created successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create brand kit.';
      setBrandKitError(message);
      showNotification(message, 'error');
    } finally {
      setCreatingBrandKit(false);
    }
  };

  const addColorToKit = async (kitId: string) => {
    if (!newColor.name.trim()) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await apiFetch(`/api/brand-kits/${kitId}/colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newColor.name.trim(), hex_value: newColor.hex })
      });
      if (res.ok) {
        setNewColor({ name: '', hex: '#8b5cf6' });
        fetchBrandKits();
      }
    } catch {
      return;
    }
  };

  const addFontToKit = async (kitId: string) => {
    if (!newFont.name.trim()) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await apiFetch(`/api/brand-kits/${kitId}/fonts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFont.name.trim(), family: newFont.family, weight: newFont.weight })
      });
      if (res.ok) {
        setNewFont({ name: '', family: 'Outfit', weight: 'normal' });
        fetchBrandKits();
      }
    } catch {
      return;
    }
  };

  const deleteKitItem = async (kitId: string, type: string, itemId: string) => {
    const token = getAuthToken();
    if (!token) return;
    try {
      await apiFetch(`/api/brand-kits/${kitId}/${type}/${itemId}`, {
        method: 'DELETE',
      });
      fetchBrandKits();
    } catch {
      return;
    }
  };

  const deleteBrandKit = async (kitId: string) => {
    const token = getAuthToken();
    if (!token) return;
    try {
      await apiFetch(`/api/brand-kits/${kitId}`, {
        method: 'DELETE',
      });
      if (selectedKitId === kitId) setSelectedKitId(null);
      fetchBrandKits();
    } catch {
      return;
    }
  };

  const selectedKit = brandKits.find((k: any) => k.id === selectedKitId);

  const renderBrandHub = () => (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Brand Hub</h2>
          <p className="mt-1 text-sm text-zinc-400">Manage your brand assets — logos, fonts, and colors — in one place.</p>
        </div>
        <button
          onClick={() => setShowNewKitForm(true)}
          className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/10 transition-all hover:from-violet-500 hover:to-fuchsia-500 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> New Brand Kit
        </button>
      </div>

      {/* New Kit Form */}
      {showNewKitForm && (
        <form onSubmit={createBrandKit} className="mb-6 flex items-end gap-3 rounded-2xl border border-violet-500/20 bg-zinc-950/50 p-5 backdrop-blur-sm">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Brand Kit Name</label>
            <input
              type="text"
              value={brandKitName}
              onChange={(e) => setBrandKitName(e.target.value)}
              placeholder="e.g. My Company Brand"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20"
              autoFocus
              disabled={creatingBrandKit}
            />
          </div>
          <button
            type="submit"
            disabled={creatingBrandKit || !brandKitName.trim()}
            className="rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingBrandKit ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => { setShowNewKitForm(false); setBrandKitName(''); setBrandKitError(''); }}
            disabled={creatingBrandKit}
            className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2 text-sm font-semibold text-zinc-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </form>
      )}

      {brandKitError && (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {brandKitError}
        </div>
      )}

      {/* Brand Kits List or Detail */}
      {!selectedKit ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {brandKitsLoading && !brandKitsLoaded ? (
            <div className="col-span-full rounded-3xl border border-zinc-800/80 bg-zinc-950/50 py-16 text-center text-zinc-500 backdrop-blur-sm">
              <p className="font-semibold text-zinc-200">Loading brand kits...</p>
              <p className="mt-1 text-xs text-zinc-400">Checking your saved brand assets.</p>
            </div>
          ) : brandKitsLoaded && brandKits.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-zinc-800/80 bg-zinc-950/50 py-16 text-center text-zinc-500 backdrop-blur-sm">
              <Palette className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-semibold text-zinc-200">No brand kits yet</p>
              <p className="mt-1 text-xs text-zinc-400">Create your first brand kit to get started</p>
            </div>
          ) : !brandKitsLoaded ? (
            <div className="col-span-full rounded-3xl border border-zinc-800/80 bg-zinc-950/50 py-16 text-center text-zinc-500 backdrop-blur-sm">
              <p className="font-semibold text-zinc-200">Open Brand Hub to load brand kits</p>
            </div>
          ) : (
            brandKits.map((kit: any) => (
              <div
                key={kit.id}
                onClick={() => { setSelectedKitId(kit.id); setActiveKitTab('colors'); }}
                className="cursor-pointer rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-5 transition-all hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold tracking-tight text-white">{kit.name}</h4>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteBrandKit(kit.id); }}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Color swatches preview */}
                {kit.colors && kit.colors.length > 0 && (
                  <div className="flex gap-1.5 mb-2">
                    {kit.colors.slice(0, 6).map((c: any) => (
                      <div key={c.id} className="w-6 h-6 rounded-md border border-zinc-700" style={{ backgroundColor: c.hex_value }} title={c.name} />
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-3 text-[10px] text-zinc-400">
                  <span>{kit.colors?.length || 0} colors</span>
                  <span>{kit.fonts?.length || 0} fonts</span>
                  <span>{kit.logos?.length || 0} logos</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Brand Kit Detail View */
        <div>
          <button onClick={() => setSelectedKitId(null)} className="mb-4 cursor-pointer text-sm text-violet-300 hover:text-violet-200">← Back to Brand Kits</button>
          <h3 className="mb-4 text-lg font-semibold tracking-tight text-white">{selectedKit.name}</h3>

          {/* Tabs */}
          <div className="mb-6 flex gap-2">
            {(['colors', 'fonts', 'logos'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveKitTab(tab)}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  activeKitTab === tab ? 'border border-violet-500/30 bg-violet-600/20 text-violet-300' : 'border border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Colors Tab */}
          {activeKitTab === 'colors' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-end gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-4">
                <input type="text" placeholder="Color name" value={newColor.name} onChange={(e) => setNewColor({ ...newColor, name: e.target.value })} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20" />
                <input type="color" value={newColor.hex} onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })} className="h-10 w-10 cursor-pointer rounded-xl border border-zinc-700 bg-transparent" />
                <input type="text" value={newColor.hex} onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })} className="w-24 rounded-xl border border-zinc-700 bg-zinc-950/80 px-2 py-2 text-center font-mono text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20" />
                <button onClick={() => addColorToKit(selectedKit.id)} className="rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/10 cursor-pointer">Add</button>
              </div>
              {selectedKit.colors?.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <div className="h-10 w-10 rounded-lg border border-zinc-700" style={{ backgroundColor: c.hex_value }} />
                  <span className="flex-1 text-xs font-semibold text-white">{c.name}</span>
                  <span className="font-mono text-[10px] text-zinc-400">{c.hex_value}</span>
                  <button onClick={() => deleteKitItem(selectedKit.id, 'colors', c.id)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Fonts Tab */}
          {activeKitTab === 'fonts' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-end gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-4">
                <input type="text" placeholder="Font name" value={newFont.name} onChange={(e) => setNewFont({ ...newFont, name: e.target.value })} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20" />
                <select value={newFont.family} onChange={(e) => setNewFont({ ...newFont, family: e.target.value })} className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-100 outline-none cursor-pointer">
                  {['Outfit', 'Inter', 'Arial', 'Georgia', 'Courier New', 'Times New Roman', 'Verdana', 'Helvetica', 'Roboto', 'Montserrat'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={newFont.weight} onChange={(e) => setNewFont({ ...newFont, weight: e.target.value })} className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-100 outline-none cursor-pointer">
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="lighter">Light</option>
                </select>
                <button onClick={() => addFontToKit(selectedKit.id)} className="rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/10 cursor-pointer">Add</button>
              </div>
              {selectedKit.fonts?.map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <Type className="w-5 h-5 text-violet-400" />
                  <span className="flex-1 text-xs font-semibold text-white">{f.name}</span>
                  <span className="text-[10px] text-zinc-400">{f.family} • {f.weight}</span>
                  <button onClick={() => deleteKitItem(selectedKit.id, 'fonts', f.id)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Logos Tab */}
          {activeKitTab === 'logos' && (
            <div className="flex flex-col gap-3">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-800 py-6 text-zinc-500 transition-colors hover:border-violet-500/50 hover:text-violet-300">
                <Upload className="w-5 h-5" />
                <span className="text-xs font-semibold">Upload Logo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                      const base64 = ev.target?.result as string;
                      const token = getAuthToken();
                      if (!token) return;
                      await apiFetch(`/api/brand-kits/${selectedKit.id}/logos`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: file.name, file_data: base64, file_type: file.type })
                      });
                      fetchBrandKits();
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {selectedKit.logos?.map((l: any) => (
                <div key={l.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-3">
                  <img src={l.file_data} alt={l.name} className="h-10 w-10 rounded-lg object-contain bg-white" />
                  <span className="flex-1 text-xs font-semibold text-white">{l.name}</span>
                  <button onClick={() => deleteKitItem(selectedKit.id, 'logos', l.id)} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  // ─── Page: Shared ───────────────────────────────────────────────────────────
  const [sharedDesigns, setSharedDesigns] = useState<any[]>([]);

  React.useEffect(() => {
    const fetchShared = async () => {
      const token = localStorage.getItem('teckstudio_auth_token');
      if (!token || token.startsWith('offline_')) return;
      try {
        const res = await apiFetch('/api/shared');
        if (res.ok) {
          const data = await res.json();
          setSharedDesigns(data.shares || []);
        }
      } catch {
        return;
      }
    };
    if (activePage === 'shared') fetchShared();
  }, [activePage]);

  const renderShared = () => (
    <>
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Shared with you</h2>
        <p className="text-zinc-400 text-sm">Designs that your team members have shared with you.</p>
      </div>
      {sharedDesigns.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No shared designs yet</p>
          <p className="text-xs mt-1">Share a design from the editor to see it here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sharedDesigns.map((share: any) => (
            <div key={share.id} className="group cursor-pointer" onClick={() => handleOpenDesign(share.project_id)}>
              <div className="aspect-video bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden relative group-hover:border-violet-500/50 transition-all mb-3">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-zinc-500/40" />
                </div>
              </div>
              <h4 className="font-semibold text-zinc-200 text-sm">{share.project_name}</h4>
              <p className="text-xs text-zinc-500 mt-0.5">Shared by {share.shared_by_name} · {share.access_level}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ─── Page: Trash ────────────────────────────────────────────────────────────
  const renderTrash = () => (
    <>
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Trash</h2>
        <p className="text-zinc-400 text-sm">Deleted designs are kept here for 30 days before being permanently removed.</p>
      </div>
      {trashError && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {trashError}
        </div>
      )}
      {trashLoading ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-8 text-sm text-zinc-400">
          Loading deleted designs...
        </div>
      ) : trashedDesigns.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">Trash is empty</p>
          <p className="text-xs mt-1">Deleted designs will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {trashedDesigns.map((item) => (
            <div key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="mb-4 flex aspect-video items-center justify-center rounded-xl border border-zinc-800 bg-gradient-to-br from-rose-500/20 to-zinc-950">
                <Trash2 className="h-8 w-8 text-rose-300/70" />
              </div>
              <h4 className="truncate text-sm font-semibold text-zinc-100">{item.name}</h4>
              <p className="mt-1 text-xs text-zinc-500">Deleted {formatRelativeDate(item.deletedAt)}</p>
              <p className="mt-1 text-[10px] text-zinc-600">{item.width || 800} × {item.height || 800}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRestoreDesign(item.id)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Permanently delete this design? This cannot be undone.')) {
                      handlePermanentDelete(item.id);
                    }
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ─── Page Router ────────────────────────────────────────────────────────────
  const renderPage = () => {
    switch (activePage) {
      case 'home': return renderHome();
      case 'projects': return renderProjects();
      case 'templates': return renderTemplates();
      case 'brand-hub': return renderBrandHub();
      case 'shared': return renderShared();
      case 'trash': return renderTrash();
      default: return renderHome();
    }
  };

  const pageTitle = () => {
    switch (activePage) {
      case 'home': return 'Home';
      case 'projects': return 'Projects';
      case 'templates': return 'Templates';
      case 'brand-hub': return 'Brand Hub';
      case 'shared': return 'Shared';
      case 'trash': return 'Trash';
      default: return 'Home';
    }
  };

  return (
    <div className="h-screen w-screen flex bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      {/* ─── Notification Toast ──────────────────────────────────────────────── */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold transition-all ${
          notification.type === 'success'
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'bg-red-500/20 text-red-300 border border-red-500/30'
        }`}>
          {notification.msg}
        </div>
      )}

      {showCreateDesignModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Create design" className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl shadow-black/40">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Create Design</h2>
                <p className="mt-1 text-sm text-zinc-400">Choose a preset or enter a custom canvas size.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateDesignModal(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:text-white"
                aria-label="Close create design"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CREATE_DESIGN_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => createPresetDesign(preset)}
                  className="group flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition-all hover:border-violet-500/50"
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${preset.accent}`}>
                    <Image className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">{preset.name}</h3>
                    <p className="text-xs text-zinc-500">{preset.width} × {preset.height}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">{preset.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-200">Custom Size</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="number"
                  min={100}
                  value={customDesignSize.width}
                  onChange={(event) => setCustomDesignSize((current) => ({ ...current, width: Number(event.target.value) || 800 }))}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 sm:w-32"
                  aria-label="Custom width"
                />
                <span className="hidden text-zinc-500 sm:block">×</span>
                <input
                  type="number"
                  min={100}
                  value={customDesignSize.height}
                  onChange={(event) => setCustomDesignSize((current) => ({ ...current, height: Number(event.target.value) || 800 }))}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 sm:w-32"
                  aria-label="Custom height"
                />
                <button
                  type="button"
                  onClick={createCustomDesign}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
                >
                  Create Custom
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-zinc-800 bg-[#121214] flex flex-col shrink-0">
        <div className="p-6 pb-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-500 bg-clip-text text-transparent tracking-wide">
            ✦ TECKSTUDIO
          </h1>
        </div>

        <div className="px-4 pb-4">
          <button 
            onClick={openCreateDesignFlow}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-lg font-semibold transition-all cursor-pointer shadow-lg shadow-violet-600/10 hover:shadow-violet-600/20"
          >
            <Plus className="w-5 h-5" />
            Create a design
          </button>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button 
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all cursor-pointer text-sm ${
                  isActive 
                    ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20' 
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-violet-400' : ''}`} />
                {item.label}
              </button>
            );
          })}
          
          <div className="my-3 border-t border-zinc-800/60" />
          
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button 
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all cursor-pointer text-sm ${
                  isActive 
                    ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20' 
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-violet-400' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User avatar at the bottom with logout */}
        <div className="p-4 border-t border-zinc-800/60 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center font-bold text-sm text-white shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-200 truncate">{user.name}</p>
                <p className="text-[10px] text-zinc-500">Pro Creator</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="text-[10px] bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/80 hover:text-zinc-200 text-zinc-400 font-bold px-2 py-1 rounded cursor-pointer transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header / Search */}
        <header className="h-16 border-b border-zinc-800 px-8 flex items-center justify-between shrink-0 bg-[#09090b]/80 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            {activePage !== 'home' && (
              <button 
                onClick={() => setActivePage('home')} 
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Back to Home"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-sm font-bold text-zinc-300">{pageTitle()}</span>
          </div>
          <div className="relative w-full max-w-md mx-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search designs, templates..." 
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full py-2 pl-10 pr-4 text-sm text-zinc-200 outline-none focus:border-violet-500/50 focus:bg-zinc-800/50 transition-colors placeholder:text-zinc-600"
            />
          </div>
          <div className="shrink-0" />
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8 lg:p-10">
          {renderPage()}
        </div>
      </main>
    </div>
  );
};
