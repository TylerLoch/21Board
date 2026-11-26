// The Widget Picker.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, freeBoard, openSettings, lockBoard, unlockBoard, addWin, heard, eventually, boardUp,
    VID2, EMBED, PLAYLIST_EMBED, D1, stubVideos, ytLook, ytData, picLook, picData, picWins, drawPic, copyPic,
    copyText, BASE
  } = T;
  return [
  ['Widget Picker: icons in line whatever the name, two lines of room, a longer name cut with … (every Text style, 5 and 3 columns, 100–150%, both corners, badges and DEV, 200%, four rows of tiles)', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    // Badges on one-line and two-line names (Notes twice), Developer mode for SDK Playground's DEV tag, and a widget file
    // with a long name of its own (21Board adds “ (test)”), uploaded as in Developer mode.
    for (const id of ['clock', 'notes', 'notes', 'first-then-board', 'task-timer']) await page.evaluate(id => window.__board21.openWidget(id), id);
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]');
    const upload = async (id, name) => {
      fs.writeFileSync(OUT + `long-name-${id}.html`, `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${id}</title>
<script type="application/json" id="board21-widget">{"id":"${id}","name":"${name}","window":{"width":400,"height":300}}</script></head><body>${id}</body></html>`);
      await page.setInputFiles('#widget-input', OUT + `long-name-${id}.html`);
      ok(await eventually(() => page.evaluate(k => window.__board21.state.insts.has(k), `dev-${id}:1`)), `a widget file named “${name}” is uploaded and opens`);
      await page.waitForTimeout(800);
    };
    const LONG = 'Fraction Bars and Number Line Explorer', FULL = LONG + ' (test)', LONGS = [FULL];
    await upload('fractions', LONG);
    const openPicker = async (side = 'left', cols) => {
      for (let i = 0; i < 3 && await page.locator('#settings.open, #panel.open').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
      if (await page.locator('#panel.open').count()) await page.click(`.picker-btn.${await page.locator('#panel.open.left').count() ? 'left' : 'right'}`);
      await page.click(`.picker-btn.${side}`); await page.mouse.move(1, 1);
      // (Three columns: what the picker draws where it has least room, set here directly.)
      if (cols) await page.evaluate(c => { const P = document.getElementById('panel'); P.style.setProperty('--cols', String(c)); P.classList.toggle('narrow', c < 5); }, cols);
      await page.evaluate(() => Promise.all(document.getElementById('panel').getAnimations().map(a => a.finished)));
    };
    // Each tile, in the panel's own px (it is drawn at --ui: Settings › Size of windows and menus).
    const tiles = () => page.evaluate(() => {
      const ui = window.__board21.zoom.ui;
      return [...document.querySelectorAll('#panel .widget-tile')].map(t => {
        const r = t.getBoundingClientRect(), i = t.querySelector('.widget-icon').getBoundingClientRect(), s = t.querySelector('.widget-icon + span'), n = s.getBoundingClientRect(), cs = getComputedStyle(s);
        const by = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { up: (i.top - b.top) / ui, past: (b.right - i.right) / ui, before: (i.left - b.left) / ui }; };
        // (Where its words wrap, inside the room its box keeps at the sides for a …)
        const pl = parseFloat(cs.paddingLeft) * ui, pr = parseFloat(cs.paddingRight) * ui;
        return { name: s.textContent, row: Math.round(r.top), icon: i.top, size: Math.max(Math.abs(i.width / ui - 54), Math.abs(i.height / ui - 54)), lines: Math.round(n.height / ui / parseFloat(cs.lineHeight)),
          inside: n.top >= r.top - 0.5 && n.bottom <= r.bottom + 0.5 && n.left + pl >= r.left - 0.5 && n.right - pr <= r.right + 0.5,
          cut: s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1, clamp: cs.webkitLineClamp === '2' && cs.overflow === 'hidden', clip: cs.overflow !== 'visible',
          badge: by(t.querySelector('.badge')), dev: by(t.querySelector('.devtag')) };
      });
    });
    // Nothing of a name is cut off by its own box (a name cut with … aside): each looks the same drawn without its clip.
    const inkCut = async () => {
      const out = [];
      for (const s of await page.locator('#panel .widget-tile .widget-icon + span').all()) {
        if (await s.evaluate(s => s.scrollHeight > s.clientHeight + 1)) continue;
        const b = await s.boundingBox(), clip = { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 };
        // Clipped if letting it overflow changes what's drawn, twice: a single difference can be the screenshot's own.
        let cut = true;
        for (let i = 0; i < 2 && cut; i++) {
          const a = await page.screenshot({ clip });
          await s.evaluate(s => { s.style.overflow = 'visible'; });
          const c = await page.screenshot({ clip });
          await s.evaluate(s => { s.style.overflow = ''; });
          cut = !a.equals(c);
        }
        if (cut) out.push(await s.textContent());
      }
      return out;
    };
    // Where a name's ink starts and ends, drawn with its clip widened sideways: px past its box's left and right edges (the
    // clip's), so > 0 is ink the clip cuts off. (Chrome draws the … of a centred line it cuts up to half its width past
    // the line's end.) Its text against the same shot with the text taken away.
    const inkSides = async s => {
      await s.evaluate(s => s.scrollIntoView({ block: 'nearest' }));
      const b = await s.boundingBox(), clip = { x: b.x - 20, y: b.y, width: b.width + 40, height: b.height };
      await s.evaluate(s => { s.style.overflow = 'visible'; s.style.clipPath = 'inset(0 -20px)'; });
      const a = (await page.screenshot({ clip })).toString('base64');
      await s.evaluate(s => { s.style.color = 'transparent'; });
      const c = (await page.screenshot({ clip })).toString('base64');
      await s.evaluate(s => { s.style.overflow = s.style.clipPath = s.style.color = ''; });
      const x = await page.evaluate(async shots => {
        const [A, C] = await Promise.all(shots.map(async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode();
          const v = document.createElement('canvas'); v.width = i.width; v.height = i.height; const g = v.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height); }));
        let l = A.width, r = 0;
        for (let k = 0; k < A.data.length; k += 4) {
          if (Math.abs(A.data[k] - C.data[k]) + Math.abs(A.data[k + 1] - C.data[k + 1]) + Math.abs(A.data[k + 2] - C.data[k + 2]) > 30) { const p = (k / 4) % A.width; l = Math.min(l, p); r = Math.max(r, p + 1); }
        }
        return { l: l / A.width, r: r / A.width };
      }, [a, c]);
      return { left: 20 - x.l * clip.width, right: x.r * clip.width - 20 - b.width };
    };
    const near = (a, b) => Math.abs(a - b) < 0.6;
    const check = async (where, { ink = false } = {}) => {
      const ts = await tiles(), rows = new Map();
      for (const t of ts) rows.set(t.row, (rows.get(t.row) || []).concat(t));
      const off = [...rows.values()].map(r => Math.max(...r.map(t => t.icon)) - Math.min(...r.map(t => t.icon)));
      const two = ts.filter(t => t.lines === 2).map(t => t.name);
      ok(off.every(d => d < 0.5) && ts.every(t => t.size < 0.5) && two.length > 0,
        `${where}: in every row the icons share one top, all full size, with names on one line and on two (${two.join(', ')}) (rows off by ${off.map(d => d.toFixed(1)).join(', ')} px; icons squeezed: ${ts.filter(t => t.size >= 0.5).map(t => t.name).join(', ') || 'none'})`);
      // Only a name cut to two lines is clipped to its box: a box exactly two lines tall would shave the tails of g and y.
      const bad = ts.filter(t => !t.inside || t.lines > 2 || (t.cut && !(t.clamp && t.lines === 2)) || (t.cut && !LONGS.includes(t.name)) || (!t.cut && t.clip));
      const longs = LONGS.map(n => ts.find(t => t.name === n)), sideways = await page.evaluate(() => { const g = document.querySelector('#panel .panel-widgets'); return g.scrollWidth - g.clientWidth; });
      ok(!bad.length && longs.every(l => l && l.cut && l.clamp && l.lines === 2) && sideways <= 0,
        `${where}: no name runs out of its tile, is cut or is clipped, save ${LONGS.map(n => `“${n}”`).join(' and ')}: two lines and an ellipsis; the tiles don't scroll sideways (${bad.map(t => `${t.name}: ${t.lines} lines${t.inside ? '' : ', out of its tile'}${t.cut ? ', cut' : ''}${t.clip && !t.cut ? ', clipped though it fits' : ''}`).join('; ') || longs.map((l, k) => l ? `${l.lines} lines${l.cut ? ', cut' : ''}${l.clamp ? ' with …' : ''}` : LONGS[k] + ' not there').join('; ')}${sideways > 0 ? `; ${sideways} px sideways` : ''})`);
      const ell = [];
      for (const s of await page.locator('#panel .widget-name').all()) if (await s.evaluate(s => s.scrollHeight > s.clientHeight + 1)) ell.push({ name: await s.textContent(), ...await inkSides(s) });
      const cutEll = ell.filter(e => e.left > 0.5 || e.right > 0.5);
      ok(ell.length === LONGS.length && !cutEll.length,
        `${where}: the … ending a name cut to two lines is drawn whole, inside its box (${ell.map(e => `${e.name}: ink ${e.right > 0.5 ? e.right.toFixed(1) + ' px past its right edge' : e.left > 0.5 ? e.left.toFixed(1) + ' px past its left edge' : `${(-e.left).toFixed(1)} and ${(-e.right).toFixed(1)} px inside`}`).join('; ') || 'none cut'})`);
      const marks = ts.filter(t => (t.badge && !(near(t.badge.up, 9) && near(t.badge.past, 9))) || (t.dev && !(near(t.dev.up, 7) && near(t.dev.before, 13))));
      ok(ts.filter(t => t.badge).length >= 5 && ts.filter(t => t.dev).length >= 2 && !marks.length,
        `${where}: each open-count badge sits 9 px above its icon and 9 px past its right edge, each DEV tag 7 px above and 13 px before it, as on a one-line tile before (${marks.map(t => `${t.name}: ${JSON.stringify(t.badge || t.dev, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v)}`).join('; ') || 'all'})`);
      if (ink) { const cut = await inkCut(); ok(!cut.length, `${where}: no letter of a name is clipped by its box (${cut.join(', ') || 'none'})`); }
    };

    const FAMS = { legible: 'Atkinson Hyperlegible', early: '21Board Early Readers' };
    for (const style of ['standard', 'legible', 'early']) {
      if (style !== 'standard') {
        await openSettings(page, ['letters']); await page.click(`#settings [data-act="letters"][data-val="${style}"]`);
        await page.waitForFunction(fam => Array.from(document.fonts).filter(f => f.family.replace(/"/g, '') === fam && f.status === 'loaded').length >= 2, FAMS[style]);
      }
      for (const cols of [5, 3]) {
        await openPicker('left', cols === 5 ? 0 : cols);
        ok(await page.evaluate(() => getComputedStyle(document.getElementById('panel')).getPropertyValue('--cols').trim()) === String(cols), `${style}: ${cols} columns`);
        await check(`${style}, ${cols} columns`, { ink: cols === 5 });
        await page.locator('#panel').screenshot({ path: OUT + `widget-picker-${style}-${cols}col.png` });
      }
      // Sizes between, where a box's edges fall between the screen's pixels.
      for (const sc of [1.25, 1.5]) {
        await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(300);
        await openPicker('left');
        await check(`${style}, ${sc * 100}%`);
      }
      await page.evaluate(() => window.__board21.setBoardScale(1)); await page.waitForTimeout(300);
    }
    await openSettings(page, ['letters']); await page.click('#settings [data-act="letters"][data-val="standard"]');
    await openPicker('right');
    await check('Standard, the right corner’s panel');
    await page.locator('#panel').screenshot({ path: OUT + 'widget-picker-right.png' });
    // 200% on 1366 × 768: the panel is drawn as big as the screen's height allows, and still fits on the screen. Where
    // five columns would need four rows, it has six (since the Zones Check-In, 2026.11.20-1): a teacher's 17 tiles (with
    // Weather, 2026.11.24-3) are three rows, all in view. Developer mode's 19 are four, and the tiles scroll.
    await page.evaluate(() => window.__board21.setBoardScale(2)); await page.waitForTimeout(300);
    await openPicker('left');
    await check('200%');
    const fitNow = () => page.evaluate(() => { const P = document.getElementById('panel'), g = P.querySelector('.panel-widgets'), r = P.getBoundingClientRect(), c = P.querySelector('.panel-controls').getBoundingClientRect();
      const ts = [...g.querySelectorAll('.widget-tile')];
      return { ui: window.__board21.zoom.ui, top: r.top, bottom: c.bottom, scrolls: g.scrollHeight > g.clientHeight + 1, n: ts.length, rows: new Set(ts.map(t => t.offsetTop)).size }; });
    let fit = await fitNow();
    ok(fit.ui > 1.7 && fit.top >= 0 && fit.bottom <= 768 && (fit.rows <= 3 || fit.scrolls), `at 200% (drawn at ${fit.ui.toFixed(2)}) the whole panel fits on the screen, with Developer mode’s ${fit.n} tiles in ${fit.rows} rows (top ${Math.round(fit.top)}, controls end at ${Math.round(fit.bottom)})`);
    await page.locator('#panel').screenshot({ path: OUT + 'widget-picker-200.png' });
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await openPicker('left');
    fit = await fitNow();
    ok(fit.ui > 1.7 && fit.top >= 0 && fit.bottom <= 768 && fit.n === 17 && fit.rows === 3 && !fit.scrolls, `at 200% a teacher’s ${fit.n} tiles, three rows of six, are all in view without scrolling (${fit.rows} rows; top ${Math.round(fit.top)}, controls end at ${Math.round(fit.bottom)})`);
    await openSettings(page, ['advanced']); await page.click('#settings [data-act="devmode"]'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.evaluate(() => window.__board21.setBoardScale(1)); await page.waitForTimeout(300);

    // The full name stays within reach: it is the tile's accessible name (what a screen reader says), with what the widget
    // does as its description, and its tooltip starts with it.
    await openPicker('left');
    const cdp = await ctx.newCDPSession(page);
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const heard = [];
    for (const w of await page.evaluate(() => window.__board21.catalog().filter(a => document.querySelector(`#panel [data-widget="${a.id}"]`)).map(a => ({ id: a.id, name: a.name, description: a.description || '' })))) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#panel [data-widget="${w.id}"]` });
      const n = (await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })).nodes[0];
      const title = await page.getAttribute(`#panel [data-widget="${w.id}"]`, 'title');
      heard.push({ ...w, said: n.name && n.name.value, desc: (n.description && n.description.value) || '', tip: title.split('\n')[0] });
    }
    const wrong = heard.filter(h => h.said !== h.name || h.tip !== h.name || (h.description && h.desc !== h.description));
    ok(heard.length >= 15 && !wrong.length, `every tile's accessible name is its full name, its description what it does, and its tooltip starts with the name (${wrong.map(h => `${h.id}: heard “${h.said}”, described “${h.desc}”, tooltip “${h.tip}”`).join('; ') || heard.length + ' tiles'})`);
    const lt = heard.find(h => h.name === FULL);
    ok(lt && lt.said === FULL && lt.tip === FULL, `the long one too: a screen reader hears “${lt && lt.said}”, and its tooltip says “${lt && lt.tip}”`);

    // Sixteen tiles and more (a second long name: 17 with the Picture): four rows, 104 px apart as before, so the panel
    // fits where it did: at 200% on 1920 × 1080 and 150% on 1280 × 800, without scrolling.
    const LONG2 = 'Supercalifragilisticexpialidocious Spelling';
    await upload('spelling', LONG2); LONGS.push(LONG2 + ' (test)');
    for (const [w, h, sc] of [[1920, 1080, 2], [1280, 800, 1.5]]) {
      await page.setViewportSize({ width: w, height: h }); await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(400);
      await openPicker('left');
      const f = await page.evaluate(() => { const P = document.getElementById('panel'), g = P.querySelector('.panel-widgets'), r = P.getBoundingClientRect(), c = P.querySelector('.panel-controls').getBoundingClientRect();
        const ts = [...g.querySelectorAll('.widget-tile')];
        return { n: ts.length, rows: new Set(ts.map(t => Math.round(t.getBoundingClientRect().top))).size, top: r.top, bottom: c.bottom, sh: g.scrollHeight, ch: g.clientHeight }; });
      ok(f.n >= 16 && f.rows === 4 && f.sh <= f.ch + 1 && f.top >= 0 && f.bottom <= h,
        `${f.n} tiles at ${sc * 100}% on ${w} × ${h}: their 4 rows fit without scrolling, the controls on screen (${f.n} tiles, ${f.rows} rows, ${f.sh} of ${f.ch} px; top ${Math.round(f.top)}, controls end at ${Math.round(f.bottom)})`);
      await check(`four rows at ${sc * 100}% on ${w} × ${h}`);
      await page.locator('#panel').screenshot({ path: OUT + `widget-picker-16-${w}x${h}.png` });
    }
    // Each long name's … whole in every Text style.
    await page.setViewportSize({ width: 1366, height: 768 }); await page.evaluate(() => window.__board21.setBoardScale(1)); await page.waitForTimeout(400);
    for (const style of ['standard', 'legible', 'early']) {
      await openSettings(page, ['letters']); await page.click(`#settings [data-act="letters"][data-val="${style}"]`);
      if (style !== 'standard') await page.waitForFunction(fam => Array.from(document.fonts).filter(f => f.family.replace(/"/g, '') === fam && f.status === 'loaded').length >= 2, FAMS[style]);
      await openPicker('left');
      await check(`four rows, ${style}`);
    }
    await page.locator('#panel').screenshot({ path: OUT + 'widget-picker-16-early.png' });
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Widget Picker: Paste (both corners at 1366 × 768 in every Text style and Size, with one page and 12, every widget in view, six columns from 150%; five columns on smaller screens, ‹ Page › on a row of its own where the buttons need the room; a picture opens a Picture window, a video link a Video Player; nothing to paste, a link it can’t play, blocked, windows locked; hidden with no clipboard to read; kiosk; the README)', async (browser) => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' ');
    ok(/\| \*\*Buttons\*\* \|[^|]*Paste, Export, Import, Lock, Full screen, and Settings/.test(readme), 'the README’s Buttons row starts with Paste');
    ok(/\| \*\*Paste\*\* \|/.test(readme), 'the README has a Paste row');

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await stubVideos(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const FAMS = { legible: 'Atkinson Hyperlegible', early: '21Board Early Readers' };
    const openPicker = async side => {
      for (let i = 0; i < 3 && await page.locator('#settings.open, #panel.open').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
      await page.click(`.picker-btn.${side}`); await page.mouse.move(1, 1);
      await page.evaluate(() => Promise.all(document.getElementById('panel').getAnimations().map(a => a.finished)));
    };
    // Paste in the open panel: shown, named, the first button after ▦, the size of the others and on their row, nothing
    // over it, and the panel on screen, its row not scrolling and clear of the other corner's ▦.
    const where = side => page.evaluate(side => {
      const P = document.getElementById('panel'), b = P.querySelector('[data-ctl="paste"]'), grid = P.querySelector('.panel-widgets'), wr = grid.getBoundingClientRect(), tiles = [...grid.querySelectorAll('.widget-tile')];
      if (!b) return { there: false };
      const r = b.getBoundingClientRect(), pr = P.getBoundingClientRect(), gear = P.querySelector('[data-ctl="settings"]').getBoundingClientRect(), row = P.querySelector('.panel-controls');
      const shown = [...row.querySelectorAll('button, .picker-spacer')].filter(x => x.offsetParent), others = shown.filter(x => x !== b).map(x => x.getBoundingClientRect());
      const other = document.querySelector(`.picker-btn.${side === 'left' ? 'right' : 'left'}`).getBoundingClientRect();
      const hit = (a, z) => a.left < z.right - 0.5 && z.left < a.right - 0.5 && a.top < z.bottom - 0.5 && z.top < a.bottom - 0.5;
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), ui = window.__board21.zoom.ui;
      return { there: true, shown: !b.hidden && !!b.offsetParent, label: b.getAttribute('aria-label') + '/' + b.title, icon: !!b.querySelector('svg'),
        first: [...row.querySelectorAll('.ctl')].filter(x => x.offsetParent)[0] === b, row: Math.abs(r.top - gear.top) < 1 && Math.abs(r.height - gear.height) < 1 && Math.abs(r.width - gear.width) < 1,
        apart: !others.some(o => hit(r, o)), tappable: !!at && b.contains(at), onScreen: pr.left >= -0.5 && pr.right <= innerWidth + 0.5 && pr.top >= -0.5 && pr.bottom <= innerHeight + 0.5,
        inPanel: r.left >= pr.left && r.right <= pr.right, noScroll: row.scrollWidth <= row.clientWidth + 1 && P.scrollWidth <= P.clientWidth + 1,
        clear: !shown.some(x => hit(x.getBoundingClientRect(), other)), big: r.width >= 44 * ui - 0.5 && r.height >= 44 * ui - 0.5, ui: Math.round(ui * 100) / 100,
        cols: +P.style.getPropertyValue('--cols'), narrow: P.classList.contains('narrow'), seen: tiles.filter(t => { const tr = t.getBoundingClientRect(); return tr.top >= wr.top - 0.5 && tr.bottom <= wr.bottom + 0.5; }).length,
        tiles: tiles.length, tilesScroll: grid.scrollHeight > grid.clientHeight + 1, page: (P.querySelector('.page-ind b') || {}).textContent };
    }, side);
    // Paste placed well; and every widget in view, none scrolled out of sight (as on ba52951, before Paste). misplaced says
    // what's wrong with Paste, in a few words for the log.
    const PLACED = { shown: 'Paste hidden', icon: 'Paste has no icon', first: 'Paste not first', row: 'Paste off the row', apart: 'Paste over a button', tappable: 'Paste covered',
      onScreen: 'the panel off screen', inPanel: 'Paste outside the panel', noScroll: 'the row scrolls', clear: 'a button over the other ▦', big: 'Paste under 44 px' };
    const misplaced = w => !w.there ? ['no Paste'] : Object.keys(PLACED).filter(k => !w[k]).map(k => PLACED[k]).concat(w.label === 'Paste/Paste' ? [] : [`Paste named “${w.label}”`]);
    const good = w => !misplaced(w).length;
    const allSeen = w => w.tiles >= 16 && w.seen === w.tiles && !w.tilesScroll;
    for (const style of ['standard', 'legible', 'early']) {
      if (style !== 'standard') {
        await openSettings(page, ['letters']); await page.click(`#settings [data-act="letters"][data-val="${style}"]`);
        await page.waitForFunction(fam => Array.from(document.fonts).filter(f => f.family.replace(/"/g, '') === fam && f.status === 'loaded').length >= 2, FAMS[style]);
      }
      for (const side of ['left', 'right']) {
        await openPicker(side);
        const w = await where(side);
        ok(good(w) && allSeen(w), `${style}, the ${side} corner: Paste is the first button after ▦, as big as the others and on their row, with nothing over it, the panel on screen and clear of the other ▦, every widget in view (${JSON.stringify(w)})`);
        await page.locator('#panel').screenshot({ path: OUT + `widget-picker-paste-${style}-${side}.png` });
      }
    }
    // Every Size in every Text style, from both corners, with 12 pages (‹ Page 12 of 12 ›: the widest row).
    for (let i = 0; i < 11; i++) await page.evaluate(() => window.__board21.pages.create({ end: true, quiet: true }));
    await page.waitForTimeout(500);
    const SIZES = [0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    for (const style of ['standard', 'legible', 'early']) {
      await openSettings(page, ['letters']); await page.click(`#settings [data-act="letters"][data-val="${style}"]`);
      const bad = [];
      for (const sc of SIZES) {
        await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(150);
        for (const side of ['left', 'right']) {
          await openPicker(side);
          const w = await where(side), cols = sc < 1.5 ? 5 : 6;
          // (Sixteen tiles since the Zones Check-In, 2026.11.20-1: from 150% four rows of five don't fit, three of six do.)
          const off = misplaced(w).concat(w.cols === cols ? [] : [`${w.cols} columns`], allSeen(w) ? [] : [`${w.seen} of ${w.tiles} widgets in view${w.tilesScroll ? ', the tiles scroll' : ''}`],
            w.page === '12 of 12' ? [] : [`‹ Page › says “${w.page}”`]);
          if (off.length) bad.push(`${Math.round(sc * 100)}%, ${side}: ${off.join(', ')}`);
        }
      }
      ok(!bad.length, `${style}, Page 12 of 12, every Size from both corners: Paste fits as at 100%, five columns and six from 150%, and every widget in view (${bad.join('; ') || SIZES.length * 2 + ' cases'})`);
    }
    await openSettings(page, ['letters']); await page.click('#settings [data-act="letters"][data-val="standard"]');
    // Smaller screens: five columns from 600 px of room, as on ba52951, and six where four rows of five don't fit and
    // three of six do. ‹ Page › ends the row of buttons where that row clears the other corner's ▦, else it has a row of
    // its own. (On an iPad Air at 175%, six don't fit beside the other ▦: the fourth row of five is a scroll away.)
    for (const [vw, vh, sc, cols, wide, all, what] of [[1180, 820, 1.75, 5, true, false, 'an iPad Air, Size 175%'], [1180, 820, 2, 5, false, false, 'an iPad Air, Size 200%'],
      [1280, 1024, 2, 6, false, true, '1280 × 1024, Size 200%'], [768, 1024, 1.25, 5, false, true, 'an iPad upright, Size 125%']]) {
      await page.setViewportSize({ width: vw, height: vh }); await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(300);
      for (const side of ['left', 'right']) {
        await openPicker(side);
        const w = await where(side);
        ok(good(w) && w.cols === cols && w.narrow === !wide && (!all || allSeen(w)) && w.seen >= 10,
          `${what}, the ${side} corner: ${cols === 6 ? 'six' : 'five'} columns, ‹ Page › ${wide ? 'beside the buttons' : 'on a row of its own'}, Paste placed well, ${all ? 'every widget in view' : `${w.seen} of ${w.tiles} widgets in view`} (${JSON.stringify(w)})`);
        if (side === 'left') await page.locator('#panel').screenshot({ path: OUT + `widget-picker-paste-${vw}x${vh}-${sc * 100}.png` });
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 }); await page.evaluate(() => window.__board21.setBoardScale(1)); await page.waitForTimeout(300);

    const wins = id => page.evaluate(id => Array.from(window.__board21.state.insts.keys()).filter(k => k.startsWith(id + ':')).sort((a, b) => +a.split(':')[1] - +b.split(':')[1]), id);
    const tapPaste = async side => { await openPicker(side); await page.click('#panel.open [data-ctl="paste"]', { timeout: 3000 }).catch(() => {}); };
    const toastSays = t => page.locator('.toast', { hasText: t }).count().then(c => c > 0);
    const noToasts = () => page.locator('.toast').evaluateAll(ts => ts.forEach(t => t.remove())).catch(() => {});
    const NOTHING = 'Nothing to paste. Copy a picture or a video link first.', BLOCKED = 'Pasting is blocked. Allow the clipboard for 21Board.';
    // A picture: a new Picture window in the middle of the board, in front and selected, and the panel closes.
    const pic = await drawPic(page, 90, 60, 'image/png');
    await copyPic(page, pic);
    let n = (await wins('image')).length;
    await tapPaste('left');
    ok(await eventually(async () => (await wins('image')).length === n + 1), 'with a picture on the clipboard, Paste opens a Picture window');
    let ik = (await wins('image')).slice(-1)[0];
    ok(await eventually(async () => ((await picData(page, ik)) || {}).w === 90 && (await picLook(page, ik)).pic), 'with the picture in it');
    const b = await page.evaluate(() => window.__board21.boundsRect()), m = await page.evaluate(ik => { const i = window.__board21.state.insts.get(ik), r = i && i.rect; return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: 1e9, y: 1e9 }; }, ik);   // (no window: a failed check, not a crash)
    ok(!!ik && await page.locator('#panel.open').count() === 0 && await page.evaluate(() => window.__board21.state.focused) === ik && Math.abs(m.x - (b.x + b.w / 2)) < 40 && Math.abs(m.y - (b.y + b.h * 0.42)) < 40,
      `the Widget Picker closes; the window is in the middle of the board, in front and selected (${Math.round(m.x)}, ${Math.round(m.y)})`);
    await page.screenshot({ path: OUT + 'widget-picker-paste-picture.png' });
    // A video link: a new Video Player on that video.
    await copyText(page, `https://youtu.be/${VID2}?t=90`);
    n = (await wins('youtube-player')).length;
    await tapPaste('right');
    ok(await eventually(async () => (await wins('youtube-player')).length === n + 1), 'with a YouTube link on the clipboard, Paste opens a Video Player');
    ik = (await wins('youtube-player')).slice(-1)[0];
    const vLook = () => ik ? ytLook(page, ik).catch(() => ({})) : Promise.resolve({});   // (no window: a failed check, not a crash)
    ok(await eventually(async () => (await vLook()).src === EMBED(VID2, '&start=90')) && ((ik && await ytData(page, ik)) || {}).videoUrl === `https://youtu.be/${VID2}?t=90` && await page.locator('#panel.open').count() === 0,
      `on that video, from 1:30, and the Widget Picker closes (${(await vLook()).src})`);
    // Nothing to paste: empty, or words that aren't a video link. The Widget Picker stays open, and no window opens.
    for (const [text, what] of [['', 'an empty clipboard'], ['Spelling words', 'words'], ['https://www.example.com/page', 'a link that isn’t a video']]) {
      await copyText(page, text); await noToasts();
      const before = [(await wins('image')).length, (await wins('youtube-player')).length];
      await tapPaste('left');
      ok(await eventually(() => toastSays(NOTHING)) && await page.locator('#panel.open').count() === 1 && JSON.stringify([(await wins('image')).length, (await wins('youtube-player')).length]) === JSON.stringify(before),
        `${what}: “${NOTHING}”, the Widget Picker stays open, no window opens`);
    }
    // A link the Video Player knows but can't play: what it is, and what to copy instead (its own words, with Copy).
    for (const [text, say, what] of [[PLAYLIST_EMBED, 'That’s a list of videos. Copy a link to one.', 'a playlist'],
      [`https://drive.google.com/drive/folders/${D1}`, 'That’s a folder. Copy a link to one video.', 'a Drive folder'],
      [`https://docs.google.com/document/d/${D1}/edit`, 'That’s a document. Copy a link to a video.', 'a Google Doc'],
      [`https://docs.google.com/spreadsheets/d/${D1}/edit`, 'That’s a spreadsheet. Copy a link to a video.', 'a Google Sheet'],
      [`https://docs.google.com/presentation/d/${D1}/edit`, 'That’s a presentation. Copy a link to a video.', 'Google Slides']]) {
      await copyText(page, text); await noToasts();
      const before = [(await wins('image')).length, (await wins('youtube-player')).length];
      await tapPaste('left');
      ok(await eventually(() => toastSays(say)) && !await toastSays(NOTHING) && await page.locator('#panel.open').count() === 1 && JSON.stringify([(await wins('image')).length, (await wins('youtube-player')).length]) === JSON.stringify(before),
        `${what}: “${say}”, the Widget Picker stays open, no window opens`);
    }
    // Blocked: the browser won't let 21Board see the clipboard.
    await ctx.clearPermissions(); await noToasts();
    await tapPaste('left');
    ok(await eventually(() => toastSays(BLOCKED), 4000) && await page.locator('#panel.open').count() === 1, `when the browser won’t let 21Board see the clipboard: “${BLOCKED}”`);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    // Locked: the Widget Picker doesn't open, so there is no Paste; Ctrl+V opens no window, and the board says it's locked.
    await lockBoard(page, 'widgets'); await copyPic(page, pic); await noToasts();
    n = (await wins('image')).length;
    await page.click('.picker-btn.left'); await page.waitForTimeout(300);
    ok(!await page.locator('#panel.open').count() && await toastSays('The board is locked.'), 'locked: ▦ opens no Widget Picker, so no Paste, and the board says it’s locked');
    await page.evaluate(() => { window.__board21.lock.toldAt = 0; }); await noToasts();
    await page.keyboard.press('Control+V'); await page.waitForTimeout(800);
    ok((await wins('image')).length === n && await toastSays('The board is locked.'), 'and Ctrl+V opens no window: “The board is locked.”');
    await unlockBoard(page);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));

    // No clipboard to read (a browser without navigator.clipboard.read): no Paste, here or in a Picture window.
    const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx2.addInitScript(() => { if (window.Clipboard) Object.defineProperty(Clipboard.prototype, 'read', { value: undefined, configurable: true }); });
    const p2 = await ctx2.newPage();
    await p2.goto(BASE); await boardUp(p2);
    await p2.click('.picker-btn.left'); await p2.waitForTimeout(300);
    const hidden = await p2.evaluate(() => { const b = document.querySelector('#panel [data-ctl="paste"]'); return !!b && (b.hidden || !b.offsetParent); });
    await p2.click('.picker-btn.left'); await p2.waitForTimeout(200);
    const pk = await addWin(p2, 'image');
    ok(hidden && !(await picLook(p2, pk)).paste, 'where the clipboard can’t be read, the Widget Picker has no Paste, nor has a Picture window');
    await ctx2.close();

    // Kiosk mode: Paste shows and works.
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('[kiosk] ' + e.message));
    await k.goto(BASE + '?kiosk=yes'); await boardUp(k);
    await k.click('.picker-btn.left'); await k.waitForTimeout(300);
    const kc = await k.evaluate(() => Array.from(document.querySelectorAll('.panel-controls .ctl')).filter(b => !b.hidden).map(b => b.dataset.ctl));
    await copyPic(k, pic);
    const kn = (await picWins(k)).length;
    await k.click('#panel.open [data-ctl="paste"]', { timeout: 3000 }).catch(() => {});
    ok(kc[0] === 'paste' && await eventually(async () => (await picWins(k)).length === kn + 1), `kiosk: Paste comes first (${kc.join(', ')}) and opens a Picture window`);
    await k.close();
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ];
};
