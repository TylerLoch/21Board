// Languages: the words tables and the SDK's words engine (Node), and on the board: each window's language from its
// menu, the default for new windows, and the pseudo language.
'use strict';
module.exports = T => {
  const { path, fs, ok, OUT, TESTS_DIR, BASE, boardUp, freeBoard, openSettings, lockBoard, unlockBoard, eventually, frameNamed, wordsOf } = T;
  const MINS = [1, 2, 3, 5, 10, 15];
  const NAMES = ['English', 'Español', 'Русский', 'Українська'], CODES = ['en', 'es', 'ru', 'uk'];
  // A window's frame name, its saved record, and whether it is up (the SDK's hello answered).
  const frameName = (p, ik) => { const f = frameNamed(p, ik); return f ? f.name() : null; };
  const instOf = (p, ik) => p.evaluate(ik => { const i = window.__board21.state.insts.get(ik); return i ? JSON.parse(JSON.stringify(i)) : null; }, ik);
  const up = (p, ik) => eventually(() => p.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
  // Run fn in a window's page, found by its frame's name (with or without a language).
  const inWin = async (p, ik, fn, arg) => { let f = null; for (let i = 0; i < 60 && !(f = frameNamed(p, ik)); i++) await p.waitForTimeout(100); return f.evaluate(fn, arg); };
  // The board's own rows at the end of the window menu (after its last line), by label.
  const menuEnd = p => p.evaluate(() => { const k = Array.from(document.getElementById('menu').children); return k.slice(k.map(e => e.classList.contains('menu-sep')).lastIndexOf(true) + 1).map(e => (e.querySelector('.label') || e).textContent.trim()).join(' | '); });
  const openMenu = async (p, ik) => { await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.waitForSelector('#menu.open'); };
  const flyout = p => p.evaluate(() => {
    const m = document.getElementById('menu'), f = document.getElementById('menu-sub'), row = m.querySelector('[data-act="lang"]');
    const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    return { open: f.classList.contains('open'), menuOpen: m.classList.contains('open'), expanded: row ? row.getAttribute('aria-expanded') : null, menu: box(m), sub: box(f), vw: innerWidth, vh: innerHeight,
      items: Array.from(f.querySelectorAll('[role="menuitemradio"]'), b => ({ label: b.textContent.trim(), lang: b.lang, id: b.dataset.id, checked: b.getAttribute('aria-checked'), tick: !!b.querySelector('svg.check') })) };
  });
  const choose = async (p, ik, code) => { await openMenu(p, ik); await p.click('#menu [data-act="lang"]'); await p.waitForSelector('#menu-sub.open'); await p.click(`#menu-sub [data-id="${code}"]`); };
  const words = (p, ik) => inWin(p, ik, () => Board21.__words());
  const clean = w => !!w && !w.missing.length && !w.fallback.length;
  return [
  ['Languages: the Node check of every words table (tests/words.js)', async () => {
    const r = require('child_process').spawnSync(process.execPath, [path.join(TESTS_DIR, 'words.js')], { encoding: 'utf8', timeout: 60e3 });
    const m = /(\d+) passed, (\d+) failed/.exec(r.stdout || '');
    for (const line of String(r.stdout || '').split('\n').filter(l => /^FAIL /.test(l)).slice(0, 20)) console.log('   ' + line.trim());
    ok(r.status === 0 && m && +m[2] === 0 && +m[1] > 0, `tests/words.js: ${m ? `${m[1]} passed, ${m[2]} failed` : 'no result'}${!m ? ': ' + String(r.stderr || '').split('\n').slice(0, 4).join(' ') : ''}`);
  }],

  ['Languages: the Language row and its flyout, saved with the window, the default for new windows, two tabs, export and import, Lock, and the keyboard', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const B = (fn, arg) => page.evaluate(fn, arg);
    const ES = wordsOf('timer', 'es'), EN_TL = wordsOf('traffic-light', 'en'), RU_TL = wordsOf('traffic-light', 'ru');

    // 1. A Timer's menu: Zoom to fill, then Language with a globe and English, then Reset… and Close.
    await B(() => window.__board21.openWidget('timer')); await up(page, 'timer:1');
    await B(() => window.__board21.setRect('timer:1', { x: 200, y: 60, w: 400, h: 330 })); await page.waitForTimeout(300);
    await openMenu(page, 'timer:1');
    const row = await B(() => { const r = document.querySelector('#menu [data-act="lang"]'), v = r && r.querySelector('.value'), g = r && r.querySelector('.icon-slot svg');
      return r && { label: r.querySelector('.label').textContent, value: v && v.textContent, lang: v && v.lang, popup: r.getAttribute('aria-haspopup'), expanded: r.getAttribute('aria-expanded'), globe: !!g && /<circle cx="12" cy="12" r="9"/.test(g.innerHTML) && /M3 12h18/.test(g.innerHTML) }; });
    const end1 = await menuEnd(page);
    ok(end1 === 'Zoom to fill | Language | Reset… | Close' && row && row.label === 'Language' && row.value === 'English' && row.lang === 'en' && row.popup === 'menu' && row.expanded === 'false' && row.globe,
      `a Timer’s menu ends Zoom to fill, Language, Reset…, and Close; the row has the globe, “Language”, and English muted on its right (${end1}; ${JSON.stringify(row)})`);

    // 2. A tap on the row opens the four languages beside the menu, each in its own words, English checked.
    await page.click('#menu [data-act="lang"]'); await page.waitForSelector('#menu-sub.open'); await page.waitForTimeout(300);
    let fl = await flyout(page);
    ok(fl.open && fl.sub.l >= fl.menu.r && fl.items.map(i => i.label).join() === NAMES.join() && fl.items.map(i => i.lang).join() === CODES.join() &&
      fl.items.map(i => i.checked).join() === 'true,false,false,false' && fl.items[0].tick && !fl.items.slice(1).some(i => i.tick) && fl.expanded === 'true',
      `tapping Language opens English, Español, Русский, and Українська to the right of the menu, English checked (${JSON.stringify(fl)})`);
    await page.screenshot({ path: OUT + 'language-flyout.png' });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

    // 3. A running Timer switched to Español: the menu closes, the window starts again in Spanish, still running.
    await inWin(page, 'timer:1', () => document.getElementById('go').click()); await page.waitForTimeout(400);
    const ends = (await B(() => window.__board21.state.data.get('timer:1'))).endsAt;
    await B(() => { window.__board21.state.wins.get('timer:1').iframe.dataset.old = '1'; });
    await choose(page, 'timer:1', 'es');
    const closed = await B(() => !document.getElementById('menu').classList.contains('open') && !document.getElementById('menu-sub').classList.contains('open'));
    ok(await eventually(async () => frameName(page, 'timer:1') === 'b21-board:timer:1;es') && await up(page, 'timer:1'), `(the Timer starts again as b21-board:timer:1;es: ${frameName(page, 'timer:1')})`);
    await page.waitForTimeout(400);
    const es = await inWin(page, 'timer:1', () => ({ language: Board21.language, context: Board21.context && Board21.context.language, name: window.name, html: document.documentElement.lang,
      chips: Array.from(document.querySelectorAll('#chips button'), b => b.textContent).join(), go: document.getElementById('go').getAttribute('aria-label') }));
    const after = await B(() => ({ inst: window.__board21.state.insts.get('timer:1').language, data: window.__board21.state.data.get('timer:1'), fresh: !window.__board21.state.wins.get('timer:1').iframe.dataset.old,
      title: document.querySelector('.win[data-ikey="timer:1"] .win-label .name').textContent }));
    ok(closed && after.inst === 'es' && after.fresh && es.language === 'es' && es.context === 'es' && es.name === 'b21-board:timer:1;es' && es.html === 'es-US' &&
      es.chips === MINS.map(n => ES.t('chip.min', { n })).join() && es.go === ES.t('b21.pause') && after.data.endsAt === ends && after.title === 'Timer',
      `Español: the menu closes, the window starts again in Spanish (its name, Board21.language, and the context agree), still running, and its title bar stays “Timer” (${JSON.stringify({ es, after })})`);

    // 4. Its own language again: nothing starts again.
    await B(() => { window.__board21.state.wins.get('timer:1').iframe.dataset.old = '1'; });
    await choose(page, 'timer:1', 'es'); await page.waitForTimeout(600);
    ok(await B(() => !!window.__board21.state.wins.get('timer:1').iframe.dataset.old && !document.getElementById('menu').classList.contains('open')), 'choosing Español again closes the menu, and the window doesn’t start again');

    // 5. A second Timer opens in English.
    await B(() => window.__board21.openWidget('timer')); await up(page, 'timer:2');
    const t2 = await instOf(page, 'timer:2');
    ok(t2 && !('language' in t2) && frameName(page, 'timer:2') === 'b21-board:timer:2', `a second Timer opens in English: no language saved, frame b21-board:timer:2 (${frameName(page, 'timer:2')})`);

    // 6. Another tab of the board: Українська chosen there reaches this one.
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push('tab 2: ' + e.message));
    await p2.goto(BASE); await boardUp(p2); await up(p2, 'timer:1');
    await choose(p2, 'timer:1', 'uk');
    ok(await eventually(async () => frameName(page, 'timer:1') === 'b21-board:timer:1;uk'), `Українська chosen in another tab: this tab’s Timer follows (${frameName(page, 'timer:1')})`);
    await p2.close();

    // 7. A reload keeps both. Reset, then its Undo (Board history's Put back): still Українська.
    await page.reload(); await boardUp(page); await up(page, 'timer:1'); await up(page, 'timer:2');
    ok(frameName(page, 'timer:1') === 'b21-board:timer:1;uk' && frameName(page, 'timer:2') === 'b21-board:timer:2', `after a reload: Timer 1 in Українська, Timer 2 in English (${frameName(page, 'timer:1')}, ${frameName(page, 'timer:2')})`);
    await openMenu(page, 'timer:1'); await page.click('#menu [data-act="reset"]'); await page.click('#menu [data-act="reset-yes"]');
    const undo = page.locator('#toasts .toast', { hasText: 'was reset.' }).locator('button', { hasText: 'Undo' });
    await undo.waitFor({ timeout: 8000 }); await page.waitForTimeout(300); await undo.click();
    await page.waitForTimeout(1500); await up(page, 'timer:1');
    ok(await eventually(async () => frameName(page, 'timer:1') === 'b21-board:timer:1;uk') && (await instOf(page, 'timer:1')).language === 'uk',
      `Reset, then its Undo: the window comes back in Українська (${frameName(page, 'timer:1')}, ${(await instOf(page, 'timer:1')).language})`);

    // 8. Settings › Classroom › Default widget language, the first row: English, then Русский.
    await openSettings(page);
    const first = await B(() => { const h = Array.from(document.querySelectorAll('#settings .sheet-body > h3')).find(e => e.textContent === 'Classroom'), r = h && h.nextElementSibling;
      return r && { label: r.querySelector('.lbl').textContent, value: r.querySelector('.v').textContent, act: r.dataset.val }; });
    ok(first && first.label === 'Default widget language' && first.value === 'English' && first.act === 'widget-language', `Settings › Classroom: the first row is Default widget language, English (${JSON.stringify(first)})`);
    await openSettings(page, ['widget-language']);
    const grp = await B(() => { const g = document.getElementById('grp-widget-language');
      return { hint: g.querySelector('.hint').textContent, cards: Array.from(g.querySelectorAll('.lang-opt'), c => ({ b: c.querySelector('b').textContent, lang: c.querySelector('b').lang, small: c.querySelector('small') ? c.querySelector('small').textContent : null, checked: c.getAttribute('aria-checked') })),
        group: g.querySelector('[role="radiogroup"]').getAttribute('aria-label') }; });
    ok(grp.hint === 'New windows start in this language.' && grp.cards.map(c => c.b).join() === NAMES.join() && grp.cards.map(c => c.lang).join() === CODES.join() &&
      grp.cards.map(c => c.small).join() === ',Spanish,Russian,Ukrainian' && grp.cards[0].small === null && grp.cards[0].checked === 'true' && grp.group === 'Default widget language',
      `open: “New windows start in this language.”, four cards in their own words, Spanish, Russian, and Ukrainian under the last three (${JSON.stringify(grp)})`);
    await page.click('#settings [data-act="widget-language"][data-val="ru"]');
    ok(await eventually(() => B(() => window.__board21.state.settings.widgetLanguage === 'ru' && document.querySelector('#settings [data-val="widget-language"] .v').textContent === 'Русский')),
      'Русский chosen: the setting is saved, and the row reads Русский');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // 9. A new Traffic Light opens in Русский; its title bar stays English. Notes declares no languages.
    await B(() => window.__board21.openWidget('traffic-light')); await up(page, 'traffic-light:1');
    await B(() => window.__board21.setRect('traffic-light:1', { x: 700, y: 60, w: 220, h: 420 })); await page.waitForTimeout(300);
    const red = await inWin(page, 'traffic-light:1', () => document.querySelector('.lamp.red').getAttribute('aria-label'));
    await inWin(page, 'traffic-light:1', () => document.querySelector('.lamp.red').click());
    const said = await eventually(async () => await B(() => document.querySelector('.win[data-ikey="traffic-light:1"] .sub').textContent) === EN_TL.t('red'));
    ok(said && (await instOf(page, 'traffic-light:1')).language === 'ru' && red === RU_TL.t('red'),
      `a new Traffic Light opens in Русский, its red lamp named ${RU_TL.t('red')}; tapped, its title bar says ${EN_TL.t('red')} (${red})`);
    await B(() => window.__board21.openWidget('notes')); await up(page, 'notes:1');
    await openMenu(page, 'notes:1');
    const notes = { inst: await instOf(page, 'notes:1'), row: await page.locator('#menu [data-act="lang"]').count(), name: frameName(page, 'notes:1') };
    await page.keyboard.press('Escape');
    ok(!('language' in notes.inst) && notes.row === 0 && notes.name === 'b21-board:notes:1', `Notes, which has no languages: none saved, no Language row, and a plain frame name (${JSON.stringify({ row: notes.row, name: notes.name })})`);

    // 10. Timer 2 closed, then opened again from the Widget Picker: it keeps its English.
    await B(() => window.__board21.closeWin('timer:2')); await page.waitForTimeout(400);
    await page.click('.picker-btn.left'); await page.click('#panel [data-widget="timer"]'); await up(page, 'timer:2');
    ok(!('language' in (await instOf(page, 'timer:2'))) && frameName(page, 'timer:2') === 'b21-board:timer:2', `Timer 2 opened again from the Widget Picker keeps its English (${frameName(page, 'timer:2')})`);

    // 11. Words the board shows that a teacher or student wrote are kept from the browser's translation.
    await page.click('.picker-btn.left'); await page.click('[data-ctl="pages"]'); await page.waitForSelector('#pages-menu.open');
    const tr = await B(() => ({ sub: document.querySelector('.win[data-ikey="traffic-light:1"] .win-label .sub').getAttribute('translate'),
      pages: Array.from(document.querySelectorAll('#pages-menu .page-item .label'), l => l.getAttribute('translate')) }));
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    ok(tr.sub === 'no' && tr.pages.length && tr.pages.every(t => t === 'no'), `translate="no" on a title bar’s status and on the page names in the Pages menu (${JSON.stringify(tr)})`);

    // 12. Export and import carry each window's language, and the default widget language.
    const exp = await B(async () => ({ full: await window.__board21.buildExport('full'), tpl: await window.__board21.buildExport('template') }));
    const langOf = (e, w, n) => { const i = e.instances.find(x => x.widgetId === w && x.instance === n); return i ? i.language || 'en' : null; };
    ok(langOf(exp.full, 'timer', 1) === 'uk' && langOf(exp.full, 'traffic-light', 1) === 'ru' && !exp.full.instances.filter(i => i.widgetId === 'notes' || (i.widgetId === 'timer' && i.instance === 2)).some(i => 'language' in i) &&
      exp.full.widgetLanguage === 'ru' && langOf(exp.tpl, 'timer', 1) === 'uk' && langOf(exp.tpl, 'traffic-light', 1) === 'ru',
      `a full backup and a template keep each window’s language (none for English), and the backup the default widget language (${JSON.stringify(exp.full.instances.map(i => [i.widgetId, i.instance, i.language]))}; ${exp.full.widgetLanguage})`);
    await openSettings(page, ['widget-language']); await page.click('#settings [data-act="widget-language"][data-val="en"]');
    await eventually(() => B(() => window.__board21.state.settings.widgetLanguage === 'en')); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    fs.writeFileSync(OUT + 'languages-backup.21board', JSON.stringify(exp.full));
    const before = new Set(await B(() => Array.from(window.__board21.state.insts.keys())));
    await page.setInputFiles('#import-input', OUT + 'languages-backup.21board');
    const sub = (await page.locator('#modal.open .btn', { hasText: 'Replace this page' }).innerText()).replace(/\s+/g, ' ');
    await page.locator('#modal.open .btn', { hasText: 'Add to this page' }).click();
    await page.locator('#toasts .toast', { hasText: /^Added \d+ windows?\./ }).first().waitFor();
    await page.waitForTimeout(1200);
    const added = (await B(() => Array.from(window.__board21.state.insts.entries(), ([k, i]) => [k, i.widgetId, i.language || 'en']))).filter(([k]) => !before.has(k));
    const addedLangs = w => added.filter(a => a[1] === w).map(a => a[2]).sort().join();
    ok(/So is the default widget language\./.test(sub) && addedLangs('timer') === 'en,uk' && addedLangs('traffic-light') === 'ru' && await B(() => window.__board21.state.settings.widgetLanguage) === 'en' &&
      await eventually(async () => added.filter(a => a[2] !== 'en').every(a => frameName(page, a[0]) === `b21-board:${a[0]};${a[2]}`)),
      `Import: Replace says “So is the default widget language.”; Add opens the windows in the file’s languages, and the default stays English (${sub}; ${JSON.stringify(added)})`);

    // 13. Locked from another tab with the flyout open: both close. Locked, no Language row. Unlocked with the menu open:
    // the row is back, and the flyout stays closed.
    const p3 = await ctx.newPage(); p3.on('pageerror', e => errors.push('tab 3: ' + e.message));
    await p3.goto(BASE); await boardUp(p3);
    await openMenu(page, 'timer:1'); await page.click('#menu [data-act="lang"]'); await page.waitForSelector('#menu-sub.open');
    await lockBoard(p3, 'widgets');
    ok(await eventually(() => B(() => !document.getElementById('menu').classList.contains('open') && !document.getElementById('menu-sub').classList.contains('open'))), 'locked from another tab: the menu and its flyout close');
    await openMenu(page, 'timer:1');
    const lockedRow = await page.locator('#menu [data-act="lang"]').count();
    await unlockBoard(p3);
    ok(lockedRow === 0 && await eventually(async () => await page.locator('#menu.open [data-act="lang"]').count() === 1) && !(await flyout(page)).open,
      `locked, the menu has no Language row; unlocked with it open, the row is back and the flyout stays closed (${lockedRow})`);
    await page.keyboard.press('Escape'); await p3.close();

    // 14. The keyboard: Enter on the name, down to Language, Enter, the arrows, Escape twice; then English with Enter.
    const focus = () => B(() => { const a = document.activeElement; return a ? (a.closest('#menu-sub') ? 'sub:' + a.dataset.id : a.closest('#menu') ? 'menu:' + (a.dataset.act === 'lang' ? 'lang' : a.dataset.act) : a.classList.contains('win-label') ? 'name:' + a.closest('.win').dataset.ikey : a.tagName) : null; });
    const toLang = async () => { for (let i = 0; i < 30 && await focus() !== 'menu:lang'; i++) await page.keyboard.press('ArrowDown'); };
    await page.focus('.win[data-ikey="timer:1"] .win-label'); await page.keyboard.press('Enter'); await page.waitForSelector('#menu.open');
    await toLang();
    const keys = [await focus()];
    await page.keyboard.press('Enter'); await page.waitForTimeout(200); keys.push(await focus(), (await flyout(page)).open);
    await page.keyboard.press('ArrowDown'); keys.push(await focus());
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100); keys.push(await focus(), (await flyout(page)).open);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200); keys.push(await focus(), (await flyout(page)).open);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100); keys.push(await focus(), (await flyout(page)).open, (await flyout(page)).menuOpen);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100); keys.push(await focus(), (await flyout(page)).menuOpen);
    ok(keys.join() === 'menu:lang,sub:uk,true,sub:en,menu:lang,false,sub:uk,true,menu:lang,false,true,name:timer:1,false',
      `the keyboard: Enter opens the flyout at Українська, ArrowDown moves, ArrowLeft closes it on the row, ArrowRight opens it, Escape closes only it, then the menu (${keys.join()})`);
    await page.keyboard.press('Enter'); await page.waitForSelector('#menu.open'); await toLang();
    await page.keyboard.press('Enter'); await page.waitForTimeout(200); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    ok(await eventually(async () => frameName(page, 'timer:1') === 'b21-board:timer:1') && !('language' in (await instOf(page, 'timer:1'))) && await focus() === 'name:timer:1',
      `English chosen with Enter: the window starts again in English, nothing saved, the keyboard on its name (${frameName(page, 'timer:1')}; ${await focus()})`);

    // 15. Near the board's right edge, the flyout opens on the menu's left, on screen. (At Size 70% the menu opens under
    // the window's name, so it is at the edge too.)
    await B(() => window.__board21.setBoardScale(0.7)); await page.waitForTimeout(400);
    await B(() => window.__board21.setRect('timer:1', { x: innerWidth / 0.7 - 410, y: 60, w: 400, h: 330 })); await page.waitForTimeout(400); await up(page, 'timer:1');
    await openMenu(page, 'timer:1'); await page.click('#menu [data-act="lang"]'); await page.waitForSelector('#menu-sub.open'); await page.waitForTimeout(300);
    fl = await flyout(page);
    ok(fl.sub.r <= fl.menu.l + 0.5 && fl.sub.l >= 0 && fl.sub.t >= 0 && fl.sub.r <= fl.vw && fl.sub.b <= fl.vh, `at the right edge the flyout opens on the menu’s left, fully on screen (${JSON.stringify({ menu: fl.menu, sub: fl.sub })})`);
    await page.screenshot({ path: OUT + 'language-flyout-edge.png' });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

    // 16. No page errors, and every window found all its words.
    const ws = {};
    for (const ik of await B(() => Array.from(window.__board21.state.wins.keys()))) ws[ik] = await words(page, ik);
    ok(Object.values(ws).every(clean), `every window found all its words (${JSON.stringify(ws)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  ['Languages: every converted widget in the pseudo language, inside the board: no English left, nothing cut off', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const B = (fn, arg) => page.evaluate(fn, arg);
    await B(() => window.__board21.openWidget('timer')); await up(page, 'timer:1');
    await B(() => window.__board21.pseudo && window.__board21.pseudo('timer:1', true)); await page.waitForTimeout(800);
    ok(frameName(page, 'timer:1') === 'b21-board:timer:1' && await B(() => typeof window.__board21.pseudo) === 'function', `with Developer mode off, the pseudo language does nothing (${frameName(page, 'timer:1')})`);
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const sizes = await B(() => Object.fromEntries(window.__board21.catalog().filter(w => w.id === 'timer' || w.id === 'traffic-light').map(w => [w.id, w.win])));
    for (const id of ['timer', 'traffic-light']) {
      const ik = id + ':1';
      if (id !== 'timer') { await B(id => window.__board21.openWidget(id), id); await up(page, ik); }
      await B(ik => window.__board21.pseudo(ik, true), ik);
      ok(await eventually(async () => frameName(page, ik) === `b21-board:${ik};qps`) && await up(page, ik), `${id}: the pseudo language starts it again as b21-board:${ik};qps (${frameName(page, ik)})`);
      const w = sizes[id];
      for (const [cw, ch] of [[w.width, w.aspectRatio ? w.width / w.aspectRatio : w.height], [w.minWidth, w.minHeight]]) {
        await B(([ik, r]) => window.__board21.setRect(ik, r), [ik, { x: 120, y: 60, w: Math.round(cw), h: Math.round(ch) + 40 }]); await page.waitForTimeout(500);
        const a = await inWin(page, ik, () => ({ html: document.documentElement.lang, size: innerWidth + ' × ' + innerHeight, audit: Board21.__audit(), words: Board21.__words() }));
        ok(a.html === 'en-XA' && !a.audit.missed.length && !a.audit.cut.length && clean(a.words), `${id} at ${a.size} in the pseudo language: no English left, nothing cut off, and no word missing (${JSON.stringify(a)})`);
      }
    }
    if (errors.length) ok(false, 'no page or console errors: ' + errors.join(' | '));
    await ctx.close();
  }]
  ];
};
