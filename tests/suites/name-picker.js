// Name Picker: its styles, winners, Versus, Groups, Bracket, and layouts.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, freeBoard, openSettings, setTheme, setCornerClock, hear, heard, eventually, parts,
    boardUp, NP_STYLES, BASE
  } = T;
  // The names a draw left without their pop. Each name pops as it lands, no more than about 30 a second. A name that
  // lands within 34 ms of the last pop shares it, as two can land in one frame on a slow machine. The last name always
  // pops. Each landing has t, when its flight left the stage, and pop, when its pop played. The flight is timed just
  // before the style reads its clock and the pop just after, so a slow machine can only make a gap look shorter.
  const unpopped = lands => { let at = -1e9; return lands.filter((l, i) => { if (l.pop != null) { at = l.pop; return false; } return i === lands.length - 1 || l.t - at >= 34; }).length; };
  // Chooses an item in a picker's window menu, then waits until the board has what the picker saved and its menu again.
  // On a busy machine that takes longer than any fixed wait. Once the picker has handled the choice, its frame asks the
  // board for the window's size. The board answers in turn, so that answer comes after the rest.
  const choose = async (p, ik, id) => {
    const frame = p.frameLocator(`.win[data-ikey="${ik}"] iframe`).locator('html');
    const n = await frame.evaluate(() => {
      if (window.__answered == null) {
        window.__answered = 0;
        addEventListener('message', e => { if (e.source === parent && e.data && e.data.type === 'menu' && 'id' in e.data) Board21.window.getInfo().then(() => window.__answered++); });
      }
      return window.__answered;
    });
    await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.click(`#menu [data-id="${id}"]`);
    if (!await eventually(() => frame.evaluate((_, n) => window.__answered > n, n))) ok(false, `the board gets the picker’s answer to “${id}” in its menu (none in 8 s)`);
    // A moment more lets what the picker does just after settle, such as the names list taking the keyboard.
    await p.waitForTimeout(250);
  };
  return [
  ['Name Picker: two students with one name, typing is kept, adding a name', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('name-picker')); await page.waitForTimeout(1000);
    let np = page.frameLocator('.win[data-ikey="name-picker:1"] iframe');
    const saved = () => page.evaluate(() => window.__board21.state.data.get('name-picker:1') || null);
    await np.locator('#list').fill('Emma\nLiam\nEmma');
    ok(await eventually(async () => ((await saved()) || { names: [] }).names.join() === 'Emma,Liam,Emma'), 'the list is saved as it is typed, both Emmas in it, without pressing Done');
    await page.waitForTimeout(300); await page.reload(); await boardUp(page);
    np = page.frameLocator('.win[data-ikey="name-picker:1"] iframe');
    ok(await eventually(async () => await np.locator('#status').textContent() === '3 of 3 left'), 'after the page is loaded again the list is still there (3 of 3 left)');
    // No repeats: a pick takes one student out; adding a name later keeps who was picked.
    // (A tap during a show skips to its end, so each pick waits until the last show is over.)
    const idle = () => eventually(async () => !(await np.locator('body').evaluate(b => b.classList.contains('showing'))), 12000);
    const pick = async left => { await idle(); await np.locator('#go').click(); await eventually(async () => (await saved()).left.length === left, 3000); return (await saved()).current; };
    const first = await pick(2);
    ok((await saved()).left.length === 2, `a pick takes one student out of the round (${first})`);
    await page.click('.win[data-ikey="name-picker:1"] .win-label'); await page.click('#menu [data-id="edit"]');
    await np.locator('#list').fill('Emma\nLiam\nEmma\nNoah');
    await np.locator('#done').click();
    let st = await saved();
    ok(st.names.length === 4 && st.left.length === 3 && st.left.includes('Noah') && st.current === first, `adding a name doesn’t start the round again (${st.left.length} of 4 left, ${first} stays picked)`);
    // Everyone is picked once, each Emma too.
    const picks = [first];
    for (let left = 2; left >= 0; left--) picks.push(await pick(left));
    ok(picks.slice().sort().join() === 'Emma,Emma,Liam,Noah', `in a round every student is picked once, both Emmas too (${picks.join(', ')})`);
    ok(await eventually(async () => await np.locator('#status').textContent() === '0 of 4 left'), 'and the count shows the whole class (0 of 4 left)');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Name Picker: styles, winners, menu', async (browser) => {
    // Counts, in every frame, the sounds a page starts (AudioContexts) and the notes it plays, and the timers and
    // animation frames it asks for.
    const AUDIO_SPY = () => {
      window.__calls = 0;
      for (const fn of ['setTimeout', 'setInterval', 'requestAnimationFrame']) { const f = window[fn]; window[fn] = function () { window.__calls++; return f.apply(this, arguments); }; }
      if (!window.AudioContext) return;
      window.__audio = 0; window.__notes = 0;
      const A = window.AudioContext, base = (window.BaseAudioContext || A).prototype;
      window.AudioContext = class extends A { constructor(o) { super(o); window.__audio++; } };
      for (const fn of ['createOscillator', 'createBufferSource']) { const f = base[fn]; base[fn] = function () { window.__notes++; return f.apply(this, arguments); }; }
    };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await ctx.addInitScript(AUDIO_SPY);
    const page = await ctx.newPage();
    const errors = [];
    const watch = (p, tab) => { p.on('pageerror', e => errors.push(`[${tab}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && /name-picker/.test(m.location().url || '')) errors.push(`[${tab} console] ${m.text()}`); }); };
    watch(page, 'tab 1');
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const np = (p = page, ik = 'name-picker:1') => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const saved = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const conf = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const menu = (id, p = page, ik = 'name-picker:1') => choose(p, ik, id);
    // The window's menu as the board has it: "Label", "Label ✓" (ticked), "Label (off)" (can't be used), "# Heading", "—" (a line),
    // "[1 ✓ 2 3]" (a row of choices).
    const items = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems
      .map(i => i.separator ? '—' : i.heading ? '# ' + i.label : i.choices ? '[' + i.choices.map(c => c.label + (c.checked ? ' ✓' : '')).join(' ') + ']'
        : i.label + (i.checked ? ' ✓' : '') + (i.disabled ? ' (off)' : '')).join(' | '), ik);
    const MENU = (style, n, { noRepeats = true, startOver = false, sound = false, quick = false } = {}) => ['Edit names', '—', '# Pick with',
      ...NP_STYLES.map(([id, label]) => label + (id === style ? ' ✓' : '')),
      '# Names at a time', '[' + [1, 2, 3, 4, 5, 6].map(k => k + (k === n ? ' ✓' : '')).join(' ') + ']', '—',
      'No repeats' + (noRepeats ? ' ✓' : ''), 'Start over' + (startOver ? '' : ' (off)'), 'Sound' + (sound ? ' ✓' : ''), 'Quick' + (quick ? ' ✓' : '')].join(' | ');
    // Bracket: everyone plays, so no row of numbers; No repeats and Start over are for picking, so they leave, as in Groups.
    const MENU_B = ({ sound = false, quick = false } = {}) => ['Edit names', '—', '# Pick with', ...NP_STYLES.map(([id, label]) => label + (id === 'bracket' ? ' ✓' : '')),
      '—', 'Sound' + (sound ? ' ✓' : ''), 'Quick' + (quick ? ' ✓' : '')].join(' | ');
    // Versus: always two, so no row of numbers. No repeats and Start over stay.
    const MENU_V = ({ startOver = false } = {}) => ['Edit names', '—', '# Pick with', ...NP_STYLES.map(([id, label]) => label + (id === 'versus' ? ' ✓' : '')),
      '—', 'No repeats ✓', 'Start over' + (startOver ? '' : ' (off)'), 'Sound', 'Quick'].join(' | ');
    const showing = (p = page, ik) => np(p, ik).locator('body').evaluate(b => b.classList.contains('showing'));
    const idle = (p = page, ik) => eventually(async () => !(await showing(p, ik)), 12000);
    const text = (sel, p = page, ik) => np(p, ik).locator(sel).textContent();
    const said = (p = page, ik) => text('#said', p, ik);
    const bigNames = (p = page, ik) => np(p, ik).locator('html').evaluate(() => [...document.querySelectorAll('.bn-name')].map(e => e.textContent));
    const fits = (p = page, ik) => np(p, ik).locator('.bn').evaluate(b => b.scrollWidth <= b.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 1);
    const inFrame = (fn, p = page, ik) => np(p, ik).locator('html').evaluate(fn);
    const sameList = (a, b) => a.slice().sort().join() === b.slice().sort().join();
    // Taps Pick and answers the pick once the board has it.
    const pickNow = async (p = page, ik) => {
      const was = ((await saved(p, ik)) || {}).pickId;
      await np(p, ik).locator('#go').click();
      await eventually(async () => ((await saved(p, ik)) || {}).pickId !== was, 3000);
      return saved(p, ik);
    };

    // ---- A new Name Picker opens as the Spinning wheel; the menu has everything (option A).
    await page.evaluate(() => window.__board21.openWidget('name-picker'));
    ok(await eventually(async () => ((await conf()) || {}).style === 'wheel'), `a new Name Picker opens as the Spinning wheel, and saves that (${JSON.stringify(await conf())})`);
    ok(await eventually(async () => await items() === MENU('wheel', 1)), 'its menu: Edit names on top, “Pick with” every way, “Names at a time” 1 to 6 in a row, then No repeats, Start over, Sound, Quick: ' + await items());
    const npPics = await page.evaluate(() => window.__board21.state.wins.get('name-picker:1').menuItems.filter(i => i.icon).map(i => i.id).join());
    ok(npPics === 'edit,sound', `Edit names and Sound have pictures, and no other item does (${npPics})`);
    await np().locator('#list').fill('Ava\nLeo\nMia\nNoah\nZoe\nEthan');
    await np().locator('#done').click(); await page.waitForTimeout(300);
    ok(await text('#status') === '6 of 6 left' && await text('#go') === 'Pick a name' && await np().locator('#round').isHidden(), 'with names: “6 of 6 left”, “Pick a name”, and no Start over yet');

    // ---- Sound is off: a pick makes none (no sound is even started). A double tap picks once; a tap during the show (after
    // the guard) skips to the result.
    let before = (await saved()).pickId;
    await np().locator('#go').click(); await np().locator('#go').click();
    await eventually(async () => (await saved()).pickId !== before, 3000);
    const one = await saved();
    ok(one.pickId !== before && one.picked.length === 1 && one.left.length === 5 && await showing() && await text('#go') === 'Show now',
      `a pick is saved as the show starts (${one.picked}), and the button reads “Show now”; the second tap of a double tap is ignored`);
    await page.waitForTimeout(700);
    await np().locator('#stage').click(); await page.waitForTimeout(150);
    ok(!(await showing()) && (await saved()).pickId === one.pickId && await eventually(async () => await said() === 'Picked: ' + one.picked[0]),
      'a tap during the show skips straight to the result, without picking again; screen readers hear “Picked: …”');
    ok(await text('#status') === '5 of 6 left' && await text('#go') === 'Pick again' && await np().locator('#round').isVisible(), 'then “5 of 6 left”, “Pick again” and Start over');
    ok(await inFrame(() => window.__audio) === 0 && await inFrame(() => window.__notes) === 0, 'with Sound off nothing is started or played');

    // ---- Quick: a tick in the menu that shortens the show.
    const timed = async () => { await idle(); const t = Date.now(); await np().locator('#go').click(); await page.waitForTimeout(50); await idle(); return Date.now() - t; };
    const usual = await timed();
    await menu('quick');
    let saw = { quick: (await conf()).quick, items: await items() };
    ok(saw.quick === true && saw.items === MENU('wheel', 1, { quick: true, startOver: true }), `Quick is ticked in the menu and saved (saved: ${saw.quick}; menu: ${saw.items})`);
    const quick = await timed();
    ok(quick < 2500 && quick < usual, `Quick makes the show shorter (${usual} ms, with Quick ${quick} ms)`);
    await menu('quick');

    // ---- Nothing runs between picks, and a show ends when the page can't be seen.
    await idle(); await page.waitForTimeout(300);
    const c0 = await inFrame(() => window.__calls);
    await page.waitForTimeout(1500);
    ok(await inFrame(() => window.__calls) === c0, `nothing runs between picks: no timers or animation frames (${await inFrame(() => window.__calls) - c0})`);
    await pickNow();
    await inFrame(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    ok(!(await showing()) && await eventually(async () => (await said()).startsWith('Picked: ' + (await saved()).picked.join(', ')), 1000), 'a show ends at once when the page is hidden, with the winners on screen');
    await inFrame(() => { delete document.hidden; });

    // ---- Changing the style during a show ends it, with the result on screen.
    const mid = await pickNow();
    await menu('style:name');
    ok((await conf()).style === 'name' && !(await showing()) && sameList(await bigNames(), mid.picked) && await np().locator('.style-root[data-style="name"]').count() === 1,
      `choosing Big name during the show ends it and shows the winners (${mid.picked})`);
    ok(await items() === MENU('name', 1, { startOver: true }), 'the menu ticks Big name');

    // ---- Bracket in the menu: Bracket ticked under Pick with, then only Sound and Quick. Names at a time, Groups, and the
    // pick round stay as they were, and come back with Big name.
    const confWas = await conf();
    await menu('style:bracket');
    const inBracket = { conf: await conf(), items: await items() };
    ok(inBracket.conf.style === 'bracket' && inBracket.conf.winners === confWas.winners && inBracket.conf.groups === confWas.groups && inBracket.items === MENU_B()
      && await text('#go') === 'Make a bracket' && await np().locator('#round').isHidden(),
      `Bracket: ticked under Pick with, then Sound and Quick only; “Make a bracket”, no Start over (${inBracket.items})`);
    await menu('style:name');
    ok(await items() === MENU('name', 1, { startOver: true }) && (await saved()).left.length === mid.left.length && sameList(await bigNames(), mid.picked),
      'back to Big name: the row of numbers, No repeats, and Start over are back, with the round and the last pick as they were');
    // ---- Versus in the menu: Versus ticked under Pick with, no row of numbers (always two), then No repeats, Start over,
    // Sound, and Quick. The round goes on; Names at a time stays as it was.
    await menu('style:versus');
    const inVersus = { conf: await conf(), items: await items(), left: (await saved()).left.length, go: await text('#go'), status: await text('#status'), round: await np().locator('#round').isVisible() };
    ok(inVersus.conf.style === 'versus' && inVersus.conf.winners === confWas.winners && inVersus.items === MENU_V({ startOver: true }) && inVersus.left === mid.left.length
      && inVersus.go === (mid.left.length > 1 ? 'Pick 2' : 'Pick the last one') && inVersus.status === `${mid.left.length} of 6 left` && inVersus.round,
      `Versus: ticked under Pick with, no row of numbers, then No repeats, Start over, Sound, and Quick; “${inVersus.go}”, and the round as it was, “${inVersus.status}” (saved: ${inVersus.conf.style}, ${inVersus.conf.winners} at a time, ${inVersus.left} left; menu: ${inVersus.items})`);
    await menu('style:name');
    ok(await items() === MENU('name', 1, { startOver: true }) && sameList(await bigNames(), mid.picked), 'back to Big name: Names at a time is 1 again, with the last pick as it was');

    // ---- Start over: everyone back in.
    await menu('round');
    let st = await saved();
    ok(st.left.length === 6 && !st.picked.length && st.current === null && await text('#status') === '6 of 6 left' && await np().locator('#round').isHidden()
      && JSON.stringify(await bigNames()) === '["?"]' && await items() === MENU('name', 1), 'Start over puts everyone back (6 of 6 left), clears the stage, and can’t be chosen again until a pick');

    // ---- Several winners in Big name. No repeats across picks; fewer left than asked.
    await menu('winners:3');
    ok((await conf()).winners === 3 && await text('#go') === 'Pick 3' && await items() === MENU('name', 3), 'Names at a time: 3 is saved, ticked, and the button says “Pick 3”');
    let t0 = Date.now();
    const p1 = await pickNow();
    const rolling = await np().locator('.bn-list').getAttribute('aria-hidden');
    ok(p1.picked.length === 3 && new Set(p1.picked).size === 3 && p1.left.length === 3 && p1.picked.every(n => !p1.left.includes(n)) && p1.current === p1.picked[0] && typeof p1.pickId === 'string',
      `three different winners, saved before the show, out of the round (${p1.picked})`);
    await idle();
    const took = Date.now() - t0;
    ok(took > 1100 && took < 2700, `Big name shuffles for about 1½ s (${took} ms)`);
    ok(JSON.stringify(await bigNames()) === JSON.stringify(p1.picked) && (await np().locator('.bn-num').allTextContents()).join() === '1,2,3' && await fits(),
      'they stack in pick order, numbered 1, 2, 3, and fit the window');
    ok(rolling === 'true' && await np().locator('.bn-list').getAttribute('aria-hidden') === null,
      `screen readers can’t come across the names flickering during the shuffle (they aren’t the winners), only the winners once they land (${rolling})`);
    ok(await eventually(async () => await said() === 'Picked: ' + p1.picked.join(', ')) && await text('#status') === '3 of 6 left', `screen readers hear “${await said()}”; 3 of 6 left`);
    await menu('winners:5');
    ok(await text('#go') === 'Pick the last 3', 'asking for 5 with 3 left: the button says “Pick the last 3”');
    const p2 = await pickNow(); await idle();
    ok(p2.picked.length === 3 && !p2.left.length && sameList(p1.picked.concat(p2.picked), ['Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Ethan']),
      `it picks the 3 left; over the two picks everyone was picked once (${p1.picked} / ${p2.picked})`);
    ok(await text('#status') === '0 of 6 left' && await text('#go') === 'Start over' && await np().locator('#round').isHidden() && await eventually(async () => /^Picked: .*\. Everyone has been picked\.$/.test(await said())),
      '“0 of 6 left”, the button says “Start over” (the small Start over beside it hides: never two side by side), and screen readers hear that everyone has been picked');
    await np().locator('#go').click(); await page.waitForTimeout(200);
    ok((await saved()).left.length === 6 && await text('#status') === '6 of 6 left', 'the button starts over');
    for (const n of [1, 5]) {
      await menu('winners:' + n);
      const p = await pickNow(); await idle();
      ok(p.picked.length === n && JSON.stringify(await bigNames()) === JSON.stringify(p.picked) && await np().locator('.bn-num').count() === (n > 1 ? n : 0) && await fits(),
        `${n} winner${n > 1 ? 's' : ''} in Big name: ${p.picked.join(', ')} (${n > 1 ? 'numbered' : 'no number'}), fitting the window`);
    }
    await page.screenshot({ path: OUT + 'name-picker-5-winners.png' });

    // ---- Two tabs show the same winners; a reload, even mid-show, shows the result.
    await menu('round'); await menu('winners:3');
    const page2 = await ctx.newPage(); watch(page2, 'tab 2');
    await page2.goto(BASE); await boardUp(page2); await freeBoard(page2);
    await eventually(async () => await text('#status', page2) === '6 of 6 left');
    const p3 = await pickNow();
    ok(await eventually(() => showing(page2), 1500), 'a pick in one tab puts on the show in the other tab too');
    await idle(); await idle(page2);
    ok(JSON.stringify(await bigNames(page2)) === JSON.stringify(p3.picked) && JSON.stringify(await bigNames()) === JSON.stringify(p3.picked)
      && await eventually(async () => await said(page2) === 'Picked: ' + p3.picked.join(', ')) && await text('#status', page2) === '3 of 6 left',
      `and both tabs end on the same winners, in the same order (${p3.picked})`);
    await page2.reload(); await boardUp(page2);
    ok(await eventually(async () => JSON.stringify(await bigNames(page2)) === JSON.stringify(p3.picked)) && !(await showing(page2)), 'after a reload the winners are still on screen, with no show');
    const p4 = await pickNow();
    await page.waitForTimeout(300);
    await page.reload(); await boardUp(page);
    ok(await eventually(async () => JSON.stringify(await bigNames()) === JSON.stringify(p4.picked)) && !(await showing()) && (await saved()).pickId === p4.pickId,
      `a reload during the show shows its result (${p4.picked})`);
    ok(await eventually(async () => JSON.stringify(await bigNames(page2)) === JSON.stringify(p4.picked)), 'and so does the other tab');
    await page2.close();

    // ---- Sound: ticked in the menu, it starts with the next tap and the show plays it.
    await menu('round');
    await menu('sound');
    saw = { sound: (await conf()).sound, items: await items() };
    ok(saw.sound === true && saw.items === MENU('name', 3, { sound: true }), `Sound is ticked in the menu and saved (saved: ${saw.sound}; menu: ${saw.items})`);
    const n0 = await inFrame(() => window.__notes);
    await np().locator('#go').click(); await idle();
    const snd = await inFrame(() => [window.__audio, window.__notes]);
    ok(snd[0] === 1 && snd[1] - n0 >= 5, `then a tap starts the sound and the show plays (${snd[1] - n0} notes)`);
    await menu('sound');
    ok((await conf()).sound === false, 'and it can be turned off again');

    // ---- No repeats off: picks from everyone, never more names than the list has; two students with one name are two.
    await menu('edit');
    await np().locator('#list').fill('Ava\nAva'); await np().locator('#done').click();
    await menu('norepeat');
    ok((await conf()).noRepeats === false && await text('#status') === '2 names' && await text('#go') === 'Pick 2' && await items() === MENU('name', 3, { noRepeats: false }),
      'No repeats off: “2 names”, Start over can’t be chosen, and asking for 3 of 2 names: “Pick 2”');
    st = await pickNow(); await idle();
    ok(JSON.stringify(st.picked) === '["Ava","Ava"]' && JSON.stringify(await bigNames()) === '["Ava","Ava"]', 'both Avas are picked: two students with one name are two entries');

    // ---- Templates keep the style and the number of winners, never the names.
    await menu('edit');
    await np().locator('#list').fill('Secretname One\nSecretname Two'); await np().locator('#done').click();
    await page.click('.picker-btn.right'); await page.click('[data-ctl="export"]'); await page.waitForTimeout(200);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal .btn[data-i="1"]')]);
    await dl.saveAs(OUT + 'name-picker-template.21board');
    const tpl = JSON.parse(fs.readFileSync(OUT + 'name-picker-template.21board', 'utf8')), tp = tpl.instances.find(i => i.widgetId === 'name-picker');
    ok(tpl.kind === 'template' && tp && tp.data === null && tp.config.style === 'name' && tp.config.winners === 3 && tp.config.noRepeats === false && !JSON.stringify(tpl).includes('Secretname'),
      `a template keeps the style and Names at a time, not the names (${JSON.stringify(tp && tp.config)})`);

    // ---- A board from a file: pickers from before styles keep Big name; older content loads; junk falls back.
    const win = (instance, data, config) => ({ widgetId: 'name-picker', instance, open: true, z: instance, rect: { x: 20 + (instance - 1) * 430, y: 20, w: 420, h: 360 }, data, config });
    const file = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Pickers' }, instances: [
      win(1, { names: ['Ava', 'Leo', 'Mia'], left: ['Leo', 'Mia'], current: 'Ava' }, null),
      win(2, null, { noRepeats: false }),
      win(3, { names: ['Ava', 7, '  ', 'Leo', null], left: ['Zed', 'Leo', 5, 'Leo'], picked: ['Leo', 'Zed', {}, 'Leo', 'Ava', 'Ava'], pickId: '<b>x</b>', current: 3 },
        { style: 'disco', winners: 7, quick: 'yes', sound: 1, noRepeats: 'no' }),
      win(4, { names: ['Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Ethan', 'Sofia', 'Liam'], left: ['Sofia', 'Liam'], picked: ['Mia', 'Ava', 'Zoe', 'Leo', 'Ethan', 'Noah'], pickId: 'mwp2g7b7-pg6utj' },
        { style: 'name', winners: 6, noRepeats: true })
    ] };
    fs.writeFileSync(OUT + 'name-pickers.21board', JSON.stringify(file));
    await page.setInputFiles('#import-input', OUT + 'name-pickers.21board'); await page.waitForTimeout(300);
    await page.click('#modal .btn:has-text("Replace this page")');
    ok(await eventually(async () => (await Promise.all([1, 2, 3, 4].map(n => items(page, 'name-picker:' + n).catch(() => '')))).every(Boolean)), 'the board from the file opens with its four pickers');
    await page.waitForTimeout(500);
    ok(JSON.stringify(await bigNames(page, 'name-picker:1')) === '["Ava"]' && await text('#status', page, 'name-picker:1') === '2 of 3 left' && await items(page, 'name-picker:1') === MENU('name', 1, { startOver: true })
      && await conf(page, 'name-picker:1') === null, 'one with names from before styles (only `current`) keeps Big name and shows its pick: Ava, 2 of 3 left');
    ok(await items(page, 'name-picker:2') === MENU('name', 1, { noRepeats: false }) && await np(page, 'name-picker:2').locator('#list').isVisible(),
      'one with settings from before styles and no names keeps Big name too (and asks for names)');
    ok(await items(page, 'name-picker:3') === MENU('name', 1, { startOver: true }) && JSON.stringify(await bigNames(page, 'name-picker:3')) === '["Leo","Ava"]'
      && await text('#status', page, 'name-picker:3') === '1 of 2 left', 'junk in a file falls back: Big name, 1 winner (for 7), Quick and Sound off; only names in the list, each student once');
    ok(await items(page, 'name-picker:4') === MENU('name', 6, { startOver: true }) && JSON.stringify(await bigNames(page, 'name-picker:4')) === '["Mia","Ava","Zoe","Leo","Ethan","Noah"]'
      && await np(page, 'name-picker:4').locator('.bn-num').count() === 6 && await fits(page, 'name-picker:4') && await text('#status', page, 'name-picker:4') === '2 of 8 left'
      && await text('#go', page, 'name-picker:4') === 'Pick the last 2', `six at a time from a file: 6 ticked in the row, its six winners numbered on the stage, “2 of 8 left”, “Pick the last 2” (${await items(page, 'name-picker:4')})`);
    st = await pickNow(page, 'name-picker:3'); await idle(page, 'name-picker:3');
    ok(JSON.stringify(st.names) === '["Ava","Leo"]' && JSON.stringify(st.picked) === '["Leo"]' && !st.left.length && st.current === 'Leo' && /^[a-z0-9]+-[a-z0-9]+$/.test(st.pickId),
      `and its next pick is saved clean (${JSON.stringify(st)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- Reduce motion: no show, the winners fade in. Sound that can't start makes no error.
    const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await rctx.addInitScript(() => { window.AudioContext = function () { throw new Error('no sound here'); }; });
    const rp = await rctx.newPage(); watch(rp, 'reduce motion');
    await rp.goto(BASE); await boardUp(rp); await freeBoard(rp);
    await rp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(rp)) || {}).style === 'wheel');
    await np(rp).locator('#list').fill('Ava\nLeo\nMia\nNoah\nZoe\nEthan\nSofia\nLiam'); await np(rp).locator('#done').click();
    await menu('sound', rp); await menu('winners:2', rp);
    for (const style of ['wheel', 'spotlight', 'lotto', 'name']) {
      if (style !== 'wheel') await menu('style:' + style, rp);
      const p = await pickNow(rp), was = await showing(rp);
      ok(!was && await eventually(async () => (await said(rp)).startsWith('Picked: ' + p.picked.join(', ')), 1000), `with reduce motion, the ${style} style has no show: the winners are on screen at once (${p.picked})`);
    }
    ok(await np(rp).locator('.bn-list').evaluate(e => e.classList.contains('bn-fade')) && JSON.stringify(await bigNames(rp)) === JSON.stringify((await saved(rp)).picked), 'Big name fades them in');
    await menu('style:versus', rp); await menu('round', rp);
    const pv = await pickNow(rp);
    ok(!(await showing(rp)) && pv.picked.length === 2 && await eventually(async () => await said(rp) === `${pv.picked[0]} versus ${pv.picked[1]}.`, 1000), `with reduce motion Versus has no show either: the pair is on screen at once (${pv.picked.join(' versus ')})`);
    await menu('style:name', rp);
    if (errors.length) ok(false, 'no page errors (and none from sound that can’t start): ' + errors.join(' | '));
    await rctx.close();

    // ---- A second copy of the board (another tab, the window on the projector): a new picker opens on its names list
    // in both, and the names are typed in one. The other shows the picker as soon as there are names, and its picks.
    errors.length = 0;
    const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await sctx.newPage(); watch(A, 'copy A');
    await A.goto(BASE); await boardUp(A); await freeBoard(A);
    await A.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(A)) || {}).style === 'wheel');
    const B = await sctx.newPage(); watch(B, 'copy B');
    await B.goto(BASE); await boardUp(B); await freeBoard(B);
    const onList = p => np(p).locator('#edit').evaluate(e => e.classList.contains('on'));
    ok(await eventually(() => onList(B)) && await onList(A), 'a new Name Picker opens on its names list in both copies of the board');
    await np(A).locator('#list').fill('Ava\nLeo\nMia\nNoah\nZoe\nEthan'); await np(A).locator('#done').click();
    ok(await eventually(async () => !(await onList(B)) && await text('#status', B) === '6 of 6 left' && await np(B).locator('.style-root[data-style="wheel"]:not([hidden])').count() === 1),
      'names typed in one copy: the other leaves its names list and shows the wheel (6 of 6 left)');
    const sp = await pickNow(A);
    ok(await eventually(async () => await said(B) === 'Picked: ' + sp.picked[0], 12000) && !(await onList(B)), `and it shows the pick made in the first (${sp.picked})`);
    await idle(A); await idle(B);
    // A names list opened from the menu stays open (with the new names), even when nobody is typing in it.
    await menu('edit', B); await B.waitForTimeout(200); await np(B).locator('#list').evaluate(e => e.blur());
    await menu('edit', A); await np(A).locator('#list').fill('Ava\nLeo\nMia\nNoah\nZoe\nEthan\nSofia'); await np(A).locator('#done').click();
    ok(await eventually(async () => await np(B).locator('#list').inputValue() === 'Ava\nLeo\nMia\nNoah\nZoe\nEthan\nSofia') && await onList(B),
      'a names list opened from the menu stays open when the names change in another copy, and shows the new list');
    await np(B).locator('#done').click();
    // Reset in one copy, then Undo on its toast: the other copy shows the picker again too.
    await A.click('.win[data-ikey="name-picker:1"] .win-label'); await A.click('#menu [data-act="reset"]'); await A.click('#menu [data-act="reset-yes"]');
    ok(await eventually(() => onList(B)), 'Reset in one copy: the other shows a new picker’s names list');
    await A.locator('.toast', { hasText: 'was reset' }).locator('button', { hasText: 'Undo' }).click();
    ok(await eventually(async () => !(await onList(B)) && await text('#status', B) === '6 of 7 left' && await np(B).locator('.style-root[data-style="wheel"]:not([hidden])').count() === 1),
      `Undo there: the other copy shows the picker again (${await text('#status', B)})`);
    await B.close();

    // ---- The keyboard stays in the picker when the button it is on goes away: Start over, and Done in the names list.
    const focused = p => np(p).locator('html').evaluate(() => document.activeElement.id || document.activeElement.tagName);
    await eventually(async () => await np(A).locator('#round').isVisible());
    await np(A).locator('#round').focus(); await A.keyboard.press('Enter');
    ok(await np(A).locator('#round').isHidden() && await text('#status', A) === '7 of 7 left' && await focused(A) === 'go', `Enter on Start over: it goes away, and the keyboard is on the main button (${await focused(A)})`);
    await menu('edit', A); await np(A).locator('#done').focus(); await A.keyboard.press('Enter');
    ok(!(await onList(A)) && await focused(A) === 'go', `Enter on Done: the names list closes, and the keyboard is on the main button (${await focused(A)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await sctx.close();

    // ---- On the 16:9 board the zoom changes at almost every step of resizing the browser window: the names are fitted
    // again once it stops, not at every step, and the wheel is then drawn sharp for the new zoom.
    errors.length = 0;
    const RESIZE_SPY = () => {   // counts the calls of every style's resize()
      let np;
      Object.defineProperty(window, 'NamePicker', { configurable: true, get: () => np, set: v => {
        np = v;
        const register = v.register;
        v.register = function (id, style) {
          const mount = style.mount;
          style.mount = function () {
            const api = mount.apply(this, arguments) || {}, r = api.resize;
            if (r) api.resize = function () { window.__resizes = (window.__resizes || 0) + 1; return r.apply(this, arguments); };
            return api;
          };
          return register.call(this, id, style);
        };
      } });
    };
    const zctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 });
    await zctx.addInitScript(RESIZE_SPY);
    const zp = await zctx.newPage(); watch(zp, 'zoom');
    await zp.goto(BASE); await boardUp(zp);   // (the 16:9 board, as it is by default)
    await zp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(zp)) || {}).style === 'wheel');
    await np(zp).locator('#list').fill('Ava\nLeo\nMia\nNoah\nZoe\nEthan'); await np(zp).locator('#done').click(); await zp.waitForTimeout(600);
    const r0 = await inFrame(() => window.__resizes || 0, zp), z0 = await inFrame(() => Board21.context.window.zoom, zp);
    for (let i = 1; i <= 20; i++) { await zp.setViewportSize({ width: 1366 + i * 12, height: 768 + Math.round(i * 6.75) }); await zp.waitForTimeout(20); }
    await zp.waitForTimeout(600);
    const fitted = await inFrame(() => window.__resizes || 0, zp) - r0;
    const sharp = await inFrame(() => { const w = document.querySelector('.style-root')._wheel(); return { dpr: w.dpr, want: Math.min(3, Math.max(1, devicePixelRatio * Board21.context.window.zoom)), zoom: Board21.context.window.zoom }; }, zp);
    ok(sharp.zoom > z0 && fitted >= 1 && fitted <= 2 && Math.abs(sharp.dpr - sharp.want) < 0.02,
      `resizing the browser window in 20 steps (zoom ${z0} → ${sharp.zoom}) fits the names again ${fitted} time${fitted === 1 ? '' : 's'}, once it stops; the wheel is drawn at ${sharp.dpr.toFixed(2)} px per px`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await zctx.close();

    // ---- Filling the board at a big Size, the board's ▦ buttons and clock sit over the picker's bottom corners: the
    // main button, the status and Start over keep clear of them (on a row above the main button where there isn't room
    // beside it). At the usual Size they stay on one row.
    errors.length = 0;
    const cctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const cp = await cctx.newPage(); watch(cp, 'corners');
    await cp.clock.install({ time: new Date('2026-11-12T09:41:00') });   // (the clock's width depends on the time: see Clock in the corner)
    await cp.goto(BASE); await boardUp(cp);
    await setCornerClock(cp, 'on');   // (Auto, the default, shows it only in full screen: here it's what the picker keeps clear of)
    await cp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(cp)) || {}).style === 'wheel');
    await np(cp).locator('#list').fill('Ava\nLeo\nMia\nNoah\nZoe\nEthan\nSofia\nLiam\nAmara\nKenji\nDiego\nFatima'); await np(cp).locator('#done').click();
    await cp.evaluate(() => window.__board21.setMaximized('name-picker:1', true));
    await eventually(() => cp.evaluate(() => (window.__board21.state.wins.get('name-picker:1').menuItems || []).some(i => i.id === 'style:name')), 15000);   // (a busy machine: the widget's menu may come late)
    await cp.waitForTimeout(300);
    await menu('style:name', cp); await menu('winners:3', cp);
    await pickNow(cp); await idle(cp);
    // What of the main button, the status and Start over is under the clock or a ▦ button (in screen px).
    const underCorners = async () => {
      const z = await cp.evaluate(() => window.__board21.zoom.s);
      const fr = await cp.evaluate(() => { const r = document.querySelector('.win[data-ikey="name-picker:1"] iframe').getBoundingClientRect(); return { x: r.left, y: r.top }; });
      const own = await inFrame(() => ['go', 'status', 'round'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return { id, hidden: e.hidden || !r.width, x: r.left, y: r.top, w: r.width, h: r.height }; }), cp);
      const board = await cp.evaluate(() => [...document.querySelectorAll('.corner-clock:not([hidden]), .picker-btn:not([hidden])')].map(e => { const r = e.getBoundingClientRect(); return { what: e.classList.contains('corner-clock') ? 'clock' : '▦', x: r.left, y: r.top, w: r.width, h: r.height }; }));
      const over = [];
      for (const e of own) if (!e.hidden) for (const c of board) {
        const x = fr.x + e.x * z, y = fr.y + e.y * z;
        if (x < c.x + c.w - 1 && c.x < x + e.w * z - 1 && y < c.y + c.h - 1 && c.y < y + e.h * z - 1) over.push(`${c.what} over ${e.id}`);
      }
      return { over, clock: board.some(c => c.what === 'clock'), round: own.some(e => e.id === 'round' && !e.hidden), stack: await np(cp).locator('.foot').evaluate(f => f.classList.contains('stack')) };
    };
    // The line under the stage (2026.11.24-1): the status in the middle of its space, wrapping onto even lines, and Start
    // over in the middle of its own. The foot stacks only when the status would need more than two lines beside the
    // main button, or Start over wouldn't fit on one; stacked, each is in the middle of its half.
    const footLook = () => np(cp).locator('html').evaluate(() => {
      const foot = document.querySelector('.foot'), go = document.getElementById('go'), st = document.getElementById('status'), rd = document.getElementById('round');
      const box = e => e.getBoundingClientRect(), fr = box(foot), gr = box(go), sr = box(st), rr = box(rd), cs = getComputedStyle(st), lh = parseFloat(cs.lineHeight);
      const stack = foot.classList.contains('stack'), roundOn = !rd.hidden && rr.width > 0, gap = parseFloat(getComputedStyle(foot).columnGap) || 0;
      // The column beside the main button, and what the status and Start over would need there.
      const col = (fr.width - gr.width - 2 * gap) / 2;
      // (A copy, in the same letters: it has no id, so it takes them from the original.)
      const probe = (e, css) => { const c = e.cloneNode(true), k = getComputedStyle(e); c.removeAttribute('id'); c.hidden = false;
        Object.assign(c.style, { position: 'absolute', left: '0', top: '0', visibility: 'hidden', fontSize: k.fontSize, fontFamily: k.fontFamily, fontWeight: k.fontWeight, lineHeight: k.lineHeight, letterSpacing: k.letterSpacing, padding: k.padding }, css);
        document.body.appendChild(c); const r = c.getBoundingClientRect(); c.remove(); return r; };
      const need = probe(st, { display: 'block', width: 'max-content', maxWidth: Math.max(0, col) + 'px', textWrap: 'balance', whiteSpace: 'normal' });
      const needLines = !st.textContent ? 0 : col < 1 ? 99 : Math.round(need.height / lh);
      const roundW = roundOn ? probe(rd, { whiteSpace: 'nowrap', width: 'max-content' }).width : 0;
      const halves = [[fr.left, fr.left + (fr.width - gap) / 2], [fr.right - (fr.width - gap) / 2, fr.right]];
      const cols = stack ? (roundOn ? halves : [[fr.left, fr.right]]) : [[fr.left, gr.left - gap], [gr.right + gap, fr.right]];
      const mid = c => (c[0] + c[1]) / 2, off = (r, c) => Math.round(Math.abs((r.left + r.right) / 2 - mid(c)) * 10) / 10;
      return { stack, roundOn, col: Math.round(col), needLines, roundW: Math.round(roundW), lines: st.textContent ? Math.round(sr.height / lh) : 0, text: st.textContent,
        statusOff: st.textContent ? off(sr, cols[0]) : 0, roundOff: roundOn ? off(rr, cols[cols.length - 1]) : 0,
        align: cs.textAlign, wrap: cs.textWrap || cs.textWrapStyle || '', goMid: Math.round(Math.abs((gr.left + gr.right) / 2 - innerWidth / 2)), inside: sr.left >= fr.left - 0.5 && sr.right <= fr.right + 0.5 };
    });
    const footOk = f => f.statusOff <= 1.5 && f.roundOff <= 1.5 && f.align === 'center' && f.wrap === 'balance' && f.goMid <= 1.5 && f.inside
      && f.stack === (f.needLines > 2 || (f.roundOn && f.roundW > f.col + 0.5)) && (f.stack || f.lines <= 2);
    const seenCorners = [], feet = [];
    const SIZES = [[1920, 1080, '16:9', 0.8], [1920, 1080, '16:9', 1.75], [1920, 1080, '16:9', 2], [1366, 768, '16:9', 1.25], [1366, 768, '16:9', 2], [1366, 768, 'free', 1.75]];
    for (const [w, h, shape, sc] of SIZES) {
      await cp.setViewportSize({ width: w, height: h });
      await cp.evaluate(([shape, sc]) => { window.__board21.setBoardShape(shape); window.__board21.setBoardScale(sc); }, [shape, sc]);
      await cp.waitForTimeout(700);
      const u = await underCorners(), f = await footLook();
      seenCorners.push(`${w}×${h} ${shape} ${sc * 100}%: ${u.over.length ? u.over.join(', ') : 'clear'}${u.stack ? ' (stacked)' : ''}`);
      feet.push(f);
      ok(u.clock && u.round && !u.over.length && (sc > 1 || !u.stack), `${seenCorners[seenCorners.length - 1]}: the clock is there, and nothing of the picker’s is under it or ▦${sc > 1 ? '' : ', all on one row'}`);
      ok(footOk(f), `${w}×${h} ${shape} ${sc * 100}%: “${f.text}” in the middle of its space (${f.statusOff} px off, ${f.align}, ${f.wrap}, ${f.lines} line${f.lines === 1 ? '' : 's'}), Start over in the middle of its own (${f.roundOff} px off), the main button in the middle; ${f.stack ? 'stacked' : 'one row'}, as it needs (${f.needLines} lines beside the button, Start over ${f.roundW} of ${f.col} px)`);
      if (w === 1920 && sc === 1.75) await cp.screenshot({ path: OUT + 'name-picker-corners-175.png' });
    }
    ok(feet.some(f => f.stack), `the foot still stacks where the board’s corners leave too little room (${feet.map(f => f.stack ? 'stacked' : 'row').join(', ')})`);
    // Groups: “4 groups of 6 or 7” goes onto two even lines beside the main button before the foot stacks.
    await menu('edit', cp);
    await np(cp).locator('#list').fill(['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivy', 'Jamal', 'Kai', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tariq', 'Uma', 'Vic', 'Wen', 'Xavier', 'Zoe'].join('\n'));
    await np(cp).locator('#done').click(); await cp.waitForTimeout(300);
    await menu('style:groups', cp); await menu('groups:4', cp); await menu('quick', cp);
    await np(cp).locator('#go').click(); await idle(cp);
    const gfeet = [];
    for (const [w, h, shape, sc] of SIZES.concat([[1366, 768, '16:9', 1.5], [1366, 768, '16:9', 1.75], [1920, 1080, '16:9', 1.5]])) {
      await cp.setViewportSize({ width: w, height: h });
      await cp.evaluate(([shape, sc]) => { window.__board21.setBoardShape(shape); window.__board21.setBoardScale(sc); }, [shape, sc]);
      await cp.waitForTimeout(700);
      const u = await underCorners(), f = await footLook();
      gfeet.push(`${w}×${h} ${shape} ${sc * 100}%: ${f.lines} line${f.lines === 1 ? '' : 's'}${f.stack ? ', stacked' : ''}`);
      ok(f.text === '4 groups of 6 or 7' && !u.over.length && footOk(f), `Groups, ${gfeet[gfeet.length - 1]}: “${f.text}” in the middle of its space (${f.statusOff} px off), clear of the corners, stacked only if it needs more than two lines (${f.needLines})`);
      if (f.lines === 2 && !f.stack && !gfeet.shot) { gfeet.shot = true; await cp.screenshot({ path: OUT + 'name-picker-foot-two-lines.png' }); }
    }
    ok(gfeet.some(x => /: 2 lines$/.test(x)), `“4 groups of 6 or 7” wraps onto two lines beside the main button before the foot stacks (${gfeet.join('; ')})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await cctx.close();

    // ---- Six at a time, in every way to pick: six winners, saved, shown, and announced, each show done within 10 s
    // (4 s with Quick: the host's own limits, so a show that runs over ends there instead, and fails here).
    errors.length = 0;
    const xctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const xp = await xctx.newPage(); watch(xp, 'six');
    await xp.goto(BASE); await boardUp(xp); await freeBoard(xp);
    await xp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(xp)) || {}).style === 'wheel');
    await xp.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 760, h: 560 }));
    const TWELVE = ['Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Ethan', 'Sofia', 'Liam', 'Amara', 'Kenji', 'Diego', 'Fatima'];
    await np(xp).locator('#list').fill(TWELVE.join('\n')); await np(xp).locator('#done').click(); await xp.waitForTimeout(300);
    await menu('winners:6', xp); await menu('norepeat', xp);
    ok((await conf(xp)).winners === 6 && await text('#go', xp) === 'Pick 6' && await items(xp) === MENU('wheel', 6, { noRepeats: false }),
      `Names at a time: 6 is saved, ticked in the row, and the button says “Pick 6” (${await items(xp)})`);
    const SHOWN = { name: '.bn-name', wheel: '.wheel-nm', spotlight: '.spotlight-cname', lotto: '.lotto-name .lotto-text' };
    for (const quick of [false, true]) {
      if (quick) await menu('quick', xp);
      for (const style of ['wheel', 'name', 'spotlight', 'lotto']) {
        if ((await conf(xp)).style !== style) await menu('style:' + style, xp);
        await idle(xp); await xp.waitForTimeout(200);
        const t0 = Date.now(), p6 = await pickNow(xp);
        await idle(xp);
        const took = Date.now() - t0;
        const onStage = await np(xp).locator('html').evaluate((h, sel) => [...document.querySelectorAll(sel)].map(e => e.textContent), SHOWN[style]);
        ok(p6.picked.length === 6 && new Set(p6.picked).size === 6 && p6.picked.every(n => TWELVE.includes(n)) && sameList(onStage, p6.picked)
          && await eventually(async () => await said(xp) === 'Picked: ' + p6.picked.join(', '), 2000) && took < (quick ? 3800 : 9500),
          `${quick ? 'Quick, ' : ''}${style}: six winners saved, on the stage, and heard, in ${took} ms (${p6.picked.join(', ')}; shown: ${onStage.join(', ')})`);
        if (style === 'name') ok(await np(xp).locator('.bn-num').count() === 6 && await fits(xp), 'Big name numbers the six 1 to 6, and they fit the window');
        if (style === 'lotto') ok(await np(xp).locator('.lotto-sock').count() === 6, `Lotto has six sockets (${await np(xp).locator('.lotto-sock').count()})`);
        if (style === 'wheel') {
          const wl = await inFrame(() => document.querySelector('.style-root')._wheel(), xp);
          ok(wl.under.length === 6 && wl.hub === 'SPIN× 6', `the wheel has six arrows, and SPIN says “× 6” (${wl.under.length} arrows, ${JSON.stringify(wl.hub)})`);
        }
        if (!quick) await xp.screenshot({ path: OUT + `name-picker-6-${style}.png` });
      }
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await xctx.close();
  }],
  // ---- Groups. The names go into 2 to 6 random groups.
  ['Name Picker: Groups', async (browser) => {
    // Every sound a style asks the host for (the host plays it only with Sound ticked), each name as it lands with the
    // time of its pop, the sounds the page starts, and the notes it plays.
    const SPY = () => {
      window.__sounds = []; window.__lands = [];
      const remove = Element.prototype.remove;
      Element.prototype.remove = function () { if (this.isConnected && this.classList.contains('groups-fly')) window.__lands.push({ t: performance.now(), pop: null }); return remove.apply(this, arguments); };
      let np;
      Object.defineProperty(window, 'NamePicker', { configurable: true, get: () => np, set: v => {
        np = v;
        const register = v.register;
        v.register = function (id, style) {
          const mount = style.mount;
          style.mount = function (root, host) {
            const sound = host.sound;
            host.sound = function (name) {
              const l = window.__lands[window.__lands.length - 1];
              if (name === 'pop' && l) l.pop = performance.now();
              window.__sounds.push(name); return sound.apply(this, arguments);
            };
            return mount.call(this, root, host);
          };
          return register.call(this, id, style);
        };
      } });
      window.__calls = 0;
      for (const fn of ['setTimeout', 'setInterval', 'requestAnimationFrame']) { const f = window[fn]; window[fn] = function () { window.__calls++; return f.apply(this, arguments); }; }
      if (!window.AudioContext) return;
      window.__audio = 0; window.__notes = 0;
      const A = window.AudioContext, base = (window.BaseAudioContext || A).prototype;
      window.AudioContext = class extends A { constructor(o) { super(o); window.__audio++; } };
      for (const fn of ['createOscillator', 'createBufferSource']) { const f = base[fn]; base[fn] = function () { window.__notes++; return f.apply(this, arguments); }; }
    };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await ctx.addInitScript(SPY);
    const page = await ctx.newPage();
    const errors = [];
    const watch = (p, tab) => { p.on('pageerror', e => errors.push(`[${tab}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && /name-picker/.test(m.location().url || '')) errors.push(`[${tab} console] ${m.text()}`); }); };
    watch(page, 'tab 1');
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const np = (p = page, ik = 'name-picker:1') => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const saved = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const conf = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const menu = (id, p = page, ik = 'name-picker:1') => choose(p, ik, id);
    const items = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems
      .map(i => i.separator ? '—' : i.heading ? '# ' + i.label : i.choices ? '[' + i.choices.map(c => c.label + (c.checked ? ' ✓' : '')).join(' ') + ']'
        : i.label + (i.checked ? ' ✓' : '') + (i.disabled ? ' (off)' : '')).join(' | '), ik);
    const STYLES = NP_STYLES;
    const MENU_G = (k, { sound = false, quick = false } = {}) => ['Edit names', '—', '# Pick with', ...STYLES.map(([id, l]) => l + (id === 'groups' ? ' ✓' : '')),
      '# Groups', '[' + [2, 3, 4, 5, 6].map(x => x + (x === k ? ' ✓' : '')).join(' ') + ']', '—', 'Sound' + (sound ? ' ✓' : ''), 'Quick' + (quick ? ' ✓' : '')].join(' | ');
    const MENU_P = (style, n, { startOver = false, sound = false, quick = false } = {}) => ['Edit names', '—', '# Pick with', ...STYLES.map(([id, l]) => l + (id === style ? ' ✓' : '')),
      '# Names at a time', '[' + [1, 2, 3, 4, 5, 6].map(x => x + (x === n ? ' ✓' : '')).join(' ') + ']', '—', 'No repeats ✓', 'Start over' + (startOver ? '' : ' (off)'),
      'Sound' + (sound ? ' ✓' : ''), 'Quick' + (quick ? ' ✓' : '')].join(' | ');
    const showing = (p = page, ik) => np(p, ik).locator('body').evaluate(b => b.classList.contains('showing'));
    const idle = (p = page, ik) => eventually(async () => !(await showing(p, ik)), 12000);
    const text = (sel, p = page, ik) => np(p, ik).locator(sel).textContent();
    const said = (p = page, ik) => text('#said', p, ik);
    const inFrame = (fn, p = page, ik, arg) => np(p, ik).locator('html').evaluate(fn, arg);
    const setNames = async (list, p = page, ik) => { await menu('edit', p, ik); await np(p, ik).locator('#list').fill(list.join('\n')); await np(p, ik).locator('#done').click(); await p.waitForTimeout(300); };
    const sameList = (a, b) => a.slice().sort().join() === b.slice().sort().join();
    // The cards on the stage: each one's heading and names, in order.
    const cards = (p = page, ik) => inFrame(() => [...document.querySelectorAll('.groups-card')].map(c => ({ head: (c.querySelector('.groups-head') || {}).textContent,
      names: [...c.querySelectorAll('.groups-name')].map(n => n.textContent) })), p, ik);
    const tiles = (p = page, ik) => inFrame(() => [...document.querySelectorAll('.groups-tile')].map(t => t.textContent), p, ik);
    const announced = groups => groups.map((g, i) => `Group ${i + 1}: ${g.join(', ')}.`).join(' ');
    // Taps the main button and answers the groups once the board has them.
    const drawNow = async (p = page, ik) => {
      const was = ((await saved(p, ik)) || {}).groupId;
      await np(p, ik).locator('#go').click();
      await eventually(async () => ((await saved(p, ik)) || {}).groupId !== was, 3000);
      return saved(p, ik);
    };
    // How the cards fit: every name's words inside its card and its own line, no line over another, every name one size,
    // the cards inside the stage and apart, and each card's names in the middle of it (as much room left as right).
    const fitLook = (p = page, ik) => inFrame(() => {
      const stage = document.getElementById('stage').getBoundingClientRect(), bad = [], sizes = new Set();
      const inside = (r, o, e = 0.5) => r.left >= o.left - e && r.right <= o.right + e && r.top >= o.top - e && r.bottom <= o.bottom + e;
      const over = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      const cs = [...document.querySelectorAll('.groups-card')], texts = [];
      cs.forEach((c, i) => {
        const cr = c.getBoundingClientRect();
        if (!inside(cr, stage)) bad.push(`card ${i + 1} outside the stage`);
        cs.slice(i + 1).forEach((d, j) => { if (over(cr, d.getBoundingClientRect())) bad.push(`cards ${i + 1} and ${i + j + 2} overlap`); });
        for (const n of c.querySelectorAll('.groups-name')) {
          const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect();
          sizes.add(getComputedStyle(n).fontSize);
          const line = n.getBoundingClientRect();
          if (!inside(r, cr) || !inside(line, cr) || n.scrollWidth > n.clientWidth + 1) bad.push(`“${n.textContent}” overflows card ${i + 1}`);
          for (const t of texts) if (over(line, t.r)) bad.push(`“${n.textContent}” is over “${t.name}”`);
          texts.push({ r: line, name: n.textContent });
        }
        const ns = [...c.querySelectorAll('.groups-name')].map(n => n.getBoundingClientRect());
        const left = Math.min(...ns.map(r => r.left)) - cr.left, right = cr.right - Math.max(...ns.map(r => r.right));
        if (ns.length && Math.abs(left - right) > 2) bad.push(`card ${i + 1}'s names are off the middle (${left.toFixed(1)} px left, ${right.toFixed(1)} px right)`);
      });
      const fs = [...sizes].map(parseFloat);
      return { bad, sizes: [...sizes], fs: fs.length ? Math.min(...fs) : 0, cards: cs.length, w: stage.width, h: stage.height };
    }, p, ik);

    // ---- Groups in the menu: under Pick with, its own row of numbers, and no No repeats or Start over.
    await page.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf()) || {}).style === 'wheel');
    await page.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 900, h: 640 }));
    const N24 = ['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivy', 'Jamal', 'Kai', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tariq', 'Uma', 'Vic', 'Wen', 'Zoe'];
    await np().locator('#list').fill(N24.join('\n')); await np().locator('#done').click(); await page.waitForTimeout(300);
    // A pick round first, so we can see Groups leave it alone.
    const p1 = await (async () => { await np().locator('#go').click(); await idle(); return saved(); })();
    const p2 = await (async () => { await np().locator('#go').click(); await idle(); return saved(); })();
    const roundWas = { status: await text('#status'), picked: p2.picked.slice(), left: p2.left.slice() };
    ok(p1.picked.length === 1 && p2.left.length === 22 && roundWas.status === '22 of 24 left', `two picks on the wheel first (${p1.picked}, ${p2.picked}; ${roundWas.status})`);
    await menu('style:groups');
    ok((await conf()).style === 'groups' && (await conf()).groups === 4 && await eventually(async () => await items() === MENU_G(4)),
      `Groups is under Pick with; its row reads Groups, 2 to 6, 4 to start with; No repeats and Start over leave the menu (${await items()})`);
    ok(await text('#status') === '24 names' && await text('#go') === 'Make 4 groups' && await np().locator('#round').isHidden(), `“24 names”, “Make 4 groups”, no Start over (${await text('#status')}, ${await text('#go')})`);
    let tl = await tiles();
    ok(tl.join() === N24.join() && !(await cards()).length, `before any groups, every name waits on the stage as a tile (${tl.length})`);
    const tileFit = await inFrame(() => { const s = document.getElementById('stage').getBoundingClientRect(); const ts = [...document.querySelectorAll('.groups-tile')];
      return { sizes: [...new Set(ts.map(t => getComputedStyle(t).fontSize))], out: ts.filter(t => { const r = t.getBoundingClientRect(); return r.left < s.left - 0.5 || r.right > s.right + 0.5 || r.top < s.top - 0.5 || r.bottom > s.bottom + 0.5 || t.scrollWidth > t.clientWidth + 1; }).map(t => t.textContent) }; });
    ok(tileFit.sizes.length === 1 && parseFloat(tileFit.sizes[0]) >= 20 && !tileFit.out.length, `the tiles are one size, as large as they all fit (${tileFit.sizes.join()}; ${tileFit.out.join(', ') || 'all in'})`);
    ok((await saved()).left.length === 22 && JSON.stringify((await saved()).picked) === JSON.stringify(p2.picked), 'choosing Groups leaves the pick round as it was');

    // ---- 24 names, Groups 6: the show, about 3 s, a pop as each name lands and a chime.
    await menu('groups:6');
    ok((await conf()).groups === 6 && await text('#go') === 'Make 6 groups' && await items() === MENU_G(6), `Groups 6: saved, ticked in the row, and the button says “Make 6 groups” (${await items()})`);
    await inFrame(() => { window.__sounds.length = 0; window.__lands.length = 0; });
    let t0 = Date.now();
    let g = await drawNow();
    const during = { go: await text('#go'), showing: await showing(), status: await text('#status') };
    await idle();
    let took = Date.now() - t0;
    ok(Array.isArray(g.groups) && g.groups.length === 6 && g.groups.every(x => x.length === 4) && sameList(g.groups.flat(), N24) && /^[a-z0-9]+-[a-z0-9]+-66$/.test(g.groupId),
      `the groups are saved before the show: 6 groups of 4, everyone once, with a groupId that ends with Groups 6 and the 6 groups made (${JSON.stringify(g.groups)}, ${g.groupId})`);
    ok(during.showing && during.go === 'Show now' && during.status === '24 names', `during the show: “Show now”, and the status as it was (${JSON.stringify(during)})`);
    ok(took > 2300 && took < 3900, `the show takes about 3 s (${took} ms)`);
    let cs = await cards();
    ok(cs.length === 6 && cs.every((c, i) => c.head === 'Group ' + (i + 1) && JSON.stringify(c.names) === JSON.stringify(g.groups[i])),
      `6 cards, Group 1 to Group 6, each with its names in deal order (${cs.map(c => c.head + ': ' + c.names.join(' ')).join(' / ')})`);
    ok(await text('#status') === '6 groups of 4' && await text('#go') === 'Shuffle again' && await np().locator('#round').isHidden(), `“6 groups of 4”, “Shuffle again” (${await text('#status')}, ${await text('#go')})`);
    ok(await eventually(async () => await said() === announced(g.groups)), `screen readers hear “${(await said()).slice(0, 60)}…”`);
    let snd = await inFrame(() => ({ sounds: window.__sounds.slice(), lands: window.__lands.slice(), notes: window.__notes || 0, audio: window.__audio || 0 }));
    let pops = snd.sounds.filter(s => s === 'pop').length;
    ok(snd.lands.length === 24 && pops === snd.lands.filter(l => l.pop != null).length && !unpopped(snd.lands) && snd.sounds.filter(s => s === 'chime').length === 1 && snd.sounds[snd.sounds.length - 1] === 'chime' && snd.notes === 0 && snd.audio === 0,
      `a pop as each name lands, then a chime (asked for: ${pops} pops for ${snd.lands.length} names, ${unpopped(snd.lands)} missing, ${snd.sounds.filter(s => s === 'chime').length} chime), and with Sound off nothing plays`);
    const heads = await inFrame(() => {
      const tok = n => { const t = document.createElement('i'); document.body.appendChild(t); t.style.color = `var(${n})`; const c = getComputedStyle(t).color; t.remove(); return c; };
      return { want: ['--np-c1', '--np-c2', '--np-c3', '--np-c4', '--np-c6', '--np-c7'].map(tok), ink: tok('--np-ink'),
        got: [...document.querySelectorAll('.groups-head')].map(h => getComputedStyle(h).backgroundColor), inks: [...document.querySelectorAll('.groups-head')].map(h => getComputedStyle(h).color) };
    });
    ok(JSON.stringify(heads.got) === JSON.stringify(heads.want) && heads.inks.every(c => c === heads.ink), `each card's heading in red, orange, yellow, green, blue, and purple, its words in --np-ink (${heads.got.join(' ')})`);
    await page.waitForTimeout(400);   // (the last name's pop as it lands)
    let fl = await fitLook();
    ok(!fl.bad.length && fl.sizes.length === 1, `every name inside its card, all one size (${fl.sizes.join()}; ${fl.bad.slice(0, 3).join('; ') || 'ok'})`);
    await page.screenshot({ path: OUT + 'name-picker-groups-6.png' });
    // Nothing runs between shows.
    await page.waitForTimeout(300);
    let c0 = await inFrame(() => window.__calls); await page.waitForTimeout(1200);
    ok(await inFrame(() => window.__calls) === c0, 'nothing runs after the show: no timers or animation frames');

    // ---- Shuffle again starts from the groups on screen; a tap skips to the end; Quick halves the show.
    let was = g;
    await np().locator('#go').click(); await page.waitForTimeout(150);
    const gathering = await inFrame(() => ({ stack: !!document.querySelector('.groups-stack'), gathering: document.querySelectorAll('.groups-ghost').length }));
    await page.waitForTimeout(600);
    await np().locator('#stage').click(); await page.waitForTimeout(150);
    g = await saved();
    cs = await cards();
    ok(g.groupId !== was.groupId && gathering.stack && gathering.gathering === 24 && !(await showing()) && cs.length === 6 && cs.every((c, i) => JSON.stringify(c.names) === JSON.stringify(g.groups[i]))
      && await inFrame(() => !document.querySelector('.groups-fly') && [...document.querySelectorAll('.groups-name')].every(n => getComputedStyle(n).opacity === '1')),
      `Shuffle again: new groups (the names gather into a stack first: ${JSON.stringify(gathering)}); a tap on the stage skips to the end, every name in its card`);
    ok(await eventually(async () => await said() === announced(g.groups)) && await text('#go') === 'Shuffle again', 'and screen readers hear the new groups');
    await menu('quick');
    ok(await items() === MENU_G(6, { quick: true }), 'Quick is ticked');
    t0 = Date.now(); await drawNow(); await idle(); took = Date.now() - t0;
    ok(took > 1000 && took < 2300, `with Quick the show takes about 1.5 s (${took} ms)`);
    await menu('quick');

    // ---- Sound on: the pops and the chime play.
    await menu('sound');
    const n0 = await inFrame(() => window.__notes || 0);
    await inFrame(() => { window.__sounds.length = 0; window.__lands.length = 0; });
    await np().locator('#go').click(); await idle();
    snd = await inFrame(() => ({ sounds: window.__sounds.slice(), lands: window.__lands.slice(), notes: window.__notes || 0, audio: window.__audio || 0 }));
    pops = snd.sounds.filter(s => s === 'pop').length;
    ok(snd.audio >= 1 && snd.lands.length === 24 && pops === snd.lands.filter(l => l.pop != null).length && !unpopped(snd.lands) && snd.notes - n0 >= pops + 3 && snd.sounds.filter(s => s === 'chime').length === 1,
      `with Sound on the pops and the chime play (${snd.notes - n0} notes, ${pops} pops for ${snd.lands.length} names, ${unpopped(snd.lands)} missing)`);
    await menu('sound');

    // ---- Changing the number keeps the cards; the button says what it will do.
    g = await saved();
    await menu('groups:3');
    cs = await cards();
    ok(cs.length === 6 && (await saved()).groupId === g.groupId && await text('#go') === 'Make 3 groups' && await text('#status') === '6 groups of 4' && await items() === MENU_G(3),
      `Groups 3: the 6 cards stay, “6 groups of 4”, and the button says “Make 3 groups” (${await text('#go')})`);
    await page.reload(); await boardUp(page);
    ok(await eventually(async () => (await cards().catch(() => [])).length === 6) && await eventually(async () => await text('#go') === 'Make 3 groups'),
      `after a reload too: the 6 cards, and “Make 3 groups” (${await text('#go')})`);
    await menu('groups:6');
    ok(await text('#go') === 'Shuffle again', 'back to 6: “Shuffle again”');
    await menu('groups:3');
    g = await drawNow(); await idle();
    ok(g.groups.length === 3 && g.groups.every(x => x.length === 8) && (await cards()).length === 3 && await text('#status') === '3 groups of 8' && await text('#go') === 'Shuffle again',
      `“Make 3 groups” makes 3 groups of 8 (${await text('#status')})`);
    // Raised since the draw: “Make 4 groups”, after a reload too.
    await menu('groups:4');
    const raised = await text('#go');
    await page.reload(); await boardUp(page);
    ok(raised === 'Make 4 groups' && await eventually(async () => (await cards().catch(() => [])).length === 3) && await eventually(async () => await text('#go') === 'Make 4 groups'),
      `Groups 4 with 3 groups up: “${raised}”, and after a reload “${await text('#go')}”`);
    await menu('groups:3');
    ok(await text('#go') === 'Shuffle again', 'back to 3: “Shuffle again”');

    // ---- Back to the pick round: Spinning wheel shows the same round and last winners.
    await menu('style:wheel');
    ok(await text('#status') === roundWas.status && JSON.stringify((await saved()).picked) === JSON.stringify(roundWas.picked) && await items() === MENU_P('wheel', 1, { startOver: true })
      && sameList(await np().locator('html').evaluate(() => [...document.querySelectorAll('.wheel-nm')].map(e => e.textContent)), roundWas.picked),
      `Wheel → Groups → Wheel: the same “${roundWas.status}”, the last winners (${roundWas.picked}), and No repeats and Start over are back`);
    const p3 = await (async () => { await np().locator('#go').click(); await idle(); return saved(); })();
    ok(p3.left.length === 21 && roundWas.left.includes(p3.picked[0]), `and No repeats picks up where it left off (${p3.picked}, ${p3.left.length} left)`);
    await menu('style:groups');
    cs = await cards();
    ok(cs.length >= 1 && JSON.stringify(cs.map(c => c.names)) === JSON.stringify((await saved()).groups), 'switching to Groups shows the last groups');

    // ---- Another way chosen in the middle of a show: screen readers hear that show's result, never the other way's.
    await np().locator('#go').click(); await page.waitForTimeout(400);
    const dealing = await saved(), wasShowing = await showing();
    await menu('style:wheel');
    ok(wasShowing && await eventually(async () => await said() === announced(dealing.groups), 3000),
      `the wheel chosen while groups deal: screen readers hear the new groups (${(await said()).slice(0, 50)}…)`);
    await np().locator('#go').click(); await page.waitForTimeout(400);
    const spinning = await saved(), wasSpinning = await showing();
    await menu('style:groups');
    ok(wasSpinning && await eventually(async () => await said() === 'Picked: ' + spinning.picked.join(', '), 3000),
      `Groups chosen while the wheel spins: they hear the pick (${(await said()).slice(0, 50)})`);

    // ---- 25 names, Groups 4: groups differ by one at most, the first ones larger.
    await menu('groups:4');
    await setNames(N24.concat(['Xavier']));
    ok((await cards()).flatMap(c => c.names).includes('Xavier') && await text('#go') === 'Make 4 groups', 'a 25th name joins the groups on screen');
    g = await drawNow(); await idle();
    ok(JSON.stringify(g.groups.map(x => x.length)) === '[7,6,6,6]' && await text('#status') === '4 groups of 6 or 7' && JSON.stringify((await cards()).map(c => c.names.length)) === '[7,6,6,6]',
      `25 names in 4 groups: 7, 6, 6, 6, and “4 groups of 6 or 7” (${g.groups.map(x => x.length)}; ${await text('#status')})`);
    await page.waitForTimeout(400);
    fl = await fitLook();
    ok(!fl.bad.length && fl.sizes.length === 1, `the cards fit, every name one size (${fl.sizes.join()}; ${fl.bad.slice(0, 3).join('; ') || 'ok'})`);

    // ---- Editing names while groups are up.
    let before = await cards();
    const gone = before[1].names[0];
    await setNames(N24.concat(['Xavier']).filter(n => n !== gone));
    let after = await cards();
    ok(after.length === 4 && !after.flatMap(c => c.names).includes(gone) && JSON.stringify(after[1].names) === JSON.stringify(before[1].names.slice(1))
      && JSON.stringify(after.map(c => c.names.length)) === '[7,5,6,6]' && await text('#status') === '4 groups of 5 to 7' && await text('#go') === 'Shuffle again',
      `a removed name (${gone}) leaves its card; the status updates (${await text('#status')}), and the button stays “Shuffle again”`);
    await setNames(N24.concat(['Xavier']).filter(n => n !== gone).concat(['Yara']));
    after = await cards();
    ok(after[1].names.includes('Yara') && JSON.stringify(after.map(c => c.names.length)) === '[7,6,6,6]' && await text('#go') === 'Shuffle again',
      `a new name (Yara) joins the smallest group (${after.map(c => c.names.length)})`);
    await setNames(N24.concat(['Xavier']).filter(n => n !== gone).concat(['Yara', 'Zed']));
    after = await cards();
    const zedIn = after.findIndex(c => c.names.includes('Zed'));
    ok(zedIn >= 1 && JSON.stringify(after.map(c => c.names.length).sort()) === '[6,6,7,7]', `another (Zed) joins one of the smallest, chosen at random (Group ${zedIn + 1})`);
    before = after;
    const whole = before[2].names;
    await setNames(before.flatMap(c => c.names).filter(n => !whole.includes(n)));
    after = await cards();
    ok(after.length === 3 && after.map(c => c.head).join() === 'Group 1,Group 2,Group 3' && JSON.stringify(after.map(c => c.names)) === JSON.stringify([before[0].names, before[1].names, before[3].names])
      && /^3 groups of/.test(await text('#status')) && await text('#go') === 'Shuffle again',
      `removing a whole group's names removes its card; the others keep their order, numbered 1 to 3 (${after.map(c => c.head + ' ' + c.names.length).join(', ')})`);
    const st = await saved();
    ok(JSON.stringify(st.groups) === JSON.stringify(after.map(c => c.names)), 'the groups are saved as they are shown');

    // ---- Saved: a reload shows the groups, and so does a second tab; a new draw in one plays the show in the other.
    g = await saved();
    const page2 = await ctx.newPage(); watch(page2, 'tab 2');
    await page2.goto(BASE); await boardUp(page2); await freeBoard(page2);
    ok(await eventually(async () => JSON.stringify((await cards(page2)).map(c => c.names)) === JSON.stringify(g.groups)) && await text('#go', page2) === 'Shuffle again',
      'a second tab shows the same groups');
    await page.reload(); await boardUp(page);
    ok(await eventually(async () => JSON.stringify((await cards()).map(c => c.names)) === JSON.stringify(g.groups)) && !(await showing()) && await text('#go') === 'Shuffle again',
      'after a reload the groups are still there, with no show');
    const g2 = await drawNow();
    ok(await eventually(() => showing(page2), 2000), 'a new draw in one tab plays the show in the other');
    await idle(); await idle(page2);
    ok(JSON.stringify((await cards(page2)).map(c => c.names)) === JSON.stringify(g2.groups) && await eventually(async () => await said(page2) === announced(g2.groups)),
      'and both end on the same groups');
    await page2.close();

    // ---- A template keeps Groups and the number, never the names or groups.
    await menu('groups:5');
    await page.click('.picker-btn.right'); await page.click('[data-ctl="export"]'); await page.waitForTimeout(200);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal .btn[data-i="1"]')]);
    await dl.saveAs(OUT + 'name-picker-groups-template.21board');
    const tpl = JSON.parse(fs.readFileSync(OUT + 'name-picker-groups-template.21board', 'utf8')), tp = tpl.instances.find(i => i.widgetId === 'name-picker');
    ok(tpl.kind === 'template' && tp && tp.data === null && tp.config.style === 'groups' && tp.config.groups === 5 && !N24.some(n => JSON.stringify(tpl).includes('"' + n + '"')),
      `a template keeps Groups and the number, and no names or groups (${JSON.stringify(tp && tp.config)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));

    // ---- Small classes: 3 names with Groups at 4 make 3 groups; 1 name, 1 group.
    errors.length = 0;
    const smallIks = [];
    for (const [list, go, status] of [[['Ava', 'Ben', 'Carlos'], 'Make 3 groups', '3 groups of 1'], [['Ava'], 'Make 1 group', '1 group of 1']]) {
      const ik = await page.evaluate(() => window.__board21.openWidget('name-picker'));
      smallIks.push(ik);
      await eventually(async () => ((await conf(page, ik)) || {}).style === 'wheel');
      await np(page, ik).locator('#list').fill(list.join('\n')); await np(page, ik).locator('#done').click(); await page.waitForTimeout(300);
      await menu('style:groups', page, ik); await menu('quick', page, ik);
      ok(await text('#go', page, ik) === go && await text('#status', page, ik) === (list.length === 1 ? '1 name' : list.length + ' names'), `${list.length} name${list.length > 1 ? 's' : ''}, Groups 4: “${await text('#go', page, ik)}”`);
      const s = await drawNow(page, ik); await idle(page, ik);
      cs = await cards(page, ik);
      ok(s.groups.length === list.length && cs.length === list.length && cs.every(c => c.names.length === 1) && sameList(cs.flatMap(c => c.names), list) && await text('#status', page, ik) === status
        && await text('#go', page, ik) === 'Shuffle again', `then ${cs.length} card${cs.length > 1 ? 's' : ''} of 1, “${await text('#status', page, ik)}”`);
    }
    // A short list that grows: 1 name drawn with Groups 4 made 1 group. A second name joins it, and the button says what
    // a tap makes now, “Make 2 groups”.
    const ik1 = smallIks[1];
    await page.evaluate(ik => window.__board21.focusWin(ik), ik1); await setNames(['Ava', 'Ben'], page, ik1);
    ok(await text('#status', page, ik1) === '1 group of 2' && await text('#go', page, ik1) === 'Make 2 groups',
      `1 name drawn with Groups 4, then a second name: “${await text('#status', page, ik1)}”, “${await text('#go', page, ik1)}”`);
    const two = await drawNow(page, ik1); await idle(page, ik1);
    ok(two.groups.length === 2 && await text('#status', page, ik1) === '2 groups of 1' && await text('#go', page, ik1) === 'Shuffle again',
      `and a tap makes 2 groups of 1 (${await text('#status', page, ik1)}, “${await text('#go', page, ik1)}”)`);
    // The 3 groups of 1, with the number raised since: “Make 3 groups”, after a reload too. Then the whole class added:
    // they join the 3 groups, and the button says what a tap makes now, “Make 4 groups”.
    const ik3 = smallIks[0], front = () => page.evaluate(ik => window.__board21.focusWin(ik), ik3);
    await front(); await menu('groups:5', page, ik3);
    const raised3 = await text('#go', page, ik3);
    await page.reload(); await boardUp(page);
    ok(raised3 === 'Make 3 groups' && await eventually(async () => (await cards(page, ik3).catch(() => [])).length === 3) && await eventually(async () => await text('#go', page, ik3) === 'Make 3 groups'),
      `3 names drawn with Groups 4, then Groups 5: “${raised3}”, and after a reload “${await text('#go', page, ik3)}”`);
    await front(); await menu('groups:4', page, ik3);
    ok(await text('#go', page, ik3) === 'Shuffle again', 'back to 4: “Shuffle again”');
    await front(); await setNames(N24, page, ik3);
    ok(await text('#status', page, ik3) === '3 groups of 8' && await text('#go', page, ik3) === 'Make 4 groups',
      `the whole class added: “${await text('#status', page, ik3)}”, and the button says what a tap makes, “${await text('#go', page, ik3)}”`);
    const grown = await drawNow(page, ik3); await idle(page, ik3);
    ok(grown.groups.length === 4 && await text('#status', page, ik3) === '4 groups of 6' && await text('#go', page, ik3) === 'Shuffle again',
      `and a tap makes 4 groups of 6 (${await text('#status', page, ik3)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- Fair: with 8 names in 2 groups, each name is in Group 1 about half the time, and every two share a group
    // sometimes. (Reduce motion: each draw is on screen at once. Every draw the page saves is counted.)
    errors.length = 0;
    const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await rctx.addInitScript(SPY);
    const rp = await rctx.newPage(); watch(rp, 'reduce motion');
    await rp.goto(BASE); await boardUp(rp); await freeBoard(rp);
    await rp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(rp)) || {}).style === 'wheel');
    const N8 = ['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana'];
    await np(rp).locator('#list').fill(N8.join('\n')); await np(rp).locator('#done').click(); await rp.waitForTimeout(300);
    await menu('style:groups', rp); await menu('groups:2', rp); await menu('sound', rp);
    // Reduce motion: the groups fade in, nothing moves, and the chime still plays.
    await inFrame(() => { window.__sounds.length = 0; window.__moved = []; const a = Element.prototype.animate; Element.prototype.animate = function (k) { window.__moved.push(JSON.stringify(k)); return a.apply(this, arguments); }; }, rp);
    const n1 = await inFrame(() => window.__notes || 0, rp);
    const rg = await drawNow(rp);
    const look = await inFrame(() => ({ fade: [...document.querySelectorAll('.groups-card')].every(c => c.classList.contains('groups-fade')), fly: document.querySelectorAll('.groups-fly, .groups-stack').length,
      moved: window.__moved.filter(k => /transform|left|top|translate/.test(k)).length,
      css: document.getAnimations().filter(a => a.effect && a.effect.getKeyframes().some(k => 'transform' in k || 'left' in k || 'top' in k || 'translate' in k)).length }), rp);
    ok(!(await showing(rp)) && rg.groups.length === 2 && look.fade && !look.fly && !look.moved && !look.css && await eventually(async () => await said(rp) === announced(rg.groups)),
      `with reduce motion the groups fade in, with nothing moving (${JSON.stringify(look)})`);
    ok(await eventually(async () => await inFrame(() => window.__notes || 0, rp) - n1 >= 3) && !(await inFrame(() => window.__sounds.includes('pop'), rp)),
      `and the chime still plays when Sound is on (${await inFrame(() => window.__notes || 0, rp) - n1} notes, no pops)`);
    await menu('sound', rp);
    const draws = await inFrame(() => {
      const out = [], save = Board21.save;
      Board21.save = function (d) { if (d && d.groups && d.groups.length) out.push(d.groups.map(g => g.slice())); return save.apply(this, arguments); };
      for (let i = 0; i < 400; i++) { drewAt = -1e9; document.getElementById('go').click(); }   // (each a tap of its own, not a double tap)
      Board21.save = save;
      return out;
    }, rp);
    const inOne = Object.fromEntries(N8.map(n => [n, 0])), pairs = new Set();
    for (const d of draws) {
      for (const n of d[0]) inOne[n]++;
      for (const grp of d) for (const a of grp) for (const b of grp) if (a < b) pairs.add(a + '+' + b);
    }
    const shares = N8.map(n => Math.round(inOne[n] / draws.length * 100));
    ok(draws.length === 400 && draws.every(d => d.length === 2 && d[0].length === 4 && d[1].length === 4 && sameList(d.flat(), N8)), `400 draws, each 2 groups of 4 with everyone once (${draws.length})`);
    ok(shares.every(s => s >= 35 && s <= 65), `each name is in Group 1 between 35% and 65% of the time (${N8.map((n, i) => n + ' ' + shares[i] + '%').join(', ')})`);
    ok(pairs.size === 28, `every two names share a group sometimes (${pairs.size} of 28 pairs)`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await rctx.close();

    // ---- A board from a file: groups are checked as picks are. Names not in the list, a student in two groups, 7
    // groups, empty groups, things that aren't names, and huge lists are dropped, without errors. A student the groups
    // leave out joins the smallest group, so no one is left off the stage.
    errors.length = 0;
    const ictx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const ip = await ictx.newPage(); watch(ip, 'import');
    await ip.goto(BASE); await boardUp(ip); await freeBoard(ip);
    const A8 = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'];
    const win = (instance, data, config) => ({ widgetId: 'name-picker', instance, open: true, z: instance, rect: { x: 10 + ((instance - 1) % 3) * 520, y: 10 + Math.floor((instance - 1) / 3) * 440, w: 500, h: 420 }, data, config });
    const file = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Groups' }, instances: [
      win(1, { names: ['Ava', 'Ben', 'Carlos', 'Dana', 'Ava'], groups: [['Ava', 'Zed', ' Ben '], ['Ben', 'Carlos', 7, null, {}, ['Dana']], [], ['Ava', 'Ava', 'Dana'], 'Eli', ['Carlos']], groupId: 'mwp2g7b7-pg6utj' }, { style: 'groups', groups: 9 }),
      win(2, { names: A8, groups: [['A1'], ['A2'], ['A3'], ['A4'], ['A5'], ['A6'], ['A7', 'A8']], groupId: 'mwp2g7b7-pg6utk' }, { style: 'groups', groups: 3 }),
      win(3, { names: ['Ava', 'Ben'], groups: Array.from({ length: 100000 }, () => ['Ava']), groupId: '<b>x</b>' }, { style: 'groups', groups: 1 }),
      win(4, { names: ['Ava', 'Ben'], groups: [Array.from({ length: 200000 }, () => 'Ben').concat(['Ava'])], groupId: 5 }, { style: 'groups', groups: 'x' }),
      win(5, { names: ['Ava', 'Ben'], groups: 'Ava,Ben', groupId: null }, { style: 'groups', groups: 2 }),
      win(6, { names: ['Ava', 'Ben', 'Carlos', 'Dana'], groups: [[['Ava']], ['Ben']], groupId: 'mwp2g7b7-pg6utl' }, { style: 'groups', groups: 2 })
    ] };
    fs.writeFileSync(OUT + 'name-picker-groups.21board', JSON.stringify(file));
    const tImport = Date.now();
    await ip.setInputFiles('#import-input', OUT + 'name-picker-groups.21board'); await ip.waitForTimeout(300);
    await ip.click('#modal .btn:has-text("Replace this page")');
    ok(await eventually(async () => (await Promise.all([1, 2, 3, 4, 5, 6].map(n => items(ip, 'name-picker:' + n).catch(() => '')))).every(Boolean), 15000), 'the board from the file opens with its six pickers');
    await ip.waitForTimeout(800);
    const C = async n => (await cards(ip, 'name-picker:' + n)).map(c => c.names);
    ok(JSON.stringify(await C(1)) === '[["Ava","Ben"],["Carlos"],["Ava","Dana"]]' && await items(ip, 'name-picker:1') === MENU_G(4)
      && await text('#status', ip, 'name-picker:1') === '3 groups of 1 or 2', `only names in the list, each student once, no empty groups; Groups 9 falls back to 4 (${JSON.stringify(await C(1))}, ${await text('#status', ip, 'name-picker:1')})`);
    ok(JSON.stringify(await C(2)) === '[["A1","A7"],["A2","A8"],["A3"],["A4"],["A5"],["A6"]]' && await text('#status', ip, 'name-picker:2') === '6 groups of 1 or 2',
      `at most 6 groups; A7 and A8, left out with the 7th, join the smallest groups (${JSON.stringify(await C(2))}, ${await text('#status', ip, 'name-picker:2')})`);
    ok(JSON.stringify(await C(3)) === '[["Ava","Ben"]]' && JSON.stringify(await C(4)) === '[["Ben","Ava"]]' && Date.now() - tImport < 15000, `huge lists are cut short, quickly (${JSON.stringify(await C(3))}, ${JSON.stringify(await C(4))}, ${Date.now() - tImport} ms)`);
    ok(JSON.stringify(await C(6)) === '[["Ben","Ava","Carlos","Dana"]]' && await text('#status', ip, 'name-picker:6') === '1 group of 4',
      `a group of lists is dropped, and everyone the groups leave out joins the one left (${JSON.stringify(await C(6))}, ${await text('#status', ip, 'name-picker:6')})`);
    // A crafted file with a long list and many strings that aren't names reads quickly: the list is read once, not
    // searched again for every string.
    const cost = await inFrame(() => {
      const names = Array.from({ length: 3000 }, (_, i) => 'Student ' + i), junk = Array.from({ length: 4000 }, (_, i) => 'Nobody ' + i);
      const t = performance.now(), s = readState({ names, groups: Array.from({ length: 100 }, () => junk), left: Array.from({ length: 100 }, () => junk).flat(), picked: junk });
      return { ms: Math.round(performance.now() - t), names: s.names.length, groups: s.groups.length, left: s.left.length, picked: s.picked.length };
    }, ip, 'name-picker:1');
    ok(cost.ms < 500 && cost.names === 3000 && !cost.groups && !cost.left && !cost.picked, `3,000 names with 400,000 strings that aren’t names read in ${cost.ms} ms (${JSON.stringify(cost)})`);
    ok(!(await C(5)).length && (await tiles(ip, 'name-picker:5')).join() === 'Ava,Ben' && await text('#go', ip, 'name-picker:5') === 'Make 2 groups', 'groups that aren’t a list are dropped: the names wait as tiles, “Make 2 groups”');
    const clean = await drawNow(ip, 'name-picker:1'); await idle(ip, 'name-picker:1');
    ok(clean.groups.length === 4 && sameList(clean.groups.flat(), ['Ava', 'Ben', 'Carlos', 'Dana', 'Ava']) && /^[a-z0-9]+-[a-z0-9]+-44$/.test(clean.groupId), `and the next draw is saved clean (${JSON.stringify(clean.groups)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ictx.close();

    // ---- Fit: the smallest window and one that fills the board, 30 names in 2 groups and long names; every name in
    // its card and one size. A change of theme, accent, or Text style fits them again.
    errors.length = 0;
    const fctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const fp = await fctx.newPage(); watch(fp, 'fit');
    await fp.goto(BASE); await boardUp(fp); await freeBoard(fp);
    await fp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(fp)) || {}).style === 'wheel');
    const N30 = N24.concat(['Xavier', 'Yara', 'Leo', 'Mia', 'Noah', 'Sofia']);
    const LONG = ['Maximiliana-Guadalupe', 'Bartholomew Alexander', 'Anne-Sophie', 'Christopher', 'Jo', 'Oluwaseun', 'Krzysztof', 'Xiomara Isabel', 'Ty', 'Wilhelmina'];
    await np(fp).locator('#list').fill(N30.join('\n')); await np(fp).locator('#done').click(); await fp.waitForTimeout(300);
    await menu('style:groups', fp); await menu('groups:2', fp); await menu('quick', fp);
    await drawNow(fp); await idle(fp);
    const fits = [];
    for (const [label, list, k] of [['30 names in 2 groups', N30, 2], ['long names in 3 groups', LONG, 3], ['30 names in 6 groups', N30, 6]]) {
      if (k !== 2 || list !== N30) { await setNames(list, fp); await menu('groups:' + k, fp); await drawNow(fp); await idle(fp); }
      for (const [w, h, max] of [[360, 270, false], [900, 600, false], [0, 0, true]]) {
        if (max) await fp.evaluate(() => window.__board21.setMaximized('name-picker:1', true));
        else { await fp.evaluate(() => window.__board21.setMaximized('name-picker:1', false)); await fp.evaluate(([w, h]) => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w, h }), [w, h]); }
        await fp.waitForTimeout(700);
        const f = await fitLook(fp);
        fits.push(`${label}, ${max ? 'filling the board' : w + '×' + h}: ${f.sizes.join()}${f.bad.length ? ' ✗' : ''}`);
        ok(f.cards === k && !f.bad.length && f.sizes.length === 1, `${label}, ${max ? 'filling the board' : w + '×' + h}: every name in its card, one size (${f.sizes.join()}; ${f.bad.slice(0, 3).join('; ') || 'ok'})`);
        if (label === '30 names in 2 groups' && max) await fp.screenshot({ path: OUT + 'name-picker-groups-30-full.png' });
        if (label === 'long names in 3 groups' && w === 360) await fp.screenshot({ path: OUT + 'name-picker-groups-long-small.png' });
      }
    }
    // A 25th name joins 6 groups of 4: its group takes another column, and every card's names stay in its middle.
    await fp.evaluate(() => window.__board21.setMaximized('name-picker:1', false));
    await setNames(N24, fp); await menu('groups:6', fp); await drawNow(fp); await idle(fp);
    await setNames(N24.concat(['Xavier']), fp);
    for (const [w, h] of [[560, 420], [900, 640]]) {
      await fp.evaluate(([w, h]) => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w, h }), [w, h]); await fp.waitForTimeout(700);
      const f = await fitLook(fp);
      ok(f.cards === 6 && !f.bad.length && f.sizes.length === 1, `25 names in 6 groups, ${w}×${h}: each card's names in its middle (${f.sizes.join()}; ${f.bad.slice(0, 3).join('; ') || 'ok'})`);
      if (w === 900) await fp.screenshot({ path: OUT + 'name-picker-groups-25-in-6.png' });
    }
    await fp.evaluate(() => window.__board21.setMaximized('name-picker:1', false));
    await fp.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 700, h: 500 })); await fp.waitForTimeout(600);
    const fsWas = (await fitLook(fp)).fs;
    await setTheme(fp, 'dark');
    let fd = await fitLook(fp);
    ok(!fd.bad.length && fd.sizes.length === 1 && Math.abs(fd.fs - fsWas) < 1 && await inFrame(() => getComputedStyle(document.querySelector('.groups-card')).backgroundColor !== 'rgb(255, 255, 255)', fp),
      `dark theme: the cards in dark colors, every name still fits (${fd.sizes.join()})`);
    await fp.screenshot({ path: OUT + 'name-picker-groups-dark.png' });
    await openSettings(fp, ['bg']); await fp.click('#settings [data-act="accent"][data-val="purple"]'); await fp.keyboard.press('Escape'); await fp.waitForTimeout(500);
    fd = await fitLook(fp);
    ok(!fd.bad.length && fd.sizes.length === 1, `a new accent: every name still fits (${fd.sizes.join()})`);
    // Text style: the names in its letters, fitted again. Then long names in a small window, where the width sets the
    // size, in Early readers and in Easier to read (Atkinson Hyperlegible).
    const nameFont = () => inFrame(() => getComputedStyle(document.querySelector('.groups-name')).fontFamily, fp);
    const letters = async val => { await openSettings(fp, ['letters']); await fp.click(`#settings [data-act="letters"][data-val="${val}"]`); await fp.keyboard.press('Escape'); await fp.waitForTimeout(800); };
    await letters('early');
    fd = await fitLook(fp);
    let font = await nameFont();
    ok(!fd.bad.length && fd.sizes.length === 1 && /21Board Early Readers/.test(font), `Text style Early readers: the names in its letters, fitted again (${fd.sizes.join()}; ${font})`);
    await setNames(LONG, fp); await menu('groups:3', fp); await drawNow(fp); await idle(fp);
    await fp.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 360, h: 270 })); await fp.waitForTimeout(700);
    for (const [val, label, family] of [['early', 'Early readers', /21Board Early Readers/], ['legible', 'Easier to read', /Atkinson Hyperlegible/]]) {
      if (val !== 'early') await letters(val);
      fd = await fitLook(fp); font = await nameFont();
      ok(fd.cards === 3 && !fd.bad.length && fd.sizes.length === 1 && family.test(font), `${label}, long names at 360×270: in its letters, every name in its card, one size (${fd.sizes.join()}; ${font}; ${fd.bad.slice(0, 3).join('; ') || 'ok'})`);
    }
    // The data format names what the Name Picker saves.
    const dataDoc = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-FORMAT.md'), 'utf8').replace(/\s+/g, ' ');
    ok(/`\{ names, left, picked, pickId, [^}]*current, [^}]*groups, groupId[, }]/.test(dataDoc) && dataDoc.includes('`{ noRepeats, style, winners, groups, quick, sound }`') && dataDoc.includes('`"groups"`'), 'docs/DATA-FORMAT.md gives its content and its config, Groups too');
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    ok(['Big name', 'Spinning wheel', 'Spotlight', 'Lotto', 'Groups'].every(s => readme.includes(s)), 'README.md names the styles, Groups too');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await fctx.close();
  }],
  // ---- Bracket. Everyone goes into a tournament bracket, drawn at random; the teacher taps each match's winner.
  ['Name Picker: Bracket', async (browser) => {
    // Every sound a style asks the host for (the host plays it only with Sound ticked), each name as it lands with the
    // time of its pop, the sounds the page starts, the notes it plays, and the timers and animation frames it asks for.
    const SPY = () => {
      window.__sounds = []; window.__lands = [];
      const remove = Element.prototype.remove;
      Element.prototype.remove = function () { if (this.isConnected && this.classList.contains('bracket-fly')) window.__lands.push({ t: performance.now(), pop: null }); return remove.apply(this, arguments); };
      let np;
      Object.defineProperty(window, 'NamePicker', { configurable: true, get: () => np, set: v => {
        np = v;
        const register = v.register;
        v.register = function (id, style) {
          const mount = style.mount;
          style.mount = function (root, host) {
            const sound = host.sound;
            host.sound = function (name) {
              const l = window.__lands[window.__lands.length - 1];
              if (name === 'pop' && l) l.pop = performance.now();
              window.__sounds.push(name); return sound.apply(this, arguments);
            };
            return mount.call(this, root, host);
          };
          return register.call(this, id, style);
        };
      } });
      window.__calls = 0;
      for (const fn of ['setTimeout', 'setInterval', 'requestAnimationFrame']) { const f = window[fn]; window[fn] = function () { window.__calls++; return f.apply(this, arguments); }; }
      if (!window.AudioContext) return;
      window.__audio = 0; window.__notes = 0;
      const A = window.AudioContext, base = (window.BaseAudioContext || A).prototype;
      window.AudioContext = class extends A { constructor(o) { super(o); window.__audio++; } };
      for (const fn of ['createOscillator', 'createBufferSource']) { const f = base[fn]; base[fn] = function () { window.__notes++; return f.apply(this, arguments); }; }
    };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await ctx.addInitScript(SPY);
    const page = await ctx.newPage();
    const errors = [];
    const watch = (p, tab) => { p.on('pageerror', e => errors.push(`[${tab}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && /name-picker/.test(m.location().url || '')) errors.push(`[${tab} console] ${m.text()}`); }); };
    watch(page, 'tab 1');
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const np = (p = page, ik = 'name-picker:1') => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const saved = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const conf = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const menu = (id, p = page, ik = 'name-picker:1') => choose(p, ik, id);
    const items = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems
      .map(i => i.separator ? '—' : i.heading ? '# ' + i.label : i.choices ? '[' + i.choices.map(c => c.label + (c.checked ? ' ✓' : '')).join(' ') + ']'
        : i.label + (i.checked ? ' ✓' : '') + (i.disabled ? ' (off)' : '')).join(' | '), ik);
    const MENU_B = ({ sound = false, quick = false } = {}) => ['Edit names', '—', '# Pick with', ...NP_STYLES.map(([id, l]) => l + (id === 'bracket' ? ' ✓' : '')),
      '—', 'Sound' + (sound ? ' ✓' : ''), 'Quick' + (quick ? ' ✓' : '')].join(' | ');
    const showing = (p = page, ik) => np(p, ik).locator('body').evaluate(b => b.classList.contains('showing'));
    const idle = (p = page, ik) => eventually(async () => !(await showing(p, ik)), 12000);
    const text = (sel, p = page, ik) => np(p, ik).locator(sel).textContent();
    const said = (p = page, ik) => text('#said', p, ik);
    const inFrame = (fn, p = page, ik, arg) => np(p, ik).locator('html').evaluate(fn, arg);
    const setNames = async (list, p = page, ik) => { await menu('edit', p, ik); await np(p, ik).locator('#list').fill(list.join('\n')); await np(p, ik).locator('#done').click(); await p.waitForTimeout(300); };
    const sameList = (a, b) => a.slice().sort().join() === b.slice().sort().join();
    const pow2 = n => { let P = 2; while (P < n) P *= 2; return P; };
    const left = n => n === 1 ? '1 match left' : `${n} matches left`;
    // The bracket on the stage: each spot (its number, round, half, name, and how it looks) and the lines that turned the
    // accent color, by the spot each comes from.
    const board = (p = page, ik) => inFrame(() => {
      const tr = document.querySelector('.bracket-trophy');
      return { spots: [...document.querySelectorAll('.bracket-spot')].map(e => ({ spot: +e.dataset.spot, round: +e.dataset.round, half: e.dataset.half, name: e.textContent,
        ready: e.classList.contains('bracket-ready'), out: e.classList.contains('bracket-out'), empty: e.classList.contains('bracket-empty'), champ: e.classList.contains('bracket-champ'),
        bye: e.hasAttribute('data-bye'), tab: e.tabIndex, role: e.getAttribute('role'), label: e.getAttribute('aria-label') })),
      won: [...document.querySelectorAll('.bracket-lines path.bracket-won')].map(l => +l.dataset.from).sort((a, b) => a - b),
      trophy: tr ? tr.classList.contains('bracket-gold') : null, tiles: [...document.querySelectorAll('.bracket-tile')].map(t => t.textContent) };
    }, p, ik);
    const spotOf = (b, s) => b.spots.find(x => x.spot === s);
    const readyOf = b => b.spots.filter(x => x.ready).map(x => x.spot).sort((a, b2) => a - b2);
    const tap = async (s, p = page, ik) => { await np(p, ik).locator(`.bracket-spot[data-spot="${s}"]`).click(); await p.waitForTimeout(80); };
    // Taps a ready spot k times, each the highest-numbered one (so the first round goes first), and answers the bracket the
    // board then has.
    const play = async (k, p = page, ik) => {
      for (let i = 0; i < k; i++) {
        const was = ((await saved(p, ik)).bracket || { picks: [] }).picks.length, r = readyOf(await board(p, ik));
        await tap(r[r.length - 1], p, ik);
        await eventually(async () => (await saved(p, ik)).bracket.picks.length === was + 1, 3000);
      }
      return (await saved(p, ik)).bracket;
    };
    // Taps the main button and answers the bracket once the board has it.
    const drawNow = async (p = page, ik) => {
      const was = ((await saved(p, ik)) || {}).bracketId;
      await np(p, ik).locator('#go').click();
      await eventually(async () => ((await saved(p, ik)) || {}).bracketId !== was, 3000);
      return saved(p, ik);
    };
    const quiet = (p = page, ik) => inFrame(() => document.getAnimations().filter(a => a.playState === 'running').length, p, ik);
    // Every sound the host plays: a style's, the sample when Sound is ticked, and the one reduce motion plays.
    const played = (p = page, ik) => inFrame(() => {
      if (!window.__played) { window.__played = []; const play = Sound.play; Sound.play = function (name) { window.__played.push(name); return play.apply(this, arguments); }; }
      return window.__played.splice(0);
    }, p, ik);
    // What still moves on the stage: a name on its way to its spot, and the animations running.
    const moving = (p = page, ik) => inFrame(() => ({ fly: !!document.querySelector('.bracket-fly'), running: document.getAnimations().filter(a => a.playState === 'running').length }), p, ik);
    // Waits up to 3 s until nothing moves. A tap's slide and its pop take about 0.6 s, longer on a slow machine.
    const slid = (p = page, ik) => eventually(async () => { const m = await moving(p, ik); return !m.fly && !m.running; }, 3000);
    // How the bracket fits: every spot inside the stage and apart from the others, every name inside its spot and one size
    // (the champion's own size), each line starting at the outer edge of its spot and ending at the inner edge of the spot
    // it goes to, in the middle of each, and the trophy clear of the spots.
    const fitLook = (p = page, ik) => inFrame(() => {
      const root = document.querySelector('.bracket'), R = root.getBoundingClientRect(), bad = [], sizes = new Set();
      const rel = r => ({ l: r.left - R.left, r: r.right - R.left, t: r.top - R.top, b: r.bottom - R.top });
      const over = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
      const spots = [...document.querySelectorAll('.bracket-spot')].map(e => ({ e, s: +e.dataset.spot, half: e.dataset.half, r: rel(e.getBoundingClientRect()) }));
      for (const [i, a] of spots.entries()) {
        if (a.r.l < -0.5 || a.r.t < -0.5 || a.r.r > R.width + 0.5 || a.r.b > R.height + 0.5) bad.push(`spot ${a.s} is outside the stage`);
        for (const b of spots.slice(i + 1)) if (over(a.r, b.r)) bad.push(`spots ${a.s} and ${b.s} overlap`);
        if (a.e.textContent) {
          const rg = document.createRange(); rg.selectNodeContents(a.e); const t = rel(rg.getBoundingClientRect());
          if (t.l < a.r.l - 0.5 || t.r > a.r.r + 0.5 || t.t < a.r.t - 0.5 || t.b > a.r.b + 0.5 || a.e.scrollWidth > a.e.clientWidth + 1) bad.push(`“${a.e.textContent}” overflows spot ${a.s}`);
        }
        if (a.s !== 1) sizes.add(getComputedStyle(a.e).fontSize);
      }
      const at = new Map(spots.map(x => [x.s, x]));
      const lines = [...document.querySelectorAll('.bracket-lines path')];
      for (const l of lines) {
        const from = at.get(+l.dataset.from), to = at.get(+l.dataset.to), n = (l.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number);
        if (!from || !to || n.length < 4) { bad.push(`a line from ${l.dataset.from} to ${l.dataset.to} has no spots`); continue; }
        // M x0,y0 … H xN: the last V (or the start) gives the end's y.
        const x0 = n[0], y0 = n[1], xN = n[n.length - 1], cmds = l.getAttribute('d').match(/[MHV]/g), yN = cmds.lastIndexOf('V') > 0 ? n[n.length - 2] : y0;
        const dir = from.half === 'R' ? -1 : 1, edge = x => dir > 0 ? x.r.r : x.r.l, inner = x => dir > 0 ? x.r.l : x.r.r, mid = x => (x.r.t + x.r.b) / 2;
        if (Math.abs(x0 - edge(from)) > 1 || Math.abs(y0 - mid(from)) > 1) bad.push(`the line from ${from.s} doesn’t start at its edge (${x0.toFixed(1)},${y0.toFixed(1)} vs ${edge(from).toFixed(1)},${mid(from).toFixed(1)})`);
        if (Math.abs(xN - inner(to)) > 1 || Math.abs(yN - mid(to)) > 1) bad.push(`the line from ${from.s} doesn’t meet spot ${to.s} (${xN.toFixed(1)},${yN.toFixed(1)} vs ${inner(to).toFixed(1)},${mid(to).toFixed(1)})`);
      }
      const tr = document.querySelector('.bracket-trophy'), T = tr && rel(tr.getBoundingClientRect());
      if (!T || T.t < -0.5 || T.l < -0.5 || T.r > R.width + 0.5) bad.push('the trophy is outside the stage');
      else for (const a of spots) if (over(T, a.r)) bad.push(`the trophy is over spot ${a.s}`);
      const fs = [...sizes].map(parseFloat);
      // As large as fits: the widest name fills most of its spot, or the names are as tall as the spots allow.
      const named = spots.filter(a => a.s !== 1 && a.e.textContent), cs = a => getComputedStyle(a.e), inner = a => a.e.clientWidth - parseFloat(cs(a).paddingLeft) - parseFloat(cs(a).paddingRight);
      const wide = named.length ? Math.max(...named.map(a => { const rg = document.createRange(); rg.selectNodeContents(a.e); return rg.getBoundingClientRect().width / inner(a); })) : 0;
      const tall = named.length ? parseFloat(cs(named[0]).fontSize) / named[0].e.clientHeight : 0;
      return { bad, sizes: [...sizes], fs: fs.length ? Math.min(...fs) : 0, spots: spots.length, lines: lines.length, w: R.width, h: R.height,
        fill: { wide: Math.round(wide * 100) / 100, tall: Math.round(tall * 100) / 100 }, big: wide >= 0.75 || tall >= 0.5 };
    }, p, ik);
    // The line under the stage: the status, the main button, and Undo (or Start over) apart, and inside the window.
    const footApart = (p = page, ik) => inFrame(() => {
      const W = innerWidth, bad = [], R = ['status', 'go', 'undo', 'round'].map(id => document.getElementById(id)).filter(e => !e.hidden && e.textContent).map(e => ({ id: e.id, r: e.getBoundingClientRect() }));
      for (const [i, a] of R.entries()) {
        if (a.r.left < -0.5 || a.r.right > W + 0.5 || a.r.bottom > innerHeight + 0.5) bad.push(a.id + ' outside');
        for (const b of R.slice(i + 1)) if (Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 0.5 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 0.5) bad.push(a.id + '/' + b.id);
      }
      return bad;
    }, p, ik);
    // How far a color stands out from another: the WCAG contrast ratio of two 'rgb(…)' colors.
    const contrast = (a, b) => {
      const lum = c => { const [r, g, b2] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b2; };
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return Math.round((x + 0.05) / (y + 0.05) * 100) / 100;
    };
    // The bracket's colors on the stage: a loser's name, the lines, the dashed spots, the grey trophy, and the halo around
    // a ready spot (drawn over the stage on a canvas, as it shows).
    const colors = (p = page, ik) => inFrame(() => {
      const stage = getComputedStyle(document.getElementById('stage')).backgroundColor, cs = sel => { const e = document.querySelector(sel); return e && getComputedStyle(e); };
      const over = c => { const g = document.createElement('canvas').getContext('2d'); g.fillStyle = stage; g.fillRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; };
      const out = cs('.bracket-spot.bracket-out'), ready = cs('.bracket-spot.bracket-ready'), m = ready && /^(.*\)) (-?[\d.]+px ?){4}$/.exec(ready.boxShadow);
      return { stage, out: out && out.color, outOpacity: out && out.opacity, line: cs('.bracket-lines path:not(.bracket-won)').stroke, dashed: (cs('.bracket-spot.bracket-empty') || {}).borderTopColor,
        trophy: cs('.bracket-trophy:not(.bracket-gold)') ? cs('.bracket-trophy').color : null, halo: m ? over(m[1]) : null, haloW: m ? parseFloat(ready.boxShadow.trim().split(' ').pop()) : 0 };
    }, p, ik);

    // ---- Bracket in the menu: after Groups, and then only Sound and Quick.
    await page.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf()) || {}).style === 'wheel');
    await page.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 1100, h: 700 }));
    const N24 = ['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivy', 'Jamal', 'Kai', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tariq', 'Uma', 'Vic', 'Wen', 'Zoe'];
    await np().locator('#list').fill(N24.join('\n')); await np().locator('#done').click(); await page.waitForTimeout(300);
    // A pick round first, so we can see Bracket leave it alone.
    await np().locator('#go').click(); await idle();
    const round = await saved(), roundStatus = await text('#status');
    await menu('style:bracket');
    ok((await conf()).style === 'bracket' && await eventually(async () => await items() === MENU_B()), `Bracket comes after Groups under Pick with, then Sound and Quick (${await items()})`);
    ok(await text('#status') === '24 names' && await text('#go') === 'Make a bracket' && await np().locator('#round').isHidden() && await np().locator('#undo').isHidden(),
      `“24 names”, “Make a bracket”, nothing beside it (${await text('#status')}, ${await text('#go')})`);
    let b = await board();
    ok(b.tiles.join() === N24.join() && !b.spots.length, `before the first draw every name waits on the stage as a tile (${b.tiles.length})`);
    await page.screenshot({ path: OUT + 'name-picker-bracket-before.png' });

    // ---- The draw: about 3 s, the names dealt into their spots with a pop each, and the zap with the last one.
    await inFrame(() => { window.__sounds.length = 0; window.__lands.length = 0; });
    let t0 = Date.now();
    let st = await drawNow();
    const drawn = st;
    const during = { go: await text('#go'), status: await text('#status'), undo: await np().locator('#undo').isHidden(), stack: await inFrame(() => !!document.querySelector('.bracket-stack')) };
    await idle();
    let took = Date.now() - t0;
    ok(st.bracket && sameList(st.bracket.seeds, N24) && Array.isArray(st.bracket.picks) && !st.bracket.picks.length && st.bracket.before === null && /^[a-z0-9]+-[a-z0-9]+$/.test(st.bracketId),
      `the bracket is saved before the show: every name once as a seed, no taps, nothing before it, and a bracketId (${st.bracketId})`);
    ok(during.go === 'Show now' && during.status === '24 names' && during.undo && during.stack, `during the show: “Show now”, the status as it was, the names dealt from a stack (${JSON.stringify(during)})`);
    ok(took > 2300 && took < 3900, `the show takes about 3 s (${took} ms)`);
    let snd = await inFrame(() => ({ sounds: window.__sounds.slice(), lands: window.__lands.slice(), notes: window.__notes || 0, audio: window.__audio || 0 }));
    let pops = snd.sounds.filter(s => s === 'pop').length;
    ok(snd.lands.length === 24 && pops === snd.lands.filter(l => l.pop != null).length && !unpopped(snd.lands) && snd.sounds.filter(s => s === 'zap').length === 1 && snd.sounds.slice(-2).join() === 'pop,zap'
      && !snd.sounds.includes('chime') && !snd.notes && !snd.audio,
      `a pop as each name lands, and the zap with the last pop, no chime (${pops} pops for ${snd.lands.length} names, ${unpopped(snd.lands)} missing; ends ${snd.sounds.slice(-2).join(', ')}), and with Sound off nothing plays`);
    b = await board();
    const r1 = b.spots.filter(x => x.round === 1), byes = b.spots.filter(x => x.bye);
    ok(r1.length === 16 && byes.length === 8 && b.spots.length === 47 && byes.every(x => x.round === 2 && x.name) && byes.filter(x => x.half === 'L').length === 4,
      `24 names: 16 play a first match, 8 byes wait in round 2, 4 in each half (${r1.length} first-round spots, ${byes.length} byes, ${b.spots.length} spots)`);
    ok(readyOf(b).length === 16 && r1.every(x => x.ready && x.tab === 0 && x.role === 'button' && x.label === `Move ${x.name} on`) && b.spots.filter(x => !x.ready).every(x => x.tab < 0),
      `the 8 first-round matches are ready: both spots outlined, each a button, “Move ${r1[0].name} on”; nothing else can be tabbed to`);
    const seedsOnStage = b.spots.filter(x => x.round === 1 || x.bye).map(x => x.name);
    ok(sameList(seedsOnStage, N24) && b.spots.filter(x => x.round > 1 && !x.bye).every(x => x.empty && !x.name) && b.trophy === false && !b.won.length,
      'every name in its first spot, every later spot dashed and empty, the trophy grey');
    ok(await text('#status') === '23 matches left' && await text('#go') === 'Shuffle again' && await np().locator('#undo').isHidden(), `then “23 matches left”, “Shuffle again”, and no Undo yet (${await text('#status')})`);
    ok(spotOf(b, 16).name === st.bracket.seeds[0] && spotOf(b, 16).bye && spotOf(b, 16).half === 'L' && spotOf(b, 2).half === 'L' && spotOf(b, 3).half === 'R',
      `seed 1 (${st.bracket.seeds[0]}) has a bye, in the left half`);
    await page.waitForTimeout(300);
    let fl = await fitLook();
    ok(!fl.bad.length && fl.sizes.length === 1, `every spot apart, every name in its spot and one size, the lines meeting their spots (${fl.sizes.join()}; ${fl.bad.slice(0, 3).join('; ') || 'ok'})`);
    await page.screenshot({ path: OUT + 'name-picker-bracket-24.png' });
    let c0 = await inFrame(() => window.__calls); await page.waitForTimeout(1200);
    ok(await inFrame(() => window.__calls) === c0 && !(await quiet()), 'nothing runs after the show: no timers, animation frames, or animations');

    // ---- Taps: only a spot in a ready match counts. The winner slides on, the other dims.
    const before = (await saved()).bracket;
    for (const s of [1, 2, byes[0].spot, b.spots.find(x => x.round === 2 && !x.bye).spot]) await tap(s);
    ok((await saved()).bracket.picks.length === 0 && await text('#status') === '23 matches left', 'a tap on the champion’s spot, a future spot, or a student waiting with a bye does nothing');
    await inFrame(() => { window.__sounds.length = 0; });
    let s0 = readyOf(b)[0], who = spotOf(b, s0).name, foe = spotOf(b, s0 ^ 1).name;
    await tap(s0);
    const sliding = await inFrame(() => ({ fly: !!document.querySelector('.bracket-fly'), running: document.getAnimations().length }));
    const stopped = await slid();
    b = await board();
    st = await saved();
    ok(JSON.stringify(st.bracket.picks) === JSON.stringify([s0]) && JSON.stringify(st.bracket.seeds) === JSON.stringify(before.seeds) && st.bracketId === drawn.bracketId,
      `a tap on ${who} saves it: picks [${st.bracket.picks}]`);
    ok(spotOf(b, s0 >> 1).name === who && spotOf(b, s0 ^ 1).out && !spotOf(b, s0).out && b.won.join() === String(s0) && !spotOf(b, s0).ready && !spotOf(b, s0 ^ 1).ready,
      `${who} moves on to spot ${s0 >> 1} with an accent line, and ${foe} dims`);
    ok(sliding.fly && sliding.running > 0 && stopped, `it slides there, and nothing is left running (${JSON.stringify(sliding)}, then ${JSON.stringify(await moving())})`);
    ok(await eventually(async () => await said() === `${who} moves on.`) && await text('#status') === '22 matches left' && await np().locator('#undo').isVisible() && await text('#undo') === 'Undo',
      `screen readers hear “${await said()}”; “22 matches left”, and Undo beside the button`);
    const foot = await inFrame(() => {
      const f = document.querySelector('.foot'), fr = f.getBoundingClientRect(), g = document.getElementById('go').getBoundingClientRect(), gap = parseFloat(getComputedStyle(f).columnGap) || 0;
      const u = document.getElementById('undo'), ur = u.getBoundingClientRect(), sr = document.getElementById('status').getBoundingClientRect();
      return { undo: Math.abs((ur.left + ur.right) / 2 - (g.right + gap + fr.right) / 2), status: Math.abs((sr.left + sr.right) / 2 - (fr.left + g.left - gap) / 2), arrow: !!u.querySelector('svg'), row: Math.abs((ur.top + ur.bottom) / 2 - (g.top + g.bottom) / 2) };
    });
    ok(foot.arrow && foot.undo <= 1.5 && foot.status <= 1.5 && foot.row <= 1.5, `Undo has its arrow and sits in the middle of its space, as Start over does, and the status in the middle of its own (${JSON.stringify(foot)})`);
    // In a narrow window, Undo and the status go on a row above the main button when they don't fit beside it.
    const narrow = [];
    for (const [w, h] of [[300, 680], [300, 520], [340, 600], [260, 320], [260, 700], [260, 200]]) {
      await page.evaluate(r => window.__board21.setRect('name-picker:1', r), { x: 40, y: 40, w, h }); await page.waitForTimeout(300);
      const bad = await footApart();
      if (bad.length) narrow.push(`${w}×${h}: ${bad.join(', ')}`);
    }
    await page.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 1100, h: 700 })); await page.waitForTimeout(300);
    ok(!narrow.length, `in narrow windows the status, the main button, and Undo stay apart and inside the window (${narrow.join(' | ') || '300×680, 300×520, 340×600, 260×320, 260×700, 260×200'})`);
    ok(await inFrame(() => window.__sounds.join()) === 'pop', `a pop as it lands (${await inFrame(() => window.__sounds.join())})`);
    await tap(s0); await tap(s0 ^ 1);
    ok((await saved()).bracket.picks.length === 1, 'a decided match doesn’t change with another tap');
    st = { bracket: await play(7) };
    ok(await text('#status') === '15 matches left' && st.bracket.picks.length === 8, `8 taps in: “15 matches left” (${await text('#status')})`);
    b = await board();
    ok(b.spots.filter(x => x.out).length === 8 && b.won.length === 8 && readyOf(b).length === 16 && readyOf(b).every(s => s < 32), `8 dimmed, 8 accent lines, and the 8 second-round matches ready (${readyOf(b).join(' ')})`);
    await page.screenshot({ path: OUT + 'name-picker-bracket-partway.png' });
    await play(14);
    ok(await text('#status') === '1 match left', `“1 match left” (${await text('#status')})`);
    b = await board();
    const fin = readyOf(b);
    ok(fin.join() === '2,3' && spotOf(b, 1).empty && b.trophy === false, `the final: spots 2 and 3 ready, the champion’s spot empty, the trophy grey (${fin})`);
    // play() goes on once a tap is saved, while the name may still be sliding. Its pop lands before the sounds are counted.
    await slid();
    await inFrame(() => { window.__sounds.length = 0; });
    const champ = spotOf(b, 2).name;
    await tap(2);
    const landing = await inFrame(() => { const c = document.querySelector('.bracket-spot[data-spot="1"]'), s = getComputedStyle(c);
      return { bg: s.backgroundColor, ink: s.color, dashed: s.borderTopStyle, trophy: document.querySelector('.bracket-trophy').classList.contains('bracket-gold'), fly: !!document.querySelector('.bracket-fly') }; });
    ok(landing.fly && landing.bg === 'rgba(0, 0, 0, 0)' && landing.ink === 'rgba(0, 0, 0, 0)' && landing.dashed === 'dashed' && !landing.trophy,
      `while the last name slides there, the champion’s spot stays dashed and empty, and the trophy grey (${JSON.stringify(landing)})`);
    await slid();
    b = await board();
    const gold = await inFrame(() => {
      const tok = n => { const t = document.createElement('i'); document.body.appendChild(t); t.style.color = `var(${n})`; const c = getComputedStyle(t).color; t.remove(); return c; };
      const c = document.querySelector('.bracket-spot[data-spot="1"]'), tr = document.querySelector('.bracket-trophy');
      return { bg: getComputedStyle(c).backgroundColor, ink: getComputedStyle(c).color, trophy: getComputedStyle(tr).color, win: tok('--np-win'), npInk: tok('--np-ink') };
    });
    ok(spotOf(b, 1).name === champ && spotOf(b, 1).champ && b.trophy === true && gold.bg === gold.win && gold.ink === gold.npInk && gold.trophy === gold.win,
      `the last tap fills the champion’s spot in gold, the name in --np-ink, and the trophy turns gold (${JSON.stringify(gold)})`);
    ok(await text('#status') === `${champ} wins` && await eventually(async () => await said() === `${champ} wins.`) && await text('#go') === 'Shuffle again' && await np().locator('#undo').isVisible(),
      `“${champ} wins”, screen readers hear “${champ} wins.”, and Undo stays`);
    ok(await inFrame(() => window.__sounds.join()) === 'pop,champion' && !readyOf(b).length, `a pop and the champion sound (${await inFrame(() => window.__sounds.join())}); nothing left to tap`);
    fl = await fitLook();
    ok(!fl.bad.length, `a finished bracket fits (${fl.bad.slice(0, 3).join('; ') || 'ok'})`);
    await page.screenshot({ path: OUT + 'name-picker-bracket-champion.png' });

    // ---- Undo: the taps one at a time, back to the draw; then the bracket before Shuffle again, with its taps.
    const full = (await saved()).bracket;
    await inFrame(() => { window.__sounds.length = 0; });
    await np().locator('#undo').click(); await page.waitForTimeout(450);
    b = await board();
    ok((await saved()).bracket.picks.length === 22 && spotOf(b, 1).empty && b.trophy === false && readyOf(b).join() === '2,3' && await text('#status') === '1 match left' && await quiet() === 0,
      `Undo takes back the last tap: the champion’s spot is empty again, the trophy grey, the final ready (${JSON.stringify({ picks: (await saved()).bracket.picks.length, champ: spotOf(b, 1), trophy: b.trophy, ready: readyOf(b), status: await text('#status'), running: await quiet() })})`);
    ok(!(await inFrame(() => window.__sounds.filter(x => x === 'zap' || x === 'champion' || x === 'chime').length)), `with no zap or champion sound (${await inFrame(() => window.__sounds.join()) || 'nothing'})`);
    for (let i = 0; i < 21; i++) await np().locator('#undo').click();
    await page.waitForTimeout(450);
    ok((await saved()).bracket.picks.length === 1 && await text('#status') === '22 matches left', `one at a time (${(await saved()).bracket.picks.length} taps left)`);
    await np().locator('#undo').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(450);
    b = await board();
    ok(!(await saved()).bracket.picks.length && await text('#status') === '23 matches left' && readyOf(b).length === 16 && !b.spots.some(x => x.out) && !b.won.length
      && await np().locator('#undo').isHidden() && await inFrame(() => document.activeElement.id) === 'go',
      'back to the draw: Undo hides (nothing before this bracket), and the keyboard is on the main button');
    // Three taps, then Shuffle again: Undo brings that bracket back with its three taps.
    const A = await play(3), idA = (await saved()).bracketId;
    await page.waitForTimeout(400);
    st = await drawNow(); await idle();
    ok(JSON.stringify(st.bracket.before) === JSON.stringify({ seeds: A.seeds, picks: A.picks, id: idA }) && st.bracket.picks.length === 0 && JSON.stringify(st.bracket.seeds) !== JSON.stringify(A.seeds)
      && await np().locator('#undo').isVisible() && await text('#status') === '23 matches left',
      'Shuffle again keeps the bracket it replaced as before, with its taps and its bracketId; Undo shows, as a bracket came before');
    await play(1);
    await np().locator('#undo').click(); await page.waitForTimeout(400);
    ok((await saved()).bracket.picks.length === 0 && JSON.stringify((await saved()).bracket.seeds) === JSON.stringify(st.bracket.seeds), 'Undo takes back the new bracket’s tap');
    await np().locator('#undo').click(); await page.waitForTimeout(400);
    let back = (await saved()).bracket;
    b = await board();
    ok(JSON.stringify(back.seeds) === JSON.stringify(A.seeds) && JSON.stringify(back.picks) === JSON.stringify(A.picks) && back.before === null && await text('#status') === '20 matches left'
      && b.won.length === 3 && await np().locator('#undo').isVisible(), 'then brings back the bracket before Shuffle again, with its 3 taps, and none before it');
    for (let i = 0; i < 3; i++) await np().locator('#undo').click();
    await page.waitForTimeout(400);
    ok(!(await saved()).bracket.picks.length && await np().locator('#undo').isHidden(), 'Undo takes those back too, then hides');

    // ---- Keyboard: Tab reaches only ready spots, left half top to bottom, then the right half. Enter moves the name on, and
    // the keyboard goes on to the next ready spot; with none left, to the main button.
    const order = () => inFrame(() => {
      const all = [...document.querySelectorAll('.bracket-spot')].map(e => { const r = e.getBoundingClientRect(); return { s: +e.dataset.spot, half: e.dataset.half, y: r.top + r.height / 2, x: r.left, ready: e.classList.contains('bracket-ready') }; });
      const rank = h => h === 'L' ? 0 : h === 'C' ? 2 : 1;
      all.sort((a, b) => rank(a.half) - rank(b.half) || a.y - b.y || a.x - b.x);
      return { all: all.map(a => a.s), ready: all.filter(a => a.ready).map(a => a.s),
        tabbable: [...document.querySelectorAll('#stage [tabindex], #stage button, #stage a')].filter(e => e.tabIndex >= 0).map(e => +e.dataset.spot) };
    });
    let o = await order();
    await np().locator(`.bracket-spot[data-spot="${o.ready[0]}"]`).focus();
    const tabbed = [];
    for (let i = 0; i < 40; i++) {
      const a = await inFrame(() => document.activeElement.dataset.spot ? +document.activeElement.dataset.spot : document.activeElement.id);
      if (!Number.isInteger(a)) { tabbed.push(a); break; }
      tabbed.push(a); await page.keyboard.press('Tab');
    }
    ok(JSON.stringify(tabbed.slice(0, -1)) === JSON.stringify(o.ready) && tabbed[tabbed.length - 1] === 'go' && sameList(o.tabbable, o.ready),
      `Tab goes through the ready spots in reading order, then on to the main button (${tabbed.join(' ')})`);
    await np().locator(`.bracket-spot[data-spot="${o.ready[2]}"]`).focus();
    who = (await board()).spots.find(x => x.spot === o.ready[2]).name;
    await page.keyboard.press('Enter'); await page.waitForTimeout(450);
    let o2 = await order(), at = o2.all.indexOf(o.ready[2]);
    let next = o2.ready.find(s => o2.all.indexOf(s) > at) || o2.ready[0];
    ok((await saved()).bracket.picks.join() === String(o.ready[2]) && await inFrame(() => +document.activeElement.dataset.spot) === next && await eventually(async () => await said() === `${who} moves on.`),
      `Enter moves ${who} on; the keyboard goes on to the next ready spot (${next}); screen readers hear “${await said()}”`);
    await page.keyboard.press(' '); await page.waitForTimeout(450);
    ok((await saved()).bracket.picks.length === 2, 'Space works too');
    // To the final with the mouse, then the last tap from the keyboard.
    await play(20);
    await np().locator('.bracket-spot[data-spot="3"]').focus();
    const kchamp = (await board()).spots.find(x => x.spot === 3).name;
    await page.keyboard.press('Enter'); await page.waitForTimeout(450);
    ok(await inFrame(() => document.activeElement.id) === 'go' && await eventually(async () => await said() === `${kchamp} wins.`),
      `the last tap from the keyboard: “${kchamp} wins.”, and the keyboard is on the main button`);
    await page.screenshot({ path: OUT + 'name-picker-bracket-keyboard.png' });

    // ---- A tap on a spot counts while the window can be dragged from its content, and a drag from a spot moves the window.
    st = await drawNow(); await idle();
    const spotAt = s => page.evaluate(s => { const f = document.querySelector('.win[data-ikey="name-picker:1"] iframe'), r = f.getBoundingClientRect(), k = r.width / f.clientWidth;
      const e = f.contentDocument.querySelector(`.bracket-spot[data-spot="${s}"]`).getBoundingClientRect(); return { x: r.left + (e.left + e.width / 2) * k, y: r.top + (e.top + e.height / 2) * k }; }, s);
    const winAt = () => page.evaluate(() => { const r = document.querySelector('.win[data-ikey="name-picker:1"]').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    let r0 = readyOf(await board()), w0 = await winAt(), pt = await spotAt(r0[0]);
    await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(450);
    ok((await saved()).bracket.picks.join() === String(r0[0]) && JSON.stringify(await winAt()) === JSON.stringify(w0), 'a plain tap on a spot moves the name on, and the window stays put');
    r0 = readyOf(await board()); pt = await spotAt(r0[0]);
    await page.mouse.move(pt.x, pt.y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(pt.x + 6 * i, pt.y + 3 * i); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(400);
    const w1 = await winAt();
    ok((await saved()).bracket.picks.length === 1 && Math.abs(w1.x - w0.x - 60) <= 14 && Math.abs(w1.y - w0.y - 30) <= 14, `a drag that starts on a spot moves the window instead (moved ${Math.round(w1.x - w0.x)}, ${Math.round(w1.y - w0.y)})`);
    await page.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 1100, h: 700 })); await page.waitForTimeout(400);

    // ---- A tap skips the show; so does Show now. Nothing it added is left. Quick halves it. Sound on plays it.
    // While the names deal out, no spot can be tabbed to.
    await np().locator('#go').click(); await page.waitForTimeout(300);
    const keys = await inFrame(() => { const a = document.activeElement, n = [...document.querySelectorAll('.bracket-spot')].filter(e => { e.focus(); return document.activeElement === e; }).length; a.focus(); return n; });
    await page.waitForTimeout(400);
    ok(keys === 0 && await showing(), `during the draw no spot takes the keyboard (${keys})`);
    await np().locator('#stage').click(); await page.waitForTimeout(150);
    st = await saved(); b = await board();
    ok(!(await showing()) && !st.bracket.picks.length && b.spots.filter(x => x.round === 1 || x.bye).every(x => x.name) && sameList(b.spots.filter(x => x.round === 1 || x.bye).map(x => x.name), st.bracket.seeds)
      && await inFrame(() => !document.querySelector('.bracket-fly, .bracket-stack, .bracket-ghost') && [...document.querySelectorAll('.bracket-spot')].every(e => getComputedStyle(e).opacity === '1' || e.classList.contains('bracket-out'))) && !(await quiet()),
      'a tap on the stage skips the show: every name in its spot, nothing of the show left, nothing running');
    await np().locator('#go').click(); await page.waitForTimeout(700);
    ok(await text('#go') === 'Show now', 'the button reads “Show now” during the show');
    await np().locator('#go').click(); await page.waitForTimeout(150);
    ok(!(await showing()) && await inFrame(() => !document.querySelector('.bracket-fly, .bracket-stack, .bracket-ghost')) && !(await quiet()) && await text('#go') === 'Shuffle again', 'and Show now skips it too');
    await menu('quick');
    ok(await items() === MENU_B({ quick: true }), 'Quick is ticked');
    t0 = Date.now(); await drawNow(); await idle(); took = Date.now() - t0;
    ok(took > 1000 && took < 2300, `with Quick the show takes about 1.5 s (${took} ms)`);
    r0 = readyOf(await board());
    await tap(r0[0]); await page.waitForTimeout(400);
    ok(!(await quiet()) && await inFrame(() => !document.querySelector('.bracket-fly')), 'and a tap’s slide, and its pop, are done within 0.4 s');
    await menu('quick');
    // Ticking Sound plays a sample: in Bracket, the zap.
    await played();
    await menu('sound');
    let sample = [];
    ok(await eventually(async () => (sample = sample.concat(await played())).length > 0) && sample.join() === 'zap', `ticking Sound plays the zap as a sample (${sample.join()})`);
    const n0 = await inFrame(() => window.__notes || 0);
    await inFrame(() => { window.__sounds.length = 0; window.__lands.length = 0; });
    await np().locator('#go').click(); await idle();
    snd = await inFrame(() => ({ sounds: window.__sounds.slice(), lands: window.__lands.slice(), notes: window.__notes || 0, audio: window.__audio || 0 }));
    pops = snd.sounds.filter(s => s === 'pop').length;
    ok(snd.audio >= 1 && snd.lands.length === 24 && pops === snd.lands.filter(l => l.pop != null).length && !unpopped(snd.lands) && snd.notes - n0 >= pops + 3 && snd.sounds.filter(s => s === 'zap').length === 1,
      `with Sound on the pops and the zap play (${snd.notes - n0} notes, ${pops} pops for ${snd.lands.length} names, ${unpopped(snd.lands)} missing)`);
    await menu('sound');

    // ---- Switching to the wheel and back keeps the bracket and its taps; the pick round is as it was.
    await play(2);
    const sw = (await saved()).bracket;
    await menu('style:wheel');
    ok(await text('#status') === roundStatus && JSON.stringify((await saved()).picked) === JSON.stringify(round.picked) && JSON.stringify((await saved()).bracket) === JSON.stringify(sw),
      `Bracket → Wheel: the pick round as it was (${roundStatus}), and the bracket kept`);
    await menu('style:bracket');
    ok(JSON.stringify((await saved()).bracket) === JSON.stringify(sw) && (await board()).spots.length === 47 && (await board()).won.length === 2 && await text('#status') === '21 matches left',
      'and back: the same bracket, with its taps');

    // ---- Editing names keeps the bracket as drawn; Shuffle again uses the new list. Fewer than 2 names: Add names.
    const kept = (await saved()).bracket, N8 = N24.slice(0, 8);
    await setNames(N8);
    ok(JSON.stringify((await saved()).bracket) === JSON.stringify(kept) && await text('#status') === '21 matches left' && (await board()).spots.length === 47 && await text('#go') === 'Shuffle again',
      'editing the names keeps the bracket as drawn, with its taps');
    st = await drawNow(); await idle();
    ok(sameList(st.bracket.seeds, N8) && (await board()).spots.length === 15 && await text('#status') === '7 matches left', `Shuffle again uses the new list (${st.bracket.seeds.join(', ')})`);
    await setNames(N24.concat(N24.map(n => n + ' B'), N24.slice(0, 17).map(n => n + ' C')));
    ok((await board()).spots.length === 15 && await text('#go') === 'Edit names' && await text('#status') === '65 names', `65 names: the bracket stays, “${await text('#status')}”, and “${await text('#go')}”`);
    await setNames(['Ava']);
    ok((await board()).spots.length === 15 && await text('#go') === 'Add names' && await text('#status') === '', `one name left: the bracket stays, no status, and the button reads “Add names” (${await text('#status')})`);
    await np().locator('#go').click(); await page.waitForTimeout(200);
    ok(await np().locator('#edit').evaluate(e => e.classList.contains('on')), 'which opens the names list');
    await np().locator('#list').fill(N24.join('\n')); await np().locator('#done').click(); await page.waitForTimeout(300);

    // ---- Saved, reloaded, and synced.
    st = await drawNow(); await idle(); await play(3);
    st = await saved();
    await page.reload(); await boardUp(page);
    ok(await eventually(async () => (await board().catch(() => ({ spots: [] }))).spots.length === 47) && !(await showing()) && await text('#status') === '20 matches left' && (await board()).won.length === 3,
      'after a reload the bracket and its taps are there, with no show');
    const page2 = await ctx.newPage(); watch(page2, 'tab 2');
    await page2.goto(BASE); await boardUp(page2); await freeBoard(page2);
    ok(await eventually(async () => (await board(page2)).won.join() === (await board()).won.join() && await text('#status', page2) === '20 matches left'), 'a second tab shows the same bracket');
    await play(1);
    ok(await eventually(async () => (await board(page2)).won.length === 4 && await text('#status', page2) === '19 matches left') && !(await showing(page2)), 'a tap in one tab shows in the other, with no show');
    await np(page2).locator('#undo').click();
    ok(await eventually(async () => (await board()).won.length === 3 && await text('#status') === '20 matches left'), 'and Undo in the other shows here');
    const nb = await drawNow();
    ok(await eventually(() => showing(page2), 2000), 'a new draw in one tab plays its show in the other');
    await idle(); await idle(page2);
    ok(JSON.stringify((await board(page2)).spots.map(x => x.name)) === JSON.stringify((await board()).spots.map(x => x.name)) && (await saved(page2)).bracketId === nb.bracketId, 'and both end on the same bracket');
    // Undo brings back the bracket before with its own bracketId: no draw show in the other tab, even one that missed
    // the Shuffle again (a window drag there holds changes until it ends).
    const shows = () => inFrame(() => window.__shows, page2);
    await inFrame(() => { window.__shows = 0; new MutationObserver(() => { if (document.body.classList.contains('showing') && !window.__on) window.__shows++; window.__on = document.body.classList.contains('showing'); }).observe(document.body, { attributes: true, attributeFilter: ['class'] }); }, page2);
    const prevId = nb.bracket.before && nb.bracket.before.id;
    await np().locator('#undo').click(); await page.waitForTimeout(800);
    ok(prevId && (await saved()).bracketId === prevId && await eventually(async () => (await board(page2)).won.length === 3) && await shows() === 0,
      `Undo brings back the bracket before with its own bracketId (${prevId}), and the other tab shows it with no draw show`);
    const grab = await page2.locator('.win[data-ikey="name-picker:1"] .win-title').boundingBox(), from = { x: grab.x + grab.width - 30, y: grab.y + grab.height / 2 };
    await page2.mouse.move(from.x, from.y); await page2.mouse.down();
    for (let i = 1; i <= 5; i++) { await page2.mouse.move(from.x + 4 * i, from.y); await page2.waitForTimeout(16); }
    await drawNow(); await np().locator('#go').click(); await idle();
    await np().locator('#undo').click(); await page.waitForTimeout(400);
    await page2.mouse.up(); await page2.waitForTimeout(800);
    ok(await shows() === 0 && (await saved(page2)).bracketId === prevId && (await board(page2)).won.length === 3 && !(await showing(page2)),
      `a tab that missed the Shuffle again sees its bracket come back with no draw show (${await shows()} shows)`);
    // The keyboard there stays in the picker when Undo here takes away its Undo, or a new draw here takes away its spot.
    await np(page2).locator('#undo').focus();
    for (let i = 0; i < 3; i++) await np().locator('#undo').click();
    ok(await eventually(async () => await np(page2).locator('#undo').isHidden()) && await eventually(async () => await inFrame(() => document.activeElement.id, page2) === 'go'),
      `when Undo here hides Undo there, the keyboard there goes to the main button (${await inFrame(() => document.activeElement.id || document.activeElement.tagName, page2)})`);
    await np(page2).locator(`.bracket-spot[data-spot="${readyOf(await board(page2))[0]}"]`).focus();
    await drawNow(); await idle(); await idle(page2);
    ok(await inFrame(() => document.activeElement.id, page2) === 'go', `when a new draw here takes away its spot, the keyboard there goes to the main button (${await inFrame(() => document.activeElement.id || document.activeElement.tagName, page2)})`);
    await page2.close();

    // ---- A template keeps Bracket, and no names or bracket.
    await page.click('.picker-btn.right'); await page.click('[data-ctl="export"]'); await page.waitForTimeout(200);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal .btn[data-i="1"]')]);
    await dl.saveAs(OUT + 'name-picker-bracket-template.21board');
    const tpl = JSON.parse(fs.readFileSync(OUT + 'name-picker-bracket-template.21board', 'utf8')), tp = tpl.instances.find(i => i.widgetId === 'name-picker');
    ok(tpl.kind === 'template' && tp && tp.data === null && tp.config.style === 'bracket' && !N24.some(n => JSON.stringify(tpl).includes('"' + n + '"')),
      `a template keeps Bracket, and no names or bracket (${JSON.stringify(tp && tp.config)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));

    // ---- Messages: fewer than 2 names, and more than 64.
    errors.length = 0;
    const msg = async ik => ({ empty: await np(page, ik).locator('#empty').isVisible() ? await text('#empty', page, ik) : '', go: await text('#go', page, ik), status: await text('#status', page, ik) });
    const ikM = await page.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(page, ikM)) || {}).style === 'wheel');
    await page.evaluate(ik => window.__board21.setRect(ik, { x: 300, y: 60, w: 540, h: 400 }), ikM);
    await np(page, ikM).locator('#list').fill('Ava'); await np(page, ikM).locator('#done').click(); await page.waitForTimeout(300);
    await menu('style:bracket', page, ikM);
    let m = await msg(ikM);
    ok(m.empty === 'A bracket needs 2 names.' && m.go === 'Add names' && m.status === '', `one name: “${m.empty}”, “${m.go}”`);
    await page.screenshot({ path: OUT + 'name-picker-bracket-needs-2.png' });
    await np(page, ikM).locator('#go').click(); await page.waitForTimeout(200);
    ok(await np(page, ikM).locator('#edit').evaluate(e => e.classList.contains('on')), '“Add names” opens the names list');
    const N65 = Array.from({ length: 65 }, (_, i) => 'Student ' + (i + 1));
    await np(page, ikM).locator('#list').fill(N65.join('\n')); await np(page, ikM).locator('#done').click(); await page.waitForTimeout(300);
    m = await msg(ikM);
    ok(m.empty === 'A bracket holds up to 64 names.' && m.go === 'Edit names' && m.status === '65 names', `65 names: “${m.empty}”, “${m.status}”, “${m.go}”`);
    await page.screenshot({ path: OUT + 'name-picker-bracket-65.png' });
    await np(page, ikM).locator('#go').click(); await page.waitForTimeout(200);
    ok(await np(page, ikM).locator('#edit').evaluate(e => e.classList.contains('on')), '“Edit names” opens the names list');
    await np(page, ikM).locator('#list').fill(N65.slice(0, 64).join('\n')); await np(page, ikM).locator('#done').click(); await page.waitForTimeout(300);
    m = await msg(ikM);
    ok(!m.empty && m.go === 'Make a bracket' && m.status === '64 names', `64 names: “${m.status}”, “${m.go}”`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- Every size from 2 to 64 names (reduce motion: each draw is on screen at once): P, the byes, the first-round matches,
    // and N − 1 matches in all. No bye meets a bye, and the byes split evenly between the halves and the quarters.
    errors.length = 0;
    const rctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
    await rctx.addInitScript(SPY);
    const rp = await rctx.newPage(); watch(rp, 'reduce motion');
    await rp.goto(BASE); await boardUp(rp); await freeBoard(rp);
    await rp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(rp)) || {}).style === 'wheel');
    await rp.evaluate(() => window.__board21.setRect('name-picker:1', { x: 20, y: 20, w: 1500, h: 840 }));
    await np(rp).locator('#list').fill(N24.slice(0, 6).join('\n')); await np(rp).locator('#done').click(); await rp.waitForTimeout(300);
    await menu('style:bracket', rp); await played(rp); await menu('sound', rp);
    await eventually(async () => (await played(rp)).length > 0);   // (the sample)
    // Reduce motion: the bracket fades in, nothing moves, and the zap still plays.
    await inFrame(() => { window.__sounds.length = 0; window.__moved = []; const a = Element.prototype.animate; Element.prototype.animate = function (k) { window.__moved.push(JSON.stringify(k)); return a.apply(this, arguments); }; }, rp);
    const n1 = await inFrame(() => window.__notes || 0, rp);
    const rb = await drawNow(rp);
    const look = await inFrame(() => ({ fade: !!document.querySelector('.bracket-fade'), fly: document.querySelectorAll('.bracket-fly, .bracket-stack').length,
      moved: window.__moved.filter(k => /transform|left|top|translate/.test(k)).length,
      css: document.getAnimations().filter(a => a.effect && a.effect.getKeyframes().some(k => 'transform' in k || 'left' in k || 'top' in k || 'translate' in k)).length }), rp);
    ok(!(await showing(rp)) && rb.bracket.seeds.length === 6 && look.fade && !look.fly && !look.moved && !look.css, `with reduce motion the bracket fades in, with nothing moving (${JSON.stringify(look)})`);
    let calmSounds = [];
    ok(await eventually(async () => (calmSounds = calmSounds.concat(await played(rp))).length > 0) && calmSounds.join() === 'zap' && await eventually(async () => await inFrame(() => window.__notes || 0, rp) - n1 >= 3)
      && !(await inFrame(() => window.__sounds.includes('pop'), rp)), `and the zap still plays when Sound is on (${calmSounds.join()})`);
    await inFrame(() => { window.__moved.length = 0; }, rp);
    const rr = readyOf(await board(rp));
    await tap(rr[0], rp); await rp.waitForTimeout(100);
    ok((await saved(rp)).bracket.picks.length === 1 && !(await inFrame(() => window.__moved.filter(k => /transform|left|top|translate/.test(k)).length, rp)) && !(await inFrame(() => !!document.querySelector('.bracket-fly'), rp)),
      'a tap with reduce motion moves the name on with nothing sliding');
    // A double tap on Shuffle again with reduce motion (no show to skip) draws once, so Undo still brings back the bracket
    // the class was playing.
    const played4 = await play(3, rp);
    await inFrame(() => { window.__ids = []; const s = Board21.save; window.__save = s; Board21.save = function (d) { if (d && d.bracketId && window.__ids[window.__ids.length - 1] !== d.bracketId) window.__ids.push(d.bracketId); return s.apply(this, arguments); }; }, rp);
    await np(rp).locator('#go').dblclick(); await rp.waitForTimeout(700);
    const draws2 = await inFrame(() => { Board21.save = window.__save; return window.__ids.slice(); }, rp);
    await np(rp).locator('#undo').click(); await rp.waitForTimeout(300);
    const back2 = (await saved(rp)).bracket;
    ok(draws2.length === 1 && JSON.stringify(back2.seeds) === JSON.stringify(played4.seeds) && JSON.stringify(back2.picks) === JSON.stringify(played4.picks) && played4.picks.length === 4,
      `a double tap on Shuffle again with reduce motion draws once (${draws2.length}), and Undo brings back the bracket with its 4 taps (${back2.picks.length})`);
    await menu('sound', rp);
    const sizes = await inFrame(() => {
      const out = [], list = document.getElementById('list');
      for (let n = 2; n <= 64; n++) {
        list.value = Array.from({ length: n }, (_, i) => 'S' + (i + 1)).join('\n'); list.oninput();
        drewAt = -1e9; document.getElementById('go').click();   // (each a tap of its own, not a double tap)
        const spots = [...document.querySelectorAll('.bracket-spot')].map(e => ({ s: +e.dataset.spot, round: +e.dataset.round, bye: e.hasAttribute('data-bye'), name: e.textContent }));
        const kids = s => spots.filter(x => x.s >> 1 === s && x.round === 1);
        const mid = s => { const r = document.querySelector(`.bracket-spot[data-spot="${s}"]`).getBoundingClientRect(); return r.top + r.height / 2; };
        out.push({ n, jog: Math.abs(mid(2) - mid(3)), status: document.getElementById('status').textContent, total: spots.length, r1: spots.filter(x => x.round === 1).length,
          byes: spots.filter(x => x.bye).map(x => x.s), r2: spots.filter(x => x.round === 2).map(x => ({ s: x.s, name: x.name, bye: x.bye, kids: kids(x.s).length })),
          seeds: spots.filter(x => x.round === 1 || x.bye).map(x => x.name).sort().join() === Array.from({ length: n }, (_, i) => 'S' + (i + 1)).sort().join() });
      }
      return out;
    }, rp);
    const badSize = [];
    for (const z of sizes) {
      const P = pow2(z.n), byeN = P - z.n, first = z.n - P / 2;
      const depth = s => Math.floor(Math.log2(s)), part = (s, d) => s >> (depth(s) - d);
      const halves = [2, 3].map(h => z.byes.filter(s => part(s, 1) === h).length), quarters = P >= 8 ? [4, 5, 6, 7].map(q => z.byes.filter(s => part(s, 2) === q).length) : [0];
      const problems = [];
      if (z.status !== left(z.n - 1)) problems.push(`status “${z.status}”`);
      if (z.total !== 2 * z.n - 1) problems.push(`${z.total} spots`);
      if (z.r1 !== 2 * first) problems.push(`${z.r1 / 2} first-round matches, not ${first}`);
      if (z.byes.length !== byeN) problems.push(`${z.byes.length} byes, not ${byeN}`);
      if (P > 2 && z.r2.some(x => !x.bye && x.kids !== 2)) problems.push('a bye meets a bye');
      if (Math.max(...halves) - Math.min(...halves) > 1 || Math.max(...quarters) - Math.min(...quarters) > 1) problems.push(`byes split ${halves} / ${quarters}`);
      if (!z.seeds) problems.push('not every name once');
      if (z.jog > 0.5) problems.push(`spots 2 and 3 ${z.jog.toFixed(1)} px apart in height`);
      if (problems.length) badSize.push(`${z.n}: ${problems.join(', ')}`);
    }
    const t6 = sizes.find(z => z.n === 6), t24 = sizes.find(z => z.n === 24), t32 = sizes.find(z => z.n === 32);
    ok(sizes.length === 63 && !badSize.length, `2 to 64 names: P, the byes, N − P/2 first-round matches, and N − 1 in all; no bye meets a bye; byes split evenly; the lines into the champion’s spot run straight across (${badSize.slice(0, 4).join(' | ') || 'all 63 sizes'})`);
    ok(t6.byes.length === 2 && t6.r1 === 4 && t6.status === '5 matches left' && t24.byes.length === 8 && t24.r1 === 16 && t24.status === '23 matches left' && !t32.byes.length && t32.r1 === 32,
      'the table: 6 → 8, 2 byes, 2 first matches, 5 in all; 24 → 32, 8 byes, 8 first, 23 in all; 32 → no byes');
    // Fair: over 600 draws of 6 names, each name gets a bye about a third of the time (seeds 1 and 2 get the byes).
    await np(rp).locator('#list').evaluate(l => { l.value = 'Ava\nBen\nCarlos\nDana\nEli\nFatima'; l.oninput(); });
    const draws = await inFrame(() => {
      const out = [], save = Board21.save;
      Board21.save = function (d) { if (d && d.bracket) out.push(d.bracket.seeds.slice()); return save.apply(this, arguments); };
      for (let i = 0; i < 600; i++) { drewAt = -1e9; document.getElementById('go').click(); }   // (each a tap of its own, not a double tap)
      Board21.save = save;
      return out;
    }, rp);
    const N6 = ['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima'], bye = Object.fromEntries(N6.map(n => [n, 0])), top = Object.fromEntries(N6.map(n => [n, 0]));
    for (const d of draws) { bye[d[0]]++; bye[d[1]]++; top[d[0]]++; }
    const shares = N6.map(n => Math.round(bye[n] / draws.length * 100)), tops = N6.map(n => Math.round(top[n] / draws.length * 100));
    ok(draws.length === 600 && draws.every(d => sameList(d, N6)), `600 draws, each with all 6 names once (${draws.length})`);
    ok(shares.every(s => s >= 25 && s <= 42) && tops.every(s => s >= 10 && s <= 24), `each name gets a bye about a third of the time (${N6.map((n, i) => n + ' ' + shares[i] + '%').join(', ')}), and is seed 1 about a sixth (${tops.join('%, ')}%)`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await rctx.close();

    // ---- A board from a file: brackets are checked when read. 65 seeds, seeds that aren't names, taps that aren't legal, a
    // before with its own before, huge lists, and a bracket that isn't one are cleaned up, quickly and without errors.
    errors.length = 0;
    const ictx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const ip = await ictx.newPage(); watch(ip, 'import');
    await ip.goto(BASE); await boardUp(ip); await freeBoard(ip);
    const S = n => Array.from({ length: n }, (_, i) => 'S' + (i + 1));
    const win = (instance, data) => ({ widgetId: 'name-picker', instance, open: true, z: instance, rect: { x: 10 + ((instance - 1) % 4) * 390, y: 10 + Math.floor((instance - 1) / 4) * 440, w: 380, h: 420 }, data, config: { style: 'bracket' } });
    const file = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Brackets' }, instances: [
      win(1, { names: S(8), bracket: { seeds: S(65), picks: [], before: null }, bracketId: 'mwp2g7b7-pg6utj' }),
      win(2, { names: S(8), bracket: { seeds: ['Ava', 7, ' Ben ', null, '', 'Cy', {}, ['Dee']], picks: [], before: null }, bracketId: 'mwp2g7b7-pg6utk' }),
      win(3, { names: S(8), bracket: { seeds: ['A', 'B', 'C', 'D'], picks: [5, 5, 6, 3, 'x'], before: null }, bracketId: 'mwp2g7b7-pg6utl' }),
      win(4, { names: S(8), bracket: { seeds: ['A', 'B'], picks: [3], before: { seeds: ['C', 'D', 'E'], picks: [7, 'no'], before: { seeds: ['F', 'G'], picks: [] } } }, bracketId: 'mwp2g7b7-pg6utm' }),
      win(5, { names: ['Ava', 'Ben'], bracket: { seeds: Array.from({ length: 100000 }, (_, i) => 'S' + i), picks: [] }, bracketId: 'mwp2g7b7-pg6utn' }),
      win(6, { names: ['Ava', 'Ben'], bracket: { seeds: ['A', 'B'], picks: Array(200000).fill(3), before: 'x' }, bracketId: 5 }),
      win(7, { names: ['Ava', 'Ben'], bracket: 'A,B', bracketId: '<b>x</b>' }),
      win(8, { names: ['Ava', 'Ben'], bracket: { seeds: ['A', 'B', 'C'], picks: [-1, 2.5, 4] }, bracketId: 'mwp2g7b7-pg6uto' })
    ] };
    fs.writeFileSync(OUT + 'name-picker-brackets.21board', JSON.stringify(file));
    const tImport = Date.now();
    await ip.setInputFiles('#import-input', OUT + 'name-picker-brackets.21board'); await ip.waitForTimeout(300);
    await ip.click('#modal .btn:has-text("Replace this page")');
    const IK = n => 'name-picker:' + n;
    ok(await eventually(async () => (await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(n => items(ip, IK(n)).catch(() => '')))).every(Boolean), 15000), 'the board from the file opens with its eight pickers');
    await ip.waitForTimeout(800);
    const names = async n => (await board(ip, IK(n))).spots.filter(x => x.name).sort((a, c) => a.spot - c.spot).map(x => x.spot + ':' + x.name).join(' ');
    ok(!(await board(ip, IK(1))).spots.length && (await board(ip, IK(1))).tiles.length === 8 && await text('#go', ip, IK(1)) === 'Make a bracket', '65 seeds: no bracket, the names wait as tiles');
    ok(await names(2) === '2:Ava 6:Ben 7:Cy' && await text('#status', ip, IK(2)) === '2 matches left', `seeds that aren’t names are dropped, the rest trimmed (${await names(2)})`);
    ok(await names(3) === '2:D 4:A 5:D 6:B 7:C' && await text('#status', ip, IK(3)) === '2 matches left', `taps replay while each is legal, and the rest are dropped (${await names(3)})`);
    ok(await text('#status', ip, IK(4)) === 'B wins' && await np(ip, IK(4)).locator('#undo').isVisible(), `a bracket with a before: “${await text('#status', ip, IK(4))}”, and Undo`);
    ok(!(await board(ip, IK(5))).spots.length && (await board(ip, IK(5))).tiles.join() === 'Ava,Ben', 'a huge list of seeds: no bracket');
    ok(await text('#status', ip, IK(6)) === 'B wins' && await np(ip, IK(6)).locator('#undo').isVisible() && Date.now() - tImport < 15000, `a huge list of taps is cut short, quickly (${Date.now() - tImport} ms)`);
    ok(!(await board(ip, IK(7))).spots.length && await text('#go', ip, IK(7)) === 'Make a bracket', 'a bracket that isn’t one is dropped');
    ok(await text('#status', ip, IK(8)) === '2 matches left', 'taps that aren’t spots are dropped');
    // The before's own before is gone: Undo goes back to the draw, then to C, D, E (without its illegal tap), and then hides.
    await ip.evaluate(ik => window.__board21.focusWin(ik), IK(4));
    await np(ip, IK(4)).locator('#undo').click(); await ip.waitForTimeout(300);
    await np(ip, IK(4)).locator('#undo').click(); await ip.waitForTimeout(400);
    const st4 = await ip.evaluate(ik => window.__board21.state.data.get(ik), IK(4));
    ok(JSON.stringify(st4.bracket) === JSON.stringify({ seeds: ['C', 'D', 'E'], picks: [7], before: null }) && await text('#status', ip, IK(4)) === '1 match left',
      `Undo twice: the draw, then the bracket before it with its legal tap, and no before of its own (${JSON.stringify(st4.bracket)})`);
    await np(ip, IK(4)).locator('#undo').click(); await ip.waitForTimeout(300);
    ok(await np(ip, IK(4)).locator('#undo').isHidden(), 'then Undo hides');
    const cost = await inFrame(() => {
      const seeds = Array.from({ length: 64 }, (_, i) => 'S' + i);
      const d = { names: seeds, bracket: { seeds, picks: Array(1000000).fill(64), before: { seeds, picks: Array(1000000).fill('x'), before: { seeds, picks: [] } } }, bracketId: 'mwp2g7b7-pg6utj' };
      const t = performance.now(), s = readState(d);
      return { ms: Math.round(performance.now() - t), seeds: s.bracket.seeds.length, picks: s.bracket.picks.length, before: s.bracket.before && s.bracket.before.picks.length, deeper: s.bracket.before && s.bracket.before.before };
    }, ip, IK(1));
    ok(cost.ms < 200 && cost.seeds === 64 && cost.picks === 1 && cost.before === 0 && cost.deeper === undefined, `64 seeds with a million taps read in ${cost.ms} ms (${JSON.stringify(cost)})`);
    const clean = await drawNow(ip, IK(3)); await idle(ip, IK(3));
    ok(sameList(clean.bracket.seeds, S(8)) && JSON.stringify(clean.bracket.before) === JSON.stringify({ seeds: ['A', 'B', 'C', 'D'], picks: [5], id: 'mwp2g7b7-pg6utl' }) && /^[a-z0-9]+-[a-z0-9]+$/.test(clean.bracketId),
      `the next draw is saved clean, the bracket before it as read (${JSON.stringify(clean.bracket.before)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ictx.close();

    // ---- Layout: 8 names at 360 × 270, 24 at 540 × 400, 64 filling the board, partway through. Dark theme, a new accent, and
    // Text style fit them again.
    errors.length = 0;
    const fctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const fp = await fctx.newPage(); watch(fp, 'fit');
    await fp.goto(BASE); await boardUp(fp); await freeBoard(fp);
    await fp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(fp)) || {}).style === 'wheel');
    const N64 = N24.concat(['Xavier', 'Yara', 'Leo', 'Mia', 'Noah', 'Sofia', 'Liam', 'Amara', 'Kenji', 'Diego', 'Maximiliana-Guadalupe', 'Bartholomew', 'Anne-Sophie', 'Christopher', 'Jo', 'Oluwaseun', 'Krzysztof', 'Xiomara Isabel', 'Ty', 'Wilhelmina',
      'Aiden', 'Bella', 'Caleb', 'Daisy', 'Ezra', 'Fiona', 'Gavin', 'Harper', 'Isaac', 'Jade', 'Kira', 'Logan', 'Maya', 'Nico', 'Olive', 'Pablo', 'Rhea', 'Seth', 'Tess', 'Vera']);
    await np(fp).locator('#list').fill(N24.slice(0, 8).join('\n')); await np(fp).locator('#done').click(); await fp.waitForTimeout(300);
    await menu('style:bracket', fp); await menu('quick', fp);
    const fits = [];
    for (const [label, list, w, h, taps] of [['8 names', N24.slice(0, 8), 360, 270, 3], ['24 names', N24, 540, 400, 9], ['64 names', N64, 0, 0, 40]]) {
      if (list.length !== 8) await setNames(list, fp);
      if (w) { await fp.evaluate(() => window.__board21.setMaximized('name-picker:1', false)); await fp.evaluate(([w, h]) => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w, h }), [w, h]); }
      else await fp.evaluate(() => window.__board21.setMaximized('name-picker:1', true));
      await fp.waitForTimeout(500);
      await drawNow(fp); await idle(fp); await play(taps, fp); await fp.waitForTimeout(400);
      const f = await fitLook(fp);
      fits.push(`${label}: ${f.sizes.join()}`);
      ok(f.spots === 2 * list.length - 1 && !f.bad.length && f.sizes.length === 1 && f.big && (list.length !== 8 || f.fs >= 8),
        `${label}, ${w ? w + '×' + h : 'filling the board'}: every spot apart, every name in its spot and one size, as large as fits, the lines meeting their spots (${f.sizes.join()}; ${JSON.stringify(f.fill)}; ${f.bad.slice(0, 3).join('; ') || 'ok'})`);
      if (list.length === 64) {
        const halo = await inFrame(() => { const r = [...document.querySelectorAll('.bracket-ready')].map(e => e.getBoundingClientRect()), w = parseFloat(getComputedStyle(document.querySelector('.bracket-ready')).boxShadow.trim().split(' ').pop());
          let gap = 1e9; for (const a of r) for (const b of r) if (a !== b && Math.abs(a.left - b.left) < 1 && b.top > a.top) gap = Math.min(gap, b.top - a.bottom); return { w, gap: Math.round(gap * 10) / 10 }; }, fp);
        ok(halo.w > 0 && 2 * halo.w <= halo.gap + 0.1, `64 names: the halos of ready spots one above the other never meet (${JSON.stringify(halo)})`);
      }
      await fp.screenshot({ path: OUT + `name-picker-bracket-fit-${list.length}.png` });
    }
    await fp.evaluate(() => window.__board21.setMaximized('name-picker:1', false));
    await setNames(N24, fp);
    await fp.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 900, h: 560 })); await fp.waitForTimeout(500);
    await drawNow(fp); await idle(fp); await play(9, fp); await fp.waitForTimeout(400);
    const fsWas = (await fitLook(fp)).fs;
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await setTheme(fp, 'dark');
      const c = await colors(fp), k = { out: contrast(c.out, c.stage), line: contrast(c.line, c.stage), dashed: contrast(c.dashed, c.stage), trophy: contrast(c.trophy, c.stage), halo: contrast(c.halo, c.stage) };
      ok(c.outOpacity === '1' && k.out >= 4.5 && k.line >= 3 && k.dashed >= 3 && k.trophy >= 3 && k.halo >= (theme === 'light' ? 1.15 : 1.3),
        `${theme} theme: a loser’s name stays readable (${k.out}:1), the lines, dashed spots, and grey trophy stand out (${k.line}, ${k.dashed}, ${k.trophy}:1), and the halo around a ready spot shows (${k.halo}:1)`);
    }
    let fd = await fitLook(fp);
    const darkLook = await inFrame(() => { const s = document.querySelector('.bracket-spot:not(.bracket-empty)'); return { bg: getComputedStyle(s).backgroundColor, line: getComputedStyle(document.querySelector('.bracket-lines path:not(.bracket-won)')).stroke }; }, fp);
    ok(!fd.bad.length && fd.sizes.length === 1 && Math.abs(fd.fs - fsWas) < 1 && darkLook.bg !== 'rgb(255, 255, 255)' && darkLook.line !== 'rgb(203, 213, 225)', `dark theme: the spots and lines in dark colors, every name still fits (${fd.sizes.join()}; ${JSON.stringify(darkLook)})`);
    await fp.screenshot({ path: OUT + 'name-picker-bracket-dark.png' });
    await openSettings(fp, ['bg']); await fp.click('#settings [data-act="accent"][data-val="purple"]'); await fp.keyboard.press('Escape'); await fp.waitForTimeout(500);
    fd = await fitLook(fp);
    const accent = await inFrame(() => { const t = document.createElement('i'); document.body.appendChild(t); t.style.color = 'var(--b21-accent)'; const c = getComputedStyle(t).color; t.remove();
      return { want: c, ready: getComputedStyle(document.querySelector('.bracket-ready')).borderTopColor, won: getComputedStyle(document.querySelector('.bracket-lines path.bracket-won')).stroke }; }, fp);
    ok(!fd.bad.length && accent.ready === accent.want && accent.won === accent.want, `a new accent: the ready spots and the winners’ lines take it, and every name still fits (${JSON.stringify(accent)})`);
    const letters = async val => { await openSettings(fp, ['letters']); await fp.click(`#settings [data-act="letters"][data-val="${val}"]`); await fp.keyboard.press('Escape'); await fp.waitForTimeout(800); };
    const LONG24 = N24.slice(0, 14).concat(['Maximiliana-Guadalupe', 'Bartholomew Alexander', 'Anne-Sophie', 'Christopher', 'Jo', 'Oluwaseun', 'Krzysztof', 'Xiomara Isabel', 'Ty', 'Wilhelmina']);
    await setNames(LONG24, fp); await drawNow(fp); await idle(fp); await play(5, fp);
    await fp.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 540, h: 400 })); await fp.waitForTimeout(600);
    for (const [val, label, family] of [['early', 'Early readers', /21Board Early Readers/], ['legible', 'Easier to read', /Atkinson Hyperlegible/]]) {
      await letters(val);
      fd = await fitLook(fp);
      const font = await inFrame(() => getComputedStyle(document.querySelector('.bracket-spot')).fontFamily, fp);
      ok(!fd.bad.length && fd.sizes.length === 1 && family.test(font), `${label}, 24 names with long ones at 540×400: in its letters, every name in its spot, one size (${fd.sizes.join()}; ${font}; ${fd.bad.slice(0, 3).join('; ') || 'ok'})`);
    }
    // The docs: what the Name Picker saves, and what it does.
    const dataDoc = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-FORMAT.md'), 'utf8').replace(/\s+/g, ' ');
    ok(/saves `\{ names, [^}]*groupId, [^}]*bracket, bracketId[^}]*\}`/.test(dataDoc) && /`bracket` is /.test(dataDoc)
      && /`style` is [^.]*`"bracket"`/.test(dataDoc) && dataDoc.includes('`{ seeds, picks, id }`'), 'docs/DATA-FORMAT.md gives the bracket, its id, the bracket before with its id, and the style');
    ok(/\.w \.head p \{[^}]*text-wrap: pretty/.test(fs.readFileSync(path.join(ROOT, 'docs', 'teacher-guide', 'page-src.html'), 'utf8')), 'the Teacher Guide’s card heads never leave one word alone on a line');
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    ok(readme.includes('Bracket'), 'README.md names Bracket');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await fctx.close();
  }],
  // ---- Versus. Two students picked at random face off, and a VS emblem slams down between them, in one of five looks.
  ['Name Picker: Versus', async (browser) => {
    const LOOKS = ['lightning', 'forged', 'crest', 'comic', 'flame'];
    // Every sound a style asks the host for, and for the slam how far the slam's own animations are at that moment, by
    // the clock and on screen; each look's slam, as the animations it returns; the sounds the page starts, and the notes
    // it plays.
    const SPY = () => {
      window.__sounds = []; window.__slamAt = []; window.__slams = [];
      let np;
      Object.defineProperty(window, 'NamePicker', { configurable: true, get: () => np, set: v => {
        np = v;
        const register = v.register, look = v.look;
        v.look = function (id, emblem) {
          if (emblem && typeof emblem.slam === 'function') {
            const slam = emblem.slam;
            emblem.slam = function () { const a = slam.apply(this, arguments); window.__slams.push([].concat(a || []).filter(x => x && x.finished)); return a; };
          }
          return look.apply(this, arguments);
        };
        v.register = function (id, style) {
          const mount = style.mount;
          style.mount = function (root, host) {
            const sound = host.sound;
            host.sound = function (name) {
              window.__sounds.push(name); (window.__soundLog = window.__soundLog || []).push([name, performance.now()]);
              if (name === 'slam') {
                const now = performance.now(), slam = document.getAnimations().filter(a => !(a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.versus-name')));
                window.__slamAt.push({ clock: Math.max(0, ...slam.map(a => a.startTime != null ? now - a.startTime : a.currentTime || 0)), shown: Math.max(0, ...slam.map(a => a.currentTime || 0)) });
              }
              return sound.apply(this, arguments);
            };
            return mount.call(this, root, host);
          };
          return register.call(this, id, style);
        };
      } });
      if (!window.AudioContext) return;
      window.__audio = 0; window.__notes = 0;
      const A = window.AudioContext, base = (window.BaseAudioContext || A).prototype;
      window.AudioContext = class extends A { constructor(o) { super(o); window.__audio++; } };
      for (const fn of ['createOscillator', 'createBufferSource']) { const f = base[fn]; base[fn] = function () { window.__notes++; return f.apply(this, arguments); }; }
    };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await ctx.addInitScript(SPY);
    const page = await ctx.newPage();
    const errors = [];
    const watch = (p, tab) => { p.on('pageerror', e => errors.push(`[${tab}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && /name-picker/.test(m.location().url || '')) errors.push(`[${tab} console] ${m.text()}`); }); };
    watch(page, 'tab 1');
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const np = (p = page, ik = 'name-picker:1') => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const saved = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const conf = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const menu = (id, p = page, ik = 'name-picker:1') => choose(p, ik, id);
    const items = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems
      .map(i => i.separator ? '—' : i.heading ? '# ' + i.label : i.choices ? '[' + i.choices.map(c => c.label + (c.checked ? ' ✓' : '')).join(' ') + ']'
        : i.label + (i.checked ? ' ✓' : '') + (i.disabled ? ' (off)' : '')).join(' | '), ik);
    // Versus: always two, so no row of numbers. No repeats and Start over stay, as in the other ways to pick.
    const MENU_V = ({ noRepeats = true, startOver = false, sound = false, quick = false } = {}) => ['Edit names', '—', '# Pick with', ...NP_STYLES.map(([id, l]) => l + (id === 'versus' ? ' ✓' : '')),
      '—', 'No repeats' + (noRepeats ? ' ✓' : ''), 'Start over' + (startOver ? '' : ' (off)'), 'Sound' + (sound ? ' ✓' : ''), 'Quick' + (quick ? ' ✓' : '')].join(' | ');
    const showing = (p = page, ik) => np(p, ik).locator('body').evaluate(b => b.classList.contains('showing'));
    const idle = (p = page, ik) => eventually(async () => !(await showing(p, ik)), 12000);
    const text = (sel, p = page, ik) => np(p, ik).locator(sel).textContent();
    const said = (p = page, ik) => text('#said', p, ik);
    const inFrame = (fn, p = page, ik, arg) => np(p, ik).locator('html').evaluate(fn, arg);
    const setNames = async (list, p = page, ik) => { await menu('edit', p, ik); await np(p, ik).locator('#list').fill(list.join('\n')); await np(p, ik).locator('#done').click(); await p.waitForTimeout(300); };
    const sameList = (a, b) => a.slice().sort().join() === b.slice().sort().join();
    const pickNow = async (p = page, ik) => {
      const was = ((await saved(p, ik)) || {}).pickId;
      await np(p, ik).locator('#go').click();
      await eventually(async () => ((await saved(p, ik)) || {}).pickId !== was, 3000);
      return saved(p, ik);
    };
    // The Versus stage: its look, whether it waits, its two names (the left one first), what it holds, and whether its
    // emblem is its look's markup at rest (for the waiting stage or a pick, at this box's size; ids aside).
    const vs = (p = page, ik) => inFrame(() => {
      const v = document.querySelector('.style-root[data-style="versus"] .versus');
      if (!v) return null;
      const box = v.querySelector('.versus-box'), E = NamePicker.looks[v.dataset.look], waiting = v.classList.contains('versus-waiting');
      const norm = html => {
        const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m, i) => [m[1], i]).sort((a, b) => b[0].length - a[0].length);
        for (const [id, i] of ids) html = html.split(id).join('#' + i + '#');
        return html;
      };
      let rest = false;
      if (E && box) { const t = document.createElement('div'); t.innerHTML = E.markup(waiting ? 'waiting' : 'final', { dark: document.documentElement.getAttribute('data-b21-theme') === 'dark', w: parseFloat(box.style.width), h: parseFloat(box.style.height) }); rest = norm(t.innerHTML) === norm(box.innerHTML); }
      return { look: v.dataset.look, waiting, names: [...v.querySelectorAll('.versus-name')].map(n => n.textContent), kids: [...v.children].map(c => c.className).join(' | '), rest,
        styled: [v, ...v.querySelectorAll('*')].filter(e => /transform|opacity|clip|filter/.test(e.getAttribute('style') || '')).length,
        anims: v.getAnimations({ subtree: true }).length, running: document.getAnimations().filter(a => a.playState === 'running').length, texts: v.querySelectorAll('text').length,
        sizes: [...v.querySelectorAll('.versus-name')].map(n => n.style.fontSize).join() };
    }, p, ik);
    const KIDS = 'versus-side versus-l | versus-side versus-r | versus-cut vs-cut | versus-name | versus-name | versus-box';
    // Only the sides, the slash, the names, and the emblem at rest: nothing a show added, and nothing running.
    const clean = s => !!s && s.kids.replace(/ versus-fade/g, '') === KIDS && s.rest && !s.styled && !s.anims && !s.running && !s.texts;
    // The thud comes within 50 ms of the look's impact, no sooner by the clock and no later on screen. A busy machine
    // draws late, so the screen can trail the clock by several frames.
    const onHit = (at, hit) => !!at && at.clock >= hit - 50 && at.shown <= hit + 50;
    const into = at => at ? `${Math.round(at.clock)} ms into it, ${Math.round(at.shown)} on screen` : 'no thud';
    // Every sound the host plays: a style's, the sample when Sound is ticked, and the one reduce motion plays.
    const played = (p = page, ik) => inFrame(() => {
      if (!window.__played) { window.__played = []; const play = Sound.play; Sound.play = function (name) { window.__played.push(name); return play.apply(this, arguments); }; }
      return window.__played.splice(0);
    }, p, ik);
    // From now until probed(), frame by frame: when each frame is drawn, when the look's slam began (its first animation's
    // start), and from the frame before the tap until then the light on each side: its brightness, the mean relative
    // luminance of its gradient's colors under whatever the show lays over them. And every change to the names, with the
    // frame that draws it: the one it was made in, or the next.
    const probe = (p = page, ik) => inFrame(() => {
      if (window.__probe) { window.__probe.on = false; window.__probe.mo.disconnect(); }
      const P = window.__probe = { on: true, frames: [], muts: [], slams: window.__slams.length, inFrame: false, before: null };
      const names = () => [...document.querySelectorAll('.versus .versus-name')].map(n => n.textContent);
      const nums = s => (s.match(/[\d.]+/g) || []).map(Number), lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      const light = P.light = () => {
        const v = document.querySelector('.versus');
        if (!v) return null;
        const kids = [...v.children], sides = [v.querySelector('.versus-l'), v.querySelector('.versus-r')];
        const over = kids.slice(kids.indexOf(sides[1]) + 1, kids.findIndex(e => e.classList.contains('vs-cut')));
        return sides.map((side, i) => {
          const L = (getComputedStyle(side).backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(stop => {
            let c = nums(stop).slice(0, 3);
            for (const e of over) {
              if (e.classList.contains(i ? 'versus-l' : 'versus-r')) continue;
              const s = getComputedStyle(e), k = nums(s.backgroundColor), a = (k.length > 3 ? k[3] : 1) * +s.opacity;
              c = c.map((x, j) => x * (1 - a) + k[j] * a);
            }
            return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
          });
          return L.reduce((a, b) => a + b, 0) / L.length;
        });
      };
      P.mo = new MutationObserver(() => P.muts.push({ names: names(), inFrame: P.inFrame, n: P.frames.length }));
      P.mo.observe(document.querySelector('.style-root[data-style="versus"]'), { subtree: true, childList: true, characterData: true });
      const loop = ts => {
        if (!P.on) return;
        P.inFrame = true; setTimeout(() => { P.inFrame = false; });
        const a = (window.__slams[P.slams] || [])[0];
        P.frames.push({ ts, start: a && a.startTime != null ? a.startTime : null, light: P.tapped && window.__slams.length === P.slams ? light() : null });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }, p, ik);
    const probed = (p = page, ik) => inFrame(() => { const P = window.__probe; P.on = false; P.mo.disconnect(); return { frames: P.frames, muts: P.muts, before: P.before }; }, p, ik);
    // A tap on the main button, in the page, and the names as it leaves them, in the same task. (The probe takes the light
    // of the frame on screen first.)
    const tapNow = (p = page, ik) => inFrame(() => {
      const P = window.__probe;
      if (P) { P.before = { ts: document.timeline.currentTime, light: P.light() }; P.tapped = true; }
      document.getElementById('go').click();
      return [...document.querySelectorAll('.versus .versus-name')].map(n => n.textContent + (getComputedStyle(n).filter !== 'none' ? ' (blurred)' : ''));
    }, p, ik);
    // What was wrong with the names through a show, if anything: they must be empty from the tap until the look's
    // impact (its slam's start, plus its hit), and show the pair in the first frame drawn at or after it.
    const hiddenUntil = (P, tap, pair, hit) => {
      const start = (P.frames.find(f => f.start != null) || {}).start;
      if (start == null) return 'no slam';
      const impact = start + hit, first = P.frames.find(f => f.ts >= impact), drawn = m => (P.frames[m.inFrame ? m.n - 1 : m.n] || {}).ts;
      const shown = P.muts.find(m => m.names.some(Boolean)), ms = t => Math.round(t - impact) + ' ms';
      if (tap.some(Boolean)) return `the tap left ${JSON.stringify(tap)}`;
      if (!shown) return 'no names';
      if (!(drawn(shown) >= impact)) return `${JSON.stringify(shown.names)} at ${ms(drawn(shown))}`;
      if (shown.names.join() !== pair.join()) return `${JSON.stringify(shown.names)} landed`;
      if (!first || drawn(shown) !== first.ts) return `the names at ${ms(drawn(shown))}, the first frame at ${first ? ms(first.ts) : 'none'}`;
      return '';
    };
    // The largest flash on any side, from the frame before the tap: a rise in brightness and a fall (or a fall and a rise),
    // all within a third of a second, as large as the smaller of the two. (The tap dims the stage, and the sides brighten
    // steadily through the build-up. Neither alone is a flash.)
    const flash = P => {
      const F = [P.before].concat(P.frames).filter(f => f && f.light);
      let most = 0;
      for (let i = 0; i < 2; i++) {
        const v = F.map(f => [f.ts, f.light[i]]);
        for (let j = 1; j < v.length - 1; j++) for (let a = j - 1; a >= 0 && v[j][0] - v[a][0] < 1000 / 3; a--) {
          for (let b = j + 1; b < v.length && v[b][0] - v[a][0] < 1000 / 3; b++) {
            most = Math.max(most, Math.min(v[j][1] - v[a][1], v[j][1] - v[b][1]), Math.min(v[a][1] - v[j][1], v[b][1] - v[j][1]));
          }
        }
      }
      return Math.round(most * 1000) / 1000;
    };
    // A pick tapped in the page, as pickNow() makes one, and the page's own clock from that tap: till(ms) waits until ms
    // after it. skipAt(ms, how) then taps the stage or Show now, if the show is still on, and says whether it was.
    const pickTapped = async (p = page, ik) => {
      const was = ((await saved(p, ik)) || {}).pickId;
      await inFrame(() => { window.__tapAt = performance.now(); document.getElementById('go').click(); }, p, ik);
      await eventually(async () => ((await saved(p, ik)) || {}).pickId !== was, 3000);
      return saved(p, ik);
    };
    const till = (ms, p = page, ik) => inFrame((_, ms) => new Promise(r => { const f = () => performance.now() - window.__tapAt >= ms ? r() : setTimeout(f, 4); f(); }), p, ik, ms);
    const skipAt = (ms, how, p = page, ik) => inFrame((_, [ms, sel]) => new Promise(r => {
      const f = () => {
        if (performance.now() - window.__tapAt < ms) return setTimeout(f, 4);
        const on = document.body.classList.contains('showing');
        if (on) document.querySelector(sel).click();
        r(on);
      };
      f();
    }), p, ik, [ms, how === 'a tap' ? '#stage' : '#go']);

    // ---- Versus in the menu: after Lotto. Names at a time stays as it was.
    await page.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf()) || {}).style === 'wheel');
    await page.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 540, h: 400 }));
    const N24 = ['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivy', 'Jamal', 'Kai', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tariq', 'Uma', 'Vic', 'Wen', 'Zoe'];
    await np().locator('#list').fill(N24.join('\n')); await np().locator('#done').click(); await page.waitForTimeout(300);
    await menu('winners:3');
    await menu('style:versus');
    ok((await conf()).style === 'versus' && (await conf()).winners === 3 && await eventually(async () => await items() === MENU_V()),
      `Versus comes after Lotto under Pick with, ticked; no row of numbers, then No repeats, Start over, Sound, and Quick (${await items()})`);
    ok(await text('#status') === '24 of 24 left' && await text('#go') === 'Pick 2' && await np().locator('#round').isHidden(), `“24 of 24 left” and “Pick 2” (${await text('#status')}, ${await text('#go')})`);
    let s = await vs();
    ok(s && s.waiting && s.names.join() === '?,?' && LOOKS.includes(s.look) && clean(s), `before the first pick: “?” on each side, the sides grey, and a look waiting (${s && s.look}; ${JSON.stringify(s)})`);
    ok(await inFrame(() => getComputedStyle(document.querySelector('.versus-l')).filter) !== 'none', 'the waiting sides are desaturated');
    await page.screenshot({ path: OUT + 'name-picker-versus-waiting.png' });

    // ---- Ticking Sound plays a sample: in Versus, the challenge sound.
    await played();
    await menu('sound');
    let sample = [];
    ok(await eventually(async () => (sample = sample.concat(await played())).length > 0) && sample.join() === 'challenge', `ticking Sound plays the challenge sound as a sample (${sample.join()})`);

    // ---- A pick: two different students, saved with a pickId and a look before the show. The show: about 2.5 s. A drum
    // rolls until the look's moment of impact, the slam's thud comes then, and the challenge sound at the end.
    await inFrame(() => { window.__sounds.length = 0; window.__slamAt.length = 0; });
    const n0 = await inFrame(() => window.__notes || 0);
    let t0 = Date.now(), st = await pickNow();
    const during = { go: await text('#go'), showing: await showing(), status: await text('#status') };
    await idle();
    let took = Date.now() - t0;
    ok(st.picked.length === 2 && st.picked[0] !== st.picked[1] && st.picked.every(n => N24.includes(n)) && st.left.length === 22 && st.picked.every(n => !st.left.includes(n))
      && /^[a-z0-9]+-[a-z0-9]+$/.test(st.pickId) && LOOKS.includes(st.versusLook) && st.current === st.picked[0],
      `a pick takes two different students, saved before the show with a pickId and its look (${st.picked.join(' versus ')}, ${st.versusLook})`);
    ok(during.go === 'Show now' && during.showing && during.status === '24 of 24 left', `during the show: “Show now”, the status as it was (${JSON.stringify(during)})`);
    ok(took > 1900 && took < 3300, `the show takes about 2.5 s (${took} ms)`);
    s = await vs();
    ok(s.names.join() === st.picked.join() && s.look === st.versusLook && !s.waiting && clean(s),
      `then ${st.picked[0]} on the left and ${st.picked[1]} on the right, in the ${s.look} look, with only the emblem at rest: nothing the show added, nothing running (${JSON.stringify(s)})`);
    ok(await text('#status') === '22 of 24 left' && await text('#go') === 'Pick 2' && await np().locator('#round').isVisible() && await eventually(async () => await said() === `${st.picked[0]} versus ${st.picked[1]}.`),
      `“22 of 24 left”, “Pick 2”, Start over, and screen readers hear “${await said()}”`);
    let snd = await inFrame(() => ({ sounds: window.__sounds.slice(), at: window.__slamAt.slice(), notes: window.__notes || 0, audio: window.__audio || 0, hit: NamePicker.looks[document.querySelector('.versus').dataset.look].hit }));
    ok(/^(drum,)+slam,challenge$/.test(snd.sounds.join()) && snd.audio >= 1 && snd.notes - n0 >= 12,
      `with Sound on: a drum until the impact (${snd.sounds.filter(x => x === 'drum').length} beats), the slam, then the challenge sound, and no tick, pop, or chime (${snd.sounds.filter(x => x !== 'drum').join(', ')}; ${snd.notes - n0} notes)`);
    ok(snd.at.length === 1 && onHit(snd.at[0], snd.hit.normal), `the slam’s thud comes at the look’s moment of impact, on the slam’s own clock (${into(snd.at[0])}; ${st.versusLook} hits at ${snd.hit.normal})`);
    await page.screenshot({ path: OUT + 'name-picker-versus.png' });

    // ---- A tap on the stage skips the show, in the build-up or during the slam, and so does Show now. Nothing the show
    // added is left, and no sound comes after it. Timed from the tap: the build-up, the slam before any look's impact
    // (1.8 s or later), and after every look's impact but before any show's end (2.26 s or later). A tap within 600 ms is a
    // double tap. Quick: about 1.1 s.
    // (When the show ends: the body loses .showing.)
    await inFrame(() => new MutationObserver(() => { if (!document.body.classList.contains('showing')) window.__endedAt = performance.now(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] }));
    const soundsAfter = () => inFrame(() => (window.__soundLog || []).filter(x => x[1] > window.__endedAt + 1).map(x => x[0]));
    for (const [ms, how] of [[700, 'a tap'], [700, 'Show now'], [1750, 'Show now'], [2050, 'a tap']]) {
      await idle();
      st = await pickTapped();
      const on = await skipAt(ms, how); await page.waitForTimeout(150);
      s = await vs();
      ok(on && !(await showing()) && (await saved()).pickId === st.pickId && s.names.join() === st.picked.join() && s.look === st.versusLook && clean(s) && await text('#go') === 'Pick 2',
        `${how} ${ms} ms into the show skips it: the pair and the ${s.look} emblem at rest, nothing left of the show, nothing running (${on ? '' : 'the show was already over; '}${JSON.stringify(s)})`);
      await page.waitForTimeout(250);
      const after = await soundsAfter();
      ok(!after.length, `and no drum, slam, or challenge sound after it (${after.join(', ') || 'none'})`);
    }
    await menu('quick');
    ok(await items() === MENU_V({ startOver: true, sound: true, quick: true }), 'Quick is ticked');
    await idle(); t0 = Date.now(); st = await pickNow(); await idle(); took = Date.now() - t0;
    s = await vs();
    ok(took > 800 && took < 2000 && clean(s) && s.look === st.versusLook, `with Quick the show takes about 1.1 s (${took} ms), and ends as clean`);
    snd = await inFrame(() => ({ at: window.__slamAt.slice(-1)[0], hit: NamePicker.looks[document.querySelector('.versus').dataset.look].hit }));
    ok(onHit(snd.at, snd.hit.quick), `with Quick the thud comes at the quick slam’s impact (${into(snd.at)}; ${st.versusLook} hits at ${snd.hit.quick})`);
    st = await pickTapped(); const quickOn = await skipAt(750, 'a tap'); await page.waitForTimeout(150);
    ok(quickOn && !(await showing()) && clean(await vs()), 'a tap during the quick slam skips it, as clean');
    await menu('quick');

    // ---- Start over: the waiting stage again, in a look drawn at random each time it appears.
    const overs = [];
    for (let i = 0; i < 8; i++) {
      await idle(); await pickNow(); await page.waitForTimeout(650); await np().locator('#stage').click(); await idle();
      await menu('round');
      const w = await vs();
      overs.push(w && w.waiting && w.names.join() === '?,?' && clean(w) ? w.look : 'not waiting ' + JSON.stringify(w));
    }
    ok(overs.every(l => LOOKS.includes(l)) && new Set(overs).size >= 2 && await text('#status') === '24 of 24 left' && await text('#go') === 'Pick 2',
      `after Start over: “?” on each side and a look waiting, drawn at random each time (${overs.join(', ')})`);

    // ---- No repeats off: picks from everyone ("24 names"). Every look, after its show and after a skip in the middle of its
    // slam: only the sides, the slash, the names, and the emblem at rest, and nothing running. The thud at each look's impact.
    await menu('norepeat');
    ok(await text('#status') === '24 names' && await text('#go') === 'Pick 2' && await items() === MENU_V({ noRepeats: false, sound: true }), `No repeats off: “24 names”, “Pick 2” (${await text('#status')})`);
    const ended = {}, skipped = {}, thuds = {};
    for (let i = 0; i < 20; i++) {
      await idle();
      await inFrame(() => { window.__slamAt.length = 0; });
      st = i < 10 ? await pickNow() : await pickTapped();
      const on = i < 10 ? await idle() : await skipAt(1750, 'a tap'); await page.waitForTimeout(150);
      s = await vs();
      const fine = on && !(await showing()) && s.look === st.versusLook && s.names.join() === st.picked.join() && clean(s), bag = i < 10 ? ended : skipped;
      if (bag[st.versusLook] === undefined || bag[st.versusLook] === true) bag[st.versusLook] = fine || JSON.stringify(s);
      if (i < 10) thuds[st.versusLook] = await inFrame(() => { const at = window.__slamAt[0], hit = NamePicker.looks[document.querySelector('.versus').dataset.look].hit.normal; return at && { clock: Math.round(at.clock - hit), shown: Math.round(at.shown - hit) }; });
    }
    ok(LOOKS.every(l => ended[l] === true), `every look, after its show: nothing the show added is left, and nothing runs (${JSON.stringify(ended)})`);
    ok(LOOKS.every(l => skipped[l] === true), `every look, skipped in the middle of its slam: the same (${JSON.stringify(skipped)})`);
    ok(LOOKS.every(l => onHit(thuds[l], 0)), `every look’s thud comes at its own moment of impact (ms off, by the clock and on screen: ${JSON.stringify(thuds)})`);
    // A show cut short any other way ends at once, and as clean (No repeats is off: every pick from everyone): the page
    // hidden, a switch to Big name and back, Edit names and Done, or a resize. In the build-up and after every look's impact,
    // timed from the tap (each lead: how long its cut takes to land), and a resize in the slam before any impact too. No
    // sound after it, and no challenge sound unless a resize ends the show after the thud. A cut before the impact plays
    // neither.
    const hide = v => inFrame((_, v) => {
      if (v) { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); }
      else { delete document.hidden; delete document.visibilityState; }
      document.dispatchEvent(new Event('visibilitychange'));
    }, page, undefined, v);
    const CUTS = [['the page hidden', 0, [700, 2050], () => hide(true)],
      ['a switch to Big name and back', 280, [700, 2050], async () => { await menu('style:name'); await eventually(async () => (await conf()).style === 'name'); await menu('style:versus'); await eventually(async () => (await conf()).style === 'versus'); }],
      ['Edit names and Done', 280, [700, 2050], async () => { await menu('edit'); await np().locator('#done').click(); await page.waitForTimeout(200); }],
      ['a resize', 0, [700, 1750, 2050], () => page.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 600, h: 440 }))]];
    const cutShort = [];
    for (const [how, lead, times, act] of CUTS) for (const ms of times) {
      await idle();
      st = await pickTapped();
      await till(ms - lead);
      await act();
      await page.waitForTimeout(450);
      const on = await showing();
      // The sounds the style asked for once the show had ended, and all but the drum from the tap on.
      const after = await soundsAfter(), heard = (await inFrame(() => (window.__soundLog || []).filter(x => x[1] >= window.__tapAt).map(x => x[0]))).filter(x => x !== 'drum').join();
      if (how === 'the page hidden') await hide(false);
      if (how === 'a resize') { await page.evaluate(() => window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 540, h: 400 })); await page.waitForTimeout(300); }
      s = await vs();
      const style = (await conf()).style;
      if (on || style !== 'versus' || !clean(s) || s.names.join() !== st.picked.join() || s.look !== st.versusLook || after.length || !(heard === '' || heard === 'slam' || (how === 'a resize' && heard === 'slam,challenge')))
        cutShort.push(`${how} at ${ms} ms: ${JSON.stringify({ on, style, heard, after: after.join(' '), s })}`);
    }
    ok(!cutShort.length, `a show cut short by the page hidden, a switch of style and back, Edit names, or a resize ends at once and as clean, with no sound after, and no challenge sound but after a resize’s thud (${cutShort.slice(0, 2).join(' | ') || 'all 9'})`);

    // ---- The names stay hidden until the impact. With a pair on the stage, the tap on Pick 2 empties both names in its own
    // task, and they stay empty until the look's moment of impact. The pair shows in the first frame drawn at or after it.
    // Every look, normal and Quick, at the smallest size, the usual size, and maximized. And the build-up doesn't flash: at
    // the usual size, from the frame before the tap, no side's brightness rises and falls by 0.10 or more within a third of
    // a second, WCAG's flash line.
    const unseen = [], flashes = {};
    for (const quick of [false, true]) {
      if (quick) await menu('quick');
      for (const [size, w, h] of [['the smallest size', 260, 200], ['the usual size', 420, 320], ['maximized']]) {
        await page.evaluate(([w, h]) => { const B = window.__board21; B.setMaximized('name-picker:1', !w); if (w) B.setRect('name-picker:1', { x: 40, y: 40, w, h }); }, [w, h]); await page.waitForTimeout(300);
        for (const look of LOOKS) {
          await idle();
          await inFrame((_, look) => { deck = [look]; }, page, undefined, look);   // (the look the next pick plays)
          await probe();
          const was = (await saved()).pickId, tap = await tapNow();
          await eventually(async () => (await saved()).pickId !== was, 3000);
          st = await saved(); await idle();
          const P = await probed(), hit = await inFrame((_, l) => NamePicker.looks[l].hit, page, undefined, look);
          const bad = st.versusLook !== look ? `played ${st.versusLook}` : hiddenUntil(P, tap, st.picked, quick ? hit.quick : hit.normal);
          if (bad) unseen.push(`${look}${quick ? ' (Quick)' : ''} at ${size}: ${bad}`);
          if (w === 420) flashes[quick ? 'Quick' : 'normal'] = Math.max(flashes[quick ? 'Quick' : 'normal'] || 0, flash(P));
        }
      }
      if (quick) await menu('quick');
    }
    await page.evaluate(() => { window.__board21.setMaximized('name-picker:1', false); window.__board21.setRect('name-picker:1', { x: 40, y: 40, w: 540, h: 400 }); }); await page.waitForTimeout(300);
    ok(!unseen.length, `no name shows before the impact, and the pair lands in its first frame: every look, normal and Quick, at the smallest size, the usual size, and maximized (${unseen.slice(0, 3).join(' | ') || 'all 30'})`);
    ok(flashes.normal < 0.1 && flashes.Quick < 0.1, `the build-up doesn’t flash: from the frame before the tap, no side rises and falls in brightness by 0.10 within a third of a second (largest: ${JSON.stringify(flashes)})`);
    await menu('sound'); await menu('norepeat');

    // ---- Names at a time stays as the teacher chose it: back in Big name, the button picks 3. Ticking Sound here plays the
    // chime as its sample.
    await menu('style:name');
    ok((await conf()).winners === 3 && /^Pick (3|the last)/.test(await text('#go')), `back in Big name, Names at a time is still 3 (${await text('#go')})`);
    await played(); await menu('sound');
    sample = [];
    ok(await eventually(async () => (sample = sample.concat(await played())).length > 0) && sample.join() === 'chime', `in Big name, ticking Sound plays the chime as a sample (${sample.join()})`);
    await menu('sound');
    await menu('style:versus');

    // ---- Sound ticked during a show plays no sample: the show's own sounds come in, and the challenge plays once, at the end.
    await idle(); await played();
    await pickTapped(); await till(700); await menu('sound');   // (ticked about 1 s in)
    await idle(); await page.waitForTimeout(200);
    const mid = (await played()).filter(x => x !== 'drum').join();
    ok(mid === 'slam,challenge', `Sound ticked during the show plays no sample: the slam, then the challenge once, at the end (${mid})`);
    await menu('sound');

    // ---- Saved, reloaded, and synced.
    await idle(); st = await pickNow(); await idle();
    await page.reload(); await boardUp(page);
    ok(await eventually(async () => { const v = await vs().catch(() => null); return v && v.look === st.versusLook && v.names.join() === st.picked.join(); }) && !(await showing()) && clean(await vs()),
      `a reload shows the pair in its look (${st.versusLook}), with no show`);
    const page2 = await ctx.newPage(); watch(page2, 'tab 2');
    await page2.goto(BASE); await boardUp(page2); await freeBoard(page2);
    await eventually(async () => ((await vs(page2).catch(() => null)) || {}).look === st.versusLook);
    st = await pickNow();
    ok(await eventually(() => showing(page2), 2000), 'a pick in one tab plays its show in the other');
    await idle(); await idle(page2);
    const s1 = await vs(), s2 = await vs(page2);
    ok(s2.look === st.versusLook && s1.look === st.versusLook && s2.names.join() === st.picked.join() && clean(s2) && await eventually(async () => await said(page2) === `${st.picked[0]} versus ${st.picked[1]}.`),
      `in the same look (${s1.look}, ${s2.look}), on the same pair, and screen readers there hear it too`);
    await page2.close();

    // ---- A template keeps Versus, and no names.
    await page.click('.picker-btn.right'); await page.click('[data-ctl="export"]'); await page.waitForTimeout(200);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal .btn[data-i="1"]')]);
    await dl.saveAs(OUT + 'name-picker-versus-template.21board');
    const tpl = JSON.parse(fs.readFileSync(OUT + 'name-picker-versus-template.21board', 'utf8')), tp = tpl.instances.find(i => i.widgetId === 'name-picker');
    ok(tpl.kind === 'template' && tp && tp.data === null && tp.config.style === 'versus' && !N24.some(n => JSON.stringify(tpl).includes('"' + n + '"')),
      `a template keeps Versus, and no names (${JSON.stringify(tp && tp.config)})`);

    // ---- One name: Versus needs 2. "Add names" opens the list.
    await setNames(['Ava']);
    const one = { empty: await np().locator('#empty').isVisible() ? await text('#empty') : '', go: await text('#go'), status: await text('#status'), round: await np().locator('#round').isHidden() };
    ok(one.empty === 'Versus needs 2 names.' && one.go === 'Add names' && one.status === '' && one.round, `one name: “${one.empty}”, “${one.go}” (${JSON.stringify(one)})`);
    await page.screenshot({ path: OUT + 'name-picker-versus-one-name.png' });
    await np().locator('#go').click(); await page.waitForTimeout(200);
    ok(await np().locator('#edit').evaluate(e => e.classList.contains('on')), '“Add names” opens the names list');
    await np().locator('#list').fill('Mateo\nJamal'); await np().locator('#done').click(); await page.waitForTimeout(300);
    ok(!(await np().locator('#empty').isVisible()) && await text('#go') === 'Pick 2', 'two names: Pick 2');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- Reduce motion: the pair and the emblem fade in, with no drumroll, slam, flash, or shake. The challenge sound still plays.
    errors.length = 0;
    const rctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    await rctx.addInitScript(SPY);
    const rp = await rctx.newPage(); watch(rp, 'reduce motion');
    await rp.goto(BASE); await boardUp(rp); await freeBoard(rp);
    await rp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(rp)) || {}).style === 'wheel');
    await np(rp).locator('#list').fill(N24.join('\n')); await np(rp).locator('#done').click(); await rp.waitForTimeout(300);
    await menu('style:versus', rp); await played(rp); await menu('sound', rp);
    await eventually(async () => (await played(rp)).length > 0);   // (the sample)
    await inFrame(() => { window.__sounds.length = 0; window.__moved = []; const a = Element.prototype.animate; Element.prototype.animate = function (k) { window.__moved.push(JSON.stringify(k)); return a.apply(this, arguments); }; }, rp);
    const n1 = await inFrame(() => window.__notes || 0, rp);
    st = await pickNow(rp);
    const calm = await inFrame(() => ({ fade: [...document.querySelectorAll('.versus-name, .versus-box')].every(e => e.classList.contains('versus-fade')), moved: window.__moved.length,
      css: document.getAnimations().filter(a => a.effect && a.effect.getKeyframes().some(k => Object.keys(k).some(p => !['offset', 'computedOffset', 'easing', 'composite', 'opacity'].includes(p)))).length,
      sounds: window.__sounds.slice() }), rp);
    ok(!(await showing(rp)) && (await vs(rp)).names.join() === st.picked.join() && (await vs(rp)).look === st.versusLook && calm.fade && !calm.moved && !calm.css && !calm.sounds.length,
      `with reduce motion the pair and the emblem fade in: no drumroll, slam, flash, or shake (${JSON.stringify(calm)})`);
    let calmSounds = [];
    ok(await eventually(async () => (calmSounds = calmSounds.concat(await played(rp))).length > 0) && calmSounds.join() === 'challenge' && await eventually(async () => await inFrame(() => window.__notes || 0, rp) - n1 >= 3)
      && await eventually(async () => await said(rp) === `${st.picked[0]} versus ${st.picked[1]}.`), `and the challenge sound still plays (${calmSounds.join()}), and screen readers hear the pair`);
    await rp.waitForTimeout(400);
    ok(clean(await vs(rp)), 'once faded in, nothing runs');
    // A double tap with reduce motion (no show to skip) makes one pick: two students leave the round, not four. It
    // starts fresh, since on a busy machine the pick above can be less than the guard's 600 ms ago.
    await inFrame(() => { drewAt = -1e9; window.__ids = []; const s = Board21.save; window.__save = s; Board21.save = function (d) { if (d && d.pickId && window.__ids[window.__ids.length - 1] !== d.pickId) window.__ids.push(d.pickId); return s.apply(this, arguments); }; }, rp);
    const leftWas = (await saved(rp)).left.length;
    await np(rp).locator('#go').dblclick(); await rp.waitForTimeout(700);
    const dbl = await inFrame(() => { Board21.save = window.__save; return window.__ids.slice(); }, rp);
    st = await saved(rp);
    ok(dbl.length === 1 && st.left.length === leftWas - 2 && await text('#status', rp) === `${st.left.length} of 24 left` && (await vs(rp)).names.join() === st.picked.join()
      && await eventually(async () => await said(rp) === `${st.picked[0]} versus ${st.picked[1]}.`),
      `a double tap with reduce motion makes one pick (${dbl.length}): ${leftWas} → ${st.left.length} left, and screen readers hear “${await said(rp)}”`);
    await menu('sound', rp);

    // ---- No repeats: 24 names go in 12 pairs, no one twice; then Start over. 25 names: after 12 pairs, "Pick the last one"
    // pairs the last student with someone else in the list.
    const pairs = async n => inFrame((_, n) => {
      const out = [], save = Board21.save;
      Board21.save = function (d) { if (d && d.picked) out.push({ picked: d.picked.slice(), left: d.left && d.left.length, look: d.versusLook }); return save.apply(this, arguments); };
      for (let i = 0; i < n; i++) { drewAt = -1e9; document.getElementById('go').click(); }   // (each a tap of its own, not a double tap)
      Board21.save = save;
      return { out, go: document.getElementById('go').textContent, status: document.getElementById('status').textContent };
    }, rp, undefined, n);
    await menu('round', rp);
    let r = await pairs(12);
    ok(r.out.length === 12 && r.out.every(x => x.picked.length === 2) && sameList(r.out.flatMap(x => x.picked), N24) && r.go === 'Start over' && r.status === '0 of 24 left',
      `No repeats: 24 names go in 12 pairs, everyone once (${r.out.map(x => x.picked.join('/')).slice(0, 4).join(', ')}, …); then “${r.go}”, “${r.status}”`);
    ok(await eventually(async () => / Everyone has been picked\.$/.test(await said(rp))), `screen readers hear that everyone has been picked (${await said(rp)})`);
    await rp.waitForTimeout(700);   // (a tap of its own, not the second of a double tap)
    await np(rp).locator('#go').click(); await rp.waitForTimeout(200);
    const N25 = N24.concat(['Xavier']);
    await setNames(N25, rp);
    r = await pairs(12);
    const lastOne = { go: await text('#go', rp), status: await text('#status', rp) };
    const left1 = (await saved(rp)).left;
    r.last = await pairs(1);
    const lp = r.last.out[0];
    ok(r.out.length === 12 && lastOne.go === 'Pick the last one' && lastOne.status === '1 of 25 left' && left1.length === 1,
      `25 names: after 12 pairs, “${lastOne.go}”, “${lastOne.status}” (${left1})`);
    ok(lp && lp.picked.length === 2 && lp.picked.includes(left1[0]) && lp.picked[0] !== lp.picked[1] && r.out.flatMap(x => x.picked).includes(lp.picked.find(n => n !== left1[0])) && lp.left === 0
      && r.last.go === 'Start over' && r.last.status === '0 of 25 left', `it pairs ${left1[0]} with someone else in the list (${lp && lp.picked.join(' versus ')}); then “${r.last.go}”, “${r.last.status}”`);

    // ---- The deck: a new picker's first 10 picks play each of the five looks twice, and over 50 picks no look plays twice
    // in a row.
    const ikD = await rp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(rp, ikD)) || {}).style === 'wheel');
    await np(rp, ikD).locator('#list').fill(N24.join('\n')); await np(rp, ikD).locator('#done').click(); await rp.waitForTimeout(300);
    await menu('style:versus', rp, ikD); await menu('norepeat', rp, ikD);
    const deck = await inFrame(() => {
      const out = [], save = Board21.save;
      Board21.save = function (d) { if (d && d.picked) out.push(d.versusLook); return save.apply(this, arguments); };
      for (let i = 0; i < 50; i++) { drewAt = -1e9; document.getElementById('go').click(); }   // (each a tap of its own, not a double tap)
      Board21.save = save;
      return out;
    }, rp, ikD);
    const first10 = LOOKS.map(l => deck.slice(0, 10).filter(x => x === l).length), twice = deck.filter((x, i) => i && x === deck[i - 1]).length;
    ok(deck.length === 50 && first10.every(c => c === 2) && !twice, `the first 10 picks play each look twice (${first10.join(', ')}), and none plays twice in a row over 50 (${deck.slice(0, 12).join(' ')} …)`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await rctx.close();

    // ---- No look is fixed: over many new Name Pickers, every look shows up waiting, and every look plays as the first pick.
    errors.length = 0;
    const wctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
    const wp = await wctx.newPage(); watch(wp, 'new pickers');
    await wp.goto(BASE); await boardUp(wp); await freeBoard(wp);
    const pickers = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Pickers' }, instances: Array.from({ length: 8 }, (_, i) => ({ widgetId: 'name-picker', instance: i + 1, open: true, z: i + 1,
      rect: { x: 10 + (i % 4) * 390, y: 10 + Math.floor(i / 4) * 430, w: 380, h: 420 }, data: { names: N24.slice(0, 6) }, config: { style: 'versus' } })) };
    const waited = [], firsts = [];
    for (let round = 0; round < 6; round++) {
      await wp.evaluate(o => window.__board21.applyImport(o, 'replace'), pickers);
      for (let i = 1; i <= 8; i++) {
        const ik = 'name-picker:' + i;
        await eventually(async () => !!(await vs(wp, ik).catch(() => null)), 15000);
        const w = await vs(wp, ik);
        if (w.waiting) waited.push(w.look);
        const was = ((await saved(wp, ik)) || {}).pickId;
        await inFrame(() => document.getElementById('go').click(), wp, ik);
        await eventually(async () => ((await saved(wp, ik)) || {}).pickId !== was, 3000);
        firsts.push((await saved(wp, ik)).versusLook);
      }
    }
    const count = list => LOOKS.map(l => l + ' ' + list.filter(x => x === l).length).join(', ');
    ok(waited.length === 48 && LOOKS.every(l => waited.includes(l)), `48 new Name Pickers wait in every look (${count(waited)})`);
    ok(firsts.length === 48 && LOOKS.every(l => firsts.includes(l)), `and every look plays as a first pick (${count(firsts)})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await wctx.close();

    // ---- A board from a file, at 1:1 (each emblem measured in screen pixels): every look, in two pickers each. A saved look
    // shows with no show; one we don't have, or none, gets one of the five. No look has text, and no two pickers share an
    // id. Long names fit their side and stay at least 8 px clear of the emblem at 360 × 270, at 540 × 400, and filling the
    // board, in every Text style.
    errors.length = 0;
    const ictx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const ip = await ictx.newPage(); watch(ip, 'file');
    await ip.goto(BASE); await boardUp(ip); await freeBoard(ip);
    // (Christopher's p hangs toward the emblem when his name is above it.)
    const LONG = ['Christopher', 'Maximiliano'];
    const looked = (n, look, pair) => ({ widgetId: 'name-picker', instance: n, open: true, z: n, rect: { x: 10 + ((n - 1) % 6) * 220, y: 10 + Math.floor((n - 1) / 6) * 300, w: 360, h: 270 },
      data: { names: LONG, left: null, picked: pair, pickId: 'mwp2g7b7-pg6ut' + n, versusLook: look }, config: { style: 'versus' } });
    const file = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Looks' }, instances: LOOKS.map((l, i) => looked(i + 1, l, LONG))
      .concat(LOOKS.map((l, i) => looked(i + 6, l, LONG.slice().reverse())), [looked(11, 'disco', LONG), looked(12, undefined, LONG)]) };
    fs.writeFileSync(OUT + 'name-picker-versus-looks.21board', JSON.stringify(file));
    await ip.setInputFiles('#import-input', OUT + 'name-picker-versus-looks.21board'); await ip.waitForTimeout(300);
    await ip.click('#modal .btn:has-text("Replace this page")');
    const IK = n => 'name-picker:' + n;
    ok(await eventually(async () => (await Promise.all(Array.from({ length: 12 }, (_, i) => vs(ip, IK(i + 1)).catch(() => null)))).every(Boolean), 15000), 'the board from the file opens with its twelve pickers');
    await ip.waitForTimeout(600);
    const shown = await Promise.all(Array.from({ length: 12 }, (_, i) => vs(ip, IK(i + 1))));
    ok(LOOKS.every((l, i) => shown[i].look === l && shown[i + 5].look === l && clean(shown[i]) && clean(shown[i + 5])) && shown.slice(0, 5).every(x => x.names.join() === LONG.join())
      && !(await showing(ip, IK(1))), `each picker shows its saved look, at rest, with no show (${shown.slice(0, 5).map(x => x.look).join(', ')})`);
    ok(LOOKS.includes(shown[10].look) && LOOKS.includes(shown[11].look) && clean(shown[10]) && shown[10].names.join() === LONG.join(),
      `a look we don’t have, or none, gets one of the five (${shown[10].look}, ${shown[11].look})`);
    const marks = await inFrame(() => Object.entries(NamePicker.looks).map(([id, E]) => [id, [true, false].flatMap(dark => ['final', 'waiting'].flatMap(st => [40, 200].map(h => E.markup(st, { dark, w: h * 1.2, h })))).some(m => /<text\b/i.test(m))]), ip, IK(1));
    ok(marks.length === 5 && marks.every(([, t]) => !t) && shown.every(x => !x.texts), `no look draws text: light and dark, waiting and final, big and small (${marks.map(([id, t]) => id + (t ? ' has text' : ' paths')).join(', ')})`);
    const idsOf = ik => inFrame(() => [...document.querySelectorAll('.versus [id]')].map(e => e.id), ip, ik);
    const clash = [];
    for (let i = 1; i <= 5; i++) {
      const a = await idsOf(IK(i)), b = await idsOf(IK(i + 5));
      if (!a.length || new Set(a).size !== a.length || new Set(b).size !== b.length || a.some(x => b.includes(x))) clash.push(LOOKS[i - 1]);
    }
    ok(!clash.length, `two Name Pickers in the same look have no clashing ids, in every look (${clash.join(', ') || 'none clash'})`);
    // The ink of the names and of the emblem, shot apart on black and on white (what differs is their alpha): each name's
    // smallest gap to the emblem (ink is alpha over 60 of 255, as the looks were measured), whether it is whole inside the
    // stage, and whether any name crosses the middle.
    // (The board at 100%, so a window's px are screen px. While a picker is shot, the other windows are hidden: a shot takes
    // in whatever is on top.)
    await freeBoard(ip);
    const inkGaps = async ik => {
      const css = v => inFrame((_, c) => { let e = document.getElementById('ink-test'); if (!e) { e = document.createElement('style'); e.id = 'ink-test'; document.head.appendChild(e); } e.textContent = c; }, ip, ik, v);
      const others = v => ip.evaluate(v => { let e = document.getElementById('ink-test'); if (!e) { e = document.createElement('style'); e.id = 'ink-test'; document.head.appendChild(e); } e.textContent = v; }, v);
      await others(`.win:not([data-ikey="${ik}"]) { visibility: hidden !important; }`);
      const shots = {};
      for (const [part, hide] of [['n', '.versus-box'], ['e', '.versus-name']]) for (const bg of ['black', 'white']) {
        await css(`.stage { border-radius: 0 !important; box-shadow: none !important; } .versus-side, .versus-cut, ${hide} { visibility: hidden !important; } .versus { background: ${bg} !important; }`);
        shots[part + bg] = (await np(ip, ik).locator('.versus').screenshot()).toString('base64');
      }
      await css(''); await others('');
      return inFrame(async (_, s) => {
        const img = async b => { const i = new Image(); i.src = 'data:image/png;base64,' + b; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
        const [nb, nw, eb, ew] = await Promise.all(['nblack', 'nwhite', 'eblack', 'ewhite'].map(k => img(s[k])));
        const W = nb.width, H = nb.height;
        const ink = (b, w) => { const m = new Uint8Array(W * H); for (let i = 0, j = 0; i < m.length; i++, j += 4) m[i] = 255 - (w.data[j] - b.data[j] + w.data[j + 1] - b.data[j + 1] + w.data[j + 2] - b.data[j + 2]) / 3 > 60 ? 1 : 0; return m; };
        // (A shot on a fraction of a pixel takes in a sliver of what is around the stage: its outer 2 px don't count.)
        const N = ink(nb, nw), E = ink(eb, ew), edge = (m, i, x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W];
        for (const m of [N, E]) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) m[y * W + x] = 0;
        const out = { W, H };
        // (Names above and below the emblem, in a tall stage: the top half and the bottom half.)
        const halves = s.tall ? [['L', 0, W, 0, H >> 1], ['R', 0, W, H >> 1, H]] : [['L', 0, W >> 1, 0, H], ['R', W >> 1, W, 0, H]];
        for (const [side, x0, x1, y0, y1] of halves) {
          let over = 0, bx0 = W, bx1 = -1, by0 = H, by1 = -1;
          const pts = [];
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = y * W + x;
            if (!N[i]) continue;
            if (E[i]) over++;
            bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
            if (edge(N, i, x, y)) pts.push(x, y);
          }
          if (bx1 < 0) { out[side] = { gap: -999 }; continue; }
          let best = 999 * 999;
          if (!over) {
            const ex = [];
            for (let y = Math.max(0, by0 - 60); y < Math.min(H, by1 + 60); y++) for (let x = Math.max(0, bx0 - 60); x < Math.min(W, bx1 + 60); x++) { const i = y * W + x; if (E[i] && edge(E, i, x, y)) ex.push(x, y); }
            for (let a = 0; a < pts.length; a += 2) for (let b = 0; b < ex.length; b += 2) { const dx = pts[a] - ex[b], dy = pts[a + 1] - ex[b + 1], d = dx * dx + dy * dy; if (d < best) best = d; }
          }
          out[side] = { gap: over ? -over : Math.round((Math.sqrt(best) - 1) * 10) / 10, inside: bx0 > 2 && by0 > 2 && bx1 < W - 3 && by1 < H - 3 };
        }
        let mid = 0;
        if (s.tall) { for (let y = (H >> 1) - 2; y <= (H >> 1) + 2; y++) for (let x = 0; x < W; x++) mid += N[y * W + x]; }
        else for (let y = 0; y < H; y++) for (let x = (W >> 1) - 2; x <= (W >> 1) + 2; x++) mid += N[y * W + x];
        out.mid = mid; out.tall = s.tall;
        return out;
      }, ip, ik, Object.assign(shots, { tall: await inFrame(() => document.querySelector('.versus-name').getBoundingClientRect().bottom < document.querySelector('.versus-box').getBoundingClientRect().top, ip, ik) }));
    };
    const letters = async val => { await openSettings(ip, ['letters']); await ip.click(`#settings [data-act="letters"][data-val="${val}"]`); await ip.keyboard.press('Escape'); await ip.waitForTimeout(900); };
    const tight = [], worst = {}, sizesAt = {};
    for (const [val, label] of [['standard', 'the device’s letters'], ['early', 'Early readers'], ['legible', 'Easier to read']]) {
      if (val !== 'standard') await letters(val);
      // (In the device's letters, square and narrow windows too, down to the smallest, 260 × 200, and tall windows, where
      // the names go above and below the emblem. Long names go above and below at 400 × 400 and 420 × 420 too, and in
      // some looks at 540 × 460 and 900 × 700. Every Text style takes two tall windows: Early readers' letters reach
      // deepest.)
      for (const size of [[360, 270], [540, 400], null, [360, 480], [300, 400]].concat(val === 'standard' ? [[260, 200], [400, 400], [420, 420], [400, 460], [400, 500], [300, 520], [300, 640], [540, 460], [900, 700]] : [])) {
        const where = size ? size.join(' × ') : 'filling the board';
        for (let n = 1; n <= 10; n++) {
          const ik = IK(n);
          if (size) await ip.evaluate(([ik, w, h]) => { window.__board21.setRect(ik, { x: 300, y: 120, w, h }); window.__board21.focusWin(ik); }, [ik, ...size]);
          else await ip.evaluate(ik => { window.__board21.focusWin(ik); window.__board21.setMaximized(ik, true); }, ik);
          await ip.waitForTimeout(450);
          const g = await inkGaps(ik), look = LOOKS[(n - 1) % 5], k = `${label}, ${where}${g.tall ? ' (above and below)' : ''}`;
          if (val === 'standard' && size) sizesAt[where] = Math.min(sizesAt[where] || 999, await inFrame(() => parseFloat(document.querySelector('.versus-name').style.fontSize), ip, ik));
          const min = Math.min(g.L.gap, g.R.gap);
          worst[k] = Math.min(worst[k] === undefined ? 999 : worst[k], min);
          if (!(min >= (g.tall ? 10 : 8) && g.L.inside && g.R.inside && !g.mid)) tight.push(`${look} ${(n > 5 ? LONG.slice().reverse() : LONG).join('/')}, ${k} (${g.W}×${g.H}): ${g.L.gap} / ${g.R.gap} px${g.L.inside && g.R.inside ? '' : ', cut off'}${g.mid ? ', across the middle' : ''}`);
          if (!size) await ip.evaluate(ik => window.__board21.setMaximized(ik, false), ik);
          if (n === 1 && val === 'standard') await ip.screenshot({ path: OUT + `name-picker-versus-fit-${size ? size.join('x') : 'board'}.png` });
        }
      }
    }
    ok(!tight.length, `long names fit their side, at least 8 px clear of the emblem beside them and 10 px above and below it, in every look, both ways round, at 360 × 270, 540 × 400, filling the board, 360 × 480, and 300 × 400, in every Text style, and at 260 × 200, 400 × 400, 420 × 420, 400 × 460, 400 × 500, 300 × 520, 300 × 640, 540 × 460, and 900 × 700 (closest: ${JSON.stringify(worst)}${tight.length ? '; ' + tight.slice(0, 4).join(' | ') : ''})`);
    // Readable in a square or narrow window: a narrow, tall Name Picker beside the board's other windows.
    ok(sizesAt['400 × 400'] >= 14 && sizesAt['420 × 420'] >= 14 && sizesAt['300 × 520'] >= 20 && sizesAt['300 × 640'] >= 20,
      `long names stay readable in square and tall windows, in every look (smallest, px: ${JSON.stringify(sizesAt)})`);
    // A stage about square takes the names above and below the emblem too: a window a little wider than 360 × 480 keeps
    // them about as large, rather than a third the size.
    ok(sizesAt['400 × 500'] >= sizesAt['360 × 480'] * 0.85, `long names at 400 × 500 are about as large as at 360 × 480 (${sizesAt['400 × 500']} and ${sizesAt['360 × 480']} px)`);
    // From a square window up, a taller window never makes the names smaller. (In a wider one the emblem grows with the
    // stage's height, as the looks were designed, until it takes 38% of the width.)
    await letters('standard');
    const growth = [];
    for (const w of [300, 400]) for (let n = 1; n <= 5; n++) {
      const row = [];
      for (const h of [w, w * 1.3, w * 1.7, w * 2.1].map(Math.round)) {
        await ip.evaluate(([ik, w, h]) => { window.__board21.setRect(ik, { x: 300, y: 60, w, h }); window.__board21.focusWin(ik); }, [IK(n), w, h]);
        await ip.waitForTimeout(350);
        row.push([h, await inFrame(() => parseFloat(document.querySelector('.versus-name').style.fontSize), ip, IK(n))]);
      }
      if (row.some(([, f], i) => i && f < row[i - 1][1] * 0.97)) growth.push(`${LOOKS[n - 1]} at ${w} wide: ${row.map(([h, f]) => h + ':' + f).join(' ')}`);
    }
    ok(!growth.length, `in every look, from a square window up, a taller window never makes the names smaller, at 300 and 400 wide (${growth.slice(0, 2).join(' | ') || 'all 10'})`);
    // A window that looks square or a little taller than wide is tall, title bar and all. Long names go above and below
    // the emblem there in every look, where they're 1.8 to 3 times as large as beside it.
    const squareish = [], squareFs = {};
    for (const size of [[480, 500], [500, 500], [500, 520], [520, 540], [580, 580]]) for (let n = 1; n <= 5; n++) {
      await ip.evaluate(([ik, w, h]) => { window.__board21.setRect(ik, { x: 300, y: 60, w, h }); window.__board21.focusWin(ik); }, [IK(n), ...size]);
      await ip.waitForTimeout(350);
      const [tall, f] = await inFrame(() => [document.querySelector('.versus').classList.contains('versus-tall'), parseFloat(document.querySelector('.versus-name').style.fontSize)], ip, IK(n));
      const where = size.join(' × ');
      squareFs[where] = Math.min(squareFs[where] || 999, f);
      if (!tall) squareish.push(`${LOOKS[n - 1]} at ${where}: beside it, ${f} px`);
    }
    ok(!squareish.length, `in every look, long names go above and below the emblem at 480 × 500, 500 × 500, 500 × 520, 520 × 540, and 580 × 580 (${squareish.slice(0, 4).join(' | ') || 'smallest, px: ' + JSON.stringify(squareFs)})`);
    // A teacher drags a corner, 10 px at a time: long names never drop below half their size from one step to the next,
    // nor under 12 px from 1.5 times that. One width, 400, at heights from 380 to 540, one height, 460, at widths from 300
    // to 560, and a small window, 260 tall, at widths from 260 to 360. At 400 × 460 they are about as large as at 400 × 480.
    const drops = [], near = [], tiny = [];
    for (let n = 1; n <= 5; n++) {
      const at = async (w, h) => {
        await ip.evaluate(([ik, w, h]) => { window.__board21.setRect(ik, { x: 300, y: 60, w, h }); window.__board21.focusWin(ik); }, [IK(n), w, h]);
        await ip.waitForTimeout(250);
        return inFrame(() => parseFloat(document.querySelector('.versus-name').style.fontSize), ip, IK(n));
      };
      const paths = [[], [], []];
      for (let h = 380; h <= 540; h += 10) paths[0].push([400, h, await at(400, h)]);
      for (let w = 300; w <= 560; w += 10) paths[1].push([w, 460, await at(w, 460)]);
      for (let w = 260; w <= 360; w += 10) paths[2].push([w, 260, await at(w, 260)]);
      const step = (p, i) => `${LOOKS[n - 1]}: ${p[i - 1][0]} × ${p[i - 1][1]} ${p[i - 1][2]} px, ${p[i][0]} × ${p[i][1]} ${p[i][2]} px`;
      for (const p of paths) {
        const i = p.findIndex(([, , f], i) => i && Math.min(f, p[i - 1][2]) < Math.max(f, p[i - 1][2]) * 0.5);
        if (i > 0) drops.push(step(p, i));
        const j = p.findIndex(([, , f], i) => i && Math.min(f, p[i - 1][2]) < 12 && Math.max(f, p[i - 1][2]) >= Math.min(f, p[i - 1][2]) * 1.5);
        if (j > 0) tiny.push(step(p, j));
      }
      const f = h => paths[0].find(([, hh]) => hh === h)[2];
      if (!(f(460) >= f(480) * 0.8)) near.push(`${LOOKS[n - 1]}: ${f(460)} and ${f(480)} px`);
    }
    ok(!near.length, `in every look, long names at 400 × 460 are about as large as at 400 × 480 (${near.join(' | ') || 'all 5'})`);
    ok(!drops.length, `in every look, dragging a corner 10 px at a time, long names never drop below half their size from one step to the next (${drops.slice(0, 3).join(' | ') || 'all 5'})`);
    ok(!tiny.length, `in every look, dragging a corner 10 px at a time, long names never drop under 12 px from 1.5 times that, down to 260 × 260 (${tiny.slice(0, 3).join(' | ') || 'all 5'})`);
    // Dark theme: the slash goes dark, and every look draws its dark markup.
    await setTheme(ip, 'dark');
    await ip.waitForTimeout(400);
    const dk = await Promise.all(Array.from({ length: 5 }, (_, i) => vs(ip, IK(i + 1))));
    const cut = await inFrame(() => getComputedStyle(document.querySelector('.versus-cut')).backgroundColor, ip, IK(1));
    ok(cut === 'rgb(17, 24, 39)' && dk.every(clean), `dark theme: the slash is #111827, and every emblem is its look’s dark markup (${cut})`);
    // In dark theme a look may glow a little past its box. Names above and below the emblem stay 10 px clear of it still,
    // in a stage a little wider than tall, one just about square, and one just taller than wide.
    const darkTight = [], darkWorst = {};
    for (const size of [[400, 460], [400, 470], [360, 480]]) {
      const where = size.join(' × ');
      for (let n = 1; n <= 10; n++) {
        const ik = IK(n);
        await ip.evaluate(([ik, w, h]) => { window.__board21.setRect(ik, { x: 300, y: 120, w, h }); window.__board21.focusWin(ik); }, [ik, ...size]);
        await ip.waitForTimeout(450);
        const g = await inkGaps(ik), min = Math.min(g.L.gap, g.R.gap);
        darkWorst[where] = Math.min(darkWorst[where] === undefined ? 999 : darkWorst[where], min);
        if (!(g.tall && min >= 10 && g.L.inside && g.R.inside && !g.mid)) darkTight.push(`${LOOKS[(n - 1) % 5]} ${(n > 5 ? LONG.slice().reverse() : LONG).join('/')}, ${where}${g.tall ? '' : ' (side by side)'}: ${g.L.gap} / ${g.R.gap} px`);
      }
    }
    ok(!darkTight.length, `dark theme: long names above and below the emblem stay at least 10 px clear of it, in every look, both ways round, at 400 × 460, 400 × 470, and 360 × 480 (closest: ${JSON.stringify(darkWorst)}${darkTight.length ? '; ' + darkTight.slice(0, 4).join(' | ') : ''})`);
    // Early readers in dark theme is the tightest fit. Its letters reach deepest, and the emblems glow a little past their
    // boxes. One window of each layout.
    await letters('early');
    const earlyTight = [], earlyWorst = {};
    for (const [size, want] of [[[540, 400], 'side'], [[440, 440], 'tall']]) {
      const where = size.join(' × ');
      for (let n = 1; n <= 10; n++) {
        const ik = IK(n);
        await ip.evaluate(([ik, w, h]) => { window.__board21.setRect(ik, { x: 300, y: 120, w, h }); window.__board21.focusWin(ik); }, [ik, ...size]);
        await ip.waitForTimeout(450);
        const g = await inkGaps(ik), min = Math.min(g.L.gap, g.R.gap);
        earlyWorst[where] = Math.min(earlyWorst[where] === undefined ? 999 : earlyWorst[where], min);
        if (!((g.tall ? 'tall' : 'side') === want && min >= (g.tall ? 10 : 8) && g.L.inside && g.R.inside && !g.mid)) earlyTight.push(`${LOOKS[(n - 1) % 5]} ${(n > 5 ? LONG.slice().reverse() : LONG).join('/')}, ${where} ${g.tall ? '(above and below)' : '(beside)'}: ${g.L.gap} / ${g.R.gap} px`);
      }
    }
    await letters('standard');
    ok(!earlyTight.length, `dark theme, Early readers: long names stay 8 px clear of the emblem beside it at 540 × 400, and 10 px above and below it at 440 × 440, in every look, both ways round (closest: ${JSON.stringify(earlyWorst)}${earlyTight.length ? '; ' + earlyTight.slice(0, 4).join(' | ') : ''})`);
    // Wide windows keep the names beside the emblem, as designed, and so do short names in a wide window close to
    // square. A tall window puts them above and below it, in every look.
    const PAIRS = [['Mateo', 'Jamal'], ['Alexandria', 'Maximiliano'], ['Fatima', 'Ben']];
    const paired = (n, look, pair) => ({ widgetId: 'name-picker', instance: n, open: true, z: n, rect: { x: 10 + ((n - 1) % 5) * 250, y: 10 + Math.floor((n - 1) / 5) * 250, w: 360, h: 270 },
      data: { names: pair, left: null, picked: pair, pickId: 'mwp2g7b7-pl6ut' + n, versusLook: look }, config: { style: 'versus' } });
    const pfile = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Pairs' }, instances: PAIRS.flatMap((pair, p) => LOOKS.map((l, i) => paired(p * 5 + i + 1, l, pair))) };
    fs.writeFileSync(OUT + 'name-picker-versus-pairs.21board', JSON.stringify(pfile));
    await ip.setInputFiles('#import-input', OUT + 'name-picker-versus-pairs.21board'); await ip.waitForTimeout(300);
    await ip.click('#modal .btn:has-text("Replace this page")');
    ok(await eventually(async () => (await Promise.all(Array.from({ length: 15 }, (_, i) => vs(ip, IK(i + 1)).catch(() => null)))).every(x => x && x.names.length === 2), 15000), 'a board from a file opens with fifteen pickers, three pairs in every look');
    await ip.waitForTimeout(600);
    const placed = [];
    for (const [size, p, want] of [[[540, 400], 0, 'side'], [[540, 400], 1, 'side'], [[360, 270], 1, 'side'], [null, 0, 'side'], [[900, 700], 2, 'side'], [[720, 660], 0, 'side'], [[400, 460], 0, 'tall']]) {
      for (let i = 0; i < 5; i++) {
        const ik = IK(p * 5 + i + 1);
        if (size) await ip.evaluate(([ik, w, h]) => { window.__board21.setRect(ik, { x: 20, y: 20, w, h }); window.__board21.focusWin(ik); }, [ik, ...size]);
        else await ip.evaluate(ik => { window.__board21.focusWin(ik); window.__board21.setMaximized(ik, true); }, ik);
        await ip.waitForTimeout(350);
        const tall = await inFrame(() => document.querySelector('.versus').classList.contains('versus-tall'), ip, ik);
        if ((tall ? 'tall' : 'side') !== want) placed.push(`${LOOKS[i]} ${PAIRS[p].join('/')} at ${size ? size.join(' × ') : 'filling the board'}: ${tall ? 'above and below' : 'beside'}`);
        if (!size) await ip.evaluate(ik => window.__board21.setMaximized(ik, false), ik);
      }
    }
    ok(!placed.length, `in every look, names stay beside the emblem at 540 × 400 (Mateo/Jamal and Alexandria/Maximiliano), 360 × 270 (Alexandria/Maximiliano), filling the board (Mateo/Jamal), 900 × 700 (Fatima/Ben), and 720 × 660 (Mateo/Jamal), and go above and below it at 400 × 460 (Mateo/Jamal) (${placed.slice(0, 4).join(' | ') || 'all 35'})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ictx.close();

    // ---- The docs: what the Name Picker saves, and what it does.
    const dataDoc = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-FORMAT.md'), 'utf8').replace(/\s+/g, ' ');
    ok(/saves `\{ names, [^}]*versusLook[^}]*\}`/.test(dataDoc) && /`versusLook` is /.test(dataDoc) && /`style` is [^.]*`"versus"`/.test(dataDoc), 'docs/DATA-FORMAT.md gives versusLook and the style');
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    ok(readme.includes('Versus'), 'README.md names Versus');
  }],
  // ---- Name Picker style suite: Spinning wheel
  ['Name Picker: Spinning wheel', async (browser) => {
    // Counts, in every frame, the sounds a page starts (AudioContexts), the notes it plays, and the timers and animation
    // frames it asks for.
    const AUDIO_SPY = () => {
      window.__calls = 0;
      for (const fn of ['setTimeout', 'setInterval', 'requestAnimationFrame']) { const f = window[fn]; window[fn] = function () { window.__calls++; return f.apply(this, arguments); }; }
      if (!window.AudioContext) return;
      window.__audio = 0; window.__notes = 0;
      const A = window.AudioContext, base = (window.BaseAudioContext || A).prototype;
      window.AudioContext = class extends A { constructor(o) { super(o); window.__audio++; } };
      for (const fn of ['createOscillator', 'createBufferSource']) { const f = base[fn]; base[fn] = function () { window.__notes++; return f.apply(this, arguments); }; }
    };
    const errors = [];
    const watch = (p, tab) => { p.on('pageerror', e => errors.push(`[${tab}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errors.push(`[${tab} console] ${m.text()}`); }); };
    const IK = 'name-picker:1';
    const np = (p, ik = IK) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const saved = (p, ik = IK) => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const conf = (p, ik = IK) => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const menu = (p, id, ik = IK) => choose(p, ik, id);
    const showing = (p, ik) => np(p, ik).locator('body').evaluate(b => b.classList.contains('showing'));
    const idle = (p, ik) => eventually(async () => !(await showing(p, ik)), 12000);
    const inFrame = (p, fn, arg, ik) => np(p, ik).locator('html').evaluate(fn, arg);
    const setNames = async (p, names) => { await menu(p, 'edit'); await np(p).locator('#list').fill(names.join('\n')); await np(p).locator('#done').click(); await p.waitForTimeout(300); };
    // The wheel as it is now (its own report, see style-wheel.js), with what the banner says and where things are on the stage.
    const look = (p, ik) => inFrame(p, () => {
      const root = document.querySelector('.style-root[data-style="wheel"]');
      if (!root || !root._wheel) return null;
      const w = root._wheel(), st = document.getElementById('stage').getBoundingClientRect();
      const rel = el => { const r = el.getBoundingClientRect(); return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height }; };
      const banner = root.querySelector('.wheel-banner'), box = root.querySelector('.wheel-fitbox'), fit = root.querySelector('.wheel-fit'), hub = root.querySelector('.wheel-hub');
      return Object.assign(w, { W: st.width, H: st.height,
        banner: [...root.querySelectorAll('.wheel-banner .wheel-nm')].map(e => e.textContent),
        nums: [...root.querySelectorAll('.wheel-banner .wheel-num')].map(e => e.textContent).join(),
        note: (root.querySelector('.wheel-note') || {}).textContent || '',
        shown: banner.classList.contains('wheel-show') && getComputedStyle(banner).visibility === 'visible',
        bannerBox: rel(banner), hubBox: rel(hub), hubShown: !hub.hidden,
        fits: fit.scrollWidth <= box.clientWidth + 1 && fit.offsetHeight <= box.clientHeight + 1,
        bannerPx: parseFloat(getComputedStyle(box).fontSize), faded: root.querySelector('.wheel').classList.contains('wheel-fade'),
        fonts: [banner, hub].map(e => getComputedStyle(e).fontFamily) });
    }, undefined, ik);
    // It landed on the saved pick: the arrows point at the winners (left to right in pick order, each student once), the
    // banner lists them (numbered when there are several), and nothing moves.
    const landed = (w, st) => !!w && !w.spinning && !w.raf && w.under.length === st.picked.length && new Set(w.under).size === w.under.length
      && w.under.every((i, k) => st.names[i] === st.picked[k]) && JSON.stringify(w.banner) === JSON.stringify(st.picked)
      && w.nums === (st.picked.length > 1 ? st.picked.map((_, k) => k + 1).join() : '') && w.shown;
    const said = w => w ? `arrows ${w.under.join('/')}, banner ${w.banner.join('/')}${w.spinning ? ', still spinning' : ''}` : 'no wheel';
    // What can't be seen: an arrow (its numbered pivot, or its tip) cut off by the edge of the stage or under the banner,
    // or SPIN covered. '' when everything can be seen.
    const unseen = w => {
      const b = w.bannerBox, h = w.hubBox, r = Math.max(7, w.R * 0.064), out = [];
      const gap = (x, y) => Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h));
      w.arrows.forEach((a, k) => {
        const x = w.cx + Math.cos(a) * w.R * 1.07, y = w.cy + Math.sin(a) * w.R * 1.07, tx = w.cx + Math.cos(a) * w.R * 0.91, ty = w.cy + Math.sin(a) * w.R * 0.91;
        if (x - r < -1 || y - r < -1 || x + r > w.W + 1 || y + r > w.H + 1) out.push(`arrow ${k + 1} is cut off by the edge`);
        else if (gap(x, y) < r - 1 || gap(tx, ty) < 1) out.push(`arrow ${k + 1} is under the banner`);
      });
      if (!w.hubShown || (b.x < h.x + h.w - 1 && h.x < b.x + b.w - 1 && b.y < h.y + h.h - 1 && h.y < b.y + b.h - 1)) out.push('SPIN is covered');
      return out.join(', ');
    };
    // Taps Pick (or SPIN) and answers the pick once the board has it, with when the tap was.
    const pick = async (p, on = '#go', ik = IK) => {
      const was = ((await saved(p, ik)) || {}).pickId, t0 = Date.now();
      await np(p, ik).locator(on).click();
      await eventually(async () => ((await saved(p, ik)) || {}).pickId !== was, 3000);
      return { st: await saved(p, ik), t0 };
    };

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(AUDIO_SPY);
    const page = await ctx.newPage(); watch(page, 'tab 1');
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('name-picker'));
    ok(await eventually(async () => ((await conf(page)) || {}).style === 'wheel') && await eventually(async () => !!(await look(page))), 'a new Name Picker is the Spinning wheel');
    await page.evaluate(ik => window.__board21.setRect(ik, { x: 300, y: 60, w: 640, h: 460 }), IK);
    const EIGHT = ['Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Ethan', 'Sofia', 'Liam'];
    await np(page).locator('#list').fill(EIGHT.join('\n')); await np(page).locator('#done').click(); await page.waitForTimeout(300);
    let w = await look(page), st;
    ok(w.wheel.length === 8 && w.under.length === 1 && w.labels.shown === 8 && w.hub === 'SPIN' && !w.shown && !w.spinning && !w.raf,
      `before the first pick: the 8 names on the wheel, one arrow, SPIN in the middle, no banner (${w.wheel.length} names, ${w.under.length} arrow, ${w.labels.shown} labels, “${w.hub}”)`);

    // ---- One winner, No repeats, Quick: every pick lands on the saved winner, until everyone has been picked.
    await menu(page, 'quick');
    let bad = [], times = [];
    for (let k = 0; k < 8; k++) {
      const inDraw = ((await saved(page)).left || EIGHT).slice().sort().join();
      const p = await pick(page, k % 2 ? '.wheel-hub' : '#go');
      await idle(page); times.push(Date.now() - p.t0);
      w = await look(page);
      if (!landed(w, p.st)) bad.push(`pick ${k + 1}: saved ${p.st.picked}, ${said(w)}`);
      else if (w.wheel.length === 1 && !(w.aim[0] < 0.25)) bad.push(`pick ${k + 1}: the last name stopped ${Math.round(w.aim[0] * 57.3)}° from the arrow`);
      if (w.wheel.map(i => p.st.names[i]).sort().join() !== inDraw) bad.push(`pick ${k + 1}: the wheel had ${w.wheel.length} names, not the ${inDraw.split(',').length} in the draw`);
    }
    ok(!bad.length, `1 winner, No repeats: 8 picks (SPIN or the main button) land on exactly the saved winner, and the wheel holds just the names still in the draw${bad.length ? ': ' + bad.join(' | ') : ''}`);
    ok(times.every(t => t > 1000 && t < 2400), `with Quick each spin takes about 1½ s (${times.join(', ')} ms)`);
    st = await saved(page); w = await look(page);
    ok(!st.left.length && w.hub === 'Start over' && w.note === 'Everyone has been picked' && await np(page).locator('#go').textContent() === 'Start over',
      `after everyone has been picked, SPIN reads “Start over” and the banner says “Everyone has been picked” (“${w.hub}”, “${w.note}”)`);
    await np(page).locator('.wheel-hub').click(); await page.waitForTimeout(300);
    st = await saved(page); w = await look(page);
    ok(st.left.length === 8 && !st.picked.length && w.wheel.length === 8 && !w.shown && w.hub === 'SPIN' && w.labels.shown === 8, 'a tap on it starts over: all 8 names back on the wheel, no banner');

    // ---- The last student of a round is spun on a wheel of one name: it stops with that name at the arrow (3 o'clock),
    // reading left to right, not anywhere round the wheel.
    await setNames(page, ['Ava', 'Leo']);
    bad = [];
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 2; k++) {
        const p = await pick(page); await idle(page);
        w = await look(page);
        if (!landed(w, p.st)) bad.push(`round ${r + 1}, pick ${k + 1}: saved ${p.st.picked}, ${said(w)}`);
        else if (w.wheel.length === 1 && !(w.aim[0] < 0.25)) bad.push(`round ${r + 1}: ${p.st.picked[0]} stopped ${Math.round(w.aim[0] * 57.3)}° from the arrow`);
      }
      await np(page).locator('#go').click(); await page.waitForTimeout(300);   // (“Start over”)
    }
    ok(!bad.length, `a wheel of one name (the last of a round) stops with the name at the arrow${bad.length ? ': ' + bad.join(' | ') : ''}`);

    // ---- Five winners at a time: one spin, five numbered arrows, rounds of 5, 5 and the last 2; then Start over and
    // again, skipping each show with a tap on the stage.
    const TWELVE = EIGHT.concat(['Amara', 'Kenji', 'Diego', 'Fatima']);
    await setNames(page, TWELVE);
    await menu(page, 'winners:5');
    w = await look(page);
    ok(w.under.length === 5 && w.hub === 'SPIN× 5' && await np(page).locator('#go').textContent() === 'Pick 5', `5 winners: five arrows before the spin, SPIN says “× 5”, the button “Pick 5” (${w.under.length} arrows)`);
    bad = [];
    for (const skip of [false, true]) {
      for (const n of [5, 5, 2]) {
        const inDraw = (await saved(page)).left.slice().sort().join();
        const p = await pick(page);
        if (skip) {
          await page.waitForTimeout(700);
          await np(page).locator('#stage').click({ position: { x: 8, y: 8 } });
          await page.waitForTimeout(120);
          if (await showing(page)) bad.push('a tap on the stage didn’t end the show');
        } else await idle(page);
        w = await look(page);
        if (p.st.picked.length !== n || !landed(w, p.st)) bad.push(`${skip ? 'skipped ' : ''}pick of ${n}: saved ${p.st.picked}, ${said(w)}`);
        if (w.wheel.map(i => p.st.names[i]).sort().join() !== inDraw) bad.push(`pick of ${n}: the wheel isn’t the names in the draw`);
      }
      w = await look(page);
      if (w.hub !== 'Start over' || w.under.length !== 2) bad.push(`after the round: SPIN “${w.hub}”, ${w.under.length} arrows`);
      await menu(page, 'round');
      w = await look(page);
      if (w.wheel.length !== 12 || w.shown || w.under.length !== 5) bad.push(`Start over: ${w.wheel.length} names, ${w.under.length} arrows`);
    }
    ok(!bad.length, `5 winners, No repeats: two rounds (5, 5, the last 2), played to the end and skipped with a tap, land on exactly the saved winners, arrows 1-5 in pick order${bad.length ? ': ' + bad.join(' | ') : ''}`);

    // ---- Fewer names on the wheel than 2 × winners − 1 (the last picks of a No repeats round, or fewer names than
    // winners): the numbered arrows go all round the wheel, so the banner moves beside it. Every arrow can be seen,
    // during the spin and after it, and the banner lists them 1, 2, 3 in arrow order.
    const TWENTY4 = TWELVE.concat(['Olivia', 'Lucas', 'Chloé', 'Mateo', 'Priya', 'Yusuf', 'Hana', 'Omar', 'Isla', 'Jack', 'Nora', 'Ravi']);
    bad = [];
    const layouts = [];
    for (const [names, picks] of [[TWENTY4, [5, 5, 5, 5, 4]], [TWELVE.slice(0, 7), [5, 2]], [TWELVE.slice(0, 3), [3]]]) {
      await setNames(page, names);
      if ((await saved(page)).left.length < names.length) await menu(page, 'round');
      for (const n of picks) {
        const K = (await saved(page)).left.length, ring = n > 1 && Math.floor(K / 2) < n - 1;
        const p = await pick(page);
        await page.waitForTimeout(500);
        const mid = await look(page);
        await idle(page);
        w = await look(page);
        const where = `${names.length} names, ${n} of ${K}`;
        layouts.push(`${n} of ${K}: ${w.where}`);
        if (p.st.picked.length !== n || !landed(w, p.st)) bad.push(`${where}: saved ${p.st.picked}, ${said(w)}`);
        if (mid.spinning && unseen(mid)) bad.push(`${where}, spinning: ${unseen(mid)}`);
        if (unseen(w)) bad.push(`${where}: ${unseen(w)}`);
        if (w.where !== (ring ? 'beside' : 'over')) bad.push(`${where}: the banner is ${w.where} the wheel`);
      }
    }
    ok(!bad.length, `the last few names of a round, and fewer names than winners: every numbered arrow can be seen, with the banner beside the wheel (${layouts.join('; ')})${bad.length ? ': ' + bad.join(' | ') : ''}`);
    await setNames(page, TWELVE); await menu(page, 'round');

    // ---- The same with No repeats off: the whole class is on the wheel every time.
    await menu(page, 'norepeat');
    bad = [];
    for (const n of [5, 1, 3]) {
      await menu(page, 'winners:' + n);
      for (let k = 0; k < 3; k++) {
        const p = await pick(page); await page.waitForTimeout(650); await np(page).locator('#go').click(); await page.waitForTimeout(120);
        w = await look(page);
        if (!landed(w, p.st) || w.wheel.length !== 12) bad.push(`${n}: saved ${p.st.picked}, ${said(w)}, ${w.wheel.length} on the wheel`);
      }
    }
    ok(!bad.length, `No repeats off: 1, 3 and 5 winners land on the saved winners, with all 12 names on the wheel each time${bad.length ? ': ' + bad.join(' | ') : ''}`);
    await menu(page, 'norepeat');

    // ---- A double tap on SPIN picks once; a tap on the wheel itself picks nothing; the window moves by the wheel.
    st = await saved(page);
    await np(page).locator('.wheel-hub').click(); await np(page).locator('.wheel-hub').click();
    await idle(page);
    let st2 = await saved(page);
    ok(st2.pickId !== st.pickId && st2.left.length === st.left.length - 3, `a double tap on SPIN picks once (${st.left.length} → ${st2.left.length} left)`);
    w = await look(page);
    const sb = await np(page).locator('#stage').boundingBox(), x = sb.x + w.cx - w.R * 0.55, y = sb.y + w.cy - w.R * 0.35;
    await page.mouse.click(x, y); await page.waitForTimeout(400);
    ok((await saved(page)).pickId === st2.pickId && !(await showing(page)), 'a tap on the wheel picture (not SPIN) picks nothing');
    const r0 = await page.evaluate(ik => window.__board21.state.insts.get(ik).rect, IK);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 30, y + 10, { steps: 4 }); await page.mouse.move(x - 70, y + 25, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const r1 = await page.evaluate(ik => window.__board21.state.insts.get(ik).rect, IK);
    ok(r1.x < r0.x - 40 && (await saved(page)).pickId === st2.pickId, `the window can be dragged by the wheel picture (moved ${Math.round(r1.x - r0.x)}, ${Math.round(r1.y - r0.y)})`);

    // ---- Enter held down on the main button, or on SPIN after a tap there, picks once: the key's repeats don't pick,
    // skip and pick again (a presenter remote or a key held a moment too long).
    const cdp = await ctx.newCDPSession(page);
    const holdEnter = async () => {
      const ev = (type, again) => cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, autoRepeat: !!again,
        text: type === 'keyUp' ? undefined : '\r', unmodifiedText: type === 'keyUp' ? undefined : '\r' });
      await ev('keyDown');
      for (let i = 0; i < 45; i++) { await page.waitForTimeout(33); await ev('keyDown', true); }
      await ev('keyUp');
    };
    const countPicks = () => inFrame(page, () => { window.__picks = []; const save = Board21.save; Board21.save = d => { window.__picks.push(d && d.pickId); return save.call(Board21, d); }; });
    const picksMade = () => inFrame(page, () => new Set(window.__picks).size);
    await countPicks();
    await np(page).locator('#go').focus(); await holdEnter();
    const heldGo = await picksMade();
    await idle(page); await page.waitForTimeout(300);
    await countPicks();
    await np(page).locator('.wheel-hub').click(); await holdEnter();
    const heldHub = await picksMade();
    await idle(page);
    ok(heldGo === 1 && heldHub === 1, `Enter held down for 1½ s picks once, on the main button (${heldGo} picks) and on SPIN after a tap (${heldHub})`);

    // ---- A normal spin: about 4 seconds; with Sound on, the clicker and a chime; nothing runs between picks.
    await menu(page, 'round'); await menu(page, 'quick'); await menu(page, 'sound');
    bad = []; times = [];
    let notes = 0, clicks = 0;
    for (const n of [1, 5]) {
      await menu(page, 'winners:' + n);
      await idle(page); await page.waitForTimeout(400);
      const n0 = await inFrame(page, () => window.__notes);
      const p = await pick(page);
      await idle(page); times.push(Date.now() - p.t0);
      w = await look(page);
      if (!landed(w, p.st)) bad.push(`${n}: saved ${p.st.picked}, ${said(w)}`);
      notes = await inFrame(page, () => window.__notes) - n0;
      clicks = Math.round((notes - 3) / 2);   // (a click is two notes; the chime three)
      if (clicks < 15 || clicks / (times[times.length - 1] / 1000) > 32) bad.push(`${n}: ${clicks} clicks in ${times[times.length - 1]} ms`);
    }
    ok(!bad.length && times.every(t => t > 3600 && t < 5300), `a normal spin, with 1 or 5 winners, takes about 4 s and lands on the winners (${times.join(', ')} ms)${bad.length ? ': ' + bad.join(' | ') : ''}`);
    ok(!bad.length && clicks >= 15, `with Sound on, the wheel clicks as the pegs pass (${clicks} clicks, at most about 30 a second) and a chime ends the spin`);
    await page.waitForTimeout(300);
    const c0 = await inFrame(page, () => window.__calls);
    await page.waitForTimeout(1500);
    ok(await inFrame(page, () => window.__calls) === c0, `nothing runs between picks: no timers or animation frames (${await inFrame(page, () => window.__calls) - c0})`);
    await menu(page, 'sound'); await menu(page, 'quick');

    // ---- Another tab shows the same spin and lands on the same winners; after a reload the result is there at once.
    await menu(page, 'winners:3');
    const page2 = await ctx.newPage(); watch(page2, 'tab 2');
    await page2.goto(BASE); await boardUp(page2); await freeBoard(page2);
    await eventually(async () => !!(await look(page2)));
    const p3 = await pick(page);
    ok(await eventually(() => showing(page2), 1500), 'a pick in one tab spins the wheel in the other tab too');
    await idle(page); await idle(page2);
    const w1 = await look(page), w2 = await look(page2);
    ok(landed(w1, p3.st) && landed(w2, p3.st), `both tabs land on the same 3 winners, in the same order (${p3.st.picked}; tab 2: ${said(w2)})`);
    await page2.reload(); await boardUp(page2);
    ok(await eventually(async () => landed(await look(page2), p3.st)) && !(await showing(page2)), 'after a reload the wheel shows the result at once, with no spin');
    const p4 = await pick(page); await page.waitForTimeout(500);
    await page.reload(); await boardUp(page);
    ok(await eventually(async () => landed(await look(page), p4.st)) && !(await showing(page)) && !(await look(page)).raf, `a reload during the spin shows its result (${p4.st.picked})`);
    await page2.close();

    // ---- Settings → Size 150%: the board draws the window half as big again (it tells the window its zoom), and the
    // wheel has the pixels for that, so the names on its slices stay as sharp as SPIN and the banner.
    const sharp = () => inFrame(page, () => { const c = document.querySelector('.wheel-canvas'); return { zoom: Board21.context.window.zoom, px: c.width / c.getBoundingClientRect().width }; });
    await page.evaluate(() => window.__board21.setBoardScale(1.5));
    ok(await eventually(async () => { const z = await sharp(); return z.zoom === 1.5 && Math.abs(z.px - 1.5) < 0.02; }, 4000), `with Size 150% the wheel is drawn with 1.5 pixels for each of its own (${JSON.stringify(await sharp())})`);
    await page.evaluate(() => window.__board21.setBoardScale(1));
    ok(await eventually(async () => { const z = await sharp(); return z.zoom === 1 && Math.abs(z.px - 1) < 0.02; }, 4000), `and with Size 100% again, 1 (${JSON.stringify(await sharp())})`);

    // ---- Sizes: 260×200, 420×320 and maximised at 1366×768 and 1920×1080, with 1, 3, 24, 30 and 45 names and very
    // long names. The wheel, SPIN and the banner fit; the banner never covers SPIN or an arrow at 3 or 9 o'clock.
    const CLASS = ['Ava', 'Mateo', 'Sofia', 'Liam', 'Amara', 'Noah', 'Isabella', 'Kenji', 'Zoe', 'Elijah', 'Priya', 'Lucas', 'Mia', 'Oluwaseun', 'Harper', 'Diego',
      'Chloe', 'Ethan', 'Anne-Sophie', 'Leo', 'Fatima', 'Owen', 'Grace', 'Maximiliano', 'Yusuf', 'Hannah', 'Mohammed', 'Valentina', 'Theo', 'Siobhan',
      'Aria', 'Kai', 'Nora', 'Omar', 'Lily', 'Jonah', 'Ruby', 'Felix', 'Iris', 'Hugo', 'Maya', 'Arjun', 'Elena', 'Tariq', 'Wren'];
    const LONG = ['Maximiliana-Guadalupe Fernández', 'Christopher-James Montgomery', 'Bartholomew-Alexander', 'Jo', 'Anne-Sophie', 'Oluwaseun', 'Wolfgang Amadeus', 'Alexandria'];
    const LISTS = [['1 name', ['Ava']], ['3 names', ['Ava', 'Leo', 'Mia']], ['24 names', CLASS.slice(0, 24)], ['30 names', CLASS.slice(0, 30)], ['45 names', CLASS], ['long names', LONG]];
    // A list and a pick as if they came from another copy a while ago: no spin, the winners are shown at once.
    const showList = (p, names, n) => p.evaluate(([ik, names, n]) => window.__board21.state.wins.get(ik).post('data', { data: { names, left: names.slice(n),
      picked: names.slice(0, n), pickId: '1-' + Math.random().toString(36).slice(2, 8), current: names[0] }, reason: 'remote' }), [IK, names, n]);
    const fitting = async (p, size, want) => {
      const bad = [], seen = [];
      for (const [what, names] of LISTS) for (const n of [1, 3]) {
        if (n > names.length) continue;
        await showList(p, names, n); await p.waitForTimeout(350);
        const w = await look(p), where = `${what}, ${n} winner${n > 1 ? 's' : ''}`, b = w.bannerBox, h = w.hubBox;
        if (w.cx - 1.14 * w.R < -1 || w.cx + 1.14 * w.R > w.W + 1 || w.cy - 1.14 * w.R < -1 || w.cy + 1.035 * w.R > w.H + 1) bad.push(`${where}: the wheel sticks out`);
        if (b.x < -1 || b.y < -1 || b.x + b.w > w.W + 1 || b.y + b.h > w.H + 1) bad.push(`${where}: the banner sticks out`);
        if (unseen(w)) bad.push(`${where}: ${unseen(w)}`);
        if (!w.fits || JSON.stringify(w.banner) !== JSON.stringify(names.slice(0, n))) bad.push(`${where}: the banner doesn’t show the whole names (${w.banner.join('/')})`);
        if (w.under.map(i => names[i]).join('|') !== names.slice(0, n).join('|')) bad.push(`${where}: the arrows point at ${w.under.map(i => names[i])}`);
        if (w.labels.shown && w.labels.min < 7.99) bad.push(`${where}: names on the slices at ${w.labels.min.toFixed(1)} px`);
        const wrong = want(what, n, w);
        if (wrong) bad.push(`${where}: ${wrong}`);
        if (n === 1 || what === '45 names') seen.push(`${what} ${n}: banner ${Math.round(w.bannerPx)} px, slices ${w.labels.shown ? Math.round(w.labels.min) + (w.labels.max - w.labels.min > 1 ? '-' + Math.round(w.labels.max) : '') + ' px' : 'colour only'}`);
      }
      ok(!bad.length, `${size}: the wheel, SPIN and the banner fit and the names read (${seen.join('; ')})${bad.length ? ': ' + bad.join(' | ') : ''}`);
    };
    const setSize = async (p, rect) => { await p.evaluate(([ik, r]) => { const b = window.__board21; if (r) { b.setMaximized(ik, false); b.setRect(ik, r); } else b.setMaximized(ik, true); }, [IK, rect]); await p.waitForTimeout(500); };
    await setSize(page, { x: 300, y: 60, w: 260, h: 200 });
    await fitting(page, '260×200', (what, n, w) => (w.bannerPx < (what === 'long names' ? 8 : n === 1 ? 20 : 12) ? `banner names at ${w.bannerPx} px` : '')
      || (/^[13] name/.test(what) && w.labels.shown !== w.wheel.length ? 'a few names aren’t written on the wheel' : ''));
    await setSize(page, { x: 300, y: 60, w: 420, h: 320 });
    await fitting(page, '420×320', (what, n, w) => (w.bannerPx < (what === 'long names' ? 10 : n === 1 ? 30 : 16) ? `banner names at ${w.bannerPx} px` : '')
      || (/^(1|3|24|30) name/.test(what) && w.labels.shown !== w.wheel.length ? `${what} aren’t all written on the wheel` : '')
      || (what === '45 names' && w.labels.shown ? '45 names in a small window should be colour only' : '')
      || (what === 'long names' && !w.labels.cut ? 'very long names should be shortened on the slices' : ''));
    // A long full name that would be small on one line goes onto two at a space; a name with no space too long for
    // any line breaks anywhere rather than being cut off.
    await showList(page, ['Siddharthanarayanan Venkataramanaswamy'].concat(EIGHT), 1); await page.waitForTimeout(350);
    const twoLines = await look(page);
    await showList(page, ['Bartholomew'.repeat(9), 'Ava', 'Leo'].concat(EIGHT), 3); await page.waitForTimeout(350);
    const noSpace = await look(page);
    ok(twoLines.fits && twoLines.bannerPx >= 20 && noSpace.fits && twoLines.banner[0] === 'Siddharthanarayanan Venkataramanaswamy' && noSpace.banner[0] === 'Bartholomew'.repeat(9),
      `420×320: a long full name in the banner goes onto two lines, at ${twoLines.bannerPx} px, and a 99-letter name with no space fits (${noSpace.fits ? 'yes' : 'no'}, ${noSpace.bannerPx} px)`);
    await setSize(page, { x: 300, y: 60, w: 300, h: 560 });
    await fitting(page, 'a tall window, 300×560', (what, n, w) => (w.bannerBox.y < w.cy + w.R ? 'the banner should be under the wheel' : '')
      || (w.bannerPx < (what === 'long names' ? 8 : n === 1 ? 24 : 14) ? `banner names at ${w.bannerPx} px` : ''));
    await setSize(page, null);
    await fitting(page, 'maximised at 1366×768', (what, n, w) => (w.bannerPx < (what === 'long names' ? 30 : n === 1 ? 80 : 50) ? `banner names at ${w.bannerPx} px` : '')
      || (w.labels.shown !== w.wheel.length ? `${what} aren’t all written on the wheel` : '')
      || (what === '24 names' && w.labels.min < 18 ? `24 names at ${w.labels.min.toFixed(1)} px` : '')
      || (what === '45 names' && w.labels.min < 11 ? `45 names at ${w.labels.min.toFixed(1)} px` : ''));
    await page.screenshot({ path: OUT + 'name-picker-wheel-maximised.png' });
    // Names shortened on the slices lose whole letters: never half an emoji (a broken-character box), or part of a
    // family emoji, or a space before the “…”.
    await inFrame(page, () => { const c = CanvasRenderingContext2D.prototype, fill = c.fillText; window.__cut = []; c.fillText = function (t) { if (/…$/.test(t)) window.__cut.push(String(t)); return fill.apply(this, arguments); }; });
    const EMOJI = ['Ava', '🦄🦄🦄🦄🦄🦄🦄🦄🦄🦄 Ana', 'Mia 👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦 Rose', 'Leo', 'Noah', 'Sofía', 'José', 'Zoe', 'Kai', 'Ethan'];
    const cuts = [];
    for (const size of [null, { x: 300, y: 60, w: 260, h: 200 }]) {
      await setSize(page, size);
      await showList(page, EMOJI, 0); await page.waitForTimeout(350);
      cuts.push(...await inFrame(page, (html, names) => {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }), bad = [];
        for (const t of new Set(window.__cut)) {
          const cut = t.slice(0, -1), name = names.find(n => n.startsWith(cut)), parts = name ? Array.from(seg.segment(name), x => x.segment) : [];
          const whole = parts.some((_, j) => parts.slice(0, j + 1).join('') === cut);
          if (!name || !whole || /[\ud800-\udbff]$|[\s\u200d\ufe0f]$/.test(cut)) bad.push(JSON.stringify(t));
        }
        window.__cut = [];
        return bad;
      }, EMOJI));
    }
    ok(!cuts.length, `names with emoji are shortened on the slices a whole letter at a time${cuts.length ? ': ' + cuts.join(', ') : ''}`);
    await setSize(page, null);

    // ---- Dark theme: the wheel is drawn in the dark colours (the slices, the middle, the banner).
    const pixels = p => inFrame(p, () => {
      const root = document.querySelector('.style-root[data-style="wheel"]'), c = root.querySelector('.wheel-canvas'), w = root._wheel(), g = c.getContext('2d');
      const k = c.width / c.getBoundingClientRect().width, cx = (w.cx - parseFloat(c.style.left)) * k, cy = (w.cy - parseFloat(c.style.top)) * k;
      const at = (r, a) => Array.from(g.getImageData(Math.round(cx + r * k * w.R * Math.cos(a)), Math.round(cy + r * k * w.R * Math.sin(a)), 1, 1).data.slice(0, 3));
      return { middle: at(0, 0), slice: at(0.6, Math.PI / 12) };
    });
    const near = (a, hex) => { const b = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return a.every((v, i) => Math.abs(v - b[i]) <= 4); };
    await showList(page, EIGHT, 0); await page.waitForTimeout(300);
    let px = await pixels(page);
    ok(near(px.middle, '#ffffff') && near(px.slice, '#fca5a5'), `light theme: the slices and the middle in the light colours (${px.slice}, ${px.middle})`);
    await setTheme(page, 'dark');
    await eventually(async () => (await inFrame(page, () => document.documentElement.dataset.b21Theme)) === 'dark');
    await page.waitForTimeout(300);
    px = await pixels(page);
    await showList(page, EIGHT, 3); await page.waitForTimeout(300);
    const dark = await inFrame(page, () => { const b = document.querySelector('.wheel-banner'), n = b.querySelector('.wheel-nm'); return [getComputedStyle(b).backgroundColor, getComputedStyle(n).color]; });
    ok(near(px.middle, '#1e1e1e') && near(px.slice, '#f87171') && dark[0] === 'rgb(30, 30, 30)' && dark[1] === 'rgb(249, 250, 251)',
      `dark theme: the wheel is drawn again in the dark colours, and the banner is dark with light names (${px.slice}, ${px.middle}; ${dark.join(', ')})`);
    await page.screenshot({ path: OUT + 'name-picker-wheel-dark.png' });

    // ---- Settings → Text style → Easier to read: the names on the slices, the banner and SPIN are in those letters.
    await setSize(page, { x: 300, y: 60, w: 640, h: 460 });
    await showList(page, CLASS.slice(0, 12), 1); await page.waitForTimeout(300);
    await inFrame(page, () => {
      const c = CanvasRenderingContext2D.prototype, fill = c.fillText;
      window.__drawn = []; window.__fontsIn = 0;
      c.fillText = function () { window.__drawn.push({ font: this.font, at: performance.now() }); return fill.apply(this, arguments); };
      document.fonts.addEventListener('loadingdone', () => { window.__fontsIn = performance.now(); });
    });
    await openSettings(page, ['letters']);
    await page.click('#settings [data-act="letters"][data-val="legible"]'); await page.keyboard.press('Escape');
    const FAM = '"Atkinson Hyperlegible"';
    ok(await eventually(async () => {
      const w = await look(page);
      const drawn = await inFrame(page, (html, fam) => window.__fontsIn > 0 && window.__drawn.some(d => d.at >= window.__fontsIn && d.font.includes(fam) && /^(700|bold) /.test(d.font)), FAM);
      return w.font.startsWith(FAM) && w.fonts.every(f => f.startsWith(FAM)) && drawn;
    }, 10000), `Easier to read letters reach the wheel: the names on the slices are drawn again in them once loaded, and the banner and SPIN use them (${(await look(page)).fonts.join(' | ')})`);
    if (errors.length) ok(false, 'no page or console errors: ' + errors.join(' | '));
    errors.length = 0;
    await ctx.close();

    // ---- Maximised at 1920×1080.
    const big = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const bp = await big.newPage(); watch(bp, '1920×1080');
    await bp.goto(BASE); await boardUp(bp); await freeBoard(bp);
    await bp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(bp)) || {}).style === 'wheel');
    await np(bp).locator('#list').fill(EIGHT.join('\n')); await np(bp).locator('#done').click();
    await setSize(bp, null);
    await fitting(bp, 'maximised at 1920×1080', (what, n, w) => (w.bannerPx < (what === 'long names' ? 40 : n === 1 ? 110 : 70) ? `banner names at ${w.bannerPx} px` : '')
      || (w.labels.shown !== w.wheel.length ? `${what} aren’t all written on the wheel` : '')
      || (what === '24 names' && w.labels.min < 26 ? `24 names at ${w.labels.min.toFixed(1)} px` : ''));
    if (errors.length) ok(false, 'no page or console errors at 1920×1080: ' + errors.join(' | '));
    await big.close();

    // ---- Reduce motion: no spin, the winners fade in. Sound on, with sound that can't start or is blocked: no errors.
    for (const [what, block] of [['can’t start', () => { window.AudioContext = function () { throw new Error('no sound here'); }; }],
      ['is blocked', () => { const A = window.AudioContext; window.AudioContext = class extends A { constructor(o) { super(o); } get state() { return 'suspended'; } resume() { return Promise.reject(new DOMException('not allowed', 'NotAllowedError')); } }; }]]) {
      for (const reducedMotion of ['reduce', 'no-preference']) {
        errors.length = 0;
        const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion });
        await rctx.addInitScript(block);
        const rp = await rctx.newPage(); watch(rp, `${reducedMotion}, sound ${what}`);
        await rp.goto(BASE); await boardUp(rp); await freeBoard(rp);
        await rp.evaluate(() => window.__board21.openWidget('name-picker'));
        await eventually(async () => ((await conf(rp)) || {}).style === 'wheel');
        await np(rp).locator('#list').fill(TWELVE.join('\n')); await np(rp).locator('#done').click(); await rp.waitForTimeout(300);
        await menu(rp, 'sound'); await menu(rp, 'quick');
        bad = [];
        for (const n of [1, 3]) {
          await menu(rp, 'winners:' + n);
          const p = await pick(rp), was = await showing(rp);
          if (reducedMotion === 'reduce') {
            await rp.waitForTimeout(100);
            const w = await look(rp);
            if (was || !landed(w, p.st) || !w.faded) bad.push(`${n}: ${was ? 'it spun; ' : ''}${said(w)}${w.faded ? '' : ', no fade'}`);
          } else {
            await idle(rp);
            const w = await look(rp);
            if (!was || !landed(w, p.st)) bad.push(`${n}: ${said(w)}`);
          }
        }
        if (reducedMotion === 'reduce') ok(!bad.length, `with reduce motion (sound ${what}), 1 and 3 winners show at once: no spin, the winners fade in under the arrows${bad.length ? ': ' + bad.join(' | ') : ''}`);
        else ok(!bad.length, `with Sound on and sound that ${what}, the wheel spins and lands as usual${bad.length ? ': ' + bad.join(' | ') : ''}`);
        ok(!errors.length, `no page or console errors (${reducedMotion}, sound ${what})${errors.length ? ': ' + errors.join(' | ') : ''}`);
        await rctx.close();
      }
    }
  }],
  // ---- (end of Spinning wheel slot)
  // ---- Name Picker style suite: Spotlight
  ['Name Picker: Spotlight', async (browser) => {
    // Counts, in every frame, the sounds a page starts and the notes it plays, and the timers and animation frames it asks for.
    const AUDIO_SPY = () => {
      window.__calls = 0;
      for (const fn of ['setTimeout', 'setInterval', 'requestAnimationFrame']) { const f = window[fn]; window[fn] = function () { window.__calls++; return f.apply(this, arguments); }; }
      if (!window.AudioContext) return;
      window.__audio = 0; window.__notes = 0;
      const A = window.AudioContext, base = (window.BaseAudioContext || A).prototype;
      window.AudioContext = class extends A { constructor(o) { super(o); window.__audio++; } };
      for (const fn of ['createOscillator', 'createBufferSource']) { const f = base[fn]; base[fn] = function () { window.__notes++; return f.apply(this, arguments); }; }
    };
    const IK = 'name-picker:1';
    const errors = [];
    const watch = (p, tab) => { p.on('pageerror', e => errors.push(`[${tab}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && /name-picker/.test(m.location().url || '')) errors.push(`[${tab} console] ${m.text()}`); }); };
    const np = p => p.frameLocator(`.win[data-ikey="${IK}"] iframe`);
    const saved = p => p.evaluate(ik => window.__board21.state.data.get(ik) || null, IK);
    const menu = (p, id) => choose(p, IK, id);
    const inFrame = (p, fn, arg) => np(p).locator('html').evaluate(fn, arg);
    const showing = p => np(p).locator('body').evaluate(b => b.classList.contains('showing'));
    const idle = p => eventually(async () => !(await showing(p)), 12000);
    const text = (p, sel) => np(p).locator(sel).textContent();
    const said = p => text(p, '#said');
    const pickNow = async p => {
      const was = ((await saved(p)) || {}).pickId;
      await np(p).locator('#go').click();
      await eventually(async () => ((await saved(p)) || {}).pickId !== was, 3000);
      return saved(p);
    };
    const setNames = async (p, list) => {
      await menu(p, 'edit');
      await np(p).locator('#list').fill(list.join('\n')); await np(p).locator('#done').click(); await p.waitForTimeout(250);
    };
    // The window's content at w × h (its title bar is 40 px).
    const size = (p, w, h) => p.evaluate(([ik, w, h]) => { window.__board21.setMaximized(ik, false); window.__board21.setRect(ik, { x: 30, y: 30, w, h: h + 40 }); }, [IK, w, h]);
    // What the light does, as it happens: every tile it lights ("hot"), and every winner it stops on ("lock"), with
    // whether that tile was crossed out then and the number on its badge. (Watched again after the style starts again.)
    const spy = p => inFrame(p, () => {
      const grid = document.querySelector('.spotlight-grid');
      if (!grid || window.__spyOn === grid) { window.__spot = []; return !!grid; }
      window.__spyOn = grid; window.__spot = [];
      new MutationObserver(list => {
        for (const m of list) {
          const el = m.target;
          if (!el.classList.contains('spotlight-tile')) continue;
          const was = (m.oldValue || '').split(' '), i = Array.prototype.indexOf.call(el.parentNode.querySelectorAll(':scope > .spotlight-tile'), el);
          const got = c => el.classList.contains(c) && !was.includes(c);
          if (got('spotlight-hot')) window.__spot.push({ e: 'hot', i, done: el.classList.contains('spotlight-done') });
          if (got('spotlight-locked')) window.__spot.push({ e: 'lock', i, badge: el.querySelector('.spotlight-badge').textContent });
        }
      }).observe(grid, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
      return true;
    });
    const seen = p => inFrame(p, () => window.__spot || []);
    // The stage as it is: the tiles (in list order) and the cards.
    const stage = p => inFrame(p, () => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const box = r => ({ x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height });
      const tiles = [...document.querySelectorAll('.spotlight-tile')].map(el => {
        const nm = el.querySelector('.spotlight-nm');
        // (Its place in the grid: a lit tile is drawn a little larger on purpose.)
        return { r: { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }, name: el.getAttribute('aria-label'), text: nm.textContent, fs: parseFloat(nm.style.fontSize || getComputedStyle(nm).fontSize),
          over: nm.scrollWidth > nm.clientWidth + 1, done: el.classList.contains('spotlight-done'), locked: el.classList.contains('spotlight-locked'),
          hot: el.classList.contains('spotlight-hot'), badge: el.querySelector('.spotlight-badge').textContent };
      });
      const cards = [...document.querySelectorAll('.spotlight-card')].map(el => {
        const nm = el.querySelector('.spotlight-cname'), num = el.querySelector('.spotlight-cnum');
        return { r: box(el.getBoundingClientRect()), name: nm.textContent, num: num ? num.textContent : '', fs: parseFloat(getComputedStyle(el).fontSize), over: nm.scrollWidth > nm.clientWidth + 1,
          fade: el.classList.contains('spotlight-fade'), font: getComputedStyle(nm).fontFamily };
      });
      const root = document.querySelector('.spotlight-box');
      const badges = [...document.querySelectorAll('.spotlight-badge')].filter(b => b.textContent).map(b => box(b.getBoundingClientRect()));
      return { W: st.width, H: st.height, tiles, cards, badges, live: !!root && root.classList.contains('spotlight-live'), shown: !!root && root.classList.contains('spotlight-shown') };
    });
    // Checks a finished pick against what was saved: the light stopped on exactly the saved winners, in order (and,
    // unless it was cut short, it was on each one just before it stopped); it never lit a crossed-out tile; the cards
    // show the winners in order, numbered when there are several; with No repeats the earlier picks are crossed out.
    const landed = async (p, st, { skipped = false } = {}) => {
      const ev = await seen(p), s = await stage(p), bad = [];
      const want = st.picked.map(n => st.names.indexOf(n));
      const locks = ev.filter(e => e.e === 'lock');
      if (locks.map(e => e.i).join() !== want.join()) bad.push(`stopped on ${locks.map(e => st.names[e.i]).join(',')} not ${st.picked.join(',')}`);
      if (want.length > 1 && locks.map(e => e.badge).join() !== want.map((_, j) => j + 1).join()) bad.push(`badges ${locks.map(e => e.badge).join(',')}`);
      if (!skipped) locks.forEach(l => { const k = ev.indexOf(l), hot = ev.slice(0, k).filter(e => e.e === 'hot').pop(); if (!hot || hot.i !== l.i) bad.push(`it stopped on ${st.names[l.i]} without lighting it first`); });
      if (ev.some(e => e.e === 'hot' && e.done)) bad.push('it lit a crossed-out tile');
      if (s.cards.map(c => c.name).join() !== st.picked.join()) bad.push(`cards ${s.cards.map(c => c.name).join(',')}`);
      if (want.length > 1 && s.cards.map(c => c.num).join() !== want.map((_, j) => j + 1).join()) bad.push(`card numbers ${s.cards.map(c => c.num).join(',')}`);
      if (s.tiles.map((t, i) => t.locked ? i : -1).filter(i => i >= 0).sort((a, b) => a - b).join() !== want.slice().sort((a, b) => a - b).join()) bad.push('the lit tiles aren’t the winners');
      const out = st.left ? st.names.filter(n => !st.left.includes(n) && !st.picked.includes(n)) : [];
      if (s.tiles.filter(t => t.done).map(t => t.name.replace(/, picked$/, '')).sort().join() !== out.sort().join()) bad.push(`crossed out: ${s.tiles.filter(t => t.done).map(t => t.name).join(',')} (expected ${out.join(',')})`);
      if (s.live || !s.shown || s.cards.some(c => c.over)) bad.push('the show isn’t over, or a card cuts its name');
      return bad;
    };

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(AUDIO_SPY);
    const page = await ctx.newPage(); watch(page, 'tab 1');
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => await np(page).locator('#list').isVisible());
    await size(page, 420, 320);
    const CLASS = ['Ava', 'Mateo', 'Sofia', 'Liam', 'Amara', 'Noah', 'Isabella', 'Kenji', 'Zoe', 'Elijah', 'Priya', 'Lucas', 'Mia', 'Oluwaseun', 'Harper', 'Diego', 'Chloe', 'Ethan', 'Anne-Sophie', 'Leo', 'Fatima', 'Owen', 'Grace', 'Maximiliano'];
    await setNames(page, CLASS);
    await menu(page, 'style:spotlight');
    ok(await np(page).locator('.style-root[data-style="spotlight"]').count() === 1 && await spy(page), 'Spotlight can be chosen from the menu');
    let s = await stage(page);
    ok(s.tiles.length === 24 && s.tiles.map(t => t.text).join() === CLASS.join() && !s.cards.length && s.tiles.every(t => !t.done && !t.locked && !t.over),
      'the whole class is on the stage, a tile for each name, in list order, every name whole');
    ok(await text(page, '#status') === '24 of 24 left' && await text(page, '#go') === 'Pick a name', 'with No repeats: “24 of 24 left”');

    // ---- One winner at the usual speed: about 4 s, the class dims, the light hops and slows, and lands on the saved winner.
    let t0 = Date.now();
    let st = await pickNow(page);
    await page.waitForTimeout(700);
    s = await stage(page);
    ok(await showing(page) && s.live && s.tiles.filter(t => t.hot).length >= 1 && !s.cards.length, `during the show the class is dimmed and the light is on a tile (${s.tiles.filter(t => t.hot).map(t => t.text)})`);
    await idle(page);
    let took = Date.now() - t0;
    let bad = await landed(page, st);
    const hops = (await seen(page)).filter(e => e.e === 'hot').length;
    ok(!bad.length && hops >= 8, `one winner: the light hops ${hops} times and stops on the saved winner, ${st.picked} (${bad.join('; ') || 'ok'})`);
    ok(took > 3300 && took < 5200, `one winner takes about 4 s (${took} ms)`);
    ok(await eventually(async () => await said(page) === 'Picked: ' + st.picked[0]) && await text(page, '#status') === '23 of 24 left', `screen readers hear “Picked: ${st.picked[0]}”; 23 of 24 left`);
    s = await stage(page);
    const winTile = s.tiles[CLASS.indexOf(st.picked[0])];
    ok(s.cards.length === 1 && s.cards[0].fs > winTile.fs * 2 && s.cards[0].r.w > winTile.r.w, `its tile grows into a big name card (${Math.round(s.cards[0].fs)} px, the tile ${Math.round(winTile.fs)} px)`);
    await page.waitForTimeout(300);
    let c0 = await inFrame(page, () => window.__calls);
    await page.waitForTimeout(1500);
    ok(await inFrame(page, () => window.__calls) === c0, `then nothing runs: no timers or animation frames (${await inFrame(page, () => window.__calls) - c0})`);

    // ---- Five winners: one light collects them in turn, numbered, in about 6 s. Last pick's winner is crossed out.
    await menu(page, 'winners:5');
    ok(await text(page, '#go') === 'Pick 5', 'Names at a time 5: “Pick 5”');
    await spy(page);
    t0 = Date.now(); st = await pickNow(page); await idle(page); took = Date.now() - t0;
    bad = await landed(page, st);
    ok(!bad.length, `five winners: it stops on each saved winner in turn, numbered 1 to 5, and the earlier winner is crossed out (${st.picked}; ${bad.join('; ') || 'ok'})`);
    ok(took > 4800 && took < 7300, `five winners take about 6 s (${took} ms)`);
    ok(await eventually(async () => await said(page) === 'Picked: ' + st.picked.join(', ')) && await text(page, '#status') === '18 of 24 left', `“Picked: ${st.picked.join(', ')}”; 18 of 24 left`);

    // ---- A tap skips: the result at once, and nothing left running. (A tap in the first moment doesn't count.)
    await spy(page);
    let was = (await saved(page)).pickId;
    await np(page).locator('#go').click(); await np(page).locator('#go').click();
    await eventually(async () => (await saved(page)).pickId !== was, 3000);
    st = await saved(page);
    ok(await showing(page) && st.pickId !== was, 'a double tap picks once, and the show goes on');
    await page.waitForTimeout(700);
    await np(page).locator('#stage').click(); await page.waitForTimeout(120);
    bad = await landed(page, st, { skipped: true });
    ok(!(await showing(page)) && !bad.length && (await saved(page)).pickId === st.pickId, `a tap on the stage after that ends the show at once, on the saved winners (${st.picked}; ${bad.join('; ') || 'ok'})`);
    c0 = await inFrame(page, () => window.__calls); await page.waitForTimeout(1000);
    ok(await inFrame(page, () => window.__calls) === c0, 'and nothing is left running');

    // ---- Quick: about 1½ s, for one winner and for five.
    await menu(page, 'quick');
    for (const n of [1, 5]) {
      await menu(page, 'winners:' + n); await spy(page);
      t0 = Date.now(); st = await pickNow(page); await idle(page); took = Date.now() - t0;
      bad = await landed(page, st);
      ok(took > 900 && took < 2300 && !bad.length, `Quick, ${n} winner${n > 1 ? 's' : ''}: about 1½ s (${took} ms), on the saved winners (${bad.join('; ') || 'ok'})`);
    }

    // ---- Many picks with No repeats until everyone is picked, then Start over: always the saved winners, never a
    // crossed-out tile, tiles never move, each student once.
    await menu(page, 'round');
    s = await stage(page);
    ok(!s.cards.length && s.tiles.every(t => !t.done && !t.locked) && await text(page, '#status') === '24 of 24 left', 'Start over: the cards go, nobody is crossed out, 24 of 24 left');
    const places = s.tiles.map(t => [Math.round(t.r.x), Math.round(t.r.y)].join()).join(' ');
    let all = [], wrong = [], moved = false;
    for (let i = 0; i < 5; i++) {
      await spy(page); st = await pickNow(page); await idle(page);
      bad = await landed(page, st);
      if (bad.length) wrong.push(`pick ${i + 1}: ${bad.join('; ')}`);
      all = all.concat(st.picked);
      if ((await stage(page)).tiles.map(t => [Math.round(t.r.x), Math.round(t.r.y)].join()).join(' ') !== places) moved = true;
    }
    ok(!wrong.length && all.length === 24 && new Set(all).size === 24, `5 at a time with No repeats: five picks, each on the saved winners, everyone picked once (${wrong.join(' | ') || all.length + ' picked'})`);
    ok(!moved, 'the tiles never move during the round');
    ok(await text(page, '#status') === '0 of 24 left' && await text(page, '#go') === 'Start over' && await np(page).locator('#round').isHidden(), '“0 of 24 left”, and the one button says “Start over”');
    await np(page).locator('#go').click(); await page.waitForTimeout(300);
    s = await stage(page);
    ok(!s.cards.length && s.tiles.every(t => !t.done) && await text(page, '#status') === '24 of 24 left', 'which brings everyone back');
    // One at a time through a small class.
    const SIX = ['Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Ethan'];
    await setNames(page, SIX); await menu(page, 'winners:1');
    all = []; wrong = [];
    for (let i = 0; i < 6; i++) {
      await spy(page); st = await pickNow(page); await idle(page);
      bad = await landed(page, st);
      if (bad.length) wrong.push(`pick ${i + 1}: ${bad.join('; ')}`);
      all.push(st.picked[0]);
    }
    s = await stage(page);
    ok(!wrong.length && all.slice().sort().join() === SIX.slice().sort().join() && s.tiles.filter(t => t.done).length === 5, `1 at a time with No repeats: six picks on the saved winners, everyone once (${wrong.join(' | ') || all.join(', ')})`);
    ok(s.tiles.filter(t => t.locked).map(t => t.name).join() === st.picked[0] + ', just picked' && s.tiles.filter(t => t.done).every(t => / picked$/.test(t.name)),
      `in the class list screen readers hear who was just picked, and who was picked before (${s.tiles.filter(t => t.locked || t.done).map(t => t.name).join('; ')})`);
    await menu(page, 'round');
    // No repeats off: anyone, any time; nobody is crossed out.
    await menu(page, 'norepeat'); await menu(page, 'winners:3');
    wrong = [];
    for (let i = 0; i < 4; i++) {
      await spy(page); st = await pickNow(page); await idle(page);
      st.left = null;
      bad = await landed(page, st);
      if (bad.length) wrong.push(`pick ${i + 1}: ${bad.join('; ')}`);
    }
    ok(!wrong.length && (await stage(page)).tiles.every(t => !t.done) && await text(page, '#status') === '6 names', `No repeats off, 3 at a time: four picks on the saved winners, nobody crossed out (${wrong.join(' | ') || 'ok'})`);
    const heard = (await stage(page)).tiles.filter(t => t.locked).map(t => t.name);
    ok(heard.length === 3 && st.picked.every((n, j) => heard.includes(`${n}, just picked, number ${j + 1}`)), `with several winners, each one’s number too (${heard.join('; ')})`);
    await menu(page, 'norepeat');

    // ---- The same pick in another tab: the show there too, on the same winners. A reload shows the result straight away.
    await menu(page, 'quick');
    await setNames(page, CLASS);
    const page2 = await ctx.newPage(); watch(page2, 'tab 2');
    await page2.goto(BASE); await boardUp(page2); await freeBoard(page2);
    await eventually(async () => (await stage(page2)).tiles.length === 24);
    await spy(page2);
    st = await pickNow(page);
    ok(await eventually(() => showing(page2), 2000), 'a pick in one tab puts on the show in the other tab too');
    await idle(page); await idle(page2);
    bad = await landed(page2, st);
    ok(!bad.length, `and the other tab’s light stops on the same winners, in the same order (${st.picked}; ${bad.join('; ') || 'ok'})`);
    await page2.reload(); await boardUp(page2);
    ok(await eventually(async () => (await stage(page2)).cards.map(c => c.name).join() === st.picked.join()), 'after a reload the winners’ cards are there');
    s = await stage(page2);
    ok(!(await showing(page2)) && !s.live && s.tiles.every(t => !t.hot || t.locked) && s.cards.every(c => !c.fade), 'straight away, with no show');
    st = await pickNow(page2);
    await page2.waitForTimeout(400);
    await page2.reload(); await boardUp(page2);
    ok(await eventually(async () => (await stage(page2)).cards.map(c => c.name).join() === st.picked.join()) && !(await showing(page2)), `a reload during the show shows its result (${st.picked})`);
    await page2.close();
    await menu(page, 'quick');

    // ---- Sound: ticks for the light and a chime for the winner (made in the page, only when ticked).
    await menu(page, 'sound'); await menu(page, 'winners:1');
    let n0 = await inFrame(page, () => window.__notes);
    await np(page).locator('#go').click(); await idle(page);
    ok(await inFrame(page, () => window.__audio) === 1 && await inFrame(page, () => window.__notes) - n0 >= 10, `with Sound ticked the light ticks and the winner gets a chime (${await inFrame(page, () => window.__notes) - n0} notes)`);
    await menu(page, 'sound');
    // Unticked and ticked again: the new sound's clock starts at 0, and nothing from the old one keeps it quiet.
    n0 = await inFrame(page, () => window.__notes);
    await menu(page, 'sound'); await page.waitForTimeout(600);
    const sample = await inFrame(page, () => window.__notes) - n0;
    n0 = await inFrame(page, () => window.__notes);
    await np(page).locator('#go').click(); await idle(page);
    const again = await inFrame(page, () => window.__notes) - n0;
    ok(await inFrame(page, () => window.__audio) === 2 && sample >= 3 && again >= 10, `Sound unticked and ticked again: the sample chime plays (${sample} notes), and so does the next pick (${again} notes)`);
    await menu(page, 'sound');

    // ---- Choosing another style during the show ends it; the spotlight leaves nothing running.
    await np(page).locator('#go').click(); await page.waitForTimeout(500);
    await menu(page, 'style:name');
    await page.waitForTimeout(300);
    c0 = await inFrame(page, () => window.__calls); await page.waitForTimeout(800);
    ok(!(await showing(page)) && await np(page).locator('.spotlight-box').count() === 0 && await inFrame(page, () => window.__calls) === c0, 'choosing Big name during the show ends it, and the spotlight leaves nothing running');
    await menu(page, 'style:spotlight'); await spy(page);

    // ---- Fits and stays readable: small and maximised windows, from 1 to 45 names, and very long names.
    const LONG = ['Maximiliana-Guadalupe Hernández', 'Bartholomew Christopherson', 'Anne-Sophie', 'Oluwaseun Adebayo-Okafor', 'Jean-Baptiste Alexandre', 'Wolfgang'];
    const MORE = ['Yusuf', 'Hannah', 'Mohammed', 'Valentina', 'Theo', 'Siobhan', 'Aisha', 'Mateus', 'Freya', 'Ibrahim', 'Camila', 'Rowan', 'Hiroshi', 'Nadia', 'Felix', 'Esperanza', 'Tobias', 'Ingrid', 'Rafael', 'Lucía', 'Kwame'];
    const SETS = { 1: ['Zoe'], 3: ['Ava', 'Maximiliano', 'Leo'], 24: CLASS, 30: CLASS.concat(MORE.slice(0, 6)), 45: CLASS.concat(MORE), long: LONG };
    const SIZES = [['260×200', 260, 200], ['420×320', 420, 320], ['maximised at 1366×768', 1366, 768], ['maximised at 1920×1080', 1920, 1080]];
    let k = 0;
    const problems = [], notes = [];
    for (const [label, w, h] of SIZES) {
      if (w > 1366) await page.setViewportSize({ width: w, height: h });
      for (const [set, names] of Object.entries(SETS)) {
        if (set === '30' && w !== 420) continue;
        for (const n of [1, 5]) {
          if (w > 420) await page.evaluate(ik => window.__board21.setMaximized(ik, true), IK); else await size(page, w, h);
          // A pick from a while ago (another copy): it is shown as it is, with no show.
          const picked = names.slice(0, n).reverse();
          await page.evaluate(([ik, d]) => window.__board21.state.wins.get(ik).post('data', { data: d, reason: 'remote' }), [IK, { names, left: null, picked, pickId: '1-test' + (k++), current: picked[0] }]);
          await page.waitForTimeout(250);
          const g = await stage(page), where = `${label}, ${set === 'long' ? 'long names' : set + ' name' + (set === '1' ? '' : 's')}, ${picked.length} winner${picked.length > 1 ? 's' : ''}`;
          const off = (r, pad = 0.5) => r.x < -pad || r.y < -pad || r.x + r.w > g.W + pad || r.y + r.h > g.H + pad;
          const ts = g.tiles, fsAll = ts.map(t => t.fs).sort((a, b) => a - b), mid = fsAll[Math.floor(fsAll.length / 2)];
          if (ts.length !== names.length) problems.push(`${where}: ${ts.length} tiles`);
          if (ts.some(t => off(t.r))) problems.push(`${where}: a tile is off the stage`);
          if (g.badges.length !== (picked.length > 1 ? picked.length : 0) || g.badges.some(b => off(b))) problems.push(`${where}: a winner’s number is cut off by the stage’s edge`);
          if (ts.some((a, i) => ts.some((b, j) => j > i && a.r.x < b.r.x + b.r.w - 0.5 && b.r.x < a.r.x + a.r.w - 0.5 && a.r.y < b.r.y + b.r.h - 0.5 && b.r.y < a.r.y + a.r.h - 0.5))) problems.push(`${where}: tiles overlap`);
          if (ts.some(t => t.over)) problems.push(`${where}: a tile’s name sticks out (${ts.filter(t => t.over).map(t => t.text)})`);
          if (fsAll[0] < 7) problems.push(`${where}: names at ${fsAll[0]} px`);
          // Names are shortened only near the smallest size, and only the longest.
          const short = ts.filter(t => t.text !== names[ts.indexOf(t)]);
          if (short.some(t => t.fs > 10.01)) problems.push(`${where}: ${short.map(t => t.text)} shortened at ${short.map(t => t.fs)} px`);
          if (g.cards.map(c => c.name).join() !== picked.join() || g.cards.some(c => c.over || off(c.r) || !c.fade)) problems.push(`${where}: the cards don’t show every whole name on the stage (${g.cards.map(c => c.name + (c.over ? ' cut' : '') + (off(c.r) ? ' off' : '')).join(', ')})`);
          // The cards: one winner's card is bigger than its tile, and in a big class every card is much bigger than the
          // tiles. (When nearly the whole class is picked, the tiles already fill the stage and the cards are about their
          // size.) Never tiny: the smallest window with five very long names is as small as they get.
          const cardFs = Math.min(...g.cards.map(c => c.fs)), grows = picked.length === 1 ? 1.15 : names.length >= 24 ? 1.5 : 0.8;
          if (cardFs < (w < 400 ? 9.5 : 14) || (names.length > 1 && g.cards.some(c => c.fs < grows * ts[names.indexOf(c.name)].fs))) problems.push(`${where}: card names at ${Math.round(cardFs)} px`);
          if (set === '24' || set === '30' || set === 'long') notes.push(`${label}, ${set === 'long' ? 'long names' : set + ' names'}, ${picked.length} winner${picked.length > 1 ? 's' : ''}: tiles ${Math.round(fsAll[0])}–${Math.round(fsAll[fsAll.length - 1])} px (most ${Math.round(mid)}), ${short.length} shortened; cards ${Math.round(cardFs)} px`);
          if ((set === '30' || set === '24') && w === 420 && (short.length || mid < 12)) problems.push(`${where}: ${set} names should read whole at 420×320 (most at ${mid} px, ${short.length} shortened)`);
          if (w >= 1366 && set === '24' && mid < 30) problems.push(`${where}: names only ${mid} px in a maximised window`);
          if (set === '1' && picked.length === 1 && w === 420) await page.screenshot({ path: OUT + 'name-picker-spotlight-1-name.png' });
        }
      }
    }
    ok(!problems.length, `it fits and stays readable at 260×200, 420×320 and maximised at 1366×768 and 1920×1080, with 1, 3, 24, 30 and 45 names and very long names: tiles on the stage, never overlapping or cut, shortened only near the smallest size; the winners’ cards whole and large${problems.length ? ': ' + problems.join(' | ') : ''}`);
    console.log('    (' + notes.join('; ') + ')');
    await page.setViewportSize({ width: 1366, height: 768 });
    // Shortened names never cut a flag, an emoji or an accented letter in two ("José 🇲🇽" → "José…", never "José 🇲.").
    const EMOJI = ['Zoë 🦄', 'José 🇲🇽', 'Ana 👩‍👩‍👧‍👦', 'Søren', 'Nguyễn Thị Minh Khai', 'Ébène', 'François', 'Łukasz', 'Ćiril', 'İlkay', 'Ångström', 'محمد', 'Ζωή', 'Даша', '김민준', '陈伟', 'Kai 🇺🇸🇯🇵', '🦄🦄🦄🦄🦄🦄🦄🦄 Ana', 'Mia 👍🏽', 'José Luis', 'Lily 👨🏽‍🚀'];
    await size(page, 260, 200);
    await page.evaluate(([ik, d]) => window.__board21.state.wins.get(ik).post('data', { data: d, reason: 'remote' }), [IK, { names: EMOJI, left: null, picked: [], pickId: null, current: null }]);
    await page.waitForTimeout(300);
    const letters = t => Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(t), x => x.segment);
    const cut = (await stage(page)).tiles.filter(t => t.text !== t.name);
    const split = cut.filter(t => { const own = new Set(letters(t.name)); return !letters(t.text.replace(/[….]$/, '')).every(x => own.has(x)); });
    ok(cut.some(t => t.name === 'José 🇲🇽') && cut.some(t => t.name === 'Kai 🇺🇸🇯🇵') && !split.length,
      `names shortened in the smallest window never cut a flag or an emoji in two (${cut.map(t => t.name + ' → ' + t.text).join(', ')})`);
    await size(page, 420, 320);

    // ---- Dark theme and the text style (Settings → Text style → Easier to read) reach the stage.
    await page.evaluate(([ik, d]) => window.__board21.state.wins.get(ik).post('data', { data: d, reason: 'remote' }), [IK, { names: CLASS, left: CLASS.slice(3), picked: ['Liam'], pickId: '1-dark', current: 'Liam' }]);
    await page.waitForTimeout(300);
    const colours = () => inFrame(page, () => {
      const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), c = e => getComputedStyle(e);
      const probe = document.createElement('i'); document.body.appendChild(probe);
      const rgb = x => { probe.style.color = x; const r = getComputedStyle(probe).color; return r; };
      const tile = document.querySelector('.spotlight-tile:not(.spotlight-done):not(.spotlight-locked)'), card = document.querySelector('.spotlight-card');
      const out = { theme: document.documentElement.dataset.b21Theme || 'light', tileBg: c(tile).backgroundColor, tileText: c(tile).color, text: rgb(v('--b21-text')), s2: rgb(v('--b21-surface-2')), bg: rgb(v('--b21-bg')),
        cardBg: c(card).backgroundColor, win: rgb(v('--np-win')), cardText: c(card).color, ink: rgb(v('--np-ink')) };
      probe.remove();
      return out;
    });
    let col = await colours();
    ok(col.theme === 'light' && col.tileBg === col.bg && col.tileText === col.text && col.cardBg === col.win && col.cardText === col.ink, `light theme: white tiles, the board’s text colour, gold cards (${col.tileBg}, ${col.cardBg})`);
    await setTheme(page, 'dark'); await page.waitForTimeout(100);
    col = await colours();
    ok(col.theme === 'dark' && col.tileBg === col.s2 && col.tileText === col.text && col.cardBg === col.win && col.cardText === col.ink, `dark theme: the stage follows (tiles ${col.tileBg}, text ${col.tileText}, cards ${col.cardBg})`);
    await page.screenshot({ path: OUT + 'name-picker-spotlight-dark.png' });
    await setTheme(page, 'light');
    await openSettings(page, ['letters']);
    await page.click('#settings [data-act="letters"][data-val="legible"]');
    await page.waitForTimeout(400); await inFrame(page, () => document.fonts.ready); await page.waitForTimeout(500);
    s = await stage(page);
    const tileFont = await inFrame(page, () => getComputedStyle(document.querySelector('.spotlight-nm')).fontFamily);
    ok(tileFont.startsWith('"Atkinson Hyperlegible"') && s.cards[0].font.startsWith('"Atkinson Hyperlegible"') && await inFrame(page, () => [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Atkinson Hyperlegible' && f.status === 'loaded')),
      `Easier to read letters reach the tiles and the cards (${tileFont.split(',')[0]})`);
    ok(!s.tiles.some(t => t.over) && !s.cards.some(c => c.over) && s.tiles.every((t, i) => t.text === CLASS[i]), 'and the names are measured again in them: every name whole, none cut');
    await page.click('#settings [data-act="letters"][data-val="standard"]'); await page.waitForTimeout(500); await page.keyboard.press('Escape');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- Reduce motion: no show at all, the winners fade in. Sound ticked where sound is blocked: no error.
    errors.length = 0;
    const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await rctx.addInitScript(() => { window.AudioContext = window.webkitAudioContext = function () { throw new Error('no sound here'); }; });
    const rp = await rctx.newPage(); watch(rp, 'reduce motion');
    await rp.goto(BASE); await boardUp(rp); await freeBoard(rp);
    await rp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => await np(rp).locator('#list').isVisible());
    await setNames(rp, CLASS); await menu(rp, 'style:spotlight'); await menu(rp, 'sound'); await spy(rp);
    for (const n of [1, 3]) {
      await menu(rp, 'winners:' + n);
      st = await pickNow(rp);
      const was = await showing(rp);
      await rp.waitForTimeout(400);
      s = await stage(rp);
      const ev = await seen(rp);
      ok(!was && !ev.some(e => e.e === 'hot') && s.cards.map(c => c.name).join() === st.picked.join() && s.cards.every(c => c.fade)
        && await eventually(async () => (await said(rp)) === 'Picked: ' + st.picked.join(', '), 1000),
        `with reduce motion, ${n} winner${n > 1 ? 's' : ''}: no show and no light hopping; the cards fade straight in (${st.picked})`);
    }
    ok(!errors.length, 'and Sound ticked where sound can’t start makes no error' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await rctx.close();
    // Reduce motion with Sound ticked (and working): no show, but the winners still get their chime.
    errors.length = 0;
    const mctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await mctx.addInitScript(AUDIO_SPY);
    const mp = await mctx.newPage(); watch(mp, 'reduce motion, sound');
    await mp.goto(BASE); await boardUp(mp); await freeBoard(mp);
    await mp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => await np(mp).locator('#list').isVisible());
    await setNames(mp, SIX); await menu(mp, 'style:spotlight'); await menu(mp, 'sound'); await mp.waitForTimeout(600);
    n0 = await inFrame(mp, () => window.__notes);
    st = await pickNow(mp);
    const still = !(await showing(mp));
    await mp.waitForTimeout(500);
    const chime = await inFrame(mp, () => window.__notes) - n0;
    ok(still && chime >= 3 && (await stage(mp)).cards.map(c => c.name).join() === st.picked.join() && !errors.length,
      `with reduce motion and Sound ticked, a pick has no show, but the winner still gets a chime (${chime} notes${errors.length ? '; ' + errors.join(' | ') : ''})`);
    await mctx.close();
    // Sound blocked with motion on: the show plays, silently, with no error.
    errors.length = 0;
    const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await bctx.addInitScript(() => { window.AudioContext = window.webkitAudioContext = function () { throw new Error('no sound here'); }; });
    const bp = await bctx.newPage(); watch(bp, 'sound blocked');
    await bp.goto(BASE); await boardUp(bp); await freeBoard(bp);
    await bp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => await np(bp).locator('#list').isVisible());
    await setNames(bp, SIX); await menu(bp, 'style:spotlight'); await menu(bp, 'sound'); await menu(bp, 'quick'); await spy(bp);
    st = await pickNow(bp); await idle(bp);
    bad = await landed(bp, st);
    ok(!bad.length && !errors.length, `with Sound ticked and sound blocked, the show plays and lands with no error (${bad.concat(errors).join(' | ') || st.picked})`);
    await bctx.close();
  }],
  // ---- (end of Spotlight slot)
  // ---- Name Picker style suite: Lotto
  ['Name Picker: Lotto', async (browser) => {
    // Counts, in every frame, the timers and animation frames a page asks for, and the sounds it starts and the notes
    // it plays (as in 'Name Picker: styles, winners, menu').
    const AUDIO_SPY = () => {
      window.__calls = 0;
      for (const fn of ['setTimeout', 'setInterval', 'requestAnimationFrame']) { const f = window[fn]; window[fn] = function () { window.__calls++; return f.apply(this, arguments); }; }
      if (!window.AudioContext) return;
      window.__audio = 0; window.__notes = 0;
      const A = window.AudioContext, base = (window.BaseAudioContext || A).prototype;
      window.AudioContext = class extends A { constructor(o) { super(o); window.__audio++; } };
      for (const fn of ['createOscillator', 'createBufferSource']) { const f = base[fn]; base[fn] = function () { window.__notes++; return f.apply(this, arguments); }; }
    };
    // When each show starts and ends (body.showing), timed inside the widget.
    const TIMES = () => {
      window.__shows = [];
      new MutationObserver(() => {
        const on = document.body.classList.contains('showing'), last = window.__shows[window.__shows.length - 1];
        if (on && (!last || last.end)) window.__shows.push({ start: performance.now() });
        else if (!on && last && !last.end) last.end = performance.now();
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    };
    // What the Lotto stage shows, measured on screen: each socket's name (its size, on one or two lines, how far it
    // sticks out of its place or the stage, how much of its place it fills), each ball (in a socket, in the drum, on its
    // way, or gone), and whether the drum and the tray overlap.
    const LOOK = () => {
      const R = e => e.getBoundingClientRect(), st = R(document.getElementById('stage'));
      const g = R(document.querySelector('.lotto-globe')), gc = { x: g.left + g.width / 2, y: g.top + g.height / 2, r: g.width / 2 };
      const socks = [...document.querySelectorAll('.lotto-sock')];
      const sr = socks.map(R);
      const names = [...document.querySelectorAll('.lotto-name')].map(n => {
        const t = n.querySelector('.lotto-text');
        if (!t) return null;
        const r = document.createRange(); r.selectNodeContents(t);
        const tr = r.getBoundingClientRect(), nb = R(n), fs = parseFloat(getComputedStyle(t).fontSize);
        return { text: t.textContent, fs, lines: t.classList.contains('lotto-two') ? 2 : 1, font: getComputedStyle(t).fontFamily,
          out: Math.max(0, nb.left - tr.left, tr.right - nb.right, nb.top - tr.top - fs * 0.05, tr.bottom - nb.bottom - fs * 0.05),
          outStage: Math.max(0, st.left - tr.left, tr.right - st.right, st.top - tr.top, tr.bottom - st.bottom),
          // (one line is at most about 0.6 of its place's height: the rest is room around it)
          fill: Math.max(tr.width / nb.width, t.offsetHeight / (nb.height * (t.classList.contains('lotto-two') ? 1 : 0.6))), top: tr.top, bottom: tr.bottom };
      });
      const balls = [...document.querySelectorAll('.lotto-ball')].map((b, i) => {
        if (b.hidden) return { i, where: 'out' };
        const r = R(b), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, d = b.offsetWidth;
        const s = sr.findIndex(k => c.x > k.left && c.x < k.right && c.y > k.top && c.y < k.bottom);
        const inStage = c.x - d / 2 >= st.left - 1 && c.x + d / 2 <= st.right + 1 && c.y - d / 2 >= st.top - 1 && c.y + d / 2 <= st.bottom + 1;
        return { i, where: s >= 0 ? 'sock' + s : Math.hypot(c.x - gc.x, c.y - gc.y) + d / 2 <= gc.r + 1 ? 'drum' : 'loose', label: b.textContent, d, inStage,
          at: b.style.transform, font: getComputedStyle(b.firstChild).fontFamily };
      });
      const tray = R(document.querySelector('.lotto-tray'));
      return { stage: { w: st.width, h: st.height }, socks: socks.length, open: socks.filter(s => !s.classList.contains('lotto-full') && s.textContent === '?').length,
        names, balls, overlap: !(g.right <= tray.left || g.bottom <= tray.top || g.left >= tray.right),
        trayIn: tray.left >= st.left - 0.5 && tray.right <= st.right + 0.5 && tray.top >= st.top - 0.5 && tray.bottom <= st.bottom + 0.5,
        head: (document.querySelector('.lotto-head:not([hidden])') || {}).textContent || '' };
    };
    const initials = name => { const first = s => (Array.from(s)[0] || '?').toUpperCase(), parts = name.split(/[\s\-‐-―.]+/).filter(Boolean); return parts.length > 1 ? first(parts[0]) + first(parts[1]) : first(name); };
    const C12 = ['Ava', 'Mateo', 'Sofia', 'Liam', 'Amara', 'Noah', 'Isabella', 'Kenji', 'Zoe', 'Elijah', 'Anne-Sophie', 'Leo'];
    const C24 = C12.concat(['Priya', 'Lucas', 'Mia', 'Oluwaseun', 'Harper', 'Diego', 'Chloe', 'Ethan', 'Fatima', 'Owen', 'Grace', 'Maximiliano']);
    const C45 = C24.concat(['Benjamin', 'Valentina', 'Hiroshi', 'Siobhan', 'Jean-Baptiste', 'Kai', 'Yusuf', 'Ingrid', 'Tomas', 'Aiyana', 'Rafael', 'Nadia', 'Ezra',
      'Leila', 'Mason', 'Sakura', 'Theo', 'Amelie', 'Kofi', 'Ximena', 'Lars']);
    const LONG = ['Maximiliana-Guadalupe Fernández-Oyelaran', 'Christopher Alexander Montgomery', 'Oluwaseun Adebayo-Williams', 'Wolfgang Bartholomew', 'Bo'];

    const errors = [];
    const watch = (p, tab) => { p.on('pageerror', e => errors.push(`[${tab}] ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && /name-picker/.test(m.location().url || '')) errors.push(`[${tab} console] ${m.text()}`); }); };
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(AUDIO_SPY);
    const page = await ctx.newPage(); watch(page, 'tab 1');
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const IK = 'name-picker:1';
    const np = (p = page, ik = IK) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const saved = (p = page, ik = IK) => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const conf = (p = page, ik = IK) => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const menu = (id, p = page, ik = IK) => choose(p, ik, id);
    const showing = (p = page, ik) => np(p, ik).locator('body').evaluate(b => b.classList.contains('showing'));
    const idle = (p = page, ik) => eventually(async () => !(await showing(p, ik)), 12000);
    const inFrame = (fn, p = page, ik, arg) => np(p, ik).locator('html').evaluate(fn, arg);
    const look = (p = page, ik) => inFrame(LOOK, p, ik);
    const said = (p = page, ik) => np(p, ik).locator('#said').textContent();
    const pickNow = async (p = page, ik) => {
      const was = ((await saved(p, ik)) || {}).pickId;
      await np(p, ik).locator('#go').click();
      await eventually(async () => ((await saved(p, ik)) || {}).pickId !== was, 3000);
      return saved(p, ik);
    };
    const setNames = async (list, p = page) => { await menu('edit', p); await np(p).locator('#list').fill(list.join('\n')); await np(p).locator('#done').click(); await p.waitForTimeout(300); };
    // Content size w×h (the window adds its 40 px title bar), or the whole board.
    const size = (w, h, p = page) => p.evaluate(([ik, w, h]) => { const b = window.__board21; if (w) { b.setMaximized(ik, false); b.setRect(ik, { x: 30, y: 30, w, h: h + 40 }); } else b.setMaximized(ik, true); }, [IK, w, h]).then(() => p.waitForTimeout(500));
    // The stage shows exactly this pick: the winners' names in the sockets in pick order, each winner's own ball in its
    // socket, everyone still in the round in the drum, and the ones picked earlier in the round gone.
    const landsOn = async (st, names, p = page) => {
      const L = await look(p), bad = [];
      if (JSON.stringify(L.names.map(n => n && n.text)) !== JSON.stringify(st.picked)) bad.push(`tray: ${L.names.map(n => n && n.text)}`);
      st.picked.forEach((n, j) => { const b = L.balls[names.indexOf(n)]; if (!b || b.where !== 'sock' + j) bad.push(`${n}'s ball is ${b && b.where}`); });
      const inDrum = L.balls.filter(b => b.where === 'drum').length, gone = L.balls.filter(b => b.where === 'out').length;
      const drum = (await conf(p)).noRepeats ? st.left.length : names.length - st.picked.length;
      if (inDrum !== drum || gone !== names.length - drum - st.picked.length) bad.push(`${inDrum} balls in the drum, ${gone} gone (expected ${drum}, ${names.length - drum - st.picked.length})`);
      if (L.balls.some(b => b.where === 'loose' || b.inStage === false)) bad.push('a ball is outside the drum and the tray');
      if (L.open) bad.push(L.open + ' sockets still empty');
      return bad;
    };

    // ---- A new picker as Lotto: a ball with initials for each student, one "?" socket in the Picked tray.
    await page.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf()) || {}).style === 'wheel');
    await np().locator('#list').fill(C12.join('\n')); await np().locator('#done').click();
    await menu('style:lotto');
    await size(640, 400);
    let L = await look();
    ok((await conf()).style === 'lotto' && await np().locator('.style-root[data-style="lotto"] .lotto').count() === 1, 'Lotto is chosen from the menu and saved');
    ok(L.balls.length === 12 && L.balls.every((b, i) => b.where === 'drum' && b.label === initials(C12[i])) && L.balls[10].label === 'AS',
      `the drum holds a ball for each of the 12 students, with their initials (${L.balls.map(b => b.label).join(' ')})`);
    ok(L.socks === 1 && L.open === 1 && L.head === 'Picked' && !L.overlap && L.trayIn, 'the Picked tray shows one “?” socket for the name to come');
    const calls0 = await inFrame(() => window.__calls); await page.waitForTimeout(1200);
    ok(await inFrame(() => window.__calls) === calls0, 'nothing runs while it waits for a pick (no timers or animation frames)');
    // A first character made of several codes is whole on the ball: an emoji with a skin tone, a flag, an accent typed
    // as a letter and a mark.
    const ODD = ['👩🏽‍🚀 Astro', '🇺🇸 Flag', 'Émilie', 'Zoë', 'Anne-Sophie'];
    await setNames(ODD);
    const odd = (await look()).balls.map(b => b.label);
    ok(JSON.stringify(odd) === JSON.stringify(['👩🏽‍🚀A', '🇺🇸F', 'É', 'Z', 'AS']), `the initials on a ball are whole characters (${odd.join(' ')})`);
    await setNames(C12);

    // ---- One winner, at the usual speed: about 3½ s, landing on the saved winner.
    await inFrame(TIMES);
    let snaps = [];
    let st = await pickNow();
    for (let i = 0; i < 80 && await showing(); i++) { snaps.push(await look()); await page.waitForTimeout(60); }
    await idle();
    let shows = await inFrame(() => window.__shows);
    ok(shows.length === 1 && shows[0].end - shows[0].start > 3000 && shows[0].end - shows[0].start < 4300, `one name takes about 3½ s (${Math.round(shows[0].end - shows[0].start)} ms)`);
    ok(snaps.length > 5 && snaps[0].open === 1 && snaps.some(s => s.balls.some(b => b.where === 'loose' && b.i === C12.indexOf(st.picked[0]))) && snaps.every(s => s.balls.every(b => b.where !== 'loose' || b.i === C12.indexOf(st.picked[0]))),
      `during the show the balls tumble and only the winner’s ball (${st.picked[0]}) rolls out of the drum`);
    let bad = await landsOn(st, C12);
    ok(!bad.length, `it lands on the saved winner, ${st.picked[0]}: the name in the tray, its ball in the socket, 11 balls left in the drum${bad.length ? ': ' + bad.join('; ') : ''}`);
    ok(await eventually(async () => await said() === 'Picked: ' + st.picked[0]), 'screen readers hear the winner (the host’s “Picked: …”)');
    const calls1 = await inFrame(() => window.__calls); await page.waitForTimeout(1500);
    ok(await inFrame(() => window.__calls) === calls1, 'once the show is over nothing runs (no timers or animation frames)');

    // ---- Five winners: five "?" sockets first, then the balls come out about a second apart, in turn order; about 6 s.
    await menu('winners:5');
    L = await look();
    ok(L.socks === 1 && L.open === 0 && L.names[0].text === st.picked[0] && await np().locator('#go').textContent() === 'Pick 5', 'choosing 5 winners keeps the last pick on show until the next pick (“Pick 5”)');
    snaps = [];
    const t0 = Date.now();
    st = await pickNow();
    for (let i = 0; i < 150 && await showing(); i++) { const s = await look(); s.t = Date.now() - t0; snaps.push(s); await page.waitForTimeout(50); }
    await idle();
    shows = await inFrame(() => window.__shows);
    const took5 = shows[1].end - shows[1].start;
    ok(snaps[0].socks === 5 && snaps[0].open === 5 && snaps[0].names.every(n => !n), 'the tray first shows five “?” sockets, one for each name to come');
    const filled = snaps.map(s => s.names.filter(Boolean).map(n => n.text));
    const inOrder = filled.every(f => f.every((n, j) => n === st.picked[j]) && f.length <= 5) && snaps.every(s => s.names.every((n, j) => !n || j < s.names.filter(Boolean).length));
    const landedAt = [1, 2, 3, 4, 5].map(c => (snaps.find(s => s.names.filter(Boolean).length >= c) || {}).t);
    const gaps = landedAt.slice(1).map((t, j) => t - landedAt[j]);
    ok(inOrder && landedAt.every(Boolean) && gaps.every(g => g > 450 && g < 1200), `the names fill the tray from the top in turn order, about a second apart (${gaps.join(', ')} ms)`);
    ok(snaps.every(s => s.balls.every(b => b.where !== 'loose' || st.picked.slice(s.names.filter(Boolean).length, s.names.filter(Boolean).length + 2).includes(C12[b.i]))),
      'only the next winners’ balls are ever on their way down the chute');
    ok(took5 > 5300 && took5 < 7000, `five names take about 6 s (${Math.round(took5)} ms)`);
    bad = await landsOn(st, C12);
    ok(!bad.length, `it lands on the five saved winners in order (${st.picked.join(', ')})${bad.length ? ': ' + bad.join('; ') : ''}`);

    // ---- Many picks (Quick): No repeats until everyone is picked, then Start over; one winner and five.
    await menu('quick');
    await menu('round');
    L = await look();
    ok(L.balls.every(b => b.where === 'drum') && L.socks === 5 && L.open === 5, 'Start over: every ball back in the drum and five empty sockets');
    for (const k of [1, 5]) {
      await menu('winners:' + k);
      const fails = [], seen = [];
      for (let n = 0; n < 20; n++) {
        await idle();
        if (await np().locator('#go').textContent() === 'Start over') break;
        const s = await pickNow(); await idle();
        seen.push(...s.picked);
        const b = await landsOn(s, C12);
        if (b.length) fails.push(`${s.picked}: ${b.join('; ')}`);
      }
      ok(!fails.length && seen.slice().sort().join() === C12.slice().sort().join(),
        `${k} winner${k > 1 ? 's' : ''} at a time, No repeats: every pick lands on exactly the saved winners and the drum empties as the class is picked, everyone once (${seen.length} picks)${fails.length ? ': ' + fails.join(' | ') : ''}`);
      L = await look();
      ok(L.balls.filter(b => b.where === 'drum').length === 0, 'when everyone has been picked the drum is empty');
      await np().locator('#go').click(); await page.waitForTimeout(300);
      L = await look();
      ok(L.balls.every(b => b.where === 'drum') && L.open === k && (await saved()).left.length === 12, `the button then starts over: all 12 balls back in the drum, ${k} “?” socket${k > 1 ? 's' : ''}`);
    }

    // ---- Quick: about 1½ s, one winner or five.
    for (const k of [1, 5]) {
      await menu('winners:' + k);
      await pickNow(); await idle();
      shows = await inFrame(() => window.__shows);
      const q = shows[shows.length - 1].end - shows[shows.length - 1].start;
      ok(q > 1100 && q < 2100, `Quick: ${k} winner${k > 1 ? 's take' : ' takes'} about 1½ s (${Math.round(q)} ms)`);
    }

    // ---- A ball on its way to the tray never passes over the "Picked" heading or a name already there, in a tall
    // window (it drops down the column of balls) or a wide one. Every frame of the show is checked, on the letters.
    const COVER = () => {
      window.__cover = { frames: 0, head: 0, names: 0 };
      let began = false;
      const text = e => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
      const f = () => {
        const on = document.body.classList.contains('showing');
        if (on) began = true;
        if (!on) { if (!began) requestAnimationFrame(f); return; }
        const head = document.querySelector('.lotto-head:not([hidden])'), hr = head && text(head);
        const nameRs = [...document.querySelectorAll('.lotto-name .lotto-text')].map(text);
        for (const b of document.querySelectorAll('.lotto-ball.lotto-top')) {
          // (A ball is round, and its box turns with it: it is measured from its middle.)
          const r = b.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2, rad = b.offsetWidth / 2;
          const over = q => !!q && Math.hypot(x - Math.max(q.left, Math.min(x, q.right)), y - Math.max(q.top, Math.min(y, q.bottom))) < rad - 1;
          if (over(hr)) window.__cover.head++;
          if (nameRs.some(over)) window.__cover.names++;
        }
        window.__cover.frames++;
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    };
    const covered = [];
    let coverBad = false;
    for (const [w, h] of [[320, 560], [420, 320]]) {
      await size(w, h); await menu('round');
      await inFrame(COVER);
      await pickNow(); await idle();
      const c = await inFrame(() => window.__cover);
      covered.push(`${w}×${h}: ${c.head} frames over the heading, ${c.names} over a name, of ${c.frames}`);
      if (c.frames < 20 || c.head || c.names) coverBad = true;
    }
    ok(!coverBad, `five balls coming into the tray never pass over the heading or a name already there (${covered.join('; ')})`);
    // ---- A name popping up as it lands grows a little for a moment, but never past its place: long names that fill
    // their places, checked in every frame until the last one has popped up.
    const POPS = () => {
      const P = window.__pops = { popping: 0, out: [], stop: false };
      const f = () => {
        if (P.stop) return;
        for (const n of document.querySelectorAll('.lotto-name')) {
          const t = n.querySelector('.lotto-text');
          if (!t) continue;
          if (t.getAnimations().length) P.popping++;
          const r = document.createRange(); r.selectNodeContents(t);
          const tr = r.getBoundingClientRect(), nb = n.getBoundingClientRect(), fs = parseFloat(getComputedStyle(t).fontSize);
          const out = Math.max(nb.left - tr.left, tr.right - nb.right, nb.top - tr.top - fs * 0.05, tr.bottom - nb.bottom - fs * 0.05);
          if (out > 1 && P.out.length < 5) P.out.push(`${t.textContent} by ${Math.round(out)} px`);
        }
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    };
    await setNames(['Anne-Sophie', 'Oluwaseun', 'Maximiliano', 'Isabella', 'Valentina', 'Bartholomew']);
    await menu('winners:3');
    await inFrame(POPS);
    await pickNow(); await idle(); await page.waitForTimeout(800);
    const pops = await inFrame(() => { window.__pops.stop = true; return window.__pops; });
    ok(pops.popping > 20 && !pops.out.length, `a long name popping up never grows past its place (${pops.popping} frames of a name popping up${pops.out.length ? '; sticks out: ' + pops.out.join(', ') : ''})`);
    await setNames(C12);
    await size(640, 400);
    await menu('quick');

    // ---- No repeats off: the winners' balls go back into the drum at the next pick; every ball is always on show.
    await menu('norepeat'); await menu('winners:3');
    for (let n = 0; n < 3; n++) {
      await idle(); await np().locator('#go').click(); await page.waitForTimeout(700); await np().locator('#stage').click(); await page.waitForTimeout(200);
      st = await saved();
      bad = await landsOn(st, C12);
      if (bad.length) break;
    }
    ok(!bad.length, `No repeats off: the three winners in the tray, the other 9 balls in the drum, none gone${bad.length ? ': ' + bad.join('; ') : ''}`);
    await menu('norepeat'); await menu('winners:1');

    // ---- A tap during the show skips to the result; nothing is left running.
    await menu('winners:3');
    st = await pickNow();
    await page.waitForTimeout(700);
    await np().locator('#stage').click(); await page.waitForTimeout(150);
    bad = await landsOn(st, C12);
    ok(!(await showing()) && !bad.length, `a tap during the show skips straight to the three winners${bad.length ? ': ' + bad.join('; ') : ''}`);
    await page.waitForTimeout(300);
    let c = await inFrame(() => window.__calls); L = await look(); await page.waitForTimeout(1000);
    ok(await inFrame(() => window.__calls) === c && JSON.stringify((await look()).balls.map(b => b.at)) === JSON.stringify(L.balls.map(b => b.at)), 'and nothing moves or runs after it');
    // A page that can't be seen ends the show at once.
    st = await pickNow(); await page.waitForTimeout(400);
    await inFrame(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    bad = await landsOn(st, C12);
    await page.waitForTimeout(300); c = await inFrame(() => window.__calls); await page.waitForTimeout(800);
    ok(!(await showing()) && !bad.length && await inFrame(() => window.__calls) === c, 'a show ends at once when the page is hidden, the winners in the tray, nothing left running');
    await inFrame(() => { delete document.hidden; });
    // Another style chosen during the show: the drum stops; choosing Lotto again shows the same pick.
    st = await pickNow(); await page.waitForTimeout(500);
    await menu('style:name');
    await page.waitForTimeout(300); c = await inFrame(() => window.__calls); await page.waitForTimeout(800);
    ok(await inFrame(() => window.__calls) === c && await np().locator('.lotto').count() === 0, 'choosing Big name during the show stops the drum (nothing left running)');
    await menu('style:lotto');
    bad = await landsOn(st, C12);
    ok(!bad.length, `and choosing Lotto again shows that pick straight away${bad.length ? ': ' + bad.join('; ') : ''}`);

    // ---- A resize during the show: it carries on and still lands on the winners, fitted to the new size. (Measured once
    // the last name has popped up: the show ends while its pop, which grows it a little for a moment, is still going.)
    st = await pickNow(); await page.waitForTimeout(1600);
    await size(420, 320);
    if (!(await showing())) bad = ['the show was over before the resize'];
    else { await idle(); await inFrame(() => Promise.all(document.querySelector('.lotto').getAnimations({ subtree: true }).map(a => a.finished.catch(() => {})))); bad = await landsOn(st, C12); }
    L = await look();
    for (const n of L.names) if (n && (n.out > 1 || n.outStage)) bad.push(`“${n.text}” sticks out by ${Math.round(Math.max(n.out, n.outStage))} px`);
    if (L.overlap) bad.push('the drum and the tray overlap');
    ok(!bad.length, `a window resized during the show still lands on the winners, fitted to the new size${bad.length ? ': ' + bad.join('; ') : ''}`);

    // ---- Another copy: a pick in one tab plays the show in the other, which lands on the same winners in the same order.
    await size(640, 400); await menu('round');   // (the round was used up: everyone back in)
    const page2 = await ctx.newPage(); watch(page2, 'tab 2');
    await page2.goto(BASE); await boardUp(page2); await freeBoard(page2);
    await eventually(async () => (await np(page2).locator('.lotto').count()) === 1);
    st = await pickNow();
    ok(await eventually(() => showing(page2), 1500), 'a pick in one tab puts on the Lotto show in the other tab too');
    await idle(); await idle(page2);
    bad = await landsOn(st, C12, page2);
    ok(!bad.length, `and both end on the same winners, in the same order (${st.picked.join(', ')})${bad.length ? ': ' + bad.join('; ') : ''}`);
    // A reload shows the result straight away, after the show and during it.
    await page2.reload(); await boardUp(page2);
    ok(await eventually(async () => !(await landsOn(st, C12, page2)).length, 3000) && !(await showing(page2)), 'after a reload the winners are in the tray straight away, with no show');
    await page2.close();
    st = await pickNow(); await page.waitForTimeout(600);
    await page.reload(); await boardUp(page);
    ok(await eventually(async () => !(await landsOn(st, C12)).length, 3000) && !(await showing()) && (await saved()).pickId === st.pickId, 'a reload during the show shows its result straight away');

    // ---- Sound: off, a show plays nothing; ticked, the balls clack, pop out and a chime plays at the end.
    await menu('winners:1'); await menu('quick');
    let n0 = await inFrame(() => window.__notes);
    await pickNow(); await idle();
    ok(await inFrame(() => window.__notes) === n0 && await inFrame(() => window.__audio) === 0, 'with Sound off the show makes no sound (none is even started)');
    await menu('sound');
    n0 = await inFrame(() => window.__notes);
    await pickNow(); await idle();
    const notes = await inFrame(() => window.__notes) - n0;
    ok(await inFrame(() => window.__audio) === 1 && notes >= 8, `with Sound ticked the show plays its sounds (${notes} notes)`);
    // Unticked and ticked again: heard again straight away. (The new sound's clock starts at 0, so the times kept from
    // the last one must not hold its notes back.)
    await menu('sound');
    n0 = await inFrame(() => window.__notes);
    await menu('sound'); await page.waitForTimeout(600);
    const sample = await inFrame(() => window.__notes) - n0;
    n0 = await inFrame(() => window.__notes);
    await pickNow(); await idle();
    const again = await inFrame(() => window.__notes) - n0;
    ok(sample >= 3 && again >= 8, `Sound unticked and ticked again: the sample chime plays (${sample} notes), and so does the next show (${again} notes)`);
    await menu('sound'); await menu('quick');

    // ---- Fits and stays readable: the smallest window, the usual one, and the whole board at 1366×768 and 1920×1080,
    // with 1, 3, 24 and 45 names and very long ones. The longest names are put in the tray (as an older pick from
    // another copy arrives), then measured: nothing sticks out of its place or the stage, no ball is outside the drum
    // or the tray, the drum and the tray don't overlap, every name fills its place, and is at least this large (px).
    // ([size]: 1 winner, 3 winners, then a very long name on two lines: 1 winner, 3 winners; five winners.)
    const FLOOR = { '260x200': [16, 13, 9, 7], '420x320': [24, 18, 13, 10], '1366x768': [85, 65, 45, 35, 40], '1920x1080': [120, 95, 65, 50, 60] };
    const CASES = [['1 name', ['Ava'], [[], ['Ava']]], ['3 names', ['Ava', 'Mateo', 'Anne-Sophie'], [[], ['Anne-Sophie'], ['Anne-Sophie', 'Mateo', 'Ava']]],
      ['24 names', C24, [[], ['Maximiliano'], ['Maximiliano', 'Anne-Sophie', 'Oluwaseun']]], ['45 names', C45, [[], ['Jean-Baptiste'], ['Jean-Baptiste', 'Maximiliano', 'Anne-Sophie']]],
      ['long names', LONG, [[], [LONG[0]], LONG.slice(0, 3)]]];
    let stamp = Date.now() - 60000;
    const put = (names, picked, k) => page.evaluate(([ik, data, k]) => {
      const w = window.__board21.state.wins.get(ik);
      w.post('config', { config: Object.assign({}, window.__board21.state.conf.get(ik), { winners: k }), reason: 'remote' });
      w.post('data', { data, reason: 'remote' });
    }, [IK, { names, left: names.filter(n => !picked.includes(n)), picked, pickId: (stamp++).toString(36) + '-fit', current: picked[0] || null }, k]);
    const fitBad = [];
    let fitCount = 0;
    const checkFit = async (where, names, picked, k) => {
      await put(names, picked, k); await page.waitForTimeout(450);
      const L = await look(), sz = where.split(' ')[0], f = FLOOR[sz], tag = `${where}, ${names.length} names, ${picked.length ? picked.length + ' winner' + (picked.length > 1 ? 's' : '') : 'before a pick'}`;
      fitCount++;
      if (JSON.stringify(L.names.map(n => n && n.text)) !== JSON.stringify(picked.length ? picked : Array(k).fill(null))) fitBad.push(`${tag}: tray shows ${L.names.map(n => n && n.text)}`);
      if (L.socks !== (picked.length || k)) fitBad.push(`${tag}: ${L.socks} sockets`);
      for (const n of L.names.filter(Boolean)) {
        const long = n.text.length > 20, floor = picked.length > 3 ? f[4] : f[(long ? 2 : 0) + (picked.length > 1 ? 1 : 0)];
        if (n.out > 1 || n.outStage > 0) fitBad.push(`${tag}: “${n.text}” sticks out by ${Math.round(Math.max(n.out, n.outStage))} px`);
        if (n.fs < floor) fitBad.push(`${tag}: “${n.text}” is only ${Math.round(n.fs)} px (at least ${floor})`);
        if (n.fill < 0.85) fitBad.push(`${tag}: “${n.text}” fills only ${Math.round(n.fill * 100)}% of its place`);
        if (long && n.lines !== 2) fitBad.push(`${tag}: “${n.text}” isn’t on two lines`);
      }
      const rows = L.names.filter(Boolean).sort((a, b) => a.top - b.top);
      if (rows.some((n, j) => j && n.top < rows[j - 1].bottom - 1)) fitBad.push(`${tag}: names overlap`);
      if (L.balls.some(b => b.where === 'loose' || b.inStage === false)) fitBad.push(`${tag}: a ball is outside the drum and the tray`);
      if (L.overlap || !L.trayIn) fitBad.push(`${tag}: the drum and the tray overlap or the tray is cut off`);
      return L;
    };
    let small = null;   // (the smallest window with 45 names)
    const fitAll = async where => {
      for (const [, names, picks] of CASES) for (const picked of picks) {
        const L = await checkFit(where, names, picked, Math.max(1, picked.length));
        if (where.startsWith('260') && names.length === 45 && !picked.length) small = L;
      }
    };
    await size(260, 200); await fitAll('260x200 window');
    // A long name with no space doesn't run off the tray in the smallest window: it goes onto two lines at a hyphen,
    // or with no hyphen either, in the middle of the word. A name too long even for that gets smaller letters still.
    const NOSPACE = ['Wolfeschlegelsteinhausenbergerdorff', 'Maximiliana-Guadalupe-Fernández', 'Christopher-Alexander', 'Bo', 'Ava'];
    const HUGE = ['Wolfeschlegelsteinhausenbergerdorffwelchevoralternwarengewissenhaftschafers', 'Maximiliana-Guadalupe-Fernández-Oyelaran-Montgomery-Williams', 'Bo'];
    const cutOff = [];
    for (const [list, k] of [[NOSPACE, 1], [NOSPACE, 3], [NOSPACE, 5], [HUGE, 1], [HUGE, 3]]) {
      await put(list, list.slice(0, k), k); await page.waitForTimeout(450);
      const L = await look();
      if (JSON.stringify(L.names.map(n => n && n.text)) !== JSON.stringify(list.slice(0, k))) cutOff.push(`${k}: tray shows ${L.names.map(n => n && n.text)}`);
      for (const n of L.names.filter(Boolean)) {
        if (n.out > 1 || n.outStage > 0) cutOff.push(`${k}: “${n.text}” sticks out by ${Math.round(Math.max(n.out, n.outStage))} px`);
        if (list === NOSPACE && k === 3 && n.fs < 7) cutOff.push(`${k}: “${n.text}” is only ${n.fs.toFixed(1)} px`);   // (with 5, the rows are too low for more)
      }
      if (k === 3 && L.names[1].lines !== 2) cutOff.push(`“${list[1]}” isn’t on two lines`);
      if (list === HUGE && k === 3 && !/-$/.test(await inFrame(() => (document.querySelectorAll('.lotto-name')[1].querySelector('.lotto-two > span') || {}).textContent || ''))) cutOff.push(`“${HUGE[1]}” isn’t broken at a hyphen`);
    }
    ok(!cutOff.length, `in the smallest window a long name with no space breaks onto two lines, never cut off at the edge${cutOff.length ? ': ' + cutOff.join(' | ') : ''}`);
    await size(420, 320); await fitAll('420x320 window');
    await size(0, 0); await fitAll('1366x768 board');
    for (const k of [5]) await checkFit('1366x768 board', C45, ['Jean-Baptiste', 'Maximiliano', 'Anne-Sophie', 'Oluwaseun', 'Valentina'].slice(0, k), k);
    await page.screenshot({ path: OUT + 'name-picker-lotto-5-winners.png' });
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(600);
    await fitAll('1920x1080 board');
    await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(400);
    ok(!fitBad.length, `it fits and stays readable at 260×200, 420×320 and filling the board at 1366×768 and 1920×1080, with 1, 3, 24, 45 and very long names (${fitCount} cases)${fitBad.length ? ': ' + fitBad.join(' | ') : ''}`);
    ok(small.balls.filter(b => b.where === 'drum').length === 45 && small.balls.every(b => b.d < 10), `in the smallest window a class of 45 still fits in the drum (balls ${Math.round(Math.max(...small.balls.map(b => b.d || 0)))} px: only decoration there)`);

    // ---- Dark theme: the board's dark colours; the initials stay dark on the light balls.
    await size(640, 400);
    await put(C24, ['Maximiliano', 'Anne-Sophie', 'Oluwaseun'], 3); await page.waitForTimeout(400);
    const colours = () => inFrame(() => {
      const c = s => getComputedStyle(document.querySelector(s));
      return { theme: document.documentElement.getAttribute('data-b21-theme'), tray: c('.lotto-tray').backgroundColor, name: c('.lotto-name').color, ink: c('.lotto-face').color,
        row: c('.lotto-row.lotto-on').boxShadow, bg: getComputedStyle(document.documentElement).getPropertyValue('--b21-bg').trim(), text: getComputedStyle(document.documentElement).getPropertyValue('--b21-text').trim() };
    });
    const light = await colours();
    await setTheme(page, 'dark'); await page.waitForTimeout(100);
    const dark = await colours();
    const rgb = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';
    ok(dark.theme === 'dark' && dark.tray === rgb(dark.bg) && dark.name === rgb(dark.text) && dark.tray !== light.tray && dark.name !== light.name && dark.ink === 'rgb(17, 24, 39)' && light.ink === dark.ink && /251, 191, 36/.test(dark.row),
      `dark theme: the tray and names take the board’s dark colours (${dark.tray}, ${dark.name}), the winners’ rows dark-theme gold, the initials stay dark on the balls`);
    L = await look();
    ok(L.names.every(n => n.out <= 1) && !L.overlap, 'and everything still fits');
    await page.mouse.click(1000, 400);   // (an empty part of the board: no window selected, so no grips in the picture)
    await page.locator(`.win[data-ikey="${IK}"]`).screenshot({ path: OUT + 'name-picker-lotto-dark.png' });
    await setTheme(page, 'light'); await page.waitForTimeout(100);

    // ---- Text style: Settings → Text style → Easier to read reaches the names, the initials, the "?" and the tray's heading,
    // and the names are fitted again in the new letters.
    await size(420, 320);
    await put(C24, ['Maximiliano'], 1); await page.waitForTimeout(400);
    const w0 = (await look()).names[0];
    await openSettings(page, ['letters']);
    await page.click('#settings [data-act="letters"][data-val="legible"]');
    await page.keyboard.press('Escape');
    ok(await eventually(async () => await inFrame(() => Array.from(document.fonts).some(f => f.family.replace(/"/g, '') === 'Atkinson Hyperlegible' && f.status === 'loaded'))), 'Easier to read: the letters load in the widget');
    await page.waitForTimeout(500);
    const fonts = await inFrame(() => ['.lotto-name .lotto-text', '.lotto-face', '.lotto-head', '.lotto-sock'].map(s => getComputedStyle(document.querySelector(s)).fontFamily));
    L = await look();
    ok(fonts.every(f => f.startsWith('"Atkinson Hyperlegible"')), `its names, initials, “?” and heading are in them (${fonts.map(f => f.split(',')[0]).join(', ')})`);
    ok(L.names[0].out <= 1 && L.names[0].fill >= 0.85 && L.names[0].fs !== w0.fs, `and the name is fitted again in the new letters (${Math.round(w0.fs)} px, now ${Math.round(L.names[0].fs)} px, filling ${Math.round(L.names[0].fill * 100)}%)`);
    await page.mouse.click(1000, 400);
    await page.locator(`.win[data-ikey="${IK}"]`).screenshot({ path: OUT + 'name-picker-lotto-letters.png' });
    if (errors.length) ok(false, 'no page errors or console errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- Reduce motion: no show, the winners fade straight in and nothing moves. Sound ticked while the device
    // refuses sound: nothing goes wrong.
    errors.length = 0;
    const rctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    await rctx.addInitScript(() => { window.AudioContext = function () { throw new Error('no sound here'); }; window.webkitAudioContext = window.AudioContext; });
    const rp = await rctx.newPage(); watch(rp, 'reduce motion');
    await rp.goto(BASE); await boardUp(rp); await freeBoard(rp);
    await rp.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(rp)) || {}).style === 'wheel');
    await np(rp).locator('#list').fill(C12.join('\n')); await np(rp).locator('#done').click();
    await menu('style:lotto', rp); await menu('sound', rp); await size(640, 400, rp);
    for (const k of [1, 5]) {
      await menu('winners:' + k, rp);
      const s = await pickNow(rp), was = await showing(rp);
      const L0 = await look(rp); await rp.waitForTimeout(500); const L1 = await look(rp);
      const fade = await inFrame(() => [...document.querySelectorAll('.lotto-name')].filter(n => n.querySelector('.lotto-text')).every(n => n.classList.contains('lotto-fade')), rp);
      bad = await landsOn(s, C12, rp);
      ok(!was && !bad.length && fade && JSON.stringify(L0.balls.map(b => b.at)) === JSON.stringify(L1.balls.map(b => b.at)),
        `with reduce motion, ${k} winner${k > 1 ? 's' : ''}: no show, the names fade straight into the tray and no ball moves${bad.length ? ': ' + bad.join('; ') : ''}`);
    }
    await menu('style:name', rp); await menu('style:lotto', rp);
    ok(!(await landsOn(await saved(rp), C12, rp)).length, 'and a Lotto mounted again shows the same pick');
    await rctx.close();
    const actx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await actx.addInitScript(() => { window.AudioContext = function () { throw new Error('no sound here'); }; window.webkitAudioContext = window.AudioContext; });
    const ap = await actx.newPage(); watch(ap, 'no sound');
    await ap.goto(BASE); await boardUp(ap); await freeBoard(ap);
    await ap.evaluate(() => window.__board21.openWidget('name-picker'));
    await eventually(async () => ((await conf(ap)) || {}).style === 'wheel');
    await np(ap).locator('#list').fill(C12.join('\n')); await np(ap).locator('#done').click();
    await menu('style:lotto', ap); await menu('sound', ap); await menu('winners:3', ap); await menu('quick', ap);
    st = await pickNow(ap); await idle(ap);
    ok(!(await landsOn(st, C12, ap)).length, 'Sound ticked on a device that refuses sound: the show runs and lands on the winners');
    if (errors.length) ok(false, 'no page errors or console errors (and none from sound that can’t start): ' + errors.join(' | '));
    else ok(true, 'no page errors or console errors, in any of it (and none from sound that can’t start)');
    await actx.close();
  }],
  ];
};
