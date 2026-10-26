// ArticleCMS — where generated articles are read, edited and published.
//
// Bobby, 26 October: "Let's get an interface up to be able to see all the
// articles nicely, filter through them, scroll down a list of them... any
// updates that Kris needs to make to add links or anything else can happen
// there too. So that when she clicks publish she can link it to the
// appropriate website, it creates the new templated page."
//
// The Article Generator keeps making articles and nothing here changes it.
// This tool reads the same articles. The first save of one makes a post: the
// CMS's own copy, so a rewrite in the generator can never wipe out the links
// an editor added. Publish copies that working copy to the live copy, and a
// site's blog template — one page per site, set up once in Webstudio — reads
// the live copy by address. Nothing to create per article, nothing to rebuild.
//
// See supabase/migrations/20261027_001_article_cms.sql for the tables and for
// what a site's template calls.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Copy, ExternalLink, EyeOff, Globe,
  Loader2, Newspaper, Plus, RotateCcw, Rocket, Save, Search, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ResearchArticle } from '../lib/supabase';
import { articleUrl, sha256, slugify, toArticleHtml, wordCount } from '../lib/articleHtml';
import ArticleEditor from './ArticleEditor';

/* ── shapes ────────────────────────────────────────────────────────────── */

type Site = {
  id: string;
  key: string;
  name: string;
  domain: string | null;
  blog_path: string;
  active: boolean;
};

type Post = {
  research_id: number;
  site_id: string | null;
  slug: string | null;
  title: string;
  content: string;
  excerpt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  cover_image: string | null;
  source_keyword: string | null;
  source_business: string | null;
  source_hash: string | null;
  status: 'draft' | 'published';
  published_site_id: string | null;
  published_slug: string | null;
  published_title: string | null;
  published_content: string | null;
  published_excerpt: string | null;
  published_seo_title: string | null;
  published_seo_description: string | null;
  published_cover_image: string | null;
  first_published_at: string | null;
  published_at: string | null;
  updated_at: string;
};

// The generator's current version of the article (rpc_article_source).
type Source = {
  title: string | null;
  content: string | null;
  keyword: string | null;
  business_name: string | null;
  website: string | null;
  status: string | null;
  doc_link: string | null;
  created_by_name: string | null;
};

type PostSummary = Pick<Post,
  'research_id' | 'status' | 'site_id' | 'slug' | 'published_site_id' | 'published_slug' | 'title'
  | 'source_keyword' | 'source_business' | 'first_published_at' | 'published_at' | 'updated_at'>;

const SUMMARY_COLUMNS = 'research_id,status,site_id,slug,published_site_id,published_slug,title,source_keyword,source_business,first_published_at,published_at,updated_at';

// One line of the list, whichever tab it came from.
type Row = {
  id: number;
  title: string;
  keyword: string | null;
  business: string | null;
  generatorStatus: string | null;
  createdBy: string | null;
  written: boolean;
  post: PostSummary | null;
};

type Tab = 'all' | 'published' | 'drafts';

const GENERATOR_STATUS: Record<string, string> = {
  new: 'New',
  writing: 'Writing',
  Used: 'Completed',
  processing: 'Processing',
};

const PAGE = 24;

const errorText = (e: unknown) =>
  e instanceof Error ? e.message
    : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message)
      : 'Something went wrong.';

// The tables are not there until the migration has been run once.
const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /schema cache|does not exist/i.test(e.message ?? ''));

