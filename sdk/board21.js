/*
 * 21Board Widget SDK  (window.Board21)
 * ======================================
 * Include this in every widget, before your own scripts:
 *
 *     <script src="../../sdk/board21.js"></script>
 *
 * Then:
 *
 *     const ctx  = await Board21.ready();      // { widgetId, instance, data, config, theme, ... }
 *     render(ctx.data);
 *     Board21.on('data', render);             // content changed in another 21Board tab / import
 *     button.onclick = () => Board21.save({ count: ++count });
 *
 * Full reference: docs/WIDGET-SDK.md
 *
 * Talks to the board with window.postMessage, so a widget never touches
 * IndexedDB itself.
 *
 * Opened anywhere else (its own file, a local server, an AI tool's preview such
 * as Gemini Canvas), the SDK shows the widget inside a real 21Board window: the
 * "dev window" (sdk/board21-dev.js), with the real title bar, resize handles,
 * menu and Settings. That needs this script to be the FIRST script in <head>.
 * Add #b21-bare to the address (or data-dev="off" to this script tag) for just
 * the widget on its own ("standalone": data in localStorage, window calls ignored).
 */
(function () {
  'use strict';
  // (A page rewritten with document.open() keeps its window and document, but not its <html> element: an SDK
  // from the old page doesn't count.)
  if (window.Board21 && window.Board21.page === document.documentElement) return;

  var SDK_VERSION = '1.1.0';
  var PROTOCOL = 1;
  var ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var me = document.currentScript;

  // ------------------------------------------------------------ where am I?
  //  'board': inside 21Board. The board names the widget's frame 'b21-board:…' before it loads (older
  //           boards: a same-origin parent with __board21Host). Talk to it.
  //  'dev':   anywhere else: show the widget in a real 21Board window (the dev window).
  //  'bare':  just the widget ("standalone"): #b21-bare, data-dev="off", or the dev window can't start.
  function inBoard() {
    if (/^b21-board:/.test(window.name || '')) return true;
    try { return window.parent !== window && !!(window.parent.__board21Host || window.parent.__board21); } catch (e) { return false; }
  }
  var role = inBoard() ? 'board'
    : (window.name === 'b21-bare' || /(^#|[#&])b21-bare\b/.test(location.hash) || (me && me.getAttribute('data-dev') === 'off')) ? 'bare' : 'dev';
  // showBare's own rewrite: only for this load (the next one tries the dev window again). A frame named so by the
  // dev window ("the widget on its own") keeps its name, so reloading the widget there stays on its own.
  if (window.name === 'b21-bare' && window.__board21DevNote !== undefined) window.name = '';
  var embedded = role === 'board';
  // The board's origin. (about:srcdoc and file:// pages report location.origin 'null', so self.origin is used,
  // and messages can't be origin-restricted when it's opaque.)
  var targetOrigin = (self.origin && self.origin !== 'null') ? self.origin : '*';

  var PALETTES = {
    light: {
      'bg': '#ffffff', 'surface': '#f9fafb', 'surface-2': '#f3f4f6', 'text': '#1f2937', 'muted': '#6b7280',
      'border': '#e5e7eb', 'accent': '#2563eb', 'on-accent': '#ffffff', 'accent-soft': '#eff6ff',
      'danger': '#dc2626', 'success': '#16a34a', 'warning': '#d97706',
      'font': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'radius': '10px'
    },
    dark: {
      'bg': '#1e1e1e', 'surface': '#262626', 'surface-2': '#2f2f2f', 'text': '#f9fafb', 'muted': '#9ca3af',
      'border': '#3a3a3a', 'accent': '#60a5fa', 'on-accent': '#0b1220', 'accent-soft': 'rgba(96,165,250,0.18)',
      'danger': '#f87171', 'success': '#4ade80', 'warning': '#fbbf24',
      'font': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'radius': '10px'
    }
  };

  var listeners = {};
  var context = null;
  var standalone = !embedded;
  var reqSeq = 0;
  var pending = {};
  var menuItems = [];
  var readyResolve;
  var readyPromise = new Promise(function (r) { readyResolve = r; });

  // ---------------------------------------------------------------- helpers
  function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

  function jsonSafe(v, what) {
    if (v === undefined) return null;
    var s;
    try { s = JSON.stringify(v); } catch (err) {
      throw new Error('21Board: ' + what + ' must be JSON-serializable (' + err.message + ')');
    }
    if (s && s.length > 8 * 1024 * 1024) console.warn('21Board: ' + what + ' is ' + Math.round(s.length / 1048576) + ' MB. Keep widget data small.');
    return s === undefined ? null : JSON.parse(s);
  }

  function emit(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    (listeners[event] || []).slice().forEach(function (fn) {
      try { fn.apply(null, args); } catch (err) { console.error('21Board listener for "' + event + '" failed:', err); }
    });
  }

  function applyTheme(theme, palette) {
    palette = palette || PALETTES[theme] || PALETTES.light;
    var root = document.documentElement;
    root.setAttribute('data-b21-theme', theme);
    root.style.colorScheme = theme;
    Object.keys(palette).forEach(function (k) { root.style.setProperty('--b21-' + k, palette[k]); });
    applyLetters(palette.font);
  }

  // ---------------------------------------------------------------- letters
  // The teacher can choose easier-to-read letters (21Board's Settings → Appearance → Letters): --b21-font then
  // starts with a font that comes with 21Board, in its fonts/ folder. Its @font-face rules are added here,
  // pointing at that folder next to this script (…/sdk/board21.js), and fetch the files only once text uses
  // them. For the built-in widgets that's the board's own site; a widget on another site that loads this
  // script from the board gets them only if the board's site allows it (CORS), and one with its own copy of
  // the SDK only if a fonts/ folder is next to it. Otherwise its text stays in the device's own font, the
  // next one in --b21-font. Text a widget fits to its window must be fitted again in the new letters: a
  // window resize event fires when they change, and again once the font has loaded.
  var LETTER_FACES = {
    'Atkinson Hyperlegible': ['AtkinsonHyperlegible-Regular.woff2', 'AtkinsonHyperlegible-Bold.woff2'],
    '21Board Early Readers': ['EarlyReaders-Regular.woff2', 'EarlyReaders-Bold.woff2']
  };
  var sdkFile = me && me.src ? me.src.replace(/[?#].*$/, '') : '';
  var fontBase = /sdk\/board21(\.min)?\.js$/.test(sdkFile) ? sdkFile.replace(/sdk\/board21(\.min)?\.js$/, '') + 'fonts/' : '';
  var lettersNow = null, lettersAdded = {}, refitSoon = false;
  function applyLetters(font) {
    font = String(font || '');
    var fam = (/^\s*"([^"]+)"/.exec(font) || [])[1];
    if (fam && fontBase && LETTER_FACES.hasOwnProperty(fam) && !lettersAdded[fam]) {
      lettersAdded[fam] = true;
      var css = document.createElement('style');
      css.setAttribute('data-b21-letters', fam);
      css.textContent = LETTER_FACES[fam].map(function (file, i) {   // (the UI's weights 600–800 come out in the Bold one)
        return '@font-face { font-family: "' + fam + '"; src: url("' + fontBase + file + '") format("woff2"); font-weight: ' + (i ? 700 : 400) + '; font-display: swap; }';
      }).join('\n');
      (document.head || document.documentElement).appendChild(css);
    }
    if (lettersNow !== null && font !== lettersNow) refit();
    lettersNow = font;
  }
  function refit() {
    if (refitSoon) return;
    refitSoon = true;
    setTimeout(function () {
      refitSoon = false;
      try { window.dispatchEvent(new Event('resize')); } catch (e) { /* (a very old browser) */ }
    }, 30);
  }
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', function () { if (Object.keys(lettersAdded).length) refit(); });
  }

  function post(type, payload) {
    if (standalone) return;
    var msg = { b21: PROTOCOL, type: type };
    if (payload) Object.keys(payload).forEach(function (k) { msg[k] = payload[k]; });
    window.parent.postMessage(msg, targetOrigin);
  }

  function request(type, payload) {
    return readyPromise.then(function () {
      if (standalone) return standaloneRequest(type, payload);
      return new Promise(function (resolve, reject) {
        var id = ++reqSeq;
        pending[id] = { resolve: resolve, reject: reject };
        post(type, Object.assign({ reqId: id }, payload));
        setTimeout(function () {
          if (pending[id]) { delete pending[id]; reject(new Error('21Board did not respond to "' + type + '"')); }
        }, 15000);
      });
    });
  }

  // ------------------------------------------------------- standalone mode
  // The widget's manifest block, if it has one:
  //   <script type="application/json" id="board21-widget">{"id": "my-widget", "name": "My Widget", "window": {...}}</script>
  var manifest = null;
  function readManifest() {
    if (manifest) return manifest;
    try { var el = document.getElementById('board21-widget'); manifest = el ? JSON.parse(el.textContent) || {} : {}; } catch (e) { manifest = {}; }
    return manifest;
  }
  function standaloneId() {
    var m = readManifest();
    if (m && ID_RE.test(m.id || '')) return m.id;
    var p = location.pathname.match(/widgets\/([^/]+)\//);
    return p ? p[1] : 'widget';
  }
  // Kept in localStorage by widget id (an AI tool's preview may change its address on every load, or block
  // storage: then it lasts until the page reloads).
  var memStore = null;
  function standaloneKey() { return '21board:standalone:' + standaloneId(); }
  function standaloneStore() {
    try { var v = localStorage.getItem(standaloneKey()); if (v) return JSON.parse(v) || {}; } catch (e) { /* blocked */ }
    return memStore ? JSON.parse(memStore) : {};
  }

  function standaloneRequest(type, payload) {
    var s = standaloneStore();
    if (type === 'save') s.data = payload.data;
    else if (type === 'saveConfig') s.config = payload.config;
    else if (type === 'getInfo') return Promise.resolve(windowInfo());
    else return Promise.resolve(null);
    memStore = JSON.stringify(s);
    try { localStorage.setItem(standaloneKey(), memStore); } catch (e) { /* storage blocked: memory only */ }
    return Promise.resolve(true);
  }

  function windowInfo() {
    return { width: window.innerWidth, height: window.innerHeight, maximized: false, focused: document.hasFocus(), zoom: 1 };
  }

  function startStandalone() {
    if (context) return;
    standalone = true;
    var s = standaloneStore();
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    var theme = mq && mq.matches ? 'dark' : 'light';
    var man = readManifest();
    context = {
      standalone: true, sdkVersion: SDK_VERSION, boardVersion: null,
      widgetId: standaloneId(), widgetName: String(man.name || document.title || 'Widget'), widgetVersion: String(man.version || ''), instance: 1,
      data: s.data === undefined ? null : s.data, config: s.config === undefined ? null : s.config,
      theme: theme, palette: PALETTES[theme], window: windowInfo(),
      locale: navigator.language || 'en-US', devMode: true, host: 'standalone'
    };
    applyTheme(theme);
    window.addEventListener('resize', function () { emit('resize', windowInfo()); });
    // Follow the device's light/dark setting, as the board does with "Auto".
    if (mq) {
      var onTheme = function () {
        var t = mq.matches ? 'dark' : 'light';
        context.theme = t; context.palette = PALETTES[t]; applyTheme(t); emit('theme', t, PALETTES[t]);
      };
      if (mq.addEventListener) mq.addEventListener('change', onTheme); else if (mq.addListener) mq.addListener(onTheme);
    }
    console.info('21Board SDK: running standalone (not inside 21Board). Data is kept in localStorage.');
    readyResolve(context);
    renderStandaloneMenu();
  }

  // A menu item (or a swatch inside a row of swatches) by id.
  function findMenuItem(id) {
    for (var k = 0; k < menuItems.length; k++) {
      var i = menuItems[k];
      if (i.swatches) { for (var j = 0; j < i.swatches.length; j++) if (i.swatches[j].id === id) return i.swatches[j]; }
      else if (!i.heading && !i.separator && i.id === id) return i;
    }
    return null;
  }

  // A tiny stand-in for the window menu, so custom menu items can be tested standalone.
  var standaloneMenuBtn = null;
  function renderStandaloneMenu() {
    if (!standalone || !document.body) return;
    if (!menuItems.length) { if (standaloneMenuBtn) { standaloneMenuBtn.remove(); standaloneMenuBtn = null; } return; }
    if (!standaloneMenuBtn) {
      standaloneMenuBtn = document.createElement('select');
      standaloneMenuBtn.title = 'Window menu items (standalone preview)';
      standaloneMenuBtn.style.cssText = 'position:fixed;top:6px;right:6px;z-index:2147483647;font:12px system-ui;opacity:.85';
      standaloneMenuBtn.addEventListener('change', function () {
        var id = standaloneMenuBtn.value; standaloneMenuBtn.value = '';
        var item = findMenuItem(id);
        if (item && !item.disabled) emit('menu', id, item);
      });
      document.body.appendChild(standaloneMenuBtn);
    }
    var opt = function (id, label, checked) {
      return '<option value="' + String(id).replace(/"/g, '&quot;') + '">' + (checked ? '\u2713 ' : '') + String(label).replace(/</g, '&lt;') + '</option>';
    };
    // As in the board: at most 24 items and 12 swatches per row.
    standaloneMenuBtn.innerHTML = '<option value="">Menu \u25be</option>' + menuItems.slice(0, 24).map(function (i) {
      if (i.separator) return '<option disabled>\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</option>';
      if (i.heading) return '<option disabled>\u2014 ' + String(i.label).replace(/</g, '&lt;') + ' \u2014</option>';
      if (i.swatches) return i.swatches.slice(0, 12).map(function (s) { return opt(s.id, i.label + ': ' + s.label, s.checked); }).join('');
      return i.disabled ? '<option disabled>' + String(i.label).replace(/</g, '&lt;') + '</option>' : opt(i.id, i.label, i.checked);
    }).join('');
  }

  // ---------------------------------------------------------- messaging
  window.addEventListener('message', function (e) {
    if (!embedded || e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.b21 !== PROTOCOL || typeof m.type !== 'string') return;
    switch (m.type) {
      case 'init':
        if (context) return; // already initialised (or already fell back to standalone)
        context = m.context;
        context.standalone = false;
        applyTheme(context.theme, context.palette);
        devReport(context.host === 'dev');
        readyResolve(context);
        break;
      case 'ack': {
        var p = pending[m.reqId];
        if (!p) return;
        delete pending[m.reqId];
        if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error || '21Board request failed'));
        break;
      }
      case 'data':
        if (context) context.data = m.data;
        emit('data', clone(m.data), { reason: m.reason || 'remote' });
        break;
      case 'config':
        if (context) context.config = m.config;
        emit('config', clone(m.config), { reason: m.reason || 'remote' });
        break;
      case 'theme':
        if (context) { context.theme = m.theme; context.palette = m.palette; }
        applyTheme(m.theme, m.palette);
        emit('theme', m.theme, m.palette);
        break;
      case 'window':
        if (context) context.window = m.info;
        emit('resize', m.info);
        break;
      case 'focus': if (context && context.window) context.window.focused = true; emit('focus'); break;
      case 'blur': if (context && context.window) context.window.focused = false; emit('blur'); break;
      case 'menu': {
        var item = findMenuItem(m.id);
        emit('menu', m.id, item || null);
        break;
      }
      case 'beforeclose': emit('beforeclose'); break;
    }
  });

  // ------------------------------------------------- errors, for the dev window
  // In the dev window the widget runs a frame deeper than the AI tool's preview, so its errors would be out
  // of the tool's sight. Inside 21Board they're kept from the start and sent once the board says it's the
  // dev window (init context.host 'dev'); otherwise they're dropped.
  var devLogs = [], devOn = null, origConsole = {}, sdkConsole = {};
  function devText(args) {
    return Array.prototype.map.call(args, function (a) {
      if (a instanceof Error) return a.stack && a.stack.indexOf(a.message) >= 0 ? a.stack : a.name + ': ' + a.message + (a.stack ? '\n' + a.stack : '');
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(' ').slice(0, 4000);
  }
  function devLog(level, args) {
    if (devOn === false) return;
    var entry = { level: level, text: devText(args) };
    if (devOn) post('devLog', entry); else if (devLogs.length < 50) devLogs.push(entry);
  }
  function devReport(on) {
    devOn = !!on;
    if (devOn) devLogs.forEach(function (l) { post('devLog', l); });
    else Object.keys(origConsole).forEach(function (k) { if (console[k] === sdkConsole[k]) console[k] = origConsole[k]; });   // (unless the widget wrapped it since)
    devLogs = [];
  }
  if (role === 'board') {
    window.addEventListener('error', function (e) {
      devLog('error', [e.error instanceof Error ? e.error : e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')]);
    });
    window.addEventListener('unhandledrejection', function (e) { devLog('error', ['Unhandled promise rejection:', e.reason]); });
    ['error', 'warn'].forEach(function (k) {
      var orig = origConsole[k] = console[k];
      console[k] = sdkConsole[k] = function () { devLog(k, arguments); return orig.apply(console, arguments); };
    });
  }

  // ------------------------------------------------------------ dev window
  // Not inside 21Board: keep the rest of this page as text (document.write of an unclosed <plaintext>, before
  // any of the widget's own code runs), then let sdk/board21-dev.js run the real board around it. Needs this
  // script to be the first script in <head>, loaded normally (not async, defer or module).
  var devBase = me && me.src ? me.src.replace(/[?#].*$/, '').replace(/sdk\/board21(\.min)?\.js$/, '') : '';
  function startDev() {
    if (!me || !me.src || devBase === me.src.replace(/[?#].*$/, '') || me.async || me.defer || me.type === 'module') return 'not-loadable';
    if (document.readyState !== 'loading' || me.parentNode !== document.head || document.body) return 'not-first';
    var attrs = Array.prototype.map.call(document.documentElement.attributes, function (a) {
      return ' ' + a.name + '="' + a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
    }).join('');
    var head = document.head.innerHTML;
    var dt = document.doctype;   // kept as it is (none = quirks mode, as on the board)
    var doctype = dt ? '<!DOCTYPE ' + dt.name + (dt.publicId ? ' PUBLIC "' + dt.publicId + '"' : '') + (dt.systemId ? (dt.publicId ? '' : ' SYSTEM') + ' "' + dt.systemId + '"' : '') + '>\n' : '';
    try { document.write('<plaintext hidden style="display:none">'); } catch (e) { return 'no-write'; }
    document.addEventListener('DOMContentLoaded', function () {
      var pt = document.querySelector('plaintext');
      var src = doctype + '<html' + attrs + '>\n<head>' + head + (pt ? pt.textContent : '');
      if (pt) pt.parentNode.removeChild(pt);
      var dev = window.__board21Dev = { src: src, base: devBase, sdkUrl: me.src, hostUrl: location.href };
      var done = false;
      var fail = function (why) {
        if (done) return; done = true;
        console.warn('21Board SDK: the dev window could not start (' + why + '). Showing the widget on its own.');
        showBare(dev, why);
      };
      var t = setTimeout(function () { fail('timed out loading ' + devBase + 'sdk/board21-dev.js'); }, 8000);
      var s = document.createElement('script');
      s.charset = 'utf-8';   // the preview's page may not say how it's encoded
      s.src = devBase + 'sdk/board21-dev.js';
      s.onload = function () {
        clearTimeout(t);
        if (done) return;
        if (!window.Board21Dev) { fail('sdk/board21-dev.js did not load'); return; }
        done = true;
        try { window.Board21Dev.start(dev); } catch (err) { console.error(err); done = false; fail(err.message); }
      };
      s.onerror = function () { clearTimeout(t); fail('could not load ' + s.src); };
      document.head.appendChild(s);
    });
    return 'ok';
  }
  // Rewrite this page with the widget on its own (standalone), with a note at the top.
  function showBare(dev, why) {
    window.name = 'b21-bare';
    window.__board21DevNote = why || '';
    document.open();
    document.write(dev.src);
    document.close();
  }
  var devNote = '';
  if (role === 'dev') {
    var started = startDev();
    if (started === 'ok') return;   // the dev window takes over the page; this copy of the SDK is done
    role = 'bare';
    devNote = started === 'not-first'
      ? 'To try this widget in a 21Board window, make the 21Board SDK script the first script in <head>.'
      : started === 'not-loadable' ? 'To try this widget in a 21Board window, load the SDK with a normal <script src="\u2026/sdk/board21.js">.' : '';
  } else if (role === 'bare' && window.__board21DevNote !== undefined) {
    devNote = window.__board21DevNote ? 'The 21Board dev window could not start: ' + window.__board21DevNote : '';
  }
  // A small note at the top of a standalone page saying why it isn't in a 21Board window.
  function showDevNote() {
    if (!document.body || !devNote) return;
    var bar = document.createElement('div');
    bar.setAttribute('data-b21-note', '');
    bar.style.cssText = 'position:fixed;left:6px;top:6px;z-index:2147483647;max-width:calc(100% - 120px);display:flex;gap:8px;align-items:center;' +
      'padding:6px 8px 6px 12px;border-radius:10px;background:#1f2937;color:#fff;font:12.5px/1.35 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    var txt = document.createElement('span');
    txt.textContent = devNote;
    bar.appendChild(txt);
    var btn = function (label, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font:inherit;font-weight:600;color:#93c5fd;background:none;border:0;padding:2px 4px;cursor:pointer;white-space:nowrap';
      b.onclick = fn; bar.appendChild(b);
    };
    btn('\u2715', function () { bar.remove(); });
    document.body.appendChild(bar);
  }
  if (role === 'bare') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showDevNote); else showDevNote();
  }

  if (embedded) {
    // Avoid a flash of the wrong theme: peek at the host synchronously when same-origin.
    try {
      var host = window.parent.__board21Host;
      if (host && host.theme) applyTheme(host.theme, host.palette);
    } catch (e) { /* cross-origin host: wait for init */ }

    post('hello', { sdkVersion: SDK_VERSION, protocol: PROTOCOL });
    // Tapping anywhere in the widget brings its window to the front.
    window.addEventListener('pointerdown', function () { post('activate'); }, true);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') post('key', { key: 'Escape' }); }, true);
    // Safety net: if the board never answers, run on its own.
    setTimeout(function () { if (!context) startStandalone(); }, 4000);
  } else {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startStandalone);
    else startStandalone();
  }

  // ---------------------------------------------------------- public API
  function windowOp(op, args) {
    return readyPromise.then(function () { post('window', { op: op, args: args || [] }); });
  }

  var Board21 = {
    version: SDK_VERSION,

    /** Resolves with the launch context once 21Board has introduced itself. */
    ready: function () { return readyPromise; },

    /** The launch context (null until ready). */
    get context() { return context; },

    /** true when running inside 21Board, false when standalone. */
    get embedded() { return !!context && !standalone; },

    /** 'light' or 'dark'. */
    get theme() { return context ? context.theme : 'light'; },

    /** Subscribe: 'data', 'config', 'theme', 'resize', 'focus', 'blur', 'menu', 'beforeclose'. Returns an unsubscribe function. */
    on: function (event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return function () { Board21.off(event, fn); };
    },
    off: function (event, fn) {
      listeners[event] = (listeners[event] || []).filter(function (f) { return f !== fn; });
    },

    // ---- Content: this instance's saved state. NOT included in template exports.
    load: function () { return readyPromise.then(function () { return clone(context.data); }); },
    save: function (data) {
      var safe = jsonSafe(data, 'save() data');
      if (context) context.data = safe;
      return request('save', { data: safe });
    },

    // ---- Config: this instance's preferences. Included in template exports.
    loadConfig: function () { return readyPromise.then(function () { return clone(context.config); }); },
    saveConfig: function (config) {
      var safe = jsonSafe(config, 'saveConfig() config');
      if (context) context.config = safe;
      return request('saveConfig', { config: safe });
    },

    // ---- Window control. Sizes are the content area (excluding the title bar), in CSS px.
    window: {
      setSize: function (width, height) { return windowOp('setSize', [width, height]); },
      setAspectRatio: function (ratio) { return windowOp('setAspectRatio', [ratio || null]); },
      setMinSize: function (width, height) { return windowOp('setMinSize', [width, height]); },
      setMaxSize: function (width, height) { return windowOp('setMaxSize', [width || null, height || null]); },
      setResizable: function (resizable) { return windowOp('setResizable', [resizable !== false]); },
      /** false while your widget needs drags itself (e.g. an editing view); true to let the window be dragged from inside. */
      setDragFromContent: function (on) { return windowOp('setDragFromContent', [on !== false]); },
      setTitle: function (subtitle) { return windowOp('setTitle', [subtitle == null ? '' : String(subtitle)]); },
      focus: function () { return windowOp('focus'); },
      maximize: function () { return windowOp('maximize'); },
      restore: function () { return windowOp('restore'); },
      close: function () { return windowOp('close'); },
      /** Pulse the title bar to get the teacher's attention (e.g. timer finished). */
      requestAttention: function () { return windowOp('attention'); },
      getInfo: function () { return request('getInfo', {}); }
    },

    // ---- Window menu: extra items shown above Reset / Close.
    menu: {
      /** items: [{ id, label, icon?: '<svg…>', checked?: bool, disabled?: bool, separator?: bool }
       *          | { heading: true, label }                                           (a small section label)
       *          | { label, swatches: [{ id, label, color: '#hex', background?: '#hex', checked?: bool }] }]  (a row of colors) */
      set: function (items) {
        menuItems = (items || []).map(function (i) {
          i = i || {};
          if (i.heading) return { heading: true, label: String(i.label || '') };
          if (Array.isArray(i.swatches)) return { id: String(i.id || ''), label: String(i.label || ''), swatches: i.swatches.map(function (s) {
            return { id: String(s.id || ''), label: String(s.label || ''), color: String(s.color || ''), background: s.background ? String(s.background) : undefined, checked: !!s.checked };
          }) };
          return { id: String(i.id || ''), label: String(i.label || ''), icon: i.icon || '', checked: i.checked == null ? undefined : !!i.checked, disabled: !!i.disabled, separator: !!i.separator };
        });
        return readyPromise.then(function () { post('menu', { items: menuItems }); renderStandaloneMenu(); });
      },
      clear: function () { return Board21.menu.set([]); }
    },

    /** Show a short message from the board. */
    toast: function (text) {
      return readyPromise.then(function () {
        if (standalone) console.info('[21Board toast] ' + text); else post('toast', { text: String(text) });
      });
    }
  };

  Object.defineProperty(Board21, 'page', { value: document.documentElement });
  window.Board21 = Board21;
})();
