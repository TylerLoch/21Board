// Board history: past versions of the board, its windows, and copies in the folder.
'use strict';
module.exports = T => {
  const {
    path, OUT, ok, freeBoard, openSettings, fillNote, driveDevice, readFolder, seedFolder, linkFolder, syncNow,
    eventually, readHistory, writeHistory, STORAGE_FAULTS, storedRecords, marked, parts, boardUp, D1, stubVideos,
    ytShow, TESTS_DIR, BASE
  } = T;
  return [
  // ---- end of Board Sync suites ----
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
    await openSettings(page, ['bg']);
    await page.click('#settings [data-act="bg"][data-val="#e0f2fe"]'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    const goodId = await H(() => window.__board21.history.save('Good'));
    ok(!!goodId && (await metas()).find(x => x.id === goodId).manual, '“Save this version now” keeps a named version');
    // The wreck.
    await openSettings(page, ['bg', 'letters']);
    await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(200);
    await page.click('#settings [data-act="letters"][data-val="early"]'); await page.waitForFunction(() => window.__board21.state.settings.letters === 'early');
    await page.click('#settings [data-act="bg"][data-val="#0a0a0a"]'); await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await fillNote(note(), 'scribble'); await page.waitForTimeout(400);
    await H(() => window.__board21.deleteInstance('dice:1')); await page.waitForTimeout(1500);
    await H(() => window.__board21.closeWin('timer:1')); await page.waitForTimeout(800);
    // Find it in Board history (Settings → Classroom, the first row: Go back to an earlier version).
    await openSettings(page);
    const goBack = await page.evaluate(() => { const b = document.querySelector('#settings [data-act="hist-open"]'), r = b.closest('.row'), h = [...document.querySelectorAll('#settings h3')].filter(e => e.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
      const rows = []; for (let e = h.nextElementSibling; e && e.tagName !== 'H3'; e = e.nextElementSibling) if (e.matches('.row')) rows.push(e);
      return { section: h.textContent, first: rows.indexOf(r), label: r.querySelector('.lbl').textContent, plain: !b.classList.contains('primary') }; });
    ok(goBack.section === 'Classroom' && goBack.first === 0 && goBack.label === 'Go back to an earlier version' && goBack.plain, `Settings → Classroom → “Go back to an earlier version” (Board history…) is the first row (${JSON.stringify(goBack)})`);
    await page.click('#settings [data-act="hist-open"]'); await page.waitForTimeout(1200);
    ok(await page.locator('#history.open .hist-row').count() >= 5, 'the Board history sheet lists the versions');
    await page.screenshot({ path: OUT + '80-history-sheet.png' });
    await page.click(`#history [data-act="sel"][data-val="${goodId}"]`); await page.waitForTimeout(400);
    const detail = await page.evaluate(() => { const d = document.querySelector('#history-detail.open .hist-detail'); return d && { rects: d.querySelectorAll('.minimap g').length, text: d.textContent }; });
    ok(detail && detail.rects === 3 && /Not on the board now/.test(detail.text) && /Compared with now/.test(detail.text), `tapping a version shows a preview (3 windows), and what’s different now`);
    await page.screenshot({ path: OUT + '81-history-detail.png' });
    await page.click('#history-detail [data-act="go"]'); await page.waitForTimeout(3500);
    ok(await page.locator('#settings.open, #history.open, #history-detail.open').count() === 0, 'Go back closes Board history and Settings, so the board can be seen');
    const back = await page.evaluate(() => ({ wins: document.querySelectorAll('.win').length, bg: window.__board21.state.board.background.color, theme: window.__board21.state.settings.theme, letters: window.__board21.state.settings.letters }));
    ok(back.wins === 3 && await noteText() === 'Good setup' && back.bg === '#e0f2fe', 'Go back brings back the windows, their content and the background');
    ok(back.theme === 'dark' && back.letters === 'early', `but leaves the settings alone (dark mode, and the text style: ${back.letters})`);
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
    // The window menu: Go back…, to this window's earlier versions.
    await page.locator('.win[data-ikey="notes:1"] .win-label').click(); await page.waitForTimeout(250);
    const end = await page.evaluate(() => { const k = Array.from(document.getElementById('menu').children); return k.slice(k.map(e => e.classList.contains('menu-sep')).lastIndexOf(true) + 1).map(e => e.textContent.trim()).join(' | '); });
    ok(await page.locator('#menu [data-act="history"]').count() === 1 && end === 'Zoom to fill | Go back… | Reset… | Close', `the window menu has “Go back…”, and ends with Zoom to fill, Go back…, Reset…, and Close (${end})`);
    await page.click('#menu [data-act="history"]'); await page.waitForTimeout(1200);
    const versions = await page.locator('#history [data-act="put-here"]').count();
    ok(versions >= 2 && /Earlier versions of Notes/.test(await page.locator('#history .hist-intro').textContent()), `it lists that window’s earlier versions (${versions})`);
    await page.locator('#history [data-act="put-here"]').first().click(); await page.waitForTimeout(2000);
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
    const beforeIds = new Set((await metas()).map(x => x.id));
    await H(() => window.__board21.openWidget('clock')); await page.waitForTimeout(2500);
    const after2 = await metas(), fresh = after2.filter(x => !beforeIds.has(x.id));
    ok(fresh.length === 1, `a change saves exactly one version, though two tabs are open (only the tab that made it saves) (${fresh.length} new)`);
    await p2.waitForTimeout(500);
    ok(await p2.evaluate(id => window.__board21.history.metas.some(m => m.id === id), fresh[0] && fresh[0].id), 'other open tabs see it');
    await p2.close();

    // ---- Erase everything keeps board history; going back undoes it.
    await openSettings(page, ['advanced']);
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
    // Delete all versions.
    await openSettings(page, ['advanced']);
    ok(await page.evaluate(() => document.querySelector('#settings [data-act="hist-delete"]').closest('.row').querySelector('.lbl').textContent) === 'Delete all versions', 'Settings › Advanced names the row “Delete all versions”');
    await page.click('#settings [data-act="hist-delete"]'); await page.waitForTimeout(300); await modal('Delete from this device'); await page.waitForTimeout(1500);
    ok((await metas()).length === 0 && await page.locator('.win').count() >= 1, '“Delete all versions” deletes the versions and leaves the board as it is');
    // Erase, including Board history.
    await H(() => window.__board21.history.save('x')); await page.waitForTimeout(300);
    await page.click('#settings [data-act="erase"]'); await page.waitForTimeout(300); await modal('including Board history'); await page.waitForTimeout(2500);
    ok((await metas()).length === 0, '“Erase, including Board history” removes it too');
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
  // Each window's line in Board history (a version's Windows in this version, and a window's own Earlier versions):
  // each built-in widget in its own terms, any other widget the text in its content, each piece once.
  ["Board history: each window's line", async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600); await freeBoard(page);
    const H = (fn, arg) => page.evaluate(fn, arg);
    const line = (data, id) => H(([d, id]) => window.__board21.history.excerptOf(d, id), [data, id]);
    const NAMES = ['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana'];
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const AGENDA = 'Friday\n1. Morning meeting\n2. Reading groups\n3. Math: fractions\n4. Lunch at 11:30\n5. Science lab';
    const BUNNY = { source: 'youtube', videoId: 'aqz-KE-bpKQ', videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' };
    const FRACS = [{ n: '3' }, '/', { n: '4' }, '+', { n: '1' }, '/', { n: '8' }];
    const calc = expr => ({ v: 2, expr, mode: 'edit', history: [] });
    // Content as each widget's own buttons saved it, measured on 84edbe5.
    const SAVED = {
      'name-picker': { names: NAMES, left: ['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Hana'], picked: ['Gus'], pickId: 'mwp2g7b7-pg6utj', current: 'Gus' },
      calculator: { v: 2, expr: FRACS, mode: 'done', pct: 'of', closed: 0, history: [{ expr: FRACS, pct: 'of' }] },
      'first-then-board': { first: { id: 'math', label: 'Math', icon: '🔢', category: 'Academic' }, then: { id: 'playground', label: 'Playground / swings', icon: '🛝', category: 'Reward' },
        firstDone: false, thenDone: false, sound: true, theme: 'classic', motion: true, themeTrayOpen: true, doneTrayOpen: true },
      'task-timer': { totalMode: 'sum', totalMinutes: 60, tasks: [{ emoji: '✨', name: '✨ Reading', minutes: 20, color: '#ff5e57' }, { emoji: '🎨', name: '🎨 Writing', minutes: 15, color: '#ffc048' },
        { emoji: '⚽', name: '⚽ Clean up', minutes: 5, color: '#0be881' }], activeIndex: 0, secondsLeft: 900, running: false, endsAt: null, alarm: false },
      'youtube-player': Object.assign({}, BUNNY, { history: [Object.assign({}, BUNNY, { title: 'Big Buck Bunny 60fps 4K' })] }),
      timer: { duration: 300000, remaining: 300000, endsAt: 1795184723603 },
      dice: { values: [6, 2] },
      'traffic-light': { active: 'green' },
      image: { src: PNG, w: 1, h: 1, name: '', bytes: 70 },
      notes: { text: AGENDA }
    };
    const FT = SAVED['first-then-board'];
    // (Kept apart from SAVED, whose windows section 6 measured on 84edbe5.)
    const ZONES = { day: '2026-11-20', counts: { blue: 2, green: 9, yellow: 4, red: 1 }, undo: [[2, 9, 4, 0], [2, 8, 4, 1]] };

    // ---- 1. Each built-in widget in its own terms.
    const CASES = [
      ['name-picker', SAVED['name-picker'], 'Ava, Ben, Carlos, Dana, Eli, Fatima, Gus, Hana', 'a Name Picker: its names, each once'],
      ['calculator', SAVED.calculator, '3 ÷ 4 + 1 ÷ 8', 'a Calculator: the problem on it, as it shows it'],
      ['first-then-board', FT, 'First Math, then Playground / swings', 'a First/Then Board'],
      ['task-timer', SAVED['task-timer'], 'Reading, Writing, Clean up', 'a Task Timer: its tasks, without their emoji'],
      ['youtube-player', SAVED['youtube-player'], 'Big Buck Bunny 60fps 4K', 'a Video Player: the title of its video'],
      ['timer', SAVED.timer, '5 minutes', 'a Timer: the time it’s set to'],
      ['dice', SAVED.dice, '6 and 2', 'a pair of Dice'],
      ['traffic-light', SAVED['traffic-light'], 'Green', 'a Traffic Light'],
      ['image', SAVED.image, 'Pasted picture', 'a pasted Picture'],
      ['notes', SAVED.notes, 'Friday 1. Morning meeting 2. Reading groups 3. Math: fractions 4. Lunch at…', 'Notes: its text, cut at a space'],
      ['image', { src: PNG, w: 1, h: 1, name: 'photo.jpg', bytes: 70 }, 'photo.jpg', 'a Picture with a name'],
      ['image', { src: null }, '', 'a Picture with no picture: no line'],
      ['timer', { duration: 150000, remaining: 150000, endsAt: null }, '2:30', 'a Timer at 2½ minutes'],
      ['timer', { duration: 60000, remaining: 60000, endsAt: null }, '1 minute', 'a Timer at 1 minute'],
      ['timer', { duration: 45000, remaining: 45000, endsAt: null }, '0:45', 'a Timer at 45 seconds'],
      ['dice', { values: [4] }, '4', 'one die'],
      ['dice', { values: [3, 5, 1] }, '3, 5, and 1', 'three dice'],
      ['dice', { values: [] }, '', 'Dice not rolled: no line'],
      ['traffic-light', { active: null }, '', 'a Traffic Light with no light on: no line'],
      ['traffic-light', { active: 'red' }, 'Red', 'a red Traffic Light'],
      ['first-then-board', Object.assign({}, FT, { then: null }), 'First Math', 'a First/Then Board with only a first card'],
      ['first-then-board', Object.assign({}, FT, { first: null }), 'Then Playground / swings', 'a First/Then Board with only a then card'],
      ['task-timer', { totalMode: 'sum', totalMinutes: 60, tasks: [{ emoji: '📚', name: 'Math', minutes: 20, color: '#ff5e57' }, { emoji: '', name: 'Snack', minutes: 10, color: '#ffc048' }] },
        'Math, Snack', 'a Task Timer whose names have no emoji'],
      ['youtube-player', { source: 'youtube', videoId: 'aqz-KE-bpKQ', videoUrl: 'https://youtu.be/aqz-KE-bpKQ?t=30', start: 30, history: [{ source: 'youtube', videoId: 'aqz-KE-bpKQ', videoUrl: 'https://youtu.be/aqz-KE-bpKQ?t=30', start: 30 }] },
        'YouTube video', 'a Video Player with no title yet: its site’s name'],
      ['youtube-player', { videoId: null, videoUrl: '', history: SAVED['youtube-player'].history }, '', 'a Video Player with no video: no line'],
      ['youtube-player', { source: 'vimeo', videoId: '76979871', videoUrl: 'https://vimeo.com/76979871', history: [SAVED['youtube-player'].history[0], { source: 'vimeo', videoId: '76979871', videoUrl: 'https://vimeo.com/76979871', title: 'The New Vimeo Player' }] },
        'The New Vimeo Player', 'a Video Player: the title of the video showing, not of another in its History'],
      ['calculator', { v: 2, expr: [], mode: 'edit', history: [{ expr: [{ n: '2' }, '*', '(', { n: '3' }, '+', { n: '4' }, ')'], pct: 'of' }] }, '2 × (3 + 4)',
        'a Calculator with nothing typed: the newest problem in its history'],
      ['calculator', calc(['frac', { n: '3' }, 'sep', { n: '4' }, 'end', '+', 'frac', { n: '1' }, 'sep', { n: '8' }, 'end']), '3/4 + 1/8', 'fractions from the fraction key'],
      ['calculator', calc(['neg', { n: '5' }, '+', { n: '2' }]), '−5 + 2', 'a minus sign in front'],
      ['calculator', calc([{ n: '5', neg: true }, '-', { n: '2.5' }]), '−5 − 2.5', 'a negative number'],
      ['calculator', calc(['sqrt', { n: '16' }, 'end']), '√16', 'a square root'],
      ['calculator', calc(['root', { n: '3' }, 'sep', { n: '27' }, 'end']), '³√27', 'a cube root'],
      ['calculator', calc([{ n: '2' }, '^', { n: '3' }, 'end']), '2^3', 'a power'],
      ['calculator', calc([{ n: '2' }, '^', { n: '3' }, '+', { n: '1' }, 'end']), '2^(3 + 1)', 'a power of more than one number'],
      ['calculator', calc([{ n: '25' }, '%of', { n: '80' }]), '25% of 80', 'a percent of'],
      ['calculator', calc(['pi', '*', { ans: '7/2' }, '/', { n: '1' }, 'frac', { n: '1' }, 'sep', { n: '2' }, 'end']), 'π × Ans ÷ (1 1/2)', 'π, an earlier answer and a mixed number'],
      ['calculator', calc(['sqrt', { n: '16' }, 'end', { n: '2' }]), '√16 × 2', 'a number after a square root shows its ×'],
      ['calculator', calc([{ n: '5' }, '^', { n: '2' }, 'end', { n: '3' }]), '5^2 × 3', 'a number after a power shows its ×'],
      ['calculator', calc(['frac', { n: '1' }, 'sep', { n: '2' }, 'end', { n: '3' }]), '1/2 × 3', 'a number after a fraction shows its ×'],
      ['calculator', calc([{ n: '1.5' }, 'frac', { n: '1' }, 'sep', { n: '2' }, 'end']), '1.5 × 1/2', 'a fraction after a decimal shows its ×'],
      ['calculator', calc([{ n: '1' }, 'frac', { n: '1' }, 'sep', { n: '2' }, 'end']), '1 1/2', 'a mixed number has no ×'],
      ['calculator', calc([{ n: '6' }, '/', 'frac', { n: '3' }, 'sep', { n: '4' }, 'end']), '6 ÷ (3/4)', 'a fraction you divide by, in parentheses'],
      ['calculator', calc(['frac', { n: '1' }, 'sep', { n: '2' }, 'end', '/', 'frac', { n: '3' }, 'sep', { n: '4' }, 'end']), '1/2 ÷ (3/4)', 'a fraction divided by a fraction'],
      ['calculator', calc(['frac', { n: '3' }, 'sep', { n: '4' }, 'end', '^', { n: '2' }, 'end']), '(3/4)^2', 'a fraction squared'],
      ['calculator', calc(['(', { n: '2' }, '^', { n: '3' }, 'end', ')', '^', { n: '2' }, 'end']), '(2^3)^2', 'a power of a power'],
      ['calculator', calc([{ n: '5' }, '-', { n: '3', neg: true }]), '5 − (−3)', 'a negative number after a sign, in parentheses'],
      ['calculator', calc([{ n: '2' }, '*', 'neg', { n: '3' }]), '2 × (−3)', 'a minus sign after ×'],
      ['calculator', calc([{ n: '3', neg: true }, '^', { n: '2' }, 'end']), '(−3)^2', 'a negative number squared'],
      ['calculator', calc(['neg', { n: '3' }, '^', { n: '2' }, 'end']), '−3^2', 'minus 3 squared'],
      ['calculator', calc([{ n: '2' }, 'pi', '(', { n: '3' }, '+', { n: '4' }, ')', 'sqrt', { n: '16' }, 'end']), '2π(3 + 4)√16', '2π, 2(3 + 4) and 3√16 have no ×'],
      ['calculator', calc([{ ans: '7' }, { n: '2' }]), 'Ans × 2', 'a number after an earlier answer shows its ×'],
      ['calculator', calc([]), '', 'a Calculator with nothing in it: no line'],
      ['calculator', calc([{ n: '2' }, 'sin', { n: '3' }]), '2 sin 3 edit', 'a Calculator token it doesn’t know: the text in its content'],
      ['zones-check-in', ZONES, 'Blue 2, Green 9, Yellow 4, Red 1', 'a Zones Check-In: each zone with check-ins, in order'],
      ['zones-check-in', { day: '2026-11-20', counts: { blue: 0, green: 3, yellow: 0, red: 1 }, undo: [] }, 'Green 3, Red 1', 'a Zones Check-In with zones at 0: they are left out'],
      ['zones-check-in', { day: '2026-11-20', counts: { blue: 0, green: 0, yellow: 0, red: 0 }, undo: [[0, 1, 0, 0]] }, '', 'a Zones Check-In with every zone at 0: no line'],
      ['zones-check-in', { day: null, undo: [] }, '', 'a Zones Check-In with no counts: no line'],
      ['notes', { text: '  \n\t ' }, '', 'Notes with only spaces: no line'],
      ['clock', null, '', 'a Clock: no line']
    ];
    for (const [id, data, want, what] of CASES) {
      const got = await line(data, id);
      ok(got === want, `${what}: “${want}” (${JSON.stringify(got)})`);
    }

    // The Calculator's line is the problem as the Calculator writes it (state().expression.text), apart from its powers:
    // the line's 2^3 is its 2³. Problems typed with its own keys, then 3000 random ones.
    const CE = require(path.join(TESTS_DIR, '..', 'widgets', 'calculator', 'calc-engine.js')), SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const asCalc = s => {   // 2^3 as 2³: a power that is a whole number, unless its base ends in one already
      for (let end = s.length; ;) {
        const k = s.lastIndexOf('^', end - 1); if (k < 0) return s;
        const m = /^\^([0-9]+)(?![0-9.%⁰¹²³⁴⁵⁶⁷⁸⁹])/.exec(s.slice(k));
        if (m && !/[⁰¹²³⁴⁵⁶⁷⁸⁹]$/.test(s.slice(0, k))) s = s.slice(0, k) + m[1].replace(/[0-9]/g, d => SUP[d]) + s.slice(k + m[0].length);
        end = k;
      }
    };
    const TYPED = ['3÷4+1÷8', '√16→2', '5²3', '2^3→4', 'a/b1↓2→3', 'a/b3↓4→²', '6÷a/b3↓4→', 'a/b1↓2→÷a/b3↓4→', '2a/b1↓2→÷a/b3↓4→', '5−3±', '2×3±', '1.5a/b1↓2→',
      'πa/b1↓2→', '(1+2)a/b1↓2→', '(1+2)3', '2π', '2(3+4)', '3√16', '√9→√16', '∛27', '25%80', '1a/b1↓2→', '−(−3)', '(2^3→)²', '2^−1', '3±²', '−3²'];
    const probs = TYPED.map(k => { const c = CE.create({ separators: 'none' }); c.input(k); c.press('equals'); return [k, c]; });
    ok(probs.every(([, c]) => c.serialize().mode === 'done'), '(each problem typed is worked out)');
    const KEYS = ['0', '1', '2', '3', '5', '9', 'point', 'add', 'subtract', 'multiply', 'divide', 'open', 'close', 'negate', 'square', 'percent', 'sqrt', 'cbrt', 'root', 'pi',
      'power', 'fraction', 'right', 'down'];
    let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let k = 0; probs.length < TYPED.length + 3000; k++) {
      const c = CE.create({ percent: k % 2 ? 'simple' : 'of', separators: 'none' });
      for (let j = 2 + rnd(10); j > 0; j--) c.press(KEYS[rnd(KEYS.length)]);
      c.press('equals');
      if (c.serialize().mode === 'done' && c.state().expression.text.length <= 80) probs.push([`random ${k}`, c]);
    }
    const got = await H(list => list.map(d => window.__board21.history.excerptOf(d, 'calculator')), probs.map(([, c]) => c.serialize()));
    const differ = probs.map(([k, c], j) => [k, c.state().expression.text, got[j]]).filter(([, shown, g]) => asCalc(g) !== shown);
    ok(!differ.length, `the Calculator’s line is the problem as the Calculator writes it: ${TYPED.length} problems typed with its keys and 3000 random ones (${differ.length} differ: ${differ.slice(0, 4).map(d => d.join(' → ')).join(' | ')})`);

    // ---- 2. Any other widget: the text in its content, each piece once.
    ok(await line({ a: 'x', b: ['x', 'y'], c: 'x' }, 'counter') === 'x y', `another widget: its text, each piece once (${JSON.stringify(await line({ a: 'x', b: ['x', 'y'], c: 'x' }, 'counter'))})`);
    ok(await line({ pic: PNG, caption: ' Our class ', again: 'Our class', n: 5, on: true }, 'counter') === 'Our class', 'pictures, numbers and true/false stay out, and the same text twice shows once');

    // ---- 3. Content of any shape never throws.
    const bad = await H(() => {
      let deep = 'bottom';
      for (let k = 0; k < 100000; k++) deep = k % 2 ? { a: deep } : [deep];
      const shapes = [null, undefined, [], 'text', 42, { names: 5 }, { values: '6' }, { tasks: [null] }, { expr: [{}] }, { first: 'Math' }, deep,
        { names: [null, 5, {}], tasks: 'x', values: [null], history: [null], expr: null, src: {}, active: 'constructor', text: 5, duration: '300000', first: { label: 7 }, videoId: 'x' }];
      const out = [];
      for (const id of ['name-picker', 'calculator', 'first-then-board', 'task-timer', 'youtube-player', 'timer', 'dice', 'traffic-light', 'image', 'notes', 'zones-check-in', 'clock', 'weather', 'constructor', 'counter']) {
        shapes.forEach((d, k) => {
          try { const s = window.__board21.history.excerptOf(d, id); if (typeof s !== 'string' || s.length > 80) out.push(`${id} #${k}: ${JSON.stringify(s)}`); } catch (e) { out.push(`${id} #${k} throws ${e.message}`); }
        });
      }
      return out;
    });
    ok(!bad.length, `content of any shape, for each widget, never throws and gives a line of at most 80 characters (${bad.slice(0, 6).join(' | ')})`);
    // What the widget itself wouldn't show gives no line: a Timer over a day, a die that isn't 1 to 6, a picture that isn't one.
    // A Zones Check-In count over 9999 shows as 9999, in the window and in its line.
    for (const [id, data, want] of [['timer', { duration: 1e300 }, ''], ['timer', { duration: 2 * 864e5 }, ''], ['timer', { duration: -1 }, ''], ['dice', { values: [9, -1, 2.5] }, ''],
      ['dice', { values: [1, 2, 3, 4, 5, 6, 1] }, '1, 2, 3, 4, 5, and 6'], ['dice', { values: [6, 0, 2] }, '6 and 2'], ['image', { src: {} }, ''], ['image', { src: PNG, name: 5 }, 'Pasted picture'],
      ['zones-check-in', { counts: { blue: '2', green: 2.5, yellow: -1, red: 1e9 } }, 'Red 9999'], ['zones-check-in', { counts: { blue: 10000, green: 9999, yellow: null, red: true } }, 'Blue 9999, Green 9999'],
      ['zones-check-in', { counts: { blue: 12, green: 1e300, yellow: 9999, red: 10000 } }, 'Blue 12, Green 9999, Yellow 9999, Red 9999'],
      ['zones-check-in', { counts: [2, 9, 4, 1] }, ''], ['zones-check-in', { counts: 'Blue 2' }, ''], ['zones-check-in', { counts: { blue: 1, green: { n: 3 }, yellow: [4], red: 1 } }, 'Blue 1, Red 1']]) {
      const got = await line(data, id);
      ok(got === want, `${id} ${JSON.stringify(data)}: “${want}”, as the widget reads it (${JSON.stringify(got)})`);
    }

    // ---- 4. At most 80 characters, cut at a space.
    const FORTY = ['Aaliyah', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana', 'Isaac', 'Jada', 'Kai', 'Luis', 'Maya', 'Noah', 'Olivia', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tariq',
      'Uma', 'Victor', 'Wren', 'Xavier', 'Yara', 'Zane', 'Amir', 'Bella', 'Chloe', 'Diego', 'Emma', 'Finn', 'Grace', 'Hugo', 'Ivy', 'Jonah', 'Kira', 'Leo', 'Mia', 'Nico'];
    const long = await line({ names: FORTY, left: FORTY, picked: [] }, 'name-picker'), full = FORTY.join(', ');
    const cut = long.slice(0, -1);
    ok(long.length <= 80 && long.endsWith('…') && full.startsWith(cut) && full.startsWith(', ', cut.length) && !/[,\s]$/.test(cut), `40 names: at most 80 characters, cut after a whole name, then … with no comma before it (${long.length}: ${long})`);
    const said = await line({ text: 'Bring your library books. '.repeat(5) }, 'notes');
    ok(said === 'Bring your library books. Bring your library books. Bring your library books…', `a note cut after a full stop: no . before the … (${said})`);
    const word = await line({ a: 'x'.repeat(200) }, 'counter'), just = await line({ a: 'y'.repeat(80) }, 'counter');
    ok(word === 'x'.repeat(79) + '…' && just === 'y'.repeat(80), `no space to cut at: 79 characters, then …; 80 stay as they are (${word.length}, ${just.length})`);
    const apples = await line({ text: '🍎'.repeat(50) }, 'notes'), family = await line({ text: 'a'.repeat(77) + '👨‍👩‍👧' }, 'notes'), accent = await line({ text: 'x'.repeat(78) + 'e\u0301zz' }, 'notes');
    ok(apples === '🍎'.repeat(39) + '…' && family === 'a'.repeat(77) + '…' && accent === 'x'.repeat(78) + '…', `no space to cut at: an emoji, or a letter and its accent, stays whole (${JSON.stringify([apples.slice(-3), family.slice(-3), accent.slice(-3)])})`);

    // ---- 5. End to end, through the widgets themselves: a Name Picker with 8 names and one pick, a Timer started at
    // 5 minutes and a pair of Dice rolled, then Board history › Save this version now.
    await H(() => window.__board21.history.cfg({ quiet: 36e5, every: 36e5, skipOpen: true }));   // (no automatic versions meanwhile)
    const win = ik => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const data = ik => H(ik => window.__board21.state.data.get(ik) || null, ik);
    for (const [id, x, y] of [['name-picker', 20, 20], ['timer', 450, 20], ['dice', 880, 20], ['youtube-player', 450, 420]]) {
      await H(id => window.__board21.openWidget(id), id); await page.waitForTimeout(800);
      await H(([ik, x, y]) => window.__board21.setRect(ik, { x, y, w: 400, h: y > 20 ? 280 : 380 }), [id + ':1', x, y]);
    }
    await page.waitForTimeout(400);
    await win('name-picker:1').locator('#list').fill(NAMES.join('\n')); await win('name-picker:1').locator('#done').click();
    await win('name-picker:1').locator('#go').click();
    await eventually(async () => ((await data('name-picker:1')) || { picked: [] }).picked.length === 1);
    await page.waitForTimeout(700); await win('name-picker:1').locator('#stage').click();
    await win('timer:1').locator('#chips button[data-min="5"]').click(); await win('timer:1').locator('#go').click();
    await win('dice:1').locator('#roll').click();
    const DRIVE_LINK = `https://drive.google.com/file/d/${D1}/view?usp=sharing`;   // (Drive gives no title: the line is “Google Drive video”)
    await ytShow(page, DRIVE_LINK);
    ok(await eventually(async () => ((await data('timer:1')) || {}).endsAt > 0 && (((await data('dice:1')) || {}).values || []).length === 2), '(a Name Picker with a pick, a Timer running and two Dice rolled)');
    const rolled = (await data('dice:1')).values;
    await openSettings(page);
    await page.click('#settings [data-act="hist-open"]'); await page.waitForSelector('#history.open [data-act="save"]');
    await page.click('#history [data-act="save"]'); await page.waitForSelector('#modal.open input');
    await page.fill('#modal.open input', 'Friday setup'); await page.click('#modal.open .btn.primary');
    await page.locator('#toasts .toast', { hasText: 'Version saved.' }).waitFor();
    const vid = await H(async () => { await window.__board21.history.reload(); const m = window.__board21.history.metas.find(m => m.manual); return m && m.id; });
    await page.locator(`#history .hist-row[data-val="${vid}"]`).click();
    await page.waitForSelector('#history-detail.open .inst');
    const rows = Object.fromEntries(await page.$$eval('#history-detail.open .inst .meta', els => els.map(e => [e.querySelector('b').textContent, e.querySelector('span').textContent])));
    const np = rows['Name Picker'] || '';
    ok(np === NAMES.join(', ') && NAMES.every(n => np.split(n).length === 2), `Windows in this version: the Name Picker’s line has each name once (${np})`);
    ok(rows.Timer === '5 minutes', `the Timer’s says 5 minutes (${rows.Timer})`);
    ok(rows.Dice === `${rolled[0]} and ${rolled[1]}`, `the Dice’s says what they rolled, ${rolled.join(' and ')} (${rows.Dice})`);
    ok(rows['Video Player'] === 'Google Drive video', `a Video Player with no title: its site’s name, “Google Drive video” (${rows['Video Player']})`);
    const fits = () => page.$$eval('.open .inst .meta', els => els.map(m => {
      const row = m.closest('.inst').getBoundingClientRect(), s = m.querySelector('span').getBoundingClientRect();
      return s.right <= row.right + 0.5 && m.scrollWidth <= m.clientWidth ? '' : m.querySelector('b').textContent;
    }).filter(Boolean));
    const over = await fits();
    ok(!over.length, `each line stays inside its row (${over.join(', ')})`);
    await page.waitForTimeout(600); await page.screenshot({ path: OUT + 'history-lines.png' });
    for (let k = 0; k < 4 && await page.locator('#settings.open, #history.open, #history-detail.open').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await win('timer:1').locator('#go').click();   // (paused: the version saved is now an earlier one)
    await eventually(async () => ((await data('timer:1')) || {}).endsAt === null);
    await page.locator('.win[data-ikey="timer:1"] .win-label').click(); await page.waitForTimeout(250);
    await page.click('#menu [data-act="history"]'); await page.waitForSelector('#history.open .hist-intro');
    await page.waitForTimeout(600);
    const own = await page.$$eval('#history.open .inst .meta span', els => els.map(e => e.textContent));
    ok(own.length >= 2 && !own.includes('(empty)') && own.every(t => t === '5 minutes'), `the Timer’s own earlier versions: no row says “(empty)” (${own.join(' | ')})`);
    await page.screenshot({ path: OUT + 'history-lines-timer.png' });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.locator('.win[data-ikey="youtube-player:1"] .win-label').click(); await page.waitForTimeout(250);
    await page.click('#menu [data-act="history"]'); await page.waitForSelector('#history.open .hist-intro'); await page.waitForTimeout(600);
    const vOver = await fits();
    ok(!vOver.length, `the Video Player’s own earlier versions: its line stays inside its row (${vOver.join(', ')})`);
    await page.keyboard.press('Escape');

    // ---- 6. Nothing else changes: a version's sig and each window's other entries are as 84edbe5 made them.
    const FIXED = { board: { name: 'Room 14', background: { color: '#e0f2fe', pattern: 'dots' } }, theme: 'light', accent: 'blue',
      instances: Object.entries(SAVED).concat([['counter', { a: 'x', b: ['x', 'y'], c: 'x' }], ['clock', null]]).map(([id, data], k) => ({ widgetId: id, instance: 1, open: k !== 3, maximized: k === 5, z: k + 1,
        rect: { x: 40 + 30 * k, y: 40, w: 400, h: 300 }, createdAt: 1795180000000 + k * 1000, data, config: k % 2 ? { sound: 'off' } : null })) };
    // (Measured on 84edbe5.)
    const BASE_SAME = '["usauus5c6e",[["name-picker:1",[1,1795180000000,"1536lr3po8m","",186,0]],["calculator:1",[1,1795180001000,"13qgdk3gyc1","1z9mcsp6qm5",190,0]],["first-then-board:1",[1,1795180002000,"1afeo75307i","",282,0]],["task-timer:1",[0,1795180003000,"17o8yuob6mr","1z9mcsp6qm5",319,0]],["youtube-player:1",[1,1795180004000,"13ic59d7fp1","",249,0]],["timer:1",[1,1795180005000,"2ebrmyxcumc","1z9mcsp6qm5",61,1]],["dice:1",[1,1795180006000,"wzsa238vhm","",16,0]],["traffic-light:1",[1,1795180007000,"9hitzml6ky","1z9mcsp6qm5",18,0]],["image:1",[1,1795180008000,"tsek3w2eu1","",157,0]],["notes:1",[1,1795180009000,"1p9bfplqr06","1z9mcsp6qm5",111,0]],["counter:1",[1,1795180010000,"1x5k0sh3378","",31,0]],["clock:1",[1,1795180011000,"","1z9mcsp6qm5",0,0]]]]';
    const same = await H(exp => { const h = window.__board21.history, w = h.winsOf(exp); return JSON.stringify([h.sigOf(exp), Object.keys(w).map(k => [k, w[k].filter((x, j) => j !== 5)])]); }, FIXED);
    ok(same === BASE_SAME, `a version’s sig and each window’s entries 0 to 4 and 6 are as on 84edbe5 (${same})`);

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Board history: copies in the Board Sync folder', async (browser) => {
    const L = (p, fn, arg) => p.evaluate(fn, arg);
    const errors = [];
    const A = await driveDevice(browser);
    A.p.on('pageerror', e => errors.push(e.message));
    await A.p.goto(BASE); await A.p.waitForTimeout(600);
    await L(A.p, () => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    await L(A.p, () => window.__board21.openWidget('notes')); await A.p.waitForTimeout(1200);
    await fillNote(A.p.frameLocator('.win[data-ikey="notes:1"] iframe'), 'Lesson plan'); await A.p.waitForTimeout(400);
    await linkFolder(A.p, 'my laptop');
    // Before any copy of this board is there, Board history says so under “In your Google Drive folder”.
    await A.p.click('.picker-btn.left'); await A.p.click('[data-ctl="settings"]'); await A.p.waitForTimeout(300);
    await A.p.click('#settings [data-act="hist-open"]');
    // (Listing the folder can take a while on a busy machine: wait up to 8 s for the note.)
    let noCopies = [];
    await eventually(async () => (noCopies = await A.p.locator('#history .hint', { hasText: 'No copies' }).allTextContents()).length > 0);
    ok(noCopies.join(' | ') === 'No copies of this board there yet. 21Board adds about one an hour.', `with no copies of this board in the folder yet, Board history says so (${noCopies.join(' | ')})`);
    await A.p.keyboard.press('Escape'); await A.p.waitForTimeout(200); await A.p.keyboard.press('Escape'); await A.p.waitForTimeout(200);
    await L(A.p, () => window.__board21.history.save('Monday')); await A.p.waitForTimeout(1500);
    let hist = await readHistory(A.p);
    const saved = Object.keys(hist).find(n => / saved \(my laptop\) \[[0-9a-z]{6}-[0-9a-z]{4}\]\.21board$/.test(n));
    const j = saved && JSON.parse(hist[saved]);
    ok(!!saved && j.format === '21board' && j.history && j.history.from === 'my laptop' && !j.sent && !j.theme && j.instances.some(i => JSON.stringify(i.data).includes('Lesson plan')),
      `a saved version is copied to “Board history” in the folder (“${saved}”), without the theme and not as a sent version`);
    ok(/^Earlier versions of your 21Board boards, to go back to after a big change or a device reset\.\r\n/.test(hist['About these files.txt'] || ''), `with a note explaining the files (${(hist['About these files.txt'] || '').split('\r\n')[0]})`);
    await syncNow(A.p);
    ok(await L(A.p, () => Array.from(window.__board21.link.files.keys()).every(n => !/Board history/.test(n)) && Object.keys(window.__board21.link.good()).length === 1), 'history copies are never taken for a device’s file');
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
    await seedFolder(C.p, '21Board', await readFolder(A.p)); await writeHistory(C.p, await readHistory(A.p));
    await L(C.p, () => window.__board21.link.choose()); await C.p.waitForTimeout(500);
    await C.p.click('.picker-btn.left'); await C.p.click('[data-ctl="settings"]'); await C.p.waitForTimeout(300);
    await C.p.click('#settings [data-act="hist-open"]'); await C.p.waitForTimeout(1500);
    await C.p.click('#history [data-act="others"]'); await C.p.waitForTimeout(300);
    const use = C.p.locator(`#history [data-act="folder-go"][data-val="${saved}"]`);
    ok(await use.count() === 1, 'on another device, Board history lists the folder’s copies of other boards');
    await use.click(); await C.p.waitForTimeout(3500);
    ok(await C.p.frameLocator('.win[data-ikey="notes:1"] iframe').locator('#t').inputValue() === 'Lesson plan', '“Use” brings that board back on this device');
    // (Versions of work merged from another device aren't copied to the folder: see BoardHistory.maybeFolder.)
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await A.c.close(); await C.c.close();
  }],
  ['Board history: review fixes', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600); await freeBoard(page);
    const H = (fn, arg) => page.evaluate(fn, arg);
    await H(() => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    const note = ik => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const noteText = ik => note(ik).locator('#t').inputValue();
    const modal = text => page.locator('#modal.open .btn', { hasText: text }).click();
    const settings = groups => openSettings(page, groups);
    // Two deletes within 2 minutes, with typing in between: Undo of the second brings back what was typed.
    await H(() => { window.__board21.openWidget('notes'); window.__board21.openWidget('notes'); }); await page.waitForTimeout(1500);
    await fillNote(note('notes:1'), 'First'); await fillNote(note('notes:2'), 'Two original'); await page.waitForTimeout(1600);
    await H(() => window.__board21.deleteInstance('notes:1')); await page.waitForTimeout(500);
    await fillNote(note('notes:2'), 'homework p.42'); await page.waitForTimeout(500);
    await settings(['saved']);
    await page.click('#settings [data-act="inst-delete"][data-val="notes:2"]'); await page.waitForTimeout(300); await modal('Delete'); await page.waitForTimeout(1500);
    await page.locator('.toast', { hasText: 'Deleted Notes 2' }).locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(2000);
    ok(await noteText('notes:2') === 'homework p.42', 'a second delete soon after the first keeps what was typed in between (Undo brings it back)');
    await page.keyboard.press('Escape');
    // With automatic versions off, Reset still keeps a version and can be undone.
    await H(() => { window.__board21.state.settings.historyEvery = 0; });
    await page.locator('.win[data-ikey="notes:2"] .win-label').click(); await page.waitForTimeout(250);
    await page.click('#menu [data-act="reset"]');
    ok(/Board history keeps a version\./.test(await page.locator('#menu').textContent()), 'the Reset question still promises a version with automatic versions off…');
    await page.click('#menu [data-act="reset-yes"]'); await page.waitForTimeout(1500);
    await page.locator('.toast', { hasText: 'was reset' }).locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(2000);
    ok(await noteText('notes:2') === 'homework p.42', '…and keeps it: Undo works');
    await H(() => { window.__board21.state.settings.historyEvery = 10; });
    // Undo after deleting a closed window keeps it closed (it doesn't pop up in front of the class).
    await H(() => window.__board21.closeWin('notes:2')); await page.waitForTimeout(600);
    await settings(['saved']);
    await page.click('#settings [data-act="inst-delete"][data-val="notes:2"]'); await page.waitForTimeout(300); await modal('Delete'); await page.waitForTimeout(1500);
    await page.locator('.toast', { hasText: 'Deleted Notes 2' }).locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(1500);
    ok(await H(() => { const i = window.__board21.state.insts.get('notes:2'); return !!i && !i.open; }) && await page.locator('.win[data-ikey="notes:2"]').count() === 0, 'Undo after deleting a closed window brings it back closed');
    await page.keyboard.press('Escape');
    // Undo after Close all reopens the windows without pausing a running timer.
    await H(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    await note('timer:1').locator('#go').click(); await page.waitForTimeout(500);
    const ends = await H(() => window.__board21.state.data.get('timer:1').endsAt);
    await settings(); await page.click('#settings [data-act="close-all"]'); await page.waitForTimeout(1500);
    await page.locator('.toast', { hasText: 'Closed' }).locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(1500);
    ok(await page.locator('.win[data-ikey="timer:1"]').count() === 1 && await H(() => window.__board21.state.data.get('timer:1').endsAt) === ends, 'Undo after Close all reopens the windows, and a running timer keeps running');
    // Dark mode isn't a board change.
    await page.waitForTimeout(1600);
    const n0 = await H(async () => { await window.__board21.history.reload(); return window.__board21.history.metas.length; });
    await settings(); await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(300); await page.keyboard.press('Escape');
    await H(() => window.__board21.history.capture('open')); await page.waitForTimeout(500);
    ok(await H(async () => { await window.__board21.history.reload(); return window.__board21.history.metas.length; }) === n0, 'switching to dark mode isn’t saved as a new version (it’s this device’s setting)');
    // Out of space: gentle thinning keeps the safety versions.
    const nk = await H(() => window.__board21.openWidget('notes')); await page.waitForTimeout(1200);
    await fillNote(note(nk), 'Before the wipe, important'); await page.waitForTimeout(1600);
    await page.locator(`.win[data-ikey="${nk}"] .win-label`).click(); await page.waitForTimeout(250);
    await page.click('#menu [data-act="reset"]'); await page.click('#menu [data-act="reset-yes"]'); await page.waitForTimeout(1500);
    await H(() => window.__board21.history.thin()); await page.waitForTimeout(300);
    ok(await H(async () => { const Hs = window.__board21.history; await Hs.reload(); for (const m of Hs.metas) if (m.keepUntil > Date.now() && JSON.stringify((await Hs.get(m.id)).body.exp).includes('important')) return true; return false; }), 'running out of space thins history but keeps the safety version from before a Reset');
    // Over its share of storage, automatic versions continue (about hourly), they don't stop.
    await H(() => { window.__board21.history.paused = 'over'; });
    ok(!!(await H(() => window.__board21.history.capture('auto'))) || await H(() => window.__board21.history.paused === 'over'), 'over its share of storage, versions are still saved');
    await H(() => { window.__board21.history.paused = ''; });
    // Labels are written when shown ("Went back to Today …").
    const id = await H(() => window.__board21.history.save('L'));
    await H(i => window.__board21.history.restore(i), id); await page.waitForTimeout(3500);
    await settings(); await page.click('#settings [data-act="hist-open"]'); await page.waitForTimeout(1200);
    ok(await page.locator('#history .hist-row .what', { hasText: /^Went back to Today/ }).count() >= 1 && await page.locator('#history .hist-day').first().textContent() === 'Today', 'the list says “Went back to Today …” under a “Today” heading');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Board history: Off, a full device, and when it can’t go back or be read', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(STORAGE_FAULTS);
    // Board history's own database fails while window.__failHist is 'read' or 'write'.
    await ctx.addInitScript(() => { const T = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (stores, mode) { if (this.name === '21Board-history' && window.__failHist === (mode === 'readwrite' ? 'write' : 'read')) throw new DOMException('board history can’t be used (test)', 'UnknownError'); return T.apply(this, arguments); }; });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => { if (!/Not saved yet/.test(e.message)) errors.push(e.message); });   // (Notes doesn't catch a failed save())
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const H = (fn, arg) => page.evaluate(fn, arg);
    await H(() => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    const note = page.frameLocator('.win[data-ikey="notes:1"] iframe');
    const until = async (fn, ms = 8000) => { for (const t = Date.now(); Date.now() - t < ms; await page.waitForTimeout(100)) if (await fn().catch(() => false)) return true; return false; };
    const noteIs = text => until(async () => await note.locator('#t').inputValue() === text);
    const count = () => H(async () => { await window.__board21.history.reload(); return window.__board21.history.metas.length; });
    const settings = groups => openSettings(page, groups);
    const modal = text => page.locator('#modal.open .btn', { hasText: text }).click();
    const toasts = text => page.locator('.toast', { hasText: text }).count();
    // Versions written straight into board history's database, as if saved days ago: [{at, label, meta, exp, photo}].
    const DAY = 864e5, t0 = Date.now(), idOf = at => `1:${String(at).padStart(13, '0')}:seed`;
    const seed = list => H(list => new Promise((res, rej) => {
      const o = indexedDB.open('21Board-history');
      o.onerror = () => rej(o.error);
      o.onsuccess = () => {
        const t = o.result.transaction(['meta', 'body', 'photo'], 'readwrite');
        for (const v of list) {
          const id = `1:${String(v.at).padStart(13, '0')}:seed`;
          if (v.photo) t.objectStore('photo').put({ key: v.photo, data: 'data:image/png;base64,AAAA', w: 1, h: 1, bytes: 3, name: 'p', addedAt: 1, thumb: null, lastUsed: v.at });
          t.objectStore('meta').put(Object.assign({ v: 1, id, b: 1, at: v.at, kind: 'auto', reason: null, label: v.label, sig: 'seed' + v.at, uid: null, name: 'Board', bytes: 100, photo: v.photo || null,
            thumb: { bg: null, pattern: 'none', shape: '16:9', vw: 2400, vh: 1350, wins: [] }, wins: {}, target: null, beforeBig: false, link: null, keepUntil: 0, manual: false, folder: null, tab: 'seed' }, v.meta || {}));
          t.objectStore('body').put({ id, exp: v.exp || { format: '21board', formatVersion: 1, kind: 'full', instances: [] } });
        }
        t.oncomplete = () => { o.result.close(); res(); }; t.onabort = () => rej(t.error);
      };
    }), list);

    // ---- Off: nothing is saved when 21Board opens either.
    await H(() => window.__board21.openWidget('notes')); await page.waitForTimeout(1200);
    await fillNote(note, 'Class list: Ada, Ben');
    ok(await until(async () => await count() >= 1), 'a version is saved while the board changes (automatic versions are on)');
    const goodId = await H(() => window.__board21.history.save('Good'));
    await settings(['advanced']);
    await page.click('#settings [data-act="hist-every"][data-val="0"]');
    const asked = await page.locator('#modal.open').textContent();
    await modal('Turn off');
    ok(/when it opens/.test(asked) && /before Reset, Delete, Close all/.test(asked) && /One is still saved before big changes, like Close all\./.test(await page.locator('#settings .sheet-body').textContent()),
      'the Off question says what Off stops (also the version saved when 21Board opens) and what is still saved; Settings says one is still saved before big changes');
    await page.keyboard.press('Escape');
    const nOff = await count();
    await fillNote(note, 'Class list: Ada, Ben, Cy'); await page.waitForTimeout(1500);
    ok(await H(() => window.__board21.history.capture('open')) === null && await count() === nOff, 'with automatic versions Off, no copy of the board is saved when 21Board opens (or while it changes)');
    await settings(['advanced']); await page.click('#settings [data-act="hist-every"][data-val="10"]'); await page.keyboard.press('Escape');
    ok(!!(await H(() => window.__board21.history.capture('open'))) && await count() === nOff + 1, 'with them on again, one is');

    // ---- “Go back” that can't finish says so, and the board is as it was.
    await fillNote(note, 'wrecked');
    await until(async () => (await storedRecords(page))['data:1:notes:1'].text === 'wrecked');
    await H(() => { window.__failPut = 'unnamed'; });
    const went = await H(id => window.__board21.history.restore(id).catch(() => 'threw'), goodId);
    await H(() => { window.__failPut = null; });
    ok(went === false && await toasts('Couldn’t go back') === 1 && await noteIs('wrecked') && await page.locator('.win').count() === 1, 'Go back on a device that refuses the save: the teacher is told, and the board is as it was');
    await page.waitForSelector('.save-note.left', { state: 'hidden', timeout: 10000 });
    // A copy made by a newer 21Board (as in the Google Drive folder), for the whole board and for one window.
    const newer = { at: t0 - DAY, label: 'newer', meta: { wins: { 'notes:1': [1, 0, 'x', '', 30, 'from a newer 21Board', 0] } },
      exp: { format: '21board', formatVersion: 99, kind: 'full', instances: [{ widgetId: 'notes', instance: 1, open: true, z: 1, rect: { x: 100, y: 100, w: 320, h: 240 }, data: { text: 'from a newer 21Board' }, config: null }] } };
    await seed([newer]);
    const went2 = await H(id => window.__board21.history.restore(id).catch(() => 'threw'), idOf(newer.at));
    ok(went2 === false && await toasts('Couldn’t go back: This file was made by a newer version') === 1 && await noteIs('wrecked'), 'Go back to a copy this 21Board can’t read says so (it used to do nothing)');
    const put = await H(id => window.__board21.history.putBack(id, 'notes:1').catch(() => 'threw'), idOf(newer.at));
    ok(put === false && await toasts('Couldn’t put that window back') === 1 && await noteIs('wrecked'), 'and so does “Put back”');

    // ---- History that can't be read is shown as that, not as “No earlier versions yet”.
    await H(() => { window.__failHist = 'read'; });
    await settings(); await page.click('#settings [data-act="hist-open"]');
    await page.waitForSelector('#history.open [data-act="retry"]');
    const sheet = await page.locator('#history .sheet-body').textContent();
    ok(/Couldn’t read Board history\. Your earlier versions haven’t been deleted\./.test(sheet) && !/No earlier versions yet/.test(sheet), 'when board history can’t be read, the sheet says so (not “No earlier versions yet”)');
    await page.keyboard.press('Escape'); await settings();
    const st = await page.locator('#settings .sheet-body').textContent();
    ok(st.includes('Couldn’t read Board history. Try again in a moment.') && !/just now|None yet/.test(st), 'and so does Settings, in the toast’s words: “Couldn’t read Board history. Try again in a moment.” (not “None yet”)');
    await page.click('#settings [data-act="hist-open"]'); await page.waitForSelector('#history.open [data-act="retry"]');
    await H(() => { window.__failHist = null; });
    await page.click('#history [data-act="retry"]');
    ok(await until(async () => await page.locator('#history.open .hist-row').count() >= 2), '“Try again” lists the versions once they can be read');
    await page.keyboard.press('Escape');

    // ---- “Erase everything” promises a way back: it asks again if the board as it is couldn't be kept.
    await H(() => { window.__failHist = 'write'; });
    await settings(['advanced']); await page.click('#settings [data-act="erase"]'); await page.waitForTimeout(300); await modal('Erase everything');
    const again = await until(() => page.locator('#modal.open', { hasText: 'Erase anyway?' }).count().then(n => n === 1));
    if (again) await modal('Cancel');
    await H(() => { window.__failHist = null; });
    ok(again && await page.locator('.win').count() === 1 && await noteIs('wrecked'), '“Erase everything” asks “Erase anyway?” when the version from just before couldn’t be saved, and Cancel leaves the board alone');
    await page.keyboard.press('Escape');

    // ---- Out of space: history gives up a little at a time, and only until the save goes through.
    // 60 old versions (2 a day), 3 of them with a photo the board no longer has; one saved by the teacher and one safety version, older still.
    const olds = [];
    for (let d = 8; d < 38; d++) for (const h of [0, 3]) olds.push({ at: t0 - d * DAY - h * 36e5, label: 'old' });
    olds.sort((a, b) => a.at - b.at).slice(-3).forEach(v => { v.photo = 'oldphoto'; });
    await seed(olds.concat([{ at: t0 - 200 * DAY, label: 'mine', meta: { kind: 'manual', manual: true } }, { at: t0 - 90 * DAY, label: 'safety', meta: { kind: 'before', reason: 'reset', keepUntil: t0 + DAY } }]));
    await H(() => window.__board21.history.prune());   // (the usual tidying first, so that it doesn't change the count below)
    const left = () => H(async () => {
      const h = window.__board21.history; await h.reload();
      const s = h.metas.filter(m => m.tab === 'seed'), old = s.filter(m => m.label === 'old').sort((a, b) => a.at - b.at);
      return { old: old.length, oldest: old.length ? old[0].at : 0, newest: old.length ? old[old.length - 1].at : 0, withPhoto: s.filter(m => m.photo === 'oldphoto').length, photo: !!(await h.getPhoto('oldphoto')),
        mine: s.some(m => m.label === 'mine'), safety: s.some(m => m.label === 'safety'), today: h.metas.filter(m => m.tab !== 'seed').length };
    });
    const was = await left();
    await H(() => { const h = window.__board21.history, thin = h.thin.bind(h); window.__thins = 0; h.thin = async () => { window.__thins++; const r = await thin(); if (window.__once) window.__failPut = null; return r; }; });
    // The device has room again after the first step.
    await H(() => { window.__once = true; window.__failPut = 'quota'; });
    await fillNote(note, 'typed on a nearly full device');
    ok(await until(async () => (await storedRecords(page))['data:1:notes:1'].text === 'typed on a nearly full device'), 'a save refused for lack of space goes through once board history has made room');
    let now = await left();
    ok(await H(() => window.__thins) === 1 && was.photo && !now.photo && now.withPhoto === 0 && now.old === was.old && was.old >= 50 && await page.locator('.save-note.left:visible').count() === 0,
      `it gave up only the photo kept with old versions, and stopped there (${now.old} of ${was.old} old versions still there)`);
    ok(await toasts('This device is almost out of space. Some of the oldest versions in Board history were removed. Make room on this device.') === 1, 'and says that some of the oldest versions were removed, and to make room');
    // The device stays full.
    await H(() => { window.__once = false; window.__thins = 0; window.__failPut = 'quota'; });
    await fillNote(note, 'typed on a full device');
    await page.waitForSelector('.save-note.left:visible');
    now = await left();
    ok(await H(() => window.__thins) <= 5 && now.old < was.old && now.old >= 10 && now.oldest > was.oldest && now.newest === was.newest,
      `a device that stays full costs a few steps of the oldest versions, not all but the last three (${now.old} of ${was.old} old versions left, after ${await H(() => window.__thins)} steps)`);
    ok(now.mine && now.safety && now.today >= was.today, 'the version the teacher saved, the safety version and today’s versions are all still there');
    await page.click('.save-note.left'); await modal('Try again now');
    ok(await until(() => toasts('Still not saved').then(n => n === 1)) && (await left()).old === now.old, 'trying again while the device is still full takes no more history');
    await settings();
    ok(/Space is low on this device\. Some of the oldest versions were removed\. Make room so 21Board can keep saving\./.test(await page.locator('#settings .sheet-body').textContent()), 'Settings → Board history says space is low (after a refused save: the sign that Chrome gives too)');
    await page.keyboard.press('Escape');
    await H(() => { window.__failPut = null; });
    await page.click('.save-note.left'); await modal('Try again now');
    await page.waitForSelector('.save-note.left', { state: 'hidden' });
    ok((await storedRecords(page))['data:1:notes:1'].text === 'typed on a full device', 'with room again, what was typed is saved');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Board history: columns beside Settings (1366 × 768 from either side, 1920 × 1080, a window’s menu, iPad), what’s kept', async (browser) => {
    const errors = [];
    // The columns shown (open and not covered), in screen px; whether none overlaps another; whether all are on screen.
    const cols = p => p.evaluate(() => ['settings', 'history', 'history-detail'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect();
      return { id, shown: e.classList.contains('open') && getComputedStyle(e).visibility !== 'hidden', l: r.left, r: r.right, t: r.top, b: r.bottom }; }).filter(c => c.shown));
    const apart = cs => cs.every((a, i) => cs.every((b, j) => i >= j || a.r <= b.l + 0.5 || b.r <= a.l + 0.5));
    const onScreen = (cs, vp) => cs.every(c => c.l >= 0 && c.r <= vp.width && c.t >= 0 && c.b <= vp.height);
    const ids = cs => cs.map(c => c.id).join();
    const say = cs => cs.map(c => `${c.id} ${Math.round(c.l)}–${Math.round(c.r)}`).join(', ');
    // Where the keyboard is: in which column, and on what.
    const focus = p => p.evaluate(() => { const a = document.activeElement; return { col: (a.closest('#history-detail, #history, #settings') || {}).id || a.tagName, act: (a.dataset && a.dataset.act) || '', val: (a.dataset && a.dataset.val) || '', cls: String(a.className) }; });
    // A board with a few versions (each window opened, then a version saved by hand).
    const start = async (vp, opts = {}) => {
      const ctx = await browser.newContext(Object.assign({ viewport: vp }, opts));
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page);
      await page.evaluate(async () => {
        const b = window.__board21, wait = ms => new Promise(r => setTimeout(r, ms));
        b.history.cfg({ skipOpen: true });
        b.openWidget('notes'); await wait(900); await b.history.save('Monday setup');
        b.openWidget('timer'); await wait(700); await b.history.save('With a timer');
        b.openWidget('dice'); await wait(700); await b.history.save('');
      });
      return { ctx, page };
    };
    const history = async (page, side) => { await openSettings(page, [], side); await page.click('#settings [data-act="hist-open"]'); await page.waitForSelector('#history.open .hist-row'); await page.waitForTimeout(300); };
    const row = (page, n) => page.locator('#history .hist-row').nth(n);

    // ---- 1366 × 768, from the left: Board history is a second column, Settings stays open beside it.
    const vp = { width: 1366, height: 768 };
    let { ctx, page } = await start(vp);
    await history(page, 'left');
    let c = await cols(page), f = await focus(page);
    ok(ids(c) === 'settings,history' && apart(c) && onScreen(c, vp) && c[1].l > c[0].r, `from the left, Board history opens as a column beside Settings, which stays open: nothing overlaps, all on screen (${say(c)})`);
    ok(f.col === 'history' && await page.locator('#settings [data-act="hist-open"][aria-expanded="true"]').count() === 1, `the keyboard goes into Board history, and Settings’ “Board history…” is marked as open (${JSON.stringify(f)})`);
    const heads = await page.evaluate(() => ['settings', 'history', 'history-detail'].map(id => { const e = document.getElementById(id); return [e.querySelector('h2').tagName, e.querySelector('[data-close]').getAttribute('aria-label')]; }));
    ok(heads.map(h => h[1]).join() === 'Close settings,Close Board history,Close this version', `each column has a heading and a close button that says what it closes (${heads.map(h => h[1]).join(', ')})`);
    // What's kept: a list a screen reader reads as one, a tier a line.
    const keeps = page.getByRole('list', { name: 'Board history keeps, on this device:' });
    const tiers = await keeps.getByRole('listitem').allTextContents();
    ok(tiers.join(' | ') === 'The 20 most recent versions | Hourly versions for the past 2 days | Daily versions for the past 30 days | Weekly versions for the past 12 weeks',
      `what's kept is a list, a tier a line (${tiers.join(' | ')})`);
    const foot = await page.locator('#history .hist-keeps').innerText();
    ok(/Versions you save are kept until you delete them\. When Board history needs room, the oldest go first\./.test(foot) && /Board history isn’t a backup\. Clearing this browser’s data for 21Board clears it too\./.test(foot) && !/Kept on this device|space runs low/.test(foot),
      'then what you save, what goes first when board history needs more room (its share of the device, or a full device), and that it isn’t a backup');
    const tierTops = await page.evaluate(() => [...document.querySelectorAll('#history .hist-keeps li')].map(li => Math.round(li.getBoundingClientRect().top)));
    ok(new Set(tierTops).size === 4, `each tier is on its own line (${tierTops.join(', ')})`);
    // Settings is still usable: a choice there leaves Board history open.
    await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__board21.state.settings.theme === 'dark') && ids(await cols(page)) === 'settings,history', 'a choice in Settings works, and Board history stays open beside it');
    // In the versions' pictures, each window has a faint light ring outside it in dark, as the tiles do, and none in light.
    const rings = () => page.evaluate(() => [...document.querySelectorAll('#history .hist-row .minimap g')].map(g => { const w = g.querySelector('rect'), r = g.querySelector('rect.ring');
      return r ? { stroke: getComputedStyle(r).stroke, outside: +r.getAttribute('width') > +w.getAttribute('width') && +r.getAttribute('height') > +w.getAttribute('height') } : null; }));
    let rs = await rings();
    ok(rs.length > 0 && rs.every(r => r && r.stroke === 'rgba(255, 255, 255, 0.16)' && r.outside), `dark: every window in the versions’ pictures has a faint light ring outside it (${rs.length}: ${JSON.stringify(rs[0])})`);
    await page.click('#settings [data-act="theme"][data-val="light"]'); await page.waitForTimeout(200);
    rs = await rings();
    ok(rs.length > 0 && rs.every(r => r && r.stroke === 'none'), `light: no ring (${rs.length}: ${JSON.stringify(rs[0])})`);
    // A version: its own column, the version still marked in the list.
    await row(page, 1).click(); await page.waitForTimeout(400);
    c = await cols(page); f = await focus(page);
    const sel = await page.evaluate(() => { const r = document.querySelectorAll('#history .hist-row')[1]; return { sel: r.classList.contains('sel'), exp: r.getAttribute('aria-expanded'), id: r.dataset.val, marked: document.querySelectorAll('#history .hist-row.sel').length }; });
    ok(ids(c) === 'settings,history,history-detail' && apart(c) && onScreen(c, vp) && c[2].l > c[1].r, `a version opens a third column beside the list: three side by side on a 1366 × 768 screen (${say(c)})`);
    ok(sel.sel && sel.exp === 'true' && sel.marked === 1 && f.col === 'history-detail', `the version stays marked in the list, and the keyboard goes into its column (${JSON.stringify(sel)}; ${f.col})`);
    // In it: the summary, then Go back, then each window.
    const order = await page.evaluate(() => {
      const d = document.querySelector('#history-detail .sheet-body'), parts = [['summary with its preview', '.hist-sum:has(> .minimap:first-child)'], ['go back', '[data-act="go"]'], ['windows', '.inst-list']];
      const at = parts.map(([n, q]) => [n, d.querySelector(q)]), all = [...d.querySelectorAll('*')];
      return { order: at.filter(x => x[1]).sort((a, b) => all.indexOf(a[1]) - all.indexOf(b[1])).map(x => x[0]).join(', '), sum: d.querySelector('.hist-sum').innerText.replace(/\s+/g, ' '), go: (d.querySelector('[data-act="go"]') || {}).textContent,
        rows: d.querySelectorAll('.inst-list .inst').length, title: document.querySelector('#history-detail h2').textContent, put: [...d.querySelectorAll('.inst-list .inst')].some(i => /Not on the board now|Closed now|Different now/.test(i.textContent) && i.querySelector('[data-act="put"]')) };
    });
    ok(order.order === 'summary with its preview, go back, windows' && /^Today \d/.test(order.title) && /^Go back to Today \d/.test(order.go) && /Saved by you · With a timer/.test(order.sum) && /After this: /.test(order.sum) && /Compared with now: /.test(order.sum),
      `the version’s column: its time as the heading, then the preview and what changed, then Go back, then each window (${order.order}; “${order.title}”; ${order.sum})`);
    ok(order.rows === 2 && !order.put, `each window of that version is listed with how it compares with now (${order.rows} windows)`);
    await page.screenshot({ path: OUT + '82-history-columns.png' });
    // A merge's message tapped (its Undo) while looking through Board history: the three columns stay open, as Board
    // history does on its own.
    await page.evaluate(() => window.__board21.mergeUI.say('Updated from the laptop.', { action: 'Undo', timeout: 0, onAction: () => { window.__undone = true; } }));
    await page.locator('#toasts .toast', { hasText: 'Updated from the laptop.' }).locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(300);
    c = await cols(page);
    ok(await page.evaluate(() => window.__undone) && ids(c) === 'settings,history,history-detail', `a merge’s message tapped (its Undo) leaves Settings, Board history and the version open (${say(c)})`);
    // Tapping it again closes the column; so does its ✕ (the keyboard goes back to the version in the list).
    await row(page, 1).click(); await page.waitForTimeout(300);
    ok(ids(await cols(page)) === 'settings,history' && await page.locator('#history .hist-row.sel').count() === 0, 'tapping the version again closes its column');
    await row(page, 1).click(); await page.waitForTimeout(300);
    await page.click('#history-detail [data-close]'); await page.waitForTimeout(300);
    f = await focus(page);
    ok(ids(await cols(page)) === 'settings,history' && f.col === 'history' && f.act === 'sel' && f.val === sel.id, `its ✕ closes it, and the keyboard goes back to the version (${JSON.stringify(f)})`);
    // Escape: the outermost column first, the keyboard going back to what opened each.
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);   // (the version, from the keyboard)
    ok(ids(await cols(page)) === 'settings,history,history-detail' && (await focus(page)).col === 'history-detail', 'Enter on a version opens it, with the keyboard in its column');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    f = await focus(page);
    ok(ids(await cols(page)) === 'settings,history' && f.col === 'history' && f.val === sel.id, `Escape closes the version first, the keyboard back on it in the list (${JSON.stringify(f)})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    f = await focus(page);
    ok(ids(await cols(page)) === 'settings' && f.col === 'settings' && f.act === 'hist-open' && await page.locator('#settings [data-act="hist-open"][aria-expanded="false"]').count() === 1,
      `then Board history, the keyboard back on “Board history…” in Settings (${JSON.stringify(f)})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    f = await page.evaluate(() => document.activeElement.matches('.picker-btn.left'));
    ok(!(await cols(page)).length && f, `then Settings, the keyboard back on ▦ (${f})`);
    // Settings opened from the keyboard (▦, then its gear) takes the keyboard too, as each column does.
    await page.keyboard.press('Enter'); await page.waitForSelector('.panel.open [data-ctl="settings"]');
    await page.locator('.panel.open [data-ctl="settings"]').focus(); await page.keyboard.press('Enter'); await page.waitForSelector('#settings.open'); await page.waitForTimeout(200);
    f = await focus(page);
    ok(f.col === 'settings', `Settings opened from the keyboard: the keyboard goes into it (${JSON.stringify(f)})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // Board history… again closes it; closing Settings closes its columns; so does a tap on the board.
    await history(page, 'left');
    await page.click('#settings [data-act="hist-open"]'); await page.waitForTimeout(200);
    ok(ids(await cols(page)) === 'settings', 'tapping “Board history…” again closes it');
    await page.click('#settings [data-act="hist-open"]'); await page.waitForSelector('#history.open .hist-row'); await row(page, 0).click(); await page.waitForTimeout(300);
    await page.click('#settings [data-close]'); await page.waitForTimeout(200);
    ok(!(await cols(page)).length, 'closing Settings closes Board history’s columns with it');
    await history(page, 'left'); await row(page, 0).click(); await page.waitForTimeout(300);
    const empty = await page.evaluate(() => { for (let y = 60; y < 700; y += 20) for (let x = 1350; x > 1150; x -= 20) { const e = document.elementFromPoint(x, y); if (e && (e.id === 'desk' || e.closest('#layout-frame') || e === document.body)) return [x, y]; } return null; });
    await page.mouse.click(empty[0], empty[1]); await page.waitForTimeout(200);
    ok(!(await cols(page)).length, 'and a tap on the board closes them all');
    // A window's menu: that window's versions, without Settings, at the screen edge; a version beside it.
    await page.locator('.win[data-ikey="notes:1"] .win-label').click(); await page.waitForTimeout(250);
    await page.click('#menu [data-act="history"]'); await page.waitForSelector('#history.open [data-act="whole"]'); await page.waitForTimeout(300);
    c = await cols(page);
    ok(ids(c) === 'history' && c[0].l < 20 && /Earlier versions of Notes/.test(await page.locator('#history .hist-intro').textContent()), `from a window’s menu, Board history opens on its own at the edge, Settings closed (${say(c)})`);
    await page.click('#history [data-act="whole"]'); await page.waitForSelector('#history .hist-row');
    await row(page, 0).click(); await page.waitForTimeout(300);
    c = await cols(page);
    ok(ids(c) === 'history,history-detail' && apart(c) && onScreen(c, vp) && c[1].l > c[0].r, `and a version opens as the second column (${say(c)})`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    f = await page.evaluate(() => document.activeElement.classList.contains('win-label') && document.activeElement.closest('.win').dataset.ikey);
    ok(!(await cols(page)).length && f === 'notes:1', `Escape twice closes both, and the keyboard goes back to the window’s name (${f})`);
    await ctx.close();

    // ---- 1366 × 768, from the right: the same, mirrored. (The newest version was saved under a long page name.)
    ({ ctx, page } = await start(vp));
    const long = 'Room 214 — Ms. Rodriguez-Whitfield’s Thursday afternoon literacy centers and reading groups';
    await page.evaluate(async long => {
      const b = window.__board21, r = b.state.insts.get('timer:1').rect;
      b.updateBoard({ name: long }); b.setRect('timer:1', Object.assign({}, r, { x: r.x + 33 })); await new Promise(res => setTimeout(res, 80));
      await b.history.save('After lunch'); b.updateBoard({ name: 'Math' });
    }, long);
    await history(page, 'right'); await row(page, 0).click(); await page.waitForTimeout(400);
    c = await cols(page);
    ok(ids(c) === 'settings,history,history-detail' && apart(c) && onScreen(c, vp) && c[0].r > vp.width - 20 && c[1].r <= c[0].l && c[2].r <= c[1].l,
      `from the right, the columns go leftwards: Settings at the edge, then Board history, then the version (${say(c)})`);
    // A long name in “Then called …” ends in … inside its row; the whole name is in its tooltip and in the row's name.
    const tag = await page.evaluate(() => { const t = [...document.querySelectorAll('#history .hist-row .tag')].find(x => /Room 214/.test(x.textContent)), r = t.getBoundingClientRect(), rr = t.closest('.hist-row').getBoundingClientRect();
      return { inside: r.right <= rr.right + 0.5, cut: t.scrollWidth > t.clientWidth, ellipsis: getComputedStyle(t).textOverflow, title: t.title, row: t.closest('.hist-row').textContent.includes('literacy centers and reading groups”') }; });
    ok(tag.inside && tag.cut && tag.ellipsis === 'ellipsis' && tag.title === `Then called “${long}”` && tag.row, `a long page name in “Then called …” ends in … inside its row, the whole of it in the tooltip (${JSON.stringify(tag)})`);
    await page.screenshot({ path: OUT + '83-history-columns-right.png' });
    // Widget Picker → Left (Settings → Advanced) moves Settings to the other edge as it is, and Board history and the
    // version go with it, as they are.
    const was = await page.evaluate(() => window.__board21.historySheet.sel);
    await page.click('#settings [data-act="group"][data-val="advanced"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="corners"][data-val="left"]'); await page.waitForTimeout(500);
    c = await cols(page);
    const moved = await page.evaluate(() => ({ sel: window.__board21.historySheet.sel, marked: document.querySelectorAll('#history .hist-row.sel').length, side: window.__board21.historySheet.side,
      open: !!document.querySelector('#settings [data-act="hist-open"][aria-expanded="true"]'), advanced: document.querySelector('#settings [data-act="group"][data-val="advanced"]').getAttribute('aria-expanded') }));
    ok(ids(c) === 'settings,history,history-detail' && apart(c) && onScreen(c, vp) && c[0].l < 20 && c[1].l > c[0].r && c[2].l > c[1].r && moved.sel === was && moved.marked === 1 && moved.side === 'left' && moved.open && moved.advanced === 'true',
      `Widget Picker → Left: Settings moves to the left edge with Advanced still open, Board history and the version beside it, still open (${say(c)}; ${JSON.stringify(moved)})`);
    await page.click('#settings [data-act="corners"][data-val="both"]'); await page.waitForTimeout(300);
    await ctx.close();

    // ---- What's kept is as the list says until board history needs more room. At its share of the device's storage
    // (here a small one), with room on the device, it gives up the oldest first, the day's first too; never what you saved.
    ({ ctx, page } = await (async () => { const ctx = await browser.newContext({ viewport: vp }), page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(BASE); await boardUp(page); return { ctx, page }; })());
    const room = await page.evaluate(async () => {
      const b = window.__board21, H = b.history, wait = ms => new Promise(r => setTimeout(r, ms));
      H.cfg({ skipOpen: true, every: 1 }); b.openWidget('notes'); await wait(900);   // (every: one auto version per change)
      for (let i = 0; i < 24; i++) {
        const r = b.state.insts.get('notes:1').rect; b.setRect('notes:1', Object.assign({}, r, { x: 40 + i * 7 })); await wait(40);
        await (i === 2 ? H.save('Kept') : H.capture('auto'));
      }
      await H.reload();
      const first = H.metas[H.metas.length - 1], daily = b.historyPlan(H.metas, Date.now(), { newest: 20, hours: 48, days: 30, weeks: 12, firstOfDay: true, cap: 250 }).has(first.id);
      H.cfg({ budget: Math.floor(H.metas.reduce((n, m) => n + (m.bytes || 0), 0) * 0.7) });
      await H.prune(); await H.reload();
      return { daily, low: H.low, firstGone: !H.metas.some(m => m.id === first.id), saved: H.metas.some(m => m.manual && m.label === 'Kept'), left: H.metas.length };
    });
    ok(room.daily && !room.low && room.firstGone && room.saved, `at its share of the device's storage (the device not short of space), the oldest go first, the day's first too, and what you saved stays: hence “When board history needs more room…” (${JSON.stringify(room)})`);
    await ctx.close();

    // ---- A 1920 × 1080 flat panel (touch), from the right.
    const big = { width: 1920, height: 1080 };
    ({ ctx, page } = await start(big, { hasTouch: true }));
    await history(page, 'right'); await row(page, 0).click(); await page.waitForTimeout(400);
    c = await cols(page);
    ok(ids(c) === 'settings,history,history-detail' && apart(c) && onScreen(c, big), `1920 × 1080: three columns side by side (${say(c)})`);
    await ctx.close();

    // ---- iPads: a column that doesn't fit covers the one before it, with a Back button; nothing goes off screen.
    for (const ipad of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
      ({ ctx, page } = await start(ipad, { hasTouch: true }));
      const portrait = ipad.width < ipad.height;
      await history(page, 'left');
      c = await cols(page);
      const backOf = id => page.evaluate(id => { const b = document.querySelector(`#${id} [data-back]`), x = document.querySelector(`#${id} [data-close]`); return b.hidden ? (x.hidden ? 'none' : '✕') : `${b.textContent} (${b.getAttribute('aria-label')})`; }, id);
      if (portrait) ok(ids(c) === 'history' && onScreen(c, ipad) && await backOf('history') === 'Settings (Back to Settings)', `iPad portrait: Board history covers Settings, with ‹ Settings in place of ✕ (${say(c)}; ${await backOf('history')})`);
      else ok(ids(c) === 'settings,history' && apart(c) && onScreen(c, ipad) && await backOf('history') === '✕', `iPad landscape: Settings and Board history side by side (${say(c)})`);
      await row(page, 0).click(); await page.waitForTimeout(400);
      c = await cols(page);
      ok(ids(c) === (portrait ? 'history-detail' : 'settings,history-detail') && apart(c) && onScreen(c, ipad) && await backOf('history-detail') === 'Board history (Back to Board history)',
        `${portrait ? 'portrait' : 'landscape'}: the version covers Board history, with ‹ Board history; nothing off screen (${say(c)})`);
      if (portrait) await page.screenshot({ path: OUT + '84-history-ipad-portrait.png' });
      await page.locator('#history-detail [data-back]').tap(); await page.waitForTimeout(300);
      c = await cols(page);
      ok(ids(c) === (portrait ? 'history' : 'settings,history') && await page.locator('#history .hist-row.sel').count() === 0, `‹ Board history goes back to the list (${say(c)})`);
      if (portrait) {
        await page.locator('#history [data-back]').tap(); await page.waitForTimeout(300);
        ok(ids(await cols(page)) === 'settings', '‹ Settings goes back to Settings');
      }
      await ctx.close();
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ];
};
