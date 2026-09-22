// FormReport — what came in through a form, inside the Custom Form Builder.
//
// Every submission is posted to our reporting webhook as well as to the CRM,
// and n8n writes that copy into form_submissions_v2 — the body as it arrived,
// with the typed columns filled in by a trigger (see the migration). Here the
// rows are cut two ways: inside a form, only that form's leads; on the list,
// every site at once. A row is tied to its form by id, then by slug, then by
// the name the embed sends, and a row with none of those falls back to the site
// it came from. Test leads never arrive here, and are hidden if one does.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Globe, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
  return bareHost(r.source_hostname || fromUrl) || 'unknown site';
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

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('form_submissions_v2')
      .select('*')
      .eq('is_test', false)
      .order('submitted_at', { ascending: false })
      .limit(MOST);
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

  return { rows, error, at, reload: load };
}

/* ── time ─────────────────────────────────────────────────────────────── */

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

const when = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const withinDays = (iso: string | null, days: number) =>
  !!iso && Date.now() - new Date(iso).getTime() < days * 86400000;

const newest = (rows: SubmissionRow[]) =>
  rows.reduce<string | null>((best, r) => (r.submitted_at && (!best || r.submitted_at > best) ? r.submitted_at : best), null);

// Quiet for a fortnight on a form that has had leads is the shape of the July
// outage: submissions still happening somewhere, nothing arriving here.
const STALE_DAYS = 14;

// The answers worth a glance in a row: everything the visitor chose or typed
// that is not already its own column.
const PERSON = new Set(['first_name', 'last_name', 'firstName', 'lastName', 'name', 'email', 'phone']);
const answerLine = (r: SubmissionRow) =>
  Object.entries(r.answers ?? {})
    .filter(([k, v]) => !PERSON.has(k) && v !== '' && v !== null && v !== undefined && v !== false)
    .map(([k, v]) => `${k}: ${v === true ? 'yes' : String(v)}`)
    .join(' · ');

