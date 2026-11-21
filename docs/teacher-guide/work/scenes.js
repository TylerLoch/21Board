// The guide's screenshots, one scene each (node shoot.js <scene>). Layout rects are in board px: the 16:9 board at the
// default size (80%) is 2400 x 1350, drawn at 1366 x 768 (zoom 0.569).
const path = require('path');
const S = require('./shoot.js');
const { SCENES, newBoard, addWin, frame, setRect, deselect, choose, rectOf, around, shot, log, HERE } = S;
const wait = (p, ms) => p.waitForTimeout(ms);

const NAMES = ['Ava', 'Ben', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana'];
const AGENDA_LONG = 'Friday\n\n8:30 Morning meeting\n9:00 Reading groups\n10:15 Math: fractions\n11:30 Lunch\n12:15 Recess\n1:00 Science lab\n2:30 Library\n\nSign your reading log!';
const AGENDA = 'Friday\n1. Morning meeting\n2. Reading groups\n3. Math: fractions\n4. Lunch at 11:30\n5. Science lab';

// ---- widget set-ups, each through the widget's own buttons and menu
async function typeNote(p, ik, text) {
  const f = frame(p, ik);
  if (await f.locator('#view').isVisible()) await f.locator('#view').click();
  await f.locator('#t').fill(text);
  await p.evaluate(() => { const a = document.activeElement; if (a && a.tagName === 'IFRAME') a.blur(); });
  await wait(p, 400);
}
async function addNames(p, ik, names = NAMES) {
  const f = frame(p, ik);
  if (!await f.locator('#list').isVisible()) await f.locator('#go').click();   // (a new Name Picker opens on its list; else "Add names" opens it)
  await f.locator('#list').fill(names.join('\n'));
  await f.locator('#done').click();
  await wait(p, 400);
}
async function pickName(p, ik, ms = 11000) { await frame(p, ik).locator('#go').click(); await wait(p, ms); }
async function startTimer(p, ik, chip = '5m') {
  const f = frame(p, ik);
  await f.locator(`#chips button[data-min="${parseInt(chip)}"]`).click();
  await f.locator('#go').click();
}
async function light(p, ik, c) { await frame(p, ik).locator(`.lamp.${c}`).click(); await wait(p, 200); }
async function taskSchedule(p, ik, tasks) {
  const f = frame(p, ik);
  await f.locator('#btn-edit').click();
  await wait(p, 300);
  for (let i = 0; i < tasks.length; i++) {
    await f.locator('button', { hasText: '+ Add activity' }).click();
    await wait(p, 200);
    const card = f.locator('.task-card').nth(i);
    await card.locator('.task-name').fill(tasks[i].name);
    await card.locator('.task-mins').fill(String(tasks[i].min));
    if (tasks[i].emoji) {
      await card.locator('.btn-emoji-picker').click();
      await wait(p, 300);
      await f.locator('#gboard-search-input').fill(tasks[i].emoji);
      await wait(p, 300);
      await f.locator('#gboard-grid button').first().click();
      await wait(p, 300);
    }
  }
  await f.locator('button', { hasText: /^Done$/ }).first().click();
  await wait(p, 400);
}
async function ftCard(p, ik, which, search, label) {
  const f = frame(p, ik);
  await f.locator(which === 'first' ? '#btn-first' : '#btn-then').click();
  await wait(p, 300);
  await f.locator('#search-input').fill(search);
  await wait(p, 300);
  await f.locator('.aac-tile-btn', { hasText: label }).first().click();
  await wait(p, 500);
}
// Rolls until the dice don't all match (a first roll of all 1s looks like dice that never rolled).
async function rollDice(p, ik, n = 3) {
  if (n !== 1) await choose(p, ik, `${n} dice`, { exact: true });
  for (let i = 0; i < 6; i++) {
    await frame(p, ik).locator('#roll').click();
    await wait(p, 2500);
    const said = await frame(p, ik).locator('#said').textContent();
    const vals = (/Rolled ([\d, ]+)/.exec(said) || [, ''])[1].split(',').map(v => +v.trim()).filter(Boolean);
    log('  dice', said);
    if (new Set(vals).size === vals.length) break;
  }
}
// Zones Check-In: counts typed in its Counts view (Zones Check-In ⌄ › Edit counts), then Done.
async function zonesCounts(p, ik, counts) {
  await choose(p, ik, 'Edit counts', { exact: true });
  const f = frame(p, ik);
  for (const [zone, n] of Object.entries(counts)) await f.locator('#n-' + zone).fill(String(n));
  await f.locator('#edit-done').click();
  await wait(p, 900);   // (the bar grows to its place)
}
async function calcType(p, ik, keys) {
  const f = frame(p, ik);
  await f.locator('#app').click({ position: { x: 5, y: 5 } }).catch(() => {});
  for (const k of keys) { await p.keyboard.press(k); await wait(p, 60); }
  await wait(p, 600);
}
async function openPicture(p, ik, file) {
  const f = frame(p, ik);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), f.locator('#open').click()]);
  await fc.setFiles(file);
  await wait(p, 1500);
}
async function pickerOpen(p, side = 'left') { if (await p.locator(`#panel.open.${side}`).count()) return; await p.click(`.picker-btn.${side}`); await wait(p, 500); }
async function pickerClose(p) { await p.keyboard.press('Escape'); await wait(p, 300); if (await p.locator('#panel.open').count()) { await p.mouse.click(683, 300); await wait(p, 300); } }
async function darkMode(p) { await openSettings(p); await p.click('#settings [data-act="theme"][data-val="dark"]'); await wait(p, 400); await p.keyboard.press('Escape'); await wait(p, 300); }
async function openSettings(p, groups = [], side = 'left') {
  await pickerOpen(p, side);
  await p.click('.panel.open [data-ctl="settings"]');
  await p.waitForSelector('#settings.open');
  for (const g of groups) {
    const b = p.locator(`#settings [data-act="group"][data-val="${g}"]`);
    if (await b.getAttribute('aria-expanded') !== 'true') await b.click();
  }
  await wait(p, 500);
}
const settingsGroups = p => p.evaluate(() => Array.from(document.querySelectorAll('#settings [data-act="group"]')).map(b => b.dataset.val + '=' + b.innerText.replace(/\s+/g, ' ').trim()));
const union = (...bs) => { const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.width)), y1 = Math.max(...bs.map(b => b.y + b.height)); return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }; };
// The crop c made smaller at the top so that it stays below box h (the hint over an empty board).
const clear = (c, h) => { if (!h || h.y + h.height <= c.y || h.x >= c.x + c.width) return c; const y = Math.ceil(h.y + h.height + 2); return Object.assign({}, c, { y, height: c.y + c.height - y }); };
const padded = (b, pad = 24) => { const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad), x1 = Math.min(1366, b.x + b.width + pad), y1 = Math.min(768, b.y + b.height + pad); return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) }; };

