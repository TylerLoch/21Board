// Name Picker: its styles, winners, Groups, and layouts.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, freeBoard, openSettings, setTheme, setCornerClock, hear, heard, eventually, parts,
    boardUp, BASE
  } = T;
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
    const menu = async (id, p = page, ik = 'name-picker:1') => { await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.click(`#menu [data-id="${id}"]`); await p.waitForTimeout(250); };
    // The window's menu as the board has it: "Label", "Label ✓" (ticked), "Label (off)" (can't be used), "# Heading", "—" (a line),
    // "[1 ✓ 2 3]" (a row of choices).
    const items = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems
      .map(i => i.separator ? '—' : i.heading ? '# ' + i.label : i.choices ? '[' + i.choices.map(c => c.label + (c.checked ? ' ✓' : '')).join(' ') + ']'
        : i.label + (i.checked ? ' ✓' : '') + (i.disabled ? ' (off)' : '')).join(' | '), ik);
    const MENU = (style, n, { noRepeats = true, startOver = false, sound = false, quick = false } = {}) => ['Edit names', '—', '# Pick with',
      ...[['name', 'Big name'], ['wheel', 'Spinning wheel'], ['spotlight', 'Spotlight'], ['lotto', 'Lotto'], ['groups', 'Groups']].map(([id, label]) => label + (id === style ? ' ✓' : '')),
      '# Names at a time', '[' + [1, 2, 3, 4, 5, 6].map(k => k + (k === n ? ' ✓' : '')).join(' ') + ']', '—',
      'No repeats' + (noRepeats ? ' ✓' : ''), 'Start over' + (startOver ? '' : ' (off)'), 'Sound' + (sound ? ' ✓' : ''), 'Quick' + (quick ? ' ✓' : '')].join(' | ');
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
    ok(await eventually(async () => await items() === MENU('wheel', 1)), 'its menu: Edit names on top, “Pick with” the five ways, “Names at a time” 1 to 6 in a row, then No repeats, Start over, Sound, Quick: ' + await items());
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
    ok((await conf()).quick === true && await items() === MENU('wheel', 1, { quick: true, startOver: true }), 'Quick is ticked in the menu and saved');
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
    ok((await conf()).sound === true && await items() === MENU('name', 3, { sound: true }), 'Sound is ticked in the menu and saved');
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
  // ---- 2026.11.24-1: Groups, a fifth way to use the Name Picker: the names go into 2 to 6 random groups.
  ['Name Picker: Groups', async (browser) => {
    // Every sound a style asks the host for (the host plays it only with Sound ticked), the sounds the page starts, and
    // the notes it plays.
    const SPY = () => {
      window.__sounds = [];
      let np;
      Object.defineProperty(window, 'NamePicker', { configurable: true, get: () => np, set: v => {
        np = v;
        const register = v.register;
        v.register = function (id, style) {
          const mount = style.mount;
          style.mount = function (root, host) {
            const sound = host.sound;
            host.sound = function (name) { window.__sounds.push(name); return sound.apply(this, arguments); };
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
    const menu = async (id, p = page, ik = 'name-picker:1') => { await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.click(`#menu [data-id="${id}"]`); await p.waitForTimeout(250); };
    const items = (p = page, ik = 'name-picker:1') => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems
      .map(i => i.separator ? '—' : i.heading ? '# ' + i.label : i.choices ? '[' + i.choices.map(c => c.label + (c.checked ? ' ✓' : '')).join(' ') + ']'
        : i.label + (i.checked ? ' ✓' : '') + (i.disabled ? ' (off)' : '')).join(' | '), ik);
    const STYLES = [['name', 'Big name'], ['wheel', 'Spinning wheel'], ['spotlight', 'Spotlight'], ['lotto', 'Lotto'], ['groups', 'Groups']];
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

    // ---- Groups in the menu: a fifth way, its own row of numbers, and no No repeats or Start over.
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
      `Groups is a fifth way under Pick with; its row reads Groups, 2 to 6, 4 to start with; No repeats and Start over leave the menu (${await items()})`);
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
    await inFrame(() => { window.__sounds.length = 0; });
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
    let snd = await inFrame(() => ({ sounds: window.__sounds.slice(), notes: window.__notes || 0, audio: window.__audio || 0 }));
    ok(snd.sounds.filter(s => s === 'pop').length === 24 && snd.sounds.filter(s => s === 'chime').length === 1 && snd.sounds[snd.sounds.length - 1] === 'chime' && snd.notes === 0 && snd.audio === 0,
      `a pop as each name lands, then a chime (asked for: ${snd.sounds.filter(s => s === 'pop').length} pops, ${snd.sounds.filter(s => s === 'chime').length} chime), and with Sound off nothing plays`);
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
    await inFrame(() => { window.__sounds.length = 0; });
    await np().locator('#go').click(); await idle();
    snd = await inFrame(() => ({ sounds: window.__sounds.slice(), notes: window.__notes || 0, audio: window.__audio || 0 }));
    ok(snd.audio >= 1 && snd.notes - n0 >= 24 + 3 && snd.sounds.filter(s => s === 'pop').length === 24 && snd.sounds.filter(s => s === 'chime').length === 1,
      `with Sound on the pops and the chime play (${snd.notes - n0} notes)`);
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
      for (let i = 0; i < 400; i++) document.getElementById('go').click();
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
    ok(dataDoc.includes('`{ names, left, picked, pickId, current, groups, groupId }`') && dataDoc.includes('`{ noRepeats, style, winners, groups, quick, sound }`') && dataDoc.includes('`"groups"`'), 'docs/DATA-FORMAT.md gives its content and its config, Groups too');
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    ok(['Big name', 'Spinning wheel', 'Spotlight', 'Lotto', 'Groups'].every(s => readme.includes(s)), 'README.md names the five styles, Groups too');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await fctx.close();
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
    const menu = async (p, id, ik = IK) => { await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.click(`#menu [data-id="${id}"]`); await p.waitForTimeout(250); };
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
    const menu = async (p, id) => { await p.click(`.win[data-ikey="${IK}"] .win-label`); await p.click(`#menu [data-id="${id}"]`); await p.waitForTimeout(250); };
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
    const menu = async (id, p = page, ik = IK) => { await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.click(`#menu [data-id="${id}"]`); await p.waitForTimeout(250); };
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
