// Screenshots of 21Board for the Teacher Guide.
//   node docs/teacher-guide/work/shoot.js [scene ...]     (no scene: all of them)
// Serves this 21Board checkout on a free port, drives one Chromium at 1366 x 768 (deviceScaleFactor 2), and writes
// JPEGs (quality 82) to ../shots/. Never reaches YouTube, Vimeo or Google: those requests are aborted. The district
// apps (*.ccsd21.org) are fetched with curl through the session's proxy and handed to the page. Weather gets the tests'
// saved answers (tests/fixtures/weather), so nothing reaches Open-Meteo or the National Weather Service.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');   // the 21Board checkout this guide sits in
const HERE = __dirname;
const SHOTS = path.resolve(HERE, '..', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      fs.readFile(f, (err, buf) => {
        if (err) { rsp.writeHead(404); return rsp.end('not found'); }
        rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        rsp.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// A district app's file, fetched with curl (which uses the proxy and its CA bundle).
const CURL_CACHE = new Map();
function curl(url) {
  if (CURL_CACHE.has(url)) return CURL_CACHE.get(url);
  const p = new Promise(res => {
    const hdr = path.join(HERE, '.hdr-' + Math.random().toString(36).slice(2));
    execFile('curl', ['-sS', '-L', '--max-time', '20', '-D', hdr, '-o', '-', url], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (err, out) => {
      let status = 200, type = 'application/octet-stream';
      try {
        const h = fs.readFileSync(hdr, 'utf8'); fs.unlinkSync(hdr);
        const blocks = h.trim().split(/\r?\n\r?\n/); const last = blocks[blocks.length - 1];
        const m = /^HTTP\/[\d.]+ (\d+)/.exec(last); if (m) status = +m[1];
        const t = /^content-type:\s*(.*)$/im.exec(last); if (t) type = t[1].trim();
      } catch (e) { /* no headers */ }
      res(err ? { status: 502, type: 'text/plain', body: Buffer.from('') } : { status, type, body: out });
    });
  });
  CURL_CACHE.set(url, p);
  return p;
}

// Weather's sites: the tests' saved answers from Mon Nov 23 2026, moved `days` later, as tests/lib.js stubWeather gives
// them (Open-Meteo's unix times, and the Weather Service's times with an offset).
const WX_SITES = /^https:\/\/((api|air-quality-api|archive-api|geocoding-api)\.open-meteo\.com|api\.weather\.gov)\//;
const WX_FILES = { 'api.open-meteo.com/v1/forecast': 'om-forecast-wheeling.json', 'air-quality-api.open-meteo.com/v1/air-quality': 'om-airquality-wheeling.json',
  'archive-api.open-meteo.com/v1/archive': 'om-archive-2019-01-30.json', 'geocoding-api.open-meteo.com/v1/search': 'om-geocode-wheeling.json',
  'api.weather.gov/points/42.1392,-87.929': 'nws-points-wheeling.json', 'api.weather.gov/gridpoints/LOT/65,84/stations': 'nws-stations-LOT-65-84.json',
  'api.weather.gov/gridpoints/LOT/65,84/forecast': 'nws-forecast-LOT-65-84.json', 'api.weather.gov/gridpoints/LOT/65,84/forecast/hourly': 'nws-forecast-hourly-LOT-65-84.json',
  'api.weather.gov/stations/KPWK/observations': 'nws-observations-KPWK.json', 'api.weather.gov/alerts/active': 'nws-alerts-wheeling-empty.json' };
function wxShift(v, s, key) {
  if (Array.isArray(v)) return v.map(x => wxShift(x, s, key));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wxShift(x, s, k)]));
  if (key === 'time' && typeof v === 'number') return v + s;
  if (typeof v === 'string') return v.replace(/(\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?)([+-]\d\d:\d\d)/g, (m, t, z) => {
    const off = (z[0] === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(4, 6)), at = Date.parse(t + z) + s * 1000;
    return new Date(at + off * 6e4).toISOString().slice(0, t.length) + z;
  });
  return v;
}
function weatherAnswer(url, days) {
  const u = new URL(url), at = u.host + decodeURIComponent(u.pathname), f = WX_FILES[at];
  if (!f) return { status: 404, body: '{}' };
  return { status: 200, body: JSON.stringify(wxShift(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'weather', f), 'utf8')), days * 86400)) };
}

let BASE, browser;
const LOG = [];
const log = (...a) => { const s = a.join(' '); LOG.push(s); console.log(s); try { fs.appendFileSync(path.join(__dirname, 'run.log'), s + '\n'); } catch (e) {} };

