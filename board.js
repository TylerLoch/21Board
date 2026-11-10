/*
 * 21Board — board shell
 * =====================
 * The "operating system" that hosts widgets. Sections:
 *
 *   1. Constants, icons, helpers
 *   2. Widget catalog            (widgets/registry.js + developer test widgets)
 *   3. Storage                (IndexedDB: one object store of JSON records)
 *   4. Cross-tab sync         (BroadcastChannel, localStorage fallback)
 *   5. Board state + record application
 *   6. Geometry               (fitting, snapping/overlap resistance, placement)
 *   7. Windows                (Win class, SDK message handling)
 *   8. Window actions         (open / close / focus / maximize / reset / delete)
 *   9. Pointer interactions   (drag + resize, multi-touch aware)
 *  10. Widget Picker panel
 *  11. Window menu
 *  12. Settings
 *  13. Export / Import       (.21board files)
 *  14. Dialogs and toasts
 *  15. PWA                   (service worker, persistence, file launch)
 *  16. Boot
 *
 * Data format: docs/DATA-FORMAT.md     Widget SDK: docs/WIDGET-SDK.md
 */
(() => {
  'use strict';

  // =====================================================================
  // 1. Constants, icons, helpers
  // =====================================================================
  const BOARD_VERSION = '1.0.0';
  const SDK_PROTOCOL = 1;
  const FORMAT_VERSION = 1;
  // Widget test mode ("lab"): the widget dev window (sdk/board21-dev.js) runs this board in a frame with one
  // widget given as HTML source, e.g. inside an AI tool's preview. Its data is kept apart from real boards
  // (another database, or memory where storage is blocked) and nothing is installed or cached.
  // See section 15 and docs/WIDGET-SDK.md, "Testing a widget".
  const LAB = (() => {
    try {
      const el = location.protocol === 'about:' && document.getElementById('b21-lab');
      const v = el ? JSON.parse(el.textContent) : null;
      return v && v.widget && typeof v.src === 'string' ? v : null;
    } catch (e) { return null; }
  })();
  const DB_NAME = LAB ? '21Board-dev' : '21Board';
  const DB_STORE = 'records';
  const TITLE_H = 40;          // window title bar height (px)
  const GAP = 8;               // spacing used when windows snap next to each other
  const ALIGN_SNAP = 12;       // distance at which edges align to neighbours
  const DRAG_THRESHOLD = 6;    // px of movement before a tap becomes a drag
  const RESISTANCE = { gentle: 40, normal: 80, strong: 150 }; // px of push needed to overlap
  const TAB_ID = Math.random().toString(36).slice(2, 10);
  // Opened straight from disk (file://), every page has an opaque origin, so messages can't be origin-restricted.
  const ORIGIN = (location.protocol !== 'file:' && location.origin && location.origin !== 'null') ? location.origin : '*';
  const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';

  const PALETTES = {
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

  const DEFAULT_SETTINGS = {
    theme: 'light',          // 'light' | 'dark' | 'system'
    snapping: true,          // snap + resist overlap while dragging
    resistance: 'normal',    // 'gentle' | 'normal' | 'strong'
    pickerCorners: 'both',   // 'both' | 'left' | 'right'
    accent: 'blue',          // accent color: a key of ACCENTS
    dragFromContent: true,   // move windows by dragging inside them (see section 9a)
    devMode: false,
    devWidgets: [],             // [{ id, name, entry }] test widgets added in Developer mode
    activeBoard: 1,
    lastBackupAt: null,      // when a full backup was last exported (ms), for backup reminders
    historyEvery: 10,        // Board history: save a version at most every N minutes while the board changes (0 = off)
    historyFolder: true      // Board history: also keep copies in the linked Google Drive folder (about one an hour)
  };
  // layout: the screen size (CSS px) the board is laid out for; window rects are stored in this space.
  const defaultBoard = (id = 1) => ({ id, name: 'My Board', background: { color: null, pattern: 'none' }, layout: null });

  // Accent colors: [light theme, dark theme]. Light shades keep white text readable (≥4.5:1);
  // dark shades are lighter so they stand out on dark surfaces.
  const ACCENTS = {
    blue: ['#2563eb', '#60a5fa', 'Blue'], purple: ['#7c3aed', '#a78bfa', 'Purple'], pink: ['#db2777', '#f472b6', 'Pink'],
    red: ['#dc2626', '#f87171', 'Red'], orange: ['#c2410c', '#fb923c', 'Orange'], green: ['#15803d', '#4ade80', 'Green'],
    teal: ['#0f766e', '#2dd4bf', 'Teal'], slate: ['#475569', '#94a3b8', 'Slate']
  };
  function mixHex(a, b, t) { // t = share of b
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
    return '#' + [16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('');
  }
  // Only real entries count ("constructor", "__proto__" etc. from a crafted file must not).
  const accentOf = key => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(ACCENTS, key)) ? ACCENTS[key] : null;
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
  // The palette widgets receive (--b21-* variables), with the chosen accent applied.
  function paletteFor(theme) {
    const base = Object.assign({}, PALETTES[theme]);
    const a = accentOf(S.settings.accent);
    if (!a || S.settings.accent === 'blue') return base; // blue is the built-in default
    const c = theme === 'dark' ? a[1] : a[0];
    base.accent = c;
    base['accent-soft'] = theme === 'dark' ? rgba(c, 0.18) : mixHex(c, '#ffffff', 0.9);
    return base;
  }
  // Board chrome: override the CSS color tokens for a non-default accent.
  function applyAccent(theme) {
    const st = document.body.style;
    const names = ['--primary', '--primary-soft', '--active-bg', '--focus-ring', '--focus-title', '--label-open'];
    const a = accentOf(S.settings.accent);
    if (!a || S.settings.accent === 'blue') { names.forEach(n => st.removeProperty(n)); return; }
    const dark = theme === 'dark', c = dark ? a[1] : a[0];
    st.setProperty('--primary', c);
    st.setProperty('--focus-ring', c);
    st.setProperty('--primary-soft', rgba(c, dark ? 0.18 : 0.12));
    st.setProperty('--active-bg', dark ? rgba(c, 0.2) : mixHex(c, '#ffffff', 0.92));
    st.setProperty('--focus-title', dark ? mixHex(c, '#1e1e1e', 0.8) : mixHex(c, '#ffffff', 0.92));
    st.setProperty('--label-open', dark ? rgba(c, 0.32) : mixHex(c, '#ffffff', 0.8));
  }

  const BG_SWATCHES = [
    ['#ffffff', 'White'], ['#faf7f0', 'Paper'], ['#e0f2fe', 'Sky'], ['#dcfce7', 'Mint'], ['#fce7f3', 'Blush'],
    ['#ede9fe', 'Lavender'], ['#fef3c7', 'Sand'], ['#334155', 'Slate'], ['#1f3a2c', 'Chalkboard'], ['#1e293b', 'Navy'], ['#0a0a0a', 'Black']
  ];

  const ICONS = {
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5.5-5.5L6 20"/>',
    waffle: '<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2"/><rect x="16" y="16" width="5" height="5" rx="1.2"/>',
    export: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', // arrow leaving the tray
    import: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', // arrow coming in
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    gear: '<path d="M19.23 9.66L19.41 10.30L21.92 10.75L21.92 13.25L19.41 13.70L18.77 15.46L18.44 16.04L19.90 18.13L18.13 19.90L16.04 18.44L14.34 19.23L13.70 19.41L13.25 21.92L10.75 21.92L10.30 19.41L8.54 18.77L7.96 18.44L5.87 19.90L4.10 18.13L5.56 16.04L4.77 14.34L4.59 13.70L2.08 13.25L2.08 10.75L4.59 10.30L5.23 8.54L5.56 7.96L4.10 5.87L5.87 4.10L7.96 5.56L9.66 4.77L10.30 4.59L10.75 2.08L13.25 2.08L13.70 4.59L15.46 5.23L16.04 5.56L18.13 4.10L19.90 5.87L18.44 7.96Z"/><circle cx="12" cy="12" r="3.2"/>',
    fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    fullscreenExit: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    reset: '<path d="M4.87 11.48A7.5 7.5 0 1 0 13.19 6.4"/><path d="M7.2 6.3L12 2.3L12 10.3Z" fill="currentColor" stroke-width="1.5"/>', // open circle: a gap behind the arrow
    maximize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    restore: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    open: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    widget: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    windows: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.5v4h4"/><path d="M12 7.5V12l3 2"/>',   // clock with a back arrow
    send: '<path d="M7 18.5H6.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.6 8.1 4.5 4.5 0 0 1 17.5 18.5H17"/><path d="M12 20.5v-8"/><path d="M8.8 15.2L12 12l3.2 3.2"/>' // cloud with an arrow going up
  };
  const svg = (name, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ''}</svg>`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = v => (v === undefined || v === null) ? null : JSON.parse(JSON.stringify(v));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const ikeyOf = (widgetId, n) => `${widgetId}:${n}`;
  const newId = () => (self.crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  const UID_RE = /^[A-Za-z0-9-]{8,64}$/;
  const sameJSON = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  // A short fingerprint of a string (cyrb53; not for security).
  function hash53(text) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  // A fingerprint of a board's content (a full export): to tell whether it changed since it was sent, loaded
  // or saved as a version. Not the window stacking order (tapping a window to bring it forward isn't a change).
  function boardSig(exp) {
    const m = exp.media && exp.media.background;
    return hash53(JSON.stringify([exp.board, exp.theme, exp.accent, exp.instances.map(i => { const o = Object.assign({}, i, { z: 0 }); delete o.createdAt; return o; }),
      m ? [m.bytes, m.addedAt, m.w, m.h, exp.media.look] : null]));
  }
  const fmtBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`;

  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  // Widgets may supply SVG icons for their menu items. Keep only harmless SVG.
  // A plain CSS color from a widget (hex, rgb() or hsl()), safe to put in a style attribute; '' otherwise.
  function safeColor(c) {
    return typeof c === 'string' && (/^#[0-9a-f]{3,8}$/i.test(c) || /^(rgb|hsl)a?\([\d\s.,%+-]+\)$/i.test(c)) ? c : '';
  }

  function safeSVG(markup) {
    if (typeof markup !== 'string' || !/^\s*<svg[\s>]/i.test(markup) || markup.length > 8000) return '';
    try {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      const root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return '';
      root.querySelectorAll('script, foreignObject, iframe, image, use').forEach(n => n.remove());
      [root, ...root.querySelectorAll('*')].forEach(node => {
        for (const a of Array.from(node.attributes)) {
          if (/^on/i.test(a.name) || /javascript:/i.test(a.value) || /href$/i.test(a.name)) node.removeAttribute(a.name);
        }
      });
      root.setAttribute('aria-hidden', 'true');
      return root.outerHTML;
    } catch (e) { return ''; }
  }

  // =====================================================================
  // 2. Widget catalog
  // =====================================================================
  function normalizeWidget(a, extra = {}) {
    if (!a || typeof a !== 'object' || !ID_RE.test(a.id || '') || typeof a.entry !== 'string') return null;
    const w = a.window || {};
    const pos = (v, d) => (typeof v === 'number' && v > 0 && isFinite(v)) ? v : d;
    const ratio = v => { const m = typeof v === 'string' && v.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/); return m ? pos(m[1] / m[2], null) : pos(v, null); };   // 1.5 or "4:3"
    return {
      id: a.id,
      name: String(a.name || a.id),
      description: String(a.description || ''),
      version: String(a.version || ''),
      entry: a.entry,
      srcdoc: typeof a.srcdoc === 'string' ? a.srcdoc : null,   // test mode: the widget's HTML itself
      files: Array.isArray(a.files) ? a.files : [a.entry],
      icon: typeof a.icon === 'string' && /^\s*<svg/i.test(a.icon) ? a.icon : `<svg viewBox="0 0 24 24">${ICONS.widget}</svg>`,
      color: /^#[0-9a-f]{3,8}$/i.test(a.color || '') ? a.color : '#64748b',
      permissions: Array.isArray(a.permissions) ? a.permissions.filter(p => /^[a-z-]+$/.test(p)) : [],
      devOnly: !!a.devOnly,
      dev: !!extra.dev,
      win: {
        width: pos(w.width, 400), height: pos(w.height, 300),
        minWidth: pos(w.minWidth, 160), minHeight: pos(w.minHeight, 100),
        maxWidth: pos(w.maxWidth, Infinity), maxHeight: pos(w.maxHeight, Infinity),
        aspectRatio: ratio(w.aspectRatio), resizable: w.resizable !== false,
        // true: click-only widget, can be moved by dragging anywhere inside it.
        // false: the widget needs drags itself (typing/selecting text, drawing): title bar or two fingers.
        dragFromContent: w.dragFromContent !== false
      }
    };
  }

  const REGISTRY = (LAB ? [Object.assign({}, LAB.widget, { entry: 'about:srcdoc', srcdoc: LAB.src })] : (self.BOARD21_WIDGETS || []))
    .map(a => normalizeWidget(a)).filter(Boolean);
  let catalog = new Map(REGISTRY.map(a => [a.id, a]));

  function rebuildCatalog() {
    catalog = new Map(REGISTRY.map(a => [a.id, a]));
    for (const d of (LAB ? [] : S.settings.devWidgets || [])) {
      const widget = normalizeWidget({ id: d.id, name: d.name, entry: d.entry, color: '#64748b', description: 'Developer test widget' }, { dev: true });
      if (widget && !catalog.has(widget.id)) catalog.set(widget.id, widget);
    }
  }
  const getWidget = id => catalog.get(id) || null;
  const pickerWidgets = () => Array.from(catalog.values())
    .filter(a => S.settings.devMode || (!a.devOnly && !a.dev))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // =====================================================================
  // 3. Storage — IndexedDB
  // ---------------------------------------------------------------------
  // Database "21Board", object store "records" (keyPath "key"). Every record:
  //   { key, type, rev, updatedAt, by, value }
  // Keys:
  //   settings                        board-wide preferences
  //   board:<b>                       board <b> (name, background)
  //   inst:<b>:<widgetId>:<n>            window/instance n of a widget (geometry, open/closed, z)
  //   data:<b>:<widgetId>:<n>            that instance's content   (Board21.save)
  //   conf:<b>:<widgetId>:<n>            that instance's config    (Board21.saveConfig)
  // =====================================================================
  const Keys = {
    settings: 'settings',
    board: b => `board:${b}`,
    inst: (b, ik) => `inst:${b}:${ik}`,
    data: (b, ik) => `data:${b}:${ik}`,
    conf: (b, ik) => `conf:${b}:${ik}`,
    media: (b, name) => `media:${b}:${name}`,   // big binary-ish things (the background photo), kept apart so sync can skip them
    link: name => `link:${name}`,                // this device's link to a shared folder (section 13b); never exported
    parse(key) {
      const p = String(key).split(':');
      if (p[0] === 'settings') return { kind: 'settings' };
      if (p[0] === 'board' && p.length === 2) return { kind: 'board', board: +p[1] };
      if (p[0] === 'media' && p.length === 3) return { kind: 'media', board: +p[1], name: p[2] };
      if (p[0] === 'link' && p.length === 2) return { kind: 'link', name: p[1] };
      if ((p[0] === 'inst' || p[0] === 'data' || p[0] === 'conf') && p.length === 4) {
        return { kind: p[0], board: +p[1], widgetId: p[2], n: +p[3], ikey: `${p[2]}:${p[3]}` };
      }
      return { kind: 'unknown' };
    }
  };

  // Test mode where the preview blocks storage: the same records, kept in memory until the page reloads.
  const MemDB = {
    map: new Map(),
    tx(fn) {
      return new Promise((resolve, reject) => {
        const queue = [];
        let result;
        const req = run => { const r = { result: undefined, onsuccess: null }; queue.push(() => { r.result = run(); if (r.onsuccess) r.onsuccess(); }); return r; };
        const hit = (k, q) => (q && typeof q === 'object' && 'lower' in q ? k >= q.lower && k <= q.upper : k === q);
        const s = {
          getAll: () => req(() => Array.from(this.map.keys()).sort().map(k => clone(this.map.get(k)))),
          get: k => req(() => clone(this.map.get(k))),
          put: v => req(() => { this.map.set(v.key, clone(v)); }),
          delete: q => req(() => { for (const k of Array.from(this.map.keys())) if (hit(k, q)) this.map.delete(k); }),
          clear: () => req(() => { this.map.clear(); })
        };
        try { fn(s, v => { result = v; }); } catch (err) { reject(err); return; }
        Promise.resolve().then(() => { while (queue.length) queue.shift()(); resolve(result); });
      });
    }
  };

  const Store = {
    db: null,
    opening: null,
    failed: false,
    mem: null,           // MemDB in test mode when IndexedDB is blocked

    open() {
      if (this.db) return Promise.resolve(this.db);
      if (this.opening) return this.opening;
      this.opening = new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (err) { this.opening = null; reject(err); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'key' });
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); this.db = null; };
          db.onclose = () => { this.db = null; };
          this.db = db; this.opening = null; resolve(db);
        };
        req.onerror = () => { this.opening = null; reject(req.error); };
        req.onblocked = () => console.warn('21Board: database upgrade blocked by another tab.');
      });
      return this.opening;
    },

    // Run fn(objectStore, setResult) in a transaction; resolves when it completes.
    async tx(mode, fn, retry = true) {
      if (this.mem) return this.mem.tx(fn);
      if (this.failed) return mode === 'readonly' ? undefined : null;
      const db = await this.open();
      try {
        return await new Promise((resolve, reject) => {
          const t = db.transaction(DB_STORE, mode);
          let result;
          fn(t.objectStore(DB_STORE), v => { result = v; });
          t.oncomplete = () => resolve(result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error || new Error('Transaction aborted'));
        });
      } catch (err) {
        if (retry && err && (err.name === 'InvalidStateError' || /clos/i.test(err.message || ''))) {
          this.db = null;
          return this.tx(mode, fn, false);
        }
        throw err;
      }
    },

    async getAll() {
      const r = await this.tx('readonly', (s, set) => { const q = s.getAll(); q.onsuccess = () => set(q.result); });
      return r || [];
    },

    async getMany(keys) {
      const r = await this.tx('readonly', (s, set) => {
        const out = new Array(keys.length);
        keys.forEach((k, i) => { const q = s.get(k); q.onsuccess = () => { out[i] = q.result; }; });
        set(out);
      });
      return r || new Array(keys.length);
    }
  };

  // Revisions of records as this tab last saw them. Used to ignore stale/echoed sync messages.
  const Known = new Map();

  // Coalescing writer: every change is queued, then written in one transaction.
  // Rapid saves of the same key collapse into one write; order is preserved.
  const Writer = {
    pending: new Map(),   // key -> { type, value } | { del: true }
    waiters: [],
    running: false,
    idle: [],             // settled() waiters
    retried: false,
    // Resolves (true) once nothing is waiting to be written, or (false) after timeoutMs.
    settled(timeoutMs = 1000) {
      if (!this.running && !this.pending.size) return Promise.resolve(true);
      return new Promise(res => { const t = setTimeout(() => res(false), timeoutMs); this.idle.push(() => { clearTimeout(t); res(true); }); });
    },

    put(key, type, value) { this.pending.set(key, { type, value: clone(value) }); return this.kick(); },
    del(key) { this.pending.set(key, { del: true }); return this.kick(); },

    kick() {
      return new Promise((resolve, reject) => {
        this.waiters.push({ resolve, reject });
        if (!this.running) Promise.resolve().then(() => this.run());
      });
    },

    async run() {
      if (this.running) return;
      this.running = true;
      while (this.pending.size) {
        const batch = this.pending; this.pending = new Map();
        const waiters = this.waiters; this.waiters = [];
        try {
          const written = await Store.tx('readwrite', (s, set) => {
            const out = [];
            for (const [key, op] of batch) {
              if (op.del) { s.delete(key); out.push({ key, deleted: true }); continue; }
              const g = s.get(key);
              g.onsuccess = () => {
                const rec = { key, type: op.type, rev: Math.max(((g.result && g.result.rev) || 0) + 1, Date.now()), updatedAt: Date.now(), by: TAB_ID, value: op.value };
                s.put(rec);
                out.push(rec);
              };
            }
            set(out);
          }) || [];
          for (const r of written) { if (r.deleted) Known.delete(r.key); else Known.set(r.key, r.rev); }
          if (written.length) { const keys = written.map(r => r.key); Sync.announce(keys); Link.changed(keys); BoardHistory.changed(keys); }
          this.retried = false;
          waiters.forEach(w => w.resolve(true));
        } catch (err) {
          // Out of space: make room by thinning board history, then try once more.
          if (err && err.name === 'QuotaExceededError' && !this.retried) {
            this.retried = true;
            try { await BoardHistory.shrink(); } catch (e) { /* nothing to free */ }
            for (const [k, op] of batch) if (!this.pending.has(k)) this.pending.set(k, op);
            this.waiters.unshift(...waiters);
            continue;
          }
          this.retried = false;
          console.error('21Board: save failed', err);
          toast('Could not save changes. Storage may be full or blocked.');
          waiters.forEach(w => w.reject(err));
        }
      }
      this.running = false;
      const idle = this.idle; this.idle = [];
      idle.forEach(f => f());
    }
  };
  // The newest record revision this tab knows (a write must be newer, even if the clock went back).
  function maxKnownRev() { let m = 0; for (const v of Known.values()) if (v > m) m = v; return m; }

  // =====================================================================
  // 4. Cross-tab sync
  // ---------------------------------------------------------------------
  // Same idea as 21Sketch (write to IndexedDB, then ping other tabs), but
  // per record: after a write commits, other open copies of 21Board are told
  // which keys changed, re-read just those records, and apply them. Revisions
  // stop stale or echoed updates. Changes that arrive while the user is in the
  // middle of dragging/resizing are held until the gesture ends.
  // =====================================================================
  const Sync = {
    chan: null,
    init() {
      if ('BroadcastChannel' in self) {
        this.chan = new BroadcastChannel(LAB ? '21board-dev-sync' : '21board-sync');
        this.chan.onmessage = e => this.receive(e.data);
      } else {
        window.addEventListener('storage', e => {
          if (e.key !== '21board-sync' || !e.newValue) return;
          try { this.receive(JSON.parse(e.newValue)); } catch (err) { /* ignore */ }
        });
      }
    },
    announce(keys, extra) {
      const msg = Object.assign({ tab: TAB_ID, keys: keys || [], t: Date.now() }, extra || {});
      try {
        if (this.chan) this.chan.postMessage(msg);
        else localStorage.setItem('21board-sync', JSON.stringify(msg));
      } catch (err) { /* sync is best-effort; visibility resync covers gaps */ }
    },
    receive(msg) {
      if (!msg || msg.tab === TAB_ID) return;
      if (msg.op === 'reload') { if (msg.erased) Link.forget(); if (Inter.active) Inter.deferredRebuild = true; else rebuildAll(); return; }
      if (msg.op === 'history') { BoardHistory.reload().then(() => { HistorySheet.refresh(); updateHint(); }); return; }
      if (msg.op === 'reset' && msg.board === S.boardId && msg.ikey) {
        S.data.delete(msg.ikey); S.conf.delete(msg.ikey);
        const w = S.wins.get(msg.ikey); if (w) w.reload();
      }
      if (Array.isArray(msg.keys) && msg.keys.length) {
        if (Inter.active) msg.keys.forEach(k => Inter.deferredKeys.add(k));
        else applyKeys(msg.keys);
      }
    }
  };

  // =====================================================================
  // 5. Board state + record application
  // =====================================================================
  const S = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    boardId: 1,
    board: defaultBoard(1),
    insts: new Map(),   // ikey -> { widgetId, n, open, rect:{x,y,w,h}, z, maximized, createdAt }
    data: new Map(),    // ikey -> content
    media: new Map(),   // name -> { data: 'data:image/…', w, h, bytes, name } (the background photo)
    conf: new Map(),    // ikey -> config
    wins: new Map(),    // ikey -> Win
    focused: null,
    deselected: false,  // true after tapping the empty board: no window is focused (and no grips show)
    appliedTheme: null,
    sw: { state: 'checking', version: null, updateReady: null }
  };

  async function applyKeys(keys) {
    let recs;
    try { recs = await Store.getMany(keys); } catch (err) { console.warn('21Board: sync read failed', err); return; }
    keys.forEach((k, i) => applyRecord(k, recs[i]));
    afterBulkApply();
  }

  // Bring this tab in line with whatever is in IndexedDB.
  async function reloadAll() {
    let recs;
    try { recs = await Store.getAll(); } catch (err) { console.warn('21Board: reload failed', err); return; }
    const order = { settings: 0, board: 1, conf: 2, data: 2, inst: 3 };
    recs.sort((a, b) => (order[Keys.parse(a.key).kind] ?? 9) - (order[Keys.parse(b.key).kind] ?? 9));
    const present = new Set();
    for (const r of recs) { present.add(r.key); applyRecord(r.key, r); }
    for (const key of Array.from(Known.keys())) if (!present.has(key)) applyRecord(key, undefined);
    afterBulkApply();
  }

  async function rebuildAll() {
    Menu.close();
    for (const w of S.wins.values()) w.destroy();
    S.wins.clear(); S.insts.clear(); S.data.clear(); S.conf.clear(); S.media.clear(); Known.clear();
    S.focused = null;
    S.settings = Object.assign({}, DEFAULT_SETTINGS);
    S.board = defaultBoard(S.boardId);
    await reloadAll();
    updateZoom();
    migrateBoard();
    ensureUid();
    applySettings(); applyBoard();
  }
  // Every board has a unique id (board.uid), so a file sent from another device can be matched to it.
  function ensureUid() { if (!UID_RE.test(S.board.uid || '')) updateBoard({ uid: newId() }); }

  function applyRecord(key, rec) {
    if (rec) {
      if (Known.has(key) && rec.rev <= Known.get(key)) return;
      Known.set(key, rec.rev);
    } else {
      if (!Known.has(key)) return;
      Known.delete(key);
    }
    const k = Keys.parse(key);
    const value = rec ? rec.value : null;
    switch (k.kind) {
      case 'settings':
        S.settings = Object.assign({}, DEFAULT_SETTINGS, value || {});
        applySettings();
        break;
      case 'board':
        if (k.board !== S.boardId) break;
        S.board = Object.assign(defaultBoard(S.boardId), value || {});
        S.board.layout = validLayout(S.board.layout);
        S.board.background = Object.assign({ color: null, pattern: 'none' }, (value && value.background) || {});
        delete S.board.background.image;
        applyBoard();
        break;
      case 'media':
        if (k.board !== S.boardId) break;
        if (value) S.media.set(k.name, value); else S.media.delete(k.name);
        if (k.name === 'background' || k.name === 'background-look') { BoardPhoto.render(); if (Settings.isOpen) Settings.render(); }
        break;
      case 'link': Link.applyRecord(k.name, value); break;
      case 'inst':
        if (k.board !== S.boardId) break;
        if (value) S.insts.set(k.ikey, normalizeInst(value, k)); else S.insts.delete(k.ikey);
        reconcileWin(k.ikey);
        break;
      case 'data':
      case 'conf': {
        if (k.board !== S.boardId) break;
        const map = k.kind === 'data' ? S.data : S.conf;
        if (value === null || value === undefined) map.delete(k.ikey); else map.set(k.ikey, value);
        const w = S.wins.get(k.ikey);
        if (w) w.post(k.kind === 'data' ? 'data' : 'config', k.kind === 'data' ? { data: value, reason: 'remote' } : { config: value, reason: 'remote' });
        break;
      }
    }
  }

  function afterBulkApply() {
    updateFocus();
    Picker.render();
    updateHint();
    if (Settings.isOpen) Settings.render();
  }

  function normalizeInst(v, k) {
    const r = v.rect || {};
    return {
      widgetId: k ? k.widgetId : v.widgetId,
      n: k ? k.n : v.n,
      open: !!v.open,
      rect: { x: num(r.x, 40), y: num(r.y, 40), w: Math.max(20, num(r.w, 400)), h: Math.max(TITLE_H + 10, num(r.h, 340)) },
      z: num(v.z, 1),
      maximized: !!v.maximized,
      createdAt: num(v.createdAt, Date.now())
    };
  }

  function saveInst(ikey, inst) {
    const prev = S.insts.get(ikey);
    S.insts.set(ikey, inst);
    if (prev && sameJSON(prev, inst) && Known.has(Keys.inst(S.boardId, ikey))) return Promise.resolve();
    return Writer.put(Keys.inst(S.boardId, ikey), 'inst', inst);
  }

  function updateSettings(patch) {
    S.settings = Object.assign({}, S.settings, patch);
    applySettings();
    Writer.put(Keys.settings, 'settings', S.settings);
    if (Settings.isOpen) Settings.render();
  }

  function updateBoard(patch) {
    S.board = Object.assign({}, S.board, patch);
    applyBoard();
    Writer.put(Keys.board(S.boardId), 'board', S.board);
  }

  const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  const resolvedTheme = () => S.settings.theme === 'system' ? (mqDark.matches ? 'dark' : 'light') : (S.settings.theme === 'dark' ? 'dark' : 'light');

  let lastCatalogSig = '';
  function applySettings() {
    const theme = resolvedTheme();
    document.body.classList.toggle('dark', theme === 'dark');
    applyAccent(theme);
    const palette = paletteFor(theme);
    window.__board21Host = { theme, palette, version: BOARD_VERSION };
    const themeSig = theme + '|' + S.settings.accent;
    if (themeSig !== S.appliedTheme) {
      const themeChanged = !S.appliedTheme || S.appliedTheme.split('|')[0] !== theme;
      S.appliedTheme = themeSig;
      for (const w of S.wins.values()) w.post('theme', { theme, palette });
      if (themeChanged) applyBoard();
    }
    const corners = S.settings.pickerCorners;
    Picker.btns.left.hidden = corners === 'right';
    Picker.btns.right.hidden = corners === 'left';
    if (Picker.side && Picker.btns[Picker.side].hidden) Picker.close();
    const sig = JSON.stringify([S.settings.devMode, S.settings.devWidgets]);
    if (sig !== lastCatalogSig) {
      lastCatalogSig = sig;
      rebuildCatalog();
      for (const ikey of S.insts.keys()) reconcileWin(ikey);
    }
    Picker.renderControls();
    Picker.render();
    scheduleLayoutAll(); // "Scale the board to fit the screen" may have changed
  }

  function applyBoard() {
    scheduleLayoutAll(); // the layout size may have changed
    const bg = S.board.background || {};
    const desk = $('#desk');
    desk.style.backgroundColor = bg.color || '';
    desk.classList.remove('pattern-dots', 'pattern-grid', 'pattern-lines');
    if (['dots', 'grid', 'lines'].includes(bg.pattern)) desk.classList.add('pattern-' + bg.pattern);
    const darkBg = bg.color ? luminance(bg.color) < 0.3 : resolvedTheme() === 'dark';
    desk.style.setProperty('--pattern', darkBg ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.09)');
    desk.style.setProperty('--hint', darkBg ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)');
    desk.style.setProperty('--margin-shade', darkBg ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = bg.color || (resolvedTheme() === 'dark' ? '#121212' : '#f3f4f6');
    BoardPhoto.render();
  }

  // ---------------------------------------------------------------------
  // Background photo. Everything about it is device-local and lives in two media records, apart from
  // board:<b>, so a sync can skip media:* and each device keeps (or doesn't have) its own photo:
  //   media:<b>:background       the picture  { data: 'data:image/…;base64,…', w, h, bytes, name, addedAt }
  //   media:<b>:background-look  how it's shown { on, fit: 'fill' | 'whole', focus: { x, y } (0–1), fade: 0–0.7 }
  // No picture on this device → the board shows its color.
  // ---------------------------------------------------------------------
  const PHOTO_MAX_SIDE = 2560;            // longest side kept…
  const PHOTO_MIN_SHORT = 1440;           // …but never less than this on the short side (panoramas stay sharp when filling)
  const PHOTO_MAX_PIXELS = 6.5e6;
  const PHOTO_DATA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const validPhoto = m => !!(m && typeof m.data === 'string' && m.data.length < 16e6 && PHOTO_DATA_RE.test(m.data) && m.w > 0 && m.h > 0);
  function normalizePhotoSettings(im) {
    if (!im || typeof im !== 'object') return null;
    const f = im.focus || {};
    const unit = v => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.5);
    return { on: im.on !== false, fit: im.fit === 'whole' ? 'whole' : 'fill', focus: { x: unit(f.x), y: unit(f.y) }, fade: Math.max(0, Math.min(0.7, +im.fade || 0)) };
  }
  // CSS background-position: the chosen spot stays in view when filling; a whole photo is centered.
  const photoPosition = im => (im.fit === 'whole' ? '50% 50%' : `${(im.focus.x * 100).toFixed(1)}% ${(im.focus.y * 100).toFixed(1)}%`);
  const BoardPhoto = {
    url: null, src: null,
    el() { return $('#board-bg'); },
    settings() { return this.media() ? (normalizePhotoSettings(S.media.get('background-look')) || normalizePhotoSettings({})) : null; },
    media() { const m = S.media.get('background'); return validPhoto(m) ? m : null; },
    // The picture as an object URL (one big data: string in a style would be parsed again on every change).
    async objectUrl(m) {
      if (this.src === m.data && this.url) return this.url;
      const blob = await (await fetch(m.data)).blob();
      if (this.url) URL.revokeObjectURL(this.url);
      this.src = m.data; this.url = URL.createObjectURL(blob);
      return this.url;
    },
    async render() {
      const el = this.el();
      if (!el) return;
      const im = this.settings(), m = this.media();
      const show = !!(im && im.on && m);
      document.body.classList.toggle('has-photo', show);
      if (!show) { el.hidden = true; el.style.backgroundImage = ''; return; }
      let url;
      try { url = await this.objectUrl(m); } catch (e) { el.hidden = true; return; }
      if (this.media() !== m) return;   // changed while loading; the newer render wins
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = im.fit === 'whole' ? 'contain' : 'cover';
      el.style.backgroundPosition = photoPosition(im);
      el.style.setProperty('--fade', String(im.fade));
      el.style.setProperty('--fade-color', (S.board.background && S.board.background.color) || 'var(--board-bg)');
      el.hidden = false;
      this.place();
    },
    // The photo covers the board: the 16:9 board (not the shaded margins), or the whole window.
    place() {
      const el = this.el();
      if (!el || el.hidden) return;
      const L = canvas();
      const r = freeShape() ? { x: 0, y: 0, w: Zoom.vw, h: Zoom.vh } : { x: Zoom.ox, y: Zoom.oy, w: L.w * Zoom.s, h: L.h * Zoom.s };
      Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    },
    // A picture from the teacher's device: shrunk and re-compressed here (nothing is uploaded anywhere).
    async process(file) {
      if (!file || !/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '')) throw new Error('Choose a picture file (JPG, PNG or WebP).');
      let bmp;
      try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('This picture can’t be opened here. Try a JPG or PNG (iPhone HEIC photos may need converting first).'); }
      const long = Math.max(bmp.width, bmp.height), short = Math.min(bmp.width, bmp.height);
      // Long side ≤ 2560, but keep the short side ≥ 1440 (a panorama filling the board stays sharp), within ~6.5 MP.
      let k = Math.min(1, PHOTO_MAX_SIDE / long);
      if (short * k < PHOTO_MIN_SHORT) k = Math.min(1, PHOTO_MIN_SHORT / short);
      k = Math.min(k, Math.sqrt(PHOTO_MAX_PIXELS / (bmp.width * bmp.height)), 1);
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      // Transparent (a logo, clip-art)? Keep the transparency (WebP, or PNG where WebP can't be made), so the
      // board color shows through instead of black. Otherwise JPEG.
      const probe = document.createElement('canvas'); probe.width = 64; probe.height = 64;
      const pg = probe.getContext('2d', { willReadFrequently: true }); pg.drawImage(c, 0, 0, 64, 64);
      const px = pg.getImageData(0, 0, 64, 64).data;
      let alpha = false;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { alpha = true; break; }
      const enc = (type, q) => new Promise(res => c.toBlob(res, type, q));
      let blob;
      if (alpha) {
        blob = await enc('image/webp', 0.9);
        if (!blob || blob.type !== 'image/webp') blob = await enc('image/png');
      } else {
        blob = await enc('image/jpeg', 0.85);
        if (blob && blob.size > 1200000) blob = await enc('image/jpeg', 0.72);
      }
      if (!blob) throw new Error('This picture couldn’t be prepared.');
      const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
      return { data, w, h, bytes: blob.size, name: String(file.name || 'Photo').slice(0, 80), addedAt: Date.now() };
    },
    async setFromFile(file) {
      const m = await this.process(file);
      if (this.media()) await BoardHistory.before('photo', 'Before changing the background photo');
      const prev = this.settings();
      const look = { on: true, fit: prev ? prev.fit : 'fill', focus: { x: 0.5, y: 0.5 }, fade: prev ? prev.fade : 0 };
      S.media.set('background', m); S.media.set('background-look', look);
      Writer.put(Keys.media(S.boardId, 'background'), 'media', m);
      Writer.put(Keys.media(S.boardId, 'background-look'), 'media', look);
      this.render();
    },
    update(patch) {
      if (!this.media()) return;
      const look = Object.assign({}, this.settings(), patch);
      S.media.set('background-look', look);
      Writer.put(Keys.media(S.boardId, 'background-look'), 'media', look);
      this.render();
    },
    async remove() {
      const beforeId = await BoardHistory.before('photo', 'Before removing the background photo');
      for (const n of ['background', 'background-look']) { S.media.delete(n); Writer.del(Keys.media(S.boardId, n)); }
      this.render();
      return beforeId;
    }
  };

  function updateHint() {
    let open = 0;
    for (const w of S.wins.values()) if (w) open++;
    $('#empty-hint').hidden = open > 0;
    // Windows gone (a student closed everything?): offer Board history.
    const rescue = $('#empty-hint .rescue');
    if (rescue) rescue.hidden = !(open === 0 && BoardHistory.metas.some(m => Date.now() - m.at < 7 * 864e5 && m.thumb && m.thumb.wins.length));
  }

  // Create, update or remove the window for an instance so it matches S.insts.
  function reconcileWin(ikey) {
    const inst = S.insts.get(ikey);
    let w = S.wins.get(ikey);
    const widget = inst && getWidget(inst.widgetId);
    if (inst && inst.open && widget) {
      if (!w) { w = new Win(ikey); S.wins.set(ikey, w); }
      w.layout();
    } else if (w) {
      w.destroy();
      S.wins.delete(ikey);
      if (Menu.win === w) Menu.close();
    }
  }

  // =====================================================================
  // 6. Geometry
  // =====================================================================
  const desk = () => $('#desk');

  // ---------------------------------------------------------------------
  // 6a. BOARD SHAPE AND SCALE
  // ---------------------------------------------------------------------
  // Window rects are stored in "layout space": the CSS px a window's widget sees. Drawing converts
  // layout space to the screen with one zoom factor (Win.applyRect and Inter.step use Zoom).
  //
  //   16:9 board (default, board.shape '16:9'): layout space is a fixed 16:9 board of
  //     BASE_W/scale × BASE_H/scale, drawn as large as fits the screen (centered left-right, top
  //     aligned; the rest of the screen is lightly shaded). Every screen shows the same arrangement.
  //   Any shape (board.shape 'free'): the board is the whole screen at the board's scale
  //     (zoom = scale). Windows that don't fit a smaller screen are moved inside when drawn.
  //
  // board.scale (default 80%) is how big windows, title bars and menus are, as on a 1920 × 1080 screen
  // (at 100% a window's CSS px are that screen's px). Changing it keeps every window's footprint (rects
  // are rescaled) and changes how big its contents are drawn. Menus, the Widget Picker, Settings, toasts and
  // dialogs follow it too (CSS zoom: var(--ui)). A board saved before this existed (no board.scale) is
  // converted once, keeping its arrangement as it looks on the screen it's opened on.
  // See docs/DATA-FORMAT.md, "Layout space".
  const BASE_W = 1920, BASE_H = 1080;
  const SCALES = [0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  const DEFAULT_SCALE = 0.8;
  const Zoom = { s: 1, ox: 0, oy: 0, vw: 0, vh: 0, ui: 1 };
  // Menus, the Widget Picker, Settings, toasts and dialogs are drawn at the board's size, but never bigger than
  // fits this screen (a size picked on a smartboard can arrive on a tablet or phone in a backup).
  const UI_FIT_W = 520, UI_FIT_H = 440;
  const validScale = v => (typeof v === 'number' && v >= 0.5 && v <= 2 ? v : null);   // the Settings range
  const boardScale = () => validScale(S.board.scale) || DEFAULT_SCALE;
  const freeShape = () => S.board.shape === 'free';
  const canvasFor = sc => ({ w: Math.round(BASE_W / sc), h: Math.round(BASE_H / sc) });
  const canvas = () => canvasFor(boardScale());
  const layoutSig = () => JSON.stringify([boardScale(), freeShape()]);

  function validLayout(l) {
    return l && typeof l.w === 'number' && typeof l.h === 'number' && l.w >= 200 && l.h >= 150 && l.w < 20000 && l.h < 20000 ? { w: Math.round(l.w), h: Math.round(l.h) } : null;
  }

  function updateZoom() {
    const d = desk();
    Zoom.vw = d.clientWidth || window.innerWidth;
    Zoom.vh = d.clientHeight || window.innerHeight;
    const sc = boardScale();
    if (freeShape()) { Zoom.s = sc; Zoom.ox = 0; Zoom.oy = 0; }
    else {
      const L = canvas();
      Zoom.s = Math.min(Zoom.vw / L.w, Zoom.vh / L.h);
      Zoom.ox = (Zoom.vw - L.w * Zoom.s) / 2; // center left/right; keep the top aligned
      Zoom.oy = 0;
    }
    Zoom.ui = Math.max(0.4, Math.min(sc, (window.innerWidth || Zoom.vw) / UI_FIT_W, (window.innerHeight || Zoom.vh) / UI_FIT_H));
    document.documentElement.style.setProperty('--ui', String(Zoom.ui));
    // Resize handles and the focus ring stay at the board's scale even when the board is drawn
    // smaller (CSS uses --zi), so they stay touchable on a small screen.
    d.style.setProperty('--zi', String(Math.min(2.5, Math.max(1, sc / Zoom.s))));
    // Lightly shade the screen outside the 16:9 board, so it's clear why windows stop at its edge.
    const fr = document.getElementById('layout-frame');
    if (fr) {
      const L = canvas();
      const show = !freeShape() && (Zoom.ox > 1 || L.h * Zoom.s < Zoom.vh - 1);
      fr.hidden = !show;
      if (show) {
        fr.style.width = L.w * Zoom.s + 'px'; fr.style.height = L.h * Zoom.s + 'px';
        fr.style.transform = `translate(${Zoom.ox}px, ${Zoom.oy}px)`;
      }
    }
    ShapeHint.update();
    BoardPhoto.place();
  }

  // The visible screen expressed in layout space (may extend past the 16:9 board on one axis).
  const viewRect = () => {
    if (!Zoom.vw) updateZoom();
    return { x: -Zoom.ox / Zoom.s, y: -Zoom.oy / Zoom.s, w: Zoom.vw / Zoom.s, h: Zoom.vh / Zoom.s };
  };
  // Screen rect (e.g. getBoundingClientRect) -> layout space.
  const toLayout = r => ({ x: (r.left - Zoom.ox) / Zoom.s, y: (r.top - Zoom.oy) / Zoom.s, w: r.width / Zoom.s, h: r.height / Zoom.s });
  // Where windows may be put and are kept: the 16:9 board (so every screen agrees and nothing lands in
  // one screen's side margins), or with the shape unlocked, the screen.
  const boundsRect = () => {
    if (!Zoom.vw) updateZoom();
    if (freeShape()) return viewRect();
    const L = canvas();
    return { x: 0, y: 0, w: L.w, h: L.h };
  };
  // A distance that should feel the same on screen at any zoom (snap reach, push-to-overlap), in layout px.
  const screenPx = px => px / Zoom.s;

  // Scale a window's rect by k, keeping its title bar the standard height: the content area is what scales, so
  // a fixed-shape widget (Clock, Traffic Light) keeps its exact shape and a scale change can be undone.
  const r2 = v => Math.round(v * 100) / 100;
  const scaleRect = (r, k, dx = 0, dy = 0) => ({ x: r2(r.x * k + dx), y: r2(r.y * k + dy), w: r2(r.w * k), h: r2(Math.max(10, r.h - TITLE_H) * k + TITLE_H) });

  // A board saved before board.scale existed: its rects are screen px (or px of the old optional
  // layout size). Fit that space into the 16:9 board with one factor, keeping shapes and spacing.
  function migrateBoard() {
    if (validScale(S.board.scale)) return;
    if (!Zoom.vw) updateZoom();
    const sc = DEFAULT_SCALE, C = canvasFor(sc);
    let O = validLayout(S.board.layout) || { w: Math.round(Zoom.vw), h: Math.round(Zoom.vh) };
    let w = O.w, h = O.h;
    for (const i of S.insts.values()) { w = Math.max(w, i.rect.x + i.rect.w); h = Math.max(h, i.rect.y + i.rect.h); }
    O = { w, h };
    const k = Math.min(C.w / O.w, C.h / O.h), dx = (C.w - O.w * k) / 2;
    for (const [ikey, inst] of S.insts) saveInst(ikey, Object.assign({}, inst, { rect: scaleRect(inst.rect, k, dx, 0) }));
    updateBoard({ scale: sc, shape: S.board.shape === 'free' ? 'free' : '16:9', layout: C });
    updateZoom();
  }

  // Settings → Scale: every window keeps its footprint; its contents are drawn bigger or smaller.
  function setBoardScale(next) {
    const s1 = validScale(next), s0 = boardScale();
    if (!s1) return false;
    if (Math.abs(s1 - s0) < 0.001) return true;
    if (Inter.active) { toast('Finish moving windows first.'); return false; }
    const k = s0 / s1;
    for (const [ikey, inst] of S.insts) saveInst(ikey, Object.assign({}, inst, { rect: scaleRect(inst.rect, k) }));
    updateBoard({ scale: s1, layout: canvasFor(s1) });
    updateZoom();
    return true;
  }

  // Settings → Board shape. Windows outside a smaller board are shown inside it (their saved place is kept).
  function setBoardShape(shape) {
    if (Inter.active) { toast('Finish moving windows first.'); return false; }
    updateBoard({ shape: shape === 'free' ? 'free' : '16:9' });
    updateZoom();
    return true;
  }

  // When the 16:9 board leaves much of the window unused (a very wide, tall or narrow window), a small
  // note in the shaded margin offers to unlock the board's shape. "Hide" keeps it away for this session.
  const ShapeHint = {
    el: null,
    hidden: (() => { try { return sessionStorage.getItem('21board-shape-hint') === 'hidden'; } catch (e) { return false; } })(),
    init() {
      this.el = $('#shape-hint');
      this.el.innerHTML = '<div class="msg"><b>This board keeps a standard widescreen shape.</b> Do you want to change it to work in any shape?</div>' +
        '<div class="acts"><button class="btn primary small" data-act="unlock">Use the whole window</button>' +
        `<button class="hide" data-act="hide" aria-label="Hide this tip" title="Hide">${svg('close')}</button></div>`;
      this.el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'unlock') {
          if (!setBoardShape('free')) return;   // refused (someone is moving a window); it said why
          if (Settings.isOpen) Settings.render();
          toast('The board now fills the window. Settings → Windows → Board shape changes it back.');
        }
        else { this.hidden = true; try { sessionStorage.setItem('21board-shape-hint', 'hidden'); } catch (err) { /* private mode */ } }
        this.update();
      });
    },
    update() {
      if (!this.el) return;
      const L = canvas(), bw = L.w * Zoom.s, bh = L.h * Zoom.s;
      const unused = Zoom.vw && Zoom.vh ? 1 - (bw * bh) / (Zoom.vw * Zoom.vh) : 0;
      let show = !freeShape() && !this.hidden && unused > 0.3;
      this.el.hidden = !show;
      if (!show) return;
      const ui = Zoom.ui;
      const side = Zoom.ox;                                  // width of each side margin
      const below = Zoom.vh - bh;                            // height of the margin under the board
      const corner = 80 * ui;                                // the Widget Picker buttons in the bottom corners
      // Put it where there's room, clear of the Widget Picker buttons: the middle of the space below the
      // board, or the right margin above its button.
      const box = below >= side ? { x: corner, y: bh, w: Zoom.vw - 2 * corner, h: below } : { x: Zoom.ox + bw, y: 0, w: side, h: Zoom.vh - corner };
      Object.assign(this.el.style, { left: '0px', top: '0px', maxWidth: Math.max(140, box.w - 24) / ui + 'px' });   // measure unconstrained
      const r = { w: this.el.offsetWidth * ui, h: this.el.offsetHeight * ui };
      // No room for it at this size (its button would spill out or Hide would go off screen): leave it out.
      show = box.w - 16 >= Math.max(r.w, 250 * ui) && box.h - 16 >= r.h;
      this.el.hidden = !show;
      if (!show) return;
      this.el.style.left = (box.x + (box.w - r.w) / 2) / ui + 'px';
      this.el.style.top = (box.y + (box.h - r.h) / 2) / ui + 'px';
    }
  };

  // Export: the size of the space the saved rects are in (grown to contain every window).
  function exportViewport() {
    const v = viewRect();
    if (!freeShape()) { const L = canvas(); return { width: L.w, height: L.h }; }
    let w = Math.round(v.w), h = Math.round(v.h);
    for (const i of S.insts.values()) { w = Math.max(w, Math.ceil(i.rect.x + i.rect.w)); h = Math.max(h, Math.ceil(i.rect.y + i.rect.h)); }
    return { width: w, height: h };
  }

  // Import: how to map a file's rects into this board, and where to place them.
  //   Replace -> take the file's scale and shape; its rects land in the board it was saved from
  //              (files from before board scale existed are fitted into the 16:9 board).
  //   Add     -> fit the file's whole board into this one with one factor (shapes and spacing kept).
  function importPlan(p, mode) {
    const F = validLayout(p.viewport);
    let sc = boardScale(), shape = freeShape() ? 'free' : '16:9';
    if (mode === 'replace') {
      sc = validScale(p.board.scale) || (p.board.scale === undefined ? DEFAULT_SCALE : sc);
      shape = p.board.shape === 'free' ? 'free' : '16:9';
    }
    const v = viewRect();
    const screenAt = k => ({ w: Math.round(Zoom.vw / k), h: Math.round(Zoom.vh / k) });
    const T = shape === 'free' ? (mode === 'replace' && F && validScale(p.board.scale) ? F : (mode === 'replace' ? screenAt(sc) : { w: Math.round(v.w), h: Math.round(v.h) })) : canvasFor(sc);
    const k = F ? Math.min(T.w / F.w, T.h / F.h) : 1; // uniform, so shapes and spacing are kept
    const dx = F && shape !== 'free' ? (T.w - F.w * k) / 2 : 0;
    const convert = r => (F && (Math.abs(k - 1) > 0.001 || Math.abs(dx) > 0.5)) ? scaleRect(r, k, dx, 0) : Object.assign({}, r);
    const view = { x: 0, y: 0, w: T.w, h: T.h };
    return { convert, view, scale: sc, shape, layout: canvasFor(sc) };
  }

  // Settings → Windows: scale and board shape.
  function scaleSettingsRows(seg) {
    const sc = boardScale(), i = SCALES.findIndex(x => Math.abs(x - sc) < 0.001);
    const L = canvas(), bw = L.w * Zoom.s, bh = L.h * Zoom.s;
    const unused = Zoom.vw ? 1 - (bw * bh) / (Zoom.vw * Zoom.vh) : 0;
    const shapeHint = freeShape()
      ? 'Any shape: the board fills the window. On a smaller screen, windows are moved to fit.'
      : '16:9: every screen shows the same arrangement, fitted to the window.' + (unused > 0.15 ? ' This window is a different shape, so part of it is shaded.' : '');
    return `<div class="row"><div><div class="lbl">Size of windows and menus</div><div class="hint">Title bars, menus and widget contents. Windows keep their place on the board.</div></div>
        <div class="stepper" role="group" aria-label="Size of windows and menus">
          <button class="icon" data-act="scale-down" aria-label="Smaller"${sc <= SCALES[0] + 0.001 ? ' disabled' : ''}>−</button>
          <output id="st-scale" aria-live="polite">${Math.round(sc * 100)}%</output>
          <button class="icon" data-act="scale-up" aria-label="Larger"${sc >= SCALES[SCALES.length - 1] - 0.001 ? ' disabled' : ''}>+</button>
        </div></div>
      <div class="row stack"><div><div class="lbl">Board shape</div><div class="hint">${esc(shapeHint)}</div></div>${seg('shape', freeShape() ? 'free' : '16:9', [['16:9', '16:9'], ['free', 'Any shape']])}</div>`;
  }
  function scaleStep(dir) {
    const sc = boardScale();
    const next = dir > 0 ? SCALES.find(x => x > sc + 0.001) : SCALES.slice().reverse().find(x => x < sc - 0.001);
    return next ? setBoardScale(next) : false;
  }
  // ------------------------------------------------------- end of board scaling

  function overlaps(a, b, pad = 0) {
    const ix = Math.min(a.x + a.w, b.x + b.w + pad) - Math.max(a.x, b.x - pad);
    const iy = Math.min(a.y + a.h, b.y + b.h + pad) - Math.max(a.y, b.y - pad);
    return ix > 0.5 && iy > 0.5;
  }

  function clampToView(r, v) {
    return { x: clamp(r.x, v.x, v.x + v.w - r.w), y: clamp(r.y, v.y, v.y + v.h - r.h), w: r.w, h: r.h };
  }

  // Constrain an outer window size to min/max, the view, and an optional content aspect ratio.
  function fitSize(w, h, c, view) {
    const vw = view ? view.w : Infinity, vh = view ? view.h : Infinity;
    const maxW = Math.max(80, Math.min(c.maxW, vw));
    const maxH = Math.max(TITLE_H + 40, Math.min(c.maxH, vh));
    const minW = Math.min(c.minW, maxW), minH = Math.min(c.minH, maxH);
    w = clamp(w, minW, maxW);
    h = clamp(h, minH, maxH);
    if (c.ratio) {
      let cw = w, ch = cw / c.ratio;
      if (ch + TITLE_H < minH) { ch = minH - TITLE_H; cw = ch * c.ratio; }
      if (cw < minW) { cw = minW; ch = cw / c.ratio; }
      if (cw > maxW) { cw = maxW; ch = cw / c.ratio; }
      if (ch + TITLE_H > maxH) { ch = maxH - TITLE_H; cw = ch * c.ratio; }
      w = cw; h = ch + TITLE_H;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  function fitRect(r, c, view) {
    const s = fitSize(r.w, r.h, c, view);
    return clampToView({ x: r.x, y: r.y, w: s.w, h: s.h }, view);
  }

  // Things a moving window would rather not cover: other windows and the corner controls.
  function obstacles(exceptWin) {
    const out = [];
    for (const w of S.wins.values()) {
      if (w !== exceptWin && w.disp && !(w.inst && w.inst.maximized)) out.push(w.disp);
    }
    for (const side of ['left', 'right']) {
      const b = Picker.btns[side];
      if (!b || b.hidden) continue;
      const r = b.getBoundingClientRect();
      if (r.width) out.push(Object.assign(toLayout({ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 }), { ui: true }));
    }
    return out;
  }

  /*
   * Overlap resistance ("abhors, but does not refuse, overlap"):
   * if the dragged position overlaps something, look for the nearest position
   * that doesn't (flush against the obstacle's edge). If that is within the
   * break distance, snap there; once the user pushes further than that, let
   * the windows overlap. Free positions also align to nearby edges.
   */
  function resolveMove(raw, obs, view, brk, snapping) {
    const r = clampToView(raw, view);
    if (!snapping) return r;
    const inView = c => c.x >= view.x - 0.5 && c.y >= view.y - 0.5 && c.x + c.w <= view.x + view.w + 0.5 && c.y + c.h <= view.y + view.h + 0.5;
    const isFree = c => !obs.some(o => overlaps(c, o));
    if (isFree(r)) return alignSnap(r, obs, view, isFree, inView);
    if (brk <= 0) return r;
    const xs = [r.x, view.x, view.x + view.w - r.w], ys = [r.y, view.y, view.y + view.h - r.h];
    for (const o of obs) {
      xs.push(o.x - r.w - GAP, o.x + o.w + GAP);
      ys.push(o.y - r.h - GAP, o.y + o.h + GAP);
    }
    let best = null, bestD = brk;
    for (const x of xs) for (const y of ys) {
      const d = Math.hypot(x - r.x, y - r.y);
      if (d > bestD) continue;
      const c = { x, y, w: r.w, h: r.h };
      if (!inView(c) || !isFree(c)) continue;
      best = c; bestD = d;
    }
    return best || r;
  }

  function alignSnap(r, obs, view, isFree, inView) {
    const cx = [view.x, view.x + GAP, view.x + view.w - r.w, view.x + view.w - r.w - GAP];
    const cy = [view.y, view.y + GAP, view.y + view.h - r.h, view.y + view.h - r.h - GAP];
    for (const o of obs) {
      if (o.ui) continue;
      cx.push(o.x, o.x + o.w - r.w, o.x + o.w + GAP, o.x - r.w - GAP);
      cy.push(o.y, o.y + o.h - r.h, o.y + o.h + GAP, o.y - r.h - GAP);
    }
    const pick = (v, cands) => {
      let best = v, bd = screenPx(ALIGN_SNAP) + 0.01;
      for (const c of cands) { const d = Math.abs(c - v); if (d < bd) { bd = d; best = c; } }
      return best;
    };
    const x = pick(r.x, cx), y = pick(r.y, cy);
    for (const c of [{ x, y }, { x, y: r.y }, { x: r.x, y }]) {
      const cand = { x: c.x, y: c.y, w: r.w, h: r.h };
      if (inView(cand) && isFree(cand)) return cand;
    }
    return r;
  }

  function computeResize(s, handle, dx, dy, c, view, obs, brk, snap) {
    const E = handle.includes('e'), W = handle.includes('w'), N = handle.includes('n'), So = handle.includes('s');
    let left = s.x, top = s.y, right = s.x + s.w, bottom = s.y + s.h;
    if (E) right += dx;
    if (W) left += dx;
    if (So) bottom += dy;
    if (N) top += dy;
    left = Math.max(view.x, left); top = Math.max(view.y, top);
    right = Math.min(view.x + view.w, right); bottom = Math.min(view.y + view.h, bottom);

    const maxW = Math.min(c.maxW, view.w), maxH = Math.min(c.maxH, view.h);
    const minW = Math.min(c.minW, maxW), minH = Math.min(c.minH, maxH);
    if (E || W) { const w = clamp(right - left, minW, maxW); if (W) left = right - w; else right = left + w; }
    if (N || So) { const h = clamp(bottom - top, minH, maxH); if (N) top = bottom - h; else bottom = top + h; }

    if (brk > 0) {
      const sR = s.x + s.w, sB = s.y + s.h;
      for (const o of obs) {
        const vSpan = o.y < bottom - 0.5 && o.y + o.h > top + 0.5;
        const hSpan = o.x < right - 0.5 && o.x + o.w > left + 0.5;
        if (E && vSpan && o.x >= sR - 0.5) { const lim = o.x - GAP; if (right > lim && right - lim <= brk) right = Math.max(lim, left + minW); }
        if (W && vSpan && o.x + o.w <= s.x + 0.5) { const lim = o.x + o.w + GAP; if (left < lim && lim - left <= brk) left = Math.min(lim, right - minW); }
        if (So && hSpan && o.y >= sB - 0.5) { const lim = o.y - GAP; if (bottom > lim && bottom - lim <= brk) bottom = Math.max(lim, top + minH); }
        if (N && hSpan && o.y + o.h <= s.y + 0.5) { const lim = o.y + o.h + GAP; if (top < lim && lim - top <= brk) top = Math.min(lim, bottom - minH); }
      }
    }

    /*
     * Size snapping: a moving edge snaps (within ALIGN_SNAP px) to
     *   - the other windows' edges (so edges line up),
     *   - the line GAP px beside another window (so they sit neatly side by side),
     *   - the board edges, and
     *   - a width/height equal to another window's (so sizes match).
     * A snap is skipped if it would break min/max size, leave the board, or create a new overlap.
     */
    // Turn edges into the final rect: for aspect-locked windows, derive the other dimension and anchor it.
    const finish = (l, t, r, b) => {
      let w = r - l, h = b - t, x = l, y = t;
      if (c.ratio) {
        let useW;
        if ((E || W) && (N || So)) {
          const rw = w / Math.max(1, s.w), rh = (h - TITLE_H) / Math.max(1, s.h - TITLE_H);
          useW = Math.abs(Math.log(rw)) >= Math.abs(Math.log(rh));
        } else useW = E || W;
        if (useW) h = w / c.ratio + TITLE_H; else w = (h - TITLE_H) * c.ratio;
        const f = fitSize(w, h, c, view);
        w = f.w; h = f.h;
        if (W) x = r - w; else if (!E) x = s.x + (s.w - w) / 2;
        if (N) y = b - h; else if (!So) y = s.y + (s.h - h) / 2;
      }
      return { x, y, w, h };
    };

    if (snap) {
      const others = obs.filter(o => !o.ui);
      const overlapCount = r => obs.reduce((n, o) => n + (overlaps(r, o) ? 1 : 0), 0);
      const base = overlapCount(finish(left, top, right, bottom));
      // A snap is only taken if the resulting window (after any aspect-ratio adjustment) still fits.
      const fits = (l, t, r, b) => {
        if (r - l < minW - 0.5 || r - l > maxW + 0.5 || b - t < minH - 0.5 || b - t > maxH + 0.5) return false;
        const f = finish(l, t, r, b);
        return f.x >= view.x - 0.5 && f.y >= view.y - 0.5 && f.x + f.w <= view.x + view.w + 0.5 && f.y + f.h <= view.y + view.h + 0.5 &&
          overlapCount(f) <= base;
      };
      const nearest = (v, cands, ok) => {
        let best = null, bd = screenPx(ALIGN_SNAP) + 0.01;
        for (const cand of cands) { const d = Math.abs(cand - v); if (d < bd && ok(cand)) { bd = d; best = cand; } }
        return best;
      };
      if (E) {
        const cands = [view.x + view.w, view.x + view.w - GAP];
        for (const o of others) cands.push(o.x, o.x + o.w, o.x - GAP, left + o.w);
        const v = nearest(right, cands, x => fits(left, top, x, bottom)); if (v !== null) right = v;
      }
      if (W) {
        const cands = [view.x, view.x + GAP];
        for (const o of others) cands.push(o.x, o.x + o.w, o.x + o.w + GAP, right - o.w);
        const v = nearest(left, cands, x => fits(x, top, right, bottom)); if (v !== null) left = v;
      }
      if (So) {
        const cands = [view.y + view.h, view.y + view.h - GAP];
        for (const o of others) cands.push(o.y, o.y + o.h, o.y - GAP, top + o.h);
        const v = nearest(bottom, cands, y => fits(left, top, right, y)); if (v !== null) bottom = v;
      }
      if (N) {
        const cands = [view.y, view.y + GAP];
        for (const o of others) cands.push(o.y, o.y + o.h, o.y + o.h + GAP, bottom - o.h);
        const v = nearest(top, cands, y => fits(left, y, right, bottom)); if (v !== null) top = v;
      }
    }

    return clampToView(finish(left, top, right, bottom), view);
  }

  // Find the free spot (with GAP spacing) closest to an anchor point.
  function findFreeSpot(w, h, view, obs, anchor) {
    const minX = view.x + GAP, maxX = view.x + view.w - w - GAP;
    const minY = view.y + GAP, maxY = view.y + view.h - h - GAP;
    if (maxX < minX || maxY < minY) return null;
    const xs = new Set([Math.round(maxX), Math.round(clamp(anchor.x - w / 2, minX, maxX))]);
    const ys = new Set([Math.round(maxY), Math.round(clamp(anchor.y - h / 2, minY, maxY))]);
    for (let x = minX; x <= maxX; x += 16) xs.add(Math.round(x));
    for (let y = minY; y <= maxY; y += 16) ys.add(Math.round(y));
    for (const o of obs) {
      for (const x of [o.x + o.w + GAP, o.x - w - GAP]) if (x >= minX && x <= maxX) xs.add(Math.round(x));
      for (const y of [o.y + o.h + GAP, o.y - h - GAP]) if (y >= minY && y <= maxY) ys.add(Math.round(y));
    }
    let best = null, bd = Infinity;
    for (const x of xs) for (const y of ys) {
      const d = (x + w / 2 - anchor.x) ** 2 + (y + h / 2 - anchor.y) ** 2;
      if (d >= bd) continue;
      const c = { x, y, w, h };
      if (obs.some(o => overlaps(c, o, GAP - 1))) continue;
      best = c; bd = d;
    }
    return best;
  }

  function placeNew(size, c, side) {
    const view = boundsRect();
    const obs = obstacles(null);
    const anchor = { x: view.x + view.w * (side === 'left' ? 0.32 : side === 'right' ? 0.68 : 0.5), y: view.y + view.h * 0.42 };
    let prev = null;
    for (const scale of [1, 0.85, 0.7, 0.55]) {
      const s = fitSize(size.w * scale, size.h * scale, c, view);
      if (prev && prev.w === s.w && prev.h === s.h) continue;
      prev = s;
      const spot = findFreeSpot(s.w, s.h, view, obs, anchor);
      if (spot) return spot;
    }
    const s = fitSize(size.w, size.h, c, view);
    const k = S.wins.size % 8;
    return clampToView({ x: anchor.x - s.w / 2 + k * 28, y: anchor.y - s.h / 2 + k * 28, w: s.w, h: s.h }, view);
  }

  function defaultOuterSize(widget) {
    const w = widget.win.width;
    const h = widget.win.aspectRatio ? w / widget.win.aspectRatio : widget.win.height;
    return { w: Math.round(w), h: Math.round(h + TITLE_H) };
  }

  // =====================================================================
  // 7. Windows
  // =====================================================================
  class Win {
    constructor(ikey) {
      this.ikey = ikey;
      this.widget = getWidget(this.inst.widgetId);
      this.rt = {};             // runtime constraint overrides set by the widget
      this.menuItems = [];
      this.subtitle = '';
      this.disp = null;         // rect currently displayed
      this.connected = false;   // SDK handshake done
      this.lastInfo = '';
      this.lastTitleTap = 0;
      this.build();
    }

    get inst() { return S.insts.get(this.ikey); }

    build() {
      const el = document.createElement('section');
      el.className = 'win opening';
      el.dataset.ikey = this.ikey;
      el.setAttribute('aria-label', this.widget.name);
      el.innerHTML =
        `<div class="win-title"><button class="win-label" aria-haspopup="menu" title="Window menu"><span class="name"></span><span class="num"></span><span class="sub"></span>${svg('chevron')}</button></div>` +
        `<div class="win-body"><div class="win-loading"></div></div>` +
        ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map(h => `<div class="grip ${h}" data-h="${h}"></div>`).join('');
      this.el = el;
      this.titleEl = $('.win-title', el);
      this.labelEl = $('.win-label', el);
      this.bodyEl = $('.win-body', el);
      this.loadingEl = $('.win-loading', el);
      el.addEventListener('animationend', e => { if (e.target === el) el.classList.remove('opening'); });
      this.labelEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Menu.toggle(this); } });
      this.renderTitle();
      this.createFrame();
      desk().appendChild(el);
    }

    createFrame() {
      if (this.iframe) this.iframe.remove();
      const f = document.createElement('iframe');
      f.title = this.widget.name;
      f.setAttribute('sandbox', SANDBOX);
      f.setAttribute('allow', ['fullscreen', 'clipboard-read', 'clipboard-write', 'autoplay', ...this.widget.permissions].join('; '));
      f.addEventListener('load', () => this.onFrameLoad());
      // Tells the SDK it's inside 21Board, before any of its code runs. (Set before inserting the frame:
      // a later change doesn't reach the widget's window.name.)
      f.name = 'b21-board:' + this.ikey;
      this.bodyEl.insertBefore(f, this.loadingEl);
      this.iframe = f;
      this.loadingEl.classList.remove('done');
      if (this.widget.srcdoc != null) f.srcdoc = this.widget.srcdoc; else f.src = this.widget.entry;
    }

    onFrameLoad() {
      this.loadingEl.classList.add('done');
      // Same-origin: catch taps inside the widget even if it doesn't use the SDK.
      try {
        this.iframe.contentWindow.addEventListener('pointerdown', () => { focusWin(this.ikey); closePopups(); }, true);
      } catch (e) { /* cross-origin: the SDK's 'activate' message covers this */ }
      attachContentDrag(this);
    }

    reload() {
      Inter.forget(this, true);
      this.rt = {}; this.menuItems = []; this.subtitle = ''; this.connected = false; this.lastInfo = '';
      if (Menu.win === this) Menu.close();
      this.renderTitle();
      this.createFrame();
      this.layout();
    }

    destroy() {
      Inter.forget(this, false);
      if (this.iframe) this.iframe.src = 'about:blank';
      this.el.remove();
    }

    renderTitle() {
      $('.name', this.labelEl).textContent = this.widget.name;
      $('.num', this.labelEl).textContent = this.inst && this.inst.n > 1 ? String(this.inst.n) : '';
      $('.sub', this.labelEl).textContent = this.subtitle;
      this.labelEl.setAttribute('aria-label', `${this.widget.name}${this.inst && this.inst.n > 1 ? ' ' + this.inst.n : ''} window menu`);
    }

    // One finger / mouse anywhere inside: only for click-only widgets (registry or SDK), never when maximized.
    canDragFromContent() {
      if (S.settings.dragFromContent === false || !this.inst || this.inst.maximized) return false;
      return this.rt.dragFromContent !== undefined ? this.rt.dragFromContent : this.widget.win.dragFromContent;
    }

    constraints() {
      const w = this.widget.win, rt = this.rt;
      return {
        minW: rt.minW || w.minWidth,
        minH: (rt.minH || w.minHeight) + TITLE_H,
        maxW: rt.maxW || w.maxWidth || Infinity,
        maxH: (rt.maxH || w.maxHeight || Infinity) + TITLE_H,
        ratio: rt.ratio !== undefined ? rt.ratio : w.aspectRatio,
        resizable: rt.resizable !== undefined ? rt.resizable : w.resizable
      };
    }

    layout(animate) {
      const inst = this.inst;
      if (!inst) return;
      const view = viewRect(); // the whole screen: a maximized window fills it
      const c = this.constraints();
      const r = inst.maximized ? { x: view.x, y: view.y, w: view.w, h: view.h } : fitRect(inst.rect, c, boundsRect());
      this.el.classList.toggle('maximized', !!inst.maximized);
      this.el.classList.toggle('no-resize', !c.resizable);
      this.el.style.zIndex = Math.max(1, Math.round(inst.z || 1));
      this.applyRect(r, animate);
      this.renderTitle();
    }

    applyRect(r, animate) {
      if (animate) {
        this.el.classList.add('animate');
        clearTimeout(this.animT);
        this.animT = setTimeout(() => this.el.classList.remove('animate'), 260);
      }
      this.disp = { x: r.x, y: r.y, w: r.w, h: r.h };
      // Sides flush with the board edge draw their handles and focus ring inside (the outside is clipped).
      const v = viewRect(), cl = this.el.classList;
      cl.toggle('at-l', r.x <= v.x + 0.5);
      cl.toggle('at-t', r.y <= v.y + 0.5);
      cl.toggle('at-r', r.x + r.w >= v.x + v.w - 0.5);
      cl.toggle('at-b', r.y + r.h >= v.y + v.h - 0.5);
      const s = this.el.style;
      const X = Zoom.ox + r.x * Zoom.s, Y = Zoom.oy + r.y * Zoom.s;
      s.transform = `translate(${Math.round(X)}px, ${Math.round(Y)}px)` + (Zoom.s !== 1 ? ` scale(${Zoom.s})` : '');
      s.width = Math.round(r.w) + 'px';
      s.height = Math.round(r.h) + 'px';
      this.notifyInfo();
    }

    info() {
      const d = this.disp || { x: 0, y: 0, w: 0, h: TITLE_H };
      return { width: Math.round(d.w), height: Math.round(d.h - TITLE_H), x: Math.round(d.x), y: Math.round(d.y), maximized: !!(this.inst && this.inst.maximized), focused: S.focused === this.ikey };
    }

    notifyInfo() {
      if (!this.connected) return;
      const i = this.info();
      const sig = [i.width, i.height, i.maximized, i.focused].join();
      if (sig === this.lastInfo) return;
      this.lastInfo = sig;
      this.post('window', { info: i });
    }

    post(type, payload) {
      if (!this.connected && type !== 'init') return;
      const msg = Object.assign({ b21: SDK_PROTOCOL, type }, payload || {});
      if (LAB) LabBridge.log('out', this, msg);
      try { this.iframe.contentWindow.postMessage(msg, ORIGIN); } catch (e) { /* frame gone */ }
    }

    ack(reqId, ok, result, error) {
      if (reqId != null) this.post('ack', { reqId, ok, result: result === undefined ? null : result, error: error || null });
    }

    attention() {
      this.el.classList.remove('attention');
      void this.el.offsetWidth;
      this.el.classList.add('attention');
      clearTimeout(this.attT);
      this.attT = setTimeout(() => this.el.classList.remove('attention'), 5200);
    }

    // ---- SDK messages from the widget
    handle(m) {
      if (LAB) LabBridge.log('in', this, m);
      switch (m.type) {
        case 'hello': {
          if (!this.inst) return;
          this.connected = true;
          this.lastInfo = '';
          const theme = resolvedTheme();
          const inst = this.inst;
          this.post('init', {
            context: {
              sdkProtocol: SDK_PROTOCOL, boardVersion: BOARD_VERSION,
              widgetId: this.widget.id, widgetName: this.widget.name, widgetVersion: this.widget.version, instance: inst.n,
              data: clone(S.data.get(this.ikey)), config: clone(S.conf.get(this.ikey)),
              theme, palette: paletteFor(theme), window: this.info(),
              locale: navigator.language || 'en-US', devMode: !!S.settings.devMode || !!LAB,
              host: LAB ? 'dev' : 'board'   // 'dev': the widget dev window (the SDK then reports errors to it)
            }
          });
          this.loadingEl.classList.add('done');
          break;
        }
        case 'activate': focusWin(this.ikey); closePopups(); break;
        case 'key': if (m.key === 'Escape') closePopups(); break;
        case 'save': this.saveContent('data', m.data, m.reqId); break;
        case 'saveConfig': this.saveContent('conf', m.config, m.reqId); break;
        case 'getInfo': this.ack(m.reqId, true, this.info()); break;
        case 'window': this.windowOp(String(m.op), Array.isArray(m.args) ? m.args : []); break;
        case 'menu':
          this.menuItems = (Array.isArray(m.items) ? m.items : []).slice(0, 24).map(i => {
            i = i || {};
            const item = { id: String(i.id || '').slice(0, 64), label: String(i.label || '').slice(0, 80) };
            if (i.heading) return Object.assign(item, { heading: true });
            if (Array.isArray(i.swatches)) {
              return Object.assign(item, {
                swatches: i.swatches.slice(0, 12).map(s => ({
                  id: String((s && s.id) || '').slice(0, 64), label: String((s && s.label) || '').slice(0, 40),
                  color: safeColor(s && s.color), background: safeColor(s && s.background), checked: !!(s && s.checked)
                })).filter(s => s.id && s.color)
              });
            }
            return Object.assign(item, { icon: safeSVG(i.icon), checked: typeof i.checked === 'boolean' ? i.checked : undefined, disabled: !!i.disabled, separator: !!i.separator });
          });
          if (Menu.win === this) Menu.render();
          break;
        case 'toast': toast(String(m.text || '').slice(0, 200)); break;
        case 'devLog': if (LAB) LabBridge.post('log', { level: String(m.level || 'error'), text: String(m.text || '').slice(0, 4000) }); break;
      }
    }

    saveContent(kind, value, reqId) {
      const map = kind === 'data' ? S.data : S.conf;
      const key = (kind === 'data' ? Keys.data : Keys.conf)(S.boardId, this.ikey);
      let v;
      try { v = clone(value); } catch (err) { this.ack(reqId, false, null, 'Value is not JSON-serializable'); return; }
      const has = map.has(this.ikey);
      if (sameJSON(has ? map.get(this.ikey) : null, v) && (v === null || Known.has(key))) { this.ack(reqId, true); return; }
      if (kind === 'data' && has) BoardHistory.guardEmptied(this.ikey, map.get(this.ikey), v);   // e.g. a note cleared: keep a version first
      let p;
      if (v === null) { map.delete(this.ikey); p = Writer.del(key); }
      else { map.set(this.ikey, v); p = Writer.put(key, kind, v); }
      p.then(() => this.ack(reqId, true), err => this.ack(reqId, false, null, err && err.message));
    }

    windowOp(op, args) {
      const inst = this.inst;
      if (!inst) return;
      const posOrNull = v => (typeof v === 'number' && v > 0 && isFinite(v)) ? v : null;
      switch (op) {
        case 'setSize': {
          const cw = posOrNull(args[0]), ch = posOrNull(args[1]);
          if (!cw || !ch) return;
          const view = boundsRect();
          const s = fitSize(cw, ch + TITLE_H, this.constraints(), view);
          const r = resolveMove({ x: inst.rect.x, y: inst.rect.y, w: s.w, h: s.h }, obstacles(this), view, screenPx(RESISTANCE.strong), S.settings.snapping);
          saveInst(this.ikey, Object.assign({}, inst, { rect: r, maximized: false }));
          this.layout(true);
          break;
        }
        case 'setAspectRatio': this.rt.ratio = posOrNull(args[0]); this.refit(); break;
        case 'setMinSize': this.rt.minW = posOrNull(args[0]) || undefined; this.rt.minH = posOrNull(args[1]) || undefined; this.refit(); break;
        case 'setMaxSize': this.rt.maxW = posOrNull(args[0]) || undefined; this.rt.maxH = posOrNull(args[1]) || undefined; this.refit(); break;
        case 'setResizable': this.rt.resizable = args[0] !== false; this.layout(); break;
        case 'setDragFromContent': this.rt.dragFromContent = args[0] !== false; break;
        case 'setTitle': this.subtitle = String(args[0] == null ? '' : args[0]).slice(0, 80); this.renderTitle(); break;
        case 'focus': focusWin(this.ikey); break;
        case 'maximize': setMaximized(this.ikey, true); break;
        case 'restore': setMaximized(this.ikey, false); break;
        case 'close': closeWin(this.ikey); break;
        case 'attention': this.attention(); break;
      }
    }

    // Re-apply size constraints to the saved rect (e.g. after an aspect-ratio change).
    refit() {
      const inst = this.inst, c = this.constraints(), r = inst.rect;
      // Save only a change of shape (aspect ratio). Min/max sizes are applied when drawing, so a size
      // setting that briefly makes a window smaller than its minimum doesn't lose its real size.
      const ratioOff = c.ratio && Math.abs((r.w / Math.max(1, r.h - TITLE_H)) / c.ratio - 1) > 0.01;
      const s = ratioOff ? fitSize(r.w, r.h, c, null) : null;
      if (s && (s.w !== Math.round(r.w) || s.h !== Math.round(r.h))) {
        const cx = inst.rect.x + inst.rect.w / 2;
        saveInst(this.ikey, Object.assign({}, inst, { rect: { x: Math.round(cx - s.w / 2), y: inst.rect.y, w: s.w, h: s.h } }));
        this.layout(true);
      } else this.layout();
    }
  }

  // Messages from widget iframes.
  window.addEventListener('message', e => {
    const m = e.data;
    if (LAB) LabBridge.relayUp(e);
    if (!m || m.b21 !== SDK_PROTOCOL || typeof m.type !== 'string') return;
    if (ORIGIN !== '*' && e.origin !== location.origin) return;
    for (const w of S.wins.values()) {
      if (w.iframe && w.iframe.contentWindow === e.source) { w.handle(m); return; }
    }
  });

  // =====================================================================
  // 8. Window actions
  // =====================================================================
  function maxZ() {
    let z = 0;
    for (const inst of S.insts.values()) if (inst.open) z = Math.max(z, inst.z || 0);
    return z;
  }

  function focusWin(ikey) {
    const inst = S.insts.get(ikey);
    if (!inst || !inst.open) return;
    S.deselected = false;
    const top = maxZ();
    let tie = false;
    for (const [k, i] of S.insts) if (k !== ikey && i.open && i.z === top) tie = true;
    if (inst.z !== top || tie) {
      if (top > 100000) normalizeZ();
      saveInst(ikey, Object.assign({}, inst, { z: maxZ() + 1 }));
    }
    updateFocus();
  }

  function normalizeZ() {
    const open = Array.from(S.insts.entries()).filter(([, i]) => i.open).sort((a, b) => a[1].z - b[1].z);
    open.forEach(([k, i], idx) => saveInst(k, Object.assign({}, i, { z: idx + 1 })));
  }

  function updateFocus() {
    let top = null, topZ = -Infinity;
    for (const [ikey, w] of S.wins) {
      const z = (w.inst && w.inst.z) || 0;
      w.el.style.zIndex = Math.max(1, Math.round(z));
      if (z > topZ) { topZ = z; top = ikey; }
    }
    if (S.deselected) top = null;
    if (S.focused === top) return;
    const prev = S.wins.get(S.focused);
    S.focused = top; // update first, so the old window's info reports focused: false
    if (prev) { prev.el.classList.remove('focused'); prev.post('blur'); prev.notifyInfo(); }
    const cur = S.wins.get(top);
    if (cur) { cur.el.classList.add('focused'); cur.post('focus'); cur.notifyInfo(); }
  }

  // Open a widget: reopen its lowest-numbered closed instance (restoring its data),
  // or create the next instance number if every existing one is already open.
  function openWidget(widgetId, opts = {}) {
    const widget = getWidget(widgetId);
    if (!widget) return null;
    const mine = Array.from(S.insts.values()).filter(i => i.widgetId === widgetId).sort((a, b) => a.n - b.n);
    const closed = mine.find(i => !i.open);
    let ikey, inst;
    if (closed) {
      ikey = ikeyOf(widgetId, closed.n);
      const view = boundsRect();
      let rect = fitRect(closed.rect, constraintsFor(widget), view);
      const obs = obstacles(null);
      if (obs.some(o => overlaps(rect, o))) {
        const spot = findFreeSpot(rect.w, rect.h, view, obs, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
        if (spot) rect = spot;
      }
      inst = Object.assign({}, closed, { open: true, rect, z: maxZ() + 1 });
    } else {
      const used = new Set(mine.map(i => i.n));
      let n = 1;
      while (used.has(n)) n++;
      ikey = ikeyOf(widgetId, n);
      const rect = placeNew(defaultOuterSize(widget), constraintsFor(widget), opts.side);
      inst = { widgetId, n, open: true, rect, z: maxZ() + 1, maximized: false, createdAt: Date.now() };
    }
    S.deselected = false;
    saveInst(ikey, inst);
    reconcileWin(ikey);
    updateFocus();
    Picker.render();
    updateHint();
    if (Settings.isOpen) Settings.render();
    return ikey;
  }

  function constraintsFor(widget) {
    const w = widget.win;
    return { minW: w.minWidth, minH: w.minHeight + TITLE_H, maxW: w.maxWidth, maxH: w.maxHeight + TITLE_H, ratio: w.aspectRatio, resizable: w.resizable };
  }

  async function closeWin(ikey, opts = {}) {
    const inst = S.insts.get(ikey);
    if (!inst || !inst.open) return;
    const w = S.wins.get(ikey);
    if (Menu.win === w) Menu.close();
    if (w && w.connected) { w.post('beforeclose'); await sleep(80); }
    const cur = S.insts.get(ikey);
    if (!cur) return;
    await saveInst(ikey, Object.assign({}, cur, { open: false }));
    reconcileWin(ikey);
    updateFocus(); Picker.render(); updateHint();
    if (Settings.isOpen) Settings.render();
    if (!opts.quiet) {
      let shown = 0;
      try { shown = +localStorage.getItem('21board-tip-close') || 0; } catch (e) { /* ignore */ }
      if (shown < 3) {
        const widget = getWidget(inst.widgetId);
        toast(`${widget ? widget.name : 'Widget'} closed. Its content is saved — open it again from the Widget Picker.`);
        try { localStorage.setItem('21board-tip-close', String(shown + 1)); } catch (e) { /* ignore */ }
      }
    }
  }

  function setMaximized(ikey, on) {
    const inst = S.insts.get(ikey);
    if (!inst || !inst.open || !!inst.maximized === !!on) return;
    saveInst(ikey, Object.assign({}, inst, { maximized: !!on }));
    const w = S.wins.get(ikey);
    if (w) w.layout(true);
    focusWin(ikey);
  }

  // An instance's name as the teacher sees it: "Notes", "Notes 2".
  function instName(widgetId, n) { const w = getWidget(widgetId); return `${w ? w.name : widgetId}${n > 1 || !w ? ' ' + n : ''}`; }

  // Returns the id of the Board history version saved first (for Undo), or null.
  async function resetWin(ikey) {
    const inst = S.insts.get(ikey);
    if (!inst) return null;
    const beforeId = await BoardHistory.before('reset', `Before resetting ${instName(inst.widgetId, inst.n)}`);
    const widget = getWidget(inst.widgetId);
    const b = S.boardId;
    S.data.delete(ikey); S.conf.delete(ikey);
    const def = widget ? defaultOuterSize(widget) : { w: inst.rect.w, h: inst.rect.h };
    const rect = Object.assign({}, inst.rect, { w: def.w, h: def.h });
    await Promise.all([Writer.del(Keys.data(b, ikey)), Writer.del(Keys.conf(b, ikey)), saveInst(ikey, Object.assign({}, inst, { rect, maximized: false }))]);
    Sync.announce([], { op: 'reset', board: b, ikey });
    const w = S.wins.get(ikey);
    if (w) w.reload();
    return beforeId;
  }

  async function deleteInstance(ikey, opts = {}) {
    const i0 = S.insts.get(ikey);
    const beforeId = i0 && opts.history !== false ? await BoardHistory.before('delete', `Before deleting ${instName(i0.widgetId, i0.n)}`) : null;
    const b = S.boardId;
    const w = S.wins.get(ikey);
    if (w) { if (Menu.win === w) Menu.close(); w.destroy(); S.wins.delete(ikey); }
    S.insts.delete(ikey); S.data.delete(ikey); S.conf.delete(ikey);
    await Promise.all([Writer.del(Keys.inst(b, ikey)), Writer.del(Keys.data(b, ikey)), Writer.del(Keys.conf(b, ikey))]);
    afterBulkApply();
    return beforeId;
  }

  async function closeAll() {
    const open = Array.from(S.insts.entries()).filter(([, i]) => i.open).map(([k]) => k);
    const beforeId = open.length ? await BoardHistory.before('close-all', 'Before closing all windows') : null;
    await Promise.all(open.map(k => closeWin(k, { quiet: true })));
    if (open.length) toast(`Closed ${open.length} window${open.length === 1 ? '' : 's'}. Their content is saved.`, undoAction(beforeId));
  }

  let layoutRaf = 0;
  function scheduleLayoutAll() {
    if (layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      updateZoom();
      for (const w of S.wins.values()) {
        const it = Inter.holds(w);
        if (it && it.moved) w.applyRect(it.result || w.disp); // being dragged: redraw at the new zoom, don't snap back
        else w.layout();
      }
      if (Menu.win) Menu.position();
    });
  }

  // =====================================================================
  // 9. Pointer interactions (drag by title bar, resize by grips)
  // ---------------------------------------------------------------------
  // Each pointer gets its own interaction, so two people can move two
  // windows at the same time on a large touchscreen.
  // =====================================================================
  const Inter = {
    map: new Map(),
    raf: 0,
    deferredKeys: new Set(),
    deferredReload: false,
    deferredRebuild: false,
    get active() { return this.map.size > 0; },
    holds(win) { for (const it of this.map.values()) if (it.win === win) return it; return null; },

    // Drags that start inside a widget (section 9a), called once the press has moved past the slop.
    // `key` is the pointerId, or a string for two-finger drags. Fails if someone else has this window.
    beginAt(key, win, x, y, type) {
      if (this.holds(win)) return false;
      this.map.set(key, {
        id: key, win, kind: 'content', handle: null, el: null, type,
        sx: x, sy: y, x, y,
        lx0: (x - Zoom.ox) / Zoom.s, ly0: (y - Zoom.oy) / Zoom.s,
        layoutSig: layoutSig(),
        start: Object.assign({}, win.disp), moved: false, result: null, onLabel: false
      });
      return true;
    },
    moveTo(key, x, y) { this.move({ pointerId: key, clientX: x, clientY: y }); const it = this.map.get(key); return !!(it && it.moved); },
    endFor(key, cancelled) { const it = this.map.get(key); const moved = !!(it && it.moved); this.end({ pointerId: key }, cancelled); return moved; },
    // A window's widget was reloaded or the window closed mid-gesture: its pointers will never report back.
    forget(win, contentOnly) {
      for (const [key, it] of Array.from(this.map)) if (it.win === win && (!contentOnly || it.kind === 'content')) this.end({ pointerId: key }, true);
    },

    begin(e, win, kind, handle, el) {
      for (const it of this.map.values()) if (it.win === win) return;
      const it = {
        id: e.pointerId, win, kind, handle, el, type: e.pointerType,
        sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
        lx0: (e.clientX - Zoom.ox) / Zoom.s, ly0: (e.clientY - Zoom.oy) / Zoom.s, // grab point in layout space
        layoutSig: layoutSig(),
        start: Object.assign({}, win.disp), moved: false, result: null,
        onLabel: kind === 'resize' ? onLabelUnderGrip(e, win, handle) : !!(e.target.closest && e.target.closest('.win-label'))
      };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.map.set(e.pointerId, it);
      if (kind === 'resize') el.classList.add('dragging');
    },

    move(e) {
      const it = this.map.get(e.pointerId);
      if (!it) return;
      it.x = e.clientX; it.y = e.clientY;
      if (!it.moved) {
        if (Math.hypot(it.x - it.sx, it.y - it.sy) < DRAG_THRESHOLD) return;
        it.moved = true;
        document.body.classList.add('busy');
        // Mouse only: let the pointer pass over widget iframes. Touch and pen stay with their element anyway,
        // and other people can keep using (and dragging) the other windows.
        if (it.type === 'mouse') document.body.classList.add('busy-mouse');
        Menu.close();
        if (it.kind === 'title' && it.win.inst.maximized) {
          // Dragging a maximized window restores it under the pointer.
          const inst = it.win.inst;
          const c = it.win.constraints();
          const s = fitSize(inst.rect.w, inst.rect.h, c, boundsRect());
          const px = it.lx0; // pointer in layout space
          const rel = (px - it.start.x) / Math.max(1, it.start.w);
          it.start = { x: px - rel * s.w, y: it.start.y, w: s.w, h: s.h };
          it.win.el.classList.remove('maximized');
          it.unmax = true;
        }
      }
      if (!this.raf) this.raf = requestAnimationFrame(() => this.step());
    },

    step() {
      this.raf = 0;
      const view = boundsRect();
      const brk = S.settings.snapping ? screenPx(RESISTANCE[S.settings.resistance] || RESISTANCE.normal) : 0;
      for (const it of this.map.values()) {
        if (!it.moved) continue;
        // Pointer movement in layout space (stays right even if the zoom changes mid-drag).
        const dx = (it.x - Zoom.ox) / Zoom.s - it.lx0, dy = (it.y - Zoom.oy) / Zoom.s - it.ly0;
        const obs = obstacles(it.win);
        const r = it.kind !== 'resize'
          ? resolveMove({ x: it.start.x + dx, y: it.start.y + dy, w: it.start.w, h: it.start.h }, obs, view, brk, S.settings.snapping)
          : computeResize(it.start, it.handle, dx, dy, it.win.constraints(), view, obs, brk, S.settings.snapping);
        it.result = r;
        it.win.applyRect(r);
      }
    },

    end(e, cancelled) {
      const it = this.map.get(e.pointerId);
      if (!it) return;
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; this.step(); }
      this.map.delete(e.pointerId);
      if (it.el) it.el.classList.remove('dragging');
      const win = it.win;
      // If the board's layout size changed mid-drag ("Use this size" here or in another tab),
      // the drop position is in the old space: drop the move rather than save it wrongly.
      // (A board change from another tab is held until the gesture ends; it may carry a new size or shape.)
      const layoutChanged = it.layoutSig !== layoutSig() || this.deferredKeys.has(Keys.board(S.boardId)) || this.deferredReload || this.deferredRebuild;
      if (it.moved && it.result && !cancelled && win.inst && !layoutChanged) {
        const r = it.result, q = v => Math.round(v * 100) / 100; // sub-pixel, so zoomed drags don't drift
        saveInst(win.ikey, Object.assign({}, win.inst, { rect: { x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h) }, maximized: false }));
        win.layout();
      } else if (it.moved) {
        win.layout();
      } else if (it.kind === 'resize' && it.onLabel && !cancelled) {
        Menu.toggle(win);   // a tap on the window name where the top handle overlaps it: the name wins
      } else if (it.kind === 'title' && !cancelled) {
        if (it.onLabel) Menu.toggle(win);
        else {
          const now = Date.now();
          if (now - win.lastTitleTap < 350) { win.lastTitleTap = 0; setMaximized(win.ikey, !win.inst.maximized); }
          else win.lastTitleTap = now;
        }
      }
      if (![...this.map.values()].some(o => o.moved && o.type === 'mouse')) document.body.classList.remove('busy-mouse');
      if (!this.active) {
        document.body.classList.remove('busy');
        if (this.deferredRebuild) { this.deferredRebuild = this.deferredReload = false; this.deferredKeys.clear(); rebuildAll(); }
        else if (this.deferredReload) { this.deferredReload = false; this.deferredKeys.clear(); reloadAll(); }
        else if (this.deferredKeys.size) { const keys = Array.from(this.deferredKeys); this.deferredKeys.clear(); applyKeys(keys); }
      }
    }
  };

  // =====================================================================
  // 9a. Moving windows by their content
  // ---------------------------------------------------------------------
  // - Click-only widgets (registry window.dragFromContent, default true): drag
  //   anywhere inside the window with one finger or the mouse. A tap is still
  //   a tap: a press only becomes a window drag once it moves past the slop
  //   (touch uses the browser's own tap allowance), and then the widget doesn't
  //   get the click or the release, so a button you started on doesn't fire.
  // - Every widget: two fingers of one hand anywhere inside move the window (for
  //   widgets that need drags themselves: typing/selecting text). Two touches far
  //   apart are two people, not a drag.
  // - Never started from: text fields, sliders, selects, canvas/video, editable
  //   or explicitly selectable text, scrolling areas (incl. a scrolling page),
  //   elements that handle touch themselves (touch-action other than auto /
  //   manipulation), draggable="true", anything inside [data-b21-nodrag], or a
  //   press the widget already handled (preventDefault on pointerdown or touchstart,
  //   or pointer capture). Two-finger moves skip [data-b21-nodrag], canvas, video
  //   and touch-handling elements.
  // - A press claims nothing until it moves, so a finger resting in a widget
  //   never blocks someone else from moving or resizing that window.
  // Widgets are same-origin, so the board listens inside each iframe; nothing
  // here is needed from the widget. Settings → Windows can switch it off.
  // =====================================================================
  const CONTENT_SLOP = { mouse: 6, pen: 10, touch: 16 };   // screen px before a press inside a widget moves the window
  const TWO_FINGER_SPAN = 260;                              // farther apart than this = two people

  // Walk up through shadow roots too (widgets built from web components).
  const parentOf = n => n.parentElement || (n.parentNode && n.parentNode.host) || null;
  const handlesTouch = cs => !/^(auto|manipulation)$/.test(cs.touchAction) && !/pan-x.*pan-y|pan-y.*pan-x/.test(cs.touchAction);

  function noContentDrag(el, cw) {
    const doc = cw.document;
    for (let n = el; n && n.nodeType === 1; n = parentOf(n)) {
      const tag = n.tagName;
      if (n.hasAttribute('data-b21-nodrag') || n.isContentEditable || n.getAttribute('draggable') === 'true') return true;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'IFRAME') return true;
      if (tag === 'INPUT' && !/^(button|submit|reset|checkbox|radio|color|file|image)$/i.test(n.type || '')) return true;
      const cs = cw.getComputedStyle(n);
      if (cs.userSelect === 'text' || cs.webkitUserSelect === 'text') return true;
      if (handlesTouch(cs)) return true;
      if ((/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) ||
          (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1)) return true;
    }
    // A page that scrolls as a whole is a scrolling area too. (The viewport takes html's overflow,
    // or body's when html's is 'visible'.)
    const de = doc.documentElement, se = doc.scrollingElement || de;
    const hs = cw.getComputedStyle(de), bs = doc.body ? cw.getComputedStyle(doc.body) : hs;
    const vp = a => (hs[a] !== 'visible' ? hs[a] : bs[a]);
    const clip = v => /hidden|clip/.test(v);
    if (!clip(vp('overflowY')) && se.scrollHeight > de.clientHeight + 1) return true;
    if (!clip(vp('overflowX')) && se.scrollWidth > de.clientWidth + 1) return true;
    return false;
  }

  function noTwoFingerDrag(el, cw) {
    for (let n = el; n && n.nodeType === 1; n = parentOf(n)) {
      if (n.hasAttribute('data-b21-nodrag') || n.tagName === 'CANVAS' || n.tagName === 'VIDEO') return true;
      if (handlesTouch(cw.getComputedStyle(n))) return true;
    }
    return false;
  }

  function attachContentDrag(win) {
    let cw;
    try { cw = win.iframe.contentWindow; if (!cw || !cw.document) return; } catch (e) { return; } // cross-origin: title bar only
    const frame = win.iframe, doc = cw.document;
    // Widget point -> board point. Read when each event arrives (the window moves under the finger).
    const toBoard = (x, y) => {
      const r = frame.getBoundingClientRect();
      const k = frame.clientWidth ? r.width / frame.clientWidth : 1;
      return { x: r.left + x * k, y: r.top + y * k };
    };
    const enabled = () => S.settings.dragFromContent !== false;
    const origin = e => (e.composedPath && e.composedPath()[0]) || e.target;
    const singles = new Map();   // pointerId -> { type, target, x, y (board point at press), started }
    const touches = new Map();   // touch pointerId -> { p: board point, target }
    let two = null;              // { key, ids, start, started }
    let lastTouchDown = null;
    const follows = new Map();   // pointerId -> remove the listeners on a pressed element (see followPress)
    let swallowClickUntil = 0, swallowUpsUntil = 0;

    const centroid = () => {
      const [a, b] = two.ids.map(id => touches.get(id).p);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const endTwo = cancelled => { const t = two; two = null; if (t && t.started) Inter.endFor(t.key, cancelled); return !!(t && t.started); };
    // The widget no longer gets this pointer (its fingers are moving the window): let it drop what it started.
    const cancelForApp = (id, target) => {
      try { target.dispatchEvent(new cw.PointerEvent('pointercancel', { pointerId: id, pointerType: 'touch', bubbles: true, composed: true })); } catch (err) { /* ignore */ }
    };
    // Is a finger here possibly moving this window? (Used to stop the browser panning it away.)
    win.contentBusy = () => !!two || Array.from(singles).some(([id, s]) => s.type !== 'mouse' && (!s.started || Inter.map.has(id)));
    // A new first finger means no other finger is down anywhere: anything still remembered is stale.
    win.contentReset = () => {
      follows.forEach(off => off()); follows.clear();
      touches.clear(); two = null;
      for (const [id, s] of singles) if (s.type !== 'mouse') singles.delete(id);
    };

    // Capture phase: see every finger, even in widgets that stop propagation.
    cw.addEventListener('pointerdown', e => {
      swallowClickUntil = swallowUpsUntil = 0;   // a new press: whatever click comes next is its own
      // One mouse: an earlier mouse press here is over (its release may have gone to the board).
      if (e.pointerType === 'mouse') for (const [id, s] of singles) if (s.type === 'mouse') singles.delete(id);
      if (e.pointerType === 'touch' && e.isPrimary) forgetStaleTouches(e.pointerId);
      if (e.pointerType !== 'mouse') followPress(e);
      if (e.pointerType !== 'touch') return;
      const target = origin(e);
      touches.set(e.pointerId, { p: toBoard(e.clientX, e.clientY), target });
      lastTouchDown = e.pointerId;
      // Second finger: maybe a two-finger move (any widget), unless a one-finger drag is already moving it.
      if (!enabled() || two || touches.size !== 2) return;
      const ids = Array.from(touches.keys());
      if (ids.some(id => singles.has(id) && singles.get(id).started)) return;
      ids.forEach(id => singles.delete(id));
      if (!win.inst || win.inst.maximized) return;
      const [a, b] = ids.map(id => touches.get(id));
      if (Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) > TWO_FINGER_SPAN) return;
      if (ids.some(id => noTwoFingerDrag(touches.get(id).target, cw))) return;
      two = { key: 'two:' + win.ikey, ids, started: false };
      two.start = centroid();
    }, true);

    // Bubble phase: after the widget's own handlers, so e.defaultPrevented is meaningful.
    cw.addEventListener('pointerdown', e => {
      if (!enabled() || two || !win.canDragFromContent()) return;
      if (e.pointerType === 'touch' && touches.size > 1) return;
      if (e.defaultPrevented || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const target = origin(e);
      if (noContentDrag(target, cw)) return;
      const p = toBoard(e.clientX, e.clientY);
      singles.set(e.pointerId, { type: e.pointerType, target, x: p.x, y: p.y, started: false });
    });

    const onMove = e => {
      const id = e.pointerId;
      const t = touches.get(id);
      if (t) t.p = toBoard(e.clientX, e.clientY);
      if (two && two.ids.includes(id)) {
        const c = centroid();
        if (!two.started) {
          if (Math.hypot(c.x - two.start.x, c.y - two.start.y) < CONTENT_SLOP.touch) return;
          if (!Inter.beginAt(two.key, win, two.start.x, two.start.y, 'touch')) { two = null; return; }
          two.started = true;
          two.ids.forEach(i => cancelForApp(i, touches.get(i).target));
        }
        Inter.moveTo(two.key, c.x, c.y);
        e.stopImmediatePropagation();
        return;
      }
      const s = singles.get(id);
      if (!s) return;
      if (s.started && !Inter.map.has(id)) { singles.delete(id); return; }   // ended on the board side
      const p = toBoard(e.clientX, e.clientY);
      if (!s.started) {
        if (Math.hypot(p.x - s.x, p.y - s.y) < (CONTENT_SLOP[s.type] || CONTENT_SLOP.mouse)) return;
        if (!Inter.beginAt(id, win, s.x, s.y, s.type)) { singles.delete(id); return; }
        s.started = true;
        // Capture on the page itself, which the widget can't re-render away mid-drag.
        try { doc.documentElement.setPointerCapture(id); } catch (err) { /* ignore */ }
        try { cw.getSelection().removeAllRanges(); } catch (err) { /* ignore */ }
      }
      Inter.moveTo(id, p.x, p.y);
      e.stopImmediatePropagation();
    };
    cw.addEventListener('pointermove', onMove, true);

    const finish = e => {
      if (!e.isTrusted) return;   // our own pointercancel for the widget
      const id = e.pointerId, cancelled = e.type === 'pointercancel';
      const off = follows.get(id); if (off) { follows.delete(id); off(); }
      touches.delete(id);
      if (two && two.ids.includes(id)) {
        if (endTwo(cancelled)) { e.stopImmediatePropagation(); swallowUpsUntil = Date.now() + 80; }
        return;
      }
      const s = singles.get(id);
      if (!s) return;
      singles.delete(id);
      if (!s.started) return;
      Inter.endFor(id, cancelled);
      // The release of a window drag is not a tap: the widget gets neither it nor (for the mouse) the click.
      e.stopImmediatePropagation();
      swallowUpsUntil = Date.now() + 80;
      if (s.type === 'mouse') swallowClickUntil = Date.now() + 500;
    };
    cw.addEventListener('pointerup', finish, true);
    cw.addEventListener('pointercancel', finish, true);

    // While a finger may be moving a window, stop the browser panning (which would cancel it), whatever
    // other fingers are on the screen. (If the touch sequence began on the board itself, its touch events
    // go to the board's document instead; the board checks win.contentBusy there.)
    const onTouchMove = e => { if (e.cancelable && win.contentBusy()) e.preventDefault(); };
    cw.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });

    // A finger's events keep going to the element it pressed, even after the widget removes that element
    // (re-rendering an icon, say), and then they no longer reach this window. Follow them there too.
    function followPress(e) {
      const n = e.target, id = e.pointerId;
      const gone = ev => !ev.target.isConnected;   // still connected: the window listeners see it anyway
      const pm = ev => { if (ev.pointerId === id && gone(ev)) onMove(ev); };
      const tm = ev => { if (gone(ev)) onTouchMove(ev); };
      const fin = ev => { if (ev.pointerId !== id) return; if (gone(ev)) finish(ev); else off(); };
      const off = () => {
        follows.delete(id);
        n.removeEventListener('pointermove', pm);
        n.removeEventListener('pointerup', fin);
        n.removeEventListener('pointercancel', fin);
        n.removeEventListener('touchmove', tm);
      };
      if (follows.has(id)) follows.get(id)();
      follows.set(id, off);
      n.addEventListener('pointermove', pm);
      n.addEventListener('pointerup', fin);
      n.addEventListener('pointercancel', fin);
      n.addEventListener('touchmove', tm, { passive: false });
    }

    cw.addEventListener('gotpointercapture', e => {
      const s = singles.get(e.pointerId);
      // Touch is captured to its own element automatically; any other capture is the widget's.
      if (s && !s.started && (s.type === 'mouse' || origin(e) !== s.target)) singles.delete(e.pointerId);
    }, true);
    // The widget cancelled the touch (a swipe widget): it's the widget's gesture.
    cw.addEventListener('touchstart', e => {
      if (e.defaultPrevented && lastTouchDown !== null) { const s = singles.get(lastTouchDown); if (s && !s.started) singles.delete(lastTouchDown); }
      lastTouchDown = null;
    });

    // A press that became a window drag must not also click (or release on) whatever it started on.
    cw.addEventListener('click', e => {
      if (Date.now() < swallowClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
      swallowClickUntil = 0;
      const s = singles.get(e.pointerId);
      if (s && !s.started) singles.delete(e.pointerId);   // that press ended as a tap
    }, true);
    const eatUp = e => { if (Date.now() < swallowUpsUntil) e.stopImmediatePropagation(); };
    cw.addEventListener('mouseup', eatUp, true);
    cw.addEventListener('touchend', eatUp, true);
    // No native image/link drag-and-drop while a mouse press may move the window.
    cw.addEventListener('dragstart', e => { if (Array.from(singles.values()).some(s => s.type === 'mouse')) e.preventDefault(); }, true);
  }

  // A touch that is the only finger on the screen (isPrimary, shared by the board and its widgets) means any
  // finger still remembered from before never reported its release: end those, so nothing stays held.
  function forgetStaleTouches(exceptId) {
    for (const [key, it] of Array.from(Inter.map)) if (it.type === 'touch' && key !== exceptId) Inter.end({ pointerId: key }, false);
    for (const w of S.wins.values()) if (w.contentReset) w.contentReset();
  }

  // Tapping the empty board deselects every window, hiding all resize grips.
  function deselectAll() {
    if (S.deselected && S.focused === null) return;
    for (const it of Inter.map.values()) if (it.win.ikey === S.focused) return; // still being moved/resized
    S.deselected = true;
    updateFocus();
  }

  // The top handle of a window at the board's top edge reaches into the title bar and can overlap the
  // window name. A tap there still opens the menu; a drag resizes.
  function onLabelUnderGrip(e, win, handle) {
    if (handle !== 'n' || !win.labelEl) return false;
    const r = win.labelEl.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  function onDeskPointerDown(e) {
    const winEl = e.target.closest && e.target.closest('.win');
    if (!winEl) { deselectAll(); return; }
    const win = S.wins.get(winEl.dataset.ikey);
    if (!win) return;
    focusWin(win.ikey);
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    const grip = e.target.closest('.grip');
    if (grip) {
      e.preventDefault();
      if (Menu.win && !(Menu.win === win && onLabelUnderGrip(e, win, grip.dataset.h))) Menu.close();   // a tap on the name toggles it
      Inter.begin(e, win, 'resize', grip.dataset.h, grip);
      return;
    }
    const title = e.target.closest('.win-title');
    if (title) {
      e.preventDefault();
      if (Menu.win && Menu.win !== win) Menu.close();
      Inter.begin(e, win, 'title', null, title);
    }
  }

  // =====================================================================
  // 10. Widget Picker panel
  // =====================================================================
  const Picker = {
    side: null,
    btns: {},
    el: null,

    init() {
      this.el = $('#panel');
      for (const side of ['left', 'right']) {
        const b = $(`.picker-btn.${side}`);
        b.innerHTML = svg('waffle', 'fill');
        b.addEventListener('click', () => this.toggle(side));
        this.btns[side] = b;
      }
      $('.panel-controls', this.el).addEventListener('click', e => {
        const b = e.target.closest('[data-ctl]');
        if (b) this.control(b.dataset.ctl);
      });
      $('.panel-widgets', this.el).addEventListener('click', e => {
        const t = e.target.closest('[data-widget]');
        if (!t) return;
        const side = this.side;
        this.close();
        openWidget(t.dataset.widget, { side });
      });
    },

    toggle(side) { if (this.side === side) this.close(); else this.open(side); },

    open(side) {
      closePopups();
      this.side = side;
      this.render();
      this.renderControls();
      this.el.classList.remove('left', 'right');
      this.el.classList.add(side, 'open');
      for (const s of ['left', 'right']) {
        this.btns[s].classList.toggle('active', s === side);
        this.btns[s].setAttribute('aria-expanded', String(s === side));
      }
    },

    close() {
      if (!this.side) return;
      this.side = null;
      this.el.classList.remove('open');
      for (const s of ['left', 'right']) { this.btns[s].classList.remove('active'); this.btns[s].setAttribute('aria-expanded', 'false'); }
    },

    render() {
      if (!this.el) return;
      const counts = new Map();
      for (const inst of S.insts.values()) if (inst.open) counts.set(inst.widgetId, (counts.get(inst.widgetId) || 0) + 1);
      const widgets = pickerWidgets();
      const cols = window.innerWidth / Zoom.ui < 440 ? 3 : 4;   // the panel is drawn at Zoom.ui
      this.el.style.setProperty('--cols', String(cols));
      $('.panel-widgets', this.el).innerHTML = widgets.map(a => {
        const c = counts.get(a.id) || 0;
        return `<button class="widget-tile" role="listitem" data-widget="${esc(a.id)}" title="${esc(a.description || a.name)}">` +
          `<span class="widget-icon" style="--c:${esc(a.color)}">${a.icon}</span><span>${esc(a.name)}</span>` +
          (c ? `<span class="badge" aria-label="${c} open">${c}</span>` : '') +
          (a.dev || a.devOnly ? '<span class="devtag">DEV</span>' : '') + '</button>';
      }).join('') || '<div class="empty-note" style="grid-column:1/-1;padding:16px">No widgets installed.</div>';
    },

    renderControls() {
      if (!this.el) return;
      const dark = resolvedTheme() === 'dark';
      const fsOn = !!(document.fullscreenElement || document.webkitFullscreenElement);
      const set = (ctl, icon, label) => { const b = $(`[data-ctl="${ctl}"]`, this.el); b.innerHTML = svg(icon); b.title = label; b.setAttribute('aria-label', label); return b; };
      set('export', 'export', 'Export board');
      set('import', 'import', 'Import board');
      set('theme', dark ? 'sun' : 'moon', dark ? 'Light mode' : 'Dark mode');
      const fs = set('fullscreen', fsOn ? 'fullscreenExit' : 'fullscreen', fsOn ? 'Exit fullscreen' : 'Fullscreen');
      fs.hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
      set('settings', 'gear', 'Settings');
      for (const s of ['left', 'right']) {
        let dot = $('.dot', this.btns[s]);
        if (S.sw.updateReady && !dot) { dot = document.createElement('span'); dot.className = 'dot'; this.btns[s].appendChild(dot); }
        if (!S.sw.updateReady && dot) dot.remove();
      }
    },

    control(ctl) {
      const side = this.side || 'left';
      switch (ctl) {
        case 'export': this.close(); exportFlow(); break;
        case 'import': this.close(); $('#import-input').click(); break;
        case 'theme': updateSettings({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' }); this.renderControls(); break;
        case 'fullscreen': toggleFullscreen(); break;
        case 'settings': this.close(); Settings.open(side); break;
      }
    }
  };

  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    const on = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (on) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (err) { toast('Fullscreen is not available here.'); }
  }

  // =====================================================================
  // 11. Window menu
  // =====================================================================
  const Menu = {
    el: null,
    win: null,
    confirming: false,

    init() {
      this.el = $('#menu');
      this.el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        this.act(b.dataset.act, b.dataset.id);
      });
    },

    toggle(win) { if (this.win === win) this.close(); else this.open(win); },

    open(win) {
      closePopups();
      this.win = win;
      this.confirming = false;
      win.labelEl.classList.add('open');
      this.render();
      this.el.classList.add('open');
      this.position();
      const first = $('button', this.el);
      if (first && document.activeElement === win.labelEl) first.focus();
    },

    close() {
      if (!this.win) return;
      this.win.labelEl.classList.remove('open');
      this.win = null;
      this.el.classList.remove('open');
    },

    render() {
      const w = this.win;
      if (!w) return;
      const item = (act, icon, label, extra = '', cls = '') =>
        `<button class="menu-item ${cls}" role="menuitem" data-act="${act}" ${extra}><span class="icon-slot">${icon}</span><span class="label">${esc(label)}</span></button>`;
      if (this.confirming) {
        const name = `${w.widget.name}${w.inst.n > 1 ? ' ' + w.inst.n : ''}`;
        this.el.innerHTML = `<div class="menu-confirm"><b>Reset ${esc(name)}?</b><br>This clears everything saved in this window and returns it to its starting size. Board history keeps a copy.</div>` +
          item('reset-yes', svg('reset'), 'Reset', '', 'danger') + item('reset-no', '', 'Cancel');
        return;
      }
      let html = '';
      for (const i of w.menuItems) {
        if (i.separator) { html += '<div class="menu-sep"></div>'; continue; }
        if (i.heading) { html += `<div class="menu-heading">${esc(i.label)}</div>`; continue; }
        if (i.swatches) {
          // A row of color choices; background (optional) shows the color on what it will be used on.
          html += `<div class="menu-swatches" role="group" aria-label="${esc(i.label)}">` + i.swatches.map(s =>
            `<button class="swatch" role="menuitemradio" aria-checked="${s.checked}" aria-label="${esc(s.label)}" title="${esc(s.label)}" ` +
            `data-act="widget" data-id="${esc(s.id)}" style="--sw:${s.color};--swbg:${s.background || s.color}"></button>`).join('') + '</div>';
          continue;
        }
        const check = i.checked === true ? svg('check', 'check') : '';
        html += `<button class="menu-item" role="${i.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}" ${i.checked !== undefined ? `aria-checked="${i.checked}"` : ''} data-act="widget" data-id="${esc(i.id)}" ${i.disabled ? 'disabled' : ''}>` +
          `<span class="icon-slot">${i.icon || ''}</span><span class="label">${esc(i.label)}</span>${check}</button>`;
      }
      if (html) html += '<div class="menu-sep"></div>';
      html += w.inst.maximized ? item('restore', svg('restore'), 'Restore size') : item('maximize', svg('maximize'), 'Fill the board');
      if (BoardHistory.hasWindow(w.ikey)) html += item('history', svg('history'), 'Earlier versions…');
      html += item('reset', svg('reset'), 'Reset');
      html += item('close', svg('close'), 'Close');
      this.el.innerHTML = html;
    },

    position() {
      const w = this.win;
      if (!w) return;
      const a = w.labelEl.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight, M = 8, GAP = 6;
      // offsetWidth/Height: layout size, unaffected by the menu's scale-in animation.
      // (The CSS max-height is lifted while measuring so the full height is seen.)
      const ui = Zoom.ui;   // the menu is drawn at this zoom (CSS zoom: var(--ui)), so its px are scaled
      const size = () => ({ width: this.el.offsetWidth * ui, height: this.el.offsetHeight * ui });
      // A menu taller than the whole screen gets tighter rows first (it should never need scrolling).
      this.el.classList.remove('compact', 'tight', 'cols');
      this.el.style.gridTemplateRows = '';
      this.el.style.maxHeight = 'none';
      let m = size();
      if (m.height > vh - 2 * M) { this.el.classList.add('compact'); m = size(); }
      if (m.height > vh - 2 * M) { this.el.classList.add('tight'); m = size(); }
      if (m.height > vh - 2 * M) {
        // Still too tall: two columns.
        this.el.classList.add('cols');
        this.el.style.gridTemplateRows = `repeat(${Math.ceil(this.el.children.length / 2)}, auto)`;
        m = size();
      }
      this.el.style.maxHeight = '';
      const below = vh - a.bottom - GAP - M, above = a.top - GAP - M;
      let x, y;
      if (m.height <= below || m.height <= above) {
        // Below the title if it fits, else above, centered on the title.
        x = clamp(a.left + a.width / 2 - m.width / 2, M, vw - m.width - M);
        y = m.height <= below ? a.bottom + GAP : a.top - m.height - GAP;
      } else {
        // Neither fits: open beside the title, as high as it can while staying fully on screen.
        y = clamp(a.top, M, Math.max(M, vh - m.height - M));
        if (a.right + GAP + m.width <= vw - M) x = a.right + GAP;
        else if (a.left - GAP - m.width >= M) x = a.left - GAP - m.width;
        else x = clamp(a.left + a.width / 2 - m.width / 2, M, vw - m.width - M);
      }
      this.el.style.left = x / ui + 'px';
      this.el.style.top = y / ui + 'px';
    },

    act(act, id) {
      const w = this.win;
      if (!w) return;
      switch (act) {
        case 'widget': w.post('menu', { id }); this.close(); break;
        case 'maximize': this.close(); setMaximized(w.ikey, true); break;
        case 'restore': this.close(); setMaximized(w.ikey, false); break;
        case 'reset': this.confirming = true; this.render(); this.position(); break;
        case 'reset-yes': {
          this.close();
          const ik = w.ikey, name = instName(w.inst.widgetId, w.inst.n);
          resetWin(ik).then(id => toast(`${name} was reset.`, id ? { action: 'Undo', timeout: 15000, onAction: () => BoardHistory.putBack(id, ik, { exact: true, quiet: true }) } : {}));
          break;
        }
        case 'history': this.close(); HistorySheet.open(Settings.side || 'left', { ikey: w.ikey }); break;
        case 'reset-no': this.confirming = false; this.render(); this.position(); break;
        case 'close': this.close(); closeWin(w.ikey); break;
      }
    }
  };

  // =====================================================================
  // 12. Settings
  // =====================================================================
  // Settings → Appearance → Background photo.
  function photoRow(sw, seg) {
    const m = BoardPhoto.media(), im = BoardPhoto.settings();
    if (!m || !im) {
      return `<div class="row"><div><div class="lbl">Background photo</div><div class="hint">A picture from this device (or Google Drive on a Chromebook). It's kept on this device and in full backups, not in templates.</div></div>
        <button class="btn" data-act="photo-add">${svg('image')}Add photo…</button></div>`;
    }
    const g = photoThumbGeometry(m, im), fill = im.fit === 'fill';
    // Shaped like the board, but never taller than about 200 px (a portrait window would make it huge).
    return `<div class="row stack"><div><div class="lbl">Background photo</div><div class="hint">${fill ? 'Tap the picture to choose the part that always stays in view.' : 'The whole photo is shown; the background color fills the rest.'}</div></div>
      <div class="photo-edit">
        <div class="photo-thumb${im.on ? '' : ' off'}${fill ? ' pick' : ''}" id="photo-thumb"${fill ? ' role="button" tabindex="0" aria-label="Choose the part of the photo that stays in view (tap, or use the arrow keys)"' : ' role="img" aria-label="Background photo"'}
          style="aspect-ratio:${g.ratio.toFixed(4)};width:min(100%, ${Math.round(200 * g.ratio)}px);background-size:${fill ? 'cover' : 'contain'};background-position:${photoPosition(im)};--fade:${im.fade}">
          ${fill ? `<span class="focus" style="left:${(g.mx * 100).toFixed(2)}%;top:${(g.my * 100).toFixed(2)}%"></span>` : ''}</div>
        <div class="photo-ctrls">
          <div class="line"><span>Show photo</span>${sw('photo-on', im.on, 'Show photo')}</div>
          <div class="line"><span>Fit</span>${seg('photo-fit', im.fit, [['fill', 'Fill the board'], ['whole', 'Whole photo']])}</div>
          <label class="line"><span>Fade</span><input type="range" id="photo-fade" min="0" max="70" step="5" value="${Math.round(im.fade * 100)}" aria-label="Fade the photo"></label>
          <div class="line end"><button class="btn small" data-act="photo-add">Change…</button><button class="btn small danger" data-act="photo-remove">Remove</button></div>
        </div>
      </div></div>`;
  }
  // Where the photo sits in a box shaped like the board (fractions of the box), and the focus marker.
  function photoThumbGeometry(m, im) {
    const ratio = freeShape() ? (Zoom.vw || 16) / (Zoom.vh || 9) : 16 / 9;
    const W = 1, H = 1 / ratio, ia = m.w / m.h;
    const k = im.fit === 'whole' ? Math.min(W / ia, H) : Math.max(W / ia, H);   // image height in box units
    const dw = k * ia, dh = k;
    const f = im.fit === 'whole' ? { x: 0.5, y: 0.5 } : im.focus;   // as photoPosition()
    const ox = (W - dw) * f.x, oy = (H - dh) * f.y;
    return { ratio, dw, dh, ox, oy, W, H, mx: (ox + f.x * dw) / W, my: (oy + f.y * dh) / H };
  }

  // Settings → Google Drive folder (section 13b).
  function linkSettings(sw) {
    const L = Link;
    if (!L.dir) {
      return `<h3>Google Drive folder</h3>
        <div class="row stack"><div><div class="lbl">Share boards with your other devices</div><div class="hint">Choose the same folder in Google Drive on each device, for example My Drive › 21Board (make it first). Google Drive keeps it the same everywhere: send a board from your laptop, and the smartboard offers to load it. 21Board keeps one file per board there.</div></div>
          <button class="btn primary" data-act="link-choose">${svg('send')}Choose folder…</button></div>`;
    }
    const dev = L.device(), uid = S.board.uid, rec = L.boardRec(uid) || {};
    const status = [rec.sentAt ? `Sent from here ${when(rec.sentAt)}.` : '', rec.loadedSentAt ? `Loaded the version from ${rec.loadedFrom || 'another device'} sent ${when(rec.loadedSentAt)}.` : ''].filter(Boolean).join(' ') || 'Not sent from here yet.';
    const others = L.found.filter(f => f.kind === 'full' && f.uid !== uid);
    const mine = L.found.find(f => f.name === rec.file && f.uid === uid) || L.found.find(f => f.uid === uid && f.vid);
    const perm = L.perm === 'granted' ? '' : `<div class="row"><div><div class="lbl">Allow 21Board to use the folder</div><div class="hint">Chrome asks again after a restart unless 21Board is installed (or you chose “Allow on every visit”).</div></div><button class="btn primary" data-act="link-reconnect">Allow…</button></div>`;
    return `<h3>Google Drive folder</h3>
      <div class="row"><div><div class="lbl">Folder: ${esc(L.dir.name)}</div><div class="hint">${esc(status)}${L.offer ? ` <b>A newer version from ${esc(L.offer.from || 'another device')} is waiting.</b>` : ''}</div></div>
        <div style="display:flex;gap:6px;flex:0 0 auto"><button class="btn small" data-act="link-choose">Change…</button><button class="btn small" data-act="link-unlink">Unlink</button></div></div>
      ${perm}
      <div class="row"><div><div class="lbl">Send this board</div><div class="hint">${mine ? `In the folder as “${esc(mine.name)}”.` : 'Saves it into the folder for your other devices.'}</div></div>
        <div style="display:flex;gap:6px;flex:0 0 auto">${L.offer ? '<button class="btn small" data-act="link-load-offer">Load newer</button>' : ''}<button class="btn small primary" data-act="link-send">${svg('send')}Send</button></div></div>
      <div class="row"><div><div class="lbl">Send automatically</div><div class="hint">A few seconds after each change, while 21Board is open.</div></div>${sw('link-auto', L.st.auto, 'Send automatically')}</div>
      <div class="row"><div><div class="lbl">Include the background photo</div><div class="hint">Off: each device keeps its own photo (a received board without one keeps this device's).</div></div>${sw('link-photo', L.st.photo, 'Include the background photo')}</div>
      <div class="row stack"><label class="lbl" for="set-link-label">This device's name <span class="hint">(shown on your other devices: “updated on …”)</span></label>
        <input type="text" class="text-input" id="set-link-label" maxlength="40" value="${esc(dev.label)}" autocomplete="off"></div>
      <div class="row stack"><div><div class="lbl">Other boards in the folder</div><div class="hint">Load one to show it on this device (it replaces this board). After that, this device offers its newer versions.</div></div>
        <div class="inst-list">${others.length ? others.map(f => `<div class="inst"><span class="widget-icon" style="--c:var(--primary)">${svg('send')}</span><div class="meta"><b>${esc(f.title)}</b><span>From ${esc(f.from || 'another device')} ${esc(when(f.sentAt))}</span></div><button class="btn small" data-act="link-load" data-val="${esc(f.name)}">Load</button></div>`).join('') : `<div class="empty-note">${L.perm === 'granted' ? 'None yet.' : 'Allow 21Board to use the folder to see them.'}</div>`}</div>
        <div><button class="btn small" data-act="link-check">Check the folder now</button></div></div>`;
  }

  const Settings = {
    el: null,
    body: null,
    side: 'left',
    isOpen: false,

    init() {
      this.el = $('#settings');
      this.body = $('.sheet-body', this.el);
      const closeBtn = $('[data-close]', this.el);
      closeBtn.innerHTML = svg('close');
      closeBtn.addEventListener('click', () => this.close());
      this.body.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (b && !b.disabled) this.act(b.dataset.act, b.dataset.val, b);
      });
      this.body.addEventListener('change', e => {
        if (e.target.id === 'set-link-label') {
          const label = e.target.value.trim().slice(0, 40);
          if (label) Link.saveState({ device: Object.assign({}, Link.device(), { label }) });
        }
        if (e.target.id === 'set-board-name') {
          const name = e.target.value.trim().slice(0, 60) || 'My Board';
          updateBoard({ name });
        }
      });
      this.body.addEventListener('input', e => {
        if (e.target.id === 'set-bg-custom') updateBoard({ background: Object.assign({}, S.board.background, { color: e.target.value }) });
        if (e.target.id === 'photo-fade') {
          const fade = Math.max(0, Math.min(0.7, e.target.value / 100));
          BoardPhoto.update({ fade });
          const th = $('#photo-thumb', this.body); if (th) th.style.setProperty('--fade', String(fade));
        }
      });
      // Tap the preview: that spot of the photo stays in view however the board is shaped. A tap, not a
      // press: a finger swiping over the preview to scroll Settings must not move the photo.
      const clamp01 = x => Math.max(0, Math.min(1, x));
      const setFocus = focus => { BoardPhoto.update({ focus }); this.render(); };
      let press = null;
      this.body.addEventListener('pointerdown', e => {
        const th = e.target.closest('#photo-thumb.pick');
        press = th && e.isPrimary && e.button === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY, th } : null;
      });
      this.body.addEventListener('pointercancel', () => { press = null; });   // the browser took it for scrolling
      this.body.addEventListener('pointerup', e => {
        const p = press; press = null;
        if (!p || p.id !== e.pointerId || !p.th.isConnected || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) return;
        const m = BoardPhoto.media(), im = BoardPhoto.settings();
        if (!m || !im || im.fit !== 'fill') return;
        const r = p.th.getBoundingClientRect(), g = photoThumbGeometry(m, im);
        const u = (e.clientX - r.left) / r.width * g.W, v = (e.clientY - r.top) / r.height * g.H;
        setFocus({ x: clamp01((u - g.ox) / g.dw), y: clamp01((v - g.oy) / g.dh) });
      });
      // Keyboard: arrow keys move the spot that stays in view.
      this.body.addEventListener('keydown', e => {
        if (!e.target.matches || !e.target.matches('#photo-thumb.pick')) return;
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        const im = BoardPhoto.settings();
        if (!d || !im) return;
        e.preventDefault();
        const step = e.shiftKey ? 0.2 : 0.05;
        setFocus({ x: clamp01(im.focus.x + d[0] * step), y: clamp01(im.focus.y + d[1] * step) });
        const th = $('#photo-thumb', this.body); if (th) th.focus({ preventScroll: true });
      });
      $('#photo-input').addEventListener('change', async e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try { await BoardPhoto.setFromFile(f); }
        catch (err) { await dialog({ title: 'Can’t use this picture', message: err.message, actions: [{ label: 'OK', value: true, kind: 'primary' }] }); }
        if (this.isOpen) this.render();
      });
      this.body.addEventListener('keydown', e => {
        if (e.target.id === 'set-dev-path' && e.key === 'Enter') this.act('dev-add');
        if (e.target.id === 'set-board-name' && e.key === 'Enter') e.target.blur();
      });
    },

    open(side) {
      closePopups();
      this.side = side === 'right' ? 'right' : 'left';
      this.el.classList.remove('left', 'right');
      this.el.classList.add(this.side, 'open');
      this.isOpen = true;
      this.render();
      this.refreshStatus();
    },

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.classList.remove('open');
    },

    render() {
      if (!this.isOpen) return;
      // Don't yank a text field out from under someone who is typing in it.
      if (this.body.contains(document.activeElement) && document.activeElement.matches('input[type="text"]')) return;
      const st = S.settings, bg = S.board.background || {};
      const seg = (act, cur, opts, disabled) => `<div class="seg${disabled ? ' disabled' : ''}" role="radiogroup">${opts.map(([v, l]) =>
        `<button role="radio" aria-checked="${v === cur}" data-act="${act}" data-val="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const sw = (act, on, label) => `<button class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-act="${act}"></button>`;
      const isCustom = bg.color && !BG_SWATCHES.some(([c]) => c === bg.color);
      const photoSet = BoardPhoto.settings(), photoShown = !!(photoSet && photoSet.on && BoardPhoto.media());

      const insts = Array.from(S.insts.entries()).sort((a, b) => {
        const an = (getWidget(a[1].widgetId) || { name: a[1].widgetId }).name, bn = (getWidget(b[1].widgetId) || { name: b[1].widgetId }).name;
        return an.localeCompare(bn) || a[1].n - b[1].n;
      });
      const instHTML = insts.length ? insts.map(([ikey, i]) => {
        const widget = getWidget(i.widgetId);
        const size = JSON.stringify(S.data.get(ikey) || '').length + JSON.stringify(S.conf.get(ikey) || '').length;
        const name = `${widget ? widget.name : i.widgetId}${i.n > 1 || !widget ? ' ' + i.n : ''}`;
        const status = !widget ? 'Widget not installed' : i.open ? 'Open' : 'Closed';
        return `<div class="inst"><span class="widget-icon" style="--c:${esc(widget ? widget.color : '#9ca3af')}">${widget ? widget.icon : svg('widget')}</span>` +
          `<div class="meta"><b>${esc(name)}</b><span>${status} · ${fmtBytes(size)} saved</span></div>` +
          (widget && !i.open ? `<button class="icon" data-act="inst-open" data-val="${esc(ikey)}" title="Open" aria-label="Open ${esc(name)}">${svg('open')}</button>` : '') +
          `<button class="icon" data-act="inst-delete" data-val="${esc(ikey)}" title="Delete" aria-label="Delete ${esc(name)} and its content">${svg('trash')}</button></div>`;
      }).join('') : '<div class="empty-note">No widget windows yet. Open one from the Widget Picker.</div>';

      const devWidgets = (st.devWidgets || []).map(d =>
        `<div class="inst"><span class="widget-icon" style="--c:#64748b">${svg('widget')}</span><div class="meta"><b>${esc(d.name)}</b><span>${esc(d.entry)}</span></div>` +
        `<button class="icon" data-act="dev-remove" data-val="${esc(d.id)}" title="Remove" aria-label="Remove ${esc(d.name)}">${svg('trash')}</button></div>`).join('');

      this.body.innerHTML = `
        ${historySettings(sw, seg)}

        <h3>Appearance</h3>
        <div class="row"><div class="lbl">Theme</div>${seg('theme', st.theme, [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']])}</div>
        <div class="row stack"><div><div class="lbl">Accent color</div><div class="hint">Buttons, the selected-window outline and highlights, in 21Board and its widgets.</div></div>
          <div class="swatches">${Object.entries(ACCENTS).map(([k, a]) => `<button class="swatch${(st.accent || 'blue') === k ? ' on' : ''}" style="background:${resolvedTheme() === 'dark' ? a[1] : a[0]}" data-act="accent" data-val="${k}" title="${a[2]}" aria-label="${a[2]} accent"></button>`).join('')}</div></div>
        <div class="row stack"><div class="lbl">Board background</div>
          <div class="swatches">
            <button class="swatch auto${!bg.color ? ' on' : ''}" data-act="bg" data-val="" title="Match theme" aria-label="Match theme"></button>
            ${BG_SWATCHES.map(([c, n]) => `<button class="swatch${bg.color === c ? ' on' : ''}" style="background:${c}" data-act="bg" data-val="${c}" title="${n}" aria-label="${n}"></button>`).join('')}
            <label class="swatch custom${isCustom ? ' on' : ''}" title="Custom color"><input type="color" id="set-bg-custom" value="${esc(isCustom ? bg.color : '#88aacc')}" aria-label="Custom background color"></label>
          </div>
        </div>
        <div class="row"><div class="lbl">Pattern</div>${seg('pattern', bg.pattern || 'none', [['none', 'None'], ['dots', 'Dots'], ['grid', 'Grid'], ['lines', 'Lines']], photoShown)}</div>
        ${photoRow(sw, seg)}

        <h3>Windows</h3>
        <div class="row"><div><div class="lbl">Snap and avoid overlap</div><div class="hint">Windows stop at each other's edges. Keep pushing to overlap anyway.</div></div>${sw('snapping', st.snapping, 'Snap and avoid overlap')}</div>
        <div class="row"><div><div class="lbl">Drag windows from inside</div><div class="hint">Widgets without typing move by dragging anywhere in them; any widget moves with two fingers. Off: title bar only.</div></div>${sw('dragcontent', st.dragFromContent !== false, 'Drag windows from inside')}</div>
        <div class="row"><div class="lbl">Push needed to overlap</div>${seg('resistance', st.resistance, [['gentle', 'Light'], ['normal', 'Medium'], ['strong', 'Firm']], !st.snapping)}</div>
        ${scaleSettingsRows(seg)}
        <div class="row"><div><div class="lbl">Close all windows</div><div class="hint">Content stays saved for next time.</div></div><button class="btn" data-act="close-all">${svg('windows')}Close all</button></div>

        <h3>Widget Picker</h3>
        <div class="row"><div class="lbl">Show controls in</div>${seg('corners', st.pickerCorners, [['both', 'Both corners'], ['left', 'Left'], ['right', 'Right']])}</div>

        <h3>Board</h3>
        <div class="row stack"><label class="lbl" for="set-board-name">Board name <span class="hint">(used for export file names)</span></label>
          <input type="text" class="text-input" id="set-board-name" maxlength="60" value="${esc(S.board.name)}" autocomplete="off"></div>
        <div class="row stack"><div><div class="lbl">Saved widget windows</div><div class="hint">Closing a window keeps its content. Delete it here to remove it for good.</div></div>
          <div class="inst-list">${instHTML}</div></div>

        ${Link.supported ? linkSettings(sw) : ''}

        ${LAB ? `<h3>Widget test mode</h3>
        <div class="row"><div class="hint">A test board for one widget, made by the widget dev window. Its data is kept apart from real boards${Store.mem ? ' (in memory, until this preview reloads)' : ''}.</div></div>` : `<h3>Storage &amp; offline</h3>
        <div class="row"><div class="lbl">Offline</div><div class="hint" id="st-offline" style="text-align:right">Checking…</div></div>
        <div class="row"><div><div class="lbl">Data protection</div><div class="hint" id="st-persist-hint"></div></div><div id="st-persist" style="flex:0 0 auto"></div></div>
        <div class="row"><div><div class="lbl">Backups</div><div class="hint" id="st-backup">${esc(backupAgo())}</div></div><button class="btn small" data-act="backup">${svg('export')}Back up now</button></div>
        <div class="row"><div class="lbl">Storage used</div><div class="hint" id="st-storage" style="text-align:right">Checking…</div></div>`}

        <h3>Advanced</h3>
        ${LAB ? '' : `<div class="row"><div><div class="lbl">Developer mode</div><div class="hint">Shows developer tools and lets you test a widget by its path.</div></div>${sw('devmode', st.devMode, 'Developer mode')}</div>`}
        ${st.devMode && !LAB ? `<div class="row stack"><div class="lbl">Test a widget</div>
          <div style="display:flex;gap:8px"><input type="text" class="text-input" id="set-dev-path" placeholder="widgets/my-widget/index.html" autocomplete="off" spellcheck="false"><button class="btn primary" data-act="dev-add">${svg('plus')}Add</button></div>
          ${devWidgets ? `<div class="inst-list">${devWidgets}</div>` : ''}</div>` : ''}
        <div class="row"><div><div class="lbl">Erase everything</div><div class="hint">Deletes all windows, content and settings on this device.</div></div><button class="btn danger" data-act="erase">${svg('trash')}Erase</button></div>

        <h3>About</h3>
        <div class="about">21Board ${BOARD_VERSION} · Widget SDK protocol ${SDK_PROTOCOL}<span id="st-cache"></span><br>
        Everything you make is stored only on this device. Nothing is sent to a server.</div>`;
      // The photo preview gets its picture here (never as text inside the HTML above).
      const thumb = $('#photo-thumb', this.body), pm = BoardPhoto.media();
      if (thumb) thumb.style.setProperty('--fade-color', (S.board.background && S.board.background.color) || 'var(--board-bg)');   // as on the board
      if (thumb && pm) BoardPhoto.objectUrl(pm).then(u => { thumb.style.backgroundImage = `url("${u}")`; }, () => {});
      this.refreshStatus(true);
    },

    async refreshStatus(quick) {
      if (!this.isOpen) return;
      const off = $('#st-offline', this.body), sto = $('#st-storage', this.body), per = $('#st-persist', this.body), cache = $('#st-cache', this.body);
      if (off) {
        const s = S.sw.state;
        off.innerHTML = s === 'ready' ? '<span class="status-dot ok"></span>Ready to work offline'
          : s === 'unsupported' ? '<span class="status-dot warn"></span>Needs https to work offline'
          : s === 'error' ? '<span class="status-dot warn"></span>Offline copy unavailable'
          : '<span class="status-dot"></span>Saving an offline copy…';
        if (S.sw.updateReady) off.innerHTML += ' · <button class="btn small" data-act="update">Update now</button>';
      }
      if (cache && S.sw.version) cache.textContent = ` · Offline copy ${S.sw.version}`;
      const renderPersist = () => {
        const per2 = $('#st-persist', this.body), hint = $('#st-persist-hint', this.body), bk = $('#st-backup', this.body);
        if (bk) bk.textContent = backupAgo();
        if (!per2 || !hint) return;
        const st = Persist.state;
        if (st === 'granted') {
          per2.innerHTML = '<span class="hint"><span class="status-dot ok"></span>Protected</span>';
          hint.textContent = 'This browser has agreed never to clear 21Board’s data to free up space.';
        } else if (st === 'unsupported') {
          per2.innerHTML = '<span class="hint"><span class="status-dot warn"></span>Unavailable</span>';
          hint.textContent = 'This browser can’t promise to keep 21Board’s data. Export backups regularly.';
        } else if (st === 'insecure') {
          per2.innerHTML = '<span class="hint"><span class="status-dot warn"></span>Needs https</span>';
          hint.textContent = 'Browsers only protect data for sites served over https. Ask whoever hosts 21Board to enable https; until then, export backups regularly.';
        } else if (st === 'file') {
          per2.innerHTML = '<span class="hint"><span class="status-dot warn"></span>Not available</span>';
          hint.textContent = 'A copy of 21Board opened from a file can’t be protected. Use the hosted (https) 21Board for real use, or export backups regularly.';
        } else {
          per2.innerHTML = Install.prompt ? `<button class="btn small primary" data-act="install">${svg('plus')}Install app</button>`
            : '<span class="hint"><span class="status-dot warn"></span>Not yet</span>';
          hint.textContent = '21Board asks for protection automatically every time it starts, but the browser decides. ' +
            (Install.prompt ? 'Installing 21Board as an app usually turns it on. ' : 'Installing 21Board as an app (Install in Chrome’s address bar, or Add to Home Screen/Dock in Safari) usually turns it on. ') +
            'Until then, keep backups.';
        }
      };
      if (quick && this._statusCache && sto) sto.textContent = this._statusCache.storage;
      renderPersist();
      let storage = 'Unknown';
      try {
        const nav = navigator.storage;
        if (nav && nav.estimate) { const e = await nav.estimate(); storage = `${fmtBytes(e.usage || 0)} of ${fmtBytes(e.quota || 0)}`; }
        await Persist.check();
      } catch (e) { /* ignore */ }
      this._statusCache = { storage };
      if (!this.isOpen) return;
      const sto2 = $('#st-storage', this.body);
      if (sto2) sto2.textContent = storage;
      renderPersist();
    },

    async act(act, val) {
      switch (act) {
        case 'theme': updateSettings({ theme: val }); break;
        case 'accent': if (accentOf(val)) updateSettings({ accent: val }); break;
        case 'snapping': updateSettings({ snapping: !S.settings.snapping }); break;
        case 'dragcontent': updateSettings({ dragFromContent: S.settings.dragFromContent === false }); break;
        case 'scale-down': case 'scale-up': scaleStep(act === 'scale-up' ? 1 : -1); this.render(); break;
        case 'shape': setBoardShape(val); this.render(); break;
        case 'resistance': updateSettings({ resistance: val }); break;
        case 'corners': updateSettings({ pickerCorners: val }); if (val !== 'both' && val !== this.side) this.open(val); break;
        case 'devmode': updateSettings({ devMode: !S.settings.devMode }); break;
        case 'bg': updateBoard({ background: Object.assign({}, S.board.background, { color: val || null }) }); this.render(); break;
        case 'pattern': updateBoard({ background: Object.assign({}, S.board.background, { pattern: val }) }); this.render(); break;
        case 'photo-add': $('#photo-input').click(); break;
        case 'photo-on': BoardPhoto.update({ on: !(BoardPhoto.settings() || {}).on }); this.render(); break;
        case 'photo-fit': BoardPhoto.update({ fit: val }); this.render(); break;
        case 'photo-remove': {
          const yes = await dialog({ title: 'Remove the background photo?', message: 'It is removed from this board on this device. Your full backups and board history still have it.', actions: [{ label: 'Remove photo', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
          if (yes) { const id = await BoardPhoto.remove(); this.render(); toast('Photo removed.', undoAction(id)); }
          break;
        }
        case 'close-all': await closeAll(); this.render(); break;
        case 'inst-open': { const i = S.insts.get(val); if (i) openSpecific(val); this.render(); break; }
        case 'inst-delete': {
          const i = S.insts.get(val);
          if (!i) break;
          const widget = getWidget(i.widgetId);
          const name = `${widget ? widget.name : i.widgetId}${i.n > 1 || !widget ? ' ' + i.n : ''}`;
          const ok = await dialog({ title: `Delete ${name}?`, message: 'Its window and everything saved in it will be removed from this board. You can bring it back from Board history for a while.', actions: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
          if (ok) {
            const id = await deleteInstance(val); this.render();
            toast(`Deleted ${name}.`, id ? { action: 'Undo', timeout: 15000, onAction: () => BoardHistory.putBack(id, val, { exact: true, quiet: true }) } : {});
          }
          break;
        }
        case 'install': await Install.run(); this.refreshStatus(); break;
        case 'backup': await doExport('full'); this.refreshStatus(); break;
        case 'hist-open': HistorySheet.open(this.side); break;
        case 'hist-every': {
          if (val === '0') {
            const ok = await dialog({ title: 'Turn off board history?', message: 'Versions already saved stay until you delete them. 21Board still saves one when you go back to an earlier version.', actions: [{ label: 'Turn off', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
            if (!ok) break;
          }
          updateSettings({ historyEvery: +val });
          break;
        }
        case 'hist-folder': updateSettings({ historyFolder: S.settings.historyFolder === false }); break;
        case 'hist-delete': {
          const canFolder = Link.dir && Link.perm === 'granted';
          const ok = await dialog({ title: 'Delete this board’s history?', message: 'Every earlier version on this device is deleted. The board itself stays as it is.',
            actions: [{ label: 'Delete from this device', value: 'local', kind: 'danger' }].concat(canFolder ? [{ label: 'Also delete its copies in your Google Drive folder', value: 'folder', kind: 'danger' }] : []).concat([{ label: 'Cancel', value: null }]) });
          if (!ok) break;
          await BoardHistory.clearBoard();
          if (ok === 'folder') await BoardHistory.deleteFolderCopies(S.board.uid);
          toast('Board history deleted.');
          this.render();
          break;
        }
        case 'link-choose': await Link.choose(); this.render(); break;
        case 'link-unlink': {
          const ok = await dialog({ title: `Unlink the “${Link.dir ? Link.dir.name : ''}” folder?`, message: 'This device stops sending to it and checking it. The files in it are left as they are.', actions: [{ label: 'Unlink', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
          if (ok) await Link.unlink();
          break;
        }
        case 'link-reconnect': await Link.reconnect(); this.render(); break;
        case 'link-send': await Link.send(); this.render(); break;
        case 'link-check': if (await Link.ensurePerm()) await Link.check(true); this.render(); break;
        case 'link-auto': Link.saveState({ auto: !Link.st.auto }); if (Link.st.auto) Link.changed([Keys.board(S.boardId)]); break;
        case 'link-photo': Link.saveState({ photo: !Link.st.photo }); break;
        case 'link-load': await Link.load(val); this.render(); break;
        case 'link-load-offer': if (Link.offer) await Link.load(Link.offer.name); this.render(); break;
        case 'update': applyUpdate(); break;
        case 'dev-add': {
          const input = $('#set-dev-path', this.body);
          const path = (input && input.value || '').trim();
          if (!path) break;
          let url;
          try { url = new URL(path, location.href); } catch (e) { toast('That path is not valid.'); break; }
          if (url.origin !== location.origin) { toast('Widgets must be served from this same site.'); break; }
          const rel = url.pathname.replace(new RegExp('^' + location.pathname.replace(/[^/]*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '') + url.search;
          const slug = rel.replace(/\/?index\.html$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'widget';
          const id = 'dev-' + slug;
          const name = (slug.split('-').filter(p => p && p !== 'widgets').pop() || 'Test widget').replace(/^./, c => c.toUpperCase()) + ' (test)';
          const list = (S.settings.devWidgets || []).filter(d => d.id !== id).concat([{ id, name, entry: rel }]);
          updateSettings({ devWidgets: list });
          openWidget(id, { side: this.side });
          break;
        }
        case 'dev-remove': updateSettings({ devWidgets: (S.settings.devWidgets || []).filter(d => d.id !== val) }); break;
        case 'erase': {
          const hist = BoardHistory.enabled();
          const ok = await dialog({ title: 'Erase everything?', message: 'All windows, their content and your settings are deleted from this device.' + (hist ? ' Board history is kept, so you can still go back.' : '') + ' Export a backup first if you might want them later.',
            actions: [{ label: 'Export a backup first', value: 'backup', kind: 'primary' }, { label: 'Erase everything', value: 'erase', kind: 'danger' }]
              .concat(hist ? [{ label: 'Erase, including board history', value: 'erase-all', kind: 'danger' }] : []).concat([{ label: 'Cancel', value: null }]) });
          if (ok === 'backup') { await doExport('full'); break; }
          if (ok !== 'erase' && ok !== 'erase-all') break;
          if (ok === 'erase') await BoardHistory.before('erase', 'Before erasing everything', { timeout: 3000 });
          else await BoardHistory.clearAll();
          await Store.tx('readwrite', s => { s.clear(); });
          Link.forget();
          Sync.announce([], { op: 'reload', erased: true });
          await rebuildAll();
          this.render();
          toast('Everything was erased.');
          break;
        }
      }
    }
  };

  // Open a specific (closed) instance from Settings.
  function openSpecific(ikey) {
    const inst = S.insts.get(ikey);
    if (!inst || inst.open) return;
    // Temporarily make it the lowest closed instance by opening directly.
    const widget = getWidget(inst.widgetId);
    if (!widget) return;
    const view = boundsRect();
    let rect = fitRect(inst.rect, constraintsFor(widget), view);
    const obs = obstacles(null);
    if (obs.some(o => overlaps(rect, o))) {
      const spot = findFreeSpot(rect.w, rect.h, view, obs, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
      if (spot) rect = spot;
    }
    S.deselected = false;
    saveInst(ikey, Object.assign({}, inst, { open: true, rect, z: maxZ() + 1 }));
    reconcileWin(ikey);
    afterBulkApply();
  }

  // =====================================================================
  // 13. Export / Import
  // ---------------------------------------------------------------------
  // A .21board file is JSON (see docs/DATA-FORMAT.md):
  //   { format: "21board", formatVersion: 1, kind: "full" | "template", ... }
  // "full" keeps everything (including closed windows and their content);
  // "template" keeps the open windows' layout and config but no content.
  // =====================================================================
  async function exportFlow() {
    const kind = await dialog({
      title: 'Export board',
      message: 'Save a .21board file you can import later or share with another teacher.',
      actions: [
        { label: 'Full backup', sub: 'Windows, their content, and closed windows', value: 'full', kind: 'primary', choice: true },
        { label: 'Blank template', sub: 'Window layout and widget settings only — no content', value: 'template', choice: true },
        { label: 'Cancel', value: null }
      ]
    });
    if (kind) await doExport(kind);
  }

  async function buildExport(kind) {
    const recs = await Store.getAll();
    const b = S.boardId;
    const byIkey = new Map();
    const get = ik => { if (!byIkey.has(ik)) byIkey.set(ik, {}); return byIkey.get(ik); };
    for (const r of recs) {
      const k = Keys.parse(r.key);
      if ((k.kind === 'inst' || k.kind === 'data' || k.kind === 'conf') && k.board === b) get(k.ikey)[k.kind] = r.value;
    }
    // Records not yet committed (if any) — prefer in-memory state.
    for (const [ik, inst] of S.insts) get(ik).inst = inst;
    const instances = [];
    for (const [ik, parts] of byIkey) {
      const [widgetId, nStr] = ik.split(':');
      const inst = parts.inst ? normalizeInst(parts.inst, { widgetId, n: +nStr }) : normalizeInst({ open: false }, { widgetId, n: +nStr });
      if (kind === 'template' && !inst.open) continue;
      instances.push({
        widgetId, instance: +nStr, open: inst.open, maximized: inst.maximized, z: inst.z,
        rect: inst.rect,
        config: parts.conf === undefined ? null : parts.conf,
        data: kind === 'full' && parts.data !== undefined ? parts.data : null
      });
    }
    instances.sort((a, b2) => a.widgetId.localeCompare(b2.widgetId) || a.instance - b2.instance);
    return {
      format: '21board',
      formatVersion: FORMAT_VERSION,
      kind,
      exportedAt: new Date().toISOString(),
      generator: `21Board ${BOARD_VERSION}`,
      viewport: exportViewport(), // the size of the space the rects are in
      theme: S.settings.theme,
      accent: S.settings.accent,
      board: Object.assign({ name: S.board.name, background: S.board.background, scale: boardScale(), shape: freeShape() ? 'free' : '16:9' },
        kind === 'full' && S.board.uid ? { uid: S.board.uid } : {}),   // which board this is (see section 13b)
      // The background photo: full backups only (a template is for sharing, and a photo may show the class).
      media: kind === 'full' && BoardPhoto.media() ? { background: BoardPhoto.media(), look: BoardPhoto.settings() } : undefined,
      instances
    };
  }

  async function doExport(kind) {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const safeName = (S.board.name || '21Board').replace(/[\\/:*?"<>|]+/g, '').trim() || '21Board';
    const filename = `${safeName} ${stamp}${kind === 'template' ? ' template' : ''}.21board`;
    // Where the browser has a native Save dialog (Chrome/Edge on desktop and ChromeOS), use it: the teacher
    // chooses where the file goes (e.g. Google Drive), and a backup is only recorded once it's really written.
    // Elsewhere, fall back to a normal download (which can't confirm the file was kept).
    let handle = null;
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: '21Board file', accept: { 'application/x-21board': ['.21board'] } }] });
      } catch (err) {
        if (err && err.name === 'AbortError') return false; // cancelled: nothing saved, nothing recorded
        handle = null;                                       // not allowed here: use a download instead
      }
    }
    try {
      const text = JSON.stringify(await buildExport(kind), null, 2);
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      if (kind === 'full') updateSettings({ lastBackupAt: Date.now() });
      toast(kind === 'template' ? 'Template exported.' : 'Board exported.');
      return true;
    } catch (err) {
      console.error(err);
      toast('Export failed: ' + (err.message || err));
      return false;
    }
  }


  function parseBoardFile(text) {
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('This isn’t a 21Board file (it can’t be read as JSON).'); }
    if (!j || typeof j !== 'object' || j.format !== '21board') throw new Error('This file isn’t a 21Board export.');
    if (typeof j.formatVersion === 'number' && j.formatVersion > FORMAT_VERSION) throw new Error('This file was made by a newer version of 21Board. Update 21Board and try again.');
    const seen = new Set();
    const instances = (Array.isArray(j.instances) ? j.instances : []).filter(i => {
      if (!i || !ID_RE.test(i.widgetId || '') || !Number.isInteger(i.instance) || i.instance < 1) return false;
      const k = ikeyOf(i.widgetId, i.instance);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map(i => ({
      widgetId: i.widgetId, n: i.instance, open: !!i.open, maximized: !!i.maximized, z: num(i.z, 1),
      rect: normalizeInst({ rect: i.rect }, { widgetId: i.widgetId, n: i.instance }).rect,
      config: i.config === undefined ? null : i.config,
      data: i.data === undefined ? null : i.data,
      createdAt: num(i.createdAt, null)   // board history versions keep it (which window is which)
    }));
    const bg = j.board && j.board.background || {};
    return {
      kind: j.kind === 'template' ? 'template' : 'full',
      theme: ['light', 'dark', 'system'].includes(j.theme) ? j.theme : null,
      accent: accentOf(j.accent) ? j.accent : null,
      board: {
        name: j.board && typeof j.board.name === 'string' ? j.board.name.slice(0, 60) : null,
        background: { color: /^#[0-9a-f]{6}$/i.test(bg.color || '') ? bg.color : null, pattern: ['none', 'dots', 'grid', 'lines'].includes(bg.pattern) ? bg.pattern : 'none' },
        scale: j.board && j.board.scale !== undefined ? (validScale(j.board.scale) || null) : undefined,   // undefined: file from before board scale
        shape: j.board && j.board.shape === 'free' ? 'free' : '16:9',
        uid: j.board && UID_RE.test(j.board.uid || '') ? j.board.uid : null
      },
      // Set by "Send" (section 13b): when, from which device.
      sent: j.sent && typeof j.sent === 'object' ? { id: j.sent.id ? String(j.sent.id).slice(0, 64) : '', base: j.sent.base ? String(j.sent.base).slice(0, 64) : null,
        at: num(j.sent.at, 0), by: String(j.sent.by || '').slice(0, 64), from: String(j.sent.from || '').slice(0, 60),
        // Each device's latest version that this one includes (device id -> version id).
        mine: j.sent.mine && typeof j.sent.mine === 'object' ? Object.fromEntries(Object.entries(j.sent.mine).slice(0, 16).filter(([k, v]) => typeof v === 'string').map(([k, v]) => [String(k).slice(0, 64), v.slice(0, 64)])) : null } : null,
      viewport: j.viewport && j.viewport.width > 0 && j.viewport.height > 0 ? { w: j.viewport.width, h: j.viewport.height } : null,
      photo: (() => {
        const m = j.kind !== 'template' && j.media && j.media.background;   // templates never carry a photo (it may show the class)
        return validPhoto(m) ? { data: m.data, w: +m.w, h: +m.h, bytes: +m.bytes || 0, name: String(m.name || 'Photo').slice(0, 80), addedAt: +m.addedAt || Date.now() } : null;
      })(),
      photoLook: j.media && j.media.background ? normalizePhotoSettings(j.media.look || {}) : null,
      instances
    };
  }

  async function importFile(file) {
    let parsed;
    try { parsed = parseBoardFile(await file.text()); } catch (err) {
      await dialog({ title: 'Can’t import this file', message: err.message, actions: [{ label: 'OK', value: true, kind: 'primary' }] });
      return;
    }
    const openCount = parsed.instances.filter(i => i.open).length;
    const missing = new Set(parsed.instances.filter(i => !getWidget(i.widgetId)).map(i => i.widgetId));
    const what = parsed.kind === 'template' ? 'a blank template' : 'a full backup';
    const mode = await dialog({
      title: `Import “${file.name.replace(/\.21board$/i, '')}”?`,
      message: `This is ${what} with ${openCount} window${openCount === 1 ? '' : 's'}.` + (missing.size ? ` ${missing.size} widget${missing.size === 1 ? ' is' : 's are'} not installed here; ${missing.size === 1 ? 'its' : 'their'} content will be kept but not shown.` : ''),
      actions: [
        { label: 'Replace my board', sub: 'Your current windows and content are replaced. You can undo this.', value: 'replace', kind: 'danger', choice: true },
        { label: 'Add to my board', sub: 'Keep what’s here and add these windows', value: 'add', kind: 'primary', choice: true },
        { label: 'Cancel', value: null }
      ]
    });
    if (!mode) return;
    try {
      const label = `${mode === 'replace' ? 'Before importing' : 'Before adding windows from'} “${file.name.replace(/\.21board$/i, '')}”`;
      const undoId = await applyImport(parsed, mode, { history: { reason: mode === 'replace' ? 'import' : 'add', label } });
      toast(mode === 'replace' ? 'Board imported.' : `Added ${openCount} window${openCount === 1 ? '' : 's'}.`, undoAction(undoId));
    } catch (err) {
      console.error(err);
      toast('Import failed: ' + (err.message || err));
    }
  }

  // opts.uid: this board becomes that board (loading it from the shared folder), so later versions match.
  // opts.history: {reason, label} for the version of the board as it is now that's saved first (Board history),
  //   or false for none. opts.mustSnapshot: if that version can't be saved, ask before going on.
  // opts.photo: 'file' (default: the file's photo replaces this device's, if it has one), 'exact' (the board
  //   gets exactly the file's photo, or none), 'keep' (this device's photo is left as it is).
  // opts.keepCreated: windows keep the file's createdAt. Returns the id of the version saved first (or null),
  // or false if cancelled.
  async function applyImport(p, mode, opts = {}) {
    const b = S.boardId;
    let undoId = null;
    if (opts.history !== false) {
      const h = opts.history || (mode === 'add' ? { reason: 'add', label: 'Before adding windows from a file' } : { reason: 'import', label: 'Before importing a board' });
      undoId = await BoardHistory.before(h.reason, h.label, opts.mustSnapshot ? { timeout: 30000 } : {});
      if (!undoId && opts.mustSnapshot && BoardHistory.enabled() && (S.insts.size || BoardPhoto.media())) {   // (an empty board has nothing to lose)
        const go = await dialog({ title: 'Go back anyway?', message: '21Board couldn’t save the board as it is now, so this can’t be undone.', actions: [{ label: 'Go back anyway', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
        if (!go) return false;
      }
    }
    const photoMode = opts.photo || 'file';
    const plan = importPlan(p, mode), { convert, view } = plan; // the board's shape and scale decide how rects map
    const rev = Math.max(Date.now(), maxKnownRev() + 1);
    const rec = (key, type, value) => ({ key, type, rev, updatedAt: rev, by: TAB_ID, value });

    const used = new Map(); // widgetId -> Set of instance numbers
    if (mode === 'add') for (const i of S.insts.values()) { if (!used.has(i.widgetId)) used.set(i.widgetId, new Set()); used.get(i.widgetId).add(i.n); }
    const zBase = mode === 'add' ? maxZ() : 0;
    const placed = mode === 'add' ? obstacles(null) : [];
    const out = [];

    for (const i of p.instances.slice().sort((a, b2) => a.z - b2.z)) {
      let n = i.n;
      if (mode === 'add') {
        const set = used.get(i.widgetId) || new Set();
        n = 1; while (set.has(n)) n++;
        set.add(n); used.set(i.widgetId, set);
      }
      let rect = convert(i.rect);
      const widget = getWidget(i.widgetId);
      if (widget) rect = fitRect(rect, constraintsFor(widget), view);
      if (mode === 'add' && i.open) {
        if (placed.some(o => overlaps(rect, o))) {
          const spot = findFreeSpot(rect.w, rect.h, view, placed, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
          if (spot) rect = spot;
          else {
            // No room: cascade so it never sits exactly on top of (and hides) another window.
            for (let k = 0; k < 12 && placed.some(o => Math.abs(o.x - rect.x) < 24 && Math.abs(o.y - rect.y) < 24); k++) {
              rect = clampToView({ x: rect.x + 32, y: rect.y + 32, w: rect.w, h: rect.h }, view);
            }
          }
        }
        placed.push(rect);
      }
      const ik = ikeyOf(i.widgetId, n);
      out.push(rec(Keys.inst(b, ik), 'inst', { widgetId: i.widgetId, n, open: i.open, rect, z: zBase + i.z, maximized: i.maximized, createdAt: opts.keepCreated && i.createdAt ? i.createdAt : rev }));
      if (i.config !== null) out.push(rec(Keys.conf(b, ik), 'conf', i.config));
      if (i.data !== null && p.kind === 'full') out.push(rec(Keys.data(b, ik), 'data', i.data));
    }
    if (mode === 'replace') {
      const board = Object.assign({}, S.board, { background: p.board.background, scale: plan.scale, shape: plan.shape, layout: plan.layout });
      if (p.board.name) board.name = p.board.name;
      if (opts.uid) board.uid = opts.uid;
      out.push(rec(Keys.board(b), 'board', board));
      if (p.photo && photoMode !== 'keep') {
        out.push(rec(Keys.media(b, 'background'), 'media', p.photo));
        out.push(rec(Keys.media(b, 'background-look'), 'media', p.photoLook || normalizePhotoSettings({})));
      }
      if (p.theme || p.accent) out.push(rec(Keys.settings, 'settings', Object.assign({}, S.settings, p.theme ? { theme: p.theme } : {}, p.accent ? { accent: p.accent } : {})));
    }

    if (mode === 'replace') {
      // Stop the running widgets first, so none saves its old content over what's loaded.
      Menu.close();
      for (const w of S.wins.values()) w.destroy();
      S.wins.clear();
      await Writer.settled(1000);
    }
    // The background photo belongs to this device: only a file that brings its own photo replaces it
    // (or, going back in Board history, the board gets exactly the photo it had then).
    const clearPhoto = photoMode === 'exact' || (photoMode === 'file' && !!p.photo);
    try {
      await Store.tx('readwrite', s => {
        if (mode === 'replace') {
          for (const kind of ['inst', 'data', 'conf'].concat(clearPhoto ? ['media'] : [])) s.delete(IDBKeyRange.bound(`${kind}:${b}:`, `${kind}:${b}:￿`));
        }
        for (const r of out) s.put(r);
      });
    } finally {
      Sync.announce([], { op: 'reload' });
      await rebuildAll();
    }
    BoardHistory.changed([Keys.board(b)]);
    return undoId;
  }

  // =====================================================================
  // 13b. Sharing boards through a Google Drive folder
  // ---------------------------------------------------------------------
  // A teacher builds a board on a laptop and shows it on the smartboard. Each device links itself once to
  // the same folder, e.g. Google Drive › My Drive › 21Board (Chrome's folder picker: 21Board can read and
  // write in that folder only, and the teacher allows it). ChromeOS (and Drive for desktop on Windows)
  // keeps that folder the same on every device, so 21Board never talks to Google: no sign-in, API keys,
  // Cloud project or server. Chrome and Edge only (Safari and Firefox keep Export/Import).
  //
  // 21Board owns the folder's contents:
  // - One file per board: "<board name>.21board", a full backup with the board's uid and a "sent" block
  //   {id: this version, base: the version it was built on, at, by: device id, from: device name}.
  //   "Room 12 (2).21board" if any other file has that name (even one still arriving).
  // - Renaming a board renames its file on the next send (the old one is removed if this device has seen
  //   the version in it).
  // Versions are told apart by id, never by time (devices' clocks disagree). Each device remembers the
  // versions it has sent or loaded ("seen"); a version it hasn't seen is offered, and is never overwritten:
  // an automatic send waits, a manual one asks (load theirs, or send mine and keep theirs as a copy).
  // - "<name> (copy from …).21board": a copy kept, with a new uid, before loading over local changes.
  // - "About this folder.txt" explains the files to anyone browsing the folder. Other files are left alone.
  // Sending: Settings → Google Drive folder → Send (or "Send automatically", a few seconds after changes). Receiving: the folder is
  // checked when 21Board opens, when it comes back to the front, and every 2 minutes; a newer version of this
  // board from another device is offered with "Load" (never applied silently).
  // On this device only (never exported): link:folder (the folder handle) and link:state
  // {device: {id, label}, auto, photo, boards: {uid: {file, seen: [version ids], headId, headMine, sentAt, sentSig,
  //   loadedSentAt, loadedFrom, loadedSig}}}.
  // =====================================================================
  const LINK_CHECK_MS = 2 * 60 * 1000;
  const LINK_AUTO_MS = 8000;
  const LINK_README = 'About this folder.txt';
  const Link = {
    supported: !LAB && typeof window.showDirectoryPicker === 'function',
    dir: null,          // FileSystemDirectoryHandle
    perm: 'none',       // 'none' (no folder) | 'granted' | 'prompt' | 'denied'
    st: { device: null, auto: false, photo: true, boards: {} },
    found: [],          // boards in the folder: {name, uid, title, sentAt, by, from, kind, size, lastModified}
    cache: new Map(),   // file name -> {lastModified, size, meta}
    names: new Set(),   // every .21board name in the folder, lowercased
    offer: null, offerToast: null, dismissed: '',
    scanning: null, busy: false, loading: false, autoT: 0, lastCheck: 0, started: false, nagged: false, gen: 0, nagAt: 0,

    // ---- this device's records
    applyRecord(name, value) {
      if (name === 'folder') {
        this.dir = value && typeof value === 'object' && value.kind === 'directory' ? value : null;
        this.found = []; this.cache.clear(); this.setOffer(null);
        if (this.started) this.refresh();
      } else if (name === 'state') {
        const v = value && typeof value === 'object' ? value : {};
        this.st = { device: v.device && UID_RE.test(v.device.id || '') ? v.device : null, auto: !!v.auto, photo: v.photo !== false, boards: v.boards && typeof v.boards === 'object' ? v.boards : {} };
        this.computeOffer();
      }
    },
    saveState(patch) {
      this.st = Object.assign({}, this.st, patch);
      Writer.put(Keys.link('state'), 'link', this.st);
      if (Settings.isOpen) Settings.render();
    },
    boardRec(uid) { return (this.st.boards || {})[uid] || null; },
    setBoardRec(uid, patch) { this.saveState({ boards: Object.assign({}, this.st.boards, { [uid]: Object.assign({}, this.boardRec(uid), patch) }) }); },
    device() {
      if (!this.st.device) {
        const touch = navigator.maxTouchPoints > 0, big = Math.max(screen.width, screen.height) >= 1900;
        this.saveState({ device: { id: newId(), label: touch && big ? 'the smartboard' : /CrOS/.test(navigator.userAgent) ? 'a Chromebook' : 'a computer' } });
      }
      return this.st.device;
    },
    async saveFolder(handle) {
      // A folder handle can't go through Writer (which copies values as JSON): write it as is.
      const key = Keys.link('folder');
      const rec = { key, type: 'link', rev: Math.max((Known.get(key) || 0) + 1, Date.now()), updatedAt: Date.now(), by: TAB_ID, value: handle };
      try {
        await Store.tx('readwrite', s => { s.put(rec); });
        Known.set(key, rec.rev);
        Sync.announce([key]);
      } catch (err) {
        // This browser can't keep folder handles: linked until 21Board is closed.
        console.warn('21Board: the folder link can’t be saved on this device', err);
      }
      this.applyRecord('folder', handle);
    },

    // ---- permission (Chrome remembers it for an installed 21Board; in a tab it may ask again after a restart)
    async refresh() {
      if (!this.dir) { this.perm = 'none'; return; }
      try { this.perm = typeof this.dir.queryPermission === 'function' ? await this.dir.queryPermission({ mode: 'readwrite' }) : 'granted'; } catch (e) { this.perm = 'denied'; }
      if (Settings.isOpen) Settings.render();
      if (this.perm === 'granted') await this.check();
      else if (this.perm === 'prompt' && !this.nagged && Object.keys(this.st.boards || {}).length) {
        this.nagged = true;
        toast(`Reconnect your “${this.dir.name}” folder to keep this board up to date with your other devices.`, { action: 'Reconnect', timeout: 12000, onAction: () => this.reconnect() });
      }
    },
    // Must run from a tap (Chrome only asks then).
    async ensurePerm() {
      if (!this.dir) return false;
      if (this.perm === 'granted') return true;
      try { this.perm = typeof this.dir.requestPermission === 'function' ? await this.dir.requestPermission({ mode: 'readwrite' }) : 'granted'; } catch (e) { this.perm = 'denied'; }
      if (Settings.isOpen) Settings.render();
      return this.perm === 'granted';
    },
    async reconnect() { if (await this.ensurePerm()) await this.check(true); else toast('21Board can’t use that folder until you allow it.'); },

    // ---- linking (from a tap)
    async choose() {
      let h;
      try { h = await window.showDirectoryPicker({ id: '21board', mode: 'readwrite' }); } catch (err) {
        if (!err || err.name !== 'AbortError') toast('Couldn’t open that folder: ' + ((err && err.message) || err));
        return false;
      }
      this.perm = 'granted';
      await this.saveFolder(h);
      this.device();
      try { await this.writeReadme(); } catch (e) { /* read-only folder: we'll find out on send */ }
      await this.check(true);
      return true;
    },
    async unlink() {
      await Writer.del(Keys.link('folder'));
      this.applyRecord('folder', null);
      this.perm = 'none';
      if (Settings.isOpen) Settings.render();
    },
    async writeReadme() {
      try { await this.dir.getFileHandle(LINK_README); return; } catch (e) { /* not there yet */ }
      await this.writeFile(LINK_README, [
        '21Board keeps your boards here so your devices can share them through Google Drive.',
        '',
        'Each .21board file is one board: its windows, what is in them, and its background photo.',
        '21Board names these files after your boards and updates them when you press Send (or',
        'automatically, if you turned that on). Your other devices check this folder and offer to',
        'load a newer version.',
        '',
        '- In 21Board on each device, choose this same folder: Settings > Google Drive folder.',
        '- Please don’t edit or rename the files. Deleting one stops sharing that board; the board',
        '  itself stays on your devices.',
        '- "… (copy from …)" files are copies 21Board kept before loading a newer version over changes.',
        '- The "Board history" folder holds earlier versions of your boards, about one an hour. Open one from',
        '  21Board > Settings > Board history, or with Import.',
        '- These files can include student names and class photos. Share this folder only with',
        '  people who should see them.',
        ''
      ].join('\r\n'));
    },

    // ---- the folder
    async writeFile(name, text, dir = this.dir) {
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    },
    async readFile(name, dir = this.dir) { return (await (await dir.getFileHandle(name)).getFile()).text(); },
    // The version id of a file's "sent" block (files sent before version ids existed: who + when).
    vidOf(sent) { return sent && (sent.id ? String(sent.id) : sent.by && sent.at ? `${sent.by}@${sent.at}` : '') || ''; },
    meta(j, name, file) {
      const sent = j.sent && typeof j.sent === 'object' ? j.sent : null;
      return { name, uid: j.board && UID_RE.test(j.board.uid || '') ? j.board.uid : null, title: String((j.board && j.board.name) || name.replace(/\.21board$/i, '')).slice(0, 60),
        vid: this.vidOf(sent), base: sent && sent.base ? String(sent.base) : null, legacy: !!(sent && !sent.id),
        sentAt: num(sent && sent.at, file.lastModified), by: String((sent && sent.by) || ''), from: String((sent && sent.from) || '').slice(0, 60),
        kind: j.kind === 'template' ? 'template' : 'full', size: file.size, lastModified: file.lastModified };
    },
    // Every board file in the folder (files that didn't change since the last look aren't read again).
    // this.names: every .21board name, even files that can't be read yet (still arriving): never reused.
    async scan() {
      if (this.scanning) return this.scanning;
      this.scanning = (async () => {
        const out = [], names = new Set(), lc = new Set();
        for await (const [name, h] of this.dir.entries()) {
          if (h.kind !== 'file' || !/\.21board$/i.test(name)) continue;
          names.add(name); lc.add(name.toLowerCase());
          let file;
          try { file = await h.getFile(); } catch (e) { continue; }
          const c = this.cache.get(name);
          if (c && c.lastModified === file.lastModified && c.size === file.size) { if (c.meta) out.push(c.meta); continue; }
          let meta = null;
          try {
            if (file.size < 40e6) {
              const j = JSON.parse(await file.text());
              if (j && j.format === '21board') meta = this.meta(j, name, file);
            } else {
              // A huge file: its "sent" block and board come before the photo and windows, so read just the start.
              const head = await file.slice(0, 65536).text(), pick = re => { const m = head.match(re); return m ? m[1] : ''; };
              meta = this.meta({ kind: 'full', board: { uid: pick(/"uid":"([A-Za-z0-9-]{8,64})"/), name: pick(/"name":"([^"]{0,60})"/) },
                sent: { id: pick(/"sent":\{"id":"([^"]+)"/), base: pick(/"base":"([^"]+)"/), at: +pick(/"at":(\d+)/) || 0, by: pick(/"by":"([^"]+)"/), from: pick(/"from":"([^"]*)"/) } }, name, file);
            }
          } catch (e) { continue; }   // still being written, or not a board: look again next time
          this.cache.set(name, { lastModified: file.lastModified, size: file.size, meta });
          if (meta) out.push(meta);
        }
        for (const n of Array.from(this.cache.keys())) if (!names.has(n)) this.cache.delete(n);
        this.names = lc;
        this.found = out.sort((a, b) => b.lastModified - a.lastModified);   // this device's clock: newest arrival first
        return this.found;
      })();
      try { return await this.scanning; } finally { this.scanning = null; }
    },
    async check(force) {
      if (!this.dir || this.perm !== 'granted') return;
      if (!force && Date.now() - this.lastCheck < 5000) return;
      this.lastCheck = Date.now();
      try { await this.scan(); } catch (err) {
        console.warn('21Board: could not read the shared folder', err);
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) { this.perm = 'prompt'; }
        else if (err && err.name === 'NotFoundError') toast(`The “${this.dir.name}” folder can’t be found. Choose it again in Settings.`);
      }
      this.computeOffer();
      if (Settings.isOpen) Settings.render();
    },
    // The folder's latest version of a board that this device hasn't seen (sent or loaded), if any.
    // Versions are compared by id, never by time: two devices' clocks can disagree.
    unseen(uid) {
      if (!uid) return null;
      const f = this.found.find(x => x.uid === uid && x.kind === 'full' && x.vid);   // found is newest first
      const rec = this.boardRec(uid) || {};
      // A file sent by the first test build (no version ids): if this device sent or loaded exactly that one,
      // it has seen it.
      if (f && f.legacy && !rec.seen) {
        const mine = f.by === (this.st.device || {}).id && f.sentAt === rec.sentAt, loaded = f.sentAt === rec.loadedSentAt;
        if (mine || loaded) { this.remember(uid, f.vid, { headId: f.vid, headMine: mine && (rec.sentAt || 0) >= (rec.loadedSentAt || 0) }); return null; }
      }
      const seen = new Set(rec.seen || []);
      return f && !seen.has(f.vid) ? f : null;
    },
    computeOffer() { this.setOffer(this.unseen(S.board.uid)); },
    setOffer(f, opts = {}) {
      const key = f ? f.vid : '', cur = this.offer ? this.offer.vid : '';
      if (!opts.again && key === cur && (!f || key === this.dismissed || (this.offerToast && this.offerToast.isConnected))) return;
      this.offer = f;
      if (this.offerToast) { if (this.offerToast.isConnected) this.offerToast.remove2(); this.offerToast = null; }
      if (!f || key === this.dismissed || typeof document === 'undefined') return;
      this.offerToast = toast(`“${f.title}” was updated on ${f.from || 'another device'} ${when(f.sentAt)}.` + (opts.blocked ? ' Changes made here aren’t sent until you load it (or choose in Settings › Send).' : ''), {
        action: 'Load', dismiss: 'Not now', timeout: 0,
        onAction: () => { this.offerToast = null; this.load(f.name); },
        onDismiss: () => { this.offerToast = null; this.dismissed = key; }
      });
    },
    // A fingerprint of this board's content, to tell whether it changed since it was sent or loaded here.
    // (Not the window stacking order: tapping a window to bring it forward isn't a change.)
    sigOf(exp) { return boardSig(exp); },
    async sig() { return this.sigOf(await buildExport('full')); },
    // Changed on this device since it was last sent or loaded here. (Never sent or loaded: anything on it counts.)
    async localChanges() {
      const rec = this.boardRec(S.board.uid);
      if (!rec || (!rec.sentSig && !rec.loadedSig)) return S.insts.size > 0;
      const sig = await this.sig();
      return sig !== rec.sentSig && sig !== rec.loadedSig;
    },
    async remember(uid, vid, patch, gen = this.gen) {
      let stored = null;
      try { const r = (await Store.getMany([Keys.link('state')]))[0]; stored = r && r.value && r.value.boards && r.value.boards[uid]; } catch (e) { /* use what this window has */ }
      if (gen !== this.gen) return;   // erased meanwhile: don't write anything back
      const rec = this.boardRec(uid) || {};
      const merged = Array.from(new Set(((stored && stored.seen) || []).concat(rec.seen || [])));
      const seen = merged.filter(v => v !== vid).concat(vid ? [vid] : []).slice(-40);
      this.setBoardRec(uid, Object.assign({ seen }, patch));
    },
    safeName(name) {
      return String(name || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 60) || 'Board';
    },
    // A board's file name: its name, unless another file already has it (any .21board file that isn't
    // known to be this board's counts, even one that can't be read yet).
    async fileNameFor(uid, title) {
      await this.scan();
      const lc = n => n.toLowerCase();
      const mine = n => this.found.some(f => lc(f.name) === lc(n) && f.uid === uid);
      const taken = n => this.names.has(lc(n)) && !mine(n);
      const base = this.safeName(title);
      let name = base + '.21board';
      for (let k = 2; taken(name); k++) name = `${base} (${k}).21board`;
      return name;
    },
    // Another board's file kept as a separate board (a new uid), named "<name> (copy from …)".
    async writeCopy(exp, fromLabel) {
      const d = new Date(), dev = this.device();
      const title = `${exp.board.name || 'Board'} (copy from ${String(fromLabel || dev.label).replace(/^(the|a|an) /i, '')}, ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`.replace(/:/g, '.');
      const uid = newId();
      exp.board = Object.assign({}, exp.board, { uid, name: title.slice(0, 60) });
      const out = Object.assign({ format: exp.format, formatVersion: exp.formatVersion, kind: exp.kind, sent: { id: newId(), base: null, at: Date.now(), by: dev.id, from: dev.label } }, exp);
      const name = await this.fileNameFor(uid, title);
      await this.writeFile(name, JSON.stringify(out));
      return name;
    },

    // ---- sending (from a tap, or automatically)
    async send(opts = {}) {
      if (!this.supported) return false;
      if (!this.dir) {
        if (opts.auto) return false;
        const go = await dialog({
          title: 'Send this board to your other devices',
          message: 'Choose a folder in Google Drive (for example My Drive › 21Board: make it first if you need to). On the smartboard, choose the same folder in Settings › Google Drive folder. Google Drive keeps it the same on both, and 21Board keeps one file per board in it.',
          actions: [{ label: 'Choose folder…', value: true, kind: 'primary' }, { label: 'Cancel', value: false }]
        });
        if (!go || !await this.choose()) return false;
      }
      if (this.perm !== 'granted' && (opts.auto || !await this.ensurePerm())) { if (!opts.auto) toast('21Board can’t use that folder until you allow it.'); return false; }
      if (this.busy || this.loading) { if (!opts.auto) toast('Just a moment: 21Board is still sending or loading this board.'); return false; }
      this.busy = true;
      let then = null;
      try {
        const uid = S.board.uid || (ensureUid(), S.board.uid);
        await this.scan();
        // Never replace a version of this board that this device hasn't seen.
        const theirs = this.unseen(uid);
        if (theirs) {
          if (opts.auto) { this.computeOffer(); return false; }   // the offer stays up; the teacher decides
          const choice = await dialog({
            title: `A newer “${theirs.title}” is in the folder`,
            message: `It was sent from ${theirs.from || 'another device'} ${when(theirs.sentAt)}, and this device hasn’t loaded it. Sending now would replace it.`,
            actions: [{ label: 'Load theirs (keep a copy of mine)', value: 'load', kind: 'primary', choice: true, sub: 'Mine goes in the folder as a separate board' },
              { label: 'Send mine (keep a copy of theirs)', value: 'send', choice: true, sub: 'Theirs goes in the folder as a separate board' },
              { label: 'Cancel', value: null }]
          });
          if (choice === 'load') { then = () => this.load(theirs.name, { keepMine: true }); return false; }
          if (choice !== 'send') return false;
          let j;
          try { j = JSON.parse(await this.readFile(theirs.name)); } catch (e) { j = null; }
          if (j && j.format === '21board') await this.writeCopy(j, theirs.from);
        }
        const rec = this.boardRec(uid) || {}, dev = this.device(), gen = this.gen;
        const exp = await buildExport('full');
        const sig = this.sigOf(exp);
        if (!this.st.photo) delete exp.media;   // "Include the background photo" off: each device keeps its own
        // id: this version; base: the version this board was built on; mine: each device's latest version it
        // includes (to spot a version made without this device's last send).
        const sentId = newId();
        const sent = { id: sentId, base: rec.headId || null, at: Date.now(), by: dev.id, from: dev.label, mine: Object.assign({}, rec.mine || {}, { [dev.id]: sentId }) };
        const out = Object.assign({ format: exp.format, formatVersion: exp.formatVersion, kind: exp.kind, sent }, exp);
        const name = await this.fileNameFor(uid, S.board.name);
        await this.writeFile(name, JSON.stringify(out));
        // Renamed: remove the old file, but only if it holds a version this device has seen. (A rename that only
        // changes capitals: only where the folder keeps both spellings as two files.)
        const old = rec.file, seen = new Set(rec.seen || []);
        if (old && old !== name) {
          const of = this.found.find(f => f.name.toLowerCase() === old.toLowerCase() && f.uid === uid);
          let separate = old.toLowerCase() !== name.toLowerCase();
          if (!separate) { const names = []; for await (const [n] of this.dir.entries()) names.push(n); separate = names.includes(old) && names.includes(name); }
          if (separate && of && of.vid && seen.has(of.vid)) { try { await this.dir.removeEntry(of.name); } catch (e) { /* already gone */ } }
        }
        this.cache.delete(name);
        await this.remember(uid, sent.id, { file: name, sentAt: sent.at, sentSig: sig, headId: sent.id, headMine: true, mine: sent.mine }, gen);
        updateSettings({ lastBackupAt: Date.now() });   // the folder copy is a backup too
        if (!opts.auto) toast(`Sent “${S.board.name}” to your “${this.dir.name}” folder. Google Drive brings it to your other devices.`);
        await this.check(true);
        return true;
      } catch (err) {
        console.error(err);
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) this.perm = 'prompt';
        if (!opts.auto) toast('Couldn’t send this board: ' + ((err && err.message) || err));
        return false;
      } finally {
        this.busy = false;
        if (then) await then();
      }
    },
    // A board record changed here: with "Send automatically" on, send a few seconds after the last change.
    changed(keys) {
      if (!this.st.auto || !this.dir) return;
      const b = S.boardId;
      if (!keys.some(k => { const p = Keys.parse(k); return p.board === b && /^(board|inst|data|conf|media)$/.test(p.kind); })) return;
      clearTimeout(this.autoT);
      this.autoT = setTimeout(() => this.autoSend(), LINK_AUTO_MS);
    },
    async autoSend() {
      clearTimeout(this.autoT); this.autoT = 0;
      if (!this.st.auto || !this.dir || this.perm !== 'granted' || this.loading || this.busy) return;
      const rec = this.boardRec(S.board.uid), sig = await this.sig();
      if (rec && (sig === rec.sentSig || sig === rec.loadedSig)) return;   // nothing new since it was sent or loaded
      if (this.offer) {   // a version from another device is waiting: never send over it, but say so (even after "Not now")
        if (Date.now() - (this.nagAt || 0) > 5 * 60 * 1000) { this.nagAt = Date.now(); this.dismissed = ''; this.setOffer(this.offer, { again: true, blocked: true }); }
        return;
      }
      await this.send({ auto: true });
    },

    // ---- receiving (from a tap). opts.keepMine: a copy of this board was asked for already.
    async load(name, opts = {}) {
      if (!await this.ensurePerm()) { toast('21Board can’t use that folder until you allow it.'); return false; }
      if (this.busy || this.loading) { toast('Just a moment: 21Board is still sending or loading this board.'); return false; }
      // Loading another board: first send this one's pending automatic change, so it isn't lost.
      try {
        const peek = parseBoardFile(await this.readFile(name));
        if (peek.board.uid !== S.board.uid && this.st.auto && (this.autoT || await this.localChanges())) await this.autoSend();
      } catch (e) { /* read again below */ }
      const gen = this.gen;
      this.loading = true;
      clearTimeout(this.autoT); this.autoT = 0;   // a pending automatic send must not go out over this
      let loaded = false;
      try {
        let raw, parsed;
        try { raw = await this.readFile(name); parsed = parseBoardFile(raw); } catch (err) {
          toast(`Couldn’t read “${name}”: ${(err && err.message) || err}`);
          return false;
        }
        const uid = parsed.board.uid, sent = parsed.sent || {}, title = parsed.board.name || name.replace(/\.21board$/i, '');
        const from = sent.from ? ` from ${sent.from}` : '';
        if (uid && uid === S.board.uid) {
          const rec = this.boardRec(uid) || {};
          const changed = await this.localChanges();
          // This device's last send isn't in it: the other device made this version without it.
          const me = (this.st.device || {}).id;
          const lostMine = !!(rec.headMine && parsed.sent && !((parsed.sent.mine && parsed.sent.mine[me] === rec.headId) || parsed.sent.base === rec.headId));
          if (opts.keepMine) { if (!await this.saveCopy()) return false; }
          else if (changed || lostMine) {
            const since = Math.max(rec.sentAt || 0, rec.loadedSentAt || 0);
            const choice = await dialog({
              title: `Load “${title}”${from}?`,
              message: changed ? `This board was also changed here${since ? ' since ' + when(since) : ''}. Loading replaces those changes.`
                : `It was made without the version you sent from here ${when(rec.sentAt)}. Loading replaces that version on this device.`,
              actions: [{ label: 'Keep a copy of mine, then load', value: 'copy', kind: 'primary' }, { label: 'Load and replace mine', value: 'load', kind: 'danger' }, { label: 'Cancel', value: null }]
            });
            if (!choice) return false;
            if (choice === 'copy' && !await this.saveCopy()) return false;
          }
        } else {
          const unsent = this.dir && S.insts.size ? await this.localChanges() : false;
          const copy = { label: 'Keep a copy of this board, then replace it', value: 'copy', kind: 'primary' }, replace = { label: 'Replace this board', value: 'load', kind: 'danger' };
          const choice = await dialog({
            title: `Replace this board with “${title}”?`,
            message: `The windows and content on this board are replaced by the board${from}${sent.at ? ', sent ' + when(sent.at) : ''}.` + (unsent ? ' This board has changes that weren’t sent to the folder: replacing it loses them unless you keep a copy.' : '') + ' After that, this device offers its newer versions as they arrive.',
            actions: (unsent ? [copy, replace] : [replace].concat(S.insts.size ? [copy] : [])).concat([{ label: 'Cancel', value: null }])
          });
          if (!choice) return false;
          if (choice === 'copy' && !await this.saveCopy()) return false;
        }
        // The file may have changed while the dialog was open: load what's there now.
        try { const raw2 = await this.readFile(name); if (raw2 !== raw) parsed = parseBoardFile(raw2); } catch (e) { /* keep what was read */ }
        const s2 = parsed.sent || {}, vid = this.vidOf(parsed.sent);
        // Only a sent file joins this device to that board (a plain Export saved in the folder doesn't).
        const newUid = parsed.board.uid && vid ? parsed.board.uid : newId();
        let undoId;
        try { undoId = await applyImport(parsed, 'replace', { uid: newUid, history: { reason: 'load', label: `Before loading the version from ${s2.from || 'another device'}` } }); } catch (err) { console.error(err); toast('Couldn’t load the board: ' + ((err && err.message) || err)); return false; }
        await this.remember(newUid, vid, { file: name, loadedSentAt: s2.at || Date.now(), loadedFrom: s2.from || '', loadedSig: await this.sig(), headId: vid || null, headMine: false,
          mine: Object.assign({}, s2.mine || {}, s2.by && vid ? { [s2.by]: vid } : {}) }, gen);
        loaded = true;
        this.computeOffer();
        toast(`Loaded “${S.board.name}”${s2.from ? ' from ' + s2.from : ''}.`, undoAction(undoId));
        return true;
      } finally {
        this.loading = false;
        if (!loaded && this.st.auto) this.changed([Keys.board(S.boardId)]);   // kept their own changes: send them later
      }
    },
    // Before loading over changes made here: keep them in the folder as a separate board.
    async saveCopy() {
      try {
        const name = await this.writeCopy(await buildExport('full'));
        toast(`Kept a copy of this board in your folder: “${name.replace(/\.21board$/i, '')}”.`);
        return true;
      } catch (err) { toast('Couldn’t keep a copy: ' + ((err && err.message) || err)); return false; }
    },
    // Erase everything: this device forgets the folder and its bookkeeping.
    forget() {
      this.gen++;   // writes already under way won't save anything back
      clearTimeout(this.autoT); this.autoT = 0;
      this.dir = null; this.perm = 'none'; this.found = []; this.names = new Set(); this.cache.clear();
      this.st = { device: null, auto: false, photo: true, boards: {} };
      this.setOffer(null);
    },

    // ---- startup: check now, when 21Board comes back to the front, and every few minutes
    start() {
      if (!this.supported || this.started) return;
      this.started = true;
      this.refresh();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.refresh();
        else if (this.autoT) this.autoSend();   // leaving: send a pending change now
      });
      window.addEventListener('focus', () => this.check());
      setInterval(() => { if (document.visibilityState === 'visible') this.check(true); }, LINK_CHECK_MS);
    }
  };
  // "at 7:42 PM", or "on Nov 9 at 7:42 PM" for another day.
  function when(t) {
    const d = new Date(t), now = new Date();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? `at ${time}` : `on ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
  }

  // =====================================================================
  // 13c. Board history: earlier versions of a board, to go back to
  // ---------------------------------------------------------------------
  // For undoing a big change or recovering after a "disaster" (a curious student). Versions are kept on this
  // device in their own database ('21Board-history', never in exports or the live board's records), and copies
  // go to the linked Google Drive folder ("Board history" inside it) about once an hour.
  // When a version is saved:
  //  - while the board changes: once it has settled for a minute, at most every 10 minutes (Settings: every
  //    hour, once a day, or off); also when 21Board is left with unsaved changes;
  //  - when 21Board opens (if the board changed since the last version);
  //  - before Reset, Delete, Close all, a photo change, Import, Load from the folder, going back, Erase, and when
  //    a widget's content is suddenly emptied (e.g. a note cleared);
  //  - when the teacher taps "Save this version now" (kept until deleted; at most 20 per board).
  // Identical content is never saved twice. Kept: the newest 20; one an hour for the last 48 active hours; the
  // first and last of each day for 30 active days; one a week for 12 active weeks; safety versions (before…)
  // for 7 days; the version before a big change for 30 days. Photos are kept once (by identity), at most 5,
  // and the whole history stays within a share of the device's storage.
  // Going back replaces the board (after saving it as it is, so it can be undone) but never this device's
  // settings; "Put back" brings back one window. Records: see docs/DATA-FORMAT.md, "Board history".
  // =====================================================================
  const H_MIN = 60e3, H_HOUR = 60 * H_MIN, H_DAY = 24 * H_HOUR;
  const HIST = { quiet: 60e3, tick: 60e3, openDelay: 15e3, beforeTimeout: 1500, coalesce: 2 * H_MIN, emptyMin: 200, emptyRatio: 0.25, emptyEvery: 2 * H_MIN,
    safetyKeep: 7 * H_DAY, bigKeep: 30 * H_DAY, undoMs: 10 * H_MIN, folderEvery: H_HOUR, maxAuto: 5e6, maxBody: 15e6, photos: 5, manualMax: 20 };
  const T_LOCAL = { newest: 20, hours: 48, days: 30, weeks: 12, firstOfDay: true, cap: 250 };
  const T_LOW = { newest: 5, hours: 6, days: 7, weeks: 0, firstOfDay: true, cap: 60 };
  const T_FOLDER = { newest: 6, hours: 8, days: 14, weeks: 12, firstOfDay: false, cap: 60 };

  // Which versions to keep (a pure function, also used for the folder copies). items: {id, at, manual,
  // keepUntil, beforeBig}. Buckets are local hours/days/Monday-weeks, counted only where there are versions,
  // so a summer break doesn't empty the history.
  function historyPlan(items, now, T) {
    const keep = new Set();
    const sorted = items.slice().sort((a, b) => b.at - a.at);
    if (sorted.length && sorted[0].at > now + 10 * H_MIN) { sorted.forEach(i => keep.add(i.id)); return keep; }   // the clock went back: delete nothing
    sorted.slice(0, T.newest).forEach(i => keep.add(i.id));
    const tier = (keyOf, n, first) => {
      const buckets = new Map();
      for (const i of sorted) { const k = keyOf(new Date(i.at)); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); }
      let count = 0;
      for (const list of buckets.values()) {
        if (count++ >= n) break;
        keep.add(list[0].id);                          // the newest in the bucket
        if (first) keep.add(list[list.length - 1].id);  // and the first ("how it was when you came in")
      }
    };
    tier(d => `${d.toDateString()} ${d.getHours()}`, T.hours, false);
    tier(d => d.toDateString(), T.days, !!T.firstOfDay);
    tier(d => { const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m.toDateString(); }, T.weeks, false);
    for (const i of sorted) {
      if (i.manual || (i.keepUntil && i.keepUntil > now) || (i.beforeBig && now - i.at <= HIST.bigKeep) || i.at > now + 5 * H_MIN) keep.add(i.id);
    }
    if (T.cap) {
      const kept = sorted.filter(i => keep.has(i.id));
      for (let k = kept.length - 1, over = kept.length - T.cap; k >= T.newest && over > 0; k--) if (!kept[k].manual) { keep.delete(kept[k].id); over--; }
    }
    return keep;
  }

  // "Today 9:42 AM", "Yesterday 9:42 AM", "Mon, Nov 9, 9:42 AM"
  function dayTime(t) {
    const d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `Today ${time}`;
    if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
    return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
  }
  // Toast options with an Undo that goes back to a Board history version.
  function undoAction(id) { return id ? { action: 'Undo', timeout: 20000, onAction: () => BoardHistory.restore(id, { undo: true }) } : {}; }

  const BoardHistory = {
    dbp: null, off: '', paused: '', status: '', low: false, metas: [], dirty: false, lastChangeAt: 0, firstDirtyAt: 0,
    timer: 0, started: false, capturing: false, undoable: null, guardAt: new Map(), folderStatus: '', budgetCache: null,
    cfgv: {},   // tests: {quiet, every, budget} in ms / bytes
    cfg(v) { this.cfgv = Object.assign({}, this.cfgv, v || {}); },
    enabled() { return !LAB && !Store.mem && !Store.failed && this.off !== 'unavailable' && typeof indexedDB !== 'undefined'; },
    every() { const m = S.settings.historyEvery; return m === 0 ? 0 : (this.cfgv.every || (+m || 10) * H_MIN); },
    quiet() { return this.cfgv.quiet || HIST.quiet; },

    // ---- the database
    db() {
      if (this.dbp) return this.dbp;
      this.dbp = new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open('21Board-history', 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const [n, k] of [['meta', 'id'], ['body', 'id'], ['photo', 'key']]) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: k });
        };
        req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); this.dbp = null; }; db.onclose = () => { this.dbp = null; }; resolve(db); };
        req.onerror = () => reject(req.error);
        req.onblocked = () => console.warn('21Board: the board history database is blocked by another tab.');
      }).catch(err => { this.dbp = null; this.off = 'unavailable'; console.warn('21Board: board history is unavailable', err); throw err; });
      return this.dbp;
    },
    async tx(stores, mode, fn) {
      const db = await this.db();
      return new Promise((resolve, reject) => {
        let t;
        try { t = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'relaxed' } : undefined); } catch (e) { reject(e); return; }
        const o = {}; let result;
        for (const n of stores) o[n] = t.objectStore(n);
        try { fn(o, v => { result = v; }); } catch (e) { try { t.abort(); } catch (x) { /* already done */ } reject(e); return; }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Transaction aborted'));
      });
    },
    range(b) { return IDBKeyRange.bound(`${b}:`, `${b}:￿`); },
    async reload() {
      if (!this.enabled()) { this.metas = []; return; }
      try { this.metas = (await this.tx(['meta'], 'readonly', (o, set) => { const q = o.meta.getAll(this.range(S.boardId)); q.onsuccess = () => set(q.result); })) || []; }
      catch (e) { this.metas = []; return; }
      this.metas.sort((a, b) => b.at - a.at);
    },
    async get(id) {
      return this.tx(['meta', 'body'], 'readonly', (o, set) => {
        const m = o.meta.get(id), bd = o.body.get(id), r = {};
        m.onsuccess = () => { r.meta = m.result; }; bd.onsuccess = () => { r.body = bd.result; set(r.meta && r.body ? r : null); };
      });
    },
    async getPhoto(key) { return key ? this.tx(['photo'], 'readonly', (o, set) => { const g = o.photo.get(key); g.onsuccess = () => set(g.result || null); }) : null; },
    hasWindow(ikey) { return this.metas.some(m => m.wins && m.wins[ikey]); },

    // ---- what a version looks like (kept in its meta, for the list, previews and comparisons)
    thumbOf(exp) {
      const vp = exp.viewport || { width: 2400, height: 1350 }, bg = (exp.board && exp.board.background) || {};
      const wins = exp.instances.filter(i => i.open).sort((a, b) => a.z - b.z).map(i => [ikeyOf(i.widgetId, i.instance), Math.round(i.rect.x), Math.round(i.rect.y), Math.round(i.rect.w), Math.round(i.rect.h)]);
      return { bg: bg.color || null, pattern: bg.pattern || 'none', shape: exp.board && exp.board.shape === 'free' ? 'free' : '16:9', vw: vp.width, vh: vp.height, wins };
    },
    excerptOf(v) {
      const out = [];
      const walk = x => { if (out.join(' ').length > 80) return; if (typeof x === 'string') { if (x.trim()) out.push(x.trim()); } else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.values(x).forEach(walk); };
      walk(v);
      return out.join(' ').replace(/\s+/g, ' ').slice(0, 80);
    },
    winsOf(exp) {
      const w = {};
      for (const i of exp.instances) {
        const d = i.data == null ? '' : JSON.stringify(i.data), c = i.config == null ? '' : JSON.stringify(i.config);
        w[ikeyOf(i.widgetId, i.instance)] = [i.open ? 1 : 0, i.createdAt || 0, d ? hash53(d) : '', c ? hash53(c) : '', d.length, this.excerptOf(i.data)];
      }
      return w;
    },
    photoKeyOf(m) { return m ? `${m.addedAt}-${m.bytes}-${m.w}x${m.h}` : null; },
    // A big change since the version before: most windows gone, windows deleted, content emptied, the photo gone.
    bigChange(prev, cur) {
      const pw = prev.wins || {}, cw = cur.wins || {};
      const prevOpen = Object.keys(pw).filter(k => pw[k][0]).length;
      const gone = Object.keys(pw).filter(k => pw[k][0] && !(cw[k] && cw[k][0])).length;
      const deleted = Object.keys(pw).filter(k => !cw[k]).length;
      const emptied = Object.keys(pw).filter(k => cw[k] && pw[k][4] >= HIST.emptyMin && cw[k][4] < pw[k][4] * HIST.emptyRatio).length;
      return gone >= 3 || (prevOpen >= 2 && gone >= prevOpen / 2) || deleted >= 2 || emptied >= 1 || (!!prev.photo && prev.photo !== 'gone' && !cur.photo);
    },
    // What changed from version a to version b, in a few words.
    diff(a, b) {
      if (!a || !b) return [];
      const aw = a.wins || {}, bw = b.wins || {}, items = [];
      const nm = k => { const [w, n] = k.split(':'); return instName(w, +n); };
      const keys = Array.from(new Set(Object.keys(aw).concat(Object.keys(bw))));
      const opened = keys.filter(k => bw[k] && bw[k][0] && !(aw[k] && aw[k][0]) && aw[k]);
      const added = keys.filter(k => bw[k] && !aw[k]);
      const closed = keys.filter(k => aw[k] && aw[k][0] && bw[k] && !bw[k][0]);
      const deleted = keys.filter(k => aw[k] && !bw[k]);
      const emptied = keys.filter(k => aw[k] && bw[k] && aw[k][4] >= HIST.emptyMin && bw[k][4] < aw[k][4] * HIST.emptyRatio);
      const edited = keys.filter(k => aw[k] && bw[k] && !emptied.includes(k) && (aw[k][2] !== bw[k][2] || aw[k][3] !== bw[k][3]));
      const pos = t => { const o = {}; ((t && t.wins) || []).forEach(r => { o[r[0]] = r.slice(1).join(','); }); return o; };
      const ap = pos(a.thumb), bp = pos(b.thumb);
      const moved = keys.filter(k => ap[k] && bp[k] && ap[k] !== bp[k]);
      const say = (list, one, many) => { if (list.length === 1) items.push(one(nm(list[0]))); else if (list.length) items.push(many(list.length)); };
      say(emptied, n => `${n} emptied`, c => `${c} windows emptied`);
      say(deleted, n => `${n} deleted`, c => `${c} windows deleted`);
      say(closed, n => `${n} closed`, c => `${c} windows closed`);
      say(added, n => `New: ${n}`, c => `${c} new windows`);
      say(opened, n => `${n} opened`, c => `${c} windows opened`);
      say(edited, n => `${n} changed`, c => `${c} windows changed`);
      say(moved, () => 'A window moved', c => `${c} windows moved`);
      if (a.thumb && b.thumb && (a.thumb.bg !== b.thumb.bg || a.thumb.pattern !== b.thumb.pattern)) items.push('Background changed');
      if ((a.photo || null) !== (b.photo || null)) items.push(b.photo ? 'Photo changed' : 'Photo removed');
      if (a.name !== b.name) items.push('Name changed');
      return items;
    },

    // ---- saving a version
    async capture(kind, opts = {}) {
      if (!this.enabled()) return null;
      try { await this.db(); } catch (e) { return null; }
      if (this.paused && kind !== 'manual' && kind !== 'before') return null;
      const b = S.boardId, startedAt = Date.now();
      let exp;
      try { exp = await buildExport('full'); } catch (e) { return null; }
      if (opts.patch) { const i = exp.instances.find(x => ikeyOf(x.widgetId, x.instance) === opts.patch.ikey); if (i) i.data = opts.patch.data; }
      const sig = boardSig(exp);
      const photoM = exp.media && exp.media.background;
      if (!exp.instances.length && !photoM && kind !== 'manual') return null;
      for (const i of exp.instances) { const inst = S.insts.get(ikeyOf(i.widgetId, i.instance)); if (inst && inst.createdAt) i.createdAt = inst.createdAt; }
      const photoKey = this.photoKeyOf(photoM);
      if (exp.media) exp.media = photoM ? { ref: photoKey, look: exp.media.look } : undefined;
      if (!exp.media) delete exp.media;
      const at = Math.max(Date.now(), (this.metas[0] && this.metas[0].tab === TAB_ID ? this.metas[0].at + 1 : 0));
      exp.snapshot = { at, kind, label: String(opts.label || '').slice(0, 80) };
      const bytes = JSON.stringify(exp).length;
      if (bytes > HIST.maxBody || ((kind === 'auto' || kind === 'open') && bytes > HIST.maxAuto)) { this.status = 'too-big'; return null; }
      const rec = S.board.uid ? Link.boardRec(S.board.uid) : null;
      const meta = { v: 1, id: `${b}:${String(at).padStart(13, '0')}:${TAB_ID}`, b, at, kind, reason: opts.reason || null, label: exp.snapshot.label,
        sig, uid: S.board.uid || null, name: S.board.name, bytes, photo: photoKey, thumb: this.thumbOf(exp), wins: this.winsOf(exp),
        beforeBig: false, link: rec && sig === rec.sentSig ? 'sent' : rec && sig === rec.loadedSig ? 'loaded' : null,
        keepUntil: kind === 'before' || kind === 'restored' ? at + HIST.safetyKeep : 0, manual: kind === 'manual', folder: null, tab: TAB_ID };
      const every = this.every();
      let id;
      try {
        id = await this.tx(['meta', 'body', 'photo'], 'readwrite', (o, set) => {
          const c = o.meta.openCursor(this.range(b), 'prev');
          c.onsuccess = () => {
            const newest = c.result && c.result.value;
            if (newest && newest.sig === sig) {   // the same as the newest version: nothing new to save
              if (kind === 'before') { newest.keepUntil = Math.max(newest.keepUntil || 0, at + HIST.safetyKeep); o.meta.put(newest); }
              if (kind === 'manual') { newest.manual = true; newest.manualLabel = meta.label; o.meta.put(newest); }
              set(newest.id); return;
            }
            // A burst of the same risky action (30 resets): one version, from before the burst.
            if (newest && kind === 'before' && newest.kind === 'before' && newest.reason === meta.reason && at - newest.at < HIST.coalesce) { set(newest.id); return; }
            // Another tab just saved one.
            if (newest && kind === 'auto' && (newest.kind === 'auto' || newest.kind === 'open') && every && at - newest.at < 0.9 * every) { set(null); return; }
            if (newest && this.bigChange(newest, meta)) { newest.beforeBig = true; o.meta.put(newest); }
            o.body.put({ id: meta.id, exp });
            o.meta.put(meta);
            if (photoKey) {
              const g = o.photo.get(photoKey);
              g.onsuccess = () => {
                const ph = g.result;
                if (ph) { ph.lastUsed = at; o.photo.put(ph); }
                else o.photo.put({ key: photoKey, data: photoM.data, w: photoM.w, h: photoM.h, bytes: photoM.bytes, name: photoM.name, addedAt: photoM.addedAt, thumb: null, lastUsed: at });
              };
            }
            set(meta.id);
          };
        });
      } catch (err) {
        if (err && err.name === 'QuotaExceededError' && !opts.retried) { await this.shrink(); return this.capture(kind, Object.assign({}, opts, { retried: true })); }
        if (err && err.name === 'QuotaExceededError') this.paused = 'quota';
        console.warn('21Board: could not save a board version', err);
        return null;
      }
      if (this.lastChangeAt < startedAt) this.dirty = false;
      await this.reload();
      this.pruneSoon();
      if (photoKey) this.makeThumb(photoKey);
      const saved = this.metas.find(m => m.id === id);
      if (saved && (id === meta.id || kind === 'manual')) this.maybeFolder(saved, kind === 'manual');
      Sync.announce([], { op: 'history', board: b });
      HistorySheet.refresh(); updateHint();
      if (Settings.isOpen) Settings.render();
      return id || null;
    },
    // A version from just before a risky action. Never holds the action up for long (opts.timeout).
    async before(reason, label, opts = {}) {
      if (!this.enabled()) return null;
      if (!this.every() && reason !== 'restore' && reason !== 'window') return null;
      const run = (async () => { await Writer.settled(1000); return this.capture('before', { reason, label, patch: opts.patch }); })().catch(() => null);
      if (opts.wait === false) return run;
      return Promise.race([run, sleep(opts.timeout || HIST.beforeTimeout).then(() => null)]);
    },
    // A widget's content suddenly emptied (a note cleared): keep it first. Not awaited, so saves stay in order.
    guardEmptied(ikey, old, v) {
      if (!this.enabled() || !this.every() || old == null) return;
      const oldLen = JSON.stringify(old).length;
      if (oldLen < HIST.emptyMin || (v != null && JSON.stringify(v).length >= oldLen * HIST.emptyRatio)) return;
      if (Date.now() - (this.guardAt.get(ikey) || 0) < HIST.emptyEvery) return;
      this.guardAt.set(ikey, Date.now());
      const inst = S.insts.get(ikey);
      this.before('emptied', `Before ${inst ? instName(inst.widgetId, inst.n) : 'a window'} was emptied`, { wait: false, patch: { ikey, data: clone(old) } });
    },
    // The board changed in this tab (other tabs' changes are theirs to save).
    changed(keys) {
      if (!this.enabled()) return;
      const b = S.boardId;
      if (!keys.some(k => { const p = Keys.parse(k); return p.board === b && /^(board|inst|data|conf|media)$/.test(p.kind); })) return;
      const now = Date.now();
      this.dirty = true; this.lastChangeAt = now; this.firstDirtyAt = this.firstDirtyAt || now;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.check(), this.quiet() + 50);
    },
    async check(leaving) {
      if (!this.enabled() || !this.dirty || !this.every() || this.capturing || (this.low && !leaving)) return;
      if (Inter.active) { clearTimeout(this.timer); this.timer = setTimeout(() => this.check(), 5000); return; }
      const now = Date.now(), newest = this.metas.find(m => /^(auto|open|manual|restored)$/.test(m.kind) || m.manual);
      const every = this.every() * (this.paused === 'over' ? Math.max(1, H_HOUR / this.every()) : 1);
      if (newest && now - newest.at < every) { clearTimeout(this.timer); this.timer = setTimeout(() => this.check(), newest.at + every - now + 50); return; }
      const quiet = now - this.lastChangeAt >= this.quiet(), busy = now - this.firstDirtyAt >= this.every() + 5 * H_MIN;
      if (!quiet && !busy && !leaving) return;   // the settle timer calls again
      this.capturing = true;
      try {
        if (!leaving) await new Promise(r => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 2000 }) : setTimeout(r, 0)));
        await this.capture('auto');
        this.firstDirtyAt = this.dirty ? Date.now() : 0;
      } finally { this.capturing = false; }
    },
    async save(label) { return this.capture('manual', { label }); },

    // ---- keeping it small
    pruneSoon() { clearTimeout(this.pruneT); this.pruneT = setTimeout(() => this.prune(), 2000); },
    async budget() {
      if (this.cfgv.budget) return { B: this.cfgv.budget, low: false };
      if (this.budgetCache && Date.now() - this.budgetCache.t < 10 * H_MIN) return this.budgetCache;
      let B = 30e6, low = false;
      try {
        const e = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
        if (e && e.quota) { B = clamp(e.quota * 0.1, 10e6, 50e6); low = e.quota - e.usage < 50e6 || e.usage / e.quota > 0.9; }
      } catch (err) { /* keep the default */ }
      this.budgetCache = { B, low, t: Date.now() };
      return this.budgetCache;
    },
    async prune() {
      if (!this.enabled()) return;
      try {
        const { B, low } = await this.budget();
        this.low = low;
        const all = (await this.tx(['meta'], 'readonly', (o, set) => { const q = o.meta.getAll(); q.onsuccess = () => set(q.result); })) || [];
        const photos = (await this.tx(['photo'], 'readonly', (o, set) => { const q = o.photo.getAll(); q.onsuccess = () => set(q.result.map(p => ({ key: p.key, size: (p.data || '').length, lastUsed: p.lastUsed || 0 }))); })) || [];
        const now = Date.now(), drop = new Set(), gone = new Set();
        const byBoard = new Map();
        for (const m of all) { if (!byBoard.has(m.b)) byBoard.set(m.b, []); byBoard.get(m.b).push(m); }
        const newest20 = new Set();
        for (const list of byBoard.values()) {
          const keep = historyPlan(list, now, low ? T_LOW : T_LOCAL);
          list.forEach(m => { if (!keep.has(m.id)) drop.add(m.id); });
          // At most 20 versions saved by the teacher per board: the oldest go back to normal thinning.
          const manual = list.filter(m => m.manual).sort((a, b) => b.at - a.at);
          manual.slice(HIST.manualMax).forEach(m => { m.manual = false; gone.add('unpin:' + m.id); });
          list.slice().sort((a, b) => b.at - a.at).slice(0, 20).forEach(m => newest20.add(m.id));
        }
        let live = all.filter(m => !drop.has(m.id));
        // At most 5 different photos; the least recently used go first.
        const used = new Map(photos.map(p => [p.key, p]));
        const refs = Array.from(new Set(live.map(m => m.photo).filter(k => k && k !== 'gone' && used.has(k)))).sort((a, b) => used.get(b).lastUsed - used.get(a).lastUsed);
        const dropPhotos = new Set(refs.slice(HIST.photos));
        live.forEach(m => { if (dropPhotos.has(m.photo)) gone.add(m.id); });
        // Within the byte budget: photos of old versions first, then old versions.
        const total = () => live.reduce((n, m) => n + (m.bytes || 0), 0) + Array.from(new Set(live.filter(m => !gone.has(m.id)).map(m => m.photo))).reduce((n, k) => n + ((used.get(k) || {}).size || 0), 0);
        const old = live.filter(m => !m.manual && !newest20.has(m.id)).sort((a, b) => a.at - b.at);
        for (const m of old) { if (total() <= B) break; if (m.photo && m.photo !== 'gone') gone.add(m.id); }
        for (const m of old) { if (total() <= B) break; drop.add(m.id); live = live.filter(x => x.id !== m.id); }
        this.paused = total() > B ? 'over' : (this.paused === 'over' ? '' : this.paused);
        const stillUsed = new Set(live.filter(m => !gone.has(m.id)).map(m => m.photo).filter(Boolean));
        if (!drop.size && !gone.size && photos.every(p => stillUsed.has(p.key))) return;
        await this.tx(['meta', 'body', 'photo'], 'readwrite', o => {
          drop.forEach(id => { o.meta.delete(id); o.body.delete(id); });
          for (const m of live) {
            const unpin = gone.has('unpin:' + m.id), noPhoto = gone.has(m.id) && m.photo && m.photo !== 'gone';
            if (unpin || noPhoto) { if (noPhoto) m.photo = 'gone'; o.meta.put(m); }
          }
          photos.forEach(p => { if (!stillUsed.has(p.key)) o.photo.delete(p.key); });
        });
        await this.reload();
        HistorySheet.refresh();
      } catch (err) { console.warn('21Board: could not tidy board history', err); }
    },
    // Out of space: keep per board the newest 3 and the teacher's saved versions, with a photo only on the newest.
    async shrink() {
      if (!this.enabled()) return;
      try {
        const all = (await this.tx(['meta'], 'readonly', (o, set) => { const q = o.meta.getAll(); q.onsuccess = () => set(q.result); })) || [];
        const byBoard = new Map();
        for (const m of all) { if (!byBoard.has(m.b)) byBoard.set(m.b, []); byBoard.get(m.b).push(m); }
        const keepPhoto = new Set();
        await this.tx(['meta', 'body', 'photo'], 'readwrite', o => {
          for (const list of byBoard.values()) {
            list.sort((a, b) => b.at - a.at).forEach((m, i) => {
              if (i >= 3 && !m.manual) { o.meta.delete(m.id); o.body.delete(m.id); return; }
              if (i === 0 && m.photo && m.photo !== 'gone') keepPhoto.add(m.photo);
              else if (m.photo && m.photo !== 'gone') { m.photo = 'gone'; o.meta.put(m); }
            });
          }
          const q = o.photo.getAllKeys();
          q.onsuccess = () => q.result.forEach(k => { if (!keepPhoto.has(k)) o.photo.delete(k); });
        });
        await this.reload();
      } catch (err) { console.warn('21Board: could not make room', err); }
    },
    async clearAll() {
      if (!this.enabled()) return;
      try { await this.tx(['meta', 'body', 'photo'], 'readwrite', o => { o.meta.clear(); o.body.clear(); o.photo.clear(); }); } catch (e) { /* nothing to clear */ }
      this.undoable = null;
      await this.reload();
      HistorySheet.refresh(); updateHint();
    },
    async clearBoard(b = S.boardId) {
      const metas = this.metas.slice();
      await this.tx(['meta', 'body'], 'readwrite', o => { metas.forEach(m => { o.meta.delete(m.id); o.body.delete(m.id); }); });
      this.undoable = null;
      await this.reload(); await this.prune();
      HistorySheet.refresh(); updateHint();
    },
    // A small picture of the photo for previews (made once, when there's time).
    async makeThumb(key) {
      try {
        const ph = await this.getPhoto(key);
        if (!ph || ph.thumb || typeof createImageBitmap !== 'function') return;
        const blob = await (await fetch(ph.data)).blob();
        const bmp = await createImageBitmap(blob);
        const k = Math.min(160 / bmp.width, 90 / bmp.height, 1);
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const thumb = c.toDataURL('image/jpeg', 0.6);
        await this.tx(['photo'], 'readwrite', o => { const g = o.photo.get(key); g.onsuccess = () => { if (g.result) { g.result.thumb = thumb; o.photo.put(g.result); } }; });
        HistorySheet.refresh();
      } catch (e) { /* no preview picture */ }
    },

    // ---- going back
    // The built-in Timer: a running timer comes back paused with the time it had left (not ringing at once).
    fix(exp, at) {
      for (const i of exp.instances || []) {
        if (i.widgetId === 'timer' && i.data && typeof i.data.endsAt === 'number') i.data = Object.assign({}, i.data, { remaining: Math.max(0, i.data.endsAt - at), endsAt: null });
      }
      return exp;
    },
    // src: a version id, or {exp, file} (a copy from the folder). Replaces the whole board; can be undone.
    async restore(src, opts = {}) {
      let exp, meta = null;
      if (typeof src === 'string') {
        const r = await this.get(src).catch(() => null);
        if (!r) { toast('That version can’t be found anymore.'); return false; }
        exp = clone(r.body.exp); meta = r.meta;
      } else exp = clone(src.exp);
      const at = (exp.snapshot && exp.snapshot.at) || (exp.history && exp.history.at) || (meta && meta.at) || Date.now();
      delete exp.theme; delete exp.accent;   // going back never changes this device's settings
      this.fix(exp, at);
      const ref = exp.media && exp.media.ref, look = exp.media && exp.media.look;
      delete exp.media;
      const p = parseBoardFile(JSON.stringify(exp));
      let photo = 'exact', gone = false;
      if (ref) {
        const ph = await this.getPhoto(ref).catch(() => null);
        if (ph) { p.photo = { data: ph.data, w: ph.w, h: ph.h, bytes: ph.bytes, name: ph.name, addedAt: ph.addedAt }; p.photoLook = normalizePhotoSettings(look || {}); photo = 'file'; }
        else { photo = 'keep'; gone = !!BoardPhoto.media(); }
      } else if ((meta && meta.photo === 'gone') || !meta) { photo = 'keep'; gone = !!(meta && meta.photo === 'gone'); }
      const label = `Before going back to ${dayTime(at)}`;
      const undoId = await applyImport(p, 'replace', { uid: p.board.uid || S.board.uid, photo, keepCreated: true, history: { reason: 'restore', label }, mustSnapshot: true });
      if (undoId === false) return false;
      await this.capture('restored', { label: opts.undo ? 'Undid going back' : `Went back to ${dayTime(at)}` });
      Link.changed([Keys.board(S.boardId)]); Link.computeOffer();
      this.undoable = undoId && !opts.undo ? { id: undoId, label: `Put the board back to how it was ${when(Date.now())}`, until: Date.now() + HIST.undoMs } : null;
      if (opts.undo) toast('Undone: the board is back as it was.');
      else toast(`Your board is back to how it was ${when(at)}.` + (gone ? ' The background photo from then wasn’t kept, so your photo stays.' : ''), undoAction(undoId));
      HistorySheet.refresh();
      return true;
    },
    // Brings back one window from a version (into a free number if a different window has that one now).
    async putBack(id, ikey, opts = {}) {
      const r = await this.get(id).catch(() => null);
      if (!r) { toast('That version can’t be found anymore.'); return false; }
      const exp = this.fix(clone(r.body.exp), r.meta.at);
      const src = exp.instances.find(i => ikeyOf(i.widgetId, i.instance) === ikey);
      if (!src) return false;
      const widget = getWidget(src.widgetId);
      if (!widget) { toast('That widget isn’t installed on this device.'); return false; }
      const beforeId = await this.before('window', `Before putting back ${instName(src.widgetId, src.instance)}`);
      let target = ikey;
      const cur = S.insts.get(ikey);
      if (!opts.exact && cur && !(src.createdAt && cur.createdAt === src.createdAt)) {
        const used = new Set(Array.from(S.insts.values()).filter(i => i.widgetId === src.widgetId).map(i => i.n));
        let n = 1; while (used.has(n)) n++;
        target = ikeyOf(src.widgetId, n);
      }
      const n = +target.split(':')[1];
      const tmp = Object.assign({}, exp); delete tmp.media;
      const plan = importPlan(parseBoardFile(JSON.stringify(tmp)), 'add');
      const rect = fitRect(plan.convert(src.rect), constraintsFor(widget), boundsRect());
      const b = S.boardId;
      const existed = S.insts.has(target);
      await saveInst(target, { widgetId: src.widgetId, n, open: true, rect, z: maxZ() + 1, maximized: false, createdAt: src.createdAt || Date.now() });
      if (src.data == null) { S.data.delete(target); Writer.del(Keys.data(b, target)); } else { S.data.set(target, clone(src.data)); Writer.put(Keys.data(b, target), 'data', src.data); }
      if (src.config == null) { S.conf.delete(target); Writer.del(Keys.conf(b, target)); } else { S.conf.set(target, clone(src.config)); Writer.put(Keys.conf(b, target), 'conf', src.config); }
      await Writer.settled(2000);
      reconcileWin(target);
      const w = S.wins.get(target);
      if (w) { if (existed) w.reload(); focusWin(target); w.attention(); }
      afterBulkApply();
      const name = instName(src.widgetId, n);
      if (!opts.quiet) toast(`${name} is back as it was ${when(r.meta.at)}.`, beforeId ? { action: 'Undo', timeout: 20000, onAction: async () => {
        const prev = await this.get(beforeId).catch(() => null);
        if (prev && prev.body.exp.instances.some(i => ikeyOf(i.widgetId, i.instance) === target)) this.putBack(beforeId, target, { exact: true, quiet: true });
        else deleteInstance(target, { history: false });
      } } : {});
      else toast(`${name} is back.`);
      HistorySheet.refresh();
      return true;
    },

    // ---- copies in the Google Drive folder ("Board history" inside it), about one an hour
    async folderDir(create) {
      if (!Link.dir || Link.perm !== 'granted' || typeof Link.dir.getDirectoryHandle !== 'function') return null;
      try { return await Link.dir.getDirectoryHandle('Board history', { create: !!create }); } catch (e) { return null; }
    },
    tag(s, n) { return String(s || '').toLowerCase().replace(/[^0-9a-z]/g, '').slice(0, n).padEnd(n, '0'); },
    folderName(meta) {
      const d = new Date(meta.at), p2 = x => String(x).padStart(2, '0'), dev = Link.device();
      const label = dev.label.replace(/^(the|a|an) /i, '').replace(/[()[\]]/g, '').trim().slice(0, 40) || 'device';
      return `${Link.safeName(meta.name)} ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}.${p2(d.getMinutes())}${meta.manual ? ' saved' : ''} (${label}) [${this.tag(meta.uid, 6)}-${this.tag(dev.id, 4)}].21board`;
    },
    parseName(name) {
      const m = /^(.+) (\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})( saved)? \(([^()]{0,40})\) \[([0-9a-z]{6})-([0-9a-z]{4})\]\.21board$/i.exec(name);
      return m ? { name, board: m[1], at: new Date(+m[2], +m[3] - 1, +m[4], +m[5], +m[6]).getTime(), saved: !!m[7], device: m[8], uidTag: m[9].toLowerCase(), devTag: m[10].toLowerCase() } : null;
    },
    async maybeFolder(meta, force) {
      if (!S.settings.historyFolder || !Link.supported || !meta) return;
      if (!/^(auto|open|restored|manual)$/.test(meta.kind) && !meta.manual) return;
      const rec = meta.uid ? Link.boardRec(meta.uid) : null;
      if (rec && meta.sig === rec.loadedSig && !meta.manual) return;   // only showing another device's version: that device keeps its copies
      const last = this.metas.find(m => m.folder);
      if (last && last.sig === meta.sig && !force) return;
      if (!force && last && meta.at - last.at < HIST.folderEvery) return;
      const dir = await this.folderDir(true);
      if (!dir) return;
      try {
        const name = this.folderName(meta);
        let exists = false;
        try { await dir.getFileHandle(name); exists = true; } catch (e) { /* not there yet */ }
        if (!exists) {
          const r = await this.get(meta.id);
          if (!r) return;
          const exp = clone(r.body.exp);
          delete exp.theme; delete exp.accent; delete exp.sent;
          const dev = Link.device();
          exp.history = { at: meta.at, kind: meta.kind, label: meta.label, by: dev.id, from: dev.label };
          await Link.writeFile(name, JSON.stringify(exp), dir);
          await this.writeFolderReadme(dir);
        }
        await this.tx(['meta'], 'readwrite', o => { const g = o.meta.get(meta.id); g.onsuccess = () => { if (g.result) { g.result.folder = name; o.meta.put(g.result); } }; });
        updateSettings({ lastBackupAt: Date.now() });   // a copy off this device counts as a backup
        this.folderStatus = '';
        await this.folderPrune(dir);
        await this.reload();
        HistorySheet.refresh();
      } catch (err) { this.folderStatus = 'Couldn’t write to your folder just now. 21Board will try again.'; console.warn('21Board: board history copy failed', err); }
    },
    async writeFolderReadme(dir) {
      try { await dir.getFileHandle('About these files.txt'); return; } catch (e) { /* write it */ }
      await Link.writeFile('About these files.txt', [
        'Earlier versions of your 21Board boards, kept by 21Board so you can go back after a big change',
        'or if a device is reset.',
        '',
        '- To go back: 21Board > Settings > Board history (at the bottom: "In your Google Drive folder"),',
        '  or open a file with Import.',
        '- 21Board removes older copies automatically (about one an hour, then one a day, then one a week).',
        '  Files whose name ends in "saved" were saved by you and are never removed automatically.',
        '- These copies leave out the background photo.',
        '- They can include student names. Share this folder only with people who should see them.',
        ''
      ].join('\r\n'), dir);
    },
    async folderList(dir) {
      dir = dir || await this.folderDir(false);
      if (!dir) return [];
      const out = [];
      try { for await (const [name, h] of dir.entries()) if (h.kind === 'file') { const p = this.parseName(name); if (p) out.push(p); } } catch (e) { return []; }
      return out.sort((a, b) => b.at - a.at);
    },
    // Thin this device's copies by name (never reading files); other devices' files and the teacher's saved ones stay.
    async folderPrune(dir) {
      const mine = this.tag(Link.device().id, 4), list = (await this.folderList(dir)).filter(f => f.devTag === mine);
      const byBoard = new Map();
      for (const f of list) { if (!byBoard.has(f.uidTag)) byBoard.set(f.uidTag, []); byBoard.get(f.uidTag).push(f); }
      for (const files of byBoard.values()) {
        const keep = historyPlan(files.map(f => ({ id: f.name, at: f.at, manual: f.saved })), Date.now(), T_FOLDER);
        for (const f of files) if (!keep.has(f.name) && !f.saved) { try { await dir.removeEntry(f.name); } catch (e) { /* already gone */ } }
      }
    },
    async readFolderFile(name) {
      const dir = await this.folderDir(false);
      if (!dir) throw new Error('The folder isn’t available.');
      return JSON.parse(await Link.readFile(name, dir));
    },
    async deleteFolderCopies(uid) {
      const dir = await this.folderDir(false);
      if (!dir) return 0;
      const t = this.tag(uid, 6);
      let n = 0;
      for (const f of await this.folderList(dir)) if (f.uidTag === t) { try { await dir.removeEntry(f.name); n++; } catch (e) { /* gone */ } }
      return n;
    },

    // ---- startup
    async start() {
      if (this.started || !this.enabled()) return;
      this.started = true;
      try { await this.db(); } catch (e) { if (Settings.isOpen) Settings.render(); return; }
      await this.reload();
      updateHint();
      this.prune();
      setTimeout(() => { if (S.insts.size && !this.cfgv.skipOpen) this.capture('open'); }, HIST.openDelay);
      setInterval(() => this.check(), HIST.tick);
      setInterval(() => { if (document.visibilityState === 'visible' && this.metas[0] && !this.metas[0].folder) this.maybeFolder(this.metas[0]); }, 15 * H_MIN);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { if (this.dirty) this.check(true); }
        else if (this.metas[0] && new Date(this.metas[0].at).toDateString() !== new Date().toDateString()) setTimeout(() => { if (S.insts.size) this.capture('open'); }, 3000);
      });
      window.addEventListener('pagehide', () => { if (this.dirty) this.check(true); });
    }
  };

  // Settings → Board history (the first section).
  function historySettings(sw, seg) {
    const H = BoardHistory;
    if (LAB) return '';
    if (!H.enabled()) return `<h3>Board history</h3><div class="row"><div class="hint">Board history isn’t available in this browser window.</div></div>`;
    const n = H.metas.length, bytes = H.metas.reduce((a, m) => a + (m.bytes || 0), 0), oldest = H.metas[n - 1];
    const lastFolder = H.metas.find(m => m.folder);
    const warn = H.paused === 'quota' ? ' Board history is paused: this device is out of space.' : H.low ? ' Space is low on this device, so fewer earlier versions are kept.' : H.status === 'too-big' ? ' This board is too big for automatic versions.' : '';
    const every = String(S.settings.historyEvery == null ? 10 : S.settings.historyEvery);
    return `<h3>Board history</h3>
      <div class="row"><div><div class="lbl">Go back to an earlier version</div><div class="hint">Earlier versions of this board are kept on this device, so you can undo a mistake (or a curious student). ${n ? `${n} version${n === 1 ? '' : 's'} (${fmtBytes(bytes)}), the oldest from ${esc(new Date(oldest.at).toLocaleDateString([], { month: 'short', day: 'numeric' }))}.` : 'None yet.'}${lastFolder && Link.dir ? ` The last copy in your folder was saved ${esc(when(lastFolder.at))}.` : ''}${warn}</div></div>
        <button class="btn primary" data-act="hist-open">${svg('history')}Board history…</button></div>
      <div class="row stack"><div><div class="lbl">Save a version</div><div class="hint">While the board is changing. One is also saved before Reset, Delete, Import, Load and going back.</div></div>${seg('hist-every', every, [['10', 'Every 10 min'], ['60', 'Every hour'], ['1440', 'Once a day'], ['0', 'Off']])}</div>
      ${Link.dir ? `<div class="row"><div><div class="lbl">Copies in your Google Drive folder</div><div class="hint">About one an hour, in “Board history” inside your folder (without the background photo), so you can go back even if this device is reset.${H.folderStatus ? ' ' + esc(H.folderStatus) : ''}</div></div>${sw('hist-folder', S.settings.historyFolder !== false, 'Copies in your Google Drive folder')}</div>` : ''}
      <div class="row"><div><div class="lbl">Delete board history</div><div class="hint">Deletes the earlier versions. The board itself stays as it is.</div></div><button class="btn small danger" data-act="hist-delete">Delete…</button></div>`;
  }

  // The Board history sheet: every version of the board, a preview, what changed, Go back / Put back.
  const HistorySheet = {
    el: null, body: null, side: 'left', isOpen: false, sel: null, ikey: null, now: null, folder: [], showOthers: false, thumbs: new Map(), rt: 0,

    init() {
      this.el = $('#history');
      this.body = $('.sheet-body', this.el);
      const closeBtn = $('[data-close]', this.el);
      closeBtn.innerHTML = svg('close');
      closeBtn.addEventListener('click', () => this.close());
      this.body.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (b && !b.disabled) this.act(b.dataset.act, b.dataset.val, b);
      });
    },
    async open(side, opts = {}) {
      closePopups({ keepHistory: true });
      this.side = side === 'right' ? 'right' : 'left';
      this.ikey = opts.ikey || null;
      this.sel = null; this.showOthers = false;
      this.el.classList.remove('left', 'right');
      this.el.classList.add(this.side, 'open');
      this.isOpen = true;
      this.body.innerHTML = '<p class="hist-intro">Loading…</p>';
      await BoardHistory.reload();
      await this.loadExtras();
      this.render();
    },
    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.el.classList.remove('open');
    },
    async loadExtras() {
      try {
        const exp = await buildExport('full');
        this.now = { sig: boardSig(exp), wins: BoardHistory.winsOf(exp), thumb: BoardHistory.thumbOf(exp), photo: BoardHistory.photoKeyOf(exp.media && exp.media.background), name: S.board.name };
      } catch (e) { this.now = null; }
      for (const k of new Set(BoardHistory.metas.map(m => m.photo).filter(k => k && k !== 'gone'))) {
        if (this.thumbs.has(k)) continue;
        const ph = await BoardHistory.getPhoto(k).catch(() => null);
        if (ph && ph.thumb) this.thumbs.set(k, ph.thumb);
      }
      this.folder = S.settings.historyFolder !== false ? await BoardHistory.folderList() : [];
    },
    refresh() {
      if (!this.isOpen) return;
      clearTimeout(this.rt);
      this.rt = setTimeout(async () => { await this.loadExtras(); this.render(); }, 150);
    },
    label(m) {
      if (m.manual) { const l = m.kind === 'manual' ? m.label : m.manualLabel; return 'Saved by you' + (l ? ` · ${l}` : ''); }
      return m.kind === 'auto' ? 'Saved automatically' : m.kind === 'open' ? 'When 21Board opened' : (m.label || 'Saved');
    },
    minimap(t, opts = {}) {
      if (!t) return '';
      const bg = /^#[0-9a-f]{6}$/i.test(t.bg || '') ? t.bg : 'var(--board-bg)';
      const img = opts.photo ? `<image href="${esc(opts.photo)}" x="0" y="0" width="${t.vw}" height="${t.vh}" preserveAspectRatio="xMidYMid slice"/>` : '';
      const wins = (t.wins || []).map(([ik, x, y, w, h]) => {
        const [wid, n] = ik.split(':'), widget = getWidget(wid), c = widget ? widget.color : '#94a3b8', tb = Math.min(h, 40);
        return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="var(--surface)" stroke="${c}" stroke-width="5"/><rect x="${x}" y="${y}" width="${w}" height="${tb}" rx="14" fill="${c}"/>` +
          (opts.labels && w > 120 ? `<text x="${x + w / 2}" y="${y + tb * 0.72}" font-size="${Math.round(tb * 0.62)}" font-weight="700" text-anchor="middle" fill="#fff">${esc(instName(wid, +n))}</text>` : '') + '</g>';
      }).join('');
      return `<svg class="minimap" viewBox="0 0 ${t.vw} ${t.vh}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect width="${t.vw}" height="${t.vh}" fill="${bg}"/>${img}${wins}</svg>`;
    },
    chips(items, cls = 'chip') { return items.length ? `<span class="chips">${items.slice(0, 3).map(t => `<span class="${cls}">${esc(t)}</span>`).join('')}${items.length > 3 ? `<span class="${cls}">+${items.length - 3} more</span>` : ''}</span>` : ''; },
    photoOf(m) { return m.photo && m.photo !== 'gone' ? this.thumbs.get(m.photo) : null; },

    render() {
      if (!this.isOpen) return;
      const top = this.body.scrollTop;
      const H = BoardHistory;
      if (!H.enabled()) { this.body.innerHTML = '<p class="hist-intro">Board history isn’t available in this browser window.</p>'; return; }
      this.body.innerHTML = this.ikey ? this.renderWindow() : this.renderBoard();
      this.body.scrollTop = top;
    },
    renderBoard() {
      const H = BoardHistory, metas = H.metas, now = this.now;
      let html = '<p class="hist-intro">Tap a time to see how your board looked. Nothing changes until you tap Go back.</p>';
      if (H.undoable && H.undoable.until > Date.now()) html += `<div class="hist-undo"><span>${esc(H.undoable.label)}</span><button class="btn small primary" data-act="undo">Undo</button></div>`;
      if (!metas.length) return html + '<p class="empty-note">No earlier versions yet. 21Board saves one when the board changes, and before risky actions like Reset or Import.</p>' + this.renderFoot();
      // The version most likely wanted after a disaster.
      const noneOpen = now && !Object.values(now.wins).some(w => w[0]);
      const hero = noneOpen ? metas.find(m => m.thumb && m.thumb.wins.length && (!now || m.sig !== now.sig))
        : metas.find(m => m.beforeBig && Date.now() - m.at < 3 * H_DAY && (!now || m.sig !== now.sig));
      if (hero) {
        const after = H.diff(hero, metas[metas.indexOf(hero) - 1] || now);
        html += `<button class="hist-hero" data-act="sel" data-val="${esc(hero.id)}">${this.minimap(hero.thumb, { photo: this.photoOf(hero) })}<span><b>${noneOpen ? 'Before the windows were closed' : 'Before the last big change'}</b><span>${esc(dayTime(hero.at))}${after.length ? '. After it: ' + esc(after.slice(0, 3).join(', ').toLowerCase()) : ''}</span></span></button>`;
      }
      let day = '';
      metas.forEach((m, i) => {
        const d = new Date(m.at), dk = d.toDateString();
        if (dk !== day) { day = dk; html += `<div class="hist-day">${esc(dayTime(m.at).replace(/,? \d{1,2}:\d{2}.*$/, '').replace(/ \d{1,2}:\d{2}.*$/, ''))}</div>`; }
        const older = metas[i + 1];
        const tags = [];
        if (m.beforeBig) tags.push('<span class="tag big">Before a big change</span>');
        if (m.link === 'sent') tags.push('<span class="tag">Sent to your folder</span>');
        if (m.link === 'loaded') tags.push('<span class="tag">Loaded from another device</span>');
        if (m.name !== S.board.name) tags.push(`<span class="tag">Then called “${esc(m.name)}”</span>`);
        const sel = this.sel === m.id;
        html += `<button class="hist-row${sel ? ' sel' : ''}" data-act="sel" data-val="${esc(m.id)}" aria-expanded="${sel}">${this.minimap(m.thumb, { photo: this.photoOf(m) })}<span class="meta2">` +
          `<span class="when">${esc(new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span><span class="what">${esc(this.label(m))}</span>` +
          `${this.chips(older ? H.diff(older, m) : [])}${tags.length ? `<span class="chips">${tags.join('')}</span>` : ''}</span></button>`;
        if (sel) html += this.renderDetail(m, metas[i - 1]);
      });
      return html + this.renderFoot();
    },
    renderDetail(m, newer) {
      const H = BoardHistory, now = this.now;
      const same = now && m.sig === now.sig;
      const after = newer ? H.diff(m, newer) : null, vsNow = now ? H.diff(m, now) : [];
      const notes = [];
      if (m.uid && S.board.uid && m.uid !== S.board.uid) notes.push(`Back then, this board was “${m.name}”. Going back brings that board back.`);
      if (m.photo === 'gone') notes.push('The background photo from then wasn’t kept, so going back keeps your photo now.');
      if (Link.st.auto && Link.dir) notes.push('Send automatically is on, so your other devices will be offered this version.');
      const wins = Object.keys(m.wins || {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const rows = wins.map(ik => {
        const [wid, n] = ik.split(':'), widget = getWidget(wid), w = m.wins[ik], cur = now && now.wins[ik];
        const state = !cur ? 'Not on the board now' : (w[0] && !cur[0]) ? 'Closed now' : (w[2] !== cur[2] || w[3] !== cur[3]) ? 'Different now' : 'Same as now';
        const differs = state !== 'Same as now';
        return `<div class="inst"><span class="widget-icon" style="--c:${esc(widget ? widget.color : '#9ca3af')}">${widget ? widget.icon : svg('widget')}</span>` +
          `<div class="meta"><b>${esc(instName(wid, +n))}${w[0] ? '' : ' (closed then)'}</b><span>${esc(w[5] || (widget ? '' : 'Widget not installed'))}</span></div>` +
          `<span class="pill${differs ? ' diff' : ''}">${state}</span>` +
          (differs && widget ? `<button class="btn small" data-act="put" data-val="${esc(m.id + '|' + ik)}">Put back</button>` : '') + '</div>';
      }).join('');
      return `<div class="hist-detail">${this.minimap(m.thumb, { photo: this.photoOf(m), labels: true })}
        <p><b>${esc(dayTime(m.at))}</b> · ${esc(this.label(m))}</p>
        <p>${after ? (after.length ? 'After this: ' + esc(after.join(', ')) + '.' : 'Nothing changed after this until the next version.') : 'This is the newest version.'}</p>
        <p>${same ? 'Same as your board now.' : vsNow.length ? 'Compared with now: ' + esc(vsNow.join(', ')) + '.' : 'Small differences from your board now.'}</p>
        ${notes.map(t => `<p class="hint">${esc(t)}</p>`).join('')}
        ${rows ? `<div class="inst-list">${rows}</div>` : '<p class="hint">No windows.</p>'}
        ${same ? '' : `<button class="btn primary" data-act="go" data-val="${esc(m.id)}">${svg('history')}Go back to ${esc(dayTime(m.at))}</button>`}</div>`;
    },
    renderFoot() {
      const H = BoardHistory;
      let html = `<div class="hist-foot"><button class="btn" data-act="save">${svg('plus')}Save this version now</button>
        <p class="hint">Kept on this device: every version from the last few hours, then one an hour for 2 days, the first and last of each day for a month, and one a week for 3 months. Versions you save are kept until you delete them. Earlier versions aren’t a backup: if the browser clears 21Board’s data, they go too.</p></div>`;
      if (Link.dir && Link.perm === 'granted' && S.settings.historyFolder !== false) {
        const t = H.tag(S.board.uid, 6), mine = this.folder.filter(f => f.uidTag === t).slice(0, 20), others = this.folder.filter(f => f.uidTag !== t);
        html += `<div class="hist-day">In your Google Drive folder</div>` + (mine.length ? `<div class="inst-list">${mine.map(f => `<div class="inst"><div class="meta"><b>${esc(dayTime(f.at))}${f.saved ? ' · saved by you' : ''}</b><span>From ${esc(f.device)}</span></div><button class="btn small" data-act="folder-go" data-val="${esc(f.name)}">Go back</button></div>`).join('')}</div>` : '<p class="hint">No copies of this board there yet (about one an hour).</p>');
        if (others.length) {
          html += `<button class="btn small" data-act="others">${this.showOthers ? 'Hide' : 'Show'} other boards’ copies (${others.length})</button>`;
          if (this.showOthers) html += `<div class="inst-list">${others.slice(0, 40).map(f => `<div class="inst"><div class="meta"><b>${esc(f.board)}</b><span>${esc(dayTime(f.at))} · from ${esc(f.device)}</span></div><button class="btn small" data-act="folder-go" data-val="${esc(f.name)}">Use</button></div>`).join('')}</div>`;
        }
      }
      return html;
    },
    renderWindow() {
      const H = BoardHistory, ik = this.ikey, [wid, n] = ik.split(':'), cur = this.now && this.now.wins[ik];
      let html = `<p class="hist-intro"><b>Earlier versions of ${esc(instName(wid, +n))}</b>. Putting one back changes only this window.</p>`;
      html += `<div class="inst-list"><div class="inst"><div class="meta"><b>Now</b><span>${esc(cur ? cur[5] || '(empty)' : 'Not on the board')}</span></div></div>`;
      let last = cur ? cur[2] + '|' + cur[3] : null, count = 0;
      for (const m of H.metas) {
        const w = m.wins && m.wins[ik];
        if (!w) continue;
        const key = w[2] + '|' + w[3];
        if (key === last) continue;
        last = key; count++;
        html += `<div class="inst"><div class="meta"><b>${esc(dayTime(m.at))}</b><span>${esc(w[5] || '(empty)')}</span></div><button class="btn small" data-act="put" data-val="${esc(m.id + '|' + ik)}">Put back this version</button></div>`;
      }
      html += '</div>';
      if (!count) html += '<p class="hint">No different versions of this window yet.</p>';
      return html + `<p><button class="btn small" data-act="whole">Show the whole board’s history</button></p>`;
    },

    async act(act, val) {
      const H = BoardHistory;
      switch (act) {
        case 'sel': {
          this.sel = this.sel === val ? null : val; this.render();
          const d = $('.hist-detail', this.body);
          if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          break;
        }
        case 'go': this.close(); await H.restore(val); break;
        case 'put': { const [id, ik] = val.split('|'); this.close(); await H.putBack(id, ik); break; }
        case 'undo': if (H.undoable) { const id = H.undoable.id; H.undoable = null; this.close(); await H.restore(id, { undo: true }); } break;
        case 'whole': this.ikey = null; this.render(); break;
        case 'others': this.showOthers = !this.showOthers; this.render(); break;
        case 'save': {
          const r = await dialog({ title: 'Save this version', message: 'It’s kept until you delete it.', input: { label: 'Name (optional)', placeholder: 'Monday setup', maxlength: 60 }, actions: [{ label: 'Save', value: true, kind: 'primary' }, { label: 'Cancel', value: false }] });
          if (r && r.value) { const id = await H.save(r.text); toast(id ? 'Saved this version of the board.' : 'Couldn’t save a version just now.'); }
          break;
        }
        case 'folder-go': {
          let exp;
          try { exp = await H.readFolderFile(val); } catch (e) { toast('Couldn’t read that copy: ' + ((e && e.message) || e)); break; }
          this.close();
          await H.restore({ exp });
          break;
        }
      }
    }
  };

  // =====================================================================
  // 14. Dialogs and toasts
  // =====================================================================
  let dialogResolve = null;
  // input: {label, placeholder, maxlength}: also asks for a line of text; resolves {value, text} (or null).
  function dialog({ title, message, actions, input }) {
    closePopups({ keepSettings: true, keepHistory: true });
    if (dialogResolve) dialogResolve(null);
    const modal = $('#modal'), card = $('.modal-card', modal);
    card.innerHTML = `<h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}` +
      (input ? `<label class="modal-input"><span>${esc(input.label || '')}</span><input type="text" class="text-input" maxlength="${+input.maxlength || 60}" placeholder="${esc(input.placeholder || '')}" autocomplete="off"></label>` : '') +
      `<div class="modal-actions">` +
      actions.map((a, i) => `<button class="btn ${a.kind || ''} ${a.choice ? 'choice' : ''}" data-i="${i}">${esc(a.label)}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</button>`).join('') + '</div>';
    modal.classList.add('open');
    const field = input ? $('input', card) : null;
    const first = field || $('.btn', card);
    if (first) first.focus();
    return new Promise(resolve => {
      const answer = v => (field ? (v == null ? null : { value: v, text: field.value.trim() }) : v);
      dialogResolve = v => { dialogResolve = null; modal.classList.remove('open'); resolve(answer(v)); };
      card.onclick = e => { const b = e.target.closest('[data-i]'); if (b) dialogResolve(actions[+b.dataset.i].value); };
      modal.onclick = e => { if (e.target === modal) dialogResolve(null); };
      if (field) field.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); dialogResolve(actions[0].value); } };
    });
  }

  function toast(text, opts = {}) {
    const host = $('#toasts');
    while (host.children.length >= 3) (Array.from(host.children).find(c => !c.sticky) || host.firstChild).remove();   // keep waiting questions
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${esc(text)}</span>`;
    const remove = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
    if (opts.action) {
      const b = document.createElement('button');
      b.textContent = opts.action;
      b.addEventListener('click', () => { remove(); opts.onAction && opts.onAction(); });
      t.appendChild(b);
    }
    if (opts.dismiss) {   // a second, quieter button ("Not now")
      const b = document.createElement('button');
      b.textContent = opts.dismiss;
      b.className = 'quiet';
      b.addEventListener('click', () => { remove(); opts.onDismiss && opts.onDismiss(); });
      t.appendChild(b);
    }
    t.remove2 = remove;
    host.appendChild(t);
    const timeout = opts.timeout === undefined ? 4200 : opts.timeout;
    if (timeout) setTimeout(remove, timeout); else t.sticky = true;
    return t;
  }

  function closePopups(opts = {}) {
    Picker.close();
    Menu.close();
    if (!opts.keepSettings) Settings.close();
    if (!opts.keepHistory) HistorySheet.close();
  }

  // =====================================================================
  // 15. PWA: service worker, persistent storage, file launch
  // =====================================================================
  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) { S.sw.state = 'unsupported'; return; }
    let reloadOnChange = false;
    S.sw.applyUpdate = sw => { reloadOnChange = true; sw.postMessage({ type: 'SKIP_WAITING' }); };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadOnChange) { location.reload(); return; }
      S.sw.state = 'ready';
      querySWVersion();
      if (Settings.isOpen) Settings.refreshStatus();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      const offer = sw => {
        S.sw.updateReady = sw;
        Picker.renderControls();
        if (Settings.isOpen) Settings.refreshStatus();
        toast('A new version of 21Board is ready.', { action: 'Update', timeout: 0, onAction: applyUpdate });
      };
      const watch = sw => {
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) offer(sw);
          if (sw.state === 'activated' && !navigator.serviceWorker.controller) S.sw.state = 'ready';
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      if (navigator.serviceWorker.controller) { S.sw.state = 'ready'; querySWVersion(); }
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); // boards stay open all day
    }).catch(err => {
      console.warn('21Board: service worker registration failed', err);
      S.sw.state = 'error';
    });
  }

  function applyUpdate() {
    if (S.sw.updateReady && S.sw.applyUpdate) S.sw.applyUpdate(S.sw.updateReady);
  }

  function querySWVersion() {
    const ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!ctrl || typeof MessageChannel === 'undefined') return;
    const ch = new MessageChannel();
    ch.port1.onmessage = e => { S.sw.version = e.data && e.data.version; if (Settings.isOpen) Settings.refreshStatus(); };
    ctrl.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  }

  /*
   * Persistent storage. Browsers may clear a site's storage when the device runs low on
   * space unless the site has been granted "persistent" storage. No web page can force this:
   * 21Board asks every time it starts (and again later), and the browser decides — Chrome
   * and Edge grant it automatically based on signals such as the app being installed.
   * When it isn't granted, 21Board nudges toward installing and toward regular backups.
   */
  const Persist = {
    state: 'unknown',   // 'granted' | 'not-granted' | 'unsupported' | 'unknown'
    lastAsk: 0,
    supported() { return !!(navigator.storage && navigator.storage.persist && navigator.storage.persisted); },
    async check() {
      if (location.protocol === 'file:') { this.state = 'file'; return this.state; }
      if (!window.isSecureContext) { this.state = 'insecure'; return this.state; }
      if (!this.supported()) { this.state = 'unsupported'; return this.state; }
      try { this.state = (await navigator.storage.persisted()) ? 'granted' : 'not-granted'; } catch (e) { /* keep last state */ }
      return this.state;
    },
    async request(force) {
      if (this.state === 'file' || this.state === 'insecure') return this.state;
      if (!this.supported()) { this.state = 'unsupported'; return this.state; }
      if (this.state === 'granted') return this.state;
      if (!force && Date.now() - this.lastAsk < 30 * 60 * 1000) return this.state;
      this.lastAsk = Date.now();
      try { this.state = (await navigator.storage.persist()) ? 'granted' : 'not-granted'; } catch (e) { /* ignore */ }
      if (Settings.isOpen) Settings.refreshStatus();
      return this.state;
    },
    async init() {
      await this.check();
      await this.request(true);
      // The browser's answer can change (e.g. once the app is installed or used regularly), so ask again later.
      // Boards stay open all day, so the backup reminder is re-checked hourly and when the tab is shown again
      // (after a short delay so the board has finished re-reading its data).
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible') return;
        await this.request();
        setTimeout(maybeRemindBackup, 2000);
      });
      setTimeout(maybeRemindBackup, 8000);
      setInterval(maybeRemindBackup, 60 * 60 * 1000);
    }
  };

  // Chrome/Edge "Install app" prompt, offered in Settings when storage isn't protected yet.
  const Install = {
    prompt: null,
    init() {
      // Keep the event so Settings can offer "Install app". (No preventDefault: Chrome's own
      // install offer, e.g. the Android "Add to Home screen" banner, still appears.)
      window.addEventListener('beforeinstallprompt', e => {
        this.prompt = e;
        if (Settings.isOpen) Settings.refreshStatus();
      });
      window.addEventListener('appinstalled', () => {
        this.prompt = null;
        Persist.request(true);
        if (Settings.isOpen) Settings.refreshStatus();
      });
    },
    async run() {
      const p = this.prompt;
      if (!p) return;
      this.prompt = null;
      try { await p.prompt(); await p.userChoice; } catch (e) { /* dismissed */ }
      Persist.request(true);
    }
  };

  const DAY = 24 * 60 * 60 * 1000;
  function backupAgo() {
    const t = S.settings.lastBackupAt;
    if (!t) return 'Last full backup: never';
    const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const days = Math.round((midnight(Date.now()) - midnight(t)) / DAY); // calendar days, DST-safe
    return 'Last full backup: ' + (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
  }

  // If the browser hasn't promised to keep the data, remind (at most every 3 days) to export a backup.
  function maybeRemindBackup() {
    if (document.visibilityState !== 'visible') return; // never use up the reminder in a background tab
    if (Persist.state === 'granted' || Store.failed || !S.data.size) return;
    let oldest = Infinity;
    for (const i of S.insts.values()) oldest = Math.min(oldest, i.createdAt || Infinity);
    if (!(Date.now() - oldest > DAY)) return;                         // brand-new board: nothing to lose yet
    if (Date.now() - (S.settings.lastBackupAt || 0) < 7 * DAY) return; // backed up recently
    let nagged = 0;
    try { nagged = +localStorage.getItem('21board-backup-reminder') || 0; } catch (e) { /* ignore */ }
    if (Date.now() - nagged < 3 * DAY) return;
    try { localStorage.setItem('21board-backup-reminder', String(Date.now())); } catch (e) { /* ignore */ }
    toast('This browser hasn’t promised to keep 21Board’s data yet. Save a backup file?', { action: 'Back up', timeout: 15000, onAction: () => doExport('full') });
  }

  function setupFileLaunch() {
    if ('launchQueue' in window && window.launchQueue && window.launchQueue.setConsumer) {
      window.launchQueue.setConsumer(async params => {
        if (!params.files || !params.files.length) return;
        try { await importFile(await params.files[0].getFile()); } catch (e) { console.warn(e); }
      });
    }
  }

  // =====================================================================
  // 15b. Widget test mode: the bridge to the dev window (LAB only)
  // ---------------------------------------------------------------------
  // The dev window (sdk/board21-dev.js) shows this board scaled into an AI tool's preview, so a widget can
  // be tried in a real window: title bar, resize handles, menu, Settings. Messages with {b21lab: 1}:
  //   to the dev window:   ready {storage}, view {win, menu, info, active} (for its camera),
  //                        log {dir, mtype, summary, json} (SDK messages), log {level, text} (widget errors),
  //                        state {instances, focused, settings, scale, shape}, relay {data}
  //   from the dev window: {cmd, args}: theme, accent, scale, shape, reload, reset, clear, setData, open,
  //                        state, relay
  // Messages from anything but the parent frame are ignored. Other messages a widget posts (e.g. an AI
  // tool's own preview APIs) are relayed up, and the dev window relays the answers back down.
  // =====================================================================
  const LabBridge = {
    viewSig: '',
    stateT: 0,
    start() {
      window.addEventListener('message', e => {
        const m = e.data;
        if (e.source !== window.parent || !m || m.b21lab !== 1 || typeof m.cmd !== 'string') return;
        this.run(m.cmd, m.args && typeof m.args === 'object' ? m.args : {});
      });
      const id = REGISTRY[0] && REGISTRY[0].id;
      const open = Array.from(S.insts.values()).filter(i => i.widgetId === id && i.open);
      if (id && !open.length) openWidget(id);
      else if (open.length) focusWin(ikeyOf(id, open[0].n));
      this.post('ready', { storage: Store.mem ? 'memory' : 'indexeddb', accents: Object.keys(ACCENTS) });
      this.sendState();
      const tick = () => { this.view(); setTimeout(tick, 200); };
      tick();
    },
    post(type, payload) {
      try { window.parent.postMessage(Object.assign({ b21lab: 1, type }, payload || {}), '*'); } catch (e) { /* no dev window */ }
    },
    // Where the focused window and its menu are on this board's screen, for the dev window's camera.
    view() {
      // The focused window, else the first open one (tapping the empty board shouldn't move the camera).
      const w = (S.focused && S.wins.get(S.focused)) || Array.from(S.wins.values())[0] || null;
      const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
      const menu = $('#menu.open');
      let info = null;
      if (w && w.disp) {
        const c = w.constraints(), d = w.disp;
        const num = v => (isFinite(v) ? Math.round(v) : null);
        info = { ikey: w.ikey, w: num(d.w), h: num(d.h - TITLE_H), ratio: c.ratio || null, minW: num(c.minW), minH: num(c.minH - TITLE_H),
          maxW: num(c.maxW), maxH: num(c.maxH - TITLE_H), resizable: c.resizable !== false, maximized: !!(w.inst && w.inst.maximized) };
      }
      const v = { win: w ? box(w.el) : null, menu: menu ? box(menu) : null, info, scale: boardScale(), shape: freeShape() ? 'free' : '16:9', active: Inter.active };
      const sig = JSON.stringify(v);
      if (sig === this.viewSig) return;
      this.viewSig = sig;
      this.post('view', v);
    },
    log(dir, w, m) {
      let json = '';
      try { json = JSON.stringify(m); } catch (e) { json = '(not JSON)'; }
      const t = m && m.type;
      const sum = t === 'menu' && dir === 'in' ? `${(m.items || []).length} items` : t === 'menu' ? JSON.stringify(m.id)
        : t === 'window' && dir === 'in' ? `${m.op}(${(m.args || []).map(a => JSON.stringify(a)).join(', ')})`
        : t === 'window' ? `${m.info && m.info.width}×${m.info && m.info.height}${m.info && m.info.maximized ? ' maximized' : ''}`
        : (t === 'save' || t === 'saveConfig' || t === 'data' || t === 'config') ? `${json.length} bytes` : t === 'ack' ? (m.ok ? 'ok' : 'failed: ' + m.error) : '';
      this.post('log', { dir, ikey: w.ikey, mtype: String(t), summary: sum, json: json.length > 3000 ? json.slice(0, 3000) + '…' : json });
      if (/^(save|saveConfig|hello|data|config)$/.test(t)) this.stateSoon();
    },
    stateSoon() { clearTimeout(this.stateT); this.stateT = setTimeout(() => this.sendState(), 120); },
    sendState() {
      this.post('state', {
        instances: Array.from(S.insts.values()).sort((a, b) => a.n - b.n).map(i => {
          const ik = ikeyOf(i.widgetId, i.n);
          return { ikey: ik, n: i.n, open: !!i.open, data: S.data.has(ik) ? S.data.get(ik) : null, config: S.conf.has(ik) ? S.conf.get(ik) : null };
        }),
        focused: S.focused, settings: { theme: S.settings.theme, accent: S.settings.accent }, scale: boardScale(), shape: freeShape() ? 'free' : '16:9'
      });
    },
    // A message a widget posted that isn't for 21Board: pass it up (e.g. to the AI tool hosting the preview).
    relayUp(e) {
      const m = e.data;
      if ((m && (m.b21 === SDK_PROTOCOL || m.b21lab === 1)) || e.source === window.parent) return;
      for (const w of S.wins.values()) if (w.iframe && w.iframe.contentWindow === e.source) { try { this.post('relay', { data: m }); } catch (err) { /* not cloneable */ } return; }
    },
    async run(cmd, a) {
      const focused = () => S.wins.get(S.focused) || Array.from(S.wins.values())[0] || null;
      switch (cmd) {
        case 'theme': updateSettings({ theme: ['light', 'dark', 'system'].includes(a.value) ? a.value : 'system' }); break;
        case 'accent': if (accentOf(a.value)) updateSettings({ accent: a.value }); break;
        case 'scale': if (a.dir) scaleStep(a.dir > 0 ? 1 : -1); else setBoardScale(+a.value); if (Settings.isOpen) Settings.render(); break;
        case 'shape': setBoardShape(a.value === 'free' ? 'free' : '16:9'); if (Settings.isOpen) Settings.render(); break;
        case 'reload': for (const w of S.wins.values()) w.reload(); break;
        case 'reset': { const w = focused(); if (w) await resetWin(w.ikey); break; }
        case 'clear': {   // forget every test window's content and config
          const b = S.boardId, keys = Array.from(S.insts.keys());
          for (const ik of keys) { S.data.delete(ik); S.conf.delete(ik); }
          await Promise.all(keys.flatMap(ik => [Writer.del(Keys.data(b, ik)), Writer.del(Keys.conf(b, ik))]));
          for (const w of S.wins.values()) w.reload();
          break;
        }
        case 'setData': {   // as if the content or config changed in another tab
          const w = S.wins.get(a.ikey) || focused();
          if (!w) break;
          const conf = a.kind === 'config', map = conf ? S.conf : S.data, key = (conf ? Keys.conf : Keys.data)(S.boardId, w.ikey);
          const v = a.value === undefined ? null : clone(a.value);
          if (v === null) { map.delete(w.ikey); await Writer.del(key); } else { map.set(w.ikey, v); await Writer.put(key, conf ? 'conf' : 'data', v); }
          w.post(conf ? 'config' : 'data', conf ? { config: v, reason: 'remote' } : { data: v, reason: 'remote' });
          break;
        }
        case 'open': if (REGISTRY[0]) openWidget(REGISTRY[0].id); break;
        case 'relay': for (const w of S.wins.values()) { try { w.iframe.contentWindow.postMessage(a.data, '*'); } catch (e) { /* gone */ } } break;
        case 'state': break;
      }
      this.stateSoon();
    }
  };

  // =====================================================================
  // 16. Boot
  // =====================================================================
  function initUI() {
    Picker.init();
    Menu.init();
    Settings.init();
    HistorySheet.init();
    ShapeHint.init();
    const rescueBtn = $('#empty-hint .rescue button');
    if (rescueBtn) rescueBtn.addEventListener('click', () => HistorySheet.open('left'));
    $('#desk').addEventListener('pointerdown', onDeskPointerDown);
    document.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && e.isPrimary) forgetStaleTouches(e.pointerId); }, true);
    document.addEventListener('pointermove', e => Inter.move(e));
    // Touches that started on the board (a title bar, the empty board) carry every later finger's touchmove too,
    // including fingers moving a window from inside a widget: keep the browser from panning those away.
    document.addEventListener('touchmove', e => {
      if (!e.cancelable) return;
      if (Inter.active || Array.from(S.wins.values()).some(w => w.contentBusy && w.contentBusy())) e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerup', e => Inter.end(e, false));
    document.addEventListener('pointercancel', e => Inter.end(e, true));
    document.addEventListener('lostpointercapture', e => { if (Inter.map.has(e.pointerId)) Inter.end(e, false); });

    // Tapping outside a popup closes it.
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      if (Picker.side && !t.closest('#panel') && !t.closest('.picker-btn')) Picker.close();
      if (Menu.win && !t.closest('#menu') && !t.closest('.win-label')) Menu.close();
      if (Settings.isOpen && !t.closest('#settings') && !t.closest('#modal') && !t.closest('.picker-btn') && !t.closest('#panel')) Settings.close();
      if (HistorySheet.isOpen && !t.closest('#history') && !t.closest('#modal') && !t.closest('#toasts') && !t.closest('.picker-btn') && !t.closest('#panel') && !t.closest('#empty-hint')) HistorySheet.close();
    }, true);
    // Focus moving into a widget iframe (a tap inside it) also closes popups.
    window.addEventListener('blur', () => setTimeout(() => { if (document.activeElement && document.activeElement.tagName === 'IFRAME') { Picker.close(); Menu.close(); } }, 0));

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (dialogResolve) dialogResolve(null);
      else if (Menu.win) { const w = Menu.win; Menu.close(); w.labelEl.focus(); }
      else if (Picker.side) Picker.close();
      else if (HistorySheet.isOpen) HistorySheet.close();
      else if (Settings.isOpen) Settings.close();
    });

    $('#import-input').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importFile(f);
    });

    // Dropping a .21board file onto the board imports it.
    window.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      if (/\.21board$|\.json$/i.test(f.name)) importFile(f);
    });

    window.addEventListener('resize', () => { scheduleLayoutAll(); Picker.render(); });
    const onFs = () => Picker.renderControls();
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    mqDark.addEventListener && mqDark.addEventListener('change', () => applySettings());

    // Catch up on anything another tab changed while this one was hidden or frozen.
    const resync = () => { if (Inter.active) Inter.deferredReload = true; else reloadAll(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
    window.addEventListener('pageshow', e => { if (e.persisted) resync(); });
  }

  async function boot() {
    if (!LAB) Install.init(); // before anything async: Chrome can fire beforeinstallprompt early
    initUI();
    Sync.init();
    try {
      await Store.open();
    } catch (err) {
      if (LAB) Store.mem = MemDB;   // an AI tool's preview may block storage: keep this session's data in memory
      else {
        console.error('21Board: IndexedDB unavailable', err);
        Store.failed = true;
        toast('This browser is blocking storage, so nothing will be saved. Try a normal (not private) window.', { timeout: 10000 });
      }
    }
    await reloadAll();
    updateZoom();
    migrateBoard();
    if (!Known.has(Keys.board(S.boardId))) Writer.put(Keys.board(S.boardId), 'board', S.board);
    if (!LAB) ensureUid();
    applySettings();
    applyBoard();
    updateHint();
    if (LAB) { LabBridge.start(); return; }   // test mode: no offline cache, install, file opening or backup reminders
    registerSW();
    setupFileLaunch();
    Persist.init();
    Link.start();
    BoardHistory.start();
  }

  // Exposed for debugging in the console and for automated tests.
  window.__board21 = {
    version: BOARD_VERSION, state: S, store: Store, zoom: Zoom, inter: Inter, setBoardScale, setBoardShape, boundsRect,
    setRect: (ikey, rect) => { const i = S.insts.get(ikey); if (!i) return; saveInst(ikey, Object.assign({}, i, { rect })); const w = S.wins.get(ikey); if (w) w.layout(); },
    openWidget, closeWin, focusWin, resetWin, deleteInstance, setMaximized,
    buildExport, applyImport: (obj, mode) => applyImport(parseBoardFile(JSON.stringify(obj)), mode), reloadAll, rebuildAll,
    catalog: () => Array.from(catalog.values()), link: Link, history: BoardHistory, historySheet: HistorySheet, historyPlan
  };

  boot();
})();
