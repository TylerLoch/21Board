#!/usr/bin/env node
/*
 * weather-steady.js: does the Weather widget hold still? The checks are in steady.json beside this file.
 *
 *   node tools/layout/weather-steady.js [--root <checkout>] [--out <dir>] [--set default|more|all] [--part i/n]
 *                                       [--only <regex>] [--css <file>] [--rows] [--list]
 *   node tools/layout/weather-steady.js --compare <base steady.jsonl> <head steady.jsonl> [--json <file>]
 *   node tools/layout/weather-steady.js --shoot <shots.json> [--root <checkout>] [--out <dir>] [--css <file>]
 *
 * Three kinds of check, one JSON line each in <out>/steady.jsonl:
 *   sweep  a line of sizes, wider a few px at a time and back. Its runs (sizes that draw one layout) and its flips: a
 *          run under 5 px wide between two others. BACK when the runs on either side are the same layout.
 *   path   one window reached from wider and from narrower. Same, or differs, with both signatures.
 *   swap   thunderstorms, -13°, and 104° come and go. Does the window come back the same?
 * Each check starts from a window just opened. Also <out>/steady-run.json: the run's set, part, steps, and seconds.
 * --root: the checkout (default: the repo this file is in). --out: default tests/output/layout/steady (-more, -all).
 * --set: default runs on every push, more by hand. --part i/n: whole checks, balanced by steps. --only: a regex over
 * ids, such as '^sweep:l480:'. --css: a stylesheet added to the widget's page. --rows: each sweep's sizes, one by one.
 * --compare lists only what is new in head: a flip, a size drawn two ways, a path that differs, a swap that doesn't
 * come back, a page error, or a check that failed or didn't run. --shoot takes the pictures --compare asks for.
 *
 * It serves the checkout the way tests/run.js does and drives one Chromium through its tests/lib.js. The weather comes
 * from tests/fixtures/weather/. Nothing reaches a real site.
 * Exits 0 when every check ran (or, comparing, nothing is new), 1 when a check failed (or something is new), and 2 on
 * a bad option or a checkout it can't use.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

// ---- Options
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = k => argv.includes('--' + k);
const stop = msg => { console.error('weather-steady: ' + msg); process.exit(2); };
const CHECKS_FILE = path.join(__dirname, 'steady.json');
const PARTS = ['hourly', 'days', 'wear', 'sun', 'moon', 'wind', 'air', 'watches'];
// The Show list's parts hidden for a mix: 'all', 'none', 'all-but-<part>[+<part>]', or the parts shown joined by +.
function hideFor(mix) {
  if (mix === 'all') return [];
  if (mix === 'none') return PARTS.slice();
  const but = mix.startsWith('all-but-'), named = but ? mix.slice(8).split('+') : mix.split('+');
  for (const p of named) if (!PARTS.includes(p)) throw new Error(`unknown part “${p}” in mix ${mix}`);
  return but ? named : PARTS.filter(p => !named.includes(p));
}
const parseAt = s => { const m = /^(fill)?(\d+)x(\d+)$/.exec(s); if (!m) throw new Error('not a size: ' + s); return { w: +m[2], h: +m[3], fill: !!m[1] }; };

// ---- The checks, from steady.json, in its order. Each has an id, a kind, a set, and its estimated steps (resizes and
// redraws), which balance the parts.
function loadChecks() {
  let j;
  try { j = JSON.parse(fs.readFileSync(CHECKS_FILE, 'utf8')); } catch (e) { stop('steady.json: ' + e.message); }
  const out = [];
  const mixesOf = m => typeof m === 'string' ? (j.mixes[m] || stop(`steady.json: no mix list called ${m}`)) : m;
  for (const ln of j.sweeps) {
    const [from, to, step] = ln.w, pts = [];
    for (let w = from; w <= to; w += step) pts.push([w, typeof ln.h === 'number' ? ln.h : Math.round(ln.h[0] + (w - from) * (ln.h[1] - ln.h[0]) / (to - from))]);
    for (const mix of mixesOf(ln.mixes)) out.push({ id: `sweep:${ln.id}:${mix}`, kind: 'sweep', line: ln.id, mix, set: ln.set, w: ln.w, h: ln.h, step, pts, steps: 2 * pts.length + 3 });
  }
  for (const [mix, w, h, lo, hi] of j.paths.cases) out.push({ id: `path:${mix}:${w}x${h}`, kind: 'path', mix, set: j.paths.set, w, h, lo, hi, steps: 5 });
  for (const mix of j.swaps.mixes) for (const at of j.swaps.at) out.push({ id: `swap:${mix}:${at}`, kind: 'swap', mix, set: j.swaps.set, at, steps: parseAt(at).fill ? 9 : 7 });
  const seen = new Set();
  for (const c of out) { if (seen.has(c.id)) stop('steady.json: two checks are called ' + c.id); seen.add(c.id); if (!['default', 'more'].includes(c.set)) stop(`steady.json: ${c.id} has set “${c.set}”`); try { hideFor(c.mix); } catch (e) { stop('steady.json: ' + e.message); } }
  return out;
}
// Part i of n: whole checks, the biggest first into the lightest part. Each part runs its checks in steady.json's order.
function partOf(checks, i, n) {
  const load = new Array(n).fill(0), part = new Map();
  for (const c of checks.map((c, k) => ({ c, k })).sort((a, b) => b.c.steps - a.c.steps || a.k - b.k)) {
    let best = 0;
    for (let p = 1; p < n; p++) if (load[p] < load[best]) best = p;
    load[best] += c.c.steps; part.set(c.c.id, best + 1);
  }
  return checks.filter(c => part.get(c.id) === i);
}
function selected() {
  const set = arg('set', 'default');
  if (!['default', 'more', 'all'].includes(set)) stop('--set must be default, more, or all');
  let list = loadChecks().filter(c => set === 'all' || c.set === set);
  const only = arg('only', null);
  if (only) { let re; try { re = new RegExp(only); } catch (e) { stop('--only: ' + e.message); } list = list.filter(c => re.test(c.id)); }
  const part = arg('part', null);
  if (part) {
    const m = /^(\d+)\/(\d+)$/.exec(part);
    if (!m || +m[1] < 1 || +m[1] > +m[2]) stop('--part must be i/n, with i from 1 to n');
    list = partOf(list, +m[1], +m[2]);
  }
  return { list, set, part, only };
}

// ---- Runs and flips in a sweep line's rows (in order of width): a run is the widths that draw one layout. A run under
// 5 px wide between two others is a flip: BACK when the runs on either side draw the same layout, else between.
function runsOf(rows, key) {
  const runs = [];
  for (const r of rows) { const k = key(r); if (!runs.length || runs[runs.length - 1][2] !== k) runs.push([r.w, r.w, k, r.h]); else runs[runs.length - 1][1] = r.w; }
  return runs;
}
function flipsOf(runs, dir) {
  const out = [];
  for (let i = 1; i < runs.length - 1; i++) {
    const [w0, w1, k, h] = runs[i];
    if (w1 - w0 < 5) out.push({ dir, w0, w1, h, kind: runs[i - 1][2] === runs[i + 1][2] ? 'BACK' : 'between', label: k.includes('|') ? k.split('|')[1] : k });
  }
  return out;
}
// Changes of layout along a line, in the order visited: how many, and how many go back to one seen before. Drops: the
// temperature getting smaller as the window grows.
function changesOf(rows) {
  const seen = new Map(); let changes = 0, back = 0, drops = 0, worst = 0;
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i], p = rows[i - 1];
    if (p && s.arr !== p.arr) { changes++; if (seen.has(s.arr)) back++; }
    if (p && s.temp < p.temp - 1) { drops++; worst = Math.max(worst, 1 - s.temp / p.temp); }
    if (!seen.has(s.arr)) seen.set(s.arr, i);
  }
  return { changes, back, drops, worstDrop: +(worst * 100).toFixed(1) };
}

// ---- --compare: what head has that base lacks.
function readLines(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { stop(`can’t read ${file}`); }
  const m = new Map();
  text.split('\n').filter(l => l.trim()).forEach((l, i) => { let j; try { j = JSON.parse(l); } catch (e) { stop(`${file} line ${i + 1} isn’t JSON`); } if (!j.id) stop(`${file} line ${i + 1} has no id`); m.set(j.id, j); });
  return m;
}
const sz = (w, h) => `${w}x${h}`;
function compare(baseFile, headFile) {
  const B = readLines(baseFile), H = readLines(headFile), news = [];
  const add = (type, id, text, shots) => news.push({ type, id, text, shots: shots || [] });
  for (const [id, h] of H) {
    const b = B.get(id);
    if (h.error) { if (!(b && b.error)) add('failed', id, h.error); continue; }
    const oldErr = new Set((b && b.errors) || []);
    for (const e of h.errors || []) if (!oldErr.has(e)) add('page error', id, e);
    if (h.kind === 'sweep') {
      const st = h.step, hAt = w => typeof h.h === 'number' ? h.h : Math.round(h.h[0] + (w - h.w[0]) * (h.h[1] - h.h[0]) / (h.w[1] - h.w[0]));
      const near = (a, c) => a.dir === c.dir && a.w0 <= c.w1 + st && c.w0 <= a.w1 + st;
      for (const f of h.flips) {
        if (b && !b.error && b.flips.some(x => near(x, f))) continue;
        // (A picture of its first size, reached as the sweep reached it: from one step narrower going wider, else wider.)
        const from = f.dir === 'wider' ? f.w0 - st : f.w1 + st, at = f.dir === 'wider' ? f.w0 : f.w1;
        add('flip', id, `${f.w0 === f.w1 ? f.w0 : f.w0 + '-' + f.w1} wide at ${f.h} tall, going ${f.dir}, ${f.kind}: ${f.label}`,
          [{ name: `${at}x${hAt(at)}-${f.dir}`, mix: h.mix, path: ['390x295', sz(from, hAt(from)), sz(at, hAt(at))] }]);
      }
      for (const d of h.pathDiff) {
        if (b && !b.error && b.pathDiff.some(x => Math.abs(x.w - d.w) <= st)) continue;
        add('sweep path', id, `${sz(d.w, d.h)} going wider ${d.wider} t${d.tw}, going narrower ${d.narrower} t${d.tn}`,
          [{ name: `${sz(d.w, d.h)}-wider`, mix: h.mix, path: ['390x295', sz(d.w - st, hAt(d.w - st)), sz(d.w, d.h)] },
           { name: `${sz(d.w, d.h)}-narrower`, mix: h.mix, path: ['390x295', sz(d.w + st, hAt(d.w + st)), sz(d.w, d.h)] }]);
      }
    } else if (h.kind === 'path') {
      if (h.same || (b && !b.error && b.same === false)) continue;
      add('path', id, `from wider ${JSON.stringify(h.fromWider)} | from narrower ${JSON.stringify(h.fromNarrower)}`,
        [{ name: 'from-wider', mix: h.mix, path: [sz(h.hi, h.h), sz(h.w, h.h)] }, { name: 'from-narrower', mix: h.mix, path: [sz(h.lo, h.h), sz(h.w, h.h)] }]);
    } else if (h.kind === 'swap') {
      if (h.back || (b && !b.error && b.back === false)) continue;
      add('swap', id, `t${h.t0} then t${h.after.temp}${h.after.arrSame ? '' : `, ${h.laid0} then ${h.after.laid}`}`,
        [{ name: 'before', mix: h.mix, path: [h.at] }, { name: 'after', mix: h.mix, path: [h.at], swap: true }]);
    }
  }
  for (const id of B.keys()) if (!H.has(id)) add('not run', id, 'in base, not in head');
  for (const n of news) n.shots.forEach(s => { s.file = `${n.id.replace(/[^\w.+-]+/g, '_')}-${s.name}.png`; });
  return { checks: H.size, base: B.size, news };
}
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
if (flag('compare')) {
  const i = argv.indexOf('--compare'), files = argv.slice(i + 1, i + 3);
  if (files.length < 2 || files.some(f => f.startsWith('--'))) stop('--compare takes two files: base, then head');
  const r = compare(files[0], files[1]);
  const kinds = [['flip', 'new flip', 'new flips'], ['sweep path', 'size drawn two ways', 'sizes drawn two ways'],
    ['path', 'path that differs', 'paths that differ'], ['swap', 'swap that doesn’t come back', 'swaps that don’t come back'], ['page error', 'page error', 'page errors'],
    ['failed', 'check that failed', 'checks that failed'], ['not run', 'check not run', 'checks not run']];
  for (const n of r.news) console.log(`${n.type}  ${n.id}  ${n.text}`);
  const counts = kinds.map(([t, one, many]) => [t, r.news.filter(n => n.type === t).length, one, many]).filter(x => x[1]);
  const said = counts.map(([, k, one, many]) => plural(k, one, many));
  const list = said.length < 3 ? said.join(' and ') : said.slice(0, -1).join(', ') + ', and ' + said[said.length - 1];
  console.log(`Steadiness: ${r.news.length ? list : 'nothing new'} in ${plural(r.checks, 'check', 'checks')}.`);
  const json = arg('json', null);
  if (json) fs.writeFileSync(json, JSON.stringify({ checks: r.checks, base: r.base, counts: Object.fromEntries(counts.map(([t, k]) => [t, k])), news: r.news,
    shots: r.news.flatMap(n => n.shots.map(s => Object.assign({ id: n.id }, s))) }, null, 1) + '\n');
  process.exit(r.news.length ? 1 : 0);
}

// ---- --list
const SHOOT = arg('shoot', null);
const sel = SHOOT ? null : selected();
if (flag('list') && sel) {
  for (const c of sel.list) console.log(`${c.id}  ${c.steps} steps${sel.set === 'all' ? '  ' + c.set : ''}`);
  console.log(`${plural(sel.list.length, 'check', 'checks')}, ${sel.list.reduce((a, c) => a + c.steps, 0)} steps${sel.part ? `, part ${sel.part}` : ''}.`);
  process.exit(0);
}

// ---- A run
const REPO = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(arg('root', REPO));
const OUTDIR = path.resolve(arg('out', path.join(REPO, 'tests', 'output', 'layout', SHOOT ? 'steady-shots' : sel.set === 'default' ? 'steady' : 'steady-' + sel.set)));
// (Added to the widget's page, after its own, before each check.)
const CSS = (() => { const f = arg('css', null); if (!f) return null; try { return fs.readFileSync(path.resolve(f), 'utf8'); } catch (e) { stop(`can’t read ${f}`); } })();
const ROWS = flag('rows');
if (!fs.existsSync(path.join(ROOT, 'tests', 'lib.js')) || !fs.existsSync(path.join(ROOT, 'widgets', 'weather', 'index.html'))) stop(`${ROOT} is not a 21Board checkout`);
// tests/lib.js from the checkout under test. (It makes tests/output/ when loaded: not in the checkout, which may be
// read-only.)
const lib = (() => {
  const mk = fs.mkdirSync, out = path.join(ROOT, 'tests', 'output');
  fs.mkdirSync = function (p) { if (path.resolve(String(p)) === out) return; return mk.apply(fs, arguments); };
  try { return require(path.join(ROOT, 'tests', 'lib.js')); } finally { fs.mkdirSync = mk; }
})();
const { chromium, TYPES, WXT, setBase, setCornerClock } = lib;
const K = WXT.K;

// ---- In the widget's frame. One step: until the window is w × h (if given), then until the drawing stops changing
// (the same over two double frames), then its signature: 'sweep' (the layout, its picks and steps, the parts' classes,
// the temperature's px, and the parts' px) or 'path' (the layout, picks, steps, parts, air quality's advice, and the
// temperature). With sky, whether the sky's node or its animation started again since the last step.
const STEP = async ({ w, h, kind, sky, model }) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (model !== undefined) {
    if (!window.__m0) window.__m0 = window.model;
    if (!model) window.model = window.__m0;
    else { const f = new Function('d', 'return (' + model + ')(d)'); window.model = function () { const d = window.__m0.apply(this, arguments); if (d && d.now && d.days) f(d); return d; }; }
    draw();
  }
  if (w) for (let i = 0; i < 200; i++) { if (innerWidth === w && innerHeight === h) break; await sleep(10); }
  const still = () => { const wx = document.querySelector('#view .wx'); return innerWidth + 'x' + innerHeight + (wx ? wx.className + wx.getAttribute('style') + wx.innerHTML.length + [...wx.querySelectorAll('[style]')].map(e => e.getAttribute('style')).join() : ''); };
  let last = '', n = 80;
  for (let i = 0; i < 80; i++) { await raf2(); const s = still(); if (s === last) { n = i; break; } last = s; }
  const wx = document.querySelector('#view .wx'), inn = wx && wx.querySelector(':scope > .in');
  const cls = e => (typeof e.className === 'string' ? e.className : '').split(' ').filter(c => c && !/^sc-/.test(c) && c !== 'still').sort().join('.');
  const L = window.B21Weather.laid();
  let s = null;
  if (kind === 'path' && inn) {
    const parts = [...inn.children].filter(e => !e.matches('.fx') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none');
    const say = [...wx.querySelectorAll('.air .aqsay')].filter(e => e.offsetParent).length;
    s = { id: L && L.id, pick: L && JSON.stringify(L.pick), steps: L && (L.steps || []).join(), parts: parts.map(cls).join(','), say, temp: parseFloat(getComputedStyle(wx.querySelector('.temp')).fontSize).toFixed(1) };
  } else if (kind === 'sweep' && inn) {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
    const parts = [...inn.children].filter(e => !e.matches('.fx') && vis(e));
    const fsOf = e => Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10;
    const t = wx.querySelector('.temp'), fx = wx.querySelector(':scope > .fx');
    s = { W: innerWidth, H: innerHeight, laid: L ? JSON.stringify({ id: L.id, pick: L.pick, steps: L.steps }) : 'null',
      arr: cls(wx).replace(/\b(tight|tighter|tightest)\b/g, '') + '|' + (L ? L.id + JSON.stringify(L.pick || {}) + (L.steps || []).join() : '') + '|' + parts.map(cls).join(','),
      temp: t ? fsOf(t) : 0, sizes: parts.map(e => cls(e).slice(0, 14) + ':' + fsOf(e)).join(' '), sc: fx ? fx.dataset.sc : '' };
  }
  // The sky: the same node, its first animation started at the same moment. (Tagged again for the next step.)
  let restart = null;
  if (sky !== undefined) {
    const fx = wx && wx.querySelector(':scope > .fx');
    if (sky && fx) {
      const an = fx.getAnimations({ subtree: true }).map(a => a.startTime), a0 = window.__anim0;
      if (!fx.__steady) restart = 'node replaced, sc ' + fx.dataset.sc;
      else if (a0 != null && an.length && an[0] != null && Math.abs(an[0] - a0) > 1) restart = 'animation restarted';
    }
    if (fx) fx.__steady = 1;
    const a = fx ? fx.getAnimations({ subtree: true }) : [];
    window.__anim0 = a.length ? a[0].startTime : null;
  }
  return { n, s, restart };
};
// The weather swapped in: model(d) changed as each says. (Sent as source, run in the widget's frame.)
const THUNDER = d => { d.now.code = 95; };
const COLD = d => { d.now.t = -13; d.now.feels = -38; d.now.code = 95; d.today.hi = -13; d.today.lo = -25; d.days.forEach(x => { x[2] = -25; x[3] = -13; x[1] = 95; }); if (d.hours) d.hours.forEach(x => { if (typeof x[1] === 'number') x[1] = -13; }); };
const HOT = d => { d.now.t = 104; d.now.feels = 104; d.now.code = 95; d.now.wind = 45; d.today.hi = 104; d.today.lo = 99; d.days.forEach(x => { x[2] = 99; x[3] = 104; x[1] = 95; }); if (d.hours) d.hours.forEach(x => { if (typeof x[1] === 'number') x[1] = 104; }); };

// ---- The board: one Weather window, its sky tagged, the corner clock on.
let browser = null;
async function newBoard() {
  const errors = [];
  const b = await WXT.board(browser, errors, { opts: { viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' } });
  b.errors = errors;
  b.page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await setCornerClock(b.page, 'on');
  await b.page.evaluate(() => window.__board21.openWidget('weather', { fresh: true }));
  if (!await WXT.connected(b.page)) throw new Error('the Weather window never connected');
  if (!await WXT.drawn(b.page, K, 15000)) throw new Error('the Weather window never drew the weather');
  await b.page.waitForTimeout(1200);
  // (As it opened: its place and size on the board, and its settings, to start each check from.)
  b.rect0 = await b.page.evaluate(k => Object.assign({}, window.__board21.state.insts.get(k).rect), K);
  b.conf0 = await WXT.conf(b.page);
  b.hide = JSON.stringify((b.conf0 && b.conf0.hide) || []); b.filled = false;
  await css(b);
  await size(b, 900, 560, { sky: false });
  return b;
}
// Each check starts from a Weather window just opened, with the settings, place, and size it opened with, so it draws
// the same alone (--only) or in any part: the widget keeps what it measured between draws.
async function fresh(b) {
  if (b.filled) await unfill(b);
  await WXT.put(b.page, 'config', b.conf0);
  b.hide = JSON.stringify((b.conf0 && b.conf0.hide) || []);
  // (And nothing saved yet: a window that opens with a forecast saved draws it first.)
  await b.page.evaluate(([k, r]) => { const B = window.__board21; B.setMaximized(k, false); B.setRect(k, r); B.state.data.delete(k); B.state.wins.get(k).reload(); }, [K, b.rect0]);
  if (!await WXT.connected(b.page)) throw new Error('the Weather window never connected again');
  if (!await WXT.drawn(b.page, K, 15000)) throw new Error('the Weather window never drew the weather again');
  // (Not sooner: a quicker start drew some sizes up to 1.2 px apart in temperature, at 1150 to 1300 × 510.)
  await b.page.waitForTimeout(300);
  await css(b);
  await size(b, 900, 560, { sky: false });
}
const F = (b, fn, a) => WXT.F(b.page, fn, a);
const css = b => CSS === null ? null : F(b, c => { let s = document.getElementById('steady-css'); if (!s) { s = document.createElement('style'); s.id = 'steady-css'; document.head.appendChild(s); } if (s.textContent !== c) s.textContent = c; }, CSS);
async function size(b, w, h, o = {}) {
  if (b.filled) await unfill(b);
  await b.page.evaluate(([k, w, h]) => { const B = window.__board21; B.setMaximized(k, false); B.setRect(k, { x: 20, y: 20, w, h: h + 40 }); }, [K, w, h]);
  return F(b, STEP, Object.assign({ w, h }, o));
}
async function fill(b, W, H, o = {}) {
  await b.page.setViewportSize({ width: W, height: H });
  await b.page.evaluate(k => window.__board21.setMaximized(k, true), K);
  b.filled = true;
  await b.page.waitForTimeout(400);
  return F(b, STEP, o);
}
async function unfill(b) {
  await b.page.evaluate(k => window.__board21.setMaximized(k, false), K);
  await b.page.setViewportSize({ width: 1920, height: 1080 });
  b.filled = false;
  await b.page.waitForTimeout(300);
  await F(b, STEP, {});
}
const goTo = (b, at, o) => { const a = parseAt(at); return a.fill ? fill(b, a.w, a.h, o) : size(b, a.w, a.h, o); };
// The Show list as the mix says. force: put it even if it's already so (a sweep starts that way).
async function setMix(b, mix, { force = false, settle = true } = {}) {
  const hide = JSON.stringify(hideFor(mix));
  if (!force && b.hide === hide) return;
  const cur = await WXT.conf(b.page);
  await WXT.put(b.page, 'config', Object.assign({}, cur, { simple: false, date: null, hide: JSON.parse(hide) }));
  b.hide = hide;
  await b.page.waitForTimeout(settle ? 150 : 300);
  if (settle) await F(b, STEP, {});
}

// ---- One check of each kind. Each returns its line for steady.jsonl.
async function sweep(b, c) {
  await size(b, 390, 295); await setMix(b, c.mix, { force: true });
  await F(b, STEP, { kind: 'sweep', sky: false });
  const fwd = [], bwd = [], sky = [];
  for (const [w, h] of c.pts) { const r = await size(b, w, h, { kind: 'sweep', sky: true }); fwd.push(r.s); if (r.restart) sky.push(`${w}x${h} wider: ${r.restart}`); }
  const [lw, lh] = c.pts[c.pts.length - 1];
  await size(b, lw + 10, lh + 5);
  for (const [w, h] of c.pts.slice().reverse()) { const r = await size(b, w, h, { kind: 'sweep', sky: true }); bwd.unshift(r.s); if (r.restart) sky.push(`${w}x${h} narrower: ${r.restart}`); }
  const rows = c.pts.map(([w, h], i) => ({ w, h, f: fwd[i], b: bwd[i] }));
  const runsW = runsOf(rows, r => r.f.arr), runsN = runsOf(rows, r => r.b.arr);
  const pathDiff = rows.filter(r => r.f.arr !== r.b.arr || Math.abs(r.f.temp - r.b.temp) > 1).map(r => ({ w: r.w, h: r.h, wider: r.f.laid, tw: r.f.temp, narrower: r.b.laid, tn: r.b.temp }));
  const F1 = changesOf(fwd), B1 = changesOf(bwd.slice().reverse());
  const line = { id: c.id, kind: 'sweep', line: c.line, mix: c.mix, w: c.w, h: c.h, step: c.step, sizes: c.pts.length,
    flips: flipsOf(runsW, 'wider').concat(flipsOf(runsN, 'narrower')), pathDiff,
    runs: { wider: runsW.map(r => [r[0], r[1], r[2]]), narrower: runsN.map(r => [r[0], r[1], r[2]]) },
    changes: { wider: F1.changes, narrower: B1.changes }, back: { wider: F1.back, narrower: B1.back }, drops: F1.drops, worstDrop: F1.worstDrop, sky };
  if (ROWS) line.rows = rows.map(r => [r.w, r.h, r.f.temp, r.f.laid, r.b.temp, r.b.laid, r.f.arr, r.b.arr]);
  const fl = line.flips.map(f => `${f.w0 === f.w1 ? f.w0 : f.w0 + '-' + f.w1} ${f.dir} ${f.kind}`);
  line.say = `${c.pts.length} sizes, ${F1.changes} changes going wider, ${B1.changes} going narrower; ${fl.length ? 'flips ' + fl.join(', ') : 'no flips'}${pathDiff.length ? `; ${pathDiff.length} sizes differ by path` : ''}`;
  return line;
}
async function pathCheck(b, c) {
  await setMix(b, c.mix, { settle: false });
  await size(b, c.hi, c.h); const a = (await size(b, c.w, c.h, { kind: 'path' })).s;
  await size(b, c.lo, c.h); const n = (await size(b, c.w, c.h, { kind: 'path' })).s;
  const same = JSON.stringify(a) === JSON.stringify(n);
  return { id: c.id, kind: 'path', mix: c.mix, w: c.w, h: c.h, lo: c.lo, hi: c.hi, same, fromWider: a, fromNarrower: n, say: same ? 'same' : 'differs' };
}
async function swapCheck(b, c) {
  await setMix(b, c.mix);
  await goTo(b, c.at);
  await F(b, STEP, { model: null });
  const s0 = (await F(b, STEP, { kind: 'sweep', sky: false })).s, line = { id: c.id, kind: 'swap', mix: c.mix, at: c.at, t0: s0.temp, laid0: s0.laid }, sky = [];
  for (const [nm, m] of [['thunder', THUNDER], ['cold', COLD], ['hot', HOT]]) {
    const r = await F(b, STEP, { model: m.toString(), kind: 'sweep', sky: true }), s1 = r.s;
    if (s1.sc === s0.sc && r.restart) sky.push(`${nm}: ${r.restart}`);
    line[nm] = { same: s1.arr === s0.arr && s1.sizes === s0.sizes, arrSame: s1.arr === s0.arr, temp: s1.temp, laid: s1.laid };
  }
  const s2 = (await F(b, STEP, { model: null, kind: 'sweep', sky: false })).s;
  line.back = s2.arr === s0.arr && s2.sizes === s0.sizes;
  line.after = { arrSame: s2.arr === s0.arr, temp: s2.temp, laid: s2.laid, sizes0: s0.sizes, sizes: s2.sizes };
  line.sky = sky;
  if (b.filled) await unfill(b);
  const word = x => x.same ? 'same' : (x.arrSame ? 'sizes' : 'ARR') + ' t' + x.temp;
  line.say = `t ${s0.temp} | thunder ${word(line.thunder)} | cold ${word(line.cold)} | hot ${word(line.hot)} | back ${line.back ? 'same' : 'DIFFERS t' + s0.temp + '->' + s2.temp + (line.after.arrSame ? '' : ' ARR ' + s0.laid + ' -> ' + s2.laid)}`;
  return line;
}
// A picture for --compare: the mix, the sizes in order (and the weather swapped and back), then the window.
async function shot(b, s, file) {
  await setMix(b, s.mix);
  for (const at of s.path) await goTo(b, at);
  if (s.swap) { for (const m of [THUNDER, COLD, HOT]) await F(b, STEP, { model: m.toString() }); await F(b, STEP, { model: null }); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (b.filled) await b.page.screenshot({ path: file, animations: 'disabled' });
  else await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: file, animations: 'disabled' });
}

// (A part with no checks writes an empty steady.jsonl, with no browser.)
if (sel && !sel.list.length) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(path.join(OUTDIR, 'steady.jsonl'), '');
  fs.writeFileSync(path.join(OUTDIR, 'steady-run.json'), JSON.stringify({ root: ROOT, set: sel.set, part: sel.part, only: sel.only, checks: 0, steps: 0, failed: 0, secs: 0 }, null, 1) + '\n');
  console.log(`No checks${sel.part ? ' in part ' + sel.part : ''}.`);
  process.exit(0);
}
(async () => {
  const t0 = Date.now();
  let shots = null;
  if (SHOOT) { try { shots = JSON.parse(fs.readFileSync(SHOOT, 'utf8')); shots = Array.isArray(shots) ? shots : shots.shots; } catch (e) { stop(`can’t read ${SHOOT}`); } }
  fs.mkdirSync(OUTDIR, { recursive: true });
  const commit = (() => { try { const cp = require('child_process'); return cp.execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() + (cp.execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'widgets', 'tests/lib.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() ? ' (with changes)' : ''); } catch (e) { return '?'; } })();
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  setBase(`http://127.0.0.1:${server.address().port}/`);
  browser = await chromium.launch();
  // Nothing reaches a real site: anything not to this server is aborted (the weather sites are answered first).
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async o => { const c = await newContext(o); await c.route(u => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(String(u)), r => r.abort('internetdisconnected').catch(() => {})); return c; };
  let b = null, failed = 0, done = 0;
  const reboard = async () => { if (b) { try { await b.ctx.close(); } catch (e) { /* gone */ } } b = null; };
  try {
    if (shots) {
      for (const s of shots) {
        try { if (!b) b = await newBoard(); await fresh(b); await shot(b, s, path.join(OUTDIR, s.file)); done++; }
        catch (e) { failed++; console.error(`  ${s.file}: ${String(e && e.message || e).split('\n')[0]}`); await reboard(); }
      }
      console.log(`${plural(done, 'picture', 'pictures')} in ${OUTDIR}${failed ? `, ${failed} failed` : ''}.`);
    } else {
      const outFile = path.join(OUTDIR, 'steady.jsonl');
      fs.writeFileSync(outFile, '');
      const steps = sel.list.reduce((a, c) => a + c.steps, 0);
      console.log(`${plural(sel.list.length, 'check', 'checks')}, ${steps} steps, set ${sel.set}${sel.part ? `, part ${sel.part}` : ''}. ${ROOT} at ${commit}${CSS !== null ? ', with ' + arg('css') : ''}.`);
      for (const c of sel.list) {
        let line, c0 = Date.now();
        try {
          if (!b) { b = await newBoard(); c0 = Date.now(); }
          await fresh(b);
          const e0 = b.errors.length;
          line = await (c.kind === 'sweep' ? sweep : c.kind === 'path' ? pathCheck : swapCheck)(b, c);
          line.errors = [...new Set(b.errors.slice(e0))];
        } catch (e) {
          failed++;
          line = { id: c.id, kind: c.kind, mix: c.mix, error: String(e && e.message || e).split('\n')[0] };
          line.say = 'failed: ' + line.error;
          // (A board in a state the next check can't trust is made again.)
          await reboard();
        }
        line.ms = Date.now() - c0;
        fs.appendFileSync(outFile, JSON.stringify(line) + '\n');
        console.log(`${c.id}  ${line.say}  (${(line.ms / 1000).toFixed(1)} s)`);
      }
      const secs = (Date.now() - t0) / 1000;
      fs.writeFileSync(path.join(OUTDIR, 'steady-run.json'), JSON.stringify({ root: ROOT, commit, set: sel.set, part: sel.part, only: sel.only, css: arg('css', null),
        checks: sel.list.length, steps, failed, secs }, null, 1) + '\n');
      console.log(`${plural(sel.list.length, 'check', 'checks')} in ${Math.round(secs)} s${failed ? `, ${failed} failed` : ''}. ${outFile}`);
    }
  } finally {
    await reboard();
    await browser.close().catch(() => {});
    server.close();
  }
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err && err.stack || err); if (browser) browser.close().catch(() => {}); process.exit(2); });
