// Lock, kiosk mode, opening maximized, and Stay awake.
'use strict';
module.exports = T => {
  const {
    chromium, http, fs, path, ROOT, OUT, TYPES, ok, freeBoard, openSettings, setTheme, lockBoard, unlockBoard,
    setCornerClock, fillNote, release, marked, boardUp, TESTS_DIR, BASE
  } = T;
  return [
  ['Kiosk mode (?kiosk=yes)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { window.__closed = 0; window.close = () => { window.__closed++; }; });   // (record Quit instead of closing the test page)
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '?kiosk=yes'); await page.waitForTimeout(800);
    await page.click('.picker-btn.left'); await page.waitForTimeout(250);
    const ctl = await page.evaluate(() => Array.from(document.querySelectorAll('.panel-controls .ctl')).filter(b => !b.hidden).map(b => b.dataset.ctl));
    ok(JSON.stringify(ctl) === JSON.stringify(['paste', 'export', 'import', 'lock', 'settings', 'quit']), `the Widget Picker keeps Paste, Export and Import, leaves out Full screen, and ends with Quit after Settings (${ctl.join(', ')})`);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('[data-ctl="quit"]')).color === 'rgb(220, 38, 38)'), 'Quit is a red X');
    await page.click('[data-ctl="settings"]'); await page.waitForTimeout(400);
    const set = await page.evaluate(() => { const r = document.getElementById('settings'); return { link: !!r.querySelector('[data-act^="link-"]'), backup: !!r.querySelector('[data-act="backup"]'), dev: !!r.querySelector('[data-act="devmode"]'), install: !!r.querySelector('[data-act="install"]'), kiosk: /Kiosk mode/.test(r.textContent), hist: !!r.querySelector('[data-act="hist-open"]') }; });
    ok(!set.link && !set.dev && !set.install && set.kiosk && set.hist, 'Settings leaves out Board Sync, Developer mode and Install, says it’s kiosk mode, and keeps Board history');
    ok(set.backup && (await page.locator('#st-backup').textContent()).includes('never'), 'Settings has Backups with “Back up now”, as everywhere else (a kiosk can export)');
    const protect = await page.evaluate(() => [document.getElementById('st-persist').textContent, document.getElementById('st-persist-hint').textContent]);
    ok(/Protected/.test(protect[0]) || (/school’s IT/.test(protect[1]) && /Back up to a USB drive now and then\./.test(protect[1]) && !/[Ii]nstall/.test(protect[1])), `Data protection says what applies to a kiosk: IT manages it, and backups are still worth making (${protect[1]})`);
    await page.keyboard.press('Escape');
    // Export uses only the Save dialog (a download would land unseen in the kiosk's Downloads).
    await page.click('.picker-btn.left'); await page.click('[data-ctl="export"]'); await page.waitForTimeout(300);
    await page.locator('#modal.open .btn').first().click(); await page.waitForTimeout(600);
    ok(await page.locator('.toast', { hasText: 'needs the Save dialog' }).count() === 1, 'without the Save dialog, kiosk Export says so (no download vanishing into the kiosk’s Downloads)');
    // The board itself works as usual, and is kept on the device.
    await page.evaluate(() => { window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }); window.__board21.openWidget('notes'); }); await page.waitForTimeout(1200);
    await fillNote(page.frameLocator('.win[data-ikey="notes:1"] iframe'), 'Kiosk note'); await page.waitForTimeout(1800);
    ok(await page.evaluate(async () => { await window.__board21.history.reload(); return window.__board21.history.metas.length > 0; }), 'board history works in kiosk mode');
    await page.reload(); await page.waitForTimeout(1500);
    ok(await page.frameLocator('.win[data-ikey="notes:1"] iframe').locator('#t').inputValue() === 'Kiosk note' && await page.evaluate(() => document.body.classList.contains('kiosk')), 'widgets save as usual, and kiosk mode stays on after a reload');
    await fillNote(page.frameLocator('.win[data-ikey="notes:1"] iframe'), 'See https://example.org'); await page.mouse.click(900, 80); await page.waitForTimeout(500);
    ok(await page.frameLocator('.win[data-ikey="notes:1"] iframe').locator('#view a').count() === 0, 'links in Notes stay plain text (a kiosk can’t open them)');
    // No backup reminder in a kiosk: no one is signed in to act on it. (The same board in a normal tab gets one.)
    await page.evaluate(() => {   // not a brand-new board any more: its window was made three days ago
      const B = window.__board21, i = B.state.insts.get('notes:1');
      B.state.insts.set('notes:1', Object.assign({}, i, { createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000 }));
      B.setRect('notes:1', Object.assign({}, i.rect, { x: i.rect.x + 1 }));   // (saves the window as it now is)
    });
    await page.waitForTimeout(400);
    const front = p => p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });   // the reminder is looked at 2 s after 21Board comes to the front
    await front(page); await page.waitForTimeout(2600);
    const nagged = await page.locator('.toast', { hasText: 'Save a backup?' }).count();
    const p0 = await ctx.newPage(); await p0.goto(BASE + ''); await boardUp(p0); await front(p0);
    const shown = await p0.waitForSelector('.toast:has-text("Save a backup?")', { timeout: 6000 }).then(() => true, () => false);
    const safe = await p0.evaluate(() => navigator.storage.persisted());
    ok(nagged === 0 && (shown || safe), `kiosk mode shows no backup reminder (a normal tab ${shown ? 'does' : 'has protected storage here, so it has none either'})`);
    await p0.close(); await page.bringToFront();
    // Erase offers a backup first, as everywhere else. Where the Save dialog works, that saves a full backup
    // (and erases nothing), and Settings counts it.
    await page.evaluate(() => { window.showSaveFilePicker = async opts => ({ createWritable: async () => ({ write: async t => { window.__saved = { name: opts.suggestedName, text: t }; }, close: async () => {} }) }); });
    await openSettings(page, ['advanced']);
    await page.click('#settings [data-act="erase"]'); await page.waitForTimeout(300);
    const first = page.locator('#modal.open .btn', { hasText: 'Export a backup first' });
    ok(await first.count() === 1 && / To keep what’s here, export a backup first\./.test(await page.locator('#modal.open p').textContent()), 'Erase everything offers “Export a backup first” in kiosk mode too');
    await first.click(); await page.waitForFunction(() => window.__saved, null, { timeout: 5000 }).catch(() => {});
    const kept = await page.evaluate(() => ({ saved: window.__saved, note: window.__board21.state.insts.has('notes:1'), at: window.__board21.state.settings.lastBackupAt }));
    ok(kept.saved && /\.21board$/.test(kept.saved.name) && JSON.parse(kept.saved.text).instances.some(i => i.widgetId === 'notes' && /example\.org/.test(JSON.stringify(i.data))) && kept.note, 'choosing it saves a full backup through the Save dialog, and erases nothing');
    ok(typeof kept.at === 'number' && (await page.locator('#st-backup').textContent()).includes('today'), 'and Settings says the last full backup was today');
    await page.keyboard.press('Escape');
    // Quit asks first, saves, then closes the app.
    await page.click('.picker-btn.left'); await page.click('[data-ctl="quit"]'); await page.waitForTimeout(300);
    ok(await page.locator('#modal.open', { hasText: 'Quit 21Board?' }).count() === 1, 'Quit asks first');
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__closed === 0), 'Cancel keeps 21Board open');
    await page.click('.picker-btn.left'); await page.click('[data-ctl="quit"]'); await page.waitForTimeout(300);
    await page.locator('#modal.open .btn', { hasText: 'Quit' }).click(); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__closed === 1), 'Quit closes the app (window.close)');
    ok(await page.locator('.toast', { hasText: 'can’t close itself' }).count() === 1, 'where the window can’t be closed, it says so instead of doing nothing');
    // Without ?kiosk=yes, nothing changes.
    const p2 = await ctx.newPage(); await p2.goto(BASE + '?kiosk=no'); await p2.waitForTimeout(600);
    await p2.click('.picker-btn.left'); await p2.waitForTimeout(250);
    ok(await p2.evaluate(() => document.querySelector('[data-ctl="quit"]').hidden && !document.querySelector('[data-ctl="export"]').hidden), 'without ?kiosk=yes the Widget Picker is as usual (no Quit)');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  // Opens maximized (board.js section 15, openMaximized). An installed app window is played in a normal tab: MAX_STUB answers
  // matchMedia('(display-mode: …)') and ('(display-state: …)') (CDP's Emulation.setEmulatedMedia ignores both), stands in for
  // the window and its screen (screenX/Y, outerWidth/Height, screen.avail*), and records moveTo, resizeTo, maximize and the
  // window-management permission query. cfg: mode (display-mode: 'browser'), state (display-state: 'normal'), win {x, y, w, h}
  // (the window, outer, screen px), screen {left, top, width, height} (its available area), perm ('prompt'), max (false: no
  // window.maximize, Chrome before 155; 'reject': it refuses), avail ('throw' or 'none': screen.avail* throw, or are missing).
  // window.__max: calls [[name, args, whether a tap's activation was on, when]], clicks [[activation on, when]] (each click,
  // after the page's own handlers; the times on one clock in every frame), win (change it as the teacher would), set({state,
  // win}) (from an init script added later: the window as it is after a reload), listeners() (pointerup, click, keydown and
  // blur listeners on window and document).
  ['Opens maximized: an installed app window fills the screen at launch and maximizes at the first tap (stubbed: a tab, the numbers, ▦, the board, a widget’s frame, the tap’s own click first, denied, maximized or covering already, a refusal, the teacher’s own size, reload, kiosk, the lab, the dev window, Chrome before 155, no screen size, the layout follows)', async (browser) => {
    const MAX_STUB = cfg => {
      const act = () => !!(navigator.userActivation && navigator.userActivation.isActive);
      const now = () => performance.timeOrigin + performance.now();
      const scr = Object.assign({ left: 0, top: 0, width: 1366, height: 728 }, cfg.screen), win = Object.assign({ x: 120, y: 60, w: 1050, h: 640 }, cfg.win);
      const log = window.__max = { calls: [], clicks: [], win };
      const note = (name, args) => log.calls.push([name, args, act(), now()]);
      let state = cfg.state || (cfg.max === false ? '' : 'normal');
      log.set = o => { if (o.state) state = o.state; Object.assign(win, o.win); };
      const def = (o, k, get) => { try { Object.defineProperty(o, k, { get, configurable: true }); } catch (e) { /* (not here) */ } };
      const avail = (k, v) => def(screen, k, () => { if (cfg.avail === 'throw') throw new Error('screen ' + k); return cfg.avail === 'none' ? undefined : v(); });
      avail('availLeft', () => scr.left); avail('availTop', () => scr.top); avail('availWidth', () => scr.width); avail('availHeight', () => scr.height);
      for (const k of ['screenX', 'screenLeft']) def(window, k, () => win.x);
      for (const k of ['screenY', 'screenTop']) def(window, k, () => win.y);
      def(window, 'outerWidth', () => win.w); def(window, 'outerHeight', () => win.h);
      window.moveTo = (x, y) => { note('moveTo', [x, y]); win.x = x; win.y = y; };
      window.resizeTo = (w, h) => { note('resizeTo', [w, h]); win.w = w; win.h = h; };
      if (cfg.max === false) delete window.maximize;
      else window.maximize = () => {
        note('maximize', []);
        if (cfg.max === 'reject') return Promise.reject(new DOMException('Permission denied.', 'NotAllowedError'));
        state = 'maximized'; Object.assign(win, { x: scr.left, y: scr.top, w: scr.width, h: scr.height });
        return Promise.resolve();
      };
      const P = navigator.permissions, query = P && P.query.bind(P);
      if (query) P.query = d => {
        if (!d || d.name !== 'window-management') return query(d);
        note('permissions.query', [d.name]);
        return Promise.resolve(Object.assign(new EventTarget(), { name: d.name, state: cfg.perm || 'prompt', onchange: null }));
      };
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q => {
        const m = /^\s*\(\s*display-(mode|state)\s*:\s*([a-z-]+)\s*\)\s*$/.exec(String(q));
        if (!m) return mm(q);
        return Object.assign(new EventTarget(), { media: q, matches: m[1] === 'mode' ? m[2] === (cfg.mode || 'browser') : m[2] === state, onchange: null, addListener() {}, removeListener() {} });
      };
      const live = [], TYPES = ['pointerup', 'click', 'keydown', 'blur'], add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
      const tracked = (t, type, o) => (t === window || t === document) && TYPES.includes(type) && !(o && o.once);
      const cap = o => typeof o === 'boolean' ? o : !!(o && o.capture);
      const at = (t, type, fn, o) => live.findIndex(l => l[0] === t && l[1] === type && l[2] === fn && l[3] === cap(o));
      EventTarget.prototype.addEventListener = function (type, fn, o) { if (fn && tracked(this, type, o) && at(this, type, fn, o) < 0) live.push([this, type, fn, cap(o)]); return add.apply(this, arguments); };
      EventTarget.prototype.removeEventListener = function (type, fn, o) { const i = at(this, type, fn, o); if (i >= 0) live.splice(i, 1); return remove.apply(this, arguments); };
      log.listeners = () => live.length;
      add.call(window, 'click', () => log.clicks.push([act(), now()]));   // (not one of listeners())
    };
    // Read and run things in the page without a user gesture: Playwright's page.evaluate (and so waitForFunction) passes
    // userGesture, which gives the page a tap's activation for a few seconds.
    const sessions = new WeakMap();
    const quiet = async (p, fn, arg) => {
      if (!sessions.has(p)) sessions.set(p, await p.context().newCDPSession(p));
      const r = await sessions.get(p).send('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(arg === undefined ? null : arg)})`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    };
    const up = async p => {
      for (let i = 0; i < 200; i++) { if (await quiet(p, () => !!(window.__board21 && window.__board21.store.loaded && !document.getElementById('startup'))).catch(() => false)) return; await p.waitForTimeout(100); }
      throw new Error('the board didn’t start');
    };
    const errors = [];
    const launch = async (cfg, { url = '', viewport = { width: 1280, height: 720 }, touch = false, board = true } = {}) => {
      const c = await browser.newContext({ viewport, hasTouch: touch });
      await c.addInitScript(MAX_STUB, cfg);
      const p = await c.newPage();
      p.on('pageerror', e => { if (!/boom from the widget/.test(e.message)) errors.push(`${url || 'board'}: ${e.message}`); });   // (the dev window's widget throws on purpose)
      await p.goto(BASE + url);
      if (board) { await up(p); await p.waitForTimeout(300); }
      return { c, p };
    };
    // The calls made, as text: "moveTo(48, 0)", "maximize at a tap"…
    const said = calls => calls.map(([n, a, tap]) => n + (a.length ? `(${a.join(', ')})` : '') + (tap ? ' at a tap' : ''));
    const calls = async p => said(await quiet(p, () => window.__max.calls));
    const maxes = async p => (await calls(p)).filter(c => /^maximize/.test(c));
    const center = async (p, sel) => quiet(p, sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    const click = async (p, sel) => { const c = await center(p, sel); await p.mouse.click(c.x, c.y); await p.waitForTimeout(400); };
    // Whether the tap's own click (in the board, or in frame fr) came first, with its activation, and maximize() after it
    // (a real maximize() uses the activation up).
    const clickFirst = async (p, fr) => {
      const m = (await quiet(p, () => window.__max.calls)).find(c => c[0] === 'maximize');
      const k = fr ? await fr.evaluate(() => window.__max.clicks) : await quiet(p, () => window.__max.clicks);
      return !!m && !!k.length && k[0][0] && k[0][1] < m[3];
    };
    const APP ={ mode: 'standalone', screen: { left: 48, top: 0, width: 1318, height: 768 }, win: { x: 200, y: 80, w: 1000, h: 632 } };
    const FILL = ['moveTo(48, 0)', 'resizeTo(1318, 768)'];

    // ---- A browser tab: nothing at all (no calls, no listeners), and the tap does what it does.
    let { c, p } = await launch({ mode: 'browser' });
    ok(JSON.stringify(await calls(p)) === '[]', `in a tab, nothing is moved, resized or asked at launch (${(await calls(p)).join(', ') || 'no calls'})`);
    const tab0 = await quiet(p, () => window.__max.listeners());
    await click(p, '.picker-btn.left');
    const tab1 = await quiet(p, () => window.__max.listeners());
    ok(await p.locator('#panel.open').count() === 1 && JSON.stringify(await calls(p)) === '[]', 'and a tap on ▦ opens the Widget Picker, with no maximize()');
    await c.close();

    // ---- An app window: filled at launch, without a tap, to the screen's available area (here a shelf on the left).
    ({ c, p } = await launch(APP, { viewport: { width: 1000, height: 600 } }));
    let k = await quiet(p, () => window.__max.calls);
    ok(JSON.stringify(said(k).slice(0, 2)) === JSON.stringify(FILL) && !k[0][2] && !k[1][2], `an app window is moved and sized to cover the screen at launch, before any tap (${said(k).join(', ')})`);
    ok(said(k).filter(s => s === 'permissions.query(window-management)').length === 1 && !(await maxes(p)).length, 'it asks what the window-management permission is (once), and calls no maximize() before a tap');
    const app0 = await quiet(p, () => window.__max.listeners());
    // The first tap, on ▦ (a mouse): maximize() once, and the Widget Picker opens as usual.
    await click(p, '.picker-btn.left');
    ok(JSON.stringify(await maxes(p)) === '["maximize at a tap"]' && await p.locator('#panel.open').count() === 1, `the first tap, on ▦, calls maximize() once with the tap's activation, and still opens the Widget Picker (${(await maxes(p)).join(', ')})`);
    ok(await clickFirst(p), 'the tap’s own click comes first, with its activation; maximize() after it');
    const app1 = await quiet(p, () => window.__max.listeners());
    ok(app0 > tab0 && app1 === tab1, `until the first tap it listens for one (${app0 - tab0} more listeners than a tab); after it, none is left (${app1} and ${tab1} in a tab)`);
    await click(p, '.picker-btn.left'); await p.keyboard.press('a'); await click(p, '.picker-btn.right'); await click(p, '.picker-btn.right');
    ok((await maxes(p)).length === 1, 'later taps and keys call nothing more (one call per launch)');
    // X5: the board follows. The window grows (as the fill does) to 1318 × 736 inside: the layout is what a board started at that size has.
    // (The corner clock On, for this tab and the one started beside it: Auto shows it only in full screen, and an app's window isn't.)
    await setCornerClock(p, 'on');
    await quiet(p, () => { window.__board21.openWidget('timer'); return true; }); await p.waitForTimeout(1000);
    await p.setViewportSize({ width: 1318, height: 736 }); await p.waitForTimeout(600);
    const layout = q => quiet(q, () => {
      const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(v => Math.round(v)); };
      const z = window.__board21.zoom;
      return { zoom: [z.s, z.ox, z.oy, z.vw, z.vh].map(v => Math.round(v * 1000) / 1000), left: r('.picker-btn.left'), right: r('.picker-btn.right'), clock: r('.corner-clock'), timer: r('.win[data-ikey="timer:1"]') };
    });
    const grown = await layout(p);
    const fresh = await c.newPage(); await fresh.setViewportSize({ width: 1318, height: 736 }); await fresh.goto(BASE); await up(fresh); await fresh.waitForTimeout(800);
    const started = await layout(fresh);
    ok(JSON.stringify(grown) === JSON.stringify(started) && !!grown.timer && !!grown.clock, `after the window grows, the 16:9 scale, the ▦ buttons, the corner clock and an open window are where a board started at that size has them (${JSON.stringify(grown)})`);
    await c.close();

    // ---- The first tap on the board itself, with a finger (activation comes at pointerup, not pointerdown).
    ({ c, p } = await launch(APP, { touch: true }));
    await p.touchscreen.tap(220, 160); await p.waitForTimeout(600);
    ok(JSON.stringify(await maxes(p)) === '["maximize at a tap"]', `a finger's tap on the empty board calls maximize() once (${(await maxes(p)).join(', ') || 'no call'})`);
    ok(await clickFirst(p), 'its click (which comes a moment after the finger is lifted) comes first, with its activation; maximize() after it');
    await c.close();

    // ---- The first tap inside a widget's frame: the board's page gets the activation too, and loses focus to the frame (at
    // the press: the frame's click comes when the button is let go).
    ({ c, p } = await launch(APP));
    await quiet(p, () => { window.__board21.openWidget('clock'); return true; }); await p.waitForTimeout(1500);
    const noneYet = !(await maxes(p)).length;
    const f = await center(p, '.win[data-ikey="clock:1"] iframe');
    await p.mouse.click(f.x, f.y, { delay: 150 }); await p.waitForTimeout(1500);   // (a press as long as a person's)
    ok(noneYet && JSON.stringify(await maxes(p)) === '["maximize at a tap"]' && await quiet(p, () => document.activeElement && document.activeElement.tagName === 'IFRAME'), `a first tap inside a widget's window (its frame) calls maximize() once (${(await maxes(p)).join(', ') || 'no call'})`);
    const clockFrame = await (await p.$('.win[data-ikey="clock:1"] iframe')).contentFrame();
    ok(await clickFirst(p, clockFrame), 'the frame’s own click comes first, with its activation; maximize() after it');
    await c.close();

    // ---- The first tap uses the activation up itself (here its click opens a window, as an app's button might): it keeps it,
    // and maximize() waits for the next tap.
    ({ c, p } = await launch(APP));
    await quiet(p, () => { addEventListener('click', () => { const w = window.open('about:blank', '_blank'); if (w) w.close(); }, { once: true }); return true; });
    await click(p, '.picker-btn.left');
    const used = await maxes(p);
    await click(p, '.picker-btn.left');
    ok(!used.length && JSON.stringify(await maxes(p)) === '["maximize at a tap"]', `a first tap whose own click uses the activation (it opens a window) keeps it, and maximize() comes at the next tap (${used.join(', ') || 'none'} at the first; ${(await maxes(p)).join(', ') || 'none'} by the second)`);
    await c.close();

    // ---- Permission denied: the fill still happens; no maximize().
    ({ c, p } = await launch(Object.assign({}, APP, { perm: 'denied' })));
    await click(p, '.picker-btn.left');
    ok(JSON.stringify((await calls(p)).filter(s => !/^permissions/.test(s))) === JSON.stringify(FILL), `the window-management permission denied: filled at launch, and the tap calls no maximize() (${(await calls(p)).join(', ')})`);
    await c.close();

    // ---- Already maximized (display-state), or full screen: nothing at launch, nothing at the tap.
    for (const [state, what] of [['maximized', 'already maximized'], ['fullscreen', 'full screen']]) {
      ({ c, p } = await launch(Object.assign({}, APP, { state })));
      await click(p, '.picker-btn.left');
      ok(!(await calls(p)).some(s => /^(moveTo|resizeTo|maximize)/.test(s)), `a window ${what} at launch is left as it is, at launch and at the first tap (${(await calls(p)).join(', ') || 'no calls'})`);
      // That launch is marked too: once the teacher makes the window smaller, a reload (Update, Ctrl+R) leaves it so.
      const marked = await quiet(p, () => sessionStorage.getItem('21board-launched'));
      await c.addInitScript(() => { if (window.__max) window.__max.set({ state: 'normal', win: { x: 300, y: 200, w: 800, h: 500 } }); });
      await p.reload(); await up(p); await p.waitForTimeout(300);
      await click(p, '.picker-btn.left');
      ok(marked === '1' && JSON.stringify(await calls(p)) === '[]', `${what} at launch, then made smaller and reloaded: left as the teacher made it, at the reload and at a tap (${(await calls(p)).join(', ') || 'no calls'}; launch marked: ${marked})`);
      await c.close();
    }
    // display-mode fullscreen (an app that opens full screen) is no window to fill either.
    ({ c, p } = await launch(Object.assign({}, APP, { mode: 'fullscreen' })));
    await click(p, '.picker-btn.left');
    ok(JSON.stringify(await calls(p)) === '[]', 'display-mode fullscreen: nothing');
    await c.close();

    // ---- Covering the screen already (Chrome kept the size from last time, or a maximized window's frame past the edges, or
    // Linux Chrome's 1 px short): not moved or resized; the first tap still makes it maximized for real.
    for (const win of [{ x: 48, y: 0, w: 1318, h: 768 }, { x: 40, y: -8, w: 1334, h: 784 }, { x: 48, y: 0, w: 1317, h: 767 }]) {
      ({ c, p } = await launch(Object.assign({}, APP, { win })));
      const atLaunch = await calls(p);
      await click(p, '.picker-btn.left');
      ok(!atLaunch.some(s => /^(moveTo|resizeTo)/.test(s)) && JSON.stringify(await maxes(p)) === '["maximize at a tap"]', `a window already covering the screen (${win.x}, ${win.y}, ${win.w} × ${win.h}) isn't moved or resized; the first tap maximizes it (${(await calls(p)).join(', ')})`);
      await c.close();
    }

    // ---- maximize() refused (no permission, or the system can't): quiet, the window stays filled, nothing more is tried.
    ({ c, p } = await launch(Object.assign({}, APP, { max: 'reject' })));
    const before = errors.length;
    await click(p, '.picker-btn.left'); await click(p, '.picker-btn.left'); await p.waitForTimeout(300);
    const w = await quiet(p, () => window.__max.win);
    ok(JSON.stringify(await maxes(p)) === '["maximize at a tap"]' && errors.length === before && w.x === 48 && w.w === 1318, `a refused maximize() is quiet (no error), the window stays filled, and it isn't asked again (${(await maxes(p)).join(', ')})`);
    await c.close();

    // ---- The teacher makes the window smaller (or moves it) before the first tap: it stays as they left it.
    ({ c, p } = await launch(APP));
    await quiet(p, () => { Object.assign(window.__max.win, { x: 300, y: 200, w: 800, h: 500 }); return true; });
    await click(p, '.picker-btn.left');
    ok(!(await maxes(p)).length && JSON.stringify(await calls(p)) === JSON.stringify(FILL.concat('permissions.query(window-management)')), `a window the teacher made smaller after launch isn't maximized at the first tap (${(await calls(p)).join(', ')})`);
    await c.close();

    // ---- A reload of the same window isn't a launch: after the tap, and before any tap.
    ({ c, p } = await launch(APP));
    await click(p, '.picker-btn.left');
    await p.reload(); await up(p); await p.waitForTimeout(300);
    const r0 = await calls(p);
    await click(p, '.picker-btn.left');
    ok(JSON.stringify(r0) === '[]' && JSON.stringify(await calls(p)) === '[]', `a reload (Update, Ctrl+R) neither fills nor maximizes again (${(await calls(p)).join(', ') || 'no calls'})`);
    const again = await c.newPage(); again.on('pageerror', e => errors.push(e.message)); await again.goto(BASE); await up(again);
    ok(JSON.stringify((await calls(again)).slice(0, 2)) === JSON.stringify(FILL), 'a new window (a new launch) fills again');
    await again.close();
    await c.close();
    ({ c, p } = await launch(APP));
    await p.reload(); await up(p); await p.waitForTimeout(300);
    await click(p, '.picker-btn.left');
    ok(JSON.stringify(await calls(p)) === '[]', `reloaded before any tap: nothing after the reload (${(await calls(p)).join(', ') || 'no calls'})`);
    await c.close();

    // ---- Kiosk mode (always full screen), the lab and the widget dev window (they run inside other pages): nothing.
    ({ c, p } = await launch(APP, { url: '?kiosk=yes' }));
    await click(p, '.picker-btn.left');
    ok(JSON.stringify(await calls(p)) === '[]', `kiosk mode: nothing (${(await calls(p)).join(', ') || 'no calls'})`);
    await c.close();
    const everyFrame = async p => (await Promise.all(p.frames().map(fr => fr.evaluate(() => window.__max ? window.__max.calls.map(c => c[0]) : []).catch(() => [])))).flat();
    ({ c, p } = await launch(APP, { url: 'sdk/lab.html', board: false }));
    await p.waitForTimeout(400); await p.click('#sample'); await p.click('#run'); await p.waitForTimeout(3500);
    const lab = p.mainFrame().childFrames()[0];
    const labUp = !!lab && await lab.evaluate(() => !!window.__board21);
    const lb = lab && await (await lab.frameElement()).boundingBox();
    if (lb) { await p.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2); await p.waitForTimeout(400); }   // (a tap on the lab's board)
    ok(labUp && JSON.stringify(await everyFrame(p)) === '[]', `the lab (sdk/lab.html): nothing, in any frame (${(await everyFrame(p)).join(', ') || 'no calls'})`);
    await c.close();
    ({ c, p } = await launch(APP, { url: '__dev/widget.html', board: false }));
    await p.waitForTimeout(3000);
    const devUp = await p.evaluate(() => !!window.__board21DevWindow).catch(() => false);
    await p.mouse.click(200, 200); await p.waitForTimeout(400);
    ok(devUp && JSON.stringify(await everyFrame(p)) === '[]', `the widget dev window: nothing, in any frame (${(await everyFrame(p)).join(', ') || 'no calls'})`);
    await c.close();

    // ---- Chrome before 155 (no window.maximize): only the fill; nothing asked, no listener left.
    ({ c, p } = await launch(Object.assign({}, APP, { max: false })));
    const old0 = await quiet(p, () => window.__max.listeners());
    await click(p, '.picker-btn.left');
    ok(JSON.stringify(await calls(p)) === JSON.stringify(FILL) && old0 === tab0, `with no maximize() (Chrome before 155), only the fill: no permission asked, no listener (${(await calls(p)).join(', ')})`);
    await c.close();

    // ---- A screen that doesn't say its size (screen.avail* throw, or are missing): the window isn't moved or sized, and the
    // board starts as usual.
    for (const [avail, what] of [['throw', 'can’t be read'], ['none', 'is missing']]) {
      ({ c, p } = await launch(Object.assign({}, APP, { avail }), { board: false }));
      const started = await up(p).then(() => true, () => false);
      ok(started && !(await calls(p)).some(s => /^(moveTo|resizeTo)/.test(s)), `where the screen's size ${what}, the window isn't moved or sized, and the board starts (${(await calls(p)).join(', ') || 'no calls'})`);
      await c.close();
    }

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  // The same in a real app window: Chrome for Testing, headful on an Xvfb screen of its own (1366 × 768, no window manager),
  // with 21Board installed and launched through CDP's PWA domain. Then maximize() with Chrome's DevTrial flag
  // (--enable-features=DesktopPWAsAdditionalWindowingControls): under Xvfb, where no window manager can maximize a window,
  // and in Chrome's own headless mode, whose windows can be maximized. Skipped, with a note, where Xvfb, the PWA domain or
  // the full Chromium (for its headless mode) isn't there.
  ['Opens maximized: a real app window (Chrome under Xvfb, installed and launched with CDP’s PWA domain; maximize() with the DevTrial flag, under Xvfb and in Chrome’s headless mode)', async () => {
    const os = require('os'), { spawn } = require('child_process');
    const skip = why => console.log('  - skipped: ' + why);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const errors = [];
    const corner = v => !!v.right && v.right.right <= v.iw && v.right.right >= v.iw - 30 && v.right.bottom <= v.ih && v.right.bottom >= v.ih - 30;   // (▦ in the window's corner)
    const covers = (b, s) => b.left <= s.al + 4 && b.top <= s.at + 4 && b.left + b.width >= s.al + s.aw - 4 && b.top + b.height >= s.at + s.ah - 4;
    // What the page sees, read without a user gesture (page.evaluate passes one).
    const look = async (ctx, p) => {
      const s = await ctx.newCDPSession(p);
      const r = await s.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const mm = q => matchMedia(q).matches, z = window.__board21 && window.__board21.zoom, r = s => { const e = document.querySelector(s); return e && !e.hidden ? e.getBoundingClientRect().toJSON() : null; };
        return { mode: ['browser', 'standalone', 'fullscreen'].find(m => mm('(display-mode: ' + m + ')')) || '', state: ['normal', 'maximized', 'fullscreen'].find(m => mm('(display-state: ' + m + ')')) || '',
          tapped: navigator.userActivation.hasBeenActive, iw: innerWidth, ih: innerHeight, s: { al: screen.availLeft, at: screen.availTop, aw: screen.availWidth, ah: screen.availHeight },
          zoom: z && { vw: z.vw, vh: z.vh }, right: r('.picker-btn.right'), clock: r('.corner-clock'), spy: window.__maxSpy || null, clicks: window.__clicks || null, launched: sessionStorage.getItem('21board-launched'),
          up: !!(window.__board21 && window.__board21.store.loaded && !document.getElementById('startup')) };
      })()` });
      await s.detach();
      return r.result.value;
    };
    // (boardUp's waitForFunction would give the page a gesture.)
    const up = async (ctx, p) => { for (let i = 0; i < 100; i++) { if ((await look(ctx, p).catch(() => ({}))).up) return; await sleep(100); } };
    // A page or frame read without a user gesture.
    const run = async (ctx, p, expression) => { const s = await ctx.newCDPSession(p); const r = await s.send('Runtime.evaluate', { expression, returnByValue: true }); await s.detach(); return r.result.value; };
    // Records each click (in every frame, after the page's own handlers) and whether it had a tap's activation, and each
    // maximize() and how it ended, and calls the real one.
    const SPY = () => {
      const clicks = window.__clicks = [];
      addEventListener('click', () => clicks.push(!!(navigator.userActivation && navigator.userActivation.isActive)));
      const m = window.maximize;
      if (typeof m !== 'function') return;
      const log = window.__maxSpy = [];
      window.maximize = function () {
        const r = { tap: !!(navigator.userActivation && navigator.userActivation.isActive) };
        log.push(r);
        const p = m.apply(this, arguments);
        p.then(() => { r.outcome = 'resolved'; }, e => { r.outcome = `${e.name}: ${e.message}`; });
        return p;
      };
    };
    // A browser with a profile of its own (an off-the-record one can't install web apps), started by Playwright: over its pipe it
    // is a trusted DevTools client, the only kind given the PWA domain. Installed through CDP, the app opens in a tab until it is
    // set to open in a window (as "Open in window" does). Returns null (and says why) when that can't be done here.
    const start = async ({ display, flag, headless }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b21-app-'));
      const args = (flag ? ['--enable-features=DesktopPWAsAdditionalWindowingControls'] : []).concat(headless ? ['--screen-info={1366x768}'] : []);
      let ctx;
      try {
        ctx = await chromium.launchPersistentContext(dir, { headless: !!headless, channel: headless ? 'chromium' : undefined, viewport: null, args, env: Object.assign({}, process.env, display ? { DISPLAY: display } : {}) });
      } catch (e) { skip(`Chrome${headless ? '’s headless mode (the full Chromium, npx playwright install chromium)' : ' (headful)'} didn’t start here: ${String(e.message).split('\n')[0]}`); return null; }
      const close = async () => { await ctx.close().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); };
      await ctx.addInitScript(SPY);
      ctx.on('page', p => p.on('pageerror', e => errors.push(e.message)));
      const bs = await ctx.browser().newBrowserCDPSession();
      const tab = ctx.pages()[0] || await ctx.newPage();
      tab.on('pageerror', e => errors.push(e.message));
      await tab.goto(BASE); await boardUp(tab);
      // The corner clock On (chosen in this tab: the app's window shares its settings), to see that it follows the window.
      // (Auto, the default, shows it only in full screen: "Clock in the corner: real Chrome windows" checks that.)
      await setCornerClock(tab, 'on');
      const tabId = (await (await ctx.newCDPSession(tab)).send('Target.getTargetInfo')).targetInfo.targetId;
      try {
        await bs.send('PWA.install', { manifestId: BASE, installUrlOrBundleUrl: BASE });
        await bs.send('PWA.changeAppUserSettings', { manifestId: BASE, displayMode: 'standalone' });
      } catch (e) { skip(`CDP’s PWA domain isn’t available here (${e.message})`); await close(); return null; }
      if (flag) await bs.send('Browser.setPermission', { permission: { name: 'window-management' }, setting: 'granted', origin: BASE.replace(/\/$/, '') });
      const B = { ctx, bs, tab, tabId, close };
      B.launch = async () => {
        const before = ctx.pages();
        await bs.send('PWA.launch', { manifestId: BASE });   // (answers with a tab target: the page is the one that wasn't there)
        for (let i = 0; i < 100 && !ctx.pages().some(p => !before.includes(p)); i++) await sleep(100);
        const app = ctx.pages().find(p => !before.includes(p));
        if (!app) return null;
        await app.waitForLoadState('load'); await up(ctx, app); await sleep(1500);
        app.id = (await (await ctx.newCDPSession(app)).send('Target.getTargetInfo')).targetInfo.targetId;
        return app;
      };
      B.bounds = async id => (await bs.send('Browser.getWindowForTarget', { targetId: id })).bounds;
      B.windowId = async id => (await bs.send('Browser.getWindowForTarget', { targetId: id })).windowId;
      return B;
    };
    const box = b => `${b.left}, ${b.top}, ${b.width} × ${b.height}${b.windowState && b.windowState !== 'normal' ? ' ' + b.windowState : ''}`;
    const tapBoard = async app => { await app.mouse.click(Math.round((await look(app.context(), app)).iw / 3), 200); await sleep(1500); };

    // ---- Headful, on a screen of its own.
    const onPath = name => (process.env.PATH || '').split(path.delimiter).some(d => d && fs.existsSync(path.join(d, name)));
    let X = null, display = null;
    if (!onPath('Xvfb')) skip('no Xvfb (the xvfb package, with xvfb-run) on this machine: no headful Chrome for a real app window. The stubbed suite above covers the behaviour.');
    else {
      X = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', '1366x768x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
      display = await new Promise(res => { let s = ''; X.stdio[3].on('data', d => { s += d; if (/\n/.test(s)) res(':' + s.trim()); }); X.on('exit', () => res(null)); setTimeout(() => res(null), 10000); });
      if (!display) skip('Xvfb didn’t start');
    }
    try {
      let B = display && await start({ display });
      if (B) {
        const tab0 = await B.bounds(B.tabId);
        const app = await B.launch();
        ok(!!app, 'PWA.launch opens 21Board in an app window of its own');
        if (app) {
          let v = await look(B.ctx, app), b = await B.bounds(app.id);
          ok(v.mode === 'standalone', `its display-mode is standalone (the manifest's fullscreen falls back to it on a computer): ${v.mode}`);
          ok(covers(b, v.s) && !v.tapped, `right after launch, with no tap, the window covers the screen: ${box(b)} on a ${v.s.aw} × ${v.s.ah} screen (Chrome's default here: ${box(tab0)})`);
          ok(v.zoom && v.zoom.vw === v.iw && v.zoom.vh === v.ih && corner(v) && v.clock && v.clock.right <= v.right.left && v.clock.bottom <= v.ih,
            `and the board follows: drawn for the whole window (${v.zoom && v.zoom.vw} × ${v.zoom && v.zoom.vh}), ▦ and the corner clock in the window's corner`);
          ok(JSON.stringify(await B.bounds(B.tabId)) === JSON.stringify(tab0) && (await look(B.ctx, B.tab)).mode === 'browser', `the browser tab beside it keeps its size (${box(await B.bounds(B.tabId))})`);
          // The teacher makes it smaller; a reload (an update) doesn't fill it again, nor does a tap. (No maximize() before Chrome 155.)
          await B.bs.send('Browser.setWindowBounds', { windowId: await B.windowId(app.id), bounds: { left: 100, top: 60, width: 900, height: 600 } }); await sleep(800);
          await app.reload(); await up(B.ctx, app); await sleep(1500);
          await tapBoard(app);
          b = await B.bounds(app.id); v = await look(B.ctx, app);
          ok(b.left === 100 && b.top === 60 && b.width === 900 && b.height === 600 && v.zoom && v.zoom.vw === v.iw, `a window the teacher made smaller stays so after a reload and a tap (${box(b)}), the board drawn for it`);
          ok(!v.spy || !v.spy.length, v.spy ? 'no maximize() at the tap after the reload' : 'this Chrome (no flag) has no window.maximize(): the fill is all there is');
          // Launched again while open: launch_handler focus-existing brings the window forward, nothing else.
          const n = B.ctx.pages().length;
          await B.bs.send('PWA.launch', { manifestId: BASE }); await sleep(2000);
          ok(B.ctx.pages().length === n && JSON.stringify(await B.bounds(app.id)) === JSON.stringify(b), 'launched again while open: the same window comes forward, as it was');
          // Closed and launched again: a new launch, filled again.
          await app.close(); await sleep(500);
          const again = await B.launch();
          const b2 = again && await B.bounds(again.id);
          ok(!!again && covers(b2, v.s), `closed and launched again, it covers the screen again (${b2 ? box(b2) : 'no window'})`);
        }
        await B.close();
      }

      // ---- With the DevTrial flag (window.maximize() before Chrome 155) and the permission granted, headful under Xvfb.
      B = display && await start({ display, flag: true });
      if (B) {
        const app = await B.launch();
        ok(!!app, 'with the flag too, PWA.launch opens the app window');
        if (app) {
          let v = await look(B.ctx, app);
          ok(covers(await B.bounds(app.id), v.s) && v.state === 'normal' && Array.isArray(v.spy) && !v.spy.length, `with the flag: filled at launch, display-state ${v.state}, no maximize() before a tap`);
          await tapBoard(app);
          // No window manager runs on this Xvfb screen, so nothing can maximize a window: Chrome waits for one 5 s, then refuses.
          for (let i = 0; i < 20 && (v = await look(B.ctx, app)).spy && v.spy.length && !v.spy[0].outcome; i++) await sleep(500);
          const b = await B.bounds(app.id), s = v.spy || [];
          ok(s.length === 1 && s[0].tap && (v.state === 'maximized' || (/Could not maximize/.test(s[0].outcome) && covers(b, v.s))) && !errors.length,
            `the first tap calls the real maximize() once (${s.length ? s.map(x => x.outcome || 'no answer yet').join(', ') : 'no call'}): ${v.state === 'maximized' ? 'maximized' : 'refused, so it stays filled'} (${box(b)}, display-state ${v.state}), with no error`);
          ok(v.clicks && v.clicks[0] === true, `that tap's own click had its activation (maximize() uses it up, so it comes after): ${JSON.stringify(v.clicks)}`);
        }
        await B.close();
      }
    } finally {
      if (X) X.kill();
    }

    // ---- Chrome's own headless mode with the flag: its windows can be maximized. The real thing, minus a real screen.
    const H = await start({ flag: true, headless: true });
    if (H) {
      const app = await H.launch();
      ok(!!app, 'Chrome’s headless mode opens the app window too');
      if (app) {
        let v = await look(H.ctx, app), b = await H.bounds(app.id);
        ok(v.mode === 'standalone' && covers(b, v.s) && v.state === 'normal', `filled at launch (${box(b)}), display-state ${v.state}`);
        await tapBoard(app);
        v = await look(H.ctx, app); b = await H.bounds(app.id);
        ok(v.spy && v.spy.length === 1 && v.spy[0].tap && v.spy[0].outcome === 'resolved' && v.state === 'maximized' && b.windowState === 'maximized',
          `the first tap maximizes it for real: maximize() ${v.spy && v.spy.map(x => x.outcome).join(', ')}, display-state ${v.state}, Chrome's window ${b.windowState}`);
        ok(v.clicks && v.clicks[0] === true, `that tap's own click had its activation (maximize() uses it up, so it comes after): ${JSON.stringify(v.clicks)}`);
        ok(v.zoom && v.zoom.vw === v.iw && v.zoom.vh === v.ih && corner(v), `and the board follows the maximized window (${v.zoom && v.zoom.vw} × ${v.zoom && v.zoom.vh})`);
        await app.reload(); await up(H.ctx, app); await sleep(1200); await tapBoard(app);
        v = await look(H.ctx, app);
        ok(v.spy && !v.spy.length && v.launched === '1', 'after a reload, no maximize() again (the window is marked as launched)');
        // Closed maximized, it opens maximized next time. That launch is marked too: once the teacher makes the window
        // smaller, a reload (an update) leaves it so.
        await app.close(); await sleep(500);
        const re = await H.launch();
        b = re && await H.bounds(re.id); v = re && await look(H.ctx, re);
        ok(!!re && b.windowState === 'maximized' && v.launched === '1' && v.spy && !v.spy.length, `closed maximized and launched again, it opens maximized, and that launch is marked too (${b ? box(b) : 'no window'}; marked: ${v && v.launched})`);
        if (re) {
          const id = await H.windowId(re.id);
          await H.bs.send('Browser.setWindowBounds', { windowId: id, bounds: { windowState: 'normal' } }); await sleep(500);
          await H.bs.send('Browser.setWindowBounds', { windowId: id, bounds: { left: 100, top: 60, width: 900, height: 600 } }); await sleep(800);
          await re.reload(); await up(H.ctx, re); await sleep(1200); await tapBoard(re);
          b = await H.bounds(re.id); v = await look(H.ctx, re);
          ok(b.left === 100 && b.top === 60 && b.width === 900 && b.height === 600 && b.windowState === 'normal' && v.spy && !v.spy.length,
            `made smaller by the teacher and reloaded, it stays as they left it, with no maximize() at a tap (${box(b)}; ${v.spy ? v.spy.length : '?'} calls)`);
          await H.bs.send('Browser.setWindowBounds', { windowId: id, bounds: { windowState: 'normal' } }); await sleep(300);   // (closed at that size, whatever happened)
          await H.bs.send('Browser.setWindowBounds', { windowId: id, bounds: { left: 100, top: 60, width: 900, height: 600 } }); await sleep(500);
          await re.close(); await sleep(500);
        }
        // Launched again (at that size: filled at launch), the first tap inside a widget's window: the frame's own click
        // keeps its activation, and the window is maximized a moment later.
        const fr = await H.launch();
        if (fr) {
          await run(H.ctx, fr, `window.__board21.openWidget('clock'), 1`); await sleep(1500);
          const at0 = await H.bounds(fr.id);
          const f = await run(H.ctx, fr, `(() => { const r = document.querySelector('.win[data-ikey="clock:1"] iframe').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
          await fr.mouse.click(f.x, f.y, { delay: 150 }); await sleep(2500);   // (a press as long as a person's)
          v = await look(H.ctx, fr); b = await H.bounds(fr.id);
          const clock = await (await fr.$('.win[data-ikey="clock:1"] iframe')).contentFrame();
          const fc = clock && await clock.evaluate(() => window.__clicks || null).catch(() => null);
          ok(covers(at0, v.s) && at0.windowState === 'normal' && fc && fc[0] === true && v.spy && v.spy.length === 1 && v.spy[0].tap && v.spy[0].outcome === 'resolved' && b.windowState === 'maximized',
            `a first tap in a widget's window (filled at launch: ${box(at0)}): the frame's own click had its activation (${JSON.stringify(fc)}), then maximize() ${v.spy && v.spy.map(x => x.outcome).join(', ')} (${box(b)})`);
        }
      }
      await H.close();
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],

  // ---- Classroom features (board.js section 12b): one or more suites each, in this order

  // Lock (Lock in the Widget Picker: Lock everything or Widgets still work; hold 🔒 in a top corner to unlock)
  ['Lock: Lock in the Widget Picker, its dialog, how it is stored, the padlocks in the top corners (both, left, right, Size 50%, the iPad’s status bar), no Lock in Settings, Theme in Settings', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const B = (fn, arg) => page.evaluate(fn, arg);
    const lockIs = () => B(() => { const b = document.body.classList; return [String(window.__board21.state.settings.locked), b.contains('windows-locked') ? 'windows' : '-', b.contains('lock-everything') ? 'everything' : '-'].join(' '); });
    const pads = () => B(() => Array.from(document.querySelectorAll('.lock-pad')).filter(b => !b.hidden && b.offsetWidth).map(b => (b.classList.contains('left') ? 'left' : 'right')).join());
    const toasts = () => B(() => Array.from(document.querySelectorAll('#toasts .toast span')).map(s => s.textContent));
    await B(() => window.__board21.openWidget('notes')); await page.waitForTimeout(800);

    // ---- The Widget Picker's bottom row: Lock where Dark mode was, between Import and Full screen, on both panels.
    for (const side of ['left', 'right']) {
      await page.click(`.picker-btn.${side}`); await page.waitForTimeout(300);
      const row = await B(() => {
        const ctl = Array.from(document.querySelectorAll('#panel .panel-controls .ctl')).filter(b => !b.hidden), x = c => { const b = document.querySelector(`#panel [data-ctl="${c}"]`).getBoundingClientRect(); return b.left + b.width / 2; };
        const l = document.querySelector('#panel [data-ctl="lock"]');
        return { ctl: ctl.map(b => b.dataset.ctl), theme: !!document.querySelector('[data-ctl="theme"]:not([hidden])'), title: l && l.title, label: l && l.getAttribute('aria-label'), pad: !!l && /M8 10\.5V7\.5a4 4 0 0 1 8 0v3/.test(l.innerHTML),
          between: !!l && Math.min(x('import'), x('fullscreen')) < x('lock') && x('lock') < Math.max(x('import'), x('fullscreen')) };
      });
      ok(JSON.stringify(row.ctl) === JSON.stringify(['paste', 'export', 'import', 'lock', 'fullscreen', 'settings']) && !row.theme && row.title === 'Lock' && row.label === 'Lock' && row.pad && row.between,
        `${side} Widget Picker: Lock, a padlock, where Dark mode was, between Import and Full screen (${row.ctl.join(', ')})`);
      await page.locator('#panel.open').screenshot({ path: OUT + `lock-picker-${side}.png` });
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    }

    // ---- Dark mode lives in Settings › Appearance › Theme.
    await setTheme(page, 'dark');
    ok(await B(() => document.body.classList.contains('dark') && window.__board21.state.settings.theme === 'dark'), 'Settings › Appearance › Theme: Dark turns the board dark');
    await setTheme(page, 'system');
    ok(await B(() => !document.body.classList.contains('dark') && window.__board21.state.settings.theme === 'system'), 'and Auto brings it back');
    // ---- No Lock in Settings: Classroom keeps Board history, Close all windows and Stay awake.
    await openSettings(page);
    const classroom = await B(() => { const h = Array.from(document.querySelectorAll('#settings .sheet-body > h3')).find(e => e.textContent === 'Classroom'), rows = [];
      for (let e = h && h.nextElementSibling; e && e.tagName !== 'H3'; e = e.nextElementSibling) rows.push(Array.from(e.querySelectorAll('[data-act]')).map(b => b.dataset.act).join('+') || e.className);
      return { rows, lock: !!document.querySelector('#settings [data-act="lock-windows"]'), text: /Lock windows|This device only/.test(document.getElementById('settings').textContent) }; });
    ok(!classroom.lock && !classroom.text && classroom.rows.filter(r => /^(hist-open|close-all|awake)$/.test(r)).join() === 'hist-open,close-all,awake',
      `Settings › Classroom: no “Lock windows in place”; Board history, Close all windows, and Stay awake are there (${classroom.rows.join(', ')})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    // ---- The dialog: a tap on Lock closes the Widget Picker and asks how.
    await page.click('.picker-btn.left'); await page.click('#panel.open [data-ctl="lock"]'); await page.waitForTimeout(300);
    const ask = () => B(() => {
      const m = document.querySelector('#modal.open'), p = m && m.querySelector('#modal-more p'), svg = p && p.querySelector('svg'), cs = p && getComputedStyle(p), card = m && getComputedStyle(m.querySelector('.modal-card'));
      return m && { title: m.querySelector('h3').textContent, line: p ? p.textContent.replace(/\s+/g, ' ').trim() : '', name: svg && svg.getAttribute('aria-label'), role: svg && svg.getAttribute('role'), pad: !!svg && /M8 10\.5V7\.5a4 4 0 0 1 8 0v3/.test(svg.innerHTML),
        plain: !!cs && cs.backgroundColor === card.backgroundColor || (cs && cs.backgroundColor === 'rgba(0, 0, 0, 0)'), border: cs && cs.borderTopWidth, size: cs && cs.fontSize, color: cs && cs.color, muted: getComputedStyle(document.body).getPropertyValue('--muted').trim(),
        described: (m.getAttribute('aria-describedby') || '').split(' ').includes('modal-more'),
        btns: Array.from(m.querySelectorAll('.modal-actions .btn')).map(b => [b.childNodes[0].textContent.trim(), (b.querySelector('small') || {}).textContent || '']),
        focus: document.activeElement && document.activeElement.childNodes[0] ? document.activeElement.childNodes[0].textContent.trim() : '', picker: document.getElementById('panel').classList.contains('open') };
    });
    let d = await ask();
    ok(d && !d.picker && d.title === 'Lock the board', `a tap on Lock closes the Widget Picker and opens “Lock the board” (${d && d.title})`);
    ok(d && d.line === 'To unlock, hold in a top corner for 2 seconds.' && d.pad && d.role === 'img' && d.name === 'the padlock' && d.described,
      `under the title: “To unlock, hold 🔒 in a top corner for 2 seconds.”, the padlock drawn in the sentence and named “the padlock” (${d && d.line})`);
    ok(d && d.plain && d.border === '0px' && d.size === '15px' && d.color === 'rgb(107, 114, 128)', `in the dialog’s message style, with no box, so it can’t pass for a button (${d && [d.size, d.color, d.border].join(' ')})`);
    ok(d && JSON.stringify(d.btns) === JSON.stringify([['Lock everything', 'Nothing on the board responds. Timers and videos keep going.'], ['Widgets still work', 'Widgets can’t move, but can still be used.'], ['Cancel', '']]),
      `the choices, each with its second line, then Cancel (${d && JSON.stringify(d.btns)})`);
    ok(d && d.focus === 'Lock everything', `the keyboard starts on the first choice (${d && d.focus})`);
    await page.locator('#modal').screenshot({ path: OUT + 'lock-dialog.png' });
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.waitForTimeout(300);
    ok(await lockIs() === 'false - -' && !await pads() && await B(() => document.activeElement === document.querySelector('.picker-btn.left')), `Cancel: nothing is locked, and the keyboard goes back to ▦ (${await lockIs()})`);
    // One corner only (Settings › Advanced › Widget Picker): the sentence names it.
    for (const side of ['left', 'right']) {
      await openSettings(page, ['advanced']); await page.click(`#settings [data-act="corners"][data-val="${side}"]`); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      await page.click(`.picker-btn.${side}`); await page.click('#panel.open [data-ctl="lock"]'); await page.waitForTimeout(300);
      d = await ask();
      ok(d && d.line === `To unlock, hold in the top ${side} corner for 2 seconds.`, `▦ on the ${side} only: “… hold 🔒 in the top ${side} corner for 2 seconds.” (${d && d.line})`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      ok(await lockIs() === 'false - -', 'Escape locks nothing');
    }
    await openSettings(page, ['advanced'], 'right'); await page.click('#settings [data-act="corners"][data-val="both"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);

    // ---- Widgets still work: stored as 'widgets', "Locked.", the keyboard on a padlock, a padlock in each top corner.
    await lockBoard(page, 'widgets', 'right');
    ok(await lockIs() === 'widgets windows -' && (await toasts()).includes('Locked.'), `Widgets still work: locked ('widgets'), and the message says “Locked.” (${await lockIs()})`);
    ok(await B(() => document.activeElement && document.activeElement.classList.contains('lock-pad') && document.activeElement.classList.contains('right')), 'the keyboard goes to the padlock on that side (▦ won’t open)');
    const stored = await B(async () => (await window.__board21.store.getMany(['settings']))[0].value.locked);
    ok(stored === 'widgets', `the settings record says 'widgets' (${stored})`);
    const exp = await B(async () => { const e = await window.__board21.buildExport('full'); return JSON.stringify(e).includes('"locked"'); });
    ok(!exp, 'an export never carries it');
    const geo = () => B(() => {
      const out = {}, ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
      for (const side of ['left', 'right']) {
        const p = document.querySelector(`.lock-pad.${side}`), w = document.querySelector(`.picker-btn.${side}`), r = p.getBoundingClientRect(), g = w.getBoundingClientRect(), cs = getComputedStyle(p);
        out[side] = { w: r.width, h: r.height, top: r.top, gw: g.width, gap: innerHeight - g.bottom, x: side === 'left' ? r.left - g.left : r.right - g.right, z: cs.zIndex, blur: /blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || ''),
          bg: cs.backgroundColor === getComputedStyle(w).backgroundColor, label: p.getAttribute('aria-label'), desc: p.getAttribute('aria-description'), ui };
      }
      return out;
    });
    let g = await geo();
    ok(['left', 'right'].every(s => Math.abs(g[s].w - g[s].gw) < 0.6 && Math.abs(g[s].h - g[s].gw) < 0.6 && Math.abs(g[s].top - g[s].gap) < 0.6 && Math.abs(g[s].x) < 0.6 && g[s].blur && g[s].bg),
      `a padlock in each top corner, ▦ mirrored: the same frosted button, as big, as far in (${JSON.stringify(g.left)})`);
    ok(['left', 'right'].every(s => g[s].label === 'Unlock' && g[s].desc === 'Hold for 2 seconds.' && g[s].z === '1001'), `named “Unlock”, described “Hold for 2 seconds.”, over the windows as ▦ is (z-index ${g.left.z})`);
    ok(!await B(() => document.querySelector('.lock-badge') || ['left', 'right'].some(s => document.querySelector(`.picker-btn.${s}`).hasAttribute('aria-description'))), 'no padlock badge on ▦, and no description saying how to unlock');
    await page.screenshot({ path: OUT + 'lock-widgets.png' });
    // Size 50%: never under 44 × 44.
    await B(() => window.__board21.setBoardScale(0.5)); await page.waitForTimeout(400);
    g = await geo();
    ok(['left', 'right'].every(s => Math.abs(g[s].w - 44) < 0.6 && Math.abs(g[s].h - 44) < 0.6 && g[s].gw < 30), `at Size 50% ▦ is ${g.left.gw.toFixed(1)} px, and the padlocks stay 44 × 44 (${g.left.w.toFixed(1)} × ${g.left.h.toFixed(1)})`);
    // The window menu's note, which says how to unlock, shows whole at Size 50%, 80%, and 200%. (Its words: "Lock: Lock
    // everything and Widgets still work".)
    const notes = [];
    for (const sc of [0.5, 0.8, 2]) {
      await B(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(400);
      await page.click('.win[data-ikey="notes:1"] .win-label'); await page.waitForTimeout(250);
      notes.push(await B(sc => {
        const m = document.getElementById('menu'), n = m.querySelector('.lock-note'), t = n && n.querySelector('span'), b = m.getBoundingClientRect(), r = n ? n.getBoundingClientRect() : {};
        return { sc, whole: !!t && r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5 && t.scrollWidth <= t.clientWidth + 1 && t.scrollHeight <= t.clientHeight + 1
          && m.scrollHeight <= m.clientHeight + 1 && b.top >= 0 && b.bottom <= innerHeight, w: Math.round(r.width), h: Math.round(r.height) };
      }, sc));
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    }
    ok(notes.every(n => n.whole), `the window menu’s note shows whole, inside a menu that doesn’t scroll (${notes.map(n => `${n.sc * 100}%: ${n.w} × ${n.h}${n.whole ? '' : ' NOT WHOLE'}`).join(', ')})`);
    await B(() => window.__board21.setBoardScale(0.8)); await page.waitForTimeout(400);
    // The iPad's status bar (the safe area at the top): the padlocks sit below it.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 30, left: 0, right: 0, bottom: 0 } }); await page.waitForTimeout(300);
    g = await geo();
    ok(['left', 'right'].every(s => Math.abs(g[s].top - (30 + 16 * g[s].ui)) < 0.6), `under a 30 px status bar, the padlocks sit 30 px lower (top ${g.left.top.toFixed(1)}, at ${g.left.ui})`);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} }); await page.waitForTimeout(200);
    await unlockBoard(page);
    ok(await lockIs() === 'false - -' && !await pads(), 'unlocked: the padlocks go');

    // ---- Lock everything: 'all'. One corner only: one padlock, on that side.
    for (const side of ['left', 'right']) {
      await openSettings(page, ['advanced']); await page.click(`#settings [data-act="corners"][data-val="${side}"]`); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      await lockBoard(page, 'all', side);
      ok(await lockIs() === 'all windows everything' && await pads() === side, `▦ on the ${side} only, Lock everything: locked ('all'), with one padlock, top ${side} (${await lockIs()}; ${await pads()})`);
      if (side === 'left') await page.screenshot({ path: OUT + 'lock-everything-left.png' });
      await unlockBoard(page);
    }
    await openSettings(page, ['advanced'], 'right'); await page.click('#settings [data-act="corners"][data-val="both"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);

    // ---- A device locked by an earlier release (locked: true) comes up as Widgets still work, with the padlocks.
    for (const old of [true, 'yes', 1]) {
      await B(v => window.__board21.writer.patch('settings', 'settings', { set: { locked: v } }), old); await B(() => window.__board21.writer.settled(3000));
      await page.reload(); await boardUp(page); await page.waitForTimeout(300);
      ok(await lockIs() === 'widgets windows -' && await pads() === 'left,right' && !(await toasts()).some(t => /lock/i.test(t)), `locked: ${JSON.stringify(old)} from before reads as Widgets still work, with both padlocks, and nothing else is said (${await lockIs()})`);
      await unlockBoard(page);
    }
    ok(await B(async () => (await window.__board21.store.getMany(['settings']))[0].value.locked) === false, 'unlocking stores false');

    // ---- Locking closes what is open: the Widget Picker, Settings, Board history, a window’s menu, the Pages menu, and a
    // dialog, which ends as Cancel. Here another tab locks.
    const other = await ctx.newPage(); other.on('pageerror', e => errors.push('tab 2: ' + e.message));
    await other.goto(BASE); await boardUp(other);
    const shown = () => B(() => ({ picker: document.getElementById('panel').classList.contains('open'), settings: !!document.querySelector('#settings.open'), history: !!document.querySelector('#history.open'),
      menu: document.getElementById('menu').classList.contains('open'), pages: document.getElementById('pages-menu').classList.contains('open'), dialog: !!document.querySelector('#modal.open') }));
    const name0 = await B(() => window.__board21.state.board.name);
    const opened = [
      ['the Widget Picker', 'picker', () => page.click('.picker-btn.left')],
      ['Settings', 'settings', () => openSettings(page)],
      ['Board history', 'history', async () => { await openSettings(page); await page.click('#settings [data-act="hist-open"]'); }],
      ['a window’s menu', 'menu', () => page.click('.win[data-ikey="notes:1"] .win-label')],
      ['the Pages menu', 'pages', async () => { await page.click('.picker-btn.left'); await page.click('#panel.open [data-ctl="pages"]'); }],
      ['Rename this page…', 'dialog', async () => { await page.click('.picker-btn.left'); await page.click('#panel.open [data-ctl="pages"]'); await page.waitForTimeout(300); await page.click('#pages-menu [data-act="rename"]'); await page.fill('#modal.open input', 'Renamed'); }]];
    for (const [what, key, open] of opened) {
      await open(); await page.waitForTimeout(400);
      const was = (await shown())[key];
      await lockBoard(other, 'widgets'); await page.waitForTimeout(800);
      const now = await shown();
      ok(was && await lockIs() === 'widgets windows -' && !Object.values(now).some(Boolean), `${what} open here, and another tab locks: it closes (${was ? JSON.stringify(now) : 'it didn’t open'})`);
      await unlockBoard(other); await page.waitForTimeout(500);
    }
    ok(await B(() => window.__board21.state.board.name) === name0, `the dialog ended as Cancel: the page keeps its name (${await B(() => window.__board21.state.board.name)})`);
    await other.close();

    // ---- Not in the widget dev window (Lock is always off there).
    const dev = await ctx.newPage(); dev.on('pageerror', e => { if (!/boom from the widget/.test(e.message)) errors.push('dev window: ' + e.message); });
    await dev.goto(BASE + '__dev/top.html?s=shim-write.html'); await dev.waitForTimeout(3500);
    const kids = f => dev.frames().filter(x => x.parentFrame() === f);
    const board = (kids(kids(dev.mainFrame())[0] || dev.mainFrame()) || [])[0];
    const lab = board && await board.evaluate(() => { document.querySelector('.picker-btn.left').click(); const l = document.querySelector('[data-ctl="lock"]'); return { open: document.getElementById('panel').classList.contains('open'), lock: !!l, hidden: !l || l.hidden, paste: document.querySelector('[data-ctl="paste"]').hidden }; });
    ok(lab && lab.open && lab.hidden && lab.paste, `the widget dev window’s Widget Picker has no Lock, as it has no Paste (${JSON.stringify(lab)})`);
    await dev.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  ['Lock: hold the padlock to unlock (its ring, a quick tap, the 16 px slide margin, a script’s press, Reduce motion, the keyboard), ▦ doesn’t open, one message every 5 seconds, two tabs, reload, kiosk, a page from an earlier build', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const B = (fn, arg, p = page) => p.evaluate(fn, arg);
    const locked = (p = page) => p.evaluate(() => !!window.__board21.state.settings.locked && document.body.classList.contains('windows-locked'));
    const pad = async (side = 'left', p = page) => { const r = await p.locator(`.lock-pad.${side}`).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r }; };
    const ring = (side = 'left', p = page) => p.evaluate(s => { const f = document.querySelector(`.lock-pad.${s} .lock-ring .fill`); return f ? parseFloat(f.style.strokeDasharray) : null; }, side);
    const tip = (p = page) => p.evaluate(() => Array.from(document.querySelectorAll('.lock-pad:not([hidden]) .lock-tip')).filter(t => !t.hidden && t.getBoundingClientRect().width).map(t => t.textContent).join());
    const said = (text, p = page) => p.locator('#toasts .toast:not(.out)', { hasText: text }).count();
    const clear = (p = page) => p.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
    const pickerOpen = (p = page) => p.evaluate(() => document.getElementById('panel').classList.contains('open'));
    const padsShown = (p = page) => p.evaluate(() => Array.from(document.querySelectorAll('.lock-pad')).filter(b => !b.hidden && b.offsetWidth).length);
    await B(() => window.__board21.openWidget('dice')); await page.waitForTimeout(800);
    await lockBoard(page, 'widgets');
    ok(await locked() && await padsShown() === 2, 'locked, with a padlock in each top corner');

    // ---- A quick tap: “Hold to unlock” beside the padlock for about 2 seconds. It never unlocks.
    let c = await pad('left');
    await clear(); await page.mouse.click(c.x, c.y); await page.waitForTimeout(250);
    ok(await locked() && await tip() === 'Hold to unlock' && !await page.locator('#modal.open').count() && !await pickerOpen(), `a quick tap: still locked, and “${await tip()}” shows beside it`);
    const tb = await B(() => { const t = document.querySelector('.lock-pad.left .lock-tip').getBoundingClientRect(), p = document.querySelector('.lock-pad.left').getBoundingClientRect(); return { right: t.left >= p.right, mid: Math.abs((t.top + t.bottom) / 2 - (p.top + p.bottom) / 2) < 1.5 }; });
    ok(tb.right && tb.mid, `on the left padlock it shows to its right, level with it (${JSON.stringify(tb)})`);
    await page.screenshot({ path: OUT + 'lock-hint.png', clip: { x: 0, y: 0, width: 420, height: 130 } });
    await page.waitForTimeout(2300);
    ok(!await tip() && await locked(), 'and goes after about 2 seconds');
    // Let go after a second: the ring was half full; that’s a tap too.
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(1000);
    const mid = await ring('left');
    await page.mouse.up(); await page.waitForTimeout(250);
    ok(mid > 35 && mid < 65, `holding fills a ring around the padlock (half-way after a second: ${mid})`);
    ok(await locked() && !await page.locator('.lock-ring').count() && await tip() === 'Hold to unlock', 'let go sooner: still locked, the ring goes, and it says “Hold to unlock”');
    await page.waitForTimeout(2300);

    // ---- The slide margin is 16 px, the board's tap slop for a finger: 15 px off the padlock still holds, 17 px cancels.
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(200);
    await page.mouse.move(c.r.x + c.r.width + 17, c.y, { steps: 4 }); await page.waitForTimeout(2200);
    const off = await locked() && !await page.locator('.lock-ring').count();
    await page.mouse.up(); await page.waitForTimeout(250);
    ok(off && !await tip(), 'sliding 17 px off the padlock cancels: still locked, no ring, and no “Hold to unlock” when let go');
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(200);
    await page.mouse.move(c.r.x + c.r.width + 15, c.y + 10, { steps: 4 }); await page.waitForTimeout(2200);
    const at15 = await B(() => window.__board21.state.settings.locked);
    await page.mouse.up(); await page.waitForTimeout(600);
    ok(at15 === false && (await said('Unlocked.')) === 1, 'a hand that slides 15 px still unlocks at 2 seconds, without waiting to let go, and the message says “Unlocked.”');
    ok(!await locked() && !await padsShown() && !await pickerOpen(), 'let go: the padlocks go, and no Widget Picker opens');

    // ---- A finger on the right padlock (no long-press menu), with the ring.
    await lockBoard(page, 'all', 'right');
    const cdp = await ctx.newCDPSession(page);
    c = await pad('right');
    const menuWay = await B(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('.lock-pad.right').dispatchEvent(e); return e.defaultPrevented; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 1 }] }); await page.waitForTimeout(1000);
    const ringR = await ring('right');
    await page.waitForTimeout(1300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(600);
    ok(menuWay && ringR > 30 && !await locked() && !await pickerOpen(), `held with a finger, the right padlock unlocks too, with its ring (${ringR}) and no long-press menu`);
    const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok(/\.lock-pad \{[^}]*-webkit-touch-callout: none/.test(css) && /\.lock-pad \{[^}]*touch-action: none/.test(css), 'and no callout on an iPad (-webkit-touch-callout: none), nor a pan taking the press away');

    // ---- A script's press, or one the browser takes away, never unlocks. Nor does a script's click.
    await lockBoard(page, 'widgets');
    await B(() => document.querySelector('.lock-pad.left').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: 40, clientY: 40 })));
    await page.waitForTimeout(2300);
    ok(await locked() && !await page.locator('.lock-ring').count(), 'a script’s press on a padlock doesn’t unlock 2 seconds later');
    await B(() => document.querySelector('.lock-pad.left').click()); await page.waitForTimeout(300);
    ok(await locked() && !await page.locator('#modal.open').count(), 'and a script’s click asks nothing');
    await B(() => document.querySelector('.lock-pad.left').addEventListener('pointerdown', e => { window.__pid = e.pointerId; }, { once: true }));
    c = await pad('left');
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(300);
    await B(() => document.querySelector('.lock-pad.left').releasePointerCapture(window.__pid));
    await page.mouse.move(c.x + 1, c.y); await page.waitForTimeout(2000);
    const lost = await locked() && !await page.locator('.lock-ring').count();
    await page.mouse.up(); await page.waitForTimeout(300);
    ok(lost, 'a press the browser takes away doesn’t unlock 2 seconds later');
    await page.waitForTimeout(2200);

    // ---- Reduce motion: the ring fills in four steps.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(700);
    const steps = [];
    for (let i = 0; i < 8; i++) { steps.push(await ring('left')); await page.waitForTimeout(100); }
    await page.mouse.up(); await page.waitForTimeout(300);
    await page.emulateMedia({ reducedMotion: null });
    ok(steps.every(v => v === null || v % 25 === 0) && steps.some(v => v === 25 || v === 50) && await locked(), `with Reduce motion the ring fills in steps of a quarter (${steps.join(', ')})`);
    await page.waitForTimeout(2300);

    // ---- The keyboard (or a screen reader, or Switch Access): a click with no press asks first.
    await page.locator('.lock-pad.left').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const q = await B(() => { const m = document.querySelector('#modal.open'); return m && { title: m.querySelector('h3').textContent, p: (m.querySelector('#modal-text') || {}).textContent || '', btns: Array.from(m.querySelectorAll('.modal-actions .btn')).map(b => b.textContent.trim()) }; });
    ok(q && q.title === 'Unlock the board?' && !q.p && q.btns.join() === 'Unlock,Cancel', `Enter on a padlock asks “Unlock the board?” with Unlock and Cancel (${JSON.stringify(q)})`);
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.waitForTimeout(300);
    ok(await locked() && await B(() => document.activeElement === document.querySelector('.lock-pad.left')), 'Cancel: still locked, the keyboard back on the padlock');
    await clear(); await page.keyboard.press('Space'); await page.waitForTimeout(300);
    await page.locator('#modal.open .btn', { hasText: /^Unlock$/ }).click(); await page.waitForTimeout(400);
    ok(!await locked() && !await padsShown() && (await said('Unlocked.')) === 1 && await B(() => document.activeElement === document.querySelector('.picker-btn.left')), 'Space, then Unlock: unlocked, “Unlocked.”, and the keyboard goes to ▦');

    // ---- ▦ under either lock: it stays put and doesn't open; a tap says “The board is locked.” Holding it does nothing.
    for (const mode of ['widgets', 'all']) {
      await lockBoard(page, mode);
      await B(() => { window.__board21.lock.toldAt = 0; }); await clear();
      const g = await page.locator('.picker-btn.left').boundingBox();
      await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2); await page.waitForTimeout(300);
      ok(!await pickerOpen() && (await said('The board is locked.')) === 1 && await locked(), `${mode === 'all' ? 'Lock everything' : 'Widgets still work'}: a tap on ▦ opens nothing and says “The board is locked.”`);
      await page.focus('.picker-btn.left'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
      ok(!await pickerOpen(), 'nor does Enter on ▦');
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up(); await page.waitForTimeout(300);
      ok(await locked() && !await pickerOpen() && !await page.locator('.picker-btn .lock-ring').count(), 'holding ▦ for 2 seconds doesn’t unlock, and draws no ring');
      await unlockBoard(page);
    }

    // ---- The message: at most once every 5 seconds, whatever was tapped or tried.
    await lockBoard(page, 'widgets');
    await B(() => { window.__board21.lock.toldAt = 0; window.__told = 0; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast') && n.textContent === 'The board is locked.') window.__told++; }).observe(document.getElementById('toasts'), { childList: true }); });
    const g = await page.locator('.picker-btn.left').boundingBox();
    await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2); await page.waitForTimeout(200);
    const t = await page.locator('.win[data-ikey="dice:1"] .win-title').boundingBox();
    await page.mouse.move(t.x + t.width - 30, t.y + 15); await page.mouse.down(); await page.mouse.move(t.x + t.width + 60, t.y + 80, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
    await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2); await page.waitForTimeout(300);
    ok(await B(() => window.__told) === 1, 'a tap on ▦, a window dragged and ▦ again within 5 seconds: one message');
    await page.waitForTimeout(5000);
    await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2); await page.waitForTimeout(300);
    ok(await B(() => window.__told) === 2, '5 seconds later, it says so again');

    // ---- Every tab on the device follows; a reload keeps it.
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push('tab 2: ' + e.message));
    await p2.goto(BASE); await boardUp(p2); await p2.waitForTimeout(500);
    ok(await locked(p2) && await padsShown(p2) === 2 && !await p2.evaluate(() => document.body.classList.contains('lock-everything')), 'a tab opened later is locked too, Widgets still work, with its padlocks');
    const c2 = await pad('right', p2);
    await p2.mouse.move(c2.x, c2.y); await p2.mouse.down(); await p2.waitForTimeout(2300); await p2.mouse.up(); await page.waitForTimeout(800);
    ok(!await locked() && !await padsShown(), 'holding a padlock in the other tab unlocks this one, and its padlocks go');
    await lockBoard(page, 'all'); await p2.waitForTimeout(800);
    ok(await locked(p2) && await p2.evaluate(() => document.body.classList.contains('lock-everything') && document.getElementById('desk').inert), 'Lock everything here: the other tab is under Lock everything too');
    await p2.close();
    await page.reload(); await boardUp(page); await page.waitForTimeout(300);
    ok(await locked() && await B(() => document.body.classList.contains('lock-everything')) && await padsShown() === 2, 'a reload keeps it');

    // ---- Kiosk mode keeps it, and the hold works there. Unlocked, its Widget Picker has Lock.
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('kiosk: ' + e.message));
    await page.close();
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k);
    ok(await locked(k) && await padsShown(k) === 2, 'kiosk mode keeps it, with the padlocks');
    const ck = await pad('left', k);
    await k.mouse.move(ck.x, ck.y); await k.mouse.down(); await k.waitForTimeout(2300); await k.mouse.up(); await k.waitForTimeout(500);
    ok(!await locked(k), 'holding a padlock unlocks in kiosk mode too');
    await k.click('.picker-btn.left'); await k.waitForTimeout(250);
    const ctl = await k.evaluate(() => Array.from(document.querySelectorAll('.panel-controls .ctl')).filter(b => !b.hidden).map(b => b.dataset.ctl));
    ok(JSON.stringify(ctl) === JSON.stringify(['paste', 'export', 'import', 'lock', 'settings', 'quit']), `its Widget Picker has Lock (${ctl.join(', ')})`);
    await k.close();

    // ---- A page and board.js from different builds, as a device can have for a launch or two after an update: the board
    // starts again once, then starts with what it has. First, the page of 2026.11.18-17 as it shipped (tests/fixtures),
    // with Dark mode where Lock goes and no styles for the padlocks, and this board.js. It starts. The padlocks show in
    // the top corners, big enough, and holding one unlocks. Its Widget Picker then has Lock where Dark mode was.
    const mixed = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true, serviceWorkers: 'block' });
    const old = await mixed.newPage(); old.on('pageerror', e => errors.push('older page: ' + e.message));
    await old.goto(BASE); await boardUp(old);
    await old.evaluate(() => window.__board21.writer.patch('settings', 'settings', { set: { locked: 'all' } }));
    await old.evaluate(() => window.__board21.writer.settled(3000));
    const oldPage = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', 'index-2026.11.18-17.html'), 'utf8');
    await old.route(BASE, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: oldPage }));
    await old.reload();
    const up = await boardUp(old).then(() => true, () => false);
    const cover = await old.evaluate(() => { const s = document.getElementById('startup'); return s ? s.innerText.replace(/\s+/g, ' ').trim() : ''; });
    const builds = await old.evaluate(() => [document.documentElement.dataset.build, window.__board21 && window.__board21.build]);
    ok(up && !cover && builds[0] === '6dd5cd15' && builds[1] !== builds[0], `2026.11.18-17’s page with this board.js: the board starts (${builds.join(' with ')}${cover ? ': ' + cover : ''})`);
    if (up) {
      const bare = await old.evaluate(() => Array.from(document.querySelectorAll('.lock-pad')).map(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { pos: cs.position, w: r.width, h: r.height, top: r.top, x: r.left < innerWidth / 2 ? r.left : innerWidth - r.right, shown: cs.display !== 'none' && cs.visibility !== 'hidden', hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b || b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) }; }));
      ok(bare.length === 2 && bare.every(b => b.pos === 'fixed' && b.shown && b.hit && b.w >= 44 && b.h >= 44 && b.top < 40 && b.x < 40), `the padlocks show anyway, in the top corners, 44 px or more, and take a press (${JSON.stringify(bare[0])})`);
      const co = await pad('left', old);
      await old.mouse.move(co.x, co.y); await old.mouse.down(); await old.waitForTimeout(2300); await old.mouse.up(); await old.waitForTimeout(500);
      ok(!await locked(old) && await old.evaluate(() => Array.from(document.querySelectorAll('.lock-pad')).every(b => getComputedStyle(b).display === 'none')), 'and holding one unlocks, and they go');
      await old.click('.picker-btn.left'); await old.waitForTimeout(300);
      const row = await old.evaluate(() => { const l = document.querySelector('#panel [data-ctl="lock"]'); return { ctl: Array.from(document.querySelectorAll('#panel .panel-controls .ctl')).filter(b => !b.hidden).map(b => b.dataset.ctl), title: l && l.title, pad: !!l && /M8 10\.5V7\.5a4 4 0 0 1 8 0v3/.test(l.innerHTML) }; });
      ok(JSON.stringify(row.ctl) === JSON.stringify(['paste', 'export', 'import', 'lock', 'fullscreen', 'settings']) && row.title === 'Lock' && row.pad, `its Widget Picker has Lock where Dark mode was (${row.ctl.join(', ')})`);
      await old.click('#panel.open [data-ctl="lock"]'); await old.waitForTimeout(300);
      ok(await old.evaluate(() => (document.querySelector('#modal.open h3') || {}).textContent) === 'Lock the board', 'and Lock asks how');
      await old.keyboard.press('Escape'); await old.waitForTimeout(200);
    }
    await mixed.close();
    // The other way round: this page with a board.js from before Lock, which draws Dark mode in the Widget Picker and
    // knows no Lock (this board.js with 2026.11.18-17's lines put back: its build, its Dark mode button). It starts, and
    // its Widget Picker has no blank button: the page keeps a hidden Dark mode button for it, and Lock stays hidden.
    let earlier = fs.readFileSync(path.join(ROOT, 'board.js'), 'utf8');
    // (Each line must be there, but the last two: this release's own safeguards for the mix, taken out.)
    for (const [from, to, must = true] of [[/const BOARD_VERSION = '[^']*';/, "const BOARD_VERSION = '2026.11.18-17';"], [/const BOARD_BUILD = '[^']*';/, "const BOARD_BUILD = '6dd5cd15';"],
      [/set\('lock', 'lock', 'Lock'\)\.hidden = !!LAB;/, "set('theme', 'gear', 'Dark mode');"], [/ if \(!b\) return \{\};/, '', false], [/\n[^\n]*th\.dataset\.ctl = 'lock'[^\n]*/, '', false]]) {
      if (must && !from.test(earlier)) throw new Error('board.js has changed: put back 2026.11.18-17’s lines by hand (' + from + ')');
      earlier = earlier.replace(from, to);
    }
    const mixed2 = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
    const np = await mixed2.newPage(); np.on('pageerror', e => errors.push('earlier board.js: ' + e.message));
    await np.route(BASE + 'board.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: earlier }));
    await np.goto(BASE);
    const up2 = await boardUp(np).then(() => true, () => false);
    const cover2 = await np.evaluate(() => { const s = document.getElementById('startup'); return s ? s.innerText.replace(/\s+/g, ' ').trim() : ''; });
    ok(up2 && !cover2 && await np.evaluate(() => window.__board21.version) === '2026.11.18-17', `this page with a board.js from before Lock: the board starts (${cover2 || 'no start-up message'})`);
    if (up2) {
      await np.click('.picker-btn.left'); await np.waitForTimeout(300);
      const row2 = await np.evaluate(() => Array.from(document.querySelectorAll('#panel .panel-controls .ctl')).filter(b => !b.hidden).map(b => b.dataset.ctl + (b.querySelector('svg') ? '' : ' (blank)')));
      ok(JSON.stringify(row2) === JSON.stringify(['paste', 'export', 'import', 'fullscreen', 'settings']), `its Widget Picker has no blank button, no Lock and no Dark mode (${row2.join(', ')})`);
    }
    await mixed2.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  ['Lock: Lock everything and Widgets still work (taps and keys on windows, a district app, ▦, the notes, the shape tip, messages and their buttons; a timer keeps going; moves refused; files, Paste; an empty page; a widget in full screen; the top corners for widgets)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, hasTouch: true });
    // (District apps: a stand-in page here, never the real site. It counts the presses it gets.)
    await ctx.route(/^https?:\/\/([^/]*\.)?ccsd21\.org(:\d+)?\//, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>21Timer stand-in</title><body style="margin:0;height:100vh" onpointerdown="window.__taps = (window.__taps || 0) + 1">21Timer stand-in</body>' }));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const B = (fn, arg) => page.evaluate(fn, arg);
    const disp = ik => B(ik => Object.assign({}, window.__board21.state.wins.get(ik).disp), ik);
    const inst = ik => B(ik => window.__board21.state.insts.get(ik), ik);
    const frame = ik => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const said = text => page.locator('#toasts .toast:not(.out)', { hasText: text }).count();
    const fresh = () => B(() => { window.__board21.lock.toldAt = 0; document.getElementById('toasts').innerHTML = ''; });
    const center = async sel => { const r = await page.locator(sel).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const rolls = () => frame('dice:1').locator('#said').textContent();
    const notes = () => B(() => (window.__board21.state.data.get('notes:1') || {}).text || '');
    const timeLeft = () => frame('timer:1').locator('#display').textContent();
    // A .21board file or a picture dropped on the board, and a picture pasted.
    const drop = (name, type = 'application/json') => B(async ([name, type]) => {
      const body = type === 'application/json' ? JSON.stringify(await window.__board21.buildExport('template')) : new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const dt = new DataTransfer(); dt.items.add(new File([body], name, { type }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 700, clientY: 500 }));
    }, [name, type]);
    const paste = () => B(() => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'Frog.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    const count = id => B(id => Array.from(window.__board21.state.insts.values()).filter(i => i.widgetId === id && i.open).length, id);

    await B(async () => { await window.__board21.pages.add(); await window.__board21.pages.go(1); });
    await B(() => { for (const id of ['clock', 'dice', 'notes', 'timer', '21timer']) window.__board21.openWidget(id); });
    await page.waitForTimeout(1500);
    const place = { 'clock:1': { x: 40, y: 100, w: 260, h: 300 }, 'dice:1': { x: 360, y: 100, w: 360, h: 280 }, 'notes:1': { x: 780, y: 100, w: 320, h: 300 }, 'timer:1': { x: 40, y: 460, w: 380, h: 300 }, '21timer:1': { x: 500, y: 460, w: 460, h: 300 } };
    await B(place => { window.__board21.state.settings.snapping = false; for (const [ik, r] of Object.entries(place)) window.__board21.setRect(ik, r); }, place);
    await page.waitForTimeout(300);
    await fillNote(frame('notes:1'), 'Before'); await page.waitForTimeout(600);

    // ======== Widgets still work ========
    await lockBoard(page, 'widgets');
    // Widgets still work: a roll.
    await frame('dice:1').locator('#roll').click(); await page.waitForTimeout(1800);
    ok(/Rolled/.test(await rolls()), 'Widgets still work: the dice roll');
    // Moves refused, and said: “The board is locked.”
    await fresh();
    let d0 = await disp('dice:1');
    await page.mouse.move(d0.x + d0.w - 40, d0.y + 20); await page.mouse.down(); await page.mouse.move(d0.x + d0.w + 40, d0.y + 80, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
    let d1 = await disp('dice:1');
    ok(d1.x === d0.x && d1.y === d0.y && await said('The board is locked.') === 1 && !await said('Hold'), `a window dragged doesn’t move, and the message says “The board is locked.”, not how to unlock (moved ${d1.x - d0.x}, ${d1.y - d0.y})`);
    await B(() => window.__board21.focusWin('dice:1')); await page.waitForTimeout(150);
    ok(await B(() => Array.from(document.querySelectorAll('.win[data-ikey="dice:1"] .grip')).every(g => getComputedStyle(g).display === 'none')), 'no resize handles');
    await page.mouse.click(d0.x + d0.w - 40, d0.y + 20); await page.waitForTimeout(60); await page.mouse.click(d0.x + d0.w - 40, d0.y + 20); await page.waitForTimeout(300);
    ok(!(await inst('dice:1')).maximized, 'two taps on a title bar don’t fill the board');
    // The window menu: the widget's own items, and “The board is locked. Hold the padlock to unlock.”
    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.waitForTimeout(250);
    const m = await B(() => ({ open: document.getElementById('menu').classList.contains('open'), acts: Array.from(document.querySelectorAll('#menu [data-act]')).map(b => b.dataset.act), note: ((document.querySelector('#menu .lock-note') || {}).textContent || '').trim() }));
    ok(m.open && m.acts.length && m.acts.every(a => a === 'widget') && m.note === 'The board is locked. Hold the padlock to unlock.', `the window menu keeps the widget’s own items, and ends with “The board is locked. Hold the padlock to unlock.” (${m.note})`);
    await page.keyboard.press('Escape');
    // A widget's own close, fill and restore: refused.
    await frame('dice:1').locator('html').evaluate(() => { Board21.window.maximize(); Board21.window.close(); }); await page.waitForTimeout(500);
    ok((await inst('dice:1')).open && !(await inst('dice:1')).maximized, 'a widget can’t close or fill its own window');
    // Paste: refused and said. No new page.
    await fresh(); let n = await count('image');
    await paste(); await page.waitForTimeout(500);
    ok(await count('image') === n && await said('The board is locked.') === 1, 'a picture pasted opens nothing, and the message says why');
    await B(() => window.__board21.pages.go(2)); await page.waitForFunction(() => window.__board21.state.boardId === 2 && !window.__board21.pages.busy, null, { timeout: 8000 }).catch(() => {});
    await B(() => window.__board21.pages.step(1)); await page.waitForTimeout(400);
    ok(await B(() => window.__board21.pages.ids().length === 2), 'no new page');
    // An empty page: “The board is locked.”, and no “Go back to an earlier version”.
    const empty = await B(() => { const h = document.getElementById('empty-hint'), shown = el => !!el && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';
      return { lock: shown(h.querySelector('.lock-hint')) && h.querySelector('.lock-hint').textContent, ready: shown(h.querySelector('.big')), tap: shown(h.querySelector(':scope > .small:not(.lock-hint)')), rescue: shown(h.querySelector('.rescue')) }; });
    ok(empty.lock === 'The board is locked.' && !empty.ready && !empty.tap && !empty.rescue, `an empty page says only “The board is locked.”: not “Your board is ready”, “Tap ▦…” or “Go back to an earlier version” (${JSON.stringify(empty)})`);
    await B(() => window.__board21.pages.go(1)); await page.waitForFunction(() => window.__board21.state.boardId === 1 && window.__board21.state.wins.size === 5 && !window.__board21.pages.busy, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    // Messages show with no buttons.
    await B(() => window.__board21.mergeUI.say('Updated from the laptop.', { action: 'Undo', timeout: 8000, onAction() {} }));
    ok(await said('Updated from the laptop.') === 1 && await page.locator('#toasts .toast', { hasText: 'Updated from the laptop.' }).locator('button').count() === 0, 'a message shows without its buttons');
    // A file dropped asks first.
    await drop('Science.21board'); await page.waitForTimeout(400);
    const ask = await B(() => ({ title: (document.querySelector('#modal.open h3') || {}).textContent, text: (document.querySelector('#modal.open p') || {}).textContent, btns: Array.from(document.querySelectorAll('#modal.open .btn')).map(b => b.textContent.trim()) }));
    ok(ask.title === 'The board is locked' && ask.text === 'To open “Science”, unlock the board first.' && ask.btns.join() === 'Unlock and open,Cancel', `a file dropped on the board asks first (${ask.title}: ${ask.text} ${ask.btns.join(' / ')})`);
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.waitForTimeout(400);
    ok(await B(() => !!window.__board21.state.settings.locked && !document.querySelector('#modal.open')), 'Cancel: nothing opens, still locked');
    await drop('Science.21board'); await page.waitForTimeout(400);
    await page.locator('#modal.open .btn', { hasText: 'Unlock and open' }).click(); await page.waitForTimeout(500);
    await page.locator('#modal.open .btn', { hasText: 'Open as a new page' }).click();
    await page.waitForFunction(() => window.__board21.pages.ids().length === 3 && !window.__board21.pages.busy, null, { timeout: 8000 }).catch(() => {});
    ok(await B(() => !window.__board21.state.settings.locked && window.__board21.pages.ids().length === 3 && !document.querySelector('.lock-pad:not([hidden])')), '“Unlock and open”, then how to open it: unlocked, and it opens');
    await B(() => window.__board21.pages.go(1)); await page.waitForFunction(() => window.__board21.state.boardId === 1 && window.__board21.state.wins.size === 5 && !window.__board21.pages.busy, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);

    // ======== Lock everything ========
    // (locked from another tab, while the keyboard is in a note here, a timer runs, a message offers its buttons, and a
    // widget frame is in full screen, as the Video Player's may be: it leaves full screen as the board locks, so the
    // padlocks show)
    await frame('timer:1').locator('#go').click(); await page.waitForTimeout(300);
    await B(() => window.__board21.mergeUI.say('A new version of 21Board is ready.', { action: 'Update', dismiss: 'Later', timeout: 0 }));
    await B(() => { const f = document.querySelector('.win[data-ikey="dice:1"] iframe'); window.__exits = 0; Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (window.__exits ? null : f) }); document.exitFullscreen = () => { window.__exits++; return Promise.resolve(); }; });
    await fillNote(frame('notes:1'), 'Before'); await page.waitForTimeout(700);
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push('tab 2: ' + e.message));
    await p2.goto(BASE); await boardUp(p2); await lockBoard(p2, 'all'); await p2.close();
    await page.waitForFunction(() => document.body.classList.contains('lock-everything'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    ok(await B(() => window.__exits) === 1, 'a widget in full screen leaves it as the board locks');
    await B(() => { delete document.fullscreenElement; delete document.exitFullscreen; });
    ok(await page.locator('#toasts .toast', { hasText: 'A new version' }).locator('button').count() === 0 && await said('A new version of 21Board is ready.') === 1, 'a message already showing loses its buttons (Update, Later), and keeps its words');
    const t0 = await timeLeft();
    ok(await B(() => document.body.classList.contains('lock-everything') && document.getElementById('desk').inert), 'Lock everything: the board takes no taps or keys');
    await page.keyboard.type('xyz'); await page.waitForTimeout(800);
    ok(await notes() === 'Before' && await frame('notes:1').locator('#t').inputValue() === 'Before', 'typing goes nowhere, not even into the note that had the keyboard');
    await fresh();
    const before = await rolls();
    let p = await center('.win[data-ikey="dice:1"] iframe');
    await page.mouse.click(p.x, p.y + 60); await page.waitForTimeout(1500);
    ok(await rolls() === before && await said('The board is locked.') === 1, 'a tap on a widget does nothing, and the message says “The board is locked.”');
    p = await center('.win[data-ikey="21timer:1"] iframe');
    await page.touchscreen.tap(p.x, p.y); await page.mouse.click(p.x, p.y + 20); await page.waitForTimeout(400);
    const app = page.frames().find(f => /ccsd21\.org/.test(f.url()));
    ok(app && await app.evaluate(() => window.__taps || 0) === 0, 'nor on a district app');
    p = await center('.win[data-ikey="clock:1"] .win-title');
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(300);
    ok(!await B(() => document.getElementById('menu').classList.contains('open')), 'nor on a window’s name');
    // Tab never reaches a window: only ▦ and the padlocks.
    const tabs = [];
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); tabs.push(await B(() => { const a = document.activeElement; return a.closest('#desk') ? 'desk' : a.tagName === 'IFRAME' ? 'frame' : (a.className || a.tagName); })); }
    ok(!tabs.includes('desk') && !tabs.includes('frame') && tabs.some(x => /lock-pad/.test(x)), `keys reach no window; Tab goes to the padlocks and ▦ only (${Array.from(new Set(tabs)).join(', ')})`);
    // ▦, the notes above it, the shape tip, messages' buttons.
    const g = await center('.picker-btn.right');
    await page.mouse.click(g.x, g.y); await page.waitForTimeout(250);
    ok(!await B(() => document.getElementById('panel').classList.contains('open')), '▦ opens nothing');
    const others = await B(() => {
      const out = {};
      for (const sel of ['.save-note.left', '#shape-hint']) {
        const el = document.querySelector(sel); if (!el) { out[sel] = 'missing'; continue; }
        const css = el.style.cssText;
        el.hidden = false; el.style.cssText += ';display:flex;left:600px;top:700px;width:200px;height:60px';
        const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        out[sel] = { inert: el.inert, hit: !!hit && el.contains(hit) };
        el.hidden = true; el.style.cssText = css;
      }
      return out;
    });
    ok(Object.values(others).every(o => o.inert && !o.hit), `the notes above ▦ and the shape tip take no taps (${JSON.stringify(others)})`);
    await B(() => window.__board21.mergeUI.say('Changed on the laptop.', { action: 'Board history', timeout: 8000, onAction() {} }));
    ok(await page.locator('#toasts .toast', { hasText: 'Changed on the laptop.' }).locator('button').count() === 0, 'a new message shows without its button');
    // Files and Paste: refused, and said. Never opened.
    await fresh(); await drop('Science.21board'); await page.waitForTimeout(400);
    ok(!await page.locator('#modal.open').count() && await said('The board is locked.') === 1 && await B(() => window.__board21.pages.ids().length === 3), 'a .21board file dropped: refused, “The board is locked.”, no question');
    await fresh(); n = await count('image'); await drop('Frog.png', 'image/png'); await paste(); await page.waitForTimeout(500);
    ok(await count('image') === n && await said('The board is locked.') === 1, 'a picture dropped or pasted: refused, and said');
    const dragOk = await B(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'Science.21board')); const e = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    ok(dragOk, 'the drop is still taken, so the browser doesn’t open the file in place of 21Board');
    // A timer keeps running.
    await page.waitForTimeout(1500);
    const t1 = await timeLeft();
    ok(t1 !== t0, `a timer keeps counting down (${t0} → ${t1})`);
    await page.screenshot({ path: OUT + 'lock-everything.png' });

    // ---- The top corners for widgets: a window that fills the board is told how far the padlocks reach.
    await unlockBoard(page);
    const again = await frame('dice:1').locator('#roll').click({ timeout: 3000 }).then(() => true, () => false);
    ok(again && await B(() => !document.getElementById('desk').inert && !document.body.classList.contains('lock-everything')), 'unlocked: windows take taps again');
    await B(() => window.__board21.setMaximized('notes:1', true)); await page.waitForTimeout(500);
    const info = () => frame('notes:1').locator('html').evaluate(() => Board21.window.getInfo());
    let i = await info();
    ok(i.corners && i.corners.top && i.corners.top.left === 0 && i.corners.top.right === 0 && i.corners.top.height === 0 && i.corners.height > 0, `unlocked, a window that fills the board hears of its bottom corners, and its top ones are clear (${JSON.stringify(i.corners)})`);
    await lockBoard(page, 'widgets');
    await page.waitForTimeout(400);
    const want = await B(() => { const l = document.querySelector('.lock-pad.left').getBoundingClientRect(), r = document.querySelector('.lock-pad.right').getBoundingClientRect(), f = document.querySelector('.win[data-ikey="notes:1"] iframe').getBoundingClientRect();
      return { left: Math.ceil(l.right - f.left), right: Math.ceil(f.right - r.left), height: Math.ceil(Math.max(l.bottom, r.bottom) - f.top) }; });
    i = await info();
    ok(i.corners && JSON.stringify(i.corners.top) === JSON.stringify(want) && want.height > 0, `locked, it hears how far the padlocks reach into its top corners, below its title bar (${JSON.stringify(i.corners && i.corners.top)}; ${JSON.stringify(want)})`);
    const hits = await B(() => ['left', 'right'].map(s => { const r = document.querySelector(`.lock-pad.${s}`).getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && !!e.closest('.lock-pad'); }));
    ok(hits.every(Boolean), 'the padlocks sit over the window that fills the board, at the ends of its title bar');
    await page.screenshot({ path: OUT + 'lock-fill.png' });
    await unlockBoard(page); await page.waitForTimeout(300);
    i = await info();
    ok(i.corners && i.corners.top.height === 0, 'unlocked again: clear');
    // The built-in widgets keep clear of the padlocks, filling the board: the Calculator's keys, the Name Picker's Done
    // (its list of names), the Video Player's video and the First/Then Board's buttons start below them.
    await B(() => window.__board21.setMaximized('notes:1', false));
    const below = { calculator: () => { const g = document.getElementById('grid'); return g.getBoundingClientRect().top + parseFloat(getComputedStyle(g).paddingTop); },
      'name-picker': () => document.getElementById('done').getBoundingClientRect().top,
      'youtube-player': () => parseFloat(getComputedStyle(document.getElementById('player')).getPropertyValue('--clear-top')) || 0,
      'first-then-board': () => document.querySelector('.top-nav').getBoundingClientRect().top };
    for (const [id, fn] of Object.entries(below)) {
      const ik = await B(id => window.__board21.openWidget(id), id); await page.waitForTimeout(1500);
      await B(ik => window.__board21.setMaximized(ik, true), ik); await page.waitForTimeout(600);
      const f = frame(ik).locator('html'), top = await B(ik => document.querySelector(`.win[data-ikey="${ik}"] iframe`).getBoundingClientRect().top, ik);
      const was = await f.evaluate(fn);
      await lockBoard(page, 'widgets'); await page.waitForTimeout(600);
      const now = await f.evaluate(fn), pad = await B(() => document.querySelector('.lock-pad.left').getBoundingClientRect().bottom);
      const clear = id === 'youtube-player' ? was === 0 && Math.abs(top + now - pad) <= 1 : was < pad - top && top + now >= pad;
      ok(clear, `${id}, filling the board: below the padlocks while locked, and as before unlocked (${Math.round(was)} → ${Math.round(now)}; padlocks end ${Math.round(pad - top)} into it)`);
      await unlockBoard(page);
      ok(Math.abs(await f.evaluate(fn) - was) <= 1, `${id}: unlocked, back as it was`);
      await B(ik => window.__board21.closeWin(ik, { quiet: true }), ik); await page.waitForTimeout(300);
    }
    // ---- The shape tip (a 16:9 board in a wide window): hidden while the board is locked, either way. Its Fill the
    // window would change the board's shape, and with it where every window is.
    await page.setViewportSize({ width: 1500, height: 560 });
    await B(() => window.__board21.setBoardShape('16:9')); await page.waitForTimeout(500);
    const tipShown = () => B(() => { const h = document.getElementById('shape-hint'); return !h.hidden && getComputedStyle(h).display !== 'none' && h.getBoundingClientRect().width > 0; });
    ok(await tipShown(), 'unlocked, a 16:9 board in a wide window shows the shape tip');
    for (const mode of ['widgets', 'all']) {
      await lockBoard(page, mode); await page.waitForTimeout(300);
      const hid = !await tipShown();
      await B(() => document.querySelector('#shape-hint [data-act="unlock"]').click()); await page.waitForTimeout(300);
      const shape = await B(() => window.__board21.state.board.shape);
      ok(hid && shape === '16:9', `${mode === 'all' ? 'Lock everything' : 'Widgets still work'}: no shape tip, and its Fill the window changes nothing (${hid ? 'hidden' : 'shown'}, ${shape})`);
      await unlockBoard(page);
    }
    ok(await tipShown(), 'unlocked: the tip is back');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  ['Stay awake (off, on, hidden and shown again, the device saying no, an older school-hours setting, kiosk)', async (browser) => {
    // A stand-in for navigator.wakeLock (headless Chromium has no screen to keep on). It counts requests and
    // releases, lets the lock go when the page is hidden (as browsers do), and can say no ('refuse') or be missing
    // ('none', or 'http': a page served over plain http, which browsers give none).
    // window.__show(false) hides the page (document.visibilityState), __show(true) shows it again.
    const WAKE_LOCK = mode => {
      const W = window.__wl = { requests: 0, releases: 0, held: new Set() };
      let vis = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => vis !== 'visible' });
      window.__show = on => { vis = on ? 'visible' : 'hidden'; if (!on) for (const l of Array.from(W.held)) l.release(); document.dispatchEvent(new Event('visibilitychange')); };
      if (mode === 'http') Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
      if (mode === 'none' || mode === 'http') { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined }); return; }
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async type => {
        W.requests++;
        if (mode === 'refuse') throw new DOMException('Wake Lock permission request denied', 'NotAllowedError');
        if (type !== 'screen' || vis !== 'visible') throw new DOMException('The requesting page is not visible', 'NotAllowedError');
        const l = new EventTarget();
        l.type = 'screen'; l.released = false;
        l.release = async () => { if (l.released) return; l.released = true; W.held.delete(l); W.releases++; l.dispatchEvent(new Event('release')); };
        W.held.add(l);
        return l;
      } } });
    };
    const errors = [];
    const W = page => page.evaluate(() => ({ requests: window.__wl.requests, releases: window.__wl.releases, held: window.__wl.held.size }));
    // The row as Settings shows it: the switch, the warning while it's on, and a status line only when it isn't working.
    const row = page => page.evaluate(() => { const r = document.querySelector('#settings .awake-row'), sw = r.querySelector('[data-act="awake"]'), warn = r.querySelector('#set-awake-warn'), st = document.getElementById('set-awake-status');
      const h = [...document.querySelectorAll('#settings h3')].filter(e => e.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
      return { section: h && h.textContent, label: r.querySelector('.lbl').textContent, role: sw.getAttribute('role'), on: sw.getAttribute('aria-checked') === 'true', disabled: sw.disabled, choices: r.querySelectorAll('.seg, input').length, describedBy: sw.getAttribute('aria-describedby') || '',
        warn: warn ? (warn.querySelector('.status-dot.warn') ? '(warn) ' : '') + warn.textContent.trim() : '', status: st.hidden ? '' : (st.querySelector('.status-dot.warn') ? '(warn) ' : '') + st.textContent.trim() }; });
    const settings = page => openSettings(page, [], 'right');
    const fresh = async (mode, opts = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      await ctx.addInitScript(WAKE_LOCK, mode || 'ok');
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE + (opts.kiosk ? '?kiosk=yes' : '')); await boardUp(page); await page.waitForTimeout(300);
      return { ctx, page };
    };
    let { ctx, page } = await fresh();
    let w = await W(page);
    ok(w.requests === 0 && await page.evaluate(() => window.__board21.state.settings.awake) === 'off', 'off by default: nothing is asked of the device');
    await settings(page);
    let r = await row(page);
    ok(r.section === 'Classroom' && r.label === 'Stay awake' && r.role === 'switch' && !r.on && !r.disabled && !r.choices && !r.warn && !r.status,
      `Settings → Classroom → “Stay awake” is a switch, off, with no school hours, warning or status line (${JSON.stringify(r)})`);
    await page.click('#settings [data-act="awake"]'); await page.waitForTimeout(300);
    w = await W(page); r = await row(page);
    ok(w.requests === 1 && w.held === 1 && await page.evaluate(() => window.__board21.state.settings.awake) === 'on', 'On: one screen wake lock is held while 21Board is showing');
    ok(r.on && r.warn === '(warn) This makes your account less secure.' && !r.status, `and Settings warns, with an amber dot: “${r.warn}” (no status line: it works)`);
    // Hidden (another tab, the lid closed): the browser lets the lock go. Shown again: 21Board asks again.
    await page.evaluate(() => window.__show(false)); await page.waitForTimeout(250);
    w = await W(page);
    ok(w.held === 0 && w.requests === 1, 'hidden: the browser lets it go, and 21Board doesn’t ask while hidden');
    await page.evaluate(() => window.__show(true)); await page.waitForTimeout(300);
    w = await W(page);
    ok(w.held === 1 && w.requests === 2, `shown again: it is asked for again (${w.requests} requests)`);
    // The device takes it back while 21Board is showing (some browsers do on leaving fullscreen): asked for again.
    await page.evaluate(() => { [...window.__wl.held][0].release(); document.dispatchEvent(new Event('fullscreenchange')); }); await page.waitForTimeout(300);
    w = await W(page);
    ok(w.held === 1 && w.requests === 3, 'taken back by the device: asked for again on fullscreenchange');
    // Remembered; this device only.
    await page.reload(); await boardUp(page); await page.waitForTimeout(400);
    w = await W(page);
    ok(w.held === 1 && w.requests === 1, 'after a reload the screen is kept on from the start');
    const file = await page.evaluate(async () => JSON.stringify(await window.__board21.buildExport('full')));
    ok(!/"awake(From|To)?"\s*:/.test(file), 'the setting belongs to this device: it isn’t in exports');
    await settings(page);
    await page.click('#settings [data-act="awake"]'); await page.waitForTimeout(300);
    w = await W(page); r = await row(page);
    ok(w.held === 0 && w.releases === 1 && !r.on && !r.warn && !r.status && !r.describedBy, 'Off lets it go, and the warning goes (the switch is described by nothing)');
    await page.evaluate(() => window.__show(false)); await page.evaluate(() => window.__show(true)); await page.waitForTimeout(300);
    ok((await W(page)).requests === 1, 'and nothing is asked for when 21Board shows again');
    // A screen reader hears the warning too: turned on from the keyboard, Settings is drawn afresh with the keyboard
    // back on the switch, and the switch is described by the warning.
    await page.focus('#settings [data-act="awake"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const a11y = await page.evaluate(() => { const sw = document.activeElement, d = sw && document.getElementById(sw.getAttribute('aria-describedby') || '-');
      return { act: sw && sw.dataset.act, on: sw && sw.getAttribute('aria-checked'), said: d ? d.textContent.trim() : '' }; });
    ok(a11y.act === 'awake' && a11y.on === 'true' && a11y.said === 'This makes your account less secure.', `turned on from the keyboard, the switch keeps the keyboard and is described by the warning (${JSON.stringify(a11y)})`);
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    // A device that had school hours (an older 21Board: 'hours', with a From and To) keeps the screen on: the times go.
    await page.keyboard.press('Escape');
    await page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const t = o.result.transaction('records', 'readwrite'), st = t.objectStore('records'), g = st.get('settings');
      g.onsuccess = () => { const rec = g.result; rec.value = Object.assign({}, rec.value, { awake: 'hours', awakeFrom: '07:30', awakeTo: '15:30' }); rec.rev += 1000; st.put(rec); }; t.oncomplete = () => { o.result.close(); res(); }; }; }));
    await page.reload(); await boardUp(page); await page.waitForTimeout(400);
    const st = await page.evaluate(() => { const s = window.__board21.state.settings; return { awake: s.awake, from: 'awakeFrom' in s, to: 'awakeTo' in s }; });
    w = await W(page);
    await settings(page); r = await row(page);
    ok(st.awake === 'on' && !st.from && !st.to && w.held === 1 && r.on, `an older “School hours” reads as on, and its times are dropped (${JSON.stringify(st)}, ${w.held} held)`);
    await page.click('#settings [data-act="awake"]'); await page.waitForTimeout(800);
    const kept = await page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const q = o.result.transaction('records').objectStore('records').get('settings'); q.onsuccess = () => { o.result.close(); res(q.result.value); }; }; }));
    ok(kept.awake === 'off' && !('awakeFrom' in kept) && !('awakeTo' in kept), 'and they are gone from the saved settings once they change');
    await ctx.close();

    // The device says no (IT's policy, a battery saver): Settings says so, nothing breaks, and it tries again each minute.
    ({ ctx, page } = await fresh('refuse'));
    await page.clock.install({ time: new Date('2026-11-12T10:00:00') });
    await page.reload(); await boardUp(page);
    await settings(page);
    await page.click('#settings [data-act="awake"]'); await page.waitForTimeout(400);
    r = await row(page);
    ok(r.status === '(warn) This device didn’t allow it. Its settings or your school’s IT may block it.' && r.on, `refused: Settings says the device didn’t allow it (${r.status})`);
    const tries = (await W(page)).requests;
    await page.clock.runFor(61000); await page.waitForTimeout(300);
    ok(tries === 1 && (await W(page)).requests === 2, 'and it tries again on the next minute');
    await ctx.close();

    // A browser that can't do it: the row explains, its switch can't be turned on, and nothing throws.
    ({ ctx, page } = await fresh('none'));
    await settings(page);
    r = await row(page);
    ok(r.disabled && r.status === '(warn) This browser can’t keep the screen on.' && !r.warn, `unsupported: “${r.status}”, and the switch is greyed out`);
    // Left on, and saved, where it could be done (this device's browser before an update, or IT's policy, took it
    // away): 21Board starts as usual, the switch shows it on, greyed out, with the reason, and nothing breaks.
    await page.keyboard.press('Escape');
    await page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const t = o.result.transaction('records', 'readwrite'), st = t.objectStore('records'), g = st.get('settings');
      g.onsuccess = () => { const rec = g.result || { key: 'settings', type: 'settings', rev: 0, value: {} }; rec.value = Object.assign({}, rec.value, { awake: 'on' }); rec.rev += 1000; st.put(rec); }; t.oncomplete = () => { o.result.close(); res(); }; }; }));
    await page.reload(); await boardUp(page); await page.waitForTimeout(400);
    const left = await page.evaluate(() => window.__board21.state.settings.awake);
    await settings(page); r = await row(page);
    ok(left === 'on' && r.on && r.disabled && r.status === '(warn) This browser can’t keep the screen on.' && !r.warn && !r.describedBy && (await W(page)).requests === 0 && await page.locator('.picker-btn.right').isVisible() && !errors.length,
      `a setting left on starts nothing and breaks nothing: 21Board opens, and the switch shows on, greyed out, with the reason (${JSON.stringify(r)})`);
    await ctx.close();

    // Served over plain http (a school server without https): the browser gives no wake lock there. It's https that
    // is missing, not the browser that can't.
    ({ ctx, page } = await fresh('http'));
    await settings(page);
    r = await row(page);
    ok(r.disabled && r.status === '(warn) Needs https to keep the screen on.', `over http: “${r.status}”, and the switch is greyed out`);
    await ctx.close();

    // Kiosk mode: no one is signed in, so there's no account to make less secure: no warning.
    ({ ctx, page } = await fresh('ok', { kiosk: true }));
    await settings(page);
    await page.click('#settings [data-act="awake"]'); await page.waitForTimeout(300);
    r = await row(page);
    ok(r.on && !r.warn && !r.status && (await W(page)).held === 1, 'in kiosk mode it keeps the screen on with no warning (no one is signed in)');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ];
};
