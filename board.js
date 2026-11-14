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
  // The release this file belongs to. Both are written by tools/release.js: the release's name (VERSION in
  // sw.js) and the build, one fingerprint for every file of the release. The page carries the build as well
  // (<html data-build>), and so does the offline copy (sw.js): section 15 keeps them from being mixed.
  const BOARD_VERSION = '2026.11.13-1';
  const BOARD_BUILD = '6c5de82f';
  const RELEASE = `${BOARD_VERSION} (${BOARD_BUILD})`;   // what Settings → About shows, to read out to IT
  const pageBuild = () => LAB ? BOARD_BUILD : document.documentElement.dataset.build || '';   // (the dev window's page has none)
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
  // Kiosk mode (?kiosk=yes): ChromeOS kiosk, for users who don't sign in. No Fullscreen (a kiosk is always full
  // screen), Google Drive folder, install prompt or backup reminders; a Quit control at the end of the Widget
  // Picker's controls. Import and Export use ChromeOS's Files dialog (the kiosk's own storage, USB drives).
  // Everything else (windows, widgets, saving on the device, board history, backups when asked for) works as usual.
  const KIOSK = !LAB && /^(yes|true|1|on)$/i.test(new URLSearchParams(location.search).get('kiosk') || '');
  // ?nodev: test widgets don't start (Settings still lists them, to remove one). The way out when an uploaded one
  // freezes the board on every start (see DevFiles.begin).
  const NODEV = !LAB && new URLSearchParams(location.search).has('nodev');
  const DB_NAME = LAB ? '21Board-dev' : '21Board';
  const DB_STORE = 'records';
  const TITLE_H = 40;          // window title bar height (px)
  const GAP = 8;               // spacing used when windows snap next to each other
  const ALIGN_SNAP = 12;       // distance at which edges align to neighbours
  const DRAG_THRESHOLD = 6;    // px of movement before a press on a resize handle becomes a drag
  // The same where a tap means something (a window's name opens its menu, two taps on a title bar fill the
  // board, a button inside a widget is pressed): a finger slides a few millimetres while tapping, a mouse doesn't.
  const TAP_SLOP = { mouse: 6, pen: 10, touch: 16 };   // screen px
  const RESISTANCE = { gentle: 40, normal: 80, strong: 150 }; // px of push needed to overlap
  const TAB_ID = Math.random().toString(36).slice(2, 10);
  // Opened straight from disk (file://), every page has an opaque origin, so messages can't be origin-restricted.
  const ORIGIN = (location.protocol !== 'file:' && location.origin && location.origin !== 'null') ? location.origin : '*';
  const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';
  // A test widget uploaded as a file (Developer mode) gets the widget lab's sandbox: no allow-same-origin, so it
  // has an origin of its own and can't reach the board, its storage or other boards. See DevFiles.
  const SEALED_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-downloads';

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
    activeBoard: 1,          // the page every tab shows (section 11b)
    boards: [1],             // the pages, in order (board ids)
    deletedBoards: [],       // pages deleted while their Undo is offered (their records go after it: Pages.purge)
    deletedAt: {},           // when each of those was deleted (ms), so that a tab started meanwhile waits for its Undo
    lastBoard: 1,            // the highest page id used so far: a deleted page's id is never used again
    lastBackupAt: null,      // when a full backup was last exported (ms), for backup reminders
    historyEvery: 10,        // Board history: save a version at most every N minutes while the board changes (0 = off)
    historyFolder: true,     // Board history: also keep copies in the linked Google Drive folder (about one an hour)

    // Classroom features (this device only: never exported or sent to the Drive folder). See section 12b.
    locked: false,           // Lock windows in place

    awake: 'off',            // Keep the screen on: 'off' | 'on' (while 21Board shows) | 'hours' (school hours only)
    awakeFrom: '07:30',      //   school hours start (HH:MM, this device's time)
    awakeTo: '15:30',        //   school hours end

    clock: 'date',           // Clock in the corner: 'off' | 'time' | 'date' (time and date, the default)

    letters: 'standard'      // Letters: 'standard' (the device's own font) | 'legible' (Atkinson Hyperlegible) | 'early' (Andika)
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
    const base = Object.assign({}, PALETTES[theme], { font: letterFont() });   // Settings → Letters (section 12b)
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

  // Board background colors (Settings shows them in two rows) and patterns (.pattern-<id> in index.html).
  const BG_LIGHT = [['#ffffff', 'White'], ['#faf7f0', 'Paper'], ['#e0f2fe', 'Sky'], ['#dcfce7', 'Mint'], ['#fce7f3', 'Blush'], ['#ede9fe', 'Lavender'], ['#fef3c7', 'Sand']];
  const BG_DARK = [['#334155', 'Slate'], ['#1f3a2c', 'Chalkboard'], ['#1e293b', 'Navy'], ['#0a0a0a', 'Black']];
  const BG_SWATCHES = BG_LIGHT.concat(BG_DARK);
  // Handwriting and Graph paper came later: an older 21Board shows no pattern for them (and an import there makes it "none").
  const PATTERNS = [['none', 'None'], ['dots', 'Dots'], ['grid', 'Grid'], ['lines', 'Lines'], ['handwriting', 'Handwriting'], ['graph', 'Graph paper']];
  const PATTERN_IDS = PATTERNS.map(p => p[0]);
  const bgColorName = c => !c ? 'Matches the theme' : (BG_SWATCHES.find(([h]) => h === c) || [0, 'Custom color'])[1];
  // Pattern lines and the hint's text, in shades that suit the board color (light, dark, or the theme's).
  function bgInk(color) {
    const dark = color ? luminance(color) < 0.3 : resolvedTheme() === 'dark';
    return dark ? { dark, pattern: 'rgba(255,255,255,0.11)', strong: 'rgba(255,255,255,0.24)', hint: 'rgba(255,255,255,0.7)', margin: 'rgba(255,255,255,0.05)' }
      : { dark, pattern: 'rgba(0,0,0,0.09)', strong: 'rgba(0,0,0,0.2)', hint: 'rgba(0,0,0,0.55)', margin: 'rgba(0,0,0,0.05)' };
  }

  const ICONS = {
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5.5-5.5L6 20"/>',
    waffle: '<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2"/><rect x="16" y="16" width="5" height="5" rx="1.2"/>',
    export: '<path d="M6 3h10l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v4.5h7V3"/><path d="M7 21v-6.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V21"/>', // floppy disk: Save (also Settings > Back up now)
    import: '<path d="M3 18V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1.5"/><path d="M3 18a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L22 11H7.6a2 2 0 0 0-1.9 1.4z"/>', // open folder: Open
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
    back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
    chevLeft: '<path d="M15 5l-7 7 7 7"/>',
    chevRight: '<path d="M9 5l7 7-7 7"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    widget: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    windows: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    quit: '<path d="M18 6L6 18M6 6l12 12"/>',   // a plain X (kiosk mode: Quit)
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.5v4h4"/><path d="M12 7.5V12l3 2"/>',   // clock with a back arrow
    send: '<path d="M7 18.5H6.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.6 8.1 4.5 4.5 0 0 1 17.5 18.5H17"/><path d="M12 20.5v-8"/><path d="M8.8 15.2L12 12l3.2 3.2"/>', // cloud with an arrow going up
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>', // a box with an arrow out: open in its own tab
    reload: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M21 4.5v4h-4"/>' // a clockwise arrow (history's, mirrored)
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
      sealed: !!extra.sealed,   // an uploaded file (see DevFiles): runs sealed off from the board
      single: !!a.single,   // one window only (see openWidget)
      // A district app from its own site (registry only: a test widget never is). Its address comes from the
      // registry and nowhere else; it has no SDK, so the board takes no messages from it and sends it nothing.
      external: a.external === true && !extra.dev && /^https:\/\//i.test(a.entry),
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
  // Windows may show this site's pages, and registered widgets from another site, only: a test widget uploaded as a
  // file (sealed off, see DevFiles) can't send its window to another address, away from its own policy. (Written
  // here, before any window, so it follows the registry.)
  if (!LAB) {
    const sites = new Set();
    for (const a of REGISTRY) {
      try { const u = new URL(a.entry, location.href); if (/^https?:$/.test(u.protocol) && u.origin !== location.origin) sites.add(u.origin); } catch (e) { /* not an address */ }
    }
    const csp = document.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content = ["frame-src 'self'", ...sites].join(' ');
    document.head.appendChild(csp);
  }

  function rebuildCatalog() {
    catalog = new Map(REGISTRY.map(a => [a.id, a]));
    for (const f of (LAB || NODEV ? [] : S.devFiles.values())) {
      const widget = normalizeWidget({ id: f.id, name: f.name, entry: 'about:srcdoc', version: f.version, window: f.window, color: '#64748b', description: 'Uploaded test widget' }, { dev: true, sealed: true });
      if (widget && !catalog.has(widget.id)) catalog.set(widget.id, widget);
    }
  }
  const getWidget = id => catalog.get(id) || null;
  const pickerWidgets = () => Array.from(catalog.values())
    .filter(a => S.settings.devMode || (!a.devOnly && !a.dev))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // ---------------------------------------------------------------------
  // Test widgets uploaded as a file (Settings → Developer mode → Test a widget → Upload file…). The browser
  // won't let a page from the web load a file:/// address, so the file's text is read and kept on this device
  // in a record of its own (devfile:<id>). Its window shows it sealed off from the board (SEALED_SANDBOX: it
  // can't reach the board's page, its storage, the Drive folder or other boards), with a Content Security
  // Policy first in the page, so it makes no network requests either; the board's frame-src (section 2) keeps
  // its window on this site's pages (see Win.onFrameLoad). The record never leaves the device: export, board
  // history and the Drive folder carry windows and their content only (buildExport), and an import never writes
  // one, so a .21board file can never bring code that runs.
  // ---------------------------------------------------------------------
  const DEV_FILE_MAX = 5 * 1048576;
  const DEV_GRACE = 10000;   // a start is noted until the widget has run this long (see DevFiles.begin)
  const DEV_STALE = 15000;   // a note older than this wasn't left by a start still in progress in another tab
  const SEALED_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; " +
    "img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src data: blob:; form-action 'none'";
  // The widget's SDK tags, whole (as SDK_TAG_RE in sdk/board21-dev.js).
  const SDK_TAGS_RE = /<script\b[^>]*?\bsrc\s*=\s*(["'])[^"']*?board21(?:\.min)?\.js(?:[?#][^"']*)?\1[^>]*>\s*<\/script\s*>/gi;
  const DevFiles = {
    sdkP: null,
    // 21Board's own SDK, from the offline copy. A sealed-off frame isn't served by the offline copy, so a
    // <script src> in it would fail offline: the SDK's text goes into the page instead.
    sdk() {
      if (!this.sdkP) {
        this.sdkP = fetch('sdk/board21.js').then(r => { if (!r.ok) throw new Error(`sdk/board21.js: ${r.status}`); return r.text(); });
        this.sdkP.catch(() => { this.sdkP = null; });   // (tried again next time)
      }
      return this.sdkP;
    },
    note: (title, text) => `<!DOCTYPE html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;font:15px system-ui;color:#6b7280;text-align:center;padding:16px;box-sizing:border-box"><div><b style="color:#1f2937">${esc(title)}</b><br>${esc(text)}</div>`,
    // The page its window shows: the policy before anything of the file's (after its doctype, which must come
    // first), then the SDK in place of the file's SDK tag (each one: the first may be in a comment), or ahead of
    // everything if it has none. (The SDK runs once however often it is in a page.)
    async page(id) {
      const f = S.devFiles.get(id);
      let sdk;
      try { sdk = await this.sdk(); } catch (err) { return this.note('This widget can’t start', '21Board couldn’t read its own copy of the widget SDK. Connect to the internet, then reload.'); }
      const tag = `<script>${sdk.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')}</script>`;
      let src = f ? f.src : '', found = false;
      src = src.replace(SDK_TAGS_RE, () => { found = true; return tag; });
      // (Only HTML's own white space may come before the doctype: after anything else the policy would land in
      // the page's body, where browsers may ignore it.)
      const dt = /^[\t\n\f\r ]*<!doctype[^>]*>/i.exec(src);
      const top = dt ? dt[0] : /^[\t\n\f\r ]*(<!--[\s\S]*?-->[\t\n\f\r ]*)+<!doctype html[\t\n\f\r ]*>/i.test(src) ? '<!DOCTYPE html>' : '';
      return top + `<meta http-equiv="Content-Security-Policy" content="${SEALED_CSP}">` + (found ? '' : tag) + src.slice(dt ? top.length : 0);
    },
    // What its window shows: its page, or a note if its page left (see Win.onFrameLoad) or it stopped
    // responding last time (see begin).
    async start(id, left) {
      if (left) return this.note('This test widget left its page', 'An uploaded widget can’t go to another address or reload itself. Upload its file again to start it.');
      const html = await this.page(id);
      return this.begin(id) ? html : this.note('This test widget wasn’t started', 'It stopped responding last time. Fix it, then upload it again.');
    },
    // A file that hangs (an endless loop) can freeze the whole board where the browser runs it in the board's own
    // process (iPad Safari; Chrome where sandboxed frames aren't kept apart), and its window reopens on every
    // start. So each start is noted on this device until the widget has run for a while or the tab closes; a
    // note found later means the board froze, and that upload isn't started again here (uploading it again
    // starts it). False if it isn't to start. (?nodev is the way out of a freeze that comes later.)
    held: new Map(),   // widget id -> the upload (its time) not started in this tab
    hooked: false,     // (the tab closing clears its notes)
    begin(id) {
      const at = (S.devFiles.get(id) || {}).at, mine = TAB_ID + ':' + id, now = Date.now();
      if (this.held.has(id) && this.held.get(id) === at) return false;
      let froze = false;
      this.starts(s => {
        for (const [k, t] of Object.entries(s)) if (k.slice(k.indexOf(':') + 1) === id && now - t > DEV_STALE) { delete s[k]; froze = true; }
        if (!froze) s[mine] = now;
      });
      if (froze) { this.held.set(id, at); return false; }
      if (!this.hooked) {
        this.hooked = true;
        addEventListener('pagehide', () => this.starts(s => { for (const k of Object.keys(s)) if (k.startsWith(TAB_ID + ':')) delete s[k]; }));
      }
      setTimeout(() => this.starts(s => { if (s[mine] === now) delete s[mine]; }), DEV_GRACE);
      return true;
    },
    forget(id) { this.starts(s => { for (const k of Object.keys(s)) if (k.slice(k.indexOf(':') + 1) === id) delete s[k]; }); },
    // Starts being noted: { '<tab>:<widget id>': when }. (localStorage, written at once: it is there even if the
    // board freezes right after.)
    starts(change) {
      try {
        const s = JSON.parse(localStorage.getItem('21board-devfile-starts') || '{}') || {};
        if (change) { change(s); localStorage.setItem('21board-devfile-starts', JSON.stringify(s)); }
        return s;
      } catch (e) { return {}; }   // (no storage: no guard)
    },
    // Reads an uploaded file and keeps it; its window opens, or its open windows start again with it.
    // Throws, with a message to show, if the file can't be used.
    async add(file, side) {
      if (location.protocol === 'file:') throw new Error('Uploading a widget works in 21Board opened from its web address, not from a file.');
      if (!/\.html?$/i.test(file.name || '') && file.type !== 'text/html') throw new Error('Choose the widget’s .html file.');
      if (file.size > DEV_FILE_MAX) throw new Error(`This file is ${fmtBytes(file.size)}. A widget file can be at most 5 MB.`);
      const src = await file.text();
      if (src.includes('\0') || !/<[a-z!]/i.test(src)) throw new Error('This file isn’t a web page. Choose the widget’s .html file.');
      // Its manifest block, if it has one. (A parsed copy: nothing in it runs or loads.)
      const doc = new DOMParser().parseFromString(src, 'text/html');
      let m = null;
      try { const el = doc.getElementById('board21-widget'); m = el && JSON.parse(el.textContent); } catch (e) { /* not valid JSON: as if there were none */ }
      if (!m || typeof m !== 'object' || Array.isArray(m)) m = {};
      const label = String(m.name || doc.title || file.name.replace(/\.html?$/i, '')).trim().slice(0, 60) || 'Test widget';
      // 'dev-' and the widget's own id (or its name). (A registered widget with the same id would win: an upload
      // never stands in for one.)
      const slug = String(ID_RE.test(m.id || '') ? m.id : label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '') || 'widget';
      const id = ('dev-' + slug).slice(0, 64).replace(/-+$/, '');
      const rec = { id, name: label + ' (test)', file: String(file.name).slice(0, 120), size: file.size, src, version: String(m.version || '').slice(0, 40),
        window: m.window && typeof m.window === 'object' && !Array.isArray(m.window) ? m.window : null, at: Date.now() };
      Writer.put(Keys.devfile(id), 'devfile', rec);
      this.forget(id);   // (a new upload starts, even if the last one froze the board)
      this.apply(id, rec);
      if (Array.from(S.insts.values()).some(i => i.widgetId === id && i.open)) toast(`${rec.name} is updated.`);
      else openWidget(id, { side });
    },
    remove(id) {
      if (!S.devFiles.has(id)) return;
      Writer.del(Keys.devfile(id));
      this.forget(id);
      this.apply(id, null);
    },
    // Its record arrived (an upload here or in another tab, or a reload) or went: the catalog follows, and
    // its open windows start again with the new file.
    apply(id, value) {
      const open = Array.from(S.wins.values()).filter(w => w.widget.id === id);
      if (ID_RE.test(id) && value && typeof value === 'object' && typeof value.src === 'string') S.devFiles.set(id, Object.assign({}, value, { id }));
      else S.devFiles.delete(id);
      updateCatalog();
      const widget = getWidget(id);
      for (const w of open) if (widget && S.wins.get(w.ikey) === w) { w.widget = widget; w.el.setAttribute('aria-label', widget.name); w.reload(); }
      Picker.render();
      if (Settings.isOpen) Settings.render();
    }
  };

  // =====================================================================
  // 3. Storage — IndexedDB
  // ---------------------------------------------------------------------
  // Database "21Board", object store "records" (keyPath "key"). Every record:
  //   { key, type, rev, updatedAt, by, value }
  // Keys:
  //   settings                        board-wide preferences
  //   board:<b>                       board <b> (name, background): a page (section 11b)
  //   inst:<b>:<widgetId>:<n>            window/instance n of a widget (geometry, open/closed, z)
  //   data:<b>:<widgetId>:<n>            that instance's content   (Board21.save)
  //   conf:<b>:<widgetId>:<n>            that instance's config    (Board21.saveConfig)
  //   devfile:<widgetId>              a test widget uploaded as a file (DevFiles; this device only)
  // =====================================================================
  const Keys = {
    settings: 'settings',
    board: b => `board:${b}`,
    inst: (b, ik) => `inst:${b}:${ik}`,
    data: (b, ik) => `data:${b}:${ik}`,
    conf: (b, ik) => `conf:${b}:${ik}`,
    media: (b, name) => `media:${b}:${name}`,   // big binary-ish things (the background photo), kept apart so sync can skip them
    link: name => `link:${name}`,                // this device's link to a shared folder (section 13b); never exported
    devfile: id => `devfile:${id}`,              // a test widget uploaded as a file (DevFiles); this device only, never exported
    parse(key) {
      const p = String(key).split(':');
      if (p[0] === 'settings') return { kind: 'settings' };
      if (p[0] === 'devfile' && p.length === 2) return { kind: 'devfile', id: p[1] };
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

  // "Out of space", however the browser says it (Chrome on a full disk reports DataError or UnknownError).
  const isFull = err => !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 ||
    /quota|no.?space|disk.{0,12}full|write blobs|IOError/i.test(String(err.message || '')));
  // The browser won't let this window store anything (site data blocked, a private window in some browsers).
  const isBlocked = err => typeof indexedDB === 'undefined' || !indexedDB ||
    (!!err && (/^(SecurityError|InvalidStateError|NotSupportedError)$/.test(err.name || '') || /denied|insecure|not allowed/i.test(String(err.message || ''))));

  const Store = {
    db: null,
    opening: null,
    loaded: false,       // the stored board has been read into this tab: nothing is written before that (see Startup)
    failed: '',          // why nothing is stored this session: 'blocked' (the browser won't allow it) or 'unopened'
                         // (the saved board couldn't be opened and the teacher went on without it). See SaveNote.
    mem: null,           // MemDB: the records are kept in memory (test mode where storage is blocked, or failed)
    lost: false,         // the database was found gone under an open board, and what this tab holds isn't all
                         // written back yet (see Writer.restore): until then, nothing read from it is believed

    open() {
      if (this.db) return Promise.resolve(this.db);
      if (this.opening) return this.opening;
      const p = this.opening = new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (err) { reject(err); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'key' });
          // A new, empty database under a board that was read from the old one: the browser threw the old one
          // away (Chrome does when its storage is damaged, for example after the disk filled up).
          if (this.loaded) { this.lost = true; console.error('21Board: the stored board is gone from this device; writing back what this window holds'); }
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); this.db = null; };
          db.onclose = () => { this.db = null; };
          this.db = db; this.opening = null; resolve(db);
          if (this.lost) Writer.restore();
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => console.warn('21Board: database upgrade blocked by another tab.');
      });
      p.catch(() => { if (this.opening === p) this.opening = null; });   // (so that the next try really tries again)
      return p;
    },

    // At start-up. Opening can fail for a moment (a busy disk, the browser still starting), so it is tried a
    // few times; and it can hang, so it is never waited for forever.
    async openSoon() {
      let last;
      for (const wait of [0, 300, 1200]) {
        if (wait) await sleep(wait);
        try {
          return await Promise.race([this.open(), sleep(10000).then(() => { throw Object.assign(new Error('Storage didn’t answer'), { name: 'TimeoutError' }); })]);
        } catch (err) { last = err; if (isBlocked(err) || (err && err.name === 'TimeoutError')) break; }
      }
      throw last;
    },

    // Run fn(objectStore, setResult) in a transaction; resolves when it completes (all of it is stored, or none).
    async tx(mode, fn, retry = true) {
      if (mode === 'readwrite' && !this.loaded) throw new Error('21Board hasn’t opened your board yet.');
      if (this.mem) return this.mem.tx(fn);
      const db = await this.open();
      try {
        return await new Promise((resolve, reject) => {
          const t = db.transaction(DB_STORE, mode);
          let result, reqErr = null;
          t.oncomplete = () => resolve(result);
          t.onerror = e => { reqErr = e.target && e.target.error; };   // a request failed: the abort that follows says why
          t.onabort = () => reject(t.error || reqErr || new Error('Transaction aborted'));
          try { fn(t.objectStore(DB_STORE), v => { result = v; }); } catch (err) { try { t.abort(); } catch (e) { /* already ended */ } reject(err); }
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
    },

    // Every record, to (re)load the board. A failed read is tried once more. If the records still can't be read
    // in one go (one damaged record, in practice a big one such as the photo), they are read one by one:
    // content that can't be read is left out and listed in skipped; anything else unreadable is an error.
    async readAll() {
      let first;
      for (let i = 0; i < 2; i++) {
        try { return { recs: await this.getAll(), skipped: [] }; } catch (err) { if (first) break; first = err; await sleep(250); }
      }
      const keys = (await this.tx('readonly', (s, set) => { const q = s.getAllKeys(); q.onsuccess = () => set(q.result); })) || [];
      const recs = [], skipped = [];
      for (const key of keys) {
        try { const r = (await this.getMany([key]))[0]; if (r) recs.push(r); } catch (err) { skipped.push(key); }
      }
      if (skipped.some(k => !/^(media|data|conf|devfile):/.test(k))) throw first;
      return { recs, skipped };
    }
  };

  // Revisions of records as this tab last saw them. Used to ignore stale/echoed sync messages.
  const Known = new Map();

  // Coalescing writer: every change is queued, then written in one transaction.
  // Rapid saves of the same key collapse into one write; order is preserved.
  // A change that can't be saved is never dropped: it stays queued and is tried again (with the next change,
  // and every so often), while SaveNote shows "Not saved" on the board. (Only a newer change to the same
  // record replaces it: this tab's, or another tab's, see drop.) put() and del() resolve true once the
  // change is stored, false if it isn't (yet): the board carries on either way.
  const Writer = {
    pending: new Map(),   // key -> { type, value } | { del: true } | { type, value, absent: true } (see restore)
    batch: new Map(),     // the changes being written right now (while running)
    waiters: [],
    running: false,
    idle: [],             // settled() waiters
    retried: 0,
    failing: null,        // the error, while saves aren't working (the changes wait in pending)
    fails: 0, retryT: 0, gen: 0,
    alone: new Map(),     // key -> a change that failed when written on its own (not tried alone again until retry())
    dropped: new Set(),   // keys another tab saved something newer for, while a batch with them was being written
    // Resolves (true) once nothing is waiting to be written, or (false) after timeoutMs, or at once while
    // saves aren't working.
    settled(timeoutMs = 1000) {
      if (!this.running && (!this.pending.size || this.failing)) return Promise.resolve(!this.pending.size);
      return new Promise(res => { const t = setTimeout(() => res(false), timeoutMs); this.idle.push(() => { clearTimeout(t); res(!this.pending.size); }); });
    },

    // (Before the stored board has been read there is nothing to save a change against: see Startup.)
    put(key, type, value) { if (!Store.loaded) return Promise.resolve(false); this.pending.set(key, { type, value: clone(value) }); return this.kick(key); },
    del(key) { if (!Store.loaded) return Promise.resolve(false); this.pending.set(key, { del: true }); return this.kick(key); },

    kick(key) {
      return new Promise(resolve => {
        resolve.key = key;
        this.waiters.push(resolve);
        if (!this.running) Promise.resolve().then(() => this.run());
      });
    },
    // The board was erased or replaced as a whole (here, or in another tab): changes to the old one that
    // weren't saved yet went with it, and must not be written over the new one.
    forget() {
      this.gen++;
      this.pending = new Map();
      this.alone.clear();
      Store.lost = false;
      const waiters = this.waiters; this.waiters = [];
      waiters.forEach(w => w(false));
      if (!this.running) this.clear();
    },
    // Nothing is waiting to be saved any more.
    clear() { clearTimeout(this.retryT); this.failing = null; this.fails = 0; SaveNote.update(); },
    // Another tab has saved a newer change to this record (or deleted it), and this tab shows that now: its own
    // change to it, if one is still waiting, is the older one and must not be written over the newer one later.
    drop(key) {
      if (this.running) this.dropped.add(key);
      if (this.pending.delete(key) && !this.pending.size && !this.running) this.clear();
    },
    // The database is gone (see Store.open) while this tab still holds the board: every record it holds is
    // queued, to be written back where it is missing, so the next start doesn't find an empty board.
    restore() {
      for (const [key, op] of heldRecords()) if (!this.pending.has(key) && !(this.running && this.batch.has(key))) this.pending.set(key, op);
      if (this.running) return;   // (it goes on with these)
      if (!this.pending.size) { Store.lost = false; return; }   // this tab holds nothing: an empty board is all there is
      Promise.resolve().then(() => this.run());
    },
    // Try again now (and by itself, every so often) what couldn't be saved.
    retry() { this.alone.clear(); return this.run(); },

    // One transaction: all of the batch is stored, or none of it.
    async write(batch) {
      let thrown = null;
      let written;
      try {
        written = await Store.tx('readwrite', (s, set) => {
          const out = [];
          for (const [key, op] of batch) {
            if (op.del) { s.delete(key); out.push({ key, deleted: true }); continue; }
            const g = s.get(key);
            g.onsuccess = () => {
              if (op.absent && g.result) return;   // (putting the board back: never over what is there)
              const rec = { key, type: op.type, rev: Math.max(((g.result && g.result.rev) || 0) + 1, Date.now()), updatedAt: Date.now(), by: TAB_ID, value: op.value };
              // (A put the browser refuses outright ends the whole batch: keep its reason.)
              try { s.put(rec); out.push(rec); } catch (err) { thrown = thrown || err; try { s.transaction.abort(); } catch (e) { /* already ended */ } }
            };
          }
          set(out);
        }) || [];
      } catch (e) { throw thrown || e; }
      for (const r of written) { if (r.deleted) Known.delete(r.key); else Known.set(r.key, r.rev); Pages.hold(r.key, r.deleted ? null : r); }
      if (written.length) { const keys = written.map(r => r.key); Sync.announce(keys); Link.changed(keys); BoardHistory.changed(keys); }
    },

    async run() {
      if (this.running || !Store.loaded) return;
      this.running = true;
      clearTimeout(this.retryT);
      while (this.pending.size) {
        const batch = this.batch = this.pending; this.pending = new Map();
        const waiters = this.waiters; this.waiters = [];
        const gen = this.gen;
        this.dropped.clear();
        let err = null;
        try { await this.write(batch); batch.clear(); } catch (e) { err = e; }
        const makeRoom = !!err && isFull(err) && this.retried < 4;   // (first, see below)
        // One record that can't be written (a long note on a nearly full device) must not hold back the others:
        // they are tried one at a time, and only those that still fail stay queued. (Not while storage can't
        // even be opened.)
        if (err && !makeRoom && batch.size > 1 && (Store.db || Store.mem)) {
          for (const [key, op] of Array.from(batch)) {
            if (gen !== this.gen) break;
            if (this.dropped.has(key) || this.alone.get(key) === op) continue;
            try { await this.write(new Map([[key, op]])); batch.delete(key); } catch (e) { err = e; this.alone.set(key, op); }
          }
        }
        if (gen !== this.gen) { waiters.forEach(w => w(false)); continue; }   // forget() meanwhile: these went with the old board
        for (const key of this.dropped) batch.delete(key);
        if (!batch.size) {
          this.retried = 0;
          this.alone.clear();
          if (!this.pending.size) {
            if (this.failing) { this.failing = null; this.fails = 0; toast('Your changes are saved again.'); }
            // The board is all written back: catch up on what other tabs saved meanwhile.
            if (Store.lost) { Store.lost = false; reloadAll(); }
          }
          waiters.forEach(w => w(true));
          continue;
        }
        // Not saved: the changes go back in the queue (a newer change to the same record wins).
        for (const [k, op] of this.pending) batch.set(k, op);
        this.pending = batch;
        this.waiters.unshift(...waiters);
        // Out of space: board history gives up a little (BoardHistory.thin), then the save is tried again. A few
        // times at most, and not at all once it has nothing left to give, so a full device costs only a few
        // steps of history, never all of it.
        if (makeRoom) {
          let freed = false;
          try { freed = await BoardHistory.thin(); } catch (e2) { /* nothing to free */ }
          this.retried = freed ? this.retried + 1 : 4;
          continue;
        }
        console.error('21Board: save failed', err);
        const left = this.waiters; this.waiters = [];
        left.forEach(w => w(!this.pending.has(w.key)));   // (true for a change that was stored on its own)
        if (!this.failing) toast('21Board couldn’t save your latest changes. It keeps trying.', { action: 'Details', timeout: 8000, onAction: () => SaveNote.explain() });
        this.failing = err; this.fails++;
        this.retryT = setTimeout(() => this.retry(), this.fails === 1 ? 5000 : 30000);
        break;
      }
      this.running = false;
      if (!this.pending.size && this.failing) { this.failing = null; this.fails = 0; }   // (forget() while this ran)
      SaveNote.update();
      const idle = this.idle; this.idle = [];
      idle.forEach(f => f());
    }
  };
  // Every stored record this tab knows of, as the tab holds it now (for Writer.restore).
  function heldRecords() {
    const out = new Map(), b = S.boardId;
    for (const key of Known.keys()) {
      const k = Keys.parse(key);
      const value = k.kind === 'settings' ? S.settings : k.kind === 'link' ? (k.name === 'folder' ? Link.dir : k.name === 'state' ? Link.st : null) : k.kind === 'devfile' ? S.devFiles.get(k.id)
        : k.board !== b ? (Pages.held.get(key) || {}).value : k.kind === 'board' ? S.board : k.kind === 'inst' ? S.insts.get(k.ikey)
        : k.kind === 'data' ? S.data.get(k.ikey) : k.kind === 'conf' ? S.conf.get(k.ikey) : k.kind === 'media' ? S.media.get(k.name) : null;
      if (value !== undefined && value !== null) out.set(key, { type: k.kind, value, absent: true });
    }
    return out;
  }
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
      if (Store.failed) return;   // a board that isn't stored is this window's alone
      const msg = Object.assign({ tab: TAB_ID, keys: keys || [], t: Date.now() }, extra || {});
      try {
        if (this.chan) this.chan.postMessage(msg);
        else localStorage.setItem('21board-sync', JSON.stringify(msg));
      } catch (err) { /* sync is best-effort; visibility resync covers gaps */ }
    },
    receive(msg) {
      if (!msg || msg.tab === TAB_ID || !Store.loaded || Store.failed) return;   // (not loaded yet: the load itself will read it)
      if (msg.op === 'reload') {
        if (msg.erased) Link.forget();
        if (msg.erased || msg.replaced) Writer.forget();
        if (Inter.active) Inter.deferredRebuild = true; else rebuildAll({ pick: !!msg.erased });
        return;
      }
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
    devFiles: new Map(),   // widget id -> a test widget uploaded as a file (see DevFiles): { id, name, file, src, ... }
    wins: new Map(),    // ikey -> Win
    focused: null,
    deselected: false,  // true after tapping the empty board: no window is focused (and no grips show)
    appliedTheme: null,
    sw: { state: 'checking', version: null, build: null, updateReady: null }   // the offline copy in charge of this tab (section 15)
  };

  // Counts rebuildAll(): what was being read when the whole board was read afresh is left to that read.
  let rebuilds = 0;
  async function applyKeys(keys) {
    let recs;
    const n = rebuilds;
    try { recs = await Store.getMany(keys); } catch (err) { console.warn('21Board: sync read failed', err); return; }
    if (Store.lost || n !== rebuilds) return;   // (lost: what this tab holds is being written back, see Writer.restore)
    keys.forEach((k, i) => { if (applyRecord(k, recs[i])) Writer.drop(k); });
    afterBulkApply();
  }

  // Bring this tab in line with whatever is in IndexedDB. If that can't be read, nothing here changes
  // (must: and the caller is told, by the error). opts.pick: show the page the settings name (start-up, Erase).
  // opts.pending: this tab's changes that aren't stored yet are what it shows (going to another page: one whose
  // saves are still being tried keeps its newest content, and no widget saves the older one over it).
  async function reloadAll(must, opts = {}) {
    let recs, skipped;
    const n = rebuilds;
    try { ({ recs, skipped } = await Store.readAll()); } catch (err) { console.warn('21Board: reload failed', err); if (must) throw err; return; }
    // The database was found gone: what was read (nothing) isn't the board; what this tab holds is, and is
    // being written back (see Writer.restore).
    if (Store.lost || (!must && n !== rebuilds)) return;
    if (must && (opts.pending || Writer.pending.has(Keys.settings))) {
      const mine = new Map(Writer.batch);
      for (const [k, op] of Writer.pending) mine.set(k, op);
      const at = new Map(recs.map((r, i) => [r.key, i]));
      for (const [key, op] of mine) {
        if (!opts.pending && key !== Keys.settings) continue;
        const i = at.get(key);
        if (op.del) { if (i !== undefined) recs[i] = null; continue; }
        if (op.absent && i !== undefined) continue;
        const r = { key, type: op.type, rev: i !== undefined ? recs[i].rev : 0, value: op.value };
        if (i !== undefined) recs[i] = r; else recs.push(r);
      }
      recs = recs.filter(Boolean);
    }
    if (opts.pick) S.boardId = Pages.pick(recs);
    const order = { settings: 0, devfile: 0, board: 1, conf: 2, data: 2, inst: 3 };
    recs.sort((a, b) => (order[Keys.parse(a.key).kind] ?? 9) - (order[Keys.parse(b.key).kind] ?? 9));
    const present = new Set(skipped);   // (a record that couldn't be read isn't a deleted one)
    // A record that changed since this tab last saw it is another tab's newer change (not when the whole board
    // is read afresh: must).
    const apply = (key, rec) => { if (applyRecord(key, rec) && !must) Writer.drop(key); };
    for (const r of recs) { present.add(r.key); apply(r.key, r); }
    for (const key of Array.from(Known.keys())) if (!present.has(key)) apply(key, undefined);
    afterBulkApply();
    sayUnread(skipped);
  }
  // Content that couldn't be read (see Store.readAll) isn't shown: say which, once.
  let unreadSig = '';
  function sayUnread(keys) {
    const sig = keys.join('|');
    if (sig === unreadSig) return;
    unreadSig = sig;
    const names = new Set();
    for (const key of keys) {
      const k = Keys.parse(key);
      if (k.board === S.boardId) names.add(k.kind === 'media' ? 'the background photo' : instName(k.widgetId, k.n));
    }
    if (!names.size) return;
    const hist = BoardHistory.enabled();
    toast(`Part of this board couldn’t be read on this device, so it isn’t shown: ${Array.from(names).join(', ')}.` + (hist ? ' Board history may still have it.' : ''),
      hist ? { timeout: 0, action: 'Board history', onAction: () => HistorySheet.open('left'), dismiss: 'OK' } : { timeout: 0, action: 'OK' });
  }

  async function rebuildAll(opts = {}) {
    if (Store.lost) return;   // (there is nothing to read: what this tab holds is the board, see Writer.restore)
    rebuilds++;
    Menu.close();
    for (const w of S.wins.values()) w.destroy();
    S.wins.clear(); S.insts.clear(); S.data.clear(); S.conf.clear(); S.media.clear(); S.devFiles.clear(); Known.clear(); Pages.info.clear(); Pages.held.clear();
    S.focused = null;
    S.settings = Object.assign({}, DEFAULT_SETTINGS);
    S.board = defaultBoard(S.boardId);
    // Couldn't be read: this tab no longer knows what the board holds, so it saves nothing and says so
    // (it goes on only if the teacher chooses to carry on without saving).
    const was = S.boardId;
    try { await reloadAll(true, opts); } catch (err) { await Startup.fail(err, { storage: true }); await reloadAll(true, opts); }
    updateZoom();
    migrateBoard();
    ensureUid();
    applySettings(); applyBoard();
    // Another page is shown now (opts.pick): board history is that page's.
    if (S.boardId !== was) { BoardHistory.switched(); await BoardHistory.reload(); HistorySheet.refresh(); updateHint(); Picker.renderControls(); }
  }
  // Every board has a unique id (board.uid), so a file sent from another device can be matched to it.
  function ensureUid() { if (!UID_RE.test(S.board.uid || '')) updateBoard({ uid: newId() }); }

  // Returns true if the record was news to this tab (false: it already had this revision, or a newer one).
  function applyRecord(key, rec) {
    if (rec) {
      if (Known.has(key) && rec.rev <= Known.get(key)) return false;
      Known.set(key, rec.rev);
    } else {
      if (!Known.has(key)) return false;
      Known.delete(key);
    }
    Pages.hold(key, rec);
    const k = Keys.parse(key);
    const value = rec ? rec.value : null;
    switch (k.kind) {
      case 'settings':
        S.settings = Object.assign({}, DEFAULT_SETTINGS, value || {});
        // A record from an older 21Board may still list test widgets added by their address (devWidgets). That way
        // of testing a widget is gone: the list is ignored, whatever it holds, and dropped here so it is never saved
        // again. Their windows are kept like any window whose widget isn't in the catalog: not shown, and listed in
        // Settings as Widget not installed, to delete.
        delete S.settings.devWidgets;
        applySettings();
        break;
      case 'board':
        Pages.note(k.board, value);   // (every page's name, for the Pages menu)
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
      case 'devfile': DevFiles.apply(k.id, value); break;
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
    return true;
  }

  function afterBulkApply() {
    updateFocus();
    Pages.follow();   // another tab went to another page
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
    Pages.note(S.boardId, S.board);
    applyBoard();
    Writer.put(Keys.board(S.boardId), 'board', S.board);
  }

  const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  const resolvedTheme = () => S.settings.theme === 'system' ? (mqDark.matches ? 'dark' : 'light') : (S.settings.theme === 'dark' ? 'dark' : 'light');

  let lastCatalogSig = '';
  // The catalog follows the test widgets uploaded as files (DevFiles).
  function updateCatalog() {
    const sig = JSON.stringify([S.settings.devMode, Array.from(S.devFiles.values(), f => [f.id, f.at])]);
    if (sig === lastCatalogSig) return;
    lastCatalogSig = sig;
    rebuildCatalog();
    for (const ikey of S.insts.keys()) reconcileWin(ikey);
  }
  function applySettings() {
    const theme = resolvedTheme();
    document.body.classList.toggle('dark', theme === 'dark');
    applyAccent(theme);
    const palette = paletteFor(theme);
    window.__board21Host = { theme, palette, version: BOARD_VERSION };
    const themeSig = theme + '|' + S.settings.accent + '|' + letterKey();   // (the letters go to widgets with the theme)
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
    SaveNote.update();   // (it sits above the Widget Picker buttons)
    applyClassroom();    // section 12b: lock, screen, clock, letters
    updateCatalog();
    Picker.renderControls();
    Picker.render();
    scheduleLayoutAll(); // "Scale the board to fit the screen" may have changed
  }

  function applyBoard() {
    scheduleLayoutAll(); // the layout size may have changed
    const bg = S.board.background || {};
    const desk = $('#desk');
    desk.style.backgroundColor = bg.color || '';
    PATTERN_IDS.forEach(p => desk.classList.remove('pattern-' + p));
    if (bg.pattern !== 'none' && PATTERN_IDS.includes(bg.pattern)) desk.classList.add('pattern-' + bg.pattern);
    const ink = bgInk(bg.color);
    desk.style.setProperty('--pattern', ink.pattern);
    desk.style.setProperty('--pattern-strong', ink.strong);
    desk.style.setProperty('--hint', ink.hint);
    desk.style.setProperty('--margin-shade', ink.margin);
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
      // (Preparing it takes a moment: if another page is shown by then, the photo isn't put on that one.)
      const b = S.boardId, still = () => { if (b !== S.boardId) throw new Error('Another page is shown now. Choose the photo again on the page you want it on.'); };
      const m = await this.process(file);
      still();
      if (this.media()) { await BoardHistory.before('photo', 'Before changing the background photo'); still(); }
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
    CornerClock.place();   // section 12b: beside a Widget Picker button, at --ui
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
      this.el.innerHTML = '<div class="msg"><b>This board keeps a<br>standard widescreen shape.</b>Do you want it to work<br>in any shape?</div>' +
        '<div class="acts"><button class="btn primary small" data-act="unlock">Use the whole window</button></div>' +
        `<button class="hide" data-act="hide" aria-label="Hide this tip" title="Hide">${svg('close')}</button>`;
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
      Object.assign(this.el.style, { left: '0px', top: '0px', maxWidth: Math.min(290, Math.max(200, box.w / ui - 24)) + 'px' });   // measure unconstrained (a short, tall card)
      const r = { w: this.el.offsetWidth * ui, h: this.el.offsetHeight * ui };
      // No room for it at this size (its button would spill out or Hide would go off screen): leave it out.
      show = box.w - 16 >= Math.max(r.w, 200 * ui) && box.h - 16 >= r.h;
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
      this.left = false;        // an uploaded file's page went elsewhere (see onFrameLoad)
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
        `<div class="win-body"><div class="win-loading"></div>${this.widget.external ? '<div class="win-shield" hidden></div>' : ''}</div>` +
        ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map(h => `<div class="grip ${h}" data-h="${h}"></div>`).join('');
      this.el = el;
      this.titleEl = $('.win-title', el);
      this.labelEl = $('.win-label', el);
      this.bodyEl = $('.win-body', el);
      this.loadingEl = $('.win-loading', el);
      this.shieldEl = $('.win-shield', el);   // (district apps: see coverApps)
      el.addEventListener('animationend', e => { if (e.target === el) el.classList.remove('opening'); });
      this.labelEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Menu.toggle(this); } });
      this.renderTitle();
      this.createFrame();
      desk().appendChild(el);
      if (this.widget.external) AppsOffline.soon();
    }

    createFrame() {
      if (this.iframe) this.iframe.remove();
      const f = document.createElement('iframe');
      const sealed = this.widget.sealed;
      f.title = this.widget.name;
      f.setAttribute('sandbox', sealed ? SEALED_SANDBOX : SANDBOX);
      f.setAttribute('allow', (sealed ? ['fullscreen', 'clipboard-write', 'autoplay'] : ['fullscreen', 'clipboard-read', 'clipboard-write', 'autoplay', ...this.widget.permissions]).join('; '));
      f.addEventListener('load', () => this.onFrameLoad());
      // Tells the SDK it's inside 21Board, before any of its code runs. (Set before inserting the frame:
      // a later change doesn't reach the widget's window.name.) Not for a district app: it's another site's page,
      // with no SDK. (Its address is the registry's, never saved data.)
      if (!this.widget.external) f.name = 'b21-board:' + this.ikey;
      if (sealed) {
        // An uploaded file: its page is put together first (DevFiles.start), then the frame goes in.
        this.iframe = f; this.loads = 0; this.helloed = false;
        this.loadingEl.classList.remove('done');
        DevFiles.start(this.widget.id, this.left).then(html => { if (this.iframe !== f) return; f.srcdoc = html; this.bodyEl.insertBefore(f, this.loadingEl); });
        return;
      }
      // (A district app's page goes over the spinner, not under it: the board can't see when it is drawn, and its
      // 'load' can come very late or not at all: 21Timer's waits on a hidden video of its own.)
      this.bodyEl.insertBefore(f, this.widget.external ? this.shieldEl : this.loadingEl);
      this.iframe = f;
      this.loadingEl.classList.remove('done');
      if (this.widget.srcdoc != null) f.srcdoc = this.widget.srcdoc; else f.src = this.widget.entry;
    }

    onFrameLoad() {
      this.loadingEl.classList.add('done');
      // An uploaded file's frame loads once. Another load is another page in it (it went to another address, or
      // reloaded or rewrote itself), which isn't sealed by the file's policy: the board stops talking to it, and
      // a note takes its place. (Not a new start: it might leave again at once.)
      if (this.widget.sealed && ++this.loads > 1) return this.reload(true);
      // Same-origin: catch taps inside the widget even if it doesn't use the SDK.
      try {
        this.iframe.contentWindow.addEventListener('pointerdown', () => { focusWin(this.ikey); closePopups(); }, true);
      } catch (e) { /* cross-origin: the SDK's 'activate' message covers this */ }
      attachContentDrag(this);
    }

    reload(left = false) {
      Inter.forget(this, true);
      this.rt = {}; this.menuItems = []; this.subtitle = ''; this.connected = false; this.lastInfo = ''; this.left = left;
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
      $('.sub', this.labelEl).textContent = this.subtitle || (this.widget.external && navigator.onLine === false ? 'Offline' : '');   // (AppsOffline)
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
      coverApps();   // (what overlaps a district app may have changed)
    }

    info() {
      const d = this.disp || { x: 0, y: 0, w: 0, h: TITLE_H };
      // zoom: how much bigger the window is drawn than its CSS size (the board's Size, the screen), so a canvas can stay sharp.
      const i = { width: Math.round(d.w), height: Math.round(d.h - TITLE_H), x: Math.round(d.x), y: Math.round(d.y), maximized: !!(this.inst && this.inst.maximized), focused: S.focused === this.ikey,
        zoom: Math.round(Zoom.s * 100) / 100 };
      // corners: in a window that fills the board, the room the board's own buttons and clock take over its bottom corners.
      if (i.maximized) i.corners = cornerReach();
      return i;
    }

    notifyInfo() {
      if (!this.connected) return;
      const i = this.info(), c = i.corners;
      const sig = [i.width, i.height, i.maximized, i.focused, i.zoom, c ? [c.left, c.right, c.height].join('/') : ''].join();
      if (sig === this.lastInfo) return;
      this.lastInfo = sig;
      this.post('window', { info: i });
    }

    post(type, payload) {
      if (!this.connected && type !== 'init') return;
      const msg = Object.assign({ b21: SDK_PROTOCOL, type }, payload || {});
      if (LAB) LabBridge.log('out', this, msg);
      // (A sealed-off frame's origin is opaque: '*', which still reaches only this window's frame.)
      try { this.iframe.contentWindow.postMessage(msg, this.widget.sealed ? '*' : ORIGIN); } catch (e) { /* frame gone */ }
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
          // An uploaded file's page says hello once: another hello is another page in its frame (see onFrameLoad),
          // often heard before that page's load.
          if (this.widget.sealed && this.helloed) return this.reload(true);
          this.helloed = true;
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
              host: LAB ? 'dev' : 'board',  // 'dev': the widget dev window (the SDK then reports errors to it)
              kiosk: KIOSK                  // ChromeOS kiosk: links can't open new windows, no file access by default
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
            // (No icon from an uploaded file: markup in the board's own menu would be outside its seal.)
            return Object.assign(item, { icon: this.widget.sealed ? '' : safeSVG(i.icon), checked: typeof i.checked === 'boolean' ? i.checked : undefined, disabled: !!i.disabled, separator: !!i.separator });
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
      if (sameJSON(has ? map.get(this.ikey) : null, v) && (v === null || Known.has(key)) && !Writer.pending.has(key)) { this.ack(reqId, true); return; }   // (pending: not saved yet)
      if (kind === 'data' && has) BoardHistory.guardEmptied(this.ikey, map.get(this.ikey), v);   // e.g. a note cleared: keep a version first
      let p;
      if (v === null) { map.delete(this.ikey); p = Writer.del(key); }
      else { map.set(this.ikey, v); p = Writer.put(key, kind, v); }
      p.then(ok => (ok === false ? this.ack(reqId, false, null, 'Not saved yet') : this.ack(reqId, true)));   // (not saved: the board keeps it and tries again)
    }

    windowOp(op, args) {
      const inst = this.inst;
      if (!inst) return;
      if ((op === 'maximize' || op === 'restore' || op === 'close') && Lock.on()) return;   // windows locked (section 12b)
      const posOrNull = v => (typeof v === 'number' && v > 0 && isFinite(v)) ? v : null;
      switch (op) {
        case 'setSize': {
          const cw = posOrNull(args[0]), ch = posOrNull(args[1]);
          if (!cw || !ch) return;
          const view = boundsRect();
          const s = fitSize(cw, ch + TITLE_H, this.constraints(), view);
          const r = resolveMove({ x: inst.rect.x, y: inst.rect.y, w: s.w, h: s.h }, obstacles(this), view, screenPx(RESISTANCE.strong), S.settings.snapping);
          // (Windows locked: one that fills the board keeps filling it, and gets this size when restored. Section 12b.)
          saveInst(this.ikey, Object.assign({}, inst, { rect: r, maximized: !!inst.maximized && Lock.on() }));
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
    // An uploaded file's window (sealed off, see DevFiles) has an opaque origin, 'null': heard only from its own frame.
    const sealed = ORIGIN !== '*' && e.origin === 'null';
    if (ORIGIN !== '*' && e.origin !== location.origin && !sealed) return;
    for (const w of S.wins.values()) {
      // (Never from a district app's page: it is another site, even where the origin can't be checked: file://.)
      if (w.iframe && w.iframe.contentWindow === e.source) { if (!w.widget.external && (!sealed || w.widget.sealed)) w.handle(m); return; }
    }
  });

  // "21Sketch", "21Sketch and 21Timer", "21DocCam, 21Sketch and 21Timer".
  const andList = names => names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';

  // District apps (registry `external`) come from their own sites. Without a connection, a window shows one only if
  // the app saved its own copy on this device, and the board can't tell whether it did (the page is another site's:
  // the app or the browser's "no connection" page, it can't see which). So it only says so, beside the window's
  // name and once in a toast, never over the app, and it never asks the sites whether they are there.
  const AppsOffline = {
    told: new Set(),   // the apps the toast named since the connection went
    init() {
      const update = () => {
        if (navigator.onLine !== false) this.told.clear();
        for (const w of S.wins.values()) if (w.widget.external) w.renderTitle();
        this.soon();
      };
      window.addEventListener('offline', update);
      window.addEventListener('online', update);
    },
    soon() { clearTimeout(this.t); this.t = setTimeout(() => this.tell(), 300); },   // (windows opened together: one toast)
    tell() {
      if (navigator.onLine !== false) return;
      const names = Array.from(new Set(Array.from(S.wins.values()).filter(w => w.widget.external && !this.told.has(w.widget.name)).map(w => w.widget.name)));
      if (!names.length) return;
      names.forEach(n => this.told.add(n));
      toast(`${andList(names)} ${names.length > 1 ? 'need' : 'needs'} a connection, unless ${names.length > 1 ? 'they’re' : 'it’s'} saved on this device for offline use.`, { timeout: 8000 });
    }
  };

  // Erasing or exporting the board doesn't reach a district app's work (the app keeps it on the device): a sentence
  // that says so, for those dialogs, when the board has a window of one. Else ''.
  function appsOwnWork(notHere, todo) {
    const names = Array.from(new Set(Array.from(S.insts.values()).map(i => getWidget(i.widgetId)).filter(w => w && w.external).map(w => w.name)));
    if (!names.length) return '';
    return ` ${andList(names)} ${names.length > 1 ? 'keep their' : 'keeps its'} own work: it isn’t ${notHere}. ${todo} in ${names.length > 1 ? 'each app' : names[0]} itself.`;
  }

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
    coverApps();
    if (S.deselected) top = null;
    if (S.focused === top) return;
    const prev = S.wins.get(S.focused);
    S.focused = top; // update first, so the old window's info reports focused: false
    if (prev) { prev.el.classList.remove('focused'); prev.post('blur'); prev.notifyInfo(); }
    const cur = S.wins.get(top);
    if (cur) { cur.el.classList.add('focused'); cur.post('focus'); cur.notifyInfo(); }
  }

  // A district app's page doesn't tell the board it was tapped (21Sketch's drawing surface keeps even the keyboard
  // focus out). So one that a window in front of it overlaps is covered: a tap there brings it forward and goes no
  // further. One that nothing overlaps takes every tap itself (two people drawing in it and using another window
  // lose no strokes), though the board's outline may then stay on the other window.
  function coverApps() {
    const z = w => (w.inst && w.inst.z) || 0;
    for (const w of S.wins.values()) {
      if (w.shieldEl) w.shieldEl.hidden = !w.disp || !Array.from(S.wins.values()).some(o => o !== w && o.disp && z(o) > z(w) && overlaps(o.disp, w.disp));
    }
  }

  // Open a widget: reopen its lowest-numbered closed instance (restoring its data),
  // or create the next instance number if every existing one is already open.
  function openWidget(widgetId, opts = {}) {
    const widget = getWidget(widgetId);
    if (!widget || !Store.loaded) return null;   // (not before the stored board has been read: its windows aren't known yet)
    const mine = Array.from(S.insts.values()).filter(i => i.widgetId === widgetId).sort((a, b) => a.n - b.n);
    // One window only (registry `single`, e.g. a district app: a second 21Sketch would show the same drawing, a
    // second 21DocCam would start the camera again): the one there is comes forward, or opens again.
    const shown = widget.single && mine.find(i => i.open);
    if (shown) {
      const ik = ikeyOf(widgetId, shown.n), w = S.wins.get(ik);
      focusWin(ik);
      if (w) w.attention();
      return ik;
    }
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
        toast(`${widget ? widget.name : 'Widget'} closed. ` + (SaveNote.state() || (widget && widget.external) ? 'Open it again from the Widget Picker.' : 'Its content is saved — open it again from the Widget Picker.'));
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
    const was = new Map(open.map(k => [k, Object.assign({}, S.insts.get(k))]));
    await Promise.all(open.map(k => closeWin(k, { quiet: true })));
    // Undo reopens those windows where they were (their content was never touched; a running timer keeps running).
    if (open.length) toast(`Closed ${open.length} window${open.length === 1 ? '' : 's'}.` + (SaveNote.state() ? '' : ' Their content is saved.'), { action: 'Undo', timeout: 20000, onAction: async () => {
      for (const [k, inst] of was) { const cur = S.insts.get(k); if (cur && !cur.open) await saveInst(k, Object.assign({}, cur, { open: true, rect: inst.rect, maximized: inst.maximized, z: maxZ() + 1 })); reconcileWin(k); }
      afterBulkApply();
      void beforeId;
    } });
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
      if (this.holds(win) || Lock.refuse()) return false;   // (windows locked: the widget keeps the press, section 12b)
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
        // A press on a title bar (or on the window's name under the top handle) may be a tap that slid a little.
        // Past that, the window is moved from where the press began, so it is under the pointer at once.
        const slop = it.kind === 'title' || it.onLabel ? TAP_SLOP[it.type] || DRAG_THRESHOLD : DRAG_THRESHOLD;
        if (Math.hypot(it.x - it.sx, it.y - it.sy) < slop) return;
        if (it.refused || Lock.refuse()) { it.refused = true; return; }   // windows locked (section 12b)
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
      if (it.refused) cancelled = true;   // (a refused drag is no tap either)
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
          if (now - win.lastTitleTap < 350) { win.lastTitleTap = 0; if (!Lock.refuse()) setMaximized(win.ikey, !win.inst.maximized); }
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
          if (Math.hypot(c.x - two.start.x, c.y - two.start.y) < TAP_SLOP.touch) return;
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
        if (Math.hypot(p.x - s.x, p.y - s.y) < (TAP_SLOP[s.type] || TAP_SLOP.mouse)) return;
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
      Pages.closeMenu();
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
      // The panel is drawn at Zoom.ui. Five columns where the screen has room for them and the row below (the
      // controls, then ‹ Page ›) beside the other corner's ▦ button; else four or three, with ‹ Page › on a row of
      // its own above the controls.
      const room = window.innerWidth / Zoom.ui, cols = room >= 600 ? 5 : room < 440 ? 3 : 4;
      this.el.style.setProperty('--cols', String(cols));
      this.el.classList.toggle('narrow', cols < 5);
      if (Lock.on()) { $('.panel-widgets', this.el).innerHTML = Lock.pickerNote(); return; }   // windows locked: none opens (section 12b)
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
      Pages.renderControls(this.el);
      set('export', 'export', 'Export board');
      set('import', 'import', 'Import board').hidden = Lock.on();   // (windows locked: section 12b)
      set('quit', 'quit', 'Quit 21Board').hidden = !KIOSK;
      set('theme', dark ? 'sun' : 'moon', dark ? 'Light mode' : 'Dark mode');
      const fs = set('fullscreen', fsOn ? 'fullscreenExit' : 'fullscreen', fsOn ? 'Exit fullscreen' : 'Fullscreen');
      fs.hidden = KIOSK || !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
      // A new version is waiting (section 15): a dot on the ▦ buttons and on Settings, where "Update now" is.
      const update = !!S.sw.updateReady, ready = update ? ' (a new version is ready)' : '';
      const gear = set('settings', 'gear', 'Settings' + ready);
      for (const b of [this.btns.left, this.btns.right, gear]) {
        let dot = $('.dot', b);
        if (update && !dot) { dot = document.createElement('span'); dot.className = 'dot'; b.appendChild(dot); }
        if (!update && dot) dot.remove();
        if (b === gear) continue;
        b.setAttribute('aria-label', 'Widgets and settings' + ready);
        if (update) b.title = 'A new version of 21Board is ready: see Settings'; else b.removeAttribute('title');
      }
    },

    control(ctl) {
      const side = this.side || 'left';
      switch (ctl) {
        case 'export': this.close(); exportFlow(); break;
        case 'quit': this.close(); quitApp(); break;
        case 'import': this.close(); $('#import-input').click(); break;
        case 'theme': updateSettings({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' }); this.renderControls(); break;
        case 'fullscreen': toggleFullscreen(); break;
        case 'settings': this.close(); Settings.open(side); break;
        case 'prev': Pages.step(-1); break;
        case 'next': Pages.step(1); break;
        case 'pages': Pages.toggleMenu(); break;
      }
    }
  };

  // Kiosk mode: Quit closes the app (on ChromeOS this ends the kiosk session; an auto-launched kiosk starts again).
  // Everything is saved first. A window the browser won't let a page close (a normal tab) gets a message instead.
  async function quitApp() {
    const unsaved = SaveNote.state();
    const ok = await dialog({ title: 'Quit 21Board?', message: !unsaved ? 'Your board is saved on this device and will be here next time.'
      : unsaved === 'unsaved' ? 'Your latest changes aren’t saved on this device yet. If you quit now, they will be gone.' : 'This board isn’t being saved. If you quit now, it will be gone.',
      actions: [{ label: 'Quit', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
    if (!ok) return;
    closePopups();
    if (Writer.failing) Writer.retry();   // (one more try before leaving)
    await Writer.settled(3000);
    if (BoardHistory.dirty) { try { await Promise.race([BoardHistory.check(true), sleep(2000)]); } catch (e) { /* quit anyway */ } }
    window.close();
    const refused = () => toast(`21Board can’t close itself right now.${SaveNote.state() ? '' : ' Your board is saved.'} To leave, restart the device or ask your school’s IT.`, { timeout: 10000 });
    if (!window.closed) setTimeout(() => { if (!window.closed) refused(); }, 600);
  }

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
        const w = this.win, act = b.dataset.act, keys = e.detail === 0;   // (0: Enter or Space, not a tap)
        this.act(act, b.dataset.id);
        if (!keys || !w) return;
        // Chosen from the keyboard: the keyboard goes on from the menu's first item if it stays open (Reset asks first),
        // or from the window's name, as after Escape (Earlier versions… opens a sheet that takes it).
        if (this.win === w) { if (!this.el.contains(document.activeElement)) { const f = $('button:not(:disabled)', this.el); if (f) f.focus(); } }
        else if (S.wins.get(w.ikey) === w && act !== 'history') w.labelEl.focus();
      });
      // The arrow keys (and Home, End) go from item to item, as in any menu. Tab goes on working too.
      this.el.addEventListener('keydown', e => {
        if (!/^(ArrowDown|ArrowUp|Home|End)$/.test(e.key)) return;
        const all = $$('button:not(:disabled)', this.el);
        if (!all.length) return;
        e.preventDefault();
        const i = all.indexOf(document.activeElement), last = all.length - 1;
        all[e.key === 'Home' ? 0 : e.key === 'End' ? last : e.key === 'ArrowDown' ? (i < last ? i + 1 : 0) : (i > 0 ? i - 1 : last)].focus();
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
        this.el.innerHTML = `<div class="menu-confirm"><b>Reset ${esc(name)}?</b><br>This clears everything saved in this window and returns it to its starting size.${BoardHistory.enabled() ? ' Board history keeps a copy.' : ''}</div>` +
          item('reset-yes', svg('reset'), 'Reset', '', 'danger') + item('reset-no', '', 'Cancel');
        return;
      }
      // A heading and the items under it (up to a line or the next heading) are one group, named by the heading, so a
      // screen reader says "Winners each time, 3, checked". (The group takes no room: .menu-group is display: contents.)
      let html = '', group = false;
      const endGroup = () => { if (group) html += '</div>'; group = false; };
      for (const i of w.menuItems) {
        if (i.separator) { endGroup(); html += '<div class="menu-sep"></div>'; continue; }
        if (i.heading) { endGroup(); html += `<div class="menu-group" role="group" aria-label="${esc(i.label)}"><div class="menu-heading" aria-hidden="true">${esc(i.label)}</div>`; group = true; continue; }
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
      endGroup();
      if (html) html += '<div class="menu-sep"></div>';
      const locked = Lock.on();   // (windows locked: the widget's own items, and a district app's, section 12b)
      if (!locked) html += w.inst.maximized ? item('restore', svg('restore'), 'Restore size') : item('maximize', svg('maximize'), 'Fill the board');
      if (w.widget.external) {
        // A district app keeps its own work: there is none here to reset or to go back to. Reload: a window that
        // opened while the site couldn't be reached stays on the browser's error page. (A kiosk can't open tabs.)
        html += item('reload', svg('reload'), `Reload ${w.widget.name}`);
        if (!KIOSK) html += item('own', svg('external'), `Open ${w.widget.name} on its own`);
      } else if (!locked) {
        if (BoardHistory.hasWindow(w.ikey)) html += item('history', svg('history'), 'Earlier versions…');
        html += item('reset', svg('reset'), 'Reset');
      }
      html += locked ? (w.widget.external ? '<div class="menu-sep"></div>' : '') + Lock.menuNote() : item('close', svg('close'), 'Close');
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
        this.el.style.gridTemplateRows = `repeat(${Math.ceil($$(':scope > :not(.menu-group), .menu-group > *', this.el).length / 2)}, auto)`;
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
      if (Lock.on() && /^(maximize|restore|reset|reset-yes|history|close)$/.test(act)) { this.close(); return; }   // (locked meanwhile)
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
        case 'own': this.close(); if (w.widget.external) window.open(w.widget.entry, '_blank', 'noopener'); break;
        case 'reload': this.close(); if (w.widget.external) { w.reload(); focusWin(w.ikey); } break;
        case 'reset-no': this.confirming = false; this.render(); this.position(); break;
        case 'close': this.close(); closeWin(w.ikey); break;
      }
    }
  };

  // =====================================================================
  // 11b. Pages: more than one board
  // ---------------------------------------------------------------------
  // Each page is a board of its own (board:<b>, inst:<b>:…, see section 3); the teacher flips between them with
  // ‹ Page › in the Widget Picker. Every tab on this device shows the same page (settings.activeBoard): a tab that
  // sees it change goes there too. settings.boards keeps their order. Going to another page: its widgets save what
  // they hold (as when a window closes), the Writer stores it under the page left (every change carries its board's
  // key, so none can land on the other page), board history keeps a version if one is due, and the other page's
  // records are read. A widget on a page that isn't shown doesn't run (a Timer's end time is a time of day: it
  // shows the right time when its page comes back, but its alarm doesn't ring while away).
  // A deleted page waits in settings.deletedBoards while its Undo is offered; then its records and board history
  // go (purge). One left there goes at the next start, once its Undo is over (another tab may still offer it:
  // settings.deletedAt says when it was deleted). A page's id is never used again
  // (settings.lastBoard): nothing left of a deleted page can turn up in a new one.
  // =====================================================================
  const PAGE_UNDO_MS = 20000;
  const Pages = {
    info: new Map(),   // board id -> { name, uid }: every page whose board record this tab has read
    busy: false,       // going to another page (or adding or deleting one) now
    gen: 0,            // counts page changes: what was read before one isn't used after it (buildExport)
    purges: new Map(), // board id -> timer: its records go once its Undo is over
    // key -> { type, value }: the other pages' records, as last read. If the browser throws the database away
    // (Store.lost), they are written back with the page shown (heldRecords); a backup uses them for what can't
    // be read (buildAllExport). Kept up to date by applyRecord.
    held: new Map(),
    hold(key, rec) { const k = Keys.parse(key); if (rec && k.board && k.board !== S.boardId) this.held.set(key, { type: rec.type || k.kind, value: rec.value }); else this.held.delete(key); },
    menuEl: null, open: false,
    enabled() { return !LAB; },
    note(b, value) { if (!Number.isInteger(b) || b < 1) return; if (value) this.info.set(b, { name: String(value.name || 'My Board'), uid: value.uid || null }); else this.info.delete(b); },
    gone(st = S.settings) { return new Set((Array.isArray(st.deletedBoards) ? st.deletedBoards : []).map(Number)); },
    // The settings for these pages deleted now (add) or not deleted after all, or gone for good (remove).
    goneWith(add = [], remove = []) {
      const gone = this.gone(), at = Object.assign({}, S.settings.deletedAt), now = Date.now();
      add.forEach(b => { gone.add(b); at[b] = now; });
      remove.forEach(b => gone.delete(b));
      for (const k of Object.keys(at)) if (!gone.has(+k)) delete at[k];
      return { deletedBoards: Array.from(gone), deletedAt: at };
    },
    // The pages, in order: those in settings.boards that exist, then any other this device has (a page whose
    // place in the order was lost is shown, never hidden).
    ids(st = S.settings, have = b => this.info.has(b) || b === S.boardId) {
      const gone = this.gone(st), out = [];
      const add = b => { if (Number.isInteger(b) && b > 0 && !gone.has(b) && !out.includes(b) && have(b)) out.push(b); };
      (Array.isArray(st.boards) ? st.boards : []).forEach(add);
      Array.from(this.info.keys()).sort((a, b) => a - b).forEach(add);
      return out;
    },
    // At start-up (and after Erase): the page to show, from the records just read. With none (all erased), the
    // page shown stays, so that its board history ("Before erasing everything") is still this page's.
    pick(recs) {
      const sr = recs.find(r => r.key === Keys.settings), st = Object.assign({}, DEFAULT_SETTINGS, (sr && sr.value) || {});
      const have = new Set();
      for (const r of recs) { const k = Keys.parse(r.key); if (k.kind === 'board') have.add(k.board); }
      const ids = this.ids(st, b => have.has(b));
      return ids.includes(+st.activeBoard) ? +st.activeBoard : ids[0] || (have.size ? Math.min(...have) : S.boardId);
    },
    pos(b = S.boardId) { return this.ids().indexOf(b); },
    // The other page here that is this board (board.uid), if any: two pages never share one, or both would send
    // to the same file in the Google Drive folder.
    owner(uid) { if (!uid) return 0; for (const b of this.ids()) if (b !== S.boardId && (this.info.get(b) || {}).uid === uid) return b; return 0; },
    name(b) { return b === S.boardId ? S.board.name : (this.info.get(b) || {}).name || 'Page'; },
    // "Page 2 · Math" (just "Page 2" for a page with that name).
    label(b = S.boardId) { const n = this.pos(b) + 1, nm = this.name(b); return nm === `Page ${n}` ? nm : `Page ${n} · ${nm}`; },
    async nextId() {
      let m = Math.max(1, +S.settings.lastBoard || 1, S.boardId, ...this.info.keys(), ...this.gone(), await BoardHistory.maxBoard());
      for (const key of Known.keys()) { const k = Keys.parse(key); if (k.board > m) m = k.board; }
      return m + 1;
    },

    // ---- going to another page
    // opts.follow: another tab went there (this one doesn't say so again); opts.quiet: no label on the board.
    async go(b, opts = {}) {
      if (!Store.loaded || (this.busy && !opts.inner)) return false;
      if (b === S.boardId) return true;
      if (Inter.active) { toast('Finish moving windows first.'); return false; }
      const own = !opts.inner;
      if (own) this.busy = true;
      try {
        // (Google Drive folder: a change waiting to be sent automatically goes first; no send starts with one page
        // and writes as another: see Link.leaving and Link.swap.)
        if (Link.supported) await Link.leaving((this.info.get(b) || {}).uid || null);
        await Link.swap(async () => { await this.leave(); await this.show(b, opts); });
      } finally { if (own) this.busy = false; }
      if (!opts.follow && S.settings.activeBoard !== S.boardId) updateSettings({ activeBoard: S.boardId });
      if (Link.supported) { Link.computeOffer(); if (Link.st.auto) Link.changed([Keys.board(S.boardId)]); }
      this.follow();   // (another tab may have gone elsewhere meanwhile)
      return S.boardId === b;
    },
    async leave() {
      // (A field being typed in, such as this page's name in Settings, is saved first, to this page.)
      const typing = document.activeElement;
      if (typing && typing.matches('input, textarea, select')) typing.blur();
      Menu.close(); this.closeMenu(); Settings.close(); HistorySheet.close();
      Array.from($('#toasts').children).forEach(t => { if (t.board) t.remove2(); });   // (their Undo was for this page)
      // Each widget saves what it holds, as when its window closes (see closeWin).
      const live = Array.from(S.wins.values()).filter(w => w.connected);
      live.forEach(w => w.post('beforeclose'));
      if (live.length) await sleep(120);
      await Writer.settled(2000);
      if (BoardHistory.dirty) { try { await Promise.race([BoardHistory.check(true), sleep(2000)]); } catch (e) { /* go on */ } }
    },
    async show(b, opts) {
      this.gen++;
      S.boardId = b;
      BoardHistory.switched();
      await rebuildAll({ pending: true });
      if (!Known.has(Keys.board(b)) && !Writer.pending.has(Keys.board(b))) Writer.put(Keys.board(b), 'board', S.board);
      await BoardHistory.reload();
      HistorySheet.refresh(); updateHint();
      Picker.renderControls();
      if (!opts.quiet) this.flash();
    },
    // Another tab went to another page: this one goes too (once nothing is being moved).
    follow() {
      if (!this.enabled() || !Store.loaded || this.busy || this.followT) return;
      const to = +S.settings.activeBoard;
      if (to === S.boardId || !this.ids().includes(to)) return;
      this.followT = setTimeout(async () => {
        this.followT = 0;
        if (Inter.active) { setTimeout(() => this.follow(), 500); return; }
        const t = +S.settings.activeBoard;
        if (t !== S.boardId && this.ids().includes(t)) await this.go(t, { follow: true });
      }, 0);
    },
    // "Page 2 · Math" in the middle of the board for a moment.
    flash() {
      const el = $('#page-flash');
      if (!el) return;
      el.textContent = this.label();
      const v = viewRect();
      el.style.left = (Zoom.ox + (v.x + v.w / 2) * Zoom.s) / Zoom.ui + 'px';
      el.style.top = (Zoom.oy + (v.y + v.h / 2) * Zoom.s) / Zoom.ui + 'px';
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add('on');
      clearTimeout(this.flashT); clearTimeout(this.flashT2);
      this.flashT = setTimeout(() => { el.classList.remove('on'); this.flashT2 = setTimeout(() => { el.hidden = true; }, 400); }, 1100);
    },

    // ---- adding, duplicating, renaming, moving, deleting
    // A new page right after this one (opts.after: after that page; opts.end: at the end), and go there. It gets
    // this page's size of windows and menus, shape and background color and pattern (not the photo).
    async create(opts = {}) {
      if (!Store.loaded || Store.failed === 'unopened') return null;
      const id = await this.nextId(), order = this.ids();
      const at = opts.end ? order.length : order.indexOf(opts.after || S.boardId) + 1;
      order.splice(at, 0, id);
      const board = Object.assign(defaultBoard(id), { name: opts.name || `Page ${at + 1}`, uid: opts.uid || newId(),
        background: clone(S.board.background) || { color: null, pattern: 'none' }, scale: boardScale(), shape: freeShape() ? 'free' : '16:9', layout: canvasFor(boardScale()) });
      this.note(id, board);
      updateSettings({ boards: order, lastBoard: Math.max(id, +S.settings.lastBoard || 1) });
      await Writer.put(Keys.board(id), 'board', board);
      if (await this.go(id, { inner: true, quiet: opts.quiet })) return id;
      await this.discard([id]);   // (it couldn't be shown, e.g. a window was being moved: not left behind, empty)
      return null;
    },
    async add() {
      if (this.busy) return;
      this.busy = true;
      try { if (await this.create()) toast(`${this.label()} is ready.`); } finally { this.busy = false; }
      Picker.renderControls();
    },
    // Pages from a file (Import: "Open as a new page", an all-pages backup): each one a new page. Returns their ids
    // (also in opts.made as they are made, so that a page made before a failure is known). opts.reuse: pages
    // about to be replaced, whose board ids (board.uid) the file's pages may take over: a restored backup is
    // the same boards as before (in the Google Drive folder, too).
    async addFrom(list, opts = {}) {
      const made = opts.made || [], reuse = opts.reuse || [];
      let after = opts.end ? null : S.boardId;
      for (const p of list) {
        const uid = p.board.uid && !Array.from(this.info).some(([b, i]) => i.uid === p.board.uid && !reuse.includes(b)) ? p.board.uid : newId();   // (one page per board id here)
        const id = await this.create({ after, end: !after, name: p.board.name || null, uid, quiet: true });
        if (!id) break;
        made.push(id); after = id;
        await applyImport(Object.assign({}, p, { theme: null, accent: null }), 'replace', { uid, keepCreated: true, photo: 'file', history: false, fresh: true });
      }
      return made;
    },
    async duplicate() {
      if (this.busy) return;
      this.busy = true;
      const made = [], from = S.boardId;
      let failed = null;
      try {
        const p = parseBoardFile(JSON.stringify(await buildExport('full')));
        p.board.name = `${S.board.name} (copy)`.slice(0, 60);
        await this.addFrom([p], { made });   // (a new board id: another board, as far as the Google Drive folder is concerned)
        if (made.length) { this.flash(); toast(`${this.label()} is a copy.`); }
      } catch (err) { console.error(err); failed = err; }
      finally { this.busy = false; }
      if (failed) { if (made.length) await this.discard(made, from); toast('Couldn’t copy this page: ' + ((failed && failed.message) || failed)); }   // (no half-made copy is left)
      Picker.renderControls();
    },
    async rename() {
      const asked = dialog({ title: 'Rename this page', input: { label: 'Name', maxlength: 60, placeholder: `Page ${this.pos() + 1}` },
        actions: [{ label: 'Rename', value: true, kind: 'primary' }, { label: 'Cancel', value: null }] });
      const field = $('#modal input');
      if (field) { field.value = S.board.name; field.select(); }
      const r = await asked;
      if (!r || !r.value || !r.text) return;
      updateBoard({ name: r.text.slice(0, 60) });
      Picker.renderControls();
      if (Settings.isOpen) Settings.render();
    },
    move(dir) {
      const order = this.ids(), i = order.indexOf(S.boardId), j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      updateSettings({ boards: order });
      Picker.renderControls();
      this.flash();
    },
    async remove() {
      const order = this.ids();
      if (order.length < 2 || this.busy) return;
      const b = S.boardId, name = S.board.name, at = order.indexOf(b);
      const n = Array.from(S.insts.values()).filter(i => i.open).length, saved = S.insts.size - n;
      const ok = await dialog({ title: `Delete “${name}”?`,
        message: `This page and its ${n ? `${n} window${n === 1 ? '' : 's'}` : 'background'}${saved ? ` (and ${saved} closed window${saved === 1 ? '' : 's'})` : ''} are deleted from this device.` + appsOwnWork('deleted here', 'Clear it'),
        actions: [{ label: 'Delete page', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
      if (!ok) return;
      this.busy = true;
      try {
        if (!await this.go(order[at + 1] || order[at - 1], { inner: true })) return;
        this.drop([b], `Deleted “${name}”.`);
      } finally { this.busy = false; }
      Picker.renderControls();
    },
    // These pages are deleted (their records stay until the Undo is over: see purge). Undo puts them back in their
    // places, and onUndo then runs (an import of several pages takes its own pages away again).
    drop(list, say, onUndo) {
      const before = this.ids();
      updateSettings(Object.assign({ boards: before.filter(x => !list.includes(x)) }, this.goneWith(list)));
      Picker.renderControls();
      for (const b of list) { clearTimeout(this.purges.get(b)); this.purges.set(b, setTimeout(() => this.purge([b]), PAGE_UNDO_MS + 3000)); }
      if (say) toast(say, { action: 'Undo', pages: true, timeout: PAGE_UNDO_MS, onAction: () => this.undrop(list, before, onUndo) });
    },
    async undrop(list, order, onUndo) {
      // (Its records must still be there: never an empty page in its place.)
      if (list.some(b => !this.purges.has(b)) || !await this.stored(list)) { toast('That can’t be undone anymore.'); return; }
      list.forEach(b => { clearTimeout(this.purges.get(b)); this.purges.delete(b); });
      const now = this.ids(), back = order.filter(b => list.includes(b) || now.includes(b));
      now.forEach(b => { if (!back.includes(b)) back.push(b); });
      updateSettings(Object.assign({ boards: back }, this.goneWith([], list)));
      if (onUndo) await onUndo();
      if (!this.ids().includes(S.boardId) || !onUndo) await this.go(list[0]);
      Picker.renderControls();
    },
    // Pages taken away again (the Undo of an import): deleted at once, with no question and no Undo of their own.
    async discard(list, back) {
      const left = this.ids().filter(b => !list.includes(b));
      if (!left.length) return;
      if (list.includes(S.boardId) && !await this.go(left.includes(back) ? back : left[0])) return;
      updateSettings(Object.assign({ boards: left }, this.goneWith(list)));
      Picker.renderControls();
      await this.purge(list);
    },
    // A deleted page's records and its board history go for good (its Undo is over). Its id is never used again.
    async purge(list) {
      list = list.filter(b => b !== S.boardId && !this.ids().includes(b));
      if (!list.length || !Store.loaded || Store.failed) return;
      list.forEach(b => { clearTimeout(this.purges.get(b)); this.purges.delete(b); });
      for (const key of Array.from(Writer.pending.keys())) if (list.includes(Keys.parse(key).board)) Writer.drop(key);   // (never written back after)
      const keys = Array.from(Known.keys()).filter(k => list.includes(Keys.parse(k).board));
      try {
        await Store.tx('readwrite', s => {
          for (const b of list) {
            s.delete(Keys.board(b));
            for (const kind of ['inst', 'data', 'conf', 'media']) s.delete(IDBKeyRange.bound(`${kind}:${b}:`, `${kind}:${b}:￿`));
          }
        });
      } catch (err) { console.warn('21Board: a deleted page couldn’t be cleared yet', err); return; }
      keys.forEach(k => { Known.delete(k); this.held.delete(k); }); list.forEach(b => this.info.delete(b));
      if (keys.length) Sync.announce(keys);
      for (const b of list) await BoardHistory.purgeBoard(b);
      updateSettings(this.goneWith([], list));
    },
    // At start-up: pages deleted before (in a tab that may still be offering their Undo) go once it is over.
    purgeLater() {
      const at = S.settings.deletedAt || {};
      for (const b of this.gone()) {
        if (this.purges.has(b)) continue;
        this.purges.set(b, setTimeout(() => { this.purges.delete(b); this.purge([b]); }, Math.max(3000, (+at[b] || 0) + PAGE_UNDO_MS + 3000 - Date.now())));
      }
    },
    // Whether these pages' board records are all still stored (another tab may have cleared them).
    async stored(list) {
      try { return (await Store.getMany(list.map(b => Keys.board(b)))).every(Boolean); }
      catch (e) { return list.every(b => Known.has(Keys.board(b))); }
    },

    // ---- the Pages menu (above the page indicator in the Widget Picker)
    initMenu() {
      this.menuEl = $('#pages-menu');
      if (!this.menuEl) return;
      this.menuEl.addEventListener('click', e => {
        const t = e.target.closest('[data-act]');
        if (!t || t.disabled) return;
        this.closeMenu();
        const act = t.dataset.act;
        if (act === 'go') this.go(+t.dataset.id);
        else if (act === 'new') this.add();
        else if (act === 'dup') this.duplicate();
        else if (act === 'rename') this.rename();
        else if (act === 'left') this.move(-1);
        else if (act === 'right') this.move(1);
        else if (act === 'delete') this.remove();
      });
    },
    toggleMenu() { if (this.open) this.closeMenu(); else this.openMenu(); },
    openMenu() {
      if (!this.menuEl) return;
      Menu.close();
      const ids = this.ids(), i = ids.indexOf(S.boardId);
      const item = (act, icon, label, extra = '', cls = '') =>
        `<button class="menu-item ${cls}" role="menuitem" data-act="${act}" ${extra}><span class="icon-slot">${icon}</span><span class="label">${esc(label)}</span></button>`;
      this.menuEl.innerHTML = '<div class="menu-heading">Pages</div>' + ids.map((b, n) =>
        `<button class="menu-item page-item" role="menuitemradio" aria-checked="${b === S.boardId}" data-act="go" data-id="${b}"><span class="icon-slot page-num">${n + 1}</span><span class="label">${esc(this.name(b))}</span>${b === S.boardId ? svg('check', 'check') : ''}</button>`).join('') +
        '<div class="menu-sep"></div>' +
        item('new', svg('plus'), 'New page') + item('dup', svg('copy'), 'Duplicate this page') + item('rename', svg('pencil'), 'Rename this page…') +
        (ids.length > 1 ? item('left', svg('back'), 'Move left', i < 1 ? 'disabled' : '') + item('right', svg('open'), 'Move right', i >= ids.length - 1 ? 'disabled' : '') : '') +
        item('delete', svg('trash'), 'Delete this page…', ids.length < 2 ? 'disabled' : '', 'danger');
      Lock.trimPages(this.menuEl);   // (windows locked: only going to a page, section 12b)
      this.open = true;
      this.menuEl.classList.add('open');
      const ind = $('[data-ctl="pages"]', Picker.el);
      if (ind) ind.setAttribute('aria-expanded', 'true');
      this.place();
      // Opened from the keyboard: it goes into the menu, at this page (as the window menu does).
      if (ind && document.activeElement === ind) ($('[aria-checked="true"]', this.menuEl) || $('button', this.menuEl)).focus();
    },
    closeMenu() {
      if (!this.open) return;
      this.open = false;
      this.menuEl.classList.remove('open');
      const ind = Picker.el && $('[data-ctl="pages"]', Picker.el);
      if (ind) ind.setAttribute('aria-expanded', 'false');
    },
    // Above the indicator, as the window menu sits by its window's name (on screen, never scrolled).
    place() {
      const ind = $('[data-ctl="pages"]', Picker.el), el = this.menuEl;
      if (!ind || !el) return;
      const ui = Zoom.ui, a = ind.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, M = 8, GAP = 6;
      el.classList.remove('compact', 'tight');
      el.style.maxHeight = 'none';
      const size = () => ({ w: el.offsetWidth * ui, h: el.offsetHeight * ui });
      let m = size();
      if (m.h > a.top - GAP - M) { el.classList.add('compact'); m = size(); }
      if (m.h > a.top - GAP - M) { el.classList.add('tight'); m = size(); }
      el.style.maxHeight = '';
      const x = clamp(a.left + a.width / 2 - m.w / 2, M, vw - m.w - M);
      const y = Math.max(M, a.top - GAP - m.h);
      el.style.left = x / ui + 'px';
      el.style.top = Math.min(y, vh - m.h - M) / ui + 'px';
    },
    // The Widget Picker's ‹ Page › controls.
    renderControls(root) {
      const g = $('.page-ctl', root);
      if (!g) return;
      g.hidden = !this.enabled();
      if (g.hidden) return;
      const ids = this.ids(), i = Math.max(0, ids.indexOf(S.boardId)), last = i >= ids.length - 1, add = last && !Lock.on();   // (locked: no new page, section 12b)
      const prev = $('[data-ctl="prev"]', g), next = $('[data-ctl="next"]', g), ind = $('[data-ctl="pages"]', g);
      prev.innerHTML = svg('chevLeft'); prev.disabled = i === 0;
      prev.title = i === 0 ? 'This is the first page' : `Go to page ${i}`; prev.setAttribute('aria-label', 'Previous page');
      next.innerHTML = svg(add ? 'plus' : 'chevRight'); next.disabled = last && !add;
      next.title = add ? 'New page' : last ? 'This is the last page' : `Go to page ${i + 2}`; next.setAttribute('aria-label', add ? 'New page' : 'Next page');
      next.classList.toggle('add', add);
      ind.innerHTML = `<small>Page</small><b>${i + 1} of ${ids.length}</b>`;
      ind.title = `Pages: ${this.name(S.boardId)}`; ind.setAttribute('aria-label', `Page ${i + 1} of ${ids.length}, ${this.name(S.boardId)}. Pages menu`);
    },
    step(dir) {
      const ids = this.ids(), i = ids.indexOf(S.boardId);
      if (dir > 0 && i >= ids.length - 1) return Lock.on() ? null : this.add();
      const to = ids[i + dir];
      if (to) this.go(to);
    }
  };

  // =====================================================================
  // 12. Settings
  // =====================================================================
  // Settings → Appearance → Background: a preview shaped like the board, then Color, Pattern and Photo. It's this
  // board's background (board.background, and its photo in media:<b>:background*).
  // =====================================================================
  // 12b. Classroom features: lock windows, keep the screen on, clock in the corner, letters
  // ---------------------------------------------------------------------
  // Each feature keeps its code in its own part below and is wired in through these hooks:
  // applySettings() calls applyClassroom(); Settings.render shows the rows; Settings.act and its change
  // listener pass actions on. All four settings belong to this device (DEFAULT_SETTINGS, "Classroom features").

  function applyClassroom() {
    applyLock();
    applyAwake();
    applyLetters();   // (before the clock, which measures its text)
    applyClock();
  }

  function classroomSettings(sw, seg) {
    const rows = lockSettings(sw, seg) + awakeSettings(sw, seg);
    return rows ? `<h3>Classroom</h3>${rows}` : '';
  }

  function classroomAct(act, val) {
    return lockAct(act, val) || awakeAct(act, val) || clockAct(act, val) || letterAct(act, val);
  }

  function classroomChange(el) {
    awakeChange(el);
  }

  // ---- Lock windows in place
  // settings.locked: the windows stay where the teacher put them, and students still use what's in them (start a
  // timer, roll the dice, type in a note). It's in the settings record, so every tab on this device follows it, and
  // a reload and kiosk mode keep it. While it's on:
  // - no moving windows (title bar, from inside, two fingers: Inter refuses them), no resizing (no handles), no Fill
  //   the board by two taps on a title bar. A refused gesture says why, at most every few seconds (refuse).
  // - a window's menu keeps the widget's own items (and a district app's Reload and Open … on its own), nothing that
  //   fills, resets, goes back or closes. A widget's own calls to close, fill or restore its window are refused, as
  //   other window calls it can't make are (setSize and setMinSize still work: its editor still gets room).
  // - the Widget Picker opens no windows and has no Import: it says how to unlock instead. ‹ Page › still flips
  //   pages (teachers do, mid-lesson), but there's no new page, and the Pages menu only goes to a page.
  // - a file dropped on the board or opened with 21Board asks to unlock first (it would change the windows), and so
  //   does Load on the Google Drive folder's message on the board ("“Room 12” was updated on my laptop").
  // - Settings (where the switch is) and Board history stay the teacher's: only Close all, one tap with no question,
  //   waits. (Opening or deleting a saved window there, or going back to a version, still works.)
  // To unlock: press and hold ▦ for 2 seconds, with a ring filling around it (let go sooner: a tap, as before; slide
  // off: nothing), or turn the switch off in Settings (the keyboard's way). Not in the widget dev window.
  const LOCK_HOLD_MS = 2000;
  const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  // ▦ in a sentence: the button's own picture.
  const LOCK_KEY = `<svg class="fill lock-waffle" viewBox="0 0 24 24" role="img" aria-label="the Widget Picker button">${ICONS.waffle}</svg>`;
  const LOCK_HOW = `Hold ${LOCK_KEY} for 2 seconds to unlock.`;
  // The ring around ▦: a rounded square around the button's (3 px out, the same curve), from the top middle, clockwise.
  const LOCK_RING = 'M34 3H46A19 19 0 0 1 65 22V46A19 19 0 0 1 46 65H22A19 19 0 0 1 3 46V22A19 19 0 0 1 22 3Z';
  const Lock = {
    ready: false,
    was: false,      // what applyLock last saw
    hold: null,      // a press on ▦ while locked: { id, side, btn, at, state: 'holding' | 'off' | 'done', timer, raf, ring }
    eat: false,      // the browser's click after such a press (the press was answered when it ended)
    toldAt: 0,
    letting: false,  // "Unlock and open" a file: the lock goes once the teacher picks how to open it (letGo)
    on() { return !LAB && !!S.settings.locked; },
    // A move, resize or fill of a window: refused while locked (true), and said why, at most every 5 seconds.
    refuse() {
      if (!this.on()) return false;
      if (Date.now() - this.toldAt > 5000) {
        this.toldAt = Date.now();
        $('span', toast('Windows are locked. Hold ▦ for 2 seconds to unlock.')).innerHTML = 'Windows are locked. ' + LOCK_HOW;
      }
      return true;
    },
    // In the Widget Picker, in place of the widgets.
    pickerNote() { return `<div class="lock-note" role="note">${LOCK_ICON}<span><b>Windows are locked.</b> ${LOCK_HOW}</span></div>`; },
    // At the end of a window's menu, in place of Fill the board, Reset and Close.
    menuNote() { return `<div class="lock-note in-menu" role="note">${LOCK_ICON}<span>Windows are locked. ${LOCK_HOW}</span></div>`; },
    // The Pages menu: only going to a page (no new, copied, renamed, moved or deleted pages).
    trimPages(el) { if (this.on()) $$('.menu-sep, [data-act]:not([data-act="go"])', el).forEach(n => n.remove()); },
    // A file opened onto the board (dropped on it, or opened with 21Board) changes its windows: unlock first. The
    // lock goes when the teacher then picks how to open it (letGo): backing out of that question leaves it locked.
    // So does Load on the Google Drive folder's message on the board (verb 'load'; Link.load), which anyone can
    // tap. (Settings' own Load buttons are the teacher's, like the switch: they don't ask, and leave it locked.)
    async letIn(file, verb = 'open') {
      this.letting = false;
      if (!this.on()) return true;
      const yes = await dialog({ title: 'Windows are locked', message: `To ${verb} “${String(file && file.name || 'this file').replace(/\.21board$/i, '')}”, unlock the windows first. You can lock them again in Settings.`,
        actions: [{ label: `Unlock and ${verb}`, value: true, kind: 'primary' }, { label: 'Cancel', value: false }] });
      this.letting = !!yes;
      return !!yes;
    },
    letGo() {
      if (this.letting && this.on()) updateSettings({ locked: false });
      this.letting = false;
    },
    // Settings, while open: the switch and Close all, in place. Settings isn't drawn again while someone is in one of
    // its text or time boxes (Settings.render), but the lock can change meanwhile: ▦ held with a finger (which leaves
    // the focus in the box until it lets go), or another tab. Tapped, a switch showing the wrong state would do the
    // opposite of what it shows.
    paint() {
      if (!Settings.isOpen) return;
      const on = this.on(), sw = $('[data-act="lock-windows"]', Settings.body), all = $('[data-act="close-all"]', Settings.body);
      if (sw) { sw.classList.toggle('on', on); sw.setAttribute('aria-checked', String(on)); }
      if (all) { all.disabled = on; const hint = $('.hint', all.closest('.row')); if (hint) hint.textContent = closeAllHint(); }
    },

    // ---- press and hold ▦ to unlock
    init() {
      if (this.ready) return;
      this.ready = true;
      for (const side of ['left', 'right']) {
        const b = Picker.btns[side];
        b.addEventListener('pointerdown', e => this.press(e, side));
        b.addEventListener('contextmenu', e => { if (this.on() || this.hold) e.preventDefault(); });   // (a long press: no menu)
        b.addEventListener('lostpointercapture', e => this.release(e, true));   // (the browser took the press away: it ends here)
      }
      // (On the window: the press is captured by its button, and a release elsewhere must still be heard.)
      window.addEventListener('pointermove', e => this.slide(e), true);
      window.addEventListener('pointerup', e => this.release(e, false), true);
      window.addEventListener('pointercancel', e => this.release(e, true), true);
      window.addEventListener('click', e => {
        if (!this.eat || !e.target.closest || !e.target.closest('.picker-btn')) return;
        this.eat = false;
        e.preventDefault(); e.stopImmediatePropagation();
      }, true);
      // A locked empty page says so, in place of "Tap ▦ … to open a widget".
      const hint = $('#empty-hint .small');
      if (hint) hint.insertAdjacentHTML('afterend', `<div class="small lock-hint">Windows are locked. ${LOCK_HOW}</div>`);
    },
    press(e, side) {
      if (!e.isTrusted) return;   // (a script's press is no hold)
      this.eat = false;
      if (!this.on() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (this.hold && this.hold.state !== 'holding') this.hold = null;   // (over, but its release never came)
      if (this.hold) return;
      const btn = Picker.btns[side];
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const h = this.hold = { id: e.pointerId, side, btn, at: performance.now(), state: 'holding' };
      h.timer = setTimeout(() => this.done(h), LOCK_HOLD_MS);
      h.raf = requestAnimationFrame(() => this.draw(h));
    },
    // Sliding off the button: not a hold, and not a tap.
    slide(e) {
      const h = this.hold;
      if (!h || e.pointerId !== h.id || h.state !== 'holding') return;
      const r = h.btn.getBoundingClientRect(), m = 8;
      if (e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m) { h.state = 'off'; this.stop(h); }
    },
    release(e, cancelled) {
      const h = this.hold;
      if (!h || e.pointerId !== h.id) return;
      this.hold = null;
      if (h.state !== 'done') this.stop(h);
      // Answered here, whatever the browser makes of it (a click, or none after a long touch).
      this.eat = true;
      clearTimeout(this.eatT); this.eatT = setTimeout(() => { this.eat = false; }, 800);
      if (h.state === 'holding' && !cancelled) Picker.toggle(h.side);   // let go sooner: a tap, as before
    },
    done(h) {
      if (this.hold !== h || h.state !== 'holding') return;
      h.state = 'done';
      cancelAnimationFrame(h.raf);
      this.ring(h, 1);
      setTimeout(() => this.stop(h), 400);
      updateSettings({ locked: false });
      toast('Windows are unlocked. Lock them again in Settings.');
    },
    draw(h) {
      if (this.hold !== h || h.state !== 'holding') return;
      const t = Math.min(1, (performance.now() - h.at) / LOCK_HOLD_MS);
      // (None for a quick tap. With less motion: in four steps.)
      const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (t > 0.1) this.ring(h, calm ? Math.floor(t * 4) / 4 : t);
      h.raf = requestAnimationFrame(() => this.draw(h));
    },
    ring(h, t) {
      if (!h.ring) {
        h.ring = document.createElement('span');
        h.ring.className = 'lock-ring';
        h.ring.innerHTML = `<svg viewBox="0 0 68 68" aria-hidden="true"><path class="track" d="${LOCK_RING}"/><path class="fill" pathLength="100" d="${LOCK_RING}"/></svg>`;
        h.btn.appendChild(h.ring);
      }
      $('.fill', h.ring).style.strokeDasharray = `${(t * 100).toFixed(2)} 100`;
    },
    stop(h) {
      clearTimeout(h.timer); cancelAnimationFrame(h.raf);
      if (h.ring) { h.ring.remove(); h.ring = null; }
    }
  };

  function applyLock() {
    const on = Lock.on();
    Lock.init();
    document.body.classList.toggle('windows-locked', on);
    // A padlock on each ▦.
    for (const b of [Picker.btns.left, Picker.btns.right]) {
      let badge = $('.lock-badge', b);
      if (on && !badge) { badge = document.createElement('span'); badge.className = 'lock-badge'; badge.innerHTML = LOCK_ICON; b.appendChild(badge); }
      if (!on && badge) badge.remove();
      if (on) b.setAttribute('aria-description', 'Windows are locked. Press and hold for 2 seconds to unlock.'); else b.removeAttribute('aria-description');
    }
    Lock.paint();
    if (on === Lock.was) return;
    Lock.was = on;
    const h = Lock.hold;
    if (!on && h && h.state === 'holding') { h.state = 'off'; Lock.stop(h); }   // (unlocked meanwhile: that press is nothing now)
    if (on) {
      for (const key of Array.from(Inter.map.keys())) Inter.end({ pointerId: key }, true);   // (being moved here: it goes back)
      Menu.confirming = false;   // (Reset?)
    }
    if (Menu.win) { Menu.render(); Menu.position(); }
    Pages.closeMenu();
  }

  function lockSettings(sw) {
    if (LAB) return '';   // (the widget dev window: one widget, whose window its developer moves and resizes)
    return `<div class="row"><div><div class="lbl">Lock windows in place</div><div class="hint">Widgets still work, but windows can’t be moved, resized, closed or added from the board until you turn this off or hold ${LOCK_KEY} for 2 seconds.</div></div>${sw('lock-windows', Lock.on(), 'Lock windows in place')}</div>`;
  }

  // Settings → Close all: off while the windows are locked, saying why (Settings.render, Lock.paint).
  function closeAllHint() {
    return Lock.on() ? 'Windows are locked: turn off “Lock windows in place” first.' : SaveNote.state() ? 'Their content is kept while 21Board stays open.' : 'Content stays saved for next time.';
  }

  function lockAct(act) {
    if (act !== 'lock-windows' || LAB) return false;
    updateSettings({ locked: !Lock.on() });
    return true;
  }

  // ---- Keep the screen on
  // Settings → Classroom → "Keep the screen on": Off, While 21Board is showing, or School hours (From–To, Monday to
  // Friday, by this device's clock). A 20-minute reading timer or the day's schedule shouldn't vanish because a
  // Chromebook dims, and teachers can't change a managed device's power settings. So 21Board asks the browser for a
  // screen wake lock (navigator.wakeLock), which keeps the screen on while this page is on it. The browser lets the
  // lock go whenever the page is hidden (another tab, the lid closed), so it is asked for again when 21Board shows
  // again (visibilitychange, fullscreenchange), and every minute (the start and end of the school day, and a lock
  // the device took back). Outside school hours, when turned off and in the widget dev window it is let go: a
  // device left on overnight can sleep. It can't overrule IT's policy or a panel's own power settings, and some
  // browsers can't do it at all: Settings says what is true right now (Awake.status).
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const minutesOf = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  // "7:30 AM" (this device's way of writing a time) for minutes after midnight.
  const clockTime = m => new Date(2000, 0, 3, Math.floor(m / 60), m % 60).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const Awake = {
    lock: null,        // the WakeLockSentinel while the screen is kept on
    asking: false,     // a request is on its way
    refused: false,    // the device said no to the last request
    timer: 0,
    listening: false,
    supported: () => !!(navigator.wakeLock && typeof navigator.wakeLock.request === 'function'),
    mode: () => !LAB && (S.settings.awake === 'on' || S.settings.awake === 'hours') ? S.settings.awake : 'off',
    // School hours in minutes after midnight, or null while "To" isn't later than "From".
    hours() {
      const t = k => minutesOf(HHMM.test(S.settings[k]) ? S.settings[k] : DEFAULT_SETTINGS[k]);
      const from = t('awakeFrom'), to = t('awakeTo');
      return to > from ? { from, to } : null;
    },
    inHours(d = new Date()) {
      const h = this.hours(), m = d.getHours() * 60 + d.getMinutes(), day = d.getDay();
      return !!h && day >= 1 && day <= 5 && m >= h.from && m < h.to;
    },
    wanted() { const m = this.mode(); return m === 'on' || (m === 'hours' && this.inHours()); },
    check() {
      clearTimeout(this.timer);
      if (!this.listening && this.mode() !== 'off') {
        this.listening = true;
        const again = () => this.check();
        document.addEventListener('visibilitychange', again);
        document.addEventListener('fullscreenchange', again);
        document.addEventListener('webkitfullscreenchange', again);
      }
      // Again on the next minute: the school day may start or end, or the device may have taken the lock back.
      if (this.mode() !== 'off') this.timer = setTimeout(() => this.check(), 60000 - Date.now() % 60000);
      const want = this.wanted() && document.visibilityState === 'visible';
      if (want && !this.lock && !this.asking && this.supported()) this.request();
      else if (!want && this.lock) this.release();
      this.paint();
    },
    async request() {
      this.asking = true;
      let lock = null;
      try { lock = await navigator.wakeLock.request('screen'); this.refused = false; }
      catch (err) { this.refused = true; }   // (IT's policy, a battery saver, or a page that isn't showing)
      this.asking = false;
      if (lock) {
        // (Turned off, or hidden, while it was being asked for: let it go straight away.)
        if (this.lock || !this.wanted() || document.visibilityState !== 'visible') this.drop(lock);
        else {
          this.lock = lock;
          try { lock.addEventListener('release', () => { if (this.lock === lock) { this.lock = null; this.paint(); } }); } catch (e) { /* noticed on the next check */ }
        }
      }
      this.paint();
    },
    release() { const l = this.lock; this.lock = null; this.drop(l); },
    drop(l) { try { Promise.resolve(l.release()).catch(() => {}); } catch (e) { /* gone already */ } },
    // What is happening right now, for Settings: { dot: 'ok' | 'warn' | '', text }, or null (Off).
    status() {
      const m = this.mode(), h = this.hours();
      // (Browsers only offer it to pages served over https, or from this device: a school server on plain http gets none.)
      if (!this.supported()) return { dot: 'warn', text: window.isSecureContext === false ? 'Needs https to keep the screen on.' : 'This browser can’t keep the screen on.' };
      if (m === 'off') return null;
      if (m === 'hours' && !h) return { dot: 'warn', text: 'Not on: “To” needs to be later than “From”.' };
      if (m === 'hours' && !this.inHours()) return { dot: '', text: `Not now: outside school hours (${clockTime(h.from)}–${clockTime(h.to)}, Mon–Fri).` };
      if (this.lock) return { dot: 'ok', text: m === 'on' ? 'The screen stays on while 21Board is showing.' : `The screen stays on until ${clockTime(h.to)}, while 21Board is showing.` };
      if (this.refused) return { dot: 'warn', text: 'The device didn’t allow it. Its settings, or your school’s IT, may turn this off.' };
      return { dot: '', text: 'Turning on…' };
    },
    statusHTML() { const s = this.status(); return s ? `<span class="status-dot ${s.dot}"></span>${esc(s.text)}` : ''; },
    // Settings, while open: the status line and the "To" box, in place (not drawn again: a finger may be in a time box).
    paint() {
      if (!Settings.isOpen) return;
      const line = $('#set-awake-status', Settings.body), to = $('#set-awake-to', Settings.body);
      const html = this.statusHTML();   // (only when it changes: a screen reader reads the line out again)
      if (line && line.innerHTML !== html) { line.innerHTML = html; line.hidden = !html; }
      if (to) to.setAttribute('aria-invalid', String(!this.hours()));
    }
  };

  function applyAwake() { Awake.check(); }

  function awakeSettings(sw, seg) {
    if (LAB) return '';
    const st = S.settings, mode = Awake.mode(), status = Awake.statusHTML();
    const time = (id, key, label) => `<label class="awake-time"><span>${label}</span><input type="time" class="text-input" id="${id}" value="${esc(HHMM.test(st[key]) ? st[key] : DEFAULT_SETTINGS[key])}" required${key === 'awakeTo' && !Awake.hours() ? ' aria-invalid="true"' : ''}></label>`;
    return `<div class="row stack awake-row"><div><div class="lbl">Keep the screen on</div><div class="hint">Stops this device from dimming and going to sleep while 21Board is showing. With school hours, it can sleep at night and on weekends.</div></div>
      ${seg('awake', mode, [['off', 'Off'], ['on', 'While 21Board is showing'], ['hours', 'School hours']], !Awake.supported())}
      ${mode === 'hours' ? `<div class="awake-hours">${time('set-awake-from', 'awakeFrom', 'From')}${time('set-awake-to', 'awakeTo', 'To')}</div>
      <div class="hint">School days, Monday to Friday, by this device’s clock.</div>` : ''}
      <div class="awake-status" id="set-awake-status" aria-live="polite"${status ? '' : ' hidden'}>${status}</div></div>`;
  }

  function awakeAct(act, val) {
    if (act !== 'awake') return false;
    if (['off', 'on', 'hours'].includes(val)) updateSettings({ awake: val });
    return true;
  }

  // A time box: kept as soon as it holds a whole time, without drawing Settings again (Settings.keep), so the
  // teacher stays in the box: Awake.paint says what changed. (Typing with a keyboard, Chrome sends this change as
  // it moves on to the next part of the time, while the box doesn't have the focus, so Settings.render's own
  // "not under a time box" rule can't tell.)
  function awakeChange(el) {
    const key = { 'set-awake-from': 'awakeFrom', 'set-awake-to': 'awakeTo' }[el.id];
    if (!key || !HHMM.test(el.value) || el.value === S.settings[key]) return;   // (a box emptied halfway keeps the time it had)
    Settings.keep = true;
    try { updateSettings({ [key]: el.value }); } finally { Settings.keep = false; }
    Awake.paint();
  }

  // ---- Clock in the corner
  // Settings → Appearance → "Clock in the corner": Off, Time or Time and date (the default). A small clock beside a
  // Widget Picker button, on every board and page, without taking a window: teachers and students check the time all
  // day, a Clock window would have to be on every page, and in fullscreen the device's own clock is hidden.
  // Where: on the inner side of the ▦ button in the bottom right corner, or of the only one when Settings → Widget
  // Picker shows the controls in one corner. Bottom right is where Chromebooks (and Windows) show the time, so it's
  // where people already look for it. Drawn like ▦ and as tall, at the board's size (--ui, like the other chrome).
  // It never covers anything: taps go through it to the windows under it (pointer-events: none); toasts keep clear
  // of it (body.clock-on in index.html); it hides while its corner's Widget Picker is open or the other corner's
  // reaches it; and where the screen is too narrow, "Time and date" shows only the time, and the time hides
  // (CornerClock.place). It changes exactly on the minute, in this device's way of writing times.
  const CLOCK_GAP = 8;          // CSS px between the clock and what it must keep clear of
  const CLOCK_TOASTS = 320;     // CSS px of the bottom middle always left for toasts
  // Off, Time or Time and date. A value this release doesn't know (another release's: the page and this script can
  // be from different versions for a launch or two; or a damaged record) is the default, on the board and in Settings.
  const clockMode = () => ['off', 'time', 'date'].includes(S.settings.clock) ? S.settings.clock : DEFAULT_SETTINGS.clock;
  const CornerClock = {
    el: null, timer: 0, side: 'right', fit: '', bare: false, fmt: null,
    on: () => !LAB && clockMode() !== 'off',
    init() {
      const el = this.el = document.createElement('div');
      el.className = 'corner-clock';
      el.hidden = true;
      document.body.appendChild(el);
      // A page from before the clock (the page and this script can be from different versions for a launch or
      // two) has no styles for it: leave it out rather than show the time in the middle of nowhere.
      this.bare = getComputedStyle(el).position !== 'fixed';
      // The Widget Picker opening (and growing to its full size), and the shape tip coming and going: look again.
      const panel = $('#panel'), tip = $('#shape-hint');
      if (window.MutationObserver) {
        new MutationObserver(() => this.cover()).observe(panel, { attributes: true, attributeFilter: ['class'] });
        if (tip) new MutationObserver(() => this.place()).observe(tip, { attributes: true, attributeFilter: ['hidden', 'style'] });
      }
      panel.addEventListener('animationend', () => this.cover());
      // Timers sleep while the page is hidden or the device is asleep: the right time as soon as it shows again.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.on()) this.tick(); });
      // A font for Letters finishing loading changes its width: measure again.
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => this.place());
    },
    apply() {
      if (!this.on()) {
        clearTimeout(this.timer);
        if (this.el) this.el.hidden = true;
        this.fit = '';
        document.body.classList.remove('clock-on');
        notifyCorners();
        return;
      }
      if (!this.el) this.init();
      this.tick();
    },
    tick() {
      clearTimeout(this.timer);
      // (The formatters are made again each minute: one keeps the time zone it was made in, and the device's can
      // change while 21Board is open: a Chromebook setting its zone after start-up, IT's policy, an iPad that travelled.)
      this.fmt = null;
      this.place();
      this.timer = setTimeout(() => this.tick(), 60000 - Date.now() % 60000);   // the next minute, on the dot
    },
    // "9:41 AM" (AM smaller), and "Thu, Nov 12" before it with the date.
    html(now, withDate) {
      if (!this.fmt) this.fmt = { time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }), date: new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) };
      const time = this.fmt.time.formatToParts(now).map(p => p.type === 'dayPeriod' ? `<span class="ap">${esc(p.value)}</span>` : esc(p.value)).join('');
      // (The space between the two is for screen readers: the layout keeps its own gap.)
      return (withDate ? `<span class="d">${esc(this.fmt.date.format(now))}</span> ` : '') + `<span class="t">${time}</span>`;
    },
    // Which corner, what fits there, and what toasts keep clear of. Called on every change that can move it: the
    // settings, the screen and the board's size (updateZoom), the shape tip, and each minute.
    place() {
      const el = this.el;
      if (!el || !this.on()) return;
      this.side = S.settings.pickerCorners === 'left' ? 'left' : 'right';
      el.classList.toggle('left', this.side === 'left');
      el.classList.toggle('right', this.side === 'right');
      const now = new Date();
      let reach = 0;
      this.fit = '';
      if (!this.bare) {
        for (const withDate of clockMode() === 'date' ? [true, false] : [false]) {
          el.innerHTML = this.html(now, withDate);
          el.hidden = false;
          reach = this.room();
          if (reach) { this.fit = withDate ? 'date' : 'time'; break; }
        }
      }
      el.hidden = !reach;
      document.body.classList.toggle('clock-on', !!reach);
      if (reach) document.body.style.setProperty('--clock-room', Math.ceil(reach) + 'px');
      this.cover();
      notifyCorners();
      const note = Settings.isOpen && $('#set-clock-fit', Settings.body);
      if (note) note.textContent = this.fitNote();
    },
    // How far in from its edge the clock reaches (CSS px at the board's size, with a gap), or 0 if it doesn't fit:
    // toasts need room in the middle (they stay that far from both edges), and it must not touch ▦, the save
    // and folder notes or the shape tip. (The notes sit above the ▦ buttons, so only a crowded screen gets here.)
    room() {
      const r = this.el.getBoundingClientRect(), vw = window.innerWidth, ui = Zoom.ui || 1;
      if (!r.width) return 0;
      const reach = (this.side === 'right' ? vw - r.left : r.right) / ui + CLOCK_GAP;
      if (vw / ui - 2 * reach < CLOCK_TOASTS) return 0;
      const g = CLOCK_GAP / 2 * ui;
      const hit = b => b.width > 0 && r.left - g < b.right && b.left < r.right + g && r.top - g < b.bottom && b.top < r.bottom + g;
      return $$('.picker-btn:not([hidden]), .save-note:not([hidden]), .folder-note:not([hidden]), #shape-hint:not([hidden])').some(e => hit(e.getBoundingClientRect())) ? 0 : reach;
    },
    // While the Widget Picker is open in its corner, or open in the other and reaching it (a narrow screen), it hides.
    cover() {
      const el = this.el;
      if (!el || el.hidden) return;
      const side = Picker.side, r = el.getBoundingClientRect(), p = side && Picker.el.getBoundingClientRect();
      el.classList.toggle('covered', !!side && (side === this.side || (r.left < p.right && p.left < r.right && r.top < p.bottom && p.top < r.bottom)));
    },
    // For Settings: what doesn't fit in this window right now ('' when it all does).
    fitNote() {
      if (!this.on() || this.bare) return '';
      return !this.fit ? 'There isn’t room for it in this window right now.' : clockMode() === 'date' && this.fit === 'time' ? 'Only the time fits in this window right now.' : '';
    }
  };

  function applyClock() { CornerClock.apply(); }

  // What a window that fills the board is told about its bottom corners (its info's `corners`): how far in from its
  // left and right edges, and up from its bottom, the board's own buttons there reach (▦, and the clock beside one),
  // in its CSS px. Such a window's content ends at the bottom of the screen, and its sides are the screen's sides.
  function cornerReach() {
    const vw = window.innerWidth, vh = window.innerHeight, s = Zoom.s || 1;
    let left = 0, right = 0, top = vh;
    for (const e of $$('.picker-btn:not([hidden]), .corner-clock:not([hidden])')) {
      const r = e.getBoundingClientRect();
      if (!r.width) continue;
      if (r.left + r.width / 2 < vw / 2) left = Math.max(left, r.right); else right = Math.max(right, vw - r.left);
      top = Math.min(top, r.top);
    }
    return { left: Math.ceil(left / s), right: Math.ceil(right / s), height: Math.ceil((vh - top) / s) };
  }
  // The clock or a ▦ button came, went or changed width: tell the windows that fill the board. (Once the code running
  // now is done: when the screen changed size the windows are laid out again first, and one message tells it all.)
  let cornersDue = false;
  function notifyCorners() {
    if (cornersDue) return;
    cornersDue = true;
    Promise.resolve().then(() => { cornersDue = false; for (const w of S.wins.values()) if (w.inst && w.inst.maximized) w.notifyInfo(); });
  }

  function clockSettings(sw, seg) {
    if (LAB) return '';
    const st = S.settings, mode = clockMode();
    const where = st.pickerCorners === 'left' ? 'bottom left' : 'bottom right';
    return `<div class="row stack"><div><div class="lbl">Clock in the corner</div><div class="hint">A small clock beside the Widget Picker button in the ${where} corner, on every page. <span id="set-clock-fit">${esc(CornerClock.fitNote())}</span></div></div>
      ${seg('clock', mode, [['off', 'Off'], ['time', 'Time'], ['date', 'Time and date']])}</div>`;
  }

  function clockAct(act, val) {
    if (act !== 'clock') return false;
    if (['off', 'time', 'date'].includes(val)) updateSettings({ clock: val });
    return true;
  }

  // ---- Letters (easier-to-read fonts)
  // Settings → Appearance → Letters: the device's own font (as before), or one that comes with 21Board for easier
  // reading from across the room: Atkinson Hyperlegible (the Braille Institute's font for low vision: I, l and 1
  // differ, and 0 has a line through it) or Andika (SIL's font for beginning readers: a and g as children learn to
  // write them). Easier reading, not a "dyslexia font". The files are in fonts/, cut down to the letters 21Board
  // needs (tools/build-letter-fonts.py; the cut-down Andika is renamed "21Board Early Readers", as its licence asks)
  // and part of the offline copy (sw.js), which every device saves. @font-face rules fetch nothing until text uses
  // them, so the page loads a font only once it's chosen (or Settings shows it). They point next to this file, so
  // they also work in the widget dev window on 21Board's own site (not on another one: see LETTERS_HERE). Widgets
  // get the font in their palette (--b21-font, paletteFor) and the SDK adds the same rules in their frames
  // (sdk/board21.js, LETTER_FACES), then fires a resize (the window's and Board21's), so text that is fitted to its
  // window fits again in the new letters.
  // Weights 600 to 800 (headings, names) come out in the Bold face, 500 in the Regular one.
  // This device only, like the other classroom settings: never exported (unlike the theme and accent) or sent to the
  // Drive folder, so a board opened on the smartboard keeps the smartboard's letters.
  // (\u00a0, a no-break space, keeps “I, l and 1” and “a and g” on one line in the hints.)
  const LETTERS = {
    standard: { name: 'Standard', hint: 'This device’s own letters.' },
    legible: { name: 'Easier to read', hint: 'Atkinson Hyperlegible, made for people with low vision: I,\u00a0l\u00a0and\u00a01 all look different, and 0 has a line through it.',
      family: 'Atkinson Hyperlegible', files: ['AtkinsonHyperlegible-Regular.woff2', 'AtkinsonHyperlegible-Bold.woff2'] },
    early: { name: 'Early readers', hint: 'Based on Andika by SIL, for children learning to read: a\u00a0and\u00a0g look the way they learn to write them.',
      family: '21Board Early Readers', files: ['EarlyReaders-Regular.woff2', 'EarlyReaders-Bold.woff2'] }
  };
  // (With a 0: Atkinson Hyperlegible draws it with a line through it, on every clock and timer too. Better seen
  // here first.)
  const LETTER_SAMPLE = 'Il1 0 ag';
  // The folder this file came from (the dev window's page is somewhere else).
  const FONT_BASE = (() => { const s = document.currentScript; return s && s.src ? s.src.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : ''; })();
  // Whether the fonts can load here. A font from another site loads only if that site allows it (CORS); if it
  // doesn't, the browser logs errors and the text stays as it was. 21Board itself is always on the fonts' own site
  // (or on disk). The widget dev window may not be: in an AI tool's preview it runs on the tool's site, and in the
  // widget lab it is sealed off (no site at all). There the letters stay Standard and nothing is fetched, so the
  // preview's console only shows the widget's own errors, and Settings says where to try them.
  const LETTERS_HERE = !LAB || (() => { try { const u = new URL(FONT_BASE); return u.protocol === 'file:' || u.origin === self.origin; } catch (e) { return false; } })();
  const letterKey = () => LETTERS_HERE && Object.prototype.hasOwnProperty.call(LETTERS, S.settings.letters) ? S.settings.letters : 'standard';
  // The font stack: the chosen font, then the device's own for anything it doesn't have (▦, ✓, emoji, Cyrillic…).
  const letterFont = (key = letterKey()) => (LETTERS[key].family ? `"${LETTERS[key].family}", ` : '') + PALETTES.light.font;

  let letterFaces = null;
  function applyLetters() {
    if (!letterFaces && LETTERS_HERE) {   // (once: the rules load nothing by themselves)
      letterFaces = document.createElement('style');
      letterFaces.id = 'letter-faces';
      letterFaces.textContent = Object.values(LETTERS).filter(l => l.files).map(l => l.files.map((file, i) =>
        `@font-face { font-family: "${l.family}"; src: url("${FONT_BASE}fonts/${file}") format("woff2"); font-weight: ${i ? 700 : 400}; font-display: swap; }`).join('\n')).join('\n');
      document.head.appendChild(letterFaces);
    }
    const key = letterKey();
    document.body.style.fontFamily = key === 'standard' ? '' : letterFont(key);   // (everything else inherits it)
  }

  // Each choice is shown in its own letters, with a sample of the look-alikes.
  function letterSettings() {
    if (!LETTERS_HERE) return `<div class="row"><div><div class="lbl">Letters</div><div class="hint">Easier-to-read letters can’t load in this test board. Try them in 21Board itself.</div></div></div>`;
    const cur = letterKey();
    const opt = key => {
      const l = LETTERS[key], on = key === cur;
      return `<button class="letter-opt${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-act="letters" data-val="${key}" style="font-family:${esc(letterFont(key))}">` +
        `<span class="txt"><b>${esc(l.name)}</b><small>${esc(l.hint)}</small></span><span class="sample" aria-hidden="true">${LETTER_SAMPLE}</span>` +
        (on ? `<span class="tick" aria-hidden="true">${svg('check')}</span>` : '') + '</button>';
    };
    return `<div class="row stack"><div><div class="lbl">Letters</div><div class="hint">The letters in 21Board and its widgets, on this device.</div></div>
          <div class="letter-opts" role="radiogroup" aria-label="Letters">${Object.keys(LETTERS).map(opt).join('')}</div></div>`;
  }

  function letterAct(act, val) {
    if (act !== 'letters') return false;
    if (Object.prototype.hasOwnProperty.call(LETTERS, val)) updateSettings({ letters: val });
    return true;
  }

  // ---- (end of section 12b)

  function backgroundSettings(sw, seg) {
    const bg = S.board.background || {}, color = bg.color || null;
    const pattern = PATTERN_IDS.includes(bg.pattern) ? bg.pattern : 'none';
    const isCustom = !!color && !BG_SWATCHES.some(([c]) => c === color);
    const photoSet = BoardPhoto.settings(), m = BoardPhoto.media(), photoShown = !!(photoSet && photoSet.on && m);
    const ink = bgInk(color), fill = color || 'var(--board-bg)';
    const look = `background-color:${fill};--pattern:${ink.pattern};--pattern-strong:${ink.strong}`;
    const tick = on => on ? `<span class="tick" aria-hidden="true">${svg('check')}</span>` : '';
    const swatch = ([c, n]) => `<button class="swatch${color === c ? ' on' : ''}" style="background:${c}" role="radio" aria-checked="${color === c}" data-act="bg" data-val="${c}" title="${n}" aria-label="${n}">${tick(color === c)}</button>`;
    const sunMoon = '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="#4b5563"><circle cx="7.6" cy="7.6" r="1.9"/><path d="M7.6 3.4v.7M7.6 11.1v.7M3.4 7.6h.7M11.1 7.6h.7M4.6 4.6l.5.5M10.1 10.1l.5.5M4.6 10.6l.5-.5M10.1 5.1l.5-.5"/></g>' +
      '<path stroke="#e5e7eb" transform="translate(11.2 11.2) scale(.36)" d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>';
    const ratio = freeShape() ? (Zoom.vw || 16) / (Zoom.vh || 9) : 16 / 9;
    return `<div class="row stack bg-block" id="bg-block">
      <div class="bg-top"><div><div class="lbl">Background</div><div class="hint">The color, pattern and photo behind ${Pages.enabled() ? 'this page’s' : 'this board’s'} windows.</div></div>
        <div class="bg-preview${photoShown || pattern === 'none' ? '' : ' pattern-' + pattern}" id="bg-preview" role="img" aria-label="Preview of the board" style="aspect-ratio:${ratio.toFixed(4)};${look}">${photoShown
          ? `<span class="ph" style="background-size:${photoSet.fit === 'whole' ? 'contain' : 'cover'};background-position:${photoPosition(photoSet)};--fade:${photoSet.fade}"></span>` : ''}</div></div>
      <div class="bg-part"><div class="bg-sub"><span class="lbl">Color</span><span class="bg-now" id="bg-color-name">${esc(bgColorName(color))}</span></div>
        <div class="bg-cap" id="bg-cap-light">Light</div>
        <div class="swatches" role="radiogroup" aria-labelledby="bg-cap-light">
          <button class="swatch auto${!color ? ' on' : ''}" role="radio" aria-checked="${!color}" data-act="bg" data-val="" title="Match the theme (light or dark)" aria-label="Match the theme (light or dark)">${sunMoon}${tick(!color)}</button>
          ${BG_LIGHT.map(swatch).join('')}</div>
        <div class="bg-cap" id="bg-cap-dark">Dark</div>
        <div class="swatches" role="radiogroup" aria-labelledby="bg-cap-dark">${BG_DARK.map(swatch).join('')}
          <label class="swatch pill custom${isCustom ? ' on' : ''}" title="Choose any color"><span class="dot"${isCustom ? ` style="background:${color}"` : ''}></span>Custom…${tick(isCustom)}<input type="color" id="set-bg-custom" value="${esc(isCustom ? color : '#88aacc')}" aria-label="Custom background color"></label></div></div>
      <div class="bg-part"><div class="bg-sub"><span class="lbl">Pattern</span><span class="bg-now">${photoShown ? 'Not shown with a photo' : esc(PATTERNS.find(p => p[0] === pattern)[1])}</span></div>
        ${photoShown ? '<div class="bg-note" id="bg-pattern-note">The photo covers the pattern. To use a pattern, turn off <b>Show photo</b> below.</div>' : ''}
        <div class="pat-tiles${photoShown ? ' disabled' : ''}" role="radiogroup" aria-label="Pattern">${PATTERNS.map(([p, n]) => { const on = p === pattern;
          return `<button class="pat-tile${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-act="pattern" data-val="${p}"${photoShown ? ' disabled' : ''}><span class="pv${p === 'none' ? '' : ' pattern-' + p}" style="${look}"></span>${n}${tick(on)}</button>`; }).join('')}</div></div>
      <div class="bg-part">${photoRow(sw, seg)}</div>
    </div>`;
  }
  // Settings → Appearance → Background → Photo.
  function photoRow(sw, seg) {
    const m = BoardPhoto.media(), im = BoardPhoto.settings();
    if (!m || !im) {
      return `<div class="bg-sub"><span class="lbl">Photo</span><span class="bg-now">None</span></div>
        <div class="row"><div class="hint">A picture from this device (or Google Drive on a Chromebook), shown over the color. ${Store.failed ? 'It goes into full backups, not into templates.' : 'It’s kept on this device and in full backups, not in templates.'}</div>
        <button class="btn" data-act="photo-add">${svg('image')}Add photo…</button></div>`;
    }
    const g = photoThumbGeometry(m, im), fill = im.fit === 'fill';
    // Shaped like the board, but never taller than about 200 px (a portrait window would make it huge).
    return `<div class="bg-sub"><span class="lbl">Photo</span><span class="bg-now">${im.on ? 'Shown' : 'Hidden'}</span></div>
      <div class="hint">${fill ? 'Tap the picture to choose the part that always stays in view.' : 'The whole photo is shown; the background color fills the rest.'}</div>
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
      </div>`;
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
  function linkSettings(sw, seg) {
    const L = Link;
    if (!L.dir) {
      return `<h3>Google Drive folder</h3>
        <div class="row stack"><div><div class="lbl">Share boards with your other devices</div><div class="hint">Choose the same folder in Google Drive on each device, for example My Drive › 21Board (make it first). Google Drive keeps it the same everywhere: send a board from your laptop, and the smartboard offers to load it. 21Board keeps one file per board there.</div></div>
          <button class="btn primary" data-act="link-choose">${svg('send')}Choose folder…</button></div>`;
    }
    const dev = L.device(), uid = S.board.uid, rec = L.boardRec(uid) || {};
    // What is wrong, if anything (as the note on the board says), then how things stand: the last send and
    // load, the last look at the folder, and a send that didn't work.
    const prob = L.problem(), info = FolderNote.info(), late = L.arriving(uid);
    const fix = { allow: ['link-reconnect', 'Allow…'], missing: ['link-check', 'Look again'], send: ['link-send', 'Try again'] }[prob];
    const warn = info ? `<div class="row save-warn"><div><div class="lbl"><span class="status-dot warn"></span>${esc(info.title)}</div><div class="hint">${esc(info.text)}</div></div><button class="btn small primary" data-act="${fix[0]}">${fix[1]}</button></div>` : '';
    const status = ([rec.sentAt ? `Sent from here ${when(rec.sentAt)}.` : '', rec.loadedSentAt ? `Loaded the version from ${rec.loadedFrom || 'another device'} sent ${when(rec.loadedSentAt)}.` : ''].filter(Boolean).join(' ') || 'Not sent from here yet.') +
      (L.failed && prob !== 'send' ? ` Couldn’t send ${when(L.failed.at)}: ${LINK_SAY[L.failed.code][0]}.` : '') + (L.checkedAt && !prob ? ` Folder checked ${when(L.checkedAt)}.` : '');
    const mine = L.found.find(f => f.name === rec.file && f.uid === uid) || L.found.find(f => f.uid === uid && f.vid);
    // (Another file of this board is listed too: Drive can leave two, and each may hold a version.)
    const others = L.found.filter(f => f.kind === 'full' && f !== mine && (f.uid !== uid || f.vid));
    const auto = !L.st.auto ? 'off' : L.st.calm ? 'calm' : 'now';
    return `<h3>Google Drive folder</h3>
      ${warn}
      <div class="row"><div><div class="lbl">Folder: ${esc(L.dir.name)}</div><div class="hint">${esc(status)}${L.offer ? ` <b>A newer version from ${esc(L.offer.from || 'another device')} is waiting.</b>` : ''}</div></div>
        <div style="display:flex;gap:6px;flex:0 0 auto"><button class="btn small" data-act="link-choose">Change…</button><button class="btn small" data-act="link-unlink">Unlink</button></div></div>
      <div class="row"><div><div class="lbl">Send this board</div><div class="hint">${mine ? `In the folder as “${esc(mine.name)}”.` : 'Saves it into the folder for your other devices.'}${late ? ` Waiting for Google Drive: “${esc(late.name)}” is still arriving.` : ''}</div></div>
        <div style="display:flex;gap:6px;flex:0 0 auto">${L.offer ? '<button class="btn small" data-act="link-load-offer">Load newer</button>' : ''}<button class="btn small primary" data-act="link-send">${svg('send')}Send</button></div></div>
      <div class="row stack"><div><div class="lbl">Send automatically</div><div class="hint">After each change: a few seconds later, best where you prepare your boards. When left alone: once the board hasn’t changed for 10 minutes, best on the smartboard, so that taps in class (dice, timers) don’t each make a version for your laptop to load.</div></div>
        ${seg('link-auto', auto, [['off', 'Off'], ['now', 'After each change'], ['calm', 'When left alone']])}</div>
      <div class="row"><div><div class="lbl">Include the background photo</div><div class="hint">On: the photo goes with the board, and so does removing it. A photo that only another device has stays there. Off: this device sends no photo, and your other devices keep theirs.</div></div>${sw('link-photo', L.st.photo, 'Include the background photo')}</div>
      <div class="row stack"><label class="lbl" for="set-link-label">This device's name <span class="hint">(shown on your other devices: “updated on …”)</span></label>
        <input type="text" class="text-input" id="set-link-label" maxlength="40" value="${esc(dev.label)}" autocomplete="off"></div>
      <div class="row stack"><div><div class="lbl">Other boards in the folder</div><div class="hint">Load one to show it on this device (it replaces this board). After that, this device offers its newer versions.</div></div>
        <div class="inst-list">${others.length ? others.map(f => { const pg = Pages.owner(f.uid); return `<div class="inst"><span class="widget-icon" style="--c:var(--primary)">${svg('send')}</span><div class="meta"><b>${esc(f.title)}</b><span>From ${esc(f.from || 'another device')} ${esc(when(f.sentAt))}${f.uid === uid ? ' · another file of this board' : pg ? ` · page ${Pages.pos(pg) + 1} here` : ''}</span></div>${pg ? `<button class="btn small" data-act="page-go" data-val="${pg}">Go to page</button>` : `<button class="btn small" data-act="link-load" data-val="${esc(f.name)}">Load</button>`}</div>`; }).join('') : `<div class="empty-note">${L.perm === 'granted' ? 'None yet.' : 'Allow 21Board to use the folder to see them.'}</div>`}</div>
        <div><button class="btn small" data-act="link-check">Check the folder now</button></div></div>`;
  }

  const Settings = {
    el: null,
    body: null,
    side: 'left',
    isOpen: false,
    keep: false,   // section 12b: a time box is being saved, and is still being typed in (awakeChange)

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
          const name = e.target.value.trim().slice(0, 60) || S.board.name || 'My Board';
          updateBoard({ name });
          Picker.renderControls();
        }
        if (e.target.id === 'set-bg-custom') this.render();   // (the picker has closed: mark the choice)
        classroomChange(e.target);   // section 12b
      });
      this.body.addEventListener('input', e => {
        if (e.target.id === 'set-bg-custom') {
          // While the color picker is open: the board, the previews and the name follow (rebuilding Settings would close it).
          const color = e.target.value, ink = bgInk(color);
          updateBoard({ background: Object.assign({}, S.board.background, { color }) });
          for (const el of this.body.querySelectorAll('#bg-preview, .pat-tile .pv')) {
            el.style.backgroundColor = color; el.style.setProperty('--pattern', ink.pattern); el.style.setProperty('--pattern-strong', ink.strong);
          }
          const nm = $('#bg-color-name', this.body); if (nm) nm.textContent = bgColorName(color);
          const dot = e.target.parentNode.querySelector('.dot'); if (dot) dot.style.background = color;
        }
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
      // Developer mode's Upload file… (made here, so a page from another build can't be without it).
      const wi = document.createElement('input');
      Object.assign(wi, { type: 'file', id: 'widget-input', accept: '.html,.htm,text/html', hidden: true });
      document.body.appendChild(wi);
      wi.addEventListener('change', async e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try { await DevFiles.add(f, this.side); }
        catch (err) { await dialog({ title: 'Can’t use this file', message: err.message, actions: [{ label: 'OK', value: true, kind: 'primary' }] }); }
        if (this.isOpen) this.render();
      });
      this.body.addEventListener('keydown', e => {
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
      if (!this.isOpen || this.keep) return;
      // Don't yank a text field (or a time box) out from under someone who is typing in it.
      if (this.body.contains(document.activeElement) && document.activeElement.matches('input[type="text"], input[type="time"]')) return;
      const st = S.settings;
      const seg = (act, cur, opts, disabled) => `<div class="seg${disabled ? ' disabled' : ''}" role="radiogroup">${opts.map(([v, l]) =>
        `<button role="radio" aria-checked="${v === cur}" data-act="${act}" data-val="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const sw = (act, on, label) => `<button class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-act="${act}"></button>`;

      const insts = Array.from(S.insts.entries()).sort((a, b) => {
        const an = (getWidget(a[1].widgetId) || { name: a[1].widgetId }).name, bn = (getWidget(b[1].widgetId) || { name: b[1].widgetId }).name;
        return an.localeCompare(bn) || a[1].n - b[1].n;
      });
      const instHTML = insts.length ? insts.map(([ikey, i]) => {
        const widget = getWidget(i.widgetId);
        const size = JSON.stringify(S.data.get(ikey) || '').length + JSON.stringify(S.conf.get(ikey) || '').length;
        const name = `${widget ? widget.name : i.widgetId}${i.n > 1 || !widget ? ' ' + i.n : ''}`;
        const status = !widget ? 'Widget not installed' : i.open ? 'Open' : 'Closed';
        const unsaved = Store.failed || (Writer.failing && ['inst', 'data', 'conf'].some(k => Writer.pending.has(Keys[k](S.boardId, ikey))));
        const app = widget && widget.external;   // a district app: its work isn't the board's (README, "District apps")
        return `<div class="inst"><span class="widget-icon" style="--c:${esc(widget ? widget.color : '#9ca3af')}">${widget ? widget.icon : svg('widget')}</span>` +
          `<div class="meta"><b>${esc(name)}</b><span>${status} · ${app ? `${esc(widget.name)} keeps its own work on this device${unsaved ? ' · window not saved' : ''}` : `${fmtBytes(size)}${unsaved ? ', not saved' : ' saved'}`}</span></div>` +
          (widget && !i.open ? `<button class="icon" data-act="inst-open" data-val="${esc(ikey)}" title="Open" aria-label="Open ${esc(name)}">${svg('open')}</button>` : '') +
          `<button class="icon" data-act="inst-delete" data-val="${esc(ikey)}" title="Delete" aria-label="${app ? `Delete the ${esc(name)} window` : `Delete ${esc(name)} and its content`}">${svg('trash')}</button></div>`;
      }).join('') : '<div class="empty-note">No widget windows yet. Open one from the Widget Picker.</div>';

      // Test widgets uploaded as a file (Developer mode).
      const devList = Array.from(S.devFiles.values(), d =>
        `<div class="inst"><span class="widget-icon" style="--c:#64748b">${svg('widget')}</span><div class="meta"><b>${esc(d.name)}</b><span>${esc(`Uploaded file: ${d.file}`)}</span></div>` +
        `<button class="icon" data-act="dev-remove" data-val="${esc(d.id)}" title="Remove" aria-label="Remove ${esc(d.name)}">${svg('trash')}</button></div>`).join('');

      const note = SaveNote.state() ? SaveNote.info() : null;
      this.body.innerHTML = `
        ${note ? `<div class="row save-warn"><div><div class="lbl"><span class="status-dot warn"></span>${esc(note.title)}</div><div class="hint">${esc(note.text)}</div></div><button class="btn small" data-act="backup">${svg('export')}Back up now</button></div>` : ''}
        <div class="row update-note" id="st-update" hidden><div><div class="lbl">A new version of 21Board is ready</div><div class="hint">Updating takes a second or two, and the board stays as it is. Or leave it: 21Board updates by itself the next time it starts.</div></div><button class="btn small primary" data-act="update">Update now</button></div>
        ${historySettings(sw, seg)}

        <h3>Appearance</h3>
        <div class="row"><div class="lbl">Theme</div>${seg('theme', st.theme, [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']])}</div>
        <div class="row stack"><div><div class="lbl">Accent color</div><div class="hint">Buttons, the selected-window outline and highlights, in 21Board and its widgets.</div></div>
          <div class="swatches">${Object.entries(ACCENTS).map(([k, a]) => `<button class="swatch${(st.accent || 'blue') === k ? ' on' : ''}" style="background:${resolvedTheme() === 'dark' ? a[1] : a[0]}" data-act="accent" data-val="${k}" title="${a[2]}" aria-label="${a[2]} accent"></button>`).join('')}</div></div>
        ${letterSettings(sw, seg)}
        ${clockSettings(sw, seg)}
        ${backgroundSettings(sw, seg)}

        ${classroomSettings(sw, seg)}

        <h3>Windows</h3>
        <div class="row"><div><div class="lbl">Snap and avoid overlap</div><div class="hint">Windows stop at each other's edges. Keep pushing to overlap anyway.</div></div>${sw('snapping', st.snapping, 'Snap and avoid overlap')}</div>
        <div class="row"><div><div class="lbl">Drag windows from inside</div><div class="hint">Widgets without typing move by dragging anywhere in them; any widget moves with two fingers. Off: title bar only.</div></div>${sw('dragcontent', st.dragFromContent !== false, 'Drag windows from inside')}</div>
        <div class="row"><div class="lbl">Push needed to overlap</div>${seg('resistance', st.resistance, [['gentle', 'Light'], ['normal', 'Medium'], ['strong', 'Firm']], !st.snapping)}</div>
        ${scaleSettingsRows(seg)}
        <div class="row"><div><div class="lbl">Close all windows</div><div class="hint">${closeAllHint()}</div></div><button class="btn" data-act="close-all"${Lock.on() ? ' disabled' : ''}>${svg('windows')}Close all</button></div>

        <h3>Widget Picker</h3>
        <div class="row"><div class="lbl">Show controls in</div>${seg('corners', st.pickerCorners, [['both', 'Both corners'], ['left', 'Left'], ['right', 'Right']])}</div>

        ${Pages.enabled() ? `<h3>This page</h3>
        <div class="row"><div class="hint">Each page is a board of its own, with its own windows and background. Go to another page, or add, copy and delete pages, with ‹ Page › in the Widget Picker.</div></div>
        <div class="row stack"><label class="lbl" for="set-board-name">Page name <span class="hint">(used for export file names${Link.supported ? ' and in your Google Drive folder' : ''})</span></label>` : `<h3>Board</h3>
        <div class="row stack"><label class="lbl" for="set-board-name">Board name <span class="hint">(used for export file names)</span></label>`}
          <input type="text" class="text-input" id="set-board-name" maxlength="60" value="${esc(S.board.name)}" autocomplete="off"></div>
        <div class="row stack"><div><div class="lbl">${note ? 'Widget windows' : Pages.enabled() ? 'Saved windows on this page' : 'Saved widget windows'}</div><div class="hint">Closing a window keeps its content. Delete it here to remove it for good.</div></div>
          <div class="inst-list">${instHTML}</div></div>

        ${Link.supported ? linkSettings(sw, seg) : ''}

        ${LAB ? `<h3>Widget test mode</h3>
        <div class="row"><div class="hint">A test board for one widget, made by the widget dev window. Its data is kept apart from real boards${Store.mem ? ' (in memory, until this preview reloads)' : ''}.</div></div>` : `<h3>Storage &amp; offline</h3>
        <div class="row"><div class="lbl">Offline</div><div class="hint" id="st-offline" style="text-align:right">Checking…</div></div>
        <div class="row"><div><div class="lbl">Data protection</div><div class="hint" id="st-persist-hint"></div></div><div id="st-persist" style="flex:0 0 auto"></div></div>
        ${KIOSK ? `<div class="row"><div><div class="lbl">Kiosk mode</div><div class="hint">No one is signed in, so the Google Drive folder isn’t available. Import and Export use this device’s storage or a USB drive.${note ? '' : ' The board is kept on this device, and board history keeps earlier versions.'}</div></div></div>` : ''}
        <div class="row"><div><div class="lbl">Backups</div><div class="hint" id="st-backup">${esc(backupAgo())}</div></div><button class="btn small" data-act="backup">${svg('export')}Back up now</button></div>
        <div class="row"><div class="lbl">Storage used</div><div class="hint" id="st-storage" style="text-align:right">Checking…</div></div>`}

        <h3>Advanced</h3>
        ${LAB || KIOSK ? '' : `<div class="row"><div><div class="lbl">Developer mode</div><div class="hint">Shows developer tools and lets you test a widget from its file.</div></div>${sw('devmode', st.devMode, 'Developer mode')}</div>`}
        ${st.devMode && !LAB && !KIOSK ? `<div class="row stack"><div><div class="lbl">Test a widget</div><div class="hint">An uploaded file runs sealed off from your boards. It is kept on this device only, never in exports.</div></div>
          <button class="btn primary" data-act="dev-upload">${svg('import')}Upload file…</button>
          ${devList ? `<div class="inst-list">${devList}</div>` : ''}</div>` : ''}
        ${Store.failed ? `<div class="row"><div><div class="lbl">Empty this board</div><div class="hint">Clears the windows, content and settings you see now.${Store.failed === 'unopened' ? ' Your saved board isn’t touched.' : ''}</div></div><button class="btn danger" data-act="erase">${svg('trash')}Empty</button></div>`
        : `<div class="row"><div><div class="lbl">Erase everything</div><div class="hint">Deletes all windows, content and settings on this device.</div></div><button class="btn danger" data-act="erase">${svg('trash')}Erase</button></div>`}

        <h3>About</h3>
        <div class="about">21Board <span id="st-version">${esc(RELEASE)}</span> · Widget SDK protocol ${SDK_PROTOCOL}<span id="st-cache"></span><br>
        ${note ? '' : 'Everything you make is stored only on this device. '}Nothing is sent to a server.</div>`;
      // The photo preview gets its picture here (never as text inside the HTML above).
      const pm = BoardPhoto.media(), fadeTo = (S.board.background && S.board.background.color) || 'var(--board-bg)';   // as on the board
      const shows = [$('#photo-thumb', this.body), $('#bg-preview .ph', this.body)].filter(Boolean);
      shows.forEach(el => el.style.setProperty('--fade-color', fadeTo));
      // (One call: a second one at the same time would make a new URL and revoke the first one's.)
      if (shows.length && pm) BoardPhoto.objectUrl(pm).then(u => shows.forEach(el => { el.style.backgroundImage = `url("${u}")`; }), () => {});
      this.refreshStatus(true);
    },

    async refreshStatus(quick) {
      if (!this.isOpen) return;
      const off = $('#st-offline', this.body), sto = $('#st-storage', this.body), per = $('#st-persist', this.body), cache = $('#st-cache', this.body);
      const up = $('#st-update', this.body);
      if (up) up.hidden = !S.sw.updateReady;   // (at the top, where it is seen: the prompt on the board goes away by itself)
      if (off) {
        const s = S.sw.state;
        off.innerHTML = s === 'ready' ? '<span class="status-dot ok"></span>Ready to work offline'
          : s === 'unsupported' ? '<span class="status-dot warn"></span>Needs https to work offline'
          : s === 'error' ? '<span class="status-dot warn"></span>Offline copy unavailable'
          : '<span class="status-dot"></span>Saving an offline copy…';
      }
      // (The offline copy is named only when it isn't the version this tab runs: see section 15.)
      if (cache) cache.textContent = S.sw.version && S.sw.build !== BOARD_BUILD ? ` · Offline copy ${S.sw.version}${S.sw.build ? ` (${S.sw.build})` : ''}` : '';
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
        // A kiosk can't be installed, and whether its data is kept is set up by IT: say only what applies.
        if (KIOSK && st !== 'granted') {
          if (per2.querySelector('[data-act="install"]')) per2.innerHTML = '<span class="hint"><span class="status-dot warn"></span>Not yet</span>';
          hint.textContent = 'The browser decides whether to protect 21Board’s data. On a kiosk device, your school’s IT manages this. To be safe, back up to a USB drive now and then.';
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
      if (classroomAct(act, val)) { this.render(); return; }   // section 12b
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
          const yes = await dialog({ title: 'Remove the background photo?', message: 'It is removed from this board on this device' + (Link.dir && Link.st.photo && typeof (Link.boardRec(S.board.uid) || {}).photo === 'boolean' ? ', and on your other devices when they load the next version you send' : '') + '. Your full backups' + (BoardHistory.enabled() ? ' and board history' : '') + ' still have it.', actions: [{ label: 'Remove photo', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
          if (yes) {
            const m = BoardPhoto.media(), look = BoardPhoto.settings();
            await BoardPhoto.remove(); this.render();
            toast('Photo removed.', { action: 'Undo', timeout: 20000, onAction: () => {
              S.media.set('background', m); S.media.set('background-look', look);
              Writer.put(Keys.media(S.boardId, 'background'), 'media', m); Writer.put(Keys.media(S.boardId, 'background-look'), 'media', look);
              BoardPhoto.render(); if (Settings.isOpen) Settings.render();
            } });
          }
          break;
        }
        case 'close-all': if (!Lock.on()) await closeAll(); this.render(); break;   // (its button is off while locked)
        case 'inst-open': { const i = S.insts.get(val); if (i) openSpecific(val); this.render(); break; }
        case 'inst-delete': {
          const i = S.insts.get(val);
          if (!i) break;
          const widget = getWidget(i.widgetId);
          const name = `${widget ? widget.name : i.widgetId}${i.n > 1 || !widget ? ' ' + i.n : ''}`;
          const ok = await dialog({ title: `Delete ${name}?`, message: (widget && widget.external ? `Its window will be removed from this board. Your work in ${widget.name} isn’t touched: ${widget.name} keeps it on this device. `
            : 'Its window and everything saved in it will be removed from this board. ') + (BoardHistory.enabled() ? 'You can bring it back from Board history for a while.' : 'This can’t be undone.'), actions: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
          if (ok) {
            const id = await deleteInstance(val); this.render();
            toast(`Deleted ${name}.`, id ? { action: 'Undo', timeout: 15000, onAction: () => BoardHistory.putBack(id, val, { exact: true, quiet: true }) } : {});
          }
          break;
        }
        case 'install': await Install.run(); this.refreshStatus(); break;
        case 'backup': await doExport('all'); this.refreshStatus(); break;
        case 'hist-open': HistorySheet.open(this.side); break;
        case 'hist-every': {
          if (val === '0') {
            const ok = await dialog({ title: 'Turn off automatic versions?', message: '21Board stops saving versions while you work, when it opens and when a note is suddenly cleared. It still saves one before Reset, Delete, Close all, a photo change, Import, Load, Erase and going back, so those can be undone, and when you tap “Save this version now”. Versions already saved stay until you delete them.', actions: [{ label: 'Turn off', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
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
        case 'link-auto': Link.saveState({ auto: val !== 'off', calm: val === 'calm' }); if (Link.st.auto) Link.changed([Keys.board(S.boardId)]); break;   // (the wait starts again)
        case 'link-photo': Link.saveState({ photo: !Link.st.photo }); break;
        case 'link-load': await Link.load(val); this.render(); break;
        case 'page-go': this.close(); await Pages.go(+val); break;
        case 'link-load-offer': if (Link.offer) await Link.load(Link.offer.name); this.render(); break;
        case 'update': askUpdate(); break;
        case 'dev-upload': $('#widget-input').click(); break;
        case 'dev-remove': DevFiles.remove(val); break;
        case 'erase': {
          const hist = BoardHistory.enabled();
          // Where nothing is stored (see SaveNote), only the board on screen can be emptied: the saved board,
          // if there is one, and its history are left alone.
          const temp = Store.failed, saved = temp === 'unopened' ? ' Your saved board isn’t touched: reload 21Board to open it.' : '';
          const apps = appsOwnWork('erased here', 'Clear it');
          const others = temp ? [] : Pages.ids().filter(b => b !== S.boardId);
          const ok = await dialog(temp ? { title: 'Empty this board?', message: 'The windows, their content and the settings you see now are cleared.' + saved + apps,
            actions: [{ label: 'Empty this board', value: 'erase', kind: 'danger' }, { label: 'Cancel', value: null }] }
            : { title: 'Erase everything?', message: (others.length ? `All ${others.length + 1} pages, their windows and content, and your settings are deleted from this device.` + (hist ? ' Board history keeps the page you’re on, so you can still go back to it.' : '')
                : 'All windows, their content and your settings are deleted from this device.' + (hist ? ' Board history is kept, so you can still go back.' : '')) + ' Export a backup first if you might want them later.' + apps,
              actions: [{ label: 'Export a backup first', value: 'backup', kind: 'primary' }, { label: 'Erase everything', value: 'erase', kind: 'danger' }]
                .concat(hist ? [{ label: 'Erase, including board history', value: 'erase-all', kind: 'danger' }] : []).concat([{ label: 'Cancel', value: null }]) });
          if (ok === 'backup') { await doExport('all'); break; }
          if (ok !== 'erase' && ok !== 'erase-all') break;
          if (ok === 'erase') {
            // (The question promised a way back: if the board as it is couldn't be kept, ask once more.)
            const kept = await BoardHistory.before('erase', temp ? 'Before emptying the board' : 'Before erasing everything', { timeout: 3000 });
            if (!kept && hist && (S.insts.size || BoardPhoto.media()) && !await dialog({ title: temp ? 'Empty it anyway?' : 'Erase anyway?', message: '21Board couldn’t save the board as it is now in board history, so this can’t be undone.',
              actions: [{ label: temp ? 'Empty it anyway' : 'Erase anyway', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] })) break;
          } else await BoardHistory.clearAll();
          await Store.tx('readwrite', s => { s.clear(); });
          // (The other pages are gone, and their ids may be used again: their versions go too, also those of pages
          // deleted with their Undo still offered. See Pages.)
          if (!temp) for (const b of new Set(others.concat(Array.from(Pages.gone())))) if (b !== S.boardId) await BoardHistory.purgeBoard(b);
          Array.from(Pages.purges.values()).forEach(t => clearTimeout(t)); Pages.purges.clear();
          Writer.forget();
          Link.forget();
          Sync.announce([], { op: 'reload', erased: true });
          await rebuildAll({ pick: true });
          if (!temp && Pages.enabled()) updateSettings({ boards: [S.boardId], activeBoard: S.boardId });   // (the page shown stays: see Pages.pick)
          Picker.renderControls();
          this.render();
          toast(temp ? 'This board was emptied.' + (temp === 'unopened' ? ' Your saved board wasn’t touched.' : '') : 'Everything was erased.');
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
    const n = Pages.ids().length;
    const kind = await dialog(n < 2 ? {
      title: 'Export board',
      message: 'Save a .21board file you can import later or share with another teacher.' + appsOwnWork('in the file', 'Save it'),
      actions: [
        { label: 'Full backup', sub: 'Windows, their content, and closed windows', value: 'full', kind: 'primary', choice: true },
        { label: 'Blank template', sub: 'Window layout and widget settings only — no content', value: 'template', choice: true },
        { label: 'Cancel', value: null }
      ]
    } : {
      title: 'Export',
      message: 'Save a .21board file you can import later or share with another teacher.' + appsOwnWork('in the file', 'Save it'),
      actions: [
        { label: `All ${n} pages`, sub: 'A full backup of every page: windows, their content, and closed windows', value: 'all', kind: 'primary', choice: true },
        { label: 'This page', sub: `A full backup of “${S.board.name}” only`, value: 'full', choice: true },
        { label: 'This page as a blank template', sub: 'Window layout and widget settings only — no content', value: 'template', choice: true },
        { label: 'Cancel', value: null }
      ]
    });
    if (kind) await doExport(kind);
  }

  // The page shown (b: another page, from its stored records). Throws if the page shown changed meanwhile.
  async function buildExport(kind, b = S.boardId) {
    const gen = Pages.gen, read = await readForExport();
    if (gen !== Pages.gen) throw new Error('The page changed while it was being read.');
    return pageExport(kind, b, read);
  }
  // The stored records, with what this tab holds for any that can't be read: single ones (unread), or all of
  // them (unread stays null) when storage is in trouble, which is when a backup is wanted most. Not waited
  // for long, for the same reason.
  async function readForExport() {
    let recs = [], unread = null;
    try { ({ recs, skipped: unread } = await Promise.race([Store.readAll(), sleep(8000).then(() => { throw new Error('Storage didn’t answer'); })])); }
    catch (err) { console.warn('21Board: the stored board can’t be read; exporting what this window holds', err); }
    return { recs, unread };
  }
  function pageExport(kind, b, { recs, unread }) {
    const here = b === S.boardId;
    const byIkey = new Map();
    let board = here ? S.board : null, photo = null, look = null;
    const get = ik => { if (!byIkey.has(ik)) byIkey.set(ik, {}); return byIkey.get(ik); };
    const each = (key, value) => {
      const k = Keys.parse(key);
      if ((k.kind === 'inst' || k.kind === 'data' || k.kind === 'conf') && k.board === b) { if (value === undefined) delete get(k.ikey)[k.kind]; else get(k.ikey)[k.kind] = value; }
      if (!here && k.board === b && k.kind === 'board') board = value || null;
      if (!here && k.board === b && k.kind === 'media') { if (k.name === 'background') photo = value || null; if (k.name === 'background-look') look = value || null; }
    };
    for (const r of recs) each(r.key, r.value);
    if (here) {
      for (const kd of ['data', 'conf']) {
        for (const [ik, v] of (kd === 'data' ? S.data : S.conf)) if (!unread || unread.includes(Keys[kd](b, ik))) get(ik)[kd] = v;
      }
    }
    // Changes not saved yet (still queued, or waiting to be tried again): what's on the board is what's exported.
    for (const [key, op] of Writer.pending) each(key, op.del ? undefined : op.value);
    if (here) for (const [ik, inst] of S.insts) get(ik).inst = inst;
    board = Object.assign(defaultBoard(b), board || (Pages.info.get(b) || {}));
    const sc = here ? boardScale() : validScale(board.scale) || DEFAULT_SCALE, free = here ? freeShape() : board.shape === 'free';
    if (here) { photo = BoardPhoto.media(); look = photo ? BoardPhoto.settings() : null; }
    else { photo = validPhoto(photo) ? photo : null; look = photo ? normalizePhotoSettings(look) || normalizePhotoSettings({}) : null; }
    const instances = [];
    for (const [ik, parts] of byIkey) {
      if (!parts.inst && parts.data === undefined && parts.conf === undefined) continue;   // (deleted, not saved yet)
      const [widgetId, nStr] = ik.split(':');
      const inst = parts.inst ? normalizeInst(parts.inst, { widgetId, n: +nStr }) : normalizeInst({ open: false }, { widgetId, n: +nStr });
      if (kind === 'template' && !inst.open) continue;
      instances.push({
        widgetId, instance: +nStr, open: inst.open, maximized: inst.maximized, z: inst.z,
        rect: inst.rect, createdAt: kind === 'full' && inst.createdAt ? inst.createdAt : undefined,   // which window is which (Board history)
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
      generator: `21Board ${RELEASE}`,
      viewport: here ? exportViewport() : storedViewport(sc, free, instances), // the size of the space the rects are in
      theme: S.settings.theme,
      accent: S.settings.accent,
      board: Object.assign({ name: board.name, background: board.background || { color: null, pattern: 'none' }, scale: sc, shape: free ? 'free' : '16:9' },
        kind === 'full' && board.uid ? { uid: board.uid } : {}),   // which board this is (see section 13b)
      // The background photo: full backups only (a template is for sharing, and a photo may show the class).
      media: kind === 'full' && photo ? { background: photo, look } : undefined,
      instances
    };
  }
  // exportViewport() for a page that isn't shown: its 16:9 board, or (any shape) the space its windows use.
  function storedViewport(sc, free, instances) {
    const L = canvasFor(sc);
    if (!free) return { width: L.w, height: L.h };
    let w = Math.round(Zoom.vw / sc) || L.w, h = Math.round(Zoom.vh / sc) || L.h;
    for (const i of instances) { w = Math.max(w, Math.ceil(i.rect.x + i.rect.w)); h = Math.max(h, Math.ceil(i.rect.y + i.rect.h)); }
    return { width: w, height: h };
  }
  // Every page in one file (Back up now, the backup reminders, Export → All pages). With one page it is that
  // page's full backup, exactly as before pages. With more, it is still a formatVersion 1 file whose board is the
  // page shown, and "pages" lists every page in order ({ main: true } where that one is): a copy of 21Board from
  // before pages opens it as that one board, and ignores the rest. See docs/DATA-FORMAT.md.
  // The other pages' records that can't be read now come from what this tab holds (Pages.held); a page that
  // still lacks some is named in missing (and the file isn't counted as a backup: see doExport).
  async function buildAllExport(missing = []) {
    const ids = Pages.ids(), gen = Pages.gen, read = await readForExport();
    if (gen !== Pages.gen) throw new Error('The page changed while it was being read.');
    const main = pageExport('full', S.boardId, read);
    if (ids.length < 2) return main;
    const have = new Set(read.recs.map(r => r.key).concat(Array.from(Writer.pending.keys()))), lacking = new Set();
    for (const key of read.unread || Pages.held.keys()) {
      const b = Keys.parse(key).board;
      if (!b || b === S.boardId || have.has(key)) continue;
      if (Pages.held.has(key)) { read.recs.push({ key, value: Pages.held.get(key).value }); have.add(key); } else lacking.add(b);
    }
    // (Every page has a board record: one that wasn't read, nor held here, is missing too.)
    for (const b of ids) if (b !== S.boardId && (lacking.has(b) || !have.has(Keys.board(b)))) missing.push(b);
    main.pages = ids.map(b => {
      if (b === S.boardId) return { main: true };
      const e = pageExport('full', b, read);
      return { viewport: e.viewport, board: e.board, media: e.media, instances: e.instances };
    });
    return main;
  }

  // kind: 'full' or 'template' (this page), or 'all' (every page: a backup; with one page, the same as 'full').
  async function doExport(kind) {
    const pages = Pages.ids().length;
    if (kind === 'all' && pages < 2) kind = 'full';
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const safeName = (S.board.name || '21Board').replace(/[\\/:*?"<>|]+/g, '').trim() || '21Board';
    const filename = kind === 'all' ? `21Board ${pages} pages ${stamp}.21board` : `${safeName} ${stamp}${kind === 'template' ? ' template' : ''}.21board`;
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
    // A kiosk shows no downloads, so a download would vanish into its Downloads folder unseen: only the Save dialog.
    if (KIOSK && !handle) { toast('Export needs the Save dialog, which this kiosk doesn’t allow.'); return false; }
    const missing = [];
    try {
      const text = JSON.stringify(kind === 'all' ? await buildAllExport(missing) : await buildExport(kind), null, 2);
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
      // (A backup of one page out of several isn't a backup of everything: the reminders go on. Nor is one
      // that lacks part of a page that couldn't be read.)
      if (missing.length) {
        const names = missing.map(b => `“${Pages.name(b)}”`).join(', ');
        toast(`Exported, but part of ${missing.length === 1 ? 'the page' : 'the pages'} ${names} couldn’t be read on this device, so ${missing.length === 1 ? 'it isn’t' : 'they aren’t'} all in the file.`, { timeout: 0, action: 'OK' });
        return true;
      }
      if (kind === 'all' || (kind === 'full' && pages < 2)) updateSettings({ lastBackupAt: Date.now() });
      toast(kind === 'template' ? 'Template exported.' : kind === 'all' ? `All ${pages} pages exported.` : pages > 1 ? 'Page exported.' : 'Board exported.');
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
    const out = {
      kind: j.kind === 'template' ? 'template' : 'full',
      theme: ['light', 'dark', 'system'].includes(j.theme) ? j.theme : null,
      accent: accentOf(j.accent) ? j.accent : null,
      board: {
        name: j.board && typeof j.board.name === 'string' ? j.board.name.slice(0, 60) : null,
        background: { color: /^#[0-9a-f]{6}$/i.test(bg.color || '') ? bg.color : null, pattern: PATTERN_IDS.includes(bg.pattern) ? bg.pattern : 'none' },
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
      // A file sent to a shared folder says so when its board's photo was taken off ("background": null):
      // loading it takes the photo off here too (see Link.photoRule and ownPhoto). No "media" at all: the file
      // says nothing, and this device's photo stays.
      noPhoto: j.kind !== 'template' && !!j.media && j.media.background === null,
      instances,
      pages: null
    };
    // Every page (an all-pages backup, see buildAllExport): each one read as a file of its own; the board above
    // is the one marked main. (A page that can't be read is left out, never the others.)
    if (Array.isArray(j.pages) && j.pages.length > 1 && j.kind !== 'template') {
      out.pages = j.pages.slice(0, 200).map(e => {
        if (e && e.main) return out;
        try { return parseBoardFile(JSON.stringify({ format: '21board', formatVersion: 1, kind: 'full', viewport: e.viewport, board: e.board, media: e.media, instances: e.instances })); } catch (err) { return null; }
      }).filter(Boolean);
      if (out.pages.length < 2) out.pages = null;
    }
    return out;
  }

  // Which board a file opened with "Replace my board" is, from then on (its uid). This board: its own backup,
  // or a file that doesn't say which board it is (a template, an old backup) and keeps this board's name. The
  // board in the file: a file sent to a shared folder (as Load does). Anything else is another board with an
  // id of its own, so that sending it later never renames, removes or overwrites this board's file there. (So is
  // a board that is another page here: Pages.owner.)
  function importedUid(p) {
    if (!p.board.uid) return !p.board.name || p.board.name === S.board.name ? S.board.uid : newId();
    return (p.board.uid === S.board.uid || Link.vidOf(p.sent)) && !Pages.owner(p.board.uid) ? p.board.uid : newId();
  }

  async function importFile(file) {
    if (!await Lock.letIn(file)) return;   // windows locked: unlock first (section 12b)
    let parsed;
    try { parsed = parseBoardFile(await file.text()); } catch (err) {
      await dialog({ title: 'Can’t import this file', message: err.message, actions: [{ label: 'OK', value: true, kind: 'primary' }] });
      return;
    }
    if (parsed.pages && Pages.enabled()) return importPages(file, parsed);
    const openCount = parsed.instances.filter(i => i.open).length;
    const missing = new Set(parsed.instances.filter(i => !getWidget(i.widgetId)).map(i => i.widgetId));
    const what = parsed.kind === 'template' ? 'a blank template' : 'a full backup';
    // Replace: the file may be another board (see importedUid). This board's file in the shared folder is then
    // left as it is. If the file is this same board (its own backup, or a template or old backup with its
    // name), the next send replaces that file, as after any change. The dialog says which. (Nothing to say
    // for a file that was itself sent to the folder: it is the folder's version.)
    const uid = importedUid(parsed);
    const inFolder = Link.dir && Link.found.some(f => f.uid === S.board.uid && f.kind === 'full');
    const folder = !inFolder ? '' : uid !== S.board.uid ? ` “${S.board.name}” stays in your Google Drive folder.`
      : Link.vidOf(parsed.sent) ? '' : ' The copy in your Google Drive folder is replaced too, the next time this board is sent.';
    const mode = await dialog({
      title: `Import “${file.name.replace(/\.21board$/i, '')}”?`,
      message: `This is ${what} with ${openCount} window${openCount === 1 ? '' : 's'}.` + (missing.size ? ` ${missing.size} widget${missing.size === 1 ? ' is' : 's are'} not installed here; ${missing.size === 1 ? 'its' : 'their'} content will be kept but not shown.` : ''),
      actions: (Pages.enabled() ? [{ label: 'Open as a new page', sub: 'Your pages stay as they are. This one is added after the page you’re on.', value: 'page', kind: 'primary', choice: true }] : []).concat([
        { label: Pages.enabled() ? 'Replace this page' : 'Replace my board', sub: `${Pages.enabled() ? 'This page’s' : 'Your current'} windows and content are replaced.` + (BoardHistory.enabled() ? ' You can undo this.' : '') + folder, value: 'replace', kind: 'danger', choice: true },
        { label: Pages.enabled() ? 'Add to this page' : 'Add to my board', sub: 'Keep what’s here and add these windows', value: 'add', kind: Pages.enabled() ? '' : 'primary', choice: true },
        { label: 'Cancel', value: null }
      ])
    });
    if (!mode) return;
    Lock.letGo();   // ("Unlock and open": now, section 12b)
    if (mode === 'page') return openAsPages(parsed.pages || [parsed], file, false);
    try {
      const label = `${mode === 'replace' ? 'Before importing' : 'Before adding windows from'} “${file.name.replace(/\.21board$/i, '')}”`;
      const replace = mode === 'replace', shared = Link.supported;
      const opened = () => Array.from(S.insts.values()).filter(i => i.open).length, before = opened();   // (Add: a district app's window isn't added twice)
      if (replace && shared) await Link.leaving(uid);
      const undoId = await Link.swap(async () => {
        const id = await applyImport(parsed, mode, { uid: replace ? uid : null, keepCreated: replace, photo: replace && Link.ownPhoto(uid, parsed) ? 'keep' : 'file', history: { reason: replace ? 'import' : 'add', label } });
        // A file that was sent to a shared folder: this device now has that version, as after Load.
        if (replace && shared && Link.vidOf(parsed.sent)) await Link.loaded(uid, parsed);
        return id;
      });
      // "Send automatically" sends what was imported; a version waiting in the folder is offered for the board that is here now.
      if (shared) { Link.changed([Keys.board(S.boardId)]); Link.computeOffer(); }
      const added = opened() - before;
      toast(replace ? 'Board imported.' : `Added ${added} window${added === 1 ? '' : 's'}.`, undoAction(undoId, replace ? 'the import' : 'adding windows'));
    } catch (err) {
      console.error(err);
      toast('Import failed: ' + (err.message || err));
    }
  }

  // A file of several pages (an all-pages backup): add its pages after this device's, or put them in their place.
  async function importPages(file, p) {
    const n = p.pages.length, wins = p.pages.reduce((t, x) => t + x.instances.filter(i => i.open).length, 0), mine = Pages.ids().length;
    const name = file.name.replace(/\.21board$/i, '');
    const mode = await dialog({ title: `Import “${name}”?`, message: `This is a backup of ${n} pages with ${wins} window${wins === 1 ? '' : 's'}.`,
      actions: [
        { label: `Add these ${n} pages`, sub: `Your ${mine === 1 ? 'page stays' : `${mine} pages stay`} as ${mine === 1 ? 'it is' : 'they are'}. These are added after ${mine === 1 ? 'it' : 'them'}.`, value: 'add', kind: 'primary', choice: true },
        { label: 'Replace all pages', sub: `Your ${mine === 1 ? 'page is' : `${mine} pages are`} deleted and these take ${mine === 1 ? 'its' : 'their'} place.`, value: 'replace', kind: 'danger', choice: true },
        { label: 'Cancel', value: null }
      ] });
    if (!mode) return;
    if (mode === 'replace' && !await dialog({ title: 'Replace all pages?', message: `${mine === 1 ? `“${S.board.name}” is` : `All ${mine} pages are`} deleted from this device, and the ${n} pages in “${name}” take ${mine === 1 ? 'its' : 'their'} place.`,
      actions: [{ label: 'Replace all pages', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] })) return;
    Lock.letGo();   // ("Unlock and open": now, section 12b)
    return openAsPages(p.pages, file, mode === 'replace');
  }
  // Each page in a file becomes a new page (after this one; or, for several, after the last). replace: then the
  // pages that were here are deleted, with Undo (it brings them back and takes the new ones away).
  async function openAsPages(list, file, replace) {
    if (Pages.busy) return;
    const was = Pages.ids(), from = S.boardId, made = [];
    Pages.busy = true;
    let failed = null;
    try { await Pages.addFrom(list, { end: list.length > 1, made, reuse: replace ? was : [] }); }
    catch (err) { console.error(err); failed = err; }
    finally { Pages.busy = false; }
    // All or nothing: if a page couldn't be added (a window was being moved, say), those that were go again, and
    // (Replace) the pages here stay.
    if (made.length < list.length || failed) {
      if (made.length) await Pages.discard(made, from);
      toast((failed ? 'Import failed: ' + ((failed && failed.message) || failed) : 'The import didn’t finish.') + (replace ? ' Your pages are as they were.' : ''));
      Picker.renderControls();
      return;
    }
    if (made[0] !== S.boardId) await Pages.go(made[0], { quiet: true });
    Pages.flash();
    const name = file ? file.name.replace(/\.21board$/i, '') : '';
    if (replace) { Pages.drop(was, `Replaced your pages with the ${made.length} in “${name}”.`, () => Pages.discard(made)); return; }
    const say = made.length > 1 ? `Added ${made.length} pages.` : `Opened “${name}” as a new page.`;
    toast(say, { action: 'Undo', pages: true, timeout: PAGE_UNDO_MS, onAction: async () => { await Pages.discard(made, from); } });
    Picker.renderControls();
  }

  // opts.uid: this board becomes that board (loading it from the shared folder), so later versions match.
  // opts.history: {reason, label} for the version of the board as it is now that's saved first (Board history),
  //   or false for none. opts.mustSnapshot: if that version can't be saved, ask before going on.
  // opts.photo: 'file' (default: the file's photo replaces this device's, if it has one; a sent file that says
  //   the photo was taken off removes it), 'exact' (the board gets exactly the file's photo, or none), 'keep'
  //   (this device's photo is left as it is).
  // opts.keepCreated: windows keep the file's createdAt. Returns the id of the version saved first (or null),
  // or false if cancelled.
  async function applyImport(p, mode, opts = {}) {
    // Changes that couldn't be saved yet (or a board that has to be written back first: Writer.restore, found
    // out by opening the database) would be written over the new board later: save them first, or stop.
    if (!Store.mem) await Store.open().catch(() => {});
    if (Writer.failing || Store.lost) { Writer.retry(); if (!await Writer.settled(5000) || Store.lost) throw new Error('21Board can’t save on this device right now, so nothing was changed.'); }
    const b = S.boardId;
    let undoId = null;
    if (opts.history !== false) {
      const h = opts.history || (mode === 'add' ? { reason: 'add', label: 'Before adding windows from a file' } : { reason: 'import', label: 'Before importing a board' });
      undoId = await BoardHistory.before(h.reason, h.label, Object.assign({ target: h.target }, opts.mustSnapshot ? { timeout: 30000 } : {}));
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
      const widget = getWidget(i.widgetId);
      if (mode === 'add') {
        // One window per `single` widget (a district app): a file adds none where the board has one (or added one).
        if (widget && widget.single && used.has(i.widgetId)) continue;
        const set = used.get(i.widgetId) || new Set();
        n = 1; while (set.has(n)) n++;
        set.add(n); used.set(i.widgetId, set);
      }
      let rect = convert(i.rect);
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
    // The background photo belongs to this device: only a file that brings its own photo replaces it, and
    // only a sent file that says the photo was taken off removes it (or, going back in Board history, the
    // board gets exactly the photo it had then).
    const clearPhoto = photoMode === 'exact' || (photoMode === 'file' && (!!p.photo || !!p.noPhoto));
    try {
      await Store.tx('readwrite', s => {
        if (mode === 'replace') {
          for (const kind of ['inst', 'data', 'conf'].concat(clearPhoto ? ['media'] : [])) s.delete(IDBKeyRange.bound(`${kind}:${b}:`, `${kind}:${b}:￿`));
        }
        for (const r of out) s.put(r);
      });
      // (Only once it is stored: a failed import changed nothing, and other tabs must keep what they hold.)
      Sync.announce([], { op: 'reload', replaced: mode === 'replace' && !opts.fresh });   // (fresh: a new page, nothing of the others' to forget)
    } finally {
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
  // an automatic send waits, a manual one asks (load theirs, or send mine and keep theirs as a copy). Every
  // file with the board's uid counts (Drive can leave two), and a file that can't be read yet isn't taken
  // for no file: a send waits for one that may be this board's.
  // - "<name> (copy from …).21board": a copy kept, with a new uid, before loading over local changes.
  // - "About this folder.txt" explains the files to anyone browsing the folder. Other files are left alone.
  // Sending: Settings → Google Drive folder → Send, or "Send automatically", once the board has been left
  // alone: for a few seconds ("After each change", where boards are prepared) or for 10 minutes ("When left
  // alone", for a smartboard: a version that another device hasn't loaded holds up that device's own
  // automatic sends, so taps in class must not each make one). What wasn't sent (21Board was closed first, the
  // folder couldn't be used) goes out after a later look at the folder, but not in the first minutes after
  // 21Board opens or the device wakes up: Google Drive may still be bringing a version that another device
  // sent meanwhile, and that one must be offered here, not written over (see held). Receiving: the folder is
  // checked when 21Board opens, when it comes back to the front, and every 2 minutes; a newer version of this
  // board from another device is offered with "Load" (never applied silently).
  // While the folder can't be used (Chrome wants to be asked again, the folder is gone, an automatic send
  // failed), a note stays on the board: see FolderNote.
  // On this device only (never exported): link:folder (the folder handle) and link:state
  // {device: {id, label}, auto, calm, photo, boards: {uid: {file, also: [files used before], seen: [version ids],
  //   headId, headMine, sentAt, sentSig, loadedSentAt, loadedFrom, loadedSig, photo (see photoRule)}},
  //   late: {file name: {size, lastModified}} (files that can't be read and have had their full wait, see scan)}.
  // =====================================================================
  const LINK_CHECK_MS = 2 * 60 * 1000;
  const LINK_AUTO_MS = 8000;                 // "After each change"
  const LINK_CALM_MS = 10 * 60 * 1000;       // "When left alone"
  const LINK_SETTLE_MS = 2 * 60 * 1000;      // how long Google Drive gets, after 21Board opens or the device wakes, before a change from before that is sent
  const LINK_ARRIVE_MS = 10 * 60 * 1000;     // how long automatic sends wait for a file that can't be read yet
  const LINK_LOST_MS = 5 * 60 * 1000;        // a folder missing this long was probably renamed, moved or deleted
  const LINK_README = 'About this folder.txt';
  // Folder problems in plain words: what happened, and what to do. (The browser's own wording goes to the console.)
  const LINK_SAY = {
    missing: ['the folder can’t be found', 'If it was renamed, moved or deleted, choose it again in Settings › Google Drive folder.'],
    allow: ['Chrome needs you to allow the folder again', 'Tap “Reconnect folder” on the board.'],
    readonly: ['the folder can only be viewed, not changed', 'Ask its owner to let you edit it, or choose another folder in Settings › Google Drive folder.'],
    full: ['there’s no room left', 'Make room in Google Drive (or on this device).'],
    other: ['the file couldn’t be saved in the folder', 'If this goes on, check that Google Drive is working on this device.']
  };
  const Link = {
    supported: !LAB && !KIOSK && typeof window.showDirectoryPicker === 'function',
    dir: null,          // FileSystemDirectoryHandle
    perm: 'none',       // 'none' (no folder) | 'granted' | 'prompt' | 'denied'
    st: { device: null, auto: false, calm: false, photo: true, boards: {} },
    found: [],          // boards in the folder: {name, uid, title, sentAt, by, from, kind, size, lastModified}
    cache: new Map(),   // file name -> {lastModified, size, meta}
    names: new Set(),   // every .21board name in the folder, lowercased
    unread: new Map(),  // board files that couldn't be read at the last look: lowercased name -> {name, since, uid (if read before), size, lastModified, waited (if size and date can be read)}
    offer: null, offerToast: null, dismissed: '',
    scanning: null, busy: false, loading: false, autoT: 0, lastCheck: 0, started: false, nagged: false, nagToast: null, gen: 0, nagAt: 0,
    waits: { now: LINK_AUTO_MS, calm: LINK_CALM_MS, settle: LINK_SETTLE_MS },   // (tests shorten them)
    beatAt: 0, freshAt: 0,   // when 21Board was last seen running here; when it opened, or the device woke up or came back online (see awake)
    trouble: null,      // why the folder can't be used right now: {kind: 'missing' | 'send', code, since, at, said}
    failed: null,       // the last send that didn't work: {at, code}
    checkedAt: 0, retryT: 0,
    unsent: false, comparedAt: 0,   // "Send automatically": a change may be waiting; when the board was last found the same as what was sent
    owned: new Set(),   // this device's own versions found in the folder without a note of them (noted once)

    // ---- this device's records
    applyRecord(name, value) {
      if (name === 'folder') {
        this.dir = value && typeof value === 'object' && value.kind === 'directory' ? value : null;
        this.found = []; this.cache.clear(); this.unread.clear(); this.names = new Set(); this.setOffer(null);
        clearTimeout(this.retryT); this.trouble = this.failed = null; this.checkedAt = 0;
        if (this.started) this.refresh(); else FolderNote.update();
      } else if (name === 'state') {
        const v = value && typeof value === 'object' ? value : {};
        this.st = { device: v.device && UID_RE.test(v.device.id || '') ? v.device : null, auto: !!v.auto, calm: !!v.calm, photo: v.photo !== false, boards: v.boards && typeof v.boards === 'object' ? v.boards : {},
          late: v.late && typeof v.late === 'object' ? v.late : {} };
        this.computeOffer();
        FolderNote.update();
      }
    },
    saveState(patch) {
      this.st = Object.assign({}, this.st, patch);
      Writer.put(Keys.link('state'), 'link', this.st);
      this.redraw();
    },
    // The note on the board and Settings show how the folder is doing.
    redraw() { FolderNote.update(); if (Settings.isOpen) Settings.render(); },
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
      if (!this.dir) { this.perm = 'none'; this.redraw(); return; }
      try { this.perm = typeof this.dir.queryPermission === 'function' ? await this.dir.queryPermission({ mode: 'readwrite' }) : 'granted'; } catch (e) { this.perm = 'denied'; }
      this.redraw();
      if (this.perm === 'granted') { this.unnag(); await this.check(); }
      else if (this.perm === 'prompt' && !this.nagged && Object.keys(this.st.boards || {}).length) {
        this.nagged = true;   // (said once; the note on the board stays: see FolderNote)
        this.nagToast = toast(`Reconnect your “${this.dir.name}” folder to keep this board up to date with your other devices.`, { action: 'Reconnect', timeout: 12000, onAction: () => this.reconnect() });
      }
    },
    // The folder is allowed again: the message at start that asked for it goes (it would say the opposite of
    // "connected again" beside it).
    unnag() {
      if (this.nagToast && this.nagToast.isConnected) this.nagToast.remove2();
      this.nagToast = null;
    },
    // Must run from a tap (Chrome only asks then).
    async ensurePerm() {
      if (!this.dir) return false;
      if (this.perm === 'granted') return true;
      try { this.perm = typeof this.dir.requestPermission === 'function' ? await this.dir.requestPermission({ mode: 'readwrite' }) : 'granted'; } catch (e) { this.perm = 'denied'; }
      this.redraw();
      if (this.perm === 'granted') this.unnag();
      return this.perm === 'granted';
    },
    // From a tap (the note on the board, the message at start, Settings). Once allowed, the folder is checked,
    // and what "Send automatically" couldn't send goes out.
    async reconnect() {
      if (this.perm === 'granted') { await this.check(true); return; }
      if (await this.ensurePerm()) { toast(`Your “${this.dir.name}” folder is connected again.`); await this.check(true); }
      else if (this.perm === 'denied') FolderNote.explain();   // Chrome refused without asking
      else toast('21Board can’t use that folder until you allow it.');
    },
    // What keeps the folder from being used right now, if anything: 'allow' (Chrome wants to be asked again),
    // 'missing' (it can't be found or read), 'send' (an automatic send failed).
    problem() {
      if (!this.dir) return '';
      if (this.perm === 'prompt' || this.perm === 'denied') return 'allow';
      const t = this.trouble;
      return t && (t.kind !== 'send' || this.st.auto) ? t.kind : '';
    },
    // What went wrong with the folder: a key of LINK_SAY. Chrome's "not allowed" is either its own permission
    // (then this.perm says so, and the teacher is asked again from a tap) or a folder shared for viewing only.
    async codeOf(err) {
      const n = err && err.name;
      if (n === 'NotFoundError') return 'missing';
      if (n === 'QuotaExceededError') return 'full';
      if (n === 'NoModificationAllowedError') return 'readonly';
      if (n === 'NotAllowedError' || n === 'SecurityError') {
        try { this.perm = typeof this.dir.queryPermission === 'function' ? await this.dir.queryPermission({ mode: 'readwrite' }) : 'granted'; } catch (e) { this.perm = 'prompt'; }
        return this.perm === 'granted' ? 'readonly' : 'allow';
      }
      return 'other';
    },
    // The folder can't be found or read. The note on the board says so at once and stays; a message says it
    // once, and only when it has been gone for a minute (at sign-in, Google Drive may still be starting).
    // 21Board looks again by itself: every 20 seconds at first, then with the usual checks. told: the teacher
    // has just been told.
    lost(told) {
      const t = this.trouble && this.trouble.kind === 'missing' ? this.trouble : (this.trouble = { kind: 'missing', code: 'missing', since: Date.now(), said: false });
      t.at = Date.now();
      if (told) t.said = true;
      if (!t.said && t.at - t.since >= 60 * 1000) {
        t.said = true;
        toast(`21Board can’t find your “${this.dir.name}” folder, so this board isn’t shared right now. It keeps looking.`, { action: 'Details', timeout: 10000, onAction: () => FolderNote.explain() });
      }
      clearTimeout(this.retryT);
      if (Date.now() - t.since < 2 * 60 * 1000) this.retryT = setTimeout(() => this.check(true), 20000);
    },
    // An automatic send didn't work: said the first time. The note on the board stays until one works (it is
    // tried again at each look at the folder).
    stuck(code) {
      const t = this.trouble && this.trouble.kind === 'send' ? this.trouble : (this.trouble = { kind: 'send', since: Date.now(), said: false });
      t.code = code; t.at = Date.now();
      if (t.said) return;
      t.said = true;
      toast(`Couldn’t send this board to your folder: ${LINK_SAY[code][0]}. 21Board keeps trying.`, { action: 'Details', timeout: 10000, onAction: () => FolderNote.explain() });
    },
    // Nothing is left to send: it went out, or the board is again what was sent or loaded (the change was
    // taken back, the other device's version was loaded). "Not sent" goes: nothing is being tried any more.
    unstuck() {
      const was = this.failed || (this.trouble && this.trouble.kind === 'send');
      this.failed = null;
      if (this.trouble && this.trouble.kind === 'send') this.trouble = null;
      if (was) this.redraw();
    },

    // ---- linking (from a tap)
    async choose() {
      let h;
      try { h = await window.showDirectoryPicker({ id: '21board', mode: 'readwrite' }); } catch (err) {
        if (!err || err.name !== 'AbortError') { console.warn('21Board: the folder couldn’t be chosen', err); toast('That folder couldn’t be opened. Try again, or choose another folder.'); }
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
      this.redraw();
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
        open: Array.isArray(j.instances) ? j.instances.filter(i => i && i.open).length : null,   // open windows (null: not known)
        kind: j.kind === 'template' ? 'template' : 'full', size: file.size, lastModified: file.lastModified };
    },
    // Every board file in the folder (files that didn't change since the last look aren't read again).
    // this.names: every .21board name, even files that can't be read yet (still arriving): never reused.
    // this.unread: those files, since when, and whose they were if they could be read before (see arriving).
    async scan() {
      if (this.scanning) return this.scanning;
      this.scanning = (async () => {
        const out = [], names = new Set(), lc = new Set(), unread = new Map(), gen = this.gen;
        // since: when this device first found the file unreadable as it is now (same size and date, where those
        // can be read). Not the file's own date: a version sent last night is still arriving this morning.
        // waited: as it is now, it has had its full time before (st.late, kept when 21Board closes), so that a
        // damaged file isn't waited for every time 21Board opens. See overdue.
        const miss = (name, file) => {
          const n = name.toLowerCase(), c = this.cache.get(name), was = this.unread.get(n), old = file && (this.st.late || {})[n];
          const same = was && (!file || was.size === undefined || (was.size === file.size && was.lastModified === file.lastModified));
          unread.set(n, Object.assign({ name, since: same ? was.since : Date.now(), uid: c && c.meta ? c.meta.uid : was && was.uid || null },
            file ? { size: file.size, lastModified: file.lastModified, waited: !!old && old.size === file.size && old.lastModified === file.lastModified } : {}));
        };
        for await (const [name, h] of this.dir.entries()) {
          if (h.kind !== 'file' || !/\.21board$/i.test(name)) continue;
          names.add(name); lc.add(name.toLowerCase());
          let file;
          try { file = await h.getFile(); } catch (e) { miss(name); continue; }
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
          } catch (e) { miss(name, file); continue; }   // still arriving, or damaged: look again next time
          this.cache.set(name, { lastModified: file.lastModified, size: file.size, meta });
          if (meta) out.push(meta);
        }
        for (const n of Array.from(this.cache.keys())) if (!names.has(n)) this.cache.delete(n);
        this.names = lc;
        this.unread = unread;
        const late = {};
        for (const [n, u] of unread) if (u.size !== undefined && this.overdue(u)) late[n] = { size: u.size, lastModified: u.lastModified };
        if (gen === this.gen && JSON.stringify(late) !== JSON.stringify(this.st.late || {})) this.saveState({ late });
        this.found = out.sort((a, b) => b.lastModified - a.lastModified);   // this device's clock: newest arrival first
        return this.found;
      })();
      try { return await this.scanning; } finally { this.scanning = null; }
    },
    // 21Board has just opened, or stood still for a while (the device slept): Google Drive may not have
    // brought what the other devices sent meanwhile (see held). The timer in start() keeps beatAt going
    // while 21Board runs.
    awake() {
      const now = Date.now();
      if (now - this.beatAt > 2 * LINK_CHECK_MS) this.freshAt = now;
      this.beatAt = now;
    },
    async check(force) {
      this.awake();
      if (!this.dir || this.perm !== 'granted') return;
      if (!force && Date.now() - this.lastCheck < 5000) return;
      this.lastCheck = Date.now();
      clearTimeout(this.retryT);
      const dir = this.dir;
      let ok = false;
      try { await this.scan(); ok = true; } catch (err) {
        if (dir !== this.dir) return;   // unlinked meanwhile
        console.warn('21Board: could not read the shared folder', err);
        if (await this.codeOf(err) !== 'allow') this.lost();   // ('allow': Chrome wants to be asked again, see problem)
      }
      // (A folder that is back, e.g. once Google Drive has started: Drive gets its time from now.)
      if (ok) { this.checkedAt = Date.now(); if (this.trouble && this.trouble.kind === 'missing') { this.trouble = null; this.freshAt = Date.now(); } }
      this.computeOffer();
      this.redraw();
      if (ok) this.catchUp();
    },
    // The folder's versions of a board that this device hasn't seen (sent or loaded), newest first.
    // Versions are compared by id, never by time: two devices' clocks can disagree. Every file with the
    // board's uid counts, not only the newest: Drive can leave two ("Room 12 (1)"), and a version sent beside a
    // file that couldn't be read yet must not hide the version in that file.
    unseenAll(uid) {
      if (!uid) return [];
      const files = this.found.filter(x => x.uid === uid && x.kind === 'full' && x.vid);   // found is newest first
      const rec = this.boardRec(uid) || {}, me = (this.st.device || {}).id, seen = new Set(rec.seen || []);
      // A file sent by the first test build (no version ids): if this device sent or loaded exactly that one,
      // it has seen it.
      const f = files[0];
      if (f && f.legacy && !rec.seen) {
        const mine = f.by === me && f.sentAt === rec.sentAt, loaded = f.sentAt === rec.loadedSentAt;
        if (mine || loaded) { seen.add(f.vid); this.remember(uid, f.vid, { headId: f.vid, headMine: mine && (rec.sentAt || 0) >= (rec.loadedSentAt || 0) }); }
      }
      return files.filter(x => {
        if (seen.has(x.vid)) return false;
        if (!me || x.by !== me || x.legacy) return true;
        // Sent from this device, but 21Board was closed before it could note that: its own version, not news.
        if (!this.owned.has(x.vid)) { this.owned.add(x.vid); this.remember(uid, x.vid, {}); }
        return false;
      });
    },
    unseen(uid) { return this.unseenAll(uid)[0] || null; },
    // A board file that can't be read yet (still arriving from Google Drive) and may hold a newer version of
    // this board: one that was this board's when it could last be read, the file this device last used for
    // it, or one named after the board. A send waits for it rather than go in beside it.
    arriving(uid) {
      const file = ((this.boardRec(uid) || {}).file || '').toLowerCase(), base = this.safeName(S.board.name).toLowerCase();
      for (const [n, u] of this.unread) {
        if (u.uid ? u.uid === uid : n === file || (n.startsWith(base) && /^( \(\d+\))?\.21board$/.test(n.slice(base.length)))) return u;
      }
      return null;
    },
    // A file that can't be read (u, from this.unread) has had its time: 10 minutes in which Google Drive could
    // have brought it. They count from when 21Board opened or the device woke up (freshAt), if that was after
    // the file was first found so: Drive does nothing while the device is off or asleep.
    overdue(u) { return !!u.waited || Date.now() - Math.max(u.since, this.freshAt) >= LINK_ARRIVE_MS; },
    computeOffer() { this.setOffer(this.unseen(S.board.uid)); },
    setOffer(f, opts = {}) {
      const key = f ? f.vid : '', cur = this.offer ? this.offer.vid : '';
      if (!opts.again && key === cur && (!f || key === this.dismissed || (this.offerToast && this.offerToast.isConnected))) return;
      this.offer = f;
      if (this.offerToast) { if (this.offerToast.isConnected) this.offerToast.remove2(); this.offerToast = null; }
      if (!f || key === this.dismissed || typeof document === 'undefined') return;
      // (An emptied board, e.g. after a student's "Close all", says so: it isn't loaded by reflex.)
      const empty = f.open === 0 && Array.from(S.insts.values()).some(i => i.open);
      this.offerToast = toast(`“${f.title}” was updated on ${f.from || 'another device'} ${when(f.sentAt)}.` + (empty ? ' That version has no open windows.' : '') + (opts.blocked ? ' Changes made here aren’t sent until you load it (or choose in Settings › Send).' : ''), {
        action: 'Load', dismiss: 'Not now', timeout: 0,
        onAction: () => { this.offerToast = null; this.load(f.name, { unlock: f.title }); },   // (windows locked: unlock first, section 12b)
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
        const theirs = this.unseen(uid), kept = new Set();   // kept: the versions put aside as copies ("Send mine")
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
          // Theirs is kept first (each of them, if the board has two files): if one can't be read just now,
          // nothing is sent over it.
          for (const f of this.unseenAll(uid)) {
            let j;
            try { j = JSON.parse(await this.readFile(f.name)); } catch (e) { j = null; }
            if (!j || j.format !== '21board') { toast('Their version can’t be read just now, so nothing was sent. Try again in a moment.', { timeout: 8000 }); return false; }
            kept.add(this.vidOf(j.sent));
            await this.writeCopy(j, f.from);
          }
        }
        // A file that may be a newer version of this board can't be read yet: wait for it rather than send
        // beside it. (Not for ever: one that never becomes readable must not stop automatic sends for good.)
        const late = this.arriving(uid);
        if (late && opts.auto && !this.overdue(late)) return false;
        if (late && !opts.auto) {
          const go = await dialog({
            title: 'A file for this board is still arriving',
            message: `Google Drive hasn’t finished bringing “${late.name}” to this device, and it may be a newer version of this board. Wait a moment, then try again. Or send now: your version goes in the folder beside it, and nothing is replaced.`,
            actions: [{ label: 'Try again', value: 'retry', kind: 'primary' }, { label: 'Send now', value: 'send' }, { label: 'Cancel', value: null }]
          });
          if (go === 'retry') { then = () => this.send(); return false; }
          if (go !== 'send') return false;
        }
        const rec = this.boardRec(uid) || {}, dev = this.device(), gen = this.gen, at = Date.now();
        const exp = await buildExport('full');
        // (Another board took this one's place meanwhile, by Import or Undo: nothing is sent, renamed or
        // removed as the wrong board. See swap.)
        if (S.board.uid !== uid || exp.board.uid !== uid) return false;
        const sig = this.sigOf(exp);
        this.photoRule(exp, typeof rec.photo === 'boolean');
        // id: this version; base: the version this board was built on; mine: each device's latest version it
        // includes (to spot a version made without this device's last send).
        const sentId = newId();
        const sent = { id: sentId, base: rec.headId || null, at: Date.now(), by: dev.id, from: dev.label, mine: Object.assign({}, rec.mine || {}, { [dev.id]: sentId }) };
        const out = Object.assign({ format: exp.format, formatVersion: exp.formatVersion, kind: exp.kind, sent }, exp);
        const name = await this.fileNameFor(uid, exp.board.name);
        // (The folder was just looked at again, for the name.) A version that arrived while a question was open
        // or the board was being read is never written over: the teacher is asked again.
        if (this.unseenAll(uid).some(f => !kept.has(f.vid))) { if (opts.auto) this.computeOffer(); else then = () => this.send(); return false; }
        await this.writeFile(name, JSON.stringify(out));
        // One file per board. The files this device used for it before are removed (the board was renamed, or a
        // send had to go in beside a file that couldn't be read), but only with a version this device has seen in
        // them; and so are the files whose version was just kept as a copy. Any other file is left alone. (A
        // name that differs only in capitals: only where the folder keeps both spellings as two files.)
        const olds = (rec.also || []).concat(rec.file || []).filter(n => n !== name).map(n => n.toLowerCase()), seen = new Set(rec.seen || []);
        const also = [];
        for (const f of this.found) {
          if (f.uid !== uid || f.kind !== 'full' || !f.vid || f.name === name) continue;
          const old = olds.includes(f.name.toLowerCase());
          if (!kept.has(f.vid) && !(old && seen.has(f.vid))) { if (old) also.push(f.name); continue; }
          if (f.name.toLowerCase() === name.toLowerCase()) {
            const names = [];
            for await (const [n] of this.dir.entries()) names.push(n);
            if (!names.includes(f.name) || !names.includes(name)) continue;
          }
          try { await this.dir.removeEntry(f.name); } catch (e) { /* already gone */ }
        }
        this.cache.delete(name);
        for (const vid of kept) await this.remember(uid, vid, {}, gen);   // (decided: they aren't offered again)
        // (loadedSig goes: from now on the board is compared with this version only, so that changing it back to
        // what was loaded is a change to send. photo: what this version says about the photo, see photoRule.)
        await this.remember(uid, sent.id, Object.assign({ file: name, also, sentAt: sent.at, sentSig: sig, loadedSig: null, headId: sent.id, headMine: true, mine: sent.mine }, exp.media ? { photo: !!exp.media.background } : {}), gen);
        if (gen === this.gen) { this.comparedAt = at; this.unstuck(); }
        updateSettings({ lastBackupAt: Date.now() });   // the folder copy is a backup too
        if (!opts.auto) toast(`Sent “${exp.board.name}” to your “${this.dir.name}” folder. Google Drive brings it to your other devices.`);
        await this.check(true);
        return true;
      } catch (err) {
        console.error(err);
        if (!this.dir) return false;   // erased or unlinked meanwhile
        // Said in plain words: at once for a send by hand; for an automatic one the first time, and by the note
        // on the board until one works (Settings says it too).
        const code = await this.codeOf(err);
        this.failed = { at: Date.now(), code };
        if (code === 'missing') this.lost(!opts.auto);
        else if (opts.auto && code !== 'allow') this.stuck(code);
        if (!opts.auto) toast(`Couldn’t send this board: ${LINK_SAY[code][0]}. ${LINK_SAY[code][1]}`, { timeout: 10000 });
        return false;
      } finally {
        this.busy = false;
        this.redraw();
        if (then) await then();
      }
    },
    // "Include the background photo" (for a file that goes to the folder). Off: the file says nothing about
    // the photo, and a device that loads it keeps its own. On: the photo goes with the board, and so does
    // taking it off. gone: the version of this board that this device last sent or loaded had a photo (or
    // said it had been taken off), and the board has none now: the file says so ("background": null), and
    // loading it takes the photo off there too. A board that never had a photo says nothing: a photo put on
    // at another device only (the smartboard's own) stays there.
    photoRule(exp, gone) {
      if (!this.st.photo) delete exp.media;
      else if (!exp.media && gone) exp.media = { background: null };
      return exp;
    },
    // Loading a sent file p that says the photo was taken off: the photo here stays if the version this device
    // last sent or loaded said so already. It was put on here since then, and is this device's own (files go
    // on saying "taken off" until a photo is sent again).
    ownPhoto(uid, p) { return !!p.noPhoto && (this.boardRec(uid) || {}).photo === false; },
    // "Send automatically" sends once the board has been left alone for this long.
    wait() { return this.st.calm ? this.waits.calm : this.waits.now; },
    // When this board last changed on this device, in any tab or session (a record's revision is the time it
    // was written).
    lastChange() {
      let t = 0;
      const b = S.boardId;
      for (const [key, rev] of Known) { const p = Keys.parse(key); if (rev > t && p.board === b && /^(board|inst|data|conf|media)$/.test(p.kind)) t = rev; }
      return t;
    },
    // A board record changed here: with "Send automatically" on, send once the board has been left alone.
    changed(keys) {
      if (!this.st.auto || !this.dir) return;
      const b = S.boardId;
      if (!keys.some(k => { const p = Keys.parse(k); return p.board === b && /^(board|inst|data|conf|media)$/.test(p.kind); })) return;
      this.unsent = true;
      clearTimeout(this.autoT);
      this.autoT = setTimeout(() => this.autoSend(), this.wait());
    },
    // How much longer a change made before 21Board opened (or before the device woke up or came back online:
    // freshAt) has to wait. Sent at once, it could go over a version that another device sent meanwhile and
    // that Google Drive hasn't brought here yet: Drive gets a couple of minutes first, so that such a version
    // is offered instead. ("When left alone": the board's quiet time counts from then, not from the change.)
    // A change made since then is sent as usual.
    held(last = this.lastChange()) {
      return last < this.freshAt ? Math.max(0, this.freshAt + Math.max(this.wait(), this.waits.settle) - Date.now()) : 0;
    },
    // After a look at the folder: what "Send automatically" hasn't sent yet goes out (21Board was closed before
    // it could, the change was made in another tab, the folder couldn't be used, the send was held up), still
    // only once the board has been left alone, and not before Google Drive has had its time (see held). (Not
    // while another device's version waits: the teacher decides, and the next change here says so.)
    catchUp() {
      if (!this.st.auto || this.autoT || this.busy || this.loading || this.offer) return;
      const last = this.lastChange(), wait = this.wait();
      if (!this.unsent && last <= this.comparedAt) return;   // nothing changed since the board was last found the same as what was sent
      // (A moment later than the tab the change was made in, so that only one of them sends it.)
      this.autoT = setTimeout(() => this.autoSend(), Math.max(0, Math.min(wait, last + wait - Date.now()), this.held(last)) + 3000);
    },
    async autoSend() {
      clearTimeout(this.autoT); this.autoT = 0;
      if (!this.st.auto || !this.dir || this.perm !== 'granted' || this.loading || this.busy) return;
      // (Also when this runs early or late: 21Board is being left, or its timer came due while the device slept.)
      this.awake();
      const hold = this.held();
      if (hold > 0) { this.unsent = true; this.autoT = setTimeout(() => this.autoSend(), hold); return; }
      const at = Date.now();
      this.unsent = false;   // (a change made from here on sets it again)
      const rec = this.boardRec(S.board.uid), sig = await this.sig();
      if (rec && (sig === rec.sentSig || sig === rec.loadedSig)) { this.comparedAt = at; this.unstuck(); return; }   // nothing new since it was sent or loaded
      if (this.offer) {   // a version from another device is waiting: never send over it, but say so (even after "Not now")
        this.unsent = true;
        if (Date.now() - (this.nagAt || 0) > 5 * 60 * 1000) { this.nagAt = Date.now(); this.dismissed = ''; this.setOffer(this.offer, { again: true, blocked: true }); }
        return;
      }
      if (!await this.send({ auto: true })) this.unsent = true;   // tried again after the next look at the folder
    },
    // A send that is under way gets to finish (not for ever: one that hangs is stopped by the check in send).
    async idle() { for (let i = 0; this.busy && i < 150; i++) await sleep(100); },
    // Another board is about to take this one's place (Load, Import): first send this one's pending automatic
    // change, so it isn't lost. (Except a change from before 21Board opened, in its first minutes: see held.
    // It stays in Board history, and Load says that it wasn't sent.)
    async leaving(uid) {
      await this.idle();
      if (uid !== S.board.uid && this.st.auto && this.dir && (this.autoT || await this.localChanges())) await this.autoSend();
    },
    // fn puts other content on the board, perhaps another board (Import, going back, Undo). A send must never
    // start with one board and write as another (it would rename or remove the first one's file): one that is
    // under way finishes first, and none starts until fn is done.
    async swap(fn) {
      for (let i = 0; (this.busy || this.loading) && i < 150; i++) await sleep(100);
      this.loading = true;
      try { return await fn(); } finally { this.loading = false; }
    },
    // This board is now the version in a sent file p (after Load, or after the file was opened with Import).
    // (sentSig goes: the board is compared with this version only. photo: what the file says about the photo.)
    async loaded(uid, p, patch, gen) {
      const s = p.sent || {}, vid = this.vidOf(p.sent);
      const loadedSig = await this.sig();
      await this.remember(uid, vid, Object.assign({ loadedSentAt: s.at || Date.now(), loadedFrom: s.from || '', loadedSig, sentSig: null, headId: vid || null, headMine: !!vid && s.by === (this.st.device || {}).id,
        mine: Object.assign({}, s.mine || {}, s.by && vid ? { [s.by]: vid } : {}) }, p.photo ? { photo: true } : p.noPhoto ? { photo: false } : {}, patch), gen);
      this.comparedAt = Date.now();
      this.unstuck();
    },

    // ---- receiving (from a tap). opts.keepMine: a copy of this board was asked for already.
    async load(name, opts = {}) {
      if (opts.unlock !== undefined && !await Lock.letIn({ name: opts.unlock }, 'load')) return false;   // windows locked (section 12b)
      if (!await this.ensurePerm()) { toast('21Board can’t use that folder until you allow it.'); return false; }
      if (this.busy || this.loading) { toast('Just a moment: 21Board is still sending or loading this board.'); return false; }
      try { await this.leaving(parseBoardFile(await this.readFile(name)).board.uid); } catch (e) { /* read again below */ }
      const gen = this.gen;
      this.loading = true;
      clearTimeout(this.autoT); this.autoT = 0;   // a pending automatic send must not go out over this
      let loaded = false;
      try {
        let raw, parsed;
        try { raw = await this.readFile(name); } catch (err) {
          console.warn('21Board: could not read a board file', err);
          const gone = err && err.name === 'NotFoundError';
          toast(gone ? `“${name.replace(/\.21board$/i, '')}” isn’t in the folder any more.` : `“${name.replace(/\.21board$/i, '')}” can’t be opened yet. Google Drive may still be bringing it to this device: try again in a moment.`, { timeout: 8000 });
          if (gone) this.check(true);
          return false;
        }
        try { parsed = parseBoardFile(raw); } catch (err) { toast(`Couldn’t read “${name}”: ${err.message}`); return false; }
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
        // (Nor a board that is another page here: this page becomes a copy of it, with an id of its own.)
        const newUid = parsed.board.uid && vid && !Pages.owner(parsed.board.uid) ? parsed.board.uid : newId();
        if (opts.unlock !== undefined) Lock.letGo();   // ("Unlock and load": now, section 12b)
        let undoId;
        try { undoId = await applyImport(parsed, 'replace', { uid: newUid, keepCreated: true, photo: this.ownPhoto(newUid, parsed) ? 'keep' : 'file', history: { reason: 'load', label: `Before loading the version from ${s2.from || 'another device'}` } }); } catch (err) { console.error(err); toast('Couldn’t load the board: ' + ((err && err.message) || err)); return false; }
        // (The file this device used for the board until now is remembered: its next send tidies it away.)
        const was = this.boardRec(newUid) || {};
        await this.loaded(newUid, parsed, { file: name, also: Array.from(new Set((was.also || []).concat(was.file || []))).filter(n => n !== name) }, gen);
        loaded = true;
        this.computeOffer();
        toast(`Loaded “${S.board.name}”${s2.from ? ' from ' + s2.from : ''}.`, undoAction(undoId, 'loading it'));
        return true;
      } finally {
        this.loading = false;
        if (!loaded && this.st.auto) this.changed([Keys.board(S.boardId)]);   // kept their own changes: send them later
      }
    },
    // Before loading over changes made here: keep them in the folder as a separate board.
    async saveCopy() {
      try {
        const name = await this.writeCopy(this.photoRule(await buildExport('full')));
        toast(`Kept a copy of this board in your folder: “${name.replace(/\.21board$/i, '')}”.`);
        return true;
      } catch (err) {
        console.error(err);
        const say = LINK_SAY[await this.codeOf(err)];
        toast(`Couldn’t keep a copy, so nothing was changed: ${say[0]}. ${say[1]}`, { timeout: 10000 });
        this.redraw();
        return false;
      }
    },
    // Erase everything: this device forgets the folder and its bookkeeping.
    forget() {
      this.gen++;   // writes already under way won't save anything back
      clearTimeout(this.autoT); this.autoT = 0;
      clearTimeout(this.retryT);
      this.dir = null; this.perm = 'none'; this.found = []; this.names = new Set(); this.cache.clear(); this.unread.clear();
      this.trouble = this.failed = null; this.unsent = false; this.comparedAt = this.checkedAt = 0; this.owned.clear();
      this.st = { device: null, auto: false, calm: false, photo: true, boards: {} };
      this.setOffer(null);
      FolderNote.update();
    },

    // ---- startup: check now, when 21Board comes back to the front, and every few minutes
    start() {
      if (!this.supported || this.started) return;
      this.started = true;
      this.awake();
      this.refresh();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.refresh();
        else if (this.autoT && !this.st.calm) this.autoSend();   // leaving: send a pending change now ("When left alone" waits its time)
      });
      window.addEventListener('focus', () => this.check());
      window.addEventListener('online', () => { this.freshAt = Date.now(); });   // Google Drive can only now fetch what the other devices sent (see held)
      setInterval(() => { this.awake(); if (document.visibilityState === 'visible') this.check(true); }, LINK_CHECK_MS);
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
  //  - when a widget's content is suddenly emptied (e.g. a note cleared);
  //  - before Reset, Delete, Close all, a photo change, Import, Load from the folder, going back and Erase;
  //  - when the teacher taps "Save this version now" (kept until deleted).
  // Off (Settings) stops the first three (the automatic ones): the versions before risky actions are always
  // saved, because Undo depends on them.
  // Identical content is never saved twice. Kept: the newest 20; one an hour for the last 48 active hours; the
  // first and last of each day for 30 active days; one a week for 12 active weeks; safety versions (before…)
  // for 7 days; the version before a big change for 30 days. Photos are kept once (by identity), at most 5,
  // and the whole history stays within a share of the device's storage. When the browser refuses a save for
  // lack of space, history gives up a little at a time (see thin), never because a number looks low.
  // Going back replaces the board (after saving it as it is, so it can be undone) but never this device's
  // settings; "Put back" brings back one window. Records: see docs/DATA-FORMAT.md, "Board history".
  // =====================================================================
  const H_MIN = 60e3, H_HOUR = 60 * H_MIN, H_DAY = 24 * H_HOUR;
  const HIST = { quiet: 60e3, tick: 60e3, openDelay: 15e3, beforeTimeout: 1500, coalesce: 2 * H_MIN, emptyMin: 200, emptyRatio: 0.25, emptyEvery: 2 * H_MIN,
    safetyKeep: 7 * H_DAY, bigKeep: 30 * H_DAY, undoMs: 10 * H_MIN, folderEvery: H_HOUR, maxAuto: 5e6, maxBody: 15e6, photos: 5 };
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
  function undoAction(id, what) { return id ? { action: 'Undo', timeout: 20000, onAction: () => BoardHistory.restore(id, { undo: true, what }) } : {}; }

  const BoardHistory = {
    dbp: null, off: '', paused: '', status: '', low: false, metas: [], dirty: false, lastChangeAt: 0, firstDirtyAt: 0,
    timer: 0, started: false, capturing: false, undoable: null, guardAt: new Map(), folderStatus: '', budgetCache: null,
    tight: false, thinned: false,   // a save was refused for lack of space since 21Board opened; history gave some up (see thin)
    unread: false,                  // the last read of the list failed (see reload): it isn't empty, it's unknown
    cfgv: {},   // tests: {quiet, every, budget} in ms / bytes
    cfg(v) { this.cfgv = Object.assign({}, this.cfgv, v || {}); },
    // (Also where the saved board couldn't be opened and the teacher went on without it: its earlier versions
    // may be all that can be reached, and they are in a database of their own.)
    enabled() { return !LAB && Store.failed !== 'blocked' && this.off !== 'unavailable' && typeof indexedDB !== 'undefined'; },
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
        let reqErr = null;
        t.oncomplete = () => resolve(result);
        t.onerror = e => { reqErr = e.target && e.target.error; };   // a request failed: the abort that follows says why
        t.onabort = () => reject(t.error || reqErr || new Error('Transaction aborted'));
      });
    },
    range(b) { return IDBKeyRange.bound(`${b}:`, `${b}:￿`); },
    async reload() {
      if (!this.enabled()) { this.metas = []; return; }
      try { this.metas = (await this.tx(['meta'], 'readonly', (o, set) => { const q = o.meta.getAll(this.range(S.boardId)); q.onsuccess = () => set(q.result); })) || []; }
      catch (e) { this.metas = []; this.unread = true; console.warn('21Board: could not read board history', e); return; }
      this.unread = false;
      this.metas.sort((a, b) => b.at - a.at);
    },
    // A version of another page is never put on this one (an Undo offered there, say): false after saying so.
    ours(meta) { if (!meta || meta.b === undefined || +meta.b === S.boardId) return true; toast('That was on another page, so it can’t be done here.'); return false; },
    // A version to go back to, or null after saying why not: it is gone, or history can't be read just now.
    async find(id) {
      try { const r = await this.get(id); if (!r) toast('That version can’t be found anymore.'); return r; }
      catch (e) { toast('Couldn’t read board history just now. Try again in a moment.'); return null; }
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
      const wins = exp.instances.filter(i => i.open).sort((a, b) => (a.maximized ? 1 : 0) - (b.maximized ? 1 : 0) || a.z - b.z)
        .map(i => i.maximized ? [ikeyOf(i.widgetId, i.instance), 0, 0, vp.width, vp.height] : [ikeyOf(i.widgetId, i.instance), Math.round(i.rect.x), Math.round(i.rect.y), Math.round(i.rect.w), Math.round(i.rect.h)]);
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
        w[ikeyOf(i.widgetId, i.instance)] = [i.open ? 1 : 0, i.createdAt || 0, d ? hash53(d) : '', c ? hash53(c) : '', d.length, this.excerptOf(i.data), i.maximized ? 1 : 0];
      }
      return w;
    },
    photoKeyOf(m) { return m ? `${m.addedAt}-${m.bytes}-${m.w}x${m.h}` : null; },
    // The board's content, without this device's settings (theme, accent: going back never changes them).
    sigOf(exp) { return boardSig(Object.assign({}, exp, { theme: null, accent: null })); },
    // Version prev already holds everything in cur (each window's content is there, or is gone now).
    holdsAll(prev, cur) {
      const pw = prev.wins || {};
      return Object.keys(cur.wins || {}).every(k => {
        const c = cur.wins[k], p = pw[k];
        return p ? (c[2] === '' || c[2] === p[2]) && (c[3] === '' || c[3] === p[3]) : (!c[2] && !c[3]);
      }) && (!cur.photo || cur.photo === prev.photo);
    },
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
      const filled = keys.filter(k => aw[k] && bw[k] && bw[k][0] && !aw[k][6] && bw[k][6]), unfilled = keys.filter(k => aw[k] && bw[k] && bw[k][0] && aw[k][6] && !bw[k][6]);
      say(filled, n => `${n} filled the board`, c => `${c} windows filled the board`);
      say(unfilled, n => `${n} back to normal size`, c => `${c} windows back to normal size`);
      if (a.thumb && b.thumb && (a.thumb.bg !== b.thumb.bg || a.thumb.pattern !== b.thumb.pattern)) items.push('Background changed');
      if ((a.photo || null) !== (b.photo || null)) items.push(b.photo ? 'Photo changed' : 'Photo removed');
      if (a.name !== b.name) items.push('Name changed');
      return items;
    },

    // ---- saving a version
    async capture(kind, opts = {}) {
      if (!this.enabled()) return null;
      try { await this.db(); } catch (e) { return null; }
      if (this.paused === 'quota' && Date.now() - (this.pausedAt || 0) > 30 * H_MIN) this.paused = '';   // try again now and then
      if (this.paused === 'quota' && kind !== 'manual' && kind !== 'before') return null;
      if ((kind === 'auto' || kind === 'open') && !this.every()) return null;   // Off: no copy when 21Board opens either
      const b = S.boardId, startedAt = Date.now();
      let exp;
      try { exp = await buildExport('full'); } catch (e) { return null; }
      if (opts.token && opts.token.late) return null;   // gave up waiting (see before()): this would show the board after the action
      if (opts.patch) { const i = exp.instances.find(x => ikeyOf(x.widgetId, x.instance) === opts.patch.ikey); if (i) i.data = opts.patch.data; }
      const linkSig = boardSig(exp), sig = this.sigOf(exp);
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
        target: opts.target || null,   // going back: the time gone back to (labels are written when shown)
        beforeBig: false, link: rec && linkSig === rec.sentSig ? 'sent' : rec && linkSig === rec.loadedSig ? 'loaded' : null,
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
            // (Only if that version already holds everything on the board now: nothing typed since is lost.)
            if (newest && kind === 'before' && newest.kind === 'before' && newest.reason === meta.reason && at - newest.at < HIST.coalesce && this.holdsAll(newest, meta)) { set(newest.id); return; }
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
        if (isFull(err) && !opts.retried && await this.thin()) return this.capture(kind, Object.assign({}, opts, { retried: true }));
        if (isFull(err)) { this.paused = 'quota'; this.pausedAt = Date.now(); }
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
    // (Saved even with board history Off: Off stops only the automatic versions.)
    async before(reason, label, opts = {}) {
      if (!this.enabled()) return null;
      const token = { late: false };
      const run = (async () => { await Writer.settled(1000); return this.capture('before', { reason, label, patch: opts.patch, target: opts.target, token }); })().catch(() => null);
      if (opts.wait === false) return run;
      return Promise.race([run, sleep(opts.timeout || HIST.beforeTimeout).then(() => { token.late = true; return null; })]);
    },
    // A widget's content suddenly emptied (a note cleared): keep it first. Not awaited, so saves stay in order.
    guardEmptied(ikey, old, v) {
      if (!this.enabled() || !this.every() || old == null) return;
      const oldLen = JSON.stringify(old).length;
      if (oldLen < HIST.emptyMin || (v != null && JSON.stringify(v).length >= oldLen * HIST.emptyRatio)) return;
      const h = hash53(JSON.stringify(old)), g = this.guardAt.get(ikey);
      if (g && g.h === h && Date.now() - g.t < HIST.emptyEvery) return;   // that same content was just kept
      this.guardAt.set(ikey, { t: Date.now(), h });
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
      if (!this.enabled() || !this.dirty || !this.every() || this.capturing) return;
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
          const keep = historyPlan(list, now, T_LOCAL);
          list.forEach(m => { if (!keep.has(m.id)) drop.add(m.id); });
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
        this.paused = total() > B ? 'over' : (this.paused === 'over' || (this.paused === 'quota' && !low) ? '' : this.paused);
        const stillUsed = new Set(live.filter(m => !gone.has(m.id)).map(m => m.photo).filter(Boolean));
        if (!drop.size && !gone.size && photos.every(p => stillUsed.has(p.key))) return;
        await this.tx(['meta', 'body', 'photo'], 'readwrite', o => {
          drop.forEach(id => { o.meta.delete(id); o.body.delete(id); });
          for (const m of live) if (gone.has(m.id) && m.photo && m.photo !== 'gone') { m.photo = 'gone'; o.meta.put(m); }
          photos.forEach(p => { if (!stillUsed.has(p.key)) o.photo.delete(p.key); });
        });
        await this.reload();
        HistorySheet.refresh();
      } catch (err) { console.warn('21Board: could not tidy board history', err); }
    },
    // Out of space: the browser refused a save (of the board: Writer; of a version: capture). Gives up a little
    // board history and says whether there was any to give; the save is then tried again, so no more goes than
    // is needed. First the photos kept with older versions (each board's newest version keeps its photo), then
    // the 10 oldest versions. Never what historyPlan keeps with T_LOW: the newest, the first and last of each
    // of the last 7 days the board was used, the teacher's saved versions, the safety versions and the one
    // before a big change.
    // (A refused save is also the only sign of a nearly full device that Chrome gives: its storage estimate is
    // a fixed allowance, not the free space. Hence tight, for Settings.)
    async thin() {
      if (!this.enabled()) return false;
      this.tight = true;
      try {
        const all = (await this.tx(['meta'], 'readonly', (o, set) => { const q = o.meta.getAll(); q.onsuccess = () => set(q.result); })) || [];
        const byBoard = new Map(), keep = new Set(), keepPhoto = new Set();
        for (const m of all) { if (!byBoard.has(m.b)) byBoard.set(m.b, []); byBoard.get(m.b).push(m); }
        for (const list of byBoard.values()) {
          historyPlan(list, Date.now(), T_LOW).forEach(id => keep.add(id));
          const newest = list.reduce((a, m) => (m.at > a.at ? m : a));
          if (newest.photo && newest.photo !== 'gone') keepPhoto.add(newest.photo);
        }
        const photos = all.filter(m => m.photo && m.photo !== 'gone' && !keepPhoto.has(m.photo));
        const old = photos.length ? [] : all.filter(m => !keep.has(m.id)).sort((a, b) => a.at - b.at).slice(0, 10);
        if (!photos.length && !old.length) return false;
        await this.tx(['meta', 'body', 'photo'], 'readwrite', o => {
          for (const m of photos) { o.photo.delete(m.photo); m.photo = 'gone'; o.meta.put(m); }
          for (const m of old) { o.meta.delete(m.id); o.body.delete(m.id); }
        });
        // Said once: history is never given up silently.
        if (!this.thinned) toast('This device is almost out of space, so some of the oldest board history was removed. Make room on this device.', { timeout: 12000 });
        this.thinned = true;
        await this.reload();
        HistorySheet.refresh(); updateHint();
        if (Settings.isOpen) Settings.render();
        return true;
      } catch (err) { console.warn('21Board: could not make room', err); return false; }
    },
    async clearAll() {
      if (!this.enabled()) return;
      try { await this.tx(['meta', 'body', 'photo'], 'readwrite', o => { o.meta.clear(); o.body.clear(); o.photo.clear(); }); } catch (e) { /* nothing to clear */ }
      this.undoable = null;
      await this.reload();
      HistorySheet.refresh(); updateHint();
    },
    // Another page is shown now (Pages.show): what was waiting to be saved as a version was saved, or waits for
    // that page to come back (its changes are older than the newest version's: see check).
    switched() {
      clearTimeout(this.timer);
      this.dirty = false; this.firstDirtyAt = 0; this.undoable = null; this.guardAt.clear();
    },
    // A deleted page's versions go with it (its Undo is over: Pages.purge). Photos no version uses go too (prune).
    async purgeBoard(b) {
      if (!this.enabled()) return;
      try { await this.tx(['meta', 'body'], 'readwrite', o => { o.meta.delete(this.range(b)); o.body.delete(this.range(b)); }); } catch (e) { console.warn('21Board: a deleted page’s board history couldn’t be cleared', e); return; }
      this.pruneSoon();
    },
    // The highest page id board history has versions of (a new page never gets one of those ids: Pages.nextId).
    async maxBoard() {
      if (!this.enabled()) return 0;
      try { const keys = (await this.tx(['meta'], 'readonly', (o, set) => { const q = o.meta.getAllKeys(); q.onsuccess = () => set(q.result); })) || []; return keys.reduce((m, k) => Math.max(m, parseInt(String(k), 10) || 0), 0); }
      catch (e) { return 0; }
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
    // opts.undo: undoing an action just taken (a running timer keeps running); opts.what: what is undone.
    // Whatever stops it (a copy made by a newer 21Board, a device that can't save), the teacher is told, and
    // the board is as it was: applyImport stores the whole board or nothing.
    async restore(src, opts = {}) {
      try { return await this.restoreNow(src, opts); }
      catch (err) { console.error(err); toast(`Couldn’t ${opts.undo ? 'undo that' : 'go back'}: ` + ((err && err.message) || err)); return false; }
    },
    async restoreNow(src, opts) {
      let exp, meta = null;
      if (typeof src === 'string') {
        const r = await this.find(src);
        if (!r || !this.ours(r.meta)) return false;
        exp = clone(r.body.exp); meta = r.meta;
      } else exp = clone(src.exp);
      const at = (exp.snapshot && exp.snapshot.at) || (exp.history && exp.history.at) || (meta && meta.at) || Date.now();
      delete exp.theme; delete exp.accent;   // going back never changes this device's settings
      if (!opts.undo) this.fix(exp, at);
      const ref = exp.media && exp.media.ref, look = exp.media && exp.media.look;
      delete exp.media;
      const p = parseBoardFile(JSON.stringify(exp));
      let photo = 'exact', gone = false;
      if (ref) {
        const ph = await this.getPhoto(ref).catch(() => null);
        if (ph) { p.photo = { data: ph.data, w: ph.w, h: ph.h, bytes: ph.bytes, name: ph.name, addedAt: ph.addedAt }; p.photoLook = normalizePhotoSettings(look || {}); photo = 'file'; }
        else { photo = 'keep'; gone = !!BoardPhoto.media(); }
      } else if ((meta && meta.photo === 'gone') || !meta) { photo = 'keep'; gone = !!(meta && meta.photo === 'gone'); }
      // (The version may be another board, e.g. undoing an Import: no send runs across the change. See Link.swap.)
      const undoId = await Link.swap(() => applyImport(p, 'replace', { uid: p.board.uid || S.board.uid, photo, keepCreated: true, mustSnapshot: true,
        history: opts.undo ? { reason: 'undo', label: `Before undoing ${opts.what || 'a change'}` } : { reason: 'restore', label: 'Before going back', target: at } }));
      if (undoId === false) return false;
      await this.capture('restored', opts.undo ? { label: `Undid ${opts.what || 'a change'}` } : { label: 'Went back', target: at });
      Link.changed([Keys.board(S.boardId)]); Link.computeOffer();
      this.undoable = undoId && !opts.undo ? { id: undoId, label: `Put the board back to how it was ${when(Date.now())}`, until: Date.now() + HIST.undoMs } : null;
      if (opts.undo) toast('Undone: the board is back as it was.');
      else toast(`Your board is back to how it was ${when(at)}.` + (gone ? ' The background photo from then wasn’t kept, so your photo stays.' : ''), undoAction(undoId, 'going back'));
      HistorySheet.refresh();
      return true;
    },
    // Brings back one window from a version (into a free number if a different window has that one now).
    // (As with restore: if it can't, it says so.)
    async putBack(id, ikey, opts = {}) {
      try { return await this.putBackNow(id, ikey, opts); }
      catch (err) { console.error(err); toast('Couldn’t put that window back: ' + ((err && err.message) || err)); return false; }
    },
    async putBackNow(id, ikey, opts) {
      const r = await this.find(id);
      if (!r || !this.ours(r.meta)) return false;
      const exp = clone(r.body.exp);
      if (!opts.exact) this.fix(exp, r.meta.at);   // (undoing an action just taken: a running timer keeps running)
      const src = exp.instances.find(i => ikeyOf(i.widgetId, i.instance) === ikey);
      if (!src) return false;
      const widget = getWidget(src.widgetId);
      if (!widget) { toast('That widget isn’t installed on this device.'); return false; }
      const beforeId = await this.before('window', `Before putting back ${instName(src.widgetId, src.instance)}`);
      let target = ikey;
      const cur = S.insts.get(ikey);
      if (!opts.exact && !opts.here && cur && !(src.createdAt && cur.createdAt === src.createdAt)) {
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
      // Undo puts it back exactly (a closed window stays closed); otherwise it comes back open, to be seen.
      const open = opts.exact ? !!src.open : true;
      await saveInst(target, { widgetId: src.widgetId, n, open, rect, z: maxZ() + 1, maximized: opts.exact ? !!src.maximized : false, createdAt: src.createdAt || Date.now() });
      if (src.data == null) { S.data.delete(target); Writer.del(Keys.data(b, target)); } else { S.data.set(target, clone(src.data)); Writer.put(Keys.data(b, target), 'data', src.data); }
      if (src.config == null) { S.conf.delete(target); Writer.del(Keys.conf(b, target)); } else { S.conf.set(target, clone(src.config)); Writer.put(Keys.conf(b, target), 'conf', src.config); }
      await Writer.settled(2000);
      reconcileWin(target);
      const w = S.wins.get(target);
      if (w) { if (existed) w.reload(); focusWin(target); w.attention(); }
      afterBulkApply();
      const name = instName(src.widgetId, n) + (open ? '' : ' (closed)');
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
    const warn = H.paused === 'quota' ? ' Board history is paused: this device is out of space.' : H.paused === 'over' ? ' Board history is using its share of this device’s storage, so a version is saved about once an hour.' : H.low || H.tight ? ` Space is low on this device${H.thinned ? ', so some of the oldest board history was removed' : ''}. Make room on the device so 21Board can keep saving.` : H.status === 'too-big' ? ' This board is too big for automatic versions.' : '';
    const every = String(S.settings.historyEvery == null ? 10 : S.settings.historyEvery);
    return `<h3>Board history</h3>
      <div class="row"><div><div class="lbl">Go back to an earlier version</div><div class="hint">Earlier versions of this board are kept on this device, so you can undo a mistake (or a curious student). ${n ? `${n} version${n === 1 ? '' : 's'} (${fmtBytes(bytes)}), the oldest from ${esc(new Date(oldest.at).toLocaleDateString([], { month: 'short', day: 'numeric' }))}.` : H.unread ? 'They couldn’t be read just now.' : 'None yet.'}${lastFolder && Link.dir ? ` The last copy in your folder was saved ${esc(when(lastFolder.at))}.` : ''}${warn}</div></div>
        <button class="btn primary" data-act="hist-open">${svg('history')}Board history…</button></div>
      <div class="row stack"><div><div class="lbl">Save a version automatically</div><div class="hint">While the board is changing, when 21Board opens and when a note is suddenly cleared. Off stops these. One is still saved before Reset, Delete, Close all, a photo change, Import, Load, Erase and going back, so those can be undone.</div></div>${seg('hist-every', every, [['10', 'Every 10 min'], ['60', 'Every hour'], ['1440', 'Once a day'], ['0', 'Off']])}</div>
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
      if (m.manual) { const l = m.manualLabel || (m.kind === 'manual' ? m.label : ''); return 'Saved by you' + (l ? ` · ${l}` : ''); }
      if (m.target && m.reason === 'restore') return `Before going back to ${dayTime(m.target)}`;
      if (m.target && m.kind === 'restored') return `Went back to ${dayTime(m.target)}`;
      return m.kind === 'auto' ? 'Saved automatically' : m.kind === 'open' ? 'When 21Board opened' : (m.label || 'Saved');
    },
    dayName(t) {
      const d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
      return d.toDateString() === now.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
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
      if (H.unread) return html + '<p class="empty-note">21Board couldn’t read board history just now. Your earlier versions haven’t been deleted.</p><p><button class="btn" data-act="retry">Try again</button></p>' + this.renderFoot();
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
        if (dk !== day) { day = dk; html += `<div class="hist-day">${esc(this.dayName(m.at))}</div>`; }
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
        html += `<div class="inst"><div class="meta"><b>${esc(dayTime(m.at))}</b><span>${esc(w[5] || '(empty)')}</span></div><button class="btn small" data-act="put-here" data-val="${esc(m.id + '|' + ik)}">Put back this version</button></div>`;
      }
      html += '</div>';
      if (!count) html += `<p class="hint">${H.unread ? '21Board couldn’t read board history just now. Close this and try again.' : 'No different versions of this window yet.'}</p>`;
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
        case 'put-here': { const [id, ik] = val.split('|'); this.close(); await H.putBack(id, ik, { here: true }); break; }
        case 'undo': if (H.undoable) { const id = H.undoable.id; H.undoable = null; this.close(); await H.restore(id, { undo: true, what: 'going back' }); } break;
        case 'whole': this.ikey = null; this.render(); break;
        case 'retry': await H.reload(); await this.loadExtras(); this.render(); break;
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
  let dialogHeld = false;   // a dialog has just closed, and the key that answered it may still be down (dialogKey)
  // input: {label, placeholder, maxlength}: also asks for a line of text; resolves {value, text} (or null).
  function dialog({ title, message, actions, input }) {
    closePopups({ keepSettings: true, keepHistory: true });
    if (dialogResolve) dialogResolve(null);
    const modal = $('#modal'), card = $('.modal-card', modal);
    const back = document.activeElement;   // where the keyboard was: it goes back there afterwards (dialogBack)
    // A screen reader says the title as the dialog's name, then reads the message.
    modal.setAttribute('aria-labelledby', 'modal-title');
    if (message) modal.setAttribute('aria-describedby', 'modal-text'); else modal.removeAttribute('aria-describedby');
    card.innerHTML = `<h3 id="modal-title">${esc(title)}</h3>${message ? `<p id="modal-text">${esc(message)}</p>` : ''}` +
      (input ? `<label class="modal-input"><span>${esc(input.label || '')}</span><input type="text" class="text-input" maxlength="${+input.maxlength || 60}" placeholder="${esc(input.placeholder || '')}" autocomplete="off"></label>` : '') +
      `<div class="modal-actions">` +
      actions.map((a, i) => `<button class="btn ${a.kind || ''} ${a.choice ? 'choice' : ''}" data-i="${i}">${esc(a.label)}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</button>`).join('') + '</div>';
    modal.classList.add('open');
    const field = input ? $('input', card) : null;
    const first = field || $('.btn', card);
    if (first) first.focus();
    return new Promise(resolve => {
      const answer = v => (field ? (v == null ? null : { value: v, text: field.value.trim() }) : v);
      dialogResolve = v => { dialogResolve = null; dialogHeld = true; modal.classList.remove('open'); dialogBack(back); resolve(answer(v)); };
      card.onclick = e => { const b = e.target.closest('[data-i]'); if (b) dialogResolve(actions[+b.dataset.i].value); };
      modal.onclick = e => { if (e.target === modal) dialogResolve(null); };
      // (Enter in the field goes no further: dialogKey, on the document, would take it for a new key press after
      // the dialog it has just closed, and let the held key go on to press the button behind the dialog.)
      if (field) field.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) dialogResolve(actions[0].value); } };
    });
  }
  // A key that is held down repeats. Enter held a moment too long would answer the dialog it has just opened;
  // and now that the keyboard goes back to the button behind a dialog, the key that closed the dialog would
  // press that button again (Cancel, held, would open the question again and then say yes to it). So a
  // repeating Enter answers no dialog, and no repeating key does anything after a dialog until it is let go.
  // Returns true if the key press is to be ignored.
  function dialogKey(e) {
    const ignore = e.repeat && (dialogHeld || (!!dialogResolve && e.key === 'Enter'));
    if (ignore) e.preventDefault(); else dialogHeld = false;
    return ignore;
  }
  // While a dialog is open, Tab and Shift+Tab go round its buttons (and its text field). Left to the browser,
  // Tab walks on into the board behind the dialog, where Escape no longer closes it.
  function dialogTab(e) {
    const items = $$('input, button', $('#modal .modal-card'));
    if (!items.length || e.ctrlKey || e.altKey || e.metaKey) return;
    const i = items.indexOf(document.activeElement);   // (-1: the keyboard is somewhere else: bring it in)
    e.preventDefault();
    items[e.shiftKey ? (i > 0 ? i : items.length) - 1 : (i + 1) % items.length].focus();
  }
  // A dialog has closed: the keyboard goes back to where it was. A control in the Widget Picker isn't there any
  // more (the Picker closed before the dialog opened): then to the ▦ button that opened the Picker. A widget
  // gets it back through its own window: after focus() on its frame, Chrome goes on naming that widget as the
  // one with the keyboard when another is tapped. Never to a text field: a tablet would bring up its on-screen
  // keyboard, and Settings doesn't redraw while one of its fields is in use.
  function dialogBack(el) {
    if (el && el.closest('#panel') && !Picker.side) el = Picker.btns[Picker.el.classList.contains('right') ? 'right' : 'left'];
    if (!el || el === document.body || !el.isConnected || el.matches('input[type="text"]')) return;
    try { if (el.tagName === 'IFRAME') el.contentWindow.focus(); else el.focus({ preventScroll: true }); } catch (e) { /* stays where it is */ }
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
    // An Undo acts on the page shown: it goes when another page is shown (Pages.leave). (opts.pages: it undoes a
    // change to the pages themselves, and stays.)
    if (opts.action === 'Undo' && !opts.pages) t.board = S.boardId;
    host.appendChild(t);
    const timeout = opts.timeout === undefined ? 4200 : opts.timeout;
    if (timeout) setTimeout(remove, timeout); else t.sticky = true;
    return t;
  }

  // A small note above the Widget Picker buttons, one in each corner (SaveNote, FolderNote). A page from before
  // a note has no styles for it (for a launch or two after an update, the page and this script can be from
  // different versions): the essentials, so that it still shows, and still hides.
  function cornerNotes(cls, onTap) {
    return ['left', 'right'].map(side => {
      const b = document.createElement('button');
      b.className = cls + ' ' + side;
      b.hidden = true;
      b.addEventListener('click', onTap);
      document.body.appendChild(b);
      const bare = getComputedStyle(b).position !== 'fixed';
      if (bare) b.style.cssText = `position:fixed;z-index:999;bottom:86px;${side}:16px;height:40px;padding:0 14px;border-radius:20px;border:1px solid #f59e0b;background:#fef3c7;color:#92400e;font-size:14px;font-weight:600;white-space:nowrap;display:none`;
      return { b, side, bare };
    });
  }

  // "Not saved": a small note above the Widget Picker buttons, for as long as this board isn't (all) stored on
  // the device: a save failed (Writer.failing: the changes wait and are tried again), or nothing is stored in
  // this window at all (Store.failed). It stays until saving works; tapping it says why and what to do.
  const SaveNote = {
    els: null, shown: '',
    state() { return Store.failed || (Writer.failing ? 'unsaved' : ''); },
    init() {
      this.els = cornerNotes('save-note', () => this.explain());
      for (const { b } of this.els) { b.innerHTML = '<span class="status-dot warn"></span>Not saved'; b.setAttribute('aria-label', 'Not saved: what to do'); }
    },
    update() {
      if (!this.els) return;
      const st = this.state();
      for (const { b, side, bare } of this.els) { b.hidden = !st || Picker.btns[side].hidden; if (bare) b.style.display = b.hidden ? 'none' : ''; }
      if (st !== this.shown) { this.shown = st; if (Settings.isOpen) Settings.render(); }
      FolderNote.update();   // (it sits above this one, when both show)
    },
    // What happened and what to do (the note's dialog, and the top of Settings).
    info() {
      const st = this.state();
      if (st === 'blocked') return { title: 'This board isn’t being saved', text: 'This browser window doesn’t let 21Board keep anything, so the board is gone when the window closes. Use a normal (not private) window, or export a backup to keep what’s here.' };
      if (st === 'unopened') return { title: 'This board isn’t being saved', text: '21Board couldn’t open your saved board, so it started an empty one that isn’t kept. Your saved board hasn’t been changed: reload 21Board to open it.' +
        (BoardHistory.metas.length ? ' Board history still has its earlier versions.' : '') + ' Export a backup first to keep what’s here now.' };
      if (Store.lost) return { title: 'This board isn’t saved on this device right now', text: 'This device lost what 21Board had saved (it may be out of space). The board stays here while 21Board is open, and 21Board keeps trying to save it again. Export a backup now to keep it.' };
      // (A full device isn't always reported as one, so the other wording mentions space too.)
      const full = isFull(Writer.failing);
      return { title: 'Your latest changes aren’t saved yet', text: (full ? 'This device is out of space, so 21Board can’t save.' : '21Board couldn’t save to this device (it may be out of space).') +
        ' Your changes stay on the board while 21Board is open, and it keeps trying. ' + (full ? 'Make room on this device, or export a backup to keep them.' : 'If this goes on, export a backup to keep them, then make room on the device or restart it.') };
    },
    async explain() {
      const st = this.state();
      if (!st) return;
      const i = this.info(), retry = { label: st === 'unsaved' ? 'Try again now' : 'Reload 21Board', value: 'retry' }, backup = { label: 'Export a backup', value: 'export' };
      const go = await dialog({ title: i.title, message: i.text,
        actions: (st === 'blocked' ? [Object.assign(backup, { kind: 'primary' })] : [Object.assign(retry, { kind: 'primary' }), backup]).concat([{ label: 'Close', value: null }]) });
      if (go === 'export') doExport('all');
      else if (go === 'retry' && st !== 'unsaved') location.reload();
      else if (go === 'retry') { Writer.retry(); if (!await Writer.settled(5000)) toast('Still not saved. 21Board keeps trying.'); }
    }
  };

  // The linked Google Drive folder can't be used (Link.problem): a note above the Widget Picker buttons, for
  // as long as that lasts, so that sharing is never off for a whole day unnoticed. "Reconnect folder": Chrome
  // wants to be asked again (after a restart, in a plain tab), and asks only from a tap: one tap on the note.
  // "Folder unavailable" (it can't be found or read) and "Not sent" (an automatic send failed): a tap says
  // what happened and what to do.
  const FolderNote = {
    els: null,
    init() { this.els = cornerNotes('folder-note', () => this.tap()); this.update(); },
    update() {
      if (!this.els) return;
      const p = Link.problem(), up = !!SaveNote.state();
      const text = { allow: 'Reconnect folder', missing: 'Folder unavailable', send: 'Not sent' }[p];
      const label = { allow: 'Reconnect your Google Drive folder', missing: 'Your Google Drive folder is unavailable: what to do', send: 'This board wasn’t sent to your folder: what to do' }[p];
      for (const { b, side, bare } of this.els) {
        b.hidden = !p || Picker.btns[side].hidden;
        if (p && b.dataset.is !== p) { b.dataset.is = p; b.innerHTML = `<span class="status-dot warn"></span>${text}`; b.setAttribute('aria-label', label); }
        b.style.bottom = up ? 'calc(132px + env(safe-area-inset-bottom))' : bare ? '86px' : '';   // above "Not saved", when both show
        if (bare) b.style.display = b.hidden ? 'none' : '';
      }
    },
    tap() { if (Link.problem() === 'allow') Link.reconnect(); else this.explain(); },
    // What happened and what to do (the note's dialog, and Settings).
    info() {
      const p = Link.problem(), t = Link.trouble, name = Link.dir ? Link.dir.name : '';
      const off = ', this board isn’t sent to your other devices or updated from them.';
      if (p === 'allow') {
        return Link.perm === 'denied' ? { title: `21Board isn’t allowed to use your “${name}” folder`, text: 'Chrome is blocking it. Choose the folder again to allow it. If Chrome still refuses, ask your school’s IT. Until it is allowed' + off }
          : { title: `Reconnect your “${name}” folder`, text: 'Chrome asks again after a restart unless 21Board is installed (or you chose “Allow on every visit”). Until you allow it' + off };
      }
      if (p === 'missing') {
        // (Choosing it again is suggested only once it has been gone a while: Google Drive may just be starting.)
        return { title: `21Board can’t find your “${name}” folder`, text: (Date.now() - t.since >= LINK_LOST_MS ? `It went missing ${when(t.since)}. If it was renamed, moved or deleted, choose it again.` : 'Google Drive may still be starting, or this device may be offline.') +
          ' 21Board keeps looking, and carries on by itself when the folder is back. Until then' + off };
      }
      if (p !== 'send') return null;
      const say = LINK_SAY[t.code] || LINK_SAY.other;
      return { title: 'This board isn’t being sent to your folder', text: `“Send automatically” couldn’t send it ${when(t.at)}: ${say[0]}. ${say[1]} 21Board keeps trying.` };
    },
    async explain() {
      const p = Link.problem(), i = this.info();
      if (!i) return;
      if (Link.trouble) Link.trouble.said = true;
      const acts = p === 'send' ? [{ label: 'Try again now', value: 'send', kind: 'primary' }]
        : p === 'missing' ? [{ label: 'Look again now', value: 'check', kind: 'primary' }, { label: 'Choose the folder again…', value: 'choose' }]
        : Link.perm === 'denied' ? [{ label: 'Choose the folder again…', value: 'choose', kind: 'primary' }] : [{ label: 'Allow…', value: 'allow', kind: 'primary' }];
      const go = await dialog({ title: i.title, message: i.text, actions: acts.concat([{ label: 'Close', value: null }]) });
      if (go === 'choose') await Link.choose();
      else if (go === 'allow') await Link.reconnect();
      else if (go === 'send') await Link.send();
      else if (go === 'check') { await Link.check(true); toast(Link.problem() === 'missing' ? 'Still not there. 21Board keeps looking.' : 'The folder is back.'); }
    }
  };

  function closePopups(opts = {}) {
    Picker.close();
    Pages.closeMenu();
    Menu.close();
    if (!opts.keepSettings) Settings.close();
    if (!opts.keepHistory) HistorySheet.close();
  }

  // =====================================================================
  // 15. PWA: service worker, persistent storage, file launch
  // =====================================================================
  // Versions. sw.js keeps one complete copy of 21Board for offline use and answers this tab from it; a new
  // version arrives as a whole new copy, which waits. This side of it:
  //   - offers "Update" when a new copy is waiting ("Later" leaves it: it takes over by itself the next time
  //     21Board starts);
  //   - starts again when a new copy takes over: "Update" was tapped, in this tab or in another one (a tab
  //     whose board isn't saved is left alone, with "Update" still on offer: nothing is lost unasked);
  //   - a tab that was opened before there was a copy (the first visit) is handed to the copy only when both
  //     are the same build: until then it keeps using the network. (Handing over takes every such tab at
  //     once. One that runs another build offers "Update" there and then; until it is tapped, a widget it
  //     opens comes from the copy, as it came from the server before.)
  function registerSW() {
    const sws = navigator.serviceWorker;
    if (!sws || !/^https?:$/.test(location.protocol)) { S.sw.state = 'unsupported'; return; }
    const status = () => { if (Settings.isOpen) Settings.refreshStatus(); };
    // update: the copy that is waiting, or true when starting again is all it takes.
    const offer = update => {
      const first = !S.sw.updateReady;
      S.sw.updateReady = update;
      Picker.renderControls();
      status();
      if (first) toast('A new version of 21Board is ready.', { action: 'Update', onAction: askUpdate, dismiss: 'Later', timeout: 20000 });
    };
    // A copy's {version, build, copy}. (null: it didn't answer. No build: a copy saved by a version from before
    // builds.) copy false: its files aren't all saved any more. It saves them again and then answers once more;
    // until that says it worked, Settings doesn't say "Ready to work offline".
    const ask = sw => new Promise(resolve => {
      const ch = new MessageChannel();
      let answers = 0;
      const say = v => { S.sw.state = !v || v.copy !== false ? 'ready' : answers > 1 ? 'error' : 'checking'; status(); resolve(v); };
      const t = setTimeout(() => say(null), 3000);
      ch.port1.onmessage = e => { clearTimeout(t); answers++; say(e.data || null); };
      sw.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
    });
    const same = v => !!v && v.build === BOARD_BUILD && pageBuild() === BOARD_BUILD;
    // The copy this tab is answered from. If the tab isn't that build (another tab had it take over), starting
    // again puts that right.
    const controlled = async () => {
      if (!sws.controller) return;
      const v = await ask(sws.controller);
      if (v) { S.sw.version = v.version; S.sw.build = v.build || null; }
      status();
      if (v && v.build && !same(v)) offer(S.sw.updateReady || true);
    };
    // A copy that is in use, while this tab still runs on the network. newest: it has only just been saved.
    const meet = async (sw, newest) => {
      const v = await ask(sw);
      if (sws.controller || !v) return;
      if (same(v)) sw.postMessage({ type: 'CLAIM' });
      else if (newest) offer(S.sw.updateReady || true);
    };
    let had = !!sws.controller;
    sws.addEventListener('controllerchange', () => {
      if (!had) { had = true; controlled(); }
      else if (SaveNote.state() && !updating) offer(true);   // (Update was tapped in another tab)
      else restart();
    });
    let reg = null;
    const start = () => sws.register('sw.js', { updateViaCache: 'none' }).then(r => {
      reg = r;
      const watch = sw => {
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && sws.controller) offer(sw);
          if (sw.state === 'activated' && !sws.controller) meet(sw, true);
          // It couldn't be saved (a file didn't download, or wasn't this version's). The browser tries again later.
          if (sw.state === 'redundant' && !reg.active && !reg.installing && !reg.waiting) { S.sw.state = 'error'; status(); }
        });
      };
      if (reg.waiting && sws.controller) offer(reg.waiting);
      [reg.installing, reg.waiting, reg.active].forEach(watch);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      if (sws.controller) controlled();
      else if (reg.active && reg.active.state === 'activated') meet(reg.active, false);
    }).catch(err => {
      console.warn('21Board: service worker registration failed', err);
      S.sw.state = 'error';
      status();
    });
    start();
    // Boards stay open all day: look for a new version every hour (and if no copy could be saved, try again).
    setInterval(() => { if (reg && (reg.active || reg.waiting || reg.installing)) reg.update().catch(() => {}); else start(); }, 60 * 60 * 1000);
  }

  // Starts this tab again, on the version that is in charge by then. What is waiting to be saved goes first.
  let updating = false, restarting = false;
  async function restart() {
    if (restarting) return;
    restarting = true;
    try { await Writer.settled(1500); } catch (e) { /* start again anyway */ }
    location.reload();
    // Still here some seconds on? The browser can leave a reload unanswered (seen when the copy it asked for
    // the page was being replaced at that moment), and the tab would stay on the old version: ask again.
    for (const ms of [5000, 20000]) setTimeout(() => location.reload(), ms);
  }

  function applyUpdate() {
    const sw = S.sw.updateReady;
    if (!sw) return;
    updating = true;
    if (sw === true) { restart(); return; }
    // The waiting copy takes over, and every open 21Board tab then starts again by itself (controllerchange).
    sw.postMessage({ type: 'SKIP_WAITING' });
    // Not by then? The copy in charge was busy at that moment (the browser then leaves the new one waiting
    // until a page loads), or a still newer copy has replaced this one: starting again gets things moving.
    setTimeout(restart, 4000);
  }

  // "Update" was tapped. Starting again would lose a board that isn't saved: ask first.
  async function askUpdate() {
    if (Writer.failing) { Writer.retry(); await Writer.settled(3000); }   // (one more try)
    const unsaved = SaveNote.state();
    if (unsaved && !await dialog({ title: 'Update 21Board now?',
      message: unsaved === 'unsaved' ? 'Your latest changes aren’t saved on this device yet. If you update now, they will be gone.' : 'This board isn’t being saved. If you update now, it will be gone.',
      actions: [{ label: 'Update', value: true, kind: 'danger' }, { label: 'Later', value: false }] })) return;
    applyUpdate();
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
    // Not in a kiosk: no one is signed in, so it would reach whoever is at the panel, in a lesson, about something
    // only IT can settle; and a backup that leaves the device needs a USB drive in hand. (Settings has Back up now.)
    if (KIOSK) return;
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
    toast('This browser hasn’t promised to keep 21Board’s data yet. Save a backup file?', { action: 'Back up', timeout: 15000, onAction: () => doExport('all') });
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
    Pages.initMenu();
    Menu.init();
    Settings.init();
    AppsOffline.init();
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
      if (Pages.open && !t.closest('#pages-menu') && !t.closest('[data-ctl="pages"]')) Pages.closeMenu();
      if (Picker.side && !t.closest('#panel') && !t.closest('.picker-btn') && !t.closest('#pages-menu')) Picker.close();
      if (Menu.win && !t.closest('#menu') && !t.closest('.win-label')) Menu.close();
      if (Settings.isOpen && !t.closest('#settings') && !t.closest('#modal') && !t.closest('.picker-btn') && !t.closest('#panel')) Settings.close();
      if (HistorySheet.isOpen && !t.closest('#history') && !t.closest('#modal') && !t.closest('#toasts') && !t.closest('.picker-btn') && !t.closest('#panel') && !t.closest('#empty-hint')) HistorySheet.close();
    }, true);
    // Focus moving into a widget iframe (a tap inside it) also closes popups. For a district app it's all the board
    // learns of a tap inside (one on its buttons, not on 21Sketch's drawing surface), so its window comes forward.
    // (The iframe itself gets no 'focus' event.)
    window.addEventListener('blur', () => setTimeout(() => {
      const f = document.activeElement;
      if (!f || f.tagName !== 'IFRAME') return;
      Picker.close(); Menu.close();
      const w = S.wins.get((f.closest('.win') || { dataset: {} }).dataset.ikey);
      if (w && w.widget.external) focusWin(w.ikey);
    }, 0));

    document.addEventListener('keydown', e => {
      if (dialogKey(e)) return;
      if (e.key === 'Tab' && dialogResolve) dialogTab(e);
      if (e.key !== 'Escape') return;
      if (dialogResolve) dialogResolve(null);
      else if (Menu.win) { const w = Menu.win; Menu.close(); w.labelEl.focus(); }
      else if (Pages.open) { Pages.closeMenu(); const ind = $('[data-ctl="pages"]', Picker.el); if (ind) ind.focus(); }
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

    window.addEventListener('resize', () => { scheduleLayoutAll(); Picker.render(); Pages.closeMenu(); });
    const onFs = () => Picker.renderControls();
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    mqDark.addEventListener && mqDark.addEventListener('change', () => applySettings());

    // Catch up on anything another tab changed while this one was hidden or frozen.
    const resync = () => { if (!Store.loaded) return; if (Inter.active) Inter.deferredReload = true; else reloadAll(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
    window.addEventListener('pageshow', e => { if (e.persisted) resync(); });
  }

  // Start-up. Until the stored board has been read, a see-through cover keeps taps off the board (a window
  // opened too early could be saved over a stored one) and nothing is written (Store.loaded). If the board
  // can't be opened or read, or start-up throws, the cover says so: never an empty board that looks ready.
  // It is made here, not in index.html, so it also shows when the page and this script are different versions.
  const Startup = {
    el: null, ready: false, failed: null, says: 'Opening your board…',
    cover() {
      const el = this.el = document.createElement('div');
      el.id = 'startup';
      el.style.cssText = 'position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;color:var(--muted,#6b7280);font-size:18px';
      document.body.appendChild(el);
      setTimeout(() => { if (this.el === el && !this.failed) el.textContent = this.says; }, 1500);
    },
    done() { if (this.el) this.el.remove(); this.el = null; this.failed = null; this.ready = true; },
    // opts.storage: the board couldn't be opened or read. The teacher can try again (a reload), or carry on
    // with an empty board that isn't saved: the promise resolves only then. Otherwise: Try again only.
    fail(err, opts = {}) {
      if (this.failed) return this.failed;
      console.error('21Board: couldn’t open the board', err);
      Store.loaded = false;   // nothing is saved from here on
      if (!this.el) this.cover();
      const el = this.el;
      const why = String((err && [err.name, err.message].filter(Boolean).join(': ')) || err || 'Unknown').slice(0, 200);
      el.style.background = 'rgba(0, 0, 0, .45)';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-label', '21Board couldn’t open your board');
      el.innerHTML = `<div class="modal-card"><h3>${opts.storage ? '21Board couldn’t open your board' : '21Board couldn’t start'}</h3>
        <p>Nothing has been changed: your board is still saved on this device. Try again. If this keeps happening, restart the device or tell your school’s IT.</p>
        <div class="modal-actions"><button class="btn primary" data-go="retry">Try again</button>
          ${opts.storage ? '<button class="btn choice" data-go="on">Use 21Board without saving<small>An empty board for now. Your saved board isn’t touched.</small></button>' : ''}</div>
        <p style="font-size:12px;margin:14px 0 0;overflow-wrap:anywhere">Details for IT: ${esc(why)} · 21Board ${esc(RELEASE)}${pageBuild() === BOARD_BUILD ? '' : esc(` on a page from ${pageBuild() || 'an earlier version'}`)}</p></div>`;
      $('[data-go="retry"]', el).focus();
      return (this.failed = new Promise(resolve => {
        el.onclick = e => {
          const b = e.target.closest('[data-go]');
          if (!b) return;
          if (b.dataset.go === 'retry') {
            // (A new version that is ready is taken first: it may be the fix.)
            if (S.sw.updateReady) applyUpdate(); else location.reload();
            return;
          }
          // Carry on without the stored board: this session's board is kept in memory only (see SaveNote).
          Writer.forget(); Link.forget();
          Store.mem = MemDB; Store.failed = 'unopened'; Store.loaded = true;
          this.done();
          SaveNote.update();
          resolve();
        };
      }));
    }
  };

  // The page (index.html) and this script must be the same build. They can differ for a launch or two after an
  // update where the offline copy was saved by a version from before builds (it replaced its files one at a
  // time), and where there is no offline copy and the browser's own cache hands out an old page with a new
  // script. The board isn't opened on such a mix: the complete version that is waiting takes over, or both
  // are fetched afresh, and 21Board starts again. Once per tab for each mix, so it can't go round in circles.
  async function mixedStart() {
    const mix = `${pageBuild()}/${BOARD_BUILD}`;
    try {
      if (sessionStorage.getItem('21board-mixed') === mix) return false;   // tried already: start with what there is
      sessionStorage.setItem('21board-mixed', mix);
    } catch (e) { return false; }
    console.warn(`21Board: the page (${pageBuild() || 'an earlier version'}) and board.js (${BOARD_BUILD}) are different builds: starting again`);
    Startup.says = 'Updating 21Board…';
    const soon = (p, ms) => Promise.race([p, sleep(ms)]);
    try {
      const sws = /^https?:$/.test(location.protocol) && navigator.serviceWorker;
      const reg = sws && await soon(sws.getRegistration(), 3000);
      if (reg && !reg.waiting && !reg.installing) await soon(reg.update().catch(() => {}), 5000);
      const sw = reg && (reg.waiting || reg.installing);
      if (sw) {
        await soon(new Promise(res => { const on = () => { if (sw.state !== 'installing') res(); }; sw.addEventListener('statechange', on); on(); }), 20000);
        if (sw.state === 'installed') {
          const taken = new Promise(res => sws.addEventListener('controllerchange', res));
          sw.postMessage({ type: 'SKIP_WAITING' });
          await soon(taken, 4000);
        }
      } else {
        await Promise.all(['./', 'board.js'].map(u => soon(fetch(u, { cache: 'reload' }).catch(() => {}), 5000)));
      }
    } catch (e) { /* start again anyway */ }
    location.reload();
    return true;
  }

  async function boot() {
    const late = $('#boot-note');
    if (late) late.remove();   // (index.html's "taking a long time to start")
    Startup.cover();
    if (pageBuild() !== BOARD_BUILD && await mixedStart()) return;
    if (!LAB && !KIOSK) Install.init(); // before anything async: Chrome can fire beforeinstallprompt early
    document.body.classList.toggle('kiosk', KIOSK);
    initUI();
    SaveNote.init();
    if (Link.supported) FolderNote.init();
    Sync.init();
    if (!LAB) registerSW();   // before the board is opened: a version that can't start can still receive its fix
    try {
      try { await Store.openSoon(); } catch (err) {
        if (!LAB && !isBlocked(err)) throw err;
        // Storage is blocked (in test mode: by an AI tool's preview): this session's board is kept in memory.
        Store.mem = MemDB;
        if (!LAB) {
          console.error('21Board: storage is blocked', err);
          Store.failed = 'blocked';
          toast('This browser is blocking storage, so nothing will be saved. Try a normal (not private) window.', { timeout: 10000 });
        }
      }
      await reloadAll(true, { pick: !LAB });
    } catch (err) {
      await Startup.fail(err, { storage: true });   // comes back only if the teacher carries on without saving
      await reloadAll(true, { pick: !LAB });
    }
    Store.loaded = true;
    updateZoom();
    migrateBoard();
    if (!Known.has(Keys.board(S.boardId))) Writer.put(Keys.board(S.boardId), 'board', S.board);
    if (!LAB) ensureUid();
    applySettings();
    applyBoard();
    updateHint();
    Startup.done();
    if (!LAB && S.settings.activeBoard !== S.boardId) updateSettings({ activeBoard: S.boardId });   // (its page was gone)
    if (!LAB) Pages.purgeLater();   // deleted pages whose Undo is (or will soon be) over
    if (LAB) { LabBridge.start(); return; }   // test mode: no offline cache, install, file opening or backup reminders
    if (!KIOSK) setupFileLaunch();
    Persist.init();
    Link.start();
    BoardHistory.start();
  }

  // Exposed for debugging in the console and for automated tests.
  window.__board21 = {
    version: BOARD_VERSION, build: BOARD_BUILD, state: S, store: Store, zoom: Zoom, inter: Inter, setBoardScale, setBoardShape, boundsRect,
    setRect: (ikey, rect) => { const i = S.insts.get(ikey); if (!i) return; saveInst(ikey, Object.assign({}, i, { rect })); const w = S.wins.get(ikey); if (w) w.layout(); },
    openWidget, closeWin, focusWin, resetWin, deleteInstance, setMaximized,
    buildExport, applyImport: (obj, mode) => applyImport(parseBoardFile(JSON.stringify(obj)), mode), reloadAll, rebuildAll,
    catalog: () => Array.from(catalog.values()), link: Link, history: BoardHistory, historySheet: HistorySheet, historyPlan, pages: Pages, updateBoard
  };

  // (A problem after the board is up is logged, as before; before that, the teacher is told.)
  boot().catch(err => { if (Startup.ready) console.error('21Board: start-up problem', err); else Startup.fail(err); });
})();