// ---- 1. hero-board.jpg: a light board on a school morning
SCENES.hero = async () => {
  const { ctx, p } = await newBoard();
  const ik = {};
  for (const id of ['clock', 'calendar', 'notes', 'name-picker', 'traffic-light', 'timer']) ik[id] = await addWin(p, id);
  await setRect(p, ik.clock, { x: 60, y: 50, w: 470, h: 510 });
  await setRect(p, ik.calendar, { x: 60, y: 600, w: 470, h: 600 });
  await setRect(p, ik.notes, { x: 570, y: 50, w: 820, h: 1150 });
  await setRect(p, ik['name-picker'], { x: 1430, y: 690, w: 910, h: 510 });
  await setRect(p, ik.timer, { x: 1430, y: 50, w: 620, h: 470 });
  await setRect(p, ik['traffic-light'], { x: 2090, y: 50, w: 250, h: 599 });
  await wait(p, 800);
  await typeNote(p, ik.notes, AGENDA_LONG);
  await addNames(p, ik['name-picker']);
  await light(p, ik['traffic-light'], 'green');
  await pickName(p, ik['name-picker']);
  await startTimer(p, ik.timer);
  await wait(p, 9000);
  await deselect(p);
  await shot(p, 'hero-board.jpg');
  await ctx.close();
};

