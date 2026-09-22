// FormReport — what came in through a form, inside the Custom Form Builder.
//
// Every submission is posted to our reporting webhook as well as to the CRM,
// and n8n writes that copy into form_submissions_v2 — the body as it arrived,
// with the typed columns filled in by a trigger (see the migration). Here the
// rows are cut two ways: inside a form, only that form's leads; on the list,
// every site at once. A row is tied to its form by id, then by slug, then by
// the name the embed sends, and a row with none of those falls back to the site
// it came from. Test leads never arrive here, and are hidden if one does.
//
// The presentation follows the Leads screen (FormSubmission.tsx) on purpose —
// websites first, then a table, then a details drawer — so the two read the
// same way. Forms built here have their own fields, so where that screen has
// Program and Consent columns this one has Answers.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Copy, Download, Globe, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { attributionOf } from '../lib/attribution';

export type SubmissionRow = {
  id: number;
  received_at: string;
  submitted_at: string | null;
  form_id: string | null;
  form_slug: string | null;
  form_name: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  answers: Record<string, unknown> | null;
  source_url: string | null;
  source_hostname: string | null;
  source_pathname: string | null;
  source_referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  is_test: boolean;
};

type FormLike = { id?: string; name: string; slug: string; site_hostname: string | null };

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const bareHost = (s: string | null | undefined) =>
  norm(s).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export const siteOf = (r: SubmissionRow) => {
  const fromUrl = (() => { try { return r.source_url ? new URL(r.source_url).hostname : ''; } catch { return ''; } })();
  return bareHost(r.source_hostname || fromUrl) || 'Unknown website';
};

export const matchesForm = (r: SubmissionRow, form: FormLike) => {
  if (r.form_id && form.id) return r.form_id === form.id;
  if (r.form_slug) return norm(r.form_slug) === norm(form.slug);
  if (r.form_name) return norm(r.form_name) === norm(form.name);
  const site = bareHost(form.site_hostname);
  return !!site && siteOf(r) === site;
};

// Same cadence as the Leads screen: poll, and re-pull when the tab comes back.
const POLL_MS = 30000;
const MOST = 5000;

export function useSubmissions() {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error: err } = await supabase
      .from('form_submissions_v2')
      .select('*')
      .eq('is_test', false)
      .order('submitted_at', { ascending: false })
      .limit(MOST);
    setBusy(false);
    if (err) { setError(err.message); setRows(cur => cur ?? []); return; }
    setRows((data ?? []) as SubmissionRow[]);
    setError(null);
    setAt(new Date());
  }, []);

  useEffect(() => {
    void load();
    const tick = () => { if (document.visibilityState !== 'hidden') void load(); };
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(id); window.removeEventListener('focus', tick); };
  }, [load]);

  return { rows, error, at, busy, reload: load };
}

/* ── reading a row ────────────────────────────────────────────────────── */

