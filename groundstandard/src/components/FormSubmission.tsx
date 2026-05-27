import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUp, ClipboardList, Globe, RefreshCw, Search, Copy, Download, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

type FormSubmissionProps = {
  onBackToLaunch?: () => void;
};

// How often to silently re-pull submissions so the list stays current without a
// manual refresh. We poll the RPC (which is SECURITY DEFINER and returns every
// row) rather than relying on Supabase realtime: anon RLS hides the rows from a
// direct subscription, so postgres_changes events never reach this client.
const POLL_INTERVAL_MS = 30000;

type FormSubmissionRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  program: string | null;
  consent: boolean | null;
  consent2: boolean | null;
  source_url: string | null;
  source_hostname: string | null;
  source_pathname: string | null;
  source_referrer: string | null;
  form_name: string | null;
  submitted_at: string | null;
};

export default function FormSubmission({ onBackToLaunch }: FormSubmissionProps) {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rows, setRows] = useState<FormSubmissionRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWebsite, setSelectedWebsite] = useState<string | null>(null);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<number>>(() => new Set());
  const [detailsRow, setDetailsRow] = useState<FormSubmissionRow | null>(null);

  const formatDateTime = useCallback((value: string | null | undefined) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  }, []);

  const formatDateOnly = useCallback((value: string | null | undefined) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(d);
  }, []);

  const formatTimeOnly = useCallback((value: string | null | undefined) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  }, []);

  // `silent` powers the background auto-refresh: it skips the spinner and keeps
  // the current rows on a transient failure, so polling never flickers the UI.
  const loadRows = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) {
      setRowsLoading(true);
      setRowsError(null);
    }
    try {
      const { data, error } = await supabase.rpc('rpc_form_submissions_list');
      if (error) throw error;
      setRows(Array.isArray(data) ? (data as FormSubmissionRow[]) : []);
      setLastUpdated(new Date());
      setRowsError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load records';
      setRowsError(msg);
      if (!silent) setRows([]);
    } finally {
      if (!silent) setRowsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  // Auto-refresh: poll on an interval and re-pull the moment the tab regains
  // focus. Polling pauses while the tab is hidden to avoid needless requests.
  useEffect(() => {
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadRows({ silent: true });
    };
    const intervalId = window.setInterval(refresh, POLL_INTERVAL_MS);
    const onFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void loadRows({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadRows]);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const normalizeHostname = useCallback((hostname: string) => {
    return hostname.replace(/^www\./i, '');
  }, []);

  const getWebsiteLabel = useCallback((row: FormSubmissionRow) => {
    if (row.source_hostname) return normalizeHostname(row.source_hostname);
    if (row.source_url) {
      try {
        return normalizeHostname(new URL(row.source_url).hostname);
      } catch {
        return null;
      }
    }
    return null;
  }, [normalizeHostname]);

  const visibleRows = useMemo(() => {
    if (!selectedWebsite) return rows;
    return rows.filter((r) => (getWebsiteLabel(r) ?? 'Unknown website') === selectedWebsite);
  }, [getWebsiteLabel, rows, selectedWebsite]);

  useEffect(() => {
    setSelectedSubmissionIds(new Set());
  }, [selectedWebsite]);

  const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);
  const filteredRows = useMemo(() => {
    if (!normalizedSearch) return visibleRows;
    return visibleRows.filter((r) => {
      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ');
      const haystack = [
        String(r.id),
        fullName,
        r.email,
        r.phone,
        r.program,
        r.form_name,
        r.source_url,
        r.source_hostname,
        r.source_pathname,
        r.source_referrer,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, visibleRows]);

  const totalCount = rows.length;
  const filteredCount = filteredRows.length;

  const websiteGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = getWebsiteLabel(r) ?? 'Unknown website';
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    const items = Array.from(map.entries()).map(([website, count]) => ({ website, count }));
    items.sort((a, b) => b.count - a.count || a.website.localeCompare(b.website));
    return items;
  }, [getWebsiteLabel, rows]);

  const filteredWebsites = useMemo(() => {
    if (!normalizedSearch) return websiteGroups;
    return websiteGroups.filter((g) => g.website.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, websiteGroups]);

  const handleCopy = useCallback((value: string | null) => {
    if (!value) return;
    void navigator?.clipboard?.writeText?.(value);
  }, []);

  const getPrimarySourceText = useCallback((row: FormSubmissionRow) => {
    return (
      row.source_url ||
      row.source_referrer ||
      [row.source_hostname, row.source_pathname].filter(Boolean).join('') ||
      row.source_hostname ||
      row.source_pathname ||
      null
    );
  }, []);

  const downloadCsv = useCallback((exportRows: FormSubmissionRow[], websiteForFilename?: string | null) => {
    const escapeCsv = (value: unknown) => {
      const s = value === null || value === undefined ? '' : String(value);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const formatExcelDateTime = (value: string | null) => {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    };

    const headers = [
      'Submitted At',
      'Website',
      'Form Name',
      'Program',
      'Full Name',
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'Consent',
      'Consent 2',
      'Primary Source',
      'Source URL',
      'Source Path',
      'Referrer',
    ];

    const lines = ['sep=,', headers.join(',')];
    for (const r of exportRows) {
      const websiteLabel = getWebsiteLabel(r) ?? 'Unknown website';
      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ');
      const primarySourceText = getPrimarySourceText(r);
      lines.push(
        [
          formatExcelDateTime(r.submitted_at),
          websiteLabel,
          r.form_name,
          r.program,
          fullName,
          r.first_name,
          r.last_name,
          r.email,
          r.phone,
          r.consent === true ? 'Yes' : r.consent === false ? 'No' : '',
          r.consent2 === true ? 'Yes' : r.consent2 === false ? 'No' : '',
          primarySourceText,
          r.source_url,
          r.source_pathname,
          r.source_referrer,
        ]
          .map(escapeCsv)
          .join(','),
      );
    }

    const csv = `${lines.join('\n')}\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const safeWebsite = websiteForFilename
      ? websiteForFilename
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/[^a-z0-9.-]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
      : null;
    const filename = safeWebsite
      ? `form-submissions-${safeWebsite}-${y}-${m}-${d}.csv`
      : `form-submissions-${y}-${m}-${d}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [getPrimarySourceText, getWebsiteLabel]);

  const exportableRows = useMemo(() => {
    if (!selectedWebsite) return filteredRows;
    if (selectedSubmissionIds.size === 0) return filteredRows;
    const selected = filteredRows.filter((r) => selectedSubmissionIds.has(r.id));
    return selected.length > 0 ? selected : filteredRows;
  }, [filteredRows, selectedSubmissionIds, selectedWebsite]);

  const selectedCountInView = useMemo(() => {
    if (!selectedWebsite) return 0;
    let count = 0;
    for (const r of filteredRows) if (selectedSubmissionIds.has(r.id)) count += 1;
    return count;
  }, [filteredRows, selectedSubmissionIds, selectedWebsite]);

  const closeDetails = useCallback(() => setDetailsRow(null), []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute top-32 -right-56 h-[520px] w-[520px] rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-48 left-1/3 h-[520px] w-[520px] rounded-full bg-rose-200/20 blur-3xl" />
      </div>

      <div className="sticky top-0 z-40 border-b border-gray-200/60 bg-white/70 backdrop-blur-sm">
        <div className="w-full px-4 sm:px-6 lg:px-10">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-md">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">Form Submissions</h1>
                <p className="text-sm text-gray-600">Browse the contact responses captured from your forms</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end leading-tight mr-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  Auto-updating
                </span>
                {lastUpdated && (
                  <span className="text-[11px] text-gray-500">Updated {formatTimeOnly(lastUpdated.toISOString())}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => loadRows()}
                disabled={rowsLoading}
                className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${rowsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {onBackToLaunch && (
                <button
                  type="button"
                  onClick={onBackToLaunch}
                  className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative w-full px-4 sm:px-6 lg:px-10 py-10">
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-3xl shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedWebsite ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWebsite(null);
                        setSearchTerm('');
                      }}
                      className="inline-flex items-center px-3 py-2 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </button>
                  ) : null}
                  <div className="text-lg font-extrabold text-gray-900">
                    {selectedWebsite ? selectedWebsite : 'Websites'}
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {selectedWebsite ? (
                    <>Showing: {filteredCount} / {visibleRows.length}</>
                  ) : (
                    <>Showing: {filteredWebsites.length} / {websiteGroups.length} (Total submissions: {totalCount})</>
                  )}
                </div>
              </div>
              <div className="w-full sm:flex-1 sm:min-w-[520px] sm:max-w-[720px]">
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <div className="relative flex-1 min-w-[260px]">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Search className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={
                        selectedWebsite
                          ? 'Search name, email, phone, form name, URL, program...'
                          : 'Search website...'
                      }
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200 shadow-sm"
                    />
                  </div>

                  {selectedWebsite ? (
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-gray-200 bg-white text-xs font-extrabold text-gray-800 shadow-sm">
                        <input
                          type="checkbox"
                          checked={filteredRows.length > 0 && selectedCountInView === filteredRows.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSubmissionIds(new Set(filteredRows.map((r) => r.id)));
                            } else {
                              setSelectedSubmissionIds(new Set());
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Select All
                      </label>

                      <button
                        type="button"
                        onClick={() => downloadCsv(exportableRows, selectedWebsite)}
                        disabled={exportableRows.length === 0}
                        className="inline-flex items-center px-4 py-3 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {selectedSubmissionIds.size > 0 ? `Download Selected (${exportableRows.length})` : 'Download CSV'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {rowsError && (
            <div className="px-6 pt-5">
              <div className="rounded-2xl border border-red-200/70 bg-red-50/80 px-4 py-3 text-sm font-semibold text-red-800 shadow-sm">
                {rowsError}
              </div>
            </div>
          )}

          <div className="p-6">
            {!selectedWebsite ? (
              filteredWebsites.length === 0 ? (
                <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-3xl shadow-sm p-6 text-sm text-gray-600">
                  No websites found.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredWebsites.map((g) => (
                    <button
                      key={g.website}
                      type="button"
                      onClick={() => {
                        setSelectedWebsite(g.website);
                        setSearchTerm('');
                      }}
                      className="w-full text-left rounded-3xl border border-gray-200/70 bg-white/90 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 px-5 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-extrabold text-gray-900">
                            <Globe className="w-4 h-4 text-gray-400" />
                            <span className="truncate">{g.website}</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-600">{g.count} submissions</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-extrabold text-gray-700 rounded-2xl border border-gray-200 bg-white px-3 py-1.5">
                            {g.count}
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : filteredRows.length === 0 ? (
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-3xl shadow-sm p-6 text-sm text-gray-600">
                No records found.
              </div>
            ) : (
              <div className="rounded-3xl border border-gray-200/70 bg-white/95 shadow-sm overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3 w-28">Program</th>
                      <th className="px-4 py-3 w-20 text-center">Consent</th>
                      <th className="px-4 py-3 w-24 text-center">Consent 2</th>
                      <th className="px-4 py-3">Source URL</th>
                      <th className="px-4 py-3">Source Path</th>
                      <th className="px-4 py-3">Referrer</th>
                      <th className="px-4 py-3">Form Name</th>
                      <th className="px-4 py-3">Submitted</th>
                      <th className="px-4 py-3 w-32 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {filteredRows.map((r) => {
                      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unnamed contact';
                      const consentOk = r.consent === true;
                      const consent2Ok = r.consent2 === true;
                      const primarySourceText = getPrimarySourceText(r);
                      const isSelected = selectedSubmissionIds.has(r.id);

                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-indigo-50/30 cursor-pointer"
                          onClick={() => setDetailsRow(r)}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                setSelectedSubmissionIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(r.id);
                                  else next.delete(r.id);
                                  return next;
                                });
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-900">{fullName}</div>
                          </td>
                          <td className="px-4 py-3 text-blue-700 break-words">
                            {r.email ? (
                              <a href={`mailto:${r.email}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                                {r.email}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 break-words">{r.phone ?? '—'}</td>
                          <td className="px-4 py-3 break-words w-28">{r.program ?? '—'}</td>
                          <td className="px-4 py-3 text-center w-20">
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                                consentOk ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {consentOk ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center w-24">
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                                consent2Ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {consent2Ok ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-blue-700 break-words">
                            {r.source_url ? (
                              <a
                                href={r.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {r.source_url}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 break-words">{r.source_pathname ?? '—'}</td>
                          <td className="px-4 py-3 text-blue-700 break-words">
                            {r.source_referrer ? (
                              <a
                                href={r.source_referrer}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {r.source_referrer}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 break-words">{r.form_name ?? '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {formatDateOnly(r.submitted_at)}
                            </div>
                            <div className="text-sm font-bold text-gray-900">
                              {formatTimeOnly(r.submitted_at)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(primarySourceText);
                              }}
                              disabled={!primarySourceText}
                              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy Source
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {detailsRow && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeDetails}
            role="button"
            tabIndex={-1}
          />
          <div className="relative w-full max-w-3xl h-full bg-white shadow-[0_20px_50px_rgba(15,23,42,0.25)] border-l border-gray-200 flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-white to-indigo-50/30">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-lg font-extrabold text-gray-900 truncate">Submission Details</div>
                  <div className="mt-1 text-sm text-gray-600 truncate">
                    {(getWebsiteLabel(detailsRow) ?? 'Unknown website')}
                    {detailsRow.form_name ? ` • ${detailsRow.form_name}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDetails}
                  className="inline-flex items-center px-3 py-2 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200">
                  <span className="font-semibold text-gray-700">Form</span>
                  <span className="text-gray-600">{detailsRow.form_name ?? '—'}</span>
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200">
                  <span className="font-semibold text-gray-700">Program</span>
                  <span className="text-gray-600">{detailsRow.program ?? '—'}</span>
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200">
                  <span className="font-semibold text-gray-700">Submitted</span>
                  <span className="text-gray-600">{formatDateTime(detailsRow.submitted_at)}</span>
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 bg-slate-50/60">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { label: 'Submitted At', col: 'submitted_at', value: formatDateTime(detailsRow.submitted_at) },
                  { label: 'Form Name', col: 'form_name', value: detailsRow.form_name ?? '—' },
                  { label: 'Program', col: 'program', value: detailsRow.program ?? '—' },
                  { label: 'First Name', col: 'first_name', value: detailsRow.first_name ?? '—' },
                  { label: 'Last Name', col: 'last_name', value: detailsRow.last_name ?? '—' },
                  { label: 'Email', col: 'email', value: detailsRow.email ?? '—' },
                  { label: 'Phone', col: 'phone', value: detailsRow.phone ?? '—' },
                  { label: 'Consent', col: 'consent', value: detailsRow.consent === true ? 'Yes' : detailsRow.consent === false ? 'No' : '—' },
                  { label: 'Consent 2', col: 'consent2', value: detailsRow.consent2 === true ? 'Yes' : detailsRow.consent2 === false ? 'No' : '—' },
                  { label: 'Source URL', col: 'source_url', value: detailsRow.source_url ?? '—', isLink: true },
                  { label: 'Source Hostname', col: 'source_hostname', value: detailsRow.source_hostname ?? '—' },
                  { label: 'Source Pathname', col: 'source_pathname', value: detailsRow.source_pathname ?? '—' },
                  { label: 'Source Referrer', col: 'source_referrer', value: detailsRow.source_referrer ?? '—', isLink: true },
                ] satisfies { label: string; col: string; value: string; isLink?: boolean }[]).map((item) => (
                  <div key={item.col} className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                    <div className="text-sm font-black text-gray-900 tracking-tight">{item.label}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.15em]">
                      <span className="font-mono lowercase">{item.col}</span>
                    </div>
                    <div className="mt-2 text-sm text-gray-800 break-words">
                      {item.isLink && item.value && item.value !== '—' ? (
                        <a
                          href={String(item.value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline break-words"
                        >
                          {item.value}
                        </a>
                      ) : (
                        item.value
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