// ---- 2. hero-board-dark.jpg: dark theme, Notes on Chalkboard
SCENES.heroDark = async () => {
  const { ctx, p } = await newBoard();
  await darkMode(p);
  const ik = {};
  for (const id of ['clock', 'notes', 'task-timer', 'first-then-board', 'dice']) ik[id] = await addWin(p, id);
  await setRect(p, ik.clock, { x: 60, y: 50, w: 760, h: 385 });
  await setRect(p, ik.notes, { x: 60, y: 475, w: 760, h: 725 });
  await setRect(p, ik['task-timer'], { x: 860, y: 50, w: 640, h: 1150 });
  await setRect(p, ik['first-then-board'], { x: 1540, y: 50, w: 800, h: 560 });
  await setRect(p, ik.dice, { x: 1540, y: 650, w: 800, h: 550 });
  await wait(p, 800);
  await choose(p, ik.clock, 'Digital', { exact: true });
  await choose(p, ik.clock, 'Analog', { exact: true });   // (digital alone)
  await choose(p, ik.notes, 'Chalkboard', { exact: true });
  await typeNote(p, ik.notes, 'Do now\nWrite three words that rhyme with cat.');
  await taskSchedule(p, ik['task-timer'], [{ name: 'Reading', min: 20, emoji: 'book' }, { name: 'Writing', min: 15, emoji: 'pencil' }, { name: 'Clean up', min: 5, emoji: 'broom' }]);
  await ftCard(p, ik['first-then-board'], 'first', 'math', 'Math');
  await ftCard(p, ik['first-then-board'], 'then', 'play', 'Playground');
  await rollDice(p, ik.dice, 2);
  await frame(p, ik['task-timer']).locator('#btn-playpause').click();
  await wait(p, 4000);
  await deselect(p);
  await shot(p, 'hero-board-dark.jpg');
  await ctx.close();
};

// ---- 3. picker.jpg: the Widget Picker, all 16 tiles
SCENES.picker = async () => {
  const { ctx, p } = await newBoard();
  await pickerOpen(p, 'left');
  const tiles = await p.locator('#panel .widget-tile').count();
  log('  tiles', tiles, JSON.stringify(await p.$$eval('#panel .widget-tile .widget-name', els => els.map(e => e.textContent))));
  log('  controls', JSON.stringify(await p.$$eval('#panel .panel-controls [data-ctl]', els => els.filter(e => !e.hidden).map(e => e.dataset.ctl + ':' + (e.getAttribute('aria-label') || e.textContent)))));
  // (The hint on the empty board steps aside while the Widget Picker is open: the crop shows the panel alone.)
  const b = await p.locator('#panel').boundingBox(), btn = await p.locator('.picker-btn.left').boundingBox();
  await shot(p, 'picker.jpg', padded(union(b, btn), 24));
  await ctx.close();
};

