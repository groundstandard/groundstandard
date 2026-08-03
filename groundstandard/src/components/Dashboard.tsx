import { useState, useMemo, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { Search, FileText, Clock, CheckCircle, RefreshCw, AlertCircle, X, Send, Plus, Filter, Eye, Edit3, Loader2, Sparkles, ArrowUp, Trash, UserCircle, LogOut, ArrowLeft } from 'lucide-react';
import ChatWidget from './ChatWidget';
import { useResearchData } from '../hooks/useResearchData';
import type { ResearchArticle } from '../lib/supabase';
import { supabase } from '../lib/supabase';

type DashboardProps = {
  onBackToLaunch?: () => void;
};

export default function Dashboard({ onBackToLaunch }: DashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { articles, totalCount, loading, error, refetch } = useResearchData({
    page: currentPage,
    pageSize: itemsPerPage,
    searchTerm,
    statusFilter
  });
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
//fdsafa
  // Back-to-top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusOptions = useMemo(() => (
    [
      { value: 'all', label: 'All Statuses' },
      { value: 'new', label: 'New' },
      { value: 'writing', label: 'Writing' },
      { value: 'Used', label: 'Completed' },
      { value: 'processing', label: 'Processing' },
    ]
  ), []);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!statusDropdownOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = statusDropdownRef.current;
      const target = e.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) setStatusDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [statusDropdownOpen]);
  // Modal state for sending a Keyword to webhook
  const [showAddModal, setShowAddModal] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [bizName, setBizName] = useState('');
  const [city, setCity] = useState('');
  const [provState, setProvState] = useState('');
  const [callToAction, setCallToAction] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [keywordCount, setKeywordCount] = useState<string>('1');
  // Modal state to view article content
  const [showContentModal, setShowContentModal] = useState(false);
  const [contentToShow, setContentToShow] = useState<string>('');
  const [contentTitle, setContentTitle] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<Array<number | string>>([]);
  const [deleteTargetTitle, setDeleteTargetTitle] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileRow, setProfileRow] = useState<{
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
    created_at: string;
    updated_at: string;
  } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // Chat widget moved to its own component (ChatWidget)
  const isBusy = sending;

  const isLikelyHtml = useCallback((value: string) => {
    const v = (value ?? '').trim();
    if (!v) return false;
    return /<\/?[a-z][\s\S]*>/i.test(v);
  }, []);
  // Track which rows are in the process of sending a Write request
  const [writingIds, setWritingIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('gs_writing_ids_v1');
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch { return new Set(); }
  });
  // Track which rows are sending a Rewrite request
  const [rewritingIds, setRewritingIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('gs_rewriting_ids_v1');
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch { return new Set(); }
  });
  const [generalizingIds, setGeneralizingIds] = useState<Set<string>>(() => new Set());
  type GeneralizingMeta = { id?: number | string; title?: string; startedAt?: number };
  const [generalizingMeta, setGeneralizingMeta] = useState<Record<string, GeneralizingMeta>>(() => ({}));
  // Track rows being deleted dfas
  const [deletingIds, setDeletingIds] = useState<Set<string | number>>(new Set());

  const openAccountModal = useCallback(async () => {
    setShowAccountModal(true);
    setProfileLoading(true);
    setProfileError(null);
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    setIsEditingProfile(false);
    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_profile_get');
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : null;
      setProfileRow(row ?? null);
      setEditFullName((row?.full_name ?? '') as string);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load profile';
      setProfileError(msg);
      setProfileRow(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async () => {
    if (!profileRow) return;
    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_profile_update', {
        p_full_name: editFullName.trim() || null,
        p_avatar_url: null,
      });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : null;
      setProfileRow(row ?? profileRow);
      setEditFullName(((row?.full_name ?? editFullName) as string) ?? '');
      setIsEditingProfile(false);
      setProfileSaveSuccess('Profile updated successfully.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update profile';
      setProfileSaveError(msg);
    } finally {
      setProfileSaving(false);
    }
  }, [editFullName, profileRow]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);
  // Modal state for selecting word limit for Write
  const [showWriteModal, setShowWriteModal] = useState(false);
  const [articleToWrite, setArticleToWrite] = useState<ResearchArticle | null>(null);
  const [wordLimit, setWordLimit] = useState<number>(1000);
  // Modal state for Rewrite prompt
  const [showRewriteModal, setShowRewriteModal] = useState(false);
  const [articleToRewrite, setArticleToRewrite] = useState<ResearchArticle | null>(null);
  const [rewriteInstructions, setRewriteInstructions] = useState<string>('');
  const rewriteModelOptions = useMemo(() => (
    [
      'openai/gpt-5.2-instant',
      'openai/gpt-5.2-thinking',
      'openai/gpt-5.2-pro',
      'openai/gpt-4.1',
      'openai/gpt-4.1-mini',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',

      'anthropic/claude-3-haiku',
      'anthropic/claude-3-opus',
      'anthropic/claude-3.5-haiku',
      'anthropic/claude-3.5-haiku-20241022',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3.7-sonnet:thinking',
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-4',
      'anthropic/claude-sonnet-4.5',
      'anthropic/claude-opus-4',
      'anthropic/claude-opus-4.1',
      'anthropic/claude-opus-4.5',

      'google/gemini-2.0-flash-001',
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-2.0-flash-lite-001',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-flash-image',
      'google/gemini-2.5-flash-image-preview',
      'google/gemini-2.5-flash-lite',
      'google/gemini-2.5-flash-lite-preview-09-2025',
      'google/gemini-2.5-flash-preview-09-2025',
      'google/gemini-2.5-pro',
      'google/gemini-2.5-pro-preview',
      'google/gemini-2.5-pro-preview-05-06',
      'google/gemini-3-flash-preview',
      'google/gemini-3-pro-preview',
      'google/gemini-3-pro-image-preview',

      'x-ai/grok-3',
      'x-ai/grok-3-beta',
      'x-ai/grok-3-mini',
      'x-ai/grok-3-mini-beta',
      'x-ai/grok-4',
      'x-ai/grok-4-fast',
      'x-ai/grok-4.1-fast',
      'x-ai/grok-code-fast-1',

      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct',
      'meta-llama/llama-3-70b-instruct',
      'meta-llama/llama-3-8b-instruct',
      'meta-llama/llama-4-scout',
      'meta-llama/llama-4-maverick',

      'mistralai/mistral-large',
      'mistralai/mistral-large-latest',
      'mistralai/mixtral-8x7b-instruct',
      'mistralai/mixtral-8x22b-instruct',

      'amazon/nova-lite-v1',
      'amazon/nova-micro-v1',

      'allenai/olmo-3-32b-think:free',
      'allenai/olmo-2-0325-32b-instruct',

      'alpindale/goliath-120b',
      'deepseek/v3',
      'zephyr/v1',
      'toppy/v1',
    ]
  ), []);
  const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';
  const defaultModel = useMemo(
    () => (rewriteModelOptions.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (rewriteModelOptions[0] || '')),
    [rewriteModelOptions]
  );
  const [rewriteModel, setRewriteModel] = useState<string>(defaultModel);
  const [rewriteModelOpen, setRewriteModelOpen] = useState(false);
  const [rewriteModelQuery, setRewriteModelQuery] = useState('');
  const rewriteModelDropdownRef = useRef<HTMLDivElement | null>(null);
  const [rewriteModalNotice, setRewriteModalNotice] = useState<string | null>(null);

  const cleanErrorMessage = (rawMsg: string): string => {
    // Remove technical JSON syntax and make user-friendly
    let cleaned = rawMsg
      .replace(/^\[?\s*\{\s*"[Ff]ailed"\s*:\s*"?/, '')
      .replace(/"\s*\}\s*\]?$/, '')
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // If it's still too technical, provide a generic friendly message
    if (cleaned.includes('{') || cleaned.includes('}') || cleaned.includes('"') || cleaned.length > 200) {
      cleaned = 'OpenAI has run out of balance. Please top up your OpenAI account.';
    }
    
    return cleaned;
  };

  const writeModelOptions = rewriteModelOptions;
  const [writeModel, setWriteModel] = useState<string>(defaultModel);
  const [writeModelOpen, setWriteModelOpen] = useState(false);
  const [writeModelQuery, setWriteModelQuery] = useState('');
  const writeModelDropdownRef = useRef<HTMLDivElement | null>(null);
  const [writeModalNotice, setWriteModalNotice] = useState<string | null>(null);
  // Optional instructions for Write
  const [writeInstructions, setWriteInstructions] = useState<string>('');
  // Additional keywords for Write (array of keyword strings) and per-keyword mention range derived from word limit
  const [extraKeywords, setExtraKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const mentionRange = useMemo(() => {
    const map: Record<number, { min: number; max: number }> = {
      500: { min: 2, max: 3 },
      1000: { min: 2, max: 3 },
      1500: { min: 3, max: 4 },
      2000: { min: 5, max: 6 },
      2500: { min: 6, max: 7 },
      3000: { min: 7, max: 9 },
    };

    return map[wordLimit] || { min: 2, max: 3 };
  }, [wordLimit]);

  const maxKeywords = useMemo(() => {
    const map: Record<number, number> = {
      500: 0,
      1000: 2,
      1500: 3,
      2000: 5,
      2500: 6,
      3000: 8,
    };
    return map[wordLimit] || 0;
  }, [wordLimit]);

  // Open modal to ask for rewrite prompt
  const handleOpenRewriteModal = (article: ResearchArticle, instructions?: string, model?: string) => {
    if (!article) return;
    setArticleToRewrite(article);
    setRewriteInstructions(instructions || '');
    setRewriteModel(model || defaultModel);
    setRewriteModelQuery('');
    setRewriteModelOpen(false);
    setRewriteModalNotice(null);
    setShowRewriteModal(true);
  };

  useEffect(() => {
    if (!rewriteModelOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rewriteModelDropdownRef.current;
      const target = e.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) setRewriteModelOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [rewriteModelOpen]);

  useEffect(() => {
    if (!writeModelOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = writeModelDropdownRef.current;
      const target = e.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) setWriteModelOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [writeModelOpen]);

  // Keep writeModalNotice persistent until user changes context (no auto-hide)

  // Confirm rewrite with user-provided instructions
  const handleConfirmRewrite = async () => {
    if (!articleToRewrite) return;
    const a = articleToRewrite;
    // Mark as rewriting immediately so the row button shows spinner
    const idKey = String(a.id ?? '');
    const titleKey = String(a.title ?? '');
    const startedAt = Date.now();
    const prevDocLink = (a).doc_link ?? null;
    const prevContent = (a).content ?? null;
    setRewritingIds(prev => {
      const next = new Set(prev);
      if (idKey) next.add(idKey);
      if (titleKey) next.add(titleKey);
      return next;
    });
    try { setRewritingMeta(prev => ({
      ...prev,
      ...(idKey ? { [idKey]: { id: a.id as number | string | undefined, title: a.title, startedAt, prevDocLink, prevContent } } : {}),
      ...(titleKey ? { [titleKey]: { id: a.id as number | string | undefined, title: a.title, startedAt, prevDocLink, prevContent } } : {}),
    })); } catch { void 0; }
    // Close modal right away
    setShowRewriteModal(false);
    setArticleToRewrite(null);
    const instr = rewriteInstructions.trim() || undefined;
    setRewriteInstructions('');
    setToast('Started rewriting this article');
    await handleRewriteForArticle(a, instr, rewriteModel);
  };

  // Optimistic placeholder rows inserted immediately after sending a keyword
  type OptimisticArticle = {
    id: string; // temp id
    title: string;
    keyword: string;
    doc_link: string | null;
    content?: string | null;
    status: string;
    _temp: true;
    createdTs: number;
  };

  // State for optimistic placeholders and persistence/polling hooks
  const [optimisticRows, setOptimisticRows] = useState<OptimisticArticle[]>([]);
  const STORAGE_KEY = 'gs_optimistic_rows_v1';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OptimisticArticle[] | null;
      if (!parsed || !Array.isArray(parsed)) return;
      const now = Date.now();
      const maxAgeMs = 2 * 60 * 60 * 1000; // keep at most 2 hours old placeholders
      const restored = parsed.filter(r => r && r._temp === true && typeof r.createdTs === 'number' && (now - r.createdTs) <= maxAgeMs);
      if (restored.length > 0) {
        setOptimisticRows(prev => (prev.length > 0 ? prev : restored));
      }
    } catch {
      // ignore storage errors
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(optimisticRows));
    } catch (e) { void e; }
  }, [optimisticRows]);
  // Auto-polling disabled to avoid auto refresh; user uses Refresh button

  // Persist in-flight write/rewrite across reloads
  const WRITING_STORAGE_KEY = 'gs_writing_ids_v1';
  const REWRITING_STORAGE_KEY = 'gs_rewriting_ids_v1';
  const WRITING_META_KEY = 'gs_writing_meta_v1';
  type WritingMeta = { id: number | string | undefined; title: string; keyword: string; startedAt?: number };
  const [writingMeta, setWritingMeta] = useState<Record<string, WritingMeta>>(() => {
    try {
      const raw = localStorage.getItem('gs_writing_meta_v1');
      const obj = raw ? JSON.parse(raw) as Record<string, WritingMeta> : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  });
  // Already hydrated synchronously above; keep effects to persist changes only
  useEffect(() => {
    try { localStorage.setItem(WRITING_STORAGE_KEY, JSON.stringify(Array.from(writingIds))); } catch (e) { void e; }
  }, [writingIds]);
  useEffect(() => {
    try { localStorage.setItem(REWRITING_STORAGE_KEY, JSON.stringify(Array.from(rewritingIds))); } catch (e) { void e; }
  }, [rewritingIds]);
  useEffect(() => {
    try { localStorage.setItem(WRITING_META_KEY, JSON.stringify(writingMeta)); } catch (e) { void e; }
  }, [writingMeta]);

  // Rewriting meta (startedAt) for keeping the row spinner until completion or timeout
  const REWRITING_META_KEY = 'gs_rewriting_meta_v1';
  type RewritingMeta = { id?: number | string; title?: string; startedAt?: number; prevDocLink?: string | null; prevContent?: string | null };
  const [rewritingMeta, setRewritingMeta] = useState<Record<string, RewritingMeta>>(() => {
    try {
      const raw = localStorage.getItem(REWRITING_META_KEY);
      const obj = raw ? JSON.parse(raw) as Record<string, RewritingMeta> : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(REWRITING_META_KEY, JSON.stringify(rewritingMeta)); } catch (e) { void e; }
  }, [rewritingMeta]);

  // Per-row tags persisted locally
  type RowTag = { name: string; color: string } | string; // keep backward compatibility for legacy string-only tags
  const TAGS_STORAGE_KEY = 'gs_article_tags_v1';
  const [tagsById, setTagsById] = useState<Record<string, RowTag[]>>(() => {
    try {
      const raw = localStorage.getItem(TAGS_STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) as Record<string, RowTag[]> : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tagsById)); } catch (e) { void e; }
  }, [tagsById]);

  // Tag Modal state
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#2563eb');
  type TagRow = { id: number; created_at: string; tag: string; color: string };
  const [tagRows, setTagRows] = useState<TagRow[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [openTagMenuKey, setOpenTagMenuKey] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('#2563eb');
  const [savingTagId, setSavingTagId] = useState<number | null>(null);
  const [deletingTagId, setDeletingTagId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>('');

  const fetchTags = useCallback(async () => {
    try {
      setTagLoading(true);
      setTagError(null);
      const { data, error } = await supabase.rpc('rpc_tag_list');
      if (error) throw error;
      const rows = (data as TagRow[]) || [];
      setTagRows(rows);
      // Reconcile: drop any local row tags that no longer exist in Supabase
      const validNames = new Set(rows.map(r => (r.tag || '').trim()));
      setTagsById(prev => {
        const out: Record<string, RowTag[]> = {};
        for (const [k, arr] of Object.entries(prev || {})) {
          const cur = Array.isArray(arr) ? arr : [];
          const next = cur.filter(t => {
            const name = typeof t === 'string' ? t : t.name;
            return validNames.has((name || '').trim());
          });
          out[k] = next;
        }
        return out;
      });
    } catch (e) {
      console.error('Failed to load tags', e);
      setTagError(e instanceof Error ? e.message : 'Failed to load tags');
    } finally {
      setTagLoading(false);
    }
  }, []);

  useEffect(() => { if (showTagModal) { fetchTags(); } }, [showTagModal, fetchTags]);
  // Close per-row tag dropdown when clicking outside
  useEffect(() => {
    const onDocClick = () => setOpenTagMenuKey(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const applyTagToRow = (rowKey: string, tr: TagRow) => {
    const safeKey = String(rowKey || '').trim();
    if (!safeKey) return;
    setTagsById(prev => {
      const cur = Array.isArray(prev[safeKey]) ? prev[safeKey] as RowTag[] : [];
      const exists = cur.some(t => (typeof t === 'string' ? t === tr.tag : t.name === tr.tag));
      if (exists) return prev;
      return { ...prev, [safeKey]: [...cur, { name: tr.tag, color: tr.color }] };
    });
    setOpenTagMenuKey(null);
  };

  const beginEditTag = (row: TagRow) => {
    setEditingTagId(row.id);
    setEditTagName(row.tag);
    setEditTagColor(row.color || '#2563eb');
  };

  const cancelEditTag = () => {
    setEditingTagId(null);
    setEditTagName('');
    setEditTagColor('#2563eb');
  };

  const saveEditTag = async () => {
    if (editingTagId == null) return;
    const name = editTagName.trim();
    const color = editTagColor.trim() || '#2563eb';
    if (!name) return;
    setSavingTagId(editingTagId);
    try {
      const { error } = await supabase.rpc('rpc_tag_update', {
        p_id: Number(editingTagId),
        p_tag: name,
        p_color: color,
      });
      if (error) throw error;
      await fetchTags();
      cancelEditTag();
    } catch (e) {
      console.error('Update tag failed', e);
      window.alert(e instanceof Error ? e.message : 'Failed to update tag');
    } finally {
      setSavingTagId(null);
    }
  };

  const isDeleteModalDeleting = deleteTargetIds.some((id) => deletingIds.has(id));

  const deleteTag = useCallback(async (id: number, name?: string) => {
    setDeletingTagId(id);
    try {
      const { error } = await supabase.rpc('rpc_tag_delete', {
        p_id: Number(id),
      });
      if (error) throw error;
      await fetchTags();
      // Prune this tag from all rows locally if name is provided
      if (name && name.trim()) {
        const delName = name.trim();
        setTagsById(prev => {
          const out: Record<string, RowTag[]> = {};
          for (const [k, arr] of Object.entries(prev || {})) {
            const cur = Array.isArray(arr) ? arr : [];
            out[k] = cur.filter(t => (typeof t === 'string' ? t !== delName : t.name !== delName));
          }
          return out;
        });
      }
      setConfirmDeleteId(null);
    } catch (e) {
      console.error('Delete tag failed', e);
      window.alert(e instanceof Error ? e.message : 'Failed to delete tag');
    } finally {
      setDeletingTagId(null);
    }
  }, [fetchTags]);

  // Temporary: touch variables used in JSX to satisfy lints in some IDE states
  useEffect(() => { void deletingTagId; void confirmDeleteId; void deleteTag; }, [deletingTagId, confirmDeleteId, deleteTag]);

  // Prune stale writing ids (older than 2h without a matching DB row)
  useEffect(() => {
    if (writingIds.size === 0) return;
    const now = Date.now();
    const maxAgeMs = 2 * 60 * 60 * 1000;
    const list = articles || [];
    const restored = Array.from(writingIds).filter(k => !!writingMeta[k]); // only keep ids we have meta for
    const next = new Set<string>();
    for (const key of restored) {
      const existsInDb = list.some(a => String((a).id ?? (a).title) === key);
      const meta = writingMeta[key];
      const fresh = meta && typeof meta.startedAt === 'number' && (now - meta.startedAt) <= maxAgeMs;
      if (existsInDb || fresh) next.add(key);
    }
    if (next.size !== writingIds.size) setWritingIds(next);
  }, [articles, writingIds, writingMeta]);

  // Prune stale rewriting ids (older than 2h) based on startedAt
  useEffect(() => {
    if (rewritingIds.size === 0) return;
    const now = Date.now();
    const maxAgeMs = 2 * 60 * 60 * 1000;
    const restored = Array.from(rewritingIds).filter(k => !!rewritingMeta[k]);
    const next = new Set<string>();
    for (const key of restored) {
      const meta = rewritingMeta[key];
      const fresh = meta && typeof meta.startedAt === 'number' && (now - meta.startedAt) <= maxAgeMs;
      if (fresh) next.add(key);
    }
    if (next.size !== rewritingIds.size) setRewritingIds(next);
  }, [rewritingIds, rewritingMeta]);

  useEffect(() => {
    if (!articles) return;
    if (writingIds.size === 0 && rewritingIds.size === 0) return;
    const nextWriting = new Set(writingIds);
    const nextRewriting = new Set(rewritingIds);
    for (const a of articles) {
      const idKey = String((a).id ?? '');
      const titleKey = String((a).title ?? '');
      const docLink = String((a).doc_link ?? '').trim();
      const content = String((a).content ?? '').trim();
      const status = String((a).status ?? '').trim();
      const isCompleted = !!docLink || !!content || (status && status.toLowerCase() !== 'new') || docLink.toUpperCase() === 'EMPTY';
      if (isCompleted) {
        if (nextWriting.has(idKey)) { nextWriting.delete(idKey); }
        if (nextWriting.has(titleKey)) { nextWriting.delete(titleKey); }
        setWritingMeta(prev => { const n = { ...prev }; delete n[idKey]; delete n[titleKey]; return n; });
        // Do not auto-clear rewritingIds here; keeping spinner until backend finishes or timeout
      }
      // If we have a rewriting meta snapshot and either doc_link or content changed from previous, clear rewriting
      const keys = [idKey, titleKey].filter(Boolean);
      for (const k of keys) {
        if (nextRewriting.has(k) && rewritingMeta[k]) {
          const prevDoc = String(rewritingMeta[k].prevDocLink ?? '').trim();
          const prevCon = String(rewritingMeta[k].prevContent ?? '').trim();
          if ((prevDoc && docLink && docLink !== prevDoc) || (prevCon && content && content !== prevCon) || (!prevCon && !!content) || (!prevDoc && !!docLink)) {
            nextRewriting.delete(k);
            setRewritingMeta(prev => { const n = { ...prev }; delete n[k]; return n; });
            setToast('Rewrite completed');
            setTimeout(() => setToast(null), 3500);
          }
        }
      }
    }
    if (nextWriting.size !== writingIds.size) setWritingIds(nextWriting);
    if (nextRewriting.size !== rewritingIds.size) setRewritingIds(nextRewriting);
  }, [articles, writingIds, rewritingIds, rewritingMeta]);

  // Copy full content from the View Content Modal
  const handleCopyContent = async () => {
    try {
      const raw = String(contentToShow ?? '');
      const text = (() => {
        if (!isLikelyHtml(raw)) return raw.trim();
        const pre = raw
          .replace(/<br\s*\/?>(?=\s*\n?)/gi, '\n')
          .replace(/<\/(p|div)>/gi, '\n\n')
          .replace(/<\/(h[1-6])>/gi, '\n\n')
          .replace(/<li[^>]*>/gi, '• ')
          .replace(/<\/(li)>/gi, '\n')
          .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
          .replace(/&nbsp;/gi, ' ')
          .replace(/<[^>]+>/g, '');
        return (() => { const ta = document.createElement('textarea'); ta.innerHTML = pre; return ta.value; })()
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      })();
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  // Send rewrite request directly to the provided webhook (optionally include instructions)
  const handleRewriteForArticle = async (article: ResearchArticle, instructions?: string, model?: string) => {
    if (!article) return;
    const idKey = String(article.id ?? '');
    const titleKey = String(article.title ?? '');
    setRewritingIds(prev => {
      const next = new Set(prev);
      if (idKey) next.add(idKey);
      if (titleKey) next.add(titleKey);
      return next;
    });
    const startedAt = Date.now();
    const prevDocLink = (article).doc_link ?? null;
    const prevContent = (article).content ?? null;
    setRewritingMeta(prev => ({
      ...prev,
      ...(idKey ? { [idKey]: { id: article.id as number | string | undefined, title: article.title, startedAt, prevDocLink, prevContent } } : {}),
      ...(titleKey ? { [titleKey]: { id: article.id as number | string | undefined, title: article.title, startedAt, prevDocLink, prevContent } } : {}),
    }));
    try {
      const resp = await fetch('https://groundstandard.app.n8n.cloud/webhook/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: article.id,
          title: article.title,
          keyword: article.keyword,
          doc_link: article.doc_link ?? null,
          content: (article as unknown as { content?: string }).content ?? null,
          status: (article as unknown as { status?: string }).status ?? undefined,
          word_limit: 1000,
          additional_keywords: [],
          mentions_per_keyword: { min: 2, max: 3 },
          action: 'rewrite',
          source: 'dashboard-rewrite',
          instructions: instructions || undefined,
          model: model || undefined,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        const t = txt.toLowerCase();
        if (
          t.includes('insufficient') || t.includes('quota') || t.includes('balance') ||
          t.includes('billing') || t.includes('capacity') || t.includes('limit') ||
          t.includes('rate limit') || t.includes('insufficient_quota')
        ) {
          setAiWarning('OpenAI has run out of balance. Please top up your OpenAI account.');
        }
        throw new Error(`Rewrite webhook error: ${resp.status} ${txt}`);
      }
      // Check for failure messages in response body even if HTTP 200
      const okBodyText = await resp.text();
      if (okBodyText && okBodyText.trim()) {
        try {
          const getFailed = (obj: unknown): string => {
            if (!obj || typeof obj !== 'object') return '';
            const rec = obj as Record<string, unknown>;
            const keys = ['Failed', 'failed', 'FAILURE', 'error'];
            for (const k of keys) {
              const v = rec[k];
              if (typeof v === 'string') return v;
            }
            return '';
          };
          const json = JSON.parse(okBodyText) as unknown;
          let failedMsg = '';
          if (Array.isArray(json)) {
            failedMsg = getFailed(json[0]);
          } else {
            failedMsg = getFailed(json);
          }
          if (failedMsg) {
            const f = failedMsg.toLowerCase();
            if (
              f.includes('insufficient') || f.includes('quota') || f.includes('balance') ||
              f.includes('billing') || f.includes('capacity') || f.includes('limit') ||
              f.includes('rate limit') || f.includes('insufficient_quota')
            ) {
              setAiWarning('OpenAI has run out of balance. Please top up your OpenAI account.');
            }
            throw new Error(failedMsg);
          }
        } catch {
          const txt = okBodyText.toLowerCase();
          if (txt.includes('"failed"') || txt.startsWith('failed') || txt.includes('failed:')) {
            throw new Error(okBodyText);
          }
        }
      }
      // Auto refresh and polling disabled per user request
      // User will manually click Refresh to see updated content
    } catch (err) {
      console.error(err);
      // Clear loading state on error
      setRewritingIds(prev => {
        const next = new Set(prev);
        if (idKey) next.delete(idKey);
        if (titleKey) next.delete(titleKey);
        return next;
      });
      setRewritingMeta(prev => { const n = { ...prev }; if (idKey) delete n[idKey]; if (titleKey) delete n[titleKey]; return n; });
      // Show error notice and reopen modal with previous selections
      const msg = err instanceof Error ? err.message : 'Failed to send rewrite request';
      const m = msg.toLowerCase();
      if (
        m.includes('insufficient') || m.includes('quota') || m.includes('balance') ||
        m.includes('billing') || m.includes('capacity') || m.includes('limit') ||
        m.includes('rate limit') || m.includes('insufficient_quota')
      ) {
        setAiWarning('OpenAI has run out of balance. Please top up your OpenAI account.');
      }
      const formSnapshot = {
        instructions: instructions || '',
        model: model || defaultModel,
      };
      setArticleToRewrite(article);
      setRewriteInstructions(formSnapshot.instructions);
      setRewriteModel(formSnapshot.model);
      setRewriteModelQuery('');
      setRewriteModelOpen(false);
      setRewriteModalNotice(msg);
      setShowRewriteModal(true);
      // On error, clear pending state for this row
    } finally {
      // Do not clear rewritingIds here; we'll clear it when the article status updates
      // and our effect detects completion. This keeps the row button in loading state
      // until the workflow actually finishes.
    }
  };

  const handleGeneralizeForArticle = async (article: ResearchArticle) => {
    if (!article) return;
    const idKey = String(article.id ?? '');
    const titleKey = String(article.title ?? '');
    const startedAt = Date.now();
    setGeneralizingIds(prev => {
      const next = new Set(prev);
      if (idKey) next.add(idKey);
      if (titleKey) next.add(titleKey);
      return next;
    });
    try {
      setGeneralizingMeta(prev => ({
        ...prev,
        ...(idKey ? { [idKey]: { id: article.id as number | string | undefined, title: article.title, startedAt } } : {}),
        ...(titleKey ? { [titleKey]: { id: article.id as number | string | undefined, title: article.title, startedAt } } : {}),
      }));
    } catch { void 0; }
    try {
      const resp = await fetch('https://groundstandard.app.n8n.cloud/webhook/generalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: article.id,
          title: article.title,
          keyword: article.keyword,
          business_name: (article as unknown as { business_name?: string | null }).business_name ?? null,
          doc_link: article.doc_link ?? null,
          content: (article as unknown as { content?: string | null }).content ?? null,
          status: (article as unknown as { status?: string }).status ?? undefined,
          action: 'generalize',
          source: 'dashboard-generalize',
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Generalize webhook error: ${resp.status} ${txt}`);
      }
      const okBodyText = await resp.text();
      if (okBodyText && okBodyText.trim()) {
        try {
          const getFailed = (obj: unknown): string => {
            if (!obj || typeof obj !== 'object') return '';
            const rec = obj as Record<string, unknown>;
            const keys = ['Failed', 'failed', 'FAILURE', 'error'];
            for (const k of keys) {
              const v = rec[k];
              if (typeof v === 'string') return v;
            }
            return '';
          };
          const json = JSON.parse(okBodyText) as unknown;
          let failedMsg = '';
          if (Array.isArray(json)) {
            failedMsg = getFailed(json[0]);
          } else {
            failedMsg = getFailed(json);
          }
          if (failedMsg) throw new Error(failedMsg);
        } catch {
          const txt = okBodyText.toLowerCase();
          if (txt.includes('"failed"') || txt.startsWith('failed') || txt.includes('failed:')) {
            throw new Error(okBodyText);
          }
        }
      }
      setToast('Generalize started');
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to send generalize request';
      window.alert(msg);
      // On error, clear loading state for this row
      setGeneralizingIds(prev => {
        const next = new Set(prev);
        if (idKey) next.delete(idKey);
        if (titleKey) next.delete(titleKey);
        return next;
      });
      setGeneralizingMeta(prev => { const n = { ...prev }; if (idKey) delete n[idKey]; if (titleKey) delete n[titleKey]; return n; });
    }
  };

  // Clear generalize loading when the `generalize` column is populated (real-time) or after timeout
  useEffect(() => {
    if (generalizingIds.size === 0) return;
    const now = Date.now();
    const maxAgeMs = 10 * 60 * 1000;
    const next = new Set(generalizingIds);
    for (const a of (articles || [])) {
      const idKey = String((a as ResearchArticle).id ?? '');
      const titleKey = String((a as ResearchArticle).title ?? '');
      const generic = String((a as ResearchArticle).generalize ?? '').trim();
      if (generic) {
        if (next.has(idKey)) next.delete(idKey);
        if (next.has(titleKey)) next.delete(titleKey);
        setGeneralizingMeta(prev => { const n = { ...prev }; delete n[idKey]; delete n[titleKey]; return n; });
      }
    }
    for (const key of Array.from(next)) {
      const meta = generalizingMeta[key];
      if (meta && typeof meta.startedAt === 'number' && (now - meta.startedAt) > maxAgeMs) {
        next.delete(key);
        setGeneralizingMeta(prev => { const n = { ...prev }; delete n[key]; return n; });
      }
    }
    if (next.size !== generalizingIds.size) setGeneralizingIds(next);
  }, [articles, generalizingIds, generalizingMeta]);

  // Send keyword request directly to the provided webhook
  const handleSendKeyword = async (e: FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim()) {
      setSendError('Please enter a keyword');
      setSendSuccess(false);
      return;
    }
    const parsed = parseInt((keywordCount || '1') as string, 10);
    const count = Math.min(10, Math.max(1, Number.isNaN(parsed) ? 1 : parsed));
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    // Add UI-only optimistic placeholder rows immediately (do NOT write to Supabase)
    const kw = keywordInput.trim();
    const makeId = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const now = Date.now();
    const newTemps: OptimisticArticle[] = Array.from({ length: count }).map((_, idx) => ({
      id: makeId(),
      title: 'Article is processing...',
      keyword: kw,
      doc_link: null,
      content: null,
      status: 'new',
      _temp: true,
      createdTs: now + idx // preserve order of creation
    }));
    setOptimisticRows(prev => [...newTemps, ...prev]);
    // Close modal so the user can add another immediately while this one processes
    setShowAddModal(false);
    try {
      const resp = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyword: kw,
          count,
          business_name: bizName || undefined,
          city: city || undefined,
          state: provState || undefined,
          call_to_action: callToAction || undefined,
        })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        const t = txt.toLowerCase();
        if (
          t.includes('insufficient') || t.includes('quota') || t.includes('balance') ||
          t.includes('billing') || t.includes('capacity') || t.includes('limit') ||
          t.includes('rate limit') || t.includes('insufficient_quota')
        ) {
          setAiWarning('The AI provider is currently out of balance or capacity. Please top up your OpenAI balance or try again later.');
        }
        throw new Error(`Webhook error: ${resp.status} ${txt}`);
      }
      // Some n8n nodes return 200 with a body containing a failure message
      const okBodyText = await resp.text();
      if (okBodyText && okBodyText.trim()) {
        try {
          const getFailed = (obj: unknown): string => {
            if (!obj || typeof obj !== 'object') return '';
            const rec = obj as Record<string, unknown>;
            const keys = ['Failed', 'failed', 'FAILURE', 'error'];
            for (const k of keys) {
              const v = rec[k];
              if (typeof v === 'string') return v;
            }
            return '';
          };
          const json = JSON.parse(okBodyText) as unknown;
          let failedMsg = '';
          if (Array.isArray(json)) {
            failedMsg = getFailed(json[0]);
          } else {
            failedMsg = getFailed(json);
          }
          if (failedMsg) {
            const f = failedMsg.toLowerCase();
            if (
              f.includes('insufficient') || f.includes('quota') || f.includes('balance') ||
              f.includes('billing') || f.includes('capacity') || f.includes('limit') ||
              f.includes('rate limit') || f.includes('insufficient_quota')
            ) {
              setAiWarning('The AI provider is currently out of balance or capacity. Please top up your OpenAI balance or try again later.');
            }
            throw new Error(failedMsg);
          }
        } catch {
          const txt = okBodyText.toLowerCase();
          if (txt.includes('"failed"') || txt.startsWith('failed') || txt.includes('failed:')) {
            if (
              txt.includes('insufficient') || txt.includes('quota') || txt.includes('balance') ||
              txt.includes('billing') || txt.includes('capacity') || txt.includes('limit') ||
              txt.includes('rate limit') || txt.includes('insufficient_quota')
            ) {
              setAiWarning('OpenAI has run out of balance. Please top up your OpenAI account.');
            }
            throw new Error(okBodyText);
          }
        }
      }
      // On success: remove the optimistic placeholders we added for this request
      setOptimisticRows(prev => prev.filter(r => !(newTemps as any[]).some(t => t.id === (r as any).id)));
      // Then refetch so the UI shows only finalized rows created by n8n\nsetSendSuccess(true);
      // Inputs cleanup after success
      setKeywordInput('');
      setKeywordCount('1');
      setBizName('');
      setCity('');
      setProvState('');
      setCallToAction('');
      // No Supabase placeholder insert; we rely solely on n8n to persist rows
    } catch (err) {
      // If webhook failed due to balance/capacity, show warning, revert optimistic rows, and reopen Create modal
      const msg = err instanceof Error ? err.message : String(err || '');
      const m = msg.toLowerCase();
      const isBalanceIssue = (
        m.includes('insufficient') || m.includes('quota') || m.includes('balance') ||
        m.includes('billing') || m.includes('capacity') || m.includes('limit') ||
        m.includes('rate limit') || m.includes('insufficient_quota')
      );
      if (isBalanceIssue) {
        setAiWarning('OpenAI has run out of balance. Please top up your OpenAI account.');
        // Remove optimistic placeholders from this attempt
        setOptimisticRows(prev => prev.filter(r => !(newTemps as any[]).some(t => t.id === (r as any).id)));
        // Also try to clean up any placeholder rows that may have been inserted previously (legacy)
        try {
          await supabase.rpc('rpc_research_cleanup_processing', {
            p_keyword: kw,
          });
        } catch (e) { console.warn('Cleanup delete failed (safe to ignore):', e); }
        // Restore form inputs and reopen the Create modal
        setKeywordInput(kw);
        setKeywordCount(String(count));
        setBizName(bizName);
        setCity(city);
        setProvState(provState);
        setCallToAction(callToAction);
        setSendSuccess(false);
        setSendError(null);
        setToast(null);
        setShowAddModal(true);
        setSending(false);
        return; // Skip Supabase fallback insert on balance/capacity errors
      }
      // Otherwise: do NOT insert any 'processing' rows into Supabase.
      // Remove optimistic placeholders from this attempt
      setOptimisticRows(prev => prev.filter(r => !(newTemps as any[]).some(t => t.id === (r as any).id)));
      setSendError(
        err instanceof Error
          ? `Create failed: ${err.message}`
          : 'Failed to create articles'
      );
      // Restore form inputs and reopen Create modal for correction/retry
      setKeywordInput(kw);
      setKeywordCount(String(count));
      setBizName(bizName);
      setCity(city);
      setProvState(provState);
      setCallToAction(callToAction);
      setShowAddModal(true);
    } finally {
      setSending(false);
    }
  };

  // Open modal to choose word limit for Write
  const handleWriteForArticle = (article: ResearchArticle) => {
    setArticleToWrite(article);
    setWordLimit(1000);
    setExtraKeywords([]);
    setNewKeyword('');
    setWriteInstructions('');
    setWebsite('');
    setWriteModel(defaultModel);
    setWriteModelQuery('');
    setWriteModelOpen(false);
    setWriteModalNotice(null);
    setShowWriteModal(true);
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    if (extraKeywords.includes(trimmed)) return; // no duplicates
    if (extraKeywords.length >= maxKeywords) return; // max reached
    setExtraKeywords([...extraKeywords, trimmed]);
    setNewKeyword('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setExtraKeywords(extraKeywords.filter(k => k !== kw));
  };

  // Confirm and send the selected article id + title + word limit to the Write webhook
  const handleConfirmWrite = async () => {
    if (!articleToWrite) return;
    const article = articleToWrite;
    const formSnapshot = {
      wordLimit,
      extraKeywords: [...extraKeywords],
      writeInstructions,
      website,
      model: writeModel,
    };
    const idKey = String(article.id ?? '');
    const titleKey = String(article.title ?? '');
    setShowWriteModal(false);
    setArticleToWrite(null);
    setWriteModelOpen(false);
    setWritingIds(prev => {
      const next = new Set(prev);
      if (idKey) next.add(idKey);
      if (titleKey) next.add(titleKey);
      return next;
    });
    setWritingMeta(prev => ({
      ...prev,
      ...(idKey ? { [idKey]: { id: article.id, title: article.title, keyword: (article).keyword || '', startedAt: Date.now() } } : {}),
      ...(titleKey ? { [titleKey]: { id: article.id, title: article.title, keyword: (article).keyword || '', startedAt: Date.now() } } : {}),
    }));
    try {
      const resp = await fetch('/api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: article.id,
          title: article.title,
          model: writeModel || undefined,
          word_limit: wordLimit,
          additional_keywords: extraKeywords,
          mentions_per_keyword: { min: mentionRange.min, max: mentionRange.max },
          instructions: writeInstructions || undefined,
          website: website || undefined,
        })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        const t = txt.toLowerCase();
        if (
          t.includes('insufficient') || t.includes('quota') || t.includes('balance') ||
          t.includes('billing') || t.includes('capacity') || t.includes('limit') ||
          t.includes('rate limit') || t.includes('insufficient_quota')
        ) {
          // Surface a friendly message inside the Write modal
          setWriteModalNotice('OpenAI has run out of balance. Please top up your OpenAI account.');
        }
        throw new Error(`Webhook error: ${resp.status} ${txt}`);
      }
      // Some n8n nodes return a 200 with a body like: [{ "Failed": "..." }]
      // Sometimes it's served as text/plain, so don't rely on content-type.
      const okBodyText = await resp.text();
      if (okBodyText && okBodyText.trim()) {
        try {
          const getFailed = (obj: unknown): string => {
            if (!obj || typeof obj !== 'object') return '';
            const rec = obj as Record<string, unknown>;
            const keys = ['Failed', 'failed', 'FAILURE', 'error'];
            for (const k of keys) {
              const v = rec[k];
              if (typeof v === 'string') return v;
            }
            return '';
          };
          const json = JSON.parse(okBodyText) as unknown;
          let failedMsg = '';
          if (Array.isArray(json)) {
            failedMsg = getFailed(json[0]);
          } else {
            failedMsg = getFailed(json);
          }
          if (failedMsg) {
            const f = failedMsg.toLowerCase();
            if (
              f.includes('insufficient') || f.includes('quota') || f.includes('balance') ||
              f.includes('billing') || f.includes('capacity') || f.includes('limit') ||
              f.includes('rate limit') || f.includes('insufficient_quota')
            ) {
              setWriteModalNotice('OpenAI has run out of balance. Please top up your OpenAI account.');
            }
            throw new Error(failedMsg);
          }
        } catch {
          // If it wasn't JSON, but includes the pattern textually, treat as failure.
          const txt = okBodyText.toLowerCase();
          if (txt.includes('"failed"') || txt.startsWith('failed') || txt.includes('failed:')) {
            if (
              txt.includes('insufficient') || txt.includes('quota') || txt.includes('balance') ||
              txt.includes('billing') || txt.includes('capacity') || txt.includes('limit') ||
              txt.includes('rate limit') || txt.includes('insufficient_quota')
            ) {
              setWriteModalNotice('OpenAI has run out of balance. Please top up your OpenAI account.');
            }
            throw new Error(okBodyText);
          }
        }
      }
      // Do not auto refresh here; row stays marked as writing until backend completes
    } catch (err) {
      console.error('Write failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to write';
      const m = msg.toLowerCase();
      if (
        m.includes('insufficient') || m.includes('quota') || m.includes('balance') ||
        m.includes('billing') || m.includes('capacity') || m.includes('limit') ||
        m.includes('rate limit') || m.includes('insufficient_quota')
      ) {
        setWriteModalNotice('OpenAI has run out of balance. Please top up your OpenAI account.');
      }
      // Clear pending state for this row
      setWritingIds(prev => {
        const next = new Set(prev);
        next.delete(idKey);
        next.delete(titleKey);
        return next;
      });
      setWritingMeta(prev => { const n = { ...prev }; delete n[idKey]; delete n[titleKey]; return n; });
      // Re-open modal with previous selections + show in-modal notice
      setArticleToWrite(article);
      setWordLimit(formSnapshot.wordLimit);
      setExtraKeywords(formSnapshot.extraKeywords);
      setNewKeyword('');
      setWriteInstructions(formSnapshot.writeInstructions);
      setWebsite(formSnapshot.website);
      setWriteModel(formSnapshot.model);
      setWriteModelQuery('');
      setWriteModelOpen(false);
      setWriteModalNotice(msg);
      setShowWriteModal(true);
      // On error, clear pending state for this row
    }
  };

  // Create tag via modal (no row selection required)
  const handleCreateTag = async () => {
    const name = tagName.trim();
    const color = tagColor.trim() || '#2563eb';
    if (!name) { window.alert('Please enter a tag name.'); return; }
    try {
      await fetch('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: name, color }),
      });
    } catch (e) { console.error('Webhook error', e); }
    // Refetch tags to reflect the new tag saved by n8n
    try { await fetchTags(); } catch (e) { void e; }
    setShowTagModal(false);
    setTagName('');
    setTagColor('#2563eb');
  };

  // Remove a tag by name for a given row key
  const handleRemoveTag = (key: string, tagName: string) => {
    const safeKey = String(key || '').trim();
    if (!safeKey) return;
    setTagsById(prev => {
      const cur = Array.isArray(prev[safeKey]) ? prev[safeKey] : [];
      const next = cur.filter(t => (typeof t === 'string' ? t !== tagName : t.name !== tagName));
      return { ...prev, [safeKey]: next };
    });
  };

  const openDeleteModalSingle = (id: number | string, title?: string) => {
    if (id === undefined || id === null) return;
    setDeleteTargetIds([id]);
    setDeleteTargetTitle(String(title ?? ''));
    setShowDeleteModal(true);
  };

  const openDeleteModalBulk = (ids: Array<number | string>) => {
    const cleaned = (ids || []).filter((id) => id !== undefined && id !== null);
    if (cleaned.length === 0) return;
    setDeleteTargetIds(cleaned);
    setDeleteTargetTitle('');
    setShowDeleteModal(true);
  };

  const executeDeleteSingle = async (id: number | string, title?: string) => {
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      const { error: delError } = await supabase.rpc('rpc_research_delete', {
        p_id: Number(id),
      });
      if (delError) throw delError;
      const idKey = String(id ?? '');
      const titleKey = String(title ?? (articles?.find(a => String(a.id) === idKey)?.title ?? ''));
      setWritingIds(prev => {
        const next = new Set(prev);
        next.delete(idKey);
        if (titleKey) next.delete(titleKey);
        return next;
      });
      setRewritingIds(prev => {
        const next = new Set(prev);
        next.delete(idKey);
        if (titleKey) next.delete(titleKey);
        return next;
      });
      setWritingMeta(prev => { const n = { ...prev }; delete n[idKey]; if (titleKey) delete n[titleKey]; return n; });
      setOptimisticRows(prev => prev.filter(r => r.id !== idKey));
    } catch (err) {
      console.error('Delete failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete row';
      window.alert(msg);
      throw err;
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const executeBulkDelete = async (idsToDelete: Array<number | string>) => {
    setDeletingIds(prev => {
      const next = new Set(prev);
      idsToDelete.forEach(id => next.add(id));
      return next;
    });
    try {
      const { error: delError } = await supabase.rpc('rpc_research_bulk_delete', {
        p_ids: idsToDelete.map((v) => Number(v)),
      });
      if (delError) throw delError;
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk delete failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete selected rows';
      window.alert(msg);
      throw err;
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  const confirmDelete = async () => {
    const ids = deleteTargetIds;
    if (!ids || ids.length === 0) return;
    try {
      if (ids.length === 1) {
        await executeDeleteSingle(ids[0], deleteTargetTitle || undefined);
      } else {
        await executeBulkDelete(ids);
      }
      setShowDeleteModal(false);
      setDeleteTargetIds([]);
      setDeleteTargetTitle('');
    } catch {
      void 0;
    }
  };

  const filteredArticles = useMemo(() => {
    // Real articles may still be loading; show placeholders for writing rows from meta
    const realArticles = articles || [];
    const loweredSearch = searchTerm.toLowerCase();
    const real = realArticles.filter((article) => {
      const matchesSearch =
        article.title.toLowerCase().includes(loweredSearch) ||
        article.keyword.toLowerCase().includes(loweredSearch) ||
        (article.business_name ?? '').toLowerCase().includes(loweredSearch);
      const matchesStatus = statusFilter === 'all' || article.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    // Add writing placeholders that aren't present in real articles
    // Only include the most recent active writing placeholder to avoid duplicates
    const keysByRecent = Array.from(writingIds).sort((a, b) => (writingMeta[b]?.startedAt || 0) - (writingMeta[a]?.startedAt || 0));
    const activeKeys = keysByRecent.length > 0 ? [keysByRecent[0]] : [];
    const placeholdersFromWriting: Array<ResearchArticle & { _temp?: false; createdTs?: number }> = [];
    for (const key of activeKeys) {
      const meta = writingMeta[key];
      const exists = real.some(a => (
        String((a).id ?? '') === String(meta?.id ?? '') ||
        String((a).title ?? '') === String(meta?.title ?? '')
      ));
      if (!exists && meta) {
        placeholdersFromWriting.push({
          id: (meta.id) ?? key,
          title: meta.title || 'Article is processing...',
          keyword: meta.keyword || '',
          doc_link: null,
          status: 'new',
        } as unknown as ResearchArticle);
      }
    }
    // Add optimistic rows that match the filters
    const optimistic = optimisticRows.filter(row => {
      const matchesSearch = row.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           row.keyword.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    // Merge and sort: optimistic placeholders (newest first), then real by id desc
    type ViewArticle = (ResearchArticle & { _temp?: false; createdTs?: number }) | OptimisticArticle;
    const combined: ViewArticle[] = [...placeholdersFromWriting, ...optimistic, ...real];
    combined.sort((a: ViewArticle, b: ViewArticle) => {
      const aTemp = !!a._temp;
      const bTemp = !!b._temp;
      if (aTemp && bTemp) return ((b as OptimisticArticle).createdTs || 0) - ((a as OptimisticArticle).createdTs || 0);
      if (aTemp) return -1;
      if (bTemp) return 1;
      const aId = typeof a.id === 'number' ? a.id : parseInt(String(a.id), 10) || 0;
      const bId = typeof b.id === 'number' ? b.id : parseInt(String(b.id), 10) || 0;
      return bId - aId; // newest first
    });
    return combined;
  }, [articles, searchTerm, statusFilter, optimisticRows, writingIds, writingMeta]);

  // Page does not auto-jump; user controls pagination

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedArticles = filteredArticles;

  const toggleSelectAllOnPage = () => {
    const idsOnPage = paginatedArticles
      .filter(a => !(a)._temp)
      .map(a => (a).id)
      .filter((id) => id !== undefined && id !== null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = idsOnPage.every(id => next.has(id));
      if (allSelected) {
        idsOnPage.forEach(id => next.delete(id));
      } else {
        idsOnPage.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleSelectOne = (id: number | string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds).filter(id => id !== undefined && id !== null);
    if (idsToDelete.length === 0) return;
    openDeleteModalBulk(idsToDelete);
  };

  // Prune optimistic placeholders as real rows arrive for a given keyword
  // If we detect N real rows for a keyword, remove up to N placeholders for that keyword.
  useEffect(() => {
    if (!articles || optimisticRows.length === 0) return;
    const kwGroups: Record<string, number> = {};
    for (const a of articles) {
      kwGroups[a.keyword] = (kwGroups[a.keyword] || 0) + 1;
    }
    setOptimisticRows(prev => {
      const remaining: OptimisticArticle[] = [];
      const toRemoveCount: Record<string, number> = {};
      for (const row of prev) {
        const allow = kwGroups[row.keyword] || 0;
        const removedSoFar = toRemoveCount[row.keyword] || 0;
        if (removedSoFar < allow) {
          toRemoveCount[row.keyword] = removedSoFar + 1;
          continue; // drop this placeholder
        }
        remaining.push(row);
      }
      return remaining;
    });
  }, [articles, optimisticRows.length]);

  const stats = useMemo(() => {
    if (!articles) return { total: 0, newCount: 0, withLinks: 0, withoutLinks: 0 };
    
    const total = totalCount;
    const newCount = articles.filter(a => a.status === 'new').length;
    const withLinks = articles.filter(a => a.doc_link && a.doc_link.trim() !== '').length;
    const withoutLinks = total - withLinks;

    return { total, newCount, withLinks, withoutLinks };
  }, [articles, totalCount]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      new: { color: 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300', label: 'New', icon: null },
      writing: { color: 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border-gray-300', label: 'Writing', icon: Edit3 },
      Used: { color: 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300', label: 'Completed', icon: CheckCircle },
      error: { color: 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border-red-300', label: 'Error', icon: AlertCircle },
      processing: { color: 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border-red-300', label: 'Processing', icon: Loader2 }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.new;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${config.color}`}>
        {IconComponent && (
          <IconComponent className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
        )}
        {config.label}
      </span>
    );
  };

  const renderDocLink = (docLink: string | null) => {
    if (docLink === null) {
      return <span className="text-gray-400 text-sm font-medium">Click "Write" to generate document link</span>;
    }
    const trimmed = docLink.trim();
    if (!trimmed || trimmed.toUpperCase() === 'EMPTY') {
      return <span className="text-yellow-600 text-sm font-medium">EMPTY</span>;
    }
    const isUrl = /^https?:\/\//i.test(trimmed);
    if (isUrl) {
      return (
        <a href={trimmed} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
          {trimmed}
        </a>
      );
    }
    return <span className="text-gray-600 break-all">{trimmed}</span>;
  };

  const renderContentLink = (title: string, content?: string | null) => {
    const trimmed = (content ?? '').trim();
    if (!trimmed) {
      return <span className="text-gray-400 text-sm">Click "Write" to generate content</span>;
    }

    // Remove the first <h1>...</h1> so the modal header title isn't duplicated in the body
    const stripped = trimmed.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '').trim();

    // Start from the body HTML we actually want to show and normalize escaped newlines
    let htmlForModal = (stripped || trimmed)
      // webhook returns literal "\n\n" between paragraphs; turn into real blank lines
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n');

    // Treat "H2:" markers from the generator as Word-style section headings.
    // We approximate the heading as the text from "H2:" up to the next period.
    // Example: "H2: Upgrade the Graphics Card. For individuals..." becomes
    // "<h2>Upgrade the Graphics Card</h2> For individuals..."
    htmlForModal = htmlForModal.replace(
      /H2:\s*(?:\d+\.\s*)?([^.]+)\./g,
      (_match, heading) => `<h2 style="font-size: 1.5rem; font-weight: bold;">${String(heading).trim()}</h2>`
    );

    // Pattern 1: phrases like "Click here https://example.com" or "Click here: https://example.com"
    // Become a proper anchor where the visible text is the URL (not the words "Click here")
    htmlForModal = htmlForModal.replace(
      /(Click here)(?:\s*[:-]\s*|\s+)(https?:\/\/[^\s<>"]+)/gi,
      (_match, _label, url) => `<a href="${String(url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${String(url)}</a>`
    );

    // Normalize any anchors whose inner text is literally "Click here" to display the actual URL
    htmlForModal = htmlForModal.replace(
      /<a([^>]*?)href="([^"]+)"([^>]*)>\s*(?:Click here|click here)\s*<\/a>/g,
      '<a$1href="$2"$3>$2</a>'
    );

    // Pattern 2: lines like
    //   https://example.com">Some label text
    // Become a proper anchor where the URL is the href and the trailing text is the label
    htmlForModal = htmlForModal.replace(
      /(https?:\/\/[^"\s<>]+)"?>\s*([^\n<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">$2</a>'
    );

    // Pattern 3: bare URLs with no trailing ">label
    // Use a callback so we can avoid touching URLs that are already inside an href attribute
    htmlForModal = htmlForModal.replace(
      /(https?:\/\/[^\s<>"]+)/g,
      (match, url, offset, full) => {
        const before = (full as string).slice(0, offset as number);
        if (before.endsWith('href="') || before.endsWith("href='")) {
          // Already part of an href, leave it as-is
          return match;
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${url}</a>`;
      }
    );

    // If there are no existing <p> tags, create paragraphs and bullet lists
    // from blank-line-separated blocks. This gives Word-like spacing.
    if (!/<p[\s>]/i.test(htmlForModal)) {
      const normalized = htmlForModal.replace(/\r\n/g, '\n');
      const blocks = normalized.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
      if (blocks.length > 0) {
        htmlForModal = blocks
          .map(block => {
            const lines = block.split(/\n+/).map(l => l.trim()).filter(Boolean);
            const allBullets = lines.length > 1 && lines.every(l => /^(?:[•-]\s+)/.test(l));
            if (allBullets) {
              const items = lines.map(l => l.replace(/^([•-]\s+)/, ''));
              return `<ul>${items.map(it => `<li>${it}</li>`).join('')}</ul>`;
            }
            const single = lines.length === 1 ? lines[0] : '';
            if (single) {
              const words = single.split(/\s+/);
              const caps = words.filter(w => /^(?:[A-Z][a-z]|THC|CBD|NJ|USA)/.test(w)).length;
              const looksLikeHeading = single.length < 90 && !/[.!?]$/.test(single) && (caps / Math.max(1, words.length)) >= 0.5;
              if (looksLikeHeading) {
                return `<h2 style="font-size:1.5rem;font-weight:800;">${single}</h2>`;
              }
            }
            return `<p>${block}</p>`;
          })
          .join('');
      } else if (normalized.trim()) {
        htmlForModal = `<p>${normalized.trim()}</p>`;
      }
    }

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setContentTitle(title);
          setContentToShow(htmlForModal);
          setShowContentModal(true);
        }}
        className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      >
        View content
      </button>
    );
  };

  // Chat logic lives in ChatWidget now

  // Don't block UI on errors; just log them
  if (error) {
    console.error('Data fetch error:', error);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Modern Header */}
      <div className="bg-black/95 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Article Dashboard
                  </h1>
                  <p className="text-sm text-gray-300">Create, monitor and manage your content</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {onBackToLaunch && (
                <button
                  type="button"
                  onClick={onBackToLaunch}
                  className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
              )}
              <button 
                onClick={refetch}
                disabled={loading || isBusy}
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button 
                onClick={() => !isBusy && setShowAddModal(true)} 
                disabled={isBusy} 
                className="inline-flex items-center px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Article
              </button>
              <button
                type="button"
                onClick={openAccountModal}
                className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
              >
                <UserCircle className="w-4 h-4 mr-2" />
                Account
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAccountModal(false)} />
          <div className="relative bg-white/95 backdrop-blur-sm w-full max-w-xl mx-auto rounded-2xl shadow-2xl border border-gray-200 z-10 animate-in zoom-in-95 duration-300 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="w-full px-8 pt-7 pb-5 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md">
                      <UserCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold text-gray-900">Account</h3>
                      <p className="text-sm text-gray-600">Manage your profile details</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAccountModal(false)}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {profileLoading ? (
              <div className="px-8 pb-8 text-sm text-gray-600">Loading profile…</div>
            ) : profileError ? (
              <div className="px-8 pb-8 text-sm text-red-600">{profileError}</div>
            ) : !profileRow ? (
              <div className="px-8 pb-8 text-sm text-gray-600">No profile found.</div>
            ) : (
              <div className="px-8 pb-8 space-y-6">
                <div className="border-2 border-gray-100 rounded-2xl p-5 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Profile</div>
                      <div className="text-lg font-extrabold text-gray-900">Your details</div>
                    </div>
                    {!isEditingProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileSaveError(null);
                          setProfileSaveSuccess(null);
                          setEditFullName((profileRow.full_name ?? '') as string);
                          setIsEditingProfile(true);
                        }}
                        className="inline-flex items-center px-3 py-2 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-100 transition-all duration-200"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Full name</label>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400"
                          placeholder="Your name"
                        />
                      ) : (
                        <div className="px-4 py-3 border-2 border-gray-100 rounded-xl bg-gray-50 text-sm font-semibold text-gray-900">
                          {profileRow.full_name || '—'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Role</label>
                      <div className="px-4 py-3 border-2 border-gray-100 rounded-xl bg-gray-50 text-sm font-semibold text-gray-900">
                        {profileRow.role}
                      </div>
                    </div>
                  </div>

                  {profileSaveError && (
                    <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                      {profileSaveError}
                    </div>
                  )}
                  {profileSaveSuccess && (
                    <div className="mt-4 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
                      {profileSaveSuccess}
                    </div>
                  )}

                  {isEditingProfile && (
                    <div className="flex items-center justify-end gap-2 mt-5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProfile(false);
                          setEditFullName((profileRow.full_name ?? '') as string);
                          setProfileSaveError(null);
                          setProfileSaveSuccess(null);
                        }}
                        disabled={profileSaving}
                        className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 shadow-sm disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveProfile}
                        disabled={profileSaving}
                        className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50"
                      >
                        {profileSaving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">You can update your name anytime.</div>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(true)}
                    className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-white bg-black hover:bg-black/90 rounded-xl shadow-sm"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center shadow-md">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Confirm logout</h3>
                    <p className="text-xs text-gray-500">Are you sure you want to log out?</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 shadow-sm"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowLogoutConfirm(false);
                    await handleLogout();
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Add Article Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!sending) setShowAddModal(false); }} />
          <div className="relative bg-white/95 backdrop-blur-sm w-full max-w-lg mx-auto rounded-2xl shadow-2xl border border-gray-200 p-8 z-10 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black">Create New Articles</h3>
                  <p className="text-sm text-gray-600">Generate articles from your keyword</p>
                </div>
              </div>
              <button
                onClick={() => { if (!sending) setShowAddModal(false); }}
                disabled={sending}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-all duration-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendKeyword} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-black mb-3">Generate Topic</label>
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Enter topic or subject to generate articles about..."
                  disabled={sending}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                />
              </div>
              {/* Optional business context fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">Name of business (optional)</label>
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    placeholder="Enter business name"
                    disabled={sending}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">City (optional)</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Enter city"
                    disabled={sending}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">State/Province (optional)</label>
                  <input
                    type="text"
                    value={provState}
                    onChange={(e) => setProvState(e.target.value)}
                    placeholder="Enter state or province"
                    disabled={sending}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">Call to action (optional)</label>
                  <input
                    type="text"
                    value={callToAction}
                    onChange={(e) => setCallToAction(e.target.value)}
                    placeholder="Enter a call to action"
                    disabled={sending}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-3">Number of Articles? (max 10)</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const v = parseInt((keywordCount || '1'), 10);
                      const next = Math.max(1, (Number.isNaN(v) ? 1 : v) - 1);
                      setKeywordCount(String(next));
                    }}
                    disabled={sending}
                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-black font-semibold disabled:opacity-50 transition-all duration-200 flex items-center justify-center"
                    aria-label="Decrement"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={keywordCount}
                    onChange={(e) => setKeywordCount(e.target.value)}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value || '1', 10);
                      const clamped = Math.min(10, Math.max(1, Number.isNaN(v) ? 1 : v));
                      setKeywordCount(String(clamped));
                    }}
                    disabled={sending}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-center font-semibold text-black"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = parseInt((keywordCount || '1'), 10);
                      const next = Math.min(10, (Number.isNaN(v) ? 1 : v) + 1);
                      setKeywordCount(String(next));
                    }}
                    disabled={sending}
                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-black font-semibold disabled:opacity-50 transition-all duration-200 flex items-center justify-center"
                    aria-label="Increment"
                  >
                    +
                  </button>
                </div>
              </div>

              {sendError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-800">{sendError}</span>
                  </div>
                </div>
              )}

              
              {sendSuccess && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-green-800">Articles are being generated successfully!</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { if (!sending) setShowAddModal(false); }}
                  disabled={sending}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-black bg-white hover:bg-gray-50 disabled:opacity-50 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Create Articles
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (isDeleteModalDeleting) return;
              setShowDeleteModal(false);
              setDeleteTargetIds([]);
              setDeleteTargetTitle('');
            }}
          />
          <div className="relative bg-white w-full max-w-lg mx-auto rounded-lg shadow-lg border p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Delete</h3>
              <button
                type="button"
                onClick={() => {
                  if (isDeleteModalDeleting) return;
                  setShowDeleteModal(false);
                  setDeleteTargetIds([]);
                  setDeleteTargetTitle('');
                }}
                className="p-2 rounded hover:bg-gray-100 text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <p className="text-sm text-gray-700 leading-relaxed">
                {deleteTargetIds.length <= 1
                  ? `Delete this item${deleteTargetTitle ? `: "${deleteTargetTitle}"` : ''}? This cannot be undone.`
                  : `Delete ${deleteTargetIds.length} selected items? This cannot be undone.`}
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isDeleteModalDeleting}
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteTargetIds([]);
                    setDeleteTargetTitle('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isDeleteModalDeleting}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleteModalDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rewrite Prompt Modal */}
      {showRewriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowRewriteModal(false); setArticleToRewrite(null); setRewriteInstructions(''); }}
          />
          <div className="relative bg-white w-full max-w-lg mx-auto rounded-lg shadow-lg border p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Rewrite Article</h3>
              <button
                onClick={() => { setShowRewriteModal(false); setArticleToRewrite(null); setRewriteInstructions(''); }}
                className="p-2 rounded hover:bg-gray-100 text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {articleToRewrite && (
              <p className="text-sm text-gray-600 mb-3">{articleToRewrite.title}</p>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <div ref={rewriteModelDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setRewriteModelOpen(v => !v)}
                    className="w-full inline-flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <span className="truncate text-gray-900">{rewriteModel || 'Select a model'}</span>
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {rewriteModelOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 rounded-md border border-gray-200 bg-white shadow-lg z-20">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          value={rewriteModelQuery}
                          onChange={(e) => setRewriteModelQuery(e.target.value)}
                          placeholder="Search model..."
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="max-h-72 overflow-auto py-1">
                        {rewriteModelOptions
                          .filter(m => m.toLowerCase().includes(rewriteModelQuery.trim().toLowerCase()))
                          .map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => { const changed = m !== rewriteModel; setRewriteModel(m); setRewriteModelOpen(false); if (changed) setRewriteModalNotice(null); }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${m === rewriteModel ? 'bg-gray-100' : ''}`}
                            >
                              {m}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                {rewriteModalNotice && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-amber-900 mb-1">This model isn't working right now</div>
                        <div className="text-amber-800 mb-2 leading-relaxed">
                          {cleanErrorMessage(rewriteModalNotice || '')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instructions or prompt</label>
                <textarea
                  value={rewriteInstructions}
                  onChange={(e) => setRewriteInstructions(e.target.value)}
                  rows={5}
                  placeholder="Describe how you want the content to be rewritten (tone, target audience, include/exclude parts, etc.)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowRewriteModal(false); setArticleToRewrite(null); setRewriteInstructions(''); }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRewrite}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                >
                  Rewrite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Write Options Modal */}
      {showWriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowWriteModal(false); setArticleToWrite(null); setExtraKeywords([]); setNewKeyword(''); setWriteInstructions(''); setWebsite(''); setWriteModelOpen(false); setWriteModelQuery(''); }}
          />
          <div className="relative bg-white w-full max-w-sm mx-auto rounded-lg shadow-lg border p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Write Options</h3>
              <button
                onClick={() => { setShowWriteModal(false); setArticleToWrite(null); setExtraKeywords([]); setNewKeyword(''); setWriteInstructions(''); setWebsite(''); setWriteModelOpen(false); setWriteModelQuery(''); }}
                className="p-2 rounded hover:bg-gray-100 text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Word limit</label>
                <select
                  value={wordLimit}
                  onChange={(e) => setWordLimit(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={500}>500 words</option>
                  <option value={1000}>1000 words</option>
                  <option value={1500}>1500 words</option>
                  <option value={2000}>2000 words</option>
                  <option value={2500}>2500 words</option>
                  <option value={3000}>3000 words</option>
                </select>
              </div>
              {maxKeywords > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional keywords ({extraKeywords.length}/{maxKeywords})</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      } else if (e.key === 'Backspace' && !newKeyword.trim() && extraKeywords.length > 0) {
                        // Remove the last keyword when input is empty
                        e.preventDefault();
                        const last = extraKeywords[extraKeywords.length - 1];
                        handleRemoveKeyword(last);
                      }
                    }}
                    placeholder="Enter keyword"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    disabled={extraKeywords.length >= maxKeywords || !newKeyword.trim()}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    title="Add keyword"
                  >
                    +
                  </button>
                </div>
                {extraKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {extraKeywords.map((kw) => (
                      <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-800 rounded-md text-xs">
                        {kw}
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(kw)}
                          className="text-gray-500 hover:text-gray-700"
                          aria-label="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <div ref={writeModelDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setWriteModelOpen(v => !v)}
                    className="w-full inline-flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <span className="truncate text-gray-900">{writeModel || 'Select a model'}</span>
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {writeModelOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 rounded-md border border-gray-200 bg-white shadow-lg z-20">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          value={writeModelQuery}
                          onChange={(e) => setWriteModelQuery(e.target.value)}
                          placeholder="Search model..."
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="max-h-72 overflow-auto py-1">
                        {writeModelOptions
                          .filter(m => m.toLowerCase().includes(writeModelQuery.trim().toLowerCase()))
                          .map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => { const changed = m !== writeModel; setWriteModel(m); setWriteModelOpen(false); if (changed) setWriteModalNotice(null); }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${m === writeModel ? 'bg-gray-100' : ''}`}
                            >
                              {m}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                {writeModalNotice && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-amber-900 mb-1">This model isn't working right now</div>
                        <div className="text-amber-800 mb-2 leading-relaxed">
                          {cleanErrorMessage(writeModalNotice || '')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instructions or prompt</label>
                <textarea
                  value={writeInstructions}
                  onChange={(e) => setWriteInstructions(e.target.value)}
                  placeholder="Describe how you want the content to be written (tone, target audience, include/exclude parts, etc.)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm min-h-[96px]"
                  rows={5}
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowWriteModal(false); setArticleToWrite(null); setExtraKeywords([]); setNewKeyword(''); setWriteInstructions(''); setWebsite(''); setWriteModelOpen(false); setWriteModelQuery(''); }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmWrite}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700"
                >
                  Write
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Content Modal */}
      {showContentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowContentModal(false)}
          />
          <div className="relative bg-white w-full max-w-2xl mx-auto rounded-lg shadow-lg border p-6 z-10 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{contentTitle || 'Article Content'}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyContent}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-800 text-white shadow-sm hover:bg-gray-700"
                  aria-label="Copy content"
                  title="Copy"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowContentModal(false)}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto pr-1">
              {isLikelyHtml(String(contentToShow ?? '')) ? (
                <div
                  className="prose prose-lg max-w-none text-gray-900 leading-relaxed prose-p:my-4 prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-gray-900 prose-h2:font-extrabold prose-strong:font-semibold prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-a:text-blue-600 prose-a:underline"
                  dangerouslySetInnerHTML={{ __html: contentToShow }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-gray-900 leading-relaxed text-sm font-normal">
                  {String(contentToShow ?? '')}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[81vw] mx-auto px-6 py-8">
        {/* Professional Analytics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {/* Total Articles Card */}
          <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-md hover:shadow-lg transition-all duration-500 group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Articles</p>
                  </div>
                  <p className="text-4xl font-black text-black mb-2">{stats.total}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"></div>
                    <span className="text-xs font-semibold text-gray-400">CONTENT LIBRARY</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <FileText className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* New Items Card */}
          <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-md hover:shadow-lg transition-all duration-500 group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-50 to-red-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">New Items</p>
                  </div>
                  <p className="text-4xl font-black text-black mb-2">{stats.newCount}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-gradient-to-r from-red-600 to-red-400 rounded-full"></div>
                    <span className="text-xs font-semibold text-gray-400">PENDING REVIEW</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Clock className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* With Links Card */}
          <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-md hover:shadow-lg transition-all duration-500 group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">With Links</p>
                  </div>
                  <p className="text-4xl font-black text-black mb-2">{stats.withLinks}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"></div>
                    <span className="text-xs font-semibold text-gray-400">LINKED CONTENT</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Processing Card */}
          <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-md hover:shadow-lg transition-all duration-500 group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-50 to-red-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-3 h-3 bg-red-600 rounded-full ${optimisticRows.length > 0 ? 'animate-pulse' : ''}`}></div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Processing</p>
                  </div>
                  <p className="text-4xl font-black text-black mb-2">{optimisticRows.length}</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-1 bg-gradient-to-r from-red-600 to-red-400 rounded-full ${optimisticRows.length > 0 ? 'animate-pulse' : ''}`}></div>
                    <span className="text-xs font-semibold text-gray-400">IN PROGRESS</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Loader2 className={`w-8 h-8 text-white ${optimisticRows.length > 0 ? 'animate-spin' : ''}`} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tag Modal */}
        {showTagModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTagModal(false)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-0 border border-gray-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {confirmDeleteId != null && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setConfirmDeleteId(null); setConfirmDeleteName(''); }}>
                  <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                    <div className="text-base font-extrabold text-gray-900">Delete tag?</div>
                    <div className="mt-1 text-sm text-gray-600 break-words">
                      Are you sure you want to delete <span className="font-bold text-gray-900">{confirmDeleteName || 'this tag'}</span>?
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setConfirmDeleteId(null); setConfirmDeleteName(''); }}
                        className="px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 shadow-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => { await deleteTag(confirmDeleteId, confirmDeleteName || undefined); }}
                        disabled={deletingTagId === confirmDeleteId}
                        className="px-3 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm disabled:opacity-50"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-gray-900">Create Tag</h3>
                      <p className="text-xs text-gray-500">Manage your saved tags and colors</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">Tag name</label>
                  <input
                    type="text"
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag(); } }}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400"
                    placeholder="e.g. Important"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={tagColor}
                      onChange={(e) => setTagColor(e.target.value)}
                      className="h-10 w-12 p-0 border-2 border-gray-200 rounded-md cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-700">{tagColor}</span>
                  </div>
                </div>
                {/* Top actions */}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTagModal(false)}
                    className="px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!tagName.trim()}
                  >
                    Create Tag
                  </button>
                </div>
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-gray-900 tracking-wide">Saved Tags</h4>
                    <button
                      type="button"
                      onClick={fetchTags}
                      className="text-xs text-blue-600 hover:underline"
                      title="Refresh tags"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="border-2 border-gray-100 rounded-xl overflow-hidden shadow-sm">
                    {tagLoading ? (
                      <div className="p-6 text-sm text-gray-600">Loading tags…</div>
                    ) : tagError ? (
                      <div className="p-6 text-sm text-red-600">{tagError}</div>
                    ) : tagRows.length === 0 ? (
                      <div className="p-6 text-sm text-gray-600">No tags yet</div>
                    ) : (
                      <div className="max-h-64 overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-700 sticky top-0 z-10">
                            <tr>
                              <th className="text-left px-4 py-2.5 font-semibold">Tag</th>
                              <th className="text-left px-4 py-2.5 font-semibold">Color</th>
                              <th className="text-left px-4 py-2.5 font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tagRows.map(r => (
                              <tr key={r.id} className="border-t hover:bg-gray-50/60">
                                <td className="px-4 py-2.5 font-medium text-gray-900">
                                  {editingTagId === r.id ? (
                                    <input
                                      type="text"
                                      value={editTagName}
                                      onChange={(e) => setEditTagName(e.target.value)}
                                      className="px-2.5 py-1.5 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                    />
                                  ) : (
                                    r.tag
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {editingTagId === r.id ? (
                                    <div className="inline-flex items-center gap-2">
                                      <input
                                        type="color"
                                        value={editTagColor}
                                        onChange={(e) => setEditTagColor(e.target.value)}
                                        className="h-8 w-10 p-0 border-2 border-gray-200 rounded"
                                      />
                                      <span className="text-gray-800 text-sm font-medium">{editTagColor}</span>
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center gap-2">
                                      <span className="inline-block w-4 h-4 rounded" style={{ backgroundColor: r.color }} />
                                      <span className="text-gray-800 font-medium">{r.color}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {editingTagId === r.id ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={saveEditTag}
                                        disabled={savingTagId === r.id || !editTagName.trim()}
                                        className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditTag}
                                        className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => beginEditTag(r)}
                                        className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { setConfirmDeleteId(r.id); setConfirmDeleteName(r.tag || ''); }}
                                        className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Search & Filter Section */}
        <div className="bg-gradient-to-r from-white via-blue-50/30 to-white border-2 border-gray-100 rounded-3xl shadow-lg mb-8 overflow-visible">
          <div className="bg-gradient-to-r from-blue-600/5 via-transparent to-red-600/5 p-1">
            <div className="bg-white rounded-[20px] p-6">
              <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
                <div className="flex-1 max-w-md">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-blue-400/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-600 z-10" />
                      <input
                        type="text"
                        placeholder="Search articles, keywords, business..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-gradient-to-r from-gray-50 to-blue-50/50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition-all duration-300 text-black placeholder-gray-500 font-medium shadow-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Tag Modal Trigger */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTagModal(true)}
                      className="inline-flex items-center px-3 py-2 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-sm"
                      title="Create tag"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Manage Tag
                    </button>
                  </div>
                  <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-blue-50/50 px-4 py-2 rounded-xl border border-gray-200">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                    <Filter className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-gray-700">Filter:</span>
                  </div>
                  <div ref={statusDropdownRef} className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-red-600/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <button
                      type="button"
                      onClick={() => setStatusDropdownOpen(v => !v)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setStatusDropdownOpen(false);
                      }}
                      className="relative w-full inline-flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-gray-50 to-blue-50/50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-300 text-black font-bold min-w-[160px] shadow-sm hover:shadow-md"
                      aria-haspopup="listbox"
                      aria-expanded={statusDropdownOpen}
                    >
                      <span className="truncate">
                        {(statusOptions.find(o => o.value === statusFilter)?.label) || 'All Statuses'}
                      </span>
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-700 ml-3">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {statusDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden">
                        <div className="py-1" role="listbox" aria-label="Status filter">
                          {statusOptions.map(opt => {
                            const selected = opt.value === statusFilter;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => { setStatusFilter(opt.value); setStatusDropdownOpen(false); }}
                                className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${selected ? 'bg-blue-50 text-blue-800' : 'text-gray-800 hover:bg-gray-50'}`}
                                role="option"
                                aria-selected={selected}
                              >
                                <div className="flex items-center justify-between">
                                  <span>{opt.label}</span>
                                  {selected && (
                                    <CheckCircle className="w-4 h-4 text-blue-700" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Professional Table */}
        <div className="bg-gradient-to-r from-white via-gray-50/30 to-white border-2 border-gray-100 rounded-3xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600/5 via-transparent to-red-600/5 p-1">
            <div className="bg-white rounded-[20px] overflow-hidden">
            {paginatedArticles.length > 0 && selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-6 pt-4 pb-2">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{selectedIds.size} selected</span>
                </div>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <Trash className="w-4 h-4 mr-2" />
                  Delete selected
                </button>
              </div>
            )}
            {loading && paginatedArticles.length === 0 && rewritingIds.size === 0 && writingIds.size === 0 && optimisticRows.length === 0 && (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="text-slate-600 font-medium">Loading articles...</span>
                </div>
              </div>
            )}
            
            {!loading && paginatedArticles.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-black mb-2">No articles found</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filters to find what you\'re looking for' 
                    : 'Get started by creating your first article'}
                </p>
              </div>
            )}
            
            {paginatedArticles.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-gradient-to-r from-blue-50/50 via-gray-50 to-red-50/50">
                  <tr className="border-b-[3px] border-gray-200">
                    <th className="w-[4%] px-4 py-6 text-center text-sm font-black text-gray-800 uppercase tracking-wider">
                      {selectedIds.size > 0 && (
                        <input
                          type="checkbox"
                          checked={paginatedArticles
                            .filter(a => !(a)._temp)
                            .every(a => selectedIds.has((a).id)) && paginatedArticles.filter(a => !(a)._temp).length > 0}
                          onChange={toggleSelectAllOnPage}
                        />
                      )}
                    </th>
                    <th className="w-[28%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Article Title</span>
                      </div>
                    </th>
                    <th className="w-[14%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Business</span>
                      </div>
                    </th>
                    <th className="w-[12%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <Search className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Keyword</span>
                      </div>
                    </th>
                    <th className="w-[20%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Document Link</span>
                      </div>
                    </th>
                    <th className="w-[12%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Content</span>
                      </div>
                    </th>
                    <th className="w-[10%] px-8 py-6 text-center text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center justify-center">
                        <span className="bg-gradient-to-r from-red-600 to-red-800 bg-clip-text text-transparent">Actions</span>
                      </div>
                                        </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                {paginatedArticles.map((article: (ResearchArticle & { _temp?: false; createdTs?: number }) | OptimisticArticle, index) => {
                  const idKey = String((article).id ?? '');
                  const titleKey = String((article).title ?? '');
                  const isRewriting = rewritingIds.has(idKey) || rewritingIds.has(titleKey);
                  const isWritingRow = writingIds.has(idKey) || writingIds.has(titleKey);
                  return (
                  <tr key={`${article.id}`} className={`hover:bg-blue-50/50 transition-all duration-300 group border-l-4 ${isWritingRow ? 'border-blue-500 ring-2 ring-blue-300/60' : 'border-transparent hover:border-blue-500'} ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-6 text-center">
                      {!(article)._temp && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has((article).id)}
                          onChange={() => toggleSelectOne((article).id)}
                        />
                      )}
                    </td>
                    <td className="px-8 py-6">
                      {article._temp ? (
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-black text-base">Article is processing...</div>
                            <div className="text-sm text-gray-600 mt-1">Please wait while we generate your content</div>
                          </div>
                        </div>
                      ) : isWritingRow ? (
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-black text-base">Article is processing...</div>
                            <div className="text-sm text-gray-600 mt-1">Please wait while we generate your content</div>
                          </div>
                        </div>
                      ) : (
                        <div className="group cursor-pointer">
                          <div className="font-bold text-black text-base group-hover:text-blue-600 transition-colors duration-200 line-clamp-3 leading-relaxed">
                            {article.title}
                          </div>
                          {/* Tags display (no per-row add button) */}
                          <div className="mt-2 relative">
                            {(tagsById[idKey || titleKey] || []).length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {(tagsById[idKey || titleKey] || []).map((t) => {
                                  const label = typeof t === 'string' ? t : t.name;
                                  const color = typeof t === 'string' ? '#bfdbfe' : t.color || '#bfdbfe';
                                  const textColor = '#1e40af';
                                  return (
                                    <span key={label} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border" style={{ backgroundColor: color + '22', borderColor: color, color: textColor }}>
                                      {label}
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveTag(idKey || titleKey, label); }}
                                        className="ml-1 hover:text-red-600"
                                        title="Remove tag"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setOpenTagMenuKey(openTagMenuKey === (idKey || titleKey) ? null : (idKey || titleKey)); }}
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              +tag
                            </button>
                            {openTagMenuKey === (idKey || titleKey) && (
                              <div className="absolute z-20 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg">
                                <div className="px-3 py-2 text-xs text-gray-500 flex items-center justify-between">
                                  <span>Select a tag</span>
                                  <button className="text-[11px] text-blue-600 hover:underline" onClick={(e)=>{e.stopPropagation(); fetchTags();}}>Refresh</button>
                                </div>
                                <div className="max-h-56 overflow-auto">
                                  {tagLoading ? (
                                    <div className="px-3 py-2 text-sm text-gray-600">Loading…</div>
                                  ) : tagError ? (
                                    <div className="px-3 py-2 text-sm text-red-600">{tagError}</div>
                                  ) : tagRows.length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-gray-600">No tags</div>
                                  ) : (
                                    <ul className="py-1">
                                      {tagRows.map(tr => (
                                        <li key={tr.id}>
                                          <button
                                            type="button"
                                            onClick={(e)=>{e.stopPropagation(); applyTagToRow(idKey || titleKey, tr);}}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
                                          >
                                            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: tr.color }} />
                                            <span className="text-sm text-gray-800">{tr.tag}</span>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            Click to view details
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      {article._temp ? (
                        <div className="space-y-3">
                          <div className="w-full h-5 bg-gray-200 rounded-lg animate-pulse" />
                          <div className="w-4/5 h-4 bg-gray-200 rounded-lg animate-pulse" />
                        </div>
                      ) : (
                        <div className="break-all">
                          {(() => {
                            const biz = (article as ResearchArticle).business_name as string | null | undefined;
                            const name = (biz || '').trim();
                            return name ? (
                              <span className="text-gray-900 text-sm font-medium">{name}</span>
                            ) : (
                              <span className="text-gray-500 text-sm italic">No business name</span>
                            );
                          })()}
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex justify-start">
                        <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-gradient-to-r from-blue-100 to-blue-200 text-blue-900 border-2 border-blue-300 shadow-sm">
                          {article.keyword}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      {article._temp ? (
                        <div className="space-y-3">
                          <div className="w-full h-5 bg-gray-200 rounded-lg animate-pulse" />
                          <div className="w-4/5 h-4 bg-gray-200 rounded-lg animate-pulse" />
                          <div className="w-3/5 h-3 bg-gray-200 rounded animate-pulse" />
                        </div>
                      ) : isWritingRow ? (
                        <div className="flex items-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.85)]" />
                          </span>
                          <span className="text-sm font-semibold text-blue-700">Writing link…</span>
                        </div>
                      ) : isRewriting ? (
                        <div className="flex items-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.85)]" />
                          </span>
                          <span className="text-sm font-semibold bg-gradient-to-r from-red-600 to-rose-500 bg-clip-text text-transparent animate-pulse">Updating link…</span>
                        </div>
                      ) : (
                        <div className="break-all">
                          {renderDocLink((article).doc_link)}
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      {article._temp ? (
                        <div className="w-28 h-10 bg-gray-200 rounded-xl animate-pulse" />
                      ) : isWritingRow ? (
                        <div className="flex items-center justify-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.85)]" />
                          </span>
                          <span className="text-sm font-semibold text-blue-700">Writing content…</span>
                        </div>
                      ) : isRewriting ? (
                        <div className="flex items-center justify-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.85)]" />
                          </span>
                          <span className="text-sm font-semibold bg-gradient-to-r from-red-600 to-rose-500 bg-clip-text text-transparent animate-pulse">Updating content…</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          {renderContentLink((article).title, (article).content)}
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-center">
                        {article._temp ? (
                          <div className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-gradient-to-r from-red-600 to-rose-600 shadow-sm">
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Processing
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 justify-center">
                            {article.status === 'new' ? (
                              (() => {
                                const isWriting = writingIds.has(String((article).id ?? '')) || writingIds.has(String((article).title ?? ''));
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleWriteForArticle(article as ResearchArticle)}
                                    disabled={isWriting}
                                    className="group inline-flex items-center justify-center h-10 min-w-[40px] px-0 group-hover:px-3 text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isWriting ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Edit3 className="w-4 h-4" />
                                    )}
                                    <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-semibold text-sm ml-0 group-hover:ml-2">Write</span>
                                  </button>
                                );
                              })()
                            ) : article.status === 'Used' ? (
                              (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRewriteModal(article as ResearchArticle)}
                                  disabled={isRewriting}
                                  className="group inline-flex items-center justify-center h-10 min-w-[40px] px-0 group-hover:px-3 text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isRewriting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4" />
                                  )}
                                  <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-semibold text-sm ml-0 group-hover:ml-2">Rewrite</span>
                                </button>
                              )
                            ) : (
                              <div className="flex items-center justify-center">
                                {getStatusBadge((article).status)}
                              </div>
                            )}
                            {(() => {
                              const docLink = String((article as ResearchArticle).doc_link ?? '').trim();
                              const content = String((article as ResearchArticle).content ?? '').trim();
                              const name = String((article as ResearchArticle).business_name ?? '').trim();
                              const generic = String((article as ResearchArticle).generalize ?? '').trim();
                              const showGeneralize = !!docLink && docLink.toUpperCase() !== 'EMPTY' && !!content && !!name;
                              const showViewGeneric = !!generic;
                              if (!showGeneralize && !showViewGeneric) return null;
                              const isGeneralizing = generalizingIds.has(String((article as ResearchArticle).id ?? '')) || generalizingIds.has(String((article as ResearchArticle).title ?? ''));

                              if (showViewGeneric) {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setContentTitle(`${String((article as ResearchArticle).title ?? '').trim() || 'Generic content'}`);
                                      setContentToShow(generic);
                                      setShowContentModal(true);
                                    }}
                                    className="group inline-flex items-center justify-center h-10 min-w-[40px] px-0 group-hover:px-3 text-white bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
                                    title="View Generic Content"
                                  >
                                    <Eye className="w-4 h-4" />
                                    <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[180px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-semibold text-sm ml-0 group-hover:ml-2">View Generic Content</span>
                                  </button>
                                );
                              }

                              if (!showGeneralize) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void handleGeneralizeForArticle(article as ResearchArticle); }}
                                  disabled={isGeneralizing}
                                  className="group inline-flex items-center justify-center h-10 min-w-[40px] px-0 group-hover:px-3 text-white bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
                                  title="Generalize"
                                >
                                  {isGeneralizing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-4 h-4" />
                                  )}
                                  <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[140px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-semibold text-sm ml-0 group-hover:ml-2">Generalize</span>
                                </button>
                              );
                            })()}
                            {/* Delete button for any non-temp row */}
                            <button
                              type="button"
                              onClick={() => openDeleteModalSingle((article).id, (article).title)}
                              disabled={deletingIds.has((article).id)}
                              className="group inline-flex items-center justify-center h-10 min-w-[40px] px-0 group-hover:px-3 text-white bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingIds.has((article).id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash className="w-4 h-4" />
                              )}
                              <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-semibold text-sm ml-0 group-hover:ml-2">Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
            </div>
            )}
          </div>

          {/* Enhanced Professional Pagination */}
          {!loading && totalPages > 1 && (
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-8 py-6 border-t-2 border-gray-200 rounded-b-2xl">
              <div className="flex items-center justify-between">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-6 py-3 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-6 py-3 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex sm:items-center sm:justify-between sm:flex-1">
                  <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-sm text-gray-600">
                      Showing <span className="font-bold text-black">{startIndex + 1}</span> to{' '}
                      <span className="font-bold text-black">{Math.min(startIndex + itemsPerPage, totalCount)}</span> of{' '}
                      <span className="font-bold text-blue-600">{totalCount}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="flex items-center space-x-3">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="inline-flex items-center px-4 py-2.5 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                      >
                        First
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="inline-flex items-center px-4 py-2.5 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                      >
                        Previous
                      </button>
                      <div className="flex items-center space-x-2 max-w-[60vw] overflow-x-auto scrollbar-thin">
                        {(() => {
                          const pages: (number | 'ellipsis')[] = [];
                          if (totalPages <= 9) {
                            for (let p = 1; p <= totalPages; p++) pages.push(p);
                          } else {
                            const start = Math.max(2, currentPage - 2);
                            const end = Math.min(totalPages - 1, currentPage + 2);
                            pages.push(1);
                            if (start > 2) pages.push('ellipsis');
                            for (let p = start; p <= end; p++) pages.push(p);
                            if (end < totalPages - 1) pages.push('ellipsis');
                            pages.push(totalPages);
                          }
                          return pages.map((item, idx) =>
                            item === 'ellipsis' ? (
                              <span key={`e-${idx}`} className="px-2 text-gray-500 select-none">…</span>
                            ) : (
                              <button
                                key={item}
                                onClick={() => setCurrentPage(item)}
                                className={`inline-flex items-center px-4 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 shadow-sm ${
                                  item === currentPage
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg border-2 border-blue-500'
                                    : 'text-black bg-white border-2 border-gray-300 hover:bg-gray-50 hover:border-blue-400'
                                }`}
                              >
                                {item}
                              </button>
                            )
                          );
                        })()}
                      </div>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="inline-flex items-center px-4 py-2.5 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="inline-flex items-center px-4 py-2.5 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                      >
                        Last
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
        
        {/* Back to Top Button */}
        {showScrollTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-200"
            aria-label="Back to top"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        )}

        {/* Floating Chat Widget (bottom-left) */}
        <ChatWidget webhookUrl="/api/chat-bot" />
        {aiWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAiWarning(null)} />
            <div className="relative bg-white w-full max-w-md mx-auto rounded-2xl shadow-2xl border border-gray-200 p-6 z-10">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-black mb-1">Service Capacity / Balance Reached</h3>
                  <p className="text-sm text-gray-700">{aiWarning}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={() => setAiWarning(null)} className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-all duration-200">OK</button>
              </div>
            </div>
          </div>
        )}
        {toast && (
          <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-right-full duration-300">
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 text-black px-6 py-4 rounded-xl shadow-xl text-sm font-medium max-w-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  {toast}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
