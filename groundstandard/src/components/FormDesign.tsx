// FormDesign — the Design card of the Custom Form Builder.
//
// Everything a form can look like, from the person's side: pick a preset, then
// adjust. Every control has a "site default" state and that is where it starts,
// because the embed's whole idea is to borrow the site's own font and colours —
// a form nobody has styled is the form we have always shipped. What is set here
// is saved as tokens on the form and read by form.js, which turns each one into
// a CSS variable on that form's root.
//
// The list of tokens and what each one does lives in form.js (themeVars). This
// file only decides how they are asked for.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, RotateCcw, X } from 'lucide-react';

export type FormTheme = {
  preset?: string;

  // colours — absent means the site's own
  accent?: string;
  text?: string;
  label_color?: string;
  input_bg?: string;
  input_border?: string;
  input_text?: string;
  placeholder?: string;
  button_bg?: string;
  button_text?: string;
  button_hover_bg?: string;
  button_border?: string;
  button_gradient?: string;
  card_bg?: string;
  card_border?: string;
  ok_color?: string;
  bad_color?: string;

  // type
  font_family?: string;
  font_google?: boolean;
  font_size?: number;
  label_size?: number;
  label_weight?: 400 | 500 | 600 | 700;
  button_size?: number;
  button_weight?: 400 | 500 | 600 | 700 | 800;
  fine_style?: 'sentence' | 'links';   // the privacy/terms line under the button

  // shape
  radius?: number;
  button_radius?: number;
  border_width?: number;

  // inputs
  input_style?: 'outlined' | 'filled' | 'underline';
  input_height?: number;
  label_position?: 'above' | 'placeholder' | 'floating';
  gap?: number;
  textarea_size?: 'short' | 'normal' | 'tall';
  input_shadow?: 'none' | 'sm';

  // button
  button_width?: 'full' | 'auto';
  button_align?: 'left' | 'center' | 'right';
  button_height?: number;
  button_case?: 'normal' | 'upper';
  button_spacing?: number;
  button_shadow?: 'none' | 'sm' | 'md';
  button_hover?: 'none' | 'darken' | 'lift';

  // card & layout
  card?: boolean;
  card_padding?: number;
  card_shadow?: 'none' | 'sm' | 'md' | 'lg';
  max_width?: number;

  // effects
  transitions?: boolean;
  focus_style?: 'outline' | 'glow';

  // the last five percent
  css?: string;
};

// Unset, empty and "off" all mean the same thing: the site's own. Dropping them
// keeps {} as the one way to spell "match the site".
export const pruneTheme = (t: FormTheme): FormTheme => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    out[k] = v;
  }
  return out as FormTheme;
};

export const countSet = (t: FormTheme) => Object.keys(pruneTheme(t)).filter(k => k !== 'preset').length;

// Curated rather than the whole Google catalogue: faces that hold up on a gym
// site at 15px, and enough of them to cover a brand.
export const FONTS = [
  'Inter', 'DM Sans', 'Manrope', 'Poppins', 'Montserrat', 'Roboto', 'Open Sans', 'Lato',
  'Nunito', 'Work Sans', 'Barlow', 'Barlow Condensed', 'Oswald', 'Bebas Neue', 'Anton', 'Rubik',
  'Raleway', 'Source Sans 3', 'Plus Jakarta Sans', 'Outfit', 'Space Grotesk', 'Sora', 'Urbanist',
  'Karla', 'Figtree', 'Playfair Display', 'Lora', 'Merriweather', 'DM Serif Display', 'IBM Plex Sans',
];

