/**
 * A host that renders the page after us must not be able to erase the form.
 *
 * This is not hypothetical. Every form on the Killer B site went blank after
 * the swap: Webstudio hydrates its pages with React, React reconciles our mount
 * against what it rendered — an empty div — and removes the form. On screen it
 * appeared for an instant on reload and then the space was empty, which reads
 * as a broken script rather than a host behaviour.
 *
 * The earlier check missed it because it ran the embed without the page's own
 * scripts, so hydration never happened. This one does the erasing on purpose.
 *
 *   node scripts/check-host-rerender.mjs
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
  redirect_enabled: false,
  redirect_rules: [],
  fields: [
    { name: 'first_name', label: 'First name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
  ],
  submit_label: 'Send',
  success_message: 'Thanks.',
  error_message: 'Sorry.',
  theme: {},
  active: true,
};

const dom = new JSDOM('<!doctype html><html><body><div data-gs-form="killer-b-contact"></div></body></html>',
  { url: 'https://killerbhq.com/contact', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([def]) });
Object.defineProperty(window.document, 'currentScript', {
  value: { getAttribute: () => 'anon-key' }, configurable: true,
});

window.eval(readFileSync(new URL('../public/form.js', import.meta.url), 'utf8'));
await new Promise((r) => setTimeout(r, 300));

let mount = window.document.querySelector('[data-gs-form]');
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

check('the form draws to begin with', !!mount.querySelector('form'),
  mount.querySelector('form') ? 'drawn' : 'nothing drawn');

// What hydration does: the host owns this node and empties it.
mount.innerHTML = '';
await new Promise((r) => setTimeout(r, 120));
check('it comes back after the host empties the mount', !!mount.querySelector('form'),
  mount.querySelector('form') ? 'redrawn' : 'still empty');

// And the version that comes back is the current one, not the skeleton or a
// remembered copy from an earlier visit.
const labels = [...mount.querySelectorAll('input')].map((i) => i.name).join(',');
check('and it is the current definition', labels === 'first_name,email,gs_company' || labels.startsWith('first_name,email'),
  labels);

// Twice, because a host can re-render more than once.
mount.innerHTML = '';
await new Promise((r) => setTimeout(r, 120));
mount.innerHTML = '';
await new Promise((r) => setTimeout(r, 120));
check('it survives being emptied repeatedly', !!mount.querySelector('form'),
  mount.querySelector('form') ? 'still there' : 'gone');

// The harder case, and the one that actually happened: the host replaces the
// mount element itself. Whatever we were watching is now an orphan, and the
// element on the page has never been drawn into.
const fresh = window.document.createElement('div');
fresh.setAttribute('data-gs-form', 'killer-b-contact');
mount.parentNode.replaceChild(fresh, mount);
await new Promise((r) => setTimeout(r, 400));
check('it comes back when the host replaces the mount element',
  !!fresh.querySelector('form'),
  fresh.querySelector('form') ? 'redrawn into the new element' : 'the new element stayed empty');

mount = fresh;

// A host that re-renders around the form rather than emptying it must not
// trigger a redraw either — that would throw away what someone had typed.
mount.querySelector('input[name="first_name"]').value = 'Juan Carlos';
mount.appendChild(window.document.createElement('span'));
await new Promise((r) => setTimeout(r, 120));
check('typing survives an unrelated change to the mount',
  mount.querySelector('input[name="first_name"]').value === 'Juan Carlos',
  mount.querySelector('input[name="first_name"]').value || 'lost');

// A client-side route change: the host tears the page down and builds the next
// one. For a moment there is no mount at all, then a brand new one appears --
// which is what happens on this site when you leave a page and come back
// without reloading.
const holder = mount.parentNode;
holder.removeChild(mount);
await new Promise((r) => setTimeout(r, 120));
const arrived = window.document.createElement('div');
arrived.setAttribute('data-gs-form', 'killer-b-contact');
arrived.setAttribute('data-gs-source', 'website blog is jiu jitsu safe');
holder.appendChild(arrived);
await new Promise((r) => setTimeout(r, 400));
check('a form drawn after a client-side navigation', !!arrived.querySelector('form'),
  arrived.querySelector('form') ? 'drawn' : 'the new page had no form until a reload');

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name} — ${r.detail}`);
}
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nall ${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
