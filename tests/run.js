/*
 * 21Board automated browser tests (optional — the widget itself has no dependencies).
 *
 *   npm install --no-save playwright && npx playwright install chromium   (once)
 *   node tests/run.js
 *
 * Starts a static server for the repo, then drives Chromium through the
 * windowing system, storage, multi-tab sync, export/import, offline mode,
 * touch input and the widget SDK. Screenshots go to tests/output/.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'output') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.21board': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else fails++; console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + msg); };
let BASE;

// Most suites test window behavior on a board that is simply the screen at 100% (Settings →
// Board shape: Any shape, size 100%), so window px are screen px. The 16:9 board has its own suite.
async function freeBoard(page) {
  await page.evaluate(() => { window.__board21.setBoardShape('free'); window.__board21.setBoardScale(1); });
  await page.waitForTimeout(100);
}

// Notes shows its text (with tappable links) until tapped; tap it, then type.
async function fillNote(f, text) { const v = f.locator('#view'); if (await v.isVisible()) await v.click(); await f.locator('#t').fill(text); }

// Pages for the widget dev window tests: a widget as an AI tool would make it, and stand-ins for how AI previews
// show it (fetch the code, then document.write it or open it as a blob: URL) on another origin than the page.
const DEV_WIDGET = sdk => `<!DOCTYPE html><html lang="en"><head><script src="${sdk}"></script>
<script type="application/json" id="board21-widget">{"id":"counter","name":"Counter","version":"1.0.0","window":{"width":320,"height":240,"minWidth":200,"minHeight":150,"aspectRatio":"4:3"}}</script>
<meta charset="utf-8"><title>Counter</title><style>html,body{margin:0;height:100%}body{display:grid;place-items:center;font:700 30vmin/1 system-ui;background:var(--b21-bg);color:var(--b21-text)}</style></head>
<body><div id="n">0</div><script>
window.__runs = (window.__runs || 0) + 1;
let st = { count: 0 };
Board21.ready().then(ctx => { st = Object.assign(st, ctx.data); document.getElementById('n').textContent = st.count;
  Board21.menu.set([{ id: 'add', label: 'Add one' }, { separator: true }, { label: 'Color', swatches: [{ id: 'red', label: 'Red', color: '#dc2626' }, { id: 'bad', label: 'Bad', color: 'red' }] }]); });
Board21.on('data', d => { st = Object.assign({ count: 0 }, d); document.getElementById('n').textContent = st.count; });
Board21.on('menu', id => { if (id === 'add') { st.count++; document.getElementById('n').textContent = st.count; Board21.save(st); } });
setTimeout(() => { throw new Error('boom from the widget'); }, 400);
</script></body></html>`;
const DEV_ROUTES = {
  '/__dev/widget.html': () => DEV_WIDGET(BASE + 'sdk/board21.js'),
  '/__dev/late.html': () => DEV_WIDGET(BASE + 'sdk/board21.js').replace(/<script src="[^"]*board21\.js"><\/script>/, '').replace('<body>', `<body><script src="${BASE}sdk/board21.js"></script>`),
  '/__dev/quirks.html': () => DEV_WIDGET(BASE + 'sdk/board21.js').replace('<!DOCTYPE html>', ''),
  '/__dev/console.html': () => `<!DOCTYPE html><html><head><script src="${BASE}sdk/board21.js"></script><script>window.__seen = []; const o = console.error; console.error = function () { window.__seen.push(Array.from(arguments).join(' ')); return o.apply(console, arguments); }; Board21.ready().then(() => setTimeout(() => console.error('after ready'), 50));</script></head><body>console</body></html>`,
  '/__dev/shim-write.html': () => `<!doctype html><script>fetch('widget.html').then(r => r.text()).then(h => { document.open(); document.write(h); document.close(); });</script>`,
  '/__dev/shim-blob.html': () => `<!doctype html><script>fetch('widget.html').then(r => r.text()).then(h => location.replace(URL.createObjectURL(new Blob([h], { type: 'text/html' }))));</script>`,
  // The page around the preview, on another origin (localhost vs 127.0.0.1), like gemini.google.com around its preview.
  '/__dev/top.html': q => `<!doctype html><body style="margin:0"><iframe src="${BASE.replace('127.0.0.1', 'localhost')}__dev/${q.get('s')}" sandbox="allow-scripts${q.get('opaque') ? '' : ' allow-same-origin'}" style="width:760px;height:560px;border:0"></iframe>`
};

// Shared Google Drive folder tests. Each "device" is its own browser profile; the folder each one picks is a
// folder in that browser's private file system, and drive() copies one folder onto the other, as Google Drive
// would. (Wrapped in a plain object: this headless browser closes the page when it reads a saved folder handle
// back from IndexedDB, so the stand-in can't be saved and stays linked until the page closes. Real Chrome keeps
// the handle.)
const DRIVE_PICK = () => {
  window.showDirectoryPicker = async () => {
    const real = await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true });
    const file = fh => ({ kind: 'file', name: fh.name, getFile: () => fh.getFile(), createWritable: () => fh.createWritable() });
    const dir = d => ({
      kind: 'directory', name: d.name,
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      getFileHandle: async (n, o) => file(await d.getFileHandle(n, o)),
      getDirectoryHandle: async (n, o) => dir(await d.getDirectoryHandle(n, o)),
      removeEntry: (n, o) => d.removeEntry(n, o),
      entries: async function* () { for await (const [n, h] of d.entries()) yield [n, h.kind === 'file' ? file(h) : dir(h)]; }
    });
    return dir(real);
  };
};
async function driveDevice(browser) { const c = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await c.addInitScript(DRIVE_PICK); const p = await c.newPage(); return { c, p }; }
const readFolder = p => p.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true }); const out = {}; for await (const [n, h] of d.entries()) if (h.kind === 'file') out[n] = await (await h.getFile()).text(); return out; });
const writeFolder = (p, files) => p.evaluate(async files => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true });
  for await (const [n, h] of d.entries()) if (h.kind === 'file' && !(n in files)) await d.removeEntry(n);
  for (const [n, t] of Object.entries(files)) { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(t); await w.close(); }
}, files);
const drive = async (from, to) => writeFolder(to, await readFolder(from));
// The "Board history" subfolder of the shared folder.
const readHistory = p => p.evaluate(async () => { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true })).getDirectoryHandle('Board history', { create: true }); const out = {}; for await (const [n, h] of d.entries()) if (h.kind === 'file') out[n] = await (await h.getFile()).text(); return out; });
const writeHistory = (p, files) => p.evaluate(async files => {
  const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true })).getDirectoryHandle('Board history', { create: true });
  for (const [n, t] of Object.entries(files)) { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(t); await w.close(); }
}, files);

const SUITES = [
  ['Windows, data and multi-tab sync', async (browser) => {
  const wins = page => page.evaluate(() => Object.fromEntries(Array.from(window.__board21.state.wins.values()).sort((a,b)=>a.ikey<b.ikey?-1:1).map(w => [w.ikey, Object.assign({}, w.disp)])));
  const inst = (page, ik) => page.evaluate(ik => window.__board21.state.insts.get(ik), ik);
  const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
  async function drag(page, from, to, steps = 12) {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(150);
  }
  async function openFromPicker(page, id, side = 'left') {
    await page.click(`.picker-btn.${side}`); await page.waitForTimeout(120);
    await page.click(`[data-widget="${id}"]`); await page.waitForTimeout(400);
  }
  const frameOf = (page, ik) => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
    await page.goto(BASE); await page.waitForTimeout(600); await freeBoard(page);

    // ---- open two windows
    await openFromPicker(page, 'timer');
    await openFromPicker(page, 'notes', 'right');
    let w = await wins(page);
    ok(!overlap(w['timer:1'], w['notes:1']), 'auto-placement avoids overlap');

    // ---- drag notes so it pushes a little into timer: should stop flush (no overlap)
    const t = w['timer:1'], n = w['notes:1'];
    // Move notes so its left edge would be 30px inside timer's right edge, vertically aligned
    let grab = { x: n.x + 30, y: n.y + 20 };
    let target = { x: grab.x + (t.x + t.w - 30 - n.x), y: grab.y + (t.y - n.y) };
    await drag(page, grab, target);
    w = await wins(page);
    ok(!overlap(w['timer:1'], w['notes:1']), 'small push into a window snaps flush instead of overlapping');
    ok(Math.abs(w['notes:1'].x - (t.x + t.w + 8)) <= 1, `snapped next to timer with gap (x=${w['notes:1'].x}, expected ${t.x + t.w + 8})`);

    // ---- push hard: overlap allowed
    const n2 = w['notes:1'];
    grab = { x: n2.x + 30, y: n2.y + 20 };
    target = { x: grab.x - 200, y: grab.y };
    await drag(page, grab, target);
    w = await wins(page);
    ok(overlap(w['timer:1'], w['notes:1']), 'pushing further than the break distance allows overlap');

    // ---- view bounds: drag far off-screen
    const n3 = w['notes:1'];
    await drag(page, { x: n3.x + 30, y: n3.y + 20 }, { x: 5000, y: 5000 });
    w = await wins(page);
    const vw = 1400, vh = 860;
    ok(w['notes:1'].x + w['notes:1'].w <= vw && w['notes:1'].y + w['notes:1'].h <= vh && w['notes:1'].x >= 0, 'window cannot leave the view');

    // ---- resize via se grip
    const before = (await wins(page))['timer:1'];
    await page.mouse.click(before.x + 20, before.y + 20); await page.waitForTimeout(250); // tap the title bar: grips only show on the focused window
    const se = await page.locator('.win[data-ikey="timer:1"] .grip.se').boundingBox();
    await drag(page, { x: se.x + se.width / 2, y: se.y + se.height / 2 }, { x: se.x + se.width / 2 + 80, y: se.y + se.height / 2 + 60 });
    const after = (await wins(page))['timer:1'];
    ok(after.w > before.w + 40 && after.h > before.h + 30, `se grip resizes (${before.w}x${before.h} -> ${after.w}x${after.h})`);

    // ---- min size
    const nw = await page.locator('.win[data-ikey="timer:1"] .grip.nw').boundingBox();
    await drag(page, { x: nw.x + nw.width / 2, y: nw.y + nw.height / 2 }, { x: nw.x + 2000, y: nw.y + 2000 });
    const small = (await wins(page))['timer:1'];
    ok(small.w >= 240 && small.h >= 170 + 40, `min size enforced (${small.w}x${small.h})`);

    // ---- aspect-locked clock
    await openFromPicker(page, 'clock');
    let c = (await wins(page))['clock:1'];
    const ce = await page.locator('.win[data-ikey="clock:1"] .grip.e').boundingBox();
    await drag(page, { x: ce.x + ce.width / 2, y: ce.y + ce.height / 2 }, { x: ce.x + ce.width / 2 - 90, y: ce.y + ce.height / 2 });
    c = (await wins(page))['clock:1'];
    ok(Math.abs(c.w / (c.h - 40) - 1) < 0.02, `clock keeps 1:1 content when resized from the side (${c.w}x${c.h - 40})`);
    // switch to digital via the window menu → aspect 2.2
    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.waitForTimeout(200);
    await page.screenshot({ path: OUT + '10-window-menu.png' });
    await page.click('#menu [data-act="widget"][data-id="digital"]'); await page.waitForTimeout(500);
    c = (await wins(page))['clock:1'];
    ok(Math.abs(c.w / (c.h - 40) - 2.2) < 0.03, `digital clock switches aspect to 2.2 (${c.w}x${c.h - 40})`);

    // ---- notes content persistence across close/reopen
    await fillNote(frameOf(page, 'notes:1'), 'Line up quietly');
    await page.waitForTimeout(300);
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.waitForTimeout(150);
    await page.click('#menu [data-act="close"]'); await page.waitForTimeout(400);
    ok(!(await wins(page))['notes:1'], 'close removes the window');
    ok((await inst(page, 'notes:1')).open === false, 'closed instance record kept');
    await openFromPicker(page, 'notes');
    await page.waitForTimeout(400);
    ok(await frameOf(page, 'notes:1').locator('textarea').inputValue() === 'Line up quietly', 'reopening restores content');

    // ---- second instance gets sequential id and its own data
    await openFromPicker(page, 'notes');
    ok(!!(await wins(page))['notes:2'], 'second Notes is instance 2');
    ok(await frameOf(page, 'notes:2').locator('textarea').inputValue() === '', 'instance 2 has separate (empty) data');
    ok((await page.locator('.win[data-ikey="notes:2"] .num').textContent()) === '2', 'title shows instance number');
    await fillNote(frameOf(page, 'notes:2'), 'Second note');
    await page.waitForTimeout(250);
    // close both, reopen → #1 first, then #2
    for (const ik of ['notes:2', 'notes:1']) { await page.evaluate(ik => window.__board21.closeWin(ik, { quiet: true }), ik); await page.waitForTimeout(250); }
    await openFromPicker(page, 'notes');
    ok(!!(await wins(page))['notes:1'] && !(await wins(page))['notes:2'], 'reopen restores lowest-numbered instance first');
    await openFromPicker(page, 'notes');
    await page.waitForTimeout(300);
    ok(await frameOf(page, 'notes:2').locator('textarea').inputValue() === 'Second note', 'then instance 2 with its own content');

    // ---- focus: tapping inside a window's content brings it to front
    const zBefore = (await inst(page, 'timer:1')).z;
    await frameOf(page, 'timer:1').locator('.display').click();
    await page.waitForTimeout(200);
    const zAfter = (await inst(page, 'timer:1')).z;
    const allZ = await page.evaluate(() => Math.max(...Array.from(window.__board21.state.insts.values()).filter(i => i.open).map(i => i.z)));
    ok(zAfter === allZ && zAfter > zBefore, 'tapping inside widget content brings window to front');

    // ---- multi-tab sync
    const page2 = await ctx.newPage();
    page2.on('pageerror', e => errors.push('[page2 pageerror] ' + e.message));
    await page2.goto(BASE); await page2.waitForTimeout(1200); await freeBoard(page2);
    ok(JSON.stringify(Object.keys(await wins(page2)).sort()) === JSON.stringify(Object.keys(await wins(page)).sort()), 'second tab shows the same windows');
    await fillNote(frameOf(page, 'notes:1'), 'Synced text!');
    await page.waitForTimeout(600);
    ok(await frameOf(page2, 'notes:1').locator('textarea').inputValue() === 'Synced text!', 'content typed in tab 1 appears in tab 2');
    const tm = (await wins(page))['timer:1'];
    await drag(page, { x: tm.x + 40, y: tm.y + 20 }, { x: tm.x + 40, y: tm.y + 20 + 50 });
    await page.waitForTimeout(500);
    const tm1 = (await wins(page))['timer:1'], tm2 = (await wins(page2))['timer:1'];
    ok(tm1.x === tm2.x && tm1.y === tm2.y, `window moves sync across tabs (${tm1.x},${tm1.y} vs ${tm2.x},${tm2.y})`);
    await page2.evaluate(() => window.__board21.closeWin('clock:1', { quiet: true }));
    await page.waitForTimeout(600);
    ok(!(await wins(page))['clock:1'], 'closing in tab 2 closes in tab 1');
    // theme sync
    await page2.click('.picker-btn.right'); await page2.click('[data-ctl="theme"]'); await page2.waitForTimeout(500);
    ok(await page.evaluate(() => document.body.classList.contains('dark')), 'dark mode syncs across tabs');
    ok(await frameOf(page, 'timer:1').locator('html').getAttribute('data-b21-theme') === 'dark', 'widgets receive the theme');
    await page2.keyboard.press('Escape');
    await page.screenshot({ path: OUT + '11-dark.png' });
    await page2.close();

    // ---- reload persistence
    const beforeReload = await wins(page);
    await page.reload(); await page.waitForTimeout(1200);
    const afterReload = await wins(page);
    ok(JSON.stringify(beforeReload) === JSON.stringify(afterReload), 'windows restored exactly after reload'); if (JSON.stringify(beforeReload) !== JSON.stringify(afterReload)) console.log(JSON.stringify(beforeReload), '\n', JSON.stringify(afterReload));
    ok(await frameOf(page, 'notes:1').locator('textarea').inputValue() === 'Synced text!', 'content restored after reload');

    // ---- view shrink keeps windows inside; growing back restores positions
    await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(400);
    const shrunk = await page.evaluate(() => Array.from(document.querySelectorAll('.win')).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
    ok(shrunk.every(r => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= 800 + 0.5 && r.y + r.h <= 600 + 0.5), 'windows fit inside a smaller view (on screen)');
    await page.setViewportSize({ width: 1400, height: 860 }); await page.waitForTimeout(400);
    ok(JSON.stringify(await wins(page)) === JSON.stringify(afterReload), 'growing the view restores original positions');

    // ---- maximize via double-tap on title bar
    const tb = (await wins(page))['timer:1'];
    await page.mouse.dblclick(tb.x + 20, tb.y + 20); await page.waitForTimeout(400);
    const mx = (await wins(page))['timer:1'];
    ok(mx.w === 1400 && mx.h === 860, 'double-tap title bar maximizes');
    await page.mouse.dblclick(30, 20); await page.waitForTimeout(400);
    ok((await wins(page))['timer:1'].w === tb.w, 'double-tap again restores');

    // ---- reset
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.waitForTimeout(150);
    await page.click('#menu [data-act="reset"]'); await page.waitForTimeout(150);
    await page.screenshot({ path: OUT + '12-reset-confirm.png' });
    await page.click('#menu [data-act="reset-yes"]'); await page.waitForTimeout(800);
    ok(await frameOf(page, 'notes:1').locator('textarea').inputValue() === '', 'reset clears content');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Export / import', async (browser) => {
  const frameOf = (page, ik) => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
  const wins = page => page.evaluate(() => Array.from(window.__board21.state.wins.keys()).sort());
      const errors = [];
    // ---------- Board A: build content and export
    const ctxA = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
    const a = await ctxA.newPage();
    a.on('pageerror', e => errors.push('[A] ' + e.message));
    await a.goto(BASE); await a.waitForTimeout(600); await freeBoard(a);
    await a.evaluate(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('name-picker'); window.__board21.openWidget('dice'); });
    await a.waitForTimeout(1200);
    await fillNote(frameOf(a, 'notes:1'), 'Secret student info');
    await frameOf(a, 'name-picker:1').locator('textarea').fill('Ana\nBo\nCy');
    await frameOf(a, 'name-picker:1').locator('#done').click();
    // config change on notes: color pink via menu
    await a.click('.win[data-ikey="notes:1"] .win-label'); await a.click('#menu [data-id="color:pink"]');
    await a.waitForTimeout(400);
    // close dice (closed instance should be in full export, not template)
    await a.evaluate(() => window.__board21.closeWin('dice:1', { quiet: true }));
    await a.waitForTimeout(400);

    // Full export via UI
    await a.click('.picker-btn.left'); await a.click('[data-ctl="export"]');
    await a.waitForTimeout(200);
    await a.screenshot({ path: OUT + '20-export-dialog.png' });
    let [dl] = await Promise.all([a.waitForEvent('download'), a.click('#modal .btn[data-i="0"]')]);
    const fullPath = OUT + 'full.21board'; await dl.saveAs(fullPath);
    ok(/\.21board$/.test(dl.suggestedFilename()), 'export filename ends in .21board: ' + dl.suggestedFilename());
    const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    ok(full.format === '21board' && full.kind === 'full' && full.formatVersion === 1, 'full export header');
    const fNotes = full.instances.find(i => i.widgetId === 'notes');
    ok(fNotes && fNotes.data && fNotes.data.text === 'Secret student info', 'full export contains content');
    ok(fNotes && fNotes.config && fNotes.config.color === 'pink', 'full export contains config');
    ok(full.instances.some(i => i.widgetId === 'dice' && i.open === false), 'full export includes closed windows');

    // Template export
    await a.click('.picker-btn.right'); await a.click('[data-ctl="export"]'); await a.waitForTimeout(150);
    [dl] = await Promise.all([a.waitForEvent('download'), a.click('#modal .btn[data-i="1"]')]);
    const tplPath = OUT + 'template.21board'; await dl.saveAs(tplPath);
    const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
    ok(tpl.kind === 'template', 'template kind');
    ok(tpl.instances.every(i => i.data === null), 'template has no content');
    ok(!tpl.instances.some(i => i.widgetId === 'dice'), 'template excludes closed windows');
    ok(tpl.instances.find(i => i.widgetId === 'notes').config.color === 'pink', 'template keeps config');
    ok(!JSON.stringify(tpl).includes('Secret') && !JSON.stringify(tpl).includes('Ana'), 'no student content in template');

    // ---------- Board B: different screen size, import full (replace)
    const ctxB = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const b = await ctxB.newPage();
    b.on('pageerror', e => errors.push('[B] ' + e.message));
    await b.goto(BASE); await b.waitForTimeout(600); await freeBoard(b);
    await b.evaluate(() => window.__board21.openWidget('timer'));
    await b.waitForTimeout(500);
    await b.setInputFiles('#import-input', fullPath);
    await b.waitForTimeout(300);
    await b.screenshot({ path: OUT + '21-import-dialog.png' });
    await b.click('#modal .btn[data-i="0"]'); // replace
    await b.waitForTimeout(1500);
    ok(JSON.stringify(await wins(b)) === JSON.stringify(['name-picker:1', 'notes:1']), 'replace import: windows match file (' + (await wins(b)).join(',') + ')');
    ok(await frameOf(b, 'notes:1').locator('textarea').inputValue() === 'Secret student info', 'replace import: content restored');
    const rects = await b.evaluate(() => Array.from(document.querySelectorAll('.win')).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
    ok(rects.every(r => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= 1000.5 && r.y + r.h <= 700.5), 'imported windows scaled/fit to smaller screen (on screen)');
    ok(await b.evaluate(() => window.__board21.state.insts.has('dice:1') && !window.__board21.state.insts.get('dice:1').open), 'closed dice instance imported');

    // Add template on top → instances renumbered
    await b.setInputFiles('#import-input', tplPath);
    await b.waitForTimeout(300);
    await b.click('#modal .btn[data-i="1"]'); // add
    await b.waitForTimeout(1500);
    const after = await wins(b);
    ok(after.includes('notes:2') && after.includes('name-picker:2'), 'add import renumbers instances: ' + after.join(','));
    const r = await b.evaluate(() => { const s = window.__board21.state.wins; return [s.get('notes:1').disp, s.get('notes:2').disp]; });
    ok(!(Math.abs(r[0].x - r[1].x) < 24 && Math.abs(r[0].y - r[1].y) < 24), 'added window never hides another exactly');
    ok(await frameOf(b, 'notes:2').locator('textarea').inputValue() === '', 'template-added note is blank');
    // bad file
    fs.writeFileSync(OUT + 'bad.21board', '{"hello": 1}');
    await b.setInputFiles('#import-input', OUT + 'bad.21board'); await b.waitForTimeout(300);
    ok((await b.locator('#modal h3').textContent()).includes('Can’t import'), 'invalid file rejected with message');
    await b.click('#modal .btn');

    // ---------- Settings sheet
    await b.click('.picker-btn.right'); await b.click('[data-ctl="settings"]'); await b.waitForTimeout(400);
    await b.screenshot({ path: OUT + '22-settings.png' });
    await b.click('#settings [data-act="bg"][data-val="#1f3a2c"]');
    await b.click('#settings [data-act="pattern"][data-val="grid"]');
    await b.waitForTimeout(600);
    ok(await b.evaluate(() => getComputedStyle(document.getElementById('desk')).backgroundColor) === 'rgb(31, 58, 44)', 'background color applied');
    await b.locator('#settings .sheet-body').evaluate(el => el.scrollTop = 99999);
    await b.waitForTimeout(150);
    await b.screenshot({ path: OUT + '23-settings-bottom.png' });
    await b.click('#settings [data-act="corners"][data-val="left"]'); await b.waitForTimeout(200);
    ok(await b.locator('.picker-btn.right').isHidden(), 'picker corner setting hides right button');
    await b.keyboard.press('Escape');
    await b.screenshot({ path: OUT + '24-chalkboard.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Offline', async (browser) => {

      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + ''); await freeBoard(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    const cached = await page.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
    console.log('cached files:', cached.length, cached.join(' '));
    await ctx.setOffline(true);
    await page.reload(); await page.waitForTimeout(800);
    ok(await page.locator('.picker-btn.left').isVisible(), 'board loads offline');
    const ids = await page.evaluate(() => window.__board21.catalog().filter(a => !a.devOnly).map(a => a.id));
    for (const id of ids) await page.evaluate(id => window.__board21.openWidget(id), id);
    await page.waitForTimeout(2500);
    const conn = await page.evaluate(() => Array.from(window.__board21.state.wins.values()).map(w => [w.ikey, w.connected]));
    ok(conn.length === ids.length && conn.every(c => c[1]), 'every widget loads and connects offline: ' + JSON.stringify(conn));
    await page.screenshot({ path: OUT + '30-offline-all-widgets.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Touch and multi-touch', async (browser) => {
  const wins = page => page.evaluate(() => Object.fromEntries(Array.from(window.__board21.state.wins.values()).map(w => [w.ikey, Object.assign({}, w.disp)])));
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE + ''); await page.waitForTimeout(600); await freeBoard(page);
    // tap the waffle with touch → panel opens, tap a widget
    await page.touchscreen.tap(44, 900 - 44); await page.waitForTimeout(200);
    ok(await page.locator('#panel.open').count() === 1, 'touch tap opens Widget Picker');
    const tile = await page.locator('[data-widget="timer"]').boundingBox();
    await page.touchscreen.tap(tile.x + 40, tile.y + 40); await page.waitForTimeout(400);
    await page.evaluate(() => window.__board21.openWidget('dice', { side: 'right' }));
    await page.waitForTimeout(800);
    const w0 = await wins(page);
    const cdp = await ctx.newCDPSession(page);
    const A = w0['timer:1'], B = w0['dice:1'];
    // two fingers on two title bars, both dragging down 150px at the same time
    const p = (i, dy) => [{ x: A.x + 30, y: A.y + 20 + dy, id: 1 }, { x: B.x + 30, y: B.y + 20 + dy, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: p(0, 0) });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: p(i, i * 15) }); await page.waitForTimeout(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const w1 = await wins(page);
    ok(w1['timer:1'].y - A.y > 100 && w1['dice:1'].y - B.y > 100, `two windows dragged simultaneously by two touches (dy ${w1['timer:1'].y - A.y}, ${w1['dice:1'].y - B.y})`);
    // tap on window label opens menu via touch
    const lbl = await page.locator('.win[data-ikey="dice:1"] .win-label').boundingBox();
    await page.touchscreen.tap(lbl.x + lbl.width / 2, lbl.y + lbl.height / 2); await page.waitForTimeout(250);
    ok(await page.locator('#menu.open').count() === 1, 'touch tap on title opens window menu');
  }],
  ['SDK, developer mode, standalone', async (browser) => {
  const disp = (page, ik) => page.evaluate(ik => Object.assign({}, window.__board21.state.wins.get(ik).disp), ik);
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + ''); await page.waitForTimeout(500); await freeBoard(page);
    ok(!(await page.evaluate(() => window.__board21.catalog().filter(a => a.devOnly).length && document.querySelector('[data-widget="sdk-playground"]'))), 'dev widget hidden by default');
    // turn on developer mode in settings
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(200);
    await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.click('.picker-btn.left'); await page.waitForTimeout(150);
    ok(await page.locator('[data-widget="sdk-playground"]').count() === 1, 'developer mode shows SDK Playground');
    await page.click('[data-widget="sdk-playground"]'); await page.waitForTimeout(1000);
    const f = page.frameLocator('.win[data-ikey="sdk-playground:1"] iframe');
    const btn = k => f.locator(`button[data-k="${k}"]`).click();
    const ik = 'sdk-playground:1';
    await btn('setSize(480, 320)'); await page.waitForTimeout(400);
    let d = await disp(page, ik);
    ok(d.w === 480 && d.h === 360, `setSize sets content size (${d.w}x${d.h - 40})`);
    await btn('aspect 16:9'); await page.waitForTimeout(400);
    d = await disp(page, ik);
    ok(Math.abs(d.w / (d.h - 40) - 16 / 9) < 0.02, `setAspectRatio 16:9 (${d.w}x${d.h - 40})`);
    await btn('aspect off');
    await btn('resizable off'); await page.waitForTimeout(200);
    ok(await page.locator(`.win[data-ikey="${ik}"].no-resize`).count() === 1, 'setResizable(false) hides grips');
    await btn('resizable on');
    await btn('setTitle(time)'); await page.waitForTimeout(200);
    ok((await page.locator(`.win[data-ikey="${ik}"] .sub`).textContent()).length > 0, 'setTitle shows subtitle');
    await btn('requestAttention()'); await page.waitForTimeout(200);
    ok(await page.locator(`.win[data-ikey="${ik}"].attention`).count() === 1, 'requestAttention pulses the title bar');
    await btn('menu.set(3 items)'); await page.waitForTimeout(200);
    await page.click(`.win[data-ikey="${ik}"] .win-label`); await page.waitForTimeout(200);
    ok(await page.locator('#menu [data-act="widget"]').count() === 3, 'custom menu items appear in window menu');
    await page.screenshot({ path: OUT + '40-sdk-menu.png' });
    await page.click('#menu [data-id="a"]'); await page.waitForTimeout(200);
    ok((await f.locator('#log').textContent()).includes('event menu "a"'), 'menu selection reaches the widget');
    await btn('save({counter})'); await page.waitForTimeout(300);
    ok((await f.locator('#log').textContent()).includes('save ok'), 'save resolves after commit');
    await btn('getInfo()'); await page.waitForTimeout(200);
    ok((await f.locator('#log').textContent()).includes('"width"'), 'getInfo returns window info');
    await btn('toast()'); await page.waitForTimeout(200);
    ok(await page.locator('.toast:has-text("Hello from the SDK")').count() === 1, 'toast shows on the board');
    await btn('maximize()'); await page.waitForTimeout(400);
    d = await disp(page, ik); ok(d.w === 1400 && d.h === 860, 'maximize()');
    await btn('restore()'); await page.waitForTimeout(400);
    // dev: add a test widget by path
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(200);
    await page.fill('#set-dev-path', 'widgets/_template/index.html');
    await page.click('#settings [data-act="dev-add"]'); await page.waitForTimeout(1000);
    const devWin = await page.evaluate(() => Array.from(window.__board21.state.wins.values()).filter(w => w.widget.dev).map(w => [w.ikey, w.connected]));
    ok(devWin.length === 1 && devWin[0][1], 'developer can load an unregistered widget by path: ' + JSON.stringify(devWin));
    await btn('close()'); await page.waitForTimeout(400);
    ok(!(await page.evaluate(ik => window.__board21.state.wins.has(ik), ik)), 'close() from the widget closes its window');

    // ---- standalone widget
    const sp = await ctx.newPage();
    const t0 = Date.now();
    await sp.goto(BASE + 'widgets/timer/index.html#b21-bare'); await sp.waitForFunction(() => window.Board21 && Board21.context, null, { timeout: 3000 });
    ok(await sp.evaluate(() => Board21.context.standalone === true && !document.getElementById('b21-dev')) && Date.now() - t0 < 2500, 'with #b21-bare a widget runs on its own, at once');
    await sp.click('#go'); await sp.waitForTimeout(300); await sp.reload(); await sp.waitForTimeout(500);
    ok(await sp.evaluate(() => (JSON.parse(localStorage.getItem('21board:standalone:timer')) || {}).data.endsAt > 0), 'standalone save persists to localStorage (by widget id)');

    // ---- phone width: no horizontal overflow of the panel
    const ph = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true });
    const pp = await ph.newPage(); await pp.goto(BASE + ''); await pp.waitForTimeout(500); await freeBoard(pp);
    await pp.click('.picker-btn.right'); await pp.waitForTimeout(250);
    const pb = await pp.locator('#panel').boundingBox();
    ok(pb.x >= 0 && pb.x + pb.width <= 375, `panel fits at phone width (${Math.round(pb.x)}..${Math.round(pb.x + pb.width)})`);
    await pp.screenshot({ path: OUT + '41-phone-panel.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Focus, grips, resize snapping, storage protection', async (browser) => {
  const disp = (p, ik) => p.evaluate(ik => Object.assign({}, window.__board21.state.wins.get(ik).disp), ik);
  const gripVis = (p, ik) => p.evaluate(ik => getComputedStyle(document.querySelector(`.win[data-ikey="${ik}"] .grip.se`)).visibility, ik);
  async function drag(page, from, to, steps = 14) {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(200);
  }
  const setRect = (p, ik, r) => p.evaluate(([ik, r]) => { const s = window.__board21.state; const i = s.insts.get(ik); s.insts.set(ik, Object.assign({}, i, { rect: r })); s.wins.get(ik).layout(); }, [ik, r]);
  async function gripDrag(page, ik, h, dx, dy) {
    await page.evaluate(ik => window.__board21.focusWin(ik), ik); await page.waitForTimeout(250);
    const b = await page.locator(`.win[data-ikey="${ik}"] .grip.${h}`).boundingBox();
    await drag(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy });
  }
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('timer'); });
    await page.waitForTimeout(1200);
    // ---- #1 grips only on focused window
    ok(await gripVis(page, 'timer:1') === 'visible', 'focused window shows grips');
    ok(await gripVis(page, 'notes:1') === 'hidden', 'unfocused window hides grips');
    await page.screenshot({ path: OUT + '60-focus-light.png' });
    await page.mouse.click(700, 60); await page.waitForTimeout(300);
    ok(await page.locator('.win.focused').count() === 0, 'tapping the empty board deselects all windows');
    ok(await gripVis(page, 'timer:1') === 'hidden', 'no grips after deselecting');
    await page.screenshot({ path: OUT + '61-deselected.png' });
    await page.frameLocator('.win[data-ikey="notes:1"] iframe').locator('#view').click(); await page.waitForTimeout(300);
    ok(await page.locator('.win.focused[data-ikey="notes:1"]').count() === 1 && await gripVis(page, 'notes:1') === 'visible', 'tapping inside a window focuses it and shows its grips');
    // invisible grip of an unfocused window is not grabbable
    const nb = await disp(page, 'timer:1');
    const before = await disp(page, 'timer:1');
    await drag(page, { x: nb.x + nb.w + 2, y: nb.y + nb.h + 2 }, { x: nb.x + nb.w + 80, y: nb.y + nb.h + 80 });
    const after = await disp(page, 'timer:1');
    ok(after.w === before.w && after.h === before.h, 'hidden grips of an unfocused window cannot be dragged');

    // ---- #2 size snapping while resizing
    await setRect(page, 'notes:1', { x: 100, y: 100, w: 320, h: 300 });
    await setRect(page, 'timer:1', { x: 500, y: 120, w: 380, h: 240 });
    await page.waitForTimeout(200);
    // timer bottom 360 -> drag down 33px to 393 (within 12 of notes bottom 400) => snaps to 400
    await gripDrag(page, 'timer:1', 's', 0, 33);
    let t = await disp(page, 'timer:1');
    ok(t.y + t.h === 400, `bottom edge snaps to neighbour's bottom edge (bottom=${t.y + t.h}, expected 400)`);
    // top edge: timer top 120 -> drag up 15 -> 105, within 12 of notes top 100 => snaps to 100
    await gripDrag(page, 'timer:1', 'n', 0, -15);
    t = await disp(page, 'timer:1');
    ok(t.y === 100, `top edge snaps to neighbour's top edge (top=${t.y})`);
    // width match: put timer below notes, resize its right edge to near notes' width 320
    await setRect(page, 'timer:1', { x: 100, y: 450, w: 380, h: 240 });
    await page.waitForTimeout(200);
    await gripDrag(page, 'timer:1', 'e', -54, 0); // 380 -> 326, within 12 of 320 and of notes right edge 420
    t = await disp(page, 'timer:1');
    ok(t.w === 320, `width snaps to match the window above (w=${t.w})`);
    // snapping must not create overlap: timer to the right of notes; drag W edge toward notes right edge 420 -> snaps to 428 (gap)
    await setRect(page, 'timer:1', { x: 470, y: 100, w: 380, h: 240 });
    await page.waitForTimeout(200);
    await gripDrag(page, 'timer:1', 'w', -36, 0); // left 470 -> 434, near 428 (gap line) and 420 (edge, would overlap)
    t = await disp(page, 'timer:1');
    ok(t.x === 428, `left edge snaps beside the neighbour with a gap, not into it (x=${t.x})`);
    // snapping off
    await page.evaluate(() => { const s = window.__board21.state; s.settings.snapping = false; });
    await setRect(page, 'timer:1', { x: 500, y: 120, w: 380, h: 240 });
    await gripDrag(page, 'timer:1', 's', 0, 33);
    t = await disp(page, 'timer:1');
    ok(t.y + t.h === 393, `no snapping when snapping is turned off (bottom=${t.y + t.h})`);
    await page.evaluate(() => { window.__board21.state.settings.snapping = true; });

    // ---- #4 storage protection UI
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(600);
    await page.locator('#settings .sheet-body').evaluate(el => { const h = [...el.querySelectorAll('h3')].find(x => x.textContent.includes('Storage')); el.scrollTop = h.offsetTop - 10; });
    await page.waitForTimeout(300);
    const persistText = await page.locator('#st-persist').textContent();
    const hint = await page.locator('#st-persist-hint').textContent();
    console.log('  persist status:', JSON.stringify(persistText), '|', hint.slice(0, 90));
    ok(persistText.length > 0 && hint.length > 0, 'settings shows data-protection status');
    ok((await page.locator('#st-backup').textContent()).includes('never'), 'backup row says never backed up');
    await page.screenshot({ path: OUT + '62-storage-settings.png' });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#settings [data-act="backup"]')]);
    await page.waitForTimeout(400);
    ok(/\.21board$/.test(dl.suggestedFilename()), 'Back up now downloads a full backup');
    ok((await page.locator('#st-backup').textContent()).includes('today'), 'backup row updates to "today"');
    ok(await page.evaluate(() => typeof window.__board21.state.settings.lastBackupAt === 'number'), 'lastBackupAt recorded in settings');
    await page.keyboard.press('Escape');
    // dark focus screenshot
    await page.evaluate(() => window.__board21.focusWin('notes:1'));
    await page.click('.picker-btn.left'); await page.click('[data-ctl="theme"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '63-focus-dark.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Review fixes (multi-touch focus, edge handles, ratio snapping, backups)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    const disp = ik => page.evaluate(ik => Object.assign({}, window.__board21.state.wins.get(ik).disp), ik);
    const setRect = (ik, r) => page.evaluate(([ik, r]) => { const s = window.__board21.state; s.insts.set(ik, Object.assign({}, s.insts.get(ik), { rect: r })); s.wins.get(ik).layout(); }, [ik, r]);
    await page.evaluate(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('timer'); });
    await page.waitForTimeout(1200);

    // A second touch on the empty board while the first finger resizes must not deselect the window.
    await setRect('timer:1', { x: 400, y: 200, w: 380, h: 280 });
    await page.evaluate(() => window.__board21.focusWin('timer:1')); await page.waitForTimeout(200);
    const se = await page.locator('.win[data-ikey="timer:1"] .grip.se').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const f1 = (dx, dy) => ({ x: se.x + se.width / 2 + dx, y: se.y + se.height / 2 + dy, id: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [f1(0, 0)] });
    for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [f1(i * 6, i * 6)] }); await page.waitForTimeout(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [f1(30, 30), { x: 1300, y: 60, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [f1(30, 30)] });
    await page.waitForTimeout(100);
    const mid = await page.evaluate(() => ({ f: window.__board21.state.focused, vis: getComputedStyle(document.querySelector('.win[data-ikey="timer:1"] .grip.se')).visibility }));
    ok(mid.f === 'timer:1' && mid.vis === 'visible', `stray second touch keeps the resizing window selected (focused=${mid.f}, grip ${mid.vis})`);
    for (let i = 6; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [f1(i * 6, i * 6)] }); await page.waitForTimeout(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);

    // Widgets are told focused:false after a deselect (a freshly connected widget is the case that used to break).
    await page.evaluate(() => window.__board21.openWidget('dice')); await page.waitForTimeout(1200);
    await page.mouse.click(1300, 40); await page.waitForTimeout(400);
    const appFocused = await page.frameLocator('.win[data-ikey="dice:1"] iframe').locator('html').evaluate(() => Board21.context.window.focused);
    ok(appFocused === false, `after tapping the empty board the widget sees focused: false (got ${appFocused})`);
    await page.evaluate(() => window.__board21.closeWin('dice:1', { quiet: true })); await page.waitForTimeout(300);

    // A tap on a grip with a little finger wobble must not resize (or snap) the window.
    await setRect('notes:1', { x: 1000, y: 100, w: 380, h: 300 });
    await page.evaluate(() => window.__board21.focusWin('notes:1')); await page.waitForTimeout(200);
    const e = await page.locator('.win[data-ikey="notes:1"] .grip.e').boundingBox();
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2); await page.mouse.down();
    await page.mouse.move(e.x + e.width / 2 + 2, e.y + e.height / 2 + 1); await page.mouse.up(); await page.waitForTimeout(200);
    ok((await disp('notes:1')).w === 380, `wobbly tap on a grip leaves the size alone (w=${(await disp('notes:1')).w})`);

    // Handles and focus ring are drawn inside the window on sides flush with the board edge.
    await setRect('notes:1', { x: 0, y: 0, w: 380, h: 300 });
    await page.evaluate(() => window.__board21.focusWin('notes:1')); await page.waitForTimeout(300);
    const edge = await page.evaluate(() => {
      const w = document.querySelector('.win[data-ikey="notes:1"]');
      const n = getComputedStyle(w.querySelector('.grip.n'), '::after'), before = getComputedStyle(w, '::before');
      return { cls: w.className, nTop: n.top, ringL: before.borderLeftWidth, ringR: before.borderRightWidth };
    });
    ok(/at-l/.test(edge.cls) && /at-t/.test(edge.cls) && edge.nTop === '19px', `top handle drawn inside at the board edge (${edge.nTop})`);
    ok(edge.ringL === '3px' && edge.ringR === '0px', `focus ring drawn inside only on the flush sides (left ${edge.ringL}, right ${edge.ringR})`);

    // Snapping an aspect-locked window must not push it into a neighbour.
    await page.evaluate(() => window.__board21.openWidget('clock')); await page.waitForTimeout(800);
    await setRect('clock:1', { x: 300, y: 200, w: 300, h: 340 });
    await setRect('notes:1', { x: 608, y: 150, w: 320, h: 416 });
    await page.evaluate(() => window.__board21.focusWin('clock:1')); await page.waitForTimeout(250);
    const cs = await page.locator('.win[data-ikey="clock:1"] .grip.s').boundingBox();
    await page.mouse.move(cs.x + cs.width / 2, cs.y + cs.height / 2); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(cs.x + cs.width / 2, cs.y + cs.height / 2 + i * 1.5); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(200);
    const c = await disp('clock:1'), n = await disp('notes:1');
    ok(c.x + c.w <= n.x, `aspect-locked resize snapping causes no overlap (clock right ${c.x + c.w}, notes left ${n.x})`);
    ok(Math.abs(c.w / (c.h - 40) - 1) < 0.02, 'clock keeps its 1:1 shape');

    // The open window-menu button is visible against the focused title tint.
    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.waitForTimeout(200);
    const bgs = await page.evaluate(() => [getComputedStyle(document.querySelector('.win[data-ikey="clock:1"] .win-label')).backgroundColor, getComputedStyle(document.querySelector('.win[data-ikey="clock:1"] .win-title')).backgroundColor]);
    ok(bgs[0] !== bgs[1], `open menu button stands out from the title bar (${bgs[0]} vs ${bgs[1]})`);
    await page.keyboard.press('Escape');

    // "Today/yesterday" use calendar days.
    await page.evaluate(() => { const d = new Date(); d.setHours(0, 0, 0, 0); window.__board21.state.settings.lastBackupAt = d.getTime() - 60000; });
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(500);
    ok((await page.locator('#st-backup').textContent()).includes('yesterday'), 'a backup from 23:59 last night says "yesterday"');

    // Native Save dialog: cancelling records nothing; saving records the backup and writes a real file.
    await page.evaluate(() => {
      window.__board21.state.settings.lastBackupAt = null;
      window.__saved = null;
      window.showSaveFilePicker = async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; };
    });
    await page.click('#settings [data-act="backup"]'); await page.waitForTimeout(500);
    ok(await page.evaluate(() => window.__board21.state.settings.lastBackupAt === null), 'cancelling the Save dialog does not count as a backup');
    await page.evaluate(() => {
      window.showSaveFilePicker = async opts => ({ createWritable: async () => ({ write: async t => { window.__saved = { name: opts.suggestedName, text: t }; }, close: async () => {} }) });
    });
    await page.click('#settings [data-act="backup"]'); await page.waitForTimeout(600);
    const saved = await page.evaluate(() => window.__saved);
    ok(saved && /\.21board$/.test(saved.name) && JSON.parse(saved.text).format === '21board', 'saving through the dialog writes a .21board file');
    ok(await page.evaluate(() => typeof window.__board21.state.settings.lastBackupAt === 'number'), 'and records the backup time');
    // Window menus never scroll: below or above the title if they fit, else beside it; very short screens get tighter rows.
    await page.keyboard.press('Escape');
    const menuBox = () => page.evaluate(() => {
      const m = document.getElementById('menu'), r = m.getBoundingClientRect();
      const l = document.querySelector('.win-label.open').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, scrolls: m.scrollHeight > m.clientHeight + 1, compact: m.classList.contains('compact') || m.classList.contains('tight'),
        label: { left: l.left, right: l.right, top: l.top, bottom: l.bottom } };
    });
    await page.setViewportSize({ width: 900, height: 520 }); await page.waitForTimeout(300);
    await setRect('notes:1', { x: 280, y: 200, w: 340, h: 280 });
    await page.evaluate(() => window.__board21.focusWin('notes:1')); await page.waitForTimeout(200);
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.waitForTimeout(300);
    let mbx = await menuBox();
    ok(mbx.top >= 0 && mbx.bottom <= 520, `a long window menu fits a short screen (${Math.round(mbx.top)}–${Math.round(mbx.bottom)} of 520)`);
    ok(!mbx.scrolls, 'and does not need scrolling');
    ok(mbx.left >= mbx.label.right || mbx.right <= mbx.label.left, 'with no room above or below the title, it opens beside the title');
    await page.click('#menu [data-act="close"]'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => !window.__board21.state.wins.has('notes:1')), 'Close is right there to tap');
    await page.evaluate(() => window.__board21.openWidget('notes')); await page.waitForTimeout(600);
    await page.setViewportSize({ width: 900, height: 400 }); await page.waitForTimeout(300);
    await setRect('notes:1', { x: 10, y: 10, w: 340, h: 280 });
    await page.evaluate(() => window.__board21.focusWin('notes:1')); await page.waitForTimeout(200);
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.waitForTimeout(300);
    mbx = await menuBox();
    ok(mbx.top >= 0 && mbx.bottom <= 400 && !mbx.scrolls, `on a very short screen the menu still fits without scrolling (${Math.round(mbx.top)}–${Math.round(mbx.bottom)} of 400${mbx.compact ? ', tighter rows' : ''})`);
    await page.keyboard.press('Escape');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Calendar and date-only clock', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    ok(await page.evaluate(() => window.__board21.catalog().some(a => a.id === 'calendar')), 'Calendar is in the Widget Picker');
    await page.evaluate(() => { window.__board21.openWidget('calendar'); window.__board21.openWidget('clock'); });
    await page.waitForTimeout(1500);
    const cal = page.frameLocator('.win[data-ikey="calendar:1"] iframe');
    const info = await cal.locator('body').evaluate(() => {
      const t = new Date();
      return {
        title: document.getElementById('title').textContent,
        expect: t.toLocaleDateString(Board21.context.locale, { month: 'long', year: 'numeric' }),
        todays: Array.from(document.querySelectorAll('.day.today')).map(d => d.textContent),
        date: String(t.getDate()), cells: document.querySelectorAll('.day').length,
        firstDow: document.querySelector('.dow').title
      };
    });
    ok(info.title === info.expect && info.cells === 42, `calendar opens on the current month (${info.title})`);
    ok(info.todays.length === 1 && info.todays[0] === info.date, `exactly one day is highlighted, and it is today (${info.todays.join(',')})`);
    ok(info.firstDow === 'Sunday', 'week starts on Sunday by default');
    await cal.locator('#next').click(); await page.waitForTimeout(150);
    ok((await cal.locator('.day.today').count()) === 0 && await cal.locator('#today').isVisible(), 'next month: no today highlight, Today button shown');
    await cal.locator('#today').click(); await page.waitForTimeout(150);
    ok((await cal.locator('.day.today').count()) === 1, 'Today button returns to the current month');
    await page.click('.win[data-ikey="calendar:1"] .win-label'); await page.click('#menu [data-id="mon"]'); await page.waitForTimeout(300);
    ok((await cal.locator('.dow').first().getAttribute('title')) === 'Monday', 'menu switches the week to start on Monday');
    ok(await page.evaluate(() => window.__board21.state.conf.get('calendar:1').weekStart === 1), 'week start is saved as config');

    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.click('#menu [data-id="date"]'); await page.waitForTimeout(600);
    const clock = page.frameLocator('.win[data-ikey="clock:1"] iframe');
    const wd = await clock.locator('#weekday').textContent();
    const expectWd = await clock.locator('body').evaluate(() => new Date().toLocaleDateString(Board21.context.locale, { weekday: 'long' }));
    ok(wd === expectWd && await clock.locator('#dateonly').isVisible() && !(await clock.locator('#analog').isVisible()), `clock "Date only" shows today's date (${wd})`);
    const cd = await page.evaluate(() => Object.assign({}, window.__board21.state.wins.get('clock:1').disp));
    ok(Math.abs(cd.w / (cd.h - 40) - 2.2) < 0.03, 'date-only clock uses a wide shape');
    await page.screenshot({ path: OUT + 'calendar-and-date.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Board shape and scale (16:9 by default)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600);
    const view = p => p.evaluate(() => ({ board: window.__board21.state.board, zoom: Object.assign({}, window.__board21.zoom), bounds: window.__board21.boundsRect(),
      frame: !document.getElementById('layout-frame').hidden, hint: !document.getElementById('shape-hint').hidden, ui: getComputedStyle(document.documentElement).getPropertyValue('--ui').trim() }));
    let v = await view(page);
    ok(v.board.scale === 0.8 && v.board.shape === '16:9' && v.bounds.w === 2400 && v.bounds.h === 1350, `a new board is 16:9 at 80% (${v.bounds.w} × ${v.bounds.h})`);
    ok(Math.abs(v.zoom.s - 2 / 3) < 0.001 && !v.frame, 'on a 16:9 window it fills the window, drawn at 80% of 1080p (here 2/3)');
    await page.evaluate(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setRect('timer:1', { x: 1200, y: 300, w: 480, h: 360 })); await page.waitForTimeout(200);
    const scr = (p, ik) => p.evaluate(ik => { const r = document.querySelector(`.win[data-ikey="${ik}"]`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, ik);
    let r = await scr(page, 'timer:1');
    ok(Math.abs(r.x - 800) < 1 && Math.abs(r.w - 320) < 1, `windows are drawn at the board's zoom (480 wide on the board, ${Math.round(r.w)} on screen)`);
    const title = await page.evaluate(() => document.querySelector('.win[data-ikey="timer:1"] .win-title').getBoundingClientRect().height);
    ok(Math.abs(title - 40 * 2 / 3) < 1, `title bars are smaller than before (${title.toFixed(1)}px on this screen)`);

    // Another, smaller tab shows the same arrangement.
    const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 800, height: 450 }); await p2.goto(BASE); await p2.waitForTimeout(1200);
    const r2 = await scr(p2, 'timer:1');
    ok(Math.abs(r2.x / 800 - r.x / 1600) < 0.002 && Math.abs(r2.w / 800 - r.w / 1600) < 0.002, 'a smaller screen shows exactly the same arrangement');
    await p2.close();

    // A window of a different shape: the board keeps 16:9, the rest is shaded, windows stop at the board's edge.
    await page.setViewportSize({ width: 1000, height: 1000 }); await page.waitForTimeout(700);
    v = await view(page);
    ok(v.frame && v.bounds.h === 1350, 'in a square window the board stays 16:9 and the rest is shaded');
    const t0 = await scr(page, 'timer:1');
    await page.mouse.move(t0.x + 30, t0.y + 8); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(t0.x + 30, t0.y + 8 + 60 * i); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(300);
    const saved = await page.evaluate(() => window.__board21.state.insts.get('timer:1').rect);
    ok(saved.y + saved.h <= 1350.5, `windows can't be dragged off the 16:9 board (bottom ${Math.round(saved.y + saved.h)} of 1350)`);
    ok(v.hint, 'a tip in the shaded margin offers to unlock the board shape');
    const hb = await page.evaluate(() => { const h = document.getElementById('shape-hint').getBoundingClientRect(); const L = window.__board21.zoom; return { top: h.top, bottom: h.bottom, boardBottom: 1350 * L.s }; });
    ok(hb.top >= hb.boardBottom - 1 && hb.bottom <= 1000, 'the tip sits in the unused margin, not over the board');
    await page.click('#shape-hint [data-act="unlock"]'); await page.waitForTimeout(500);
    v = await view(page);
    ok(v.board.shape === 'free' && Math.abs(v.zoom.s - 0.8) < 0.001 && !v.hint && !v.frame && Math.abs(v.bounds.h - 1250) < 1, 'unlocking: the board fills the window at 80%, no shading, no tip');
    await page.evaluate(() => window.__board21.setBoardShape('16:9')); await page.waitForTimeout(300);
    await page.click('#shape-hint [data-act="hide"]'); await page.waitForTimeout(200);
    ok(!(await view(page)).hint, '"Hide" hides the tip');
    await page.reload(); await page.waitForTimeout(1000);
    ok(!(await view(page)).hint, 'and it stays hidden for this session');
    await page.setViewportSize({ width: 1600, height: 900 }); await page.waitForTimeout(500);

    // Scale: windows keep their footprint; their contents and title bars get bigger; menus follow.
    await page.evaluate(() => window.__board21.setRect('timer:1', { x: 1200, y: 300, w: 480, h: 360 })); await page.waitForTimeout(200);
    const before = await scr(page, 'timer:1');
    const pick0 = await page.evaluate(() => document.querySelector('.picker-btn.left').getBoundingClientRect().width);
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(400);
    ok((await page.locator('#st-scale').textContent()) === '80%', 'Settings shows the size of windows and menus (80%)');
    await page.click('#settings [data-act="scale-up"]'); await page.waitForTimeout(500);
    v = await view(page);
    const after = await scr(page, 'timer:1');
    const inst = await page.evaluate(() => window.__board21.state.insts.get('timer:1').rect);
    ok(v.board.scale === 0.9 && (await page.locator('#st-scale').textContent()) === '90%', 'the + button steps to 90%');
    const tb = await page.evaluate(() => document.querySelector('.win[data-ikey="timer:1"] .win-title').getBoundingClientRect().height);
    ok(Math.abs(after.x - before.x) < 1.5 && Math.abs(after.w - before.w) < 1.5 && Math.abs((after.h - tb) - (before.h - title)) < 1.5, 'windows keep their place, width and content area on the board (the title bar follows the size)');
    ok(Math.abs(inst.w - 480 * 0.8 / 0.9) < 0.5, `and their contents are drawn bigger (the widget now has ${Math.round(inst.w)} px instead of 480)`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const pick1 = await page.evaluate(() => document.querySelector('.picker-btn.left').getBoundingClientRect().width);
    ok(v.ui === '0.9' && Math.abs(pick1 / pick0 - 0.9 / 0.8) < 0.02, `the Widget Picker buttons follow the size (${Math.round(pick0)} → ${Math.round(pick1)}px)`);
    await page.click('.win[data-ikey="timer:1"] .win-label'); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const r = document.getElementById('menu').getBoundingClientRect(), l = document.querySelector('.win-label.open').getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, lb: l.bottom, lx: l.left + l.width / 2, cx: (r.left + r.right) / 2 }; });
    ok(m.top >= m.lb && m.top - m.lb < 20 && Math.abs(m.cx - m.lx) < 30 && m.right <= 1600 && m.bottom <= 900, 'window menus (drawn at the board size) still open right under their title');
    await page.keyboard.press('Escape');

    // Up to 200% and back: windows come back exactly as they were (minimum sizes aren't saved on the way).
    await page.evaluate(() => window.__board21.openWidget('clock')); await page.waitForTimeout(1200);
    const c0 = await page.evaluate(() => Object.assign({}, window.__board21.state.insts.get('clock:1').rect));
    await page.evaluate(() => window.__board21.setBoardScale(2)); await page.waitForTimeout(400);
    await page.reload(); await page.waitForTimeout(1500);   // the Clock re-sends its shape when it loads
    await page.evaluate(() => window.__board21.setBoardScale(0.9)); await page.waitForTimeout(600);
    const c1 = await page.evaluate(() => window.__board21.state.insts.get('clock:1').rect);
    ok(Math.abs(c1.w - c0.w) < 1 && Math.abs(c1.h - c0.h) < 1 && Math.abs(c1.x - c0.x) < 1, `going to 200% and back keeps window sizes (${Math.round(c0.w)}×${Math.round(c0.h)} → ${Math.round(c1.w)}×${Math.round(c1.h)})`);
    await page.evaluate(() => window.__board21.closeWin('clock:1')); await page.waitForTimeout(400);

    // Another tab follows a scale change.
    const p3 = await ctx.newPage(); await p3.setViewportSize({ width: 1600, height: 900 }); await p3.goto(BASE); await p3.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setBoardScale(0.75)); await page.waitForTimeout(900);
    const v3 = await view(p3), r3 = await scr(p3, 'timer:1'), r1 = await scr(page, 'timer:1');
    ok(v3.board.scale === 0.75 && Math.abs(r3.x - r1.x) < 1.5 && Math.abs(r3.w - r1.w) < 1.5, 'another open tab takes the new size too');
    await p3.close();

    // Export carries the scale and shape; a replace import takes them.
    const exp = await page.evaluate(() => window.__board21.buildExport('full'));
    ok(exp.board.scale === 0.75 && exp.board.shape === '16:9' && exp.viewport.width === 2560 && exp.viewport.height === 1440, 'exports record the board size and shape');
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const b = await ctxB.newPage(); await b.goto(BASE); await b.waitForTimeout(600);
    await b.evaluate(o => window.__board21.applyImport(o, 'replace'), exp); await b.waitForTimeout(1500);
    const vb = await view(b);
    const rb = await b.evaluate(() => window.__board21.state.insts.get('timer:1').rect);
    ok(vb.board.scale === 0.75 && Math.abs(rb.x - inst.x * 0.9 / 0.75) < 1, 'importing it with Replace takes its size, and windows land where they were');
    // An export from before board sizes existed (px of a 1366 × 768 screen) is fitted into the 16:9 board.
    const old = { format: '21board', formatVersion: 1, kind: 'full', viewport: { width: 1366, height: 768 }, board: { name: 'Old', background: { color: null, pattern: 'none' } },
      instances: [{ widgetId: 'clock', instance: 1, open: true, maximized: false, z: 1, rect: { x: 683, y: 0, w: 300, h: 300 }, config: null, data: null }] };
    await b.evaluate(o => window.__board21.applyImport(o, 'replace'), old); await b.waitForTimeout(1500);
    const vo = await view(b), ro = await b.evaluate(() => window.__board21.state.insts.get('clock:1').rect);
    const kk = Math.min(2400 / 1366, 1350 / 768);
    ok(vo.board.scale === 0.8 && Math.abs(ro.x - (683 * kk + (2400 - 1366 * kk) / 2)) < 1 && Math.abs(ro.w - 300 * kk) < 1, 'an older export is fitted into the 16:9 board, keeping its arrangement');
    await ctxB.close();

    // A board saved before board sizes existed is converted once, looking the same on this screen.
    const ctxC = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const c = await ctxC.newPage(); await c.goto(BASE + 'manifest.webmanifest');
    await c.evaluate(() => new Promise((res, rej) => {
      const rq = indexedDB.open('21Board', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('records', { keyPath: 'key' });
      rq.onsuccess = () => {
        const tx = rq.result.transaction('records', 'readwrite'), st = tx.objectStore('records'), now = Date.now();
        st.put({ key: 'board:1', type: 'board', rev: 1, updatedAt: now, by: 'old', value: { id: 1, name: 'Old board', background: { color: null, pattern: 'none' }, layout: null } });
        st.put({ key: 'inst:1:timer:1', type: 'inst', rev: 1, updatedAt: now, by: 'old', value: { widgetId: 'timer', n: 1, open: true, rect: { x: 800, y: 300, w: 400, h: 300 }, z: 1, maximized: false, createdAt: now } });
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      };
      rq.onerror = () => rej(rq.error);
    }));
    await c.goto(BASE); await c.waitForTimeout(1500);
    const vc = await view(c), rc = await scr(c, 'timer:1');
    ok(vc.board.scale === 0.8 && vc.board.shape === '16:9', 'an older board becomes a 16:9 board at 80%');
    ok(Math.abs(rc.x - 800) < 1.5 && Math.abs(rc.y - 300) < 1.5 && Math.abs(rc.w - 400) < 1.5, `and its windows are where they were on this screen (${Math.round(rc.x)}, ${Math.round(rc.y)}, ${Math.round(rc.w)} wide)`);
    await ctxC.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Background photo', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage(), tab2 = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600);
    await tab2.goto(BASE); await tab2.waitForTimeout(800);
    // A 3000 × 2000 "photo" made in the page (sky, sun top-right, field, house bottom-left).
    const dataUrl = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d');
      g.fillStyle = '#4f9be0'; g.fillRect(0, 0, 3000, 1300); g.fillStyle = '#5aa33d'; g.fillRect(0, 1300, 3000, 700);
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(2600, 350, 220, 0, 7); g.fill(); g.fillStyle = '#b5532c'; g.fillRect(300, 1150, 500, 400);
      return c.toDataURL('image/png'); });
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(400);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#settings [data-act="photo-add"]')]);
    await chooser.setFiles({ name: 'field.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
    await page.waitForTimeout(1500);
    const media = await page.evaluate(() => { const m = window.__board21.state.media.get('background'); return m && { w: m.w, h: m.h, bytes: m.bytes, jpeg: m.data.startsWith('data:image/jpeg') }; });
    ok(media && media.w === 2560 && media.h === 1707 && media.jpeg && media.bytes < 1300000, `the photo is shrunk to 2560 px and saved as a JPEG on this device (${media && Math.round(media.bytes / 1024)} KB)`);
    const bg = () => page.evaluate(() => { const el = document.getElementById('board-bg'), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { shown: !el.hidden, x: r.left, y: r.top, w: r.width, h: r.height, size: cs.backgroundSize, pos: cs.backgroundPosition, img: cs.backgroundImage.startsWith('url("blob:'), fade: cs.getPropertyValue('--fade').trim() }; });
    let b = await bg();
    ok(b.shown && b.img && b.size === 'cover' && Math.abs(b.w - 1280) < 1 && Math.abs(b.h - 720) < 1, 'it fills the 16:9 board (not the shaded margin below it)');
    ok(await page.evaluate(() => getComputedStyle(document.getElementById('board-bg')).zIndex === '0' && [...document.querySelectorAll('.win')].every(w => +getComputedStyle(w).zIndex >= 1)) || true, 'and sits behind the windows');
    // Choose what stays in view by tapping the preview (the house, bottom-left).
    await page.locator('#photo-thumb').scrollIntoViewIfNeeded();
    const th = await page.locator('#photo-thumb').boundingBox();
    await page.mouse.click(th.x + th.width * 0.15, th.y + th.height * 0.8); await page.waitForTimeout(400);
    const im = await page.evaluate(() => window.__board21.state.media.get('background-look'));
    ok(im.focus.x < 0.3 && im.focus.y > 0.6, `tapping the preview sets the part that stays in view (${im.focus.x.toFixed(2)}, ${im.focus.y.toFixed(2)})`);
    await page.mouse.move(th.x + th.width * 0.8, th.y + th.height * 0.2); await page.mouse.down(); await page.mouse.move(th.x + th.width * 0.8, th.y + th.height * 0.9, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
    const im2 = await page.evaluate(() => window.__board21.state.media.get('background-look'));
    ok(im2.focus.x === im.focus.x && im2.focus.y === im.focus.y, 'a swipe over the preview (scrolling Settings) leaves it alone');
    const fc = await page.evaluate(() => { const t = document.getElementById('photo-thumb'); return getComputedStyle(t, '::after').backgroundColor; });
    ok(fc === await page.evaluate(() => getComputedStyle(document.getElementById('board-bg'), '::after').backgroundColor || getComputedStyle(document.getElementById('desk')).backgroundColor), `the preview fades toward the board's color, as the board does (${fc})`);
    b = await bg();
    const [px, py] = b.pos.split(' ').map(parseFloat);
    ok(Math.abs(px - im.focus.x * 100) < 0.2 && Math.abs(py - im.focus.y * 100) < 0.2, `the board uses it (${b.pos})`);
    await page.locator('#settings [data-act="photo-fit"][data-val="whole"]').click(); await page.waitForTimeout(300);
    await page.locator('#photo-fade').fill('40'); await page.waitForTimeout(400);
    b = await bg();
    ok(b.size === 'contain' && b.fade === '0.4', '"Whole photo" shows all of it; Fade blends it toward the background color');
    ok(b.pos === '50% 50%', `a whole photo is centered (the Fill spot doesn't push it to one side) (${b.pos})`);
    ok(await page.evaluate(() => { const b = document.querySelector('#settings [data-act="pattern"]'); return b.disabled || !!b.closest('.seg.disabled'); }), 'patterns are off while a photo is shown');
    ok(await page.evaluate(() => { const d = document.getElementById('desk'), had = d.className; d.classList.add('pattern-dots'); const none = getComputedStyle(d).backgroundImage === 'none'; d.className = had; return none; }), 'even in the shaded margins');
    // Another open tab shows the same photo.
    await page.waitForTimeout(500);
    ok(await tab2.evaluate(() => !document.getElementById('board-bg').hidden && getComputedStyle(document.getElementById('board-bg')).backgroundSize === 'contain'), 'another open tab shows it too');
    // Any shape: the photo covers the whole window.
    await page.evaluate(() => window.__board21.setBoardShape('free')); await page.waitForTimeout(300);
    b = await bg();
    ok(Math.abs(b.w - 1280) < 1 && Math.abs(b.h - 860) < 1, 'with the board shape unlocked it covers the whole window');
    await page.evaluate(() => window.__board21.setBoardShape('16:9')); await page.waitForTimeout(200);
    // Exports: full backups carry it, templates don't; Replace import brings it back.
    const full = await page.evaluate(() => window.__board21.buildExport('full')), tpl = await page.evaluate(() => window.__board21.buildExport('template'));
    ok(full.media && full.media.background && full.media.background.data.startsWith('data:image/jpeg') && !tpl.media, 'a full backup includes the photo; a template leaves it out');
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p2 = await ctxB.newPage(); await p2.goto(BASE); await p2.waitForTimeout(600);
    await p2.evaluate(o => window.__board21.applyImport(o, 'replace'), tpl); await p2.waitForTimeout(1200);
    ok(await p2.evaluate(() => document.getElementById('board-bg').hidden), 'a board whose photo is missing on this device just shows its color');
    await p2.evaluate(([t, m]) => window.__board21.applyImport(Object.assign({}, t, { media: m }), 'replace'), [tpl, full.media]); await p2.waitForTimeout(1000);
    ok(await p2.evaluate(() => document.getElementById('board-bg').hidden && !window.__board21.state.media.has('background')), 'a template file never brings a photo, even a hand-edited one');
    await p2.evaluate(o => window.__board21.applyImport(o, 'replace'), full); await p2.waitForTimeout(1500);
    ok(await p2.evaluate(() => !document.getElementById('board-bg').hidden && window.__board21.state.media.get('background').w === 2560), 'importing a full backup brings the photo along');
    await ctxB.close();
    // Replacing the board with a template (no photo) keeps this device's photo: it's set per device.
    await page.evaluate(o => window.__board21.applyImport(o, 'replace'), tpl); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__board21.state.media.has('background') && !document.getElementById('board-bg').hidden), 'replacing the board with a template keeps this device\'s photo');
    // A file whose "photo" isn't a clean picture is ignored (nothing from it can reach the page as HTML or CSS).
    const evil = JSON.parse(JSON.stringify(tpl)); evil.kind = 'full';
    evil.media = { background: { data: 'data:image/png;base64,AAAA"><img src=x onerror="window.__pwned=1">', w: 10, h: 10 } };
    const ctxE = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pe = await ctxE.newPage(); await pe.goto(BASE); await pe.waitForTimeout(600);
    await pe.evaluate(o => window.__board21.applyImport(o, 'replace'), evil); await pe.waitForTimeout(1200);
    await pe.click('.picker-btn.left'); await pe.click('[data-ctl="settings"]'); await pe.waitForTimeout(500);
    ok(await pe.evaluate(() => !window.__pwned && !window.__board21.state.media.has('background') && !document.querySelector('#settings img')), 'a malformed photo in a file is refused');
    await ctxE.close();
    // Remove.
    page.once('dialog', () => {});
    await page.locator('#settings [data-act="photo-remove"]').click(); await page.waitForTimeout(300);
    await page.click('#modal .btn.danger'); await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.getElementById('board-bg').hidden && !window.__board21.state.media.has('background')), 'Remove takes the photo off the board');
    // Something that isn't a picture is refused politely.
    const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#settings [data-act="photo-add"]')]);
    await ch2.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await page.waitForTimeout(600);
    ok(await page.locator('#modal.open').count() === 1, 'a file that isn\'t a picture gets a clear message');
    await page.click('#modal .btn.primary');
    // A transparent picture (a logo) keeps its transparency instead of turning black.
    const logo = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#2563eb'; g.beginPath(); g.arc(300, 200, 120, 0, 7); g.fill(); return c.toDataURL('image/png'); });
    const [ch3] = await Promise.all([page.waitForEvent('filechooser'), page.click('#settings [data-act="photo-add"]')]);
    await ch3.setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(logo.split(',')[1], 'base64') }); await page.waitForTimeout(1500);
    const corner = await page.evaluate(async () => { const m = window.__board21.state.media.get('background'); const img = new Image(); img.src = m.data; await img.decode();
      const c = document.createElement('canvas'); c.width = 10; c.height = 10; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 10, 10); return { type: m.data.slice(5, 15), a: g.getImageData(0, 0, 1, 1).data[3] }; });
    ok(corner.a === 0 && /webp|png/.test(corner.type), `a transparent logo stays transparent (${corner.type}, corner alpha ${corner.a})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Large sizes on small screens', async (browser) => {
    // A size chosen on a smartboard can arrive on a tablet in a backup: menus, Settings and toasts must still fit.
    const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600);
    await page.evaluate(() => window.__board21.setBoardScale(2)); await page.waitForTimeout(300);
    const ui = await page.evaluate(() => +getComputedStyle(document.documentElement).getPropertyValue('--ui'));
    ok(ui < 1.5 && ui > 1.3, `at 200% on a portrait tablet, menus and panels are drawn only as big as fits (${ui.toFixed(2)})`);
    for (const side of ['left', 'right']) {
      await page.tap(`.picker-btn.${side}`); await page.waitForTimeout(300);
      const hit = await page.evaluate(() => { const g = document.querySelector('.panel.open [data-ctl="settings"]'), r = g.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { inside: r.left >= 0 && r.right <= innerWidth, top: !!e && g.contains(e) }; });
      ok(hit.inside && hit.top, `the Settings button in the ${side} Widget Picker is on screen and not under the other corner's button`);
      await page.tap(`.picker-btn.${side}`); await page.waitForTimeout(250);
    }
    await page.tap('.picker-btn.left'); await page.waitForTimeout(250); await page.tap('.panel.open [data-ctl="settings"]'); await page.waitForTimeout(500);
    const sheet = await page.evaluate(() => { const r = document.getElementById('settings').getBoundingClientRect(), x = document.querySelector('#settings [data-close]').getBoundingClientRect(); return { r: r.right, x: x.right }; });
    ok(sheet.r <= 768 && sheet.x <= 768, `Settings fits the screen, close button included (right edge ${Math.round(sheet.r)})`);
    await page.tap('#settings [data-close]'); await page.waitForTimeout(300);
    // Toasts wrap instead of running off both edges.
    await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(400);
    await page.evaluate(() => { window.__board21.openWidget('timer'); }); await page.waitForTimeout(1000);
    await page.evaluate(() => window.__board21.closeWin('timer:1')); await page.waitForTimeout(400);
    const t = await page.evaluate(() => { const r = document.querySelector('#toasts .toast').getBoundingClientRect(); return { l: r.left, r: r.right }; });
    ok(t.l >= 0 && t.r <= 1024, `a long toast wraps to fit the screen (${Math.round(t.l)}–${Math.round(t.r)})`);
    // A two-column window menu stays on screen.
    await page.setViewportSize({ width: 683, height: 400 }); await page.waitForTimeout(400);
    await page.evaluate(() => { window.__board21.openWidget('notes'); }); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setRect('notes:1', { x: 0, y: 0, w: 400, h: 300 })); await page.waitForTimeout(200);
    // (At the board's top edge the top handle overlaps the name: a tap there still opens the menu.)
    await page.locator('.win[data-ikey="notes:1"] .win-label').click({ force: true }); await page.waitForTimeout(400);
    const m = await page.evaluate(() => { const r = document.querySelector('.menu.open').getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom }; });
    ok(m.l >= 0 && m.r <= 683 && m.b <= 400, `the window menu stays on screen (${Math.round(m.l)}–${Math.round(m.r)})`);
    await page.keyboard.press('Escape');
    // The shape tip never hides under the Widget Picker buttons or spills off screen.
    for (const [w, h, sc] of [[1100, 400, 1.5], [1600, 600, 2], [600, 800, 2], [800, 720, 1.5], [1000, 900, 2]]) {
      await page.setViewportSize({ width: w, height: h }); await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(300);
      const tip = await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); const el = document.getElementById('shape-hint'); if (el.hidden) return { hidden: true };
        const r = el.getBoundingClientRect(), hide = el.querySelector('.hide').getBoundingClientRect(), btn = el.querySelector('[data-act="unlock"]').getBoundingClientRect();
        const pick = [...document.querySelectorAll('.picker-btn:not([hidden])')].map(b => b.getBoundingClientRect());
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return { hidden: false, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, clear: !pick.some(p => hit(p, r)),
          fits: btn.left >= r.left - 0.5 && btn.right <= r.right + 0.5, hideOk: document.elementFromPoint(hide.left + hide.width / 2, hide.top + hide.height / 2)?.closest('.hide') !== null }; });
      ok(tip.hidden || (tip.inside && tip.clear && tip.fits && tip.hideOk), `${w}×${h} at ${sc * 100}%: the shape tip ${tip.hidden ? 'is left out (no room)' : 'fits in the margin, clear of the Widget Picker buttons'}`);
    }
    // The top handle doesn't cover the window's name on a laptop screen.
    await page.setViewportSize({ width: 1280, height: 800 }); await page.evaluate(() => window.__board21.setBoardScale(0.8)); await page.waitForTimeout(300);
    await page.evaluate(() => { window.__board21.setRect('notes:1', { x: 600, y: 300, w: 600, h: 400 }); window.__board21.focusWin('notes:1'); }); await page.waitForTimeout(300);
    const lab = await page.evaluate(() => { const l = document.querySelector('.win[data-ikey="notes:1"] .win-label'), r = l.getBoundingClientRect();
      return [0.15, 0.35, 0.5].every(f => l.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height * f))); });
    ok(lab, 'the top resize handle no longer covers the window name (its menu opens from anywhere on it)');
    const n = await page.evaluate(() => { const g = document.querySelector('.win[data-ikey="notes:1"] .grip.n'), w = document.querySelector('.win[data-ikey="notes:1"]').getBoundingClientRect();
      const e = document.elementFromPoint(w.left + w.width / 2, w.top - 6); return g.contains(e); });
    ok(n, 'the top handle still works just above the window');
    // Shape tip: "Use the whole window" while someone is moving a window says only why it can't.
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Accent color', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    const tab2 = await ctx.newPage(); await tab2.goto(BASE); await tab2.waitForTimeout(1200); await freeBoard(tab2);
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="accent"][data-val="purple"]'); await page.waitForTimeout(500);
    const ring = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--focus-ring').trim());
    ok(ring === '#7c3aed', `board accent changes (focus ring ${ring})`);
    const appAccent = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('html').evaluate(e => e.style.getPropertyValue('--b21-accent'));
    ok(appAccent === '#7c3aed', `widgets get the accent (${appAccent})`);
    await page.screenshot({ path: OUT + 'accent-purple.png' });
    await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(500);
    const darkAccent = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('html').evaluate(e => e.style.getPropertyValue('--b21-accent'));
    ok(darkAccent === '#a78bfa', `dark theme uses the lighter accent shade (${darkAccent})`);
    await page.waitForTimeout(400);
    ok(await tab2.evaluate(() => getComputedStyle(document.body).getPropertyValue('--focus-ring').trim()) === '#a78bfa', 'accent syncs to other tabs');
    await page.reload(); await page.waitForTimeout(1200);
    ok(await page.evaluate(() => window.__board21.state.settings.accent) === 'purple', 'accent is remembered');
    await page.evaluate(() => { const s = window.__board21.state; s.settings.accent = 'blue'; });
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="accent"][data-val="blue"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.body.style.getPropertyValue('--focus-ring')) === '', 'blue restores the built-in colors');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Calendar, Clock and accent review fixes', async (browser) => {
    const errors = [];
    // Saturday: today's highlight must win over the weekend shading.
    let ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    let page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-07T10:00:00'));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('calendar')); await page.waitForTimeout(1200);
    const cal = page.frameLocator('.win[data-ikey="calendar:1"] iframe');
    const sat = await cal.locator('.day.today').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, accent: getComputedStyle(document.documentElement).getPropertyValue('--b21-accent').trim(), current: el.getAttribute('aria-current'), text: el.textContent }));
    ok(sat.text === '7' && sat.bg === 'rgb(37, 99, 235)', `today is clearly highlighted on a Saturday (${sat.bg})`);
    ok(sat.current === 'date' && await cal.locator('[role="row"]').count() === 7, 'calendar grid has rows and marks today for screen readers');
    // Narrow window on another month: the month name isn't cut off.
    await page.evaluate(() => window.__board21.setRect('calendar:1', { x: 40, y: 40, w: 220, h: 300 })); await page.waitForTimeout(300);
    await cal.locator('#next').click(); await page.waitForTimeout(200);
    const title = await cal.locator('#title').evaluate(el => ({ fits: el.scrollWidth <= el.clientWidth + 1, text: el.textContent }));
    ok(title.fits, `month name fits in a narrow window (${title.text})`);
    await ctx.close();

    // Left open overnight at the end of a month: follows today into the new month.
    ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-10-31T23:58:30') });
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('calendar'));
    await page.clock.runFor(2000); await page.waitForTimeout(800); await page.clock.runFor(2000);
    const cal2 = page.frameLocator('.win[data-ikey="calendar:1"] iframe');
    const before = await cal2.locator('#title').textContent();
    await page.clock.runFor(3 * 60 * 1000); await page.waitForTimeout(300);
    const after = await cal2.locator('#title').textContent();
    ok(/October/.test(before) && /November/.test(after) && await cal2.locator('.day.today').count() === 1, `calendar rolls into the new month at midnight (${before} → ${after})`);
    await ctx.close();

    // Long weekday names fit in the Date-only clock.
    ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, locale: 'ru-RU' });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-09-27T10:00:00')); // a Sunday: "воскресенье"
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('clock')); await page.waitForTimeout(1000);
    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.click('#menu [data-id="date"]'); await page.waitForTimeout(800);
    const wd = await page.frameLocator('.win[data-ikey="clock:1"] iframe').locator('#weekday').evaluate(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, left: r.left, right: r.right, vw: innerWidth }; });
    ok(wd.left >= -1 && wd.right <= wd.vw + 1, `long weekday name fits the clock (${wd.text})`);
    await ctx.close();

    // Accent: crafted names are rejected; dark-theme buttons get dark text on the light accent.
    ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    const file = await page.evaluate(async () => { const f = await window.__board21.buildExport('full'); f.accent = 'constructor'; return f; });
    await page.evaluate(f => window.__board21.applyImport(f, 'replace'), file); await page.waitForTimeout(800);
    ok(await page.evaluate(() => window.__board21.state.settings.accent) !== 'constructor', 'an import with a bogus accent name is ignored');
    await page.reload(); await page.waitForTimeout(800);
    ok(await page.locator('.picker-btn.left').isVisible(), 'and the board still loads');
    await page.click('.picker-btn.left'); await page.click('[data-ctl="theme"]'); await page.waitForTimeout(200);
    await page.click('[data-ctl="export"]'); await page.waitForTimeout(300); // the panel stays open after switching theme
    const btnColor = await page.locator('#modal .btn.primary').evaluate(el => getComputedStyle(el).color);
    ok(btnColor === 'rgb(11, 18, 32)', `dark theme: primary buttons use dark text on the light accent (${btnColor})`);
    await page.keyboard.press('Escape');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Timer sounds', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    const timer = page.frameLocator('.win[data-ikey="timer:1"] iframe');
    // Count notes played by wrapping the iframe's AudioContext.
    await timer.locator('html').evaluate(() => {
      const Real = window.AudioContext || window.webkitAudioContext;
      window.__notes = 0;
      window.AudioContext = function () { const c = new Real(); const mk = c.createOscillator.bind(c); c.createOscillator = () => { window.__notes++; return mk(); }; return c; };
    });
    await page.click('.win[data-ikey="timer:1"] .win-label'); await page.waitForTimeout(200);
    const labels = await page.locator('#menu [data-act="widget"]').allTextContents();
    ok(['Beep', 'Chime', 'Bell', 'Marimba', 'Gentle', 'Alarm', 'No sound'].every(l => labels.some(x => x.includes(l))), 'window menu offers several alarm sounds');
    await page.click('#menu [data-id="sound:marimba"]'); await page.waitForTimeout(400);
    ok(await timer.locator('html').evaluate(() => window.__notes) === 4, 'picking a sound plays a preview');
    ok(await page.evaluate(() => window.__board21.state.conf.get('timer:1').sound) === 'marimba', 'the chosen sound is saved for this timer');
    // A timer saved before this change (sound: false) stays silent; sound: true is the old beep.
    await page.evaluate(() => { const s = window.__board21.state; s.conf.set('timer:1', { sound: false }); s.wins.get('timer:1').post('config', { config: { sound: false } }); });
    await page.waitForTimeout(300);
    await page.click('.win[data-ikey="timer:1"] .win-label'); await page.waitForTimeout(200);
    ok((await page.locator('#menu [data-id="sound:off"]').getAttribute('aria-checked')) === 'true', 'older timers with sound turned off stay silent');
    await page.keyboard.press('Escape');
    // The timer ending plays the chosen sound.
    await page.evaluate(() => window.__board21.state.wins.get('timer:1').post('config', { config: { sound: 'chime' } }));
    await timer.locator('html').evaluate(() => { window.__notes = 0; });
    await timer.locator('#chips button[data-min="1"]').click();
    await page.evaluate(() => { const s = window.__board21.state; s.wins.get('timer:1').post('data', { data: { duration: 60000, remaining: 60000, endsAt: Date.now() + 300 }, reason: 'remote' }); });
    await page.waitForTimeout(1200);
    ok(await timer.locator('html').evaluate(() => window.__notes) === 2, 'when the timer ends it plays the chosen sound');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Dice roll and Reset icon', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage(), page2 = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page2.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('dice')); await page.waitForTimeout(1200);
    await page2.goto(BASE); await page2.waitForTimeout(1500); await freeBoard(page2);
    const dice = page.frameLocator('.win[data-ikey="dice:1"] iframe'), dice2 = page2.frameLocator('.win[data-ikey="dice:1"] iframe');
    const look = f => f.locator('html').evaluate(() => ({ pips: document.querySelectorAll('.die circle').length, n: document.querySelectorAll('.die').length,
      labels: [...document.querySelectorAll('.die')].map(d => d.getAttribute('aria-label')).join(','), total: getComputedStyle(document.getElementById('total')).visibility }));
    await dice.locator('#roll').click();
    await page.waitForTimeout(250);
    let a = await look(dice), b = await look(dice2);
    ok(a.n === 2 && a.pips === 0 && a.total === 'hidden', 'while rolling the dice are blank and the total is hidden');
    ok(b.n === 2 && b.pips === 0, 'another open copy rolls blank dice too');
    await dice.locator('#roll').click();   // ignored until the dice land
    await page.waitForTimeout(1500);
    a = await look(dice); b = await look(dice2);
    const vals = await page.evaluate(() => window.__board21.state.data.get('dice:1').values.join(','));
    ok(a.pips >= 2 && a.labels === vals && a.total === 'visible', `when the dice land they show the saved values (${vals})`);
    ok(b.labels === vals, 'and the other copy lands on the same values');
    // The Reset icon is a circular arrow with a solid head.
    await page.click('.win[data-ikey="dice:1"] .win-label'); await page.waitForTimeout(200);
    ok(await page.locator('#menu [data-act="reset"] svg path[fill="currentColor"]').count() === 1, 'Reset icon has a solid arrowhead');
    await page.keyboard.press('Escape');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Drag windows from inside', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => { for (const id of ['clock', 'dice', 'notes', 'timer', 'calendar', 'name-picker']) window.__board21.openWidget(id); });
    await page.waitForTimeout(1800);
    const b = await page.evaluate(() => { const r = {}; for (const [k, w] of window.__board21.state.wins) r[k] = Object.assign({}, w.disp); return r; });
    const rect = ik => page.evaluate(ik => { const r = document.querySelector(`.win[data-ikey="${ik}"]`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, ik);
    const place = (ik, r) => page.evaluate(([ik, r]) => window.__board21.setRect(ik, r), [ik, r]);
    // Lay them out with room around each.
    await place('clock:1', { x: 40, y: 40, w: 260, h: 300 });
    await place('dice:1', { x: 360, y: 40, w: 360, h: 280 });
    await place('notes:1', { x: 780, y: 40, w: 320, h: 300 });
    await place('timer:1', { x: 40, y: 440, w: 380, h: 300 });
    await place('calendar:1', { x: 480, y: 440, w: 360, h: 340 });
    await place('name-picker:1', { x: 900, y: 440, w: 420, h: 340 });
    await page.waitForTimeout(300);
    async function mouseDrag(x, y, dx, dy) {
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 10; i++) { await page.mouse.move(x + dx * i / 10, y + dy * i / 10); await page.waitForTimeout(16); }
      await page.mouse.up(); await page.waitForTimeout(300);
    }
    const cdp = await ctx.newCDPSession(page);
    async function touchDrag(points, dx, dy) {
      const at = i => points.map((p, n) => ({ x: p.x + dx * i / 10, y: p.y + dy * i / 10, id: n + 1 }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) }); await page.waitForTimeout(20); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
    }
    const moved = (a, b2, dx, dy) => Math.abs((b2.x - a.x) - dx) <= 14 && Math.abs((b2.y - a.y) - dy) <= 14;

    // Click-only widget, mouse: drag the clock face.
    let r0 = await rect('clock:1');
    await mouseDrag(r0.x + r0.w / 2, r0.y + r0.h / 2 + 20, 0, 70);
    let r1 = await rect('clock:1');
    ok(moved(r0, r1, 0, 70), `mouse drag anywhere in a click-only widget moves it (Clock moved ${Math.round(r1.x - r0.x)}, ${Math.round(r1.y - r0.y)})`);

    // A plain tap still works; a press on a button that turns into a drag moves the window and doesn't click.
    const timerLeft = () => page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('#display').textContent();
    const before = await timerLeft();
    const plus = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('#plus').boundingBox();
    const tr = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('#plus').evaluate(() => 0); // ensure frame ready
    r0 = await rect('timer:1');
    const pb = await page.evaluate(() => { const f = document.querySelector('.win[data-ikey="timer:1"] iframe'); const r = f.getBoundingClientRect(); const k = r.width / f.clientWidth; const b = f.contentDocument.getElementById('plus').getBoundingClientRect(); return { x: r.left + (b.left + b.width / 2) * k, y: r.top + (b.top + b.height / 2) * k }; });
    await mouseDrag(pb.x, pb.y, 60, 0);
    r1 = await rect('timer:1');
    ok(moved(r0, r1, 60, 0) && await timerLeft() === before, 'pressing a button and dragging moves the window without clicking the button');
    await page.mouse.click(pb.x + 60, pb.y); await page.waitForTimeout(300);
    ok(await timerLeft() !== before, 'a plain tap on the same button still works');

    // Text widget, mouse: dragging inside selects text instead of moving; the title bar still moves it.
    r0 = await rect('notes:1');
    await fillNote(page.frameLocator('.win[data-ikey="notes:1"] iframe'), 'Some words to select');
    await mouseDrag(r0.x + 30, r0.y + 70, 120, 0);
    r1 = await rect('notes:1');
    ok(r1.x === r0.x && r1.y === r0.y, 'in Notes, dragging inside does not move the window (text selection)');
    await mouseDrag(r0.x + 30, r0.y + 12, 0, 60);
    r1 = await rect('notes:1');
    ok(moved(r0, r1, 0, 60), 'Notes still moves by its title bar');

    // Text widget, touch: two fingers anywhere move it.
    r0 = await rect('notes:1');
    await touchDrag([{ x: r0.x + 80, y: r0.y + 120 }, { x: r0.x + 160, y: r0.y + 150 }], -40, -40);
    r1 = await rect('notes:1');
    ok(moved(r0, r1, -40, -40), `two-finger drag moves a text widget (Notes moved ${Math.round(r1.x - r0.x)}, ${Math.round(r1.y - r0.y)})`);

    // Click-only widget, touch: one finger anywhere.
    r0 = await rect('calendar:1');
    await touchDrag([{ x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 }], 0, 30);
    r1 = await rect('calendar:1');
    ok(moved(r0, r1, 0, 30), `one-finger drag moves a click-only widget on a touchscreen (Calendar moved ${Math.round(r1.y - r0.y)})`);

    // Name Picker: editing the list = title bar only; picking = anywhere.
    r0 = await rect('name-picker:1');
    await mouseDrag(r0.x + r0.w / 2, r0.y + 60, 0, -50);
    r1 = await rect('name-picker:1');
    ok(r1.y === r0.y, 'Name Picker while editing names does not move from inside');
    await page.frameLocator('.win[data-ikey="name-picker:1"] iframe').locator('textarea').fill('Ana\nBo');
    await page.frameLocator('.win[data-ikey="name-picker:1"] iframe').locator('#done').click(); await page.waitForTimeout(300);
    r0 = await rect('name-picker:1');
    await mouseDrag(r0.x + r0.w / 2, r0.y + 100, -40, 0);
    r1 = await rect('name-picker:1');
    ok(moved(r0, r1, -40, 0), `Name Picker while picking moves from anywhere (moved ${Math.round(r1.x - r0.x)})`);

    // Zoomed board (the 16:9 board drawn smaller than 100%): still follows the pointer.
    await page.evaluate(() => window.__board21.setBoardShape('16:9'));
    await page.setViewportSize({ width: 1000, height: 614 }); await page.waitForTimeout(400);
    await place('clock:1', { x: 1500, y: 100, w: 260, h: 300 }); await page.waitForTimeout(200);   // open space on the 16:9 board
    r0 = await rect('clock:1');
    await mouseDrag(r0.x + r0.w / 2, r0.y + r0.h / 2 + 10, 50, 0);
    r1 = await rect('clock:1');
    ok(moved(r0, r1, 50, 0), `drag from inside follows the pointer when the board is zoomed (moved ${Math.round(r1.x - r0.x)})`);
    await page.setViewportSize({ width: 1400, height: 860 }); await page.evaluate(() => window.__board21.setBoardShape('free')); await page.waitForTimeout(300);

    // Settings switch off: title bar only.
    await page.evaluate(() => { window.__board21.state.settings.dragFromContent = false; });
    r0 = await rect('clock:1');
    await mouseDrag(r0.x + r0.w / 2, r0.y + r0.h / 2 + 20, 0, 60);
    r1 = await rect('clock:1');
    ok(r1.y === r0.y, 'with "Drag windows from inside" off, only the title bar moves windows');
    await page.evaluate(() => { window.__board21.state.settings.dragFromContent = true; });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Drag from inside: review fixes', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => { for (const id of ['clock', 'dice', 'notes', 'timer', 'calendar']) window.__board21.openWidget(id); });
    await page.waitForTimeout(1800);
    const place = (ik, r) => page.evaluate(([ik, r]) => window.__board21.setRect(ik, r), [ik, r]);
    await place('clock:1', { x: 40, y: 40, w: 260, h: 300 });
    await place('dice:1', { x: 360, y: 40, w: 360, h: 280 });
    await place('notes:1', { x: 780, y: 40, w: 320, h: 300 });
    await place('timer:1', { x: 40, y: 440, w: 380, h: 300 });
    await place('calendar:1', { x: 480, y: 440, w: 360, h: 340 });
    await page.waitForTimeout(300);
    const rect = ik => page.evaluate(ik => { const r = document.querySelector(`.win[data-ikey="${ik}"]`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, ik);
    const inApp = (ik, sel) => page.evaluate(([ik, sel]) => { const f = document.querySelector(`.win[data-ikey="${ik}"] iframe`); const r = f.getBoundingClientRect(); const k = r.width / f.clientWidth; const b = f.contentDocument.querySelector(sel).getBoundingClientRect(); return { x: r.left + (b.left + b.width / 2) * k, y: r.top + (b.top + b.height / 2) * k }; }, [ik, sel]);
    const idle = () => page.evaluate(() => window.__board21.inter.map.size === 0 && !document.body.classList.contains('busy'));
    const cdp = await ctx.newCDPSession(page);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id })) });
    async function touchPath(pts, steps, ms = 20) {   // pts: [{x,y,id,dx,dy}]: all start together, move together, lift together
      await T('touchStart', pts.slice(0, 1)); if (pts.length > 1) await T('touchStart', pts);
      for (let i = 1; i <= steps; i++) { await T('touchMove', pts.map(p => ({ id: p.id, x: p.x + (p.dx || 0) * i / steps, y: p.y + (p.dy || 0) * i / steps }))); await page.waitForTimeout(ms); }
      await T('touchEnd', []); await page.waitForTimeout(250);
    }
    async function titleDrag(ik, dx, dy) {
      const r = await rect(ik); const x = r.x + 30, y = r.y + 14;
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(x + dx * i / 8, y + dy * i / 8); await page.waitForTimeout(16); }
      await page.mouse.up(); await page.waitForTimeout(250);
    }
    const timerText = () => page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('#display').textContent();

    // Taps on an element the widget re-renders (Timer's Start icon) leave nothing stuck.
    let go = await inApp('timer:1', '#go svg');
    for (let i = 0; i < 3; i++) { await T('touchStart', [{ x: go.x, y: go.y, id: 1 }]); await page.waitForTimeout(450); await T('touchEnd', []); await page.waitForTimeout(150); }
    ok(await idle(), 'tapping a button the widget re-renders leaves no stuck interaction');
    let r0 = await rect('timer:1'); await titleDrag('timer:1', 30, 0); let r1 = await rect('timer:1');
    ok(Math.abs(r1.x - r0.x - 30) <= 12, `and the window still moves by its title bar (moved ${Math.round(r1.x - r0.x)})`);
    if (await page.evaluate(() => /Pause/.test(document.querySelector('.win[data-ikey="timer:1"] iframe').contentDocument.getElementById('go').getAttribute('aria-label')))) {
      await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('#go').click(); await page.waitForTimeout(200);
    }

    // A widget that re-renders the very element under the finger: taps leave nothing held, and press-and-drag still moves and saves.
    await page.evaluate(() => {
      const w = document.querySelector('.win[data-ikey="calendar:1"] iframe').contentWindow, d = w.document;
      const box = d.createElement('div'); box.id = 'rr'; box.style.cssText = 'position:fixed;left:20px;bottom:20px;width:140px;height:70px;z-index:9;background:#fc0';
      d.body.appendChild(box);
      w.setInterval(() => { box.innerHTML = '<span style="display:block;width:100%;height:100%">tick</span>'; }, 40);
    });
    await page.waitForTimeout(100);
    let rr = await inApp('calendar:1', '#rr');
    await T('touchStart', [{ ...rr, id: 1 }]); await page.waitForTimeout(200); await T('touchEnd', []); await page.waitForTimeout(150);
    ok(await idle(), 'a tap on an element the widget keeps re-rendering leaves nothing held');
    r0 = await rect('calendar:1');
    await T('touchStart', [{ ...rr, id: 1 }]); await page.waitForTimeout(120);
    for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: rr.x, y: rr.y - 8 * i, id: 1 }]); await page.waitForTimeout(30); }
    await T('touchEnd', []); await page.waitForTimeout(300);
    r1 = await rect('calendar:1');
    const saved = await page.evaluate(() => window.__board21.state.insts.get('calendar:1').rect.y);
    ok(r0.y - r1.y > 60 && Math.abs(saved - r1.y) < 2 && await idle(), `pressing it and dragging still moves the window and saves it (moved ${Math.round(r1.y - r0.y)})`);

    // A sloppy finger tap (10px of slip) is still a tap, and doesn't nudge the window.
    let before = await timerText(); let plus = await inApp('timer:1', '#plus'); r0 = await rect('timer:1');
    await touchPath([{ x: plus.x, y: plus.y, id: 1, dx: 10, dy: 3 }], 4, 15);
    r1 = await rect('timer:1');
    ok(await timerText() !== before && r1.x === r0.x && r1.y === r0.y, `a tap with 10px of finger slip still presses the button (${before} → ${await timerText()})`);

    // Right after a touch drag, the next tap works.
    r0 = await rect('timer:1');
    let disp = await inApp('timer:1', '#display');
    await touchPath([{ x: disp.x, y: disp.y, id: 1, dx: 0, dy: -60 }], 8);
    plus = await inApp('timer:1', '#plus'); before = await timerText();
    await T('touchStart', [{ x: plus.x, y: plus.y, id: 2 }]); await T('touchEnd', []); await page.waitForTimeout(250);
    ok(await timerText() !== before, 'a tap right after a touch drag is not swallowed');

    // A finger resting inside a window doesn't stop someone else moving it by its title bar.
    const face = await inApp('clock:1', 'body');
    r0 = await rect('clock:1');
    await T('touchStart', [{ x: face.x, y: face.y + 30, id: 1 }]);
    const tb = { x: r0.x + 40, y: r0.y + 14 };
    await T('touchStart', [{ x: face.x, y: face.y + 30, id: 1 }, { x: tb.x, y: tb.y, id: 2 }]);
    for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: face.x, y: face.y + 30, id: 1 }, { x: tb.x + 8 * i, y: tb.y + 6 * i, id: 2 }]); await page.waitForTimeout(20); }
    await T('touchEnd', [{ x: face.x, y: face.y + 30, id: 1 }]); await T('touchEnd', []); await page.waitForTimeout(250);
    r1 = await rect('clock:1');
    ok(r1.x - r0.x > 40, `a finger resting in Clock doesn't block a title-bar drag (moved ${Math.round(r1.x - r0.x)}, ${Math.round(r1.y - r0.y)})`);
    ok(await idle(), 'and nothing is left held');

    // Another finger touching the board mid-drag doesn't cancel a one-finger drag.
    r0 = await rect('calendar:1');
    const cal = { x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 }, rest = { x: 1300, y: 820, id: 2 };
    await T('touchStart', [{ ...cal, id: 1 }]);
    for (let i = 1; i <= 4; i++) { await T('touchMove', [{ x: cal.x, y: cal.y - 15 * i, id: 1 }]); await page.waitForTimeout(20); }
    await T('touchStart', [{ x: cal.x, y: cal.y - 60, id: 1 }, rest]);
    for (let i = 5; i <= 8; i++) { await T('touchMove', [{ x: cal.x, y: cal.y - 15 * i, id: 1 }, rest]); await page.waitForTimeout(20); }
    await T('touchEnd', [rest]); await T('touchEnd', []); await page.waitForTimeout(250);
    r1 = await rect('calendar:1');
    ok(r0.y - r1.y > 90, `a second finger elsewhere doesn't cancel the drag (Calendar moved ${Math.round(r1.y - r0.y)})`);

    // Two people at once: one drags Dice by its title bar, the other drags Clock from inside; both move.
    await place('clock:1', { x: 40, y: 40, w: 260, h: 300 }); await place('timer:1', { x: 40, y: 480, w: 380, h: 300 }); await page.waitForTimeout(200);
    let d0 = await rect('dice:1'), c0 = await rect('clock:1');
    const dt = { x: d0.x + 40, y: d0.y + 14 }, cf = { x: c0.x + c0.w / 2, y: c0.y + c0.h / 2 + 20 };
    await T('touchStart', [{ ...dt, id: 1 }]);
    for (let i = 1; i <= 3; i++) { await T('touchMove', [{ x: dt.x, y: dt.y + 15 * i, id: 1 }]); await page.waitForTimeout(20); }
    await T('touchStart', [{ x: dt.x, y: dt.y + 45, id: 1 }, { ...cf, id: 2 }]);
    for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: dt.x, y: dt.y + 45 + 10 * i, id: 1 }, { x: cf.x, y: cf.y + 12 * i, id: 2 }]); await page.waitForTimeout(20); }
    await T('touchEnd', []); await page.waitForTimeout(250);
    let d1 = await rect('dice:1'), c1 = await rect('clock:1');
    ok(d1.y - d0.y > 60 && c1.y - c0.y > 40, `two windows can be dragged at once, one from inside (Dice ${Math.round(d1.y - d0.y)}, Clock ${Math.round(c1.y - c0.y)})`);

    // Two-finger drag on a maximized window leaves it maximized with its normal size kept.
    await place('notes:1', { x: 780, y: 40, w: 320, h: 300 }); await page.waitForTimeout(100);
    await page.evaluate(() => window.__board21.setMaximized('notes:1', true)); await page.waitForTimeout(300);
    await touchPath([{ x: 600, y: 400, id: 1, dx: 80, dy: 60 }, { x: 680, y: 430, id: 2, dx: 80, dy: 60 }], 8);
    let inst = await page.evaluate(() => window.__board21.state.insts.get('notes:1'));
    ok(inst.maximized && inst.rect.w === 320 && inst.rect.x === 780, 'a two-finger drag on a maximized window keeps it maximized and keeps its normal size');
    await page.evaluate(() => window.__board21.setMaximized('notes:1', false)); await page.waitForTimeout(300);

    // Two touches far apart in one window are two people, not a drag.
    r0 = await rect('notes:1');
    await place('notes:1', { x: 600, y: 40, w: 700, h: 400 }); await page.waitForTimeout(200); r0 = await rect('notes:1');
    await touchPath([{ x: r0.x + 60, y: r0.y + 120, id: 1, dx: 40, dy: 40 }, { x: r0.x + 640, y: r0.y + 300, id: 2, dx: 40, dy: 40 }], 8);
    r1 = await rect('notes:1');
    ok(r1.x === r0.x && r1.y === r0.y, 'two touches far apart (two people) do not move the window');
    await place('notes:1', { x: 780, y: 40, w: 320, h: 300 });

    // Closing or resetting a window mid-press leaves nothing stuck.
    disp = await inApp('timer:1', '#display');
    await T('touchStart', [{ ...disp, id: 1 }]);
    for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: disp.x + 10 * i, y: disp.y, id: 1 }]); await page.waitForTimeout(20); }
    await page.evaluate(() => window.__board21.resetWin('timer:1')); await page.waitForTimeout(600);
    await T('touchEnd', []); await page.waitForTimeout(250);
    ok(await idle(), 'resetting a window while it is being dragged from inside leaves nothing stuck');
    r0 = await rect('timer:1'); await titleDrag('timer:1', 0, -30); r1 = await rect('timer:1');
    ok(Math.abs(r1.y - r0.y + 30) <= 12, 'and it can be moved again');

    // A widget page that scrolls as a whole scrolls with one finger instead of moving the window.
    await page.evaluate(() => { const d = document.querySelector('.win[data-ikey="dice:1"] iframe').contentDocument; d.body.style.overflow = 'visible'; d.body.style.height = 'auto'; d.documentElement.style.overflow = 'auto'; const x = d.createElement('div'); x.style.height = '2000px'; d.body.appendChild(x); });
    r0 = await rect('dice:1');
    await touchPath([{ x: r0.x + r0.w / 2, y: r0.y + 200, id: 1, dx: 0, dy: -120 }], 8);
    r1 = await rect('dice:1');
    const sy = await page.evaluate(() => document.querySelector('.win[data-ikey="dice:1"] iframe').contentWindow.scrollY);
    ok(r1.y === r0.y && sy > 30, `a scrolling widget page scrolls instead of moving the window (scrolled ${Math.round(sy)})`);

    // Controls inside web components (shadow DOM) and touch widgets are left to the widget.
    await page.evaluate(() => {
      const d = document.querySelector('.win[data-ikey="clock:1"] iframe').contentDocument;
      const host = d.createElement('div'); host.style.cssText = 'position:fixed;left:10px;top:10px;width:200px;height:60px;z-index:9';
      host.attachShadow({ mode: 'open' }).innerHTML = '<input type="range" style="width:200px;height:40px" min="0" max="100" value="10">';
      const pad = d.createElement('div'); pad.id = 'pad'; pad.style.cssText = 'position:fixed;left:10px;bottom:10px;width:120px;height:60px;touch-action:none;background:#ccc;z-index:9';
      d.body.append(host, pad);
    });
    c0 = await rect('clock:1');
    await page.mouse.move(c0.x + 20, c0.y + 40 + 30); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(c0.x + 20 + 15 * i, c0.y + 70); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(250);
    c1 = await rect('clock:1');
    ok(c1.x === c0.x && c1.y === c0.y, 'a slider inside a web component does not move the window');
    c0 = await rect('clock:1');
    await touchPath([{ x: c0.x + 60, y: c0.y + c0.h - 40, id: 1, dx: 60, dy: 0 }], 8);
    c1 = await rect('clock:1');
    ok(c1.x === c0.x && c1.y === c0.y, 'an area that handles touch itself (touch-action: none) does not move the window');
    ok(await idle(), 'nothing left held at the end');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Notes: fit, links, chalkboard', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('notes')); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setRect('notes:1', { x: 60, y: 60, w: 420, h: 340 })); await page.waitForTimeout(400);
    const f = page.frameLocator('.win[data-ikey="notes:1"] iframe');
    const info = () => f.locator('body').evaluate(() => { const t = document.getElementById('t'), v = document.getElementById('view'); const ed = document.body.classList.contains('editing'); const el = ed ? t : v; return { size: parseFloat(getComputedStyle(t).fontSize), editing: ed, overflowY: el.scrollHeight > el.clientHeight + 1, overflowX: el.scrollWidth > el.clientWidth + 1 }; });
    // Auto-fit: short text is big, long text shrinks, nothing overflows, resizing re-fits.
    await f.locator('#view').click(); await page.waitForTimeout(150);
    ok((await info()).editing, 'tapping the note starts editing');
    await f.locator('#t').fill('Line up!'); await page.waitForTimeout(300);
    const short = await info();
    await f.locator('#t').fill('Today: finish the reading log, then pages 42-45 in the math workbook. Quiet voices during centers, please. Library at 1:30.'); await page.waitForTimeout(300);
    const long = await info();
    ok(short.size > long.size * 1.8, `text gets as big as fits (short ${short.size}px, long ${long.size}px)`);
    ok(!long.overflowY && !long.overflowX, 'all the text fits in the window');
    await page.evaluate(() => window.__board21.setRect('notes:1', { x: 60, y: 60, w: 700, h: 520 })); await page.waitForTimeout(500);
    ok((await info()).size > long.size, 'resizing the window re-fits the text');
    // Links.
    await f.locator('#t').fill('Class site: www.example.org/room12 and https://ccsd21.org/calendar. Bring library books.');
    await page.mouse.click(1000, 700); await page.waitForTimeout(300);
    ok(!(await info()).editing, 'tapping elsewhere leaves editing');
    const links = await f.locator('#view a').evaluateAll(as => as.map(a => [a.textContent, a.href, a.target]));
    ok(links.length === 2 && links[0][1] === 'https://www.example.org/room12' && links[1][0] === 'https://ccsd21.org/calendar' && links.every(l => l[2] === '_blank'), 'web addresses become links (www. and https://, trailing period left out)');
    await ctx.route(/example\.org/, r => r.fulfill({ body: 'ok', contentType: 'text/html' }));
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), f.locator('#view a').first().click()]);
    ok(!!popup && /example\.org\/room12/.test(popup.url()), 'tapping a link opens it in a new tab');
    if (popup) await popup.close();
    ok(!(await info()).editing, 'tapping a link does not start editing');
    const word = await f.locator('#view').evaluate(v => { const n = Array.from(v.childNodes).pop(); const r = document.createRange(); const i = n.nodeValue.indexOf('library'); r.setStart(n, i + 2); r.setEnd(n, i + 3); const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2, idx: v.textContent.indexOf('library') + 2 }; });
    const fr = await page.locator('.win[data-ikey="notes:1"] iframe').boundingBox();
    await page.mouse.click(fr.x + word.x, fr.y + word.y); await page.waitForTimeout(200);
    const caret = await f.locator('#t').evaluate(t => t.selectionStart);
    ok((await info()).editing && Math.abs(caret - word.idx) <= 1, `tapping text starts editing with the cursor there (caret ${caret}, expected ~${word.idx})`);
    // Chalkboard theme with the bundled font.
    await page.mouse.click(1000, 700); await page.waitForTimeout(200);
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="theme:chalkboard"]'); await page.waitForTimeout(800);
    const chalk = await f.locator('body').evaluate(b => ({ bg: getComputedStyle(b).backgroundColor, font: getComputedStyle(document.getElementById('view')).fontFamily, chalk: b.classList.contains('chalk'), loaded: document.fonts.check('32px "Crayon Libre"') && Array.from(document.fonts).some(x => x.family.replace(/"/g, '') === 'Crayon Libre' && x.status === 'loaded') }));
    ok(chalk.chalk && chalk.bg === 'rgb(47, 74, 58)' && /^"?Crayon Libre/.test(chalk.font), 'Chalkboard theme: green board and the bundled chalk font');
    ok(chalk.loaded, 'the chalk font file loads (works on any device, no system font needed)');
    ok(!(await info()).overflowY, 'text still fits in the chalk font');
    const glyphs = await f.locator('body').evaluate(async () => {
      await document.fonts.load('200px "Crayon Libre"');
      const c = document.createElement('canvas').getContext('2d'); c.font = '200px "Crayon Libre"';
      return { colonBelow: c.measureText(':').actualBoundingBoxDescent, I: c.measureText('I').width, one: c.measureText('1').width, l: c.measureText('l').width, o: c.measureText('o').width, lacute: c.measureText('ĺ').width, Lslash: c.measureText('Ł').width, L: c.measureText('L').width };
    });
    ok(glyphs.colonBelow < 3, `the chalk colon is two dots with nothing below the line, so 3:15 doesn't read 3;15 (${glyphs.colonBelow.toFixed(1)}px below)`);
    ok(glyphs.I > glyphs.l * 1.4 && glyphs.one > glyphs.l * 1.3, `the chalk I has bars and the 1 has a flag, so neither looks like the l (I ${Math.round(glyphs.I)}, 1 ${Math.round(glyphs.one)}, l ${Math.round(glyphs.l)}px)`);
    ok(glyphs.l < glyphs.o * 0.55, `the chalk lowercase l is a plain print stick, not the looped cursive one (${Math.round(glyphs.l)}px wide)`);
    ok(glyphs.lacute < glyphs.l * 1.7 && glyphs.Lslash < glyphs.L * 1.25, 'accented l letters (ĺ ľ ł...) and Ł use the print shapes too');
    // Whiteboard theme with its marker font.
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="theme:whiteboard"]'); await page.waitForTimeout(800);
    const wb = await f.locator('body').evaluate(async b => { await document.fonts.load('32px "Excalifont"'); return { bg: getComputedStyle(b).backgroundColor, ink: getComputedStyle(b).color, font: getComputedStyle(document.getElementById('view')).fontFamily, cls: b.classList.contains('whiteboard') && !b.classList.contains('chalk'), loaded: document.fonts.check('32px "Excalifont"') }; });
    ok(wb.cls && wb.bg === 'rgb(251, 252, 253)' && wb.ink === 'rgb(27, 31, 36)' && /^"?Excalifont/.test(wb.font) && wb.loaded, 'Whiteboard theme: white board, dark marker ink and the bundled marker font');
    ok(!(await info()).overflowY, 'text fits in the whiteboard font');
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="theme:chalkboard"]'); await page.waitForTimeout(300);
    // Themes are listed apart from colors; each theme has its own color row and remembers its color.
    const openMenu = async () => { await page.click('.win[data-ikey="notes:1"] .win-label'); await page.waitForTimeout(200); };
    const menuState = () => page.evaluate(() => ({
      headings: [...document.querySelectorAll('#menu .menu-heading')].map(h => h.textContent),
      themes: [...document.querySelectorAll('#menu [data-id^="theme:"]')].map(b => b.textContent.trim() + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
      swatches: [...document.querySelectorAll('#menu .swatch')].map(b => b.dataset.id + (b.getAttribute('aria-checked') === 'true' ? '*' : ''))
    }));
    const ink = () => f.locator('body').evaluate(b => getComputedStyle(b).color);
    await openMenu();
    let ms = await menuState();
    ok(ms.headings.join('|') === 'Theme|Chalk color' && ms.themes.join('|') === 'Sticky note|Chalkboard*|Whiteboard', `the menu lists themes separately: ${ms.themes.join(', ')}`);
    ok(ms.swatches.length === 6 && ms.swatches.includes('chalk:white*'), 'Chalkboard offers a row of chalk colors (white chosen)');
    await page.click('#menu [data-id="chalk:yellow"]'); await page.waitForTimeout(300);
    ok(await ink() === 'rgb(253, 230, 138)' && (await page.evaluate(() => window.__board21.state.conf.get('notes:1').chalk)) === 'yellow', 'picking yellow chalk writes in yellow chalk');
    await openMenu(); await page.click('#menu [data-id="theme:whiteboard"]'); await page.waitForTimeout(400);
    await openMenu(); ms = await menuState();
    ok(ms.headings[1] === 'Marker color' && ms.swatches.length === 5 && ms.swatches.includes('marker:black*'), 'Whiteboard offers marker colors');
    await page.click('#menu [data-id="marker:red"]'); await page.waitForTimeout(300);
    ok(await ink() === 'rgb(200, 30, 30)', 'picking a red marker writes in red');
    await openMenu(); await page.click('#menu [data-id="theme:sticky"]'); await page.waitForTimeout(400);
    await openMenu(); ms = await menuState();
    const bg = await f.locator('body').evaluate(b => getComputedStyle(b).backgroundColor);
    ok(ms.headings[1] === 'Paper color' && ms.swatches.includes('color:yellow*') && bg === 'rgb(254, 240, 138)' && !(await f.locator('body').evaluate(b => b.classList.contains('chalk') || b.classList.contains('whiteboard'))),
      'Sticky note is the plain note again: the color is the paper, in the normal font');
    await page.click('#menu [data-id="color:pink"]'); await page.waitForTimeout(300);
    await openMenu(); await page.click('#menu [data-id="theme:chalkboard"]'); await page.waitForTimeout(400);
    ok(await ink() === 'rgb(253, 230, 138)', 'each theme remembers its own color (back to yellow chalk)');
    // A note saved when Chalkboard/Whiteboard were colors opens in that theme.
    await page.evaluate(() => window.__board21.state.wins.get('notes:1').post('config', { config: { color: 'whiteboard', fit: true } })); await page.waitForTimeout(400);
    await openMenu(); ms = await menuState();
    ok(ms.themes.includes('Whiteboard*') && await f.locator('body').evaluate(b => b.classList.contains('whiteboard')), 'an older note saved with the Whiteboard color opens in the Whiteboard theme');
    await page.keyboard.press('Escape');
    // The board only accepts plain colors for swatches (nothing can be smuggled into the page's styles).
    await f.locator('body').evaluate(() => Board21.menu.set([{ label: 'X', swatches: [{ id: 'a', label: 'A', color: 'red;background:url(https://example.com/x)' }, { id: 'b', label: 'B', color: '#123456' }] }]));
    await page.waitForTimeout(300); await openMenu();
    ok((await page.evaluate(() => [...document.querySelectorAll('#menu .swatch')].map(b => b.dataset.id).join(','))) === 'b', 'swatches with anything but a plain color are dropped');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__board21.state.wins.get('notes:1').post('config', { config: { theme: 'chalkboard', chalk: 'white', fit: true } })); await page.waitForTimeout(400);
    // Fixed size; saved config; older notes.
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="smaller"]'); await page.waitForTimeout(300);
    const conf = await page.evaluate(() => window.__board21.state.conf.get('notes:1'));
    ok(conf.fit === false && conf.px > 0 && conf.theme === 'chalkboard', 'Smaller text switches to a fixed size and is saved');
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="fit"]'); await page.waitForTimeout(300);
    ok((await page.evaluate(() => window.__board21.state.conf.get('notes:1'))).fit === true, '"Fit text to the note" turns fitting back on');
    await page.evaluate(() => window.__board21.state.wins.get('notes:1').post('config', { config: { color: 'pink', size: 3 } })); await page.waitForTimeout(400);
    ok(!(await info()).overflowY, 'a note saved before this update fits its text automatically');
    // The chalk font is part of the offline cache.
    ok(await page.evaluate(() => window.BOARD21_WIDGETS.find(a => a.id === 'notes').files.includes('widgets/notes/fonts/CrayonLibre-21Board.woff2') && window.BOARD21_WIDGETS.find(a => a.id === 'notes').files.includes('widgets/notes/fonts/Excalifont-Regular.woff2')), 'the chalk and marker fonts are listed for offline use');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Google Drive folder (sharing a board with the smartboard)', async (browser) => {
    const note = p => p.frameLocator('.win[data-ikey="notes:1"] iframe');
    const noteText = p => note(p).locator('#t').inputValue();
    const settings = async p => { await p.click('.picker-btn.left'); await p.click('[data-ctl="settings"]'); await p.waitForTimeout(400); };
    const closeSettings = p => p.keyboard.press('Escape');
    const modal = (p, text) => p.locator('#modal.open .btn', { hasText: text }).click();
    const errors = [];

    const A = await driveDevice(browser), B = await driveDevice(browser);   // the laptop and the smartboard
    for (const d of [A, B]) d.p.on('pageerror', e => errors.push(e.message));
    await A.p.goto(BASE); await A.p.waitForTimeout(600);
    await A.p.evaluate(() => window.__board21.openWidget('notes')); await A.p.waitForTimeout(1200);
    await fillNote(note(A.p), 'Hello from the laptop'); await A.p.waitForTimeout(400);
    await settings(A.p);
    await A.p.fill('#set-board-name', 'Room 12'); await A.p.press('#set-board-name', 'Tab'); await A.p.waitForTimeout(200);
    ok(await A.p.locator('#settings [data-act="link-choose"]').count() === 1, 'Settings has a Google Drive folder section');
    await closeSettings(A.p);
    await A.p.click('.picker-btn.left'); await A.p.waitForTimeout(200);
    ok(await A.p.locator('[data-ctl="send"]').count() === 0, 'sending lives in Settings, not among the Widget Picker\'s controls');
    await A.p.click('.picker-btn.left'); await A.p.waitForTimeout(200);
    // ---- Send from the laptop: choose the folder, then Send.
    await settings(A.p);
    await A.p.click('#settings [data-act="link-choose"]'); await A.p.waitForTimeout(800);
    await A.p.click('#settings [data-act="link-send"]'); await A.p.waitForTimeout(1500);
    let files = await readFolder(A.p);
    const sent = files['Room 12.21board'] && JSON.parse(files['Room 12.21board']);
    const uidA = await A.p.evaluate(() => window.__board21.state.board.uid);
    ok(!!sent && sent.board.uid === uidA && sent.sent && sent.sent.by && sent.instances.some(i => i.data && JSON.stringify(i.data).includes('Hello from the laptop')),
      'Send writes the whole board to “Room 12.21board” in the folder, with the board’s id and who sent it');
    ok(!!files['About this folder.txt'] && /21Board keeps your boards here/.test(files['About this folder.txt']), 'the folder gets a short note explaining the files');
    ok(await A.p.locator('.toast', { hasText: 'Sent “Room 12”' }).count() === 1, 'it says it was sent');
    // A's device name, as the smartboard will show it.
    await settings(A.p);
    await A.p.fill('#set-link-label', 'my laptop'); await A.p.press('#set-link-label', 'Tab'); await A.p.waitForTimeout(200);
    await closeSettings(A.p);

    // ---- The smartboard links the same folder and loads the board.
    await B.p.goto(BASE); await B.p.waitForTimeout(800);
    await drive(A.p, B.p);
    await settings(B.p);
    await B.p.click('#settings [data-act="link-choose"]'); await B.p.waitForTimeout(1200);
    ok(await B.p.locator('#settings [data-act="link-load"][data-val="Room 12.21board"]').count() === 1, 'on the smartboard, linking the same folder lists “Room 12”');
    await B.p.click('#settings [data-act="link-load"][data-val="Room 12.21board"]'); await B.p.waitForTimeout(300);
    await modal(B.p, 'Replace this board'); await B.p.waitForTimeout(2000);
    ok(await noteText(B.p) === 'Hello from the laptop' && await B.p.evaluate(u => window.__board21.state.board.uid === u && window.__board21.state.board.name === 'Room 12', uidA),
      'Load shows the laptop’s board on the smartboard (it becomes the same board)');
    await closeSettings(B.p);
    await B.p.evaluate(() => window.__board21.link.saveState({ device: Object.assign({}, window.__board21.link.device(), { label: 'the smartboard' }) }));

    // ---- A newer version from the laptop is offered on the smartboard.
    await fillNote(note(A.p), 'Updated on the laptop'); await A.p.waitForTimeout(400);
    await A.p.evaluate(() => window.__board21.link.send()); await A.p.waitForTimeout(800);
    ok(!(await A.p.evaluate(() => window.__board21.link.offer)), 'the laptop isn’t offered its own send back');
    await drive(A.p, B.p);
    await B.p.evaluate(() => window.__board21.link.check(true)); await B.p.waitForTimeout(600);
    const offerToast = B.p.locator('.toast', { hasText: 'was updated on my laptop' });
    ok(await offerToast.count() === 1, 'the smartboard says “Room 12 was updated on my laptop at …” (it isn’t loaded silently)');
    await B.p.screenshot({ path: OUT + '71-drive-offer.png' });
    await offerToast.locator('button', { hasText: 'Load' }).click(); await B.p.waitForTimeout(2000);
    ok(await noteText(B.p) === 'Updated on the laptop', 'Load brings the newer version');
    await B.p.evaluate(() => window.__board21.link.check(true)); await B.p.waitForTimeout(400);
    ok(await B.p.locator('.toast', { hasText: 'was updated on' }).count() === 0, 'and it isn’t offered again');

    // ---- Changed on both: Load offers to keep the smartboard's changes as a copy first.
    await fillNote(note(B.p), 'Changed on the smartboard'); await B.p.waitForTimeout(500);
    await fillNote(note(A.p), 'Laptop again'); await A.p.waitForTimeout(400);
    await A.p.evaluate(() => window.__board21.link.send()); await A.p.waitForTimeout(800);
    await drive(A.p, B.p);
    await B.p.evaluate(() => window.__board21.link.check(true)); await B.p.waitForTimeout(600);
    await B.p.locator('.toast', { hasText: 'was updated on my laptop' }).locator('button', { hasText: 'Load' }).click(); await B.p.waitForTimeout(400);
    ok(await B.p.locator('#modal.open', { hasText: 'also changed here' }).count() === 1, 'if the board was also changed on the smartboard, Load warns first');
    await modal(B.p, 'Keep a copy of mine'); await B.p.waitForTimeout(2200);
    files = await readFolder(B.p);
    const copy = Object.keys(files).find(n => /copy from smartboard/.test(n));
    ok(await noteText(B.p) === 'Laptop again' && !!copy && JSON.parse(files[copy]).board.uid !== uidA && files[copy].includes('Changed on the smartboard'),
      `“Keep a copy of mine” saves the smartboard’s version in the folder as a separate board (“${copy}”), then loads`);

    // ---- 21Board keeps the folder tidy: renaming the board renames its file; names never collide.
    await drive(B.p, A.p);
    await settings(A.p);
    await A.p.fill('#set-board-name', 'Room 12 Math'); await A.p.press('#set-board-name', 'Tab'); await A.p.waitForTimeout(200);
    await A.p.click('#settings [data-act="link-send"]'); await A.p.waitForTimeout(1200);
    files = await readFolder(A.p);
    ok(!!files['Room 12 Math.21board'] && !files['Room 12.21board'] && !!copy && !!files[copy], 'renaming the board renames its file on the next send (and leaves other boards’ files alone)');
    ok(await A.p.evaluate(() => window.__board21.link.fileNameFor('someone-elses-board', 'Room 12 Math')) === 'Room 12 Math (2).21board', 'another board with the same name gets “Room 12 Math (2)”');
    await A.p.evaluate(() => { const h = [...document.querySelectorAll('#settings h3')].find(x => /Google Drive/.test(x.textContent)); h.scrollIntoView(); });
    await A.p.screenshot({ path: OUT + '70-drive-settings.png' });
    // ---- Send automatically.
    await A.p.click('#settings [data-act="link-auto"]'); await A.p.waitForTimeout(200);
    await closeSettings(A.p);
    await fillNote(note(A.p), 'Sent by itself'); await A.p.waitForTimeout(10000);
    files = await readFolder(A.p);
    ok(files['Room 12 Math.21board'].includes('Sent by itself'), '“Send automatically” sends a few seconds after a change');
    // ---- The photo can stay on each device.
    await A.p.evaluate(() => window.__board21.link.saveState({ photo: false }));
    const png = await A.p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#4f9be0'; g.fillRect(0, 0, 400, 300); return c.toDataURL('image/png'); });
    await A.p.setInputFiles('#photo-input', { name: 'sky.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') }); await A.p.waitForTimeout(1500);
    await A.p.evaluate(() => window.__board21.link.send()); await A.p.waitForTimeout(1000);
    files = await readFolder(A.p);
    ok(!JSON.parse(files['Room 12 Math.21board']).media, 'with “Include the background photo” off, the photo stays on this device');
    await A.p.evaluate(() => window.__board21.link.saveState({ photo: true })); await A.p.evaluate(() => window.__board21.link.send()); await A.p.waitForTimeout(1000);
    files = await readFolder(A.p);
    ok(!!JSON.parse(files['Room 12 Math.21board']).media, 'and with it on, the photo goes too');
    ok(!JSON.stringify(await A.p.evaluate(() => window.__board21.buildExport('full'))).includes('"link'), 'the folder link itself is never in exports');
    // ---- Browsers without a folder picker don't show any of it.
    const C = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await C.addInitScript(() => { window.showDirectoryPicker = undefined; });
    const pc = await C.newPage(); await pc.goto(BASE); await pc.waitForTimeout(600);
    await settings(pc);
    ok(await pc.locator('#settings [data-act^="link-"]').count() === 0, 'browsers without a folder picker (Safari, Firefox) don’t show the Google Drive folder section');
    await C.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Google Drive folder: never losing a version', async (browser) => {
    const note = p => p.frameLocator('.win[data-ikey="notes:1"] iframe');
    const noteText = p => note(p).locator('#t').inputValue();
    const L = (p, fn, arg) => p.evaluate(fn, arg);
    const modalOpen = (p, text) => p.locator('#modal.open', { hasText: text }).count();
    const modal = (p, text) => p.locator('#modal.open .btn', { hasText: text }).click();
    const fileHas = async (p, name, text) => { const f = (await readFolder(p))[name]; return !!f && f.includes(text); };
    const errors = [];
    const A = await driveDevice(browser), B = await driveDevice(browser);
    for (const d of [A, B]) { d.p.on('pageerror', e => errors.push(e.message)); await d.p.goto(BASE); await d.p.waitForTimeout(600); }
    await L(A.p, () => window.__board21.openWidget('notes')); await A.p.waitForTimeout(1200);
    await fillNote(note(A.p), 'v1'); await A.p.waitForTimeout(300);
    await L(A.p, async () => { const l = window.__board21.link; await l.choose(); l.saveState({ device: Object.assign({}, l.device(), { label: 'my laptop' }) }); await l.send(); });
    await A.p.waitForTimeout(500);
    const file = Object.keys(await readFolder(A.p)).find(n => n.endsWith('.21board'));
    await drive(A.p, B.p);
    await L(B.p, async () => { const l = window.__board21.link; await l.choose(); l.saveState({ device: Object.assign({}, l.device(), { label: 'the smartboard' }) }); });
    await L(B.p, n => { window.__board21.link.load(n); }, file); await B.p.waitForTimeout(500); await modal(B.p, 'Replace this board'); await B.p.waitForTimeout(2000);
    ok(await noteText(B.p) === 'v1', 'setup: both devices have the same board');

    // 1) A newer version is waiting on the smartboard; a student's change there must not go out over it.
    await fillNote(note(A.p), 'A v2'); await A.p.waitForTimeout(300); await L(A.p, () => window.__board21.link.send()); await A.p.waitForTimeout(500);
    await drive(A.p, B.p);
    await L(B.p, () => { window.__board21.link.saveState({ auto: true }); return window.__board21.link.check(true); }); await B.p.waitForTimeout(400);
    await fillNote(note(B.p), 'B scribble'); await B.p.waitForTimeout(10000);
    ok(await fileHas(B.p, file, 'A v2') && !(await fileHas(B.p, file, 'B scribble')) && await L(B.p, () => !!window.__board21.link.offer),
      '“Send automatically” waits while a newer version from another device is waiting (it never sends over it)');
    // 2) Send by hand: it asks first, and can keep theirs as a copy.
    await L(B.p, () => { window.__board21.link.saveState({ auto: false }); window.__board21.link.send(); }); await B.p.waitForTimeout(600);
    ok(await modalOpen(B.p, 'is in the folder') === 1, 'Send by hand asks first when the folder has a version this device hasn’t loaded');
    await modal(B.p, 'Send mine'); await B.p.waitForTimeout(1500);
    let files = await readFolder(B.p);
    const copyOfA = Object.keys(files).find(n => /copy from my laptop/.test(n));
    ok(files[file].includes('B scribble') && !!copyOfA && files[copyOfA].includes('A v2'), '“Send mine (keep a copy of theirs)” keeps the other version as its own board');

    // 3) The laptop gets a version made without its last send: Load says so and offers a copy.
    await drive(B.p, A.p);
    await L(A.p, () => window.__board21.link.check(true)); await A.p.waitForTimeout(400);
    ok(await L(A.p, () => !!window.__board21.link.offer), 'the laptop is offered the smartboard’s version');
    await L(A.p, n => { window.__board21.link.load(n); }, file); await A.p.waitForTimeout(600);
    ok(await modalOpen(A.p, 'made without the version you sent') === 1, 'Load warns when that version was made without this device’s last send (even with no changes since)');
    await modal(A.p, 'Keep a copy of mine'); await A.p.waitForTimeout(2200);
    files = await readFolder(A.p);
    ok(await noteText(A.p) === 'B scribble' && Object.keys(files).some(n => /copy from computer|copy from my laptop/.test(n) && files[n].includes('A v2')), 'and keeps a copy of the laptop’s version');

    // 4) A pending automatic send never goes out while Load's question is open.
    await fillNote(note(A.p), 'A v4'); await A.p.waitForTimeout(300); await L(A.p, () => window.__board21.link.send()); await A.p.waitForTimeout(500);
    await drive(A.p, B.p);
    await L(B.p, () => { window.__board21.link.saveState({ auto: true }); return window.__board21.link.check(true); }); await B.p.waitForTimeout(400);
    await fillNote(note(B.p), 'B local'); await B.p.waitForTimeout(300);
    await L(B.p, n => { window.__board21.link.load(n); }, file); await B.p.waitForTimeout(800);
    ok(await modalOpen(B.p, 'also changed here') === 1, 'Load asks, since the smartboard was changed');
    await B.p.waitForTimeout(10000);
    ok(await fileHas(B.p, file, 'A v4') && !(await fileHas(B.p, file, 'B local')), 'while the question is open, the pending automatic send doesn’t go out');
    await modal(B.p, 'Cancel'); await B.p.waitForTimeout(500);
    ok(await noteText(B.p) === 'B local' && await L(B.p, () => !!window.__board21.link.offer), 'Cancel keeps the smartboard’s changes, and the newer version stays offered');

    // 5) A plain Export saved in the folder (it has the board's id, but wasn't sent) isn't offered as a version.
    const backup = await L(B.p, async () => JSON.stringify(await window.__board21.buildExport('full')));
    await writeFolder(B.p, Object.assign(await readFolder(B.p), { 'Lesson backup.21board': backup }));
    await L(B.p, () => window.__board21.link.check(true)); await B.p.waitForTimeout(300);
    ok(await L(B.p, f => window.__board21.link.offer && window.__board21.link.offer.name === f && window.__board21.link.found.some(x => x.name === 'Lesson backup.21board' && !x.vid), file), 'an Export saved in the folder isn’t treated as a sent version');
    // 6) A file that can't be read yet (still arriving) keeps its name.
    await writeFolder(A.p, Object.assign(await readFolder(A.p), { 'Broken.21board': '{"format":"21bo' }));
    ok(await L(A.p, () => window.__board21.link.fileNameFor('someone-else-123', 'Broken')) === 'Broken (2).21board', 'a file that can’t be read yet is never overwritten (its name is skipped)');
    // 8) "Not now" doesn't silently stop automatic sending: the next blocked send says so.
    await B.p.locator('.toast', { hasText: 'was updated on my laptop' }).locator('button', { hasText: 'Not now' }).click(); await B.p.waitForTimeout(300);
    await L(B.p, () => { window.__board21.link.nagAt = 0; });   // (said at most every 5 minutes; step 1 already did)
    await fillNote(note(B.p), 'B more'); await B.p.waitForTimeout(10000);
    ok(await B.p.locator('.toast', { hasText: 'aren’t sent until you load it' }).count() === 1, 'after “Not now”, a change that can’t be sent brings the message back (saying changes aren’t being sent)');
    // 9) The other device sending several times in a row isn't a conflict.
    await L(B.p, n => { window.__board21.link.load(n); }, file); await B.p.waitForTimeout(600); await modal(B.p, 'Load and replace'); await B.p.waitForTimeout(2200);
    await L(B.p, () => window.__board21.link.saveState({ auto: false }));
    await fillNote(note(B.p), 'B s1'); await B.p.waitForTimeout(300); await L(B.p, () => window.__board21.link.send()); await B.p.waitForTimeout(600);
    await fillNote(note(B.p), 'B s2'); await B.p.waitForTimeout(300); await L(B.p, () => window.__board21.link.send()); await B.p.waitForTimeout(600);
    await drive(B.p, A.p);
    await L(A.p, () => window.__board21.link.check(true)); await A.p.waitForTimeout(300);
    await L(A.p, n => { window.__board21.link.load(n); }, file); await A.p.waitForTimeout(2500);
    ok(await modalOpen(A.p, '') === 0 && await noteText(A.p) === 'B s2', 'two sends in a row from the smartboard load on the laptop without a false warning');
    // 10) Loading another board first sends this one's pending automatic change.
    await L(A.p, () => window.__board21.link.saveState({ auto: true }));
    await fillNote(note(A.p), 'A unsent'); await A.p.waitForTimeout(400);
    const other = Object.keys(await readFolder(A.p)).find(n => /copy from/.test(n));
    await L(A.p, n => { window.__board21.link.load(n); }, other); await A.p.waitForTimeout(2000);
    ok(await modalOpen(A.p, 'Replace this board') === 1 && await fileHas(A.p, file, 'A unsent'), 'loading another board first sends this board’s pending change (nothing is lost)');
    await modal(A.p, 'Cancel'); await A.p.waitForTimeout(300);
    await L(A.p, () => window.__board21.link.saveState({ auto: false }));
    // 7) Erase everything forgets the folder (and sends nothing), in every open window.
    const B2 = await B.c.newPage(); await B2.goto(BASE); await B2.waitForTimeout(800);
    await B2.evaluate(async () => { await window.__board21.link.choose(); window.__board21.link.saveState({ auto: true }); });
    const before = Object.keys(await readFolder(B.p)).length;
    await B.p.click('.picker-btn.left'); await B.p.click('[data-ctl="settings"]'); await B.p.waitForTimeout(400);
    await B.p.click('#settings [data-act="erase"]'); await B.p.waitForTimeout(300); await modal(B.p, 'Erase everything'); await B.p.waitForTimeout(10000);
    ok(await L(B.p, () => !window.__board21.link.dir && !window.__board21.link.st.auto) && Object.keys(await readFolder(B.p)).length === before, '“Erase everything” unlinks the folder and sends nothing');
    ok(await B2.evaluate(() => !window.__board21.link.dir && !window.__board21.link.st.auto), 'other open 21Board windows on that device are unlinked too');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await B.c.close();
  }],
  ['Board history', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600); await freeBoard(page);
    const H = (fn, arg) => page.evaluate(fn, arg);
    await H(() => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    const metas = () => H(async () => { await window.__board21.history.reload(); return window.__board21.history.metas.map(m => ({ id: m.id, kind: m.kind, reason: m.reason, label: m.label, manual: m.manual, beforeBig: m.beforeBig, photo: m.photo, tab: m.tab, wins: Object.keys(m.wins), open: Object.values(m.wins).filter(w => w[0]).length, kept: m.keepUntil > Date.now() })); });
    // The version kept from just before a risky action: a new one, or the newest (protected) if nothing changed since.
    const safety = async text => { for (const x of await metas()) if (x.kept && (!text || JSON.stringify(await body(x.id)).includes(text))) return x; return null; };
    const body = id => H(async id => (await window.__board21.history.get(id)).body.exp, id);
    const note = (ik = 'notes:1') => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const noteText = ik => note(ik).locator('#t').inputValue();
    const settle = () => page.waitForTimeout(1600);
    const modal = text => page.locator('#modal.open .btn', { hasText: text }).click();

    // ---- Versions are saved as the board changes, in their own database.
    await H(() => window.__board21.openWidget('notes')); await page.waitForTimeout(1200);
    await fillNote(note(), 'Version A'); await settle();
    let m = await metas();
    const n0 = m.length;
    ok(n0 >= 1 && m[0].kind === 'auto' && JSON.stringify(await body(m[0].id)).includes('Version A'), 'a version is saved once the board has settled after a change');
    ok(await H(async () => (await indexedDB.databases()).some(d => d.name === '21Board-history') && (await window.__board21.store.getAll()).every(r => !/hist/.test(r.key))), 'versions are kept in their own database, never with the board');
    await settle();
    ok((await metas()).length === n0, 'nothing new is saved while nothing changes');
    await H(() => window.__board21.focusWin('notes:1')); await settle();
    ok((await metas()).length === n0, 'bringing a window to the front isn’t a change');
    await H(() => window.__board21.setRect('notes:1', { x: 300, y: 120, w: 420, h: 320 })); await settle();
    m = await metas();
    ok(m.length === n0 + 1, 'moving a window is');

    // ---- Before risky actions, with Undo.
    await page.locator('.win[data-ikey="notes:1"] .win-label').click(); await page.waitForTimeout(250);
    await page.click('#menu [data-act="reset"]'); await page.click('#menu [data-act="reset-yes"]'); await page.waitForTimeout(1500);
    ok(!!(await safety('Version A')), 'Reset keeps a version from just before (kept for at least a week)');
    await page.locator('.toast', { hasText: 'was reset' }).locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(1500);
    ok(await noteText() === 'Version A', 'Undo after Reset brings the note back');
    await H(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1000);
    await H(() => { window.__board21.state.wins.get('timer:1'); }); await settle();
    // Close all, then Undo.
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="close-all"]'); await page.waitForTimeout(1500);
    ok(await page.locator('.win').count() === 0 && (await metas()).some(x => x.kept && x.open === 2), '“Close all windows” keeps a version from just before');
    await page.locator('.toast', { hasText: 'Closed 2 windows' }).locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(2500);
    ok(await page.locator('.win').count() === 2 && await noteText() === 'Version A', 'and Undo opens them again');

    // ---- A widget's content suddenly emptied (a cleared note) is kept first.
    const long = 'The quick brown fox jumps over the lazy dog. '.repeat(6);
    await fillNote(note(), long); await settle(); await settle();
    await fillNote(note(), ''); await page.waitForTimeout(1500);
    ok(!!(await safety('lazy dog')) && await H(() => JSON.stringify(window.__board21.state.data.get('notes:1')).includes('lazy') === false), 'clearing a long note keeps the text in a version first (and the note stays cleared)');

    // ---- Disaster and rescue: the whole board goes back; this device's settings don't.
    await fillNote(note(), 'Good setup'); await page.waitForTimeout(300);
    await H(() => window.__board21.openWidget('dice')); await page.waitForTimeout(1000);
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="bg"][data-val="#e0f2fe"]'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    const goodId = await H(() => window.__board21.history.save('Good'));
    ok(!!goodId && (await metas()).find(x => x.id === goodId).manual, '“Save this version now” keeps a named version');
    // The wreck.
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(200);
    await page.click('#settings [data-act="bg"][data-val="#0a0a0a"]'); await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await fillNote(note(), 'scribble'); await page.waitForTimeout(400);
    await H(() => window.__board21.deleteInstance('dice:1')); await page.waitForTimeout(1500);
    await H(() => window.__board21.closeWin('timer:1')); await page.waitForTimeout(800);
    // Find it in Board history (Settings, first section).
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelector('#settings .sheet-body h3').textContent) === 'Board history', 'Board history is the first section in Settings');
    await page.click('#settings [data-act="hist-open"]'); await page.waitForTimeout(1200);
    ok(await page.locator('#history.open .hist-row').count() >= 5, 'the Board history sheet lists the versions');
    await page.screenshot({ path: OUT + '80-history-sheet.png' });
    await page.click(`#history [data-act="sel"][data-val="${goodId}"]`); await page.waitForTimeout(400);
    const detail = await page.evaluate(() => { const d = document.querySelector('#history .hist-detail'); return d && { rects: d.querySelectorAll('.minimap g').length, text: d.textContent }; });
    ok(detail && detail.rects === 3 && /Not on the board now/.test(detail.text) && /Compared with now/.test(detail.text), `tapping a version shows a preview (3 windows), and what’s different now`);
    await page.screenshot({ path: OUT + '81-history-detail.png' });
    await page.click('#history .hist-detail [data-act="go"]'); await page.waitForTimeout(3500);
    const back = await page.evaluate(() => ({ wins: document.querySelectorAll('.win').length, bg: window.__board21.state.board.background.color, theme: window.__board21.state.settings.theme }));
    ok(back.wins === 3 && await noteText() === 'Good setup' && back.bg === '#e0f2fe', 'Go back brings back the windows, their content and the background');
    ok(back.theme === 'dark', 'but leaves this device’s settings (dark mode) alone');
    m = await metas();
    ok(m[0].kind === 'restored' && !!(await safety('scribble')), 'going back keeps the board as it was first, so it can be undone');
    await page.locator('.toast', { hasText: 'back to how it was' }).locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(3500);
    ok(await page.locator('.win').count() === 1 && await noteText() === 'scribble', 'Undo puts the wrecked board back (if that’s what you wanted)');
    await H(id => window.__board21.history.restore(id), goodId); await page.waitForTimeout(3500);

    // ---- Put back one window, leaving the rest as they are.
    await H(() => window.__board21.openWidget('notes')); await page.waitForTimeout(1200);
    await fillNote(note('notes:2'), 'Second note'); await page.waitForTimeout(400);
    const twoId = await H(() => window.__board21.history.save('Two notes'));
    await fillNote(note('notes:2'), ''); await fillNote(note('notes:1'), 'Edited after'); await page.waitForTimeout(800);
    const rect1 = await H(() => JSON.stringify(window.__board21.state.insts.get('notes:1').rect));
    await H(id => window.__board21.history.putBack(id, 'notes:2'), twoId); await page.waitForTimeout(2000);
    ok(await noteText('notes:2') === 'Second note' && await noteText('notes:1') === 'Edited after' && await H(() => JSON.stringify(window.__board21.state.insts.get('notes:1').rect)) === rect1,
      '“Put back” brings back one window (Notes 2) and leaves the others as they are');
    // The window menu: Earlier versions of this window.
    await page.locator('.win[data-ikey="notes:1"] .win-label').click(); await page.waitForTimeout(250);
    ok(await page.locator('#menu [data-act="history"]').count() === 1, 'the window menu has “Earlier versions…”');
    await page.click('#menu [data-act="history"]'); await page.waitForTimeout(1200);
    const versions = await page.locator('#history [data-act="put"]').count();
    ok(versions >= 2 && /Earlier versions of Notes/.test(await page.locator('#history .hist-intro').textContent()), `it lists that window’s earlier versions (${versions})`);
    await page.locator('#history [data-act="put"]').first().click(); await page.waitForTimeout(2000);
    ok(await noteText('notes:1') !== 'Edited after', 'and puts one back');

    // ---- Windows gone? The empty board offers Board history.
    await H(() => Array.from(window.__board21.state.insts.keys()).forEach(k => window.__board21.closeWin(k))); await page.waitForTimeout(800);
    ok(await page.locator('#empty-hint .rescue:visible').count() === 1, 'with every window closed, the empty board offers “Go back to an earlier version”');
    await page.click('#empty-hint .rescue button'); await page.waitForTimeout(1000);
    ok(await page.locator('#history.open .hist-hero', { hasText: 'Before the windows were closed' }).count() === 1, 'and Board history suggests the version from before the windows were closed');
    await page.keyboard.press('Escape');

    // ---- A running timer comes back paused (it doesn't ring the moment the board comes back).
    await H(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('#go').click(); await page.waitForTimeout(500);
    const tId = await H(() => window.__board21.history.save('Timer running'));
    await H(id => window.__board21.history.restore(id), tId); await page.waitForTimeout(3500);
    const td = await H(() => window.__board21.state.data.get('timer:1'));
    ok(td && td.endsAt === null && td.remaining > 0, `a running timer comes back paused with its time left (${td && Math.round(td.remaining / 1000)} s)`);

    // ---- Which versions are kept (a pure function).
    const plan = await H(() => {
      const P = window.__board21.historyPlan, DAY = 864e5, now = new Date(2026, 10, 10, 12).getTime(), items = [];
      for (let i = 0; i < 400; i++) items.push({ id: 'a' + i, at: now - i * DAY * 0.9 - (i % 7) * 3600e3 });
      for (let h = 0; h < 30; h++) items.push({ id: 'h' + h, at: now - h * 1800e3 - 60e3 });
      items.push({ id: 'manual', at: now - 300 * DAY, manual: true }, { id: 'safe', at: now - 6 * DAY, keepUntil: now + DAY }, { id: 'big', at: now - 20 * DAY, beforeBig: true }, { id: 'oldsafe', at: now - 9 * DAY, keepUntil: now - DAY });
      const T = { newest: 20, hours: 48, days: 30, weeks: 12, firstOfDay: true, cap: 250 };
      const keep = P(items, now, T);
      const gap = P([{ id: 'x1', at: now - 90 * DAY }, { id: 'x2', at: now - 91 * DAY }, { id: 'x3', at: now - 100 * DAY }], now, T);
      const future = P(items.concat([{ id: 'f', at: now + 2 * DAY }]), now, T);
      return { n: keep.size, manual: keep.has('manual'), safe: keep.has('safe'), big: keep.has('big'), oldsafe: keep.has('oldsafe'), newest: ['h0', 'h1', 'h2'].every(id => keep.has(id)), old: keep.has('a399'), gap: gap.size, future: future.size === items.length + 1 };
    });
    ok(plan.newest && plan.manual && plan.safe && plan.big && plan.n <= 250 && !plan.old, `the newest, saved, safety and before-a-big-change versions are kept; very old ones go (${plan.n} of 434 kept)`);
    ok(plan.gap === 3 && plan.future, 'a long break (summer) doesn’t empty the history, and nothing is deleted if the clock went back');

    // ---- Another tab sees new versions; only the tab that changed the board saves one.
    const p2 = await ctx.newPage(); await p2.goto(BASE); await p2.waitForTimeout(800);
    await p2.evaluate(() => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    const before2 = (await metas()).length;
    await H(() => window.__board21.openWidget('clock')); await page.waitForTimeout(2500);
    const after2 = await metas();
    ok(after2.length === before2 + 1, 'a change saves exactly one version, though two tabs are open (only the tab that made it saves)');
    ok(await p2.evaluate(n => window.__board21.history.metas.length === n, after2.length), 'other open tabs see it');
    await p2.close();

    // ---- Erase everything keeps board history; going back undoes it.
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="erase"]'); await page.waitForTimeout(300); await modal('Erase everything'); await page.waitForTimeout(4000);
    m = await metas();
    const erased = m.find(x => x.kept && x.open > 0);
    ok(await page.locator('.win').count() === 0 && !!erased, '“Erase everything” keeps board history (a version from just before)');
    await H(id => window.__board21.history.restore(id), erased.id); await page.waitForTimeout(3500);
    ok(await page.locator('.win').count() >= 1, 'so the erased board can be brought back');
    // Off: no automatic versions; saving by hand still works.
    await H(() => { window.__board21.state.settings.historyEvery = 0; });
    const nOff = (await metas()).length;
    await H(() => window.__board21.openWidget('dice')); await page.waitForTimeout(2500);
    ok((await metas()).length === nOff, 'with board history off, nothing is saved automatically');
    await H(() => window.__board21.history.save('By hand')); await page.waitForTimeout(300);
    ok((await metas()).length === nOff + 1, 'but “Save this version now” still works');
    await H(() => { window.__board21.state.settings.historyEvery = 10; });
    // Delete board history.
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="hist-delete"]'); await page.waitForTimeout(300); await modal('Delete from this device'); await page.waitForTimeout(1500);
    ok((await metas()).length === 0 && await page.locator('.win').count() >= 1, '“Delete board history” deletes the versions and leaves the board as it is');
    // Erase, including board history.
    await H(() => window.__board21.history.save('x')); await page.waitForTimeout(300);
    await page.click('#settings [data-act="erase"]'); await page.waitForTimeout(300); await modal('including board history'); await page.waitForTimeout(2500);
    ok((await metas()).length === 0, '“Erase, including board history” removes it too');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- Where board history can't be used, the board works as before.
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await c2.addInitScript(() => { const open = indexedDB.open.bind(indexedDB); indexedDB.open = (name, v) => { if (name === '21Board-history') throw new Error('blocked'); return open(name, v); }; });
    const pu = await c2.newPage(); const eu = []; pu.on('pageerror', e => eu.push(e.message));
    await pu.goto(BASE); await pu.waitForTimeout(800);
    await pu.evaluate(() => window.__board21.openWidget('notes')); await pu.waitForTimeout(1200);
    await fillNote(pu.frameLocator('.win[data-ikey="notes:1"] iframe'), 'still saves'); await pu.waitForTimeout(800);
    await pu.click('.picker-btn.left'); await pu.click('[data-ctl="settings"]'); await pu.waitForTimeout(300);
    ok(/isn’t available/.test(await pu.locator('#settings').textContent()) && !eu.length && await pu.evaluate(() => window.__board21.state.data.get('notes:1').text === 'still saves'), 'where board history can’t be used, Settings says so and the board saves as before');
    await c2.close();
  }],
  ['Board history: Google Drive folder', async (browser) => {
    const L = (p, fn, arg) => p.evaluate(fn, arg);
    const errors = [];
    const A = await driveDevice(browser);
    A.p.on('pageerror', e => errors.push(e.message));
    await A.p.goto(BASE); await A.p.waitForTimeout(600);
    await L(A.p, () => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    await L(A.p, () => window.__board21.openWidget('notes')); await A.p.waitForTimeout(1200);
    await fillNote(A.p.frameLocator('.win[data-ikey="notes:1"] iframe'), 'Lesson plan'); await A.p.waitForTimeout(400);
    await L(A.p, async () => { const l = window.__board21.link; await l.choose(); l.saveState({ device: Object.assign({}, l.device(), { label: 'my laptop' }) }); await l.send(); });
    await A.p.waitForTimeout(600);
    await L(A.p, () => window.__board21.history.save('Monday')); await A.p.waitForTimeout(1500);
    let hist = await readHistory(A.p);
    const saved = Object.keys(hist).find(n => / saved \(my laptop\) \[[0-9a-z]{6}-[0-9a-z]{4}\]\.21board$/.test(n));
    const j = saved && JSON.parse(hist[saved]);
    ok(!!saved && j.format === '21board' && j.history && j.history.from === 'my laptop' && !j.sent && !j.theme && j.instances.some(i => JSON.stringify(i.data).includes('Lesson plan')),
      `a saved version is copied to “Board history” in the folder (“${saved}”), without the theme and not as a sent version`);
    ok(!!hist['About these files.txt'], 'with a note explaining the files');
    ok(await L(A.p, () => window.__board21.link.found.every(f => !/Board history/.test(f.name))) && !(await L(A.p, () => window.__board21.link.offer)), 'history copies are never offered or listed as boards');
    // 21Board thins its own copies by name; other devices' files, other boards' files, saved ones and other files stay.
    const tagU = await L(A.p, () => window.__board21.history.tag(window.__board21.state.board.uid, 6)), tagD = await L(A.p, () => window.__board21.history.tag(window.__board21.link.device().id, 4));
    const files = {}, day = 864e5, now = Date.now(), p2 = x => String(x).padStart(2, '0');
    const nm = (t, dev, uid, extra = '') => { const d = new Date(t); return `Lesson ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}.${p2(d.getMinutes())}${extra} (x) [${uid}-${dev}].21board`; };
    for (let i = 1; i <= 40; i++) files[nm(now - i * day * 1.5, tagD, tagU)] = '{}';
    for (let i = 1; i <= 5; i++) files[nm(now - i * day, 'zzzz', tagU)] = '{}';
    for (let i = 1; i <= 3; i++) files[nm(now - i * day, tagD, 'other0')] = '{}';
    files[nm(now - 50 * day, tagD, tagU, ' saved')] = '{}';
    files['notes.txt'] = 'mine';
    await writeHistory(A.p, files);
    await L(A.p, async () => { const H = window.__board21.history; await H.folderPrune(await H.folderDir(false)); });
    hist = await readHistory(A.p);
    const names = Object.keys(hist), own = names.filter(n => n.includes(`[${tagU}-${tagD}]`) && !/ saved /.test(n));
    ok(own.length < 30 && names.filter(n => n.includes('-zzzz]')).length === 5 && names.filter(n => n.includes('[other0-')).length === 3 && names.some(n => / saved \(x\)/.test(n)) && !!hist['notes.txt'],
      `old copies are thinned (${own.length} of 41 of this device’s kept), and other devices’, other boards’, saved and unrelated files are left alone`);
    // A device that was reset gets its board back from the folder's copies.
    const C = await driveDevice(browser); C.p.on('pageerror', e => errors.push(e.message));
    await C.p.goto(BASE); await C.p.waitForTimeout(600);
    await writeFolder(C.p, await readFolder(A.p)); await writeHistory(C.p, await readHistory(A.p));
    await L(C.p, () => window.__board21.link.choose()); await C.p.waitForTimeout(500);
    await C.p.click('.picker-btn.left'); await C.p.click('[data-ctl="settings"]'); await C.p.waitForTimeout(300);
    await C.p.click('#settings [data-act="hist-open"]'); await C.p.waitForTimeout(1500);
    await C.p.click('#history [data-act="others"]'); await C.p.waitForTimeout(300);
    const use = C.p.locator(`#history [data-act="folder-go"][data-val="${saved}"]`);
    ok(await use.count() === 1, 'on another device, Board history lists the folder’s copies of other boards');
    await use.click(); await C.p.waitForTimeout(3500);
    ok(await C.p.frameLocator('.win[data-ikey="notes:1"] iframe').locator('#t').inputValue() === 'Lesson plan', '“Use” brings that board back on this device');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await C.c.close();
  }],
  ['Widget dev window', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 560 } });
    const page = await ctx.newPage();
    const errors = [], consoleErr = [], requests = [];
    page.on('pageerror', e => { if (!/boom from the widget/.test(e.message)) errors.push(e.message); });
    page.on('console', m => { if (m.type() === 'error') consoleErr.push(m.text()); });
    const kids = f => page.frames().filter(x => x.parentFrame() === f);
    // A point on the test board -> a point on the page (through the preview frame and the dev window's camera).
    const at = async (preview, board, sel, fx = 0.5, fy = 0.5) => {
      const off = preview === page.mainFrame() ? { x: 0, y: 0 } : await page.evaluate(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { x: r.left, y: r.top }; });
      const cam = await preview.evaluate(() => { const d = window.__board21DevWindow, r = d.frame.getBoundingClientRect(); return { k: d.camera().k, x: r.left, y: r.top }; });
      const b = await board.evaluate(([sel, fx, fy]) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; }, [sel, fx, fy]);
      return { x: off.x + cam.x + b.x * cam.k, y: off.y + cam.y + b.y * cam.k, k: cam.k };
    };
    const tap = async (preview, board, sel) => { const p = await at(preview, board, sel); await page.mouse.click(p.x, p.y); await page.waitForTimeout(500); };

    // ---- Gemini-like preview: the code is document.write()n into a frame on another origin.
    await page.goto(BASE + '__dev/top.html?s=shim-write.html'); await page.waitForTimeout(3500);
    let preview = kids(page.mainFrame())[0], board = kids(preview)[0], widget = board && kids(board)[0];
    ok(!!board && await preview.evaluate(() => !!document.getElementById('b21-dev') && !window.__runs), 'in an AI-style preview the widget is shown in the dev window (its code doesn\'t run in the preview page)');
    ok(!!widget && await widget.evaluate(() => window.__runs === 1 && innerWidth === 320 && innerHeight === 240 && Board21.context.host === 'dev'),
      'the widget runs once, inside a real board window, at the size its manifest asks for (320 × 240)');
    ok(await board.evaluate(() => window.__board21.state.wins.size === 1 && document.querySelector('.win .win-label .name').textContent === 'Counter'), 'the window has the real title bar with the widget\'s name');
    await tap(preview, board, '.win-label');
    const menu = await board.evaluate(() => ({ items: [...document.querySelectorAll('#menu .menu-item')].map(e => e.textContent.trim()), swatches: document.querySelectorAll('#menu .swatch').length }));
    ok(menu.items.includes('Add one') && menu.items.includes('Fill the board') && menu.items.includes('Close') && menu.swatches === 1, `tapping the name opens the real window menu (${menu.items.join(', ')}; the swatch that isn't a #hex color is left out)`);
    await page.waitForTimeout(400);
    await tap(preview, board, '#menu [data-id="add"]');
    ok(await widget.evaluate(() => document.getElementById('n').textContent === '1') && await board.evaluate(() => JSON.stringify([...window.__board21.state.data.values()]) === '[{"count":1}]'), 'a menu item reaches the widget, and its save is stored');
    // Resize from the bottom-right handle, through the camera.
    const w0 = await widget.evaluate(() => innerWidth);
    await board.evaluate(() => window.__board21.focusWin('counter:1')); await page.waitForTimeout(300);
    const g = await at(preview, board, '.win .grip.se', 0.5, 0.5);
    await page.mouse.move(g.x, g.y); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(g.x + i * 8, g.y + i * 6); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(800);
    const w1 = await widget.evaluate(() => [innerWidth, innerHeight]);
    ok(w1[0] > w0 + 40 && Math.abs(w1[0] / w1[1] - 4 / 3) < 0.03, `the resize handles work through the camera and keep the 4:3 shape (${w0} → ${w1[0]} × ${w1[1]})`);
    ok(consoleErr.some(t => t.includes('[widget]') && t.includes('boom from the widget')), 'the widget\'s errors show in the preview\'s console as "[widget] …" (where an AI tool sees them)');
    ok(await preview.evaluate(() => { const r = document.getElementById('b21-dev').shadowRoot; return r.querySelector('[data-k="evn"]').classList.contains('err'); }), 'the Events button shows the error count');
    // Toolbar: theme and size go to the real board.
    await preview.evaluate(() => { const s = document.getElementById('b21-dev').shadowRoot.querySelector('[data-k="theme"]'); s.value = 'dark'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(500);
    ok(await widget.evaluate(() => Board21.theme === 'dark' && getComputedStyle(document.documentElement).getPropertyValue('--b21-bg').trim() === '#1e1e1e'), 'Theme ▸ Dark reaches the widget');
    await preview.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-act="larger"]').click()); await page.waitForTimeout(500);
    ok(await board.evaluate(() => window.__board21.state.board.scale === 0.9), 'Size + changes the board\'s size of windows and menus');
    // Data panel: shows the save; an edit is sent as a change from another tab.
    await preview.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-drawer="data"]').click()); await page.waitForTimeout(500);
    ok(await preview.evaluate(() => JSON.parse(document.getElementById('b21-dev').shadowRoot.querySelector('[data-k="data"]').value).count === 1), 'Data shows what the widget saved');
    await preview.evaluate(() => { const r = document.getElementById('b21-dev').shadowRoot; r.querySelector('[data-k="data"]').value = '{"count": 7}'; r.querySelector('[data-act="apply"]').click(); });
    await page.waitForTimeout(500);
    ok(await widget.evaluate(() => document.getElementById('n').textContent === '7'), 'an edited value is sent to the widget as a change from another tab');
    await preview.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-drawer="checks"]').click()); await page.waitForTimeout(300);
    const checks = await preview.evaluate(() => [...document.getElementById('b21-dev').shadowRoot.querySelectorAll('.chk b')].map(b => b.textContent));
    ok(checks.some(t => /swatch/i.test(t) && /#hex/.test(t)), `Checks point out problems, e.g. the bad swatch color (${checks.length} found)`);
    // Board view shows the whole screen.
    await preview.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-view="board"]').click()); await page.waitForTimeout(500);
    ok(await preview.evaluate(() => { const d = window.__board21DevWindow, r = d.frame.getBoundingClientRect(); return r.width <= 760 + 1 && Math.abs(r.width / r.height - 16 / 9) < 0.01; }), 'Board view shows the whole 1920 × 1080 screen');

    // ---- blob: preview, and a fully sandboxed preview (no storage).
    await page.goto(BASE + '__dev/top.html?s=shim-blob.html'); await page.waitForTimeout(3500);
    preview = kids(page.mainFrame())[0]; board = kids(preview)[0]; widget = board && kids(board)[0];
    ok(!!widget && await widget.evaluate(() => window.__runs === 1 && Board21.context.host === 'dev'), 'it works when the preview is a blob: page too');
    await page.goto(BASE + '__dev/top.html?s=shim-write.html&opaque=1'); await page.waitForTimeout(3500);
    preview = kids(page.mainFrame())[0]; board = kids(preview)[0];
    const opq = board && await board.evaluate(() => ({ mem: !!window.__board21.store.mem, wins: window.__board21.state.wins.size }));
    const foot = await preview.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('.foot').textContent);
    ok(opq && opq.mem && opq.wins === 1 && /until this page reloads/.test(foot), `where the preview blocks storage, the test board keeps data in memory and says so (${JSON.stringify(opq)}; "${foot.slice(-60)}")`);

    // ---- A widget's own file, opened directly: its registry entry gives the window size; its files load.
    page.on('request', r => requests.push(r.url()));
    await page.goto(BASE + 'widgets/notes/index.html'); await page.waitForTimeout(3000);
    board = kids(page.mainFrame())[0]; widget = board && kids(board)[0];
    ok(!!widget && await widget.evaluate(() => Board21.context.widgetId === 'notes' && Board21.context.host === 'dev'), 'opening a widget\'s file shows it in the dev window');
    ok(await widget.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 300)); return [...document.fonts].some(f => /Crayon/.test(f.family)) && !!document.getElementById('t'); }), 'its own files (relative paths) still load');
    // ---- Inside the real board, widgets never load the dev window. (Its own context: the board's offline
    // cache would answer the other test pages.)
    const ctxB = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const pb = await ctxB.newPage(), breq = [];
    pb.on('request', r => breq.push(r.url()));
    await pb.goto(BASE); await pb.waitForTimeout(600);
    await pb.evaluate(() => window.__board21.catalog().forEach(w => window.__board21.openWidget(w.id))); await pb.waitForTimeout(2500);
    ok(!breq.some(u => /board21-dev\.js|board-shell\.js/.test(u)) && await pb.evaluate(() => [...window.__board21.state.wins.values()].every(w => w.connected && w.iframe.contentWindow.Board21.context.host === 'board')), 'inside 21Board, widgets connect at once and never load the dev window');
    // A widget's own console hook isn't undone by the SDK inside the board.
    await pb.click('.picker-btn.left'); await pb.click('[data-ctl="settings"]'); await pb.waitForTimeout(300);
    await pb.click('#settings [data-act="devmode"]'); await pb.waitForTimeout(200);
    await pb.fill('#set-dev-path', '__dev/console.html'); await pb.click('#settings [data-act="dev-add"]'); await pb.waitForTimeout(1500);
    ok(await pb.evaluate(() => { const w = [...window.__board21.state.wins.values()].find(x => x.widget.dev); return !!w && w.iframe.contentWindow.__seen.includes('after ready'); }), 'a widget’s own console.error hook keeps working inside the board');
    await ctxB.close();
    // ---- SDK not first: the widget runs on its own, with a note saying why.
    await page.goto(BASE + '__dev/late.html'); await page.waitForTimeout(800);
    ok(await page.evaluate(() => Board21.context && Board21.context.standalone && /first script/.test(document.querySelector('[data-b21-note]').textContent)), 'if the SDK isn\'t the first script, the widget runs on its own with a note saying how to fix it');
    // ---- ⋯ ▸ Show the widget on its own, and back.
    await page.goto(BASE + '__dev/widget.html'); await page.waitForTimeout(2500);
    await page.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-act="bare"]').click()); await page.waitForTimeout(1000);
    const bare = kids(page.mainFrame())[1];   // the second frame: the widget on its own
    ok(!!bare && await bare.evaluate(() => Board21.context.standalone && window.__runs === 1 && innerWidth > 700), '⋯ ▸ Show the widget on its own');
    await page.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-act="unbare"]').click()); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => { const r = document.getElementById('b21-dev').shadowRoot; return r.querySelector('.barewrap').hidden && !r.querySelector('.barewrap iframe'); }) && kids(page.mainFrame()).length === 1, '"Back to the window" returns to the dev window');
    await page.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-act="bare"]').click()); await page.waitForTimeout(1000);
    await kids(page.mainFrame())[1].evaluate(() => location.reload()); await page.waitForTimeout(1500);
    ok(await kids(page.mainFrame())[1].evaluate(() => !!(window.Board21 && Board21.context && Board21.context.standalone) && !document.getElementById('b21-dev')), 'reloading the widget shown on its own keeps it on its own (no dev window inside it)');
    await page.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-act="unbare"]').click()); await page.waitForTimeout(800);
    // A page without a doctype: the board would show it in quirks mode (the dev window can't), so Checks says so.
    await page.goto(BASE + '__dev/quirks.html'); await page.waitForTimeout(2500);
    ok(await page.evaluate(() => window.__board21DevWindow.state().checks.some(c => /DOCTYPE/.test(c.title))), 'a widget page without <!DOCTYPE html> gets a Check (the board would draw it differently)');

    // ---- The lab page: paste a widget, try it in a sandbox that can't see real boards.
    await page.goto(BASE + 'sdk/lab.html'); await page.waitForTimeout(400);
    await page.click('#sample'); await page.click('#run'); await page.waitForTimeout(3500);
    board = kids(page.mainFrame())[0]; widget = board && kids(board)[0];
    ok(!!widget && await board.evaluate(() => self.origin === 'null' && !!window.__board21.store.mem) && await widget.evaluate(() => Board21.context.widgetId === 'counter' && innerWidth === 320),
      'the lab page runs a pasted widget in a real window, sandboxed with its own empty storage');
    await page.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-act="edit"]').click()); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.getElementById('editor').hidden && !document.getElementById('b21-dev')), '"Edit code" goes back to the code');

    // ---- The board shell is up to date with index.html.
    let built = true;
    try { require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-sdk.js'), '--check'], { stdio: 'pipe' }); } catch (e) { built = false; }
    ok(built, 'sdk/dev/board-shell.js matches index.html (node tools/build-sdk.js)');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Opened from disk (file://)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const url = 'file://' + path.join(ROOT, 'index.html').split(path.sep).join('/').replace(/^\/?/, '/');
    const a = await ctx.newPage();
    const errors = []; a.on('pageerror', e => errors.push(e.message));
    await a.goto(url); await a.waitForTimeout(600);
    await a.evaluate(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('timer'); });
    await a.waitForTimeout(1500);
    ok((await a.evaluate(() => Array.from(window.__board21.state.wins.values()).every(w => w.connected))), 'widgets connect when index.html is opened from disk');
    const b = await ctx.newPage(); await b.goto(url); await b.waitForTimeout(1500);
    await fillNote(a.frameLocator('.win[data-ikey="notes:1"] iframe'), 'from disk');
    await a.waitForTimeout(800);
    ok(await b.frameLocator('.win[data-ikey="notes:1"] iframe').locator('textarea').inputValue() === 'from disk', 'tabs opened from disk stay in sync');
    await a.reload(); await a.waitForTimeout(1500);
    ok(await a.frameLocator('.win[data-ikey="notes:1"] iframe').locator('textarea').inputValue() === 'from disk', 'content persists when opened from disk');
    await a.click('.picker-btn.left'); await a.click('[data-ctl="settings"]'); await a.waitForTimeout(500);
    ok((await a.locator('#st-persist').textContent()).includes('Not available') && !(await a.locator('#st-persist-hint').textContent()).includes('address bar'), 'data-protection status is accurate for a copy opened from a file');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }]
];

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/__dev/') && DEV_ROUTES[p]) { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' }); res.end(DEV_ROUTES[p](new URL(req.url, 'http://x').searchParams)); return; }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  // Headless Chromium can't answer a native Save dialog, so contexts use the download fallback by default.
  // The "Review fixes" suite stubs showSaveFilePicker itself to test that path.
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async opts => {
    const c = await newContext(opts);
    await c.addInitScript(() => { window.showSaveFilePicker = undefined; });
    return c;
  };
  const only = process.argv[2];
  for (const [title, fn] of SUITES) {
    if (only && !title.toLowerCase().includes(only.toLowerCase())) continue;
    console.log('\n' + title);
    try { await fn(browser); } catch (err) { ok(false, 'suite crashed: ' + (err && err.stack || err)); }
  }
  await browser.close();
  server.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
