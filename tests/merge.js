/*
 * 21Board — Node test of Board Sync's merge (board.js section 13d), no browser:  node tests/merge.js
 *
 * Loads the "// #region Board Sync merge" region of board.js (and hash53, clone and sameJSON, by name) into a vm,
 * then checks:
 *   - the rules table (spec §4.1), case by case, with two or three simulated devices;
 *   - reading a device file: cut, mixed and edited files are refused, a whole one is read, a bad unit is skipped;
 *   - a randomized run: devices editing pages and windows, Google Drive delivering files late, out of order, twice,
 *     as conflict copies or not at all, devices unlinked, linked again, switched to another folder and back, away
 *     for months, busy windows, stale tabs writing over a merge, lost files and ledgers. After a final full
 *     exchange, an oracle checks that every device shows the same board, that nothing anyone typed is lost unless
 *     a device that showed it changed or deleted it, that no clash is left, that no version is copied twice, that
 *     nobody writes again, and that nothing deleted comes back unless someone edited it without having seen the
 *     deletion;
 *   - that the oracle bites: the same run with plain "later wins" content, and with the first draft's rules for
 *     removing old device files and tombstones, must fail.
 * Options: node tests/merge.js [runs-scale] (0.1 for a quick look; default 1).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'board.js'), 'utf8');
const start = SRC.indexOf('// #region Board Sync merge'), end = SRC.indexOf('// #endregion', start);
if (start < 0 || end < 0) throw new Error('board.js: the "Board Sync merge" region is missing');
const named = (re, what) => { const m = re.exec(SRC); if (!m) throw new Error(`board.js: ${what} not found`); return m[0]; };
const fnText = name => {   // a function declaration, up to its closing brace at the same indent
  const i = SRC.indexOf(`function ${name}(`), indent = SRC.slice(SRC.lastIndexOf('\n', i) + 1, i);
  const j = SRC.indexOf(`\n${indent}}`, i);
  if (i < 0 || j < 0) throw new Error(`board.js: function ${name} not found`);
  return SRC.slice(i, j + indent.length + 2);
};
// (vm.compileFunction, in this context: code run in a context of its own reaches Math, JSON... through the
// context's interceptors, many times slower)
const Merge = vm.compileFunction([named(/const clone = .*;/, 'clone'), named(/const sameJSON = .*;/, 'sameJSON'), fnText('hash53'), SRC.slice(start, end), 'return Merge;'].join('\n'), [], { filename: 'board.js#merge' })();
// The helpers the board passes in, taken from board.js as they are.
const H = vm.compileFunction([named(/const TITLE_H = \d+;/, 'TITLE_H'), named(/const r2 = .*;/, 'r2'), named(/const scaleRect = .*;/, 'scaleRect'),
  named(/const BG_RENAMED = .*;/, 'BG_RENAMED'), named(/const bgColor = .*;/, 'bgColor'), fnText('normalizePhotoSettings'),
  named(/const BASE_W = .*;/, 'BASE_W'), named(/const canvasFor = .*;/, 'canvasFor'), named(/const UID_RE = .*;/, 'UID_RE'), named(/const PHOTO_FILE_RE = .*;/, 'PHOTO_FILE_RE'),
  'return { scaleRect, bgColor, normalizePhotoSettings, canvasFor, UID_RE, PHOTO_FILE_RE, defaultScale: 0.8 };'].join('\n'), [])();
const clone = v => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else fails++; if (!cond || process.env.VERBOSE) console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + msg); };

// ---------------------------------------------------------------------
// A simulated device: its records (as IndexedDB holds them), its view of the folder, and Link's round (B's code, in
// short), all with fake time.
// ---------------------------------------------------------------------
const DAY = 864e5, MIN = 60e3, IDLE = 2 * MIN, UNDO = 20000, KEEP = 60 * DAY;
const W = { NOTES: 'notes', TIMER: 'timer', TASK: 'task-timer', SKETCH: '21sketch' };
const isLater = w => w === 'timer' || w === 'dice' || w === 'traffic-light';
const isSingle = w => w === '21sketch';
let NOW = Date.UTC(2026, 10, 2, 13);
let rnd = () => Math.random();
const pick = a => a[Math.floor(rnd() * a.length)];
const token = v => (v && typeof v === 'object' ? (typeof v.text === 'string' ? v.text : Array.isArray(v.tasks) ? v.tasks[0] : null) : null);
let LOG;
const newLog = () => ({ typed: new Set(), gone: new Set(), dels: [], edits: [], sig: new Map(), writes: 0, fileKnow: new Map() });
// Every edit leaves a mark in its value (a unique text, theme, place, name or color), so the oracle can tell which
// edits a device has had on screen: its own, and those a merge wrote here.
const sigsOf = (key, v) => {
  if (!v || typeof v !== 'object') return [];
  const k = key.split(':')[0];
  if (k === 'data') return [token(v) || (typeof v.duration === 'number' ? `dur:${v.duration}` : null)].filter(Boolean);
  if (k === 'conf') return [`c:${v.theme}`];
  if (k === 'inst' && v.rect) return [`r:${v.rect.x},${v.rect.y},${v.rect.w},${v.rect.h}`];
  if (k === 'board') return [`n:${v.name}`, `l:${v.background && v.background.color}`];
  if (k === 'media' && v.addedAt) return [`p:${v.addedAt}`];
  return [];
};

class Folder {   // the folder in Google Drive: the latest of each file, and every revision written (for late deliveries)
  constructor(name) { this.name = name; this.files = new Map(); this.revs = new Map(); }
  write(name, text) { this.files.set(name, text); if (!this.revs.has(name)) this.revs.set(name, []); this.revs.get(name).push(text); }
  remove(name) { this.files.delete(name); }
}

let uidN = 0;
class Device {
  constructor(name, opts = {}) {
    this.label = name; this.name = 'the ' + name;
    this.dev = (name + 'xxxxxxxxxxxx').replace(/[^0-9a-z]/g, 'x').slice(0, 12);
    this.recs = new Map(); this.skew = opts.skew || 0;
    this.link = null;            // link:sync and link:mine-*: { sync, mines: Map }
    this.folder = null; this.view = new Map();   // the folder as Drive has brought it here: name -> text
    this.linked = false; this.first = false; this.mode = null;
    this.peers = new Map();      // dev -> decoded peer (the newest good file of each)
    this.decoded = new Map();    // text -> decode result
    this.busy = new Set(); this.stale = new Map(); this.staleBase = new Map(); this.heard = new Set(); this.know = new Set(); this.applied = new Set();
    this.lastWid = 0; this.writes = 0; this.away = false;
    this.put('settings', 'settings', { boards: [], deletedBoards: [], deletedAt: {}, lastBoard: 0, activeBoard: 1 });
    if (opts.pages !== false) this.placeholder();
  }
  now() { return NOW + this.skew; }
  put(key, type, value, opts = {}) {
    const cur = this.recs.get(key);
    const rec = { key, type, rev: Math.max((cur ? cur.rev : 0) + 1, this.now()), updatedAt: this.now(), by: 't', value: clone(value) };
    // (a tab that skipped a merged write keeps its old base for that record until it shows one: see Writer)
    rec.base = opts.base !== undefined ? opts.base : this.staleBase.has(key) ? this.staleBase.get(key) : cur ? cur.rev : 0;
    if (opts.u) rec.u = 1;
    this.recs.set(key, rec);
    if (LOG && !opts.quiet) for (const sg of sigsOf(key, value)) if (!LOG.sig.has(sg)) { const e = { id: LOG.edits.length + 1, units: this.unitsOf(key), by: this.dev, folder: this.folderName }; LOG.edits.push(e); LOG.sig.set(sg, e.id); this.applied.add(e.id); }
    return rec;
  }
  unitsOf(key) {
    const p = key.split(':'), b = +p[1], v = this.boardOf(b), uid = v && v.uid;
    if (p[0] === 'board' || p[0] === 'media') return [uid];
    const r = this.recs.get(`inst:${b}:${p[2]}:${p[3]}`);
    return r ? [`${uid} ${r.value.wid}`, uid] : [uid];
  }
  del(key) { this.recs.delete(key); }
  get settings() { return this.recs.get('settings').value; }
  patch(p) { this.put('settings', 'settings', Merge.patchSettings(this.settings, p)); }
  // ---- the board's own actions (what Pages, openWidget, Notes... do)
  boardOf(b) { const r = this.recs.get(`board:${b}`); return r && r.value; }
  ids() { const st = this.settings, gone = new Set(st.deletedBoards || []); const all = Array.from(this.recs.keys()).filter(k => /^board:/.test(k)).map(k => +k.split(':')[1]).filter(b => !gone.has(b)); return (st.boards || []).filter(b => all.includes(b)).concat(all.filter(b => !(st.boards || []).includes(b)).sort((a, c) => a - c)); }
  nextB() { let m = Math.max(0, +this.settings.lastBoard || 0); for (const k of this.recs.keys()) { const b = +k.split(':')[1]; if (b > m) m = b; } return m + 1; }
  placeholder() { const b = this.nextB(); this.put(`board:${b}`, 'board', { id: b, name: 'My Board', background: { color: null, pattern: 'none' }, layout: null, uid: 'u' + (++uidN).toString(36).padStart(8, '0') }); this.patch({ set: { boards: [b], activeBoard: b, lastBoard: b } }); }
  posOf(b) { return (this.boardOf(b) || {}).pos; }
  addPage(name) {
    const ids = this.ids(), b = this.nextB(), at = Math.floor(rnd() * (ids.length + 1));
    const before = ids[at - 1] !== undefined ? this.posOf(ids[at - 1]) : undefined, after = ids[at] !== undefined ? this.posOf(ids[at]) : undefined;
    const pos = before === undefined && after === undefined ? 1 : before === undefined ? after - 1 : after === undefined ? before + 1 : (before + after) / 2;
    const uid = 'u' + (++uidN).toString(36).padStart(8, '0');
    this.put(`board:${b}`, 'board', { id: b, name: name || `Page ${uid}`, background: { color: null, pattern: 'none' }, scale: 0.8, shape: '16:9', layout: { w: 2400, h: 1350 }, uid, pos });
    const order = ids.slice(); order.splice(at, 0, b);
    this.patch({ set: { boards: order, lastBoard: b } });
    return b;
  }
  page(b) { return this.boardOf(b); }
  insts(b) { return Array.from(this.recs.values()).filter(r => r.key.startsWith(`inst:${b}:`)); }
  // An edit that leaves no mark (emptying a window, opening it): other devices are never sure to have seen it.
  markless(b, ik) { const e = { id: LOG.edits.length + 1, units: this.unitsOf(`inst:${b}:${ik}`), by: this.dev, folder: this.folderName }; LOG.edits.push(e); this.applied.add(e.id); }
  touch(unit) { for (const d of LOG.dels) if (d.unit === unit && d.folder === this.folderName && !this.know.has(d.id)) d.justified = true; }
  pageUnit(b) { return (this.boardOf(b) || {}).uid; }
  addWindow(b, widgetId) {
    const used = new Set(this.insts(b).map(r => r.value.widgetId === widgetId ? r.value.n : 0));
    let n = 1; while (used.has(n)) n++;
    const taken = new Set(this.insts(b).map(r => r.value.wid));
    const createdAt = this.now() + (this.lastWid = (this.lastWid + 1) % 1000) / 1000;
    const wid = Merge.newWid(widgetId, Math.round(createdAt), taken);
    const inst = { widgetId, n, open: true, rect: { x: Math.round(rnd() * 1500), y: Math.round(rnd() * 800), w: 400, h: 300 }, z: 1 + this.insts(b).length, maximized: false, createdAt: Math.round(createdAt), wid };
    this.put(`inst:${b}:${widgetId}:${n}`, 'inst', inst);
    if (widgetId !== W.SKETCH) this.type(b, `${widgetId}:${n}`, true);
    this.touch(this.pageUnit(b));
    return `${widgetId}:${n}`;
  }
  value(widgetId) {
    const t = 't' + (++LOG.n);
    if (widgetId === W.NOTES) { LOG.typed.add(t); return { text: t }; }
    if (widgetId === W.TASK) { LOG.typed.add(t); const run = rnd() < 0.3; return { tasks: [t], running: run, endsAt: run ? this.now() + 5 * MIN : null, secondsLeft: 300, alarm: false }; }
    return { duration: 60 + LOG.n, remaining: 0, endsAt: null };
  }
  shownValue(key) { const r = this.recs.get(key); return r ? token(r.value) : null; }
  type(b, ik, fresh) {
    const key = `data:${b}:${ik}`, old = this.shownValue(key);
    if (old && !fresh) LOG.gone.add(old);   // this device showed it, and replaced it
    this.put(key, 'data', this.value(ik.split(':')[0]));
    const iv = this.winVal(b, ik);   // (a copy whose content is changed is an ordinary window: Win.saveContent)
    if (iv.copyOf) { iv.copyOf = null; this.put(`inst:${b}:${ik}`, 'inst', iv, { quiet: true }); }
    this.touchWin(b, ik);
  }
  touchWin(b, ik) { const r = this.recs.get(`inst:${b}:${ik}`); if (r) { this.touch(`${this.pageUnit(b)} ${r.value.wid}`); this.touch(this.pageUnit(b)); } }
  winVal(b, ik) { return clone(this.recs.get(`inst:${b}:${ik}`).value); }
  moveWin(b, ik) { const v = this.winVal(b, ik); v.rect = { x: Math.round(rnd() * 1500) + (++LOG.n % 1000) / 1000, y: Math.round(rnd() * 800), w: 300 + Math.round(rnd() * 300), h: 200 + Math.round(rnd() * 300) }; v.copyOf = null; this.put(`inst:${b}:${ik}`, 'inst', v); this.touchWin(b, ik); }
  confWin(b, ik) { this.put(`conf:${b}:${ik}`, 'conf', { theme: 'c' + (++LOG.n) }); this.touchWin(b, ik); }
  openWin(b, ik, open) { const v = this.winVal(b, ik); v.open = open; if (open) v.z = 999; this.put(`inst:${b}:${ik}`, 'inst', v, { quiet: true }); if (open) { this.markless(b, ik); this.touchWin(b, ik); } }
  resetWin(b, ik) { const old = this.shownValue(`data:${b}:${ik}`); if (old) LOG.gone.add(old); this.del(`data:${b}:${ik}`); this.del(`conf:${b}:${ik}`); this.markless(b, ik); this.touchWin(b, ik); }
  delWin(b, ik) {
    const iv = this.winVal(b, ik), old = this.shownValue(`data:${b}:${ik}`);
    if (old) LOG.gone.add(old);
    for (const k of ['inst', 'data', 'conf']) this.del(`${k}:${b}:${ik}`);
    if (this.linked) this.deleted(`${this.pageUnit(b)} ${iv.wid}`);
  }
  deleted(unit) {
    // (the edits of it this device never had on screen: any of them may bring it back)
    const unseen = LOG.edits.filter(e => e.units.includes(unit) && e.folder === this.folderName && !this.applied.has(e.id)).length;
    const d = { id: LOG.dels.length + 1, unit, by: this.dev, folder: this.folderName, justified: false, unseen }; LOG.dels.push(d); this.know.add(d.id); return d;
  }
  delPage(b) {
    for (const r of this.insts(b)) { const t = this.shownValue(`data:${b}:${r.value.widgetId}:${r.value.n}`); if (t) LOG.gone.add(t); }
    this.patch({ gone: [['add', b, this.now()]], set: { boards: this.ids().filter(x => x !== b) } });
    if (this.linked) this.deleted(this.pageUnit(b)).page = b;
    if (this.settings.activeBoard === b) this.patch({ set: { activeBoard: this.ids()[0] } });
  }
  undoDel(b) {   // the page's Undo (within its 20 s): as if it had never gone
    const at = (this.settings.deletedAt || {})[b];
    if (!at || this.now() - at > UNDO - 1000) return false;
    this.patch({ gone: [['remove', b]], order: this.orderNow([b]) });
    const d = LOG.dels.find(x => x.page === b && x.by === this.dev && !x.undone); if (d) { d.undone = true; d.justified = true; }
    return true;
  }
  orderNow(extra = []) { const o = {}; for (const b of this.ids().concat(extra)) { const v = this.boardOf(b); if (v) o[b] = [v.pos, v.uid]; } return o; }
  purge() {   // pages whose Undo is over: their records go (Pages.purge)
    const st = this.settings;
    for (const b of st.deletedBoards || []) {
      if (this.now() - (st.deletedAt[b] || 0) < UNDO + 3000) continue;
      for (const k of Array.from(this.recs.keys())) { const p = k.split(':'); if (['board', 'inst', 'data', 'conf', 'media'].includes(p[0]) && +p[1] === b) this.del(k); }
      this.patch({ gone: [['remove', b]] });
    }
  }
  editPage(b, what) {
    const v = clone(this.boardOf(b));
    if (what === 'name') v.name = 'n' + (++LOG.n);
    else if (what === 'look') v.background = { color: '#' + (0x100000 + (++LOG.n)).toString(16).slice(-6), pattern: 'none' };
    else if (what === 'size') {
      const s0 = v.scale || 0.8, s1 = pick([0.6, 0.8, 1, 1.25]);
      if (s1 === s0) return;
      for (const r of this.insts(b)) { const iv = clone(r.value); iv.rect = H.scaleRect(iv.rect, s0 / s1); this.put(r.key, 'inst', iv); }
      v.scale = s1; v.layout = H.canvasFor(s1);
    } else if (what === 'pos') {
      const ids = this.ids().filter(x => x !== b), at = Math.floor(rnd() * (ids.length + 1));
      const before = ids[at - 1] !== undefined ? this.posOf(ids[at - 1]) : undefined, after = ids[at] !== undefined ? this.posOf(ids[at]) : undefined;
      v.pos = before === undefined && after === undefined ? 1 : before === undefined ? after - 1 : after === undefined ? before + 1 : (before + after) / 2;
      this.put(`board:${b}`, 'board', v);
      this.patch({ order: this.orderNow() });
      return;
    }
    this.put(`board:${b}`, 'board', v);
    this.touch(v.uid);
  }
  photo(b, on) {
    if (on) {
      const m = { data: 'data:image/jpeg;base64,AAAA', w: 2000 + Math.floor(rnd() * 500), h: 1200, bytes: 1000 + Math.floor(rnd() * 1e5), name: 'p.jpg', addedAt: this.now() };
      this.put(`media:${b}:background`, 'media', m); this.put(`media:${b}:background-look`, 'media', { on: true, fit: 'fill', focus: { x: 0.5, y: 0.5 }, fade: 0 });
      PHOTOS.set(H.photoKeyOf ? H.photoKeyOf(m) : `${m.addedAt}-${m.bytes}-${m.w}x${m.h}`, m);
    } else { this.del(`media:${b}:background`); this.del(`media:${b}:background-look`); }
    this.touch(this.pageUnit(b));
  }

  // ---- Link (B's code, in short)
  ledger() {
    if (!this.link) return Merge.ledger({ v: 1, dev: this.dev, ctr: 0, maxSeen: 0, peers: {} }, []);
    return Merge.ledger(this.link.sync, Array.from(this.link.mines.values()));
  }
  store(L) {
    const mines = new Map();
    for (const [uid, m] of Object.entries(L.mine)) mines.set(uid, this.link && this.link.mines.get(uid) === m ? m : clone(m));
    this.link = { sync: clone(L.sync), mines };
  }
  readLocal() {
    const recs = Array.from(this.recs.values());
    return Merge.read(recs, Object.assign({ settings: this.settings, now: this.now(), hcache: this.hcache || (this.hcache = new Map()) }, H));
  }
  fileName() { return `21Board (${this.label}) [${this.dev.slice(0, 4)}].21board`; }
  // A device file in this view → decoded (cached by its text).
  decodeText(text) {   // (decoded once for every device: Merge never changes a peer)
    if (!DECODED.has(text)) {
      let r = null;
      try { r = Merge.decode(JSON.parse(text), H); } catch (e) { r = null; }
      if (DECODED.size > 2000) DECODED.clear();
      DECODED.set(text, r);
    }
    return DECODED.get(text);
  }
  look(L) {
    const peers = [], files = new Set();
    for (const [name, text] of this.view) {
      const r = this.decodeText(text);
      if (!r || !r.peer) continue;
      const p = r.peer;
      if (p.dev === this.dev) { if (this.first) peers.push(p); continue; }
      files.add(p.dev);
      const seen = (L.sync.peers || {})[p.dev], have = this.peers.get(p.dev);
      if (seen && p.seq < seen.seq) continue;   // older than one merged
      if (!have || p.seq >= have.seq) this.peers.set(p.dev, p);
      const k = LOG.fileKnow.get(`${p.dev}:${p.seq}`);
      if (k) for (const d of k) this.heard.add(d);
    }
    for (const [d, p] of this.peers) if (!files.has(d)) this.peers.delete(d);
    return { peers: peers.concat(Array.from(this.peers.values()).filter(p => !peers.includes(p))), files };
  }
  pageShown() { const b = this.settings.activeBoard; const v = this.boardOf(b); return v ? v.uid : null; }
  round(kind = 'full', opts = {}) {
    if (!this.linked || this.away) return;
    // (a stale tab's write lands before the next round: Writer writes at once, rounds wait for quiet)
    const stale = this.stale; this.stale = new Map();
    void stale;
    this.purge();
    const now = this.now();
    let L = this.ledger();
    if (!this.link) {   // the ledger is gone: rebuilt from this device's own file if it is here, and a first round either way
      const own = this.view.get(this.fileName()), r = own && this.decodeText(own);
      if (r && r.peer) L = Merge.rebuild(r.peer, { now });
      this.first = true; this.lostLedger = false;
    }
    if (this.restamp) this.restamped();
    if (this.mode === 'take' && kind === 'full') {   // what this device had in the other folder is kept (Board history, the other folder)
      for (const P of this.readLocal().pages.values()) for (const W2 of P.all) { const t = token(W2.parts.data.val); if (t) LOG.gone.add(t); }
    }
    let local = this.readLocal();
    const st = Merge.stamp(L, local, { dev: this.dev, ctr: L.sync.ctr || 0, maxSeen: L.sync.maxSeen || 0, first: this.first, now, mode: this.mode });
    const apply = (writes, set) => {
      for (const w of writes) {
        if (w.del) { this.del(w.key); continue; }
        const was = this.recs.get(w.key);
        if (was && w.type === 'data') this.stale.set(w.key, clone(was));   // what a stale tab still shows
        this.recs.set(w.key, { key: w.key, type: w.type, rev: w.rev, updatedAt: now, by: 'm', m: 1, value: clone(w.value) });
        this.staleBase.delete(w.key);
        for (const sg of sigsOf(w.key, w.value)) if (LOG.sig.has(sg)) this.applied.add(LOG.sig.get(sg));   // on screen here now
      }
      if (set) this.put('settings', 'settings', set(this.settings), { base: this.recs.get('settings').rev, quiet: true });
    };
    if (kind === 'send') {
      apply(st.fixes, st.settings ? s => Merge.patchSettings(s, st.settings) : null, true);
      this.store(st.ledger); this.first = false;
      this.writeFile(st.ledger);
      return;
    }
    const { peers, files } = this.look(st.ledger);
    const state = Merge.join(st.ledger, peers, { dev: this.dev, now, mode: this.mode, first: this.first, aheadMax: DAY, isLater,
      idle: d => { const p = (st.ledger.sync.peers || {})[d]; return !p || now - (p.changedAt || 0) >= IDLE; },
      left: d => { const p = this.peers.get(d); return !!(p && p.left); } });
    const photos = {};
    for (const w of Merge.photosWanted(state, local)) if (rnd() > (opts.photoMiss || 0) && PHOTOS.has(w.key)) photos[w.uid] = PHOTOS.get(w.key);
    const holds = { wins: Array.from(this.busy) };
    const names = d => { const p = this.peers.get(d); return p ? p.name : d === this.dev ? this.name : 'another device'; };
    const plan = Merge.plan(state, local, st.ledger, { dev: this.dev, now, mode: this.mode, holds, isLater, isSingle, names, pageShown: this.pageShown(), photos, freeIds: this.nextB(),
      zTop: () => 500, place: (uid, r) => ({ x: r.x + 32, y: r.y + 32, w: r.w, h: r.h }) });
    // (the transaction)
    apply(plan.writes, plan.settings);
    if (plan.summary.leave) this.leave(plan.summary.leave);
    const L2 = Merge.ledger(plan.sync, []);
    L2.mine = Object.assign({}, plan.next.mine);
    let L3 = L2;
    if (opts.gc !== false) L3 = (opts.gcFn || Merge.gc)(L2, Array.from(this.peers.values()), files, { now, dev: this.dev });
    this.store(L3);
    this.first = false; this.mode = null;
    // (step 11 and §3.5's old files)
    for (const [d, p] of this.peers) if (p.left && now - p.left.at >= KEEP && Merge.includes(L3, p)) this.removeFile(d);
    // knowledge of deletions: applied ones only
    for (const id of this.heard) if (!this.know.has(id)) { const d = LOG.dels[id - 1]; if (!this.shows(d.unit)) this.know.add(id); }
    this.writeFile(L3);
    this.lastSum = plan.summary;
    return plan;
  }
  leave(uid) {
    const ids = this.ids(), b = ids.find(x => (this.boardOf(x) || {}).uid !== uid);
    if (b) this.patch({ set: { activeBoard: b } });
    else { const nb = this.addPage('Page'); this.patch({ set: { activeBoard: nb } }); }
  }
  shows(unit) {
    const [uid, wid] = unit.split(' ');
    const gone = new Set(this.settings.deletedBoards || []);
    for (const [k, r] of this.recs) {
      if (!k.startsWith('board:') || r.value.uid !== uid || gone.has(+k.split(':')[1])) continue;
      if (!wid) return true;
      return this.insts(+k.split(':')[1]).some(i => i.value.wid === wid);
    }
    return false;
  }
  // The ledger is lost: deletions made here that no round has stamped yet are undone by the first round that follows.
  loseLedger() {
    LOG.lostLedger = true;
    for (const d of LOG.dels) {
      if (d.by !== this.dev || d.folder !== this.folderName || d.undone) continue;
      const [uid, wid] = d.unit.split(' '), M = this.link.mines.get(uid);
      if (M && !M.gone && (!wid || M.w[wid])) d.undone = true;
    }
    this.link = null; this.lostLedger = true; this.restamp = true; this.lostAt = LOG.dels.length;
  }
  // A lost ledger's first round stamps everything shown here again: for the oracle, an edit of each of them.
  restamped() {
    this.restamp = false;
    for (const d of LOG.dels.slice(this.lostAt || 0)) if (d.by === this.dev) d.undone = true;   // (deleted since: not stamped either)
    for (const b of this.ids()) {
      const uid = this.pageUnit(b);
      const units = [uid].concat(this.insts(b).map(r => `${uid} ${r.value.wid}`));
      for (const u of units) { const e = { id: LOG.edits.length + 1, units: [u], by: this.dev, folder: this.folderName }; LOG.edits.push(e); this.applied.add(e.id); this.touch(u); }
    }
  }
  removeFile(d) {
    for (const [name, text] of Array.from(this.view)) { const r = this.decodeText(text); if (r && r.peer && r.peer.dev === d) { this.view.delete(name); if (this.folder) this.folder.remove(name); } }
    this.peers.delete(d);
  }
  writeFile(L, left) {
    if (!this.folder) return;
    const local = this.readLocal(), at = this.now();
    const merged = {};
    for (const [d, p] of Object.entries(L.sync.peers || {})) merged[d] = p.seq;
    const meta = { dev: this.dev, folder: 'f', name: this.name, at, merged, left: left || null, refs: {} };
    for (const P of local.pages.values()) if (P.parts.photo.val) meta.refs[P.parts.photo.val] = { file: crypto.createHash('sha256').update(P.parts.photo.val).digest('hex').slice(0, 32) + '.jpg', w: P.parts.photo.media.w, h: P.parts.photo.media.h, bytes: P.parts.photo.media.bytes, name: 'p.jpg', addedAt: P.parts.photo.media.addedAt };
    const { obj, partsH } = Merge.encode(L, local, meta);
    const name = this.fileName();
    if (partsH === this.link.sync.partsH && this.view.has(name) && !left) return false;
    this.link.sync.seq = Math.max((this.link.sync.seq || 0) + 1, at);
    obj.sync.seq = this.link.sync.seq;
    obj.sync.write = 'w' + this.link.sync.seq.toString(36);
    obj.sync.sum = crypto.createHash('sha256').update(Merge.sumText(obj)).digest('hex').slice(0, 32);
    const text = JSON.stringify(obj);
    this.view.set(name, text);
    this.folder.write(name, text);
    this.link.sync.partsH = partsH;
    for (const M of this.link.mines.values()) {   // a tombstone's seq: the first write that carried it
      if (M.gone && M.gone.seq == null) M.gone.seq = this.link.sync.seq;
      for (const T of Object.values(M.wgone || {})) if (T.seq == null) T.seq = this.link.sync.seq;
    }
    LOG.fileKnow.set(`${this.dev}:${this.link.sync.seq}`, Array.from(this.know));
    this.writes++; LOG.writes++;
    return true;
  }
  // set-up, as Link decides the mode (§3.5)
  linkTo(folder) {
    // (which folder this device was linked to is kept apart from the ledger, as link:folder is)
    if (!this.link && this.lostLedger && folder.files.has(this.fileName())) {
      const r = this.decodeText(folder.files.get(this.fileName()));
      if (r && r.peer) this.store(Merge.rebuild(r.peer, { now: this.now() }));
    }
    this.lostLedger = false;
    const had = this.folderName;
    const others = Array.from(folder.files.keys()).filter(n => n !== this.fileName());
    this.folder = folder; this.view = new Map(folder.files);
    if (had === folder.name) this.mode = 'carry';
    else if (!others.length) this.mode = 'seed';
    else {
      const local = this.readLocal();
      const placeholderOnly = Array.from(local.pages.values()).every(P => P.placeholder || P.gone);
      this.mode = placeholderOnly || had ? 'take' : 'join';
    }
    if (this.mode !== 'carry') {   // a new ledger (ctr, seq and the device id are never reset)
      const keep = this.link ? { ctr: this.link.sync.ctr, seq: this.link.sync.seq, maxSeen: this.link.sync.maxSeen } : {};
      this.link = { sync: Object.assign({ v: 1, dev: this.dev, peers: {} }, keep), mines: new Map() };
      this.peers.clear();
    }
    this.folderName = folder.name;
    this.linked = true; this.first = true; this.busy.clear();
    this.round('full');
  }
  unlink() { if (this.away || !this.link) return; this.round('send'); if (this.folder) { const L = this.ledger(); this.writeFile(L, { at: this.now() }); } this.linked = false; }
  // Drive brings a file of the folder here: the latest (or an older revision, or under a conflict copy's name).
  deliver(from, how = 'latest') {
    const folder = this.folder; if (!folder) return;
    const name = from.fileName(), revs = folder.revs.get(name);
    if (!folder.files.has(name)) { if (this.view.has(name)) this.view.delete(name); return; }
    if (!revs || !revs.length) return;
    const text = how === 'old' ? pick(revs) : folder.files.get(name);
    this.view.set(how === 'copy' ? name.replace('.21board', ' (1).21board') : name, text);
  }
  canon() {
    const local = this.readLocal(), L = this.ledger(), out = [];
    for (const P of local.pages.values()) {
      if (P.gone || P.held || !L.mine[P.uid] || L.mine[P.uid].gone) continue;
      const wins = [];
      for (const W2 of Array.from(P.wins.values()).sort((a, c) => (a.wid < c.wid ? -1 : 1))) wins.push([W2.wid, W2.widgetId, W2.parts.open.val, W2.parts.rect.h, W2.parts.data.val, W2.parts.conf.val, W2.parts.label.val]);
      out.push([P.uid, P.parts.name.val, P.parts.look.val, P.parts.size.val, P.parts.pos.val, P.parts.photo.val, P.parts.photoLook.val, wins]);
    }
    return JSON.stringify(out.sort((a, c) => (a[0] < c[0] ? -1 : 1)));
  }
  pending() {
    for (const M of this.link.mines.values()) for (const mw of Object.values(M.w || {})) if (mw.p.data && mw.p.data.pending && mw.p.data.pending.length) return true;
    return false;
  }
  liveWins() { const out = []; for (const b of this.ids()) for (const r of this.insts(b)) out.push([b, `${r.value.widgetId}:${r.value.n}`, r.value]); return out; }
}
const PHOTOS = new Map(), DECODED = new Map();

// ---------------------------------------------------------------------
// The randomized run
// ---------------------------------------------------------------------
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 1) / 0x80000000; }; }
function run(seed, nDev, steps, variant = {}) {
  rnd = seeded(seed * 7919 + 17); NOW = Date.UTC(2026, 10, 2, 13); uidN = 0; LOG = newLog(); LOG.n = 0; PHOTOS.clear();
  const folder = new Folder('Room 12'), other = new Folder('Room 14');
  const devs = global.__devs = Array.from({ length: nDev }, (_, i) => new Device(['laptop', 'board', 'home', 'cart', 'panel'][i], { skew: variant.skew && i === 1 ? variant.skew : 0, pages: true }));
  const gcOpts = variant.gc ? { gcFn: variant.gc } : {};
  devs[0].addPage('Math'); devs[0].addWindow(devs[0].ids()[1], W.NOTES);
  devs[0].linkTo(folder);
  for (const d of devs.slice(1)) { if (rnd() < 0.3) { const b = d.addPage(); d.addWindow(b, W.NOTES); } for (const o of devs) if (o !== d) d.deliver(o); d.linkTo(folder); }
  for (const d of devs) for (const o of devs) if (o !== d) d.deliver(o);
  const roundOf = d => d.round('full', gcOpts);
  for (let s = 0; s < steps; s++) {
    NOW += rnd() < (variant.jumps || 0.03) ? Math.floor(rnd() * 40) * DAY : Math.floor(rnd() * 30000);
    const d = pick(devs), r = rnd();
    if (d.away && rnd() < (variant.back || 0.15)) d.away = false;
    if (variant.awayMore && !d.away && rnd() < variant.awayMore) { d.away = true; NOW += 90 * DAY; continue; }
    if (r < 0.40) edit(d);
    else if (r < 0.62) roundOf(d);
    else if (r < 0.85) { const o = pick(devs.filter(x => x !== d)); d.deliver(o, rnd() < 0.15 ? 'old' : rnd() < 0.05 ? 'copy' : 'latest'); }
    else if (r < 0.88) { if (d.linked) d.round('send'); }
    else if (r < 0.90) { const w = pick(d.liveWins()); if (w && d.linked) { d.busy.clear(); d.busy.add(`${w[0]}:${w[1]}`); } }
    else if (r < 0.91) d.busy.clear();
    else if (r < 0.925) blind(d);
    else if (r < 0.93) { if (d.folder) { d.view.delete(d.fileName()); d.folder.remove(d.fileName()); } }   // its own file lost
    else if (r < 0.935) { if (d.link && d.linked) { d.loseLedger(); } }   // its ledger lost
    else if (r < 0.945) { if (d.linked && d.folder === folder && !variant.noUnlink) d.unlink(); else if (!d.linked) { d.view = new Map(folder.files); d.linkTo(folder); } }
    else if (r < 0.95) { if (d.linked && d.folder === folder && !variant.noChange) { d.round('send'); d.linkTo(other); } else if (d.linked && d.folder === other) { d.round('send'); d.view = new Map(folder.files); d.linkTo(folder); } }
    else if (r < 0.955) { if (variant.away !== false) { d.away = true; NOW += 90 * DAY; } }
    else roundOf(d);
  }
  // Drive catches up: everything is delivered, every device is back in the folder and running, until nothing changes.
  NOW += UNDO + 5000;
  for (const d of devs) { d.away = false; d.busy.clear(); if (d.folder !== folder || !d.linked) { if (d.linked) d.round('send'); d.view = new Map(folder.files); d.linkTo(folder); } }
  const exchange = () => { const w = LOG.writes; for (const d of devs) { for (const o of devs) if (o !== d) d.deliver(o); for (const n of Array.from(d.view.keys())) if (!folder.files.has(n)) d.view.delete(n); roundOf(d); } NOW += 3 * MIN; return LOG.writes - w; };
  for (let k = 0; k < 12 && (exchange() > 0 || k < 1); k++);
  const w0 = LOG.writes;
  for (let k = 0; k < 2; k++) exchange();
  const quiet = LOG.writes === w0;
  // the oracle
  const canons = devs.map(d => d.canon()), converged = canons.every(c => c === canons[0]);
  const shownTokens = new Map();
  for (const P of devs[0].readLocal().pages.values()) {
    if (P.gone || P.held) continue;
    for (const W2 of P.wins.values()) { const t = token(W2.parts.data.val); if (t) shownTokens.set(t, (shownTokens.get(t) || 0) + 1); }
  }
  const lost = Array.from(LOG.typed).filter(t => !shownTokens.has(t) && !LOG.gone.has(t));
  // (oracle 4: at most one copy per losing version, a version being its window, author and edit time)
  const copiesOf = new Map();
  for (const P of devs[0].readLocal().pages.values()) {
    if (P.gone || P.held) continue;
    for (const W2 of P.wins.values()) { const c = W2.parts.label.val; if (c) { const k = `${P.uid} ${c.wid} ${c.from} ${c.at}`; copiesOf.set(k, (copiesOf.get(k) || 0) + 1); } }
  }
  const twice = Array.from(copiesOf).filter(([, c]) => c > 1).map(([k]) => k);
  const pending = devs.some(d => d.pending());
  const back = LOG.dels.filter(d => d.folder === folder.name && !d.undone && !d.justified && !d.unseen && devs[0].shows(d.unit)).map(d => d.unit);
  const wins = devs[0].liveWins().length;
  const copies = devs[0].liveWins().filter(w => w[2].copyOf).length;
  // (a device that lost its ledger and its file stamps its edits again under new counters: §3.4 accepts that this may
  // copy one of them twice, so oracle 4 holds only in runs where no ledger was lost)
  return { converged, quiet, lost, twice: LOG.lostLedger ? [] : twice, twiceLost: LOG.lostLedger ? twice : [], pending, back, wins, copies, writes: LOG.writes, lostLedger: !!LOG.lostLedger };
}
function edit(d) {
  if (d.away) return;
  const ids = d.ids(), b = pick(ids), r = rnd();
  if (!ids.length) return;
  const wins = d.insts(b).map(x => `${x.value.widgetId}:${x.value.n}`);
  if (r < 0.06 || !wins.length) { if (r < 0.03 && ids.length < 6) d.addPage(); else if (wins.length < 8) d.addWindow(b, pick([W.NOTES, W.NOTES, W.NOTES, W.TASK, W.TIMER, W.SKETCH])); return; }
  if (r < 0.08 && ids.length > 2) { d.delPage(b); return; }
  if (r < 0.085) { const gone = d.settings.deletedBoards || []; if (gone.length) d.undoDel(pick(gone)); return; }
  if (r < 0.11) { d.editPage(b, pick(['name', 'look', 'size', 'pos', 'name'])); return; }
  if (r < 0.12) { d.photo(b, rnd() < 0.7); return; }
  const ik = pick(wins), iv = d.winVal(b, ik);
  if (r < 0.17) d.delWin(b, ik);
  else if (r < 0.30) d.moveWin(b, ik);
  else if (r < 0.34) d.confWin(b, ik);
  else if (r < 0.39) d.openWin(b, ik, !iv.open);
  else if (r < 0.42) d.resetWin(b, ik);
  else if (iv.widgetId !== W.SKETCH) d.type(b, ik);
}
// A stale tab: a widget there saves what it showed before the merge (its old content), or a change made on top of it.
function blind(d) {
  if (!d.linked) return;
  const keys = Array.from(d.stale.keys()).filter(k => d.recs.has(k) && d.recs.get(k).m);
  if (!keys.length) return;
  const key = pick(keys), old = d.stale.get(key);
  d.stale.delete(key);
  const [, b, wg, n] = key.split(':');
  d.staleBase.set(key, old.rev);
  if (rnd() < 0.5) d.put(key, 'data', old.value, { base: old.rev });
  else { const shown = token(old.value); if (shown) LOG.gone.add(shown); d.put(key, 'data', d.value(wg), { base: old.rev }); d.touchWin(+b, `${wg}:${n}`); }
}

// ---------------------------------------------------------------------
// 1. The rules table, case by case
// ---------------------------------------------------------------------
function pair(n = 2) {
  rnd = seeded(42); NOW = Date.UTC(2026, 10, 2, 13); uidN = 0; LOG = newLog(); LOG.n = 0; PHOTOS.clear();
  const folder = new Folder('Room 12');
  const devs = ['laptop', 'board', 'home'].slice(0, n).map(x => new Device(x));
  const A = devs[0];
  const b = A.addPage('Math');
  const ik = A.addWindow(b, W.NOTES);
  A.linkTo(folder);
  for (const d of devs.slice(1)) { d.deliver(A); d.linkTo(folder); }
  const sync = (k = 3) => { for (let i = 0; i < k; i++) { for (const d of devs) { for (const o of devs) if (o !== d) d.deliver(o); d.round(); } NOW += 3 * MIN; } };
  sync();
  return { A, B: devs[1], C: devs[2], devs, folder, b, ik, sync };
}
const bOf = (d, uid) => { for (const b of d.ids()) if (d.boardOf(b).uid === uid) return b; return 0; };
const winsOf = (d, uid) => d.insts(bOf(d, uid)).map(r => r.value);
const dataOf = (d, uid, wid) => { const b = bOf(d, uid), i = d.insts(b).find(r => r.value.wid === wid); return i ? (d.recs.get(`data:${b}:${i.value.widgetId}:${i.value.n}`) || {}).value : undefined; };
const ikOf = (d, uid, wid) => { const i = winsOf(d, uid).find(v => v.wid === wid); return i ? `${i.widgetId}:${i.n}` : null; };

function rules() {
  console.log('The rules table (§4.1)');
  {
    const { A, B, b, ik, sync } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    ok(B.canon() === A.canon() && dataOf(B, uid, wid).text === dataOf(A, uid, wid).text, 'a board set up on one device arrives whole on the other (take: the placeholder goes)');
    ok(!B.ids().some(x => B.boardOf(x).name === 'My Board'), 'the placeholder isn’t on the board that joined, and no file names it');
    // content changed on one side only
    A.type(b, ik); NOW += 5000; sync();
    ok(same(dataOf(B, uid, wid), dataOf(A, uid, wid)), 'window content changed on one side only: taken');
    // equal values never clash
    const v = { text: 'same' };
    A.put(`data:${b}:${ik}`, 'data', v); B.put(`data:${bOf(B, uid)}:${ikOf(B, uid, wid)}`, 'data', v); sync();
    ok(winsOf(A, uid).length === 1 && winsOf(B, uid).length === 1 && !A.pending() && !B.pending(), 'both changed to equal values: one version, no copy');
    // content changed on both: both kept, the later in the window, the other as a labelled copy (one, on both)
    A.type(b, ik); const ta = token(dataOf(A, uid, wid)); NOW += 2000;
    const bb = bOf(B, uid); B.type(bb, ikOf(B, uid, wid)); const tb = token(dataOf(B, uid, wid)); NOW += 2000;
    sync(4);
    const wa = winsOf(A, uid), wb = winsOf(B, uid);
    const copy = wa.find(x => x.copyOf);
    ok(wa.length === 2 && wb.length === 2 && A.canon() === B.canon(), 'content changed on both: two windows on both, the same');
    ok(token(dataOf(A, uid, wid)) === tb && copy && token(dataOf(A, uid, copy.wid)) === ta, 'the later change stays in the window, the other is the copy');
    ok(copy && copy.copyOf.wid === wid && copy.copyOf.from === A.dev && copy.copyOf.name === 'the laptop', 'the copy is labelled with the original window and the device whose version it is');
    ok(copy && copy.wid.startsWith(wid.split('~')[0] + '~') && copy.wid.length <= wid.length + 7, 'the copy’s wid is <root>~<6 characters>');
    sync(2);
    ok(winsOf(A, uid).length === 2 && !A.pending() && !B.pending(), 'a second round makes no more copies, and no clash is left');
    // a copy of a copy stays short
    const cik = ikOf(A, uid, copy.wid);
    A.type(b, cik); NOW += 2000; B.type(bOf(B, uid), ikOf(B, uid, copy.wid)); sync(4);
    const cc = winsOf(A, uid).find(x => x.copyOf && x.copyOf.wid === copy.wid);
    ok(cc && cc.wid.length === copy.wid.length, `a copy of a copy is no longer than the first copy (${cc && cc.wid})`);
  }
  {
    // the null rule: one side emptied, the other typed: the content wins
    const { A, B, b, ik, sync } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    A.resetWin(b, ik); NOW += 2000; B.type(bOf(B, uid), ikOf(B, uid, wid)); const t = token(dataOf(B, uid, wid)); sync(4);
    ok(token(dataOf(A, uid, wid)) === t && winsOf(A, uid).length === 1, 'emptied on one side, changed on the other: the content wins, no copy');
    // later wins for settings, rect, open, label; a rect from another scale is converted
    A.confWin(b, ik); NOW += 2000; B.confWin(bOf(B, uid), ikOf(B, uid, wid)); const cb = clone(B.recs.get(`conf:${bOf(B, uid)}:${ikOf(B, uid, wid)}`).value); sync(4);
    ok(same(A.recs.get(`conf:${b}:${ik}`).value, cb) && winsOf(A, uid).length === 1, 'settings changed on both: the later wins, no copy');
    A.moveWin(b, ik); NOW += 2000; B.moveWin(bOf(B, uid), ikOf(B, uid, wid)); sync(4);
    ok(same(A.winVal(b, ik).rect, B.winVal(bOf(B, uid), ikOf(B, uid, wid)).rect), 'a window moved on both: the later place on both');
    // a move on one and typing on the other: both apply
    A.moveWin(b, ik); const r = A.winVal(b, ik).rect; NOW += 2000; B.type(bOf(B, uid), ikOf(B, uid, wid)); const t2 = token(dataOf(B, uid, wid)); sync(4);
    ok(same(B.winVal(bOf(B, uid), ikOf(B, uid, wid)).rect, r) && token(dataOf(A, uid, wid)) === t2 && winsOf(A, uid).length === 1, 'moved on one, typed in on the other: both apply, no copy');
    // a scale change on one and a move on the other
    A.editPage(b, 'size'); const s = A.boardOf(b).scale; NOW += 2000; B.moveWin(bOf(B, uid), ikOf(B, uid, wid)); const rb = B.winVal(bOf(B, uid), ikOf(B, uid, wid)).rect, sb = B.boardOf(bOf(B, uid)).scale; sync(4);
    const ra = A.winVal(b, ik).rect, want = H.scaleRect(rb, sb / s);
    ok(A.boardOf(b).scale === s && B.boardOf(bOf(B, uid)).scale === s && Math.abs(ra.x - want.x) < 0.02 && Math.abs(ra.w - want.w) < 0.02, 'a scale change on one and a move on the other: the move lands right at the new scale');
    // rescale and z only aren't changes
    const w0 = A.writes + B.writes;
    const iv = A.winVal(b, ik); iv.z = 55; A.put(`inst:${b}:${ik}`, 'inst', iv); sync(3);
    ok(A.writes + B.writes === w0 && B.winVal(bOf(B, uid), ikOf(B, uid, wid)).z !== 55, 'z alone isn’t a change: no write, and another device’s z is never taken');
  }
  {
    // timer: later wins (no copy), Board history summary says risky
    const { A, B, b, sync } = pair();
    const uid = A.boardOf(b).uid;
    const ik = A.addWindow(b, W.TIMER); sync();
    const wid = A.winVal(b, ik).wid;
    A.type(b, ik); NOW += 2000; B.type(bOf(B, uid), ikOf(B, uid, wid)); const tb = clone(dataOf(B, uid, wid)); sync(4);
    ok(winsOf(A, uid).filter(x => x.widgetId === W.TIMER).length === 1 && same(dataOf(A, uid, wid), tb), 'a Timer changed on both: the later state on both, no copy (clash: later)');
    // task timer: copy, paused
    const tk = A.addWindow(b, W.TASK); sync();
    const twid = A.winVal(b, tk).wid;
    A.put(`data:${b}:${tk}`, 'data', { tasks: ['ta1'], running: true, endsAt: A.now() + 5 * MIN, secondsLeft: 300, alarm: false }); LOG.typed.add('ta1'); NOW += 2000;
    B.put(`data:${bOf(B, uid)}:${ikOf(B, uid, twid)}`, 'data', { tasks: ['tb1'], running: false, endsAt: null, secondsLeft: 300, alarm: false }); LOG.typed.add('tb1'); sync(4);
    const copy = winsOf(A, uid).find(x => x.copyOf && x.copyOf.wid === twid);
    const cd = copy && dataOf(A, uid, copy.wid);
    ok(copy && cd && cd.running === false && cd.endsAt === null && cd.secondsLeft > 0 && cd.alarm === false, 'a Task Timer changed on both makes one copy, paused (no second alarm)');
    // single widgets: two 21Sketch windows open → the earliest stays open
    const s1 = A.addWindow(b, W.SKETCH); NOW += 1000; B.addWindow(bOf(B, uid), W.SKETCH); sync(4);
    const open = winsOf(A, uid).filter(x => x.widgetId === W.SKETCH && x.open);
    ok(open.length === 1 && open[0].wid === A.winVal(b, s1).wid && same(winsOf(B, uid).filter(x => x.widgetId === W.SKETCH && x.open).map(x => x.wid), open.map(x => x.wid)), '21Sketch opened on both: one window open after the merge, the earliest');
  }
  {
    // edits beat deletions
    const { A, B, b, ik, sync } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    A.delWin(b, ik); NOW += 2000; B.type(bOf(B, uid), ikOf(B, uid, wid)); const t = token(dataOf(B, uid, wid)); sync(4);
    ok(token(dataOf(A, uid, wid)) === t && token(dataOf(B, uid, wid)) === t, 'a window deleted on one and edited on the other: it stays, with the edit');
    // closing or z doesn't bring it back
    const ik2 = ikOf(A, uid, wid);
    A.delWin(b, ik2); NOW += 2000; B.openWin(bOf(B, uid), ikOf(B, uid, wid), false); sync(4);
    ok(!winsOf(A, uid).some(x => x.wid === wid) && !winsOf(B, uid).some(x => x.wid === wid), 'deleted on one, closed on the other: deleted');
    // a page deleted on A, a window on it edited on B: the whole page comes back
    const ik3 = A.addWindow(b, W.NOTES), w3 = A.winVal(b, ik3).wid; A.addPage('Other'); sync();
    A.delPage(b); NOW += UNDO + 5000; A.round(); B.type(bOf(B, uid), ikOf(B, uid, w3)); sync(4);
    ok(bOf(A, uid) && bOf(B, uid) && token(dataOf(A, uid, w3)) === token(dataOf(B, uid, w3)), 'a page deleted on one, a window on it edited on the other: the whole page comes back on both');
    const sumBack = A.lastSum && Object.values(A.lastSum.pages).some(x => x.back);
    ok(true, `(the page deleted here came back: ${sumBack ? 'said' : 'a later round said'})`);
    // page deleted, the other only taps (z) or moves the page: stays deleted
    A.delPage(bOf(A, uid)); NOW += UNDO + 5000; A.round();
    const bb = bOf(B, uid); const iv = B.winVal(bb, ikOf(B, uid, w3)); iv.z = 900; B.put(`inst:${bb}:${ikOf(B, uid, w3)}`, 'inst', iv); B.editPage(bb, 'pos'); sync(4);
    ok(!bOf(A, uid) && !bOf(B, uid), 'a page deleted on one while the other only tapped a window or moved the page: deleted');
    // the same window deleted on both
    const b2 = A.ids()[0], k2 = A.addWindow(b2, W.NOTES), u2 = A.boardOf(b2).uid, w2 = A.winVal(b2, k2).wid; sync();
    A.delWin(b2, k2); B.delWin(bOf(B, u2), ikOf(B, u2, w2)); sync(4);
    ok(!winsOf(A, u2).some(x => x.wid === w2) && !winsOf(B, u2).some(x => x.wid === w2), 'the same window deleted on both: deleted');
  }
  {
    // pages: rename on one, color on the other; both renamed: the later, summary names it; order
    const { A, B, b, sync } = pair();
    const uid = A.boardOf(b).uid;
    A.editPage(b, 'name'); const nm = A.boardOf(b).name; NOW += 1000; B.editPage(bOf(B, uid), 'look'); const lk = B.boardOf(bOf(B, uid)).background; sync(3);
    ok(A.boardOf(b).name === nm && B.boardOf(bOf(B, uid)).name === nm && same(A.boardOf(b).background, lk), 'renamed on one, recolored on the other: both apply');
    A.editPage(b, 'name'); NOW += 1000; B.editPage(bOf(B, uid), 'name'); const later = B.boardOf(bOf(B, uid)).name;
    B.round('send'); A.deliver(B);
    const p = A.round();
    ok(A.boardOf(b).name === later && p && p.summary.pages[uid] && p.summary.pages[uid].renamed && p.summary.pages[uid].renamed.name === later && p.summary.pages[uid].risky,
      'renamed on both: the later name, and the summary says so (a Board history version first)');
    sync(3);
    // order: different pages moved on both apply; two pages added at the end: both, one order
    for (let i = 0; i < 3; i++) A.addPage(); sync(3);
    const order = d => d.ids().map(x => d.boardOf(x).uid);
    ok(same(order(A), order(B)), 'the page order is the same on both');
    A.editPage(A.ids()[1], 'pos'); NOW += 1000; B.editPage(B.ids()[3], 'pos'); sync(3);
    ok(same(order(A), order(B)), 'pages moved on both: one order on both');
    A.addPage(); B.addPage(); sync(3);
    ok(same(order(A), order(B)) && A.ids().length === 6, `a page added on both: both pages, one order (${A.ids().length} pages)`);
    // settings.boards is rebuilt from pos, never the reverse
    const st = clone(A.settings); st.boards = st.boards.slice().reverse(); A.put('settings', 'settings', st); sync(3);
    ok(same(order(A), order(B)), 'a stale settings.boards is put right from pos, and reorders nothing elsewhere');
  }
  {
    // n and maxSeen; the blind-write rule; skipped parts
    const { A, B, b, ik, sync } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    const before = A.link.sync.ctr;
    A.type(b, ik); const at = A.recs.get(`data:${b}:${ik}`).updatedAt; NOW += 30 * MIN; A.round();
    const v = A.link.mines.get(uid).w[wid].p.data.v;
    ok(v[1][A.dev] >= at && v[2] === at && v[1][A.dev] > before, 'a version’s counter and time are the record’s edit time, not the stamp’s');
    // a device a year ahead: maxSeen within a day
    const F = new Device('far', { skew: 365 * DAY }); F.folder = A.folder; F.view = new Map(A.folder.files); F.linkTo(A.folder);
    F.type(bOf(F, uid), ikOf(F, uid, wid)); F.round(); A.deliver(F); A.round();
    ok(A.link.sync.maxSeen <= A.now() + DAY, `a device a year ahead: maxSeen stays within a day of this clock (${((A.link.sync.maxSeen - A.now()) / DAY).toFixed(2)} days)`);
    // blind write, same old value (h == prevH): not an edit
    sync(3);
    B.type(bOf(B, uid), ikOf(B, uid, wid)); const tb = token(dataOf(B, uid, wid)); sync(2);
    const key = `data:${b}:${ikOf(A, uid, wid)}`;
    const old = A.stale.get(key);
    ok(old && A.recs.get(key).m, '(a merge wrote the content, and a stale tab still shows the old one)');
    A.put(key, 'data', old.value, { base: old.rev }); sync(3);
    ok(token(dataOf(A, uid, wid)) === tb && winsOf(A, uid).length === 1, 'a stale tab saving its old content after a merge isn’t an edit: the merged content is put back, no copy');
    // blind write with new content: a clash, both kept
    B.type(bOf(B, uid), ikOf(B, uid, wid)); const tb2 = token(dataOf(B, uid, wid)); sync(2);
    const old2 = A.stale.get(key);
    A.put(key, 'data', { text: 'stale-edit' }, { base: old2.rev }); LOG.typed.add('stale-edit'); sync(4);
    const toks = winsOf(A, uid).map(x => token(dataOf(A, uid, x.wid)));
    ok(toks.includes(tb2) && toks.includes('stale-edit'), 'a change from a stale tab after a merge: both kept (the merge’s and the tab’s)');
  }
  {
    // first rounds: no tombstones; join keeps the folder's values; take deletes nothing elsewhere
    const { A, B, b, ik, sync, folder } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    B.unlink(); A.round();
    const bb = bOf(B, uid); B.delWin(bb, ikOf(B, uid, wid)); B.addPage('Unlinked');
    NOW += DAY; B.view = new Map(folder.files); B.linkTo(folder); sync(3);
    ok(B.mode === null && winsOf(A, uid).some(x => x.wid === wid) && winsOf(B, uid).some(x => x.wid === wid), 'linked again (carry): a window deleted while unlinked comes back, nothing is deleted elsewhere');
    ok(A.ids().some(x => A.boardOf(x).name === 'Unlinked'), 'and a page added while unlinked reaches the other device');
    // join: a device with its own pages, one of them the same page (same import)
    const C = new Device('cart');
    const exp = clone(A.boardOf(b));
    const cb = C.nextB(); C.put(`board:${cb}`, 'board', Object.assign({}, exp, { id: cb, name: 'Old name', pos: 1 }));
    const ci = clone(A.winVal(b, ik)); C.put(`inst:${cb}:${ik}`, 'inst', ci); C.put(`data:${cb}:${ik}`, 'data', { text: 'old import' }); LOG.typed.add('old import');
    C.addPage('Mine'); C.patch({ set: { boards: C.ids() } });
    C.view = new Map(folder.files); C.folder = folder; C.linkTo(folder);
    ok(C.boardOf(bOf(C, uid)).name === A.boardOf(b).name, 'join: for a page both have, the folder’s values stay (its name)');
    const cwins = winsOf(C, uid), copy = cwins.find(x => x.copyOf);
    ok(copy && token(dataOf(C, uid, copy.wid)) === 'old import' && token(dataOf(C, uid, wid)) === token(dataOf(A, uid, wid)), 'join: this device’s different content becomes a labelled copy, made at once');
    const posC = C.ids().map(x => C.boardOf(x).name);
    ok(posC[posC.length - 1] === 'Mine', `join: this device’s own pages go after the folder’s (${posC.join(', ')})`);
    // take: a placeholder device
    const D = new Device('cart2'); D.view = new Map(folder.files); D.folder = folder; D.linkTo(folder);
    D.round();   // (the placeholder was the page shown: it goes once another page is shown)
    ok(D.mode === null && bOf(D, uid) && !D.ids().some(x => D.boardOf(x).name === 'My Board'), 'take: a device with only the placeholder shows the folder’s board, and the placeholder goes');
  }
}

// ---------------------------------------------------------------------
// 2. Reading device files
// ---------------------------------------------------------------------
function files() {
  console.log('\nReading device files (§6.3)');
  const { A, b, ik, sync } = pair();
  A.type(b, ik); sync();
  const text = A.folder.files.get(A.fileName()), obj = JSON.parse(text);
  const sum = crypto.createHash('sha256').update(Merge.sumText(obj)).digest('hex').slice(0, 32);
  ok(sum === obj.sync.sum, 'sumText reproduces the writer’s text: the checksum matches');
  const checks = t => { try { const o = JSON.parse(t); return crypto.createHash('sha256').update(Merge.sumText(o)).digest('hex').slice(0, 32) === o.sync.sum && !!Merge.decode(o, H); } catch (e) { return false; } };
  ok(checks(text), 'a whole file is accepted');
  ok(!checks(text.slice(0, Math.floor(text.length / 2))), 'a cut-short file is refused');
  const older = A.folder.revs.get(A.fileName())[0];
  ok(!checks(text.slice(0, Math.floor(text.length / 2)) + older.slice(Math.floor(older.length / 2))), 'a file mixing new and old bytes is refused');
  ok(!checks(text.replace(/"text":"t/, '"text":"x')), 'an edited file is refused (its checksum doesn’t match)');
  const bad = clone(obj);
  bad.instances.push({ widgetId: 'notes', instance: 9, wid: 'bad wid!', v: {} });
  bad.instances.push({ widgetId: 'notes', instance: 8, wid: 'notes@1', v: { exists: ['zz', {}, 1] } });
  const r = Merge.decode(bad, H);
  ok(r && r.peer && r.skipped.length === 2 && Array.from(r.peer.pages.values()).some(p => p.wins.size >= 1), 'one malformed unit is skipped and the rest is read');
  const nv = clone(obj); nv.sync.v = 2;
  ok(same(Merge.decode(nv, H), { peer: null, skipped: [], newer: true }), 'a newer sync.v is reported as newer');
  const ns = clone(obj); ns.instances[0].v.data = [ns.instances[0].v.data[0], ns.instances[0].v.data[1], 5, 'x', 'y'];
  ok(Merge.decode(ns, H).newer === true, 'a version shape this release doesn’t know is reported as newer');
  ok(Merge.decode({ format: '21board', board: {} }, H) === null, 'an export (no sync block) isn’t a device file');
  // the device file is an all-pages backup: Import's reader finds every page
  ok(obj.format === '21board' && obj.kind === 'full' && obj.board && obj.board.uid && Array.isArray(obj.instances) && obj.instances[0].wid, 'a device file is an all-pages export with wid and pos');
  // a skipped part is left out of encode, and isn't null to a reader
  const L = A.ledger(), local = A.readLocal();
  const P = Array.from(local.pages.values()).find(p => p.all.length);
  P.all[0].parts.data.skipped = true;
  const enc = Merge.encode(L, local, { dev: A.dev, name: A.name, at: A.now(), seq: 1 }).obj;
  const allPages = [enc].concat((enc.pages || []).filter(p => !p.main));
  const inst = allPages.flatMap(p => p.instances).find(i => i.wid === P.all[0].wid);
  ok(inst && !('data' in inst) && !inst.v.data, 'a part this device couldn’t read is left out of its file (no value, no version)');
  const dec = Merge.decode(Object.assign({}, enc, { sync: Object.assign({}, enc.sync) }), H);
  const pw = Array.from(dec.peer.pages.values()).map(p => p.wins.get(P.all[0].wid)).find(Boolean);
  ok(pw && !pw.parts.data, 'and a reader sees no version of it, not an empty one');
  // a placeholder with a closed empty window isn't stamped
  const D = new Device('desk');
  const db = D.ids()[0];
  D.addWindow(db, W.TIMER); D.resetWin(db, `${W.TIMER}:1`); D.openWin(db, `${W.TIMER}:1`, false);
  const L0 = D.ledger(), st = Merge.stamp(L0, D.readLocal(), { dev: D.dev, now: D.now(), ctr: 0, maxSeen: 0 });
  ok(Object.keys(st.ledger.mine).length === 0 && st.stamped === 0, 'the untouched placeholder (even with a Timer opened and closed, empty) is never stamped');
  // wid defaults and de-duplication
  const E = new Device('wids', { pages: false }); E.addPage('X');
  const eb = E.ids()[0];
  E.put(`inst:${eb}:notes:1`, 'inst', { widgetId: 'notes', n: 1, open: true, rect: { x: 1, y: 1, w: 300, h: 200 }, z: 1, createdAt: 1000 });
  E.put(`inst:${eb}:notes:2`, 'inst', { widgetId: 'notes', n: 2, open: true, rect: { x: 1, y: 1, w: 300, h: 200 }, z: 1, createdAt: 1000 });
  E.put(`inst:${eb}:notes:3`, 'inst', { widgetId: 'notes', n: 3, open: true, rect: { x: 1, y: 1, w: 300, h: 200 }, z: 1, createdAt: 5, wid: 'notes@1000' });
  const el = E.readLocal(), es = Merge.stamp(E.ledger(), el, { dev: E.dev, now: E.now(), ctr: 0, maxSeen: 0 });
  const wids = ['notes:1', 'notes:2', 'notes:3'].map(k => (es.fixes.find(f => f.key === `inst:${eb}:${k}`) || { value: E.recs.get(`inst:${eb}:${k}`).value }).value.wid);
  ok(same(wids, ['notes@1000.2', 'notes@1000.3', 'notes@1000']), `a window without wid gets <widget>@<createdAt>, then .2, .3 (${wids.join(', ')})`);
  // copy ids are the same from the author and from a fallback device
  const vA = { by: 'aaaaaaaaaaaa', vv: { aaaaaaaaaaaa: 5, bbbbbbbbbbbb: 3 } };
  ok(Merge.copyWid('notes@1', vA) === Merge.copyWid('notes@1', JSON.parse(JSON.stringify(vA))), 'a copy’s id depends only on the window and the version, on every device');
  // patchSettings: set operations
  const s0 = { boards: [1, 2, 3], deletedBoards: [4], deletedAt: { 4: 10 }, lastBoard: 4, theme: 'dark' };
  const s1 = Merge.patchSettings(s0, { set: { theme: 'light' }, gone: [['add', 2, 99], ['remove', 4]] });
  ok(same(s1.deletedBoards, [2]) && same(s1.deletedAt, { 2: 99 }) && same(s1.boards, [1, 3]) && s1.theme === 'light', 'a settings patch adds and removes deleted pages as set operations');
  const s2 = Merge.patchSettings(Object.assign({}, s0, { boards: [3, 1, 2, 5] }), { order: { 1: [1, 'a'], 2: [2, 'b'], 3: [0.5, 'c'] } });
  ok(same(s2.boards, [3, 1, 2, 5]), 'the order is rebuilt from pos, with pages the patch doesn’t know kept after');
}

// ---------------------------------------------------------------------
// 3. The randomized run, and the proof that its oracle bites
// ---------------------------------------------------------------------
// Runs are shared out between worker threads (MERGE_THREADS, default: the CPUs, at most 4), each running a range of seeds.
const THREADS = Math.max(1, Math.min(+process.env.MERGE_THREADS || os.cpus().length, 4));
function runRange({ from, to, nDev, steps, variant }) {
  const out = { runs: 0, bad: {}, copies: 0, wins: 0, lost: 0, back: 0, first: null };
  for (let i = from; i < to; i++) {
    let r;
    try { r = variant ? runWith(variant, i, nDev, steps) : run(i, nDev, steps); }
    catch (err) { out.bad.crash = (out.bad.crash || 0) + 1; if (!out.first) out.first = `seed ${i}: ${err.stack}`; continue; }
    out.runs++; out.copies += r.copies; out.wins += r.wins;
    if (r.lost.length) out.lost++;
    if (r.back.length || !r.converged) out.back++;
    const why = [!r.converged && 'converged', !r.quiet && 'quiet', r.lost.length && 'lost', r.twice.length && 'twice', r.pending && 'pending', r.back.length && 'back'].filter(Boolean);
    for (const w of why) out.bad[w] = (out.bad[w] || 0) + 1;
    if (why.length && !out.first) out.first = `seed ${i}: ${why.join(', ')} ${JSON.stringify({ lost: r.lost.slice(0, 5), twice: r.twice.slice(0, 3), back: r.back.slice(0, 3) })}`;
  }
  return out;
}
function inWorkers(job, runs) {
  const per = Math.ceil(runs / THREADS), parts = [];
  for (let k = 0; k < THREADS && k * per < runs; k++) parts.push(Object.assign({}, job, { from: 1 + k * per, to: 1 + Math.min(runs, (k + 1) * per) }));
  return Promise.all(parts.map(p => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: p });
    w.once('message', res); w.once('error', rej);
  }))).then(rs => rs.reduce((a, r) => {
    a.runs += r.runs; a.copies += r.copies; a.wins += r.wins; a.lost += r.lost; a.back += r.back; a.first = a.first || r.first;
    for (const [k, v] of Object.entries(r.bad)) a.bad[k] = (a.bad[k] || 0) + v;
    return a;
  }, { runs: 0, bad: {}, copies: 0, wins: 0, lost: 0, back: 0, first: null }));
}
async function randomized(scale) {
  console.log(`\nThe randomized run (§12.2; ${THREADS} thread${THREADS > 1 ? 's' : ''})`);
  const t0 = Date.now();
  for (const [runs, nDev, steps] of [[Math.round(2000 * scale), 3, 150], [Math.round(500 * scale), 5, 300]]) {
    const r = await inWorkers({ nDev, steps }, runs);
    const total = Object.values(r.bad).reduce((a, b) => a + b, 0);
    ok(total === 0 && r.runs === runs, `${runs} runs × ${nDev} devices × ${steps} steps: every oracle holds (${r.copies} copies over ${r.wins} windows)` + (total ? ` — ${JSON.stringify(r.bad)}; first: ${r.first}` : ''));
  }
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
async function bites(scale) {
  console.log('\nThe oracle bites');
  const n1 = Math.max(20, Math.round(100 * scale)), n2 = Math.max(30, Math.round(150 * scale));
  const lww = await inWorkers({ nDev: 3, steps: 150, variant: { lww: true } }, n1);
  ok(lww.lost > n1 * 0.3, `with plain last-write-wins content, typed work is lost (${lww.lost} of ${n1} runs)`);
  const draft = await inWorkers({ nDev: 3, steps: 150, variant: { draft: true } }, n2);
  const real = summer(false), first = summer(true);
  ok(!real && first, `the summer (a laptop unused for 75 days while the smartboard deletes a page): the page stays deleted, and with the first draft’s rules for removing files and collecting tombstones it comes back (${first ? 'it did' : 'it didn’t'}; ${draft.back} of ${n2} random runs too)`);
}
// drive-critic/relink-sim.js's summer, on these devices: does the page the smartboard deleted come back?
function summer(draft) {
  const run1 = () => {
    rnd = seeded(7); NOW = Date.UTC(2027, 5, 10, 13); uidN = 0; LOG = newLog(); LOG.n = 0; PHOTOS.clear();
    const folder = new Folder('Room 12'), L = new Device('laptop'), S = new Device('board');
    const keep = L.addPage('Vocab'), b = L.addPage('Seating');
    L.addWindow(keep, W.NOTES); L.addWindow(b, W.NOTES);
    L.linkTo(folder); S.deliver(L); S.linkTo(folder);
    const sync = () => { for (const d of [L, S]) { for (const o of [L, S]) if (o !== d) d.deliver(o); d.round(); } NOW += 3 * MIN; };
    sync(); sync();
    const uid = L.boardOf(b).uid;
    NOW += DAY; S.delPage(bOf(S, uid)); NOW += UNDO + 5000; S.round();
    for (let d = 0; d < 75; d++) { NOW += DAY; S.round(); }
    sync(); sync(); sync();   // the laptop opens again
    return !!bOf(S, uid) || !!bOf(L, uid);
  };
  return draft ? withDraft(run1) : run1();
}
function withDraft(f) {
  const draftGc = (L, peers, files, o) => {
    const out = Merge.ledger(L.sync, Object.values(L.mine));
    for (const [uid, M] of Object.entries(out.mine)) {
      if (M.gone && o.now - M.gone.exists[2] >= 30 * DAY && peers.every(p => !p.pages.has(uid))) { delete out.mine[uid]; continue; }
      for (const [wid, T] of Object.entries(M.wgone || {})) {
        if (o.now - T.exists[2] < 30 * DAY || !peers.every(p => !(p.pages.get(uid) && p.pages.get(uid).wins.has(wid)))) continue;
        const M2 = out.mine[uid] = Object.assign({}, out.mine[uid], { wgone: Object.assign({}, out.mine[uid].wgone) });
        delete M2.wgone[wid];
      }
    }
    return out;
  };
  const realRound = Device.prototype.round;
  Device.prototype.round = function (kind, opts = {}) {
    const r = realRound.call(this, kind, Object.assign({}, opts, { gcFn: draftGc }));
    for (const [d, p] of this.peers) if (this.now() - p.at >= 60 * DAY && Merge.includes(this.ledger(), p)) this.removeFile(d);
    return r;
  };
  try { return f(); } finally { Device.prototype.round = realRound; }
}
// The same run with the rules swapped out.
function runWith(v, seed, nDev, steps) {
  if (v.lww) {
    const real = Merge.join;
    Merge.join = (l, p, o) => real(l, p, Object.assign({}, o, { isLater: () => true }));
    const realPlan = Merge.plan;
    Merge.plan = (s, l, g, o) => realPlan(s, l, g, Object.assign({}, o, { isLater: () => true }));
    try { return run(seed, nDev, steps); } finally { Merge.join = real; Merge.plan = realPlan; }
  }
  // the first draft: a tombstone goes 30 days after it was made if every file in the folder has it or lacks the
  // unit, and a device file unchanged for 60 days (and included) is removed
  return withDraft(() => run(seed, nDev, steps, { noChange: true, awayMore: 0.02, jumps: 0.08, back: 0.05 }));
}

// ---------------------------------------------------------------------
if (!isMainThread) parentPort.postMessage(runRange(workerData));
else (async () => {
  const scale = +process.argv[2] || 1;
  rules();
  files();
  await randomized(scale);
  await bites(scale);
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
