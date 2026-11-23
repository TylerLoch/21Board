#!/usr/bin/env node
/*
 * Checks the built manual (dist/page.html, from build.js) in Chromium, wrapped as the Artifact viewer wraps it and
 * served with a strict Content Security Policy, so nothing may load from anywhere.
 *
 *   node docs/calculator-manual/check.js
 *
 * At 1366 × 768, 1920 × 1080 and 390 × 844, light and dark, it fails on: a console error, a page that scrolls
 * sideways, a chip with no section, a live example left empty, Desmos figures that don't add up, a menu on the page
 * that differs from the widget's own, a demo that doesn't fit the first screen beside its menu, keys too small to
 * tap at phone width, or a demo that doesn't answer (2 + 3 × 4 = shows 14; History in the page's menu shows a History
 * line; With remainders gives 17 ÷ 5 = 3 R 2, its R muted and 4.5:1 or more, in the demo and the page's example; Desmos %
 * shows under Advanced keys while they're on). It also runs the demo inside a sandboxed frame, as the viewer may, and
 * in one that starts hidden and shows later. It checks that the page and the demo follow a data-theme the host sets,
 * and that each chip is marked once tapped. Screenshots go to dist/shots/, at deviceScaleFactor 2.
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const DIST = path.join(__dirname, 'dist'), SHOTS = path.join(DIST, 'shots');
const SIZES = [[1366, 768], [1920, 1080], [390, 844]];
const SCHEMES = ['light', 'dark'];
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'";

let page0;
try { page0 = fs.readFileSync(path.join(DIST, 'page.html'), 'utf8'); } catch (e) { console.error('check.js: no dist/page.html. Run node docs/calculator-manual/build.js first.'); process.exit(1); }
// The viewer's skeleton around the page (the Artifact tool's page contract)
const wrapped = '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
  'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n' + page0 + '\n</body></html>';
const wrap = dt => dt ? wrapped.replace('<html>', `<html data-theme="${dt}">`) : wrapped;
const host = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>' +
  '<iframe sandbox="allow-scripts" src="/page"></iframe>';
// A host that lays the page out hidden (display: none, or 0 × 0), then shows it, as a viewer may load it ahead
const hiddenHost = how => '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;display:block}</style>' +
  `<iframe sandbox="allow-scripts" src="/page" id="f" style="${how === 'none' ? 'display:none' : 'width:0;height:0;visibility:hidden'}"></iframe>` +
  '<script>setTimeout(() => { document.getElementById("f").style.cssText = "width:100%;height:100%;display:block"; }, 1500)</script>';
// The page's colors, from its tokens
const BG = { light: 'rgb(244, 245, 247)', dark: 'rgb(18, 19, 21)' };

const problems = [];
const fail = (where, msg) => { problems.push(`${where}: ${msg}`); console.log(`  FAIL ${msg}`); };
const ok = msg => console.log(`  ok   ${msg}`);

(async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), dt = u.searchParams.get('dt');
    const isHost = u.pathname === '/host' || u.pathname.startsWith('/host-');
    const body = u.pathname === '/host' ? host : u.pathname.startsWith('/host-') ? hiddenHost(u.pathname.slice(6)) :
      u.pathname === '/page' || u.pathname === '/' ? wrap(dt === 'light' || dt === 'dark' ? dt : null) : null;
    if (!body) { res.writeHead(404); res.end(); return; }
    // (The host is the viewer's own frame around the page: it may frame the page. The page itself may frame nothing.)
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, isHost ? {} : { 'Content-Security-Policy': CSP }));
    res.end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [w, h] of SIZES) for (const scheme of SCHEMES) await checkOne(browser, base, w, h, scheme);
    await checkSandboxed(browser, base);
    for (const how of ['none', 'zero']) await checkHidden(browser, base, how);
    await checkHostTheme(browser, base);
    for (const [w, h] of [[1920, 1080], [390, 844]]) await checkChips(browser, base, w, h);
  } finally {
    await browser.close();
    server.close();
  }
  if (problems.length) { console.log(`\n${problems.length} problem(s):\n` + problems.join('\n')); process.exit(1); }
  console.log(`\nAll checks passed. Screenshots in ${SHOTS}`);
})().catch(e => { console.error(e); process.exit(1); });

async function checkOne(browser, base, w, h, scheme) {
  const where = `${w}×${h} ${scheme}`;
  console.log(`\n${where}`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(base + '/page');
    const frame = await calcFrame(page);
    await frame.waitForSelector('.key[data-key="2"]', { state: 'visible' });
    await page.waitForSelector('#menu-history');

    // The page itself
    const chips = await page.$$eval('.pg-chip', cs => cs.map(c => { const id = (c.getAttribute('href') || '').slice(1), s = document.getElementById(id); return { id, ok: !!s && s.tagName === 'SECTION' }; }));
    const lost = chips.filter(c => !c.ok).map(c => c.id);
    if (lost.length) fail(where, 'chips with no section: ' + lost.join(', ')); else ok(`${chips.length} chips, each with its section`);
    const empty = await page.$$eval('.pg-ex, #steps-list, #hide-ex, #words-ex', es => es.filter(e => !e.innerHTML.trim()).length);
    if (empty) fail(where, empty + ' live examples are empty'); else ok('every live example drawn');
    const figs = await page.evaluate(() => {
      const n = id => +document.getElementById(id).textContent;
      return { total: n('fig-total'), sum: n('fig-same') + n('fig-words') + n('fig-apart') + n('fig-open') };
    });
    if (!figs.total || figs.sum !== figs.total) fail(where, `Desmos figures add up to ${figs.sum}, not ${figs.total}`); else ok(`Desmos figures add up to ${figs.total}`);
    if (w >= 1040) {   // beside the menu, the whole window shows on the first screen
      const bottom = await page.evaluate(() => Math.round(document.getElementById('calc-win').getBoundingClientRect().bottom));
      if (bottom > h) fail(where, `the demo ends ${bottom - h}px below the first screen`); else ok(`the demo fits the first screen (ends at ${bottom} of ${h})`);
    }
    if (w >= 1366) {
      const bar = await page.$eval('.pg-bar-in', b => b.scrollWidth - b.clientWidth);
      if (bar > 1) fail(where, `the bar of chips is ${bar}px too wide`); else ok('the bar of chips fits');
    }
    const look = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const inner = await frame.evaluate(() => document.documentElement.getAttribute('data-b21-theme'));
    if (inner !== scheme) fail(where, `the demo is ${inner}, the page ${scheme}`); else ok(`the demo follows the page (${scheme}, page ${look})`);

    // The menu drawn on the page is the widget's own, as a new window opens
    const live = await page.$$eval('#calc-menu button.wm-i', bs => bs.filter(b => b.id !== 'menu-reset').map(b => ({ label: b.querySelector('.wm-l').textContent, on: b.getAttribute('aria-checked') === 'true', off: b.disabled })));
    const drawn = await page.$$eval('#menu-drawn .wm-i', es => es.map(e => ({ label: e.querySelector('.wm-l').textContent, on: !!e.querySelector('.wm-ck'), off: e.classList.contains('off') })));
    const terms = await page.$$eval('#menu-items dt', ds => ds.map(d => d.textContent));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(drawn.slice(0, live.length), live)) fail(where, 'the drawn menu differs from the widget\'s: ' + JSON.stringify(live));
    else if (!same(drawn.slice(live.length).map(d => d.label), ['Fill the board', 'Reset', 'Close'])) fail(where, 'the drawn menu should end with Fill the board, Reset and Close');
    else ok(`the drawn menu matches the widget's ${live.length} items, ticks and greyed-out ones`);
    const heads = sel => page.$$eval(sel, hs => hs.map(h => h.textContent));
    if (!same(await heads('#menu-drawn .wm-h'), await heads('#calc-menu .wm-h'))) fail(where, 'the drawn menu\'s headings differ from the widget\'s: ' + JSON.stringify(await heads('#calc-menu .wm-h')));
    else ok('the drawn menu has the widget\'s headings: ' + (await heads('#calc-menu .wm-h')).join(', '));
    // The list explains every item, Desmos % too, which shows while Advanced keys are on.
    await page.click('#menu-advanced');
    await page.waitForSelector('#menu-percent');
    const withAdv = await page.$$eval('#calc-menu button.wm-i', bs => bs.filter(b => b.id !== 'menu-reset').map(b => b.querySelector('.wm-l').textContent));
    const pct = await page.getAttribute('#menu-percent', 'aria-checked');
    await page.click('#menu-advanced');
    await page.waitForSelector('#menu-percent', { state: 'detached' });
    if (withAdv[withAdv.indexOf('Advanced keys') + 1] !== 'Desmos %' || pct !== 'true') fail(where, 'Desmos % should sit right under Advanced keys, checked: ' + JSON.stringify(withAdv) + ', ' + pct);
    else ok('Desmos % sits under Advanced keys while they\'re on, checked, and goes when they\'re off');
    if (!same(terms, withAdv)) fail(where, 'the menu\'s list of items differs from the widget\'s: ' + JSON.stringify(withAdv)); else ok('every menu item explained, in order');

    // The demo answers
    await press(page, frame, ['2', 'add', '3', 'multiply', '4', 'equals']);
    const shown = await answerText(frame);
    if (!/=\s*14\b/.test(shown)) fail(where, `2 + 3 × 4 = shows "${shown}"`); else ok('2 + 3 × 4 = 14');
    if (await frame.isVisible('#next')) { await inView(page); await frame.click('#next'); }
    await page.click('#menu-history');
    try {
      await frame.waitForSelector('.hline', { state: 'visible' });
      if (await page.getAttribute('#menu-history', 'aria-checked') !== 'true') fail(where, 'History isn\'t ticked in the page\'s menu');
      else ok('History ticked shows a History line: ' + (await frame.textContent('.hline')).replace(/\s+/g, ' ').trim());
    } catch (e) { fail(where, 'History ticked, but no History line shows'); }
    await page.waitForTimeout(300);
    await scrollCheck(page, where, 'with History');
    const key = await keyHeight(page, frame);
    if (key < 40) fail(where, `with History, a key is ${key}px tall`); else ok(`with History, a key is ${key}px tall`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, `top-${w}-${scheme}.png`) });

    await page.click('#menu-answers-remainder');
    await page.waitForSelector('#menu-answers-remainder[aria-checked="true"]');
    await press(page, frame, ['clear', '1', '7', 'divide', '5', 'equals']);
    const t = (await answerText(frame)).replace(/\s+/g, ' ').trim();
    if (!/=\s*3 R 2$/.test(t)) fail(where, `With remainders: 17 ÷ 5 = shows "${t}"`); else ok('With remainders: ' + t);
    // The R: the muted color at full strength, 4.5:1 or more, in the demo and in the page's own example
    for (const [what, target, sel] of [['the demo', frame, '#eq .ce-r, #big .ce-r'], ['the Remainders example', page, '.pg-ex[data-keys="17÷5"] .ce-r']]) {
      const r = await theR(target, sel);
      const c = r ? ratio(r.color, r.bg) : 0;
      if (!r || r.color.join() !== r.muted.join() || r.all !== 1 || c < 4.5) fail(where, `${what}: the R is ${r ? `rgb(${r.color}) at ${r.all} on rgb(${r.bg}), ${c.toFixed(2)}:1, muted rgb(${r.muted})` : 'not drawn'}`);
      else ok(`${what}: the R is muted, rgb(${r.color}), at full strength, ${c.toFixed(1)}:1`);
    }
    await page.click('#menu-answers-decimal');
    await page.waitForSelector('#menu-answers-decimal[aria-checked="true"]');

    if (w === 1366 && scheme === 'light') await extras(page, frame, where);
    await scrollCheck(page, where, 'at the end');
    if ((w === 1366 && scheme === 'light') || (w === 390 && scheme === 'dark')) {
      await page.evaluate(() => { document.querySelector('.pg-bar').style.position = 'static'; });   // (out of the way of each section)
      for (const id of ['parts', 'menu', 'keys', 'steps', 'desmos', 'math', 'keyboard', 'saving']) {
        await page.locator('#' + id).screenshot({ path: path.join(SHOTS, `${id}-${w}-${scheme}.png`) });
      }
    }
    if (errors.length) fail(where, 'console errors: ' + errors.join(' | ')); else ok('no console errors');
  } catch (e) {
    fail(where, 'stopped: ' + e.message.split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

// One window's checks, once: the accent reaches the demo, Swap sides, Hide the answer, Reset
async function extras(page, frame, where) {
  await page.click('#accent-green');
  try {
    await frame.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--b21-accent').trim() === '#15803d', null, { timeout: 3000 });
    ok('the accent reaches the demo');
  } catch (e) { fail(where, 'the accent didn\'t reach the demo'); }
  await page.click('#accent-blue');
  const order = async () => frame.evaluate(() => getComputedStyle(document.getElementById('grid')).gridTemplateAreas);
  await page.click('#menu-swap');
  await page.waitForTimeout(200);
  const swapped = await order();
  if (!/^"hist keys canvas"$/.test(swapped)) fail(where, 'Swap sides gives ' + swapped); else ok('Swap sides: ' + swapped);
  await page.click('#menu-swap');
  await page.click('#menu-hide');
  await press(page, frame, ['7', 'multiply', '8', 'equals']);
  if (!(await frame.isVisible('#eq .reveal'))) fail(where, 'Hide the answer shows no ?');
  else {
    await inView(page);
    await frame.click('#eq .reveal');
    const t = await frame.textContent('#eq');
    if (!/56/.test(t)) fail(where, 'the ? shows ' + t); else ok('Hide the answer: the ? shows 56');
  }
  // The page's own example of it: the ? shows 56 with no button the widget lacks, and Try again brings the ? back
  await page.click('#hide-reveal');
  const ex = await page.evaluate(() => ({ text: document.getElementById('hide-ex').textContent, buttons: document.querySelectorAll('#hide-ex button').length, again: !document.getElementById('hide-again').hidden }));
  if (!/56/.test(ex.text) || ex.buttons || !ex.again) fail(where, 'the page\'s Hide the answer example, after the ?: ' + JSON.stringify(ex));
  else {
    await page.click('#hide-again');
    if (!(await page.isVisible('#hide-reveal')) || await page.isVisible('#hide-again')) fail(where, 'Try again doesn\'t bring the ? back');
    else ok('the page\'s Hide the answer example: ? shows 56, Try again hides it');
  }
  const before = await page.evaluate(() => document.getElementById('calc-frame').style.width);
  await page.click('#menu-reset');
  await page.click('#menu-reset-yes');
  await frame.page().waitForTimeout(100);
  const again = await calcFrame(page);
  await again.waitForSelector('.key[data-key="2"]', { state: 'visible' });
  await page.waitForSelector('#menu-history[aria-checked="false"]');
  const after = await page.evaluate(() => document.getElementById('calc-frame').style.width);
  if (after !== '900px') fail(where, `Reset left the window ${after} wide (it was ${before})`); else ok(`Reset: settings off and the window ${before} → ${after} wide`);
}

// Laid out while hidden, then shown: the demo opens as a new window does, and Try it is the chip marked.
async function checkHidden(browser, base, how) {
  const where = `hidden at first (${how === 'none' ? 'display: none' : '0 × 0'}), 1366×768`;
  console.log(`\n${where}`);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(base + '/host-' + how);
    await page.waitForTimeout(2500);
    const pageFrame = page.frames().find(f => f.url().endsWith('/page'));
    const r = await pageFrame.evaluate(() => ({ width: document.getElementById('calc-frame').style.width, current: (document.querySelector('.pg-chip[aria-current="true"]') || {}).id || null }));
    if (r.width !== '900px') fail(where, `the demo opened ${r.width} wide`); else ok('the demo opened 900px wide');
    if (r.current !== 'nav-top') fail(where, `the chip marked is ${r.current}`); else ok('Try it is the chip marked');
    const frame = await calcFrame(page);
    await press(pageFrame, frame, ['2', 'add', '3', 'multiply', '4', 'equals']);
    const shown = await answerText(frame);
    if (!/=\s*14\b/.test(shown)) fail(where, `2 + 3 × 4 = shows "${shown}"`); else ok('the demo answers: 2 + 3 × 4 = 14, on the canvas: ' + (await frame.isVisible('#eq')));
    if (errors.length) fail(where, 'console errors: ' + errors.join(' | ')); else ok('no console errors');
  } catch (e) {
    fail(where, 'stopped: ' + e.message.split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

// The host's data-theme, before and after load: the page and the demo both follow it
async function checkHostTheme(browser, base) {
  const cases = [
    { system: 'light', at: 'load', dt: 'dark' }, { system: 'dark', at: 'load', dt: 'light' },
    { system: 'light', at: 'later', dt: 'dark' }, { system: 'dark', at: 'later', dt: 'light', then: true }
  ];
  for (const c of cases) {
    const where = `host data-theme ${c.dt} at ${c.at}, system ${c.system}`;
    console.log(`\n${where}`);
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: c.system });
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const both = async want => {
      try { await frame.waitForFunction(t => document.documentElement.getAttribute('data-b21-theme') === t, want, { timeout: 3000 }); } catch (e) { /* reported below */ }
      const pg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const demo = await frame.evaluate(() => document.documentElement.getAttribute('data-b21-theme'));
      return { page: pg === BG.light ? 'light' : pg === BG.dark ? 'dark' : pg, demo };
    };
    let frame;
    try {
      await page.goto(base + '/page' + (c.at === 'load' ? '?dt=' + c.dt : ''));
      frame = await calcFrame(page);
      await frame.waitForSelector('.key[data-key="2"]', { state: 'visible' });
      if (c.at === 'later') await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), c.dt);
      let r = await both(c.dt);
      if (r.page !== c.dt || r.demo !== c.dt) fail(where, `the page is ${r.page}, the demo ${r.demo}`); else ok(`the page and the demo are ${c.dt}`);
      if (c.then) {
        const other = c.dt === 'light' ? 'dark' : 'light';
        await page.click('#theme-' + other);
        r = await both(other);
        if (r.page !== other || r.demo !== other) fail(where, `${other} on the page: the page is ${r.page}, the demo ${r.demo}`); else ok(`${other} on the page: the page and the demo are ${other}`);
        await page.click('#theme-auto');
        r = await both(c.dt);
        if (r.page !== c.dt || r.demo !== c.dt) fail(where, `Auto again: the page is ${r.page}, the demo ${r.demo}`); else ok(`Auto again: back to the host's ${c.dt}`);
      }
      if (errors.length) fail(where, 'console errors: ' + errors.join(' | ')); else ok('no console errors');
    } catch (e) {
      fail(where, 'stopped: ' + e.message.split('\n')[0]);
    } finally {
      await ctx.close();
    }
  }
}

