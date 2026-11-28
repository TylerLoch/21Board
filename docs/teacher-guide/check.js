#!/usr/bin/env node
/*
 * Checks the built Teacher Guide (dist/page.html and its screenshots, from build.js) in Chromium, wrapped as the
 * Artifact viewer wraps it and served with a Content Security Policy that lets nothing load from anywhere else.
 *
 *   node docs/teacher-guide/check.js
 *
 * At 1366 × 768, 1920 × 1080 and 390 × 844, light and dark, it fails on: a console error, a page that scrolls
 * sideways, a screenshot that doesn't load or has no alt text, a link to a section that isn't there, a widget
 * tile with no section, widget tiles that don't line up in rows, or the page's Inter face not loaded. Screenshots of the first screen go to dist/check/.
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const HERE = __dirname, DIST = path.join(HERE, 'dist'), OUT = path.join(DIST, 'check');
const SIZES = [[1366, 768], [1920, 1080], [390, 844]];
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src data:; connect-src 'none'; frame-src 'none'";

let page0;
try { page0 = fs.readFileSync(path.join(DIST, 'page.html'), 'utf8'); } catch (e) { console.error('check.js: no dist/page.html. Run node docs/teacher-guide/build.js first.'); process.exit(1); }
const wrapped = '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n' +
  page0 + '\n</body></html>';

const problems = [];
const fail = (where, msg) => { problems.push(`${where}: ${msg}`); console.log(`  FAIL ${msg}`); };
const ok = msg => console.log(`  ok   ${msg}`);

(async () => {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '/page') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP });
      return res.end(wrapped);
    }
    const f = path.join(HERE, p);
    if (!p.startsWith('/shots/') || !f.startsWith(path.join(HERE, 'shots')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [w, h] of SIZES) for (const scheme of ['light', 'dark']) await checkOne(browser, base, w, h, scheme);
  } finally {
    await browser.close();
    server.close();
  }
  if (problems.length) { console.log(`\n${problems.length} problem(s):\n` + problems.join('\n')); process.exit(1); }
  console.log(`\nAll checks passed. Screenshots in ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });

async function checkOne(browser, base, w, h, scheme) {
  const where = `${w}×${h} ${scheme}`;
  console.log(`\n${where}`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  // Load every screenshot, lazy ones too
  await page.evaluate(async () => {
    for (const img of document.images) img.loading = 'eager';
    await Promise.all([...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
  });
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const imgs = [...document.images];
    const ids = new Set([...document.querySelectorAll('[id]')].map(e => e.id));
    const links = [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href').slice(1)).filter(Boolean);
    return {
      sideways: doc.scrollWidth - doc.clientWidth,
      broken: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
      noAlt: imgs.filter(i => !i.hasAttribute('alt') || (!i.alt.trim() && i.getAttribute('role') !== 'presentation')).map(i => i.getAttribute('src')),
      deadLinks: [...new Set(links.filter(id => !ids.has(id)))],
      tiles: document.querySelectorAll('a.tile').length,
      // Each tile's height and where its icon sits in it: all the same, so the tiles of every group line up in rows.
      tileShapes: [...new Set([...document.querySelectorAll('a.tile')].map(t => { const r = t.getBoundingClientRect(), i = t.querySelector('.ticon').getBoundingClientRect(); return `${Math.round(r.height)}/${Math.round(i.top - r.top)}`; }))],
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
  const inter = await page.evaluate(() => document.fonts.ready.then(() => Array.from(document.fonts).some(f => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded')));
  if (!inter) fail(where, 'the Inter face isn’t loaded'); else ok('Inter is loaded');
  if (errors.length) fail(where, 'console errors: ' + JSON.stringify(errors.slice(0, 5))); else ok('no console errors');
  if (r.sideways > 1) fail(where, `scrolls sideways by ${r.sideways}px`); else ok('no sideways scroll');
  if (r.broken.length) fail(where, 'screenshots that don\'t load: ' + r.broken.join(', ')); else ok('every screenshot loads');
  if (r.noAlt.length) fail(where, 'screenshots with no alt text: ' + r.noAlt.join(', ')); else ok('every screenshot has alt text');
  if (r.deadLinks.length) fail(where, 'links to missing sections: #' + r.deadLinks.join(', #')); else ok(`every link has its section (${r.tiles} widget tiles)`);
  if (r.tileShapes.length !== 1) fail(where, 'widget tiles of different heights, or icons at different places in them (height/icon top): ' + r.tileShapes.join(', ')); else ok(`the widget tiles line up in rows (${r.tileShapes[0]})`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, `${w}x${h}-${scheme}.png`) });
  await ctx.close();
}
