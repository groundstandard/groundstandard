/* Ground Standard lead form — one line on a client's site.
 *
 *   <div data-gs-form="ronin-bjj-trial"></div>
 *   <script src="https://groundstandard.netlify.app/form.js" defer></script>
 *
 * The form's definition lives in our database, not in the page. That is the
 * whole design, and it comes straight from what broke in July: thirteen sites
 * were pinned to a copy of the old Duda widget and could not be moved without
 * republishing each one, so eight weeks of leads went to a dead endpoint. Here,
 * changing a field or a webhook takes effect everywhere on the next page load.
 *
 * On submit it posts to that client's GoHighLevel webhook — the thing Bobby
 * actually wants — and separately reports a copy to us. The two calls are
 * independent: the reporting copy can fail all week and the CRM still gets every
 * lead, which is exactly how the gyms kept receiving during the outage.
 */
(function () {
  'use strict';

  var API = 'https://qkwiauivaerrrbemdlyj.supabase.co';
  var ANON = document.currentScript && document.currentScript.getAttribute('data-key');
  // Our copy of every submission. n8n writes the body into form_submissions_v2,
  // which is what the Report tab in the builder reads.
  var REPORT = 'https://primary-production-aa130.up.railway.app/webhook/gsformbuilder/getinfodataoftheform';

  // One stylesheet for every form on the page. Each rule reads its value from a
  // CSS variable with today's look as the fallback, and the Design panel's
  // choices become those variables on one form's root — so a form with nothing
  // set is exactly the form we have always shipped, and two forms on one page
  // can look different while sharing this sheet. Anything with no "today"
  // equivalent (filled inputs, floating labels, a card, a hover) is a modifier
  // class on the root and is inert until the class is there.
  var CSS = [
    // Centred in whatever it is dropped into. A max width with no margin sits
    // against the left edge of a wide section, which is what the hard-coded
    // forms it replaced never did -- every one of them centred itself.
    // Left-aligned whatever the section around it does. Dropped into a centred
    // call-to-action block, the form inherited `text-align: center` and every
    // label and consent paragraph centred itself -- a form reads down its left
    // edge. The privacy line sets its own centring back where it wants it.
    '.gsf{max-width:var(--gsf-mw,520px);margin-left:auto;margin-right:auto;text-align:left;font-family:var(--gsf-font,inherit);font-size:var(--gsf-fs,inherit);color:var(--gsf-text,inherit)}',
    '.gsf *{box-sizing:border-box}',
    '.gsf-row{margin-bottom:var(--gsf-gap,14px)}',
    '.gsf-label{display:block;margin-bottom:6px;font-size:var(--gsf-lbl-fs,13px);font-weight:var(--gsf-lbl-fw,600);color:var(--gsf-lbl-c,inherit);opacity:.85}',
    '.gsf-req{opacity:.5;font-weight:400}',
    '.gsf-input,.gsf-select,.gsf-textarea{width:100%;padding:var(--gsf-in-py,11px) var(--gsf-in-px,13px);border:var(--gsf-bw,1px) solid var(--gsf-in-bc,rgba(128,128,128,.35));',
    'border-radius:var(--gsf-r,8px);font:inherit;background:var(--gsf-in-bg,transparent);color:var(--gsf-in-c,inherit);box-shadow:var(--gsf-in-sh,none);transition:var(--gsf-tr,none)}',
    '.gsf-input:focus,.gsf-select:focus,.gsf-textarea:focus{outline:var(--gsf-ring,2px solid var(--gsf-accent,currentColor));outline-offset:-1px;box-shadow:var(--gsf-ring-sh,var(--gsf-in-sh,none))}',
    // Consent wording is fine print and should read as it: the same size and
    // weight as the privacy line under the button, not the loudest text in a
    // form whose every other label is a muted placeholder. Muted, never faint
    // -- it is the permission being given, so it stays comfortably legible.
    '.gsf-check{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.5;opacity:.8}',
    '.gsf-check input{margin-top:3px;flex-shrink:0;accent-color:var(--gsf-accent,auto)}',
    // font-family and friends are longhands on purpose: `font:600 15px/1 inherit`
    // is not valid CSS (inherit cannot sit inside a shorthand) and browsers
    // dropped it, which left the button in the browser's own control font.
    '.gsf-btn{display:var(--gsf-btn-d,inline-block);width:var(--gsf-btn-w,100%);margin:var(--gsf-btn-m,0);padding:var(--gsf-btn-py,13px) var(--gsf-btn-px,13px);',
    'border:var(--gsf-btn-bw,0) solid var(--gsf-btn-bc,transparent);border-radius:var(--gsf-btn-r,var(--gsf-r,8px));font-family:inherit;font-size:var(--gsf-btn-fs,15px);font-weight:var(--gsf-btn-fw,600);line-height:1;',
    'letter-spacing:var(--gsf-btn-ls,normal);text-transform:var(--gsf-btn-tt,none);cursor:pointer;background:var(--gsf-btn-bg,var(--gsf-accent,currentColor));color:var(--gsf-btn-c,#fff);box-shadow:var(--gsf-btn-sh,none);transition:var(--gsf-tr,none)}',
    '.gsf-btn[disabled]{opacity:.55;cursor:default}',
    '.gsf-msg{margin-top:12px;padding:11px 13px;border-radius:var(--gsf-r,8px);font-size:14px;display:none}',
    '.gsf-msg.ok{display:block;background:var(--gsf-ok-bg,rgba(46,125,83,.12));border:1px solid var(--gsf-ok-bc,rgba(46,125,83,.4))}',
    '.gsf-msg.bad{display:block;background:var(--gsf-bad-bg,rgba(198,72,60,.12));border:1px solid var(--gsf-bad-bc,rgba(198,72,60,.4))}',
    '.gsf-fine{margin-top:10px;font-size:12px;opacity:.6}',
    '.gsf-fine a{color:var(--gsf-accent,inherit);font-weight:600;text-decoration:underline;text-underline-offset:2px}',
    '.gsf-fine-links{text-align:center;opacity:.85}',
    '.gsf-fine-links .gsf-sep{margin:0 10px;opacity:.5}',
    '.gsf-bone{background:var(--gsf-accent,currentColor);opacity:.08;border-radius:var(--gsf-r,8px);animation:gsf-pulse 1.4s ease-in-out infinite}',
    '.gsf-bone-label{width:90px;height:11px;margin-bottom:6px}',
    '.gsf-bone-field{width:100%;height:43px}',
    '.gsf-bone-btn{width:100%;height:45px}',
    '@keyframes gsf-pulse{0%,100%{opacity:.08}50%{opacity:.16}}',
    // ── modifiers: nothing below applies until the class is on the root ──
    '.gsf-card{background:var(--gsf-card-bg,transparent);border:var(--gsf-bw,1px) solid var(--gsf-card-bc,transparent);border-radius:var(--gsf-card-r,calc(var(--gsf-r,8px)*1.5));padding:var(--gsf-card-p,24px);box-shadow:var(--gsf-card-sh,none)}',
    '.gsf-cols{display:flex;flex-wrap:wrap;column-gap:12px}',
    '.gsf-cols .gsf-row,.gsf-cols .gsf-msg,.gsf-cols .gsf-fine{width:100%}',
    '.gsf-cols .gsf-half{width:calc(50% - 6px)}',
    '@media (max-width:480px){.gsf-cols .gsf-half{width:100%}}',
    '.gsf-in-filled .gsf-input,.gsf-in-filled .gsf-select,.gsf-in-filled .gsf-textarea{border-color:transparent;background:var(--gsf-in-bg,rgba(128,128,128,.12))}',
    '.gsf-in-underline .gsf-input,.gsf-in-underline .gsf-select,.gsf-in-underline .gsf-textarea{border-width:0 0 var(--gsf-bw,1px);border-radius:0;padding-left:0;padding-right:0;background:transparent}',
    '.gsf-in-underline .gsf-input:focus,.gsf-in-underline .gsf-select:focus,.gsf-in-underline .gsf-textarea:focus{outline:0;box-shadow:0 1px 0 0 var(--gsf-accent,currentColor)}',
    '.gsf-lbl-hide .gsf-label{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.gsf-lbl-float .gsf-row{position:relative}',
    '.gsf-lbl-float .gsf-input~.gsf-label,.gsf-lbl-float .gsf-textarea~.gsf-label,.gsf-lbl-float .gsf-select~.gsf-label{position:absolute;left:var(--gsf-in-px,13px);top:var(--gsf-in-py,11px);margin:0;line-height:1.5;pointer-events:none;transform-origin:left top;transition:transform .15s}',
    '.gsf-lbl-float .gsf-input:focus~.gsf-label,.gsf-lbl-float .gsf-input:not(:placeholder-shown)~.gsf-label,.gsf-lbl-float .gsf-textarea:focus~.gsf-label,.gsf-lbl-float .gsf-textarea:not(:placeholder-shown)~.gsf-label,.gsf-lbl-float .gsf-select~.gsf-label{transform:translateY(-55%) scale(.8)}',
    '.gsf-lbl-float .gsf-input,.gsf-lbl-float .gsf-select,.gsf-lbl-float .gsf-textarea{padding-top:calc(var(--gsf-in-py,11px) + 9px);padding-bottom:calc(var(--gsf-in-py,11px) - 5px)}',
    '.gsf-lbl-float ::placeholder{color:transparent}',
    '.gsf-ph ::placeholder{color:var(--gsf-ph);opacity:1}',
    '.gsf-ph .gsf-select:has(option[value=""]:checked){color:var(--gsf-ph)}',
    '.gsf-grad .gsf-btn{background:linear-gradient(135deg,var(--gsf-btn-bg,var(--gsf-accent,currentColor)),var(--gsf-btn-bg2))}',
    '.gsf-hv-color .gsf-btn:hover:not([disabled]){background:var(--gsf-btn-hbg)}',
    '.gsf-hv-darken .gsf-btn:hover:not([disabled]){filter:brightness(.9)}',
    '.gsf-hv-lift .gsf-btn:hover:not([disabled]){transform:translateY(-1px);box-shadow:0 6px 16px rgba(0,0,0,.18)}',
    // A field under 16px makes iPhones zoom the page when tapped. Only a set
    // size can cause that, so only a set size is guarded.
    '@media (max-width:480px){.gsf-fs .gsf-input,.gsf-fs .gsf-select,.gsf-fs .gsf-textarea{font-size:max(16px,var(--gsf-fs))}}',
  ].join('');

  // Where the visitor came from. Captured on whatever page they land on and kept
  // for the rest of the visit, because the form is rarely on that first page —
  // otherwise every enquiry arrives with no campaign attached and the ad spend
  // cannot be told apart from the organic traffic.
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
    'utm_content', 'gclid', 'fbclid', 'msclkid'];

  function attribution() {
    var found = {};
    var any = false;
    try {
      var q = new URLSearchParams(location.search);
      ATTR_KEYS.forEach(function (k) {
        var v = q.get(k);
        if (v) { found[k] = v; any = true; }
      });
    } catch (err) { /* no URLSearchParams: the lead still goes, without campaign */ }

    try {
      if (any) {
        sessionStorage.setItem('gs_attr', JSON.stringify(found));
        return found;
      }
      var kept = sessionStorage.getItem('gs_attr');
      if (kept) return JSON.parse(kept);
    } catch (err) { /* private mode: attribution simply does not carry */ }

    return found;
  }

  // Who filled the form in, for the tags that match a conversion back to a
  // person: Google's enhanced conversions and Meta's advanced matching both
  // want this. Motiur asked for it on 18 September.
  //
  // It goes in its own user_data object rather than among the event parameters,
  // because an email in a plain GA4 parameter breaks Google's own rules. GTM
  // hashes what it finds here before anything leaves the browser.
  // A field can be called "First Name" or first_name or FIRST-NAME in the
  // builder; to us it is the same field. Reads a value by that loose name.
  function canon(key) {
    return String(key == null ? '' : key).trim().toLowerCase().replace(/[\s-]+/g, '_');
  }
  function pick(data, key) {
    if (!data) return undefined;
    if (data[key] != null && data[key] !== '') return data[key];
    for (var k in data) if (canon(k) === key && data[k] != null && data[k] !== '') return data[k];
    return undefined;
  }

  function userData(data) {
    var out = {};
    var email = pick(data, 'email'), phone = pick(data, 'phone');
    var first = pick(data, 'first_name'), last = pick(data, 'last_name'), name = pick(data, 'name');
    if (email) out.email_address = String(email).trim().toLowerCase();
    if (phone) out.phone_number = String(phone).replace(/[^0-9+]/g, '');
    if (first) out.first_name = String(first).trim();
    if (last)  out.last_name = String(last).trim();
    if (!out.first_name && name) {
      var parts = String(name).trim().split(/\s+/);
      out.first_name = parts.shift() || '';
      if (parts.length) out.last_name = parts.join(' ');
    }
    return out;
  }

  // The thank-you page is a different page load, and by then the form is gone.
  // Leave the details behind so lead_thank_you can carry the same person.
  function rememberPerson(payload) {
    try {
      sessionStorage.setItem('gs_lead_user', JSON.stringify(payload));
    } catch (err) { /* private mode: the thank-you event goes without it */ }
  }

  // Pushed for the site's own GTM container to pick up. We only push; loading
  // GTM is the site's job, and on a site without it this is a harmless array.
  // Killer B's events are the shape here, so its GA4 keeps working unchanged.
  function track(event, fields) {
    try {
      var payload = { event: event };
      Object.keys(fields || {}).forEach(function (k) {
        var v = fields[k];
        if (v && typeof v === 'object') {
          // user_data is an object, not a value; an empty one is worth nothing.
          if (Object.keys(v).length) { payload[k] = v; }
        } else if (v) {
          payload[k] = v;
        }
      });
      payload.page_path = location.pathname;
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (err) { /* tracking never blocks a lead */ }
  }

  // The definition is remembered per form, so a repeat visit renders before the
  // network is asked anything. The fresh copy still arrives right behind it and
  // replaces the form if it changed — the whole point of this system is that
  // Bobby's edit shows up without anyone republishing a site.
  function remembered(slug) {
    try {
      var raw = localStorage.getItem('gsf_def_' + slug);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  function remember(slug, def) {
    try { localStorage.setItem('gsf_def_' + slug, JSON.stringify(def)); } catch (err) { /* full or blocked */ }
  }

  // Start the handshake with the database while the page is still busy, so the
  // definition request does not pay for DNS and TLS when it finally goes out.
  function warmUp() {
    try {
      if (document.getElementById('gsf-preconnect')) return;
      var link = document.createElement('link');
      link.id = 'gsf-preconnect';
      link.rel = 'preconnect';
      link.href = API;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    } catch (err) { /* nothing lost */ }
  }

  // An answer and a rule's value are the same thing regardless of case and
  // stray spaces — "Youth " typed into the builder still matches "youth".
  function same(a, b) {
    return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase();
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function styleOnce() {
    if (document.getElementById('gsf-css')) return;
    var s = el('style', { id: 'gsf-css' });
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // The Design panel's tokens, turned into the variables the sheet above reads.
  // Only what is set is written; everything else falls back to today's look.
  var PX = {
    font_size: 'fs', label_size: 'lbl-fs', button_size: 'btn-fs', radius: 'r', button_radius: 'btn-r',
    border_width: 'bw', gap: 'gap', max_width: 'mw', card_padding: 'card-p', button_spacing: 'btn-ls',
  };
  var COLOR = {
    accent: 'accent', text: 'text', label_color: 'lbl-c', input_bg: 'in-bg', input_border: 'in-bc',
    input_text: 'in-c', button_bg: 'btn-bg', button_text: 'btn-c', card_bg: 'card-bg', card_border: 'card-bc',
  };
  var WEIGHT = { label_weight: 'lbl-fw', button_weight: 'btn-fw' };
  var SHADOW = {
    sm: '0 1px 2px rgba(0,0,0,.08)',
    md: '0 4px 12px rgba(0,0,0,.14)',
    lg: '0 12px 32px rgba(0,0,0,.18)',
  };
  var HEX6 = /^#[0-9a-f]{6}$/i;

  function themeVars(t) {
    t = t || {};
    var vars = [];
    var cls = '';
    var k;
    function set(name, value) { vars.push('--gsf-' + name + ':' + value); }

    for (k in PX) if (typeof t[k] === 'number') set(PX[k], t[k] + 'px');
    for (k in COLOR) if (t[k]) set(COLOR[k], t[k]);
    for (k in WEIGHT) if (t[k]) set(WEIGHT[k], t[k]);

    if (t.font_family) set('font', '"' + String(t.font_family).replace(/"/g, '') + '",sans-serif');
    if (typeof t.font_size === 'number') cls += ' gsf-fs';

    // Heights are what people think in; padding is what the box is drawn with.
    if (typeof t.input_height === 'number') set('in-py', Math.max(4, Math.round((t.input_height - 23) / 2)) + 'px');
    if (typeof t.button_height === 'number') set('btn-py', Math.max(6, Math.round((t.button_height - 15) / 2)) + 'px');

    if (t.button_case === 'upper') set('btn-tt', 'uppercase');
    if (t.button_border) { set('btn-bw', (t.border_width || 1) + 'px'); set('btn-bc', t.button_border); }
    if (SHADOW[t.input_shadow]) set('in-sh', SHADOW[t.input_shadow]);
    if (SHADOW[t.button_shadow]) set('btn-sh', SHADOW[t.button_shadow]);
    if (SHADOW[t.card_shadow]) set('card-sh', SHADOW[t.card_shadow]);
    if (t.button_gradient) { set('btn-bg2', t.button_gradient); cls += ' gsf-grad'; }
    if (t.button_hover_bg) { set('btn-hbg', t.button_hover_bg); cls += ' gsf-hv-color'; }
    if (t.placeholder) { set('ph', t.placeholder); cls += ' gsf-ph'; }
    if (HEX6.test(t.ok_color || '')) { set('ok-bg', t.ok_color + '1f'); set('ok-bc', t.ok_color + '66'); }
    if (HEX6.test(t.bad_color || '')) { set('bad-bg', t.bad_color + '1f'); set('bad-bc', t.bad_color + '66'); }

    if (t.focus_style === 'glow') {
      set('ring', 'none');
      set('ring-sh', '0 0 0 3px ' + (HEX6.test(t.accent || '') ? t.accent + '40' : 'color-mix(in srgb,currentColor 25%,transparent)'));
    }
    if (t.button_width === 'auto') {
      set('btn-w', 'auto'); set('btn-d', 'block'); set('btn-px', '28px');
      if (t.button_align === 'center') set('btn-m', '0 auto');
      if (t.button_align === 'right') set('btn-m', '0 0 0 auto');
    }
    if (t.transitions) set('tr', 'border-color .15s,box-shadow .15s,background-color .15s,transform .15s,filter .15s');

    if (t.input_style === 'filled' || t.input_style === 'underline') cls += ' gsf-in-' + t.input_style;
    if (t.label_position === 'placeholder') cls += ' gsf-lbl-hide';
    if (t.label_position === 'floating') cls += ' gsf-lbl-float';
    if (t.button_hover === 'darken' || t.button_hover === 'lift') cls += ' gsf-hv-' + t.button_hover;
    if (t.card) cls += ' gsf-card';

    return { style: vars.join(';'), cls: cls };
  }

  // A Google Font, when one was chosen: one stylesheet link per family, once
  // per page. The default — the site's own font — adds nothing to the page.
  function fontOnce(t) {
    if (!t || !t.font_family || !t.font_google) return;
    var family = String(t.font_family);
    var id = 'gsf-font-' + family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (document.getElementById(id)) return;
    try {
      if (!document.getElementById('gsf-font-pre')) {
        document.head.appendChild(el('link', { id: 'gsf-font-pre', rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' }));
      }
      document.head.appendChild(el('link', {
        id: id, rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + ':wght@400;500;600;700&display=swap',
      }));
    } catch (err) { /* the form still renders, in the site's font */ }
  }

  // Custom CSS from the Design panel, in a style element of its own per form,
  // wrapped in the form's own selector so it can only reach that form. Updated
  // in place, so the builder's preview follows every keystroke.
  function customCss(slug, css) {
    var key = slug || 'new';
    var id = 'gsf-css-' + key;
    var node = document.getElementById(id);
    if (!css) { if (node) node.parentNode.removeChild(node); return; }
    var text = '.gsf[data-gsf="' + key + '"]{' + css + '}';
    if (!node) { node = el('style', { id: id }); document.head.appendChild(node); }
    if (node.textContent !== text) node.textContent = text;
  }

  // Build one field. Everything is a plain input unless the definition says
  // otherwise — a form that renders slightly plain is better than one that
  // throws because a type was misspelt.
  function field(f, theme) {
    var id = 'gsf-' + String(f.name).replace(/[^A-Za-z0-9_-]+/g, '-');
    theme = theme || {};

    // A hidden field is a fixed value the visitor never sees and cannot change:
    // which gym, which campaign, a tag GoHighLevel routes on. It goes in the
    // form so it is collected and sent like any other answer, with no row and no
    // label around it.
    if (f.type === 'hidden') {
      return el('input', { type: 'hidden', name: f.name, id: id, value: f.value || '' });
    }

    // Two half-width fields share a row: first name beside last name. A tickbox
    // is never half — its sentence needs the width.
    var half = f.width === 'half' && f.type !== 'checkbox';
    var row = el('div', { class: half ? 'gsf-row gsf-half' : 'gsf-row' });

    if (f.type === 'checkbox') {
      var wrap = el('label', { class: 'gsf-check' });
      wrap.appendChild(el('input', { type: 'checkbox', name: f.name, id: id, value: 'true' }));
      wrap.appendChild(el('span', null, f.label + (f.required ? ' *' : '')));
      row.appendChild(wrap);
      return row;
    }

    // Where the label sits is a design choice. Above is the default. "Placeholder"
    // keeps the label for screen readers and puts its words in the box instead.
    // "Floating" puts it inside the box, after the input in the DOM, so the
    // sheet can lift it when the input has focus or a value.
    var labels = theme.label_position || 'above';
    var label = el('label', { class: 'gsf-label', for: id });
    label.appendChild(document.createTextNode(f.label));
    if (!f.required) label.appendChild(el('span', { class: 'gsf-req' }, '  (optional)'));
    if (labels !== 'floating') row.appendChild(label);

    var ph = f.placeholder || '';
    if (labels === 'placeholder' && !ph) ph = f.label + (f.required ? '' : ' (optional)');
    if (labels === 'floating' && !ph) ph = ' ';

    var input;
    if (f.type === 'select') {
      input = el('select', { class: 'gsf-select', name: f.name, id: id });
      input.appendChild(el('option', { value: '' }, f.placeholder || (labels === 'placeholder' ? f.label : 'Choose one')));
      (f.options || []).forEach(function (o) {
        // "Jiu-Jitsu / BJJ = jiu-jitsu" — what the visitor reads and what the CRM
        // receives are not always the same thing. Killer B tags on the value, so
        // an option that sent its label instead would break their routing.
        var cut = String(o).indexOf('=');
        var label = cut === -1 ? String(o) : String(o).slice(0, cut).trim();
        var value = cut === -1 ? String(o) : String(o).slice(cut + 1).trim();
        input.appendChild(el('option', { value: value }, label));
      });
    } else if (f.type === 'textarea') {
      var rows = ({ short: '3', tall: '7' })[theme.textarea_size] || '4';
      input = el('textarea', { class: 'gsf-textarea', name: f.name, id: id, rows: rows, placeholder: ph });
    } else {
      input = el('input', {
        class: 'gsf-input', name: f.name, id: id,
        type: f.type === 'phone' ? 'tel' : (f.type || 'text'),
        placeholder: ph,
        autocomplete: ({ first_name: 'given-name', last_name: 'family-name', email: 'email', phone: 'tel' })[canon(f.name)] || 'on',
      });
    }
    if (f.required) input.setAttribute('required', 'required');
    row.appendChild(input);
    if (labels === 'floating') row.appendChild(label);
    return row;
  }

  // One definition, many placements. The same form sits in the blog tail, in
  // the footer and on the contact page, and a lead has to say which of them it
  // came from -- "we also need to be able to name each of the forms, so that we
  // can track the attribution" -- and they do not all thank the visitor on the
  // same page. Two optional attributes on the mount override exactly that much
  // and nothing else, so there is still one form to edit.
  //
  //   <div data-gs-form="killer-b-contact"
  //        data-gs-source="website blog is jiu jitsu safe"
  //        data-gs-thanks="/thank-you/trial"></div>
  // Where on the site a lead was captured, worked out rather than typed.
  //
  // The shape the agency reads attribution in is website + page + area:
  // "website homepage cta", "website blab footer", "website blog is-jiu-jitsu
  // -safe article". Typing that onto every placement of every site is work
  // nobody will keep up, and a name nobody keeps up is a name that lies. So the
  // embed works it out, and data-gs-source stays as the override for the times
  // a placement deserves a name of its own.
  function areaOf(mount) {
    for (var el = mount; el && el !== document.body; el = el.parentElement) {
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'footer') return 'footer';
      if (tag === 'dialog' || el.getAttribute('role') === 'dialog') return 'popup';
      if (tag === 'article') return 'article';
      if (tag === 'header') return 'hero';
    }
    return 'cta';
  }

  function placeName(mount) {
    var path = String(location.pathname || '').replace(/\/+$/, '');
    var page = path
      ? path.split('/').filter(Boolean).join(' ').replace(/[-_]+/g, ' ')
      : 'homepage';
    return ('website ' + page + ' ' + areaOf(mount)).replace(/\s+/g, ' ').trim();
  }

  function placed(mount, def) {
    var source = mount.getAttribute('data-gs-source') || placeName(mount);
    var thanks = mount.getAttribute('data-gs-thanks');
    var out = {};
    for (var key in def) {
      if (Object.prototype.hasOwnProperty.call(def, key)) out[key] = def[key];
    }
    if (source) out.name = source;
    if (thanks) {
      // This placement says where it goes, so a rule written for another one
      // must not win over it.
      out.redirect_enabled = true;
      out.redirect_default = thanks;
      out.redirect_rules = [];
    }
    return out;
  }

  function render(mount, def, opts) {
    opts = opts || {};
    styleOnce();

    // The Design panel's choices, as variables on this one form. A definition
    // remembered from before the panel existed has no theme at all, which is
    // the same as an empty one.
    var theme = def.theme || {};
    var look = themeVars(theme);
    fontOnce(theme);
    customCss(def.slug, theme.css);

    var cols = (def.fields || []).some(function (f) {
      return f.width === 'half' && f.type !== 'checkbox' && f.type !== 'hidden';
    });
    var form = el('form', {
      class: 'gsf' + look.cls + (cols ? ' gsf-cols' : ''),
      'data-gsf': def.slug || 'new',
      style: look.style || null,
      novalidate: 'novalidate',
    });

    (def.fields || []).forEach(function (f) { form.appendChild(field(f, theme)); });

    // A field no person can see and every crude bot fills in. Cheaper than a
    // captcha, invisible to a real visitor, and it keeps junk out of the CRM
    // rather than out of our reporting only.
    var trap = el('input', {
      type: 'text', name: 'gs_company', id: 'gsf-company', tabindex: '-1',
      autocomplete: 'off', 'aria-hidden': 'true',
    });
    trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(trap);

    // In the builder's preview the button is a button and nothing more, so what
    // is on screen is the real form and still cannot send anything.
    var btn = el('button', { class: 'gsf-btn', type: opts.preview ? 'button' : 'submit' }, def.submit_label || 'Send');
    form.appendChild(btn);

    var msg = el('div', { class: 'gsf-msg' });
    form.appendChild(msg);

    if (def.privacy_url || def.terms_url) {
      var fine = el('div', { class: 'gsf-fine' });
      if (theme.fine_style === 'links') {
        // Two plain links side by side, the way a site's footer has them.
        fine.className = 'gsf-fine gsf-fine-links';
        if (def.privacy_url) fine.appendChild(el('a', { href: def.privacy_url, target: '_blank', rel: 'noopener' }, 'Privacy Policy'));
        if (def.privacy_url && def.terms_url) fine.appendChild(el('span', { class: 'gsf-sep', 'aria-hidden': 'true' }, '|'));
        if (def.terms_url) fine.appendChild(el('a', { href: def.terms_url, target: '_blank', rel: 'noopener' }, 'Terms of Service'));
      } else {
        fine.appendChild(document.createTextNode('By submitting you agree to our '));
        if (def.privacy_url) fine.appendChild(el('a', { href: def.privacy_url, target: '_blank', rel: 'noopener' }, 'privacy policy'));
        if (def.privacy_url && def.terms_url) fine.appendChild(document.createTextNode(' and '));
        if (def.terms_url) fine.appendChild(el('a', { href: def.terms_url, target: '_blank', rel: 'noopener' }, 'terms of service'));
        fine.appendChild(document.createTextNode('.'));
      }
      form.appendChild(fine);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!opts.preview) submit(form, def, btn, msg);
    });

    mount.innerHTML = '';
    mount.appendChild(form);
  }

  function collect(form, def) {
    var out = {};
    (def.fields || []).forEach(function (f) {
      var node = form.elements[f.name];
      if (!node) return;
      out[f.name] = node.type === 'checkbox' ? node.checked : node.value.trim();
    });
    return out;
  }

  function firstMissing(data, def) {
    var missing = (def.fields || []).filter(function (f) {
      if (!f.required) return false;
      // A hidden field left empty is our mistake, not the visitor's, and there
      // is nothing on screen for them to fix. Never block a lead over it.
      if (f.type === 'hidden') return false;
      var v = data[f.name];
      return f.type === 'checkbox' ? v !== true : !v;
    });
    return missing.length ? missing[0] : null;
  }

  // What a lead looks like on the wire. One function, so the test lead the
  // builder sends to a webhook has exactly the keys a real one has.
  function payloadFor(def, data, attr) {
    var payload = Object.assign({}, attr || {}, data, {
      _form: def.slug,
      _form_name: def.name,
      _source_url: location.href,
      _source_hostname: location.hostname,
      _source_pathname: location.pathname,
      _source_referrer: document.referrer || '',
      _submitted_at: new Date().toISOString(),
    });

    var whole = [pick(data, 'first_name'), pick(data, 'last_name')].filter(Boolean).join(' ').trim();
    if (whole && !payload.name) payload.name = whole;
    if (!payload.form_name) payload.form_name = def.name || def.slug;
    if (!payload.page_url) payload.page_url = location.href;
    if (!payload.source) payload.source = def.name || def.slug;
    return payload;
  }

  // Our copy is the lead plus what the old Duda widget always sent beside it,
  // so the reporting that grew up on that shape keeps working: the person under
  // the old camelCase names, and every address this form can send a visitor to,
  // each with why and when. The CRM never sees any of this.
  function reportCopy(def, data, payload) {
    var who = userData(data);
    var copy = Object.assign({}, payload);
    if (copy.firstName == null && who.first_name) copy.firstName = who.first_name;
    if (copy.lastName == null && who.last_name) copy.lastName = who.last_name;

    var urls = [];
    (def.webhook_rules || []).forEach(function (r) {
      if (!r || !r.url) return;
      urls.push({
        url: r.url,
        purpose: r.field + ' = ' + r.value
          + ' CRM — receives form submission data to create/update contacts',
        trigger: 'on_form_submit_when_' + slugish(r.field) + '_is_' + slugish(r.value),
      });
    });
    urls.push({
      url: def.ghl_webhook_url || '(not configured)',
      purpose: 'HighLevel CRM — receives form submission data to create/update contacts',
      trigger: 'on_form_submit',
    });
    if (def.redirect_enabled) {
      var rules = def.redirect_rules || [];
      rules.forEach(function (r) {
        if (!r || !r.url) return;
        urls.push({
          url: r.url,
          purpose: r.field + ' = ' + r.value + ' redirect — user lands here after successful submission',
          trigger: 'on_success_when_' + slugish(r.field) + '_is_' + slugish(r.value),
        });
      });
      if (def.redirect_default) {
        urls.push({
          url: def.redirect_default,
          purpose: 'Default redirect — user lands here after successful submission when no rule matches',
          trigger: 'on_success',
        });
      }
      if (!rules.length && !def.redirect_default) {
        if (def.redirect_adult) urls.push({ url: def.redirect_adult, purpose: 'Adult/Both program redirect — user lands here after successful submission', trigger: 'on_success_when_program_is_adult_or_both' });
        if (def.redirect_youth) urls.push({ url: def.redirect_youth, purpose: 'Youth program redirect — user lands here after successful submission', trigger: 'on_success_when_program_is_youth' });
      }
    }
    copy._urls = urls;
    return copy;
  }

  // Which CRM this particular lead belongs to. A gym that sells two things under
  // two businesses -- Killer B's martial arts, BLAB's fitness -- has two CRMs,
  // and the answer decides: "if interest is Fitness, post it there instead".
  // Read top to bottom, first match wins, and a lead no rule catches goes to the
  // form's own webhook, which is what every form did before rules existed.
  function webhookFor(def, data) {
    var rules = def.webhook_rules || [];
    for (var i = 0; i < rules.length; i += 1) {
      var rule = rules[i] || {};
      if (rule.url && rule.field && same(data[rule.field], rule.value)) return rule.url;
    }
    return def.ghl_webhook_url || null;
  }

  function slugish(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function submit(form, def, btn, msg) {
    // The trap was filled in, so this is not a person. Behave exactly as if it
    // worked: a bot that is told it failed simply tries again.
    var trap = form.elements['gs_company'];
    if (trap && String(trap.value).trim() !== '') {
      msg.className = 'gsf-msg ok';
      msg.textContent = def.success_message || 'Thank you. We will be in touch shortly.';
      return;
    }

    var data = collect(form, def);

    var missing = firstMissing(data, def);
    if (missing) {
      msg.className = 'gsf-msg bad';
      msg.textContent = missing.label + ' is required.';
      var node = form.elements[missing.name];
      if (node && node.focus) node.focus();
      return;
    }

    btn.disabled = true;
    var wasLabel = btn.textContent;
    btn.textContent = 'Sending…';
    msg.className = 'gsf-msg';

    // Attribution first, so a field someone actually named utm_source on the
    // form wins over the one read off the URL.
    var attr = attribution();
    var payload = payloadFor(def, data, attr);

    // Our copy. Deliberately not awaited and deliberately not able to block the
    // CRM call — during the July outage this endpoint was dead for eight weeks
    // and every gym still got its leads, because of exactly this separation.
    if (def.report_enabled !== false) {
      try {
        fetch(REPORT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reportCopy(def, data, payload)),
        }).catch(function () {});
      } catch (err) { /* never blocks */ }
    }

    var crm = webhookFor(def, data);
    if (!crm) {
      done(true);
      return;
    }

    fetch(crm, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      done(res.ok);
    }).catch(function () {
      done(false);
    });

    function done(ok) {
      if (!ok) {
        track('form_error', { form_name: def.name || def.slug, form: def.slug });
        btn.disabled = false;
        btn.textContent = wasLabel;
        msg.className = 'gsf-msg bad';
        msg.textContent = def.error_message || 'Something went wrong. Please try again.';
        return;
      }

      // Before the redirect: a page that is about to be left still has to have
      // pushed the lead, or the conversion is lost.
      var person = userData(data);
      rememberPerson(person);

      track('generate_lead', {
        form_name: def.name || def.slug,
        form: def.slug,
        program: pick(data, 'program'),
        interest: pick(data, 'interest'),
        utm_source: attr.utm_source,
        utm_medium: attr.utm_medium,
        utm_campaign: attr.utm_campaign,
        user_data: person,
      });

      // Where they go next. The rules are read top to bottom against what they
      // answered — "if program is Youth, go here" — and the first match wins;
      // redirect_default is everyone else. A definition remembered from before
      // rules existed has only the old adult/youth pair, so that pair still
      // decides when nothing newer is set.
      var to = null;
      if (def.redirect_enabled) {
        var rules = def.redirect_rules || [];
        for (var ri = 0; ri < rules.length; ri += 1) {
          var rule = rules[ri] || {};
          if (rule.url && rule.field && same(data[rule.field], rule.value)) { to = rule.url; break; }
        }
        if (!to) to = def.redirect_default || null;
        if (!to && !rules.length && !def.redirect_default) {
          var program = String(pick(data, 'program') || '').toLowerCase();
          to = program.indexOf('youth') === 0 || program.indexOf('kid') === 0 ? def.redirect_youth : def.redirect_adult;
        }
      }

      if (to) { location.href = to; return; }

      form.reset();
      btn.disabled = false;
      btn.textContent = wasLabel;
      msg.className = 'gsf-msg ok';
      msg.textContent = def.success_message || 'Thank you. We will be in touch shortly.';
    }
  }

  // Something in the space straight away on a first visit. An empty gap reads as
  // a broken page; this reads as a form that is nearly there.
  function skeleton(mount) {
    styleOnce();
    var box = el('div', { class: 'gsf gsf-skeleton', 'aria-hidden': 'true' });
    for (var i = 0; i < 4; i += 1) {
      var row = el('div', { class: 'gsf-row' });
      row.appendChild(el('div', { class: 'gsf-bone gsf-bone-label' }));
      row.appendChild(el('div', { class: 'gsf-bone gsf-bone-field' }));
      box.appendChild(row);
    }
    box.appendChild(el('div', { class: 'gsf-bone gsf-bone-btn' }));
    mount.innerHTML = '';
    mount.appendChild(box);
  }

  // Some hosts render the page themselves after this script has drawn into it.
  // React hydrating a Webstudio or Next page reconciles our mount against what
  // it rendered -- an empty div -- and removes the form. On screen it appears
  // for an instant and then the space is blank, which is exactly what it looks
  // like when the script is broken.
  //
  // So watch the mount. If it is emptied by someone else, draw again. The guard
  // is the form itself: redrawing replaces children and would otherwise trip
  // the observer forever.
  // How much room the form took last time, so that nothing underneath it moves
  // while it is being fetched and drawn.
  //
  // The script is fetched, the definition is fetched, and then the host's own
  // framework can hydrate the page and empty the mount, which is drawn into
  // again. Measured on a live page: the mount was empty for two seconds, then
  // 341px of skeleton, then 552px of form, and the footer dropped 552px in two
  // visible steps. From a chair that reads as the footer jumping on every load.
  //
  // The floor is the height actually measured, so it is invisible when the form
  // is there, and it holds the space through every one of those steps. Keyed by
  // wide or narrow because the fields stack below 480px.
  function sizeKey(slug) {
    return 'gsf_h_' + slug + '_' + (window.innerWidth <= 480 ? 's' : 'l');
  }

  function holdSpace(mount, slug) {
    try {
      var was = parseInt(localStorage.getItem(sizeKey(slug)) || '', 10);
      if (was > 40) mount.style.minHeight = was + 'px';
    } catch (err) { /* private window, or storage is off */ }
  }

  // Measure the form itself rather than the mount, so the floor we are holding
  // is never what gets measured, and a form that loses a field shrinks properly
  // the next time instead of leaving a gap under it for good.
  function settle(mount, slug) {
    var box = mount.firstElementChild;
    if (!box) return;
    var h = Math.round(box.getBoundingClientRect().height);
    if (h <= 40) return;
    mount.style.minHeight = h + 'px';
    try { localStorage.setItem(sizeKey(slug), String(h)); } catch (err) { /* nothing kept */ }
  }

  function mountOne(mount) {
    if (!ANON) return;
    var slug = mount.getAttribute('data-gs-form');
    holdSpace(mount, slug);

    // Render what we saw last time first. On a repeat visit the form is there
    // immediately; on a first visit there is a skeleton rather than a gap.
    var known = remembered(slug);
    if (known) keepDrawn(mount, function () { render(mount, placed(mount, known)); settle(mount, slug); });
    else keepDrawn(mount, function () { skeleton(mount); });

    fetch(API + '/rest/v1/forms?slug=eq.' + encodeURIComponent(slug) + '&active=eq.true&select=*', {
      headers: { apikey: ANON, Authorization: 'Bearer ' + ANON },
    })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) {
          // An unknown or paused form. If a remembered copy is on screen,
          // leave it: a visitor mid-enquiry should not watch the form vanish.
          if (!known) mount.textContent = 'Form "' + slug + '" was not found.';
          return;
        }

        var fresh = rows[0];
        remember(slug, fresh);

        if (!known) {
          keepDrawn(mount, function () { render(mount, placed(mount, fresh)); settle(mount, slug); });
          return;
        }
        if (JSON.stringify(fresh) === JSON.stringify(known)) return;

        // It changed. Redraw only if nobody has started filling it in --
        // replacing a form under someone's hands would throw away their typing.
        if (touched(mount)) return;
        keepDrawn(mount, function () { render(mount, placed(mount, fresh)); settle(mount, slug); });
      })
      .catch(function () {
        if (!known) mount.textContent = 'This form could not be loaded.';
      });
  }

  // Watching one element is not enough. A host that hydrates the page can
  // replace the mount itself rather than empty it, and then the element we were
  // watching is an orphan and the new one on the page has never been drawn
  // into. So watch the page: after anything changes, any mount without a form
  // in it gets drawn. Reading the definition again is free -- the last copy is
  // remembered, so the form is back in the same frame.
  function watchPage() {
    if (!window.MutationObserver || window.__gsfWatchingPage) return;
    window.__gsfWatchingPage = true;
    var pending = false;
    var watcher = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      // Hydration fires hundreds of records; do the work once after it settles.
      window.setTimeout(function () {
        pending = false;
        var all = document.querySelectorAll('[data-gs-form]');
        for (var i = 0; i < all.length; i += 1) {
          var mount = all[i];
          if (mount.querySelector('form') || mount.querySelector('.gsf-skeleton')) continue;
          if (touched(mount)) continue;
          mountOne(mount);
        }
      }, 60);
    });
    watcher.observe(document.body, { childList: true, subtree: true });
  }

  function keepDrawn(mount, draw) {
    // Always the latest drawing, not the one the observer was created with:
    // the first is a skeleton or a remembered copy, and putting that back after
    // the real one had arrived would quietly serve a stale form.
    mount.__gsfDraw = draw;
    draw();
    if (!window.MutationObserver) return;
    if (mount.__gsfWatched) return;
    mount.__gsfWatched = true;
    var watcher = new MutationObserver(function () {
      if (mount.querySelector('form') || mount.querySelector('.gsf-skeleton')) return;
      // Never redraw over someone who is filling it in; the only way the mount
      // is empty and touched at once is a race we would rather lose quietly.
      if (touched(mount)) return;
      mount.__gsfDraw();
    });
    watcher.observe(mount, { childList: true });
  }

  function touched(mount) {
    var fields = mount.querySelectorAll('input, select, textarea');
    for (var i = 0; i < fields.length; i += 1) {
      var f = fields[i];
      if (f.type === 'checkbox' ? f.checked : String(f.value || '').trim() !== '') return true;
      if (document.activeElement === f) return true;
    }
    return false;
  }

  function boot() {
    // A thank-you page has no form on it, so nothing here would otherwise run.
    // Put the person back on the dataLayer before the site's own lead_thank_you
    // fires, so that event carries the same details the lead did.
    try {
      var kept = sessionStorage.getItem('gs_lead_user');
      if (kept) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ user_data: JSON.parse(kept) });
      }
    } catch (err) { /* nothing to restore */ }

    // Before anything else, and whether or not this page has a form on it: if
    // the script is in the site's head it runs on the landing page too, and the
    // campaign has to be recorded there. By the time the visitor reaches the
    // contact page the utm parameters are long gone from the URL.
    attribution();

    var mounts = document.querySelectorAll('[data-gs-form]');
    if (!mounts.length) return;
    if (!ANON) {
      mounts.forEach(function (m) { m.textContent = 'Form not configured: the script tag needs data-key.'; });
      return;
    }

    warmUp();
    mounts.forEach(mountOne);
    watchPage();
  }

  // The builder's preview draws with this same function, so the form on that
  // screen and the form on the client's site are one piece of code.
  window.GSF = { render: render, payload: payloadFor, CSS: CSS };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
