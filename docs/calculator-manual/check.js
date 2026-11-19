#!/usr/bin/env node
/*
 * Checks the built manual (dist/page.html, from build.js) in Chromium, wrapped as the Artifact viewer wraps it and
 * served with a strict Content Security Policy, so nothing may load from anywhere.
 *
 *   node docs/calculator-manual/check.js
 *
 * At 1366 × 768, 1920 × 1080 and 390 × 844, light and dark, it fails on: a console error, a page that scrolls
 * sideways, a chip with no section, a live example left empty, Desmos figures that don't add up, a menu on the page
 * that differs from the widget's own, or a demo that doesn't answer (2 + 3 × 4 = shows 14; History in the page's
 * menu shows a History line; Test practice gives 7-digit answers). It also runs the demo inside a sandboxed frame,
 * as the viewer may. Screenshots go to dist/shots/, at deviceScaleFactor 2.
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
const host = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>' +
  '<iframe sandbox="allow-scripts" src="/page"></iframe>';

const problems = [];
const fail = (where, msg) => { problems.push(`${where}: ${msg}`); console.log(`  FAIL ${msg}`); };
const ok = msg => console.log(`  ok   ${msg}`);

(async () => {
  const server = http.createServer((req, res) => {
    const body = req.url === '/host' ? host : req.url === '/page' || req.url === '/' ? wrapped : null;
    if (!body) { res.writeHead(404); res.end(); return; }
    // (The host is the viewer's own frame around the page: it may frame the page. The page itself may frame nothing.)
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, req.url === '/host' ? {} : { 'Content-Security-Policy': CSP }));
    res.end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [w, h] of SIZES) for (const scheme of SCHEMES) await checkOne(browser, base, w, h, scheme);
    await checkSandboxed(browser, base);
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
      const total = +(/We typed (\d+) problems/.exec(document.getElementById('desmos').textContent) || [])[1];
      return { total, sum: n('fig-same') + n('fig-words') + n('fig-apart') };
    });
    if (!figs.total || figs.sum !== figs.total) fail(where, `Desmos figures add up to ${figs.sum}, not ${figs.total}`); else ok(`Desmos figures add up to ${figs.total}`);
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
    if (!same(terms, live.map(l => l.label))) fail(where, 'the menu\'s list of items differs from the widget\'s'); else ok('every menu item explained, in order');

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
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, `top-${w}-${scheme}.png`) });

    await page.click('#menu-test');
    await frame.waitForSelector('#app.test');
    await press(page, frame, ['clear', '1', 'divide', '3', 'equals']);
    const t = await answerText(frame);
    const digits = ((/=\s*([\d.,]+)/.exec(t) || [])[1] || '').replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length !== 7) fail(where, `Test practice: 1 ÷ 3 = shows "${t}"`); else ok('Test practice: ' + t.replace(/\s+/g, ' ').trim());
    const greyed = await page.$$eval('#calc-menu button[disabled]', bs => bs.map(b => b.textContent.trim()));
    if (!same(greyed, ['Advanced keys', 'Answers as fractions', '50 + 10% = 55'])) fail(where, 'greyed out in Test practice: ' + greyed.join(', ')); else ok('greyed out in Test practice: ' + greyed.join(', '));

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
  await page.click('#menu-test');
  await frame.waitForSelector('#app:not(.test)');
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
async function scrollCheck(page, where, when) {
  const s = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (s.sw > s.cw) fail(where, `the page scrolls sideways ${when} (${s.sw} > ${s.cw})`); else ok(`no sideways scroll ${when}`);
}
