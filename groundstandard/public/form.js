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
  ].join('');

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
    var row = el('div', { class: 'gsf-row' });
    var id = 'gsf-' + f.name;

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
        input.appendChild(el('option', { value: o }, o));
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
      var v = data[f.name];
      return f.type === 'checkbox' ? v !== true : !v;
    });
    return missing.length ? missing[0] : null;
  }

  function submit(form, def, btn, msg) {
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

    var payload = Object.assign({}, data, {
      _form: def.slug,
      _form_name: def.name,
      _source_url: location.href,
      _source_hostname: location.hostname,
      _source_pathname: location.pathname,
      _source_referrer: document.referrer || '',
      _submitted_at: new Date().toISOString(),
    });

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
        btn.disabled = false;
        btn.textContent = wasLabel;
        msg.className = 'gsf-msg bad';
        msg.textContent = def.error_message || 'Something went wrong. Please try again.';
        return;
      }

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

  function boot() {
    var mounts = document.querySelectorAll('[data-gs-form]');
    if (!mounts.length) return;
    if (!ANON) {
      mounts.forEach(function (m) { m.textContent = 'Form not configured: the script tag needs data-key.'; });
      return;
    }

    mounts.forEach(function (mount) {
      var slug = mount.getAttribute('data-gs-form');
      fetch(API + '/rest/v1/forms?slug=eq.' + encodeURIComponent(slug) + '&active=eq.true&select=*', {
        headers: { apikey: ANON, Authorization: 'Bearer ' + ANON },
      })
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          if (!rows || !rows.length) {
            mount.textContent = 'Form "' + slug + '" was not found.';
            return;
          }
          render(mount, rows[0]);
        })
        .catch(function () {
          mount.textContent = 'This form could not be loaded.';
        });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
