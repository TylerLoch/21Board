/*
 * 21Board widget dev window
 * =========================
 * Loaded by sdk/board21.js when a widget runs anywhere but inside 21Board: its own file, a local server, or
 * an AI tool's preview (Gemini Canvas, a Claude artifact, CodePen…). Also used by sdk/lab.html (paste a
 * widget and try it).
 *
 * It runs the REAL board, not a look-alike: a frame holds index.html's markup and board.js in widget test
 * mode (sdk/dev/board-shell.js, built by tools/build-sdk.js), laid out as a real screen (1920 × 1080 by
 * default) and scaled into the preview with one CSS transform, the "camera". The widget opens in an
 * ordinary window, so its title bar, resize handles, menu, Fill/Reset/Close, Settings (theme, accent, size)
 * and saving all behave as on the smartboard. The test board's data is kept apart from real boards.
 *
 * Toolbar: View (Window: the camera follows the focused window and its menu; Board: the whole screen),
 * Screen size, Theme, Size of windows and menus, Data (content/config JSON: edit, send as a change from
 * another tab, clear), Events (every SDK message), Checks (common problems, each with a fix request to paste
 * back to the AI), ⋯ (reload, show on its own, copy for 21Board).
 *
 * The widget's errors are repeated in this page's console as "[widget] …", so an AI tool's own error panel
 * sees them. Messages a widget posts for the AI tool (not for 21Board) are passed up and their answers back.
 *
 * See docs/WIDGET-SDK.md, "Testing a widget". No dependencies.
 */
