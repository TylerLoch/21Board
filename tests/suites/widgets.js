// Notes, Dice, First/Then Board, Standards picks, and the district apps.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, freeBoard, openSettings, setTheme, driveDevice, linkFolder, addWin, heard, eventually,
    release, stamped, STAMPED, boardUp, contrast, BASE
  } = T;
  return [
  ['Dice roll and Reset icon', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage(), page2 = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page2.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('dice')); await page.waitForTimeout(1200);
    await page2.goto(BASE); await page2.waitForTimeout(1500); await freeBoard(page2);
    const dice = page.frameLocator('.win[data-ikey="dice:1"] iframe'), dice2 = page2.frameLocator('.win[data-ikey="dice:1"] iframe');
    const look = f => f.locator('html').evaluate(() => ({ pips: document.querySelectorAll('.die circle').length, n: document.querySelectorAll('.die').length,
      labels: [...document.querySelectorAll('.die')].map(d => d.getAttribute('aria-label')).join(','), total: getComputedStyle(document.getElementById('total')).visibility }));
    await dice.locator('#roll').click();
    await page.waitForTimeout(250);
    let a = await look(dice), b = await look(dice2);
    ok(a.n === 2 && a.pips === 0 && a.total === 'hidden', 'while rolling the dice are blank and the total is hidden');
    ok(b.n === 2 && b.pips === 0, 'another open copy rolls blank dice too');
    await dice.locator('#roll').click();   // ignored until the dice land
    await page.waitForTimeout(1500);
    a = await look(dice); b = await look(dice2);
    const vals = await page.evaluate(() => window.__board21.state.data.get('dice:1').values.join(','));
    ok(a.pips >= 2 && a.labels === vals && a.total === 'visible', `when the dice land they show the saved values (${vals})`);
    ok(b.labels === vals, 'and the other copy lands on the same values');
    // The Reset icon is a circular arrow with a solid head.
    await page.click('.win[data-ikey="dice:1"] .win-label'); await page.waitForTimeout(200);
    ok(await page.locator('#menu [data-act="reset"] svg path[fill="currentColor"]').count() === 1, 'Reset icon has a solid arrowhead');
    await page.keyboard.press('Escape');
    // Number of dice: a heading, then a row of 1 to 6, as Names at a time in the Name Picker.
    const items = () => page.evaluate(() => window.__board21.state.wins.get('dice:1').menuItems.map(i => i.separator ? '—' : i.heading ? '# ' + i.label
      : i.choices ? '[' + i.choices.map(c => c.label + (c.checked ? ' ✓' : '')).join(' ') + ']' : i.label + (i.checked ? ' ✓' : '')).join(' | '));
    ok(await items() === '# Number of dice | [1 2 ✓ 3 4 5 6] | — | Show total ✓', `the menu: Number of dice, a row of 1 to 6, then Show total (${await items()})`);
    await page.click('.win[data-ikey="dice:1"] .win-label'); await page.click('#menu [data-id="count:3"]'); await page.waitForTimeout(300);
    ok(await eventually(async () => (await look(dice)).n === 3 && (await look(dice2)).n === 3) && await items() === '# Number of dice | [1 2 3 ✓ 4 5 6] | — | Show total ✓',
      `tapping 3 shows 3 dice here and in the other tab, and checks 3 (${await items()})`);
    await page2.close();

    // A file made on purpose (imported from "a colleague", or put in a shared folder): what it says the widgets
    // saved is never turned into markup, and no script in it runs.
    const evil = '"><img src=x onerror="top.document.title=\'PWNED\'"><svg onload="top.document.title=\'PWNED\'">';
    const win = (widgetId, i, data, config, instance = 1) => ({ widgetId, instance, open: true, z: i + 1, rect: { x: 20 + (i % 4) * 290, y: 20 + Math.floor(i / 4) * 330, w: 280, h: 300 }, data, config });
    const crafted = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Math games' }, instances: [
      win('dice', 0, { values: [evil, 3] }, null),
      win('dice', 7, { values: ['<b>6</b>', 7, { toString: 1 }, 4, 5, 6, 1, 2] }, { count: evil, showTotal: evil }, 2),
      win('name-picker', 1, { names: [evil, 'Ana', 5, null, ['x']], left: [evil, 'Zed', 7], current: evil }, { noRepeats: evil }),
      win('notes', 2, { text: evil }, { theme: evil, color: evil, chalk: evil, px: evil, fit: evil }),
      win('timer', 3, { duration: evil, remaining: evil, endsAt: evil }, { sound: evil }),
      win('clock', 4, null, { style: 'digital', hour24: evil, seconds: evil, date: evil }),
      win('calendar', 5, null, { weekStart: evil }),
      win('traffic-light', 6, { active: evil }, null)
    ] };
    fs.writeFileSync(OUT + 'crafted.21board', JSON.stringify(crafted));
    await page.setInputFiles('#import-input', OUT + 'crafted.21board'); await page.waitForTimeout(300);
    await page.click('#modal .btn:has-text("Replace this page")');   // Replace this page
    const inFrame = (id, fn) => page.frameLocator(`.win[data-ikey="${id.includes(':') ? id : id + ':1'}"] iframe`).locator('html').evaluate(fn);
    const ids = crafted.instances.map(i => i.widgetId + ':' + i.instance);
    ok(await eventually(async () => (await Promise.all(ids.map(id => inFrame(id, () => !!(window.Board21 && Board21.context))))).every(Boolean)), 'a crafted file opens: all its windows start');
    await page.waitForTimeout(700);
    const marks = await Promise.all(ids.map(id => inFrame(id, () => document.querySelectorAll('img, [onerror], [onload], b').length)));
    ok(await page.title() !== 'PWNED' && marks.every(n => n === 0), `nothing in the file runs as script or becomes markup in any widget (page title: ${await page.title()}; elements made: ${marks.join(',')})`);
    a = await look(dice); b = await look(page.frameLocator('.win[data-ikey="dice:2"] iframe'));
    ok(a.n === 2 && a.labels === '1,3' && await inFrame('dice', () => document.getElementById('total').textContent) === '= 4', `Dice shows ordinary dice: only whole numbers 1 to 6 count as rolled (${a.labels})`);
    ok(b.n === 2 && b.labels === '1,2', `and the number of dice is 1 to 6, or the usual 2 (${b.labels})`);
    const shown = await Promise.all([
      inFrame('name-picker', () => { const n = [...document.querySelectorAll('.bn-name')]; return [n.map(e => e.textContent).join(), n.reduce((k, e) => k + e.children.length, 0), document.getElementById('status').textContent].join(' | '); }),
      inFrame('notes', () => document.getElementById('view').textContent),
      inFrame('timer', () => document.getElementById('display').textContent),
      inFrame('clock', () => document.getElementById('time').textContent),
      inFrame('calendar', () => document.querySelectorAll('.dow')[0].textContent),
      inFrame('traffic-light', () => document.querySelectorAll('.lamp.on').length)
    ]);
    ok(shown[0] === evil + ' | 0 | 1 of 2 left' && shown[1] === evil, 'Name Picker and Notes show such text as plain text (a name is whatever was typed)');
    ok(shown[2] === '05:00' && /^\d\d?:\d\d[AP]M$/.test(shown[3]) && /^Sun/.test(shown[4]) && shown[5] === 0, `Timer, Clock, Calendar and Traffic Light fall back to their usual settings (${shown.slice(2).join(', ')})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Notes: fit, links, chalkboard', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('notes')); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setRect('notes:1', { x: 60, y: 60, w: 420, h: 340 })); await page.waitForTimeout(400);
    const f = page.frameLocator('.win[data-ikey="notes:1"] iframe');
    const info = () => f.locator('body').evaluate(() => { const t = document.getElementById('t'), v = document.getElementById('view'); const ed = document.body.classList.contains('editing'); const el = ed ? t : v; return { size: parseFloat(getComputedStyle(t).fontSize), editing: ed, overflowY: el.scrollHeight > el.clientHeight + 1, overflowX: el.scrollWidth > el.clientWidth + 1 }; });
    // Auto-fit: short text is big, long text shrinks, nothing overflows, resizing re-fits.
    await f.locator('#view').click(); await page.waitForTimeout(150);
    ok((await info()).editing, 'tapping the note starts editing');
    await f.locator('#t').fill('Line up!'); await page.waitForTimeout(300);
    const short = await info();
    await f.locator('#t').fill('Today: finish the reading log, then pages 42-45 in the math workbook. Quiet voices during centers, please. Library at 1:30.'); await page.waitForTimeout(300);
    const long = await info();
    ok(short.size > long.size * 1.8, `text gets as big as fits (short ${short.size}px, long ${long.size}px)`);
    ok(!long.overflowY && !long.overflowX, 'all the text fits in the window');
    await page.evaluate(() => window.__board21.setRect('notes:1', { x: 60, y: 60, w: 700, h: 520 })); await page.waitForTimeout(500);
    ok((await info()).size > long.size, 'resizing the window re-fits the text');
    // Links.
    await f.locator('#t').fill('Class site: www.example.org/room12 and https://ccsd21.org/calendar. Bring library books.');
    await page.mouse.click(1000, 700); await page.waitForTimeout(300);
    ok(!(await info()).editing, 'tapping elsewhere leaves editing');
    const links = await f.locator('#view a').evaluateAll(as => as.map(a => [a.textContent, a.href, a.target]));
    ok(links.length === 2 && links[0][1] === 'https://www.example.org/room12' && links[1][0] === 'https://ccsd21.org/calendar' && links.every(l => l[2] === '_blank'), 'web addresses become links (www. and https://, trailing period left out)');
    await ctx.route(/example\.org/, r => r.fulfill({ body: 'ok', contentType: 'text/html' }));
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), f.locator('#view a').first().click()]);
    ok(!!popup && /example\.org\/room12/.test(popup.url()), 'tapping a link opens it in a new tab');
    if (popup) await popup.close();
    ok(!(await info()).editing, 'tapping a link does not start editing');
    const word = await f.locator('#view').evaluate(v => { const n = Array.from(v.childNodes).pop(); const r = document.createRange(); const i = n.nodeValue.indexOf('library'); r.setStart(n, i + 2); r.setEnd(n, i + 3); const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2, idx: v.textContent.indexOf('library') + 2 }; });
    const fr = await page.locator('.win[data-ikey="notes:1"] iframe').boundingBox();
    await page.mouse.click(fr.x + word.x, fr.y + word.y); await page.waitForTimeout(200);
    const caret = await f.locator('#t').evaluate(t => t.selectionStart);
    ok((await info()).editing && Math.abs(caret - word.idx) <= 1, `tapping text starts editing with the cursor there (caret ${caret}, expected ~${word.idx})`);
    // Chalkboard theme with the bundled font.
    await page.mouse.click(1000, 700); await page.waitForTimeout(200);
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="theme:chalkboard"]'); await page.waitForTimeout(800);
    const chalk = await f.locator('body').evaluate(b => ({ bg: getComputedStyle(b).backgroundColor, font: getComputedStyle(document.getElementById('view')).fontFamily, chalk: b.classList.contains('chalk'), loaded: document.fonts.check('32px "Crayon Libre"') && Array.from(document.fonts).some(x => x.family.replace(/"/g, '') === 'Crayon Libre' && x.status === 'loaded') }));
    ok(chalk.chalk && chalk.bg === 'rgb(47, 74, 58)' && /^"?Crayon Libre/.test(chalk.font), 'Chalkboard theme: green board and the bundled chalk font');
    ok(chalk.loaded, 'the chalk font file loads (works on any device, no system font needed)');
    ok(!(await info()).overflowY, 'text still fits in the chalk font');
    const glyphs = await f.locator('body').evaluate(async () => {
      await document.fonts.load('200px "Crayon Libre"');
      const c = document.createElement('canvas').getContext('2d'); c.font = '200px "Crayon Libre"';
      return { colonBelow: c.measureText(':').actualBoundingBoxDescent, I: c.measureText('I').width, one: c.measureText('1').width, l: c.measureText('l').width, o: c.measureText('o').width, lacute: c.measureText('ĺ').width, Lslash: c.measureText('Ł').width, L: c.measureText('L').width };
    });
    ok(glyphs.colonBelow < 3, `the chalk colon is two dots with nothing below the line, so 3:15 doesn't read 3;15 (${glyphs.colonBelow.toFixed(1)}px below)`);
    ok(glyphs.I > glyphs.l * 1.4 && glyphs.one > glyphs.l * 1.3, `the chalk I has bars and the 1 has a flag, so neither looks like the l (I ${Math.round(glyphs.I)}, 1 ${Math.round(glyphs.one)}, l ${Math.round(glyphs.l)}px)`);
    ok(glyphs.l < glyphs.o * 0.55, `the chalk lowercase l is a plain print stick, not the looped cursive one (${Math.round(glyphs.l)}px wide)`);
    ok(glyphs.lacute < glyphs.l * 1.7 && glyphs.Lslash < glyphs.L * 1.25, 'accented l letters (ĺ ľ ł...) and Ł use the print shapes too');
    // Whiteboard theme with its marker font.
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="theme:whiteboard"]'); await page.waitForTimeout(800);
    const wb = await f.locator('body').evaluate(async b => { await document.fonts.load('32px "Excalifont"'); return { bg: getComputedStyle(b).backgroundColor, ink: getComputedStyle(b).color, font: getComputedStyle(document.getElementById('view')).fontFamily, cls: b.classList.contains('whiteboard') && !b.classList.contains('chalk'), loaded: document.fonts.check('32px "Excalifont"') }; });
    ok(wb.cls && wb.bg === 'rgb(251, 252, 253)' && wb.ink === 'rgb(27, 31, 36)' && /^"?Excalifont/.test(wb.font) && wb.loaded, 'Whiteboard theme: white board, dark marker ink and the bundled marker font');
    ok(!(await info()).overflowY, 'text fits in the whiteboard font');
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="theme:chalkboard"]'); await page.waitForTimeout(300);
    // Themes are listed apart from colors; each theme has its own color row and remembers its color.
    const openMenu = async () => { await page.click('.win[data-ikey="notes:1"] .win-label'); await page.waitForTimeout(200); };
    const menuState = () => page.evaluate(() => ({
      headings: [...document.querySelectorAll('#menu .menu-heading')].map(h => h.textContent),
      themes: [...document.querySelectorAll('#menu [data-id^="theme:"]')].map(b => b.textContent.trim() + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
      swatches: [...document.querySelectorAll('#menu .swatch')].map(b => b.dataset.id + (b.getAttribute('aria-checked') === 'true' ? '*' : ''))
    }));
    const ink = () => f.locator('body').evaluate(b => getComputedStyle(b).color);
    await openMenu();
    let ms = await menuState();
    ok(ms.headings.join('|') === 'Theme|Chalk color' && ms.themes.join('|') === 'Sticky note|Chalkboard*|Whiteboard', `the menu lists themes separately: ${ms.themes.join(', ')}`);
    ok(ms.swatches.length === 6 && ms.swatches.includes('chalk:white*'), 'Chalkboard offers a row of chalk colors (white chosen)');
    await page.click('#menu [data-id="chalk:yellow"]'); await page.waitForTimeout(300);
    ok(await ink() === 'rgb(253, 230, 138)' && (await page.evaluate(() => window.__board21.state.conf.get('notes:1').chalk)) === 'yellow', 'picking yellow chalk writes in yellow chalk');
    await openMenu(); await page.click('#menu [data-id="theme:whiteboard"]'); await page.waitForTimeout(400);
    await openMenu(); ms = await menuState();
    ok(ms.headings[1] === 'Marker color' && ms.swatches.length === 5 && ms.swatches.includes('marker:black*'), 'Whiteboard offers marker colors');
    await page.click('#menu [data-id="marker:red"]'); await page.waitForTimeout(300);
    ok(await ink() === 'rgb(200, 30, 30)', 'picking a red marker writes in red');
    await openMenu(); await page.click('#menu [data-id="theme:sticky"]'); await page.waitForTimeout(400);
    await openMenu(); ms = await menuState();
    const bg = await f.locator('body').evaluate(b => getComputedStyle(b).backgroundColor);
    ok(ms.headings[1] === 'Paper color' && ms.swatches.includes('color:yellow*') && bg === 'rgb(254, 240, 138)' && !(await f.locator('body').evaluate(b => b.classList.contains('chalk') || b.classList.contains('whiteboard'))),
      'Sticky note is the plain note again: the color is the paper, in the normal font');
    await page.click('#menu [data-id="color:pink"]'); await page.waitForTimeout(300);
    await openMenu(); await page.click('#menu [data-id="theme:chalkboard"]'); await page.waitForTimeout(400);
    ok(await ink() === 'rgb(253, 230, 138)', 'each theme remembers its own color (back to yellow chalk)');
    // A note saved when Chalkboard/Whiteboard were colors opens in that theme.
    await page.evaluate(() => window.__board21.state.wins.get('notes:1').post('config', { config: { color: 'whiteboard', fit: true } })); await page.waitForTimeout(400);
    await openMenu(); ms = await menuState();
    ok(ms.themes.includes('Whiteboard*') && await f.locator('body').evaluate(b => b.classList.contains('whiteboard')), 'an older note saved with the Whiteboard color opens in the Whiteboard theme');
    await page.keyboard.press('Escape');
    // The board only accepts plain colors for swatches (nothing can be smuggled into the page's styles).
    await f.locator('body').evaluate(() => Board21.menu.set([{ label: 'X', swatches: [{ id: 'a', label: 'A', color: 'red;background:url(https://example.com/x)' }, { id: 'b', label: 'B', color: '#123456' }] }]));
    await page.waitForTimeout(300); await openMenu();
    ok((await page.evaluate(() => [...document.querySelectorAll('#menu .swatch')].map(b => b.dataset.id).join(','))) === 'b', 'swatches with anything but a plain color are dropped');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__board21.state.wins.get('notes:1').post('config', { config: { theme: 'chalkboard', chalk: 'white', fit: true } })); await page.waitForTimeout(400);
    // Fixed size; saved config; older notes.
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="smaller"]'); await page.waitForTimeout(300);
    const conf = await page.evaluate(() => window.__board21.state.conf.get('notes:1'));
    ok(conf.fit === false && conf.px > 0 && conf.theme === 'chalkboard', 'Smaller text switches to a fixed size and is saved');
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="fit"]'); await page.waitForTimeout(300);
    ok((await page.evaluate(() => window.__board21.state.conf.get('notes:1'))).fit === true, '"Fit text" turns fitting back on');
    // The menu's words: "Fit text", and the chalk colors by their color alone (the heading says Chalk color).
    const nm = await page.evaluate(() => { const m = window.__board21.state.wins.get('notes:1').menuItems; return { fit: (m.find(i => i.id === 'fit') || {}).label, colors: ((m.find(i => i.id === 'colors') || {}).swatches || []).map(w => w.label).join() }; });
    ok(nm.fit === 'Fit text' && nm.colors === 'White,Yellow,Pink,Blue,Green,Orange', `the menu says “Fit text”, and names the chalk colors in one word each (${nm.fit}; ${nm.colors})`);
    await page.evaluate(() => window.__board21.state.wins.get('notes:1').post('config', { config: { color: 'pink', size: 3 } })); await page.waitForTimeout(400);
    ok(!(await info()).overflowY, 'a note saved before this update fits its text automatically');
    // Clear note can be undone, from a bar inside the note.
    const agenda = 'Morning work:\n1. Read chapter 4\n2. Math page 31';
    const savedNote = () => page.evaluate(() => (window.__board21.state.data.get('notes:1') || {}).text);
    const clearNote = async () => { await page.mouse.click(1000, 700); await page.waitForTimeout(500); await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="clear"]'); };
    await f.locator('#view').click({ position: { x: 4, y: 4 } }); await f.locator('#t').fill(agenda);   // (in the margin: the note has links in it)
    await clearNote();
    ok(await eventually(async () => await savedNote() === '') && await f.locator('#undo').isVisible() && await f.locator('#undo').textContent() === 'Note cleared.Undo', 'Clear note empties the note and offers Undo inside it');
    await page.evaluate(() => window.__board21.setRect('notes:1', { x: 60, y: 60, w: 180, h: 120 }));   // the smallest a note can be
    ok(await eventually(() => f.locator('#undo button').evaluate(b => { const r = b.getBoundingClientRect(); return innerWidth < 200 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), 3000), 'the Undo button fits in the smallest note');
    await f.locator('#undo button').click();
    ok(await eventually(async () => await savedNote() === agenda) && await f.locator('#view').textContent() === agenda && await f.locator('#undo').isHidden(), 'Undo puts the note back, and the bar goes away');
    await page.evaluate(() => window.__board21.setRect('notes:1', { x: 60, y: 60, w: 420, h: 340 }));
    await clearNote();
    await f.locator('#view').click({ position: { x: 4, y: 4 } }); await f.locator('#t').pressSequentially('New');
    ok(await eventually(async () => await savedNote() === 'New') && await f.locator('#undo').isHidden(), 'typing a new note after Clear note takes the Undo away (the old note is not put back over the new one)');
    // The chalk font is part of the offline cache.
    ok(await page.evaluate(() => window.BOARD21_WIDGETS.find(a => a.id === 'notes').files.includes('widgets/notes/fonts/CrayonLibre-21Board.woff2') && window.BOARD21_WIDGETS.find(a => a.id === 'notes').files.includes('widgets/notes/fonts/Excalifont-Regular.woff2')), 'the chalk and marker fonts are listed for offline use');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['First/Then Board: cards, done marks, two tabs, a crafted file', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    // Counts the chimes each copy plays (each chime makes one AudioContext).
    await ctx.addInitScript(() => { const A = window.AudioContext; if (A) window.AudioContext = class extends A { constructor(...a) { super(...a); window.__chimes = (window.__chimes || 0) + 1; } }; });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const KEY = 'first-then-board:1';
    const ft = (p, k = KEY) => p.frameLocator(`.win[data-ikey="${k}"] iframe`);
    const connected = (p, k = KEY) => eventually(() => p.evaluate(k => { const w = window.__board21.state.wins.get(k); return !!(w && w.connected); }, k));
    const saved = p => p.evaluate(k => window.__board21.state.data.get(k) || null, KEY);
    const look = (p, k) => ft(p, k).locator('html').evaluate(() => {
      const $ = id => document.getElementById(id);
      return { first: $('first-label').textContent, then: $('then-label').textContent, badge: $('first-badge').textContent, firstDone: $('first-done-overlay').classList.contains('visible'),
        thenDone: $('then-done-overlay').classList.contains('visible'), theme: document.body.className, chimes: window.__chimes || 0 };
    });
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('first-then-board'));
    ok(await connected(page), 'the First/Then Board opens and connects');
    ok(await eventually(async () => { const x = await look(page); return x.first === 'Classwork' && x.then === 'Free choice' && x.theme === 'theme-classic' && !x.firstDone; }), 'it starts with Classwork, then Free choice');
    // For children: the cards in sentence case (iPad keeps its capital), their category too, FIRST and THEN in
    // capitals, the stamp “All done!”.
    const caps = await ft(page).locator('html').evaluate(() => ({ title: document.querySelector('.board-title-pill').innerText, first: document.getElementById('first-heading').innerText,
      then: document.getElementById('then-heading').innerText, stamps: [...document.querySelectorAll('.done-stamp-text')].map(s => s.textContent + '/' + getComputedStyle(s).textTransform),
      badges: ['first-badge', 'then-badge'].map(id => document.getElementById(id).innerText) }));
    ok(caps.title === '⭐ FIRST ➔ THEN' && caps.first === 'FIRST' && caps.then === 'THEN' && caps.stamps.join() === 'All done!/none,All done!/none' && caps.badges.join() === 'Academic,Reward',
      `FIRST and THEN stay in capitals; the cards’ categories and the done stamp (“All done!”) don’t (${JSON.stringify(caps)})`);
    let a;
    // Pick a card, mark it done, change the theme.
    const f = ft(page);
    await f.locator('#btn-first').click({ force: true });   // (the cards bob gently, so they are never "still")
    // The card picker: in every row the pictures share one top, whether a label takes one line or two.
    await page.mouse.move(1, 1); await page.waitForTimeout(400);
    const cards = await f.locator('html').evaluate(() => {
      const rows = new Map();
      for (const t of document.querySelectorAll('.aac-tile-btn')) {
        const k = Math.round(t.getBoundingClientRect().top), lb = t.querySelector('.aac-tile-label'), g = document.createRange(); g.selectNodeContents(lb);
        rows.set(k, (rows.get(k) || []).concat({ top: t.querySelector('.aac-tile-icon').getBoundingClientRect().top, two: new Set([...g.getClientRects()].map(q => Math.round(q.top))).size > 1, name: lb.textContent }));
      }
      return { off: [...rows.values()].map(r => Math.max(...r.map(t => t.top)) - Math.min(...r.map(t => t.top))), two: [...rows.values()].flat().filter(t => t.two).map(t => t.name) };
    });
    ok(cards.two.length > 0 && cards.off.every(d => d < 0.5), `in the card picker the pictures in each row share one top, two-line labels (${cards.two.join(', ')}) or not (rows off by ${cards.off.filter(d => d >= 0.5).map(d => d.toFixed(1)).join(', ') || 'none'} px)`);
    const tiles = await f.locator('.aac-tile-label').allTextContents();
    const titled = tiles.filter(t => /[ /&][A-Z]/.test(t.replace(/\biPad\b/g, 'ipad')) || !/^[A-Zi]/.test(t));
    ok(tiles.length > 50 && !titled.length && tiles.includes('Sit at table') && tiles.includes('Free choice') && tiles.includes('iPad / tablet'),
      `every card in the picker is in sentence case (${titled.join(', ') || tiles.slice(0, 8).join(', ') + '…'})`);
    await f.locator('#search-input').fill('zebra');
    const pickerSays = await f.locator('html').evaluate(() => [document.getElementById('picker-title').textContent, document.getElementById('search-input').placeholder, document.getElementById('search-input').getAttribute('aria-label'), document.getElementById('aac-grid').textContent].join(' | '));
    ok(pickerSays === 'Choose a First card | 🔍 Search cards | Search cards | No cards match.', `the card picker’s words (${pickerSays})`);
    await f.locator('#search-input').fill('math');
    await f.locator('.aac-tile-btn', { hasText: 'Math' }).click();
    await f.locator('#btn-done-icon').click(); await f.locator('#btn-toggle-first').click();
    await f.locator('#btn-theme-icon').click(); await f.locator('.theme-pill[data-theme="winter"]').click();
    ok(await eventually(async () => { const s = await saved(page); return s && s.first.id === 'math' && s.firstDone === true && s.thenDone === false && s.theme === 'winter'; }), 'the chosen card, its done mark and the theme are saved');
    a = await look(page);
    ok(a.first === 'Math' && a.firstDone && a.theme === 'theme-winter' && a.chimes === 1, `and shown: Math, done, Winter, one chime (${a.chimes})`);
    // What a screen reader hears: each card by its place, its picture's name and whether it is done; the buttons by
    // what they do. The done buttons in sentence case.
    const words = await f.locator('html').evaluate(() => {
      const $ = id => document.getElementById(id), al = id => $(id).getAttribute('aria-label');
      return [al('btn-first'), al('btn-then'), al('btn-theme-icon'), al('btn-done-icon'), al('btn-swap'), $('first-done-text').textContent, $('then-done-text').textContent, $('both-done-text').textContent].join(' | ');
    });
    ok(words === 'First, Math, done | Then, Free choice | Theme | Mark done | Swap First and Then | First done | Then done | Both done', `each card is heard by its place, its picture and whether it’s done; the buttons say what they do (${words})`);
    const pressed = () => f.locator('html').evaluate(() => ['btn-toggle-first', 'btn-toggle-then'].map(id => document.getElementById(id).getAttribute('aria-pressed')).join(' | '));
    ok(await pressed() === 'true | false', `First done and Then done are heard as pressed or not (${await pressed()})`);
    // A second tab shows the same board; a change there comes back here, and the chime plays only where it was tapped.
    const page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push(e.message));
    await page2.goto(BASE); await boardUp(page2);
    ok(await connected(page2), 'the board opens in a second tab');
    ok(await eventually(async () => { const b = await look(page2); return b.first === 'Math' && b.firstDone && b.theme === 'theme-winter'; }), 'the second tab shows the same cards, done mark and theme');
    await ft(page2).locator('#btn-done-icon').click(); await ft(page2).locator('#btn-toggle-then').click();
    ok(await eventually(async () => (await look(page)).thenDone), 'marking Then done in one tab shows it done in the other');
    ok(await eventually(async () => await pressed() === 'true | true'), `and Then done is heard as pressed there too (${await pressed()})`);
    const s1 = JSON.stringify(await saved(page)); await page.waitForTimeout(1200);
    const s2 = JSON.stringify(await saved(page)), s3 = JSON.stringify(await saved(page2));
    ok(s1 === s2 && s2 === s3 && JSON.parse(s2).thenDone === true, 'the two tabs agree and stay that way (no saving back and forth)');
    a = await look(page); const b2 = await look(page2);
    ok(a.chimes === 1 && b2.chimes === 1, `the chime plays once, in the tab where it was tapped (this tab ${a.chimes}, other tab ${b2.chimes})`);
    await page2.close();
    // Loaded again, and closed and opened again: still the same.
    await page.reload(); await boardUp(page);
    ok(await connected(page), 'after the page is loaded again the widget connects');
    ok(await eventually(async () => { const x = await look(page); return x.first === 'Math' && x.firstDone && x.thenDone && x.theme === 'theme-winter'; }), 'and shows the saved board (Math, both done, Winter)');
    await page.evaluate(k => window.__board21.closeWin(k), KEY); await page.waitForTimeout(500);
    await page.evaluate(() => window.__board21.openWidget('first-then-board'));
    ok(await connected(page) && await eventually(async () => { const x = await look(page); return x.first === 'Math' && x.thenDone && x.theme === 'theme-winter'; }), 'closing the window and opening it again keeps the board');
    // The window menu: within the board's limit, and Swap works.
    await page.click(`.win[data-ikey="${KEY}"] .win-label`); await page.waitForTimeout(200);
    const items = await page.locator('#menu [data-id]').count();
    ok(items > 0 && items <= 24, `the window menu has ${items} of the widget's items (24 at most)`);
    // The menu's words, with a tick where something is on: First done and Then done, Sound and Animation, the theme.
    // Themes and presets each under one heading, the themes in the pills' order.
    const ftMenu = () => page.evaluate(k => window.__board21.state.wins.get(k).menuItems.map(i => i.heading ? `[${i.label}]` : (i.checked ? '✓ ' : '') + i.label).join(' | '), KEY);
    ok(await ftMenu() === '✓ First done | ✓ Then done | Mark both done | Clear done marks | Swap First and Then | ✓ Sound | ✓ Animation | [Theme] | 🌈 Classic | 🍂 Autumn | ✓ ❄️ Winter | 🌸 Spring | ☀️ Summer | 💜 Calm | [Presets] | Classwork ➔ Free choice | Classwork ➔ iPad | Sit at table ➔ Quiet corner | Clean up ➔ Playground | Math ➔ Snack time',
      `the window menu says each thing once, with ticks where something is on (${await ftMenu()})`);
    await page.click('#menu [data-id="toggle_sound"]');
    await page.click(`.win[data-ikey="${KEY}"] .win-label`); await page.waitForTimeout(200);
    await page.click('#menu [data-id="theme_calm"]');
    ok(await eventually(async () => { const m = await ftMenu(); return /\| Sound \|/.test(m) && /✓ 💜 Calm/.test(m) && !/✓ ❄️ Winter/.test(m); }) && await eventually(async () => (await look(page)).theme === 'theme-calm'),
      `the ticks follow: Sound off, Calm on (${await ftMenu()})`);
    await page.click(`.win[data-ikey="${KEY}"] .win-label`); await page.waitForTimeout(200);
    await page.click('#menu [data-id="swap"]');
    ok(await eventually(async () => { const x = await look(page); const s = await saved(page); return x.first === 'Free choice' && x.then === 'Math' && s.first.id === 'free-play'; }), 'Swap First and Then swaps the cards and saves');
    ok(await eventually(() => ft(page).locator('html').evaluate(() => document.getElementById('btn-first').getAttribute('aria-label') === 'First, Free choice, done' && document.getElementById('btn-then').getAttribute('aria-label') === 'Then, Math, done')),
      'and each card is heard by its new place');
    // The smallest window: the buttons and both cards fit.
    await page.evaluate(k => window.__board21.setRect(k, { x: 40, y: 40, w: 100, h: 100 }), KEY);
    ok(await eventually(() => ft(page).locator('html').evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return innerWidth <= 300 && innerHeight <= 220 && r('btn-swap').right <= innerWidth && r('btn-then').right <= innerWidth && r('btn-then').bottom <= innerHeight; })), 'in the smallest window the buttons and both cards fit');

    // A file made on purpose: markup and javascript: addresses in every saved field. Nothing runs, no element is
    // made, and damaged values fall back to the usual board.
    const evil = '"><img src=x onerror="top.document.title=\'PWNED\'"><svg onload="top.document.title=\'PWNED\'">';
    const js = 'javascript:top.document.title=\'PWNED\'';
    const win = (instance, data) => ({ widgetId: 'first-then-board', instance, open: true, z: instance, rect: { x: 20 + (instance - 1) * 300, y: 20, w: 290, h: 300 }, data, config: { theme: evil, sound: js } });
    const crafted = { format: '21board', formatVersion: 1, kind: 'full', board: { name: 'Schedules' }, instances: [
      win(1, { first: { id: evil, label: evil, icon: evil, category: evil }, then: { id: js, label: js, icon: js, category: '__proto__' }, firstDone: evil, thenDone: js, isDone: true,
        sound: evil, theme: evil, motion: evil, themeTrayOpen: evil, doneTrayOpen: js }),
      win(2, { first: evil, then: [evil], firstDone: 1, theme: 'constructor', sound: js }),
      win(3, { first: { id: 'math', label: evil, icon: evil, category: 'toString' }, then: { id: 'snack', label: js, icon: js, category: js }, theme: 'calm', firstDone: true })
    ] };
    fs.writeFileSync(OUT + 'crafted-first-then.21board', JSON.stringify(crafted));
    await page.setInputFiles('#import-input', OUT + 'crafted-first-then.21board'); await page.waitForTimeout(300);
    await page.click('#modal .btn:has-text("Replace this page")');   // Replace this page
    const keys = [1, 2, 3].map(i => 'first-then-board:' + i);
    ok(await eventually(async () => (await Promise.all(keys.map(k => connected(page, k)))).every(Boolean)), 'a crafted file opens: all its windows start');
    await page.waitForTimeout(500);
    const made = () => Promise.all(keys.map(k => ft(page, k).locator('html').evaluate(() => document.querySelectorAll('img, svg, iframe, object, embed, a, [onerror], [onload]').length)));
    let marks = await made();
    ok(await page.title() !== 'PWNED' && marks.every(n => n === 0), `nothing in the file runs as script or becomes markup (page title: ${await page.title()}; elements made: ${marks.join(',')})`);
    const shown = await Promise.all(keys.map(k => look(page, k)));
    ok(shown.slice(0, 2).every(x => x.first === 'Classwork' && x.then === 'Free choice' && x.badge === 'Academic' && x.theme === 'theme-classic' && !x.firstDone && !x.thenDone),
      `damaged cards, done marks and themes fall back to the usual board (${shown.slice(0, 2).map(x => [x.first, x.then, x.theme, x.firstDone].join('/')).join('; ')})`);
    ok(shown[2].first === 'Math' && shown[2].then === 'Snack time' && shown[2].theme === 'theme-calm' && shown[2].firstDone, `a card is drawn from the card library, not from the file's text (${shown[2].first}, ${shown[2].then})`);
    // A window saved before the cards were in sentence case shows them in sentence case: a card is found by its id.
    await page.evaluate(k => window.__board21.state.wins.get(k).post('data', { data: { first: { id: 'desk', label: 'Sit at Table', icon: '🪑', category: 'Academic' },
      then: { id: 'free-play', label: 'Free Choice', icon: '🧩', category: 'Reward' }, firstDone: true }, reason: 'remote' }), keys[2]);
    ok(await eventually(async () => { const x = await look(page, keys[2]); return x.first === 'Sit at table' && x.then === 'Free choice'; }) &&
      await ft(page, keys[2]).locator('html').evaluate(() => document.getElementById('btn-first').getAttribute('aria-label')) === 'First, Sit at table, done',
      'a window saved with the old labels shows the new ones, and is heard by them');
    // The same through a change from another tab (the 'data' event).
    await page.evaluate(([k, d]) => window.__board21.state.wins.get(k).post('data', { data: d, reason: 'remote' }), [keys[2], crafted.instances[0].data]);
    ok(await eventually(async () => { const x = await look(page, keys[2]); return x.first === 'Classwork' && x.theme === 'theme-classic'; }), 'a damaged change from another tab falls back to the usual board too');
    // The card picker draws its cards as text.
    await ft(page, keys[0]).locator('#btn-first').click({ force: true });
    ok(await ft(page, keys[0]).locator('html').evaluate(() => { const t = [...document.querySelectorAll('.aac-tile-btn')]; return t.length > 50 && t.every(b => b.children.length === 2 && [...b.children].every(c => c.tagName === 'SPAN')); }), 'the card picker shows its cards (icon and label as text)');
    marks = await made();
    ok(await page.title() !== 'PWNED' && marks.every(n => n === 0), 'still nothing made after the change and with the picker open');
    ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }],
  ['District apps (21Sketch, 21Timer, 21DocCam)', async (browser) => {
    // The tests never reach the real sites: every ccsd21.org address gets a stand-in from here, or nothing (and is
    // counted in `stray`). Each stand-in counts the taps that reach it and, on loading, tries what any page from
    // another site could: the SDK's "hello" and a "save" to the board. 21Sketch's (like the real one) keeps every
    // press on its drawing surface to itself, so the keyboard focus never moves into it; 21Timer's 'load' never
    // comes (an image that never answers; the real one waits on a video of its own).
    const APPS = { '21sketch': ['21Sketch', 'https://sketchapp.ccsd21.org/'], '21timer': ['21Timer', 'https://timerapp.ccsd21.org/'], '21doccam': ['21DocCam', 'https://doccamapp.ccsd21.org/'] };
    const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';
    const STANDIN = name => `<!doctype html><html><head><meta charset="utf-8"><title>${name} stand-in</title>
<style>html,body{margin:0;height:100%;background:#fde68a;font:700 24px system-ui;color:#1f2937}body{display:grid;place-items:center}canvas{position:fixed;inset:0;width:100%;height:100%}</style></head>
<body><div>${name} stand-in</div>${name === '21Sketch' ? '<canvas id="board"></canvas>' : ''}${name === '21Timer' ? '<img src="slow.png" alt="">' : ''}${name === '21DocCam' ? '<button style="position:fixed;left:8px;top:8px;width:140px;height:48px">Take a picture</button>' : ''}<script>
window.__taps = 0; addEventListener('pointerdown', e => { window.__taps++; if (e.target.id === 'board') e.preventDefault(); }, true);
try { localStorage.setItem('standin', '${name}'); } catch (e) { /* ignore */ }
parent.postMessage({ b21: 1, type: 'hello' }, '*');
parent.postMessage({ b21: 1, type: 'save', data: { from: '${name}' }, reqId: 1 }, '*');
parent.postMessage({ b21: 1, type: 'window', op: 'maximize', args: [] }, '*');
</script></body></html>`;
    const stray = [], down = new Set();   // down: apps whose site can't be reached
    const standIns = async c => {
      await c.route(/^https?:\/\/([^/]*\.)?(ccsd21\.org|evil\.example)(:\d+)?\//, route => {
        const u = new URL(route.request().url()), id = Object.keys(APPS).find(k => APPS[k][1] === u.origin + '/'), app = APPS[id];
        if (app && down.has(id)) return route.abort('internetdisconnected');
        if (app && u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: STANDIN(app[0]) });
        if (app && u.pathname === '/slow.png') return;   // never answers
        if (app && u.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
        stray.push(u.href); return route.abort();
      });
    };
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await standIns(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const B = (fn, arg) => page.evaluate(fn, arg);
    const frameOf = (p, id) => p.frames().find(f => f.url() === APPS[id][1]);
    const focused = () => B(() => window.__board21.state.focused);
    const taps = id => frameOf(page, id).evaluate(() => window.__taps);
    const center = async ik => { const r = await page.locator(`.win[data-ikey="${ik}"] .win-body`).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const onTop = (ik, p = page) => center(ik).then(c => p.evaluate(([ik, c]) => { const e = document.elementFromPoint(c.x, c.y); return !!e && e.tagName === 'IFRAME' && e.closest('.win').dataset.ikey === ik; }, [ik, c]));

    // ---- In the Widget Picker, each opens a window showing its own site, sandboxed as any widget is.
    await page.click('.picker-btn.left'); await page.waitForTimeout(200);
    ok(await B(names => names.every(n => Array.from(document.querySelectorAll('.widget-tile')).some(t => t.textContent.trim() === n)), Object.values(APPS).map(a => a[0])), 'the Widget Picker lists 21Sketch, 21Timer and 21DocCam');
    await page.keyboard.press('Escape');
    for (const id of Object.keys(APPS)) { await page.click('.picker-btn.left'); await page.click(`[data-widget="${id}"]`); await page.waitForTimeout(250); }
    await page.waitForTimeout(1500);
    const frames = await B(() => Object.fromEntries(Array.from(document.querySelectorAll('.win iframe')).map(f => [f.closest('.win').dataset.ikey, { src: f.getAttribute('src'), sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow').split('; '), name: f.name }])));
    ok(Object.entries(APPS).every(([id, [, url]]) => { const f = frames[id + ':1']; return f && f.src === url && f.sandbox === SANDBOX && f.allow.includes('camera') === (id === '21doccam') && f.allow.includes('fullscreen') && f.allow.includes('clipboard-write') && f.name === ''; }),
      'each opens at its live address, in the same sandbox as every widget, with the camera allowed for 21DocCam only: ' + JSON.stringify(frames));
    ok(await Promise.all(Object.keys(APPS).map(id => frameOf(page, id) && frameOf(page, id).title())).then(t => t.every((x, i) => x === Object.values(APPS)[i][0] + ' stand-in')), 'the windows show the apps (stand-ins here)');
    // No endless loading: the page goes over the spinner, even though 21Timer's 'load' never comes.
    await B(() => { const b = window.__board21; b.setRect('21sketch:1', { x: 20, y: 20, w: 720, h: 500 }); b.setRect('21timer:1', { x: 760, y: 20, w: 420, h: 330 }); b.setRect('21doccam:1', { x: 760, y: 370, w: 600, h: 440 }); b.focusWin('21timer:1'); });
    await page.waitForTimeout(400);
    ok(!(await B(() => document.querySelector('.win[data-ikey="21timer:1"] .win-loading').classList.contains('done'))) && await onTop('21timer:1'),
      'a page whose ‘load’ never comes still shows: the spinner is under it, not over it');
    ok(await B(() => document.querySelector('.win[data-ikey="21sketch:1"] .win-loading').classList.contains('done')) && !(await page.locator('.toast').count()), 'no error, and the spinner goes once a page has loaded');
    // The board takes nothing from them (they posted hello, save and maximize when they loaded) and sends them nothing.
    const recs = await B(async () => (await window.__board21.store.getAll()).map(r => r.key));
    ok(await B(() => Array.from(window.__board21.state.wins.values()).every(w => !w.connected && !w.inst.maximized && !window.__board21.state.data.has(w.ikey))) && !recs.some(k => /^(data|conf):.*:21/.test(k)),
      'the board takes no SDK messages from them: never connected, nothing saved, nothing maximized');

    // ---- Taps inside (a page from another site doesn't tell the board it was tapped).
    // Nothing over it: every tap reaches the app at once (two people can draw in 21Sketch and use another window).
    let c = await center('21sketch:1');
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(300);
    ok(await taps('21sketch') === 1 && await onTop('21sketch:1') && await focused() === '21timer:1', 'a tap inside 21Sketch, behind but with nothing over it, reaches the app at once (the board doesn’t see it)');
    // A tap on one of its buttons moves the focus into it: that the board sees, and brings its window forward.
    await B(() => document.activeElement && document.activeElement.blur());
    const btn = await page.locator('.win[data-ikey="21doccam:1"] iframe').boundingBox();
    await page.mouse.click(btn.x + 60, btn.y + 30); await page.waitForTimeout(300);
    ok(await focused() === '21doccam:1' && await taps('21doccam') === 1, 'a tap on a button in 21DocCam reaches it and brings its window to the front');
    // Partly behind another window: the first tap only brings it forward.
    await B(() => { window.__board21.setRect('21doccam:1', { x: 600, y: 300, w: 600, h: 440 }); window.__board21.focusWin('21doccam:1'); });
    await page.waitForTimeout(300);
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(300);
    ok(await focused() === '21sketch:1' && await taps('21sketch') === 1, 'tapping inside 21Sketch while 21DocCam is partly over it brings it to the front; that tap goes no further');
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(300);
    ok(await focused() === '21sketch:1' && await taps('21sketch') === 2 && await onTop('21sketch:1'), 'in front, the next tap reaches the app, with nothing over it');
    await B(() => window.__board21.setRect('21doccam:1', { x: 760, y: 370, w: 600, h: 440 })); await page.waitForTimeout(300);
    c = await center('21doccam:1');
    await page.click('.picker-btn.left'); await page.waitForTimeout(200);
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(300);
    ok(!(await B(() => document.getElementById('panel').classList.contains('open'))) && await taps('21doccam') === 1, 'with the Widget Picker open, a tap on an app closes it (and goes no further)');

    // ---- One window per app: the Widget Picker brings it forward, or opens it again.
    await page.click('.picker-btn.left'); await page.click('[data-widget="21sketch"]'); await page.waitForTimeout(400);
    ok(await page.locator('.win[data-ikey^="21sketch:"]').count() === 1 && await focused() === '21sketch:1' && await page.locator('.win[data-ikey="21sketch:1"].attention').count() === 1,
      'choosing 21Sketch again brings its window forward (and shows which it is) instead of opening a second one');
    await B(() => window.__board21.closeWin('21sketch:1')); await page.waitForTimeout(400);
    await page.click('.picker-btn.left'); await page.click('[data-widget="21sketch"]'); await page.waitForTimeout(800);
    ok(await B(() => Array.from(window.__board21.state.insts.keys()).filter(k => k.startsWith('21sketch:')).join()) === '21sketch:1' && await page.locator('.win[data-ikey="21sketch:1"]').count() === 1, 'closed, it opens again as the same window');
    ok(await page.locator('.toast', { hasText: '21Sketch closed. Open it again' }).count() === 1, 'closing it doesn’t claim the board saved its content');

    // ---- The window menu: open it in a new tab; nothing to reset or go back to.
    await page.click('.win[data-ikey="21sketch:1"] .win-label'); await page.waitForTimeout(250);
    await page.screenshot({ path: OUT + '90-district-apps-light.png' });
    const acts = await B(() => Array.from(document.querySelectorAll('#menu [data-act]')).map(b => b.dataset.act + ':' + b.textContent.trim()));
    ok(JSON.stringify(acts) === JSON.stringify(['maximize:Zoom to fill', 'reload:Refresh 21Sketch', 'own:Open in new tab', 'close:Close']), 'its menu: Zoom to fill, “Refresh 21Sketch”, “Open in new tab”, Close (no Reset…, no Go back…): ' + acts.join(', '));
    const popup = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await page.click('#menu [data-act="own"]');
    const pop = await popup;
    if (pop) await pop.waitForLoadState().catch(() => {});
    ok(!!pop && pop.url() === APPS['21sketch'][1] && await pop.evaluate(() => window.opener === null), '“Open in new tab” opens its site in a new tab, cut off from the board');
    if (pop) await pop.close();
    // A window that opened while its site couldn't be reached stays on the browser's error page: Reload loads it again.
    down.add('21timer');
    await page.click('.win[data-ikey="21timer:1"] .win-label'); await page.click('#menu [data-act="reload"]'); await page.waitForTimeout(800);
    ok(!frameOf(page, '21timer') && page.frames().some(f => /^chrome-error:/.test(f.url())), '(while 21Timer’s site can’t be reached, its window shows the browser’s error page)');
    down.delete('21timer');
    await page.click('.win[data-ikey="21timer:1"] .win-label'); await page.click('#menu [data-act="reload"]'); await page.waitForTimeout(800);
    ok(!!frameOf(page, '21timer') && await frameOf(page, '21timer').title() === '21Timer stand-in' && await focused() === '21timer:1', '“Refresh 21Timer” in its menu loads it again once the site answers');

    // ---- Settings says the app keeps its own work; deleting the window leaves that work alone.
    await openSettings(page, ['saved', 'advanced']);
    const row = await page.locator('#settings .inst', { hasText: '21Sketch' }).first().innerText();
    ok(/21Sketch keeps its own work on this device/.test(row) && !/\d B|saved/.test(row), 'Settings’ window list says 21Sketch keeps its own work on this device (no size, no “saved”): ' + row.replace(/\n/g, ' '));
    await page.locator('#settings .inst', { hasText: '21Timer' }).locator('[data-act="inst-delete"]').click(); await page.waitForTimeout(300);
    const delApp = (await page.locator('#modal.open p').innerText()).replace(/\s+/g, ' ');
    ok(/^Its window is deleted from this page\. Your work in 21Timer isn’t touched\. 21Timer keeps it on this device\. /.test(delApp), `deleting its window says the window is deleted and the work in 21Timer isn’t touched (${delApp})`);
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.waitForTimeout(200);
    // Erase everything and Export don't reach the apps' work, and say so.
    const allNamed = t => Object.values(APPS).every(([name]) => t.includes(name));
    await page.click('#settings [data-act="erase"]'); await page.waitForTimeout(300);
    let said = await page.locator('#modal.open').innerText();
    ok(allNamed(said) && /Work in 21Sketch, 21Timer, and 21DocCam isn’t erased here\. Clear it in each app\./.test(said), 'Erase everything says the apps keep their own work, which it doesn’t erase: ' + said.replace(/\n/g, ' '));
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.click('.picker-btn.left'); await page.click('[data-ctl="export"]'); await page.waitForTimeout(300);
    said = await page.locator('#modal.open').innerText();
    ok(allNamed(said) && /Work in 21Sketch, 21Timer, and 21DocCam isn’t in the file\. Save it in each app\./.test(said), 'so does Export: their work isn’t in the file');
    await page.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await page.waitForTimeout(200);

    // ---- Exports and Board history keep the window, never content.
    const full = await B(() => window.__board21.buildExport('full')), tpl = await B(() => window.__board21.buildExport('template'));
    const inExp = (e, id) => e.instances.find(i => i.widgetId === id);
    ok(Object.keys(APPS).every(id => { const i = inExp(full, id); return i && i.open && i.rect.w > 0 && i.data === null && i.config === null; }) && Object.keys(APPS).every(id => inExp(tpl, id)) && !/ccsd21/.test(JSON.stringify(full)),
      'a full backup and a template keep each window (where, open), with no content and no address');
    await B(() => window.__board21.history.cfg({ quiet: 300, every: 900, skipOpen: true }));
    const hid = await B(() => window.__board21.history.save('District apps'));
    const hexp = hid && await B(async id => (await window.__board21.history.get(id)).body.exp, hid);
    ok(!!hexp && Object.keys(APPS).every(id => { const i = inExp(hexp, id); return i && i.data === null; }), 'a Board history version keeps the windows too, with no content');

    // ---- A crafted file can't point a window anywhere else: the address comes from the registry only.
    const crafted = JSON.parse(JSON.stringify(full));
    crafted.instances.forEach(i => { if (APPS[i.widgetId]) Object.assign(i, { entry: 'https://evil.example/', src: 'https://evil.example/', url: 'https://evil.example/', data: { entry: 'https://evil.example/' } }); });
    crafted.widgets = [{ id: '21sketch', entry: 'https://evil.example/', external: true }];
    await B(o => window.__board21.applyImport(o, 'replace'), crafted); await page.waitForTimeout(1500);
    const srcs = await B(() => Array.from(document.querySelectorAll('.win iframe')).map(f => f.getAttribute('src')));
    ok(Object.values(APPS).every(([, url]) => srcs.includes(url)) && !srcs.some(s => /evil/.test(s)), 'a crafted .21board file with another address still opens the real ones: ' + srcs.join(' '));
    ok(await B(() => Array.from(window.__board21.state.wins.values()).every(w => !w.connected)), 'and the windows still take no messages (the data it carried is never handed to the app)');

    // ---- "Add to this page" adds no second window of an app the board has.
    const addFile = JSON.parse(JSON.stringify(tpl));
    addFile.instances.push(Object.assign({}, inExp(tpl, '21doccam'), { widgetId: 'dice', n: 1 }));
    fs.writeFileSync(OUT + 'district-apps-add.21board', JSON.stringify(addFile));
    await page.setInputFiles('#import-input', OUT + 'district-apps-add.21board'); await page.waitForTimeout(300);
    await page.locator('#modal.open .btn', { hasText: 'Add to this page' }).click(); await page.waitForTimeout(1500);
    const keys = await B(() => Array.from(window.__board21.state.insts.keys()).sort().join());
    ok(keys === '21doccam:1,21sketch:1,21timer:1,dice:1' && await page.locator('.toast', { hasText: 'Added 1 window.' }).count() === 1, 'adding a file with the three apps and Dice adds only Dice (“Added 1 window.”): ' + keys);
    await B(() => window.__board21.closeWin('dice:1', { quiet: true })); await page.waitForTimeout(300);

    // ---- Offline: a hint beside the name and once in a toast, never over the app; gone when back online.
    await B(() => { const b = window.__board21; b.openWidget('dice'); b.setRect('dice:1', { x: 1200, y: 20, w: 360, h: 280 }); b.focusWin('21sketch:1'); });
    await page.waitForTimeout(600);
    const subs = () => B(() => Object.fromEntries(Array.from(document.querySelectorAll('.win')).map(w => [w.dataset.ikey, w.querySelector('.sub').textContent])));
    await ctx.setOffline(true); await page.waitForTimeout(800);
    let s = await subs();
    ok(s['21sketch:1'] === 'Offline' && s['21timer:1'] === 'Offline' && s['21doccam:1'] === 'Offline' && s['dice:1'] === '', 'offline, each district app’s title bar says Offline (not other widgets’): ' + JSON.stringify(s));
    const told = page.locator('.toast', { hasText: 'work only if they’re saved on this device' });
    const toldText = await told.count() === 1 ? await told.locator('span').innerText() : '';
    ok(Object.values(APPS).every(([name]) => toldText.includes(name)) && / and /.test(toldText) && /^You’re offline\. .+ work only if they’re saved on this device\.$/.test(toldText), 'and one toast says you’re offline, and they work only if they’re saved on this device: ' + toldText);
    ok(await onTop('21sketch:1'), 'nothing covers the app (it may well work offline)');
    await page.screenshot({ path: OUT + '91-district-apps-offline.png' });
    await ctx.setOffline(false); await page.waitForTimeout(800);
    s = await subs();
    ok(Object.values(s).every(v => v === ''), 'back online, the hint goes');

    // ---- Not part of 21Board's offline copy or its release stamp.
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const listed = Object.keys(require('vm').runInNewContext('(' + /\bconst FILES = (\{[^}]*\});/.exec(sw)[1] + ')'));
    ok(stamped() && listed.length > 10 && !listed.some(f => /ccsd21|^https?:/.test(f)), 'the release stamp lists none of their addresses (and matches the files)');
    const ctl = await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).then(() => true, () => false);
    const cached = ctl ? await B(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; }) : [];
    ok(ctl && cached.length === listed.length && !cached.some(u => /ccsd21/.test(u)), `the offline copy saves without them (${cached.length} files)`);

    // ---- Dark theme: the board’s chrome follows it; the apps keep their own look.
    await B(() => window.__board21.focusWin('21doccam:1'));
    await setTheme(page, 'dark');
    await page.screenshot({ path: OUT + '92-district-apps-dark.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // ---- Kiosk on a flat panel (touch): one person draws in 21Sketch while another uses Dice; no “Open in new tab”
    // (a kiosk can’t open tabs).
    const kctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
    await standIns(kctx);
    const k = await kctx.newPage();
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k); await freeBoard(k);
    await k.evaluate(() => { const b = window.__board21; b.openWidget('21sketch'); b.openWidget('dice'); b.setRect('21sketch:1', { x: 20, y: 20, w: 700, h: 480 }); b.setRect('dice:1', { x: 760, y: 20, w: 360, h: 280 }); b.focusWin('dice:1'); });
    await k.waitForTimeout(1500);
    const kr = await k.locator('.win[data-ikey="21sketch:1"] .win-body').boundingBox(), kd = await k.locator('.win[data-ikey="dice:1"] .win-body').boundingBox();
    const ktaps = () => frameOf(k, '21sketch').evaluate(() => window.__taps);
    for (let i = 0; i < 2; i++) {
      await k.touchscreen.tap(kd.x + kd.width / 2, kd.y + kd.height / 2); await k.waitForTimeout(250);
      await k.touchscreen.tap(kr.x + kr.width / 2, kr.y + kr.height / 2); await k.waitForTimeout(250);
    }
    ok(await ktaps() === 2 && await k.evaluate(() => window.__board21.state.focused) === 'dice:1', 'with nothing over 21Sketch, each touch in it reaches the app, however often Dice is touched in between');
    await k.evaluate(() => { const b = window.__board21; b.setRect('dice:1', { x: 600, y: 20, w: 360, h: 280 }); b.focusWin('dice:1'); }); await k.waitForTimeout(300);
    await k.touchscreen.tap(kr.x + kr.width / 2, kr.y + kr.height / 2); await k.waitForTimeout(300);
    ok(await k.evaluate(() => window.__board21.state.focused) === '21sketch:1' && await ktaps() === 2, 'with Dice partly over it, a touch inside 21Sketch brings it to the front');
    await k.tap('.win[data-ikey="21sketch:1"] .win-label'); await k.waitForTimeout(250);
    ok(await k.locator('#menu [data-act="own"]').count() === 0 && await k.locator('#menu [data-act="reload"]').count() === 1 && await k.locator('#menu [data-act="close"]').count() === 1, 'in kiosk mode its menu has “Refresh 21Sketch” but no “Open in new tab”');
    await kctx.close();

    // ---- Opened from disk there is no origin to check messages by: the board still takes none from these apps.
    const fctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    await standIns(fctx);
    const fp = await fctx.newPage();
    await fp.goto('file://' + path.join(ROOT, 'index.html').split(path.sep).join('/').replace(/^\/?/, '/')); await fp.waitForTimeout(600);
    await fp.evaluate(() => { window.__board21.openWidget('21sketch'); window.__board21.openWidget('notes'); }); await fp.waitForTimeout(2000);
    ok(!!frameOf(fp, '21sketch') && await fp.evaluate(() => { const w = window.__board21.state.wins; return !w.get('21sketch:1').connected && !w.get('21sketch:1').inst.maximized && !window.__board21.state.data.has('21sketch:1') && w.get('notes:1').connected; }),
      'opened from disk, Notes connects as usual but 21Sketch’s hello, save and maximize are ignored');
    await fctx.close();
    ok(!stray.length, 'nothing went to the real sites (or anywhere else): ' + stray.join(' '));
  }],

  // Release 2026.11.22-1: Tyler's Yes picks from the Standards Alignment doc. Steps light four rule cells in Amplify's
  // order, ( ), xⁿ √, × ÷, and + −, in place of the PEMDAS letters (6.EE.A.2c). ± leaves 0 alone (6.NS.C.6a). 21Board
  // says "your school Google Drive" where it tells a teacher where their work goes (5:125-AP1 G.3). The Teacher Guide's
  // grade labels follow where the Illinois standards place each skill.
  ['Standards picks: rule cells, ± and 0, school Drive, and grade labels', async (browser) => {
    const errors = [];
    // Each part runs on its own: one that stops early is reported, and the next still runs.
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const CELLS = ['( )', 'xⁿ √', '× ÷', '+ −'];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // A board with one Calculator, and what to do with it: its keys, its menu, its size, and the Steps row as it shows.
    const calcBoard = async (opts = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page); await freeBoard(page);
      const ik = await addWin(page, 'calculator');
      await eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
      await page.waitForTimeout(600);
      const W = page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
      const front = () => page.evaluate(ik => { if (window.__board21.state.focused !== ik) window.__board21.focusWin(ik); }, ik);
      const press = async keys => { await front(); for (const k of keys) await W.locator(`#keys .key[data-key="${k}"]`).click({ timeout: 3000 }); await page.waitForTimeout(200); };
      const choose = async label => {
        await front();
        await page.click(`.win[data-ikey="${ik}"] .win-label`);
        await page.locator('#menu [data-act="widget"]').filter({ has: page.locator('.label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click({ timeout: 3000 });
        await page.waitForTimeout(600);
      };
      const setSize = (w, h) => page.evaluate(([ik, w, h]) => window.__board21.setRect(ik, Object.assign({}, window.__board21.state.insts.get(ik).rect, { w, h: h + 40 })), [ik, w, h]).then(() => page.waitForTimeout(700));
      const next = async () => { await W.locator('#next').click(); await page.waitForTimeout(250); };
      // The Steps row: each cell's label as drawn (a <sup> n is ⁿ), which are lit and soft, whether all of it shows, and
      // the rule's words.
      const rules = () => W.locator('html').evaluate(() => {
        const $ = id => document.getElementById(id), row = document.querySelector('#player .rules');
        const label = b => Array.from(b.childNodes).map(n => n.nodeName === 'SUP' ? n.textContent.replace(/n/g, 'ⁿ') : n.textContent).join('').replace(/\s+/g, ' ').trim();
        const out = { cells: [], lit: [], soft: [], words: $('rule').textContent, count: $('count').textContent, cv: $('canvas').getBoundingClientRect().width,
          old: !!document.querySelector('.pemdas') || /\bP\s*E\s*M\s*D\s*A\s*S\b/.test($('player').textContent) };
        if (!row) return out;
        const cells = Array.from(row.children), r = row.getBoundingClientRect(), back = $('back').getBoundingClientRect();
        const x = row.querySelector('i'), sup = row.querySelector('sup');
        return Object.assign(out, {
          cells: cells.map(label), lit: cells.filter(b => b.classList.contains('lit')).map(label), soft: cells.filter(b => b.classList.contains('soft')).map(label),
          aria: row.getAttribute('aria-hidden'), shown: $('player').getClientRects().length > 0 && getComputedStyle(row).visibility !== 'hidden',
          // Every cell whole inside the row, and the row clear of Back.
          fit: cells.every(b => { const c = b.getBoundingClientRect(); return c.width > 0 && c.left >= r.left - 0.5 && c.right <= r.right + 0.5; }) && r.right <= back.left + 0.5 && row.scrollWidth <= row.clientWidth + 0.5,
          room: Math.round((r.right - Math.max(...cells.map(b => b.getBoundingClientRect().right))) * 10) / 10,
          italic: !!x && x.textContent === 'x' && getComputedStyle(x).fontStyle === 'italic', sup: !!x && !!sup && sup.textContent === 'n' && !!sup.closest('b') && sup.closest('b') === x.closest('b'),
          px: parseFloat(getComputedStyle(cells[0]).fontSize)
        });
      });
      return { ctx, page, ik, W, press, choose, setSize, next, rules };
    };
    const show = r => `${r.cells.join(' | ')}; lit ${r.lit.join(' | ') || 'none'}; soft ${r.soft.join(' | ') || 'none'}; “${r.words}”`;

    // ---- 1. The Steps row: four rule cells, lit as each step's rule says.
    await part('Rule cells', async () => {
      const C = await calcBoard();
      let r = await C.rules();
      ok(same(r.cells, CELLS) && r.aria === 'true' && !r.old, `the Steps row has four cells, ( ), xⁿ √, × ÷, and + −, hidden from a screen reader, and no PEMDAS letters (${r.cells.join(' | ')}; aria-hidden ${r.aria})`);
      ok(r.italic && r.sup, `the x is italic and the n a superscript, as the keys draw a and b (italic ${r.italic}, sup ${r.sup})`);
      // 2 + 3 × 4: × ÷, then + −, then none on the answer.
      await C.press(['clear', '2', 'add', '3', 'multiply', '4', 'equals']); await C.next(); r = await C.rules();
      ok(same(r.lit, ['× ÷']) && !r.soft.length && r.words === 'Multiply and divide, left to right', `2 + 3 × 4, step 1: × ÷ lights (${show(r)})`);
      await C.next(); r = await C.rules();
      ok(same(r.lit, ['+ −']) && !r.soft.length && r.words === 'Add and subtract, left to right', `step 2: + − lights (${show(r)})`);
      await C.next(); r = await C.rules();
      ok(same(r.cells, CELLS) && !r.lit.length && !r.soft.length, `the answer lights none (${show(r)})`);
      // (2 + 3) × 4: ( ) lights with + − soft, then × ÷.
      await C.press(['clear', 'open', '2', 'add', '3', 'close', 'multiply', '4', 'equals']); await C.next(); r = await C.rules();
      ok(same(r.lit, ['( )']) && same(r.soft, ['+ −']) && r.words === 'Parentheses first', `(2 + 3) × 4, step 1: ( ) lights, + − soft (${show(r)})`);
      await C.next(); r = await C.rules();
      ok(same(r.lit, ['× ÷']) && !r.soft.length, `step 2: × ÷ lights (${show(r)})`);
      // 2³ and √9: xⁿ √.
      await C.choose('Advanced keys');
      await C.press(['clear', '2', 'power', '3', 'equals']); await C.next(); r = await C.rules();
      ok(same(r.lit, ['xⁿ √']) && !r.soft.length && r.words === 'Exponents and roots', `2³: xⁿ √ lights (${show(r)})`);
      await C.press(['clear', 'sqrt', '9', 'equals']); await C.next(); r = await C.rules();
      ok(same(r.lit, ['xⁿ √']), `√9: xⁿ √ lights (${show(r)})`);
      // √(9 + 16): inside the root, + − soft and nothing on ( ). Then the root.
      await C.press(['clear', 'sqrt', '9', 'add', '1', '6', 'equals']); await C.next(); r = await C.rules();
      ok(!r.lit.length && same(r.soft, ['+ −']) && r.words === 'Inside first', `√(9 + 16), step 1: + − soft, nothing on ( ) (${show(r)})`);
      await C.next(); r = await C.rules();
      ok(same(r.lit, ['xⁿ √']), `step 2, √25: xⁿ √ lights (${show(r)})`);
      // 10% of 50: × ÷.
      await C.press(['clear', '1', '0', 'percent', '5', '0', 'equals']); await C.next(); r = await C.rules();
      ok(same(r.lit, ['× ÷']), `10% of 50: × ÷ lights (${show(r)})`);
      await C.choose('Advanced keys');
      // −(−3): the opposite lights none.
      await C.press(['clear', 'subtract', 'open', 'subtract', '3', 'close', 'equals']); await C.next(); r = await C.rules();
      ok(same(r.cells, CELLS) && !r.lit.length && !r.soft.length && r.words === 'The opposite', `−(−3) lights none (${show(r)})`);
      // An error shows soft: 5 + 3 ÷ (2 − 2), at Can't divide by 0.
      await C.press(['clear', '5', 'add', '3', 'divide', 'open', '2', 'subtract', '2', 'close', 'equals']); await C.next(); await C.next(); r = await C.rules();
      ok(!r.lit.length && same(r.soft, ['× ÷']) && /divide by 0/.test(r.words), `an error shows its cell soft (${show(r)})`);
      await C.ctx.close();
    });

    // ---- 2. The cells fit wherever the letters showed: from a canvas 400 px wide. Below that they hide. Light and dark,
    // every accent, and all three text styles.
    await part('Rule cells: size, colors, and text styles', async () => {
      const C = await calcBoard();
      await C.press(['clear', '2', 'add', '3', 'multiply', '4', 'equals']); await C.next();
      // The window width where the canvas is first 400 px wide, beside the keys at 600 px tall.
      let at400 = null, below = null;
      for (let w = 696; w <= 712 && !at400; w++) { await C.setSize(w, 600); const r = await C.rules(); if (r.cv >= 400) at400 = [w, r]; else below = [w, r]; }
      ok(!!at400 && at400[1].cv < 401 && at400[1].shown && at400[1].fit, `a canvas ${at400 && at400[1].cv.toFixed(1)} px wide: all four cells show, whole, clear of Back (${at400 && at400[1].room} px to spare)`);
      ok(!!below && below[1].cv < 400 && below[1].cells.length === 4 && !below[1].shown, `a canvas ${below && below[1].cv.toFixed(1)} px wide: they hide, as the letters did (${below && below[1].cells.length} cells)`);
      // The stacked layout, a canvas just over 400 px wide, and big windows.
      for (const [w, h] of [[420, 900], [900, 600], [1300, 640]]) {
        await C.setSize(w, h); const r = await C.rules();
        ok(r.shown && r.fit, `${w} × ${h}, a canvas ${r.cv.toFixed(1)} px wide: the cells fit (${r.room} px to spare, ${(r.px || 0).toFixed(1)} px type)`);
      }
      // Every text style, at the narrowest canvas that shows them.
      for (const style of ['legible', 'early', 'standard']) {
        await openSettings(C.page, ['letters']); await C.page.click(`#settings [data-act="letters"][data-val="${style}"]`); await C.page.keyboard.press('Escape'); await C.page.waitForTimeout(900);
        await C.setSize(at400 ? at400[0] : 704, 600); const r = await C.rules();
        ok(r.shown && r.fit && same(r.cells, CELLS), `${style}, a canvas ${r.cv.toFixed(1)} px wide: the four cells fit (${r.room} px to spare)`);
      }
      await C.setSize(900, 600);
      // Colors: the lit cell, a soft cell, and a plain one read on the canvas, light and dark, in every accent.
      await C.press(['clear', 'open', '2', 'add', '3', 'close', 'multiply', '4', 'equals']); await C.next();
      const inks = () => C.W.locator('html').evaluate(() => {
        const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const over = (c, bg) => { g.clearRect(0, 0, 1, 1); g.fillStyle = bg; g.fillRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; };
        const card = getComputedStyle(document.getElementById('card')).backgroundColor, theme = document.documentElement.getAttribute('data-b21-theme');
        const one = sel => { const b = document.querySelector(sel); if (!b) return null; b.style.transition = 'none'; const cs = getComputedStyle(b), bg = over(cs.backgroundColor, card); return { fg: over(cs.color, bg), bg }; };
        return { theme, lit: one('.rules b.lit'), soft: one('.rules b.soft'), plain: one('.rules b:not(.lit):not(.soft)') };
      });
      const bad = [];
      for (const theme of ['light', 'dark']) {
        await setTheme(C.page, theme);
        for (const accent of ['blue', 'purple', 'red', 'orange', 'green', 'slate']) {
          await openSettings(C.page, ['bg']); await C.page.click(`#settings [data-act="accent"][data-val="${accent}"]`); await C.page.keyboard.press('Escape'); await C.page.waitForTimeout(400);
          const k = await inks();
          if (!k.lit || !k.soft || !k.plain || k.theme !== theme || contrast(k.lit.fg, k.lit.bg) < 4.5 || contrast(k.soft.fg, k.soft.bg) < 4.5 || contrast(k.plain.fg, k.plain.bg) < 3)
            bad.push(`${theme} ${accent}: ${JSON.stringify(k)}`);
        }
      }
      ok(!bad.length, `light and dark, in all six accents: the lit cell and a soft one read 4.5:1 or more, a plain one 3:1${bad.length ? ': ' + bad.join(' | ') : ''}`);
      await C.ctx.close();
    });

    // ---- 3. ± leaves 0 alone; right after an operator it starts a lone −.
    await part('± and 0', async () => {
      const C = await calcBoard();
      await C.choose('In words');
      const said = [];
      const look = async () => {
        const l = await C.W.locator('html').evaluate(() => {
          const t = id => { const e = document.getElementById(id); if (!e) return ''; const c = e.cloneNode(true); c.querySelectorAll('.ce-anslabel, .ce-cursor, .heq').forEach(n => n.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
          return { eq: t('eq'), big: t('big'), x: t('x'), said: t('said'), live: t('live') };
        });
        said.push(l.said, l.live);
        return l;
      };
      const NEG0 = /−\s?0(?:\.0*)?(?![.0-9])/;
      const neg0 = l => [l.eq, l.big, l.x, l.said].some(s => NEG0.test(s));
      await C.press(['clear']); let a = await look();
      await C.press(['negate']); let b = await look();
      ok(same(a, b) && !neg0(b), `AC, then ± changes nothing (${b.eq || b.big})`);
      await C.press(['0']); a = await look(); await C.press(['negate']); b = await look();
      ok(same(a, b) && !neg0(b), `0 ± changes nothing (${b.eq})`);
      await C.press(['point']); a = await look(); await C.press(['negate']); b = await look();
      ok(same(a, b) && !neg0(b) && /0\./.test(b.eq), `0. ± changes nothing (${b.eq})`);
      await C.press(['clear', '5', 'add', 'negate']); b = await look();
      ok(!neg0(b), `5 + ± shows no −0 (${b.eq})`);
      await C.press(['3', 'equals']); b = await look();
      ok(b.eq === '5 + (−3) = 2', `5 + ± 3 = is 2 (${b.eq})`);
      await C.press(['clear', '5', 'add', 'negate', 'negate', '3', 'equals']); b = await look();
      ok(b.eq === '5 + 3 = 8', `5 + ± ± 3 = is 8 (${b.eq})`);
      await C.press(['clear', '5', 'add', 'negate', '3', 'negate', 'equals']); b = await look();
      ok(b.eq === '5 + 3 = 8', `5 + ± 3 ± = is 5 + 3 = 8, as before (${b.eq})`);
      await C.press(['clear', '5', 'add', 'negate', '0', 'equals']); b = await look();
      ok(b.eq === '5 + 0 = 5' && !neg0(b), `5 + ± 0 = is 5 + 0 = 5, with no −0 (${b.eq})`);
      await C.press(['clear', '0', 'point', '5', 'negate', 'backspace', 'backspace', 'equals']); b = await look();
      ok(b.eq === '0 = 0' && !neg0(b), `0.5 ± ⌫ ⌫ = is 0 = 0, with no −0 (${b.eq})`);
      await C.choose('Advanced keys');
      await C.press(['clear', '5', 'multiply', 'negate', '3', 'square', 'equals']); b = await look();
      ok(b.eq === '5 × (−3)2 = 45', `5 × ± 3 a² = is 5 × (−3)² = 45, as before: ± makes the number itself negative (${b.eq}, the 2 a power)`);
      await C.choose('Advanced keys');
      await C.press(['clear', '3', 'negate']); b = await look();
      await C.press(['negate']); const b2 = await look();
      ok(b.eq === '−3' && b2.eq === '3', `3 ± is −3, and 3 ± ± is 3 (${b.eq}, ${b2.eq})`);
      await C.press(['clear', '5', 'subtract', '5', 'equals']); a = await look(); await C.press(['negate']); b = await look();
      ok(a.eq === '5 − 5 = 0' && same(a, b), `an answer of 0, then ±, stays 0 (${b.eq})`);
      ok(!said.some(s => /negative 0(?:\.0*)?(?![.0-9])/.test(s)), `In words never says “negative 0” (${said.filter(Boolean).slice(-3).join(' | ')})`);
      await C.choose('History');
      const hist = await C.W.locator('html').evaluate(() => Array.from(document.querySelectorAll('#hlist .hline')).map(li => [li.textContent, ...Array.from(li.querySelectorAll('[aria-label]')).map(b => b.getAttribute('aria-label'))].join(' ')).join(' | '));
      const z = /−\s?0(?:\.0*)?(?![.0-9])|negative 0(?:\.0*)?(?![.0-9])/.exec(hist);
      ok(/Change 5 \+ 0\b/.test(hist) && !z, `History has 5 + 0, with no −0 (${z ? hist.slice(Math.max(0, z.index - 60), z.index + 20) : hist.split(' | ').filter(l => /\+ 0\b/.test(l)).join(' | ')})`);
      await C.choose('History');
      await C.ctx.close();
    });

    // ---- 4. "your school Google Drive": README, the Teacher Guide, Board Sync's set-up, and Settings › About.
    await part('Drive words', async () => {
      const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' ');
      const guide = fs.readFileSync(path.join(ROOT, 'docs', 'teacher-guide', 'page-src.html'), 'utf8').replace(/\s+/g, ' ');
      const OWN = /your own (Google )?Drive|your Drive folder|and your Google Drive|in your own Drive/i;
      ok(!OWN.test(readme), 'README: no “your own Google Drive”');
      const card = id => { const i = guide.indexOf(`id="${id}"`); return i < 0 ? '' : guide.slice(i, guide.indexOf('</article>', i)); };
      const lines = [
        [card('w-name-picker'), 'Names are only stored on your computer and your school Google Drive.'],
        [card('w-zones-check-in'), 'Counts are only stored on your computer and your school Google Drive.'],
        [guide, 'Board Sync keeps one board on all your devices, through a folder in your school Google Drive.'],
        [guide, 'Turn on Board Sync and Chrome also keeps a copy in a folder you choose, in your school Google Drive.'],
        [guide, 'Settings › Advanced › Back up now saves every page in one .21board file. Keep it in your school Google Drive or on a USB drive.']];
      for (const [where, line] of lines) ok(where.includes(line), `the Teacher Guide: “${line}”`);
      ok(!OWN.test(guide), 'the Teacher Guide never says “your own Google Drive” or “your Google Drive”');
      const app = ['board.js', 'index.html'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')).join('\n');
      ok(!OWN.test(app), 'board.js and index.html say no “your own Google Drive” or “your Drive folder” to a teacher');
      // Board Sync's set-up says it.
      const D = await driveDevice(browser); D.p.on('pageerror', e => errors.push('[sync] ' + e.message));
      await D.p.goto(BASE); await boardUp(D.p);
      await openSettings(D.p);
      await D.p.click('#settings [data-act="link-setup"]'); await D.p.waitForSelector('#modal.open');
      const setup = (await D.p.locator('#modal.open .modal-card').innerText()).replace(/\s+/g, ' ');
      ok(setup.includes('Board Sync keeps your board in your school Google Drive, so your laptop and smartboard share it.'), `Board Sync’s set-up: “Board Sync keeps your board in your school Google Drive, …” (${setup.slice(0, 160)})`);
      await D.p.locator('#modal.open .btn', { hasText: 'Cancel' }).click(); await D.p.keyboard.press('Escape'); await D.p.waitForTimeout(300);
      // Settings › About, once linked.
      await linkFolder(D.p, 'the laptop');
      await openSettings(D.p, ['about']);
      const about = (await D.p.locator('#settings .about').innerText()).replace(/\s+/g, ' ');
      ok(about.includes('Your work is stored only on this device and in your school Google Drive.') && !/your Drive folder/.test(about), `Settings › About with Board Sync: “… and in your school Google Drive.” (${about.slice(-90)})`);
      await D.c.close();
    });

    // ---- 5. The Teacher Guide's grade labels follow the standards; the docs name each step's rule, not PEMDAS.
    await part('Grade labels and docs', async () => {
      const guide = fs.readFileSync(path.join(ROOT, 'docs', 'teacher-guide', 'page-src.html'), 'utf8');
      const ideas = id => { const i = guide.indexOf(`id="${id}"`), j = guide.indexOf('<ul class="ideas">', i), k = guide.indexOf('</ul>', j);
        return i < 0 || j < 0 ? [] : Array.from(guide.slice(j, k).matchAll(/<li><span class="grade">([^<]*)<\/span><span>([^<]*)<\/span><\/li>/g)).map(m => [m[1], m[2]]); };
      const want = {
        'w-calculator': [['K–2', 'Choral count. Type 10 + 10, then press = again and again. Grade 2 can try 5 + 5.'], ['3–6', 'Order of operations. Type 2 + 3 × 4, then Next step. Each step lights its rule.'], ['4–5', 'Remainders. Pick With remainders in Calculator ⌄, then type 17 ÷ 5.'], ['6–7', 'Percent. Turn on Advanced keys in Calculator ⌄, then type 15 % 80. It shows 15% of 80 = 12.']],
        'w-dice': [['K–2', 'Turn off Show total. Students add, then turn it on to check.'], ['2–3', 'Roll 3 dice. Who can make the biggest three-digit number?'], ['4–5', 'Roll 6 dice. Who can make the biggest six-digit number?'], ['6–7', 'Predict the most common total. Then roll 2 dice 30 times and tally.']]
      };
      for (const [id, list] of Object.entries(want)) { const got = ideas(id); ok(same(got, list), `the guide’s ${id.slice(2)} ideas: ${got.map(g => g[0] + ' ' + g[1]).join(' / ')}`); }
      const clock = ideas('w-clock'), hour = clock.find(c => c[1] === 'Teaching with Hour hand only. Read the hour first, then add the minute hand.');
      ok(!!hour && hour[0] === '1' && same(clock.map(c => c[0]), ['K–2', '1', '1–3', '3–5', '6–8']),
        `the guide’s Clock ideas: Hour hand only is grade 1, and the chips run in grade order (${clock.map(c => c[0]).join(', ')})`);
      ok(/\[1, 2, 3, 4, 5, 6\]\.map\(n => \(\{ id: 'count:' \+ n/.test(fs.readFileSync(path.join(ROOT, 'widgets', 'dice', 'index.html'), 'utf8')), 'the Dice rolls up to 6 dice, as the new idea asks');
      // PEMDAS is gone from the widget, the guides, and README. The manual draws the four cells.
      const files = ['widgets/calculator/index.html', 'widgets/calculator/calc-engine.js', 'README.md', 'docs/teacher-guide/page-src.html', 'docs/calculator-manual/page-src.html'];
      const named = files.filter(f => /pemdas/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
      ok(!named.length, `nothing says PEMDAS${named.length ? ': ' + named.join(', ') : ''}`);
      const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' ');
      const man = fs.readFileSync(path.join(ROOT, 'docs', 'calculator-manual', 'page-src.html'), 'utf8'), manText = man.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
      ok(['( )', '<i>x</i><sup><i>n</i></sup> √', '× ÷', '+ −'].every(c => man.includes(c)) && /class="rules"/.test(man), 'the manual draws the four rule cells in its own steps');
      ok(stamped(), STAMPED);
    });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ];
};