// Each chip, once tapped, is the one marked, the last one too
async function checkChips(browser, base, w, h) {
  const where = `chips, ${w}×${h}`;
  console.log(`\n${where}`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  try {
    await page.goto(base + '/page');
    await (await calcFrame(page)).waitForSelector('.key[data-key="2"]', { state: 'visible' });
    const ids = await page.$$eval('.pg-chip', cs => cs.map(c => c.id));
    const wrong = [];
    for (const id of [...ids.slice(1), ids[0]]) {
      await page.click('#' + id);
      await page.waitForTimeout(150);
      const cur = await page.evaluate(() => (document.querySelector('.pg-chip[aria-current="true"]') || {}).id || null);
      if (cur !== id) wrong.push(`${id} marks ${cur}`);
    }
    if (wrong.length) fail(where, 'tapped chips: ' + wrong.join(', ')); else ok(`each of the ${ids.length} chips is marked once tapped`);
  } catch (e) {
    fail(where, 'stopped: ' + e.message.split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

async function checkSandboxed(browser, base) {
  const where = 'sandboxed frame, 1366×768';
  console.log(`\n${where}`);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(base + '/host');
    const frame = await calcFrame(page);
    await frame.waitForSelector('.key[data-key="2"]', { state: 'visible' });
    const pageFrame = page.frames().find(f => f.url().endsWith('/page'));
    await press(pageFrame, frame, ['2', 'add', '3', 'multiply', '4', 'equals']);
    const shown = await answerText(frame);
    if (!/=\s*14\b/.test(shown)) fail(where, `2 + 3 × 4 = shows "${shown}"`); else ok('the demo answers: 2 + 3 × 4 = 14');
    if (errors.length) fail(where, 'console errors: ' + errors.join(' | ')); else ok('no console errors');
  } catch (e) {
    fail(where, 'stopped: ' + e.message.split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

// The R in 3 R 2 at sel (the one showing): its color, the muted color, the background it sits on (each [r, g, b]), and its opacity with
// every opacity above it
async function theR(target, sel) {
  return target.evaluate(sel => {
    const g2 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgb = c => { g2.clearRect(0, 0, 1, 1); g2.fillStyle = '#000'; g2.fillStyle = c; g2.fillRect(0, 0, 1, 1); return Array.from(g2.getImageData(0, 0, 1, 1).data.slice(0, 3)); };
    const cs = e => getComputedStyle(e), clear = b => /rgba\(0, 0, 0, 0\)|transparent/.test(b);
    const r = Array.from(document.querySelectorAll(sel)).find(e => e.getClientRects().length);   // (the one showing)
    if (!r) return null;
    let bg = null, all = 1;
    for (let n = r; n; n = n.parentElement) { const b = cs(n).backgroundColor; if (!bg && b && !clear(b)) bg = rgb(b); all *= +cs(n).opacity; }
    return { color: rgb(cs(r).color), muted: rgb(cs(r).getPropertyValue('--b21-muted').trim()), bg: bg || rgb(cs(document.body).backgroundColor), all };
  }, sel);
}
// Contrast, as WCAG counts it
function ratio(a, b) {
  const lum = c => c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Taps on the demo's keys. (Playwright can't scroll the page to an element in the widget, whose #app is fixed: the
// page scrolls the demo into view first.)
async function inView(page) {   // (a page, or the frame the page is in)
  await page.evaluate(() => { const r = document.getElementById('calc-stage').getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) document.getElementById('calc-stage').scrollIntoView({ block: 'end' }); });
}
async function press(page, frame, keys) {
  await inView(page);
  for (const k of keys) await frame.click(`.key[data-key="${k}"]`);
}
async function calcFrame(page) {
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find(x => x.name() === 'b21-board:calculator:1' && x.url() === 'about:srcdoc');
    if (f) { try { await f.waitForLoadState('domcontentloaded'); return f; } catch (e) { /* loading again */ } }
    await page.waitForTimeout(100);
  }
  throw new Error('the demo\'s frame never loaded');
}
// The answer as shown: the canvas when it shows, otherwise the small display
async function answerText(frame) {
  await frame.waitForTimeout(150);
  return frame.evaluate(() => {
    const eq = document.getElementById('eq'), x = document.getElementById('x'), big = document.getElementById('big');
    return eq.offsetParent ? eq.textContent : x.textContent + ' = ' + big.textContent;
  });
}
// A key's height on the page, in CSS px: the demo may be drawn smaller than the widget's own size
async function keyHeight(page, frame) {
  const k = await frame.evaluate(() => document.querySelector('.key[data-key="2"]').getBoundingClientRect().height);
  const s = await page.evaluate(() => { const m = /matrix\(([^,]+)/.exec(getComputedStyle(document.getElementById('calc-frame')).transform); return m ? +m[1] : 1; });
  return Math.round(k * s);
}
async function scrollCheck(page, where, when) {
  const s = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (s.sw > s.cw) fail(where, `the page scrolls sideways ${when} (${s.sw} > ${s.cw})`); else ok(`no sideways scroll ${when}`);
}
