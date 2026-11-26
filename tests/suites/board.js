// The board: windows, pages, touch, export and import, copy, dialogs, and menus.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, freeBoard, openSettings, setTheme, renamePage, fillNote, DEV_WIDGET, DRIVE_PICK,
    readFolder, setUpSync, linkFolder, syncDev, hear, eventually, stamped, STAMPED, SITES, marked, parts, boardUp,
    VID2, YT_TITLES, D1, RK, V1, VH, VIMEO_TITLES, VMSG, stubVideos, ytWin, ytLook, ytShow, picLook, picOpen,
    picFile, PMSG, BASE
  } = T;
  return [
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
    // switch to digital via the window menu → aspect 2.2. (Digital adds to Analog, so Analog comes off too.)
    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.waitForTimeout(200);
    await page.screenshot({ path: OUT + '10-window-menu.png' });
    await page.click('#menu [data-act="widget"][data-id="digital"]'); await page.waitForTimeout(500);
    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.waitForTimeout(200);
    await page.click('#menu [data-act="widget"][data-id="analog"]'); await page.waitForTimeout(500);
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
    await setTheme(page2, 'dark');
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
    await b.click('#modal .btn:has-text("Replace this page")'); // replace
    await b.waitForTimeout(1500);
    ok(JSON.stringify(await wins(b)) === JSON.stringify(['name-picker:1', 'notes:1']), 'replace import: windows match file (' + (await wins(b)).join(',') + ')');
    ok(await frameOf(b, 'notes:1').locator('textarea').inputValue() === 'Secret student info', 'replace import: content restored');
    const rects = await b.evaluate(() => Array.from(document.querySelectorAll('.win')).map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
    ok(rects.every(r => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= 1000.5 && r.y + r.h <= 700.5), 'imported windows scaled/fit to smaller screen (on screen)');
    ok(await b.evaluate(() => window.__board21.state.insts.has('dice:1') && !window.__board21.state.insts.get('dice:1').open), 'closed dice instance imported');

    // Add template on top → instances renumbered
    await b.setInputFiles('#import-input', tplPath);
    await b.waitForTimeout(300);
    await b.click('#modal .btn:has-text("Add to this page")'); // add
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
    await openSettings(b, [], 'right');
    await b.screenshot({ path: OUT + '22-settings.png' });
    await openSettings(b, ['bg'], 'right');
    await b.click('#settings [data-act="bg"][data-val="#1f3a2c"]');
    await b.waitForTimeout(600);
    ok(await b.evaluate(() => getComputedStyle(document.getElementById('desk')).backgroundColor) === 'rgb(31, 58, 44)', 'background color applied');
    await openSettings(b, ['advanced'], 'right');
    await b.locator('#settings .sheet-body').evaluate(el => el.scrollTop = 99999);
    await b.waitForTimeout(150);
    await b.screenshot({ path: OUT + '23-settings-bottom.png' });
    await b.click('#settings [data-act="corners"][data-val="left"]'); await b.waitForTimeout(200);
    ok(await b.locator('.picker-btn.right').isHidden(), 'picker corner setting hides right button');
    await b.keyboard.press('Escape');
    await b.screenshot({ path: OUT + '24-chalkboard.png' });
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
    // A finger slides a few millimetres while tapping: on a title bar that is still a tap (as it is on a button).
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__board21.state.settings.snapping = false; window.__board21.setRect('dice:1', { x: 700, y: 300, w: 360, h: 280 }); });   // (no snapping: a moved window is exactly where it was put)
    await page.waitForTimeout(200);
    const finger = async (x, y, dx, dy, steps = 1, rest = 250) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 5 }] }); await page.waitForTimeout(20);
      for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / steps, y: y + dy * i / steps, id: 5 }] }); await page.waitForTimeout(20); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(rest);
    };
    const dice = async () => (await wins(page))['dice:1'];
    const name = await page.locator('.win[data-ikey="dice:1"] .win-label').boundingBox();
    const d0 = await dice();
    await finger(name.x + name.width / 2, name.y + name.height / 2, 12, 4);
    let d1 = await dice();
    ok(await page.locator('#menu.open').count() === 1 && d1.x === d0.x && d1.y === d0.y, `a touch tap on the name that slides 12 px still opens the menu, and the window stays where it is (moved ${d1.x - d0.x}, ${d1.y - d0.y})`);
    await page.keyboard.press('Escape');
    const bar = { x: d0.x + d0.w - 40, y: d0.y + 20 };   // the title bar, beside the name
    await finger(bar.x, bar.y, 9, 3, 1, 40); await finger(bar.x, bar.y, -8, 4);
    ok(await page.evaluate(() => window.__board21.state.insts.get('dice:1').maximized === true), 'two touch taps on the title bar that each slide a little still fill the board');
    await page.evaluate(() => window.__board21.setMaximized('dice:1', false)); await page.waitForTimeout(400);   // (and past the double-tap time)
    await finger(bar.x, bar.y, -60, 0, 6);
    d1 = await dice();
    ok(d1.x === d0.x - 60 && d1.y === d0.y, `a touch drag of the title bar still moves the window, and keeps it under the finger (moved ${d1.x - d0.x}, ${d1.y - d0.y})`);
    // A mouse doesn't slide while clicking, and a resize handle has no tap to protect: both answer as before.
    await page.mouse.move(bar.x - 60, bar.y); await page.mouse.down(); await page.mouse.move(bar.x - 50, bar.y); await page.mouse.up(); await page.waitForTimeout(250);
    const d2 = await dice();
    ok(d2.x === d1.x + 10, `a 10 px mouse drag of the title bar moves the window 10 px (moved ${d2.x - d1.x})`);
    const grip = await page.locator('.win[data-ikey="dice:1"] .grip.e').boundingBox();
    await finger(grip.x + grip.width / 2, grip.y + grip.height / 2, 10, 0, 2);
    const d3 = await dice();
    ok(d3.w === d2.w + 10 && d3.x === d2.x, `a 10 px touch drag of a resize handle resizes by 10 px (${d3.w - d2.w})`);
    // At the board's top edge the top handle lies over part of the window's name. A tap there that slides is still
    // a tap on the name; a pull from the same spot still resizes.
    await page.evaluate(() => { window.__board21.setRect('dice:1', { x: 700, y: 0, w: 360, h: 280 }); window.__board21.focusWin('dice:1'); }); await page.waitForTimeout(200);
    const under = await page.evaluate(() => {   // a point of the name that the handle covers
      const w = document.querySelector('.win[data-ikey="dice:1"]'), g = w.querySelector('.grip.n'), r = w.querySelector('.win-label').getBoundingClientRect(), x = r.left + r.width / 2;
      for (let y = Math.ceil(r.top) + 1; y < r.bottom; y++) if (g.contains(document.elementFromPoint(x, y))) return { x, y };
      return null;
    });
    const d4 = await dice();
    if (under) await finger(under.x, under.y, 3, 12);
    const d5 = await dice();
    ok(under && await page.locator('#menu.open').count() === 1 && d5.y === d4.y && d5.h === d4.h, `a touch tap on the name under the top handle that slides 12 px opens the menu, and doesn’t resize the window (${under ? `top ${d5.y - d4.y}, height ${d5.h - d4.h}` : 'the handle doesn’t cover the name'})`);
    await page.keyboard.press('Escape');
    if (under) await finger(under.x, under.y, 0, 40, 4);
    const d6 = await dice();
    ok(under && await page.locator('#menu.open').count() === 0 && d6.y === d5.y + 40 && d6.h === d5.h - 40, `a 40 px touch pull down from there resizes the window by 40 px (top ${d6.y - d5.y}, height ${d6.h - d5.h})`);
    await ctx.close();
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
    await openSettings(page, ['advanced']); await page.waitForTimeout(350);
    await page.locator('#st-persist').scrollIntoViewIfNeeded();
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
    await setTheme(page, 'dark');
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
    await openSettings(page, ['advanced']);
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
  // ---- 2026.11.24-1: a row of short choices in a window menu (numbers, such as the Name Picker's Names at a time).
  ['Window menu: a row of choices', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('notes'));
    await eventually(() => page.evaluate(() => { const w = window.__board21.state.wins.get('notes:1'); return !!(w && w.connected && w.menuItems.length); }));
    await page.waitForTimeout(300);
    const f = page.frameLocator('.win[data-ikey="notes:1"] iframe');
    const ROW = (n, on, label = 'Names at a time') => ({ id: 'winners', label, choices: Array.from({ length: n }, (_, i) => ({ id: 'winners:' + (i + 1), label: String(i + 1), checked: i + 1 === on })) });
    const MENU6 = [{ heading: true, label: 'Names at a time' }, ROW(6, 3), { separator: true }, { id: 'other', label: 'Other' }];
    // The test's menu, in place of Notes' own (which Notes would otherwise send again, as when the theme changes), and
    // every id the widget hears from it.
    const setMenu = items => f.locator('body').evaluate((b, items) => {
      if (!window.__got) {
        window.__got = []; Board21.on('menu', id => window.__got.push(id));
        const set = Board21.menu.set; window.__set = items => set.call(Board21.menu, items); Board21.menu.set = () => Promise.resolve();
      }
      return window.__set(items);
    }, items);
    const got = () => f.locator('body').evaluate(() => window.__got.slice());
    const closeMenu = async () => { if (await page.locator('#menu.open').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
    const openMenu = async () => { await closeMenu(); await page.click('.win[data-ikey="notes:1"] .win-label'); await page.waitForTimeout(300); };
    const look = () => page.evaluate(() => {
      const row = document.querySelector('#menu .menu-choices'), ui = window.__board21.zoom.ui || 1;
      const sw = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).boxShadow : null; };
      return {
        row: row && { role: row.getAttribute('role'), name: row.getAttribute('aria-label') },
        bs: [...document.querySelectorAll('#menu .menu-choices button')].map(b => {
          const cs = getComputedStyle(b), r = b.getBoundingClientRect();
          return { text: b.textContent, id: b.dataset.id, role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), name: b.getAttribute('aria-label'),
            w: r.width / ui, h: r.height / ui, top: r.top / ui, radius: cs.borderRadius, bg: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow, fs: cs.fontSize, fw: cs.fontWeight };
        }),
        markup: document.querySelectorAll('#menu b, #menu img, #menu i, #menu script').length,
        swatchOn: sw('#menu .swatch[aria-checked="true"]'), swatchOff: sw('#menu .swatch[aria-checked="false"]'), swatchW: (() => { const e = document.querySelector('#menu .swatch'); return e ? e.getBoundingClientRect().width / ui : 0; })(),
        tokens: (() => { const t = document.createElement('i'); document.getElementById('menu').appendChild(t); const v = n => { t.style.color = `var(${n})`; return getComputedStyle(t).color; }; const out = { primary: v('--primary'), text: v('--text'), hover: v('--hover-bg') }; t.remove(); return out; })(),
        menuW: document.getElementById('menu').getBoundingClientRect().width / ui
      };
    });
    // Notes' own menu, for its swatches: a choice looks like one.
    const swatches = {};
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await setTheme(page, 'dark');
      await openMenu(); swatches[theme] = await look(); await closeMenu();
    }
    await setTheme(page, 'light');

    await setMenu(MENU6); await page.waitForTimeout(200);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await setTheme(page, 'dark');
      await openMenu();
      const L = await look(), on = L.bs.filter(b => b.checked === 'true'), off = L.bs.filter(b => b.checked !== 'true');
      if (theme === 'light') {
        ok(L.bs.length === 6 && L.bs.map(b => b.text).join() === '1,2,3,4,5,6' && L.bs.every(b => Math.abs(b.top - L.bs[0].top) < 0.5),
          `a row of 6 choices: 6 circles with their labels, on one line (${L.bs.map(b => b.text + '@' + Math.round(b.top)).join(' ')}; the menu ${Math.round(L.menuW)} px wide)`);
        const sw = swatches.light.swatchW;
        ok(sw > 20 && L.bs.length === 6 && L.bs.every(b => Math.abs(b.w - sw) < 0.6 && Math.abs(b.h - sw) < 0.6 && b.radius === '50%' && b.fs === '16px' && b.fw === '650'),
          `each a circle the size of Notes’ swatches, ${sw} px, its label 16 px at weight 650 (${L.bs.map(b => b.w.toFixed(1) + '×' + b.h.toFixed(1) + ' ' + b.fs + ' ' + b.fw).join(', ')})`);
        ok(L.row && L.row.role === 'group' && L.row.name === 'Names at a time' && L.bs.every(b => b.role === 'menuitemradio' && b.name === b.text && b.id === 'winners:' + b.text)
          && on.length === 1 && on[0].text === '3' && off.every(b => b.checked === 'false'),
          `the row is a group named “Names at a time”; each choice a menuitemradio named by its label, 3 checked (${JSON.stringify(L.row)}, ${L.bs.map(b => b.role + ' ' + b.name + ' ' + b.checked).join(', ')})`);
        ok(await page.getByRole('group', { name: 'Names at a time' }).getByRole('menuitemradio', { name: '3', checked: true }).count() >= 1,
          'so a screen reader says “Names at a time, 3, checked”');
      }
      const S = swatches[theme];
      ok(on.length === 1 && on[0].shadow === S.swatchOn && on[0].color === L.tokens.primary && off.every(b => b.shadow === S.swatchOff && b.color === L.tokens.text && b.bg === L.tokens.hover),
        `${theme}: the chosen one has the swatch’s ring and its label in the accent; the others the swatch’s faint edge, on the hover color (chosen: ${on[0] && on[0].shadow} / swatch: ${S.swatchOn}; others: ${off[0] && off[0].shadow} / ${S.swatchOff})`);
      await closeMenu();
    }
    await setTheme(page, 'light');

    // A tap sends its id, as a swatch's does; the arrow keys, Home, and End go through the choices.
    await openMenu();
    await page.click('#menu [data-id="winners:4"]');
    ok(await eventually(async () => (await got()).includes('winners:4')) && await page.locator('#menu.open').count() === 0, `tapping 4 sends “winners:4” to the widget, and the menu closes (${(await got()).join(', ')})`);
    await page.focus('.win[data-ikey="notes:1"] .win-label'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const at = () => page.evaluate(() => { const a = document.activeElement; return a.closest('#menu') ? (a.querySelector('.label') || a).textContent.trim() : a.tagName; });
    const walk = [await at()];
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home', 'ArrowUp', 'ArrowDown']) { await page.keyboard.press(key); walk.push(await at()); }
    ok(walk.join(', ') === '1, 2, 3, 2, Close, 1, Close, 1', `the arrow keys, Home, and End move through the choices (${walk.join(', ')})`);
    // The keyboard's ring shows on the chosen one too: outside its ring, not under it.
    const ringOf = () => page.evaluate(() => {
      const a = document.activeElement, cs = getComputedStyle(a);
      const reach = Math.max(0, ...cs.boxShadow.split(/,(?![^(]*\))/).filter(s => !/inset/.test(s)).map(s => parseFloat((s.match(/-?[\d.]+px/g) || [])[3]) || 0));
      return { label: a.textContent, shown: a.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, offset: parseFloat(cs.outlineOffset), reach };
    });
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    const chosenRing = await ringOf();
    await page.keyboard.press('ArrowUp');
    const otherRing = await ringOf();
    await page.keyboard.press('ArrowUp');
    ok(chosenRing.label === '3' && chosenRing.shown && chosenRing.reach >= 5 && chosenRing.offset > chosenRing.reach && otherRing.label === '2' && otherRing.shown && otherRing.offset > otherRing.reach,
      `the keyboard’s ring shows outside the chosen one’s ring (3: ${chosenRing.offset} px out, its ring ${chosenRing.reach} px; 2: ${otherRing.offset} px out, no ring)`);
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
    const six = await at(); await page.keyboard.press('ArrowDown');
    ok(six === '6' && await at() === 'Other', `and on past the last choice (${six}, then ${await at()})`);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    ok(await eventually(async () => (await got()).slice(-1)[0] === 'winners:6'), 'Enter on a choice sends its id');
    await closeMenu();

    // At most 12 in a row; a label shows at most 3 characters, always as text.
    await setMenu([ROW(15, 1)]); await page.waitForTimeout(200); await openMenu();
    let L = await look();
    ok(L.bs.length === 12 && L.bs.map(b => b.text).join() === '1,2,3,4,5,6,7,8,9,10,11,12', `15 choices: the first 12 show (${L.bs.length})`);
    await setMenu([{ id: 'r', label: '<img src=x onerror="window.top.__pwned = 1">', choices: [{ id: 'a', label: '1234' }, { id: 'b', label: 'Seven', checked: true }, { id: 'c', label: '<b>bold</b>' }, { id: 'd', label: '<i' }, { id: '', label: 'no id' }, { id: 'e', label: '' }, { id: 'f', label: '   ' }, { id: 'g' }] }]);
    await page.waitForTimeout(200); await openMenu();
    L = await look();
    ok(L.bs.map(b => b.text).join('|') === '123|Sev|<b>|<i' && L.bs.map(b => b.name).join('|') === '123|Sev|<b>|<i',
      `a label of 4 or more characters shows 3 (“1234” → ${L.bs[0] && L.bs[0].text}, “Seven” → ${L.bs[1] && L.bs[1].text}); a choice with no id or no label is left out (${L.bs.map(b => b.text).join('|')})`);
    ok(!L.markup && L.row && L.row.name === '<img src=x onerror="window.top.__pwned = 1">' && !(await page.evaluate(() => window.__pwned)),
      `labels with markup show as text, never markup (${L.markup} elements; the row named ${L.row && L.row.name})`);
    await closeMenu();
    const items = await page.evaluate(() => window.__board21.state.wins.get('notes:1').menuItems);
    ok(items.length === 1 && items[0].choices.length === 4 && items[0].choices.every(c => typeof c.id === 'string' && c.id.length <= 64 && typeof c.label === 'string' && [...c.label].length <= 3 && typeof c.checked === 'boolean'),
      `the board keeps only ids, short labels and checked (${JSON.stringify(items[0])})`);
    // A wide label of 3 characters gets smaller letters, so all of it shows, in a menu of any size. One that fits keeps
    // its size. Every choice is the size of a swatch in the same menu.
    const DAYS = { id: 'day', label: 'Day', choices: ['Mon', 'Wed', 'XXL', 'WWW', '12', '7'].map((l, i) => ({ id: 'day:' + i, label: l, checked: i === 1 })) };
    const labels = () => page.evaluate(() => ({ cls: document.getElementById('menu').className.replace(/\b(menu|open)\b/g, '').trim() || 'roomy',
      sw: (e => e ? e.getBoundingClientRect().width : 0)(document.querySelector('#menu .swatch')),
      bs: [...document.querySelectorAll('#menu .menu-choice')].map(b => { const r = document.createRange(); r.selectNodeContents(b);
        return { text: b.textContent, w: r.getBoundingClientRect().width, room: b.getBoundingClientRect().width, fs: parseFloat(getComputedStyle(b).fontSize) }; }) }));
    // (More items above the row make the menu compact, then tight: the first menu of each kind is checked.)
    const kinds = [], KINDS = ['roomy', 'compact', 'compact tight'];
    for (let pad = 0; pad <= 22 && kinds.length < KINDS.length; pad = pad ? pad + 1 : 10) {   // (22 and the two rows: the 24 a menu holds)
      await setMenu(Array.from({ length: pad }, (_, i) => ({ id: 'i' + i, label: 'Item ' + i })).concat([DAYS, { id: 'col', label: 'Color', swatches: [{ id: 'col:y', label: 'Yellow', color: '#fef08a' }] }])); await page.waitForTimeout(200); await openMenu();
      const F = await labels(), fs = t => (F.bs.find(b => b.text === t) || {}).fs;
      if (F.cls !== KINDS[kinds.length]) { await closeMenu(); continue; }
      kinds.push(F.cls);
      ok(F.bs.length === 6 && F.bs.every(b => b.w <= b.room * 0.8 + 0.5) && fs('12') === fs('7') && fs('WWW') < fs('7'),
        `${F.cls} menu: every label inside its circle, a wide one in smaller letters (${F.bs.map(b => `${b.text} ${b.w.toFixed(1)}/${b.room.toFixed(1)} px at ${b.fs.toFixed(1)}`).join(', ')})`);
      ok(F.sw > 20 && F.bs.every(b => Math.abs(b.room - F.sw) < 0.6), `${F.cls} menu: each choice the size of the swatch beside it (${F.bs[0] && F.bs[0].room.toFixed(1)} px, the swatch ${F.sw.toFixed(1)} px)`);
      await closeMenu();
    }
    ok(kinds.join() === 'roomy,compact,compact tight', `in a roomy, a compact, and a tight menu (${kinds.join(' | ')})`);
    await setMenu([{ id: 'r', label: 'Long', choices: [{ id: 'x'.repeat(200), label: '9' }] }]); await page.waitForTimeout(200);
    ok((await page.evaluate(() => window.__board21.state.wins.get('notes:1').menuItems[0].choices[0].id.length)) === 64, 'an id is cut to 64 characters');
    // The row counts as one of the 24 items.
    await setMenu(Array.from({ length: 23 }, (_, i) => ({ id: 'i' + i, label: 'Item ' + i })).concat([ROW(6, 1), { id: 'late', label: 'Late' }])); await page.waitForTimeout(200);
    const many = await page.evaluate(() => window.__board21.state.wins.get('notes:1').menuItems);
    ok(many.length === 24 && !!many[23].choices && many[23].choices.length === 6, `the row is one of the 24 items (${many.length}; the 24th ${many[23] && many[23].choices ? 'is the row' : 'isn’t'})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // Outside the board: the SDK's stand-in menu lists each choice as an option, with ✓ on the chosen one.
    const sctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const sp = await sctx.newPage(); sp.on('pageerror', e => errors.push('[standalone] ' + e.message));
    await sp.goto(BASE + 'widgets/notes/index.html#b21-bare');
    await sp.waitForFunction(() => window.Board21 && Board21.context && Board21.context.standalone);
    await sp.evaluate(MENU6 => { window.__got = []; Board21.on('menu', id => window.__got.push(id)); return Board21.menu.set(MENU6); }, MENU6);
    const opts = await sp.evaluate(() => [...document.querySelectorAll('select option')].map(o => o.textContent));
    ok(opts.includes('Names at a time: 1') && opts.includes('✓ Names at a time: 3') && opts.filter(o => /^(✓ )?Names at a time: \d$/.test(o)).length === 6,
      `the standalone menu lists “Names at a time: 3”, with ✓ on the chosen one (${opts.join(' | ')})`);
    await sp.selectOption('select', 'winners:5');
    ok(await eventually(() => sp.evaluate(() => window.__got.includes('winners:5'))), 'choosing one there sends its id');
    const sdkV = await sp.evaluate(() => Board21.version), atLeast = (v, w) => { const a = v.split('.').map(Number), b = w.split('.').map(Number); return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))); };
    ok(atLeast(sdkV, '1.5.0'), `the SDK that knows a row of choices is 1.5.0 or later (${sdkV})`);
    await sctx.close();

    // The widget dev window warns about a row the board would cut.
    const dctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const dp = await dctx.newPage();
    await dp.goto(BASE + 'sdk/lab.html'); await dp.waitForTimeout(400);
    const menu13 = `Board21.menu.set([{ heading: true, label: 'Names at a time' }, { id: 'n', label: 'Names at a time', choices: Array.from({ length: 11 }, (_, i) => ({ id: 'n:' + i, label: String(i + 1) })).concat([{ id: 'n:four', label: 'Four' }, { id: 'n:blank', label: ' ' }]) }]);`;
    const src = DEV_WIDGET(BASE + 'sdk/board21.js').replace(/Board21\.menu\.set\(\[\{ id: 'add'[^\n]*\]\);/, menu13);
    await dp.fill('#code', src); await dp.click('#run');
    const titles = () => dp.evaluate(() => window.__board21DevWindow ? window.__board21DevWindow.state().checks.map(c => c.title) : []);
    ok(src.includes(menu13) && await eventually(async () => (await titles()).some(t => /13 choices/.test(t)), 10000) && (await titles()).some(t => /Four/.test(t) && /3 characters/.test(t))
      && (await titles()).some(t => t === 'Choice “n:blank” has no label'),
      `the dev window’s Checks warn about 13 choices in a row, a label longer than 3 characters, and a choice with no label (${(await titles()).join(' | ')})`);
    await dctx.close();
    const aiPrompt = fs.readFileSync(path.join(ROOT, 'docs', 'AI-PROMPT.md'), 'utf8');
    ok(/- \[ \] Menu: [^\n]*swatches `#hex` and choices of 3 characters or fewer/.test(aiPrompt), 'docs/AI-PROMPT.md’s checklist has the row of choices');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  // ---- (end of Lotto slot)
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
    const st = await page.evaluate(() => { const f = document.querySelector('.win[data-ikey="name-picker:1"] iframe'); const r = f.getBoundingClientRect(); const k = r.width / f.clientWidth; const b = f.contentDocument.getElementById('status').getBoundingClientRect(); return { x: r.left + (b.left + b.width / 2) * k, y: r.top + (b.top + b.height / 2) * k }; });
    await mouseDrag(st.x, st.y, -40, 0);   // (on its status line: the stage can be a style's canvas, which never moves a window)
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
  ['Copy: words no other suite checks (Widget Picker tooltips and its name, closing a window, Delete page with closed windows, Duplicate, Calendar, Timer, Task Timer, Board Sync with several devices, a photo that can’t be used, the widget dev window and lab, the docs)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    // The Widget Picker: its name, and for each widget a tooltip of one short sentence that starts with a verb.
    const tips = await page.evaluate(() => Object.fromEntries(window.__board21.catalog().map(w => [w.id, w.description])));
    const want = { timer: 'Count down with presets and an alarm.', 'task-timer': 'Count down a schedule of activities on a pie, with an alarm.', calendar: 'See the month, with today highlighted.',
      clock: 'Show the time, analog or digital, and the date.', notes: 'Write directions, reminders, or the day’s agenda.', 'name-picker': 'Pick names at random, or make groups and brackets.',
      'first-then-board': 'Pick a First card and a Then card, and mark each one done.', dice: 'Roll one to six dice.', 'traffic-light': 'Show noise level or work time in red, yellow, and green.',
      'youtube-player': 'Play a video from YouTube, Google Drive, or Vimeo.', image: 'Show a picture you open or paste.', '21sketch': 'Draw with the district’s whiteboard app.',
      '21timer': 'Run the district’s classroom timer app.', '21doccam': 'Show work with the district’s document camera app.', 'zones-check-in': 'Check in on how your class feels.',
      weather: 'See the weather and what to wear.' };
    const offTips = Object.keys(want).filter(id => tips[id] !== want[id]);
    ok(!offTips.length, `each widget’s tooltip says what it does in one sentence that starts with a verb${offTips.length ? ': ' + offTips.map(id => `${id} “${tips[id]}”`).join(', ') : ''}`);
    const guideTiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'teacher-guide', 'tiles.json'), 'utf8')), offGuide = guideTiles.filter(t => t.description !== tips[t.id]);
    ok(guideTiles.length >= 15 && !offGuide.length, `the Teacher Guide’s tiles.json has each widget’s tooltip${offGuide.length ? ': ' + offGuide.map(t => `${t.id} “${t.description}”`).join(', ') : ''}`);
    const panelName = await page.evaluate(() => [document.getElementById('panel').getAttribute('aria-label'), ...['export', 'import', 'quit'].map(c => document.querySelector(`#panel [data-ctl="${c}"]`).getAttribute('aria-label'))].join(' | '));
    ok(panelName === 'Widget Picker | Export board | Import board | Quit 21Board', `screen readers hear the Widget Picker by its name, and its buttons by what they do (${panelName})`);

    // Closing a window, and Close all.
    await page.evaluate(() => window.__board21.openWidget('notes')); await page.waitForTimeout(600);
    await page.evaluate(() => window.__board21.closeWin('notes:1')); await page.waitForTimeout(300);
    const closedSays = await page.evaluate(() => Array.from(document.querySelectorAll('#toasts .toast span'), t => t.textContent).join(' | '));
    ok(/Notes closed\. It’s saved\. Open it again from the Widget Picker\./.test(closedSays), `closing a window: “Notes closed. It’s saved. Open it again from the Widget Picker.” (${closedSays})`);

    // Delete page: the closed windows in a sentence of their own, not in parentheses.
    await page.evaluate(() => window.__board21.pages.create({ end: true, name: 'Two' })); await page.waitForTimeout(600);
    for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__board21.openWidget('notes')); await page.waitForTimeout(300); }
    await page.evaluate(() => { window.__board21.closeWin('notes:2'); window.__board21.closeWin('notes:3'); }); await page.waitForTimeout(400);
    const deleteSays = async () => { await page.evaluate(() => { window.__board21.pages.remove(); }); await page.waitForSelector('#modal.open');
      const t = (await page.locator('#modal.open p').innerText()).replace(/\s+/g, ' '); await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.waitForTimeout(200); return t; };
    let del = await deleteSays();
    ok(del === 'This page and its 1 window are deleted from this device. So are 2 closed windows.', `Delete page with closed windows: “${del}”`);
    await page.evaluate(() => window.__board21.openWidget('notes')); await page.waitForTimeout(400);
    del = await deleteSays();
    ok(del === 'This page and its 2 windows are deleted from this device. So is 1 closed window.', `and with one closed window: “${del}”`);

    // Duplicate this page: “Page 3 · Two (copy) is ready.”, as New page says “Page 3 is ready.”
    await page.evaluate(() => window.__board21.pages.duplicate()); await page.waitForTimeout(900);
    const dupSays = await page.evaluate(() => Array.from(document.querySelectorAll('#toasts .toast span'), t => t.textContent));
    ok(dupSays.some(t => /^Page 3 · .+ is ready\.$/.test(t)) && !dupSays.some(t => / is a copy\.$/.test(t)), `Duplicate this page says the copy is ready (${dupSays.join(' | ')})`);

    // Calendar: “Week starts on” once, as a heading. Timer: Play sound, as Task Timer says it.
    const menuOf = ik => page.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.map(i => i.heading ? `[${i.label}]` : (i.checked ? '✓ ' : '') + i.label).join(' | '), ik);
    for (const id of ['calendar', 'timer', 'task-timer']) await page.evaluate(id => window.__board21.openWidget(id), id);
    ok(await eventually(async () => /\[Week starts on\] \| ✓ Sunday \| Monday/.test(await menuOf('calendar:1'))), `Calendar’s menu says “Week starts on” once, as a heading (${await menuOf('calendar:1')})`);
    ok(await eventually(async () => /(^| \| )Play sound( \||$)/.test(await menuOf('timer:1'))), `Timer’s menu says “Play sound” (${await menuOf('timer:1')})`);
    ok(await eventually(async () => await menuOf('task-timer:1') === 'Start | Start over | Next activity | Reset activity | Edit schedule'), `Task Timer’s menu in sentence case, “activity” for each item (${await menuOf('task-timer:1')})`);
    const tt = page.frameLocator('.win[data-ikey="task-timer:1"] iframe');
    // With no activities: one name for the action, as in the editor, and “Tap to add one” once, on the dial.
    const emptyTT = () => tt.locator('html').evaluate(() => [document.getElementById('btn-playpause').textContent, document.getElementById('clock-next-task').textContent].join(' | '));
    ok(await eventually(async () => await emptyTT() === '➕ Add activity | '), `Task Timer with no activities says “Add activity” and its hint once (${await emptyTT()})`);
    await tt.locator('#btn-edit').click();
    const ed = await tt.locator('html').evaluate(() => { const b = document.querySelector('.btn-test-sound'); return [document.querySelector('.edit-header-title').textContent, document.querySelector('.total-time-label').textContent, document.getElementById('btn-mode-sum').textContent.replace(/:.*/, ''), document.getElementById('btn-mode-custom').textContent, document.querySelector('.editor-footer .primary').textContent, b.textContent, b.title, b.getAttribute('aria-label')].join(' | '); });
    ok(ed === '📅 Schedule | ⏱ Total time | Σ Activities | ⏱ Fixed time | + Add activity | 🔊 Play sound | Play sound | Play sound', `Task Timer’s editor: short labels, and “Play sound” as on the Timer (${ed})`);

    // Settings › Board Sync with one, two and three other devices: the latest change, and which device made it.
    const shared = await page.evaluate(() => {
      const L = window.__board21.link, keep = { sync: L.sync, files: L.files }, now = Date.now(), out = [];
      for (const n of [1, 2, 3]) {
        const peers = {}, files = new Map();
        [['a', 'the laptop', 2], ['b', 'the smartboard', 40], ['c', 'Room 14 desktop', 95]].slice(0, n).forEach(([d, name, min]) => { peers[d] = { name, at: now - min * 6e4 }; files.set('f-' + d, { dev: d, name: 'f-' + d }); });
        L.sync = { peers }; L.files = files;
        out.push(L.status().replace(/(at|on [A-Z][a-z]{2} \d{1,2} at) \d{1,2}:\d\d\s?[AP]M/g, 'WHEN'));
      }
      L.sync = keep.sync; L.files = keep.files;
      return out;
    });
    ok(shared.join(' | ') === 'Up to date. Shared with the laptop. Last change WHEN. | Up to date. Shared with the laptop and the smartboard. Last change from the laptop WHEN. | Up to date. Shared with the laptop, the smartboard, and 1 other. Last change from the laptop WHEN.',
      `Board Sync names the device with the latest change, once (${shared.join(' | ')})`);

    // A background photo that can’t be used says JPEG, as the Picture widget does.
    const photoSays = async file => { await page.setInputFiles('#photo-input', file); await page.waitForSelector('#modal.open');
      const t = (await page.locator('#modal.open p').innerText()).replace(/\s+/g, ' '); await page.locator('#modal.open .btn', { hasText: 'OK' }).click(); await page.waitForTimeout(200); return t; };
    const notPic = await photoSays({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    const badPic = await photoSays({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
    ok(notPic === 'Choose a JPEG, PNG, or WebP picture.' && badPic === 'This picture can’t be opened here. Save it as a JPEG or PNG, then try again.', `a photo that can’t be used: “${notPic}” “${badPic}”`);

    // README and the docs: the glossary’s words and its style.
    const doc = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\s+/g, ' ');
    const readme = doc('README.md'), sdkDoc = doc('docs/WIDGET-SDK.md'), aiDoc = doc('docs/AI-PROMPT.md'), devJs = doc('sdk/board21-dev.js');
    const docOff = [
      [/widget dev window/i.test(readme), 'README says “widget dev window”'],
      [/uploaded widget/i.test(readme + aiDoc), '“uploaded widget”'],
      [/e\.g\. when a timer ends|\(e\.g\. `https:/.test(sdkDoc), 'WIDGET-SDK says “e.g.”'],
      [!/Storage used, kiosk mode, and/.test(readme) || !/use system fonts, and draw/.test(devJs), 'a list of three without its serial comma'],
      [!/It needs Chrome 84 or later, or Safari 16\.4 or later\. As a Home Screen app, it needs Safari 18\.4 or later\./.test(readme), 'Stay awake’s versions without “or later”'],
      [!/Choose Early readers on the laptop, and the smartboard/.test(readme), 'Board Sync’s “there”'],
      [/needs a connection/.test(readme), 'the district apps’ offline message in its old words']
    ].filter(([bad]) => bad).map(([, w]) => w);
    ok(!docOff.length, `README and the docs follow the glossary (${docOff.join('; ') || 'all fine'})`);
    // The tagline, Tyler's words, in the README, the app's manifest and the page's description.
    const rawReadme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    const pageDesc = (/<meta name="description" content="([^"]*)">/.exec(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) || [])[1];
    const oldTag = ['README.md', 'manifest.webmanifest', 'index.html', 'docs/WIDGET-SDK.md', 'docs/AI-PROMPT.md', 'docs/DATA-FORMAT.md'].filter(f => /curate|orchestrate/i.test(doc(f)));
    ok(rawReadme.split('\n')[2] === '**Build your own suite of smartboard widgets**' && manifest.description === 'Build your own suite of smartboard widgets' && pageDesc === 'Build your own suite of smartboard widgets' && !oldTag.length,
      `the tagline is “Build your own suite of smartboard widgets” in the README, the manifest and the page (${manifest.description} / ${pageDesc}; old words in ${oldTag.join(', ') || 'none'})`);
    const dataDocs = doc('docs/DATA-FORMAT.md');
    ok(!/Not yet tried on a real kiosk/i.test(readme) && !/ready in its repository/.test(readme) && !/Each needs its own|We tested/.test(readme), 'the README no longer says 21Board is untried on a real kiosk');
    ok(/\*\*This page ▸ Windows:\*\*/.test(readme) && !/Saved widgets/.test(readme + dataDocs + doc('docs/ROADMAP.md')) && /name: "Page 1"/.test(dataDocs), 'the README and the docs say “Windows” for This page’s windows, and the data format guide names a new board’s first page “Page 1”');

    // The widget dev window's ⋯ menu, and the widget lab.
    const dv = await ctx.newPage();   // (no error listener: the test widget throws on purpose, see DEV_WIDGET)
    await dv.goto(BASE + '__dev/widget.html'); await dv.waitForTimeout(2500);
    const more = await dv.evaluate(() => Array.from(document.getElementById('b21-dev').shadowRoot.querySelectorAll('.pop button'), b => b.textContent).join(' | '));
    ok(more === 'Reload the widget | Reset size and data | Open another window | Switch board shape | Show the widget on its own | Copy for 21Board | How this works', `the dev window’s ⋯ menu says each thing in a few words (${more})`);
    await dv.goto(BASE + 'sdk/lab.html'); await dv.waitForTimeout(500);
    const lab = (await dv.locator('#editor p').first().innerText()).replace(/\s+/g, ' ');
    ok(lab === 'Paste a widget’s whole HTML file, or drop or open the file. Then tap Try it to open it in a real 21Board window. It runs in a sandbox with its own empty storage, so it can’t see your boards.', `the widget lab says what to do (${lab})`);
    await dv.close();

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Dialogs: a name, the keyboard stays inside and goes back where it was', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(DRIVE_PICK);   // (for a text field in Settings: Board Sync → This device’s name)
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + ''); await boardUp(page);
    await page.evaluate(() => { window.__board21.history.cfg({ skipOpen: true }); window.__board21.openWidget('timer'); window.__board21.openWidget('notes'); });
    const timer = page.frameLocator('.win[data-ikey="timer:1"] iframe');
    await timer.locator('button').first().waitFor(); await page.waitForTimeout(400);
    // Where the keyboard is: in the dialog or not, and on what.
    const at = () => page.evaluate(() => { const a = document.activeElement, d = a.dataset || {}; return { modal: !!a.closest('#modal'), tag: a.tagName, on: (a.textContent || '').trim(), act: d.act || d.ctl || '', cls: String(a.className), title: a.title || '' }; });
    const press = async (key, n) => { const seen = []; for (let i = 0; i < n; i++) { await page.keyboard.press(key); seen.push(await at()); } return seen; };
    const inside = seen => seen.every(s => s.modal), names = seen => seen.map(s => s.tag === 'INPUT' ? 'field' : s.on.replace(/^(Full backup|Blank template).*/, '$1')).join(', ');
    const open = () => page.waitForSelector('#modal.open'), closed = () => page.waitForSelector('#modal', { state: 'hidden' });
    const drop = name => page.evaluate(name => {   // a .21board file dropped on the board: a dialog nobody pressed a button for
      const dt = new DataTransfer();
      dt.items.add(new File([JSON.stringify({ format: '21board', formatVersion: 1, kind: 'template', board: { name: 'Other board' }, instances: [] })], name));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
    }, name);

    // A question with two buttons, opened from Settings by keyboard.
    await page.focus('.picker-btn.left'); await page.keyboard.press('Enter');
    await page.focus('[data-ctl="settings"]'); await page.keyboard.press('Enter');
    await page.waitForSelector('#settings.open [data-act="group"][data-val="saved"]');
    await page.focus('#settings [data-act="group"][data-val="saved"]'); await page.keyboard.press('Enter');   // (This page → Windows opens)
    ok((await at()).act === 'group' && await page.locator('#settings [data-val="saved"][aria-expanded="true"]').count() === 1, 'a group in Settings opens by keyboard, and the keyboard stays on its row');
    await page.waitForSelector('#settings.open [data-act="inst-delete"]');
    await page.focus('#settings [data-act="inst-delete"]'); await page.keyboard.press('Enter'); await open();
    ok(await page.getByRole('dialog', { name: 'Delete Notes?', exact: true }).count() === 1, 'a dialog is announced by its title (“Delete Notes?”)');
    ok(/^Its window and everything in it are deleted\./.test(await page.locator('#modal').evaluate(m => (document.getElementById(m.getAttribute('aria-describedby')) || {}).textContent || '')), 'and its message is read with it');
    let seen = await press('Tab', 5);
    ok(inside(seen) && names(seen) === 'Cancel, Delete, Cancel, Delete, Cancel', `Tab goes round the dialog’s buttons and never out to the board behind it (${names(seen)})`);
    seen = await press('Shift+Tab', 5);
    ok(inside(seen) && names(seen) === 'Delete, Cancel, Delete, Cancel, Delete', `so does Shift+Tab (${names(seen)})`);
    await page.click('#modal .modal-card p');   // a click on the dialog's text takes the keyboard off its buttons
    const off = await at();
    seen = await press('Tab', 1);
    await page.evaluate(() => document.activeElement.blur());
    seen = seen.concat(await press('Shift+Tab', 1));
    ok(!off.modal && inside(seen) && names(seen) === 'Delete, Cancel', `with the keyboard somewhere else, Tab comes into the dialog (first button) and Shift+Tab too (last) (${names(seen)})`);
    await page.keyboard.press('Escape'); await closed();
    let back = await at();
    ok(back.act === 'inst-delete' && await page.locator('#settings.open').count() === 1 && await page.evaluate(() => window.__board21.state.insts.has('notes:1')), `Escape closes the dialog only, and the keyboard is back on the button that opened it (${back.tag} ${back.act})`);

    // A key held down a moment too long (it repeats) answers nothing.
    const state = () => page.evaluate(() => ({ open: document.getElementById('modal').classList.contains('open'), notes: window.__board21.state.insts.has('notes:1') }));
    const hold = async n => { for (let i = 0; i < n; i++) { await page.keyboard.down('Enter'); await page.waitForTimeout(40); } };   // (a key that is down already repeats)
    await page.keyboard.down('Enter'); await open();   // on the Delete button of Settings: the dialog opens, with its own “Delete” first
    await hold(3);
    let st = await state();
    ok(st.open && st.notes, 'Enter held on the button that opens a dialog doesn’t go on to answer the dialog');
    await page.keyboard.up('Enter');
    await page.keyboard.press('Tab');   // to Cancel
    await page.keyboard.down('Enter'); await closed();
    await hold(3);
    st = await state(); back = await at();
    ok(!st.open && st.notes && back.act === 'inst-delete', 'Enter held on Cancel closes the dialog, and doesn’t press the button behind it again (which would ask again, then delete)');
    await page.keyboard.up('Enter');

    // A dialog that takes the place of another hands the place on.
    await page.keyboard.press('Enter'); await open();
    ok((await at()).modal, 'once the key is let go, Enter opens the dialog again');
    await drop('Other board.21board');
    await page.waitForSelector('#modal.open h3:has-text("Import “Other board”?")');
    ok((await at()).modal, 'a dialog that replaces another takes the keyboard');
    await page.keyboard.press('Escape'); await closed();
    back = await at();
    ok(back.act === 'inst-delete', `and gives it back to where it was before the first one (${back.tag} ${back.act})`);

    // A dialog with a text field (Board history → Save this version now).
    await page.focus('#settings [data-act="hist-open"]'); await page.keyboard.press('Enter');
    await page.waitForSelector('#history.open [data-act="save"]');
    await page.focus('#history [data-act="save"]'); await page.keyboard.press('Enter'); await open();
    const start = await at();
    seen = (await press('Tab', 3)).concat(await press('Shift+Tab', 1));
    ok(start.tag === 'INPUT' && inside(seen) && names(seen) === 'Save, Cancel, field, Cancel', `a dialog’s text field is part of the round (${names(seen)})`);
    await page.keyboard.press('Escape'); await closed();
    back = await at();
    ok(back.act === 'save' && await page.locator('#history.open').count() === 1, `and Escape puts the keyboard back on “Save this version now” (${back.tag} ${back.act})`);
    // Held keys there too: in this dialog Enter is answered by the text field itself, not by a button.
    const kept = () => page.evaluate(() => window.__board21.history.metas.filter(m => m.manual).length);   // versions saved by hand
    await page.keyboard.down('Enter'); await open();   // on “Save this version now”
    await hold(3);
    st = await state();
    ok(st.open && (await at()).tag === 'INPUT' && await kept() === 0, 'Enter held on “Save this version now” opens its dialog and doesn’t go on to answer it: nothing is saved yet');
    await page.keyboard.up('Enter');
    await page.keyboard.type('Monday setup');
    await page.keyboard.down('Enter'); await hold(3);   // (it repeats at once: the keyboard is back on the button, which is still there until the version is saved)
    await page.keyboard.up('Enter');
    await page.waitForSelector('.toast:has-text("Version saved.")');
    st = await state();
    ok(!st.open && await kept() === 1, 'Enter held in the name field saves the version once, and doesn’t press “Save this version now” again behind the dialog (which would ask again)');
    await page.keyboard.press('Escape');   // (closes Board history)

    // Opened from the Widget Picker, which closes first: back to the ▦ button that opened the Picker.
    await page.focus('.picker-btn.right'); await page.keyboard.press('Enter');
    await page.focus('[data-ctl="export"]'); await page.keyboard.press('Enter'); await open();
    seen = await press('Tab', 3);
    ok(inside(seen) && names(seen) === 'Blank template, Cancel, Full backup', `Export’s three choices are a round too (${names(seen)})`);
    await page.keyboard.press('Escape'); await closed();
    back = await at();
    ok(/picker-btn/.test(back.cls) && /right/.test(back.cls), `after a dialog opened from the Widget Picker, the keyboard is on the ▦ button it was opened with (${back.tag}.${back.cls})`);

    // Working in a widget when a dialog comes up: the keyboard goes to the dialog, then back into the widget.
    await timer.locator('button', { hasText: '1m' }).focus();
    await drop('Other board.21board'); await open();
    const took = await at();
    await page.keyboard.press('Escape'); await closed();
    back = await at();
    const inWidget = await page.evaluate(() => document.querySelector('.win[data-ikey="timer:1"] iframe').contentDocument.hasFocus());
    ok(took.modal && back.tag === 'IFRAME' && back.title === 'Timer' && inWidget, `a dialog takes the keyboard from a widget and gives it back to that widget (in the dialog: ${took.modal}; afterwards: ${back.tag} ${back.title})`);
    const note = await page.locator('.win[data-ikey="notes:1"] iframe').boundingBox();
    await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
    back = await at();
    ok(back.tag === 'IFRAME' && back.title === 'Notes', `and a tap in another widget afterwards is still seen as that widget (${back.tag} ${back.title})`);
    // Typing in a Settings field when a dialog comes up: the field isn't taken up again afterwards (a tablet would
    // bring up its keyboard, and Settings leaves a field that is in use alone), so Settings shows what has changed.
    await page.evaluate(() => window.__board21.link.choose());
    await openSettings(page, ['saved']);
    const count = () => page.locator('#settings [data-act="group"][data-val="saved"] .v').textContent();
    const before = await count();
    await page.focus('#set-link-label');
    await drop('Other board.21board'); await open();
    await page.locator('#modal.open .btn', { hasText: 'Replace this page' }).click();
    await page.waitForSelector('.toast:has-text("Board imported.")');
    back = await at();
    const after = await count();
    ok(back.tag !== 'INPUT' && before === '2 windows' && after === 'None', `the keyboard isn’t put back into a text field, so Settings shows the imported board (Windows: ${before} → ${after})`);
    await ctx.close();

    // A window menu by keyboard: the arrow keys, Home and End go from item to item (Tab too); Enter chooses one and
    // leaves the keyboard on the window's name, as Escape does; a heading names the items under it for screen readers.
    const mctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const mp = await mctx.newPage(); mp.on('pageerror', e => errors.push(e.message));
    await mp.goto(BASE); await boardUp(mp); await freeBoard(mp);
    await mp.evaluate(() => window.__board21.openWidget('name-picker'));
    await mp.waitForFunction(() => (window.__board21.state.conf.get('name-picker:1') || {}).style === 'wheel');
    await mp.waitForTimeout(400);
    const where = () => mp.evaluate(() => { const a = document.activeElement; return a.closest('#menu') ? (a.querySelector('.label') || a).textContent.trim() : a.classList.contains('win-label') ? 'the window’s name' : a.tagName; });
    const style = () => mp.evaluate(() => window.__board21.state.conf.get('name-picker:1').style);
    await mp.focus('.win[data-ikey="name-picker:1"] .win-label'); await mp.keyboard.press('Enter');
    const walk = [await where()];
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'ArrowDown', 'Home', 'ArrowUp']) { await mp.keyboard.press(key); walk.push(await where()); }
    ok(walk.join(', ') === 'Edit names, Big name, Spinning wheel, Big name, Close, Edit names, Edit names, Close', `the arrow keys, Home and End go from item to item, round from the last to the first (${walk.join(', ')})`);
    await mp.keyboard.press('Home'); for (let i = 0; i < 3; i++) await mp.keyboard.press('ArrowDown'); await mp.keyboard.press('Enter');
    ok(await eventually(async () => await style() === 'spotlight') && await mp.locator('#menu.open').count() === 0 && await where() === 'the window’s name', `Enter chooses one (Spotlight), closes the menu and leaves the keyboard on the window’s name (${await where()})`);
    await mp.keyboard.press('Enter');
    ok(await mp.getByRole('group', { name: 'Names at a time' }).getByRole('menuitemradio').count() === 6
      && await mp.getByRole('group', { name: 'Names at a time' }).getByRole('menuitemradio', { name: '1', checked: true }).count() === 1
      && await mp.getByRole('group', { name: 'Pick with' }).getByRole('menuitemcheckbox', { name: 'Spotlight', checked: true }).count() === 1,
      'screen readers hear each heading with the items under it (“Names at a time”: 1 to 6, 1 checked; “Pick with”: Spotlight, checked)');
    await mp.keyboard.press('End'); await mp.keyboard.press('ArrowUp'); await mp.keyboard.press('Enter');
    ok(await mp.locator('#menu.open .menu-confirm').count() === 1 && await where() === 'Reset', `Reset by keyboard asks first, with the keyboard on its answer (${await where()})`);
    await mp.keyboard.press('Escape');
    ok(await where() === 'the window’s name' && await mp.evaluate(() => window.__board21.state.insts.has('name-picker:1')), 'Escape leaves it as it was');
    // A widget that takes the keyboard for what was chosen still gets it: Edit names puts it in the names list.
    await mp.keyboard.press('Enter'); await mp.keyboard.press('Home');
    ok(await where() === 'Edit names', `Edit names is the menu’s first item (${await where()})`);
    await mp.keyboard.press('Enter'); await mp.waitForTimeout(300);
    const inList = await mp.frameLocator('.win[data-ikey="name-picker:1"] iframe').locator('html').evaluate(() => document.hasFocus() && document.activeElement.id === 'list');
    ok(inList, 'choosing Edit names by keyboard puts the keyboard in the names list, as a tap does');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await mctx.close();
  }],
  ['Pages (multiple boards)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const st = (p = page) => p.evaluate(() => { const b = window.__board21, s = b.state; return { id: s.boardId, name: s.board.name, uid: s.board.uid, wins: Array.from(s.wins.keys()).sort(), ids: b.pages.ids(), active: s.settings.activeBoard,
      ind: (document.querySelector('[data-ctl="pages"]') || {}).textContent, picker: document.getElementById('panel').classList.contains('open') }; });
    const frame = (ik, p = page) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const recs = (p = page) => p.evaluate(() => new Promise((res, rej) => { const o = indexedDB.open('21Board'); o.onerror = () => rej(o.error);
      o.onsuccess = () => { const q = o.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { o.result.close(); res(Object.fromEntries(q.result.map(r => [r.key, r.value]))); }; }; }));
    const settle = (ms = 700) => page.waitForTimeout(ms);
    const openPicker = async (side = 'left') => { if (!await page.locator('#panel.open').count()) { await page.click(`.picker-btn.${side}`); await settle(250); } };
    // The Widget Picker: five columns where there's room, ‹ Page › after Settings at the far end (mirrored on the right, ‹ still on the left).
    const geo = (side, p = page) => p.evaluate(side => {
      const P = document.getElementById('panel'), q = s => P.querySelector(s).getBoundingClientRect(), g = q('.panel-widgets'), c = q('.panel-controls'), r = P.getBoundingClientRect();
      const prev = q('[data-ctl="prev"]'), ind = q('[data-ctl="pages"]'), next = q('[data-ctl="next"]'), gear = q('[data-ctl="settings"]');
      const other = document.querySelector(`.picker-btn.${side === 'left' ? 'right' : 'left'}`).getBoundingClientRect();
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { cols: +getComputedStyle(P).getPropertyValue('--cols'), narrow: P.classList.contains('narrow'), inside: r.left >= -0.5 && r.right <= innerWidth + 0.5,
        noScroll: document.documentElement.scrollWidth <= innerWidth && P.scrollWidth <= P.clientWidth + 1 && c.right <= r.right && c.left >= r.left,
        rowFits: c.right <= g.right + 1.5 && c.left >= g.left - 1.5, order: prev.right <= ind.left + 0.5 && ind.right <= next.left + 0.5,
        far: side === 'left' ? next.right >= g.right - 8 : prev.left <= g.left + 8, sameRow: Math.abs(prev.top - gear.top) < 3, above: prev.bottom <= gear.top + 0.5,
        gearFirst: side === 'left' ? gear.right <= prev.left : gear.left >= next.right, clear: ![prev, ind, next].some(b => hit(b, other)),
        ui: Math.round(window.__board21.zoom.ui * 100) / 100, big: [prev, ind, next].every(b => b.width >= 44 * window.__board21.zoom.ui - 0.5 && b.height >= 44 * window.__board21.zoom.ui - 0.5) };
    }, side);
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h }); await settle(300);
      for (const side of ['left', 'right']) {
        await page.click(`.picker-btn.${side}`); await settle(300);
        const g = await geo(side);
        ok(g.cols === 5 && !g.narrow && g.rowFits && g.sameRow && g.gearFirst && g.far && g.order && g.inside && g.noScroll && g.clear && g.big,
          `${w}×${h}, ${side} corner: five columns, ‹ Page › after Settings at the far end, ‹ on the left, all on screen (${JSON.stringify(g)})`);
        await page.click(`.picker-btn.${side}`); await settle(200);
      }
    }
    let narrowSeen = 0;
    for (const [w, h] of [[800, 600], [560, 760], [375, 700]]) {
      await page.setViewportSize({ width: w, height: h }); await settle(300);
      for (const side of ['left', 'right']) {
        await page.click(`.picker-btn.${side}`); await settle(300);
        const g = await geo(side);
        if (g.cols === 5) ok(!g.narrow && g.rowFits && g.sameRow && g.far && g.order && g.inside && g.noScroll && g.clear && g.big, `${w}×${h}, ${side} corner: five columns (drawn at ${g.ui}), ‹ Page › fits after Settings`);
        else { narrowSeen++; ok(g.narrow && g.above && g.order && g.inside && g.noScroll && g.big, `${w}×${h}, ${side} corner: ${g.cols} columns, ‹ Page › gets a row of its own above the controls, with no overflow (${JSON.stringify(g)})`); }
        await page.click(`.picker-btn.${side}`); await settle(200);
      }
    }
    ok(narrowSeen >= 2, 'a narrow window was among them');
    await page.setViewportSize({ width: 1366, height: 768 }); await settle(300);

    // One page: ‹ is off and › is + (New page).
    await page.evaluate(() => { const b = window.__board21; b.setBoardScale(1.25); b.updateBoard({ background: { color: '#1f3a2c', pattern: 'grid' } }); b.openWidget('notes'); });
    await settle(1200);
    await fillNote(frame('notes:1'), 'Page one note');
    await openPicker();
    const one = await page.evaluate(() => ({ prev: document.querySelector('[data-ctl="prev"]').disabled, next: document.querySelector('[data-ctl="next"]').getAttribute('aria-label'), ind: document.querySelector('[data-ctl="pages"]').textContent }));
    ok(one.prev && one.next === 'New page' && one.ind === 'Page1 of 1', `with one page, ‹ is off, › is + (New page), and it reads “Page 1 of 1” (${JSON.stringify(one)})`);
    // A new board's first page is "Page 1", named once, never "Page 1 · Page 1".
    const first1 = await page.evaluate(() => { const ind = document.querySelector('[data-ctl="pages"]'); return { name: window.__board21.state.board.name, label: window.__board21.pages.label(), said: ind.getAttribute('aria-label'), tip: ind.title }; });
    ok(first1.name === 'Page 1' && first1.label === 'Page 1' && first1.said === 'Page 1 of 1. Pages menu' && first1.tip === 'Pages: Page 1',
      `a new board starts with “Page 1”, and says it once (${JSON.stringify(first1)})`);
    // New page.
    await page.click('[data-ctl="next"]');
    await page.waitForFunction(() => window.__board21.state.boardId !== 1 && !document.getElementById('page-flash').hidden, null, { timeout: 8000 });
    const flash = await page.evaluate(() => { const f = document.getElementById('page-flash'); return { on: !f.hidden, text: f.textContent }; });
    await settle(400);
    let s = await st();
    const look = await page.evaluate(() => { const b = window.__board21.state.board; return [b.scale, b.shape, b.background.color, b.background.pattern]; });
    ok(s.id === 2 && s.name === 'Page 2' && !s.wins.length && s.ids.join() === '1,2' && s.active === 2 && s.ind === 'Page2 of 2' && s.picker,
      `+ makes a blank “Page 2”, goes there, and the Widget Picker stays open (${JSON.stringify(s)})`);
    ok(look.join() === '1.25,16:9,#1f3a2c,grid', `a new page takes this page’s size, shape, color and pattern (${look.join()})`);
    ok(flash.on && flash.text === 'Page 2', `“Page 2” shows in the middle of the board (${JSON.stringify(flash)})`);
    ok(!(await page.evaluate(() => document.querySelector('[data-ctl="prev"]').disabled)), '‹ works on the second page');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    // (The hint steps aside while the Widget Picker is open, since 2026.11.20-1.)
    ok(await page.locator('#empty-hint').isVisible(), 'a blank page says “Your board is ready” once the Widget Picker closes');
    await page.evaluate(() => { window.__board21.openWidget('timer'); window.__board21.openWidget('dice'); }); await settle(1200);
    await openPicker(); await page.click('[data-ctl="prev"]');
    await page.waitForFunction(() => window.__board21.state.boardId === 1);
    await page.waitForFunction(() => /^Page 1/.test(document.getElementById('page-flash').textContent), null, { timeout: 5000 }).catch(() => {});
    const flash1 = await page.evaluate(() => document.getElementById('page-flash').textContent); await settle(1200);
    ok(flash1 === 'Page 1', `going back, “Page 1” shows in the middle of the board, once (${flash1})`);
    s = await st();
    ok(s.wins.join() === 'notes:1' && await frame('notes:1').locator('textarea').inputValue() === 'Page one note', `‹ goes back to page 1 with its own window and content (${s.wins.join()})`);
    await page.keyboard.press('Escape'); await settle(200);   // (the Widget Picker, open since ‹, covers the note's middle, where fillNote taps)
    await fillNote(frame('notes:1'), 'Page one, edited just before leaving');
    await openPicker(); await page.click('[data-ctl="next"]'); await page.waitForFunction(() => window.__board21.state.boardId === 2); await settle(1000);
    s = await st();
    let R = await recs();
    ok(s.wins.join() === 'dice:1,timer:1' && R['data:1:notes:1'] && R['data:1:notes:1'].text === 'Page one, edited just before leaving' && !Object.keys(R).some(k => /^(inst|data):2:notes/.test(k)) && R['inst:2:timer:1'] && !R['inst:1:timer:1'],
      'the pages keep their windows and content apart, and what was typed just before leaving is stored under its own page');

    // Reload: the same page. A second tab follows.
    await page.reload(); await boardUp(page); await settle(800);
    s = await st();
    ok(s.id === 2 && s.wins.join() === 'dice:1,timer:1', `reload opens the page that was shown (${s.id})`);
    const tab2 = await ctx.newPage(); tab2.on('pageerror', e => errors.push('[tab 2] ' + e.message));
    await tab2.goto(BASE); await boardUp(tab2); await tab2.waitForTimeout(800);
    ok((await st(tab2)).id === 2, 'a second tab opens on the same page');
    await openPicker(); await page.click('[data-ctl="prev"]'); await page.waitForFunction(() => window.__board21.state.boardId === 1);
    ok(await eventually(async () => (await st(tab2)).id === 1 && (await st(tab2)).wins.join() === 'notes:1'), 'the other tab goes to the same page');
    await frame('notes:1', tab2).locator('#view').waitFor({ timeout: 5000 }).catch(() => {});
    await page.click('[data-ctl="next"]'); await page.waitForFunction(() => window.__board21.state.boardId === 2);
    ok(await eventually(async () => (await st(tab2)).id === 2), 'and back again');
    await tab2.close();

    // Rename (from the Pages menu).
    await page.click('[data-ctl="pages"]'); await settle(250);
    const menu = await page.evaluate(() => { const m = document.getElementById('pages-menu'), r = m.getBoundingClientRect(), i = document.querySelector('[data-ctl="pages"]').getBoundingClientRect();
      return { open: m.classList.contains('open'), items: Array.from(m.querySelectorAll('.menu-item')).map(b => b.textContent.trim()), checked: (m.querySelector('[aria-checked="true"]') || {}).textContent, above: r.bottom <= i.top + 1, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 }; });
    ok(menu.open && menu.above && menu.inside && menu.checked === '2Page 2' && menu.items.join('|') === '1Page 1|2Page 2|New page|Duplicate this page|Rename this page…|Move left|Move right|Delete this page…',
      `the Pages menu opens above the indicator, lists the pages with this one checked, then what can be done (${menu.items.join(' | ')})`);
    await page.click('#pages-menu [data-act="rename"]'); await settle(200);
    ok(await page.locator('#modal input').inputValue() === 'Page 2', 'Rename starts from the page’s name');
    await page.fill('#modal input', 'Math'); await page.keyboard.press('Enter'); await settle(500);
    R = await recs();
    ok((await st()).name === 'Math' && R['board:2'].name === 'Math', 'Rename names the page (its board name)');

    // Duplicate.
    await page.keyboard.press('Escape'); await openPicker('right'); await page.click('[data-ctl="pages"]'); await settle(200);
    await page.click('#pages-menu [data-act="dup"]');
    await page.waitForFunction(() => window.__board21.state.boardId === 3, null, { timeout: 10000 }); await settle(1200);
    s = await st(); R = await recs();
    ok(s.name === 'Math (copy)' && s.wins.join() === 'dice:1,timer:1' && s.ids.join() === '1,2,3' && R['board:3'].uid && R['board:3'].uid !== R['board:2'].uid && R['board:3'].background.color === '#1f3a2c',
      `Duplicate makes “Math (copy)” after it, with its windows and background, and a board id of its own (${JSON.stringify(s)})`);

    // Delete, then Undo: the page comes back where it was.
    await openPicker(); await page.click('[data-ctl="prev"]'); await page.waitForFunction(() => window.__board21.state.boardId === 2); await settle(800);
    await openPicker(); await page.click('[data-ctl="pages"]'); await page.click('#pages-menu [data-act="delete"]'); await settle(250);
    const dtext = await page.locator('#modal').textContent();
    ok(/Delete “Math”\?/.test(dtext) && /2 windows/.test(dtext), `the delete question names the page and its windows (${dtext.slice(0, 120)})`);
    await page.click('#modal .btn.danger'); await page.waitForFunction(() => window.__board21.state.boardId !== 2); await settle(600);
    s = await st();
    ok(s.ids.join() === '1,3' && s.id === 3, `the page is gone and the next one is shown (${s.ids.join()})`);
    await page.click('#toasts button:has-text("Undo")'); await page.waitForFunction(() => window.__board21.state.boardId === 2); await settle(1000);
    s = await st();
    ok(s.ids.join() === '1,2,3' && s.name === 'Math' && s.wins.join() === 'dice:1,timer:1', `Undo brings it back in its place, as it was (${JSON.stringify(s)})`);
    // Deleted for good: its records go (once its Undo is over), its board history stays 30 days (Board history ›
    // Deleted pages, to bring it back); its id isn't used again.
    await page.evaluate(() => window.__board21.history.capture('manual', { label: 'kept' })); await settle(300);
    await openPicker(); await page.click('[data-ctl="pages"]'); await page.click('#pages-menu [data-act="delete"]'); await page.click('#modal .btn.danger');
    await page.waitForFunction(() => window.__board21.state.boardId !== 2); await settle(400);
    await page.evaluate(() => window.__board21.pages.purge([2])); await settle(400);
    R = await recs();
    const hist2 = await page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board-history'); o.onsuccess = () => { const q = o.result.transaction('meta').objectStore('meta').getAll(); q.onsuccess = () => { o.result.close(); res(q.result.filter(m => String(m.id).startsWith('2:'))); }; }; }));
    ok(!Object.keys(R).some(k => /^(board|inst|data|conf|media):2(:|$)/.test(k)) && hist2.length > 0 && hist2.every(m => m.deletedAt > 0) && !(R.settings.deletedBoards || []).length,
      `after its Undo, a deleted page’s records are gone and its board history stays, marked deleted (${hist2.length} versions)`);
    await openPicker(); await page.click('[data-ctl="pages"]'); await page.click('#pages-menu [data-act="new"]');
    await page.waitForFunction(() => window.__board21.state.boardId === 4, null, { timeout: 8000 }).catch(() => {});
    ok((await st()).id === 4, 'a new page never gets a deleted page’s id');
    // The only page can't be deleted.
    // Move left.
    await openPicker(); await page.click('[data-ctl="pages"]'); await page.click('#pages-menu [data-act="left"]'); await settle(300);
    ok((await st()).ids.join() === '1,4,3', 'Move left changes the order');

    // Export: this page (the same file as before pages), and all pages.
    await page.evaluate(() => window.__board21.pages.go(1)); await settle(800);
    await openPicker(); await page.click('[data-ctl="export"]'); await settle(200);
    const labels = await page.locator('#modal .btn').allTextContents();
    ok(/^All 3 pages/.test(labels[0]) && /^This page/.test(labels[1]) && /blank template/.test(labels[2]), `Export asks: all pages or this page (${labels.map(l => l.split(/A full|Window/)[0]).join(' | ')})`);
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal .btn[data-i="1"]')]);
    const oneP = OUT + 'page-one.21board'; await dl.saveAs(oneP);
    const single = JSON.parse(fs.readFileSync(oneP, 'utf8'));
    ok(Object.keys(single).join() === 'format,formatVersion,kind,exportedAt,generator,viewport,theme,accent,letters,board,instances' && single.formatVersion === 1 && !single.pages && single.board.name === 'Page 1' && single.instances.length === 1,
      `“This page” is a .21board file exactly as before pages (${Object.keys(single).join(',')})`);
    await openPicker(); await page.click('[data-ctl="export"]'); await settle(200);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal .btn[data-i="0"]')]);
    const allP = OUT + 'all-pages.21board'; await dl.saveAs(allP);
    const all = JSON.parse(fs.readFileSync(allP, 'utf8'));
    ok(all.formatVersion === 1 && all.board.name === 'Page 1' && Array.isArray(all.pages) && all.pages.length === 3 && all.pages[0].main && all.pages[2].board.name === 'Math (copy)' && all.pages[2].instances.length === 2 && /3 pages/.test(dl.suggestedFilename()),
      `“All pages” is a version 1 file of the page shown, with every page in order in “pages” (${dl.suggestedFilename()})`);
    ok(await page.evaluate(() => Date.now() - window.__board21.state.settings.lastBackupAt < 60000), 'an all-pages export counts as a backup');

    // Import: an all-pages file adds its pages; a one-page file opens as a new page (the suggested choice).
    await page.setInputFiles('#import-input', allP); await settle(300);
    const it = await page.locator('#modal .btn').allTextContents();
    ok(/^Add these 3 pages/.test(it[0]) && /^Replace all pages/.test(it[1]), `an all-pages file offers to add its pages or replace all pages (${it.map(t => t.slice(0, 22)).join(' | ')})`);
    await page.click('#modal .btn[data-i="0"]');
    await page.waitForFunction(() => window.__board21.pages.ids().length === 6, null, { timeout: 20000 }).catch(() => {});
    await settle(1200);
    s = await st();
    ok(s.ids.length === 6 && s.name === 'Page 1' && s.ids.indexOf(s.id) === 3 && s.wins.join() === 'notes:1', `its 3 pages are added after this device’s, and the first is shown (${s.ids.join()})`);
    ok(await frame('notes:1').locator('textarea').inputValue() === 'Page one, edited just before leaving', 'with their content');
    await page.setInputFiles('#import-input', oneP); await settle(300);
    const it1 = await page.locator('#modal .btn').allTextContents();
    ok(/^Open as a new page/.test(it1[0]) && await page.locator('#modal .btn[data-i="0"]').evaluate(b => b.classList.contains('primary')) && /^Replace this page/.test(it1[1]) && /^Add to this page/.test(it1[2]),
      `a one-page file: “Open as a new page” (suggested), “Replace this page” or “Add to this page” (${it1.map(t => t.slice(0, 20)).join(' | ')})`);
    await page.click('#modal .btn[data-i="0"]');
    await page.waitForFunction(() => window.__board21.pages.ids().length === 7, null, { timeout: 10000 }).catch(() => {});
    await settle(800);
    s = await st();
    ok(s.ids.length === 7 && s.ids.indexOf(s.id) === 4 && s.wins.join() === 'notes:1', `it opens as a new page after this one (${s.ids.join()})`);
    await page.locator('#toasts button:has-text("Undo")').last().click();
    await page.waitForFunction(() => window.__board21.pages.ids().length === 6, null, { timeout: 10000 }).catch(() => {});
    ok((await st()).ids.length === 6, 'Undo takes that page away again');
    // Board history after going to other pages: the history is this page's, and going back still works.
    await page.keyboard.press('Escape');
    const first = (await st()).ids[0];
    await page.evaluate(b => window.__board21.pages.go(b), first); await settle(1500);
    const vid = await page.evaluate(() => window.__board21.history.capture('manual', { label: 'before the change' }));
    await fillNote(frame('notes:1'), 'changed after the version'); await settle(900);
    await page.evaluate(() => window.__board21.pages.go(window.__board21.pages.ids()[1])); await settle(1000);
    const otherMetas = await page.evaluate(() => window.__board21.history.metas.map(m => m.b));
    await page.evaluate(b => window.__board21.pages.go(b), first); await settle(1200);
    const metas = await page.evaluate(() => window.__board21.history.metas.map(m => m.b));
    ok(!!vid && metas.length > 0 && metas.every(b => b === first) && otherMetas.every(b => b !== first), `Board history lists the page shown’s versions only (${metas.length} here, ${otherMetas.length} on the other page)`);
    await page.evaluate(id => window.__board21.history.restore(id), vid); await settle(1800);
    ok((await st()).id === first && await frame('notes:1').locator('textarea').inputValue() === 'Page one, edited just before leaving', 'going back to a version after switching pages restores this page');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // A board saved before 2026.11.18-12 keeps its first page's name, "My Board". After Erase everything, "Page 1".
    const ctxO = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const po = await ctxO.newPage(); po.on('pageerror', e => errors.push('[older board] ' + e.message));
    await po.goto(BASE + 'manifest.webmanifest');
    await po.evaluate(() => new Promise((res, rej) => {
      const rq = indexedDB.open('21Board', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('records', { keyPath: 'key' });
      rq.onsuccess = () => {
        const tx = rq.result.transaction('records', 'readwrite'), st = tx.objectStore('records'), now = Date.now();
        st.put({ key: 'settings', type: 'settings', rev: 1, updatedAt: now, by: 'old', value: { boards: [1], activeBoard: 1, lastBoard: 1, theme: 'light' } });
        st.put({ key: 'board:1', type: 'board', rev: 1, updatedAt: now, by: 'old', value: { id: 1, name: 'My Board', uid: 'oldboard0001', background: { color: null, pattern: 'none' }, scale: 0.8, shape: '16:9', layout: { w: 2400, h: 1350 }, pos: 1 } });
        tx.oncomplete = () => { rq.result.close(); res(); }; tx.onerror = () => rej(tx.error);
      };
      rq.onerror = () => rej(rq.error);
    }));
    await po.goto(BASE); await boardUp(po); await po.waitForTimeout(800);
    const older = await po.evaluate(() => ({ name: window.__board21.state.board.name, label: window.__board21.pages.label(), said: document.querySelector('[data-ctl="pages"]').getAttribute('aria-label') }));
    ok(older.name === 'My Board' && older.label === 'Page 1 · My Board' && older.said === 'Page 1 of 1, My Board. Pages menu', `a board saved before keeps its page’s name, “My Board” (${JSON.stringify(older)})`);
    await openSettings(po, ['advanced']);
    await po.click('#settings [data-act="erase"]'); await po.locator('#modal.open .btn', { hasText: /^Erase everything$/ }).click();
    ok(await eventually(() => po.evaluate(() => window.__board21.state.board.name === 'Page 1' && window.__board21.pages.ids().length === 1), 8000), 'after Erase everything, the board starts again with “Page 1”');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctxO.close();
  }],
  ['Pages (multiple boards): nothing lost when things go wrong', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
    await ctx.addInitScript(DRIVE_PICK);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const B = (fn, arg) => page.evaluate(fn, arg);
    const st = (p = page) => p.evaluate(() => { const b = window.__board21, s = b.state; return { id: s.boardId, name: s.board.name, uid: s.board.uid, wins: Array.from(s.wins.keys()).sort(), ids: b.pages.ids() }; });
    const frame = (ik, p = page) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const recs = (p = page) => p.evaluate(() => new Promise((res, rej) => { const o = indexedDB.open('21Board'); o.onerror = () => rej(o.error);
      o.onsuccess = () => { const q = o.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { o.result.close(); res(Object.fromEntries(q.result.map(r => [r.key, r.value]))); }; }; }));
    const settle = (ms = 700) => page.waitForTimeout(ms);
    const openPicker = async () => { if (!await page.locator('#panel.open').count()) { await page.click('.picker-btn.left'); await settle(250); } };
    const settings = groups => openSettings(page, groups);
    const go = async b => { await B(b => window.__board21.pages.go(b), b); await page.waitForFunction(b => window.__board21.state.boardId === b, b); await settle(900); };
    const noteText = async () => frame('notes:1').locator('textarea').inputValue();
    // Page 1 “Math” and page 2 “Reading”, a note on each.
    await B(() => { window.__board21.updateBoard({ name: 'Math' }); window.__board21.openWidget('notes'); }); await settle(1200);
    await fillNote(frame('notes:1'), 'Math plan'); await settle(500);
    await B(() => window.__board21.pages.add()); await page.waitForFunction(() => window.__board21.state.boardId === 2); await settle(800);
    await B(() => { window.__board21.updateBoard({ name: 'Reading' }); window.__board21.openWidget('notes'); }); await settle(1200);
    await fillNote(frame('notes:1'), 'Reading plan'); await settle(800);

    // The browser throws the stored board away while 21Board is open: every page is written back, not only this one.
    await B(() => new Promise(res => { const r = indexedDB.deleteDatabase('21Board'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
    await fillNote(frame('notes:1'), 'Reading plan, typed after the loss');
    await page.waitForFunction(() => !window.__board21.store.lost && !!window.__board21.store.db, null, { timeout: 10000 }).catch(() => {});
    ok(await eventually(async () => { const R = await recs(); return R['board:1'] && R['board:1'].name === 'Math' && R['data:1:notes:1'].text === 'Math plan' && R['inst:1:notes:1'] && R['data:2:notes:1'].text === 'Reading plan, typed after the loss'; }),
      'when the browser loses the stored board, the other pages are written back too (not just the one shown)');

    // A backup while storage can't be read: the other pages come from what this window holds, and it counts as a backup.
    await B(() => { const s = window.__board21.store; s.readAll0 = s.readAll; s.readAll = async () => { throw new Error('Storage didn’t answer'); }; });
    await settings(['advanced']);
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#settings [data-act="backup"]')]);
    let file = OUT + 'pages-unreadable.21board'; await dl.saveAs(file);
    let j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const p1 = (j.pages || []).find(p => !p.main) || { board: {}, instances: [] };
    ok(p1.board.name === 'Math' && p1.instances.length === 1 && p1.instances[0].data.text === 'Math plan' && await B(() => !!window.__board21.state.settings.lastBackupAt),
      `with storage unreadable, Back up now still has the other page’s windows and content (${p1.board.name}, ${p1.instances.length} window)`);
    // One whose content isn't held here either: the file is made, the teacher is told, and it doesn't count as a backup.
    await B(() => { window.__board21.state.settings.lastBackupAt = null; window.__board21.pages.held.delete('board:1'); });
    await page.keyboard.press('Escape'); await settings(['advanced']);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#settings [data-act="backup"]')]);
    await settle(300);
    const told = (await page.locator('.toast').allInnerTexts()).join(' | ');
    ok(/couldn’t be read/.test(told) && /“Math”/.test(told) && !await B(() => window.__board21.state.settings.lastBackupAt), `a page that can’t be read is named, and the reminders go on (${told.slice(0, 140)})`);
    await B(() => { const s = window.__board21.store; s.readAll = s.readAll0; });
    await page.keyboard.press('Escape');
    await page.reload(); await boardUp(page); await settle(900);

    // An Undo offered on one page is never applied to another: it goes when the page changes.
    await settings(['saved']);
    await page.click('#settings [data-act="inst-delete"][data-val="notes:1"]'); await page.click('#modal .btn.danger'); await settle(400);
    ok(await page.locator('#toasts button:has-text("Undo")').count() === 1, 'deleting a window offers Undo');
    const vid = await B(() => window.__board21.history.capture('manual', { label: 'Reading version' }));
    await go(1);
    ok(await page.locator('#toasts button:has-text("Undo")').count() === 0, 'going to another page takes that Undo away');
    const back = await B(id => window.__board21.history.restore(id), vid); await settle(600);
    let s = await st();
    ok(back === false && s.name === 'Math' && s.wins.join() === 'notes:1' && await noteText() === 'Math plan', `a version of another page is never put on this one (${JSON.stringify(s)})`);

    // Settings has no page name: the Pages menu renames a page (‹ Page › → Rename this page…).
    await settings();
    ok(await page.locator('#set-board-name, #settings input[type="text"]').count() === 0, 'Settings has no page name field');
    await page.keyboard.press('Escape'); await renamePage(page, 'Morning meeting');
    ok(await B(() => window.__board21.pages.name(1)) === 'Morning meeting' && (await st()).name === 'Morning meeting', 'Rename this page… in the Pages menu names it');
    await go(1); await B(() => window.__board21.updateBoard({ name: 'Math' })); await settle(300);

    // From the keyboard, the Pages menu takes the keyboard to this page's item.
    await openPicker();
    await page.focus('[data-ctl="pages"]'); await page.keyboard.press('Enter'); await settle(200);
    ok(await B(() => document.activeElement.dataset.act === 'go' && document.activeElement.getAttribute('aria-checked') === 'true'), 'Enter on the page indicator takes the keyboard into the menu, at this page');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

    // Board Sync: every page goes in this device's one file (an all-pages backup), each with a board id of its own.
    await settings();
    await setUpSync(page); await settle(500);
    await page.keyboard.press('Escape');
    await go(2);
    const devFile = JSON.parse((Object.entries(await readFolder(page)).find(([n]) => /^21Board \(/.test(n)) || [, '{}'])[1]);
    const uids = [devFile.board && devFile.board.uid].concat((devFile.pages || []).filter(x => !x.main).map(x => x.board.uid));
    ok(uids.length === 2 && uids[0] && uids[0] !== uids[1], `Board Sync: every page goes in this device’s one file, each with its own board id (${uids.map(u => String(u).slice(0, 8)).join(' ≠ ')})`);
    // (Page 1's content put on page 2, as a teacher importing its backup there: the checks below follow it.)
    const p1file = Object.assign({ format: '21board', formatVersion: 1, kind: 'full', viewport: devFile.viewport, board: Object.assign({}, devFile.board, { uid: uids[1] }), instances: devFile.instances });
    await B(f => window.__board21.applyImport(f, 'replace'), p1file); await settle(1200);
    ok((await st()).name === 'Math' && await B(() => window.__board21.state.board.uid) === uids[1], 'a page’s own file put on another page keeps that page’s board id');
    await B(() => window.__board21.updateBoard({ name: 'Reading' })); await settle(400);

    // Undo of a deleted page, after another tab started meanwhile: the page comes back with its content.
    await openPicker(); await page.click('[data-ctl="pages"]'); await page.click('#pages-menu [data-act="delete"]'); await page.click('#modal .btn.danger');
    await page.waitForFunction(() => window.__board21.state.boardId !== 2); await settle(300);
    const tab2 = await ctx.newPage(); tab2.on('pageerror', e => errors.push('[tab 2] ' + e.message));
    await tab2.goto(BASE); await boardUp(tab2); await tab2.waitForTimeout(4000);
    await page.click('#toasts button:has-text("Undo")'); await page.waitForFunction(() => window.__board21.state.boardId === 2, null, { timeout: 8000 }).catch(() => {}); await settle(1000);
    s = await st();
    ok(s.id === 2 && s.name === 'Reading' && s.wins.join() === 'notes:1' && /Math plan/.test(await noteText()) && !!(await recs())['data:2:notes:1'], `Undo brings the page back with its content although another tab started (${JSON.stringify(s)})`);
    await tab2.close();

    // Replace all pages with your own backup: the pages keep their board ids (the same boards in the Google Drive folder).
    const before = await B(() => window.__board21.pages.ids().map(b => window.__board21.pages.info.get(b).uid).join());
    await openPicker(); await page.click('[data-ctl="export"]'); await settle(200);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal .btn[data-i="0"]')]);
    file = OUT + 'pages-replace.21board'; await dl.saveAs(file);
    await page.setInputFiles('#import-input', file); await settle(300);
    await page.click('#modal .btn[data-i="1"]'); await settle(200); await page.click('#modal .btn.danger');
    await page.waitForFunction(() => window.__board21.pages.ids().every(b => b > 2) && window.__board21.pages.ids().length === 2, null, { timeout: 20000 }).catch(() => {});
    await settle(800);
    const after = await B(() => window.__board21.pages.ids().map(b => window.__board21.pages.info.get(b).uid).join());
    ok(after === before, 'Replace all pages with a backup of them keeps each page’s board id');

    // Erase everything from a page other than the first: board history still has that page, to go back to.
    await go(await B(() => window.__board21.pages.ids()[1]));
    const shown = (await st()).id;
    await settings(['advanced']);
    await page.click('#settings [data-act="erase"]'); await page.locator('#modal .btn', { hasText: /^Erase everything$/ }).click(); await settle(1500);
    const metas = () => B(() => window.__board21.history.metas.map(m => m.b));
    s = await st();
    let m = await metas();
    ok(s.id === shown && s.ids.join() === String(shown) && !s.wins.length && m.length && m.every(b => b === shown), `after Erase everything, the page shown stays, and board history still has its versions (page ${s.id}: ${m.length})`);
    await page.reload(); await boardUp(page); await settle(900);
    m = await metas();
    ok((await st()).id === shown && m.length && m.every(b => b === shown), 'and still after a reload');
    await B(() => { window.__board21.history.restore(window.__board21.history.metas[0].id); }); await settle(1500);
    const asked = await page.locator('#modal.open').innerText().catch(() => '');
    ok((await st()).wins.join() === 'notes:1', `going back brings its window back${asked ? ' (asked: ' + asked.slice(0, 80) + ')' : ''}`);
    const leftover = (await B(() => window.__board21.history.tx(['meta'], 'readonly', (o, set) => { const q = o.meta.getAllKeys(); q.onsuccess = () => set(q.result.map(String)); }))).filter(k => !k.startsWith(shown + ':'));
    ok(!leftover.length, `no other page’s board history is left behind, not even a page whose Undo was still offered (${leftover.join(', ')})`);
    // Pages.create on its own, as many suites call it. The tab stays on the new page, and going back at once works.
    const made = await B(async () => { const P = window.__board21.pages, S = window.__board21.state, was = S.boardId, id = await P.create({ end: true, name: 'Made' }), on = S.boardId;
      return { was, id, on, went: await P.go(was), now: S.boardId }; });
    ok(made.id && made.on === made.id && made.went && made.now === made.was, `a page made with Pages.create is shown, and going back at once works (${JSON.stringify(made)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  // (end of Board Sync merge)

  // Release 2026.11.18-20: every list of three or more takes the Oxford comma ("red, yellow, and green").
  ['Copy: Oxford commas', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const B = fn => page.evaluate(fn);
    const modalText = () => page.locator('#modal.open .modal-card').innerText().then(t => t.replace(/\s+/g, ' '));
    const frameOf = ik => page.frame({ name: 'b21-board:' + ik });
    const connected = ik => eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));

    // ---- 1. The strings in the spec's table, as the page and the widgets show them.
    const tips = await B(() => Object.fromEntries(window.__board21.catalog().map(w => [w.id, w.description])));
    ok(tips.notes === 'Write directions, reminders, or the day’s agenda.', `Notes: “${tips.notes}”`);
    ok(tips['traffic-light'] === 'Show noise level or work time in red, yellow, and green.', `Traffic Light: “${tips['traffic-light']}”`);
    ok(tips['youtube-player'] === 'Play a video from YouTube, Google Drive, or Vimeo.', `Video Player: “${tips['youtube-player']}”`);
    const vp = await B(() => window.__board21.openWidget('youtube-player')); await connected(vp);
    const vpHelp = await ytWin(page, vp).locator('#help').textContent();
    ok(vpHelp === 'Paste a link from YouTube, Google Drive, or Vimeo.', `the Video Player’s help: “${vpHelp}”`);
    await ytShow(page, 'hello there', vp);
    const vpErr = (await ytLook(page, vp)).err;
    ok(vpErr === 'Paste a YouTube, Google Drive, or Vimeo link.' && vpErr === VMSG.none, `the Video Player’s error: “${vpErr}”`);
    const pic = await B(() => window.__board21.openWidget('image')); await connected(pic);
    await picOpen(page, picFile('notes.txt', Buffer.from('hello'), 'text/plain'), pic, PMSG.type);
    const picErr = (await picLook(page, pic)).err;
    ok(picErr === 'Can’t show that file. Choose a PNG, JPEG, GIF, WebP, AVIF, or SVG.' && picErr === PMSG.type, `the Picture’s error: “${picErr}”`);
    await page.setInputFiles('#photo-input', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await page.waitForSelector('#modal.open');
    const photoErr = (await page.locator('#modal.open p').innerText()).replace(/\s+/g, ' ');
    await page.locator('#modal.open .btn', { hasText: 'OK' }).click(); await page.waitForTimeout(200);
    ok(photoErr === 'Choose a JPEG, PNG, or WebP picture.', `a background photo that isn’t a picture: “${photoErr}”`);
    const hintOf = act => page.locator(`#settings .row:has([data-act="${act}"]) .hint`).first().innerText();
    await openSettings(page, ['advanced']);
    const erase = await hintOf('erase');
    ok(erase === 'Every page, window, and setting on this device.', `Settings › Erase everything: “${erase}”`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await B(() => { window.__board21.store.failed = 'blocked'; });   // (as where the browser allows no storage)
    await openSettings(page, ['advanced']);
    const empty = await hintOf('erase');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await B(() => { window.__board21.store.failed = ''; });
    ok(empty === 'Clears the windows, content, and settings you see now.', `Settings › Empty this board: “${empty}”`);
    await openSettings(page, ['advanced']);
    await page.click('#settings [data-act="hist-every"][data-val="0"]'); await page.waitForSelector('#modal.open');
    const pause = await modalText();
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(pause.includes('21Board stops saving versions as you work, when it opens, and when a note is suddenly cleared.') && pause.includes('before Reset, Delete, Close all, a photo change, Import, Erase, and going back'),
      `Board history’s Off: “${pause}”`);
    // Board Sync: a folder gone for a while says what may have happened to it, here and in the message's Details.
    const L = await syncDev(browser, 'the laptop', errors);
    await linkFolder(L.p);
    await L.p.evaluate(() => { window.__drive = { gone: true }; }); await L.p.evaluate(() => window.__board21.link.check(true));
    await L.p.evaluate(() => { window.__board21.link.trouble.since -= 6 * 60e3; });
    await L.p.locator('.folder-note.left').click(); await L.p.waitForSelector('#modal.open');
    const gone = (await L.p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
    await L.p.locator('#modal.open .btn', { hasText: 'Close' }).click(); await L.p.waitForTimeout(200);
    ok(/If it was renamed, moved, or deleted, choose it again\./.test(gone), `Board Sync, a folder gone a while: “${gone}”`);
    await L.p.evaluate(() => { window.__drive = {}; const l = window.__board21.link; l.trouble = null; l.stuck('missing'); });
    await L.p.locator('.toast', { hasText: 'Couldn’t sync this board with your folder' }).locator('button', { hasText: 'Details' }).click(); await L.p.waitForSelector('#modal.open');
    const missing = (await L.p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
    ok(/If it was renamed, moved, or deleted, choose it again in Settings › Board Sync\./.test(missing), `and the message’s Details: “${missing}”`);
    await L.c.close();

    // ---- 2. No list of three or more without its comma, wherever a teacher reads: "A, B and C" and "A, B or C".
    // Reviewed exceptions, each [pattern, reason]: a sentence that matches but isn't a list of three. One in the app, the
    // Name Picker's tooltip; the rest are in the Calculator manual and the widget starter's notes.
    const EXCEPT = [
      [/Pick names at random, or make groups and brackets/, 'two things to do'],
      [/such as a power or a fraction/, 'two examples'],
      [/then powers and roots/, 'two items after “then”'],
      [/without the problem or History/, 'two items'],
      [/the steps start over and a hidden answer/, 'two clauses'],
      [/open this file in a browser or paste it/, 'two things to do'],
      [/doesn['’]t show it or cache it/, 'two verbs'],
      [/theme, light or dark/, 'the theme, then its two choices'],
      [/With no room at all, it hides and stays ticked/, 'a phrase, then two verbs'],
      [/the time, analog or digital, and the date/, 'the time, its two kinds, then the date']];
    const texts = [];   // { where, text }
    const add = (where, text) => texts.push({ where, text: String(text || '') });
    for (const w of await B(() => window.__board21.catalog().map(w => ({ id: w.id, d: w.description })))) add(`the registry, ${w.id}`, w.d);
    // Settings, with Developer mode on and every group open (About too; not the license texts, which aren't ours).
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(300);
    for (let i = 0; i < 40; i++) {
      const g = page.locator('#settings [data-act="group"][aria-expanded="false"]:not([data-val$="-license"])').first();
      if (!await g.count()) break;
      await g.click(); await page.waitForTimeout(150);
    }
    add('Settings', await page.locator('#settings').innerText());
    add('Settings (tooltips)', (await page.locator('#settings').evaluate(r => Array.from(r.querySelectorAll('[title], [aria-label], [aria-description], [placeholder]'), e => ['title', 'aria-label', 'aria-description', 'placeholder'].map(a => e.getAttribute(a) || '').join('\n')))).join('\n'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // The Widget Picker: its text and tooltips.
    await page.click('.picker-btn.left'); await page.waitForSelector('#panel.open');
    add('the Widget Picker', await page.locator('#panel').innerText());
    add('the Widget Picker (tooltips)', (await page.locator('#panel').evaluate(r => Array.from(r.querySelectorAll('[title], [aria-label], [aria-description]'), e => ['title', 'aria-label', 'aria-description'].map(a => e.getAttribute(a) || '').join('\n')))).join('\n'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // Each built-in widget as it opens (district apps are other sites), and its window menu.
    const built = await B(() => window.__board21.catalog().filter(w => !w.external && !w.dev).map(w => w.id));
    for (const id of built) {
      const ik = await B(new Function(`return window.__board21.openWidget(${JSON.stringify(id)}, { fresh: true })`));
      if (!await connected(ik)) { ok(false, `${id} opens`); continue; }
      await page.waitForTimeout(700);
      const f = frameOf(ik);
      // (Its whole text, a line for each block, hidden parts too: a message shown later, a line a small window hides.)
      add(`${id}`, await f.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('script, style, template').forEach(e => e.remove()); c.querySelectorAll('p, div, li, h1, h2, h3, h4, button, label, option, td, th, dt, dd, summary, br, section').forEach(e => { e.before('\n'); e.after('\n'); }); return c.textContent; }) + '\n' + await f.evaluate(() => Array.from(document.querySelectorAll('[title], [aria-label], [aria-description], [placeholder], [alt]'), e => ['title', 'aria-label', 'aria-description', 'placeholder', 'alt'].map(a => e.getAttribute(a) || '').join('\n')).join('\n')));
      add(`${id}’s window menu`, await page.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.filter(i => !i.separator).map(i => i.label).join('\n'), ik));
      await page.evaluate(ik => window.__board21.closeWin(ik), ik); await page.waitForTimeout(200);
    }
    // The Calculator manual, a page of its own, and the widget starter's notes, its only words for a widget author.
    // (Each block or note is joined into one line first: a list can wrap across lines.)
    const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    add('the Calculator manual', src('docs/calculator-manual/page-src.html').replace(/<(script|style)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi, '')
      .replace(/<\/?(?:p|div|li|h\d|section|td|th|dt|dd|br|button|summary|figcaption)\b[^>]*>/gi, '\0').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').split('\0').join('\n'));
    add('the widget starter’s notes', (src('widgets/_template/index.html').match(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|(?:^[ \t]*\/\/.*\n)+/gm) || [])
      .map(c => c.replace(/<!--|-->|\/\*|\*\/|^[ \t]*\/\/ ?/gm, '').split(/\n\s*\n|\n(?=\s*\d\. )/).map(s => s.replace(/\s+/g, ' ')).join('\n')).join('\n'));
    const LIST = /,\s+[^,]*?[^,\s]\s+(?:and|or|nor)\s/i;
    const found = [];
    for (const { where, text } of texts) {
      for (const s of text.split(/\n+|(?<=[.!?;:])\s+/)) if (LIST.test(s) && !EXCEPT.some(([re]) => re.test(s))) found.push(`${where}: “${s.trim()}”`);
    }
    ok(texts.length > 20 && !found.length, `no list of three or more without its comma (${texts.length} places read${found.length ? ': ' + Array.from(new Set(found)).join(' | ') : ''})`);
    const unused = EXCEPT.filter(([re]) => !texts.some(({ text }) => text.split(/\n+|(?<=[.!?;:])\s+/).some(s => LIST.test(s) && re.test(s))));
    ok(!unused.length, `every exception is still needed${unused.length ? ': ' + unused.map(([re]) => re).join(', ') : ''}`);

    // ---- 3. The rule, in CLAUDE.md (for every word) and in the AI prompt (for the widgets it writes).
    const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').split('\n'), labels = claude.findIndex(l => l.startsWith('- Labels:'));
    ok(labels > 0 && claude[labels + 1] === '- Every list of three or more takes the Oxford comma, such as "red, yellow, and green".', `CLAUDE.md’s Voice has the rule, after Labels (${claude[labels + 1]})`);
    const prompt = fs.readFileSync(path.join(ROOT, 'docs', 'AI-PROMPT.md'), 'utf8').replace(/\s+/g, ' ');
    ok(/Oxford comma/.test(prompt), 'the AI prompt asks for the Oxford comma');
    // WIDGET-SDK's first lines, wrapped across two in the file.
    const sdkDoc = fs.readFileSync(path.join(ROOT, 'docs', 'WIDGET-SDK.md'), 'utf8').replace(/\s+/g, ' ');

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  // Release 2026.11.20-2: a link keeps the browser's menu (Copy link address, Open in new tab), a Video Player's line in
  // Board history is its video's title or the site's name and "video", and CLAUDE.md's own lists take the Oxford comma.
  ['Links, video lines, and CLAUDE.md', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const B = (fn, arg) => page.evaluate(fn, arg);
    const frameOf = ik => page.frame({ name: 'b21-board:' + ik });
    const connected = ik => eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
    const frameBox = ik => page.locator(`.win[data-ikey="${ik}"] iframe`).boundingBox();
    // As in the right-click suite (2026.11.18-20): a listener the test adds last, on window, records whether the menu was
    // turned off (defaultPrevented). menuAt sends a cancelable contextmenu at an element; rightClick uses the mouse's
    // right button. Each says 'prevented' or 'menu'.
    const RECORD = () => { if (!window.__menus) { window.__menus = []; window.addEventListener('contextmenu', e => window.__menus.push(e.defaultPrevented)); } return window.__menus.length; };
    const menuAt = (doc, sel) => doc.evaluate(([sel, RECORD]) => {
      new Function(RECORD)();
      const el = document.querySelector(sel);
      if (!el) return 'no ' + sel;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, button: 2, buttons: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      return window.__menus[window.__menus.length - 1] ? 'prevented' : 'menu';
    }, [sel, `(${RECORD})()`]);
    const rightClick = async (doc, sel, off = { x: 0, y: 0 }, host = null) => {
      const n = await doc.evaluate(new Function(`return (${RECORD})()`));
      const r = await doc.evaluate(([sel, host]) => { const b = (host ? document.querySelector(host).shadowRoot : document).querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, [sel, host]);
      await page.mouse.click(off.x + r.x, off.y + r.y, { button: 'right' }); await page.waitForTimeout(250);
      return doc.evaluate(n => window.__menus.length > n ? (window.__menus[window.__menus.length - 1] ? 'prevented' : 'menu') : 'none', n);
    };
    // menuAt for an element inside a web component's open shadow root: its host, then the element in it.
    const menuInShadow = (doc, host, sel) => doc.evaluate(([host, sel, RECORD]) => {
      new Function(RECORD)();
      const h = document.querySelector(host), el = h && h.shadowRoot && h.shadowRoot.querySelector(sel);
      if (!el) return 'no ' + host + ' ' + sel;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, button: 2, buttons: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      return window.__menus[window.__menus.length - 1] ? 'prevented' : 'menu';
    }, [host, sel, `(${RECORD})()`]);

    // ---- 1. A link in Notes' reading view, in a note not yet tapped: a real right-click keeps the browser's menu, and the
    // note stays as it is.
    const nt = await B(() => window.__board21.openWidget('notes')); await connected(nt);
    await B(ik => window.__board21.setRect(ik, { x: 40, y: 40, w: 560, h: 260 }), nt); await page.waitForTimeout(300);
    const ntf = frameOf(nt);
    await fillNote(page.frameLocator(`.win[data-ikey="${nt}"] iframe`), 'Class site: https://ccsd21.org/calendar for today');
    await page.mouse.click(900, 640); await page.waitForTimeout(300);   // (a tap elsewhere: the note is read again)
    const reading = () => ntf.evaluate(() => !document.body.classList.contains('editing') && !!document.querySelector('#view a[href]'));
    ok(await reading(), '(a note not yet tapped, with a link)');
    ok(await rightClick(ntf, '#view a', await frameBox(nt)) === 'menu', 'a real right-click on a link in a note not yet tapped keeps the browser’s menu');
    ok(await reading(), 'and the note stays as it is');

    // ---- 2. Something inside a link counts as on it: its text in a <span>, its icon. In a widget uploaded in Developer
    // mode, then opened again with Developer mode off (so the SDK in it turns the menu off), and on the board. A link
    // inside a web component counts too, and so does a text box there.
    const LINKS = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Links</title>
<script type="application/json" id="board21-widget">{"id":"links","name":"Links","window":{"width":360,"height":340}}</script>
<style>body{margin:0;padding:12px;font:18px system-ui}body>*{display:block;margin:0 0 12px}</style></head><body>
<a id="site" href="https://example.org/room12"><span id="site-text">Room 12</span> <svg id="site-icon" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8"/></svg></a>
<a id="bare"><span id="bare-text">No address</span></a>
<button id="btn" type="button">Roll</button>
<div id="tap">Tap to pick</div>
<x-card id="card"></x-card>
<script>customElements.define('x-card', class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = '<a id="sh" href="https://example.org/shadow"><span id="sh-text">Shadow link</span></a> <span id="sh-plain">Plain</span> <input id="sh-in" type="text" value="Box">'; } });</script>
</body></html>`;
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(300);
    fs.writeFileSync(OUT + 'links-widget.html', LINKS);
    await page.setInputFiles('#widget-input', OUT + 'links-widget.html');
    const lk = 'dev-links:1';
    ok(await connected(lk), '(a widget file uploaded in Developer mode opens)');
    await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await B(ik => window.__board21.closeWin(ik), lk); await page.waitForTimeout(300);
    await B(() => window.__board21.openWidget('dev-links'));
    ok(await connected(lk) && await eventually(async () => frameOf(lk).evaluate(() => !!Board21.context && Board21.context.devMode === false)), '(Developer mode off, and the widget opened again)');
    await B(ik => window.__board21.setRect(ik, { x: 640, y: 40, w: 360, h: 340 }), lk); await page.waitForTimeout(400);
    const lw = frameOf(lk);
    ok(await menuAt(lw, '#site-text') === 'menu', 'in a widget: a link’s text, in a <span>, keeps the browser’s menu');
    ok(await menuAt(lw, '#site-icon circle') === 'menu', 'and so does its icon');
    ok(await menuAt(lw, '#site') === 'menu', 'and the link itself');
    ok(await rightClick(lw, '#site-text', await frameBox(lk)) === 'menu', 'a real right-click there too');
    ok(await menuInShadow(lw, '#card', '#sh-text') === 'menu', 'a link inside a web component, its text in a <span>, keeps it too');
    ok(await rightClick(lw, '#sh-text', await frameBox(lk), '#card') === 'menu', 'a real right-click there too');
    ok(await menuInShadow(lw, '#card', '#sh-in') === 'menu', 'and so does a text box inside a web component');
    // On the board: links added to its page for the test (21Board shows none of its own), their text in a <span>.
    await B(() => {
      const add = (id, href, text, top) => {
        const a = document.createElement('a'); a.id = id; if (href) a.href = href;
        a.innerHTML = `<span id="${id}-text">${text}</span>`;
        a.style.cssText = `position:fixed;left:640px;top:${top}px;z-index:9999;padding:4px;background:#fff;font:20px system-ui`;
        document.body.appendChild(a);
      };
      add('t-link', 'https://example.org/room12', 'Room 12', 420); add('t-bare', null, 'No address', 470);
    });
    ok(await menuAt(page, '#t-link-text') === 'menu', 'on the board: a link’s text, in a <span>, keeps the browser’s menu');
    ok(await rightClick(page, '#t-link-text') === 'menu', 'a real right-click there too');

    // ---- 3. Still no menu: a button and a plain <div> in a widget, an <a> with no href, the empty board, a window's
    // title bar, and a note's text beside its link.
    ok(await menuAt(lw, '#btn') === 'prevented', 'in a widget, still none: a button');
    ok(await menuAt(lw, '#tap') === 'prevented', 'a plain <div>');
    ok(await menuAt(lw, '#bare-text') === 'prevented' && await menuAt(lw, '#bare') === 'prevented', 'an <a> with no href, and its text');
    ok(await menuInShadow(lw, '#card', '#sh-plain') === 'prevented' && await menuAt(lw, '#card') === 'prevented', 'a web component, beside the link inside it');
    ok(await menuAt(page, '#t-bare-text') === 'prevented', 'on the board, still none: an <a> with no href');
    ok(await menuAt(page, '#desk') === 'prevented', 'the empty board');
    ok(await menuAt(page, `.win[data-ikey="${nt}"] .win-title`) === 'prevented', 'a window’s title bar');
    ok(await menuAt(ntf, '#view') === 'prevented', 'a note’s text beside its link');
    await B(() => { for (const id of ['t-link', 't-bare']) document.getElementById(id).remove(); });

    // ---- 4. Board history: a Video Player's line is its video's title. With none, the site's name and "video", never
    // its link or id. Content the widget reads as no video gives no line. Read from BoardHistory.lines, then from a
    // version saved with these windows, shown in Board history: the version's windows, and Now in each window's Earlier
    // versions…. A note holding one long link shows that a line with no spaces stays inside its row.
    const cut = s => s.slice(0, s.lastIndexOf(' ', 79)).replace(/[,;:.]+$/, '') + '…';   // (over 80 characters: as excerptOf cuts it)
    const shown = s => s.length > 80 ? cut(s) : s;
    const yt = { source: 'youtube', videoId: VID2, videoUrl: `https://youtu.be/${VID2}?t=30`, start: 30 }, dr = { source: 'drive', videoId: D1, videoUrl: `https://drive.google.com/file/d/${D1}/view?usp=sharing` };
    const vi = { source: 'vimeo', videoId: V1, videoUrl: `https://vimeo.com/${V1}` }, dm = { source: 'dailymotion', videoId: 'x7tgad0', videoUrl: 'https://www.dailymotion.com/video/x7tgad0' };
    const old = { videoId: VID2, videoUrl: `https://www.youtube.com/watch?v=${VID2}` };   // (saved before Drive and Vimeo: no source, no History)
    const listed = (v, title) => Object.assign({}, v, { history: [Object.assign({}, v, title ? { title } : {})] });   // (its History: this video)
    const BUNNY = YT_TITLES[VID2], LONG = 'The Water Cycle for Kids: Evaporation, Condensation, and Precipitation, with a Song to Sing Along';
    // [content, its line, what it is]. The first nine are windows on the board too.
    const VIDEOS = [
      [listed(yt), 'YouTube video', 'YouTube, no title yet'],
      [listed(dr), 'Google Drive video', 'Google Drive, which never has a title'],
      [listed(vi), 'Vimeo video', 'Vimeo, no title yet'],
      [old, 'YouTube video', 'content saved before Drive and Vimeo (no source)'],
      [listed(yt, BUNNY), BUNNY, 'YouTube with a title'],
      [{ videoId: null, videoUrl: '', history: listed(yt, BUNNY).history }, '', 'no video: no line'],
      [listed(dm), '', 'a site it doesn’t know: no line'],
      [listed(vi, LONG), LONG, 'Vimeo with a long title'],
      [{ source: 'youtube', videoId: VID2 }, '', 'no link: no line, as the window shows no video'],
      [listed(vi, VIMEO_TITLES[V1]), VIMEO_TITLES[V1], 'Vimeo with a title'],
      [Object.assign({}, old, { history: [Object.assign({}, old, { title: BUNNY })] }), BUNNY, 'no source, with a title'],
      [listed(dm, 'Volcanoes'), '', 'a site it doesn’t know, with a title: no line'],
      [listed(Object.assign({}, yt, { source: 'toString' })), '', 'a source named like a built-in property (toString): no line'],
      [listed(Object.assign({}, yt, { source: null })), '', 'a source of null: no line'],
      // Damaged content, as the widget's readEntry reads it (video-links.js): each site's id, the link's length, and
      // Vimeo's hash or Drive's resource key.
      [{ source: 'youtube', videoId: VID2, history: [Object.assign({}, yt, { title: BUNNY })] }, '', 'no link, with a title in its History: no line'],
      [listed(Object.assign({}, yt, { videoId: 42 })), '', 'an id that isn’t text: no line'],
      [listed(Object.assign({}, yt, { videoId: 'videoseries' })), '', 'a playlist’s id (videoseries): no line'],
      [listed(Object.assign({}, dr, { videoId: 'short' })), '', 'a Drive id too short: no line'],
      [listed(Object.assign({}, vi, { videoId: 'room12' })), '', 'a Vimeo id that isn’t a number: no line'],
      [listed(Object.assign({}, yt, { videoUrl: `https://youtu.be/${VID2}?x=${'a'.repeat(2000)}` })), '', 'a link over 2,000 characters: no line'],
      [listed(Object.assign({}, vi, { hash: VH })), 'Vimeo video', 'an unlisted Vimeo video, no title yet'],
      [listed(Object.assign({}, vi, { hash: 'room 12' })), '', 'a damaged Vimeo hash: no line'],
      [listed(Object.assign({}, dr, { resourceKey: RK })), 'Google Drive video', 'a Drive video with its resource key'],
      [listed(Object.assign({}, dr, { resourceKey: 7 })), '', 'a damaged Drive resource key: no line']
    ];
    const got = await B(list => list.map(d => [window.__board21.history.lines['youtube-player'](d), window.__board21.history.excerptOf(d, 'youtube-player')]), VIDEOS.map(v => v[0]));
    VIDEOS.forEach(([, want, what], k) => ok(got[k][0] === want && got[k][1] === shown(want), `BoardHistory.lines: ${what}: “${shown(want)}” (${JSON.stringify(got[k]).slice(0, 300)})`));
    // The sites' names are the widget's own (its SOURCES), which the board keeps a copy of.
    const SITES = [...fs.readFileSync(path.join(ROOT, 'widgets', 'youtube-player', 'index.html'), 'utf8').matchAll(/(\w+): \{\s*name: '([^']+)', open: 'Open in /g)].map(m => [m[1], m[2]]);
    const plain = { youtube: yt, drive: dr, vimeo: vi };
    ok(SITES.length === 3 && SITES.every(([s]) => plain[s]), `(the widget’s three sites: ${JSON.stringify(SITES)})`);
    const named = await B(list => list.map(d => window.__board21.history.lines['youtube-player'](d)), SITES.map(([s]) => listed(plain[s] || yt)));
    SITES.forEach(([s, name], k) => ok(named[k] === `${name} video`, `the site’s name is the widget’s: “${name} video” (${named[k]})`));
    // In the widget dev window, which doesn't load video-links.js, the line skips the checks that need it.
    const bare = await B(list => { const L = self.B21VideoLinks; self.B21VideoLinks = undefined; try { return list.map(d => window.__board21.history.lines['youtube-player'](d)); } finally { self.B21VideoLinks = L; } },
      [listed(yt), listed(dr), { source: 'youtube', videoId: VID2 }]);
    ok(JSON.stringify(bare) === JSON.stringify(['YouTube video', 'Google Drive video', '']), `without video-links.js, as in the dev window: the site’s name, and no line for no link (${JSON.stringify(bare)})`);
    const NOTE_LINK = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghij/edit?usp=sharing', NOTE_LINE = NOTE_LINK.slice(0, 79) + '…';
    const WINS = VIDEOS.slice(0, 9), vk = k => 'youtube-player:' + (k + 1), nameOf = k => 'Video Player' + (k ? ' ' + (k + 1) : '');
    const at = k => ({ x: 8 + 270 * (k % 5), y: 8 + 300 * Math.floor(k / 5), w: 262, h: 280 });
    const exp = { format: '21board', formatVersion: 1, kind: 'full', exportedAt: new Date().toISOString(), board: { name: 'Videos' },
      instances: WINS.map(([data], k) => ({ widgetId: 'youtube-player', instance: k + 1, open: true, z: k + 1, rect: at(k), data, config: null }))
        .concat([{ widgetId: 'notes', instance: 1, open: true, z: WINS.length + 1, rect: at(WINS.length), data: { text: NOTE_LINK }, config: null }]) };
    await B(f => window.__board21.applyImport(f, 'replace'), exp); await freeBoard(page);   // (the file's board is Widescreen)
    const up = [];
    for (let k = 0; k < WINS.length; k++) up.push(await connected(vk(k)));
    ok(up.every(Boolean) && await connected('notes:1'), `(the ${WINS.length} Video Players and the note open: ${up.join(', ')})`);
    await page.waitForTimeout(1200);
    const kept = await B(n => Array.from({ length: n }, (_, k) => JSON.stringify(window.__board21.state.data.get('youtube-player:' + (k + 1)))), WINS.length);
    ok(kept.every((s, k) => s === JSON.stringify(WINS[k][0])), `(each window’s content is as it was imported${kept.filter((s, k) => s !== JSON.stringify(WINS[k][0])).map(s => ': ' + s).join('')})`);
    // The board and the widget agree: a window has no line exactly when it shows the link box.
    const look = ik => frameOf(ik).evaluate(() => { const $ = id => document.getElementById(id); return !$('ask').hidden ? 'link box' : !$('player').hidden ? 'player' : '?'; });
    const looks = [];
    for (let k = 0; k < WINS.length; k++) looks.push(await look(vk(k)));
    ok(looks.every((l, k) => l === (WINS[k][1] ? 'player' : 'link box')), `each window shows the link box exactly when its line is empty (${looks.join(', ')})`);
    await B(() => window.__board21.history.save('Videos'));
    const vid = await B(async () => { await window.__board21.history.reload(); const m = window.__board21.history.metas.find(m => m.label === 'Videos'); return m ? m.id : null; });
    const saved = await B(([id, n]) => { const m = window.__board21.history.metas.find(m => m.id === id), w = (m && m.wins) || {}; return Array.from({ length: n }, (_, k) => w['youtube-player:' + (k + 1)] ? w['youtube-player:' + (k + 1)][5] : null).concat([w['notes:1'] ? w['notes:1'][5] : null]); }, [vid, WINS.length]);
    ok(!!vid && saved.every((s, k) => s === (k < WINS.length ? shown(WINS[k][1]) : NOTE_LINE)), `the version saved keeps each window’s line (${JSON.stringify(saved)})`);
    await openSettings(page);
    await page.click('#settings [data-act="hist-open"]'); await page.waitForSelector('#history.open [data-act="save"]');
    await page.locator(`#history .hist-row[data-val="${vid}"]`).click();
    await page.waitForSelector('#history-detail.open .inst');
    const rows = Object.fromEntries(await page.$$eval('#history-detail.open .inst .meta', els => els.map(e => [e.querySelector('b').textContent, e.querySelector('span').textContent])));
    WINS.forEach(([, want, what], k) => ok(rows[nameOf(k)] === shown(want), `Board history, Windows in this version: ${what}: “${shown(want)}” (${JSON.stringify(rows[nameOf(k)])})`));
    ok(rows.Notes === NOTE_LINE && !/\s/.test(rows.Notes), `(the note’s line is its link, with no spaces: ${rows.Notes})`);
    const fits = () => page.$$eval('.open .inst .meta', els => els.map(m => {
      const row = m.closest('.inst').getBoundingClientRect(), s = m.querySelector('span').getBoundingClientRect();
      return s.right <= row.right + 0.5 && m.scrollWidth <= m.clientWidth ? '' : m.querySelector('b').textContent;
    }).filter(Boolean));
    const over = await fits();
    ok(!over.length, `each line stays inside its row, a long title and a link in a note too (${over.join(', ')})`);
    await page.waitForTimeout(500); await page.screenshot({ path: OUT + 'video-lines.png' });
    for (let k = 0; k < 4 && await page.locator('#settings.open, #history.open, #history-detail.open').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    const nowOf = async ik => {
      await page.click(`.win[data-ikey="${ik}"] .win-label`); await page.click('#menu [data-act="history"]');
      await page.waitForSelector('#history.open .hist-intro'); await page.waitForTimeout(300);
      return page.$$eval('#history.open .inst .meta', els => els.length ? els[0].querySelector('b').textContent + ': ' + els[0].querySelector('span').textContent : '');
    };
    const nows = [];
    for (let k = 0; k < WINS.length; k++) {
      nows.push(await nowOf(vk(k)));
      if (WINS[k][1] === LONG) { const o = await fits(); ok(!o.length, `its Earlier versions…: a long title stays inside its row (${o.join(', ')})`); await page.screenshot({ path: OUT + 'video-lines-now.png' }); }
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    }
    WINS.forEach(([, want, what], k) => ok(nows[k] === 'Now: ' + (shown(want) || '(empty)'), `Earlier versions…, Now: ${what}: “${shown(want) || '(empty)'}” (${nows[k]})`));
    const noteNow = await nowOf('notes:1'), noteOver = await fits();
    ok(noteNow === 'Now: ' + NOTE_LINE && !noteOver.length, `the note’s Earlier versions…: its link stays inside its row (${noteNow}${noteOver.length ? '; over: ' + noteOver.join(', ') : ''})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // ---- 5. CLAUDE.md: its own lists of three take the Oxford comma, five of them (Tyler approved each). Wrapped lines
    // are joined first.
    const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').replace(/\s*\n\s*/g, ' ');
    for (const [was, now] of [
      ['See README.md, docs/WIDGET-SDK.md and docs/DATA-FORMAT.md.', 'See README.md, docs/WIDGET-SDK.md, and docs/DATA-FORMAT.md.'],
      ['Going online for updates, district apps and videos is fine.', 'Going online for updates, district apps, videos, and the weather is fine.'],
      ['Cut hedges, qualifiers, parentheticals and stacked clauses.', 'Cut hedges, qualifiers, parentheticals, and stacked clauses.'],
      ['builds, reviews and fixes', 'builds, reviews, and fixes'],
      ['Every change to the interface, a widget or how the board behaves', 'Every change to the interface, a widget, or how the board behaves']]) {
      ok(claude.includes(now) && !claude.includes(was), `CLAUDE.md: “${now}”`);
    }
    ok(claude.split('Build it, check it, then publish it again to that link.').length === 3, 'CLAUDE.md: “Build it, check it, then publish it”, a sequence, stays as it is');

    // The docs say links keep the menu.
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' '), sdkDoc = fs.readFileSync(path.join(ROOT, 'docs', 'WIDGET-SDK.md'), 'utf8').replace(/\s+/g, ' ');
    ok(/\*\*Right-click\.\*\*/.test(sdkDoc), 'WIDGET-SDK has a Right-click note');

    ok(stamped(), STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ];
};
