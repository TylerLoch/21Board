/*
 * 21Board automated browser tests (optional — the app itself has no dependencies).
 *
 *   npm install --no-save playwright && npx playwright install chromium   (once)
 *   node tests/run.js
 *
 * Starts a static server for the repo, then drives Chromium through the
 * windowing system, storage, multi-tab sync, export/import, offline mode,
 * touch input and the sub-app SDK. Screenshots go to tests/output/.
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

// Notes shows its text (with tappable links) until tapped; tap it, then type.
async function fillNote(f, text) { await f.locator('#view').click(); await f.locator('#t').fill(text); }

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
    await page.click(`[data-app="${id}"]`); await page.waitForTimeout(400);
  }
  const frameOf = (page, ik) => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
    await page.goto(BASE); await page.waitForTimeout(600);

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
    await page.click('#menu [data-act="app"][data-id="digital"]'); await page.waitForTimeout(500);
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
    ok(zAfter === allZ && zAfter > zBefore, 'tapping inside app content brings window to front');

    // ---- multi-tab sync
    const page2 = await ctx.newPage();
    page2.on('pageerror', e => errors.push('[page2 pageerror] ' + e.message));
    await page2.goto(BASE); await page2.waitForTimeout(1200);
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
    ok(await frameOf(page, 'timer:1').locator('html').getAttribute('data-b21-theme') === 'dark', 'sub-apps receive the theme');
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
    await a.goto(BASE); await a.waitForTimeout(600);
    await a.evaluate(() => { window.__board21.openApp('notes'); window.__board21.openApp('name-picker'); window.__board21.openApp('dice'); });
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
    const fNotes = full.instances.find(i => i.appId === 'notes');
    ok(fNotes && fNotes.data && fNotes.data.text === 'Secret student info', 'full export contains content');
    ok(fNotes && fNotes.config && fNotes.config.color === 'pink', 'full export contains config');
    ok(full.instances.some(i => i.appId === 'dice' && i.open === false), 'full export includes closed windows');

    // Template export
    await a.click('.picker-btn.right'); await a.click('[data-ctl="export"]'); await a.waitForTimeout(150);
    [dl] = await Promise.all([a.waitForEvent('download'), a.click('#modal .btn[data-i="1"]')]);
    const tplPath = OUT + 'template.21board'; await dl.saveAs(tplPath);
    const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
    ok(tpl.kind === 'template', 'template kind');
    ok(tpl.instances.every(i => i.data === null), 'template has no content');
    ok(!tpl.instances.some(i => i.appId === 'dice'), 'template excludes closed windows');
    ok(tpl.instances.find(i => i.appId === 'notes').config.color === 'pink', 'template keeps config');
    ok(!JSON.stringify(tpl).includes('Secret') && !JSON.stringify(tpl).includes('Ana'), 'no student content in template');

    // ---------- Board B: different screen size, import full (replace)
    const ctxB = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const b = await ctxB.newPage();
    b.on('pageerror', e => errors.push('[B] ' + e.message));
    await b.goto(BASE); await b.waitForTimeout(600);
    await b.evaluate(() => window.__board21.openApp('timer'));
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
    await page.goto(BASE + '');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    const cached = await page.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
    console.log('cached files:', cached.length, cached.join(' '));
    await ctx.setOffline(true);
    await page.reload(); await page.waitForTimeout(800);
    ok(await page.locator('.picker-btn.left').isVisible(), 'board loads offline');
    const ids = await page.evaluate(() => window.__board21.catalog().filter(a => !a.devOnly).map(a => a.id));
    for (const id of ids) await page.evaluate(id => window.__board21.openApp(id), id);
    await page.waitForTimeout(2500);
    const conn = await page.evaluate(() => Array.from(window.__board21.state.wins.values()).map(w => [w.ikey, w.connected]));
    ok(conn.length === ids.length && conn.every(c => c[1]), 'every sub-app loads and connects offline: ' + JSON.stringify(conn));
    await page.screenshot({ path: OUT + '30-offline-all-apps.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Touch and multi-touch', async (browser) => {
  const wins = page => page.evaluate(() => Object.fromEntries(Array.from(window.__board21.state.wins.values()).map(w => [w.ikey, Object.assign({}, w.disp)])));
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE + ''); await page.waitForTimeout(600);
    // tap the waffle with touch → panel opens, tap an app
    await page.touchscreen.tap(44, 900 - 44); await page.waitForTimeout(200);
    ok(await page.locator('#panel.open').count() === 1, 'touch tap opens App Picker');
    const tile = await page.locator('[data-app="timer"]').boundingBox();
    await page.touchscreen.tap(tile.x + 40, tile.y + 40); await page.waitForTimeout(400);
    await page.evaluate(() => window.__board21.openApp('dice', { side: 'right' }));
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
    await page.goto(BASE + ''); await page.waitForTimeout(500);
    ok(!(await page.evaluate(() => window.__board21.catalog().filter(a => a.devOnly).length && document.querySelector('[data-app="sdk-playground"]'))), 'dev app hidden by default');
    // turn on developer mode in settings
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(200);
    await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.click('.picker-btn.left'); await page.waitForTimeout(150);
    ok(await page.locator('[data-app="sdk-playground"]').count() === 1, 'developer mode shows SDK Playground');
    await page.click('[data-app="sdk-playground"]'); await page.waitForTimeout(1000);
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
    ok(await page.locator('#menu [data-act="app"]').count() === 3, 'custom menu items appear in window menu');
    await page.screenshot({ path: OUT + '40-sdk-menu.png' });
    await page.click('#menu [data-id="a"]'); await page.waitForTimeout(200);
    ok((await f.locator('#log').textContent()).includes('event menu "a"'), 'menu selection reaches the app');
    await btn('save({counter})'); await page.waitForTimeout(300);
    ok((await f.locator('#log').textContent()).includes('save ok'), 'save resolves after commit');
    await btn('getInfo()'); await page.waitForTimeout(200);
    ok((await f.locator('#log').textContent()).includes('"width"'), 'getInfo returns window info');
    await btn('toast()'); await page.waitForTimeout(200);
    ok(await page.locator('.toast:has-text("Hello from the SDK")').count() === 1, 'toast shows on the board');
    await btn('maximize()'); await page.waitForTimeout(400);
    d = await disp(page, ik); ok(d.w === 1400 && d.h === 860, 'maximize()');
    await btn('restore()'); await page.waitForTimeout(400);
    // dev: add a test sub-app by path
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(200);
    await page.fill('#set-dev-path', 'apps/_template/index.html');
    await page.click('#settings [data-act="dev-add"]'); await page.waitForTimeout(1000);
    const devWin = await page.evaluate(() => Array.from(window.__board21.state.wins.values()).filter(w => w.app.dev).map(w => [w.ikey, w.connected]));
    ok(devWin.length === 1 && devWin[0][1], 'developer can load an unregistered sub-app by path: ' + JSON.stringify(devWin));
    await btn('close()'); await page.waitForTimeout(400);
    ok(!(await page.evaluate(ik => window.__board21.state.wins.has(ik), ik)), 'close() from the app closes its window');

    // ---- standalone sub-app
    const sp = await ctx.newPage();
    await sp.goto(BASE + 'apps/timer/index.html'); await sp.waitForTimeout(600);
    ok(await sp.evaluate(() => Board21.context && Board21.context.standalone === true), 'sub-app runs standalone when opened directly');
    await sp.click('#go'); await sp.waitForTimeout(300); await sp.reload(); await sp.waitForTimeout(500);
    ok(await sp.evaluate(() => (JSON.parse(localStorage.getItem('21board:standalone:/apps/timer/index.html')) || {}).data.endsAt > 0), 'standalone save persists to localStorage');

    // ---- phone width: no horizontal overflow of the panel
    const ph = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true });
    const pp = await ph.newPage(); await pp.goto(BASE + ''); await pp.waitForTimeout(500);
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
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => { window.__board21.openApp('notes'); window.__board21.openApp('timer'); });
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
    await page.goto(BASE); await page.waitForTimeout(500);
    const disp = ik => page.evaluate(ik => Object.assign({}, window.__board21.state.wins.get(ik).disp), ik);
    const setRect = (ik, r) => page.evaluate(([ik, r]) => { const s = window.__board21.state; s.insts.set(ik, Object.assign({}, s.insts.get(ik), { rect: r })); s.wins.get(ik).layout(); }, [ik, r]);
    await page.evaluate(() => { window.__board21.openApp('notes'); window.__board21.openApp('timer'); });
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

    // Sub-apps are told focused:false after a deselect (a freshly connected app is the case that used to break).
    await page.evaluate(() => window.__board21.openApp('dice')); await page.waitForTimeout(1200);
    await page.mouse.click(1300, 40); await page.waitForTimeout(400);
    const appFocused = await page.frameLocator('.win[data-ikey="dice:1"] iframe').locator('html').evaluate(() => Board21.context.window.focused);
    ok(appFocused === false, `after tapping the empty board the sub-app sees focused: false (got ${appFocused})`);
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
    await page.evaluate(() => window.__board21.openApp('clock')); await page.waitForTimeout(800);
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
    await page.evaluate(() => window.__board21.openApp('notes')); await page.waitForTimeout(600);
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
    await page.goto(BASE); await page.waitForTimeout(500);
    ok(await page.evaluate(() => window.__board21.catalog().some(a => a.id === 'calendar')), 'Calendar is in the App Picker');
    await page.evaluate(() => { window.__board21.openApp('calendar'); window.__board21.openApp('clock'); });
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
  ['Board scales with the screen size', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '?scaling=on'); await page.waitForTimeout(500);
    const screenRects = p => p.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('.win')).map(e => { const r = e.getBoundingClientRect(); return [e.dataset.ikey, { x: r.left, y: r.top, w: r.width, h: r.height }]; })));
    const layoutRects = p => p.evaluate(() => Object.fromEntries(Array.from(window.__board21.state.wins.values()).sort((a, b) => a.ikey < b.ikey ? -1 : 1).map(w => [w.ikey, Object.assign({}, w.disp)])));
    const setRect = (ik, r) => page.evaluate(([ik, r]) => window.__board21.setRect(ik, r), [ik, r]); // saves, like a real move
    const ovl = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
    ok(JSON.stringify(await page.evaluate(() => window.__board21.state.board.layout)) === JSON.stringify({ w: 1400, h: 860 }), 'a new board takes the screen size as its layout size');
    await page.evaluate(() => { for (const id of ['notes', 'timer', 'dice', 'clock']) window.__board21.openApp(id); });
    await page.waitForTimeout(1500);
    // A tidy 2x2 arrangement spread over the big screen, snapped 8px apart.
    await setRect('notes:1', { x: 40, y: 40, w: 600, h: 380 });
    await setRect('timer:1', { x: 648, y: 40, w: 700, h: 380 });
    await setRect('dice:1', { x: 40, y: 428, w: 600, h: 380 });
    await setRect('clock:1', { x: 648, y: 428, w: 380, h: 420 });
    await page.waitForTimeout(200);
    const before = await layoutRects(page);

    // Move to a laptop-sized screen: same arrangement, smaller, no new overlaps, all on screen.
    await page.setViewportSize({ width: 1000, height: 620 }); await page.waitForTimeout(400);
    const small = await screenRects(page);
    const list = Object.values(small);
    ok(list.every(r => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= 1000.5 && r.y + r.h <= 620.5), 'all windows fit on the smaller screen');
    let clash = false; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (ovl(list[i], list[j])) clash = true;
    ok(!clash, 'shrinking the screen does not make windows overlap');
    ok(small['notes:1'].x < small['timer:1'].x && small['notes:1'].y < small['dice:1'].y && small['timer:1'].y < small['clock:1'].y, 'the arrangement is kept');
    const z = await page.evaluate(() => window.__board21.zoom.s);
    ok(Math.abs(small['timer:1'].w - 700 * z) < 1.5, `windows are drawn at the board zoom (${Math.round(z * 100)}%)`);
    ok(JSON.stringify(await layoutRects(page)) === JSON.stringify(before), 'saved layout is untouched by the screen change');

    // Dragging while zoomed follows the pointer (drag the Clock right, into open space).
    const c0 = small['clock:1'];
    await page.evaluate(() => window.__board21.focusWin('clock:1'));
    await page.mouse.move(c0.x + 20, c0.y + 10); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(c0.x + 20 + i * 6, c0.y + 10); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(250);
    const c1 = (await screenRects(page))['clock:1'];
    ok(Math.abs((c1.x - c0.x) - 60) <= 12 * z + 1 && Math.abs(c1.y - c0.y) <= 12 * z + 1, `zoomed drag follows the pointer (moved ${Math.round(c1.x - c0.x)}px for a 60px drag)`);

    // A second, bigger tab shows the same layout scaled to its own screen.
    const page2 = await (await browser.newContext({ viewport: { width: 1400, height: 860 } })).newPage();
    await page2.goto(BASE + '?scaling=on'); await page2.waitForTimeout(300);
    await page2.close();
    const tabB = await ctx.newPage(); await tabB.setViewportSize({ width: 1400, height: 860 });
    await tabB.goto(BASE + '?scaling=on'); await tabB.waitForTimeout(1500);
    const la = await layoutRects(page), lb = await layoutRects(tabB);
    ok(JSON.stringify(lb) === JSON.stringify(la), 'two tabs on different screen sizes agree on the layout' + (JSON.stringify(lb) === JSON.stringify(la) ? '' : ' ' + JSON.stringify({ la, lb })));
    ok(await tabB.evaluate(() => window.__board21.zoom.s) === 1, 'the big tab shows it at 100%');
    await tabB.close();

    // Back to the big screen: exactly as before (except the moved window).
    await page.setViewportSize({ width: 1400, height: 860 }); await page.waitForTimeout(400);
    const back = await layoutRects(page);
    ok(['notes:1', 'dice:1', 'timer:1'].every(k => JSON.stringify(back[k]) === JSON.stringify(before[k])), 'growing back restores the original layout');

    // "Use this screen's size": windows keep their on-screen place and become full size.
    await page.setViewportSize({ width: 1000, height: 620 }); await page.waitForTimeout(400);
    const pre = await screenRects(page);
    await page.evaluate(() => window.__board21.useScreenAsLayout()); await page.waitForTimeout(400);
    const post = await screenRects(page);
    ok(await page.evaluate(() => window.__board21.zoom.s) === 1 && JSON.stringify(await page.evaluate(() => window.__board21.state.board.layout)) === JSON.stringify({ w: 1000, h: 620 }), 'this screen becomes the layout size');
    // Each window keeps its top-left corner and stays inside its old on-screen footprint (fixed-shape apps
    // like Clock may get a little narrower to keep their shape with a full-size title bar).
    const inside = k => Math.abs(pre[k].x - post[k].x) <= 1.5 && Math.abs(pre[k].y - post[k].y) <= 1.5 && post[k].w <= pre[k].w + 1.5 && post[k].h <= pre[k].h + 1.5;
    ok(Object.keys(pre).every(inside), 'windows stay where they were on screen' + (Object.keys(pre).every(inside) ? '' : ' ' + JSON.stringify({ pre, post })));

    // Turning scaling off goes back to keep-inside-the-edges behaviour.
    await page.setViewportSize({ width: 1400, height: 860 }); await page.waitForTimeout(300);
    await page.evaluate(() => { window.__board21.state.settings.scaleToScreen = false; });
    await page.setViewportSize({ width: 900, height: 600 }); await page.waitForTimeout(400);
    ok(await page.evaluate(() => window.__board21.zoom.s) === 1, 'with scaling off windows are not zoomed');
    const off = Object.values(await screenRects(page));
    ok(off.every(r => r.x + r.w <= 900.5 && r.y + r.h <= 600.5), 'and are kept inside the screen');
    await page.evaluate(() => { window.__board21.state.settings.scaleToScreen = true; });

    // An older board without a layout size (arranged on a bigger screen) gets one that fits all its windows.
    await page.setViewportSize({ width: 1000, height: 620 }); await page.waitForTimeout(200);
    await page.evaluate(async () => {
      const s = window.__board21.state;
      for (const [k, i] of s.insts) s.insts.set(k, Object.assign({}, i, { rect: Object.assign({}, i.rect, { x: i.rect.x + 600 }) }));
      const tx = await new Promise(res => { const r = indexedDB.open('21Board'); r.onsuccess = () => res(r.result); });
      await new Promise(res => { const t = tx.transaction('records', 'readwrite'); const st = t.objectStore('records');
        for (const [k, i] of s.insts) st.put({ key: 'inst:1:' + k, type: 'inst', rev: Date.now(), updatedAt: Date.now(), by: 'test', value: i });
        st.get('board:1').onsuccess = e => { const b = e.target.result; b.value.layout = null; b.rev = Date.now(); st.put(b); };
        t.oncomplete = res; });
    });
    await page.reload(); await page.waitForTimeout(1500);
    const L = await page.evaluate(() => window.__board21.state.board.layout);
    const legacy = Object.values(await screenRects(page));
    ok(L && L.w > 1000 && legacy.every(r => r.x + r.w <= 1000.5 && r.y + r.h <= 620.5), `a board without a layout size gets one that fits its windows (${L && L.w}×${L && L.h})`);

    // Taps inside a zoomed app still land on the right control.
    await page.evaluate(() => window.__board21.focusWin('dice:1')); await page.waitForTimeout(200);
    const before3 = await page.evaluate(() => JSON.stringify(window.__board21.state.data.get('dice:1') || null));
    await page.frameLocator('.win[data-ikey="dice:1"] iframe').locator('#roll').click(); await page.waitForTimeout(400);
    ok(await page.evaluate(() => !!(window.__board21.state.data.get('dice:1') || {}).values), 'buttons inside a zoomed window work');
    await page.screenshot({ path: OUT + 'scaled-board.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Accent color', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => window.__board21.openApp('timer')); await page.waitForTimeout(1200);
    const tab2 = await ctx.newPage(); await tab2.goto(BASE); await tab2.waitForTimeout(1200);
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="accent"][data-val="purple"]'); await page.waitForTimeout(500);
    const ring = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--focus-ring').trim());
    ok(ring === '#7c3aed', `board accent changes (focus ring ${ring})`);
    const appAccent = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('html').evaluate(e => e.style.getPropertyValue('--b21-accent'));
    ok(appAccent === '#7c3aed', `sub-apps get the accent (${appAccent})`);
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
  ['Board scaling off (default) and ?scaling=on', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const onScreen = () => page.evaluate(() => Array.from(document.querySelectorAll('.win')).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
    // A board arranged with scaling on...
    await page.goto(BASE + '?scaling=on'); await page.waitForTimeout(500);
    await page.evaluate(() => { for (const id of ['notes', 'timer']) window.__board21.openApp(id); });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.__board21.setRect('notes:1', { x: 900, y: 400, w: 460, h: 420 }); window.__board21.setRect('timer:1', { x: 40, y: 40, w: 600, h: 380 }); });
    await page.waitForTimeout(300);
    const layout = await page.evaluate(() => window.__board21.state.board.layout);
    // ...opened with scaling switched off, on a smaller screen.
    await page.setViewportSize({ width: 1000, height: 620 });
    await page.goto(BASE); await page.waitForTimeout(1200); // no parameter: scaling is off by default
    ok(await page.evaluate(() => window.__board21.zoom.s) === 1, 'switched off: no zoom');
    const r = await onScreen();
    ok(r.length === 2 && r.every(w => w.x >= 0 && w.y >= 0 && w.x + w.w <= 1000.5 && w.y + w.h <= 620.5), 'switched off: windows are pushed inside the screen, as before scaling');
    const t = r.find(w => w.x < 100);
    ok(t && Math.abs(t.w - 600) < 1, 'switched off: windows keep their full size');
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    ok(!(await page.locator('#settings').textContent()).includes('Scale the board'), 'switched off: no scaling rows in Settings');
    await page.keyboard.press('Escape');
    ok(JSON.stringify(await page.evaluate(() => window.__board21.state.board.layout)) === JSON.stringify(layout), 'switched off: the saved layout size is left alone');
    // Back on: the original arrangement returns.
    await page.goto(BASE + '?scaling=on'); await page.waitForTimeout(1200);
    const back = await page.evaluate(() => Object.assign({}, window.__board21.state.wins.get('notes:1').disp));
    ok(back.x === 900 && back.y === 400, 'switched back on: the arrangement is intact');
    // A brand-new board with scaling switched off never gets a layout size.
    const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const p2 = await ctx2.newPage(); await p2.goto(BASE); await p2.waitForTimeout(800);
    ok(await p2.evaluate(() => window.__board21.state.board.layout) === null, 'switched off: a new board stores no layout size');
    await ctx2.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Board scaling review fixes', async (browser) => {
    const errors = [];
    const ovl = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
    const anyOverlap = list => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (ovl(list[i], list[j])) return true; return false; };
    const onScreen = p => p.evaluate(() => Array.from(document.querySelectorAll('.win')).map(e => { const r = e.getBoundingClientRect(); return { k: e.dataset.ikey, x: r.left, y: r.top, w: r.width, h: r.height }; }));
    const stored = p => p.evaluate(() => Array.from(window.__board21.state.insts.entries()).filter(([, i]) => i.open).map(([k, i]) => Object.assign({ k }, i.rect)));

    // 1) Wide second screen: windows opened there stay inside the shared layout, so the first screen has no overlaps.
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 620 } });
    const a = await ctx.newPage(); a.on('pageerror', e => errors.push(e.message));
    await a.goto(BASE + '?scaling=on'); await a.waitForTimeout(600);
    await a.evaluate(() => window.__board21.openApp('clock')); await a.waitForTimeout(600); // first window fixes the layout at 1000x620
    const b = await ctx.newPage(); await b.setViewportSize({ width: 1800, height: 620 });
    await b.goto(BASE + '?scaling=on'); await b.waitForTimeout(1000);
    for (const id of ['timer', 'calendar', 'notes', 'dice']) { await b.click('.picker-btn.left'); await b.waitForTimeout(100); await b.click(`[data-app="${id}"]`); await b.waitForTimeout(350); }
    await b.waitForTimeout(500); await a.waitForTimeout(800);
    const st = await stored(b);
    ok(st.every(r => r.x >= -0.5 && r.x + r.w <= 1000.5), 'windows opened on a wider screen are placed inside the shared layout');
    // What each screen draws, mapped back into layout space, must match.
    const drawn = pg => pg.evaluate(() => { const z = window.__board21.zoom; return Array.from(document.querySelectorAll('.win')).map(e => { const r = e.getBoundingClientRect(); return { k: e.dataset.ikey, x: (r.left - z.ox) / z.s, y: (r.top - z.oy) / z.s, w: r.width / z.s, h: r.height / z.s }; }).sort((p, q) => p.k < q.k ? -1 : 1); });
    const da = await drawn(a), db = await drawn(b);
    const agree = da.length === db.length && da.every((r, i) => ['x', 'y', 'w', 'h'].every(f => Math.abs(r[f] - db[i][f]) <= 1.5));
    ok(agree, 'both screens draw every window in the same place');
    ok(await b.evaluate(() => { const f = document.getElementById('layout-frame'); return !!f && !f.hidden; }), 'the wider screen shades the area outside the layout');
    // A tall screen can't park a window below the layout.
    await b.setViewportSize({ width: 1000, height: 1100 }); await b.waitForTimeout(400);
    const t = (await onScreen(b)).find(r => r.k === 'timer:1');
    await b.evaluate(() => window.__board21.focusWin('timer:1'));
    await b.mouse.move(t.x + 20, t.y + 10); await b.mouse.down();
    for (let i = 1; i <= 12; i++) { await b.mouse.move(t.x + 20, t.y + 10 + i * 60); await b.waitForTimeout(16); }
    await b.mouse.up(); await b.waitForTimeout(300);
    const tr = (await stored(b)).find(r => r.k === 'timer:1');
    ok(tr.y + tr.h <= 620.5, `a window can't be dragged out of the layout on a taller screen (bottom ${Math.round(tr.y + tr.h)} of 620)`);
    await b.close();

    // 2) Zoomed out, handles and the focus ring stay touchable; windows aren't held on a blurry layer.
    await a.setViewportSize({ width: 500, height: 310 }); await a.waitForTimeout(400); // zoom 0.5
    await a.evaluate(() => window.__board21.focusWin('clock:1')); await a.waitForTimeout(200);
    const grip = await a.evaluate(() => { const r = document.querySelector('.win[data-ikey="clock:1"] .grip.se').getBoundingClientRect(); return r.width; });
    ok(grip >= 30, `corner handle stays finger-sized when zoomed out (${Math.round(grip)}px on screen)`);
    ok(await a.evaluate(() => getComputedStyle(document.querySelector('.win')).willChange) === 'auto', 'windows at rest are not held on a fixed-scale layer (no blur after zooming in)');

    // 3) Snap reach and push-to-overlap feel the same on screen when zoomed out.
    await a.setViewportSize({ width: 1000, height: 620 }); await a.waitForTimeout(300);
    await a.evaluate(() => { const b = window.__board21; for (const k of ['calendar:1', 'notes:1', 'dice:1', 'timer:1']) b.closeWin(k, { quiet: true }); });
    await a.waitForTimeout(500);
    await a.evaluate(() => { window.__board21.openApp('notes'); }); await a.waitForTimeout(600);
    await a.evaluate(() => { const b = window.__board21; b.setRect('clock:1', { x: 100, y: 100, w: 300, h: 340 }); b.setRect('notes:1', { x: 600, y: 100, w: 300, h: 300 }); });
    await a.setViewportSize({ width: 500, height: 310 }); await a.waitForTimeout(400);
    let n = (await onScreen(a)).find(r => r.k === 'notes:1'), c = (await onScreen(a)).find(r => r.k === 'clock:1');
    // drag Notes left so it would sit 50 screen px inside the Clock (100 layout px): should stop flush
    const target = (c.x + c.w - 50) - n.x;
    await a.evaluate(() => window.__board21.focusWin('notes:1'));
    await a.mouse.move(n.x + 20, n.y + 8); await a.mouse.down();
    for (let i = 1; i <= 10; i++) { await a.mouse.move(n.x + 20 + target * i / 10, n.y + 8); await a.waitForTimeout(16); }
    await a.mouse.up(); await a.waitForTimeout(300);
    n = (await onScreen(a)).find(r => r.k === 'notes:1');
    ok(!ovl(n, c), 'a small push still snaps flush when zoomed out (push resistance is in screen px)');

    // 4) "Use this size" keeps windows apart even when app minimum sizes make them grow.
    const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const p = await ctx2.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '?scaling=on'); await p.waitForTimeout(500);
    await p.evaluate(() => { for (const id of ['clock', 'notes', 'timer']) window.__board21.openApp(id); }); await p.waitForTimeout(1200);
    await p.evaluate(() => { const b = window.__board21; b.setRect('clock:1', { x: 40, y: 40, w: 300, h: 340 }); b.setRect('notes:1', { x: 40, y: 388, w: 300, h: 300 }); b.setRect('timer:1', { x: 348, y: 388, w: 250, h: 300 }); });
    await p.setViewportSize({ width: 960, height: 540 }); await p.waitForTimeout(400);
    await p.evaluate(() => window.__board21.useScreenAsLayout()); await p.waitForTimeout(500);
    ok(!anyOverlap(await onScreen(p)), '"Use this size" does not make windows overlap');
    // ...and refuses while a window is being dragged.
    const nn = (await onScreen(p)).find(r => r.k === 'notes:1');
    await p.mouse.move(nn.x + 20, nn.y + 8); await p.mouse.down(); await p.mouse.move(nn.x + 40, nn.y + 8);
    ok(await p.evaluate(() => window.__board21.useScreenAsLayout()) === false, '"Use this size" waits while a window is being moved');
    await p.mouse.up();
    await ctx2.close();

    // 5) A never-used board follows the screen: its first window sets the layout size.
    const ctx3 = await browser.newContext({ viewport: { width: 700, height: 500 } });
    const q = await ctx3.newPage(); await q.goto(BASE + '?scaling=on'); await q.waitForTimeout(500);
    await q.setViewportSize({ width: 1400, height: 860 }); await q.waitForTimeout(300);
    await q.evaluate(() => window.__board21.openApp('timer')); await q.waitForTimeout(500);
    ok(JSON.stringify(await q.evaluate(() => window.__board21.state.board.layout)) === JSON.stringify({ w: 1400, h: 860 }), 'an empty board takes the screen size its first window is opened on');
    ok(await q.evaluate(() => window.__board21.zoom.s) === 1, 'so new windows open at 100%');
    await ctx3.close();

    // 6) Export always describes the space the rects are in (grown if a window lies outside the layout).
    await a.evaluate(() => { const s = window.__board21.state; s.insts.set('notes:1', Object.assign({}, s.insts.get('notes:1'), { rect: { x: 900, y: 100, w: 300, h: 300 } })); });
    const vp = await a.evaluate(async () => (await window.__board21.buildExport('full')).viewport);
    ok(vp.width >= 1200, `export viewport contains every window (${vp.width}×${vp.height})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Calendar, Clock and accent review fixes', async (browser) => {
    const errors = [];
    // Saturday: today's highlight must win over the weekend shading.
    let ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    let page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-07T10:00:00'));
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => window.__board21.openApp('calendar')); await page.waitForTimeout(1200);
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
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => window.__board21.openApp('calendar'));
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
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => window.__board21.openApp('clock')); await page.waitForTimeout(1000);
    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.click('#menu [data-id="date"]'); await page.waitForTimeout(800);
    const wd = await page.frameLocator('.win[data-ikey="clock:1"] iframe').locator('#weekday').evaluate(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, left: r.left, right: r.right, vw: innerWidth }; });
    ok(wd.left >= -1 && wd.right <= wd.vw + 1, `long weekday name fits the clock (${wd.text})`);
    await ctx.close();

    // Accent: crafted names are rejected; dark-theme buttons get dark text on the light accent.
    ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500);
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
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => window.__board21.openApp('timer')); await page.waitForTimeout(1200);
    const timer = page.frameLocator('.win[data-ikey="timer:1"] iframe');
    // Count notes played by wrapping the iframe's AudioContext.
    await timer.locator('html').evaluate(() => {
      const Real = window.AudioContext || window.webkitAudioContext;
      window.__notes = 0;
      window.AudioContext = function () { const c = new Real(); const mk = c.createOscillator.bind(c); c.createOscillator = () => { window.__notes++; return mk(); }; return c; };
    });
    await page.click('.win[data-ikey="timer:1"] .win-label'); await page.waitForTimeout(200);
    const labels = await page.locator('#menu [data-act="app"]').allTextContents();
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
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => window.__board21.openApp('dice')); await page.waitForTimeout(1200);
    await page2.goto(BASE); await page2.waitForTimeout(1500);
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
    await page.goto(BASE + '?scaling=on'); await page.waitForTimeout(500);
    await page.evaluate(() => { for (const id of ['clock', 'dice', 'notes', 'timer', 'calendar', 'name-picker']) window.__board21.openApp(id); });
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

    // Click-only app, mouse: drag the clock face.
    let r0 = await rect('clock:1');
    await mouseDrag(r0.x + r0.w / 2, r0.y + r0.h / 2 + 20, 0, 70);
    let r1 = await rect('clock:1');
    ok(moved(r0, r1, 0, 70), `mouse drag anywhere in a click-only app moves it (Clock moved ${Math.round(r1.x - r0.x)}, ${Math.round(r1.y - r0.y)})`);

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

    // Text app, mouse: dragging inside selects text instead of moving; the title bar still moves it.
    r0 = await rect('notes:1');
    await fillNote(page.frameLocator('.win[data-ikey="notes:1"] iframe'), 'Some words to select');
    await mouseDrag(r0.x + 30, r0.y + 70, 120, 0);
    r1 = await rect('notes:1');
    ok(r1.x === r0.x && r1.y === r0.y, 'in Notes, dragging inside does not move the window (text selection)');
    await mouseDrag(r0.x + 30, r0.y + 12, 0, 60);
    r1 = await rect('notes:1');
    ok(moved(r0, r1, 0, 60), 'Notes still moves by its title bar');

    // Text app, touch: two fingers anywhere move it.
    r0 = await rect('notes:1');
    await touchDrag([{ x: r0.x + 80, y: r0.y + 120 }, { x: r0.x + 160, y: r0.y + 150 }], -40, -40);
    r1 = await rect('notes:1');
    ok(moved(r0, r1, -40, -40), `two-finger drag moves a text app (Notes moved ${Math.round(r1.x - r0.x)}, ${Math.round(r1.y - r0.y)})`);

    // Click-only app, touch: one finger anywhere.
    r0 = await rect('calendar:1');
    await touchDrag([{ x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 }], 0, 30);
    r1 = await rect('calendar:1');
    ok(moved(r0, r1, 0, 30), `one-finger drag moves a click-only app on a touchscreen (Calendar moved ${Math.round(r1.y - r0.y)})`);

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

    // Zoomed board: still follows the pointer.
    await page.setViewportSize({ width: 1000, height: 614 }); await page.waitForTimeout(400);
    r0 = await rect('clock:1');
    await mouseDrag(r0.x + r0.w / 2, r0.y + r0.h / 2 + 10, 50, 0);
    r1 = await rect('clock:1');
    ok(moved(r0, r1, 50, 0), `drag from inside follows the pointer when the board is zoomed (moved ${Math.round(r1.x - r0.x)})`);
    await page.setViewportSize({ width: 1400, height: 860 }); await page.waitForTimeout(300);

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
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => { for (const id of ['clock', 'dice', 'notes', 'timer', 'calendar']) window.__board21.openApp(id); });
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

    // Taps on an element the app re-renders (Timer's Start icon) leave nothing stuck.
    let go = await inApp('timer:1', '#go svg');
    for (let i = 0; i < 3; i++) { await T('touchStart', [{ x: go.x, y: go.y, id: 1 }]); await page.waitForTimeout(450); await T('touchEnd', []); await page.waitForTimeout(150); }
    ok(await idle(), 'tapping a button the app re-renders leaves no stuck interaction');
    let r0 = await rect('timer:1'); await titleDrag('timer:1', 30, 0); let r1 = await rect('timer:1');
    ok(Math.abs(r1.x - r0.x - 30) <= 12, `and the window still moves by its title bar (moved ${Math.round(r1.x - r0.x)})`);
    if (await page.evaluate(() => /Pause/.test(document.querySelector('.win[data-ikey="timer:1"] iframe').contentDocument.getElementById('go').getAttribute('aria-label')))) {
      await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('#go').click(); await page.waitForTimeout(200);
    }

    // An app that re-renders the very element under the finger: taps leave nothing held, and press-and-drag still moves and saves.
    await page.evaluate(() => {
      const w = document.querySelector('.win[data-ikey="calendar:1"] iframe').contentWindow, d = w.document;
      const box = d.createElement('div'); box.id = 'rr'; box.style.cssText = 'position:fixed;left:20px;bottom:20px;width:140px;height:70px;z-index:9;background:#fc0';
      d.body.appendChild(box);
      w.setInterval(() => { box.innerHTML = '<span style="display:block;width:100%;height:100%">tick</span>'; }, 40);
    });
    await page.waitForTimeout(100);
    let rr = await inApp('calendar:1', '#rr');
    await T('touchStart', [{ ...rr, id: 1 }]); await page.waitForTimeout(200); await T('touchEnd', []); await page.waitForTimeout(150);
    ok(await idle(), 'a tap on an element the app keeps re-rendering leaves nothing held');
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

    // An app page that scrolls as a whole scrolls with one finger instead of moving the window.
    await page.evaluate(() => { const d = document.querySelector('.win[data-ikey="dice:1"] iframe').contentDocument; d.body.style.overflow = 'visible'; d.body.style.height = 'auto'; d.documentElement.style.overflow = 'auto'; const x = d.createElement('div'); x.style.height = '2000px'; d.body.appendChild(x); });
    r0 = await rect('dice:1');
    await touchPath([{ x: r0.x + r0.w / 2, y: r0.y + 200, id: 1, dx: 0, dy: -120 }], 8);
    r1 = await rect('dice:1');
    const sy = await page.evaluate(() => document.querySelector('.win[data-ikey="dice:1"] iframe').contentWindow.scrollY);
    ok(r1.y === r0.y && sy > 30, `a scrolling app page scrolls instead of moving the window (scrolled ${Math.round(sy)})`);

    // Controls inside web components (shadow DOM) and touch widgets are left to the app.
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
    await page.goto(BASE); await page.waitForTimeout(500);
    await page.evaluate(() => window.__board21.openApp('notes')); await page.waitForTimeout(1200);
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
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="color:chalkboard"]'); await page.waitForTimeout(800);
    const chalk = await f.locator('body').evaluate(b => ({ bg: getComputedStyle(b).backgroundColor, font: getComputedStyle(document.getElementById('view')).fontFamily, chalk: b.classList.contains('chalk'), loaded: document.fonts.check('32px "Crayon Libre"') && Array.from(document.fonts).some(x => x.family.replace(/"/g, '') === 'Crayon Libre' && x.status === 'loaded') }));
    ok(chalk.chalk && chalk.bg === 'rgb(47, 74, 58)' && /^"?Crayon Libre/.test(chalk.font), 'Chalkboard theme: green board and the bundled chalk font');
    ok(chalk.loaded, 'the chalk font file loads (works on any device, no system font needed)');
    ok(!(await info()).overflowY, 'text still fits in the chalk font');
    const glyphs = await f.locator('body').evaluate(async () => {
      await document.fonts.load('200px "Crayon Libre"');
      const c = document.createElement('canvas').getContext('2d'); c.font = '200px "Crayon Libre"';
      return { colonBelow: c.measureText(':').actualBoundingBoxDescent, I: c.measureText('I').width, one: c.measureText('1').width };
    });
    ok(glyphs.colonBelow < 3, `the chalk colon is two dots with nothing below the line, so 3:15 doesn't read 3;15 (${glyphs.colonBelow.toFixed(1)}px below)`);
    ok(glyphs.I > glyphs.one * 1.2, 'the chalk capital I has bars, so it differs from 1 and l');
    // Fixed size; saved config; older notes.
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="smaller"]'); await page.waitForTimeout(300);
    const conf = await page.evaluate(() => window.__board21.state.conf.get('notes:1'));
    ok(conf.fit === false && conf.px > 0 && conf.color === 'chalkboard', 'Smaller text switches to a fixed size and is saved');
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="fit"]'); await page.waitForTimeout(300);
    ok((await page.evaluate(() => window.__board21.state.conf.get('notes:1'))).fit === true, '"Fit text to the note" turns fitting back on');
    await page.evaluate(() => window.__board21.state.wins.get('notes:1').post('config', { config: { color: 'pink', size: 3 } })); await page.waitForTimeout(400);
    ok(!(await info()).overflowY, 'a note saved before this update fits its text automatically');
    // The chalk font is part of the offline cache.
    ok(await page.evaluate(() => window.BOARD21_APPS.find(a => a.id === 'notes').files.includes('apps/notes/fonts/CrayonLibre-21Board.woff2')), 'the chalk font is listed for offline use');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Opened from disk (file://)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const url = 'file://' + path.join(ROOT, 'index.html').split(path.sep).join('/').replace(/^\/?/, '/');
    const a = await ctx.newPage();
    const errors = []; a.on('pageerror', e => errors.push(e.message));
    await a.goto(url); await a.waitForTimeout(600);
    await a.evaluate(() => { window.__board21.openApp('notes'); window.__board21.openApp('timer'); });
    await a.waitForTimeout(1500);
    ok((await a.evaluate(() => Array.from(window.__board21.state.wins.values()).every(w => w.connected))), 'sub-apps connect when index.html is opened from disk');
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
