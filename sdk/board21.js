/*
 * 21Board Widget SDK  (window.Board21)
 * ======================================
 * Include this in every widget, before your own scripts:
 *
 *     <script src="../../sdk/board21.js"></script>
 *
 * Then:
 *
 *     const ctx  = await Board21.ready();      // { appId, instance, data, config, theme, ... }
 *     render(ctx.data);
 *     Board21.on('data', render);             // content changed in another 21Board tab / import
 *     button.onclick = () => Board21.save({ count: ++count });
 *
 * Full reference: docs/WIDGET-SDK.md
 *
 * Talks to the board with window.postMessage, so a widget never touches
 * IndexedDB itself. If the page is opened on its own (not inside 21Board) the
 * SDK runs in "standalone" mode: data goes to localStorage and window calls
 * are ignored, so you can develop and test a widget by opening its file.
 */
(function () {
  'use strict';
  if (window.Board21) return;

  var SDK_VERSION = '1.0.0';
  var PROTOCOL = 1;
  var embedded = window.parent && window.parent !== window;
  // file:// pages have opaque origins, so messages to the board can't be origin-restricted there.
  var targetOrigin = (location.protocol !== 'file:' && location.origin && location.origin !== 'null') ? location.origin : '*';

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
  var STANDALONE_KEY = '21board:standalone:' + location.pathname;

  function standaloneStore() {
    try { return JSON.parse(localStorage.getItem(STANDALONE_KEY)) || {}; } catch (e) { return {}; }
  }

  function standaloneRequest(type, payload) {
    var s = standaloneStore();
    if (type === 'save') s.data = payload.data;
    else if (type === 'saveConfig') s.config = payload.config;
    else if (type === 'getInfo') return Promise.resolve(windowInfo());
    else return Promise.resolve(null);
    try { localStorage.setItem(STANDALONE_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
    return Promise.resolve(true);
  }

  function windowInfo() {
    return { width: window.innerWidth, height: window.innerHeight, maximized: false, focused: document.hasFocus() };
  }

  function startStandalone() {
    if (context) return;
    standalone = true;
    var s = standaloneStore();
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = dark ? 'dark' : 'light';
    var m = location.pathname.match(/apps\/([^/]+)\//);
    context = {
      standalone: true, sdkVersion: SDK_VERSION, boardVersion: null,
      appId: m ? m[1] : 'standalone', appName: document.title || 'Widget', instance: 1,
      data: s.data === undefined ? null : s.data, config: s.config === undefined ? null : s.config,
      theme: theme, palette: PALETTES[theme], window: windowInfo(),
      locale: navigator.language || 'en-US', devMode: true
    };
    applyTheme(theme);
    window.addEventListener('resize', function () { emit('resize', windowInfo()); });
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
        if (item) emit('menu', id, item);
      });
      document.body.appendChild(standaloneMenuBtn);
    }
    var opt = function (id, label, checked) {
      return '<option value="' + String(id).replace(/"/g, '&quot;') + '">' + (checked ? '✓ ' : '') + String(label).replace(/</g, '&lt;') + '</option>';
    };
    standaloneMenuBtn.innerHTML = '<option value="">Menu ▾</option>' + menuItems.map(function (i) {
      if (i.separator) return '';
      if (i.heading) return '<option disabled>— ' + String(i.label).replace(/</g, '&lt;') + ' —</option>';
      if (i.swatches) return i.swatches.map(function (s) { return opt(s.id, i.label + ': ' + s.label, s.checked); }).join('');
      return opt(i.id, i.label, i.checked);
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

  if (embedded) {
    // Avoid a flash of the wrong theme: peek at the host synchronously when same-origin.
    try {
      var host = window.parent.__board21Host;
      if (host && host.theme) applyTheme(host.theme, host.palette);
    } catch (e) { /* cross-origin host: wait for init */ }

    post('hello', { sdkVersion: SDK_VERSION, protocol: PROTOCOL });
    // Tapping anywhere in the app brings its window to the front.
    window.addEventListener('pointerdown', function () { post('activate'); }, true);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') post('key', { key: 'Escape' }); }, true);
    // If no 21Board answers (e.g. framed by something else), fall back to standalone.
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
      /** false while your app needs drags itself (e.g. an editing view); true to let the window be dragged from inside. */
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

  window.Board21 = Board21;
})();