// ---- 4. w-<id>.jpg: one window each
const W = {
  timer: { r: { w: 760, h: 560 }, set: async (p, ik) => { await startTimer(p, ik); await wait(p, 6000); } },
  'task-timer': { r: { w: 760, h: 1000 }, set: async (p, ik) => { await taskSchedule(p, ik, [{ name: 'Reading', min: 20, emoji: 'book' }, { name: 'Writing', min: 15, emoji: 'pencil' }, { name: 'Clean up', min: 5, emoji: 'broom' }]); await frame(p, ik).locator('#btn-playpause').click(); await wait(p, 5000); } },
  calendar: { r: { w: 840, h: 760 } },
  notes: { r: { w: 820, h: 640 }, set: (p, ik) => typeNote(p, ik, AGENDA) },
  'name-picker': { r: { w: 900, h: 700 }, set: async (p, ik) => { await addNames(p, ik); await choose(p, ik, 'Spinning wheel', { exact: true }); await pickName(p, ik); } },
  'first-then-board': { r: { w: 1080, h: 760 }, set: async (p, ik) => { await ftCard(p, ik, 'first', 'math', 'Math'); await ftCard(p, ik, 'then', 'play', 'Playground'); } },
  'zones-check-in': { r: { w: 560, h: 460 }, set: (p, ik) => zonesCounts(p, ik, { blue: 2, green: 9, yellow: 4, red: 1 }) },   // (the size it opens at)
  dice: { r: { w: 820, h: 560 }, set: (p, ik) => rollDice(p, ik, 3) },
  'youtube-player': { r: { w: 960, h: 580 } },
  image: { r: { w: 1080, h: 760 }, set: async (p, ik) => { await openPicture(p, ik, path.join(HERE, 'water-cycle.svg')); await setRect(p, ik, { x: 660, y: 245, w: 1080, h: 760 }); await wait(p, 800); } },
  calculator: { r: { w: 900, h: 640 }, at: { x: 200, y: 120 }, set: async (p, ik) => { await choose(p, ik, 'History', { exact: true }); await calcType(p, ik, ['Digit2', 'Digit5', 'Shift+Equal', 'Digit1', 'Digit7', 'Enter']); await calcType(p, ik, ['Digit1', 'Digit2', 'Shift+Digit8', 'Digit4', 'Enter']); } },
  '21sketch': { r: { w: 1400, h: 900 }, ext: true, set: async (p, ik) => { await wait(p, 4000); await sketch(p, ik); } },
  '21timer': { r: { w: 820, h: 600 }, ext: true, set: async (p, ik) => { await wait(p, 4000); await timer21(p, ik); } },
  '21doccam': { r: { w: 1280, h: 760 }, ext: true, camera: true, set: async p => { await wait(p, 6000); } }
};
// A few strokes in 21Sketch with its pen: a triangle, a square and a circle (rough, as a hand draws them).
async function sketch(p, ik) {
  const b = await p.locator(`.win[data-ikey="${ik}"] iframe`).boundingBox();
  const at = (fx, fy) => [b.x + b.width * fx, b.y + b.height * fy];
  const stroke = async pts => {
    const [x0, y0] = at(...pts[0]); await p.mouse.move(x0, y0); await p.mouse.down();
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = at(...pts[i - 1]), [bx, by] = at(...pts[i]);
      for (let k = 1; k <= 8; k++) await p.mouse.move(ax + (bx - ax) * k / 8, ay + (by - ay) * k / 8);
    }
    await p.mouse.up(); await wait(p, 500);
  };
  await stroke([[0.22, 0.7], [0.32, 0.3], [0.42, 0.7], [0.22, 0.7]]);
  await stroke([[0.46, 0.32], [0.6, 0.32], [0.6, 0.7], [0.46, 0.7], [0.46, 0.32]]);
  const circle = []; for (let i = 0; i <= 36; i++) { const a = i / 36 * Math.PI * 2; circle.push([0.75 + 0.075 * Math.cos(a), 0.5 + 0.19 * Math.sin(a)]); }
  await stroke(circle);
}
async function timer21(p, ik) {
  const f = frame(p, ik);
  const play = f.locator('button[aria-label="Start"], button[title="Start"]').first();
  log('  21Timer buttons', JSON.stringify(await f.locator('button').evaluateAll(bs => bs.map(b => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim()))));
  await play.click().catch(e => log('  21Timer play failed', e.message));
  await wait(p, 4000);
}
for (const [id, cfg] of Object.entries(W)) {
  SCENES['w-' + id] = async () => {
    const { ctx, p, blocked } = await newBoard({ camera: !!cfg.camera });
    const ik = await addWin(p, id);
    const r = Object.assign({ x: Math.round((2400 - cfg.r.w) / 2), y: Math.round((1290 - cfg.r.h) / 2) }, cfg.at || {}, cfg.r);
    await setRect(p, ik, r);
    await wait(p, 800);
    if (cfg.set) await cfg.set(p, ik);
    await deselect(p);
    await wait(p, 300);
    log('  title', JSON.stringify(await p.locator(`.win[data-ikey="${ik}"] .win-title, .win[data-ikey="${ik}"] .win-label`).first().innerText()), 'rect', JSON.stringify(await p.evaluate(ik => window.__board21.state.insts.get(ik).rect, ik)));
    await shot(p, `w-${id}.jpg`, await around(p, ik, 24));
    if (blocked.length) log('  blocked', JSON.stringify(blocked.slice(0, 10)));
    await ctx.close();
  };
}

