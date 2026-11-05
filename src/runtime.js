/* PRYMAL i18n runtime. No network calls: dictionaries are inlined at build time. */
(function () {
  'use strict';
  var D = window.__PRYMAL_I18N__ || { langs: {}, rules: [] };
  var LANGS = ['en', 'nl', 'fr', 'es'];
  var LABEL = { en: 'English', nl: 'Nederlands', fr: 'Français', es: 'Español' };
  var KEY = 'prymal_lang';
  var DICT = D.dictBase || '/s/prymal-i18n-';
  var pending = {};
  var ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
  var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE|SVG|TEMPLATE|IFRAME)$/;
  var BLOCK = /^(P|H[1-6]|LI|DIV|SECTION|ARTICLE|LEGEND|LABEL|BUTTON|TD|TH|DT|DD|FIGCAPTION|BLOCKQUOTE|FIELDSET|NAV|HEADER|FOOTER|MAIN|UL|OL|FORM)$/;
  var SEP = ' ¦ ';
  var debug = /[?&]i18n-debug=1/.test(location.search) || window.__I18N_DEBUG__;
  var misses = window.__i18nMisses = { single: {}, group: {} };

  function store(v) {
    try { if (v) localStorage.setItem(KEY, v); return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function detect() {
    var q = /[?&]lang=(en|nl|fr|es)\b/.exec(location.search);
    if (q) { store(q[1]); return q[1]; }
    var s = store();
    if (LANGS.indexOf(s) > -1) return s;
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < list.length; i++) {
      var p = String(list[i]).toLowerCase().split('-')[0];
      if (LANGS.indexOf(p) > -1) return p; // first supported wins, so en-GB,nl stays English
    }
    return 'en';
  }

  var lang = detect();
  var root = document.documentElement;
  var orig = new WeakMap(), mine = new WeakMap(), origAttr = new WeakMap();
  function norm(s) { return s.replace(/[\u200b\u2060\ufeff]/g, '').replace(/[\s\u00a0]+/g, ' ').trim(); }
  function dict() { return D.langs[lang] || { s: {}, g: {}, r: {} }; }

  function rule(t) {
    var R = D.rules, d = dict();
    for (var i = 0; i < R.length; i++) {
      var m = new RegExp(R[i].re).exec(t);
      if (m && d.r[R[i].id]) {
        return d.r[R[i].id].replace(/\$(\d)/g, function (_, n) {
          var v = m[n], x = tr(v);
          return x === null || x === undefined ? v : x;
        });
      }
    }
    return null;
  }
  function tr(t) { var d = dict(); return d.s[t] !== undefined ? d.s[t] : rule(t); }
  function miss(t) { if (debug && /[A-Za-z]{2}/.test(t)) misses.single[t] = location.pathname; }

  function setNode(n, value) {
    var o = orig.get(n), lead = /^\s*/.exec(o)[0], tail = /\s*$/.exec(o)[0];
    var v = lead + value + tail;
    if (n.nodeValue !== v) n.nodeValue = v;
    mine.set(n, v);
  }
  function excluded(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (SKIP.test(el.nodeName.toUpperCase())) return true;
      if (el.getAttribute('translate') === 'no' || el.classList.contains('notranslate')) return true;
    }
    return false;
  }
  function blockOf(el) {
    while (el && !BLOCK.test(el.nodeName)) el = el.parentElement;
    return el;
  }
  function textsOf(b) {
    var w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), all = [];
    while (w.nextNode()) {
      var c = w.currentNode;
      if (norm(c.nodeValue) && blockOf(c.parentElement) === b && !excluded(c.parentElement)) all.push(c);
    }
    return all;
  }
  // Squarespace clones slideshow/gallery DOM, copying already-translated text into
  // new nodes. Map any known translation back to its English source.
  var rev = null;
  function reverse(t) {
    if (!rev) {
      rev = Object.create(null);
      Object.keys(D.langs).forEach(function (l) {
        var d = D.langs[l];
        Object.keys(d.s).forEach(function (k) { rev[d.s[k]] = k; });
        Object.keys(d.g).forEach(function (k) {
          var en = k.split(SEP);
          d.g[k].forEach(function (v, i) { rev[v] = en[i]; });
        });
      });
    }
    // text that is itself a known English source is never remapped ("in" the logo vs "into")
    var isSource = Object.keys(D.langs).some(function (l) { return D.langs[l].s[t] !== undefined; });
    return isSource ? undefined : rev[t];
  }
  function track(n) {
    // text changed by the page itself (plan builder) becomes the new source
    if (orig.has(n) && n.nodeValue === mine.get(n)) return;
    var raw = n.nodeValue, en = reverse(norm(raw));
    orig.set(n, en === undefined ? raw : raw.indexOf(norm(raw)) > -1 ? raw.replace(norm(raw), en) : en);
  }

  function applyBlock(b) {
    var list = textsOf(b);
    list.forEach(track);
    if (!list.length) return;
    if (lang === 'en') {
      list.forEach(function (n) { var o = orig.get(n); if (n.nodeValue !== o) n.nodeValue = o; mine.set(n, o); });
      return;
    }
    var key = '';
    if (list.length > 1) {
      key = list.map(function (n) { return norm(orig.get(n)); }).join(SEP);
      var g = dict().g[key];
      if (g && g.length === list.length) { list.forEach(function (n, i) { setNode(n, g[i]); }); return; }
    }
    list.forEach(function (n) {
      var t = norm(orig.get(n)), v = tr(t);
      if (v !== null && v !== undefined) setNode(n, v);
      else {
        setNode(n, t); miss(t);
        if (debug && key && /[A-Za-z]{2}/.test(t)) misses.group[key] = location.pathname;
      }
    });
  }
  function applyAttrs(el) {
    if (excluded(el)) return;
    var o = origAttr.get(el) || {};
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var cur = el.getAttribute(a);
      if (o[a] === undefined || o['_' + a] !== cur) o[a] = cur;
      var t = norm(o[a]);
      if (!t) return;
      var v = lang === 'en' ? t : tr(t);
      if (v === null || v === undefined) { if (a !== 'alt' && a !== 'title') miss(t); v = t; }
      if (cur !== v) el.setAttribute(a, v);
      o['_' + a] = v;
    });
    origAttr.set(el, o);
  }
  var touched = false;
  function apply(scope) {
    if (!scope) return;
    if (lang === 'en' && !touched) return; // English visitors: no DOM work at all
    touched = true;
    var host = scope.nodeType === 1 ? scope : scope.parentElement;
    if (!host || excluded(host)) return;
    var blocks = new Set();
    if (scope.nodeType === 3) blocks.add(blockOf(host));
    else {
      var w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (norm(w.currentNode.nodeValue)) blocks.add(blockOf(w.currentNode.parentElement));
    }
    blocks.forEach(function (b) { if (b) applyBlock(b); });
    if (scope.nodeType === 1) {
      applyAttrs(scope);
      scope.querySelectorAll('[aria-label],[placeholder],[title],[alt]').forEach(applyAttrs);
    }
  }

  var obs, queue = [], timer = 0;
  function watch() {
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function flush() {
    timer = 0;
    var q = queue; queue = [];
    obs.disconnect();
    q.forEach(function (n) { if (n.isConnected) apply(n); });
    watch();
  }
  function onMut(list) {
    list.forEach(function (m) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1 || n.nodeType === 3) queue.push(n); });
      } else if (m.type === 'characterData') {
        if (m.target.nodeValue !== mine.get(m.target)) queue.push(m.target);
      } else queue.push(m.target);
    });
    if (queue.length && !timer) timer = setTimeout(flush, 0);
  }

  // Dictionaries are static files fetched once per language: English visitors load none.
  function ensure(l) {
    if (l === 'en' || D.langs[l]) return Promise.resolve();
    if (!pending[l]) {
      pending[l] = fetch(DICT + l + '.json').then(function (r) {
        if (!r.ok) throw new Error('dictionary ' + l + ': ' + r.status);
        return r.text();
      }).then(function (t) { D.langs[l] = JSON.parse(t); rev = null; })
        .catch(function (e) { delete pending[l]; throw e; });
    }
    return pending[l];
  }
  function pressed() {
    document.querySelectorAll('.prymal-lang-menu button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    });
    document.querySelectorAll('.prymal-lang-btn').forEach(function (b) {
      b.querySelector('.prymal-lang-cur').textContent = lang.toUpperCase();
      b.setAttribute('aria-label', 'Language: ' + LABEL[lang]);
    });
  }
  // Squarespace sizes grid blocks for the English text. Translations can run longer,
  // so shrink a block's text just enough to stay inside it (never below 72%).
  var fitted = [], fitTimer = 0;
  function fit() {
    fitted.forEach(function (e) { e.style.fontSize = ''; });
    fitted = [];
    if (lang === 'en') return;
    var range = document.createRange();
    document.querySelectorAll('.fe-block .sqs-html-content').forEach(function (c) {
      var b = c.closest('.fe-block');
      if (!b.offsetHeight || b.querySelector('.prymal-builder')) return;
      var over = function () {
        range.selectNodeContents(c);
        return range.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom;
      };
      if (over() <= 3) return;
      var els = [].slice.call(c.querySelectorAll('h1,h2,h3,h4,p,li'));
      var base = els.map(function (e) { return parseFloat(getComputedStyle(e).fontSize); });
      fitted = fitted.concat(els);
      for (var s = 0.96; s >= 0.72; s -= 0.04) {
        for (var i = 0; i < els.length; i++) els[i].style.fontSize = (base[i] * s) + 'px';
        if (over() <= 3) break;
      }
    });
  }
  function fitSoon() { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 120); }
  function setLang(next, persist) {
    return ensure(next).then(function () {
      lang = next;
      if (persist) store(next);
      root.lang = next === 'en' ? 'en-US' : next;
      obs.disconnect();
      apply(document.body);
      watch();
      pressed();
      fit();
    }).catch(function (e) {
      window.__i18nError = String(e); // stay on the current language, page keeps working
      if (lang !== 'en' && !touched) { lang = 'en'; root.lang = 'en-US'; }
      pressed();
    });
  }
  function closeAll(except) {
    document.querySelectorAll('.prymal-lang').forEach(function (h) {
      if (h === except) return;
      h.querySelector('.prymal-lang-menu').hidden = true;
      h.querySelector('.prymal-lang-btn').setAttribute('aria-expanded', 'false');
    });
  }
  function switcher(id) {
    var host = document.createElement('div');
    host.id = id;
    host.className = 'prymal-lang notranslate';
    host.setAttribute('translate', 'no');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'prymal-lang-btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><ellipse cx="12" cy="12" rx="4.2" ry="9.5"/><path d="M2.5 12h19"/></svg><span class="prymal-lang-cur"></span>';
    var menu = document.createElement('div');
    menu.className = 'prymal-lang-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Language');
    var open = function (focus) {
      closeAll(host);
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (focus) (menu.querySelector('[aria-pressed=true]') || menu.querySelector('button')).focus();
    };
    var shut = function () { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', function () { if (menu.hidden) open(false); else shut(); });
    LANGS.forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = l;
      b.textContent = LABEL[l];
      b.lang = l;
      b.addEventListener('click', function () { shut(); btn.focus(); setLang(l, true); });
      menu.appendChild(b);
    });
    host.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { shut(); btn.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (menu.hidden) { open(true); return; }
      var items = [].slice.call(menu.querySelectorAll('button')), i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    });
    host.appendChild(btn);
    host.appendChild(menu);
    return host;
  }
  function mount() {
    if (document.getElementById('prymal-lang')) return;
    var slot = document.querySelector('.header-display-desktop .header-actions--right') || document.querySelector('.header-actions--right');
    var mobile = document.querySelector('.header-menu-nav-wrapper');
    var el = switcher('prymal-lang');
    if (slot) slot.insertBefore(el, slot.firstChild);
    else document.body.appendChild(el);
    var ref = document.querySelector('.header-nav-item a, .header-menu-nav-item a');
    if (ref) { // copy the live nav typography, so it follows any Site Styles change
      var cs = getComputedStyle(ref);
      el.style.fontFamily = cs.fontFamily;
      el.style.fontWeight = cs.fontWeight;
      el.style.fontSize = cs.fontSize;
      el.style.letterSpacing = cs.letterSpacing;
    }
    if (mobile) {
      var m = switcher('prymal-lang-m');
      if (ref) { m.style.fontFamily = cs.fontFamily; m.style.fontWeight = cs.fontWeight; m.style.letterSpacing = cs.letterSpacing; }
      mobile.appendChild(m);
    }
  }
  function ready() {
    var done = function () { root.classList.remove('i18n-wait'); };
    try {
      mount();
      pressed();
      window.addEventListener('resize', fitSoon);
      window.addEventListener('load', fitSoon);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSoon);
      document.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('.prymal-lang')) closeAll();
      });
      obs = new MutationObserver(onMut);
      setLang(lang, false).then(done, done);
    } catch (e) {
      window.__i18nError = String(e); // the English page stays usable if translation fails
      done();
      if (debug) throw e;
    }
  }
  if (lang !== 'en') {
    ensure(lang).catch(function () {}); // start the download while the page parses
    root.classList.add('i18n-wait');
    setTimeout(function () { root.classList.remove('i18n-wait'); }, 1500); // never leave the page hidden
  }
  root.lang = lang === 'en' ? 'en-US' : lang;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
  window.__prymalI18n = { setLang: function (l) { setLang(l, true); }, get lang() { return lang; } };
})();
