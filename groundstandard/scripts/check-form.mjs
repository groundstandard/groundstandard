// check-form.mjs — runs public/form.js in a real DOM and watches what it sends.
//
// This script ends up on client websites, so "it looked right" is not a standard
// it can be held to. Everything below is checked against what actually reaches
// the network: the fields rendered, the validation, the GoHighLevel payload, and
// — the one that matters most — that a dead reporting endpoint cannot stop the
// CRM call. That separation is why every gym still got its leads through the
// eight-week outage in July, and it is the property most easily lost in a
// refactor.
//
// Run:  node scripts/check-form.mjs

import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const SOURCE = fs.readFileSync(new URL('../public/form.js', import.meta.url), 'utf8');

const DEF = {
  slug: 'ronin-trial',
  name: 'Ronin BJJ free trial',
  ghl_webhook_url: 'https://services.leadconnectorhq.com/hooks/TEST/webhook-trigger/TEST',
  report_enabled: true,
  redirect_enabled: true,
  redirect_adult: 'https://example.com/adult',
  redirect_youth: 'https://example.com/youth',
  submit_label: 'Book my trial',
  success_message: 'Thanks — we will call you.',
  error_message: 'That did not go through.',
  privacy_url: 'https://example.com/privacy',
  terms_url: null,
  fields: [
    { name: 'first_name', label: 'First name', type: 'text', required: true },
    { name: 'last_name', label: 'Last name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone', type: 'phone', required: false },
    { name: 'program', label: 'Which program?', type: 'select', required: true, options: ['Adult', 'Youth'] },
    { name: 'consent', label: 'I agree to be contacted.', type: 'checkbox', required: true },
  ],
};

