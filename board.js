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
  const BOARD_VERSION = '2026.11.18-7';
  const BOARD_BUILD = '18dfe2ae';
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
  // Kiosk mode (?kiosk=yes): ChromeOS kiosk, for users who don't sign in. No ⛶ Full screen (a kiosk is always full
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
    theme: 'system',         // 'light' | 'dark' | 'system' (Auto: the device's own; devices from before keep what they had)
    snapping: true,          // snap + resist overlap while dragging
    resistance: 'normal',    // 'gentle' | 'normal' | 'strong'
    pickerCorners: 'both',   // 'both' | 'left' | 'right'
    accent: 'blue',          // accent color, as releases before 2026.11.18-2 know it (see accentShown)
    accentColor: '',         // accent color from 2026.11.18-2: a key of ACCENTS or a custom '#rrggbb'
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

    awake: 'off',            // Stay awake: 'off' | 'on' (while 21Board shows). An older 'hours' (school hours) reads as 'on'.

    clock: 'auto',           // Clock in the corner: 'on' | 'off' | 'auto' (only in full screen). An older 'date' (Time and
                             // date, the old default) reads as 'auto', 'time' as 'on' (clockMode).

    // The whole board's, like the theme and accent: exported, and with Board Sync on every device (section 12b).
    letters: 'standard'      // Text style: 'standard' (the device's own font) | 'legible' (Atkinson Hyperlegible) | 'early' (Andika)
  };
  // layout: the screen size (CSS px) the board is laid out for; window rects are stored in this space.
  const defaultBoard = (id = 1) => ({ id, name: 'My Board', background: { color: null, pattern: 'none' }, layout: null });

  // Accent colors (Settings › Accent color): [light theme, dark theme, name]. The light theme's shade takes white text
  // (4.5:1, on the widgets' #f9fafb too). The dark theme's shade takes dark text (on-accent, #0b1220) and stands out on
  // the window color (6:1 on #1e1e1e). Custom… takes any color (customShades). Pink and Teal went in 2026.11.18-2. Red became Rose in 2026.11.18-3
  // (its key is still 'red').
  const ACCENTS = {
    blue: ['#2563eb', '#60a5fa', 'Blue'], purple: ['#7c3aed', '#a78bfa', 'Purple'], red: ['#db1f48', '#fb7185', 'Rose'],
    orange: ['#c2410c', '#fb923c', 'Orange'], green: ['#15803d', '#4ade80', 'Green'], slate: ['#475569', '#94a3b8', 'Slate']
  };
  function mixHex(a, b, t) { // t = share of b
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
    return '#' + [16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('');
  }
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };   // (WCAG, 1 to 21)
  // A custom color's [light theme, dark theme] shades, held to the six colors' rules. A color that passes is kept. One
  // that doesn't keeps its hue and saturation while its HSL lightness moves in 0.5% steps until it passes: darker for
  // the light theme (4.5:1 on the widgets' #f9fafb, so white text reads too), lighter for the dark theme (6:1 on
  // #1e1e1e, as Red has, which keeps the dark text above 4.5:1 too). Lightness alone always gets there: luminance grows
  // with it, and black and white pass.
  function customShades(hex) {
    const n = parseInt(hex.slice(1), 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l0 = (mx + mn) / 2;
    const s = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0;
    const h = !d ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;   // (in sixths of the circle)
    const at = l => {   // the color at lightness l (HSL to '#rrggbb')
      const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
      return '#' + [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h) % 6].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
    };
    let light = hex, dark = hex;
    for (let l = l0; contrast(light, PALETTES.light.surface) < 4.5 && l > 0;) light = at(l = Math.max(0, l - 0.005));
    for (let l = l0; contrast(dark, '#1e1e1e') < 6 && l < 1;) dark = at(l = Math.min(1, l + 0.005));
    return [light, dark];
  }
  // An accent's [light theme, dark theme, name], or null. A key of ACCENTS (own keys only: "constructor", "__proto__"
  // and the like from a crafted file don't count), or a custom '#rrggbb', lowercase. The last custom color's shades are
  // cached: the board asks at every redraw.
  let lastCustom = ['', null];
  const accentKey = v => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACCENTS, v);
  function accentOf(v) {
    if (typeof v !== 'string') return null;
    if (accentKey(v)) return ACCENTS[v];
    if (!/^#[0-9a-f]{6}$/.test(v)) return null;
    if (lastCustom[0] !== v) lastCustom = [v, customShades(v).concat('Custom')];
    return lastCustom[1];
  }
  const accentOk = v => !!accentOf(v);
  // The accent is stored in two parts, so that a release before 2026.11.18-2 (another device, or another tab during an
  // update) never finds one it doesn't know and never takes it for a choice of its own. settings.accent is what those
  // releases read and write: a key of ACCENTS, 'pink' or 'teal' (shown as Blue), or 'blue' for a custom color.
  // settings.accentColor is the accent chosen from 2026.11.18-2: a key of ACCENTS or a custom '#rrggbb'. It shows while
  // accent goes with it. Otherwise an older release has chosen accent since. Board Sync carries both (Merge's
  // STYLE_PARTS) and checks them with accentKeyOk and accentOk.
  const accentKeyOk = v => accentKey(v) || v === 'pink' || v === 'teal';
  const accentWith = c => (c[0] === '#' ? 'blue' : c);
  const accentSet = c => ({ accent: accentWith(c), accentColor: c });   // (choosing c: Settings, Import, the dev window)
  // The accent shown for an accent and accentColor as stored (or a file's: an export's accent can be a '#rrggbb'), or
  // none. The board, its widgets, exports and the dev window all read it here (accentNow).
  const accentShown = (a, c, none = 'blue') => (accentOk(c) && accentWith(c) === a ? c : accentOk(a) ? a : none);
  const accentNow = () => accentShown(S.settings.accent, S.settings.accentColor);
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
  // The palette widgets receive (--b21-* variables), with the chosen accent applied.
  function paletteFor(theme) {
    const base = Object.assign({}, PALETTES[theme], { font: letterFont() });   // Settings → Text style (section 12b)
    const key = accentNow();
    if (key === 'blue') return base; // blue is the built-in default
    const c = accentOf(key)[theme === 'dark' ? 1 : 0];
    base.accent = c;
    base['accent-soft'] = theme === 'dark' ? rgba(c, 0.18) : mixHex(c, '#ffffff', 0.9);
    return base;
  }
  // Title bars (section 5) carry the accent: every window's faintly (8% of it in white, dark theme 20% in #1e1e1e), the
  // focused one's clearly more, so it stands out across the room, even filling the board with no ring. TITLE_INK: the
  // text on them, index.html's --text and --title-muted.
  const TITLE_INK = { light: ['#1f2937', '#4b5563'], dark: ['#f9fafb', '#d1d5db'] };
  // The focused tint: 25% of the accent (dark theme 35%). Very light and very dark accents get just enough less to keep
  // the title text at 4.5:1 and the handles at 3:1.
  function focusTint(c, dark) {
    const base = dark ? '#1e1e1e' : '#ffffff', ink = TITLE_INK[dark ? 'dark' : 'light'];
    for (let p = dark ? 35 : 25; ; p--) {   // (percent of the accent; never down to the faint tint)
      const bg = mixHex(c, base, 1 - p / 100);
      if (p <= (dark ? 21 : 9) || (ink.every(i => contrast(i, bg) >= 4.5) && contrast(c, bg) >= 3)) return bg;
    }
  }
  // Board chrome: the CSS color tokens for the accent. index.html has Blue's built in: its faint tints are the focused
  // tints before 2026.11.18-2. The window menu's button, while its menu is open, is the accent with --on-primary text.
  function applyAccent(theme) {
    const st = document.body.style;
    const names = ['--primary', '--primary-soft', '--active-bg', '--focus-ring', '--titlebar', '--focus-title', '--label-open'];
    const key = accentNow();
    if (key === 'blue') { names.forEach(n => st.removeProperty(n)); return; }
    const dark = theme === 'dark', c = accentOf(key)[dark ? 1 : 0];
    st.setProperty('--primary', c);
    st.setProperty('--focus-ring', c);
    st.setProperty('--primary-soft', rgba(c, dark ? 0.18 : 0.12));
    st.setProperty('--active-bg', dark ? rgba(c, 0.2) : mixHex(c, '#ffffff', 0.92));
    st.setProperty('--titlebar', dark ? mixHex(c, '#1e1e1e', 0.8) : mixHex(c, '#ffffff', 0.92));
    st.setProperty('--focus-title', focusTint(c, dark));
    st.setProperty('--label-open', c);
  }

  // Board background colors (Settings shows them in two rows) and patterns (.pattern-<id> in index.html).
  const BG_LIGHT = [['#ffffff', 'White'], ['#f3ede1', 'Paper'], ['#e0f2fe', 'Sky'], ['#dcfce7', 'Mint'], ['#fce7f3', 'Blush'], ['#ede9fe', 'Lavender']];
  const BG_DARK = [['#334155', 'Slate'], ['#1f3a2c', 'Chalkboard'], ['#1e293b', 'Navy'], ['#0a0a0a', 'Black']];
  const BG_SWATCHES = BG_LIGHT.concat(BG_DARK);
  // The old Paper (#faf7f0) and Sand (#fef3c7) are now one Paper, a little darker than the old one: a board that has
  // either reads as the new Paper (where its record is applied, and where a file is read). Any other color is kept.
  const BG_RENAMED = { '#faf7f0': '#f3ede1', '#fef3c7': '#f3ede1' };
  const bgColor = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? BG_RENAMED[c.toLowerCase()] || c : null);
  // Patterns (removed from Settings 2026-11-16; uncomment the parts marked "Patterns" to bring them back). A board
  // still keeps its background.pattern: it is read, checked, saved, exported and imported as before, so turning
  // them back on brings back each board's choice, and an older 21Board keeps showing it. They just aren't drawn.
  // Handwriting and Graph paper came later: an older 21Board shows no pattern for them (and an import there makes it "none").
  const PATTERNS = [['none', 'None'], ['dots', 'Dots'], ['grid', 'Grid'], ['lines', 'Lines'], ['handwriting', 'Handwriting'], ['graph', 'Graph paper']];
  const PATTERN_IDS = PATTERNS.map(p => p[0]);
  const bgColorName = c => !c ? 'Matches the theme' : (BG_SWATCHES.find(([h]) => h === c) || [0, 'Custom color'])[1];
  // The hint's text and the shaded margins, in shades that suit the board color (light, dark, or the theme's), and
  // the pattern lines (pattern, strong: for the patterns, not drawn for now).
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
  // A fingerprint of a board's content (a full export): to tell whether it changed since it was saved as a
  // version. Not the window stacking order (tapping a window to bring it forward isn't a change).
  function boardSig(exp) {
    const m = exp.media && exp.media.background;
    return hash53(JSON.stringify([exp.board, exp.theme, exp.accent, exp.instances.map(i => { const o = Object.assign({}, i, { z: 0 }); delete o.createdAt; return o; }),
      m ? [m.bytes, m.addedAt, m.w, m.h, exp.media.look] : null]));
  }
  // The fingerprints (sigOf: boardSig, or Board history's) the board may have been saved as a version with: as it
  // is, and, with the new Paper, as it was stored before the old Paper and Sand became it (BG_RENAMED). Reading the
  // old color as the new one isn't a change.
  function boardSigs(exp, sigOf = boardSig) {
    const bg = exp.board && exp.board.background, sigs = [sigOf(exp)];
    for (const [old, now] of Object.entries(BG_RENAMED)) {
      if (bg && bg.color === now) sigs.push(sigOf(Object.assign({}, exp, { board: Object.assign({}, exp.board, { background: Object.assign({}, bg, { color: old }) }) })));
    }
    return sigs;
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
      // Board Sync: content changed on two devices at once keeps the later (a Timer's, Dice's, Traffic light's content is
      // only a setting); otherwise both are kept, the other as a labelled copy (section 13d).
      clash: a.clash === 'later' ? 'later' : null,
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
  // Test widgets uploaded as a file (Settings → Advanced → Developer mode → Test a widget → Upload file…). The browser
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
          getAll: q => req(() => Array.from(this.map.keys()).sort().filter(k => q === undefined || hit(k, q)).map(k => clone(this.map.get(k)))),
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

    // The records whose keys start with any of these (Board Sync's look at the board: board:, inst:, data:, conf:, settings,
    // link:), in one transaction. A failed read throws: the caller then reads around a damaged record (readAll).
    async getRange(prefixes) {
      const r = await this.tx('readonly', (s, set) => {
        const out = [];
        for (const p of prefixes) {
          const q = p.endsWith(':') ? s.getAll(IDBKeyRange.bound(p, p + '\uffff')) : s.get(p);
          q.onsuccess = () => { if (Array.isArray(q.result)) out.push(...q.result); else if (q.result) out.push(q.result); };
        }
        set(out);
      });
      return r || [];
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

  // Writes that may have missed a merge (Board Sync, section 13d; docs/DATA-FORMAT.md, "Keeping several open copies in
  // sync"). Each change queued here notes base: the revision of its record this tab knew when it was queued. A merge's
  // write that this tab applied in the last ms (a widget may still save what it showed before it) gives its later saves
  // the revision before the merge as their base; one this tab didn't apply because it had a change of its own waiting
  // gives every save of that record the revision before the merge, until this tab shows a merged write of it. Either
  // way the next look at the board sees an edit made without the merge, and keeps both.
  const Raced = {
    recent: new Map(),     // key -> { until, prevRev }
    missed: new Map(),     // key -> the revision this tab had when it didn't apply a merge's write
    gone: new Map(),       // key -> the revision a record had when this tab saw it deleted (a Reset): a change that makes it
                           // again is based on that, not on "absent", which would look like one that never saw a merge
    // (LINK_RACE_MS, on a clock that never goes back: a device clock set back mustn't stretch it to days)
    note(key, prevRev) { this.recent.set(key, { until: performance.now() + Link.waits.race, prevRev }); this.missed.delete(key); },
    miss(key, rev) { if (!this.missed.has(key)) this.missed.set(key, rev); },
    // The Undo of a merge: its writes are based on what the merge wrote.
    clear(keys) { for (const k of keys) { this.recent.delete(k); this.missed.delete(k); } },
    base(key) {
      if (this.missed.has(key)) return this.missed.get(key);
      const r = this.recent.get(key);
      if (r && r.until > performance.now()) return r.prevRev;
      if (r) this.recent.delete(key);
      return Known.get(key) || this.gone.get(key) || 0;
    }
  };

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
    // opts.undo: the Undo of a merge (u, so other devices can say so).
    put(key, type, value, opts = {}) { if (!Store.loaded) return Promise.resolve(false); this.pending.set(key, this.based(key, { type, value: clone(value), u: opts.undo ? 1 : 0 })); return this.kick(key); },
    del(key) { if (!Store.loaded) return Promise.resolve(false); this.pending.set(key, this.based(key, { del: true })); return this.kick(key); },
    // Some keys of a record (settings), put over the stored value when written, with deletedBoards changed as set
    // operations: a tab with an old copy of the settings never writes its old lists over newer ones (Merge.patchSettings).
    patch(key, type, patch) {
      if (!Store.loaded) return Promise.resolve(false);
      const was = this.pending.get(key);
      const op = was && was.patch ? Object.assign({}, was, { patch: Merge.joinPatches(was.patch, patch) })
        : was && !was.del && !was.absent ? Object.assign({}, was, { value: Merge.patchSettings(was.value, patch) }) : this.based(key, { type, patch });
      this.pending.set(key, op);
      return this.kick(key);
    },
    // The base of a queued change: the earliest of the changes to that record that it stands for.
    based(key, op) {
      const was = this.pending.get(key), b = Raced.base(key);
      op.base = was && typeof was.base === 'number' ? Math.min(was.base, b) : b;
      return op;
    },

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
              const value = op.patch ? Merge.patchSettings(g.result ? g.result.value : S.settings, op.patch) : op.value;
              const rec = { key, type: op.type, rev: Math.max(((g.result && g.result.rev) || 0) + 1, Date.now()), updatedAt: Date.now(), by: TAB_ID, value };
              if (typeof op.base === 'number') rec.base = op.base;
              if (op.u) rec.u = 1;
              // (A put the browser refuses outright ends the whole batch: keep its reason.)
              try { s.put(rec); out.push(rec); } catch (err) { thrown = thrown || err; try { s.transaction.abort(); } catch (e) { /* already ended */ } }
            };
          }
          set(out);
        }) || [];
      } catch (e) { throw thrown || e; }
      for (const r of written) { if (r.deleted) { if (Known.get(r.key)) Raced.gone.set(r.key, Known.get(r.key)); Known.delete(r.key); } else Known.set(r.key, r.rev); Pages.hold(r.key, r.deleted ? null : r); }
      // (a settings patch was put over what was stored, which may hold another tab's or a merge's pages added, moved or
      // deleted, or a merge's theme, accent and text style, which this tab didn't show while its patch waited: shown here too)
      const st = written.find(r => r.key === Keys.settings && batch.get(r.key) && batch.get(r.key).patch);
      if (st) {
        const w = this.pending.get(Keys.settings), v = w && w.patch ? Merge.patchSettings(st.value, w.patch) : st.value;
        const next = Object.assign({}, S.settings);
        for (const k of ['boards', 'deletedBoards', 'deletedAt', 'lastBoard'].concat(Merge.STYLE_PARTS)) if (k in v) next[k] = v[k];
        if (!sameJSON(next, S.settings)) { S.settings = next; applySettings(); afterBulkApply(); }
      }
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
    keys.forEach((k, i) => applyNews(k, recs[i], true));
    afterBulkApply();
  }
  // A record another tab wrote: shown here, and a change of this tab's to it that is still waiting is the older one
  // (drop). Not for a merge's write (m, Board Sync): a change waiting here was made without it, so the record isn't
  // shown and the change is written as it is; the next look at the board finds both and keeps both (§3.4).
  function waiting(key) { return Writer.pending.has(key) || (Writer.running && Writer.batch.has(key)); }
  function applyNews(key, rec, drop) {
    if (rec && rec.m) {
      if (waiting(key)) { Raced.miss(key, Known.get(key) || 0); return false; }
      return applyRecord(key, rec);
    }
    // (A settings change waiting here is a patch of its own keys, put over whatever is stored: never the older one.
    // It is shown over the other tab's record, and written as it is.)
    const op = Writer.pending.get(key) || (Writer.running && Writer.batch.get(key)), patch = op && op.patch;
    const news = applyRecord(key, patch && rec ? Object.assign({}, rec, { value: Merge.patchSettings(rec.value, patch) }) : rec);
    if (news && drop && !patch) Writer.drop(key);
    return news;
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
        const r = { key, type: op.type, rev: i !== undefined ? recs[i].rev : 0, value: op.patch ? Merge.patchSettings(i !== undefined ? recs[i].value : S.settings, op.patch) : op.value };
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
    const apply = (key, rec) => (must ? applyRecord(key, rec) : applyNews(key, rec, true));
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
  // Every page has a unique id (board.uid): Board Sync matches pages by it on every device.
  function ensureUid() { if (!UID_RE.test(S.board.uid || '')) updateBoard({ uid: newId() }); }

  // Returns true if the record was news to this tab (false: it already had this revision, or a newer one).
  function applyRecord(key, rec) {
    if (rec) {
      if (Known.has(key) && rec.rev <= Known.get(key)) return false;
      if (rec.m && Known.get(key)) Raced.note(key, Known.get(key));   // (a widget here may still save what it showed before it; a new record: nothing before it)
      Known.set(key, rec.rev);
    } else {
      if (!Known.has(key)) return false;
      if (Known.get(key)) Raced.gone.set(key, Known.get(key));
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
        // Stay awake (section 12b) used to have school hours: 'hours' with a From and To. Now it's on or off, and a
        // device that kept the screen on in school hours keeps it on (the teacher wanted it awake in class).
        if (S.settings.awake === 'hours') S.settings.awake = 'on';
        for (const k of OLD_SETTINGS) delete S.settings[k];   // (and from the record, with the next change: updateSettings)
        applySettings();
        break;
      case 'board':
        Pages.note(k.board, value);   // (every page's name, for the Pages menu)
        if (k.board !== S.boardId) break;
        S.board = Object.assign(defaultBoard(S.boardId), value || {});
        S.board.layout = validLayout(S.board.layout);
        S.board.background = Object.assign({ color: null, pattern: 'none' }, (value && value.background) || {});
        S.board.background.color = bgColor(S.board.background.color);   // (the old Paper and Sand: the new Paper)
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

  // A Board Sync round's writes, shown in this tab (§5.5). During a gesture they wait for its end, as other tabs'
  // changes do; a record with a change of this tab's waiting isn't shown (applyNews). A window whose content and
  // settings the merge both removed starts again; copies that arrive on the page shown flash.
  function applyMerged(keys, recs) {
    if (!Store.loaded) return;
    if (Inter.active) { keys.forEach(k => Inter.deferredKeys.add(k)); return; }
    const before = new Set(S.insts.keys()), emptied = new Map();
    keys.forEach((k, i) => {
      const p = Keys.parse(k), rec = recs[i];
      if (applyNews(k, rec, false) && !rec && p.board === S.boardId && (p.kind === 'data' || p.kind === 'conf')) emptied.set(p.ikey, (emptied.get(p.ikey) || 0) + 1);
    });
    for (const [ik, c] of emptied) { const w = S.wins.get(ik); if (c === 2 && w) w.reload(); }
    afterBulkApply();
    Picker.renderControls();
    for (const [ik, inst] of S.insts) { const w = S.wins.get(ik); if (w && inst.copyOf && !before.has(ik)) w.attention(); }
  }

  function afterBulkApply() {
    updateFocus();
    Pages.follow();   // another tab went to another page
    Picker.render();
    updateHint();
    if (Settings.isOpen) Settings.refresh();
  }

  function normalizeInst(v, k) {
    const r = v.rect || {};
    const out = {
      widgetId: k ? k.widgetId : v.widgetId,
      n: k ? k.n : v.n,
      open: !!v.open,
      rect: { x: num(r.x, 40), y: num(r.y, 40), w: Math.max(20, num(r.w, 400)), h: Math.max(TITLE_H + 10, num(r.h, 340)) },
      z: num(v.z, 1),
      maximized: !!v.maximized,
      createdAt: num(v.createdAt, Date.now())
    };
    // Which window this is on every device (Board Sync), and, on a copy kept from a clash, what it is a copy of.
    if (typeof v.wid === 'string' && Merge.WID_RE.test(v.wid)) out.wid = v.wid;
    const c = copyLabel(v.copyOf);
    if (c) out.copyOf = c;
    return out;
  }
  const copyLabel = c => (c && typeof c === 'object' && typeof c.wid === 'string' && Merge.WID_RE.test(c.wid)
    ? { wid: c.wid, from: String(c.from || '').slice(0, 40), name: String(c.name || '').slice(0, 60), at: num(c.at, 0) } : null);

  function saveInst(ikey, inst) {
    const prev = S.insts.get(ikey);
    S.insts.set(ikey, inst);
    if (prev && sameJSON(prev, inst) && Known.has(Keys.inst(S.boardId, ikey))) return Promise.resolve();
    return Writer.put(Keys.inst(S.boardId, ikey), 'inst', inst);
  }

  // quiet: nothing Settings shows changes but the status lines (when the last backup was), which are put right in place.
  // Written as a patch of the keys given (Writer.patch); gone: deleted pages added or removed (Pages.goneWith).
  const OLD_SETTINGS = ['devWidgets', 'awakeFrom', 'awakeTo'];
  function updateSettings(patch, quiet) {
    const p = { set: {}, drop: OLD_SETTINGS };
    for (const [k, v] of Object.entries(patch)) { if (k === 'gone') p.gone = v; else p.set[k] = v; }
    // (when the theme, accent or text style was chosen here: with Board Sync the later choice wins on every device, see
    // Merge.stamp)
    for (const k of Merge.STYLE_PARTS) if (k in p.set) p.set[k + 'At'] = Date.now();
    S.settings = Merge.patchSettings(S.settings, p);
    applySettings();
    Writer.patch(Keys.settings, 'settings', p);
    // (drawn again only if something it shows changed: a deleted page purged or a Board history copy written while
    // Settings is open changes nothing in it, and a screen reader or a tap there isn't disturbed)
    if (Settings.isOpen) { if (quiet) Settings.refreshStatus(true); else Settings.refresh(); }
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
    const themeSig = theme + '|' + accentNow() + '|' + letterKey();   // (the text style goes to widgets with the theme)
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
    applyClassroom();    // section 12b: lock, screen, clock, text style
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
    // Patterns (removed 2026-11-16; uncomment to bring them back, with their CSS in index.html and Settings' tiles):
    // PATTERN_IDS.forEach(p => desk.classList.remove('pattern-' + p));
    // if (bg.pattern !== 'none' && PATTERN_IDS.includes(bg.pattern)) desk.classList.add('pattern-' + bg.pattern);
    const ink = bgInk(bg.color);
    // desk.style.setProperty('--pattern', ink.pattern);
    // desk.style.setProperty('--pattern-strong', ink.strong);
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
  // A photo in Board Sync's Photos folder (section 13b): the start of its SHA-256 and its type, nothing else (no paths).
  const PHOTO_FILE_RE = /^[0-9a-f]{32}\.(jpg|png|webp)$/;
  function normalizePhotoSettings(im) {
    if (!im || typeof im !== 'object') return null;
    const f = im.focus || {};
    const unit = v => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.5);
    return { on: im.on !== false, fit: im.fit === 'whole' ? 'whole' : 'fill', focus: { x: unit(f.x), y: unit(f.y) }, fade: Math.max(0, Math.min(0.7, +im.fade || 0)) };
  }
  // CSS background-position: the chosen spot stays in view when filling; a whole photo is centered.
  const photoPosition = im => (im.fit === 'whole' ? '50% 50%' : `${(im.focus.x * 100).toFixed(1)}% ${(im.focus.y * 100).toFixed(1)}%`);
  const BoardPhoto = {
    url: null, src: null, pending: null, spent: [],
    el() { return $('#board-bg'); },
    settings() { return this.media() ? (normalizePhotoSettings(S.media.get('background-look')) || normalizePhotoSettings({})) : null; },
    media() { const m = S.media.get('background'); return validPhoto(m) ? m : null; },
    // The picture as an object URL (one big data: string in a style would be parsed again on every change). Calls at
    // the same moment (the board and Settings, when a photo is put on with Settings open) share one URL; the one
    // before is revoked only once the new one is made (the board shows it until then).
    objectUrl(m) {
      const data = m.data;
      if (this.src !== data) {
        if (this.url) this.spent.push(this.url);
        this.src = data; this.url = null;
        this.pending = fetch(data).then(r => r.blob()).then(blob => {
          if (this.src !== data) return this.pending;   // another photo since: its URL
          this.url = URL.createObjectURL(blob);
          this.spent.splice(0).forEach(u => URL.revokeObjectURL(u));
          return this.url;
        }, err => { if (this.src === data) this.src = null; throw err; });
      }
      return this.url ? Promise.resolve(this.url) : this.pending;
    },
    renders: 0,
    async render() {
      const el = this.el();
      if (!el) return;
      const n = ++this.renders, im = this.settings(), m = this.media();
      const show = !!(im && im.on && m);
      document.body.classList.toggle('has-photo', show);
      if (!show) { el.hidden = true; el.style.backgroundImage = ''; return; }
      let url;
      try { url = await this.objectUrl(m); } catch (e) { el.hidden = true; return; }
      if (n !== this.renders) return;   // changed while loading (another photo, or hidden): the newer render wins
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
    // (only what changed is written: a change is a change to the page, which a screen reader may notice)
    const hint = $('#empty-hint');
    if (hint.hidden !== open > 0) hint.hidden = open > 0;
    // Windows gone (a student closed everything?): offer Board history.
    const rescue = $('#empty-hint .rescue'), none = !(open === 0 && BoardHistory.metas.some(m => Date.now() - m.at < 7 * 864e5 && m.thumb && m.thumb.wins.length));
    if (rescue && rescue.hidden !== none) rescue.hidden = none;
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
  //   Widescreen, a 16:9 board (default, board.shape '16:9'): layout space is a fixed 16:9 board of
  //     BASE_W/scale × BASE_H/scale, drawn as large as fits the screen (centered left-right, top
  //     aligned; the rest of the screen is lightly shaded). Every screen shows the same arrangement.
  //   Fill (board.shape 'free'; Settings → Appearance → Board shape): the board is the whole screen at the board's scale
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
    HistorySheet.place();  // section 13c: Board history's columns, at --ui
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
      this.el.innerHTML = '<div class="msg"><b>This board keeps a<br>standard widescreen shape.</b>Do you want it to fill<br>the whole window?</div>' +
        '<div class="acts"><button class="btn primary small" data-act="unlock">Use the whole window</button></div>' +
        `<button class="hide" data-act="hide" aria-label="Hide this tip" title="Hide">${svg('close')}</button>`;
      this.el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'unlock') {
          if (!setBoardShape('free')) return;   // refused (someone is moving a window); it said why
          if (Settings.isOpen) Settings.render();
          toast('The board now fills the window. Settings → Appearance → Board shape → Widescreen changes it back.');
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

  // What a page's own setting reaches: with Board Sync (section 13b), the page on every device.
  const pageScope = () => (Link.dir ? 'This page, on all your devices.' : 'This page only.');
  // Settings → Advanced → Size of windows and menus, and Settings → Appearance → Board shape (both saved with the page).
  function scaleSettingsRow() {
    const sc = boardScale();
    return `<div class="row"><div><div class="lbl">Size of windows and menus</div><div class="hint">${pageScope()}</div></div>
        <div class="stepper" role="group" aria-label="Size of windows and menus">
          <button class="icon" data-act="scale-down" aria-label="Smaller"${sc <= SCALES[0] + 0.001 ? ' disabled' : ''}>−</button>
          <output id="st-scale" aria-live="polite">${Math.round(sc * 100)}%</output>
          <button class="icon" data-act="scale-up" aria-label="Larger"${sc >= SCALES[SCALES.length - 1] - 0.001 ? ' disabled' : ''}>+</button>
        </div></div>`;
  }
  // Widescreen (16:9) or Fill (the whole window). The hint is the chosen one's, and only that (Background, in the same
  // section, says what a page's own look reaches).
  function shapeSettingsRow(seg) {
    const hint = freeShape() ? 'Uses the whole window.' : 'Looks the same on every screen.';
    return `<div class="row"><div><div class="lbl">Board shape</div><div class="hint">${hint}</div></div>${seg('shape', freeShape() ? 'free' : '16:9', [['16:9', 'Widescreen'], ['free', 'Fill']], false, 'Board shape')}</div>`;
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

  function placeNew(size, c, side, at) {
    const view = boundsRect();
    const obs = obstacles(null);
    const anchor = at || { x: view.x + view.w * (side === 'left' ? 0.32 : side === 'right' ? 0.68 : 0.5), y: view.y + view.h * 0.42 };
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
        `<div class="win-title"><button class="win-label" aria-haspopup="menu" title="Window menu"><span class="name"></span><span class="num"></span><span class="copy-label" hidden></span><span class="sub"></span>${svg('chevron')}</button></div>` +
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
      // A copy kept from a clash (Board Sync): a short label of its own (.sub is the widget's subtitle), the whole
      // sentence in its title and in the window name's label.
      const c = this.inst && this.inst.copyOf, cl = $('.copy-label', this.labelEl);
      cl.hidden = !c;
      cl.textContent = c ? `Copy · ${copyWhen(c.at, false)}` : '';
      if (c) cl.title = `${copyWhose(c)} version from ${copyWhen(c.at, true)}, kept because this window was changed on two devices at once.`; else cl.removeAttribute('title');
      this.labelEl.setAttribute('aria-label', `${this.widget.name}${this.inst && this.inst.n > 1 ? ' ' + this.inst.n : ''}${c ? `, ${copyWhose(c, true)} version from ${copyWhen(c.at, true)},` : ''} window menu`);
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

    middle() { const d = this.disp || this.inst.rect; return { x: d.x + d.w / 2, y: d.y + d.h / 2 }; }

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
          Pictures.deliver(this);   // (a picture pasted or dropped on the board, for this new window: section 15c)
          break;
        }
        case 'activate': focusWin(this.ikey); closePopups(); break;
        // A paste or drop the widget didn't take, as if on the board (section 15c). Not from a widget uploaded in
        // Developer mode: it is sealed off, and opens nothing.
        case 'paste': case 'drop': if (!this.widget.sealed && Array.isArray(m.files)) Pictures.fromWin(this, m.files, m.type); break;
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
      this.lastSaveAt = performance.now();   // (Board Sync leaves a window alone while it is being used; a clock that never goes back)
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
      if (kind === 'data') unlabel(this.ikey);   // (a copy whose content is changed is an ordinary window now)
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
          // (A window opened for a picture pasted or dropped on the board keeps its middle there: section 15c.)
          const at = this.keepAt; this.keepAt = null;
          const r = resolveMove({ x: at ? at.x - s.w / 2 : inst.rect.x, y: at ? at.y - s.h / 2 : inst.rect.y, w: s.w, h: s.h }, obstacles(this), view, screenPx(RESISTANCE.strong), S.settings.snapping);
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

  // A copy kept from a clash (Board Sync): whose version it is ("The laptop’s", "This device’s"; lower case inside a
  // sentence) and when it was made ("9:41 AM", or "Nov 9" on another day; long: "Nov 9 at 9:41 AM").
  function copyWhose(c, inner) {
    const who = c.from && c.from === devKey() ? 'this device' : String(c.name || '').trim() || 'another device';
    return (inner ? who : who.charAt(0).toUpperCase() + who.slice(1)) + '’s';
  }
  // This device in Board Sync's versions: its id (link:state), 12 characters (see section 13d).
  function devKey() { return Link.st.device ? Link.dev() : ''; }
  function copyWhen(at, long) {
    const d = new Date(at), today = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), day = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return today ? time : long ? `${day} at ${time}` : day;
  }
  // The copy's label goes once it is moved, resized or changed: it is an ordinary window from then on.
  function unlabel(ikey) {
    const inst = S.insts.get(ikey);
    if (!inst || !inst.copyOf) return;
    const next = Object.assign({}, inst);
    delete next.copyOf;
    saveInst(ikey, next);
    const w = S.wins.get(ikey);
    if (w) w.renderTitle();
  }

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

  // Board Sync (section 13d): where a copy kept from a clash goes, beside its window (a free spot on the page shown;
  // otherwise one step down and right, on the board), and the stacking number that puts a window on top of a page.
  function placeCopy(uid, rect, near) {
    const step = v => ({ x: near.x + 32, y: near.y + 32, w: rect.w, h: rect.h });
    if (uid === S.board.uid) {
      const view = boundsRect();
      return findFreeSpot(rect.w, rect.h, view, obstacles(null), { x: near.x + near.w / 2, y: near.y + near.h / 2 }) || clampToView(step(), view);
    }
    const b = Array.from(Pages.info).find(([, i]) => i.uid === uid), rec = b && Pages.held.get(Keys.board(b[0]));
    const v = rec && rec.value, C = canvasFor(validScale(v && v.scale) || DEFAULT_SCALE);
    return v && v.shape === 'free' ? step() : clampToView(step(), { x: 0, y: 0, w: C.w, h: C.h });
  }
  function zTop(uid) {
    if (uid === S.board.uid) return maxZ() + 1;
    const b = (Array.from(Pages.info).find(([, i]) => i.uid === uid) || [])[0];
    let z = 0;
    for (const [key, r] of Pages.held) { const k = Keys.parse(key); if (k.kind === 'inst' && k.board === b && r.value && r.value.open) z = Math.max(z, num(r.value.z, 0)); }
    return z + 1;
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
  // opts.fresh: always a new window (a picture pasted on the board: a closed Picture window keeps its own, section 15c);
  // opts.at: near this point (layout px) instead of the middle of the board.
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
    // (Not a closed copy kept from a clash: it holds another device's older version.)
    const closed = !opts.fresh && mine.find(i => !i.open && !i.copyOf);
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
      const rect = placeNew(defaultOuterSize(widget), constraintsFor(widget), opts.side, opts.at), createdAt = Date.now();
      // wid: which window this is on every device (Board Sync)
      inst = { widgetId, n, open: true, rect, z: maxZ() + 1, maximized: false, createdAt, wid: Merge.newWid(widgetId, createdAt, new Set(Array.from(S.insts.values(), i => i.wid))) };
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
        it.win.keepAt = null;   // (moved by hand: no longer kept where a picture opened it, section 15c)
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
        const next = Object.assign({}, win.inst, { rect: { x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h) }, maximized: false });
        delete next.copyOf;   // (a copy kept from a clash, moved or resized: an ordinary window from now on)
        saveInst(win.ikey, next);
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
  // here is needed from the widget. Settings → Advanced → Drag windows from inside can switch it off.
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
      // A font for the text style finishing loading can change where names wrap: measure again.
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => this.fitNames());
    },

    toggle(side) { if (this.side === side) this.close(); else this.open(side); },

    open(side) {
      closePopups();
      this.side = side;
      this.render();
      this.renderControls();
      this.el.classList.remove('left', 'right');
      this.el.classList.add(side, 'open');
      this.fitNames();
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
        // A long name is cut to two lines (…): the tooltip starts with it in full, and it is what a screen reader says
        // (a list item takes its name only from here), then what the widget does.
        const about = a.description && a.description !== a.name ? a.description : '';
        return `<button class="widget-tile" role="listitem" data-widget="${esc(a.id)}" aria-label="${esc(a.name)}"` +
          `${about ? ` aria-description="${esc(about)}"` : ''} title="${esc(about ? a.name + '\n' + about : a.name)}">` +
          `<span class="widget-icon" style="--c:${esc(a.color)}">${a.icon}</span><span class="widget-name">${esc(a.name)}</span>` +
          (c ? `<span class="badge" aria-label="${c} open">${c}</span>` : '') +
          (a.dev || a.devOnly ? '<span class="devtag">DEV</span>' : '') + '</button>';
      }).join('') || '<div class="empty-note" style="grid-column:1/-1;padding:16px">No widgets installed.</div>';
      this.fitNames();
    },

    // Only a name cut to two lines (…) is clipped to its box; the others are marked to be drawn whole (index.html,
    // .widget-name.fits). Measured as drawn, so only while the panel is open, and while clipped: every browser counts
    // the lines a clipped box hides.
    fitNames() {
      if (!this.el || !this.el.classList.contains('open')) return;
      const names = $$('.widget-name', this.el);
      for (const n of names) n.classList.remove('fits');
      const fits = names.map(n => n.scrollHeight <= n.clientHeight + 1);
      names.forEach((n, i) => n.classList.toggle('fits', fits[i]));
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
      const fs = set('fullscreen', fsOn ? 'fullscreenExit' : 'fullscreen', fsOn ? 'Exit full screen' : 'Full screen');
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
    } catch (err) { toast('Full screen isn’t available here.'); }
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
        if (w.inst.copyOf) html += item('delete-copy', svg('trash'), 'Delete this copy', '', 'danger');   // (Board Sync: a copy kept from a clash)
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
      // (Measured at the screen's top left: where it was last, at another zoom or by another window, it may have had
      // too little room to its right, and been squeezed to its min-width, its labels wrapped onto more lines.)
      this.el.style.left = this.el.style.top = '0px';
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
      if (Lock.on() && /^(maximize|restore|reset|reset-yes|history|close|delete-copy)$/.test(act)) { this.close(); return; }   // (locked meanwhile)
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
        case 'history': this.close(); HistorySheet.open(Settings.side || 'left', { ikey: w.ikey, back: () => w.labelEl }); break;
        case 'own': this.close(); if (w.widget.external) window.open(w.widget.entry, '_blank', 'noopener'); break;
        case 'reload': this.close(); if (w.widget.external) { w.reload(); focusWin(w.ikey); } break;
        case 'reset-no': this.confirming = false; this.render(); this.position(); break;
        case 'close': this.close(); closeWin(w.ikey); break;
        case 'delete-copy': this.close(); deleteCopy(w.ikey); break;
      }
    }
  };
  // A copy kept from a clash (Board Sync), deleted from its window menu: asked, then as Settings › Saved widgets deletes.
  async function deleteCopy(ikey) {
    const i = S.insts.get(ikey);
    if (!i) return;
    const widget = getWidget(i.widgetId), name = `${widget ? widget.name : i.widgetId}${i.n > 1 || !widget ? ' ' + i.n : ''}`;
    const ok = await dialog({ title: `Delete this copy of ${widget ? widget.name : 'the window'}?`, message: 'Its window and everything saved in it will be removed from this board. ' +
      (BoardHistory.enabled() ? 'You can bring it back from Board history for a while.' : 'This can’t be undone.'), actions: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
    if (!ok || !S.insts.has(ikey)) return;
    const id = await deleteInstance(ikey);
    toast(`Deleted ${name}.`, id ? { action: 'Undo', timeout: 15000, onAction: () => BoardHistory.putBack(id, ikey, { exact: true, quiet: true }) } : {});
  }

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
  // A deleted page waits in settings.deletedBoards while its Undo is offered; then its records go (purge), and its
  // board history is kept for 30 days, under Board history › Deleted pages. One left there goes at the next start, once
  // its Undo is over (another tab may still offer it: settings.deletedAt says when it was deleted). A page's id is never
  // used again (settings.lastBoard): nothing left of a deleted page can turn up in a new one. The order is each page's
  // pos (board:<b>, Board Sync merges it); settings.boards is this device's copy of it.
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
    note(b, value) { if (!Number.isInteger(b) || b < 1) return; if (value) this.info.set(b, { name: String(value.name || 'My Board'), uid: value.uid || null, pos: num(value.pos, null) }); else this.info.delete(b); },
    gone(st = S.settings) { return new Set((Array.isArray(st.deletedBoards) ? st.deletedBoards : []).map(Number)); },
    // The settings change for these pages deleted now (add) or not deleted after all, or gone for good (remove): set
    // operations on the stored lists (see updateSettings), so another tab's or a merge's deleted pages stay as they are.
    goneWith(add = [], remove = []) {
      const now = Date.now();
      return { gone: add.map(b => ['add', b, now]).concat(remove.map(b => ['remove', b])) };
    },
    // ---- the order: each page's pos
    posOf(b) { return b === S.boardId ? num(S.board.pos, null) : ((this.info.get(b) || {}).pos ?? null); },
    // These pages in this order: moved (or new) pages get a pos between their neighbours' (all are numbered 1, 2, 3…
    // again when there's no room). Returns { b: pos } of the pages whose pos changes.
    positions(order, moved = []) {
      const P = order.map(b => (moved.includes(b) ? null : this.posOf(b)));
      for (let i = 0; i < P.length; i++) {
        if (P[i] !== null) continue;
        let j = i; while (j < P.length && P[j] === null) j++;
        const lo = i > 0 ? P[i - 1] : null, hi = j < P.length ? P[j] : null, k = j - i;
        for (let m = 0; m < k; m++) P[i + m] = lo === null && hi === null ? m + 1 : lo === null ? hi - (k - m) : hi === null ? lo + m + 1 : lo + (hi - lo) * (m + 1) / (k + 1);
        i = j - 1;
      }
      const tight = P.some((p, i) => i > 0 && !(p - P[i - 1] >= 1e-6));
      const out = {};
      order.forEach((b, i) => { const p = tight ? i + 1 : P[i]; if (p !== this.posOf(b)) out[b] = p; });
      return out;
    },
    // The pages in this order (moved: the pages that moved), into their board records and settings.boards.
    setOrder(order, moved = []) {
      for (const [b, pos] of Object.entries(this.positions(order, moved))) this.writePos(+b, pos);
      updateSettings({ boards: order });
    },
    writePos(b, pos) {
      if (b === S.boardId) { updateBoard({ pos }); return; }
      const rec = this.held.get(Keys.board(b));
      if (!rec || !rec.value) return;
      const value = Object.assign({}, rec.value, { pos });
      this.note(b, value);
      Writer.put(Keys.board(b), 'board', value);
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
        // (Board Sync: a round that is putting other content on the board finishes first, see Link.swap.)
        await Link.swap(async () => { await this.leave(); await this.show(b, opts); });
      } finally { if (own) this.busy = false; }
      if (!opts.follow && S.settings.activeBoard !== S.boardId) updateSettings({ activeBoard: S.boardId });
      this.follow();   // (another tab may have gone elsewhere meanwhile)
      return S.boardId === b;
    },
    async leave() {
      // (A field being typed in, such as this device's name in Settings, is saved first. Not one in a dialog, which
      // stays open: Board Sync's last step, while the board it took is shown.)
      const typing = document.activeElement;
      if (typing && typing.matches('input, textarea, select') && !typing.closest('#modal')) typing.blur();
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
      MergeUI.pageShown(S.board.uid);   // (changed by another device while it wasn't shown: said once, section 13d)
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
      const pos = this.positions(order, [id]);   // (between its neighbours, or every page numbered again if there's no room)
      const board = Object.assign(defaultBoard(id), { name: opts.name || `Page ${at + 1}`, uid: opts.uid || newId(),
        background: clone(S.board.background) || { color: null, pattern: 'none' }, scale: boardScale(), shape: freeShape() ? 'free' : '16:9', layout: canvasFor(boardScale()), pos: pos[id] });
      this.note(id, board);
      for (const [b, p] of Object.entries(pos)) if (+b !== id) this.writePos(+b, p);
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
        await applyImport(Object.assign({}, p, { theme: null, accent: null, letters: null }), 'replace', { uid, keepCreated: true, photo: 'file', history: false, fresh: true });
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
      this.setOrder(order, [S.boardId]);
      Picker.renderControls();
      this.flash();
    },
    async remove() {
      const order = this.ids();
      if (order.length < 2 || this.busy) return;
      const b = S.boardId, name = S.board.name, at = order.indexOf(b);
      const n = Array.from(S.insts.values()).filter(i => i.open).length, saved = S.insts.size - n;
      const ok = await dialog({ title: `Delete “${name}”?`,
        message: `This page and its ${n ? `${n} window${n === 1 ? '' : 's'}` : 'background'}${saved ? ` (and ${saved} closed window${saved === 1 ? '' : 's'})` : ''} are deleted ${Link.dir ? 'here and on your other devices' : 'from this device'}.` + appsOwnWork('deleted here', 'Clear it'),
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
    // Board Sync (section 13d): pages a merge deleted (its transaction listed them in deletedBoards) go as a deletion
    // here does, once their Undo is over; pages a merge brought back don't go after all.
    goneAt: new Map(),   // page id -> when another device deleted it (Board history › Deleted pages says that time)
    goneByMerge(list, at = {}) {
      for (const b of list) { if (at[b]) this.goneAt.set(b, at[b]); clearTimeout(this.purges.get(b)); this.purges.set(b, setTimeout(() => this.purge([b]), PAGE_UNDO_MS + 3000)); }
      Picker.renderControls();
    },
    backByMerge(list) {
      list.forEach(b => { clearTimeout(this.purges.get(b)); this.purges.delete(b); });
      Picker.renderControls();
    },
    async undrop(list, order, onUndo) {
      // (Its records must still be there: never an empty page in its place.)
      if (list.some(b => !this.purges.has(b)) || !await this.stored(list)) { toast('That can’t be undone anymore.'); return; }
      list.forEach(b => { clearTimeout(this.purges.get(b)); this.purges.delete(b); });
      // (Change… still switching folders: the page comes back once the new folder's board is here, into it, not into the
      // board the switch is about to replace, nor into the folder left, which has heard it was deleted. At most a minute)
      for (let i = 0; i < 600 && Link.switching(); i++) await sleep(100);
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
      if (keys.length) { Sync.announce(keys); Link.changed(keys); }   // (written around Writer: Board Sync is told)
      for (const b of list) { await BoardHistory.markDeleted(b, this.goneAt.get(b)); this.goneAt.delete(b); }   // (its versions stay 30 days: Board history › Deleted pages)
      updateSettings(this.goneWith([], list));
      HistorySheet.refresh();   // (an open Deleted pages list: its Bring back is now the kept version's, not the Undo)
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
  // One sheet, opened from the gear in either Widget Picker, on that side. Top to bottom:
  //   (banners: a save problem, a new version ready)
  //   Board Sync   (Chrome and Edge: section 13b) the folder and how syncing is going (Change…, Unlink), this
  //                device's name, history copies in the folder
  //   Classroom    Lock windows in place, Go back to an earlier version (Board history, as a column beside
  //                Settings: section 13c), Close all windows, Stay awake
  //   This page    Saved widgets ▸
  //   Appearance   Theme, Background ▸, Accent color, Text style ▸, Board shape
  //   Advanced ▸   Widget Picker, Clock in the corner, Size of windows and menus, moving windows, board history, backups
  //                and storage, Developer mode, About
  // ▸ is a group shown as one row with its value, that opens in place (settingsGroup; Settings.groups). A group that
  // is closed is still in the page, hidden, so whatever looks for its parts (refreshStatus, the clock's fit note)
  // finds them.
  // Settings → Appearance → Background: one set of choices (the theme's, colors, Custom…, the photo). It's this
  // page's background (board.background, and its photo in media:<b>:background*).
  // =====================================================================
  // 12b. Classroom features: lock windows, stay awake, clock in the corner, text style
  // ---------------------------------------------------------------------
  // Each feature keeps its code in its own part below and is wired in through these hooks:
  // applySettings() calls applyClassroom(); Settings.render shows the rows; Settings.act passes actions on.
  // Lock, Stay awake and the clock belong to this device (DEFAULT_SETTINGS, "Classroom features"); the text style is
  // the whole board's, like the theme and accent color.

  function applyClassroom() {
    applyLock();
    applyAwake();
    applyLetters();   // (before the clock, which measures its text)
    applyClock();
  }

  // Settings → Classroom: lock, go back (board history, section 13c), close all, stay awake.
  // While Board Sync is set up (section 13b), the settings that stay on this device say so (the board's own ones
  // say "This page, on all your devices.": pageScope; the theme, accent color and text style, the whole board's, "On
  // all your devices.": allDevices, labelled).
  const deviceOnly = (pre = '') => (Link.dir ? pre + 'This device only.' : '');
  const allDevices = () => (Link.dir ? 'On all your devices.' : '');
  const labelled = lbl => (Link.dir ? `<div><div class="lbl">${lbl}</div><div class="hint">${allDevices()}</div></div>` : `<div class="lbl">${lbl}</div>`);
  function classroomSettings(sw, seg) {
    const rows = lockSettings(sw, seg) + historyOpenRow() + closeAllRow() + awakeSettings(sw, seg);
    return rows ? `<h3>Classroom</h3>${rows}` : '';
  }

  function classroomAct(act, val) {
    return lockAct(act, val) || awakeAct(act, val) || clockAct(act, val) || letterAct(act, val);
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
  // - a file dropped on the board or opened with 21Board asks to unlock first (it would change the windows). (Board
  //   Sync's merges still apply: Lock stops hands on this screen, not the teacher's own changes from another device.)
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
    // its text boxes (Settings.render), but the lock can change meanwhile: ▦ held with a finger (which leaves the
    // focus in the box until it lets go), or another tab. Tapped, a switch showing the wrong state would do the
    // opposite of what it shows.
    paint() {
      if (!Settings.isOpen) return;
      const on = this.on(), sw = $('[data-act="lock-windows"]', Settings.body), all = $('[data-act="close-all"]', Settings.body);
      if (sw) { sw.classList.toggle('on', on); sw.setAttribute('aria-checked', String(on)); }
      if (all) { all.disabled = on; const hint = $('.hint', all.closest('.row')), say = closeAllHint(); if (hint && hint.textContent !== say) hint.textContent = say; }
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
      MergeUI.locked();   // (a merge's Undo isn't offered while locked)
    }
    if (Menu.win) { Menu.render(); Menu.position(); }
    Pages.closeMenu();
  }

  function lockSettings(sw) {
    if (LAB) return '';   // (the widget dev window: one widget, whose window its developer moves and resizes)
    return `<div class="row"><div><div class="lbl">Lock windows in place</div><div class="hint">Widgets still work. To unlock, hold ${LOCK_KEY} for 2 seconds.${deviceOnly(' ')}</div></div>${sw('lock-windows', Lock.on(), 'Lock windows in place')}</div>`;
  }

  // Settings → Classroom → Close all: off while the windows are locked, saying why (Settings.render, Lock.paint).
  function closeAllHint() {
    return Lock.on() ? 'Unlock windows first.' : SaveNote.state() ? 'On this page. Their content is kept while 21Board stays open.' : 'On this page. Their content is kept.';
  }
  function closeAllRow() {
    return `<div class="row"><div><div class="lbl">Close all windows</div><div class="hint">${closeAllHint()}</div></div><button class="btn" data-act="close-all"${Lock.on() ? ' disabled' : ''}>${svg('windows')}Close all</button></div>`;
  }

  function lockAct(act) {
    if (act !== 'lock-windows' || LAB) return false;
    updateSettings({ locked: !Lock.on() });
    return true;
  }

  // ---- Stay awake
  // Settings → Classroom → "Stay awake": a switch. A 20-minute reading timer or the day's schedule shouldn't vanish
  // because a Chromebook dims, and teachers can't change a managed device's power settings. So, while it's on,
  // 21Board asks the browser for a screen wake lock (navigator.wakeLock), which keeps the screen on while this page
  // is on it. The browser lets the lock go whenever the page is hidden (another tab, the lid closed), so it is asked
  // for again when 21Board shows again (visibilitychange, fullscreenchange), and every minute (a lock the device took
  // back, or refused). Turned off, and in the widget dev window, it is let go. A screen that never sleeps never
  // locks either, so a signed-in teacher's account stays open to whoever walks up: Settings says so while it's on
  // (not in kiosk mode, where no one is signed in). It can't overrule IT's policy or a panel's own power settings,
  // and some browsers can't do it at all: Settings says so, only when it isn't working (Awake.status).
  // (There used to be a third choice, school hours: settings.awake 'hours' with awakeFrom/awakeTo. A device that
  // had it reads it as on: see applyRecord.)
  const Awake = {
    lock: null,        // the WakeLockSentinel while the screen is kept on
    asking: false,     // a request is on its way
    refused: false,    // the device said no to the last request
    timer: 0,
    listening: false,
    supported: () => !!(navigator.wakeLock && typeof navigator.wakeLock.request === 'function'),
    mode: () => !LAB && S.settings.awake === 'on' ? 'on' : 'off',
    wanted() { return this.mode() === 'on'; },
    check() {
      clearTimeout(this.timer);
      if (!this.listening && this.wanted()) {
        this.listening = true;
        const again = () => this.check();
        document.addEventListener('visibilitychange', again);
        document.addEventListener('fullscreenchange', again);
        document.addEventListener('webkitfullscreenchange', again);
      }
      // Again on the next minute: the device may have taken the lock back, or may allow it now.
      if (this.wanted()) this.timer = setTimeout(() => this.check(), 60000 - Date.now() % 60000);
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
    // For Settings, only when it isn't working: { dot: 'warn', text }, or null (off, on, or still being asked for).
    status() {
      // (Browsers only offer it to pages served over https, or from this device: a school server on plain http gets none.)
      if (!this.supported()) return { dot: 'warn', text: window.isSecureContext === false ? 'Needs https to keep the screen on.' : 'This browser can’t keep the screen on.' };
      if (this.mode() === 'off' || this.lock) return null;
      if (this.refused) return { dot: 'warn', text: 'This device didn’t allow it. Its settings or your school’s IT may block it.' };
      return null;
    },
    statusHTML() { const s = this.status(); return s ? `<span class="status-dot ${s.dot}"></span>${esc(s.text)}` : ''; },
    // Settings, while open: the status line, in place (Settings isn't drawn again for it).
    paint() {
      if (!Settings.isOpen) return;
      const line = $('#set-awake-status', Settings.body);
      const html = this.statusHTML();   // (only when it changes: a screen reader reads the line out again)
      if (line && line.innerHTML !== html) { line.innerHTML = html; line.hidden = !html; }
    }
  };

  function applyAwake() { Awake.check(); }

  function awakeSettings(sw) {
    if (LAB) return '';
    const on = Awake.mode() === 'on', ok = Awake.supported(), status = Awake.statusHTML(), warn = on && ok && !KIOSK;
    // (The warning is read with the switch: Settings is drawn afresh when it is turned on, with the keyboard back on it.)
    return `<div class="row awake-row"><div><div class="lbl">Stay awake</div>${deviceOnly() ? `<div class="hint">${deviceOnly()}</div>` : ''}
        ${warn ? '<div class="hint warn-line" id="set-awake-warn"><span class="status-dot warn"></span>This makes your account less secure.</div>' : ''}
        <div class="hint awake-status" id="set-awake-status" aria-live="polite"${status ? '' : ' hidden'}>${status}</div></div>
      ${sw('awake', on, 'Stay awake', !ok, warn ? 'set-awake-warn' : '')}</div>`;
  }

  function awakeAct(act) {
    if (act !== 'awake' || LAB) return false;
    if (Awake.supported()) updateSettings({ awake: Awake.mode() === 'on' ? 'off' : 'on' });
    return true;
  }

  // ---- Clock in the corner
  // Settings → Advanced → "Clock in the corner": On, Off or Auto (the default: only while 21Board is full screen). A small
  // clock beside a Widget Picker button, on every board and page, without taking a window: teachers and students check
  // the time all day, a Clock window would have to be on every page, and in full screen the device's own clock is
  // hidden (a Chromebook's shelf, Windows' taskbar). In a tab or a window, maximized or not, the shelf is there with its
  // clock, so Auto leaves the board's out. Its row sits beside Widget Picker's: it goes where ▦ goes.
  // Where: on the inner side of the ▦ button in the bottom right corner, or of the only one when Settings → Advanced
  // → Widget Picker shows the controls in one corner. Bottom right is where Chromebooks (and Windows) show the time, so it's
  // where people already look for it. Drawn like ▦ and as tall, at the board's size (--ui, like the other chrome).
  // It never covers anything: taps go through it to the windows under it (pointer-events: none); toasts keep clear
  // of it (body.clock-on in index.html); it hides while its corner's Widget Picker is open or the other corner's
  // reaches it; and where the screen is too narrow, it shows only the time, and then hides (CornerClock.place). It
  // changes exactly on the minute, in this device's way of writing times.
  const CLOCK_GAP = 8;          // CSS px between the clock and what it must keep clear of
  const CLOCK_TOASTS = 320;     // CSS px of the bottom middle always left for toasts
  // On, Off or Auto. Before 2026.11.18-1 the choices were Off, Time and Time and date: "Time and date" ('date', the old
  // default, saved by most devices without anyone choosing it) reads as Auto, and "Time" ('time': someone chose a
  // clock) as On. Nothing is rewritten. A value this release doesn't know (another release's: the page and this script
  // can be from different versions for a launch or two; or a damaged record) is the default, on the board and in
  // Settings. (An older release reads 'on' and 'auto' as its own default, Time and date, the same way.)
  const clockMode = () => {
    const v = S.settings.clock;
    return v === 'on' || v === 'off' || v === 'auto' ? v : v === 'time' ? 'on' : v === 'date' ? 'auto' : DEFAULT_SETTINGS.clock;
  };
  // Auto: is 21Board full screen now? Its own Fullscreen (⛶, the Fullscreen API: fullscreenElement); the browser's or
  // app's window in full screen without it (F11 or the Chromebook's full screen key, an app opened full screen on
  // Android: display-mode fullscreen; Chrome 155's display-state fullscreen too); kiosk mode (always full screen, no ⛶).
  // Not a tab, a maximized window or an installed app's own window. Chrome 153 says display-mode fullscreen for its
  // window's full screen, in a tab and an app's window, but not for the Fullscreen API, which only fullscreenElement
  // tells; it knows display-state only behind a flag (no value matches). Nothing is guessed from the window's size: an
  // installed app's window can fill the screen and keep the shelf, and an iPad Home Screen app fills it under its
  // status bar, which shows the time.
  const FULL_MEDIA = ['(display-mode: fullscreen)', '(display-state: fullscreen)'].map(q => { try { return window.matchMedia ? window.matchMedia(q) : null; } catch (e) { return null; } }).filter(Boolean);
  const fullScreen = () => KIOSK || !!(document.fullscreenElement || document.webkitFullscreenElement) || FULL_MEDIA.some(m => m.matches);
  const CornerClock = {
    el: null, timer: 0, side: 'right', fit: '', bare: false, fmt: null, was: false, listening: false,
    on: () => !LAB && (clockMode() === 'on' || (clockMode() === 'auto' && fullScreen())),
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
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !this.follow() && this.on()) this.tick(); });
      // A font for the text style finishing loading changes its width: measure again.
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => this.place());
    },
    apply() {
      this.listen();
      this.was = this.on();
      if (!this.was) {
        clearTimeout(this.timer);
        if (this.el) this.el.hidden = true;
        this.fit = '';
        document.body.classList.remove('clock-on');
        notifyCorners();
        this.note();
        return;
      }
      if (!this.el) this.init();
      this.tick();
    },
    // Auto: full screen coming or going (⛶, Escape, F11 or the full screen key, an app's window) shows or hides it at
    // once. A browser that says nothing else still resizes the page. (Listened for from the first apply, Auto or not:
    // follow costs nothing while nothing changes.)
    listen() {
      if (this.listening || LAB) return;
      this.listening = true;
      const follow = () => { this.follow(); };
      document.addEventListener('fullscreenchange', follow);
      document.addEventListener('webkitfullscreenchange', follow);
      window.addEventListener('resize', follow);
      for (const m of FULL_MEDIA) {
        try { if (m.addEventListener) m.addEventListener('change', follow); else if (m.addListener) m.addListener(follow); } catch (e) { /* the resize still tells */ }
      }
    },
    // Shown or hidden again if that has changed (true), or nothing (false).
    follow() {
      if (this.on() === this.was) return false;
      this.apply();
      return true;
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
        for (const withDate of [true, false]) {
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
      this.note();
    },
    // Settings, if open, says what doesn't fit (the clock came or went, or the window changed).
    note() {
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
    // For Settings: what doesn't fit in this window right now ('' when it all does, or it isn't meant to show).
    fitNote() {
      if (!this.on() || this.bare) return '';
      return !this.fit ? 'There isn’t room for it in this window right now.' : this.fit === 'time' ? 'Only the time fits in this window right now.' : '';
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
  // The clock or a ▦ button came, went or changed width: tell the windows that fill the board, once the code running now
  // is done. When the screen changed size, the layout that's coming tells them instead, with their new size and zoom in
  // the same message. (initUI's resize listener, which asks for that layout, runs before the clock's: CornerClock.listen.)
  let cornersDue = false;
  function notifyCorners() {
    if (cornersDue) return;
    cornersDue = true;
    Promise.resolve().then(() => { cornersDue = false; if (layoutRaf) return; for (const w of S.wins.values()) if (w.inst && w.inst.maximized) w.notifyInfo(); });
  }

  // Settings → Advanced, after Widget Picker. What Auto does is said; On and Off say themselves. What doesn't fit right
  // now (when it's meant to show) is said too, by CornerClock.place.
  function clockSettings(sw, seg) {
    if (LAB) return '';
    return `<div class="row"><div><div class="lbl">Clock in the corner</div>${deviceOnly() ? `<div class="hint">${deviceOnly()}</div>` : ''}<div class="hint">Auto: only in full screen.</div><div class="hint" id="set-clock-fit">${esc(CornerClock.fitNote())}</div></div>
      ${seg('clock', clockMode(), [['on', 'On'], ['off', 'Off'], ['auto', 'Auto']], false, 'Clock in the corner')}</div>`;
  }

  function clockAct(act, val) {
    if (act !== 'clock') return false;
    if (['on', 'off', 'auto'].includes(val)) updateSettings({ clock: val });
    return true;
  }

  // ---- Text style (easier-to-read fonts)
  // Settings → Appearance → Text style: the device's own font (as before), or one that comes with 21Board for easier
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
  // The whole board's, like the theme and accent color (settings.letters, a name from when it was called Letters):
  // exported, taken by Import › Replace this page, and with Board Sync on every device, the later choice winning
  // (lettersAt, see updateSettings and Merge.stamp). Going back in Board history never changes it.
  // (\u00a0, a no-break space, keeps “I, l and 1” and “a and g” on one line in the hints.)
  const LETTERS = {
    standard: { name: 'Standard', hint: 'This device’s own font.' },
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
  // widget lab it is sealed off (no site at all). There the text style stays Standard and nothing is fetched, so the
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
    if (!LETTERS_HERE) return `<div class="row"><div><div class="lbl">Text style</div><div class="hint">Easier-to-read fonts can’t load in this test board. Try them in 21Board itself.</div></div></div>`;
    const cur = letterKey();
    const opt = key => {
      const l = LETTERS[key], on = key === cur;
      return `<button class="letter-opt${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-act="letters" data-val="${key}" style="font-family:${esc(letterFont(key))}">` +
        `<span class="txt"><b>${esc(l.name)}</b><small>${esc(l.hint)}</small></span><span class="sample" aria-hidden="true">${LETTER_SAMPLE}</span>` +
        (on ? `<span class="tick" aria-hidden="true">${svg('check')}</span>` : '') + '</button>';
    };
    // (A group: one row showing the choice, and under its name where it applies, like Theme's; it opens to the three
    // cards. Its key and actions keep the setting's name, letters.)
    return settingsGroup('letters', 'Text style', esc(LETTERS[cur].name), `<div class="letter-opts" role="radiogroup" aria-label="Text style">${Object.keys(LETTERS).map(opt).join('')}</div>`, { sub: allDevices() });
  }

  function letterAct(act, val) {
    if (act !== 'letters') return false;
    if (Object.prototype.hasOwnProperty.call(LETTERS, val)) updateSettings({ letters: val });
    return true;
  }

  // ---- (end of section 12b)

  // Settings' controls: a segmented choice (radio buttons) and an on/off switch. (label: the setting's name, for a screen
  // reader, which otherwise hears only "Auto" or "Off".)
  const segHTML = (act, cur, opts, disabled, label) => `<div class="seg${disabled ? ' disabled' : ''}" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>${opts.map(([v, l]) =>
    `<button role="radio" aria-checked="${v === cur}" data-act="${act}" data-val="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  // (describedBy: the id of a line a screen reader reads with the switch, such as a warning that comes with it on.)
  const switchHTML = (act, on, label, disabled, describedBy) => `<button class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}"${describedBy ? ` aria-describedby="${describedBy}"` : ''} data-act="${act}"${disabled ? ' disabled' : ''}></button>`;

  // A group in Settings: one row (a button) with its name and what it's set to, that opens the group in place, below
  // it. Which groups are open is Settings.groups: it lasts while Settings stays open (Settings is drawn again on every
  // change), and every group starts closed each time Settings opens. A closed group is still in the page, hidden.
  // opts: sub (a grey line under the name), preview (HTML before the value), valueId, warn (an amber dot, shown while
  // true: something inside needs a look; warnLabel, what a screen reader says for it), inset (drawn indented, with a
  // line beside it).
  function settingsGroup(key, label, value, content, opts = {}) {
    const open = Settings.groups.has(key), id = 'grp-' + key;
    return `<button class="row disc" data-act="group" data-val="${key}" aria-expanded="${open}" aria-controls="${id}">` +
      `<span class="txt"><span class="lbl">${label}</span>${opts.sub ? `<span class="hint">${opts.sub}</span>` : ''}</span>` +
      `<span class="val">${'warn' in opts ? `<span class="status-dot warn" id="${id}-warn" role="img" aria-label="${opts.warnLabel || '(needs a look)'}"${opts.warn ? '' : ' hidden'}></span>` : ''}${opts.preview || ''}` +
      `${value ? `<span class="v"${opts.valueId ? ` id="${opts.valueId}"` : ''}>${value}</span>` : ''}<span class="chev" aria-hidden="true">${svg('chevRight')}</span></span></button>` +
      `<div class="drawer${opts.inset ? ' inset' : ''}" id="${id}" role="group" aria-label="${label}"${open ? '' : ' hidden'}>${content}</div>`;
  }

  // Settings → Appearance → Background: a group whose row shows a small preview shaped like the board and what the
  // background is. Open, it's one set of choices (one radio group): match the theme and the light colors; then the
  // dark colors, Custom… and the photo (Photo…, until there is one), all on one row. Picking a color hides the photo,
  // which is kept (BoardPhoto `on: false`); picking the photo shows it again, over the color picked last ("Whole
  // photo" shows that color around it). While the photo is picked, its controls follow (photoRow).
  // Custom… is a choice like the others (a radio, checked while the color is one of its own); a tap lands on the
  // color input laid over it, so the device's own picker opens as from any color input (an iPad's too).
  function backgroundSettings() {
    const bg = S.board.background || {}, color = bg.color || null;
    const isCustom = !!color && !BG_SWATCHES.some(([c]) => c === color);
    const m = BoardPhoto.media(), im = BoardPhoto.settings(), photoShown = !!(m && im && im.on);
    const tick = on => on ? `<span class="tick" aria-hidden="true">${svg('check')}</span>` : '';
    const radio = on => `role="radio" aria-checked="${on}"`;
    const swatch = ([c, n]) => { const on = !photoShown && color === c; return `<button class="swatch${on ? ' on' : ''}" style="background:${c}" ${radio(on)} data-act="bg" data-val="${c}" title="${n}" aria-label="${n}">${tick(on)}</button>`; };
    const auto = !photoShown && !color, custom = !photoShown && isCustom;
    const sunMoon = '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="#4b5563"><circle cx="7.6" cy="7.6" r="1.9"/><path d="M7.6 3.4v.7M7.6 11.1v.7M3.4 7.6h.7M11.1 7.6h.7M4.6 4.6l.5.5M10.1 10.1l.5.5M4.6 10.6l.5-.5M10.1 5.1l.5-.5"/></g>' +
      '<path stroke="#e5e7eb" transform="translate(11.2 11.2) scale(.36)" d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>';
    const ratio = freeShape() ? (Zoom.vw || 16) / (Zoom.vh || 9) : 16 / 9;
    const preview = `<span class="bg-mini" id="bg-preview" style="aspect-ratio:${ratio.toFixed(4)};background-color:${color || 'var(--board-bg)'}">${photoShown
      ? `<span class="ph" style="background-size:${im.fit === 'whole' ? 'contain' : 'cover'};background-position:${photoPosition(im)};--fade:${im.fade}"></span>` : ''}</span>`;
    const content = `<div class="bg-block" id="bg-block"><div class="hint bg-scope">${pageScope()}</div>
      <div class="swatches" role="radiogroup" aria-label="Background">
        <button class="swatch auto${auto ? ' on' : ''}" ${radio(auto)} data-act="bg" data-val="" title="Match the theme" aria-label="Match the theme (light or dark)">${sunMoon}${tick(auto)}</button>
        ${BG_LIGHT.map(swatch).join('')}<span class="break"></span>${BG_DARK.map(swatch).join('')}
        <span class="bg-more"><span class="bg-custom"><button class="swatch pill custom${custom ? ' on' : ''}" ${radio(custom)} data-act="bg-custom" title="Choose any color" aria-label="Custom color"><span class="dot"${isCustom ? ` style="background:${color}"` : ''}></span>Custom…${tick(custom)}</button><input type="color" id="set-bg-custom" value="${esc(isCustom ? color : '#88aacc')}" tabindex="-1" aria-hidden="true"></span>
        ${m ? `<button class="swatch pill photo${photoShown ? ' on' : ''}" ${radio(photoShown)} data-act="photo-show" aria-label="Photo"><span class="pic bg-pic"></span>Photo${tick(photoShown)}</button>`
          : `<button class="swatch pill photo" data-act="photo-add" title="Add a photo">${svg('image')}Photo…</button>`}</span>
      </div>
      ${photoShown ? photoRow() : ''}</div>`;
    return settingsGroup('bg', 'Background', esc(photoShown ? 'Photo' : bgColorName(color)), content, { preview, valueId: 'bg-color-name' });
  }
  /* Patterns (removed 2026-11-16; uncomment to bring them back): their tiles in the Background group, after the
     swatches, with a "pattern" case in Settings.act. (PATTERNS still names them; their CSS is in index.html.)
    const pattern = PATTERN_IDS.includes(bg.pattern) ? bg.pattern : 'none';
    const ink = bgInk(color), look = `background-color:${color || 'var(--board-bg)'};--pattern:${ink.pattern};--pattern-strong:${ink.strong}`;
    `<div class="pat-tiles${photoShown ? ' disabled' : ''}" role="radiogroup" aria-label="Pattern">${PATTERNS.map(([p, n]) => { const on = p === pattern;
      return `<button class="pat-tile${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-act="pattern" data-val="${p}"${photoShown ? ' disabled' : ''}><span class="pv${p === 'none' ? '' : ' pattern-' + p}" style="${look}"></span>${n}${tick(on)}</button>`; }).join('')}</div>`
  */
  // Settings → Appearance → Accent color: the six, then Custom…, one radio group drawn like Background's. Custom… is
  // checked while the accent is a '#rrggbb'. Every choice and Custom…'s dot show this theme's shade. A tap on Custom…
  // lands on the color input laid over it, and the device's picker opens at the custom color, or else at the accent's
  // light-theme shade.
  function accentSettings() {
    const cur = accentNow(), shade = a => a[resolvedTheme() === 'dark' ? 1 : 0], custom = cur[0] === '#';
    const tick = on => on ? `<span class="tick" aria-hidden="true">${svg('check')}</span>` : '';
    const colors = Object.entries(ACCENTS).map(([k, a]) => { const on = cur === k;
      return `<button class="swatch${on ? ' on' : ''}" style="background:${shade(a)}" role="radio" aria-checked="${on}" data-act="accent" data-val="${k}" title="${a[2]}" aria-label="${a[2]} accent">${tick(on)}</button>`; }).join('');
    return `<div class="row stack accent-row">${labelled('Accent color')}
          <div class="swatches" role="radiogroup" aria-label="Accent color">${colors}<span class="accent-custom"><button class="swatch pill custom${custom ? ' on' : ''}" role="radio" aria-checked="${custom}" data-act="accent-custom" data-val="custom" title="Choose any color" aria-label="Custom color"><span class="dot"${custom ? ` style="background:${shade(accentOf(cur))}"` : ''}></span>Custom…${tick(custom)}</button><input type="color" id="set-accent-custom" value="${custom ? cur : accentOf(cur)[0]}" tabindex="-1" aria-hidden="true"></span></div></div>`;
  }
  // Settings → Appearance → Background, with the photo picked: the picture (tap it to choose the part that stays in
  // view), Fit, Fade, and Change… / Remove.
  function photoRow() {
    const m = BoardPhoto.media(), im = BoardPhoto.settings();
    if (!m || !im) return '';
    const g = photoThumbGeometry(m, im), fill = im.fit === 'fill';
    // Shaped like the board, but never taller than about 200 px (a portrait window would make it huge).
    return `<div class="photo-edit">
        ${fill ? '<div class="hint">Tap the picture to pick the part that stays in view.</div>' : ''}
        <div class="photo-thumb${fill ? ' pick' : ''}" id="photo-thumb"${fill ? ' role="button" tabindex="0" aria-label="Choose the part of the photo that stays in view (tap, or use the arrow keys)"' : ' role="img" aria-label="Background photo"'}
          style="aspect-ratio:${g.ratio.toFixed(4)};width:min(100%, ${Math.round(200 * g.ratio)}px);background-size:${fill ? 'cover' : 'contain'};background-position:${photoPosition(im)};--fade:${im.fade}">
          ${fill ? `<span class="focus" style="left:${(g.mx * 100).toFixed(2)}%;top:${(g.my * 100).toFixed(2)}%"></span>` : ''}</div>
        <div class="photo-ctrls">
          <div class="line"><span>Fit</span>${segHTML('photo-fit', im.fit, [['fill', 'Fill the board'], ['whole', 'Whole photo']], false, 'Fit')}</div>
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

  // Settings → Board Sync (section 13b): the board on this device and the others, through a folder in Google Drive.
  // Not linked: one row, whose Set up… starts the setup (Link.setup, section 13b).
  // Linked: what is wrong, if anything (as the note on the board says), then three rows: the folder, with how
  // syncing is going (Link.status) and Change… and Unlink; this device's name; history copies in the folder.
  // "Syncing…" goes after the folder's name (Link.syncing), on a title line across the whole row (beside Change… and
  // Unlink it doesn't fit), its room kept while it's hidden: neither the title nor the line below it changes size as
  // changes go out, and nothing below Board Sync moves. The title is one line: a long folder name ends in "…" (the
  // whole name in its tooltip, and for a screen reader), so "Syncing…" never lands on a line of its own and leaves a
  // blank one when it hides. (Not a live region: it comes and goes every few seconds.)
  function linkSettings(sw) {
    const L = Link;
    if (!L.dir) {
      return `<h3>Board Sync</h3>
        <div class="row"><div class="lbl">Sync your board with your other devices</div>
          <button class="btn primary" data-act="link-setup">${svg('send')}Set up…</button></div>`;
    }
    const dev = L.device(), prob = L.problem(), info = FolderNote.info();
    // (Update only once the new version is here: before that, the button would do nothing, see FolderNote)
    const fix = { allow: ['link-reconnect', 'Allow…'], missing: ['link-check', 'Look again'], send: ['link-send', 'Try again'], newer: S.sw.updateReady ? ['update', 'Update'] : null }[prob];
    const warn = info && prob ? `<div class="row save-warn"><div><div class="lbl"><span class="status-dot warn"></span>${esc(info.title)}</div><div class="hint">${esc(info.text)}</div></div>${fix ? `<button class="btn small primary" data-act="${fix[0]}">${fix[1]}</button>` : ''}</div>` : '';
    const H = BoardHistory;
    return `<h3>Board Sync</h3>
      ${warn}
      <div class="row link-folder"><div class="lbl">Synced through <span class="link-name" title="${esc(L.dir.name)}">“${esc(L.dir.name)}”</span> <span class="link-syncing${L.syncing() ? ' on' : ''}" id="set-link-syncing">Syncing…</span></div><div class="hint" id="set-link-status">${esc(L.status())}</div>
        <div class="btns"><button class="btn small" data-act="link-choose">Change…</button><button class="btn small" data-act="link-unlink">Unlink</button></div></div>
      <div class="row stack"><label class="lbl" for="set-link-label">This device’s name <span class="hint">(shown on your other devices)</span></label>
        <input type="text" class="text-input" id="set-link-label" maxlength="40" value="${esc(dev.label)}" autocomplete="off"></div>
      ${H.enabled() ? `<div class="row"><div><div class="lbl">Keep history copies in the folder</div><div class="hint">About hourly, so you can go back even if this device is reset.${H.folderStatus ? ' ' + esc(H.folderStatus) : ''}</div></div>${sw('hist-folder', S.settings.historyFolder !== false, 'Keep history copies in the folder')}</div>` : ''}`;
  }

  // Settings' HTML without what is put in place: Board Sync's status line and "Syncing…" shown or not (putStatus), and
  // when the last backup was and the amber dot on Advanced (refreshStatus, after every drawing too: each write of this
  // device's file counts as a backup, see writeOwn).
  const noStatus = h => h.replace(/<div class="hint" id="set-link-status">[\s\S]*?<\/div>/, '').replace('<span class="link-syncing on"', '<span class="link-syncing"')
    .replace(/<div class="hint[^"]*" id="st-backup">(?:<span class="status-dot warn"><\/span>)?[^<]*<\/div>/, '').replace(/(id="grp-advanced-warn"[^>]*?) hidden>/, '$1>');
  // Advanced › Back up every page: when the last backup was, with the amber dot that is on Advanced when it is overdue
  // (Settings.needsLook), so that what the dot is about is plain once Advanced is open.
  const backupLine = late => `<div class="hint${late ? ' warn-line' : ''}" id="st-backup">${late ? '<span class="status-dot warn"></span>' : ''}${esc(backupAgo())}</div>`;
  // ... and without which theme, accent color and text style are chosen (the swatches' shades, which follow the theme,
  // and the check; Custom…'s dot and its input's color; the text style's card ticked, and the name on its row): put in
  // place when only they changed, chosen on another device or in another tab (putLook).
  const noLook = h => h.replace(/<button role="radio" aria-checked="\w+" data-act="theme"([^>]*) class="\w*">/g, '<button data-act="theme"$1>')
    .replace(/<button class="swatch[^"]*" style="[^"]*" role="radio" aria-checked="\w+" data-act="accent"/g, '<button data-act="accent"')
    .replace(/(data-act="accent"[^>]*>)<span class="tick" aria-hidden="true"><svg[^>]*>[\s\S]*?<\/svg><\/span>/g, '$1')
    .replace(/<button class="swatch pill custom[^"]*" role="radio" aria-checked="\w+" data-act="accent-custom"([^>]*><span class="dot")[^>]*>/, '<button data-act="accent-custom"$1>')
    .replace(/(data-act="accent-custom"[^>]*><span class="dot"><\/span>Custom…)<span class="tick" aria-hidden="true"><svg[^>]*>[\s\S]*?<\/svg><\/span>/, '$1')
    .replace(/(id="set-accent-custom" value=")[^"]*/, '$1')
    .replace(/<button class="letter-opt[^"]*" role="radio" aria-checked="\w+" data-act="letters"/g, '<button data-act="letters"')
    .replace(/(<span class="sample" aria-hidden="true">[^<]*<\/span>)<span class="tick" aria-hidden="true"><svg[^>]*>[\s\S]*?<\/svg><\/span>/g, '$1')
    .replace(/(data-val="letters"[^>]*>[\s\S]*?<span class="v">)[^<]*/, '$1');

  const Settings = {
    el: null,
    body: null,
    side: 'left',
    isOpen: false,
    groups: new Set(),   // the groups open now (settingsGroup): none each time Settings opens
    linkShown: '',       // the Board Sync section as last drawn
    drawn: '',           // all of Settings as last drawn (see refresh)
    syncingOff: 0,       // "Syncing…" goes in a moment (see putStatus)

    // What Settings shows of Board Sync is no longer what it shows now (after a look at the folder: Link.redraw).
    linkChanged() { return Link.supported && linkSettings(switchHTML, segHTML) !== this.linkShown; },
    // Board Sync changed while Settings is open: only the status line and "Syncing…" (the usual case) are put in
    // place, so a screen reader, a tap and a name being typed aren't disturbed; anything else draws Settings again.
    linkRefresh() {
      if (!this.linkChanged()) return;
      const html = linkSettings(switchHTML), el = $('#set-link-status', this.body);
      if (el && noStatus(html) === noStatus(this.linkShown)) { this.putStatus(el); this.linkShown = html; return; }
      this.render();
    },
    // Something Settings shows may have changed (a merge, another tab, a version saved): drawn again only if it did,
    // the status line put in place otherwise. (Each merge drew it two or three times: a screen reader read the control
    // it was on again, and a tap whose press and release straddled a drawing was lost.)
    refresh() { this.render(false, true); },
    // The theme's, accent color's and text style's choices as html has them, put in place: Settings isn't drawn again
    // for a choice made elsewhere (the keyboard, a tap and a screen reader stay where they were, and nothing moves, but
    // for the text in another font).
    putLook(html) {
      const t = document.createElement('template');
      t.innerHTML = html;
      for (const b of t.content.querySelectorAll('[data-act="theme"], [data-act="accent"], [data-act="accent-custom"], [data-act="letters"], [data-act="accent-custom"] > .dot')) {
        const el = b.matches('.dot') ? $('[data-act="accent-custom"] > .dot', this.body) : $(`[data-act="${b.dataset.act}"][data-val="${CSS.escape(b.dataset.val)}"]`, this.body);
        if (!el) continue;
        for (const a of ['class', 'style', 'aria-checked']) if (el.getAttribute(a) !== b.getAttribute(a)) { if (b.hasAttribute(a)) el.setAttribute(a, b.getAttribute(a)); else el.removeAttribute(a); }
        const tick = $(':scope > .tick', b), had = $(':scope > .tick', el);   // (the color or text style that is ticked)
        if (tick && !had) el.appendChild(tick.cloneNode(true)); else if (!tick && had) had.remove();
      }
      const ci = $('#set-accent-custom', t.content), ci0 = $('#set-accent-custom', this.body);   // (where the picker opens next)
      if (ci && ci0 && ci0.value !== ci.getAttribute('value')) ci0.value = ci.getAttribute('value');
      const v = $('[data-act="group"][data-val="letters"] .v', t.content), el = $('[data-act="group"][data-val="letters"] .v', this.body);
      if (v && el && el.textContent !== v.textContent) el.textContent = v.textContent;
    },
    // Accent color › Custom…: a color picked. The board, its widgets and Custom…'s dot follow at once. Settings isn't
    // drawn again while the picker is open: that would close it.
    customAccent(input) {
      const v = String(input.value || '').toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(v) || v === accentNow()) return;
      updateSettings(accentSet(v));
      const dot = input.parentNode.querySelector('.dot'); if (dot) dot.style.background = accentOf(v)[resolvedTheme() === 'dark' ? 1 : 0];
    },
    // Custom… (Background, Accent color) from the keyboard or a screen reader: the picker a tap opens, the keyboard
    // staying on Custom…, also if nothing is picked. Settings isn't drawn again under it (render) until a color is
    // picked, or the next tap or key.
    picker(input) {
      if (!input) return;
      this.picking = true;
      const done = () => { this.picking = false; document.removeEventListener('keydown', done, true); document.removeEventListener('pointerdown', done, true); };
      document.addEventListener('keydown', done, true); document.addEventListener('pointerdown', done, true);
      try { input.showPicker(); } catch (e) { input.click(); }
    },
    putStatus(el) {
      const t = Link.status();
      if (el.textContent !== t) el.textContent = t;   // (only a change: nothing for a screen reader to notice otherwise)
      const s = $('#set-link-syncing', this.body);
      if (!s) return;
      // "Syncing…" shows at once, and goes only once nothing has been on its way for a moment: a write is followed at
      // once by a change of its own (when the last backup was), which would make it blink.
      clearTimeout(this.syncingOff);
      if (Link.syncing()) s.classList.add('on');
      else if (s.classList.contains('on')) this.syncingOff = setTimeout(() => { if (!Link.syncing()) s.classList.remove('on'); }, 600);
    },

    init() {
      this.el = $('#settings');
      this.body = $('.sheet-body', this.el);
      const closeBtn = $('[data-close]', this.el);
      closeBtn.innerHTML = svg('close');
      closeBtn.addEventListener('click', () => this.close(true));
      this.body.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (b && !b.disabled) this.act(b.dataset.act, b.dataset.val, b);
      });
      this.body.addEventListener('change', e => {
        if (e.target.id === 'set-link-label') {
          // (Saved once the keyboard has gone on: Tab moves it as the field is left, and Settings, drawn again, puts
          // it back on the control it went to.)
          const label = e.target.value.trim().slice(0, 40);
          if (label && label !== Link.device().label) setTimeout(() => Link.rename(label));
        }
        if (e.target.id === 'set-bg-custom' || e.target.id === 'set-accent-custom') {   // (the picker has closed: mark the choice, the keyboard back on it)
          if (e.target.id === 'set-accent-custom') this.customAccent(e.target);   // (some browsers send only this)
          this.picking = false;
          this.render(true);
          const b = $(`[data-act="${e.target.id === 'set-bg-custom' ? 'bg-custom' : 'accent-custom'}"]`, this.body);
          if (b && (!document.activeElement || document.activeElement === document.body)) b.focus({ preventScroll: true });
        }
      });
      this.body.addEventListener('input', e => {
        if (e.target.id === 'set-bg-custom') {
          // While the color picker is open: the board, the preview and the name follow (rebuilding Settings would
          // close it). A color picked hides the photo, as the other colors do (it's kept: see backgroundSettings).
          const color = e.target.value;
          updateBoard({ background: Object.assign({}, S.board.background, { color }) });
          if ((BoardPhoto.settings() || {}).on) BoardPhoto.update({ on: false });
          const pv = $('#bg-preview', this.body);
          if (pv) { pv.style.backgroundColor = color; const ph = $('.ph', pv); if (ph) ph.remove(); }
          const nm = $('#bg-color-name', this.body); if (nm) nm.textContent = bgColorName(color);
          const dot = e.target.parentNode.querySelector('.dot'); if (dot) dot.style.background = color;
        }
        if (e.target.id === 'set-accent-custom') this.customAccent(e.target);
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
    },

    // opts.again: moved to the other side (Widget Picker: Left or Right), with the same groups open, where it was, and
    // Board history's columns beside it (moved too, as they are). The keyboard goes into it, as into those columns.
    open(side, opts = {}) {
      const groups = new Set(this.groups), top = this.body.scrollTop, keep = !!opts.again && HistorySheet.beside;
      closePopups({ keepSettings: keep, keepHistory: keep });
      this.side = side === 'right' ? 'right' : 'left';
      this.el.classList.remove('left', 'right');
      this.el.classList.add(this.side, 'open');
      this.groups = opts.again ? groups : new Set();   // (every group starts closed)
      this.isOpen = true;
      this.render();
      if (opts.again) this.body.scrollTop = top;
      if (keep) HistorySheet.move(this.side);
      if (!this.el.contains(document.activeElement)) this.el.focus({ preventScroll: true });
      this.refreshStatus();
    },

    // back: ✕ or Escape, so the keyboard goes back to ▦ on that side (otherwise something else takes it, or a tap).
    close(back) {
      if (!this.isOpen) return;
      const a = document.activeElement, mine = !a || a === document.body || this.el.contains(a) || (HistorySheet.beside && (HistorySheet.el.contains(a) || HistorySheet.det.contains(a)));
      this.isOpen = false;
      this.el.classList.remove('open');
      if (HistorySheet.beside) HistorySheet.close(true);   // (Board history's columns beside it go with it)
      const btn = back && mine && $(`.picker-btn.${this.side}`);
      if (btn && btn.getClientRects().length) btn.focus({ preventScroll: true });
    },

    // force: drawn even while a field has the keyboard (the color picker has just closed). ifChanged: only if what it
    // shows changed (see refresh).
    render(force, ifChanged) {
      if (!this.isOpen) return;
      // Don't yank a text field out from under someone who is typing in it, nor the color picker (it would close; see
      // picker for the keyboard's) or a slider being moved. (Drawn again at the next change; Board Sync's part at the
      // next look at the folder.)
      if (!force && (this.picking || (this.body.contains(document.activeElement) && document.activeElement.matches('input[type="text"], input[type="color"], input[type="range"]')))) return;
      const st = S.settings, seg = segHTML, sw = switchHTML;
      const note = SaveNote.state() ? SaveNote.info() : null;

      // This page → Saved widgets: every widget window of this page, open or closed, to open or delete.
      const insts = Array.from(S.insts.entries()).sort((a, b) => {
        const an = (getWidget(a[1].widgetId) || { name: a[1].widgetId }).name, bn = (getWidget(b[1].widgetId) || { name: b[1].widgetId }).name;
        return an.localeCompare(bn) || a[1].n - b[1].n;
      });
      const instHTML = insts.length ? insts.map(([ikey, i]) => {
        const widget = getWidget(i.widgetId);
        const name = `${widget ? widget.name : i.widgetId}${i.n > 1 || !widget ? ' ' + i.n : ''}`;
        const status = !widget ? 'Widget not installed' : i.open ? 'Open' : 'Closed';
        const unsaved = Store.failed || (Writer.failing && ['inst', 'data', 'conf'].some(k => Writer.pending.has(Keys[k](S.boardId, ikey))));
        const app = widget && widget.external;   // a district app: its work isn't the board's (README, "District apps")
        return `<div class="inst"><span class="widget-icon" style="--c:${esc(widget ? widget.color : '#9ca3af')}">${widget ? widget.icon : svg('widget')}</span>` +
          `<div class="meta"><b>${esc(name)}</b><span>${status}${app ? ` · ${esc(widget.name)} keeps its own work on this device${unsaved ? ' · window not saved' : ''}` : unsaved ? ' · not saved' : ''}</span></div>` +
          (widget && !i.open ? `<button class="icon" data-act="inst-open" data-val="${esc(ikey)}" title="Open" aria-label="Open ${esc(name)}">${svg('open')}</button>` : '') +
          `<button class="icon" data-act="inst-delete" data-val="${esc(ikey)}" title="Delete" aria-label="${app ? `Delete the ${esc(name)} window` : `Delete ${esc(name)} and its content`}">${svg('trash')}</button></div>`;
      }).join('') : '<div class="empty-note">No widgets yet. Open one from the Widget Picker.</div>';
      const saved = settingsGroup('saved', note ? 'Widget windows' : 'Saved widgets', insts.length ? `${insts.length} widget${insts.length === 1 ? '' : 's'}` : 'None',
        `<div class="hint">${note ? 'Closed widgets keep their content while 21Board stays open.' : 'Closed widgets keep their content until you delete them here.'}</div><div class="inst-list">${instHTML}</div>`);

      // Advanced: rare and IT-level things, in one group. Its grey line says what's in it.
      const snap = !st.snapping ? 'off' : { gentle: 'light', strong: 'firm' }[st.resistance] || 'medium';
      const devList = Array.from(S.devFiles.values(), d =>   // test widgets uploaded as a file (Developer mode)
        `<div class="inst"><span class="widget-icon" style="--c:#64748b">${svg('widget')}</span><div class="meta"><b>${esc(d.name)}</b><span>${esc(`Uploaded file: ${d.file}`)}</span></div>` +
        `<button class="icon" data-act="dev-remove" data-val="${esc(d.id)}" title="Remove" aria-label="Remove ${esc(d.name)}">${svg('trash')}</button></div>`).join('');
      const dev = !LAB && !KIOSK;
      const advanced = `
        <div class="row"><div class="lbl">Widget Picker</div>${seg('corners', st.pickerCorners, [['both', 'Both corners'], ['left', 'Left'], ['right', 'Right']], false, 'Widget Picker')}</div>
        ${clockSettings(sw, seg)}
        ${scaleSettingsRow()}
        <h4>Moving windows</h4>
        <div class="row stack"><div class="lbl">Windows stop at each other’s edges</div>${seg('snap', snap, [['off', 'Off'], ['light', 'Light'], ['medium', 'Medium'], ['firm', 'Firm']], false, 'Windows stop at each other’s edges')}</div>
        <div class="row"><div><div class="lbl">Drag windows from inside</div><div class="hint">Off: only by the title bar.</div></div>${sw('dragcontent', st.dragFromContent !== false, 'Drag windows from inside')}</div>
        ${historySettings(sw, seg)}
        <h4>${LAB ? 'Storage' : 'Backups and storage'}</h4>
        ${LAB ? '' : `<div class="row"><div><div class="lbl">Back up every page</div>${backupLine(this.needsLook())}</div><button class="btn small" data-act="backup">${svg('export')}Back up now</button></div>
        <div class="row status-block">
          <div class="st"><span class="k">Offline</span><span class="hint" id="st-offline">Checking…</span></div>
          <div class="st"><span class="k">Protected storage</span><span id="st-persist"></span></div>
          <div class="hint" id="st-persist-hint"></div>
          <div class="st"><span class="k">Storage used</span><span class="hint" id="st-storage">Checking…</span></div></div>
        ${KIOSK ? `<div class="row"><div><div class="lbl">Kiosk mode</div><div class="hint">No one is signed in, so there’s no Board Sync. Import and Export use this device or a USB drive.${note ? '' : ' Boards stay on this device.'}</div></div></div>` : ''}`}
        ${Store.failed ? `<div class="row"><div><div class="lbl">Empty this board</div><div class="hint">Clears the windows, content and settings you see now.${Store.failed === 'unopened' ? ' Your saved board isn’t touched.' : ''}</div></div><button class="btn danger" data-act="erase">${svg('trash')}Empty…</button></div>`
          : `<div class="row"><div><div class="lbl">Erase everything</div><div class="hint">Every page, window and setting on this device.</div></div><button class="btn danger" data-act="erase">${svg('trash')}Erase…</button></div>`}
        ${dev ? `<h4>Developer</h4>
        <div class="row"><div><div class="lbl">Developer mode</div><div class="hint">For people who build widgets.</div></div>${sw('devmode', st.devMode, 'Developer mode')}</div>
        ${st.devMode ? `<div class="row stack"><div><div class="lbl">Test a widget</div><div class="hint">An uploaded file runs sealed off from your boards. It is kept on this device only, never in exports.</div></div>
          <button class="btn primary" data-act="dev-upload">${svg('import')}Upload file…</button>
          ${devList ? `<div class="inst-list">${devList}</div>` : ''}</div>` : ''}` : ''}
        <div class="about">21Board <span id="st-version">${esc(RELEASE)}</span> · Widget SDK protocol ${SDK_PROTOCOL}<span id="st-cache"></span>${note ? '' : `<br>
        ${Link.dir ? 'Your work is stored only on this device and in your Drive folder.' : 'Your work is stored only on this device.'}`}</div>`;
      // The keyboard stays on the control it was on (a group's row, a choice): Settings is drawn afresh below.
      const was = this.body.contains(document.activeElement) && document.activeElement.dataset.act ? document.activeElement : null;
      const link = this.linkShown = Link.supported ? linkSettings(sw, seg) : '';   // (see linkChanged)
      const inside = ['Widget Picker'].concat(LAB ? [] : ['clock'], ['size', 'moving windows'], !LAB && BoardHistory.enabled() ? ['history'] : [], LAB ? [] : ['backups'], dev ? ['developer'] : [], ['erase']);

      const html = `
        ${note ? `<div class="row save-warn"><div><div class="lbl"><span class="status-dot warn"></span>${esc(note.title)}</div><div class="hint">${esc(note.text)}</div></div><button class="btn small" data-act="backup">${svg('export')}Back up now</button></div>` : ''}
        <div class="row update-note" id="st-update" hidden><div><div class="lbl">A new version is ready</div><div class="hint">Takes a second. Your board stays as it is.</div></div><button class="btn small primary" data-act="update">Update now</button></div>

        ${link}
        ${classroomSettings(sw, seg)}

        ${LAB ? `<h3>Widget test mode</h3>
        <div class="row"><div class="hint">A test board for one widget, made by the widget dev window. Its data is kept apart from real boards${Store.mem ? ' (in memory, until this preview reloads)' : ''}.</div></div>` : '<h3>This page</h3>'}
        ${saved}

        <h3>Appearance</h3>
        <div class="row">${labelled('Theme')}${seg('theme', st.theme, [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']], false, 'Theme')}</div>
        ${backgroundSettings()}
        ${accentSettings()}
        ${letterSettings()}
        ${shapeSettingsRow(seg)}

        <div class="gap"></div>
        ${settingsGroup('advanced', 'Advanced', '', advanced, { sub: inside.join(', ').replace(/^./, c => c.toUpperCase()), warn: this.needsLook(), warnLabel: '(backup overdue)', inset: true })}`;
      if (ifChanged && noLook(noStatus(html)) === noLook(noStatus(this.drawn))) {
        if (noStatus(html) !== noStatus(this.drawn)) this.putLook(html);
        const line = $('#set-link-status', this.body);
        if (line) this.putStatus(line);
        this.drawn = html; this.refreshStatus(true); return;
      }
      this.body.innerHTML = this.drawn = html;
      if (was) {
        const again = $$(`[data-act="${CSS.escape(was.dataset.act)}"]`, this.body).find(b => b.dataset.val === was.dataset.val);
        if (again) again.focus({ preventScroll: true });
      }
      // The photo's pictures get it here (never as text inside the HTML above).
      const pm = BoardPhoto.media(), fadeTo = (S.board.background && S.board.background.color) || 'var(--board-bg)';   // as on the board
      const shows = [$('#photo-thumb', this.body), $('#bg-preview .ph', this.body)].filter(Boolean), pics = $$('.bg-pic', this.body);
      shows.forEach(el => el.style.setProperty('--fade-color', fadeTo));
      // (One call for all of them: the board's own call at the same moment gets the same URL, see BoardPhoto.objectUrl.)
      if (pm && (shows.length || pics.length)) BoardPhoto.objectUrl(pm).then(u => shows.concat(pics).forEach(el => { el.style.backgroundImage = `url("${u}")`; }), () => {});
      this.refreshStatus(true);
    },

    // The amber dot on Advanced: only a backup overdue, so making one clears it: none in the last week, or never one
    // and the board has had windows for a week, on any page (an empty or brand-new board has nothing to lose yet, as
    // maybeRemindBackup judges, see oldestWindow). Whether the browser has promised to keep 21Board's data
    // is said inside Advanced (Protected storage), not with the dot: in an ordinary Chrome tab it can't be cleared, and
    // a dot that can't be cleared is soon ignored.
    needsLook() {
      if (LAB) return false;
      const t = S.settings.lastBackupAt, now = Date.now();
      if (t) return now - t > 7 * DAY;
      return now - oldestWindow() > 7 * DAY;
    },

    // A group opened: as much of it in view as fits, with its own row still showing.
    reveal(key) {
      const row = $(`[data-act="group"][data-val="${key}"]`, this.body), box = $('#grp-' + key, this.body);
      if (!row || !box || box.hidden) return;
      const b = this.body.getBoundingClientRect(), r = row.getBoundingClientRect(), d = box.getBoundingClientRect();
      const by = Math.min(d.bottom - b.bottom, r.top - b.top);
      if (by > 0) this.body.scrollTop += by / (Zoom.ui || 1);   // (the sheet is drawn zoomed: see --ui)
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
        if (bk) { const line = backupLine(this.needsLook()); if (bk.outerHTML !== line) bk.outerHTML = line; }
        if (!per2 || !hint) return;
        const st = Persist.state;
        if (st === 'granted') {
          per2.innerHTML = '<span class="hint"><span class="status-dot ok"></span>Protected</span>';
          hint.textContent = 'The browser won’t clear your boards to free up space.';
        } else if (st === 'unsupported') {
          per2.innerHTML = '<span class="hint"><span class="status-dot warn"></span>Unavailable</span>';
          hint.textContent = 'This browser might clear your boards to free up space. Back up regularly.';
        } else if (st === 'insecure') {
          per2.innerHTML = '<span class="hint"><span class="status-dot warn"></span>Needs https</span>';
          hint.textContent = 'Browsers protect data only on https sites. Ask whoever hosts 21Board to turn on https; until then, back up regularly.';
        } else if (st === 'file') {
          per2.innerHTML = '<span class="hint"><span class="status-dot warn"></span>Not available</span>';
          hint.textContent = 'A copy opened from a file can’t be protected. Use 21Board’s web address, or back up regularly.';
        } else {
          per2.innerHTML = Install.prompt ? `<button class="btn small primary" data-act="install">${svg('plus')}Install app</button>`
            : '<span class="hint"><span class="status-dot warn"></span>Not yet</span>';
          hint.textContent = 'The browser could clear your boards to free up space. ' +
            (Install.prompt ? 'Installing 21Board as an app usually prevents that. ' : 'Installing 21Board as an app usually prevents that (Chrome: Install in the address bar; iPad: Share › Add to Home Screen). ') +
            'Until then, keep backups.';
        }
        // A kiosk can't be installed, and whether its data is kept is set up by IT: say only what applies.
        if (KIOSK && st !== 'granted') {
          if (per2.querySelector('[data-act="install"]')) per2.innerHTML = '<span class="hint"><span class="status-dot warn"></span>Not yet</span>';
          hint.textContent = 'On a kiosk device, your school’s IT manages this. To be safe, back up to a USB drive now and then.';
        }
        const dot = $('#grp-advanced-warn', this.body);   // (the amber dot on Advanced)
        if (dot) dot.hidden = !this.needsLook();
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
        case 'group':   // a group opens or closes (settingsGroup)
          if (this.groups.has(val)) this.groups.delete(val); else this.groups.add(val);
          this.render();
          this.reveal(val);
          break;
        case 'theme': updateSettings({ theme: val }); break;
        case 'accent': if (accentKey(val)) updateSettings(accentSet(val)); break;
        case 'accent-custom': this.picker($('#set-accent-custom', this.body)); break;   // (from the keyboard, as Background's, below)
        // Windows stop at each other's edges: Off (no snapping), or how hard a push overlaps them anyway.
        case 'snap': {
          const r = { light: 'gentle', medium: 'normal', firm: 'strong' }[val];
          if (val === 'off') updateSettings({ snapping: false }); else if (r) updateSettings({ snapping: true, resistance: r });
          break;
        }
        case 'dragcontent': updateSettings({ dragFromContent: S.settings.dragFromContent === false }); break;
        case 'scale-down': case 'scale-up': scaleStep(act === 'scale-up' ? 1 : -1); this.render(); break;
        case 'shape': setBoardShape(val); this.render(); break;
        case 'corners': updateSettings({ pickerCorners: val }); if (val !== 'both' && val !== this.side) this.open(val, { again: true }); break;
        case 'devmode': updateSettings({ devMode: !S.settings.devMode }); break;
        // Background: a color hides the photo (kept, to show again); the photo shows it again.
        case 'bg':
          updateBoard({ background: Object.assign({}, S.board.background, { color: val || null }) });
          if ((BoardPhoto.settings() || {}).on) BoardPhoto.update({ on: false });
          this.render();
          break;
        // Patterns (removed 2026-11-16; uncomment to bring them back):
        // case 'pattern': updateBoard({ background: Object.assign({}, S.board.background, { pattern: val }) }); this.render(); break;
        case 'bg-custom': this.picker($('#set-bg-custom', this.body)); break;
        case 'photo-add': $('#photo-input').click(); break;
        case 'photo-show': BoardPhoto.update({ on: true }); this.render(); break;
        case 'photo-fit': BoardPhoto.update({ fit: val }); this.render(); break;
        case 'photo-remove': {
          const yes = await dialog({ title: 'Remove the background photo?', message: (Link.dir ? 'It is removed from this page here and on your other devices' : 'It is removed from this board on this device') + '. Your full backups' + (BoardHistory.enabled() ? ' and board history' : '') + ' still have it.', actions: [{ label: 'Remove photo', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
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
        case 'hist-open': if (HistorySheet.beside) HistorySheet.close(); else HistorySheet.open(this.side, { beside: true }); break;
        case 'hist-every': {
          if (val === '0') {
            const ok = await dialog({ title: 'Turn off automatic versions?', message: '21Board stops saving versions while you work, when it opens and when a note is suddenly cleared. It still saves one before Reset, Delete, Close all, a photo change, Import, Erase and going back, so those can be undone, and when you tap “Save this version now”. Versions already saved stay until you delete them.', actions: [{ label: 'Turn off', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
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
        case 'link-setup': await Link.setup(); this.render(); break;   // (Board Sync's setup, section 13b)
        case 'link-choose': { const got = await Link.choose(); if (got) await Link.welcome(got); this.render(); break; }
        case 'link-unlink': {
          const ok = await dialog({ title: `Unlink the “${Link.dir ? Link.dir.name : ''}” folder?`, message: 'This device keeps its board as it is but stops syncing it. Your other devices and the folder keep theirs.', actions: [{ label: 'Unlink', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] });
          if (ok) await Link.unlink();
          break;
        }
        case 'link-reconnect': await Link.reconnect(); this.render(); break;
        case 'link-send': await Link.retryNow(); this.render(); break;   // (Try again: a round at once)
        case 'link-check': if (await Link.ensurePerm()) await Link.check(true); this.render(); break;
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
                : 'All windows, their content and your settings are deleted from this device.' + (hist ? ' Board history is kept, so you can still go back.' : '')) + (Link.dir ? ' This device also stops syncing: the board stays in your folder and on your other devices.' : '') + ' Export a backup first if you might want them later.' + apps,
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
          // (Board Sync: this device's file says it was erased, and no round in another tab writes between that and the clear.)
          const clear = () => Store.tx('readwrite', s => { s.clear(); });
          if (!temp && Link.dir) await Link.locked(async () => { await Link.farewell(true); await clear(); }); else await clear();
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
      instances.push(Object.assign({
        widgetId, instance: +nStr, open: inst.open, maximized: inst.maximized, z: inst.z,
        rect: inst.rect, createdAt: kind === 'full' && inst.createdAt ? inst.createdAt : undefined,   // which window is which (Board history)
        wid: kind === 'full' && inst.wid ? inst.wid : undefined   // (and on every device: Board Sync)
      }, kind === 'full' && inst.copyOf ? { copyOf: inst.copyOf } : {}, {
        config: parts.conf === undefined ? null : parts.conf,
        data: kind === 'full' && parts.data !== undefined ? parts.data : null
      }));
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
      accent: accentNow(),   // what the board shows: a key of ACCENTS or a custom '#rrggbb'
      letters: S.settings.letters,   // the text style
      board: Object.assign({ name: board.name, background: board.background || { color: null, pattern: 'none' }, scale: sc, shape: free ? 'free' : '16:9' },
        kind === 'full' && board.uid ? { uid: board.uid } : {},   // which board this is (see section 13b)
        kind === 'full' && typeof board.pos === 'number' && isFinite(board.pos) ? { pos: board.pos } : {}),   // its place among the pages
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
      createdAt: num(i.createdAt, null),   // board history versions keep it (which window is which)
      wid: typeof i.wid === 'string' && Merge.WID_RE.test(i.wid) ? i.wid : null,   // which window this is on every device (Board Sync)
      copyOf: copyLabel(i.copyOf)
    }));
    const bg = j.board && j.board.background || {};
    const out = {
      kind: j.kind === 'template' ? 'template' : 'full',
      theme: ['light', 'dark', 'system'].includes(j.theme) ? j.theme : null,
      accent: accentShown(j.accent, j.accentColor, null),   // (an export's accent, or a device file's two parts)
      letters: Object.prototype.hasOwnProperty.call(LETTERS, j.letters) ? j.letters : null,   // (a file from before 2026.11.17-2 has none)
      board: {
        name: j.board && typeof j.board.name === 'string' ? j.board.name.slice(0, 60) : null,
        background: { color: bgColor(bg.color), pattern: PATTERN_IDS.includes(bg.pattern) ? bg.pattern : 'none' },
        scale: j.board && j.board.scale !== undefined ? (validScale(j.board.scale) || null) : undefined,   // undefined: file from before board scale
        shape: j.board && j.board.shape === 'free' ? 'free' : '16:9',
        uid: j.board && UID_RE.test(j.board.uid || '') ? j.board.uid : null,
        pos: j.board ? num(j.board.pos, null) : null
      },
      viewport: j.viewport && j.viewport.width > 0 && j.viewport.height > 0 ? { w: j.viewport.width, h: j.viewport.height } : null,
      photo: (() => {
        const m = j.kind !== 'template' && j.media && j.media.background;   // templates never carry a photo (it may show the class)
        return validPhoto(m) ? { data: m.data, w: +m.w, h: +m.h, bytes: +m.bytes || 0, name: String(m.name || 'Photo').slice(0, 80), addedAt: +m.addedAt || Date.now() } : null;
      })(),
      // A Board Sync device file names its photo instead: a file in the folder's Photos folder (Link.photoIn
      // reads it). Only a plain fingerprint name (PHOTO_FILE_RE) counts; any other says nothing about a photo.
      photoRef: (() => {
        const m = j.kind !== 'template' && j.media && j.media.background;
        return m && typeof m === 'object' && !m.data && PHOTO_FILE_RE.test(m.file || '') ? { file: m.file, w: +m.w || 0, h: +m.h || 0, bytes: +m.bytes || 0, name: String(m.name || 'Photo').slice(0, 80), addedAt: +m.addedAt || 0 } : null;
      })(),
      photoLook: j.media && j.media.background ? normalizePhotoSettings(j.media.look || {}) : null,
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

  async function importFile(file) {
    if (!await Lock.letIn(file)) return;   // windows locked: unlock first (section 12b)
    let parsed;
    try { parsed = parseBoardFile(await file.text()); } catch (err) {
      await dialog({ title: 'Can’t import this file', message: err.message, actions: [{ label: 'OK', value: true, kind: 'primary' }] });
      return;
    }
    if (parsed.pages && Pages.enabled()) return importPages(file, parsed);
    if (Link.supported) await Link.photoIn(parsed);   // (a device file names its photo: this device's own, or the one in Photos)
    const openCount = parsed.instances.filter(i => i.open).length;
    const missing = new Set(parsed.instances.filter(i => !getWidget(i.widgetId)).map(i => i.widgetId));
    const what = parsed.kind === 'template' ? 'a blank template' : 'a full backup';
    // Replace keeps this page (its uid): with Board Sync, its windows and content change on the other devices too, and
    // so do the file's theme, accent color and text style, which are the whole board's (said, when they differ from
    // this board's).
    const uid = S.board.uid, look0 = { theme: S.settings.theme, accent: S.settings.accent, accentColor: S.settings.accentColor, letters: S.settings.letters };
    const looks = andList([parsed.theme && parsed.theme !== look0.theme && 'theme', parsed.accent && parsed.accent !== accentNow() && 'accent color',
      parsed.letters && parsed.letters !== look0.letters && 'text style'].filter(Boolean));
    const mode = await dialog({
      title: `Import “${file.name.replace(/\.21board$/i, '')}”?`,
      message: `This is ${what} with ${openCount} window${openCount === 1 ? '' : 's'}.` + (missing.size ? ` ${missing.size} widget${missing.size === 1 ? ' is' : 's are'} not installed here; ${missing.size === 1 ? 'its' : 'their'} content will be kept but not shown.` : ''),
      actions: (Pages.enabled() ? [{ label: 'Open as a new page', sub: 'Your pages stay as they are. This one is added after the page you’re on.', value: 'page', kind: 'primary', choice: true }] : []).concat([
        { label: Pages.enabled() ? 'Replace this page' : 'Replace my board', sub: `${Pages.enabled() ? 'This page’s' : 'Your current'} windows and content${looks ? `, and the ${looks},` : ''} are replaced${Link.dir ? ', here and on your other devices' : ''}.` + (BoardHistory.enabled() ? ' You can undo this.' : ''), value: 'replace', kind: 'danger', choice: true },
        { label: Pages.enabled() ? 'Add to this page' : 'Add to my board', sub: 'Keep what’s here and add these windows', value: 'add', kind: Pages.enabled() ? '' : 'primary', choice: true },
        { label: 'Cancel', value: null }
      ])
    });
    if (!mode) return;
    Lock.letGo();   // ("Unlock and open": now, section 12b)
    if (mode === 'page') return openAsPages(parsed.pages || [parsed], file, false);
    try {
      const label = `${mode === 'replace' ? 'Before importing' : 'Before adding windows from'} “${file.name.replace(/\.21board$/i, '')}”`;
      const replace = mode === 'replace';
      const opened = () => Array.from(S.insts.values()).filter(i => i.open).length, before = opened();   // (Add: a district app's window isn't added twice)
      // (Board Sync: no round runs while it is put on the board, see Link.swap; then one syncs it.)
      const undoId = await Link.swap(() => applyImport(parsed, mode, { uid: replace ? uid : null, keepCreated: replace, photo: 'file', history: { reason: replace ? 'import' : 'add', label } }));
      if (Link.supported) Link.changed([Keys.board(S.boardId)]);
      const added = opened() - before, undo = undoAction(undoId, replace ? 'the import' : 'adding windows');
      // (its Undo puts back the theme, accent and text style the file replaced too, chosen again here, so that with Board
      // Sync it reaches the other devices: going back in Board history never changes them)
      const back = {};
      for (const k of Merge.STYLE_PARTS) if (replace && S.settings[k] !== look0[k]) back[k] = look0[k];
      if (undo.onAction && Object.keys(back).length) { const go = undo.onAction; undo.onAction = async () => { if (await go() !== false) updateSettings(back); }; }
      toast(replace ? 'Board imported.' : `Added ${added} window${added === 1 ? '' : 's'}.`, undo);
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
    if (mode === 'replace' && !await dialog({ title: 'Replace all pages?', message: `${mine === 1 ? `“${S.board.name}” is` : `All ${mine} pages are`} deleted ${Link.dir ? 'here and on your other devices' : 'from this device'}, and the ${n} pages in “${name}” take ${mine === 1 ? 'its' : 'their'} place.`,
      actions: [{ label: 'Replace all pages', value: true, kind: 'danger' }, { label: 'Cancel', value: false }] })) return;
    Lock.letGo();   // ("Unlock and open": now, section 12b)
    if (Link.supported) for (const x of p.pages) await Link.photoIn(x);   // (a device file names its photos, in Photos)
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

  // opts.uid: the page keeps (or takes) this uid: Replace keeps the page's own, so Board Sync sees edits, not a new page.
  // opts.history: {reason, label} for the version of the board as it is now that's saved first (Board history),
  //   or false for none. opts.mustSnapshot: if that version can't be saved, ask before going on.
  // opts.photo: 'file' (default: the file's photo replaces this page's, if it has one), 'exact' (the board gets
  //   exactly the file's photo, or none), 'keep' (this page's photo is left as it is).
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
    // Which window is which on every device (wid, Board Sync): Replace keeps the file's (a backup of this page puts
    // back the same windows); Add makes new ones, each with a createdAt of its own.
    const wids = new Set(mode === 'add' ? Array.from(S.insts.values(), i => i.wid).filter(Boolean) : []);
    let added = 0;

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
      const createdAt = opts.keepCreated && i.createdAt ? i.createdAt : rev + added++;
      const wid = mode !== 'add' && i.wid && !wids.has(i.wid) ? i.wid : Merge.newWid(i.widgetId, createdAt, wids);
      wids.add(wid);
      out.push(rec(Keys.inst(b, ik), 'inst', Object.assign({ widgetId: i.widgetId, n, open: i.open, rect, z: zBase + i.z, maximized: i.maximized, createdAt, wid },
        mode !== 'add' && i.copyOf ? { copyOf: i.copyOf } : {})));
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
      // (the file's theme, accent and text style: chosen here now, so with Board Sync they reach the other devices, see
      // updateSettings)
      const look = {}, q = Object.assign({}, p, p.accent ? accentSet(p.accent) : {});
      for (const k of Merge.STYLE_PARTS) if (q[k]) Object.assign(look, { [k]: q[k], [k + 'At']: rev });
      if (Object.keys(look).length) out.push(rec(Keys.settings, 'settings', Object.assign({}, S.settings, look)));
    }

    if (mode === 'replace') {
      // Stop the running widgets first, so none saves its old content over what's loaded.
      Menu.close();
      for (const w of S.wins.values()) w.destroy();
      S.wins.clear();
      await Writer.settled(1000);
    }
    // Only a file that brings its own photo replaces the page's (or, going back in Board history, the page gets
    // exactly the photo it had then).
    const clearPhoto = photoMode === 'exact' || (photoMode === 'file' && !!p.photo);
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
    Link.changed(out.map(r => r.key).concat(Keys.board(b)));   // (written around Writer: Board Sync is told)
    return undoId;
  }

  // =====================================================================
  // 13b. Board Sync: one board, shared through a Google Drive folder
  // ---------------------------------------------------------------------
  // A teacher builds the board on a laptop and shows it on the smartboard. Each device links itself once to the
  // same folder, e.g. Google Drive › My Drive › 21Board (Chrome's folder picker: 21Board can read and write in that
  // folder only, and the teacher allows it). ChromeOS (and Drive for desktop on Windows) keeps that folder the same
  // on every device, so Board Sync never talks to Google: no sign-in, API keys, Cloud project or server. Chrome and Edge
  // only (Safari and Firefox keep Export/Import).
  // Setting up (Settings › Board Sync › Set up…, see setup): what it is and how to make the folder, then Chrome's
  // folder picker, then a look inside the folder picked (see choose), then the first round and this device's name
  // (see link and welcome).
  //
  // One file per device, never two writers to one file (Google Drive could drop one of two writes):
  // - "21Board (<this device's name>) [<4 characters of its id>].21board": the whole board as this device has it,
  //   every page, with a version of each part (see the Merge region, section 13d) and a "sync" block (who wrote it,
  //   the folder's id, a sequence number, a checksum). Each one is also a full backup: Import opens it. Files are
  //   matched by the device id inside them, never by name. Renaming the device renames its file.
  // - "Photos": each background photo once, named by its content ("<SHA-256>.jpg", see putPhoto, readPhoto). A
  //   device file only names its photos. Photos no device file names are deleted after about a week (tidyPhotos).
  // - "Board history": hourly copies (section 13c). "About this folder.txt" explains the files to anyone browsing.
  //   Other files are left alone, and other .21board files (exports saved there) aren't merged.
  // A round (see round) reads this device's records, gives a new version to every part changed here since the last
  // round (Merge.stamp, against the ledger: link:mine-<page uid> and link:sync), reads the other devices' files that
  // changed, merges them part by part (Merge.join, Merge.plan), saves a Board history version first where it must,
  // writes the result in one transaction that aborts if a record changed meanwhile, shows it, and writes this
  // device's file if its parts changed (at most every LINK_GAP_MS, at once when 21Board is hidden). Rounds run under
  // a Web Lock, so only one tab per device runs one; the others get the result through the sync channel. A round
  // runs a few seconds after changes here, at a look at the folder that finds a changed file (every 5 seconds while
  // 21Board is in front), and when 21Board is hidden (a send round: stamp and write, nothing read). Nothing moves
  // under a finger, a menu or a dialog (see gate and busy).
  // While the folder can't be used (Chrome wants to be asked again, the folder is gone, writing fails, another
  // device has a newer 21Board), a note stays on the board: see FolderNote.
  // On this device only (never exported): link:folder (the folder handle), link:state {device: {id, label},
  // tidy: {at, seen}, shown: {page uid: when}}, and the ledger (docs/DATA-FORMAT.md).
  // =====================================================================
  const LINK_CHECK_MS = 5000;                // how often the folder is looked at while 21Board is in front
  const LINK_QUIET_MS = 3000;                // a round this long after the last change here…
  const LINK_MAX_MS = 15000;                 // …but at least this often while changes keep coming
  const LINK_GAP_MS = 20000;                 // the least time between two writes of this device's file (not on hide, after an Undo or at set-up)
  const LINK_RETRY_MS = 60 * 1000;           // a write that didn't work is tried again after this long (not at every look)
  const LINK_BUSY_MS = 12000;                // a window saved this recently (typing, a Name Picker show) keeps its own version this round
  const LINK_FOCUS_MS = 60000;               // …and this long while it has the keyboard
  const LINK_HOLD_MS = 60000;                // an open window menu or Pages menu holds a merge at most this long, then closes
  const LINK_RACE_MS = 1500;                 // a widget save this soon after a merged write counts as based on the old one (Raced)
  const LINK_IDLE_MS = 2 * 60 * 1000;        // no change seen to a device's file for this long: it counts as idle; a file failing this long is said
  const LINK_READ_MS = 20000;                // a device file's read gives up after this long (and counts as arriving)
  const LINK_ROUND_MS = 60000;               // a round's reading and waiting gives up after this long (it then only sends)
  const LINK_REREAD_MS = 30000;              // a file or photo that failed is read again after this long, even with the same size and date
  const LINK_TOAST_MS = 60000;               // at most one new "Updated from …" message this often (the one shown is updated)
  const LINK_AHEAD_MS = 864e5;               // a counter from another device is believed at most this far ahead of this device's clock
  const LINK_ARRIVE_MS = 10 * 60 * 1000;     // how long a photo, or set-up, waits for files that can't be read yet
  const LINK_GONE_MS = 30 * 864e5;           // deletions are remembered at least this long (and deleted pages kept in Board history)
  const LINK_DEVICE_KEEP_MS = 60 * 864e5;    // an unlinked device's file is removed this long after it left
  const LINK_PEER_GONE_MS = 365 * 864e5;     // a device whose file has been missing this long no longer holds deletions back
  const LINK_BIG = 20e6, LINK_MAX_FILE = 35e6;   // this device's file: very large (said) / too big to write
  const LINK_BEAT_MS = 30 * 1000;            // 21Board's heartbeat, hidden or not (see awake)
  const LINK_SLEPT_MS = 3 * 60 * 1000;       // no heartbeat for this long: the device slept. (Chrome may run a hidden or busy tab's timers only once a minute.)
  const LINK_STALE_MS = 60 * 1000;           // Settings says when the folder was last checked once that is this long ago (while a look is taking long)
  const LINK_LOST_MS = 5 * 60 * 1000;        // a folder missing this long was probably renamed, moved or deleted
  const LINK_README = 'About this folder.txt';
  const LINK_PHOTOS = 'Photos';              // the background photos (see putPhoto)
  const LINK_PHOTO_KEEP_MS = 7 * 864e5;      // a photo no device file names is deleted once it is this old (see tidyPhotos)
  const LINK_LOCK = '21board-link';          // the Web Lock: rounds, Unlink's and Erase's last writes
  // A device file's name, and Google Drive's copies of it ("… (1).21board").
  const LINK_FILE_RE = /^21Board \((.{0,60})\) \[([0-9a-z]{4,8})\]( \(\d+\))?\.21board$/i;
  // Folder problems in plain words: what happened, and what to do. (The browser's own wording goes to the console.)
  const LINK_SAY = {
    missing: ['the folder can’t be found', 'If it was renamed, moved or deleted, choose it again in Settings › Board Sync.'],
    allow: ['Chrome needs you to allow the folder again', 'Tap “Reconnect folder” on the board.'],
    readonly: ['the folder can only be viewed, not changed', 'Ask its owner to let you edit it, or choose another folder in Settings › Board Sync.'],
    full: ['there’s no room left', 'Make room in Google Drive (or on this device).'],
    big: ['the board is too big to sync', 'Remove some big content, such as long notes or large pictures in widgets, then try again.'],
    other: ['the file couldn’t be saved in the folder', 'If this goes on, check that Google Drive is working on this device.']
  };
  // Setting up Board Sync (setup): a laptop and a smartboard on either side of the 21Board folder in Google Drive.
  const SYNC_ART = '<svg class="setup-art" viewBox="0 0 320 104" aria-hidden="true">' +
    '<rect class="dev" x="20" y="22" width="60" height="40" rx="4"/><path class="dev" d="M10 66h80l-6 8H16z"/>' +
    '<rect class="dev" x="232" y="14" width="80" height="50" rx="4"/><path class="dev" d="M272 64v12m-14 0h28"/>' +
    '<path class="fold" d="M124 28a4 4 0 0 1 4-4h17l6 7h37a4 4 0 0 1 4 4v38a4 4 0 0 1-4 4h-60a4 4 0 0 1-4-4z"/>' +
    '<text class="fold-t" x="158" y="59">21Board</text>' +
    '<path class="arr" d="M94 50h22M100 44l-6 6 6 6M110 44l6 6-6 6M200 50h22M206 44l-6 6 6 6M216 44l6 6-6 6"/>' +
    '<text x="50" y="98">Laptop</text><text x="158" y="98">Google Drive</text><text x="272" y="98">Smartboard</text></svg>';
  // Set-up's last step (welcome): the quick names under "This device’s name", and the name each one gives.
  const LINK_NAMES = [['Laptop', 'the laptop'], ['Smartboard', 'the smartboard'], ['Desktop', 'the desktop']];
  // A promise that gives up (rejects with a TimeoutError) after ms.
  const within = (p, ms) => Promise.race([p, sleep(ms).then(() => { throw Object.assign(new Error('Google Drive didn’t answer'), { name: 'TimeoutError' }); })]);
  const randomId = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('');
  // "The smartboard" at the start of a sentence.
  const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());

  const Link = {
    supported: !LAB && !KIOSK && typeof window.showDirectoryPicker === 'function',
    dir: null,          // FileSystemDirectoryHandle
    perm: 'none',       // 'none' (no folder) | 'granted' | 'prompt' | 'denied'
    st: { device: null, tidy: {}, shown: {} },
    sync: null,         // link:sync (the ledger's head) as this tab last read or wrote it
    files: new Map(),   // every .21board file in the folder: name -> what was read of it (see scan)
    listed: new Set(),  // every .21board name in the folder at the last look, lowercased
    peers: {},          // device key -> {peer (Merge.decode), seq, name, at, file, left, folder}: its newest file that passed every check
    photoDirs: [],      // Photos, and any Photos (n) Google Drive made beside it
    started: false, running: null, again: null, timers: { full: 0, send: 0 }, fullAt: 0, firstChange: 0, carrying: false, gen: 0, lastCheck: 0, loading: false,
    owed: false,        // the last round held something back: the next look runs one (see check)
    dailyAt: 0,         // the last daily tidying (see daily)
    hcache: new Map(),  // the fingerprints of the records' parts, by revision, kept between rounds (Merge.read)
    writing: false,     // a round is writing records or this device's file ("Syncing…")
    nagged: false, nagToast: null,
    waits: { quiet: LINK_QUIET_MS, max: LINK_MAX_MS, gap: LINK_GAP_MS, retry: LINK_RETRY_MS, idle: LINK_IDLE_MS, arrive: LINK_ARRIVE_MS, busy: LINK_BUSY_MS, focus: LINK_FOCUS_MS,
      race: LINK_RACE_MS, hold: LINK_HOLD_MS, read: LINK_READ_MS, round: LINK_ROUND_MS, reread: LINK_REREAD_MS, toast: LINK_TOAST_MS, keep: LINK_DEVICE_KEEP_MS,
      gone: LINK_GONE_MS, maxFile: LINK_MAX_FILE, bigFile: LINK_BIG, afterCommit: null },   // (tests shorten them; afterCommit 'stop': a crash between a round's transaction and its write)
    beatAt: 0, freshAt: 0,   // when 21Board was last seen running here; when it opened, or the device woke up or came back online (see awake)
    trouble: null,      // why the folder can't be used right now: {kind: 'missing' | 'send', code, since, at, said}
    failed: null,       // the last write that didn't work: {at, code}
    unsent: false,      // changes made here aren't in the folder (a write failed or can't be made)
    newer: null,        // a device whose file is from a newer 21Board: its name
    big: 0,             // this device's file is over LINK_BIG: its size
    checkedAt: 0,       // the last good look at the folder
    lookingSince: 0,    // when the look under way began
    gateAt: 0,          // since when an open window menu or Pages menu has held a merge
    fresh: true,        // the first round of this session (it reads every photo record)
    media: new Map(),   // media records as last read (key -> record): read again only when their revision changes
    quiet: {},          // page uid -> its ledger's quiet note: changed by a merge while not shown here (see quietNote)
    waiting: new Map(), // photo file -> {since, uid, page}: a photo a device file names that isn't here, or isn't good
    histWait: new Map(),   // page uid -> {name, from}: its changes wait until Board history can save a version
    linked: null,       // what the first round after linking did (see welcome)
    welcoming: false,   // set-up's last step will say what the first round did: that round shows no merge message
    leaving: false,     // Change…: the farewell write to the folder left, until the new folder's mode is noted (switching)
    prints: new Map(),  // photo data URL -> {file, size, w, h}: its name in Photos, worked out once (see photoName)
    got: new Map(),     // photo file -> the picture read from Photos (the last few)
    badPhotos: new Map(),   // photo file -> {size, lastModified, at}: found not good as it is
    slowPhotos: new Map(),  // photo file -> when its read last timed out (read again LINK_REREAD_MS later)
    tidying: null,      // while Photos is being tidied: done when it is (see tidyPhotos)
    toastAt: 0,

    // ---- this device's records
    applyRecord(name, value) {
      if (name === 'folder') {
        this.dir = value && typeof value === 'object' && value.kind === 'directory' ? value : null;
        this.files.clear(); this.listed = new Set(); this.peers = {}; this.badPhotos.clear(); this.waiting.clear(); this.histWait.clear();
        this.trouble = this.failed = this.newer = null; this.checkedAt = 0; this.unsent = false;
        if (this.started) this.refresh(); else FolderNote.update();
      } else if (name === 'state') {
        const v = value && typeof value === 'object' ? value : {};
        this.st = { device: v.device && UID_RE.test(v.device.id || '') ? v.device : null, tidy: v.tidy && typeof v.tidy === 'object' ? v.tidy : {}, shown: v.shown && typeof v.shown === 'object' ? v.shown : {} };
        FolderNote.update();
      } else if (name === 'sync') {
        this.sync = value && typeof value === 'object' ? value : null;   // (written by the tab that ran a round)
        this.redraw(true);
      }
      // (link:mine-<uid>, the ledger's pages: only rounds read them.)
    },
    saveState(patch, quiet) {
      this.st = Object.assign({}, this.st, patch);
      Writer.put(Keys.link('state'), 'link', this.st);
      this.redraw(quiet);
    },
    // The note on the board and Settings show how the folder is doing. quiet (a look at the folder, every few
    // seconds): Settings is drawn again only if what it shows of Board Sync changed. (Rebuilding it each time would
    // disturb someone typing this device's name, a screen reader, where it is scrolled and the keyboard.)
    redraw(quiet) { FolderNote.update(); if (Settings.isOpen) { if (quiet) Settings.linkRefresh(); else Settings.render(); } },
    device() {
      if (!this.st.device) {
        const touch = navigator.maxTouchPoints > 0, big = Math.max(screen.width, screen.height) >= 1900;
        this.saveState({ device: { id: newId(), label: touch && big ? 'the smartboard' : /CrOS/.test(navigator.userAgent) ? 'a Chromebook' : 'a computer' } });
      }
      return this.st.device;
    },
    // This device's key in the files and versions: its id without dashes, 12 characters.
    dev() { return this.device().id.replace(/-/g, '').toLowerCase().slice(0, 12).padEnd(12, '0'); },
    // "21Board (laptop) [k3j9].21board" (8 id characters if another device's file has that name).
    fileName(wide) {
      const d = this.device(), label = d.label.replace(/^(the|a|an) /i, '').replace(/[()[\]]/g, '').trim().slice(0, 40) || 'device';
      return `21Board (${this.safeName(label)}) [${BoardHistory.tag(d.id, wide ? 8 : 4)}].21board`;
    },
    // The other devices' names, by device key (for messages): as each one last named itself.
    names() {
      const out = {};
      for (const [d, p] of Object.entries((this.sync && this.sync.peers) || {})) if (p && p.name) out[d] = p.name;
      for (const [d, p] of Object.entries(this.peers)) if (p.name) out[d] = p.name;
      if (this.st.device) out[this.dev()] = this.st.device.label;
      return out;
    },
    // A page changed by a merge while it wasn't shown (MergeUI says so once when it is next shown): its note, if it
    // hasn't been shown since; noted as shown now.
    quietNote(uid) {
      const q = this.quiet[uid];
      if (!q || !q.at || (this.st.shown[uid] || 0) >= q.at) return null;
      this.saveState({ shown: Object.assign({}, this.st.shown, { [uid]: Date.now() }) }, true);
      return q;
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
    // Runs fn while holding the Web Lock (waiting for a round in another tab). ifAvailable: not at all if it is held
    // (fn gets null).
    locked(fn, ifAvailable) {
      if (!navigator.locks) return fn(true);
      return navigator.locks.request(LINK_LOCK, ifAvailable ? { ifAvailable: true } : {}, lock => fn(lock));
    },
    // Changes link:sync in a transaction of its own (under the lock).
    async noteSync(fn, gen = this.gen) {
      const key = Keys.link('sync');
      let out = null;
      await Store.tx('readwrite', s => {
        const g = s.get(key);
        g.onsuccess = () => {
          if (gen !== this.gen) return;   // (erased meanwhile)
          const cur = g.result, value = fn(Object.assign({ v: 1 }, cur && cur.value)) || null;
          if (!value) return;
          out = { key, type: 'link', rev: Math.max(((cur && cur.rev) || 0) + 1, Date.now()), updatedAt: Date.now(), by: TAB_ID, value: this.keepable(value) };
          s.put(out);
        };
      });
      if (out) { Known.set(key, out.rev); this.sync = out.value; Sync.announce([key]); }
      return out && out.value;
    },
    // link:sync with the folder handle only where this browser can store one (a stand-in handle, as in the tests, can't be).
    keepable(v) {
      if (!v.dir) return v;
      try { structuredClone(v.dir); return v; } catch (e) { const o = Object.assign({}, v); delete o.dir; return o; }
    },

    // ---- permission (Chrome remembers it for an installed 21Board; in a tab it may ask again after a restart)
    async refresh() {
      if (!this.dir) { this.perm = 'none'; this.redraw(true); return; }
      try { this.perm = typeof this.dir.queryPermission === 'function' ? await this.dir.queryPermission({ mode: 'readwrite' }) : 'granted'; } catch (e) { this.perm = 'denied'; }
      this.redraw(true);
      if (this.perm === 'granted') { this.unnag(); await this.check(true); }
      else if (this.perm === 'prompt' && !this.nagged && this.sync) {
        this.nagged = true;   // (said once; the note on the board stays: see FolderNote)
        this.nagToast = toast(`Reconnect your “${this.dir.name}” folder to keep this board in sync with your other devices.`, { action: 'Reconnect', timeout: 12000, onAction: () => this.reconnect() });
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
    // From a tap (the note on the board, the message at start, Settings). Once allowed, the folder is checked.
    async reconnect() {
      if (this.perm === 'granted') { await this.check(true); return; }
      if (await this.ensurePerm()) { toast(`Your “${this.dir.name}” folder is connected again.`); await this.check(true); }
      else if (this.perm === 'denied') FolderNote.explain();   // Chrome refused without asking
      else toast('21Board can’t use that folder until you allow it.');
    },
    // What keeps the board from syncing right now, if anything: 'allow' (Chrome wants to be asked again), 'missing'
    // (the folder can't be found or read), 'send' (writing this device's file fails: shown for a folder that can
    // only be viewed only while changes made here aren't in it), 'newer' (another device has a newer 21Board).
    problem() {
      if (!this.dir) return '';
      if (this.perm === 'prompt' || this.perm === 'denied') return 'allow';
      const t = this.trouble;
      if (t && t.kind === 'missing') return 'missing';
      if (t && t.kind === 'send' && (t.code !== 'readonly' || (this.sync && (this.sync.localAt || 0) > (this.sync.wroteAt || 0)))) return 'send';
      return this.newer ? 'newer' : '';
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
      return err && err.code === 'big' ? 'big' : 'other';
    },
    // The folder can't be found or read. The note on the board says so at once and stays; a message says it
    // once, and only when it has been gone for a minute (at sign-in, Google Drive may still be starting).
    // 21Board looks again by itself, with the usual checks. told: the teacher has just been told.
    lost(told) {
      const t = this.trouble && this.trouble.kind === 'missing' ? this.trouble : (this.trouble = { kind: 'missing', code: 'missing', since: Date.now(), said: false });
      t.at = Date.now();
      if (told) t.said = true;
      if (!t.said && t.at - t.since >= 60 * 1000) {
        t.said = true;
        toast(`21Board can’t find your “${this.dir.name}” folder, so this board isn’t synced right now. It keeps looking.`, { action: 'Details', timeout: 10000, onAction: () => FolderNote.explain() });
      }
    },
    // Writing this device's file didn't work: said the first time (not for a folder that can only be viewed: the
    // status says so, and the note only once something here is waiting). The note on the board stays until one works.
    stuck(code) {
      const t = this.trouble && this.trouble.kind === 'send' ? this.trouble : (this.trouble = { kind: 'send', since: Date.now(), said: false });
      t.code = code; t.at = Date.now();
      if (t.said || code === 'readonly') return;
      t.said = true;
      toast(`Couldn’t sync this board with your folder: ${LINK_SAY[code][0]}. 21Board keeps trying.`, { action: 'Details', timeout: 10000, onAction: () => FolderNote.explain() });
    },
    // This device's file is written again: "Not synced" goes.
    unstuck() {
      const was = this.failed || (this.trouble && this.trouble.kind === 'send');
      this.failed = null; this.unsent = false;
      if (this.trouble && this.trouble.kind === 'send') this.trouble = null;
      if (was) this.redraw();
    },

    // ---- linking (from a tap)
    // Board Sync, the first time (Settings › Board Sync › Set up…). Step 1 says what it is and how to make the
    // folder; its button opens Chrome's folder picker (choose); the last step says what the first round did, and
    // asks for this device's name (welcome). True once a folder is linked.
    async setup() {
      if (!this.supported) return false;
      const go = await dialog({
        title: 'Set up Board Sync', cls: 'setup',
        message: 'Board Sync keeps your board in a Google Drive folder, so your laptop and smartboard share it.',
        html: SYNC_ART + '<ol class="setup-steps">' +
          '<li>Tap <b>Choose folder…</b> below. In the window that opens, go to <b>Google Drive › My Drive</b>.</li>' +
          '<li>The first time, tap <b>New folder</b> and name it <b>21Board</b>. On your other device, pick this same folder. (To keep a board in sync with a co-teacher, share this Google Drive folder with them as an Editor.)</li>' +
          '<li>Open the folder, then tap <b>Select</b> (or <b>Open</b>) and <b>Allow</b>.</li></ol>',
        actions: [{ label: 'Choose folder…', value: true, kind: 'primary' }, { label: 'Cancel', value: false }]
      });
      // (Straight on to the picker, with nothing to wait for first: Chrome opens it only from a tap.)
      const got = go && await this.choose();
      if (got) await this.welcome(got);
      return !!got;
    },
    // Chrome's folder picker (from a tap: Set up…, Change…, the note on the board), then a quick look inside the
    // folder picked (peek): a 21Board folder inside it is offered instead, and a folder with other things in it (My
    // Drive itself) can have one made. Then it is linked (link). Returns {readOnly, had (21Board's note was in it)}
    // once linked; false when nothing changed (cancelled, or the folder couldn't be used).
    async choose() {
      for (;;) {
        let h;
        try { h = await window.showDirectoryPicker({ id: '21board', mode: 'readwrite' }); } catch (err) {
          if (!err || err.name !== 'AbortError') { console.warn('21Board: the folder couldn’t be chosen', err); toast('That folder couldn’t be opened. Try again, or choose another folder.'); }
          return false;
        }
        const look = await this.peek(h);
        if (look.history || look.photos) {   // (a folder can't reach the one it's in: the teacher picks that)
          const again = await dialog({ title: `“${h.name}” is 21Board’s ${look.history ? 'Board history' : 'Photos'} folder`,
            message: `It holds ${look.history ? 'earlier versions of your boards' : 'the background photos of your boards'}. Choose the folder it’s in instead, such as 21Board.`,
            actions: [{ label: 'Choose another…', value: true, kind: 'primary' }, { label: 'Cancel', value: false }] });
          if (again) continue;   // (this tap opens the picker again)
          return false;
        }
        if (look.subs && look.subs.length > 1) {
          // Two devices each made a 21Board folder before Google Drive brought the other's: the one with device files first.
          const pick = await dialog({ title: 'This folder has two 21Board folders', message: 'Pick the one your other devices use. The other one can be deleted in Google Drive.',
            actions: look.subs.map((s, i) => ({ label: `Use “${s.name}”`, value: i + 1, kind: i ? '' : 'primary' })).concat([{ label: 'Cancel', value: null }]) });
          if (!pick) return false;
          h = look.subs[pick - 1];
        } else if (look.sub) {
          const pick = await dialog({ title: `Use the ${look.sub.name} folder inside “${h.name}”?`, message: 'Pick the same folder on each of your devices.',
            actions: [{ label: `Use ${look.sub.name} folder`, value: 'sub', kind: 'primary' }, { label: `Use “${h.name}” itself`, value: 'this' }, { label: 'Cancel', value: null }] });
          if (!pick) return false;
          if (pick === 'sub') h = look.sub;
        } else if (look.other) {
          const pick = await dialog({ title: `Make a 21Board folder in “${h.name}”?`, message: 'This folder has other files in it. 21Board works best in a folder of its own.',
            actions: [{ label: 'Make a 21Board folder here', value: 'make', kind: 'primary' }, { label: 'Use this folder anyway', value: 'this' }, { label: 'Choose another…', value: 'again' }, { label: 'Cancel', value: null }] });
          if (!pick) return false;
          if (pick === 'again') continue;   // (this tap opens the picker again)
          if (pick === 'make') {
            try { h = await h.getDirectoryHandle('21Board', { create: true }); } catch (err) {
              console.warn('21Board: couldn’t make a folder in the folder chosen', err);
              const n = err && err.name, view = /^(NoModificationAllowed|NotAllowed|Security)Error$/.test(n);
              const again = await dialog({ title: `21Board can’t make a folder in “${h.name}”`,
                message: view ? 'You can only view this folder, not change it. Choose a folder you can change, such as one in My Drive.' : n === 'QuotaExceededError' ? 'There’s no room left in Google Drive. Make room, or choose another folder.' : 'Something went wrong. Try again, or choose another folder.',
                actions: [{ label: 'Choose another…', value: true, kind: 'primary' }, { label: 'Cancel', value: false }] });
              if (again) continue;
              return false;
            }
          }
        }
        return this.link(h);
      }
    },
    // A quick look inside a folder just picked: {ours} (21Board's files are in it, or it is called 21Board),
    // {history} (the Board history folder inside 21Board's: only its copies and note, or its name and nothing
    // else), {photos} (the Photos folder inside 21Board's: only its photos, or its name and nothing else), {sub}
    // (no files of 21Board's, but a folder called 21Board, in any capitals; subs: all of them, "21Board (1)" too,
    // the one with device files first), {other} (other files or folders, as in My Drive itself; not a folder called
    // Photos, which My Drive may have too), or {} (empty, or it couldn't be read). Google Drive may be slow to list
    // a folder, or not have it yet: what has been seen after a second and a half is all there is, and the folder is
    // linked as it is if that is nothing (never held up by the look).
    async peek(h) {
      if (/^21board$/i.test(h.name)) return { ours: true };
      const seen = { subs: [] };
      let stop = false;
      const look = (async () => {
        for await (const [name, e] of h.entries()) {
          if (stop) break;
          if (e.kind === 'file' && (name === 'About these files.txt' || BoardHistory.parseName(name))) seen.history = true;
          else if (e.kind === 'file' && PHOTO_FILE_RE.test(name)) { seen.photos = true; continue; }
          else if (e.kind === 'file' ? /\.21board$/i.test(name) || name === LINK_README : name === 'Board history') { seen.ours = true; break; }
          if (e.kind === 'directory' && /^21board( \(\d+\))?$/i.test(name)) { seen.subs.push(e); if (/^21board$/i.test(name)) seen.sub = seen.sub || e; }
          else if (!/^\.|^desktop\.ini$/i.test(name) && !(e.kind === 'directory' && name === LINK_PHOTOS)) seen.other = true;   // (not hidden files that a computer adds)
        }
      })();
      await Promise.race([look.catch(() => {}), sleep(1500)]);
      stop = true;
      if (seen.subs.length > 1) {
        const has = async d => { try { for await (const [n] of d.entries()) if (LINK_FILE_RE.test(n)) return 1; } catch (e) { /* not listed yet */ } return 0; };
        const marks = await Promise.race([Promise.all(seen.subs.map(has)), sleep(1500).then(() => seen.subs.map(() => 0))]);
        seen.subs = seen.subs.map((d, i) => [d, marks[i]]).sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)).map(x => x[0]);
      }
      if (!seen.sub && seen.subs.length) seen.sub = seen.subs[0];
      return seen.ours ? { ours: true } : seen.history || (h.name === 'Board history' && !seen.other && !seen.sub) ? { history: true }
        : (seen.photos || h.name === LINK_PHOTOS) && !seen.other && !seen.sub ? { photos: true }
        : seen.sub ? { sub: seen.sub, subs: seen.subs } : seen.other || seen.photos ? { other: true } : {};
    },
    // The folder picked is linked (set-up, Change…, linking again after Unlink). The ledger notes it: the first look
    // decides what to do (link:sync.mode, see decide), and a round runs at once. Returns {readOnly, had}.
    // Change… to another folder: the folder linked until now gets this device's file once more first, with what was
    // changed here since its last write and saying that this device left (as Unlink does), so its other devices get
    // that work and stop listing this one.
    async link(h) {
      this.leaving = true;   // (from the farewell write until the mode is noted: see switching)
      try {
        if (this.dir && this.sync && !this.sync.mode && this.ready()) {
          let same = false;
          try { same = typeof h.isSameEntry === 'function' && await h.isSameEntry(this.dir); } catch (e) { /* not comparable */ }
          if (!same) await this.locked(() => this.farewell(false));
        }
        this.perm = 'granted';
        this.device();
        await this.locked(() => this.noteSync(s => Object.assign(s, { dev: this.dev(), mode: 'wait', first: true, linkAt: Date.now(), linking: h.name, left: null })));
      } finally { this.leaving = false; }
      this.linked = null; this.welcoming = true;
      await this.saveFolder(h);
      this.saveState({ tidy: {} });   // (what was found unused in Photos was another folder's)
      let readOnly = false, had = false;   // had: the note about the files was there (another device set this folder up)
      try { had = await this.writeReadme(); } catch (err) { readOnly = await this.codeOf(err) === 'readonly'; }
      await this.check(true, true);
      return { readOnly, had };
    },
    // The last step of setup (also after Change…): what the first round did (this.linked, see decide), what comes
    // next, and this device's name.
    async welcome(got) {
      if (!this.dir) return;   // (unlinked meanwhile)
      for (let i = 0; i < 300 && this.running; i++) await sleep(100);
      const say = [`This device now syncs through your “${this.dir.name}” folder.`], L = this.linked || {};
      this.welcoming = false;   // (a board that arrives after this is said with a toast)
      const pages = n => `${n} page${n === 1 ? '' : 's'}`;
      const board = L.from ? `The board from ${L.from}${L.pages ? ` (${pages(L.pages)})` : ''} is here now.` : '';
      if (this.problem() === 'missing') say.push('Google Drive is still bringing the folder to this device. 21Board keeps looking.');
      else if (got.readOnly) say.push('You can only view this folder, so changes made here aren’t synced. The board from your other devices still shows here.');
      else if (!L.mode || L.mode === 'wait') say.push('Google Drive is still bringing the board in this folder to this device. It shows up here by itself.');
      else if (L.mode === 'seed') say.push(L.empty ? 'Now set up Board Sync on your other device and pick this same folder: its board shows up here.'
        : 'Now set up Board Sync on your other devices and pick this same folder: this board shows up there.');
      else if (L.mode === 'carry') say.push('This device syncs again. Changes made here while it was unlinked are added to the board.');
      else if (L.mode === 'join') say.push(board + (L.added ? ` This device’s ${L.added === 1 ? 'page was' : pages(L.added) + ' were'} added after them.` : ''));
      else if (L.mode === 'take') {
        // (both folders are often called 21Board, as set-up suggests: then "the one this device used before")
        const where = !L.other ? 'your other folder' : L.other === this.dir.name ? `the “${L.other}” folder this device used before` : `your “${L.other}” folder`;
        // (a page deleted there, brought back here by its Undo after Unlink, say: not "still in" it)
        const gone = L.goneThere || [], them = andList(gone.map(n => `“${n}”`)), one = gone.length === 1;
        say.push(board + (!L.switched ? '' : !gone.length ? ` This device’s other pages are still in ${where}, and under Board history › Deleted pages for 30 days.`
          : L.keptThere ? ` This device’s other pages are still in ${where}, except ${them}, which ${one ? 'was' : 'were'} deleted there. All of them are under Board history › Deleted pages for 30 days.`
          : ` This device’s ${one ? 'page' : 'pages'} ${them} ${one ? 'was' : 'were'} deleted in ${where}: ${one ? 'it is' : 'they are'} under Board history › Deleted pages for 30 days.`));
      }
      say.push('Changes you make on any of your devices show up on the others by themselves, usually within a minute: Google Drive decides when.');
      // This device's name, as the others say it ("Updated from the laptop."): 21Board's guess (see device) or the name
      // it has, kept or changed with a tap (LINK_NAMES) or typed. The field gets the keyboard only on a device without
      // a touch screen: on a smartboard or an iPad, that would bring up the on-screen keyboard unasked. A name in the
      // field that another device in the folder has ("Shared with the laptop and the laptop") is said under it, as the
      // teacher types or taps; not the name of a device that left, or of one with no file in this folder (after Change…,
      // the folder left's devices until this one's board is decided), which the status leaves out too.
      const me = this.device(), same = s => String(s || '').trim().toLowerCase(), keys = navigator.maxTouchPoints === 0;
      const sp = (this.sync && this.sync.peers) || {}, seen = new Set(Array.from(this.files.values(), f => f.dev).filter(Boolean));
      const others = Object.entries(this.names()).filter(([d]) => d !== this.dev() && seen.has(d) && !(sp[d] || {}).left).map(([, n]) => n);
      const asked = dialog({ title: 'Board Sync is set up', message: say.join(' '), cls: 'setup',
        input: { label: 'This device’s name (shown on your other devices)', maxlength: 40, focus: keys,
          html: '<div class="modal-note" id="name-twin" aria-live="polite" hidden></div>' +
            `<div class="seg name-quick" role="group" aria-label="Pick a name">${LINK_NAMES.map(([l, v]) => `<button type="button" aria-pressed="false" data-name="${v}">${l}</button>`).join('')}</div>` },
        actions: [{ label: 'Done', value: true, kind: 'primary' }] });
      const f = $('#modal input'), quick = $$('#modal .name-quick button'), note = $('#name-twin');
      const mark = () => {   // (as the teacher types too)
        for (const b of quick) b.setAttribute('aria-pressed', String(b.dataset.name === same(f.value)));
        const v = same(f.value), twin = v && others.find(n => same(n) === v), line = twin ? `Another device in this folder is called “${twin}” too.` : '';
        note.hidden = !twin;
        if (note.textContent !== line) note.textContent = line;   // (emptied when hidden: a screen reader reads it with the field even then)
      };
      f.value = me.label; mark();
      if (keys) f.select();
      f.setAttribute('aria-describedby', 'name-twin');
      f.addEventListener('input', mark);
      for (const b of quick) b.onclick = () => { f.value = b.dataset.name; mark(); };
      await asked;   // (Done, Enter, Escape or a tap outside: set-up is over either way, so the name in the field is kept)
      const label = f.value.trim().slice(0, 40);   // (an empty field keeps the name)
      if (label && label !== this.device().label) this.rename(label);
    },
    // This device's name changed (Settings, set-up): its file is renamed at the next write.
    rename(label) {
      this.saveState({ device: Object.assign({}, this.device(), { label }) });
      this.changed([Keys.link('state')], { name: true });
    },
    // Unlink: this device's file is written once more, saying it left (if it can be), then nothing is read or
    // written. The board stays here, and so does the ledger: linking the same folder again carries on (see decide).
    async unlink() {
      await this.locked(() => this.farewell(false));
      this.gen++;
      this.stopTimers();
      await Writer.del(Keys.link('folder'));
      this.applyRecord('folder', null);
      this.perm = 'none';
      this.redraw();
    },
    // The last write before Unlink or Erase (under the lock): sync.left = {at} or {at, erased: true}.
    async farewell(erased) {
      if (!this.ready() || !this.sync || this.sync.mode) return;
      try { await this.attempt('send', this.gen, { left: Object.assign({ at: Date.now() }, erased ? { erased: true } : {}) }); }
      catch (err) { console.warn('21Board: the last write to the folder didn’t work', err); }
    },
    // The note about the files, unless it's there (then true). Throws as a write would where the folder can only be
    // viewed (one another teacher set up and shared for viewing has the note already: it is opened to be changed, and left).
    async writeReadme() {
      let fh = null;
      try { fh = await this.dir.getFileHandle(LINK_README); } catch (e) { /* not there yet */ }
      if (fh) { const w = await fh.createWritable({ keepExistingData: true }); await w.abort(); return true; }
      await this.writeFile(LINK_README, [
        '21Board keeps your board here so your devices can share it through Google Drive (Board Sync).',
        '',
        'Each device keeps its own copy of the whole board here, named after the device, such as',
        '"21Board (laptop) [k3j9].21board". 21Board puts them together, so every device shows the same',
        'board. Each one is a full backup of every page: you can open it with Import in 21Board.',
        '',
        '- To add a device: in 21Board on that device, go to Settings > Board Sync > Set up, and',
        '  pick this same folder. Everyone who sets up Board Sync with this folder shares one board.',
        '- To keep a board in sync with a co-teacher: share this Google Drive folder with them as an',
        '  Editor. They add a shortcut to it in their My Drive, then pick it when they set up.',
        '- Please don’t edit, rename or move these files. When a device is unlinked, 21Board deletes',
        '  its file here two months later.',
        '- The "Photos" folder holds the pages’ background photos, each one once. The board files only',
        '  name their photos: to give a board to someone, use Export in 21Board.',
        '- The "Board history" folder holds earlier versions of your pages, about one an hour. Open one',
        '  from 21Board > Settings > Board history, or with Import.',
        '- These files can include student names and class photos. Share this folder only with people',
        '  who should see them.',
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
    safeName(name) {
      return String(name || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 60) || 'Board';
    },
    // The folder's .21board files: each device file whose size or date changed since it was last read, or that
    // failed LINK_REREAD_MS ago, is read (all at once, each with its own LINK_READ_MS) and checked: it parses, it
    // is a device file this 21Board knows (Merge.decode), and its checksum matches (a file Google Drive has only
    // half brought, or that mixes old and new bytes, can still parse). Returns true if anything changed.
    // A file that fails is "arriving" (bad: since when): it is never merged and never holds up anything else.
    async scan() {
      const dir = this.dir, gen = this.gen, now = Date.now(), seen = new Map(), photos = [];
      this.lookingSince = now;
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') { if (/^Photos( \(\d+\))?$/.test(name)) photos.push(h); continue; }
        if (/\.21board$/i.test(name)) seen.set(name, h);
      }
      if (gen !== this.gen) return false;
      photos.sort((a, b) => (a.name === LINK_PHOTOS ? -1 : b.name === LINK_PHOTOS ? 1 : a.name.localeCompare(b.name)));
      this.photoDirs = photos;
      let changed = false;
      for (const n of Array.from(this.files.keys())) if (!seen.has(n)) { this.files.delete(n); changed = true; }
      await Promise.all(Array.from(seen, async ([name, h]) => {
        const was = this.files.get(name), devish = LINK_FILE_RE.test(name);
        // (Never merged while it fails; whose it is, if it could be read before, is kept for the status.)
        const fail = file => {
          const e = { name, devish, dev: was && was.dev, devName: was && was.devName, at: was && was.at, bad: (was && was.bad) || now, readAt: now, size: file ? file.size : -1, lastModified: file ? file.lastModified : -1 };
          if (!(was && was.bad && was.size === e.size && was.lastModified === e.lastModified)) changed = true;
          this.files.set(name, e);
        };
        let file;
        try { file = await within(h.getFile(), this.waits.read); } catch (e) { return fail(null); }
        if (was && was.size === file.size && was.lastModified === file.lastModified && (!was.bad || now - was.readAt < this.waits.reread)) return;
        let obj;
        try { obj = JSON.parse(await within(file.text(), this.waits.read)); } catch (e) { return devish || (was && was.dev) ? fail(file) : this.files.set(name, { name, size: file.size, lastModified: file.lastModified, other: true }); }
        const s = obj && obj.format === '21board' && obj.sync && typeof obj.sync === 'object' ? obj.sync : null;
        if (!s) { if (devish) return fail(file); this.files.set(name, { name, size: file.size, lastModified: file.lastModified, other: true }); return; }
        const meta = { name, size: file.size, lastModified: file.lastModified, readAt: now, dev: String(s.dev || ''), devName: String(s.name || '').slice(0, 60) };
        const dec = (() => { try { return Merge.decode(obj, { UID_RE, PHOTO_FILE_RE, accentOk: accentKeyOk, accentColorOk: accentOk }); } catch (e) { console.warn('21Board: a device file couldn’t be read', e); return null; } })();
        if (dec && dec.newer) { this.files.set(name, Object.assign(meta, { newer: true })); changed = true; return; }
        let sum = '';
        try { sum = await this.digest(new TextEncoder().encode(Merge.sumText(obj))); } catch (e) { /* no checksum: not merged */ }
        if (!dec || !dec.peer || !s.sum || sum !== s.sum) return fail(file);
        if (dec.skipped && dec.skipped.length) console.warn('21Board: parts of a device file were left out', name, dec.skipped);
        const refs = [];
        for (const e of [obj].concat(Array.isArray(obj.pages) ? obj.pages.filter(x => x && !x.main) : [])) {
          const bg = e && e.media && e.media.background;
          if (bg && e.board && PHOTO_FILE_RE.test(bg.file || '')) refs.push({ uid: e.board.uid, ref: bg, look: e.media.look || null });
        }
        this.files.set(name, Object.assign(meta, { seq: num(s.seq, 0), at: num(s.at, 0), folder: String(s.folder || ''), left: s.left && typeof s.left === 'object' ? s.left : null,
          write: String(s.write || ''), merged: s.merged && typeof s.merged === 'object' ? s.merged : {}, peer: dec.peer, refs, uids: [obj].concat(Array.isArray(obj.pages) ? obj.pages : []).map(e => e && e.board && e.board.uid).filter(Boolean),
          pages: Array.isArray(obj.pages) && obj.pages.length > 1 ? obj.pages.length : 1 }));
        changed = true;
      }));
      if (gen !== this.gen) return false;
      this.listed = new Set(Array.from(seen.keys(), n => n.toLowerCase()));
      this.checkedAt = Date.now();
      return changed;
    },
    // Device files that passed every check, by device: the newest (by seq) of each. own: this device's.
    good() {
      const by = {};
      for (const f of this.files.values()) if (f.peer && (!by[f.dev] || f.seq > by[f.dev].seq)) by[f.dev] = f;
      return by;
    },
    // A look at the folder (every few seconds while 21Board is in front, at start, on focus, when shown again): a
    // round runs at once if a device file changed (or one that failed is due to be read again), the mode of a
    // folder just linked isn't decided yet, this device's own file must be written again (see ownCheck), the last
    // round held something back (owed: a window being typed in, the board in use, a photo or a copy waiting, Board
    // history full), or the daily tidying is due. Nothing changing anywhere: no round, nothing read or written.
    // force: not held back by the 4 seconds since the last look (it still runs a round only if one is due).
    async check(force, wait) {
      this.awake();
      if (!this.dir || this.perm !== 'granted') return;
      if (!force && Date.now() - this.lastCheck < 4000) return;
      this.lastCheck = Date.now();
      const dir = this.dir;
      const failedAgo = Date.now() - ((this.failed || {}).at || 0);
      let due = !!(this.sync && this.sync.mode) || !this.sync || this.owed || Date.now() - this.dailyAt >= 20 * 36e5 || this.unsent && (failedAgo < 0 || failedAgo >= this.waits.retry);
      try {
        for await (const [name, h] of dir.entries()) {
          if (h.kind !== 'file' || !/\.21board$/i.test(name)) continue;
          const was = this.files.get(name);
          if (!was) { due = true; break; }
          if (was.bad && Date.now() - was.readAt >= this.waits.reread) { due = true; break; }
          let f;
          try { f = await within(h.getFile(), 2000); } catch (e) { continue; }
          if (f.size !== was.size || f.lastModified !== was.lastModified) { due = true; break; }
        }
        if (dir !== this.dir) return;
        if (this.files.size && Array.from(this.files.keys()).some(n => !this.listed.has(n.toLowerCase()))) due = true;
        this.checkedAt = Date.now();
        if (this.trouble && this.trouble.kind === 'missing') { this.trouble = null; this.freshAt = Date.now(); due = true; }   // (back: Google Drive gets its time from now)
      } catch (err) {
        if (dir !== this.dir) return;
        if (!this.trouble || this.trouble.kind !== 'missing') console.warn('21Board: could not read the shared folder', err);   // (once, not at every look)
        if (await this.codeOf(err) !== 'allow') this.lost();   // ('allow': Chrome wants to be asked again, see problem)
        this.redraw(true);
        return;
      }
      this.redraw(true);
      if (due) { if (wait) await this.round('full'); else this.want('full', 0); }
    },
    // 21Board has just opened, or stood still for a while (the device slept): Google Drive may not have brought
    // what the other devices wrote meanwhile (tidyPhotos waits). The heartbeat in start() keeps beatAt going
    // while 21Board runs, hidden or not.
    awake() {
      const now = Date.now();
      if (now - this.beatAt > LINK_SLEPT_MS) this.freshAt = now;
      this.beatAt = now;
    },

    // Try again now (FolderNote, Settings): a round at once, and the file written at once.
    async retryNow() { this.failed = null; this.urgent = true; if (await this.ensurePerm()) await this.round('full'); },

    // ---- when rounds run
    // A record changed here (Writer.write, and applyImport and Pages.purge, which write with Store.tx): a round once
    // the changes stop for LINK_QUIET_MS, but at least every LINK_MAX_MS. opts.now (the Undo of a merge): at once,
    // and the file is written at once. opts.name: this device was renamed (its file is renamed at the next write).
    changed(keys, opts = {}) {
      if (!this.dir || !this.sync) return;
      if (!opts.name && !keys.some(k => /^(board|inst|data|conf|media|settings)$/.test(Keys.parse(k).kind))) return;
      if (opts.now) { this.urgent = true; this.want('full', 0); return; }
      const now = Date.now(), was = this.syncing();
      if (!this.firstChange) this.firstChange = now;
      this.want('full', Math.max(0, Math.min(this.waits.quiet, this.firstChange + this.waits.max - now)), true);
      if (!was) this.redraw(true);   // ("Syncing…" in Settings at once, not at the next look)
    },
    // A round of this kind in delay ms ('full': read, merge and write; 'send': stamp and write only). The sooner one
    // wins, except that a change here puts a full round off until the changes stop (later).
    want(kind, delay = 0, later) {
      const at = Date.now() + delay;
      if (kind === 'full' && this.timers.full && !later && this.fullAt <= at) return;
      clearTimeout(this.timers[kind]);
      if (kind === 'full') this.fullAt = at;
      this.timers[kind] = setTimeout(() => { this.timers[kind] = 0; this.round(kind); }, delay);
    },
    stopTimers() { clearTimeout(this.timers.full); clearTimeout(this.timers.send); this.timers = { full: 0, send: 0 }; this.firstChange = 0; this.carrying = false; },
    // A round, under the Web Lock: one tab per device at a time. If another tab holds it, this one tries again in a
    // moment (that tab's result reaches this one through the sync channel). One at a time in this tab, too: a round
    // asked for while one runs follows it.
    async round(kind = 'full') {
      if (!this.ready()) return;
      if (this.running) { if (kind === 'full' || !this.again) this.again = kind; return this.running; }
      // (a round that takes changes made here out: "Syncing…" until it has, also while it reads the folder or is put off)
      this.carrying = this.carrying || kind === 'send' || !!this.firstChange;
      if (kind === 'full') { clearTimeout(this.timers.full); this.timers.full = 0; this.firstChange = 0; }
      const run = this.running = (async () => {
        try {
          await this.locked(async lock => {
            if (!lock) { this.want(kind, this.waits.quiet); return; }
            let later = false;
            try { later = await this.roundLocked(kind) === 'later'; } finally { if (!later) this.carrying = false; }
          }, true);
        } catch (err) { console.warn('21Board: a Board Sync round didn’t finish', err); }
      })();
      this.redraw(true);
      try { await run; } finally {
        this.running = null;
        const next = this.again; this.again = null;
        if (next && this.ready()) this.want(next, 0);
        this.redraw(true);   // (after the next one is asked for: "Syncing…" doesn't blink between them)
      }
    },
    ready() { return !!(this.dir && this.perm === 'granted' && Store.loaded && !Store.lost && !Store.failed && !Writer.failing); },
    // Change… (or set-up) under way: the folder left being written to, or the new folder's board not decided or applied yet.
    switching() { return !!this.leaving || !!(this.sync && this.sync.mode); },

    // ---- a round (spec: SPEC §5.2)
    async roundLocked(kind) {
      const gen = this.gen;
      for (let i = 0; this.loading && i < 150; i++) await sleep(100);   // (an Import, a going back or an Undo: see swap)
      const settled = await Writer.settled(kind === 'send' ? 500 : 2000);
      if (!settled && kind === 'full') { this.want('full', this.waits.quiet); return 'later'; }   // (a change still being saved: the round follows it)
      for (let tries = 0; tries < 3; tries++) {
        if (gen !== this.gen || !this.ready()) return;
        if (await this.attempt(kind, gen) !== 'again') return;
      }
    },
    // Every record a round needs (board, windows, content, settings, the ledger), in one read. Photo records only
    // when their revision changed since they were last read (all of them in the first round of a session): they are big.
    async readLocal(all) {
      let recs, skipped = [];
      try { recs = await Store.getRange(['board:', 'inst:', 'data:', 'conf:', 'settings', 'link:']); }
      catch (err) { ({ recs, skipped } = await Store.readAll()); recs = recs.filter(r => !/^(media|devfile):/.test(r.key)); skipped = skipped.filter(k => !k.startsWith('media:')); }
      const keys = [];
      for (const [key, rev] of Known) if (key.startsWith('media:') && (all || (this.media.get(key) || {}).rev !== rev)) keys.push(key);
      for (const key of Array.from(this.media.keys())) if (!Known.has(key)) this.media.delete(key);
      for (const key of keys) {
        try { const r = (await Store.getMany([key]))[0]; if (r) this.media.set(key, r); else this.media.delete(key); }
        catch (err) { skipped.push(key); this.media.delete(key); }   // (a photo record that can't be read: left out of the file, see Merge.read)
      }
      recs = recs.concat(Array.from(this.media.values()));
      const by = new Map(recs.map(r => [r.key, r])), mines = recs.filter(r => r.key.startsWith('link:mine-') && r.value && r.value.uid).map(r => r.value);
      const sr = by.get(Keys.settings), sync = (by.get(Keys.link('sync')) || {}).value || null;
      return { recs: recs.filter(r => !r.key.startsWith('link:')), by, skipped, settings: Object.assign({}, DEFAULT_SETTINGS, (sr && sr.value) || {}), sync, ledger: Merge.ledger(sync, mines) };
    },
    // Board history keeps pages deleted while their Undo is offered entirely as they are: they aren't stamped or merged.
    undoPages(st, now) {
      const at = st.deletedAt || {};
      return new Set(Pages.gone(st).size ? Array.from(Pages.gone(st)).filter(b => { const age = now - num(at[b], 0); return age >= 0 && age < PAGE_UNDO_MS; }) : []);   // (a clock set back: not held for hours)
    },
    // (leaving: the last write to a folder this device leaves, Link.farewell. A page deleted while its Undo is offered goes
    // as deleted, or the folder left would never hear of it: Change… starts a new ledger for the next folder)
    local(r, now, leaving) {
      return Merge.read(r.recs, { settings: r.settings, skipped: r.skipped, holdPages: leaving ? [] : this.undoPages(r.settings, now), undoMs: leaving ? 0 : undefined, photoKeyOf: m => BoardHistory.photoKeyOf(m),
        scaleRect, bgColor, normalizePhotoSettings, accentOk: accentKeyOk, accentColorOk: accentOk, now, hcache: this.hcache });
    },
    // One go at a round. 'again': a record changed under it (its transaction aborted): run it again.
    async attempt(kind, gen, opts = {}) {
      const now = Date.now(), me = this.dev();
      if (kind === 'full') this.owed = false;
      const r = await this.readLocal(this.fresh);
      let sync = r.sync, ledger = r.ledger, send = kind === 'send';
      // (No ledger, but linked: the database lost it, see decide. A send round waits for the full round that decides.)
      if (!sync) sync = { v: 1, dev: me, mode: 'wait', first: true, linkAt: now, lost: true };
      if (sync.mode && send) return;
      // The other devices' files: in a full round, and always to decide the mode of a folder just linked. Not for
      // longer than LINK_ROUND_MS: a read that hangs never keeps this device's own changes from being written.
      const deadline = now + this.waits.round;
      let scanned = false;
      if (!send) {
        try { await within(this.scan(), this.waits.round); scanned = true; if (this.trouble && this.trouble.kind === 'missing') this.trouble = null; }
        catch (err) {
          if (gen !== this.gen) return;
          if (err.name === 'TimeoutError') send = true;
          else { if (await this.codeOf(err) !== 'allow') this.lost(); this.redraw(true); if (sync.mode) return; send = true; }
        }
      }
      let mode = sync.mode || null;
      if (mode === 'wait') {
        if (!scanned) return;
        const d = await this.decide(sync, r, now);
        if (d.mode === 'wait') { this.linked = { mode: 'wait' }; this.noteNewer(); this.redraw(true); return; }
        mode = d.mode; ledger = d.ledger; sync = d.sync;
      }
      // (A mode decided but not yet applied, until someone stops using the board, or the page shown is left.)
      if (mode && (send || this.gate())) { this.want('full', this.waits.quiet); return; }
      this.fresh = false;
      // Stamp: what changed here since the last round (not in take: this device's pages aren't the board's).
      const local = this.local(r, now, !!opts.left), dropHere = new Set(mode === 'take' ? [] : sync.dropHere || []);
      let st = { ledger, ctr: sync.ctr || 0, fixes: [], partsChanged: false };
      if (mode !== 'take') st = Merge.stamp(ledger, local, { dev: me, ctr: sync.ctr || 0, maxSeen: sync.maxSeen || 0, first: !!sync.first, now, dropHere, mode });
      const fixes = { writes: (st.fixes || []).map(f => Object.assign({ type: Keys.parse(f.key).kind }, f)), ifRev: this.ifRevOf(r, st.fixes || []), settings: st.settings ? stored => Merge.patchSettings(stored, st.settings) : null };
      // (the theme, accent and text style's versions are in link:sync: the stamp's, see Merge.stamp)
      sync = Object.assign({}, sync, { ctr: st.ctr }, (st.ledger.sync || {}).style ? { style: st.ledger.sync.style } : {}, st.partsChanged ? { localAt: now } : {});
      // (Two devices that each set up a folder "first" at once gave it two ids: every device takes the smaller one.)
      for (const f of Object.values(this.good())) if (f.folder && sync.folder && f.folder < sync.folder) sync.folder = f.folder;
      ledger = Object.assign({}, st.ledger, { sync });
      this.noteFiles(sync, now);
      // A send round, or someone is using the board (a gesture, a dialog, a menu): this device's changes go, nothing
      // comes in. (The round runs again at the next look.)
      if (send || this.gate()) {
        const done = await this.commit(gen, r, fixes, ledger, sync, false, now);
        if (done === 'again' || !done) return done;
        if (!send) this.owed = true;   // (the merge waits for the next look)
        return this.afterRound(this.afterOf(r, done), { send: true, urgent: kind === 'send', left: opts.left });
      }
      // Merge: each other device's newest file that isn't older than the one merged, and in a first round this
      // device's own (§3.5); a file another install wrote under this device's id (cloneOf) too.
      const peers = [], files = this.good(), own = files[me], merging = [];
      for (const [d, f] of Object.entries(files)) {
        if (d === me) continue;
        const was = (sync.peers || {})[d] || {};
        if (f.seq >= (was.seq || 0)) { peers.push(f.peer); merging.push(f); }
      }
      if (sync.first && own) peers.push(own.peer);
      const clone = this.cloneOf(sync, me);
      if (clone) peers.push(clone.peer);
      const idle = d => { const p = (sync.peers || {})[d] || {}; return !!p.left || now - (p.changedAt || 0) >= this.waits.idle; };
      const state = Merge.join(ledger, peers, { dev: me, now, idle, left: d => !!((sync.peers || {})[d] || {}).left, mode, first: !!sync.first, aheadMax: LINK_AHEAD_MS,
        isLater: id => (getWidget(id) || {}).clash === 'later' });
      // (A page deleted here whose Undo is still offered, and that the folder's board has but the ledger doesn't, such as
      // this device's own page in a folder it switches back to: the mode waits until that Undo is over. A held page is
      // neither stamped nor merged, and this device's own file, which may hold its latest version, is merged only in
      // the round that applies the mode.)
      if (mode && Array.from(local.pages.values()).some(P => P.held && !P.gone && state.pages.has(P.uid) && !ledger.mine[P.uid])) { this.want('full', this.waits.quiet); return; }
      const photos = await this.photosFor(r, state, local, merging, deadline);
      const hmax = await BoardHistory.maxBoard().catch(() => 0);
      const T = Date.now(), histFailed = new Set();
      const planOf = () => Merge.plan(state, local, ledger, { dev: me, now: T, mode, holds: this.holds(r, local), place: (uid, rect, near) => placeCopy(uid, rect, near), zTop: uid => zTop(uid),
        freeIds: this.freeIds(r, hmax), isSingle: id => !!(getWidget(id) || {}).single, isLater: id => (getWidget(id) || {}).clash === 'later', names: this.names(), pageShown: S.board.uid,
        photos, histFailed, dropHere });
      let plan = planOf();
      // Board history keeps a version of each page first, where it must (BoardHistory.beforeMerge).
      const pages = {};
      for (const [uid, p] of Object.entries(plan.summary.pages)) if ((p.changed || p.deleted) && !p.added && !p.placeholder) pages[uid] = p;
      const hist = {};
      if (Object.keys(pages).length) {
        const names = andList(plan.summary.from.map(d => this.names()[d] || 'another device')) || 'another device';   // (never "Before changes from ")
        // (switching between two folders with the same name, as set-up suggests "21Board": the label names the board's device)
        // (a take's own page shown then, removed here at the next round, is labelled as the switch too)
        const top = Object.values(files).filter(f => f.dev !== me).sort((a, b) => b.at - a.at)[0];
        const switching = mode === 'take' || Object.values(pages).every(p => p.here);
        const label = mode === 'join' ? `Before joining “${this.dir.name}”` : switching ? (sync.other && sync.other === this.dir.name && top && top.devName ? `Before switching to the board from ${top.devName}` : `Before switching to “${this.dir.name}”`)
          : `Before changes from ${names}`;
        const histOf = {};
        for (const uid of Object.keys(pages)) histOf[uid] = (ledger.mine[uid] || {}).hist || null;
        // (its own time limit, not what is left of the round's: a page whose version isn't saved in time is held, as one
        // that failed is, since that version is the only place the values it replaces would be kept)
        let res = {};
        try { res = await within(BoardHistory.beforeMerge(pages, label, histOf), HIST.mergeTimeout + 2000) || {}; }
        catch (e) { res = Object.fromEntries(Object.keys(pages).map(u => [u, 'failed'])); }
        for (const [uid, x] of Object.entries(res)) { if (x === 'failed') histFailed.add(uid); hist[uid] = x; }
        this.histWait.clear();
        for (const uid of histFailed) this.histWait.set(uid, { name: (Array.from(Pages.info.values()).find(i => i.uid === uid) || pages[uid]).name, from: names });   // (the page as it is called here)
        if (histFailed.size) plan = planOf();
      }
      // Board history may have taken seconds: someone may be using the board now.
      if (this.gate() || this.busyChanged(r, plan)) {
        if (mode) { this.want('full', this.waits.quiet); return; }
        const done = await this.commit(gen, r, fixes, ledger, sync, false, T);
        if (done && done !== 'again') { this.owed = true; return this.afterRound(this.afterOf(r, done), { send: true }); }
        return done;
      }
      // The ledger after the merge (plan.next), the peers' bookkeeping, the mode applied.
      const next = { sync, mine: Object.assign({}, plan.next.mine) };
      for (const [uid, x] of Object.entries(hist)) if (x === 'saved' && next.mine[uid]) next.mine[uid] = Object.assign({}, next.mine[uid], { hist: { at: T, local: false } });
      const merged = Object.assign({}, sync.peers);
      for (const [d, p] of Object.entries((plan.sync && plan.sync.peers) || {})) merged[d] = Object.assign({}, merged[d], p);
      for (const f of merging) merged[f.dev] = Object.assign({}, merged[f.dev], { seq: f.seq, name: f.devName, file: f.name, at: f.at, left: f.left, missingSince: 0, folder: f.folder });
      const heldShown = plan.summary.leave === S.board.uid;
      // (the mode is applied: from now on the board here is the folder's, and rounds stamp as usual. What a take still has
      // to do is remove this device's own page shown here, once another page is shown: dropHere)
      const drop = plan.summary.dropHere || [];
      sync = Object.assign({}, sync, plan.sync || {}, { peers: merged, ctr: Math.max(st.ctr, (plan.sync || {}).ctr || 0) },
        { mode: null, first: false, lost: false, linking: null, dropHere: drop.length ? drop : null });
      if (plan.sync && plan.sync.maxSeen) sync.maxSeen = Math.max(sync.maxSeen || 0, Math.min(plan.sync.maxSeen, now + LINK_AHEAD_MS));
      if (plan.summary.from.length && plan.writes.length) { const d = plan.summary.from[0]; sync.last = { dev: d, name: (files[d] || {}).devName || this.names()[d] || '', at: now }; }
      next.sync = sync;
      const seed = {};
      for (const w of plan.writes) seed[w.key] = r.by.get(w.key) || null;   // (the Undo's: the records as they were)
      const done = await this.commit(gen, r, plan, next, sync, true, T);
      if (done === 'again' || !done) return done;
      // (held back this round: a window being typed in, a photo not here yet, Board history full, a copy waiting for its
      // device: the next look runs a round again)
      if (plan.summary.held || histFailed.size || this.waiting.size) this.owed = true;
      for (const x of done.written) if (x.key.startsWith('media:')) { if (x.deleted) this.media.delete(x.key); else this.media.set(x.key, x); }
      if (this.waits.afterCommit === 'stop') return;   // (tests: as if 21Board closed here)
      // Show it: this tab, the other tabs, the pages deleted or brought back, the message.
      const keys = done.written.map(x => x.key);
      if (keys.length) {
        applyMerged(keys, done.written.map(x => (x.deleted ? null : x)));
        Sync.announce(keys);
        const gone = Object.values(plan.summary.pages).filter(p => p.deleted);
        if (gone.length) Pages.goneByMerge(gone.map(p => p.b), Object.fromEntries(gone.filter(p => !p.here).map(p => [p.b, p.at])));
        const back = Object.values(plan.summary.pages).filter(p => p.back).map(p => p.b);
        if (back.length) Pages.backByMerge(back);
        // (Not the round that applies set-up's mode: its last step says what it did.)
        if (!(mode && this.welcoming)) {
          // (a theme, accent or text style chosen in this tab while the round ran, not stored yet when it was saved: this
          // tab shows that, not the merge's, and the next round takes it to the other devices. It isn't said.)
          const was = (r.by.get(Keys.settings) || {}).value || {};
          const style = (plan.summary.style || []).map(x => Object.fromEntries(Object.entries(x).filter(([k]) => k === 'by' || S.settings[k + 'At'] === was[k + 'At']))).filter(x => Merge.STYLE_PARTS.some(k => k in x));
          try { MergeUI.shown(Object.assign({}, plan.summary, { style }), { at: now, from: plan.summary.from, ops: done.written.filter(x => Keys.parse(x.key).board === S.boardId).map(x => ({ key: x.key, rev: x.rev || 0, prev: seed[x.key] })), swaps: plan.undo.swaps, skip: plan.undo.skip }); }
          catch (err) { console.warn('21Board: the merge message couldn’t be shown', err); }
        }
      }
      for (const [uid, L] of Object.entries(next.mine)) this.quiet[uid] = L.quiet || null;
      if (mode) { this.linked = this.linkedSay(mode, sync, st.ledger); this.welcoming = false; }
      if (clone) await this.fork();
      const after = await this.afterRound(this.afterOf(r, done), { urgent: !!mode || !!clone || this.urgent, mode });
      // The page shown was deleted (or was a placeholder the board replaces): another page is shown first, then a
      // round deletes it. (Not from inside the round: going to a page waits for rounds, and its widgets save.)
      if (heldShown && gen === this.gen) {
        const ids = Pages.ids(), uid = S.board.uid, i = ids.indexOf(S.boardId);
        const to = ids.find((b, k) => k > i && (Pages.info.get(b) || {}).uid !== uid) || ids.find(b => b !== S.boardId);
        if (to) setTimeout(async () => { if (S.board.uid === uid && await Pages.go(to, { quiet: true })) { MergeUI.left = uid; this.want('full', 0); } }, 0);   // (MergeUI: its Undo goes back to it)
      }
      return after;
    },
    // A folder was just linked (link:sync.mode 'wait'), or the ledger was lost: what to do, from the first look
    // that sees the folder. carry: it is the ledger's folder (the same handle, or a device file there has the
    // ledger's folder id): the ledger carries on. seed: no device file: a new folder id, and this board goes there.
    // join: a board is there and this device never synced (decision 4: its pages are added). take: a board is
    // there and this device has only the untouched placeholder, or synced with another folder (decision 6: it
    // shows that board; its pages stay in the other folder and under Deleted pages). wait: device files there
    // can't be read yet (for up to LINK_ARRIVE_MS): nothing is merged or written, so a slow Drive can't turn a take
    // into a seed and combine two boards. Returns {mode, ledger, sync}.
    async decide(sync, r, now) {
      const files = this.good(), me = this.dev(), all = Object.values(files), others = all.filter(f => f.dev !== me);
      const arriving = Array.from(this.files.values()).filter(f => f.bad && f.devish && !f.peer);
      const waited = now - (sync.linkAt || now) >= this.waits.arrive;
      if (arriving.length && !waited) return { mode: 'wait' };
      // (a file from a newer 21Board: there is a board here, which this release can't read. Nothing is decided, or a seed
      // would combine two boards; the status says to update)
      if (Array.from(this.files.values()).some(f => f.newer)) return { mode: 'wait' };
      const keep = { v: 1, dev: me, ctr: sync.ctr || 0, maxSeen: sync.maxSeen || 0, seq: Math.max(sync.seq || 0, this.ownSeq(me)), writes: sync.writes || [], wseqs: sync.wseqs || [], peers: sync.peers || {},
        dir: this.dir, folderName: this.dir.name, first: true, linkAt: sync.linkAt || now, other: null, switched: false };
      const ids = all.map(f => f.folder).filter(Boolean).sort();
      // (A new ledger keeps this device's counters, never another folder's devices: they would hold its deletions back.)
      const fresh = (mode, extra) => { const s = Object.assign({}, keep, { mode, folder: ids[0] || randomId(12), peers: {}, file: null, sum: null, partsH: null, last: null, gcAt: 0, refs: {} }, extra); return { mode, ledger: Merge.ledger(s, []), sync: s }; };
      const has = Object.keys(r.ledger.mine).length > 0;
      // The ledger lost (the database thrown away under an open board): rebuilt from this device's own file.
      if (sync.lost && files[me]) {
        const own = files[me], rebuilt = Merge.rebuild(own.peer, { dev: me, now });
        const s = Object.assign({}, rebuilt.sync, keep, { mode: 'carry', folder: own.folder, ctr: Math.max(keep.ctr, num(rebuilt.sync && rebuilt.sync.ctr, 0)), seq: Math.max(keep.seq, own.seq), writes: [own.write], wseqs: [own.seq], file: own.name,
          peers: Object.fromEntries(Object.entries(own.merged).map(([d, q]) => [d, { seq: num(q, 0) }])) });
        return { mode: 'carry', ledger: Merge.ledger(s, Object.values(rebuilt.mine)), sync: s };
      }
      let same = false;
      try { same = !!sync.dir && typeof this.dir.isSameEntry === 'function' && await this.dir.isSameEntry(sync.dir); } catch (e) { /* not comparable */ }
      if (sync.folder && has && (same || ids.includes(sync.folder))) return { mode: 'carry', ledger: r.ledger, sync: Object.assign({}, sync, keep, { mode: 'carry', folder: sync.folder }) };
      if (!all.length) return fresh('seed', { folder: randomId(12) });
      // (Has this device only the untouched placeholder? Stamped with an empty ledger, nothing is in it.)
      const trial = Merge.stamp(Merge.ledger(null, []), this.local(r, now), { dev: me, ctr: 0, maxSeen: 0, first: true, now });
      const placeholder = !Object.values(trial.ledger.mine).some(p => !p.gone);
      if (!has || sync.lost) return placeholder ? fresh('take') : fresh('join');
      // (pages shown here that the folder left has as deleted, such as one brought back by its Undo after Unlink: they
      // aren't "still in" that folder, and the last step says so)
      const shown = Array.from(this.local(r, now).pages.values()).filter(P => !P.gone && !P.held && !P.placeholder);
      const goneThere = shown.filter(P => (r.ledger.mine[P.uid] || {}).gone).map(P => P.parts.name.val || 'Page');
      return fresh('take', Object.assign({ other: sync.folderName || null, switched: true }, goneThere.length ? { goneThere, keptThere: shown.length - goneThere.length } : {}));
    },
    // What the set-up's last step says the first round did (see welcome).
    linkedSay(mode, sync, stamped) {
      const others = Object.values(this.good()).filter(f => f.dev !== this.dev()).sort((a, b) => b.at - a.at), top = others[0];
      const mine = Object.keys(stamped.mine || {}).filter(uid => !stamped.mine[uid].gone);
      const theirs = new Set(others.flatMap(f => (f.uids || []).concat(f.peer ? Array.from(f.peer.gone.pages.keys()) : [])));   // (and pages the folder deleted)
      return { mode, from: top ? top.devName || 'another device' : '', pages: top ? top.pages : 0, empty: !mine.length,
        added: mode === 'join' ? mine.filter(uid => !theirs.has(uid)).length : 0, other: sync.other || null, switched: !!sync.switched, goneThere: sync.goneThere || [], keptThere: sync.keptThere || 0 };
    },
    // Notes what this look found of each device (for the status and the idle test): its name, when it last
    // changed (this device's clock), whether it left, whether its file is missing.
    noteFiles(sync, now) {
      const peers = Object.assign({}, sync.peers), files = this.good(), me = this.dev();
      for (const [d, f] of Object.entries(files)) {
        if (d === me) continue;
        const p = peers[d] = Object.assign({}, peers[d]);
        if (f.seq > (p.seen || 0)) { p.seen = f.seq; p.changedAt = now; }
        p.name = f.devName; p.file = f.name; p.at = f.at; p.left = f.left; p.missingSince = 0;
      }
      const present = new Set(Array.from(this.files.values(), f => f.dev).filter(Boolean));   // (a file still arriving isn't missing)
      for (const [d, p] of Object.entries(peers)) if (d !== me && !present.has(d) && !p.missingSince && this.checkedAt) peers[d] = Object.assign({}, p, { missingSince: now });
      sync.peers = peers;
      this.noteNewer();
    },
    // A device whose file is from a newer 21Board (the status and the note on the board say to update).
    noteNewer() {
      this.newer = null;
      for (const f of this.files.values()) if (f.newer) this.newer = f.devName || 'Another device';
    },
    // A file with this device's key that this device didn't write (its write id isn't one of the last 20 noted,
    // and it isn't older than they are): another install with a copy of this device's profile. Merged as a peer;
    // this device then takes a new id (see fork).
    cloneOf(sync, me) {
      const writes = sync.writes || [];
      if (!writes.length) return null;
      for (const f of this.files.values()) if (f.peer && f.dev === me && f.write && !writes.includes(f.write) && f.seq >= ((sync.wseqs || [])[0] || 0)) return f;
      return null;
    },
    // Both installs take a new id, so each writes a file of its own from now on. (What either wrote is merged.)
    async fork() {
      const d = this.device();
      console.warn('21Board: another install uses this device’s id; this one takes a new id');
      this.saveState({ device: Object.assign({}, d, { id: newId() }) });
      await this.noteSync(s => Object.assign(s, { forked: { dev: s.dev, writes: s.writes || [] }, dev: this.dev(), writes: [], wseqs: [], file: null }));
    },
    // The records after the round's transaction (step 1's, with its writes), for this device's file: never read
    // afresh, which could put a change made meanwhile, not stamped yet, in the file under an older version.
    afterOf(r, done) {
      const by = new Map(r.by);
      for (const w of done.written) { if (w.deleted) by.delete(w.key); else by.set(w.key, w); }
      const sr = by.get(Keys.settings);
      return { recs: Array.from(by.values()).filter(x => !x.key.startsWith('link:')), by, skipped: r.skipped,
        settings: Object.assign({}, DEFAULT_SETTINGS, (sr && sr.value) || {}), sync: done.sync, ledger: done.ledger };
    },
    // Someone is using the board: a gesture, a dialog, a window menu, the Pages menu, or a page change. (Not the
    // Widget Picker: it isn't anchored to a window.) A menu left open for LINK_HOLD_MS is closed.
    gate() {
      const menu = !!Menu.win || !!Pages.open;
      if (!menu) this.gateAt = 0;
      else if (!this.gateAt) this.gateAt = Date.now();
      else if (Date.now() - this.gateAt >= this.waits.hold) { Menu.close(); Pages.closeMenu(); this.gateAt = 0; }
      return !!(Inter.active || document.querySelector('#modal.open') || Menu.win || Pages.open || Pages.busy);
    },
    // Windows that keep this device's version this round (busy: being typed in, a show running), and pages held
    // whole (their Undo is offered). {pages: Set<page uid>, wins: Set<"<page id>:<ikey>">}.
    holds(r, local) {
      const now = Date.now(), wins = new Set(), uidOf = new Map(), pages = new Set(), gone = Pages.gone(r.settings), live = new Set();
      for (const rec of r.recs) { const k = Keys.parse(rec.key); if (k.kind === 'board' && rec.value) { uidOf.set(k.board, rec.value.uid); if (!gone.has(k.board)) live.add(rec.value.uid); } }
      // (not a uid a page that is here has too: Import › Replace all pages, whose old pages wait for their Undo)
      for (const b of this.undoPages(r.settings, now)) if (uidOf.get(b) && !live.has(uidOf.get(b))) pages.add(uidOf.get(b));
      for (const key of this.busyWins(r, now).keys()) { const k = Keys.parse(key); wins.add(`${k.board}:${k.ikey}`); }
      return { pages, wins, gate: false, photos: null };
    },
    busyWins(r, now) {
      const out = new Map(), uidOf = new Map(), pending = k => Writer.pending.has(k) || (Writer.running && Writer.batch.has(k));
      for (const rec of r.recs) { const k = Keys.parse(rec.key); if (k.kind === 'board' && rec.value) uidOf.set(k.board, rec.value.uid); }
      for (const rec of r.recs) {
        const k = Keys.parse(rec.key);
        if (k.kind !== 'inst' || !rec.value || !uidOf.get(k.board)) continue;
        const keys = ['inst', 'data', 'conf'].map(x => Keys[x](k.board, k.ikey)), w = k.board === S.boardId ? S.wins.get(k.ikey) : null;
        // (this tab's saves on a clock that never goes back; other tabs' by their time, but never counted from a time
        // ahead of now: a device clock set back an hour mustn't keep every window "being typed in" for an hour)
        const saved = w && w.lastSaveAt ? performance.now() - w.lastSaveAt : Infinity;
        const typed = keys.slice(1).some(key => { const x = r.by.get(key), age = x ? now - (x.updatedAt || 0) : -1; return x && !x.m && age >= 0 && age < this.waits.busy; });
        if (saved < this.waits.busy || (w && document.activeElement === w.iframe && saved < this.waits.focus) || typed || keys.some(pending)) {
          const wid = rec.value.wid || `${k.widgetId}@${num(rec.value.createdAt, 0)}`;
          out.set(rec.key, uidOf.get(k.board) + ' ' + wid);
        }
      }
      return out;
    },
    // A window the merge writes became busy while Board history saved: the merge waits for the next round.
    busyChanged(r, plan) {
      const busy = new Set(Array.from(this.busyWins(r, Date.now()).keys(), k => Keys.parse(k)).map(k => k.board + ':' + k.ikey));
      return plan.writes.some(w => { const k = Keys.parse(w.key); return /^(inst|data|conf)$/.test(k.kind) && busy.has(k.board + ':' + k.ikey); });
    },
    // New page ids and the lowest free window number of a widget on a page, for the plan.
    freeIds(r, hmax = 0) {
      let next = Math.max(1, +r.settings.lastBoard || 1, S.boardId, hmax || 0, ...Pages.info.keys(), ...Pages.gone(r.settings));
      for (const rec of r.recs) { const k = Keys.parse(rec.key); if (k.board > next) next = k.board; }
      for (const key of Known.keys()) { const k = Keys.parse(key); if (k.board > next) next = k.board; }
      const used = new Set(r.recs.filter(x => Keys.parse(x.key).kind === 'inst').map(x => x.key));
      return {
        board: () => ++next,
        inst: (b, widgetId, taken, want) => {
          const free = n => !used.has(Keys.inst(b, `${widgetId}:${n}`)) && !(taken && taken.has(`${widgetId}:${n}`));
          if (want && free(want)) return want;
          let n = 1; while (!free(n)) n++;
          return n;
        }
      };
    },
    ifRevOf(r, writes) { const out = {}; for (const w of writes) out[w.key] = ((r.by.get(w.key) || {}).rev) || 0; return out; },
    // The pictures for pages whose winning photo is another device's (Merge.photosWanted), each read from Photos:
    // {page uid: picture, or null while it isn't here or isn't good (that part is held, and the page keeps its photo)}.
    async photosFor(r, state, local, files, deadline) {
      const out = {}, have = new Map(), now = Date.now(), live = new Set();
      for (const rec of r.recs) { const k = Keys.parse(rec.key); if (k.kind === 'board' && rec.value) have.set(rec.value.uid, BoardHistory.photoKeyOf(validPhoto((r.by.get(Keys.media(k.board, 'background')) || {}).value) ? r.by.get(Keys.media(k.board, 'background')).value : null)); }
      const wanted = typeof Merge.photosWanted === 'function' ? Merge.photosWanted(state, local).filter(x => x.ref)
        : files.flatMap(f => f.refs || []).filter(x => have.get(x.uid) !== BoardHistory.photoKeyOf(x.ref));
      for (const { uid, ref } of wanted) {
        const key = BoardHistory.photoKeyOf(ref);
        if (uid in out) continue;
        let m = null;
        // (each read has a time limit of its own, LINK_READ_MS, so one that stalls can't use up the round; one that timed
        // out isn't read again until LINK_REREAD_MS later, as a photo found not good isn't)
        const slow = this.slowPhotos.get(ref.file);
        if (Date.now() < deadline && !(slow && Date.now() - slow < this.waits.reread)) {
          try { m = await within(this.photoFor(ref), Math.max(500, Math.min(this.waits.read, deadline - Date.now()))); this.slowPhotos.delete(ref.file); }
          catch (e) { m = null; if (e && e.name === 'TimeoutError') this.slowPhotos.set(ref.file, Date.now()); }
        }
        out[uid] = m && BoardHistory.photoKeyOf(m) === key ? m : null;
        if (!out[uid]) {
          live.add(ref.file);
          if (!this.waiting.has(ref.file)) this.waiting.set(ref.file, { since: now, uid, page: (Array.from(Pages.info.values()).find(i => i.uid === uid) || {}).name || '' });
        }
      }
      for (const f of Array.from(this.waiting.keys())) if (!live.has(f)) this.waiting.delete(f);
      return out;
    },
    async photoFor(ref) {
      if (this.got.has(ref.file)) return this.got.get(ref.file);
      for (const [data, f] of this.prints) if (f.file === ref.file) return { data, w: f.w, h: f.h, bytes: f.size, name: ref.name, addedAt: ref.addedAt || Date.now() };
      const m = await this.readPhoto(ref);
      if (m) { this.got.set(ref.file, m); while (this.got.size > 4) this.got.delete(this.got.keys().next().value); }
      return m;
    },
    // The round's transaction (spec §5.4): the merge's records (only if none changed since they were read, and
    // Erase or Unlink didn't happen meanwhile), the settings patch, the ledger and link:sync. All or nothing.
    // Returns {written, sync, ledger}, 'again' (a record changed: run the round again) or null (it failed).
    async commit(gen, r, plan, next, sync, full, T = Date.now(), dels = new Set()) {
      const writes = plan.writes || [], skey = Keys.link('sync');
      const mine = Object.values(next.mine || {}), before = new Map(Object.entries(r.ledger.mine || {}));
      const puts = mine.filter(L => !sameJSON(before.get(L.uid), L));
      for (const uid of before.keys()) if (!(next.mine || {})[uid]) dels.add(uid);
      // (nothing to write, and link:sync as it is stored: no transaction, nothing told to the other tabs)
      const sv0 = this.keepable(Object.assign({}, sync, { v: 1, dev: this.dev() })), st0 = (r.by.get(Keys.settings) || {}).value || {};
      if (!writes.length && !puts.length && !dels.size && r.sync && sameJSON(sv0, r.sync) && (typeof plan.settings !== 'function' || sameJSON(plan.settings(st0), st0))) {
        if (gen !== this.gen) return null;
        return { written: [], sync: r.sync, ledger: Merge.ledger(r.sync, Object.values(next.mine || {})) };
      }
      if (writes.length) this.writing = true;
      let stale = false, written = [], srec = null;
      try {
        srec = await Store.tx('readwrite', (s, set) => {
          const want = writes.map(w => w.key).concat([Keys.settings, skey]), cur = {};
          let left = want.length;
          const go = () => {
            if (gen !== this.gen) { stale = 'gone'; s.transaction.abort(); return; }
            for (const w of writes) if ((((cur[w.key] || {}).rev) || 0) !== ((plan.ifRev || {})[w.key] || 0)) { stale = true; s.transaction.abort(); return; }
            // (the theme, accent or text style chosen here, in another tab or by an Import, since the round read the
            // settings: the merge's value would replace a later choice for good. The round runs again, and the later one wins.)
            const sset = (plan.settingsPatch && plan.settingsPatch.set) || {}, was = ((r.by.get(Keys.settings) || {}).value) || {}, now0 = ((cur[Keys.settings] || {}).value) || {};
            if (Merge.STYLE_PARTS.some(k => k in sset && (now0[k] !== was[k] || now0[k + 'At'] !== was[k + 'At']))) { stale = true; s.transaction.abort(); return; }
            const out = [];
            for (const w of writes) {
              if (w.del) { if (cur[w.key]) { s.delete(w.key); out.push({ key: w.key, deleted: true }); } continue; }
              const rec = { key: w.key, type: w.type, rev: Math.max(((cur[w.key] && cur[w.key].rev) || 0) + 1, T), updatedAt: T, by: TAB_ID, m: 1, value: w.value };
              s.put(rec); out.push(rec);
            }
            if (typeof plan.settings === 'function') {   // (a patch: only boards, deletedBoards, deletedAt, lastBoard, theme, accent, accentColor and letters)
              const st = cur[Keys.settings] || { key: Keys.settings, type: 'settings', rev: 0, value: {} }, value = plan.settings(st.value || {});
              if (value && !sameJSON(value, st.value || {})) {
                const rec = { key: Keys.settings, type: 'settings', rev: Math.max((st.rev || 0) + 1, T), updatedAt: T, by: TAB_ID, m: 1, value };
                s.put(rec); out.push(rec);
              }
            }
            for (const L of puts) s.put({ key: 'link:mine-' + L.uid, type: 'link', rev: T, updatedAt: T, by: TAB_ID, value: L });
            for (const uid of dels) s.delete('link:mine-' + uid);
            const sv = this.keepable(Object.assign({}, sync, { v: 1, dev: this.dev() }));
            const rec = { key: skey, type: 'link', rev: Math.max((((cur[skey] || {}).rev) || 0) + 1, T), updatedAt: T, by: TAB_ID, value: sv };
            s.put(rec);
            written = out;
            set(rec);
          };
          for (const k of want) { const q = s.get(k); q.onsuccess = () => { cur[k] = q.result; if (--left === 0) go(); }; }
        });
      } catch (err) {
        if (stale === true) return 'again';
        if (stale !== 'gone') console.warn('21Board: a Board Sync round couldn’t be saved', err);
        return null;
      } finally { this.writing = false; }
      if (!srec) return null;
      Known.set(skey, srec.rev); this.sync = srec.value;
      Sync.announce([skey]);
      return { written, sync: srec.value, ledger: Merge.ledger(srec.value, Object.values(next.mine || {})) };
    },
    // After the transaction: this device's file is written if its parts changed (at most every LINK_GAP_MS, at once
    // in a send round, after an Undo and at set-up), then the daily tidying.
    async afterRound(after, opts = {}) {
      const urgent = !!opts.urgent || !!this.urgent;
      this.urgent = false;
      await this.writeOwn(after, after.ledger, { urgent, mode: opts.mode, left: opts.left });
      if (!opts.send) await this.daily(after);
      this.redraw(true);
      return true;
    },
    // ---- writing this device's file (spec §6.1)
    // opts.urgent: not held back by LINK_GAP_MS. opts.left: Unlink's or Erase's last write.
    async writeOwn(r, ledger, opts = {}) {
      const sync = r.sync || this.sync;
      if (!sync || sync.mode || !this.dir) return;
      const me = this.dev(), now = Date.now(), local = this.local(r, now, !!opts.left), name = this.fileName(this.wideName(me));
      const own = this.ownCheck(sync, me, name);
      const meta = { dev: me, folder: sync.folder, name: this.device().label, seq: sync.seq || 0, write: '', at: now, merged: this.mergedOf(sync, me), left: opts.left || null,
        refs: this.byPhoto(this.refsOf(ledger)), skipped: r.skipped, generator: `21Board ${RELEASE}` };   // (the theme, accent and text style: Merge.read's, from r.settings)
      const trial = Merge.encode(ledger, local, meta);
      const empty = !Object.values(ledger.mine || {}).length;
      if (empty && !own.exists) return;   // (only the untouched placeholder: nothing to write yet)
      if (trial.partsH === sync.partsH && own.ok && sync.file === name && !opts.left) { this.unstuck(); return; }
      // (Not before LINK_GAP_MS since the last write, or LINK_RETRY_MS since one failed. A clock set back counts as time passed.)
      const since = now - (sync.wroteAt || 0), failedAgo = this.failed ? now - this.failed.at : Infinity;
      if (!opts.urgent && !opts.left && since >= 0 && since < this.waits.gap) { this.want('send', this.waits.gap - since); return; }
      if (!opts.urgent && !opts.left && failedAgo >= 0 && failedAgo < this.waits.retry) { this.unsent = true; return; }
      const gen = this.gen;
      try {
        // A new sequence number and write id, noted before the file is written: a crash in between can't look
        // like another install writing this device's file (see cloneOf).
        const seq = Math.max((sync.seq || 0) + 1, this.ownSeq(me) + 1, Date.now()), write = randomId(8);
        await this.noteSync(s => Object.assign(s, { seq, writes: (s.writes || []).concat(write).slice(-20), wseqs: (s.wseqs || []).concat(seq).slice(-20) }), gen);
        if (gen !== this.gen) return;
        const refs = await this.putPhotos(r, ledger);   // (photos first: no file names a photo that isn't there)
        const { obj, partsH } = Merge.encode(ledger, local, Object.assign(meta, { seq, write, at: Date.now(), refs: this.byPhoto(refs) }));
        obj.sync.sum = '';
        obj.sync.sum = await this.digest(new TextEncoder().encode(Merge.sumText(obj)));
        const text = JSON.stringify(obj);
        if (text.length > this.waits.maxFile) throw Object.assign(new Error('The board is too big to sync'), { code: 'big' });
        this.big = text.length > this.waits.bigFile ? text.length : 0;
        this.writing = true;
        try { await this.writeFile(name, text); } finally { this.writing = false; }
        let stamp = null;
        try { const f = await (await this.dir.getFileHandle(name)).getFile(); stamp = { size: f.size, lastModified: f.lastModified }; } catch (e) { /* read at the next look */ }
        await this.noteSync(s => Object.assign(s, { file: name, sum: obj.sync.sum, partsH, wroteAt: Date.now(), left: opts.left || null, refs }), gen);
        await this.noteGone(ledger, seq, gen);
        // (So that the next look doesn't read it back as news.)
        const dec = Merge.decode(obj, { UID_RE, PHOTO_FILE_RE, accentOk: accentKeyOk, accentColorOk: accentOk });
        this.files.set(name, Object.assign({ name, readAt: Date.now(), dev: me, devName: this.device().label, seq, at: obj.sync.at, folder: sync.folder, left: opts.left || null, write,
          merged: obj.sync.merged, peer: (dec && dec.peer) || null, refs: [], pages: 0 }, stamp || { size: -1, lastModified: -1 }));
        this.unstuck();
        updateSettings({ lastBackupAt: Date.now() }, true);   // (the device file is a full backup too)
        await this.tidyOwn(name, me, ledger);
      } catch (err) {
        if (gen !== this.gen || !this.dir) return;
        console.warn('21Board: this device’s file couldn’t be written', err);
        const code = await this.codeOf(err);
        this.failed = { at: Date.now(), code }; this.unsent = true;
        if (code === 'missing') this.lost();
        else if (code !== 'allow') this.stuck(code);
        this.redraw();
      }
    },
    // A name that another device's file already has (two devices called "laptop" with the same first id characters):
    // this device's file uses 8 id characters.
    wideName(me) {
      const n = this.fileName().toLowerCase();
      for (const f of this.files.values()) if (f.name.toLowerCase() === n && f.dev && f.dev !== me) return true;
      return false;
    },
    // Does this device's own file need writing? Missing, not the last one written (Drive put an older one back),
    // or its checksum failed.
    ownCheck(sync, me, name) {
      const f = this.files.get(sync.file || name);
      const exists = !!f;
      const ok = !!f && !f.bad && (!f.write || !sync.writes || !sync.writes.length || f.write === sync.writes[sync.writes.length - 1]) && f.dev === me;
      return { exists, ok };
    },
    // The highest sequence number of this device's files in the folder: a new ledger never goes below it.
    ownSeq(me) { let n = 0; for (const f of this.files.values()) if (f.dev === me && f.seq > n) n = f.seq; return n; },
    mergedOf(sync, me) {
      const out = {};
      for (const [d, p] of Object.entries(sync.peers || {})) if (d !== me && p && p.seq) out[d] = p.seq;
      return out;
    },
    refsOf(ledger) { return Object.assign({}, (ledger.sync || this.sync || {}).refs || {}); },
    // The same refs by photo (Merge.encode names each page's photo by its key), as the file has them.
    byPhoto(refs) {
      const out = {};
      for (const x of Object.values(refs)) if (x && x.key) out[x.key] = { file: x.file, w: x.w, h: x.h, bytes: x.bytes, name: x.name, addedAt: x.addedAt };
      return out;
    },
    // Deletions this write carried for the first time get its seq: a tombstone is collected only once every device's
    // file shows it, or has merged this seq (Merge.gc). Under the lock, like the round that made them.
    async noteGone(ledger, seq, gen) {
      const uids = Object.keys(ledger.mine || {}).filter(uid => { const M = ledger.mine[uid]; return (M.gone && M.gone.seq == null) || Object.values(M.wgone || {}).some(T => T.seq == null); });
      if (!uids.length) return;
      await Store.tx('readwrite', s => {
        for (const uid of uids) {
          const key = 'link:mine-' + uid, g = s.get(key), M0 = ledger.mine[uid];
          g.onsuccess = () => {
            const rec = g.result, M = rec && rec.value;
            if (gen !== this.gen || !M) return;
            const out = Object.assign({}, M, { wgone: Object.assign({}, M.wgone) });
            let changed = false;
            if (M.gone && M.gone.seq == null && M0.gone && sameJSON(M.gone.exists, M0.gone.exists)) { out.gone = Object.assign({}, M.gone, { seq }); changed = true; }
            for (const [wid, T] of Object.entries(M.wgone || {})) {
              const T0 = (M0.wgone || {})[wid];
              if (T.seq == null && T0 && sameJSON(T.exists, T0.exists)) { out.wgone[wid] = Object.assign({}, T, { seq }); changed = true; }
            }
            if (changed) s.put(Object.assign({}, rec, { value: out }));
          };
        }
      });
    },
    // Each page's photo in Photos (written there if it isn't, see putPhoto): {page uid: its ref}.
    async putPhotos(r, ledger) {
      const refs = {}, had = this.refsOf(ledger);
      for (const rec of r.recs) {
        const k = Keys.parse(rec.key);
        if (k.kind !== 'board' || !rec.value || !(ledger.mine || {})[rec.value.uid]) continue;
        const m = (r.by.get(Keys.media(k.board, 'background')) || {}).value;
        if (!validPhoto(m)) continue;
        const key = BoardHistory.photoKeyOf(m), was = had[rec.value.uid];
        refs[rec.value.uid] = was && was.key === key && !this.reput ? was : Object.assign(await this.putPhoto(m), { key });
      }
      this.reput = false;
      return refs;
    },
    // After a write: the file this device used before (it was renamed) goes, and so do Drive's copies of this
    // device's file once everything in them is in the ledger.
    async tidyOwn(name, me, ledger) {
      const was = (this.sync && this.sync.forked) || {};   // (the id this device had before a fork: its own old files go too)
      for (const f of Array.from(this.files.values())) {
        if (f.name === name || !(f.dev === me || (f.dev === was.dev && (was.writes || []).includes(f.write)))) continue;
        if (!f.peer ? !f.write || !(this.sync.writes || []).includes(f.write) : !Merge.includes(ledger, f.peer)) continue;
        try { await this.dir.removeEntry(f.name); this.files.delete(f.name); } catch (e) { /* gone already */ }
      }
    },
    // At most once a day, after a full round: old device files, deletions everyone has seen, Photos.
    async daily(r) {
      const now = Date.now(), sync = this.sync;
      if (!sync || sync.mode) return;
      this.dailyAt = now;
      // A device that left (Unlink, Erase) LINK_DEVICE_KEEP_MS ago, and whose file holds nothing this one lacks.
      for (const f of Array.from(this.files.values())) {
        if (!f.peer || f.dev === this.dev() || !f.left || now - num(f.left.at, now) < this.waits.keep) continue;
        if (!Merge.includes(r.ledger, f.peer)) continue;
        // (only the file as it was read: one written anew since, by a device that linked again, say, is read first)
        try {
          const now2 = await within((await this.dir.getFileHandle(f.name)).getFile(), this.waits.read);
          if (now2.size !== f.size || now2.lastModified !== f.lastModified) continue;
          await this.dir.removeEntry(f.name); this.files.delete(f.name);
        } catch (e) { /* gone already, or not readable now: looked at again at the next round */ }
      }
      if (now - (sync.gcAt || 0) >= 20 * 36e5 && !Array.from(this.files.values()).some(f => f.bad)) {
        const files = new Set(Array.from(this.files.values(), f => f.dev).filter(Boolean));   // (the devices whose file is in the folder)
        const before = r.ledger, after = Merge.gc(before, Object.values(this.good()).map(f => f.peer), files, { now, dev: this.dev(), goneMs: this.waits.gone, peerGoneMs: LINK_PEER_GONE_MS });
        const next = Object.assign({}, sync, { gcAt: now, dropped: after.sync.dropped || {} });
        await this.commit(this.gen, r, { writes: [] }, { sync: next, mine: (after || before).mine }, next, false);
      }
      if (sync.file) await this.tidyOwn(sync.file, this.dev(), r.ledger);
      this.tidyPhotos();
    },

    // ---- background photos: "Photos/<fingerprint>.jpg", each photo once, named by its content
    // The first 32 hex digits of the SHA-256 of some bytes.
    async digest(buf) {
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)).slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
    },
    // A photo's file in Photos, and its size in bytes. Worked out once per photo (prints: the last few photos seen
    // here, by their data URL), not at every write.
    async photoName(m) {
      let f = this.prints.get(m.data);
      if (!f) {
        const buf = await (await fetch(m.data)).arrayBuffer(), type = /^data:image\/(jpeg|png|webp)/.exec(m.data.slice(0, 32))[1];
        f = { file: `${await this.digest(buf)}.${type === 'jpeg' ? 'jpg' : type}`, size: buf.byteLength, w: m.w, h: m.h };
      }
      this.print(m.data, f);
      return f;
    },
    print(data, f) {
      this.prints.delete(data); this.prints.set(data, f);
      while (this.prints.size > 4) this.prints.delete(this.prints.keys().next().value);
    },
    // Before a device file names a photo, the photo is in Photos: written if it isn't there, or isn't whole (it may
    // be arriving from a device that wrote the same photo), or if it is more than 3 days old and this device has
    // just started naming it (cleanup, tidyPhotos, leaves photos younger than a week alone: it can't take this one
    // before the file naming it arrives). Otherwise one look, and nothing written. Throws as a write does.
    async putPhoto(m) {
      if (this.tidying) await this.tidying;
      const f = await this.photoName(m), dir = await this.dir.getDirectoryHandle(LINK_PHOTOS, { create: true });
      let have = null;
      try { have = await (await dir.getFileHandle(f.file)).getFile(); } catch (e) { /* not there (yet) */ }
      if (!have || have.size !== f.size || Date.now() - have.lastModified > 3 * 864e5) await this.writeFile(f.file, await (await fetch(m.data)).blob(), dir);
      return { file: f.file, w: m.w, h: m.h, bytes: m.bytes, name: m.name, addedAt: m.addedAt };
    },
    // A photo from Photos (or a Photos (n) Google Drive made beside it). Anyone with the folder can put a file there,
    // so it must be what a photo added here is: a JPEG, PNG or WebP by its first bytes (not its name), whole (its
    // bytes have the fingerprint it is named by), within the same limits (validPhoto, 6.5 MP), and one that opens.
    // null while it isn't here, or if it isn't good (then it is read again after LINK_REREAD_MS, or once it changes).
    async readPhoto(ref) {
      let f = null;
      const dirs = this.photoDirs.length ? this.photoDirs : await (async () => { try { return [await this.dir.getDirectoryHandle(LINK_PHOTOS)]; } catch (e) { return []; } })();
      for (const d of dirs) { try { f = await (await d.getFileHandle(ref.file)).getFile(); break; } catch (e) { /* not in this one */ } }
      if (!f) return null;
      const bad = this.badPhotos.get(ref.file);
      if (bad && bad.size === f.size && bad.lastModified === f.lastModified && Date.now() - bad.at < this.waits.reread) return null;
      const no = () => { this.badPhotos.set(ref.file, { size: f.size, lastModified: f.lastModified, at: Date.now(), first: (bad && bad.first) || Date.now() }); return null; };
      if (!f.size || f.size > 11.9e6) return no();   // (as a data URL it must stay under 16e6 characters)
      let buf;
      try { buf = await f.arrayBuffer(); } catch (e) { return null; }   // (Google Drive hasn't brought its content yet)
      const b = new Uint8Array(buf.slice(0, 12)), is = (i, s) => Array.from(s).every((c, k) => b[i + k] === c.charCodeAt(0));
      const type = is(0, '\xff\xd8\xff') ? 'jpeg' : is(0, '\x89PNG\r\n\x1a\n') ? 'png' : is(0, 'RIFF') && is(8, 'WEBP') ? 'webp' : '';
      if (!type || await this.digest(buf) !== ref.file.slice(0, 32)) return no();   // (not a picture, or not all of it yet)
      const blob = new Blob([buf], { type: 'image/' + type });
      let w = 0, h = 0;
      try { const bmp = await createImageBitmap(blob); w = bmp.width; h = bmp.height; if (bmp.close) bmp.close(); } catch (e) { return no(); }
      if (w * h > PHOTO_MAX_PIXELS * 1.01) return no();   // (a photo made here can be a little over, by rounding)
      const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
      const m = { data, w, h, bytes: buf.byteLength, name: ref.name, addedAt: ref.addedAt || Date.now() };
      if (!validPhoto(m)) return no();
      this.badPhotos.delete(ref.file);
      this.print(data, { file: ref.file, size: buf.byteLength, w, h });
      return m;
    },
    // An imported file names its photo (p.photoRef, a device file): this device's own photo if it is that one (then
    // nothing is read), or the one in Photos. p.photo is then that picture (it stays null while the photo isn't here).
    async photoIn(p) {
      const ref = p.photoRef;
      if (!ref || p.photo) return p;
      try {
        const mine = BoardPhoto.media();
        if (mine) await this.photoName(mine);
        for (const [data, f] of this.prints) if (f.file === ref.file) { p.photo = { data, w: f.w, h: f.h, bytes: f.size, name: ref.name, addedAt: ref.addedAt || Date.now() }; return p; }
        if (this.dir && this.perm === 'granted') p.photo = await this.readPhoto(ref);
      } catch (e) { console.warn('21Board: the background photo couldn’t be read', e); }
      return p;
    },
    // Photos no device file names any more are deleted after about a week: only when every device file in the
    // folder could be read (one still arriving may name it), the photo is over LINK_PHOTO_KEEP_MS old (a device that
    // names it again writes it again: putPhoto), and this device has found it unnamed on two looks at least an hour
    // apart. At most once a day. (Copies Google Drive makes, "… (1).jpg", are never named, so they go too, and so do
    // photos in a Photos (n). Anything else is left alone.) Then every photo this device's pages name that isn't
    // there (deleted by hand) is put again at the next write.
    // Not in the first LINK_ARRIVE_MS after 21Board opens, the device wakes or the folder comes back (freshAt), nor
    // with no device file found at all (Drive may be listing the folder short).
    async tidyPhotos() {
      const t = this.st.tidy || {}, now = Date.now(), gen = this.gen, files = Array.from(this.files.values());
      // (nor while a file can't be read, or is a newer 21Board's: either may name photos this device can't see)
      if (now - (t.at || 0) < 20 * 36e5 || now - this.freshAt < this.waits.arrive || !files.some(f => f.peer || f.dev === this.dev()) || this.tidying || files.some(f => f.bad || f.newer)) return;
      const named = new Set(files.flatMap(f => (f.refs || []).map(x => x.ref.file)).concat(Object.values((this.sync || {}).refs || {}).map(x => x.file))), was = t.seen || {}, seen = {};
      let done, missing = false;
      this.tidying = new Promise(r => { done = r; });   // (a write that names a photo meanwhile waits: see putPhoto)
      try {
        for (const dir of this.photoDirs) {
          const there = new Set();
          for await (const [name, h] of dir.entries()) {
            there.add(name);
            if (h.kind !== 'file' || !/^[0-9a-f]{32}( \(\d+\))?\.(jpg|png|webp)$/.test(name) || (named.has(name) && dir.name === LINK_PHOTOS)) continue;
            if (named.has(name) && dir.name !== LINK_PHOTOS) continue;   // (one a page names, in Photos (n): it is found there, see readPhoto)
            let f;
            try { f = await h.getFile(); } catch (e) { continue; }   // (still arriving: new)
            if (now - f.lastModified < LINK_PHOTO_KEEP_MS) continue;
            const key = dir.name + '/' + name, first = was[key] && now - was[key] < 2 * 864e5 ? was[key] : 0;
            if (first && now - first >= 36e5) { try { await dir.removeEntry(name); } catch (e) { /* gone already */ } }
            else seen[key] = first || now;
          }
          if (dir.name === LINK_PHOTOS) for (const x of Object.values((this.sync || {}).refs || {})) if (!there.has(x.file)) missing = true;
        }
      } catch (e) { console.warn('21Board: the Photos folder couldn’t be tidied', e); Object.assign(seen, was); }
      finally { this.tidying = null; done(); }
      if (missing) { this.reput = true; this.want('send', 0); }
      if (gen === this.gen && this.dir) this.saveState({ tidy: { at: now, seen } }, true);   // (Settings doesn't show it)
    },
    // fn puts other content on the board (Import, going back, Undo): a round waits for it, and Pages.go waits for a round.
    async swap(fn) {
      for (let i = 0; this.loading && i < 150; i++) await sleep(100);
      this.loading = true;
      try { return await fn(); } finally { this.loading = false; }
    },
    // Erase everything: this device forgets the folder, its bookkeeping and its id. (The ledger went with the store.)
    forget() {
      this.gen++;   // a round under way (here or in another tab) doesn't save anything back
      this.stopTimers();
      this.dir = null; this.perm = 'none'; this.files.clear(); this.listed = new Set(); this.peers = {}; this.badPhotos.clear(); this.got.clear(); this.media.clear(); this.hcache = new Map(); this.owed = false;
      this.trouble = this.failed = this.newer = this.sync = this.linked = null; this.unsent = this.welcoming = false; this.checkedAt = 0; this.quiet = {}; this.waiting.clear(); this.histWait.clear(); this.slowPhotos.clear(); this.fresh = true;
      this.st = { device: null, tidy: {}, shown: {} };
      FolderNote.update();
    },

    // ---- what Settings says (spec §8.2): how things stand, who else is there, anything waiting. ("Syncing…" isn't in
    // it: it goes beside the folder's name, see syncing, so the line changes only when how things stand does.)
    status() {
      const sync = this.sync || {}, now = Date.now(), out = [];
      const arriving = Array.from(this.files.values()).filter(f => f.bad && (f.devish || f.dev) && now - f.bad >= this.waits.idle);
      if (this.trouble && this.trouble.kind === 'send' && this.trouble.code === 'readonly') out.push('This folder can only be viewed: changes from your other devices show here, but changes made here stay on this device.');
      else if (this.newer) out.push(`${cap(this.newer)} uses a newer 21Board. Update 21Board on this device to keep syncing.`);
      else if (sync.mode) out.push('Waiting for Google Drive to bring the board in this folder.');
      else if (arriving.length) {   // (the device's name as it gave it: a file's name drops "the", "a", "an")
        const f = arriving[0], p = Object.values(sync.peers || {}).find(x => x && x.file === f.name);
        out.push(`Waiting for Google Drive to bring ${f.devName || (p && p.name) || 'another device'}’s latest changes.`);
      }
      // (a write that fails: not "Up to date" under the warning that changes aren't reaching the other devices)
      else if (this.unsent || this.problem() === 'send') out.push(`Not synced: changes made here aren’t in your folder yet${sync.wroteAt ? ` (the last ones went there ${when(sync.wroteAt)})` : ''}.`);
      else if (sync.wroteAt) out.push(`Up to date. This device’s latest changes went to your folder ${when(sync.wroteAt)}.`);
      else out.push('Up to date.');
      const me = this.dev(), seen = new Set(Array.from(this.files.values(), f => f.dev).filter(Boolean));
      const others = Object.entries(sync.peers || {}).filter(([d, p]) => d !== me && seen.has(d) && p && !p.left).map(([, p]) => ({ devName: p.name, at: p.at || 0 })).sort((a, b) => b.at - a.at);
      const who = f => `${f.devName || 'another device'}`;
      // (a device that synced here and stopped, by Unlink or Change…: said, not "has synced yet")
      const gone = Object.entries(sync.peers || {}).filter(([d, p]) => d !== me && seen.has(d) && p && p.left).map(([, p]) => p).sort((a, b) => (b.left.at || 0) - (a.left.at || 0))[0];
      if (!others.length && gone) out.push(`${cap(gone.name || 'another device')} stopped syncing through this folder ${when(gone.left.at || 0)}.`);
      else if (!others.length) out.push('No other device has synced yet: set up Board Sync on your other devices and pick this same folder.');
      else if (others.length === 1) out.push(`Shared with ${who(others[0])} (last change ${when(others[0].at)}).`);
      else if (others.length === 2) out.push(`Shared with ${who(others[0])} (${when(others[0].at)}) and ${who(others[1])} (${when(others[1].at)}).`);
      else out.push(`Shared with ${who(others[0])} (${when(others[0].at)}), ${who(others[1])} (${when(others[1].at)}) and ${others.length - 2} other${others.length === 3 ? '' : 's'}.`);
      for (const [file, w] of this.waiting) {
        if (now - w.since < this.waits.arrive) continue;
        out.push(this.badPhotos.has(file) ? `The background photo of “${w.page}” in the folder can’t be used, so this device keeps its own.` : `The background photo of “${w.page}” is still arriving.`);
      }
      for (const [, h] of this.histWait) out.push(`Changes to “${h.name}” from ${h.from} wait until Board history can save a version on this device. It may be full.`);
      if (this.big) out.push(`Your board file is very large (${fmtBytes(this.big)}), so Google Drive may be slow to bring it to your other devices.`);
      if (this.checkedAt && !this.problem() && this.running && now - this.lookingSince > 15e3 && now - this.checkedAt > LINK_STALE_MS) out.push(`Folder last checked ${when(this.checkedAt)}.`);
      return out.join(' ');
    },

    // Changes made here are on their way to the folder: Settings says "Syncing…" beside the folder's name. (Not a look
    // at the folder: that happens every few seconds, and would flash it.)
    syncing() { return !!(this.writing || this.firstChange || this.timers.send || this.carrying); },

    // ---- startup: look now, when 21Board comes back to the front, and every few seconds while it is in front.
    // Hidden (the lid closed, another app): this device's changes are written at once, before reading anything.
    start() {
      if (!this.supported || this.started) return;
      this.started = true;
      this.awake();
      this.refresh();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.refresh();
        else if (this.dir && this.sync) { this.urgent = true; this.round('send'); }
      });
      window.addEventListener('pagehide', () => { if (this.dir && this.sync) { this.urgent = true; this.round('send'); } });
      window.addEventListener('focus', () => this.check());
      window.addEventListener('online', () => { this.freshAt = Date.now(); });   // Google Drive can only now fetch what the other devices wrote
      setInterval(() => this.awake(), LINK_BEAT_MS);
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
  //  - when a widget's content is suddenly emptied (e.g. a note cleared);
  //  - before Reset, Delete, Close all, a photo change, Import, going back and Erase;
  //  - before a Board Sync merge changes a page (beforeMerge): always before a risky one, otherwise at most once an
  //    hour while nothing was changed on that page here;
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
    safetyKeep: 7 * H_DAY, bigKeep: 30 * H_DAY, undoMs: 10 * H_MIN, folderEvery: H_HOUR, maxAuto: 5e6, maxBody: 15e6, photos: 5,
    mergeEvery: H_HOUR, mergeTimeout: 10e3, goneKeep: 30 * H_DAY };   // (Board Sync: versions before merges; a deleted page's versions)
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
    // (With its pictures put back: see pack.)
    async get(id) {
      return this.tx(['meta', 'body', 'photo'], 'readonly', (o, set) => {
        const m = o.meta.get(id), bd = o.body.get(id), r = {};
        m.onsuccess = () => { r.meta = m.result; };
        bd.onsuccess = () => {
          r.body = bd.result;
          if (!r.meta || !r.body) { set(null); return; }
          const keys = this.picsIn(r.body.exp), got = new Map();
          let left = keys.length;
          if (!left) { set(r); return; }
          for (const k of keys) { const g = o.photo.get(k); g.onsuccess = () => { if (g.result) got.set(k, g.result.data); if (!--left) { this.unpack(r.body.exp, got); set(r); } }; }
        };
      });
    },
    // Pictures in windows' content (the Picture widget's, usually 0.2–0.8 MB each) are kept once, in the photo store, not
    // in every version: a string in a window's content over 32 KB that is a data: URL goes there under a fingerprint
    // (pic-<hash>-<length>), and the version holds { b21pic: key } in its place (meta.pics lists them). get() puts them
    // back; prune and thin keep a picture while a version names it. pack returns { exp, pics: key -> data }.
    PIC_MIN: 32768,
    pack(exp) {
      const pics = new Map();
      const instances = exp.instances.map(i => {
        const d = i.data;
        if (!d || typeof d !== 'object' || Array.isArray(d)) return i;
        let out = null;
        for (const [k, v] of Object.entries(d)) {
          if (typeof v !== 'string' || v.length < this.PIC_MIN || !v.startsWith('data:')) continue;
          const key = `pic-${hash53(v)}-${v.length}`;
          pics.set(key, v);
          out = out || Object.assign({}, d);
          out[k] = { b21pic: key };
        }
        return out ? Object.assign({}, i, { data: out }) : i;
      });
      return { exp: Object.assign({}, exp, { instances }), pics };
    },
    picsIn(exp) {
      const keys = new Set();
      for (const i of (exp && exp.instances) || []) {
        if (i.data && typeof i.data === 'object') for (const v of Object.values(i.data)) if (v && typeof v === 'object' && typeof v.b21pic === 'string') keys.add(v.b21pic);
      }
      return Array.from(keys);
    },
    unpack(exp, got) {   // (a picture that is gone: null, which the widget reads as none)
      for (const i of exp.instances || []) {
        if (i.data && typeof i.data === 'object') for (const [k, v] of Object.entries(i.data)) if (v && typeof v === 'object' && typeof v.b21pic === 'string') i.data[k] = got.get(v.b21pic) || null;
      }
      return exp;
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
      const walk = x => { if (out.join(' ').length > 80) return; if (typeof x === 'string') { if (x.trim() && !x.startsWith('data:')) out.push(x.trim()); } else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.values(x).forEach(walk); };
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
    // The board's content, without the theme, accent and text style (going back never changes them; boardSig never had
    // the text style).
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
      if (a.thumb && b.thumb && (bgColor(a.thumb.bg) !== bgColor(b.thumb.bg) || a.thumb.pattern !== b.thumb.pattern)) items.push('Background changed');   // (the old Paper and Sand: the new Paper)
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
      // opts.b: a page that isn't shown (Board Sync's versions before a merge), from its stored records (opts.read).
      const b = opts.b || S.boardId, here = b === S.boardId, startedAt = Date.now(), why = opts.why || {};
      let exp;
      try { exp = here ? await buildExport('full') : pageExport('full', b, opts.read || await readForExport()); } catch (e) { why.failed = true; return null; }
      if (opts.token && opts.token.late) return null;   // gave up waiting (see before()): this would show the board after the action
      if (opts.patch) { const i = exp.instances.find(x => ikeyOf(x.widgetId, x.instance) === opts.patch.ikey); if (i) i.data = opts.patch.data; }
      // (sigs: also as an older 21Board stored the board, see boardSigs. Reading the old Paper as the new
      // one isn't a change worth a version.)
      const sig = this.sigOf(exp), sigs = boardSigs(exp, e => this.sigOf(e));
      const photoM = exp.media && exp.media.background;
      if (!exp.instances.length && !photoM && kind !== 'manual') return null;
      if (here) for (const i of exp.instances) { const inst = S.insts.get(ikeyOf(i.widgetId, i.instance)); if (inst && inst.createdAt) i.createdAt = inst.createdAt; }
      const photoKey = this.photoKeyOf(photoM);
      if (exp.media) exp.media = photoM ? { ref: photoKey, look: exp.media.look } : undefined;
      if (!exp.media) delete exp.media;
      const at = Math.max(Date.now(), (here && this.metas[0] && this.metas[0].tab === TAB_ID ? this.metas[0].at + 1 : 0));
      exp.snapshot = { at, kind, label: String(opts.label || '').slice(0, 80) };
      const packed = this.pack(exp), picKeys = Array.from(packed.pics.keys());   // (each window's picture kept once: pack)
      const bytes = JSON.stringify(packed.exp).length;
      if (bytes > HIST.maxBody || ((kind === 'auto' || kind === 'open') && bytes > HIST.maxAuto)) { this.status = 'too-big'; return null; }
      const uid = here ? S.board.uid : exp.board.uid, name = here ? S.board.name : exp.board.name;
      const meta = { v: 1, id: `${b}:${String(at).padStart(13, '0')}:${TAB_ID}`, b, at, kind, reason: opts.reason || null, label: exp.snapshot.label,
        sig, uid: uid || null, name, bytes, photo: photoKey, ...(picKeys.length ? { pics: picKeys } : {}), thumb: this.thumbOf(exp), wins: this.winsOf(exp),
        target: opts.target || null,   // going back: the time gone back to (labels are written when shown)
        beforeBig: false,
        keepUntil: kind === 'before' || kind === 'restored' ? at + HIST.safetyKeep : 0, manual: kind === 'manual', folder: null, tab: TAB_ID };
      const every = this.every();
      let id;
      try {
        id = await this.tx(['meta', 'body', 'photo'], 'readwrite', (o, set) => {
          const c = o.meta.openCursor(this.range(b), 'prev');
          c.onsuccess = () => {
            const newest = c.result && c.result.value;
            if (newest && sigs.includes(newest.sig)) {   // the same as the newest version: nothing new to save
              if (kind === 'before') { newest.keepUntil = Math.max(newest.keepUntil || 0, at + HIST.safetyKeep); o.meta.put(newest); }
              if (kind === 'manual') { newest.manual = true; newest.manualLabel = meta.label; o.meta.put(newest); }
              set(newest.id); return;
            }
            // A burst of the same risky action (30 resets): one version, from before the burst.
            // (Only if that version already holds everything on the board now: nothing typed since is lost. Not for
            // merges, which bring new content each time: Board Sync decides itself, see beforeMerge.)
            if (newest && kind === 'before' && meta.reason !== 'merge' && newest.kind === 'before' && newest.reason === meta.reason && at - newest.at < HIST.coalesce && this.holdsAll(newest, meta)) { set(newest.id); return; }
            // Another tab just saved one.
            if (newest && kind === 'auto' && (newest.kind === 'auto' || newest.kind === 'open') && every && at - newest.at < 0.9 * every) { set(null); return; }
            if (newest && this.bigChange(newest, meta)) { newest.beforeBig = true; o.meta.put(newest); }
            o.body.put({ id: meta.id, exp: packed.exp });
            o.meta.put(meta);
            for (const [key, data] of packed.pics) {
              const g = o.photo.get(key);
              g.onsuccess = () => { const ph = g.result; if (ph) { ph.lastUsed = at; o.photo.put(ph); } else o.photo.put({ key, data, pic: true, bytes: data.length, lastUsed: at }); };
            }
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
        why.failed = true;
        return null;
      }
      if (here && this.lastChangeAt < startedAt) this.dirty = false;
      await this.reload();
      this.pruneSoon();
      if (photoKey) this.makeThumb(photoKey);
      const saved = here && this.metas.find(m => m.id === id);
      if (saved && (id === meta.id || kind === 'manual')) this.maybeFolder(saved, kind === 'manual');
      Sync.announce([], { op: 'history', board: b });
      HistorySheet.refresh(); updateHint();
      if (Settings.isOpen) Settings.refresh();
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
    // Board Sync (section 13d): a version of each page a merge is about to change, before it does. pages: the merge's
    // summary.pages ({ uid: { b, risky } }); hist: each page's ledger note ({ uid: { at, local } }). A risky merge
    // (deleting or bringing back, emptying, a clash, a photo replaced) always gets one; otherwise a page nothing was
    // changed on here gets at most one an hour. One read of storage for every page, and a time limit of its own.
    // Returns { uid: 'saved' | 'none' (nothing to keep) | 'failed' }: a page whose version failed has its risky
    // changes held back by the round, since this version is the only place their losing values would be kept.
    async beforeMerge(pages, label, hist = {}) {
      const out = {}, now = Date.now();
      if (!this.enabled()) { for (const uid of Object.keys(pages)) out[uid] = 'none'; return out; }
      const todo = Object.entries(pages).filter(([uid, p]) => {
        const h = hist[uid] || {};
        if (!p.risky && !h.local && now - (h.at || 0) < HIST.mergeEvery) { out[uid] = 'none'; return false; }
        return true;
      });
      if (!todo.length) return out;
      // (token.late: the time is up and the round goes on as if these failed. A capture still running then saves nothing:
      // the page it would read may already be the one after the merge, under "Before changes from …")
      const token = { late: false };
      const run = (async () => {
        await Writer.settled(1000);
        const read = await readForExport();
        for (const [uid, p] of todo) {
          if (token.late) break;
          const why = {};
          const id = await this.capture('before', { b: p.b, read, reason: 'merge', label, why, token }).catch(() => { why.failed = true; return null; });
          out[uid] = id ? 'saved' : why.failed ? 'failed' : 'none';
        }
      })();
      await Promise.race([run, sleep(this.cfgv.mergeTimeout || HIST.mergeTimeout)]);
      token.late = true;
      for (const [uid] of todo) if (!out[uid]) out[uid] = 'failed';
      return out;
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
        // Each photo's size. A window's picture's is in its key (pic-<hash>-<length>, see pack), so pictures aren't read.
        const photos = (await this.tx(['photo'], 'readonly', (o, set) => {
          const q = o.photo.getAllKeys();
          q.onsuccess = () => {
            const out = [], rest = [];
            for (const key of q.result) { const m = /^pic-[0-9a-z]+-(\d+)$/.exec(key); if (m) out.push({ key, size: +m[1], lastUsed: 0 }); else rest.push(key); }
            let left = rest.length;
            if (!left) { set(out); return; }
            for (const key of rest) { const g = o.photo.get(key); g.onsuccess = () => { const p = g.result; if (p) out.push({ key, size: (p.data || '').length, lastUsed: p.lastUsed || 0 }); if (!--left) set(out); }; }
          };
        })) || [];
        const now = Date.now(), drop = new Set(), gone = new Set();
        const byBoard = new Map();
        for (const m of all) { if (m.deletedAt && now - m.deletedAt >= HIST.goneKeep) drop.add(m.id); if (!byBoard.has(m.b)) byBoard.set(m.b, []); byBoard.get(m.b).push(m); }   // (a page deleted 30 days ago)
        const newest20 = new Set();
        for (const list of byBoard.values()) {
          const keep = historyPlan(list, now, T_LOCAL);
          list.forEach(m => { if (!keep.has(m.id) && !m.deletedAt) drop.add(m.id); });   // (a deleted page's versions all stay their 30 days)
          list.slice().sort((a, b) => b.at - a.at).slice(0, 20).forEach(m => newest20.add(m.id));
        }
        let live = all.filter(m => !drop.has(m.id));
        // At most 5 different photos; the least recently used go first.
        const used = new Map(photos.map(p => [p.key, p]));
        const refs = Array.from(new Set(live.map(m => m.photo).filter(k => k && k !== 'gone' && used.has(k)))).sort((a, b) => used.get(b).lastUsed - used.get(a).lastUsed);
        const dropPhotos = new Set(refs.slice(HIST.photos));
        live.forEach(m => { if (dropPhotos.has(m.photo)) gone.add(m.id); });
        // Within the byte budget: photos of old versions first, then old versions.
        const pics = () => Array.from(new Set(live.flatMap(m => m.pics || [])));   // (windows' pictures: each once, see pack)
        const total = () => live.reduce((n, m) => n + (m.bytes || 0), 0) + Array.from(new Set(live.filter(m => !gone.has(m.id)).map(m => m.photo))).reduce((n, k) => n + ((used.get(k) || {}).size || 0), 0)
          + pics().reduce((n, k) => n + ((used.get(k) || {}).size || 0), 0);
        const old = live.filter(m => !m.manual && !newest20.has(m.id)).sort((a, b) => a.at - b.at);
        for (const m of old) { if (total() <= B) break; if (m.photo && m.photo !== 'gone') gone.add(m.id); }
        for (const m of old) { if (total() <= B) break; drop.add(m.id); live = live.filter(x => x.id !== m.id); }
        this.paused = total() > B ? 'over' : (this.paused === 'over' || (this.paused === 'quota' && !low) ? '' : this.paused);
        const stillUsed = new Set(live.filter(m => !gone.has(m.id)).map(m => m.photo).filter(Boolean).concat(pics()));
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
        const named = new Set(all.filter(m => !old.includes(m)).flatMap(m => m.pics || []));   // (windows' pictures still named: pack)
        await this.tx(['meta', 'body', 'photo'], 'readwrite', o => {
          for (const m of photos) { o.photo.delete(m.photo); m.photo = 'gone'; o.meta.put(m); }
          for (const m of old) { o.meta.delete(m.id); o.body.delete(m.id); }
          for (const k of new Set(old.flatMap(m => m.pics || []))) if (!named.has(k)) o.photo.delete(k);
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
    // A deleted page's versions (its Undo is over: Pages.purge) stay for 30 days, for Board history › Deleted pages; then
    // prune removes them. (deletedAt in each version's meta.)
    async markDeleted(b, when) {
      if (!this.enabled()) return;
      const at = when || Date.now();
      try { await this.tx(['meta'], 'readwrite', o => { const q = o.meta.openCursor(this.range(b)); q.onsuccess = () => { const c = q.result; if (!c) return; if (!c.value.deletedAt) { c.value.deletedAt = at; c.update(c.value); } c.continue(); }; }); }
      catch (e) { console.warn('21Board: a deleted page’s board history couldn’t be noted', e); }
    },
    // The deleted pages with versions still kept: { b, uid, name, deletedAt, id (its newest version) }, newest first.
    // (Not a page that is back here under the same uid.)
    async deletedPages() {
      if (!this.enabled()) return [];
      let all = [];
      try { all = (await this.tx(['meta'], 'readonly', (o, set) => { const q = o.meta.getAll(); q.onsuccess = () => set(q.result); })) || []; } catch (e) { return []; }
      const here = new Set(Array.from(Pages.info.values(), i => i.uid).concat(S.board.uid)), byB = new Map();
      for (const m of all) if (m.deletedAt && Date.now() - m.deletedAt < HIST.goneKeep && !here.has(m.uid)) { const x = byB.get(m.b); if (!x || m.at > x.at) byB.set(m.b, m); }
      // (and pages deleted just now, whose Undo is still offered: Bring back is that Undo)
      const waiting = Array.from(Pages.purges.keys()).filter(b => Pages.gone().has(b) && Pages.info.has(b)).map(b => ({ b, uid: Pages.info.get(b).uid, name: Pages.info.get(b).name,
        deletedAt: Pages.goneAt.get(b) || num((S.settings.deletedAt || {})[b], Date.now()), id: null, waiting: true }));
      return waiting.concat(Array.from(byB.values()).map(m => ({ b: m.b, uid: m.uid, name: m.name, deletedAt: m.deletedAt, id: m.id }))).sort((a, c) => c.deletedAt - a.deletedAt);
    },
    // Board history › Deleted pages › Bring back: the page again, from its newest version, under its old uid (Board Sync
    // then brings it back on every device too). After the pages here.
    async bringBack(id) {
      const r = await this.find(id);
      if (!r) return false;
      const exp = clone(r.body.exp);
      delete exp.theme; delete exp.accent; delete exp.letters;
      const ref = exp.media && exp.media.ref, look = exp.media && exp.media.look;
      delete exp.media;
      const p = parseBoardFile(JSON.stringify(exp));
      if (ref) { const ph = await this.getPhoto(ref).catch(() => null); if (ph) { p.photo = { data: ph.data, w: ph.w, h: ph.h, bytes: ph.bytes, name: ph.name, addedAt: ph.addedAt }; p.photoLook = normalizePhotoSettings(look || {}); } }
      if (Pages.busy) return false;
      Pages.busy = true;
      let made = [];
      try { made = await Pages.addFrom([p], { end: true }); } finally { Pages.busy = false; }
      if (!made.length) { toast('Couldn’t bring that page back just now. Try again in a moment.'); return false; }
      await Pages.go(made[0], { quiet: true });
      Pages.flash();
      Picker.renderControls();
      toast(`“${p.board.name || 'The page'}” is back.`);
      return true;
    },
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
      delete exp.theme; delete exp.accent; delete exp.letters;   // going back never changes the theme, accent or text style
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
      // (The version may be another board, e.g. undoing an Import: no Board Sync round runs across the change, see
      // Link.swap. Its windows keep their wid, so going back syncs as edits.)
      const undoId = await Link.swap(async () => {
        // (this page stays this page, also when the version is of another one: Board Sync would otherwise delete this page
        // and copy that one on every device)
        return applyImport(p, 'replace', { uid: S.board.uid, photo, keepCreated: true, mustSnapshot: true,
          history: opts.undo ? { reason: 'undo', label: `Before undoing ${opts.what || 'a change'}` } : { reason: 'restore', label: 'Before going back', target: at } });
      });
      if (undoId === false) return false;
      await this.capture('restored', opts.undo ? { label: `Undid ${opts.what || 'a change'}` } : { label: 'Went back', target: at });
      Link.changed([Keys.board(S.boardId)]);
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
      if (!opts.exact && !opts.here && cur && !(src.wid ? cur.wid === src.wid : src.createdAt && cur.createdAt === src.createdAt)) {
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
      // (the same window on every device, unless it goes in beside the one there now: Board Sync)
      const taken = new Set(Array.from(S.insts.entries()).filter(([k]) => k !== target).map(([, i]) => i.wid));
      const wid = opts.here && cur && cur.wid ? cur.wid : target === ikey && src.wid && !taken.has(src.wid) ? src.wid : Merge.newWid(src.widgetId, src.createdAt || Date.now(), taken);
      await saveInst(target, { widgetId: src.widgetId, n, open, rect, z: maxZ() + 1, maximized: opts.exact ? !!src.maximized : false, createdAt: src.createdAt || Date.now(), wid });
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
      if (meta.kind === 'open' && Link.dir && !meta.manual) return;   // (Board Sync: it may hold only what was merged from other devices, theirs to copy)
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
          delete exp.theme; delete exp.accent; delete exp.letters;
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

  // Settings → Classroom → Go back to an earlier version: opens Board history (which lists the versions) as a column
  // beside Settings, and closes it again (HistorySheet: the button is marked while it's open).
  // Only something wrong is said here, in one line: history paused or short of space, or unreadable just now.
  function historyOpenRow() {
    const H = BoardHistory;
    if (LAB) return '';
    if (!H.enabled()) return `<div class="row"><div><div class="lbl">Go back to an earlier version</div><div class="hint">Board history isn’t available in this browser window.</div></div></div>`;
    const warn = H.paused === 'quota' ? 'Board history is paused: this device is out of space.' : H.paused === 'over' ? 'Board history is using its share of this device’s storage, so a version is saved about once an hour.' : H.low || H.tight ? `Space is low on this device${H.thinned ? ', so some of the oldest board history was removed' : ''}. Make room on the device so 21Board can keep saving.` : H.status === 'too-big' ? 'This page is too big for automatic versions.' : H.unread ? 'Board history couldn’t be read just now.' : '';
    return `<div class="row"><div><div class="lbl">Go back to an earlier version</div>${warn ? `<div class="hint warn-line"><span class="status-dot warn"></span>${warn}</div>` : ''}</div>
        <button class="btn" data-act="hist-open" aria-controls="history" aria-expanded="${HistorySheet.beside}">${svg('history')}Board history…</button></div>`;
  }
  // Settings → Advanced → Board history: how often a version is saved, and deleting them. (Copies in the Google Drive
  // folder: Settings → Board Sync → Keep history copies in the folder, linkSettings.)
  function historySettings(sw, seg) {
    if (LAB || !BoardHistory.enabled()) return '';
    const every = String(S.settings.historyEvery == null ? 10 : S.settings.historyEvery);
    return `<h4>Board history</h4>
      <div class="row stack"><div><div class="lbl">Save a version automatically</div>${every === '0' ? '<div class="hint">One is still saved before big changes, like Close all.</div>' : ''}</div>${seg('hist-every', every, [['10', 'Every 10 min'], ['60', 'Every hour'], ['1440', 'Once a day'], ['0', 'Off']], false, 'Save a version automatically')}</div>
      <div class="row"><div><div class="lbl">Delete board history</div><div class="hint">The board itself stays.</div></div><button class="btn small danger" data-act="hist-delete">Delete…</button></div>`;
  }

  // Board history: every version of the board, in columns from a screen edge, each as wide as Settings (place):
  //   Settings (when Board history was opened from it: Settings → Classroom → Board history…; it stays open and
  //   usable), the list of versions (#history), and the version tapped in it (#history-detail: a preview and what
  //   changed, Go back, then each window with Put back). Opened from elsewhere (a window's menu, a message, the empty
  //   board), the list is the first column. Escape closes the outermost column; the keyboard goes into a column as
  //   it opens, and back to what opened it as it closes.
  const HistorySheet = {
    el: null, body: null, side: 'left', isOpen: false, sel: null, ikey: null, now: null, folder: [], showOthers: false, thumbs: new Map(), rt: 0, deleted: [],
    beside: false,   // opened from Settings, as the column next to it (closing Settings closes it)
    det: null, detBody: null, selFrom: 'hist-row',   // the version's column, and what opened it (its row, or the suggestion above the list)
    back: null,      // what the keyboard goes back to when Board history closes (a function: Settings is drawn afresh)

    init() {
      this.el = $('#history');
      this.body = $('.sheet-body', this.el);
      this.det = $('#history-detail');
      this.detBody = $('.sheet-body', this.det);
      // ✕, or ‹ Back where a column covers the one before it (place): both close that column.
      for (const [el, shut] of [[this.el, () => this.close()], [this.det, () => this.select(null)]]) {
        $('[data-close]', el).innerHTML = svg('close');
        $$('[data-close], [data-back]', el).forEach(b => b.addEventListener('click', shut));
        $('.sheet-body', el).addEventListener('click', e => {
          const b = e.target.closest('[data-act]');
          if (b && !b.disabled) this.act(b.dataset.act, b.dataset.val, b);
        });
      }
    },
    // opts: ikey (one window's versions), beside (from Settings, which stays open), back (a function: what the
    // keyboard goes back to afterwards; otherwise where it was).
    async open(side, opts = {}) {
      const from = document.activeElement;
      closePopups({ keepHistory: true, keepSettings: !!opts.beside });
      this.side = side === 'right' ? 'right' : 'left';
      this.beside = !!opts.beside && Settings.isOpen;
      this.back = opts.back || (this.beside ? () => $('[data-act="hist-open"]', Settings.body) : from && from !== document.body ? () => from : null);
      this.ikey = opts.ikey || null;
      this.sel = null; this.showOthers = false;
      for (const el of [this.el, this.det]) { el.classList.remove('left', 'right', 'open'); el.classList.add(this.side); }
      this.el.classList.add('open');
      this.isOpen = true;
      this.marked();
      this.place();
      this.body.innerHTML = '<p class="hist-intro">Loading…</p>';
      this.el.focus({ preventScroll: true });
      await BoardHistory.reload();
      await this.loadExtras();
      this.render();
      if (this.beside) Settings.render();   // (its Go back row says when history can't be read: now it's known)
    },
    // quiet: Settings closed it, or something else is opening (the keyboard isn't put back).
    close(quiet) {
      if (!this.isOpen) return;
      const a = document.activeElement, mine = !a || a === document.body || this.el.contains(a) || this.det.contains(a);
      this.isOpen = false; this.beside = false; this.sel = null;
      this.el.classList.remove('open'); this.det.classList.remove('open');
      this.marked();
      this.place();
      const back = !quiet && mine && this.back && this.back();
      if (back && back.isConnected && back.getClientRects().length) back.focus({ preventScroll: true });
    },
    // Escape: the outermost column first.
    escape() { if (this.sel) this.select(null); else this.close(); },
    // Settings moved to the other edge (Widget Picker: Left or Right): its columns go with it, as they are.
    move(side) {
      this.side = side;
      for (const el of [this.el, this.det]) { el.classList.remove('left', 'right'); el.classList.add(side); }
      this.place();
    },
    // Settings' Board history… is marked while its column is open.
    marked() { const b = Settings.isOpen && $('[data-act="hist-open"]', Settings.body); if (b) b.setAttribute('aria-expanded', String(this.beside)); },
    // Where the columns go: Settings (when beside), the list, the version. Each is as wide as Settings and drawn at
    // its size (--ui), so in its own px each is 460 wide (less on a very narrow screen), 16 in from the edge and 12
    // from the next. One that doesn't fit the screen covers the one before it (hidden meanwhile), with ‹ Back in
    // place of ✕: on a 1366 × 768 Chromebook at the usual size all three fit; on an iPad the version covers the list.
    place() {
      if (!this.el) return;
      const cols = [this.beside ? Settings.el : null, this.isOpen ? this.el : null, this.isOpen && this.sel ? this.det : null].filter(Boolean);
      const room = window.innerWidth / (Zoom.ui || 1), W = Math.min(460, room - 32);
      const fit = Math.max(1, Math.floor((room - 32 + 12) / (W + 12)));
      for (const el of [Settings.el, this.el, this.det]) {
        el.classList.remove('covered');
        el.style.removeProperty('--col');
        const bk = $('[data-back]', el);
        if (bk) { bk.hidden = true; $('[data-close]', el).hidden = false; }
      }
      cols.forEach((el, k) => {
        const at = Math.min(k, fit - 1);
        el.style.setProperty('--col', String(at));
        if (at === k) return;
        const under = cols[k - 1], to = under === Settings.el ? 'Settings' : 'Board history', bk = $('[data-back]', el);
        under.classList.add('covered');
        bk.innerHTML = `${svg('chevLeft')}<span>${to}</span>`;
        bk.setAttribute('aria-label', `Back to ${to}`);
        bk.hidden = false; $('[data-close]', el).hidden = true;
      });
    },
    async loadExtras() {
      try {
        const exp = await buildExport('full');
        // (Fingerprinted as versions are: without the theme, accent and text style, and also as an older 21Board stored it.)
        this.now = { sigs: boardSigs(exp, e => BoardHistory.sigOf(e)), wins: BoardHistory.winsOf(exp), thumb: BoardHistory.thumbOf(exp), photo: BoardHistory.photoKeyOf(exp.media && exp.media.background), name: S.board.name };
      } catch (e) { this.now = null; }
      for (const k of new Set(BoardHistory.metas.map(m => m.photo).filter(k => k && k !== 'gone'))) {
        if (this.thumbs.has(k)) continue;
        const ph = await BoardHistory.getPhoto(k).catch(() => null);
        if (ph && ph.thumb) this.thumbs.set(k, ph.thumb);
      }
      this.folder = S.settings.historyFolder !== false ? await BoardHistory.folderList() : [];
      this.deleted = Pages.enabled() ? await BoardHistory.deletedPages() : [];
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
      const H = BoardHistory;
      if (!H.enabled()) { this.body.innerHTML = '<p class="hist-intro">Board history isn’t available in this browser window.</p>'; this.sel = null; this.renderSel(); return; }
      this.fill(this.body, this.ikey ? this.renderWindow() : this.renderBoard());
      this.renderSel();
    },
    // A column drawn afresh, where it was scrolled to, with the keyboard still on the control it was on.
    fill(body, html, top = body.scrollTop) {
      const a = document.activeElement, on = body.contains(a) && a.dataset.act ? a : null;
      body.innerHTML = html;
      body.scrollTop = top;
      const again = on && $$(`[data-act="${CSS.escape(on.dataset.act)}"]`, body).find(b => b.dataset.val === on.dataset.val && b.classList[0] === on.classList[0]);
      if (again) again.focus({ preventScroll: true });
    },
    // The version tapped (this.sel), in the column beside the list; none: that column closes.
    renderSel() {
      const metas = BoardHistory.metas, i = this.ikey || !this.sel ? -1 : metas.findIndex(m => m.id === this.sel);
      const m = metas[i], open = !!m, was = this.det.classList.contains('open') ? this.det.dataset.id : null;
      if (!open && this.det.contains(document.activeElement)) this.el.focus({ preventScroll: true });   // (the version has gone)
      this.sel = open ? m.id : null;
      if (open) {
        $('h2', this.det).textContent = dayTime(m.at);
        this.det.dataset.id = m.id;
        this.fill(this.detBody, this.renderDetail(m, metas[i - 1]), was === m.id ? this.detBody.scrollTop : 0);
      }
      this.det.classList.toggle('open', open);
      this.place();
    },
    // Tapping a version opens it beside the list (the keyboard goes into it); tapping it again, ✕ or Escape closes it
    // (the keyboard goes back to the version in the list).
    select(id, from) {
      const was = this.sel;
      if (from) this.selFrom = from.classList.contains('hist-hero') ? 'hist-hero' : 'hist-row';
      this.sel = id || null;
      const a = document.activeElement, mine = !a || a === document.body || this.det.contains(a);
      this.render();
      if (this.sel && !was) this.det.focus({ preventScroll: true });
      else if (!this.sel && was && mine) {
        const b = $(`.${this.selFrom}[data-val="${CSS.escape(was)}"]`, this.body) || $(`[data-val="${CSS.escape(was)}"]`, this.body);
        (b || this.el).focus({ preventScroll: true });
      }
    },
    renderBoard() {
      const H = BoardHistory, metas = H.metas, now = this.now;
      let html = '<p class="hist-intro">Tap a time to see how your board looked. Nothing changes until you tap Go back.</p>';
      if (H.undoable && H.undoable.until > Date.now()) html += `<div class="hist-undo"><span>${esc(H.undoable.label)}</span><button class="btn small primary" data-act="undo">Undo</button></div>`;
      if (H.unread) return html + '<p class="empty-note">21Board couldn’t read board history just now. Your earlier versions haven’t been deleted.</p><p><button class="btn" data-act="retry">Try again</button></p>' + this.renderFoot();
      if (!metas.length) return html + '<p class="empty-note">No earlier versions yet. 21Board saves one when the board changes, and before risky actions like Reset or Import.</p>' + this.renderFoot();
      // The version most likely wanted after a disaster.
      const noneOpen = now && !Object.values(now.wins).some(w => w[0]);
      const hero = noneOpen ? metas.find(m => m.thumb && m.thumb.wins.length && (!now || !now.sigs.includes(m.sig)))
        : metas.find(m => m.beforeBig && Date.now() - m.at < 3 * H_DAY && (!now || !now.sigs.includes(m.sig)));
      if (hero) {
        const after = H.diff(hero, metas[metas.indexOf(hero) - 1] || now);
        html += `<button class="hist-hero${this.sel === hero.id ? ' sel' : ''}" data-act="sel" data-val="${esc(hero.id)}" aria-controls="history-detail" aria-expanded="${this.sel === hero.id}">${this.minimap(hero.thumb, { photo: this.photoOf(hero) })}<span><b>${noneOpen ? 'Before the windows were closed' : 'Before the last big change'}</b><span>${esc(dayTime(hero.at))}${after.length ? '. After it: ' + esc(after.slice(0, 3).join(', ').toLowerCase()) : ''}</span></span></button>`;
      }
      let day = '';
      metas.forEach((m, i) => {
        const d = new Date(m.at), dk = d.toDateString();
        if (dk !== day) { day = dk; html += `<div class="hist-day">${esc(this.dayName(m.at))}</div>`; }
        const older = metas[i + 1];
        const tags = [];
        if (m.beforeBig) tags.push('<span class="tag big">Before a big change</span>');
        const called = `Then called “${esc(m.name)}”`;   // (a long name ends in … in its row: all of it in the tooltip)
        if (m.name !== S.board.name) tags.push(`<span class="tag" title="${called}">${called}</span>`);
        const sel = this.sel === m.id;
        html += `<button class="hist-row${sel ? ' sel' : ''}" data-act="sel" data-val="${esc(m.id)}" aria-controls="history-detail" aria-expanded="${sel}">${this.minimap(m.thumb, { photo: this.photoOf(m) })}<span class="meta2">` +
          `<span class="when">${esc(new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span><span class="what">${esc(this.label(m))}</span>` +
          `${this.chips(older ? H.diff(older, m) : [])}${tags.length ? `<span class="chips">${tags.join('')}</span>` : ''}</span></button>`;
      });
      return html + this.renderFoot();
    },
    renderDetail(m, newer) {
      const H = BoardHistory, now = this.now;
      const same = now && now.sigs.includes(m.sig);
      const after = newer ? H.diff(m, newer) : null, vsNow = now ? H.diff(m, now) : [];
      const notes = [];
      if (m.uid && S.board.uid && m.uid !== S.board.uid) notes.push(`This version is of another page, “${m.name}”: going back puts its windows on this page.`);
      if (m.photo === 'gone') notes.push('The background photo from then wasn’t kept, so going back keeps your photo now.');
      if (Link.dir) notes.push('Going back changes this page on your other devices too.');
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
      // (The column's heading is its date and time: dayTime.)
      return `<div class="hist-detail"><div class="hist-sum">${this.minimap(m.thumb, { photo: this.photoOf(m), labels: true })}
        <p><b>${esc(this.label(m))}</b></p>
        <p>${after ? (after.length ? 'After this: ' + esc(after.join(', ')) + '.' : 'Nothing changed after this until the next version.') : 'This is the newest version.'}</p>
        <p>${same ? 'Same as your board now.' : vsNow.length ? 'Compared with now: ' + esc(vsNow.join(', ')) + '.' : 'Small differences from your board now.'}</p>
        ${notes.map(t => `<p class="hint">${esc(t)}</p>`).join('')}</div>
        ${same ? '' : `<button class="btn primary" data-act="go" data-val="${esc(m.id)}">${svg('history')}Go back to ${esc(dayTime(m.at))}</button>`}
        <div class="hist-day">Windows in this version</div>
        ${rows ? `<div class="inst-list">${rows}</div>` : '<p class="hint">No windows.</p>'}</div>`;
    },
    renderFoot() {
      const H = BoardHistory;
      // Pages deleted in the last 30 days (here, or on another device through Board Sync), to bring back.
      const del = this.deleted.length ? `<div class="hist-day">Deleted pages</div><p class="hint">${Link.dir ? 'Pages deleted in the last 30 days, here or on your other devices.' : 'Pages deleted in the last 30 days.'}</p><div class="inst-list">` +
        this.deleted.map(d => `<div class="inst"><div class="meta"><b>“${esc(d.name)}” · deleted ${esc(when(d.deletedAt))}</b></div><button class="btn small" data-act="${d.waiting ? 'bring-now' : 'bring'}" data-val="${esc(d.waiting ? String(d.b) : d.id)}">Bring back</button></div>`).join('') + '</div>' : '';
      // What's kept (T_LOCAL, as historyPlan keeps it: "Daily" is the first and last of each day). Counted only where
      // there are versions, so each "past …" is at least that long. At its share of the device's storage (prune's byte
      // budget: the device may have plenty of room) or on a full device (thin), history gives up the oldest first,
      // never what you saved: so "when board history needs more room", whichever it is.
      const T = T_LOCAL;
      let html = del + `<div class="hist-foot"><button class="btn" data-act="save">${svg('plus')}Save this version now</button>
        <div class="hist-keeps"><p id="hist-keeps">Board history keeps, on this device:</p>
          <ul aria-labelledby="hist-keeps"><li>The ${T.newest} most recent versions</li><li>Hourly versions for the past ${T.hours / 24} days</li><li>Daily versions for the past ${T.days} days</li><li>Weekly versions for the past ${T.weeks} weeks</li></ul>
          <p>Versions you save are kept until you delete them. When board history needs more room, the oldest versions are deleted first.</p>
          <p>Board history isn’t a backup: if this browser’s data for 21Board is cleared, it’s cleared too.</p></div></div>`;
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

    async act(act, val, el) {
      const H = BoardHistory;
      switch (act) {
        case 'sel': this.select(this.sel === val ? null : val, el); break;
        // (These change the board: every column closes, Settings too, so it can be seen. As before, when Board
        // history took Settings' place.)
        case 'go': closePopups(); await H.restore(val); break;
        case 'put': { const [id, ik] = val.split('|'); closePopups(); await H.putBack(id, ik); break; }
        case 'put-here': { const [id, ik] = val.split('|'); closePopups(); await H.putBack(id, ik, { here: true }); break; }
        case 'undo': if (H.undoable) { const id = H.undoable.id; H.undoable = null; closePopups(); await H.restore(id, { undo: true, what: 'going back' }); } break;
        case 'whole': this.ikey = null; this.render(); break;
        case 'bring': closePopups(); await H.bringBack(val); break;
        case 'bring-now': {   // (deleted just now: its Undo, staying on the page shown)
          const b = +val, name = (Pages.info.get(b) || {}).name || '';
          closePopups();
          if (!Pages.purges.has(b)) {   // (its Undo ended since the list was drawn: its kept version, once noted as deleted)
            if (Pages.ids().includes(b)) { toast(`“${name}” is back.`); break; }   // (another device brought it back meanwhile)
            let d = null;
            for (let i = 0; i < 20 && !d; i++) { d = (await H.deletedPages()).find(x => x.b === b && x.id); if (!d) await sleep(150); }
            if (d) await H.bringBack(d.id); else toast('Couldn’t bring that page back just now. Try again in a moment.');
            break;
          }
          await Pages.undrop([b], Pages.ids().concat(b), () => {});
          if (Pages.ids().includes(b)) toast(`“${name}” is back.`);
          break;
        }
        case 'retry': await H.reload(); await this.loadExtras(); this.render(); if (this.beside) Settings.render(); break;
        case 'others': this.showOthers = !this.showOthers; this.render(); break;
        case 'save': {
          const r = await dialog({ title: 'Save this version', message: 'It’s kept until you delete it.', input: { label: 'Name (optional)', placeholder: 'Monday setup', maxlength: 60 }, actions: [{ label: 'Save', value: true, kind: 'primary' }, { label: 'Cancel', value: false }] });
          if (r && r.value) { const id = await H.save(r.text); toast(id ? 'Saved this version of the board.' : 'Couldn’t save a version just now.'); }
          break;
        }
        case 'folder-go': {
          let exp;
          try { exp = await H.readFolderFile(val); } catch (e) { toast('Couldn’t read that copy: ' + ((e && e.message) || e)); break; }
          closePopups();
          await H.restore({ exp });
          break;
        }
      }
    }
  };

  // =====================================================================
  // 13d. Board Sync merge
  // ---------------------------------------------------------------------
  // Every device linked to one folder shares one board: each writes its own whole-board file there (section 13b,
  // Link) and merges the others' into its records, one small part at a time (a page's name, a window's place, its
  // content...). Each part carries a version: [by, vv, t] (who changed it last, a version vector, and the change's
  // wall-clock time), so that "did only one side change this since the last version both had?" is answered by
  // comparing vectors, with no base copy kept. The ledger (link:sync, link:mine-<page uid>) holds this device's
  // fingerprints and versions, never the board's values. Rules: a part changed on one side only is taken; equal
  // values never clash; content changed on both keeps both (the later stays in the window, the other becomes a
  // labelled copy beside it, made by the device whose version lost); other parts take the later change; an edit
  // the deleting device hadn't seen brings a deleted window or page back. See docs/DATA-FORMAT.md, "Board Sync".
  // The region is pure (no DOM, storage or clock: time comes in opts), so tests/merge.js runs it in Node.
  // MergeUI, after it, shows what a merge did and undoes it.
  // =====================================================================
  // #region Board Sync merge
  const Merge = (() => {
    const PAGE_PARTS = ['name', 'look', 'size', 'pos', 'photo', 'photoLook'];
    const PAGE_BACK = ['name', 'look', 'size', 'photo', 'photoLook'];   // an unseen edit to one brings a deleted page back (moving it doesn't)
    const WIN_PARTS = ['rect', 'open', 'data', 'conf', 'label'];
    // The board's theme, accent color and text style (settings.theme, settings.accent and settings.accentColor,
    // settings.letters): on every device linked to the folder, the later change winning, as for a page's name. (The
    // device's other settings, and the page shown, stay its own.) Everything below that handles them goes through
    // STYLE_PARTS (tests/merge.js leaves 'accentColor' out of it to stand in for 2026.11.17-6, and 'letters' too for
    // 2026.11.16-4: the releases before them). accentColor: the accent chosen from 2026.11.18-2 ('' before any), see
    // accentShown.
    const STYLE_PARTS = ['theme', 'accent', 'letters', 'accentColor'], THEMES = ['light', 'dark', 'system'], LETTER_KEYS = ['standard', 'legible', 'early'];
    const STYLE_DEF = { theme: 'system', accent: 'blue', letters: 'standard', accentColor: '' };
    const styleOk = (k, v, H) => (k === 'theme' ? THEMES.includes(v) : k === 'accent' ? H.accentOk(v) : k === 'accentColor' ? v === '' || H.accentColorOk(v) : LETTER_KEYS.includes(v));
    const WID_RE = /^[\w.@~-]{1,120}$/, DEV_RE = /^[0-9a-z]{12}$/, KEY_RE = /^[0-9a-z]{1,40}$/, WIDGET_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
    const DAY = 864e5;
    // (remadeMs: a record a merge deleted, made again this long after it, is a change made after seeing that, see stamp)
    const DEF = { goneMs: 30 * DAY, peerGoneMs: 365 * DAY, aheadMs: DAY, undoMs: 20000, scale: 0.8, remadeMs: 10000 };
    const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    const vscale = v => (typeof v === 'number' && v >= 0.5 && v <= 2 ? v : null);
    const hj = v => hash53(JSON.stringify(v === undefined ? null : v));
    const NULL_H = hj(null), TRUE_H = hj(true), FALSE_H = hj(false);
    const sortBy = (list, key) => list.slice().sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
    const r2 = v => Math.round(v * 100) / 100;

    // ---- versions: [by, vv, t] (+ 'u': made by the Undo of a merge); inside, objects that also carry their part's
    // fingerprint h, the value (val, has) where it is known, and where the value is (src: 'local', 'pending' or a device)
    const leq = (a, b) => { for (const k in a) if (a[k] > (b[k] || 0)) return false; return true; };
    const vjoin = (a, b) => { const o = Object.assign({}, a); for (const k in b) if (!(o[k] >= b[k])) o[k] = b[k]; return o; };
    const nOf = v => v.vv[v.by] || 0;
    // v is older than w: w includes it, or w includes a later change to this part by v's device. (A device's changes to
    // a part follow one another, each made on what that device showed then; one that lost was kept as a copy by that
    // device at once. A version that joined others' vectors in, made by a device that kept a copy, emptied content or
    // found equal values, still names the device whose value it holds: a later change by that device replaces it, and
    // is no clash with that device's own older value.)
    const superseded = (v, w) => (leq(v.vv, w.vv) && !leq(w.vv, v.vv)) || (w.vv[v.by] || 0) > nOf(v);
    // v is within what a deletion's cover had seen: the vector, or that device's change at v's counter or a later one.
    const covered = (v, C) => leq(v.vv, C || {}) || ((C || {})[v.by] || 0) >= nOf(v);
    // (the vector's devices in one order: a version joined from the same ones in another order is the same version,
    // and its file and ledger mustn't change with it)
    const sortVV = vv => { const o = {}; for (const k of Object.keys(vv).sort()) o[k] = vv[k]; return o; };
    const arr = v => (v.u ? [v.by, sortVV(v.vv), v.t, 'u'] : [v.by, sortVV(v.vv), v.t]);
    const ver = (a, x) => Object.assign({ by: a[0], vv: a[1], t: a[2], u: a[3] === 'u' }, x);
    // 1 a version, 2 one this release doesn't know (a newer 21Board), 0 not one
    function okV(a) {
      if (!Array.isArray(a)) return 0;
      if (a.length > 4 || (a.length === 4 && a[3] !== 'u')) return typeof a[0] === 'string' && a[1] && typeof a[1] === 'object' ? 2 : 0;
      if (a.length < 3 || typeof a[0] !== 'string' || !KEY_RE.test(a[0]) || !a[1] || typeof a[1] !== 'object' || Array.isArray(a[1]) || typeof a[2] !== 'number' || !isFinite(a[2])) return 0;
      const ks = Object.keys(a[1]);
      if (!ks.length || ks.length > 500) return 0;
      for (const k of ks) if (!KEY_RE.test(k) || typeof a[1][k] !== 'number' || !isFinite(a[1][k]) || a[1][k] < 0) return 0;
      return a[1][a[0]] > 0 ? 1 : 0;
    }
    // Which of two concurrent versions is the later: the larger (n, by), then h. It decides where things go, never
    // whether something is kept. rank (set up only for Link's 'join' mode) puts this device's own versions first.
    const later = (a, b, rank) => (rank ? rank(a) - rank(b) : 0) || (nOf(a) - nOf(b)) || (a.by < b.by ? -1 : a.by > b.by ? 1 : 0) || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0);

    // The helpers the board passes in (tests/merge.js passes its own): a rect at another scale, a color, a photo's look.
    function helpers(o = {}) {
      return {
        scaleRect: o.scaleRect || ((r, k) => ({ x: r2(r.x * k), y: r2(r.y * k), w: r2(r.w * k), h: r2(Math.max(10, r.h - 40) * k + 40) })),
        bgColor: o.bgColor || (c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null)),
        look: o.normalizePhotoSettings || (v => (v && typeof v === 'object' ? v : null)),
        photoKeyOf: o.photoKeyOf || (m => (m ? `${m.addedAt}-${m.bytes}-${m.w}x${m.h}` : null)),
        canvasFor: o.canvasFor || (sc => ({ w: Math.round(1920 / sc), h: Math.round(1080 / sc) })),
        scale: o.defaultScale || DEF.scale,
        accentOk: o.accentOk || (k => typeof k === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(k)),   // (the board passes its own: a key of ACCENTS, 'pink' or 'teal')
        accentColorOk: o.accentColorOk || (k => typeof k === 'string' && /^(?:[a-z][a-z0-9-]{0,23}|#[0-9a-f]{6})$/.test(k)),   // (the board's: a key of ACCENTS or '#rrggbb')
        UID_RE: o.UID_RE || /^[A-Za-z0-9-]{8,64}$/, PHOTO_FILE_RE: o.PHOTO_FILE_RE || /^[0-9a-f]{32}\.(jpg|png|webp)$/
      };
    }
    // A part's fingerprint. A rect counts at scale 1, in whole px: rescaling a page doesn't move its windows.
    function partH(part, val, scale, H) {
      if (part === 'exists') return val ? '1' : '0';
      if (part === 'photo') return val || '-';
      if (part === 'rect') { const r = H.scaleRect(val.rect, scale); return hj([Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h), val.maximized ? 1 : 0]); }
      return hj(val);
    }
    // A place at scale 1, unrounded (the ledger keeps it beside a place's version, s1): rescaling a page converts every
    // place with rounding, so one in a hundred or so lands on another whole px. Within NEAR_PX of the version's, it is
    // the same place.
    const NEAR_PX = 0.5;
    const s1Of = (val, scale, H) => { const r = H.scaleRect(val.rect, scale); return [r.x, r.y, r.w, r.h, val.maximized ? 1 : 0]; };
    const nearS1 = (a, b) => Array.isArray(a) && a.length === 5 && a[4] === b[4] && [0, 1, 2, 3].every(i => Math.abs(a[i] - b[i]) < NEAR_PX);
    const normRect = r => { r = r && typeof r === 'object' ? r : {}; return { x: fin(r.x, 40), y: fin(r.y, 40), w: Math.max(20, fin(r.w, 400)), h: Math.max(50, fin(r.h, 340)) }; };
    const normLabel = c => (c && typeof c === 'object' && typeof c.wid === 'string' && WID_RE.test(c.wid) ? { wid: c.wid, from: String(c.from || '').slice(0, 40), name: String(c.name || '').slice(0, 60), at: fin(c.at, 0) } : null);
    function pageVals(v, H) {
      const bg = (v && v.background) || {}, scale = vscale(v && v.scale) || H.scale;
      return {
        name: v && typeof v.name === 'string' ? v.name.slice(0, 60) : 'My Board',
        look: { color: H.bgColor(bg.color), pattern: typeof bg.pattern === 'string' && /^[a-z-]{1,24}$/.test(bg.pattern) ? bg.pattern : 'none' },
        size: { scale, shape: v && v.shape === 'free' ? 'free' : '16:9' },
        pos: fin(v && v.pos, null)
      };
    }
    const rootOf = wid => wid.split('~')[0].slice(0, 113);
    const sameLabel = (lb, wid, v) => !!lb && lb.wid === wid && lb.from === v.by && lb.at === v.t;
    const copyWid = (wid, v) => `${rootOf(wid)}~${hash53(`${wid}:${v.by}:${nOf(v)}`).slice(0, 6)}`;
    // A window's identity on its page: <widget>@<createdAt>, then .2, .3... if that is taken.
    function newWid(widgetId, createdAt, taken) {
      const base = `${widgetId}@${fin(createdAt, 0)}`.slice(0, 110);
      let w = base;
      for (let k = 2; taken && taken.has(w); k++) w = `${base}.${k}`;
      return w;
    }
    // A running Task Timer kept as a copy is paused, the same way on every device, so a copy never rings a second alarm.
    const pauseTask = (v, t) => (v && typeof v === 'object' && v.running && typeof v.endsAt === 'number' ? Object.assign({}, v, { running: false, secondsLeft: Math.max(0, Math.ceil((v.endsAt - t) / 1000)), endsAt: null, alarm: false }) : v);

    // ---- the ledger in memory: { sync: link:sync's value, mine: { uid: link:mine-<uid>'s value } }. A change copies the
    // page's record (base: as it was stored), so records() can tell what to write.
    function ledger(sync, mines) {
      const mine = {};
      for (const m of mines || []) if (m && typeof m.uid === 'string') mine[m.uid] = m;
      return { sync: Object.assign({ v: 1 }, sync || {}), mine, base: Object.assign({}, mine) };
    }
    const own = l => ({ sync: Object.assign({}, l.sync), mine: Object.assign({}, l.mine), base: l.base || Object.assign({}, l.mine) });
    function records(l) {
      const put = [], del = [];
      for (const [uid, m] of Object.entries(l.mine)) if (m !== l.base[uid]) put.push({ key: `link:mine-${uid}`, value: m });
      for (const uid of Object.keys(l.base)) if (!l.mine[uid]) del.push(`link:mine-${uid}`);
      return { put, del };
    }
    const newMine = (uid, b) => ({ uid, b, p: {}, w: {}, hist: { at: 0, local: false }, quiet: null, gone: null, wgone: {} });
    // A page's fingerprint: whether it changed here since.
    const keepH = P => hash53(JSON.stringify([PAGE_PARTS.map(k => P.parts[k].h), sortBy(Array.from(P.wins.values()), W => W.wid).map(W => [W.wid].concat(WIN_PARTS.map(k => W.parts[k].h)))]));
    const winH = W => hash53(JSON.stringify(WIN_PARTS.map(k => W.parts[k].h)));
    const cloneMine = m => Object.assign({}, m, { p: Object.assign({}, m.p), w: Object.assign({}, m.w), wgone: Object.assign({}, m.wgone || {}), hist: Object.assign({}, m.hist || { at: 0, local: false }) });

    // settings, changed as set operations, so a tab with an old copy can't write its old lists over a merge's.
    // patch: { set: {key: value}, drop: [key], gone: [['add', b, at] | ['remove', b]], order: { b: [pos, uid] }, lastBoard }
    function patchSettings(stored, patch) {
      const s = Object.assign({}, stored || {});
      if (!patch) return s;
      if (patch.set) Object.assign(s, patch.set);
      for (const k of patch.drop || []) delete s[k];
      if (patch.gone && patch.gone.length) {
        const gone = (Array.isArray(s.deletedBoards) ? s.deletedBoards : []).map(Number), at = Object.assign({}, s.deletedAt);
        for (const [op, b, t] of patch.gone) {
          if (op === 'add') { if (!gone.includes(b)) gone.push(b); at[b] = t; } else { const i = gone.indexOf(b); if (i >= 0) gone.splice(i, 1); }
        }
        for (const k of Object.keys(at)) if (!gone.includes(+k)) delete at[k];
        s.deletedBoards = gone; s.deletedAt = at;
      }
      if (patch.order) {
        // the pages in board order, (pos, uid), with any this patch doesn't know (another tab's new page) after them
        const gone = new Set((Array.isArray(s.deletedBoards) ? s.deletedBoards : []).map(Number));
        const known = Object.keys(patch.order).map(Number).filter(b => !gone.has(b));
        const rest = (Array.isArray(s.boards) ? s.boards : []).map(Number).filter(b => !gone.has(b) && !(b in patch.order));
        s.boards = known.sort((a, b) => { const x = patch.order[a], y = patch.order[b]; return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : a - b); }).concat(rest);
      } else if (patch.gone && patch.gone.length && Array.isArray(s.boards)) {
        const gone = new Set(s.deletedBoards);
        s.boards = s.boards.filter(b => !gone.has(+b));
      }
      if (patch.lastBoard) s.lastBoard = Math.max(fin(+s.lastBoard, 1), patch.lastBoard);
      return s;
    }
    // Two patches waiting together (Writer): the later's keys win, set operations run in order.
    const joinPatches = (a, b) => ({ set: Object.assign({}, a && a.set, b && b.set), drop: Array.from(new Set(((a && a.drop) || []).concat((b && b.drop) || []))), gone: ((a && a.gone) || []).concat((b && b.gone) || []),
      order: (b && b.order) || (a && a.order) || undefined, lastBoard: Math.max((a && a.lastBoard) || 0, (b && b.lastBoard) || 0) || undefined });

    // ---- read: the records of this device (with rev, updatedAt, base, m, u) → its board as parts, by page uid and wid
    function read(recs, o = {}) {
      const H = helpers(o), st = o.settings || {}, now = fin(o.now, 0), undoMs = fin(o.undoMs, DEF.undoMs);
      const goneB = new Set((Array.isArray(st.deletedBoards) ? st.deletedBoards : []).map(Number)), at = st.deletedAt || {};
      const skipped = new Set(o.skipped || []), holdB = new Set(Array.from(o.holdPages || [], String));   // (page ids: a list or a Set)
      const boards = new Map(), revs = new Map(), byKey = new Map();
      const slot = b => { if (!boards.has(b)) boards.set(b, { rec: null, inst: new Map(), data: new Map(), conf: new Map(), media: {} }); return boards.get(b); };
      for (const r of recs || []) {
        if (!r || typeof r.key !== 'string') continue;
        revs.set(r.key, fin(r.rev, 0)); byKey.set(r.key, r);
        const p = r.key.split(':'), b = +p[1];
        if (!(b > 0)) continue;
        if (p[0] === 'board' && p.length === 2) slot(b).rec = r;
        else if (p[0] === 'media' && p.length === 3) slot(b).media[p[2]] = r;
        else if ((p[0] === 'inst' || p[0] === 'data' || p[0] === 'conf') && p.length === 4) slot(b)[p[0]].set(`${p[2]}:${p[3]}`, r);
      }
      const local = { H, pages: new Map(), byB: new Map(), nouid: [], settings: st, revs, recs: byKey, skipped, now, fixes: [], style: {} };
      // The theme, accent and text style, and when each was chosen here (themeAt, accentAt, lettersAt: see
      // updateSettings; for one chosen before it synced, the settings record's own time). chosen: someone picked it on
      // this device (not only the default, or a value from before 2026.11.16-4, or a text style from before 2026.11.17-2)
      const sr = byKey.get('settings'), sAt = sr ? fin(sr.updatedAt, now) : now;
      for (const k of STYLE_PARTS) {
        const val = styleOk(k, st[k], H) ? st[k] : STYLE_DEF[k], t = fin(st[k + 'At'], null);
        local.style[k] = { val, h: hj(val), at: t === null ? sAt : t, chosen: t !== null };
      }
      const lp = (key, val, h, rec, x) => Object.assign({ key, val, h, rev: rec ? fin(rec.rev, 0) : 0, at: rec ? fin(rec.updatedAt, null) : null,
        base: rec && typeof rec.base === 'number' ? rec.base : undefined, u: !!(rec && rec.u), m: !!(rec && rec.m), skipped: skipped.has(key) }, x);
      // (o.hcache, a Map the caller keeps between rounds: a record's fingerprints are worked out again only when its revision changes)
      const cache = o.hcache instanceof Map ? o.hcache : null, seen = cache ? new Set() : null;
      const hOf = (rec, tag, f) => {
        if (!cache || !rec) return f();
        const k = `${rec.key}#${tag}`, c = cache.get(k);
        seen.add(k);
        if (c && c.rev === rec.rev) return c.h;
        const h = f();
        cache.set(k, { rev: rec.rev, h });
        return h;
      };
      for (const b of Array.from(boards.keys()).sort((x, y) => x - y)) {
        const x = boards.get(b);
        if (!x.rec) continue;
        const v = x.rec.value && typeof x.rec.value === 'object' ? x.rec.value : {}, pv = pageVals(v, H);
        const age = now - fin(+at[b], 0), held = holdB.has(String(b)) || (goneB.has(b) && age >= 0 && age < undoMs);   // (a clock set back: not held for hours)
        const P = { uid: typeof v.uid === 'string' && H.UID_RE.test(v.uid) ? v.uid : null, b, key: `board:${b}`, rec: x.rec, value: v, scale: pv.size.scale,
          held, gone: goneB.has(b) && !held, parts: {}, wins: new Map(), all: [] };
        for (const k of ['name', 'look', 'size', 'pos']) P.parts[k] = lp(P.key, pv[k], hOf(x.rec, k, () => hj(pv[k])), x.rec);
        const ph = x.media.background, pl = x.media['background-look'];
        const media = ph && ph.value && typeof ph.value === 'object' && ph.value.w > 0 ? ph.value : null, pkey = media ? H.photoKeyOf(media) : null;
        P.parts.photo = lp(`media:${b}:background`, pkey, pkey || '-', ph, { media });
        const look = pl ? H.look(pl.value) : null;
        P.parts.photoLook = lp(`media:${b}:background-look`, look, pl ? hOf(pl, 'look', () => hj(look)) : NULL_H, pl);
        for (const [ik, ir] of Array.from(x.inst).sort((a, c) => (a[0] < c[0] ? -1 : 1))) {
          const iv = ir.value && typeof ir.value === 'object' ? ir.value : {}, [widgetId, nStr] = ik.split(':');
          const W = { wid: typeof iv.wid === 'string' && WID_RE.test(iv.wid) ? iv.wid : null, ikey: ik, widgetId, n: +nStr, createdAt: fin(iv.createdAt, fin(ir.updatedAt, 0)),
            z: fin(iv.z, 1), inst: iv, keys: { inst: `inst:${b}:${ik}`, data: `data:${b}:${ik}`, conf: `conf:${b}:${ik}` }, parts: {} };
          const rv = { rect: normRect(iv.rect), maximized: !!iv.maximized }, label = normLabel(iv.copyOf);
          W.parts.rect = lp(W.keys.inst, rv, hOf(ir, `rect@${P.scale}`, () => partH('rect', rv, P.scale, H)), ir);
          W.parts.open = lp(W.keys.inst, !!iv.open, iv.open ? TRUE_H : FALSE_H, ir);
          W.parts.label = lp(W.keys.inst, label, label ? hOf(ir, 'label', () => hj(label)) : NULL_H, ir);
          for (const kind of ['data', 'conf']) {
            const r = x[kind].get(ik), val = r && r.value !== undefined ? r.value : null;
            W.parts[kind] = lp(W.keys[kind], val, val === null ? NULL_H : hOf(r, kind, () => hj(val)), r);
          }
          P.all.push(W);
        }
        // "My Board" as a new or erased device has it: never synced (it would be added to every board that joins)
        P.placeholder = pv.name === 'My Board' && pv.look.color === null && pv.look.pattern === 'none' && pv.size.scale === H.scale && pv.size.shape === '16:9' && !pkey &&
          !P.all.some(W => W.parts.open.val || W.parts.data.val !== null || W.parts.conf.val !== null || W.parts.data.skipped || W.parts.conf.skipped);
        const taken = new Set();
        for (const W of P.all) if (W.wid && !taken.has(W.wid)) { taken.add(W.wid); P.wins.set(W.wid, W); }
        // (Import › Replace all pages puts new pages in place of the old ones with their uids, and the old ones wait for
        // their Undo: the page shown is the one that stands for its uid)
        const was = P.uid && local.pages.get(P.uid);
        if (!P.uid) local.nouid.push(P);
        else if (!was || ((was.held || was.gone) && !P.held && !P.gone)) local.pages.set(P.uid, P);
        local.byB.set(b, P);
      }
      if (cache) for (const k of Array.from(cache.keys())) if (!seen.has(k)) cache.delete(k);
      return local;
    }

    // ---- stamp: local changes since the ledger (from any tab, any code path) become versions. Mutates local with
    // its fixes (ids, places), which are written in the round's transaction (fixes; plan's writes include them).
    function stamp(ledger0, local, o = {}) {
      const L = own(ledger0), H = local.H, dev = o.dev, now = fin(o.now, 0), first = !!o.first;
      const fix = new Map();   // record key -> its new value (null: deleted)
      const fixVal = key => (fix.has(key) ? fix.get(key) : (local.recs.get(key) ? clone(local.recs.get(key).value) : null));
      const fixRev = key => Math.max((local.revs.get(key) || 0) + 1, now);
      let sp = null;
      // 1. fixes: a page without uid or pos, a window without wid or with another's
      for (const P of local.nouid) {
        P.uid = `${dev}-${P.b}-${fin(P.rec.rev, 0).toString(36)}`.slice(0, 64);
        fix.set(P.key, Object.assign(fixVal(P.key) || {}, { uid: P.uid }));
        if (!local.pages.has(P.uid)) local.pages.set(P.uid, P);
      }
      local.nouid = [];
      const live = Array.from(local.pages.values()).filter(P => !P.gone && !P.held);
      const order = (Array.isArray(local.settings.boards) ? local.settings.boards : []).map(Number).filter(b => live.some(P => P.b === b));
      live.filter(P => !order.includes(P.b)).forEach(P => order.push(P.b));
      for (const P of live) {
        if (P.parts.pos.val !== null) continue;
        const pos = order.indexOf(P.b) + 1;
        fix.set(P.key, Object.assign(fixVal(P.key) || {}, { pos }));
        Object.assign(P.parts.pos, { val: pos, h: hj(pos) });
      }
      for (const P of local.pages.values()) {
        const taken = new Set(P.wins.keys());
        for (const W of P.all) {
          if (W.wid && P.wins.get(W.wid) === W) continue;
          W.wid = newWid(W.widgetId, W.createdAt, taken);
          taken.add(W.wid); P.wins.set(W.wid, W);
          fix.set(W.keys.inst, Object.assign(fixVal(W.keys.inst) || {}, { wid: W.wid }));
        }
      }
      // the order's safety net: settings.boards is only a cache of (pos, uid)
      const byPos = sortBy(live, P => P.parts.pos.val).sort((a, c) => a.parts.pos.val - c.parts.pos.val || (a.uid < c.uid ? -1 : a.uid > c.uid ? 1 : 0)).map(P => P.b);
      if (!sameJSON(order, byPos)) { sp = { order: {} }; for (const P of live) sp.order[P.b] = [P.parts.pos.val, P.uid]; }

      // 2. what changed, found first (n is the newest edit time among them), then made into versions
      const items = [];
      let maxAt = 0;
      const note = at => { if (typeof at === 'number' && at > maxAt) maxAt = at; };
      const nv = (base, at, u) => n => arr({ by: dev, vv: vjoin(base || {}, { [dev]: n }), t: fin(at, now), u: !!u });
      const cloned = new Set();
      const mineOf = (uid, b) => { const m = cloned.has(uid) ? L.mine[uid] : L.mine[uid] ? cloneMine(L.mine[uid]) : newMine(uid, b); L.mine[uid] = m; cloned.add(uid); return m; };
      const touched = new Set();
      // A part: its ledger entry E (or none) against the record's P. set(E') puts the new entry.
      const part = (M, E, P, cover, set) => {
        if (!P || P.skipped) return;
        if (E && E.hold) {   // waiting for a photo that hasn't arrived: only a change made here counts
          if (P.h === E.h) return;
          note(P.at); items.push(n => { set({ h: P.h, v: nv(E.seen ? E.seen[1] : {}, P.at, P.u)(n), rev: P.rev }); touched.add(M); });
          return;
        }
        if (!E || !E.v) { note(P.at); items.push(n => { set(withS1({ h: P.h, v: nv(cover, P.at, P.u)(n), rev: P.rev }, P)); touched.add(M); }); return; }
        // (a place within NEAR_PX of the version's, at scale 1: the same place, rounded another way after a rescale here)
        const near = P.part === 'rect' && E.s1 && E.h !== P.h && E.lh !== P.h && nearS1(E.s1, s1Of(P.val, P.page.scale, H));
        if (E.h === P.h || (E.lh && E.lh === P.h) || near) {   // (lh: the same place, written at this page's scale by a merge, or rescaled here)
          const E1 = near ? Object.assign({}, E, { lh: P.h }) : E;
          // (still as the merge wrote it, or written again with its value by a tab that hadn't seen it, or by a later merge
          // that wrote another part of the record: what the merge noted stays, so a change another tab queued before the
          // merge, written only now, is still found to be one that never saw it)
          if (E.applied && (P.rev === E.applied || (typeof P.base === 'number' && P.base < E.applied) || (P.m && typeof P.base !== 'number'))) { if (E1.rev !== P.rev || E1 !== E) set(Object.assign({}, E1, { rev: P.rev })); return; }
          if (E1.rev !== P.rev || E.applied || E1 !== E) { const e = Object.assign({}, E1, { rev: P.rev }); for (const k of ['applied', 'prevH', 'prevHs', 'prevV', 'prevSc', 'val']) delete e[k]; set(e); }
          return;
        }
        // (not the Undo of a merge, nor a record a merge deleted (rev 0) made again well after that: Board history's Put
        // back, say. Each is based on the revision before the deletion (Known after MergeUI.undo's applyRecord, or
        // Raced.gone), as a stale tab's save is, but was made after seeing it)
        if (E.applied && typeof P.base === 'number' && P.base < E.applied && P.rev !== E.applied && !P.u && !(!E.rev && P.rev - E.applied > DEF.remadeMs)) {
          // written by a tab that hadn't seen the merge's write (§3.4)
          // (only an old value carried along: the merged one is put back, by a merge write of its own, so that this tab's
          // next save, based on its own write, is still found to be one that never saw the merge)
          const ph = P.part === 'rect' && E.prevSc ? partH('rect', P.val, E.prevSc, H) : P.h;
          if ([P.h, ph].some(h => h === E.prevH || (E.prevHs || []).includes(h)) && 'val' in E) { restore(P, E.val, E.h); set(Object.assign({}, E, { rev: fixRev(P.key), applied: fixRev(P.key) })); return; }
          note(P.at);
          items.push(n => { set(withS1(clean({ h: P.h, v: nv(E.prevV ? E.prevV[1] : {}, P.at, P.u)(n), rev: P.rev, pending: (E.pending || []).concat('val' in E ? [{ v: E.v, val: E.val, h: E.h }] : []) }), P)); touched.add(M); });
          return;
        }
        note(P.at); items.push(n => { set(withS1(clean({ h: P.h, v: nv(E.v[1], P.at, P.u)(n), rev: P.rev, pending: E.pending }), P)); touched.add(M); });
      };
      const withS1 = (e, P) => (P.part === 'rect' ? Object.assign(e, { s1: s1Of(P.val, P.page.scale, H) }) : e);
      const clean = e => { if (!e.pending || !e.pending.length) delete e.pending; return e; };
      // A part's merged value put back in its record (a write that only carried the old one).
      const restore = (P, val, h) => {
        const v = fix.has(P.key) || local.recs.get(P.key) ? fixVal(P.key) : null, k = P.key.split(':')[0];
        let out = v;
        if (P === P.page.parts.name) out = Object.assign(v || {}, { name: val });
        else if (P === P.page.parts.look) out = Object.assign(v || {}, { background: clone(val) });
        else if (P === P.page.parts.size) out = Object.assign(v || {}, { scale: val.scale, shape: val.shape });
        else if (P === P.page.parts.pos) out = Object.assign(v || {}, { pos: val });
        else if (k === 'inst' && P.part === 'rect') out = Object.assign(v || {}, { rect: clone(val.rect), maximized: !!val.maximized });
        else if (k === 'inst' && P.part === 'open') out = Object.assign(v || {}, { open: !!val });
        else if (k === 'inst' && P.part === 'label') out = Object.assign(v || {}, { copyOf: clone(val) });
        else out = clone(val);
        fix.set(P.key, out);
        P.val = clone(val); P.h = h; P.rev = fixRev(P.key);
      };
      for (const P of local.pages.values()) {
        for (const k of PAGE_PARTS) P.parts[k].page = P;
        for (const W of P.all) for (const k of WIN_PARTS) { W.parts[k].page = P; W.parts[k].part = k; }
      }
      const seenPages = new Set();
      // (what a first round found deleted here: the folder's version is taken, from the other devices' files only; this
      // device's own file, merged in a first round, has its own older version of it, which mustn't come back as a clash)
      const dropped1 = new Set();
      // Windows in the ledger that are gone from their page: deleted here (a window tombstone, apart from the page's).
      const winsGone = (M, P) => {
        for (const wid of Object.keys(M.w)) {
          if (P.wins.has(wid)) continue;
          const mw = M.w[wid];
          if (first) { delete M.w[wid]; dropped1.add(`${P.uid} ${wid}`); continue; }   // (a first round deletes nothing: the folder's version is taken)
          note(now);
          items.push(n => {
            const cover = {};
            // (and every change this device made to it before: one its entry no longer names, after the page came back
            // with another device's version, say, was still seen here)
            for (const k of WIN_PARTS) if (mw.p[k] && mw.p[k].v) cover[k] = vjoin(mw.p[k].v[1], { [dev]: n });
            M.wgone[wid] = { exists: nv(mw.p.exists ? mw.p.exists.v[1] : {}, now)(n), cover, seq: null, seen: now };
            delete M.w[wid]; touched.add(M);
          });
        }
      };
      for (const P of Array.from(local.pages.values()).sort((a, c) => a.b - c.b)) {
        // A page deleted here (its Undo still offered, or its records not cleared yet): nothing is stamped but the
        // windows deleted from it before it was, so that if it comes back (an edit made elsewhere), they don't.
        if (P.held || P.gone) {
          const M0 = L.mine[P.uid];
          if (M0 && !M0.gone && o.mode !== 'take' && Object.keys(M0.w).some(wid => !P.wins.has(wid))) winsGone(mineOf(P.uid, P.b), P);
          continue;
        }
        const uid = P.uid;
        // never synced; (take: the folder's board replaces this one; dropHere: this device's own pages a take still has to
        // remove here, once another page is shown)
        if ((!L.mine[uid] && P.placeholder) || o.mode === 'take' || (!L.mine[uid] && o.dropHere && o.dropHere.has(uid))) continue;
        if (L.mine[uid] && L.mine[uid].keep && L.mine[uid].keep === keepH(P)) continue;   // deleted elsewhere, still shown here, and not edited since
        seenPages.add(uid);
        const M = mineOf(uid, P.b);
        M.b = P.b;
        const back = M.gone;   // back here after a deletion (Undo, Bring back, re-created): built on the tombstone
        const pc = back ? M.gone.cover || {} : null;
        if (back) {
          note(now);
          items.push(n => { M.p = { exists: { h: '1', v: nv(back.exists[1], now)(n), rev: P.rev } }; M.gone = null; delete M.keep; delete M.keepW; touched.add(M); });
        } else if (!M.p.exists) { note(P.parts.name.at); items.push(n => { M.p.exists = { h: '1', v: nv({}, P.parts.name.at)(n), rev: P.rev }; touched.add(M); }); }
        else if (M.p.exists.rev !== P.rev) M.p.exists = Object.assign({}, M.p.exists, { rev: P.rev });
        for (const k of PAGE_PARTS) part(M, back ? null : M.p[k], P.parts[k], pc ? pc[k] : null, e => { M.p[k] = e; });
        for (const W of Array.from(P.wins.values())) {
          // (the page kept shown here although deleted elsewhere, and brought back by an edit made here: a window on it
          // that was deleted elsewhere too, and is as it was then, stays deleted)
          if (back && M.keepW && M.keepW[W.wid] === winH(W) && M.wgone[W.wid]) continue;
          const mw0 = back ? null : M.w[W.wid], tomb = !mw0 && M.wgone[W.wid];
          const mw = M.w[W.wid] = mw0 ? Object.assign({}, mw0, { ikey: W.ikey, p: Object.assign({}, mw0.p) }) : { ikey: W.ikey, p: {} };
          const cov = k => (back ? pc[`${W.wid}/${k}`] : tomb ? (tomb.cover || {})[k] : null);
          if (!mw0) {
            note(tomb ? now : W.parts.rect.at);
            items.push(n => { mw.p.exists = { h: '1', v: nv(tomb ? tomb.exists[1] : back ? pc[`${W.wid}/exists`] : {}, tomb ? now : W.parts.rect.at)(n), rev: W.parts.rect.rev }; delete M.wgone[W.wid]; touched.add(M); });
          } else if (mw.p.exists && mw.p.exists.rev !== W.parts.rect.rev) mw.p.exists = Object.assign({}, mw.p.exists, { rev: W.parts.rect.rev });
          for (const k of WIN_PARTS) part(M, mw0 ? mw0.p[k] : null, W.parts[k], cov(k), e => { mw.p[k] = e; });
        }
        // windows in the ledger that aren't here now: deleted here
        if (!back) winsGone(M, P);
      }
      // pages in the ledger that aren't here now (deleted here, past their Undo)
      for (const uid of Object.keys(L.mine)) {
        if (seenPages.has(uid)) continue;
        const P = local.pages.get(uid), M0 = L.mine[uid];
        if (M0.gone || (P && P.held) || o.mode === 'take') continue;
        if (P && !P.gone) continue;   // (here, but not stamped: a placeholder the ledger has, say)
        if (first) { delete L.mine[uid]; dropped1.add(uid); continue; }
        const M = mineOf(uid, M0.b);
        note(now);
        items.push(n => {
          const cover = {};
          for (const k of PAGE_PARTS) if (M.p[k] && M.p[k].v) cover[k] = vjoin(M.p[k].v[1], { [dev]: n });
          for (const [wid, mw] of Object.entries(M.w)) for (const k of WIN_PARTS.concat('exists')) if (mw.p[k] && mw.p[k].v) cover[`${wid}/${k}`] = vjoin(mw.p[k].v[1], { [dev]: n });
          M.gone = { exists: nv(M.p.exists ? M.p.exists.v[1] : {}, now)(n), cover, seq: null, seen: now };
          M.p = {}; M.w = {}; touched.add(M);
        });
      }
      // 3. the theme, accent and text style. A change made here is a version whose counter is when it was made (themeAt,
      // accentAt, lettersAt), not the newest change stamped with it, so that two made apart (one while unlinked, say)
      // resolve to the later on every device. A value this device had before it synced with this folder (joining it or
      // switching to it) is no change: only its fingerprint is noted, and the folder's applies. Nor is one never chosen
      // here: a value from before 2026.11.16-4 (2026.11.17-2 for the text style), or one only received, which a ledger
      // rebuilt from an own file older than the last merge doesn't have. A ledger of this folder from before then has no
      // entry for it: one chosen here since (on this release, before its first round: Chrome asking to Reconnect the
      // folder after the update, say) is a change, as old as the choice. An empty folder (seed) gets this device's, as
      // old as the choice (the counters it brings from another folder say nothing about when that was; ctr is still
      // raised to it, so later stamps stay above it); one never chosen here (the default) as the oldest version there
      // can be, so that a choice made on another device that set up the same folder at once, before either had the
      // other's file, wins on both. (Neither chose one: the tie goes by device id, the same on every device.)
      const style = Object.assign({}, L.sync.style), fresh = o.mode === 'join' || o.mode === 'take';
      let sn = 0, styled = 0;
      for (const k of STYLE_PARTS) {
        const lp = local.style && local.style[k], E = style[k];
        if (!lp || (E && E.h === lp.h)) continue;
        if (o.mode !== 'seed' && (!lp.chosen || (!E && fresh))) { style[k] = { h: lp.h }; continue; }
        const low = !E && !lp.chosen, n = low ? 1 : !E ? Math.max(1, fin(lp.at, now)) : Math.max(fin(lp.at, now), fin(o.ctr, 0) + 1, fin(o.maxSeen, 0) + 1);
        style[k] = { h: lp.h, v: arr({ by: dev, vv: vjoin(E && E.v ? E.v[1] : {}, { [dev]: n }), t: low ? 0 : fin(lp.at, now), u: false }) };
        sn = Math.max(sn, n); styled++;
      }
      if (!sameJSON(style, L.sync.style || {})) L.sync = Object.assign({}, L.sync, { style });
      let ctr = fin(o.ctr, 0);
      if (items.length) { ctr = Math.max(maxAt, ctr + 1, fin(o.maxSeen, 0) + 1); for (const f of items) f(ctr); }
      ctr = Math.max(ctr, sn);
      for (const M of touched) M.hist = Object.assign({}, M.hist, { local: true });
      for (const uid of cloned) if (L.mine[uid] && ledger0.mine[uid] && sameJSON(L.mine[uid], ledger0.mine[uid])) L.mine[uid] = ledger0.mine[uid];   // (unchanged: not written again)
      L.sync.ctr = ctr;
      const fixes = [];
      for (const [key, value] of fix) {
        const type = key.split(':')[0];
        fixes.push(value === null ? { key, del: true } : { key, type, value, rev: fixRev(key) });
      }
      local.fixes = fixes;
      for (const f of fixes) { const r = local.recs.get(f.key); if (r && !f.del) local.recs.set(f.key, Object.assign({}, r, { value: f.value, rev: f.rev })); }
      const rr = records(L);
      if (dropped1.size) L.dropped1 = dropped1;
      return { ledger: L, ctr, fixes, settings: sp, stamped: items.length + styled, partsChanged: items.length > 0 || fixes.length > 0 || styled > 0, put: rr.put, del: rr.del };
    }

    // ---- join: the ledger and the peers' files → for each part, the versions no other includes (the later main, and
    // for content the concurrent ones pending), and where each value is.
    function viewsOf(ledger, peers, dev) {
      const pages = new Map(), dropped = (ledger.sync && ledger.sync.dropped) || {};
      // (a deletion this device has collected (gc): the other devices' files may still hold it for a while, and it isn't
      // taken back from them)
      const collected = (k, T) => !!dropped[k] && leq(T.vv, dropped[k].vv);
      const pv = uid => { if (!pages.has(uid)) pages.set(uid, { exists: [], parts: {}, wins: new Map(), inPeers: false, ident: null }); return pages.get(uid); };
      const wv = (p, wid) => { if (!p.wins.has(wid)) p.wins.set(wid, { exists: [], parts: {}, ident: null }); return p.wins.get(wid); };
      const add = (o, k, v) => { (o[k] || (o[k] = [])).push(v); };
      for (const [uid, M] of Object.entries(ledger.mine)) {
        const p = pv(uid);
        if (M.gone) p.exists.push(ver(M.gone.exists, { h: '0', val: false, has: true, src: 'local', cover: M.gone.cover || {} }));
        else if (M.p && M.p.exists && M.p.exists.v) p.exists.push(ver(M.p.exists.v, { h: '1', val: true, has: true, src: 'local' }));
        for (const k of PAGE_PARTS) {
          const E = M.p && M.p[k];
          if (!E || !E.v) continue;
          add(p.parts, k, ver(E.v, { h: E.h, src: 'local', ref: E.ref }));
          for (const q of E.pending || []) add(p.parts, k, ver(q.v, { h: q.h, val: q.val, has: true, src: 'pending' }));
        }
        for (const [wid, mw] of Object.entries(M.w || {})) {
          const w = wv(p, wid), [widgetId, nStr] = String(mw.ikey || '').split(':');
          w.ident = w.ident || { widgetId, n: +nStr || 1 };
          if (mw.p.exists && mw.p.exists.v) w.exists.push(ver(mw.p.exists.v, { h: '1', val: true, has: true, src: 'local' }));
          for (const k of WIN_PARTS) {
            const E = mw.p[k];
            if (!E || !E.v) continue;
            add(w.parts, k, ver(E.v, { h: E.h, src: 'local' }));
            for (const q of E.pending || []) add(w.parts, k, ver(q.v, { h: q.h, val: q.val, has: true, src: 'pending' }));
          }
        }
        for (const [wid, T] of Object.entries(M.wgone || {})) wv(p, wid).exists.push(ver(T.exists, { h: '0', val: false, has: true, src: 'local', cover: T.cover || {} }));
      }
      const drop1 = ledger.dropped1 || new Set();
      for (const peer of peers) {
        for (const [uid, pp] of peer.pages) {
          if (peer.dev === dev && drop1.has(uid)) continue;
          const p = pv(uid);
          if (peer.dev !== dev) p.inPeers = true;
          p.exists.push(pp.exists);
          for (const k of PAGE_PARTS) if (pp.parts[k]) add(p.parts, k, pp.parts[k]);
          for (const [wid, pw] of pp.wins) {
            if (peer.dev === dev && drop1.has(`${uid} ${wid}`)) continue;
            const w = wv(p, wid);
            w.ident = w.ident || pw.ident;
            w.exists.push(pw.exists);
            for (const k of WIN_PARTS) if (pw.parts[k]) add(w.parts, k, pw.parts[k]);
            for (const q of pw.pending) add(w.parts, 'data', q);
          }
        }
        for (const [uid, T] of peer.gone.pages) { if (collected(uid, T)) continue; const p = pv(uid); if (peer.dev !== dev) p.inPeers = true; p.exists.push(T); }
        for (const T of peer.gone.wins.values()) if (!collected(`${T.page} ${T.wid}`, T.exists)) wv(pv(T.page), T.wid).exists.push(T.exists);
      }
      return pages;
    }
    // One part's versions → { main, pending }: dominated versions go, equal values become one (vectors joined), the later
    // is main. kind 'data': the others stay pending (both kept), and an emptied (null) one gives way to content;
    // 'lww': the later wins and its vector joins the others'.
    function joinVers(list, kind, dev, rank) {
      let vs = list.filter(Boolean);
      if (!vs.length) return null;
      const covers = vs.filter(v => v.cover);
      const merge = (g, v) => {
        const top = later(v, g, rank) > 0 ? v : g, other = top === v ? g : v;
        const out = Object.assign({}, top, { vv: vjoin(g.vv, v.vv) });
        if (other.src === 'local' && top.src !== 'local') { out.src = 'local'; out.has = other.has; out.val = other.val; out.scale = other.scale; out.ref = other.ref || top.ref; }
        else if (!top.has && other.has && top.src !== 'local') { out.has = true; out.val = other.val; out.src = other.src; out.scale = other.scale; }
        if (g.cover || v.cover) out.cover = vjoin(g.cover || {}, v.cover || {});
        if (!out.ref) out.ref = other.ref;
        return out;
      };
      for (let guard = 0; guard < 50; guard++) {
        const keep = [];
        for (const v0 of vs) {
          if (vs.some(w => w !== v0 && superseded(v0, w))) continue;
          // (what a version it replaces only by its device's later change had settled stays settled: its vector joins in)
          let v = v0;
          for (const u of vs) if (u !== v0 && !leq(u.vv, v.vv) && superseded(u, v0)) v = Object.assign({}, v, { vv: vjoin(v.vv, u.vv) });
          const i = keep.findIndex(w => w.h === v.h);
          if (i >= 0) keep[i] = merge(keep[i], v); else keep.push(v);
        }
        const same = keep.length === vs.length;
        vs = keep;
        if (same) break;
      }
      vs.sort((a, b) => later(b, a, rank));
      const J = { main: null, pending: [], clash: vs.length > 1, mine: vs.some(v => v.by === dev), devs: vs.map(v => v.by) };
      if (kind === 'data') {
        const content = vs.filter(v => v.h !== NULL_H), empty = vs.filter(v => v.h === NULL_H);
        if (content.length && empty.length) {
          J.main = Object.assign({}, content[0], { vv: empty.reduce((a, v) => vjoin(a, v.vv), content[0].vv) });
          J.pending = content.slice(1);
        } else { J.main = vs[0]; J.pending = vs.slice(1); }
      } else J.main = Object.assign({}, vs[0], { vv: vs.reduce((a, v) => vjoin(a, v.vv), {}) });
      if (covers.length) J.cover = covers.reduce((a, v) => { for (const k in v.cover) a[k] = vjoin(a[k] || {}, v.cover[k]); return a; }, {});
      return J;
    }
    function join(ledger0, peers, o = {}) {
      const dev = o.dev, now = fin(o.now, 0), mode = o.mode || null, isLater = o.isLater || (() => false);
      const views = viewsOf(ledger0, peers || [], dev);
      const state = { pages: new Map(), dev, mode, maxSeen: fin(ledger0.sync && ledger0.sync.maxSeen, 0), peers: [] };
      for (const peer of peers || []) {
        if (peer.dev === dev) continue;
        state.peers.push({ dev: peer.dev, seq: peer.seq, name: peer.name, at: peer.at, left: peer.left, folder: peer.folder });
        let m = 0;
        const see = v => { if (v && v.by !== dev) { const n = nOf(v); if (n > m) m = n; } };
        for (const pp of peer.pages.values()) { see(pp.exists); for (const k in pp.parts) see(pp.parts[k]); for (const pw of pp.wins.values()) { see(pw.exists); for (const k in pw.parts) see(pw.parts[k]); pw.pending.forEach(see); } }
        for (const T of peer.gone.pages.values()) see(T);
        for (const k in peer.style || {}) see(peer.style[k]);
        state.maxSeen = Math.max(state.maxSeen, Math.min(m, now + fin(o.aheadMax, DEF.aheadMs)));
      }
      for (const [uid, p] of views) {
        // 'join' (a device that never synced, joining a folder with a board): for pages both have, the folder's values stay
        const rank = mode === 'join' && p.inPeers ? v => (v.by === dev && (v.src === 'local' || v.src === 'pending') ? 0 : 1) : null;
        const S = { uid, exists: joinVers(p.exists, 'lww', dev, rank), parts: {}, wins: new Map(), inPeers: p.inPeers };
        if (!S.exists) continue;
        S.cover = S.exists.cover || null;
        // (and where the folder deleted the page or a window on it, this device's versions of it are its old copy, not
        // edits made since: the deletion covers them, and the Board history version saved before joining keeps them)
        const mineOf = list => (list || []).filter(v => v.by === dev && (v.src === 'local' || v.src === 'pending'));
        const coverMine = (C, key, list) => { for (const v of mineOf(list)) C[key] = vjoin(C[key] || {}, v.vv); };
        if (rank && S.exists.main.h === '0' && S.cover) {
          S.cover = Object.assign({}, S.cover);
          for (const k of PAGE_PARTS) coverMine(S.cover, k, p.parts[k]);
          for (const [wid, w] of p.wins) { coverMine(S.cover, `${wid}/exists`, w.exists); for (const k of WIN_PARTS) coverMine(S.cover, `${wid}/${k}`, w.parts[k]); }
        }
        for (const k of PAGE_PARTS) if (p.parts[k]) S.parts[k] = joinVers(p.parts[k], 'lww', dev, rank);
        for (const [wid, w] of p.wins) {
          const ex = joinVers(w.exists, 'lww', dev, rank);
          if (!ex) continue;
          const SW = { wid, ident: w.ident || { widgetId: wid.split('@')[0], n: 1 }, exists: ex, cover: ex.cover || null, parts: {} };
          if (rank && ex.main.h === '0' && SW.cover) { SW.cover = Object.assign({}, SW.cover); for (const k of WIN_PARTS) coverMine(SW.cover, k, w.parts[k]); }
          for (const k of WIN_PARTS) if (w.parts[k]) SW.parts[k] = joinVers(w.parts[k], k === 'data' && !isLater(SW.ident.widgetId) ? 'data' : 'lww', dev, rank);
          // (content a deletion of the window or its page had seen, still pending: it was deleted on purpose, and isn't
          // kept as a copy if an edit the deletion hadn't seen brings the window back. It joins the window's own version,
          // so that it stays settled once the deletion is no longer in any file.)
          const dc = [SW.cover && SW.cover.data, S.cover && S.cover[`${wid}/data`]].filter(Boolean), J = SW.parts.data;
          const gone = J && dc.length ? J.pending.filter(v => dc.some(C => covered(v, C))) : [];
          if (gone.length) SW.parts.data = Object.assign({}, J, { main: Object.assign({}, J.main, { vv: gone.reduce((a, v) => vjoin(a, v.vv), J.main.vv) }), pending: J.pending.filter(v => !gone.includes(v)) });
          const d = SW.parts.data;
          // the copy of a losing version is made by its author, or by anyone once the author is idle or gone (§4.2)
          if (d && d.pending.length) d.copy = d.pending.filter(v => v.by === dev || (o.idle && o.idle(v.by)) || (o.left && o.left(v.by)));
          S.wins.set(wid, SW);
        }
        state.pages.set(uid, S);
      }
      // the theme, accent and text style: the later change ('join': the folder's before this device's)
      state.style = {};
      for (const k of STYLE_PARTS) {
        const E = ((ledger0.sync || {}).style || {})[k], list = (peers || []).map(p => p.style && p.style[k]).filter(Boolean);
        if (E && E.v) list.push(ver(E.v, { h: E.h, src: 'local' }));
        const J = joinVers(list, 'lww', dev, mode === 'join' ? v => (v.by === dev && v.src === 'local' ? 0 : 1) : null);
        if (J) state.style[k] = J;
      }
      return state;
    }
    // Which pages and windows show, from the joined state alone (every device agrees): a deleted one shows again
    // if some version of a part that brings it back isn't covered by what its deleter had seen.
    function shown(state) {
      const pages = new Set(), wins = new Map();
      const out = (J, cover, open) => !!J && [J.main].concat(J.pending).some(v => (!open || v.h === TRUE_H) && !covered(v, cover));
      for (const [uid, S] of state.pages) {
        const alive = new Set();
        for (const [wid, W] of S.wins) {
          if (W.exists.main.h === '1' || (W.cover && WIN_PARTS.some(k => out(W.parts[k], W.cover[k], k === 'open')))) alive.add(wid);
        }
        let on = S.exists.main.h === '1';
        if (!on && S.cover) {
          on = PAGE_BACK.some(k => out(S.parts[k], S.cover[k])) ||
            Array.from(alive).some(wid => { const W = S.wins.get(wid); return !covered(W.exists.main, S.cover[`${wid}/exists`]) || WIN_PARTS.some(k => out(W.parts[k], S.cover[`${wid}/${k}`], k === 'open')); });
        }
        if (on) { pages.add(uid); wins.set(uid, alive); }
      }
      return { pages, wins };
    }
    // The pages whose winning photo is another device's: their pictures, read from Photos, go to plan as opts.photos.
    function photosWanted(state, local) {
      const out = [], sh = shown(state);
      for (const [uid, S] of state.pages) {
        const J = S.parts.photo, P = local.pages.get(uid);
        if (!sh.pages.has(uid) || !J || J.main.src === 'local' || J.main.h === '-' || (P && P.parts.photo.h === J.main.h)) continue;
        out.push({ uid, key: J.main.val, ref: J.main.ref || null });
      }
      return out;
    }

    // ---- plan: the writes, ledger and settings that make this device show the joined state, honoring holds; copies
    // made here; the summary for messages and Board history. Pass the same now as to stamp.
    function plan(state, local, ledger0, o = {}) {
      const H = local.H, dev = o.dev, now = fin(o.now, 0), mode = o.mode || state.mode || null;
      const L = own(ledger0), sh = shown(state);
      // (a counter for the versions the plan makes: o.n only if it hasn't been given out yet, never the stamp's, which a
      // version already published may have)
      let n = fin(o.n, 0) > fin(L.sync.ctr, 0) ? fin(o.n, 0) : 0;
      const N = () => n || (n = Math.max(fin(L.sync.ctr, 0) + 1, fin(state.maxSeen, 0) + 1, now));
      const nv = (base, t) => ({ by: dev, vv: vjoin(base || {}, { [dev]: N() }), t: fin(t, now), u: false });
      const W = new Map(), ifRev = {};
      const revOf = key => local.revs.get(key) || 0;
      const put = (key, type, value) => { ifRev[key] = revOf(key); const rev = Math.max(revOf(key) + 1, now); W.set(key, { key, type, value, rev }); return rev; };
      const del = key => { if (local.revs.has(key) || W.has(key)) { ifRev[key] = revOf(key); W.set(key, { key, del: true }); } return -1; };   // (-1: written, as no record)
      for (const f of local.fixes || []) { ifRev[f.key] = revOf(f.key); W.set(f.key, f.del ? { key: f.key, del: true } : Object.assign({}, f, { rev: Math.max(revOf(f.key) + 1, now) })); }
      // (switching to another folder's board isn't held back by a busy window: what it showed is in the Board history
      // version saved before switching, §3.5)
      const holdP = new Set(o.holds && o.holds.pages || []), holdW = new Set(mode === 'take' ? [] : o.holds && o.holds.wins || []), histFailed = new Set(o.histFailed || []);
      const dropHere = new Set(o.dropHere || []);   // (this device's own pages that an earlier take still has to remove here)
      const photos = o.photos || {}, isLater = o.isLater || (() => false), isSingle = o.isSingle || (() => false);
      const nameOf = d => (typeof o.names === 'function' ? o.names(d) : o.names && o.names[d]) || '';
      // (new page ids: o.freeIds.board() from the board, which also knows the ids Board history still uses; or a list, or the first free id)
      const free = Array.isArray(o.freeIds) ? o.freeIds.slice() : [];
      let nextB = typeof o.freeIds === 'number' ? o.freeIds : Math.max(0, fin(+local.settings.lastBoard, 0), ...Array.from(local.byB.keys())) + 1;
      const newB = () => (o.freeIds && typeof o.freeIds.board === 'function' ? o.freeIds.board() : free.length ? free.shift() : nextB++);
      const sum = { from: [], pages: {}, leave: null, placeholder: false, dropHere: [], held: 0, style: [] }, from = new Set();
      const undo = { swaps: [], skip: [] };
      const sp = { gone: [], order: {}, lastBoard: 0 };
      const ps = (uid, b) => sum.pages[uid] || (sum.pages[uid] = { b, name: '', changed: false, added: false, deleted: false, back: false, here: false, placeholder: false,
        renamed: null, risky: false, undone: null, mineUndone: null, clashes: [], quiet: false, from: [] });
      const valOf = (V, lp) => (V.src === 'local' ? (lp ? lp.val : null) : V.val);
      const anyShown = sh.pages.size > 0;
      const posOf = S2 => { const J = S2.parts.pos; if (!J) return 0; return fin(J.main.src === 'local' ? (local.pages.get(S2.uid) || { parts: { pos: {} } }).parts.pos.val : J.main.val, 0); };
      let joinTop = null;
      const joinOrder = [];
      if (mode === 'join') {
        for (const S2 of state.pages.values()) if (sh.pages.has(S2.uid)) { if (S2.inPeers) joinTop = Math.max(joinTop === null ? -Infinity : joinTop, posOf(S2)); else joinOrder.push(S2); }
        joinOrder.sort((a, c) => posOf(a) - posOf(c) || (a.uid < c.uid ? -1 : 1));
        joinOrder.splice(0, joinOrder.length, ...joinOrder.map(S2 => S2.uid));
      }
      const setMine = (uid, m) => { if (!L.mine[uid] || !sameJSON(L.mine[uid], m)) L.mine[uid] = m; };
      const tomb = (J, cover, T0) => ({ exists: arr(J.main), cover: cover || {}, seq: T0 ? T0.seq : null, seen: T0 ? T0.seen : now });
      // The value a part's entry carries in the ledger, and the entry itself.
      const pendOf = (J, lp) => J.pending.map(p => ({ v: arr(p), val: p.src === 'local' ? (lp ? lp.val : null) : p.val, h: p.h }));
      const entry = (J, lp, oldE, wrote, val, extra) => {
        const e = { h: J.main.h, v: arr(J.main), rev: wrote === -1 ? 0 : wrote || (lp ? lp.rev : 0) };
        if (J.pending.length) e.pending = pendOf(J, lp);
        if (wrote && (!oldE || oldE.h !== J.main.h)) {
          e.applied = wrote === -1 ? now : wrote;
          // (an earlier merge of this part that no write here has been based on yet: what was before it, and what it
          // wrote, count as old values too, see stamp; a change made without seeing either is concurrent with both)
          if (oldE && oldE.applied && (oldE.prevV || oldE.prevH)) Object.assign(e, { prevH: oldE.prevH, prevHs: Array.from(new Set((oldE.prevHs || []).concat(oldE.h))).slice(-8) }, oldE.prevV ? { prevV: oldE.prevV } : {});
          else if (oldE && oldE.v) { e.prevH = oldE.h; e.prevV = oldE.v; }
          // (no entry yet: a take, or a page shown here that the ledger had no part of. What this record held is still
          // the old value a tab that hadn't seen this write may save)
          else if (!oldE && lp && !lp.skipped) e.prevH = lp.h;
          if (val !== undefined) e.val = clone(val === undefined ? null : val);
        } else if (!wrote && oldE && oldE.applied && oldE.h === J.main.h) for (const k of ['applied', 'prevH', 'prevHs', 'prevV', 'prevSc', 'val']) if (k in oldE) e[k] = oldE[k];   // (kept until a write based on it: see stamp)
        return Object.assign(e, extra);
      };
      const uids = sortBy(Array.from(new Set(Array.from(state.pages.keys()).concat(Array.from(local.pages.keys())))), x => x);
      for (const uid of uids) {
        const S0 = state.pages.get(uid), LP = local.pages.get(uid), M = L.mine[uid];
        const S = S0 && Object.assign({}, S0, { parts: Object.assign({}, S0.parts) });
        if ((LP && LP.held) || holdP.has(uid)) { if (LP && !LP.gone) sp.order[LP.b] = [LP.parts.pos.val, uid]; continue; }
        if (!S) {
          // not in the ledger or the folder: an untouched placeholder (it goes once the folder has a board), or, when
          // switching to another folder's board, this device's own pages (deleted here only, and kept in Board history)
          if (!LP || LP.gone) continue;
          if ((LP.placeholder && anyShown) || mode === 'take' || dropHere.has(uid)) {
            if (uid === o.pageShown) { sum.leave = uid; sum.placeholder = !!LP.placeholder; sp.order[LP.b] = [LP.parts.pos.val, uid]; if (!LP.placeholder) sum.dropHere.push(uid); continue; }
            sp.gone.push(['add', LP.b, now]);
            Object.assign(ps(uid, LP.b), { deleted: true, here: true, placeholder: LP.placeholder, risky: !LP.placeholder, name: LP.parts.name.val });
          } else sp.order[LP.b] = [LP.parts.pos.val, uid];
          continue;
        }
        const show = sh.pages.has(uid);
        if (!show) {
          const wgone = {};
          for (const [wid, SW] of S.wins) if (SW.exists.main.h === '0') wgone[wid] = tomb(SW.exists, SW.cover, M && M.wgone && M.wgone[wid]);
          if (LP && !LP.gone) {
            if (histFailed.has(uid) || uid === o.pageShown) {
              if (uid === o.pageShown && !histFailed.has(uid)) sum.leave = uid; else sum.held++;
              sp.order[LP.b] = [LP.parts.pos.val, uid];
              // (no entry of its own, as in a new ledger, or joining, where this device's versions of it count as covered
              // by the deletion only in this round: the deletion, with what the page holds now, so that only an edit made
              // here brings it back)
              // (and of each window on it that was deleted elsewhere too, as it is here now: see stamp)
              const keepW = {};
              for (const wid of Object.keys(wgone)) if (LP.wins.has(wid)) keepW[wid] = winH(LP.wins.get(wid));
              if (!M || (!M.gone && (mode === 'join' || !M.p || !M.p.exists))) setMine(uid, Object.assign(newMine(uid, LP.b), { hist: (M && M.hist) || { at: 0, local: false }, gone: tomb(S.exists, S.cover, null), wgone, keep: keepH(LP) }, Object.keys(keepW).length ? { keepW } : {}));
              continue;
            }
            sp.gone.push(['add', LP.b, now]);
            Object.assign(ps(uid, LP.b), { deleted: true, changed: true, risky: true, name: LP.parts.name.val, from: [S.exists.main.by], at: fin(S.exists.main.t, now) });
            from.add(S.exists.main.by);
          }
          // (deleted here now: each window on it that was deleted elsewhere too, as it is here, so that the page's Undo
          // or Bring back doesn't bring that window back, see stamp. Kept while the page stays deleted)
          const kw = {};
          if (LP && !LP.gone) for (const wid of Object.keys(wgone)) if (LP.wins.has(wid)) kw[wid] = winH(LP.wins.get(wid));
          const keepW = Object.keys(kw).length ? kw : M && M.gone && M.keepW;
          setMine(uid, Object.assign({ uid, b: LP ? LP.b : M ? M.b : 0, p: {}, w: {}, hist: (M && M.hist) || { at: 0, local: false }, quiet: null,
            gone: tomb(S.exists, S.cover, M && M.gone), wgone }, keepW ? { keepW } : {}));
          continue;
        }
        // ---- a page that shows
        let b = LP ? LP.b : 0;
        const acc = { applied: [], replaced: [] };   // versions taken from other devices, and the entries they replaced
        const sumP = ps(uid, b);
        // back: 'returned' (brought back on another device: its Undo, Bring back, made again) or 'edit' (below)
        if (!LP) { b = newB(); sumP.b = b; if (M && M.gone) sumP.back = 'returned'; else sumP.added = true; sp.lastBoard = Math.max(sp.lastBoard, b); }
        else if (LP.gone) { sp.gone.push(['remove', b]); sumP.back = 'returned'; }
        const nm = { uid, b, p: {}, w: {}, hist: (M && M.hist) || { at: 0, local: false }, quiet: (M && M.quiet) || null, gone: null, wgone: {} };
        let pageChanged = !LP || LP.gone;
        // shown although deleted (an edit its deleter hadn't seen): the deletion's own version, as shown. Every device
        // does the same, and in a file a shown version beats the deletion with the same vector (§4.1: the larger h).
        const ex = S.exists.main;
        if (S.exists.main.h !== '1') sumP.back = 'edit';
        const tv = {}, held = {};
        // (a new size rescales every window on the page: it waits while one of them is busy)
        const busyHere = !!LP && !LP.gone && !(M && M.gone) && Array.from(LP.wins.values()).some(W2 => holdW.has(`${b}:${W2.ikey}`));
        for (const k of PAGE_PARTS) {
          const J = S.parts[k], lp = LP && LP.parts[k];
          if (!J) { tv[k] = lp ? lp.val : undefined; continue; }
          if (histFailed.has(uid) && J.clash && J.main.src !== 'local') held[k] = true;
          if (k === 'size' && busyHere && lp && lp.h !== J.main.h) held[k] = true;
          if (k === 'photo' && J.main.src !== 'local' && J.main.h !== '-' && (!lp || lp.h !== J.main.h) && !photos[uid]) held[k] = true;
          if (held[k]) sum.held++;
          tv[k] = held[k] ? (lp ? lp.val : k === 'photo' ? null : undefined) : valOf(J.main, lp);
          if (!held[k] && (!lp || lp.h !== J.main.h)) { if (J.main.src !== 'local') { acc.applied.push(J.main); if (M && M.p[k]) acc.replaced.push(M.p[k].v); } pageChanged = true; }
        }
        // join mode: this device's own pages go after the folder's
        if (mode === 'join' && !S.inPeers && S.parts.pos) {
          const at = joinOrder.indexOf(uid);
          if (at >= 0 && joinTop !== null) {
            tv.pos = joinTop + 1 + at;
            S.parts.pos = { main: Object.assign(nv(S.parts.pos.main.vv, now), { h: hj(tv.pos), src: 'plan' }), pending: [], clash: false };
            pageChanged = true;
          }
        }
        const size = tv.size || { scale: H.scale, shape: '16:9' };
        // the board record
        let boardRev = 0;
        const oldName = LP ? LP.parts.name.val : null;
        if (!LP || LP.gone || ['name', 'look', 'size', 'pos'].some(k => S.parts[k] && !held[k] && (!LP.parts[k] || LP.parts[k].h !== S.parts[k].main.h))) {
          const base = LP ? clone(LP.value) || {} : {};
          boardRev = put(`board:${b}`, 'board', Object.assign(base, { id: b, uid, name: typeof tv.name === 'string' ? tv.name : 'My Board', background: clone(tv.look) || { color: null, pattern: 'none' },
            scale: size.scale, shape: size.shape, layout: H.canvasFor(size.scale), pos: fin(tv.pos, 0) }));
        }
        nm.p.exists = { h: '1', v: arr(ex), rev: boardRev || (LP ? LP.rec.rev || 0 : 0) };
        for (const k of ['name', 'look', 'size', 'pos']) {
          const J = S.parts[k], lp = LP && LP.parts[k];
          if (!J) { if (M && M.p[k]) nm.p[k] = M.p[k]; continue; }
          if (held[k]) { if (M && M.p[k]) nm.p[k] = M.p[k]; continue; }
          // (only the parts this write changed are noted as written by it: another part of the record keeps what an earlier
          // merge noted, see stamp)
          const chg = !!boardRev && (!lp || lp.h !== J.main.h);
          nm.p[k] = entry(J, lp, M && M.p[k], chg ? boardRev : 0, tv[k]);
          if (boardRev && !chg) nm.p[k].rev = boardRev;
        }
        // the photo and its look
        {
          const J = S.parts.photo, lp = LP && LP.parts.photo;
          if (J && held.photo) nm.p.photo = M && M.p.photo ? M.p.photo : { hold: 1, h: lp ? lp.h : '-', seen: arr(J.main) };
          else if (J) {
            let rev = 0;
            if (!lp || lp.h !== J.main.h) rev = J.main.h === '-' ? del(`media:${b}:background`) : put(`media:${b}:background`, 'media', clone(photos[uid]));
            const ref = J.main.src === 'local' ? (M && M.p.photo && M.p.photo.h === J.main.h ? M.p.photo.ref : undefined) : J.main.ref;
            const keep = M && M.p.photo && M.p.photo.h === J.main.h && M.p.photo.put ? { put: M.p.photo.put } : {};
            nm.p.photo = entry(J, lp, M && M.p.photo, rev, undefined, Object.assign(ref ? { ref } : {}, keep));
          } else if (M && M.p.photo) nm.p.photo = M.p.photo;
          const JL = S.parts.photoLook, ll = LP && LP.parts.photoLook;
          if (JL && !held.photoLook) {
            let rev = 0;
            if (!ll || ll.h !== JL.main.h) rev = JL.main.h === NULL_H ? del(`media:${b}:background-look`) : put(`media:${b}:background-look`, 'media', clone(tv.photoLook));
            nm.p.photoLook = entry(JL, ll, M && M.p.photoLook, rev, tv.photoLook);
          } else if (M && M.p.photoLook) nm.p.photoLook = M.p.photoLook;
        }
        // ---- its windows
        const tScale = size.scale, lScale = LP ? LP.scale : tScale;
        const wins = sortBy(Array.from(new Set(Array.from(S.wins.keys()).concat(LP ? Array.from(LP.wins.keys()) : []))), x => x);
        const shownW = sh.wins.get(uid) || new Set();
        const used = new Map(), useN = (wg, n2) => { if (!used.has(wg)) used.set(wg, new Set()); used.get(wg).add(n2); };
        const freeN = (wg, want) => { const s = used.get(wg) || new Set(); let k = want && !s.has(want) ? want : 1; while (s.has(k)) k++; useN(wg, k); return k; };
        const zBase = o.zTop ? o.zTop(uid) : 1;
        let zk = 0;
        const targets = [];
        for (const wid of wins) {
          const SW = S.wins.get(wid), LW = LP && LP.wins.get(wid), mw0 = M && M.w[wid];
          const busy = !!LW && !LP.gone && !(M && M.gone) && holdW.has(`${b}:${LW.ikey}`);   // (a page coming back isn't shown: nothing in it is busy)
          if (busy) {   // all its parts keep this device's version (and the round is owed, if the merge would change it)
            useN(LW.widgetId, LW.n); if (mw0) nm.w[wid] = mw0;
            if (!SW || !shownW.has(wid) || WIN_PARTS.some(k => SW.parts[k] && (SW.parts[k].main.src !== 'local' || SW.parts[k].pending.length))) sum.held++;
            continue;
          }
          if (!SW) {
            if (LW && !LP.gone && mode !== 'take' && !(M && M.gone)) { useN(LW.widgetId, LW.n); if (mw0) nm.w[wid] = mw0; continue; }
            if (LW) { for (const k of ['inst', 'data', 'conf']) del(LW.keys[k]); pageChanged = true; }   // (here only: the folder never had it)
            continue;
          }
          if (!shownW.has(wid)) {
            if (LW && histFailed.has(uid) && !LP.gone) { useN(LW.widgetId, LW.n); if (mw0) nm.w[wid] = mw0; sum.held++; continue; }   // waits for a Board history version
            if (LW) {
              for (const k of ['inst', 'data', 'conf']) del(LW.keys[k]);
              pageChanged = true; sumP.risky = true;
              if (!LP.gone) { acc.applied.push(SW.exists.main); if (mw0 && mw0.p.exists) acc.replaced.push(mw0.p.exists.v); }
            }
            if (SW.exists.main.h === '0' || LW || mw0) nm.wgone[wid] = tomb(SW.exists, SW.cover, M && M.wgone && M.wgone[wid]);
            continue;
          }
          if (LW) useN(LW.widgetId, LW.n);
          targets.push({ wid, SW: Object.assign({}, SW, { parts: Object.assign({}, SW.parts) }), LW, mw0 });
        }
        // the windows that show: their values, at this page's scale
        for (const T of targets) {
          const { SW, LW } = T, t = T.t = {}, wg = SW.ident.widgetId;
          T.widgetId = LW ? LW.widgetId : wg;
          T.n = LW ? LW.n : freeN(wg, SW.ident.n);
          T.ikey = `${T.widgetId}:${T.n}`;
          for (const k of WIN_PARTS) {
            const J = SW.parts[k], lp = LW && LW.parts[k];
            if (!J) { t[k] = lp ? lp.val : k === 'rect' ? { rect: normRect(null), maximized: false } : k === 'open' ? false : null; continue; }
            if (histFailed.has(uid) && J.clash && J.main.src !== 'local') { (T.held || (T.held = {}))[k] = true; t[k] = lp ? lp.val : null; sum.held++; continue; }
            if (k === 'data' && isLater(T.widgetId) && J.pending.length) {   // Timer, Dice, Traffic light: the later state wins
              SW.parts.data = Object.assign({}, J, { main: Object.assign({}, J.main, { vv: J.pending.reduce((a, v) => vjoin(a, v.vv), J.main.vv) }), pending: [], copy: [] });
            }
            const J2 = SW.parts[k];
            t[k] = valOf(J2.main, lp);
            if (k === 'rect') {
              const sc = J2.main.src === 'local' || J2.main.src === 'pending' ? lScale : fin(J2.main.scale, tScale);
              const v = t.rect || { rect: normRect(null), maximized: false };
              t.rect = Math.abs(sc - tScale) < 1e-9 ? { rect: normRect(v.rect), maximized: !!v.maximized } : { rect: H.scaleRect(normRect(v.rect), sc / tScale), maximized: !!v.maximized };
            }
          }
          T.exists = SW.exists.main;
          if (SW.exists.main.h !== '1') sumP.risky = true;
        }
        // copies: a version that lost, kept beside its window (made by its author, or by anyone once the author is idle or gone)
        const copies = [];
        for (const T of targets) {
          const J0 = T.SW.parts.data;
          if (!J0 || !J0.copy || !J0.copy.length || isLater(T.widgetId) || (T.held && T.held.data)) continue;
          const J = T.SW.parts.data = Object.assign({}, J0);
          for (const Pv of sortBy(J0.copy || [], v => `${v.by}:${nOf(v)}`)) {
            const cw = copyWid(T.wid, Pv);
            // (its copy is there now: the version joins the window's own, so no device finds that clash again)
            J.main = Object.assign({}, J.main, { vv: vjoin(J.main.vv, Pv.vv) });
            J.pending = J.pending.filter(x => x !== Pv);
            // already made (here or elsewhere), or the same edit under another counter (a device that lost its ledger
            // stamped it again): already kept
            const same = W2 => { const lb = W2.parts.label, lw = LP && LP.wins.get(W2.wid); return lb && sameLabel(valOf(lb.main, lw && lw.parts.label), T.wid, Pv); };
            if (S.wins.has(cw) || copies.some(c => c.wid === cw || (c.T.wid === T.wid && c.P.by === Pv.by && c.P.t === Pv.t)) || Array.from(S.wins.values()).some(same)) continue;
            const val0 = Pv.src === 'local' ? (T.LW ? T.LW.parts.data.val : null) : Pv.val, val = T.widgetId === 'task-timer' ? pauseTask(val0, Pv.t) : val0;
            copies.push({ wid: cw, T, P: Pv, val });
            sumP.clashes.push({ wid: T.wid, widgetId: T.widgetId, mine: Pv.by === dev || J.main.by === dev, devs: [J.main.by, Pv.by] });
            sumP.risky = true;
            if (Pv.by === dev) undo.swaps.push({ page: uid, wid: T.wid, copyWid: cw, t: J.main.t });   // (t: the other device's version's time, for the copy's label after a swap)
          }
          delete J.copy;
        }
        // (a version whose copy waits for its author, or for its author to be idle: the round is owed)
        for (const T of targets) if (T.SW.parts.data && T.SW.parts.data.pending.length && !isLater(T.widgetId)) sum.held++;
        // one window only (21Sketch...): the earliest stays open
        const singles = new Map();
        for (const T of targets) if (T.t.open && isSingle(T.widgetId)) { if (!singles.has(T.widgetId)) singles.set(T.widgetId, []); singles.get(T.widgetId).push(T); }
        for (const list of singles.values()) {
          if (list.length < 2) continue;
          list.sort((a, c) => fin(a.SW.ident.createdAt != null ? a.SW.ident.createdAt : a.LW && a.LW.createdAt, 0) - fin(c.SW.ident.createdAt != null ? c.SW.ident.createdAt : c.LW && c.LW.createdAt, 0) || (a.wid < c.wid ? -1 : 1));
          for (const T of list.slice(1)) {
            T.t.open = false;
            const J = T.SW.parts.open;
            T.SW.parts.open = { main: Object.assign(nv(J ? J.main.vv : {}, now), { h: hj(false), src: 'plan' }), pending: [], clash: false };
          }
        }
        // write them
        for (const T of targets) {
          const { SW, LW, mw0, t } = T, mw = { ikey: T.ikey, p: {} };
          const created = !LW;
          const ident = SW.ident || {};
          const ch = k => SW.parts[k] && !(T.held && T.held[k]) && (!LW || !sameJSON(LW.parts[k].val, t[k]));
          const movedThere = SW.parts.rect && SW.parts.rect.main.src !== 'local' && LW && LW.parts.rect.h !== SW.parts.rect.main.h;
          const reopened = LW && t.open && !LW.parts.open.val;
          let z = LW ? LW.z : zBase + zk++;
          if (LW && (movedThere || reopened)) z = zBase + zk++;
          let instRev = 0;
          if (created || ch('rect') || ch('open') || ch('label') || z !== (LW && LW.z)) {
            const iv = Object.assign(LW ? clone(LW.inst) || {} : {}, { widgetId: T.widgetId, n: T.n, open: !!t.open, rect: t.rect.rect, z, maximized: !!t.rect.maximized,
              createdAt: LW ? LW.createdAt : fin(ident.createdAt, now), wid: T.wid, copyOf: t.label || null });
            instRev = put(`inst:${b}:${T.ikey}`, 'inst', iv);
          }
          const keys = { data: `data:${b}:${T.ikey}`, conf: `conf:${b}:${T.ikey}` };
          const revs = { rect: instRev, open: instRev, label: instRev };
          for (const k of ['data', 'conf']) {
            const J = SW.parts[k], lp = LW && LW.parts[k];
            if (!J || (T.held && T.held[k]) || (lp && lp.h === J.main.h) || (!lp && J.main.h === NULL_H)) continue;
            if (lp && lp.skipped && J.main.src === 'local') continue;
            revs[k] = J.main.h === NULL_H ? del(keys[k]) : put(keys[k], k, clone(t[k]));
          }
          for (const k of WIN_PARTS) {
            const J = SW.parts[k];
            if (!J) { if (mw0 && mw0.p[k]) mw.p[k] = mw0.p[k]; continue; }
            if (T.held && T.held[k]) { mw.p[k] = mw0.p[k]; continue; }
            const lp = LW && LW.parts[k], changedHere = !lp || lp.h !== J.main.h;
            if (changedHere && J.main.src !== 'local' && J.main.src !== 'plan') { acc.applied.push(J.main); if (mw0 && mw0.p[k]) acc.replaced.push(mw0.p[k].v); }
            if (changedHere || (k === 'rect' && ch('rect'))) pageChanged = true;
            const wrote = changedHere || (k === 'rect' && ch('rect')) ? revs[k] || 0 : 0;
            mw.p[k] = entry(J, lp, mw0 && mw0.p[k], wrote, t[k]);
            if (!wrote) mw.p[k].rev = revs[k] > 0 ? revs[k] : lp ? lp.rev : 0;
            if (k === 'rect') {   // a place converted to this page's scale may round to another fingerprint: noted, so it isn't taken for a move
              const lh = wrote ? partH('rect', t.rect, tScale, H) : lp && lp.h !== J.main.h ? lp.h : mw0 && mw0.p.rect && mw0.p.rect.lh;
              if (lh && lh !== J.main.h) mw.p.rect.lh = lh;
              const s1 = wrote ? s1Of(t.rect, tScale, H) : mw0 && mw0.p.rect && mw0.p.rect.s1 && mw0.p.rect.h === J.main.h ? mw0.p.rect.s1 : lp ? s1Of(lp.val, lScale, H) : null;
              if (s1) mw.p.rect.s1 = s1;
              // (the page's scale changed here: the place was written at the new one. A tab that hadn't seen it, writing back
              // the place it showed, in the old scale's coordinates, is found by its fingerprint at the old scale: prevSc)
              if (wrote && lp && Math.abs(lScale - tScale) > 1e-9) Object.assign(mw.p.rect, { applied: wrote, prevSc: lScale, val: clone(t.rect) }, mw.p.rect.prevH ? {} : { prevH: lp.h, prevV: (mw0 && mw0.p.rect && mw0.p.rect.v) || mw.p.rect.v });
            }
          }
          mw.p.exists = { h: '1', v: arr(T.exists), rev: instRev || (LW ? LW.parts.rect.rev : 0) };
          nm.w[T.wid] = mw;
          if (created) {
            pageChanged = true;
            if (SW.exists.main.src !== 'local') { acc.applied.push(SW.exists.main); sumP.risky = sumP.risky || !!(M && M.wgone && M.wgone[T.wid]); }
            if (t.label && t.label.from !== dev) {
              const orig = S.wins.get(t.label.wid), od = orig && orig.parts.data;
              sumP.clashes.push({ wid: t.label.wid, widgetId: T.widgetId, mine: !!(od && od.main.by === dev), devs: [od ? od.main.by : '', t.label.from], arrived: true });
              undo.skip.push(`inst:${b}:${T.ikey}`, keys.data, keys.conf);
            }
          }
        }
        for (const c of copies) {
          const T = c.T, n2 = freeN(T.widgetId), ik = `${T.widgetId}:${n2}`, near = T.t.rect.rect;
          let rect = o.place ? o.place(uid, clone(near), clone(near)) : { x: near.x + 32, y: near.y + 32, w: near.w, h: near.h };
          rect = normRect(rect);
          const over = Math.min(rect.x + rect.w, near.x + near.w) - Math.max(rect.x, near.x) > 0.5 && Math.min(rect.y + rect.h, near.y + near.h) - Math.max(rect.y, near.y) > 0.5;
          const origZ = T.LW ? T.LW.z : zBase;
          const label = { wid: T.wid, from: c.P.by, name: nameOf(c.P.by), at: c.P.t };
          const iv = { widgetId: T.widgetId, n: n2, open: true, rect, z: over ? Math.max(0, origZ - 1) : zBase + zk++, maximized: false, createdAt: fin(c.P.t, now), wid: c.wid, copyOf: label };
          const instRev = put(`inst:${b}:${ik}`, 'inst', iv);
          const conf = T.t.conf, dataH = hj(c.val);
          const dataRev = c.val === null ? 0 : put(`data:${b}:${ik}`, 'data', clone(c.val));
          const confRev = conf === null || conf === undefined ? 0 : put(`conf:${b}:${ik}`, 'conf', clone(conf));
          // (its parts' versions are the copy's own: made by "the copy", a key from its wid that no device has (14
          // characters, a device's are 12), with the copied version's counter and time. So a copy made by the author and
          // one made by a fallback device are one, whatever else each had joined into that version, and no change that
          // never saw the copy, even its author's, is taken to include it or to come after it)
          const cby = ('cp' + hash53(c.wid)).padEnd(14, '0').slice(0, 14);
          const cv = arr({ by: cby, vv: { [cby]: Math.max(1, nOf(c.P)) }, t: c.P.t, u: false });
          const mk = (h, val, rev) => Object.assign({ h, v: cv, rev }, rev > 0 ? { applied: rev, val: clone(val === undefined ? null : val) } : {});
          nm.w[c.wid] = { ikey: ik, p: {
            exists: mk('1', true, instRev), rect: Object.assign(mk(partH('rect', { rect, maximized: false }, tScale, H), null, instRev), { s1: s1Of({ rect, maximized: false }, tScale, H) }), open: mk(TRUE_H, true, instRev),
            label: mk(hj(label), label, instRev), conf: mk(hj(conf === undefined ? null : conf), conf, confRev), data: mk(dataH, c.val, dataRev) } };
          pageChanged = true;
        }
        for (const [wid, T0] of Object.entries((M && M.wgone) || {})) if (!nm.w[wid] && !nm.wgone[wid] && !S.wins.has(wid)) nm.wgone[wid] = T0;
        // (a copy's versions are by "the copy", no device: they are credited to the device whose file brought them)
        const devsHere = Array.from(new Set(acc.applied.map(v => (DEV_RE.test(v.by) ? v.by : v.src)).filter(d => d !== dev && DEV_RE.test(d || ''))));
        // (at: when it was merged here, for "shown since"; t: when the newest of those changes was made, to say)
        if (pageChanged && uid !== o.pageShown && LP && !LP.gone && devsHere.length) {
          const t = Math.max(fin(nm.quiet && nm.quiet.t, 0), ...acc.applied.filter(v => v.by !== dev).map(v => fin(v.t, 0)));
          nm.quiet = { from: Array.from(new Set(((nm.quiet && nm.quiet.from) || []).concat(devsHere))), at: now, t: t || now }; sumP.quiet = true;
        }
        setMine(uid, nm);
        sp.order[b] = [fin(tv.pos, 0), uid];
        // the summary of this page
        sumP.name = typeof tv.name === 'string' ? tv.name : 'My Board';
        sumP.changed = sumP.changed || pageChanged;
        devsHere.forEach(d => from.add(d));
        sumP.from = devsHere;
        if (acc.applied.length) { sumP.undone = acc.applied.every(v => v.u); sumP.mineUndone = acc.replaced.length > 0 && acc.replaced.every(v => v[0] === dev); }
        const NJ = S.parts.name;
        if (NJ && NJ.clash && NJ.mine && NJ.main.src !== 'local' && !held.name && oldName !== tv.name) sumP.renamed = { name: tv.name, by: NJ.main.by };
        if ((S.parts.photo && !held.photo && LP && LP.parts.photo.h !== '-' && LP.parts.photo.h !== S.parts.photo.main.h) ||
          ['name', 'look', 'size', 'pos', 'photoLook'].some(k => S.parts[k] && S.parts[k].clash && S.parts[k].main.src !== 'local' && !held[k]) ||
          targets.some(T => WIN_PARTS.some(k => T.SW.parts[k] && T.SW.parts[k].clash && T.SW.parts[k].main.src !== 'local')) ||
          targets.some(T => T.LW && T.LW.parts.data.val !== null && T.t.data === null)) sumP.risky = true;
        if (!sumP.changed && !sumP.deleted) delete sum.pages[uid];
      }
      sum.from = Array.from(from);
      // the theme, accent and text style: another device's change is written to settings (a patch of those keys only),
      // and said (sum.style: [{by, theme, accent, letters, accentColor}], by device; not when joining or switching to the
      // folder's board, which nobody has just changed). With no version anywhere, this device's own is only noted. A
      // version nobody chose (t 0: a default an empty folder was set up with) is nobody's change: it is never said, and it
      // never replaces a value this device had before it synced that part (no version here: a smartboard that joined on
      // 2026.11.16-4 keeps its own text style until one is chosen on any device).
      const style = {};
      for (const k of STYLE_PARTS) {
        const J = state.style && state.style[k], lp = local.style && local.style[k], E = (L.sync.style || {})[k];
        if (!J || !lp) { if (E || lp) style[k] = E || { h: lp.h }; continue; }
        if (J.main.src !== 'local' && J.main.h !== lp.h && J.main.has) {
          const none = !fin(J.main.t, 0);
          if (none && !(E && E.v) && mode !== 'join' && mode !== 'take') { style[k] = { h: lp.h }; continue; }
          (sp.set || (sp.set = {}))[k] = J.main.val;
          if (mode === 'join' || mode === 'take' || none) { style[k] = { h: J.main.h, v: arr(J.main) }; continue; }
          let said = sum.style.find(x => x.by === J.main.by);
          if (!said) sum.style.push(said = { by: J.main.by });
          said[k] = J.main.val;
        }
        style[k] = { h: J.main.h, v: arr(J.main) };
      }
      L.sync.style = style;
      const peers = Object.assign({}, L.sync.peers);
      for (const p of state.peers) {
        const was = peers[p.dev] || {};
        peers[p.dev] = Object.assign({}, was, { seq: Math.max(fin(was.seq, 0), fin(p.seq, 0)), name: p.name, at: p.at, left: p.left || null, missingSince: 0,
          changedAt: fin(p.seq, 0) > fin(was.seq, 0) ? now : fin(was.changedAt, now) });
      }
      const changedAny = Object.values(sum.pages).some(x => x.changed || x.deleted) && sum.from.length;
      L.sync = Object.assign(L.sync, { ctr: Math.max(fin(L.sync.ctr, 0), n), maxSeen: Math.max(fin(L.sync.maxSeen, 0), fin(state.maxSeen, 0)), peers,
        last: changedAny ? { dev: sum.from[0], name: nameOf(sum.from[0]), at: now } : L.sync.last || null, mode: null, first: false });
      const rr = records(L);
      return { writes: Array.from(W.values()), ifRev, settings: stored => patchSettings(stored, sp), settingsPatch: sp,
        ledger: { put: rr.put, del: rr.del }, sync: L.sync, next: L, summary: sum, undo };
    }

    // ---- the device file: this device's whole board as an all-pages backup (Import opens it), with each part's version
    function encode(ledger0, local, m = {}) {
      const H = local.H, pages = [], goneP = [], goneW = [], canon = [];
      for (const uid of Object.keys(ledger0.mine).sort()) {
        const M = ledger0.mine[uid];
        if (M.gone) goneP.push({ uid, exists: M.gone.exists, cover: M.gone.cover || {} });
        for (const wid of Object.keys(M.wgone || {}).sort()) goneW.push({ page: uid, wid, exists: M.wgone[wid].exists, cover: M.wgone[wid].cover || {} });
        const P = local.pages.get(uid);
        if (M.gone || !P || !M.p.exists || !M.p.exists.v) continue;
        const v = {}, has = k => M.p[k] && M.p[k].v && !(P.parts[k] && P.parts[k].skipped);
        v.exists = M.p.exists.v;
        for (const k of PAGE_PARTS) if (has(k)) v[k] = M.p[k].v;
        const size = P.parts.size.val, board = { name: P.parts.name.val, background: P.parts.look.val, scale: size.scale, shape: size.shape, uid, pos: P.parts.pos.val };
        let media;
        const key = P.parts.photo.val, ref = key ? (m.refs && m.refs[key]) || (M.p.photo && M.p.photo.h === key && M.p.photo.ref) : null;
        if (v.photo && key && !ref) delete v.photo;   // (a photo not in Photos yet: no version of it in the file)
        if (v.photo && key) media = { background: clone(ref) };
        if (v.photoLook && P.parts.photoLook.val) media = Object.assign(media || {}, { look: clone(P.parts.photoLook.val) });
        const instances = [];
        for (const wid of Array.from(P.wins.keys()).sort()) {
          const W = P.wins.get(wid), mw = M.w[wid];
          if (!mw || !mw.p.exists || !mw.p.exists.v) continue;
          const iv = { exists: mw.p.exists.v }, i = { widgetId: W.widgetId, instance: W.n, wid, open: W.parts.open.val, maximized: W.parts.rect.val.maximized, z: W.z,
            rect: W.parts.rect.val.rect, createdAt: W.createdAt };
          if (W.parts.label.val) i.copyOf = W.parts.label.val;
          for (const k of WIN_PARTS) if (mw.p[k] && mw.p[k].v && !W.parts[k].skipped) iv[k] = mw.p[k].v;
          if (mw.p.rect && mw.p.rect.lh && W.parts.rect.h === mw.p.rect.lh) i.vh = { rect: mw.p.rect.h };   // (the place converted from another scale: still that version)
          if (iv.conf) i.config = W.parts.conf.val;
          if (iv.data) i.data = W.parts.data.val;
          i.v = iv;
          const pend = mw.p.data && mw.p.data.pending;
          if (iv.data && pend && pend.length) i.pending = { data: pend.map(q => ({ v: q.v, val: q.val })) };
          instances.push(i);
        }
        const C = H.canvasFor(size.scale);
        let vw = C.w, vh = C.h;
        if (size.shape === 'free') for (const i of instances) { vw = Math.max(vw, Math.ceil(i.rect.x + i.rect.w)); vh = Math.max(vh, Math.ceil(i.rect.y + i.rect.h)); }
        board.v = v;
        pages.push(Object.assign({ viewport: { width: vw, height: vh }, board }, media ? { media } : {}, { instances }));
        // (what the parts fingerprint covers: each part's fingerprint and version, not its value again)
        canon.push([uid, PAGE_PARTS.map(k => (v[k] ? P.parts[k].h : 0)), v, media ? [media.background || null, media.look ? P.parts.photoLook.h : 0] : 0,
          instances.map(i => { const W2 = P.wins.get(i.wid); return [i.wid, i.widgetId, i.instance, i.createdAt, WIN_PARTS.map(k => (i.v[k] ? W2.parts[k].h : 0)), i.v, i.vh || 0, i.pending ? i.pending.data.map(q => [q.v, hj(q.val)]) : 0]; })]);
      }
      pages.sort((a, c) => a.board.pos - c.board.pos || (a.board.uid < c.board.uid ? -1 : 1));
      const main = pages[0] || { viewport: { width: 2400, height: 1350 }, board: null, instances: [] };
      // the theme, accent and text style, as any export has them, and their versions (sync.style) while the values are
      // the ones stamped
      const ls = local.style || {}, val = k => (ls[k] ? ls[k].val : m[k] || null), style = {};
      for (const k of STYLE_PARTS) { const E = ((ledger0.sync || {}).style || {})[k]; if (E && E.v && ls[k] && E.h === ls[k].h) style[k] = E.v; }
      const obj = { format: '21board', formatVersion: 1, kind: 'full', exportedAt: new Date(fin(m.at, 0)).toISOString(), generator: m.generator || '21Board',
        viewport: main.viewport };
      for (const k of STYLE_PARTS) obj[k] = val(k);
      obj.board = main.board;
      if (main.media) obj.media = main.media;
      obj.instances = main.instances;
      if (pages.length > 1) obj.pages = pages.map((p, i) => (i === 0 ? { main: true } : p));
      obj.sync = { v: 1, dev: m.dev, folder: m.folder || null, name: m.name || '', seq: m.seq || 0, write: m.write || '', at: fin(m.at, 0), merged: m.merged || {},
        gone: { pages: goneP, windows: goneW }, style, left: m.left || null, sum: '' };
      // Bookkeeping (seq, write, at, merged) and z never make a write: only the parts do.
      const partsH = hash53(JSON.stringify([m.name || '', m.folder || null, m.left || null, goneP, goneW, canon, STYLE_PARTS.map(k => obj[k]).concat([style])]));
      return { obj, partsH };
    }
    // The text a file's checksum is taken over: the file with its sum left empty (as its writer had it).
    function sumText(obj) {
      const o = Object.assign({}, obj);
      o.sync = Object.assign({}, obj.sync, { sum: '' });
      return JSON.stringify(o);
    }
    // A device file (parsed, checksum checked) → a peer, leaving out units that aren't well formed (a missing unit is
    // never a deletion), or null if it isn't one. newer: made by a newer 21Board (not merged).
    function decode(obj, o = {}) {
      const H = helpers(o);
      if (!obj || typeof obj !== 'object' || obj.format !== '21board' || !obj.sync || typeof obj.sync !== 'object') return null;
      const s = obj.sync;
      if (s.v !== 1) return typeof s.v === 'number' && s.v > 1 ? { peer: null, skipped: [], newer: true } : null;
      if (!DEV_RE.test(s.dev || '')) return null;
      const skipped = [];
      let newer = false;
      const peer = { dev: s.dev, folder: typeof s.folder === 'string' ? s.folder.slice(0, 40) : null, name: typeof s.name === 'string' ? s.name.slice(0, 60) : '',
        seq: fin(s.seq, 0), write: typeof s.write === 'string' ? s.write.slice(0, 40) : '', at: fin(s.at, 0), left: s.left && typeof s.left === 'object' ? { at: fin(s.left.at, 0), erased: !!s.left.erased } : null,
        merged: {}, pages: new Map(), gone: { pages: new Map(), wins: new Map() } };
      if (s.merged && typeof s.merged === 'object') for (const [k, v] of Object.entries(s.merged)) if (DEV_RE.test(k) && typeof v === 'number') peer.merged[k] = v;
      const V = (a, x) => { const ok = okV(a); if (ok === 2) newer = true; return ok === 1 ? ver(a, Object.assign({ src: s.dev, has: true }, x)) : null; };
      const vvOk = v => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 500 && Object.entries(v).every(([k, n]) => KEY_RE.test(k) && typeof n === 'number' && isFinite(n) && n >= 0);
      const cover = c => { const out = {}; if (c && typeof c === 'object') for (const [k, v] of Object.entries(c)) if (/^[\w.@~/-]{1,140}$/.test(k) && vvOk(v)) out[k] = v; return out; };
      const pageOf = e => {
        const bd = e && e.board, v = bd && bd.v;
        if (!bd || typeof bd !== 'object' || !H.UID_RE.test(bd.uid || '') || !v || typeof v !== 'object') throw new Error('page');
        const exists = V(v.exists, { h: '1', val: true });
        if (!exists) throw new Error('page');
        const pv = pageVals(bd, H), sc = pv.size.scale, pp = { uid: bd.uid, scale: sc, exists, parts: {}, wins: new Map() };
        for (const k of ['name', 'look', 'size', 'pos']) {
          if (!v[k] || (k === 'name' && typeof bd.name !== 'string') || (k === 'pos' && pv.pos === null)) continue;
          const x = V(v[k], { h: hj(pv[k]), val: pv[k] });
          if (x) pp.parts[k] = x;
        }
        const media = e.media && typeof e.media === 'object' ? e.media : {}, bg = media.background;
        if (v.photo) {
          let key = null, ref = null;
          if (bg && typeof bg === 'object') {
            if (!H.PHOTO_FILE_RE.test(bg.file || '') || !(bg.w > 0) || !(bg.h > 0)) key = undefined;
            else { ref = { file: bg.file, w: +bg.w, h: +bg.h, bytes: fin(bg.bytes, 0), name: String(bg.name || 'Photo').slice(0, 80), addedAt: fin(bg.addedAt, 0) }; key = H.photoKeyOf(ref); }
          }
          const x = key === undefined ? null : V(v.photo, { h: key || '-', val: key, ref });
          if (x) pp.parts.photo = x;
        }
        if (v.photoLook) { const look = media.look ? H.look(media.look) : null, x = V(v.photoLook, { h: hj(look), val: look }); if (x) pp.parts.photoLook = x; }
        for (const i of Array.isArray(e.instances) ? e.instances : []) {
          try {
            const iv = i && i.v;
            if (!i || !WIDGET_RE.test(i.widgetId || '') || !Number.isInteger(i.instance) || i.instance < 1 || !WID_RE.test(i.wid || '') || !iv || typeof iv !== 'object' || pp.wins.has(i.wid)) throw new Error('window');
            const ex = V(iv.exists, { h: '1', val: true });
            if (!ex) throw new Error('window');
            const pw = { wid: i.wid, ident: { widgetId: i.widgetId, n: i.instance, createdAt: fin(i.createdAt, null), z: fin(i.z, 1) }, exists: ex, parts: {}, pending: [] };
            const rv = { rect: normRect(i.rect), maximized: !!i.maximized }, label = normLabel(i.copyOf);
            const vals = { rect: rv, open: !!i.open, label, data: i.data === undefined ? null : i.data, conf: i.config === undefined ? null : i.config };
            for (const k of WIN_PARTS) {
              if (!iv[k]) continue;
              const fh = k === 'rect' && i.vh && typeof i.vh.rect === 'string' && /^[0-9a-z]{1,16}$/.test(i.vh.rect) ? i.vh.rect : null;
              const x = V(iv[k], { h: fh || partH(k, vals[k], sc, H), val: vals[k], scale: sc });
              if (x) pw.parts[k] = x;
            }
            const pend = i.pending && Array.isArray(i.pending.data) ? i.pending.data : [];
            for (const q of pend.slice(0, 50)) { const x = q && V(q.v, { h: hj(q.val === undefined ? null : q.val), val: q.val === undefined ? null : q.val }); if (x) pw.pending.push(x); }
            pp.wins.set(i.wid, pw);
          } catch (err) { skipped.push(`window ${i && i.wid}`); }
        }
        return pp;
      };
      const list = [obj].concat(Array.isArray(obj.pages) ? obj.pages.filter(e => e && !e.main) : []);
      for (const e of list) {
        if (e === obj && !obj.board) continue;
        try { const pp = pageOf(e); if (!peer.pages.has(pp.uid)) peer.pages.set(pp.uid, pp); } catch (err) { skipped.push(`page ${e && e.board && e.board.uid}`); }
      }
      const g = s.gone && typeof s.gone === 'object' ? s.gone : {};
      for (const t of Array.isArray(g.pages) ? g.pages : []) {
        const x = t && H.UID_RE.test(t.uid || '') && !peer.pages.has(t.uid) ? V(t.exists, { h: '0', val: false, cover: cover(t.cover) }) : null;
        if (x) peer.gone.pages.set(t.uid, x); else skipped.push('deleted page');
      }
      for (const t of Array.isArray(g.windows) ? g.windows : []) {
        const x = t && H.UID_RE.test(t.page || '') && WID_RE.test(t.wid || '') ? V(t.exists, { h: '0', val: false, cover: cover(t.cover) }) : null;
        if (x && !(peer.pages.get(t.page) && peer.pages.get(t.page).wins.has(t.wid))) peer.gone.wins.set(`${t.page} ${t.wid}`, { page: t.page, wid: t.wid, exists: x }); else skipped.push('deleted window');
      }
      // the theme, accent and text style: a version in sync.style, with a value this release knows (a file from before
      // 2026.11.16-4 has none, and one from 2026.11.16-4 none of the text style: it says nothing about them)
      peer.style = {};
      const sv = s.style && typeof s.style === 'object' ? s.style : {};
      for (const k of STYLE_PARTS) {
        if (!sv[k]) continue;
        const val = obj[k], x = styleOk(k, val, H) ? V(sv[k], { h: hj(val), val }) : null;
        if (x) peer.style[k] = x; else skipped.push(k);
      }
      if (newer) return { peer: null, skipped, newer: true };
      return { peer, skipped, newer: false };
    }

    // ---- tidying: a tombstone goes once this device has held it LINK_GONE_MS and every device shows it (§3.5). It is
    // noted in sync.dropped for LINK_GONE_MS more, so that the files that still hold it don't bring it back (join).
    function gc(ledger0, peers, files, o = {}) {
      const L = own(ledger0), now = fin(o.now, 0), dev = o.dev, goneMs = fin(o.goneMs, DEF.goneMs), peerGone = fin(o.peerGoneMs, DEF.peerGoneMs);
      const dropped = {};
      for (const [k, x] of Object.entries(L.sync.dropped || {})) if (x && now - fin(x.at, 0) < goneMs) dropped[k] = x;
      const drop = (k, T) => { dropped[k] = { vv: T.exists[1], at: now }; };
      const have = files instanceof Set ? files : new Set(files ? Object.keys(files) : []);
      const byDev = new Map((peers || []).map(p => [p.dev, p]));
      const shows = (T, unitOf) => Object.entries(L.sync.peers || {}).every(([d, info]) => {
        if (d === dev) return true;
        const f = byDev.get(d);
        if (!have.has(d) || !f) return (info.left && info.left.erased && !have.has(d)) || now - fin(info.missingSince || now, now) >= peerGone;
        const u = unitOf(f);
        if (u === 'alive') return false;
        if (u) return leq(T.exists[1], u.vv);
        return fin(f.merged[dev], 0) >= fin(T.seq, Infinity);
      });
      for (const [uid, M] of Object.entries(L.mine)) {
        const ripe = T => T && T.seq != null && now - fin(T.seen, now) >= goneMs;
        let M2 = M;
        if (M.gone && !M.keep && ripe(M.gone) && shows(M.gone, f => (f.pages.has(uid) ? 'alive' : f.gone.pages.get(uid) || null))) { drop(uid, M.gone); delete L.mine[uid]; continue; }
        for (const [wid, T] of Object.entries(M.wgone || {})) {
          if (!ripe(T) || (M.keepW && M.keepW[wid])) continue;   // (kept for keepW, as the page's is for keep)
          if (!shows(T, f => { const p = f.pages.get(uid); if (p && p.wins.has(wid)) return 'alive'; const g = f.gone.wins.get(`${uid} ${wid}`); return g ? g.exists : null; })) continue;
          if (M2 === M) { M2 = cloneMine(M); L.mine[uid] = M2; }
          drop(`${uid} ${wid}`, T);
          delete M2.wgone[wid];
        }
      }
      if (Object.keys(dropped).length || L.sync.dropped) L.sync = Object.assign({}, L.sync, { dropped });
      return L;
    }
    // Does this ledger hold everything in that file (so the file can go)?
    function includes(ledger0, peer) {
      const inV = (v, E) => !!E && !!E.v && [E.v].concat((E.pending || []).map(q => q.v)).some(a => leq(v.vv, a[1]) || superseded(v, ver(a)));
      // (a version nobody chose (t 0) is nothing this device lacks while it keeps its own value instead, with no version:
      // plan never lets one replace it, see there)
      for (const k in peer.style || {}) {
        const v = peer.style[k], E = ((ledger0.sync || {}).style || {})[k];
        if (!fin(v.t, 0) && E && !E.v) continue;
        if (!inV(v, E)) return false;
      }
      const dropped = (ledger0.sync && ledger0.sync.dropped) || {}, collected = (k, vv) => !!dropped[k] && leq(vv, dropped[k].vv);   // (deletions collected here, see gc)
      for (const [uid, pp] of peer.pages) {
        const M = ledger0.mine[uid];
        if (!M) return false;
        if (M.gone) {
          // (every version of the page and its windows, pending ones too, within what the deletion covered, or within a
          // window's own deletion: otherwise merging the file would bring the page back, see shown)
          const C = M.gone.cover || {};
          if (!leq(pp.exists.vv, M.gone.exists[1])) return false;
          for (const k in pp.parts) if (!leq(pp.parts[k].vv, C[k] || {})) return false;
          for (const [wid, pw] of pp.wins) {
            const T = (M.wgone || {})[wid], under = (vv, k) => leq(vv, C[`${wid}/${k}`] || {}) || (!!T && leq(vv, (k === 'exists' ? T.exists[1] : (T.cover || {})[k]) || {}));
            if (!under(pw.exists.vv, 'exists')) return false;
            for (const k in pw.parts) if (!under(pw.parts[k].vv, k)) return false;
            for (const q of pw.pending) if (!under(q.vv, 'data')) return false;
          }
          continue;
        }
        if (!inV(pp.exists, M.p.exists)) return false;
        for (const k in pp.parts) if (!inV(pp.parts[k], M.p[k])) return false;
        for (const [wid, pw] of pp.wins) {
          const mw = M.w[wid], T = M.wgone && M.wgone[wid];
          if (T) {
            if (!leq(pw.exists.vv, T.exists[1])) return false;
            for (const k in pw.parts) if (!leq(pw.parts[k].vv, (T.cover || {})[k] || {})) return false;
            for (const q of pw.pending) if (!leq(q.vv, (T.cover || {}).data || {})) return false;
            continue;
          }
          if (!mw || !inV(pw.exists, mw.p.exists)) return false;
          for (const k in pw.parts) if (!inV(pw.parts[k], mw.p[k])) return false;
          for (const q of pw.pending) if (!inV(q, mw.p.data)) return false;
        }
      }
      for (const [uid, T] of peer.gone.pages) { const M = ledger0.mine[uid]; if (M && !M.gone && !(M.p.exists && leq(T.vv, M.p.exists.v[1]))) return false; if (M && M.gone && !leq(T.vv, M.gone.exists[1])) return false; }
      for (const T of peer.gone.wins.values()) {
        if (collected(`${T.page} ${T.wid}`, T.exists.vv) || dropped[T.page]) continue;
        const M = ledger0.mine[T.page];
        if (!M) return false;
        if (M.gone) continue;
        const mw = M.w[T.wid], G = M.wgone && M.wgone[T.wid];
        if (G ? !leq(T.exists.vv, G.exists[1]) : !(mw && mw.p.exists && leq(T.exists.vv, mw.p.exists.v[1]))) return false;
      }
      return true;
    }
    // A lost ledger, rebuilt from this device's own file (its versions; fingerprints from its values).
    function rebuild(peer, o = {}) {
      const L = ledger({ dev: peer.dev, folder: peer.folder, seq: peer.seq, write: peer.write, peers: {}, ctr: 0, maxSeen: 0 }, []);
      let ctr = 0;
      const E = v => { ctr = Math.max(ctr, v.vv[peer.dev] || 0); return { h: v.h, v: arr(v), rev: 0 }; };
      for (const [uid, pp] of peer.pages) {
        const M = newMine(uid, 0);
        M.p.exists = E(pp.exists);
        for (const k in pp.parts) M.p[k] = Object.assign(E(pp.parts[k]), k === 'photo' && pp.parts[k].ref ? { ref: pp.parts[k].ref } : {});
        for (const [wid, pw] of pp.wins) {
          const mw = { ikey: `${pw.ident.widgetId}:${pw.ident.n}`, p: { exists: E(pw.exists) } };
          for (const k in pw.parts) mw.p[k] = E(pw.parts[k]);
          if (pw.pending.length && mw.p.data) mw.p.data.pending = pw.pending.map(q => ({ v: arr(q), val: q.val, h: q.h }));
          M.w[wid] = mw;
        }
        L.mine[uid] = M;
      }
      for (const [uid, T] of peer.gone.pages) { const M = newMine(uid, 0); M.gone = { exists: arr(T), cover: T.cover || {}, seq: peer.seq, seen: fin(o.now, 0) }; L.mine[uid] = M; ctr = Math.max(ctr, T.vv[peer.dev] || 0); }
      for (const T of peer.gone.wins.values()) { const M = L.mine[T.page] || (L.mine[T.page] = newMine(T.page, 0)); M.wgone[T.wid] = { exists: arr(T.exists), cover: T.exists.cover || {}, seq: peer.seq, seen: fin(o.now, 0) }; }
      for (const k in peer.style || {}) { const v = peer.style[k]; L.sync.style = Object.assign({}, L.sync.style, { [k]: { h: v.h, v: arr(v) } }); ctr = Math.max(ctr, v.vv[peer.dev] || 0); }
      L.sync.ctr = ctr;
      L.sync.merged = Object.assign({}, peer.merged);
      L.base = {};
      return L;
    }

    return { read, stamp, decode, sumText, join, shown, plan, encode, gc, includes, rebuild, photosWanted, ledger, records, patchSettings, joinPatches, newWid, copyWid,
      partH, okV, leq, vjoin, PAGE_PARTS, WIN_PARTS, STYLE_PARTS, WID_RE, DEV_RE };
  })();
  // #endregion

  // What a Board Sync round did, told to the teacher (§8.3), and its Undo. Link (section 13b) hands each round's summary
  // and undo seed to shown(): { at, from, ops: [{ key, rev (written), prev: record | null }], swaps, skip } (swaps and skip:
  // plan's undo: the clashes this device lost, to swap back, and the records of copies that arrived, which the Undo
  // leaves alone: it never removes another device's work).
  // One merge toast at a time: the same message is updated in place (no new node, so a screen reader doesn't hear it
  // again) and its Undo then covers every round it has shown; a plain "Updated from …" gets a new node at most once a
  // minute. The page shown only: other pages change quietly and say so once when next shown (pageShown).
  const MergeUI = {
    t: null, text: '', newAt: 0, plainAt: 0, ops: [], swaps: [], from: [], timer: 0, said: [], round: 0, left: null,
    nameOf(d) {
      return String(Link.names()[d] || 'another device');
    },
    names(list, cap) { const s = andList(Array.from(new Set(list)).map(d => this.nameOf(d))); return cap ? s.charAt(0).toUpperCase() + s.slice(1) : s; },
    shown(summary, seed = {}) {
      if (!summary || !summary.pages) return;
      this.round++;
      const pages = summary.pages, mine = S.board.uid, here = pages[mine], locked = Lock.on();
      // pages added and deleted (not the untouched placeholder, nor this device's own pages when switching boards, nor a
      // deletion made on this device: in an earlier stay in this folder, sent as it left)
      const added = Object.values(pages).filter(p => p.added), deleted = Object.entries(pages).filter(([, p]) => p.deleted && !p.here && !(p.from.length && p.from.every(d => d === devKey())));
      if ((summary.placeholder || Object.values(pages).some(p => p.placeholder)) && added.length) this.say(`The board from ${this.names(summary.from)} is here.`);
      else if (added.length) this.say(added.length === 1 ? `“${added[0].name}” was added on ${this.names(added[0].from.length ? added[0].from : summary.from)}.` : `${added.length} pages were added on ${this.names(summary.from)}.`);
      // (pages deleted on another device: one message, with one Undo, however many. The Undo stays on the page shown:
      // the page shown deleted elsewhere was left first, see Link's step 11, and its Undo goes back to it)
      if (deleted.length) {
        const by = this.names(Array.from(new Set(deleted.flatMap(([, p]) => (p.from.length ? p.from : summary.from)))));
        const left = deleted.some(([uid]) => uid === this.left), bs = deleted.slice().sort((x, y) => (y[0] === this.left) - (x[0] === this.left)).map(([, p]) => p.b), one = deleted.length === 1 ? `“${deleted[0][1].name}” was deleted on ${by}.` : `${deleted.length} pages were deleted on ${by}.`;
        if (locked) this.say(one + (deleted.length === 1 ? ' Board history › Deleted pages has it.' : ' Board history › Deleted pages has them.'));
        else this.say(one, { action: 'Undo', pages: true, timeout: PAGE_UNDO_MS, onAction: () => Pages.undrop(bs, Pages.ids().concat(bs), left ? undefined : () => {}) });
      }
      for (const [uid, p] of Object.entries(pages)) if (p.back && uid !== mine && !p.added) this.say(this.back(p, p.from.length ? p.from : summary.from));
      for (const x of summary.style || []) { const t = this.style(x); if (t) this.say(t); }
      if (!here || !here.changed || here.deleted) return;
      const by = here.from.length ? here.from : summary.from, ops = (seed.ops || []).filter(o => Keys.parse(o.key).board === S.boardId);
      const skip = new Set((seed.skip || (summary.undo && summary.undo.skip) || []));
      const seedHere = { ops: ops.filter(o => !skip.has(o.key)), swaps: (seed.swaps || []).filter(w => w.page === mine), from: by };
      let text, button = 'Undo';
      const clash = here.clashes.find(c => !c.arrived) || here.clashes[0];
      if (here.back) text = this.back(here, by), button = null;
      else if (here.undone) { text = here.mineUndone ? `${this.names(by, true)} undid the changes from this device.` : `${this.names(by, true)} undid the latest changes.`; button = 'Redo'; }
      else if (clash) {
        const w = getWidget(clash.widgetId), name = w ? w.name : 'A window', others = clash.devs.filter(d => d && d !== devKey());
        const both = Array.from(new Set(clash.devs.filter(Boolean))).map(d => this.nameOf(d));
        text = clash.mine ? `${name} was changed here and on ${this.names(others.length ? others : by)} at once, so both versions are kept.`
          : `${name} was changed on ${both.length === 2 ? `${both[0]} and on ${both[1]}` : andList(both)} at once, so both versions are kept.`;
      } else if (here.renamed) text = `This page was also renamed on ${this.names([here.renamed.by])}: it’s called “${here.renamed.name}” now.`;
      else text = `Updated from ${this.names(by)}.`;
      // (nothing written here to undo: the device whose text stayed in the window, where the copy arrived made elsewhere)
      if (!seedHere.ops.length && !seedHere.swaps.length) button = null;
      if (locked || !button) { this.merge(text, null, seedHere); return; }   // (windows locked: no Undo; Board history has it)
      this.merge(text, button, seedHere);
    },
    // The theme, accent color or text style changed on another device ({by, theme, accent, accentColor, letters}): they
    // are the whole board's, on every device. No Undo: changing it back in Settings is one tap, and syncs. The accent is
    // named as it shows now (accentShown): "a custom one" for a custom color.
    style(x) {
      const a = ('accent' in x || 'accentColor' in x) && accentNow(), accent = a && (a[0] === '#' ? 'a custom one' : accentOf(a)[2]);
      const theme = { light: 'Light', dark: 'Dark', system: 'Auto' }[x.theme];
      const text = Object.prototype.hasOwnProperty.call(LETTERS, x.letters) ? LETTERS[x.letters].name : null;
      const what = andList([theme && `the theme to ${theme}`, accent && `the accent color to ${accent}`, text && `the text style to “${text}”`].filter(Boolean));
      return what ? `${this.names([x.by], true)} changed ${what}.` : '';
    },
    // A page deleted here is back: brought back on another device (its Undo, Bring back), or changed there before the
    // deletion reached it (Merge.plan's back).
    back(p, by) {
      return p.back === 'returned' ? `“${p.name}” was brought back on ${this.names(by)}.` : `“${p.name}” is back: it was changed on ${this.names(by)} before the deletion reached it.`;
    },
    // Another merge toast, shown at once: it replaces the merge toasts of earlier rounds that are up. (One round that
    // deletes or adds pages and changes the page shown says each.)
    say(text, opts = {}) { this.drop(); this.dropSaid(); const t = toast(text, opts); t.round = this.round; this.said.push(t); return t; },
    drop() { if (this.t && this.t.isConnected) this.t.remove2(); this.t = null; this.ops = []; this.swaps = []; this.from = []; clearTimeout(this.timer); },
    dropSaid() { this.said = this.said.filter(t => { if (t.round === this.round) return t.isConnected; if (t.isConnected) t.remove2(); return false; }); },
    // The merge toast of the page shown: updated in place, or a new one. (A plain "Updated from …" gets a new node at
    // most once a minute: until then it joins the toast that is up, which keeps its text if it says more.)
    merge(text, button, seed) {
      const up = this.t && this.t.isConnected && this.t.board === S.boardId;
      const plain = /^Updated from /.test(text);
      const run = () => { const o = this.ops, w = this.swaps, f = this.from; this.drop(); this.undo(o, w, f); };
      if (up && (this.text === text || (plain && Date.now() - this.newAt < Link.waits.toast))) {
        if (/^Updated from /.test(this.text)) { $('span', this.t).textContent = text; this.text = text; }
        this.ops = this.ops.concat(seed.ops); this.swaps = this.swaps.concat(seed.swaps); this.from = this.from.concat(seed.from);
        // (a round that brought something to undo, joining a message that had nothing: its Undo is added in place)
        if (button && !$('button', this.t)) { const b = document.createElement('button'); b.textContent = button; b.addEventListener('click', () => { const t = this.t; run(); if (t && t.isConnected) t.remove2(); }); this.t.appendChild(b); }
      } else if (plain && !up && Date.now() - this.plainAt < Link.waits.toast) {
        return;   // (a plain "Updated from …" gets a new message at most once a minute: until then the page changes quietly)
      } else {
        this.drop(); this.dropSaid();
        this.ops = seed.ops; this.swaps = seed.swaps; this.from = seed.from; this.text = text; this.newAt = Date.now();
        if (plain) this.plainAt = this.newAt;
        this.t = toast(text, button ? { action: button, timeout: 0, onAction: run } : { timeout: 0 });
        this.t.board = S.boardId;   // (an Undo of this page: it goes when another page is shown)
      }
      clearTimeout(this.timer);
      const t = this.t;
      this.timer = setTimeout(() => { if (this.t === t) this.drop(); }, PAGE_UNDO_MS);
    },
    // Undo (or Redo) of what merges wrote on the page shown: each record goes back to what it was, if nobody has
    // changed it since; a clash is undone by swapping, so the other device's version stays, as the copy. It syncs:
    // written as this device's changes, marked as an Undo (u), and Board history keeps the page as it was first.
    async undo(ops, swaps, from) {
      if (Lock.on()) { toast('Windows are locked. Board history has the earlier version.'); return; }
      if (!ops.length && !swaps.length) return;
      const b = S.boardId;
      await BoardHistory.before('undo', `Before undoing the changes from ${this.names(from)}`);
      if (b !== S.boardId) return;
      const keys = Array.from(new Set(ops.map(o => o.key)));
      let cur = [];
      try { cur = await Store.getMany(keys); } catch (e) { toast('Couldn’t undo that just now. Try again in a moment.'); return; }
      const now = new Map(keys.map((k, i) => [k, cur[i] || null]));
      // (the copies made for this device's versions: they take the other device's version instead of going)
      const copyKeys = new Set(), swapped = [];
      for (const w of swaps) {
        const orig = Array.from(S.insts.entries()).find(([, i]) => i.wid === w.wid), copy = Array.from(S.insts.entries()).find(([, i]) => i.wid === w.copyWid);
        if (!orig || !copy) continue;
        ['inst', 'data', 'conf'].forEach(k => copyKeys.add(Keys[k](b, copy[0])));
        swapped.push({ orig: orig[0], copy: copy[0], other: clone(S.data.get(orig[0])), label: copy[1].copyOf, t: w.t });
      }
      Raced.clear(keys);
      let missed = false;
      const firstOf = new Map();
      for (const o of ops) if (!firstOf.has(o.key)) firstOf.set(o.key, o);   // (the earliest round's record: what it was before them all)
      const lastRev = new Map(ops.map(o => [o.key, o.rev]));
      for (const [key, o] of firstOf) {
        if (copyKeys.has(key)) continue;
        const c = now.get(key);
        if ((c ? c.rev : 0) !== (lastRev.get(key) || 0) && !(o.prev === null && !c && !lastRev.get(key))) { missed = true; continue; }   // (changed again since)
        const prev = o.prev;
        applyRecord(key, prev ? { key, rev: (Known.get(key) || 0) + 1, value: prev.value } : undefined);
        if (prev) Writer.put(key, prev.type || Keys.parse(key).kind, prev.value, { undo: true }); else Writer.del(key);
      }
      for (const w of swapped) {
        const dk = Keys.data(b, w.copy), ik = Keys.inst(b, w.copy), inst = S.insts.get(w.copy);
        const other = (w.label && w.label.from) || '', who = from.find(d => d !== devKey()) || other;
        applyRecord(dk, w.other == null ? undefined : { key: dk, rev: (Known.get(dk) || 0) + 1, value: w.other });
        if (w.other == null) Writer.del(dk); else Writer.put(dk, 'data', w.other, { undo: true });
        if (inst) {
          const v = Object.assign({}, inst, { copyOf: { wid: S.insts.get(w.orig) ? S.insts.get(w.orig).wid : w.label.wid, from: who, name: this.nameOf(who), at: w.t || Date.now() } });   // (the other device's version, and its own time)
          applyRecord(ik, { key: ik, rev: (Known.get(ik) || 0) + 1, value: v });
          Writer.put(ik, 'inst', v, { undo: true });
        }
      }
      afterBulkApply();
      Picker.renderControls();
      Link.changed(keys, { now: true });   // (a round at once, and this device's file written at once)
      toast(missed ? 'Undone, except what was changed again since.' : 'Undone. Your other devices get this too.');
    },
    // Windows were locked: no Undo is offered (anyone can tap the smartboard). Board history still has it.
    locked() {
      for (const t of [this.t].concat(this.said)) { const b = t && t.isConnected && $('button', t); if (b && /^(Undo|Redo)$/.test(b.textContent)) b.remove(); }
    },
    // A page is shown again: if another device changed it while it wasn't shown here, say so once.
    pageShown(uid) {
      const q = Link.quietNote(uid);
      if (!q || !q.from || !q.from.length) return;
      toast(`Changed on ${this.names(q.from)} ${when(q.t || q.at)}.`, { action: 'Board history', timeout: 8000, onAction: () => HistorySheet.open(Settings.side || 'left') });
    }
  };

  // =====================================================================
  // 14. Dialogs and toasts
  // =====================================================================
  let dialogResolve = null;
  let dialogHeld = false;   // a dialog has just closed, and the key that answered it may still be down (dialogKey)
  // input: {label, placeholder, maxlength}: also asks for a line of text; resolves {value, text} (or null).
  // input.html: markup under the field (the caller escapes it, and wires up its controls). input.focus: false: the
  // keyboard goes to the first button instead (on a touch screen, a field given the keyboard brings up the on-screen one).
  // html: more under the message, as markup (the caller escapes what goes in it). cls: a class for the card.
  function dialog({ title, message, actions, input, html, cls }) {
    closePopups({ keepSettings: true, keepHistory: true });
    if (dialogResolve) dialogResolve(null);
    const modal = $('#modal'), card = $('.modal-card', modal);
    const back = document.activeElement;   // where the keyboard was: it goes back there afterwards (dialogBack)
    // A screen reader says the title as the dialog's name, then reads the message.
    modal.setAttribute('aria-labelledby', 'modal-title');
    const desc = [message ? 'modal-text' : '', html ? 'modal-more' : ''].filter(Boolean).join(' ');
    if (desc) modal.setAttribute('aria-describedby', desc); else modal.removeAttribute('aria-describedby');
    card.className = 'modal-card' + (cls ? ' ' + cls : '');
    card.innerHTML = `<h3 id="modal-title">${esc(title)}</h3>${message ? `<p id="modal-text">${esc(message)}</p>` : ''}` + (html ? `<div id="modal-more">${html}</div>` : '') +
      (input ? `<label class="modal-input"><span>${esc(input.label || '')}</span><input type="text" class="text-input" maxlength="${+input.maxlength || 60}" placeholder="${esc(input.placeholder || '')}" autocomplete="off"></label>${input.html || ''}` : '') +
      `<div class="modal-actions">` +
      actions.map((a, i) => `<button class="btn ${a.kind || ''} ${a.choice ? 'choice' : ''}" data-i="${i}">${esc(a.label)}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</button>`).join('') + '</div>';
    modal.classList.add('open');
    const field = input ? $('input', card) : null;
    const first = (input && input.focus !== false && field) || $('.modal-actions .btn', card);
    if (first) first.focus({ preventScroll: true });   // (a card taller than the screen, at a large size, opens at its title)
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

  // Board Sync can't sync right now (Link.problem): a note above the Widget Picker buttons, for as long as that
  // lasts, so that syncing is never off for a whole day unnoticed. "Reconnect folder": Chrome wants to be asked
  // again (after a restart, in a plain tab), and asks only from a tap: one tap on the note. "Folder unavailable"
  // (it can't be found or read), "Not synced" (this device's file can't be written) and "Update 21Board" (another
  // device has a newer 21Board): a tap says what happened and what to do.
  const FolderNote = {
    els: null,
    init() { this.els = cornerNotes('folder-note', () => this.tap()); this.update(); },
    update() {
      if (!this.els) return;
      const p = Link.problem(), up = !!SaveNote.state();
      const text = { allow: 'Reconnect folder', missing: 'Folder unavailable', send: 'Not synced', newer: 'Update 21Board' }[p];
      const label = { allow: 'Reconnect your Board Sync folder', missing: 'Your Board Sync folder is unavailable: what to do', send: 'Changes made here aren’t reaching your other devices: what to do',
        newer: 'Another device uses a newer 21Board: what to do' }[p];
      for (const { b, side, bare } of this.els) {
        // (only what changed is written: this runs at every look at the folder, and a change is a change to the page)
        const hide = !p || Picker.btns[side].hidden, bottom = up ? 'calc(132px + env(safe-area-inset-bottom))' : bare ? '86px' : '';   // above "Not saved", when both show
        if (b.hidden !== hide) b.hidden = hide;
        if (p && b.dataset.is !== p) { b.dataset.is = p; b.innerHTML = `<span class="status-dot warn"></span>${text}`; b.setAttribute('aria-label', label); }
        if (b.style.bottom !== bottom) b.style.bottom = bottom;
        if (bare && b.style.display !== (hide ? 'none' : '')) b.style.display = hide ? 'none' : '';
      }
    },
    tap() { if (Link.problem() === 'allow') Link.reconnect(); else this.explain(); },
    // What happened and what to do (the note's dialog, and Settings).
    info() {
      const p = Link.problem(), t = Link.trouble, name = Link.dir ? Link.dir.name : '';
      const off = ', this board isn’t synced with your other devices.';
      if (p === 'allow') {
        return Link.perm === 'denied' ? { title: `21Board isn’t allowed to use your “${name}” folder`, text: 'Chrome is blocking it. Choose the folder again to allow it. If Chrome still refuses, ask your school’s IT. Until it is allowed' + off }
          : { title: `Reconnect your “${name}” folder`, text: 'Chrome asks again after a restart unless 21Board is installed (or you chose “Allow on every visit”). Until you allow it' + off };
      }
      if (p === 'missing') {
        // (Choosing it again is suggested only once it has been gone a while: Google Drive may just be starting.)
        return { title: `21Board can’t find your “${name}” folder`, text: (Date.now() - t.since >= LINK_LOST_MS ? `It went missing ${when(t.since)}. If it was renamed, moved or deleted, choose it again.` : 'Google Drive may still be starting, or this device may be offline.') +
          ' 21Board keeps looking, and carries on by itself when the folder is back. Until then' + off };
      }
      if (p === 'newer') return { title: 'Update 21Board on this device', text: `${cap(Link.newer)} uses a newer 21Board, so its changes can’t show here until this device is updated too.` };
      if (p !== 'send') return null;
      const say = LINK_SAY[t.code] || LINK_SAY.other;
      return { title: 'Your changes aren’t reaching your other devices', text: `21Board couldn’t save them in your folder ${when(t.at)}: ${say[0]}. ${say[1]} 21Board keeps trying, and changes from your other devices still show here.` };
    },
    async explain() {
      const p = Link.problem(), i = this.info();
      if (!i) return;
      if (Link.trouble) Link.trouble.said = true;
      const acts = p === 'send' ? [{ label: 'Try again now', value: 'send', kind: 'primary' }]
        : p === 'newer' ? (S.sw.updateReady ? [{ label: 'Update now', value: 'update', kind: 'primary' }] : [])
        : p === 'missing' ? [{ label: 'Look again now', value: 'check', kind: 'primary' }, { label: 'Choose the folder again…', value: 'choose' }]
        : Link.perm === 'denied' ? [{ label: 'Choose the folder again…', value: 'choose', kind: 'primary' }] : [{ label: 'Allow…', value: 'allow', kind: 'primary' }];
      const go = await dialog({ title: i.title, message: i.text, actions: acts.concat([{ label: 'Close', value: null, kind: acts.length ? '' : 'primary' }]) });
      if (go === 'choose') { const got = await Link.choose(); if (got) await Link.welcome(got); }
      else if (go === 'allow') await Link.reconnect();
      else if (go === 'send') await Link.retryNow();
      else if (go === 'update') askUpdate();
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

  /*
   * Opening maximized. Installed, 21Board opens in a window of its own, at the size Chrome gives it; on a smartboard
   * it should have the whole screen. Once per launch, when the window opens:
   *   - at once, the window is moved and sized to cover the screen (an app window may do this without a tap; in a
   *     tab it does nothing). It covers the screen, but isn't "maximized";
   *   - at the first tap (or key) anywhere, a tap in a widget's window too, once the tap has done what it does,
   *     window.maximize() makes it maximized for real. Chrome 155+ (Chromebooks first). It needs that tap, and the
   *     window-management permission: Chrome asks once, unless IT grants it (WindowManagementAllowedForUrls). Refused or
   *     missing, the window stays as the first step left it.
   * Never again in that window: a reload isn't a launch (sessionStorage), and a window the teacher has made smaller or
   * moved stays so. Not in a tab, kiosk mode (always full screen), the widget dev window or a window already maximized
   * or full screen. The board follows as it does any resize.
   */
  function openMaximized() {
    if (LAB || KIOSK || !window.matchMedia) return;
    const mq = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };
    const full = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || mq('(display-state: fullscreen)');
    if (!['standalone', 'minimal-ui', 'window-controls-overlay'].some(m => mq(`(display-mode: ${m})`))) return;   // a tab
    try {
      if (sessionStorage.getItem('21board-launched')) return;
      sessionStorage.setItem('21board-launched', '1');
    } catch (e) { /* can't tell a reload from a launch: a launch */ }
    // (Marked even then: a window closed maximized opens maximized next time, and once the teacher makes it smaller, a
    // reload leaves it so.)
    if (full() || mq('(display-state: maximized)')) return;
    const sc = window.screen, x = sc.availLeft || 0, y = sc.availTop || 0, w = sc.availWidth, h = sc.availHeight;
    const at = () => ({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight });
    // (A few px either way: Chrome on Linux leaves a window sized to the screen 1 px short, a maximized one on Windows
    // reaches past the edges.)
    const covers = b => b.x <= x + 4 && b.y <= y + 4 && b.x + b.w >= x + w - 4 && b.y + b.h >= y + h - 4;
    const launched = at();
    if (w > 0 && h > 0 && !covers(launched)) { try { window.moveTo(x, y); window.resizeTo(w, h); } catch (e) { /* not allowed here */ } }
    if (typeof window.maximize !== 'function') return;
    let perm = null;   // (its state follows the teacher's answer)
    try { navigator.permissions.query({ name: 'window-management' }).then(s => { perm = s; }, () => {}); } catch (e) { /* unknown here */ }
    const events = ['pointerup', 'click', 'keydown'];
    const active = () => !navigator.userActivation || navigator.userActivation.isActive;
    let done = false;
    const tap = e => {
      // The tap's activation: a finger's comes at pointerup, not pointerdown.
      if (done || (e && !e.isTrusted) || !active()) return;
      // maximize() uses the activation up, so the tap does what it does first (its click or key: Reconnect, full screen,
      // a file to open…), and maximize() comes after, if the activation is left; if the tap used it, at the next tap. A
      // finger's click comes a moment after it's lifted, and a widget's frame clicks when the button is let go.
      setTimeout(() => {
        if (done || !active()) return;
        done = true;
        for (const t of events) window.removeEventListener(t, tap, true);
        window.removeEventListener('blur', inFrame);
        const b = at(), same = Math.abs(b.x - launched.x) <= 4 && Math.abs(b.y - launched.y) <= 4 && Math.abs(b.w - launched.w) <= 4 && Math.abs(b.h - launched.h) <= 4;
        if ((perm && perm.state === 'denied') || full() || mq('(display-state: maximized)') || !(covers(b) || same)) return;
        try { const p = window.maximize(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* refused */ }   // (never awaited)
      }, !e ? 1000 : e.type === 'pointerup' && e.pointerType !== 'mouse' ? 300 : 0);
    };
    // A tap inside a widget's window reaches its frame, not this page: the page gets its activation, and loses the focus.
    const inFrame = () => setTimeout(() => { const f = document.activeElement; if (f && f.tagName === 'IFRAME') tap(); }, 0);
    for (const t of events) window.addEventListener(t, tap, true);
    window.addEventListener('blur', inFrame);
  }

  const DAY = 24 * 60 * 60 * 1000;
  function backupAgo() {
    const t = S.settings.lastBackupAt;
    if (!t) return 'Last backup: never';
    const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const days = Math.round((midnight(Date.now()) - midnight(t)) / DAY); // calendar days, DST-safe
    return 'Last backup: ' + (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
  }

  // When the oldest window on any page was made (its createdAt; Infinity: none): the board has had something worth keeping
  // since then. The page shown is S.insts; the others are what this tab holds of them (Pages.held, kept as they change
  // here, in another tab or by a merge), deleted pages left out. Known at once, so Settings' amber dot is right from the
  // moment it opens, whatever was deleted since it was last open.
  function oldestWindow() {
    let oldest = Infinity;
    for (const i of S.insts.values()) oldest = Math.min(oldest, i.createdAt || Infinity);
    const gone = Pages.gone();
    for (const [key, r] of Pages.held) { const k = Keys.parse(key); if (k.kind === 'inst' && r.value && !gone.has(k.board)) oldest = Math.min(oldest, r.value.createdAt || Infinity); }
    return oldest;
  }

  // If the browser hasn't promised to keep the data, remind (at most every 3 days) to export a backup.
  async function maybeRemindBackup() {
    // Not in a kiosk: no one is signed in, so it would reach whoever is at the panel, in a lesson, about something
    // only IT can settle; and a backup that leaves the device needs a USB drive in hand. (Settings has Back up now.)
    if (KIOSK) return;
    if (document.visibilityState !== 'visible') return; // never use up the reminder in a background tab
    if (Persist.state === 'granted' || Store.failed || !S.data.size) return;
    if (!(Date.now() - oldestWindow() > DAY)) return;                 // brand-new board: nothing to lose yet
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
        focused: S.focused, settings: { theme: S.settings.theme, accent: accentNow() }, scale: boardScale(), shape: freeShape() ? 'free' : '16:9'
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
        case 'accent': if (accentOk(a.value)) updateSettings(accentSet(a.value)); break;   // (a key from ready's list, or a custom '#rrggbb')
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
  // 15c. Pictures pasted or dropped onto the board
  // ---------------------------------------------------------------------
  // A picture pasted (Ctrl+V, ⌘V) or dropped onto the board opens in a new Picture window (widgets/image): in the middle
  // of the board, or where it was dropped, one window for each picture, which keeps its middle there as it takes the
  // picture's shape. The window opens first; once its page has started (hello), the board sends it the file ('file'),
  // and the widget checks it, shrinks it if it must and saves it as its content, as it does for its own Open…. A paste
  // or drop inside a widget that the widget didn't take comes here too (the SDK passes it on; a .21board file dropped
  // there imports, as on the board), except from a widget uploaded in Developer mode. A paste in the board's own text
  // fields, or while a dialog is open, is theirs; text pasted on the board does nothing. Not while windows are locked
  // (section 12b): the board says how to unlock, as it does for a window moved.
  // =====================================================================
  const PICTURE_ID = 'image';
  const Pictures = {
    // A file that may be a picture, by its type or name. (Its bytes are checked by the widget, which says what's wrong:
    // an SVG, a HEIC photo, a file that isn't a picture at all.)
    is(f) { return !!f && typeof f.arrayBuffer === 'function' && (/^image\//i.test(f.type || '') || /\.(png|jpe?g|jfif|gif|webp|avif|svgz?|hei[cf]|bmp|tiff?)$/i.test(f.name || '')); },
    // A Picture window for each picture among files (10 at most, and the rest asked for again), near at (layout px) or
    // in the middle of the board. reason: 'paste' or 'drop'. False when there was no picture to open.
    open(files, reason, at) {
      const all = Array.from(files || []).filter(f => this.is(f)), pics = all.slice(0, 10);
      if (!pics.length || !getWidget(PICTURE_ID) || !Store.loaded) return false;
      if (Lock.refuse()) return true;
      if (all.length > pics.length) toast(reason === 'paste' ? 'Opened 10 pictures. Paste the rest again.' : 'Opened 10 pictures. Drop the rest again.');
      for (const file of pics) {
        const ik = openWidget(PICTURE_ID, { fresh: true, at: at || undefined }), w = ik && S.wins.get(ik);
        if (!w) continue;
        w.keepAt = w.middle();   // (taking the picture's shape, it stays where it opened: windowOp setSize)
        w.files = (w.files || []).concat({ file, reason: reason === 'paste' ? 'paste' : 'drop' });
        if (w.connected) this.deliver(w);
      }
      return true;
    },
    // What a window's widget didn't take (the SDK passes it on): as on the board. A picture dropped opens beside that
    // window; a .21board file dropped imports.
    fromWin(w, files, reason) {
      const f = files[0];
      if (reason === 'drop' && f && typeof f.text === 'function' && /\.21board$|\.json$/i.test(f.name || '')) importFile(f);
      else this.open(files, reason, reason === 'drop' ? w.middle() : null);
    },
    deliver(w) {
      const list = w.files;
      w.files = null;
      for (const x of list || []) w.post('file', x);
    },
    init() {
      document.addEventListener('paste', e => {
        const t = e.target;
        if (e.defaultPrevented || $('#modal.open') || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
        if (this.open(e.clipboardData && e.clipboardData.files, 'paste')) e.preventDefault();
      });
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
      // (Settings and Board history's columns beside it count as one: a tap in either leaves both open. So does a tap on a
      // message, as for Board history on its own: a merge's Undo while looking through Board history.)
      const cols = HistorySheet.beside && t.closest('#settings, #history, #history-detail, #toasts');
      if (Settings.isOpen && !cols && !t.closest('#settings') && !t.closest('#modal') && !t.closest('.picker-btn') && !t.closest('#panel')) Settings.close();
      if (HistorySheet.isOpen && !cols && !t.closest('#history, #history-detail') && !t.closest('#modal') && !t.closest('#toasts') && !t.closest('.picker-btn') && !t.closest('#panel') && !t.closest('#empty-hint')) HistorySheet.close();
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
      else if (HistorySheet.isOpen) HistorySheet.escape();   // (a version's column, then the list, then Settings)
      else if (Settings.isOpen) Settings.close(true);
    });

    $('#import-input').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importFile(f);
    });

    // Dropping a .21board file onto the board imports it. Pictures open in Picture windows, where they were dropped
    // (section 15c).
    window.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      if (/\.21board$|\.json$/i.test(f.name)) importFile(f);
      else Pictures.open(e.dataTransfer.files, 'drop', toLayout({ left: e.clientX, top: e.clientY, width: 0, height: 0 }));
    });
    Pictures.init();

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
    try { openMaximized(); } catch (e) { /* an installed app's window (section 15): the board starts anyway */ }
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
    // Theme Auto is the default for new devices (since 2026.11.16-1). A device from before that never saved a setting
    // was showing Light: it keeps it. (It has records already; a new device, or one just erased, has none.) The
    // settings are saved either way, so that the next start can tell.
    if (!LAB && !Store.failed && !Known.has(Keys.settings)) updateSettings(Known.size ? { theme: 'light' } : {});
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
    catalog: () => Array.from(catalog.values()), link: Link, history: BoardHistory, historySheet: HistorySheet, historyPlan, pages: Pages, updateBoard,
    merge: Merge, mergeUI: MergeUI, applyMerged, placeCopy, zTop, raced: Raced, writer: Writer, accentNow
  };

  // (A problem after the board is up is logged, as before; before that, the teacher is told.)
  boot().catch(err => { if (Startup.ready) console.error('21Board: start-up problem', err); else Startup.fail(err); });
})();
