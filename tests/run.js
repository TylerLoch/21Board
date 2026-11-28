/*
 * 21Board automated browser tests (optional — the widget itself has no dependencies).
 *
 *   npm install --no-save playwright && npx playwright install chromium   (once)
 *   node tests/run.js           prints each suite's failures and a count. Add --verbose to see every check.
 *   node tools/test-halves.js   the same in two halves at once, in about 40 minutes
 *   node tools/ci-wait.js       waits for GitHub to run it on the pushed commit, in 15 parts at once
 *
 * The suites are in tests/suites/, one file per area. What they share is in tests/lib.js.
 *
 * Starts a static server for the repo, then drives Chromium through the
 * windowing system, storage, multi-tab sync, export/import, offline mode,
 * touch input and the widget SDK. Screenshots go to tests/output/.
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const lib = require('./lib');
const { ok, ROOT, TYPES, DEV_ROUTES, SITES, WX_HOSTS, VERBOSE, setBase, setSuite, counts } = lib;

// The suites: every file in tests/suites/, one per area, in alphabetical order.
const FILES = fs.readdirSync(path.join(__dirname, 'suites')).filter(f => f.endsWith('.js')).sort();

// The suites in part k of n. Each part gets about the same share of the seconds in tests/timings.json, which
// node tools/ci-wait.js --save-timings writes. A suite it doesn't list counts as the average. The longest suite goes
// first, each to the part with the least time so far. Within a part, suites run in file order.
function partOf(suites, k, n) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'timings.json'), 'utf8')); } catch (e) {}
  const known = suites.map(([t]) => saved[t]).filter(x => x > 0);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const secs = suites.map(([t]) => saved[t] > 0 ? saved[t] : avg);
  const load = Array(n).fill(0), owner = [];
  for (const i of [...suites.keys()].sort((a, b) => secs[b] - secs[a] || a - b)) {
    const j = load.indexOf(Math.min(...load));
    load[j] += secs[i]; owner[i] = j;
  }
  return new Set([...suites.keys()].filter(i => owner[i] === k - 1));
}

(async () => {
  // PART=k/n runs the k-th of n parts. tools/test-halves.js runs PART=1/2 and 2/2 at once, and GitHub runs 15 parts.
  const part = /^(\d+)\/(\d+)$/.exec(process.env.PART || '');
  if (process.env.PART && !(part && +part[1] >= 1 && +part[1] <= +part[2])) { console.error(`PART must be k/n, such as 1/2. It is ${process.env.PART}.`); process.exit(2); }
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/__dev/') && DEV_ROUTES[p]) { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' }); res.end(DEV_ROUTES[p](new URL(req.url, 'http://x').searchParams)); return; }
    const sm = /^\/__site\/([^/]+)(\/.*)$/.exec(p);   // a release under test: see deploy()
    if (sm) p = sm[2];
    if (p.endsWith('/')) p += 'index.html';
    if (sm) {
      const f = p.slice(1), site = SITES[sm[1]];
      if (!site) { res.writeHead(404); res.end('Not found'); return; }
      site.asked.push(f);
      if (site.fault[f] && await site.fault[f](res) === true) return;
      const body = SITES[sm[1]].files[f];   // (the release may have changed while a fault waited)
      if (body) { res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(body); return; }
    }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  setBase(BASE);
  // Each file gives its suites once the board's address is known.
  const SUITES = FILES.flatMap(f => require(`./suites/${f}`)(Object.assign({}, lib, { BASE })));
  const mine = part ? partOf(SUITES, +part[1], +part[2]) : new Set(SUITES.keys());
  // Letters snap to whole pixels, as on GitHub's runner, so a cut that shows there shows here too.
  const browser = await chromium.launch({ args: ['--font-render-hinting=full'] });
  // Headless Chromium can't answer a native Save dialog, so contexts use the download fallback by default.
  // The "Review fixes" suite stubs showSaveFilePicker itself to test that path.
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async opts => {
    const c = await newContext(opts);
    await c.addInitScript(() => { window.showSaveFilePicker = undefined; });
    // No suite reaches the weather sites. A Weather suite answers them with stubWeather, whose route runs first.
    await c.route(WX_HOSTS, r => r.abort('internetdisconnected').catch(() => {}));
    return c;
  };
  const only = process.argv.slice(2).find(a => !a.startsWith('--'));
  const times = {};
  for (const [i, [title, fn]] of SUITES.entries()) {
    if (!mine.has(i)) continue;
    if (only && !title.toLowerCase().includes(only.toLowerCase())) continue;
    console.log('\n' + title);
    setSuite(title);
    const t0 = Date.now(), c0 = counts();
    try { await fn(browser); } catch (err) { ok(false, 'suite crashed: ' + (err && err.stack || err)); }
    times[title] = Math.round((Date.now() - t0) / 1000);
    const c = counts();
    if (!VERBOSE) console.log(`  ${c.passes - c0.passes} passed${c.fails > c0.fails ? `, ${c.fails - c0.fails} failed` : ''}`);
  }
  await browser.close();
  server.close();
  // On GitHub, each suite's seconds, for node tools/ci-wait.js --save-timings.
  if (process.env.GITHUB_ACTIONS) console.log('\nSuite times: ' + JSON.stringify(times));
  const { passes, fails } = counts();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