// The Traffic Light on its side, following a Timer in its warning (Follow timers): yellow beside the amber Timer.
SCENES['w-traffic-light'] = async () => {
  const { ctx, p, blocked } = await newBoard();
  const tl = await addWin(p, 'traffic-light'), tm = await addWin(p, 'timer');
  await setRect(p, tl, { x: 600, y: 470, w: 520, h: 290 });
  await setRect(p, tm, { x: 1160, y: 400, w: 640, h: 430 });
  await wait(p, 800);
  await startTimer(p, tm);   // 5 minutes
  await choose(p, tl, 'Follow timers', { exact: true });
  await S.later(p, 4 * 60000 + 15000);   // 45 seconds left: the Timer's warning
  await wait(p, 2500);
  await deselect(p);
  await wait(p, 300);
  log('  titles', JSON.stringify(await p.$$eval('.win .win-label', els => els.map(e => e.innerText))));
  await shot(p, 'w-traffic-light.jpg', await around(p, [tl, tm], 24));
  if (blocked.length) log('  blocked', JSON.stringify(blocked.slice(0, 10)));
  await ctx.close();
};

// The Clock card: Set the time with the Teaching face and the digital time beside it, set to 2:50 p.m.
SCENES['w-clock'] = async () => {
  const { ctx, p } = await newBoard();
  const ik = await addWin(p, 'clock');
  await setRect(p, ik, { x: 700, y: 365, w: 1000, h: 560 });
  await wait(p, 800);
  await choose(p, ik, 'Teaching', { exact: true });
  await choose(p, ik, 'Digital', { exact: true });
  await choose(p, ik, 'Set the time', { exact: true });
  await choose(p, ik, '5-minute steps', { exact: true });
  const tap = async (k, n) => { for (let i = 0; i < n; i++) { await frame(p, ik).locator(`#dig .arrow[data-k="${k}"]`).click(); await wait(p, 500); } };
  await tap('hu', 6); await tap('mu', 6);   // 8:20 a.m. → 2:50 p.m.
  await deselect(p);
  await wait(p, 600);
  log('  menu', JSON.stringify(await p.evaluate(ik => window.__board21.state.wins.get(ik).menuItems.map(i => i.label), ik)));
  await shot(p, 'w-clock.jpg', await around(p, ik, 24));
  await ctx.close();
};
// The three faces at 8:20: Simple, Old, and Teaching.
SCENES['w-clock-faces'] = async () => {
  const { ctx, p } = await newBoard();
  const iks = [];
  for (const [i, face] of ['Simple', 'Old', 'Teaching'].entries()) {
    const ik = await addWin(p, 'clock');
    await setRect(p, ik, { x: 380 + i * 560, y: 365, w: 520, h: 560 });
    await wait(p, 500);
    if (face !== 'Simple') await choose(p, ik, face, { exact: true });
    iks.push(ik);
  }
  await deselect(p);
  await wait(p, 600);
  await shot(p, 'w-clock-faces.jpg', await around(p, iks, 24));
  await ctx.close();
};
// The LED look in dark theme, with seconds.
SCENES['w-clock-led'] = async () => {
  const { ctx, p } = await newBoard();
  await darkMode(p);
  const ik = await addWin(p, 'clock');
  await setRect(p, ik, { x: 750, y: 400, w: 900, h: 450 });
  await wait(p, 800);
  await choose(p, ik, 'Digital', { exact: true });
  await choose(p, ik, 'Analog', { exact: true });
  await choose(p, ik, 'LED look', { exact: true });
  await choose(p, ik, 'Show seconds', { exact: true });
  await deselect(p);
  await wait(p, 800);
  await p.waitForFunction(() => Date.now() % 1000 > 400 && Date.now() % 1000 < 700, null, { polling: 20 });   // (no segment mid-fade)
  await shot(p, 'w-clock-led.jpg', await around(p, ik, 24));
  await ctx.close();
};

