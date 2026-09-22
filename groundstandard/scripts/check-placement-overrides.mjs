/**
 * Two placements of one form, and what each one reports.
 *
 * The whole reason the site's forms can move onto a single record is that a
 * placement can still say which one it is. If that override ever stops working,
 * every lead in the CRM collapses into one name and nobody notices until they
 * try to read a month of them.
 *
 *   node scripts/check-placement-overrides.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const def = {
  slug: 'killer-b-contact',
  name: 'Killer B HQ — website contact',
  ghl_webhook_url: 'https://example.invalid/hook',
  report_enabled: false,
  redirect_enabled: true,
  redirect_default: '/thank-you/contact',
  redirect_rules: [],
  fields: [
    { name: 'first_name', label: 'First name', type: 'text', required: true, width: 'half' },
    { name: 'last_name', label: 'Last name', type: 'text', required: true, width: 'half' },
    { name: 'email', label: 'Email', type: 'email', required: true },
  ],
  submit_label: 'Send',
  success_message: 'Thanks.',
  error_message: 'Sorry.',
  theme: {},
  active: true,
};

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="a" data-gs-form="killer-b-contact"></div>
  <div id="b" data-gs-form="killer-b-contact"
       data-gs-source="website blog is jiu jitsu safe"
       data-gs-thanks="/thank-you/trial"></div>
</body></html>`, { url: 'https://killerbhq.com/blog/is-jiu-jitsu-safe',
  runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

window.fetch = (url, options) => {
  if (String(url).includes('/rest/v1/forms')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve([def]) });
  }
  posted.push({ url: String(url), body: JSON.parse(options.body) });
  return Promise.resolve({ ok: true });
};
const posted = [];
Object.defineProperty(window.document, 'currentScript', {
  value: { getAttribute: () => 'anon-key' }, configurable: true,
});

// jsdom will not navigate, and where the visitor is sent is half of what this
// is testing, so give the script a location it can write to and read it back.
const went = [];
const here = 'https://killerbhq.com/blog/is-jiu-jitsu-safe';
const location = { pathname: '/blog/is-jiu-jitsu-safe', hostname: 'killerbhq.com',
  host: 'killerbhq.com', search: '', origin: 'https://killerbhq.com' };
Object.defineProperty(location, 'href', { get: () => here, set: (v) => went.push(v) });

window.eval(`(function (location) {${readFileSync(new URL('../public/form.js', import.meta.url), 'utf8')}
})`)(location);
await new Promise((r) => setTimeout(r, 300));

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

const send = async (mountId, values) => {
  posted.length = 0;
  const form = window.document.querySelector(`#${mountId} form`);
  if (!form) return null;
  for (const [k, v] of Object.entries(values)) { form.elements[k].value = v; }
  went.length = 0;
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 60));
  return posted[0] ? posted[0].body : null;
};

const plain = await send('a', { first_name: 'Juan', last_name: 'Cruz', email: 'j@example.com' });
check('a plain placement keeps the record name',
  plain && plain.form_name === 'Killer B HQ — website contact', plain && plain.form_name);
const plainWent = went.slice();

const moved = window.document.querySelector('#b form');
check('both placements draw', !!moved, moved ? 'yes' : 'the second did not render');

const named = await send('b', { first_name: 'Maria', last_name: 'Santos', email: 'm@example.com' });
const namedWent = went.slice();
check('an overridden placement reports its own name',
  named && named.form_name === 'website blog is jiu jitsu safe', named && named.form_name);
check('and its source matches', named && named.source === 'website blog is jiu jitsu safe',
  named && named.source);

// The two must not bleed into each other — one definition object, two readings.
const again = await send('a', { first_name: 'Juan', last_name: 'Cruz', email: 'j@example.com' });
check('the override does not leak onto the plain one',
  again && again.form_name === 'Killer B HQ — website contact', again && again.form_name);

check('the plain placement uses the page on the record',
  plainWent[0] === '/thank-you/contact', plainWent[0] || 'went nowhere');
check('the overridden placement uses its own page',
  namedWent[0] === '/thank-you/trial', namedWent[0] || 'went nowhere');

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name} — ${r.detail}`);
}
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nall ${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