// The boards are shot as a school morning: the page's clock reads 8:20 AM Central on Friday, Nov 20, 2026 (Date shifted
// in every frame, as tests/lib.js CLOCK does; timers still run in real time).
const MORNING = Date.parse('2026-11-20T08:20:00-06:00');
const SHIFT = () => { const D = Date, real = D.now.bind(D), off = () => +window.__shift || 0; window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(real() + off()); } static now() { return real() + off(); } }; };
// Moves the board's clock on (in every frame), as if that much time had passed.
const later = async (p, ms) => { for (const f of p.frames()) await f.evaluate(ms => { window.__shift = (+window.__shift || 0) + ms; }, ms).catch(() => {}); };
async function newBoard({ query = '', dark = false, camera = false, at = MORNING, weatherDays = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', serviceWorkers: 'block', permissions: camera ? ['camera'] : [], timezoneId: 'America/Chicago', locale: 'en-US' });
  if (at) await ctx.addInitScript(`window.__shift = ${at - Date.now()}; (${SHIFT})();`);
  const blocked = [];
  await ctx.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (/^https:\/\/(sketchapp|timerapp|doccamapp)\.ccsd21\.org\//.test(u)) {
      const got = await curl(u);
      return r.fulfill({ status: got.status, contentType: got.type, body: got.body });
    }
    if (WX_SITES.test(u)) {
      const got = weatherAnswer(u, weatherDays);
      return r.fulfill({ status: got.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: got.body });
    }
    blocked.push(u);
    return r.abort();
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => log('  pageerror:', e.message));
  p.on('console', m => { if (m.type() === 'error') log('  console error:', m.text().slice(0, 200)); });
  await p.goto(BASE + query);
  await p.waitForFunction(() => window.__board21 && window.__board21.store.loaded && !document.getElementById('startup'), null, { timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, blocked };
}

// A window of this widget on the page shown (returns its ikey), as tests/lib.js addWin does.
const addWin = (p, id) => p.evaluate(async id => { const before = new Set(window.__board21.state.insts.keys()); window.__board21.openWidget(id); await new Promise(r => setTimeout(r, 900)); return Array.from(window.__board21.state.insts.keys()).find(k => !before.has(k)); }, id);
const frame = (p, ik) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
const setRect = (p, ik, r) => p.evaluate(([ik, r]) => window.__board21.setRect(ik, r), [ik, r]);
const deselect = async p => { await p.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); }); await p.mouse.click(683, 5); await p.waitForTimeout(250); };
// Chooses an item in a window's ⌄ menu, as a teacher does.
async function choose(p, ik, label, { exact = false } = {}) {
  await p.click(`.win[data-ikey="${ik}"] .win-label`);
  const items = p.locator('#menu [data-act="widget"]');
  const it = exact ? items.filter({ hasText: new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }) : items.filter({ hasText: label });
  await it.first().click();
  await p.waitForTimeout(400);
}
const rectOf = (p, ik) => p.locator(`.win[data-ikey="${ik}"]`).boundingBox();
// Screen box around these windows, with a margin of board, kept on screen.
async function around(p, iks, pad = 28) {
  const bs = await Promise.all([].concat(iks).map(ik => rectOf(p, ik)));
  let x0 = Math.min(...bs.map(b => b.x)) - pad, y0 = Math.min(...bs.map(b => b.y)) - pad;
  let x1 = Math.max(...bs.map(b => b.x + b.width)) + pad, y1 = Math.max(...bs.map(b => b.y + b.height)) + pad;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1366, x1); y1 = Math.min(768, y1);
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
}
async function toastsShown(p) { return p.evaluate(() => Array.from(document.querySelectorAll('#toasts .toast')).map(t => t.innerText.trim()).filter(Boolean)); }
async function clearToasts(p) {
  await p.evaluate(() => { for (const t of document.querySelectorAll('#toasts .toast')) t.remove(); });
}
async function shot(p, name, clip) {
  const t = await toastsShown(p);
  if (t.length) log(`  ! toast on screen for ${name}: ${JSON.stringify(t)}`);
  const file = path.join(SHOTS, name);
  await p.screenshot(Object.assign({ path: file, type: 'jpeg', quality: 82 }, clip ? { clip } : {}));
  log(`  wrote ${name} (${fs.statSync(file).size} bytes)${clip ? ' clip ' + JSON.stringify(clip) : ''}`);
}

const SCENES = {};
module.exports = { SCENES };

// ---------------------------------------------------------------------------------------------------------------
SCENES.probe = async () => {
  const { ctx, p, blocked } = await newBoard();
  const ids = ['clock', 'timer', 'notes'];
  for (const id of ids) {
    const ik = await addWin(p, id);
    log(id, ik, JSON.stringify(await p.evaluate(ik => window.__board21.state.insts.get(ik).rect, ik)), JSON.stringify(await rectOf(p, ik)));
  }
  log('zoom', JSON.stringify(await p.evaluate(() => window.__board21.zoom)));
  await shot(p, '_probe.jpg');
  log('blocked', JSON.stringify(blocked));
  await ctx.close();
};

// ---------------------------------------------------------------------------------------------------------------
async function main() {
  const srv = await serve();
  BASE = `http://127.0.0.1:${srv.address().port}/`;
  log('serving', BASE);
  const want = process.argv.slice(2);
  // 21DocCam's camera: a stand-in camera that films worksheet.png. worksheet.py makes the film; it is kept gzipped
  // (worksheet.y4m.gz) and unpacked into the system's temp folder for Chromium.
  const film = path.join(require('os').tmpdir(), '21board-guide-worksheet.y4m');
  if (!fs.existsSync(film)) fs.writeFileSync(film, require('zlib').gunzipSync(fs.readFileSync(path.join(HERE, 'worksheet.y4m.gz'))));
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + film] });
  try {
    for (const name of (want.length ? want : Object.keys(SCENES).filter(n => n !== 'probe'))) {
      log('== scene', name);
      try { await SCENES[name](); } catch (e) { log('  FAILED', name, e.stack || e.message); }
    }
  } finally {
    await browser.close();
    srv.close();
  }
}
if (require.main === module) {
  // Scenes are defined in scenes.js, which adds to SCENES.
  Object.assign(module.exports, { later, MORNING, newBoard, addWin, frame, setRect, deselect, choose, rectOf, around, shot, clearToasts, toastsShown, log, SHOTS, HERE, ROOT, get BASE() { return BASE; } });
  require('./scenes.js');
  main();
}
