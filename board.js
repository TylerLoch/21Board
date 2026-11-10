/*
 * 21Board — board shell
 * =====================
 * The "operating system" that hosts sub-apps. Sections:
 *
 *   1. Constants, icons, helpers
 *   2. App catalog            (apps/registry.js + developer test apps)
 *   3. Storage                (IndexedDB: one object store of JSON records)
 *   4. Cross-tab sync         (BroadcastChannel, localStorage fallback)
 *   5. Board state + record application
 *   6. Geometry               (fitting, snapping/overlap resistance, placement)
 *   7. Windows                (Win class, SDK message handling)
 *   8. Window actions         (open / close / focus / maximize / reset / delete)
 *   9. Pointer interactions   (drag + resize, multi-touch aware)
 *  10. App Picker panel
 *  11. Window menu
 *  12. Settings
 *  13. Export / Import       (.21board files)
 *  14. Dialogs and toasts
 *  15. PWA                   (service worker, persistence, file launch)
 *  16. Boot
 *
 * Data format: docs/DATA-FORMAT.md     Sub-app SDK: docs/SUBAPP-SDK.md
 */
(() => {
  'use strict';

  // =====================================================================
  // 1. Constants, icons, helpers
  // =====================================================================
  const BOARD_VERSION = '1.0.0';
  const SDK_PROTOCOL = 1;
  const FORMAT_VERSION = 1;
  const DB_NAME = '21Board';
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
    scaleToScreen: true,     // zoom the whole layout to fit the screen (see Zoom in section 6)
    accent: 'blue',          // accent color: a key of ACCENTS
    dragFromContent: true,   // move windows by dragging inside them (see section 9a)
    devMode: false,
    devApps: [],             // [{ id, name, entry }] test sub-apps added in Developer mode
    activeBoard: 1,
    lastBackupAt: null       // when a full backup was last exported (ms), for backup reminders
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
  // The palette sub-apps receive (--b21-* variables), with the chosen accent applied.
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
    app: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    windows: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'
  };
  const svg = (name, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ''}</svg>`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = v => (v === undefined || v === null) ? null : JSON.parse(JSON.stringify(v));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const ikeyOf = (appId, n) => `${appId}:${n}`;
  const sameJSON = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const fmtBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`;

  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  // Sub-apps may supply SVG icons for their menu items. Keep only harmless SVG.
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
  // 2. App catalog
  // =====================================================================
  function normalizeApp(a, extra = {}) {
    if (!a || typeof a !== 'object' || !ID_RE.test(a.id || '') || typeof a.entry !== 'string') return null;
    const w = a.window || {};
    const pos = (v, d) => (typeof v === 'number' && v > 0 && isFinite(v)) ? v : d;
    return {
      id: a.id,
      name: String(a.name || a.id),
      description: String(a.description || ''),
      version: String(a.version || ''),
      entry: a.entry,
      files: Array.isArray(a.files) ? a.files : [a.entry],
      icon: typeof a.icon === 'string' && /^\s*<svg/i.test(a.icon) ? a.icon : `<svg viewBox="0 0 24 24">${ICONS.app}</svg>`,
      color: /^#[0-9a-f]{3,8}$/i.test(a.color || '') ? a.color : '#64748b',
      permissions: Array.isArray(a.permissions) ? a.permissions.filter(p => /^[a-z-]+$/.test(p)) : [],
      devOnly: !!a.devOnly,
      dev: !!extra.dev,
      win: {
        width: pos(w.width, 400), height: pos(w.height, 300),
        minWidth: pos(w.minWidth, 160), minHeight: pos(w.minHeight, 100),
        maxWidth: pos(w.maxWidth, Infinity), maxHeight: pos(w.maxHeight, Infinity),
        aspectRatio: pos(w.aspectRatio, null), resizable: w.resizable !== false,
        // true: click-only app, can be moved by dragging anywhere inside it.
        // false: the app needs drags itself (typing/selecting text, drawing): title bar or two fingers.
        dragFromContent: w.dragFromContent !== false
      }
    };
  }

  const REGISTRY = (self.BOARD21_APPS || []).map(a => normalizeApp(a)).filter(Boolean);
  let catalog = new Map(REGISTRY.map(a => [a.id, a]));

  function rebuildCatalog() {
    catalog = new Map(REGISTRY.map(a => [a.id, a]));
    for (const d of (S.settings.devApps || [])) {
      const app = normalizeApp({ id: d.id, name: d.name, entry: d.entry, color: '#64748b', description: 'Developer test app' }, { dev: true });
      if (app && !catalog.has(app.id)) catalog.set(app.id, app);
    }
  }
  const getApp = id => catalog.get(id) || null;
  const pickerApps = () => Array.from(catalog.values())
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
  //   inst:<b>:<appId>:<n>            window/instance n of an app (geometry, open/closed, z)
  //   data:<b>:<appId>:<n>            that instance's content   (Board21.save)
  //   conf:<b>:<appId>:<n>            that instance's config    (Board21.saveConfig)
  // =====================================================================
  const Keys = {
    settings: 'settings',
    board: b => `board:${b}`,
    inst: (b, ik) => `inst:${b}:${ik}`,
    data: (b, ik) => `data:${b}:${ik}`,
    conf: (b, ik) => `conf:${b}:${ik}`,
    parse(key) {
      const p = String(key).split(':');
      if (p[0] === 'settings') return { kind: 'settings' };
      if (p[0] === 'board' && p.length === 2) return { kind: 'board', board: +p[1] };
      if ((p[0] === 'inst' || p[0] === 'data' || p[0] === 'conf') && p.length === 4) {
        return { kind: p[0], board: +p[1], appId: p[2], n: +p[3], ikey: `${p[2]}:${p[3]}` };
      }
      return { kind: 'unknown' };
    }
  };

  const Store = {
    db: null,
    opening: null,
    failed: false,

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
                const rec = { key, type: op.type, rev: ((g.result && g.result.rev) || 0) + 1, updatedAt: Date.now(), by: TAB_ID, value: op.value };
                s.put(rec);
                out.push(rec);
              };
            }
            set(out);
          }) || [];
          for (const r of written) { if (r.deleted) Known.delete(r.key); else Known.set(r.key, r.rev); }
          if (written.length) Sync.announce(written.map(r => r.key));
          waiters.forEach(w => w.resolve(true));
        } catch (err) {
          console.error('21Board: save failed', err);
          toast('Could not save changes. Storage may be full or blocked.');
          waiters.forEach(w => w.reject(err));
        }
      }
      this.running = false;
    }
  };

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
        this.chan = new BroadcastChannel('21board-sync');
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
      if (msg.op === 'reload') { if (Inter.active) Inter.deferredRebuild = true; else rebuildAll(); return; }
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
    insts: new Map(),   // ikey -> { appId, n, open, rect:{x,y,w,h}, z, maximized, createdAt }
    data: new Map(),    // ikey -> content
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
    S.wins.clear(); S.insts.clear(); S.data.clear(); S.conf.clear(); Known.clear();
    S.focused = null;
    S.settings = Object.assign({}, DEFAULT_SETTINGS);
    S.board = defaultBoard(S.boardId);
    await reloadAll();
    updateZoom();
    ensureLayout();
    applySettings(); applyBoard();
  }

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
        applyBoard();
        break;
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
      appId: k ? k.appId : v.appId,
      n: k ? k.n : v.n,
      open: !!v.open,
      rect: { x: num(r.x, 40), y: num(r.y, 40), w: Math.max(80, num(r.w, 400)), h: Math.max(TITLE_H + 40, num(r.h, 340)) },
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
    const sig = JSON.stringify([S.settings.devMode, S.settings.devApps]);
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
  }

  function updateHint() {
    let open = 0;
    for (const w of S.wins.values()) if (w) open++;
    $('#empty-hint').hidden = open > 0;
  }

  // Create, update or remove the window for an instance so it matches S.insts.
  function reconcileWin(ikey) {
    const inst = S.insts.get(ikey);
    let w = S.wins.get(ikey);
    const app = inst && getApp(inst.appId);
    if (inst && inst.open && app) {
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
  // 6a. BOARD SCALING  (optional feature, kept in this one block)
  // ---------------------------------------------------------------------
  // The board scales like a picture to fit whatever screen it's on. Window rects are stored
  // in "layout space": CSS px on a board of size S.board.layout (the screen it was arranged
  // on). Every window is drawn at one zoom factor s, centered left-to-right, so the
  // arrangement is kept exactly. All other geometry works in layout space; only drawing
  // (Win.applyRect) and pointer movement (Inter.step) convert, via the Zoom numbers.
  //
  // CURRENTLY OFF BY DEFAULT (the team wasn't sold on it). To try it, open 21Board with
  //   ?scaling=on. To turn it on for everyone, make SCALING_FEATURE true (and bump sw.js VERSION).
  //   Off means: zoom fixed at 100% (Zoom is the identity), no Settings rows, no layout size
  //   written, and smaller screens push windows inside the edges, exactly like the build
  //   before scaling. Saved boards work either way (tested in both directions).
  // REMOVE IT entirely: delete this block, then
  //   - viewRect()        -> return { x: 0, y: 0, w: desk().clientWidth, h: desk().clientHeight }
  //   - toLayout(r)       -> return { x: r.left, y: r.top, w: r.width, h: r.height }
  //   - boundsRect()      -> viewRect();   screenPx(px) -> px
  //   - remove #layout-frame (index.html) and the --zi uses in the CSS (or leave them: --zi stays 1)
  //   - drop the Zoom.* terms in Win.applyRect and Inter (s = 1, ox = oy = 0)
  //   - drop updateZoom()/ensureLayout() calls, scalingSettingsRows()/scalingAct() in Settings,
  //     and use the screen size in exportViewport()/importPlan() (see their fallbacks).
  // See docs/DATA-FORMAT.md, "Layout space".
  const SCALING_FEATURE = /[?&]scaling=on(&|$)/.test(location.search); // off unless ?scaling=on
  const scalingOn = () => SCALING_FEATURE && S.settings.scaleToScreen !== false;
  const Zoom = { s: 1, ox: 0, oy: 0, vw: 0, vh: 0 };

  function validLayout(l) {
    return l && typeof l.w === 'number' && typeof l.h === 'number' && l.w >= 200 && l.h >= 150 && l.w < 20000 && l.h < 20000 ? { w: Math.round(l.w), h: Math.round(l.h) } : null;
  }

  function updateZoom() {
    const d = desk();
    Zoom.vw = d.clientWidth || window.innerWidth;
    Zoom.vh = d.clientHeight || window.innerHeight;
    const L = S.board.layout;
    if (!scalingOn() || !L) { Zoom.s = 1; Zoom.ox = 0; Zoom.oy = 0; }
    else {
      Zoom.s = Math.min(Zoom.vw / L.w, Zoom.vh / L.h);
      Zoom.ox = (Zoom.vw - L.w * Zoom.s) / 2; // center left/right; keep the top aligned
      Zoom.oy = 0;
    }
    // Keep resize handles and the focus ring touchable when zoomed out (CSS uses --zi).
    d.style.setProperty('--zi', String(Math.min(2.5, Math.max(1, 1 / Zoom.s))));
    // Lightly shade the screen outside the layout, so it's clear why windows stop at its edge.
    const fr = document.getElementById('layout-frame');
    if (fr) {
      const show = !!(scalingOn() && L && (Zoom.ox > 1 || L.h * Zoom.s < Zoom.vh - 1));
      fr.hidden = !show;
      if (show) {
        fr.style.width = L.w * Zoom.s + 'px'; fr.style.height = L.h * Zoom.s + 'px';
        fr.style.transform = `translate(${Zoom.ox}px, ${Zoom.oy}px)`;
      }
    }
  }

  // The visible screen expressed in layout space (may extend past the layout on one axis).
  const viewRect = () => {
    if (!Zoom.vw) updateZoom();
    return { x: -Zoom.ox / Zoom.s, y: -Zoom.oy / Zoom.s, w: Zoom.vw / Zoom.s, h: Zoom.vh / Zoom.s };
  };
  // Screen rect (e.g. getBoundingClientRect) -> layout space.
  const toLayout = r => ({ x: (r.left - Zoom.ox) / Zoom.s, y: (r.top - Zoom.oy) / Zoom.s, w: r.width / Zoom.s, h: r.height / Zoom.s });
  // Where windows may be put and are kept: the shared layout when scaling is on (so every screen
  // agrees and nothing lands in one screen's side margins), otherwise the screen.
  // viewRect() is only for drawing: maximized windows and the board-edge classes.
  // (Fallback without scaling: viewRect().)
  const boundsRect = () => {
    if (!Zoom.vw) updateZoom();
    const L = scalingOn() && S.board.layout;
    return L ? { x: 0, y: 0, w: L.w, h: L.h } : viewRect();
  };
  // A distance that should feel the same on screen at any zoom (snap reach, push-to-overlap), in layout px.
  // (Fallback without scaling: px.)
  const screenPx = px => px / Zoom.s;

  // Give a board without a layout size one: the current screen, or larger if its windows
  // already extend further (a board arranged on a bigger screen before scaling existed).
  // A board that has never had a window follows the screen, so its first window sets the size.
  function ensureLayout() {
    if (!SCALING_FEATURE) return;
    if (!Zoom.vw) updateZoom();
    const sw = Math.round(Zoom.vw), sh = Math.round(Zoom.vh), L = S.board.layout;
    const empty = S.insts.size === 0;
    if (L && !(empty && (L.w !== sw || L.h !== sh))) return;
    let w = sw, h = sh;
    for (const i of S.insts.values()) { w = Math.max(w, i.rect.x + i.rect.w + GAP); h = Math.max(h, i.rect.y + i.rect.h + GAP); }
    updateBoard({ layout: { w: Math.round(w), h: Math.round(h) } });
    updateZoom();
  }

  // Make the current screen the layout size, keeping every window where it appears now.
  function useScreenAsLayout() {
    if (!SCALING_FEATURE) return false;
    if (Inter.active) { toast('Finish moving windows first.'); return false; }
    updateZoom();
    const { s: z, ox, oy } = Zoom;
    const view = { x: 0, y: 0, w: Zoom.vw, h: Zoom.vh };
    const placed = [], placedFootprints = [];
    // Open windows first, back to front, so the front-most keeps its spot if anything must move.
    const order = Array.from(S.insts.entries()).sort((a, b) => (b[1].open - a[1].open) || (a[1].z - b[1].z));
    for (const [ikey, inst] of order) {
      const app = getApp(inst.appId);
      const w0 = S.wins.get(ikey);
      const c = w0 ? w0.constraints() : app ? constraintsFor(app) : null;
      const r = inst.rect;
      const fp = { x: ox + r.x * z, y: oy + r.y * z, w: r.w * z, h: r.h * z }; // where it is on screen now
      let w = fp.w, h = fp.h;
      if (c && c.ratio) { const ch = Math.max(1, Math.min(fp.h - TITLE_H, fp.w / c.ratio)); w = ch * c.ratio; h = ch + TITLE_H; }
      const size = c ? fitSize(w, h, c, view) : { w: Math.round(w), h: Math.round(h) };
      let rect = clampToView({ x: Math.round(fp.x), y: Math.round(fp.y), w: size.w, h: size.h }, view);
      if (inst.open && !inst.maximized) {
        // A window that had to grow (app minimum size) mustn't land on a neighbour it didn't touch before.
        if (!placedFootprints.some(o => overlaps(fp, o)) && placed.some(o => overlaps(rect, o))) {
          const spot = findFreeSpot(rect.w, rect.h, view, placed, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
          if (spot) rect = spot;
        }
        placed.push(rect); placedFootprints.push(fp);
      }
      saveInst(ikey, Object.assign({}, inst, { rect }));
    }
    updateBoard({ layout: { w: Math.round(Zoom.vw), h: Math.round(Zoom.vh) } });
    return true;
  }

  // Export: the size of the space the saved rects are in. (Fallback without scaling: the screen.)
  function exportViewport() {
    const L = S.board.layout;
    if (!L) return { width: Math.round(Zoom.vw || viewRect().w), height: Math.round(Zoom.vh || viewRect().h) };
    let w = L.w, h = L.h; // grown if any window was saved outside it (e.g. while scaling was off)
    for (const i of S.insts.values()) { w = Math.max(w, Math.ceil(i.rect.x + i.rect.w)); h = Math.max(h, Math.ceil(i.rect.y + i.rect.h)); }
    return { width: w, height: h };
  }

  // Import: how to map a file's rects into this board, and where to place them.
  //   Replace + scaling on -> adopt the file's layout (rects unchanged; the zoom fits it to this screen)
  //   otherwise            -> convert with one uniform factor into this board's layout (or this screen)
  // (Fallback without scaling: always convert into the screen, newLayout = current.)
  function importPlan(p, mode) {
    const F = validLayout(p.viewport);
    const on = scalingOn();
    const screen = { w: Math.round(Zoom.vw || viewRect().w), h: Math.round(Zoom.vh || viewRect().h) };
    let T, newLayout;
    if (mode === 'replace') {
      T = on && F ? F : screen;
      // With scaling off the rects land in screen space, so record that as the layout.
      newLayout = !SCALING_FEATURE ? S.board.layout : on ? (F || S.board.layout || screen) : screen;
    } else {
      T = on && S.board.layout ? S.board.layout : screen;
      newLayout = S.board.layout;
    }
    const k = F ? Math.min(T.w / F.w, T.h / F.h) : 1; // uniform, so shapes and spacing are kept
    const offX = F ? (T.w - F.w * k) / 2 : 0;
    const convert = r => (F && (Math.abs(k - 1) > 0.001 || offX)) ? {
      x: Math.round(r.x * k + offX), y: Math.round(r.y * k), w: Math.round(r.w * k), h: Math.round(r.h * k)
    } : Object.assign({}, r);
    // Where imported windows are placed: the target layout (scaling on) or the screen.
    const view = on && newLayout ? { x: 0, y: 0, w: newLayout.w, h: newLayout.h } : { x: 0, y: 0, w: screen.w, h: screen.h };
    return { convert, view, newLayout };
  }

  // Settings → Windows rows (none when the feature is switched off).
  function scalingSettingsRows(st, sw) {
    if (!SCALING_FEATURE) return '';
    let html = `<div class="row"><div><div class="lbl">Scale the board to fit the screen</div><div class="hint">${esc(zoomHint())}</div></div>${sw('scale', st.scaleToScreen !== false, 'Scale the board to fit the screen')}</div>`;
    const L = S.board.layout;
    if (scalingOn() && L && (L.w !== Math.round(Zoom.vw) || L.h !== Math.round(Zoom.vh))) {
      html += `<div class="row"><div><div class="lbl">Use this screen's size</div><div class="hint">Windows stay where they are now and become full size on this screen.</div></div><button class="btn" data-act="use-screen">Use this size</button></div>`;
    }
    return html;
  }
  function scalingAct(act) {
    if (act === 'scale') { updateSettings({ scaleToScreen: S.settings.scaleToScreen === false }); updateZoom(); }
    if (act === 'use-screen' && useScreenAsLayout()) { updateZoom(); toast('This screen is now the board’s layout size.'); }
  }
  function zoomHint() {
    if (!scalingOn()) return 'Off: windows keep their size; on a smaller screen they are moved inside the edges.';
    const L = S.board.layout;
    if (!L) return 'Windows keep their arrangement on any screen size.';
    const same = L.w === Math.round(Zoom.vw) && L.h === Math.round(Zoom.vh);
    return `Windows keep their arrangement on any screen size. Arranged for ${L.w} × ${L.h}` + (same ? ' (this screen).' : `; shown here at ${Math.round(Zoom.s * 100)}%.`);
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

  function defaultOuterSize(app) {
    const w = app.win.width;
    const h = app.win.aspectRatio ? w / app.win.aspectRatio : app.win.height;
    return { w: Math.round(w), h: Math.round(h + TITLE_H) };
  }

  // =====================================================================
  // 7. Windows
  // =====================================================================
  class Win {
    constructor(ikey) {
      this.ikey = ikey;
      this.app = getApp(this.inst.appId);
      this.rt = {};             // runtime constraint overrides set by the sub-app
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
      el.setAttribute('aria-label', this.app.name);
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
      f.title = this.app.name;
      f.setAttribute('sandbox', SANDBOX);
      f.setAttribute('allow', ['fullscreen', 'clipboard-read', 'clipboard-write', 'autoplay', ...this.app.permissions].join('; '));
      f.addEventListener('load', () => this.onFrameLoad());
      this.bodyEl.insertBefore(f, this.loadingEl);
      this.iframe = f;
      this.loadingEl.classList.remove('done');
      f.src = this.app.entry;
    }

    onFrameLoad() {
      this.loadingEl.classList.add('done');
      // Same-origin: catch taps inside the app even if it doesn't use the SDK.
      try {
        this.iframe.contentWindow.addEventListener('pointerdown', () => { focusWin(this.ikey); closePopups(); }, true);
      } catch (e) { /* cross-origin: the SDK's 'activate' message covers this */ }
      attachContentDrag(this);
    }

    reload() {
      this.rt = {}; this.menuItems = []; this.subtitle = ''; this.connected = false; this.lastInfo = '';
      if (Menu.win === this) Menu.close();
      this.renderTitle();
      this.createFrame();
      this.layout();
    }

    destroy() {
      if (this.iframe) this.iframe.src = 'about:blank';
      this.el.remove();
    }

    renderTitle() {
      $('.name', this.labelEl).textContent = this.app.name;
      $('.num', this.labelEl).textContent = this.inst && this.inst.n > 1 ? String(this.inst.n) : '';
      $('.sub', this.labelEl).textContent = this.subtitle;
      this.labelEl.setAttribute('aria-label', `${this.app.name}${this.inst && this.inst.n > 1 ? ' ' + this.inst.n : ''} window menu`);
    }

    // One finger / mouse anywhere inside: only for click-only apps (registry or SDK), never when maximized.
    canDragFromContent() {
      if (S.settings.dragFromContent === false || !this.inst || this.inst.maximized) return false;
      return this.rt.dragFromContent !== undefined ? this.rt.dragFromContent : this.app.win.dragFromContent;
    }

    constraints() {
      const w = this.app.win, rt = this.rt;
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
      try { this.iframe.contentWindow.postMessage(Object.assign({ b21: SDK_PROTOCOL, type }, payload || {}), ORIGIN); } catch (e) { /* frame gone */ }
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

    // ---- SDK messages from the sub-app
    handle(m) {
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
              appId: this.app.id, appName: this.app.name, appVersion: this.app.version, instance: inst.n,
              data: clone(S.data.get(this.ikey)), config: clone(S.conf.get(this.ikey)),
              theme, palette: paletteFor(theme), window: this.info(),
              locale: navigator.language || 'en-US', devMode: !!S.settings.devMode
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
          this.menuItems = (Array.isArray(m.items) ? m.items : []).slice(0, 20).map(i => ({
            id: String(i.id || '').slice(0, 64), label: String(i.label || '').slice(0, 80), icon: safeSVG(i.icon),
            checked: typeof i.checked === 'boolean' ? i.checked : undefined, disabled: !!i.disabled, separator: !!i.separator
          }));
          if (Menu.win === this) Menu.render();
          break;
        case 'toast': toast(String(m.text || '').slice(0, 200)); break;
      }
    }

    saveContent(kind, value, reqId) {
      const map = kind === 'data' ? S.data : S.conf;
      const key = (kind === 'data' ? Keys.data : Keys.conf)(S.boardId, this.ikey);
      let v;
      try { v = clone(value); } catch (err) { this.ack(reqId, false, null, 'Value is not JSON-serializable'); return; }
      const has = map.has(this.ikey);
      if (sameJSON(has ? map.get(this.ikey) : null, v) && (v === null || Known.has(key))) { this.ack(reqId, true); return; }
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
      const inst = this.inst;
      const s = fitSize(inst.rect.w, inst.rect.h, this.constraints(), null);
      if (s.w !== Math.round(inst.rect.w) || s.h !== Math.round(inst.rect.h)) {
        const cx = inst.rect.x + inst.rect.w / 2;
        saveInst(this.ikey, Object.assign({}, inst, { rect: { x: Math.round(cx - s.w / 2), y: inst.rect.y, w: s.w, h: s.h } }));
        this.layout(true);
      } else this.layout();
    }
  }

  // Messages from sub-app iframes.
  window.addEventListener('message', e => {
    const m = e.data;
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

  // Open an app: reopen its lowest-numbered closed instance (restoring its data),
  // or create the next instance number if every existing one is already open.
  function openApp(appId, opts = {}) {
    const app = getApp(appId);
    if (!app) return null;
    if (S.insts.size === 0) ensureLayout(); // a never-used board takes this screen's size
    const mine = Array.from(S.insts.values()).filter(i => i.appId === appId).sort((a, b) => a.n - b.n);
    const closed = mine.find(i => !i.open);
    let ikey, inst;
    if (closed) {
      ikey = ikeyOf(appId, closed.n);
      const view = boundsRect();
      let rect = fitRect(closed.rect, constraintsFor(app), view);
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
      ikey = ikeyOf(appId, n);
      const rect = placeNew(defaultOuterSize(app), constraintsFor(app), opts.side);
      inst = { appId, n, open: true, rect, z: maxZ() + 1, maximized: false, createdAt: Date.now() };
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

  function constraintsFor(app) {
    const w = app.win;
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
        const app = getApp(inst.appId);
        toast(`${app ? app.name : 'App'} closed. Its content is saved — open it again from the App Picker.`);
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

  async function resetWin(ikey) {
    const inst = S.insts.get(ikey);
    if (!inst) return;
    const app = getApp(inst.appId);
    const b = S.boardId;
    S.data.delete(ikey); S.conf.delete(ikey);
    const def = app ? defaultOuterSize(app) : { w: inst.rect.w, h: inst.rect.h };
    const rect = Object.assign({}, inst.rect, { w: def.w, h: def.h });
    await Promise.all([Writer.del(Keys.data(b, ikey)), Writer.del(Keys.conf(b, ikey)), saveInst(ikey, Object.assign({}, inst, { rect, maximized: false }))]);
    Sync.announce([], { op: 'reset', board: b, ikey });
    const w = S.wins.get(ikey);
    if (w) w.reload();
  }

  async function deleteInstance(ikey) {
    const b = S.boardId;
    const w = S.wins.get(ikey);
    if (w) { if (Menu.win === w) Menu.close(); w.destroy(); S.wins.delete(ikey); }
    S.insts.delete(ikey); S.data.delete(ikey); S.conf.delete(ikey);
    await Promise.all([Writer.del(Keys.inst(b, ikey)), Writer.del(Keys.data(b, ikey)), Writer.del(Keys.conf(b, ikey))]);
    afterBulkApply();
  }

  async function closeAll() {
    const open = Array.from(S.insts.entries()).filter(([, i]) => i.open).map(([k]) => k);
    await Promise.all(open.map(k => closeWin(k, { quiet: true })));
    if (open.length) toast(`Closed ${open.length} window${open.length === 1 ? '' : 's'}. Their content is saved.`);
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

    // Drags that start inside an app (section 9a). `key` is the pointerId, or a string for two-finger drags.
    beginAt(key, win, x, y) {
      if (this.holds(win)) return false;
      this.map.set(key, {
        id: key, win, kind: 'content', handle: null, el: null,
        sx: x, sy: y, x, y,
        lx0: (x - Zoom.ox) / Zoom.s, ly0: (y - Zoom.oy) / Zoom.s,
        layoutSig: JSON.stringify(S.board.layout),
        start: Object.assign({}, win.disp), moved: false, result: null, onLabel: false
      });
      return true;
    },
    moveTo(key, x, y) { this.move({ pointerId: key, clientX: x, clientY: y }); const it = this.map.get(key); return !!(it && it.moved); },
    endFor(key, cancelled) { const it = this.map.get(key); const moved = !!(it && it.moved); this.end({ pointerId: key }, cancelled); return moved; },
    drop(key) { const it = this.map.get(key); if (it && !it.moved) this.map.delete(key); },

    begin(e, win, kind, handle, el) {
      for (const it of this.map.values()) if (it.win === win) return;
      const it = {
        id: e.pointerId, win, kind, handle, el,
        sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
        lx0: (e.clientX - Zoom.ox) / Zoom.s, ly0: (e.clientY - Zoom.oy) / Zoom.s, // grab point in layout space
        layoutSig: JSON.stringify(S.board.layout),
        start: Object.assign({}, win.disp), moved: false, result: null,
        onLabel: !!(e.target.closest && e.target.closest('.win-label'))
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
      const layoutChanged = it.layoutSig !== JSON.stringify(S.board.layout);
      if (it.moved && it.result && !cancelled && win.inst && !layoutChanged) {
        const r = it.result, q = v => Math.round(v * 100) / 100; // sub-pixel, so zoomed drags don't drift
        saveInst(win.ikey, Object.assign({}, win.inst, { rect: { x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h) }, maximized: false }));
        win.layout();
      } else if (it.moved) {
        win.layout();
      } else if (it.kind === 'title' && !cancelled) {
        if (it.onLabel) Menu.toggle(win);
        else {
          const now = Date.now();
          if (now - win.lastTitleTap < 350) { win.lastTitleTap = 0; setMaximized(win.ikey, !win.inst.maximized); }
          else win.lastTitleTap = now;
        }
      }
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
  // - Click-only apps (registry window.dragFromContent, default true): drag
  //   anywhere inside the window with one finger or the mouse. A tap is still
  //   a tap; a press that turns into a drag moves the window and the click is
  //   swallowed, so a button you started on doesn't fire.
  // - Every app: two fingers anywhere inside move the window (for apps that
  //   need drags themselves: typing/selecting text, drawing).
  // - Never started from: text fields, sliders, selects, canvas/video, editable
  //   or explicitly selectable text, scrolling areas, draggable elements,
  //   anything inside [data-b21-nodrag], or a press the app already handled
  //   (preventDefault on pointerdown).
  // Sub-apps are same-origin, so the board listens inside each iframe; nothing
  // here is needed from the app. Settings → Windows can switch it off.
  // =====================================================================
  function noContentDrag(el, cw) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const tag = n.tagName;
      if (n.hasAttribute('data-b21-nodrag') || n.isContentEditable || n.getAttribute('draggable') === 'true') return true;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'IFRAME') return true;
      if (tag === 'INPUT' && !/^(button|submit|reset|checkbox|radio|color|file|image)$/i.test(n.type || '')) return true;
      const cs = cw.getComputedStyle(n);
      if (cs.userSelect === 'text' || cs.webkitUserSelect === 'text') return true;
      if ((/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) ||
          (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1)) return true;
    }
    return false;
  }

  function attachContentDrag(win) {
    let cw;
    try { cw = win.iframe.contentWindow; if (!cw || !cw.document) return; } catch (e) { return; } // cross-origin: title bar only
    const frame = win.iframe;
    // App point -> board point. Read fresh every time, because the window moves under the finger.
    const toBoard = (x, y) => {
      const r = frame.getBoundingClientRect();
      const k = frame.clientWidth ? r.width / frame.clientWidth : 1;
      return { x: r.left + x * k, y: r.top + y * k };
    };
    const enabled = () => S.settings.dragFromContent !== false;
    const singles = new Set();       // pointerIds with a one-finger/mouse drag (pending or moving)
    const touches = new Map();       // touch pointerId -> app point
    let two = null;                  // { key, ids }
    let swallowClickUntil = 0;
    const centroid = () => {
      const [a, b] = two.ids.map(id => touches.get(id));
      return toBoard((a.x + b.x) / 2, (a.y + b.y) / 2);
    };

    cw.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!enabled()) return;
      // Second finger down: two-finger drag (any app), unless a one-finger drag is already moving it.
      if (e.pointerType === 'touch' && touches.size === 2 && !two) {
        const ids = Array.from(touches.keys());
        const moving = ids.some(id => singles.has(id) && Inter.map.get(id) && Inter.map.get(id).moved);
        if (!moving) {
          ids.forEach(id => { if (singles.has(id)) { Inter.drop(id); singles.delete(id); } });
          const key = 'two:' + win.ikey;
          two = { key, ids };
          const c = centroid();
          if (!Inter.beginAt(key, win, c.x, c.y)) two = null;
        }
        return;
      }
      if (two || !win.canDragFromContent()) return;
      if (e.defaultPrevented || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (noContentDrag(e.target, cw)) return;
      const p = toBoard(e.clientX, e.clientY);
      if (Inter.beginAt(e.pointerId, win, p.x, p.y)) singles.add(e.pointerId);
    }); // bubble phase: runs after the app's own handlers, so e.defaultPrevented is meaningful

    cw.addEventListener('pointermove', e => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (two && two.ids.includes(e.pointerId)) { const c = centroid(); Inter.moveTo(two.key, c.x, c.y); return; }
      if (!singles.has(e.pointerId)) return;
      const it = Inter.map.get(e.pointerId);
      if (!it) { singles.delete(e.pointerId); return; }
      const was = it.moved;
      const p = toBoard(e.clientX, e.clientY);
      if (Inter.moveTo(e.pointerId, p.x, p.y) && !was) {
        try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        try { cw.getSelection().removeAllRanges(); } catch (err) { /* ignore */ }
      }
    }, true);

    const finish = e => {
      touches.delete(e.pointerId);
      const cancelled = e.type === 'pointercancel';
      if (two && two.ids.includes(e.pointerId)) {
        if (Inter.endFor(two.key, cancelled)) swallowClickUntil = Date.now() + 500;
        two = null;
        return;
      }
      if (!singles.has(e.pointerId)) return;
      singles.delete(e.pointerId);
      if (Inter.endFor(e.pointerId, cancelled)) swallowClickUntil = Date.now() + 500;
    };
    cw.addEventListener('pointerup', finish, true);
    cw.addEventListener('pointercancel', finish, true);

    // A press that became a window drag must not also click whatever it started on.
    cw.addEventListener('click', e => {
      if (Date.now() < swallowClickUntil) { swallowClickUntil = 0; e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    // While a finger is dragging a window, stop the browser scrolling/panning (which would cancel it).
    cw.addEventListener('touchmove', e => {
      if (two || (e.touches.length === 1 && singles.size)) { if (e.cancelable) e.preventDefault(); }
    }, { passive: false, capture: true });
    // No native image/link drag-and-drop while moving a window with the mouse.
    cw.addEventListener('dragstart', e => { if (singles.size) e.preventDefault(); }, true);
  }

  // Tapping the empty board deselects every window, hiding all resize grips.
  function deselectAll() {
    if (S.deselected && S.focused === null) return;
    for (const it of Inter.map.values()) if (it.win.ikey === S.focused) return; // still being moved/resized
    S.deselected = true;
    updateFocus();
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
      if (Menu.win) Menu.close();
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
  // 10. App Picker panel
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
      $('.panel-apps', this.el).addEventListener('click', e => {
        const t = e.target.closest('[data-app]');
        if (!t) return;
        const side = this.side;
        this.close();
        openApp(t.dataset.app, { side });
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
      for (const inst of S.insts.values()) if (inst.open) counts.set(inst.appId, (counts.get(inst.appId) || 0) + 1);
      const apps = pickerApps();
      const cols = window.innerWidth < 440 ? 3 : 4;
      this.el.style.setProperty('--cols', String(cols));
      $('.panel-apps', this.el).innerHTML = apps.map(a => {
        const c = counts.get(a.id) || 0;
        return `<button class="app-tile" role="listitem" data-app="${esc(a.id)}" title="${esc(a.description || a.name)}">` +
          `<span class="app-icon" style="--c:${esc(a.color)}">${a.icon}</span><span>${esc(a.name)}</span>` +
          (c ? `<span class="badge" aria-label="${c} open">${c}</span>` : '') +
          (a.dev || a.devOnly ? '<span class="devtag">DEV</span>' : '') + '</button>';
      }).join('') || '<div class="empty-note" style="grid-column:1/-1;padding:16px">No apps installed.</div>';
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
        const name = `${w.app.name}${w.inst.n > 1 ? ' ' + w.inst.n : ''}`;
        this.el.innerHTML = `<div class="menu-confirm"><b>Reset ${esc(name)}?</b><br>This clears everything saved in this window and returns it to its starting size.</div>` +
          item('reset-yes', svg('reset'), 'Reset', '', 'danger') + item('reset-no', '', 'Cancel');
        return;
      }
      let html = '';
      for (const i of w.menuItems) {
        if (i.separator) { html += '<div class="menu-sep"></div>'; continue; }
        const check = i.checked === true ? svg('check', 'check') : '';
        html += `<button class="menu-item" role="${i.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}" ${i.checked !== undefined ? `aria-checked="${i.checked}"` : ''} data-act="app" data-id="${esc(i.id)}" ${i.disabled ? 'disabled' : ''}>` +
          `<span class="icon-slot">${i.icon || ''}</span><span class="label">${esc(i.label)}</span>${check}</button>`;
      }
      if (html) html += '<div class="menu-sep"></div>';
      html += w.inst.maximized ? item('restore', svg('restore'), 'Restore size') : item('maximize', svg('maximize'), 'Fill the board');
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
      const size = () => ({ width: this.el.offsetWidth, height: this.el.offsetHeight });
      // A menu taller than the whole screen gets tighter rows first (it should never need scrolling).
      this.el.classList.remove('compact', 'tight');
      this.el.style.maxHeight = 'none';
      let m = size();
      if (m.height > vh - 2 * M) { this.el.classList.add('compact'); m = size(); }
      if (m.height > vh - 2 * M) { this.el.classList.add('tight'); m = size(); }
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
      this.el.style.left = Math.round(x) + 'px';
      this.el.style.top = Math.round(y) + 'px';
    },

    act(act, id) {
      const w = this.win;
      if (!w) return;
      switch (act) {
        case 'app': w.post('menu', { id }); this.close(); break;
        case 'maximize': this.close(); setMaximized(w.ikey, true); break;
        case 'restore': this.close(); setMaximized(w.ikey, false); break;
        case 'reset': this.confirming = true; this.render(); this.position(); break;
        case 'reset-yes': this.close(); resetWin(w.ikey); break;
        case 'reset-no': this.confirming = false; this.render(); this.position(); break;
        case 'close': this.close(); closeWin(w.ikey); break;
      }
    }
  };

  // =====================================================================
  // 12. Settings
  // =====================================================================
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
        if (e.target.id === 'set-board-name') {
          const name = e.target.value.trim().slice(0, 60) || 'My Board';
          updateBoard({ name });
        }
      });
      this.body.addEventListener('input', e => {
        if (e.target.id === 'set-bg-custom') updateBoard({ background: Object.assign({}, S.board.background, { color: e.target.value }) });
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

      const insts = Array.from(S.insts.entries()).sort((a, b) => {
        const an = (getApp(a[1].appId) || { name: a[1].appId }).name, bn = (getApp(b[1].appId) || { name: b[1].appId }).name;
        return an.localeCompare(bn) || a[1].n - b[1].n;
      });
      const instHTML = insts.length ? insts.map(([ikey, i]) => {
        const app = getApp(i.appId);
        const size = JSON.stringify(S.data.get(ikey) || '').length + JSON.stringify(S.conf.get(ikey) || '').length;
        const name = `${app ? app.name : i.appId}${i.n > 1 || !app ? ' ' + i.n : ''}`;
        const status = !app ? 'App not installed' : i.open ? 'Open' : 'Closed';
        return `<div class="inst"><span class="app-icon" style="--c:${esc(app ? app.color : '#9ca3af')}">${app ? app.icon : svg('app')}</span>` +
          `<div class="meta"><b>${esc(name)}</b><span>${status} · ${fmtBytes(size)} saved</span></div>` +
          (app && !i.open ? `<button class="icon" data-act="inst-open" data-val="${esc(ikey)}" title="Open" aria-label="Open ${esc(name)}">${svg('open')}</button>` : '') +
          `<button class="icon" data-act="inst-delete" data-val="${esc(ikey)}" title="Delete" aria-label="Delete ${esc(name)} and its content">${svg('trash')}</button></div>`;
      }).join('') : '<div class="empty-note">No app windows yet. Open one from the App Picker.</div>';

      const devApps = (st.devApps || []).map(d =>
        `<div class="inst"><span class="app-icon" style="--c:#64748b">${svg('app')}</span><div class="meta"><b>${esc(d.name)}</b><span>${esc(d.entry)}</span></div>` +
        `<button class="icon" data-act="dev-remove" data-val="${esc(d.id)}" title="Remove" aria-label="Remove ${esc(d.name)}">${svg('trash')}</button></div>`).join('');

      this.body.innerHTML = `
        <h3>Appearance</h3>
        <div class="row"><div class="lbl">Theme</div>${seg('theme', st.theme, [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']])}</div>
        <div class="row stack"><div><div class="lbl">Accent color</div><div class="hint">Buttons, the selected-window outline and highlights, in 21Board and its apps.</div></div>
          <div class="swatches">${Object.entries(ACCENTS).map(([k, a]) => `<button class="swatch${(st.accent || 'blue') === k ? ' on' : ''}" style="background:${resolvedTheme() === 'dark' ? a[1] : a[0]}" data-act="accent" data-val="${k}" title="${a[2]}" aria-label="${a[2]} accent"></button>`).join('')}</div></div>
        <div class="row stack"><div class="lbl">Board background</div>
          <div class="swatches">
            <button class="swatch auto${!bg.color ? ' on' : ''}" data-act="bg" data-val="" title="Match theme" aria-label="Match theme"></button>
            ${BG_SWATCHES.map(([c, n]) => `<button class="swatch${bg.color === c ? ' on' : ''}" style="background:${c}" data-act="bg" data-val="${c}" title="${n}" aria-label="${n}"></button>`).join('')}
            <label class="swatch custom${isCustom ? ' on' : ''}" title="Custom color"><input type="color" id="set-bg-custom" value="${esc(isCustom ? bg.color : '#88aacc')}" aria-label="Custom background color"></label>
          </div>
        </div>
        <div class="row"><div class="lbl">Pattern</div>${seg('pattern', bg.pattern || 'none', [['none', 'None'], ['dots', 'Dots'], ['grid', 'Grid'], ['lines', 'Lines']])}</div>

        <h3>Windows</h3>
        <div class="row"><div><div class="lbl">Snap and avoid overlap</div><div class="hint">Windows stop at each other's edges. Keep pushing to overlap anyway.</div></div>${sw('snapping', st.snapping, 'Snap and avoid overlap')}</div>
        <div class="row"><div><div class="lbl">Drag windows from inside</div><div class="hint">Apps without typing move by dragging anywhere in them; any app moves with two fingers. Off: title bar only.</div></div>${sw('dragcontent', st.dragFromContent !== false, 'Drag windows from inside')}</div>
        <div class="row"><div class="lbl">Push needed to overlap</div>${seg('resistance', st.resistance, [['gentle', 'Light'], ['normal', 'Medium'], ['strong', 'Firm']], !st.snapping)}</div>
        ${scalingSettingsRows(st, sw)}
        <div class="row"><div><div class="lbl">Close all windows</div><div class="hint">Content stays saved for next time.</div></div><button class="btn" data-act="close-all">${svg('windows')}Close all</button></div>

        <h3>App Picker</h3>
        <div class="row"><div class="lbl">Show controls in</div>${seg('corners', st.pickerCorners, [['both', 'Both corners'], ['left', 'Left'], ['right', 'Right']])}</div>

        <h3>Board</h3>
        <div class="row stack"><label class="lbl" for="set-board-name">Board name <span class="hint">(used for export file names)</span></label>
          <input type="text" class="text-input" id="set-board-name" maxlength="60" value="${esc(S.board.name)}" autocomplete="off"></div>
        <div class="row stack"><div><div class="lbl">Saved app windows</div><div class="hint">Closing a window keeps its content. Delete it here to remove it for good.</div></div>
          <div class="inst-list">${instHTML}</div></div>

        <h3>Storage &amp; offline</h3>
        <div class="row"><div class="lbl">Offline</div><div class="hint" id="st-offline" style="text-align:right">Checking…</div></div>
        <div class="row"><div><div class="lbl">Data protection</div><div class="hint" id="st-persist-hint"></div></div><div id="st-persist" style="flex:0 0 auto"></div></div>
        <div class="row"><div><div class="lbl">Backups</div><div class="hint" id="st-backup">${esc(backupAgo())}</div></div><button class="btn small" data-act="backup">${svg('export')}Back up now</button></div>
        <div class="row"><div class="lbl">Storage used</div><div class="hint" id="st-storage" style="text-align:right">Checking…</div></div>

        <h3>Advanced</h3>
        <div class="row"><div><div class="lbl">Developer mode</div><div class="hint">Shows developer tools and lets you test a sub-app by its path.</div></div>${sw('devmode', st.devMode, 'Developer mode')}</div>
        ${st.devMode ? `<div class="row stack"><div class="lbl">Test a sub-app</div>
          <div style="display:flex;gap:8px"><input type="text" class="text-input" id="set-dev-path" placeholder="apps/my-app/index.html" autocomplete="off" spellcheck="false"><button class="btn primary" data-act="dev-add">${svg('plus')}Add</button></div>
          ${devApps ? `<div class="inst-list">${devApps}</div>` : ''}</div>` : ''}
        <div class="row"><div><div class="lbl">Erase everything</div><div class="hint">Deletes all windows, content and settings on this device.</div></div><button class="btn danger" data-act="erase">${svg('trash')}Erase</button></div>

        <h3>About</h3>
        <div class="about">21Board ${BOARD_VERSION} · Sub-app SDK protocol ${SDK_PROTOCOL}<span id="st-cache"></span><br>
        Everything you make is stored only on this device. Nothing is sent to a server.</div>`;
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
        case 'scale': case 'use-screen': scalingAct(act); this.render(); break;
        case 'resistance': updateSettings({ resistance: val }); break;
        case 'corners': updateSettings({ pickerCorners: val }); if (val !== 'both' && val !== this.side) this.open(val); break;
        case 'devmode': updateSettings({ devMode: !S.settings.devMode }); break;
        case 'bg': updateBoard({ background: Object.assign({}, S.board.background, { color: val || null }) }); this.render(); break;
        case 'pattern': updateBoard({ background: Object.assign({}, S.board.background, { pattern: val }) }); this.render(); break;
        case 'close-all': await closeAll(); this.render(); break;
        case 'inst-open': { const i = S.insts.get(val); if (i) openSpecific(val); this.render(); break; }
        case 'inst-delete': {
          const i = S.insts.get(val);
          if (!i) break;
          const app = getApp(i.appId);
          const name = `${app ? app.name : i.appId}${i.n > 1 || !app ? ' ' + i.n : ''}`;
          const ok = await dialog({ title: `Delete ${name}?`, message: 'Its window and everything saved in it will be removed from this device. This can’t be undone.', actions: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
          if (ok) { await deleteInstance(val); this.render(); }
          break;
        }
        case 'install': await Install.run(); this.refreshStatus(); break;
        case 'backup': await doExport('full'); this.refreshStatus(); break;
        case 'update': applyUpdate(); break;
        case 'dev-add': {
          const input = $('#set-dev-path', this.body);
          const path = (input && input.value || '').trim();
          if (!path) break;
          let url;
          try { url = new URL(path, location.href); } catch (e) { toast('That path is not valid.'); break; }
          if (url.origin !== location.origin) { toast('Sub-apps must be served from this same site.'); break; }
          const rel = url.pathname.replace(new RegExp('^' + location.pathname.replace(/[^/]*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '') + url.search;
          const slug = rel.replace(/\/?index\.html$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'app';
          const id = 'dev-' + slug;
          const name = (slug.split('-').filter(p => p && p !== 'apps').pop() || 'Test app').replace(/^./, c => c.toUpperCase()) + ' (test)';
          const list = (S.settings.devApps || []).filter(d => d.id !== id).concat([{ id, name, entry: rel }]);
          updateSettings({ devApps: list });
          openApp(id, { side: this.side });
          break;
        }
        case 'dev-remove': updateSettings({ devApps: (S.settings.devApps || []).filter(d => d.id !== val) }); break;
        case 'erase': {
          const ok = await dialog({ title: 'Erase everything?', message: 'All windows, their content, and your settings will be deleted from this device. Export a backup first if you might want them later.', actions: [{ label: 'Export a backup first', value: 'backup', kind: 'primary' }, { label: 'Erase everything', value: 'erase', kind: 'danger' }, { label: 'Cancel', value: null }] });
          if (ok === 'backup') { await doExport('full'); break; }
          if (ok !== 'erase') break;
          await Store.tx('readwrite', s => { s.clear(); });
          Sync.announce([], { op: 'reload' });
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
    const app = getApp(inst.appId);
    if (!app) return;
    const view = boundsRect();
    let rect = fitRect(inst.rect, constraintsFor(app), view);
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
        { label: 'Blank template', sub: 'Window layout and app settings only — no content', value: 'template', choice: true },
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
      const [appId, nStr] = ik.split(':');
      const inst = parts.inst ? normalizeInst(parts.inst, { appId, n: +nStr }) : normalizeInst({ open: false }, { appId, n: +nStr });
      if (kind === 'template' && !inst.open) continue;
      instances.push({
        appId, instance: +nStr, open: inst.open, maximized: inst.maximized, z: inst.z,
        rect: inst.rect,
        config: parts.conf === undefined ? null : parts.conf,
        data: kind === 'full' && parts.data !== undefined ? parts.data : null
      });
    }
    instances.sort((a, b2) => a.appId.localeCompare(b2.appId) || a.instance - b2.instance);
    return {
      format: '21board',
      formatVersion: FORMAT_VERSION,
      kind,
      exportedAt: new Date().toISOString(),
      generator: `21Board ${BOARD_VERSION}`,
      viewport: exportViewport(), // the size of the space the rects are in
      theme: S.settings.theme,
      accent: S.settings.accent,
      board: { name: S.board.name, background: S.board.background },
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
      if (!i || !ID_RE.test(i.appId || '') || !Number.isInteger(i.instance) || i.instance < 1) return false;
      const k = ikeyOf(i.appId, i.instance);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map(i => ({
      appId: i.appId, n: i.instance, open: !!i.open, maximized: !!i.maximized, z: num(i.z, 1),
      rect: normalizeInst({ rect: i.rect }, { appId: i.appId, n: i.instance }).rect,
      config: i.config === undefined ? null : i.config,
      data: i.data === undefined ? null : i.data
    }));
    const bg = j.board && j.board.background || {};
    return {
      kind: j.kind === 'template' ? 'template' : 'full',
      theme: ['light', 'dark', 'system'].includes(j.theme) ? j.theme : null,
      accent: accentOf(j.accent) ? j.accent : null,
      board: {
        name: j.board && typeof j.board.name === 'string' ? j.board.name.slice(0, 60) : null,
        background: { color: /^#[0-9a-f]{6}$/i.test(bg.color || '') ? bg.color : null, pattern: ['none', 'dots', 'grid', 'lines'].includes(bg.pattern) ? bg.pattern : 'none' }
      },
      viewport: j.viewport && j.viewport.width > 0 && j.viewport.height > 0 ? { w: j.viewport.width, h: j.viewport.height } : null,
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
    const missing = new Set(parsed.instances.filter(i => !getApp(i.appId)).map(i => i.appId));
    const what = parsed.kind === 'template' ? 'a blank template' : 'a full backup';
    const mode = await dialog({
      title: `Import “${file.name.replace(/\.21board$/i, '')}”?`,
      message: `This is ${what} with ${openCount} window${openCount === 1 ? '' : 's'}.` + (missing.size ? ` ${missing.size} app${missing.size === 1 ? ' is' : 's are'} not installed here; ${missing.size === 1 ? 'its' : 'their'} content will be kept but not shown.` : ''),
      actions: [
        { label: 'Replace my board', sub: 'Your current windows and content are removed', value: 'replace', kind: 'danger', choice: true },
        { label: 'Add to my board', sub: 'Keep what’s here and add these windows', value: 'add', kind: 'primary', choice: true },
        { label: 'Cancel', value: null }
      ]
    });
    if (!mode) return;
    try {
      await applyImport(parsed, mode);
      toast(mode === 'replace' ? 'Board imported.' : `Added ${openCount} window${openCount === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error(err);
      toast('Import failed: ' + (err.message || err));
    }
  }

  async function applyImport(p, mode) {
    const b = S.boardId;
    const { convert, view, newLayout } = importPlan(p, mode); // board scaling decides how rects map
    const rev = Date.now();
    const rec = (key, type, value) => ({ key, type, rev, updatedAt: rev, by: TAB_ID, value });

    const used = new Map(); // appId -> Set of instance numbers
    if (mode === 'add') for (const i of S.insts.values()) { if (!used.has(i.appId)) used.set(i.appId, new Set()); used.get(i.appId).add(i.n); }
    const zBase = mode === 'add' ? maxZ() : 0;
    const placed = mode === 'add' ? obstacles(null) : [];
    const out = [];

    for (const i of p.instances.slice().sort((a, b2) => a.z - b2.z)) {
      let n = i.n;
      if (mode === 'add') {
        const set = used.get(i.appId) || new Set();
        n = 1; while (set.has(n)) n++;
        set.add(n); used.set(i.appId, set);
      }
      let rect = convert(i.rect);
      const app = getApp(i.appId);
      if (app) rect = fitRect(rect, constraintsFor(app), view);
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
      const ik = ikeyOf(i.appId, n);
      out.push(rec(Keys.inst(b, ik), 'inst', { appId: i.appId, n, open: i.open, rect, z: zBase + i.z, maximized: i.maximized, createdAt: rev }));
      if (i.config !== null) out.push(rec(Keys.conf(b, ik), 'conf', i.config));
      if (i.data !== null && p.kind === 'full') out.push(rec(Keys.data(b, ik), 'data', i.data));
    }
    if (mode === 'replace') {
      const board = Object.assign({}, S.board, { background: p.board.background, layout: newLayout });
      if (p.board.name) board.name = p.board.name;
      out.push(rec(Keys.board(b), 'board', board));
      if (p.theme || p.accent) out.push(rec(Keys.settings, 'settings', Object.assign({}, S.settings, p.theme ? { theme: p.theme } : {}, p.accent ? { accent: p.accent } : {})));
    }

    await Store.tx('readwrite', s => {
      if (mode === 'replace') {
        for (const kind of ['inst', 'data', 'conf']) s.delete(IDBKeyRange.bound(`${kind}:${b}:`, `${kind}:${b}:￿`));
      }
      for (const r of out) s.put(r);
    });
    Sync.announce([], { op: 'reload' });
    await rebuildAll();
  }

  // =====================================================================
  // 14. Dialogs and toasts
  // =====================================================================
  let dialogResolve = null;
  function dialog({ title, message, actions }) {
    closePopups({ keepSettings: true });
    if (dialogResolve) dialogResolve(null);
    const modal = $('#modal'), card = $('.modal-card', modal);
    card.innerHTML = `<h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}<div class="modal-actions">` +
      actions.map((a, i) => `<button class="btn ${a.kind || ''} ${a.choice ? 'choice' : ''}" data-i="${i}">${esc(a.label)}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</button>`).join('') + '</div>';
    modal.classList.add('open');
    const first = $('.btn', card);
    if (first) first.focus();
    return new Promise(resolve => {
      dialogResolve = v => { dialogResolve = null; modal.classList.remove('open'); resolve(v); };
      card.onclick = e => { const b = e.target.closest('[data-i]'); if (b) dialogResolve(actions[+b.dataset.i].value); };
      modal.onclick = e => { if (e.target === modal) dialogResolve(null); };
    });
  }

  function toast(text, opts = {}) {
    const host = $('#toasts');
    while (host.children.length >= 3) host.firstChild.remove();
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
    host.appendChild(t);
    const timeout = opts.timeout === undefined ? 4200 : opts.timeout;
    if (timeout) setTimeout(remove, timeout);
    return t;
  }

  function closePopups(opts = {}) {
    Picker.close();
    Menu.close();
    if (!opts.keepSettings) Settings.close();
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
  // 16. Boot
  // =====================================================================
  function initUI() {
    Picker.init();
    Menu.init();
    Settings.init();
    $('#desk').addEventListener('pointerdown', onDeskPointerDown);
    document.addEventListener('pointermove', e => Inter.move(e));
    document.addEventListener('pointerup', e => Inter.end(e, false));
    document.addEventListener('pointercancel', e => Inter.end(e, true));
    document.addEventListener('lostpointercapture', e => { if (Inter.map.has(e.pointerId)) Inter.end(e, false); });

    // Tapping outside a popup closes it.
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      if (Picker.side && !t.closest('#panel') && !t.closest('.picker-btn')) Picker.close();
      if (Menu.win && !t.closest('#menu') && !t.closest('.win-label')) Menu.close();
      if (Settings.isOpen && !t.closest('#settings') && !t.closest('#modal') && !t.closest('.picker-btn') && !t.closest('#panel')) Settings.close();
    }, true);
    // Focus moving into an app iframe (a tap inside it) also closes popups.
    window.addEventListener('blur', () => setTimeout(() => { if (document.activeElement && document.activeElement.tagName === 'IFRAME') { Picker.close(); Menu.close(); } }, 0));

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (dialogResolve) dialogResolve(null);
      else if (Menu.win) { const w = Menu.win; Menu.close(); w.labelEl.focus(); }
      else if (Picker.side) Picker.close();
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
    Install.init(); // before anything async: Chrome can fire beforeinstallprompt early
    initUI();
    Sync.init();
    try {
      await Store.open();
    } catch (err) {
      console.error('21Board: IndexedDB unavailable', err);
      Store.failed = true;
      toast('This browser is blocking storage, so nothing will be saved. Try a normal (not private) window.', { timeout: 10000 });
    }
    await reloadAll();
    updateZoom();
    ensureLayout();
    if (!Known.has(Keys.board(S.boardId))) Writer.put(Keys.board(S.boardId), 'board', S.board);
    applySettings();
    applyBoard();
    updateHint();
    registerSW();
    setupFileLaunch();
    Persist.init();
  }

  // Exposed for debugging in the console and for automated tests.
  window.__board21 = {
    version: BOARD_VERSION, state: S, store: Store, zoom: Zoom, useScreenAsLayout,
    setRect: (ikey, rect) => { const i = S.insts.get(ikey); if (!i) return; saveInst(ikey, Object.assign({}, i, { rect })); const w = S.wins.get(ikey); if (w) w.layout(); },
    openApp, closeWin, focusWin, resetWin, deleteInstance, setMaximized,
    buildExport, applyImport: (obj, mode) => applyImport(parseBoardFile(JSON.stringify(obj)), mode), reloadAll, rebuildAll,
    catalog: () => Array.from(catalog.values())
  };

  boot();
})();