export const ago = (iso: string | null) => {
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

const fmt = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, opts).format(d);
};
const dateOnly = (iso: string | null) => fmt(iso, { year: 'numeric', month: 'short', day: '2-digit' });
const timeOnly = (iso: string | null) => fmt(iso, { hour: 'numeric', minute: '2-digit' });
const dateTime = (iso: string | null) => fmt(iso, { year: 'numeric', month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' });

const withinDays = (iso: string | null, days: number) =>
  !!iso && Date.now() - new Date(iso).getTime() < days * 86400000;

const newest = (rows: SubmissionRow[]) =>
  rows.reduce<string | null>((best, r) => (r.submitted_at && (!best || r.submitted_at > best) ? r.submitted_at : best), null);

// Quiet for a fortnight on a form that has had leads is the shape of the July
// outage: submissions still happening somewhere, nothing arriving here.
const STALE_DAYS = 14;

const PERSON = new Set(['first_name', 'last_name', 'firstName', 'lastName', 'name', 'email', 'phone']);
const answersOf = (r: SubmissionRow) =>
  Object.entries(r.answers ?? {}).filter(([k, v]) => !PERSON.has(k) && v !== '' && v !== null && v !== undefined);
const showValue = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const answerLine = (r: SubmissionRow) => answersOf(r).map(([k, v]) => `${k}: ${showValue(v)}`).join(' · ');

const personName = (r: SubmissionRow) =>
  r.name || [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unnamed contact';

// The campaign, from the utm columns the embed carried across pages, and
// failing that from the landing URL the way the Leads screen reads it.
const campaignOf = (r: SubmissionRow) => {
  const a = attributionOf(r);
  const source = r.utm_source || a.source;
  const medium = r.utm_medium || a.medium;
  const campaign = r.utm_campaign || a.campaign;
  const label = source || a.label;
  return { source, medium, campaign, clickId: a.clickId, label };
};

const primarySource = (r: SubmissionRow) =>
  r.source_url || r.source_referrer || [r.source_hostname, r.source_pathname].filter(Boolean).join('') || null;

/* ── one form ─────────────────────────────────────────────────────────── */

export function FormReport({ form, all, error, at, busy, onReload }: {
  form: FormLike & { report_enabled: boolean };
  all: SubmissionRow[] | null;
  error: string | null;
  at: Date | null;
  busy?: boolean;
  onReload: () => void;
}) {
  const rows = useMemo(() => (all ?? []).filter(r => matchesForm(r, form)), [all, form]);
  const sites = useMemo(() => groupBy(rows, siteOf), [rows]);

  return (
    <div className="space-y-5">
      {!form.report_enabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <span className="font-semibold">Keep a copy in our reporting</span> is off for this form, so new submissions are
          sent to the CRM only and will not appear here. Turn it on under <em>Where the lead goes</em>.
        </div>
      )}

      <Stats rows={rows} sites={sites} />

      <Panel
        title={form.name || form.slug}
        rows={rows}
        loading={all === null}
        error={error}
        at={at}
        busy={busy}
        onReload={onReload}
        fileTag={form.slug || 'form'}
        empty={<>Nothing yet for this form. A lead appears here when a visitor submits it on the site, tied to <span className="font-mono">{form.slug || form.name}</span>.</>}
      />
    </div>
  );
}

/* ── every site ───────────────────────────────────────────────────────── */

export function SitesReport({ all, error, at, busy, onReload, forms }: {
  all: SubmissionRow[] | null;
  error: string | null;
  at: Date | null;
  busy?: boolean;
  onReload: () => void;
  forms: FormLike[];
}) {
  const [site, setSite] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const rows = all ?? [];
  const sites = useMemo(() => groupBy(rows, siteOf), [rows]);
  const needle = q.trim().toLowerCase();
  const shownSites = needle ? sites.filter(s => s.key.toLowerCase().includes(needle)) : sites;

  const formLabel = (r: SubmissionRow) => {
    const f = forms.find(x => matchesForm(r, x));
    return f?.name || r.form_name || r.form_slug || null;
  };

  if (site) {
    const inSite = rows.filter(r => siteOf(r) === site);
    return (
      <div className="space-y-5">
        <Stats rows={inSite} sites={[]} />
        <Panel
          title={site}
          onBack={() => setSite(null)}
          rows={inSite}
          loading={false}
          error={error}
          at={at}
          busy={busy}
          onReload={onReload}
          fileTag={site}
          formLabel={formLabel}
          empty={<>No submissions from this site.</>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Stats rows={rows} sites={sites} />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
        <Toolbar
          title="Websites"
          sub={all === null ? 'Loading…' : `Showing: ${shownSites.length} / ${sites.length} (Total submissions: ${rows.length})`}
          q={q} onQ={setQ} placeholder="Search website…"
          at={at} busy={busy} onReload={onReload}
        />
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">Could not load submissions: {error}</div>}
        <div className="p-4">
          {all === null ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : !shownSites.length ? (
            <p className="px-2 py-8 text-center text-xs text-slate-400">
              {needle ? 'No websites match that search.' : 'No submissions have come in yet. They appear here the moment a visitor submits any of these forms.'}
            </p>
          ) : (
            <div className="space-y-3">
              {shownSites.map(g => {
                const last = newest(g.rows);
                const names = Array.from(new Set(g.rows.map(formLabel).filter(Boolean))) as string[];
                const quiet = g.rows.length > 2 && last && !withinDays(last, STALE_DAYS);
                return (
                  <button
                    key={g.key}
                    onClick={() => setSite(g.key)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <Globe className="h-4 w-4 flex-shrink-0 text-slate-400" />
                          <span className="truncate">{g.key}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {g.rows.length} submission{g.rows.length === 1 ? '' : 's'}
                          {names.length ? ` · ${names.join(' · ')}` : ''}
                          {last ? <> · last <span className={quiet ? 'font-medium text-amber-600' : ''}>{ago(last)}</span></> : ''}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold tabular-nums text-slate-700">{g.rows.length}</div>
                        <ChevronRight className="h-5 w-5 text-slate-400" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

function groupBy(rows: SubmissionRow[], key: (r: SubmissionRow) => string) {
  const map = new Map<string, SubmissionRow[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r); else map.set(k, [r]);
  }
  return Array.from(map.entries())
    .map(([k, rs]) => ({ key: k, rows: rs }))
    .sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key));
}

function Stats({ rows, sites }: { rows: SubmissionRow[]; sites: { key: string; rows: SubmissionRow[] }[] }) {
  const last = newest(rows);
  const week = rows.filter(r => withinDays(r.submitted_at, 7)).length;
  const quiet = rows.length > 2 && last && !withinDays(last, STALE_DAYS);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Leads" value={rows.length.toLocaleString()} />
      <Stat label="Last 7 days" value={week.toLocaleString()} />
      <Stat label="Last lead" value={ago(last)} tone={quiet ? 'warn' : undefined}
        hint={quiet ? `Nothing for over ${STALE_DAYS} days on a form that had leads — worth checking the site.` : undefined} />
      {sites.length > 1 && (
        <div className="sm:col-span-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="mr-1">Submitted from</span>
          {sites.map(s => (
            <span key={s.key} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-slate-600">
              {s.key} <span className="text-slate-400">· {s.rows.length}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' }) {
  return (
    <div className={`rounded-2xl border bg-white px-5 py-4 shadow-sm shadow-slate-200/50 ${tone === 'warn' ? 'border-amber-200' : 'border-slate-200'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'warn' ? 'text-amber-600' : 'text-slate-900'}`}>{value}</div>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-amber-600">{hint}</p>}
    </div>
  );
}

function Toolbar({ title, sub, onBack, q, onQ, placeholder, at, busy, onReload, right }: {
  title: string; sub: string; onBack?: () => void;
  q: string; onQ: (v: string) => void; placeholder: string;
  at: Date | null; busy?: boolean; onReload: () => void; right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
      {onBack && (
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-[11px] text-slate-500">{sub}</div>
      </div>
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400"
        />
      </div>
      {right}
      <span className="hidden items-center gap-1.5 text-[11px] font-medium text-emerald-600 lg:inline-flex" title={at ? `Updated ${timeOnly(at.toISOString())}` : ''}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Auto-updating
      </span>
      <button onClick={onReload} title="Refresh" className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

// The table, its search and campaign chips, selection and CSV, and the drawer.
function Panel({ title, onBack, rows, loading, error, at, busy, onReload, fileTag, empty, formLabel }: {
  title: string;
  onBack?: () => void;
  rows: SubmissionRow[];
  loading: boolean;
  error: string | null;
  at: Date | null;
  busy?: boolean;
  onReload: () => void;
  fileTag: string;
  empty: React.ReactNode;
  formLabel?: (r: SubmissionRow) => string | null;
}) {
  const [q, setQ] = useState('');
  const [campaign, setCampaign] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [details, setDetails] = useState<SubmissionRow | null>(null);

  useEffect(() => { setPicked(new Set()); setCampaign(null); }, [rows.length, title]);

  const campaigns = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) { const k = campaignOf(r).label; map.set(k, (map.get(k) ?? 0) + 1); }
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [rows]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''));
    const byCampaign = campaign ? sorted.filter(r => campaignOf(r).label === campaign) : sorted;
    if (!needle) return byCampaign;
    return byCampaign.filter(r =>
      [personName(r), r.email, r.phone, answerLine(r), r.form_name, r.form_slug, r.source_url, r.source_pathname, r.source_referrer, campaignOf(r).label, campaignOf(r).campaign]
        .filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [rows, campaign, needle]);

  const exportable = useMemo(() => {
    const chosen = shown.filter(r => picked.has(r.id));
    return chosen.length ? chosen : shown;
  }, [shown, picked]);
  const pickedInView = shown.filter(r => picked.has(r.id)).length;

  const copy = (v: string | null) => { if (v) void navigator.clipboard?.writeText?.(v); };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <Toolbar
        title={title}
        sub={loading ? 'Loading…' : `Showing: ${shown.length} / ${rows.length}`}
        onBack={onBack}
        q={q} onQ={setQ} placeholder="Search name, email, phone, any answer, URL…"
        at={at} busy={busy} onReload={onReload}
        right={
          <>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={shown.length > 0 && pickedInView === shown.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(shown.map(r => r.id)) : new Set())}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Select All
            </label>
            <button
              onClick={() => downloadCsv(exportable, fileTag)}
              disabled={!exportable.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              {pickedInView > 0 ? `Download Selected (${exportable.length})` : 'Download CSV'}
            </button>
          </>
        }
      />

      {error && <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">Could not load submissions: {error}</div>}

      {campaigns.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Campaign</span>
          <Chip on={campaign === null} onClick={() => setCampaign(null)}>All</Chip>
          {campaigns.map(c => (
            <Chip key={c.label} on={campaign === c.label} onClick={() => setCampaign(campaign === c.label ? null : c.label)}>
              {c.label} <span className={campaign === c.label ? 'text-slate-300' : 'text-slate-400'}>{c.count}</span>
            </Chip>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 p-5">{[0, 1, 2].map(i => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : !shown.length ? (
        <p className="px-5 py-10 text-center text-xs leading-relaxed text-slate-400">{needle || campaign ? 'No records match.' : empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-10 px-4 py-2.5"><span className="sr-only">Select</span></th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Answers</th>
                <th className="px-3 py-2.5">Campaign</th>
                <th className="px-3 py-2.5">Source URL</th>
                <th className="px-3 py-2.5">Source Path</th>
                <th className="px-3 py-2.5">Referrer</th>
                {formLabel && <th className="px-3 py-2.5">Form Name</th>}
                <th className="px-3 py-2.5">Submitted</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {shown.map(r => {
                const camp = campaignOf(r);
                const src = primarySource(r);
                return (
                  <tr key={r.id} onClick={() => setDetails(r)} className="cursor-pointer hover:bg-blue-50/40">
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={picked.has(r.id)}
                        onChange={(e) => setPicked(prev => { const n = new Set(prev); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">{personName(r)}</td>
                    <td className="px-3 py-2.5 text-blue-700">
                      {r.email ? <a href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.email}</a> : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{r.phone ?? '—'}</td>
                    <td className="max-w-[260px] px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {answersOf(r).length ? answersOf(r).map(([k, v]) => (
                          <span key={k} className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                            v === true ? 'bg-emerald-50 text-emerald-700' : v === false ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
                          }`} title={`${k}: ${showValue(v)}`}>
                            <span className="text-slate-400">{k}</span><span className="truncate font-medium">{showValue(v)}</span>
                          </span>
                        )) : <span className="text-slate-300">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${camp.label === 'Direct' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-700'}`}
                        title={[camp.source && `utm_source: ${camp.source}`, camp.medium && `utm_medium: ${camp.medium}`, camp.campaign && `utm_campaign: ${camp.campaign}`, camp.clickId && `click id from ${camp.clickId}`].filter(Boolean).join('\n') || 'No campaign on the link they arrived with'}
                      >
                        <span className="truncate">{camp.label}</span>
                      </span>
                      {camp.campaign && <div className="mt-0.5 max-w-[140px] truncate text-[11px] text-slate-500" title={camp.campaign}>{camp.campaign}</div>}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-blue-700" title={r.source_url ?? ''}>
                      {r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">{r.source_url}</a> : '—'}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 font-mono text-[11px]">{r.source_pathname ?? '—'}</td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-blue-700" title={r.source_referrer ?? ''}>
                      {r.source_referrer ? <a href={r.source_referrer} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">{r.source_referrer}</a> : '—'}
                    </td>
                    {formLabel && <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-600">{formLabel(r) ?? '—'}</td>}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{dateOnly(r.submitted_at)}</div>
                      <div className="font-semibold text-slate-900">{timeOnly(r.submitted_at)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); copy(src); }}
                        disabled={!src}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                      >
                        <Copy className="h-3 w-3" /> Copy Source
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {details && <Details row={details} formLabel={formLabel} onClose={() => setDetails(null)} />}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${on ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
      {children}
    </button>
  );
}

// The drawer: every field of one submission, the person first, then every
// answer under its own field name, then where and how they arrived.
function Details({ row, formLabel, onClose }: { row: SubmissionRow; formLabel?: (r: SubmissionRow) => string | null; onClose: () => void }) {
  const camp = campaignOf(row);
  const form = formLabel?.(row) ?? row.form_name ?? row.form_slug ?? '—';
  const items: { label: string; col: string; value: string; link?: boolean }[] = [
    { label: 'Submitted At', col: 'submitted_at', value: dateTime(row.submitted_at) },
    { label: 'Form', col: 'form_slug', value: row.form_slug ?? '—' },
    { label: 'Form Name', col: 'form_name', value: row.form_name ?? '—' },
    { label: 'Full Name', col: 'name', value: personName(row) },
    { label: 'First Name', col: 'first_name', value: row.first_name ?? '—' },
    { label: 'Last Name', col: 'last_name', value: row.last_name ?? '—' },
    { label: 'Email', col: 'email', value: row.email ?? '—' },
    { label: 'Phone', col: 'phone', value: row.phone ?? '—' },
    ...answersOf(row).map(([k, v]) => ({ label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), col: `answers.${k}`, value: showValue(v) })),
    { label: 'Campaign', col: 'utm_source', value: camp.label + (camp.campaign ? ` · ${camp.campaign}` : '') },
    { label: 'UTM Medium', col: 'utm_medium', value: camp.medium ?? '—' },
    { label: 'Source URL', col: 'source_url', value: row.source_url ?? '—', link: true },
    { label: 'Source Hostname', col: 'source_hostname', value: row.source_hostname ?? '—' },
    { label: 'Source Pathname', col: 'source_pathname', value: row.source_pathname ?? '—' },
    { label: 'Source Referrer', col: 'source_referrer', value: row.source_referrer ?? '—', link: true },
  ];
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} role="button" tabIndex={-1} />
      <div className="relative flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">Submission Details</div>
              <div className="mt-1 truncate text-sm text-slate-500">{siteOf(row)} • {form}</div>
            </div>
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Close</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Pill k="Form" v={form} />
            <Pill k="Campaign" v={camp.label} />
            <Pill k="Submitted" v={dateTime(row.submitted_at)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {items.map(it => (
              <div key={it.col} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">{it.label}</div>
                <div className="mt-0.5 font-mono text-[10px] text-slate-400">{it.col}</div>
                <div className="mt-2 break-words text-sm text-slate-800">
                  {it.link && it.value !== '—'
                    ? <a href={it.value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{it.value}</a>
                    : it.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
      <span className="font-semibold text-slate-700">{k}</span>
      <span className="text-slate-500">{v}</span>
    </span>
  );
}

// The same file the Leads screen produces, with one column per answer field
// found in the export instead of fixed Program/Consent columns.
function downloadCsv(rows: SubmissionRow[], tag: string) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const excelDate = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const answerKeys = Array.from(new Set(rows.flatMap(r => answersOf(r).map(([k]) => k))));
  const head = ['Submitted At', 'Website', 'Form', 'Form Name', 'Full Name', 'First Name', 'Last Name', 'Email', 'Phone',
    ...answerKeys, 'Attribution', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Click ID', 'Primary Source', 'Source URL', 'Source Path', 'Referrer'];
  const lines = ['sep=,', head.join(',')];
  for (const r of rows) {
    const camp = campaignOf(r);
    const a = r.answers ?? {};
    lines.push([
      excelDate(r.submitted_at), siteOf(r), r.form_slug, r.form_name, personName(r), r.first_name, r.last_name, r.email, r.phone,
      ...answerKeys.map(k => (k in a ? showValue(a[k]) : '')),
      camp.label, camp.source, camp.medium, camp.campaign, camp.clickId, primarySource(r), r.source_url, r.source_pathname, r.source_referrer,
    ].map(esc).join(','));
  }
  const blob = new Blob([`﻿${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const safe = tag.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `form-submissions-${safe}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
