/**
 * Put the real Killer B form into the builder.
 *
 * The site's forms are written into the pages by hand today. This is the same
 * form expressed as a builder record, field for field and colour for colour,
 * taken from the live site rather than from memory: the field names the GHL
 * webhook already receives, the placeholders the visitor reads, the button
 * wording, and the Design values read off the page's own styles.
 *
 * Nothing on the client's site changes by running this. It only fills in the
 * builder, so the form can be moved onto the one-line embed when we choose to.
 *
 *   node scripts/seed-killer-b-form.mjs          print the SQL, write nothing
 *   node scripts/seed-killer-b-form.mjs --write  apply it
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const PROJECT = 'qkwiauivaerrrbemdlyj';

// ── the fields, in the order they appear on the page ────────────────────────
// first + last share a row, and so do email + phone, the way the client's
// reference form has them. The two choices are the ones he asked for by name:
// "Adult, youth or both", and "Martial Arts / Fitness / Both — to differentiate
// blab from killer b students".
const fields = [
  { name: 'first_name', label: 'First name', type: 'text', required: true,
    placeholder: 'First Name', width: 'half' },
  { name: 'last_name', label: 'Last name', type: 'text', required: true,
    placeholder: 'Last Name', width: 'half' },
  { name: 'email', label: 'Email', type: 'email', required: true,
    placeholder: 'Email Address', width: 'half' },
  { name: 'phone', label: 'Phone', type: 'phone', required: true,
    placeholder: 'Phone Number', width: 'half' },
  { name: 'message', label: 'Anything you want us to know?', type: 'textarea',
    required: false, placeholder: 'Anything you want us to know?' },
  { name: 'audience', label: 'Select a program', type: 'select', required: true,
    placeholder: 'Select a program',
    options: ['Adult = adult', 'Youth = youth', 'Both = both'] },
  { name: 'focus', label: 'Select an interest', type: 'select', required: true,
    placeholder: 'Select an interest',
    options: ['Martial Arts = martial-arts', 'Fitness = fitness', 'Both = both'] },
  // What the CRM reads to tell one form from another. The visitor never sees these.
  { name: 'source', label: 'Which form this is', type: 'hidden', required: false,
    value: 'website contact' },
  { name: 'site_id', label: 'Killer B site id', type: 'hidden', required: false,
    value: 'killer-b-hq' },
];

// ── the design, read off the site's own styles ─────────────────────────────
// Two of these are translucent on the page — a white border at 12% over the
// card and over an input. Flattened here against the colour underneath, which
// is the same thing to look at and keeps them as picker-friendly values.
const theme = {
  preset: 'fight-night',

  card: true,
  card_bg: '#0d0d0f',
  card_border: '#2a2a2c',
  card_padding: 24,
  max_width: 520,
  gap: 12,

  text: '#ffffff',
  font_size: 15,
  radius: 0,
  border_width: 1,

  input_bg: '#111113',
  input_border: '#2e2e2f',
  input_text: '#ffffff',
  placeholder: '#6b6b70',
  input_height: 51,
  label_position: 'placeholder',

  accent: '#f2b01e',
  button_text: '#15130c',
  button_size: 14,
  button_weight: 600,
  button_case: 'upper',
  button_spacing: 1,
  button_height: 50,

  fine_style: 'links',

  // The site serves its own Inter, Oswald and JetBrains Mono -- no Google
  // request, and none wanted here either: naming the family is enough, because
  // the page it sits on has already loaded it. font_google stays off.
  font_family: 'Inter',

  // The one thing the panel has no knob for. On the site the fields are Inter
  // and the button is Oswald, and the button inherits the form's font, so the
  // button is the only place that needs saying.
  css: "& .gsf-btn{font-family:'Oswald',sans-serif}",
};

const row = {
  name: 'Killer B HQ — website contact',
  site_hostname: 'killerbhq.com',
  submit_label: 'Start Your Trial',
  success_message: 'Thanks — we will be in touch shortly.',
  // Relative, so they keep working when the site moves off the staging domain.
  privacy_url: '/privacy',
  terms_url: '/terms',
  redirect_enabled: true,
  // One destination, because there is only one page worth landing on: the
  // calendar sits on /thank-you/trial and nowhere else. A rule per answer would
  // read as three different outcomes and deliver the same one. When there is a
  // page per calendar, the rules go in and this becomes the fallback.
  //
  // This is the one place the record deliberately differs from the site today.
  // The site sends this form to /thank-you/contact, which has no calendar --
  // so a visitor who pressed "Start Your Trial" arrives somewhere they cannot
  // book.
  redirect_default: '/thank-you/trial',
  redirect_rules: [],
  fields,
  theme,
};

const lit = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const str = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const sql = `
update forms set
  name             = ${str(row.name)},
  site_hostname    = ${str(row.site_hostname)},
  submit_label     = ${str(row.submit_label)},
  success_message  = ${str(row.success_message)},
  privacy_url      = ${str(row.privacy_url)},
  terms_url        = ${str(row.terms_url)},
  redirect_enabled = ${row.redirect_enabled},
  redirect_default = ${str(row.redirect_default)},
  redirect_rules   = ${lit(row.redirect_rules)},
  fields           = ${lit(row.fields)},
  theme            = ${lit(row.theme)}
where slug = 'killer-b-contact'
returning slug, name, submit_label, jsonb_array_length(fields) as field_count;
`.trim();

if (!process.argv.includes('--write')) {
  console.log(sql);
  console.log('\nnothing written. Pass --write.');
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.json();
console.log(res.ok ? 'written:' : 'failed:', JSON.stringify(body, null, 1));
process.exit(res.ok ? 0 : 1);
