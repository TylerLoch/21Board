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
 * Words come from a table, in English, Spanish, Russian, and Ukrainian: docs/WIDGET-SDK.md, "Languages".
 *
 * Talks to the board with window.postMessage, so a widget never touches
 * IndexedDB itself.
 *
 * Anywhere else, such as its own file, a local server or an AI tool's preview,
 * the SDK shows the widget in a real 21Board window: the dev window
 * (sdk/board21-dev.js), with the real title bar, resize handles, menu and
 * Settings. For that, this must be the FIRST script in <head>.
 *
 * For just the widget on its own, add #b21-bare to the address or data-dev="off"
 * to this script tag. It then runs standalone: data in localStorage, window calls
 * ignored.
 */
(function () {
  'use strict';
  // (A page rewritten with document.open() keeps its window and document, but not its <html> element: an SDK
  // from the old page doesn't count.)
  if (window.Board21 && window.Board21.page === document.documentElement) return;

  var SDK_VERSION = '1.6.0';
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
  var heldFiles = [];   // 'file' events that came before any listener: given to the first one (see on)
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
    var font = Words.fontFor(palette.font, language);   // (a Russian or Ukrainian window skips the bundled Latin fonts)
    root.setAttribute('data-b21-theme', theme);
    root.style.colorScheme = theme;
    Object.keys(palette).forEach(function (k) { root.style.setProperty('--b21-' + k, k === 'font' ? font : palette[k]); });
    applyLetters(font);
  }

  // ---------------------------------------------------------------- text style
  // The teacher can choose easier-to-read letters (21Board's Settings → Appearance → Text style): --b21-font then
  // starts with a font that comes with 21Board, in its fonts/ folder. Its @font-face rules are added here,
  // pointing at that folder next to this script (…/sdk/board21.js), and fetch the files only once text uses
  // them. For the built-in widgets that's the board's own site; a widget on another site that loads this
  // script from the board gets them only if the board's site allows it (CORS), and one with its own copy of
  // the SDK only if a fonts/ folder is next to it. Otherwise its text stays in the device's own font, the
  // next one in --b21-font. Text a widget fits to its window must be fitted again in the new letters: a
  // resize event (the window's, and Board21.on('resize')) fires when they change, and again once the font has
  // loaded.
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
      // Board21's own 'resize' too, for a widget that fits or draws its text there: inside 21Board it otherwise
      // comes only from the board, once, before the new font has arrived. (Standalone, the line above does it.)
      if (context && !standalone) emit('resize', context.window || windowInfo());
    }, 30);
  }
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', function () { if (Object.keys(lettersAdded).length) refit(); });
  }

  // #region Words
  // tests/words.js and tools/words.js load this region by its markers.
  // A widget's words, in English, Spanish, Russian, and Ukrainian: its table (Board21.words), looked up in the window's
  // language (Board21.t) or the board's (Board21.ui), with plurals, placeholders, the pseudo language, and dates. No DOM
  // here: the code after the region wires it to the page.
  var LANGS = ['en', 'es', 'ru', 'uk'];
  var PSEUDO = 'qps';   // the pseudo language, for developers: every word from the table, accented, longer, and in ［ ］
  var LOCALES = { en: 'en-US', es: 'es-US', ru: 'ru-RU', uk: 'uk-UA', qps: 'ru-RU' };
  var NAMES = { en: 'English', es: 'Español', ru: 'Русский', uk: 'Українська' };
  var IN_ENGLISH = { en: 'English', es: 'Spanish', ru: 'Russian', uk: 'Ukrainian', qps: 'the pseudo language' };   // (for messages)
  // The plural forms a row gives, by Intl.PluralRules category. Spanish may add many (exact millions), never must.
  var FORMS = { en: ['one', 'other'], es: ['one', 'other'], ru: ['one', 'few', 'many', 'other'], uk: ['one', 'few', 'many', 'other'] };
  var OPTIONAL_FORMS = { es: ['many'] };
  var KEY_RE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/;
  var PLACEHOLDER = /\{([A-Za-z0-9]+)\}/g;

  // #region Common words
  // Common words: one meaning in every widget, in English, Spanish, Russian, and Ukrainian.
  // Every key starts with b21.
  // Widgets show them with Board21.t() and data-t, like their own window words.
  // Change any text in quotes. Rules: docs/TRANSLATING.md.
  var COMMON_WORDS = {
    window: {
      'b21.start': { note: 'Button that starts a timer or a game. Often a play icon, with this as its screen reader name.',
        en: 'Start',
        es: 'Iniciar',
        ru: 'Старт',
        uk: 'Старт' },
      'b21.pause': { note: 'Button that stops for now. Start goes on from the same spot.',
        en: 'Pause',
        es: 'Pausar',
        ru: 'Пауза',
        uk: 'Пауза' },
      'b21.reset': { note: 'Button that puts a timer or a game back to its start. Not the board’s Reset…, which clears a window.',
        en: 'Reset',
        es: 'Restablecer',
        ru: 'Сбросить',
        uk: 'Скинути' }
    }
  };
  // #endregion Common words

  var hasOwn = function (o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); };
  var isCode = function (c) { return typeof c === 'string' && (LANGS.indexOf(c) >= 0 || c === PSEUDO); };
  var blank = function (v) { return v == null || v === '' || (typeof v === 'string' && !v.trim()); };
  // "a", "a and b", "a, b, and c"
  function andList(items) {
    return items.length < 3 ? items.join(' and ') : items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  // The language at the end of a frame's name, 'b21-board:<window>;<language>', or English.
  function langFromName(name) {
    var m = /^b21-board:[^;]*;([a-z]+)$/.exec(String(name || ''));
    return m && isCode(m[1]) ? m[1] : 'en';
  }
  // b21-lang=<language> in the address's #, or English.
  function langFromHash(hash) {
    var m = /(?:^#|[#&])b21-lang=([a-z]+)(?=&|$)/.exec(String(hash || ''));
    return m && isCode(m[1]) ? m[1] : 'en';
  }
  // The board's word for the window's language wins, when it is one.
  function confirmLang(sent, current) { return isCode(sent) ? sent : current; }

  // ---- Plurals, placeholders, and the pseudo language
  var pluralRules = {};
  function pluralOf(n, locale) {
    if (typeof Intl === 'undefined' || !Intl.PluralRules) return 'other';
    var r = pluralRules[locale] || (pluralRules[locale] = new Intl.PluralRules(locale));
    return r.select(Number(n));
  }
  // The names of the placeholders in a text, or in every form of a plural one.
  function placeholders(value) {
    var out = [], texts = typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.keys(value).map(function (k) { return value[k]; }) : [];
    texts.forEach(function (t) { String(t).replace(PLACEHOLDER, function (m, name) { if (out.indexOf(name) < 0) out.push(name); return m; }); });
    return out.sort();
  }
  // {name} filled with String(vars.name), as plain text. One with no value stays as it is.
  function fill(text, vars) {
    var unfilled = [];
    var out = String(text).replace(PLACEHOLDER, function (m, name) {
      if (vars != null && typeof vars === 'object' && hasOwn(vars, name) && vars[name] !== undefined) return String(vars[name]);
      if (unfilled.indexOf(name) < 0) unfilled.push(name);
      return m;
    });
    return { text: out, unfilled: unfilled };
  }
  var ACCENTS = {
    a: 'à', b: 'ƀ', c: 'ç', d: 'ď', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ĺ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ', q: 'ʠ', r: 'ŕ', s: 'š',
    t: 'ţ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž', A: 'À', B: 'Ɓ', C: 'Ç', D: 'Ď', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ĺ',
    M: 'Ṁ', N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Ŝ', T: 'Ţ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž'
  };
  // English in look-alike letters, with one Cyrillic letter, padded to `longest`, inside ［ ］. Placeholders stay.
  function pseudoText(en, longest) {
    var s = String(en == null ? '' : en).replace(/\{[A-Za-z0-9]+\}|[A-Za-z]/g, function (c) { return c.length > 1 ? c : ACCENTS[c]; }) + 'д';
    while (s.length < longest) s += '·';
    return '［' + s + '］';
  }
  // A window row in the pseudo language: a text, or its forms by Russian rules (one from English one; few, many, and
  // other from English other), each as long as that form's longest Spanish, Russian, or Ukrainian.
  function pseudo(row) {
    var formOf = function (v, f) { return typeof v === 'string' ? v : v && typeof v === 'object' && typeof v[f] === 'string' ? v[f] : ''; };
    var longest = function (f) { return Math.max.apply(null, ['es', 'ru', 'uk'].map(function (l) { return formOf(row[l], f).length; })); };
    var en = row.en;
    if (en && typeof en === 'object') {
      var out = {};
      FORMS.ru.forEach(function (f) { out[f] = pseudoText(f === 'one' && en.one != null ? en.one : en.other, longest(f)); });
      return out;
    }
    return pseudoText(en, longest(null));
  }
  // The Latin words of two or more letters outside ［ ］: English the pseudo language left.
  function auditText(text) {
    return String(text == null ? '' : text).replace(/［[^］]*(］|$)/g, ' ').match(/[A-Za-zÀ-ɏ]{2,}/g) || [];
  }

  // ---- Fonts
  // A family to put first for a language. Empty, and planned to stay so: one font for all four.
  var LANG_FONT = { en: null, es: null, ru: null, uk: null };
  // The scripts each bundled family has (fonts/). Neither has Cyrillic letters.
  var FACE_SCRIPTS = { 'Atkinson Hyperlegible': ['latin'], '21Board Early Readers': ['latin'] };
  var LANG_SCRIPT = { en: 'latin', es: 'latin', ru: 'cyrillic', uk: 'cyrillic', qps: 'cyrillic' };
  // The teacher's font stack for a language: a leading bundled family without its letters is dropped, so a Russian or
  // Ukrainian window keeps the device's own font, with no mixed letters.
  function fontFor(stack, lang) {
    var s = String(stack == null ? '' : stack), script = LANG_SCRIPT[lang] || 'latin', m;
    while ((m = /^\s*"([^"]+)"\s*(?:,\s*|$)/.exec(s)) && hasOwn(FACE_SCRIPTS, m[1]) && FACE_SCRIPTS[m[1]].indexOf(script) < 0) s = s.slice(m[0].length);
    return LANG_FONT[lang] ? '"' + LANG_FONT[lang] + '", ' + s : s;
  }

  // ---- Numbers and dates. Numbers always in English form; dates in the window's locale.
  var format = {
    number: function (n, options) { return new Intl.NumberFormat('en-US', options).format(n); },
    // 12-hour unless the options ask, with the time of day in words in Russian and Ukrainian ('3:05 дня').
    date: function (date, options, locale) {
      var o = {}, lang = String(locale || 'en-US').slice(0, 2).toLowerCase();
      for (var k in options) if (hasOwn(options, k)) o[k] = options[k];
      if (o.hour !== undefined && o.hour12 === undefined && o.hourCycle === undefined) {
        o.hourCycle = 'h12';
        if (lang === 'ru' || lang === 'uk') o.dayPeriod = 'short';
      }
      var s = new Intl.DateTimeFormat(locale, o).format(new Date(date));
      if (lang === 'ru') s = s.replace(/полд\./g, 'дня');   // (noon: a word a child can read)
      if (lang === 'uk') s = s.replace(/ʼ/g, '’');   // (the apostrophe the tables use)
      return s;
    },
    list: function (items, type, locale) {
      items = Array.prototype.map.call(items || [], String);
      if (typeof Intl === 'undefined' || !Intl.ListFormat) return items.join(', ');
      return new Intl.ListFormat(locale, { type: type === 'or' ? 'disjunction' : 'conjunction', style: 'long' }).format(items);
    },
    plural: function (n, locale) { return pluralOf(n, locale); },
    capital: function (text, locale) {
      var s = String(text == null ? '' : text), n = /^[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(s) ? 2 : 1;
      return s.slice(0, n).toLocaleUpperCase(locale) + s.slice(n);
    }
  };

  // ---- A page's words: its tables, and lookups in its language. opts: { lang: () => code, say: (level, text) }.
  // Each problem is said once (per key, or per key and language), and counted for report().
  function createWords(opts) {
    var lang = opts.lang, say = opts.say || function () {};
    var rows = { window: {}, board: {} }, said = {}, missing = [], fallback = [];
    var once = function (id, level, text) { if (!said[id]) { said[id] = true; say(level, text); } };
    var note = function (list, key) { if (list.indexOf(key) < 0) list.push(key); };
    function add(table) {
      if (!table || typeof table !== 'object' || Array.isArray(table)) { say('error', '21Board: words() takes a table: { window, board }.'); return; }
      var need = [];
      ['window', 'board'].forEach(function (sec) {
        var src = table[sec];
        if (!src || typeof src !== 'object') return;
        Object.keys(src).forEach(function (key) {
          var row = src[key];
          if (/^b21\./.test(key)) { once('common ' + key, 'warn', '21Board: "' + key + '" is a common word. Use it without a row.'); return; }
          if (!row || typeof row !== 'object') return;
          delete rows[sec === 'window' ? 'board' : 'window'][key];
          rows[sec][key] = row;
          var lacking = sec === 'window' ? LANGS.filter(function (l) { return blank(row[l]); }) : [];
          if (lacking.length) need.push(key + ': ' + andList(lacking.map(function (l) { return IN_ENGLISH[l]; })) + '.');
        });
      });
      if (need.length) say('warn', '21Board: ' + need.length + (need.length === 1 ? ' row needs' : ' rows need') + ' more languages. ' + need.join(' '));
    }
    function find(key) {
      if (hasOwn(COMMON_WORDS.window, key)) return { row: COMMON_WORDS.window[key], board: false };
      if (hasOwn(rows.window, key)) return { row: rows.window[key], board: false };
      if (hasOwn(rows.board, key)) return { row: rows.board[key], board: true };
      return null;
    }
    // The row's form for n, in its language: a missing form uses other, then English (Spanish many uses other, as usual).
    function form(key, row, value, l, n) {
      if (!value || typeof value !== 'object') return value;
      var cat = n == null ? 'other' : pluralOf(n, LOCALES[l]);
      if (!blank(value[cat])) return value[cat];
      if (!blank(value.other)) {
        if (!(l === 'es' && cat === 'many')) {
          note(fallback, key);
          once('form ' + l + ' ' + key, 'warn', '21Board: "' + key + '" in ' + IN_ENGLISH[l] + ' has no ' + cat + ' form, so it shows the other form.');
        }
        return value.other;
      }
      if (l === 'en') return null;
      note(fallback, key);
      once('lang ' + l + ' ' + key, 'warn', '21Board: "' + key + '" has no ' + IN_ENGLISH[l] + ', so it shows in English.');
      return form(key, row, row.en, 'en', n);
    }
    function text(key, vars, ui) {
      key = String(key);
      var hit = find(key), n = vars != null && typeof vars === 'object' ? vars.n : undefined;
      var l = ui || (hit && hit.board) ? 'en' : lang(), value;
      if (hit && l === PSEUDO) {
        value = pseudo(hit.row);
        if (typeof value === 'object') value = value[n == null ? 'other' : pluralOf(n, LOCALES.qps)];
      } else if (hit) {
        value = hit.row[l];
        if (blank(value) && l !== 'en') {
          note(fallback, key);
          once('lang ' + l + ' ' + key, 'warn', '21Board: "' + key + '" has no ' + IN_ENGLISH[l] + ', so it shows in English.');
          value = hit.row.en; l = 'en';
        }
        value = form(key, hit.row, value, l, n);
      }
      if (blank(value) || typeof value !== 'string') {
        note(missing, key);
        once('missing ' + key, 'error', '21Board: no words for "' + key + '". Add it to the words table.');
        return key;
      }
      var r = fill(value, vars);
      if (r.unfilled.length) once('fill ' + key, 'error', '21Board: "' + key + '" needs a value for ' + andList(r.unfilled.map(function (p) { return '{' + p + '}'; })) + '.');
      return r.text;
    }
    return {
      add: add,
      t: function (key, vars) { return text(key, vars, false); },
      ui: function (key, vars) { return text(key, vars, true); },
      report: function () { return { missing: missing.slice(), fallback: fallback.slice() }; }
    };
  }

  var Words = {
    LANGS: LANGS, PSEUDO: PSEUDO, LOCALES: LOCALES, NAMES: NAMES, IN_ENGLISH: IN_ENGLISH, FORMS: FORMS, OPTIONAL_FORMS: OPTIONAL_FORMS,
    KEY_RE: KEY_RE, COMMON_WORDS: COMMON_WORDS, LANG_FONT: LANG_FONT, FACE_SCRIPTS: FACE_SCRIPTS, LANG_SCRIPT: LANG_SCRIPT,
    isCode: isCode, langFromName: langFromName, langFromHash: langFromHash, confirm: confirmLang,
    htmlLang: function (lang) { return lang === PSEUDO ? 'en-XA' : LOCALES[lang] || 'en-US'; },
    placeholders: placeholders, fill: fill, plural: pluralOf, pseudo: pseudo, auditText: auditText, fontFor: fontFor, andList: andList,
    format: format, create: createWords
  };
  // #endregion Words

  // ------------------------------------------------------------ the window's language
  // Known before any widget script runs, so Board21.t() is right from the start: inside 21Board from the frame's name
  // (the board names it 'b21-board:<window>;<language>' before it loads), on its own from #b21-lang=… in the address.
  // The dev window's own page has none: the widget's frame inside it decides.
  var language = role === 'board' ? Words.langFromName(window.name) : role === 'bare' ? Words.langFromHash(location.hash) : 'en';
  var boardLocale = null;   // context.locale, once the board has sent context.language
  var book = Words.create({ lang: function () { return language; }, say: function (level, text) { console[level](text); } });
  function currentLocale() { return boardLocale || Words.LOCALES[language]; }
  // <html lang> for screen readers' voices, and translate="no": 21Board has its own languages, and a browser's page
  // translation would send a window's words, names included, away.
  function markLanguage() {
    var root = document.documentElement;
    root.lang = Words.htmlLang(language);
    root.setAttribute('translate', 'no');
  }
  // data-t="key" → the element's text; data-t-aria-label="key" (and -title, -placeholder, -alt, -aria-description) → that
  // attribute. Each from Board21.t().
  var DATA_T = [['data-t', ''], ['data-t-aria-label', 'aria-label'], ['data-t-title', 'title'], ['data-t-placeholder', 'placeholder'], ['data-t-alt', 'alt'], ['data-t-aria-description', 'aria-description']];
  var DATA_T_SEL = DATA_T.map(function (d) { return '[' + d[0] + ']'; }).join(',');
  function applyWords(root) {
    root = root || document;
    if (!root.querySelectorAll) return;
    var els = Array.prototype.slice.call(root.querySelectorAll(DATA_T_SEL));
    if (root.nodeType === 1 && root.matches && root.matches(DATA_T_SEL)) els.unshift(root);
    els.forEach(function (el) {
      DATA_T.forEach(function (d) {
        var key = el.getAttribute(d[0]);
        if (!key) return;
        var text = book.t(key);
        if (d[1]) el.setAttribute(d[1], text); else el.textContent = text;
      });
    });
  }
  // The board's language for the window, when it sends one (from Phase 1b), at init. Older boards send none: the
  // context then gets the window's own.
  function takeLanguage(ctx) {
    if (Words.isCode(ctx.language)) {
      var was = language;
      language = Words.confirm(ctx.language, language);
      boardLocale = ctx.locale ? String(ctx.locale) : null;
      if (language !== was) { markLanguage(); if (document.readyState !== 'loading') applyWords(document); }
    } else ctx.language = language;
    if (ctx.uiLanguage == null) ctx.uiLanguage = 'en';
    if (ctx.uiLocale == null) ctx.uiLocale = 'en-US';
  }
  // For the pseudo language's check (tests): the English a page still shows, and what doesn't fit its box or the window.
  // It skips <title>, scripts, styles, inputs, text boxes, translate="no" below <html>, hidden elements, and the SDK's own
  // standalone menu and note (data-b21-chrome).
  function audit() {
    var missed = [], cut = [], W = window.innerWidth, H = window.innerHeight, ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
    var name = function (el, text) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (text ? ' "' + text.slice(0, 40) + '"' : ''); };
    (function walk(el) {
      if (/^(SCRIPT|STYLE|TITLE|TEMPLATE|NOSCRIPT|INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable || el.hasAttribute('data-b21-chrome') ||
        (el !== document.documentElement && el.getAttribute('translate') === 'no')) return;
      var cs = getComputedStyle(el);
      if (cs.display === 'none') return;
      var own = '';
      for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue;
      own = own.replace(/\s+/g, ' ').trim();
      if (cs.visibility !== 'hidden' && el.getClientRects().length) {
        if (own && Words.auditText(own).length) missed.push(own);
        ATTRS.forEach(function (a) { var v = el.getAttribute(a); if (v && Words.auditText(v).length) missed.push(a + ': ' + v); });
        if (own || DATA_T.some(function (d) { return el.hasAttribute(d[0]); })) {
          var r = el.getBoundingClientRect(), why = [];
          if (el.scrollWidth > el.clientWidth + 1) why.push('wider than its box');
          if (el.scrollHeight > el.clientHeight + 1) why.push('taller than its box');
          if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) why.push('outside the window');
          if (why.length) cut.push(name(el, own) + ': ' + why.join(', '));
        }
      }
      for (var k = el.firstElementChild; k; k = k.nextElementSibling) walk(k);
    })(document.body || document.documentElement);
    return { missed: missed, cut: cut };
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
      locale: navigator.language || 'en-US', language: language, uiLanguage: 'en', uiLocale: 'en-US', devMode: true, host: 'standalone', timers: []
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
    console.info('21Board SDK: running on its own, outside 21Board. Data is kept in localStorage.');
    readyResolve(context);
    renderStandaloneMenu();
  }

  // A menu item (or a swatch or choice inside a row) by id.
  function findMenuItem(id) {
    for (var k = 0; k < menuItems.length; k++) {
      var i = menuItems[k], row = i.swatches || i.choices;
      if (row) { for (var j = 0; j < row.length; j++) if (row[j].id === id) return row[j]; }
      else if (!i.heading && !i.separator && i.id === id) return i;
    }
    return null;
  }

  // A tiny stand-in for the window menu, so custom menu items can be tested standalone.
  var standaloneMenuBtn = null;
  var CHAR = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g;   // one character (an emoji too)
  function renderStandaloneMenu() {
    if (!standalone || !document.body) return;
    if (!menuItems.length) { if (standaloneMenuBtn) { standaloneMenuBtn.remove(); standaloneMenuBtn = null; } return; }
    if (!standaloneMenuBtn) {
      standaloneMenuBtn = document.createElement('select');
      standaloneMenuBtn.setAttribute('data-b21-chrome', '');
      standaloneMenuBtn.title = 'Window menu items';
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
    // As in the board: at most 24 items, 12 swatches or choices per row, and 3 characters of a choice's label.
    standaloneMenuBtn.innerHTML = '<option value="">Menu \u25be</option>' + menuItems.slice(0, 24).map(function (i) {
      if (i.separator) return '<option disabled>\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</option>';
      if (i.heading) return '<option disabled>\u2014 ' + String(i.label).replace(/</g, '&lt;') + ' \u2014</option>';
      if (i.swatches) return i.swatches.slice(0, 12).map(function (s) { return opt(s.id, i.label + ': ' + s.label, s.checked); }).join('');
      if (i.choices) return i.choices.slice(0, 12).map(function (c) { return opt(c.id, i.label + ': ' + (c.label.match(CHAR) || []).slice(0, 3).join(''), c.checked); }).join('');
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
        takeLanguage(context);
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
      // A picture pasted or dropped on the board, sent to the Picture window the board opened for it. (Held until the
      // widget listens: it may come before the widget's own script has run.)
      case 'file': {
        if (!m.file || typeof m.file.arrayBuffer !== 'function') break;
        var f = [m.file, { reason: m.reason === 'paste' ? 'paste' : 'drop' }];
        if ((listeners.file || []).length) emit('file', f[0], f[1]); else heldFiles.push(f);
        break;
      }
      // The Timers and 21Timer on the page, for the built-in Traffic Light and Clock: [{ id, endsAt, remaining, warnMs }].
      case 'timers':
        if (context) context.timers = m.timers;
        emit('timers', clone(m.timers));
        break;
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
      ? 'To try this widget in a 21Board window, make the SDK the first script in <head>.'
      : started === 'not-loadable' ? 'To try this widget in a 21Board window, load the SDK with a plain <script src="\u2026/sdk/board21.js">. No async, defer, or module.' : '';
  } else if (role === 'bare' && window.__board21DevNote !== undefined) {
    devNote = window.__board21DevNote ? 'The 21Board dev window could not start: ' + window.__board21DevNote : '';
  }
  // (Only now: the dev window copies <html>'s attributes as they were. On its own after all, the address decides.)
  if (role === 'bare') language = Words.langFromHash(location.hash);
  markLanguage();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { applyWords(document); }); else applyWords(document);
  // A small note at the top of a standalone page saying why it isn't in a 21Board window.
  function showDevNote() {
    if (!document.body || !devNote) return;
    var bar = document.createElement('div');
    bar.setAttribute('data-b21-note', '');
    bar.setAttribute('data-b21-chrome', '');
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
    // No browser menu on a right-click or a long press, as on the board. Links and text boxes keep it, even inside a web
    // component. So does Developer mode, for Inspect. A widget can still listen for 'contextmenu' to show a menu of its
    // own.
    document.addEventListener('contextmenu', function (e) {
      var path = e.composedPath ? e.composedPath() : [e.target], t = path[0];
      if ((context && context.devMode) || (t && t.nodeType === 1 && (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|url|email|tel|number|password)$/.test(t.type)))) || path.some(function (n) { return n.nodeType === 1 && n.matches('a[href]'); })) return;
      e.preventDefault();
    });
    // A paste or a drop of files that the widget didn't take (preventDefault() on the document or an element) goes to the
    // board, which opens the pictures in new Picture windows. So does a paste of one link (no spaces): the board opens a
    // Video Player for a video's. A paste in a text field is the field's. A dropped file never opens in place of the
    // widget.
    var filesOf = function (dt) { var out = []; for (var i = 0; dt && dt.files && i < dt.files.length && i < 100; i++) out.push(dt.files[i]); return out; };   // (the board opens 10 and asks for the rest again)
    var hasFiles = function (dt) { return !!dt && Array.prototype.indexOf.call(dt.types || [], 'Files') >= 0; };
    var typing = function (el) { return !!el && el.nodeType === 1 && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); };
    window.addEventListener('paste', function (e) {
      if (e.defaultPrevented || typing(e.target) || typing(document.activeElement)) return;
      var files = filesOf(e.clipboardData), text = files.length || !e.clipboardData ? '' : String(e.clipboardData.getData('text/plain') || '').trim();
      if (files.length) post('paste', { files: files });
      else if (text && text.length <= 2000 && !/\s/.test(text)) post('paste', { files: [], text: text });
    });
    window.addEventListener('dragover', function (e) { if (!e.defaultPrevented && hasFiles(e.dataTransfer)) e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      if (e.defaultPrevented || !hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      var files = filesOf(e.dataTransfer);
      if (files.length) post('drop', { files: files });
    });
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

    /** Subscribe: 'data', 'config', 'theme', 'resize', 'focus', 'blur', 'menu', 'beforeclose', 'file' (the Picture widget's), 'timers' (the Traffic Light's and the Clock's). Returns an unsubscribe function. */
    on: function (event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      if (event === 'file' && heldFiles.length) {
        var held = heldFiles.splice(0);
        setTimeout(function () { held.forEach(function (f) { emit('file', f[0], f[1]); }); }, 0);
      }
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
       *          | { label, swatches: [{ id, label, color: '#hex', background?: '#hex', checked?: bool }] }  (a row of colors)
       *          | { label, choices: [{ id, label, checked?: bool }] }]  (a row of short choices, such as numbers: up to 12,
       *            each label up to 3 characters) */
      set: function (items) {
        menuItems = (items || []).map(function (i) {
          i = i || {};
          if (i.heading) return { heading: true, label: String(i.label || '') };
          if (Array.isArray(i.swatches)) return { id: String(i.id || ''), label: String(i.label || ''), swatches: i.swatches.map(function (s) {
            return { id: String(s.id || ''), label: String(s.label || ''), color: String(s.color || ''), background: s.background ? String(s.background) : undefined, checked: !!s.checked };
          }) };
          if (Array.isArray(i.choices)) return { id: String(i.id || ''), label: String(i.label || ''), choices: i.choices.map(function (c) {
            c = c || {};
            return { id: String(c.id || ''), label: String(c.label == null ? '' : c.label), checked: !!c.checked };
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
    },

    // ---- Words: your table, in English, Spanish, Russian, and Ukrainian (docs/WIDGET-SDK.md, "Languages").
    /** Adds your words table: { window, board, dynamic }. Call it before you show any words. */
    words: function (table) { book.add(table); },
    /** The words for key in the window's language. vars: { n } for a plural, and any {name} in the text. */
    t: function (key, vars) { return book.t(key, vars); },
    /** The words for key in English, the board's own language: menu rows, the title bar, and toasts. */
    ui: function (key, vars) { return book.ui(key, vars); },
    /** Puts data-t words in root, or the whole page: for markup added after the page loaded. */
    applyWords: function (root) { applyWords(root || document); },
    /** Dates in the window's language, and numbers always in English form. */
    format: {
      date: function (date, options, locale) { return Words.format.date(date, options, locale || currentLocale()); },
      number: function (n, options) { return Words.format.number(n, options); },
      list: function (items, type) { return Words.format.list(items, type, currentLocale()); },
      plural: function (n, locale) { return Words.format.plural(n, locale || currentLocale()); },
      capital: function (text, locale) { return Words.format.capital(text, locale || currentLocale()); }
    },
    /** The window's language: 'en', 'es', 'ru', or 'uk' ('qps', the pseudo language, for developers). */
    get language() { return language; },
    /** The locale for dates, such as 'es-US'. */
    get locale() { return currentLocale(); },
    /** The board's own language and locale. */
    get uiLanguage() { return 'en'; },
    get uiLocale() { return 'en-US'; },
    languages: Object.freeze(LANGS.slice()),
    languageNames: Object.freeze(JSON.parse(JSON.stringify(NAMES)))
  };

  Object.defineProperty(Board21, 'page', { value: document.documentElement });
  // For tests: the keys this page looked up with no row or no words in its language, and the pseudo language's check.
  Object.defineProperty(Board21, '__words', { value: function () { return book.report(); } });
  Object.defineProperty(Board21, '__audit', { value: audit });
  window.Board21 = Board21;
})();
