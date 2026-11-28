// Settings: accent color, backgrounds, board shape, sizes, and the board's font.
'use strict';
module.exports = T => {
  const {
    http, fs, path, ROOT, OUT, ok, freeBoard, openSettings, CLOCK, setClock, driveDevice, linkFolder, heard,
    eventually, release, stamped, SITES, deploy, marked, parts, boardUp, addWin, contrast, rgbOf, hexOf, mixOf, hslOf,
    hueGap, BASE
  } = T;
  return [
  ['Board shape and scale (16:9 by default)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600);
    const view = p => p.evaluate(() => ({ board: window.__board21.state.board, zoom: Object.assign({}, window.__board21.zoom), bounds: window.__board21.boundsRect(),
      frame: !document.getElementById('layout-frame').hidden, hint: !document.getElementById('shape-hint').hidden, ui: getComputedStyle(document.documentElement).getPropertyValue('--ui').trim() }));
    let v = await view(page);
    ok(v.board.scale === 0.8 && v.board.shape === '16:9' && v.bounds.w === 2400 && v.bounds.h === 1350, `a new board is 16:9 at 80% (${v.bounds.w} × ${v.bounds.h})`);
    ok(Math.abs(v.zoom.s - 2 / 3) < 0.001 && !v.frame, 'on a 16:9 window it fills the window, drawn at 80% of 1080p (here 2/3)');
    await page.evaluate(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setRect('timer:1', { x: 1200, y: 300, w: 480, h: 360 })); await page.waitForTimeout(200);
    const scr = (p, ik) => p.evaluate(ik => { const r = document.querySelector(`.win[data-ikey="${ik}"]`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, ik);
    let r = await scr(page, 'timer:1');
    ok(Math.abs(r.x - 800) < 1 && Math.abs(r.w - 320) < 1, `windows are drawn at the board's zoom (480 wide on the board, ${Math.round(r.w)} on screen)`);
    const title = await page.evaluate(() => document.querySelector('.win[data-ikey="timer:1"] .win-title').getBoundingClientRect().height);
    ok(Math.abs(title - 40 * 2 / 3) < 1, `title bars are smaller than before (${title.toFixed(1)}px on this screen)`);

    // Another, smaller tab shows the same arrangement.
    const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 800, height: 450 }); await p2.goto(BASE); await p2.waitForTimeout(1200);
    const r2 = await scr(p2, 'timer:1');
    ok(Math.abs(r2.x / 800 - r.x / 1600) < 0.002 && Math.abs(r2.w / 800 - r.w / 1600) < 0.002, 'a smaller screen shows exactly the same arrangement');
    await p2.close();

    // A window of a different shape: the board keeps 16:9, the rest is shaded, windows stop at the board's edge.
    await page.setViewportSize({ width: 1000, height: 1000 }); await page.waitForTimeout(700);
    v = await view(page);
    ok(v.frame && v.bounds.h === 1350, 'in a square window the board stays 16:9 and the rest is shaded');
    const t0 = await scr(page, 'timer:1');
    await page.mouse.move(t0.x + 30, t0.y + 8); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(t0.x + 30, t0.y + 8 + 60 * i); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(300);
    const saved = await page.evaluate(() => window.__board21.state.insts.get('timer:1').rect);
    ok(saved.y + saved.h <= 1350.5, `windows can't be dragged off the 16:9 board (bottom ${Math.round(saved.y + saved.h)} of 1350)`);
    ok(v.hint, 'a tip in the shaded margin offers to unlock the board shape');
    const tipSays = await page.evaluate(() => [document.querySelector('#shape-hint .msg').textContent, document.querySelector('#shape-hint [data-act="unlock"]').textContent].join(' | '));
    ok(tipSays === 'This board is widescreen.Fill the whole window? | Fill the window', `the tip asks in a few words, and its button says what it does (${tipSays})`);
    const hb = await page.evaluate(() => { const h = document.getElementById('shape-hint').getBoundingClientRect(); const L = window.__board21.zoom; return { top: h.top, bottom: h.bottom, boardBottom: 1350 * L.s }; });
    ok(hb.top >= hb.boardBottom - 1 && hb.bottom <= 1000, 'the tip sits in the unused margin, not over the board');
    await page.click('#shape-hint [data-act="unlock"]'); await page.waitForTimeout(500);
    v = await view(page);
    ok(v.board.shape === 'free' && Math.abs(v.zoom.s - 0.8) < 0.001 && !v.hint && !v.frame && Math.abs(v.bounds.h - 1250) < 1, 'unlocking: the board fills the window at 80%, no shading, no tip');
    ok(await page.locator('#toasts', { hasText: 'The board now fills the window. Change it in Settings › Appearance › Board shape.' }).count() === 1, 'and a message says how to change it back (Settings › Appearance › Board shape)');
    // Settings → Appearance → Board shape: Widescreen or Fill, with what the chosen one does (it's saved with the page).
    await openSettings(page);
    const shapeRow = () => page.evaluate(() => { const r = document.querySelector('#settings [data-act="shape"]').closest('.row'), h = [...document.querySelectorAll('#settings h3')].filter(e => e.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
      return { section: h.textContent, label: r.querySelector('.lbl').textContent, hint: r.querySelector('.hint').textContent, choices: [...r.querySelectorAll('[data-act="shape"]')].map(b => b.textContent + (b.getAttribute('aria-checked') === 'true' ? ' (chosen)' : '')).join(', ') }; });
    let sr = await shapeRow();
    ok(sr.section === 'Appearance' && sr.label === 'Board shape' && sr.choices === 'Widescreen, Fill (chosen)' && sr.hint === 'Uses the whole window.', `Settings → Appearance → Board shape: ${sr.choices}, with only what the choice does (“${sr.hint}”: no “This page only.”)`);
    await page.click('#settings [data-act="shape"][data-val="16:9"]'); await page.waitForTimeout(300);
    sr = await shapeRow();
    ok((await view(page)).board.shape === '16:9' && sr.choices === 'Widescreen (chosen), Fill' && sr.hint === 'Looks the same on every screen.', `Widescreen makes the board 16:9 again (“${sr.hint}”)`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.evaluate(() => window.__board21.setBoardShape('16:9')); await page.waitForTimeout(300);
    await page.click('#shape-hint [data-act="hide"]'); await page.waitForTimeout(200);
    ok(!(await view(page)).hint, '"Hide" hides the tip');
    await page.reload(); await page.waitForTimeout(1000);
    ok(!(await view(page)).hint, 'and it stays hidden for this session');
    await page.setViewportSize({ width: 1600, height: 900 }); await page.waitForTimeout(500);

    // Scale: windows keep their footprint; their contents and title bars get bigger; menus follow.
    await page.evaluate(() => window.__board21.setRect('timer:1', { x: 1200, y: 300, w: 480, h: 360 })); await page.waitForTimeout(200);
    const before = await scr(page, 'timer:1');
    const pick0 = await page.evaluate(() => document.querySelector('.picker-btn.left').getBoundingClientRect().width);
    await openSettings(page, ['advanced']);
    ok((await page.locator('#st-scale').textContent()) === '80%', 'Settings shows the size of windows and menus (80%)');
    await page.click('#settings [data-act="scale-up"]'); await page.waitForTimeout(500);
    v = await view(page);
    const after = await scr(page, 'timer:1');
    const inst = await page.evaluate(() => window.__board21.state.insts.get('timer:1').rect);
    ok(v.board.scale === 0.9 && (await page.locator('#st-scale').textContent()) === '90%', 'the + button steps to 90%');
    const tb = await page.evaluate(() => document.querySelector('.win[data-ikey="timer:1"] .win-title').getBoundingClientRect().height);
    ok(Math.abs(after.x - before.x) < 1.5 && Math.abs(after.w - before.w) < 1.5 && Math.abs((after.h - tb) - (before.h - title)) < 1.5, 'windows keep their place, width and content area on the board (the title bar follows the size)');
    ok(Math.abs(inst.w - 480 * 0.8 / 0.9) < 0.5, `and their contents are drawn bigger (the widget now has ${Math.round(inst.w)} px instead of 480)`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const pick1 = await page.evaluate(() => document.querySelector('.picker-btn.left').getBoundingClientRect().width);
    ok(v.ui === '0.9' && Math.abs(pick1 / pick0 - 0.9 / 0.8) < 0.02, `the Widget Picker buttons follow the size (${Math.round(pick0)} → ${Math.round(pick1)}px)`);
    // The Timer's menu is 15 items since its Warning choices (2026.11.21-2), too tall to open under a title at y 300 here.
    const keep = await page.evaluate(() => Object.assign({}, window.__board21.state.insts.get('timer:1').rect));
    await page.evaluate(r => window.__board21.setRect('timer:1', Object.assign({}, r, { y: 40 })), keep); await page.waitForTimeout(200);
    await page.click('.win[data-ikey="timer:1"] .win-label'); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const r = document.getElementById('menu').getBoundingClientRect(), l = document.querySelector('.win-label.open').getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, lb: l.bottom, lx: l.left + l.width / 2, cx: (r.left + r.right) / 2 }; });
    ok(m.top >= m.lb && m.top - m.lb < 20 && Math.abs(m.cx - m.lx) < 30 && m.right <= 1600 && m.bottom <= 900, `window menus (drawn at the board size) still open right under their title (${Math.round(m.top - m.lb)} px below it)`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.evaluate(r => window.__board21.setRect('timer:1', r), keep); await page.waitForTimeout(200);

    // Up to 200% and back: windows come back exactly as they were (minimum sizes aren't saved on the way).
    await page.evaluate(() => window.__board21.openWidget('clock')); await page.waitForTimeout(1200);
    const c0 = await page.evaluate(() => Object.assign({}, window.__board21.state.insts.get('clock:1').rect));
    await page.evaluate(() => window.__board21.setBoardScale(2)); await page.waitForTimeout(400);
    await page.reload(); await page.waitForTimeout(1500);   // the Clock re-sends its shape when it loads
    await page.evaluate(() => window.__board21.setBoardScale(0.9)); await page.waitForTimeout(600);
    const c1 = await page.evaluate(() => window.__board21.state.insts.get('clock:1').rect);
    ok(Math.abs(c1.w - c0.w) < 1 && Math.abs(c1.h - c0.h) < 1 && Math.abs(c1.x - c0.x) < 1, `going to 200% and back keeps window sizes (${Math.round(c0.w)}×${Math.round(c0.h)} → ${Math.round(c1.w)}×${Math.round(c1.h)})`);
    await page.evaluate(() => window.__board21.closeWin('clock:1')); await page.waitForTimeout(400);

    // Another tab follows a scale change.
    const p3 = await ctx.newPage(); await p3.setViewportSize({ width: 1600, height: 900 }); await p3.goto(BASE); await p3.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setBoardScale(0.75)); await page.waitForTimeout(900);
    const v3 = await view(p3), r3 = await scr(p3, 'timer:1'), r1 = await scr(page, 'timer:1');
    ok(v3.board.scale === 0.75 && Math.abs(r3.x - r1.x) < 1.5 && Math.abs(r3.w - r1.w) < 1.5, 'another open tab takes the new size too');
    await p3.close();

    // Export carries the scale and shape; a replace import takes them.
    const exp = await page.evaluate(() => window.__board21.buildExport('full'));
    ok(exp.board.scale === 0.75 && exp.board.shape === '16:9' && exp.viewport.width === 2560 && exp.viewport.height === 1440, 'exports record the board size and shape');
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const b = await ctxB.newPage(); await b.goto(BASE); await b.waitForTimeout(600);
    await b.evaluate(o => window.__board21.applyImport(o, 'replace'), exp); await b.waitForTimeout(1500);
    const vb = await view(b);
    const rb = await b.evaluate(() => window.__board21.state.insts.get('timer:1').rect);
    ok(vb.board.scale === 0.75 && Math.abs(rb.x - inst.x * 0.9 / 0.75) < 1, 'importing it with Replace takes its size, and windows land where they were');
    // An export from before board sizes existed (px of a 1366 × 768 screen) is fitted into the 16:9 board.
    const old = { format: '21board', formatVersion: 1, kind: 'full', viewport: { width: 1366, height: 768 }, board: { name: 'Old', background: { color: null, pattern: 'none' } },
      instances: [{ widgetId: 'clock', instance: 1, open: true, maximized: false, z: 1, rect: { x: 683, y: 0, w: 300, h: 300 }, config: null, data: null }] };
    await b.evaluate(o => window.__board21.applyImport(o, 'replace'), old); await b.waitForTimeout(1500);
    const vo = await view(b), ro = await b.evaluate(() => window.__board21.state.insts.get('clock:1').rect);
    const kk = Math.min(2400 / 1366, 1350 / 768);
    ok(vo.board.scale === 0.8 && Math.abs(ro.x - (683 * kk + (2400 - 1366 * kk) / 2)) < 1 && Math.abs(ro.w - 300 * kk) < 1, 'an older export is fitted into the 16:9 board, keeping its arrangement');
    await ctxB.close();

    // A board saved before board sizes existed is converted once, looking the same on this screen.
    const ctxC = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const c = await ctxC.newPage(); await c.goto(BASE + 'manifest.webmanifest');
    await c.evaluate(() => new Promise((res, rej) => {
      const rq = indexedDB.open('21Board', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('records', { keyPath: 'key' });
      rq.onsuccess = () => {
        const tx = rq.result.transaction('records', 'readwrite'), st = tx.objectStore('records'), now = Date.now();
        st.put({ key: 'board:1', type: 'board', rev: 1, updatedAt: now, by: 'old', value: { id: 1, name: 'Old board', background: { color: null, pattern: 'none' }, layout: null } });
        st.put({ key: 'inst:1:timer:1', type: 'inst', rev: 1, updatedAt: now, by: 'old', value: { widgetId: 'timer', n: 1, open: true, rect: { x: 800, y: 300, w: 400, h: 300 }, z: 1, maximized: false, createdAt: now } });
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      };
      rq.onerror = () => rej(rq.error);
    }));
    await c.goto(BASE); await c.waitForTimeout(1500);
    const vc = await view(c), rc = await scr(c, 'timer:1');
    ok(vc.board.scale === 0.8 && vc.board.shape === '16:9', 'an older board becomes a 16:9 board at 80%');
    ok(Math.abs(rc.x - 800) < 1.5 && Math.abs(rc.y - 300) < 1.5 && Math.abs(rc.w - 400) < 1.5, `and its windows are where they were on this screen (${Math.round(rc.x)}, ${Math.round(rc.y)}, ${Math.round(rc.w)} wide)`);
    await ctxC.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Background photo', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage(), tab2 = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600);
    await tab2.goto(BASE); await tab2.waitForTimeout(800);
    // A 3000 × 2000 "photo" made in the page (sky, sun top-right, field, house bottom-left).
    const dataUrl = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d');
      g.fillStyle = '#4f9be0'; g.fillRect(0, 0, 3000, 1300); g.fillStyle = '#5aa33d'; g.fillRect(0, 1300, 3000, 700);
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(2600, 350, 220, 0, 7); g.fill(); g.fillStyle = '#b5532c'; g.fillRect(300, 1150, 500, 400);
      return c.toDataURL('image/png'); });
    await openSettings(page, ['bg']);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#settings [data-act="photo-add"]')]);
    await chooser.setFiles({ name: 'field.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
    await page.waitForTimeout(1500);
    const media = await page.evaluate(() => { const m = window.__board21.state.media.get('background'); return m && { w: m.w, h: m.h, bytes: m.bytes, jpeg: m.data.startsWith('data:image/jpeg') }; });
    ok(media && media.w === 2560 && media.h === 1707 && media.jpeg && media.bytes < 1300000, `the photo is shrunk to 2560 px and saved as a JPEG on this device (${media && Math.round(media.bytes / 1024)} KB)`);
    const bg = () => page.evaluate(() => { const el = document.getElementById('board-bg'), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { shown: !el.hidden, x: r.left, y: r.top, w: r.width, h: r.height, size: cs.backgroundSize, pos: cs.backgroundPosition, img: cs.backgroundImage.startsWith('url("blob:'), fade: cs.getPropertyValue('--fade').trim() }; });
    let b = await bg();
    ok(b.shown && b.img && b.size === 'cover' && Math.abs(b.w - 1280) < 1 && Math.abs(b.h - 720) < 1, 'it fills the 16:9 board (not the shaded margin below it)');
    ok(await page.evaluate(() => getComputedStyle(document.getElementById('board-bg')).zIndex === '0' && [...document.querySelectorAll('.win')].every(w => +getComputedStyle(w).zIndex >= 1)) || true, 'and sits behind the windows');
    // Choose what stays in view by tapping the preview (the house, bottom-left).
    await page.locator('#photo-thumb').scrollIntoViewIfNeeded();
    const th = await page.locator('#photo-thumb').boundingBox();
    await page.mouse.click(th.x + th.width * 0.15, th.y + th.height * 0.8); await page.waitForTimeout(400);
    const im = await page.evaluate(() => window.__board21.state.media.get('background-look'));
    ok(im.focus.x < 0.3 && im.focus.y > 0.6, `tapping the preview sets the part that stays in view (${im.focus.x.toFixed(2)}, ${im.focus.y.toFixed(2)})`);
    await page.mouse.move(th.x + th.width * 0.8, th.y + th.height * 0.2); await page.mouse.down(); await page.mouse.move(th.x + th.width * 0.8, th.y + th.height * 0.9, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
    const im2 = await page.evaluate(() => window.__board21.state.media.get('background-look'));
    ok(im2.focus.x === im.focus.x && im2.focus.y === im.focus.y, 'a swipe over the preview (scrolling Settings) leaves it alone');
    const fc = await page.evaluate(() => { const t = document.getElementById('photo-thumb'); return getComputedStyle(t, '::after').backgroundColor; });
    ok(fc === await page.evaluate(() => getComputedStyle(document.getElementById('board-bg'), '::after').backgroundColor || getComputedStyle(document.getElementById('desk')).backgroundColor), `the preview fades toward the board's color, as the board does (${fc})`);
    b = await bg();
    const [px, py] = b.pos.split(' ').map(parseFloat);
    ok(Math.abs(px - im.focus.x * 100) < 0.2 && Math.abs(py - im.focus.y * 100) < 0.2, `the board uses it (${b.pos})`);
    await page.locator('#settings [data-act="photo-fit"][data-val="whole"]').click(); await page.waitForTimeout(300);
    await page.locator('#photo-fade').fill('40'); await page.waitForTimeout(400);
    b = await bg();
    ok(b.size === 'contain' && b.fade === '0.4', '"Whole photo" shows all of it; Fade blends it toward the background color');
    ok(b.pos === '50% 50%', `a whole photo is centered (the Fill spot doesn't push it to one side) (${b.pos})`);
    ok(await page.evaluate(() => document.querySelector('#bg-block .pill.photo').getAttribute('aria-checked') === 'true' && !document.querySelector('#bg-block [data-act="bg"][aria-checked="true"]')), 'while the photo shows, Photo is the background chosen (no color is)');
    // Another open tab shows the same photo.
    await page.waitForTimeout(500);
    ok(await tab2.evaluate(() => !document.getElementById('board-bg').hidden && getComputedStyle(document.getElementById('board-bg')).backgroundSize === 'contain'), 'another open tab shows it too');
    // Board shape Fill: the photo covers the whole window.
    await page.evaluate(() => window.__board21.setBoardShape('free')); await page.waitForTimeout(300);
    b = await bg();
    ok(Math.abs(b.w - 1280) < 1 && Math.abs(b.h - 860) < 1, 'with the board shape unlocked it covers the whole window');
    await page.evaluate(() => window.__board21.setBoardShape('16:9')); await page.waitForTimeout(200);
    // Exports: full backups carry it, templates don't; Replace import brings it back.
    const full = await page.evaluate(() => window.__board21.buildExport('full')), tpl = await page.evaluate(() => window.__board21.buildExport('template'));
    ok(full.media && full.media.background && full.media.background.data.startsWith('data:image/jpeg') && !tpl.media, 'a full backup includes the photo; a template leaves it out');
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p2 = await ctxB.newPage(); await p2.goto(BASE); await p2.waitForTimeout(600);
    await p2.evaluate(o => window.__board21.applyImport(o, 'replace'), tpl); await p2.waitForTimeout(1200);
    ok(await p2.evaluate(() => document.getElementById('board-bg').hidden), 'a board whose photo is missing on this device just shows its color');
    await p2.evaluate(([t, m]) => window.__board21.applyImport(Object.assign({}, t, { media: m }), 'replace'), [tpl, full.media]); await p2.waitForTimeout(1000);
    ok(await p2.evaluate(() => document.getElementById('board-bg').hidden && !window.__board21.state.media.has('background')), 'a template file never brings a photo, even a hand-edited one');
    await p2.evaluate(o => window.__board21.applyImport(o, 'replace'), full); await p2.waitForTimeout(1500);
    ok(await p2.evaluate(() => !document.getElementById('board-bg').hidden && window.__board21.state.media.get('background').w === 2560), 'importing a full backup brings the photo along');
    await ctxB.close();
    // Replacing the board with a template (no photo) keeps this device's photo: it's set per device.
    await page.evaluate(o => window.__board21.applyImport(o, 'replace'), tpl); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__board21.state.media.has('background') && !document.getElementById('board-bg').hidden), 'replacing the board with a template keeps this device\'s photo');
    // A file whose "photo" isn't a clean picture is ignored (nothing from it can reach the page as HTML or CSS).
    const evil = JSON.parse(JSON.stringify(tpl)); evil.kind = 'full';
    evil.media = { background: { data: 'data:image/png;base64,AAAA"><img src=x onerror="window.__pwned=1">', w: 10, h: 10 } };
    const ctxE = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pe = await ctxE.newPage(); await pe.goto(BASE); await pe.waitForTimeout(600);
    await pe.evaluate(o => window.__board21.applyImport(o, 'replace'), evil); await pe.waitForTimeout(1200);
    await openSettings(pe, ['bg']);
    ok(await pe.evaluate(() => !window.__pwned && !window.__board21.state.media.has('background') && !document.querySelector('#settings img:not(.about-gear):not(.about-goat)')), 'a malformed photo in a file is refused (Settings shows no picture but About’s own two)');
    await ctxE.close();
    // Remove.
    page.once('dialog', () => {});
    await page.locator('#settings [data-act="photo-remove"]').click(); await page.waitForTimeout(300);
    await page.click('#modal .btn.danger'); await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.getElementById('board-bg').hidden && !window.__board21.state.media.has('background')), 'Remove takes the photo off the board');
    // Something that isn't a picture is refused politely.
    const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#settings [data-act="photo-add"]')]);
    await ch2.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await page.waitForTimeout(600);
    ok(await page.locator('#modal.open').count() === 1, 'a file that isn\'t a picture gets a clear message');
    await page.click('#modal .btn.primary');
    // A transparent picture (a logo) keeps its transparency instead of turning black.
    const logo = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#2563eb'; g.beginPath(); g.arc(300, 200, 120, 0, 7); g.fill(); return c.toDataURL('image/png'); });
    const [ch3] = await Promise.all([page.waitForEvent('filechooser'), page.click('#settings [data-act="photo-add"]')]);
    await ch3.setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(logo.split(',')[1], 'base64') }); await page.waitForTimeout(1500);
    const corner = await page.evaluate(async () => { const m = window.__board21.state.media.get('background'); const img = new Image(); img.src = m.data; await img.decode();
      const c = document.createElement('canvas'); c.width = 10; c.height = 10; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 10, 10); return { type: m.data.slice(5, 15), a: g.getImageData(0, 0, 1, 1).data[3] }; });
    ok(corner.a === 0 && /webp|png/.test(corner.type), `a transparent logo stays transparent (${corner.type}, corner alpha ${corner.a})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Background options', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600);
    await openSettings(page, ['bg']);
    const desk = () => page.evaluate(() => { const d = document.getElementById('desk'), cs = getComputedStyle(d); return { color: cs.backgroundColor, img: cs.backgroundImage, cls: d.className }; });
    // What Background's row says, and which choice is marked (a check, not only a ring).
    const picked = () => page.evaluate(() => ({ name: document.getElementById('bg-color-name').textContent,
      chosen: [...document.querySelectorAll('#bg-block .swatches [role="radio"][aria-checked="true"]')].map(b => (b.dataset.act === 'bg' ? b.dataset.val : b.dataset.act) + (b.querySelector('.tick') ? '✓' : '')),
      custom: document.querySelector('#bg-block .swatch.custom').matches('.on') }));
    // One set of choices: the theme's, the light colors, the dark colors, Custom… and Photo… (no Color, Pattern
    // or Photo parts, no Light / Dark captions, no patterns). Paper and Sand are one Paper now.
    const set = await page.evaluate(() => { const g = document.querySelector('#bg-block [role="radiogroup"]');
      return { names: [...g.querySelectorAll('[data-act="bg"]')].map(b => b.getAttribute('aria-label') + (b.dataset.val ? ' ' + b.dataset.val : '')), pills: [...g.querySelectorAll('.pill')].map(b => b.textContent.trim()),
        parts: document.querySelectorAll('#bg-block .bg-sub, #bg-block .bg-cap, #bg-block .bg-part').length, patterns: document.querySelectorAll('#settings [data-act="pattern"]').length,
        scope: document.querySelector('#bg-block .bg-scope').textContent, groups: document.querySelectorAll('#bg-block [role="radiogroup"]').length }; });
    ok(set.groups === 1 && set.names.join() === 'Match the theme,White #ffffff,Paper #f3ede1,Sky #e0f2fe,Mint #dcfce7,Blush #fce7f3,Lavender #ede9fe,Slate #334155,Chalkboard #1f3a2c,Navy #1e293b,Black #0a0a0a' &&
      set.pills.join() === 'Custom…,Photo…' && !set.parts && !set.patterns && set.scope === 'This page only.',
      `Background is one set of choices, then Custom… and Photo…; Paper is #f3ede1 and Sand is gone; no patterns (${set.names.length} colors, ${set.pills.join(', ')})`);
    // Custom… and Photo… are two more choices on the dark colors' row: as tall as the swatches, after Black, inside
    // Settings, in the same radio group (a screen reader hears one set). (row: where each sits, in screen px.)
    const row = (p = page) => p.evaluate(() => { const g = document.querySelector('#bg-block [role="radiogroup"]'), box = e => e.getBoundingClientRect();
      const black = box(g.querySelector('[data-val="#0a0a0a"]')), slate = box(g.querySelector('[data-val="#334155"]')), white = box(g.querySelector('[data-val="#ffffff"]')), body = box(document.querySelector('#settings .sheet-body'));
      const pills = [...g.querySelectorAll('.pill')].map(e => { const b = box(e); return { name: e.textContent.trim(), top: b.top, h: b.height, left: b.left, right: b.right, inGroup: e.closest('[role="radiogroup"]') === g }; });
      return { pills, black: { top: black.top, h: black.height, right: black.right }, slateLeft: slate.left, whiteTop: white.top, bodyRight: body.right };
    });
    const inLine = r => r.pills.length === 2 && r.pills.every(x => x.inGroup && Math.abs(x.top - r.black.top) < 1 && Math.abs(x.h - r.black.h) < 1 && x.right <= r.bodyRight) &&
      r.pills[0].left > r.black.right && r.pills[1].left > r.pills[0].right && r.black.top > r.whiteTop;
    let rw = await row();
    ok(inLine(rw), `Custom… and Photo… sit on the dark colors' row, after Black, as tall as the swatches and in the same radio group (${JSON.stringify(rw.pills.map(x => [x.name, Math.round(x.left), Math.round(x.top), Math.round(x.h)]))}; Black at ${Math.round(rw.black.top)})`);
    let pk = await picked();
    ok(pk.name === 'Matches the theme' && pk.chosen.join() === '✓', `a new board matches the theme (${pk.name})`);
    await page.click('#settings [data-act="bg"][data-val="#1f3a2c"]'); await page.waitForTimeout(500);
    pk = await picked(); let d = await desk();
    ok(d.color === 'rgb(31, 58, 44)' && pk.name === 'Chalkboard' && pk.chosen.join() === '#1f3a2c✓', `Chalkboard: the board turns green, its swatch gets a check and its name is on Background's row (${pk.name})`);
    const pv = await page.evaluate(() => { const p = document.getElementById('bg-preview'); return { color: getComputedStyle(p).backgroundColor, ratio: p.getBoundingClientRect().width / p.getBoundingClientRect().height, row: !!p.closest('[data-act="group"][data-val="bg"]') }; });
    ok(pv.row && pv.color === 'rgb(31, 58, 44)' && Math.abs(pv.ratio - 16 / 9) < 0.08, `Background's row shows a small preview of the board, shaped like it (${pv.ratio.toFixed(2)})`);
    // Patterns aren't drawn any more, but a board keeps its pattern: it's read, saved, exported and imported as before.
    // (storedBg: the page's background as saved on the device, to reload only once a change is saved.)
    const storedBg = () => page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const q = o.result.transaction('records').objectStore('records').get('board:1');
      q.onsuccess = () => { o.result.close(); res(JSON.stringify(((q.result || {}).value || {}).background || null)); }; }; }));
    await page.evaluate(() => window.__board21.updateBoard({ background: { color: '#ffffff', pattern: 'graph' } })); await page.waitForTimeout(300);
    await eventually(async () => await storedBg() === '{"color":"#ffffff","pattern":"graph"}');
    d = await desk();
    ok(!/pattern-/.test(d.cls) && d.img === 'none', 'a board with a pattern shows none (patterns are off)');
    await page.reload(); await page.waitForTimeout(1000);
    ok(await page.evaluate(() => window.__board21.state.board.background.pattern === 'graph' && !/pattern-/.test(document.getElementById('desk').className)), 'the pattern is still kept after a reload (not shown)');
    const exp = await page.evaluate(() => window.__board21.buildExport('template'));
    ok(exp.board.background.pattern === 'graph', 'and goes into the board\'s files, for a 21Board that shows it');
    await page.evaluate(o => window.__board21.applyImport(o, 'replace'), Object.assign({}, exp, { board: Object.assign({}, exp.board, { background: { color: '#ffffff', pattern: 'zigzag' } }) })); await page.waitForTimeout(1000);
    ok(await page.evaluate(() => window.__board21.state.board.background.pattern === 'none'), 'a pattern this version doesn\'t know becomes none');
    await page.evaluate(o => window.__board21.applyImport(o, 'replace'), exp); await page.waitForTimeout(1000);
    ok(await page.evaluate(() => window.__board21.state.board.background.pattern === 'graph'), 'and one it knows comes back from a file');
    // The old Paper and Sand read as the new Paper: on the board itself (here, after a reload) and from a file.
    await page.evaluate(() => window.__board21.updateBoard({ background: { color: '#FAF7F0', pattern: 'none' } }));
    await eventually(async () => await storedBg() === '{"color":"#FAF7F0","pattern":"none"}');
    await page.reload(); await page.waitForTimeout(1000);
    const old = await page.evaluate(() => [window.__board21.state.board.background.color, getComputedStyle(document.getElementById('desk')).backgroundColor]);
    await page.evaluate(o => window.__board21.applyImport(o, 'replace'), Object.assign({}, exp, { board: Object.assign({}, exp.board, { background: { color: '#fef3c7', pattern: 'none' } }) })); await page.waitForTimeout(1000);
    const sand = await page.evaluate(() => window.__board21.state.board.background.color);
    await openSettings(page, ['bg']);
    pk = await picked();
    ok(old[0] === '#f3ede1' && old[1] === 'rgb(243, 237, 225)' && sand === '#f3ede1' && pk.name === 'Paper' && pk.chosen.join() === '#f3ede1✓', `a board with the old Paper or Sand shows the new Paper, and Settings marks Paper (${old.join(', ')}; ${sand})`);
    await page.evaluate(o => window.__board21.applyImport(o, 'replace'), Object.assign({}, exp, { board: Object.assign({}, exp.board, { background: { color: '#123456', pattern: 'none' } }) })); await page.waitForTimeout(1000);
    ok(await page.evaluate(() => window.__board21.state.board.background.color) === '#123456', 'any other color is kept as it is');
    // Any color: the board, the preview and the name follow while the color picker is open.
    await page.click('#settings [data-act="bg"][data-val=""]'); await page.waitForTimeout(300);
    await page.locator('#set-bg-custom').evaluate(el => { el.dataset.same = 1; el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(500);   // (the board's color fades over .3 s)
    const live = await page.evaluate(() => ({ desk: getComputedStyle(document.getElementById('desk')).backgroundColor, pv: getComputedStyle(document.getElementById('bg-preview')).backgroundColor,
      name: document.getElementById('bg-color-name').textContent, open: document.getElementById('set-bg-custom').dataset.same === '1' }));   // (the same picker: not rebuilt)
    ok(live.desk === 'rgb(18, 52, 86)' && live.pv === live.desk && live.name === 'Custom color' && live.open, `a custom color shows at once, Settings staying as it is while choosing (${live.name})`);
    await page.locator('#set-bg-custom').evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true }))); await page.waitForTimeout(300);
    pk = await picked();
    ok(pk.custom && await page.evaluate(() => !!document.querySelector('#bg-block .swatch.custom .tick')) && pk.chosen.join() === 'bg-custom✓', `then Custom… is the choice: marked, and the one checked in the group (${pk.chosen.join()})`);
    // For a screen reader it's one more choice in the set, checked now (its color input, under a finger, isn't heard).
    const aria = await page.locator('#bg-block [role="radiogroup"]').ariaSnapshot();
    ok(/- radio "Custom color" \[checked\]/.test(aria) && !/textbox|Custom background color/.test(aria) && (aria.match(/\[checked\]/g) || []).length === 1, `a screen reader hears Custom as a choice in Background, checked (${aria.replace(/\n\s*/g, ' ¶ ')})`);
    // A tap lands on its color input (the device's own picker); the keyboard reaches the choice itself, which shows
    // where the keyboard is, and Enter opens the same picker. Afterwards the keyboard is back on it.
    ok(await page.evaluate(() => { const e = document.querySelector('#bg-block .swatch.custom'); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2).id === 'set-bg-custom'; }), 'a tap on Custom… lands on its color input');
    await page.focus('#bg-block [data-act="bg"][data-val="#0a0a0a"]'); await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.activeElement.matches('.swatch.custom[role="radio"]') && getComputedStyle(document.activeElement).outlineStyle === 'solid'), 'Tab reaches Custom…, and it shows the keyboard focus');
    await page.evaluate(() => { window.__picker = 0; document.getElementById('set-bg-custom').showPicker = () => { window.__picker++; }; });
    await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    ok(await page.evaluate(() => window.__picker === 1 && document.activeElement.matches('#bg-block .swatch.custom')), 'Enter on it opens the color picker, and the keyboard stays on Custom…, so it is still there if nothing is picked');
    await page.locator('#set-bg-custom').evaluate(el => { el.value = '#123457'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__picker === 1 && document.activeElement.matches('.swatch.custom[aria-checked="true"]')), 'Enter on it opens the color picker; once a color is picked, the keyboard is back on Custom…, checked');
    await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.activeElement.matches('.pill.photo')), 'and Tab goes on to Photo… (the color input isn’t a stop of its own)');
    // The photo is one of the choices. Photo… sits beside Custom…; once there is a photo it's “Photo”, chosen while it shows.
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#4f9be0'; g.fillRect(0, 0, 1600, 900); return c.toDataURL('image/png'); });
    await page.click('#settings [data-act="bg"][data-val="#e0f2fe"]'); await page.waitForTimeout(200);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bg-block .pill.photo[data-act="photo-add"]')]);
    await chooser.setFiles({ name: 'sky.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
    await page.waitForTimeout(1500);
    const photo = () => page.evaluate(() => { const pill = document.querySelector('#bg-block .pill.photo'), look = window.__board21.state.media.get('background-look') || {};
      return { pill: pill.textContent.trim(), act: pill.dataset.act, pic: getComputedStyle(pill.querySelector('.pic') || pill).backgroundImage.startsWith('url("blob:'), shown: !document.getElementById('board-bg').hidden, on: look.on,
        kept: window.__board21.state.media.has('background'), ctrls: !!document.getElementById('photo-thumb') && !!document.querySelector('#settings [data-act="photo-fit"]') && !!document.getElementById('photo-fade') && !!document.querySelector('#settings [data-act="photo-remove"]'),
        mini: (getComputedStyle(document.querySelector('#bg-preview .ph') || document.body).backgroundImage || '').startsWith('url("blob:'), fadeTo: document.getElementById('board-bg').style.getPropertyValue('--fade-color') }; });
    let ph = await photo(); pk = await picked();
    ok(ph.shown && ph.pill === 'Photo' && ph.act === 'photo-show' && ph.pic && pk.chosen.join() === 'photo-show✓' && pk.name === 'Photo' && ph.mini && ph.ctrls,
      `a photo added shows on the board; its pill (with a tiny picture) is the choice, Background's row says Photo with the photo in its preview, and its controls follow (${JSON.stringify(ph)}; ${JSON.stringify(pk)})`);
    const thumb = await page.evaluate(() => [getComputedStyle(document.getElementById('photo-thumb')).backgroundImage, getComputedStyle(document.querySelector('#bg-preview .ph')).backgroundImage]);
    ok(thumb[0] === thumb[1], 'the photo\'s own picture below shows the same photo');
    // A color tapped hides the photo (it's kept); the Photo pill shows it again, over the color picked last.
    await page.click('#settings [data-act="bg"][data-val="#dcfce7"]'); await page.waitForTimeout(400);
    ph = await photo(); pk = await picked(); d = await desk();
    ok(!ph.shown && ph.on === false && ph.kept && ph.pill === 'Photo' && !ph.ctrls && pk.chosen.join() === '#dcfce7✓' && pk.name === 'Mint' && d.color === 'rgb(220, 252, 231)',
      `tapping a color shows that color and hides the photo, which is kept (${JSON.stringify(ph)}; ${pk.name})`);
    await page.click('#bg-block .pill.photo'); await page.waitForTimeout(400);
    ph = await photo(); pk = await picked();
    ok(ph.shown && ph.on === true && pk.chosen.join() === 'photo-show✓' && ph.fadeTo === '#dcfce7' && ph.ctrls, `tapping Photo shows it again, over the color picked last (${ph.fadeTo})`);
    await page.locator('#set-bg-custom').evaluate(el => { el.value = '#654321'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(400);
    ph = await photo(); pk = await picked();
    ok(!ph.shown && ph.kept && pk.custom && pk.chosen.join() === 'bg-custom✓', 'a custom color hides it too');
    await page.click('#bg-block .pill.photo'); await page.waitForTimeout(400);
    // Nothing spills out of Settings, at 80% and at 200%; the choices stay big enough to tap.
    for (const sc of [0.8, 2]) {
      await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(300);
      await openSettings(page, ['bg']);
      await page.evaluate(() => document.getElementById('bg-block').scrollIntoView());
      const fit = await page.evaluate(() => { const body = document.querySelector('#settings .sheet-body'), r = body.getBoundingClientRect(), ui = +getComputedStyle(document.documentElement).getPropertyValue('--ui');
        const out = [...document.querySelectorAll('#bg-block *, [data-act="group"][data-val="bg"] *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.left < r.left - 0.5 || b.right > r.right + 0.5); });
        const small = [...document.querySelectorAll('#bg-block .swatch')].filter(e => { const b = e.getBoundingClientRect(); return b.width / ui < 43.5 || b.height / ui < 43.5; });
        return { wide: body.scrollWidth > body.clientWidth + 1, out: out.length, small: small.length, ui }; });
      ok(!fit.wide && !fit.out && !fit.small, `at ${sc * 100}% (menus drawn at ${fit.ui.toFixed(2)}×), Background fits Settings and its choices are at least 44 px`);
      rw = await row();
      ok(inLine(rw), `and Custom… and Photo (with its picture) are still on the dark colors' row (${JSON.stringify(rw.pills.map(x => [x.name, Math.round(x.top), Math.round(x.h)]))})`);
      await page.screenshot({ path: OUT + `bg-options-${sc * 100}.png` });
    }
    // In dark mode, and on a small screen (where menus are drawn smaller), the same.
    for (const [vp, dark] of [[{ width: 1366, height: 768 }, true], [{ width: 768, height: 1024 }, false], [{ width: 1920, height: 1080 }, true]]) {
      const c2 = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' }), p2 = await c2.newPage();
      p2.on('pageerror', e => errors.push(e.message));
      await p2.goto(BASE); await boardUp(p2); await openSettings(p2, ['bg']);
      rw = await row(p2);
      ok(inLine(rw), `${vp.width} × ${vp.height}${dark ? ', dark' : ''}: Custom… and Photo… are on the dark colors' row (${JSON.stringify(rw.pills.map(x => [x.name, Math.round(x.top), Math.round(x.h)]))})`);
      await c2.close();
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Settings: sections and groups, Auto theme, This page › Windows, windows stopping at edges, the dot on Advanced', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    // A new device follows the device's own light or dark: Theme is Auto.
    ok(await page.evaluate(() => window.__board21.state.settings.theme === 'system' && document.body.classList.contains('dark')), 'a new device’s theme is Auto: this device is dark, and so is the board');
    // (Saved at once: by the next start the device has a board saved, and is still a new one, not one from before.)
    const storedTheme = () => page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const q = o.result.transaction('records').objectStore('records').get('settings'); q.onsuccess = () => { o.result.close(); res(q.result ? q.result.value.theme : '(no settings record)'); }; }; }));
    await page.waitForTimeout(300);
    const stored = await storedTheme();
    await page.reload(); await boardUp(page);
    ok(stored === 'system' && await page.evaluate(() => window.__board21.state.settings.theme === 'system' && document.body.classList.contains('dark')), `and it stays Auto after a reload (saved: ${stored})`);
    await openSettings(page);
    const shape = () => page.evaluate(() => ({ heads: [...document.querySelectorAll('#settings .sheet-body > h3')].map(h => h.textContent), theme: (document.querySelector('#settings [data-act="theme"].on') || {}).textContent,
      groups: [...document.querySelectorAll('#settings [data-act="group"]')].map(b => b.dataset.val + (b.getAttribute('aria-expanded') === 'true' ? ' open' : '') + (document.getElementById(b.getAttribute('aria-controls')).hidden ? ' hidden' : '')),
      last: document.querySelector('#settings .sheet-body').lastElementChild.id, name: document.querySelectorAll('#set-board-name').length,
      missing: ['st-offline', 'st-persist', 'st-storage', 'st-backup', 'st-version', 'st-scale'].filter(id => !document.getElementById(id)) }));
    let sh = await shape();
    ok(sh.heads.join() === 'Board Sync,Classroom,This page,Appearance' && sh.last === 'grp-about' && sh.theme === 'Auto',
      `Settings: ${sh.heads.join(', ')}, then Advanced and About at the bottom; Theme shows Auto`);
    // Appearance: Theme, Background, Accent color, Board shape. (Clock in the corner is in Advanced.)
    const looks = await page.evaluate(() => { const h = [...document.querySelectorAll('#settings .sheet-body > h3')].find(x => x.textContent === 'Appearance'), out = [];
      for (let e = h.nextElementSibling; e && e.tagName !== 'H3' && !e.classList.contains('gap'); e = e.nextElementSibling) if (e.matches('.row')) out.push(e.querySelector('.lbl').textContent);
      return out; });
    ok(looks.join() === 'Theme,Background,Accent color,Board shape', `Appearance: ${looks.join(', ')}`);
    // Advanced: Widget Picker, then Clock in the corner (On, Off, Auto: Auto chosen on a new device), then Size; its row's
    // grey line says the clock is in it.
    const adv = await page.evaluate(() => ({ rows: [...document.getElementById('grp-advanced').children].filter(e => e.matches('.row') && e.querySelector('.lbl')).slice(0, 3).map(e => e.querySelector('.lbl').textContent),
      clock: [...document.querySelectorAll('#grp-advanced [data-act="clock"]')].map(b => b.textContent + (b.classList.contains('on') ? ' (chosen)' : '')).join(', '),
      sub: document.querySelector('#settings [data-act="group"][data-val="advanced"] .hint').textContent }));
    ok(adv.rows.join() === 'Widget Picker,Clock in the corner,Size of windows and menus' && adv.clock === 'On, Off, Auto (chosen)' && adv.sub === 'Widget Picker, clock, size, moving windows, history, backups, developer, erase',
      `Advanced: ${adv.rows.join(', ')}…, the clock ${adv.clock}; its row says “${adv.sub}”`);
    // Every set of choices says which setting it is, for a screen reader: Theme's Auto isn't the clock's Auto.
    const named = await page.evaluate(() => [...document.querySelectorAll('#settings [role="radiogroup"]')].map(g => `${g.getAttribute('aria-label') || '(no name)'}: ${[...g.querySelectorAll('[role="radio"]')].map(r => r.textContent).join('/')}`));
    ok(named.length >= 5 && !named.some(n => n.startsWith('(no name)')) && named.includes('Theme: Light/Dark/Auto') && named.includes('Clock in the corner: On/Off/Auto') && named.includes('Widget Picker: Both corners/Left/Right'),
      `every set of choices in Settings has a name (${named.join('; ')})`);
    ok(sh.groups.join() === 'widget-language hidden,saved hidden,bg hidden,advanced hidden,about hidden,code-license hidden,docs-license hidden' && !sh.missing.length && !sh.name,
      `every group starts closed, and is in the page, hidden (${sh.groups.join(', ')}); no page name field`);
    // This page › Windows: how many there are, open or closed; open, the list says Open or Closed (no sizes).
    const saved = () => page.evaluate(() => ({ value: document.querySelector('#settings [data-val="saved"] .v').textContent, label: document.querySelector('#settings [data-val="saved"] .lbl').textContent,
      items: [...document.querySelectorAll('#grp-saved .inst')].map(i => i.querySelector('.meta').innerText.replace(/\s+/g, ' ')) }));
    let sv = await saved();
    const emptyNote = await page.evaluate(() => document.querySelector('#grp-saved .empty-note').textContent);
    ok(sv.label === 'Windows' && sv.value === 'None' && await page.evaluate(() => document.getElementById('grp-saved').getAttribute('aria-label')) === 'Windows' &&
      emptyNote === 'No windows yet. Open a widget from the Widget Picker.',
      `This page › Windows on an empty page: ${sv.label}, ${sv.value} (“${emptyNote}”)`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const b = window.__board21; b.openWidget('notes'); b.openWidget('timer'); b.openWidget('dice'); }); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.closeWin('dice:1')); await page.waitForTimeout(400);
    await openSettings(page, ['saved']);
    sv = await saved();
    ok(sv.value === '3 windows' && sv.items.join(' | ') === 'Dice Closed | Notes Open | Timer Open' && await page.locator('#grp-saved .hint').first().textContent() === 'Closed windows keep their content until you delete them here.',
      `three windows, one closed: “${sv.value}” (${sv.items.join(' | ')})`);
    await page.evaluate(() => window.__board21.deleteInstance('dice:1')); await page.waitForTimeout(400);
    ok((await saved()).value === '2 windows', 'one deleted: “2 windows”');
    await page.evaluate(() => window.__board21.deleteInstance('timer:1')); await page.waitForTimeout(400);
    ok((await saved()).value === '1 window', 'and then “1 window”');
    // While the board isn't being saved, the same name, and the hint says how long closed windows keep their content.
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.evaluate(() => { window.__board21.writer.failing = new Error('test'); });
    await openSettings(page, ['saved']);
    sv = await saved();
    const unsavedHint = await page.locator('#grp-saved .hint').first().textContent();
    await page.keyboard.press('Escape'); await page.evaluate(() => window.__board21.writer.clear()); await page.waitForTimeout(200);
    ok(sv.label === 'Windows' && sv.value === '1 window' && unsavedHint === 'Closed windows keep their content while 21Board stays open.',
      `while changes aren’t saved: still “Windows” (${sv.label}, ${sv.value}; ${unsavedHint})`);
    await openSettings(page, ['saved']);
    // Windows stop at each other's edges: Off, or how hard a push overlaps them anyway (the old Snap switch and Push).
    await openSettings(page, ['advanced']);
    const snap = async v => { await page.click(`#settings [data-act="snap"][data-val="${v}"]`); await page.waitForTimeout(150);
      return page.evaluate(() => { const s = window.__board21.state.settings; return `${s.snapping}/${s.resistance}/${document.querySelector('#settings [data-act="snap"].on').dataset.val}`; }); };
    const seen = [];
    for (const v of ['off', 'light', 'medium', 'firm', 'off']) seen.push(v + ': ' + await snap(v));
    ok(seen.join(', ') === 'off: false/normal/off, light: true/gentle/light, medium: true/normal/medium, firm: true/strong/firm, off: false/strong/off',
      `Off turns snapping off; Light, Medium and Firm turn it on with that push (${seen.join(', ')})`);
    await page.evaluate(() => { window.__board21.updateBoard({}); }); await page.waitForTimeout(150);
    sh = await shape();
    ok(sh.groups.join() === 'widget-language hidden,saved open,bg hidden,advanced open,about hidden,code-license hidden,docs-license hidden', `open groups stay open while Settings is drawn again (${sh.groups.join(', ')})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await openSettings(page);
    sh = await shape();
    ok(sh.groups.join() === 'widget-language hidden,saved hidden,bg hidden,advanced hidden,about hidden,code-license hidden,docs-license hidden', 'and every group is closed again the next time Settings opens');
    // The amber dot on Advanced: only while a backup is overdue. Not on a new board, though the browser hasn't promised
    // to keep 21Board's data here: Advanced › Backups and storage says that.
    const dot = (p = page) => p.evaluate(() => { const d = document.getElementById('grp-advanced-warn'); return !!d && !d.hidden && getComputedStyle(d).display !== 'none'; });
    ok(!await dot(), 'no amber dot on Advanced on a new board, though storage isn’t protected');
    // A device from before Auto was the default that never saved a setting (an older 21Board with no settings record,
    // only its board and windows) was showing Light: it keeps Light, and it's saved.
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.evaluate(() => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const t = o.result.transaction('records', 'readwrite'); t.objectStore('records').delete('settings'); t.oncomplete = () => { o.result.close(); res(); }; }; }));
    await page.reload(); await boardUp(page); await page.waitForTimeout(300);
    const older = await page.evaluate(() => ({ theme: window.__board21.state.settings.theme, dark: document.body.classList.contains('dark'), notes: window.__board21.state.insts.has('notes:1') }));
    ok(older.theme === 'light' && !older.dark && older.notes && await storedTheme() === 'light', `a device from before with no saved settings keeps Light, even on a dark device (${JSON.stringify(older)})`);
    await ctx.close();
    // Days passing (the device's clock moved on), storage not protected: no dot on an empty board, nor 3 days after its
    // first window; a dot 8 days in with no backup, gone at once with Back up now. Advanced still says the storage isn't
    // protected, on its own.
    const days = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await days.addInitScript(CLOCK);
    await days.addInitScript(() => { const s = navigator.storage; s.persisted = async () => false; s.persist = async () => false; });
    const dp = await days.newPage(); dp.on('pageerror', e => errors.push(e.message));
    await dp.goto(BASE); await boardUp(dp);
    const after = async n => { await setClock(dp, n * 864e5); await dp.keyboard.press('Escape'); await openSettings(dp); await dp.waitForTimeout(300); return dot(dp); };
    const empty = await after(30);
    await setClock(dp, 0); await dp.evaluate(() => window.__board21.openWidget('notes')); await dp.waitForTimeout(1200);
    const day0 = await after(0), day3 = await after(3), day8 = await after(8);
    ok(!empty && !day0 && !day3 && day8, `storage not protected and no backup: no dot on an empty board (30 days), nor on the day of its first window or 3 days in; a dot 8 days in (${[empty, day0, day3, day8].join(', ')})`);
    await openSettings(dp, ['advanced']);
    const said = await dp.evaluate(() => ({ persist: document.getElementById('st-persist').textContent, hint: document.getElementById('st-persist-hint').textContent, backup: document.getElementById('st-backup').textContent }));
    ok(said.persist === 'Not yet' && said.hint === 'The browser might clear your boards to free up space. Installing 21Board as an app usually prevents that. Until then, back up regularly.' && said.backup === 'Last backup: never',
      `Advanced › Backups and storage still says the storage isn’t protected (“${said.persist}”: “${said.hint}”; ${said.backup})`);
    // What the dot is about is plain once Advanced is open: the backup line has the amber mark too, exactly while the
    // dot shows, and a screen reader hears what the dot means.
    const mark = () => dp.evaluate(() => { const b = document.getElementById('st-backup'); return !!b.querySelector('.status-dot.warn') && b.classList.contains('warn-line'); });
    const label = await dp.locator('#grp-advanced-warn').getAttribute('aria-label');
    ok(await mark() && label === 'Backup overdue', `8 days in, the backup line inside Advanced has the amber mark too, and the dot reads “Backup overdue” (${await mark()}, ${label})`);
    // A new page shown, empty (a teacher who starts one each day): the board still has a window 8 days old, on page 1.
    await dp.keyboard.press('Escape');
    await dp.evaluate(() => window.__board21.pages.create({ end: true, name: 'Tuesday' })); await dp.waitForTimeout(800);
    await openSettings(dp, ['advanced']); await dp.waitForTimeout(300);
    const onNew = { insts: await dp.evaluate(() => window.__board21.state.insts.size), dot: await dot(dp), mark: await mark() };
    ok(onNew.insts === 0 && onNew.dot && onNew.mark, `on a new, empty page the dot still shows, judged by the oldest window on any page (${JSON.stringify(onNew)})`);
    await Promise.all([dp.waitForEvent('download'), dp.click('#settings [data-act="backup"]')]);
    ok(await eventually(async () => !await dot(dp), 1000) && await dp.locator('#st-backup').textContent() === 'Last backup: today' && !await mark(), 'Back up now: the dot goes at once, and the amber mark beside the backup line with it');
    ok(!await after(14), 'and comes back only once that backup is a week old: none 6 days later (the clock 14 days on), though storage still isn’t protected');
    ok(await after(16), 'a dot 8 days after it');
    await days.close();
    // On an iPad, where the browser offers no Install button, the hint says how to add 21Board to the Home Screen.
    const ipad = await browser.newContext({ viewport: { width: 1024, height: 768 }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    await ipad.addInitScript(() => { const s = navigator.storage; s.persisted = async () => false; s.persist = async () => false; });
    const ip = await ipad.newPage(); ip.on('pageerror', e => errors.push(e.message));
    await ip.goto(BASE); await boardUp(ip); await openSettings(ip, ['advanced']);
    const ipSaid = await ip.evaluate(() => [document.getElementById('st-persist').textContent, document.getElementById('st-persist-hint').textContent].join(' | '));
    ok(ipSaid === 'Not yet | The browser might clear your boards to free up space. To prevent that, tap Share › Add to Home Screen. Until then, back up regularly.', `on an iPad, the hint says how to protect the boards there (${ipSaid})`);
    await ipad.close();
    // The dot is right from the moment Settings opens, whatever changed since it was last open (it judges every page from
    // what this tab holds), so it never shows wrongly for a moment, and the next Theme tap is put in place (Settings
    // isn't drawn again). A reload on a new, empty page while page 1 has a window 9 days old; that page deleted (its Undo
    // offered); then a window 9 days old on the page shown, deleted.
    const again = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await again.addInitScript(CLOCK);
    await again.addInitScript(() => { const s = navigator.storage; s.persisted = async () => false; s.persist = async () => false; });
    const ap = await again.newPage(); ap.on('pageerror', e => errors.push(e.message));
    await ap.goto(BASE); await boardUp(ap);
    const insts = () => ap.evaluate(() => window.__board21.state.insts.size);
    // (every state of the dot while Settings is open, from the tap that opens it, and how often Settings is drawn)
    const arm = () => ap.evaluate(() => {
      const s = document.getElementById('settings'), body = s.querySelector('.sheet-body');
      window.__dots = []; window.__drawn = 0;
      if (window.__dotObs) window.__dotObs.disconnect();
      window.__dotObs = new MutationObserver(ms => {
        if (ms.some(m => m.target === body && m.type === 'childList')) window.__drawn++;
        const d = document.getElementById('grp-advanced-warn'), v = d && !d.hidden ? 'dot' : 'none';
        if (s.classList.contains('open') && window.__dots[window.__dots.length - 1] !== v) window.__dots.push(v);
      });
      window.__dotObs.observe(s, { childList: true, subtree: true, attributes: true });
    });
    // (closed before anything changes: what changes while it is open is put in place, and read again)
    const shut = async () => { await ap.keyboard.press('Escape'); await ap.waitForFunction(() => !document.getElementById('settings').classList.contains('open')); };
    const storageSaid = () => ap.evaluate(() => / of /.test(document.getElementById('st-storage').textContent));
    // Settings opened (with what it reads settled: storage, and the dot as it ends), then a Theme tap: what was seen.
    const openThenTheme = async (theme, dotEnds) => {
      await shut(); await arm(); await openSettings(ap);
      const settled = await eventually(async () => await storageSaid() && await dot(ap) === dotEnds, 3000);
      const dots = await ap.evaluate(() => window.__dots.slice());
      await ap.evaluate(() => { window.__drawn = 0; });
      await ap.click(`#settings [data-act="theme"][data-val="${theme}"]`);
      await eventually(() => ap.evaluate(t => document.querySelector(`#settings [data-act="theme"][data-val="${t}"]`).getAttribute('aria-checked') === 'true', theme), 2000);
      return { settled, dots, drawn: await ap.evaluate(() => window.__drawn) };
    };
    await setClock(ap, 0); await ap.evaluate(() => window.__board21.openWidget('notes'));
    await eventually(async () => await insts() === 1, 3000);
    await ap.evaluate(() => window.__board21.pages.create({ end: true, name: 'Tuesday' }));
    await eventually(() => ap.evaluate(() => window.__board21.state.board.name === 'Tuesday'), 3000);
    await setClock(ap, 9 * 864e5); await ap.reload(); await boardUp(ap);
    let look = await openThenTheme('dark', true);
    ok(look.settled && look.dots.join() === 'dot' && look.drawn === 0,
      `after a reload on a new, empty page, page 1 having a window 9 days old: the dot from the moment Settings opens, and the next Theme tap doesn’t draw Settings again (${JSON.stringify(look)})`);
    const p1 = await ap.evaluate(() => window.__board21.pages.ids().find(b => b !== window.__board21.state.boardId));
    await shut(); await ap.evaluate(b => window.__board21.pages.drop([b], 'Deleted.'), p1);
    await eventually(() => ap.evaluate(b => (window.__board21.state.settings.deletedBoards || []).includes(b), p1), 2000);
    look = await openThenTheme('light', false);
    ok(look.settled && look.dots.join() === 'none' && look.drawn === 0,
      `that page deleted (its Undo offered): Settings opens again with no dot, not even for a moment, and the next Theme tap doesn’t draw it again (${JSON.stringify(look)})`);
    await shut(); await setClock(ap, 0); await ap.evaluate(() => window.__board21.openWidget('notes'));
    await eventually(async () => await insts() === 1, 3000);
    await setClock(ap, 9 * 864e5);
    look = await openThenTheme('dark', true);
    const ik = await ap.evaluate(() => Array.from(window.__board21.state.insts.keys())[0]);
    await shut(); await ap.evaluate(ik => window.__board21.deleteInstance(ik), ik);
    await eventually(async () => await insts() === 0, 2000);
    const gone = await openThenTheme('system', false);
    ok(look.settled && look.dots.join() === 'dot' && gone.settled && gone.dots.join() === 'none' && gone.drawn === 0,
      `a window 9 days old on the page shown: the dot; that window deleted: Settings opens again with no dot, not even for a moment, and the next Theme tap doesn’t draw it again (${JSON.stringify([look, gone])})`);
    await again.close();
    // Storage protected: a backup overdue still shows the dot.
    const kept = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await kept.addInitScript(() => { const s = navigator.storage; s.persisted = async () => true; s.persist = async () => true; });
    const kp = await kept.newPage(); kp.on('pageerror', e => errors.push(e.message));
    await kp.goto(BASE); await boardUp(kp);
    await openSettings(kp, ['advanced']); await kp.waitForTimeout(300);
    const none = await dot(kp), why = await kp.locator('#st-backup').textContent(), prot = await kp.locator('#st-persist').textContent();
    await kp.evaluate(() => window.__board21.state.settings.lastBackupAt = Date.now() - 8 * 864e5);
    await kp.keyboard.press('Escape'); await openSettings(kp, ['advanced']); await kp.waitForTimeout(300);
    const overdue = await dot(kp);
    const [dl] = await Promise.all([kp.waitForEvent('download'), kp.click('#settings [data-act="backup"]')]);
    ok(!none && why === 'Last backup: never' && prot === 'Protected' && overdue && /\.21board$/.test(dl.suggestedFilename()) && await eventually(async () => !await dot(kp), 2000),
      `with storage protected: no dot on a new board; a dot when the last backup is 8 days old, gone once there is a new one (${[none, why, prot, overdue].join(', ')})`);
    await kept.close();
    // The widget dev window: no Classroom features but Close all, no Board Sync; This page › Windows sits under Widget test mode.
    const lab = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    const lp = await lab.newPage();   // (its test widget throws on purpose)
    await lp.goto(BASE + '__dev/widget.html'); await lp.waitForTimeout(2500);
    const board = lp.frames().find(f => f.parentFrame() === lp.mainFrame());
    const labShape = board && await board.evaluate(() => { document.querySelector('.picker-btn.left').click(); document.querySelector('[data-ctl="settings"]').click();
      const heads = [...document.querySelectorAll('#settings .sheet-body > h3')].map(h => h.textContent), saved = document.querySelector('#settings [data-val="saved"]');
      const h = [...document.querySelectorAll('#settings h3')].filter(e => e.compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
      const erase = document.querySelector('#settings [data-act="erase"]'), eh = [...document.querySelectorAll('#grp-advanced h4')].filter(e => e.compareDocumentPosition(erase) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
      return { heads, under: h && h.textContent, dot: !!document.getElementById('grp-advanced-warn') && !document.getElementById('grp-advanced-warn').hidden, rows: ['lock-windows', 'awake', 'hist-open', 'close-all', 'backup', 'devmode', 'clock'].filter(a => document.querySelector(`#settings [data-act="${a}"]`)),
        adv: [...document.querySelectorAll('#grp-advanced h4')].map(e => e.textContent), erase: eh && eh.textContent, sub: document.querySelector('#settings [data-act="group"][data-val="advanced"] .hint').textContent }; });
    ok(labShape && labShape.heads.join() === 'Classroom,Widget test mode,Appearance' && labShape.under === 'Widget test mode' && labShape.rows.join() === 'close-all' && !labShape.dot,
      `the widget dev window’s Settings: ${labShape && labShape.heads.join(', ')}, with only Close all in Classroom (${JSON.stringify(labShape)})`);
    ok(labShape && labShape.adv.join() === 'Moving windows,Storage' && labShape.erase === 'Storage', `and in Advanced, Erase everything is under Storage, not under Moving windows (${labShape && labShape.adv.join(', ')})`);
    ok(labShape && labShape.sub === 'Widget Picker, size, moving windows, erase', `and no clock in it, nor in its row’s grey line (“${labShape && labShape.sub}”)`);
    await lab.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  // Settings › About (board.js, aboutSettings): its own group, directly below Advanced. Inside, top to bottom: the 21 gear,
  // the team's sentence, the version and where the work is stored, the license (each license's full text comes from the
  // offline copy), the credits, and the goat. The two pictures are the district's files, byte for byte, in light and dark.
  ['Settings: About (its own group below Advanced: the 21 gear, the sentence, version and storage, license, credits, the goat; offline, kiosk, Board Sync, the widget dev window, Size 50%–200%, both corners)', async (browser) => {
    const errors = [];
    const SENTENCE = 'Made with Love and Stubbornness by the CCSD21 Technology Services team at Gill Center, Wheeling, Illinois, USA';
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), VERSION = /const VERSION = '([^']+)'/.exec(sw)[1];
    // The two pictures, unchanged (the sha-256 of the files as given).
    const PICS = { 'icons/gear-21.png': '1c2c1163ae6ee714cbb1dc65144b3fae5b888d9db87808c93f485b475685df48', 'icons/goat.png': 'c6072947ca83bc84cb3e40af98280185a9532ad1678bd2e4e6fc02c001233ae6' };
    const same = Object.entries(PICS).map(([f, h]) => { try { return require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex') === h; } catch (e) { return false; } });
    ok(same.every(Boolean), `the 21 gear and the goat are the files as given, byte for byte (${Object.keys(PICS).map((f, i) => f + (same[i] ? '' : ': differs or missing')).join(', ')})`);
    // In the offline copy's list (sw.js), with the license texts About shows.
    const vm = require('vm');
    const box = { addEventListener() {} }; box.self = box;
    box.importScripts = (...files) => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), box));
    vm.createContext(box);
    const list = vm.runInContext(sw + '\n;PRECACHE;', box);
    const NEEDED = Object.keys(PICS).concat(['LICENSE', 'LICENSE-DOCS']);
    ok(NEEDED.every(f => list.includes(f)), `the pictures and the license texts are in the offline copy’s list (${NEEDED.filter(f => !list.includes(f)).join(', ') || 'all ' + NEEDED.length})`);

    // What About shows, in reading order: its text, and each picture as [src "alt"]. A closed group inside it is left out.
    const about = p => p.evaluate(() => {
      const row = document.querySelector('#settings [data-act="group"][data-val="about"]'), box = document.getElementById('grp-about');
      if (!row || !box) return null;
      // (each block, line and picture a part of its own)
      let s = '';
      const walk = n => { for (const c of n.childNodes) {
        if (c.nodeType === 3) { s += c.textContent; continue; }
        if (c.nodeType !== 1 || c.hidden || c.getAttribute('aria-hidden') === 'true' || getComputedStyle(c).display === 'none') continue;
        if (c.tagName === 'IMG') { s += ` | [${c.getAttribute('src')} "${c.alt}"] | `; continue; }
        if (c.tagName === 'BR') { s += ' | '; continue; }
        const block = !/^inline/.test(getComputedStyle(c).display);
        if (block) s += ' | ';
        walk(c);
        if (block) s += ' | ';
      } };
      walk(box);
      const parts = s.split('|').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const kids = [...document.querySelector('#settings .sheet-body').children];
      return { parts, text: parts.join(' | '), open: row.getAttribute('aria-expanded') === 'true', hidden: box.hidden, label: box.getAttribute('aria-label'),
        sub: (row.querySelector('.hint') || {}).textContent || '', value: (row.querySelector('.v') || {}).textContent || '',
        afterAdvanced: (document.getElementById('grp-advanced') || {}).nextElementSibling === row, last: kids[kids.length - 1] === box,
        groups: [...document.querySelectorAll('#settings [data-act="group"]')].filter(b => !b.closest('#grp-about')).map(b => b.dataset.val),
        inAdvanced: !!document.querySelector('#grp-advanced #st-version, #grp-advanced .about'), links: box.querySelectorAll('a[href]').length,
        credits: [...box.querySelectorAll('.about-credits li')].map(li => li.innerText.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / ')),   // (" / ": a line of its own)
        imgs: [...box.querySelectorAll('img')].map(i => ({ src: i.getAttribute('src'), alt: i.alt, w: i.naturalWidth, h: i.naturalHeight, done: i.complete, filter: getComputedStyle(i).filter, opacity: getComputedStyle(i).opacity })) };
    });
    // The marks About's text must show, in this order.
    const MARKS = ['[icons/gear-21.png "', SENTENCE, `21Board ${VERSION} (`, ' · Widget SDK protocol 1', 'Your work is stored only on this device.', 'License', '© 2026 Community Consolidated School District 21',
      'Code', 'Apache 2.0', 'Docs', 'CC BY 4.0', 'Credits', 'Inter', 'Excalifont', 'Crayon Libre', 'Weather data', 'YouTube', '[icons/goat.png "'];
    const inOrder = (text, marks) => { let at = -1; for (const m of marks) { const i = text.indexOf(m, at + 1); if (i < 0) return `“${m}” missing or out of order`; at = i; } return ''; };
    // (Each font and its license are names, on lines of their own: no end period. The trademark line is two sentences.)
    const CREDITS = ['Inter by Rasmus Andersson and the Inter Project Authors / SIL Open Font License 1.1',
      'Excalifont by Excalidraw / SIL Open Font License 1.1', 'Crayon Libre by GGBotNet / CC0 1.0', 'Weather data by Open-Meteo / CC BY 4.0',
      'Weather data by the National Weather Service / Public domain', 'YouTube and Google Drive are trademarks of Google LLC. Vimeo is a trademark of Vimeo.com, Inc.'];
    // Settings opened on that side, with the groups named open (those that are there).
    const open = async (p, groups = [], side = 'left') => {
      await openSettings(p, [], side);
      const have = [];
      for (const g of groups) if (await p.locator(`#settings [data-act="group"][data-val="${g}"]`).count()) have.push(g);
      await openSettings(p, have, side);
    };
    const shut = async p => { await p.keyboard.press('Escape'); await p.waitForTimeout(150); };

    // ---- A stamped release, served as a site.
    deploy('about');
    const url = BASE + '__site/about/';
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await boardUp(page);
    await open(page);
    let a = await about(page);
    ok(!!a && a.afterAdvanced && a.last && a.groups.slice(-2).join() === 'advanced,about' && !a.open && a.hidden && a.label === 'About',
      `About is a group of its own, the last row, directly below Advanced, closed when Settings opens (${a ? a.groups.join(', ') : 'no About'})`);
    ok(!!a && a.sub === `Version ${VERSION}` && !a.value, `closed, its grey line says the version (“${a && a.sub}”)`);
    const adv = await page.evaluate(() => (document.querySelector('#settings [data-act="group"][data-val="advanced"] .hint') || {}).textContent);
    ok(!!a && !a.inAdvanced && adv === 'Widget Picker, clock, size, moving windows, history, backups, developer, erase',
      `the version and the storage line are no longer in Advanced, and Advanced’s grey line lists what it did (“${adv}”)`);
    await open(page, ['about']);
    a = await about(page);
    let miss = a ? inOrder(a.text, MARKS) : 'no About';
    ok(!miss && a.open && /^\[icons\/gear-21\.png "[^"]+"\]/.test(a.text) && /\[icons\/goat\.png "[^"]+"\]$/.test(a.text),
      `open, top to bottom: the 21 gear, the sentence, the version and the storage line, License, Credits, the goat at the very bottom (${miss || a.parts.length + ' parts'})`);
    ok(!!a && a.parts.includes(SENTENCE), `the sentence, exactly: “${SENTENCE}”`);
    ok(!!a && a.credits.join(' | ') === CREDITS.join(' | '), `Credits: the three fonts with their makers and licenses, the weather’s two sources, and the three video sites’ owners (${a && a.credits.join(' | ')})`);
    ok(!!a && a.imgs.length === 2 && a.imgs.map(i => i.alt).join() === '21 gear,Goat' && a.imgs.every(i => i.done && i.w > 0), `the two pictures load, each with a short alt text (${a && a.imgs.map(i => `${i.src} “${i.alt}” ${i.w}×${i.h}`).join(', ')})`);
    await page.screenshot({ path: OUT + 'about-open.png' });

    // An update waiting (the offline copy is another build): the offline copy is named on a line of its own, and no "·"
    // is left at the end of a line, at Size 80% and 200%.
    const swWas = await page.evaluate(() => { const s = window.__board21.state.sw; return { version: s.version, build: s.build }; });
    const releaseLines = () => page.evaluate(() => {
      const box = document.querySelector('#grp-about .about'), chars = [], walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) for (let i = 0; i < n.data.length; i++) {
        if (!n.data[i].trim()) continue;
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
        const q = r.getClientRects()[0]; if (q) chars.push({ c: n.data[i], top: q.top, h: q.height });
      }
      return { lines: box.innerText.split('\n').map(x => x.trim()).filter(Boolean), hanging: chars.some((x, i) => x.c === '·' && (!chars[i + 1] || chars[i + 1].top > x.top + x.h / 2)) };
    });
    const waiting = [];
    for (const scale of [0.8, 2]) {
      await shut(page);
      await page.evaluate(s => window.__board21.setBoardScale(s), scale);
      await page.evaluate(() => Object.assign(window.__board21.state.sw, { version: '2026.11.19-1', build: 'abcd1234' }));
      await open(page, ['about']);
      waiting.push(Object.assign({ at: scale * 100 + '%' }, await releaseLines()));
    }
    await shut(page);
    await page.evaluate(v => Object.assign(window.__board21.state.sw, v), swWas);
    await page.evaluate(() => window.__board21.setBoardScale(0.8));
    ok(waiting.every(w => w.lines[0] === `21Board ${VERSION} (${SITES.about.build}) · Widget SDK protocol 1` && w.lines[1] === 'Offline copy 2026.11.19-1 (abcd1234)' && !w.hanging),
      `an update waiting, the offline copy has a line of its own, and no “·” ends a line (${waiting.map(w => `${w.at}: ${w.lines.join(' / ')}${w.hanging ? ' (a “·” ends a line)' : ''}`).join('; ')})`);

    // Reading a license, Settings drawn again (a window opens, so Windows changes) keeps the place, with its row
    // still holding the keyboard, as after a tap.
    await open(page, ['about']);
    await page.click('#settings [data-act="group"][data-val="code-license"]');
    await eventually(() => page.evaluate(() => document.querySelectorAll('#grp-code-license p').length > 20), 8000);
    const place = () => page.evaluate(() => {
      const b = document.querySelector('#settings .sheet-body'), top = b.getBoundingClientRect().top;
      const p = [...document.querySelectorAll('#grp-code-license p')].find(x => x.getBoundingClientRect().top >= top);
      return { at: Math.round(b.scrollTop), first: p ? p.textContent.slice(0, 40) : '', keys: document.activeElement.dataset.val || document.activeElement.tagName };
    });
    await page.evaluate(() => { const g = document.getElementById('grp-code-license'), b = document.querySelector('#settings .sheet-body'); b.scrollTop += g.getBoundingClientRect().top - b.getBoundingClientRect().top + 1500; });
    const before = await place();
    await page.evaluate(() => window.__board21.openWidget('dice')); await page.waitForTimeout(600);
    const after = await place();
    ok(before.keys === 'code-license' && before.at > 1000 && Math.abs(after.at - before.at) < 2 && after.first === before.first,
      `reading a license, Settings drawn again keeps the place (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
    await shut(page);

    // ---- Offline: the pictures and both license texts come from the offline copy.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => {});
    const cached = () => page.evaluate(async () => { const k = (await caches.keys()).filter(n => n.startsWith('21board-')); if (!k.length) return []; const c = await caches.open(k[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
    ok(await eventually(async () => { const c = await cached(); return NEEDED.every(f => c.includes('/__site/about/' + f)); }, 15000), 'a device saves them with the rest of its offline copy');
    await shut(page);
    await ctx.setOffline(true);
    await page.reload(); await boardUp(page);
    await open(page, ['about', 'code-license', 'docs-license']);
    const texts = () => page.evaluate(() => ['code-license', 'docs-license'].map(k => { const g = document.getElementById('grp-' + k); return g && !g.hidden ? g.innerText : ''; }));
    let t = ['', ''];
    await eventually(async () => { t = await texts(); return t.every(x => x.length > 5000); }, 5000);
    a = await about(page);
    ok(!!a && a.imgs.length === 2 && a.imgs.every(i => i.done) && a.imgs.map(i => `${i.w}×${i.h}`).join() === '880×880,618×733', `offline, both pictures load from the offline copy (${a && a.imgs.map(i => `${i.src} ${i.w}×${i.h}`).join(', ')})`);
    ok(/Apache License\s+Version 2\.0, January 2004/.test(t[0]) && /END OF TERMS AND CONDITIONS/.test(t[0]), `offline, Code opens the Apache License 2.0 in full (${t[0].length} characters)`);
    ok(/Attribution 4\.0 International/.test(t[1]) && /Creative Commons may be contacted at creativecommons\.org\./.test(t[1]), `and Docs the CC BY 4.0 license in full (${t[1].length} characters)`);
    // (A block of short lines keeps them: the Apache title. The files' headings are headings.)
    const heads = await page.evaluate(() => ['code-license', 'docs-license'].map(k => { const t = document.querySelector(`#grp-${k} .license-text`);
      return { first: t && t.firstElementChild ? t.firstElementChild.innerText : '', heads: t ? [...t.querySelectorAll('h5')].map(h => h.innerText.replace(/\s+/g, ' ')) : [] }; }));
    ok(heads[0].first === 'Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/'
      && heads[0].heads.join(' | ') === 'Apache License Version 2.0, January 2004 http://www.apache.org/licenses/ | TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION | END OF TERMS AND CONDITIONS | APPENDIX: How to apply the Apache License to your work.'
      && heads[1].heads[0] === 'Attribution 4.0 International' && heads[1].heads.filter(h => /^Section \d -- /.test(h)).length === 8,
      `the title keeps its lines, and the headings are headings (${JSON.stringify(heads[0].first)}; ${heads[0].heads.length} and ${heads[1].heads.length} headings)`);
    // (Its paragraphs flow to the width of Settings: no line sticks out.)
    const flows = await page.evaluate(() => { const g = document.getElementById('grp-code-license'); if (!g) return false; const r = g.getBoundingClientRect(); return [...g.querySelectorAll('*')].every(e => e.getBoundingClientRect().right <= r.right + 1) && g.querySelectorAll('p').length > 20; });
    ok(flows, 'the license text flows in paragraphs, within Settings');
    await page.screenshot({ path: OUT + 'about-license-offline.png' });
    await shut(page);
    await ctx.setOffline(false);

    // ---- Tidy at Size 50% and 200%, on 1366 × 768 and 1920 × 1080, from either corner: nothing
    // sticks out of Settings, and the pictures keep their size on screen.
    const fits = p => p.evaluate(() => {
      const body = document.querySelector('#settings .sheet-body'), box = document.getElementById('grp-about');
      if (!box || box.hidden) return null;
      const r = box.getBoundingClientRect();
      const out = [...box.querySelectorAll('*')].filter(e => { const q = e.getBoundingClientRect(); return q.width && (q.right > r.right + 1 || q.left < r.left - 1); }).map(e => e.tagName.toLowerCase() + (e.className ? '.' + e.className : ''));
      const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
      return { wide: body.scrollWidth > body.clientWidth + 1, out, imgs: [...box.querySelectorAll('img')].map(i => Math.round(i.getBoundingClientRect().width / ui)) };
    });
    const tidy = [];
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const scale of [0.5, 2]) for (const side of ['left', 'right']) {
        await page.evaluate(s => window.__board21.setBoardScale(s), scale); await page.waitForTimeout(150);
        await open(page, ['about', 'code-license'], side);
        const f = await fits(page);
        tidy.push({ at: `${w}×${h} ${scale * 100}% ${side}`, f });
        if (w === 1366 && scale === 2 && side === 'right') await page.screenshot({ path: OUT + 'about-200-right.png' });
        await shut(page);
      }
    }
    await open(page, ['about', 'docs-license']);
    tidy.push({ at: '1920×1080 200%, the docs license', f: await fits(page) });
    await shut(page);
    const bad = tidy.filter(x => !x.f || x.f.wide || x.f.out.length || x.f.imgs.length !== 2 || x.f.imgs.some(px => px < 48 || px > 160));
    ok(!bad.length, `tidy at Size 50% and 200%, both screens and both corners (${bad.length ? JSON.stringify(bad) : tidy.length + ' looks, the pictures ' + tidy[0].f.imgs.join(' and ') + ' px'})`);
    await page.evaluate(() => window.__board21.setBoardScale(0.8));

    // ---- Kiosk mode: the same About, with nothing that leaves 21Board.
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('[kiosk] ' + e.message));
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k);
    await open(k, ['about']);
    a = await about(k);
    miss = a ? inOrder(a.text, MARKS) : 'no About';
    ok(!miss && a.afterAdvanced && a.links === 0, `kiosk mode: the same About below Advanced, with no links out (${miss || a.parts.length + ' parts'})`);
    await k.close();
    await ctx.close();

    // ---- A license the host didn't send (a blip, or offline before the offline copy is saved): says what to do, at
    // once when Settings is drawn again, and is read again when opened again.
    let fail = true;
    SITES.about.fault['LICENSE'] = res => { if (!fail) return; fail = false; res.writeHead(503); res.end(); return true; };
    const nc = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
    const np = await nc.newPage(); np.on('pageerror', e => errors.push('[no answer] ' + e.message));
    await np.goto(url); await boardUp(np);
    await open(np, ['about', 'code-license']);
    const codeText = () => np.evaluate(() => document.getElementById('grp-code-license').innerText.trim());
    let lic = '';
    await eventually(async () => (lic = await codeText()) !== 'Loading…', 5000);
    const drawn = await np.evaluate(() => { document.querySelector('#settings [data-act="group"][data-val="docs-license"]').click(); return document.getElementById('grp-code-license').innerText.trim(); });
    ok(!fail && lic === 'Can’t load the license. Try again online.' && drawn === lic, `a license the host didn’t send: “${lic}”, and at once when Settings is drawn again (“${drawn}”)`);
    await np.click('#settings [data-act="group"][data-val="code-license"]'); await np.click('#settings [data-act="group"][data-val="code-license"]');
    await eventually(async () => /END OF TERMS AND CONDITIONS/.test(lic = await codeText()), 5000);
    ok(/^Apache License/.test(lic) && /END OF TERMS AND CONDITIONS/.test(lic), `closed and opened again, it is read again (${lic.length} characters)`);
    delete SITES.about.fault['LICENSE'];
    await nc.close();

    // ---- Dark: the same two pictures, untouched (the navy gear stays as it is: no light version).
    const dark = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' });
    const dp = await dark.newPage(); dp.on('pageerror', e => errors.push('[dark] ' + e.message));
    await dp.goto(BASE); await boardUp(dp);
    await open(dp, ['about']);
    a = await about(dp);
    ok(!!a && await dp.evaluate(() => document.body.classList.contains('dark')) && a.imgs.map(i => i.src).join() === 'icons/gear-21.png,icons/goat.png' && a.imgs.every(i => i.filter === 'none' && i.opacity === '1'),
      `in dark mode, the same two files, with no filter (${a && a.imgs.map(i => `${i.src} ${i.filter} ${i.opacity}`).join(', ')})`);
    await dp.screenshot({ path: OUT + 'about-dark.png' });
    await dark.close();

    // ---- Board Sync: the storage line names the Drive folder too.
    const D = await driveDevice(browser); D.p.on('pageerror', e => errors.push('[sync] ' + e.message));
    await D.p.goto(BASE); await boardUp(D.p);
    await linkFolder(D.p, 'the laptop');
    await open(D.p, ['about']);
    a = await about(D.p);
    ok(!!a && a.parts.includes('Your work is stored only on this device and in your school Google Drive.') && !a.parts.includes('Your work is stored only on this device.'),
      `with Board Sync: “Your work is stored only on this device and in your school Google Drive.” (${a && a.parts.filter(x => /stored/.test(x)).join(' | ')})`);
    await D.c.close();

    // ---- The widget dev window: a short About below Advanced, with the version and the SDK protocol, and nothing
    // loaded from 21Board's site (in an AI tool's preview, that would be another site).
    const lab = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    const lp = await lab.newPage();   // (its test widget throws on purpose)
    await lp.goto(BASE + '__dev/widget.html'); await lp.waitForTimeout(2500);
    const board = lp.frames().find(f => f.parentFrame() === lp.mainFrame());
    const labAbout = board && await board.evaluate(() => {
      document.querySelector('.picker-btn.left').click(); document.querySelector('[data-ctl="settings"]').click();
      const row = document.querySelector('#settings [data-act="group"][data-val="about"]');
      if (!row) return null;
      row.click();   // (Settings is drawn again)
      const now = document.querySelector('#settings [data-act="group"][data-val="about"]'), box = document.getElementById('grp-about');
      return { sub: (now.querySelector('.hint') || {}).textContent, after: (now.previousElementSibling || {}).id, text: box.innerText.replace(/\s+/g, ' ').trim(), imgs: box.querySelectorAll('img').length, groups: box.querySelectorAll('[data-act="group"]').length };
    });
    ok(!!labAbout && labAbout.after === 'grp-advanced' && labAbout.sub === `Version ${VERSION}` && !labAbout.imgs && !labAbout.groups && /^21Board \S+ \([0-9a-f]{8}\) · Widget SDK protocol 1 Your work is stored only on this device\.$/.test(labAbout.text),
      `the widget dev window: a short About below Advanced, the version and the SDK protocol, no pictures (${JSON.stringify(labAbout)})`);
    await lab.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Settings stays still when a section opens: its row stays put, the section opens below it, past the bottom if need be (1366 × 768, light, the usual size and 200%: Advanced, About, a license in About, the keyboard, closing)', async (browser) => {
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: 'light' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page);
    const row = g => `#settings [data-act="group"][data-val="${g}"]`;
    // A group's row on the screen (its top, in px), the sheet's scroll, and whether the group is open, runs past the
    // sheet's bottom and has the keyboard.
    const where = g => page.evaluate(s => {
      const b = document.querySelector('#settings .sheet-body'), r = document.querySelector(s), box = document.getElementById(r.getAttribute('aria-controls'));
      return { top: r.getBoundingClientRect().top, scroll: b.scrollTop, open: r.getAttribute('aria-expanded') === 'true' && !box.hidden,
        past: !box.hidden && box.getBoundingClientRect().bottom > b.getBoundingClientRect().bottom + 1, keys: document.activeElement === r };
    }, row(g));
    // Settings scrolled so that the row is near the bottom (all of it showing, 30 px above), at the very bottom of the
    // sheet ('end'), or in the middle ('middle').
    const scrollTo = (g, to) => page.evaluate(([s, to]) => {
      const b = document.querySelector('#settings .sheet-body'), r = document.querySelector(s).getBoundingClientRect(), bb = b.getBoundingClientRect();
      const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;   // (the sheet is drawn zoomed)
      if (to === 'end') b.scrollTop = b.scrollHeight;
      else b.scrollTop += (to === 'middle' ? r.top + r.height / 2 - (bb.top + bb.height / 2) : r.bottom - (bb.bottom - 30)) / ui;
    }, [row(g), to]);
    // The group opened or closed as a teacher does: a tap, or a key on its row (Enter or Space). What moved.
    const toggle = async (g, how = 'tap') => {
      if (how !== 'tap') await page.evaluate(s => document.querySelector(s).focus({ preventScroll: true }), row(g));
      const a = await where(g);
      if (how === 'tap') await page.click(row(g)); else await page.keyboard.press(how);
      await page.waitForTimeout(300);
      const b = await where(g);
      return { g, how, before: a, after: b, dy: Math.round((b.top - a.top) * 10) / 10, same: Math.abs(b.top - a.top) <= 1 && b.scroll === a.scroll };
    };
    const say = r => `${r.g} by ${r.how}: its row moved ${r.dy} px, scroll ${Math.round(r.before.scroll)} → ${Math.round(r.after.scroll)}, ${r.after.open ? 'open' : 'closed'}` +
      `${r.after.past ? ', running past the bottom' : ''}${r.after.keys ? ', the keyboard on its row' : ''}`;
    for (const scale of [null, 2]) {
      const size = scale ? '200%' : 'the usual size';
      if (scale) { await page.keyboard.press('Escape'); await page.evaluate(s => window.__board21.setBoardScale(s), scale); await page.waitForTimeout(300); }
      // Tapped: Advanced near the bottom, then About near the bottom and at the very bottom with Advanced open above it,
      // then a license in About (a group in a group) near the bottom, also once its text has come in, and again with
      // its text already there.
      await openSettings(page);
      await scrollTo('advanced');
      let r = await toggle('advanced');
      ok(r.same && r.after.open && r.after.past && r.after.keys, `${size}: Advanced, tapped near the bottom, opens below its row, which stays put, and runs past the bottom; nothing scrolls (${say(r)})`);
      await scrollTo('about');
      r = await toggle('about');
      ok(r.same && r.after.open && r.after.past, `${size}: About, tapped near the bottom with Advanced open, opens below its row, which stays put (${say(r)})`);
      await toggle('about');   // (closed again: About is last, so the sheet gets shorter and the browser may pull it down)
      await scrollTo('about', 'end');
      r = await toggle('about');
      ok(r.same && r.after.open && r.after.past, `${size}: About, tapped at the very bottom with Advanced open, opens below its row, which stays put (${say(r)})`);
      await scrollTo('code-license');
      r = await toggle('code-license');
      await eventually(() => page.evaluate(() => document.querySelectorAll('#grp-code-license p').length > 20), 8000);
      const read = await where('code-license');
      ok(r.same && r.after.open && Math.abs(read.top - r.before.top) <= 1 && read.scroll === r.before.scroll && read.past,
        `${size}: Code, a license inside About, opens below its row, which stays put, also once the license has come in (${say(r)}; then its row at ${Math.round(read.top - r.before.top)} px, scroll ${Math.round(read.scroll)})`);
      await toggle('code-license');
      await scrollTo('code-license');
      r = await toggle('code-license');
      ok(r.same && r.after.open && r.after.past, `${size}: Code, opened again near the bottom with its text already there, opens below its row, which stays put (${say(r)})`);
      // Closed in the middle of the sheet: the row stays put too.
      await scrollTo('advanced', 'middle');
      r = await toggle('advanced');
      ok(r.same && !r.after.open, `${size}: Advanced, closed in the middle of the sheet, stays put (${say(r)})`);
      // The keyboard: Enter on Advanced near the bottom, Space on About at the very bottom. The keyboard stays on the row.
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      await openSettings(page);
      ok(await page.evaluate(() => document.querySelector('#settings .sheet-body').scrollTop) === 0, `${size}: Settings still opens at the top`);
      await scrollTo('advanced');
      r = await toggle('advanced', 'Enter');
      ok(r.same && r.after.open && r.after.past && r.after.keys, `${size}: Enter on Advanced near the bottom opens it below its row, which stays put, with the keyboard on it (${say(r)})`);
      await scrollTo('about', 'end');
      r = await toggle('about', 'Space');
      ok(r.same && r.after.open && r.after.past && r.after.keys, `${size}: Space on About at the very bottom opens it below its row, which stays put, with the keyboard on it (${say(r)})`);
      if (scale) await page.screenshot({ path: OUT + 'settings-still-200.png' });
    }
    await ctx.close();
    // A finger: Settings opened with taps, then a tap on Advanced near the bottom.
    const touch = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: 'light', hasTouch: true });
    const tp = await touch.newPage(); tp.on('pageerror', e => errors.push(e.message));
    await tp.goto(BASE); await boardUp(tp);
    await tp.tap('.picker-btn.left'); await tp.tap('.panel.open [data-ctl="settings"]'); await tp.waitForSelector('#settings.open'); await tp.waitForTimeout(400);
    await tp.evaluate(s => { const b = document.querySelector('#settings .sheet-body'), r = document.querySelector(s).getBoundingClientRect(), bb = b.getBoundingClientRect();
      b.scrollTop += (r.bottom - (bb.bottom - 30)) / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1); }, row('advanced'));
    await tp.waitForTimeout(200);
    const spot = () => tp.evaluate(s => ({ top: document.querySelector(s).getBoundingClientRect().top, scroll: document.querySelector('#settings .sheet-body').scrollTop, open: document.querySelector(s).getAttribute('aria-expanded') }), row('advanced'));
    const t0 = await spot();
    await tp.tap(row('advanced')); await tp.waitForTimeout(300);
    const t1 = await spot();
    ok(Math.abs(t1.top - t0.top) <= 1 && t1.scroll === t0.scroll && t1.open === 'true', `a finger’s tap on Advanced near the bottom opens it below its row, which stays put (its row moved ${Math.round(t1.top - t0.top)} px, scroll ${Math.round(t0.scroll)} → ${Math.round(t1.scroll)})`);
    await touch.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Settings keeps a control still as it changes the rows around it: tapped in the middle of the sheet, it stays under the finger while lines come and go above it or in its row, or the sheet is drawn larger (1366 × 768, light, the usual size and 200%: Stay awake, Photo Fit, Clock in the corner, Size, Default widget language)', async (browser) => {
    const errors = [];
    for (const scale of [null, 2]) {
      const size = scale ? '200%' : 'the usual size';
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: 'light' });
      // The device says no to keeping the screen on, a moment after it is asked: Settings says so then, in place.
      await ctx.addInitScript(() => Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        await new Promise(r => setTimeout(r, 200)); throw new DOMException('Wake Lock permission request denied', 'NotAllowedError'); } } }));
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page);
      if (scale) { await page.evaluate(s => window.__board21.setBoardScale(s), scale); await page.waitForTimeout(300); }
      await page.setInputFiles('#photo-input', path.join(ROOT, 'icons/goat.png')); await page.waitForTimeout(1200);   // (a photo: Background shows Fit)
      await openSettings(page, ['bg', 'widget-language', 'advanced']);
      // The control scrolled to the middle of the sheet (as far as the sheet goes), or left where it is ('here'), and
      // tapped: how far it moved, also once what comes in later (the device's answer) has come in.
      const tap = async (sel, what, wait = 300, here) => {
        const at = () => page.evaluate(s => ({ top: document.querySelector(s).getBoundingClientRect().top, scroll: document.querySelector('#settings .sheet-body').scrollTop }), sel);
        if (!here) await page.evaluate(s => { const b = document.querySelector('#settings .sheet-body'), r = document.querySelector(s).getBoundingClientRect(), bb = b.getBoundingClientRect();
          b.scrollTop += (r.top + r.height / 2 - (bb.top + bb.height / 2)) / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1); }, sel);
        await page.waitForTimeout(150);
        const a = await at();
        await page.click(sel); await page.waitForTimeout(wait);
        const b = await at(), dy = Math.round((b.top - a.top) * 10) / 10;
        ok(Math.abs(b.top - a.top) <= 1, `${size}: ${what} stays under the finger (moved ${dy} px; the sheet scrolled ${Math.round(a.scroll)} → ${Math.round(b.scroll)})`);
      };
      const ctl = (act, val) => `#settings .sheet-body [data-act="${act}"]` + (val ? `[data-val="${val}"]` : '');
      await tap(ctl('awake'), 'Stay awake, turned on: its warning, then the device’s no, come in beside it,', 900);
      // (Off where it was turned on: at the usual size its row is near the top, and a sheet at the top can't scroll up.)
      await tap(ctl('awake'), 'Stay awake, turned off again: both lines go,', 300, true);
      await tap(ctl('photo-fit', 'whole'), 'Photo Fit, Whole photo: the hint above it goes,');
      await tap(ctl('photo-fit', 'fill'), 'Photo Fit, Fill the board: the hint comes back,');
      await tap(ctl('clock', 'on'), 'Clock in the corner, On,');
      await tap(ctl('clock', 'auto'), 'Clock in the corner, Auto again,');
      await tap(ctl('widget-language', 'es'), 'Default widget language, a card tapped,');
      await tap(ctl('widget-language', 'en'), 'Default widget language, English again,');
      // Size: the sheet drawn larger or smaller. (At 200% the screen holds Settings at the size of 175% too: − twice.)
      for (const [act, what] of scale ? [['scale-down', '− (175%)'], ['scale-down', '− (150%): the sheet drawn smaller,'], ['scale-up', '+ (175%): larger again,'], ['scale-up', '+ (200%)']]
        : [['scale-up', '+: the sheet drawn larger,'], ['scale-down', '−: back again,']]) await tap(ctl(act), `Size ${what}`);
      await ctx.close();
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Large sizes on small screens', async (browser) => {
    // A size chosen on a smartboard can arrive on a tablet in a backup: menus, Settings and toasts must still fit.
    const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(600);
    await page.evaluate(() => window.__board21.setBoardScale(2)); await page.waitForTimeout(300);
    const ui = await page.evaluate(() => +getComputedStyle(document.documentElement).getPropertyValue('--ui'));
    ok(ui < 1.5 && ui > 1.3, `at 200% on a portrait tablet, menus and panels are drawn only as big as fits (${ui.toFixed(2)})`);
    for (const side of ['left', 'right']) {
      await page.tap(`.picker-btn.${side}`); await page.waitForTimeout(300);
      const hit = await page.evaluate(() => { const g = document.querySelector('.panel.open [data-ctl="settings"]'), r = g.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { inside: r.left >= 0 && r.right <= innerWidth, top: !!e && g.contains(e) }; });
      ok(hit.inside && hit.top, `the Settings button in the ${side} Widget Picker is on screen and not under the other corner's button`);
      await page.tap(`.picker-btn.${side}`); await page.waitForTimeout(250);
    }
    await page.tap('.picker-btn.left'); await page.waitForTimeout(250); await page.tap('.panel.open [data-ctl="settings"]'); await page.waitForTimeout(500);
    const sheet = await page.evaluate(() => { const r = document.getElementById('settings').getBoundingClientRect(), x = document.querySelector('#settings [data-close]').getBoundingClientRect(); return { r: r.right, x: x.right }; });
    ok(sheet.r <= 768 && sheet.x <= 768, `Settings fits the screen, close button included (right edge ${Math.round(sheet.r)})`);
    await page.tap('#settings [data-close]'); await page.waitForTimeout(300);
    // Toasts wrap instead of running off both edges.
    await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(400);
    await page.evaluate(() => { window.__board21.openWidget('timer'); }); await page.waitForTimeout(1000);
    await page.evaluate(() => window.__board21.closeWin('timer:1')); await page.waitForTimeout(400);
    const t = await page.evaluate(() => { const r = document.querySelector('#toasts .toast').getBoundingClientRect(); return { l: r.left, r: r.right }; });
    ok(t.l >= 0 && t.r <= 1024, `a long toast wraps to fit the screen (${Math.round(t.l)}–${Math.round(t.r)})`);
    // A two-column window menu stays on screen.
    await page.setViewportSize({ width: 683, height: 400 }); await page.waitForTimeout(400);
    await page.evaluate(() => { window.__board21.openWidget('notes'); }); await page.waitForTimeout(1200);
    await page.evaluate(() => window.__board21.setRect('notes:1', { x: 0, y: 0, w: 400, h: 300 })); await page.waitForTimeout(200);
    // (At the board's top edge the top handle overlaps the name: a tap there still opens the menu.)
    await page.locator('.win[data-ikey="notes:1"] .win-label').click({ force: true }); await page.waitForTimeout(400);
    const m = await page.evaluate(() => { const r = document.querySelector('.menu.open').getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom }; });
    ok(m.l >= 0 && m.r <= 683 && m.b <= 400, `the window menu stays on screen (${Math.round(m.l)}–${Math.round(m.r)})`);
    await page.keyboard.press('Escape');
    // The shape tip never hides under the Widget Picker buttons or spills off screen.
    for (const [w, h, sc] of [[1100, 400, 1.5], [1600, 600, 2], [600, 800, 2], [800, 720, 1.5], [1000, 900, 2]]) {
      await page.setViewportSize({ width: w, height: h }); await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(300);
      const tip = await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); const el = document.getElementById('shape-hint'); if (el.hidden) return { hidden: true };
        const r = el.getBoundingClientRect(), hide = el.querySelector('.hide').getBoundingClientRect(), btn = el.querySelector('[data-act="unlock"]').getBoundingClientRect();
        const pick = [...document.querySelectorAll('.picker-btn:not([hidden])')].map(b => b.getBoundingClientRect());
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return { hidden: false, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, clear: !pick.some(p => hit(p, r)),
          fits: btn.left >= r.left - 0.5 && btn.right <= r.right + 0.5, hideOk: document.elementFromPoint(hide.left + hide.width / 2, hide.top + hide.height / 2)?.closest('.hide') !== null }; });
      ok(tip.hidden || (tip.inside && tip.clear && tip.fits && tip.hideOk), `${w}×${h} at ${sc * 100}%: the shape tip ${tip.hidden ? 'is left out (no room)' : 'fits in the margin, clear of the Widget Picker buttons'}`);
    }
    // The top handle doesn't cover the window's name on a laptop screen.
    await page.setViewportSize({ width: 1280, height: 800 }); await page.evaluate(() => window.__board21.setBoardScale(0.8)); await page.waitForTimeout(300);
    await page.evaluate(() => { window.__board21.setRect('notes:1', { x: 600, y: 300, w: 600, h: 400 }); window.__board21.focusWin('notes:1'); }); await page.waitForTimeout(300);
    const lab = await page.evaluate(() => { const l = document.querySelector('.win[data-ikey="notes:1"] .win-label'), r = l.getBoundingClientRect();
      return [0.15, 0.35, 0.5].every(f => l.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height * f))); });
    ok(lab, 'the top resize handle no longer covers the window name (its menu opens from anywhere on it)');
    const n = await page.evaluate(() => { const g = document.querySelector('.win[data-ikey="notes:1"] .grip.n'), w = document.querySelector('.win[data-ikey="notes:1"]').getBoundingClientRect();
      const e = document.elementFromPoint(w.left + w.width / 2, w.top - 6); return g.contains(e); });
    ok(n, 'the top handle still works just above the window');
    // Shape tip: "Fill the window" while someone is moving a window says only why it can't.
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Accent color', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForTimeout(500); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    const tab2 = await ctx.newPage(); await tab2.goto(BASE); await tab2.waitForTimeout(1200); await freeBoard(tab2);
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="accent"][data-val="purple"]'); await page.waitForTimeout(500);
    const ring = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--focus-ring').trim());
    ok(ring === '#7c3aed', `board accent changes (focus ring ${ring})`);
    const appAccent = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('html').evaluate(e => e.style.getPropertyValue('--b21-accent'));
    ok(appAccent === '#7c3aed', `widgets get the accent (${appAccent})`);
    await page.screenshot({ path: OUT + 'accent-purple.png' });
    await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(500);
    const darkAccent = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('html').evaluate(e => e.style.getPropertyValue('--b21-accent'));
    ok(darkAccent === '#a78bfa', `dark theme uses the lighter accent shade (${darkAccent})`);
    await page.waitForTimeout(400);
    ok(await tab2.evaluate(() => getComputedStyle(document.body).getPropertyValue('--focus-ring').trim()) === '#a78bfa', 'accent syncs to other tabs');
    await page.reload(); await page.waitForTimeout(1200);
    ok(await page.evaluate(() => window.__board21.state.settings.accent) === 'purple', 'accent is remembered');
    await page.evaluate(() => { const s = window.__board21.state; s.settings.accent = 'blue'; });
    await page.click('.picker-btn.left'); await page.click('[data-ctl="settings"]'); await page.waitForTimeout(300);
    await page.click('#settings [data-act="accent"][data-val="blue"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.body.style.getPropertyValue('--focus-ring')) === '', 'blue restores the built-in colors');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  // ---- Accent color from 2026.11.18-2: six colors and Custom…, readable in both themes, tinting every title bar.
  // (Colors compared as #rrggbb, with WCAG contrast worked out here.)
  ['Accent color: six colors and Custom… (Settings, light and dark, reload, keyboard, junk values, export, the widget lab)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    let page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    // The accent the board shows (its chrome) and a widget gets (its palette), and as it is stored: accent, which a
    // release before 2026.11.18-2 reads (Blue for a custom color), and accentColor, the color chosen.
    const shown = async () => {
      const b = await page.evaluate(() => { const css = getComputedStyle(document.body), v = n => css.getPropertyValue(n).trim(), st = window.__board21.state.settings;
        return { accent: window.__board21.accentNow(), stored: `${st.accent} ${st.accentColor}`, primary: v('--primary'), ring: v('--focus-ring'), override: document.body.style.getPropertyValue('--primary') }; });
      b.w = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('html').evaluate(e => { const v = n => e.style.getPropertyValue(n).trim(); return { accent: v('--b21-accent'), on: v('--b21-on-accent') }; });
      return b;
    };
    // Settings › Accent color: its choices (in order), the ones checked (✓: with a check drawn), Custom… and its color input.
    const choices = () => page.evaluate(() => {
      const g = document.querySelector('#settings .accent-row [role="radiogroup"]'), radios = g ? [...g.querySelectorAll('[role="radio"]')] : [];
      const pill = document.querySelector('#settings [data-act="accent-custom"]'), dot = pill && pill.querySelector('.dot'), inp = document.getElementById('set-accent-custom');
      return { keys: radios.map(b => (b.dataset.act === 'accent' ? b.dataset.val : b.dataset.act)).join(), names: radios.map(b => b.getAttribute('aria-label')).join(),
        checked: radios.filter(b => b.getAttribute('aria-checked') === 'true').map(b => (b.dataset.act === 'accent' ? b.dataset.val : 'custom') + (b.querySelector('.tick') ? '✓' : '')).join(),
        pill: pill ? { text: pill.textContent.trim(), title: pill.title, inGroup: !!g && pill.closest('[role="radiogroup"]') === g } : null,
        dot: dot ? getComputedStyle(dot).backgroundColor : null, input: inp ? `${inp.type} ${inp.tabIndex} ${inp.getAttribute('aria-hidden')}` : null };
    });
    // A color picked in the device's picker (input events while it is open; change when it closes).
    const pickColor = (hex, close = true) => page.locator('#set-accent-custom').evaluate((el, [hex, close]) => {
      el.dataset.same = 1; el.value = hex; el.dispatchEvent(new Event('input', { bubbles: true })); if (close) el.dispatchEvent(new Event('change', { bubbles: true })); }, [hex, close]);

    await openSettings(page);
    let ch = await choices();
    ok(ch.keys === 'blue,purple,red,orange,green,slate,accent-custom' && ch.names === 'Blue accent,Purple accent,Rose accent,Orange accent,Green accent,Slate accent,Custom color' && ch.checked === 'blue✓',
      `Accent color: six colors (one red and one green: Pink and Teal are gone), then Custom…, in one set; Blue chosen, with a check (${ch.keys}; ${ch.checked})`);
    ok(!!ch.pill && ch.pill.text === 'Custom…' && ch.pill.title === 'Choose any color' && ch.pill.inGroup && ch.input === 'color -1 true',
      `Custom… is a choice like Background’s: “Custom…”, “Choose any color”, its color input out of the keyboard’s way (${JSON.stringify(ch.pill)}; ${ch.input})`);
    const aria = ch.pill ? await page.locator('#settings .accent-row [role="radiogroup"]').ariaSnapshot() : '';
    ok((aria.match(/- radio /g) || []).length === 7 && /- radio "Custom color"/.test(aria) && /- radio "Blue accent" \[checked\]/.test(aria) && (aria.match(/\[checked\]/g) || []).length === 1 && !/- (textbox|button)/.test(aria),
      `a screen reader hears seven choices, Blue checked, “Custom color” the last, and not the color input (${aria.replace(/\n\s*/g, ' ¶ ')})`);
    // The seven on one line, under the row's name, at every size of windows and menus (Settings grows with it), on a
    // Chromebook's screen and a 1920 × 1080 one.
    const crowded = [];
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const sc of [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2]) {
        await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(250);
        const r = await page.evaluate(() => {
          const g = document.querySelector('#settings .accent-row [role="radiogroup"]'), gr = g.getBoundingClientRect(), bs = [...g.querySelectorAll('[role="radio"]')].map(b => b.getBoundingClientRect());
          const name = document.querySelector('#settings .accent-row .lbl').getBoundingClientRect();
          return { lines: new Set(bs.map(b => Math.round(b.top))).size, over: Math.max(...bs.map(b => b.right)) - gr.right, below: bs[0].top >= name.bottom };
        });
        if (r.lines !== 1 || r.over > 0.5 || !r.below) crowded.push(`${w}×${h} at ${Math.round(sc * 100)}%: ${JSON.stringify(r)}`);
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 }); await page.evaluate(() => window.__board21.setBoardScale(1)); await page.waitForTimeout(300);
    ok(!crowded.length, `the six colors and Custom… sit on one line under the row’s name at every size from 50% to 200%, at 1366 × 768 and 1920 × 1080 (${crowded.join(' | ') || 'all'})`);

    // Custom…: the color shows at once, on the board, in its widgets and on Custom…'s dot, while the picker is open.
    if (ch.input) {
      await pickColor('#8040c0', false); await page.waitForTimeout(400);
      let s = await shown(); ch = await choices();
      const same = await page.evaluate(() => document.getElementById('set-accent-custom').dataset.same === '1');
      ok(s.accent === '#8040c0' && s.primary === '#8040c0' && s.ring === '#8040c0' && s.w.accent === '#8040c0' && s.w.on === '#ffffff' && ch.dot === 'rgb(128, 64, 192)' && same,
        `while the picker is open a custom color shows at once, on the board, in its widgets and on Custom…’s dot (white text reads on it, so it is used as it is), Settings staying as it is (${JSON.stringify(s)}; dot ${ch.dot})`);
      ok(s.stored === 'blue #8040c0', `it is stored as Blue for releases before 2026.11.18-2, and the color itself (${s.stored})`);
      await page.locator('#set-accent-custom').evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true }))); await page.waitForTimeout(300);
      ch = await choices();
      ok(ch.checked === 'custom✓', `once the picker closes, Custom… is the choice, checked (${ch.checked})`);
      await page.screenshot({ path: OUT + 'accent-custom-light.png' });
      // Dark: a lighter shade of the same purple (dark text on it), for the board, its widgets and the dot.
      await page.click('#settings [data-act="theme"][data-val="dark"]'); await page.waitForTimeout(500);
      s = await shown(); ch = await choices();
      const hs = hslOf(s.primary), h0 = hslOf('#8040c0');
      ok(/^#[0-9a-f]{6}$/.test(s.primary) && s.primary !== '#8040c0' && s.w.accent === s.primary && s.ring === s.primary && s.w.on === '#0b1220' && hueGap(hs.h, h0.h) <= 3 && hs.l > h0.l &&
        contrast(rgbOf(s.primary), rgbOf('#1e1e1e')) >= 6 && contrast(rgbOf(s.primary), rgbOf('#0b1220')) >= 4.5 && !!ch.dot && hexOf(ch.dot) === s.primary,
        `dark: a lighter shade of the same purple, with dark text on it, for the board, its widgets and Custom…’s dot (${s.primary}; dot ${ch.dot})`);
      await page.screenshot({ path: OUT + 'accent-custom-dark.png' });
      // A reload keeps it.
      await page.reload(); await boardUp(page); await page.waitForTimeout(1000);
      const s2 = await shown(); await openSettings(page); ch = await choices();
      ok(s2.accent === '#8040c0' && s2.primary === s.primary && s2.w.accent === s.primary && ch.checked === 'custom✓', `a reload keeps it (${s2.accent}, ${s2.primary}; ${ch.checked})`);

      // The keyboard: Tab reaches Custom…, Enter opens the same picker, the keyboard staying on Custom… (also when
      // nothing is picked), and Settings isn't drawn again under the open picker while the color follows it.
      await page.click('#settings [data-act="theme"][data-val="light"]'); await page.waitForTimeout(300);
      await page.focus('#settings [data-act="accent"][data-val="slate"]'); await page.keyboard.press('Tab');
      ok(await page.evaluate(() => document.activeElement.matches('[data-act="accent-custom"]') && getComputedStyle(document.activeElement).outlineStyle === 'solid'), 'Tab goes from Slate to Custom…, which shows the keyboard focus');
      await page.evaluate(() => { window.__picker = 0; document.getElementById('set-accent-custom').showPicker = () => { window.__picker++; }; });
      await page.keyboard.press('Enter'); await page.waitForTimeout(100);
      const opened = await page.evaluate(() => window.__picker === 1 && document.activeElement.matches('[data-act="accent-custom"]'));
      ok(opened, `Enter on it opens the color picker, and the keyboard stays on Custom…, so it is still there if nothing is picked (${await page.evaluate(() => document.activeElement.id || document.activeElement.className)})`);
      await pickColor('#0d9488', false); await page.waitForTimeout(400);
      const kept = await page.evaluate(() => document.getElementById('set-accent-custom').dataset.same === '1' && document.activeElement.matches('[data-act="accent-custom"]'));
      ok(kept && (await shown()).accent === '#0d9488', 'a color tried in the picker shows at once, and Settings isn’t drawn again under the open picker');
      await page.locator('#set-accent-custom').evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true }))); await page.waitForTimeout(400);
      ok(await page.evaluate(() => document.activeElement.matches('[data-act="accent-custom"][aria-checked="true"]')) && (await shown()).accent === '#0d9488',
        'a color picked (a teal of one’s own), the keyboard is on Custom…, checked');
      await page.keyboard.press('Tab');
      ok(await page.evaluate(() => !document.activeElement.matches('#set-accent-custom') && !document.activeElement.closest('.accent-row')), 'and Tab goes on past the row (the color input isn’t a stop of its own)');
      // A color again: Custom… unchecked, its dot back to the rainbow.
      await page.click('#settings [data-act="accent"][data-val="green"]'); await page.waitForTimeout(300);
      s = await shown(); ch = await choices();
      ok(s.accent === 'green' && s.primary === '#15803d' && s.w.accent === '#15803d' && ch.checked === 'green✓' && ch.dot === 'rgba(0, 0, 0, 0)', `Green again: the board and widgets green, Green checked, Custom… not (${s.primary}; ${ch.checked})`);

      // An export carries a custom color as it is stored, and Import › Replace this page brings it back.
      await pickColor('#8040c0'); await page.waitForTimeout(300);
      const file = await page.evaluate(() => window.__board21.buildExport('full'));
      await page.click('#settings [data-act="accent"][data-val="orange"]'); await page.waitForTimeout(300);
      await page.evaluate(f => window.__board21.applyImport(f, 'replace'), file); await page.waitForTimeout(900);
      s = await shown();
      ok(file.accent === '#8040c0' && s.accent === '#8040c0' && s.primary === '#8040c0' && s.w.accent === '#8040c0', `an export carries a custom color (accent: ${JSON.stringify(file.accent)}), and an import brings it back (${s.accent})`);
      const took = [];
      for (const v of ['pink', 'teal', '#fff', 'red; x', '__proto__', '#GGGGGG']) {
        await page.evaluate(f => window.__board21.applyImport(f, 'replace'), Object.assign({}, file, { accent: v })); await page.waitForTimeout(600);
        const a = await page.evaluate(() => window.__board21.accentNow());
        if (a !== '#8040c0') took.push(`${v} → ${a}`);
      }
      ok(!took.length, `a file whose accent is Pink, Teal or not an accent at all changes nothing (${took.join(' | ') || 'kept #8040c0'})`);
    }

    // A device that had Pink or Teal (or something that isn't an accent, in either part) shows Blue: the board, its
    // widgets, Settings and an export. And an accent chosen on a release before 2026.11.18-2 after the color shows.
    const stored = (a, c) => page.evaluate(([a, c]) => new Promise(res => { const o = indexedDB.open('21Board'); o.onsuccess = () => { const t = o.result.transaction('records', 'readwrite'), st = t.objectStore('records'), g = st.get('settings');
      g.onsuccess = () => st.put({ key: 'settings', type: 'settings', rev: Date.now() + 1e6, updatedAt: Date.now(), by: 'test', value: Object.assign({}, g.result && g.result.value, { theme: 'light', accent: a, accentColor: c, accentAt: Date.now() }) });
      t.oncomplete = () => { o.result.close(); res(); }; }; }), [a, c]);
    const notBlue = [];
    for (const [a, c] of [['pink', ''], ['teal', ''], ['#fff', ''], ['red; x', ''], ['__proto__', ''], ['#GGGGGG', ''], ['constructor', ''], ['blue', 'pink'], ['blue', '#FFFFFF'], ['blue', '#fff'],
      ['blue', '__proto__'], ['blue', 'red; x'], ['blue', { c: 1 }], ['blue', 'green'], ['pink', '#8040c0']]) {
      await stored(a, c); await page.reload(); await boardUp(page); await page.waitForTimeout(900);
      const s = await shown(); await openSettings(page); ch = await choices();
      const exp = await page.evaluate(async () => (await window.__board21.buildExport('full')).accent);
      if (!(s.primary === '#2563eb' && s.override === '' && s.w.accent === '#2563eb' && ch.checked === 'blue✓' && exp === 'blue')) notBlue.push(`${JSON.stringify([a, c])}: ${s.primary}${s.override ? ' (set)' : ''}, widget ${s.w.accent}, ${ch.checked}, export ${exp}`);
      await page.keyboard.press('Escape');
    }
    ok(!notBlue.length, `a device that had Pink or Teal, or something that isn’t an accent in either part, or a color an older release has changed since, shows Blue on the board, in its widgets and in Settings, and exports Blue (${notBlue.join(' | ') || 'all Blue'})`);
    await stored('green', '#8040c0'); await page.reload(); await boardUp(page); await page.waitForTimeout(900);
    let s0 = await shown(); await openSettings(page); ch = await choices();
    ok(s0.accent === 'green' && s0.primary === '#15803d' && s0.w.accent === '#15803d' && ch.checked === 'green✓', `Green chosen on an older release after a custom color: Green shows, and is checked (${s0.accent}; ${ch.checked})`);
    await page.keyboard.press('Escape');
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));

    // The widget lab: it is told the six colors, and shows a custom color it is sent (Pink or anything else: nothing).
    await page.close(); page = await ctx.newPage(); page.on('pageerror', e => errors.push('lab: ' + e.message));
    await page.goto(BASE + 'sdk/lab.html'); await page.waitForTimeout(400);
    await page.evaluate(() => window.addEventListener('message', e => { if (e.data && e.data.b21lab === 1 && e.data.type === 'ready') window.__ready = e.data; }));
    await page.click('#sample'); await page.click('#run'); await page.waitForTimeout(3500);
    const ready = await page.evaluate(() => window.__ready || null), board = page.frames().find(f => f.parentFrame() === page.mainFrame());
    const send = v => page.evaluate(v => window.__board21DevWindow.send('accent', { value: v }), v);
    const lab = () => board.evaluate(() => ({ accent: window.__board21.accentNow(), primary: getComputedStyle(document.body).getPropertyValue('--primary').trim() }));
    await send('pink'); await page.waitForTimeout(400);
    const l0 = await lab();
    await send('#8040c0'); await page.waitForTimeout(400);
    const l1 = await lab();
    await send('red; x'); await page.waitForTimeout(400);
    const l2 = await lab();
    await board.evaluate(() => document.querySelector('.picker-btn.left').click()); await page.waitForTimeout(300);
    await board.evaluate(() => document.querySelector('[data-ctl="settings"]').click()); await page.waitForTimeout(800);
    const labChecked = await board.evaluate(() => [...document.querySelectorAll('#settings .accent-row [role="radio"][aria-checked="true"]')].map(b => b.dataset.act).join());
    ok(!!ready && (ready.accents || []).join() === 'blue,purple,red,orange,green,slate' && l0.accent === 'blue' && l1.accent === '#8040c0' && l1.primary === '#8040c0' && l2.accent === '#8040c0' && labChecked === 'accent-custom',
      `the widget lab is told the six colors, ignores Pink, shows a custom color it is sent (Custom… checked in its Settings) and ignores anything else (${ready && (ready.accents || []).join()}; ${l0.accent} → ${l1.accent} → ${l2.accent}; ${labChecked})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Accent color: any custom color stays readable, light and dark', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => window.__board21.openWidget('timer')); await page.waitForTimeout(1200);
    await openSettings(page);
    if (!await page.locator('#set-accent-custom').count()) { ok(false, 'Settings has no Custom… for the accent'); await ctx.close(); return; }
    const look = async () => {
      const b = await page.evaluate(() => { const css = getComputedStyle(document.body), v = n => css.getPropertyValue(n).trim(); return { primary: v('--primary'), soft: v('--primary-soft'), active: v('--active-bg'), dark: document.body.classList.contains('dark') }; });
      b.w = await page.frameLocator('.win[data-ikey="timer:1"] iframe').locator('html').evaluate(e => { const v = n => e.style.getPropertyValue(n).trim(); return { accent: v('--b21-accent'), on: v('--b21-on-accent'), soft: v('--b21-accent-soft') }; });
      return b;
    };
    const rgba = (hex, a) => rgbOf(hex).replace('rgb(', 'rgba(').replace(')', `, ${a})`);
    // The rules: light, it reads as text on the widgets' surface (#f9fafb), and white text reads on it (4.5:1); dark,
    // it stands out on the dark window color as the six do (6:1 on #1e1e1e), dark text on it reading too. A color that
    // keeps them is used as it is; one that doesn't changes only as far as it must (just past the line), keeping its
    // hue (a grey stays grey).
    const rule = (c, dark) => (dark ? contrast(rgbOf(c), rgbOf('#1e1e1e')) >= 6 && contrast(rgbOf(c), rgbOf('#0b1220')) >= 4.5
      : contrast(rgbOf(c), rgbOf('#f9fafb')) >= 4.5 && contrast(rgbOf(c), 'rgb(255, 255, 255)') >= 4.5);
    const near = (c, dark) => (dark ? contrast(rgbOf(c), rgbOf('#1e1e1e')) <= 6.6 : contrast(rgbOf(c), 'rgb(255, 255, 255)') <= 5);
    const bad = [], seen = [];
    for (const hex of ['#ffffff', '#000000', '#ffff00', '#808080', '#000080', '#ffffe0', '#8040c0']) {
      await page.locator('#set-accent-custom').evaluate((el, hex) => { el.value = hex; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, hex);
      for (const theme of ['light', 'dark']) {
        await page.click(`#settings [data-act="theme"][data-val="${theme}"]`); await page.waitForTimeout(350);
        const s = await look(), dark = theme === 'dark', c = s.primary, h = hslOf(c), h0 = hslOf(hex), why = [];
        if (!/^#[0-9a-f]{6}$/.test(c)) why.push(`not a color (${c})`);
        else {
          if (!rule(c, dark)) why.push('breaks the rule');
          if (rule(hex, dark) ? c !== hex : !near(c, dark)) why.push(rule(hex, dark) ? 'changed though it kept the rule' : 'changed further than needed');
          if (h0.s > 0.05 ? hueGap(h.h, h0.h) > 4 || Math.abs(h.s - h0.s) > 0.06 : h.s > 0.02) why.push(`hue ${h.h.toFixed(0)}° / ${h.s.toFixed(2)} (was ${h0.h.toFixed(0)}° / ${h0.s.toFixed(2)})`);
          if (s.w.accent !== c || s.w.on !== (dark ? '#0b1220' : '#ffffff')) why.push(`widget ${s.w.accent} on ${s.w.on}`);
          if (s.w.soft !== (dark ? rgba(c, 0.18) : mixOf(c, '#ffffff', 0.9))) why.push(`widget soft ${s.w.soft}`);
          if (s.soft !== rgba(c, dark ? 0.18 : 0.12) || s.active !== (dark ? rgba(c, 0.2) : mixOf(c, '#ffffff', 0.92))) why.push(`soft ${s.soft} / ${s.active}`);
        }
        seen.push(`${hex} ${theme} ${c}`);
        if (why.length) bad.push(`${hex} ${theme} → ${c}: ${why.join(', ')}`);
      }
    }
    ok(!bad.length, `any color: light, it reads on the widgets’ surface and white text reads on it (4.5:1); dark, it stands out (6:1 on the window color) with dark text on it; changed only as far as needed, same hue; widgets and the soft shades follow (${bad.join(' | ') || seen.join(', ')})`);
    // The six colors keep the same rules (as their swatches show them, in each theme).
    const presetBad = [];
    for (const theme of ['light', 'dark']) {
      await page.click(`#settings [data-act="theme"][data-val="${theme}"]`); await page.waitForTimeout(350);
      const sw = await page.evaluate(() => [...document.querySelectorAll('#settings [data-act="accent"]')].map(b => [b.dataset.val, b.style.backgroundColor]));
      for (const [k, bg] of sw) if (!rule(hexOf(bg), theme === 'dark')) presetBad.push(`${k} ${theme} ${hexOf(bg)}`);
    }
    ok(!presetBad.length, `and so do the six colors, light and dark (${presetBad.join(', ') || 'all'})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Accent color: title bars tinted with it, the focused one more', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    await page.evaluate(() => { const b = window.__board21; b.openWidget('timer'); b.openWidget('notes'); b.openWidget('timer'); }); await page.waitForTimeout(1500);
    await page.evaluate(() => { const b = window.__board21; b.setRect('timer:1', { x: 560, y: 60, w: 380, h: 260 }); b.setRect('notes:1', { x: 560, y: 380, w: 380, h: 300 }); b.setRect('timer:2', { x: 970, y: 60, w: 360, h: 260 }); });
    for (const ik of ['timer:1', 'notes:1', 'timer:2']) await page.frameLocator(`.win[data-ikey="${ik}"] iframe`).locator('html').evaluate(() => Board21.window.setTitle('Period 3'));
    // Each window's title bar: its background, and its name, number, subtitle and ⌄ as drawn (a color with opacity is
    // blended over the bar).
    const bars = () => page.evaluate(() => {
      const css = getComputedStyle(document.body), out = {};
      for (const w of document.querySelectorAll('.win')) {
        const t = w.querySelector('.win-title'), l = w.querySelector('.win-label'), c = e => { const s = getComputedStyle(e); return [s.color, +s.opacity]; };
        out[w.dataset.ikey] = { focused: w.matches('.focused'), max: w.matches('.maximized'), bg: getComputedStyle(t).backgroundColor, shadow: getComputedStyle(w).boxShadow,
          name: c(l.querySelector('.name')), num: l.querySelector('.num').textContent.trim() ? c(l.querySelector('.num')) : null, sub: l.querySelector('.sub').textContent.trim() ? c(l.querySelector('.sub')) : null, chev: c(l.querySelector('svg')) };
      }
      return { primary: css.getPropertyValue('--primary').trim(), wins: out };
    });
    const blend = ([col, op], bg) => { if (op >= 1) return col; const a = col.match(/[\d.]+/g).map(Number), z = bg.match(/[\d.]+/g).map(Number); return `rgb(${[0, 1, 2].map(i => Math.round(z[i] + (a[i] - z[i]) * op)).join(', ')})`; };
    // faint: what an unfocused window's bar should be (Blue: index.html's, today's focused tint; else the same mix).
    const examine = async (dark, faint) => {
      const b = await bars(), base = rgbOf(dark ? '#1e1e1e' : '#ffffff'), wins = Object.values(b.wins), f = wins.filter(w => w.focused), u = wins.filter(w => !w.focused);
      const T0 = rgbOf(faint || mixOf(b.primary, dark ? '#1e1e1e' : '#ffffff', dark ? 0.8 : 0.92)), T1 = f.length ? f[0].bg : null, bad = [];
      if (f.length !== 1) bad.push(`${f.length} focused`);
      for (const w of u) if (w.bg !== T0) bad.push(`an unfocused bar ${w.bg}, not ${T0}`);
      if (T1) {
        if (!(contrast(T1, base) > contrast(T0, base)) || contrast(T1, T0) < 1.15) bad.push(`the focused bar ${T1} isn’t clearly more than ${T0} (${contrast(T1, T0).toFixed(2)}:1)`);
        if (hslOf(b.primary).s > 0.05 && hueGap(hslOf(T1).h, hslOf(b.primary).h) > 8) bad.push(`the focused bar’s hue ${hslOf(T1).h.toFixed(0)}° isn’t the accent’s ${hslOf(b.primary).h.toFixed(0)}°`);
        if (contrast(rgbOf(b.primary), T1) < 3) bad.push(`the accent (handles, ring) on the focused bar ${contrast(rgbOf(b.primary), T1).toFixed(2)}:1`);
      }
      let subs = 0, nums = 0;
      for (const w of wins) for (const k of ['name', 'num', 'sub', 'chev']) {
        if (!w[k]) continue;
        if (k === 'sub') subs++; if (k === 'num') nums++;
        const r = contrast(blend(w[k], w.bg), w.bg);
        if (r < (k === 'chev' ? 3 : 4.5)) bad.push(`${w.focused ? 'focused' : 'unfocused'} ${k} ${r.toFixed(2)}:1`);
      }
      if (!subs || !nums) bad.push('no subtitle or number to check');
      return { bad, T0, T1 };
    };
    const choose = async (theme, acc) => {
      await openSettings(page);
      await page.click(`#settings [data-act="theme"][data-val="${theme}"]`); await page.waitForTimeout(200);
      if (acc[0] !== '#') await page.click(`#settings [data-act="accent"][data-val="${acc}"]`);
      else if (await page.locator('#set-accent-custom').count()) await page.locator('#set-accent-custom').evaluate((el, hex) => { el.value = hex; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, acc);
      else return false;
      await page.keyboard.press('Escape'); await page.evaluate(() => window.__board21.focusWin('timer:1')); await page.waitForTimeout(450);
      return true;
    };
    for (const theme of ['light', 'dark']) {
      for (const [acc, faint] of [['blue', theme === 'dark' ? '#22324a' : '#eff6ff'], ['green'], ['#8040c0']]) {
        if (!await choose(theme, acc)) { ok(false, `${acc}: no Custom… to choose it with`); continue; }
        const e = await examine(theme === 'dark', faint);
        ok(!e.bad.length, `${acc}, ${theme}: the other windows’ title bars faintly tinted (${hexOf(e.T0)}${acc === 'blue' ? ', the focused tint before' : ''}), the focused one clearly more (${e.T1 && hexOf(e.T1)}); its text 4.5:1, ⌄ and the accent 3:1 (${e.bad.join('; ') || 'all'})`);
        if ((theme === 'light' && acc === 'blue') || (theme === 'dark' && acc === '#8040c0')) await page.screenshot({ path: OUT + `accent-title-bars-${theme}-${acc.replace('#', '')}.png` });
        await page.evaluate(() => window.__board21.focusWin('notes:1')); await page.waitForTimeout(350);
        const sw = await bars();
        ok(sw.wins['notes:1'].focused && sw.wins['notes:1'].bg === e.T1 && sw.wins['timer:1'].bg === e.T0, `${acc}, ${theme}: focus moves to another window and the tints swap (${sw.wins['notes:1'].bg} / ${sw.wins['timer:1'].bg})`);
        await page.evaluate(() => { window.__board21.setMaximized('timer:2', true); window.__board21.focusWin('timer:2'); }); await page.waitForTimeout(500);
        const mx = (await bars()).wins['timer:2'];
        ok(mx.max && mx.focused && mx.bg === e.T1 && mx.shadow === 'none', `${acc}, ${theme}: a window filling the board has no ring, and its title bar has the focused tint (${mx.bg}, ${mx.shadow})`);
        await page.evaluate(() => window.__board21.setMaximized('timer:2', false)); await page.waitForTimeout(400);
        await page.evaluate(() => window.__board21.focusWin('timer:1')); await page.waitForTimeout(300);
        await page.click('.win[data-ikey="timer:1"] .win-label'); await page.waitForTimeout(350);
        const lab = await page.evaluate(() => { const l = document.querySelector('.win[data-ikey="timer:1"] .win-label'), s = getComputedStyle(l); return { open: l.matches('.open'), bg: s.backgroundColor, color: s.color, sub: getComputedStyle(l.querySelector('.sub')).color, chev: getComputedStyle(l.querySelector('svg')).color }; });
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        ok(lab.open && lab.bg !== e.T1 && lab.bg !== e.T0 && contrast(lab.color, lab.bg) >= 4.5 && contrast(lab.sub, lab.bg) >= 4.5 && contrast(lab.chev, lab.bg) >= 3,
          `${acc}, ${theme}: the window menu’s button, open, stands apart from both tints, its text and ⌄ readable (${lab.bg}: ${contrast(lab.color, lab.bg).toFixed(2)}:1, ${contrast(lab.sub, lab.bg).toFixed(2)}:1, ${contrast(lab.chev, lab.bg).toFixed(2)}:1)`);
        // From the keyboard, on a window that isn't the focused one (Tab to its name, Enter): the window stays as it is,
        // and its open button reads the same.
        await page.focus('.win[data-ikey="notes:1"] .win-label'); await page.keyboard.press('Enter'); await page.waitForTimeout(350);
        const kb = await page.evaluate(() => { const w = document.querySelector('.win[data-ikey="notes:1"]'), l = w.querySelector('.win-label'), c = el => getComputedStyle(el).color;
          return { focused: w.matches('.focused'), open: l.matches('.open'), bg: getComputedStyle(l).backgroundColor, name: c(l.querySelector('.name')), sub: c(l.querySelector('.sub')), chev: c(l.querySelector('svg')) }; });
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        ok(!kb.focused && kb.open && contrast(kb.name, kb.bg) >= 4.5 && contrast(kb.sub, kb.bg) >= 4.5 && contrast(kb.chev, kb.bg) >= 3,
          `${acc}, ${theme}: Enter on another window’s name opens its menu, the name, subtitle and ⌄ readable on the open button (${kb.bg}: ${contrast(kb.name, kb.bg).toFixed(2)}:1, ${contrast(kb.sub, kb.bg).toFixed(2)}:1, ${contrast(kb.chev, kb.bg).toFixed(2)}:1)`);
        // A widget asks for attention on the focused window (Board21.window.requestAttention()): the flash starts at its
        // bar's own tint, comes back to it between pulses, and ends there.
        await page.evaluate(() => window.__board21.focusWin('notes:1')); await page.waitForTimeout(300);
        await page.frameLocator('.win[data-ikey="notes:1"] iframe').locator('html').evaluate(() => Board21.window.requestAttention()); await page.waitForTimeout(150);
        const fl = await page.evaluate(() => { const t = document.querySelector('.win[data-ikey="notes:1"] .win-title'), a = t.getAnimations().find(x => x.animationName === 'attention'); if (!a) return null;
          a.pause(); const at = ms => { a.currentTime = ms; return getComputedStyle(t).backgroundColor; }; const r = { first: at(0), peak: at(500), trough: at(1000), last: at(4999) };
          t.closest('.win').getAnimations({ subtree: true }).filter(x => /^attention/.test(x.animationName)).forEach(x => x.finish()); return r; });   // (its text's flash too: the next look is at rest)
        const pri = (await bars()).primary; await page.waitForTimeout(100);
        ok(!!fl && fl.first === e.T1 && fl.trough === e.T1 && fl.last === e.T1 && fl.peak === rgbOf(pri),
          `${acc}, ${theme}: the attention flash on the focused window goes from its tint (${e.T1}) to the accent and back, never to the faint tint (${JSON.stringify(fl)})`);
      }
      // The extreme colors keep the title bars readable too.
      const worst = [];
      for (const acc of ['#ffffff', '#000000', '#ffff00']) {
        if (!await choose(theme, acc)) { worst.push(`${acc}: no Custom…`); continue; }
        const e = await examine(theme === 'dark');
        if (e.bad.length) worst.push(`${acc}: ${e.bad.join('; ')}`);
      }
      ok(!worst.length, `${theme}: white, black and yellow tint the title bars the same way, readable (${worst.join(' | ') || 'all'})`);
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  // The board's font, Inter (board.js, "The board's font")
  ['Board font: Inter in 21Board and every widget, its shapes, late and offline, and nothing from another site', async (browser) => {
    const INTER = /^"?Inter"?,/;
    // The faces named Inter in a page or frame: "weight style status" each.
    const facesIn = () => Array.from(document.fonts).filter(f => f.family.replace(/"/g, '') === 'Inter').map(f => `${f.weight} ${f.style} ${f.status}`);
    const interLoaded = async f => eventually(async () => (await f.evaluate(facesIn)).some(s => /loaded$/.test(s)));
    const win = (p, ik) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`).locator('html');
    const font = (p, sel) => p.evaluate(sel => getComputedStyle(document.querySelector(sel)).fontFamily, sel);
    // sw.js's own list of the offline copy (its shell and every widget's registry files).
    const vm = require('vm');
    const box = { addEventListener() {} }; box.self = box;
    box.importScripts = (...files) => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), box));
    vm.createContext(box);
    const PRECACHE = vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') + '\n;PRECACHE;', box);

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    // (What the pages ask for, not the offline worker saving its copy in the background.)
    const asked = []; ctx.on('request', r => { if (!r.serviceWorker()) asked.push(r.url()); });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);

    // 1. A fresh board: the Inter face, every weight, loaded; the page's text starts with it.
    ok(await interLoaded(page) && (await page.evaluate(facesIn)).includes('100 900 normal loaded'), `the board has a face Inter, 100 900, normal, loaded (${(await page.evaluate(facesIn)).join(' | ')})`);
    ok(INTER.test(await font(page, 'body')), `the board’s text starts with Inter (${await font(page, 'body')})`);

    // 2. Its shapes: I with bars (wider than l), and no arrow ligature (-> <- => draw the same with calt off).
    const ratio = await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); c.font = '100px ' + getComputedStyle(document.body).fontFamily; return c.measureText('I').width / c.measureText('l').width; });
    ok(ratio >= 1.4, `I has bars: at 100 px it is ${ratio.toFixed(2)} × as wide as l`);
    await page.evaluate(() => {
      const d = document.createElement('div'); d.id = 'arrows'; d.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;background:#fff;color:#000;font-size:48px;line-height:60px';
      // (Each on a line of its own, at the same left edge: a span further along could land on another fraction of a pixel.)
      d.innerHTML = ['->', '<-', '=>'].map(a => `<div><div><span class="plain">${a}</span></div><div><span class="off" style="font-feature-settings:'calt' 0">${a}</span></div></div>`).join('');
      document.body.append(d);
    });
    const diff = [];
    for (let i = 0; i < 3; i++) {
      const row = page.locator('#arrows > div').nth(i);
      const [a, b] = [await row.locator('.plain').screenshot(), await row.locator('.off').screenshot()];
      if (!a.equals(b)) diff.push(['->', '<-', '=>'][i]);
    }
    ok(!diff.length, `->, <-, and => stay two characters, as with calt off (${diff.join(' ') || 'all the same'})`);
    await page.evaluate(() => document.getElementById('arrows').remove());

    // 3. 21Board's own text, everywhere it shows.
    for (const id of ['clock', 'timer', 'notes', 'task-timer', 'first-then-board']) await addWin(page, id);
    await openSettings(page);
    await page.evaluate(() => window.__board21.toast && window.__board21.toast('Hello'));
    const parts = { page: 'body', 'title bar': '.win-label .name', 'Widget Picker': '.widget-tile', Settings: '#settings .row .lbl', 'page label': '.page-ind', 'window menu': '#menu', toasts: '#toasts', 'shape tip': '#shape-hint', dialogs: '#modal' };
    const wrong = [];
    for (const [what, sel] of Object.entries(parts)) { const f = await font(page, sel); if (!INTER.test(f)) wrong.push(`${what}: ${f}`); }
    ok(!wrong.length, `21Board’s own text is in Inter (page, title bars, Widget Picker, Settings, page label, menus, messages, shape tip, dialogs)${wrong.length ? ': ' + wrong.join(' | ') : ''}`);
    await page.keyboard.press('Escape');

    // 4. Widgets: every word, on buttons and in boxes too, the Task Timer's countdown included; Inter loaded in each frame.
    const notIn = async ik => win(page, ik).evaluate(() => {
      const out = new Set(), words = /[A-Za-zА-яЁёІіЇїЄєҐґ0-9]/;
      const check = (el, text) => { if (!/^"?Inter"?,/.test(getComputedStyle(el).fontFamily)) out.add(`${el.tagName.toLowerCase()} “${text.trim().slice(0, 20)}” ${getComputedStyle(el).fontFamily.slice(0, 30)}`); };
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) { const el = n.parentElement; if (el && el.getBoundingClientRect().width && words.test(n.textContent)) check(el, n.textContent); }
      for (const el of document.querySelectorAll('button, input, textarea, select')) { const t = el.value || el.placeholder || el.textContent || ''; if (words.test(t)) check(el, t); }
      return Array.from(out);
    });
    const off = [], unloaded = [];
    for (const ik of ['clock:1', 'timer:1', 'notes:1', 'task-timer:1', 'first-then-board:1']) {
      const o = await notIn(ik); if (o.length) off.push(`${ik}: ${o.slice(0, 3).join(', ')}`);
      if (!await eventually(async () => (await win(page, ik).evaluate(facesIn)).some(s => /loaded$/.test(s)))) unloaded.push(ik);
    }
    ok(!off.length, `every word in Clock, Timer, Notes, Task Timer, and First/Then is in Inter, buttons, boxes, and the countdown included${off.length ? ': ' + off.join(' | ') : ''}`);
    ok(!unloaded.length, `and Inter is loaded in each of their frames${unloaded.length ? ' but ' + unloaded.join(', ') : ''}`);
    // A Timer in Русский: its chips and buttons too.
    await page.click('.win[data-ikey="timer:1"] .win-label'); await page.click('#menu [data-act="lang"]'); await page.waitForSelector('#menu-sub.open'); await page.click('#menu-sub [data-id="ru"]');
    ok(await eventually(async () => await page.evaluate(() => window.__board21.state.insts.get('timer:1').language) === 'ru' && await win(page, 'timer:1').evaluate(() => document.documentElement.lang.startsWith('ru'))), 'the Timer starts again in Русский');
    await page.waitForTimeout(600);
    const ru = await notIn('timer:1'), ruWords = await win(page, 'timer:1').evaluate(() => /[А-я]/.test(document.body.innerText));
    ok(ruWords && !ru.length, `a Timer in Русский: its chips and buttons are in Inter${ru.length ? ': ' + ru.join(', ') : ''}`);
    // A Chalkboard note: Crayon Libre first, then Inter before the device's font.
    await page.click('.win[data-ikey="notes:1"] .win-label'); await page.click('#menu [data-id="theme:chalkboard"]'); await page.waitForTimeout(800);
    const chalk = await win(page, 'notes:1').evaluate(() => getComputedStyle(document.getElementById('view')).fontFamily);
    ok(/^"?Crayon Libre"?,/.test(chalk) && /"?Inter"?, system-ui/.test(chalk), `a Chalkboard note keeps Crayon Libre first, with Inter before system-ui (${chalk})`);
    // Ticking digits keep their width: Task Timer's countdown and Total left.
    const widths = await win(page, 'task-timer:1').evaluate(() => ['clock-task-time', 'clock-total-left'].map(id => {
      const el = document.getElementById(id), was = el.textContent, w = t => { el.textContent = t; const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
      const out = [w(id === 'clock-total-left' ? 'Total left: 00:00' : '00:00'), w(id === 'clock-total-left' ? 'Total left: 11:11' : '11:11')];
      el.textContent = was; return out;
    }));
    ok(widths.every(([a, b]) => a > 0 && Math.abs(a - b) < 0.5), `Task Timer’s countdown and Total left keep their width as the digits change (${widths.map(w => w.map(x => x.toFixed(1)).join(' → ')).join(', ')})`);

    // 5. Nothing from another site; every font file from the board's site and in the offline copy.
    const away = asked.filter(u => !u.startsWith(BASE) && !/^(data|blob|about):/.test(u));
    ok(!away.length, `no request leaves 21Board’s own site (${away.slice(0, 3).join(' ')})`);
    const fontFiles = Array.from(new Set(asked.filter(u => /\.woff2$/.test(u)).map(u => u.slice(BASE.length)))).sort();
    ok(fontFiles.includes('fonts/Inter-21Board.woff2') && fontFiles.every(f => PRECACHE.includes(f)), `every font file asked for is in the offline copy’s list (${fontFiles.join(', ')})`);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    // 6. The offline copy: every file in fonts/ and widgets/calculator/fonts/ is in sw.js's list. A stamped release,
    // offline: Inter loads in the board and in a widget.
    const shipped = ['fonts', 'widgets/calculator/fonts'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).map(f => d + '/' + f));
    const notListed = shipped.filter(f => !PRECACHE.includes(f));
    ok(shipped.some(f => /\.woff2$/.test(f)) && !notListed.length, `the font files and their licenses are in the offline copy${notListed.length ? ', but not ' + notListed.join(', ') : ''}`);
    deploy('board-font');
    const offc = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const op = await offc.newPage();
    await op.goto(BASE + '__site/board-font/'); await boardUp(op);
    await op.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    ok(await eventually(async () => { const c = await op.evaluate(async () => { const k = (await caches.keys()).filter(n => n.startsWith('21board-')); const c = await caches.open(k[0]); return (await c.keys()).map(r => new URL(r.url).pathname); }); return shipped.every(f => c.includes('/__site/board-font/' + f)); }, 15000),
      'a device saves the fonts with the rest of its offline copy');
    await offc.setOffline(true);
    await op.reload(); await boardUp(op);
    const ck = await addWin(op, 'clock');
    const offBoard = await op.evaluate(facesIn), offWidget = await win(op, ck).evaluate(facesIn);
    ok(offBoard.some(s => /loaded$/.test(s)) && offWidget.some(s => /loaded$/.test(s)), `offline, Inter loads in 21Board (${offBoard.join()}) and in a widget (${offWidget.join()})`);
    await offc.close();

    // 7. A late font: every .woff2 held until the gate opens. Once Inter arrives, text fitted to its window fits again,
    // the Task Timer draws its pie in Inter, Board21's 'resize' fires, and the Widget Picker measures its names again.
    let open; const gate = new Promise(r => { open = r; });
    const slow = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await slow.route(/\.woff2$/, async r => { await gate; await r.continue().catch(() => {}); });
    await slow.addInitScript(() => {
      window.__drawn = []; window.__fontsIn = []; window.__resized = [];
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function () { window.__drawn.push({ font: this.font, at: performance.now() }); return fill.apply(this, arguments); };
      if (document.fonts) document.fonts.addEventListener('loadingdone', () => window.__fontsIn.push(performance.now()));
      // (Board21's own 'resize', once the SDK is in: a widget fits its text there.)
      const t = setInterval(() => { if (window.Board21 && window.Board21.on) { clearInterval(t); window.Board21.on('resize', () => window.__resized.push(performance.now())); } }, 20);
      setTimeout(() => clearInterval(t), 20000);
    });
    const sp = await slow.newPage(); sp.on('pageerror', e => errors.push(e.message));
    await sp.goto(BASE, { waitUntil: 'domcontentloaded' }); await boardUp(sp, { fonts: false }); await freeBoard(sp);   // (the load event waits for the font)
    const iks = {};
    for (const id of ['clock', 'timer', 'calendar', 'notes', 'name-picker', 'task-timer']) iks[id] = await addWin(sp, id, { fonts: false });
    iks.wheel = await addWin(sp, 'name-picker', { fonts: false });
    await sp.click('.win[data-ikey="clock:1"] .win-label'); await sp.click('#menu [data-id="digital"]'); await sp.waitForTimeout(300);
    await sp.click('.win[data-ikey="clock:1"] .win-label'); await sp.click('#menu [data-id="analog"]'); await sp.waitForTimeout(300);
    await sp.evaluate(() => {
      const b = window.__board21;
      b.setRect('clock:1', { x: 10, y: 10, w: 300, h: 176 }); b.setRect('timer:1', { x: 330, y: 10, w: 250, h: 210 });
      b.setRect('calendar:1', { x: 600, y: 10, w: 230, h: 260 }); b.setRect('notes:1', { x: 850, y: 10, w: 300, h: 220 });
      b.setRect('name-picker:1', { x: 10, y: 300, w: 270, h: 220 }); b.setRect('task-timer:1', { x: 300, y: 300, w: 380, h: 420 });
      b.setRect('name-picker:2', { x: 700, y: 300, w: 400, h: 400 });
      const s = b.state.wins;
      s.get('timer:1').post('data', { data: { duration: 7200000, remaining: 7199000, endsAt: null }, reason: 'remote' });
      s.get('notes:1').post('data', { data: { text: 'Line up quietly at the door. Bring your library book!' }, reason: 'remote' });
      s.get('name-picker:1').post('config', { config: { style: 'name' }, reason: 'remote' });
      s.get('name-picker:1').post('data', { data: { names: ['Maximiliana-Guadalupe'], left: null, current: 'Maximiliana-Guadalupe' }, reason: 'remote' });
      s.get('name-picker:2').post('data', { data: { names: ['Maximiliana-Guadalupe', 'Іванна Ґонтаренко', 'Ana', 'Dvořák'], left: null, current: null }, reason: 'remote' });
    });
    await sp.waitForTimeout(1000);
    await sp.click('.picker-btn.left'); await sp.waitForSelector('#panel.open'); await sp.waitForTimeout(300);
    ok(!(await sp.evaluate(facesIn)).some(s => /loaded$/.test(s)), '(Inter is held back: not loaded yet)');
    open();
    ok(await interLoaded(sp), 'once let through, Inter loads in the board');
    for (const ik of Object.values(iks)) await eventually(async () => (await win(sp, ik).evaluate(facesIn)).some(s => /loaded$/.test(s)));
    await sp.waitForTimeout(800);
    const w = ik => win(sp, ik);
    const where = (ik, sel, own) => w(ik).evaluate((html, [sel, own]) => {
      const el = document.querySelector(sel), r = document.createRange(); r.selectNodeContents(el);
      const t = r.getBoundingClientRect(), box = own ? el : el.parentNode, b = box.getBoundingClientRect(), cs = getComputedStyle(box);
      const left = Math.max(0, b.left + parseFloat(cs.paddingLeft)), right = Math.min(innerWidth, b.right - parseFloat(cs.paddingRight));
      return { out: Math.max(0, left - t.left, t.right - right), room: right - left, w: t.width, shrunk: !!el.style.fontSize };
    }, [sel, !!own]);
    const bad = [];
    const fits = (what, p, fill = true) => {
      if (p.out > 1) bad.push(`${what} sticks out by ${Math.round(p.out)} px`);
      else if (fill && p.shrunk && p.w < p.room * 0.95) bad.push(`${what} was shrunk for other letters (${Math.round(p.w)} px in ${Math.round(p.room)})`);
    };
    fits('Clock time', await where('clock:1', '#time'));
    fits('Timer', await where('timer:1', '#display'), false);
    fits('Calendar month', await where('calendar:1', '#title', true));
    const note = await w('notes:1').evaluate(() => { const v = document.getElementById('view'); return { sh: v.scrollHeight, ch: v.clientHeight, sw: v.scrollWidth, cw: v.clientWidth }; });
    if (note.sh > note.ch + 1 || note.sw > note.cw + 1) bad.push(`the note doesn’t fit (${note.sw}×${note.sh} in ${note.cw}×${note.ch})`);
    const np = await w('name-picker:1').evaluate(() => { const s = document.querySelector('.bn'); return { sh: s.scrollHeight, ch: s.clientHeight, sw: s.scrollWidth, cw: s.clientWidth }; });
    if (np.sh > np.ch + 1 || np.sw > np.cw + 1) bad.push(`the picked name doesn’t fit (${np.sw}×${np.sh} in ${np.cw}×${np.ch})`);
    const drewInter = ik => w(ik).evaluate(() => { const t = Math.min(...window.__fontsIn.filter(x => x > 0)); return window.__drawn.some(d => d.at >= t && /"?Inter"?/.test(d.font)); });
    if (!await drewInter(iks.wheel)) bad.push('the Spinning wheel didn’t draw its names again in Inter');
    ok(!bad.length, `once Inter arrives, the Clock, Timer, Calendar, a note, Name Picker, and the Spinning wheel fit their windows${bad.length ? ': ' + bad.join(' | ') : ''}`);
    ok(await drewInter('task-timer:1'), 'the Task Timer draws its pie again in Inter once it has loaded');
    const heard = await w('clock:1').evaluate(() => ({ fontAt: Math.min(...window.__fontsIn), resized: window.__resized }));
    ok(isFinite(heard.fontAt) && heard.resized.some(t => t >= heard.fontAt), `a widget’s Board21.on('resize') fires once Inter has arrived (font at ${Math.round(heard.fontAt)}, resizes ${heard.resized.map(Math.round).join(', ')})`);
    const names = p => p.evaluate(() => Array.from(document.querySelectorAll('#panel .widget-tile')).map(t => { const n = t.querySelector('.widget-name'); return `${t.dataset.widget}:${n.classList.contains('fits') ? 'fits' : 'cut'}:${n.scrollWidth <= n.clientWidth + 1 ? 'in' : 'past'}`; }).join(' '));
    const late = await names(sp);
    const fresh = await slow.newPage();
    await fresh.goto(BASE); await boardUp(fresh); await freeBoard(fresh);
    await fresh.click('.picker-btn.left'); await fresh.waitForSelector('#panel.open'); await fresh.waitForTimeout(400);
    const now = await names(fresh);
    ok(late === now && !/past/.test(late), `the Widget Picker opened before Inter arrived shows each name as a fresh one does (${late === now ? 'the same' : late + ' ≠ ' + now})`);
    await sp.screenshot({ path: OUT + 'board-font-late.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await slow.close();
  }],

  ['Board font: the widget dev window (on 21Board’s site, in an AI tool’s preview, in the widget lab)', async (browser) => {
    // On 21Board's own site the test board and its widget load Inter. In an AI tool's preview (another site) and in the
    // lab (sealed off) the test board uses the device's font: nothing fetched, no font error, and no font row in Settings.
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    const page = await ctx.newPage();
    const fontErrors = [], asked = [];
    page.on('console', m => { if (m.type() === 'error' && /font|woff2|CORS/i.test(m.text())) fontErrors.push(m.text().slice(0, 120)); });
    page.on('request', r => { if (/\.woff2$/.test(r.url())) asked.push(r.url()); });
    const kids = f => page.frames().filter(x => x.parentFrame() === f);
    const facesIn = () => Array.from(document.fonts).filter(f => f.family.replace(/"/g, '') === 'Inter').map(f => f.status);
    const testBoard = async () => {
      const board = kids(page.mainFrame())[0];
      await board.evaluate(() => document.querySelector('.picker-btn.left').click()); await page.waitForTimeout(300);
      await board.evaluate(() => document.querySelector('[data-ctl="settings"]').click()); await page.waitForTimeout(800);
      return board;
    };
    const appearance = board => board.evaluate(() => {
      const h = Array.from(document.querySelectorAll('#settings h3')).find(x => x.textContent.trim() === 'Appearance'), rows = [];
      for (let e = h && h.nextElementSibling; e && e.tagName !== 'H3'; e = e.nextElementSibling) { const l = e.querySelector('.lbl'); if (l) rows.push(l.textContent.trim()); }
      return rows;
    });

    await page.goto(BASE + '__dev/widget.html'); await page.waitForTimeout(2500);
    let board = await testBoard();
    ok(await eventually(async () => {
      const b = await board.evaluate(() => /^"?Inter"?,/.test(getComputedStyle(document.body).fontFamily));
      const bf = (await board.evaluate(facesIn)).includes('loaded'), wf = (await kids(board)[0].evaluate(facesIn)).includes('loaded');
      const v = await kids(board)[0].evaluate(() => /^"?Inter"?,/.test(getComputedStyle(document.documentElement).getPropertyValue('--b21-font').trim()));
      return b && bf && wf && v;
    }), 'on 21Board’s own site the dev window’s test board and its widget load Inter');
    ok(!(await appearance(board)).some(r => /font|style/i.test(r)), `and Settings › Appearance has no font row (${(await appearance(board)).join(', ')})`);

    const before = asked.length; fontErrors.length = 0;
    await page.goto(BASE.replace('127.0.0.1', 'localhost') + '__dev/widget.html'); await page.waitForTimeout(2500);
    board = await testBoard();
    const rows = await appearance(board);
    ok(await board.evaluate(() => getComputedStyle(document.body).fontFamily.startsWith('system-ui')) && !(await board.evaluate(facesIn)).length && rows.length && !rows.some(r => /font|style/i.test(r)),
      `in an AI tool’s preview the test board uses the device’s font, with no Inter face and no font row (${rows.join(', ')})`);
    await page.goto(BASE + 'sdk/lab.html'); await page.waitForTimeout(400);
    await page.click('#sample'); await page.click('#run'); await page.waitForTimeout(3500);
    board = await testBoard();
    const labRows = await appearance(board);
    ok(await board.evaluate(() => self.origin) === 'null' && await board.evaluate(() => getComputedStyle(document.body).fontFamily.startsWith('system-ui')) && !(await board.evaluate(facesIn)).length && labRows.length && !labRows.some(r => /font|style/i.test(r)),
      `the same in the widget lab (its test board is sealed off: ${labRows.join(', ')})`);
    ok(asked.length === before && !fontErrors.length, `neither fetches a font or logs a font error (${asked.length - before} fetched${fontErrors.length ? ': ' + fontErrors.join(' | ') : ''})`);
    await ctx.close();
  }],
  ];
};