const personName = (r: SubmissionRow) =>
  r.name || [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';

/* ── one form ─────────────────────────────────────────────────────────── */

export function FormReport({ form, all, error, at, onReload }: {
  form: FormLike & { report_enabled: boolean };
  all: SubmissionRow[] | null;
  error: string | null;
  at: Date | null;
  onReload: () => void;
}) {
  const rows = useMemo(() => (all ?? []).filter(r => matchesForm(r, form)), [all, form]);
  const sites = useMemo(() => countBy(rows, siteOf), [rows]);

  return (
    <div className="space-y-5">
      {!form.report_enabled && (
        <Notice tone="warn">
          <span className="font-semibold">Keep a copy in our reporting</span> is off for this form, so new submissions are
          sent to the CRM only and will not appear here. Turn it on under <em>Where the lead goes</em>.
        </Notice>
      )}

      <Stats rows={rows} sites={sites} />

      <Table
        rows={rows}
        loading={all === null}
        error={error}
        at={at}
        onReload={onReload}
        file={`${form.slug || 'form'}-leads`}
        empty={
          <>
            Nothing yet for this form. A lead appears here when a visitor submits it on the site,
            tied to <span className="font-mono text-slate-600">{form.slug || form.name}</span>.
          </>
        }
      />
    </div>
  );
}

/* ── every site ───────────────────────────────────────────────────────── */

export function SitesReport({ all, error, at, onReload, forms }: {
  all: SubmissionRow[] | null;
  error: string | null;
  at: Date | null;
  onReload: () => void;
  forms: FormLike[];
}) {
  const [site, setSite] = useState<string | null>(null);
  const rows = all ?? [];
  const sites = useMemo(() => countBy(rows, siteOf), [rows]);
  const shown = useMemo(() => (site ? rows.filter(r => siteOf(r) === site) : rows), [rows, site]);

  const formLabel = (r: SubmissionRow) => {
    const f = forms.find(x => matchesForm(r, x));
    return f?.name || r.form_name || r.form_slug || null;
  };

  return (
    <div className="space-y-5">
      <Stats rows={shown} sites={site ? [] : sites} />

      {sites.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_90px_110px_150px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
            <span>Site</span><span>Forms on it</span><span>Leads</span><span>Last 7 days</span><span>Last lead</span>
          </div>
          <div className="divide-y divide-slate-100">
            {sites.map(({ key, rows: sr }) => {
              const last = newest(sr);
              const names = Array.from(new Set(sr.map(formLabel).filter(Boolean))) as string[];
              const on = site === key;
              return (
                <button
                  key={key}
                  onClick={() => setSite(on ? null : key)}
                  className={`grid w-full grid-cols-1 gap-1.5 px-5 py-3.5 text-left transition md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_90px_110px_150px] md:items-center md:gap-4 ${
                    on ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate text-sm font-semibold text-slate-900">
                    <Globe className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />{key}
                  </span>
                  <span className="truncate text-xs text-slate-500">{names.join(' · ') || '—'}</span>
                  <span className="text-xs tabular-nums text-slate-700">{sr.length.toLocaleString()}</span>
                  <span className="text-xs tabular-nums text-slate-500">{sr.filter(r => withinDays(r.submitted_at, 7)).length}</span>
                  <span className={`text-xs ${last && sr.length > 2 && !withinDays(last, STALE_DAYS) ? 'font-medium text-amber-600' : 'text-slate-500'}`}>
                    {ago(last)}
                  </span>
                </button>
              );
            })}
          </div>
          {site && (
            <div className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-500">
              Showing <span className="font-semibold text-slate-700">{site}</span> only.{' '}
              <button onClick={() => setSite(null)} className="font-medium text-blue-600 hover:underline">Show every site</button>
            </div>
          )}
        </div>
      )}

      <Table
        rows={shown}
        loading={all === null}
        error={error}
        at={at}
        onReload={onReload}
        file={site ? `${site}-leads` : 'all-leads'}
        formLabel={formLabel}
        empty={<>No submissions have come in yet. They appear here the moment a visitor submits any of these forms.</>}
      />
    </div>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

function countBy(rows: SubmissionRow[], key: (r: SubmissionRow) => string) {
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

function Notice({ tone, children }: { tone: 'warn'; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : ''}`}>
      {children}
    </div>
  );
}

function Table({ rows, loading, error, at, onReload, file, empty, formLabel }: {
  rows: SubmissionRow[];
  loading: boolean;
  error: string | null;
  at: Date | null;
  onReload: () => void;
  file: string;
  empty: React.ReactNode;
  formLabel?: (r: SubmissionRow) => string | null;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''));
    if (!needle) return sorted;
    return sorted.filter(r =>
      [personName(r), r.email, r.phone, answerLine(r), r.source_pathname, r.source_url, r.form_name, r.form_slug, r.utm_source, r.utm_campaign]
        .filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [rows, needle]);

  const download = () => {
    const head = ['submitted_at', 'form_slug', 'form_name', 'name', 'email', 'phone', 'answers', 'source_url', 'utm_source', 'utm_medium', 'utm_campaign'];
    const cell = (v: unknown) => `"${(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')).replace(/"/g, '""')}"`;
    const csv = [head.join(','), ...shown.map(r => head.map(h => cell(h === 'name' ? personName(r) : (r as unknown as Record<string, unknown>)[h])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${file}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone, any answer…"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400"
          />
        </div>
        <span className="text-[11px] text-slate-400">
          {shown.length.toLocaleString()} of {rows.length.toLocaleString()}{at ? ` · updated ${ago(at.toISOString())}` : ''}
        </span>
        <button onClick={onReload} title="Refresh" className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={download}
          disabled={!shown.length}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {error && <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">Could not load submissions: {error}</div>}

      {loading ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map(i => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : !shown.length ? (
        <p className="px-5 py-10 text-center text-xs leading-relaxed text-slate-400">{needle ? 'Nothing matches that search.' : empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-2.5">When</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Answers</th>
                {formLabel && <th className="px-3 py-2.5">Form</th>}
                <th className="px-3 py-2.5">Page</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-500" title={r.submitted_at ?? ''}>{when(r.submitted_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{personName(r)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.email ? <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a> : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.phone ? <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a> : '—'}</td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-slate-600" title={answerLine(r)}>{answerLine(r) || '—'}</td>
                  {formLabel && <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-500">{formLabel(r) ?? '—'}</td>}
                  <td className="max-w-[200px] truncate px-3 py-2.5 font-mono text-[11px] text-slate-400" title={r.source_url ?? ''}>
                    {r.source_pathname || (r.source_url ? (() => { try { return new URL(r.source_url).pathname; } catch { return r.source_url; } })() : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
