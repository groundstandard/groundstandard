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
  var REPORT = 'https://primary-production-aa130.up.railway.app/webhook/c7e4d2ca-duda-gs-getinfo';

  var CSS = [
    '.gsf{max-width:520px;font:15px/1.5 inherit}',
    '.gsf *{box-sizing:border-box}',
    '.gsf-row{margin-bottom:14px}',
    '.gsf-label{display:block;margin-bottom:6px;font-size:13px;font-weight:600;opacity:.85}',
    '.gsf-req{opacity:.5;font-weight:400}',
    '.gsf-input,.gsf-select,.gsf-textarea{width:100%;padding:11px 13px;border:1px solid rgba(128,128,128,.35);',
    'border-radius:8px;font:inherit;background:transparent;color:inherit}',
    '.gsf-input:focus,.gsf-select:focus,.gsf-textarea:focus{outline:2px solid currentColor;outline-offset:-1px}',
    '.gsf-check{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.45}',
    '.gsf-check input{margin-top:3px;flex-shrink:0}',
    '.gsf-btn{width:100%;padding:13px;border:0;border-radius:8px;font:600 15px/1 inherit;cursor:pointer;',
    'background:currentColor;color:#fff;filter:none}',
    '.gsf-btn[disabled]{opacity:.55;cursor:default}',
    '.gsf-msg{margin-top:12px;padding:11px 13px;border-radius:8px;font-size:14px;display:none}',
    '.gsf-msg.ok{display:block;background:rgba(46,125,83,.12);border:1px solid rgba(46,125,83,.4)}',
    '.gsf-msg.bad{display:block;background:rgba(198,72,60,.12);border:1px solid rgba(198,72,60,.4)}',
    '.gsf-fine{margin-top:10px;font-size:12px;opacity:.6}',
    '.gsf-fine a{color:inherit}',
    '.gsf-bone{background:currentColor;opacity:.08;border-radius:8px;animation:gsf-pulse 1.4s ease-in-out infinite}',
    '.gsf-bone-label{width:90px;height:11px;margin-bottom:6px}',
    '.gsf-bone-field{width:100%;height:43px}',
    '.gsf-bone-btn{width:100%;height:45px}',
    '@keyframes gsf-pulse{0%,100%{opacity:.08}50%{opacity:.16}}',
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
  function userData(data) {
    var out = {};
    if (data.email)      out.email_address = String(data.email).trim().toLowerCase();
    if (data.phone)      out.phone_number = String(data.phone).replace(/[^0-9+]/g, '');
    if (data.first_name) out.first_name = String(data.first_name).trim();
    if (data.last_name)  out.last_name = String(data.last_name).trim();
    if (!out.first_name && data.name) {
      var parts = String(data.name).trim().split(/\s+/);
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

  // Build one field. Everything is a plain input unless the definition says
  // otherwise — a form that renders slightly plain is better than one that
  // throws because a type was misspelt.
  function field(f) {
    var id = 'gsf-' + f.name;

    // A hidden field is a fixed value the visitor never sees and cannot change:
    // which gym, which campaign, a tag GoHighLevel routes on. It goes in the
    // form so it is collected and sent like any other answer, with no row and no
    // label around it.
    if (f.type === 'hidden') {
      return el('input', { type: 'hidden', name: f.name, id: id, value: f.value || '' });
    }

    var row = el('div', { class: 'gsf-row' });

    if (f.type === 'checkbox') {
      var wrap = el('label', { class: 'gsf-check' });
      wrap.appendChild(el('input', { type: 'checkbox', name: f.name, id: id, value: 'true' }));
      wrap.appendChild(el('span', null, f.label + (f.required ? ' *' : '')));
      row.appendChild(wrap);
      return row;
    }

    var label = el('label', { class: 'gsf-label', for: id });
    label.appendChild(document.createTextNode(f.label));
    if (!f.required) label.appendChild(el('span', { class: 'gsf-req' }, '  (optional)'));
    row.appendChild(label);

    var input;
    if (f.type === 'select') {
      input = el('select', { class: 'gsf-select', name: f.name, id: id });
      input.appendChild(el('option', { value: '' }, f.placeholder || 'Choose one'));
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
      input = el('textarea', { class: 'gsf-textarea', name: f.name, id: id, rows: '4', placeholder: f.placeholder || '' });
    } else {
      input = el('input', {
        class: 'gsf-input', name: f.name, id: id,
        type: f.type === 'phone' ? 'tel' : (f.type || 'text'),
        placeholder: f.placeholder || '',
        autocomplete: ({ first_name: 'given-name', last_name: 'family-name', email: 'email', phone: 'tel' })[f.name] || 'on',
      });
    }
    if (f.required) input.setAttribute('required', 'required');
    row.appendChild(input);
    return row;
  }

  function render(mount, def) {
    styleOnce();
    var form = el('form', { class: 'gsf', novalidate: 'novalidate' });

    (def.fields || []).forEach(function (f) { form.appendChild(field(f)); });

    // A field no person can see and every crude bot fills in. Cheaper than a
    // captcha, invisible to a real visitor, and it keeps junk out of the CRM
    // rather than out of our reporting only.
    var trap = el('input', {
      type: 'text', name: 'gs_company', id: 'gsf-company', tabindex: '-1',
      autocomplete: 'off', 'aria-hidden': 'true',
    });
    trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(trap);

    var btn = el('button', { class: 'gsf-btn', type: 'submit' }, def.submit_label || 'Send');
    form.appendChild(btn);

    var msg = el('div', { class: 'gsf-msg' });
    form.appendChild(msg);

    if (def.privacy_url || def.terms_url) {
      var fine = el('div', { class: 'gsf-fine' });
      fine.appendChild(document.createTextNode('By submitting you agree to our '));
      if (def.privacy_url) fine.appendChild(el('a', { href: def.privacy_url, target: '_blank', rel: 'noopener' }, 'privacy policy'));
      if (def.privacy_url && def.terms_url) fine.appendChild(document.createTextNode(' and '));
      if (def.terms_url) fine.appendChild(el('a', { href: def.terms_url, target: '_blank', rel: 'noopener' }, 'terms of service'));
      fine.appendChild(document.createTextNode('.'));
      form.appendChild(fine);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(form, def, btn, msg);
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
    var payload = Object.assign({}, attr, data, {
      _form: def.slug,
      _form_name: def.name,
      _source_url: location.href,
      _source_hostname: location.hostname,
      _source_pathname: location.pathname,
      _source_referrer: document.referrer || '',
      _submitted_at: new Date().toISOString(),
    });

    var whole = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
    if (whole && !payload.name) payload.name = whole;
    if (!payload.form_name) payload.form_name = def.name || def.slug;
    if (!payload.page_url) payload.page_url = location.href;
    if (!payload.source) payload.source = def.name || def.slug;

    // Our copy. Deliberately not awaited and deliberately not able to block the
    // CRM call — during the July outage this endpoint was dead for eight weeks
    // and every gym still got its leads, because of exactly this separation.
    if (def.report_enabled !== false) {
      try {
        fetch(REPORT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, payload, {
            _urls: [{ url: def.ghl_webhook_url || '(not configured)', purpose: 'HighLevel CRM', trigger: 'on_form_submit' }],
          })),
        }).catch(function () {});
      } catch (err) { /* never blocks */ }
    }

    if (!def.ghl_webhook_url) {
      done(true);
      return;
    }

    fetch(def.ghl_webhook_url, {
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
        program: data.program,
        interest: data.interest,
        utm_source: attr.utm_source,
        utm_medium: attr.utm_medium,
        utm_campaign: attr.utm_campaign,
        user_data: person,
      });

      var program = (data.program || '').toLowerCase();
      var to = def.redirect_enabled
        ? (program.indexOf('youth') === 0 || program.indexOf('kid') === 0 ? def.redirect_youth : def.redirect_adult)
        : null;

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

    mounts.forEach(function (mount) {
      var slug = mount.getAttribute('data-gs-form');

      // Render what we saw last time first. On a repeat visit the form is there
      // immediately; on a first visit there is a skeleton rather than a gap.
      var known = remembered(slug);
      if (known) render(mount, known); else skeleton(mount);

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

          if (!known) { render(mount, fresh); return; }
          if (JSON.stringify(fresh) === JSON.stringify(known)) return;

          // It changed. Redraw only if nobody has started filling it in —
          // replacing a form under someone's hands would throw away their typing.
          if (touched(mount)) return;
          render(mount, fresh);
        })
        .catch(function () {
          if (!known) mount.textContent = 'This form could not be loaded.';
        });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
