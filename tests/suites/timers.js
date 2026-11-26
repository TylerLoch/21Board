// The Timer, the Stopwatch, the Task Timer, and the Traffic Light.
'use strict';
module.exports = T => {
  const {
    fs, path, OUT, ok, freeBoard, openSettings, addWin, hear, heard, eventually, release, boardUp, contrast, rgbOf, BASE
  } = T;
  return [
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
    // A finished timer flashes for a short while, then stays red; with "reduce motion" on it never flashes.
    const doneLook = () => timer.locator('body').evaluate(b => { const c = getComputedStyle(b); return { done: b.classList.contains('done'), anim: c.animationName, secs: parseFloat(c.animationDuration) * +c.animationIterationCount, bg: c.backgroundColor }; });
    let fl = await doneLook();
    ok(fl.done && fl.anim === 'flash' && fl.secs <= 15, `a finished timer flashes for a short while, not for ever (${fl.secs} s)`);
    await timer.locator('body').evaluate(() => document.getAnimations().forEach(a => a.finish()));
    fl = await doneLook();
    ok(fl.bg === 'rgb(220, 38, 38)' && await page.locator('.win[data-ikey="timer:1"] .win-label .sub').textContent() === 'Done!', 'then it stays red and says Done!');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    fl = await doneLook();
    ok(fl.done && fl.anim === 'none' && fl.bg === 'rgb(220, 38, 38)', 'with “reduce motion” on, a finished timer is steady red and never flashes');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- The alarm when 21Board isn't the tab or window on screen, and with several copies open.
    // Every AudioContext a page makes is noted: its state when made and since, and how far ahead each note was set.
    const SPY = () => {
      const Real = window.AudioContext;
      window.__audio = [];
      window.AudioContext = function () {
        const c = new Real(), rec = { ctx: c, states: [c.state], ahead: [] };
        window.__audio.push(rec);
        console.log('audio made ' + c.state);
        c.addEventListener('statechange', () => { rec.states.push(c.state); console.log('audio ' + c.state); });
        const mk = c.createOscillator.bind(c);
        c.createOscillator = () => { const o = mk(), start = o.start.bind(o); o.start = at => { rec.ahead.push(Math.round((at - c.currentTime) * 10) / 10); return start(at); }; return o; };
        return c;
      };
      // (This headless browser never hides a page, so a test says when the timer's page is behind another tab.)
      Object.defineProperty(document, 'visibilityState', { get: () => (window.__hidden ? 'hidden' : 'visible') });
    };
    const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx2.addInitScript(SPY);
    const A = await ctx2.newPage(); A.on('pageerror', e => errors.push(e.message));
    await A.goto(BASE); await boardUp(A); await freeBoard(A);
    await A.evaluate(() => window.__board21.openWidget('timer'));
    const tA = A.frameLocator('.win[data-ikey="timer:1"] iframe');
    await tA.locator('#chips button[data-min="1"]').click();
    const audio = f => f.locator('html').evaluate(() => (window.__audio || []).map(r => ({ state: r.ctx.state, ahead: r.ahead })));
    const ends = (page, ms) => page.evaluate(ms => window.__board21.state.wins.get('timer:1').post('data', { data: { duration: 60000, remaining: 60000, endsAt: Date.now() + ms }, reason: 'remote' }), ms);
    ok((await audio(tA)).length === 0, 'no sound is prepared before Start');
    await tA.locator('#go').click();
    let au = await audio(tA);
    ok(au.length === 1 && au[0].state === 'running' && au[0].ahead.length === 3 && au[0].ahead[0] > 59 && au[0].ahead[0] <= 60, `tapping Start gets the sound ready and sets the alarm for the end of the countdown (notes ${au[0] && au[0].ahead.join(', ')} s ahead)`);
    await tA.locator('#go').click();   // Pause
    ok(await eventually(async () => (await audio(tA))[0].state === 'closed', 3000), 'pausing calls the alarm off');
    await tA.locator('#go').click();   // Start again
    // A second copy of the board, and the first one goes behind another tab; the countdown ends 1.5 s from now.
    const B = await ctx2.newPage(); B.on('pageerror', e => errors.push(e.message));
    await B.goto(BASE); await boardUp(B);
    const tB = B.frameLocator('.win[data-ikey="timer:1"] iframe');
    await tB.locator('#go').waitFor();
    await tA.locator('html').evaluate(() => { window.__hidden = true; });
    await ends(A, 1500); await ends(B, 1500);
    ok(await eventually(async () => await tA.locator('body.done').count() === 1 && (await audio(tA))[1].state === 'closed'), 'the countdown ends while 21Board is behind another tab');
    au = await audio(tA);
    ok(au.length === 2 && au[1].ahead.length === 6 && au[1].ahead[3] > 0.8 && au[1].ahead[3] <= 1.5, `its alarm had been set ahead for that moment, and rang once (notes ${au[1].ahead.slice(3).join(', ')} s ahead)`);
    ok((await audio(tB)).length === 0 && await tB.locator('body.done').count() === 1, 'the other copy shows Done! too, and leaves the ringing to the copy where Start was tapped');
    await ctx2.close();

    // The page was loaded again while the timer ran, and nobody has tapped it since: the browser lets it make
    // no sound, so the alarm rings at the first tap.
    const ctx3 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx3.addInitScript(SPY);
    const C = await ctx3.newPage(); C.on('pageerror', e => errors.push(e.message));
    const said = [], hear = text => new Promise(res => { const look = () => (said.includes(text) ? res(true) : setTimeout(look, 100)); look(); setTimeout(() => res(false), 15000); });
    C.on('console', m => said.push(m.text()));
    await C.goto(BASE); await boardUp(C); await freeBoard(C);
    await C.evaluate(() => window.__board21.openWidget('timer'));
    const tC = C.frameLocator('.win[data-ikey="timer:1"] iframe');
    await tC.locator('#chips button[data-min="1"]').click();
    await tC.locator('html').evaluate(() => Board21.save({ duration: 60000, remaining: 60000, endsAt: Date.now() + 5000 }));
    said.length = 0;
    await C.reload();   // (from here on the test only listens, until its tap: looking into the page would count as a tap)
    const made = await hear('audio made suspended');
    await new Promise(r => setTimeout(r, 500));
    ok(made && !said.includes('audio running'), 'after the page is loaded again, the alarm can’t sound until the page is tapped');
    await C.mouse.click(900, 600);   // anywhere on the board
    ok(await hear('audio running'), 'and it rings at the first tap');
    au = await audio(C.frameLocator('.win[data-ikey="timer:1"] iframe'));
    ok(au.length === 1 && au[0].ahead.length === 3, `once (${au.length} alarm of ${au[0] && au[0].ahead.length} notes)`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx3.close();
  }],
  ['Task Timer: schedule, reload, two tabs, the alarm, a crafted file', async (browser) => {
    const errors = [];
    // Every AudioContext the widget makes is noted, with how far ahead (s) each oscillator was started.
    const SPY = () => {
      const Real = window.AudioContext;
      window.__audio = [];
      window.AudioContext = function () {
        const c = new Real(), rec = { ctx: c, ahead: [] };
        window.__audio.push(rec);
        const mk = c.createOscillator.bind(c);
        c.createOscillator = () => { const o = mk(), start = o.start.bind(o); o.start = at => { rec.ahead.push(Math.round((at - c.currentTime) * 10) / 10); return start(at); }; return o; };
        return c;
      };
    };
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(SPY);
    const A = await ctx.newPage(); A.on('pageerror', e => errors.push(e.message));
    await A.goto(BASE); await boardUp(A); await freeBoard(A);
    await A.evaluate(() => window.__board21.openWidget('task-timer'));
    const tt = page => page.frameLocator('.win[data-ikey="task-timer:1"] iframe');
    const started = f => f.locator('html').evaluate(() => typeof lastTickSecs !== 'undefined' && lastTickSecs !== null);   // (its first tick has run)
    const look = f => f.locator('html').evaluate(() => ({ name: document.getElementById('clock-task-name').textContent, time: document.getElementById('clock-task-time').textContent,
      btn: document.getElementById('btn-playpause').textContent, alarm: document.getElementById('clock-task-time').classList.contains('is-alarming') }));
    const secs = t => +t.split(':')[0] * 60 + +t.split(':')[1];
    const audio = f => f.locator('html').evaluate(() => (window.__audio || []).map(r => ({ state: r.ctx.state, ahead: r.ahead })));
    const saved = page => page.evaluate(() => JSON.stringify(window.__board21.state.data.get('task-timer:1')));
    const fA = tt(A);
    ok(await eventually(() => started(fA)) && await A.evaluate(() => window.__board21.state.wins.get('task-timer:1').connected), 'Task Timer opens and connects');
    // A schedule, made in its editor: Reading (1 min), Snack (2 min).
    await fA.locator('#btn-edit').click();
    await fA.locator('.editor-footer button.primary').click();
    await fA.locator('.editor-footer button.primary').click();
    await fA.locator('.task-name').nth(0).fill('Reading'); await fA.locator('.task-mins').nth(0).fill('1');
    await fA.locator('.task-name').nth(1).fill('Snack'); await fA.locator('.task-mins').nth(1).fill('2');
    await fA.locator('#view-edit .edit-header button').click();
    let a = await look(fA);
    ok(/Reading$/.test(a.name) && a.time === '01:00' && a.btn.includes('Start'), `the schedule is made in its editor (${a.name}, ${a.time})`);
    ok(await audio(fA).then(au => au.length === 0), 'no sound is prepared before Start');
    await fA.locator('#btn-playpause').click();
    // (The save reaches the board a moment after the tap: wait for it.)
    ok(await eventually(async () => { const d = JSON.parse(await saved(A)); return d.running === true && Math.abs(d.endsAt - Date.now() - 60000) < 3000 && d.tasks.length === 2; }), 'Start saves when the activity ends (a wall-clock time)');
    let au = await audio(fA);
    ok(au.length === 1 && au[0].state === 'running' && au[0].ahead.length === 2 && au[0].ahead.every(s => s > 55 && s <= 60), `tapping Start gets the sound ready and sets the alarm for the end of the activity (${au[0] && au[0].ahead.join(', ')} s ahead)`);
    // Loaded again while it runs: it carries on from the saved end time.
    await A.waitForTimeout(2200);
    await A.reload(); await boardUp(A);
    ok(await eventually(() => started(fA)), 'it starts again after a reload');
    a = await look(fA);
    const expect = Math.ceil((JSON.parse(await saved(A)).endsAt - Date.now()) / 1000);
    ok(a.btn.includes('Pause') && secs(a.time) <= 58 && Math.abs(secs(a.time) - expect) <= 1, `after a reload it is still running and the time has gone on (${a.time})`);
    // A second copy of the board shows the same time, and the copies don't fight.
    const B = await ctx.newPage(); B.on('pageerror', e => errors.push(e.message));
    await B.goto(BASE); await boardUp(B);
    const fB = tt(B);
    ok(await eventually(() => started(fB)), 'it opens in a second copy of the board');
    let b; [a, b] = [await look(fA), await look(fB)];
    ok(a.name === b.name && Math.abs(secs(a.time) - secs(b.time)) <= 1 && b.btn.includes('Pause'), `both copies show the same activity and time (${a.time} / ${b.time})`);
    const before = await saved(A);
    await A.waitForTimeout(1300);
    ok(await saved(A) === before && await saved(B) === before, 'while it runs, neither copy saves again (no back and forth)');
    await fB.locator('#btn-playpause').click();   // Pause, in the second copy
    ok(await eventually(async () => (await look(fA)).btn.includes('Start')), 'pausing in one copy pauses the other');
    [a, b] = [await look(fA), await look(fB)];
    ok(a.time === b.time, `and both show the same time left (${a.time} / ${b.time})`);
    // Started again in the first copy; the activity ends 1.5 s from now.
    await fA.locator('#btn-playpause').click();
    const ends = (page, ms) => page.evaluate(ms => { const s = window.__board21.state; s.wins.get('task-timer:1').post('data', { data: Object.assign({}, s.data.get('task-timer:1'), { running: true, endsAt: Date.now() + ms }), reason: 'remote' }); }, ms);
    await ends(A, 1500); await ends(B, 1500);
    ok(await eventually(async () => (await look(fA)).alarm && (await look(fB)).alarm), 'when the activity ends, both copies show the alarm');
    a = await look(fA);
    ok(/^🔔 Time’s up! /.test(a.name) && a.time === '00:00' && a.btn.includes('Stop alarm'), `it says so (${a.name}; ${a.btn})`);
    ok(await A.evaluate(() => { const m = window.__board21.state.wins.get('task-timer:1').menuItems; return m.length <= 24 && m[0].id === 'stop_alarm' && m[0].label === 'Stop alarm'; }), 'the window menu offers Stop alarm');
    await A.waitForTimeout(1500);
    au = await audio(fA);
    const auB = await audio(fB);
    ok(au.length === 1 && au[0].state === 'running' && au[0].ahead.length === 4 && au[0].ahead.slice(2).every(s => s > 0.5 && s <= 1.5), `the alarm had been set ahead for that moment in the copy where Start was tapped, and is ringing (${au[0] && au[0].ahead.join(', ')} s ahead)`);
    ok(auB.length === 0, 'the other copy leaves the ringing to it (one alarm per board)');
    // The alarm pulses for a short while (not at all with "reduce motion"), and stays red.
    const pulse = () => fA.locator('#clock-task-time').evaluate(e => { const c = getComputedStyle(e); return { anim: c.animationName, secs: parseFloat(c.animationDuration) * +c.animationIterationCount, color: c.color }; });
    let p = await pulse();
    ok(p.anim === 'alarmPulse' && p.secs <= 12, `the alarm pulses for about 10 seconds, not for ever (${p.secs} s)`);
    await A.emulateMedia({ reducedMotion: 'reduce' });
    p = await pulse();
    ok(p.anim === 'none' && p.color === 'rgb(220, 38, 38)', `with “reduce motion” on it doesn't pulse, and the time stays red (${p.color})`);
    await A.emulateMedia({ reducedMotion: 'no-preference' });
    // Stopped in the other copy: the alarm stops, and both go on to the next activity.
    await fB.locator('#btn-playpause').click();
    ok(await eventually(async () => (await audio(fA))[0].state === 'closed'), 'stopping the alarm in one copy silences the copy that rang');
    [a, b] = [await look(fA), await look(fB)];
    ok(/Snack$/.test(a.name) && /Snack$/.test(b.name) && a.time === '02:00' && !a.alarm && !b.alarm && a.btn.includes('Start'), `both go on to the next activity (${a.name} ${a.time} / ${b.name} ${b.time})`);
    await B.close();

    // A file made on purpose: whatever it says the Task Timer saved, nothing becomes markup or runs as script.
    const evil = '"><img src=x onerror="top.document.title=\'PWNED\';document.title=\'PWNED\'"><svg onload="top.document.title=\'PWNED\'">';
    const js = 'javascript:top.document.title=\'PWNED\'';
    const crafted = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Schedule' }, instances: [
      { widgetId: 'task-timer', instance: 1, open: true, z: 1, rect: { x: 20, y: 20, w: 420, h: 520 }, config: { color: evil },
        data: { totalMode: evil, totalMinutes: evil, activeIndex: evil, secondsLeft: evil, running: evil, endsAt: evil, alarm: evil, view: 'edit',
          tasks: [{ emoji: evil, name: evil, minutes: evil, color: evil }, { emoji: js, name: js, minutes: 1e9, color: 'red;background:url(' + js + ')' },
            { emoji: '<b>⭐</b>', name: ['x'], minutes: -5, color: '#12345g' }, 'not a task', null, 7].concat(Array(100).fill({ name: 'x', minutes: 1, color: '#000000' })) } }
    ] };
    fs.writeFileSync(OUT + 'crafted-task-timer.21board', JSON.stringify(crafted));
    await A.setInputFiles('#import-input', OUT + 'crafted-task-timer.21board'); await A.waitForTimeout(300);
    await A.click('#modal .btn:has-text("Replace this page")');   // Replace this page
    ok(await eventually(() => fA.locator('html').evaluate(() => typeof lastTickSecs !== 'undefined' && lastTickSecs !== null && state.tasks.length > 2)), 'a crafted file opens: the Task Timer starts');
    const marks = () => fA.locator('html').evaluate(() => document.querySelectorAll('img, svg, b, [onerror], [onload], [src^="javascript"], [href^="javascript"]').length + (document.title === 'PWNED' ? 100 : 0));
    a = await look(fA);
    ok(await A.title() !== 'PWNED' && await marks() === 0, `nothing in the file runs as script or becomes markup (page title: ${await A.title()})`);
    ok(a.name === '⭐ ' + evil.slice(0, 100) && a.time === '05:00' && a.btn.includes('Start') && !a.alarm, `names are shown as plain text (100 characters at most), and the rest falls back to the usual values (${a.time})`);
    ok(await fA.locator('html').evaluate(() => state.tasks.length === 50 && state.tasks.every(t => /^#[0-9a-f]{6}$/i.test(t.color) && Number.isInteger(t.minutes) && t.minutes >= 1 && t.minutes <= 720) && state.view === 'timer'), 'at most 50 activities are kept, each with a #hex colour and 1 to 720 minutes');
    await fA.locator('#btn-edit').click();   // the editor builds a card for each activity
    ok(await marks() === 0 && await A.title() !== 'PWNED', 'the editor shows them without making markup either');
    ok(await fA.locator('.task-name').first().inputValue() === evil.slice(0, 100) && (await fA.locator('.task-color').evaluateAll(els => els.every(e => /^#[0-9a-f]{6}$/.test(e.value)))) && await fA.locator('.btn-emoji-picker').first().textContent() === '⭐',
      'the editor shows the name as typed text, and ordinary colours and emoji');
    await fA.locator('#view-edit .edit-header button').click();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Traffic Light sideways, Follow timers, and the Timer\'s warning', async (browser) => {
    const errors = [];
    // Each part runs on its own: one that stops early is reported, and the next still runs.
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const F = (p, ik, fn, arg) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`).locator('html').evaluate(fn, arg);
    const connected = (p, ik) => eventually(() => p.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
    const menuOf = (p, ik) => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.map(i => i.separator ? '—' : i.heading ? `[${i.label}]` : (i.checked ? '✓ ' : '') + i.label).join(' | '), ik);
    const subOf = (p, ik) => p.locator(`.win[data-ikey="${ik}"] .win-label .sub`).textContent();
    // A window's ⌄ menu, and the item with this id in it, as a teacher taps it. False when there's no such item.
    const choose = async (p, ik, id) => {
      await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.waitForTimeout(200);
      const it = p.locator(`#menu [data-id="${id}"]`);
      if (!await it.count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); return false; }
      await it.click(); await p.waitForTimeout(350); return true;
    };
    const confOf = (p, ik) => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const dataOf = (p, ik) => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    // The stored records of a window (content and config): key, rev, and value.
    const recsOf = (p, ik) => p.evaluate(async ik => JSON.stringify((await window.__board21.store.getAll()).filter(r => r.key.endsWith(':' + ik) && /^(data|conf):/.test(r.key)).map(r => [r.key, r.rev, r.value])), ik);
    // A Timer set as the Timer saves it, and shown in its window (as a change from another tab would be).
    const setTimer = (p, ik, s) => p.evaluate(async ([ik, s]) => {
      const w = window.__board21.state.wins.get(ik);
      await w.iframe.contentWindow.Board21.save(s);
      w.post('data', { data: s, reason: 'remote' });
    }, [ik, s]);
    const run = ms => ({ duration: 300000, remaining: 300000, endsAt: Date.now() + ms });   // a 5-minute Timer with ms left
    // The Traffic Light as it looks: the lamps lit, the lamps pressed (aria-pressed), and the title.
    const lightOf = (p, ik) => p.evaluate(ik => {
      const w = window.__board21.state.wins.get(ik), d = w && w.iframe.contentDocument;
      if (!d || !d.querySelector('.lamp')) return null;
      const pick = sel => Array.from(d.querySelectorAll(sel)).map(b => b.dataset.c).join(',');
      return { on: pick('.lamp.on'), pressed: pick('.lamp[aria-pressed="true"]'), title: document.querySelector(`.win[data-ikey="${ik}"] .win-label .sub`).textContent };
    }, ik);
    const NAME = { red: 'Red', yellow: 'Yellow', green: 'Green' };
    const looks = (l, c) => !!l && l.on === (c || '') && l.pressed === (c || '') && l.title === (c ? NAME[c] : '');
    const shows = (p, ik, c, ms = 3000) => eventually(async () => looks(await lightOf(p, ik), c), ms);
    const still = async (p, ik, c, ms = 700) => { await p.waitForTimeout(ms); return looks(await lightOf(p, ik), c); };
    const said = async (p, ik) => JSON.stringify(await lightOf(p, ik));

    // ---- 1. The Traffic Light turns sideways in a window wider than tall, and keeps its shape.
    await part('Shape', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page); await freeBoard(page);
      const raw = await page.evaluate(() => (self.BOARD21_WIDGETS.find(w => w.id === 'traffic-light') || {}).window || null);
      const reg = await page.evaluate(() => { const a = window.__board21.catalog().find(w => w.id === 'traffic-light'); return a && a.win; });
      ok(!!raw && !('aspectRatio' in raw) && !reg.aspectRatio && reg.minWidth === 90 && reg.minHeight === 90 && reg.width === 170 && reg.height === 380,
        `the registry: no shape lock, at least 90 × 90, and 170 × 380 to start (${JSON.stringify(raw)})`);
      const ik = await addWin(page, 'traffic-light');
      await connected(page, ik);
      const shape = () => F(page, ik, () => {
        const r = e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
        return { W: innerWidth, H: innerHeight, box: r(document.querySelector('.housing')), lamps: Array.from(document.querySelectorAll('.lamp')).map(b => Object.assign(r(b), { c: b.dataset.c })) };
      });
      const judge = s => {
        const [R, Y, G] = s.lamps, cx = l => l.x + l.w / 2, cy = l => l.y + l.h / 2, near = (a, b) => Math.abs(a - b) < 1;
        const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
        return {
          row: near(cy(R), cy(Y)) && near(cy(Y), cy(G)) && R.x + R.w <= Y.x && Y.x + Y.w <= G.x,
          column: near(cx(R), cx(Y)) && near(cx(Y), cx(G)) && R.y + R.h <= Y.y && Y.y + Y.h <= G.y,
          order: s.lamps.map(l => l.c).join(),
          inside: s.lamps.every(l => l.w > 0 && inside(l, s.box)) && inside(s.box, { x: 0, y: 0, w: s.W, h: s.H }),
          thin: Math.min(s.box.w, s.box.h) / Math.max(s.box.w, s.box.h)
        };
      };
      const shaped = t => Math.abs(t - 170 / 380) < 0.01;   // (the light at 170 × 380: a 153 × 342 housing)
      const size = async (w, h) => { await page.evaluate(([ik, w, h]) => window.__board21.setRect(ik, { x: 60, y: 60, w, h: h + 40 }), [ik, w, h]); await page.waitForTimeout(400); return shape(); };
      const px = s => `${Math.round(s.box.w)} × ${Math.round(s.box.h)} in ${s.W} × ${s.H}, lamps ${s.lamps.map(l => Math.round(l.w)).join('/')} px`;
      let s = await size(170, 380), j = judge(s);
      ok(s.W === 170 && s.H === 380 && j.column && j.inside && j.order === 'red,yellow,green', `170 × 380: upright, red on top, every lamp inside the light and the light inside the window (${px(s)})`);
      ok(Math.abs(s.box.w - 153) <= 3 && Math.abs(s.box.h - 342) <= 3 && Math.abs(s.box.x - 8.5) <= 3 && Math.abs(s.box.y - 19) <= 3 && s.lamps.every(l => Math.abs(l.w - 95) <= 3 && Math.abs(l.h - 95) <= 3),
        `and it looks as before: a 153 × 342 light, 95 px lamps, within a few pixels (${px(s)})`);
      s = await size(200, 200); j = judge(s);
      ok(s.W === 200 && s.H === 200 && j.column && j.inside && shaped(j.thin), `200 × 200, a square: upright, and still the same light, not a box (${px(s)}, ${j.thin.toFixed(2)})`);
      await F(page, ik, () => { window.__same = 1; });
      s = await size(380, 170); j = judge(s);
      ok(s.W === 380 && s.H === 170 && j.row && j.inside && j.order === 'red,yellow,green', `380 × 170: sideways, red on the left of yellow on the left of green, all inside (${px(s)})`);
      ok(Math.abs(s.box.w - 342) <= 3 && Math.abs(s.box.h - 153) <= 3 && s.lamps.every(l => Math.abs(l.w - 95) <= 3), `the same light on its side (${px(s)})`);
      ok(await F(page, ik, () => window.__same === 1), 'it turned with no reload');
      const tab = await F(page, ik, () => Array.from(document.querySelectorAll('.lamp')).map(b => b.getAttribute('aria-label')).join());
      ok(tab === 'Red,Yellow,Green', `the order to tab through stays red, yellow, green (${tab})`);
      s = await size(300, 301); j = judge(s);
      ok(j.column && j.inside && await F(page, ik, () => window.__same === 1), `a little taller than wide again: upright, with no reload (${px(s)})`);
      const odd = [];
      for (const [w, h] of [[90, 90], [91, 90], [120, 600], [600, 120], [1000, 170], [170, 780], [400, 401], [401, 400]]) {
        s = await size(w, h); j = judge(s);
        const want = w > h ? j.row : j.column;
        if (s.W !== w || s.H !== h || !want || !j.inside || !shaped(j.thin)) odd.push(`${w} × ${h}: ${px(s)}${want ? '' : ' (turned the wrong way)'}`);
      }
      ok(!odd.length, `at every size, upright when height ≥ width and sideways when wider, the lamps never overlap or spill out, and it's always the same light${odd.length ? ': ' + odd.join('; ') : ''}`);
      // A long window gets the same light, centered, not a long bar.
      s = await size(1000, 170); j = judge(s);
      ok(j.row && Math.abs(s.box.w - 342) <= 3 && Math.abs(s.box.h - 153) <= 3 && Math.abs(s.box.x + s.box.w / 2 - 500) <= 1 && s.lamps.every(l => Math.abs(l.w - 95) <= 3),
        `1000 × 170: the same light as at 380 × 170, centered, not a long bar (${px(s)})`);
      s = await size(170, 700); j = judge(s);
      ok(j.column && Math.abs(s.box.w - 153) <= 3 && Math.abs(s.box.h - 342) <= 3 && Math.abs(s.box.y + s.box.h / 2 - 350) <= 1 && s.lamps.every(l => Math.abs(l.w - 95) <= 3),
        `170 × 700: the same light as at 170 × 380, centered (${px(s)})`);
      // A browser without container query units (iPadOS before 16, Chrome before 105) skips every size given in them.
      await F(page, ik, () => { const st = document.querySelector('style'); window.__css = st.textContent; st.textContent = st.textContent.replace(/[^;{}]*\dcq(?:w|h|i|b|min|max)\b[^;{}]*;?/g, '').replace(/container-type:[^;}]*;?/g, ''); });
      const old = [];
      for (const [w, h] of [[380, 170], [600, 120], [1000, 170], [170, 380], [120, 600], [170, 700], [200, 200]]) {
        s = await size(w, h); j = judge(s);
        if (!(w > h ? j.row : j.column) || !j.inside || !shaped(j.thin)) old.push(`${w} × ${h}: ${px(s)}`);
      }
      await F(page, ik, () => { document.querySelector('style').textContent = window.__css; });
      ok(!old.length, `in a browser without container query units, the lamps stay inside the light too${old.length ? ': ' + old.join('; ') : ''}`);
      await size(170, 380);
      await page.evaluate(ik => window.__board21.setMaximized(ik, true), ik); await page.waitForTimeout(600);
      s = await shape(); j = judge(s);
      ok(s.W > s.H && j.row && j.inside, `Fill the board on a wide board: sideways (${px(s)})`);
      await page.evaluate(ik => window.__board21.setMaximized(ik, false), ik); await page.waitForTimeout(400);
      s = await shape(); j = judge(s);
      ok(s.W === 170 && s.H === 380 && j.column, `back to its window: upright again (${px(s)})`);
      await ctx.close();
    });

    // ---- 2. The Timer turns amber near the end.
    await part('Timer warning', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page); await freeBoard(page);
      const ik = await addWin(page, 'timer');
      await connected(page, ik);
      await page.evaluate(ik => window.__board21.setRect(ik, { x: 60, y: 60, w: 420, h: 320 }), ik);
      await page.waitForTimeout(300);
      const look = () => F(page, ik, () => {
        const probe = document.createElement('i'); probe.style.color = 'var(--b21-warning)'; document.body.appendChild(probe);
        const amber = getComputedStyle(probe).color; probe.remove();
        return { amber, bar: getComputedStyle(document.getElementById('bar')).backgroundColor, digits: getComputedStyle(document.getElementById('display')).color,
          done: document.body.classList.contains('done'), bg: getComputedStyle(document.body).backgroundColor, text: document.getElementById('display').textContent };
      });
      const amber = async () => { await page.waitForTimeout(600); const l = await look(); return { yes: l.bar === l.amber && l.digits === l.amber, no: l.bar !== l.amber && l.digits !== l.amber, l }; };
      const remote = d => page.evaluate(([ik, d]) => window.__board21.state.wins.get(ik).post('data', { data: d, reason: 'remote' }), [ik, d]);
      const bg0 = (await look()).bg;
      const items = await page.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.filter(i => /^warn:/.test(i.id)).map(i => i.id).join(), ik);
      const menu = await menuOf(page, ik);
      ok(menu === '✓ Beep | Chime | Bell | Marimba | Gentle | Alarm | No sound | — | Play sound | — | [Warning] | Off | ✓ 1 minute | 2 minutes | 5 minutes' && items === 'warn:0,warn:1,warn:2,warn:5',
        `the menu: after Play sound, a line, then Warning with Off, 1 minute, 2 minutes, and 5 minutes; 1 minute is checked (${menu}; ${items})`);
      ok(await choose(page, ik, 'warn:2') && ((await confOf(page, ik)) || {}).warn === 2 && / ✓ 2 minutes /.test(await menuOf(page, ik) + ' '), `2 minutes is saved with the Timer and checked (${JSON.stringify(await confOf(page, ik))})`);
      // A config saved before this release has no warn: 1 minute.
      await page.evaluate(ik => window.__board21.state.wins.get(ik).post('config', { config: { sound: false } }), ik); await page.waitForTimeout(300);
      let m = await menuOf(page, ik);
      ok(/✓ No sound/.test(m) && /✓ 1 minute/.test(m) && !/✓ 2 minutes/.test(m), `an older Timer’s { sound: false } reads as 1 minute, still silent (${m})`);
      await page.evaluate(ik => window.__board21.state.wins.get(ik).post('config', { config: { sound: 'chime' } }), ik); await page.waitForTimeout(300);
      m = await menuOf(page, ik);
      ok(/✓ Chime/.test(m) && /✓ 1 minute/.test(m), `and { sound: 'chime' } as 1 minute too (${m})`);
      await page.evaluate(ik => window.__board21.state.wins.get(ik).post('config', { config: { sound: 'chime', warn: 7 } }), ik); await page.waitForTimeout(300);
      ok(/✓ 1 minute/.test(await menuOf(page, ik)), 'a warning it doesn’t offer reads as 1 minute');
      await choose(page, ik, 'warn:5');
      await choose(page, ik, 'sound:bell');
      let c = await confOf(page, ik);
      ok(!!c && c.sound === 'bell' && c.warn === 5, `picking a sound keeps the warning (${JSON.stringify(c)})`);
      await choose(page, ik, 'warn:1');
      c = await confOf(page, ik);
      ok(!!c && c.sound === 'bell' && c.warn === 1, `and picking a warning keeps the sound (${JSON.stringify(c)})`);
      // The look and the title.
      await remote(run(30000));
      let a = await amber();
      ok(a.yes && await subOf(page, ik) === 'Almost done', `30 seconds left of 5 minutes: the bar and the digits are amber, and the title says Almost done (${JSON.stringify(a.l)}, ${await subOf(page, ik)})`);
      ok(!a.l.done && a.l.bg === bg0, `the rest of the window stays as it is (${a.l.bg})`);
      await page.locator('.win[data-ikey="timer:1"] .win-label').click(); await page.waitForTimeout(200);
      await page.screenshot({ path: OUT + 'timer-warning-menu.png' });
      await page.keyboard.press('Escape');
      await remote(run(90000));
      a = await amber();
      ok(a.no && await subOf(page, ik) === 'Running', `90 seconds left: not amber, Running (${JSON.stringify(a.l)})`);
      await remote(run(30000)); await amber();
      await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('#plus').click();
      a = await amber();
      ok(a.no && await subOf(page, ik) === 'Running', `+1:00 takes it back above the warning: not amber (${a.l.text})`);
      await choose(page, ik, 'warn:0');
      await remote(run(30000));
      a = await amber();
      ok(a.no && await subOf(page, ik) === 'Running' && ((await confOf(page, ik)) || {}).warn === 0, `Off: 30 seconds left, never amber (${JSON.stringify(a.l)})`);
      await choose(page, ik, 'warn:1');
      await remote({ duration: 60000, remaining: 60000, endsAt: Date.now() + 30000 });
      a = await amber();
      ok(a.no && await subOf(page, ik) === 'Running', `a 1-minute Timer with a 1-minute warning never warns (${JSON.stringify(a.l)})`);
      await remote({ duration: 300000, remaining: 30000, endsAt: null });
      a = await amber();
      ok(a.yes && await subOf(page, ik) === 'Almost done', `paused with 30 seconds left: amber, and Almost done (${JSON.stringify(a.l)}, ${await subOf(page, ik)})`);
      await remote({ duration: 300000, remaining: 0, endsAt: null });
      await page.waitForTimeout(300);
      await F(page, ik, () => document.getAnimations().forEach(x => x.finish()));
      let l = await look();
      ok(l.done && l.bg === 'rgb(220, 38, 38)' && l.digits !== l.amber && await subOf(page, ik) === 'Done!', `done: red and Done!, not amber (${JSON.stringify(l)})`);
      // The warning saves nothing.
      await setTimer(page, ik, run(30000));
      await page.waitForTimeout(600);
      const before = await recsOf(page, ik);
      await page.waitForTimeout(1500);
      a = await amber();
      ok(a.yes && await recsOf(page, ik) === before, `nothing is saved for the warning (${before})`);
      // It keeps its warning when it loads again, and when another tab changes it. Picking a sound after either keeps it.
      await choose(page, ik, 'warn:0');
      await page.evaluate(ik => window.__board21.state.wins.get(ik).reload(), ik); await page.waitForTimeout(300);
      await connected(page, ik); await page.waitForTimeout(500);
      m = await menuOf(page, ik);
      ok(/✓ Off/.test(m) && !/✓ 1 minute/.test(m), `loaded again: Off is still chosen (${m})`);
      await remote(run(30000));
      a = await amber();
      ok(a.no && await subOf(page, ik) === 'Running', `and with 30 seconds left it isn’t amber (${JSON.stringify(a.l)})`);
      await choose(page, ik, 'sound:chime');
      c = await confOf(page, ik);
      ok(!!c && c.sound === 'chime' && c.warn === 0, `picking a sound then keeps Off (${JSON.stringify(c)})`);
      await page.evaluate(ik => window.__board21.state.wins.get(ik).post('config', { config: { sound: 'bell', warn: 2 }, reason: 'remote' }), ik); await page.waitForTimeout(300);
      m = await menuOf(page, ik);
      ok(/✓ Bell/.test(m) && /✓ 2 minutes/.test(m), `2 minutes chosen in another tab shows here (${m})`);
      await choose(page, ik, 'sound:marimba');
      c = await confOf(page, ik);
      ok(!!c && c.sound === 'marimba' && c.warn === 2, `and picking a sound then keeps it (${JSON.stringify(c)})`);
      await ctx.close();
    });

    // ---- 3. Follow timers.
    await part('Follow timers', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page); await freeBoard(page);
      await page.evaluate(() => window.__board21.history.cfg({ quiet: 36e5, every: 36e5, skipOpen: true }));
      const L = await addWin(page, 'traffic-light'), T1 = await addWin(page, 'timer');
      await connected(page, L); await connected(page, T1);
      await page.evaluate(([L, T1]) => { const b = window.__board21; b.setRect(L, { x: 40, y: 40, w: 380, h: 210 }); b.setRect(T1, { x: 460, y: 40, w: 380, h: 300 }); }, [L, T1]);
      const lamp = (c, p = page) => p.frameLocator(`.win[data-ikey="${L}"] iframe`).locator(`.lamp.${c}`).click();
      const timersIn = (ik, p = page) => F(p, ik, () => JSON.stringify(Board21.context.timers === undefined ? 'none' : Board21.context.timers));
      const menu = await menuOf(page, L);
      ok(menu === 'All off | — | Follow timers' && await confOf(page, L) === null, `the menu: All off, a line, then Follow timers, off; the colors are tapped on the light (${menu})`);
      await lamp('red');
      ok(await shows(page, L, 'red') && JSON.stringify(await dataOf(page, L)) === '{"active":"red"}', 'the teacher taps red');
      await setTimer(page, T1, run(200000));
      ok(await still(page, L, 'red', 900), `Follow timers off: a running Timer changes nothing (${await said(page, L)})`);
      ok(await choose(page, L, 'follow') && JSON.stringify(await confOf(page, L)) === '{"follow":true}' && /✓ Follow timers$/.test(await menuOf(page, L)), `Follow timers is saved with the light as { follow: true } (${JSON.stringify(await confOf(page, L))})`);
      ok(await shows(page, L, 'green'), `on: a Timer running gives green (${await said(page, L)})`);
      await page.screenshot({ path: OUT + 'follow-green.png' });
      await setTimer(page, T1, run(30000));
      ok(await shows(page, L, 'yellow'), `inside its warning, yellow (${await said(page, L)})`);
      await page.frameLocator(`.win[data-ikey="${T1}"] iframe`).locator('#reset').click();
      ok(await shows(page, L, 'red'), `reset, the Timer is idle and ignored: the teacher’s red (${await said(page, L)})`);
      await setTimer(page, T1, run(200000));
      ok(await shows(page, L, 'green'), 'started again, green');
      await page.evaluate(ik => window.__board21.closeWin(ik, { quiet: true }), T1);
      ok(await shows(page, L, 'red'), `its window closed: the teacher’s red (${await said(page, L)})`);
      await page.evaluate(() => window.__board21.openWidget('timer')); await connected(page, T1);
      ok(await shows(page, L, 'green'), `opened again, still running: green (${await said(page, L)})`);
      // A choice while following shows at once, until the followed color next changes.
      ok(await choose(page, L, 'off') && await shows(page, L, null, 1500) && JSON.stringify(await dataOf(page, L)) === '{"active":null}', `All off in the menu while following: all off at once, and saved (${await said(page, L)})`);
      await setTimer(page, T1, run(62500));
      ok(await still(page, L, null, 700), `the same timer, still green: the teacher’s choice stays (${await said(page, L)})`);
      ok(await shows(page, L, 'yellow', 4000), `its warning: following takes over, yellow (${await said(page, L)})`);
      await lamp('green');
      ok(await shows(page, L, 'green', 600) && JSON.stringify(await dataOf(page, L)) === '{"active":"green"}', 'a tap on green while following: green at once, and saved');
      // It ends: red, about when the Timer itself turns red.
      const ends = Date.now() + 1500;
      await setTimer(page, T1, { duration: 300000, remaining: 300000, endsAt: ends });
      const when = await page.evaluate(async ([L, T1]) => {
        const doc = ik => window.__board21.state.wins.get(ik).iframe.contentDocument;
        const out = { light: 0, timer: 0 }, t0 = Date.now();
        while (Date.now() - t0 < 5000 && !(out.light && out.timer)) {
          if (!out.light && doc(L).querySelector('.lamp.red.on')) out.light = Date.now();
          if (!out.timer && doc(T1).body.classList.contains('done')) out.timer = Date.now();
          await new Promise(r => setTimeout(r, 20));
        }
        return out;
      }, [L, T1]);
      ok(when.light && when.timer && Math.abs(when.light - when.timer) <= 300 && when.light >= ends - 50, `ended: red within 250 ms or so of the Timer’s own red (light ${when.light - ends} ms, Timer ${when.timer - ends} ms after the end)`);
      ok(await shows(page, L, 'red'), `and red stays (${await said(page, L)})`);
      await page.screenshot({ path: OUT + 'follow-red.png' });
      // Two Timers.
      const T2 = await addWin(page, 'timer'); await connected(page, T2);
      await page.evaluate(ik => window.__board21.setRect(ik, { x: 880, y: 40, w: 380, h: 300 }), T2);
      await setTimer(page, T2, run(200000));
      ok(await still(page, L, 'red', 900), `an ended Timer beside a running one: red (${await said(page, L)})`);
      await setTimer(page, T1, run(200000)); await setTimer(page, T2, run(30000));
      ok(await shows(page, L, 'yellow'), `two running: it follows the one with less time left, the second (${await said(page, L)})`);
      await setTimer(page, T1, run(30000)); await setTimer(page, T2, run(200000));
      ok(await shows(page, L, 'yellow'), `and the first, the other way round (${await said(page, L)})`);
      await setTimer(page, T1, run(100000)); await setTimer(page, T2, run(200000));
      ok(await shows(page, L, 'green'), 'both before their warnings: green');
      await setTimer(page, T1, { duration: 300000, remaining: 30000, endsAt: null });
      ok(await shows(page, L, 'yellow'), 'one paused inside its warning, with less left: yellow');
      ok(await still(page, L, 'yellow', 2000), `a paused Timer holds its color (${await said(page, L)})`);
      const tl = JSON.parse(await timersIn(L));
      ok(Array.isArray(tl) && tl.length === 2 && tl[0].id === 'timer:1' && tl[0].endsAt === null && tl[0].remaining === 30000 && tl[0].warnMs === 60000 && tl[1].id === 'timer:2' && typeof tl[1].endsAt === 'number' && tl[1].remaining === null && tl[1].warnMs === 60000,
        `the light has the board’s list: { id, endsAt, remaining, warnMs } for each (${JSON.stringify(tl)})`);
      // The board reads each Timer's warning as the Timer does: its menu choice, 1 minute for anything else, and none
      // for a Timer no longer than its warning.
      const warnIn = async id => (JSON.parse(await timersIn(L)).find(t => t.id === id) || {}).warnMs;
      const warns = [];
      await choose(page, T1, 'warn:2'); warns.push(await eventually(async () => await warnIn('timer:1') === 120000, 2000));
      await choose(page, T1, 'warn:0'); warns.push(await eventually(async () => await warnIn('timer:1') === 0, 2000));
      await F(page, T1, () => Board21.saveConfig({ sound: 'beep', warn: 7 })); warns.push(await eventually(async () => await warnIn('timer:1') === 60000, 2000));
      await choose(page, T1, 'warn:1');
      await setTimer(page, T2, { duration: 60000, remaining: 60000, endsAt: Date.now() + 30000 }); warns.push(await eventually(async () => await warnIn('timer:2') === 0, 2000));
      ok(warns.every(Boolean), `the list’s warnMs follows each Timer’s warning: 2 minutes, Off, an unknown one as 1 minute, and none for a 1-minute Timer (${warns.join(', ')})`);
      // Following writes nothing: through green, yellow, and red, the light's records don't change.
      await page.evaluate(ik => window.__board21.closeWin(ik, { quiet: true }), T2);
      // A Timer from a crafted file: the board reads it as the Timer does, so the light agrees with the Timer's amber.
      const crafted = [];
      for (const [what, d] of [
        ['a time left that isn’t a number', { duration: 300000, remaining: 'x', endsAt: Date.now() + 30000 }],
        ['an end more than a day away', { duration: 300000, remaining: 30000, endsAt: Date.now() + 2 * 864e5 }],
        ['an end that isn’t a number', { duration: 300000, remaining: 30000, endsAt: 'soon' }],
        ['a length that isn’t a number', { duration: 'x', remaining: 30000, endsAt: null }]
      ]) {
        await setTimer(page, T1, d);
        const agree = await eventually(async () => await F(page, T1, () => document.body.classList.contains('warn')) && looks(await lightOf(page, L), 'yellow'), 2000);
        if (!agree) crafted.push(`${what}: Timer ${await subOf(page, T1)}, light ${await said(page, L)}, list ${await timersIn(L)}`);
      }
      ok(!crafted.length, `a Timer from a crafted file, in its warning: amber, and the light yellow${crafted.length ? ': ' + crafted.join('; ') : ''}`);
      await setTimer(page, T1, run(200000));
      ok(await shows(page, L, 'green'), 'green');
      const recs0 = await recsOf(page, L);
      await setTimer(page, T1, run(61200));
      const sawYellow = await shows(page, L, 'yellow', 3000);
      await setTimer(page, T1, run(800));
      const sawRed = await shows(page, L, 'red', 3000);
      await page.waitForTimeout(600);
      ok(sawYellow && sawRed && await recsOf(page, L) === recs0 && JSON.stringify(await dataOf(page, L)) === '{"active":"green"}', `through green, yellow, and red, the light’s stored records never change: only the teacher’s green (${recs0})`);
      // Board history keeps the teacher's color.
      const hid = await page.evaluate(() => window.__board21.history.save('Follow timers'));
      const line = hid && await page.evaluate(async id => { const h = window.__board21.history, exp = (await h.get(id)).body.exp, w = h.winsOf(exp)['traffic-light:1']; return w && w[5]; }, hid);
      ok(line === 'Green' && await shows(page, L, 'red', 500), `the Board history line says the teacher’s Green while the light shows red (${line})`);
      // Two tabs on one board: both follow, and neither writes.
      await setTimer(page, T1, run(200000));
      const B = await ctx.newPage(); B.on('pageerror', e => errors.push('B: ' + e.message));
      await B.goto(BASE); await boardUp(B); await connected(B, L);
      ok(await shows(page, L, 'green') && await shows(B, L, 'green'), 'two tabs: both green');
      // A tap while following shows in the other tab too, until the next phase.
      await lamp('red');
      ok(await shows(page, L, 'red', 1500) && await shows(B, L, 'red', 2000) && await still(B, L, 'red', 1000), `a tap on red in one tab shows red in the other too (${await said(page, L)} | ${await said(B, L)})`);
      const recs1 = await recsOf(page, L);
      await setTimer(page, T1, run(61200));
      ok(await shows(page, L, 'yellow', 3500) && await shows(B, L, 'yellow', 3500), `both turn yellow at its warning (${await said(page, L)} | ${await said(B, L)})`);
      await page.waitForTimeout(500);
      ok(await recsOf(page, L) === recs1 && await recsOf(B, L) === recs1, 'and neither writes the light’s content');
      await lamp('green', B);
      ok(await shows(B, L, 'green', 1500) && await shows(page, L, 'green', 2000) && await still(page, L, 'green', 1000), `a tap on green in the other tab shows in both (${await said(page, L)} | ${await said(B, L)})`);
      await B.close();
      // A Timer on another page is ignored.
      await page.frameLocator(`.win[data-ikey="${T1}"] iframe`).locator('#reset').click();
      ok(await shows(page, L, 'green'), 'its Timer reset: the teacher’s green');
      await page.evaluate(() => window.__board21.pages.create({ end: true, name: 'Two' })); await page.waitForTimeout(900);
      const P2 = await addWin(page, 'timer'); await connected(page, P2);
      await setTimer(page, P2, run(30000)); await page.waitForTimeout(400);
      await page.evaluate(() => window.__board21.pages.go(1)); await page.waitForTimeout(900);
      await connected(page, L);
      ok(await still(page, L, 'green', 900) && await timersIn(L) === '[]', `a Timer on another page is ignored (${await said(page, L)}, ${await timersIn(L)})`);
      // Who gets the list: the Traffic Light and the Clock. Nothing else.
      await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      const NP = await addWin(page, 'name-picker'), CL = await addWin(page, 'clock'), PG = await addWin(page, 'sdk-playground');
      for (const ik of [NP, CL, PG]) await connected(page, ik);
      for (const ik of [NP, CL, PG]) await F(page, ik, () => { window.__got = []; addEventListener('message', e => { if (e.data && e.data.type === 'timers') window.__got.push(e.data.timers); }); if (Board21.on) Board21.on('timers', t => { window.__heardTimers = t; }); });
      await setTimer(page, T1, run(200000)); await page.waitForTimeout(800);
      const got = {};
      for (const ik of [NP, CL, PG]) got[ik] = await F(page, ik, () => ({ posts: window.__got.length, last: window.__got[window.__got.length - 1] || null, ctx: Board21.context.timers === undefined ? 'none' : Board21.context.timers, heard: window.__heardTimers || null }));
      ok(got[NP].posts === 0 && got[NP].ctx === 'none' && got[PG].posts === 0 && got[PG].ctx === 'none', `a Name Picker and the SDK Playground never get the list (${JSON.stringify([got[NP], got[PG]])})`);
      ok(got[CL].posts === 1 && Array.isArray(got[CL].ctx) && got[CL].last && got[CL].last.length === 1 && got[CL].last[0].id === 'timer:1' && Array.isArray(got[CL].heard) && got[CL].heard[0].id === 'timer:1',
        `a Clock window gets it, as 'timers' and in its context (${JSON.stringify(got[CL])})`);
      await ctx.close();
    });

    // ---- 4. 21Timer: the board reads its one message, from its own window only.
    await part('21Timer', async () => {
      const APPS = { '21timer': 'https://timerapp.ccsd21.org/', '21sketch': 'https://sketchapp.ccsd21.org/' };
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const stray = [];
      await ctx.route(/^https?:\/\/([^/]*\.)?(ccsd21\.org|evil\.example)(:\d+)?\//, route => {
        const u = new URL(route.request().url()), id = Object.keys(APPS).find(k => APPS[k] === u.origin + '/');
        if (id && u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><title>${id} stand-in</title></head><body>${id} stand-in<script>window.__heard = 0; addEventListener('message', () => { window.__heard++; }); parent.postMessage({ b21: 1, type: 'hello' }, '*');</script></body></html>` });
        if (u.hostname === 'evil.example' && u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><script>top.postMessage({ type: "21timer:status", version: 1, state: "running", endsAt: Date.now() + 200000, remaining: null, warnMs: 60000 }, "*"); window.__sent = true;</script>' });
        if (u.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
        stray.push(u.href); return route.abort();
      });
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page); await freeBoard(page);
      const L = await addWin(page, 'traffic-light'); await connected(page, L);
      await page.evaluate(() => { window.__board21.openWidget('21timer'); window.__board21.openWidget('21sketch'); });
      await page.evaluate(L => { const b = window.__board21; b.setRect(L, { x: 40, y: 40, w: 380, h: 210 }); b.setRect('21timer:1', { x: 460, y: 40, w: 420, h: 330 }); b.setRect('21sketch:1', { x: 900, y: 40, w: 600, h: 440 }); }, L);
      const frameOf = id => page.frames().find(f => f.url() === APPS[id]);
      ok(await eventually(async () => !!frameOf('21timer') && !!frameOf('21sketch') && await frameOf('21timer').evaluate(() => typeof window.__heard === 'number')), '(the stand-ins are up)');
      await choose(page, L, 'follow');
      const timersIn = () => F(page, L, () => JSON.stringify(Board21.context.timers));
      const status = s => Object.assign({ type: '21timer:status', version: 1, state: 'running', endsAt: null, remaining: null, warnMs: 60000 }, s);
      const send = (id, m) => frameOf(id).evaluate(m => parent.postMessage(m, '*'), m);
      const ignored = async (what) => ok(await still(page, L, null, 500) && await timersIn() === '[]', `${what} is ignored (${await said(page, L)}, ${await timersIn()})`);
      ok(await shows(page, L, null) && await timersIn() === '[]', 'Follow timers on, nothing to follow yet: all off');
      await send('21sketch', status({ endsAt: Date.now() + 200000 }));
      await ignored('21Timer’s message from 21Sketch’s window');
      await send('21timer', Object.assign({ b21: 1 }, status({ endsAt: Date.now() + 200000 })));
      await ignored('the same message inside a b21 envelope');
      for (const [what, m] of [
        ['an end more than a day away', status({ endsAt: Date.now() + 2 * 864e5 })],
        ['an end that isn’t a number', status({ endsAt: String(Date.now() + 200000) })],
        ['running with no end', status({ endsAt: null })],
        ['paused with less than nothing left', status({ state: 'paused', remaining: -1 })],
        ['paused with more than a day left', status({ state: 'paused', remaining: 9e7 })],
        ['paused with endless time left', status({ state: 'paused', remaining: Infinity })],
        ['a warning that isn’t a number', status({ endsAt: Date.now() + 200000, warnMs: NaN })],
        ['a warning below zero', status({ endsAt: Date.now() + 200000, warnMs: -5 })],
        ['version 2', status({ endsAt: Date.now() + 200000, version: 2 })],
        ['a state it doesn’t know', status({ state: 'ringing', endsAt: Date.now() + 200000 })]
      ]) { await send('21timer', m); await ignored(`21Timer’s message with ${what}`); }
      // From another site: a page from evil.example inside 21Timer's window, and one posing as 21Timer's own window.
      await frameOf('21timer').evaluate(() => { const f = document.createElement('iframe'); f.src = 'https://evil.example/'; document.body.appendChild(f); });
      ok(await eventually(async () => { const f = page.frames().find(f => /evil\.example/.test(f.url())); return !!f && await f.evaluate(() => window.__sent === true); }, 5000), '(the page from evil.example sent it)');
      await ignored('the message from a page on evil.example');
      const fake = (origin, m) => page.evaluate(([origin, m]) => { const f = document.querySelector('.win[data-ikey="21timer:1"] iframe'); window.dispatchEvent(new MessageEvent('message', { data: m, origin, source: f.contentWindow })); }, [origin, m]);
      await fake('https://evil.example', status({ endsAt: Date.now() + 200000 }));
      await ignored('a message from 21Timer’s window with evil.example’s origin');
      // From 21Timer's window: followed.
      const end = Date.now() + 200000;
      await send('21timer', status({ endsAt: end }));
      ok(await shows(page, L, 'green') && await timersIn() === JSON.stringify([{ id: '21timer:1', endsAt: end, remaining: null, warnMs: 60000 }]), `21Timer running: the light follows it, green (${await timersIn()})`);
      await send('21timer', status({ endsAt: Date.now() + 2 * 864e5 }));
      ok(await still(page, L, 'green', 500) && JSON.parse(await timersIn())[0].endsAt === end, 'a bad message after it changes nothing');
      await send('21timer', status({ endsAt: Date.now() + 30000 }));
      ok(await shows(page, L, 'yellow'), 'in its warning: yellow');
      await send('21timer', status({ state: 'paused', remaining: 120000 }));
      ok(await shows(page, L, 'green') && JSON.parse(await timersIn())[0].remaining === 120000, 'paused with 2 minutes left: green');
      await fake('https://timerapp.ccsd21.org', status({ state: 'done', remaining: 0 }));
      ok(await shows(page, L, 'red') && JSON.stringify(JSON.parse(await timersIn())[0]) === JSON.stringify({ id: '21timer:1', endsAt: null, remaining: 0, warnMs: 60000 }), `done: red (${await timersIn()})`);
      await send('21timer', status({ state: 'idle' }));
      ok(await shows(page, L, null) && await timersIn() === '[]', 'idle: nothing to follow, all off');
      await send('21timer', status({ endsAt: Date.now() + 200000 }));
      ok(await shows(page, L, 'green'), 'running again: green');
      ok(await frameOf('21timer').evaluate(() => window.__heard) === 0, 'the board sent 21Timer nothing meanwhile');
      await page.evaluate(() => window.__board21.closeWin('21timer:1', { quiet: true }));
      ok(await shows(page, L, null) && await timersIn() === '[]', `closing its window drops it (${await timersIn()})`);
      await page.evaluate(() => window.__board21.openWidget('21timer'));
      ok(await eventually(async () => !!frameOf('21timer') && await frameOf('21timer').evaluate(() => typeof window.__heard === 'number')) && await still(page, L, null, 500) && await timersIn() === '[]', 'opened again, it starts with nothing until 21Timer says');
      const recs = await page.evaluate(async () => (await window.__board21.store.getAll()).map(r => r.key));
      ok(!recs.some(k => /^(data|conf):.*:21timer:/.test(k)), 'there are no data: or conf: records for 21Timer');
      ok(await frameOf('21timer').evaluate(() => window.__heard) === 0 && await page.evaluate(() => !window.__board21.state.wins.get('21timer:1').connected), 'the board still sends 21Timer nothing');
      ok(!stray.length, 'nothing went anywhere else: ' + stray.join(' '));
      await ctx.close();
    });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Stopwatch', async (browser) => {
    const errors = [];
    // Each part runs on its own: one that stops early is reported, and the next still runs.
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const F = (p, ik, fn, arg) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`).locator('html').evaluate(fn, arg);
    const connected = (p, ik) => eventually(() => p.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
    // A board with a Stopwatch: Fill at 100% (window px are screen px), or the 16:9 board on a 1366 × 768 Chromebook
    // at its default size (zoom 0.57).
    const board = async (opts = {}, chromebook = false) => {
      const ctx = await browser.newContext(Object.assign({ viewport: chromebook ? { width: 1366, height: 768 } : { width: 1200, height: 800 } }, opts));
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page);
      if (!chromebook) await freeBoard(page);
      const ik = await addWin(page, 'stopwatch');
      ok(await connected(page, ik), '(the Stopwatch opens)');
      await page.waitForTimeout(300);
      return { ctx, p: page, ik };
    };
    const size = async (p, ik, w, h) => { await p.evaluate(([ik, w, h]) => window.__board21.setRect(ik, { x: 40, y: 40, w, h: h + 40 }), [ik, w, h]); await p.waitForTimeout(600); };
    const inner = (p, ik) => F(p, ik, () => [innerWidth, innerHeight]);
    // What the window shows: the buttons on, the main button's word, the time as a screen reader hears it, the line
    // under the time, the record line, the list's rows as a screen reader hears them, and the title.
    const look = async (p, ik) => Object.assign(await F(p, ik, () => {
      const $ = id => document.getElementById(id), shown = e => e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
      const words = el => [...el.children].filter(e => e.tagName !== 'svg' && getComputedStyle(e).display !== 'none').map(e => e.textContent).filter(Boolean).join(' ');
      return { on: ['lap', 'reset', 'undo', 'start', 'stop'].filter(id => $(id).classList.contains('on')).join(','), main: $('startLbl').textContent, time: $('timeText').textContent,
        phase: $('face').dataset.phase, mode: $('face').dataset.mode, veiled: $('face').classList.contains('veiled'),
        note: shown($('note')) ? words($('note')) : '', rec: shown($('rec')) ? words($('rec')) : '',
        rows: [...document.querySelectorAll('#lrows .lrow[aria-label]')].map(r => r.getAttribute('aria-label')) };
    }), { title: await p.locator(`.win[data-ikey="${ik}"] .win-label .sub`).textContent() });
    const saved = (p, ik) => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const confOf = (p, ik) => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    // The menu as the board draws it: a line, a [heading], ✓ for a check, and (greyed) for a row greyed out.
    const menuOf = (p, ik) => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.map(i => i.separator ? '—' : i.heading ? `[${i.label}]` : (i.checked ? '✓ ' : '') + i.label + (i.disabled ? ' (greyed)' : '')).join(' | '), ik);
    const choose = async (p, ik, id) => {
      await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.waitForTimeout(200);
      const it = p.locator(`#menu [data-id="${id}"]`);
      if (!await it.count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); return false; }
      await it.click(); await p.waitForTimeout(450); return true;
    };
    // Content and config as another tab saves them. ago: started that many ms ago.
    const set = (p, ik, d, c) => p.evaluate(async ([ik, d, c]) => {
      const w = window.__board21.state.wins.get(ik);
      if (c) { await w.iframe.contentWindow.Board21.saveConfig(c); w.post('config', { config: c, reason: 'remote' }); }
      if (d) { d = Object.assign({}, d); if (d.ago != null) { d.startedAt = Date.now() - d.ago; delete d.ago; } await w.iframe.contentWindow.Board21.save(d); w.post('data', { data: d, reason: 'remote' }); }
      await new Promise(r => setTimeout(r, 400));
    }, [ik, d, c]);
    const C = o => Object.assign({ hundredths: true, laps: true, list: false, hide: false, record: false, goal: 'short' }, o);
    // A box in the window, on the page (screen px).
    const boxOf = (p, ik, sel) => p.evaluate(([ik, sel]) => {
      const f = window.__board21.state.wins.get(ik).iframe, fr = f.getBoundingClientRect(), e = f.contentDocument.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect(), k = fr.width / f.contentWindow.innerWidth;
      return { x: fr.left + r.left * k, y: fr.top + r.top * k, w: r.width * k, h: r.height * k, cx: fr.left + (r.left + r.width / 2) * k, cy: fr.top + (r.top + r.height / 2) * k };
    }, [ik, sel]);
    const same = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) <= 1);
    const inside = (pt, b) => pt.cx > b.x && pt.cx < b.x + b.w && pt.cy > b.y && pt.cy < b.y + b.h;
    // A finger (the mouse) pressed on a button for hold ms. The window notes when it landed and when it lifted.
    const spy = (p, ik) => F(p, ik, () => { if (window.__spy) return; window.__spy = 1; addEventListener('pointerdown', () => { window.__down = Date.now(); }, true); addEventListener('pointerup', () => { window.__up = Date.now(); }, true); });
    const press = async (p, ik, id, hold = 0) => {
      const b = await boxOf(p, ik, '#' + id);
      await p.mouse.move(b.cx, b.cy); await p.mouse.down(); if (hold) await p.waitForTimeout(hold); await p.mouse.up();
      await p.waitForTimeout(250);
      return F(p, ik, () => ({ down: window.__down, up: window.__up }));
    };
    const tapAt = async (p, pt) => { await p.mouse.click(pt.cx, pt.cy); await p.waitForTimeout(250); };
    const dbl = async (p, ik, id) => { const b = await boxOf(p, ik, '#' + id); await p.mouse.dblclick(b.cx, b.cy); await p.waitForTimeout(700); };
    const settled = async (p, ik, fn) => { let d; await eventually(async () => { d = await saved(p, ik); return !!d && fn(d); }, 3000); return d; };

    // ---- 1. The buttons: the time is taken when the finger lands, and a double tap never does two things.
    await part('Buttons', async () => {
      const { ctx, p, ik } = await board();
      const reg = await p.evaluate(() => { const a = window.__board21.catalog().find(w => w.id === 'stopwatch'); return a && { name: a.name, version: a.version, description: a.description, files: a.files, clash: a.clash, win: a.win, color: a.color, icon: a.icon }; });
      const others = await p.evaluate(() => window.__board21.catalog().filter(w => w.id !== 'stopwatch').map(w => String(w.color || '').toLowerCase()));
      const order = await p.evaluate(() => window.BOARD21_WIDGETS.map(w => w.id));
      ok(!!reg && reg.name === 'Stopwatch' && reg.version === '1.0.0' && reg.description === 'Count up with laps and a class record.' && reg.files.join() === 'widgets/stopwatch/index.html' &&
        reg.clash === 'later' && reg.win.width === 600 && reg.win.height === 380 && reg.win.minWidth === 280 && reg.win.minHeight === 200 && reg.win.dragFromContent !== false &&
        /^<svg viewBox="0 0 24 24">/.test(reg.icon) && !others.includes(reg.color.toLowerCase()) && contrast('rgb(255, 255, 255)', rgbOf(reg.color)) >= 4.5 && order.indexOf('stopwatch') === order.indexOf('timer') + 1,
        `the registry: Stopwatch after the Timer, 600 × 380, at least 280 × 200, clash 'later', a tile color of its own (${JSON.stringify(reg && { win: reg.win, color: reg.color })})`);
      await size(p, ik, 600, 380); await spy(p, ik);
      let L = await look(p, ik);
      ok(L.on === 'start' && L.main === 'Start' && L.time === '0:00.00' && L.title === '', `idle: Start and 0:00.00 (${JSON.stringify(L)})`);
      const start0 = await boxOf(p, ik, '#start');
      let t = await press(p, ik, 'start', 600), d = await settled(p, ik, d => d.startedAt != null);
      ok(d.startedAt >= t.down - 5 && d.startedAt <= t.down + 60 && t.up - t.down >= 550, `Start takes the time when the finger lands, not when it lifts (${d.startedAt - t.down} ms after it landed, lifted ${t.up - t.down} ms later)`);
      L = await look(p, ik);
      const stop0 = await boxOf(p, ik, '#stop');
      ok(L.on === 'lap,stop' && L.title === 'Running' && inside(start0, stop0), `running: Lap and Stop, Start's middle inside Stop, and the title says Running (${L.on}, ${L.title})`);
      const t0 = d.startedAt;
      await p.waitForTimeout(1200);
      t = await press(p, ik, 'lap', 500); d = await settled(p, ik, d => d.laps.length === 1);
      ok(Math.abs(d.laps[0] - (t.down - t0)) <= 60, `Lap takes the time when the finger lands (${d.laps[0] - (t.down - t0)} ms off)`);
      await p.waitForTimeout(400);
      await dbl(p, ik, 'lap'); d = await saved(p, ik);
      ok(d.laps.length === 2, `a double tap on Lap is one lap (${d.laps.length} laps)`);
      await p.waitForTimeout(400);
      t = await press(p, ik, 'stop', 500); d = await settled(p, ik, d => d.startedAt == null);
      L = await look(p, ik);
      ok(Math.abs(d.banked - (t.down - t0)) <= 60 && L.on === 'reset,start' && L.main === 'Resume' && L.title === 'Stopped' && same(await boxOf(p, ik, '#start'), stop0),
        `Stop takes the time when the finger lands, and Resume takes Stop's place (${d.banked - (t.down - t0)} ms off; ${L.on}, ${L.main}, ${L.title})`);
      const banked = d.banked;
      await p.waitForTimeout(600);
      t = await press(p, ik, 'start'); d = await settled(p, ik, d => d.startedAt != null);
      ok(d.banked === banked && d.laps.length === 2 && Math.abs(d.startedAt - t.down) <= 60 && (await look(p, ik)).title === 'Running', `Resume carries on from the stopped time, with its laps (${d.banked} ms banked)`);
      await p.waitForTimeout(600);
      await dbl(p, ik, 'stop'); L = await look(p, ik);
      ok(L.phase === 'stopped' && L.main === 'Resume', `a double tap on Stop stops, and stays stopped (${L.phase})`);
      await p.waitForTimeout(600);
      await dbl(p, ik, 'start'); L = await look(p, ik);
      ok(L.phase === 'running', `a double tap on Resume carries on, and keeps running (${L.phase})`);
      await p.waitForTimeout(600);
      await press(p, ik, 'stop'); d = await settled(p, ik, d => d.startedAt == null);
      const before = { banked: d.banked, laps: d.laps.join() };
      await p.waitForTimeout(800);
      await dbl(p, ik, 'reset'); L = await look(p, ik); d = await saved(p, ik);
      ok(L.phase === 'idle' && L.on === 'undo,start' && L.time === '0:00.00' && d.banked === 0 && !!d.undo && /Undo reset/.test(await menuOf(p, ik)),
        `a double tap on Reset resets once: Undo takes its place, and Undo reset is in the menu (${L.on}, ${await menuOf(p, ik)})`);
      await p.waitForTimeout(800);
      await press(p, ik, 'undo'); d = await settled(p, ik, d => d.banked > 0); L = await look(p, ik);
      ok(d.banked === before.banked && d.laps.join() === before.laps && L.phase === 'stopped' && L.main === 'Resume', `Undo brings back the time and the laps (${d.banked}, ${d.laps.join()})`);
      await p.waitForTimeout(800);
      await press(p, ik, 'reset'); await p.waitForTimeout(800);
      await dbl(p, ik, 'start'); L = await look(p, ik);
      ok(L.phase === 'running' && L.on === 'lap,stop', `a double tap on Start starts, and keeps running (${L.phase})`);

      // ---- 2. A reload, and a second tab, mid-run.
      await p.waitForTimeout(500); await press(p, ik, 'lap'); await p.waitForTimeout(400); await press(p, ik, 'lap');
      d = await settled(p, ik, d => d.laps.length === 2);
      await p.reload(); await boardUp(p); await connected(p, ik); await p.waitForTimeout(500);
      const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push(e.message));
      await p2.goto(BASE); await boardUp(p2); await connected(p2, ik); await p2.waitForTimeout(500);
      const [a, b] = [await look(p, ik), await look(p2, ik)];
      const secs = s => s.split(':').reduce((m, x) => m * 60 + +x, 0), want = (Date.now() - d.startedAt) / 1000;
      ok(a.phase === 'running' && b.phase === 'running' && Math.abs(secs(a.time) - want) <= 1.5 && Math.abs(secs(b.time) - want) <= 1.5 && a.note === b.note && /^Lap 2 /.test(a.note),
        `after a reload and in a second tab, the same run: the same time and laps (${a.time} / ${b.time}, ${a.note} / ${b.note})`);
      await press(p2, ik, 'stop');
      ok(await eventually(async () => (await look(p, ik)).time === (await look(p2, ik)).time && (await look(p, ik)).phase === 'stopped'), `Stop in one tab stops both at the same time (${(await look(p, ik)).time})`);
      await ctx.close();
    });

    // ---- 3. Lap list: its rows, Fastest lap on every tie, the end row after Stop, Remove last lap, and a list that
    // scrolls by touch instead of moving the window.
    await part('Lap list', async () => {
      const { ctx, p, ik } = await board({ hasTouch: true });
      await size(p, ik, 600, 380);
      await set(p, ik, { banked: 92500, laps: [20000, 40000, 65000, 85000] }, C({ list: true }));
      let L = await look(p, ik);
      ok(L.mode === 'list' && L.rows.join(' | ') === 'Lap 1, 0:20.00, total 0:20.00, fastest lap | Lap 2, 0:20.00, total 0:40.00, fastest lap | Lap 3, 0:25.00, total 1:05.00 | Lap 4, 0:20.00, total 1:25.00, fastest lap | Stop, 0:07.50, total 1:32.50',
        `stopped: a row for each lap, Fastest lap on every tie, and the end of the run (${L.rows.join(' | ')})`);
      const end = await F(p, ik, () => { const r = document.querySelector('#lrows .lrow.end'); return r && { n: r.querySelector('.n').textContent, mark: !!r.querySelector('.n .sq'), tag: r.querySelector('.tag').textContent }; });
      const tags = await F(p, ik, () => [...document.querySelectorAll('#lrows .lrow .tag')].map(t => t.textContent).filter(Boolean));
      ok(!!end && end.n === '' && end.mark && end.tag === '' && tags.length === 3 && tags.every(t => t === 'Fastest lap'), `the end row has a stop mark, no number, and is never Fastest lap (${JSON.stringify(end)}, ${tags.join(', ')})`);
      ok(await choose(p, ik, 'unlap'), 'Remove last lap is in the menu');
      L = await look(p, ik);
      ok(L.rows.join(' | ') === 'Lap 1, 0:20.00, total 0:20.00, fastest lap | Lap 2, 0:20.00, total 0:40.00, fastest lap | Lap 3, 0:25.00, total 1:05.00 | Stop, 0:27.50, total 1:32.50' && (await saved(p, ik)).laps.length === 3,
        `Remove last lap removes the newest lap, and the end of the run stays the end (${L.rows.join(' | ')})`);
      // Running, with 12 laps: more rows than show.
      const laps = Array.from({ length: 12 }, (_, i) => (i + 1) * 9000);
      await set(p, ik, { banked: 0, ago: 115000, laps });
      const list = () => F(p, ik, () => { const l = document.getElementById('lrows'); return { top: Math.round(l.scrollTop), max: l.scrollHeight - l.clientHeight }; });
      const rect = () => p.evaluate(ik => JSON.stringify(window.__board21.state.insts.get(ik).rect), ik);
      let s = await list();
      ok(s.max > 0 && s.top === s.max, `running: the list follows the newest row (${JSON.stringify(s)})`);
      const cdp = await ctx.newCDPSession(p), lb = await boxOf(p, ik, '#lrows'), r0 = await rect();
      const finger = async (dy) => {
        const x = lb.cx, y = dy > 0 ? lb.y + 20 : lb.y + lb.h - 20;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / 12, id: 1 }] }); await p.waitForTimeout(16); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(700);
      };
      await finger(110);
      s = await list();
      ok(s.top < s.max - 40 && await rect() === r0, `a finger drawn down the list scrolls it back, and the window stays put (${JSON.stringify(s)})`);
      await press(p, ik, 'lap');
      const s2 = await list();
      ok((await saved(p, ik)).laps.length === 13 && s2.top === s.top, `scrolled away, a new lap leaves the list where the teacher put it (${s.top} → ${s2.top})`);
      await finger(-400);
      await press(p, ik, 'lap');
      s = await list();
      ok((await saved(p, ik)).laps.length === 14 && s.top === s.max && await rect() === r0, `scrolled back to the end, it follows again (${JSON.stringify(s)})`);
      await ctx.close();

      // Fill the board on a 1920 × 1080 board: a class of 30 and the end of the run show at once.
      const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const q = await ctx2.newPage(); q.on('pageerror', e => errors.push(e.message));
      await q.goto(BASE); await boardUp(q); await freeBoard(q);
      const ik2 = await addWin(q, 'stopwatch'); await connected(q, ik2);
      await q.evaluate(ik => window.__board21.setMaximized(ik, true), ik2); await q.waitForTimeout(600);
      await set(q, ik2, { banked: 200000, laps: Array.from({ length: 30 }, (_, i) => 60000 + i * 4500) }, C({ list: true }));
      const fit = await F(q, ik2, () => {
        const box = document.getElementById('llist').getBoundingClientRect(), rows = [...document.querySelectorAll('#lrows .lrow[aria-label]')];
        const scrolls = [document.getElementById('lrows'), document.getElementById('lscroll')].some(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
        return { n: rows.length, all: rows.every(r => { const b = r.getBoundingClientRect(); return b.left >= box.left - 1 && b.right <= box.right + 1 && b.top >= box.top - 1 && b.bottom <= box.bottom + 1; }), scrolls, W: innerWidth, H: innerHeight };
      });
      ok(fit.n === 31 && fit.all && !fit.scrolls, `filling the board, 30 laps and the end of the run all show at once (${JSON.stringify(fit)})`);
      await ctx2.close();
    });

    // ---- 4. A setting changed mid-run leaves Lap and Stop where they were, and a tap at Lap's spot never stops the run.
    await part('Settings mid-run', async () => {
      const { ctx, p, ik } = await board();
      for (const [w, h] of [[600, 380], [280, 200]]) {
        await size(p, ik, w, h);
        for (const id of ['list', 'hide', 'laps', 'record']) {
          await set(p, ik, { banked: 0, ago: 20000, laps: [5000] }, C());
          await p.waitForTimeout(500);
          const lap0 = await boxOf(p, ik, '#lap'), stop0 = await boxOf(p, ik, '#stop'), size0 = await inner(p, ik);
          ok((await look(p, ik)).on === 'lap,stop', `(${w} × ${h}: Lap and Stop show)`);
          const n0 = (await saved(p, ik)).laps.length;
          const moves = [];
          for (const turn of ['on', 'off']) {
            await choose(p, ik, id);
            const grew = (await inner(p, ik)).join() !== size0.join();
            if (!grew && !same(await boxOf(p, ik, '#stop'), stop0)) moves.push(`Stop moved with ${id} ${turn}`);
            const L = await look(p, ik);
            if (!grew && L.on.includes('lap') && !same(await boxOf(p, ik, '#lap'), lap0)) moves.push(`Lap moved with ${id} ${turn}`);
            await tapAt(p, lap0);
            if ((await look(p, ik)).phase !== 'running') moves.push(`a tap at Lap's spot with ${id} ${turn} stopped the run`);
            await p.waitForTimeout(800);
          }
          const d = await saved(p, ik);
          ok(!moves.length && d.startedAt != null, `${w} × ${h}, ${id} on and off mid-run: Lap and Stop stay put, and a tap at Lap's spot never stops the run (${moves.join('; ') || (d.laps.length - n0) + ' laps tapped'})`);
          await set(p, ik, null, C());
        }
      }
      await ctx.close();
      // A tall window: Lap list goes under the buttons, on the row’s own edges, and Lap and Stop stay put.
      const T = await board({ viewport: { width: 1000, height: 1000 } });
      await size(T.p, T.ik, 520, 860);
      await set(T.p, T.ik, { banked: 0, ago: 70000, laps: [20000, 35000, 52000] }, C());
      const row = await boxOf(T.p, T.ik, '#controls'), lapT = await boxOf(T.p, T.ik, '#lap'), stopT = await boxOf(T.p, T.ik, '#stop');
      await choose(T.p, T.ik, 'list');
      const list = await boxOf(T.p, T.ik, '#llist'), win = await boxOf(T.p, T.ik, 'html');
      const under = await F(T.p, T.ik, () => ({ mode: document.getElementById('face').dataset.mode, rows: +getComputedStyle(document.getElementById('llist')).getPropertyValue('--R') }));
      ok(under.mode === 'liststack' && same(await boxOf(T.p, T.ik, '#lap'), lapT) && same(await boxOf(T.p, T.ik, '#stop'), stopT) && list.y >= row.y + row.h &&
        Math.abs(list.x - row.x) <= 1 && Math.abs(list.w - row.w) <= 1 && list.y + list.h <= win.y + win.h && under.rows >= 4,
        `520 × 860: Lap list goes under Lap and Stop, which stay put, on their edges, with room for ${under.rows} rows (${JSON.stringify({ mode: under.mode, row, list, win })})`);
      await T.ctx.close();
    });

    // ---- 5. Lap list grows a small window, and the teacher's size comes back when it's turned off. On a Chromebook,
    // every word in the grown window is at least 14 px on the screen.
    await part('Lap list grows the window', async () => {
      for (const chromebook of [false, true]) {
        const { ctx, p, ik } = await board({}, chromebook);
        const [w, h] = chromebook ? [600, 380] : [280, 200];
        await size(p, ik, w, h);
        const rect0 = await p.evaluate(ik => JSON.stringify(window.__board21.state.insts.get(ik).rect), ik);
        await set(p, ik, { banked: 0, ago: 70000, laps: [20000, 35000, 52000] }, C());
        await choose(p, ik, 'list'); await p.waitForTimeout(500);
        const grown = await inner(p, ik);
        const L = await look(p, ik);
        const px = await F(p, ik, () => {
          const z = Board21.context.window.zoom, fs = sel => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) * z : 0; };
          return { z, rows: fs('#llist'), head: fs('.lhead'), tag: fs('#lrows .lrow.fast .tag'), word: (document.querySelector('#lrows .lrow.fast .tag') || {}).textContent,
            buttons: fs('#controls'), digits: document.querySelector('.slot.dig:not(.off):not(.frac)').getBoundingClientRect().height * z };
        });
        ok(L.mode === 'list' && grown[0] > w && grown[1] > h && await p.evaluate(ik => JSON.stringify(window.__board21.state.insts.get(ik).rect), ik) === rect0,
          `${chromebook ? 'Chromebook' : 'zoom 1'}, ${w} × ${h}: Lap list grows the window until the list fits beside the time, and its saved size stays (${grown.join(' × ')})`);
        if (chromebook) ok(px.rows >= 13.95 && px.head >= 13.95 && px.tag >= 13.95 && px.word === 'Fastest lap' && px.buttons >= 13.95 && px.digits >= 34,
          `there, every word is at least 14 px on the screen, with “Fastest lap”, and the digits 34 px (${JSON.stringify(px)})`);
        await choose(p, ik, 'list'); await p.waitForTimeout(500);
        ok((await inner(p, ik)).join() === [w, h].join(), `Lap list off: the teacher's ${w} × ${h} comes back (${(await inner(p, ik)).join(' × ')})`);
        await ctx.close();
      }
    });

    // ---- 6. Beat the record.
    await part('Beat the record', async () => {
      const { ctx, p, ik } = await board();
      await size(p, ik, 600, 380); await spy(p, ik);
      await choose(p, ik, 'record');
      let L = await look(p, ik);
      ok(L.mode === 'record' && L.rec === 'Next run sets the record', `on, with no record: “${L.rec}”`);
      await press(p, ik, 'start'); L = await look(p, ik);
      ok(L.rec === 'This run sets the record', `a run with no record to race: “${L.rec}”`);
      await p.waitForTimeout(1500); await press(p, ik, 'stop'); L = await look(p, ik);
      let d = await saved(p, ik);
      ok(d.records.short === null && L.title === 'Stopped' && L.main === 'Start', `a run under 5 seconds never sets a record, and the next tap starts a new run (${L.title}, ${L.main})`);
      // A run that started ago ms before, stopped with a tap (once Stop has been there long enough to take one).
      const stopAt = async (ago, race = 'short') => { await set(p, ik, { banked: 0, ago, laps: [], records: d.records, earlier: d.earlier, race }); await p.waitForTimeout(300); await press(p, ik, 'stop'); d = await saved(p, ik); return look(p, ik); };
      L = await stopAt(48550);
      ok(d.records.short === d.banked && d.banked >= 48550 && L.title === 'New record' && L.rec === 'First record', `the first run of 5 seconds or more sets it: “${L.rec}”, and the title says ${L.title}`);
      await set(p, ik, { banked: 0, laps: [], records: { short: 48550, long: null }, earlier: { short: [], long: [] } });
      d = await saved(p, ik);
      L = await stopAt(42100);
      ok(d.records.short === d.banked && L.title === 'New record' && /^New record \d\.\d\d seconds faster$/.test(L.rec) && d.earlier.short.join() === '48550', `a faster run is a new record: “${L.rec}”`);
      const rec = d.records.short;
      await choose(p, ik, 'resume'); d = await saved(p, ik);
      ok(d.startedAt != null && d.records.short === 48550, `Resume carries on, and the record it set goes back (${d.records.short})`);
      await press(p, ik, 'stop'); d = await saved(p, ik);
      await set(p, ik, { banked: 0, laps: [], records: { short: 42100, long: null }, earlier: { short: [48550], long: [] } });
      d = await saved(p, ik);
      L = await stopAt(45200);
      ok(d.records.short === 42100 && L.title === 'Stopped' && /^Record 0:42\.10 \d\.\d\d seconds slower$/.test(L.rec), `a slower run is a miss, and says how close it came: “${L.rec}”`);
      // A run started with it off never sets a record, even after Resume.
      await set(p, ik, null, C());
      await set(p, ik, { banked: 0, ago: 30000, laps: [], records: d.records, earlier: d.earlier, race: null });
      await choose(p, ik, 'record'); L = await look(p, ik);
      ok(L.rec === 'Next run races 0:42.10', `turned on mid-run: “${L.rec}”`);
      await press(p, ik, 'stop'); await p.waitForTimeout(600); await press(p, ik, 'start'); await p.waitForTimeout(600); await press(p, ik, 'stop');
      d = await saved(p, ik); L = await look(p, ik);
      ok(d.records.short === 42100 && d.banked < 42100 && L.title === 'Stopped', `a run started with it off is faster but never a record, even after Resume (${d.banked} ms, record ${d.records.short})`);
      // A run races the best time chosen at Start: switching to Longest and back before Stop still counts.
      await set(p, ik, { banked: 0, ago: 35000, laps: [], records: d.records, earlier: d.earlier, race: 'short' });
      await choose(p, ik, 'goal:long'); await choose(p, ik, 'goal:short');
      await press(p, ik, 'stop'); d = await saved(p, ik);
      ok(d.records.short === d.banked && d.banked < 42100 && d.earlier.short[0] === 42100, `switching the best time and back before Stop still counts (${d.records.short})`);
      // Bring back, and the two ways a real record used to be lost: a stray record then Clear record, and two stray
      // records in a row. Picking Bring back again and again reaches every record there ever was.
      const round = async () => {
        const seen = [];
        for (let i = 0; i < 6; i++) {
          const items = (await menuOf(p, ik)).split(' | ').filter(x => /^Bring back /.test(x));
          if (items.length !== 1 || !await choose(p, ik, 'restore')) return { seen, rows: items.length };
          seen.push((await saved(p, ik)).records.short);
        }
        return { seen, rows: 1 };
      };
      const real = 42100;
      const base = { banked: 0, laps: [], records: { short: real, long: null }, earlier: { short: [48550], long: [] } };
      await set(p, ik, base); d = await saved(p, ik);
      L = await stopAt(6200);
      ok(d.records.short === d.banked && L.title === 'New record', `(a stray run sets a record: ${d.records.short})`);
      await choose(p, ik, 'clear'); d = await saved(p, ik);
      ok(d.records.short === null && (await look(p, ik)).rec === 'Next run sets the record', 'Clear record clears it');
      // (Each record once, then round again.)
      const carousel = r => r.rows === 1 && r.seen.length === 6 && new Set(r.seen.slice(0, 3)).size === 3 && r.seen.slice(3).join() === r.seen.slice(0, 3).join();
      let r = await round();
      ok(carousel(r) && r.seen.includes(real) && r.seen.includes(48550), `a stray record, then Clear record: one Bring back row brings back the real record, then each in turn (${r.seen.join(', ')})`);
      await set(p, ik, base); d = await saved(p, ik);
      await stopAt(6200); await stopAt(5600);
      ok(d.records.short === d.banked && d.banked < 7000, `(two stray records in a row: ${d.records.short})`);
      r = await round();
      ok(r.rows === 1 && new Set(r.seen.slice(0, 4)).size === 4 && r.seen[4] === r.seen[0] && r.seen.includes(real) && r.seen.includes(48550),
        `two stray records: one Bring back row brings back the real record, then each in turn, and loses none (${r.seen.join(', ')})`);
      // A real run that missed a stray record, and beats the record Bring back brings back, is the new record.
      await set(p, ik, { banked: 0, laps: [], records: { short: 48550, long: null }, earlier: { short: [], long: [] } }); d = await saved(p, ik);
      await stopAt(6200); L = await stopAt(45000);
      ok(d.records.short < 7000 && /^Record 0:06\.\d\d /.test(L.rec), `(a real run misses the stray record: “${L.rec}”)`);
      const run = d.banked;
      await choose(p, ik, 'restore'); d = await saved(p, ik);
      ok(d.records.short === run && d.earlier.short[0] === 48550 && (await look(p, ik)).title === 'New record', `Bring back 0:48.55: the run beat it, so the run is the record (${d.records.short}, ${d.earlier.short.join()})`);
      await set(p, ik, { banked: 0, laps: [], records: { short: real, long: null }, earlier: { short: [48550], long: [] } });
      ok(await choose(p, ik, 'restore') && (await saved(p, ik)).records.short === 48550 && /Bring back 0:42\.10/.test(await menuOf(p, ik)) && await choose(p, ik, 'restore') && (await saved(p, ik)).records.short === real,
        'with two records, Bring back is a swap: picking it again swaps them back');
      ok((await confOf(p, ik)).record === true && !('records' in (await confOf(p, ik))), 'records are content, never config');
      await ctx.close();
    });

    // ---- 7. Hide time covers the digits while running and shows them after Stop. Reduced motion runs no animations.
    await part('Hide time', async () => {
      const { ctx, p, ik } = await board();
      await size(p, ik, 600, 380);
      await choose(p, ik, 'hide');
      const tiles = () => F(p, ik, () => {
        const digs = [...document.querySelectorAll('.slot.dig:not(.off)')];
        return { n: digs.length, covered: digs.every(s => getComputedStyle(s, '::after').content !== 'none' && +getComputedStyle(s, '::after').opacity > 0.3 && +getComputedStyle(s.firstChild).opacity === 0),
          hop: document.getAnimations().filter(a => a.animationName === 'hop').length, all: document.getAnimations().length };
      });
      await press(p, ik, 'start'); await p.waitForTimeout(1200);
      let t = await tiles(), L = await look(p, ik);
      ok(L.veiled && t.covered && t.n >= 3 && t.hop === t.n && L.time === 'Time hidden' && L.note === 'Time hidden', `running: a tile covers each digit, and each hops (${JSON.stringify(t)}, ${L.time})`);
      await press(p, ik, 'stop'); await p.waitForTimeout(1500);
      L = await look(p, ik); const d = await saved(p, ik);
      const glyphs = await F(p, ik, () => [...document.querySelectorAll('.slot.dig:not(.off) > i')].every(i => +getComputedStyle(i).opacity === 1));
      ok(!L.veiled && glyphs && /^0:0\d\.\d\d$/.test(L.time) && Math.abs(parseFloat(L.time.slice(2)) * 1000 - d.banked) < 10, `Stop shows the time (${L.time})`);
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await press(p, ik, 'reset'); await p.waitForTimeout(800); await press(p, ik, 'start'); await p.waitForTimeout(1000);
      t = await tiles();
      ok(t.covered && t.all === 0, `with reduced motion the tiles hold still, and nothing animates (${JSON.stringify(t)})`);
      await press(p, ik, 'stop'); await p.waitForTimeout(300);
      ok((await F(p, ik, () => document.getAnimations().length)) === 0 && !(await look(p, ik)).veiled, 'and Stop shows the time without moving');
      await ctx.close();
    });

    // ---- 8. The menu: its rows and order in each mode, and which are greyed out. A greyed row keeps its check.
    await part('Menu', async () => {
      const { ctx, p, ik } = await board();
      // (A heading's id stays in the widget: the SDK sends a heading's label only.)
      const ids = () => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.filter(i => !i.heading).map(i => i.id).join(' '), ik);
      const cases = [
        [{ banked: 0, laps: [] }, C(), '✓ Hundredths | ✓ Laps | Lap list | Hide time | Beat the record', 'hundredths laps list hide record'],
        [{ banked: 0, ago: 9000, laps: [4000] }, C(), 'Remove last lap | — | ✓ Hundredths | ✓ Laps | Lap list | Hide time | Beat the record', 'unlap line:1 hundredths laps list hide record'],
        [{ banked: 0, laps: [], undo: { banked: 9000, laps: [4000], at: Date.now() } }, C({ list: true }), 'Undo reset | — | ✓ Hundredths | ✓ Laps | ✓ Lap list | Hide time | Beat the record', 'undo line:1 hundredths laps list hide record'],
        [{ banked: 9000, laps: [4000] }, C({ laps: false, list: true }), '✓ Hundredths | Laps | ✓ Lap list (greyed) | Hide time | Beat the record', 'hundredths laps list hide record'],
        [{ banked: 9000, laps: [4000] }, C({ hide: true, list: true }), '✓ Hundredths | ✓ Laps (greyed) | ✓ Lap list (greyed) | ✓ Hide time | Beat the record', 'hundredths laps list hide record'],
        [{ banked: 0, laps: [] }, C({ record: true, hide: true }), '✓ Hundredths | ✓ Laps (greyed) | Lap list (greyed) | ✓ Hide time (greyed) | ✓ Beat the record | — | [Best time] | ✓ Shortest | Longest',
          'hundredths laps list hide record line:2 goal:short goal:long'],
        [{ banked: 6000, laps: [], records: { short: 6000, long: null }, earlier: { short: [48550], long: [] }, race: 'short' }, C({ record: true }),
          'Resume | Bring back 0:48.55 | Clear record | — | ✓ Hundredths | ✓ Laps (greyed) | Lap list (greyed) | Hide time (greyed) | ✓ Beat the record | — | [Best time] | ✓ Shortest | Longest',
          'resume restore clear line:1 hundredths laps list hide record line:2 goal:short goal:long'],
        [{ banked: 0, laps: [], records: { short: 48550, long: null } }, C({ record: true, goal: 'long' }),
          '✓ Hundredths | ✓ Laps (greyed) | Lap list (greyed) | Hide time (greyed) | ✓ Beat the record | — | [Best time] | Shortest | ✓ Longest', 'hundredths laps list hide record line:2 goal:short goal:long']
      ];
      const bad = [];
      for (const [d, c, want, wantIds] of cases) {
        await set(p, ik, d, c); await p.waitForTimeout(200);
        const m = await menuOf(p, ik), i = await ids();
        if (m !== want || i !== wantIds) bad.push(`${m} [${i}]`);
      }
      ok(!bad.length, `the menu's rows, ids, and order in each mode, with the greyed rows, each keeping its check${bad.length ? ': ' + bad.join(' // ') : ''}`);
      await set(p, ik, { banked: 0, laps: [] }, C({ hide: true }));
      await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.waitForTimeout(200);
      const row = await p.locator('#menu [data-id="laps"]').evaluate(b => ({ disabled: b.disabled, checked: b.getAttribute('aria-checked'), tick: !!b.querySelector('.check') }));
      await p.keyboard.press('Escape');
      ok(row.disabled && row.checked === 'true' && row.tick, `the board draws a greyed row with its check (${JSON.stringify(row)})`);
      await ctx.close();
    });

    // ---- 9. Every button shows its icon at the smallest window, on a Chromebook (zoom 0.57).
    await part('Icons', async () => {
      const { ctx, p, ik } = await board({}, true);
      await size(p, ik, 280, 200);
      const icons = () => F(p, ik, () => {
        const z = Board21.context.window.zoom, out = [];
        for (const b of document.querySelectorAll('.btn.on')) {
          const r = b.getBoundingClientRect(), i = b.querySelector('.ico').getBoundingClientRect(), w = b.querySelector('.bl').getBoundingClientRect();
          const inB = x => x.left >= r.left - 0.5 && x.right <= r.right + 0.5 && x.top >= r.top - 0.5 && x.bottom <= r.bottom + 0.5;
          out.push({ id: b.id, ok: i.width * z >= 6 && inB(i) && inB(w) && w.width > 0 && i.right <= w.left + 0.5 });
        }
        return { z, out };
      });
      const seen = [], bad = [];
      const check = async () => { const r = await icons(); for (const b of r.out) { seen.push(b.id); if (!b.ok) bad.push(b.id); } return r.z; };
      const z = await check();
      await press(p, ik, 'start'); await p.waitForTimeout(400); await check();
      await press(p, ik, 'stop'); await p.waitForTimeout(800); await check();
      await press(p, ik, 'reset'); await p.waitForTimeout(400); await check();
      ok(z < 0.6 && !bad.length && ['start', 'stop', 'reset', 'undo'].every(id => seen.includes(id)), `280 × 200 at zoom ${z.toFixed(2)}: every button shows its icon beside its word (${[...new Set(seen)].join(', ')}${bad.length ? '; without: ' + bad.join(', ') : ''})`);
      await ctx.close();
    });

    // ---- 10. A crafted file, and the window's line in Board history.
    await part('Crafted file and Board history', async () => {
      const { ctx, p, ik } = await board();
      const evil = '"><img src=x onerror="top.document.title=\'PWNED\'">';
      const crafted = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Races' }, instances: [
        { widgetId: 'stopwatch', instance: 1, open: true, z: 1, rect: { x: 20, y: 20, w: 600, h: 420 },
          config: { hundredths: evil, laps: 'yes', list: 1, hide: evil, record: [true], goal: evil },
          data: { startedAt: evil, banked: -5, laps: [evil, 1e20, -1], records: { short: evil, long: 1e30 }, earlier: { short: [evil, 2], long: evil }, beat: { mode: evil, was: evil }, race: evil, undo: evil } }] };
      fs.writeFileSync(OUT + 'crafted-stopwatch.21board', JSON.stringify(crafted));
      await p.setInputFiles('#import-input', OUT + 'crafted-stopwatch.21board'); await p.waitForTimeout(300);
      await p.click('#modal .btn:has-text("Replace this page")');
      ok(await connected(p, 'stopwatch:1'), '(a crafted file opens)');
      await p.waitForTimeout(800);
      const L = await look(p, 'stopwatch:1'), marks = await F(p, 'stopwatch:1', () => document.querySelectorAll('img, [onerror]').length);
      ok(await p.title() !== 'PWNED' && marks === 0 && L.phase === 'idle' && L.time === '0:00.00' && L.mode === 'note' && await menuOf(p, 'stopwatch:1') === '✓ Hundredths | ✓ Laps | Lap list | Hide time | Beat the record',
        `crafted content and config are dropped: an idle Stopwatch with the usual settings (${L.time}, ${await menuOf(p, 'stopwatch:1')})`);
      // Board history: the time on it and its laps, and a running one comes back stopped at the time it had.
      const H = (fn, a) => p.evaluate(fn, a);
      const lines = await H(() => { const h = window.__board21.history, at = 1795180000000;
        return [h.excerptOf({ banked: 73900, startedAt: null, laps: [24310, 52080] }, 'stopwatch'), h.excerptOf({ banked: 0, startedAt: at - 83470, laps: [24310] }, 'stopwatch', null, new Date(at).toISOString()),
          h.excerptOf({ banked: 73900, laps: [] }, 'stopwatch', { hundredths: false }), h.excerptOf({ banked: 0, laps: [], records: { short: 48550 } }, 'stopwatch'), h.excerptOf({ banked: 'x', laps: 7 }, 'stopwatch')]; });
      ok(lines.join(' | ') === '1:13.90, 2 laps | 1:23.47, 1 lap | 1:13 |  | ', `Board history's line for a Stopwatch: its time and laps (${lines.join(' | ')})`);
      const back = await H(() => window.__board21.history.fix({ instances: [{ widgetId: 'stopwatch', data: { startedAt: 1000, banked: 2000, laps: [500] } }] }, 6000).instances[0].data);
      ok(back.startedAt === null && back.banked === 7000 && back.laps.join() === '500', `going back to a version with it running brings it back stopped at the time it had (${JSON.stringify(back)})`);
      await ctx.close();
    });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ];
};
