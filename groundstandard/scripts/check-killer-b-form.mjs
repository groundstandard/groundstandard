/**
 * Draw the builder's Killer B form with the real embed, and compare it to the
 * hard-coded one on the site.
 *
 * The point of the record is that it renders the same form the site renders by
 * hand. Reading the two definitions side by side is not proof of that -- one is
 * page markup and the other is a row -- so this runs form.js against the row and
 * reads the elements that come out.
 *
 *   node scripts/check-killer-b-form.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));

const res = await fetch(
  'https://api.supabase.com/v1/projects/qkwiauivaerrrbemdlyj/database/query',
  { method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "select * from forms where slug = 'killer-b-contact';" }) });
const [def] = await res.json();

const dom = new JSDOM(
  '<!doctype html><html><body><div data-gs-form="killer-b-contact"></div></body></html>',
  { url: 'https://killerbhq.com/contact', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

// The embed reads its definition over the network and its key off its own tag.
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([def]) });
Object.defineProperty(window.document, 'currentScript', {
  value: { getAttribute: () => 'anon-key' }, configurable: true,
});

window.eval(readFileSync(new URL('../public/form.js', import.meta.url), 'utf8'));
await new Promise((r) => setTimeout(r, 300));

const form = window.document.querySelector('form');
if (!form) { console.error('the embed drew nothing'); process.exit(1); }

// What the site's own /contact form has, read off the published page earlier.
const SITE = [
  ['first_name', 'First Name', true, 'half'],
  ['last_name', 'Last Name', true, 'half'],
  ['email', 'Email Address', true, 'half'],
  ['phone', 'Phone Number', true, 'half'],
  ['message', 'Anything you want us to know?', false, 'full'],
  ['audience', 'Select a program', true, 'full'],
  ['focus', 'Select an interest', true, 'full'],
];

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

for (const [name, placeholder, required, width] of SITE) {
  const node = form.elements[name];
  if (!node) { check(name, false, 'not drawn'); continue; }
  const shown = node.placeholder || (node.tagName === 'SELECT'
    ? (node.options[0] && node.options[0].textContent) : '');
  const half = !!node.closest('.gsf-half');
  const problems = [];
  if (shown !== placeholder) problems.push(`reads "${shown}"`);
  if (node.required !== required) problems.push(`required=${node.required}`);
  if (half !== (width === 'half')) problems.push(half ? 'is half width' : 'is full width');
  check(name, !problems.length, problems.join('; ') || `"${shown}", ${width}`);
}

const choices = (name) => [...form.elements[name].options].slice(1).map((o) => o.value);
check('the program choices are the ones asked for',
  choices('audience').join(',') === 'adult,youth,both', choices('audience').join(' / '));
check('the interest choices are the ones asked for',
  choices('focus').join(',') === 'martial-arts,fitness,both', choices('focus').join(' / '));

check('the button says what the site says',
  form.querySelector('button[type=submit]').textContent.trim() === 'Start Your Trial',
  form.querySelector('button[type=submit]').textContent.trim());

const legal = [...form.querySelectorAll('.gsf-fine a')].map((a) => a.getAttribute('href'));
check('privacy and terms are on the form',
  legal.join(',') === '/privacy,/terms', legal.join(' | ') || 'none');

for (const hidden of ['source', 'site_id']) {
  check(`${hidden} rides along unseen`, form.elements[hidden] && form.elements[hidden].type === 'hidden',
    form.elements[hidden] ? form.elements[hidden].value : 'missing');
}

check('the old interest dropdown is gone', !form.elements.interest,
  form.elements.interest ? 'still there' : 'gone');

// The look: the values the Design panel wrote should reach the form as variables.
const root = form.closest('.gsf') || form.parentElement;
const style = root.getAttribute('style') || '';
for (const [label, token] of [['the club yellow', '#f2b01e'], ['the card', '#0d0d0f'],
                              ['the inputs', '#111113']]) {
  check(`${label} carries through`, style.includes(token), style.includes(token) ? token : 'not set');
}

// Type: the fields take the site's body face, the button its display face.
check('the fields use the site body face', style.includes('"Inter"'),
  (style.match(/--gsf-font:[^;]*/) || ['not set'])[0]);
const sheet = window.document.getElementById('gsf-css-killer-b-contact');
check('the button keeps the site display face',
  !!sheet && sheet.textContent.includes("Oswald"),
  sheet ? sheet.textContent.slice(0, 80) : 'no custom css');
check('no Google Fonts request is added', !window.document.querySelector('link[href*="fonts.googleapis"]'),
  window.document.querySelector('link[href*="fonts.googleapis"]') ? 'one was added' : 'none');

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name} — ${r.detail}`);
}
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nall ${results.length} checks passed`);
