/**
 * Which CRM a lead lands in, decided by what the person answered.
 *
 * Bobby, September 24: "if the person selects Fitness as their option...then
 * they need to go to a different webhook." Killer B's martial arts enquiries
 * belong to Killer B; BLAB's fitness enquiries belong to BLAB. One form on the
 * site, two businesses behind it.
 *
 * The failure this guards against is silent and expensive: a lead posted to the
 * wrong CRM is not an error anybody sees — it is a BLAB enquiry sitting in the
 * martial arts pipeline until somebody reads a month of them and notices.
 *
 *   node scripts/check-webhook-rules.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const KILLER_B = 'https://services.leadconnectorhq.com/hooks/uIW84chF6pVm03ifxx1B/webhook-trigger/MhhmYrHWarlLWjJarYla';
const BLAB = 'https://services.leadconnectorhq.com/hooks/zSgHH1cqnwzVPLP2isO3/webhook-trigger/YxUITFtZgZkzTncyri8V';

const def = {
  slug: 'killer-b-contact',
  name: 'Killer B HQ — website contact',
  ghl_webhook_url: KILLER_B,
  webhook_rules: [{ field: 'interest', value: 'Fitness', url: BLAB }],
  report_enabled: true,
  redirect_enabled: false,
  redirect_rules: [],
  fields: [
    { name: 'first_name', label: 'First name', type: 'text', required: true, width: 'half' },
    { name: 'last_name', label: 'Last name', type: 'text', required: true, width: 'half' },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'interest', label: 'Martial Arts, Fitness or Both?', type: 'select', required: true,
      options: ['Martial Arts', 'Fitness', 'Both'] },
  ],
  submit_label: 'Send',
  success_message: 'Thanks.',
  error_message: 'Sorry.',
  theme: {},
  active: true,
};

const posted = [];
const dom = new JSDOM('<!doctype html><html><body><div id="a" data-gs-form="killer-b-contact"></div></body></html>',
  { url: 'https://killerbhq.com/kids', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

window.fetch = (url, options) => {
  if (String(url).includes('/rest/v1/forms')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve([def]) });
  }
  posted.push({ url: String(url), body: JSON.parse(options.body) });
  return Promise.resolve({ ok: true });
};
Object.defineProperty(window.document, 'currentScript', {
  value: { getAttribute: () => 'anon-key' }, configurable: true,
});

const location = { pathname: '/kids', hostname: 'killerbhq.com', host: 'killerbhq.com',
  search: '', origin: 'https://killerbhq.com' };
Object.defineProperty(location, 'href', { get: () => 'https://killerbhq.com/kids', set: () => {} });

window.eval(`(function (location) {${readFileSync(new URL('../public/form.js', import.meta.url), 'utf8')}
})`)(location);
await new Promise((r) => setTimeout(r, 300));

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

const send = async (interest) => {
  posted.length = 0;
  const form = window.document.querySelector('#a form');
  form.elements.first_name.value = 'Juan';
  form.elements.last_name.value = 'Cruz';
  form.elements.email.value = 'j@example.com';
  form.elements.interest.value = interest;
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 60));
  // Our own copy goes to the reporting endpoint; the CRM call is the other one.
  return posted.filter(p => p.url.includes('leadconnectorhq.com'));
};

const drew = !!window.document.querySelector('#a form');
check('the form draws', drew, drew ? 'yes' : 'no form rendered');

const fitness = await send('Fitness');
check('Fitness goes to the BLAB webhook',
  fitness.length === 1 && fitness[0].url === BLAB, fitness.map(p => p.url).join(' + ') || 'nothing posted');
check('and not also to Killer B — one lead, one CRM',
  !fitness.some(p => p.url === KILLER_B), fitness.length + ' posted');

const martial = await send('Martial Arts');
check('Martial Arts goes to Killer B',
  martial.length === 1 && martial[0].url === KILLER_B, martial.map(p => p.url).join(' + ') || 'nothing posted');

const both = await send('Both');
check('an answer no rule names falls back to Killer B',
  both.length === 1 && both[0].url === KILLER_B, both.map(p => p.url).join(' + ') || 'nothing posted');

check('the payload is the same either way — only the address changes',
  fitness[0] && martial[0]
    && JSON.stringify(Object.keys(fitness[0].body).sort()) === JSON.stringify(Object.keys(martial[0].body).sort()),
  fitness[0] ? Object.keys(fitness[0].body).length + ' keys' : '—');

check('the lead still says which page it came from',
  fitness[0] && fitness[0].body.source === 'website kids cta',
  fitness[0] && fitness[0].body.source);

// A form with no rules is every form we have live today. Emptied in place: the
// rendered form holds this same array, the way the live embed does.
def.webhook_rules.length = 0;
const plain = await send('Fitness');
check('a form with no rules posts to its own webhook, as before',
  plain.length === 1 && plain[0].url === KILLER_B, plain.map(p => p.url).join(' + ') || 'nothing posted');

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name} — ${r.detail}`);
}
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nall ${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