// ---- 5. menu.jpg: the Notes window's menu
SCENES.menu = async () => {
  const { ctx, p } = await newBoard();
  const ik = await addWin(p, 'notes');
  await setRect(p, ik, { x: 600, y: 120, w: 820, h: 640 });
  await wait(p, 600);
  await typeNote(p, ik, AGENDA);
  await deselect(p);
  await p.click(`.win[data-ikey="${ik}"] .win-label`);
  await wait(p, 500);
  log('  menu', JSON.stringify(await p.$$eval('#menu .menu-item, #menu .menu-heading', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()))));
  const b = union(await rectOf(p, ik), await p.locator('#menu').boundingBox());
  await shot(p, 'menu.jpg', padded(b, 24));
  await ctx.close();
};

// ---- 6. settings.jpg: Settings, as it opens
SCENES.settings = async () => {
  const { ctx, p } = await newBoard();
  const a = await addWin(p, 'clock'); await setRect(p, a, { x: 1000, y: 120, w: 520, h: 560 });
  const b = await addWin(p, 'notes'); await setRect(p, b, { x: 1560, y: 120, w: 700, h: 560 });
  await typeNote(p, b, AGENDA);
  await deselect(p);
  await openSettings(p);
  log('  groups', JSON.stringify(await settingsGroups(p)));
  await shot(p, 'settings-board.jpg');
  await shot(p, 'settings.jpg', padded(union(await p.locator('#settings').boundingBox(), await p.locator('.picker-btn.left').boundingBox()), 20));
  await ctx.close();
};
// settings-appearance.jpg: Settings with Appearance open (Theme, Background, Accent color, Text style, Board shape)
SCENES.settingsLook = async () => {
  const { ctx, p } = await newBoard();
  await openSettings(p, ['letters', 'bg']);
  log('  groups', JSON.stringify(await settingsGroups(p)));
  await shot(p, 'settings-appearance.jpg');
  await ctx.close();
};

// ---- 7. pages.jpg: three pages, the Pages menu open above ‹ Page ›
SCENES.pages = async () => {
  const { ctx, p } = await newBoard();
  const rename = async name => { await p.evaluate(() => { window.__board21.pages.rename(); }); await p.waitForSelector('#modal.open input'); await p.fill('#modal.open input', name); await p.click('#modal.open .btn.primary', { timeout: 8000 }); await wait(p, 400); log('  renamed', name); };
  const n1 = await addWin(p, 'notes'); await setRect(p, n1, { x: 700, y: 100, w: 1000, h: 640 }); await typeNote(p, n1, AGENDA);
  await rename('Morning');
  for (const [name, id, text] of [['Math', 'calculator'], ['Science', 'image']]) {
    await pickerOpen(p); await p.click('#panel [data-ctl="next"]'); await wait(p, 1500);   // + on the last page: a new page
    await rename(name);
    const w = await addWin(p, id); await setRect(p, w, { x: 1400, y: 60, w: 900, h: 640 });
  }
  await pickerOpen(p); await p.click('#panel [data-ctl="prev"]'); await wait(p, 2500);
  await pickerOpen(p);
  await p.click('#panel [data-ctl="pages"]'); await wait(p, 500);
  log('  pages menu', JSON.stringify(await p.$$eval('#pages-menu .menu-item, #pages-menu .menu-heading', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()))));
  log('  indicator', JSON.stringify(await p.locator('#panel [data-ctl="pages"]').innerText()));
  const b = union(await p.locator('#panel').boundingBox(), await p.locator('#pages-menu').boundingBox(), await p.locator('.picker-btn.left').boundingBox());
  await shot(p, 'pages.jpg', padded(b, 24));
  await ctx.close();
};

