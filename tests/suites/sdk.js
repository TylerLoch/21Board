// The widget SDK, the dev window, and Developer mode.
'use strict';
module.exports = T => {
  const {
    http, fs, path, ROOT, OUT, ok, freeBoard, openSettings, lockBoard, unlockBoard, fillNote, DEV_WIDGET, AWAY,
    DRIVE_PICK, readFolder, eventually, readHistory, release, stamped, STAMPED, boardUp, stubVideos, picOpen,
    picFile, drawPic, wordsOf, BASE
  } = T;
  return [
  ['SDK, developer mode, standalone', async (browser) => {
  const disp = (page, ik) => page.evaluate(ik => Object.assign({}, window.__board21.state.wins.get(ik).disp), ik);
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + ''); await page.waitForTimeout(500); await freeBoard(page);
    ok(!(await page.evaluate(() => window.__board21.catalog().filter(a => a.devOnly).length && document.querySelector('[data-widget="sdk-playground"]'))), 'dev widget hidden by default');
    // turn on developer mode in settings
    await openSettings(page, ['advanced']);
    await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.click('.picker-btn.left'); await page.waitForTimeout(150);
    ok(await page.locator('[data-widget="sdk-playground"]').count() === 1, 'developer mode shows SDK Playground');
    await page.click('[data-widget="sdk-playground"]'); await page.waitForTimeout(1000);
    const f = page.frameLocator('.win[data-ikey="sdk-playground:1"] iframe');
    // On the board every window is English, with <html lang> and translate="no" from the SDK.
    const en = await f.locator('html').evaluate(() => ({ language: Board21.language, locale: Board21.locale, ctx: Board21.context && Board21.context.language, html: document.documentElement.lang, translate: document.documentElement.getAttribute('translate') }));
    ok(en.language === 'en' && en.locale === 'en-US' && en.ctx === 'en' && en.html === 'en-US' && en.translate === 'no', `on the board a window is English, <html lang="en-US" translate="no"> (${JSON.stringify(en)})`);
    // A call in the Playground, run with these values (its inputs, boxes and lists by their data-arg).
    const btn = async (name, args = {}) => {
      const c = f.locator(`[data-call="${name}"]`);
      for (const [k, v] of Object.entries(args)) {
        const el = c.locator(`[data-arg="${k}"]`);
        if (await el.evaluate(e => e.tagName === 'SELECT')) await el.selectOption(String(v)); else await el.fill(String(v));
      }
      await c.locator('.run').click();
    };
    const ik = 'sdk-playground:1';
    await btn('Board21.window.setSize', { width: 480, height: 320 }); await page.waitForTimeout(400);
    let d = await disp(page, ik);
    ok(d.w === 480 && d.h === 360, `setSize sets content size (${d.w}x${d.h - 40})`);
    await btn('Board21.window.setAspectRatio', { ratio: '16/9' }); await page.waitForTimeout(400);
    d = await disp(page, ik);
    ok(Math.abs(d.w / (d.h - 40) - 16 / 9) < 0.02, `setAspectRatio 16:9 (${d.w}x${d.h - 40})`);
    await btn('Board21.window.setAspectRatio', { ratio: '' });
    await btn('Board21.window.setResizable', { resizable: false }); await page.waitForTimeout(200);
    ok(await page.locator(`.win[data-ikey="${ik}"].no-resize`).count() === 1, 'setResizable(false) hides grips');
    await btn('Board21.window.setResizable', { resizable: true });
    await btn('Board21.window.setTitle', { text: new Date().toLocaleTimeString() }); await page.waitForTimeout(200);
    ok((await page.locator(`.win[data-ikey="${ik}"] .sub`).textContent()).length > 0, 'setTitle shows subtitle');
    await btn('Board21.window.requestAttention'); await page.waitForTimeout(200);
    ok(await page.locator(`.win[data-ikey="${ik}"].attention`).count() === 1, 'requestAttention pulses the title bar');
    await btn('Board21.menu.set', { items: JSON.stringify([{ id: 'a', label: 'Item A' }, { id: 'b', label: 'Checked B', checked: true }, { separator: true }, { id: 'c', label: 'Disabled C', disabled: true }]) }); await page.waitForTimeout(200);
    await page.click(`.win[data-ikey="${ik}"] .win-label`); await page.waitForTimeout(200);
    ok(await page.locator('#menu [data-act="widget"]').count() === 3, 'custom menu items appear in window menu');
    await page.screenshot({ path: OUT + '40-sdk-menu.png' });
    await page.click('#menu [data-id="a"]'); await page.waitForTimeout(200);
    ok(await f.locator('#log .entry[data-event="menu"]', { hasText: '"a"' }).count() === 1, 'menu selection reaches the widget');
    await btn('Board21.save', { data: '{"counter": 1}' }); await page.waitForTimeout(300);
    ok(await f.locator('[data-call="Board21.save"] .result').textContent() === 'null' && await page.evaluate(ik => JSON.stringify(window.__board21.state.data.get(ik)), ik) === '{"counter":1}', 'save resolves after commit');
    await btn('Board21.window.getInfo'); await page.waitForTimeout(200);
    ok((await f.locator('[data-call="Board21.window.getInfo"] .result').textContent()).includes('"width"'), 'getInfo returns window info');
    await btn('Board21.toast', { text: 'Hello from the SDK Playground' }); await page.waitForTimeout(200);
    ok(await page.locator('.toast:has-text("Hello from the SDK")').count() === 1, 'toast shows on the board');
    await btn('Board21.window.maximize'); await page.waitForTimeout(400);
    d = await disp(page, ik); ok(d.w === 1400 && d.h === 860, 'maximize()');
    await btn('Board21.window.restore'); await page.waitForTimeout(400);
    // dev: test an unregistered widget by uploading its file, with the button (Settings → Developer mode → Test a widget → Upload file…)
    await openSettings(page, ['advanced']);
    const devChooser = await Promise.all([page.waitForEvent('filechooser', { timeout: 3000 }), page.click('#settings [data-act="dev-upload"]', { timeout: 3000 })]).then(([c]) => c, () => null);
    ok(!!devChooser, 'Upload file… in Settings opens the file chooser');
    if (devChooser) await devChooser.setFiles(path.join(ROOT, 'widgets', '_template', 'index.html'));
    await eventually(() => page.evaluate(() => Array.from(window.__board21.state.wins.values()).some(w => w.widget.dev && w.connected)));
    const devWin = await page.evaluate(() => Array.from(window.__board21.state.wins.values()).filter(w => w.widget.dev).map(w => [w.ikey, w.connected, w.widget.sealed]));
    ok(devWin.length === 1 && devWin[0][1] && devWin[0][2], 'developer can test an unregistered widget by uploading its file (it runs sealed off): ' + JSON.stringify(devWin));
    await btn('Board21.window.close'); await page.waitForTimeout(400);
    ok(!(await page.evaluate(ik => window.__board21.state.wins.has(ik), ik)), 'close() from the widget closes its window');

    // ---- standalone widget
    const sp = await ctx.newPage();
    const t0 = Date.now();
    await sp.goto(BASE + 'widgets/timer/index.html#b21-bare'); await sp.waitForFunction(() => window.Board21 && Board21.context, null, { timeout: 3000 });
    ok(await sp.evaluate(() => Board21.context.standalone === true && !document.getElementById('b21-dev')) && Date.now() - t0 < 2500, 'with #b21-bare a widget runs on its own, at once');
    // ---- The Timer's words: its chips, their names, and its buttons' names, in English and in Russian, each as its
    // words.js has them (wordsOf).
    const timerWords = p => p.evaluate(() => {
      const chips = [...document.querySelectorAll('#chips button')];
      return { html: document.documentElement.lang, chips: chips.map(b => b.textContent).join(), names: chips.map(b => b.getAttribute('aria-label')).join(), spill: chips.filter(b => b.scrollWidth > b.clientWidth).map(b => b.textContent),
        buttons: ['minus', 'go', 'reset', 'plus'].map(id => document.getElementById(id).getAttribute('aria-label')).join(), words: Board21.__words() };
    });
    const MINS = [1, 2, 3, 5, 10, 15], NUMBERS = MINS.join();
    const timerIn = lang => { const w = wordsOf('timer', lang);
      return { chips: MINS.map(n => w.t('chip.min', { n })).join(), names: MINS.map(n => w.t('chip.label', { n })).join(), buttons: ['minus', 'b21.start', 'b21.reset', 'plus'].map(k => w.t(k)).join(), pause: w.t('b21.pause'), minus: w.t('minus') }; };
    const EN = timerIn('en'), RU = timerIn('ru'), ES = timerIn('es');
    const clean = w => !!w && !w.missing.length && !w.fallback.length;
    let tw = await timerWords(sp);
    ok(tw.html === 'en-US' && tw.chips === EN.chips && tw.names === EN.names && tw.buttons === EN.buttons && clean(tw.words),
      `the Timer on its own, in English: its chips, their names, and its buttons (${JSON.stringify(tw)})`);
    await sp.setViewportSize({ width: 240, height: 214 }); await sp.waitForTimeout(200);
    tw = await timerWords(sp);
    ok(tw.chips === EN.chips && !tw.spill.length, `at 240 × 214 the English chips keep their words (${tw.chips})`);
    await sp.setViewportSize({ width: 1400, height: 860 });
    await sp.click('#go'); await sp.waitForTimeout(300); await sp.reload(); await sp.waitForTimeout(500);
    ok(await sp.evaluate(() => (JSON.parse(localStorage.getItem('21board:standalone:timer')) || {}).data.endsAt > 0), 'standalone save persists to localStorage (by widget id)');
    await sp.evaluate(() => localStorage.removeItem('21board:standalone:timer'));   // (so the Timers below start stopped)
    const own = async (url, w, h) => {
      const p = await ctx.newPage();
      p.on('pageerror', e => errors.push(url + ': ' + e.message));
      await p.setViewportSize({ width: w, height: h });
      await p.goto(BASE + url); await p.waitForFunction(() => window.Board21 && Board21.context, null, { timeout: 3000 }); await p.waitForTimeout(150);
      return p;
    };
    const rp = await own('widgets/timer/index.html#b21-bare&b21-lang=ru', 380, 260);
    tw = await timerWords(rp);
    ok(tw.html === 'ru-RU' && tw.buttons === RU.buttons && tw.chips === RU.chips && tw.names === RU.names && clean(tw.words),
      `with #b21-lang=ru the Timer is in Russian: its buttons, chips, and their names (${JSON.stringify(tw)})`);
    await rp.click('#go'); await rp.waitForTimeout(300);
    const ru = await rp.evaluate(() => ({ go: document.getElementById('go').getAttribute('aria-label'), n: Board21.format.number(1234.5),
      times: [[9, 5], [15, 5], [20, 5], [12, 0]].map(([h, m]) => Board21.format.date(new Date(2026, 10, 27, h, m), { hour: 'numeric', minute: '2-digit' }).replace(/[  ]/g, ' ')).join(), words: Board21.__words() }));
    ok(ru.go === RU.pause && ru.times === '9:05 утра,3:05 дня,8:05 вечера,12:00 дня' && ru.n === '1,234.5' && clean(ru.words), `a tap names it ${RU.pause}; times of day in words, and numbers in English form (${JSON.stringify(ru)})`);
    // The chip fallback, at 240 × 214: the words if they fit, else the bare numbers, all six alike, names kept. Then
    // words three times as long, so they spill whatever the words file holds; then the real words again at 380 × 260.
    await rp.setViewportSize({ width: 240, height: 214 }); await rp.waitForTimeout(200);
    const small = await timerWords(rp);
    await rp.evaluate(() => { Board21.words({ window: { 'chip.min': { en: '{n} minutes long', es: '{n} minutos largos', ru: '{n} долгих минут', uk: '{n} довгих хвилин' } } }); dispatchEvent(new Event('resize')); });
    await rp.waitForTimeout(100);
    const long = await timerWords(rp);
    await rp.evaluate(row => { Board21.words({ window: { 'chip.min': row } }); }, wordsOf('timer', 'ru').table.window['chip.min']);
    await rp.setViewportSize({ width: 380, height: 260 }); await rp.waitForTimeout(200);
    tw = await timerWords(rp);
    ok([RU.chips, NUMBERS].includes(small.chips) && !small.spill.length && small.names === RU.names && long.chips === NUMBERS && !long.spill.length && long.names === RU.names && tw.chips === RU.chips,
      `at 240 × 214 a chip whose words spill shows its bare number, all six alike, with the same names; at 380 × 260 the words come back (${small.chips}; ${long.chips}; ${tw.chips})`);
    // A frame the board names for Spanish: the SDK reads the language from the name, before the board says anything.
    await rp.evaluate(() => { const fr = document.createElement('iframe'); fr.name = 'b21-board:timer:1;es'; fr.src = 'index.html'; fr.style.cssText = 'position:fixed;left:0;top:0;width:380px;height:260px;border:0'; document.body.append(fr); });
    await rp.waitForFunction(() => { try { const w = document.querySelector('iframe').contentWindow; return !!w.Board21 && w.document.readyState !== 'loading'; } catch (e) { return false; } }, null, { timeout: 3000 });
    const es = await rp.evaluate(() => { const fr = document.querySelector('iframe'), w = fr.contentWindow, d = w.document;
      const r = { language: w.Board21.language, context: w.Board21.context, minus: d.getElementById('minus').getAttribute('aria-label'), chips: [...d.querySelectorAll('#chips button')].map(b => b.textContent).join() }; fr.remove(); return r; });
    ok(es.language === 'es' && es.context === null && es.minus === ES.minus && es.chips === ES.chips, `a frame named b21-board:timer:1;es is in Spanish before the board says anything (${JSON.stringify(es)})`);
    await rp.close();
    // Opened straight at a small size, the chips fit at once, as after a resize: the first fit waits for the window's font.
    for (const [w, h] of [[240, 400], [260, 214]]) {
      const p = await own('widgets/timer/index.html#b21-bare&b21-lang=ru', w, h);
      const atLoad = await timerWords(p);
      await p.evaluate(() => dispatchEvent(new Event('resize'))); await p.waitForTimeout(100);
      const after = await timerWords(p);
      ok(!atLoad.spill.length && atLoad.chips === after.chips, `the Russian Timer opened at ${w} × ${h}: its chips fit at once (${atLoad.chips} | ${JSON.stringify(atLoad.spill)}; after a resize ${after.chips})`);
      await p.close();
    }
    const TL = wordsOf('traffic-light', 'uk');
    const up = await own('widgets/traffic-light/index.html#b21-bare&b21-lang=uk', 170, 380);
    const uk = await up.evaluate(() => ({ html: document.documentElement.lang, names: [...document.querySelectorAll('.lamp')].map(b => b.getAttribute('aria-label')).join() }));
    ok(uk.html === 'uk-UA' && uk.names === ['red', 'yellow', 'green'].map(k => TL.t(k)).join(), `the Traffic Light in Ukrainian names its lamps (${JSON.stringify(uk)})`);
    await up.close();
    // A page of a developer's own, written in Spanish: its <html lang> stays while the window is English. In another
    // language the window's wins. And data-t words go in as the page loads, so English never shows while a slow script
    // holds back DOMContentLoaded.
    let letGo; const slow = new Promise(r => { letGo = r; });
    await ctx.route(BASE + '__test/slow.js', async r => { await slow; await r.fulfill({ contentType: 'text/javascript', body: '' }).catch(() => {}); });
    await ctx.route(BASE + '__test/own.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><script src="../sdk/board21.js"></script>
<script>Board21.words({ window: { hello: { en: 'Hello there', es: 'Hola', ru: 'Привет', uk: 'Привіт' } } });</script></head>
<body><p id="p" data-t="hello" data-t-title="hello" title="Hello there">Hello there</p><script src="slow.js"></script></body></html>` }));
    const ep = await ctx.newPage();
    ep.on('pageerror', e => errors.push('own.html: ' + e.message));
    const loading = ep.goto(BASE + '__test/own.html#b21-bare&b21-lang=uk').catch(() => {});
    await ep.waitForFunction(() => !!document.getElementById('p'), null, { timeout: 3000 });
    const early = await ep.evaluate(() => ({ state: document.readyState, text: document.getElementById('p').textContent, title: document.getElementById('p').title, html: document.documentElement.lang }));
    letGo(); await loading;
    ok(early.state === 'loading' && early.text === 'Привіт' && early.title === 'Привіт' && early.html === 'uk-UA', `data-t words go in as the page loads, before DOMContentLoaded (${JSON.stringify(early)})`);
    await ep.goto(BASE + '__test/own.html#b21-bare'); await ep.reload(); await ep.waitForFunction(() => window.Board21 && Board21.context, null, { timeout: 3000 });
    const mine = await ep.evaluate(() => [document.documentElement.lang, document.documentElement.getAttribute('translate')]);
    ok(mine.join() === 'es,no', `a page written in Spanish keeps <html lang="es"> while its window is English (${mine})`);
    await ep.close(); await ctx.unroute(BASE + '__test/slow.js'); await ctx.unroute(BASE + '__test/own.html');
    // The pseudo language: every word from the table, so English left over or a word cut off shows.
    const audit = async (p, what) => {
      const a = await p.evaluate(() => ({ html: document.documentElement.lang, audit: Board21.__audit(), words: Board21.__words() }));
      ok(a.html === 'en-XA' && !a.audit.missed.length && !a.audit.cut.length && clean(a.words), `${what} in the pseudo language: no English left, and nothing cut off (${JSON.stringify(a)})`);
    };
    const qp = await own('widgets/timer/index.html#b21-bare&b21-lang=qps', 380, 260);
    await audit(qp, 'the Timer at 380 × 260');
    await qp.setViewportSize({ width: 240, height: 214 }); await qp.waitForTimeout(200);
    await audit(qp, 'the Timer at 240 × 214');
    await qp.close();
    const ql = await own('widgets/traffic-light/index.html#b21-bare&b21-lang=qps', 170, 380);
    await audit(ql, 'the Traffic Light at 170 × 380');
    await ql.close();

    // ---- phone width: no horizontal overflow of the panel
    const ph = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true });
    const pp = await ph.newPage(); await pp.goto(BASE + ''); await pp.waitForTimeout(500); await freeBoard(pp);
    await pp.click('.picker-btn.right'); await pp.waitForTimeout(250);
    const pb = await pp.locator('#panel').boundingBox();
    ok(pb.x >= 0 && pb.x + pb.width <= 375, `panel fits at phone width (${Math.round(pb.x)}..${Math.round(pb.x + pb.width)})`);
    await pp.screenshot({ path: OUT + '41-phone-panel.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));

    // ---- A device from before Upload file… was the only way: its settings still list a widget added by its path
    // on the site (settings.devWidgets), and that widget's window is open, with content.
    {
      const oc = await browser.newContext({ viewport: { width: 1400, height: 860 }, serviceWorkers: 'block' });   // (every request is seen below)
      const op = await oc.newPage(), oerr = [], asked = [];
      op.on('pageerror', e => oerr.push(e.message));
      op.on('request', r => asked.push(r.url()));
      await op.goto(BASE); await op.waitForTimeout(600);
      await op.goto(BASE + 'icons/icon-192.png');   // (the board isn't running while its records are written)
      await op.evaluate(() => new Promise((res, rej) => {
        const o = indexedDB.open('21Board');
        o.onerror = () => rej(o.error);
        o.onsuccess = () => {
          const t = o.result.transaction('records', 'readwrite'), s = t.objectStore('records'), at = Date.now();
          const rec = (key, type, value) => s.put({ key, type, rev: at, updatedAt: at, by: 'older-release', value });
          rec('settings', 'settings', { theme: 'light', devMode: true, devWidgets: [{ id: 'dev-widgets-template', name: 'Template (test)', entry: 'widgets/_template/index.html' }], activeBoard: 1, boards: [1] });
          rec('inst:1:dev-widgets-template:1', 'inst', { widgetId: 'dev-widgets-template', n: 1, open: true, rect: { x: 40, y: 40, w: 400, h: 340 }, z: 1, maximized: false, createdAt: at });
          rec('data:1:dev-widgets-template:1', 'data', { text: 'from the older release' });
          t.oncomplete = () => { o.result.close(); res(); };
          t.onerror = () => rej(t.error);
        };
      }));
      asked.length = 0;
      await op.goto(BASE); await op.waitForFunction(() => window.__board21 && window.__board21.store.loaded); await op.waitForTimeout(1200);
      const st = await op.evaluate(() => { const b = window.__board21, s = b.state; return { listed: b.catalog().some(a => a.id === 'dev-widgets-template'), win: s.wins.has('dev-widgets-template:1') || !!document.querySelector('.win[data-ikey^="dev-"]'),
        opened: !!b.openWidget('dev-widgets-template'), kept: 'devWidgets' in s.settings, devMode: s.settings.devMode, inst: s.insts.has('dev-widgets-template:1') }; });
      await op.click('.picker-btn.left'); await op.waitForTimeout(200);
      const inPicker = await op.locator('[data-widget="dev-widgets-template"]').count() + await op.locator('#panel', { hasText: 'Template (test)' }).count();
      await op.keyboard.press('Escape');
      ok(!st.listed && !inPicker && !st.win && !st.opened && !asked.some(u => u.includes('widgets/_template/')) && !st.kept && st.devMode,
        `an older board’s widget added by its path isn’t in the catalog or the Widget Picker (Developer mode on), doesn’t open (its page isn’t even asked for), and the list is dropped (${JSON.stringify(st)})`);
      // Its window is kept like any window whose widget isn't installed: Settings lists it, to delete.
      await openSettings(op, ['saved']);
      const row = op.locator('#settings .inst', { has: op.locator('[data-act="inst-delete"][data-val="dev-widgets-template:1"]') });
      ok(st.inst && /dev-widgets-template 1\s*Widget not installed/.test(await row.innerText().catch(() => '')) && await row.locator('[data-act="inst-open"]').count() === 0 &&
        await op.locator('#settings [data-act="dev-remove"]').count() === 0, 'its window is listed in Settings as Widget not installed (with Delete, no Open), and not under Test a widget');
      await op.click('#settings [data-act="theme"][data-val="dark"]'); await op.waitForTimeout(400);
      const stored = () => op.evaluate(() => new Promise((res, rej) => { const o = indexedDB.open('21Board'); o.onerror = () => rej(o.error); o.onsuccess = () => { const q = o.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { o.result.close(); res(Object.fromEntries(q.result.map(r => [r.key, r.value]))); }; }; }));
      let recs = await stored();
      const exp = JSON.stringify(await op.evaluate(() => window.__board21.buildExport('full')));
      ok(recs.settings.theme === 'dark' && !('devWidgets' in recs.settings) && !exp.includes('devWidgets') && !exp.includes('_template'),
        'the next time the settings are saved, the old list is left out (exports never carried it)');
      await row.locator('[data-act="inst-delete"]').click(); await op.waitForTimeout(200);
      await op.locator('#modal.open .btn', { hasText: /^Delete$/ }).click(); await op.waitForTimeout(600);
      recs = await stored();
      ok(!('inst:1:dev-widgets-template:1' in recs) && !('data:1:dev-widgets-template:1' in recs) && await op.evaluate(() => !window.__board21.state.insts.has('dev-widgets-template:1')),
        'and Delete there removes the window and its content');
      await op.reload(); await op.waitForFunction(() => window.__board21 && window.__board21.store.loaded); await op.waitForTimeout(500);
      ok(await op.evaluate(() => { const b = window.__board21, s = b.state; return !b.catalog().some(a => a.dev) && !s.wins.size && !s.insts.has('dev-widgets-template:1') && !('devWidgets' in s.settings); }),
        'after a reload nothing of it comes back');
      if (oerr.length) ok(false, 'no page errors on the older board: ' + oerr.join(' | '));
      await oc.close();
    }
  }],
  ['SDK Playground: every call and event the SDK has, run with your own values (save and load, a menu from JSON with a heading and a checkmark, title, minimum size), bad JSON, copy as code, live state, the palette (theme, Custom… accent, text style), the log (timestamps, pretty JSON, filter, pause, clear, copy), the smallest window in every text style, the keyboard', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const ik = 'sdk-playground:1';
    const open = async () => {
      await page.evaluate(() => window.__board21.openWidget('sdk-playground'));
      await eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
      await page.evaluate(ik => window.__board21.setRect(ik, { x: 300, y: 40, w: 720, h: 560 }), ik);
    };
    await open();
    const f = page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const F = (fn, arg) => f.locator('html').evaluate(fn, arg);
    ok(await f.locator('[data-call="Board21.save"]').waitFor({ timeout: 5000 }).then(() => true, () => false), 'the Playground lists its calls');
    // Copying: what the Playground hands the clipboard.
    const stubClipboard = () => F(() => { window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } }); });
    await stubClipboard();
    const copied = () => F(() => window.__copied.slice());
    const tab = async t => { const b = f.locator(`[role="tab"][data-tab="${t}"]`); if (await b.isVisible()) await b.click(); };
    const call = name => f.locator(`[data-call="${name}"]`);
    // A call's values: its inputs, boxes and lists by their data-arg, or one of its ready examples.
    const setArgs = async (name, args = {}) => {
      for (const [k, v] of Object.entries(args)) {
        if (k === 'example') { await call(name).locator(`[data-example="${v}"]`).click(); continue; }
        const el = call(name).locator(`[data-arg="${k}"]`);
        if (await el.evaluate(e => e.tagName === 'SELECT')) await el.selectOption(String(v)); else await el.fill(String(v));
      }
    };
    const run = async (name, args) => { await tab('calls'); await setArgs(name, args); await call(name).locator('.run').click(); await page.waitForTimeout(300); };
    const result = name => call(name).locator('.result').textContent();
    const data = () => page.evaluate(ik => window.__board21.state.data.get(ik), ik);
    const disp = () => page.evaluate(ik => Object.assign({}, window.__board21.state.wins.get(ik).disp), ik);
    const doc = fs.readFileSync(path.join(ROOT, 'docs', 'WIDGET-SDK.md'), 'utf8');
    const between = (a, b) => { const i = doc.indexOf(a); return doc.slice(i, doc.indexOf(b, i)); };

    // ---- P1. Everything the SDK has and the guide documents: calls, events, the context and window info, menu items.
    const api = between('## API reference', '## Content vs. config');
    const calls = new Set(api.match(/Board21\.(?:window\.|menu\.|format\.)?[A-Za-z]+/g));
    for (const row of api.split('\n').filter(l => /^\| `Board21\./.test(l))) {   // (`Board21.window.maximize()` / `restore()`)
      const cell = row.split('|')[1], pre = /`(Board21\.(?:window\.|menu\.|format\.)?)/.exec(cell)[1];
      for (const m of cell.matchAll(/`([A-Za-z]+)\(/g)) calls.add(pre + m[1]);
    }
    const live = await F(() => [].concat(Object.keys(Board21).filter(k => k !== 'window' && k !== 'menu' && k !== 'format').map(k => 'Board21.' + k),
      Object.keys(Board21.window).map(k => 'Board21.window.' + k), Object.keys(Board21.menu).map(k => 'Board21.menu.' + k), Object.keys(Board21.format || {}).map(k => 'Board21.format.' + k)));
    live.forEach(c => calls.add(c));
    const shown = await F(() => [...document.querySelectorAll('[data-call]')].filter(c => c.querySelector('.run') && c.querySelector('.code') && c.querySelector('.copy')).map(c => c.dataset.call));
    let missing = [...calls].filter(c => !shown.includes(c));
    ok(calls.size >= 27 && !missing.length, `every call the SDK has and the guide documents is there, with its code, Copy and Run (${calls.size} calls${missing.length ? '; missing: ' + missing.join(', ') : ''})`);
    const groups = await F(() => [...document.querySelectorAll('.group')].map(g => [g.querySelector('h2').textContent.trim(), g.querySelectorAll('[data-call]').length]));
    ok(groups.length >= 5 && groups.every(([n, c]) => n && n.length <= 12 && c > 0), `in short groups (${groups.map(g => g.join(' ')).join(', ')})`);
    const events = [...new Set(between('### Events', '### Other').split('\n').filter(l => /^\| `/.test(l)).flatMap(l => [...l.split('|')[1].matchAll(/`([a-z]+)`/g)].map(m => m[1])))];
    const evs = await F(() => ({ filter: [...document.querySelectorAll('#filter option')].map(o => o.value),
      on: [...document.querySelectorAll('[data-call="Board21.on"] [data-arg="event"] option')].map(o => o.value),
      off: [...document.querySelectorAll('[data-call="Board21.off"] [data-arg="event"] option')].map(o => o.value) }));
    missing = events.filter(e => !evs.filter.includes(e) || !evs.on.includes(e) || !evs.off.includes(e));
    ok(events.length === 10 && !missing.length, `every event (${events.join(', ')}) can be shown in the log, and turned on and off${missing.length ? '; missing: ' + missing.join(', ') : ''}`);
    const ctxDoc = between('The **context**:', '### Saving');
    const ctxKeys = [...ctxDoc.matchAll(/^\s+([a-zA-Z]+):/gm)].map(m => m[1]);
    const winKeys = /window: \{ ([^}]+) \}/.exec(ctxDoc)[1].split(',').map(s => s.trim());
    const st0 = await F(() => ({ keys: [...document.querySelectorAll('#state [data-key]')].map(e => e.dataset.key), wkeys: [...document.querySelectorAll('#state [data-wkey]')].map(e => e.dataset.wkey) }));
    missing = ctxKeys.filter(k => !st0.keys.includes(k)).concat(winKeys.filter(k => !st0.wkeys.includes(k)).map(k => 'window.' + k));
    ok(ctxKeys.length >= 15 && ctxKeys.includes('kiosk') && winKeys.includes('zoom') && winKeys.includes('corners') && !missing.length,
      `State shows every key of the context (${ctxKeys.length}) and of window info (${winKeys.join(', ')})${missing.length ? '; missing: ' + missing.join(', ') : ''}`);
    const menuDoc = between('### Window menu', '### Events');
    const itemKeys = [...new Set([...menuDoc.split('```').filter((b, i) => i % 2).join('\n').matchAll(/\b([a-z]+): /g)].map(m => m[1]))];
    const exNames = await call('Board21.menu.set').locator('[data-example]').evaluateAll(b => b.map(e => e.dataset.example));
    const used = new Set();
    for (const n of exNames) {
      await setArgs('Board21.menu.set', { example: n });
      const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const k of Object.keys(v)) { used.add(k); walk(v[k]); } };
      walk(JSON.parse(await call('Board21.menu.set').locator('[data-arg="items"]').inputValue()));
    }
    missing = itemKeys.filter(k => !used.has(k));
    ok(['checkmarks', 'heading', 'swatches'].every(n => exNames.includes(n)) && itemKeys.length >= 9 && !missing.length,
      `the menu's ready examples (${exNames.join(', ')}) use every option a menu item has (${itemKeys.join(', ')})${missing.length ? '; missing: ' + missing.join(', ') : ''}`);
    const labels = await F(() => [...document.querySelectorAll('.arg > span')].map(s => [s.textContent, getComputedStyle(s).fontFamily]));
    ok(labels.length >= 8 && labels.every(([t, ff]) => /monospace/.test(ff) && /^[a-z]+\b/.test(t)), `each box is labeled with the call’s parameter name, in the font of the code (${labels.map(l => l[0]).join(', ')})`);

    // ---- P2. Your own values: save and load, a menu from JSON with a heading and a checkmark, the title, a minimum size.
    await run('Board21.save', { data: '{"n": 42, "names": ["Ana", "Ben"]}' });
    ok(JSON.stringify(await data()) === '{"n":42,"names":["Ana","Ben"]}', `save() saves the JSON typed (${JSON.stringify(await data())})`);
    await run('Board21.load');
    const loaded = await result('Board21.load');
    ok((() => { try { return JSON.stringify(JSON.parse(loaded)) === '{"n":42,"names":["Ana","Ben"]}'; } catch (e) { return false; } })(), `and load() gives it back (${loaded})`);
    await page.evaluate(ik => window.__board21.closeWin(ik), ik); await page.waitForTimeout(300);
    ok(await page.locator('#toasts .toast', { hasText: 'SDK Playground got beforeclose.' }).count() === 1, 'as it closes, the log’s beforeclose handler says so on the board');
    await open(); await f.locator('[data-call="Board21.load"]').waitFor(); await stubClipboard();
    await run('Board21.load');
    ok((await result('Board21.load').catch(() => '')).replace(/\s/g, '') === '{"n":42,"names":["Ana","Ben"]}', 'closed and opened again, load() still gives it back');
    const items = [{ heading: true, label: 'Size' }, { id: 'size:s', label: 'Small', checked: true }, { id: 'size:b', label: 'Big', checked: false }];
    await run('Board21.menu.set', { items: JSON.stringify(items, null, 2) });
    const mi = await page.evaluate(ik => window.__board21.state.wins.get(ik).menuItems, ik);
    ok(mi.length === 3 && mi[0].heading && mi[0].label === 'Size' && mi[1].checked === true && mi[2].checked === false, `menu.set() from JSON: a heading and two checkable items (${JSON.stringify(mi)})`);
    await page.click(`.win[data-ikey="${ik}"] .win-label`); await page.waitForTimeout(200);
    const small = page.locator('#menu').getByRole('menuitemcheckbox', { name: 'Small', exact: true });
    ok(await page.locator('#menu .menu-group[aria-label="Size"] .menu-heading').textContent() === 'Size' && await small.getAttribute('aria-checked') === 'true',
      'the window menu shows the heading, and Small with its checkmark');
    await page.locator('#menu').getByRole('menuitemcheckbox', { name: 'Big', exact: true }).click(); await page.waitForTimeout(300);
    ok(await f.locator('#log .entry[data-event="menu"]', { hasText: 'size:b' }).count() === 1, 'tapping Big reaches the Playground’s log');
    await run('Board21.window.setTitle', { text: 'Quiz in 5' });
    ok(await page.locator(`.win[data-ikey="${ik}"] .sub`).textContent() === 'Quiz in 5', 'setTitle() with your own text');
    await page.evaluate(ik => window.__board21.setRect(ik, { x: 300, y: 40, w: 600, h: 480 }), ik); await page.waitForTimeout(300);
    await run('Board21.window.setMinSize', { width: 760, height: 500 }); await page.waitForTimeout(200);
    let d = await disp();
    ok(d.w >= 760 && d.h - 40 >= 500, `setMinSize(760, 500) draws the window at least that big (${d.w} × ${d.h - 40})`);
    await run('Board21.window.setMinSize', { width: '', height: '' }); await page.waitForTimeout(200);
    d = await disp();
    ok(await call('Board21.window.setMinSize').locator('.code').textContent() === 'Board21.window.setMinSize(null, null);' && d.w === 600 && d.h === 480,
      `empty boxes are null: setMinSize(null, null) goes back to the registry’s, and the window to its size (${d.w} × ${d.h - 40})`);

    // ---- Bad JSON says so, kindly, and nothing runs.
    const logCalls = () => f.locator('#log .entry[data-kind="call"]').count();
    const before = JSON.stringify(await data()), n0 = await logCalls();
    await run('Board21.save', { data: '{ count: 1 }' });
    const err = call('Board21.save').locator('.err');
    ok(await err.isVisible() && /^That’s not valid JSON\. .*double quotes/.test(await err.textContent()) && await call('Board21.save').locator('[data-arg="data"]').getAttribute('aria-invalid') === 'true',
      `keys without double quotes: “${await err.textContent().catch(() => '')}”`);
    await run('Board21.save', { data: '{\n  "count": 1,\n}' });
    ok(await err.isVisible() && /^That’s not valid JSON\. Check line 3\.$/.test(await err.textContent()), `a comma too many: “${await err.textContent().catch(() => '')}”`);
    await call('Board21.save').locator('.copy').click(); await page.waitForTimeout(150);
    ok(JSON.stringify(await data()) === before && await logCalls() === n0 && !(await copied()).length && !errors.length, 'nothing is saved, run, logged or copied, and nothing throws');
    await setArgs('Board21.save', { data: '{"count": 2}' }); await page.waitForTimeout(150);
    ok(!(await err.isVisible()) && await call('Board21.save').locator('[data-arg="data"]').getAttribute('aria-invalid') !== 'true', 'the message goes once the JSON is right');
    // Other values the SDK can't use: an empty box where null means nothing, a size of 0 or less, a ratio with a 0,
    // a menu that isn't a list, and curly quotes (an iPad's smart punctuation, or text from a document).
    const refused = [], n2 = await logCalls(), r0 = JSON.stringify(await disp());
    for (const [name, args, msg] of [
      ['Board21.window.setSize', { width: '', height: 320 }, 'Type a number.'],
      ['Board21.window.setSize', { width: -5, height: 0 }, 'Type a number above 0.'],
      ['Board21.window.setAspectRatio', { ratio: '16/0' }, 'Type a ratio like 16/9.'],
      ['Board21.menu.set', { items: '{"id": "a", "label": "A"}' }, 'That’s not a list. Put the items in [ ].'],
      ['Board21.menu.set', { items: '"Hello"' }, 'That’s not a list. Put the items in [ ].'],
      ['Board21.save', { data: '{“count”: 1}' }, 'That’s not valid JSON. Use double quotes around keys and text.']
    ]) {
      await run(name, args);
      const e = call(name).locator('.err'), got = await e.isVisible() ? await e.textContent() : '(no message)';
      if (got !== msg || await call(name).locator('.result').isVisible()) refused.push({ name, args, got, result: await call(name).locator('.result').textContent() });
    }
    ok(!refused.length && await logCalls() === n2 && JSON.stringify(await disp()) === r0 && !errors.length, `what the SDK can’t use says so, and nothing runs${refused.length ? ': ' + JSON.stringify(refused) : ''}`);
    await setArgs('Board21.menu.set', { items: '' });
    ok(await call('Board21.menu.set').locator('.code').textContent() === 'Board21.menu.set([]);', `an empty menu box is an empty list (${await call('Board21.menu.set').locator('.code').textContent()})`);

    // ---- P5. Copy as code: the line shown is what Copy gives, and it makes the very call Run makes.
    await F(() => {
      window.__ran = [];
      const wrap = (o, p) => Object.keys(o).forEach(k => {
        if (typeof o[k] !== 'function') return;
        const fn = o[k];
        o[k] = function (...a) { window.__ran.push([p + k, JSON.parse(JSON.stringify(a))]); return fn.apply(this, a); };
      });
      wrap(Board21, 'Board21.'); wrap(Board21.window, 'Board21.window.'); wrap(Board21.menu, 'Board21.menu.'); wrap(Board21.format || {}, 'Board21.format.');
    });
    const evalCode = text => {
      const out = [];
      const rec = p => new Proxy(function () {}, { get: (t, k) => rec(p + '.' + String(k)), apply: (t, th, a) => { out.push([p, JSON.parse(JSON.stringify(a))]); return Promise.resolve(); } });
      new Function('Board21', 'handler', text)(rec('Board21'), function handler() {});
      return out;
    };
    const cases = [
      ['Board21.save', { data: '{"score": 7, "done": false, "note": "It’s \\"fine\\"\\n", "list": [1, 2.5, null]}' }],
      ['Board21.saveConfig', { config: '{"big": true, "color": "#fef08a"}' }],
      ['Board21.load'], ['Board21.loadConfig'],
      ['Board21.window.setSize', { width: 640, height: 400 }],
      ['Board21.window.setAspectRatio', { ratio: '4:3' }], ['Board21.window.setAspectRatio', { ratio: '' }],
      ['Board21.window.setMinSize', { width: 400, height: '' }], ['Board21.window.setMinSize', { width: '', height: '' }],
      ['Board21.window.setMaxSize', { width: 900, height: '' }], ['Board21.window.setMaxSize', { width: '', height: '' }],
      ['Board21.window.setResizable', { resizable: 'false' }], ['Board21.window.setResizable', { resizable: 'true' }],
      ['Board21.window.setDragFromContent', { on: 'true' }], ['Board21.window.setDragFromContent', { on: 'false' }],
      ['Board21.window.setTitle', { text: 'Ms. O’Neil’s \'class\' \\ 2' }],
      ['Board21.window.getInfo'], ['Board21.window.focus'], ['Board21.window.requestAttention'],
      ['Board21.menu.set', { example: 'swatches' }], ['Board21.menu.set', { example: 'icon' }], ['Board21.menu.clear'],
      ['Board21.toast', { text: 'Done!' }],
      ['Board21.t', { key: 'b21.start' }], ['Board21.format.number', { n: '1234.5' }], ['Board21.words'],
      ['Board21.on', { event: 'resize' }], ['Board21.off', { event: 'resize' }], ['Board21.on', { event: 'resize' }],
      ['Board21.ready']
    ];
    const wrong = [];
    for (const [name, args] of cases) {
      await setArgs(name, args);
      await F(() => { window.__ran = []; window.__copied = []; });
      await call(name).locator('.run').click(); await page.waitForTimeout(200);
      await call(name).locator('.copy').click(); await page.waitForTimeout(100);
      const [ran, cp, code, label] = await Promise.all([F(() => window.__ran.slice()), copied(), call(name).locator('.code').textContent(), call(name).locator('.copy').textContent()]);
      let made = null; try { made = evalCode(cp[0]); } catch (e) { made = 'throws: ' + e.message; }
      if (cp.length !== 1 || cp[0] !== code || !Array.isArray(made) || made.length !== 1 || JSON.stringify(made[0]) !== JSON.stringify(ran[0]) || label !== 'Copied') wrong.push({ name, args, code, copied: cp, ran: ran[0], made, label });
    }
    ok(!wrong.length, `Copy gives the line shown, and that line makes the same call as Run (${cases.length} calls${wrong.length ? '; wrong: ' + JSON.stringify(wrong) : ''})`);
    const reads = await F(() => ['context', 'embedded', 'theme', 'version'].map(k => document.querySelector(`[data-call="Board21.${k}"] .code`).textContent));
    ok(reads.join() === 'Board21.context,Board21.embedded,Board21.theme,Board21.version', `reading a value shows just that (${reads.join(', ')})`);
    const codes = await F(() => ({ save: document.querySelector('[data-call="Board21.save"] .code').textContent, size: document.querySelector('[data-call="Board21.window.setSize"] .code').textContent,
      menu: (document.querySelector('[data-call="Board21.menu.set"] [data-example="heading"]').click(), document.querySelector('[data-call="Board21.menu.set"] .code').textContent) }));
    ok(codes.size === 'Board21.window.setSize(640, 400);' && /^Board21\.save\(\{ score: 7, done: false, note: 'It’s "fine"\\n', list: \[1, 2\.5, null\] \}\);$/.test(codes.save) &&
      /^Board21\.menu\.set\(\[\n  \{ heading: true, label: '[^']+' \},\n/.test(codes.menu),
      `as a widget would write it: ${codes.size} ${codes.save} ${codes.menu.replace(/\n/g, '¶')}`);

    // ---- P3. State, live: content, config, context and window info, refreshed by their events.
    await tab('state');
    const sv = (attr, k) => F((_, [attr, k]) => { const e = document.querySelector(`#state [data-${attr}="${k}"] .v`); return e ? e.textContent : null; }, [attr, k]);
    await run('Board21.save', { data: '{"step": 3}' }); await tab('state');
    ok((await sv('key', 'data') || '').replace(/\s/g, '') === '{"step":3}', `State shows the content saved (${await sv('key', 'data')})`);
    await page.evaluate(ik => { const b = window.__board21; b.state.data.set(ik, { step: 4 }); b.state.wins.get(ik).post('data', { data: { step: 4 }, reason: 'remote' }); }, ik); await page.waitForTimeout(300);
    ok((await sv('key', 'data') || '').replace(/\s/g, '') === '{"step":4}', 'and a change from another tab (the data event)');
    await page.evaluate(ik => window.__board21.setRect(ik, { x: 660, y: 40, w: 700, h: 540 }), ik); await page.waitForTimeout(400);
    ok(await sv('wkey', 'width') === '700' && await sv('wkey', 'height') === '500', `the window’s size follows resize events (${await sv('wkey', 'width')} × ${await sv('wkey', 'height')})`);
    await page.evaluate(ik => window.__board21.setRect(ik, { x: 100, y: 120, w: 700, h: 540 }), ik); await page.waitForTimeout(300);   // (a move: no resize event)
    await tab('calls'); await tab('state'); await page.waitForTimeout(300);
    ok(await sv('wkey', 'x') === '100' && await sv('wkey', 'y') === '120', `moved, State shows where the window is once it’s opened (${await sv('wkey', 'x')}, ${await sv('wkey', 'y')})`);
    {   // On its own (#b21-bare), State follows the page's size.
      const sp = await ctx.newPage();
      sp.on('pageerror', e => errors.push('standalone: ' + e.message));
      await sp.setViewportSize({ width: 800, height: 600 });
      await sp.goto(BASE + 'widgets/sdk-playground/index.html#b21-bare'); await sp.waitForFunction(() => window.Board21 && Board21.context, null, { timeout: 5000 });
      await sp.click('[role="tab"][data-tab="state"]');
      await sp.setViewportSize({ width: 700, height: 500 }); await sp.waitForTimeout(400);
      const size = await sp.evaluate(() => ['width', 'height'].map(k => document.querySelector(`#state [data-wkey="${k}"] .v`).textContent).join(' × '));
      ok(size === '700 × 500', `standalone, State follows the page’s size (${size})`);
      await sp.close();
    }
    await page.evaluate(ik => window.__board21.setMaximized(ik, true), ik); await page.waitForTimeout(500);
    const corners = await sv('wkey', 'corners'), maxd = await sv('wkey', 'maximized');
    ok(maxd === 'true' && /"left"/.test(corners || ''), `filling the board: maximized and corners (${maxd}, ${corners})`);
    await page.evaluate(ik => window.__board21.setMaximized(ik, false), ik); await page.waitForTimeout(400);
    ok(await sv('wkey', 'maximized') === 'false' && await sv('wkey', 'zoom') === '1', `back again (zoom ${await sv('wkey', 'zoom')})`);
    const ctxShown = await F(() => Object.fromEntries([...document.querySelectorAll('#state [data-key] > .v')].map(e => [e.parentNode.dataset.key, e.textContent])));
    ok(ctxShown.widgetId === '"sdk-playground"' && ctxShown.instance === '1' && ctxShown.kiosk === 'false' && ctxShown.standalone === 'false' && ctxShown.host === '"board"' && ctxShown.theme === '"light"' && ctxShown['text-style'] === 'Standard',
      `the context: widget id, instance, kiosk, standalone, host, theme, text style (${JSON.stringify(ctxShown)})`);

    // ---- P4. The palette: every token, its swatch, name and value, following the theme, the accent and the text style.
    await tab('palette');
    const tokens = [...new Set(between('## Theming', '## Registering a widget').match(/--b21-[a-z0-9-]+/g))];
    const pal = () => F(() => [...document.querySelectorAll('#palette [data-token]')].map(b => ({ t: b.dataset.token, v: b.querySelector('.value').textContent.trim(), sw: !!b.querySelector('.swatch'),
      css: getComputedStyle(document.documentElement).getPropertyValue(b.dataset.token).trim() })));
    let p = await pal();
    const ctxPal = await F(() => Object.keys(Board21.context.palette).map(k => '--b21-' + k));
    missing = [...new Set(tokens.concat(ctxPal))].filter(t => !p.some(x => x.t === t));
    ok(tokens.length === 14 && !missing.length && p.every(x => x.v && x.v === x.css && x.sw), `the palette lists every token with a swatch, its name and value (${p.length}${missing.length ? '; missing: ' + missing.join(', ') : ''})`);
    // Every swatch can be seen: its edge stands out from the page (3:1), and the text tokens show text on the fill they go with.
    const swatches = () => F(() => {
      const lum = c => { const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const color = v => { const i = document.createElement('i'); i.style.color = v; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
      const bg = getComputedStyle(document.body).backgroundColor;
      const sw = [...document.querySelectorAll('#palette .swatch')].map(s => { const cs = getComputedStyle(s); return { t: s.closest('[data-token]').dataset.token, edge: Math.round(ratio(cs.borderTopColor, bg) * 100) / 100, text: s.textContent, color: cs.color, fill: cs.backgroundColor }; });
      const on = t => sw.find(s => s.t === t) || {};
      return { low: sw.filter(s => s.edge < 3).map(s => s.t + ' ' + s.edge),
        onAccent: on('--b21-on-accent').text === 'Aa' && on('--b21-on-accent').color === color('var(--b21-on-accent)') && on('--b21-on-accent').fill === color('var(--b21-accent)'),
        soft: on('--b21-accent-soft').text === 'Aa' && on('--b21-accent-soft').color === color('var(--b21-text)') && on('--b21-accent-soft').fill === color('var(--b21-accent-soft)'),
        edges: sw.map(s => s.edge) };
    });
    let sws = await swatches();
    ok(!sws.low.length && sws.onAccent && sws.soft, `light: every swatch’s edge stands out (at least ${Math.min(...sws.edges)}:1), and on-accent and accent-soft show text on their fill${sws.low.length ? '; too faint: ' + sws.low.join(', ') : ''} (${sws.onAccent}, ${sws.soft})`);
    const val = t => p.find(x => x.t === t).v;
    await openSettings(page); await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(500);
    p = await pal();
    ok(val('--b21-bg') === '#1e1e1e' && val('--b21-accent') === '#60a5fa' && p.every(x => x.v === x.css), `dark: it follows (${val('--b21-bg')}, ${val('--b21-accent')})`);
    sws = await swatches();
    ok(!sws.low.length && sws.onAccent && sws.soft, `and in dark (at least ${Math.min(...sws.edges)}:1)${sws.low.length ? '; too faint: ' + sws.low.join(', ') : ''} (${sws.onAccent}, ${sws.soft})`);
    await page.locator('#set-accent-custom').evaluate(el => { el.value = '#0d9488'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(500);
    p = await pal();
    const custom = await page.evaluate(() => window.__board21.state.settings.accentColor);
    ok(custom === '#0d9488' && val('--b21-accent') !== '#60a5fa' && val('--b21-accent-soft') !== 'rgba(96,165,250,0.18)' && p.every(x => x.v === x.css), `a Custom… accent: it follows (${val('--b21-accent')}, ${val('--b21-accent-soft')})`);
    await openSettings(page, ['letters']); await page.click('#settings [data-act="letters"][data-val="legible"]'); await page.waitForTimeout(500);
    p = await pal();
    ok(/Atkinson Hyperlegible/.test(val('--b21-font')) && p.every(x => x.v === x.css), `the text style: it follows (${val('--b21-font')})`);
    await tab('state');
    ok(await sv('key', 'text-style') === 'Easier to read' && await sv('key', 'theme') === '"dark"', `and State says so (${await sv('key', 'text-style')}, ${await sv('key', 'theme')})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await tab('palette');
    await F(() => { window.__copied = []; });
    await f.locator('#palette [data-token="--b21-accent"]').click(); await page.waitForTimeout(100);
    ok(JSON.stringify(await copied()) === '["--b21-accent"]', `tapping a token copies its name (${JSON.stringify(await copied())})`);
    await page.screenshot({ path: OUT + 'sdk-playground-palette-dark.png' });

    // ---- P6. The log: timestamps, pretty JSON, filter by event, pause, clear, copy.
    await page.evaluate(ik => window.__board21.setRect(ik, { x: 300, y: 40, w: 720, h: 560 }), ik); await page.waitForTimeout(400);
    await tab('log');
    await run('Board21.menu.set', { example: 'checkmarks' });
    const tapMenu = async id => { await page.click(`.win[data-ikey="${ik}"] .win-label`); await page.click(`#menu [data-id="${id}"]`); await page.waitForTimeout(250); };
    const shownLog = () => F(() => [...document.querySelectorAll('#log .entry')].filter(e => !e.hidden).map(e => ({ kind: e.dataset.kind, ev: e.dataset.event || '', time: (e.querySelector('.time') || {}).textContent || '',
      pre: [...e.querySelectorAll('pre')].map(x => x.textContent) })));
    await f.locator('#filter').selectOption('menu');
    await tapMenu('analog');
    await page.evaluate(ik => window.__board21.setRect(ik, { x: 300, y: 40, w: 730, h: 560 }), ik); await page.waitForTimeout(300);
    let L = await shownLog();
    const hiddenResize = await f.locator('#log .entry[data-event="resize"][hidden]').count();
    ok(L.length >= 1 && L.every(e => e.ev === 'menu') && hiddenResize >= 1, `the filter shows only menu events (${L.length} shown; ${hiddenResize} resize events hidden)`);
    const last = L[L.length - 1];
    ok(/^\d\d:\d\d:\d\d\.\d{3}$/.test(last.time) && last.pre.some(t => t.includes('\n  "label": "Analog"')), `with a timestamp and pretty JSON (${last.time}; ${JSON.stringify(last.pre)})`);
    await f.locator('#pause').click();
    const n1 = (await shownLog()).length;
    await tapMenu('digital'); await tapMenu('analog');
    ok((await shownLog()).length === n1 && await f.locator('#pause').getAttribute('aria-pressed') === 'true' && /[1-9]/.test(await f.locator('#pause').textContent()),
      `paused: nothing new shows, and Resume counts what waits (${await f.locator('#pause').textContent()})`);
    await f.locator('#pause').click(); await page.waitForTimeout(150);
    L = await shownLog();
    ok(L.length === n1 + 2 && await f.locator('#pause').getAttribute('aria-pressed') === 'false', `Resume shows them (${L.length})`);
    await F(() => { window.__copied = []; });
    await f.locator('#copy-log').click(); await page.waitForTimeout(100);
    const text = (await copied())[0] || '';
    ok(/^\d\d:\d\d:\d\d\.\d{3} +menu /m.test(text) && !/resize/.test(text) && (text.match(/^\d\d:\d\d:\d\d\.\d{3}/gm) || []).length === L.length, `Copy gives what the log shows (${text.split('\n').length} lines)`);
    await f.locator('#filter').selectOption('all');
    await f.locator('#clear').click(); await page.waitForTimeout(100);
    ok(await f.locator('#log .entry').count() === 0, 'Clear empties it');

    // ---- Events: the log's handler starts on for every event, and Run on() says when it adds it again.
    const hint = await f.locator('[data-group="Events"] .hint').textContent();
    const note = call('Board21.on').locator('.note');
    const menus = () => f.locator('#log .entry[data-event="menu"]').count();
    await run('Board21.on', { event: 'menu' });
    await tapMenu('analog');
    const twice = await menus();
    ok(/every event/.test(hint) && twice === 2 && await note.isVisible() && await note.textContent() === 'Already on. Each menu event now shows twice.',
      `on() for an event the log already hears: one tap shows twice, and it says why (${twice}; “${hint}” “${await note.textContent().catch(() => '')}”)`);
    await run('Board21.off', { event: 'menu' }); await f.locator('#clear').click(); await tapMenu('analog');
    const none = await menus();
    await run('Board21.on', { event: 'menu' }); await f.locator('#clear').click(); await tapMenu('analog');
    const once = await menus();
    ok(none === 0 && once === 1 && !(await note.isVisible()), `off() and then on(): once again, with nothing to explain (${none}, then ${once})`);
    // A wide window: tapping a tab leaves the log where it was.
    for (let i = 0; i < 6; i++) await run('Board21.window.getInfo');
    const scroll = () => F(() => { const l = document.getElementById('log'); return [Math.round(l.scrollTop), l.scrollHeight - l.clientHeight]; });
    await F(() => { document.getElementById('log').scrollTop = 0; });
    await f.locator('[role="tab"][data-tab="state"]').click(); await page.waitForTimeout(150);
    const s1 = await scroll();
    await f.locator('[role="tab"][data-tab="calls"]').click(); await page.waitForTimeout(150);
    const s2 = await scroll();
    ok(s1[1] > 100 && s1[0] === 0 && s2[0] === 0, `a wide window: tapping a tab leaves the log where it was (${s1[0]}, then ${s2[0]}, of ${s1[1]})`);

    // ---- P7. The smallest window (320 × 260) in every text style, and the board's other sizes: every tab usable.
    const cramped = [], tight = [];
    for (const style of ['standard', 'legible', 'early']) {
      await openSettings(page, ['letters']); await page.click(`#settings [data-act="letters"][data-val="${style}"]`); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await page.evaluate(ik => window.__board21.setRect(ik, { x: 500, y: 60, w: 320, h: 300 }), ik); await page.waitForTimeout(500);
      for (const t of ['calls', 'state', 'palette', 'log']) {
        await f.locator(`[role="tab"][data-tab="${t}"]`).click(); await page.waitForTimeout(100);
        const m = await F(() => {
          const tabs = [...document.querySelectorAll('[role="tab"]')].filter(b => b.offsetParent), panel = document.querySelector('[role="tabpanel"]:not([hidden])');
          const over = panel ? [...panel.querySelectorAll('*')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 0.5).map(e => e.tagName + '.' + e.className) : ['no panel'];
          return { w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, tabs: tabs.length, clipped: tabs.filter(b => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > innerWidth + 0.5).map(b => b.textContent),
            over, font: getComputedStyle(document.querySelector('button')).fontFamily, room: panel ? panel.getBoundingClientRect().height : 0 };
        });
        if (m.w !== 320 || m.h !== 260 || m.sw > 320 || m.tabs !== 4 || m.clipped.length || m.over.length || m.room < 150 ||
          !(style === 'standard' || m.font.includes(style === 'legible' ? 'Atkinson Hyperlegible' : '21Board Early Readers'))) cramped.push({ style, t, m });
      }
      await page.screenshot({ path: OUT + `sdk-playground-min-${style}.png`, clip: await page.locator(`.win[data-ikey="${ik}"]`).boundingBox() });
      // The log's bar stays one row while Pause counts, and the menu box and its code line leave room for Run.
      await f.locator('[role="tab"][data-tab="log"]').click(); await f.locator('#pause').click();
      await page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); for (let i = 0; i < 12; i++) w.post('focus'); }, ik); await page.waitForTimeout(200);
      const bar = await F(() => ({ rows: new Set([...document.querySelectorAll('.log-bar > *')].map(e => Math.round(e.getBoundingClientRect().top))).size, pause: document.getElementById('pause').textContent }));
      await f.locator('#pause').click(); await f.locator('#clear').click();
      await f.locator('[role="tab"][data-tab="calls"]').click(); await call('Board21.menu.set').locator('[data-example="swatches"]').click();
      const box = await F(() => { const r = s => Math.round(document.querySelector(`[data-call="Board21.menu.set"] ${s}`).getBoundingClientRect().height); return { box: r('textarea'), code: r('.code'), h: innerHeight }; });
      if (bar.rows !== 1 || !/^Resume\d\d$/.test(bar.pause) || box.box > box.h / 2 || box.code > box.h / 2) tight.push({ style, bar, box });
    }
    ok(!cramped.length, `at 320 × 260, in every text style, all four tabs and their content fit, in the board’s font${cramped.length ? ': ' + JSON.stringify(cramped) : ''}`);
    ok(!tight.length, `and the log’s bar stays one row while Pause counts, and the menu box and its code line each take at most half the window${tight.length ? ': ' + JSON.stringify(tight) : ''}`);
    await openSettings(page, ['letters']); await page.click('#settings [data-act="letters"][data-val="standard"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    for (const sc of [0.5, 2]) {
      await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(400);
      await page.evaluate(ik => window.__board21.setRect(ik, { x: 20, y: 20, w: 320, h: 300 }), ik); await page.waitForTimeout(400);
      const m = await F(() => ({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth }));
      const zoom = await sv('wkey', 'zoom');
      ok(m.w === 320 && m.h === 260 && m.sw <= 320 && zoom === String(sc), `at Size ${sc * 100}% too, and State’s zoom follows (${m.w} × ${m.h}, zoom ${zoom})`);
    }
    await page.evaluate(() => window.__board21.setBoardScale(1)); await page.waitForTimeout(300);

    // ---- The keyboard and a screen reader: tabs with the arrow keys, Enter runs a call, every control named.
    await page.evaluate(ik => { window.__board21.setRect(ik, { x: 300, y: 40, w: 480, h: 440 }); window.__board21.focusWin(ik); }, ik); await page.waitForTimeout(400);
    await f.locator('[role="tab"][data-tab="calls"]').click();
    await page.keyboard.press('ArrowRight');
    ok(await F(() => document.activeElement.dataset.tab === 'state' && document.activeElement.getAttribute('aria-selected') === 'true' && !document.getElementById(document.activeElement.getAttribute('aria-controls')).hidden),
      'the arrow keys move between the tabs');
    await f.locator('[role="tab"][data-tab="calls"]').click();
    await call('Board21.window.setTitle').locator('[data-arg="text"]').fill('From the keyboard');
    await call('Board21.window.setTitle').locator('[data-arg="text"]').press('Enter'); await page.waitForTimeout(300);
    ok(await page.locator(`.win[data-ikey="${ik}"] .sub`).textContent() === 'From the keyboard', 'Enter in a box runs its call');
    const unnamed = await F(() => [...document.querySelectorAll('input, select, textarea, button')].filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.textContent.trim() && !e.getAttribute('aria-labelledby')).map(e => e.outerHTML.slice(0, 80)));
    const runs = await F(() => [...document.querySelectorAll('[data-call] .run')].map(b => b.getAttribute('aria-label') || ''));
    ok(!unnamed.length && runs.every(n => /^Run \S/.test(n)) && new Set(runs).size === runs.length, `every control has a name, and each Run says which call (${unnamed.join(' | ') || runs.slice(0, 3).join(', ')}…)`);
    await f.locator('[role="tab"][data-tab="state"]').click();
    await f.locator('#state [data-key="palette"] .link').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const at = await F(() => ({ tab: document.activeElement.dataset.tab || document.activeElement.tagName, shown: !document.getElementById('palette').hidden }));
    ok(at.tab === 'palette' && at.shown, `Enter on State’s token count opens Palette, with the keyboard on its tab (${JSON.stringify(at)})`);
    const tiny = new Set();
    for (const t of ['calls', 'state', 'palette', 'log']) {
      await f.locator(`[role="tab"][data-tab="${t}"]`).click(); await page.waitForTimeout(100);
      (await F(() => [...document.querySelectorAll('button, input, select, textarea')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 36)
        .map(e => (e.textContent.trim() || e.getAttribute('aria-label') || e.tagName).slice(0, 24) + ' ' + Math.round(e.getBoundingClientRect().height)))).forEach(x => tiny.add(x));
    }
    ok(!tiny.size, `every control is at least 36 px tall${tiny.size ? ': ' + [...tiny].join(', ') : ''}`);

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
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
    ok(menu.items.includes('Add one') && menu.items.includes('Zoom to fill') && menu.items.includes('Close') && menu.swatches === 1, `tapping the name opens the real window menu (${menu.items.join(', ')}; the swatch that isn't a #hex color is left out)`);
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
    // (Not the district apps: their sites are never reached from the tests, and they have no SDK. See "District apps".)
    await pb.evaluate(() => window.__board21.catalog().filter(w => !w.external).forEach(w => window.__board21.openWidget(w.id))); await pb.waitForTimeout(2500);
    ok(!breq.some(u => /board21-dev\.js|board-shell\.js/.test(u)) && await pb.evaluate(() => [...window.__board21.state.wins.values()].every(w => w.connected && w.iframe.contentWindow.Board21.context.host === 'board')), 'inside 21Board, widgets connect at once and never load the dev window');
    await ctxB.close();
    // A widget's own console hook isn't undone by the SDK inside the board. (The test page is put in the registry
    // here: the board takes no other page as a widget. No offline copy, so the registry can be swapped.)
    const ctxC = await browser.newContext({ viewport: { width: 1400, height: 860 }, serviceWorkers: 'block' });
    await ctxC.route('**/widgets/registry.js', async r => r.fulfill({ status: 200, contentType: 'text/javascript',
      body: (await (await r.fetch()).text()) + `\nself.BOARD21_WIDGETS.push({ id: 'console-hook', name: 'Console hook', entry: '__dev/console.html' });` }));
    const pc = await ctxC.newPage();
    await pc.goto(BASE); await pc.waitForFunction(() => window.__board21 && window.__board21.store.loaded);
    await pc.evaluate(() => window.__board21.openWidget('console-hook'));
    ok(await eventually(() => pc.evaluate(() => { const w = window.__board21.state.wins.get('console-hook:1'); return !!w && w.connected && w.iframe.contentWindow.__seen.includes('after ready'); })),
      'a widget’s own console.error hook keeps working inside the board');
    await ctxC.close();
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
    // Its Widget Picker has no Paste: there is no Picture or Video Player to open there.
    const labPaste = await board.evaluate(() => {
      document.querySelector('.picker-btn.left').click();
      const b = document.querySelector('#panel [data-ctl="paste"]'), r = { open: document.getElementById('panel').classList.contains('open'), paste: !!b && !b.hidden && !!b.offsetParent, clipboard: !!(navigator.clipboard && navigator.clipboard.read) };
      document.querySelector('.picker-btn.left').click();
      return r;
    });
    ok(labPaste.open && !labPaste.paste, `the test board’s Widget Picker has no Paste (${JSON.stringify(labPaste)})`);
    await page.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('[data-act="edit"]').click()); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.getElementById('editor').hidden && !document.getElementById('b21-dev')), '"Edit code" goes back to the code');

    // ---- The board shell is up to date with index.html.
    let built = true;
    try { require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-sdk.js'), '--check'], { stdio: 'pipe' }); } catch (e) { built = false; }
    ok(built, 'sdk/dev/board-shell.js matches index.html (node tools/build-sdk.js)');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  // ---- From 2026.11.18-16: Checks' fix request for a missing SDK names the address the AI prompts give (docs/AI-PROMPT.md),
  // wherever the dev window runs. In the widget lab it named the lab's own site (boardapp.ccsd21.org on production), which
  // Gemini's preview can't reach. Only the lab can show this check: an AI preview or a widget's own file starts the dev
  // window from the SDK's own <script src>, which the dev window then finds in the page, so there it never fires.
  ['Widget dev window: the SDK fix request names the public address (the widget lab: no SDK tag, the board’s address, the public one; the widget runs from the lab’s own copy)', async (browser) => {
    const PUBLIC_SDK = 'https://tylerloch.github.io/21Board/sdk/board21.js';
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(() => { window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } }); });
    const away = [];   // (the widget must run from the lab's own copy: nothing is fetched from either public site)
    await ctx.route(/^https:\/\/(tylerloch\.github\.io|boardapp\.ccsd21\.org)\//, r => { away.push(r.request().url()); r.abort(); });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => { if (!/boom from the widget/.test(e.message)) errors.push(e.message); });
    const kids = f => page.frames().filter(x => x.parentFrame() === f);
    const widget = () => { const b = kids(page.mainFrame())[0]; return b && kids(b)[0]; };
    // Paste the code into the lab and tap Try it; then what the widget's SDK tag says, and that it runs in the dev window.
    const tryIt = async src => {
      if (await page.locator('#b21-dev').count()) await page.locator('#b21-dev [data-act="edit"]').click();
      await page.fill('#code', src); await page.click('#run');
      let w = null;
      await eventually(async () => { w = widget(); return !!w && await w.evaluate(() => !!(window.Board21 && Board21.context && Board21.context.host === 'dev' && window.__runs === 1)); }, 10000);
      return w ? w.evaluate(() => ({ runs: window.__runs, sdk: Array.from(document.querySelectorAll('script[src*="board21"]'), s => s.src).join(' ') })).catch(() => null) : null;
    };
    const checks = () => page.evaluate(() => window.__board21DevWindow.state().checks.map(c => c.title));
    const NOT_LOADED = 'The 21Board SDK isn’t loaded';
    await page.goto(BASE + 'sdk/lab.html'); await page.waitForTimeout(400);

    // No SDK tag: the lab adds its own copy for the test, and Checks asks for the public address.
    let w = await tryIt(DEV_WIDGET('x').replace('<script src="x"></script>', ''));
    ok(!!w && w.runs === 1 && w.sdk === BASE + 'sdk/board21.js', `a widget with no SDK tag runs in the lab from the lab’s own SDK copy (${JSON.stringify(w)})`);
    await page.locator('#b21-dev [data-drawer="checks"]').click(); await page.waitForTimeout(300);
    const chk = page.locator('#b21-dev .chk', { hasText: NOT_LOADED });
    ok(await chk.count() === 1 && /The dev window added it for this test\./.test(await chk.innerText()), `Checks shows “${NOT_LOADED}” (${(await checks()).join(' | ')})`);
    await chk.locator('[data-act="copy-fix"]').click(); await page.waitForTimeout(200);
    const fix = await page.evaluate(() => window.__copied[window.__copied.length - 1] || '');
    ok(fix === `Please fix this in my 21Board widget: ${NOT_LOADED}. Add <script src="${PUBLIC_SDK}"></script> as the first script in <head>.`,
      `Copy fix request asks for the public address the AI prompts give (${fix})`);
    ok(!fix.includes(new URL(BASE).host) && !/boardapp/.test(fix), 'and not the lab’s own site');

    // An SDK tag for the board's site or for the public address: the lab runs its own copy, and Checks has nothing to say about it.
    for (const sdk of ['https://boardapp.ccsd21.org/sdk/board21.js', PUBLIC_SDK]) {
      w = await tryIt(DEV_WIDGET(sdk));
      const titles = await checks();
      ok(!!w && w.runs === 1 && w.sdk === BASE + 'sdk/board21.js' && !titles.includes(NOT_LOADED) && !titles.some(t => /SDK/.test(t)),
        `an SDK tag for ${new URL(sdk).host}: the widget runs from the lab’s own copy, and no SDK check (${JSON.stringify(w)}; ${titles.join(' | ')})`);
    }
    ok(away.length === 0, `nothing was fetched from GitHub Pages or boardapp.ccsd21.org (${away.join(', ') || 'nothing'})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  // ---- From 2026.11.18-16: the ⋯ menu opens above an open panel. Both were placed with no z-index, and the panel came later
  // in the page, so the menu opened under it. "Show the widget on its own" had the same problem. Also from -15: on a narrow
  // pane the toolbar takes two rows (the panels and ⋯ were past its right edge, and its scrollbar is hidden), Tab from ⋯
  // goes to its items, and a tap on the board closes ⋯ while a widget that keeps its own field focused doesn't.
  ['Widget dev window: the ⋯ menu opens above an open panel (Data, Events, Checks and Help, 1366 and 600 px wide: every item on top, each one tapped, tapping outside; the widget on its own covers the panel; the toolbar fits at 600 px and in the lab at 800 px; from the keyboard; beside a widget that keeps its field focused)', async (browser) => {
    for (const vp of [{ width: 1366, height: 768 }, { width: 600, height: 768 }]) {
      const wide = vp.width >= 700, px = vp.width + ' px';   // (from 700 px the panel sits beside the board; below, over it)
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(() => { window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } }); });
      // A widget that keeps the keyboard on its own field, as a spelling game might.
      await ctx.route(BASE + '__dev/keeps-focus.html', r => r.fulfill({ contentType: 'text/html', body: DEV_WIDGET(BASE + 'sdk/board21.js').replace('<body>', '<body><input id="word">').replace('</script></body>', "setInterval(() => document.getElementById('word').focus(), 700);\n</script></body>") }));
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => { if (!/boom from the widget/.test(e.message)) errors.push(e.message); });
      const kids = f => page.frames().filter(x => x.parentFrame() === f);
      const board = () => kids(page.mainFrame())[0];
      const B = fn => board().evaluate(fn);
      const dev = sel => page.locator('#b21-dev ' + sel);
      const up = () => eventually(() => B(() => { const w = window.__board21.state.wins.get('counter:1'); return !!w && w.connected; }), 10000);
      await page.goto(BASE + '__dev/widget.html');
      ok(await up(), `${px}: the widget is up in the dev window`);
      const panel = () => page.evaluate(() => { const r = document.getElementById('b21-dev').shadowRoot; return r.querySelector('.drawer').hidden ? '' : r.querySelector('.dhead h2').textContent; });
      const menuOpen = () => page.evaluate(() => !document.getElementById('b21-dev').shadowRoot.querySelector('.pop').hidden);
      // Each item of the ⋯ menu: its center, what is on top there (through the shadow root), and whether that is over the panel.
      const items = () => page.evaluate(() => {
        const r = document.getElementById('b21-dev').shadowRoot, d = r.querySelector('.drawer').getBoundingClientRect();
        return Array.from(r.querySelectorAll('.pop button'), b => {
          const q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, e = r.elementFromPoint(x, y);
          return { act: b.dataset.act, label: b.textContent, x, y, top: e === b, over: x > d.left && x < d.right && y > d.top && y < d.bottom,
            at: e ? e.tagName.toLowerCase() + (e.className ? '.' + e.className : '') : 'nothing' };
        });
      });
      // Where a control shows, with the toolbar as it first appears (not scrolled): its center, and whether it is on top there.
      const spot = sel => page.evaluate(s => {
        const r = document.getElementById('b21-dev').shadowRoot, b = r.querySelector(s), bar = b.closest('.bar'), q = b.getBoundingClientRect();
        const x = q.left + q.width / 2, y = q.top + q.height / 2, e = r.elementFromPoint(x, y);
        return { x, y, shown: x > 0 && x < innerWidth && !!e && b.contains(e) && (!bar || bar.scrollLeft === 0), at: e ? e.tagName.toLowerCase() + (e.className ? '.' + e.className : '') : 'nothing' };
      }, sel);
      // Tap a control where it shows, as a teacher would. If it doesn't show, note it and tap it anyway, so the rest still runs.
      const unseen = new Set();
      const unscroll = () => page.evaluate(() => { document.getElementById('b21-dev').shadowRoot.querySelectorAll('.bar').forEach(b => { b.scrollLeft = 0; }); });
      const tap = async (sel, name) => {
        const s = await spot(sel);
        if (s.shown) { await page.mouse.click(s.x, s.y); return; }
        unseen.add(name); await dev(sel).click({ timeout: 3000 }); await unscroll();
      };
      // A point on the board, beside any panel, and whether the board is what's there while ⋯ is closed.
      const onBoard = () => page.evaluate(() => {
        const r = document.getElementById('b21-dev').shadowRoot, s = r.querySelector('.stage').getBoundingClientRect(), f = r.querySelector('.board').getBoundingClientRect();
        const x = Math.max(s.left, f.left) + 20, y = (Math.max(s.top, f.top) + Math.min(s.bottom, f.bottom)) / 2;
        return { x, y, board: r.elementFromPoint(x, y) === r.querySelector('.board') };
      });
      // Back to a known start whatever the last check did: ⋯ closed, the toolbar unscrolled, back from the widget on its own.
      const reset = () => page.evaluate(() => {
        const r = document.getElementById('b21-dev').shadowRoot;
        r.querySelector('.pop').hidden = true; r.querySelectorAll('.bar').forEach(b => { b.scrollLeft = 0; });
        if (!r.querySelector('.barewrap').hidden) r.querySelector('[data-act="unbare"]').click();
      });

      // The toolbar as it first appears: it fits the pane, and Data, Events, Checks and ⋯ are each on top where they show.
      const BAR = [['[data-drawer="data"]', 'Data'], ['[data-drawer="events"]', 'Events'], ['[data-drawer="checks"]', 'Checks'], ['[data-act="more"]', '⋯']];
      const notShown = async list => { const out = []; for (const [sel, name] of list) { const s = await spot(sel); if (!s.shown) out.push(`${name} at ${Math.round(s.x)} px, under ${s.at}`); } return out; };
      const fits = () => page.evaluate(() => { const b = document.getElementById('b21-dev').shadowRoot.querySelector('.bar'); return b.scrollWidth <= b.clientWidth ? 'fits' : `${b.scrollWidth} px wide`; });
      let off = await notShown(BAR), fit = await fits();
      ok(!off.length && fit === 'fits', `${px}: the toolbar fits the pane, with Data, Events, Checks and ⋯ on top (${fit}; ${off.join('; ') || 'all four shown'})`);
      off = await notShown([['[data-view="window"]', 'Window'], ['[data-k="screen"]', 'Screen'], ['[data-k="theme"]', 'Theme'], ['.size output', 'Size'], ['.brand', 'the 21']]);
      ok(!off.length, `${px}: Window, Screen, Theme, Size and the 21 show too (${off.join('; ') || 'all five'})`);

      // From the keyboard: Enter on ⋯ opens it, Tab goes to its first item, and Escape closes it.
      await dev('[data-act="more"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
      const kOpen = await menuOpen();
      await page.keyboard.press('Tab'); await page.waitForTimeout(150);
      const kb = await page.evaluate(() => { const r = document.getElementById('b21-dev').shadowRoot, a = r.activeElement; return { open: !r.querySelector('.pop').hidden, at: a ? a.getAttribute('data-act') || a.tagName.toLowerCase() + '.' + a.className : 'nothing' }; });
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      ok(kOpen && kb.open && kb.at === 'reload' && !await menuOpen(), `${px}: from the keyboard, Enter on ⋯ opens it, Tab goes to “Reload the widget”, and Escape closes it (${kOpen ? 'opened' : 'didn’t open'}; after Tab: ${kb.at}, ${kb.open ? 'open' : 'closed'})`);
      await reset();

      // With no panel open, a tap on the board closes ⋯.
      const b0 = await onBoard();
      await tap('[data-act="more"]', '⋯'); await page.waitForTimeout(150);
      const o0 = await menuOpen();
      await page.mouse.click(b0.x, b0.y); await page.waitForTimeout(300);
      ok(b0.board && o0 && !await menuOpen(), `${px}, no panel open: tapping the board closes ⋯ (${!b0.board ? 'that point isn’t the board' : !o0 ? '⋯ didn’t open' : await menuOpen() ? 'stayed open' : 'closed'})`);

      const openPanel = async name => {
        await reset();
        if (await panel()) await tap('[data-act="close-drawer"]', 'the panel’s ✕');
        if (name === 'help') { await tap('[data-act="more"]', '⋯'); await tap('.pop [data-act="help"]', 'How this works'); }   // (Help is only in ⋯)
        else await tap(`[data-drawer="${name}"]`, BAR.find(b => b[0].includes(name))[1]);
        await page.waitForTimeout(300);
      };
      const HEAD = { data: 'Saved data', events: 'Events', checks: 'Checks', help: 'How this works' };
      // One item tapped with each panel open, so each item is tapped at one width or the other (How this works at both).
      const TAPS = wide ? { data: 'open2', events: 'reload', checks: 'bare', help: 'copy21' } : { data: 'shape', events: 'reset', checks: 'help', help: 'help' };
      for (const name of ['data', 'events', 'checks', 'help']) {
        try {   // (one failure is reported, and the other panels still run)
          await openPanel(name);
          ok(await panel() === HEAD[name], `${px}: ${HEAD[name]} is open`);
          await tap('[data-act="more"]', '⋯'); await page.waitForTimeout(150);
          const its = await items();
          ok(await menuOpen() && its.length === 7 && its.every(i => i.top && i.over),
            `${px}, ${HEAD[name]} open: ⋯ opens over the panel, every item on top (${its.filter(i => !i.top || !i.over).map(i => `${i.label}: ${i.over ? 'under ' + i.at : 'not over the panel'}`).join('; ') || its.length + ' items'})`);
          // Tap one item where it shows, and see it work.
          const act = TAPS[name], it = its.find(i => i.act === act);
          if (!it) { ok(false, `${px}, ${HEAD[name]} open: the ⋯ menu has “${act}”`); continue; }
          let before = null, done = false, what = '';
          if (act === 'open2') before = await B(() => window.__board21.state.wins.size);
          if (act === 'reload') await Promise.all(kids(board()).map(f => f.evaluate(() => { window.__mark = 1; })));
          if (act === 'shape') before = await page.evaluate(() => window.__board21DevWindow.state().lastView.shape);
          if (act === 'reset') { await kids(board())[0].evaluate(() => Board21.save({ count: 5 })); await eventually(() => B(() => (window.__board21.state.data.get('counter:1') || {}).count === 5)); }
          await page.mouse.click(it.x, it.y);
          if (act === 'open2') { done = await eventually(() => board().evaluate(n => window.__board21.state.wins.size === n + 1, before)); what = 'a second window opens'; }
          if (act === 'reload') { done = await eventually(async () => { const fs = kids(board()); return fs.length > 0 && (await Promise.all(fs.map(f => f.evaluate(() => !window.__mark && window.__runs === 1)))).every(Boolean); }); what = 'the widget reloads'; }
          if (act === 'shape') { done = await eventually(async () => { const s = await page.evaluate(() => window.__board21DevWindow.state().lastView.shape); return !!s && s !== before; }); what = 'the board changes shape'; }
          if (act === 'reset') { done = await eventually(() => B(() => !window.__board21.state.data.has('counter:1'))); what = 'the window’s saved data is cleared'; }
          if (act === 'copy21') { done = await eventually(() => page.evaluate(() => { const t = window.__copied[window.__copied.length - 1] || ''; return t.startsWith('<!-- Save as widgets/counter/index.html -->') && t.includes('<script src="../../sdk/board21.js"></script>'); })) && await panel() === 'Checks'; what = 'the HTML and its registry entry are copied, shown with Checks'; }
          if (act === 'help') { await page.waitForTimeout(300); done = await panel() === 'How this works'; what = 'How this works shows, and stays open'; }
          if (act === 'bare') {
            // The widget on its own covers the whole pane, the panel too; Back to the window returns to it.
            const cover = await eventually(() => page.evaluate(() => {
              const r = document.getElementById('b21-dev').shadowRoot, wrap = r.querySelector('.barewrap'), d = r.querySelector('.drawer').getBoundingClientRect();
              const e = r.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2);
              return !wrap.hidden && !!e && wrap.contains(e) && e.tagName === 'IFRAME';
            }));
            const alone = cover && await eventually(() => kids(page.mainFrame())[1].evaluate(() => !!(window.Board21 && Board21.context && Board21.context.standalone)));
            if (cover) { await tap('[data-act="unbare"]', 'Back to the window'); await page.waitForTimeout(800); }
            done = cover && alone && await page.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('.barewrap').hidden) && await panel() === 'Checks';
            what = 'the widget shows on its own, over the panel, and Back to the window returns';
          }
          ok(done && !await menuOpen(), `${px}, ${HEAD[name]} open: tapping “${it.label}” works (${what}) and closes the menu`);
          // Tapping outside the menu closes it: on the panel, and on a wide pane on the board beside it.
          await tap('[data-act="more"]', '⋯'); await page.waitForTimeout(150);
          const h = await page.evaluate(() => { const q = document.getElementById('b21-dev').shadowRoot.querySelector('.dhead h2').getBoundingClientRect(); return { x: q.left + 6, y: q.top + q.height / 2 }; });
          await page.mouse.click(h.x, h.y); await page.waitForTimeout(150);
          const afterPanel = await menuOpen();
          let afterBoard = false, spotB = null;
          if (wide) {
            spotB = await onBoard();
            await tap('[data-act="more"]', '⋯'); await page.waitForTimeout(150);
            await page.mouse.click(spotB.x, spotB.y); await page.waitForTimeout(300);
            afterBoard = await menuOpen();
          }
          ok(!afterPanel && !afterBoard && (!spotB || spotB.board), `${px}, ${HEAD[name]} open: tapping outside the menu closes it (on the panel${wide ? ', on the board' : ''}: ${afterPanel ? 'stayed open' : 'closed'}${wide ? `, ${afterBoard ? 'stayed open' : 'closed'}` : ''})`);
        } catch (err) { ok(false, `${px}, ${HEAD[name]} open: stopped early (${String(err && err.message || err).split('\n')[0]})`); }
      }
      ok(!unseen.size, `${px}: every control tapped above showed where it is, with the toolbar unscrolled (${[...unseen].join(', ') || 'all of them'})`);

      if (wide) {
        // A widget that keeps the keyboard on its own field: ⋯ stays open until a tap, and its items still work.
        await page.goto(BASE + '__dev/keeps-focus.html');
        ok(await up() && await eventually(() => page.evaluate(() => { const r = document.getElementById('b21-dev').shadowRoot; return r.activeElement === r.querySelector('.board'); })),
          `${px}: a widget that keeps its field focused is up, with the keyboard`);
        await tap('[data-act="more"]', '⋯'); await page.waitForTimeout(2000);
        const still = await menuOpen();
        const it = (await items()).find(i => i.act === 'open2' && i.top), n = await B(() => window.__board21.state.wins.size);
        if (it) await page.mouse.click(it.x, it.y);
        const opened = !!it && await eventually(() => board().evaluate(m => window.__board21.state.wins.size === m + 1, n));
        ok(still && opened && !await menuOpen(), `${px}: beside a widget that keeps its field focused, ⋯ stays open (${still ? 'open' : 'closed by itself'} after 2 s), and “Open another window” works (${opened ? 'it opened' : 'it didn’t'})`);
      } else {
        // The widget on its own: Back to the window shows, and returns.
        await reset(); await tap('[data-act="more"]', '⋯'); await tap('.pop [data-act="bare"]', 'Show the widget on its own'); await page.waitForTimeout(400);
        const back = await spot('[data-act="unbare"]');
        await tap('[data-act="unbare"]', 'Back to the window'); await page.waitForTimeout(800);
        ok(back.shown && await page.evaluate(() => document.getElementById('b21-dev').shadowRoot.querySelector('.barewrap').hidden),
          `${px}, the widget on its own: “Back to the window” shows, and tapping it returns (${back.shown ? 'shown' : `at ${Math.round(back.x)} px, under ${back.at}`})`);
        // The widget lab, whose toolbar also has Edit code: Data, Events, Checks, Edit code and ⋯ show, and ⋯ opens.
        await page.goto(BASE + 'sdk/lab.html'); await page.fill('#code', DEV_WIDGET('../../sdk/board21.js')); await page.click('#run');
        ok(await up(), `${px}, the widget lab: the widget is up`);
        off = await notShown(BAR.concat([['[data-act="edit"]', 'Edit code'], ['[data-k="theme"]', 'Theme'], ['.size output', 'Size']])); fit = await fits();
        ok(!off.length && fit === 'fits', `${px}, the widget lab: the toolbar fits the pane, with Data, Events, Checks, Edit code, ⋯, Theme and Size on top (${fit}; ${off.join('; ') || 'all shown'})`);
        await tap('[data-act="more"]', '⋯'); await page.waitForTimeout(150);
        const its = await items();
        ok(await menuOpen() && its.length === 7 && its.every(i => i.top), `${px}, the widget lab: ⋯ opens, every item on top (${its.filter(i => !i.top).map(i => `${i.label}: under ${i.at}`).join('; ') || its.length + ' items'})`);
        // At 800 px one row fits the dev window's toolbar but not the lab's, which also has Edit code.
        await reset(); await page.setViewportSize({ width: 800, height: 768 }); await page.waitForTimeout(400);
        off = await notShown(BAR.concat([['[data-act="edit"]', 'Edit code']])); fit = await fits();
        ok(!off.length && fit === 'fits', `800 px, the widget lab: the toolbar fits the pane, with Data, Events, Checks, Edit code and ⋯ on top (${fit}; ${off.join('; ') || 'all shown'})`);
      }
      if (errors.length) ok(false, `${px}: no page errors: ` + errors.join(' | '));
      await ctx.close();
    }
  }],
  ['Developer mode: upload a widget file', async (browser) => {
    ok(stamped(), STAMPED);
    // The docs offer Upload file… only too: no path or address to type (the board has nowhere to type one now).
    const typed = ['README.md', 'docs/WIDGET-SDK.md', 'docs/AI-PROMPT.md', 'docs/DATA-FORMAT.md'].flatMap(f =>
      (fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\s+/g, ' ').match(/\b(enter|entering|type|typing)\b[^.]{0,40}?\b(path|address)\b/gi) || []).map(m => `${f}: ${m}`));
    ok(typed.length === 0, 'the docs don’t tell anyone to type or enter a widget’s path or address (' + JSON.stringify(typed) + ')');
    if (!stamped()) return;   // (no offline copy is saved then)
    // Every uploaded file carries this mark in its code: it must never turn up in anything that leaves the device.
    const MARK = 'UPLOADED-CODE-7f3a91';
    const dir = OUT + 'upload' + path.sep; fs.mkdirSync(dir, { recursive: true });
    const W = (name, html) => { fs.writeFileSync(dir + name, html); return dir + name; };
    // Tries everything a sealed-off widget must not reach, says what it reached, and saves that with Board21.save.
    const probe = W('probe.html', `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<script src="../../sdk/board21.js"></script>
<script type="application/json" id="board21-widget">{"id":"probe","name":"Probe","version":"1.0.0","window":{"width":460,"height":320}}</script>
<title>Probe</title></head><body><pre id="out">waiting</pre><script>
/* ${MARK} */
(async () => {
  const r = { origin: self.origin, mode: document.compatMode };
  const now = (k, fn) => { try { r[k] = fn() ? 'reached' : 'blocked'; } catch (e) { r[k] = 'blocked'; } };
  now('parentDocument', () => !!parent.document);
  now('parentBoard', () => !!parent.__board21);
  now('topBoard', () => !!top.__board21);
  now('localStorage', () => !!localStorage);
  now('cookie', () => document.cookie.includes('b21secret'));
  now('serviceWorker', () => !!navigator.serviceWorker.controller);
  now('otherWindows', () => Array.from({ length: parent.frames.length }, (_, i) => parent.frames[i]).some(f => { if (f === window) return false; try { return !!f.document; } catch (e) { return false; } }));
  const later = (k, fn) => Promise.race([(async () => fn())().then(v => v ? 'reached' : 'blocked', () => 'blocked'), new Promise(res => setTimeout(() => res('blocked'), 2500))]).then(v => { r[k] = v; });
  const idb = name => new Promise((res, rej) => { const o = indexedDB.open(name); o.onsuccess = () => res(o.result.objectStoreNames.length > 0); o.onerror = () => rej(o.error); });
  await Promise.all([
    later('boardDatabase', () => idb('21Board')),
    later('historyDatabase', () => idb('21Board-history')),
    later('fetchBoard', () => fetch(document.baseURI).then(x => x.ok)),
    later('fetchSdk', () => fetch(new URL('sdk/board21.js', document.baseURI)).then(x => x.ok)),
    later('image', () => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(true); i.onerror = rej; i.src = new URL('icons/icon-192.png', document.baseURI); })),
    later('caches', async () => (await caches.keys()).length > 0),
    later('folder', async () => !!(await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board')))
  ]);
  // Pretends to be another 21Board tab that erased the board; puts markup in the board's own menu.
  try { new BroadcastChannel('21board-sync').postMessage({ tab: 'probe', keys: ['settings'], op: 'reload', erased: true }); } catch (e) { /* not even that */ }
  r.connected = await Board21.ready().then(ctx => !ctx.standalone);
  Board21.menu.set([{ id: 'a', label: 'A <i>', icon: '<svg viewBox="0 0 24 24"><style>#desk{outline:9px solid red}</style><img src="https://example.com/x.png"/><circle cx="12" cy="12" r="4"/></svg>' }]);
  window.__probe = r;
  document.getElementById('out').textContent = JSON.stringify(r, null, 1);
  await Board21.save({ probe: r });
})();
</script></body></html>`);
    const PROBES = ['parentDocument', 'parentBoard', 'topBoard', 'localStorage', 'cookie', 'serviceWorker', 'otherWindows', 'boardDatabase', 'historyDatabase', 'fetchBoard', 'fetchSdk', 'image', 'caches', 'folder'];
    const noSdk = W('no-sdk.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>No SDK tag</title></head><body><b id="s">waiting</b><script>
/* ${MARK} */ Board21.ready().then(ctx => { document.getElementById('s').textContent = ctx.standalone ? 'standalone' : 'connected'; Board21.save({ hi: 1 }); });
</script></body></html>`);
    const counter = v => W(`counter-${v}.html`, `<!DOCTYPE html><html><head><!-- Load it with <script src="../../sdk/board21.js"></script> --><script src="https://example.com/sdk/board21.js"></script>
<script type="application/json" id="board21-widget">{"id":"counter","name":"Counter <b>","window":{"width":300,"height":200}}</script>
</head><body><b id="v">${v}</b><script>/* ${MARK} */ Board21.ready().then(ctx => { document.body.dataset.on = ctx.standalone ? 'no' : 'yes'; });</script></body></html>`);
    const errors = [], csp = [];
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
    await ctx.addInitScript(DRIVE_PICK);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (/Content Security Policy/.test(m.text())) csp.push(m.text()); });
    const B = (fn, arg) => page.evaluate(fn, arg);
    const frame = (p, ik) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const records = p => p.evaluate(() => new Promise((res, rej) => { const o = indexedDB.open('21Board'); o.onerror = () => rej(o.error); o.onsuccess = () => { const q = o.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { o.result.close(); res(Object.fromEntries(q.result.map(r => [r.key, r.value]))); }; }; }));
    const settings = p => openSettings(p, ['advanced']);
    const dialogSays = async () => { const t = await page.locator('#modal.open').innerText().catch(() => ''); await page.click('#modal.open .btn').catch(() => {}); await page.waitForTimeout(150); return t; };
    await page.goto(BASE); await freeBoard(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });   // the offline copy is ready
    await B(() => { document.cookie = 'b21secret=1'; window.__board21.openWidget('notes'); });
    await page.waitForTimeout(1200);
    await fillNote(frame(page, 'notes:1'), 'Secret class note'); await page.waitForTimeout(500);

    // ---- Settings → Developer mode → Test a widget offers Upload file… only (no path to type).
    await settings(page);
    ok(await page.locator('#settings [data-act="dev-upload"]').count() === 0, 'Upload file… is hidden until Developer mode is on');
    await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(200);
    const devRows = await page.locator('#settings .row', { has: page.locator('[data-act="devmode"], [data-act="dev-upload"]') }).allInnerTexts();
    ok(await page.locator('#settings [data-act="dev-upload"].primary').count() === 1 && await page.locator('#set-dev-path, #settings [data-act="dev-add"]').count() === 0 &&
      await page.locator('#settings .row', { has: page.locator('[data-act="dev-upload"]') }).locator('input').count() === 0 && devRows.length === 2 && !/\bpath\b/i.test(devRows.join(' ')),
      'with Developer mode on, Test a widget offers Upload file… only: no path to type and no Add (' + JSON.stringify(devRows) + ')');
    // ---- Files that can't be used are refused, with a plain message.
    const txt = W('notes.txt', 'just text'), big = W('big.html', '<!DOCTYPE html><p>' + 'x'.repeat(5 * 1048576)), plain = W('plain.html', 'hello there');
    await page.setInputFiles('#widget-input', txt); await page.waitForTimeout(300);
    ok((await dialogSays()).includes('Choose the widget’s .html file.'), 'a file that isn’t .html is refused: “Choose the widget’s .html file.”');
    await page.setInputFiles('#widget-input', big); await page.waitForTimeout(500);
    ok((await dialogSays()).includes('at most 5 MB'), 'a file over 5 MB is refused, saying how big a widget file can be');
    await page.setInputFiles('#widget-input', plain); await page.waitForTimeout(300);
    ok((await dialogSays()).includes('isn’t a web page'), 'a file that isn’t a web page is refused');
    ok(await B(() => window.__board21.state.devFiles.size) === 0, 'nothing is kept from a refused file');

    // ---- Upload the probe with the button.
    await B(() => { window.__bc = 0; new BroadcastChannel('21board-sync').onmessage = e => { if (e.data && e.data.tab === 'probe') window.__bc++; }; });
    const before = await records(page);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#settings [data-act="dev-upload"]')]);
    await chooser.setFiles(probe);
    const ik = 'dev-probe:1';
    ok(await eventually(() => B(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected && !!(window.__board21.state.data.get(ik) || {}).probe; }, ik)),
      'the uploaded file opens in a window as “dev-probe”, connects, and its Board21.save reaches the board');
    const info = await B(ik => { const w = window.__board21.state.wins.get(ik); return { name: w.widget.name, sandbox: w.iframe.getAttribute('sandbox'), head: w.iframe.getAttribute('srcdoc').slice(0, 80), w: w.disp.w, h: w.disp.h, item: Array.from(document.querySelectorAll('#settings .inst-list')).pop().innerText }; }, ik);
    ok(info.name === 'Probe (test)' && info.w === 460 && info.h === 360, `it is named and sized from its manifest block (${info.name}, ${info.w}×${info.h - 40})`);
    ok(/Probe \(test\)\s*Uploaded file: probe\.html/.test(info.item), 'Settings lists it as an uploaded file by its file name: ' + JSON.stringify(info.item));
    ok(!/allow-same-origin/.test(info.sandbox) && info.head.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"'), `it runs sealed off (sandbox “${info.sandbox}”), the policy first in its page`);
    const r = await frame(page, ik).locator('html').evaluate(() => window.__probe);
    const reached = PROBES.filter(k => r[k] !== 'blocked');
    ok(r.origin === 'null' && reached.length === 0 && r.mode === 'CSS1Compat',
      `sealed off: parent.document, the board's globals, its databases (boards and board history), localStorage, cookies, the offline copy, other windows, the folder, and requests to the board's own address are all out of reach (${reached.length ? 'REACHED: ' + reached.join(', ') : 'all blocked'})`);
    const after = await records(page);
    const others = recs => JSON.stringify(Object.keys(recs).filter(k => !k.includes('dev-probe')).sort().map(k => [k, recs[k]]));
    ok(others(before) === others(after) && after['data:1:notes:1'].text === 'Secret class note', 'the board’s other records are unchanged');
    ok(await B(() => window.__bc) === 0 && await B(() => window.__board21.state.insts.has('notes:1')), 'it can’t talk to the board’s other tabs (pretending to be one that erased the board)');
    await page.keyboard.press('Escape');
    await page.click(`.win[data-ikey="${ik}"] .win-label`); await page.waitForTimeout(300);
    ok(await page.locator('#menu [data-id="a"]').innerText() === 'A <i>' && await page.locator('#menu img, #menu style, #menu [data-id="a"] svg').count() === 0 &&
      await B(() => getComputedStyle(document.getElementById('desk')).outlineStyle) !== 'solid', 'its menu items are shown as text, without icons: nothing it sends becomes markup in the board');
    await page.keyboard.press('Escape');
    await settings(page);
    ok(after['devfile:dev-probe'] && after['devfile:dev-probe'].src.includes(MARK), 'the file’s text is kept on this device (its own record, devfile:dev-probe)');

    // ---- A file with no SDK tag still connects.
    await page.setInputFiles('#widget-input', noSdk);
    ok(await eventually(async () => await frame(page, 'dev-no-sdk-tag:1').locator('#s').textContent() === 'connected'), 'a file with no SDK tag still connects (the SDK is put in for it)');

    // ---- It can't take its window to another site (where its policy wouldn't follow), and a page that takes its
    // place isn't the widget: the board stops talking to it.
    const away = BASE.replace('127.0.0.1', 'localhost') + '__dev/away.html';
    const leaver = (id, go) => W(id + '.html', `<!DOCTYPE html><html><head><script src="../../sdk/board21.js"></script>
<script type="application/json" id="board21-widget">{"id":"${id}","name":"${id}"}</script></head><body>${id}<script>
/* ${MARK} */ Board21.ready().then(async () => { await Board21.save({ note: 'class roster' }); setTimeout(() => { ${go} }, 300); });
</script></body></html>`);
    await page.setInputFiles('#widget-input', leaver('away', `location.href = ${JSON.stringify(away)} + '?' + encodeURIComponent(JSON.stringify(Board21.context.data));`));
    await page.setInputFiles('#widget-input', leaver('same-site', `location.href = 'widgets/notes/index.html';`));
    await page.setInputFiles('#widget-input', leaver('reloads', `location.reload();`));
    const left = ik => B(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.left && !w.connected && w.iframe.getAttribute('srcdoc').includes('This test widget left its page'); }, ik);
    ok(await eventually(() => left('dev-away:1')) && AWAY.length === 0, `a widget that sends its window to another site doesn’t get there (the other site isn’t even asked, ${AWAY.length} visits), and its window says it left its page`);
    ok(await eventually(() => left('dev-same-site:1')) && await eventually(() => left('dev-reloads:1')), 'one that goes to a page of this site, or reloads itself, gets the same note: the page in its place isn’t talked to');
    await page.waitForTimeout(500);
    ok(AWAY.length === 0 && await B(() => ['dev-away:1', 'dev-same-site:1', 'dev-reloads:1'].every(ik => window.__board21.state.data.get(ik).note === 'class roster')), 'their windows keep what the widget saved, and nothing more reaches the other site');
    await B(async () => { for (const ik of ['dev-away:1', 'dev-same-site:1', 'dev-reloads:1']) await window.__board21.deleteInstance(ik); });

    // ---- A second tab picks up an upload, a new version of it and its removal.
    const page2 = await ctx.newPage();
    page2.on('pageerror', e => errors.push('[tab 2] ' + e.message));
    await page2.goto(BASE); await page2.waitForTimeout(1500); await freeBoard(page2);
    await page.setInputFiles('#widget-input', counter('v1'));
    ok(await eventually(async () => await frame(page, 'dev-counter:1').locator('#v').textContent() === 'v1' && await frame(page, 'dev-counter:1').locator('body').getAttribute('data-on') === 'yes'),
      'a file whose SDK tag points elsewhere (after one in a comment) gets 21Board’s own SDK, and connects');
    ok(await eventually(async () => await frame(page2, 'dev-counter:1').locator('#v').textContent() === 'v1'), 'another tab shows the uploaded widget’s window too');
    ok(await B(() => window.__board21.state.wins.get('dev-counter:1').el.querySelector('.name').textContent) === 'Counter <b> (test)' &&
      await page.locator('.win[data-ikey="dev-counter:1"] .name b').count() === 0, 'its name is shown as text, never as markup');
    await page.setInputFiles('#widget-input', counter('v2'));
    ok(await eventually(async () => await frame(page, 'dev-counter:1').locator('#v').textContent() === 'v2'), 'uploading the same widget again replaces it: its open window shows the new version');
    ok(await eventually(async () => await frame(page2, 'dev-counter:1').locator('#v').textContent() === 'v2'), 'and so does the other tab’s');
    ok(await B(() => !window.__board21.state.insts.has('dev-counter:2') && window.__board21.state.devFiles.get('dev-counter').src.includes('v2')) &&
      await page.locator('.toast', { hasText: 'Counter <b> (test) is updated.' }).count() === 1, 'the same window, not a second one, and it says so');

    // ---- Nothing of the code leaves the device: Export (full and template), board history, the Drive folder.
    await page.keyboard.press('Escape');
    const download = async i => {
      await page.click(`.picker-btn.${i ? 'right' : 'left'}`); await page.click('[data-ctl="export"]'); await page.waitForTimeout(200);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`#modal .btn[data-i="${i}"]`)]);
      const p = dir + `export-${i}.21board`; await dl.saveAs(p); return fs.readFileSync(p, 'utf8');
    };
    const full = await download(0), tpl = await download(1);
    ok(JSON.parse(full).instances.some(i => i.widgetId === 'dev-probe' && i.data && i.data.probe) && JSON.parse(tpl).kind === 'template', 'the exports have the uploaded widgets’ windows (and, in a full backup, their content)');
    ok(![full, tpl].some(t => t.includes(MARK) || t.includes('devfile') || t.includes('probe.html')), 'but no trace of their code, in a full backup or a blank template');
    await B(async () => { await window.__board21.link.choose(); });   // (Board Sync writes this device's file at once)
    const vid = await B(() => window.__board21.history.save('With uploads'));
    await page.waitForTimeout(1500);
    const version = await B(async id => JSON.stringify((await window.__board21.history.get(id)).body), vid);
    const folder = JSON.stringify(await readFolder(page)), copies = JSON.stringify(await readHistory(page));
    ok(!!vid && version.includes('dev-probe') && !version.includes(MARK) && !version.includes('devfile'), 'a Board history version has the window but no trace of the code');
    ok(folder.includes('dev-probe') && copies.includes('dev-probe') && !folder.includes(MARK) && !copies.includes(MARK), 'nor does the board sent to the Google Drive folder, or its history copy there');

    // ---- After a reload: the window reopens, connects, and has what it saved.
    await page.reload(); await page.waitForTimeout(1500);
    ok(await eventually(() => frame(page, ik).locator('html').evaluate(() => !!(window.Board21 && Board21.context && !Board21.context.standalone && Board21.context.data.probe))),
      'after a reload the uploaded widget opens again, connects and gets what it saved');

    // ---- Remove: the widget and its stored text go, here and in the other tab.
    await settings(page);
    await page.click('#settings [data-act="dev-remove"][data-val="dev-counter"]'); await page.waitForTimeout(800);
    const gone = p => p.evaluate(() => !window.__board21.catalog().some(a => a.id === 'dev-counter') && !window.__board21.state.wins.has('dev-counter:1') && !window.__board21.state.devFiles.has('dev-counter'));
    ok(await gone(page) && !('devfile:dev-counter' in await records(page)), 'Remove takes the widget away and deletes its stored text');
    ok(await eventually(() => gone(page2)), 'in the other tab too');
    await page.keyboard.press('Escape');
    await page2.close();

    // ---- The new widgets, and the starter, uploaded as files: they work under the policy.
    ok(csp.some(t => t.includes('connect-src')) && csp.some(t => t.includes('img-src')), 'the policy is in force: the probe’s requests were refused by it');
    csp.length = 0;
    for (const [f, id] of [['widgets/task-timer/index.html', 'dev-task-timer'], ['widgets/first-then-board/index.html', 'dev-first-then-board'], ['widgets/_template/index.html', 'dev-my-widget']]) {
      await page.setInputFiles('#widget-input', path.join(ROOT, f));
      ok(await eventually(() => B(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, id + ':1')) &&
        await frame(page, id + ':1').locator('html').evaluate(() => !!document.documentElement.getAttribute('data-b21-theme') && document.body.innerText.trim().length > 0),
        `${f} uploaded as a file opens, connects and shows itself`);
    }
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + '95-uploaded-widgets.png' });
    ok(csp.length === 0, 'and nothing they do is refused by the policy: ' + csp.slice(0, 3).join(' | '));

    // ---- A crafted .21board file never brings code that runs.
    await B(() => { window.__pwned = 0; addEventListener('message', e => { if (e.data && e.data.pwned) window.__pwned++; }); });
    const EVIL = `<script>try { top.document.title = 'PWNED'; } catch (e) {} parent.postMessage({ pwned: 1 }, '*'); top.postMessage({ pwned: 1 }, '*');</script><img src=x onerror="parent.postMessage({ pwned: 1 }, '*')">`;
    const win = (widgetId, i, data, config) => ({ widgetId, instance: 1, open: true, z: i + 1, rect: { x: 20 + i * 300, y: 20, w: 280, h: 300 }, data, config });
    const crafted = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Crafted', devfile: EVIL, srcdoc: EVIL },
      devFiles: { 'dev-evil': { id: 'dev-evil', name: 'Evil', src: EVIL } }, records: [{ key: 'devfile:dev-evil', type: 'devfile', value: { id: 'dev-evil', name: 'Evil', src: EVIL, at: 1 } }],
      settings: { devMode: true, devWidgets: [{ id: 'dev-evil', name: 'Evil', entry: 'data:text/html,' + encodeURIComponent(EVIL) }] },
      instances: [win('dev-evil', 0, { src: EVIL, srcdoc: EVIL }, { src: EVIL }), win('dev-probe', 1, { src: EVIL }, { srcdoc: EVIL }), win('notes', 2, { text: 'from the file' }, null)] };
    fs.writeFileSync(dir + 'crafted.21board', JSON.stringify(crafted));
    await page.setInputFiles('#import-input', dir + 'crafted.21board'); await page.waitForTimeout(300);
    await page.click('#modal .btn:has-text("Replace this page")');   // Replace this page
    ok(await eventually(async () => await frame(page, 'notes:1').locator('#view').textContent() === 'from the file'), 'the crafted file is imported');
    await page.waitForTimeout(1500);
    const st = await B(() => { const b = window.__board21, s = b.state; return { pwned: window.__pwned, title: document.title, evil: b.catalog().some(a => a.id === 'dev-evil') || s.devFiles.has('dev-evil') || s.wins.has('dev-evil:1') || 'devWidgets' in s.settings, probe: s.devFiles.has('dev-probe') && s.wins.has('dev-probe:1') }; });
    const recs = await records(page);
    ok(st.pwned === 0 && st.title !== 'PWNED' && !st.evil && !('devfile:dev-evil' in recs),
      `nothing in it runs, and it can’t add a widget or a test widget’s code (${JSON.stringify(st)})`);
    ok(st.probe && recs['devfile:dev-probe'] && recs['inst:1:dev-evil:1'], 'the uploaded widgets stay (an import replaces the board, not this device’s test widgets); the file’s unknown widget is kept but not shown');

    // ---- Kiosk mode shows no Developer mode, even with it on.
    const kp = await ctx.newPage(); await kp.goto(BASE + '?kiosk=yes'); await kp.waitForTimeout(1200);
    await settings(kp);
    ok(await kp.locator('#settings [data-act="dev-upload"], #settings [data-act="devmode"]').count() === 0, 'kiosk mode has no Developer mode or Upload file…, even where it is on');
    await kp.close();

    // ---- Offline: the uploaded widget still opens and connects (its SDK comes from 21Board's offline copy).
    await ctx.setOffline(true);
    await page.reload(); await page.waitForTimeout(1500);
    ok(await eventually(() => B(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik)) &&
      await eventually(() => frame(page, ik).locator('html').evaluate(() => !!window.__probe && window.__probe.connected)), 'offline, an uploaded widget opens and connects');
    await ctx.setOffline(false);

    // ---- Erase everything removes uploaded widgets like the rest.
    await settings(page);
    await page.click('#settings [data-act="erase"]'); await page.waitForTimeout(200);
    await page.locator('#modal.open .btn', { hasText: /^Erase everything$/ }).click(); await page.waitForTimeout(1500);
    ok(!Object.keys(await records(page)).some(k => k.startsWith('devfile:')) && await B(() => window.__board21.state.devFiles.size === 0 && !window.__board21.catalog().some(a => a.sealed)), 'Erase everything deletes the uploaded widgets too');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- The board's policy follows its registry: a registered widget from another site still opens.
    const rc = await browser.newContext({ viewport: { width: 1400, height: 860 }, serviceWorkers: 'block' });
    await rc.route('**/widgets/registry.js', async r => r.fulfill({ status: 200, contentType: 'text/javascript',
      body: (await (await r.fetch()).text()) + `\nself.BOARD21_WIDGETS.push({ id: 'elsewhere', name: 'Elsewhere', entry: ${JSON.stringify(away + '?registered')} });` }));
    const rp = await rc.newPage(); await rp.goto(BASE); await rp.waitForTimeout(800);
    const seen = AWAY.length;
    await rp.evaluate(() => window.__board21.openWidget('elsewhere'));
    // (The registry's other sites are in the list too: the district apps.)
    const policy = await rp.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.split(' '));
    ok(await eventually(async () => AWAY.length > seen) && policy[0] === 'frame-src' && policy[1] === "'self'" && policy.includes(new URL(away).origin) &&
      ['https://sketchapp.ccsd21.org', 'https://timerapp.ccsd21.org', 'https://doccamapp.ccsd21.org'].every(o => policy.includes(o)),
      'a registered widget from another site still opens: the board allows its own site and the sites in its registry');
    await rc.close();

    // ---- A file that hangs (an endless loop). This browser, like iPad Safari, runs it in the board's own process,
    // so it freezes the board; its window would reopen, and freeze it, on every start.
    const hang = fixed => W('hang.html', `<!DOCTYPE html><html><head><script src="../../sdk/board21.js"></script>
<script type="application/json" id="board21-widget">{"id":"hang","name":"Hang"}</script></head><body><b id="b">running</b><script>
setTimeout(() => { let i = 0; while (i < 10) { ${fixed ? 'i++;' : '/* forgot i++ */'} } document.getElementById('b').textContent = 'fixed'; }, 300);
</script></body></html>`);
    const answers = (p, ms = 3000) => Promise.race([p.evaluate(() => true), new Promise(r => setTimeout(() => r(false), ms))]).catch(() => false);
    const hc = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const hp = await hc.newPage();
    await hp.goto(BASE); await hp.waitForTimeout(1200);
    await settings(hp); await hp.click('#settings [data-act="devmode"]'); await hp.waitForTimeout(200);
    await hp.setInputFiles('#widget-input', hang(false)); await hp.waitForTimeout(2500);
    if (await answers(hp)) ok(true, '(this browser keeps an uploaded widget in its own process: a hang can’t freeze the board, so nothing to check)');
    else {
      await hp.close({ runBeforeUnload: false }).catch(() => {});
      // The teacher gives up and opens 21Board again a minute later (the minute is pretended).
      const p2 = await hc.newPage();
      await p2.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('21board-devfile-starts') || '{}'); for (const k in s) s[k] -= 60000; localStorage.setItem('21board-devfile-starts', JSON.stringify(s)); } catch (e) { /* none */ } });
      await p2.goto(BASE); await p2.waitForTimeout(2500);
      const shows = (p, text) => p.evaluate(text => { const w = window.__board21.state.wins.get('dev-hang:1'); return !!w && (w.iframe.getAttribute('srcdoc') || '').includes(text); }, text);
      ok(await answers(p2) && await shows(p2, 'wasn’t started') && await shows(p2, 'stopped responding last time'),
        'after it froze the board, the next start leaves it stopped, and its window says so (the board can be used)');
      await settings(p2);
      ok(await p2.locator('#settings [data-act="dev-remove"][data-val="dev-hang"]').count() === 1, 'so it can be removed in Settings');
      await p2.setInputFiles('#widget-input', hang(true));
      ok(await eventually(async () => await p2.frameLocator('.win[data-ikey="dev-hang:1"] iframe').locator('#b').textContent() === 'fixed' && await p2.evaluate(() => window.__board21.state.wins.get('dev-hang:1').connected)),
        'uploading it again (fixed) starts it');
      await p2.close();
      // ?nodev: test widgets don't start, for a freeze the next start doesn't catch.
      const p3 = await hc.newPage();
      await p3.goto(BASE + '?nodev'); await p3.waitForTimeout(1500);
      ok(await p3.evaluate(() => !window.__board21.state.wins.has('dev-hang:1') && window.__board21.state.devFiles.has('dev-hang') && !window.__board21.catalog().some(a => a.sealed)), 'with ?nodev, uploaded widgets don’t start');
      await settings(p3);
      await p3.click('#settings [data-act="dev-remove"][data-val="dev-hang"]'); await p3.waitForTimeout(500);
      ok(await p3.evaluate(() => !window.__board21.state.devFiles.has('dev-hang') && localStorage.getItem('21board-devfile-starts') === '{}'), 'and one can be removed there');
    }
    await hc.close();
  }],

  // Release 2026.11.18-20: no browser menu on a right-click or a long press, except in text boxes and Developer mode.
  ['Right-click: no browser menu', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const B = fn => page.evaluate(fn);
    const frameOf = (p, ik) => p.frame({ name: 'b21-board:' + ik });
    const connected = (p, ik) => eventually(() => p.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
    // In a page or a window's frame, a listener the test adds last, on window: it runs after 21Board's and the SDK's,
    // and records whether the menu was turned off (defaultPrevented). Then a cancelable contextmenu at an element, as
    // a right-click, a long press, Ctrl+click, or the menu key sends it: 'prevented' or 'menu'.
    const RECORD = () => { if (!window.__menus) { window.__menus = []; window.addEventListener('contextmenu', e => window.__menus.push(e.defaultPrevented)); } return window.__menus.length; };
    const menuAt = (doc, sel) => doc.evaluate(([sel, RECORD]) => {
      new Function(RECORD)();
      const el = document.querySelector(sel);
      if (!el) return 'no ' + sel;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, button: 2, buttons: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      return window.__menus[window.__menus.length - 1] ? 'prevented' : 'menu';
    }, [sel, `(${RECORD})()`]);
    // A real right-click (the mouse's right button) at an element's middle: what the document it lands in recorded.
    const rightClick = async (doc, sel, off = { x: 0, y: 0 }) => {
      const n = await doc.evaluate(new Function(`return (${RECORD})()`));
      const r = await doc.evaluate(sel => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
      await page.mouse.click(off.x + r.x, off.y + r.y, { button: 'right' }); await page.waitForTimeout(250);
      return doc.evaluate(n => window.__menus.length > n ? (window.__menus[window.__menus.length - 1] ? 'prevented' : 'menu') : 'none', n);
    };
    const frameBox = ik => page.locator(`.win[data-ikey="${ik}"] iframe`).boundingBox();

    // ---- 1. Off on the board: the empty board and its hint, a window's title bar and grip, the Widget Picker, Settings,
    // a dialog, Board history, a message, and a padlock.
    ok(await menuAt(page, '#desk') === 'prevented', 'the empty board');
    ok(await menuAt(page, '#empty-hint') === 'prevented', 'the empty board’s hint');
    // ---- 2 (on the board). A real right-click, with the mouse's right button.
    ok(await rightClick(page, '#desk') === 'prevented', 'a real right-click on the board');
    const tm = await B(() => window.__board21.openWidget('timer')); await connected(page, tm);
    await B(() => window.__board21.focusWin('timer:1')); await page.waitForTimeout(200);
    ok(await menuAt(page, `.win[data-ikey="${tm}"] .win-title`) === 'prevented', 'a window’s title bar');
    ok(await menuAt(page, `.win[data-ikey="${tm}"] .win-label`) === 'prevented', 'its name, which opens the window menu');
    ok(await menuAt(page, `.win[data-ikey="${tm}"] .grip.se`) === 'prevented', 'a resize handle');
    await page.click('.picker-btn.left'); await page.waitForSelector('#panel.open');
    ok(await menuAt(page, '#panel.open [data-widget="timer"]') === 'prevented', 'a Widget Picker tile');
    ok(await menuAt(page, '.picker-btn.left') === 'prevented', '▦');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await openSettings(page, ['advanced']);
    ok(await menuAt(page, '#settings .row') === 'prevented', 'a Settings row');
    ok(await menuAt(page, '#settings [data-act="devmode"]') === 'prevented', 'a switch in Settings');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await B(() => { window.__board21.pages.rename(); }); await page.waitForSelector('#modal.open input');
    ok(await menuAt(page, '#modal.open .modal-card h3, #modal.open .modal-card') === 'prevented', 'a dialog (Rename this page…)');
    ok(await menuAt(page, '#modal.open .btn') === 'prevented', 'a dialog’s button');
    // ---- 3 (on the board). A text box keeps its menu: spell-check, Cut, Copy, and Paste.
    ok(await menuAt(page, '#modal.open input') === 'menu', 'the Rename this page… box keeps its menu');
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.waitForTimeout(200);
    await B(() => window.__board21.historySheet.open('left')); await page.waitForSelector('#history:not([hidden])', { timeout: 5000 }).catch(() => {});
    ok(await menuAt(page, '#history') === 'prevented', 'Board history');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await B(() => window.__board21.closeWin('timer:1')); await page.waitForSelector('#toasts .toast');
    ok(await menuAt(page, '#toasts .toast') === 'prevented', 'a message');
    await B(() => window.__board21.openWidget('timer')); await connected(page, 'timer:1');
    await lockBoard(page, 'widgets');
    ok(await menuAt(page, '.lock-pad.left') === 'prevented', 'a padlock');
    await unlockBoard(page);

    // ---- 1 (in widgets). Off inside every widget that uses the SDK: a Timer's digits, a Picture's picture, and the
    // Name Picker's wheel.
    ok(await menuAt(frameOf(page, 'timer:1'), '#display') === 'prevented', 'inside a Timer: its digits');
    const pic = await B(() => window.__board21.openWidget('image')); await connected(page, pic);
    await picOpen(page, picFile('pic.png', await drawPic(page, 320, 200)), pic);
    ok(await menuAt(frameOf(page, pic), '#img') === 'prevented', 'inside a Picture: the picture');
    const np = await B(() => window.__board21.openWidget('name-picker')); await connected(page, np);
    const npf = frameOf(page, np);
    // ---- 3 (in widgets). The Name Picker's list keeps its menu, then its wheel doesn't.
    if (!await npf.locator('#list').isVisible()) { await page.click(`.win[data-ikey="${np}"] .win-label`); await page.locator('#menu [data-act="widget"]', { hasText: /names/i }).first().click(); await page.waitForTimeout(300); }
    ok(await menuAt(npf, '#list') === 'menu', 'the Name Picker’s list keeps its menu');
    await npf.locator('#list').fill('Ada\nBen\nCy\nDee'); await npf.locator('#done').click(); await page.waitForTimeout(600);
    ok(await menuAt(npf, '.wheel') === 'prevented', 'inside the Name Picker: the wheel');
    const nt = await B(() => window.__board21.openWidget('notes')); await connected(page, nt);
    const ntf = frameOf(page, nt);
    await fillNote(page.frameLocator(`.win[data-ikey="${nt}"] iframe`), 'Line up by the door');
    ok(await menuAt(ntf, '#t') === 'menu', 'Notes’ text keeps its menu');
    const vp = await B(() => window.__board21.openWidget('youtube-player')); await connected(page, vp);
    ok(await menuAt(frameOf(page, vp), '#link') === 'menu', 'the Video Player’s link box keeps its menu');
    ok(await menuAt(frameOf(page, vp), '#ask h1') === 'prevented', 'and the Video Player’s title doesn’t');

    // ---- 2 (in widgets). A real right-click inside a widget, and in a text box there.
    await B(() => window.__board21.focusWin('timer:1')); await page.waitForTimeout(300);
    const tb = await frameBox('timer:1');
    ok(await rightClick(frameOf(page, 'timer:1'), '#display', { x: tb.x, y: tb.y }) === 'prevented', 'a real right-click inside a Timer');
    // (Notes shows its text with tappable links until tapped; tapped, it is a text box.)
    const nb = await frameBox(nt);
    await page.frameLocator(`.win[data-ikey="${nt}"] iframe`).locator('#view').click(); await page.waitForTimeout(300);
    ok(await rightClick(ntf, '#t', { x: nb.x, y: nb.y }) === 'menu', 'a real right-click in Notes’ text, once tapped, keeps the menu');
    ok(await B(() => window.__board21.state.wins.size) === 5 && !await page.locator('#modal.open').count(), 'and nothing else happens');

    // ---- 4. Developer mode: the menu everywhere on the board at once, and in a widget opened after. A widget opened
    // before stays as it was until it's opened again.
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(300);
    ok(await menuAt(page, '#settings .row') === 'menu', 'Developer mode on: Settings has the menu at once');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await menuAt(page, '#desk') === 'menu' && await menuAt(page, '.win[data-ikey="timer:1"] .win-title') === 'menu', 'and so do the board and a title bar');
    const t2 = await B(() => window.__board21.openWidget('timer', { fresh: true })); await connected(page, t2); await page.waitForTimeout(300);
    ok(await menuAt(frameOf(page, t2), '#display') === 'menu', 'a Timer opened after has the menu');
    ok(await menuAt(frameOf(page, 'timer:1'), '#display') === 'prevented', 'a Timer opened before stays as it was');
    await B(() => window.__board21.closeWin('timer:1')); await page.waitForTimeout(300);
    await B(() => window.__board21.openWidget('timer')); await connected(page, 'timer:1'); await page.waitForTimeout(300);
    const reopened = await B(() => Array.from(window.__board21.state.wins.keys()).filter(k => k.startsWith('timer:')));
    ok(reopened.length === 2 && (await Promise.all(reopened.map(k => menuAt(frameOf(page, k), '#display')))).every(m => m === 'menu'), `once opened again, it has the menu too (${reopened.join(', ')})`);
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await menuAt(page, '#desk') === 'prevented', 'Developer mode off: off again on the board at once');
    await page.reload(); await boardUp(page); await page.waitForTimeout(800);
    const after = await B(() => Array.from(window.__board21.state.wins.keys()).filter(k => k.startsWith('timer:')));
    for (const k of after) await connected(page, k);
    ok(after.length && (await Promise.all(after.map(k => menuAt(frameOf(page, k), '#display')))).every(m => m === 'prevented'), `and in its widgets after a reload (${after.join(', ')})`);

    // ---- 5. The widget dev window, and a widget on its own: unchanged (the menu stays).
    const dv = await ctx.newPage();   // (no error listener: the test widget throws on purpose, see DEV_WIDGET)
    await dv.goto(BASE + '__dev/widget.html'); await dv.waitForTimeout(2500);
    const kids = f => dv.frames().filter(x => x.parentFrame() === f), dboard = kids(dv.mainFrame())[0], dwidget = dboard && kids(dboard)[0];
    ok(!!dwidget && await menuAt(dwidget, '#n') === 'menu', 'the widget dev window: the widget keeps the menu');
    ok(!!dboard && await menuAt(dboard, '.win .win-title') === 'menu' && await menuAt(dv.mainFrame(), 'body') === 'menu', 'and so do its window and the page around it');
    await dv.goto('about:blank'); await dv.goto(BASE + '__dev/widget.html#b21-bare'); await dv.waitForTimeout(1500);   // (a new load, not just a new #)
    ok(await dv.evaluate(() => !!window.Board21 && Board21.context && Board21.context.standalone) && await menuAt(dv, '#n') === 'menu', 'a widget on its own keeps the menu');
    await dv.close();

    // ---- 6. Kiosk mode: off, as on the board.
    const kp = await ctx.newPage(); kp.on('pageerror', e => errors.push('kiosk: ' + e.message));
    await kp.goto(BASE + '?kiosk=yes'); await boardUp(kp);
    ok(await menuAt(kp, '#desk') === 'prevented', 'kiosk mode: the board');
    const kt = await kp.evaluate(() => Array.from(window.__board21.state.wins.keys()).find(k => k.startsWith('timer:')) || window.__board21.openWidget('timer'));
    await connected(kp, kt);
    ok(await menuAt(frameOf(kp, kt), '#display') === 'prevented', 'kiosk mode: inside a Timer');
    await kp.close();

    // WIDGET-SDK: a widget's own menu calls preventDefault(), or in Developer mode and the dev window, where the SDK
    // leaves the browser's menu on, both show.
    const sdkDoc = fs.readFileSync(path.join(ROOT, 'docs', 'WIDGET-SDK.md'), 'utf8').replace(/\s+/g, ' ');
    ok(/`contextmenu`/.test(sdkDoc) && /`preventDefault\(\)`/.test(sdkDoc), 'WIDGET-SDK: a menu of your own listens for contextmenu and calls preventDefault()');

    await page.screenshot({ path: OUT + 'right-click-board.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ];
};
