// The Timer, the Task Timer, and the Traffic Light.
'use strict';
module.exports = T => {
  const {
    fs, path, OUT, ok, freeBoard, openSettings, addWin, hear, heard, eventually, release, boardUp, BASE
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
      ok(menu === 'Red | Yellow | Green | All off | — | Follow timers' && await confOf(page, L) === null, `the menu: Red, Yellow, Green, All off, a line, then Follow timers, off (${menu})`);
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
  ];
};
