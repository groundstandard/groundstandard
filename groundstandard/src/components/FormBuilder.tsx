// FormBuilder — the forms themselves, ours instead of Duda's.
//
// Bobby, September 16: "Duda is going bye bye. We need to build the forms using
// the AI. Code the forms. Then the webhook needs to send to GHL."
//
// A form built here lives in the database. A client's site embeds one line that
// reads it, so a change made on this screen is live on every site that uses it
// on the next page load. That is the part worth insisting on: in July, thirteen
// sites sat on a stale copy of the old widget for eight weeks because each site
// had its own pinned version and nobody could move them without republishing.
//
// The screen is built for the person using it, who is the client rather than an
// engineer: the preview shows the form inside a browser frame so there is never
// a question about what a visitor will see, and the snippet reads as one thing
// to copy rather than a wall of key.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlignLeft, ArrowLeft, AtSign, Check, CheckSquare, ChevronDown, ClipboardList,
  Copy, ExternalLink, EyeOff, GripVertical, Layers, Loader2, Phone, Plus, Save,
  Search, Trash2, Type, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type FieldType = 'text' | 'email' | 'phone' | 'select' | 'textarea' | 'checkbox' | 'hidden';

type FormField = {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  value?: string;       // hidden fields only: the fixed value that is sent
};

type FormDef = {
  id?: string;
  slug: string;
  name: string;
  site_hostname: string | null;
  ghl_webhook_url: string | null;
  report_enabled: boolean;
  redirect_enabled: boolean;
  redirect_adult: string | null;
  redirect_youth: string | null;
  fields: FormField[];
  submit_label: string;
  success_message: string;
  error_message: string;
  privacy_url: string | null;
  terms_url: string | null;
  active: boolean;
  updated_at?: string;
};

// What a gym enquiry actually asks for. A new form starts here rather than
// empty, because every one of these has been asked for by name.
const STARTER: FormField[] = [
  { name: 'first_name', label: 'First name', type: 'text', required: true },
  { name: 'last_name', label: 'Last name', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'phone', label: 'Phone', type: 'phone', required: true },
  { name: 'program', label: 'Which program?', type: 'select', required: true,
    options: ['Adult', 'Youth'] },
  { name: 'consent', label: 'I agree to be contacted about my enquiry.', type: 'checkbox', required: true },
];

const blank = (): FormDef => ({
  slug: '',
  name: '',
  site_hostname: null,
  ghl_webhook_url: null,
  report_enabled: true,
  redirect_enabled: false,
  redirect_adult: null,
  redirect_youth: null,
  fields: STARTER.map(f => ({ ...f })),
  submit_label: 'Send',
  success_message: 'Thank you. We will be in touch shortly.',
  error_message: 'Something went wrong. Please try again.',
  privacy_url: null,
  terms_url: null,
  active: true,
});

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const FIELD_TYPES: { value: FieldType; label: string; icon: typeof Type }[] = [
  { value: 'text', label: 'Text', icon: Type },
  { value: 'email', label: 'Email', icon: AtSign },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'select', label: 'Choice', icon: ChevronDown },
  { value: 'textarea', label: 'Long text', icon: AlignLeft },
  { value: 'checkbox', label: 'Tickbox', icon: CheckSquare },
  { value: 'hidden', label: 'Hidden', icon: EyeOff },
];

const iconFor = (t: FieldType) => FIELD_TYPES.find(x => x.value === t)?.icon ?? Type;

const hostOf = (url: string | null) => {
  if (!url) return null;
  try { return new URL(url).hostname; } catch { return null; }
};