export const PRESETS: { name: string; label: string; blurb: string; theme: FormTheme }[] = [
  { name: 'site', label: 'Match the site', blurb: "Nothing set. The site's own font, colours and a button in its text colour.", theme: {} },
  { name: 'clean', label: 'Clean', blurb: 'White inputs, near-black text, blue accent, soft corners.',
    theme: { accent: '#2563eb', text: '#111827', input_bg: '#ffffff', input_border: '#d1d5db', input_text: '#111827', radius: 8, transitions: true } },
  { name: 'bold', label: 'Bold', blurb: 'Sharp corners, heavy borders, a red button that darkens on hover.',
    theme: { accent: '#dc2626', radius: 4, border_width: 2, input_border: '#111111', label_weight: 700, button_weight: 700, button_shadow: 'md', button_hover: 'darken', transitions: true } },
  { name: 'soft', label: 'Soft', blurb: 'Filled grey inputs, rounded, a pill button that lifts.',
    theme: { accent: '#4f46e5', input_style: 'filled', input_bg: '#f4f4f5', input_text: '#18181b', radius: 14, button_radius: 999, button_hover: 'lift', button_shadow: 'sm', gap: 16, transitions: true } },
  { name: 'dark', label: 'Dark', blurb: 'A dark card with light text and a sky-blue accent.',
    theme: { card: true, card_bg: '#0f172a', card_padding: 28, text: '#e2e8f0', input_bg: '#1e293b', input_border: '#334155', input_text: '#f8fafc', placeholder: '#64748b', accent: '#38bdf8', button_text: '#0f172a', radius: 10, transitions: true } },
  { name: 'outline', label: 'Outline', blurb: 'Square, monochrome, a transparent button with a border.',
    theme: { accent: '#111827', button_bg: '#00000000', button_border: '#111827', button_text: '#111827', input_border: '#111827', radius: 0, button_hover: 'lift', transitions: true } },
  { name: 'pill', label: 'Pill', blurb: 'Fully rounded, labels in the boxes, green accent.',
    theme: { accent: '#059669', radius: 999, button_radius: 999, label_position: 'placeholder', input_height: 48, button_hover: 'lift', button_shadow: 'sm', transitions: true } },
  { name: 'minimal', label: 'Minimal', blurb: 'Underlines only, quiet labels, a small button on the right.',
    theme: { input_style: 'underline', label_weight: 500, label_size: 12, button_width: 'auto', button_align: 'right', radius: 0, transitions: true } },
  { name: 'floating', label: 'Floating', blurb: 'Labels inside the boxes that float up as you type.',
    theme: { accent: '#2563eb', label_position: 'floating', input_height: 56, radius: 10, focus_style: 'glow', transitions: true } },
  { name: 'fight-night', label: 'Fight Night', blurb: 'Black card, dark inputs, an amber button in capitals.',
    theme: { card: true, card_bg: '#0a0a0a', card_border: '#2a2a2a', card_padding: 24, radius: 2, text: '#f5f5f5', input_bg: '#161616', input_border: '#2a2a2a', input_text: '#f5f5f5', placeholder: '#8a8a8a', label_position: 'placeholder', textarea_size: 'tall', accent: '#f5b301', button_text: '#1a1a1a', button_weight: 700, button_case: 'upper', button_spacing: 1, button_height: 48, gap: 12, fine_style: 'links' } },
];

// Two themes are the same look if they agree on everything but the custom CSS
// and the preset's own name.
const lookOf = (t: FormTheme) => {
  const p = pruneTheme(t) as Record<string, unknown>;
  delete p.css; delete p.preset;
  return JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]));
};

const GROUPS: Record<string, (keyof FormTheme)[]> = {
  brand: ['accent', 'font_family'],
  colours: ['text', 'label_color', 'input_bg', 'input_text', 'placeholder', 'input_border', 'button_bg', 'button_text', 'button_hover_bg', 'button_border', 'card_bg', 'card_border', 'ok_color', 'bad_color'],
  text: ['font_size', 'label_size', 'label_weight', 'button_size', 'button_weight', 'fine_style'],
  inputs: ['input_style', 'input_height', 'radius', 'border_width', 'label_position', 'gap', 'textarea_size', 'input_shadow'],
  button: ['button_width', 'button_align', 'button_radius', 'button_height', 'button_case', 'button_spacing', 'button_gradient', 'button_shadow', 'button_hover'],
  card: ['card', 'card_padding', 'card_shadow', 'max_width'],
  effects: ['transitions', 'focus_style'],
  css: ['css'],
};