const ago = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return '—';
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? 'an hour ago' : `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// Saved since it last went live: the live article is not what is on screen.
const editedSinceLive = (p: Pick<Post, 'status' | 'updated_at' | 'published_at'>) =>
  p.status === 'published' && !!p.published_at && new Date(p.updated_at).getTime() > new Date(p.published_at).getTime() + 1000;

/* ── the tool ──────────────────────────────────────────────────────────── */

export default function ArticleCMS({ onBackToLaunch }: { onBackToLaunch?: () => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [sitesOpen, setSitesOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const loadSites = useCallback(async () => {
    const { data, error } = await supabase.from('article_sites').select('*').order('name');
    if (error) {
      setSetupNeeded(isMissingTable(error));
      setSites([]);
      return;
    }
    setSetupNeeded(false);
    setSites((data ?? []) as Site[]);
  }, []);

  useEffect(() => { void loadSites(); }, [loadSites]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const closeEditor = () => {
    if (editorDirty && !window.confirm('You have unsaved changes. Leave without saving them?')) return;
    setOpenId(null);
    setEditorDirty(false);
    setListVersion(v => v + 1);
  };

  return (
    <div className="min-h-screen bg-slate-100/70">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-3">
            <button
              onClick={openId !== null ? closeEditor : onBackToLaunch}
              className="-ml-2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
              title={openId !== null ? 'Back to all articles' : 'Back'}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm shadow-orange-600/20">
              <Newspaper className="h-4 w-4 text-white" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold leading-tight text-slate-900">Article CMS</h1>
              <p className="truncate text-xs text-slate-500">
                Every article in one place. Add links, set the SEO, publish to the right site.
              </p>
            </div>
            <button
              onClick={() => setSitesOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              <Globe className="h-4 w-4" />
              Sites
              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{sites.length}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {setupNeeded ? (
          <SetupNeeded onRetry={() => void loadSites()} />
        ) : openId === null ? (
          <ArticleList sites={sites} version={listVersion} onOpen={setOpenId} />
        ) : (
          <ArticleEdit
            key={openId}
            researchId={openId}
            sites={sites}
            onBack={closeEditor}
            onDirtyChange={setEditorDirty}
            onToast={setToast}
            onOpenSites={() => setSitesOpen(true)}
          />
        )}
      </main>

      {sitesOpen && (
        <SitesPanel sites={sites} onChanged={() => void loadSites()} onClose={() => setSitesOpen(false)} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex max-w-[min(640px,calc(100%-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
          <span className="min-w-0 break-words">{toast}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

function SetupNeeded({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">The CMS is not in the database yet</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Run <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px]">supabase/migrations/20261027_001_article_cms.sql</code> once
            in the Supabase SQL editor, then try again.
          </p>
          <button onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── the list ──────────────────────────────────────────────────────────── */

function ArticleList({ sites, version, onOpen }: { sites: Site[]; version: number; onOpen: (id: number) => void }) {
  const [tab, setTab] = useState<Tab>('all');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [generatorStatus, setGeneratorStatus] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ all: number | null; published: number | null; drafts: number | null }>({ all: null, published: null, drafts: null });

  const pageRef = useRef(0);
  const tokenRef = useRef(0);
  const busyRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // Typing settles before the database is asked.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const siteName = useCallback((id: string | null) => sites.find(s => s.id === id)?.name ?? null, [sites]);

  const loadCounts = useCallback(async () => {
    const [all, published, drafts] = await Promise.all([
      supabase.rpc('rpc_research_count', { p_search: null, p_status: null }),
      supabase.from('article_posts').select('research_id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('article_posts').select('research_id', { count: 'exact', head: true }).eq('status', 'draft'),
    ]);
    setCounts({
      all: typeof all.data === 'number' ? all.data : null,
      published: published.count ?? null,
      drafts: drafts.count ?? null,
    });
  }, []);

  // Every article the generator has, a page at a time, with what the CMS knows about each.
  const fetchAll = useCallback(async (page: number) => {
    const from = page * PAGE;
    const params = { p_search: q || null, p_status: generatorStatus === 'all' ? null : generatorStatus };
    const [list, count] = await Promise.all([
      supabase.rpc('rpc_research_list', { ...params, p_from: from, p_to: from + PAGE - 1 }),
      page === 0 ? supabase.rpc('rpc_research_count', params) : Promise.resolve({ data: null, error: null }),
    ]);
    if (list.error) throw list.error;
    const articles = (list.data ?? []) as ResearchArticle[];
    const ids = articles.map(a => a.id);
    const posts = new Map<number, PostSummary>();
    if (ids.length) {
      const { data, error } = await supabase.from('article_posts').select(SUMMARY_COLUMNS).in('research_id', ids);
      if (error && !isMissingTable(error)) throw error;
      for (const p of (data ?? []) as PostSummary[]) posts.set(Number(p.research_id), p);
    }
    return {
      rows: articles.map((a): Row => ({
        id: a.id,
        title: posts.get(a.id)?.title || a.title,
        keyword: a.keyword,
        business: a.business_name ?? null,
        generatorStatus: a.status,
        createdBy: a.created_by_name ?? null,
        written: !!(a.content ?? '').trim(),
        post: posts.get(a.id) ?? null,
      })),
      total: typeof count.data === 'number' ? count.data : undefined,
    };
  }, [q, generatorStatus]);

  // Posts only: what is live, or what is saved here and not live yet.
  const fetchPosts = useCallback(async (page: number) => {
    const from = page * PAGE;
    const live = tab === 'published';
    let query = supabase
      .from('article_posts')
      .select(SUMMARY_COLUMNS, { count: 'exact' })
      .eq('status', live ? 'published' : 'draft')
      .order(live ? 'published_at' : 'updated_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (siteFilter !== 'all') query = query.eq(live ? 'published_site_id' : 'site_id', siteFilter);
    // Quoted, so a dot or a space in the search cannot break the filter.
    const term = q.replace(/[,()"*%\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) query = query.or(`title.ilike."*${term}*",source_keyword.ilike."*${term}*",source_business.ilike."*${term}*"`);
    const { data, error, count } = await query;
    if (error) throw error;
    return {
      rows: ((data ?? []) as PostSummary[]).map((p): Row => ({
        id: Number(p.research_id),
        title: p.title,
        keyword: p.source_keyword,
        business: p.source_business,
        generatorStatus: null,
        createdBy: null,
        written: true,
        post: p,
      })),
      total: count ?? undefined,
    };
  }, [tab, q, siteFilter]);

  const load = useCallback(async (reset: boolean) => {
    if (busyRef.current && !reset) return;
    const token = reset ? ++tokenRef.current : tokenRef.current;
    if (reset) { pageRef.current = 0; setDone(false); setTotal(null); setRows([]); }
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = pageRef.current;
      const result = tab === 'all' ? await fetchAll(page) : await fetchPosts(page);
      if (token !== tokenRef.current) return; // a newer filter took over
      setRows(prev => (page === 0 ? result.rows : [...prev, ...result.rows]));
      if (result.total !== undefined) setTotal(result.total);
      pageRef.current = page + 1;
      if (result.rows.length < PAGE) setDone(true);
    } catch (e) {
      if (token === tokenRef.current) { setError(errorText(e)); setDone(true); }
    } finally {
      if (token === tokenRef.current) { busyRef.current = false; setLoading(false); }
    }
  }, [tab, fetchAll, fetchPosts]);

  useEffect(() => { void load(true); }, [load, version]);
  useEffect(() => { void loadCounts(); }, [loadCounts, version]);

  // Scroll to the end and the next page comes in.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const doneRef = useRef(done);
  useEffect(() => { doneRef.current = done; }, [done]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !doneRef.current) void loadRef.current(false);
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const tabs: { value: Tab; label: string; count: number | null }[] = [
    { value: 'all', label: 'All articles', count: counts.all },
    { value: 'published', label: 'Live', count: counts.published },
    { value: 'drafts', label: 'Drafts', count: counts.drafts },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/50">
          {tabs.map(t => (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); setSiteFilter('all'); }}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                tab === t.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.label}
              {t.count !== null && (
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${tab === t.value ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t.count.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search title, keyword or business…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm text-slate-800 shadow-sm shadow-slate-200/50 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          />
          {qInput && (
            <button onClick={() => setQInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" title="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {tab === 'all' ? (
          <Select
            value={generatorStatus}
            onChange={setGeneratorStatus}
            options={[{ value: 'all', label: 'Every status' }, ...Object.entries(GENERATOR_STATUS).map(([value, label]) => ({ value, label }))]}
          />
        ) : (
          <Select
            value={siteFilter}
            onChange={setSiteFilter}
            options={[{ value: 'all', label: 'Every site' }, ...sites.map(s => ({ value: s.id, label: s.name }))]}
          />
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <X className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
        {rows.length === 0 && !loading && !error ? (
          <div className="px-6 py-16 text-center">
            <Newspaper className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {q ? 'Nothing matches that search.'
                : tab === 'published' ? 'Nothing is live yet.'
                  : tab === 'drafts' ? 'No drafts. An article becomes a draft the first time it is saved here.'
                    : 'No articles yet.'}
            </p>
            {tab === 'published' && !q && (
              <p className="mt-1 text-xs text-slate-500">Open an article, choose its site and press Publish.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(r => (
              <li key={r.id}>
                <button onClick={() => onOpen(r.id)} className="group flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 group-hover:text-blue-700">
                        {r.title || 'Untitled article'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {r.keyword && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{r.keyword}</span>}
                      {r.business && <span>{r.business}</span>}
                      {r.createdBy && <span>by {r.createdBy}</span>}
                      {r.post && <span>edited {ago(r.post.updated_at)}</span>}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                    <PostBadge post={r.post} siteName={siteName} />
                    {r.generatorStatus && !r.written && (
                      <span className="text-[11px] font-medium text-slate-400">{GENERATOR_STATUS[r.generatorStatus] ?? r.generatorStatus} · not written yet</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div ref={sentinel} className="border-t border-slate-100 px-5 py-3 text-center text-xs text-slate-400">
          {loading ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading articles…</span>
          ) : done && rows.length > 0 ? (
            <span>{total !== null ? `All ${total.toLocaleString()} shown` : 'That is all of them'}</span>
          ) : !done && rows.length > 0 ? (
            <button onClick={() => void load(false)} className="font-medium text-blue-600 hover:underline">Load more</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PostBadge({ post, siteName }: { post: PostSummary | null; siteName: (id: string | null) => string | null }) {
  if (!post) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Not in the CMS</span>;
  if (post.status === 'published') {
    return (
      <span className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live{siteName(post.published_site_id) ? ` on ${siteName(post.published_site_id)}` : ''}
        </span>
        {editedSinceLive(post) && <span className="text-[11px] font-medium text-amber-600">changes not live yet</span>}
      </span>
    );
  }
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Draft</span>;
}

/* ── one article ───────────────────────────────────────────────────────── */

type Form = {
  title: string;
  content: string;
  excerpt: string;
  seo_title: string;
  seo_description: string;
  cover_image: string;
  site_id: string;
  slug: string;
};

const formOf = (p: Post): Form => ({
  title: p.title ?? '',
  content: p.content ?? '',
  excerpt: p.excerpt ?? '',
  seo_title: p.seo_title ?? '',
  seo_description: p.seo_description ?? '',
  cover_image: p.cover_image ?? '',
  site_id: p.site_id ?? '',
  slug: p.slug ?? '',
});

// Typing an address: what the database will accept, without fighting the
// hyphen someone is in the middle of typing. slugify() tidies the ends on save.
const typedSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+/, '');

// A site whose domain matches the article's website field, if there is one.
const siteFor = (sites: Site[], website: string | null | undefined) => {
  const host = String(website ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!host) return '';
  return sites.find(s => String(s.domain ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') === host)?.id ?? '';
};

function ArticleEdit({ researchId, sites, onBack, onDirtyChange, onToast, onOpenSites }: {
  researchId: number;
  sites: Site[];
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onToast: (text: string) => void;
  onOpenSites: () => void;
}) {
  const [post, setPost] = useState<Post | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<Form | null>(null);
  const [baseline, setBaseline] = useState<Form | null>(null);
  const [editorSeed, setEditorSeed] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const seedIsBaseline = useRef(true);
  const [slugTouched, setSlugTouched] = useState(false);

  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [rewritten, setRewritten] = useState(false);
  // Set by "Use the new version": recorded with the next save, so leaving
  // without saving brings the notice back next time.
  const [adoptedHash, setAdoptedHash] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'unpublish'>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [{ data: postRow, error: postError }, { data: src, error: srcError }] = await Promise.all([
      supabase.from('article_posts').select('*').eq('research_id', researchId).maybeSingle(),
      supabase.rpc('rpc_article_source', { p_research_id: researchId }),
    ]);
    if (postError) { setLoadError(errorText(postError)); setLoading(false); return; }
    if (srcError) { setLoadError(errorText(srcError)); setLoading(false); return; }

    const s = (src ?? null) as Source | null;
    const p = (postRow ?? null) as Post | null;
    const hash = await sha256(s?.content ?? '');
    setSource(s);
    setPost(p);
    setSourceHash(hash);

    let f: Form;
    if (p) {
      f = formOf(p);
      setSlugTouched(!!p.slug);
      setRewritten(!!s && !!p.source_hash && p.source_hash !== hash && !!(s.content ?? '').trim());
    } else {
      const title = (s?.title ?? '').trim();
      f = {
        title,
        content: toArticleHtml(s?.content),
        excerpt: '',
        seo_title: '',
        seo_description: '',
        cover_image: '',
        site_id: siteFor(sites, s?.website),
        slug: slugify(title),
      };
      setSlugTouched(false);
      setRewritten(false);
    }
    seedIsBaseline.current = true;
    setForm(f);
    setBaseline(f);
    setEditorSeed(f.content);
    setEditorKey(k => k + 1);
    setLoading(false);
  }, [researchId, sites]);

  // Loaded once per article; the site list arriving later must not reload it.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { void loadRef.current(); }, [researchId]);

  const dirty = !!form && !!baseline && JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback((p: Partial<Form>) => setForm(f => (f ? { ...f, ...p } : f)), []);

  // The editor hands back the content as it normalised it. When that content
  // is what was loaded, the normalised version is the baseline too, so merely
  // opening an article never counts as an edit.
  const onEditorReady = useCallback((html: string) => {
    setForm(f => (f ? { ...f, content: html } : f));
    if (seedIsBaseline.current) setBaseline(b => (b ? { ...b, content: html } : b));
  }, []);
  const onEditorChange = useCallback((html: string) => set({ content: html }), [set]);

  // Until someone edits the address, it follows the title — but never once
  // the article has been live, because a changed address breaks links to it.
  const onTitle = (title: string) => {
    const follow = !slugTouched && post?.status !== 'published' && !post?.first_published_at;
    set(follow ? { title, slug: slugify(title) } : { title });
  };

  const site = sites.find(s => s.id === form?.site_id) ?? null;
  const liveSite = sites.find(s => s.id === post?.published_site_id) ?? null;
  const url = form ? articleUrl(site?.domain, site?.blog_path, slugify(form.slug)) : null;
  const liveUrl = post?.status === 'published' ? articleUrl(liveSite?.domain, liveSite?.blog_path, post.published_slug) : null;

  // Is another live article already at this address?
  useEffect(() => {
    if (!form?.site_id || !form.slug) { setConflict(null); return; }
    const slug = slugify(form.slug);
    const t = window.setTimeout(async () => {
      const { data } = await supabase
        .from('article_posts')
        .select('research_id,title')
        .eq('published_site_id', form.site_id)
        .eq('published_slug', slug)
        .eq('status', 'published')
        .neq('research_id', researchId)
        .limit(1);
      const other = (data ?? [])[0] as { title: string } | undefined;
      setConflict(other ? other.title || 'another article' : null);
    }, 400);
    return () => window.clearTimeout(t);
  }, [form?.site_id, form?.slug, researchId]);

  const save = useCallback(async (opts?: { quiet?: boolean }): Promise<boolean> => {
    if (!form) return false;
    setError(null);
    setBusy('save');
    try {
      const row = {
        research_id: researchId,
        title: form.title.trim(),
        content: form.content,
        excerpt: form.excerpt.trim() || null,
        seo_title: form.seo_title.trim() || null,
        seo_description: form.seo_description.trim() || null,
        cover_image: form.cover_image.trim() || null,
        site_id: form.site_id || null,
        slug: slugify(form.slug) || null,
        ...(post ? {} : {
          source_keyword: source?.keyword ?? null,
          source_business: source?.business_name ?? null,
          source_hash: sourceHash,
        }),
        ...(post && adoptedHash ? { source_hash: adoptedHash } : {}),
      };
      const { data, error: err } = await supabase.from('article_posts').upsert(row, { onConflict: 'research_id' }).select().single();
      if (err) throw err;
      const saved = data as Post;
      const f = formOf(saved);
      setAdoptedHash(null);
      seedIsBaseline.current = true;
      setPost(saved);
      setForm(prev => (prev ? { ...prev, slug: f.slug } : f));
      setBaseline(f);
      if (!opts?.quiet) onToast(post ? 'Saved.' : 'Saved as a draft. Nothing is on a website until you publish.');
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, [form, post, researchId, source, sourceHash, adoptedHash, onToast]);

  // Ctrl+S saves, the way every editor does.
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saveRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const publish = async () => {
    if (!form) return;
    if (!form.site_id) { setError('Choose which site this article goes on.'); return; }
    if (!(dirty || !post) || (await save({ quiet: true }))) {
      setBusy('publish');
      setError(null);
      const { data, error: err } = await supabase.rpc('rpc_article_publish', { p_research_id: researchId });
      setBusy(null);
      if (err) { setError(errorText(err)); return; }
      const { data: fresh } = await supabase.from('article_posts').select('*').eq('research_id', researchId).single();
      if (fresh) { setPost(fresh as Post); setBaseline(formOf(fresh as Post)); }
      const live = (data as { url?: string | null } | null)?.url;
      onToast(live ? `Live at ${live}` : 'Published. Give the site a domain in Sites to see its address.');
    }
  };

  const unpublish = async () => {
    if (!window.confirm('Take this article off the website? Its address will stop working until it is published again.')) return;
    setBusy('unpublish');
    setError(null);
    const { error: err } = await supabase.rpc('rpc_article_unpublish', { p_research_id: researchId });
    setBusy(null);
    if (err) { setError(errorText(err)); return; }
    const { data: fresh } = await supabase.from('article_posts').select('*').eq('research_id', researchId).single();
    if (fresh) setPost(fresh as Post);
    onToast('Taken off the website. It is a draft again.');
  };

  // The generator rewrote the article after this post was made from it.
  const useNewVersion = () => {
    if (!source) return;
    if (!window.confirm('Replace the text here with the generator\'s new version? Links and edits made here will be lost.')) return;
    const html = toArticleHtml(source.content);
    seedIsBaseline.current = false;
    set({ content: html, title: form?.title || (source.title ?? '') });
    setEditorSeed(html);
    setEditorKey(k => k + 1);
    setRewritten(false);
    setAdoptedHash(sourceHash);
  };
  const keepMine = () => {
    setRewritten(false);
    void supabase.from('article_posts').update({ source_hash: sourceHash }).eq('research_id', researchId);
  };

  const words = useMemo(() => (form ? wordCount(form.content) : 0), [form]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening the article…
      </div>
    );
  }
  if (loadError || !form) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm">
        Could not open this article: {loadError ?? 'unknown error'}
        <div className="mt-4"><button onClick={onBack} className="font-semibold text-slate-700 hover:underline">Back to all articles</button></div>
      </div>
    );
  }

  const live = post?.status === 'published';
  const changesNotLive = live && !!post && (
    dirty || form.title !== (post.published_title ?? '') || form.content !== (post.published_content ?? '')
    || form.excerpt !== (post.published_excerpt ?? '') || form.seo_title !== (post.published_seo_title ?? '')
    || form.seo_description !== (post.published_seo_description ?? '') || form.cover_image !== (post.published_cover_image ?? '')
    || form.site_id !== (post.published_site_id ?? '') || slugify(form.slug) !== (post.published_slug ?? '')
  );
  const addressMoved = live && !!post && (form.site_id !== (post.published_site_id ?? '') || slugify(form.slug) !== (post.published_slug ?? ''));

  return (
    <div>
      {/* The bar that stays put: where this article stands, and its two actions. */}
      <div className="sticky top-16 z-20 -mx-4 mb-5 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> All articles
          </button>
          <span className="h-5 w-px bg-slate-200" />
          {!post ? (
            <span className="rounded-full bg-slate-200/70 px-2.5 py-1 text-xs font-semibold text-slate-600">Not saved here yet</span>
          ) : live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live{liveSite ? ` on ${liveSite.name}` : ''}
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Draft</span>
          )}
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
            </span>
          ) : post ? (
            <span className="hidden text-xs text-slate-400 sm:inline">Saved {ago(post.updated_at)}</span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void save()}
              disabled={!!busy || (!dirty && !!post)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
              title="Ctrl+S"
            >
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {post ? 'Save' : 'Save draft'}
            </button>
            <button
              onClick={() => void publish()}
              disabled={!!busy || (live && !changesNotLive)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {live ? (changesNotLive ? 'Update live article' : 'Live and up to date') : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <X className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700"><X className="h-4 w-4" /></button>
        </div>
      )}

      {rewritten && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">The Article Generator has a newer version of this article than the one edited here.</span>
          <button onClick={keepMine} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">Keep mine</button>
          <button onClick={useNewVersion} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Use the new version</button>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <textarea
            value={form.title}
            onChange={(e) => onTitle(e.target.value.replace(/\n/g, ' '))}
            rows={1}
            placeholder="Article title"
            className="w-full resize-none overflow-hidden bg-transparent text-[28px] font-bold leading-tight tracking-tight text-slate-900 outline-none placeholder:text-slate-300 sm:text-[34px]"
            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
          />

          {!(source?.content ?? '').trim() && !post && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              This article has not been written yet in the Article Generator. You can write it here, or come back once it has been.
            </div>
          )}

          <ArticleEditor key={editorKey} initialContent={editorSeed} onChange={onEditorChange} onReady={onEditorReady} />

          <div className="flex items-center justify-between px-1 text-xs text-slate-400">
            <span>{words.toLocaleString()} words · about {Math.max(1, Math.round(words / 230))} min read</span>
            <span>Ctrl+K adds a link · Ctrl+S saves</span>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[8.5rem]">
          <Card title="Publishing">
            <Field label="Site">
              {sites.length ? (
                <Select
                  wide
                  value={form.site_id || ''}
                  onChange={(v) => set({ site_id: v })}
                  options={[{ value: '', label: 'Choose a site…' }, ...sites.filter(s => s.active || s.id === form.site_id).map(s => ({ value: s.id, label: s.name }))]}
                />
              ) : (
                <button onClick={onOpenSites} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
                  <Plus className="h-4 w-4" /> Add the first site
                </button>
              )}
            </Field>

            <Field label="Address" hint={site ? `${site.blog_path.replace(/\/+$/, '')}/` : undefined}>
              <input
                value={form.slug}
                onChange={(e) => { setSlugTouched(true); set({ slug: typedSlug(e.target.value) }); }}
                onBlur={() => set({ slug: slugify(form.slug) })}
                placeholder="the-address-of-this-article"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[12px] text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              {conflict && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-red-600">"{conflict}" is already live at this address on {site?.name}. Pick another.</p>
              )}
              {addressMoved && !conflict && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-amber-600">This changes the address of a live article. Links to the old address will stop working once you update it.</p>
              )}
            </Field>

            {url ? (
              <div className="truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500" title={url}>{url}</div>
            ) : site && !site.domain ? (
              <p className="text-[11px] text-slate-400">Give {site.name} a domain in Sites to see the full address.</p>
            ) : null}

            {live && post && (
              <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-800">
                <div>Live since {post.first_published_at ? new Date(post.first_published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} · last update {ago(post.published_at)}</div>
                {changesNotLive && <div className="font-semibold text-amber-700">Changes here are not live yet. Update the live article to publish them.</div>}
                <div className="flex flex-wrap gap-3">
                  {liveUrl && (
                    <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
                      Open the live page <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button onClick={() => void unpublish()} disabled={!!busy} className="inline-flex items-center gap-1 font-semibold text-red-600 hover:underline disabled:opacity-50">
                    <EyeOff className="h-3 w-3" /> Take off the website
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card title="Search engines" hint="What Google shows. Left empty, the title and the start of the article are used.">
            <Field label="SEO title" counter={{ value: form.seo_title.length, limit: 60 }}>
              <input
                value={form.seo_title}
                onChange={(e) => set({ seo_title: e.target.value })}
                placeholder={form.title || 'Same as the title'}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
            </Field>
            <Field label="Meta description" counter={{ value: form.seo_description.length, limit: 155 }}>
              <textarea
                value={form.seo_description}
                onChange={(e) => set({ seo_description: e.target.value })}
                rows={3}
                placeholder="One or two sentences on what the article answers."
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
            </Field>
          </Card>

          <Card title="On the blog page">
            <Field label="Excerpt" hint="The summary under the title in the blog list.">
              <textarea
                value={form.excerpt}
                onChange={(e) => set({ excerpt: e.target.value })}
                rows={3}
                placeholder="Left empty, the start of the article is used."
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
            </Field>
            <Field label="Cover image" hint="The address of an image already on the web.">
              <input
                value={form.cover_image}
                onChange={(e) => set({ cover_image: e.target.value })}
                placeholder="https://…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[12px] text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              {/^https?:\/\//i.test(form.cover_image.trim()) && (
                <img src={form.cover_image.trim()} alt="" className="mt-2 aspect-[16/9] w-full rounded-lg border border-slate-200 object-cover" />
              )}
            </Field>
          </Card>

          <Card title="From the Article Generator">
            <dl className="space-y-2 text-xs">
              <Fact label="Keyword" value={source?.keyword ?? post?.source_keyword ?? null} />
              <Fact label="Business" value={source?.business_name ?? post?.source_business ?? null} />
              <Fact label="Status" value={source?.status ? (GENERATOR_STATUS[source.status] ?? source.status) : null} />
              <Fact label="Made by" value={source?.created_by_name ?? null} />
              {source?.doc_link && /^https?:\/\//i.test(source.doc_link) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Document</dt>
                  <dd><a href={source.doc_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">Open <ExternalLink className="h-3 w-3" /></a></dd>
                </div>
              )}
              {!source && <p className="text-slate-400">The generator no longer has this article. What is saved here is unaffected.</p>}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ── sites ─────────────────────────────────────────────────────────────── */

// The sites an article can be published to, and what each site's blog
// template in Webstudio needs to read its articles.
function SitesPanel({ sites, onChanged, onClose }: { sites: Site[]; onChanged: () => void; onClose: () => void }) {
  const [editing, setEditing] = useState<Site | 'new' | null>(sites.length ? null : 'new');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Sites</h2>
            <p className="mt-0.5 text-sm text-slate-500">Where articles can be published. Each site's blog template reads its own.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-6 py-5">
          {sites.map(s => (
            editing !== 'new' && editing?.id === s.id
              ? <SiteForm key={s.id} site={s} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />
              : <SiteCard key={s.id} site={s} onEdit={() => setEditing(s)} />
          ))}
          {editing === 'new'
            ? <SiteForm site={null} onDone={() => { setEditing(null); onChanged(); }} onCancel={sites.length ? () => setEditing(null) : undefined} />
            : (
              <button
                onClick={() => setEditing('new')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-400 transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600"
              >
                <Plus className="h-4 w-4" /> Add a site
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

function SiteCard({ site, onEdit }: { site: Site; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  const api = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.VITE_SUPABASE_ANON_KEY ?? '';
  const path = site.blog_path.replace(/\/+$/, '');
  const one = `${api}/rest/v1/rpc/public_article?site=${site.key}&slug=`;
  const list = `${api}/rest/v1/rpc/public_articles?site=${site.key}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${site.active ? 'bg-emerald-500' : 'bg-slate-300'}`} title={site.active ? 'On' : 'Off'} />
            <span className="truncate text-sm font-semibold text-slate-900">{site.name}</span>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{site.key}</code>
          </div>
          <div className="mt-0.5 truncate pl-3.5 font-mono text-[11px] text-slate-400">
            {site.domain ? `${site.domain}${path}/…` : 'No domain yet'}
            {!site.active && <span className="ml-2 font-sans text-amber-600">off — its articles are not served</span>}
          </div>
        </div>
        <button onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
          Webstudio setup <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={onEdit} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
          <p className="leading-relaxed">
            Done once per site. In its Webstudio project, an article page at <code className="font-mono">{path}/:slug</code> reads the
            article below, and the blog page at <code className="font-mono">{path}</code> reads the list. Both send the header
            <code className="ml-1 font-mono">apikey</code> with the public key.
          </p>
          <CopyLine label="Article" value={`${one}{slug}`} copy={one} />
          <CopyLine label="Blog list" value={`${list}&page=1&per_page=12`} copy={list} />
          <CopyLine label="apikey header" value={key.length > 24 ? `${key.slice(0, 10)}…${key.slice(-6)}` : key} copy={key} />
          <p className="text-[11px] text-slate-400">
            An address with nothing live behind it answers <code className="font-mono">{'{"found": false}'}</code>, so the template can show its 404.
          </p>
        </div>
      )}
    </div>
  );
}

function SiteForm({ site, onDone, onCancel }: { site: Site | null; onDone: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(site?.name ?? '');
  const [key, setKey] = useState(site?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(!!site);
  const [domain, setDomain] = useState(site?.domain ?? '');
  const [blogPath, setBlogPath] = useState(site?.blog_path ?? '/blog');
  const [active, setActive] = useState(site?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const row = {
      name: name.trim(),
      key: slugify(key),
      domain: domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '') || null,
      blog_path: ('/' + blogPath.trim().toLowerCase().replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9/_-]+/g, '-')).replace(/\/$/, '') || '/blog',
      active,
    };
    if (!row.name) { setError('Give the site a name.'); return; }
    if (!row.key) { setError('Give the site a short key.'); return; }
    if (site && site.active && !active && !window.confirm(`Switch ${site.name} off? Every article live on it stops being served until it is switched back on.`)) return;
    setSaving(true);
    const { error: err } = site
      ? await supabase.from('article_sites').update(row).eq('id', site.id)
      : await supabase.from('article_sites').insert(row);
    setSaving(false);
    if (err) {
      setError(/duplicate|unique/i.test(err.message) ? `Another site already uses the key "${row.key}".` : err.message);
      return;
    }
    onDone();
  };

  const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50';

  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-white p-4 shadow-sm ring-4 ring-blue-50">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input value={name} onChange={(e) => { setName(e.target.value); if (!keyTouched) setKey(slugify(e.target.value, 40)); }} placeholder="Ground Standard" className={input} />
        </Field>
        <Field label="Key" hint={site ? 'The template asks for articles by this. Changing it breaks the template until it is updated too.' : 'The template asks for articles by this.'}>
          <input value={key} onChange={(e) => { setKeyTouched(true); setKey(typedSlug(e.target.value)); }} placeholder="groundstandard" className={`${input} font-mono text-[12px]`} />
        </Field>
        <Field label="Domain" hint="The live address. Shown as each article's URL.">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="www.groundstandard.com" className={`${input} font-mono text-[12px]`} />
        </Field>
        <Field label="Blog path">
          <input value={blogPath} onChange={(e) => setBlogPath(e.target.value)} placeholder="/blog" className={`${input} font-mono text-[12px]`} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        On — its live articles are served
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>}
        <button onClick={() => void submit()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {site ? 'Save site' : 'Add site'}
        </button>
      </div>
    </div>
  );
}

/* ── small parts ───────────────────────────────────────────────────────── */

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, counter, children }: {
  label: string; hint?: string; counter?: { value: number; limit: number }; children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        {counter && (
          <span className={`text-[11px] tabular-nums ${counter.value > counter.limit ? 'font-semibold text-amber-600' : 'text-slate-400'}`}>
            {counter.value}/{counter.limit}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="flex-shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-slate-700" title={value ?? ''}>{value || '—'}</dd>
    </div>
  );
}

function Select({ value, onChange, options, wide }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; wide?: boolean;
}) {
  return (
    <div className={`relative ${wide ? 'w-full' : ''}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm shadow-slate-200/50 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 ${wide ? 'w-full' : ''}`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function CopyLine({ label, value, copy }: { label: string; value: string; copy: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-200" title={value}>{value}</code>
        <button
          onClick={() => { void navigator.clipboard.writeText(copy); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
          className="flex-shrink-0 text-slate-400 hover:text-white"
          title="Copy"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
