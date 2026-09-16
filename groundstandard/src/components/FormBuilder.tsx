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

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Check, ClipboardList, Copy, GripVertical, Loader2,
  Plus, Save, Trash2, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type FieldType = 'text' | 'email' | 'phone' | 'select' | 'textarea' | 'checkbox';

type FormField = {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
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

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'select', label: 'Choice' },
  { value: 'textarea', label: 'Long text' },
  { value: 'checkbox', label: 'Tickbox' },
];

export default function FormBuilder({ onBackToLaunch }: { onBackToLaunch?: () => void }) {
  const [forms, setForms] = useState<FormDef[] | null>(null);
  const [editing, setEditing] = useState<FormDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('forms').select('*').order('updated_at', { ascending: false });
    if (err) { setError(err.message); setForms([]); return; }
    setForms((data ?? []) as FormDef[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true); setError(null);
    try {
      const slug = editing.slug || slugify(editing.name);
      if (!slug) throw new Error('Give the form a name first.');
      if (!editing.fields.length) throw new Error('A form with no fields cannot be submitted.');

      const dup = editing.fields
        .map(f => f.name)
        .filter((n, i, a) => a.indexOf(n) !== i);
      if (dup.length) throw new Error(`Two fields are both called "${dup[0]}". Names have to be unique.`);

      const row = { ...editing, slug };
      const { data, error: err } = editing.id
        ? await supabase.from('forms').update(row).eq('id', editing.id).select().single()
        : await supabase.from('forms').insert(row).select().single();
      if (err) throw err;

      setEditing(data as FormDef);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const embed = useMemo(() => {
    if (!editing) return '';
    const slug = editing.slug || slugify(editing.name) || 'your-form';
    const key = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY ?? 'YOUR_ANON_KEY';
    return `<div data-gs-form="${slug}"></div>\n`
      + `<script src="${window.location.origin}/form.js" data-key="${key}" defer></script>`;
  }, [editing]);

  const patch = (p: Partial<FormDef>) => setEditing(cur => (cur ? { ...cur, ...p } : cur));

  const setField = (i: number, p: Partial<FormField>) =>
    setEditing(cur => cur
      ? { ...cur, fields: cur.fields.map((f, n) => (n === i ? { ...f, ...p } : f)) }
      : cur);

  const moveField = (i: number, by: number) =>
    setEditing(cur => {
      if (!cur) return cur;
      const to = i + by;
      if (to < 0 || to >= cur.fields.length) return cur;
      const fields = [...cur.fields];
      const [moved] = fields.splice(i, 1);
      fields.splice(to, 0, moved);
      return { ...cur, fields };
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/40">
      <div className="border-b border-gray-200/70 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3 py-4">
            {onBackToLaunch && (
              <button onClick={onBackToLaunch}
                className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-md">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Forms</h1>
              <p className="text-xs text-gray-500">
                Built here, embedded once. A change lands on every site immediately.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {!editing ? (
          <FormList
            forms={forms}
            onNew={() => setEditing(blank())}
            onOpen={(f) => setEditing(f)}
          />
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <input
                  value={editing.name}
                  onChange={(e) => patch({ name: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })}
                  placeholder="Form name — e.g. Ronin BJJ free trial"
                  className="flex-1 text-base font-semibold text-gray-900 bg-transparent outline-none placeholder:text-gray-300"
                />
                <button onClick={() => { setEditing(null); setCopied(false); }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Fields</h2>
                  <div className="space-y-3">
                    {editing.fields.map((f, i) => (
                      <FieldRow
                        key={i}
                        field={f}
                        onChange={(p) => setField(i, p)}
                        onUp={() => moveField(i, -1)}
                        onDown={() => moveField(i, 1)}
                        onRemove={() => patch({ fields: editing.fields.filter((_, n) => n !== i) })}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => patch({
                      fields: [...editing.fields,
                        { name: `field_${editing.fields.length + 1}`, label: 'New field', type: 'text', required: false }],
                    })}
                    className="mt-3 w-full py-2.5 text-xs font-semibold text-cyan-700 bg-white border-2 border-dashed border-cyan-300 rounded-xl hover:bg-cyan-50 transition">
                    <Plus className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Add field
                  </button>
                </section>

                <section className="pt-2 border-t border-gray-100">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3 mt-4">Where it goes</h2>
                  <Text label="GoHighLevel webhook"
                    hint="The submission is posted straight here. This is the one that matters."
                    value={editing.ghl_webhook_url ?? ''}
                    onChange={(v) => patch({ ghl_webhook_url: v || null })}
                    placeholder="https://services.leadconnectorhq.com/hooks/…" />

                  <Toggle
                    label="Keep a copy in our reporting"
                    hint="How the Leads screen fills up, and how we notice when a site goes quiet."
                    value={editing.report_enabled}
                    onChange={(v) => patch({ report_enabled: v })} />

                  <Toggle
                    label="Send them somewhere after submitting"
                    value={editing.redirect_enabled}
                    onChange={(v) => patch({ redirect_enabled: v })} />

                  {editing.redirect_enabled && (
                    <div className="pl-1 border-l-2 border-cyan-100 ml-1 mt-2">
                      <Text label="Adult" value={editing.redirect_adult ?? ''}
                        onChange={(v) => patch({ redirect_adult: v || null })} placeholder="https://…" />
                      <Text label="Youth" value={editing.redirect_youth ?? ''}
                        onChange={(v) => patch({ redirect_youth: v || null })} placeholder="https://…" />
                    </div>
                  )}
                </section>

                <section className="pt-2 border-t border-gray-100">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3 mt-4">Wording</h2>
                  <Text label="Button" value={editing.submit_label}
                    onChange={(v) => patch({ submit_label: v })} />
                  <Text label="After they submit" value={editing.success_message}
                    onChange={(v) => patch({ success_message: v })} />
                  <Text label="If it fails" value={editing.error_message}
                    onChange={(v) => patch({ error_message: v })} />
                  <Text label="Privacy policy link" value={editing.privacy_url ?? ''}
                    onChange={(v) => patch({ privacy_url: v || null })} placeholder="https://…" />
                  <Text label="Terms of service link" value={editing.terms_url ?? ''}
                    onChange={(v) => patch({ terms_url: v || null })} placeholder="https://…" />
                </section>

                <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
                  <button onClick={save} disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-60 shadow-sm transition">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving' : 'Save'}
                  </button>
                  {editing.updated_at && (
                    <span className="text-xs text-gray-400">
                      Last saved {new Date(editing.updated_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:sticky lg:top-24">
              <Preview def={editing} />
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Put this on the site</h2>
                <pre className="text-[11px] leading-relaxed bg-slate-50 border border-gray-100 rounded-xl p-3 overflow-x-auto text-gray-700 whitespace-pre-wrap break-all">{embed}</pre>
                <button
                  onClick={() => { navigator.clipboard.writeText(embed); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="mt-3 w-full py-2.5 rounded-xl text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition inline-flex items-center justify-center gap-1.5">
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
                <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                  Paste it once. Every change you save here is live on the site straight away —
                  the page reads the form rather than carrying a copy of it.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FormList({ forms, onNew, onOpen }: {
  forms: FormDef[] | null;
  onNew: () => void;
  onOpen: (f: FormDef) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {forms === null ? 'Loading…' : `${forms.length} form${forms.length === 1 ? '' : 's'}`}
        </div>
        <button onClick={onNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 shadow-sm transition">
          <Plus className="w-4 h-4" /> New form
        </button>
      </div>

      {forms === null ? (
        <div className="px-6 py-10 text-sm text-gray-400">Loading…</div>
      ) : !forms.length ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No forms yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            A new one starts with the fields a gym enquiry actually asks for.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {forms.map((f) => (
            <button key={f.id} onClick={() => onOpen(f)}
              className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{f.name}</div>
                <div className="text-xs text-gray-400 truncate">
                  {f.slug} · {f.fields?.length ?? 0} fields
                  {f.site_hostname ? ` · ${f.site_hostname}` : ''}
                  {f.ghl_webhook_url ? '' : ' · no webhook set'}
                </div>
              </div>
              {!f.active && <span className="text-[10px] font-bold uppercase text-gray-400">off</span>}
              {f.updated_at && (
                <span className="text-[11px] text-gray-400 hidden sm:block">
                  {new Date(f.updated_at).toLocaleDateString()}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({ field, onChange, onUp, onDown, onRemove }: {
  field: FormField;
  onChange: (p: Partial<FormField>) => void;
  onUp: () => void; onDown: () => void; onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-slate-50/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex flex-col -my-1">
          <button onClick={onUp} className="text-gray-300 hover:text-gray-600 leading-none text-[10px]">▲</button>
          <button onClick={onDown} className="text-gray-300 hover:text-gray-600 leading-none text-[10px]">▼</button>
        </div>
        <GripVertical className="w-3.5 h-3.5 text-gray-300" />
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 text-sm font-semibold text-gray-900 bg-transparent outline-none"
          placeholder="Label"
        />
        <button onClick={onRemove} className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-8">
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700">
          {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <input
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() })}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 font-mono w-36"
          placeholder="field_name"
          title="What GoHighLevel receives this as"
        />

        <label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
          <input type="checkbox" checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="accent-cyan-600" />
          Required
        </label>

        {field.type === 'select' && (
          <input
            value={(field.options ?? []).join(', ')}
            onChange={(e) => onChange({ options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            className="flex-1 min-w-[140px] text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700"
            placeholder="Adult, Youth"
          />
        )}
      </div>
    </div>
  );
}

// What the visitor will see. Rendered from the same definition the embed reads,
// so there is no second idea of what the form looks like.
function Preview({ def }: { def: FormDef }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Preview</h2>
      <div className="space-y-3">
        {def.fields.map((f, i) => (
          <div key={i}>
            {f.type === 'checkbox' ? (
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" disabled className="mt-0.5 accent-cyan-600" />
                <span>{f.label}{f.required ? ' *' : ''}</span>
              </label>
            ) : (
              <>
                <div className="text-[11px] font-semibold text-gray-500 mb-1">
                  {f.label}{f.required ? '' : ' (optional)'}
                </div>
                {f.type === 'select' ? (
                  <select disabled className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 bg-slate-50 text-gray-400">
                    <option>{f.placeholder || 'Choose one'}</option>
                  </select>
                ) : f.type === 'textarea' ? (
                  <div className="w-full h-16 rounded-lg border border-gray-200 bg-slate-50" />
                ) : (
                  <div className="w-full h-9 rounded-lg border border-gray-200 bg-slate-50" />
                )}
              </>
            )}
          </div>
        ))}
        <div className="pt-1">
          <div className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold text-center">
            {def.submit_label || 'Send'}
          </div>
        </div>
        {(def.privacy_url || def.terms_url) && (
          <p className="text-[10px] text-gray-400 leading-relaxed">
            By submitting you agree to our{def.privacy_url ? ' privacy policy' : ''}
            {def.privacy_url && def.terms_url ? ' and' : ''}{def.terms_url ? ' terms of service' : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

function Text({ label, hint, value, onChange, placeholder }: {
  label: string; hint?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 outline-none focus:border-cyan-400"
      />
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function Toggle({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-cyan-600" />
      <span>
        <span className="block text-sm text-gray-800">{label}</span>
        {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}