export default function FormBuilder({ onBackToLaunch }: { onBackToLaunch?: () => void }) {
  const [forms, setForms] = useState<FormDef[] | null>(null);
  const [editing, setEditing] = useState<FormDef | null>(null);
  const [saved, setSaved] = useState('');          // the last saved state, to spot unsaved edits
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('forms').select('*').order('updated_at', { ascending: false });
    if (err) { setError(err.message); setForms([]); return; }
    setForms((data ?? []) as FormDef[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = (f: FormDef | null) => {
    setError(null);
    setEditing(f);
    setSaved(f ? JSON.stringify(f) : '');
  };

  const dirty = editing !== null && JSON.stringify(editing) !== saved;

  // Losing unsaved edits is the one mistake this screen can make that costs real
  // work, so the browser asks before the tab goes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    if (!editing) return;
    setSaving(true); setError(null);
    try {
      const slug = editing.slug || slugify(editing.name);
      if (!slug) throw new Error('Give the form a name first.');
      if (!editing.fields.length) throw new Error('A form with no fields cannot be submitted.');

      const dup = editing.fields.map(f => f.name).filter((n, i, a) => a.indexOf(n) !== i);
      if (dup.length) throw new Error(`Two fields are both called "${dup[0]}". Names have to be unique.`);

      const row = { ...editing, slug };
      const { data, error: err } = editing.id
        ? await supabase.from('forms').update(row).eq('id', editing.id).select().single()
        : await supabase.from('forms').insert(row).select().single();
      if (err) throw err;

      const next = data as FormDef;
      setEditing(next);
      setSaved(JSON.stringify(next));
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2200);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return;
    open(null);
  };

  const patch = (p: Partial<FormDef>) => setEditing(cur => (cur ? { ...cur, ...p } : cur));

  const setField = (i: number, p: Partial<FormField>) =>
    setEditing(cur => cur
      ? { ...cur, fields: cur.fields.map((f, n) => (n === i ? { ...f, ...p } : f)) }
      : cur);

  const reorder = (from: number, to: number) =>
    setEditing(cur => {
      if (!cur || from === to || to < 0 || to >= cur.fields.length) return cur;
      const fields = [...cur.fields];
      const [moved] = fields.splice(from, 1);
      fields.splice(to, 0, moved);
      return { ...cur, fields };
    });

  return (
    <div className="min-h-screen bg-slate-100/70">
      {/* The save lives in the header: it is the one action that has to be
          reachable at any scroll position. */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-3">
            <button
              onClick={editing ? close : onBackToLaunch}
              className="-ml-2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
              title={editing ? 'Back to all forms' : 'Back'}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 shadow-sm shadow-blue-600/20">
              <ClipboardList className="h-4 w-4 text-white" strokeWidth={2.2} />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold leading-tight text-slate-900">
                {editing ? (editing.name || 'Untitled form') : 'Forms'}
              </h1>
              <p className="truncate text-xs text-slate-500">
                {editing
                  ? 'Saved here, live on every site that embeds it.'
                  : 'Built here, embedded once. A change lands on every site immediately.'}
              </p>
            </div>

            {editing && (
              <div className="flex items-center gap-2 sm:gap-3">
                {dirty ? (
                  <span className="hidden items-center gap-1.5 text-xs font-medium text-amber-600 sm:flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Unsaved changes
                  </span>
                ) : editing.updated_at && !justSaved ? (
                  <span className="hidden text-xs text-slate-400 lg:block">
                    Saved {new Date(editing.updated_at).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                ) : null}

                <button
                  onClick={save}
                  disabled={saving || (!dirty && !!editing.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-default disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" />
                    : justSaved ? <Check className="h-4 w-4" />
                    : <Save className="h-4 w-4" />}
                  {saving ? 'Saving' : justSaved ? 'Saved' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!editing ? (
          <FormList forms={forms} onNew={() => open(blank())} onOpen={open} />
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="space-y-5">
              <Card>
                <CardHead
                  title="Name"
                  hint="Only your team sees this. The address underneath is what a site embeds."
                />
                <div className="px-5 pb-5">
                  <input
                    value={editing.name}
                    onChange={(e) => patch({
                      name: e.target.value,
                      slug: editing.id ? editing.slug : slugify(e.target.value),
                    })}
                    placeholder="e.g. Ronin BJJ free trial"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    <span>Address</span>
                    <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                      {editing.slug || slugify(editing.name) || 'your-form'}
                    </code>
                    {editing.id && <span>· fixed once saved, so live sites keep working</span>}
                  </div>
                </div>
              </Card>

              <Card>
                <CardHead
                  title="Fields"
                  hint="Drag to reorder. The name in grey is what GoHighLevel receives."
                  right={
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                      {editing.fields.length} field{editing.fields.length === 1 ? '' : 's'}
                    </span>
                  }
                />
                <div className="space-y-2 px-5 pb-5">
                  {editing.fields.map((f, i) => (
                    <FieldRow
                      key={i}
                      index={i}
                      count={editing.fields.length}
                      field={f}
                      onChange={(p) => setField(i, p)}
                      onMoveTo={(to) => reorder(i, to)}
                      onDropFrom={(from) => reorder(from, i)}
                      onRemove={() => patch({ fields: editing.fields.filter((_, n) => n !== i) })}
                    />
                  ))}

                  <button
                    onClick={() => patch({
                      fields: [...editing.fields, {
                        name: `field_${editing.fields.length + 1}`,
                        label: 'New field', type: 'text', required: false,
                      }],
                    })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-400 transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600"
                  >
                    <Plus className="h-4 w-4" /> Add field
                  </button>
                </div>
              </Card>

              <Card>
                <CardHead title="Where the lead goes" />
                <div className="space-y-4 px-5 pb-5">
                  <TextField
                    label="GoHighLevel webhook"
                    hint="The submission is posted straight here. This is the one that matters."
                    value={editing.ghl_webhook_url ?? ''}
                    onChange={(v) => patch({ ghl_webhook_url: v || null })}
                    placeholder="https://services.leadconnectorhq.com/hooks/…"
                    mono
                    badge={editing.ghl_webhook_url
                      ? { tone: 'good', text: hostOf(editing.ghl_webhook_url) ?? 'set' }
                      : { tone: 'warn', text: 'not set — leads go nowhere' }}
                  />

                  <Switch
                    label="Keep a copy in our reporting"
                    hint="How the Leads screen fills up, and how we notice when a site goes quiet."
                    value={editing.report_enabled}
                    onChange={(v) => patch({ report_enabled: v })}
                  />

                  <Switch
                    label="Send them to a thank-you page"
                    hint="Off means they stay on the page and read the message below."
                    value={editing.redirect_enabled}
                    onChange={(v) => patch({ redirect_enabled: v })}
                  />

                  {editing.redirect_enabled && (
                    <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
                      <TextField label="Adult enquiry goes to" value={editing.redirect_adult ?? ''}
                        onChange={(v) => patch({ redirect_adult: v || null })} placeholder="https://…" mono />
                      <TextField label="Youth enquiry goes to" value={editing.redirect_youth ?? ''}
                        onChange={(v) => patch({ redirect_youth: v || null })} placeholder="https://…" mono />
                    </div>
                  )}

                  <TextField
                    label="Which site this is on"
                    hint="For your own reference on the list, and in the preview."
                    value={editing.site_hostname ?? ''}
                    onChange={(v) => patch({ site_hostname: v || null })}
                    placeholder="www.roninbjj.com" mono
                  />
                </div>
              </Card>

              <Card>
                <CardHead title="Wording" hint="What the visitor reads." />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                  <TextField label="Button" value={editing.submit_label}
                    onChange={(v) => patch({ submit_label: v })} placeholder="Send" />
                  <TextField label="After they submit" value={editing.success_message}
                    onChange={(v) => patch({ success_message: v })} />
                  <TextField label="If something goes wrong" value={editing.error_message}
                    onChange={(v) => patch({ error_message: v })} />
                  <TextField label="Privacy policy link" value={editing.privacy_url ?? ''}
                    onChange={(v) => patch({ privacy_url: v || null })} placeholder="https://…" mono />
                  <TextField label="Terms of service link" value={editing.terms_url ?? ''}
                    onChange={(v) => patch({ terms_url: v || null })} placeholder="https://…" mono />
                </div>
              </Card>

              <Card>
                <CardHead title="Status" />
                <div className="px-5 pb-5">
                  <Switch
                    label={editing.active ? 'Live' : 'Paused'}
                    hint={editing.active
                      ? 'Sites embedding this address render the form.'
                      : 'Sites embedding this address show nothing. Nothing is deleted.'}
                    value={editing.active}
                    onChange={(v) => patch({ active: v })}
                  />
                </div>
              </Card>
            </div>

            <div className="space-y-5 xl:sticky xl:top-24">
              <Preview def={editing} />
              <Embed def={editing} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── shell ─────────────────────────────────────────────────────────────── */

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      {children}
    </section>
  );
}

function CardHead({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/* ── the list ──────────────────────────────────────────────────────────── */

function FormList({ forms, onNew, onOpen }: {
  forms: FormDef[] | null;
  onNew: () => void;
  onOpen: (f: FormDef) => void;
}) {
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    if (!forms) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return forms;
    return forms.filter(f =>
      [f.name, f.slug, f.site_hostname ?? ''].some(s => s.toLowerCase().includes(needle)));
  }, [forms, q]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search forms"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          />
        </div>
        <button
          onClick={onNew}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> New form
        </button>
      </div>

      {shown === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : !shown.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            <Layers className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-900">
            {forms?.length ? 'Nothing matches that.' : 'No forms yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {forms?.length
              ? 'Try a different name or address.'
              : 'A new one starts with the fields a gym enquiry actually asks for — name, email, phone, which programme.'}
          </p>
          {!forms?.length && (
            <button
              onClick={onNew}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> Build the first one
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_100px_140px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
            <span>Form</span><span>Sends to</span><span>Fields</span><span>Updated</span>
          </div>
          <div className="divide-y divide-slate-100">
            {shown.map((f) => (
              <button
                key={f.id ?? f.slug}
                onClick={() => onOpen(f)}
                className="grid w-full grid-cols-1 gap-2 px-5 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_100px_140px] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${f.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      title={f.active ? 'Live' : 'Paused'}
                    />
                    <span className="truncate text-sm font-semibold text-slate-900">{f.name || 'Untitled form'}</span>
                  </div>
                  <div className="mt-0.5 truncate pl-3.5 font-mono text-[11px] text-slate-400">
                    {f.slug}{f.site_hostname ? ` · ${f.site_hostname}` : ''}
                  </div>
                </div>

                <div className="min-w-0 pl-3.5 md:pl-0">
                  {f.ghl_webhook_url ? (
                    <span className="block truncate text-xs text-slate-600">
                      {hostOf(f.ghl_webhook_url) ?? 'webhook set'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      no webhook set
                    </span>
                  )}
                </div>

                <div className="pl-3.5 text-xs text-slate-500 md:pl-0">{f.fields?.length ?? 0} fields</div>

                <div className="pl-3.5 text-xs text-slate-400 md:pl-0">
                  {f.updated_at
                    ? new Date(f.updated_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── one field ─────────────────────────────────────────────────────────── */

function FieldRow({ field, index, count, onChange, onMoveTo, onDropFrom, onRemove }: {
  field: FormField;
  index: number;
  count: number;
  onChange: (p: Partial<FormField>) => void;
  onMoveTo: (to: number) => void;
  onDropFrom: (from: number) => void;
  onRemove: () => void;
}) {
  const [over, setOver] = useState(false);
  const Icon = iconFor(field.type);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
      }}
      onDragEnd={() => setOver(false)}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isNaN(from)) onDropFrom(from);
      }}
      className={`group rounded-xl border bg-white transition ${
        over ? 'border-blue-400 ring-4 ring-blue-50' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-slate-300 transition group-hover:text-slate-400 active:cursor-grabbing" />

        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon className="h-3.5 w-3.5" />
        </div>

        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={field.type === 'hidden' ? 'What this value is for' : 'Label the visitor reads'}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300"
        />

        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            onClick={() => onMoveTo(index - 1)}
            disabled={index === 0}
            title="Move up"
            className="rounded-md p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-0"
          >
            <svg viewBox="0 0 10 6" className="h-2 w-2.5 fill-current"><path d="M5 0l5 6H0z" /></svg>
          </button>
          <button
            onClick={() => onMoveTo(index + 1)}
            disabled={index === count - 1}
            title="Move down"
            className="rounded-md p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-0"
          >
            <svg viewBox="0 0 10 6" className="h-2 w-2.5 fill-current"><path d="M0 0h10L5 6z" /></svg>
          </button>
          <button
            onClick={onRemove}
            title="Remove field"
            className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-3 py-2 sm:pl-11">
        <div className="relative">
          <select
            value={field.type}
            onChange={(e) => onChange({ type: e.target.value as FieldType })}
            className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-400"
          >
            {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
        </div>

        <input
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() })}
          className="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-500 outline-none transition focus:border-blue-400"
          placeholder="field_name"
          title="What GoHighLevel receives this as"
        />

        {field.type !== 'hidden' && (
          <button
            onClick={() => onChange({ required: !field.required })}
            title="Whether the visitor has to fill this in"
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              field.required
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-500 hover:text-slate-800'
            }`}
          >
            {field.required ? 'Required' : 'Optional'}
          </button>
        )}

        {field.type === 'hidden' ? (
          <input
            value={field.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            className="min-w-[150px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-blue-400"
            placeholder="Value sent every time — e.g. Eatontown"
            title="The visitor never sees this; it is sent with every submission"
          />
        ) : field.type === 'select' ? (
          <input
            value={(field.options ?? []).join(', ')}
            onChange={(e) => onChange({ options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            className="min-w-[150px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-blue-400"
            placeholder="Adult, Youth"
            title="Separate the choices with commas"
          />
        ) : field.type !== 'checkbox' ? (
          <input
            value={field.placeholder ?? ''}
            onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
            className="min-w-[140px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-blue-400"
            placeholder="Placeholder (optional)"
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── the preview ───────────────────────────────────────────────────────── */

// Rendered from the same definition the embed reads, so there is never a second
// idea of what the form looks like. The browser frame is there so nobody takes
// this for a picture of the form.
function Preview({ def }: { def: FormDef }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
        <span className="text-[11px] text-slate-400">what the visitor sees</span>
      </div>

      <div className="bg-slate-100 p-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            <div className="ml-1 flex-1 truncate rounded-md bg-white px-2 py-1 font-mono text-[10px] text-slate-400">
              {def.site_hostname || 'yourclient.com'}
            </div>
          </div>

          <div className="space-y-3.5 p-4">
            {def.fields.filter(f => f.type !== 'hidden').map((f, i) => (
              <div key={i}>
                {f.type === 'checkbox' ? (
                  <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                    <input type="checkbox" disabled className="mt-0.5 accent-blue-600" />
                    <span>{f.label}{f.required ? ' *' : ''}</span>
                  </label>
                ) : (
                  <>
                    <div className="mb-1.5 text-[11px] font-semibold text-slate-600">
                      {f.label}
                      {!f.required && <span className="font-normal text-slate-400"> (optional)</span>}
                    </div>
                    {f.type === 'select' ? (
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400">
                        {f.placeholder || 'Choose one'}
                        <ChevronDown className="h-3 w-3" />
                      </div>
                    ) : f.type === 'textarea' ? (
                      <div className="h-16 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-300">
                        {f.placeholder}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-300">
                        {f.placeholder || ' '}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {!def.fields.length && (
              <p className="py-6 text-center text-xs text-slate-400">No fields yet.</p>
            )}

            <div className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2.5 text-center text-xs font-semibold text-white">
              {def.submit_label || 'Send'}
            </div>

            {(def.privacy_url || def.terms_url) && (
              <p className="text-[10px] leading-relaxed text-slate-400">
                By submitting you agree to our{def.privacy_url ? ' privacy policy' : ''}
                {def.privacy_url && def.terms_url ? ' and' : ''}{def.terms_url ? ' terms of service' : ''}.
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
        The site's own fonts and colours carry through, so on the page itself it will look like
        the rest of that site rather than like this.
      </p>

      {def.fields.some(f => f.type === 'hidden') && (
        <div className="border-t border-slate-100 px-5 py-3">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Sent with every submission</p>
          <ul className="space-y-1">
            {def.fields.filter(f => f.type === 'hidden').map((f, i) => (
              <li key={i} className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                <EyeOff className="h-3 w-3 flex-shrink-0 text-slate-400" />
                <span className="truncate">{f.name} = {f.value || <span className="text-amber-600">empty</span>}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-slate-400">The visitor never sees these.</p>
        </div>
      )}
    </div>
  );
}

/* ── the snippet ───────────────────────────────────────────────────────── */

// The key is long, public, and unreadable in a box this size, so it is shortened
// on screen and copied in full.
function Embed({ def }: { def: FormDef }) {
  const [copied, setCopied] = useState(false);

  const slug = def.slug || slugify(def.name) || 'your-form';
  const key = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY ?? 'YOUR_ANON_KEY';
  const origin = window.location.origin;

  const full = `<div data-gs-form="${slug}"></div>\n`
    + `<script src="${origin}/form.js" data-key="${key}" defer></script>`;

  const shortKey = key.length > 24 ? `${key.slice(0, 10)}…${key.slice(-6)}` : key;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Put this on the site</h2>
        <a
          href={`${origin}/form.js`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-slate-700"
        >
          form.js <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="px-5 py-4">
        <div className="overflow-x-auto rounded-xl bg-slate-900 px-4 py-3.5">
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">
            <span className="text-slate-500">&lt;</span><span className="text-sky-300">div</span>{' '}
            <span className="text-violet-300">data-gs-form</span>=<span className="text-emerald-300">"{slug}"</span>
            <span className="text-slate-500">&gt;&lt;/</span><span className="text-sky-300">div</span><span className="text-slate-500">&gt;</span>
            {'\n'}
            <span className="text-slate-500">&lt;</span><span className="text-sky-300">script</span>{' '}
            <span className="text-violet-300">src</span>=<span className="text-emerald-300">"{origin}/form.js"</span>{' '}
            <span className="text-violet-300">data-key</span>=<span className="text-emerald-300">"{shortKey}"</span>{' '}
            <span className="text-violet-300">defer</span><span className="text-slate-500">&gt;&lt;/</span>
            <span className="text-sky-300">script</span><span className="text-slate-500">&gt;</span>
          </pre>
        </div>

        <button
          onClick={() => {
            void navigator.clipboard.writeText(full);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          }}
          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
            copied ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {copied
            ? <><Check className="h-4 w-4" /> Copied, key and all</>
            : <><Copy className="h-4 w-4" /> Copy snippet</>}
        </button>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Paste it once. Everything saved here is live on the site straight away, because the page
          reads the form instead of carrying a copy of it. The key is shortened above to keep this
          readable — copying takes the whole thing.
        </p>
      </div>
    </div>
  );
}

/* ── small inputs ──────────────────────────────────────────────────────── */

function TextField({ label, hint, value, onChange, placeholder, mono, badge }: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  badge?: { tone: 'good' | 'warn'; text: string };
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            badge.tone === 'good' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            {badge.text}
          </span>
        )}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 ${
          mono ? 'font-mono text-[12px]' : ''
        }`}
      />
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{hint}</span>}
    </label>
  );
}

function Switch({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition ${
          value ? 'bg-slate-900' : 'bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            value ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
