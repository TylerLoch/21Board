// The Calculator: its keys, History, the canvas, and its layouts.
'use strict';
module.exports = T => {
  const {
    fs, path, ROOT, OUT, ok, freeBoard, openSettings, sorted, addWin, hear, eventually, release, stamped, STAMPED,
    marked, boardUp, contentOf, contrast, rgbOf, TESTS_DIR, BASE
  } = T;
  return [
  // ---- Calculator (widgets/calculator): Teach's canvas and steps, its keys, and History that looks like Desmos's lines ----
  ['Calculator: the Node test of its math engine (tests/calc-engine.js)', async () => {
    const r = require('child_process').spawnSync(process.execPath, [path.join(TESTS_DIR, 'calc-engine.js')], { encoding: 'utf8', timeout: 5 * 60e3 });
    const m = /(\d+) passed, (\d+) failed/.exec(r.stdout || '');
    for (const line of String(r.stdout || '').split('\n').filter(l => /^FAIL /.test(l)).slice(0, 20)) console.log('   ' + line.trim());
    ok(r.status === 0 && m && +m[2] === 0 && +m[1] >= 764, `tests/calc-engine.js: ${m ? `${m[1]} passed, ${m[2]} failed` : 'no result'}${!m ? ': ' + String(r.stderr || '').split('\n').slice(0, 4).join(' ') : ''}`);
  }],
  ['Calculator: the Widget Picker and a new window (canvas on the left, History hidden), the keys, = = =, History on and off and its lines, percent, faint digit groups, Advanced keys, Steps, Hide the answer, In words, Answers, the keyboard, Swap sides, saved and kept apart, Reset, light and dark, the menu, the smallest size, the docs', async (browser) => {
    const dir = path.join(ROOT, 'widgets', 'calculator'), file = path.join(dir, 'index.html'), src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const engineSrc = fs.existsSync(path.join(dir, 'calc-engine.js')) ? fs.readFileSync(path.join(dir, 'calc-engine.js'), 'utf8') : '';
    ok(!!src && !!engineSrc && !/--b21-[\w-]+\s*:/.test(src) && !/localStorage|indexedDB|XMLHttpRequest|sessionStorage|fetch\(/.test(src + engineSrc) && !/https?:\/\/(?!www\.w3\.org\/)/.test(src + engineSrc.replace(/\/\/.*$/gm, '')),
      'the widget is widgets/calculator/index.html and its engine calc-engine.js: no --b21-* value of its own, nothing stored itself, nothing from the Internet');
    ok(/<script src="calc-engine\.js"><\/script>/.test(src) && /separators: 'faint'/.test(src), 'the page loads its engine from its own folder, with faint digit groups');
    // The docs: README's row and section, the data format's content and config.
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' '), dataDoc = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-FORMAT.md'), 'utf8').replace(/\s+/g, ' ');
    const sec = readme.indexOf('## Calculator') >= 0 ? readme.slice(readme.indexOf('## Calculator'), readme.indexOf('## ', readme.indexOf('## Calculator') + 5)) : '';
    ok(readme.indexOf('| **Calculator** |') > readme.indexOf('### Included widgets') && readme.indexOf('| **Calculator** |') < readme.indexOf('## Adding a widget'), 'the README’s Included widgets has a Calculator row');
    ok(/Desmos/.test(sec) && ['Canvas', 'History', 'Steps', 'In words', 'Answers', 'Advanced keys', 'Desmos %', 'Hide the answer', 'Swap sides'].every(w => sec.includes(w)),
      `the README has a Calculator section: Desmos’s math, and every item of its menu (${sec.length} characters)`);
    ok(/`calculator`/.test(dataDoc) && /serialize\(\)|"v": 2|v: 2/.test(dataDoc) && /percent/.test(dataDoc) && /advanced/.test(dataDoc) && /swap/.test(dataDoc), 'the data format guide has the Calculator’s content and config');

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);

    // Helpers: a window's frame; what it shows; keys pressed as a child does; its menu; its saved content and config.
    const W = (ik = 'calculator:1') => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const look = (ik = 'calculator:1') => W(ik).locator('html').evaluate(() => {
      const $ = id => document.getElementById(id), shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const box = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
      const plain = e => { if (!e) return ''; const c = e.cloneNode(true); c.querySelectorAll('.ce-anslabel, .ce-cursor, .heq').forEach(n => n.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
      const label = e => { const m = e && e.querySelector('.ce-math'); return m ? m.getAttribute('aria-label') : ''; };
      const keys = [...document.querySelectorAll('#keys .key')].filter(shown);
      const panels = [['canvas', $('card')], ['display', $('disp')], ['keys', $('keys')], ['history', $('history')]].filter(([, e]) => shown(e)).map(([n, e]) => Object.assign({ n }, box(e)));
      const lines = [...document.querySelectorAll('#history .hline')].filter(shown);
      return {
        app: !!$('app'), layout: $('app') ? $('app').dataset.layout : '', panels, order: panels.slice().sort((a, b) => a.x - b.x).map(p => p.n),
        keys: keys.map(k => k.dataset.key), keyMin: keys.length ? Math.min(...keys.map(k => Math.min(k.getBoundingClientRect().width, k.getBoundingClientRect().height))) : 0,
        keysInside: keys.every(k => { const r = k.getBoundingClientRect(); return r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; }),
        eq: plain($('eq')), eqLabel: label($('eq')), cursor: !!document.querySelector('#eq .ce-cursor'), reveal: shown(document.querySelector('#eq .reveal')) || shown(document.querySelector('#big .reveal')),
        big: plain($('big')), x: plain($('x')), hint: plain($('hint')), note: plain($('note')), said: shown($('said')) ? plain($('said')) : '',
        toggle: shown($('eqToggle')) || shown($('bigToggle')), frac: !!document.querySelector('#eq .ce-ans .ce-frac, #big .ce-frac'),
        hist: lines.map(l => ({ expr: plain(l.querySelector('.hpick')), ans: plain(l.querySelector('.hans')), pick: (l.querySelector('.hpick') || {}).getAttribute && l.querySelector('.hpick').getAttribute('aria-label'), use: l.querySelector('.hans') && l.querySelector('.hans').getAttribute('aria-label') })),
        histEmpty: shown($('history')) ? plain(document.querySelector('#history .hempty')) : '',
        count: plain($('count')), next: plain($('next')), chain: [...document.querySelectorAll('#chain li.on')].map(li => plain(li.querySelector('.lx'))),
        lit: [...document.querySelectorAll('#player .rules b.lit')].map(b => b.textContent).join(''), player: shown($('player')),
        hide: $('hide') ? $('hide').getAttribute('aria-checked') : null, live: $('live') ? $('live').textContent : '',
        focus: document.activeElement === document.body, vw: innerWidth, vh: innerHeight, theme: document.documentElement.getAttribute('data-b21-theme')
      };
    }).catch(e => ({ error: String(e).slice(0, 200), panels: [], order: [], keys: [], hist: [], chain: [] }));
    const NAME = { '+': 'add', '−': 'subtract', '-': 'subtract', '×': 'multiply', '÷': 'divide', '=': 'equals', '.': 'point', '(': 'open', ')': 'close', '%': 'percent', '√': 'sqrt', '±': 'negate', '⌫': 'backspace', π: 'pi' };
    // keys: a string of one-character keys ('5+5='), or an array of key names (['clear', 'ans']).
    // (Windows overlap: the one tapped is brought to the front first, as a teacher's tap would.)
    const front = ik => page.evaluate(ik => { if (window.__board21.state.focused !== ik) window.__board21.focusWin(ik); }, ik);
    const press = async (keys, ik = 'calculator:1') => {
      await front(ik);
      for (const k of typeof keys === 'string' ? Array.from(keys).map(c => NAME[c] || c) : keys) await W(ik).locator(`#keys .key[data-key="${k}"]`).click({ timeout: 3000 });
      await page.waitForTimeout(120);
    };
    // text typed on the keyboard, as in Desmos (% is an Advanced key: the keyboard has it whether they show or not)
    const type = async (text, ik = 'calculator:1') => { await front(ik); await W(ik).locator('#app').click({ position: { x: 3, y: 3 } }); await page.keyboard.type(text); await page.waitForTimeout(200); };
    const choose = async (label, ik = 'calculator:1') => {
      await front(ik);
      await page.click(`.win[data-ikey="${ik}"] .win-label`);
      await page.locator('#menu [data-act="widget"]').filter({ has: page.locator('.label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click({ timeout: 3000 });
      await page.waitForTimeout(500);
    };
    const menu = (ik = 'calculator:1') => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return w ? w.menuItems.map(i => i.separator ? '—' : i.heading ? `[${i.label}]` : (i.disabled ? '(off) ' : '') + (i.checked ? '✓ ' : '') + i.label).join(' | ') : null; }, ik);
    const data = (ik = 'calculator:1') => page.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
    const conf = (ik = 'calculator:1') => page.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
    const near = (a, b, d = 3) => Math.abs(a - b) <= d;
    const panel = (L, n) => L.panels.find(p => p.n === n) || { x: 0, y: 0, w: 0, h: 0 };
    // A tap on the empty board, so no window is in front (true when it worked); a tap held 120 ms, as a finger holds it.
    const away = async () => {
      const at = await page.evaluate(() => { for (let y = innerHeight - 30; y > 40; y -= 24) for (let x = 30; x < innerWidth - 30; x += 24) { const e = document.elementFromPoint(x, y); if (e && e.closest('#desk') && !e.closest('.win, button')) return [x, y]; } return null; });
      if (at) await page.mouse.click(at[0], at[1]);
      await page.waitForTimeout(400);
      return !!at && await page.evaluate(() => window.__board21.state.focused === null);
    };
    const held = async (sel, ik = 'calculator:1') => {
      const b = await W(ik).locator(sel).first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
      await page.waitForTimeout(300);
    };
    const rect0 = () => page.evaluate(() => window.__board21.state.insts.get('calculator:1').rect);
    const setSize = (w, h) => page.evaluate(([w, h]) => window.__board21.setRect('calculator:1', Object.assign({}, window.__board21.state.insts.get('calculator:1').rect, { w, h: h + 40 })), [w, h]).then(() => page.waitForTimeout(600));
    const BASIC = 'clear,backspace,negate,open,close,sqrt,divide,7,8,9,multiply,4,5,6,subtract,1,2,3,add,0,point,ans,equals';
    const ADV = ['square', 'power', 'root', 'cbrt', 'pi', 'percent', 'fraction', 'right'];
    const sorted = s => String(s).split(',').sort().join();

    // ---- The registry and the Widget Picker
    const reg = await page.evaluate(() => { const a = window.__board21.catalog().find(w => w.id === 'calculator'); return a && { name: a.name, version: a.version, entry: a.entry, files: a.files, clash: a.clash, permissions: a.permissions, win: a.win, color: a.color, icon: a.icon, external: !!a.external, single: !!a.single, description: a.description }; });
    ok(!!reg && reg.name === 'Calculator' && reg.version === '1.0.0' && reg.entry === 'widgets/calculator/index.html' && JSON.stringify(reg.files) === '["widgets/calculator/index.html","widgets/calculator/calc-engine.js","widgets/calculator/fonts/InterItalic-21Board.woff2","widgets/calculator/fonts/Inter-OFL.txt"]' &&
      reg.clash === 'later' && reg.permissions.length === 0 && !reg.external && !reg.single && reg.win.width === 900 && reg.win.height === 600 && reg.win.minWidth === 280 && reg.win.minHeight === 400 && !reg.win.aspectRatio && reg.win.dragFromContent !== false,
      `it is in the registry as Calculator (id calculator): its page, engine, and font, clash 'later', 900 × 600, at least 280 × 400, no shape lock (${JSON.stringify(reg && reg.win)}, ${reg && reg.clash})`);
    ok(!!reg && reg.description === 'Work out problems and show each step.' && /<title>Calculator<\/title>/.test(src), `its description and page title (${reg && reg.description})`);
    const mf = /<script type="application\/json" id="board21-widget">([\s\S]*?)<\/script>/.exec(src), manifest = mf ? JSON.parse(mf[1]) : {};
    ok(!!reg && manifest.id === 'calculator' && manifest.name === reg.name && manifest.version === reg.version && ['width', 'height', 'minWidth', 'minHeight'].every(k => (manifest.window || {})[k] === reg.win[k]), 'its manifest block matches the registry entry');
    const others = await page.evaluate(() => window.__board21.catalog().filter(w => w.id !== 'calculator').map(w => String(w.color || '').toLowerCase()));
    ok(!!reg && /^<svg viewBox="0 0 24 24">/.test(reg.icon) && contrast('rgb(255, 255, 255)', rgbOf(reg.color)) >= 3 && !others.includes(String(reg.color).toLowerCase()), `its tile is a color of its own (${reg && reg.color}), the white icon readable on it (${reg && contrast('rgb(255, 255, 255)', rgbOf(reg.color)).toFixed(2)}:1, at least 3:1 for an icon)`);
    await page.click('.picker-btn.left'); await page.waitForTimeout(250);
    const tile = page.locator('[data-widget="calculator"]');
    ok(await tile.count() === 1 && (await tile.innerText()).trim() === 'Calculator', 'the Widget Picker has a Calculator tile');
    if (await tile.count()) await tile.click(); else await page.keyboard.press('Escape');
    ok(await eventually(() => page.evaluate(() => { const w = window.__board21.state.wins.get('calculator:1'); return !!w && w.connected; })), 'tapping it opens a window, which connects');
    await page.waitForTimeout(600);

    // ---- A new window: 900 × 600, the canvas on the left of the keys, History hidden, Desmos's basic keys and Teach's
    let c = await contentOf(page, 'calculator:1'), L = await look();
    ok(c.w === 900 && c.h === 600, `a new window opens at 900 × 600 (${c.w} × ${c.h})`);
    ok(L.layout === 'side' && L.order.join() === 'canvas,keys' && !L.panels.some(p => p.n === 'history'), `the canvas on the left, the keys on the right, History hidden (${L.layout}: ${L.order.join(', ')})`);
    ok(sorted(L.keys) === sorted(BASIC) && L.keys.length === 23, `the basic keys: Teach’s AC, ⌫, ±, ÷ × − + = down the right, 0 . ans, plus ( ) √ (${L.keys.join(' ')})`);
    const opCol = await W().locator('html').evaluate(() => ['divide', 'multiply', 'subtract', 'add', 'equals'].map(k => document.querySelector(`#keys .key[data-key="${k}"]`).getBoundingClientRect()).map(r => [Math.round(r.right), Math.round(r.top)]));
    const rightEdge = await W().locator('#keys').evaluate(e => Math.round(e.getBoundingClientRect().right));
    ok(opCol.every(([r]) => Math.abs(r - rightEdge) <= 1) && opCol.every((p, i) => !i || p[1] > opCol[i - 1][1]), `÷ × − + = run down the right edge of the keys, in that order (${JSON.stringify(opCol)})`);
    ok(L.keyMin >= 44, `every key is 44 px or larger (${L.keyMin.toFixed(1)})`);
    ok(L.player && /Next step/.test(L.next) && L.hide === 'false', `Steps show inside the canvas, with Next step, and the Hide the answer switch is off (${L.next})`);
    ok(L.focus, 'nothing in it takes the focus by itself');
    const MENU0 = '[Show] | ✓ Canvas | History | ✓ Steps | In words | Swap sides | — | [Answers] | ✓ As decimals | As fractions | With remainders | — | Advanced keys | Hide the answer | — | (off) Clear history';
    let mtext = await menu();
    ok(mtext === MENU0, `its window menu (${mtext})`);
    // Hide the answer's picture is the hidden answer: a rounded square with a dashed outline and a ? inside, drawn as the
    // menu's other pictures are.
    await page.click('.win[data-ikey="calculator:1"] .win-label'); await page.waitForTimeout(250);
    const pic = await page.evaluate(() => {
      const s = document.querySelector('#menu [data-act="widget"][data-id="hide"] .icon-slot svg'), r = s && s.querySelector('rect');
      if (!r) return null;
      const b = r.getBBox(), cs = getComputedStyle(r), inner = Array.from(s.children).filter(e => e !== r).map(e => e.getBBox());
      const trash = getComputedStyle(document.querySelector('#menu [data-id="clear-history"] .icon-slot svg path')), PROPS = ['stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'fill'];
      return { box: s.getAttribute('viewBox'), square: b.width === b.height, round: +r.getAttribute('rx') > 0, dashed: cs.strokeDasharray !== 'none',
        q: inner.length > 0 && inner.every(q => q.x > b.x && q.y > b.y && q.x + q.width < b.x + b.width && q.y + q.height < b.y + b.height),
        same: Array.from(s.children).every(e => { const c = getComputedStyle(e); return PROPS.every(p => c[p] === trash[p]); }) };
    });
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(!!pic && pic.box === '0 0 24 24' && pic.square && pic.round && pic.dashed && pic.q && pic.same, `Hide the answer’s picture: a rounded square, dashed, with the ? inside it, drawn as Clear history’s is (${JSON.stringify(pic)})`);
    ok(!/digit|group|comma|separat/i.test(mtext || 'digit'), 'no digit-group item in the menu');

    // ---- = = = counts by 5s, and each = adds its line to History
    await press('5+5=');
    L = await look();
    ok(L.eqLabel === '5 plus 5 equals 10' && L.eq === '5 + 5 = 10', `5 + 5 = shows 5 + 5 = 10 on the canvas (${L.eq})`);
    await press('=='); L = await look();
    ok(L.eqLabel === '15 plus 5 equals 20', `= = again counts on by 5s: 15 + 5 = 20 (${L.eqLabel})`);
    await choose('History'); await page.waitForTimeout(400);
    let c2 = await contentOf(page, 'calculator:1'), L2 = await look();
    const H = panel(L2, 'history'), K = panel(L2, 'keys'), Cv = panel(L2, 'canvas'), K0 = panel(L, 'keys'), Cv0 = panel(L, 'canvas');
    ok(L2.order.join() === 'canvas,keys,history', `History opens on the right of the keys (${L2.order.join(', ')})`);
    ok(near(c2.w - c.w, H.x + H.w - (K.x + K.w), 4) && c2.h === c.h && near(Cv.w, Cv0.w, 4) && near(K.w, K0.w, 4) && H.w >= 220,
      `turning History on widens the window by History’s width; the canvas and keys keep theirs (${c.w} → ${c2.w}; History ${H.w}, canvas ${Cv0.w} → ${Cv.w}, keys ${K0.w} → ${K.w})`);
    ok(JSON.stringify(L2.hist.map(h => h.expr + ' = ' + h.ans)) === JSON.stringify(['5 + 5 = 10', '10 + 5 = 15', '15 + 5 = 20']),
      `History: one line per problem, as the canvas writes it, oldest at the top, newest at the bottom (${L2.hist.map(h => h.expr + ' | ' + h.ans).join(' / ')})`);
    const hl = await W().locator('#history').evaluate(h => { const ls = [...h.querySelectorAll('.hline')], a = ls[0] && ls[0].querySelector('.hans'), cs = e => getComputedStyle(e);
      return ls.length ? { border: cs(ls[0]).borderBottomStyle, ansBg: cs(a).backgroundColor, bg: cs(document.body).backgroundColor, ansRight: Math.round(a.getBoundingClientRect().right), lineRight: Math.round(ls[0].getBoundingClientRect().right), pickLeft: Math.round(ls[0].querySelector('.hpick').getBoundingClientRect().left), lineLeft: Math.round(ls[0].getBoundingClientRect().left) } : null; });
    ok(!!hl && hl.border !== 'none' && hl.ansBg !== hl.bg && hl.lineRight - hl.ansRight < 24 && hl.pickLeft - hl.lineLeft < 40,
      `its lines look like Desmos’s: a rule under each, the problem on the left, its answer in a soft box on the right (${JSON.stringify(hl)})`);
    ok(/^(Change|Edit) 5 \+ 5$/.test(L2.hist[0] && L2.hist[0].pick) && /^Use 10$/.test(L2.hist[0] && L2.hist[0].use), `a screen reader hears what each tap does (${L2.hist[0] && L2.hist[0].pick} / ${L2.hist[0] && L2.hist[0].use})`);
    mtext = await menu();
    ok(/✓ History/.test(mtext) && /\| Clear history$/.test(mtext), `the menu shows History ticked, and Clear history ready (${mtext})`);
    // Tap a line to change it; tap an answer to use it.
    await W().locator('#history .hline').first().locator('.hpick').click(); await page.waitForTimeout(200);
    L = await look();
    ok(L.cursor && /^5 \+ 5( = 10)?$/.test(L.eq), `tapping a line puts its problem on the canvas to change (${L.eq})`);
    await press(['backspace', '7', 'equals']); L = await look();
    ok(L.eqLabel === '5 plus 7 equals 12' && L.hist.length === 4 && L.hist[3].expr === '5 + 7' && L.hist[3].ans === '12', `changed and worked out, it is a new line at the bottom (${L.hist.map(h => h.expr).join(' / ')})`);
    await press(['clear']); await W().locator('#history .hline').first().locator('.hans').click(); await press('×2=');
    L = await look();
    ok(L.eqLabel === '10 times 2 equals 20', `tapping an answer uses it in the problem: 10 × 2 = 20 (${L.eqLabel})`);
    // A long problem is drawn smaller to fit its line, never cut without a sign.
    await press(['clear']); await press('(125+375)×12−1500÷25=');
    const lastLine = () => W().locator('#history').evaluate(h => { const p = [...h.querySelectorAll('.hline .hpick')].pop(); return p ? { fits: p.scrollWidth <= p.clientWidth + 1, clip: p.classList.contains('clip'), need: p.scrollWidth, room: p.clientWidth, text: p.textContent.replace(/\s+/g, ' ').trim() } : {}; });
    let ll = await lastLine();
    ok(ll.fits && !ll.clip && ll.text === '(125 + 375) × 12 − 1,500 ÷ 25', `a long problem is drawn smaller to fit its line in History (${ll.text}: ${ll.need} px in ${ll.room})`);
    // History off gives the width back.
    await choose('History'); c2 = await contentOf(page, 'calculator:1'); L = await look();
    ok(c2.w === c.w && !L.panels.some(p => p.n === 'history'), `turning History off gives the width back (${c2.w})`);
    // Where the board has no room for all of History, turning it off still gives back the width the window had.
    const r0 = await rect0();
    await page.evaluate(() => window.__board21.setRect('calculator:1', Object.assign({}, window.__board21.state.insts.get('calculator:1').rect, { x: 0, w: 1200 }))); await page.waitForTimeout(600);
    const cw0 = await contentOf(page, 'calculator:1');
    await choose('History'); const cw1 = await contentOf(page, 'calculator:1');
    await choose('History'); const cw2 = await contentOf(page, 'calculator:1');
    ok(cw0.w === 1200 && cw1.w > 1200 && cw1.w < 1200 + 360 && cw2.w === 1200 && cw2.h === cw0.h, `on a board without room for all of History, it widens as far as it can, and gives back exactly that (${cw0.w} → ${cw1.w} → ${cw2.w})`);
    // A narrower window: History narrows so the canvas and its steps stay beside the keys.
    await choose('History'); await setSize(960, 600); L = await look();
    ok(L.layout === 'side' && L.order.join() === 'canvas,keys,history' && L.player && panel(L, 'history').w >= 200, `History in a 960 × 600 window: it narrows, and the canvas and its steps stay beside the keys (${L.layout}: ${L.order.join(', ')}; History ${panel(L, 'history').w})`);
    await choose('History');
    await page.evaluate(r => window.__board21.setRect('calculator:1', r), r0); await page.waitForTimeout(600);

    // ---- Percent: Desmos's "% of" by default; Desmos % unchecked (under Advanced keys) is iPhone's 50 + 10% = 55
    await press(['clear']); await type('10%50='); L = await look();
    ok(L.eq === '10% of 50 = 5', `10% of 50 = 5, as Desmos (${L.eq})`);
    await choose('Advanced keys'); await choose('Desmos %');
    await press(['clear']); await type('50+10%='); L = await look();
    ok(L.eq === '50 + 10% = 55' && ((await conf()) || {}).percent === 'apple' && /\| ✓ Advanced keys \| Desmos % \|/.test(await menu()), `with Desmos % unchecked: 50 + 10% = 55, saved as a setting (${L.eq}, ${JSON.stringify(await conf())})`);
    const pctName = () => W().locator('#keys .key[data-key="percent"]').getAttribute('aria-label');
    ok(await pctName() === 'percent', `a screen reader calls the % key “percent” then (${await pctName()})`);
    await choose('Desmos %');
    await press(['clear']); await type('50+10%5='); L = await look();
    ok(L.eq === '50 + 10% of 5 = 50.5' && ((await conf()) || {}).percent === 'of' && await pctName() === 'percent of', `check it again: Desmos’s % of again, and the key is “percent of” (${L.eq})`);
    await choose('Advanced keys');

    // ---- Digit groups: a faint comma, its own element; a plain comma wherever it is read
    await press(['clear']); await press('1234567');
    const sep = await W().locator('html').evaluate(() => {
      const eq = document.getElementById('eq'), s = [...eq.querySelectorAll('.ce-sep')], num = eq.querySelector('.ce-num'), cs = e => getComputedStyle(e);
      const bg = cs(document.getElementById('card')).backgroundColor, card = document.getElementById('card');
      const probe = document.createElement('span'); probe.style.color = 'var(--b21-muted)'; document.body.append(probe); const muted = cs(probe).color; probe.remove();
      return { n: s.length, text: s.map(x => x.textContent).join(''), color: s[0] ? cs(s[0]).color : '', opacity: s[0] ? +cs(s[0]).opacity : 1, muted, digit: num ? cs(num).color : '', bg, label: (eq.querySelector('.ce-math') || { getAttribute: () => '' }).getAttribute('aria-label'), whole: eq.textContent.replace(/\s+/g, '') };
    });
    ok(sep.n === 2 && sep.text === ',,' && sep.whole.startsWith('1,234,567'), `1,234,567: each comma is its own element (${sep.n}, ${sep.whole})`);
    ok(sep.color === sep.muted && sep.opacity < 1 && sep.opacity >= 0.3, `drawn in the board’s muted color, softened (${sep.color}, opacity ${sep.opacity})`);
    ok(/1,234,567/.test(sep.label) && !/ce-sep/.test(sep.label), `a screen reader hears a plain comma (${sep.label})`);
    await press('+1='); await choose('History');
    L = await look();
    const hsep = await W().locator('#history').evaluate(h => ({ n: h.querySelectorAll('.ce-sep').length, labels: [...h.querySelectorAll('button')].map(b => b.getAttribute('aria-label')).filter(t => /1,234/.test(t)) }));
    ok(hsep.n >= 4 && hsep.labels.length >= 2 && hsep.labels.every(t => !/<|ce-sep/.test(t)), `History draws them faint too, and its buttons’ names have plain commas (${hsep.n}; ${hsep.labels.join(' / ')})`);
    await choose('History');

    // ---- Advanced keys: off at first, a² aᵇ ⁿ√ ∛ π % a/b → when on, remembered per window
    await choose('Advanced keys'); L = await look();
    ok(sorted(L.keys) === sorted(BASIC + ',' + ADV.join()) && L.keyMin >= 44 && ((await conf()) || {}).advanced === true, `Advanced keys add a² aᵇ ⁿ√ ∛ π % a/b →, every key still 44 px or more (${L.keys.length} keys, ${L.keyMin.toFixed(1)} px)`);
    await press(['clear', '3', 'square', 'equals']); L = await look();
    ok(L.eqLabel === '3 squared equals 9' || /^3\s?2 = 9$/.test(L.eq), `a² works (${L.eq})`);
    const ik2 = await addWin(page, 'calculator'); await page.waitForTimeout(500);
    let L2b = await look(ik2);
    ok(ik2 === 'calculator:2' && sorted(L2b.keys) === sorted(BASIC), `a second Calculator window starts with Advanced keys off (${ik2}: ${L2b.keys.length} keys)`);

    await choose('Advanced keys');

    // ---- Steps, as in Teach: Next step, Back, Show all, and a clicker's Page Down and Page Up
    await press(['clear']); await press('2+3×4='); L = await look();
    ok(L.eq === '2 + 3 × 4 = 14', `2 + 3 × 4 = 14 (${L.eq})`);
    await W().locator('#next').click(); await page.waitForTimeout(250); L = await look();
    ok(L.count === 'Step 1 of 3' && L.lit === '× ÷' && L.chain.join(' | ') === '2 + 3 × 4', `Next step: step 1 of 3, × first, × ÷ lit (${L.count}, ${L.lit}, ${L.chain.join(' | ')})`);
    await W().locator('#app').click({ position: { x: 3, y: 3 } }); await page.keyboard.press('PageDown'); await page.waitForTimeout(250); L = await look();
    ok(L.count === 'Step 2 of 3' && L.chain.join(' | ') === '2 + 3 × 4 | 2 + 12', `a clicker’s Page Down goes on (${L.count}: ${L.chain.join(' | ')})`);
    await page.keyboard.press('PageUp'); await page.waitForTimeout(250); L = await look();
    ok(L.count === 'Step 1 of 3', `Page Up goes back (${L.count})`);
    await W().locator('#all').click(); await page.waitForTimeout(250); L = await look();
    ok(L.count === 'Step 3 of 3' && L.chain.join(' | ') === '2 + 3 × 4 | 2 + 12 | 14' && /Replay/.test(L.next), `Show all writes every step out, the answer last (${L.chain.join(' | ')}; ${L.next})`);
    await W().locator('#back').click(); await page.waitForTimeout(200);
    ok((await look()).count === 'Step 2 of 3', 'Back goes one step back');
    await choose('Steps'); L = await look();
    ok(!L.player && ((await conf()) || {}).steps === false, 'Steps off: no step buttons');
    await choose('Steps');

    // ---- In words, from Lines: under the canvas's problem
    await choose('In words'); await press(['clear']); await press('2+3×4='); L = await look();
    ok(L.said === '2 plus 3 times 4 equals 14' && ((await conf()) || {}).words === true, `In words: “${L.said}” under the problem`);
    await press(['clear']); await press('1234×2'); L = await look();
    const saidSep = await W().locator('#said').evaluate(e => e.querySelectorAll('.ce-sep').length).catch(() => -1);
    ok(L.said === '1,234 times 2 equals 2,468' && saidSep === 2, `while typing it says the live answer too, its digits grouped with faint commas (${L.said}, ${saidSep})`);
    await choose('In words');

    // ---- Hide the answer, from Teach: the class predicts, then taps to see
    await choose('Hide the answer'); await choose('History');
    await press(['clear']); await press('7×8='); L = await look();
    ok(L.reveal && !/56/.test(L.eq) && L.hide === 'true' && L.hist.length && L.hist[L.hist.length - 1].ans === '?', `7 × 8 = ?: the answer is hidden on the canvas and in History (${L.eq}; ${L.hist.length && L.hist[L.hist.length - 1].ans})`);
    const off1 = await away(); await held('#eq .reveal'); L = await look();
    ok(off1 && L.eq === '7 × 8 = 56' && L.hist[L.hist.length - 1].ans === '56', `a tap shows it, the first tap on a window not in front too, held as a finger holds it (${L.eq})`);
    await W().locator('#hide').click(); await page.waitForTimeout(200);
    ok((await look()).hide === 'false' && ((await conf()) || {}).hide === false && /\| Hide the answer \|/.test(await menu()), 'the switch on the canvas turns it off, and the menu follows');
    // History keeps its place when the window goes to the back, and a first tap on a line, held, loads that line.
    await press(['clear']); await press('1+1============');
    await W().locator('#hlist').evaluate(e => { e.scrollTop = 0; });
    const st0 = await W().locator('#hlist').evaluate(e => ({ top: e.scrollTop, scrolls: e.scrollHeight > e.clientHeight + 20 }));
    const off2 = await away(), st1 = await W().locator('#hlist').evaluate(e => e.scrollTop);
    ok(off2 && st0.scrolls && st0.top === 0 && st1 === 0, `History stays where it was scrolled when its window goes to the back (${st0.top} → ${st1})`);
    const first = (await look()).hist[0].expr;
    await held('#history .hline:first-child .hpick'); L = await look();
    ok(L.cursor && (L.eq === first || L.eq.startsWith(first + ' = ')), `a first tap on a line, held, loads that line (${first}: ${L.eq})`);
    await press(['equals']);
    ok(await W().locator('#hlist').evaluate(e => e.scrollTop + e.clientHeight >= e.scrollHeight - 2), 'a new line scrolls History to the bottom');
    await choose('History');

    // ---- Answers: As decimals first; ⇄ switches one; As fractions flips the window
    await press(['clear']); await press('1÷8='); L = await look();
    ok(L.eq === '1 ÷ 8 = 0.125' && L.toggle, `answers start as decimals, with ⇄ beside them (${L.eq})`);
    await W().locator('#eqToggle').click(); await page.waitForTimeout(200); L = await look();
    ok(L.frac && /1\s?8$/.test(L.eq.replace(/\s/g, ' ').trim()), `⇄ shows that answer as a fraction (${L.eq})`);
    await choose('As fractions'); await press(['clear']); await press('3÷4='); L = await look();
    ok(L.frac && ((await conf()) || {}).fractions === true && ((await conf()) || {}).answers === 'fraction', `As fractions: new answers start as fractions (${L.eq})`);
    await W().locator('#eqToggle').click(); await page.waitForTimeout(200); L = await look();
    ok(L.eq === '3 ÷ 4 = 0.75', `and ⇄ shows one as a decimal (${L.eq})`);
    await choose('As decimals');

    // ---- The keyboard: digits, + - * / ^ % ( ) ., Enter or =, Backspace, sqrt, pi, ans
    await press(['clear']); await W().locator('#app').click({ position: { x: 3, y: 3 } });
    await page.keyboard.type('2+3*4'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    ok((await look()).eq === '2 + 3 × 4 = 14', 'typed: 2+3*4 Enter');
    await page.keyboard.type('(1+2)^2='); await page.waitForTimeout(200);
    ok((await look()).eqLabel === '(1 plus 2) squared equals 9' || /^\(1 \+ 2\)\s?2 = 9$/.test((await look()).eq), `typed: (1+2)^2= (${(await look()).eq})`);
    await page.keyboard.type('sqrt16'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    ok((await look()).eq === '√16 = 4', `typed: sqrt16 Enter (${(await look()).eq})`);
    await page.keyboard.type('12/4'); await page.keyboard.press('Backspace'); await page.keyboard.type('3='); await page.waitForTimeout(200);
    ok((await look()).eq === '12 ÷ 3 = 4', `typed: / is ÷, and Backspace (${(await look()).eq})`);
    await page.keyboard.type('2pi'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    ok(/^2π = 6\.283185307$/.test((await look()).eq), `typed: 2pi (${(await look()).eq})`);
    await page.keyboard.type('ans*2='); await page.waitForTimeout(200);
    ok((await look()).eqLabel === '6.283185307 times 2 equals 12.56637061', `typed: ans (${(await look()).eqLabel})`);
    await page.keyboard.type('1,500*3='); await page.waitForTimeout(200);
    ok((await look()).eq === '1,500 × 3 = 4,500', `typed: 1,500*3= is 1,500 × 3, as drawn (${(await look()).eq})`);
    await page.keyboard.type('50%'); await page.keyboard.type('8='); await page.waitForTimeout(200);
    ok((await look()).eq === '50% of 8 = 4', `typed: % (${(await look()).eq})`);

    // ---- Canvas off: a compact display above the keys, as on a phone, and the width given back; Swap sides
    c = await contentOf(page, 'calculator:1'); const before = await look();
    await choose('Canvas'); c2 = await contentOf(page, 'calculator:1'); L = await look();
    const cv = panel(before, 'canvas'), kk = panel(before, 'keys');
    ok(L.order.join() === 'display' || (L.panels.some(p => p.n === 'display') && !L.panels.some(p => p.n === 'canvas')), `Canvas off: a compact display shows above the keys (${L.panels.map(p => p.n).join(', ')})`);
    const D = panel(L, 'display'), KK = panel(L, 'keys');
    ok(D.y + D.h <= KK.y + 1 && near(c.w - c2.w, kk.x - cv.x, 4), `the display is above the keys, and the window gives the canvas’s width back (${c.w} → ${c2.w}, canvas and gap ${Math.round(kk.x - cv.x)})`);
    ok(L.big === '4' && /50% of 8/.test(L.x), `it shows the problem small and the answer big (${L.x} / ${L.big})`);
    mtext = await menu();
    ok(/\| Canvas \|/.test(mtext) && /\(off\) ✓ Steps/.test(mtext) && /\(off\) In words/.test(mtext), `Steps and In words wait for the canvas (${mtext})`);
    await choose('Canvas'); c2 = await contentOf(page, 'calculator:1');
    ok(near(c2.w, c.w, 2) && (await look()).order.join() === 'canvas,keys', `Canvas on again: the width comes back (${c2.w})`);
    await choose('History'); await choose('Swap sides'); L = await look();
    ok(L.order.join() === 'history,keys,canvas' && ((await conf()) || {}).swap === true, `Swap sides mirrors the row: History, keys, canvas (${L.order.join(', ')})`);
    await choose('Swap sides'); await choose('History');

    // ---- Saved: content is the problem and History, config every setting; kept after a reload, apart between windows
    await choose('Advanced keys'); await choose('History'); await choose('Desmos %');
    await press(['clear']); await press('6×7=');
    const d1 = await data(), f1 = await conf();
    ok(!!d1 && d1.v === 2 && Array.isArray(d1.expr) && d1.mode === 'done' && Array.isArray(d1.history) && d1.history.length >= 5, `content is the engine’s saved problem and History (${JSON.stringify(d1).slice(0, 120)}…)`);
    ok(!!f1 && f1.canvas === true && f1.history === true && f1.steps === true && f1.words === false && f1.advanced === true && f1.hide === false && f1.answers === 'decimal' && f1.fractions === false && f1.test === false && f1.percent === 'apple' && f1.swap === false,
      `config is every menu setting and which panels show (${JSON.stringify(f1)})`);
    await press('1+1=', ik2);
    const histLen = (await look()).hist.length;
    await page.waitForTimeout(1200);
    await page.reload(); await boardUp(page); await page.waitForTimeout(1500);
    L = await look(); L2b = await look(ik2);
    ok(L.eq === '6 × 7 = 42' && L.hist.length === histLen && sorted(L.keys) === sorted(BASIC + ',' + ADV.join()) && L.order.join() === 'canvas,keys,history' && /\| ✓ Advanced keys \| Desmos % \|/.test(await menu()),
      `after a reload: the same problem, History, keys and settings (${L.eq}; ${L.hist.length} lines; ${L.keys.length} keys)`);
    ok(L2b.eq === '1 + 1 = 2' && sorted(L2b.keys) === sorted(BASIC) && L2b.hist.length === 0 && ((await conf(ik2)) || {}).percent !== 'apple', `the second window kept its own (${L2b.eq}; ${L2b.keys.length} keys)`);

    // ---- Reset: back to a new window
    await front('calculator:1');
    await page.click('.win[data-ikey="calculator:1"] .win-label'); await page.locator('#menu [data-act="reset"]').click(); await page.locator('#menu [data-act="reset-yes"]').click();
    await page.waitForTimeout(1500);
    c = await contentOf(page, 'calculator:1'); L = await look();
    ok(c.w === 900 && c.h === 600 && !(await data()) && !(await conf()) && L.order.join() === 'canvas,keys' && sorted(L.keys) === sorted(BASIC) && L.eq === '0' && !L.hist.length,
      `Reset: 900 × 600, nothing saved, canvas and keys, the basic keys, an empty problem (${c.w} × ${c.h}; ${L.order.join(', ')}; ${L.eq})`);
    ok(await menu() === MENU0, 'and its menu as new');

    // ---- Light and dark: readable, and the commas quieter than the digits but still there
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(500);
      await press(['clear']); await press('1234567+1=');
      const col = await W().locator('html').evaluate(() => {
        // (Any CSS color, color-mix() included, as rgb(): drawn on a canvas and read back.)
        const g2 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgb = c => { g2.clearRect(0, 0, 1, 1); g2.fillStyle = '#000'; g2.fillStyle = c; g2.fillRect(0, 0, 1, 1); const d = g2.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; };
        const cs = e => { const c = getComputedStyle(e); return { color: rgb(c.color), backgroundColor: c.backgroundColor === 'rgba(0, 0, 0, 0)' ? c.backgroundColor : rgb(c.backgroundColor), opacity: c.opacity }; }, $ = s => document.querySelector(s), solid = e => { let n = e; while (n) { const b = cs(n).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; n = n.parentElement; } return cs(document.body).backgroundColor; };
        const mix = (fg, bg, a) => { const f = fg.match(/[\d.]+/g).map(Number), b = bg.match(/[\d.]+/g).map(Number); return `rgb(${[0, 1, 2].map(i => Math.round(f[i] * a + b[i] * (1 - a))).join(', ')})`; };
        const sepEl = $('#eq .ce-sep'), dig = $('#eq .ce-num');
        const pair = (e, bg) => [cs(e).color, bg || solid(e)];
        return { theme: document.documentElement.getAttribute('data-b21-theme'), digit: pair(dig), sep: sepEl ? [mix(cs(sepEl).color, solid(sepEl), +cs(sepEl).opacity), solid(sepEl)] : ['rgb(0, 0, 0)', 'rgb(0, 0, 0)'],
          num: pair($('#keys .key[data-key="7"]'), cs($('#keys .key[data-key="7"]')).backgroundColor), op: pair($('#keys .key[data-key="add"]'), cs($('#keys .key[data-key="add"]')).backgroundColor),
          fn: pair($('#keys .key[data-key="clear"]'), cs($('#keys .key[data-key="clear"]')).backgroundColor), next: pair($('#next'), cs($('#next')).backgroundColor), sw: pair($('#hide')) };
      });
      const r = k => contrast(col[k][0], col[k][1]);
      ok(col.theme === scheme && ['digit', 'num', 'op', 'fn', 'next', 'sw'].every(k => r(k) >= 4.5), `${scheme}: the canvas, the keys and the buttons are readable, 4.5:1 or more (${['digit', 'num', 'op', 'fn', 'next', 'sw'].map(k => k + ' ' + r(k).toFixed(1)).join(', ')})`);
      // The commas: in the canvas, in History's answer box, and in the compact display with the canvas off.
      const sepsIn = places => W().locator('html').evaluate((html, places) => {
        const g2 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgb = c => { g2.clearRect(0, 0, 1, 1); g2.fillStyle = '#000'; g2.fillStyle = c; g2.fillRect(0, 0, 1, 1); const d = g2.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; };
        const cs = e => getComputedStyle(e), clear = b => /rgba\(0, 0, 0, 0\)|transparent/.test(b);
        const solid = e => { for (let n = e; n; n = n.parentElement) { const b = cs(n).backgroundColor; if (b && !clear(b)) return rgb(b); } return rgb(cs(document.body).backgroundColor); };
        const mix = (fg, bg, a) => { const f = fg.match(/[\d.]+/g).map(Number), b = bg.match(/[\d.]+/g).map(Number); return `rgb(${[0, 1, 2].map(i => Math.round(f[i] * a + b[i] * (1 - a))).join(', ')})`; };
        const out = {};
        for (const [name, sel] of Object.entries(places)) {
          const sp = document.querySelector(sel + ' .ce-sep'), dg = document.querySelector(sel + ' .ce-num');
          out[name] = sp && dg && sp.getClientRects().length ? { sep: [mix(rgb(cs(sp).color), solid(sp), +cs(sp).opacity), solid(sp)], digit: [rgb(cs(dg).color), solid(dg)] } : null;
        }
        return out;
      }, places);
      const want = ['canvas', 'History', 'compact display'];
      await choose('History');
      const sp = await sepsIn({ canvas: '#eq', History: '#history .hline:last-child .hans' });
      await choose('Canvas'); Object.assign(sp, await sepsIn({ 'compact display': '#big' })); await choose('Canvas'); await choose('History');
      for (const place of want) {
        const v = sp[place], rs = v ? contrast(v.sep[0], v.sep[1]) : 0, rd = v ? contrast(v.digit[0], v.digit[1]) : 0;
        ok(!!v && rs >= 2 && rs < rd - 1, `${scheme}: the faint commas in the ${place} are still seen, 2:1 or more, and quieter than its digits (${rs.toFixed(2)} against ${rd.toFixed(2)})`);
      }
      await page.screenshot({ path: OUT + `calculator-${scheme}.png` });
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // ---- The letters (a, b, n, x, and "of") in Inter Italic, the keys and the canvas in Inter
    {
      const adv = /✓ Advanced keys/.test(await menu()), apple = ((await conf()) || {}).percent === 'apple';
      if (!adv) await choose('Advanced keys');
      if (apple) await choose('Desmos %');
      await press(['clear']); await type('50%8='); L = await look();
      const it = await W().locator('html').evaluate(() => {
        const cs = e => getComputedStyle(e), t = document.createElement('span'); t.style.fontFamily = 'var(--b21-font)'; document.body.append(t); const want = cs(t).fontFamily; t.remove();
        const els = { key: document.querySelector('.key i'), rules: document.querySelector('.rules i'), of: document.querySelector('#eq .ce-word') };
        return { want, letters: Object.entries(els).map(([k, e]) => e ? `${k} ${cs(e).fontFamily.split(',')[0]} ${cs(e).fontStyle}` : `${k} none`),
          inter: [document.body, document.querySelector('#keys .key'), document.getElementById('eq')].every(e => cs(e).fontFamily === want) };
      });
      ok(/ of /.test(L.eq) && it.letters.every(x => /^\w+ "Inter Letters" italic$/.test(x)), `the keys’ letters, the rule strip’s, and the answer’s “of” are in Inter Letters, italic (${L.eq}; ${it.letters.join(', ')})`);
      ok(await eventually(() => W().locator('html').evaluate(() => Array.from(document.fonts).some(f => f.family.replace(/"/g, '') === 'Inter Letters' && f.status === 'loaded'))), 'and the frame has Inter Letters loaded');
      L = await look();
      ok(it.inter && /^"?Inter"?,/.test(it.want) && L.keyMin >= 44 && L.keysInside, `the keys and the canvas are in Inter, and fit (${it.want.split(',')[0]})`);
      await page.screenshot({ path: OUT + 'calculator-letters.png' });
      if (apple) await choose('Desmos %');
      if (!adv) await choose('Advanced keys');
    }

    // ---- The menu fits a 1366 × 768 board at the default size, without scrolling or squeezing
    {
      const c3 = await browser.newContext({ viewport: { width: 1366, height: 768 } }), p3 = await c3.newPage();
      await p3.goto(BASE); await boardUp(p3);
      await p3.evaluate(() => window.__board21.openWidget('calculator')); await p3.waitForTimeout(1500);
      await p3.click('.win[data-ikey="calculator:1"] .win-label'); await p3.waitForTimeout(400);
      const m = await p3.evaluate(() => { const e = document.getElementById('menu'), r = e.getBoundingClientRect(); return { cls: e.className, top: r.top, bottom: r.bottom, scrolls: e.scrollHeight > e.clientHeight + 1, items: e.querySelectorAll('.menu-item').length, scale: window.__board21.state.board.scale }; });
      ok(m.items >= 14 && !/compact|tight|cols/.test(m.cls) && !m.scrolls && m.top >= 0 && m.bottom <= 768, `on a 1366 × 768 board at its default size, the whole menu fits without scrolling or tighter rows (${m.items} items, ${Math.round(m.top)} to ${Math.round(m.bottom)}, ${m.cls})`);
      await p3.screenshot({ path: OUT + 'calculator-menu-1366.png' });
      // There, keys are 44 px or more on the screen with Advanced keys too: the window grows for them, then gives it back.
      await p3.keyboard.press('Escape'); await p3.waitForTimeout(300);
      const pick = async label => { await p3.click('.win[data-ikey="calculator:1"] .win-label'); await p3.locator('#menu [data-act="widget"]').filter({ has: p3.locator('.label', { hasText: new RegExp('^' + label + '$') }) }).click({ timeout: 3000 }); await p3.waitForTimeout(700); };
      const onScreen = () => p3.frameLocator('.win[data-ikey="calculator:1"] iframe').locator('html').evaluate(() => {
        const ks = [...document.querySelectorAll('#keys .key')].filter(k => k.getClientRects().length), z = Board21.context.window.zoom;
        return { n: ks.length, min: Math.min(...ks.map(k => Math.min(k.getBoundingClientRect().width, k.getBoundingClientRect().height))) * z, zoom: z, w: innerWidth, h: innerHeight };
      });
      const k0 = await onScreen(); await pick('Advanced keys'); const k1 = await onScreen(); await pick('Advanced keys'); const k2 = await onScreen();
      ok(k0.min >= 44 && k1.n === 31 && k1.min >= 44 && k1.h > k0.h && k2.w === 900 && k2.h === 600,
        `there, keys are 44 px or more on the screen, Advanced keys too: the window grows for them and gives it back (${k0.min.toFixed(1)} px; ${k1.min.toFixed(1)} px at ${k1.w} × ${k1.h}, zoom ${k1.zoom}; then ${k2.w} × ${k2.h})`);
      await c3.close();
    }

    // ---- The smallest window: the keys stay 44 px or larger, with Advanced keys too
    await page.evaluate(() => window.__board21.setRect('calculator:1', Object.assign({}, window.__board21.state.insts.get('calculator:1').rect, { w: 280, h: 440 }))); await page.waitForTimeout(600);
    L = await look();
    ok(L.layout === 'stack' && L.keyMin >= 44 && L.keysInside && L.panels.some(p => p.n === 'display'), `280 × 400: a display above the keys, every key 44 px or more and in view (${L.layout}, ${L.keyMin.toFixed(1)} px)`);
    await choose('Advanced keys'); await page.waitForTimeout(500); L = await look();
    ok(L.keys.length === 31 && L.keyMin >= 44 && L.keysInside, `with Advanced keys too (the window grows to fit them: ${L.vw} × ${L.vh}, ${L.keyMin.toFixed(1)} px)`);
    await choose('Advanced keys'); await page.waitForTimeout(500); L = await look();
    ok(L.vh === 400 && L.keyMin >= 44, `and gives the height back after (${L.vw} × ${L.vh})`);
    // History in a narrow window: the window widens by its width, and it shows beside the display and keys.
    c = await contentOf(page, 'calculator:1');
    await choose('History'); c2 = await contentOf(page, 'calculator:1'); L = await look();
    ok(c2.w > c.w + 200 && L.layout === 'stack' && L.order.slice(-1)[0] === 'history' && L.keyMin >= 44, `History on in the smallest window: it widens, History beside the display and keys (${c.w} → ${c2.w}; ${L.order.join(', ')})`);
    await press(['clear']); await press('(125+375)×12−1500÷25+987654321=');
    ll = await lastLine();
    ok(ll.clip, `a problem too long for its line even then fades at the cut edge (${ll.text}: ${ll.need} px in ${ll.room})`);
    await choose('History'); c2 = await contentOf(page, 'calculator:1');
    ok(c2.w === c.w, `and narrows again after (${c2.w})`);
    await choose('Advanced keys'); await choose('History'); await choose('History'); await choose('Advanced keys');
    c2 = await contentOf(page, 'calculator:1'); L = await look();
    ok(c2.w === 280 && c2.h === 400 && L.vh === 400, `Advanced keys on, History on and off, Advanced keys off: 280 × 400 again (${c2.w} × ${c2.h}, drawn ${L.vw} × ${L.vh})`);
    // A narrow, tall window stacks the canvas above the keys, as Teach does.
    await page.evaluate(() => window.__board21.setRect('calculator:1', Object.assign({}, window.__board21.state.insts.get('calculator:1').rect, { w: 420, h: 700 }))); await page.waitForTimeout(600);
    L = await look();
    ok(L.layout === 'stack' && L.panels.some(p => p.n === 'canvas') && panel(L, 'canvas').y + panel(L, 'canvas').h <= panel(L, 'keys').y + 1 && L.keyMin >= 44, `420 × 660: the canvas above the keys, as Teach does (${L.panels.map(p => p.n + ' ' + p.y + '+' + p.h).join(', ')})`);
    // Every size from 50% to 200%: nothing spills out.
    await page.evaluate(() => window.__board21.setRect('calculator:1', Object.assign({}, window.__board21.state.insts.get('calculator:1').rect, { w: 720, h: 520 }))); await page.waitForTimeout(400);
    for (const sc of [0.5, 1, 1.5, 2]) {
      await page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await page.waitForTimeout(500);
      L = await look();
      ok(L.keysInside && L.keyMin >= 44, `at ${sc * 100}%: every key in its window, 44 px or more (${L.keyMin.toFixed(1)})`);
    }
    await page.evaluate(() => window.__board21.setBoardScale(1));
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  // ---- 2026.11.21-3: the Calculator's top row lines up (AC 3 columns, ⌫ 6, ± 3), and In words says the parentheses drawn
  // around a negative base. (Its part on Test practice's strip went with Test practice's menu item, in 2026.11.23-1.)
  ['Calculator’s top row and In words for (−3)²', async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const ik = await addWin(page, 'calculator');
    ok(await eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik)), `a Calculator opens (${ik})`);
    await page.waitForTimeout(600);
    const W = page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const front = () => page.evaluate(ik => { if (window.__board21.state.focused !== ik) window.__board21.focusWin(ik); }, ik);
    const choose = async label => {
      await front();
      await page.click(`.win[data-ikey="${ik}"] .win-label`);
      await page.locator('#menu [data-act="widget"]').filter({ has: page.locator('.label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click({ timeout: 3000 });
      await page.waitForTimeout(700);
    };
    const cfg = async () => Object.assign({ canvas: true, history: false, words: false, advanced: false, test: false, swap: false, hide: false }, await page.evaluate(ik => window.__board21.state.conf.get(ik) || {}, ik));
    const set = async (label, key, on) => { if ((await cfg())[key] !== on) await choose(label); };
    const setSize = (w, h) => page.evaluate(([ik, w, h]) => window.__board21.setRect(ik, Object.assign({}, window.__board21.state.insts.get(ik).rect, { w, h: h + 40 })), [ik, w, h]).then(() => page.waitForTimeout(700));
    const press = async keys => { await front(); for (const k of keys) await W.locator(`#keys .key[data-key="${k}"]`).click({ timeout: 3000 }); await page.waitForTimeout(250); };
    const near = (a, b, d = 1) => Math.abs(a - b) <= d;
    // Every key's box (null when hidden), the pad's, and the keys' smallest height.
    const keysAt = () => W.locator('html').evaluate(() => {
      const shown = e => !!e && e.getClientRects().length > 0;
      const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
      const keys = [...document.querySelectorAll('#keys .key')], out = { k: {} };
      for (const e of keys) out.k[e.dataset.key] = shown(e) ? box(e) : null;
      const pad = document.getElementById('keys');
      out.pad = box(pad); out.gap = parseFloat(getComputedStyle(pad).columnGap);
      out.minH = Math.min(...keys.filter(shown).map(e => e.getBoundingClientRect().height));
      out.layout = document.getElementById('app').dataset.layout; out.theme = document.documentElement.getAttribute('data-b21-theme');
      out.vw = innerWidth; out.vh = innerHeight;
      return out;
    });
    const span = (k, n) => k.k[n] ? `${n} ${k.k[n].l.toFixed(1)}–${k.k[n].r.toFixed(1)}` : `${n} hidden`;
    const lined = k => { const c = k.k; return !!(c.clear && c.backspace && c.negate && c.open && c.close && c.sqrt && c.divide) &&
      near(c.clear.l, c.open.l) && near(c.clear.r, c.open.r) && near(c.backspace.l, c.close.l) && near(c.backspace.r, c.sqrt.r) &&
      near(c.negate.l, c.divide.l) && near(c.negate.r, c.divide.r) && near(c.clear.t, c.backspace.t) && near(c.clear.t, c.negate.t); };
    const row = k => ['clear', 'backspace', 'negate', 'open', 'close', 'sqrt', 'divide'].map(n => span(k, n)).join(', ');

    // ---- 1. The top row lines up, Basic and Advanced, light and dark, at 900 × 600 and the smallest window, 280 × 400.
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(400);
      for (const [w, h] of [[900, 600], [280, 400]]) {
        for (const adv of [false, true]) {
          await set('Advanced keys', 'advanced', adv); await setSize(w, h);
          const k = await keysAt();
          ok(k.theme === scheme && lined(k), `${scheme}, ${w} × ${h}, ${adv ? 'Advanced' : 'Basic'}: AC over (, ⌫ from ) to √, ± over ÷ (${k.vw} × ${k.vh}: ${row(k)})`);
        }
      }
    }
    await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(300);
    await set('Advanced keys', 'advanced', false); await setSize(900, 600);
    // Key order, tab order, labels, and spoken names stay as they were.
    const order = await W.locator('html').evaluate(() => [...document.querySelectorAll('#keys .key')].slice(8, 11).map(b => [b.dataset.key, b.textContent.trim() || b.querySelector('svg') && 'svg', b.getAttribute('aria-label')].join(':')).join(' '));
    ok(order === 'clear:AC:all clear backspace:svg:delete negate:±:opposite', `the row keeps its order and labels, and ± is called “opposite” (${order})`);
    // Canvas off (the phone layout), History on, and Swap sides: still lined up.
    for (const [label, key] of [['Canvas', 'canvas'], ['History', 'history'], ['Swap sides', 'swap']]) {
      await choose(label); await setSize(900, 600);
      const k = await keysAt();
      ok(lined(k), `${label} ${key === 'canvas' ? 'off' : 'on'}: the top row still lines up (${k.layout}: ${row(k)})`);
      await choose(label);
    }
    await setSize(900, 600);

    // ---- 2. In words tells (−3)² from −3²: the In words line, the screen reader, and History.
    await set('Advanced keys', 'advanced', true); await set('In words', 'words', true); await set('History', 'history', true);
    await setSize(1300, 640);
    const NEG = 'open parenthesis negative 3 close parenthesis';
    const words = () => W.locator('html').evaluate(() => {
      const lines = [...document.querySelectorAll('#history .hline')], last = lines[lines.length - 1], m = last && last.querySelector('.hpick .ce-math');
      return { eq: document.getElementById('eq').textContent.replace(/\s+/g, ' ').trim(), said: document.getElementById('said').textContent.trim(), live: document.getElementById('live').textContent.trim(),
        eqLabel: (document.querySelector('#eq .ce-math') || { getAttribute: () => '' }).getAttribute('aria-label'), hist: m ? m.getAttribute('aria-label') : '' };
    });
    await press(['clear', '3', 'negate', 'square', 'equals']);
    let w = await words();
    ok(w.said === `${NEG} squared equals 9` && w.live === w.said && w.eqLabel === w.said && w.hist === `${NEG} squared`,
      `3 ± a²: In words, the screen reader, and History say “${NEG} squared equals 9” (${w.said} | ${w.live} | ${w.hist})`);
    await page.screenshot({ path: OUT + 'calculator-words-neg-base.png' });
    await press(['clear', 'subtract', '3', 'square', 'equals']);
    w = await words();
    ok(w.said === 'negative 3 squared equals negative 9' && w.live === w.said && w.hist === 'negative 3 squared', `−3² keeps its words (${w.said} | ${w.live} | ${w.hist})`);
    await press(['clear', '0', 'subtract', '3', 'equals', 'square', 'equals']);
    w = await words();
    ok(w.said === `${NEG} squared equals 9` && w.live === w.said && w.hist === `${NEG} squared`, `a negative answer squared says its parentheses (${w.said} | ${w.hist})`);
    await press(['clear', '5', 'add']);
    await W.locator('#history .hans[aria-label="Use −3"]').first().click(); await page.waitForTimeout(200);
    await press(['power', '3', 'equals']);
    w = await words();
    ok(w.said === `5 plus ${NEG} cubed equals negative 22` && w.live === w.said && w.hist === `5 plus ${NEG} cubed`, `a negative History answer with aᵇ says its parentheses (${w.said} | ${w.hist})`);
    await press(['clear', '2', 'subtract', '3', 'negate', 'equals']);
    w = await words();
    ok(w.said === '2 minus negative 3 equals 5', `2 − 3 ± keeps its words (${w.said})`);
    // A negative fraction as a base, (−3/2)², says its parentheses too, with Hide the answer on. −(3/2)² keeps its words.
    const NEGF = 'open parenthesis negative 3 over 2 close parenthesis';
    await press(['clear', 'fraction', '3', 'negate', 'right', '2', 'right', 'square', 'equals']);
    w = await words();
    ok(w.said === `${NEGF} squared equals 2.25` && w.live === w.said && w.eqLabel === w.said && w.hist === `${NEGF} squared`, `a/b 3 ± → 2 → a²: (−3/2)² says its parentheses (${w.said} | ${w.live} | ${w.hist})`);
    await set('Hide the answer', 'hide', true);
    await press(['clear', 'fraction', '3', 'negate', 'right', '2', 'right', 'square', 'equals']);
    const hidden = await words();
    await press(['clear', 'subtract', 'fraction', '3', 'right', '2', 'right', 'square', 'equals']);
    w = await words();
    ok(hidden.said === `${NEGF} squared` && w.said === 'negative 3 over 2 squared' && hidden.said !== w.said,
      `with Hide the answer on, (−3/2)² and −(3/2)² say different words (${hidden.said} | ${w.said})`);
    await set('Hide the answer', 'hide', false);

    // ---- 3. The docs: the manual's drawings and lines.
    const man = fs.readFileSync(path.join(ROOT, 'docs', 'calculator-manual', 'page-src.html'), 'utf8');
    const TOP = '<span class="fn k3 w">AC</span><span class="fn k6">⌫</span><span class="fn k3">±</span>';
    ok(man.split(TOP).length === 3 && !/class="fn k4/.test(man), 'the manual draws AC, ⌫, and ± as 3, 6, and 3 columns, in Keys and in Advanced keys');
    const plain = man.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    for (const line of ['Changes the number you’re typing, or the answer, to its opposite.', '± makes the number itself negative, so 3 ± a² is (−3)² = 9.',
      '3 × (−2) where Desmos writes 3×−2.']) ok(plain.includes(line), `the manual: “${line}”`);
    ok(stamped(), STAMPED);
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],

  // ---- 2026.11.23-1: the Calculator's menu. Test practice leaves it (its code stays, behind TEST_PRACTICE), 50 + 10% = 55
  // becomes Desmos %, shown under Advanced keys while they're on, and Answers as fractions becomes a group of three:
  // As decimals, As fractions, and With remainders (17 ÷ 5 = 3 R 2).
  ['Calculator: Answers group, Desmos %, and no Test practice', async (browser) => {
    const errors = [];
    // Each part runs on its own: one that stops early is reported, and the next still runs.
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const sorted = s => String(s).split(',').sort().join();
    const BASIC = 'clear,backspace,negate,open,close,sqrt,divide,7,8,9,multiply,4,5,6,subtract,1,2,3,add,0,point,ans,equals';
    const ADV = 'square,power,root,cbrt,pi,percent,fraction,right';
    const MENU_OFF = '[Show] | ✓ Canvas | History | ✓ Steps | In words | Swap sides | — | [Answers] | ✓ As decimals | As fractions | With remainders | — | Advanced keys | Hide the answer | — | (off) Clear history';
    const MENU_ON = MENU_OFF.replace('| Advanced keys |', '| ✓ Advanced keys | ✓ Desmos % |');
    const head = m => String(m).replace(/ \| — \| (\(off\) )?Clear history$/, '');   // (Clear history is greyed out while History is empty)
    const NAME = { '+': 'add', '−': 'subtract', '×': 'multiply', '÷': 'divide', '=': 'equals', '.': 'point', '(': 'open', ')': 'close', '%': 'percent' };
    // A board with one Calculator (on a board that is the screen, unless free is false), and what to do with it.
    const calcBoard = async (free = true) => {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page);
      if (free) await freeBoard(page);
      const ik = await addWin(page, 'calculator');
      await eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
      await page.waitForTimeout(600);
      const W = page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
      const front = () => page.evaluate(ik => { if (window.__board21.state.focused !== ik) window.__board21.focusWin(ik); }, ik);
      const press = async keys => {
        await front();
        for (const k of typeof keys === 'string' ? Array.from(keys).map(c => NAME[c] || c) : keys) await W.locator(`#keys .key[data-key="${k}"]`).click({ timeout: 3000 });
        await page.waitForTimeout(200);
      };
      const type = async text => { await front(); await W.locator('#app').click({ position: { x: 3, y: 3 } }); await page.keyboard.type(text); await page.waitForTimeout(250); };
      const choose = async label => {
        await front();
        await page.click(`.win[data-ikey="${ik}"] .win-label`);
        await page.locator('#menu [data-act="widget"]').filter({ has: page.locator('.label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click({ timeout: 3000 });
        await page.waitForTimeout(600);
      };
      const menu = () => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return w ? w.menuItems.map(i => i.separator ? '—' : i.heading ? `[${i.label}]` : (i.disabled ? '(off) ' : '') + (i.checked ? '✓ ' : '') + i.label).join(' | ') : null; }, ik);
      const conf = () => page.evaluate(ik => window.__board21.state.conf.get(ik) || {}, ik);
      // A config saved in the window and sent to it, as one arrives from another tab, Board Sync, an import, or Board
      // history; then, with reload, opened again, as an older window on this device.
      const put = v => page.evaluate(async ([ik, v]) => {
        const w = window.__board21.state.wins.get(ik), B = w.iframe.contentWindow.Board21;
        await B.saveConfig(v); w.post('config', { config: v, reason: 'remote' });
      }, [ik, v]).then(() => page.waitForTimeout(500));
      const reload = async () => { await page.reload(); await boardUp(page); await page.waitForTimeout(1500); };
      const look = () => W.locator('html').evaluate(() => {
        const $ = id => document.getElementById(id), shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const plain = e => { if (!e) return ''; const c = e.cloneNode(true); c.querySelectorAll('.ce-anslabel, .ce-cursor, .heq').forEach(n => n.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
        const tg = shown($('eqToggle')) ? $('eqToggle') : shown($('bigToggle')) ? $('bigToggle') : null, ac = document.querySelector('#keys .key[data-key="clear"]');
        return {
          eq: plain($('eq')), eqLabel: (document.querySelector('#eq .ce-math') || { getAttribute: () => '' }).getAttribute('aria-label'), said: shown($('said')) ? plain($('said')) : '',
          note: plain($('note')), hint: plain($('hint')), reveal: shown(document.querySelector('#eq .reveal')), toggle: tg ? tg.getAttribute('aria-label') : null,
          frac: !!document.querySelector('#eq .ce-ans .ce-frac'), live: $('live').textContent,
          hist: [...document.querySelectorAll('#history .hline')].filter(shown).map(l => ({ expr: plain(l.querySelector('.hpick')), ans: plain(l.querySelector('.hans')) })),
          chain: [...document.querySelectorAll('#chain li.on')].map(li => plain(li.querySelector('.lx'))),
          work: [...document.querySelectorAll('#chain li.on .lw.on .work')].map(plain),
          keys: [...document.querySelectorAll('#keys .key')].filter(shown).map(k => k.dataset.key), test: $('app').classList.contains('test'),
          ac: plain(ac), acName: ac.getAttribute('aria-label')
        };
      });
      return { ctx, page, ik, W, front, press, type, choose, menu, conf, put, reload, look };
    };

    // ---- 1. The menu: no Test practice; Answers, a group of three; Desmos % under Advanced keys while they're on.
    await part('Menu', async () => {
      const C = await calcBoard();
      let m = await C.menu();
      ok(m === MENU_OFF, `a new window: no Test practice, Answers with As decimals checked, and no Desmos % while Advanced keys are off (${m})`);
      await C.front(); await C.page.click(`.win[data-ikey="${C.ik}"] .win-label`); await C.page.waitForTimeout(300);
      const grp = await C.page.evaluate(() => { const g = document.querySelector('#menu .menu-group[aria-label="Answers"]'); return g ? [...g.querySelectorAll('[role="menuitemcheckbox"]')].map(b => `${b.textContent.trim()} ${b.getAttribute('aria-checked')}`) : null; });
      ok(same(grp, ['As decimals true', 'As fractions false', 'With remainders false']), `a screen reader hears the group as “Answers, As decimals, checked” (${JSON.stringify(grp)})`);
      await C.page.keyboard.press('Escape'); await C.page.waitForTimeout(200);
      await C.choose('Advanced keys'); m = await C.menu();
      ok(m === MENU_ON, `Advanced keys on: Desmos % right under them, checked (${m})`);
      await C.press(['clear']); await C.type('10%50='); let L = await C.look();
      ok(L.eq === '10% of 50 = 5', `Desmos % on: % means “% of” (${L.eq})`);
      await C.choose('Desmos %'); await C.press(['clear']); await C.type('50+10%='); L = await C.look();
      ok(L.eq === '50 + 10% = 55' && (await C.conf()).percent === 'apple' && /\| ✓ Advanced keys \| Desmos % \|/.test(await C.menu()), `unchecked: 50 + 10% = 55, saved as percent 'apple' (${L.eq}, ${(await C.conf()).percent})`);
      await C.choose('Desmos %'); await C.press(['clear']); await C.type('50+10%5='); L = await C.look();
      ok(L.eq === '50 + 10% of 5 = 50.5' && (await C.conf()).percent === 'of', `checked again: “% of” again (${L.eq})`);
      // Advanced keys off: Desmos % is gone, and its value is kept. The keyboard still types %, and the value decides it.
      await C.choose('Desmos %'); await C.choose('Advanced keys'); m = await C.menu();
      ok(head(m) === head(MENU_OFF) && (await C.conf()).percent === 'apple', `Advanced keys off: Desmos % leaves the menu, and stays unchecked (${m}; ${(await C.conf()).percent})`);
      await C.press(['clear']); await C.type('50+10%='); L = await C.look();
      ok(!L.keys.includes('percent') && L.eq === '50 + 10% = 55', `with no % key showing, the keyboard types %, and Desmos % still decides it (${L.eq})`);
      await C.choose('Advanced keys'); m = await C.menu();
      ok(/\| ✓ Advanced keys \| Desmos % \| Hide the answer \|/.test(m), `Advanced keys on again: Desmos % comes back unchecked (${m})`);
      await C.ctx.close();
      // The menu fits a 1366 × 768 board, with Advanced keys on, near the top of the board and near the bottom.
      const menuBox = async C => {
        await C.front(); await C.page.click(`.win[data-ikey="${C.ik}"] .win-label`); await C.page.waitForTimeout(400);
        return C.page.evaluate(ik => {
          const e = document.getElementById('menu'), b = e.getBoundingClientRect(), w = document.querySelector(`.win[data-ikey="${ik}"]`).getBoundingClientRect();
          return { cls: e.className, top: Math.round(b.top), bottom: Math.round(b.bottom), scrolls: e.scrollHeight > e.clientHeight + 1, win: [Math.round(w.top), Math.round(w.bottom)], items: [...e.querySelectorAll('.menu-item')].map(i => i.textContent.trim()) };
        }, C.ik);
      };
      const B = await calcBoard(false);
      await B.choose('Advanced keys');
      for (const [where, y] of [['near the top', 0], ['near the bottom', 100000]]) {
        await B.page.evaluate(([ik, y]) => window.__board21.setRect(ik, Object.assign({}, window.__board21.state.insts.get(ik).rect, { x: 200, y })), [B.ik, y]); await B.page.waitForTimeout(600);
        const r = await menuBox(B);
        ok(!r.scrolls && r.top >= 0 && r.bottom <= 768 && r.items.includes('Desmos %') && !/compact|tight|cols/.test(r.cls) && (where === 'near the top' ? r.win[0] < 60 : r.win[1] > 768 - 60),
          `${where} (the window from ${r.win[0]} to ${r.win[1]}): the whole menu fits, ${r.top} to ${r.bottom}, without scrolling or tighter rows (${r.items.length} items; ${r.cls})`);
        await B.page.keyboard.press('Escape'); await B.page.waitForTimeout(200);
      }
      await B.ctx.close();
      // A board that is the screen: the window is the board's full height with Advanced keys on. The menu takes compact
      // rows there, as other tall windows' menus do, and still fits without scrolling.
      const F = await calcBoard(true);
      await F.choose('Advanced keys');
      const f = await menuBox(F);
      ok(!f.scrolls && f.top >= 0 && f.bottom <= 768 && f.items.includes('Desmos %') && f.items.length === 15,
        `a board that is the screen (the window from ${f.win[0]} to ${f.win[1]}): the whole menu fits, ${f.top} to ${f.bottom}, without scrolling (${f.items.length} items; ${f.cls})`);
      await F.page.keyboard.press('Escape'); await F.page.waitForTimeout(200);
      // At a large Size the menu takes two columns. Each group stays whole in one column, and no column starts or ends
      // with a line. With Advanced keys on and off, at Size 150%, 175%, and 200%.
      const two = [];
      for (const adv of ['on', 'off']) {
        if (adv === 'off') { await F.page.evaluate(() => window.__board21.setBoardScale(0.8)); await F.page.waitForTimeout(400); await F.choose('Advanced keys'); }
        for (const sc of [1.5, 1.75, 2]) {
          await F.page.evaluate(sc => window.__board21.setBoardScale(sc), sc); await F.page.waitForTimeout(400);
          await F.front(); await F.page.click(`.win[data-ikey="${F.ik}"] .win-label`); await F.page.waitForTimeout(400);
          two.push(Object.assign({ at: `Advanced keys ${adv}, ${sc * 100}%` }, await F.page.evaluate(() => {
            const m = document.getElementById('menu'), b = m.getBoundingClientRect(), shown = e => e.getClientRects().length > 0;
            const kids = [...m.querySelectorAll(':scope > :not(.menu-group), .menu-group > *')].filter(shown);
            // (Every item is as wide as its column: one that starts past the first item's right edge is in column 2.)
            const edge = kids[0].getBoundingClientRect().right, col = e => e.getBoundingClientRect().left >= edge - 0.5 ? 2 : 1;
            const name = e => e.classList.contains('menu-sep') ? '—' : e.classList.contains('menu-heading') ? `[${e.textContent.trim()}]` : e.textContent.trim();
            const cols = [1, 2].map(c => kids.filter(e => col(e) === c)).filter(l => l.length);
            return { cols: m.classList.contains('cols'), list: cols.map(l => l.map(name).join(' | ')).join(' ‖ '),
              split: [...m.querySelectorAll('.menu-group')].filter(g => new Set([...g.children].filter(shown).map(col)).size > 1).map(g => g.getAttribute('aria-label')),
              lines: cols.some(l => l[0].classList.contains('menu-sep') || l[l.length - 1].classList.contains('menu-sep')),
              fits: m.scrollHeight <= m.clientHeight + 1 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth };
          })));
          await F.page.keyboard.press('Escape'); await F.page.waitForTimeout(200);
        }
      }
      ok(two.some(t => t.cols) && two.every(t => !t.split.length && !t.lines && t.fits),
        `in two columns, each group whole in one column, no line at a column’s top or bottom, and all of it on screen (${two.map(t => `${t.at}: ${t.cols ? t.list : 'one column'}${t.split.length ? '; SPLIT: ' + t.split.join(', ') : ''}${t.lines ? '; A LINE AT AN END' : ''}${t.fits ? '' : '; DOESN’T FIT'}`).join(' / ')})`);
      await F.ctx.close();
    });

    // ---- 2. Settings from before: fractions: true, test: true, and percent: 'apple'; what's saved now.
    await part('Older settings', async () => {
      const C = await calcBoard();
      await C.put({ fractions: true }); let m = await C.menu();
      ok(/\[Answers\] \| As decimals \| ✓ As fractions \| With remainders \|/.test(m), `{ fractions: true } arriving: As fractions checked (${m})`);
      await C.reload(); m = await C.menu();
      await C.press(['clear']); await C.press('3÷4='); let L = await C.look();
      ok(/\[Answers\] \| As decimals \| ✓ As fractions \| With remainders \|/.test(m) && L.frac, `{ fractions: true } opened again: As fractions checked, and 3 ÷ 4 shows 3/4 (${m}; ${L.eq})`);
      await C.put({ answers: 'nonsense', fractions: true }); m = await C.menu();
      ok(/✓ As fractions/.test(m), `an answers value it doesn’t know reads fractions instead (${m})`);
      const normal = (L, what, keys = BASIC) => ok(!L.test && sorted(L.keys) === sorted(keys) && L.ac === 'AC' && L.acName === 'all clear',
        `${what}: a normal Calculator, with AC, ±, and every key (${L.keys.length} keys; ${L.ac}, “${L.acName}”)`);
      await C.put({ test: true }); L = await C.look(); m = await C.menu();
      normal(L, '{ test: true } arriving');
      ok(head(m) === head(MENU_OFF), `nothing greyed out, and no Test practice (${m})`);
      await C.press(['clear']); await C.press('2÷3='); L = await C.look();
      ok(L.eq === '2 ÷ 3 = 0.6666666667', `10 digits (${L.eq})`);
      await C.reload(); L = await C.look();
      normal(L, '{ test: true } opened again');
      await C.type('2pi'); await C.page.keyboard.press('Enter'); await C.page.waitForTimeout(250); L = await C.look();
      ok(L.eq === '2π = 6.283185307' && !/has no/.test(L.note + L.hint), `the keyboard types pi, with no message (${L.eq}; ${L.note || L.hint})`);
      await C.press(['clear']); await C.W.locator('#app').click({ position: { x: 3, y: 3 } }); await C.page.keyboard.type('5'); await C.page.keyboard.press('F9'); await C.page.waitForTimeout(250); L = await C.look();
      ok(L.eq === '−5' && !/has no/.test(L.note + L.hint), `F9 is ± (${L.eq})`);
      await C.put({ test: true, advanced: true, fractions: true }); L = await C.look(); m = await C.menu();
      normal(L, '{ test: true, advanced: true } arriving', BASIC + ',' + ADV);
      ok(head(m) === head(MENU_ON.replace('✓ As decimals | As fractions', 'As decimals | ✓ As fractions')), `Advanced keys and As fractions can be changed (${m})`);
      await C.choose('With remainders');
      const saved = await C.conf();
      ok(saved.answers === 'remainder' && saved.fractions === false && saved.test === false, `saving writes answers, the fractions an older release reads, and test off (${JSON.stringify(saved)})`);
      await C.put({ percent: 'apple' }); await C.reload(); m = await C.menu();
      ok(head(m) === head(MENU_OFF), `{ percent: 'apple' } opened again: no Desmos % while Advanced keys are off (${m})`);
      await C.choose('Advanced keys'); m = await C.menu();
      ok(/\| ✓ Advanced keys \| Desmos % \|/.test(m), `Advanced keys on: Desmos % unchecked (${m})`);
      for (const [label, answers, fractions] of [['As fractions', 'fraction', true], ['With remainders', 'remainder', false], ['As decimals', 'decimal', false]]) {
        await C.choose(label); const c = await C.conf();
        ok(c.answers === answers && c.fractions === fractions && /✓ /.test(await C.menu()), `${label}: saved as answers '${c.answers}', fractions ${c.fractions}`);
      }
      // Reset: a new window's menu.
      await C.front(); await C.page.click(`.win[data-ikey="${C.ik}"] .win-label`); await C.page.locator('#menu [data-act="reset"]').click(); await C.page.locator('#menu [data-act="reset-yes"]').click();
      await C.page.waitForTimeout(1500);
      ok(await C.menu() === MENU_OFF, 'Reset: the menu as new');
      await C.ctx.close();
    });

    // ---- 3. With remainders: 17 ÷ 5 = 3 R 2. Any other answer is a decimal.
    await part('Remainders', async () => {
      const C = await calcBoard();
      await C.choose('With remainders');
      ok(/\[Answers\] \| As decimals \| As fractions \| ✓ With remainders \|/.test(await C.menu()) && (await C.conf()).answers === 'remainder', 'With remainders checked, and saved');
      for (const [keys, eq] of [['17÷5=', '17 ÷ 5 = 3 R 2'], ['15÷5=', '15 ÷ 5 = 3'], ['(20+3)÷5=', '(20 + 3) ÷ 5 = 4 R 3'], ['17.0÷5=', '17.0 ÷ 5 = 3 R 2'],
        ['2+17÷5=', '2 + 17 ÷ 5 = 5.4'], ['7.5÷2=', '7.5 ÷ 2 = 3.75'], ['−17÷5=', '−17 ÷ 5 = −3.4']]) {
        await C.press(['clear']); await C.press(keys); const L = await C.look();
        ok(L.eq === eq, `${keys}: ${eq} (${L.eq})`);
      }
      await C.press(['clear']); await C.press('17÷0='); let L = await C.look();
      ok(/Can’t divide by 0/.test(L.note) && L.eq === '17 ÷ 0', `17 ÷ 0 says what it says today (${L.eq}; ${L.note})`);
      // In words, the screen reader, History, and the last step.
      await C.choose('In words'); await C.choose('History');
      await C.press(['clear']); await C.press('17÷5='); L = await C.look();
      ok(L.said === '17 divided by 5 equals 3 remainder 2' && L.eqLabel === L.said && L.live === L.said, `In words: “${L.said}”, and a screen reader hears it too (${L.live})`);
      const last = L.hist[L.hist.length - 1] || {};
      ok(last.expr === '17 ÷ 5' && last.ans === '3 R 2', `History: 17 ÷ 5 = 3 R 2 (${JSON.stringify(last)})`);
      // Its answer button is named in words, as the screen reader hears the answer everywhere else.
      const useName = await C.W.locator('#history .hline .hans').last().getAttribute('aria-label');
      ok(useName === 'Use 3 remainder 2', `History’s answer button is “Use 3 remainder 2”, not “Use 3 R 2” (${useName})`);
      await C.page.screenshot({ path: OUT + 'calculator-remainder.png' });
      await C.W.locator('#all').click(); await C.page.waitForTimeout(300); L = await C.look();
      ok(same(L.chain, ['17 ÷ 5', '3 R 2']) && same(L.work, ['17 ÷ 5 = 3 R 2']), `Steps: 17 ÷ 5, then 3 R 2 (${L.chain.join(' | ')}; ${L.work.join(' | ')})`);
      await C.press(['clear']); await C.press('(20+3)÷5='); await C.W.locator('#all').click(); await C.page.waitForTimeout(300); L = await C.look();
      ok(L.chain[L.chain.length - 1] === '4 R 3' && same(L.work, ['20 + 3 = 23', '23 ÷ 5 = 4 R 3']), `(20 + 3) ÷ 5: the same steps, the last one 4 R 3 (${L.chain.join(' | ')}; ${L.work.join(' | ')})`);
      // ⇄: 3 R 2 and 3.4.
      await C.press(['clear']); await C.press('17÷5='); L = await C.look();
      ok(L.toggle === 'Show as a decimal', `⇄ beside 3 R 2 is “Show as a decimal” (${L.toggle})`);
      await C.W.locator('#eqToggle').click(); await C.page.waitForTimeout(250); L = await C.look();
      ok(L.eq === '17 ÷ 5 = 3.4' && L.toggle === 'Show with a remainder' && L.said === '17 divided by 5 equals 3.4', `⇄: 3.4, then “Show with a remainder” (${L.eq}; ${L.toggle})`);
      await C.W.locator('#eqToggle').click(); await C.page.waitForTimeout(250); L = await C.look();
      ok(L.eq === '17 ÷ 5 = 3 R 2', `⇄ again: 3 R 2 (${L.eq})`);
      // ans goes on from 17/5, and shows it as 17/5 (2026.11.23-4).
      await C.press('×5='); L = await C.look();
      const ansBox = await C.W.locator('#eq .ce-ansref .ce-frac').evaluate(f => f.querySelector('.ce-numer').textContent + '/' + f.querySelector('.ce-denom').textContent).catch(() => null);
      ok(ansBox === '17/5' && / × 5 = 17$/.test(L.eq), `× right after it goes on from 17/5, shown as 17/5: ${ansBox}; ${L.eq}`);
      // Hide the answer hides it like any other.
      await C.choose('Hide the answer'); await C.press(['clear']); await C.press('17÷5='); L = await C.look();
      const hl = L.hist[L.hist.length - 1] || {};
      ok(L.reveal && !/R/.test(L.eq) && L.said === '17 divided by 5' && hl.ans === '?', `Hide the answer hides it, in History too (${L.eq}; ${L.said}; ${hl.ans})`);
      await C.W.locator('#eq .reveal').click(); await C.page.waitForTimeout(300); L = await C.look();
      ok(L.eq === '17 ÷ 5 = 3 R 2', `a tap shows 3 R 2 (${L.eq})`);
      await C.choose('Hide the answer');
      // Picking another choice changes the answer on screen at once.
      await C.choose('As decimals'); L = await C.look();
      ok(L.eq === '17 ÷ 5 = 3.4', `As decimals: 3.4 at once (${L.eq})`);
      await C.choose('As fractions'); L = await C.look();
      ok(L.frac && /17\s?5$/.test(L.eq), `As fractions: 17/5 at once (${L.eq})`);
      await C.choose('With remainders'); L = await C.look();
      ok(L.eq === '17 ÷ 5 = 3 R 2', `With remainders: 3 R 2 at once (${L.eq})`);
      await C.W.locator('#eqToggle').click(); await C.page.waitForTimeout(250);
      await C.choose('As fractions'); L = await C.look();
      ok(L.frac, `3 R 2 switched to 3.4, then As fractions: 17/5 (${L.eq})`);
      await C.ctx.close();
    });

    // ---- 4. Test practice's code stays, behind one constant; no Test practice where a teacher reads; the docs.
    await part('Code kept and docs', async () => {
      const src = fs.readFileSync(path.join(ROOT, 'widgets', 'calculator', 'index.html'), 'utf8');
      ok(/const TEST_PRACTICE = false;\s*\/\/[^\n]*true brings/i.test(src) && /const TEST_KEYS = /.test(src) && /const NOT_IN_TEST = /.test(src) && /const TEST_WORDS = /.test(src) &&
        /#app\.test #keys \{/.test(src) && /const TEST_CLEAR = 'clear all';/.test(src) && /has no \$\{E\.KEYS\[refused\]\.label\} key\./.test(src),
        'Test practice’s code stays: its CSS, TEST_KEYS, NOT_IN_TEST, TEST_WORDS, clear all, and its message, behind const TEST_PRACTICE = false');
      const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const f of ['README.md', 'docs/calculator-manual/page-src.html', 'docs/teacher-guide/page-src.html', 'docs/DATA-FORMAT.md']) {
        const t = read(f).replace(/<(script|style)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi, ''), hit = /test practice|clear all|NWEA|50 \+ 10% = 55 in the menu|Answers as fractions/i.exec(t);
        ok(!hit, `${f}: no Test practice, and none of the old names${hit ? ` (“${t.slice(Math.max(0, hit.index - 40), hit.index + 40)}”)` : ''}`);
      }
      const readme = read('README.md').replace(/\s+/g, ' '), sec = readme.slice(readme.indexOf('## Calculator'), readme.indexOf('## District apps'));
      const order = ['**Canvas:**', '**History:**', '**Steps:**', '**In words:**', '**Swap sides:**', '**Answers:**', '**Advanced keys:**', '**Desmos %:**', '**Hide the answer:**', '**Clear history:**'];
      ok(order.every((w, i) => sec.indexOf(w) >= 0 && (!i || sec.indexOf(w) > sec.indexOf(order[i - 1]))), 'README: the menu list in the menu’s order, with Answers and Desmos %');
      const data = read('docs/DATA-FORMAT.md').replace(/\s+/g, ' ');
      ok(/answers: "decimal" \| "fraction" \| "remainder"/.test(data) && /`fractions`/.test(data), 'DATA-FORMAT: the config’s answers, and the fractions written for older releases');
      // A stored test: true from an older release stays stored until this device saves the window's settings again.
      const man = read('docs/calculator-manual/page-src.html'), manText = man.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
      ok(/data-keys="17÷5" data-opts='\{"answers":"remainder"\}'/.test(man), 'the manual has a live 17 ÷ 5 with remainders');
      // The Percent card says Desmos % is found under Advanced keys. The Remainders card says what ans shows next, and
      // that / with Advanced keys on types a fraction, which never shows a remainder.
      const cardOf = h => { const j = man.indexOf(`<h3>${h}</h3>`); return j < 0 ? '' : man.slice(j, man.indexOf('<div class="pg-exs">', j)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
      ok(cardOf('Percent').includes('For the iPhone way, turn on Advanced keys, then untick Desmos %.') && !cardOf('Percent').includes('Untick Desmos % in the menu'),
        `the manual’s Percent card: “For the iPhone way, turn on Advanced keys, then untick Desmos %.” (${cardOf('Percent').trim()})`);
      ok(cardOf('Remainders').includes('Go on from 3 R 2, and ans shows 17/5.') && cardOf('Remainders').includes('With Advanced keys on, / types a fraction. Tap ÷ instead.'),
        `the manual’s Remainders card: what ans shows, and / with Advanced keys on (${cardOf('Remainders').trim()})`);
      const guide = read('docs/teacher-guide/page-src.html'), i = guide.indexOf('id="w-calculator"'), card = guide.slice(i, guide.indexOf('</article>', i));
      const ideas = Array.from(card.matchAll(/<li><span class="grade">([^<]*)<\/span><span>([^<]*)<\/span><\/li>/g)).map(x => x[1]);
      ok(same(ideas, ['K–2', '3–6', '4–5', '6–7']), `the Teacher Guide: the Calculator ideas in grade order (${ideas.join(', ')})`);
      // Test practice was the card's only idea past grade 5. Percent takes its place: 6.RP.A.3c and 7.RP.A.3.
      ok(stamped(), STAMPED);
    });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],

  // ---- 2026.11.23-4: the R in 3 R 2 is grey at full strength (look C in the mockups): the board's muted color, the
  // digits' size and weight, and 4.5:1 or more wherever it is drawn. Going on from an answer shown with a remainder puts
  // 17/5 in the ans box, drawn as As fractions draws it, so a grade 4 class doesn't see a decimal it never saw.
  ['Calculator: a grey R, and 17/5 after a remainder', async (browser) => {
    const errors = [];
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const NAME = { '+': 'add', '−': 'subtract', '×': 'multiply', '÷': 'divide', '=': 'equals', '.': 'point', '(': 'open', ')': 'close', '%': 'percent' };
    // The board's muted color, and the one History's answer box and Steps' work use in light, where muted reaches only
    // 4.4:1 on their grey: 90% muted, 10% text.
    const MUTED = { light: 'rgb(107, 114, 128)', dark: 'rgb(156, 163, 175)' }, MIXED = 'rgb(99, 107, 121)';
    const near = (a, b) => !!a && !!b && a.match(/[\d.]+/g).slice(0, 3).every((v, i) => Math.abs(v - b.match(/[\d.]+/g)[i]) <= 1);
    const calcBoard = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE); await boardUp(page); await freeBoard(page);
      const ik = await addWin(page, 'calculator');
      await eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
      await page.waitForTimeout(600);
      const W = page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
      const front = () => page.evaluate(ik => { if (window.__board21.state.focused !== ik) window.__board21.focusWin(ik); }, ik);
      const press = async keys => {
        await front();
        for (const k of typeof keys === 'string' ? Array.from(keys).map(c => NAME[c] || c) : keys) await W.locator(`#keys .key[data-key="${k}"]`).click({ timeout: 3000 });
        await page.waitForTimeout(250);
      };
      const choose = async label => {
        await front();
        await page.click(`.win[data-ikey="${ik}"] .win-label`);
        await page.locator('#menu [data-act="widget"]').filter({ has: page.locator('.label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click({ timeout: 3000 });
        await page.waitForTimeout(600);
      };
      // What shows: a stacked fraction written n/d, an ans box as { text, stacked }, and History's lines.
      const look = () => W.locator('html').evaluate(() => {
        const $ = id => document.getElementById(id), shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const plain = e => {
          if (!e) return '';
          const c = e.cloneNode(true);
          c.querySelectorAll('.ce-anslabel, .ce-cursor, .heq').forEach(n => n.remove());
          c.querySelectorAll('.ce-frac').forEach(f => f.replaceWith(f.querySelector('.ce-numer').textContent + '/' + f.querySelector('.ce-denom').textContent));
          return c.textContent.replace(/\s+/g, ' ').trim();
        };
        const box = e => { const b = e && e.querySelector('.ce-ansref'); if (!b) return null; const f = b.querySelector('.ce-frac'); return { text: plain(b), stacked: !!f && !!f.querySelector('.ce-numer') && !!f.querySelector('.ce-denom') }; };
        const tg = shown($('eqToggle')) ? $('eqToggle') : shown($('bigToggle')) ? $('bigToggle') : null;
        return {
          eq: plain($('eq')), box: box($('eq')), eqLabel: (document.querySelector('#eq .ce-math') || { getAttribute: () => '' }).getAttribute('aria-label'),
          said: shown($('said')) ? plain($('said')) : '', live: $('live').textContent, toggle: tg ? tg.getAttribute('aria-label') : null,
          reveal: shown(document.querySelector('#eq .reveal')), x: plain($('x')), xBox: box($('x')), big: plain($('big')), bigFrac: !!$('big').querySelector('.ce-frac'),
          hist: [...document.querySelectorAll('#history .hline')].filter(shown).map(l => ({ expr: plain(l.querySelector('.hpick')), box: box(l.querySelector('.hpick')), ans: plain(l.querySelector('.hans')), use: l.querySelector('.hans').getAttribute('aria-label') })),
          work: [...document.querySelectorAll('#chain li.on .lw.on .work')].map(plain)
        };
      });
      // The R at sel, and the digits just before it: colors as rgb() (color-mix() too, drawn on a canvas and read
      // back), the solid background behind it, its opacity and every opacity above it, size and weight.
      const R = sel => W.locator('html').evaluate((html, sel) => {
        const g2 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgb = c => { g2.clearRect(0, 0, 1, 1); g2.fillStyle = '#000'; g2.fillStyle = c; g2.fillRect(0, 0, 1, 1); const d = g2.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; };
        const cs = e => getComputedStyle(e), clear = b => /rgba\(0, 0, 0, 0\)|transparent/.test(b);
        const solid = e => { for (let n = e; n; n = n.parentElement) { const b = cs(n).backgroundColor; if (b && !clear(b)) return rgb(b); } return rgb(cs(document.body).backgroundColor); };
        const r = document.querySelector(sel);
        if (!r || !r.getClientRects().length) return null;
        const d = r.previousElementSibling;
        let all = 1;
        for (let n = r; n; n = n.parentElement) all *= +cs(n).opacity;
        return { text: r.textContent.trim(), color: rgb(cs(r).color), bg: solid(r), opacity: cs(r).opacity, all, size: cs(r).fontSize, weight: cs(r).fontWeight,
          digit: d && d.classList.contains('ce-num') ? { color: rgb(cs(d).color), size: cs(d).fontSize, weight: cs(d).fontWeight } : null };
      }, sel);
      const sep = () => W.locator('html').evaluate(() => { const s = document.querySelector('#eq .ce-sep'); return s ? { color: getComputedStyle(s).color, opacity: getComputedStyle(s).opacity } : null; });
      const reload = async () => { await page.reload(); await boardUp(page); await page.waitForTimeout(1500); };
      // Canvas off: where the problem line and the big display sit in the display.
      const disp = () => W.locator('html').evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect(), d = r('#disp'), xl = r('.xline'), x = r('#x'), b = r('#big');
        return { top: d.top, bottom: d.bottom, xline: xl.height, xH: x.height, xTop: x.top, xBottom: x.bottom, bigTop: b.top, bigBottom: b.bottom };
      });
      const shows = (D, where) => ok(D.xH > 0 && D.xline >= D.xH - 1 && D.xTop >= D.top - 1 && D.xBottom <= D.bigTop + 1 && D.bigBottom <= D.bottom + 1,
        `${where} (the problem line ${D.xline.toFixed(0)}px tall, its text ${D.xH.toFixed(0)}px, at ${D.xTop.toFixed(0)}–${D.xBottom.toFixed(0)}; the display ${D.top.toFixed(0)}–${D.bottom.toFixed(0)}; the big answer ${D.bigTop.toFixed(0)}–${D.bigBottom.toFixed(0)})`);
      // Settings › Accent › Custom…, a teacher's own color.
      const custom = async hex => {
        await openSettings(page);
        await page.locator('#set-accent-custom').evaluate((el, hex) => { el.value = hex; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, hex);
        await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      };
      return { ctx, page, ik, W, front, press, choose, look, R, sep, reload, disp, shows, custom };
    };
    // The R in one place: the color it should have, at full strength, the digits' size and weight, and its contrast.
    // (distinct: the digits beside it are another color. While typing, the whole answer is muted, the R too.)
    const checkR = (r, where, want, distinct = true) => {
      const min = 4.5, c = r ? contrast(r.color, r.bg) : 0, grey = r ? (Math.max(...r.color.match(/\d+/g).map(Number)) - Math.min(...r.color.match(/\d+/g).map(Number))) <= 30 : false;
      ok(!!r && r.text === 'R' && near(r.color, want) && r.opacity === '1' && r.all === 1 && grey && !!r.digit && r.size === r.digit.size && r.weight === r.digit.weight && (!distinct || r.color !== r.digit.color) && c >= min,
        `${where}: the R is grey, ${want}, at full strength, the digits’ size and weight, ${min}:1 or more (${r ? `${r.color} on ${r.bg}, ${c.toFixed(2)}:1, opacity ${r.opacity}/${r.all}, ${r.size} ${r.weight} beside ${r.digit && r.digit.size} ${r.digit && r.digit.weight} ${r.digit && r.digit.color}` : 'not drawn'})`);
    };

    // ---- 1. The R, light and dark: the canvas, History, the work of the last step, while typing, the big display.
    await part('The grey R', async () => {
      const C = await calcBoard();
      await C.choose('With remainders'); await C.choose('History'); await C.choose('In words');
      for (const scheme of ['light', 'dark']) {
        await C.page.emulateMedia({ colorScheme: scheme }); await C.page.waitForTimeout(500);
        await C.press(['clear']); await C.press('17÷5='); await C.press('1234567÷8=');
        let L = await C.look();
        ok(L.eq === '1,234,567 ÷ 8 = 154,320 R 7' && L.eqLabel === '1,234,567 divided by 8 equals 154,320 remainder 7' && L.said === L.eqLabel && L.live === L.eqLabel,
          `${scheme}: the words are as before: “${L.eq}”, and a screen reader and In words hear “${L.eqLabel}”`);
        const two = L.hist.slice(-2), uses = two.map(h => h.use);
        ok(JSON.stringify(two.map(h => h.expr + ' = ' + h.ans)) === JSON.stringify(['17 ÷ 5 = 3 R 2', '1,234,567 ÷ 8 = 154,320 R 7']) && uses[0] === 'Use 3 remainder 2' && uses[1] === 'Use 154,320 remainder 7',
          `${scheme}: History shows both, its buttons named as before (${uses.join(' | ')})`);
        const M = MUTED[scheme], box = scheme === 'light' ? MIXED : M;
        checkR(await C.R('#eq .ce-ans .ce-r'), `${scheme}, the canvas`, M);
        checkR(await C.R('#history .hline:last-child .hans .ce-r'), `${scheme}, History’s newest line (marked)`, box);
        checkR(await C.R('#history .hline:first-child .hans .ce-r'), `${scheme}, History’s first line`, box);
        // A highlighted background: the pointer over History's answer box. Never under 3:1.
        await C.W.locator('#history .hline:last-child .hans').hover(); await C.page.waitForTimeout(250);
        const hov = await C.R('#history .hline:last-child .hans .ce-r');
        ok(!!hov && contrast(hov.color, hov.bg) >= 3, `${scheme}: with the pointer over History’s answer, still 3:1 or more (${hov && contrast(hov.color, hov.bg).toFixed(2)}:1 on ${hov && hov.bg})`);
        await C.page.mouse.move(5, 5);
        const s = await C.sep();
        ok(!!s && near(s.color, M) && s.opacity === '0.6', `${scheme}: the faint comma is as before, muted at .6 (${s && s.color}, ${s && s.opacity})`);
        // The steps: the last step's work, 23 ÷ 5 = 4 R 3, once its marked part is worked out.
        await C.press(['clear']); await C.press('(20+3)÷5='); await C.W.locator('#all').click(); await C.page.waitForTimeout(700);
        L = await C.look();
        ok(JSON.stringify(L.work) === JSON.stringify(['20 + 3 = 23', '23 ÷ 5 = 4 R 3']), `${scheme}: Steps as before (${L.work.join(' | ')})`);
        checkR(await C.R('#chain li.on .lw.on .work .ce-r'), `${scheme}, the work of the last step`, box);
        checkR(await C.R('#chain li.fin .ce-r'), `${scheme}, the answer at the end of the steps`, M);
        // While typing: the answer as it will show, in the muted color already.
        await C.press(['clear']); await C.press('17÷5');
        checkR(await C.R('#eq .prev .ce-r'), `${scheme}, the answer while typing`, M, false);
        // The big display, with Canvas off.
        await C.choose('Canvas'); await C.press(['clear']); await C.press('17÷5=');
        checkR(await C.R('#big .ce-r'), `${scheme}, the big display with Canvas off`, M);
        await C.page.screenshot({ path: OUT + `calculator-grey-r-${scheme}.png` });
        await C.choose('Canvas');
      }
      // The pointer over History's answer, with the Custom… accent that tints it most: white in dark, black in light.
      // Never under 3:1, and still grey beside the digits.
      for (const [scheme, hex] of [['dark', '#ffffff'], ['light', '#000000']]) {
        await C.page.emulateMedia({ colorScheme: scheme }); await C.custom(hex);
        await C.press(['clear']); await C.press('17÷5=');
        await C.W.locator('#history .hline:last-child .hans').hover(); await C.page.waitForTimeout(250);
        const r = await C.R('#history .hline:last-child .hans .ce-r'), c = r ? contrast(r.color, r.bg) : 0, d = r && r.digit ? contrast(r.color, r.digit.color) : 0;
        const grey = !!r && (Math.max(...r.color.match(/\d+/g).map(Number)) - Math.min(...r.color.match(/\d+/g).map(Number))) <= 30;
        ok(c >= 3 && grey && d >= 1.8, `${scheme}, Custom… ${hex}: with the pointer over History’s answer, the R is still 3:1 or more, and grey beside the digits (${r && r.color} on ${r && r.bg}, ${c.toFixed(2)}:1; ${d.toFixed(2)}:1 against the digits)`);
        await C.page.mouse.move(5, 5);
      }
      await C.page.emulateMedia({ colorScheme: 'light' });
      await C.ctx.close();
    });

    // ---- 2. Going on from 3 R 2: 17/5 in the ans box, every way to go on. Other answers as before.
    await part('Going on', async () => {
      const C = await calcBoard();
      await C.choose('With remainders'); await C.choose('History'); await C.choose('In words');
      await C.press(['clear']); await C.press('17÷5=×5='); let L = await C.look();
      ok(L.eq === '17/5 × 5 = 17' && L.box && L.box.text === '17/5' && L.box.stacked, `17 ÷ 5 = then × 5 =: “${L.eq}”, a stacked 17/5 in the ans box (${JSON.stringify(L.box)})`);
      ok(L.said === '17 over 5 times 5 equals 17' && L.eqLabel === L.said, `In words and a screen reader: “${L.said}”`);
      const last = L.hist[L.hist.length - 1] || {};
      ok(last.expr === '17/5 × 5' && last.box && last.box.stacked && last.ans === '17', `History shows it the same way (${JSON.stringify(last)})`);
      await C.press(['clear']); await C.press('100÷3=='); L = await C.look();
      ok(L.box && L.box.text === '100/3' && L.box.stacked && L.eq === '100/3 ÷ 3 = 11.11111111', `100 ÷ 3 = 33 R 1, then = again: “${L.eq}”`);
      await C.press(['clear']); await C.press('17÷5='); await C.press(['ans']); L = await C.look();
      ok(L.eq === '17/5' && L.box && L.box.stacked, `the ans key after 3 R 2: ${L.eq}`);
      await C.press(['clear']); await C.press('17÷5=÷5='); L = await C.look();
      ok(L.eq === '17/5 ÷ 5 = 0.68', `17/5 ÷ 5 isn’t a whole number ÷ a whole number: ${L.eq}`);
      // History's Use on a 3 R 2 line.
      await C.press(['clear']);
      const use = C.W.locator('#history .hans[aria-label="Use 3 remainder 2"]').first();
      await C.front(); await use.click(); await C.page.waitForTimeout(250); L = await C.look();
      ok(L.eq === '17/5' && L.box && L.box.stacked, `History’s “Use 3 remainder 2” puts in 17/5 (${L.eq})`);
      await C.press('×5='); L = await C.look();
      ok(L.eq === '17/5 × 5 = 17', `...and × 5 = gives ${L.eq}`);
      // The box follows the answer it came from.
      for (const [keys, eq] of [['2+17÷5=×5=', '5.4 × 5 = 27'], ['15÷5=×2=', '3 × 2 = 6']]) {
        await C.press(['clear']); await C.press(keys); L = await C.look();
        ok(L.eq === eq && !(L.box && L.box.stacked), `${keys}: ${eq} (${L.eq})`);
      }
      // ⇄, then going on: what As fractions does, the fraction.
      await C.press(['clear']); await C.press('17÷5='); await C.W.locator('#eqToggle').click(); await C.page.waitForTimeout(250);
      L = await C.look();
      ok(L.eq === '17 ÷ 5 = 3.4', `⇄: ${L.eq}`);
      await C.press('×5='); L = await C.look();
      ok(L.eq === '17/5 × 5 = 17' && L.box && L.box.stacked, `⇄ to 3.4, then × 5 =: ${L.eq}, as As fractions does`);
      // Canvas off: the problem above the big display, and the big display while typing.
      await C.choose('Canvas'); await C.press(['clear']); await C.press('17÷5=×'); L = await C.look();
      ok(L.x === '17/5 ×' && L.xBox && L.xBox.stacked && L.big === '17/5' && L.bigFrac, `Canvas off: “${L.x}”, and the big display shows ${L.big}`);
      // The problem line keeps its height above a tall 17/5, also where the display is short: 1150 × 640 with History.
      const was = await C.page.evaluate(ik => window.__board21.state.insts.get(ik).rect, C.ik);
      for (const rect of [was, { x: 40, y: 40, w: 1150, h: 640 }]) {
        await C.page.evaluate(([ik, r]) => window.__board21.setRect(ik, r), [C.ik, rect]); await C.page.waitForTimeout(700);
        const size = `${rect.w} × ${rect.h}`;
        await C.press(['clear']); await C.press('17÷5=×'); L = await C.look();
        C.shows(await C.disp(), `${size}, Canvas off: “${L.x}” shows in full above the big ${L.big}`);
        await C.choose('As fractions'); await C.press(['clear']); await C.press('17÷5='); L = await C.look();
        C.shows(await C.disp(), `${size}, Canvas off, As fractions: “${L.x}” shows in full above the big ${L.big}`);
        await C.choose('With remainders');
      }
      await C.page.evaluate(([ik, r]) => window.__board21.setRect(ik, r), [C.ik, was]); await C.page.waitForTimeout(700);
      await C.choose('Canvas');
      // Hide the answer works as before.
      await C.choose('Hide the answer'); await C.press(['clear']); await C.press('17÷5=×5='); L = await C.look();
      ok(L.reveal && L.eq === '17/5 × 5 = ?' && (L.hist[L.hist.length - 1] || {}).ans === '?', `Hide the answer: ${L.eq}`);
      await C.W.locator('#eq .reveal').click(); await C.page.waitForTimeout(300); L = await C.look();
      ok(L.eq === '17/5 × 5 = 17', `a tap shows it: ${L.eq}`);
      await C.choose('Hide the answer');
      // Saved: the board opened again shows the same.
      await C.press(['clear']); await C.press('17÷5=×5='); await C.page.waitForTimeout(800); await C.reload(); L = await C.look();
      ok(L.eq === '17/5 × 5 = 17' && L.box && L.box.stacked, `opened again: ${L.eq}`);
      // As decimals and As fractions as before.
      await C.choose('As decimals'); await C.press(['clear']); await C.press('17÷5=×5='); L = await C.look();
      ok(L.eq === '3.4 × 5 = 17' && L.box && !L.box.stacked, `As decimals: ${L.eq}`);
      await C.choose('As fractions'); await C.press(['clear']); await C.press('17÷5='); await C.W.locator('#eqToggle').click(); await C.page.waitForTimeout(250); await C.press('×5='); L = await C.look();
      ok(L.eq === '17/5 × 5 = 17' && L.box && L.box.stacked, `As fractions, ⇄ to 3.4, then × 5 =: ${L.eq}`);
      await C.page.screenshot({ path: OUT + 'calculator-17-5.png' });
      await C.ctx.close();
    });

    // ---- 3. The docs, and the 6–7 idea kept.
    await part('Docs', async () => {
      const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
      const man = read('docs/calculator-manual/page-src.html');
      const j = man.indexOf('<h3>Remainders</h3>'), card = man.slice(j, man.indexOf('<div class="pg-exs">', j)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const ceCss = (/^\.ce-r \{[^}]*\}$/m.exec(read('widgets/calculator/calc-engine.js')) || [''])[0];
      ok(ceCss === '.ce-r { color: var(--b21-muted, #6b7280); }' && man.includes('/*@CECSS*/') && /\.cx \{[^}]*--b21-muted: var\(--muted\)/.test(man),
        `the manual’s examples draw the R in the page’s own muted color: the engine’s “${ceCss}”, under .cx, which takes --b21-muted from the page`);
      ok(/\.ce-r\b/.test(read('docs/calculator-manual/check.js')), 'the manual’s check.js measures its R');
      for (const f of ['README.md', 'docs/DATA-FORMAT.md']) ok(!/ans shows 3\.4|ans (?:is|shows) a decimal/i.test(read(f)), `${f}: nothing says ans shows a decimal after a remainder`);
      const data = read('docs/DATA-FORMAT.md').replace(/\s+/g, ' ');
      ok(/\{ ans: "7\/2" \}/.test(data) && /`rem: true`/.test(data), 'DATA-FORMAT: a saved ans box from a remainder answer has rem: true');
      const guide = read('docs/teacher-guide/page-src.html');
      ok(stamped(), STAMPED);
    });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
  }],
  ['Calculator: tall windows stack', async (browser) => {
    const errors = [];
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const r1 = n => Math.round(n * 10) / 10, kdim = L => `${r1(L.kw)} × ${r1(L.kh)}`;
    const clampN = (lo, v, hi) => Math.max(lo, Math.min(v, hi));
    // The Calculator's padding and gap for a window w × h, as its metrics() works them out.
    const pad = (w, h) => { const m = Math.min(w, h); return { P: clampN(8, m * .02, 28), G: clampN(5, m * .013, 16) }; };
    // What side by side gave a key on the old code (2026.11.23-4), from its layout(): the keys' column at most 40% of the
    // width, each key a sixth of the height. Basic keys, the canvas on, History off.
    const oldSide = (w, h) => {
      const { P, G } = pad(w, h), availH = h - 2 * P, keysW = clampN(4 * 44.5 + 3 * G, availH * 4 / 6 * 1.12, (w - 2 * P) * .4);
      return { kw: (keysW - 3 * G) / 4, kh: (availH - 5 * G) / 6 };
    };
    // Today's keys under the compact display (Canvas off), from layout(): their height and their column's width.
    const oldUnder = (w, h, rows = 6) => {
      const { P, G } = pad(w, h), mainW = w - 2 * P, availH = h - 2 * P;
      const keysH = clampN(rows * 44.5 + (rows - 1) * G, Math.min(mainW * rows / 4 * .72, availH * .7), availH - G - 76);
      return { h: keysH, w: Math.min(mainW, Math.round(keysH * 4 / rows * 1.5)) };
    };
    // A board 1920 × 1200, the screen at 100%, so window px are screen px, with a Calculator window on it.
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    let ik = await addWin(page, 'calculator');
    await eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
    await page.waitForTimeout(600);
    const W = () => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const front = () => page.evaluate(ik => { if (window.__board21.state.focused !== ik) window.__board21.focusWin(ik); }, ik);
    const choose = async label => {
      await front();
      await page.click(`.win[data-ikey="${ik}"] .win-label`);
      await page.locator('#menu [data-act="widget"]').filter({ has: page.locator('.label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click({ timeout: 3000 });
      await page.waitForTimeout(700);
    };
    const ticked = label => page.evaluate(([ik, label]) => { const w = window.__board21.state.wins.get(ik), i = w && w.menuItems.find(i => i.label === label); return !!(i && i.checked); }, [ik, label]);
    const set = async (label, on) => { if (await ticked(label) !== on) await choose(label); };
    const size = async (w, h, wait = 450) => { await page.evaluate(([ik, w, h]) => window.__board21.setRect(ik, { x: 40, y: 20, w, h: h + 40 }), [ik, w, h]); await page.waitForTimeout(wait); };
    const content = () => contentOf(page, ik);
    // What the window shows: its layout, the 7 key's size (every digit key has it), the smallest side of any key, and
    // where the canvas, the display, the keys, and History are.
    const look = () => W().locator('html').evaluate(() => {
      const $ = id => document.getElementById(id), shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
      const keys = [...document.querySelectorAll('#keys .key')].filter(shown).map(box), seven = box(document.querySelector('#keys .key[data-key="7"]'));
      return {
        layout: $('app').dataset.layout, vw: innerWidth, vh: innerHeight, kw: seven.w, kh: seven.h, n: keys.length,
        keyMin: Math.min(...keys.map(k => Math.min(k.w, k.h))), inside: keys.every(k => k.x >= -0.5 && k.y >= -0.5 && k.r <= innerWidth + 0.5 && k.b <= innerHeight + 0.5),
        card: shown($('card')) ? box($('card')) : null, disp: shown($('disp')) ? box($('disp')) : null, player: shown($('player')),
        keys: box($('keys')), hist: shown($('history')) ? box($('history')) : null, eq: $('eq').textContent.replace(/\s+/g, ' ').trim()
      };
    });
    // Every change of layout from now on, as "side→stack".
    const watch = () => W().locator('html').evaluate(() => {
      const app = document.getElementById('app');
      window.__flips = [];
      if (window.__flipObs) window.__flipObs.disconnect();
      window.__flipObs = new MutationObserver(ms => ms.forEach((m, i) => {
        const now = i + 1 < ms.length ? ms[i + 1].oldValue : app.dataset.layout;
        if (m.oldValue !== now) window.__flips.push(m.oldValue + '→' + now);
      }));
      window.__flipObs.observe(app, { attributes: true, attributeFilter: ['data-layout'], attributeOldValue: true });
    });
    const flips = () => W().locator('html').evaluate(() => window.__flips || []);
    const above = L => !!L.card && L.card.b <= L.keys.y + 1;
    const TYLER = [640, 1016];   // Tyler's window, from his screenshot: 0.63 wide for each 1 tall

    // ---- 1. Tyler's window and other tall ones stack: the canvas above the keys, and bigger keys than side by side gave.
    await part('Tall windows stack', async () => {
      // As in his picture: Desmos % off, so 5 + 10% means 5 and 10% more; In words, and Hide the answer, on.
      await set('Advanced keys', true); await set('Desmos %', false); await set('Advanced keys', false); await set('In words', true); await set('Hide the answer', true);
      await front(); await W().locator('#app').click({ position: { x: 3, y: 3 } }); await page.keyboard.type('5+10%='); await page.waitForTimeout(300);
      for (const [w, h, what] of [[...TYLER, 'Tyler’s window'], [600, 960, 'a narrower one'], [700, 1000, 'a wider one'], [760, 1100, 'a big one'], [900, 1100, 'a wide, tall one']]) {
        await size(w, h); const L = await look(), o = oldSide(w, h);
        ok(L.layout === 'stack' && above(L) && Math.min(L.kw, L.kh) > Math.min(o.kw, o.kh) + 1,
          `${w} × ${h}, ${what}: the canvas above the keys, each key ${kdim(L)}, its shorter side bigger than side by side gave it (${r1(o.kw)} × ${r1(o.kh)}) (${L.layout})`);
        if (w === TYLER[0]) {
          ok(L.player && /^5\s*\+\s*10%\s*=\s*\?$/.test(L.eq), `there the canvas keeps its steps, and shows ${L.eq}`);
          await page.screenshot({ path: OUT + 'calculator-tall-tyler.png', clip: { x: 40, y: 20, width: w, height: h + 40 } });
        }
      }
      await size(...TYLER); await page.reload(); await boardUp(page); await page.waitForTimeout(1500);
      const L = await look();
      ok(L.layout === 'stack', `after a reload, Tyler’s window still stacks (${L.layout})`);
      await set('Hide the answer', false); await set('In words', false);
    });

    // ---- 2. A new window, 900 × 600, stays side by side: Basic keys, Advanced keys, and History.
    await part('900 × 600 stays side by side', async () => {
      await size(900, 600, 700); await watch();
      let L = await look();
      ok(L.layout === 'side' && L.card && L.card.r <= L.keys.x + 1, `900 × 600: the canvas beside the keys (${L.layout}, keys ${kdim(L)})`);
      const k0 = Math.min(L.kw, L.kh);
      await choose('Advanced keys'); await page.waitForTimeout(500); L = await look(); let c = await content();
      ok(L.layout === 'side' && L.n === 31 && c.h > 600 && Math.abs(Math.min(L.kw, L.kh) - k0) <= 2.5,
        `Advanced keys: still side by side, the window taller (${c.w} × ${c.h}), each key as big as before (${r1(Math.min(L.kw, L.kh))}, was ${r1(k0)})`);
      await choose('Advanced keys'); await page.waitForTimeout(500); L = await look(); c = await content();
      ok(L.layout === 'side' && c.w === 900 && c.h === 600 && Math.abs(Math.min(L.kw, L.kh) - k0) <= 1, `Advanced keys off: 900 × 600 again, side by side (${c.w} × ${c.h}, ${L.layout})`);
      await choose('History'); L = await look(); c = await content();
      ok(L.layout === 'side' && !!L.hist && c.w > 900, `History: wider (${c.w} × ${c.h}), still side by side (${L.layout})`);
      await choose('History'); c = await content();
      ok(c.w === 900 && c.h === 600 && (await look()).layout === 'side', `History off: 900 × 600 again (${c.w} × ${c.h})`);
      // History on where the board has no room to widen: History narrows, and the canvas stays beside the keys.
      await set('History', true); await size(960, 600); L = await look();
      ok(L.layout === 'side' && !!L.hist, `History in a 960 × 600 window: still side by side (${L.layout})`);
      await set('History', false); await size(900, 600);
      const f = await flips();
      ok(!f.length, `no flips through all of that (${f.join(', ') || 'none'})`);
    });

    // ---- 3. Advanced keys on and off near the switch, and at 900 × 600: no flip; the keys keep their size, and the canvas
    // its steps, side by side and stacked.
    let Hs = 0;
    await part('Advanced keys never flip it', async () => {
      // Where it switches at 700 px wide, from side by side, 10 px at a time.
      await size(700, 600);
      for (let h = 600; h <= 1000 && !Hs; h += 10) { await size(700, h, 300); if ((await look()).layout === 'stack') Hs = h; }
      ok(Hs > 600 && Hs < 760, `700 px wide, it stacks from about ${Hs || 'never'} px tall`);
      Hs = Hs || 700;
      for (const [h, want] of [[Hs - 20, 'side'], [Hs + 20, 'stack']]) {
        await size(700, 600); await size(700, h, 600); await watch();
        const L0 = await look(), c0 = await content(), k0 = Math.min(L0.kw, L0.kh);
        await choose('Advanced keys'); await page.waitForTimeout(500);
        const L1 = await look(), k1 = Math.min(L1.kw, L1.kh);
        await choose('Advanced keys'); await page.waitForTimeout(500);
        const L2 = await look(), c2 = await content(), k2 = Math.min(L2.kw, L2.kh), f = await flips();
        ok(L0.layout === want && L1.layout === want && L2.layout === want && !f.length && L1.n === 31 && L1.keyMin >= 44,
          `700 × ${h}, ${want === 'side' ? 'side by side' : 'stacked'}: Advanced keys on and off, it stays ${want === 'side' ? 'side by side' : 'stacked'} (${[L0, L1, L2].map(l => l.layout).join(', ')}; flips: ${f.join(', ') || 'none'})`);
        ok(Math.abs(k1 - k0) <= 1.5 && L1.player && Math.abs(k2 - k0) <= 1 && c2.w === c0.w && c2.h === c0.h,
          `and the keys keep their size: ${r1(k0)}, ${r1(k1)} with Advanced keys, ${r1(k2)} after; the canvas keeps its steps (${L1.player ? 'shown' : 'hidden'}; ${c0.w} × ${c0.h}, then ${c2.w} × ${c2.h})`);
      }
      // Stacked just past the switch: Advanced keys make the window taller, so the keys keep their size and the canvas its
      // steps. Turned off, the window is its own size again.
      for (const [w, h] of [[640, 670], [620, 660], [700, 730], [900, 840]]) {
        await size(w, 600); await size(w, h, 600); await watch();
        const L0 = await look(), c0 = await content(), k0 = Math.min(L0.kw, L0.kh);
        await choose('Advanced keys'); await page.waitForTimeout(500);
        const L1 = await look(), c1 = await content(), k1 = Math.min(L1.kw, L1.kh);
        await choose('Advanced keys'); await page.waitForTimeout(500);
        const L2 = await look(), c2 = await content(), f = await flips();
        ok(L0.layout === 'stack' && L0.player && L1.layout === 'stack' && L1.player && L1.n === 31 && c1.h > c0.h && Math.abs(k1 - k0) <= 1.5,
          `${w} × ${h}, stacked: Advanced keys make it taller (${c1.w} × ${c1.h}), each key as big as before (${r1(k1)}, was ${r1(k0)}), and the canvas keeps its steps (${L1.player ? 'shown' : 'hidden'})`);
        ok(L2.layout === 'stack' && c2.w === c0.w && c2.h === c0.h && !f.length, `and off: ${c2.w} × ${c2.h} again, still stacked (flips: ${f.join(', ') || 'none'})`);
      }
      // With History beside the keys, Advanced keys never push the canvas above them: History widens as the window grows.
      // History turned on in a 1000 × 640 window, which widens it; and a window 1250 × 560 with History on.
      for (const [w, h, sized] of [[1000, 640, false], [1250, 560, true]]) {
        if (sized) { await set('History', true); await size(w, h, 600); } else { await size(w, h, 600); await choose('History'); }
        await watch();
        const L0 = await look(), c0 = await content(), k0 = Math.min(L0.kw, L0.kh);
        await choose('Advanced keys'); await page.waitForTimeout(500);
        const L1 = await look(), c1 = await content(), k1 = Math.min(L1.kw, L1.kh);
        await choose('Advanced keys'); await page.waitForTimeout(500);
        const L2 = await look(), c2 = await content(), f = await flips();
        ok(L0.layout === 'side' && !!L0.hist && L1.layout === 'side' && !!L1.hist && L1.n === 31 && c1.h > c0.h && k1 >= .8 * k0 && L2.layout === 'side' && c2.w === c0.w && c2.h === c0.h && !f.length,
          `${w} × ${h}${sized ? ' with History' : `, then History (${c0.w} × ${c0.h})`}, then Advanced keys: taller (${c1.w} × ${c1.h}), still side by side, each key ${r1(k1)}, was ${r1(k0)}; off: ${c2.w} × ${c2.h} (${[L0, L1, L2].map(l => l.layout).join(', ')}; flips: ${f.join(', ') || 'none'})`);
        await choose('History');
      }
    });

    // ---- 4. Dragging the window's bottom edge, or its right edge, across the switch, a finger's few px back now and then:
    // it switches once.
    await part('A drag switches once', async () => {
      await size(700, 600, 600); await front(); await watch();
      const drag = async (from, to, grip = 's') => {
        const g = await page.locator(`.win[data-ikey="${ik}"] .grip.${grip}`).boundingBox();
        const x0 = g.x + g.width / 2, y0 = g.y + g.height / 2, dir = Math.sign(to - from), at = d => grip === 's' ? [x0, y0 + d] : [x0 + d, y0];
        await page.mouse.move(...at(0)); await page.mouse.down();
        let d = 0;
        while ((to - from) * ((to - from) - d) > 0) {
          d += 8 * dir; await page.mouse.move(...at(d)); await page.waitForTimeout(34);
          d -= 4 * dir; await page.mouse.move(...at(d)); await page.waitForTimeout(34);
        }
        await page.mouse.move(...at(to - from)); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(500);
      };
      await drag(600, 860);
      let c = await content(), f = await flips(), L = await look();
      ok(c.h > 820 && L.layout === 'stack' && f.length === 1 && f[0] === 'side→stack', `dragged from 700 × 600 to ${c.w} × ${c.h}: it stacks once (${f.join(', ') || 'no switch'})`);
      await watch(); await drag(860, 600);
      c = await content(); f = await flips(); L = await look();
      ok(c.h < 640 && L.layout === 'side' && f.length === 1 && f[0] === 'stack→side', `and back to ${c.w} × ${c.h}: side by side again, once (${f.join(', ') || 'no switch'})`);
      // The right edge, 600 px tall: narrower than the canvas beside the keys allows, and back.
      await size(700, 600, 600); await front(); await watch(); await drag(700, 560, 'e');
      c = await content(); f = await flips(); L = await look();
      ok(c.w < 580 && L.layout === 'stack' && f.length === 1 && f[0] === 'side→stack', `the right edge from 700 × 600 to ${c.w} × ${c.h}: it stacks once (${f.join(', ') || 'no switch'})`);
      await watch(); await drag(560, 700, 'e');
      c = await content(); f = await flips(); L = await look();
      ok(c.w > 680 && L.layout === 'side' && f.length === 1 && f[0] === 'stack→side', `and back to ${c.w} × ${c.h}: side by side again, once (${f.join(', ') || 'no switch'})`);
    });

    // ---- 5. The sweep: wide to tall and wide to narrow, Basic and Advanced keys, History off and on. Every key 44 px or
    // more; a window much taller than wide stacks; side by side never gives keys twice as tall as wide; stacked keys are
    // never more than 1.5 times as wide as tall; stacked where the canvas could sit beside, its steps still show.
    await part('The sweep', async () => {
      const widths = [], heights = [];
      for (let w = 1100; w >= 500; w -= 50) widths.push([w, 640]);
      for (let h = 500; h <= 1100; h += 50) heights.push([700, h]);
      let small = [], tallSide = [], worstSide = { r: 0 }, worstStack = { r: 0 }, noSteps = [];
      for (const adv of [false, true]) for (const hist of [false, true]) {
        await set('Advanced keys', adv); await set('History', hist);
        for (const [name, list] of [['width 1100 to 500 at 640 tall', widths], ['height 500 to 1100 at 700 wide', heights], ['Tyler’s shape', [TYLER]]]) {
          await size(...list[0], 600);
          const rows = [];
          for (const [w, h] of list) {
            await size(w, h, 350); const L = await look();
            rows.push(Object.assign({ w, h }, L));
            const at = `${w} × ${h}${adv ? ', Advanced' : ''}${hist ? ', History' : ''}`;
            if (L.keyMin < 44 || !L.inside) small.push(`${at}: ${r1(L.keyMin)}`);
            if (h >= 1.2 * w && L.layout !== 'stack') tallSide.push(at);
            if (L.layout === 'side' && L.kh / L.kw > worstSide.r) worstSide = { r: L.kh / L.kw, at, k: kdim(L) };
            if (L.layout === 'stack' && L.card && L.kw / L.kh > worstStack.r) worstStack = { r: L.kw / L.kh, at, k: kdim(L) };
            if (!hist && w >= 620 && L.layout === 'stack' && L.card && !L.player) noSteps.push(at);
          }
          // Where it switches, and each key's shape either side.
          const sw = rows.slice(1).map((r, i) => [rows[i], r]).filter(([a, b]) => a.layout !== b.layout).map(([a, b]) => `${a.w} × ${a.h} ${a.layout} ${kdim(a)} → ${b.w} × ${b.h} ${b.layout} ${kdim(b)}`);
          console.log(`    ${adv ? 'Advanced' : 'Basic'}, History ${hist ? 'on' : 'off'}, ${name}: ${sw.join('; ') || 'no switch (' + rows[0].layout + ')'}`);
          console.log('      ' + rows.map(r => `${r.w}×${r.h} ${r.layout[1]} ${Math.round(r.kw)}×${Math.round(r.kh)}`).join(' | '));
        }
      }
      ok(!small.length, `every key 44 px or more, and in its window, across the sweep (${small.join(', ') || 'all'})`);
      ok(!tallSide.length, `every window at least 1.2 times as tall as wide stacks (${tallSide.join(', ') || 'all'})`);
      ok(worstSide.r <= 2, `side by side, a key is at most ${r1(worstSide.r)} times as tall as wide (${worstSide.at}: ${worstSide.k})`);
      ok(worstStack.r <= 1.52, `stacked under the canvas, a key is at most ${r1(worstStack.r * 100) / 100} times as wide as tall (${worstStack.at}: ${worstStack.k})`);
      ok(!noSteps.length, `stacked where the canvas could sit beside the keys, its steps still show (${noSteps.join(', ') || 'all'})`);
      await set('Advanced keys', false); await set('History', false);
    });

    // ---- 6. Canvas off keeps today's compact display. Swap sides works stacked and side by side. Canvas, History, and
    // Reset in Tyler's window: no flip, and its size comes back.
    await part('Canvas off, Swap sides, and Reset', async () => {
      for (const [w, h] of [TYLER, [900, 600]]) {
        await size(w, h); await set('Canvas', false); await page.waitForTimeout(300);
        const L = await look(), o = oldUnder(L.vw, L.vh);
        ok(L.layout === 'stack' && !!L.disp && !L.card && L.disp.b <= L.keys.y + 1 && Math.abs(L.keys.w - o.w) <= 1 && Math.abs(L.keys.h - o.h) <= 1,
          `${w} × ${h}, Canvas off: the display above the keys, as today (keys ${r1(L.keys.w)} × ${r1(L.keys.h)}, today ${r1(o.w)} × ${r1(o.h)}, in ${L.vw} × ${L.vh})`);
        await set('Canvas', true);
      }
      // Swap sides, side by side: the keys, then the canvas. Stacked, with History: History across the top (2026.11.24-5), then
      // the canvas above the keys.
      await size(900, 600); await choose('Swap sides'); let L = await look();
      ok(L.layout === 'side' && L.card && L.keys.r <= L.card.x + 1, `Swap sides at 900 × 600: the keys, then the canvas (${L.layout})`);
      await size(...TYLER); await choose('History'); L = await look();
      ok(L.layout === 'stack' && above(L) && !!L.hist && L.hist.b <= L.card.y + 1 && L.hist.w >= L.card.w - 1, `Swap sides in Tyler’s window, with History: History across the top, the canvas above the keys (${L.layout})`);
      await choose('History'); await choose('Swap sides');
      // Canvas and History off and on: no flip, and the window keeps its size. (History goes across the top: 2026.11.24-5.)
      await size(...TYLER, 600); await watch();
      const c0 = await content();
      await choose('Canvas'); await choose('Canvas'); let c = await content(); L = await look();
      ok(L.layout === 'stack' && above(L) && c.w === c0.w && c.h === c0.h, `Tyler’s window, Canvas off and on: the canvas back above the keys, the window still ${c.w} × ${c.h}`);
      await choose('History'); const ch = await content(); const Lh = await look(); await choose('History'); c = await content(); L = await look();
      ok(Lh.layout === 'stack' && ch.w === c0.w && L.layout === 'stack' && c.w === c0.w && c.h === c0.h, `History on and off: the same width (${ch.w}), still stacked, then ${c.w} × ${c.h} again`);
      let f = await flips();
      ok(!f.length, `no flips (${f.join(', ') || 'none'})`);
      // Reset: a new window, 900 × 600, side by side, and it stays so.
      await front(); await page.click(`.win[data-ikey="${ik}"] .win-label`); await page.locator('#menu [data-act="reset"]').click(); await page.locator('#menu [data-act="reset-yes"]').click();
      await page.waitForTimeout(1500); await watch(); await page.waitForTimeout(1200);
      c = await content(); L = await look(); f = await flips();
      ok(c.w === 900 && c.h === 600 && L.layout === 'side' && !f.length, `Reset: 900 × 600, side by side, and it stays so (${c.w} × ${c.h}, ${L.layout}; flips: ${f.join(', ') || 'none'})`);
      // Near the switch, a window sits where it was. History on and off, Fill the board and back, and the canvas off and on
      // leave it there, at its own size.
      const trip = async (w, h, from, what) => {
        await size(w, from, 600); await size(w, h, 600);
        const L0 = await look(), c0 = await content(), seen = [];
        if (what.includes('History')) { await choose('History'); seen.push((await look()).layout); await choose('History'); seen.push((await look()).layout); }
        if (what.includes('Fill')) {
          await page.evaluate(ik => window.__board21.setMaximized(ik, true), ik); await page.waitForTimeout(900); seen.push((await look()).layout);
          await page.evaluate(ik => window.__board21.setMaximized(ik, false), ik); await page.waitForTimeout(900); seen.push((await look()).layout);
        }
        if (what.includes('Canvas')) { await choose('Canvas'); await choose('Canvas'); seen.push((await look()).layout); }
        await page.waitForTimeout(300);
        const L1 = await look(), c1 = await content();
        ok(L1.layout === L0.layout && c1.w === c0.w && c1.h === c0.h, `${w} × ${h}, reached from ${w} × ${from} (${L0.layout === 'side' ? 'side by side' : 'stacked'}): ${what.join(', ')}, then still ${L1.layout === 'side' ? 'side by side' : 'stacked'} at ${c1.w} × ${c1.h} (on the way: ${seen.join(', ')})`);
      };
      await trip(700, 697, 600, ['History', 'Fill', 'Canvas']);
      await trip(700, 697, 800, ['History', 'Fill']);
      await trip(640, 660, 560, ['History', 'Fill', 'Canvas']);
      await trip(640, 660, 800, ['History', 'Fill', 'Canvas']);
      // The canvas turned on in a window about as wide as tall widens it, side by side, as before. (From a stacked one.)
      await size(700, 800, 600); await set('Canvas', false); await size(700, 700, 600);
      await choose('Canvas'); c = await content(); L = await look();
      ok(L.layout === 'side' && c.w > 1200 && c.h === 700, `the canvas on in a 700 × 700 window: wider (${c.w} × ${c.h}), side by side (${L.layout})`);
      await choose('Canvas'); c = await content();
      ok(c.w === 700 && c.h === 700, `and off: 700 × 700 again (${c.w} × ${c.h})`);
      await set('Canvas', true);
    });

    // ---- 7. Fill the board stays side by side: a 16:9 board, and the screen at 1366 × 768 and 1920 × 1080, History off and on.
    await part('Fill the board', async () => {
      await page.evaluate(ik => window.__board21.setMaximized(ik, true), ik); await page.waitForTimeout(600);
      for (const [vw, vh, shape] of [[1366, 768, '16:9'], [1366, 768, 'free'], [1920, 1080, 'free'], [1920, 1080, '16:9']]) {
        await page.setViewportSize({ width: vw, height: vh });
        await page.evaluate(([shape]) => { window.__board21.setBoardShape(shape); window.__board21.setBoardScale(shape === 'free' ? 1 : 0.8); }, [shape]);
        await page.waitForTimeout(700);
        for (const hist of [false, true]) {
          await set('History', hist); const L = await look();
          ok(L.layout === 'side' && !!L.hist === hist && L.keyMin >= 44, `Fill the board, a ${shape === 'free' ? 'board the size of the screen' : '16:9 board'} at ${vw} × ${vh}, History ${hist ? 'on' : 'off'}: side by side (${L.vw} × ${L.vh}, keys ${kdim(L)})`);
        }
        await set('History', false);
      }
      await page.evaluate(ik => window.__board21.setMaximized(ik, false), ik); await page.waitForTimeout(400);
    });

    // ---- 8. The docs: the README and the manual say tall windows stack too.
    await part('Docs', async () => {
      const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
      const readme = read('README.md').replace(/\s+/g, ' '), sec = readme.slice(readme.indexOf('## Calculator'), readme.indexOf('## ', readme.indexOf('## Calculator') + 5));
      const man = read('docs/calculator-manual/page-src.html');
      ok(man.includes('<h3>Tall or narrow windows</h3>') && !man.includes('<h3>Narrow windows</h3>'), 'the manual’s card is “Tall or narrow windows”');
      ok(stamped(), STAMPED);
    });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Calculator: History across the top in a tall window', async (browser) => {
    const errors = [];
    const part = async (name, fn) => { try { await fn(); } catch (err) { ok(false, `${name}: crashed: ${(err && err.stack) || err}`); } };
    const r1 = n => Math.round(n * 10) / 10, kdim = L => `${r1(L.kw)} × ${r1(L.kh)}`, kmin = L => Math.min(L.kw, L.kh);
    const clampN = (lo, v, hi) => Math.max(lo, Math.min(v, hi));
    const padOf = (w, h) => clampN(8, Math.min(w, h) * .02, 28);
    // A board 1920 × 1400, the screen at 100%, so window px are screen px, with a Calculator window on it. (Tall enough
    // for Advanced keys to grow a 640 × 1016 window.)
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1400 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const ik = await addWin(page, 'calculator');
    await eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
    await page.waitForTimeout(600);
    const W = () => page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const front = () => page.evaluate(ik => { if (window.__board21.state.focused !== ik) window.__board21.focusWin(ik); }, ik);
    const choose = async label => {
      await front();
      await page.click(`.win[data-ikey="${ik}"] .win-label`);
      await page.locator('#menu [data-act="widget"]').filter({ has: page.locator('.label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click({ timeout: 3000 });
      await page.waitForTimeout(700);
    };
    const ticked = label => page.evaluate(([ik, label]) => { const w = window.__board21.state.wins.get(ik), i = w && w.menuItems.find(i => i.label === label); return !!(i && i.checked); }, [ik, label]);
    const set = async (label, on) => { if (await ticked(label) !== on) await choose(label); };
    const size = async (w, h, wait = 450) => { await page.evaluate(([ik, w, h]) => window.__board21.setRect(ik, { x: 40, y: 20, w, h: h + 40 }), [ik, w, h]); await page.waitForTimeout(wait); };
    const content = () => contentOf(page, ik);
    const type = async t => { await front(); await W().locator('#app').click({ position: { x: 3, y: 3 } }); await page.keyboard.type(t); await page.waitForTimeout(350); };
    // What the window shows: where History is (from the grid: 'top' when it has a row of its own above the rest), the 7
    // key's size, the smallest side of any key, the boxes of the canvas, the display, the keys, and History, and History's
    // lines: how many show in full, and whether the newest does.
    const look = () => W().locator('html').evaluate(() => {
      const $ = id => document.getElementById(id), shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
      const keys = [...document.querySelectorAll('#keys .key')].filter(shown).map(box), seven = box(document.querySelector('#keys .key[data-key="7"]'));
      const areas = $('grid').style.gridTemplateAreas || '', rows = areas.match(/"[^"]*"/g) || [];
      const place = !/hist/.test(areas) ? 'none' : rows.length > 1 && rows[0].replace(/"/g, '').trim().split(/\s+/).every(a => a === 'hist') && !rows.slice(1).some(r => /hist/.test(r)) ? 'top' : 'beside';
      const hl = $('hlist'), hr = hl.getBoundingClientRect(), lines = [...hl.querySelectorAll('li')];
      const inFull = l => { const r = l.getBoundingClientRect(); return r.height > 0 && r.top >= hr.top - .5 && r.bottom <= hr.bottom + .5; };
      return {
        place, layout: $('app').dataset.layout, vw: innerWidth, vh: innerHeight, kw: seven.w, kh: seven.h, n: keys.length,
        keyMin: Math.min(...keys.map(k => Math.min(k.w, k.h))), inside: keys.every(k => k.x >= -0.5 && k.y >= -0.5 && k.r <= innerWidth + 0.5 && k.b <= innerHeight + 0.5),
        card: shown($('card')) ? box($('card')) : null, disp: shown($('disp')) ? box($('disp')) : null, canvas: box($('canvas')), player: shown($('player')),
        keys: box($('keys')), seven, hist: shown($('history')) ? box($('history')) : null, hf: parseFloat(getComputedStyle(hl).fontSize),
        lines: lines.length, full: lines.filter(inFull).length, newest: lines.length ? inFull(lines[lines.length - 1]) : false,
        empty: (hl.querySelector('.hempty') || {}).textContent || '', cur: !!hl.querySelector('.hline.cur'),
        eq: $('eq').textContent.replace(/\s+/g, ' ').trim()
      };
    });
    // Every move of History from now on, as "beside→top", read from the grid each time the Calculator lays it out.
    const watch = () => W().locator('html').evaluate(() => {
      const grid = document.getElementById('grid');
      const where = () => { const a = grid.style.gridTemplateAreas || '', rows = a.match(/"[^"]*"/g) || []; return !/hist/.test(a) ? 'none' : rows.length > 1 && rows[0].replace(/"/g, '').trim().split(/\s+/).every(x => x === 'hist') && !rows.slice(1).some(r => /hist/.test(r)) ? 'top' : 'beside'; };
      window.__moves = []; window.__at = where();
      if (window.__moveObs) window.__moveObs.disconnect();
      window.__moveObs = new MutationObserver(() => { const now = where(); if (now !== window.__at) { window.__moves.push(window.__at + '→' + now); window.__at = now; } });
      window.__moveObs.observe(grid, { attributes: true, attributeFilter: ['style'] });
    });
    const moves = () => W().locator('html').evaluate(() => window.__moves || []);
    // History spans the window above the canvas (or the small display) and the keys.
    const across = L => !!L.hist && L.place === 'top' && L.hist.w >= L.vw - 2 * padOf(L.vw, L.vh) - 1 && L.hist.b <= (L.card || L.disp || L.canvas).y + 1 && L.hist.b <= L.keys.y + 1;
    const where = L => L.place === 'top' ? 'across the top' : L.place === 'beside' ? 'beside the keys' : 'hidden';
    const MOCK = { '640×1016': 74, '520×860': 56 };   // mockup A: the keys 111 × 74 and 85 × 56

    // The sweep's sizes: wide to narrow at 900 tall, short to tall at three widths, and Tyler's window.
    const SWEEP = [];
    for (let w = 1100; w >= 400; w -= 50) SWEEP.push(['width 1100 to 400 at 900 tall', w, 900]);
    for (const w of [520, 640, 700]) for (let h = 500; h <= 1100; h += 50) SWEEP.push([`height 500 to 1100 at ${w} wide`, w, h]);
    SWEEP.push(['Tyler’s window', 640, 1016]);
    // ---- 3. Tyler’s window and 520 × 860, in mockup A’s setup: History spans the window above the canvas, the keys are as
    // big as the mockup’s, the steps show, three lines or more show in full, and the newest is in view.
    await part('History across the top', async () => {
      await size(1000, 700, 600);
      await set('Advanced keys', true); await set('Desmos %', false); await set('Advanced keys', false); await set('In words', true); await set('History', true);
      await type('12*4='); await type('125-37='); await type('3.5*2=');
      await set('Hide the answer', true); await type('5+10%=');
      for (const [w, h] of [[640, 1016], [520, 860]]) {
        await size(w, h, 700); const L = await look(), m = MOCK[`${w}×${h}`];
        ok(across(L), `${w} × ${h}: History across the top, the window’s width, above the canvas (History ${L.hist ? r1(L.hist.w) + ' × ' + r1(L.hist.h) : 'hidden'}, ${where(L)})`);
        ok(kmin(L) >= m - .5 && L.keyMin >= 44.45, `and each key ${kdim(L)}, its shorter side at least mockup A’s ${m}`);
        ok(L.player && /^5\s*\+\s*10%\s*=\s*\?$/.test(L.eq), `the canvas keeps its steps (${L.player ? 'shown' : 'hidden'}), and shows ${L.eq}`);
        ok(L.full >= 3 && L.newest && L.lines === 4, `${L.full} of History’s ${L.lines} lines show in full, at ${r1(L.hf)} px, and the newest is in view (${L.newest})`);
        if (w === 640) await page.screenshot({ path: OUT + 'calculator-history-top.png', clip: { x: 40, y: 20, width: w, height: h + 40 } });
      }
      // Its look: the rounded panel, the lines, and the current line’s accent bar.
      const panel = await W().locator('#history').evaluate(h => { const cs = getComputedStyle(h), cur = h.querySelector('.hline.cur'), bar = cur && getComputedStyle(cur, '::before'); return { radius: parseFloat(cs.borderTopLeftRadius), ring: cs.boxShadow, bar: bar ? bar.backgroundColor : '', barW: bar ? parseFloat(bar.width) : 0 }; });
      const accent = await W().locator('html').evaluate(() => getComputedStyle(document.body).getPropertyValue('--b21-accent').trim());
      ok(panel.radius >= 12 && /inset/.test(panel.ring), `the band is History’s rounded panel (${panel.radius} px, ${panel.ring})`);
      ok(panel.barW >= 3, `the newest line, on the canvas, has its accent bar (${panel.bar}, ${panel.barW} px; accent ${accent})`);
      // In the band, tapping a problem changes it, and tapping an answer uses it.
      await set('Hide the answer', false); await set('In words', false);
      await W().locator('#history .hline').nth(1).locator('.hpick').click(); await page.waitForTimeout(250);
      let L = await look();
      ok(/^125 − 37( = 88)?$/.test(L.eq), `tapping 125 − 37 in the band puts it on the canvas to change (${L.eq})`);
      await front(); await page.keyboard.press('Backspace'); await type('8='); L = await look();
      ok(L.eq === '125 − 38 = 87' && L.lines === 5 && L.newest, `changed and worked out, it is a new line at the bottom, in view (${L.eq}; ${L.lines} lines)`);
      await W().locator('#keys .key[data-key="clear"]').click(); await W().locator('#history .hline').first().locator('.hans').click(); await page.waitForTimeout(200); await type('+2='); L = await look();
      ok(/^48\s*(ans)?\s*\+ 2 = 50$/.test(L.eq), `tapping 12 × 4’s answer uses it: ${L.eq}`);
    });

    // ---- 4. Nothing moves History at the same size: Advanced keys, the canvas, Steps, In words, Swap sides, Hide the
    // answer, an answer setting, or a new problem. In Tyler’s window, and near the switch either way.
    const toggles = async () => {
      for (const label of ['Canvas', 'Steps', 'In words', 'Swap sides', 'Hide the answer', 'As fractions', 'As decimals']) { await choose(label); if (!/^As /.test(label)) await choose(label); }
      await type('7*8=');
    };
    await part('Toggles never move History', async () => {
      // (830 px wide, at 1016 tall, is inside the dead band: History stays where it was.)
      for (const [w, h, fw, fh] of [[640, 1016, 640, 1016], [830, 1016, 760, 1016], [830, 1016, 900, 1016]]) {
        await size(fw, fh, 600); await size(w, h, 600); await watch();
        const L0 = await look(), c0 = await content();
        await toggles();
        await choose('Advanced keys'); await page.waitForTimeout(500); const La = await look();
        await choose('Advanced keys'); await page.waitForTimeout(500);
        const L1 = await look(), c1 = await content(), mv = await moves();
        ok(!mv.length && L1.place === L0.place && La.place === L0.place && c1.w === c0.w && c1.h === c0.h,
          `${w} × ${h}${fw !== w || fh !== h ? `, reached from ${fw} × ${fh}` : ''}: History stays ${where(L0)} through Canvas, Steps, In words, Swap sides, Hide the answer, As fractions, a new problem, and Advanced keys (moves: ${mv.join(', ') || 'none'}; ${c1.w} × ${c1.h})`);
      }
      // Advanced keys in a window with History across the top: taller, each key as big as before; off, the size comes back.
      for (const [w, h] of [[640, 1016], [520, 860]]) {
        await size(w, h, 600); await watch();
        const L0 = await look(), c0 = await content();
        await choose('Advanced keys'); await page.waitForTimeout(600);
        const L1 = await look(), c1 = await content();
        await choose('Advanced keys'); await page.waitForTimeout(600);
        const L2 = await look(), c2 = await content(), mv = await moves();
        ok(L0.place === 'top' && L1.place === 'top' && L1.n === 31 && c1.h > c0.h && Math.abs(kmin(L1) - kmin(L0)) <= 1.5 && L1.player,
          `${w} × ${h}, Advanced keys: taller (${c1.w} × ${c1.h}), each key as big as before (${r1(kmin(L1))}, was ${r1(kmin(L0))}), History still across the top, the steps still there`);
        ok(L2.place === 'top' && c2.w === c0.w && c2.h === c0.h && !mv.length, `and off: ${c2.w} × ${c2.h} again (moves: ${mv.join(', ') || 'none'})`);
      }
    });

    // ---- 4b. A panel gives back the width it took only while it's still where it was. Inside the dead band, History or
    // the canvas may sit in the other place at the same size, with no width to give back.
    await part('A panel gives back only the width it took', async () => {
      // The canvas: beside the keys under History at 800 × 800 reached from 700 × 800, above them reached from 900 × 800.
      await size(700, 800, 600); await size(800, 800, 600);
      let L = await look(); const cA = await content();
      await choose('Canvas'); const cOff = await content(); await choose('Canvas'); let c = await content();
      ok(L.place === 'top' && L.layout === 'side' && cOff.w < cA.w && c.w === cA.w && c.h === cA.h,
        `800 × 800, reached from 700 × 800: History across the top, the canvas beside the keys; Canvas off gives its width back (${cOff.w} × ${cOff.h}) and on takes it again (${c.w} × ${c.h})`);
      // (Turned back on there, the canvas widens the window, as in any window not taller than wide.)
      await size(900, 800, 600); await size(800, 800, 600); L = await look();
      await choose('Canvas'); c = await content(); const Loff = await look(); await choose('Canvas');
      ok(L.place === 'beside' && L.layout === 'stack' && c.w === 800 && c.h === 800 && Loff.place === 'beside',
        `and reached from 900 × 800: History beside the keys, the canvas above them; Canvas off keeps the size, with no width to give back (${c.w} × ${c.h}, History ${where(Loff)})`);
      // History: beside the keys at 830 × 1016 reached from 900 × 1016, across the top reached from 760 × 1016.
      await size(900, 1016, 600); await size(830, 1016, 600);
      L = await look(); await choose('History'); const hOff = await content(); await choose('History'); c = await content();
      ok(L.place === 'beside' && hOff.w < 830 && c.w === 830 && c.h === 1016, `830 × 1016, reached from 900 × 1016: History beside the keys; off gives its width back (${hOff.w} × ${hOff.h}) and on takes it again (${c.w} × ${c.h})`);
      await size(760, 1016, 600); await size(830, 1016, 600); L = await look();
      await choose('History'); c = await content(); await choose('History'); const c3 = await content(); const L3 = await look();
      ok(L.place === 'top' && c.w === 830 && c.h === 1016 && c3.w === 830 && c3.h === 1016 && L3.place === 'top',
        `and reached from 760 × 1016: History across the top; off and on keep the size (${c.w} × ${c.h}; then ${c3.w} × ${c3.h}, ${where(L3)})`);
    });

    // ---- 5. Dragging an edge across the switch, a finger’s few px back now and then: History moves once each way.
    await part('A drag moves History once', async () => {
      const drag = async (from, to, grip = 's') => {
        const g = await page.locator(`.win[data-ikey="${ik}"] .grip.${grip}`).boundingBox();
        const x0 = g.x + g.width / 2, y0 = g.y + g.height / 2, dir = Math.sign(to - from), at = d => grip === 's' ? [x0, y0 + d] : [x0 + d, y0];
        await page.mouse.move(...at(0)); await page.mouse.down();
        let d = 0;
        while ((to - from) * ((to - from) - d) > 0) {
          d += 8 * dir; await page.mouse.move(...at(d)); await page.waitForTimeout(34);
          d -= 4 * dir; await page.mouse.move(...at(d)); await page.waitForTimeout(34);
        }
        await page.mouse.move(...at(to - from)); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(500);
      };
      // (At 640 and 1180 tall, the canvas could move beside the keys under History as the window widens: History still
      // moves once each way.)
      for (const [w0, h0, from, to, grip, a, b] of [[640, 560, 560, 780, 's', 'beside', 'top'], [700, 1016, 700, 920, 'e', 'top', 'beside'],
        [420, 640, 420, 720, 'e', 'top', 'beside'], [800, 1180, 800, 1300, 'e', 'top', 'beside']]) {
        await size(w0, h0, 600); await front(); await watch();
        const L0 = await look();
        await drag(from, to, grip); let c = await content(), L = await look(), mv = await moves();
        ok(L0.place === a && L.place === b && mv.length === 1 && mv[0] === `${a}→${b}`, `the ${grip === 's' ? 'bottom' : 'right'} edge from ${w0} × ${h0} to ${c.w} × ${c.h}: History moves ${a === 'top' ? 'from the top to beside the keys' : 'from beside the keys to the top'} once (${mv.join(', ') || 'no move'})`);
        await watch(); await drag(to, from, grip); c = await content(); L = await look(); mv = await moves();
        ok(L.place === a && mv.length === 1 && mv[0] === `${b}→${a}`, `and back to ${c.w} × ${c.h}: back once (${mv.join(', ') || 'no move'})`);
      }
    });

    // ---- 6. History’s place is kept while the window changes size for a panel, or fills the board and stops. A reload
    // uses the plain comparison.
    await part('Kept, and a reload', async () => {
      // 700 × 700, reached from 700 × 800: History across the top, the canvas beside the keys under it. Not across the top
      // when the window starts at 700 × 700.
      await size(700, 800, 600); await size(700, 700, 600); await watch();
      const L0 = await look(), c0 = await content();
      await choose('Canvas'); const cOff = await content(); const Loff = await look(); await choose('Canvas');
      let L = await look(), c = await content();
      ok(L0.place === 'top' && L.place === 'top' && c.w === c0.w && c.h === c0.h, `700 × 700, reached from 700 × 800: History across the top; Canvas off (${cOff.w} × ${cOff.h}, ${where(Loff)}) and on, it’s still across the top at ${c.w} × ${c.h}`);
      await page.evaluate(ik => window.__board21.setMaximized(ik, true), ik); await page.waitForTimeout(900); const Lf = await look();
      await page.evaluate(ik => window.__board21.setMaximized(ik, false), ik); await page.waitForTimeout(900);
      L = await look(); c = await content();
      ok(L.place === 'top' && c.w === c0.w && c.h === c0.h, `Fill the board (${where(Lf)}) and back: still across the top at ${c.w} × ${c.h}`);
      await page.reload(); await boardUp(page); await page.waitForTimeout(1500);
      L = await look();
      ok(L.place === 'beside', `after a reload, 700 × 700 takes the plain comparison: History beside the keys (${where(L)})`);
      await size(640, 1016, 600); await page.reload(); await boardUp(page); await page.waitForTimeout(1500);
      L = await look();
      ok(across(L), `after a reload, Tyler’s window has History across the top (${where(L)})`);
    });

    // ---- 7. Turning History on and off: in Tyler’s window it keeps the size; in 900 × 600 it widens and gives back.
    await part('History on and off', async () => {
      await set('History', false); await size(640, 1016, 600); await watch();
      await choose('History'); let c = await content(), L = await look();
      ok(c.w === 640 && c.h === 1016 && across(L), `History on in 640 × 1016: the window keeps its size (${c.w} × ${c.h}), History across the top`);
      await choose('History'); c = await content();
      ok(c.w === 640 && c.h === 1016, `History off: still ${c.w} × ${c.h}`);
      await choose('History'); c = await content(); L = await look();
      ok(c.w === 640 && c.h === 1016 && across(L), `back on: across the top again, ${c.w} × ${c.h}`);
      await choose('History'); await size(900, 600, 600);
      await choose('History'); c = await content(); L = await look();
      ok(c.w > 1200 && c.h === 600 && L.place === 'beside', `History on in 900 × 600: wider (${c.w} × ${c.h}), History beside the keys`);
      await choose('History'); c = await content();
      ok(c.w === 900 && c.h === 600, `History off: 900 × 600 again (${c.w} × ${c.h})`);
      // Swap sides doesn’t move the band. The panels under it swap.
      await set('History', true); await size(640, 1016, 600); await choose('Swap sides'); L = await look();
      ok(across(L), `Swap sides in Tyler’s window: History stays across the top (${where(L)})`);
      await size(700, 800, 600); L = await look(); await choose('Swap sides'); const Lu = await look();
      ok(across(L) && across(Lu) && L.layout === 'side' && L.keys.r <= L.card.x + 1 && Lu.card.r <= Lu.keys.x + 1,
        `700 × 800: History across the top, the canvas beside the keys under it; Swap sides puts the keys on the left (${L.layout}), and back`);
      // A window at least 1.2 times as tall as wide keeps the canvas above the keys under History, with its steps.
      for (const [w, h] of [[700, 900], [640, 800]]) {
        await size(w, h, 600); L = await look();
        ok(across(L) && L.layout === 'stack' && L.card && L.card.b <= L.keys.y + 1 && L.player && L.keyMin >= 44.45,
          `${w} × ${h}: History across the top, the canvas above the keys with its steps (${L.layout}, steps ${L.player ? 'shown' : 'hidden'}, keys ${kdim(L)})`);
      }
      // The empty note in the band.
      await choose('Clear history'); L = await look();
      ok(across(L) && L.empty === 'Your problems show here.', `Clear history: the band says “${L.empty}”`);
    });

    // ---- 7b. Three lines show in full, with lines as teachers make them: short problems, long ones, fraction answers, and
    // problems typed with the fraction key and a power. Each problem keeps to one line, its answer beside it, and no line
    // shows cut through at the band's top edge.
    await part('Three lines in full', async () => {
      const key = async k => { await W().locator(`#keys .key[data-key="${k}"]`).click(); await page.waitForTimeout(60); };
      const band = () => W().locator('html').evaluate(() => {
        const hl = document.getElementById('hlist'), hr = hl.getBoundingClientRect();
        const cut = [...hl.querySelectorAll('.hline')].map(l => { const r = l.getBoundingClientRect(), hid = Math.max(0, hr.top - r.top) + Math.max(0, r.bottom - hr.bottom); return { h: r.height, hid }; })
          .filter(l => l.hid > 4 && l.hid < l.h - 4).length;
        const ans = [...hl.querySelectorAll('.hline')].filter(l => { const r = l.getBoundingClientRect(); return r.top >= hr.top - .5 && r.bottom <= hr.bottom + .5; })
          .map(l => l.querySelector('.hans')).filter(a => a.classList.contains('clip') || a.getBoundingClientRect().right > hr.right + .5).length;
        return { cut, clipped: ans };
      });
      const sizes = [[400, 700], [520, 860], [640, 1016], [720, 730], [760, 800], [778, 812]];
      const check = async what => {
        const bad = [];
        for (const [w, h] of sizes) {
          await size(w, h, 650); const L = await look(), b = await band();
          if (L.place !== 'top' || L.full < 3 || !L.newest || b.cut || b.clipped) bad.push(`${w} × ${h}: ${where(L)}, ${L.full} of ${L.lines} in full at ${r1(L.hf)} px, newest ${L.newest}, ${b.cut} cut, ${b.clipped} answers cut`);
        }
        ok(!bad.length, `${what}: three lines or more show in full, the newest in view, none cut through, every answer whole (${bad.join('; ') || sizes.map(s => s.join(' × ')).join(', ')})`);
      };
      await set('History', true);   // (History is empty: 'History on and off' cleared it.)
      for (const t of ['12*4=', '125-37=', '3.5*2=', '7*8=']) await type(t);
      await check('Four short problems');
      for (const t of ['1234567+7654321-1234567+7654321=', '99999*88888+77777*66666=', '123.45*678.9+1011.12*13.14=']) await type(t);
      await check('Then three long problems');
      await choose('Clear history'); await choose('As fractions');
      for (const t of ['1/3+1/7=', '5/6-1/4=', '7/8*2/3=']) await type(t);
      await check('As fractions, three fraction answers');
      await choose('As decimals'); await set('Advanced keys', true);
      for (let i = 0; i < 3; i++) {
        await front(); await key('clear'); await key('fraction'); await key('3'); await key('right'); await key('4'); await key('right');
        await key('add'); await key('2'); await key('power'); await key(String(i + 2)); await key('right'); await key('equals');
      }
      await set('Advanced keys', false);
      await check('Three problems typed with the fraction key and a power');
      // Kept across the top as the window gets shorter, the canvas or the small display above the keys keeps 76 px, or
      // History hides.
      for (const canvas of [true, false]) {
        await set('Canvas', canvas); await size(400, 600, 600);
        const low = [];
        for (const h of [588, 584, 580, 576, 572, 568]) {
          await size(400, h, 350); const L = await look(), above = L.card || L.disp;
          if (L.place === 'top' && (!above || above.h < 75.5)) low.push(`400 × ${h}: ${above ? r1(above.h) : 'none'}`);
        }
        ok(!low.length, `Canvas ${canvas ? 'on' : 'off'}, from 400 × 600 down to 400 × 568: across the top, the ${canvas ? 'canvas' : 'display'} above the keys keeps 76 px (${low.join(', ') || 'all'})`);
      }
      await choose('Clear history');
    });

    // ---- 8. The sweep: History on, Basic and Advanced keys, Canvas on and off. Every key 44.5 px or more. Where History
    // switches, with a key’s shape and History’s size either side, and every size where it hides.
    await part('The sweep', async () => {
      await set('History', true); for (const t of ['1+1=', '2+2=', '3+3=', '4+4=']) await type(t);
      const small = [], hides = [], over = [];
      for (const adv of [false, true]) for (const canvas of [true, false]) {
        await set('Advanced keys', adv); await set('Canvas', canvas);
        let prev = '', rows = [];
        const flush = name => {
          if (!rows.length) return;
          const sw = rows.slice(1).map((r, i) => [rows[i], r]).filter(([a, b]) => a.place !== b.place).map(([a, b]) => `${a.w} × ${a.h} ${where(a)}, key ${kdim(a)}, History ${a.hist ? r1(a.hist.w) + ' × ' + r1(a.hist.h) : '-'} → ${b.w} × ${b.h} ${where(b)}, key ${kdim(b)}, History ${b.hist ? r1(b.hist.w) + ' × ' + r1(b.hist.h) : '-'}`);
          console.log(`    ${adv ? 'Advanced' : 'Basic'}, Canvas ${canvas ? 'on' : 'off'}, ${name}: ${sw.join('; ') || 'no switch (' + where(rows[0]) + ')'}`);
          console.log('      ' + rows.map(r => `${r.w}×${r.h} ${r.place[0]} ${Math.round(r.kw)}×${Math.round(r.kh)}`).join(' | '));
          rows = [];
        };
        for (const [run, w, h] of SWEEP) {
          if (run !== prev) { flush(prev); await size(w, h, 600); prev = run; }
          await size(w, h, 300); const L = Object.assign({ w, h }, await look()); rows.push(L);
          const at = `${w} × ${h}${adv ? ', Advanced' : ''}${canvas ? '' : ', Canvas off'}`;
          if (L.keyMin < 44.45 || !L.inside) small.push(`${at}: ${r1(L.keyMin)}`);
          if (L.place === 'none') hides.push(at);
          if (L.place === 'top' && L.full < 3 && L.lines >= 3) over.push(`${at}: ${L.full}`);
        }
        flush(prev);
      }
      ok(!small.length, `every key 44.5 px or more, and in its window, across the sweep (${small.join(', ') || 'all'})`);
      ok(!over.length, `across the top, three lines show in full (${over.join(', ') || 'all'})`);
      console.log(`    History hides at: ${hides.join(', ') || 'no size'}`);
      await set('Advanced keys', false); await set('Canvas', true);
      // The smallest window: History hides, and stays ticked.
      await size(280, 400, 600); const L = await look();
      ok(L.place === 'none' && !L.hist && await ticked('History') && L.keyMin >= 44.45, `280 × 400: History hides and stays ticked (${where(L)}; keys ${r1(L.keyMin)})`);
    });

    // ---- 10. The docs’ new words, and the stamp.
    await part('Docs', async () => {
      const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
      const plain = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      const man = plain(read('docs/calculator-manual/page-src.html'));
      const readme = read('README.md').replace(/\s+/g, ' ');
      ok(stamped(), STAMPED);
    });

    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ['Calculator: the √ sign meets its bar', async (browser) => {
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await boardUp(page); await freeBoard(page);
    const ik = await addWin(page, 'calculator');
    await eventually(() => page.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return !!w && w.connected; }, ik));
    await page.waitForTimeout(600);
    const W = page.frameLocator(`.win[data-ikey="${ik}"] iframe`);
    const front = () => page.evaluate(ik => { if (window.__board21.state.focused !== ik) window.__board21.focusWin(ik); }, ik);
    await front();
    await page.click(`.win[data-ikey="${ik}"] .win-label`);
    await page.locator('#menu [data-act="widget"]').filter({ has: page.locator('.label', { hasText: /^History$/ }) }).click();
    await page.waitForTimeout(600);
    await front();
    for (const k of ['sqrt', '9', 'equals']) await W.locator(`#keys .key[data-key="${k}"]`).click();
    await page.waitForTimeout(400);
    // Where the sign's last stroke turns into the bar: the first run of ink, top to bottom, in a column just left of the
    // radicand's edge and in one on the bar to its right, in device pixels. They match when the two meet.
    const join = async sel => {
      const el = W.locator(sel).first(), r = await el.boundingBox(), em = await el.evaluate(e => parseFloat(getComputedStyle(e).fontSize));
      const clip = { x: Math.floor(r.x - em * .5), y: Math.floor(r.y - em * .2), width: Math.ceil(em), height: Math.ceil(em * .45) };
      const png = (await page.screenshot({ clip })).toString('base64');
      return page.evaluate(async ([png, edge, em]) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const ink = (x, y) => { const i = (y * c.width + x) * 4; return Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 240; };
        const run = x => { let y = 0; while (y < c.height && !ink(x, y)) y++; const top = y; while (y < c.height && ink(x, y)) y++; return top < c.height ? [top, y - 1] : null; };
        const dpr = 2, left = Math.round((edge - em * .02) * dpr), right = Math.round((edge + em * .15) * dpr);
        return { left: run(left), right: run(right) };
      }, [png, r.x - clip.x, em]);
    };
    const meets = j => !!j.left && !!j.right && Math.abs(j.left[0] - j.right[0]) <= 1 && Math.abs(j.left[1] - j.right[1]) <= 1;
    for (const [where, sel] of [['on the canvas', '#eq .ce-radicand'], ['in History', '#history .hline .ce-radicand']]) {
      const j = await join(sel);
      ok(meets(j), `${where}: the √'s last stroke meets the bar, no gap or step (sign ${JSON.stringify(j.left)}, bar ${JSON.stringify(j.right)})`);
    }
    if (errors.length) ok(false, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
  }],
  ];
};