(function () {
  'use strict';
  if (window.Board21Dev) return;

  var VERSION = '1.0.0';
  var SCREENS = [
    { id: 'smartboard', label: 'Smartboard', size: '1920 × 1080', w: 1920, h: 1080 },
    { id: 'laptop', label: 'Laptop', size: '1366 × 768', w: 1366, h: 768 },
    { id: 'chromebook', label: 'Chromebook', size: '1280 × 800', w: 1280, h: 800 },
    { id: 'tablet', label: 'Tablet', size: '1024 × 768', w: 1024, h: 768 },
    { id: 'pane', label: 'Fit this pane', size: 'the preview’s own size', w: 0, h: 0 }
  ];
  var ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var SDK_TAG_RE = /(<script\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*?)board21(?:\.min)?\.js((?:[?#][^"']*)?)\2/i;
  var MAX_ZOOM = 2.5;

  var CSS = [
    ':host { all: initial; position: fixed; inset: 0; z-index: 2147483000; display: block; font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e5e7eb; background: #23272e; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'button, select, textarea, input { font: inherit; color: inherit; }',
    'button { cursor: pointer; }',
    '.bar { position: absolute; left: 0; right: 0; top: 0; height: 40px; display: flex; align-items: center; gap: 6px; padding: 0 8px; background: #111418; border-bottom: 1px solid #000; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; white-space: nowrap; }',
    '.bar::-webkit-scrollbar { display: none; }',
    '.brand { display: flex; align-items: center; gap: 7px; font-weight: 700; padding-right: 4px; color: #fff; flex: 0 0 auto; }',
    '.brand i { font-style: normal; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: #2563eb; font-size: 11.5px; letter-spacing: -.02em; }',
    '.sep { width: 1px; height: 20px; background: #2d333b; flex: 0 0 auto; }',
    '.seg { display: inline-flex; background: #1d2228; border-radius: 8px; padding: 2px; flex: 0 0 auto; }',
    '.seg button, .tb { border: 0; background: none; height: 28px; padding: 0 9px; border-radius: 6px; color: #c9d1d9; flex: 0 0 auto; }',
    '.seg button[aria-pressed="true"] { background: #2f3742; color: #fff; }',
    '.tb:hover, .seg button:hover { background: #2a313a; color: #fff; }',
    '.tb[aria-pressed="true"] { background: #1f3a6b; color: #fff; }',
    '.tb .n { display: inline-block; min-width: 18px; height: 18px; margin-left: 5px; padding: 0 5px; border-radius: 9px; background: #374151; font-size: 11px; line-height: 18px; text-align: center; }',
    '.tb .n.err { background: #b91c1c; color: #fff; }',
    '.tb .n.warn { background: #a16207; color: #fff; }',
    'select { height: 28px; border-radius: 6px; border: 0; background: #1d2228; padding: 0 6px; flex: 0 0 auto; }',
    '.size { display: inline-flex; align-items: center; gap: 2px; flex: 0 0 auto; }',
    '.size output { min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; }',
    '.grow { flex: 1 1 auto; }',
    '.stage { position: absolute; left: 0; right: 0; top: 40px; bottom: 26px; overflow: hidden; background: #2b3038; background-image: radial-gradient(#363c46 1px, transparent 1.2px); background-size: 18px 18px; }',
    '.board { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; background: #f3f4f6; box-shadow: 0 0 0 1px rgba(0,0,0,.5), 0 10px 40px rgba(0,0,0,.35); }',
    '.stage.anim .board { transition: transform .28s cubic-bezier(.2,.8,.2,1); }',

    '.foot { position: absolute; left: 0; right: 0; bottom: 0; height: 26px; display: flex; align-items: center; gap: 10px; padding: 0 10px; background: #111418; color: #9aa4af; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.foot b { color: #e5e7eb; font-weight: 600; }',
    '.foot .chip { padding: 1px 7px; border-radius: 9px; background: #1f2937; }',
    '.foot .chip.mem { background: #3b2f0b; color: #fcd34d; }',
    '.drawer { position: absolute; top: 40px; right: 0; bottom: 26px; width: 100%; display: flex; flex-direction: column; background: #161a1f; border-left: 1px solid #000; box-shadow: -10px 0 30px rgba(0,0,0,.3); }',
    '.drawer[hidden] { display: none; }',
    '.dhead { display: flex; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid #262c33; }',
    '.dhead h2 { margin: 0 0 0 4px; font-size: 14px; flex: 1; color: #fff; }',
    '.dbody { flex: 1; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }',
    '.dbody label { font-weight: 600; color: #fff; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }',
    '.dbody label small { font-weight: 400; color: #9aa4af; }',
    'textarea { width: 100%; min-height: 120px; resize: vertical; border-radius: 8px; border: 1px solid #2d333b; background: #0d1014; padding: 8px; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #e5e7eb; }',
    'textarea.bad { border-color: #dc2626; }',
    '.row { display: flex; gap: 6px; flex-wrap: wrap; }',
    '.btn { border: 0; height: 30px; padding: 0 11px; border-radius: 7px; background: #2a313a; color: #fff; }',
    '.btn:hover { background: #343c47; }',
    '.btn.primary { background: #2563eb; } .btn.primary:hover { background: #1d4ed8; }',
    '.btn.danger { background: #7f1d1d; } .btn.danger:hover { background: #991b1b; }',
    '.muted { color: #9aa4af; }',
    '.ev { font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; display: flex; flex-direction: column; gap: 2px; }',
    '.ev div { padding: 3px 6px; border-radius: 5px; background: #1b2026; white-space: pre-wrap; word-break: break-word; cursor: pointer; }',
    '.ev div.err { background: #3b1414; color: #fecaca; } .ev div.warn { background: #33280b; color: #fde68a; }',
    '.ev div .d { color: #7dd3fc; } .ev div .d.out { color: #86efac; }',
    '.ev div .j { display: none; color: #9aa4af; margin-top: 3px; } .ev div.open .j { display: block; }',
    '.chk { border-radius: 8px; background: #1b2026; padding: 9px 10px; display: flex; flex-direction: column; gap: 6px; }',
    '.chk b { color: #fff; } .chk.warn { box-shadow: inset 3px 0 0 #d97706; } .chk.err { box-shadow: inset 3px 0 0 #dc2626; } .chk.ok { box-shadow: inset 3px 0 0 #16a34a; } .chk.info { box-shadow: inset 3px 0 0 #3b82f6; }',
    '.pop { position: absolute; top: 40px; right: 6px; min-width: 240px; padding: 5px; border-radius: 10px; background: #1d2228; border: 1px solid #000; box-shadow: 0 10px 30px rgba(0,0,0,.4); display: flex; flex-direction: column; }',
    '.pop[hidden] { display: none; }',
    '.pop button { text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 6px; color: #e5e7eb; }',
    '.pop button:hover { background: #2a313a; }',
    '.pop hr { border: 0; border-top: 1px solid #2d333b; margin: 4px 6px; }',
    '.copybox { display: flex; flex-direction: column; gap: 6px; }',
    '.copybox[hidden] { display: none; }',
    '.help p { margin: 0 0 8px; } .help code { font-family: ui-monospace, monospace; background: #0d1014; padding: 1px 4px; border-radius: 4px; }',
    '.barewrap { position: absolute; inset: 0; display: flex; flex-direction: column; background: #23272e; }',
    '.barewrap[hidden] { display: none; }',
    '.barewrap .bar { position: relative; }',
    '.barewrap iframe { flex: 1; width: 100%; border: 0; background: #fff; }',
    '@media (max-width: 1000px) { .wide { display: none; } }',
    '@media (min-width: 700px) { .stage.beside { right: min(420px, 50%); } .drawer { width: min(420px, 50%); } }'   /* the board makes room for the panel */
  ].join('\n');

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64); }
  function pretty(v) { return v == null ? '' : JSON.stringify(v, null, 2); }

  // The widget's details: its manifest block, else (for a widget in this repo) its registry entry, else defaults.
  function widgetInfo(src, hostUrl, base) {
    var doc = new DOMParser().parseFromString(src, 'text/html');
    var notes = [];
    var man = null, el = doc.getElementById('board21-widget');
    if (el) { try { man = JSON.parse(el.textContent); } catch (e) { notes.push({ level: 'err', title: 'The manifest block isn’t valid JSON', detail: e.message, fix: 'Fix the JSON inside <script type="application/json" id="board21-widget">.' }); } }
    var title = (doc.querySelector('title') || {}).textContent || '';
    return {
      doc: doc, notes: notes, manifest: man,
      fallback: function (reg) {
        var m = man || {};
        var path = /\/widgets\/([a-z0-9][a-z0-9-]*)\/[^/]*$/.exec(String(hostUrl || '').replace(/[?#].*$/, ''));
        var r = null;
        if (!man && path && Array.isArray(reg)) r = reg.filter(function (x) { return x && x.id === path[1]; })[0] || null;
        var id = ID_RE.test(m.id || '') ? m.id : r ? r.id : slug(m.name || title) || 'my-widget';
        if (!ID_RE.test(id)) id = 'my-widget';
        return {
          id: id, name: String(m.name || (r && r.name) || title || 'My widget').slice(0, 60),
          version: String(m.version || (r && r.version) || ''), description: String(m.description || (r && r.description) || ''),
          color: m.color || (r && r.color) || '#2563eb', icon: m.icon || (r && r.icon) || undefined,
          permissions: m.permissions || (r && r.permissions) || [],
          window: m.window || (r && r.window) || { width: 400, height: 300 },
          fromRegistry: !!r
        };
      }
    };
  }

  // The widget's page with its SDK tag pointing at this SDK (pasted code may use a path that only works in
  // the 21Board folder), or with one added if it has none.
  function withSdk(src, sdkUrl) {
    if (SDK_TAG_RE.test(src)) return { src: src.replace(SDK_TAG_RE, function (all, a, q, path, rest) { return a + q + sdkUrl + q; }), added: false };
    var tag = '<script src="' + sdkUrl + '"></script>';
    if (/<head[^>]*>/i.test(src)) return { src: src.replace(/<head[^>]*>/i, function (h) { return h + tag; }), added: true };
    return { src: tag + src, added: true };
  }

  function loadRegistry(base) {
    return new Promise(function (resolve) {
      if (window.BOARD21_WIDGETS) { resolve(window.BOARD21_WIDGETS); return; }
      var s = document.createElement('script');
      var t = setTimeout(function () { resolve(null); }, 3000);
      s.src = base + 'widgets/registry.js';
      s.onload = function () { clearTimeout(t); resolve(window.BOARD21_WIDGETS || null); };
      s.onerror = function () { clearTimeout(t); resolve(null); };
      document.head.appendChild(s);
    });
  }

  // ---------------------------------------------------------------------- checks
  function lint(src, info, sdkUrl, lastMenu) {
    var out = info.notes.slice();
    var doc = info.doc;
    var code = Array.prototype.map.call(doc.querySelectorAll('script:not([src])'), function (s) { return s.type === 'application/json' ? '' : s.textContent; }).join('\n');
    var add = function (level, title, detail, fix) { out.push({ level: level, title: title, detail: detail || '', fix: fix || '' }); };
    if (!info.manifest) add(info.widget.fromRegistry ? 'info' : 'warn', 'No manifest block', 'The dev window guessed the window size and name' + (info.widget.fromRegistry ? ' (from widgets/registry.js)' : '') + '.',
      'Add near the top of <head>: <script type="application/json" id="board21-widget">{"id": "' + info.widget.id + '", "name": "' + info.widget.name + '", "version": "1.0.0", "window": {"width": 400, "height": 300, "minWidth": 200, "minHeight": 150}}</script>');
    else if (!ID_RE.test(info.manifest.id || '')) add('warn', 'The manifest has no valid "id"', 'An id is lowercase letters, digits and dashes, e.g. "seating-chart".', 'Set "id" in the board21-widget manifest block to a short lowercase name with dashes.');
    var scripts = doc.querySelectorAll('script[src]');
    var sdkFirst = false;
    for (var i = 0; i < doc.scripts.length; i++) { var s = doc.scripts[i]; if (s.type === 'application/json') continue; sdkFirst = !!(s.src && /board21(\.min)?\.js/.test(s.getAttribute('src'))); break; }
    if (!info.sdkFound) add('err', 'The 21Board SDK isn’t loaded', 'The dev window added it for this test.', 'Add <script src="' + sdkUrl + '"></script> as the first script in <head>, before any other script.');
    else if (!sdkFirst) add('warn', 'The SDK isn’t the first script', 'Scripts before it run before the dev window starts (and run twice).', 'Move the 21Board SDK <script> tag so it is the first script in <head>.');
    var hosts = {};
    Array.prototype.forEach.call(doc.querySelectorAll('[src], link[href]'), function (n) {
      var u = n.getAttribute('src') || n.getAttribute('href') || '';
      if (/^(https?:)?\/\//i.test(u) && !/board21(\.min)?\.js/.test(u)) hosts[u.replace(/^(https?:)?\/\//i, '').split('/')[0]] = 1;
    });
    (code.match(/https?:\/\/[^\s'")]+/g) || []).forEach(function (u) { if (!/board21/.test(u)) hosts[u.replace(/^https?:\/\//, '').split('/')[0]] = 1; });
    var hl = Object.keys(hosts);
    if (hl.length) add('warn', 'Loads files from the internet: ' + hl.join(', '), '21Board works offline on the smartboard, so a widget must bring everything it needs (no CDN libraries, web fonts or placeholder images).',
      'Remove every external file (' + hl.join(', ') + '). Write the CSS yourself instead of a CSS framework, use system fonts, and draw images with inline SVG.');
    if (/\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.test(code)) add('warn', 'Stores data itself', 'Saving with localStorage, sessionStorage, IndexedDB or cookies skips 21Board: no sync between tabs, no backups, and data is shared by every window of the widget.',
      'Replace localStorage/sessionStorage/IndexedDB with Board21.save(data) and Board21.saveConfig(config); load with const ctx = await Board21.ready() and ctx.data / ctx.config.');
    if (/\b(alert|confirm|prompt)\s*\(/.test(code)) add('warn', 'Uses alert(), confirm() or prompt()', 'These block the whole board, and AI previews often block them.', 'Replace alert/confirm/prompt with a small message or confirmation shown inside the widget.');
    if (doc.querySelector('[autofocus]')) add('info', 'Has autofocus', 'Opening the widget would steal the keyboard from whatever the teacher is using.', 'Remove the autofocus attribute.');
    if (/type=["']text\/babel["']|\bimport\s+React\b|from\s+["']react["']/.test(src)) add('err', 'Uses React/JSX', 'Widgets are one plain HTML file with no build step.', 'Rewrite as a single HTML file with plain JavaScript (no React, JSX or build step).');
    if (code && !/Board21\.(ready|load)\b/.test(code)) add('warn', 'Never calls Board21.ready()', 'The widget can’t get its saved data, theme or size without it.', 'Start the widget with const ctx = await Board21.ready(); then render ctx.data.');
    if (/Board21\.save\s*\(/.test(code) && !/on\(\s*["']data["']/.test(code)) add('info', 'Doesn’t listen for "data"', 'If the board is open in two tabs, or a backup is imported, this widget keeps showing old content.', 'Add Board21.on("data", data => render(data)) so changes made elsewhere show up.');
    if (lastMenu) {
      var items = lastMenu.items || [];
      if (items.length > 24) add('warn', 'The menu has ' + items.length + ' items', 'The board shows the first 24.', 'Keep the window menu to 24 items or fewer.');
      items.forEach(function (it) {
        if (!it) return;
        if (!it.heading && !it.separator && !it.swatches && !it.id) add('warn', 'A menu item has no id: “' + (it.label || '') + '”', '', 'Give every menu item a unique id.');
        if (Array.isArray(it.swatches)) {
          if (it.swatches.length > 12) add('warn', 'The “' + it.label + '” swatch row has ' + it.swatches.length + ' colors', 'The board shows the first 12.', 'Use at most 12 swatches in a row.');
          it.swatches.forEach(function (sw) { if (sw && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(sw.color || '')) add('warn', 'Swatch “' + (sw.label || sw.id) + '” isn’t a #hex color (' + sw.color + ')', 'The board leaves it out.', 'Give every swatch a color like "#dc2626".'); });
        }
        if (it.icon && !/^\s*<svg/i.test(it.icon)) add('info', 'A menu icon isn’t an <svg>', 'The board drops icons that aren’t inline SVG.', 'Use an inline <svg> string for menu icons, or none.');
      });
    }
    if (!out.length) add('ok', 'No problems found', 'These checks look for common problems. Also try resizing the window and the theme.', '');
    return out;
  }

  // ---------------------------------------------------------------------- the dev window
  function start(opts) {
    opts = opts || {};
    var base = opts.base || '';
    var sdkUrl = opts.sdkUrl || base + 'sdk/board21.js';
    var fixed = withSdk(String(opts.src || ''), sdkUrl);
    var src = fixed.src;
    var info = widgetInfo(src, opts.hostUrl || location.href, base);
    info.sdkFound = !fixed.added;

    var mount = opts.mount || document.body;
    if (!opts.mount) {
      document.documentElement.style.cssText = 'height:100%;overflow:hidden;background:#23272e';
      document.body.style.cssText = 'margin:0;height:100%;overflow:hidden;background:#23272e';
    }
    var host = document.createElement('div');
    host.id = 'b21-dev';
    mount.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });

    var st = {
      screen: 'smartboard', view: 'window', theme: 'system', scale: 0.8, storage: '', board: null, lastView: null, fitKey: '',
      events: [], errors: 0, warns: 0, state: null, drawer: null, lastMenu: null, checks: [], ikey: null
    };
    try { var saved = JSON.parse(sessionStorage.getItem('21board-dev') || '{}'); if (saved.screen) st.screen = saved.screen; if (saved.view) st.view = saved.view; } catch (e) { /* blocked */ }
    var remember = function () { try { sessionStorage.setItem('21board-dev', JSON.stringify({ screen: st.screen, view: st.view })); } catch (e) { /* blocked */ } };

    root.innerHTML = '<style>' + CSS + '</style>' +
      '<div class="bar" role="toolbar" aria-label="21Board dev window">' +
        '<span class="brand" title="21Board widget dev window ' + VERSION + '"><i>21</i><span class="wide">Dev window</span></span><span class="sep"></span>' +
        '<span class="seg" role="group" aria-label="View"><button data-view="window" title="Follow the window">Window</button><button data-view="board" title="The whole screen">Board</button></span>' +
        '<select data-k="screen" aria-label="Screen" title="The screen the board is drawn on">' + SCREENS.map(function (s) { return '<option value="' + s.id + '" title="' + s.size + '">' + s.label + '</option>'; }).join('') + '</select>' +
        '<select data-k="theme" aria-label="Theme" title="Theme"><option value="system">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select>' +
        '<span class="size" title="Size of windows and menus"><button class="tb" data-act="smaller" aria-label="Smaller">−</button><output data-k="scale">80%</output><button class="tb" data-act="larger" aria-label="Larger">+</button></span>' +
        '<span class="sep"></span>' +
        '<button class="tb" data-drawer="data">Data</button>' +
        '<button class="tb" data-drawer="events">Events<span class="n" data-k="evn">0</span></button>' +
        '<button class="tb" data-drawer="checks">Checks<span class="n" data-k="chn">0</span></button>' +
        '<span class="grow"></span>' +
        (opts.onEdit ? '<button class="tb" data-act="edit">Edit code</button>' : '') +
        '<button class="tb" data-act="more" aria-label="More" title="More">⋯</button>' +
      '</div>' +
      '<div class="stage"><iframe class="board" title="21Board test board"></iframe></div>' +
      '<div class="foot" aria-live="polite"></div>' +
      '<div class="pop" hidden role="menu">' +
        '<button data-act="reload">Reload the widget</button>' +
        '<button data-act="reset">Reset the window (default size, no data)</button>' +
        '<button data-act="open2">Open another copy (instance 2)</button>' +
        '<button data-act="shape">Board shape: any shape / 16:9</button>' +
        '<hr>' +
        '<button data-act="bare">Show the widget on its own</button>' +
        '<button data-act="copy21">Copy for 21Board (HTML + registry entry)</button>' +
        '<button data-act="help">How this works</button>' +
      '</div>' +
      '<div class="barewrap" hidden><div class="bar"><span class="brand"><i>21</i></span><span class="muted">The widget on its own (standalone: data in this browser\u2019s storage, window calls ignored)</span><span class="grow"></span><button class="btn primary" data-act="unbare">Back to the window</button></div></div>' +
      '<aside class="drawer" hidden aria-label="Dev window panel"><div class="dhead"><h2></h2><button class="btn" data-act="close-drawer" aria-label="Close panel">✕</button></div><div class="dbody"></div></aside>';

    var $ = function (sel) { return root.querySelector(sel); };
    var stage = $('.stage'), frame = $('.board'), foot = $('.foot'), pop = $('.pop'), drawer = $('.drawer');

    // ---- the test board
    function labPage(widget) {
      var lab = { widget: widget, src: src };
      return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>21Board test board</title>' +
        '<script type="application/json" id="b21-lab">' + JSON.stringify(lab).replace(/</g, '\\u003c') + '</script>' +
        '<script src="' + esc(base + 'sdk/dev/board-shell.js') + '"></script>';
    }
    if (opts.sandbox) frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-downloads');
    frame.setAttribute('allow', 'fullscreen; clipboard-read; clipboard-write; autoplay');
    var send = function (cmd, args) { try { frame.contentWindow.postMessage({ b21lab: 1, cmd: cmd, args: args || {} }, '*'); } catch (e) { /* not ready */ } };

    var boot = info.manifest ? Promise.resolve(null) : loadRegistry(base);
    boot.then(function (reg) {
      info.widget = info.fallback(reg);
      frame.srcdoc = labPage(info.widget);
      runChecks();
      renderFoot();
    });

    // ---- the camera
    function screenSize() {
      var s = SCREENS.filter(function (x) { return x.id === st.screen; })[0] || SCREENS[0];
      var r = stage.getBoundingClientRect();
      return s.w ? { w: s.w, h: s.h, pane: false } : { w: Math.max(320, Math.round(r.width)), h: Math.max(240, Math.round(r.height)), pane: true };
    }
    var cam = { k: 1, tx: 0, ty: 0 };
    function place(animate) {
      var S = screenSize(), r = stage.getBoundingClientRect();
      frame.style.width = S.w + 'px'; frame.style.height = S.h + 'px';
      var k, tx, ty, v = st.lastView;
      if (S.pane) { k = 1; tx = 0; ty = 0; }
      else if (st.view === 'board' || !v || !v.win) {
        k = Math.min(r.width / S.w, r.height / S.h);
        tx = (r.width - S.w * k) / 2; ty = (r.height - S.h * k) / 2;
      } else {
        // The window and its open menu, with room for the resize handles around it.
        var a = v.win, x0 = a.x, y0 = a.y, x1 = a.x + a.w, y1 = a.y + a.h;
        if (v.menu) { x0 = Math.min(x0, v.menu.x); y0 = Math.min(y0, v.menu.y); x1 = Math.max(x1, v.menu.x + v.menu.w); y1 = Math.max(y1, v.menu.y + v.menu.h); }
        var pad = 36;
        k = Math.min(r.width / (x1 - x0 + 2 * pad), r.height / (y1 - y0 + 2 * pad), MAX_ZOOM);
        tx = r.width / 2 - (x0 + x1) / 2 * k; ty = r.height / 2 - (y0 + y1) / 2 * k;
      }
      stage.classList.toggle('anim', !!animate);
      cam = { k: k, tx: tx, ty: ty };
      frame.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + k.toFixed(4) + ')';
    }
    // Window view: follow the window when it changes size, gets focus, or its menu (or it) goes out of view.
    // Never while a window is being dragged.
    function maybeFollow() {
      var v = st.lastView;
      if (!v || v.active || st.view !== 'window') return;
      var key = v.win ? [v.info && v.info.ikey, v.win.w, v.win.h, v.info && v.info.maximized].join() : '';
      var r = stage.getBoundingClientRect();
      var out = function (b) { if (!b) return false; var x = cam.tx + b.x * cam.k, y = cam.ty + b.y * cam.k; return x < 0 || y < 0 || x + b.w * cam.k > r.width || y + b.h * cam.k > r.height; };
      if (key !== st.fitKey || out(v.win) || out(v.menu)) { st.fitKey = key; place(true); }
    }
    window.addEventListener('resize', function () { place(false); });

    // ---- messages from the test board (and relaying for the AI tool's preview)
    window.addEventListener('message', function (e) {
      var m = e.data;
      if (e.source === frame.contentWindow) {
        if (!m || m.b21lab !== 1) return;
        switch (m.type) {
          case 'ready': st.storage = m.storage; renderFoot(); break;
          case 'view': st.lastView = m; if (m.scale) { st.scale = m.scale; $('[data-k="scale"]').textContent = Math.round(m.scale * 100) + '%'; } maybeFollow(); renderFoot(); break;
          case 'state':
            st.state = m;
            if (m.settings && m.settings.theme) { st.theme = m.settings.theme; $('[data-k="theme"]').value = st.theme; }
            if (st.drawer === 'data') renderDrawer();
            break;
          case 'log':
            if (m.level) {
              (console[m.level === 'warn' ? 'warn' : 'error'])('[widget] ' + m.text);
              if (m.level === 'warn') st.warns++; else st.errors++;
              addEvent({ level: m.level === 'warn' ? 'warn' : 'err', text: m.text });
            } else {
              if (m.dir === 'in' && m.mtype === 'menu') { try { st.lastMenu = JSON.parse(m.json); runChecks(); } catch (err) { /* truncated */ } }
              addEvent({ dir: m.dir, type: m.mtype, summary: m.summary, json: m.json, ikey: m.ikey });
            }
            break;
          case 'relay': if (window.parent !== window) { try { window.parent.postMessage(m.data, '*'); } catch (err) { /* not cloneable */ } } break;
        }
        return;
      }
      // Messages from the page hosting this preview (e.g. an AI tool's answers): pass them down to the widget.
      if (window.parent !== window && e.source === window.parent && !(m && (m.b21lab || m.b21))) send('relay', { data: m });
    });

    // ---- events
    function addEvent(ev) {
      ev.t = new Date();
      st.events.push(ev);
      if (st.events.length > 500) st.events.shift();
      var n = $('[data-k="evn"]');
      n.textContent = st.errors ? st.errors : st.events.length > 99 ? '99+' : String(st.events.length);
      n.className = 'n' + (st.errors ? ' err' : st.warns ? ' warn' : '');
      n.title = st.errors ? st.errors + ' error' + (st.errors === 1 ? '' : 's') + ' from the widget' : '';
      if (st.drawer === 'events') appendEvent(ev);
    }
    function eventHTML(ev) {
      var time = ev.t.toTimeString().slice(0, 8);
      if (ev.level) return '<div class="' + ev.level + '">' + time + ' ' + esc(ev.text) + '</div>';
      return '<div>' + time + ' <span class="d' + (ev.dir === 'out' ? ' out' : '') + '">' + (ev.dir === 'out' ? 'board → widget' : 'widget → board') + '</span> <b>' + esc(ev.type) + '</b> ' + esc(ev.summary || '') +
        '<span class="j">' + esc(ev.json || '') + '</span></div>';
    }
    function appendEvent(ev) {
      var list = $('.ev');
      if (!list) return;
      if (ev.type === 'window' && $('[data-k="hidewin"]') && $('[data-k="hidewin"]').checked) return;
      var stick = list.parentNode.scrollTop + list.parentNode.clientHeight >= list.parentNode.scrollHeight - 30;
      list.insertAdjacentHTML('beforeend', eventHTML(ev));
      if (stick) list.parentNode.scrollTop = list.parentNode.scrollHeight;
    }

    // ---- checks
    function runChecks() {
      if (!info.widget) return;
      st.checks = lint(src, info, sdkUrl, st.lastMenu);
      var bad = st.checks.filter(function (c) { return c.level === 'err' || c.level === 'warn'; }).length;
      var n = $('[data-k="chn"]');
      n.textContent = String(bad);
      n.className = 'n' + (st.checks.some(function (c) { return c.level === 'err'; }) ? ' err' : bad ? ' warn' : '');
      if (st.drawer === 'checks') renderDrawer();
    }

    // ---- footer: what the window is right now
    function renderFoot() {
      var v = st.lastView, i = v && v.info, w = info.widget;
      var parts = [];
      if (w) parts.push('<b>' + esc(w.name) + '</b>');
      if (i) {
        parts.push('content ' + i.w + ' × ' + i.h + (i.maximized ? ' (fills the board)' : ''));
        if (i.ratio) parts.push('shape locked ' + (Math.round(i.ratio * 100) / 100) + ':1');
        parts.push('min ' + i.minW + ' × ' + i.minH + (i.maxW || i.maxH ? ' · max ' + (i.maxW || '∞') + ' × ' + (i.maxH || '∞') : ''));
        if (!i.resizable) parts.push('not resizable');
      }
      var scr = screenSize();
      parts.push('screen ' + scr.w + ' × ' + scr.h + ' · size ' + Math.round(st.scale * 100) + '%');
      var mem = st.storage === 'memory';
      parts.push('<span class="chip' + (mem ? ' mem' : '') + '" title="' + (mem ? 'This page blocks storage: saved data lasts until it reloads. Data ▸ Copy keeps it.' : 'A test board: kept in this browser, apart from real boards.') + '">' +
        (mem ? 'Test data lasts until this page reloads' : st.storage ? 'Test data, kept apart from real boards' : 'Starting…') + '</span>');
      foot.innerHTML = parts.join(' · ');
    }

    // ---- the side panel: Data, Events, Checks, Help
    function openDrawer(name) {
      st.drawer = st.drawer === name ? null : name;
      root.querySelectorAll('[data-drawer]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-drawer') === st.drawer)); });
      drawer.hidden = !st.drawer;
      stage.classList.toggle('beside', !!st.drawer);   // on a wide pane the board makes room for the panel
      st.fitKey = ''; place(false);
      if (st.drawer) { renderDrawer(); if (st.drawer === 'data') send('state'); }
    }
    function copyText(text, label) {
      var box = $('.copybox');
      var show = function () {
        if (!box) return;
        box.hidden = false;
        box.querySelector('textarea').value = text;
        box.querySelector('textarea').select();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { flash(label || 'Copied'); }, show);
      else show();
    }
    function flash(text) {
      var old = foot.innerHTML;
      foot.innerHTML = '<b>' + esc(text) + '</b>';
      setTimeout(function () { foot.innerHTML = old; renderFoot(); }, 1600);
    }
    var COPYBOX = '<div class="copybox" hidden><span class="muted">Copying isn’t allowed here: select it and copy (Ctrl+C / ⌘C).</span><textarea readonly></textarea></div>';
    function renderDrawer() {
      var h = $('.dhead h2'), b = $('.dbody');
      if (st.drawer === 'data') {
        h.textContent = 'Saved data';
        var s = st.state, insts = s ? s.instances.filter(function (i) { return i.open; }) : [];
        var cur = insts.filter(function (i) { return i.ikey === (st.ikey || s.focused); })[0] || insts[0];
        if (!cur) { b.innerHTML = '<p class="muted">No open window.</p>'; return; }
        st.ikey = cur.ikey;
        var focused = document.activeElement === host && root.activeElement && root.activeElement.tagName === 'TEXTAREA';
        if (focused) return;   // don't replace what's being typed
        b.innerHTML = (insts.length > 1 ? '<label>Window <select data-k="inst">' + insts.map(function (i) { return '<option value="' + esc(i.ikey) + '"' + (i.ikey === cur.ikey ? ' selected' : '') + '>' + esc(info.widget.name) + ' ' + i.n + '</option>'; }).join('') + '</select></label>' : '') +
          '<label>Content <small>Board21.save() · not in templates</small></label><textarea data-k="data" spellcheck="false">' + esc(pretty(cur.data)) + '</textarea>' +
          '<label>Config <small>Board21.saveConfig() · in templates</small></label><textarea data-k="config" spellcheck="false">' + esc(pretty(cur.config)) + '</textarea>' +
          '<div class="row"><button class="btn primary" data-act="apply" title="Sends it to the widget as if it changed in another tab">Send as a change from another tab</button></div>' +
          '<div class="row"><button class="btn" data-act="copy-data">Copy</button><button class="btn" data-act="reload">Reload the widget</button><button class="btn danger" data-act="clear">Clear saved data</button></div>' +
          '<p class="muted">' + (st.storage === 'memory' ? 'This page blocks storage, so this test data lasts until the page reloads. Copy it to keep it.' : 'Test data is kept in this browser, apart from real boards.') + '</p>' + COPYBOX;
      } else if (st.drawer === 'events') {
        h.textContent = 'Events';
        b.innerHTML = '<div class="row"><label style="font-weight:400"><span><input type="checkbox" data-k="hidewin"> Hide size changes</span></label><span class="grow"></span><button class="btn" data-act="copy-events">Copy</button><button class="btn" data-act="clear-events">Clear</button></div>' +
          '<p class="muted" style="margin:0">Every message between the widget and the board. Tap one for its details. Errors from the widget are red (they are also in the console as “[widget]”).</p>' +
          '<div class="ev"></div>' + COPYBOX;
        st.events.forEach(appendEvent);
        b.scrollTop = b.scrollHeight;
      } else if (st.drawer === 'checks') {
        h.textContent = 'Checks';
        b.innerHTML = '<p class="muted" style="margin:0">Common problems in this widget’s code. “Copy fix request” copies a sentence to paste back to the AI.</p>' +
          st.checks.map(function (c, i) {
            return '<div class="chk ' + c.level + '"><b>' + esc(c.title) + '</b>' + (c.detail ? '<span class="muted">' + esc(c.detail) + '</span>' : '') +
              (c.fix ? '<div class="row"><button class="btn" data-act="copy-fix" data-i="' + i + '">Copy fix request</button></div>' : '') + '</div>';
          }).join('') + COPYBOX;
      } else if (st.drawer === 'help') {
        h.textContent = 'How this works';
        b.innerHTML = '<div class="help">' +
          '<p>This is the real 21Board, running a test board with your widget in an ordinary window, drawn as if on a ' + esc((SCREENS.filter(function (x) { return x.id === st.screen; })[0] || SCREENS[0]).label.toLowerCase()) + ' and scaled to fit here.</p>' +
          '<p><b>Try it like a teacher:</b> drag the title bar, tap the window to show its resize handles and drag them, tap the name (⌄) for the menu, double-tap the title bar to fill the board. The ▦ buttons in the bottom corners open the Widget Picker (another copy) and Settings (theme, accent, size).</p>' +
          '<p><b>Saved data</b> is a test copy, kept apart from real boards. In AI previews it usually lasts until the preview reloads: use Data ▸ Copy to keep it.</p>' +
          '<p><b>Just the widget:</b> ⋯ ▸ Show the widget on its own, or add <code>#b21-bare</code> to the address.</p>' +
          '<p>The widget’s errors also appear in this page’s console as “[widget] …”. The SDK must be the first script in &lt;head&gt; for this window to appear.</p>' +
          '<p class="muted">21Board dev window ' + VERSION + '. Reference: docs/WIDGET-SDK.md.</p></div>';
      }
    }

    // ---- toolbar and panel actions
    function setView(v) {
      st.view = v; remember();
      root.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === v)); });
      st.fitKey = ''; place(true);
    }
    root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) { if (!pop.hidden && !e.target.closest('.pop')) pop.hidden = true; return; }
      if (t.hasAttribute('data-view')) { setView(t.getAttribute('data-view')); return; }
      if (t.hasAttribute('data-drawer')) { pop.hidden = true; openDrawer(t.getAttribute('data-drawer')); return; }
      var ev = t.closest('.ev > div');
      if (ev) { ev.classList.toggle('open'); return; }
      var act = t.getAttribute('data-act');
      if (act !== 'more') pop.hidden = true;
      switch (act) {
        case 'more': pop.hidden = !pop.hidden; break;
        case 'smaller': send('scale', { dir: -1 }); break;
        case 'larger': send('scale', { dir: 1 }); break;
        case 'reload': send('reload'); break;
        case 'reset': send('reset'); break;
        case 'clear': send('clear'); break;
        case 'open2': send('open'); break;
        case 'shape': send('shape', { value: st.lastView && st.lastView.shape === 'free' ? '16:9' : 'free' }); break;
        case 'close-drawer': openDrawer(st.drawer); break;
        case 'edit': if (opts.onEdit) opts.onEdit(); break;
        case 'help': openDrawer('help'); break;
        case 'bare': {   // in a fresh frame (rewriting this page would run the widget's code twice in one window)
          var wrap = $('.barewrap'), bf = document.createElement('iframe');
          bf.name = 'b21-bare';
          if (opts.sandbox) bf.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-downloads');
          bf.title = (info.widget && info.widget.name) || 'Widget';
          wrap.appendChild(bf);
          bf.srcdoc = src;
          wrap.hidden = false;
          break;
        }
        case 'unbare': { var w2 = $('.barewrap'); var old = w2.querySelector('iframe'); if (old) old.remove(); w2.hidden = true; send('reload'); break; }
        case 'apply': {
          var ok = true;
          ['data', 'config'].forEach(function (k) {
            var ta = $('[data-k="' + k + '"]'), txt = ta.value.trim();
            try { var v = txt ? JSON.parse(txt) : null; ta.classList.remove('bad'); send('setData', { ikey: st.ikey, kind: k, value: v }); } catch (err) { ok = false; ta.classList.add('bad'); }
          });
          flash(ok ? 'Sent to the widget' : 'That isn’t valid JSON');
          break;
        }
        case 'copy-data': {
          var cur = st.state && st.state.instances.filter(function (i) { return i.ikey === st.ikey; })[0];
          copyText(JSON.stringify({ data: cur ? cur.data : null, config: cur ? cur.config : null }, null, 2), 'Copied the data');
          break;
        }
        case 'copy-events': copyText(st.events.map(function (x) { return x.level ? '[' + x.level + '] ' + x.text : (x.dir === 'out' ? 'board→widget ' : 'widget→board ') + x.type + ' ' + (x.json || ''); }).join('\n'), 'Copied the events'); break;
        case 'clear-events': st.events = []; st.errors = st.warns = 0; addEvent({ level: 'warn', text: 'Cleared.' }); st.events = []; st.warns = 0; $('[data-k="evn"]').textContent = '0'; $('[data-k="evn"]').className = 'n'; renderDrawer(); break;
        case 'copy-fix': { var c = st.checks[+t.getAttribute('data-i')]; if (c) copyText('Please fix this in my 21Board widget: ' + c.title + '. ' + c.fix, 'Copied the fix request'); break; }
        case 'copy21': {
          var w = info.widget || {};
          var html = String(opts.src || '').replace(SDK_TAG_RE, function (all, a, q) { return a + q + '../../sdk/board21.js' + q; });
          var entry = { id: w.id, name: w.name, description: w.description || '', version: w.version || '1.0.0', color: w.color, entry: 'widgets/' + w.id + '/index.html', files: ['widgets/' + w.id + '/index.html'], window: w.window };
          if (st.drawer !== 'checks') openDrawer('checks');   // (where the text is shown if copying is blocked)
          copyText('<!-- Save as widgets/' + w.id + '/index.html -->\n' + html + '\n\n<!-- Add to widgets/registry.js (BOARD21_WIDGETS), then bump VERSION in sw.js: -->\n' + JSON.stringify(entry, null, 2) + ',\n', 'Copied the HTML and its registry entry');
          break;
        }
      }
    });
    root.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-k');
      if (k === 'screen') { st.screen = e.target.value; remember(); st.fitKey = ''; place(false); setTimeout(function () { st.fitKey = ''; maybeFollow(); }, 400); }
      else if (k === 'theme') send('theme', { value: e.target.value });
      else if (k === 'inst') { st.ikey = e.target.value; renderDrawer(); }
      else if (k === 'hidewin') renderDrawer();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { pop.hidden = true; } });

    $('[data-k="screen"]').value = st.screen;
    setView(st.view);
    renderFoot();
    place(false);

    var api = {
      version: VERSION,
      frame: frame,
      info: function () { return info.widget; },
      state: function () { return st; },
      send: send,
      camera: function () { return cam; },
      destroy: function () { host.remove(); }
    };
    window.__board21DevWindow = api;
    return api;
  }

  window.Board21Dev = { start: start, version: VERSION, lint: lint };
})();