// ---- 8. history.jpg: Board history beside Settings, with a version open. The story: the board was set up at 7:45,
// saved by hand, then a curious student closed every window at 8:05. At 8:20 the teacher opens Board history.
async function untilQuiet(p, ms = 30000) { for (const end = Date.now() + ms; Date.now() < end; await wait(p, 500)) if (!(await S.toastsShown(p)).length) return true; return false; }
SCENES.history = async () => {
  const { ctx, p } = await newBoard({ at: S.MORNING - 35 * 60000 });   // 7:45 AM
  const ik = {};
  for (const id of ['clock', 'notes', 'name-picker', 'timer', 'traffic-light']) ik[id] = await addWin(p, id);
  await setRect(p, ik.clock, { x: 60, y: 50, w: 470, h: 510 });
  await setRect(p, ik.notes, { x: 570, y: 50, w: 820, h: 1150 });
  await setRect(p, ik['name-picker'], { x: 1430, y: 690, w: 910, h: 510 });
  await setRect(p, ik.timer, { x: 1430, y: 50, w: 620, h: 470 });
  await setRect(p, ik['traffic-light'], { x: 2090, y: 50, w: 250, h: 599 });
  await typeNote(p, ik.notes, AGENDA_LONG);
  await addNames(p, ik['name-picker']);
  await light(p, ik['traffic-light'], 'green');
  await frame(p, ik.timer).locator('#chips button[data-min="10"]').click(); await wait(p, 300);
  await deselect(p);
  // Board history → Save this version now → "Friday setup"
  await openSettings(p);
  await p.click('#settings [data-act="hist-open"]'); await wait(p, 1200);
  await p.click('#history [data-act="save"]'); await p.waitForSelector('#modal.open input');
  await p.fill('#modal.open input', 'Friday setup'); await p.click('#modal.open .btn.primary'); await wait(p, 800);
  await p.keyboard.press('Escape'); await wait(p, 300); await p.keyboard.press('Escape'); await wait(p, 300);
  await untilQuiet(p);
  // 8:05: everything closed (Settings → Close all)
  await S.later(p, 20 * 60000);
  await openSettings(p);
  await p.click('#settings [data-act="close-all"]'); await wait(p, 1200);
  if (await p.locator('#modal.open').count()) { log('  close-all asks', JSON.stringify(await p.locator('#modal.open').innerText())); await p.click('#modal.open .btn.primary, #modal.open .btn.danger'); await wait(p, 800); }
  await p.keyboard.press('Escape'); await wait(p, 300);
  log('  after close all', JSON.stringify(await S.toastsShown(p)));
  await untilQuiet(p);
  log('  empty hint', JSON.stringify(await p.locator('#empty-hint').innerText()));
  await S.later(p, 15 * 60000);   // 8:20
  await p.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(p, 300);
  await shot(p, 'history-empty.jpg');
  await openSettings(p);
  await p.click('#settings [data-act="hist-open"]'); await wait(p, 1500);
  const rows = await p.$$eval('#history button', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  log('  history', JSON.stringify(rows));
  await p.locator('#history [data-act="sel"]').first().click(); await wait(p, 1500);
  log('  detail', JSON.stringify((await p.locator('#history-detail').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600)));
  await shot(p, 'history.jpg');
  await ctx.close();
};

// ---- 9. textstyle.jpg: Early readers
SCENES.textstyle = async () => {
  const { ctx, p } = await newBoard();
  const ik = await addWin(p, 'notes');
  await setRect(p, ik, { x: 1000, y: 120, w: 900, h: 640 });
  await typeNote(p, ik, 'a b c d e f g\nWe read a big book.');
  const t2 = await addWin(p, 'first-then-board');
  await setRect(p, t2, { x: 1000, y: 800, w: 900, h: 460 });
  await deselect(p);
  await openSettings(p, ['letters']);
  await p.click('#settings [data-act="letters"][data-val="early"]'); await wait(p, 1500);
  await shot(p, 'textstyle.jpg');
  await ctx.close();
};

// ---- 9b. appearance.jpg: a photo behind the board and a Purple accent, with Settings › Appearance › Background open
SCENES.appearance = async () => {
  const { ctx, p } = await newBoard();
  const ik = {};
  for (const id of ['clock', 'notes', 'timer']) ik[id] = await addWin(p, id);
  await setRect(p, ik.clock, { x: 1000, y: 120, w: 640, h: 400 });
  await setRect(p, ik.notes, { x: 1000, y: 560, w: 820, h: 620 });
  await setRect(p, ik.timer, { x: 1700, y: 120, w: 620, h: 400 });
  await wait(p, 800);
  await choose(p, ik.clock, 'Digital', { exact: true });
  await choose(p, ik.clock, 'Analog', { exact: true });   // (digital alone)
  await typeNote(p, ik.notes, 'Field trip Friday\nBring a water bottle.');
  await startTimer(p, ik.timer, '10m');
  await p.setInputFiles('#photo-input', path.join(__dirname, 'hills.jpg')); await wait(p, 1500);
  await deselect(p);
  await openSettings(p, ['bg']);
  await p.click('#settings [data-act="accent"][data-val="purple"]'); await wait(p, 1200);
  // Scroll Settings so Appearance starts at the top: Theme, every background color, the photo, and Accent color.
  await p.evaluate(() => { const r = document.querySelector('#settings [data-act="theme"]').closest('.row'), b = r.closest('.sheet-body');
    const h = r.previousElementSibling && /Appearance/.test(r.previousElementSibling.textContent) ? r.previousElementSibling : r;
    b.scrollTop += h.getBoundingClientRect().top - b.getBoundingClientRect().top - 8; });
  await wait(p, 500);
  await shot(p, 'appearance.jpg');
  await ctx.close();
};

// ---- 10. kiosk.jpg: the Widget Picker in kiosk mode
SCENES.kiosk = async () => {
  const { ctx, p } = await newBoard({ query: '?kiosk=yes' });
  await pickerOpen(p, 'left');
  log('  controls', JSON.stringify(await p.$$eval('#panel .panel-controls [data-ctl]', els => els.filter(e => !e.hidden).map(e => e.dataset.ctl + ':' + (e.getAttribute('aria-label') || e.textContent)))));
  const b = await p.locator('#panel').boundingBox(), btn = await p.locator('.picker-btn.left').boundingBox();
  await shot(p, 'kiosk.jpg', clear(padded(union(b, btn), 24), union(await p.locator('#empty-hint .big').boundingBox(), await p.locator('#empty-hint .small').first().boundingBox())));
  await ctx.close();
};

// ---- 11. lock.jpg: Lock in the Widget Picker asks how, and says how to unlock
SCENES.lock = async () => {
  const { ctx, p } = await newBoard();
  const ik = {};
  for (const id of ['clock', 'notes', 'timer']) ik[id] = await addWin(p, id);
  await setRect(p, ik.clock, { x: 160, y: 120, w: 440, h: 470 });
  await setRect(p, ik.notes, { x: 650, y: 120, w: 1100, h: 1080 });
  await setRect(p, ik.timer, { x: 1800, y: 120, w: 520, h: 430 });
  await wait(p, 600);
  await typeNote(p, ik.notes, AGENDA_LONG);
  await deselect(p);
  await pickerOpen(p, 'left');
  log('  controls', JSON.stringify(await p.$$eval('#panel .panel-controls [data-ctl]', els => els.filter(e => !e.hidden).map(e => e.dataset.ctl + ':' + (e.getAttribute('aria-label') || e.textContent)))));
  await p.click('#panel [data-ctl="lock"]'); await wait(p, 600);
  log('  dialog', JSON.stringify(await p.locator('#modal.open .modal-card').innerText()));
  await p.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });   // (no focus ring in the picture)
  await wait(p, 200);
  await shot(p, 'lock.jpg', padded(await p.locator('#modal .modal-card').boundingBox(), 28));
  await ctx.close();
};

// ---- empty.jpg: a new board, the first thing a teacher sees
SCENES.empty = async () => {
  const { ctx, p } = await newBoard();
  log('  hint', JSON.stringify(await p.locator('#empty-hint').innerText()));
  await shot(p, 'empty.jpg');
  await ctx.close();
};
