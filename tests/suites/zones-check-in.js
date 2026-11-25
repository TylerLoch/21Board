// Zones Check-In: the zones, check-ins, its layouts, and its templates.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, freeBoard, openSettings, setTheme, lockBoard, unlockBoard, setCornerClock, heard,
    eventually, release, stamped, STAMPED, boardUp, contrast, rgbOf, ZC, stubWeather, BASE
  } = T;
  return [
  // ---- Zones Check-In (2026.11.20-1). Students tap the zone that matches how they feel; the teacher sees how many.
  ['Zones Check-In: check in, −, the menu, Counts, two tabs', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const { K, zf, connected, saved, look, menuOf, choose } = ZC;
    await page.evaluate(() => window.__board21.openWidget('zones-check-in'));
    ok(await connected(page), 'the Zones Check-In opens from the board and connects');
    await page.evaluate(k => window.__board21.setRect(k, { x: 60, y: 60, w: 560, h: 460 }), K); await page.waitForTimeout(500);
    const z = zf(page);
    const MENU0 = 'Undo (off) | Start over (off) | Class size | Edit counts | — | [Ideas] | Blue zone | Green zone | Yellow zone | Red zone | — | ✓ Show counts | ✓ Clear each day | ☐ Sound';
    ok(await eventually(async () => await menuOf(page) === MENU0), `its menu: Undo, Start over, Class size, Edit counts, then Ideas for each zone, then Show counts (on), Clear each day (on), Sound (off) (${await menuOf(page)})`);
    let x = await look(page);
    ok(x.counts.join() === '0,0,0,0' && x.status === 'Tap your zone to check in' && x.title === '' && x.minus.every(m => m.disabled && m.shown), `it starts at none: “Tap your zone to check in”, no title, each “−” disabled (${JSON.stringify(x)})`);
    ok(!x.undoButton, `no Undo button on the board (${x.undoButton})`);

    // Four taps, one on each card.
    const tap = async (zone, p = page) => { await zf(p).locator(`.zone[data-z="${zone}"] .tap`).click(); await p.waitForTimeout(120); };
    for (const zone of ['blue', 'green', 'yellow', 'red']) await tap(zone);
    ok(await eventually(async () => JSON.stringify(((await saved(page)) || {}).counts) === '{"blue":1,"green":1,"yellow":1,"red":1}'), `four taps save { blue, green, yellow, red } (${JSON.stringify(((await saved(page)) || {}).counts)})`);
    x = await look(page);
    ok(x.counts.join() === '1,1,1,1' && x.status === '4 checked in' && x.title === '4 checked in', `the cards, the status line and the title follow: “4 checked in” (${x.counts}; ${x.status}; ${x.title})`);
    ok(/^\d{4}-\d{2}-\d{2}$/.test((await saved(page)).day) && (await saved(page)).undo.length === 4, `the day of the change and 4 steps for Undo are saved (${JSON.stringify(await saved(page))})`);
    ok(await menuOf(page) === MENU0.replace('Undo (off) | Start over (off)', 'Undo | Start over'), `Undo and Start over can now be chosen (${await menuOf(page)})`);

    // Class size 25, from the Counts view.
    await choose(page, 'Class size');
    ok(await eventually(() => z.locator('#edit').isVisible()), 'Class size opens the Counts view');
    await page.waitForTimeout(400);
    await z.locator('#n-size').fill('25');
    ok(await eventually(async () => ((await ZC.conf(page)) || {}).classSize === 25), 'a class size of 25 is saved as the widget’s setting');
    await z.locator('#edit-done').click(); await page.waitForTimeout(400);
    x = await look(page);
    ok(x.view === 'main' && x.status === '4 of 25 checked in' && x.title === '4 of 25', `Done: “4 of 25 checked in”, and the title says 4 of 25 (${x.status}; ${x.title})`);

    // "−" takes one away, and is disabled at 0.
    await z.locator('.zone[data-z="blue"] .minus').click(); await page.waitForTimeout(150);
    x = await look(page);
    ok(x.counts.join() === '0,1,1,1' && x.minus[0].disabled && !x.minus[1].disabled && x.status === '3 of 25 checked in', `“−” on Blue takes one away; at 0 it is disabled (${x.counts}; ${x.status})`);
    await z.locator('.zone[data-z="blue"] .minus').click({ force: true }).catch(() => {}); await page.waitForTimeout(150);
    ok((await look(page)).counts.join() === '0,1,1,1' && JSON.stringify((await saved(page)).counts) === '{"blue":0,"green":1,"yellow":1,"red":1}', 'a tap on the disabled “−” changes nothing');

    // A second tab shows each change.
    const page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push('tab 2: ' + e.message));
    await page2.goto(BASE); await boardUp(page2); await freeBoard(page2);
    ok(await connected(page2), '(a second tab, with the same window)');
    const same = async () => JSON.stringify((await look(page2)).counts) === JSON.stringify((await look(page)).counts) && (await look(page2)).status === (await look(page)).status;
    ok(await eventually(same), `the second tab shows the same counts (${(await look(page2)).counts})`);
    await tap('green'); await page.waitForTimeout(400); await tap('green');
    ok(await eventually(async () => (await look(page2)).counts.join() === '0,3,1,1' && (await look(page2)).status === '5 of 25 checked in'), `a tap in one tab shows in the other (${(await look(page2)).counts}; ${(await look(page2)).status})`);

    // Start over, then the menu's Undo, brings the counts back.
    await choose(page, 'Start over');
    x = await look(page);
    ok(x.counts.join() === '0,0,0,0' && x.status === 'Tap your zone to check in' && x.title === '', `Start over: every zone at 0 (${x.counts}; ${x.status})`);
    ok(await eventually(async () => (await look(page2)).counts.join() === '0,0,0,0'), 'and in the other tab');
    await choose(page, 'Undo');
    x = await look(page);
    ok(x.counts.join() === '0,3,1,1' && x.status === '5 of 25 checked in', `Undo in the menu brings the counts back (${x.counts}; ${x.status})`);
    ok(await eventually(async () => (await look(page2)).counts.join() === '0,3,1,1'), 'in both tabs');

    // One Undo after an editing session in Counts takes back the whole session, and only it.
    await tap('red');
    ok((await look(page)).counts.join() === '0,3,1,2', '(a tap on Red: 0, 3, 1, 2)');
    await choose(page, 'Edit counts'); await page.waitForTimeout(400);
    for (let i = 0; i < 3; i++) { await z.locator('.row[data-z="blue"] button[data-by="1"]').click(); await page.waitForTimeout(80); }
    await z.locator('#n-yellow').fill('7');
    await z.locator('.row[data-z="green"] button[data-by="-1"]').click();
    ok(await eventually(async () => JSON.stringify((await saved(page)).counts) === '{"blue":3,"green":2,"yellow":7,"red":2}'), `editing in Counts saves as it goes (${JSON.stringify((await saved(page)).counts)})`);
    await z.locator('#edit-done').click(); await page.waitForTimeout(400);
    await choose(page, 'Undo');
    ok((await look(page)).counts.join() === '0,3,1,2', `one Undo takes back the whole editing session, and only it (${(await look(page)).counts})`);
    await choose(page, 'Undo');
    ok((await look(page)).counts.join() === '0,3,1,1', `the next Undo takes back the tap before it (${(await look(page)).counts})`);
    ok(await eventually(async () => (await look(page2)).counts.join() === '0,3,1,1'), 'the other tab follows each Undo');

    // Show counts off: no numbers on the cards, no "−", and one color in the bar, for the total.
    x = await look(page);
    ok(x.shown.every(Boolean) && x.bar.zones.filter(w => w > 0).length === 3 && x.bar.all === 0, `with counts shown, the bar has each zone’s share in its color (${JSON.stringify(x.bar)})`);
    await choose(page, 'Show counts');
    x = await look(page);
    ok(x.shown.every(s => !s) && x.minus.every(m => !m.shown) && x.bar.zones.every(w => w === 0) && x.bar.all > 0, `Show counts off hides every card’s number and “−”, and the bar is one color for the total (${JSON.stringify(x)})`);
    ok(((await ZC.conf(page)) || {}).showCounts === false && /✓ Clear each day/.test(await menuOf(page)) && !/✓ Show counts/.test(await menuOf(page)), `saved as a setting, and the menu shows it off (${await menuOf(page)})`);
    ok(await eventually(async () => (await look(page2)).shown.every(s => !s)), 'the other tab hides them too');
    await tap('yellow');
    ok(await eventually(async () => JSON.stringify((await saved(page)).counts) === '{"blue":0,"green":3,"yellow":2,"red":1}') && (await look(page)).status === '6 of 25 checked in', `a tap still counts while they are hidden (${(await look(page)).status})`);
    ok(await eventually(async () => (await look(page2)).status === '6 of 25 checked in'), 'and shows in the other tab');
    await choose(page, 'Show counts');
    ok((await look(page)).shown.every(Boolean) && (await look(page)).counts.join() === '0,3,2,1', 'Show counts on again: the numbers are back');
    ok(!(await look(page)).undoButton && !(await look(page2)).undoButton, 'no Undo button on the board, in either tab');

    // Each card's feelings: the original page's words, in order, a face beside each.
    const feels = await z.locator('html').evaluate(() => Object.fromEntries(['blue', 'green', 'yellow', 'red'].map(id => [id,
      [...document.querySelectorAll(`.zone[data-z="${id}"] .feel`)].map(f => f.querySelector('i').textContent + ' ' + f.querySelector('b').textContent).join(', ')])));
    const FEELS = { blue: '😢 Sad, 😴 Tired, 🤒 Sick, 🐢 Slow', green: '🤓 Ready to Learn, 😌 Calm, 😊 Happy', yellow: '🤩 Elevated, 🤪 Silly, 😤 Frustrated', red: '😡 Angry, 😣 Intense, 🤯 Overwhelmed' };
    ok(JSON.stringify(feels) === JSON.stringify(FEELS), `each card’s feelings, a face beside each word, in order (${JSON.stringify(feels)})`);

    // Ideas: Blue's pill opens Blue's ideas, with the breathing circle (in for 4, then hold). Done goes back. The menu's
    // Red zone opens Red's.
    const ideas = () => z.locator('html').evaluate(() => ({ on: document.getElementById('ideas').classList.contains('on'), title: document.getElementById('idea-title').textContent,
      items: [...document.querySelectorAll('#idea-items li b')].map(b => b.textContent).join(', '), word: document.getElementById('breath-word').textContent, ball: +(/scale\(([\d.]+)\)/.exec(document.getElementById('ball').style.transform) || [0, 0])[1] }));
    await z.locator('.zone[data-z="blue"] .idea-btn').click(); await page.waitForTimeout(500);
    const i1 = await ideas();
    ok(i1.on && /Blue zone$/.test(i1.title) && i1.items === 'Drink water, Stretch, Belly breaths, Take a walk' && i1.word === 'Breathe in',
      `Blue’s Ideas: its four ideas, and the circle says “Breathe in” (${JSON.stringify(i1)})`);
    ok(await eventually(async () => (await ideas()).word === 'Hold', 7000) && (await ideas()).ball === 1 && i1.ball > 0 && i1.ball < 0.9,
      `about 4 s later it says “Hold”, the circle grown to full size (scale ${i1.ball} → ${(await ideas()).ball})`);
    await z.locator('#idea-done').click(); await page.waitForTimeout(400);
    ok((await look(page)).view === 'main', 'Done goes back to the cards');
    await choose(page, 'Red zone');
    const i2 = await ideas();
    ok(i2.on && /Red zone$/.test(i2.title) && i2.items === 'Take space, Breathe with the circle, Cool down, Talk to your teacher', `Red zone in the menu opens Red’s ideas (${JSON.stringify(i2)})`);
    await z.locator('#idea-done').click(); await page.waitForTimeout(400);

    // Everyone in: a class size of 6, with 6 checked in.
    await choose(page, 'Class size');
    await z.locator('#n-size').fill('6'); await z.locator('#edit-done').click(); await page.waitForTimeout(400);
    x = await look(page);
    ok(x.view === 'main' && x.status === 'Everyone’s checked in' && x.title === '6 of 6', `6 of a class of 6: “Everyone’s checked in” (${x.status}; ${x.title})`);
    await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'zones-check-in.png' });
    await page2.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Zones Check-In: taps (two at once, a hand resting on the board, a double touch, a drag)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const { K, zf, connected, look } = ZC;
    await page.evaluate(() => window.__board21.openWidget('zones-check-in'));
    ok(await connected(page), '(the Zones Check-In connects)');
    const put = () => page.evaluate(k => window.__board21.setRect(k, { x: 300, y: 80, w: 700, h: 560 }), K);
    await put(); await page.waitForTimeout(600);
    const z = zf(page);
    // Real touches, through Chromium's own input (CDP). touchStart lists every finger down; touchEnd the fingers that lift
    // (none listed: all of them).
    const cdp = await ctx.newCDPSession(page);
    const T = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const at = async (sel, dy = 15) => { const b = await z.locator(sel).boundingBox(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2 + dy) }; };
    const counts = async () => (await look(page)).counts;
    const rect = () => page.evaluate(k => { const r = window.__board21.state.insts.get(k).rect; return `${Math.round(r.x)},${Math.round(r.y)}`; }, K);
    const run = async (what, fn, want) => {
      await put(); await page.waitForTimeout(450);
      const P = {};
      for (const zone of ['blue', 'green', 'yellow', 'red']) P[zone] = await at(`.zone[data-z="${zone}"] .tap`);
      P.status = await at('#status', 0);
      const a = await counts(), r0 = await rect();
      await fn(P); await page.waitForTimeout(700);
      const b = await counts(), r1 = await rect(), d = b.map((v, i) => v - a[i]).join();
      return { d, moved: r0 !== r1, r0, r1 };
    };
    let r = await run('one touch', async P => { await T('touchStart', [{ ...P.blue, id: 1 }]); await page.waitForTimeout(70); await T('touchEnd', []); });
    ok(r.d === '1,0,0,0' && !r.moved, `a touch on Blue counts one (${r.d})`);
    r = await run('two at once', async P => {
      await T('touchStart', [{ ...P.blue, id: 1 }]); await page.waitForTimeout(30);
      await T('touchStart', [{ ...P.blue, id: 1 }, { ...P.red, id: 2 }]); await page.waitForTimeout(60);
      await T('touchEnd', [{ ...P.red, id: 2 }]); await page.waitForTimeout(30);
      await T('touchEnd', []);
    });
    ok(r.d === '1,0,0,1' && !r.moved, `two students touching Blue and Red at once: both count (${r.d})`);
    r = await run('a hand on the board', async P => {
      const rest = { x: 150, y: 420 };   // (the empty board, beside the window)
      await T('touchStart', [{ ...rest, id: 5 }]); await page.waitForTimeout(100);
      for (let i = 0; i < 2; i++) { await T('touchStart', [{ ...rest, id: 5 }, { ...P.green, id: 6 + i }]); await page.waitForTimeout(80); await T('touchEnd', [{ ...P.green, id: 6 + i }]); await page.waitForTimeout(500); }
      await T('touchEnd', []);
    });
    ok(r.d === '0,2,0,0', `taps on Green while a hand rests on the board: each counts (${r.d})`);
    r = await run('a hand on the window', async P => {
      await T('touchStart', [{ ...P.status, id: 5 }]); await page.waitForTimeout(100);
      await T('touchStart', [{ ...P.status, id: 5 }, { ...P.yellow, id: 6 }]); await page.waitForTimeout(80); await T('touchEnd', [{ ...P.yellow, id: 6 }]); await page.waitForTimeout(300);
      await T('touchEnd', []);
    });
    ok(r.d === '0,0,1,0' && !r.moved, `a tap on Yellow while a hand rests on the window’s check-in line counts, and the window stays (${r.d}${r.moved ? `; moved ${r.r0} → ${r.r1}` : ''})`);
    r = await run('a double touch', async P => {
      for (let i = 0; i < 2; i++) { await T('touchStart', [{ ...P.yellow, id: 10 + i }]); await page.waitForTimeout(50); await T('touchEnd', []); await page.waitForTimeout(60); }
    });
    ok(r.d === '0,0,1,0', `a double touch on one card counts once (${r.d})`);
    // Two students on one card at once: both fingers down together, lifting together or a moment apart. Both count.
    for (const lift of [0, 100]) {
      r = await run('two on one card', async () => {
        const g = await z.locator('.zone[data-z="green"] .tap').boundingBox(), y = Math.round(g.y + g.height * 0.6);
        const L = { x: Math.round(g.x + g.width * 0.2), y, id: 20 }, R = { x: Math.round(g.x + g.width * 0.8), y, id: 21 };
        await T('touchStart', [L]); await page.waitForTimeout(30);
        await T('touchStart', [L, R]); await page.waitForTimeout(150);
        if (lift) { await T('touchEnd', [L]); await page.waitForTimeout(lift); }
        await T('touchEnd', []);
      });
      ok(r.d === '0,2,0,0' && !r.moved, `two students touching Green at once, lifting ${lift ? lift + ' ms apart' : 'together'}: both count (${r.d})`);
    }
    r = await run('a drag', async P => {
      await T('touchStart', [{ ...P.green, id: 1 }]);
      for (let i = 1; i <= 10; i++) { await page.waitForTimeout(16); await T('touchMove', [{ x: P.green.x + 12 * i, y: P.green.y + 6 * i, id: 1 }]); }
      await page.waitForTimeout(30); await T('touchEnd', []);
    });
    ok(r.d === '0,0,0,0' && r.moved, `a touch drag from a card moves the window and counts nothing (${r.d}; ${r.r0} → ${r.r1})`);
    r = await run('a tap after the drag', async P => { await T('touchStart', [{ ...P.red, id: 1 }]); await page.waitForTimeout(70); await T('touchEnd', []); });
    ok(r.d === '0,0,0,1', `the next tap counts as usual (${r.d})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Zones Check-In: a crafted file, and a new day', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const { zf, saved, look, menuOf, choose } = ZC;
    const evil = '"><img src=x onerror="top.document.title=\'PWNED\'">';
    const win = (i, data, config) => ({ widgetId: 'zones-check-in', instance: i + 1, open: true, z: i + 1, rect: { x: 10 + (i % 3) * 450, y: 10 + Math.floor(i / 3) * 370, w: 440, h: 360 }, data, config });
    const BIG = Array.from({ length: 200000 }, (_, k) => k % 7 ? [k % 10000, 1e9, -3, 2.5] : 'x');
    const HOSTILE = [
      [{ day: 'yesterday', counts: { blue: '7', green: -3, yellow: 1e9, red: 2.5 }, undo: BIG }, { classSize: 1e9, showCounts: 'no', daily: 'off', sound: 'yes' }],
      [{ day: ['2026-11-20'], counts: [5, 6, 7, 8], undo: { 0: [1, 2, 3, 4], length: 1 } }, [25, true]],
      [{ day: evil, counts: { blue: evil, green: true, yellow: [3], red: { n: 4 } }, undo: [[1, 2, 3], 'x', null, [1e9, -1, 2.5, '4'], [1, 2, 3, 4, 5], [[1], {}, 'a', 7]] }, { classSize: -4, showCounts: 0, daily: null, sound: 1 }],
      [{ day: 20261120, counts: { blue: 12, green: 1e300, yellow: 9999, red: 10000 }, undo: Array.from({ length: 50 }, (_, k) => [k, k, k, k]) }, { classSize: 30.5, showCounts: false }],
      [{ PROTO: { counts: { blue: 50 } }, counts: { PROTO: { blue: 9 }, green: 2 }, undo: [] }, { PROTO: { showCounts: false, classSize: 30 } }],
      ['just text', 'text'],
      [null, null]
    ];
    const crafted = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Zones from a file' }, instances: HOSTILE.map(([d, c], i) => win(i, d, c)) };
    fs.writeFileSync(OUT + 'zones-crafted.21board', JSON.stringify(crafted).replace(/"PROTO"/g, '"__proto__"'));
    await page.setInputFiles('#import-input', OUT + 'zones-crafted.21board'); await page.waitForTimeout(300);
    await page.click('#modal .btn:has-text("Replace this page")');
    const keys = HOSTILE.map((_, i) => 'zones-check-in:' + (i + 1));
    ok(await eventually(async () => (await Promise.all(keys.map(k => ZC.connected(page, k, 300)))).every(Boolean), 20000), 'a crafted file opens: all its Zones Check-In windows start');
    await page.waitForTimeout(800);
    const fine = n => Number.isInteger(n) && n >= 0 && n <= 9999;
    const statusOk = s => /^(Tap your zone to check in|\d{1,5} checked in|\d{1,5} of \d{1,2} checked in|Everyone’s checked in)$/.test(s) && (!/ of (\d+)/.test(s) || +/ of (\d+)/.exec(s)[1] <= 99);
    const drawn = [];
    for (const k of keys) {
      const x = await look(page, k);
      const made = await zf(page, k).locator('html').evaluate(() => document.querySelectorAll('img, [onerror], [onload]').length);
      if (!(x.counts.every(fine) && statusOk(x.status) && made === 0)) drawn.push(`${k}: ${JSON.stringify(x.counts)} “${x.status}”${made ? `, ${made} elements made` : ''}`);
    }
    ok(!drawn.length && await page.title() !== 'PWNED', `every window draws safely: each count a whole number from 0 to 9999, a class size of 99 at most, nothing from the file as markup (${drawn.join(' | ') || keys.length + ' windows'})`);
    const x1 = await look(page, keys[0]), x4 = await look(page, keys[3]), x5 = await look(page, keys[4]);
    ok(x1.counts.join() === '0,0,9999,0' && x1.status === '9999 of 99 checked in' && x4.counts.join() === '12,9999,9999,9999' && x5.counts.join() === '0,2,0,0',
      `only whole numbers count, 9999 at most, and a class size of 99 at most (${x1.counts}, “${x1.status}” | ${x4.counts} | ${x5.counts})`);
    ok(x1.shown.every(Boolean) && x4.shown.every(s => !s) && x5.shown.every(Boolean), 'Show counts is on unless the file says false');
    // Each window's Undo keeps at most 20 changes of four counts: a tap saves what the widget kept.
    for (const k of keys) { await zf(page, k).locator('.zone[data-z="blue"] .tap').click(); await page.waitForTimeout(150); }
    await page.waitForTimeout(600);
    const kept = [];
    for (const k of keys) {
      const d = await saved(page, k);
      if (!(d && d.undo.length <= 20 && d.undo.every(u => Array.isArray(u) && u.length === 4 && u.every(fine)) && Object.values(d.counts).every(fine) && Object.keys(d.counts).join() === 'blue,green,yellow,red' && /^\d{4}-\d{2}-\d{2}$/.test(d.day)))
        kept.push(`${k}: ${JSON.stringify(d).slice(0, 160)}`);
    }
    ok(!kept.length, `after a tap, each window saves four whole counts, today’s date and an Undo of 20 changes at most (${kept.join(' | ') || keys.length + ' windows'})`);
    const u1 = (await saved(page, keys[0])).undo, u4 = (await saved(page, keys[3])).undo;
    ok(u1.length === 20 && u4.length === 20 && JSON.stringify(u4[u4.length - 1]) === '[12,9999,9999,9999]', `200,000 changes in a file: Undo keeps the last 20 (${u1.length}, ${u4.length}; the last ${JSON.stringify(u4[u4.length - 1])})`);
    ok(await menuOf(page, keys[0]) !== '' && /^Undo \| Start over/.test(await menuOf(page, keys[0])), `(its menu works: ${await menuOf(page, keys[0])})`);
    ok(await page.title() !== 'PWNED', 'nothing in the file ran');

    // A new day. Content saved yesterday: with Clear each day on (the default) it shows as none, and the first tap
    // starts today's counts. With it off, yesterday's counts show.
    const yesterday = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    const OLD = { day: yesterday, counts: { blue: 3, green: 5, yellow: 0, red: 2 }, undo: [[3, 4, 0, 2]] };
    const days = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Yesterday' }, instances: [win(0, OLD, null), win(1, OLD, { classSize: 0, showCounts: true, daily: false, sound: false })] };
    await page.evaluate(f => window.__board21.applyImport(f, 'replace'), days);
    ok(await eventually(async () => (await Promise.all(['zones-check-in:1', 'zones-check-in:2'].map(k => ZC.connected(page, k, 300)))).every(Boolean)), '(two windows, both saved yesterday: Clear each day on, and off)');
    await page.waitForTimeout(600);
    let a = await look(page, 'zones-check-in:1'), b = await look(page, 'zones-check-in:2');
    ok(a.counts.join() === '0,0,0,0' && a.status === 'Tap your zone to check in' && /^Undo \(off\) \| Start over \(off\)/.test(await menuOf(page, 'zones-check-in:1')),
      `Clear each day on: yesterday’s counts show as none, with nothing to undo (${a.counts}; ${a.status}; ${await menuOf(page, 'zones-check-in:1')})`);
    ok(b.counts.join() === '3,5,0,2' && b.status === '10 checked in', `Clear each day off: yesterday’s counts show (${b.counts}; ${b.status})`);
    await zf(page, 'zones-check-in:1').locator('.zone[data-z="green"] .tap').click();
    const today = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    ok(await eventually(async () => JSON.stringify(await saved(page, 'zones-check-in:1')) === JSON.stringify({ day: today, counts: { blue: 0, green: 1, yellow: 0, red: 0 }, undo: [[0, 0, 0, 0]] })),
      `the first tap starts today’s counts (${JSON.stringify(await saved(page, 'zones-check-in:1'))})`);
    await choose(page, 'Undo', 'zones-check-in:1');
    a = await look(page, 'zones-check-in:1');
    ok(a.counts.join() === '0,0,0,0', `and Undo goes back to none, not to yesterday (${a.counts})`);
    // Clear each day turned on in the second window: yesterday's counts go.
    await choose(page, 'Clear each day', 'zones-check-in:2');
    b = await look(page, 'zones-check-in:2');
    ok(b.counts.join() === '0,0,0,0' && ((await ZC.conf(page, 'zones-check-in:2')) || {}).daily === true, `turning Clear each day on hides yesterday’s counts (${b.counts})`);
    await choose(page, 'Clear each day', 'zones-check-in:2');
    ok((await look(page, 'zones-check-in:2')).counts.join() === '3,5,0,2', 'and off again shows them');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Zones Check-In: a Blank template, Board history, offline', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const { K, zf, connected, look, choose } = ZC;
    await page.evaluate(() => window.__board21.history.cfg({ quiet: 36e5, every: 36e5, skipOpen: true }));   // (no automatic versions meanwhile)
    await page.evaluate(() => window.__board21.openWidget('zones-check-in'));
    ok(await connected(page), '(the Zones Check-In connects)');
    await page.evaluate(k => window.__board21.setRect(k, { x: 60, y: 60, w: 560, h: 460 }), K); await page.waitForTimeout(500);
    const z = zf(page);
    // Blue 2, Green 9, Yellow 4, Red 1, typed in Counts, with a class size of 25.
    await choose(page, 'Edit counts'); await page.waitForTimeout(400);
    for (const [id, n] of [['size', 25], ['blue', 2], ['green', 9], ['yellow', 4], ['red', 1]]) await z.locator('#n-' + id).fill(String(n));
    await z.locator('#edit-done').click(); await page.waitForTimeout(400);
    ok((await look(page)).counts.join() === '2,9,4,1' && (await look(page)).status === '16 of 25 checked in', `(Blue 2, Green 9, Yellow 4, Red 1: ${(await look(page)).status})`);
    await choose(page, 'Clear each day'); await choose(page, 'Sound');
    await page.waitForTimeout(400);

    // A Blank template keeps the window and its settings, never the counts.
    const full = await page.evaluate(() => window.__board21.buildExport('full')), tpl = await page.evaluate(() => window.__board21.buildExport('template'));
    const fi = full.instances.find(i => i.widgetId === 'zones-check-in'), ti = tpl.instances.find(i => i.widgetId === 'zones-check-in');
    const CONF = '{"classSize":25,"showCounts":true,"daily":false,"sound":true}';
    ok(!!fi && JSON.stringify(fi.data.counts) === '{"blue":2,"green":9,"yellow":4,"red":1}' && JSON.stringify(fi.config) === CONF, `a full export has the counts and the settings (${JSON.stringify(fi && fi.data && fi.data.counts)})`);
    ok(!!ti && ti.data === null && JSON.stringify(ti.config) === CONF && !JSON.stringify(tpl).includes('"counts"'), `a Blank template has the settings and no counts (${JSON.stringify(ti)})`);
    await page.evaluate(f => window.__board21.applyImport(f, 'add'), tpl);
    ok(await eventually(() => connected(page, 'zones-check-in:2', 300)), '(the template, added to the page)');
    await page.waitForTimeout(500);
    const t2 = await look(page, 'zones-check-in:2');
    ok(t2.counts.join() === '0,0,0,0' && t2.status === 'Tap your zone to check in' && /✓ Sound/.test(await ZC.menuOf(page, 'zones-check-in:2')), `its window starts at none, with the template’s settings (${t2.counts}; ${await ZC.menuOf(page, 'zones-check-in:2')})`);
    await page.evaluate(() => window.__board21.closeWin('zones-check-in:2')); await page.waitForTimeout(300);

    // Board history: the window's line names the zones with check-ins.
    await openSettings(page);
    await page.click('#settings [data-act="hist-open"]'); await page.waitForSelector('#history.open [data-act="save"]');
    await page.click('#history [data-act="save"]'); await page.waitForSelector('#modal.open input');
    await page.fill('#modal.open input', 'Morning check-in'); await page.click('#modal.open .btn.primary');
    await page.locator('#toasts .toast', { hasText: 'Version saved.' }).waitFor();
    const vid = await page.evaluate(async () => { await window.__board21.history.reload(); const m = window.__board21.history.metas.find(m => m.manual); return m && m.id; });
    await page.locator(`#history .hist-row[data-val="${vid}"]`).click();
    await page.waitForSelector('#history-detail.open .inst');
    const rows = Object.fromEntries(await page.$$eval('#history-detail.open .inst .meta', els => els.map(e => [e.querySelector('b').textContent, e.querySelector('span').textContent])));
    ok(rows['Zones Check-In'] === 'Blue 2, Green 9, Yellow 4, Red 1', `Board history: “Blue 2, Green 9, Yellow 4, Red 1” (${JSON.stringify(rows)})`);
    await page.waitForTimeout(500); await page.screenshot({ path: OUT + 'zones-history.png' });
    for (let k = 0; k < 4 && await page.locator('#settings.open, #history.open, #history-detail.open').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await choose(page, 'Start over');
    ok((await look(page)).counts.join() === '0,0,0,0', '(Start over: all at 0)');
    await page.evaluate(() => window.__board21.history.save('After Start over')); await page.waitForTimeout(800);
    const zero = await page.evaluate(async k => { await window.__board21.history.reload(); const m = window.__board21.history.metas.find(m => m.label === 'After Start over'); return m && m.wins && m.wins[k] ? m.wins[k][5] : null; }, K);
    ok(zero === '', `and none for a version with every zone at 0 (${JSON.stringify(zero)})`);

    // A new day. With Clear each day on, counts from a day before the version's show as none in the window, and so in its
    // line. A version saved that day has them. With Clear each day off, they show.
    const dates = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(9, 0, 0, 0);
      return { day: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), at: d.toISOString() }; });
    const OLD = { day: dates.day, counts: { blue: 3, green: 5, yellow: 0, red: 2 }, undo: [] };
    const one = (config, exportedAt) => ({ format: '21board', formatVersion: 1, kind: 'full', exportedAt, board: { name: 'Morning' },
      instances: [{ widgetId: 'zones-check-in', instance: 1, open: true, z: 1, rect: { x: 60, y: 60, w: 560, h: 460 }, data: OLD, config }] });
    const lineOf = exp => page.evaluate(([exp, k]) => window.__board21.history.winsOf(exp)[k][5], [exp, K]);
    const nowAt = new Date().toISOString(), ON = { classSize: 0, showCounts: true, daily: true, sound: false };
    const days = [await lineOf(one(ON, nowAt)), await lineOf(one(null, nowAt)), await lineOf(one(ON, dates.at)), await lineOf(one(Object.assign({}, ON, { daily: false }), nowAt))];
    ok(days.join(' | ') === ' |  | Blue 3, Green 5, Red 2 | Blue 3, Green 5, Red 2',
      `yesterday’s counts: no line today with Clear each day on (or no settings), their line in a version from yesterday, and with it off (${JSON.stringify(days)})`);
    await page.evaluate(f => window.__board21.applyImport(f, 'replace'), one(ON, nowAt));
    ok(await eventually(() => connected(page)), '(this morning: a window whose counts are from yesterday)');
    await page.waitForTimeout(600);
    await page.click(`.win[data-ikey="${K}"] .win-label`); await page.click('#menu [data-act="history"]');
    await page.waitForSelector('#history.open .inst .meta');
    const now = await page.$$eval('#history.open .inst .meta', els => els.map(e => e.querySelector('b').textContent + ': ' + e.querySelector('span').textContent)[0]);
    const shows = await look(page);
    ok(shows.counts.join() === '0,0,0,0' && now === 'Now: (empty)', `Earlier versions… says what the window shows: none (${shows.counts}; “${now}”)`);
    for (let k = 0; k < 4 && await page.locator('#settings.open, #history.open, #history-detail.open').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }

    // The offline copy has its page, and the release stamp matches.
    const vm = require('vm');
    const box = { addEventListener() {} }; box.self = box;
    box.importScripts = (...files) => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), box));
    vm.createContext(box);
    const list = vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') + '\n;PRECACHE;', box);
    ok(list.includes('widgets/zones-check-in/index.html'), 'its page is in the offline copy (sw.js PRECACHE)');
    ok(stamped(), STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Zones Check-In: the registry, and its layout (260 × 220, the default size, very wide, very tall, filling the board unlocked and locked, light and dark)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const { K, zf, connected, look, choose } = ZC;
    // The registry entry, and the widget's own manifest block matches it.
    const reg = await page.evaluate(() => { const a = window.__board21.catalog().find(w => w.id === 'zones-check-in'); return a && { name: a.name, version: a.version, entry: a.entry, files: a.files, clash: a.clash, permissions: a.permissions, win: a.win, color: a.color, icon: a.icon, external: !!a.external, single: !!a.single, description: a.description }; });
    ok(!!reg && reg.name === 'Zones Check-In' && reg.version === '1.0.0' && reg.entry === 'widgets/zones-check-in/index.html' && JSON.stringify(reg.files) === '["widgets/zones-check-in/index.html"]' && !reg.clash &&
      reg.permissions.length === 0 && !reg.external && !reg.single && reg.win.width === 560 && reg.win.height === 420 && reg.win.minWidth === 260 && reg.win.minHeight === 220 && !reg.win.aspectRatio && reg.win.dragFromContent !== false,
      `it is in the registry as Zones Check-In: one file, no clash (Board Sync keeps both), not single, 560 × 420, at least 260 × 220 (${JSON.stringify(reg && reg.win)})`);
    ok(!!reg && reg.description === 'Check in on how your class feels.', `its tooltip: “Check in on how your class feels.” (${reg && reg.description})`);
    const src = fs.readFileSync(path.join(ROOT, 'widgets', 'zones-check-in', 'index.html'), 'utf8');
    const mf = /<script type="application\/json" id="board21-widget">([\s\S]*?)<\/script>/.exec(src), manifest = mf ? JSON.parse(mf[1]) : {};
    ok(!!reg && manifest.id === 'zones-check-in' && manifest.name === reg.name && manifest.version === reg.version && manifest.description === reg.description && manifest.color === reg.color &&
      ['width', 'height', 'minWidth', 'minHeight'].every(k => (manifest.window || {})[k] === reg.win[k]) && /<title>Zones Check-In<\/title>/.test(src), 'its manifest block matches the registry entry');
    const others = await page.evaluate(() => window.__board21.catalog().filter(w => w.id !== 'zones-check-in').map(w => String(w.color || '').toLowerCase()));
    ok(!!reg && /^<svg viewBox="0 0 24 24">/.test(reg.icon) && contrast('rgb(255, 255, 255)', rgbOf(reg.color)) >= 4.5 && !others.includes(reg.color.toLowerCase()), `its tile is a color of its own (${reg && reg.color}), the white icon readable on it`);
    const order = await page.evaluate(() => window.BOARD21_WIDGETS.map(w => w.id));
    ok(order.indexOf('zones-check-in') === order.indexOf('first-then-board') + 1, 'it follows the First/Then Board in the registry');
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' '), dataDoc = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-FORMAT.md'), 'utf8').replace(/\s+/g, ' ');
    const row = (/\| \*\*Zones Check-In\*\* \|[^|]*\|/.exec(readme) || [''])[0];
    ok(readme.indexOf(row) > readme.indexOf('| **First/Then Board** |') && readme.indexOf(row) < readme.indexOf('## Adding a widget') && /\*content\*/.test(row) && /the last 20 changes/.test(row),
      `the README’s Included widgets has a Zones Check-In row after the First/Then Board (${row.slice(0, 90)}…)`);
    ok(dataDoc.includes('`{ day, counts: { blue, green, yellow, red }, undo }`') && dataDoc.includes('`{ classSize, showCounts, daily, sound }`'), 'docs/DATA-FORMAT.md gives its content and its config');
    // The empty board's hint, which points at ▦, steps aside while the Widget Picker is open, so the picker's four rows of
    // tiles never cover it. It is back once the picker closes.
    const hintSeen = () => page.evaluate(() => {
      const P = document.getElementById('panel'), pr = P.getBoundingClientRect(), hint = document.getElementById('empty-hint');
      const shown = !hint.hidden && getComputedStyle(hint).visibility !== 'hidden' && +getComputedStyle(hint).opacity > 0;
      const over = shown && P.classList.contains('open') ? [...hint.querySelectorAll('.big, .small')].filter(e => { const r = e.getBoundingClientRect();
        return r.width && Math.min(pr.right, r.right) - Math.max(pr.left, r.left) > 0.5 && Math.min(pr.bottom, r.bottom) - Math.max(pr.top, r.top) > 0.5; }).length : 0;
      return { shown, over };
    });
    const hints = [];
    for (const [vw, vh] of [[1024, 768], [1180, 820]]) for (const sc of [0.8, 1]) {
      await page.setViewportSize({ width: vw, height: vh }); await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(300);
      const before = await hintSeen();
      await page.click('.picker-btn.left'); await page.waitForTimeout(450);
      const open = await hintSeen();
      await page.keyboard.press('Escape'); await page.waitForTimeout(450);
      const after = await hintSeen();
      if (!(before.shown && !open.shown && !open.over && after.shown && !await page.locator('#panel.open').count())) hints.push(`${vw} × ${vh} at ${sc * 100}%: ${JSON.stringify({ before, open, after })}`);
    }
    await page.setViewportSize({ width: 1366, height: 768 }); await page.evaluate(() => window.__board21.setBoardScale(1)); await page.waitForTimeout(300);
    ok(!hints.length, `the empty board’s hint steps aside while the Widget Picker is open, so no tile covers it, and is back once it closes (1024 × 768 and 1180 × 820, Size 80% and 100%: ${hints.join(' | ') || '4 cases'})`);
    await page.click('.picker-btn.left'); await page.waitForTimeout(300);
    const tile = page.locator('#panel [data-widget="zones-check-in"]');
    ok(await tile.count() === 1 && (await tile.innerText()).trim() === 'Zones Check-In' && (await tile.getAttribute('title')) === 'Zones Check-In\nCheck in on how your class feels.', 'the Widget Picker has its tile, with its tooltip');
    // Its name wraps after "Zones", never after the hyphen ("Zones Check- / In"), in every Text style.
    const lines = () => page.locator('#panel [data-widget="zones-check-in"] .widget-name').evaluate(n => {
      const out = []; let top = null;
      const walk = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let t; (t = walk.nextNode());) for (let i = 0; i < t.length; i++) {
        const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1);
        const y = Math.round(r.getBoundingClientRect().top);
        if (top === null || y !== top) out.push('');
        top = y; out[out.length - 1] += t.data[i];
      }
      return out.map(s => s.trim()).join(' / ');
    });
    const wraps = [`standard: ${await lines()}`];
    for (const [style, fam] of [['legible', 'Atkinson Hyperlegible'], ['early', '21Board Early Readers'], ['standard']]) {
      await page.keyboard.press('Escape'); await openSettings(page, ['letters']); await page.click(`#settings [data-act="letters"][data-val="${style}"]`);
      if (fam) await page.waitForFunction(fam => Array.from(document.fonts).filter(f => f.family.replace(/"/g, '') === fam && f.status === 'loaded').length >= 2, fam);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      if (fam) { await page.click('.picker-btn.left'); await page.waitForTimeout(300); wraps.push(`${style}: ${await lines()}`); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
    }
    ok(wraps.every(w => / Zones \/ Check-In$/.test(w.replace(/^\w+:/, ''))), `its tile reads “Zones / Check-In” on two lines, in every Text style (${wraps.join('; ')})`);
    if (!await page.locator('#panel.open').count()) { await page.click('.picker-btn.left'); await page.waitForTimeout(300); }
    await tile.click();
    ok(await connected(page), 'tapping it opens a window, which connects');
    await page.waitForTimeout(500);
    const rect0 = await page.evaluate(k => window.__board21.state.insts.get(k).rect, K);
    ok(Math.round(rect0.w) === 560 && Math.round(rect0.h) === 460, `it opens at 560 × 420, with its title bar (${JSON.stringify(rect0)})`);
    // Some check-ins, through Counts.
    await choose(page, 'Edit counts'); await page.waitForTimeout(400);
    for (const [id, n] of [['blue', 2], ['green', 9], ['yellow', 4], ['red', 1]]) await zf(page).locator('#n-' + id).fill(String(n));
    await zf(page).locator('#edit-done').click(); await page.waitForTimeout(400);
    await setCornerClock(page, 'on');

    const problems = (where, corners) => ZC.problems(page, where, corners);
    const SIZES = [['260 × 220', { x: 40, y: 40, w: 260, h: 260 }], ['the default size', { x: 40, y: 40, w: 560, h: 460 }], ['very wide', { x: 10, y: 40, w: 1340, h: 300 }], ['very tall', { x: 530, y: 10, w: 300, h: 740 }]];
    const bad = [], seen = [];
    // (2026.11.23-3) Where the line and its bar sit, and where the cards end, in each of these layouts.
    const tops = [], topSeen = [];
    const placed = async where => {
      const a = await ZC.arrange(page), l = ZC.atTop(a).concat(ZC.ends(a));
      (l.length ? tops : topSeen).push(`${where} (${a.iw} × ${a.ih}, ${a.shape})${l.length ? ': ' + l.join(', ') : ''}`);
    };
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      ok(await eventually(async () => (await zf(page).locator('html').getAttribute('data-b21-theme')) === theme), `(${theme} theme)`);
      for (const [label, r] of SIZES) {
        await page.evaluate(([k, r]) => { window.__board21.setMaximized(k, false); window.__board21.setRect(k, r); }, [K, r]); await page.waitForTimeout(600);
        const p = await problems(`${theme}, ${label}`, false);
        (p.list.length ? bad : seen).push(`${p.where} (${p.size})${p.list.length ? ': ' + p.list.join(', ') : ''}`);
        await placed(p.where);
        await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + `zones-${theme}-${label.replace(/\W+/g, '-')}.png` });
      }
      for (const locked of [false, true]) {
        await page.evaluate(k => window.__board21.setMaximized(k, true), K); await page.waitForTimeout(600);
        if (locked) { await lockBoard(page, 'widgets'); await page.waitForTimeout(600); }
        const p = await problems(`${theme}, filling the board${locked ? ', locked' : ''}`, true);
        const want = locked ? 5 : 3;   // (▦ twice and the clock; locked, the two padlocks too)
        if (p.marks < want) p.list.push(`only ${p.marks} of the board’s ${want} corner buttons are there`);
        (p.list.length ? bad : seen).push(`${p.where} (${p.size})${p.list.length ? ': ' + p.list.join(', ') : ''}`);
        await placed(p.where);
        await page.screenshot({ path: OUT + `zones-${theme}-fill${locked ? '-locked' : ''}.png` });
        if (locked) await unlockBoard(page);
      }
      await page.evaluate(k => window.__board21.setMaximized(k, false), K); await page.waitForTimeout(400);
    }
    ok(!bad.length && seen.length === 12, `at 260 × 220, the default size, very wide, very tall and filling the board (unlocked and locked, with the corner clock on), light and dark: no text under 14 px, no name or feeling cut off, no count or face over the colored top or the feelings, nothing under the board’s corner buttons or padlocks (${bad.join(' | ') || seen.length + ' layouts'})`);
    ok(!tops.length && topSeen.length === 12, `in the same 12 layouts, the line and its bar are at the top: the line, then the bar, then the cards one gap below, the line and bar centered over the cards, between the padlocks when locked, the bar hidden at 300 px tall or less and the line at 229 or less. The cards end one gap above the window’s bottom, or filling the board, just above the board’s buttons (${tops.join(' | ') || topSeen.join('; ')})`);
    await setTheme(page, 'light');

    // A copy uploaded in Developer mode is “Zones Check-In (test)”. Its tile shows the whole name, “(test)” too.
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]');
    await page.setInputFiles('#widget-input', path.join(ROOT, 'widgets', 'zones-check-in', 'index.html'));
    ok(await eventually(() => page.evaluate(() => window.__board21.state.insts.has('dev-zones-check-in:1'))), '(a copy uploaded in Developer mode opens)');
    await page.waitForTimeout(800);
    for (let k = 0; k < 3 && await page.locator('#settings.open, #panel.open').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
    await page.click('.picker-btn.left'); await page.waitForTimeout(400);
    const dev = await page.locator('#panel [data-widget="dev-zones-check-in"] .widget-name').evaluate(n => {
      const was = n.classList.contains('fits'); n.classList.remove('fits');
      const r = { text: n.textContent, whole: n.scrollHeight <= n.clientHeight + 1 };
      n.classList.toggle('fits', was); return r;
    });
    ok(dev.text === 'Zones Check-In (test)' && dev.whole, `its tile shows the whole name, “(test)” too (${JSON.stringify(dev)})`);
    await page.keyboard.press('Escape');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  // ---- Zones Check-In in one row (2026.11.20-3; from 850 × 480 px since 2026.11.21-1). Filling the board, with a window
  // at least 850 × 480 px, the four zones sit side by side, so every card reaches down to where students can tap it.
  ['Zones Check-In: one row when it fills the board', async (browser) => {
    let ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    // 9:41, whenever it runs: at 200% on 1366 × 768 the corner clock fits only a one-digit hour, and hides from 10 to 12.
    await ctx.clock.setFixedTime(new Date(2026, 10, 24, 9, 41));
    let page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const { K, zf, connected, choose, arrange, problems } = ZC;
    await page.evaluate(() => window.__board21.openWidget('zones-check-in'));
    ok(await connected(page), '(the Zones Check-In connects)');
    const home = { x: 60, y: 60, w: 560, h: 460 };   // (the size it opens at)
    // The board's shape ('16:9' or 'free', Fill), its Size and the screen; the window not filling it, at r.
    const put = async (shape, sc, vw, vh, r = home, p = page) => {
      await p.setViewportSize({ width: vw, height: vh });
      await p.evaluate(([k, shape, sc, r]) => { const B = window.__board21; B.setMaximized(k, false); B.setBoardShape(shape); B.setBoardScale(sc); B.setRect(k, r); }, [K, shape, sc, r]);
      await p.waitForTimeout(400);
    };
    const fill = (on, p = page) => p.evaluate(([k, on]) => window.__board21.setMaximized(k, on), [K, on]);
    // The layout wanted, once the window has finished moving to its new size: two reads in a row, 150 ms apart, find every
    // card where it was (for at most about 3 s more).
    const settled = async (want, p = page) => {
      await eventually(async () => (await arrange(p)).shape === want, 3000);
      let a = await arrange(p);
      for (let i = 0; i < 20; i++) { await p.waitForTimeout(150); const b = await arrange(p); if (JSON.stringify(b.cards) === JSON.stringify(a.cards)) return b; a = b; }
      return a;
    };
    const setCounts = async (counts, p = page) => {
      await choose(p, 'Edit counts'); await p.waitForTimeout(400);
      for (const [id, n] of Object.entries(counts)) await zf(p).locator('#n-' + id).fill(String(n));
      await zf(p).locator('#edit-done').click(); await p.waitForTimeout(400);
    };
    await put('16:9', 0.8, 1366, 768);
    await setCounts({ blue: 2, green: 9, yellow: 4, red: 1 });
    const ROW = '1366 × 768 at 80%';
    // (2026.11.23-3) Where the line and its bar sit in each layout this suite visits, and where the cards end (ZC.atTop,
    // ZC.ends). Said at the end.
    const TOP = { bad: [], seen: [] };
    const top = (where, x) => { const l = ZC.atTop(x).concat(ZC.ends(x)); (l.length ? TOP.bad : TOP.seen).push(`${where}, ${x.iw} × ${x.ih}${x.filled ? ', filled' : ''}${l.length ? ': ' + l.join(', ') : ''}`); };

    // ---- 1. The 16:9 board at 1366 × 768 and 1920 × 1080, at Size 80% (a new board's) and 100%.
    const R1 = { row: [], reach: [], stack: [], line: [], back: [] }, seen1 = [];
    for (const [vw, vh] of [[1366, 768], [1920, 1080]]) for (const sc of [0.8, 1]) {
      const where = `${vw} × ${vh} at ${sc * 100}%`;
      await put('16:9', sc, vw, vh); await fill(true);
      const x = await settled('row');
      seen1.push(`${where}: ${x.shape}, ${x.h} px tall`);
      if (!(x.shape === 'row' && x.reach)) R1.row.push(`${where}: ${x.shape}`);
      // (2026.11.23-3) Filling the board, every card ends just above the board's buttons in its bottom corners, and
      // under none of them. Not filling it, one gap above its bottom (y, below).
      const high = ZC.ends(x);
      if (high.length) R1.reach.push(`${where}, filled: ${high.join(', ')}`);
      top(where, x);
      const st = [];
      for (const k of x.cards) {
        if (!k.count || k.face.b > k.count.t + 1) st.push(`${k.z}: its face isn’t above its count`);
        if (k.count && k.feel.length && k.feel[0].t < k.count.b - 1) st.push(`${k.z}: its feelings aren’t below its count`);
        if (k.feel.length !== (k.z === 'blue' ? 4 : 3) || k.feel.some((f, i) => i && f.t < k.feel[i - 1].b - 0.5)) st.push(`${k.z}: its ${k.feel.length} feelings aren’t one per line`);
      }
      if (st.length) R1.stack.push(`${where}: ${st.join(', ')}`);
      const spread = f => { const v = x.cards.map(f).filter(v => v !== null); return v.length === 4 ? Math.max(...v) - Math.min(...v) : Infinity; };
      const lines = { faces: spread(k => (k.face.t + k.face.b) / 2), counts: spread(k => k.count ? (k.count.t + k.count.b) / 2 : null), 'last feelings': spread(k => k.feel.length ? k.feel[k.feel.length - 1].b : null) };
      const off = Object.entries(lines).filter(([, v]) => !(v <= 1)).map(([n, v]) => `${n} ${v.toFixed(1)} px apart`);
      if (off.length) R1.line.push(`${where}: ${off.join(', ')}`);
      if (where === ROW) await page.screenshot({ path: OUT + 'zones-row-16-9.png' });
      await fill(false); const y = await settled('2x2');
      const yEnds = ZC.ends(y);
      if (yEnds.length) R1.reach.push(`${where}, the size it opens at: ${yEnds.join(', ')}`);
      top(`${where}, the size it opens at`, y);
      await fill(true); const z = await settled('row');
      top(`${where}, filled again`, z);
      if (!(y.shape === '2x2' && !y.reach && z.shape === 'row' && z.reach)) R1.back.push(`${where}: Restore size ${y.shape}, Fill the board ${z.shape}`);
    }
    ok(!R1.row.length && seen1.length === 4, `the 16:9 board, filled: one row of four cards, Blue to Red, their tops and bottoms matching (${R1.row.join(' | ') || seen1.join('; ')})`);
    ok(!R1.reach.length, `filling the board, every card ends just above the board’s buttons in its bottom corners, and under none of them. Not filling it, the cards end one gap above its bottom (${R1.reach.join(' | ') || '4 boards, filled and not'})`);
    ok(!R1.stack.length, `in each card the face sits above the count, and the feelings below it, one per line (${R1.stack.join(' | ') || '4 boards'})`);
    ok(!R1.line.length, `the faces line up, the counts line up, and so do the last feelings’ bottoms, within 1 px (${R1.line.join(' | ') || '4 boards'})`);
    ok(!R1.back.length, `Restore size: two by two again, and Fill the board: one row again (${R1.back.join(' | ') || '4 boards'})`);

    // ---- 2. The lines: a filled window at least 850 × 480 px is one row. Smaller, or not filling the board, the rules
    // before: two by two, a row when very wide, a column when very tall. Since 2026.11.24-4, also a row whenever each card
    // can be 190 px wide in a cards' area at least as wide as it is tall (x.want).
    // (want: the shape wanted for the cards' area, under the line. Since 2026.11.23-3 the strip between the board's
    // buttons below the cards is empty, so the area is shorter.)
    const lined = async ([shape, sc, vw, vh], over, want = '2x2') => {
      await put(shape, sc, vw, vh); await fill(true);
      const x = await settled(over ? 'row' : want), big = x.w >= 850 && x.h >= 480;
      top(`${shape === 'free' ? 'Fill' : shape} ${vw} × ${vh}${sc !== 1 ? ` at ${sc * 100}%` : ''}`, x);
      return { x, where: `${shape === 'free' ? 'Fill' : shape} ${vw} × ${vh}${sc !== 1 ? ` at ${sc * 100}%` : ''}, ${x.w} × ${x.h} px: ${x.shape}`,
        good: over ? big && x.shape === 'row' && x.reach : !big && x.shape === want && x.shape === x.want && !x.reach };
    };
    const said = l => l.map(c => c.where).join('; ');
    // The height line. (A Chromebook's 1366 × 768 screen at Size 125%: a tab is about 1366 × 657, 486 px tall when filled.)
    const tall = [], short = [];
    for (const b of [['free', 1, 1024, 768], ['free', 1, 1280, 700], ['free', 1, 1024, 520], ['16:9', 2, 1366, 768], ['16:9', 1.75, 1366, 768], ['free', 1.25, 1366, 657]]) {
      tall.push(await lined(b, true));
      if (b[3] === 768 && b[1] === 1) await page.screenshot({ path: OUT + 'zones-row-ipad.png' });
      if (b[0] === '16:9' && b[1] === 2) await page.screenshot({ path: OUT + 'zones-row-200.png' });
    }
    for (const [b, want] of [[['free', 1, 1024, 519], 'row'], [['free', 1.5, 1280, 700], 'row']]) short.push(await lined(b, false, want));
    ok(tall.every(c => c.good), `a filled window at least 480 px tall is one row: the Fill board as on an iPad, at 480 px, the 16:9 board at Size 200% and 175%, and a Chromebook tab at 125% (${said(tall)})`);
    ok(short.every(c => c.good) && tall[2].good, `a filled window under 480 px tall follows the rule for any window (2026.11.24-4): a row, its cards at least 190 px wide in an area wider than tall, though not .reach (${said(short)}). The .reach line is at 480 px (${tall[2].where})`);
    // The width line. At 850 px every card shows its “−”, its Ideas, and all its feeling words.
    const at850 = await lined(['free', 1.25, 1063, 768], true), at849 = await lined(['free', 1.25, 1061, 768], false, 'row');
    const all850 = at850.x.shows, whole = all850.minus === 4 && all850.ideas === 4 && all850.words === 13, all849 = at849.x.shows;
    ok(at850.good && whole && at849.good && all849.minus === 4 && all849.ideas === 4 && all849.words === 13,
      `the .reach line is at 850 px wide: one row at 850 px, with 4 “−”, 4 Ideas, and 13 feeling words (${at850.where}: ${all850.minus}, ${all850.ideas}, ${all850.words}). At 849 px, a row too since 2026.11.24-4, by the rule for any window, with ${all849.minus} “−”, ${all849.ideas} Ideas, and ${all849.words} words (${at849.where})`);
    const loose = [];
    for (const [label, r] of [['260 × 220', { x: 40, y: 40, w: 260, h: 260 }], ['the default size', home], ['very wide', { x: 10, y: 40, w: 1340, h: 300 }], ['tall', { x: 600, y: 60, w: 600, h: 900 }], ['very tall', { x: 600, y: 60, w: 500, h: 900 }], ['as big as the board', { x: 0, y: 0, w: 1920, h: 1080 }]]) {
      await put('free', 1, 1920, 1080, r);
      const x = await arrange(page);
      top(`Fill 1920 × 1080, ${label}`, x);
      loose.push({ where: `${label} (${x.w} × ${x.h} px): ${x.shape}`, good: x.shape === x.want && !x.reach && (label !== 'very tall' || x.shape === 'column') && (label !== 'as big as the board' || x.shape === 'row') });
    }
    await fill(true); const big = await settled('row');
    top('Fill 1920 × 1080', big);
    ok(loose.every(c => c.good) && big.shape === 'row', `a window that doesn’t fill the board: the rules before, and since 2026.11.24-4 a row wherever each card can be 190 px wide in an area wider than tall, as in a window as big as the board. A very tall one is one column of four (${said(loose)}). Filled, the same board is one row (${big.shape})`);

    // ---- 3. Counts of 7, 128, 12 and 9999, from the Counts view: each fits inside its card, and the faces still line up.
    // (Fill 1024 × 768 at 80%, a new board's Size on an iPad, and 1280 × 800 at 100%: where “Yellow” once ended in “…”.
    // Fill 1063 × 650 at 125%: the smallest row, 850 × 480 px. The 16:9 board at Size 200%: 960 × 500 px.)
    await put('16:9', 1, 1366, 768); await fill(true); await settled('row');
    await setCounts({ blue: 7, green: 128, yellow: 12, red: 9999 });
    const BOARDS = [['16:9', 0.8, 1366, 768], ['16:9', 1, 1366, 768], ['free', 1, 1024, 768], ['free', 1, 1024, 541], ['free', 1.25, 1063, 650], ['free', 0.5, 1920, 1080],
      ['free', 0.8, 1024, 768], ['free', 1, 1280, 800], ['16:9', 0.8, 1920, 1080], ['16:9', 2, 1366, 768]];
    const SMALLEST = BOARDS[4];
    const name = ([shape, sc, vw, vh]) => `${shape === 'free' ? 'Fill' : shape} ${vw} × ${vh} at ${sc * 100}%`;
    const fits = [], fitSeen = [], faces = [], faceSeen = [];
    for (const b of BOARDS) {
      await put(...b); await fill(true);
      const x = await settled('row'), p = await problems(page, name(b), true);
      top(`${name(b)}, counts of 7, 128, 12, and 9999`, x);
      const k = x.cards.map(c => !c.count ? `${c.z}: no count` : c.count.t < c.face.b - 1 ? `${c.z}: its count is over its face` : c.count.l < c.card.l - 0.5 || c.count.r > c.card.r + 0.5 ? `${c.z}: its count is cut off` : '').filter(Boolean);
      const all = (x.shape === 'row' ? [] : [x.shape]).concat(k, p.list);
      (all.length ? fits : fitSeen).push(`${name(b)}${all.length ? ': ' + all.join(', ') : ` (${x.cards.map(c => Math.round(c.countFs)).join(', ')} px)`}`);
      const tops = x.cards.map(c => c.face.t), apart = Math.max(...tops) - Math.min(...tops);
      (apart <= 1 ? faceSeen : faces).push(`${name(b)}: ${apart.toFixed(1)} px apart`);
      if (b[3] === 541) await page.screenshot({ path: OUT + 'zones-row-counts.png' });
    }
    ok(!fits.length, `counts of 7, 128, 12 and 9999 in one row: each fits inside its card, nothing cut off, no count over the face or the feelings (${fits.join(' | ') || fitSeen.join('; ')})`);
    ok(!faces.length, `counts of 7, 128, 12 and 9999 in one row: the faces still line up, within 1 px (${faces.join(' | ') || faceSeen.join('; ')})`);
    // The smallest row, 850 × 480 px, light and dark: the counts fit, the faces line up, and every card keeps its “−”, its
    // Ideas, and all its feeling words.
    const least = [], leastSeen = [];
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await put(...SMALLEST); await fill(true);
      const x = await settled('row'), p = await problems(page, `${theme}, ${name(SMALLEST)}`, true), tops = x.cards.map(c => c.face.t);
      top(`${theme}, ${name(SMALLEST)}`, x);
      const bad = (x.shape === 'row' ? [] : [x.shape]).concat(p.theme === theme ? [] : [`the ${p.theme} theme`],
        x.cards.filter(c => !c.count || c.count.l < c.card.l - 0.5 || c.count.r > c.card.r + 0.5 || c.count.t < c.face.b - 1).map(c => `${c.z}: its count doesn’t fit`),
        Math.max(...tops) - Math.min(...tops) <= 1 ? [] : [`the faces ${(Math.max(...tops) - Math.min(...tops)).toFixed(1)} px apart`],
        x.shows.minus === 4 && x.shows.ideas === 4 && x.shows.words === 13 ? [] : [`${x.shows.minus} “−”, ${x.shows.ideas} Ideas, ${x.shows.words} words`], p.list);
      (bad.length ? least : leastSeen).push(`${p.where}, ${x.w} × ${x.h} px${bad.length ? ': ' + bad.join(', ') : ''}`);
      await page.screenshot({ path: OUT + `zones-row-smallest-${theme}.png` });
    }
    await setTheme(page, 'light');
    ok(!least.length && leastSeen.length === 2, `the smallest row, light and dark: counts of 7, 128, 12, and 9999 fit, the faces line up, 4 “−”, 4 Ideas, and 13 feeling words, nothing cut off, no text under 14 px (${least.join(' | ') || leastSeen.join('; ')})`);
    await setCounts({ blue: 2, green: 9, yellow: 4, red: 1 });

    // ---- 4. Show counts off, in one row: no counts, the faces bigger, nothing cut off.
    const hid = [], hidSeen = [];
    for (const b of [BOARDS[0], BOARDS[2]]) {
      await put(...b); await fill(true);
      const x0 = await settled('row');
      await choose(page, 'Show counts');
      const x1 = await settled('row'), p = await problems(page, name(b), true);
      top(`${name(b)}, Show counts off`, x1);
      const bad = (x1.shape === 'row' ? [] : [x1.shape]).concat(x1.cards.filter(c => c.count).map(c => `${c.z}: its count shows`), x1.cards.filter((c, i) => !(c.faceFs > x0.cards[i].faceFs)).map(c => `${c.z}: its face isn’t bigger`), p.list);
      (bad.length ? hid : hidSeen).push(`${name(b)}${bad.length ? ': ' + bad.join(', ') : ` (faces ${Math.round(x0.cards[0].faceFs)} → ${Math.round(x1.cards[0].faceFs)} px)`}`);
      if (b === BOARDS[0]) await page.screenshot({ path: OUT + 'zones-row-no-counts.png' });
      await choose(page, 'Show counts');
    }
    ok(!hid.length, `Show counts off, in one row: no counts, the faces bigger, nothing cut off (${hid.join(' | ') || hidSeen.join('; ')})`);

    // ---- Narrow filled windows, under 850 px wide (an iPad upright, or at Size 125%), keep the rules before: two by two,
    // as release 2026.11.20-1 drew them, each face beside its count. Every card keeps its “−”, its Ideas, and all its
    // feeling words.
    const narrow = [], narrowSeen = [];
    for (const b of [['free', 1, 768, 1024], ['free', 1.25, 768, 1024], ['free', 1, 820, 1180], ['free', 1.25, 1024, 768]]) {
      await put(...b); await fill(true);
      const x = await settled('2x2'), p = await problems(page, name(b), true);
      top(name(b), x);
      const filled = await page.evaluate(k => window.__board21.state.insts.get(k).maximized === true, K);
      const beside = x.cards.filter(k => !(k.count && k.face.r <= k.count.l + 1 && Math.abs((k.face.t + k.face.b) / 2 - (k.count.t + k.count.b) / 2) <= 8)).map(k => `${k.z}: its face isn’t beside its count`);
      const bad = (filled ? [] : ['not filling the board']).concat(x.shape === '2x2' && x.shape === x.old && !x.reach ? [] : [`${x.shape}${x.reach ? ', reach' : ''} (before: ${x.old})`], beside,
        x.shows.minus === 4 && x.shows.ideas === 4 && x.shows.words === 13 ? [] : [`${x.shows.minus} “−”, ${x.shows.ideas} Ideas, ${x.shows.words} words`], p.list);
      (bad.length ? narrow : narrowSeen).push(`${name(b)}, ${x.w} × ${x.h} px, cards ${Math.round(x.cards[0].card.w)} px${bad.length ? ': ' + bad.join(', ') : ''}`);
      if (b[2] === 768 && b[1] === 1.25) await page.screenshot({ path: OUT + 'zones-row-narrow.png' });
    }
    ok(!narrow.length && narrowSeen.length === 4, `filled windows under 850 px wide keep the rules before: two by two, each face beside its count, 4 “−”, 4 Ideas, and 13 feeling words, nothing cut off (${narrow.join(' | ') || narrowSeen.join('; ')})`);

    // ---- 5. Filling a locked board, with the corner clock on, light and dark.
    await setCornerClock(page, 'on');
    const lockBad = [], lockSeen = [];
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      ok(await eventually(async () => (await zf(page).locator('html').getAttribute('data-b21-theme')) === theme), `(${theme} theme)`);
      for (const b of [BOARDS[0], BOARDS[2], ['free', 1, 1920, 1080], BOARDS[6], BOARDS[7], SMALLEST, BOARDS[9]]) {
        await put(...b); await fill(true);
        await lockBoard(page, 'widgets'); await page.waitForTimeout(600);
        const x = await settled('row'), p = await problems(page, `${theme}, ${name(b)}, locked`, true);
        top(`${theme}, ${name(b)}, locked`, x);
        if (x.shape !== 'row') p.list.unshift(x.shape);
        if (p.marks < 5) p.list.push(`only ${p.marks} of the board’s 5 corner buttons are there`);   // (▦ twice, the clock, two padlocks)
        (p.list.length ? lockBad : lockSeen).push(`${p.where}${p.list.length ? ': ' + p.list.join(', ') : ''}`);
        if (b === BOARDS[0]) await page.screenshot({ path: OUT + `zones-row-locked-${theme}.png` });
        await unlockBoard(page);
      }
    }
    ok(!lockBad.length && lockSeen.length === 14, `filling a locked board with the corner clock on, light and dark: one row, no text under 14 px, no zone name or feeling cut off, nothing under the board’s corner buttons, clock, or padlocks (${lockBad.join(' | ') || lockSeen.join('; ')})`);
    await setTheme(page, 'light');
    await setCornerClock(page, 'auto');   // (the default: only in full screen)

    // ---- 7. Full screen, and a Fill board's window resized across 480 px tall or 850 px wide, switch .reach without a
    // reload. Since 2026.11.24-4 these are rows on both sides of those lines. A window resized across the width where its
    // cards reach 190 px switches the layout, again without a reload.
    const mark = () => zf(page).locator('html').evaluate(() => { window.__same = 'same page'; });
    const same = () => zf(page).locator('html').evaluate(() => window.__same === 'same page').catch(() => false);
    // ⛶ in the Widget Picker (which stays open), then the screen's new size (this browser's full screen keeps its size,
    // and can't be resized). The Widget Picker closes again.
    const cdp0 = await ctx.newCDPSession(page);
    const screen = async (w, h) => {
      if (!await page.locator('#panel.open').count()) await page.click('.picker-btn.left');
      await page.click('#panel.open [data-ctl="fullscreen"]'); await page.waitForTimeout(400);
      await cdp0.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await page.waitForTimeout(300);
      if (await page.locator('#panel.open').count()) { await page.click('.picker-btn.left'); await page.waitForTimeout(300); }
    };
    // (A 1920 × 1080 screen at Size 200%: a tab is about 1920 × 960, 440 px tall when filled; full screen, 500.)
    await put('free', 2, 1920, 960); await fill(true);
    const f0 = await settled('row'); await mark();
    await screen(1920, 1080);
    const f1 = await settled('row'), inFull = await page.evaluate(() => !!document.fullscreenElement);
    await screen(1920, 960);
    const f2 = await settled('row'), outFull = await page.evaluate(() => !document.fullscreenElement);
    top('Fill 1920 × 960 at 200%', f0); top('Fill 1920 × 1080 at 200%, full screen', f1); top('Fill 1920 × 960 at 200%, out of full screen', f2);
    const said7 = x => `${x.w} × ${x.h} px, ${x.shape}${x.reach ? ', .reach' : ''}`;
    ok(f0.shape === 'row' && !f0.reach && inFull && f1.shape === 'row' && f1.reach && outFull && f2.shape === 'row' && !f2.reach && await same(),
      `full screen on a Fill board at 200%: a row in a tab too (2026.11.24-4), and .reach only in full screen (in a tab ${said7(f0)}; full screen ${said7(f1)}; out again ${said7(f2)}). No reload`);
    await put('free', 1, 1024, 768); await fill(true);
    const s0 = await settled('row'); await mark();
    await page.setViewportSize({ width: 1024, height: 519 }); const s1 = await settled('row');
    await page.setViewportSize({ width: 1024, height: 520 }); const s2 = await settled('row');
    top('Fill 1024 × 768', s0); top('Fill 1024 × 519', s1); top('Fill 1024 × 520', s2);
    ok(s0.shape === 'row' && s0.reach && s1.shape === 'row' && !s1.reach && s2.shape === 'row' && s2.reach && await same(),
      `a Fill board’s window resized across 480 px tall stays a row, .reach going and coming (${said7(s0)}; ${said7(s1)}; ${said7(s2)}). No reload`);
    await put('free', 1.25, 1063, 768); await fill(true);
    const v0 = await settled('row'); await mark();
    await page.setViewportSize({ width: 1061, height: 768 }); const v1 = await settled('row');
    await page.setViewportSize({ width: 1063, height: 768 }); const v2 = await settled('row');
    top('Fill 1063 × 768 at 125%', v0); top('Fill 1061 × 768 at 125%', v1); top('Fill 1063 × 768 at 125%, again', v2);
    ok(v0.shape === 'row' && v0.reach && v1.shape === 'row' && !v1.reach && v2.shape === 'row' && v2.reach && await same(),
      `and across 850 px wide, the same (${said7(v0)}; ${said7(v1)}; ${said7(v2)}). No reload`);
    // (2026.11.24-4) Under 480 px tall, where .reach never is: across the width where each card reaches 190 px, the layout
    // switches, a row only on the wide side. (Fill 821 × 519 at 100%: 821 × 479 px, the pad 11.975 px, the line at 819.9 px.)
    await page.evaluate(() => window.__board21.setBoardScale(1));
    await page.setViewportSize({ width: 821, height: 519 }); const n1 = await settled('row');
    await page.setViewportSize({ width: 819, height: 519 }); const n2 = await settled('2x2');
    await page.setViewportSize({ width: 821, height: 519 }); const n3 = await settled('row');
    top('Fill 821 × 519', n1); top('Fill 819 × 519', n2); top('Fill 821 × 519, again', n3);
    const could = x => ((x.fine.w - 3 * x.gap) / 4).toFixed(2);
    ok(n1.shape === 'row' && n1.oneRow && !n1.reach && n2.shape === '2x2' && !n2.oneRow && !n2.reach && n3.shape === 'row' && n3.oneRow && !n3.reach && await same(),
      `under 480 px tall, across the width where each card reaches 190 px, the layout switches: ${said7(n1)} (cards ${could(n1)} px); ${said7(n2)} (cards could be ${could(n2)} px); ${said7(n3)}. No reload`);
    // A board that sends no width or height in its window info: the widget reads its frame's own size, once the frame has
    // it. (The board's messages to the frame lose both, the board's timing kept.) Restore size, then Fill the board.
    await page.evaluate(k => {
      const w = window.__board21.state.wins.get(k), cut = i => { if (!i) return i; i = Object.assign({}, i); delete i.width; delete i.height; return i; };
      w.__post = w.post;
      w.post = function (type, payload) {
        if (type === 'window' && payload) payload = Object.assign({}, payload, { info: cut(payload.info) });
        if (type === 'init' && payload && payload.context) payload = Object.assign({}, payload, { context: Object.assign({}, payload.context, { window: cut(payload.context.window) }) });
        return w.__post.call(this, type, payload);
      };
      w.reload();
    }, K);
    ok(await connected(page), '(the Zones Check-In connects again, on a board that sends no width or height)');
    await put(...SMALLEST); await fill(true);
    const n0 = await settled('row'), sent = await zf(page).locator('html').evaluate(() => ['width', 'height'].filter(f => f in Board21.context.window));
    top(`${name(SMALLEST)}, a board that sends no width or height`, n0);
    ok(n0.shape === 'row' && n0.reach && !sent.length,
      `a board that sends no width or height: Restore size, then Fill the board, ${n0.w} × ${n0.h} px, is one row (${n0.shape}${n0.reach ? ', reach' : ''}; sent ${sent.join(' and ') || 'neither'})`);
    await page.evaluate(k => { const w = window.__board21.state.wins.get(k); w.post = w.__post; delete w.__post; w.reload(); }, K);
    ok(await connected(page), '(and again, on the board as it is)');

    // ---- 8. Windows High Contrast (forced colors) on the shortest rows, open and locked with the corner clock on: the
    // counts hide none of the feelings, and nothing is cut off or over the colored top. (What the feelings look like as
    // drawn, and with the counts hidden: the same, when no count paints over them. The board's notes are hidden meanwhile.)
    const feelShot = async hide => {
      await zf(page).locator('html').evaluate((_, h) => { document.querySelectorAll('.count').forEach(c => { c.style.visibility = h ? 'hidden' : ''; }); }, !!hide);
      await page.waitForTimeout(150);
      const r = await zf(page).locator('html').evaluate(() => {
        const f = [...document.querySelectorAll('#main .feelings')].map(e => e.getBoundingClientRect());
        return { l: Math.min(...f.map(q => q.left)), t: Math.min(...f.map(q => q.top)), r: Math.max(...f.map(q => q.right)), b: Math.max(...f.map(q => q.bottom)), iw: innerWidth, ih: innerHeight };
      });
      const fr = await page.locator(`.win[data-ikey="${K}"] iframe`).boundingBox(), sx = fr.width / r.iw, sy = fr.height / r.ih;
      return (await page.screenshot({ clip: { x: fr.x + r.l * sx, y: fr.y + r.t * sy, width: (r.r - r.l) * sx, height: (r.b - r.t) * sy } })).toString('base64');
    };
    await page.emulateMedia({ forcedColors: 'active' });
    const quiet = await page.addStyleTag({ content: '#toasts { visibility: hidden !important; }' });
    await setCornerClock(page, 'on');
    const hc = [], hcSeen = [];
    for (const b of [SMALLEST, ['free', 1, 1024, 520], BOARDS[9], ['free', 1.25, 1366, 657]]) for (const locked of [false, true]) {
      await put(...b); await fill(true);
      if (locked) { await lockBoard(page, 'widgets'); await page.waitForTimeout(600); }
      const x = await settled('row'), p = await problems(page, `${name(b)}${locked ? ', locked' : ''}`, true);
      top(`Windows High Contrast, ${name(b)}${locked ? ', locked' : ''}`, x);
      const hidden = await feelShot() !== await feelShot(true);
      await feelShot(false);
      const bad = (x.shape === 'row' ? [] : [x.shape]).concat(hidden ? ['a count hides part of a feeling'] : [], p.list);
      (bad.length ? hc : hcSeen).push(`${p.where}, ${x.w} × ${x.h} px${bad.length ? ': ' + bad.join(', ') : ''}`);
      if (b === BOARDS[9] && locked) await page.screenshot({ path: OUT + 'zones-row-forced-colors.png' });
      if (locked) await unlockBoard(page);
    }
    ok(!hc.length && hcSeen.length === 8, `Windows High Contrast, the shortest rows, open and locked with the corner clock on: the counts hide none of the feelings, nothing is cut off, no face or count over the colored top (${hc.join(' | ') || hcSeen.join('; ')})`);
    await setCornerClock(page, 'auto');
    await page.emulateMedia({ forcedColors: 'none' }); await quiet.evaluate(e => e.remove());
    ok(!TOP.bad.length && TOP.seen.length === 82, `in each of the ${TOP.bad.length + TOP.seen.length} layouts above, one row and two by two, filled and not, unlocked and locked, light and dark: the line, then its bar, then the cards one gap below, centered over them, between the padlocks when locked. The cards end one gap above the window’s bottom, or under the board’s buttons, filling the board or not, just above them (${TOP.bad.join(' | ') || TOP.seen.length + ' layouts'})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- 6. Taps still count in one row: real touches (CDP), low on each card, and two at once on two cards.
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push('touch: ' + e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('zones-check-in'));
    ok(await connected(page), '(the Zones Check-In connects, on a touch screen)');
    await fill(true, page);
    const t0 = await settled('row', page);
    const cdp = await ctx.newCDPSession(page);
    const T = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const low = async zone => { const b = await zf(page).locator(`.zone[data-z="${zone}"] .tap`).boundingBox(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height * 0.85) }; };
    const counts = async () => (await ZC.look(page)).counts;
    const P = {};
    for (const zone of ['blue', 'green', 'yellow', 'red']) P[zone] = await low(zone);
    let a = await counts();
    for (const zone of ['blue', 'green', 'yellow', 'red']) { await T('touchStart', [{ ...P[zone], id: 1 }]); await page.waitForTimeout(70); await T('touchEnd', []); await page.waitForTimeout(400); }
    let d = (await counts()).map((v, i) => v - a[i]).join();
    ok(t0.shape === 'row' && d === '1,1,1,1', `in one row (${t0.shape}), a tap low on each card counts one, ${Math.min(...Object.values(P).map(q => q.y))} px down a 768 px screen (${d})`);
    a = await counts();
    await T('touchStart', [{ ...P.blue, id: 1 }]); await page.waitForTimeout(30);
    await T('touchStart', [{ ...P.blue, id: 1 }, { ...P.red, id: 2 }]); await page.waitForTimeout(60);
    await T('touchEnd', [{ ...P.red, id: 2 }]); await page.waitForTimeout(30);
    await T('touchEnd', []); await page.waitForTimeout(700);
    d = (await counts()).map((v, i) => v - a[i]).join();
    ok(t0.shape === 'row' && d === '1,0,0,1', `two students touching Blue and Red at once, in one row: both count (${d})`);
    await page.screenshot({ path: OUT + 'zones-row-taps.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  // ---- Zones Check-In's line and bar at the top (2026.11.23-3). "Tap your zone to check in" and the color bar sit above
  // the cards. On a locked board filling the window, between the padlocks. Filling the board, the cards end just above
  // the board's own buttons. The window's title keeps its count, so the count shows twice.
  ['Zones Check-In: the line and bar at the top, between the padlocks, short windows, and the title’s count', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Each part runs on its own: one that stops early is reported, and the next still runs.
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const { K, zf, connected, look, choose, arrange, problems, atTop, ends } = ZC;
    await page.evaluate(() => window.__board21.openWidget('zones-check-in'));
    ok(await connected(page), '(the Zones Check-In connects)');
    const home = { x: 60, y: 60, w: 560, h: 460 };   // (the size it opens at)
    // The board's shape ('16:9' or 'free', Fill), its Size and the screen; the window not filling it, at r.
    const put = async (shape, sc, vw, vh, r = home) => {
      await page.setViewportSize({ width: vw, height: vh });
      await page.evaluate(([k, shape, sc, r]) => { const B = window.__board21; B.setMaximized(k, false); B.setBoardShape(shape); B.setBoardScale(sc); B.setRect(k, r); }, [K, shape, sc, r]);
      await page.waitForTimeout(400);
    };
    const fill = on => page.evaluate(([k, on]) => window.__board21.setMaximized(k, on), [K, on]);
    // The layout once the window has finished moving: two reads in a row, 150 ms apart, find every card and the line where
    // they were (for at most about 3 s).
    const still = async () => {
      const at = a => JSON.stringify([a.cards.map(c => c.card), a.status, a.bar]);
      let a = await arrange(page);
      for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); const b = await arrange(page); if (at(b) === at(a)) return b; a = b; }
      return a;
    };
    const setCounts = async counts => {
      await choose(page, 'Edit counts'); await page.waitForTimeout(400);
      for (const [id, n] of Object.entries(counts)) await zf(page).locator('#n-' + id).fill(String(n));
      await zf(page).locator('#edit-done').click(); await page.waitForTimeout(400);
    };
    const name = ([shape, sc, vw, vh]) => `${shape === 'free' ? 'Fill' : shape} ${vw} × ${vh} at ${sc * 100}%`;
    const top = x => Math.min(...x.cards.map(k => k.card.t)), bottom = x => Math.max(...x.cards.map(k => k.card.b));
    // Where the line (its words to its bar) and the cards are, rounded: 'line 11 to 44, cards 54 to 410'.
    const where = x => `${x.iw} × ${x.ih}, ${x.shape}: line ${x.status ? `${Math.round(x.status.t)} to ${Math.round((x.bar || x.status).b)}` : 'hidden'}${x.status && !x.bar ? ' (no bar)' : ''}, cards ${Math.round(top(x))} to ${Math.round(bottom(x))}`;
    const titleBar = () => page.locator(`.win[data-ikey="${K}"] .win-label .sub`).evaluate(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0 ? e.textContent : '');

    // ---- 1. With no check-ins, "Tap your zone to check in" at the top, then the bar, then the cards.
    await part('No check-ins', async () => {
      await put('free', 1, 1366, 768);
      const x = await still(), l = atTop(x).concat(ends(x)), s = (await look(page)).status;
      ok(s === 'Tap your zone to check in' && !l.length && !!x.status && !!x.bar && x.status.b <= x.bar.t + 0.5 && x.bar.b <= top(x) + 0.5,
        `with no check-ins, “Tap your zone to check in” is at the top, then the bar, then the cards (“${s}”; ${l.join(', ') || where(x)})`);
      await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'zones-top-empty.png' });
    });

    // ---- 2. The title keeps its count: "16 checked in" in the window's title and in the line above the cards, both. The
    // title still shows it while Ideas or Counts is open.
    await part('The title’s count', async () => {
      await setCounts({ blue: 2, green: 9, yellow: 4, red: 1 });
      const x = await still(), z = await look(page), bar = await titleBar();
      ok(z.status === '16 checked in' && z.title === '16 checked in' && bar === '16 checked in' && !!x.status && x.status.b <= top(x) + 0.5,
        `“16 checked in” shows twice: in the window’s title and in the line above the cards (line “${z.status}”, title “${z.title}”, title bar “${bar}”; ${where(x)})`);
      await choose(page, 'Blue zone');
      const ideas = { view: (await look(page)).view, title: await titleBar() };
      await zf(page).locator('#idea-done').click(); await page.waitForTimeout(400);
      await choose(page, 'Edit counts'); await page.waitForTimeout(300);
      const counts = { view: (await look(page)).view, title: await titleBar() };
      await zf(page).locator('#edit-done').click(); await page.waitForTimeout(400);
      ok(ideas.view === 'ideas' && ideas.title === '16 checked in' && counts.view === 'edit' && counts.title === '16 checked in' && (await look(page)).view === 'main',
        `the title still says “16 checked in” while Ideas or Counts is open (${JSON.stringify({ ideas, counts })})`);
      await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'zones-top-16.png' });
    });

    // ---- 3. Where the spec measured them, to the pixel (window content in its own px, rounded).
    await part('Measured', async () => {
      const TABLE = [
        ['the window, the size it opens at', ['free', 1, 1366, 768], false, null, '2x2', '560 × 420, 2x2: line 11 to 44, cards 54 to 410'],
        ['the 16:9 board at Size 200%, filled', ['16:9', 2, 1920, 1080], true, null, 'row', '960 × 500, row: line 13 to 51, cards 64 to 428'],
        ['a Chromebook tab at Size 125%, filled, locked, the clock on', ['free', 1.25, 1366, 657], true, 'widgets', 'row', '1093 × 486, row: line 12 to 50, cards 62 to 414'],
        ['an iPad upright, filled', ['free', 1, 768, 1024], true, null, '2x2', '768 × 984, 2x2: line 18 to 64, cards 82 to 912']];
      const off = [], seen = [];
      for (const [label, b, filled, lock, , want] of TABLE) {
        if (lock) await setCornerClock(page, 'on');
        await put(...b); if (filled) await fill(true);
        if (lock) { await lockBoard(page, lock); await page.waitForTimeout(600); }
        const x = await still(), got = where(x);
        const close = got.match(/\d+/g).length === want.match(/\d+/g).length && got.match(/\d+/g).every((n, i) => Math.abs(n - want.match(/\d+/g)[i]) <= 1) && got.replace(/\d+/g, '') === want.replace(/\d+/g, '');
        (close ? seen : off).push(`${label}: ${got}${close ? '' : `, not ${want}`}`);
        if (lock) { await unlockBoard(page); await setCornerClock(page, 'auto'); }
      }
      ok(!off.length && seen.length === 4, `where the spec measured the line and the cards, within 1 px (${off.join(' | ') || seen.join('; ')})`);
    });

    // ---- 4. Filling a locked board, both lock modes, with the corner clock on, light and dark: the line and the bar sit
    // between the padlocks, under neither, and the cards start below them. The smallest row, the 16:9 board at Size 200%,
    // a Chromebook tab at 125%, and an iPad upright at 100% and 125%. (At 125% the iPad's board is 614 px wide, narrow
    // enough that the line would reach the padlocks if the window didn't keep it between them.)
    await part('Between the padlocks', async () => {
      await setCornerClock(page, 'on');
      const BOARDS = [[['free', 1.25, 1063, 650], 'row'], [['16:9', 2, 1920, 1080], 'row'], [['free', 1.25, 1366, 657], 'row'], [['free', 1, 768, 1024], '2x2'], [['free', 1.25, 768, 1024], '2x2']];
      const bad = [], seen = [];
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        for (const mode of ['widgets', 'all']) for (const [b, shape] of BOARDS) {
          await put(...b); await fill(true);
          await lockBoard(page, mode); await page.waitForTimeout(600);
          const x = await still(), p = await problems(page, `${theme}, ${name(b)}, ${mode === 'all' ? 'Lock everything' : 'Widgets still work'}`, true);
          const l = (x.shape === shape ? [] : [x.shape]).concat(atTop(x), ends(x), p.list, p.theme === theme ? [] : [`the ${p.theme} theme`],
            x.marks.filter(m => m.name === 'lock-pad').length === 2 ? [] : [`${x.marks.filter(m => m.name === 'lock-pad').length} padlocks`], x.status && x.bar ? [] : ['the line or the bar is hidden']);
          (l.length ? bad : seen).push(`${p.where}, ${where(x)}${l.length ? ': ' + l.join(', ') : ''}`);
          if (mode === 'widgets' && b[2] === 1366) await page.screenshot({ path: OUT + `zones-top-locked-${theme}.png` });
          if (mode === 'all' && b[0] === '16:9') await page.screenshot({ path: OUT + `zones-top-locked-all-200-${theme}.png` });
          await unlockBoard(page);
        }
      }
      await setTheme(page, 'light');
      ok(!bad.length && seen.length === 20, `filling a locked board, Lock everything and Widgets still work, with the corner clock on, light and dark: the line and the bar sit between the padlocks, under neither, and the cards start one gap below them and end just above the board’s buttons. Nothing cut off, no text under 14 px (${bad.join(' | ') || seen.join('; ')})`);
    });

    // ---- 5. Short windows: at 300 px tall the bar hides and the line stays at the top. At 229 px the line hides too. On a
    // locked board filling a short window, the cards still start below the padlocks.
    await part('Short windows', async () => {
      await setCornerClock(page, 'on');
      await put('free', 1, 1366, 768);
      const bad = [], seen = [];
      for (const h of [301, 300, 230, 229]) {
        await page.evaluate(([k, r]) => window.__board21.setRect(k, r), [K, { x: 60, y: 60, w: 560, h: h + 40 }]); await page.waitForTimeout(500);
        const x = await still(), l = atTop(x).concat(ends(x));
        const want = h > 300 ? 'the line and the bar' : h > 229 ? 'the line, no bar' : 'neither';
        const got = x.status && x.bar ? 'the line and the bar' : x.status ? 'the line, no bar' : x.bar ? 'the bar, no line' : 'neither';
        if (got !== want) l.unshift(got);
        (l.length ? bad : seen).push(`${h} px tall, ${want}: ${where(x)}${l.length ? ': ' + l.join(', ') : ''}`);
        await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + `zones-top-${h}.png` });
      }
      ok(!bad.length && seen.length === 4, `a window 301 px tall shows the line and the bar. At 300 px the bar hides and the line stays at the top, the cards one gap below it. At 230 px the line still shows, and at 229 it hides too (${bad.join(' | ') || seen.join('; ')})`);
      const low = [], lowSeen = [];
      for (const vh of [340, 269]) for (const mode of ['widgets', 'all']) {
        await put('free', 1, 1024, vh); await fill(true);
        await lockBoard(page, mode); await page.waitForTimeout(600);
        const x = await still(), l = atTop(x), pads = x.marks.filter(m => m.name === 'lock-pad');
        if (pads.length !== 2) l.push(`${pads.length} padlocks`);
        if (!x.filled) l.push('not filling the board');
        (l.length ? low : lowSeen).push(`Fill 1024 × ${vh}, ${mode === 'all' ? 'Lock everything' : 'Widgets still work'}, ${where(x)}, padlocks to ${pads.length ? Math.round(Math.max(...pads.map(p => p.b))) : '—'}${l.length ? ': ' + l.join(', ') : ''}`);
        if (mode === 'widgets') await page.screenshot({ path: OUT + `zones-top-short-locked-${vh}.png` });
        await unlockBoard(page);
      }
      ok(!low.length && lowSeen.length === 4, `filling a locked board 300 px tall, the line sits between the padlocks with no bar. At 229 px it hides, and the cards still start below the padlocks, one gap down (${low.join(' | ') || lowSeen.join('; ')})`);
      await setCornerClock(page, 'auto');
    });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  // ---- Zones Check-In in one row at more sizes, clear of the board's buttons (2026.11.24-4). The four zones sit in one
  // row whenever each card can be at least 190 px wide and the cards' area is at least as wide as it is tall (fitRow,
  // .one-row): a window about 830 px wide. The board tells any window its own buttons sit over where they are (corners),
  // not only one that fills it, and the Zones Check-In keeps its cards, its line and its bar clear of them.
  ['Zones Check-In: one row at more sizes, clear of the board’s buttons', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await stubWeather(ctx);   // (the Weather widget, in part 8, asks only the stubs)
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Each part runs on its own: one that stops early is reported, and the next still runs.
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    await page.goto(BASE); await boardUp(page);
    const { K, zf, connected, choose, arrange, problems, atTop, ends } = ZC;
    await page.evaluate(() => window.__board21.openWidget('zones-check-in'));
    ok(await connected(page), '(the Zones Check-In connects)');
    // The board's shape ('16:9' or 'free', Fill), its Size and the screen. Then the window: 'cover' (dragged to cover the
    // whole board, not filling it), 'fill' (Fill the board), or { w, h }, its content, with x and y from the board's top
    // left (24 px each unless given).
    const put = async (shape, sc, vw, vh, win, k = K) => {
      await page.setViewportSize({ width: vw, height: vh });
      await page.evaluate(([k, shape, sc, win]) => {
        const B = window.__board21; B.setMaximized(k, false); B.setBoardShape(shape); B.setBoardScale(sc);
        const v = B.boundsRect();
        if (win === 'fill') B.setMaximized(k, true);
        else if (win === 'cover') B.setRect(k, { x: v.x, y: v.y, w: v.w, h: v.h });
        else B.setRect(k, { x: v.x + (win.x == null ? 24 : win.x), y: v.y + (win.y == null ? 24 : win.y), w: win.w, h: win.h + 40 });
      }, [k, shape, sc, win]);
      await page.waitForTimeout(400);
    };
    // The layout once the window has finished moving: two reads in a row, 150 ms apart, find every card and the line where
    // they were (for at most about 3 s).
    const still = async () => {
      const at = a => JSON.stringify([a.cards.map(c => c.card), a.status, a.bar, a.corners]);
      let a = await arrange(page);
      for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); const b = await arrange(page); if (at(b) === at(a)) return b; a = b; }
      return a;
    };
    const name = ([shape, sc, vw, vh]) => `${shape === 'free' ? 'Fill' : shape} ${vw} × ${vh} at ${sc * 100}%`;
    const card = x => `${Math.round(x.cards[0].card.w)} × ${Math.round(x.cards[0].card.h)}`;
    // The board's Widget Picker corners (Settings › Advanced: 'both', 'left' or 'right') and its corner clock, chosen as a
    // teacher does, from a ▦ that shows.
    let side = 'both';
    const from = () => (side === 'right' ? 'right' : 'left');
    const pickerCorners = async v => {
      await openSettings(page, ['advanced'], from());
      await page.click(`#settings [data-act="corners"][data-val="${v}"]`); await page.waitForTimeout(300);
      for (let i = 0; i < 3 && await page.locator('#settings.open, #panel.open').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      side = v;
    };
    const clock = mode => setCornerClock(page, mode, from());
    await choose(page, 'Edit counts'); await page.waitForTimeout(400);
    for (const [id, n] of [['blue', 2], ['green', 9], ['yellow', 4], ['red', 1]]) await zf(page).locator('#n-' + id).fill(String(n));
    await zf(page).locator('#edit-done').click(); await page.waitForTimeout(400);

    // ---- 1. Where the spec measured them (1920 × 1080, the 16:9 board at Size 80% unless said, Blue 2, Green 9, Yellow 4,
    // Red 1): the layout, the window's content, and each card's size within 1 px. A window under the board's buttons has
    // shorter cards since the ▦ fix (below), so only their width is checked here. In every row the new rule gives, every
    // card is at least 190 px wide, shows "−" and Ideas (at least the bulb), all 13 feeling words show, nothing is cut, no
    // text is under 14 px, and nothing is under the board's buttons. A card under 0.9 as wide as it is tall (the line the
    // one-row rules have always used) has its face over its count.
    await part('Measured', async () => {
      const B80 = ['16:9', 0.8, 1920, 1080];
      const TABLE = [
        ['dragged to cover the board, Size 80% (the spec’s “Size 100%”: 2400 × 1310)', B80, 'cover', '2400 × 1310', 'row', [578, 1210]],
        ['dragged to cover the board, Size 100%', ['16:9', 1, 1920, 1080], 'cover', '1920 × 1040', 'row', [458, 940]],
        ['dragged to cover the board, Size 150%', ['16:9', 1.5, 1920, 1080], 'cover', '1280 × 680', 'row', [299, 583]],
        ['dragged to cover the board, Size 200%', ['16:9', 2, 1920, 1080], 'cover', '960 × 500', 'row', [224, 424]],
        ['1200 × 700, Ideas as the bulb', B80, { w: 1200, h: 700 }, '1200 × 700', 'row', [278, 601]],
        ['840 × 500', B80, { w: 840, h: 500 }, '840 × 500', 'row', [194, 424]],
        ['820 × 500', B80, { w: 820, h: 500 }, '820 × 500', '2x2', [391, 206]],
        ['560 × 420, the size it opens at', B80, { w: 560, h: 420 }, '560 × 420', '2x2', [264, 172]],
        ['900 × 1000', B80, { w: 900, h: 1000, x: 300 }, '900 × 1000', '2x2', [423, 441]],
        ['1000 × 300', B80, { w: 1000, h: 300 }, '1000 × 300', 'row', [240, 260]],
        ['a Fill board, 1366 × 768 at 125%, dragged to cover it', ['free', 1.25, 1366, 768], 'cover', '1093 × 574', 'row', [255, 487]],
        ['a Fill board, 1366 × 768 at 100%, dragged to cover it', ['free', 1, 1366, 768], 'cover', '1366 × 728', 'row', null]];
      const off = [], seen = [], rows = [], rowSeen = [];
      for (const [label, b, win, size, shape, want] of TABLE) {
        await put(...b, win);
        const x = await still(), under = x.marks.some(m => m.over && m.name !== 'lock-pad');
        const got = `${x.iw} × ${x.ih}, ${x.shape}, cards ${card(x)}${under ? ', under the board’s buttons' : ''}`;
        const close = (a, w) => Math.abs(a - w) <= 1;
        const bad = (`${x.iw} × ${x.ih}` === size ? [] : [`not ${size}`]).concat(x.shape === shape && x.want === shape ? [] : [`not ${shape}`],
          !want || x.cards.every(c => close(c.card.w, want[0]) && (under || close(c.card.h, want[1]))) ? [] : [`cards not ${want.join(' × ')}`],
          !label.includes('bulb') || x.shows.ideasWord === 0 ? [] : [`${x.shows.ideasWord} “Ideas” words`], label.includes('dragged') === under ? [] : [under ? 'under the board’s buttons' : 'not under the board’s buttons']);
        (bad.length ? off : seen).push(`${label}: ${got}${bad.length ? ': ' + bad.join(', ') : ''}`);
        if (shape !== 'row') continue;
        const p = await problems(page, `${name(b)}, ${label}`, true);
        const l = (x.oneRow ? [] : ['not .one-row']).concat(
          x.cards.filter(c => c.card.w < 189.95).map(c => `${c.z} ${c.card.w.toFixed(1)} px wide`),
          x.shows.minus === 4 && x.shows.ideas === 4 && x.shows.words === 13 ? [] : [`${x.shows.minus} “−”, ${x.shows.ideas} Ideas, ${x.shows.words} words`],
          x.cards.filter(c => c.card.w / c.card.h < 0.9 && !(c.count && c.face.b <= c.count.t + 1)).map(c => `${c.z}: its face isn’t over its count`), p.list);
        (l.length ? rows : rowSeen).push(`${label}: cards ${card(x)}${l.length ? ': ' + l.join(', ') : ''}`);
        if (label.includes('Size 200%')) await page.screenshot({ path: OUT + 'zones-more-cover-200.png' });
        if (label.startsWith('1200')) await page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: OUT + 'zones-more-1200x700.png' });
      }
      ok(!off.length && seen.length === TABLE.length, `every size the spec measured gives the layout shown, its cards within 1 px (${off.join(' | ') || seen.join('; ')})`);
      ok(!rows.length && rowSeen.length === 9, `in every row the new rule gives: .one-row, every card at least 190 px wide, 4 “−”, 4 Ideas, and 13 feeling words, the face over the count on a tall card, nothing cut, no text under 14 px, nothing under the board’s buttons (${rows.join(' | ') || rowSeen.join('; ')})`);
    });

    // ---- 2. The threshold. On a Fill board at 100%, a window 500 px tall: pad is 12.5 px (2.5vmin), so each card can be
    // 190 px wide from (W − 2 × 12.5 − 3 × 12.5) / 4 ≥ 190, 823 px. Then a window 900 px wide (pad 18) just wider than tall
    // and just taller than wide, in its cards' area. Resizing slowly across both: one switch each way, never a flicker.
    await part('The threshold', async () => {
      await put('free', 1, 1920, 1080, { w: 900, h: 500, x: 400, y: 0 });
      const g = (await still()).gap, W0 = Math.ceil(760 + 5 * g);
      const at = async (w, h) => { await page.evaluate(([k, r]) => window.__board21.setRect(k, r), [K, { x: 400, y: 0, w, h: h + 40 }]); await page.waitForTimeout(300); return still(); };
      const each = x => (x.area.w - 3 * x.gap) / 4;
      const a = await at(W0, 500), b = await at(W0 - 1, 500);
      ok(g === 12.5 && W0 === 823 && a.shape === 'row' && a.oneRow && a.cards.every(c => c.card.w >= 190 && c.card.w < 191) && b.shape === '2x2' && !b.oneRow && each(b) < 190,
        `the width where each card reaches 190 px: a row at ${a.iw} × ${a.ih} (cards ${card(a)}), two by two at ${b.iw} × ${b.ih} (cards could be ${each(b).toFixed(2)} px; pad ${g} px)`);
      // The cards' area grows 1 px for each px of height here (pad 18 px, the line's size fixed): just wider than tall,
      // then just taller than wide.
      const m = await at(900, 900), H0 = 900 + m.area.w - m.area.h;
      const c = await at(900, H0 - 1), d = await at(900, H0 + 1);
      ok(c.area.w === c.area.h + 1 && c.shape === 'row' && c.oneRow && d.area.h === d.area.w + 1 && d.shape === '2x2' && !d.oneRow && c.cards[0].card.w >= 190,
        `a window 900 px wide: a row where the cards’ area is just wider than tall (${c.iw} × ${c.ih}, area ${c.area.w} × ${c.area.h}, ${c.shape}), two by two where it is just taller than wide (${d.iw} × ${d.ih}, area ${d.area.w} × ${d.area.h}, ${d.shape})`);
      // Slowly across each line and back, 1 px every 120 ms: the frame's one-row class changes once each way.
      const watch = () => zf(page).locator('html').evaluate(() => {
        window.__flips = []; window.__was = document.body.classList.contains('one-row');
        if (!window.__watching) new MutationObserver(() => { const r = document.body.classList.contains('one-row'); if (r !== window.__was) { window.__flips.push(r ? 'row' : 'not'); window.__was = r; } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        window.__watching = true;
      });
      const flips = () => zf(page).locator('html').evaluate(() => window.__flips.join(', '));
      const slow = async (steps, rect) => {
        const wrong = [];
        for (const s of steps) {
          await page.evaluate(([k, r]) => window.__board21.setRect(k, r), [K, rect(s)]); await page.waitForTimeout(120);
          const x = await arrange(page);
          if (x.oneRow !== x.rule || x.shape !== (x.rule ? 'row' : '2x2')) wrong.push(`${x.iw} × ${x.ih}: ${x.shape}${x.oneRow ? ', .one-row' : ''}`);
        }
        return wrong;
      };
      const span = (a, b) => { const out = []; for (let i = a; a < b ? i <= b : i >= b; i += a < b ? 1 : -1) out.push(i); return out; };
      await at(W0 - 6, 500); await watch();
      const wW = await slow(span(W0 - 6, W0 + 5).concat(span(W0 + 4, W0 - 6)), w => ({ x: 400, y: 0, w, h: 540 }));
      const fW = await flips();
      await at(900, H0 - 6); await watch();
      const wH = await slow(span(H0 - 6, H0 + 5).concat(span(H0 + 4, H0 - 6)), h => ({ x: 400, y: 0, w: 900, h: h + 40 }));
      const fH = await flips();
      ok(fW === 'row, not' && fH === 'not, row' && !wW.length && !wH.length,
        `resizing slowly across both lines and back, 1 px at a time: one switch each way, never a flicker (${W0 - 6} to ${W0 + 5} px wide and back: ${fW}; ${H0 - 6} to ${H0 + 5} px tall and back: ${fH}${wW.concat(wH).length ? '; ' + wW.concat(wH).join(', ') : ''})`);
      // (Review fix) Where the pad is a fraction of a pixel: 2.5vmin of a window 370, 490, 545, 570, or 650 px tall. Across
      // the width where each card reaches 190 px, 1 px at a time (at 490 px tall, out and back): every row has every card at
      // least 190 px wide, with 4 “−”, 4 Ideas, and 13 feeling words, and one switch each way. (At 821 × 490 the cards’ area
      // is 796.5 px, so each card could be 189.94 px: two by two.)
      const thin = [], thinSeen = [];
      let f490 = '';
      for (const h of [370, 490, 545, 570, 650]) {
        const line = 760 + 5 * h / 40, both = h === 490, lo = Math.floor(line) - (both ? 6 : 3), hi = Math.ceil(line) + (both ? 6 : 3);
        await at(lo, h); if (both) await watch();
        let first = '';
        for (const w of both ? span(lo, hi).concat(span(hi - 1, lo)) : span(lo, hi)) {
          await page.evaluate(([k, r]) => window.__board21.setRect(k, r), [K, { x: 400, y: 0, w, h: h + 40 }]); await page.waitForTimeout(120);
          const x = await arrange(page), s = x.shows, least = Math.min(...x.cards.map(c => c.card.w));
          const l = (x.oneRow === x.rule && x.shape === (x.rule ? 'row' : '2x2') ? [] : [`${x.shape}${x.oneRow ? ', .one-row' : ''}`]).concat(
            !x.oneRow || (least >= 190 - 0.001 && s.minus === 4 && s.ideas === 4 && s.words === 13) ? [] : [`cards ${least.toFixed(2)} px wide, ${s.minus} “−”, ${s.ideas} Ideas, ${s.words} words`]);
          if (l.length) thin.push(`${x.iw} × ${x.ih}: ${l.join(', ')}`);
          if (x.oneRow && !first) first = `${h} px tall: a row from ${x.iw} px, cards ${least.toFixed(2)} px`;
        }
        thinSeen.push(first || `${h} px tall: no row`);
        if (both) f490 = await flips();
      }
      ok(!thin.length && f490 === 'row, not' && thinSeen.every(t => !t.endsWith('no row')),
        `where the pad is a fraction of a pixel, 1 px at a time across the width where each card reaches 190 px: every row has its cards at least 190 px wide, 4 “−”, 4 Ideas, and 13 words. At 490 px tall, out and back, one switch each way (${thinSeen.join('; ')}; 490 px tall: ${f490 || 'no switch'}${thin.length ? '; ' + thin.join(' | ') : ''})`);
    });

    // ---- 3. Two by two stays at the size it opens at, at 260 × 220, and in windows taller than they are wide. A very tall,
    // narrow window stays one column.
    await part('Two by two stays', async () => {
      const B80 = ['16:9', 0.8, 1920, 1080];
      const bad = [], seen = [];
      for (const [label, win, shape] of [['the size it opens at', { w: 560, h: 420 }, '2x2'], ['260 × 220', { w: 260, h: 220 }, '2x2'], ['900 × 1000', { w: 900, h: 1000, x: 300 }, '2x2'],
        ['1100 × 1200', { w: 1100, h: 1200, x: 300 }, '2x2'], ['300 × 740', { w: 300, h: 740, x: 300 }, 'column'], ['400 × 1100', { w: 400, h: 1100, x: 300 }, 'column']]) {
        await put(...B80, win);
        const x = await still(), p = await problems(page, label, true);
        const l = (x.shape === shape && !x.oneRow ? [] : [`${x.shape}${x.oneRow ? ', .one-row' : ''}`]).concat(p.list);
        (l.length ? bad : seen).push(`${label}: ${x.iw} × ${x.ih}, ${x.shape}, cards ${card(x)}${l.length ? ': ' + l.join(', ') : ''}`);
      }
      ok(!bad.length && seen.length === 6, `two by two at the size it opens at, at 260 × 220, and in windows taller than they are wide; one column in very tall, narrow ones (${bad.join(' | ') || seen.join('; ')})`);
      // (Review fix) The layout comes from the window's size, not from where it sits: 900 × 1000 parked in a bottom corner,
      // under a ▦, stays two by two, its cards clear of the ▦, with 4 “−”, 4 Ideas, and 13 feeling words.
      const parked = [], parkedSeen = [];
      for (const [label, win] of [['900 × 1000, bottom left', { w: 900, h: 1000, x: 0, y: 310 }], ['900 × 1000, bottom right', { w: 900, h: 1000, x: 1500, y: 310 }]]) {
        await put(...B80, win);
        const x = await still(), p = await problems(page, label, true), s = x.shows;
        const l = (x.shape === '2x2' && !x.oneRow ? [] : [`${x.shape}${x.oneRow ? ', .one-row' : ''}`]).concat(
          x.corners && x.marks.some(m => m.over && m.name === 'picker-btn') ? [] : ['not under a ▦'], s.minus === 4 && s.ideas === 4 && s.words === 13 ? [] : [`${s.minus} “−”, ${s.ideas} Ideas, ${s.words} words`], ends(x), p.list);
        (l.length ? parked : parkedSeen).push(`${label}: ${x.iw} × ${x.ih}, ${x.shape}, cards ${card(x)}${x.corners ? ` (corners ${x.corners.left}/${x.corners.right}/${x.corners.height})` : ''}${l.length ? ': ' + l.join(', ') : ''}`);
      }
      ok(!parked.length && parkedSeen.length === 2, `a window taller than wide parked in a bottom corner, under a ▦, stays two by two, its cards clear of it, with every “−”, Ideas, and feeling word (${parked.join(' | ') || parkedSeen.join('; ')})`);
    });

    // ---- 4. The ▦ fix: a window dragged to cover the board at Size 200%, light and dark, with both Widget Picker corners,
    // Left only, and Right only, the clock on and off. The board tells it of its buttons (corners), and no card, feeling,
    // line, or bar is under a ▦ or the clock: every card ends just above them, within 1 px of the view's bottom less
    // corners.height. The strip between them stays empty.
    // How many of the board's buttons are over the window, by corners and clock: ▦ twice or once, and the clock.
    const over = x => x.marks.filter(m => m.over && m.name !== 'lock-pad').length;
    // What is wrong with a window dragged to cover the board (l), and what it is (said: then what is wrong).
    const clearOf = (x, p, where) => {
      const l = (x.shape === 'row' ? [] : [x.shape]).concat(x.filled ? ['filling the board'] : [], x.corners ? [] : ['no corners'], ends(x), atTop(x), p.list);
      const base = `${where}, ${x.iw} × ${x.ih}, cards end at ${Math.round(Math.max(...x.cards.map(c => c.card.b)))} of ${x.ih}${x.corners ? ` (corners ${x.corners.left}/${x.corners.right}/${x.corners.height})` : ''}`;
      return { l, said: more => `${base}${more || ''}${l.length ? ': ' + l.join(', ') : ''}` };
    };
    // ---- Tyler's choice (2026.11.24-4): a window under the board's buttons always keeps clear of them, even a small one.
    // The window it opens at, 560 × 420, parked in a bottom corner under ▦ and the clock: still two by two, its cards end
    // just above them, with 4 “−” and 4 Ideas. Its cards get shorter, so its feeling words may hide until it moves.
    await part('A small window in a corner keeps clear', async () => {
      const B80 = ['16:9', 0.8, 1920, 1080];
      await clock('on');
      const bad = [], seen = [];
      for (const [label, win] of [['560 × 420, bottom right, under ▦ and the clock', { w: 560, h: 420, x: 1840, y: 890 }], ['560 × 420, bottom left, under ▦', { w: 560, h: 420, x: 0, y: 890 }]]) {
        await put(...B80, win);
        const x = await still(), p = await problems(page, label, true), s = x.shows;
        const l = (x.shape === '2x2' && !x.oneRow ? [] : [`${x.shape}${x.oneRow ? ', .one-row' : ''}`]).concat(
          x.corners && x.marks.some(m => m.over) ? [] : ['not under the buttons'], s.minus === 4 && s.ideas === 4 ? [] : [`${s.minus} “−”, ${s.ideas} Ideas`], ends(x), p.list);
        (l.length ? bad : seen).push(`${label}: ${x.iw} × ${x.ih}, ${x.shape}, cards ${card(x)}, ${s.words} words${x.corners ? ` (corners ${x.corners.left}/${x.corners.right}/${x.corners.height})` : ''}${l.length ? ': ' + l.join(', ') : ''}`);
      }
      await clock('auto');
      ok(!bad.length && seen.length === 2, `the window it opens at, parked in a bottom corner, keeps clear of ▦ and the clock: two by two, the cards ending just above them, with 4 “−” and 4 Ideas (${bad.join(' | ') || seen.join('; ')})`);
    });

    await part('The ▦ fix at Size 200%', async () => {
      const bad = [], seen = [], B200 = ['16:9', 2, 1920, 1080];
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        for (const v of ['both', 'left', 'right']) {
          if (side !== v) await pickerCorners(v);
          for (const mode of ['on', 'off']) {
            await clock(mode);
            await put(...B200, 'cover');
            const x = await still(), where = `${theme}, ${v === 'both' ? 'both corners' : v === 'left' ? 'Left only' : 'Right only'}, the clock ${mode}`;
            const p = await problems(page, where, true), r = clearOf(x, p, where), want = (v === 'both' ? 2 : 1) + (mode === 'on' ? 1 : 0);
            if (over(x) !== want) r.l.push(`${over(x)} of the board’s ${want} buttons over it`);
            if (p.theme !== theme) r.l.push(`the ${p.theme} theme`);
            (r.l.length ? bad : seen).push(r.said());
            if (v === 'both' && mode === 'on') await page.screenshot({ path: OUT + `zones-more-cover-200-${theme}.png` });
          }
        }
        await pickerCorners('both');
      }
      await setTheme(page, 'light');
      ok(!bad.length && seen.length === 12, `a window dragged to cover the board at Size 200%, light and dark, both corners, Left only, and Right only, the clock on and off: told of the buttons, a row, no card, feeling, line, or bar under a ▦ or the clock, the cards ending just above them (${bad.join(' | ') || seen.join('; ')})`);
    });
    await part('The ▦ fix at Sizes 80%, 100%, and 150%', async () => {
      const bad = [], seen = [];
      await clock('on');
      for (const sc of [0.8, 1, 1.5]) {
        await put('16:9', sc, 1920, 1080, 'cover');
        const x = await still(), p = await problems(page, `Size ${sc * 100}%`, true), r = clearOf(x, p, `Size ${sc * 100}%`);
        if (over(x) !== 3) r.l.push(`${over(x)} of the board’s 3 buttons over it`);
        (r.l.length ? bad : seen).push(r.said());
      }
      ok(!bad.length && seen.length === 3, `the same at Sizes 80%, 100%, and 150%, the clock on (${bad.join(' | ') || seen.join('; ')})`);
    });

    // ---- 5. Dragged away from the corners, by its title bar: corners goes, and the cards reach the bottom again. Dragged
    // back: they keep clear again, in the same page. (Size 200%, the clock on: a window 600 × 360 over the bottom left ▦.)
    await part('Dragged away and back', async () => {
      await put('16:9', 2, 1920, 1080, { w: 600, h: 360, x: 0, y: 140 });
      await zf(page).locator('html').evaluate(() => { window.__same = 'same page'; });
      const told = () => zf(page).locator('html').evaluate(() => (Board21.context.window && Board21.context.window.corners) || null);
      const drag = async (dx, dy) => {
        const t = await page.locator(`.win[data-ikey="${K}"] .win-title`).boundingBox(), x0 = t.x + 40, y0 = t.y + t.height / 2;
        await page.mouse.move(x0, y0); await page.mouse.down();
        for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + dx * i / 12, y0 + dy * i / 12); await page.waitForTimeout(30); }
        await page.mouse.up(); await page.waitForTimeout(700);
        return still();
      };
      const a = await still(), aTold = await told();
      const b = await drag(400, -280), bTold = await told();
      const c = await drag(-400, 280), cTold = await told();
      const same = await zf(page).locator('html').evaluate(() => window.__same === 'same page');
      const say = (x, t) => `${x.iw} × ${x.ih} at ${JSON.stringify(x.marks.filter(m => m.over).map(m => m.name))}, told ${t ? `${t.left}/${t.right}/${t.height}` : 'nothing'}, cards end at ${Math.round(Math.max(...x.cards.map(k => k.card.b)))}`;
      const l = [].concat(aTold && over(a) && !ends(a).length ? [] : ['over ▦: ' + ends(a).join(', ')], !bTold && !over(b) && !ends(b).length ? [] : ['away: ' + ends(b).join(', ')],
        cTold && over(c) && !ends(c).length ? [] : ['back: ' + ends(c).join(', ')], same ? [] : ['the page reloaded']);
      ok(!l.length && !!aTold && aTold.height > 0 && !bTold && !!cTold && cTold.height === aTold.height && Math.abs(cTold.left - aTold.left) <= 1,
        `dragged away from the corners, corners goes and the cards reach the bottom again; dragged back, they keep clear again, without a reload (over ▦: ${say(a, aTold)}; away: ${say(b, bTold)}; back: ${say(c, cTold)}${l.length ? ': ' + l.join(', ') : ''})`);
      // The same by the board's own moves: covering the board, a smaller window in its middle, covering it again.
      await put('16:9', 2, 1920, 1080, 'cover'); const d = await still();
      await put('16:9', 2, 1920, 1080, { w: 600, h: 300, x: 180, y: 60 }); const e = await still();
      await put('16:9', 2, 1920, 1080, 'cover'); const f = await still();
      ok(!!d.corners && !ends(d).length && !e.corners && !ends(e).length && !!f.corners && !ends(f).length && JSON.stringify(f.corners) === JSON.stringify(d.corners) &&
        await zf(page).locator('html').evaluate(() => window.__same === 'same page'),
        `covering the board, then in its middle, then covering it again: told, then not, then told again, the cards clear each time, no reload (${[d, e, f].map(x => `${x.iw} × ${x.ih}: ${x.corners ? JSON.stringify(x.corners) : 'no corners'}`).join('; ')})`);
    });

    // ---- 6. Locked, both lock modes, the clock on, in a window dragged to cover the board: the line and the bar sit clear
    // of the padlocks, and the cards start below them (corners.top). Sizes 200% and 80%.
    await part('Locked', async () => {
      const bad = [], seen = [];
      await clock('on');
      for (const sc of [2, 0.8]) for (const mode of ['widgets', 'all']) {
        await put('16:9', sc, 1920, 1080, 'cover');
        await lockBoard(page, mode); await page.waitForTimeout(600);
        const x = await still(), where = `Size ${sc * 100}%, ${mode === 'all' ? 'Lock everything' : 'Widgets still work'}`, p = await problems(page, where, true), r = clearOf(x, p, where);
        const pads = x.marks.filter(m => m.name === 'lock-pad' && m.over).length, ct = x.corners && x.corners.top;
        if (pads !== 2) r.l.push(`${pads} padlocks over it`);
        if (!(ct && ct.height > 0 && ct.left > 0 && ct.right > 0)) r.l.push(`corners.top ${JSON.stringify(ct)}`);
        (r.l.length ? bad : seen).push(r.said(ct ? `, top ${ct.left}/${ct.right}/${ct.height}` : ''));
        if (sc === 2 && mode === 'widgets') await page.screenshot({ path: OUT + 'zones-more-cover-200-locked.png' });
        await unlockBoard(page);
      }
      ok(!bad.length && seen.length === 4, `locked, both lock modes, the clock on, in a window dragged to cover the board: the line and the bar between the padlocks, under neither, the cards starting below them and ending just above the board’s buttons (${bad.join(' | ') || seen.join('; ')})`);
    });

    // ---- 7. The board: a window that doesn't fill it hears `corners` only while one of the board's buttons is over its
    // content, with each button's box mapped into the window (left and right: how far in from its left and right edges,
    // by the side of the window each button's middle is on; height: up from its bottom; top: the padlocks, down from its
    // top), in its CSS px, 0 for a side with none. The frame hears what the board says. A window that fills the board
    // hears cornerReach, as before.
    await part('The board’s corners', async () => {
      // What the board should say, from the boxes on screen: null when none of them is over the window's content.
      const want = k => page.evaluate(k => {
        const s = window.__board21.zoom.s, f = document.querySelector(`.win[data-ikey="${k}"] iframe`).getBoundingClientRect(), mid = (f.left + f.right) / 2;
        const boxes = sel => [...document.querySelectorAll(sel)].filter(e => !e.hidden && getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect())
          .filter(b => b.width > 0 && b.left < f.right && b.right > f.left && b.top < f.bottom && b.bottom > f.top);
        const reach = (bs, top) => bs.length ? {
          left: Math.ceil(Math.max(0, ...bs.filter(b => (b.left + b.right) / 2 < mid).map(b => b.right - f.left)) / s),
          right: Math.ceil(Math.max(0, ...bs.filter(b => (b.left + b.right) / 2 >= mid).map(b => f.right - b.left)) / s),
          height: Math.ceil((top ? Math.max(...bs.map(b => b.bottom)) - f.top : f.bottom - Math.min(...bs.map(b => b.top))) / s) } : { left: 0, right: 0, height: 0 };
        const low = reach(boxes('.picker-btn, .corner-clock')), high = reach(boxes('.lock-pad'), true);
        return low.height || high.height ? Object.assign(low, { top: high }) : null;
      }, k);
      const said = (k = K) => page.evaluate(k => { const i = window.__board21.state.wins.get(k).info(); return i.corners || null; }, k);
      const heard = (k = K) => page.frameLocator(`.win[data-ikey="${k}"] iframe`).locator('html').evaluate(() => (Board21.context.window && Board21.context.window.corners) || null);
      const near = (a, b) => (!a && !b) || (!!a && !!b && ['left', 'right', 'height'].every(n => Math.abs(a[n] - b[n]) <= 1 && Math.abs(a.top[n] - b.top[n]) <= 1));
      const fmt = c => c ? `${c.left}/${c.right}/${c.height}, top ${c.top.left}/${c.top.right}/${c.top.height}` : 'none';
      const bad = [], seen = [];
      const check = async (label, x0 = K) => {
        await page.waitForTimeout(300);
        const w = await want(x0), s = await said(x0);
        let h = null; for (let i = 0; i < 20; i++) { h = await heard(x0); if (JSON.stringify(h) === JSON.stringify(s)) break; await page.waitForTimeout(100); }
        const l = (near(s, w) ? [] : [`the board says ${fmt(s)}, not ${fmt(w)}`]).concat(JSON.stringify(h) === JSON.stringify(s) ? [] : [`the frame heard ${fmt(h)}`]);
        (l.length ? bad : seen).push(`${label}: ${fmt(s)}${l.length ? ': ' + l.join(', ') : ''}`);
        return s;
      };
      await clock('on');
      // A Fill board at 100% on 1920 × 1080: ▦ in both bottom corners, the clock beside the right one. (Board px are screen
      // px here. ▦'s top: y.)
      const F = ['free', 1, 1920, 1080];
      await put(...F, 'cover');
      const y = Math.round(await page.evaluate(() => document.querySelector('.picker-btn.left').getBoundingClientRect().top));
      const cases = [['covering the board', 'cover', c => c && c.left > 0 && c.right > c.left + 100 && c.height > 0 && !c.top.height],
        ['over the bottom left ▦', { w: 600, h: 360, x: 0, y: 680 }, c => c && c.left > 0 && c.right === 0],
        ['over the bottom right ▦ and the clock', { w: 600, h: 360, x: 1320, y: 680 }, c => c && c.left === 0 && c.right > 100],
        ['its left edge in the middle of ▦', { w: 600, h: 360, x: 40, y: 680 }, c => c && c.left > 0 && c.left < 40],
        ['between them, along the bottom', { w: 600, h: 360, x: 660, y: 680 }, c => !c],
        ['its bottom on ▦’s top', { w: 600, h: 360, x: 0, y: y - 400 }, c => !c],
        ['1 px over ▦’s top', { w: 600, h: 360, x: 0, y: y - 399 }, c => c && c.height === 1],
        ['in the middle of the board', { w: 600, h: 360, x: 660, y: 300 }, c => !c]];
      for (const [label, win, good] of cases) {
        await put(...F, win);
        const s = await check(label);
        if (!good(s)) bad.push(`${label}: not as expected (${fmt(s)})`);
      }
      // Locked: the padlocks in the top corners. Over its top left, corners.top only; along the top between them, none.
      await put(...F, { w: 600, h: 360, x: 0, y: 0 });
      await lockBoard(page, 'widgets'); await page.waitForTimeout(600);
      const t = await check('locked, under the top left padlock');
      if (!(t && t.top.left > 0 && t.top.right === 0 && t.top.height > 0 && !t.height)) bad.push(`locked, under the top left padlock: not as expected (${fmt(t)})`);
      await page.evaluate(k => window.__board21.setRect(k, { x: 660, y: 0, w: 600, h: 400 }), K);
      const t2 = await check('locked, along the top between the padlocks');
      if (t2) bad.push(`locked, along the top between the padlocks: not as expected (${fmt(t2)})`);
      await page.evaluate(k => window.__board21.setRect(k, { x: 0, y: 0, w: 1920, h: 1080 }), K);
      const t3 = await check('locked, covering the board');
      if (!(t3 && t3.top.left > 0 && t3.top.right > 0 && t3.height > 0)) bad.push(`locked, covering the board: not as expected (${fmt(t3)})`);
      await unlockBoard(page);
      const t4 = await check('unlocked again, covering the board');
      if (!(t4 && !t4.top.height && t4.height > 0)) bad.push(`unlocked again: not as expected (${fmt(t4)})`);
      // The clock going and coming, and Right only, while the window covers the board: told at once (notifyCorners).
      await clock('off'); const c1 = await check('covering the board, the clock off');
      await clock('on'); const c2 = await check('covering the board, the clock on again');
      await pickerCorners('right'); const c3 = await check('covering the board, Right only');
      await pickerCorners('both');
      if (!(c1 && c2 && c3 && c2.right > c1.right + 100 && c3.left === 0 && c3.right === c2.right)) bad.push(`the clock and the corners: not as expected (${[c1, c2, c3].map(fmt).join('; ')})`);
      // The 16:9 board at Size 200%, covering it: the zoom divides it.
      await put('16:9', 2, 1920, 1080, 'cover'); await check('the 16:9 board at Size 200%, covering it');
      ok(!bad.length && seen.length === 16, `a window that doesn’t fill the board hears corners only while one of the board’s buttons is over it, matching their boxes mapped into the window, and the frame hears what the board says (${bad.join(' | ') || seen.join('; ')})`);
      // A window that fills the board: as before, from the screen's edges (cornerReach), whatever is over it.
      const reach = () => page.evaluate(() => {
        const s = window.__board21.zoom.s, r = e => e.getBoundingClientRect(), clock = document.querySelector('.corner-clock:not([hidden])');
        const L = r(document.querySelector('.picker-btn.left')), R = r(document.querySelector('.picker-btn.right')), C = clock ? r(clock) : null;
        return { left: Math.ceil(L.right / s), right: Math.ceil((innerWidth - Math.min(R.left, C ? C.left : Infinity)) / s), height: Math.ceil((innerHeight - Math.min(L.top, R.top, C ? C.top : Infinity)) / s) };
      });
      const filled = [];
      for (const b of [F, ['16:9', 2, 1920, 1080], ['free', 1.25, 1366, 768]]) {
        await put(...b, 'fill'); await page.waitForTimeout(300);
        const s = await said(), r = await reach(), h = await heard();
        const good = !!s && ['left', 'right', 'height'].every(n => Math.abs(s[n] - r[n]) <= 1) && s.top && s.top.height === 0 && JSON.stringify(h) === JSON.stringify(s);
        filled.push(`${name(b)}: ${fmt(s)}${good ? '' : ` (from the screen’s edges ${r.left}/${r.right}/${r.height}; the frame heard ${fmt(h)})`}`);
        if (!good) filled.push('✗');
      }
      ok(!filled.includes('✗'), `a window that fills the board hears corners as before, from the screen’s edges (${filled.filter(f => f !== '✗').join('; ')})`);
      await page.evaluate(k => window.__board21.setMaximized(k, false), K);
    });

    // ---- 7b. (Review fix) The clock getting wider at 10:00, with no layout and no setting changed in between: a window
    // dragged to cover the board hears its new corners at once (notifyCorners), and its cards stay clear of the clock. (A
    // board of its own, its clock set to 9:59.)
    await part('The clock getting wider', async () => {
      const c2 = await browser.newContext({ viewport: { width: 1920, height: 1080 }, timezoneId: 'UTC', locale: 'en-US' });
      try {
        const p2 = await c2.newPage();
        p2.on('pageerror', e => errors.push(e.message));
        await p2.clock.install({ time: new Date('2026-11-24T09:59:00Z') });
        await p2.goto(BASE); await boardUp(p2);
        await p2.evaluate(() => { window.__board21.setBoardShape('free'); window.__board21.setBoardScale(1); });
        await p2.evaluate(() => window.__board21.openWidget('zones-check-in'));
        ok(await connected(p2), '(the Zones Check-In connects, at 9:59)');
        await setCornerClock(p2, 'on');
        await p2.evaluate(k => { const B = window.__board21, v = B.boundsRect(); B.setRect(k, { x: v.x, y: v.y, w: v.w, h: v.h }); }, K);
        await p2.waitForTimeout(800);
        const heard = () => zf(p2).locator('html').evaluate(() => (Board21.context.window && Board21.context.window.corners) || null);
        const time = () => p2.evaluate(() => document.querySelector('.corner-clock').textContent.trim());
        const a = await arrange(p2), aHeard = await heard(), aTime = await time();
        await p2.clock.fastForward('01:00'); await p2.waitForTimeout(800);
        const b = await arrange(p2), bHeard = await heard(), bTime = await time();
        const fmt = c => c ? `${c.left}/${c.right}/${c.height}` : 'none';
        ok(!!a.corners && !!b.corners && !b.filled && b.corners.right > a.corners.right && JSON.stringify(aHeard) === JSON.stringify(a.corners) && JSON.stringify(bHeard) === JSON.stringify(b.corners) && !ends(b).length,
          `the clock getting wider at 10:00, nothing else changed: a window dragged to cover the board hears its new corners at once, its cards clear of the clock (“${aTime}”: the board says ${fmt(a.corners)}, the window heard ${fmt(aHeard)}; “${bTime}”: the board says ${fmt(b.corners)}, the window heard ${fmt(bHeard)}${ends(b).length ? ': ' + ends(b).join(', ') : ''})`);
      } finally { await c2.close(); }
    });

    // ---- 8. Every other widget that reads corners reads it only while its window fills the board, so in a window dragged
    // under the board's buttons it is drawn exactly as before: every element where it was when the board sent no corners to
    // such a window. Size 200%, the clock on, unlocked and locked. And no widget but the Zones Check-In and the SDK
    // Playground (which shows what it hears) reads corners without maximized beside it.
    await part('Other widgets', async () => {
      // (Animations and transitions stopped, so an idle animation, such as the First/Then Board's, doesn't move anything.)
      const layout = k => page.frameLocator(`.win[data-ikey="${k}"] iframe`).locator('html').evaluate(() => {
        if (!document.getElementById('test-still')) {
          const st = document.createElement('style'); st.id = 'test-still';
          st.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
          document.head.appendChild(st);
        }
        const out = [];
        for (const e of document.querySelectorAll('body *')) {
          const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') continue;
          const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue;
          out.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} ${[r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10).join(',')}`);
        }
        return { text: out.join('\n'), n: out.length, corners: (Board21.context.window && Board21.context.window.corners) || null, filled: !!(Board21.context.window && Board21.context.window.maximized) };
      });
      // The board as before this release, for this window only: no corners for a window that doesn't fill the board.
      const before = (k, on) => page.evaluate(([k, on]) => {
        const w = window.__board21.state.wins.get(k);
        if (on && !w.__post) { w.__post = w.post; w.post = function (type, p) { if (type === 'window' && p && p.info && !p.info.maximized && p.info.corners) { const info = Object.assign({}, p.info); delete info.corners; p = Object.assign({}, p, { info }); } return w.__post.call(this, type, p); }; }
        if (!on && w.__post) { w.post = w.__post; delete w.__post; }
        w.lastInfo = ''; w.notifyInfo();
      }, [k, on]);
      const steady = async k => { let a = await layout(k); for (let i = 0; i < 12; i++) { await page.waitForTimeout(250); const b = await layout(k); if (b.text === a.text) return b; a = b; } return a; };
      await page.evaluate(k => window.__board21.closeWin(k), K); await page.waitForTimeout(300);
      await clock('on');
      const bad = [], seen = [];
      for (const id of ['calculator', 'first-then-board', 'name-picker', 'youtube-player', 'weather']) {
        const key = await page.evaluate(id => window.__board21.openWidget(id), id);
        await eventually(() => page.evaluate(k => { const w = window.__board21.state.wins.get(k); return !!(w && w.connected); }, key));
        await page.waitForTimeout(600);
        for (const locked of [false, true]) {
          await put('16:9', 2, 1920, 1080, 'cover', key);
          if (locked) { await lockBoard(page, 'widgets'); await page.waitForTimeout(600); }
          const now = await steady(key);
          await before(key, true); const was = await steady(key);
          await before(key, false); const again = await steady(key);
          const l = (now.corners && !now.filled ? [] : ['not told of the buttons']).concat(was.corners ? ['told, as before'] : [], again.corners ? [] : ['not told again'],
            now.text === was.text && again.text === was.text ? [] : [`moved: ${now.text.split('\n').filter(x => !was.text.split('\n').includes(x)).slice(0, 3).join(' | ')}`]);
          (l.length ? bad : seen).push(`${id}${locked ? ', locked' : ''}: ${now.n} elements${now.corners ? `, told ${now.corners.left}/${now.corners.right}/${now.corners.height}, top ${now.corners.top.height}` : ''}${l.length ? ': ' + l.join(', ') : ''}`);
          if (locked) await unlockBoard(page);
        }
        await page.evaluate(k => window.__board21.closeWin(k), key); await page.waitForTimeout(300);
      }
      ok(!bad.length && seen.length === 10, `the Calculator, First/Then Board, Name Picker, YouTube Player, and Weather, dragged to cover the board at Size 200% with the clock on, unlocked and locked: told of the buttons, and every element where it is when the board tells them nothing (${bad.join(' | ') || seen.join('; ')})`);
      const readers = [];
      for (const d of fs.readdirSync(path.join(ROOT, 'widgets'))) {
        const f = path.join(ROOT, 'widgets', d, 'index.html');
        if (!fs.existsSync(f) || ['zones-check-in', 'sdk-playground'].includes(d)) continue;
        fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (/\.corners\b/.test(line) && !/maximized/.test(line)) readers.push(`${d}:${i + 1}`); });
      }
      ok(!readers.length, `no other widget reads corners without maximized beside it (${readers.join(', ') || 'none'})`);
    });

    // ---- 9. The docs: the README, the SDK, and the Teacher Guide.
    await part('Docs', async () => {
      const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
      const readme = read('README.md').replace(/\s+/g, ' '), row = (/\| \*\*Zones Check-In\*\* \|[^|]*\|/.exec(readme) || [''])[0];
      ok(row.endsWith(' The four zones sit in one row once the window is about 830 px wide and wider than it is tall, and always when it fills a board at least 850 × 480 px. The cards keep clear of the board\'s own buttons |') && !row.includes('in every student\'s reach'),
        `the README’s Zones Check-In row ends with when the zones sit in one row, and that the cards keep clear of the board’s own buttons (…${row.slice(-200)})`);
      const sdk = read('docs/WIDGET-SDK.md'), info = sdk.split('\n').find(l => l.startsWith('| `Board21.window.getInfo()` |')) || '';
      ok(info.includes('`corners`'), 'docs/WIDGET-SDK.md has corners in getInfo()');
      const guide = read('docs/teacher-guide/page-src.html'), i = guide.indexOf('id="w-zones-check-in"'), zc = guide.slice(i, guide.indexOf('</article>', i));
      ok(stamped(), STAMPED);
    });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ];
};