export default function FormDesign({ theme, onChange, onReplace }: {
  theme: FormTheme;
  onChange: (p: Partial<FormTheme>) => void;
  onReplace: (t: FormTheme) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ presets: true, brand: true });
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const set = <K extends keyof FormTheme>(k: K, v: FormTheme[K] | undefined) =>
    onChange({ [k]: v } as Partial<FormTheme>);
  const inGroup = (g: string) => GROUPS[g].filter(k => pruneTheme(theme)[k] !== undefined).length;

  const current = PRESETS.find(p => lookOf(p.theme) === lookOf(theme));
  const anything = countSet(theme) > 0;

  return (
    <div className="divide-y divide-slate-100">
      <Group title="Presets" hint="Start here, then adjust anything below." open={!!open.presets} onToggle={() => toggle('presets')}
        right={anything && !current ? <Tag>Custom</Tag> : current && current.name !== 'site' ? <Tag>{current.label}</Tag> : null}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => onReplace({ ...p.theme, ...(theme.css ? { css: theme.css } : {}), preset: p.name })}
              title={p.blurb}
              className={`group rounded-xl border p-2 text-left transition ${
                current?.name === p.name ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <Tile t={p.theme} />
              <div className="mt-1.5 truncate text-[11px] font-semibold text-slate-700">{p.label}</div>
            </button>
          ))}
        </div>
        {anything && (
          <button
            onClick={() => { if (window.confirm('Clear every design choice and go back to the site\'s own look?')) onReplace({}); }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            <RotateCcw className="h-3 w-3" /> Reset to site defaults
          </button>
        )}
      </Group>

      <Group title="Brand" hint="The two choices that change the most." count={inGroup('brand')} open={!!open.brand} onToggle={() => toggle('brand')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <ColorField label="Accent" hint="Focus ring, ticked boxes, and the button unless it has its own colour." value={theme.accent} onChange={v => set('accent', v)} />
          <FontPicker value={theme.font_family} onChange={(f) => onChange(f ? { font_family: f, font_google: true } : { font_family: undefined, font_google: undefined })} />
        </div>
      </Group>

      <Group title="Colours" count={inGroup('colours')} open={!!open.colours} onToggle={() => toggle('colours')}>
        <div className="space-y-5">
          <Swatches title="Text">
            <ColorField label="Body text" value={theme.text} onChange={v => set('text', v)} />
            <ColorField label="Labels" value={theme.label_color} onChange={v => set('label_color', v)} />
          </Swatches>
          <Swatches title="Inputs">
            <ColorField label="Background" value={theme.input_bg} onChange={v => set('input_bg', v)} />
            <ColorField label="Text" value={theme.input_text} onChange={v => set('input_text', v)} />
            <ColorField label="Placeholder" value={theme.placeholder} onChange={v => set('placeholder', v)} />
            <ColorField label="Border" value={theme.input_border} onChange={v => set('input_border', v)} />
          </Swatches>
          <Swatches title="Button">
            <ColorField label="Background" value={theme.button_bg} onChange={v => set('button_bg', v)} />
            <ColorField label="Text" value={theme.button_text} onChange={v => set('button_text', v)} />
            <ColorField label="On hover" value={theme.button_hover_bg} onChange={v => set('button_hover_bg', v)} />
            <ColorField label="Border" value={theme.button_border} onChange={v => set('button_border', v)} />
          </Swatches>
          <Swatches title="Card" hint={theme.card ? undefined : 'Turn the card on under Card & layout to see these.'}>
            <ColorField label="Background" value={theme.card_bg} onChange={v => set('card_bg', v)} />
            <ColorField label="Border" value={theme.card_border} onChange={v => set('card_border', v)} />
          </Swatches>
          <Swatches title="After submitting">
            <ColorField label="Thank-you message" value={theme.ok_color} onChange={v => set('ok_color', v)} />
            <ColorField label="Error message" value={theme.bad_color} onChange={v => set('bad_color', v)} />
          </Swatches>
        </div>
      </Group>

      <Group title="Text" count={inGroup('text')} open={!!open.text} onToggle={() => toggle('text')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Range label="Base size" value={theme.font_size} fallback={15} min={13} max={20} onChange={v => set('font_size', v)} warnBelow={16} />
          <Range label="Label size" value={theme.label_size} fallback={13} min={11} max={16} onChange={v => set('label_size', v)} />
          <Control label="Label weight">
            <Segmented value={theme.label_weight} onChange={v => set('label_weight', v)}
              options={[{ value: 600, label: '600' }, { value: 400, label: '400' }, { value: 500, label: '500' }, { value: 700, label: '700' }]} />
          </Control>
          <Control label="Button weight">
            <Segmented value={theme.button_weight} onChange={v => set('button_weight', v)}
              options={[{ value: 600, label: '600' }, { value: 400, label: '400' }, { value: 500, label: '500' }, { value: 700, label: '700' }, { value: 800, label: '800' }]} />
          </Control>
          <Range label="Button text size" value={theme.button_size} fallback={15} min={13} max={20} onChange={v => set('button_size', v)} />
          <Control label="Privacy & terms line" hint={theme.fine_style === 'links' ? 'Privacy Policy | Terms of Service, centred under the button.' : '"By submitting you agree to our privacy policy and terms of service."'}>
            <Segmented value={theme.fine_style} onChange={v => set('fine_style', v)}
              options={[{ value: 'sentence', label: 'Sentence' }, { value: 'links', label: 'Links' }]} />
          </Control>
        </div>
      </Group>

      <Group title="Inputs" count={inGroup('inputs')} open={!!open.inputs} onToggle={() => toggle('inputs')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Control label="Style">
            <Segmented value={theme.input_style} onChange={v => set('input_style', v)}
              options={[{ value: 'outlined', label: 'Outlined' }, { value: 'filled', label: 'Filled' }, { value: 'underline', label: 'Underline' }]} />
          </Control>
          <Control label="Label position">
            <Segmented value={theme.label_position} onChange={v => set('label_position', v)}
              options={[{ value: 'above', label: 'Above' }, { value: 'placeholder', label: 'In the box' }, { value: 'floating', label: 'Floating' }]} />
          </Control>
          <Range label="Height" value={theme.input_height} fallback={45} min={36} max={64} onChange={v => set('input_height', v)} />
          <Range label="Corner radius" value={theme.radius} fallback={8} min={0} max={24} onChange={v => set('radius', v)} />
          <Range label="Border width" value={theme.border_width} fallback={1} min={0} max={3} onChange={v => set('border_width', v)} />
          <Range label="Space between fields" value={theme.gap} fallback={14} min={8} max={28} onChange={v => set('gap', v)} />
          <Control label="Message box height">
            <Segmented value={theme.textarea_size} onChange={v => set('textarea_size', v)}
              options={[{ value: 'normal', label: 'Normal' }, { value: 'short', label: 'Short' }, { value: 'tall', label: 'Tall' }]} />
          </Control>
          <Control label="Shadow">
            <Segmented value={theme.input_shadow} onChange={v => set('input_shadow', v)}
              options={[{ value: 'none', label: 'None' }, { value: 'sm', label: 'Subtle' }]} />
          </Control>
        </div>
      </Group>

      <Group title="Button" count={inGroup('button')} open={!!open.button} onToggle={() => toggle('button')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Control label="Width">
            <Segmented value={theme.button_width} onChange={v => set('button_width', v)}
              options={[{ value: 'full', label: 'Full' }, { value: 'auto', label: 'Auto' }]} />
          </Control>
          <Control label="Alignment" hint={theme.button_width === 'auto' ? undefined : 'Only when the width is Auto.'}>
            <Segmented value={theme.button_align} onChange={v => set('button_align', v)}
              options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} />
          </Control>
          <Range label="Corner radius" value={theme.button_radius} fallback={theme.radius ?? 8} min={0} max={999} onChange={v => set('button_radius', v)} pill />
          <Range label="Height" value={theme.button_height} fallback={45} min={40} max={60} onChange={v => set('button_height', v)} />
          <Control label="Text style">
            <Segmented value={theme.button_case} onChange={v => set('button_case', v)}
              options={[{ value: 'normal', label: 'Normal' }, { value: 'upper', label: 'UPPERCASE' }]} />
          </Control>
          <Range label="Letter spacing" value={theme.button_spacing} fallback={0} min={0} max={3} step={0.5} onChange={v => set('button_spacing', v)} />
          <ColorField label="Gradient to" hint="A second colour; the button blends diagonally into it." value={theme.button_gradient} onChange={v => set('button_gradient', v)} />
          <Control label="Shadow">
            <Segmented value={theme.button_shadow} onChange={v => set('button_shadow', v)}
              options={[{ value: 'none', label: 'None' }, { value: 'sm', label: 'Soft' }, { value: 'md', label: 'Strong' }]} />
          </Control>
          <Control label="On hover">
            <Segmented value={theme.button_hover} onChange={v => set('button_hover', v)}
              options={[{ value: 'none', label: 'Nothing' }, { value: 'darken', label: 'Darken' }, { value: 'lift', label: 'Lift' }]} />
          </Control>
        </div>
      </Group>

      <Group title="Card & layout" count={inGroup('card')} open={!!open.card} onToggle={() => toggle('card')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Control label="Card" hint="The form sits on its own surface, with padding and a border.">
            <Segmented value={theme.card ? 'on' : undefined} onChange={v => set('card', v === 'on' ? true : undefined)}
              options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
          </Control>
          <Control label="Card shadow">
            <Segmented value={theme.card_shadow} onChange={v => set('card_shadow', v)}
              options={[{ value: 'none', label: 'None' }, { value: 'sm', label: 'Soft' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} />
          </Control>
          <Range label="Card padding" value={theme.card_padding} fallback={24} min={12} max={40} onChange={v => set('card_padding', v)} />
          <Range label="Max width" value={theme.max_width} fallback={520} min={320} max={800} step={10} onChange={v => set('max_width', v)} />
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          Fields side by side: use the <span className="rounded bg-slate-100 px-1 font-semibold text-slate-600">½</span> toggle
          on a field, up in the Fields card. Two half fields share a row and stack on phones.
        </p>
      </Group>

      <Group title="Effects" count={inGroup('effects')} open={!!open.effects} onToggle={() => toggle('effects')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Control label="Transitions" hint="Borders, shadows and the button ease over 150ms instead of snapping.">
            <Segmented value={theme.transitions ? 'on' : undefined} onChange={v => set('transitions', v === 'on' ? true : undefined)}
              options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
          </Control>
          <Control label="Focus">
            <Segmented value={theme.focus_style} onChange={v => set('focus_style', v)}
              options={[{ value: 'outline', label: 'Outline' }, { value: 'glow', label: 'Glow' }]} />
          </Control>
        </div>
      </Group>

      <Group title="Custom CSS" hint="For the last five percent." count={inGroup('css')} open={!!open.css} onToggle={() => toggle('css')}>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
          Only this form is affected. Start selectors with one of these, or <code className="rounded bg-slate-100 px-1">&amp;</code> for the form itself:
        </p>
        <p className="mb-3 font-mono text-[11px] leading-relaxed text-slate-500">
          .gsf-row · .gsf-half · .gsf-label · .gsf-req · .gsf-input · .gsf-select · .gsf-textarea · .gsf-check · .gsf-btn · .gsf-msg.ok · .gsf-msg.bad · .gsf-fine
        </p>
        <textarea
          value={theme.css ?? ''}
          onChange={e => set('css', e.target.value || undefined)}
          rows={6}
          spellCheck={false}
          placeholder={'.gsf-btn { letter-spacing: .04em }'}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        />
      </Group>
    </div>
  );
}

/* ── a preset, drawn small ─────────────────────────────────────────────── */

function Tile({ t }: { t: FormTheme }) {
  const r = Math.min(t.radius ?? 8, 10);
  const bg = t.card ? (t.card_bg ?? '#fff') : 'transparent';
  const inputBg = t.input_style === 'filled' ? (t.input_bg ?? '#e4e4e7') : (t.input_bg ?? 'transparent');
  const border = t.input_style === 'underline'
    ? `0 0 ${Math.max(t.border_width ?? 1, 1)}px 0`
    : t.input_style === 'filled' ? '0' : `${Math.max(t.border_width ?? 1, 1)}px`;
  const borderColor = t.input_border ?? (t.card ? '#334155' : '#c8c8cc');
  const btn = t.button_bg ?? t.accent ?? '#3f3f46';
  const btnBorder = t.button_border ? `1px solid ${t.button_border}` : 'none';
  const gradient = t.button_gradient ? `linear-gradient(135deg, ${btn}, ${t.button_gradient})` : btn;
  const btnR = Math.min(t.button_radius ?? t.radius ?? 8, 12);
  return (
    <div className="space-y-1 rounded-lg p-1.5 transition group-hover:brightness-[.98]" style={{ background: bg, border: t.card ? `1px solid ${t.card_border ?? 'transparent'}` : '1px solid transparent' }}>
      {[0, 1].map(i => (
        <div key={i} className="h-3.5" style={{
          background: inputBg, borderStyle: 'solid', borderWidth: border, borderColor,
          borderRadius: t.input_style === 'underline' ? 0 : r,
        }} />
      ))}
      <div className={`h-3.5 ${t.button_width === 'auto' ? 'ml-auto w-1/2' : 'w-full'}`} style={{ background: gradient, borderRadius: btnR, border: btnBorder }} />
    </div>
  );
}

/* ── controls ─────────────────────────────────────────────────────────── */

function Group({ title, hint, count, right, open, onToggle, children }: {
  title: string; hint?: string; count?: number; right?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50/70">
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          {hint && <span className="ml-2 hidden text-xs text-slate-400 sm:inline">{hint}</span>}
        </span>
        {right}
        {!!count && <Tag>{count} set</Tag>}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{children}</span>;
}

function Swatches({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Control({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-slate-700">{label}</div>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

// A swatch that opens the browser's picker, the hex beside it, and a way back
// to the site's own colour — shown hatched, because "no colour" is a real state.
function ColorField({ label, hint, value, onChange }: {
  label: string; hint?: string; value?: string; onChange: (v: string | undefined) => void;
}) {
  const hex6 = value && /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : '#888888';
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <label
          title={value ? value : 'Site default — click to choose'}
          className="relative h-9 w-9 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-200 shadow-sm"
          style={value
            ? { background: value }
            : { backgroundImage: 'repeating-linear-gradient(45deg,#e2e8f0 0 4px,#ffffff 4px 8px)' }}
        >
          <input type="color" value={hex6} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-700">{label}</div>
          <input
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value.trim() || undefined)}
            placeholder="Site default"
            spellCheck={false}
            className="w-full bg-transparent font-mono text-[11px] text-slate-500 outline-none placeholder:text-slate-300"
          />
        </div>
        {value && (
          <button onClick={() => onChange(undefined)} title="Back to the site's own" className="rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

// The first option is always the site default, and choosing it clears the key.
function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T | undefined; options: { value: T; label: string }[]; onChange: (v: T | undefined) => void;
}) {
  const current = value ?? options[0].value;
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(i === 0 ? undefined : o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            current === o.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Range({ label, value, fallback, min, max, step = 1, unit = 'px', onChange, warnBelow, pill }: {
  label: string; value?: number; fallback: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number | undefined) => void; warnBelow?: number; pill?: boolean;
}) {
  const shown = value ?? fallback;
  const isPill = pill && shown >= 999;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
          <span className={value === undefined ? 'text-slate-400' : 'font-medium text-slate-700'}>
            {isPill ? 'Pill' : `${shown}${unit}`}
          </span>
          {value === undefined
            ? <span className="text-slate-300">default</span>
            : <button onClick={() => onChange(undefined)} title="Back to the site default" className="text-slate-300 transition hover:text-slate-600"><RotateCcw className="h-3 w-3" /></button>}
        </span>
      </div>
      <input
        type="range" min={min} max={pill ? 40 : max} step={step}
        value={isPill ? 40 : Math.min(shown, pill ? 40 : max)}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(pill && n >= 40 ? 999 : n);
        }}
        className="w-full accent-slate-900"
      />
      {warnBelow !== undefined && value !== undefined && value < warnBelow && (
        <p className="mt-1 text-[11px] text-amber-600">iPhones zoom the page when a field under {warnBelow}px is tapped. On phones the form keeps 16px anyway.</p>
      )}
    </div>
  );
}

function FontPicker({ value, onChange }: { value?: string; onChange: (family: string | undefined) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-slate-700">Font</div>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        >
          <option value="">Site's own font</option>
          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>
      {value ? (
        <p className="mt-2 truncate text-base text-slate-800" style={{ fontFamily: `"${value}", sans-serif` }}>
          Book your free trial — {value}
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
        The site's own font costs nothing. A Google Font adds one request to Google from that client's page — fine for most, a privacy question for EU visitors — so prefer the site's font when the gym already loads its brand face.
      </p>
    </div>
  );
}
