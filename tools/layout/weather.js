#!/usr/bin/env node
/*
 * weather.js: measures how the Weather widget uses its window, case by case. See README.md beside this file.
 *
 *   node tools/layout/weather.js [--root <checkout>] [--matrix canon|quick|full|own|jit|<cases.json>] [--out <dir>]
 *        [--part i/n] [--shots none|all|worst] [--worst N] [--scale 1|2] [--only <regex>] [--ids <file>] [--css <file>]
 *        [--list] [--from-metrics] [--reshoot]
 *
 * It serves <checkout> (default: the repo this file is in) the way tests/run.js does, drives one Chromium through the
 * checkout's own tests/lib.js (WXT, stubWeather, openSettings, lockBoard...), and answers the weather sites from
 * tests/fixtures/weather/ (Mon Nov 23 2026, 11:50 AM Central). Nothing reaches a real site: every request that isn't
 * to the local server is aborted.
 * Writes <out>/metrics.jsonl (one line per case, in the order run), <out>/summary.md, and <out>/shots/<id>.png.
 * --part i/n runs part i of n: the cases in the order they run, cut into n runs of nearly equal count.
 * Exit 0 when every case ran, 1 when one failed (its row says why), 2 on bad arguments or a crash.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

// ---- Arguments
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = k => argv.includes('--' + k);
const REPO = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(arg('root', REPO));
const MATRIX = arg('matrix', 'canon');
// The matrices kept as case files beside this one.
const NAMED = { own: path.join(__dirname, 'own.json'), jit: path.join(__dirname, 'jit.json') };
const MATRIX_NAME = ['canon', 'quick', 'full'].includes(MATRIX) || NAMED[MATRIX] ? MATRIX : path.basename(MATRIX).replace(/\.json$/i, '');
const OUTDIR = path.resolve(arg('out', path.join(REPO, 'tests', 'output', 'layout', MATRIX_NAME)));
const SHOTS = arg('shots', MATRIX === 'canon' ? 'all' : 'none');
const WORST_N = +arg('worst', '24');
const SCALE = +arg('scale', '1');
const ONLY = arg('only', null) ? new RegExp(arg('only')) : null;
const readArg = k => { try { return fs.readFileSync(path.resolve(arg(k)), 'utf8'); } catch (e) { console.error(`--${k}: can't read ${arg(k)}`); process.exit(2); } };
const IDS = arg('ids', null) ? new Set(readArg('ids').split('\n').map(s => s.trim()).filter(Boolean)) : null;   // (case ids, one a line)
const CSS = arg('css', null) ? readArg('css') : null;   // (added to the widget's page, after its own)
const PART = (() => {
  const v = arg('part', null);
  if (v === null) return null;
  const m = /^(\d+)\/(\d+)$/.exec(v);
  if (!m || +m[1] < 1 || +m[1] > +m[2]) { console.error('--part must be i/n, with i from 1 to n'); process.exit(2); }
  return { i: +m[1], n: +m[2] };
})();
if (!['none', 'all', 'worst'].includes(SHOTS)) { console.error('--shots must be none, all, or worst'); process.exit(2); }
if (!(SCALE >= 1 && SCALE <= 3)) { console.error('--scale must be 1 to 3'); process.exit(2); }
if (!fs.existsSync(path.join(ROOT, 'tests', 'lib.js')) || !fs.existsSync(path.join(ROOT, 'widgets', 'weather', 'index.html'))) { console.error(`${ROOT} is not a 21Board checkout`); process.exit(2); }

// ---- tests/lib.js from the checkout under test, loaded only when a browser runs (--list and --from-metrics need
// neither). (It makes tests/output/ when loaded: not in the checkout, which may be read-only.)
let chromium, TYPES, WXT, eventually, openSettings, setCornerClock, lockBoard, unlockBoard, setBase, K;
function useLib() {
  const mk = fs.mkdirSync, out = path.join(ROOT, 'tests', 'output');
  fs.mkdirSync = function (p) { if (path.resolve(String(p)) === out) return; return mk.apply(fs, arguments); };
  let lib;
  try { lib = require(path.join(ROOT, 'tests', 'lib.js')); } finally { fs.mkdirSync = mk; }
  ({ chromium, TYPES, WXT, eventually, openSettings, setCornerClock, lockBoard, unlockBoard, setBase } = lib);
  K = WXT.K;
}

// ---- Cases
// The Show list's parts, in the widget's order. A mix names the parts shown; the rest are hidden.
const PARTS = ['hourly', 'days', 'wear', 'sun', 'moon', 'wind', 'air', 'watches'];
const STYLE_KEY = { standard: 'standard', easier: 'legible', early: 'early' };
const ALERTS = { none: 'nws-alerts-wheeling-empty.json', warning: 'nws-alerts-fortworth.json', watch: 'nws-alerts-midland.json' };
// Mixes by name: 'all', 'none', 'all-but-<part>', or parts joined by '+' (only those shown).
function mixHide(name) {
  if (name === 'all') return [];
  if (name === 'none') return PARTS.slice();
  const but = /^all-but-(.+)$/.exec(name);
  if (but) return PARTS.filter(p => but[1].split('+').includes(p));
  const show = name.split('+');
  for (const s of show) if (!PARTS.includes(s)) throw new Error(`unknown part “${s}” in mix ${name}`);
  return PARTS.filter(p => !show.includes(p));
}
function mixName(hide) {
  if (!hide.length) return 'all';
  if (hide.length === PARTS.length) return 'none';
  const show = PARTS.filter(p => !hide.includes(p));
  return hide.length <= 2 && show.length > 2 ? 'all-but-' + hide.join('+') : show.join('+');
}
const DEF = { max: false, boardSize: 1, locked: false, hide: [], units: 'f', simple: false, view: 'main', date: null, band: 'none', style: 'standard' };
// A case from its parts. size: [w, h] for a window of that content size, or 'fill' with [W, H] for a board that size.
function mk(id, o) { return Object.assign({ id }, DEF, o, { hide: PARTS.filter(p => (o.hide || []).includes(p)) }); }
const S = (w, h) => ({ w, h, max: false, label: `${w}x${h}` });
const FILL = (w, h, boardSize = 1) => ({ w, h, max: true, boardSize, label: `fill${w}x${h}${boardSize !== 1 ? '@' + boardSize : ''}` });
const at = (sz, extra) => Object.assign({ w: sz.w, h: sz.h, max: sz.max, boardSize: sz.boardSize || 1 }, extra);

function canon() {
  return [
    mk('tyler-wind', at(FILL(1366, 768), { hide: mixHide('wind') })),
    mk('tyler-sun', at(S(820, 490), { hide: mixHide('sun') })),
    // (Tyler's screenshot is Large: 950 × 470 would be Medium, under 480 px tall. 1066 × 480 keeps its 2.22:1 shape.)
    mk('tyler-wear', at(S(1066, 480), { hide: mixHide('wear') })),
    mk('m-all', at(S(480, 360), {})),
    mk('l-all', at(S(900, 560), {})),
    mk('f-all', at(FILL(1920, 1080), {})),
    mk('l-none', at(S(900, 560), { hide: mixHide('none') })),
    mk('l-days', at(S(900, 560), { hide: mixHide('days') })),
    mk('f-hourly', at(FILL(1366, 768), { hide: mixHide('hourly') })),
    mk('m-wear-days', at(S(480, 360), { hide: mixHide('wear+days') })),
    mk('f-sun-moon', at(FILL(1920, 1080), { hide: mixHide('sun+moon') })),
    mk('t-all', at(S(380, 640), {})),
    mk('l-warn', at(S(900, 560), { band: 'warning' })),
    mk('m-now', at(S(480, 360), { view: 'now' })),
    mk('f-simple', at(FILL(1920, 1080), { simple: true })),
    mk('l-date', at(S(900, 560), { date: '2019-01-30' })),
    mk('f-off', at(FILL(1366, 768), { band: 'offline' })),
    mk('s-all', at(S(260, 220), {}))
  ];
}
const QUICK_SIZES = [S(260, 220), S(340, 260), S(480, 360), S(640, 420), S(380, 640), S(600, 900), S(700, 700), S(900, 560), S(1200, 720), S(1300, 500),
  FILL(1366, 768), FILL(1920, 1080), FILL(1280, 800, 1.5)];
const QUICK_MIXES = ['all', 'none', 'wind', 'sun', 'wear', 'days', 'hourly', 'moon', 'air', 'wear+days', 'sun+moon', 'wind+air', 'hourly+days', 'days+wear+sun', 'all-but-hourly'];
const VIEWS = [['now', { view: 'now' }], ['days', { view: 'days' }], ['hours', { view: 'hours' }], ['sun', { view: 'sun' }], ['air', { view: 'air' }],
  ['alert', { view: 'alert', band: 'warning' }], ['simple', { simple: true }], ['date', { date: '2019-01-30' }]];
function quick() {
  const out = [];
  for (const sz of QUICK_SIZES) for (const m of QUICK_MIXES) out.push(mk(`${sz.label}:${m}`, at(sz, { hide: mixHide(m) })));
  for (const sz of [S(480, 360), S(900, 560), FILL(1920, 1080)]) for (const m of ['all', 'wear'])
    for (const [v, o] of [['warning', { band: 'warning' }], ['offline', { band: 'offline' }], ['celsius', { units: 'c' }], ['early', { style: 'early' }]])
      out.push(mk(`${sz.label}:${m}:${v}`, at(sz, Object.assign({ hide: mixHide(m) }, o))));
  for (const sz of [S(340, 260), S(480, 360), S(900, 560), FILL(1920, 1080)]) for (const [v, o] of VIEWS) out.push(mk(`${sz.label}:view-${v}`, at(sz, o)));
  return out;
}
const FULL_SIZES = QUICK_SIZES.concat([S(300, 240), S(420, 320), S(560, 400), S(760, 480), S(800, 600), S(1000, 600), S(1100, 640), S(450, 800), FILL(1600, 900)]);
function full() {
  const out = [];
  for (const sz of FULL_SIZES) for (let n = 0; n < 256; n++) { const hide = PARTS.filter((p, i) => n & (1 << i)); out.push(mk(`${sz.label}:${mixName(hide)}`, at(sz, { hide }))); }
  const SIX = [S(340, 260), S(480, 360), S(900, 560), S(600, 900), FILL(1366, 768), FILL(1920, 1080)];
  const MIX16 = QUICK_MIXES.concat(['all-but-watches']);
  const VARIANTS = [['warning', { band: 'warning' }], ['watch', { band: 'watch' }], ['offline', { band: 'offline' }], ['fail', { band: 'fail' }], ['celsius', { units: 'c' }],
    ['easier', { style: 'easier' }], ['early', { style: 'early' }]];
  // (With a watch, Watches stay shown, as a teacher with one in force has them: else no band draws.)
  for (const sz of SIX) for (const [v, o] of VARIANTS) for (const m of MIX16) {
    const hide = v === 'watch' && m !== 'all-but-watches' ? mixHide(m).filter(p => p !== 'watches') : mixHide(m);
    out.push(mk(`${sz.label}:${mixName(hide)}:${v}`, at(sz, Object.assign({ hide }, o))));
  }
  for (const sz of SIX.filter(s => s.max)) for (const m of MIX16) out.push(mk(`${sz.label}:${m}:locked`, at(sz, { hide: mixHide(m), locked: true })));
  return out;
}
function load(m) {
  if (m === 'canon') return canon();
  if (m === 'quick') return quick();
  if (m === 'full') return full();
  const file = NAMED[m] || path.resolve(m);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { console.error('--matrix must be canon, quick, full, own, jit, or a JSON file of cases'); process.exit(2); }
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  return list.map((c, i) => mk(c.id || `case${i + 1}`, Object.assign({}, c, c.mix ? { hide: mixHide(c.mix) } : {})));
}
let CASES = load(MATRIX);
{ const seen = new Set(); for (const c of CASES) { if (seen.has(c.id)) throw new Error('two cases are named ' + c.id); seen.add(c.id); } }
if (ONLY) CASES = CASES.filter(c => ONLY.test(c.id));
if (IDS) {
  CASES = CASES.filter(c => IDS.has(c.id));
  if (CASES.length < IDS.size) console.error(`${IDS.size - CASES.length} of the ids in --ids are not in the matrix.`);
}
const sizeLabel = c => c.max ? `fill ${c.w}×${c.h}${c.boardSize !== 1 ? ' @' + c.boardSize : ''}` : `${c.w}×${c.h}${c.boardSize !== 1 ? ' @' + c.boardSize : ''}`;
const sizeKey = c => `${c.max ? 'F' : 'W'}${c.w}x${c.h}@${c.boardSize}${c.locked ? 'L' : ''}`;
const variantOf = c => [c.band !== 'none' && c.band, c.units === 'c' && '°C', c.style !== 'standard' && c.style, c.locked && 'locked', c.view !== 'main' && 'view ' + c.view, c.simple && 'Simple words', c.date && 'On a date ' + c.date].filter(Boolean).join(', ');
// The order cases run in, which changes the least between them: the board, the text style, the band, the size, then
// the matrix's order.
const runOrder = cases => cases.map((c, i) => ({ c, i })).sort((a, b) => {
  const ka = [a.c.band === 'fail' ? 1 : 0, a.c.style, a.c.band, sizeKey(a.c)], kb = [b.c.band === 'fail' ? 1 : 0, b.c.style, b.c.band, sizeKey(b.c)];
  for (let j = 0; j < ka.length; j++) if (ka[j] !== kb[j]) return ka[j] < kb[j] ? -1 : 1;
  return a.i - b.i;
}).map(x => x.c);
let ORDER = runOrder(CASES);
// --part i/n: a run of that order, so a part switches band and text style about as rarely as the whole run. Parts
// differ in count by one at most, and every case is in exactly one.
const ALL_N = ORDER.length;
if (PART) {
  ORDER = ORDER.slice(Math.floor((PART.i - 1) * ALL_N / PART.n), Math.floor(PART.i * ALL_N / PART.n));
  const inPart = new Set(ORDER);
  CASES = CASES.filter(c => inPart.has(c));
}
const partNote = PART ? `part ${PART.i} of ${PART.n}, of ${ALL_N}` : '';
const FROM = flag('from-metrics'), RESHOOT = flag('reshoot');
// --list: the cases, and nothing else runs. (Written in one go with no process.exit, which can cut a long list short
// in a pipe.)
const LISTING = flag('list');
if (LISTING) process.stdout.write(CASES.map(c => [c.id, sizeLabel(c), mixName(c.hide), variantOf(c)].join(' ') + '\n').join('') + `${CASES.length} cases${PART ? ` (${partNote})` : ''}\n`);

// ---- In the widget's frame: wait until the drawing stops changing (the fonts, a draw, fit()).
const SETTLE = async (min) => {
  await document.fonts.ready;
  const raf = () => new Promise(r => requestAnimationFrame(() => r()));
  const sig = () => { const wx = document.querySelector('#app .wx'), a = document.getElementById('app'); return innerWidth + 'x' + innerHeight + '|' + (wx ? wx.className + '|' + (wx.getAttribute('style') || '') + '|' + wx.innerHTML.length : a ? a.innerHTML.length : 0); };
  let s = sig(), still = 0;
  for (let i = 0; i < 40; i++) { await raf(); await raf(); const t = sig(); if (t === s) { if (++still >= min) return i; } else still = 0; s = t; }
  return -1;
};

// ---- In the widget's frame: the measures. o.marks: the board's corner marks over the window, in the frame's px.
const MEASURE = (o) => {
  const wx = document.querySelector('#app .wx');
  const IW = innerWidth, IH = innerHeight;
  if (!wx) return { none: true, iw: IW, ih: IH, text: ((document.getElementById('app') || document.body).innerText || '').replace(/\s+/g, ' ').slice(0, 120) };
  const inn = wx.querySelector(':scope > .in');
  const R = e => e.getBoundingClientRect();
  const B = q => ({ l: q.left, t: q.top, r: q.right, b: q.bottom });
  const area = q => Math.max(0, q.r - q.l) * Math.max(0, q.b - q.t);
  const clip = (q, c) => ({ l: Math.max(q.l, c.l), t: Math.max(q.t, c.t), r: Math.min(q.r, c.r), b: Math.min(q.b, c.b) });
  const WIN = { l: 0, t: 0, r: IW, b: IH };
  const r1 = n => Math.round(n * 10) / 10, r3 = n => Math.round(n * 1000) / 1000;
  const seenVis = new Map();
  const cssVis = e => {
    if (!e || e === document.documentElement || e === document.body) return true;
    if (seenVis.has(e)) return seenVis.get(e);
    const s = getComputedStyle(e), v = s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity !== 0 && cssVis(e.parentElement);
    seenVis.set(e, v); return v;
  };
  const vis = e => { const r = R(e); return r.width > 0.5 && r.height > 0.5 && cssVis(e); };
  const name = e => { const c = String(e.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.'); return e.tagName.toLowerCase() + (c ? '.' + c : ''); };
  // Glyph metrics from a canvas, in the element's own font: the ink above and below the baseline, and the font's ascent.
  const cv = document.createElement('canvas').getContext('2d'), mc = new Map();
  const fontOf = s => `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  const metric = (font, text) => {
    const k = font + '\u0000' + text;
    if (!mc.has(k)) { cv.font = font; const m = cv.measureText(text); mc.set(k, { fa: m.fontBoundingBoxAscent, fd: m.fontBoundingBoxDescent, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent }); }
    return mc.get(k);
  };
  // The union of boxes, exactly (coordinates compressed to a grid).
  const union = bs => {
    bs = bs.map(b => ({ l: Math.round(b.l * 2) / 2, t: Math.round(b.t * 2) / 2, r: Math.round(b.r * 2) / 2, b: Math.round(b.b * 2) / 2 })).filter(b => b.r > b.l && b.b > b.t);
    if (!bs.length) return 0;
    const xs = [...new Set(bs.flatMap(b => [b.l, b.r]))].sort((a, b) => a - b), ys = [...new Set(bs.flatMap(b => [b.t, b.b]))].sort((a, b) => a - b);
    const xi = new Map(xs.map((x, i) => [x, i])), yi = new Map(ys.map((y, i) => [y, i])), nx = xs.length - 1, g = new Uint8Array(nx * (ys.length - 1));
    let a = 0;
    for (const b of bs) for (let j = yi.get(b.t), j1 = yi.get(b.b); j < j1; j++) for (let i = xi.get(b.l), i1 = xi.get(b.r); i < i1; i++) {
      const k = j * nx + i;
      if (!g[k]) { g[k] = 1; a += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]); }
    }
    return a;
  };
  // The longest stretch of [from, to] that no interval covers.
  const longestGap = (iv, from, to) => {
    iv = iv.map(([a, b]) => [Math.max(a, from), Math.min(b, to)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let at = from, best = 0;
    for (const [a, b] of iv) { if (a > at) best = Math.max(best, a - at); at = Math.max(at, b); }
    return Math.max(best, to - at);
  };
  const scrollBox = e => { const s = e.closest('.scroll'); return s ? B(R(s)) : null; };

  // Atoms: each line of text (its ink, from the font's metrics) and each picture.
  const atoms = [], problems = [];
  const walk = document.createTreeWalker(wx, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    const e = n.parentElement, t = n.textContent.replace(/ /g, ' ').trim();
    if (!t || !e || e.closest('.sr, .fx, style, script') || !cssVis(e)) continue;
    const svg = e instanceof SVGElement;
    if (svg && e.tagName.toLowerCase() !== 'text') continue;
    const s = getComputedStyle(e);
    let fs = parseFloat(s.fontSize), rs = [], ink = [];
    if (svg) {
      const m = e.getScreenCTM(); fs *= m ? Math.hypot(m.a, m.b) : 1;
      const q = B(R(e));
      if (q.r - q.l > 0.5 && q.b - q.t > 0.5) { rs = [q]; ink = [{ l: q.l + 0.5, r: q.r - 0.5, t: q.t + 0.22 * fs, b: q.b - 0.2 * fs }]; }
    } else {
      const r = document.createRange(); r.selectNodeContents(n);
      const m = metric(fontOf(s), t);
      for (const q0 of r.getClientRects()) {
        if (q0.width <= 0.5 || q0.height <= 0.5) continue;
        const q = B(q0); rs.push(q);
        ink.push({ l: q.l + 0.5, r: q.r - 0.5, t: q.t + (m.fa - m.a), b: q.t + m.fa + m.d });
      }
    }
    const sb = scrollBox(e);
    if (sb) { rs = rs.map(q => clip(q, sb)).filter(q => area(q) > 0); ink = ink.map(q => clip(q, sb)).filter(q => area(q) > 0); }
    if (!rs.length) continue;
    atoms.push({ kind: 'text', el: e, t: t.slice(0, 24), rs, ink, fs, a: rs.reduce((x, q) => x + area(q), 0) });
  }
  const ICONS = 'svg.ic, svg.hi, svg.bigic, svg.chev, svg.go, .dot, .aqd, .pt, svg.compass, svg.arc, .bar, .aqscale, .aqpill, .chart svg';
  for (const e of wx.querySelectorAll(ICONS)) {
    if (e.closest('.fx, .sr') || !vis(e)) continue;
    let q = B(R(e)); const sb = scrollBox(e);
    if (sb) { q = clip(q, sb); if (!area(q)) continue; }
    atoms.push({ kind: 'icon', el: e, t: name(e) + (e.closest('h3') ? ' in “' + e.closest('h3').textContent.trim().slice(0, 14) + '”' : ''), rs: [q], ink: [q], fs: 0, a: area(q), bg: e.matches('.chart svg') });
  }
  const textAtoms = atoms.filter(a => a.kind === 'text');

  // Problems the Weather tests' own check leaves out: ink over ink, pictures cut by their card or the window, words
  // under the board's corner marks, and On a date's labels over its line.
  const seen = new Set(), say = s => { if (!seen.has(s)) { seen.add(s); problems.push(s); } };
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
    const A = atoms[i], C = atoms[j];
    if (A.bg || C.bg || A.el === C.el || A.el.contains(C.el) || C.el.contains(A.el)) continue;
    if (A.el.closest('svg.compass') && C.el.closest('svg.compass')) continue;
    let hit = 0;
    for (const a of A.ink) for (const b of C.ink) { const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t); if (w > 1 && h > 1) hit = Math.max(hit, Math.min(w, h)); }
    if (hit) say(`overlap: “${A.t}” and “${C.t}” by ${r1(hit)} px`);
  }
  for (const A of atoms) {
    if (A.kind !== 'icon') continue;
    const a = A.rs[0];
    if (a.l < -0.5 || a.t < -0.5 || a.r > IW + 0.5 || a.b > IH + 0.5) say(`out of the window: ${A.t}`);
    const c = A.el.parentElement && A.el.parentElement.closest('.card, .band, .rb, .chip');
    if (c) { const q = B(R(c)); if (a.l < q.l - 0.5 || a.t < q.t - 0.5 || a.r > q.r + 0.5 || a.b > q.b + 0.5) say(`cut: ${A.t} by its ${name(c)}`); }
  }
  for (const m of o.marks || []) for (const A of atoms) for (const q of A.ink) {
    if (Math.min(m.r, q.r) - Math.max(m.l, q.l) > 0.5 && Math.min(m.b, q.b) - Math.max(m.t, q.t) > 0.5) { say(`under ${m.name}: “${A.t}”`); break; }
  }
  const seg = (p, q, r) => {   // the length of segment p–q inside box r (Liang–Barsky)
    let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y;
    for (const [pp, qq] of [[-dx, p.x - r.l], [dx, r.r - p.x], [-dy, p.y - r.t], [dy, r.b - p.y]]) {
      if (pp === 0) { if (qq < 0) return 0; continue; }
      const t = qq / pp; if (pp < 0) { if (t > t1) return 0; if (t > t0) t0 = t; } else { if (t < t0) return 0; if (t < t1) t1 = t; }
    }
    return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
  };
  for (const ch of wx.querySelectorAll('.chart')) {
    if (!vis(ch)) continue;
    const segs = [];
    for (const p of ch.querySelectorAll('path')) {
      if (p.getAttribute('fill') !== 'none' || p.getAttribute('stroke') !== '#fff') continue;
      const m = p.getScreenCTM(); if (!m) continue;
      for (const run of (p.getAttribute('d') || '').split('M').filter(Boolean)) {
        const pts = run.split('L').map(s => s.trim().split(/[ ,]+/).map(Number)).filter(a => a.length === 2 && a.every(isFinite)).map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
        for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
      }
    }
    for (const A of textAtoms.filter(a => ch.contains(a.el) && /°/.test(a.t))) {
      const k = A.ink[0], r = { l: k.l - 1.2, r: k.r + 1.2, t: k.t - 1.2, b: k.b + 1.2 };
      const len = segs.reduce((s, [p, q]) => s + seg(p, q, r), 0);
      if (len > 0.5) say(`the chart’s “${A.t}” is over its line (${r1(len)} px)`);
    }
  }

  // Each card (and Now's own cell): how much of its inside is drawn, and its longest empty run down and across.
  const fill = (e, label, hero) => {
    const q = B(R(e)), s = getComputedStyle(e), sb = scrollBox(e);
    let c = { l: q.l + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft), r: q.r - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight),
      t: q.t + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop), b: q.b - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingBottom) };
    if (sb) c = clip(c, sb);
    const W = c.r - c.l, H = c.b - c.t;
    if (W < 2 || H < 2) return null;
    const bs = atoms.filter(a => e.contains(a.el)).flatMap(a => a.kind === 'text' ? a.ink : a.rs).map(b => clip(b, c)).filter(b => area(b) > 0);
    return { name: label, hero: !!hero, w: Math.round(q.r - q.l), h: Math.round(q.b - q.t), fill: r3(union(bs) / (W * H)),
      emptyV: r3(longestGap(bs.map(b => [b.t, b.b]), c.t, c.b) / H), emptyH: r3(longestGap(bs.map(b => [b.l, b.r]), c.l, c.r) / W), fs: r1(parseFloat(s.fontSize)) };
  };
  const cards = [];
  for (const c of wx.querySelectorAll('.card')) {
    if (!vis(c)) continue;
    const h3 = c.querySelector(':scope > h3'), label = (h3 && h3.textContent.replace(/\s+/g, ' ').trim().replace(/Open-Meteo$/, '').trim().slice(0, 24)) || (c.matches('.wl') ? 'What to wear line' : name(c));
    const f = fill(c, label); if (f) cards.push(f);
  }
  const heroEl = [...wx.querySelectorAll('.hero')].find(vis);
  const hero = heroEl ? fill(heroEl, 'Now', true) : null;

  // Coverage: cards, the band, the bars, and each line of Now (its content, not its whole column).
  const CONT = '.hero, .left, .right, .smalls, .side, .dnow, .cards, .scroll, .dscroll, .alert, .dair';
  const contentBox = e => { if (e instanceof SVGElement) return B(R(e)); const r = document.createRange(); r.selectNodeContents(e); const q = r.getBoundingClientRect(); return q.width > 0.5 && q.height > 0.5 ? B(q) : null; };
  const cover = [], heroLines = [];
  const visit = (e, inHero, sc) => {
    if (!vis(e)) return;
    if (e.matches('.card, .band, .bar2')) { const q = B(R(e)); cover.push(sc ? clip(q, sc) : q); return; }
    if (e.matches(CONT)) { const s2 = e.matches('.scroll') ? B(R(e)) : sc; for (const k of e.children) visit(k, inHero || e.matches('.hero'), s2); return; }
    let q = contentBox(e); if (!q) return; if (sc) q = clip(q, sc);
    cover.push(q); if (inHero) heroLines.push(q);
  };
  const root = inn || wx;
  for (const k of root.children) visit(k, false, null);
  const is = getComputedStyle(root), ir = B(R(root));
  const pad = { l: ir.l + parseFloat(is.paddingLeft), r: ir.r - parseFloat(is.paddingRight), t: ir.t + parseFloat(is.paddingTop), b: ir.b - parseFloat(is.paddingBottom) };
  const padA = Math.max(1, area(clip(pad, WIN)));
  const coverage = union(cover.map(q => clip(q, WIN))) / padA, heroShare = union(heroLines.map(q => clip(q, WIN))) / padA;
  const ink = union(atoms.flatMap(a => a.kind === 'text' ? a.ink : a.rs).map(q => clip(q, WIN))) / (IW * IH);

  // Text sizes: the smallest, and the median weighted by area.
  let minText = null, minWhat = '';
  for (const a of textAtoms) if (minText === null || a.fs < minText) { minText = a.fs; minWhat = a.t; }
  const byFs = textAtoms.slice().sort((a, b) => a.fs - b.fs), total = byFs.reduce((s, a) => s + a.a, 0);
  let acc = 0, median = null;
  for (const a of byFs) { acc += a.a; if (acc >= total / 2) { median = a.fs; break; } }

  // The key lines teachers read from afar, where shown: their font px (the smallest, where there are several).
  const all = sel => [...wx.querySelectorAll(sel)].filter(vis);
  const pxOf = sels => { for (const sel of [].concat(sels)) { const es = all(sel); if (es.length) return r1(Math.min(...es.map(e => parseFloat(getComputedStyle(e).fontSize)))); } return null; };
  const windMore = all('.hero .more').filter(e => /Wind \d/.test(e.textContent));
  const keys = {
    cond: pxOf(['.dnow .hero .cond', '.hero .cond']),
    hl: pxOf(['.dnow .hero .hl', '.hero .hl']),
    wear: pxOf(['.wear .advice', '.wl .says', '.simple .say']),
    days: pxOf(['.days .hi, .days .lo', '.week .h, .week .l']),
    wind: pxOf('.windc .big') || (windMore.length ? r1(parseFloat(getComputedStyle(windMore[0]).fontSize)) : null),
    sun: pxOf('.sunrow b'),
    // (Beyond the six: what the hourly forecast, air quality, and a warning show big, where they are the view.)
    hours: pxOf('.hr .v:not(.sm)'),
    air: pxOf(['.dair .big', '.air .big']),
    alert: pxOf('.scroll .alert h4')
  };
  for (const k of Object.keys(keys)) if (keys[k] === null) delete keys[k];
  const extra = { place: pxOf('.place'), moon: pxOf('.moon .name'), more: pxOf('.hero .more'), src: pxOf('.hero .src'),
    foot: pxOf('.foot'), h3: pxOf('h3'), note: pxOf('.wear .note'), say: pxOf('.simple .say'), band: pxOf('.band') };
  for (const k of Object.keys(extra)) if (extra[k] === null) delete extra[k];

  // The big temperature: its font, its digits as drawn, and its unit letter (size, ink, and baseline against the digits).
  let temp = null;
  const te = all('.dnow .temp')[0] || all('.hero .temp')[0] || all('.temp')[0] || all('.chip')[0];
  if (te) {
    const s = getComputedStyle(te), n = [...te.childNodes].find(x => x.nodeType === 3 && x.textContent.trim());
    temp = { sel: name(te), font: r1(parseFloat(s.fontSize)) };
    if (n) {
      const txt = n.textContent.trim().replace(/°$/, ''), m = metric(fontOf(s), txt), r = document.createRange(); r.selectNodeContents(n);
      const q = r.getClientRects()[0];
      temp.text = txt; temp.digits = r1(m.a + m.d);
      if (q) {
        const base = q.top + m.fa; temp.top = r1(base - m.a);
        const u = te.querySelector('.unit'), dg = te.querySelector('.deg');
        if (dg) temp.deg = r1(parseFloat(getComputedStyle(dg).fontSize));
        if (u && u.firstChild) {
          const su = getComputedStyle(u), mu = metric(fontOf(su), u.textContent.trim()), ru = document.createRange(); ru.selectNodeContents(u.firstChild);
          const qu = ru.getClientRects()[0];
          temp.unit = { text: u.textContent.trim(), font: r1(parseFloat(su.fontSize)), ink: r1(mu.a + mu.d), ratio: r3((mu.a + mu.d) / (m.a + m.d)), dy: qu ? r1(qu.top + mu.fa - base) : null };
        }
      }
    }
  }
  const cls = wx.className.replace(/\bsc-\S+|\bstill\b/g, '').replace(/\s+/g, ' ').trim();
  return {
    iw: IW, ih: IH, family: getComputedStyle(wx).fontFamily.split(',')[0].replace(/"/g, '').trim(), cls, layout: ((cls.match(/\bL-(\w+)/) || [])[1]) || '', u: parseFloat(getComputedStyle(wx).getPropertyValue('--u')) || null, fs: r1(parseFloat(getComputedStyle(wx).fontSize)),
    temp, keys, extra, minText: minText === null ? null : r1(minText), minWhat, median: median === null ? null : r1(median),
    coverage: r3(coverage), heroShare: r3(heroShare), ink: r3(ink), cards, hero, atoms: atoms.length, problems
  };
};

// ---- The board.
const SAVED = { data: null };
let browser = null, BASE = '';
const boards = {};
const F = (b, fn, a) => WXT.F(b.page, fn, a);
const settle = (b, min = 1) => F(b, SETTLE, min);
const wait = ms => new Promise(r => setTimeout(r, ms));

async function newBoard(kind) {
  const errors = [];
  const b = await WXT.board(browser, errors, { opts: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE, serviceWorkers: 'block' } });
  Object.assign(b, { kind, errors });
  // (Every site failing, from the start: a school's filter, an outage.)
  if (kind === 'fail') for (const k of Object.keys(b.wx.answers)) b.wx.answers[k] = { abort: true };
  // (The corner clock on, as Auto shows it in full screen: every corner mark there.)
  await setCornerClock(b.page, 'on');
  await b.page.evaluate(() => window.__board21.openWidget('weather', { fresh: true }));
  if (!await WXT.connected(b.page)) throw new Error('the Weather window never connected');
  if (kind === 'fail') {
    await b.page.waitForTimeout(1500);
    await WXT.put(b.page, 'data', SAVED.data);
    if (!await eventually(() => F(b, () => !!document.querySelector('#app .band.off')), 10000)) throw new Error('the failing board never showed “Can’t get new weather.”');
  } else {
    if (!await WXT.drawn(b.page, K, 15000)) throw new Error('the Weather window never drew the weather');
    if (!await eventually(async () => !!((await WXT.data(b.page)) || {}).saved, 15000)) throw new Error('the forecast was never saved');
    if (!SAVED.data) SAVED.data = await WXT.data(b.page);
  }
  const conf = (await WXT.conf(b.page)) || {};
  b.place = conf.place || null;
  b.st = { style: 'standard', band: kind === 'fail' ? 'fail' : 'none', vw: 1920, vh: 1080, scale: 1, max: false, locked: false, w: 0, h: 0, conf: null, view: 'main' };
  return b;
}
async function boardFor(kind) {
  if (!boards.live) boards.live = await newBoard('live');
  if (kind === 'fail' && !boards.fail) boards.fail = await newBoard('fail');
  return boards[kind];
}
const confOf = (b, c) => Object.assign(b.place ? { place: b.place } : {}, { units: c.units, hide: c.hide.slice(), simple: !!c.simple, still: false, date: c.date || null });
async function putConf(b, conf) {
  const j = JSON.stringify(conf);
  if (b.st.conf === j) return false;
  await WXT.put(b.page, 'config', conf);
  b.st.conf = j;
  return true;
}
// A view, as a tap on a part opens it (the widget keeps it in its own state: tapped here through a stand-in element).
async function setView(b, v) {
  if (b.st.view === v) return false;
  await F(b, v => { const host = document.querySelector('#app .wx > .in') || document.getElementById('view'), t = document.createElement('i'); t.dataset.go = v; host.appendChild(t); t.click(); t.remove(); }, v);
  b.st.view = v;
  return true;
}
async function unlock(b) { if (b.st.locked) { await unlockBoard(b.page); b.st.locked = false; await b.page.waitForTimeout(200); } }
async function ensureStyle(b, style) {
  if (b.st.style === style) return false;
  await unlock(b);
  const p = b.page;
  await openSettings(p, ['letters']);
  await p.click(`#settings [data-act="letters"][data-val="${STYLE_KEY[style]}"]`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(900);
  b.st.style = style;
  return true;
}
const BAND_SEL = { none: null, warning: '.band.warn', watch: '.band.watch', offline: '.band.off' };
async function ensureBand(b, band) {
  if (b.kind === 'fail' || b.st.band === band) return false;
  const p = b.page;
  if (band === 'offline') {
    await b.ctx.setOffline(true);
  } else {
    if (b.st.band === 'offline') await b.ctx.setOffline(false);
    const file = ALERTS[band];
    if (!file) throw new Error('unknown band ' + band);
    b.wx.answers['api.weather.gov/alerts/active'] = file;
  }
  // (Everything shown, on the main view, so the band shows: then wait for it.)
  await putConf(b, confOf(b, Object.assign({}, DEF, { hide: [] })));
  await setView(b, 'main');
  const want = BAND_SEL[band];
  const ok = () => F(b, sel => { const e = document.querySelector('#app .band'); return sel ? !!(e && e.matches('#app ' + sel)) : !e; }, want);
  let done = false;
  for (let i = 0; i < 6 && !done; i++) {
    if (band !== 'offline') await F(b, () => window.B21Weather && window.B21Weather.refresh());
    done = await eventually(ok, 2500);
  }
  if (!done) throw new Error(`the ${band} band never showed`);
  b.st.band = band;
  return true;
}
async function ensureGeo(b, c) {
  const p = b.page, st = b.st, s = c.boardSize || 1;
  const vw = c.max ? c.w : Math.max(1920, Math.ceil((c.w + 80) * s)), vh = c.max ? c.h : Math.max(1080, Math.ceil((c.h + 120) * s));
  let moved = false;
  if (st.locked && !c.locked) await unlock(b);
  if (vw !== st.vw || vh !== st.vh) { await p.setViewportSize({ width: vw, height: vh }); st.vw = vw; st.vh = vh; moved = true; }
  if (s !== st.scale) { await p.evaluate(s => window.__board21.setBoardScale(s), s); st.scale = s; moved = true; st.w = 0; }
  if (c.max) { if (!st.max) { await p.evaluate(k => window.__board21.setMaximized(k, true), K); st.max = true; moved = true; } }
  else {
    if (st.max) { await p.evaluate(k => window.__board21.setMaximized(k, false), K); st.max = false; moved = true; st.w = 0; }
    if (st.w !== c.w || st.h !== c.h) { await p.evaluate(([k, w, h]) => window.__board21.setRect(k, { x: 20, y: 20, w, h: h + 40 }), [K, c.w, c.h]); st.w = c.w; st.h = c.h; moved = true; }
  }
  if (c.locked && !st.locked) { await lockBoard(p, 'widgets'); st.locked = true; moved = true; }
  if (!moved) return false;
  // Until the window has its new size (and, filling the board, the widget knows it).
  let last = '', same = 0;
  for (let i = 0; i < 100; i++) {
    const g = await F(b, () => { const wx = document.querySelector('#app .wx'); return [innerWidth, innerHeight, !!(wx && wx.classList.contains('filled'))]; }).catch(() => null);
    if (g) {
      const k = g.join();
      if (!c.max && g[0] === c.w && g[1] === c.h) break;
      if (c.max && g[2] && k === last && ++same >= 2) break;
      if (k !== last) same = 0;
      last = k;
    }
    await p.waitForTimeout(25);
  }
  return true;
}
// The board's corner marks over the window, in the widget's px (only for a window that fills the board).
const marksOf = b => b.page.evaluate(k => {
  const vis = e => { const s = getComputedStyle(e), q = e.getBoundingClientRect(); return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && q.width > 0; };
  const f = document.querySelector(`.win[data-ikey="${k}"] iframe`), r = f.getBoundingClientRect(), w = f.contentWindow, sx = r.width / w.innerWidth, sy = r.height / w.innerHeight;
  const marks = [...document.querySelectorAll('.picker-btn, .corner-clock, .lock-pad')].filter(vis).map(e => { const q = e.getBoundingClientRect(); return { name: e.classList[0], l: (q.left - r.left) / sx, t: (q.top - r.top) / sy, r: (q.right - r.left) / sx, b: (q.bottom - r.top) / sy }; })
    .filter(m => m.r > 0 && m.b > 0 && m.l < w.innerWidth && m.t < w.innerHeight);
  return { zoom: sx, marks };
}, K);

async function shoot(b, c, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (c.max) await b.page.screenshot({ path: file, animations: 'disabled' });
  else await b.page.locator(`.win[data-ikey="${K}"]`).screenshot({ path: file, animations: 'disabled' });
}

// One case: the board set as the case says (only what differs from the case before), settled, measured.
async function runCase(c, shotFile) {
  const t0 = Date.now();
  const b = await boardFor(c.band === 'fail' ? 'fail' : 'live');
  const e0 = b.errors.length;
  if (CSS !== null) await F(b, css => { let s = document.getElementById('wx-harness-css'); if (!s) { s = document.createElement('style'); s.id = 'wx-harness-css'; document.head.appendChild(s); } if (s.textContent !== css) s.textContent = css; }, CSS);
  await ensureStyle(b, c.style);
  await ensureBand(b, c.band);
  const moved = await ensureGeo(b, c);
  const conf = confOf(b, c), changed = await putConf(b, conf);
  if (c.date) await eventually(() => F(b, () => !!document.querySelector('#app .wx.V-date .hero')), 8000);
  const viewed = await setView(b, c.view);
  await settle(b, moved || changed || viewed ? 2 : 1);
  const mk = await marksOf(b);
  const m = await F(b, MEASURE, { marks: c.max ? mk.marks : [] });
  const pr = await WXT.problems(b.page, c.max);
  const parts = await WXT.parts(b.page);
  if (shotFile) await shoot(b, c, shotFile);
  return { m, pr, parts, zoom: mk.zoom, marks: mk.marks.length, errors: b.errors.slice(e0), ms: Date.now() - t0 };
}

// ---- Scoring: how much room a case wastes, and how small its key lines are for its window (higher is worse).
// E: the worst empty run in a card or Now's cell; C: the window not covered; K: the smallest key line against 4.5% of the
// window's shorter side (14 to 48 px); T: the temperature's digits against 20% of the window's height. From a row of
// metrics.jsonl, so --from-metrics can score again.
function score(row) {
  if (!row.layout && !row.cards.length && row.coverage == null) return { E: 0, C: 1, K: 1, T: 1, total: 3 };
  const z = row.zoom || 1, short = Math.min(row.iw, row.ih) * z, digits = row.tempPx && row.tempPx.digits ? row.tempPx.digits * z : 0;
  const E = Math.max(0, ...row.cards.map(c => Math.max(c.emptyV, c.emptyH)), row.hero ? Math.max(row.hero.emptyV, row.hero.emptyH) : 0);
  const C = 1 - Math.min(1, row.coverage || 0);
  const target = Math.max(14, Math.min(48, 0.045 * short));
  const K = row.keyMin ? Math.max(0, 1 - row.keyMin / target) : 0;
  const T = digits ? Math.max(0, 1 - digits / (0.2 * row.ih * z)) : 0;
  const q = x => Math.round(x * 1000) / 1000;
  return { E: q(E), C: q(C), K: q(K), T: q(T), total: q(E + C + K + T) };
}
// The worst card's longest empty run (cards only, as the summary's column says), and Now's cell's own.
const emptiest = k => ({ card: k.name, share: Math.max(k.emptyV, k.emptyH), dir: k.emptyV >= k.emptyH ? 'down' : 'across' });
function derive(row) {
  row.worstEmpty = row.cards.map(emptiest).sort((a, b) => b.share - a.share)[0] || null;
  row.nowEmpty = row.hero ? emptiest(row.hero) : null;
  row.score = score(row);
  return row;
}
function record(c, r) {
  const m = r.m || {};
  const keyVals = Object.entries(m.keys || {}), keyMinE = keyVals.sort((a, b) => a[1] - b[1])[0];
  const keyMin = keyMinE ? Math.round(keyMinE[1] * r.zoom * 10) / 10 : null;
  // (The grid's empty tracks count in the main view only, as the Weather tests check them.)
  const gaps = r.parts && !/V-(detail|simple|date)/.test(m.cls || '') ? r.parts.gaps : [];
  const problems = [...new Set([].concat((r.pr && r.pr.list) || [], gaps, m.problems || [], m.none ? [`nothing drawn: ${m.text}`] : [], r.errors.map(e => 'page error: ' + e)))];
  return derive({
    id: c.id, size: sizeLabel(c), w: c.w, h: c.h, max: c.max, boardSize: c.boardSize, locked: c.locked, mix: mixName(c.hide), hide: c.hide, band: c.band, units: c.units, style: c.style, view: c.view,
    simple: c.simple, date: c.date, iw: m.iw, ih: m.ih, family: m.family, zoom: Math.round(r.zoom * 1000) / 1000, marks: r.marks, cls: m.cls || '', layout: m.layout || '', u: m.u, fs: m.fs,
    tempPx: m.temp || null, keyPx: m.keys || {}, keyMin, keyMinOf: keyMinE ? keyMinE[0] : null, extraPx: m.extra || {}, minTextPx: m.minText, minTextOf: m.minWhat, textPxMedian: m.median,
    coverage: m.coverage, heroShare: m.heroShare, ink: m.ink, cards: m.cards || [], hero: m.hero || null, parts: r.parts || null, problems, ms: r.ms
  });
}

// ---- Summary
// Cases that draw alike count once among the worst, with their look-alikes: the same size, classes (so the same band
// and view), and cards. (A hidden part the layout never shows, Watches with no watch, a line more or less in Now, °C,
// a text style, or the padlocks.)
const lookKey = r => [r.size, r.cls, r.cards.map(c => c.name).join('+')].join('|');
function distinctWorst(rows, n) {
  const by = new Map();
  for (const r of rows.slice().sort((a, b) => b.score.total - a.score.total)) { const k = lookKey(r); if (by.has(k)) by.get(k).all.push(r); else by.set(k, { all: [r] }); }
  // (Each group shown by its plainest case among the worst-scoring: “none” rather than “hourly+watches”.)
  return [...by.values()].slice(0, n).map(g => {
    const top = g.all[0].score.total, r = g.all.filter(x => x.score.total >= top - 0.02).sort((a, b) => a.id.length - b.id.length || b.score.total - a.score.total)[0];
    return { r, alike: g.all.filter(x => x !== r).map(x => x.id) };
  });
}
const pc = v => v == null ? '–' : Math.round(v * 100) + '%';
const med = a => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const mn = a => { a = a.filter(x => x != null); return a.length ? Math.min(...a) : null; };
const mx = a => { a = a.filter(x => x != null); return a.length ? Math.max(...a) : null; };
const f1 = v => v == null ? '–' : String(Math.round(v * 10) / 10);
const esc = s => String(s).replace(/\|/g, '\\|');
function summary(rows, info) {
  const L = [];
  L.push(`# Weather layout metrics: ${info.matrix}`, '');
  L.push(`Checkout: \`${ROOT}\` at ${info.commit}. ${rows.length} cases in ${Math.round(info.secs)} s (${Math.round(info.secs / Math.max(1, rows.length) * 1000)} ms a case).${PART ? ` Part ${PART.i} of ${PART.n} of the ${ALL_N} cases.` : ''} ${info.shotsLine || `Shots: ${SHOTS}${SHOTS === 'worst' ? ` (${info.shot} worst)` : ''}, scale ${SCALE}.`}`, '');
  L.push('Columns: **temp** is the hero temperature: its digits’ drawn height / its font px. **key** is the smallest key line’s font px and which one. **cover** is the window (less its padding) covered by Now’s lines, the cards, and the band. **ink** is the window covered by text and pictures. **empty** is the worst card’s longest empty run, as a share of its height (↓) or width (→); **Now empty** is the same for Now’s own cell. Px are screen px (CSS px × the board’s Size). **score** is E + C + K + T (README).', '');
  const groups = new Map();
  for (const r of rows) { const k = r.size; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  L.push('## By size', '', '| size | cases | layouts | temp digits med (min) | key px med (min) | cover med | ink med | worst empty med (max) | Now empty med | score med | with problems |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, rs] of groups) {
    const z = r => r.zoom || 1;
    L.push(`| ${k} | ${rs.length} | ${[...new Set(rs.map(r => r.layout + (/V-(\w+)/.exec(r.cls) ? '/' + /V-(\w+)/.exec(r.cls)[1] : '')))].join(' ')} | ${f1(med(rs.map(r => r.tempPx && r.tempPx.digits * z(r))))} (${f1(mn(rs.map(r => r.tempPx && r.tempPx.digits * z(r))))}) | ${f1(med(rs.map(r => r.keyMin)))} (${f1(mn(rs.map(r => r.keyMin)))}) | ${pc(med(rs.map(r => r.coverage)))} | ${pc(med(rs.map(r => r.ink)))} | ${pc(med(rs.map(r => r.worstEmpty && r.worstEmpty.share)))} (${pc(mx(rs.map(r => r.worstEmpty && r.worstEmpty.share)))}) | ${pc(med(rs.map(r => r.nowEmpty && r.nowEmpty.share)))} | ${f1(med(rs.map(r => r.score.total)))} | ${rs.filter(r => r.problems.length).length} |`);
  }
  const lay = new Map();
  for (const r of rows) { const k = (r.layout ? 'L-' + r.layout : '(none)') + (/V-(\w+)/.exec(r.cls) ? ' V-' + /V-(\w+)/.exec(r.cls)[1] : ''); if (!lay.has(k)) lay.set(k, []); lay.get(k).push(r); }
  L.push('', '## By layout', '', '| layout | cases | temp digits med (min) | key px med (min) | cover med | ink med | worst empty med (max) | score med | with problems |', '|---|---|---|---|---|---|---|---|---|');
  for (const [k, rs] of [...lay].sort()) L.push(`| ${k} | ${rs.length} | ${f1(med(rs.map(r => r.tempPx && r.tempPx.digits * (r.zoom || 1))))} (${f1(mn(rs.map(r => r.tempPx && r.tempPx.digits * (r.zoom || 1))))}) | ${f1(med(rs.map(r => r.keyMin)))} (${f1(mn(rs.map(r => r.keyMin)))}) | ${pc(med(rs.map(r => r.coverage)))} | ${pc(med(rs.map(r => r.ink)))} | ${pc(med(rs.map(r => r.worstEmpty && r.worstEmpty.share)))} (${pc(mx(rs.map(r => r.worstEmpty && r.worstEmpty.share)))}) | ${f1(med(rs.map(r => r.score.total)))} | ${rs.filter(r => r.problems.length).length} |`);
  const worst = distinctWorst(rows, 30);
  L.push('', '## Worst 30 by score (look-alikes once)', '', '| id | layout | score (E C K T) | temp | key | cover | ink | empty | Now empty | look-alikes |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const { r, alike } of worst) L.push(`| ${esc(r.id)} | ${esc(r.cls)} | ${r.score.total} (${r.score.E} ${r.score.C} ${r.score.K} ${r.score.T}) | ${tempCell(r)} | ${keyCell(r)} | ${pc(r.coverage)} | ${pc(r.ink)} | ${emptyCell(r)} | ${nowCell(r)} | ${alike.length ? alike.length + ': ' + esc(alike.slice(0, 3).join(', ')) + (alike.length > 3 ? ', …' : '') : ''} |`);
  const mixes = new Map();
  for (const r of rows) { const k = r.mix + variant(r); if (!mixes.has(k)) mixes.set(k, []); mixes.get(k).push(r); }
  L.push('', '## By mix (over every size), worst first', '', '| mix | cases | score med (max) | cover med | ink med | worst empty med | key px med (min) | temp digits med |', '|---|---|---|---|---|---|---|---|');
  for (const [k, rs] of [...mixes].sort((a, b) => med(b[1].map(r => r.score.total)) - med(a[1].map(r => r.score.total))))
    L.push(`| ${k} | ${rs.length} | ${f1(med(rs.map(r => r.score.total)))} (${f1(mx(rs.map(r => r.score.total)))}) | ${pc(med(rs.map(r => r.coverage)))} | ${pc(med(rs.map(r => r.ink)))} | ${pc(med(rs.map(r => r.worstEmpty && r.worstEmpty.share)))} | ${f1(med(rs.map(r => r.keyMin)))} (${f1(mn(rs.map(r => r.keyMin)))}) | ${f1(med(rs.map(r => r.tempPx && r.tempPx.digits * (r.zoom || 1))))} |`);
  const bad = rows.filter(r => r.problems.length);
  L.push('', `## Problems (${bad.length} cases)`, '');
  const kinds = new Map();
  for (const r of bad) for (const p of r.problems) { const k = p.replace(/\d+(\.\d+)?/g, '#').replace(/“[^”]*”/g, '“…”'); if (!kinds.has(k)) kinds.set(k, []); kinds.get(k).push(r.id); }
  for (const [k, ids] of [...kinds].sort((a, b) => b[1].length - a[1].length)) L.push(`- ${esc(k)}: ${ids.length} (${ids.slice(0, 6).join(', ')}${ids.length > 6 ? ', …' : ''})`);
  if (!bad.length) L.push('None.');
  L.push('', '## Every case', '', '| id | size | mix | layout | temp | key | cover | ink | empty | Now empty | problems |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) L.push(`| ${esc(r.id)} | ${r.size} | ${esc(r.mix)}${variant(r)} | ${esc(r.cls)} | ${tempCell(r)} | ${keyCell(r)} | ${pc(r.coverage)} | ${pc(r.ink)} | ${emptyCell(r)} | ${nowCell(r)} | ${r.problems.length ? esc(r.problems.slice(0, 3).join('; ')) + (r.problems.length > 3 ? ` (+${r.problems.length - 3})` : '') : ''} |`);
  return L.join('\n') + '\n';
}
const variant = r => { const v = variantOf(r); return v ? ` (${esc(v)})` : ''; };
const tempCell = r => r.tempPx && r.tempPx.digits ? `${f1(r.tempPx.digits * (r.zoom || 1))} / ${f1(r.tempPx.font * (r.zoom || 1))}` : '–';
const keyCell = r => r.keyMin ? `${f1(r.keyMin)} ${r.keyMinOf}` : '–';
const emptyCell = r => r.worstEmpty ? `${pc(r.worstEmpty.share)}${r.worstEmpty.dir === 'down' ? '↓' : '→'} ${esc(r.worstEmpty.card)}` : '–';
const nowCell = r => r.nowEmpty ? `${pc(r.nowEmpty.share)}${r.nowEmpty.dir === 'down' ? '↓' : '→'}` : '–';

// A page of the shots, each with its measures: open it beside another run's to compare.
const shotName = id => id.replace(/[^\w.@+-]+/g, '_') + '.png';
function gallery(rows, info) {
  const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const items = rows.filter(r => fs.existsSync(path.join(OUTDIR, 'shots', shotName(r.id)))).map(r => `<figure><a href="shots/${h(shotName(r.id))}"><img src="shots/${h(shotName(r.id))}" loading="lazy" alt="${h(r.id)}"></a>
<figcaption><b>${h(r.id)}</b> ${h(r.size)}, ${h(r.mix)}${h(variant(r))}<br>${h(r.cls)} · temp ${h(tempCell(r))} · key ${h(keyCell(r))} · cover ${pc(r.coverage)} · ink ${pc(r.ink)} · empty ${h(emptyCell(r))} · Now empty ${h(nowCell(r))}${r.problems.length ? `<br><span class="p">${h(r.problems.slice(0, 3).join('; '))}</span>` : ''}</figcaption></figure>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Weather: ${h(info.matrix)}</title>
<style>:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#1f2937;--card:#fff;--muted:#5b6472}@media (prefers-color-scheme:dark){:root{--bg:#111418;--fg:#e5e7eb;--card:#1b1f25;--muted:#9aa3af}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}h1{font-size:18px;margin:0 0 12px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:16px}figure{margin:0;background:var(--card);border-radius:10px;padding:10px}
img{display:block;max-width:100%;height:auto;border-radius:6px}figcaption{margin-top:8px;color:var(--muted)}figcaption b{color:var(--fg)}.p{color:#c2410c}</style>
<h1>Weather: ${h(info.matrix)}, ${h(info.commit)}</h1><main>${items}</main>\n`;
}

// ---- Main
// --from-metrics: no browser. The rows in <out>/metrics.jsonl scored again, and summary.md and gallery.html written again.
function fromMetrics() {
  const rows = fs.readFileSync(path.join(OUTDIR, 'metrics.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => derive(JSON.parse(l)));
  fs.writeFileSync(path.join(OUTDIR, 'metrics.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  const old = (() => { try { return fs.readFileSync(path.join(OUTDIR, 'summary.md'), 'utf8'); } catch (e) { return ''; } })();
  const m = /at (\S+( \(with changes\))?)\. \d+ cases in (\d+) s/.exec(old), shot = (() => { try { return fs.readFileSync(path.join(OUTDIR, 'worst.txt'), 'utf8').trim().split('\n').length; } catch (e) { return 0; } })();
  const byId = new Map(rows.map(r => [r.id, r])), ordered = CASES.map(c => byId.get(c.id)).filter(Boolean).concat(rows.filter(r => !CASES.some(c => c.id === r.id)));
  const sl = /Shots: [^.]*\./.exec(old);
  fs.writeFileSync(path.join(OUTDIR, 'summary.md'), summary(ordered, { matrix: MATRIX, commit: m ? m[1] : '?', secs: m ? +m[3] : 0, shot, shotsLine: sl ? sl[0] : null }));
  if (fs.existsSync(path.join(OUTDIR, 'shots'))) fs.writeFileSync(path.join(OUTDIR, 'gallery.html'), gallery(ordered, { matrix: MATRIX, commit: m ? m[1] : '?' }));
  console.log(`${rows.length} rows scored again. ${path.join(OUTDIR, 'summary.md')}`);
  process.exit(0);
}
if (FROM && !RESHOOT && !LISTING) fromMetrics();
if (!LISTING) (async () => {
  const t0 = Date.now();
  fs.mkdirSync(OUTDIR, { recursive: true });
  const shotDir = path.join(OUTDIR, 'shots');
  if (SHOTS !== 'none') fs.mkdirSync(shotDir, { recursive: true });
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() + (require('child_process').execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'widgets', 'tests/lib.js'], { encoding: 'utf8' }).trim() ? ' (with changes)' : ''); } catch (e) { return '?'; } })();
  // (A part with no cases, such as part 7 of 7 of a 3-case file: no browser.)
  if (!ORDER.length && !RESHOOT) {
    fs.writeFileSync(path.join(OUTDIR, 'metrics.jsonl'), '');
    fs.writeFileSync(path.join(OUTDIR, 'summary.md'), summary([], { matrix: MATRIX, commit, secs: 0, shot: 0 }));
    console.log(`No cases to run. ${path.join(OUTDIR, 'summary.md')}`);
    process.exit(0);
  }
  useLib();
  // The checkout, served as tests/run.js serves it.
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/`;
  setBase(BASE);
  browser = await chromium.launch();
  // Nothing reaches a real site: anything not to this server is aborted (stubWeather's own route, added later, answers
  // the weather sites first).
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async opts => {
    const c = await newContext(opts);
    await c.addInitScript(() => { window.showSaveFilePicker = undefined; });
    await c.route(u => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(String(u)), r => r.abort('internetdisconnected').catch(() => {}));
    return c;
  };
  const metricsFile = path.join(OUTDIR, 'metrics.jsonl');
  // --reshoot: the worst cases of the run in <out> (scored again) that have no shot, set again and shot.
  if (RESHOOT) {
    let n = 0;
    try {
      const rows = fs.readFileSync(metricsFile, 'utf8').trim().split('\n').filter(Boolean).map(l => derive(JSON.parse(l)));
      const worst = distinctWorst(rows, WORST_N).map(x => x.r);
      fs.mkdirSync(shotDir, { recursive: true });
      for (const row of worst) {
        const c = CASES.find(x => x.id === row.id), f = path.join(shotDir, shotName(row.id));
        if (!c || fs.existsSync(f)) continue;
        try { await runCase(c, f); n++; } catch (err) { console.error(`  shot ${c.id}: ${err.message}`); }
      }
      fs.writeFileSync(path.join(OUTDIR, 'worst.txt'), worst.map((r, i) => `${i + 1}. ${r.id} (score ${r.score.total})`).join('\n') + '\n');
    } finally {
      for (const k of Object.keys(boards)) { try { await boards[k].ctx.close(); } catch (e) { /* gone */ } }
      await browser.close().catch(() => {});
      server.close();
    }
    console.log(`${n} shots taken.`);
    process.argv.push('--from-metrics');
    return fromMetrics();
  }
  fs.writeFileSync(metricsFile, '');
  const rows = [];
  let failed = 0;
  try {
    // In an order that changes the least between cases (runOrder), or this part's run of it.
    const order = ORDER;
    let n = 0, last = Date.now();
    for (const c of order) {
      n++;
      let r;
      try { r = await runCase(c, SHOTS === 'all' ? path.join(shotDir, shotName(c.id)) : null); }
      catch (err) {
        failed++;
        console.error(`  ${c.id}: ${(err && err.message || err).toString().split('\n')[0]}`);
        r = { m: { none: true, text: 'the case failed: ' + (err && err.message || err).toString().split('\n')[0] }, pr: null, parts: null, zoom: 1, marks: 0, errors: [], ms: 0 };
        // (A board in a state the next case can't trust is made again.)
        for (const k of Object.keys(boards)) { try { await boards[k].ctx.close(); } catch (e) { /* gone */ } delete boards[k]; }
      }
      const row = record(c, r);
      rows.push(row);
      fs.appendFileSync(metricsFile, JSON.stringify(row) + '\n');
      if (Date.now() - last > 15000 || n === order.length) {
        last = Date.now();
        const s = (Date.now() - t0) / 1000;
        console.log(`  ${n}/${order.length} cases, ${Math.round(s)} s, about ${Math.round(s / n * (order.length - n))} s to go`);
      }
    }
    // The worst cases, shot again.
    let shot = 0;
    if (SHOTS === 'worst') {
      const worst = distinctWorst(rows, WORST_N).map(x => x.r);
      for (const row of worst) {
        const c = CASES.find(x => x.id === row.id);
        try { await runCase(c, path.join(shotDir, shotName(c.id))); shot++; } catch (err) { console.error(`  shot ${c.id}: ${err.message}`); }
      }
      fs.writeFileSync(path.join(OUTDIR, 'worst.txt'), worst.map((r, i) => `${i + 1}. ${r.id} (score ${r.score.total})`).join('\n') + '\n');
    }
    const secs = (Date.now() - t0) / 1000;
    // (Rows in the matrix's own order.)
    const byId = new Map(rows.map(r => [r.id, r]));
    const ordered = CASES.map(c => byId.get(c.id)).filter(Boolean);
    fs.writeFileSync(path.join(OUTDIR, 'summary.md'), summary(ordered, { matrix: MATRIX, commit, secs, shot }));
    if (SHOTS !== 'none') fs.writeFileSync(path.join(OUTDIR, 'gallery.html'), gallery(ordered, { matrix: MATRIX, commit }));
    console.log(`${rows.length} cases in ${Math.round(secs)} s${failed ? `, ${failed} failed` : ''}. ${path.join(OUTDIR, 'summary.md')}`);
  } finally {
    for (const k of Object.keys(boards)) { try { await boards[k].ctx.close(); } catch (e) { /* gone */ } }
    await browser.close().catch(() => {});
    server.close();
  }
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err && err.stack || err); if (browser) browser.close().catch(() => {}); process.exit(2); });
