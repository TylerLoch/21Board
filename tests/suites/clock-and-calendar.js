// The Clock, the Calendar, and the clock in the corner.
'use strict';
module.exports = T => {
  const {
    chromium, fs, path, ROOT, OUT, ok, freeBoard, openSettings, setTheme, setCornerClock, setClock, addWin,
    eventually, release, boardUp, BASE
  } = T;
  return [
  ['Calendar and date-only clock', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    ok(await page.evaluate(() => window.__board21.catalog().some(a => a.id === 'calendar')), 'Calendar is in the Widget Picker');
    await page.evaluate(() => { window.__board21.openWidget('calendar'); window.__board21.openWidget('clock'); });
    await page.waitForTimeout(1500);
    const cal = page.frameLocator('.win[data-ikey="calendar:1"] iframe');
    const info = await cal.locator('body').evaluate(() => {
      const t = new Date();
      return {
        title: document.getElementById('title').textContent,
        expect: t.toLocaleDateString(Board21.context.locale, { month: 'long', year: 'numeric' }),
        todays: Array.from(document.querySelectorAll('.day.today')).map(d => d.textContent),
        date: String(t.getDate()), cells: document.querySelectorAll('.day').length,
        firstDow: document.querySelector('.dow').title
      };
    });
    ok(info.title === info.expect && info.cells === 42, `calendar opens on the current month (${info.title})`);
    ok(info.todays.length === 1 && info.todays[0] === info.date, `exactly one day is highlighted, and it is today (${info.todays.join(',')})`);
    ok(info.firstDow === 'Sunday', 'week starts on Sunday by default');
    await cal.locator('#next').click(); await page.waitForTimeout(150);
    ok((await cal.locator('.day.today').count()) === 0 && await cal.locator('#today').isVisible(), 'next month: no today highlight, Today button shown');
    await cal.locator('#today').click(); await page.waitForTimeout(150);
    ok((await cal.locator('.day.today').count()) === 1, 'Today button returns to the current month');
    await page.click('.win[data-ikey="calendar:1"] .win-label'); await page.click('#menu [data-id="mon"]'); await page.waitForTimeout(300);
    ok((await cal.locator('.dow').first().getAttribute('title')) === 'Monday', 'menu switches the week to start on Monday');
    ok(await page.evaluate(() => window.__board21.state.conf.get('calendar:1').weekStart === 1), 'week start is saved as config');

    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.click('#menu [data-id="date"]'); await page.waitForTimeout(600);
    const clock = page.frameLocator('.win[data-ikey="clock:1"] iframe');
    const wd = await clock.locator('#weekday').textContent();
    const expectWd = await clock.locator('body').evaluate(() => new Date().toLocaleDateString(Board21.context.locale, { weekday: 'long' }));
    ok(wd === expectWd && await clock.locator('#dateonly').isVisible() && !(await clock.locator('#analog').isVisible()), `clock "Date only" shows today's date (${wd})`);
    const cd = await page.evaluate(() => Object.assign({}, window.__board21.state.wins.get('clock:1').disp));
    ok(Math.abs(cd.w / (cd.h - 40) - 2.2) < 0.03, 'date-only clock uses a wide shape');
    await page.screenshot({ path: OUT + 'calendar-and-date.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Calendar, Clock and accent review fixes', async (browser) => {
    const errors = [];
    // Saturday: today's highlight must win over the weekend shading.
    let ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    let page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-07T10:00:00'));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('calendar')); await page.waitForTimeout(1200);
    const cal = page.frameLocator('.win[data-ikey="calendar:1"] iframe');
    const sat = await cal.locator('.day.today').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, accent: getComputedStyle(document.documentElement).getPropertyValue('--b21-accent').trim(), current: el.getAttribute('aria-current'), text: el.textContent }));
    ok(sat.text === '7' && sat.bg === 'rgb(37, 99, 235)', `today is clearly highlighted on a Saturday (${sat.bg})`);
    ok(sat.current === 'date' && await cal.locator('[role="row"]').count() === 7, 'calendar grid has rows and marks today for screen readers');
    // Narrow window on another month: the month name isn't cut off.
    await page.evaluate(() => window.__board21.setRect('calendar:1', { x: 40, y: 40, w: 220, h: 300 })); await page.waitForTimeout(300);
    await cal.locator('#next').click(); await page.waitForTimeout(200);
    const title = await cal.locator('#title').evaluate(el => ({ fits: el.scrollWidth <= el.clientWidth + 1, text: el.textContent }));
    ok(title.fits, `month name fits in a narrow window (${title.text})`);
    await ctx.close();

    // Left open overnight at the end of a month: follows today into the new month.
    ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-10-31T23:58:30') });
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('calendar'));
    await page.clock.runFor(2000); await page.waitForTimeout(800); await page.clock.runFor(2000);
    const cal2 = page.frameLocator('.win[data-ikey="calendar:1"] iframe');
    const before = await cal2.locator('#title').textContent();
    await page.clock.runFor(3 * 60 * 1000); await page.waitForTimeout(300);
    const after = await cal2.locator('#title').textContent();
    ok(/October/.test(before) && /November/.test(after) && await cal2.locator('.day.today').count() === 1, `calendar rolls into the new month at midnight (${before} → ${after})`);
    await ctx.close();

    // Long weekday names fit in the Date-only clock.
    ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, locale: 'ru-RU' });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-09-27T10:00:00')); // a Sunday: "воскресенье"
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('clock')); await page.waitForTimeout(1000);
    await page.click('.win[data-ikey="clock:1"] .win-label'); await page.click('#menu [data-id="date"]'); await page.waitForTimeout(800);
    const wd = await page.frameLocator('.win[data-ikey="clock:1"] iframe').locator('#weekday').evaluate(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, left: r.left, right: r.right, vw: innerWidth }; });
    ok(wd.left >= -1 && wd.right <= wd.vw + 1, `long weekday name fits the clock (${wd.text})`);
    await ctx.close();

    // Digital clock with seconds: the whole time shows at 10, 11 and 12 o'clock, whatever the window's size.
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-09T09:05:13'));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('clock'));
    const dig = page.frameLocator('.win[data-ikey="clock:1"] iframe');
    await dig.locator('#analog').waitFor();
    // (Digital alone: Digital, then Analog off. Seconds are off until Show seconds.)
    for (const id of ['digital', 'analog', 'seconds']) { await page.click('.win[data-ikey="clock:1"] .win-label'); await page.click(`#menu [data-id="${id}"]`); await page.waitForTimeout(300); }
    const timeBox = () => dig.locator('#time').evaluate(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, vw: innerWidth, fits: r.width > 0 && r.left >= 0 && r.right <= innerWidth }; });
    const cut = [];
    for (const [iso, text] of [['2026-11-09T10:05:13', '10:05:13AM'], ['2026-11-09T11:38:52', '11:38:52AM'], ['2026-11-09T12:59:59', '12:59:59PM']]) {
      await page.clock.setFixedTime(new Date(iso));
      if (!await eventually(async () => (await timeBox()).text === text, 3000)) cut.push(text + ' is not shown');
      for (const rect of [{ x: 20, y: 20, w: 200, h: 120 }, { x: 20, y: 20, w: 620, h: 300 }, { x: 20, y: 20, w: 420, h: 560 }, null]) {
        const was = (await timeBox()).vw;
        if (rect) await page.evaluate(r => window.__board21.setRect('clock:1', r), rect);
        else await dig.locator('html').evaluate(() => Board21.window.maximize());
        await eventually(async () => (await timeBox()).vw !== was, 2000);
        if (!await eventually(async () => (await timeBox()).fits, 1500)) cut.push(text + (rect ? ` in a ${rect.w}×${rect.h} window` : ' filling the board'));
      }
      await dig.locator('html').evaluate(() => Board21.window.restore());
    }
    ok(cut.length === 0, `the digital clock with seconds fits at 10, 11 and 12 o’clock, small, large and filling the board${cut.length ? ' (cut off: ' + cut.join('; ') + ')' : ''}`);
    await ctx.close();

    // Accent: crafted names are rejected; dark-theme buttons get dark text on the light accent.
    ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    const file = await page.evaluate(async () => { const f = await window.__board21.buildExport('full'); f.accent = 'constructor'; return f; });
    await page.evaluate(f => window.__board21.applyImport(f, 'replace'), file); await page.waitForTimeout(800);
    ok(await page.evaluate(() => window.__board21.state.settings.accent) !== 'constructor', 'an import with a bogus accent name is ignored');
    await page.reload(); await page.waitForTimeout(800);
    ok(await page.locator('.picker-btn.left').isVisible(), 'and the board still loads');
    await setTheme(page, 'dark');
    await page.click('.picker-btn.left'); await page.click('[data-ctl="export"]'); await page.waitForTimeout(300);
    const btnColor = await page.locator('#modal .btn.primary').evaluate(el => getComputedStyle(el).color);
    ok(btnColor === 'rgb(11, 18, 32)', `dark theme: primary buttons use dark text on the light accent (${btnColor})`);
    await page.keyboard.press('Escape');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  // Clock in the corner
  ['Clock in the corner (Auto by default: only in full screen, ⛶ and the window’s own, kiosk; On, Off, the minute, time and date, dark, corners, never in the way, older values, LAB)', async (browser) => {
    const errors = [];
    // The clock as drawn: shown (not hidden or covered), its text without spaces between the time and AM/PM, where it is.
    const cornerClock = page => page.evaluate(() => {
      const c = document.querySelector('.corner-clock');
      if (!c || c.hidden) return { shown: false, on: document.body.classList.contains('clock-on') };
      const r = c.getBoundingClientRect(), cs = getComputedStyle(c), t = c.querySelector('.t');
      return { shown: cs.display !== 'none' && cs.visibility !== 'hidden', on: document.body.classList.contains('clock-on'), text: c.textContent.replace(/\s+(?=[AP]M)/g, '').replace(/\s+/g, ' ').trim(), side: c.classList.contains('right') ? 'right' : 'left',
        r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }, bg: cs.backgroundColor, color: cs.color, pe: cs.pointerEvents,
        fontPx: t ? t.getBoundingClientRect().height : 0 };
    });
    const setClock = async (page, mode) => { await page.keyboard.press('Escape'); await setCornerClock(page, mode); };   // (through Settings, as a teacher would)
    // Settings → Advanced → Clock in the corner: the group it's in, the row before it, its choices and the lines under its name.
    const clockRow = page => page.evaluate(() => {
      const b = document.querySelector('#settings [data-act="clock"]'), r = b && b.closest('.row'), g = r && r.closest('.drawer');
      if (!r) return null;
      const rows = g ? [...g.children].filter(e => e.matches('.row') && e.querySelector('.lbl')).map(e => e.querySelector('.lbl').textContent) : [];
      return { group: g ? g.id : '(none)', before: rows[rows.indexOf('Clock in the corner') - 1] || '(first)', label: r.querySelector('.lbl').textContent, name: r.querySelector('[role="radiogroup"]').getAttribute('aria-label'),
        choices: [...r.querySelectorAll('[data-act="clock"]')].map(x => x.textContent + (x.classList.contains('on') ? ' (chosen)' : '')).join(', '),
        hints: [...r.querySelectorAll('.hint')].map(h => h.textContent).filter(Boolean) };
    });
    const AUTO_HINT = 'Auto: only in full screen.';
    // The Fullscreen API, as ⛶ uses it, and done once its fullscreenchange has come (Chrome can resolve the promise first:
    // here, going full screen again just after leaving it, by about 0.4 s).
    const fsChange = (page, on) => page.evaluate(on => new Promise(res => {
      if (!!document.fullscreenElement === on) return res(true);
      const done = () => res(!!document.fullscreenElement === on);
      document.addEventListener('fullscreenchange', done, { once: true }); setTimeout(done, 3000);
      (on ? document.documentElement.requestFullscreen() : document.exitFullscreen()).catch(e => res(e.name));
    }), on);
    const fsOn = page => fsChange(page, true), fsOff = page => fsChange(page, false);

    // ---- A new device, in a tab: Auto, so no clock. Settings → Advanced → Clock in the corner: On, Off, Auto.
    let ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    let page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-11-12T09:41:00') });
    await page.goto(BASE); await boardUp(page); await page.waitForTimeout(300);
    let c = await cornerClock(page);
    ok(await page.evaluate(() => window.__board21.state.settings.clock) === 'auto' && !c.shown && !c.on && !await page.evaluate(() => !!document.querySelector('.corner-clock:not([hidden])')),
      'Auto by default: in a tab (not full screen) there’s no clock, and toasts have the whole bottom');
    await openSettings(page, ['advanced']);
    let row = await clockRow(page);
    ok(row && row.group === 'grp-advanced' && row.before === 'Widget Picker' && row.label === 'Clock in the corner' && row.choices === 'On, Off, Auto (chosen)',
      `Settings → Advanced → “Clock in the corner”, after Widget Picker: ${row && `${row.group}, after ${row.before}: ${row.choices}`}`);
    ok(row && row.name === 'Clock in the corner', `a screen reader hears which setting its On, Off and Auto belong to (${row && row.name})`);
    ok(row && row.hints.join(' | ') === AUTO_HINT, `under it, what Auto does, and nothing about room while it isn’t meant to show (${row && row.hints.join(' | ')})`);
    await page.keyboard.press('Escape');

    // ---- ⛶ (21Board's own Fullscreen, the Fullscreen API): Auto shows it at once, and hides it on leaving (⛶ again, or
    // Escape, which the browser handles as exitFullscreen()).
    const fsLabel = () => page.evaluate(() => { const b = document.querySelector('#panel [data-ctl="fullscreen"]'); return `${b.title} / ${b.getAttribute('aria-label')}`; });
    const fsLabels = [await fsLabel()];
    await page.click('.picker-btn.left'); await page.click('.panel.open [data-ctl="fullscreen"]'); await page.waitForTimeout(400);
    c = await cornerClock(page);
    const full = await page.evaluate(() => !!document.fullscreenElement);
    fsLabels.push(await fsLabel());
    ok(full && c.shown && c.on && c.text === 'Thu, Nov 12 9:41AM', `⛶ Full screen: Auto shows the time and date at once (${full ? 'full screen' : 'not full screen'}: ${c.text || 'no clock'})`);
    await openSettings(page, ['advanced']);
    row = await clockRow(page);
    ok(row && row.hints.join(' | ') === AUTO_HINT, `Settings in full screen: the clock fits, so only what Auto does is said (${row && row.hints.join(' | ')})`);
    await page.keyboard.press('Escape');
    await page.click('.picker-btn.left'); await page.click('.panel.open [data-ctl="fullscreen"]'); await page.waitForTimeout(400);
    c = await cornerClock(page);
    ok(!await page.evaluate(() => !!document.fullscreenElement) && !c.shown && !c.on, `⛶ again (Exit full screen): hidden again (${c.shown ? c.text : 'no clock'})`);
    fsLabels.push(await fsLabel());
    ok(fsLabels.join(', ') === 'Full screen / Full screen, Exit full screen / Exit full screen, Full screen / Full screen', `⛶ says “Full screen”, and “Exit full screen” while 21Board is (${fsLabels.join(', ')})`);
    await page.keyboard.press('Escape');
    ok(await fsOn(page) === true && (await cornerClock(page)).shown, 'the Fullscreen API from anywhere (a key, a widget): shown');
    ok(await fsOff(page) === true && !(await cornerClock(page)).shown, 'Escape (exitFullscreen()): hidden');

    // ---- On: always, as "Time and date" was.
    await setClock(page, 'on'); c = await cornerClock(page);
    const btn = await page.evaluate(() => { const r = document.querySelector('.picker-btn.right').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height }; });
    ok(c.shown && c.on && c.text === 'Thu, Nov 12 9:41AM', `On: the time and date, in a tab too (${c.text})`);
    ok(c.side === 'right' && c.r.right <= btn.left && btn.left - c.r.right < 12 && Math.abs(c.r.height - btn.height) < 1 && Math.abs(c.r.bottom - btn.bottom) < 1,
      'beside the right-hand ▦ button on its inner side, as tall as it');
    ok(c.pe === 'none' && c.fontPx >= 24, `taps go through it, and it is big enough to read across the room (${c.fontPx.toFixed(1)} px)`);
    // Exactly on the minute.
    await page.clock.pauseAt(new Date('2026-11-12T09:41:58'));
    await page.clock.runFor(1900);
    const before = (await cornerClock(page)).text;
    await page.clock.runFor(200);
    const after = (await cornerClock(page)).text;
    ok(before === 'Thu, Nov 12 9:41AM' && after === 'Thu, Nov 12 9:42AM', `it changes exactly on the minute (9:41:59.9 ${before}, 9:42:00.1 ${after})`);
    await page.clock.resume();
    await openSettings(page, ['advanced']);
    row = await clockRow(page);
    ok(row && row.choices === 'On (chosen), Off, Auto' && row.hints.join(' | ') === AUTO_HINT, `Settings: ${row && row.choices}`);
    await page.click('#settings [data-act="clock"][data-val="off"]'); await page.waitForTimeout(300);
    c = await cornerClock(page);
    ok(!c.shown && !c.on, 'Off: no clock');
    ok(await fsOn(page) === true && !(await cornerClock(page)).shown && await fsOff(page) === true, 'Off: none in full screen either');
    await openSettings(page, ['advanced']);
    await page.click('#settings [data-act="clock"][data-val="on"]'); await page.waitForTimeout(300);
    ok((await cornerClock(page)).text === 'Thu, Nov 12 9:42AM', 'On: back again');
    // Drawn like the toolbar in both themes.
    const light = (await cornerClock(page)).bg;
    await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(300);
    c = await cornerClock(page);
    ok(light === 'rgba(255, 255, 255, 0.95)' && c.bg === 'rgba(30, 30, 30, 0.95)' && c.color === 'rgb(249, 250, 251)', `drawn like the ▦ button, light and dark (${light} → ${c.bg})`);
    await page.click('#settings [data-act="theme"][data-val="light"]'); await page.waitForTimeout(200);
    // Settings → Advanced → Widget Picker: Both corners, Left or Right (Settings moves to that side, Advanced still open).
    await openSettings(page, ['advanced']);
    const side = async () => { const k = await cornerClock(page), b = await page.evaluate(s => { const r = document.querySelector('.picker-btn.' + s).getBoundingClientRect(); return { left: r.left, right: r.right }; }, k.side);
      return k.side + (k.side === 'left' ? (k.r.left >= b.right && k.r.left - b.right < 12 ? ' beside ▦' : ' away from ▦') : (k.r.right <= b.left && b.left - k.r.right < 12 ? ' beside ▦' : ' away from ▦')); };
    const corners = [];
    for (const v of ['left', 'right', 'both']) { await page.click(`#settings [data-act="corners"][data-val="${v}"]`); await page.waitForTimeout(400); corners.push(`${v}: ${await side()}`); }
    ok(corners.join('; ') === 'left: left beside ▦; right: right beside ▦; both: right beside ▦', `it follows Settings → Advanced → Widget Picker (${corners.join('; ')})`);
    // Pages: on every page.
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__board21.pages.add && window.__board21.pages.add());
    await page.waitForTimeout(800);
    ok((await cornerClock(page)).shown, 'and on every page');
    await ctx.close();

    // The device's time zone changes while 21Board is open (a Chromebook setting its zone after start-up, IT's policy,
    // an iPad that travelled): the clock follows it from the next minute on, like the rest of 21Board.
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    const zone = await ctx.newCDPSession(page);
    await zone.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Chicago' });
    await page.clock.install({ time: new Date('2026-11-12T15:41:30Z') });   // 9:41 AM in Chicago
    await page.goto(BASE); await boardUp(page); await setClock(page, 'on'); await page.waitForTimeout(300);
    const chicago = (await cornerClock(page)).text;
    await zone.send('Emulation.setTimezoneOverride', { timezoneId: '' });   // (one override at a time)
    await zone.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
    await page.clock.runFor(31000); await page.waitForTimeout(200);
    const newYork = (await cornerClock(page)).text;
    ok(chicago === 'Thu, Nov 12 9:41AM' && newYork === 'Thu, Nov 12 10:42AM', `a new time zone shows from the next minute (Chicago ${chicago}, then New York ${newYork})`);
    await ctx.close();

    // Never in the way (On). (At 9:41: what fits depends on the time's width, and "12:59 PM" is wider than "9:41 AM".)
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    page = await ctx.newPage(); page.on('pageerror', e => { if (!/boom from the widget/.test(e.message)) errors.push(e.message); });   // (the dev window's test widget throws on purpose)
    await page.clock.install({ time: new Date('2026-11-12T09:41:00') });
    await page.goto(BASE); await boardUp(page); await setClock(page, 'on'); await page.waitForTimeout(300);
    const clear = () => page.evaluate(() => {
      const c = document.querySelector('.corner-clock');
      if (!c || c.hidden || getComputedStyle(c).visibility === 'hidden') return { shown: false };
      const r = c.getBoundingClientRect(), hit = b => r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
      const names = { 'picker-btn': '▦', 'save-note': 'Not saved', 'folder-note': 'the folder note', toast: 'a toast', 'shape-hint': 'the shape tip' };
      const over = [...document.querySelectorAll('.picker-btn, .save-note, .folder-note, #toasts .toast, #shape-hint')].filter(e => !e.hidden && e.getBoundingClientRect().width && hit(e.getBoundingClientRect()))
        .map(e => names[e.id] || names[[...e.classList].find(k => names[k])]);
      return { shown: true, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, over, text: c.textContent.replace(/\s+(?=[AP]M)/g, '').replace(/\s+/g, ' ').trim() };
    });
    // Everything that can sit in the bottom corners and the bottom middle at once: both notes and a long toast.
    const crowd = () => page.evaluate(() => {
      document.querySelectorAll('.save-note, .folder-note').forEach(b => { b.hidden = false; b.innerHTML = '<span class="status-dot warn"></span>' + (b.classList.contains('save-note') ? 'Not saved' : 'Reconnect folder'); b.style.bottom = b.classList.contains('folder-note') ? 'calc(132px + env(safe-area-inset-bottom))' : ''; });
      document.querySelectorAll('#toasts .toast').forEach(t => t.remove());
      const t = document.createElement('div'); t.className = 'toast';
      t.innerHTML = '<span>21Board can’t close itself. Your board is saved. To leave, restart the device or ask your school’s IT.</span><button>Undo</button>';
      document.getElementById('toasts').appendChild(t);
    });
    const report = [];
    for (const [w, h, size] of [[1366, 768, 0.8], [1024, 768, 0.8], [1920, 1080, 0.8], [768, 1024, 0.8], [683, 768, 0.8], [480, 800, 0.8], [1366, 768, 2], [1920, 1080, 2]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(size => { document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); window.__board21.setBoardScale(size); }, size);
      await page.waitForTimeout(350);
      await crowd(); await page.waitForTimeout(100);
      const r = await clear();
      report.push(`${w}×${h} ${size * 100}%: ${r.shown ? (r.over.length ? 'over ' + r.over.join(', ') : r.inside ? 'clear' : 'off screen') : 'hidden'}`);
      ok(!r.shown || (r.inside && !r.over.length), report[report.length - 1] + (r.shown ? ` (“${r.text}”)` : ''));
    }
    ok(/^768×1024 80%: clear/.test(report[3]) && /^480×800 80%: hidden/.test(report[5]), 'it shows on an upright iPad, and hides in a window too narrow for it');
    await page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove()));
    // Settings says what doesn't fit right now: only the time, or none of it.
    await page.setViewportSize({ width: 1366, height: 768 }); await page.evaluate(() => window.__board21.setBoardScale(2)); await page.waitForTimeout(300);
    await openSettings(page, ['advanced']);
    const fit = await page.locator('#set-clock-fit').textContent(), only = (await cornerClock(page)).text;
    ok(fit === 'Only the time fits in this window.' && /^\d{1,2}:\d\d[AP]M$/.test(only), `at 200% on 1366×768, On shows the time only (${only}), and Settings says so (${fit})`);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 480, height: 800 }); await page.evaluate(() => window.__board21.setBoardScale(0.8)); await page.waitForTimeout(300);
    await openSettings(page, ['advanced']);
    const none = await page.locator('#set-clock-fit').textContent();
    ok(none === 'Not enough room in this window.' && !(await cornerClock(page)).shown, `in a window too narrow for it, Settings says so (${none})`);
    await page.keyboard.press('Escape');
    // The shape tip never sits under it.
    for (const [w, h, sc] of [[1100, 400, 1.5], [1600, 600, 2], [600, 800, 2], [800, 720, 1.5], [1000, 900, 2], [1000, 820, 0.8]]) {
      await page.setViewportSize({ width: w, height: h }); await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(300);
      const r = await clear(), tip = await page.evaluate(() => !document.getElementById('shape-hint').hidden);
      ok(!r.shown || (r.inside && !r.over.length), `${w}×${h} at ${sc * 100}%${tip ? ' with the shape tip' : ''}: the clock is ${r.shown ? (r.over.length ? 'over ' + r.over.join(', ') : 'clear of everything') : 'left out'}`);
    }
    // The Widget Picker: the clock hides while its corner's Picker is open, and stays while the other corner's is.
    await page.setViewportSize({ width: 1366, height: 768 }); await page.evaluate(() => window.__board21.setBoardScale(0.8)); await page.waitForTimeout(300);
    await page.click('.picker-btn.right'); await page.waitForTimeout(400);
    const underPanel = (await clear()).shown;
    await page.click('.picker-btn.right'); await page.waitForTimeout(300);
    const back = (await clear()).shown;
    await page.click('.picker-btn.left'); await page.waitForTimeout(400);
    const otherSide = (await clear()).shown;
    await page.click('.picker-btn.left'); await page.waitForTimeout(300);
    ok(!underPanel && back && otherSide, `hidden while the right-hand Widget Picker is open, back when it closes, and shown while the left one is open (${underPanel}, ${back}, ${otherSide})`);
    // (Where the clock has room, the other corner's Picker doesn't reach it today. Should it ever, the clock hides:
    // here the Picker is made wider than any screen it fits on would give it.)
    await page.evaluate(() => { document.getElementById('panel').style.minWidth = 'calc(100vw / var(--ui) - 200px)'; });
    await page.click('.picker-btn.left'); await page.waitForTimeout(600);
    const reach = await page.evaluate(() => { const c = document.querySelector('.corner-clock'), r = c.getBoundingClientRect(), p = document.getElementById('panel').getBoundingClientRect(); return { over: p.right > r.left, hidden: getComputedStyle(c).visibility === 'hidden' }; });
    await page.click('.picker-btn.left'); await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('panel').style.minWidth = ''; });
    ok(reach.over && reach.hidden && (await clear()).shown, 'a Widget Picker in the other corner that reaches it hides it too, until it closes');
    // A window under it can still be moved: taps go through the clock.
    await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(200);
    await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('clock')); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setRect('clock:1', { x: 960, y: 420, w: 380, h: 330 })); await page.waitForTimeout(400);
    const k = (await cornerClock(page)).r, cx = k.left + k.width / 2, cy = k.top + k.height / 2;
    const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('.win[data-ikey="clock:1"]'); }, [cx, cy]);
    const w0 = await page.evaluate(() => Object.assign({}, window.__board21.state.wins.get('clock:1').disp));
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(cx - 30 * i, cy - 25 * i); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(400);
    const w1 = await page.evaluate(() => Object.assign({}, window.__board21.state.wins.get('clock:1').disp));
    ok(under && w1.x < w0.x - 200 && w1.y < w0.y - 150, `a window under the clock gets the tap, and drags from there (moved ${Math.round(w1.x - w0.x)}, ${Math.round(w1.y - w0.y)})`);
    // Kiosk mode is always full screen (it has no ⛶): Auto shows the clock there.
    await setClock(page, 'auto');
    ok(!(await cornerClock(page)).shown, 'back to Auto: none in this tab');
    await page.goto(BASE + '?kiosk=yes'); await boardUp(page); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__board21.state.settings.clock) === 'auto' && (await cornerClock(page)).shown, 'kiosk mode (always full screen): Auto shows the clock');
    await ctx.close();

    // ---- A window that fills the board is told how far ▦ and the clock reach into its bottom corners (`corners` in Board21's
    // window info, in its CSS px), so it can keep its own buttons clear of them; it follows the clock coming and going,
    // with Auto as full screen comes and goes. A window that doesn't fill it isn't told. Toasts keep clear of the clock
    // only while it shows (body.clock-on, --clock-room).
    ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    await page.evaluate(() => window.__board21.openWidget('notes'));
    const noteWin = page.frameLocator('.win[data-ikey="notes:1"] iframe');
    await noteWin.locator('body').waitFor(); await page.waitForTimeout(500);
    const told = () => noteWin.locator('html').evaluate(() => (Board21.context && Board21.context.window && Board21.context.window.corners) || null);
    const measured = () => page.evaluate(() => {   // on the board, in the window's CSS px
      const s = window.__board21.zoom.s, r = e => e.getBoundingClientRect(), clock = document.querySelector('.corner-clock:not([hidden])');
      const L = r(document.querySelector('.picker-btn.left')), R = r(document.querySelector('.picker-btn.right')), C = clock ? r(clock) : null;
      return { left: Math.ceil(L.right / s), right: Math.ceil((innerWidth - Math.min(R.left, C ? C.left : Infinity)) / s), height: Math.ceil((innerHeight - Math.min(L.top, R.top, C ? C.top : Infinity)) / s) };
    });
    const sameReach = (a, b) => !!a && !!b && ['left', 'right', 'height'].every(k => Math.abs(a[k] - b[k]) <= 1);
    const onlyButtons = async () => { const t = await told(); return sameReach(t, await measured()) && Math.abs(t.right - t.left) <= 1; };
    let withClock = null;
    const andClock = async () => { const t = await told(); if (!sameReach(t, await measured()) || t.right < t.left + 100) return false; withClock = t; return true; };
    // (A toast keeps clear of the clock by --clock-room; without it, only of the screen's edges.)
    const toastRoom = () => page.evaluate(() => { const t = document.getElementById('toasts'); return document.body.classList.contains('clock-on') ? getComputedStyle(t).maxWidth : 'no clock-on'; });
    ok(await told() === null, 'a window that doesn’t fill the board isn’t told about the corners');
    await page.evaluate(() => window.__board21.setMaximized('notes:1', true));
    ok(await eventually(onlyButtons) && await toastRoom() === 'no clock-on', `filling the board in a tab (Auto, no clock), it is told how far ▦ reaches in (${JSON.stringify(await told())})`);
    ok(await fsOn(page) === true && await eventually(andClock) && /px$/.test(await toastRoom()), `full screen (Auto): the clock comes, and the window is told it reaches in further (${JSON.stringify(withClock)}); toasts keep clear of it (max-width ${await toastRoom()})`);
    ok(await fsOff(page) === true && await eventually(onlyButtons) && await toastRoom() === 'no clock-on', `leaving full screen: the clock goes, and the window is told only ▦ again (${JSON.stringify(await told())}); toasts have the whole bottom again`);
    await setClock(page, 'on');
    ok(await eventually(andClock), `On: as far as the clock (${JSON.stringify(await told())})`);
    await setClock(page, 'off');
    ok(await eventually(async () => { const t = await told(); return await onlyButtons() && t.right < withClock.right - 100; }), `Off: only as far as ▦ (${JSON.stringify(await told())})`);
    await setClock(page, 'on');
    await page.setViewportSize({ width: 1366, height: 768 }); await page.evaluate(() => window.__board21.setBoardScale(1.5));
    ok(await eventually(async () => sameReach(await told(), await measured())), `and again when the screen or the board’s Size changes (${JSON.stringify(await told())} at 150% on 1366×768)`);
    await page.evaluate(() => window.__board21.setMaximized('notes:1', false));
    ok(await eventually(async () => await told() === null), 'and not once it no longer fills the board');
    await ctx.close();

    // ---- The browser's or app's window in full screen without the Fullscreen API: Chrome 153 says so with
    // (display-mode: fullscreen) (F11, the Chromebook's full screen key, an app opened full screen), Chrome 155 with
    // (display-state: fullscreen) too. Stubbed (CDP can't emulate either): window.__screen({ mode, state }) changes what
    // they say, with their change events; __screen(…, true) quietly, with none, so a resize is all the board gets.
    const SCREEN = cfg => {
      const st = Object.assign({ mode: 'browser', state: 'normal' }, cfg), lists = {}, mm = window.matchMedia.bind(window);
      const val = (k, v) => st[k] === v;
      window.matchMedia = q => {
        const m = /^\s*\(\s*display-(mode|state)\s*:\s*([a-z-]+)\s*\)\s*$/.exec(String(q));
        if (!m) return mm(q);
        if (lists[q]) return lists[q];
        const l = lists[q] = new EventTarget(), k = m[1], v = m[2];
        let was = val(k, v);
        Object.defineProperty(l, 'matches', { get: () => val(k, v) });
        l.media = q; l.onchange = null;
        l.addListener = f => l.addEventListener('change', f); l.removeListener = f => l.removeEventListener('change', f);
        l.check = () => { const now = val(k, v); if (now === was) return; was = now; const e = new Event('change'); e.matches = now; e.media = q; l.dispatchEvent(e); if (l.onchange) l.onchange(e); };
        return l;
      };
      window.__screen = (o, quiet) => { Object.assign(st, o); if (!quiet) Object.values(lists).forEach(l => l.check()); };
    };
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(SCREEN, {});
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    await page.evaluate(() => window.__board21.openWidget('notes'));
    const noteWin2 = page.frameLocator('.win[data-ikey="notes:1"] iframe');
    await noteWin2.locator('body').waitFor(); await page.waitForTimeout(500);
    const told2 = () => noteWin2.locator('html').evaluate(() => (Board21.context && Board21.context.window && Board21.context.window.corners) || null).catch(() => null);
    await page.evaluate(() => window.__board21.setMaximized('notes:1', true)); await page.waitForTimeout(400);
    const flips = [];
    // What the board shows after the window says it's in that state: the clock or not, clock-on, and how far the
    // maximized window is told the right-hand corner reaches (once it has been told what the board shows).
    const as = async (label, o, quiet) => {
      await page.evaluate(([o, quiet]) => window.__screen(o, quiet), [o, !!quiet]); await page.waitForTimeout(300);
      await eventually(async () => sameReach(await told2(), await measured()), 3000);
      const k = await cornerClock(page), t = await told2();
      flips.push(`${label}: ${k.shown ? 'clock' : 'none'}${k.on ? ' (clock-on)' : ''}, told right ${t ? t.right : '?'}`);
      return { shown: !!k.shown && k.on, right: t ? t.right : null };
    };
    const tab = await as('a tab', { mode: 'browser', state: 'normal' });
    const f11 = await as('F11 (display-mode: fullscreen)', { mode: 'fullscreen' });
    const tabAgain = await as('F11 again (display-mode: browser)', { mode: 'browser' });
    const ds = await as('display-state: fullscreen', { state: 'fullscreen' });
    const dsOff = await as('display-state: normal', { state: 'normal' });
    const maxed = await as('a maximized tab (display-state: maximized)', { state: 'maximized' });
    const appMax = await as('an installed app’s window, maximized', { mode: 'standalone', state: 'maximized' });
    const appFilled = await as('an installed app’s window filling the screen (normal)', { mode: 'standalone', state: 'normal' });
    const screenSized = await page.evaluate(() => innerWidth === screen.width && innerHeight === screen.height);
    const appFull = await as('an app opened full screen (Android)', { mode: 'fullscreen', state: 'fullscreen' });
    const appBack = await as('and back to its window', { mode: 'standalone', state: 'normal' });
    ok(!tab.shown && f11.shown && !tabAgain.shown && f11.right > tab.right + 100 && tabAgain.right === tab.right, `Auto: F11 or the full screen key (display-mode: fullscreen) shows it, leaving hides it, and a window filling the board is told (${flips.slice(0, 3).join('; ')})`);
    ok(ds.shown && !dsOff.shown && ds.right === f11.right && dsOff.right === tab.right, `Chrome 155’s (display-state: fullscreen) alone shows it too (${flips.slice(3, 5).join('; ')})`);
    ok(!maxed.shown && !appMax.shown && !appFilled.shown && screenSized, `not in a maximized tab, nor an installed app’s window, maximized or filling the screen, though it is as big as the screen (an iPad Home Screen app) (${flips.slice(5, 8).join('; ')})`);
    ok(appFull.shown && !appBack.shown, `an app opened full screen shows it (${flips.slice(8).join('; ')})`);
    // A browser that says nothing (no change events): the window's resize is enough. The window that fills the board gets
    // one message for it, with its new size, zoom and corners together (not first the corners at its old size and zoom).
    await page.setViewportSize({ width: 1366, height: 681 }); await page.waitForTimeout(400);   // (a tab on a 1366×768 Chromebook)
    await as('quietly full screen', { mode: 'fullscreen' }, true);
    const quiet = await cornerClock(page);
    const said = i => `${i.width}×${i.height} zoom ${i.zoom} corners ${i.corners ? [i.corners.left, i.corners.right, i.corners.height].join('/') : '-'}`;
    await noteWin2.locator('html').evaluate(() => { window.__got = []; Board21.on('resize', i => window.__got.push(i)); });
    const got = async () => (await noteWin2.locator('html').evaluate(() => window.__got.splice(0))).map(said).join(' then ') + ' (now ' + said(await page.evaluate(() => window.__board21.state.wins.get('notes:1').info())) + ')';
    await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(400);
    const resized = await cornerClock(page), gotIn = await got();
    await page.evaluate(() => window.__screen({ mode: 'browser' }, true)); await page.setViewportSize({ width: 1366, height: 681 }); await page.waitForTimeout(400);
    const resizedBack = await cornerClock(page), gotOut = await got();
    ok(!quiet.shown && resized.shown && !resizedBack.shown, `with no change event, the resize that comes with full screen shows it, and the one leaving it hides it (${[quiet, resized, resizedBack].map(k => k.shown ? 'clock' : 'none').join(', ')})`);
    const one = s => { const [msgs, now] = s.split(' (now '); return msgs === now.slice(0, -1); };
    ok(one(gotIn) && one(gotOut), `the window filling the board gets one message each time, its size, zoom and corners together (in: ${gotIn}; out: ${gotOut})`);
    await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(400);
    // On and Off don't care.
    await setClock(page, 'on'); const onTab = (await cornerClock(page)).shown;
    await setClock(page, 'off'); const offFull = (await as('Off, full screen', { mode: 'fullscreen' })).shown;
    await setClock(page, 'auto'); const autoFull = (await cornerClock(page)).shown;
    ok(onTab && !offFull && autoFull, `On shows it in a tab, Off never, and back to Auto in full screen it shows at once (${onTab}, ${offFull}, ${autoFull})`);
    await ctx.close();
    // Opened already full screen (an app that opens full screen, a window left in full screen): there at once. The widget
    // dev window (LAB), the same: never.
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(SCREEN, { mode: 'fullscreen', state: 'fullscreen' });
    page = await ctx.newPage(); page.on('pageerror', e => { if (!/boom from the widget/.test(e.message)) errors.push(e.message); });
    await page.goto(BASE); await boardUp(page); await page.waitForTimeout(300);
    ok((await cornerClock(page)).shown, 'opened already full screen: Auto shows it from the start');
    await page.goto(BASE + '__dev/widget.html'); await page.waitForTimeout(3000);
    const board = page.frames().find(f => f.parentFrame() === page.mainFrame());
    const lab = board && await board.evaluate(() => ({ up: !!window.__board21, full: matchMedia('(display-mode: fullscreen)').matches, clock: !!document.querySelector('.corner-clock:not([hidden])'),
      on: document.body.classList.contains('clock-on'), row: !!document.querySelector('#settings [data-act="clock"]') }));
    ok(!!lab && lab.up && lab.full && !lab.clock && !lab.on && !lab.row, `the widget dev window has no clock, though its window says full screen (${JSON.stringify(lab)})`);
    await ctx.close();

    // ---- Older and unknown values. Before this release the choices were Off, Time and Time and date (the default, which
    // most devices saved without anyone choosing it): "Time and date" reads as Auto, "Time" (someone chose a clock) as On,
    // and a value this release doesn't know (another release's, or a damaged record) as the default, Auto. On the board
    // and in Settings alike; nothing is rewritten.
    ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const putSettings = patch => page.evaluate(patch => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const t = o.result.transaction('records', 'readwrite'), st = t.objectStore('records'), g = st.get('settings');
      g.onsuccess = () => st.put({ key: 'settings', type: 'settings', rev: Date.now() + 1e6, updatedAt: Date.now(), by: 'test', value: Object.assign({}, g.result && g.result.value, patch) }); t.oncomplete = () => { o.result.close(); res(); }; }; }), patch);
    const agree = [];
    for (const v of ['date', 'time', 'off', 'analog', 7, null, 'constructor']) {
      await putSettings({ clock: v }); await page.reload(); await boardUp(page); await page.waitForTimeout(300);
      const inTab = (await cornerClock(page)).shown ? 'clock' : 'none';
      await fsOn(page); await page.waitForTimeout(200);
      const inFull = (await cornerClock(page)).shown ? 'clock' : 'none';
      await fsOff(page);
      await openSettings(page, ['advanced']);
      agree.push(`${JSON.stringify(v)}: ${inTab} / ${inFull} / ${await page.evaluate(() => (document.querySelector('#settings [data-act="clock"].on') || {}).textContent)} / kept ${JSON.stringify(await page.evaluate(() => window.__board21.state.settings.clock))}`);
      await page.keyboard.press('Escape');
    }
    ok(agree.join('; ') === '"date": none / clock / Auto / kept "date"; "time": clock / clock / On / kept "time"; "off": none / none / Off / kept "off"; "analog": none / clock / Auto / kept "analog"; 7: none / clock / Auto / kept 7; null: none / clock / Auto / kept null; "constructor": none / clock / Auto / kept "constructor"',
      `“Time and date” reads as Auto, “Time” as On, Off stays Off, anything else as Auto: the board (in a tab / in full screen) and Settings agree (${agree.join('; ')})`);
    await ctx.close();

    // Text style: the clock measures itself (and the room toasts keep clear of) in the letters it shows. A font still on
    // its way measures again once it arrives (here each takes 0.7 s); a change to letters already loaded, or to
    // Standard, is measured in them straight away.
    ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    await ctx.route(/\.woff2$/, async r => { await new Promise(res => setTimeout(res, 700)); await r.continue(); });
    // The room the clock says it takes (--clock-room), and how far in from its edge it really reaches (with its gap).
    await ctx.addInitScript(() => { window.__clockRoom = () => { const c = document.querySelector('.corner-clock');
      return { room: parseFloat(document.body.style.getPropertyValue('--clock-room')), real: !c || c.hidden ? 0 : Math.ceil((innerWidth - c.getBoundingClientRect().left) / window.__board21.zoom.ui + 8) }; }; });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-11-12T09:41:05') });   // (no new minute meanwhile: it measures again too)
    await page.goto(BASE); await boardUp(page);
    const rooms = [];
    for (const key of ['legible', 'early']) {
      await putSettings({ letters: key, clock: 'on' }); await page.reload(); await boardUp(page);
      await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
      const m = await page.evaluate(() => window.__clockRoom()); rooms.push(`opened in ${key}: ${m.room}/${m.real}`);
    }
    await openSettings(page, ['letters']);
    await page.evaluate(() => document.fonts.ready);   // (Settings shows each choice in its own letters, once Text style is open: all loaded now)
    for (const key of ['standard', 'legible', 'early', 'standard']) {
      // (Read in the same task as the tap: before anything else gets the chance to measure again.)
      const m = await page.evaluate(key => { document.querySelector(`#settings [data-act="letters"][data-val="${key}"]`).click(); return window.__clockRoom(); }, key);
      rooms.push(`${key}: ${m.room}/${m.real}`);
    }
    ok(rooms.every(r => { const [a, b] = r.split(': ')[1].split('/'); return a === b && +a > 0; }), `--clock-room is how far the clock really reaches, in each of the letters (${rooms.join('; ')})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  // The clock in Chrome's real windows, which the suite above stubs: Chrome 153 under Xvfb (no window manager: a window
  // can't be maximized there) and in Chrome's own headless mode with the windowing DevTrial flag (it maximizes, and has
  // display-state). A tab and an installed 21Board (installed and launched with CDP's PWA domain, as "Opens maximized" does).
  // F11 is Chrome's window in its own full screen: CDP's Browser.setWindowBounds with windowState 'fullscreen'.
  ['Clock in the corner: real Chrome windows (Auto: a tab and an installed app’s window, normal, maximized, Chrome’s own full screen as F11 gives it, the Fullscreen API; On in the app’s window)', async () => {
    const os = require('os'), { spawn } = require('child_process');
    const skip = why => console.log('  - skipped: ' + why);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const errors = [];
    // What the page sees and shows, read without a user gesture (page.evaluate passes one).
    const run = async (ctx, p, expression, gesture) => { const s = await ctx.newCDPSession(p); const r = await s.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: !!gesture }); await s.detach(); return r.exceptionDetails ? 'threw' : r.result.value; };
    const look = (ctx, p) => run(ctx, p, `(() => {
      const mm = q => matchMedia(q).matches, c = document.querySelector('.corner-clock'), b = document.querySelector('.picker-btn.right');
      const shown = !!c && !c.hidden && getComputedStyle(c).visibility !== 'hidden', r = shown ? c.getBoundingClientRect() : null, br = b && b.getBoundingClientRect();
      return { mode: ['browser', 'standalone', 'fullscreen'].find(m => mm('(display-mode: ' + m + ')')) || '', state: ['normal', 'maximized', 'fullscreen'].find(m => mm('(display-state: ' + m + ')')) || '-',
        fs: !!document.fullscreenElement, clock: shown, on: document.body.classList.contains('clock-on'), iw: innerWidth, ih: innerHeight,
        beside: !!r && !!br && r.right <= br.left && br.left - r.right < 12 && Math.abs(r.bottom - br.bottom) < 1 && br.right <= innerWidth && br.right >= innerWidth - 30 && br.bottom >= innerHeight - 30,
        up: !!(window.__board21 && window.__board21.store.loaded && !document.getElementById('startup')) };
    })()`);
    const up = async (ctx, p) => { for (let i = 0; i < 100; i++) { if ((await look(ctx, p).catch(() => ({}))).up) return; await sleep(100); } };
    const said = v => `${v.mode}${v.state !== '-' ? ', display-state ' + v.state : ''}${v.fs ? ', fullscreenElement' : ''}: ${v.clock ? 'clock' : 'none'}`;
    // (As in "Opens maximized: a real app window": a profile of its own, started by Playwright, the only kind given the PWA domain.)
    const start = async ({ display, headless }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b21-clock-'));
      const args = headless ? ['--enable-features=DesktopPWAsAdditionalWindowingControls', '--screen-info={1366x768}'] : [];
      let ctx;
      try {
        ctx = await chromium.launchPersistentContext(dir, { headless: !!headless, channel: headless ? 'chromium' : undefined, viewport: null, args, env: Object.assign({}, process.env, display ? { DISPLAY: display } : {}) });
      } catch (e) { skip(`Chrome${headless ? '’s headless mode (the full Chromium, npx playwright install chromium)' : ' (headful)'} didn’t start here: ${String(e.message).split('\n')[0]}`); return null; }
      const close = async () => { await ctx.close().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); };
      ctx.on('page', p => p.on('pageerror', e => errors.push(e.message)));
      const bs = await ctx.browser().newBrowserCDPSession();
      const tab = ctx.pages()[0] || await ctx.newPage();
      tab.on('pageerror', e => errors.push(e.message));
      await tab.goto(BASE); await boardUp(tab); await sleep(500);
      const B = { ctx, bs, tab, close };
      const target = async p => (await (await ctx.newCDPSession(p)).send('Target.getTargetInfo')).targetInfo.targetId;
      // The window's state, as Chrome is asked to make it (as the teacher, F11 or the maximize button would), then what the page sees.
      B.state = async (p, windowState) => {
        const { windowId } = await bs.send('Browser.getWindowForTarget', { targetId: await target(p) });
        await bs.send('Browser.setWindowBounds', { windowId, bounds: { windowState } }); await sleep(1000);
        return look(ctx, p);
      };
      B.api = async (p, on) => { await run(ctx, p, on ? 'document.documentElement.requestFullscreen().then(() => 1, () => 0)' : 'document.exitFullscreen().then(() => 1, () => 0)', on); await sleep(600); return look(ctx, p); };
      B.app = async () => {
        try {
          await bs.send('PWA.install', { manifestId: BASE, installUrlOrBundleUrl: BASE });
          await bs.send('PWA.changeAppUserSettings', { manifestId: BASE, displayMode: 'standalone' });
        } catch (e) { skip(`CDP’s PWA domain isn’t available here (${e.message})`); return undefined; }   // (null: installed, but no window came)
        const before = ctx.pages();
        await bs.send('PWA.launch', { manifestId: BASE });
        for (let i = 0; i < 100 && !ctx.pages().some(p => !before.includes(p)); i++) await sleep(100);
        const app = ctx.pages().find(p => !before.includes(p));
        if (app) { await app.waitForLoadState('load'); await up(ctx, app); await sleep(1500); }
        return app || null;
      };
      return B;
    };

    let X = null, display = null;
    const onPath = name => (process.env.PATH || '').split(path.delimiter).some(d => d && fs.existsSync(path.join(d, name)));
    if (!onPath('Xvfb')) skip('no Xvfb (the xvfb package, with xvfb-run) on this machine: no headful Chrome. The suite above covers the behaviour, stubbed.');
    else {
      X = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', '1366x768x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
      display = await new Promise(res => { let s = ''; X.stdio[3].on('data', d => { s += d; if (/\n/.test(s)) res(':' + s.trim()); }); X.on('exit', () => res(null)); setTimeout(() => res(null), 10000); });
      if (!display) skip('Xvfb didn’t start');
    }
    try {
      // ---- Headful, under Xvfb.
      const B = display && await start({ display });
      if (B) {
        const t = [await look(B.ctx, B.tab)];
        t.push(await B.state(B.tab, 'fullscreen'), await B.state(B.tab, 'normal'), await B.api(B.tab, true), await B.api(B.tab, false));
        ok(!t[0].clock && t[1].clock && t[1].on && !t[2].clock && !t[2].on && t[3].clock && !t[4].clock,
          `a tab: none; Chrome’s own full screen (F11) shows it; back to normal, none; the Fullscreen API (⛶) shows it; leaving it, none (${t.map(said).join('; ')})`);
        const app = await B.app();
        if (app !== undefined) ok(!!app, 'PWA.launch opens 21Board in an app window of its own');
        if (app) {
          const a = [await look(B.ctx, app)];
          a.push(await B.state(app, 'fullscreen'), await B.state(app, 'normal'), await B.api(app, true), await B.api(app, false));
          ok(a[0].mode === 'standalone' && !a[0].clock && a[1].clock && !a[2].clock && a[3].clock && !a[4].clock,
            `an installed app’s window (filling the screen at launch): none; in Chrome’s full screen, the clock; back in its window, none; the Fullscreen API, the clock; left, none (${a.map(said).join('; ')})`);
          // On, chosen in the tab beside it (the same device): the app's window follows, the clock beside ▦ in its corner.
          await setCornerClock(B.tab, 'on');
          let v = null;
          ok(await eventually(async () => (v = await look(B.ctx, app)).clock && v.beside), `On (chosen in the tab): the app’s window shows it at once, beside ▦ in the window’s corner (${v && said(v)})`);
        }
        await B.close();
      }
    } finally {
      if (X) X.kill();
    }

    // ---- Chrome's headless mode with the flag: windows maximize, and display-state says so.
    const H = await start({ headless: true });
    if (H) {
      const t = [await look(H.ctx, H.tab), await H.state(H.tab, 'maximized'), await H.api(H.tab, true), await H.api(H.tab, false), await H.state(H.tab, 'fullscreen'), await H.state(H.tab, 'normal')];
      ok(t[1].state === 'maximized' && !t[0].clock && !t[1].clock && t[2].clock && !t[3].clock && t[4].clock && !t[5].clock,
        `a tab: none; maximized, none; the Fullscreen API while maximized, the clock; left, none; Chrome’s full screen, the clock; normal, none (${t.map(said).join('; ')})`);
      // A window that fills the board while Chrome's full screen comes and goes (the page resizes, and the clock comes and
      // goes with it): one message each time, with its new size, zoom and corners together.
      await H.tab.evaluate(() => window.__board21.openWidget('notes'));
      const note = H.tab.frameLocator('.win[data-ikey="notes:1"] iframe');
      await note.locator('body').waitFor(); await sleep(500);
      await H.tab.evaluate(() => window.__board21.setMaximized('notes:1', true)); await sleep(500);
      await note.locator('html').evaluate(() => { window.__got = []; Board21.on('resize', i => window.__got.push(i)); });
      const info = i => `${i.width}×${i.height} zoom ${i.zoom} corners ${i.corners ? [i.corners.left, i.corners.right, i.corners.height].join('/') : '-'}`;
      const got = async () => { const m = (await note.locator('html').evaluate(() => window.__got.splice(0))).map(info).join(' then '), now = info(await H.tab.evaluate(() => window.__board21.state.wins.get('notes:1').info())); return { one: m === now, text: `${m} (now ${now})` }; };
      await H.state(H.tab, 'fullscreen'); const gIn = await got();
      await H.state(H.tab, 'normal'); const gOut = await got();
      ok(gIn.one && gOut.one, `a window filling the board: one message as Chrome’s full screen comes, and one as it goes, its size, zoom and corners together (in: ${gIn.text}; out: ${gOut.text})`);
      await H.tab.evaluate(() => window.__board21.closeWin('notes:1')); await sleep(300);
      const app = await H.app();
      if (app) {
        // (Chrome maximizes a full screen window only from normal.)
        const a = [await look(H.ctx, app), await H.state(app, 'maximized'), await H.state(app, 'fullscreen'), await H.state(app, 'normal'), await H.state(app, 'maximized')];
        ok(a[1].state === 'maximized' && !a[0].clock && !a[1].clock && a[2].clock && a[2].state === 'fullscreen' && !a[3].clock && a[4].state === 'maximized' && !a[4].clock,
          `an installed app’s window: none filling the screen, none maximized, the clock in full screen, none back in its window, maximized or not (${a.map(said).join('; ')})`);
      }
      await H.close();
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],

  // Release 2026.11.21-4: the Clock makeover. Simple, Old, and Teaching faces, the LED look, analog and digital
  // together, Set the time, Mark a time (following the Timers on the page), Quiz, Hour hand only, and Time in words.
  ['Clock makeover (2026.11.21-4)', async (browser) => {
    const errors = [];
    // Each part runs on its own: one that stops early is reported, and the next still runs.
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const frameL = (p, ik) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const F = (p, ik, fn, arg) => frameL(p, ik).locator('html').evaluate(fn, arg);
    const connected = (p, ik) => eventually(() => p.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
    // The window menu as a line: [Heading], ✓ checked, (off) disabled, — a line.
    const menuOf = (p, ik) => p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.map(i => i.separator ? '—' : i.heading ? `[${i.label}]` : (i.checked ? '✓ ' : '') + i.label + (i.disabled ? ' (off)' : '')).join(' | '), ik);
    // A window's ⌄ menu, and the item with this id in it, as a teacher taps it. False when there's no such item, or it's off.
    const choose = async (p, ik, id) => {
      await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.waitForTimeout(200);
      const it = p.locator(`#menu [data-id="${id}"]`);
      if (!await it.count() || await it.isDisabled()) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); return false; }
      await it.click(); await p.waitForTimeout(350); return true;
    };
    const confOf = (p, ik) => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const dataOf = (p, ik) => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const ratioOf = (p, ik) => p.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return w.rt.ratio === undefined ? w.widget.win.aspectRatio : w.rt.ratio; }, ik);
    const size = (p, ik, w, h) => p.evaluate(([ik, w, h]) => window.__board21.setRect(ik, { x: 40, y: 40, w, h: h + 40 }), [ik, w, h]);
    // Content or config saved in the window and shown there, as a change from another tab or device arrives.
    const put = (p, ik, kind, v) => p.evaluate(async ([ik, kind, v]) => {
      const w = window.__board21.state.wins.get(ik), B = w.iframe.contentWindow.Board21;
      if (kind === 'data') { await B.save(v); w.post('data', { data: v, reason: 'remote' }); } else { await B.saveConfig(v); w.post('config', { config: v, reason: 'remote' }); }
    }, [ik, kind, v]);
    // Chicago time on Friday, Nov 20, 2026: the page's clock, fixed (timers still run).
    const AT = (hhmm, ss = '00') => `2026-11-20T${hhmm}:${ss}-06:00`;
    const ms = hhmm => Date.parse(AT(hhmm));
    const newBoard = async (hhmm, opts = {}) => {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 1400, height: 900 }, timezoneId: 'America/Chicago', locale: 'en-US' }, opts));
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      if (hhmm) await page.clock.setFixedTime(AT(hhmm));
      await page.goto(BASE); await boardUp(page); await freeBoard(page);
      return { ctx, page };
    };
    const openClock = async (page, w, h) => {
      const ik = await addWin(page, 'clock'); await connected(page, ik);
      if (w) { await size(page, ik, w, h); await page.waitForTimeout(400); }
      return ik;
    };
    // The Clock as it looks.
    const look = (p, ik) => F(p, ik, () => {
      const q = s => document.querySelector(s);
      const vis = el => !!el && !el.closest('[hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
      const rot = el => { const m = /rotate\(\s*([-\d.]+)/.exec((el && el.getAttribute('transform')) || ''); return m ? +m[1] : 0; };
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
      const svg = q('#analog'), hand = c => svg && svg.querySelector(c);
      return {
        face: svg ? ((svg.getAttribute('class') || '').match(/\bf-(\w+)/) || [])[1] || null : null,
        analog: vis(svg), digital: vis(q('#dig')), dateOnly: vis(q('#dateonly')),
        settable: !!svg && svg.classList.contains('settable'),
        h: rot(hand('.hand-h')), m: rot(hand('.hand-m')), minuteHand: vis(hand('.hand-m')), secondHand: vis(hand('.hand-s')),
        time: vis(q('#time')) ? q('#time').textContent : null, led: vis(q('.led-svg')),
        q: vis(q('#q')) ? q('#q').textContent : null,
        words: vis(q('#words')) ? q('#words').textContent : null,
        date: vis(q('#date')) ? q('#date').textContent : null,
        badge: vis(q('#badge')) ? q('#badge').textContent : null, now: vis(q('#now')) ? q('#now').textContent : null,
        label: svg && svg.getAttribute('aria-label'), valuetext: svg && svg.getAttribute('aria-valuetext'),
        valuenow: svg && svg.getAttribute('aria-valuenow'), valuemin: svg && svg.getAttribute('aria-valuemin'), valuemax: svg && svg.getAttribute('aria-valuemax'),
        W: innerWidth, H: innerHeight, ana: box(svg), dig: box(q('#dig')), nowBox: box(q('#now')), badgeBox: box(q('#badge')),
        arrows: Array.from(document.querySelectorAll('#dig .arrow')).filter(vis).map(b => Object.assign(box(b), { k: b.dataset.k }))
      };
    });
    // A point on the face, r of its 100 units out from the middle at deg degrees (0 is 12 o'clock), in page px.
    const faceAt = async (p, ik) => {
      const b = await frameL(p, ik).locator('#analog').boundingBox(), s = b.width / 200, cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      return (deg, r) => [cx + r * s * Math.sin(deg * Math.PI / 180), cy - r * s * Math.cos(deg * Math.PI / 180)];
    };
    // A drag on the face from one angle to another, r units out, as a mouse does it.
    const dragFace = async (p, ik, from, to, r) => {
      const at = await faceAt(p, ik);
      await p.mouse.move(...at(from, r)); await p.mouse.down();
      const n = Math.max(2, Math.ceil(Math.abs(to - from) / 3));
      for (let i = 1; i <= n; i++) await p.mouse.move(...at(from + (to - from) * i / n, r));
      await p.mouse.up(); await p.waitForTimeout(700);
    };
    const tapFace = async (p, ik, deg, r) => { const at = await faceAt(p, ik); await p.mouse.click(...at(deg, r)); await p.waitForTimeout(400); };
    const pressFace = async (p, ik, deg, r) => { const at = await faceAt(p, ik); await p.mouse.move(...at(deg, r)); await p.mouse.down(); await p.waitForTimeout(250); await p.mouse.up(); await p.waitForTimeout(400); };
    const near = (a, b, d = 1) => Math.abs(((a - b) % 360 + 540) % 360 - 180) <= d;
    // Mark a time's wedge: each sector's start, end, and size in degrees, and its fill. full: the whole ring.
    const wedgeOf = (p, ik) => F(p, ik, () => {
      const svg = document.querySelector('#analog');
      if (!svg) return null;
      const ang = (x, y) => ((Math.atan2(x - 100, -(y - 100)) * 180 / Math.PI) % 360 + 360) % 360;
      const sector = el => {
        if (!el || getComputedStyle(el).display === 'none') return null;
        const n = (el.getAttribute('d') || '').match(/-?[\d.]+/g);
        if (!n || n.length < 11) return null;
        const v = n.map(Number), a = ang(v[2], v[3]), b = ang(v[9], v[10]);
        return { from: a, to: b, span: ((b - a) % 360 + 360) % 360, fill: getComputedStyle(el).fill };
      };
      const full = svg.querySelector('.mk-full'), w = sector(svg.querySelector('.mk-w')), warn = sector(svg.querySelector('.mk-warn'));
      const probe = document.createElement('i'); probe.style.color = 'var(--b21-warning)'; document.body.appendChild(probe);
      const amber = getComputedStyle(probe).color; probe.remove();
      return { w, warn, full: !!full && getComputedStyle(full).display !== 'none', shown: !!(w || warn) || (!!full && getComputedStyle(full).display !== 'none'),
        from: w ? w.from : warn ? warn.from : null, span: (w ? w.span : 0) + (warn ? warn.span : 0), amber };
    });
    const wedgeIs = (wd, from, span, d = 1) => !!wd && wd.shown && !wd.full && near(wd.from, from, d) && Math.abs(wd.span - span) <= d;
    const said = wd => JSON.stringify(wd && { from: wd.from && Math.round(wd.from * 10) / 10, span: Math.round(wd.span * 10) / 10, warn: wd.warn && Math.round(wd.warn.span * 10) / 10, full: wd.full });

    // ---- 1. The menu: every item, when it shows, and when it's off.
    await part('Menu', async () => {
      const { ctx, page } = await newBoard('14:50');
      const reg = await page.evaluate(() => { const a = window.__board21.catalog().find(w => w.id === 'clock'); return a && { clash: a.clash, description: a.description, win: a.win }; });
      ok(!!reg && reg.clash === 'later' && reg.description === 'Show an analog or digital clock, or just the date.' && reg.win.aspectRatio === 1 && reg.win.width === 300 && reg.win.height === 300,
        `the registry: clash 'later', as for the Timer's time; the same description; 1:1 at 300 × 300 to start (${JSON.stringify(reg)})`);
      const ik = await openClock(page);
      let m = await menuOf(page, ik);
      ok(m === '[Show] | ✓ Analog | Digital | Date only | [Clock face] | ✓ Simple | Old | Teaching | — | LCD look (off) | Show seconds | Show date (off) | 24-hour time (off) | Time in words | — | Mark a time | Set the time',
        `a new Clock: Show (Analog, Digital, Date only), Clock face (Simple, Old, Teaching), a line, LCD look, Show seconds, Show date, 24-hour time, Time in words, a line, Mark a time, Set the time; LCD, date, and 24-hour off without Digital (${m})`);
      await choose(page, ik, 'face:old');
      m = await menuOf(page, ik);
      ok(m.includes('[Clock face] | Simple | ✓ Old | Teaching | Upright numerals | IV for four | —') && !m.includes('Hour hand only'), `Old: Upright numerals and IV for four right after the faces (${m})`);
      await choose(page, ik, 'face:teaching');
      m = await menuOf(page, ik);
      ok(m.includes('[Clock face] | Simple | Old | ✓ Teaching | Hour hand only | —') && !m.includes('Upright numerals') && !m.includes('IV for four'), `Teaching: Hour hand only right after the faces (${m})`);
      await choose(page, ik, 'digital');
      m = await menuOf(page, ik);
      ok(m.startsWith('[Show] | ✓ Analog | ✓ Digital | Date only |') && m.includes('— | LCD look | Show seconds | Show date | 24-hour time | Time in words | — | Mark a time | Quiz | Set the time'),
        `Digital too: both checked, LCD, date, and 24-hour on, and Quiz between Mark a time and Set the time (${m})`);
      await choose(page, ik, 'analog');
      m = await menuOf(page, ik);
      ok(m.startsWith('[Show] | Analog | ✓ Digital | Date only | [Clock face] | Simple (off) | Old (off) | ✓ Teaching (off) | Hour hand only (off) |') && m.includes('Mark a time (off) | Set the time') && !m.includes('Quiz'),
        `Analog off: the faces, Hour hand only, and Mark a time are off, and Quiz is gone (${m})`);
      ok(await choose(page, ik, 'digital') && (await menuOf(page, ik)).startsWith('[Show] | Analog | ✓ Digital |') && (await confOf(page, ik)).digital === true, 'unchecking the last one shown does nothing');
      await choose(page, ik, 'date');
      m = await menuOf(page, ik);
      ok(m.startsWith('[Show] | Analog | Digital | ✓ Date only | [Clock face] | Simple (off) | Old (off) | ✓ Teaching (off) |') && m.includes('LCD look (off) | Show seconds (off) | Show date (off) | 24-hour time (off)') && m.includes('Mark a time (off)'),
        `Date only turns both off; the faces, LCD, seconds, date, 24-hour, and Mark a time are off (${m})`);
      await choose(page, ik, 'analog');
      m = await menuOf(page, ik);
      ok(m.startsWith('[Show] | ✓ Analog | Digital | Date only |'), `Analog turns Date only off (${m})`);
      await choose(page, ik, 'set');
      m = await menuOf(page, ik);
      ok(m.endsWith('| Mark a time | ✓ Set the time | 5-minute steps'), `Set the time: 5-minute steps shows after it, unchecked (${m})`);
      await choose(page, ik, 'set');
      ok(!(await menuOf(page, ik)).includes('5-minute steps'), 'and goes when Set the time is unchecked');
      // Never more than 24, in every combination: what the Clock sends, before the board's own limit.
      await F(page, ik, () => { const o = Board21.menu.set.bind(Board21.menu); window.__menus = []; Board21.menu.set = items => { window.__menus.push(items.length); return o(items); }; });
      let most = 0, where = '', over = [];
      for (const show of [{ analog: true, digital: false }, { analog: false, digital: true }, { analog: true, digital: true }, { dateOnly: true }])
        for (const face of ['simple', 'old', 'teaching']) for (const set of [null, { at: 600 }]) for (const quiz of [false, true]) {
          const c = Object.assign({ analog: false, digital: false, dateOnly: false, face, led: true, seconds: true, date: true, hour24: true, words: true, upright: true, iv: true, hourOnly: true, mark: true, quiz, snap5: true }, show);
          await put(page, ik, 'data', { set, markAt: null }); await put(page, ik, 'config', c); await page.waitForTimeout(120);
          const n = await F(page, ik, () => window.__menus[window.__menus.length - 1]), board = (await page.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.length, ik));
          if (n > most) { most = n; where = JSON.stringify(show) + ' ' + face + (set ? ' set' : ''); }
          if (!(n <= 24) || board !== n) over.push(`${JSON.stringify(show)} ${face}${set ? ' set' : ''}${quiz ? ' quiz' : ''}: ${n}`);
        }
      ok(!over.length && most === 21, `never more than 24 items in any combination; the most is 21, Old with both shown while setting the time (${most}: ${where}${over.length ? '; over: ' + over.join(', ') : ''})`);
      await ctx.close();
    });

    // ---- 2. Saved settings: older ones, bad ones, and style still written.
    await part('Config', async () => {
      const { ctx, page } = await newBoard('14:50');
      const win = (i, config) => ({ widgetId: 'clock', instance: i + 1, open: true, z: i + 1, rect: { x: 20 + (i % 3) * 420, y: 20 + Math.floor(i / 3) * 330, w: 400, h: 300 }, data: null, config });
      const configs = [
        { style: 'analog', hour24: true, seconds: true, date: true },
        { style: 'digital', hour24: true, seconds: false, date: true },
        { style: 'date', hour24: false, seconds: true, date: false },
        null,
        { style: 'weird', face: 'fancy', analog: 'yes', led: 1, seconds: 'true', quiz: null, snap5: {}, mark: [], words: 'on', hour24: 'x' },
        { analog: false, digital: false, dateOnly: false, face: 'old', iv: true },
        { analog: 'yes', digital: true }
      ];
      await page.evaluate(o => window.__board21.applyImport(o, 'replace'), { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Clocks' }, instances: configs.map((c, i) => win(i, c)) });
      const iks = configs.map((c, i) => 'clock:' + (i + 1));
      ok(await eventually(async () => (await Promise.all(iks.map(ik => connected(page, ik)))).every(Boolean)), '(the seven Clocks are up)');
      await page.waitForTimeout(800);
      const [m0, m1, m2, m3, m4, m5, m6] = await Promise.all(iks.map(ik => menuOf(page, ik)));
      const [l0, l1, l2, l3, l4, l5, l6] = await Promise.all(iks.map(ik => look(page, ik)));
      ok(m0.startsWith('[Show] | ✓ Analog | Digital | Date only | [Clock face] | ✓ Simple |') && m0.includes('✓ Show seconds') && l0.analog && !l0.digital && l0.secondHand, `an older 'analog': analog only, Simple, its seconds kept (${m0})`);
      ok(m1.startsWith('[Show] | Analog | ✓ Digital | Date only |') && m1.includes('✓ 24-hour time') && m1.includes('✓ Show date') && l1.digital && !l1.analog && l1.time === '14:50' && !!l1.date, `an older 'digital': digital only, 24-hour time, the date (${m1}; ${l1.time})`);
      ok(m2.startsWith('[Show] | Analog | Digital | ✓ Date only |') && l2.dateOnly && !l2.analog && !l2.digital, `an older 'date': Date only (${m2})`);
      ok(m3 === '[Show] | ✓ Analog | Digital | Date only | [Clock face] | ✓ Simple | Old | Teaching | — | LCD look (off) | Show seconds | Show date (off) | 24-hour time (off) | Time in words | — | Mark a time | Set the time' && l3.analog && !l3.secondHand,
        `none saved: analog only, the Simple face, everything else off (${m3})`);
      ok(m4 === m3 && l4.face === 'simple', `bad values fall back, each to its own default (${m4})`);
      ok(m5.startsWith('[Show] | ✓ Analog | Digital | Date only | [Clock face] | Simple | ✓ Old | Teaching | Upright numerals | ✓ IV for four |') && l5.analog, `nothing shown: analog shows, and the rest is kept (${m5})`);
      ok(m6.startsWith('[Show] | ✓ Analog | ✓ Digital | Date only |') && l6.analog && l6.digital, `a bad Analog takes its own default, on, beside a good Digital (${m6})`);
      // style is written with every change, for a device on an older 21Board.
      const ik = iks[3], keys = 'analog,digital,dateOnly,face,led,seconds,date,hour24,words,upright,iv,hourOnly,mark,quiz,snap5,style';
      const styles = [];
      for (const id of ['digital', 'analog', 'date', 'analog']) { await choose(page, ik, id); const c = await confOf(page, ik); styles.push(c && c.style); }
      ok(styles.join() === 'digital,digital,date,analog', `style is still written: 'digital' with analog and alone, 'date', 'analog' (${styles.join()})`);
      const c = await confOf(page, ik);
      ok(!!c && Object.keys(c).sort().join() === keys.split(',').sort().join() && c.face === 'simple' && c.analog === true && c.digital === false, `the config has every key (${JSON.stringify(c)})`);
      await ctx.close();
    });

    // ---- 3. Faces.
    await part('Faces', async () => {
      const { ctx, page } = await newBoard('10:10');
      const ik = await openClock(page, 600, 600);
      // Simple: the dot in the middle is the hands' color, and red only with the red second hand.
      const hub = () => F(page, ik, () => {
        const f = s => { const e = document.querySelector('#analog ' + s); return e ? getComputedStyle(e).fill : null; };
        const sec = document.querySelector('#analog .hand-s');
        return { hub: f('.fs-hub'), sec: sec ? getComputedStyle(document.querySelector('#analog .fs-sec')).stroke : null, secShown: !!sec && getComputedStyle(sec).display !== 'none' };
      });
      const handOf = () => F(page, ik, () => getComputedStyle(document.querySelector('#analog .fs-hand')).stroke);
      let hb = await hub(), hand = await handOf();
      ok(!hb.secShown && hb.hub === hand && hb.hub !== hb.sec, `Simple without seconds: the dot in the middle matches the hands, not red (${JSON.stringify(hb)}; hands ${hand})`);
      await choose(page, ik, 'seconds');
      hb = await hub();
      ok(hb.secShown && hb.hub === hb.sec && hb.hub !== hand, `Show seconds: the dot is red, with the second hand (${JSON.stringify(hb)})`);
      await choose(page, ik, 'set');
      hb = await hub();
      ok(!hb.secShown && hb.hub === hand, `Set the time hides the second hand, and the dot matches the hands again (${JSON.stringify(hb)})`);
      await choose(page, ik, 'set'); await choose(page, ik, 'seconds');
      hb = await hub();
      ok(!hb.secShown && hb.hub === hand, `seconds off: the dot matches the hands (${JSON.stringify(hb)})`);
      await setTheme(page, 'dark');
      hb = await hub(); hand = await handOf();
      ok(!hb.secShown && hb.hub === hand && hb.hub !== hb.sec, `dark: the dot matches the light hands (${JSON.stringify(hb)}; hands ${hand})`);
      await setTheme(page, 'light');
      const nums = () => F(page, ik, () => Array.from(document.querySelectorAll('#analog .ro-num')).map(t => { const m = t.getCTM(); return [t.textContent, Math.round(((Math.atan2(m.b, m.a) * 180 / Math.PI) + 360) % 360)]; }));
      await choose(page, ik, 'face:old');
      let n = await nums();
      ok(n.map(x => x[0]).join() === 'XII,I,II,III,IIII,V,VI,VII,VIII,IX,X,XI', `the Old face writes four as IIII (${n.map(x => x[0]).join()})`);
      ok(n.length === 12 && n.every(([, a], i) => near(a, i * 30)), `its numerals turn with the dial: VI upside down (${n.map(x => x[1]).join()})`);
      await choose(page, ik, 'iv');
      n = await nums();
      ok(n[4] && n[4][0] === 'IV' && (await confOf(page, ik)).iv === true, `IV for four: IV (${n.map(x => x[0]).join()})`);
      await choose(page, ik, 'upright');
      n = await nums();
      ok(n.length === 12 && n.every(([, a]) => near(a, 0)) && (await confOf(page, ik)).upright === true, `Upright numerals: every numeral stands upright (${n.map(x => x[1]).join()})`);
      await choose(page, ik, 'face:teaching');
      const colors = () => F(page, ik, () => {
        const f = s => { const e = document.querySelector('#analog ' + s); return e ? getComputedStyle(e).fill : null; };
        const mn = Array.from(document.querySelectorAll('#analog .t-mn'));
        return { hn: f('.t-hn'), mn: f('.t-mn'), hh: f('.t-hh'), mh: f('.t-mh'), labels: mn.map(t => t.textContent).join(), top: (mn.slice().sort((a, b) => a.getAttribute('y') - b.getAttribute('y'))[0] || {}).textContent,
          hours: Array.from(document.querySelectorAll('#analog .t-hn')).map(t => t.textContent).join(), ap: (document.querySelector('#analog .t-ap') || {}).textContent };
      });
      let c = await colors();
      const ORANGE_L = 'rgb(194, 65, 12)', BLUE_L = 'rgb(0, 70, 140)', ORANGE_D = 'rgb(238, 111, 28)', BLUE_D = 'rgb(147, 210, 255)';
      ok(c.hn === ORANGE_L && c.hh === ORANGE_L && c.mn === BLUE_L && c.mh === BLUE_L, `Teaching, light: hours and the hour hand #C2410C, minutes and the minute hand #00468C (${JSON.stringify(c)})`);
      ok(c.labels === '00,05,10,15,20,25,30,35,40,45,50,55' && c.top === '00' && c.hours === '1,2,3,4,5,6,7,8,9,10,11,12' && c.ap === 'a.m.', `big hours 1 to 12, small minutes 05 to 55 with 00 at the top, and a.m. on the face (${c.labels}; top ${c.top}; ${c.ap})`);
      await setTheme(page, 'dark');
      c = await colors();
      ok(c.hn === ORANGE_D && c.hh === ORANGE_D && c.mn === BLUE_D && c.mh === BLUE_D, `dark: #EE6F1C and #93D2FF (${JSON.stringify(c)})`);
      await openSettings(page, ['bg']); await page.click('#settings [data-act="accent"][data-val="purple"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      c = await colors();
      ok(c.hn === ORANGE_D && c.mn === BLUE_D, `never the accent: the same with Purple (${c.hn}, ${c.mn})`);
      // No element or text names Judy, nor Learning Clock: in the window, in the widget, or in the docs.
      const html = await F(page, ik, () => document.documentElement.outerHTML);
      const files = ['widgets/clock/index.html', 'widgets/registry.js', 'README.md', 'docs/DATA-FORMAT.md', 'docs/WIDGET-SDK.md', 'docs/teacher-guide/page-src.html'];
      const named = files.filter(f => /judy|learning clock/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
      ok(!/judy|learning clock/i.test(html) && !named.length, `nothing says Judy or Learning Clock${named.length ? ': ' + named.join(', ') : ''}`);
      await ctx.close();
    });

    // ---- 4. The LED look.
    await part('LED', async () => {
      const { ctx, page } = await newBoard('10:10');
      const ik = await openClock(page);
      await choose(page, ik, 'digital'); await choose(page, ik, 'analog'); await choose(page, ik, 'led');
      await page.waitForTimeout(500);
      const seg = () => F(page, ik, () => {
        const off = document.querySelector('.seg-p:not(.on)'), on = document.querySelector('.seg-p.on'), svg = document.querySelector('.led-svg');
        const d = e => e && getComputedStyle(e);
        const probe = document.createElement('i'); probe.style.color = 'var(--b21-accent)'; document.body.appendChild(probe);
        const accent = getComputedStyle(probe).color; probe.remove();
        return off && on && svg ? { offOp: +d(off).opacity, onOp: +d(on).opacity, offT: d(off).transitionDuration, onT: d(on).transitionDuration, prop: d(off).transitionProperty, filter: d(svg).filter,
          u: parseFloat(d(svg).getPropertyValue('--u')) || 1, accent,
          panel: getComputedStyle(document.getElementById('dig')).backgroundColor, bg: getComputedStyle(document.body).backgroundColor } : null;
      });
      // Each drop-shadow in a filter: its color, its offset, and its blur.
      const shadows = f => Array.from(String(f).matchAll(/drop-shadow\((rgba?\(([^)]*)\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\)/g))
        .map(m => { const c = m[2].split(',').map(Number); return { rgb: c.slice(0, 3), a: c.length > 3 ? c[3] : 1, x: +m[3], y: +m[4], blur: +m[5] }; });
      const rgbIn = c => (String(c).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 80;
      let s = await seg();
      const secs = t => parseFloat(t) * (/ms$/.test(t) ? 0.001 : 1);
      ok(!!s && secs(s.onT) >= 0.1 && secs(s.onT) <= 0.2 && secs(s.offT) >= 0.1 && secs(s.offT) <= 0.2 && /opacity|all/.test(s.prop), `each segment fades on and off in about 120 to 180 ms (${s && s.onT}, ${s && s.offT})`);
      ok(!!s && s.offOp > 0.02 && s.offOp < 0.2 && s.onOp === 1, `unlit segments are faint but visible (${s && s.offOp})`);
      const sh = s ? shadows(s.filter) : [];
      ok(!!s && sh.length >= 1 && sh.every(d => d.a > 0 && d.a <= .3 && d.blur <= s.u + .01 && d.x > 0 && d.y > 0 && far(d.rgb, rgbIn(s.accent))) && s.panel !== s.bg,
        `light theme is an LCD on a tinted panel: lit segments cast a faint shadow, and nothing glows in the accent (${s && s.filter}; --u ${s && s.u}; ${s && s.panel})`);
      let m = await menuOf(page, ik);
      ok(m.includes('| ✓ LCD look |') && !m.includes('LED look'), `light theme: the menu says LCD look (${m})`);
      await setTheme(page, 'dark');
      s = await seg();
      ok(!!s && /drop-shadow/.test(s.filter) && /rgb/.test(s.filter) && !/^(drop-shadow\(rgba\(0, 0, 0, 0\)[^)]*\)\s*)+$/.test(s.filter), `dark theme is an LED with a soft glow (${s && s.filter})`);
      m = await menuOf(page, ik);
      ok(m.includes('| ✓ LED look |') && !m.includes('LCD look'), `dark theme: the menu says LED look, with the window still open (${m})`);
      await setTheme(page, 'light');
      m = await menuOf(page, ik);
      ok(m.includes('| ✓ LCD look |') && !m.includes('LED look'), `back to light: LCD look again (${m})`);
      // Auto, the menu open from the keyboard on LCD look, and the system turns dark: the keyboard stays on it.
      await setTheme(page, 'system');
      await page.focus(`.win[data-ikey="${ik}"] .win-label`); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
      const kb = () => page.evaluate(() => { const a = document.activeElement, l = document.querySelector('#menu [data-id="led"] .label');
        return { open: !!document.querySelector('#menu.open'), inMenu: !!a.closest('#menu'), id: a.dataset.id || a.dataset.act || a.tagName, label: l && l.textContent }; });
      for (let i = 0; i < 12 && (await kb()).id !== 'led'; i++) await page.keyboard.press('ArrowDown');
      const k0 = await kb();
      await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(500);
      const k1 = await kb();
      await page.keyboard.press('ArrowDown'); const k2 = await kb();
      ok(k0.id === 'led' && k0.label === 'LCD look' && k1.open && k1.inMenu && k1.id === 'led' && k1.label === 'LED look' && k2.id === 'seconds',
        `the theme changes with the menu open: the label follows, and the keyboard stays on it, so ↓ goes on to Show seconds (${JSON.stringify([k0, k1, k2])})`);
      await page.keyboard.press('Escape'); await page.emulateMedia({ colorScheme: 'light' });
      await setTheme(page, 'dark');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(200);
      s = await seg();
      ok(!!s && secs(s.onT) === 0 && secs(s.offT) === 0, `reduced motion: no fades (${s && s.onT}, ${s && s.offT})`);
      await ctx.close();
    });

    // ---- 5. Analog and digital together: the window's shape decides.
    await part('Together', async () => {
      const { ctx, page } = await newBoard('10:10');
      const ik = await openClock(page);
      ok(await ratioOf(page, ik) === 1, 'analog alone: 1:1');
      await choose(page, ik, 'words');
      const rw = await ratioOf(page, ik);
      ok(rw > 0.8 && rw < 0.95, `with Time in words, room for the line below (${rw})`);
      await choose(page, ik, 'words');
      await choose(page, ik, 'digital');
      ok(await ratioOf(page, ik) === null, `both: no shape lock (${await ratioOf(page, ik)})`);
      const layoutAt = async (w, h) => { await size(page, ik, w, h); await page.waitForTimeout(500); return look(page, ik); };
      const side = l => !!l.ana && !!l.dig && l.ana.r <= l.dig.x + 1, stacked = l => !!l.ana && !!l.dig && l.ana.b <= l.dig.y + 1;
      const out = [];
      for (const [w, h, want] of [[420, 400, 'side'], [400, 420, 'stacked'], [700, 300, 'side'], [300, 700, 'stacked'], [401, 400, 'side'], [400, 401, 'stacked']]) {
        const l = await layoutAt(w, h);
        const got = side(l) ? 'side' : stacked(l) ? 'stacked' : 'neither';
        if (got !== want || l.W !== w || l.H !== h) out.push(`${w} × ${h}: ${got} in ${l.W} × ${l.H}`);
      }
      ok(!out.length, `side by side when wider than tall, analog on top otherwise, across square, and the window keeps any shape${out.length ? ': ' + out.join('; ') : ''}`);
      await choose(page, ik, 'analog');
      ok(await ratioOf(page, ik) === 2.2, `digital alone: 2.2:1 (${await ratioOf(page, ik)})`);
      await choose(page, ik, 'date');
      ok(await ratioOf(page, ik) === 2.2, `Date only: 2.2:1 (${await ratioOf(page, ik)})`);
      await ctx.close();
    });

    // ---- 6. Set the time.
    await part('Set the time', async () => {
      const { ctx, page } = await newBoard('14:50');
      const ik = await openClock(page, 600, 600);
      await choose(page, ik, 'face:teaching');
      await choose(page, ik, 'set');
      let l = await look(page, ik), d = await dataOf(page, ik);
      ok(JSON.stringify(d) === '{"set":{"at":890},"markAt":null}' && l.badge === 'Set' && l.now === 'Now' && l.settable, `Set the time: the Set badge, Now, and grab dots; the time is saved in the content (${JSON.stringify(d)})`);
      ok(l.label === 'Set the time. Drag a hand or use the arrow keys.' && l.valuetext === '2:50 p.m.' && l.valuenow === '890' && l.valuemin === '0' && l.valuemax === '1439',
        `a screen reader hears “${l.label}” and “${l.valuetext}”, a slider from 0 to 1439 at 890 (${l.valuemin}, ${l.valuemax}, ${l.valuenow})`);
      const c0 = await confOf(page, ik);
      ok(!(c0 && c0.snap5) && (await menuOf(page, ik)).endsWith('| ✓ Set the time | 5-minute steps'), '5-minute steps is off by default');
      // The minute hand past 12 carries the hour: 2:50 → 3:10.
      await dragFace(page, ik, 300, 420, 70);
      d = await dataOf(page, ik); l = await look(page, ik);
      ok(d && d.set && d.set.at === 910 && near(l.m, 60) && near(l.h, 95), `dragging the minute hand past 12 moves the hour on: 3:10 (${JSON.stringify(d)}; hands ${l.h}°, ${l.m}°)`);
      await dragFace(page, ik, 420, 300, 70);
      d = await dataOf(page, ik);
      ok(d && d.set && d.set.at === 890, `and back past 12, the hour back: 2:50 (${JSON.stringify(d)})`);
      await dragFace(page, ik, 300, 420, 70);
      // The hour hand turns the minute hand too: 3:10 → 3:40.
      await dragFace(page, ik, 95, 110, 35);
      d = await dataOf(page, ik); l = await look(page, ik);
      ok(d && d.set && d.set.at === 940 && near(l.m, 240) && near(l.h, 110), `dragging the hour hand moves the minute hand: 3:40 (${JSON.stringify(d)}; hands ${l.h}°, ${l.m}°)`);
      // A press without moving changes nothing.
      for (const [deg, r] of [[240, 70], [110, 35], [0, 50], [180, 90]]) await pressFace(page, ik, deg, r);
      d = await dataOf(page, ik); l = await look(page, ik);
      ok(d && d.set && d.set.at === 940 && near(l.m, 240), `a press on a hand or the face, without moving, changes nothing (${JSON.stringify(d)})`);
      // Single minutes, then steps of five.
      await dragFace(page, ik, 240, 282, 70);
      d = await dataOf(page, ik);
      ok(d && d.set && d.set.at === 947, `a drag lands on single minutes: 3:47 (${JSON.stringify(d)})`);
      await choose(page, ik, 'snap5');
      await dragFace(page, ik, 282, 324, 70);
      d = await dataOf(page, ik);
      ok(d && d.set && d.set.at % 5 === 0 && Math.abs(d.set.at - 954) <= 3 && (await confOf(page, ik)).snap5 === true, `with 5-minute steps, on a multiple of five (${JSON.stringify(d)})`);
      // The arrow keys on the face.
      await frameL(page, ik).locator('#analog').focus();
      await page.keyboard.press('ArrowUp'); await page.waitForTimeout(500);
      const k1 = (await dataOf(page, ik)).set.at;
      await page.keyboard.press('PageDown'); await page.waitForTimeout(600);
      const k2 = (await dataOf(page, ik)).set.at;
      ok(k1 === Math.floor(d.set.at / 5) * 5 + 5 && k2 === k1 - 60, `the arrow keys: ▲ a step, Page Down an hour back (${d.set.at} → ${k1} → ${k2})`);
      await choose(page, ik, 'snap5');
      // ▲ and ▼ carry, wrap, and flip a.m. and p.m., and the arrows never move.
      await choose(page, ik, 'digital');
      await size(page, ik, 760, 420); await page.waitForTimeout(500);
      const arrow = async k => { await frameL(page, ik).locator(`#dig .arrow[data-k="${k}"]`).click(); await page.waitForTimeout(600); const v = await look(page, ik); return [(await dataOf(page, ik)).set.at, v.time]; };
      await put(page, ik, 'data', { set: { at: 719 }, markAt: null }); await page.waitForTimeout(400);
      const steps = [await arrow('mu'), await arrow('hd')];
      await put(page, ik, 'data', { set: { at: 0 }, markAt: null }); await page.waitForTimeout(400);
      steps.push(await arrow('md'), await arrow('mu'), await arrow('hu'));
      ok(JSON.stringify(steps) === JSON.stringify([[720, '12:00p.m.'], [660, '11:00a.m.'], [1439, '11:59p.m.'], [0, '12:00a.m.'], [60, '1:00a.m.']]),
        `▲ and ▼: 11:59 a.m. ▲ 12:00 p.m., ▼ hour 11:00 a.m.; 12:00 a.m. ▼ 11:59 p.m., ▲ 12:00 a.m., ▲ hour 1:00 a.m. (${JSON.stringify(steps)})`);
      const at = async () => (await look(page, ik)).arrows.map(a => `${a.k}@${Math.round(a.x)},${Math.round(a.y)}`).join(' ');
      await put(page, ik, 'data', { set: { at: 590 }, markAt: null }); await page.waitForTimeout(500);
      const a0 = await at(); await arrow('hu'); const a1 = await at(); await arrow('hu'); await arrow('hu'); const a2 = await at();
      l = await look(page, ik);
      ok(a0.split(' ').length === 4 && a0 === a1 && a1 === a2 && l.arrows.every(a => a.w >= 44 && a.h >= 44), `the arrows never move: 9:50, 10:50, and 12:50 p.m. (${a0} | ${a1} | ${a2})`);
      const ar = k => l.arrows.find(a => a.k === k) || { y: NaN };
      ok(Math.abs(ar('hu').y - ar('mu').y) < 1 && Math.abs(ar('hd').y - ar('md').y) < 1, `the hour and minute arrows line up: ▲ with ▲, ▼ with ▼ (${a2})`);
      // Saved with the board: it's still set after a reload.
      const before = await dataOf(page, ik);
      await page.reload(); await boardUp(page); await connected(page, ik); await page.waitForTimeout(1200);
      l = await look(page, ik);
      ok(JSON.stringify(await dataOf(page, ik)) === JSON.stringify(before) && l.badge === 'Set' && l.time === '12:50p.m.' && near(l.m, 300), `the set time survives a reload (${JSON.stringify(before)}; ${l.time})`);
      // Now: back to the real time, still setting it.
      await frameL(page, ik).locator('#now').click(); await page.waitForTimeout(1200);
      l = await look(page, ik); d = await dataOf(page, ik);
      ok(JSON.stringify(d) === '{"set":{"at":null},"markAt":null}' && l.badge === 'Set' && l.now === 'Now' && l.settable && l.time === '2:50p.m.' && near(l.m, 300), `Now: the real time, and still setting it (${JSON.stringify(d)}; ${l.time}; ${l.badge})`);
      await page.clock.setFixedTime(AT('14:53'));
      ok(await eventually(async () => { const v = await look(page, ik); return v.time === '2:53p.m.' && near(v.m, 318); }, 3000), `and it keeps time: 2:53 (${(await look(page, ik)).time})`);
      ok((await menuOf(page, ik)).endsWith('| ✓ Set the time | 5-minute steps') && (await look(page, ik)).arrows.length === 4, 'the menu still says Set the time, and the arrows stay');
      // The next drag sets a time again.
      await dragFace(page, ik, 318, 378, 70);
      d = await dataOf(page, ik);
      ok(d && d.set && d.set.at === 903, `the next drag sets a time again: 3:03 (${JSON.stringify(d)})`);
      // Only Set the time ends it.
      await choose(page, ik, 'set');
      l = await look(page, ik); d = await dataOf(page, ik);
      ok(d && d.set === null && !l.badge && !l.now && !l.settable && l.arrows.length === 0 && l.time === '2:53p.m.' && !(await menuOf(page, ik)).includes('5-minute steps'),
        `unchecking Set the time ends it: the real time, no badge, no Now (${JSON.stringify(d)}; ${l.time})`);
      // At the window's default size, Now is finger-sized and the dial stays clear of it and of the badge.
      await choose(page, ik, 'digital');
      await page.evaluate(ik => window.__board21.setRect(ik, { x: 40, y: 40, w: 300, h: 340 }), ik); await page.waitForTimeout(400);
      await choose(page, ik, 'set'); await page.waitForTimeout(400);
      l = await look(page, ik);
      const clear = (b, f) => { const cx = f.x + f.w / 2, cy = f.y + f.h / 2, R = f.w / 2 * 0.965; return Math.hypot(Math.max(b.x - cx, 0, cx - b.r), Math.max(b.y - cy, 0, cy - b.b)) >= R; };
      ok(l.W === 300 && l.nowBox && l.nowBox.h >= 44 && l.nowBox.w >= 44 && clear(l.nowBox, l.ana) && clear(l.badgeBox, l.ana), `at 300 × 300, Now is at least 44 px and the dial is clear of it and of the badge (${JSON.stringify(l.nowBox)}; dial ${JSON.stringify(l.ana)})`);
      await ctx.close();
    });

    // ---- 7. Mark a time.
    await part('Mark a time', async () => {
      const { ctx, page } = await newBoard('10:00');
      const ik = await openClock(page, 600, 600);
      ok(await choose(page, ik, 'mark') && (await confOf(page, ik)).mark === true, 'Mark a time is saved with the Clock');
      await tapFace(page, ik, 90, 60);
      let d = await dataOf(page, ik), wd = await wedgeOf(page, ik);
      ok(d && d.markAt === ms('10:15') && wedgeIs(wd, 0, 90), `a tap at the 3 marks 10:15, and the wedge runs from the minute hand to it (${JSON.stringify(d)}; ${said(wd)})`);
      await page.clock.setFixedTime(AT('10:05')); await page.waitForTimeout(600);
      wd = await wedgeOf(page, ik);
      ok(wedgeIs(wd, 30, 60), `at 10:05 it has shrunk to 10 minutes (${said(wd)})`);
      await page.clock.setFixedTime(AT('10:16')); await page.waitForTimeout(600);
      wd = await wedgeOf(page, ik);
      ok(!!wd && !wd.shown, `after the mark it's gone (${said(wd)})`);
      const order = await F(page, ik, () => { const w = document.querySelector('#analog .mk-w'), n = document.querySelector('#analog .fs-num'), h = document.querySelector('#analog .hand-h'); return !!w && !!n && !!h && !!(w.compareDocumentPosition(n) & 4) && !!(w.compareDocumentPosition(h) & 4); });
      ok(order, 'the wedge is drawn under the numerals and the hands');
      // Following timers.
      await page.clock.setFixedTime(AT('10:20')); await page.waitForTimeout(300);
      await tapFace(page, ik, 270, 60);
      ok((await dataOf(page, ik)).markAt === ms('10:45'), 'the teacher marks 10:45');
      const T1 = await addWin(page, 'timer'); await connected(page, T1);
      await page.evaluate(T1 => window.__board21.setRect(T1, { x: 700, y: 40, w: 380, h: 300 }), T1);
      const setTimer = (ik, s) => page.evaluate(async ([ik, s]) => { const w = window.__board21.state.wins.get(ik); await w.iframe.contentWindow.Board21.save(s); w.post('data', { data: s, reason: 'remote' }); }, [ik, s]);
      await setTimer(T1, { duration: 600000, remaining: 600000, endsAt: ms('10:28') });
      ok(await eventually(async () => wedgeIs(await wedgeOf(page, ik), 120, 48)), `a Timer running to 10:28: the wedge ends at its end (${said(await wedgeOf(page, ik))})`);
      wd = await wedgeOf(page, ik);
      ok(!!wd.warn && Math.abs(wd.warn.span - 6) <= 1 && wd.warn.fill === wd.amber && !!wd.w && Math.abs(wd.w.span - 42) <= 1, `its last minute, its warning, is in the warning color (${said(wd)}; ${wd.warn && wd.warn.fill} vs ${wd.amber})`);
      const T2 = await addWin(page, 'timer'); await connected(page, T2);
      await page.evaluate(T2 => window.__board21.setRect(T2, { x: 700, y: 380, w: 380, h: 300 }), T2);
      await setTimer(T2, { duration: 300000, remaining: 300000, endsAt: ms('10:23') });
      ok(await eventually(async () => wedgeIs(await wedgeOf(page, ik), 120, 18)), `two Timers: it follows the one that ends soonest (${said(await wedgeOf(page, ik))})`);
      await page.evaluate(T2 => window.__board21.closeWin(T2, { quiet: true }), T2);
      await setTimer(T1, { duration: 600000, remaining: 300000, endsAt: null });
      ok(await eventually(async () => wedgeIs(await wedgeOf(page, ik), 120, 150)), `a paused Timer draws nothing: the teacher's mark is back (${said(await wedgeOf(page, ik))})`);
      await setTimer(T1, { duration: 600000, remaining: 600000, endsAt: ms('10:22') });
      ok(await eventually(async () => wedgeIs(await wedgeOf(page, ik), 120, 12)), 'running again: followed');
      await page.clock.setFixedTime(AT('10:23'));
      ok(await eventually(async () => wedgeIs(await wedgeOf(page, ik), 138, 132)), `when it ends, the teacher's mark shows again (${said(await wedgeOf(page, ik))})`);
      // Set mode with a set time: from it to the teacher's mark; timers aren't followed.
      await setTimer(T1, { duration: 600000, remaining: 600000, endsAt: ms('10:28') });
      ok(await eventually(async () => wedgeIs(await wedgeOf(page, ik), 138, 30)), '(the Timer runs to 10:28)');
      await choose(page, ik, 'set');
      await frameL(page, ik).locator('#analog').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(500);
      wd = await wedgeOf(page, ik);
      ok((await dataOf(page, ik)).set.at === 624 && wedgeIs(wd, 144, 126), `a set time, 10:24: from it to the mark, not to the Timer (${said(wd)})`);
      await frameL(page, ik).locator('#now').click(); await page.waitForTimeout(1200);
      ok(await eventually(async () => wedgeIs(await wedgeOf(page, ik), 138, 30)), `after Now, the real time: the Timer again (${said(await wedgeOf(page, ik))})`);
      await choose(page, ik, 'set');
      // Longer than an hour: the whole ring.
      await setTimer(T1, { duration: 864e5 / 4, remaining: 864e5 / 4, endsAt: ms('12:00') });
      ok(await eventually(async () => { const w = await wedgeOf(page, ik); return !!w && w.full; }), `more than an hour away: the whole ring (${said(await wedgeOf(page, ik))})`);
      // No analog face, no wedge.
      await choose(page, ik, 'digital'); await choose(page, ik, 'analog');
      ok((await menuOf(page, ik)).includes('✓ Mark a time (off)'), 'digital alone: Mark a time stays in the menu, off');
      await ctx.close();
    });

    // ---- 7b. A 21Timer in the list works the same way.
    await part('Mark a time: 21Timer', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'America/Chicago', locale: 'en-US' });
      await ctx.route(/^https?:\/\/([^/]*\.)?ccsd21\.org(:\d+)?\//, route => {
        const u = new URL(route.request().url());
        if (u.origin === 'https://timerapp.ccsd21.org' && u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>21Timer stand-in</title><body>21Timer stand-in<script>window.__up = 1;</script></body>' });
        return route.fulfill({ status: 404, body: '' });
      });
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.clock.setFixedTime(AT('10:20'));
      await page.goto(BASE); await boardUp(page); await freeBoard(page);
      const ik = await openClock(page, 500, 500);
      await choose(page, ik, 'mark');
      await page.evaluate(() => window.__board21.openWidget('21timer'));
      await page.evaluate(() => window.__board21.setRect('21timer:1', { x: 600, y: 40, w: 420, h: 330 }));
      const app = () => page.frames().find(f => f.url() === 'https://timerapp.ccsd21.org/');
      ok(await eventually(async () => !!app() && await app().evaluate(() => window.__up === 1)), '(the 21Timer stand-in is up)');
      const send = m => app().evaluate(m => parent.postMessage(m, '*'), Object.assign({ type: '21timer:status', version: 1, state: 'running', endsAt: null, remaining: null, warnMs: 60000 }, m));
      await send({ endsAt: ms('10:24') });
      ok(await eventually(async () => { const w = await wedgeOf(page, ik); return wedgeIs(w, 120, 24) && !!w.warn && Math.abs(w.warn.span - 6) <= 1; }), `21Timer running to 10:24: the wedge ends there, its last minute in the warning color (${said(await wedgeOf(page, ik))})`);
      await send({ state: 'paused', remaining: 120000 });
      ok(await eventually(async () => { const w = await wedgeOf(page, ik); return !!w && !w.shown; }), `paused: no wedge (${said(await wedgeOf(page, ik))})`);
      await ctx.close();
    });

    // ---- 7c. A mark tapped on a set time belongs to that set time.
    await part('Mark a time: on a set time', async () => {
      const { ctx, page } = await newBoard('09:00');
      const ik = await openClock(page, 600, 600);
      await choose(page, ik, 'mark'); await choose(page, ik, 'set');
      await put(page, ik, 'data', { set: { at: 890 }, markAt: null }); await page.waitForTimeout(500);
      await tapFace(page, ik, 60, 60);   // the 10, with the clock set to 2:50 p.m.
      let d = await dataOf(page, ik), wd = await wedgeOf(page, ik);
      ok(!!d && !!d.set && d.set.at === 890 && d.set.mark === 910 && d.markAt === null && wedgeIs(wd, 300, 120),
        `a tap on a set time marks the set time's 3:10, kept with it: the wedge runs 2:50 to 3:10 (${JSON.stringify(d)}; ${said(wd)})`);
      await frameL(page, ik).locator('#analog').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(500);
      d = await dataOf(page, ik); wd = await wedgeOf(page, ik);
      ok(d.set.at === 891 && d.set.mark === 910 && wedgeIs(wd, 306, 114), `a new set time keeps the mark, and the wedge shrinks (${JSON.stringify(d)}; ${said(wd)})`);
      await choose(page, ik, 'set');
      d = await dataOf(page, ik); wd = await wedgeOf(page, ik);
      ok(!!d && d.set === null && d.markAt === null && !!wd && !wd.shown, `unchecking Set the time: the real 9:00 with no wedge (${JSON.stringify(d)}; ${said(wd)})`);
      // A mark from an earlier day has passed, and a set time doesn't bring it back.
      await choose(page, ik, 'set');
      await put(page, ik, 'data', { set: { at: 600 }, markAt: ms('10:15') - 864e5 }); await page.waitForTimeout(500);
      wd = await wedgeOf(page, ik);
      ok(!!wd && !wd.shown, `yesterday's 10:15 mark, with the clock set to 10:00: no wedge (${said(wd)})`);
      // A mark on the real time still to come shows on a set time, until the set time gets its own. Now drops that one.
      await put(page, ik, 'data', { set: { at: 600 }, markAt: ms('10:15') }); await page.waitForTimeout(500);
      wd = await wedgeOf(page, ik);
      ok(wedgeIs(wd, 0, 90), `today's 10:15 mark, still to come, with the clock set to 10:00: 15 minutes (${said(wd)})`);
      await tapFace(page, ik, 180, 60);
      d = await dataOf(page, ik); wd = await wedgeOf(page, ik);
      ok(d.set.mark === 630 && d.markAt === ms('10:15') && wedgeIs(wd, 0, 180), `a tap on the 6 marks the set time's 10:30 and leaves today's mark (${JSON.stringify(d)}; ${said(wd)})`);
      await frameL(page, ik).locator('#now').click(); await page.waitForTimeout(1200);
      d = await dataOf(page, ik); wd = await wedgeOf(page, ik);
      ok(JSON.stringify(d.set) === '{"at":null}' && d.markAt === ms('10:15') && !!wd && wd.full, `Now drops the set time's mark; today's, 75 minutes away, fills the ring (${JSON.stringify(d)}; ${said(wd)})`);
      await put(page, ik, 'data', { set: { at: 600, mark: 2000 }, markAt: null }); await page.waitForTimeout(400);
      wd = await wedgeOf(page, ik);
      ok(!!wd && !wd.shown, `a bad mark reads as none (${said(wd)})`);
      await ctx.close();
    });

    // ---- 7d. The line at the end of the wedge stays clear of the hour numbers, so it never looks like a hand.
    await part('Mark a time: the line at its end', async () => {
      const { ctx, page } = await newBoard('10:00');
      const ik = await openClock(page, 600, 600);
      await choose(page, ik, 'mark');
      await tapFace(page, ik, 90, 60);   // 10:15, so there's a wedge and a line
      const out = [];
      for (const face of ['simple', 'old', 'old upright', 'teaching']) {
        if (face === 'old upright') await choose(page, ik, 'upright');
        else if (face !== 'simple') await choose(page, ik, 'face:' + face);
        await page.waitForTimeout(300);
        // The line, swept round the dial in 1° steps, against each hour number's ink (measured on a canvas in the same
        // font, so the empty room in a line of text doesn't count).
        const hits = await F(page, ik, () => {
          const svg = document.querySelector('#analog'), e = svg.querySelector('.mk-edge');
          if (!e || getComputedStyle(e).display === 'none') return ['no line'];
          const a = k => +e.getAttribute(k), sw = parseFloat(getComputedStyle(e).strokeWidth) || 0;
          const r1 = Math.hypot(a('x1') - 100, a('y1') - 100) - sw / 2, r2 = Math.hypot(a('x2') - 100, a('y2') - 100) + sw / 2;
          const cv = document.createElement('canvas').getContext('2d');
          cv.textAlign = 'center'; cv.textBaseline = 'middle';
          const nums = Array.from(svg.querySelectorAll('.fs-num, .ro-num, .t-hn')).map(t => {
            const cs = getComputedStyle(t);
            cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            cv.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
            const m = cv.measureText(t.textContent), x = +t.getAttribute('x'), y = +t.getAttribute('y');
            const tf = t.transform.baseVal.consolidate();
            return { t: t.textContent, x0: x - m.actualBoundingBoxLeft, x1: x + m.actualBoundingBoxRight, y0: y - m.actualBoundingBoxAscent, y1: y + m.actualBoundingBoxDescent, inv: tf ? tf.matrix.inverse() : null };
          });
          const out = new Set();
          for (let deg = 0; deg < 360; deg++) {
            const s = Math.sin(deg * Math.PI / 180), c = Math.cos(deg * Math.PI / 180);
            for (let r = r1; r <= r2; r += .5) for (const o of [-sw / 2, 0, sw / 2]) {
              const X = 100 + r * s + o * c, Y = 100 - r * c + o * s;
              for (const n of nums) {
                const q = n.inv ? new DOMPoint(X, Y).matrixTransform(n.inv) : { x: X, y: Y };
                if (q.x > n.x0 && q.x < n.x1 && q.y > n.y0 && q.y < n.y1) out.add(`${n.t} at ${deg}°`);
              }
            }
          }
          return Array.from(out);
        });
        if (hits.length) out.push(`${face}: ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? ` and ${hits.length - 5} more` : ''}`);
      }
      ok(!out.length, `on every face, and with Upright numerals, the line at the wedge's end never touches an hour number${out.length ? ': ' + out.join('; ') : ''}`);
      await ctx.close();
    });

    // ---- 7e. Setting the time with the LED look, side by side: the panel stays clear of Now.
    await part('Set the time with the LED look', async () => {
      const { ctx, page } = await newBoard('14:50');
      const ik = await openClock(page);
      await choose(page, ik, 'digital'); await choose(page, ik, 'led'); await choose(page, ik, 'set');
      const out = [], seen = [];
      for (const [w, h, words] of [[700, 300, false], [360, 220, false], [360, 250, true], [1300, 760, false]]) {
        if (words !== !!(await confOf(page, ik)).words) await choose(page, ik, 'words');
        await size(page, ik, w, h); await page.waitForTimeout(700);
        const g = await F(page, ik, () => {
          const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };
          return { W: innerWidth, H: innerHeight, dig: box(document.getElementById('dig')), now: box(document.getElementById('now')), svg: box(document.querySelector('.led-svg')),
            wide: document.getElementById('clock').classList.contains('wide'), arrows: Array.from(document.querySelectorAll('#dig .arrow')).filter(b => b.offsetWidth).length };
        });
        const onPanel = !(g.now.r <= g.dig.x || g.now.x >= g.dig.r || g.now.b <= g.dig.y || g.now.y >= g.dig.b);
        const off = Math.abs((g.svg.x + g.svg.r) / 2 - (g.dig.x + g.dig.r) / 2);
        seen.push(`${w} × ${h}${words ? ' with words' : ''}: panel ${g.dig.y} to ${g.dig.b}, Now to ${g.now.b}`);
        if (g.W !== w || g.H !== h || !g.wide || onPanel || off > 3 || g.dig.b > g.H || g.arrows !== 4)
          out.push(`${w} × ${h}${words ? ' with words' : ''} in ${g.W} × ${g.H}: ${onPanel ? 'Now sits on the panel; ' : ''}${off > 3 ? `the digits are ${Math.round(off)} px off centre; ` : ''}${g.arrows} arrows (panel ${JSON.stringify(g.dig)}, Now ${JSON.stringify(g.now)})`);
      }
      ok(!out.length, `side by side, the LED panel starts below Now, and its digits stay centred (${out.length ? out.join('; ') : seen.join('; ')})`);
      await ctx.close();
    });

    // ---- 8. Quiz.
    await part('Quiz', async () => {
      const { ctx, page } = await newBoard('14:50');
      const ik = await openClock(page, 700, 360);
      ok(!(await menuOf(page, ik)).includes('Quiz'), 'analog alone: no Quiz');
      await choose(page, ik, 'digital'); await size(page, ik, 700, 360); await page.waitForTimeout(400);
      ok(await choose(page, ik, 'quiz') && (await confOf(page, ik)).quiz === true, 'Quiz, with both shown');
      let l = await look(page, ik);
      ok(l.q === '?' && l.time === null && l.analog, `the digital clock shows ? (${l.q}, ${l.time})`);
      const tapDigital = async () => { await frameL(page, ik).locator('#readout').click(); await page.waitForTimeout(350); return look(page, ik); };
      l = await tapDigital();
      ok(l.q === null && l.time === '2:50PM', `a tap shows the time (${l.time})`);
      l = await tapDigital();
      ok(l.q === '?' && l.time === null, 'another tap flips it back to ?');
      // On a keyboard: one button in both states, so focus stays on it, and a screen reader hears each label.
      const keys = () => F(page, ik, () => {
        const r = document.getElementById('readout'), q = document.getElementById('q'), a = document.activeElement;
        return { focus: a && a.id, role: r.getAttribute('role'), tab: r.tabIndex, label: r.getAttribute('aria-label'),
          qQuiet: q.getAttribute('aria-hidden') === 'true' && !q.hasAttribute('tabindex') && !q.hasAttribute('role') };
      });
      await frameL(page, ik).locator('#readout').focus();
      let k = await keys();
      ok(k.focus === 'readout' && k.role === 'button' && k.tab === 0 && k.label === 'Show the time' && k.qQuiet, `the keyboard reaches it: a button, “${k.label}” (${JSON.stringify(k)})`);
      await page.keyboard.press('Enter'); await page.waitForTimeout(300);
      l = await look(page, ik); k = await keys();
      ok(l.time === '2:50PM' && k.focus === 'readout' && k.label === 'Hide the time', `Enter shows the time, focus stays, and it says “${k.label}” (${l.time}; ${JSON.stringify(k)})`);
      await page.keyboard.press('Enter'); await page.waitForTimeout(300);
      l = await look(page, ik); k = await keys();
      ok(l.q === '?' && l.time === null && k.focus === 'readout' && k.label === 'Show the time', `Enter again: ? again, “${k.label}” (${JSON.stringify(k)})`);
      await page.keyboard.press('Space'); await page.waitForTimeout(300);
      const sp = (await look(page, ik)).time;
      await page.keyboard.press('Space'); await page.waitForTimeout(300);
      ok(sp === '2:50PM' && (await look(page, ik)).q === '?', `Space flips it too (${sp})`);
      await choose(page, ik, 'words'); await page.waitForTimeout(300);
      l = await look(page, ik);
      ok(l.q === '?' && l.words === null, `Time in words is hidden while it shows ? (${l.words})`);
      l = await tapDigital();
      ok(l.time === '2:50PM' && l.words === 'ten to three', `and shows with the time (${l.words})`);
      // A new set time asks again, so the hands never give the answer away.
      await choose(page, ik, 'set'); await page.waitForTimeout(300);
      l = await look(page, ik);
      ok(l.time === '2:50PM', 'Set the time alone sets no new time: still shown');
      await frameL(page, ik).locator('#dig .arrow[data-k="mu"]').click(); await page.waitForTimeout(500);
      l = await look(page, ik);
      ok(l.q === '?' && l.words === null, `▲ sets a new time: ? again (${l.q})`);
      l = await tapDigital();
      ok(l.time === '2:51PM', `(shown: ${l.time})`);
      await dragFace(page, ik, 306, 330, 70);
      l = await look(page, ik);
      ok(l.q === '?', `dragging the hands: ? again (${l.q})`);
      // Never saved.
      await tapDigital();
      const d = await dataOf(page, ik), c = await confOf(page, ik);
      ok(d && Object.keys(d).sort().join() === 'markAt,set' && !('revealed' in c) && Object.keys(c).length === 16, `whether it shows ? is never saved (${JSON.stringify(d)})`);
      await page.reload(); await boardUp(page); await connected(page, ik); await page.waitForTimeout(1200);
      l = await look(page, ik);
      ok(l.q === '?', `after a reload: ? (${l.q})`);
      await choose(page, ik, 'analog');
      l = await look(page, ik); k = await keys();
      ok(l.q === null && !!l.time && !(await menuOf(page, ik)).includes('Quiz') && !k.role && k.tab === -1 && !k.label, `digital alone: no Quiz, the time shows, and it's no button (${l.time}; ${JSON.stringify(k)})`);
      await ctx.close();
    });

    // ---- 9. Hour hand only, and Time in words.
    await part('Hour hand only and Time in words', async () => {
      const { ctx, page } = await newBoard('10:15');
      const ik = await openClock(page, 500, 500);
      ok(!(await menuOf(page, ik)).includes('Hour hand only'), 'Simple: no Hour hand only');
      await choose(page, ik, 'face:teaching');
      ok(await choose(page, ik, 'hourOnly') && (await confOf(page, ik)).hourOnly === true, 'Teaching: Hour hand only');
      let l = await look(page, ik);
      const minutes = await F(page, ik, () => Array.from(document.querySelectorAll('#analog .t-mn')).filter(t => getComputedStyle(t).display !== 'none').length);
      ok(!l.minuteHand && minutes === 12 && l.analog, `the minute hand is hidden; the minute numbers stay (${minutes})`);
      await choose(page, ik, 'face:simple');
      l = await look(page, ik);
      ok(l.minuteHand && !(await menuOf(page, ik)).includes('Hour hand only'), 'another face: the minute hand is back');
      await choose(page, ik, 'words'); await page.waitForTimeout(300);
      l = await look(page, ik);
      ok(l.words === 'quarter past ten', `Time in words: “${l.words}” at 10:15`);
      await choose(page, ik, 'set');
      const wordsAt = async at => { await put(page, ik, 'data', { set: { at }, markAt: null }); await page.waitForTimeout(400); return (await look(page, ik)).words; };
      const want = [[615, 'quarter past ten'], [720, 'noon'], [0, 'midnight'], [334, 'twenty-six minutes to six'], [585, 'quarter to ten'], [1022, 'two minutes past five'], [781, 'one minute past one']];
      const got = [];
      for (const [at] of want) got.push(await wordsAt(at));
      ok(JSON.stringify(got) === JSON.stringify(want.map(w => w[1])), `10:15, noon, midnight, 5:34, 9:45, 5:02, and 1:01 (${got.join(' | ')})`);
      await choose(page, ik, 'digital'); await choose(page, ik, 'analog');
      ok(await wordsAt(334) === 'twenty-six minutes to six', 'digital too');
      await choose(page, ik, 'set');
      await choose(page, ik, 'date');
      l = await look(page, ik);
      ok(l.dateOnly && l.words === null, 'Date only: no words');
      await ctx.close();
    });

    // ---- 10. Board history: a set Clock says so, briefly.
    await part('Board history', async () => {
      const { ctx, page } = await newBoard('10:15');
      const lines = await page.evaluate(() => [{ set: { at: 890 }, markAt: null }, { set: { at: 0 }, markAt: null }, { set: { at: null }, markAt: null }, { set: null, markAt: 5 }, { set: { at: 2000 } }, { set: { at: 890, mark: 910 }, markAt: null }].map(d => window.__board21.history.excerptOf(d, 'clock')));
      ok(JSON.stringify(lines) === JSON.stringify(['Set to 2:50 p.m.', 'Set to 12:00 a.m.', '', '', '', 'Set to 2:50 p.m.']), `a set time's line: “Set to 2:50 p.m.”, with its mark too; nothing otherwise (${JSON.stringify(lines)})`);
      await ctx.close();
    });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ];
};