const failures = [];
const ok = (name, extra) => console.log(`  ok   ${name}${extra ? ' — ' + extra : ''}`);
const bad = (name, why) => { failures.push(name); console.log(`  FAIL ${name} — ${why}`); };
const is = (name, got, want) => (got === want ? ok(name, String(got)) : bad(name, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`));

// One page, one form, and a fetch we can watch.
const PAGE = 'https://roninbjj.com/trial?utm_source=fb';

async function mount({ reportFails = false, webhookFails = false, definition = DEF, page = PAGE, seed = null, store = null, holdDefinition = false, definitionDelay = 0 } = {}) {
  // jsdom cannot parse CSS nesting, which the custom-css block uses; browsers
  // can. Everything else it has to say still comes through.
  const quiet = new VirtualConsole();
  quiet.forwardTo(console, { jsdomErrors: 'none' });
  quiet.on('jsdomError', (e) => { if (!/parse CSS/.test(e.message)) console.error(e); });
  const dom = new JSDOM(
    `<!doctype html><html><body><div data-gs-form="${definition.slug}"></div></body></html>`,
    { url: page, runScripts: 'outside-only', virtualConsole: quiet },
  );
  const { window } = dom;
  const calls = [];

  // jsdom will not leave the page, and window.location cannot be replaced, so
  // the script is given its own Location that records where it tried to go.
  const nav = { to: null };
  window.dataLayer = [];
  var here = page;
  const loc = {
    get href() { return here; },
    set href(v) { nav.to = v; here = v; },
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    search: window.location.search,
    assign: function (v) { this.href = v; },
    replace: function (v) { this.href = v; },
  };

  window.fetch = (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, body });
    if (url.includes('/rest/v1/forms')) {
      // A network that never answers, to see what the visitor looks at meanwhile.
      if (holdDefinition) return new Promise(() => {});
      const answer = { ok: true, json: () => Promise.resolve([definition]) };
      if (definitionDelay) return new Promise(r => setTimeout(() => r(answer), definitionDelay));
      return Promise.resolve(answer);
    }
    if (url.includes('railway.app')) {
      return reportFails ? Promise.reject(new Error('reporting is down')) : Promise.resolve({ ok: true });
    }
    return webhookFails ? Promise.reject(new Error('CRM refused')) : Promise.resolve({ ok: true });
  };

  // The script reads its key off its own tag.
  const script = window.document.createElement('script');
  script.setAttribute('data-key', 'anon-key-for-test');
  window.document.body.appendChild(script);
  Object.defineProperty(window.document, 'currentScript', { value: script, configurable: true });

  // What an earlier page in the same visit left behind.
  if (seed) for (const [k, v] of Object.entries(seed)) window.sessionStorage.setItem(k, v);

  // localStorage survives between visits in a browser; jsdom gives each window a
  // fresh one, so a shared object stands in for the same person coming back.
  if (store) {
    window.localStorage.clear();
    for (const [k, v] of Object.entries(store)) window.localStorage.setItem(k, v);
  }

  // Shadow only `location`; everything else is the real window.
  window.eval(`(function (location) {${SOURCE}\n})`)(loc);
  await new Promise(r => setTimeout(r, 0));
  // Hand back whatever the visit stored, so the next one can start from it.
  const saved = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    saved[k] = window.localStorage.getItem(k);
  }
  return { window, doc: window.document, calls, nav, saved };
}

const fill = (form, values) => {
  for (const [name, value] of Object.entries(values)) {
    const el = form.elements[name];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = value;
    else el.value = value;
  }
};

const submit = async (form, window) => {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 0));
};

console.log('rendering:');
{
  const { doc, calls } = await mount();
  const form = doc.querySelector('form.gsf');
  form ? ok('the form renders') : bad('the form renders', 'no form element');
  is('fields rendered', doc.querySelectorAll('.gsf-row').length, DEF.fields.length);
  is('the button carries the wording set in the builder',
    doc.querySelector('.gsf-btn').textContent, 'Book my trial');
  is('the choice field has its options',
    doc.querySelectorAll('select[name=program] option').length, 3); // placeholder + 2
  is('required fields are marked required',
    doc.querySelectorAll('[required]').length, 4);
  doc.body.textContent.includes('privacy policy')
    ? ok('the privacy link is shown')
    : bad('the privacy link is shown', 'not in the page');
  calls.some(c => c.url.includes('/rest/v1/forms'))
    ? ok('the definition is read from the database, not the page')
    : bad('the definition is read from the database, not the page', 'no fetch');
}

console.log('\nvalidation:');
{
  const { window, doc, calls } = await mount();
  const form = doc.querySelector('form.gsf');
  const before = calls.length;
  fill(form, { first_name: 'Marco', email: 'marco@example.com', program: 'Adult', consent: true });
  await submit(form, window);   // last_name missing
  is('an incomplete form sends nothing', calls.length - before, 0);
  doc.querySelector('.gsf-msg').textContent.includes('Last name')
    ? ok('it names the field that is missing')
    : bad('it names the field that is missing', doc.querySelector('.gsf-msg').textContent);

  fill(form, { last_name: 'Alvarez', consent: false });
  await submit(form, window);
  is('an unticked required box also stops it', calls.length - before, 0);
}

console.log('\nwhat reaches GoHighLevel:');
{
  const { window, doc, calls, nav } = await mount();
  const form = doc.querySelector('form.gsf');
  fill(form, {
    first_name: 'Marco', last_name: 'Alvarez', email: 'marco@example.com',
    phone: '555 0100', program: 'Adult', consent: true,
  });
  await submit(form, window);

  const crm = calls.find(c => c.url.includes('leadconnectorhq'));
  crm ? ok('the CRM was called') : bad('the CRM was called', 'no call to the webhook');
  if (crm) {
    is('first name', crm.body.first_name, 'Marco');
    is('email', crm.body.email, 'marco@example.com');
    is('the tickbox goes as a boolean', crm.body.consent, true);
    is('which form it came from', crm.body._form, 'ronin-trial');
    is('which page it came from', crm.body._source_url, 'https://roninbjj.com/trial?utm_source=fb');
    is('which site', crm.body._source_hostname, 'roninbjj.com');
  }

  const report = calls.find(c => c.url.includes('railway.app'));
  report ? ok('a copy came to us as well') : bad('a copy came to us as well', 'no reporting call');

  is('it sent them to the adult page', nav.to, 'https://example.com/adult');
}

console.log('\nthe separation that saved the gyms in July:');
{
  const { window, doc, calls, nav } = await mount({ reportFails: true });
  const form = doc.querySelector('form.gsf');
  fill(form, {
    first_name: 'Dani', last_name: 'Boyd', email: 'dani@example.com',
    program: 'Youth', consent: true,
  });
  await submit(form, window);

  calls.some(c => c.url.includes('leadconnectorhq'))
    ? ok('reporting is dead, the CRM still receives the lead')
    : bad('reporting is dead, the CRM still receives the lead', 'the CRM call was skipped');
  is('and youth goes to the youth page', nav.to, 'https://example.com/youth');
}

console.log('\nwhen the CRM itself fails:');
{
  const { window, doc, nav } = await mount({ webhookFails: true });
  const form = doc.querySelector('form.gsf');
  fill(form, {
    first_name: 'Owen', last_name: 'Hart', email: 'owen@example.com',
    program: 'Adult', consent: true,
  });
  await submit(form, window);

  const msg = doc.querySelector('.gsf-msg');
  msg.className.includes('bad') && msg.textContent === DEF.error_message
    ? ok('the visitor is told, in the words the builder set')
    : bad('the visitor is told', `"${msg.textContent}" (${msg.className})`);
  doc.querySelector('.gsf-btn').disabled === false
    ? ok('and can try again')
    : bad('and can try again', 'the button stayed disabled');
  nav.to
    ? bad('a failed submission does not redirect', 'it went to ' + nav.to)
    : ok('a failed submission does not redirect');
}

console.log('\na form with no webhook set yet:');
{
  const { window, doc } = await mount({
    definition: { ...DEF, ghl_webhook_url: null, redirect_enabled: false },
  });
  const form = doc.querySelector('form.gsf');
  fill(form, {
    first_name: 'Tess', last_name: 'Dunne', email: 'tess@example.com',
    program: 'Adult', consent: true,
  });
  await submit(form, window);
  const msg = doc.querySelector('.gsf-msg');
  msg.className.includes('ok')
    ? ok('the visitor still gets a thank you rather than an error')
    : bad('the visitor still gets a thank you', msg.textContent);
}

console.log('\ncampaign tracking:');
{
  const { window, doc, calls } = await mount();
  const form = doc.querySelector('form.gsf');
  fill(form, {
    first_name: 'Ada', last_name: 'Cruz', email: 'ada@example.com',
    program: 'Adult', consent: true,
  });
  await submit(form, window);

  const crm = calls.find(c => c.url.includes('leadconnectorhq'));
  is('the campaign comes through as its own field', crm.body.utm_source, 'fb');

  const lead = window.dataLayer.find(e => e.event === 'generate_lead');
  lead ? ok('generate_lead is pushed for GTM') : bad('generate_lead is pushed for GTM', 'nothing pushed');
  if (lead) {
    is('  it names the form', lead.form_name, 'Ronin BJJ free trial');
    is('  it carries the programme', lead.program, 'Adult');
    is('  it carries the campaign', lead.utm_source, 'fb');
    is('  and the page', lead.page_path, '/trial');
    'interest' in lead
      ? bad('  empty values are left out', 'interest was pushed empty')
      : ok('  empty values are left out');
  }
}

console.log('\nattribution survives the walk to the form page:');
{
  // The campaign lands on one page; the form sits on another that has no utm on it.
  const landing = await mount();
  const kept = landing.window.sessionStorage.getItem('gs_attr');
  kept ? ok('the landing page kept the campaign', kept) : bad('the landing page kept the campaign', 'nothing stored');

  const { window, doc, calls } = await mount({
    page: 'https://roninbjj.com/contact',
    seed: kept ? { gs_attr: kept } : null,
  });
  const form = doc.querySelector('form.gsf');
  fill(form, { first_name: 'Ben', last_name: 'Tan', email: 'ben@example.com', program: 'Youth', consent: true });
  await submit(form, window);

  const crm = calls.find(c => c.url.includes('leadconnectorhq'));
  is('the campaign is still on the lead', crm.body.utm_source, 'fb');
  is('and the page it came from is the form page', crm.body._source_url, 'https://roninbjj.com/contact');
}

console.log('\nwhen the CRM fails, GTM hears about it:');
{
  const { window, doc } = await mount({ webhookFails: true });
  const form = doc.querySelector('form.gsf');
  fill(form, { first_name: 'Cy', last_name: 'Ray', email: 'cy@example.com', program: 'Adult', consent: true });
  await submit(form, window);
  const err = window.dataLayer.find(e => e.event === 'form_error');
  err ? ok('form_error is pushed', err.form_name) : bad('form_error is pushed', 'nothing pushed');
  window.dataLayer.some(e => e.event === 'generate_lead')
    ? bad('a failed submission is not counted as a lead', 'generate_lead was pushed anyway')
    : ok('a failed submission is not counted as a lead');
}

console.log('\nhidden fields:');
{
  // Which gym the lead came from, a routing tag, a campaign name — things the
  // visitor should never be asked and never be able to change.
  const withHidden = {
    ...DEF,
    fields: [
      ...DEF.fields,
      { name: 'location', label: 'Which gym', type: 'hidden', required: false, value: 'Eatontown' },
      { name: 'lead_source', label: 'Where it came from', type: 'hidden', required: true, value: '' },
    ],
  };

  const { window, doc, calls } = await mount({ definition: withHidden });
  const form = doc.querySelector('form.gsf');

  is('hidden fields add no visible rows', doc.querySelectorAll('.gsf-row').length, DEF.fields.length);
  doc.body.textContent.includes('Which gym')
    ? bad('nothing about them is shown to the visitor', 'the label is on the page')
    : ok('nothing about them is shown to the visitor');

  fill(form, {
    first_name: 'Rae', last_name: 'Ford', email: 'rae@example.com',
    program: 'Adult', consent: true,
  });
  await submit(form, window);

  const crm = calls.find(c => c.url.includes('leadconnectorhq'));
  crm ? ok('the lead still goes') : bad('the lead still goes', 'an empty required hidden field blocked it');
  if (crm) {
    is('the fixed value rides along', crm.body.location, 'Eatontown');
    is('an empty one is sent empty rather than blocking', crm.body.lead_source, '');
  }
}

console.log('\nspam and the names a CRM workflow already reads:');
{
  const { window, doc, calls } = await mount();
  const form = doc.querySelector('form.gsf');

  // A bot fills every input it can find, including the one no person can see.
  const trap = form.elements['gs_company'];
  trap ? ok('there is a trap field') : bad('there is a trap field', 'none rendered');
  is('  it is out of the tab order', trap.getAttribute('tabindex'), '-1');
  is('  and hidden from screen readers', trap.getAttribute('aria-hidden'), 'true');

  const before = calls.length;
  fill(form, {
    first_name: 'Bot', last_name: 'Net', email: 'bot@example.com',
    program: 'Adult', consent: true,
  });
  trap.value = 'Acme Marketing';
  await submit(form, window);
  is('a filled trap sends nothing', calls.length - before, 0);
  doc.querySelector('.gsf-msg').className.includes('ok')
    ? ok('  and the bot is told it worked, so it does not retry')
    : bad('  and the bot is told it worked', doc.querySelector('.gsf-msg').className);

  trap.value = '';
  await submit(form, window);
  const crm = calls.find(c => c.url.includes('leadconnectorhq'));
  crm ? ok('a real person still gets through') : bad('a real person still gets through', 'nothing sent');
  if (crm) {
    is('  name arrives whole, the way the old form sent it', crm.body.name, 'Bot Net');
    is('  form_name without the underscore', crm.body.form_name, 'Ronin BJJ free trial');
    is('  page_url without the underscore', crm.body.page_url, 'https://roninbjj.com/trial?utm_source=fb');
    is('  source, which their workflow reads', crm.body.source, 'Ronin BJJ free trial');
    is('  and our own keys are still there', crm.body._form, 'ronin-trial');
    'gs_company' in crm.body
      ? bad('  the trap is not sent to the CRM', 'it was included')
      : ok('  the trap is not sent to the CRM');
  }
}

console.log('\nwhat a choice sends versus what it says:');
{
  const def = {
    ...DEF,
    fields: DEF.fields.map(f => f.name === 'program' ? {
      ...f,
      label: 'What are you interested in?',
      options: ['Membership & Pricing = pricing', 'Jiu-Jitsu / BJJ = jiu-jitsu', 'Kickboxing'],
    } : f),
  };

  const { window, doc, calls } = await mount({ definition: def });
  const select = doc.querySelector('select[name=program]');
  const options = [...select.options].slice(1);

  is('the visitor reads the label', options[0].textContent, 'Membership & Pricing');
  is('the CRM receives the value', options[0].value, 'pricing');
  is('a plain option is unchanged', options[2].textContent, 'Kickboxing');
  is('  and sends itself', options[2].value, 'Kickboxing');

  const form = doc.querySelector('form.gsf');
  fill(form, { first_name: 'Ivo', last_name: 'Ruiz', email: 'ivo@example.com', program: 'jiu-jitsu', consent: true });
  await submit(form, window);
  const crm = calls.find(c => c.url.includes('leadconnectorhq'));
  is('the value is what reaches GoHighLevel', crm.body.program, 'jiu-jitsu');
}

console.log('\nhow fast the form appears:');
{
  // A first visit, with the definition request left hanging: the visitor should
  // not be looking at an empty gap while the network thinks about it.
  const first = await mount({ holdDefinition: true, store: {} });
  const bones = first.doc.querySelectorAll('.gsf-bone').length;
  bones > 0
    ? ok('a first visit shows a skeleton immediately', bones + ' placeholders')
    : bad('a first visit shows a skeleton immediately', 'the mount was left empty');
  first.doc.querySelector('#gsf-preconnect')
    ? ok('and the connection to the database is warmed up early')
    : bad('and the connection to the database is warmed up early', 'no preconnect');

  // The same person comes back. The definition is remembered, so the real form
  // is on screen before the network answers anything.
  const once = await mount();
  const returning = await mount({ store: once.saved, holdDefinition: true });
  const form = returning.doc.querySelector('form.gsf');
  form ? ok('a repeat visit renders before the network answers') : bad('a repeat visit renders before the network answers', 'nothing rendered');
  if (form) is('  with the fields it saw last time', returning.doc.querySelectorAll('.gsf-row').length, DEF.fields.length);
}

console.log('\nwhen Bobby changes the form:');
{
  const once = await mount();
  const changed = { ...DEF, submit_label: 'Claim my free week' };
  const back = await mount({ store: once.saved, definition: changed });
  is('the new wording replaces the remembered one',
    back.doc.querySelector('.gsf-btn').textContent, 'Claim my free week');

  // The same change arriving while somebody is already filling the form in.
  const busy = await mount({ store: once.saved, definition: changed, definitionDelay: 40 });
  const form = busy.doc.querySelector('form.gsf');
  is('  the remembered version is what they started on', form.elements.first_name.value, '');
  form.elements.first_name.value = 'half typed';
  form.elements.email.value = 'mid@enquiry.com';

  await new Promise(r => setTimeout(r, 120));   // the new definition lands here

  const after = busy.doc.querySelector('form.gsf');
  is('their typing survives', after.elements.first_name.value, 'half typed');
  is('  all of it', after.elements.email.value, 'mid@enquiry.com');
  is('  and the form was left alone rather than redrawn',
    busy.doc.querySelector('.gsf-btn').textContent, DEF.submit_label);

  // Untouched, the same arrival does redraw.
  const idle = await mount({ store: once.saved, definition: changed, definitionDelay: 40 });
  await new Promise(r => setTimeout(r, 120));
  is('an untouched form takes the change', idle.doc.querySelector('.gsf-btn').textContent, 'Claim my free week');
}

console.log('\nwho filled it in, for the conversion tags:');
{
  const { window, doc, calls } = await mount();
  const form = doc.querySelector('form.gsf');
  fill(form, {
    first_name: 'Nina', last_name: 'Okafor', email: '  NINA@Example.COM ',
    phone: '(732) 313-3703', program: 'Adult', consent: true,
  });
  await submit(form, window);

  const lead = window.dataLayer.find(e => e.event === 'generate_lead');
  lead && lead.user_data ? ok('user_data rides with generate_lead') : bad('user_data rides with generate_lead', 'missing');
  if (lead && lead.user_data) {
    is('  the email is tidied up', lead.user_data.email_address, 'nina@example.com');
    is('  the phone is digits only', lead.user_data.phone_number, '7323133703');
    is('  first name', lead.user_data.first_name, 'Nina');
    is('  last name', lead.user_data.last_name, 'Okafor');
  }
  'email' in (lead || {})
    ? bad('  the email is not loose among the event parameters', 'it is')
    : ok('  the email is not loose among the event parameters');

  // The thank-you page is a fresh load with no form on it.
  const kept = window.sessionStorage.getItem('gs_lead_user');
  kept ? ok('the person is kept for the thank-you page') : bad('the person is kept for the thank-you page', 'nothing stored');

  const after = await mount({ page: 'https://roninbjj.com/thank-you', seed: { gs_lead_user: kept } });
  const restored = after.window.dataLayer.find(e => e.user_data && !e.event);
  restored ? ok('and pushed again there, before lead_thank_you fires') : bad('and pushed again there', 'not on the dataLayer');
  if (restored) is('  same email', restored.user_data.email_address, 'nina@example.com');
}

console.log('\nhow it looks — nothing set:');
{
  const { doc } = await mount();
  const form = doc.querySelector('form.gsf');
  is('the root carries no variables', form.getAttribute('style'), null);
  is('and no modifier classes', form.className, 'gsf');
  is('one stylesheet on the page', doc.querySelectorAll('#gsf-css').length, 1);
  is('nothing is loaded from Google', doc.querySelectorAll('link[id^="gsf-font"]').length, 0);
  is('no custom css block', doc.querySelectorAll('style[id^="gsf-css-"]').length, 0);
  const css = doc.getElementById('gsf-css').textContent;
  ['var(--gsf-in-bc,rgba(128,128,128,.35))', 'var(--gsf-r,8px)', 'var(--gsf-btn-bg,var(--gsf-accent,currentColor))', 'var(--gsf-btn-c,#fff)', 'var(--gsf-gap,14px)']
    .every(literal => css.includes(literal))
    ? ok("today's look is every variable's fallback")
    : bad("today's look is every variable's fallback", 'a fallback changed');
  is('the label is still above the box', form.querySelector('.gsf-row').firstChild.className, 'gsf-label');
  is('the button is a submit button', form.querySelector('.gsf-btn').type, 'submit');
}

console.log('\nhow it looks — the Design panel set something:');
{
  const themed = { ...DEF, theme: {
    accent: '#c00000', radius: 12, input_style: 'filled', button_hover: 'lift', button_case: 'upper',
    button_width: 'auto', button_align: 'right', card: true, transitions: true, input_height: 52,
  } };
  const { doc } = await mount({ definition: themed });
  const form = doc.querySelector('form.gsf');
  const style = form.getAttribute('style') || '';
  style.includes('--gsf-accent:#c00000') ? ok('the accent reaches the root', '--gsf-accent:#c00000') : bad('the accent reaches the root', style);
  style.includes('--gsf-r:12px') ? ok('  sizes arrive in px') : bad('  sizes arrive in px', style);
  style.includes('--gsf-in-py:15px') ? ok('  a height becomes padding', '52px → 15px each side') : bad('  a height becomes padding', style);
  style.includes('--gsf-btn-tt:uppercase') ? ok('  capitals on the button') : bad('  capitals on the button', style);
  style.includes('--gsf-btn-m:0 0 0 auto') ? ok('  an auto-width button sits on the right') : bad('  an auto-width button sits on the right', style);
  style.includes('--gsf-tr:') ? ok('  transitions are on') : bad('  transitions are on', style);
  ['gsf-in-filled', 'gsf-hv-lift', 'gsf-card'].every(c => form.classList.contains(c))
    ? ok('choices with no variable become classes on the root', form.className)
    : bad('choices with no variable become classes on the root', form.className);
  is('the form is still the same form', form.getAttribute('data-gsf'), 'ronin-trial');
  is('  and its button still submits', form.querySelector('.gsf-btn').type, 'submit');
}

console.log('\nhow it looks — labels, columns, the message box:');
{
  const def = { ...DEF, fields: [
    { ...DEF.fields[0], width: 'half' }, { ...DEF.fields[1], width: 'half' },
    DEF.fields[2], { name: 'notes', label: 'Anything you want us to know?', type: 'textarea', required: false },
    { ...DEF.fields[5], width: 'half' },
  ], theme: { label_position: 'placeholder', textarea_size: 'tall' } };
  const { doc } = await mount({ definition: def });
  const form = doc.querySelector('form.gsf');
  form.classList.contains('gsf-cols') ? ok('two half fields make the form a grid') : bad('two half fields make the form a grid', form.className);
  is('  and exactly those two are half', form.querySelectorAll('.gsf-half').length, 2);
  is('  a tickbox is never half', form.querySelector('.gsf-check').closest('.gsf-row').className, 'gsf-row');
  form.classList.contains('gsf-lbl-hide') ? ok('labels move into the boxes') : bad('labels move into the boxes', form.className);
  is('  the label words become the placeholder', form.elements.first_name.placeholder, 'First name');
  is('  an optional one says so', form.elements.notes.placeholder, 'Anything you want us to know? (optional)');
  is('  and the label is still there for screen readers', form.querySelectorAll('.gsf-label').length, 4);
  is('the message box is tall', form.elements.notes.rows, 7);

  const plain = await mount({ definition: { ...def, theme: {} } });
  is('  and four rows when nothing is set', plain.doc.querySelector('form.gsf').elements.notes.rows, 4);

  const floating = await mount({ definition: { ...def, theme: { label_position: 'floating' } } });
  const row = floating.doc.querySelector('form.gsf .gsf-row');
  is('floating labels come after their input', row.lastChild.className, 'gsf-label');
  is('  the input keeps a blank placeholder so the label can float', row.firstChild.placeholder, ' ');
}

console.log('\nhow it looks — a Google Font:');
{
  const { window, doc } = await mount({ definition: { ...DEF, theme: { font_family: 'Barlow Condensed', font_google: true } } });
  is('one stylesheet link, once', doc.querySelectorAll('#gsf-font-barlow-condensed').length, 1);
  const href = doc.getElementById('gsf-font-barlow-condensed').getAttribute('href');
  href.includes('family=Barlow+Condensed') && href.includes('display=swap')
    ? ok('  pointing at the family', href) : bad('  pointing at the family', href);
  is('  plus one preconnect to Google', doc.querySelectorAll('#gsf-font-pre').length, 1);
  (doc.querySelector('form.gsf').getAttribute('style') || '').includes('--gsf-font:"Barlow Condensed",sans-serif')
    ? ok('  and the form uses it') : bad('  and the form uses it', doc.querySelector('form.gsf').getAttribute('style'));
  window.GSF.render(doc.querySelector('[data-gs-form]'), { ...DEF, theme: { font_family: 'Barlow Condensed', font_google: true } });
  is('rendering again adds nothing', doc.querySelectorAll('link[rel="stylesheet"][id^="gsf-font-"]').length, 1);

  const named = await mount({ definition: { ...DEF, theme: { font_family: 'Montserrat' } } });
  is("a font the site already has is named but not fetched", named.doc.querySelectorAll('link[id^="gsf-font"]').length, 0);
}

console.log('\nhow it looks — custom css:');
{
  const { window, doc } = await mount({ definition: { ...DEF, theme: { css: '.gsf-btn{letter-spacing:1px}' } } });
  const block = doc.getElementById('gsf-css-ronin-trial');
  block ? ok('a block of its own, named after the form') : bad('a block of its own, named after the form', 'missing');
  is("  wrapped in the form's own selector", block.textContent, '.gsf[data-gsf="ronin-trial"]{.gsf-btn{letter-spacing:1px}}');
  window.GSF.render(doc.querySelector('[data-gs-form]'), { ...DEF, theme: { css: '.gsf-btn{letter-spacing:2px}' } });
  is('  a change updates it in place', doc.querySelectorAll('#gsf-css-ronin-trial').length, 1);
  doc.getElementById('gsf-css-ronin-trial').textContent.includes('2px') ? ok('  with the new text') : bad('  with the new text', doc.getElementById('gsf-css-ronin-trial').textContent);
  window.GSF.render(doc.querySelector('[data-gs-form]'), { ...DEF, theme: {} });
  is('  and clearing it removes the block', doc.querySelectorAll('#gsf-css-ronin-trial').length, 0);
  is('the shared sheet is still one', doc.querySelectorAll('#gsf-css').length, 1);
}

console.log('\nhow it looks — a design change reaches a returning visitor:');
{
  const once = await mount();
  const restyled = { ...DEF, theme: { accent: '#c00000' } };
  const back = await mount({ store: once.saved, definition: restyled, definitionDelay: 40 });
  is('the remembered form comes up plain first', back.doc.querySelector('form.gsf').getAttribute('style'), null);
  await new Promise(r => setTimeout(r, 120));
  (back.doc.querySelector('form.gsf').getAttribute('style') || '').includes('--gsf-accent:#c00000')
    ? ok('then takes the new look when the definition lands')
    : bad('then takes the new look when the definition lands', back.doc.querySelector('form.gsf').getAttribute('style'));

  // A definition remembered from before the Design panel existed has no theme
  // key at all, and the network is down: it has to render regardless.
  const legacy = await mount({ store: once.saved, holdDefinition: true });
  const remembered = JSON.parse(once.saved[Object.keys(once.saved).find(k => k.startsWith('gsf_def_'))]);
  'theme' in remembered
    ? bad('the remembered copy predates designs', 'it has a theme key')
    : ok('the remembered copy predates designs');
  legacy.doc.querySelector('form.gsf') ? ok('  and still renders') : bad('  and still renders', 'no form');
}

console.log("\nthe builder's preview is the same form, and cannot send:");
{
  const { window, doc, calls } = await mount();
  window.GSF ? ok('form.js hands its render out') : bad('form.js hands its render out', 'no window.GSF');
  const box = doc.createElement('div');
  doc.body.appendChild(box);
  window.GSF.render(box, DEF, { preview: true });
  const form = box.querySelector('form.gsf');
  is('the same markup', form.querySelectorAll('.gsf-row').length, DEF.fields.length);
  is('but the button is not a submit button', form.querySelector('.gsf-btn').type, 'button');
  const before = calls.length;
  fill(form, { first_name: 'Pre', last_name: 'View', email: 'pre@example.com', program: 'Adult', consent: true });
  await submit(form, window);
  is('and submitting sends nothing', calls.length - before, 0);
}

console.log(failures.length
  ? `\n${failures.length} failed: ${failures.join(', ')}`
  : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
