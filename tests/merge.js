/*
 * 21Board — Node test of Board Sync's merge (board.js section 13d), no browser:  node tests/merge.js
 *
 * Loads the "// #region Board Sync merge" region of board.js (and hash53, clone and sameJSON, by name) into a vm,
 * then checks:
 *   - the rules table (spec §4.1), case by case, with two or three simulated devices;
 *   - the theme and accent color, the board's on every device: the later change wins, a device that never changed
 *     them never overwrites, joining, an empty folder (two set up at once), switching, linking again, files from
 *     2026.11.16-3;
 *   - reading a device file: cut, mixed and edited files are refused, a whole one is read, a bad unit is skipped;
 *   - a randomized run: devices editing pages and windows, Google Drive delivering files late, out of order, twice,
 *     as conflict copies or not at all, devices unlinked, linked again, switched to another folder and back, away
 *     for months, busy windows, stale tabs writing over a merge, lost files and ledgers, the theme and accent
 *     changed now and then (and before set-up), and in some runs two or more devices setting up the folder at once.
 *     After a final full exchange, an oracle checks that every device shows the same board (and theme and accent),
 *     that nothing anyone typed is lost unless a device that showed it changed or deleted it, that no clash is left,
 *     that no version is copied twice, that nobody writes again, that nothing deleted comes back unless someone
 *     edited it without having seen the deletion, and that the theme and accent are the latest choice made for the
 *     folder;
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
const pick = (a, r = rnd) => a[Math.floor(r() * a.length)];
const token = v => (v && typeof v === 'object' ? (typeof v.text === 'string' ? v.text : Array.isArray(v.tasks) ? v.tasks[0] : null) : null);
let LOG;
const newLog = () => ({ typed: new Set(), gone: new Set(), dels: [], edits: [], sig: new Map(), writes: 0, fileKnow: new Map(),
  replaced: new Set(), repl: new Map(), spur: [], udels: [], published: new Set(), resetCopies: new Set(), styles: [], folder: null });
// A name, color, place, setting or Timer state that a device changed while it showed it (folder|unit|mark): it must
// never come back (oracle 7). Typed text is the "lost" oracle's.
const LWW_MARK = /^(n|l|r|c|dur):/;
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
    this.lastWid = 0; this.writes = 0; this.away = false; this.blinded = new Set();
    this.styleBase = { theme: 'system', accent: 'blue' };   // (the theme and accent after its last round: oracle 9)
    this.put('settings', 'settings', { boards: [], deletedBoards: [], deletedAt: {}, lastBoard: 0, activeBoard: 1 });
    if (opts.pages !== false) this.placeholder();
  }
  now() { return NOW + this.skew; }
  put(key, type, value, opts = {}) {
    const cur = this.recs.get(key);
    const rec = { key, type, rev: Math.max((cur ? cur.rev : 0) + 1, this.now()), updatedAt: this.now(), by: 't', value: clone(value) };
    if (!opts.blind && opts.was === undefined) this.stale.delete(key);   // (another tab's later write: the stale tab's waiting change is dropped)
    // (a tab that skipped a merged write keeps its old base for that record until it shows one: see Writer)
    // (a record made again after a Reset is based on the one deleted: Raced.gone)
    rec.base = opts.base !== undefined ? opts.base : this.staleBase.has(key) ? this.staleBase.get(key) : cur ? cur.rev : (this.goneRev && this.goneRev.get(key)) || 0;
    if (opts.u) rec.u = 1;
    // (what this change replaced, as the tab that made it showed it: opts.was for a stale tab; nothing for a stale tab
    // writing back what it showed, or a rescale, which doesn't move windows)
    const before = opts.was !== undefined ? opts.was : cur && cur.value;
    if (LOG && !opts.quiet && !opts.blind && !opts.rescale && before) {
      const now = new Set(sigsOf(key, value)), unit = this.unitsOf(key)[0];
      for (const sg of sigsOf(key, before)) if (LWW_MARK.test(sg) && !now.has(sg)) LOG.replaced.add(`${this.folderName}|${unit}|${sg}`);
    }
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
  del(key) { const r = this.recs.get(key); if (r) (this.goneRev || (this.goneRev = new Map())).set(key, r.rev); this.recs.delete(key); }
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
    const rk = old && `${this.unitsOf(key)[0]}|${old}`;   // (by window: the same text can also be in a copy of it)
    if (old && !fresh && !LOG.repl.has(rk)) LOG.repl.set(rk, { dev: this.dev, folder: this.folderName });
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
  resetWin(b, ik) {
    const old = this.shownValue(`data:${b}:${ik}`), iv = this.winVal(b, ik); if (old) LOG.gone.add(old);
    if (iv.copyOf) LOG.resetCopies.add(iv.wid);   // (an empty copy is fine once it was emptied on purpose)
    this.del(`data:${b}:${ik}`); this.del(`conf:${b}:${ik}`); this.markless(b, ik); this.touchWin(b, ik);
  }
  delWin(b, ik) {
    const iv = this.winVal(b, ik), old = this.shownValue(`data:${b}:${ik}`);
    if (old) LOG.gone.add(old);
    for (const k of ['inst', 'data', 'conf']) this.del(`${k}:${b}:${ik}`);
    if (this.linked) this.deleted(`${this.pageUnit(b)} ${iv.wid}`);
    else if (this.folderName) { const unit = `${this.pageUnit(b)} ${iv.wid}`; LOG.udels.push({ unit, by: this.dev, folder: this.folderName, elsewhere: this.elsewhere(unit) }); }
  }
  deleted(unit) {
    // (the edits of it this device never had on screen: any of them may bring it back)
    const unseen = LOG.edits.filter(e => e.units.includes(unit) && e.folder === this.folderName && !this.applied.has(e.id)).length;
    const d = { id: LOG.dels.length + 1, unit, by: this.dev, folder: this.folderName, justified: false, unseen, elsewhere: this.elsewhere(unit) }; LOG.dels.push(d); this.know.add(d.id); return d;
  }
  // Another device of this folder shows it too (its board is the folder's).
  elsewhere(unit) { return (global.__devs || []).some(o => o !== this && o.folderName === this.folderName && o.shows(unit)); }
  delPage(b) {
    for (const r of this.insts(b)) { const t = this.shownValue(`data:${b}:${r.value.widgetId}:${r.value.n}`); if (t) LOG.gone.add(t); }
    this.patch({ gone: [['add', b, this.now()]], set: { boards: this.ids().filter(x => x !== b) } });
    if (this.linked) this.deleted(this.pageUnit(b)).page = b;
    else if (this.folderName) LOG.udels.push({ unit: this.pageUnit(b), by: this.dev, folder: this.folderName, elsewhere: this.elsewhere(this.pageUnit(b)) });
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
  purge() {   // pages whose Undo is over: their records go (Pages.purge; a round has always run since: rounds follow every change)
    const st = this.settings;
    for (const b of st.deletedBoards || []) {
      if (this.now() - (st.deletedAt[b] || 0) < UNDO + 3000 || (this.linked && !(this.seenGone || new Set()).has(b))) continue;
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
      for (const r of this.insts(b)) { const iv = clone(r.value); iv.rect = H.scaleRect(iv.rect, s0 / s1); this.put(r.key, 'inst', iv, { rescale: true }); }
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
  // Settings → Theme, Accent color: the board's on every device linked to the folder (updateSettings notes when each
  // was chosen here: themeAt, accentAt)
  setStyle(p) { const set = {}; for (const [k, v] of Object.entries(p)) { set[k] = v; set[k + 'At'] = this.now(); } this.patch({ set }); }
  styleNow() { return [this.settings.theme || 'system', this.settings.accent || 'blue'].join(' '); }
  styleOf() { return { theme: this.settings.theme || 'system', accent: this.settings.accent || 'blue' }; }
  // (oracle 9: the choices a round takes out of this device as a change: one made here since its last round that left
  // something else showing than that round did, or any it made before setting up an empty folder. They count for the
  // folder of the run unless the round joins it or switches to it: the folder's then apply.)
  settleStyle() {
    const st = this.settings, now = this.styleOf(), counts = !!LOG.folder && this.folderName === LOG.folder && this.mode !== 'join' && this.mode !== 'take';
    for (const k of ['theme', 'accent']) {
      if (typeof st[k + 'At'] === 'number' && (now[k] !== this.styleBase[k] || this.mode === 'seed')) LOG.styles.push({ k, val: now[k], at: st[k + 'At'], counts, by: this.label });
    }
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
  readLocal(leaving) {   // (leaving: Link.farewell's round, where a page whose Undo is still offered goes as deleted)
    const recs = Array.from(this.recs.values());
    return Merge.read(recs, Object.assign({ settings: this.settings, now: this.now(), hcache: this.hcache || (this.hcache = new Map()) }, H, leaving ? { undoMs: 0 } : {}));
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
    if (this.mode && kind === 'send') return;   // (Link: a mode isn't applied by a send round)
    this.settleStyle();
    // (a stale tab's write lands before the next round: Writer writes at once, rounds wait for quiet)
    // (a stale tab's write lands before the next round, unless its writes are held up: then it may still miss the
    // next merge too, and its change is based on the record before the first)
    if (rnd() < 0.8) this.stale = new Map();
    else for (const [k, v] of Array.from(this.stale)) if ((v.rounds = (v.rounds || 0) + 1) > 1) this.stale.delete(k);   // (one more round at most)
    if (kind === 'full' || kind === 'send') { this.blindSince = false; this.blinded = new Set(); }
    this.purge();
    this.seenGone = new Set(this.settings.deletedBoards || []);
    const now = this.now();
    let L = this.ledger();
    if (!this.link) {   // the ledger is gone: rebuilt from this device's own file if it is here, and a first round either way
      const own = this.view.get(this.fileName()), r = own && this.decodeText(own);
      if (r && r.peer) L = Merge.rebuild(r.peer, { now });
      this.first = true; this.lostLedger = false;
    }
    if (this.restamp) this.restamped(true);
    // (seed and join start a new ledger that stamps everything here again, as a lost one does)
    else if (kind === 'full' && this.first && (this.mode === 'seed' || this.mode === 'join')) this.restamped(false);
    if (this.mode === 'take' && kind === 'full') {   // what this device had in the other folder is kept (Board history, the other folder)
      for (const P of this.readLocal().pages.values()) for (const W2 of P.all) { const t = token(W2.parts.data.val); if (t) LOG.gone.add(t); }
    }
    let local = this.readLocal(opts.leaving);
    const dropHere = new Set(L.sync.dropHere || []);
    const st = Merge.stamp(L, local, { dev: this.dev, ctr: L.sync.ctr || 0, maxSeen: L.sync.maxSeen || 0, first: this.first, now, mode: this.mode, dropHere });
    const apply = (writes, set) => {
      const unitWas = new Map(writes.map(w => [w.key, this.recs.has(w.key) ? this.unitsOf(w.key)[0] : null]));   // (before any of them: window numbers are used again)
      for (const w of writes) {
        if (w.del) { this.del(w.key); continue; }
        const was = this.recs.get(w.key);
        // what a stale tab still shows (and of which window or page; after a take, what it showed of the other folder's board)
        if (was && /^(data|inst|board)$/.test(w.type) && !this.stale.has(w.key)) this.stale.set(w.key, Object.assign(clone(was), { unit: unitWas.get(w.key) }));
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
      this.styleBase = this.styleOf();
      return;
    }
    const { peers, files } = this.look(st.ledger);
    // (Link's noteFiles: a device whose file's seq went up changed just now, a device that left is idle)
    const seen = st.ledger.sync.peers = Object.assign({}, st.ledger.sync.peers);
    for (const [d, p] of this.peers) { const q = seen[d] = Object.assign({}, seen[d]); if (p.seq > (q.seen || 0)) { q.seen = p.seq; q.changedAt = now; } q.left = p.left; }
    const idle = d => { const q = seen[d] || {}; return !!q.left || now - (q.changedAt || 0) >= IDLE; };
    const state = Merge.join(st.ledger, peers, { dev: this.dev, now, mode: this.mode, first: this.first, aheadMax: DAY, isLater, idle, left: d => !!(seen[d] || {}).left });
    // (Link: a mode waits while a page the folder has, and this new ledger doesn't, is held for its Undo)
    if (this.mode && Array.from(local.pages.values()).some(P => P.held && !P.gone && state.pages.has(P.uid) && !st.ledger.mine[P.uid])) return;
    const photos = {};
    for (const w of Merge.photosWanted(state, local)) if (rnd() > (opts.photoMiss || 0) && PHOTOS.has(w.key)) photos[w.uid] = PHOTOS.get(w.key);
    const holds = { wins: Array.from(this.busy) };
    const names = d => { const p = this.peers.get(d); return p ? p.name : d === this.dev ? this.name : 'another device'; };
    // (as Link calls it: n is the stamp's counter, which plan must not reuse)
    const plan = Merge.plan(state, local, st.ledger, { dev: this.dev, n: st.ctr, now, mode: this.mode, holds, isLater, isSingle, names, pageShown: this.pageShown(), photos, freeIds: this.nextB(),
      zTop: () => 500, place: (uid, r) => ({ x: r.x + 32, y: r.y + 32, w: r.w, h: r.h }), dropHere });
    // (oracle 7: a copy this device made of its own version: never of text it had itself typed over in that window)
    for (const sw of plan.undo.swaps) {
      const b = (plan.summary.pages[sw.page] || {}).b;   // (by page: two pages can have windows with the same wid)
      const iw = plan.writes.find(x => x.type === 'inst' && !x.del && x.key.startsWith(`inst:${b}:`) && x.value.wid === sw.copyWid), dw = iw && plan.writes.find(x => x.key === iw.key.replace(/^inst:/, 'data:'));
      const t = dw && !dw.del && token(dw.value), rp = t && LOG.repl.get(`${sw.page} ${sw.wid}|${t}`);
      if (rp && rp.dev === this.dev && rp.folder === this.folderName) LOG.spur.push({ unit: `${sw.page} ${sw.wid}`, say: `${this.label} copied its own ${t}, which it had typed over` });
    }
    // (the transaction)
    apply(plan.writes, plan.settings);
    if (plan.summary.leave) this.leave(plan.summary.leave);
    const L2 = Merge.ledger(Object.assign({}, plan.sync, { dropHere: (plan.summary.dropHere || []).length ? plan.summary.dropHere : null }), []);
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
    this.lastSum = plan.summary; (this.sums || (this.sums = [])).push(plan.summary);
    this.styleBase = this.styleOf();
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
      if (M && !M.gone && (!wid || M.w[wid])) { d.undone = true; d.relink = true; }
    }
    // (and with its own file missing too: its deletions that no other device has had are gone, as §3.4 accepts)
    if (!this.view.has(this.fileName())) for (const x of LOG.dels) if (x.by === this.dev && !(global.__devs || []).some(o => o !== this && o.know.has(x.id))) { x.undone = true; x.relink = true; }
    this.link = null; this.lostLedger = true; this.restamp = true; this.lostAt = LOG.dels.length;
  }
  // A lost ledger's first round stamps everything shown here again: for the oracle, an edit of each of them.
  restamped(lost) {
    this.restamp = false;
    if (lost) for (const d of LOG.dels.slice(this.lostAt || 0)) if (d.by === this.dev) { d.undone = true; d.relink = true; }   // (deleted since: not stamped either)
    for (const b of this.ids()) {
      const uid = this.pageUnit(b);
      // (its values are stamped as new: one replaced elsewhere meanwhile may win again, as §3.4 accepts)
      for (const key of [`board:${b}`].concat(this.insts(b).flatMap(r => ['inst', 'data', 'conf'].map(k => `${k}:${b}:${r.value.widgetId}:${r.value.n}`)))) {
        const r = this.recs.get(key);
        if (r) for (const sg of sigsOf(key, r.value)) LOG.replaced.delete(`${this.folderName}|${this.unitsOf(key)[0]}|${sg}`);
      }
      const units = [uid].concat(this.insts(b).map(r => `${uid} ${r.value.wid}`));
      for (const u of units) { const e = { id: LOG.edits.length + 1, units: [u], by: this.dev, folder: this.folderName }; LOG.edits.push(e); this.applied.add(e.id); this.touch(u); }
    }
  }
  removeFile(d) {   // (only the file as it was read: one written anew since is kept, as Link.daily re-reads its size and date)
    for (const [name, text] of Array.from(this.view)) {
      const r = this.decodeText(text);
      if (!r || !r.peer || r.peer.dev !== d || (this.folder && this.folder.files.has(name) && this.folder.files.get(name) !== text)) continue;
      this.view.delete(name); if (this.folder) this.folder.remove(name);
    }
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
    for (const pg of [obj].concat((obj.pages || []).filter(x => !x.main))) if (pg.board) { LOG.published.add(`${this.folderName}|${pg.board.uid}`); for (const i of pg.instances || []) LOG.published.add(`${this.folderName}|${pg.board.uid} ${i.wid}`); }
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
  // set-up, as Link decides the mode (§3.5). opts.atOnce: another device is setting up the same folder at this moment,
  // and neither has the other's file yet (this one finds it empty).
  linkTo(folder, opts = {}) {
    // (which folder this device was linked to is kept apart from the ledger, as link:folder is)
    if (!this.link && this.lostLedger && folder.files.has(this.fileName())) {
      const r = this.decodeText(folder.files.get(this.fileName()));
      if (r && r.peer) this.store(Merge.rebuild(r.peer, { now: this.now() }));
    }
    this.lostLedger = false;
    const had = this.folderName;
    const others = opts.atOnce ? [] : Array.from(folder.files.keys()).filter(n => n !== this.fileName());
    this.folder = folder; this.view = opts.atOnce ? new Map() : new Map(folder.files);
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
    this.folderName = folder.name; this.linkedAs = this.mode;
    this.linked = true; this.first = true; this.busy.clear();
    this.round('full');
  }
  unlink() { if (this.away || !this.link) return; this.round('send', { leaving: true }); if (this.folder) { const L = this.ledger(); this.writeFile(L, { at: this.now() }); } this.linked = false; }
  // Change… to another folder: the folder left gets this device's file once more first, saying that it left (Link.farewell)
  farewell() { this.round('send', { leaving: true }); if (this.folder) this.writeFile(this.ledger(), { at: this.now() }); }
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
    return JSON.stringify([this.styleNow(), out.sort((a, c) => (a[0] < c[0] ? -1 : 1))]);   // (and the board's theme and accent)
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
  // (the theme and accent changed now and then: a stream of numbers of their own, so that the rest of each run is as it
  // was. Some devices choose them before they are set up. variant.atOnce: how often a device sets up the folder at the
  // same moment as the first, before either has the other's file, so that two or more find it empty and each sends its
  // board, theme and accent there.)
  const srnd = seeded(seed * 104729 + 3);
  const choose = d => d.setStyle(srnd() < 0.5 ? { theme: pick(['light', 'dark', 'system'], srnd) } : { accent: pick(['blue', 'green', 'pink', 'teal'], srnd) });
  const before = d => { if (srnd() < 0.4) { NOW += 1000 + Math.floor(srnd() * 1000); choose(d); } };
  LOG.folder = folder.name;
  devs[0].addPage('Math'); devs[0].addWindow(devs[0].ids()[1], W.NOTES);
  before(devs[0]);
  devs[0].linkTo(folder);
  for (const d of devs.slice(1)) {
    if (rnd() < 0.3) { const b = d.addPage(); d.addWindow(b, W.NOTES); }
    before(d);
    for (const o of devs) if (o !== d) d.deliver(o);
    d.linkTo(folder, { atOnce: srnd() < (variant.atOnce || 0) });
  }
  for (const d of devs) for (const o of devs) if (o !== d) d.deliver(o);
  const roundOf = d => d.round('full', gcOpts);
  for (let s = 0; s < steps; s++) {
    NOW += rnd() < (variant.jumps || 0.03) ? Math.floor(rnd() * 40) * DAY : Math.floor(rnd() * 30000);
    const d = pick(devs), r = rnd();
    if (d.away && rnd() < (variant.back || 0.15)) d.away = false;
    if (d.away) continue;   // (closed: it does nothing until it is back)
    if (variant.awayMore && rnd() < variant.awayMore) { d.away = true; NOW += 90 * DAY; continue; }
    if (srnd() < 0.04) choose(d);
    if (r < 0.40) edit(d);
    else if (r < 0.62) roundOf(d);
    else if (r < 0.85) { const o = pick(devs.filter(x => x !== d)); d.deliver(o, rnd() < 0.15 ? 'old' : rnd() < 0.05 ? 'copy' : 'latest'); }
    else if (r < 0.88) { if (d.linked) d.round('send'); }
    else if (r < 0.90) { const w = pick(d.liveWins()); if (w && d.linked) { d.busy.clear(); d.busy.add(`${w[0]}:${w[1]}`); } }
    else if (r < 0.91) d.busy.clear();
    else if (r < 0.925) blind(d);
    else if (r < 0.93) {   // its own file lost
      if (d.folder) { d.view.delete(d.fileName()); d.folder.remove(d.fileName()); }
      // (with its ledger lost too, before a round rebuilt it: its deletions that no other device has had are gone, as §3.4 accepts)
      if (d.folder && !d.link) for (const x of LOG.dels) if (x.by === d.dev && !devs.some(o => o !== d && o.know.has(x.id))) { x.undone = true; x.relink = true; }
    }
    else if (r < 0.935) { if (d.link && d.linked && !d.blindSince) { d.loseLedger(); d.stale = new Map(); } }   // its ledger lost (not in the seconds a stale tab's write waits for a round, and the stale tabs' writes still to come go with it, as after a device closed for weeks: a rebuilt ledger can't tell one from an edit)
    else if (r < 0.945) { if (d.linked && d.folder === folder && !variant.noUnlink) d.unlink(); else if (!d.linked) { d.view = new Map(folder.files); d.linkTo(folder); } }
    else if (r < 0.95) { if (d.linked && d.folder === folder && !variant.noChange) { d.farewell(); d.linkTo(other); } else if (d.linked && d.folder === other) { d.farewell(); d.view = new Map(folder.files); d.linkTo(folder); } }
    else if (r < 0.955) { if (variant.away !== false) { d.away = true; NOW += 90 * DAY; } }
    else roundOf(d);
  }
  // Drive catches up: everything is delivered, every device is back in the folder and running, until nothing changes.
  NOW += UNDO + 5000;
  for (const d of devs) { d.away = false; d.busy.clear(); if (d.folder !== folder || !d.linked) { if (d.linked) d.farewell(); d.view = new Map(folder.files); d.linkTo(folder); } }
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
  // (oracle 7: no needless copies, nothing reverted. A device never copies its own text that it had typed over; a copy is
  // never empty unless it was emptied after it was made; a name, color, place, setting or Timer state that a device
  // changed while it showed it never comes back)
  // (a page or window deleted and back again has the values of the files that brought it back, as §4.3 says, and may
  // bring back a version its own device had typed over, as a copy: clutter, never a loss)
  const wasGone = new Set(LOG.dels.concat(LOG.udels).filter(d => d.folder === folder.name).map(d => d.unit));
  const L0 = devs[0].ledger(), needless = LOG.spur.filter(x => !wasGone.has(x.unit) && !wasGone.has(x.unit.split(' ')[0])).map(x => x.say), reverted = [];
  for (const P of devs[0].readLocal().pages.values()) {
    if (P.gone || P.held || !L0.mine[P.uid] || L0.mine[P.uid].gone) continue;
    const chk = (unit, kind, v) => { if (wasGone.has(unit) || wasGone.has(unit.split(' ')[0])) return; for (const sg of sigsOf(kind + ':0', v)) if (LOG.replaced.has(`${folder.name}|${unit}|${sg}`)) reverted.push(`${unit} ${sg}`); };
    chk(P.uid, 'board', P.value);
    for (const W2 of P.wins.values()) {
      const u = `${P.uid} ${W2.wid}`;
      chk(u, 'inst', W2.inst); chk(u, 'data', W2.parts.data.val); chk(u, 'conf', W2.parts.conf.val);
      if (W2.parts.label.val && W2.parts.data.val === null && !W2.parts.data.skipped && !LOG.resetCopies.has(W2.wid)) needless.push(`${u} is an empty copy`);
    }
  }
  // (oracle 8: a deletion made while unlinked, or that a lost ledger never stamped, deletes nothing that another device
  // of the folder showed: the unit is still shown, unless a deletion made while linked removed it)
  const pageOf = u => u.split(' ')[0];
  const excused = u => LOG.dels.some(d => d.folder === folder.name && !d.undone && !d.relink && (d.unit === u || d.unit === pageOf(u)));
  const unlinked = LOG.udels.concat(LOG.dels.filter(d => d.relink)).filter(d => d.folder === folder.name && d.elsewhere && LOG.published.has(`${folder.name}|${d.unit}`) && !devs[0].shows(d.unit) && !excused(d.unit)).map(d => d.unit);
  // (oracle 9: the theme and accent are the latest choice that counted for this folder (see settleStyle), or the
  // defaults when none did. Not after a lost ledger, which stamps them again, as §3.4 accepts; two choices within a
  // moment of each other may go either way.)
  const style = [];
  for (const k of LOG.lostLedger ? [] : ['theme', 'accent']) {
    const cs = LOG.styles.filter(x => x.k === k && x.counts), top = cs.reduce((a, x) => (!a || x.at > a.at ? x : a), null);
    if (top && cs.some(x => x.val !== top.val && top.at - x.at < 3)) continue;
    const want = top ? top.val : { theme: 'system', accent: 'blue' }[k], got = devs[0].styleOf()[k];
    if (got !== want) style.push(`${k} ${got}, not ${want} (${top ? `chosen on the ${top.by} at ${top.at}` : 'nobody chose one'})`);
  }
  // (a device that lost its ledger and its file stamps its edits again under new counters: §3.4 accepts that this may
  // copy one of them twice, so oracle 4 holds only in runs where no ledger was lost)
  return { converged, quiet, lost, twice: LOG.lostLedger ? [] : twice, twiceLost: LOG.lostLedger ? twice : [], pending, back, wins, copies, writes: LOG.writes, lostLedger: !!LOG.lostLedger,
    needless, reverted, unlinked, style };
}
function edit(d) {
  if (d.away) return;
  const ids = d.ids(), b = pick(ids), r = rnd();
  if (!ids.length) return;
  // (not this device's own page that a take is removing here: it was left at once, see Link's step 11)
  if (d.link && (d.link.sync.dropHere || []).includes(d.pageUnit(b))) return;
  const wins = d.insts(b).map(x => `${x.value.widgetId}:${x.value.n}`);
  if (r < 0.06 || !wins.length) { if (r < 0.03 && ids.length < 6) d.addPage(); else if (wins.length < 8) d.addWindow(b, pick([W.NOTES, W.NOTES, W.NOTES, W.TASK, W.TIMER, W.SKETCH])); return; }
  // (not a window or page a stale tab has just written over a merge, before a round: see blinded. The teacher deleting it
  // then may not have seen what the merge brought, and the deletion would cover it: a sub-second race the spec leaves.)
  if (r < 0.08 && ids.length > 2) { if (!d.blinded.has(`${b}`)) d.delPage(b); return; }
  if (r < 0.085) { const gone = d.settings.deletedBoards || []; if (gone.length) d.undoDel(pick(gone)); return; }
  if (r < 0.11) { d.editPage(b, pick(['name', 'look', 'size', 'pos', 'name'])); return; }
  if (r < 0.12) { d.photo(b, rnd() < 0.7); return; }
  const ik = pick(wins), iv = d.winVal(b, ik);
  if (r < 0.17) { if (!d.blinded.has(`${b}:${ik}`)) d.delWin(b, ik); }
  else if (r < 0.30) d.moveWin(b, ik);
  else if (r < 0.34) d.confWin(b, ik);
  else if (r < 0.39) d.openWin(b, ik, !iv.open);
  else if (r < 0.42) { if (!d.blinded.has(`${b}:${ik}`)) d.resetWin(b, ik); }
  else if (iv.widgetId !== W.SKETCH) d.type(b, ik);
}
// A stale tab: a widget there saves what it showed before the merge (its old content), or a change made on top of it;
// or a window or the page, as that tab showed them (its old place, name or color), or moved or renamed there.
function blind(d) {
  if (!d.linked || !d.link) return;   // (nor while its ledger is lost, before the round that rebuilds it: see loseLedger)
  const gone = new Set(d.settings.deletedBoards || []);   // (no tab shows a deleted page)
  // (still as a merge wrote it, and still the window or page the stale tab shows: window numbers are used again)
  const keys = Array.from(d.stale.keys()).filter(k => d.recs.has(k) && d.recs.get(k).m && !gone.has(+k.split(':')[1]) && d.unitsOf(k)[0] === d.stale.get(k).unit);
  if (!keys.length) return;
  const key = pick(keys), old = d.stale.get(key);
  d.stale.delete(key);
  const [kind, b, wg, n] = key.split(':');
  d.staleBase.set(key, old.rev); d.blindSince = true; d.blinded.add(`${b}:${wg}:${n}`).add(`${b}`);
  if (rnd() < 0.5) { d.put(key, kind, old.value, { base: old.rev, blind: true }); return; }
  if (kind === 'data') { const shown = token(old.value); if (shown) LOG.gone.add(shown); d.put(key, 'data', d.value(wg), { base: old.rev, was: old.value }); d.touchWin(+b, `${wg}:${n}`); }
  else if (kind === 'inst') {
    const v = clone(old.value); v.rect = { x: Math.round(rnd() * 1500) + (++LOG.n % 1000) / 1000, y: Math.round(rnd() * 800), w: 300 + Math.round(rnd() * 300), h: 200 + Math.round(rnd() * 300) }; v.copyOf = null;
    d.put(key, 'inst', v, { base: old.rev, was: old.value }); d.touchWin(+b, `${wg}:${n}`);
  } else {
    const v = clone(old.value);
    if (rnd() < 0.5) v.name = 'n' + (++LOG.n); else v.background = { color: '#' + (0x100000 + (++LOG.n)).toString(16).slice(-6), pattern: 'none' };
    d.put(key, 'board', v, { base: old.rev, was: old.value }); d.touch(v.uid);
  }
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

// (one case that fails or throws doesn't stop the others, nor the randomized run)
function block(f) { try { f(); } catch (err) { ok(false, 'a case threw: ' + (err && err.stack || err).toString().split('\n').slice(0, 3).join(' | ')); } }
function rules() {
  console.log('The rules table (§4.1)');
  block(() => {
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
  });
  block(() => {
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
  });
  block(() => {
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
  });
  block(() => {
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
  });
  block(() => {
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
  });
  block(() => {
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
  });
  block(() => {
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
  });
}

// The review's cases (CORE-1…6, CORR-2, CORR-6), one block each.
function review() {
  console.log('\nThe review’s cases');
  const ver = (by, vv, t) => [by, vv, t];
  block(() => {
    // CORE-1: the later device keeps typing after the other made the copy: no second copy of its own older text
    const { A, B, b, ik, sync } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    A.type(b, ik); const a1 = token(dataOf(A, uid, wid)); NOW += 1000; A.round();
    const bb = bOf(B, uid), bik = ikOf(B, uid, wid);
    B.type(bb, bik); NOW += 1000; B.round();
    A.deliver(B); A.round();                       // A, a1's author, keeps a1 as a copy
    B.type(bb, bik); NOW += 1000; B.round();       // B keeps typing before A's file arrives
    B.deliver(A); B.round(); A.deliver(B); A.round();
    NOW += 3 * MIN; sync(4);
    const copies = winsOf(A, uid).filter(w => w.copyOf);
    ok(copies.length === 1 && token(dataOf(A, uid, copies[0].wid)) === a1 && !A.pending() && !B.pending() && A.canon() === B.canon(),
      `a clash, then the device whose text stayed keeps typing: one copy, of the other device’s text (${copies.map(c => token(dataOf(A, uid, c.wid))).join(', ')})`);
  });
  for (const mode of ['same', 'new']) block(() => {
    // CORE-2: a stale tab saves twice within the race guard: once over the merge, once over the round's put-back
    const { A, B, b, ik, sync } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid, key = `data:${b}:${ik}`;
    B.type(bOf(B, uid), ikOf(B, uid, wid)); const tb = token(dataOf(B, uid, wid)); NOW += 1000;
    B.round(); A.deliver(B); A.round();
    const pre = A.stale.get(key);
    const w1 = A.put(key, 'data', pre.value, { base: pre.rev, blind: true }); NOW += 1000;
    A.round();
    const v2 = mode === 'same' ? pre.value : { text: 'tab2-typing' };
    if (mode !== 'same') LOG.typed.add('tab2-typing');
    A.put(key, 'data', v2, { base: w1.rev, blind: true }); NOW += 1000;   // (Raced: based on its own first save)
    A.round(); sync(4);
    const shown = winsOf(A, uid).map(w => token(dataOf(A, uid, w.wid)));
    ok(shown.includes(tb) && (mode === 'same' || shown.includes('tab2-typing')) && A.canon() === B.canon(),
      `a stale tab saving ${mode === 'same' ? 'its old text' : 'new text'} twice, the second time over the round’s put-back: the other device’s text is kept (${shown.join(', ')})`);
  });
  block(() => {
    // CORE-3: a stale tab's change to the page lands after two merges wrote its record (a rename, then a move)
    const { A, B, b, sync } = pair();
    const uid = A.boardOf(b).uid, key = `board:${b}`;
    A.addPage('Other'); sync(3);
    const before = clone(A.recs.get(key)), bb = bOf(B, uid);
    B.editPage(bb, 'name'); const newName = B.boardOf(bb).name; NOW += 1000; B.round(); A.deliver(B); A.round();
    const mv = clone(B.boardOf(bb)); mv.pos = (mv.pos || 0) + 50; B.put(`board:${bb}`, 'board', mv); B.patch({ order: B.orderNow() });   // (moved to the end)
    NOW += 1000; B.round(); A.deliver(B); A.round();
    ok(A.boardOf(b).pos === mv.pos && A.recs.get(key).rev > before.rev, '(two merges wrote the page’s record)');
    const v = clone(before.value); v.background = { color: '#123456', pattern: 'none' };
    A.put(key, 'board', v, { base: before.rev, blind: true }); NOW += 1000;
    A.round(); sync(4);
    ok(A.boardOf(b).name === newName && B.boardOf(bb).name === newName && A.boardOf(b).background.color === '#123456' && B.boardOf(bb).background.color === '#123456',
      `a stale tab’s color change after two merges wrote the page: the other device’s rename stays, and the color applies (${A.boardOf(b).name}, ${A.boardOf(b).background.color})`);
  });
  block(() => {
    // CORE-4: rescaling a page is never a move, however its places round
    const A = new Device('scale', { pages: false }); A.addPage('Big'); const b = A.ids()[0];
    A.folder = new Folder('Room 12'); A.view = new Map(); A.linkTo(A.folder);
    const r2 = v => Math.round(v * 100) / 100;
    for (let i = 0; i < 20; i++) { const k = A.addWindow(b, W.NOTES), iv = A.winVal(b, k); iv.rect = { x: r2(rnd() * 1800), y: r2(rnd() * 900), w: r2(200 + rnd() * 500), h: r2(150 + rnd() * 400) }; A.put(`inst:${b}:${k}`, 'inst', iv); }
    const setScale = s1 => { const v = clone(A.boardOf(b)), s0 = v.scale || 0.8; for (const r of A.insts(b)) { const iv = clone(r.value); iv.rect = H.scaleRect(iv.rect, s0 / s1); A.put(r.key, 'inst', iv, { rescale: true }); } v.scale = s1; v.layout = H.canvasFor(s1); A.put(`board:${b}`, 'board', v); };
    NOW += 1000; A.round();
    const versions = () => { const M = A.link.mines.get(A.boardOf(b).uid); return JSON.stringify(Object.values(M.w).map(w => w.p.rect.v)); };
    const v0 = versions(), scales = [0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    let moved = 0;
    for (let i = 0; i < 40; i++) { setScale(scales[i % scales.length]); if (i % 3) setScale(scales[(i * 7) % scales.length]); NOW += 1000; A.round(); if (versions() !== v0) moved++; }
    ok(!moved, `a page rescaled 60 times, sometimes twice between rounds: no window gets a new place version (${moved} rounds did)`);
  });
  block(() => {
    // CORE-4: a window moved on one device while the other rescales its page: the move lands
    const { A, B, b, ik, sync } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    const set = (d, k, f) => { const v = clone(d.recs.get(k).value); f(v); d.put(k, k.split(':')[0], v, { rescale: true }); };
    set(A, `board:${b}`, v => { v.scale = 0.67; v.layout = H.canvasFor(0.67); });
    set(A, `inst:${b}:${ik}`, v => { v.rect = { x: 246.9, y: 467.9, w: 330.19, h: 243.92 }; });
    NOW += 1000; sync(3);
    const bb = bOf(B, uid), bik = ikOf(B, uid, wid);
    B.put(`inst:${bb}:${bik}`, 'inst', Object.assign(B.winVal(bb, bik), { rect: { x: 600, y: 300, w: 330.19, h: 243.92 } })); NOW += 2000;
    set(A, `board:${b}`, v => { v.scale = 1.75; v.layout = H.canvasFor(1.75); });
    set(A, `inst:${b}:${ik}`, v => { v.rect = H.scaleRect(v.rect, 0.67 / 1.75); });
    NOW += 1000; sync(4);
    const ra = A.winVal(b, ik).rect, want = H.scaleRect({ x: 600, y: 300, w: 330.19, h: 243.92 }, 0.67 / 1.75);
    ok(Math.abs(ra.x - want.x) < 1 && Math.abs(ra.y - want.y) < 1, `a page rescaled on one device while the other moved a window on it: the move lands (${ra.x}, ${ra.y})`);
  });
  block(() => {
    // CORE-5: a version the plan makes (closing a second 21Sketch) never reuses a counter already published
    const { A, B, b } = pair();
    const uid = A.boardOf(b).uid;
    B.addWindow(bOf(B, uid), W.SKETCH); NOW += 1000; B.round();
    const k = A.addWindow(b, W.SKETCH), sk = A.winVal(b, k).wid; NOW += 1000; A.round();
    const fileOf = d => JSON.parse(d.folder.files.get(d.fileName()));
    const verOf = f => { for (const p of [f].concat((f.pages || []).filter(x => !x.main))) for (const i of p.instances || []) if (i.wid === sk) return { open: i.open, vv: JSON.stringify(i.v.open[1]) }; return null; };
    const before = verOf(fileOf(A));
    NOW += 1000; A.deliver(B); A.round();
    const after = verOf(fileOf(A));
    ok(before && after && before.open && !after.open && before.vv !== after.vv, `a window the plan closes gets a version of its own, not the stamp’s counter (${before && before.vv} → ${after && after.vv})`);
  });
  block(() => {
    // CORE-6: includes() never calls a file included when merging it would bring a deleted page back
    const uid = 'page00000001', wid = 'notes@100', a = 'aaaaaaaaaaaa';
    const L = Merge.ledger({ v: 1, dev: a, peers: {} }, [{ uid, b: 1, p: {}, w: {}, hist: { at: 0, local: false }, quiet: null, wgone: {},
      gone: { exists: ver(a, { [a]: 9 }, 9), cover: { name: { [a]: 1 }, look: { [a]: 1 }, size: { [a]: 1 }, pos: { [a]: 1 }, [`${wid}/exists`]: { [a]: 1 }, [`${wid}/rect`]: { [a]: 1 },
        [`${wid}/open`]: { [a]: 1 }, [`${wid}/data`]: { [a]: 2 }, [`${wid}/conf`]: { [a]: 1 }, [`${wid}/label`]: { [a]: 1 } }, seq: 5, seen: 0 } }]);
    const v1 = ver(a, { [a]: 1 }, 1);
    const file = (pending, exists) => ({ format: '21board', formatVersion: 1, kind: 'full',
      board: { name: 'P', background: { color: null, pattern: 'none' }, scale: 0.8, shape: '16:9', uid, pos: 1, v: { exists: v1, name: v1, look: v1, size: v1, pos: v1 } },
      instances: [{ widgetId: 'notes', instance: 1, wid, open: true, maximized: false, z: 1, rect: { x: 1, y: 1, w: 300, h: 200 }, createdAt: 100, data: { text: 'a2' },
        v: { exists: exists || v1, rect: v1, open: v1, data: ver(a, { [a]: 2 }, 2) }, pending: pending ? { data: [{ v: ver('cccccccccccc', { cccccccccccc: 3 }, 3), val: { text: 'only in this file' } }] } : undefined }],
      sync: { v: 1, dev: 'bbbbbbbbbbbb', folder: 'f', name: 'the board', seq: 7, write: 'w', at: 7, merged: {}, gone: { pages: [], windows: [] }, left: { at: 1 }, sum: '' } });
    const verdict = f => { const peer = Merge.decode(f, H).peer; return [Merge.shown(Merge.join(L, [peer], { dev: a, now: 10 })).pages.has(uid), Merge.includes(L, peer)]; };
    const [back1, inc1] = verdict(file(true)), [back2, inc2] = verdict(file(false, ver('cccccccccccc', { cccccccccccc: 1 }, 1))), [back3, inc3] = verdict(file(false));
    ok(back1 && !inc1 && back2 && !inc2 && !back3 && inc3, `a file with a pending version, or a window version, that the deletion didn’t cover isn’t “included”; one within it is (${[back1, inc1, back2, inc2, back3, inc3]})`);
  });
  block(() => {
    // CORR-6: a device that never synced joins with an old copy of a page and a window the folder deleted
    const { A, b, ik, sync, folder } = pair(1);
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    const b2 = A.addPage('Week 0'), k2 = A.addWindow(b2, W.NOTES), uid2 = A.boardOf(b2).uid; sync();
    const C = new Device('cart');   // (it imported both pages before they were deleted)
    for (const [pb, pk] of [[b, ik], [b2, k2]]) {
      const cb = C.nextB(); C.put(`board:${cb}`, 'board', Object.assign(clone(A.boardOf(pb)), { id: cb }));
      C.put(`inst:${cb}:${pk}`, 'inst', clone(A.winVal(pb, pk))); C.put(`data:${cb}:${pk}`, 'data', clone(A.recs.get(`data:${pb}:${pk}`).value));
    }
    C.patch({ set: { boards: C.ids() } });
    A.delWin(b, ik); NOW += 1000; A.round();
    A.delPage(b2); NOW += UNDO + 5000; A.round(); A.round();
    C.view = new Map(folder.files); C.folder = folder; C.linkTo(folder); C.round();
    A.deliver(C); A.round(); NOW += 3 * MIN; C.deliver(A); C.round(); A.deliver(C); A.round();
    ok(!winsOf(A, uid).some(w => w.wid === wid) && !bOf(A, uid2) && !winsOf(C, uid).some(w => w.wid === wid) && !bOf(C, uid2),
      'a device joining with an old copy of a window and a page the folder deleted: both stay deleted, there and everywhere');
    // (the same, with that page shown on the joining device, and its windows given new ids by the import)
    const D = new Device('desk');
    const db2 = D.nextB(); D.put(`board:${db2}`, 'board', Object.assign(clone(A.recs.get(`board:${b}`) ? { name: 'x' } : {}), { id: db2, name: 'Week 0', background: { color: null, pattern: 'none' }, scale: 0.8, shape: '16:9', uid: uid2, pos: 9 }));
    const dk = 'notes:1'; D.put(`inst:${db2}:${dk}`, 'inst', { widgetId: 'notes', n: 1, open: true, rect: { x: 5, y: 5, w: 300, h: 200 }, z: 1, createdAt: 77, wid: 'notes@77' }); D.put(`data:${db2}:${dk}`, 'data', { text: 'old week 0' }); LOG.typed.add('old week 0'); LOG.gone.add('old week 0');
    D.patch({ set: { boards: D.ids(), activeBoard: db2 } });
    D.view = new Map(folder.files); D.folder = folder; D.linkTo(folder);
    for (let i = 0; i < 3; i++) { D.round(); A.deliver(D); A.round(); C.deliver(D); C.round(); D.deliver(A); D.deliver(C); NOW += MIN; }
    ok(!bOf(A, uid2) && !bOf(C, uid2) && !bOf(D, uid2), `and with that page shown on the joining device, its windows imported under new ids: still deleted everywhere (${[A, C, D].map(d => !!bOf(d, uid2))})`);
  });
  block(() => {
    // CORR-2: Change… to a folder with a board: the second round stamps, and this device's old page goes there only
    const { A, B, b, sync, folder } = pair();
    const other = new Folder('Room 14'), D = new Device('desk', { pages: false });
    D.addPage('Room 14 page'); const db = D.ids()[0]; D.addWindow(db, W.NOTES); D.patch({ set: { activeBoard: db } });
    D.folder = other; D.view = new Map(); D.linkTo(other); D.round();
    D.view = new Map(folder.files); D.linkTo(folder);   // (take: its page was shown; the round goes to another page first)
    const ub = A.boardOf(b).uid, mb = bOf(D, ub);
    const nk = D.addWindow(mb, W.NOTES), nt = token(dataOf(D, ub, D.winVal(mb, nk).wid));
    const gone = winsOf(D, ub).find(w => w.wid !== D.winVal(mb, nk).wid); D.delWin(mb, `${gone.widgetId}:${gone.n}`);
    NOW += 1000; D.round(); A.deliver(D); B.deliver(D); sync(3);
    ok(token(dataOf(A, ub, D.winVal(mb, nk).wid)) === nt && !winsOf(A, ub).some(w => w.wid === gone.wid) && !A.ids().some(x => A.boardOf(x).name === 'Room 14 page'),
      'Change… to a folder with a board, then a window opened and one deleted right away: both reach the other devices, and the old page doesn’t');
    ok(!D.ids().some(x => D.boardOf(x).name === 'Room 14 page'), 'and the old page is gone here (it is still in the other folder)');
  });
  block(() => {
    // FIN-2: a round that brings only a copy made on the other device names that device (Board history's "Before
    // changes from …", the quiet note of a page not shown)
    const { A, B, b, ik } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    A.type(b, ik); NOW += 1000; A.round();
    B.type(bOf(B, uid), ikOf(B, uid, wid)); NOW += 1000; B.round();
    A.deliver(B); A.round();                     // the laptop's text lost: the laptop, its author, makes the copy
    NOW += 1000; B.deliver(A); const p = B.round();
    const P = p && p.summary.pages[uid];
    ok(P && P.clashes.some(c => c.arrived) && winsOf(B, uid).some(w => w.copyOf), 'the copy made on the laptop arrives on the smartboard');
    ok(P && P.from.includes(A.dev) && p.summary.from.includes(A.dev), `and the round names the laptop as where it came from (${P && JSON.stringify(P.from)}; ${JSON.stringify(p && p.summary.from)})`);
  });
  block(() => {
    // FIN-3: a page deleted here comes back. Brought back on the other device (its Undo, Bring back): 'returned'; by an
    // edit made there before the deletion arrived: 'edit'.
    const { A, B, b, ik, sync } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    A.addPage('Other'); sync();
    const bB = () => +Array.from(B.recs.keys()).find(k => k.startsWith('board:') && B.recs.get(k).value.uid === uid).split(':')[1];
    for (const purged of [false, true]) {
      // (a deletion goes out once its Undo is over here; the page's records go 3 s later)
      A.delPage(bOf(A, uid)); NOW += UNDO + 500; A.round(); B.deliver(A); B.round(); B.round();
      ok(!bOf(B, uid) && B.undoDel(bB()), 'deleted on the laptop, then its Undo on the smartboard');
      NOW += 500; B.round(); A.deliver(B);
      if (purged) NOW += 5000;                   // (the page's records are gone on the laptop by then)
      const p = A.round(), P = p && p.summary.pages[uid];
      ok(bOf(A, uid) && P && P.back === 'returned', `the laptop gets it back, as brought back on the smartboard${purged ? ' (gone here already)' : ' (its Undo still offered here)'} (${P && P.back})`);
      sync();
    }
    A.delPage(bOf(A, uid)); NOW += UNDO + 5000; A.round();
    B.type(bOf(B, uid), ikOf(B, uid, wid)); NOW += 1000; B.round(); A.deliver(B);
    const p = A.round(), P = p && p.summary.pages[uid];
    ok(bOf(A, uid) && P && P.back === 'edit', `deleted on the laptop and edited on the smartboard before the deletion arrived: back, as an edit (${P && P.back})`);
  });
  // (found by the runs where several devices set up one folder at once; 2026.11.16-3 had them too)
  for (const what of ['name', 'text', 'place', 'name, after two merges']) block(() => {
    // the smartboard goes to an empty folder with its board (the same page and window) and works there, then uses
    // Change… to come back (a take). Just after the take writes a record, a tab that hadn't seen it (or a widget saving
    // within LINK_RACE_MS) saves what it showed in the other folder: an old value, not a change, so the folder's stays
    const { A, B, b, ik, sync, folder } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid, part = what.split(',')[0];
    const keyOf = d => { const bb = bOf(d, uid), k = ikOf(d, uid, wid); return part === 'name' ? `board:${bb}` : `${part === 'text' ? 'data' : 'inst'}:${bb}:${k}`; };
    const edit = (d, val) => {
      const key = keyOf(d), r = d.recs.get(key), v = clone(r.value);
      if (part === 'name') v.name = val; else if (part === 'text') v.text = val; else v.rect = Object.assign({}, v.rect, { x: val });
      d.put(key, r.type, v);
    };
    const shown = d => { const v = d.recs.get(keyOf(d)).value; return part === 'name' ? v.name : part === 'text' ? v.text : v.rect.x; };
    const want = part === 'place' ? 12 : `Room 12 ${part}`, other = new Folder('Room 14');
    B.farewell(); B.linkTo(other); NOW += MIN; edit(B, part === 'place' ? 14 : `Room 14 ${part}`); B.round();
    NOW += MIN; edit(A, want); A.round();
    NOW += DAY; B.farewell(); B.view = new Map(folder.files);
    const key = keyOf(B), old = clone(B.recs.get(key));
    B.linkTo(folder);
    ok(shown(B) === want, `(the take shows the folder's ${part} on the smartboard: ${shown(B)})`);
    let last = want;
    if (what !== part) { NOW += 1000; edit(A, last = `${want}, again`); A.round(); B.deliver(A); B.round(); }   // (a second merge writes it before the save lands)
    NOW += 1000; B.put(key, old.type, old.value, { base: old.rev, blind: true });   // (based on the revision before the take's write)
    sync();
    ok([A, B].every(d => shown(d) === last && winsOf(d, uid).length === 1), `a ${part} saved by a tab that showed the other folder, just after Change… back${what !== part ? ' and a second merge' : ''}, is put back: ${last} on both, and no copy (${[A, B].map(d => `${shown(d)}, ${winsOf(d, uid).length} window${winsOf(d, uid).length === 1 ? '' : 's'}`).join(' / ')})`);
  });
  block(() => {
    // a page deleted on the laptop comes back with the smartboard's text (typed at the same time as the laptop's),
    // and the laptop then deletes a window on it. Its own earlier text, still in the home computer's file, doesn't bring
    // the window back: the laptop had seen it.
    const { A, B, C, b, ik, sync } = pair(3);
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    A.addPage('Other'); sync();
    B.type(bOf(B, uid), ikOf(B, uid, wid)); NOW += 1000; B.round();
    A.type(b, ik); const ta = token(dataOf(A, uid, wid)); NOW += 1000; A.round();   // (the later: the laptop's text shows)
    A.deliver(B); A.round(); C.deliver(A); C.round();     // the home computer has the laptop's text; the smartboard doesn't yet
    A.delPage(bOf(A, uid)); NOW += UNDO + 500; A.round(); NOW += 5000; A.round();
    ok(bOf(A, uid) && token(dataOf(A, uid, wid)) !== ta, `(the page comes back on the laptop, the smartboard's text not seen there yet: ${token(dataOf(A, uid, wid))})`);
    const bb = bOf(A, uid); A.delWin(bb, ikOf(A, uid, wid)); NOW += 1000; A.round();
    A.deliver(C); A.round(); sync(4);
    ok([A, B, C].every(d => !winsOf(d, uid).some(w => w.wid === wid)), `then the laptop deletes the window: it stays deleted on all three, though the home computer’s file still had the laptop’s own earlier ${ta} (${[A, B, C].map(d => winsOf(d, uid).some(w => w.wid === wid) ? 'back' : 'gone').join(', ')})`);
  });
  block(() => {
    // Change… back to the first folder (a take) while showing a page deleted there, with a window deleted there
    // before it. An edit made here to the page brings it back, but not that window.
    const { A, B, b, ik, sync, folder } = pair();
    const uid = A.boardOf(b).uid, w1 = A.winVal(b, ik).wid, ik2 = A.addWindow(b, W.NOTES), w2 = A.winVal(b, ik2).wid;
    A.addPage('Other'); A.patch({ set: { activeBoard: b } }); NOW += 1000; sync();
    const other = new Folder('Room 14');
    A.farewell(); A.linkTo(other); NOW += 60000;
    const bb = bOf(B, uid); B.delWin(bb, ikOf(B, uid, w2)); NOW += 1000; B.round();
    B.delPage(bb); NOW += UNDO + 500; B.round(); NOW += 5000; B.round();
    A.farewell(); A.view = new Map(folder.files); A.linkTo(folder);
    ok(bOf(A, uid) && A.lastSum && A.lastSum.leave === uid, `(the take keeps the page shown on the laptop, deleted in the folder: ${A.lastSum && A.lastSum.leave === uid})`);
    A.addWindow(bOf(A, uid), W.NOTES); NOW += 1000; A.round(); sync(4);
    ok([A, B].every(d => bOf(d, uid) && winsOf(d, uid).some(w => w.wid === w1) && !winsOf(d, uid).some(w => w.wid === w2)),
      `a window added to it there brings the page back on both, with its other window, but not the one deleted in the folder (${[A, B].map(d => winsOf(d, uid).map(w => w.wid === w2 ? 'w2' : w.wid === w1 ? 'w1' : 'new').join('+')).join(' / ')})`);
  });
  block(() => {
    // a page deleted, then Change… to another folder before its Undo is over: the folder left still hears of it
    // (Link.farewell's round stamps it, as readLocal(leaving) does here)
    const { A, B, b, sync, folder } = pair();
    const uid = A.boardOf(b).uid;
    A.addPage('Other'); sync();
    A.delPage(b); NOW += 3000;
    A.farewell(); A.linkTo(new Folder('Room 14')); NOW += UNDO + 5000;
    B.deliver(A); B.round(); sync();
    ok(!bOf(B, uid), `the smartboard deletes it too (${bOf(B, uid) ? 'still there' : 'deleted'})`);
    A.farewell(); A.view = new Map(folder.files); A.linkTo(folder); sync();
    ok(!bOf(A, uid) && !bOf(B, uid), `and it doesn’t come back when the laptop switches back (${[A, B].map(d => (bOf(d, uid) ? 'back' : 'gone')).join(', ')})`);
  });
  block(() => {
    // the same with Unlink. Its Undo, tapped after Unlink, brings it back here, and linking the folder again brings it
    // back on the other devices too, as brought back on this one
    const { A, B, b, sync, folder } = pair();
    const uid = A.boardOf(b).uid;
    A.addPage('Other'); sync();
    A.delPage(b); NOW += 3000;
    A.unlink(); B.deliver(A); B.round(); B.round();   // (the page shown there is left first)
    ok(!bOf(B, uid), `the smartboard deletes it too (${bOf(B, uid) ? 'still there' : 'deleted'})`);
    ok(A.undoDel(b) && bOf(A, uid), '(its Undo, after Unlink, brings it back on the laptop)');
    NOW += UNDO + 5000; B.round();
    A.view = new Map(folder.files); A.linkTo(folder); B.deliver(A);
    const p = B.round(), P = p && p.summary.pages[uid];
    sync();
    ok(bOf(A, uid) && bOf(B, uid) && P && P.back === 'returned', `linked again, it is back on the smartboard, as brought back on the laptop (${P && P.back}; ${[A, B].map(d => (bOf(d, uid) ? 'there' : 'gone')).join(', ')})`);
  });
  for (const how of ['take', 'carry']) for (const via of ['Board history', 'Undo']) block(() => {
    // a window's text emptied on the smartboard (Reset) reaches the laptop, by a take after Change… back or by an
    // ordinary merge; the laptop puts the text back: Board history's Put back two minutes later (Writer.put, based on
    // the revision the merge deleted, Raced.gone), or the merge toast's Undo 3 s later (MergeUI.undo: based on Known, 1).
    // A change made after seeing the deletion, not a stale tab's save: it stays
    const { A, B, b, ik, sync, folder } = pair();
    const uid = A.boardOf(b).uid, wid = A.winVal(b, ik).wid;
    A.type(b, ik); const t1 = token(dataOf(A, uid, wid)); NOW += 1000; sync();
    if (how === 'take') { A.farewell(); A.linkTo(new Folder('Room 14')); NOW += 60000; }
    B.resetWin(bOf(B, uid), ikOf(B, uid, wid)); NOW += 1000; B.round();
    if (how === 'take') { NOW += 60000; A.farewell(); A.view = new Map(folder.files); A.linkTo(folder); } else { A.deliver(B); A.round(); }
    const key = `data:${bOf(A, uid)}:${ikOf(A, uid, wid)}`;
    ok(!A.recs.has(key), `[${how}, ${via}] (the laptop's window is empty now: ${JSON.stringify(dataOf(A, uid, wid))})`);
    if (via === 'Undo') { NOW += 3000; A.put(key, 'data', { text: t1 }, { base: 1, u: true }); } else { NOW += 120000; A.put(key, 'data', { text: t1 }); }
    NOW += 1000; A.round(); sync(4);
    ok([A, B].every(d => token(dataOf(d, uid, wid)) === t1), `[${how}] the text put back with ${via} after a merge emptied the window stays, on both (${[A, B].map(d => JSON.stringify(token(dataOf(d, uid, wid)))).join(' / ')})`);
  });
  for (const how of ['Change… back', 'no Change…']) block(() => {
    // the smartboard deletes a window on a page, then the page. The laptop (in another folder, or asleep) gets both in
    // one round, which deletes the page there; its Undo, tapped within 20 s, brings the page back on both, but not the
    // window the smartboard had deleted first (keepW, noted when the round deletes the page)
    const { A, B, b, ik, sync, folder } = pair();
    const uid = A.boardOf(b).uid, w1 = A.winVal(b, ik).wid, ik2 = A.addWindow(b, W.NOTES), w2 = A.winVal(b, ik2).wid;
    const bo = A.addPage('Other'); A.patch({ set: { activeBoard: how === 'no Change…' ? bo : b } }); NOW += 1000; sync();
    if (how === 'Change… back') { A.farewell(); A.linkTo(new Folder('Room 14')); NOW += 60000; }
    const bb = bOf(B, uid); B.delWin(bb, ikOf(B, uid, w2)); NOW += 1000; B.round();
    B.delPage(bb); NOW += UNDO + 500; B.round(); NOW += 5000; B.round();
    const bA = bOf(A, uid);
    if (how === 'Change… back') { A.farewell(); A.view = new Map(folder.files); A.linkTo(folder); NOW += 1000; } else A.deliver(B);   // (the take keeps the page shown, and Link leaves it at once)
    const p = A.round(), P = p && p.summary.pages[uid];
    ok(P && P.deleted && !bOf(A, uid), `[${how}] (the laptop's round deletes the page there: ${JSON.stringify(P && { deleted: P.deleted, from: P.from })})`);
    NOW += 3000;
    ok(A.undoDel(bA) && bOf(A, uid) && winsOf(A, uid).some(w => w.wid === w2), `[${how}] (its Undo brings it back on the laptop, with both windows as it had them)`);
    NOW += 1000; A.round(); sync(4);
    ok([A, B].every(d => bOf(d, uid) && winsOf(d, uid).some(w => w.wid === w1) && !winsOf(d, uid).some(w => w.wid === w2)),
      `[${how}] the page’s Undo brings it back on both with its other window, but not the window the smartboard deleted first (${[A, B].map(d => winsOf(d, uid).map(w => w.wid === w2 ? 'w2' : w.wid === w1 ? 'w1' : 'new').join('+') || 'no page').join(' / ')})`);
  });
  block(() => {
    // as keepW's case above, but the page is the laptop's only one after the take, so it stays shown, and is edited
    // only after 31 days: Merge.gc, which keeps the page's tombstone (keep), keeps its windows' kept by keepW too
    const { A, B, b, ik, sync, folder } = pair();
    const uid = A.boardOf(b).uid, w1 = A.winVal(b, ik).wid, ik2 = A.addWindow(b, W.NOTES), w2 = A.winVal(b, ik2).wid;
    NOW += 1000; sync();
    A.farewell(); A.linkTo(new Folder('Room 14')); NOW += 60000;
    const bb = bOf(B, uid); B.delWin(bb, ikOf(B, uid, w2)); NOW += 1000; B.round();
    B.delPage(bb); NOW += UNDO + 500; B.round(); NOW += 5000; B.round();
    A.leave = function () {};   // (Link: no other page to show)
    A.farewell(); A.view = new Map(folder.files); A.linkTo(folder);
    ok(bOf(A, uid) && A.ids().length === 1, `(the take keeps the laptop's only page shown: ${A.ids().map(x => A.boardOf(x).name).join(', ')})`);
    for (let d = 0; d < 31; d += 5) { NOW += 5 * DAY; sync(1); }
    A.addWindow(bOf(A, uid), W.NOTES); NOW += 1000; A.round(); sync(4);
    ok([A, B].every(d => bOf(d, uid) && winsOf(d, uid).some(w => w.wid === w1) && !winsOf(d, uid).some(w => w.wid === w2)),
      `a window added to it 31 days later brings the page back on both, but not the window deleted in the folder (${[A, B].map(d => winsOf(d, uid).map(w => w.wid === w2 ? 'w2' : w.wid === w1 ? 'w1' : 'new').join('+') || 'no page').join(' / ')})`);
  });
}

// Theme and accent color: the board's, on every device linked to the folder (Tyler's decision 5: synced like
// everything else), the later change winning as for a page's name. One block each.
function styles() {
  console.log('\nTheme and accent color (§4.6)');
  const fileOf = d => JSON.parse(d.folder.files.get(d.fileName()));
  const resum = o => { o.sync.sum = ''; o.sync.sum = crypto.createHash('sha256').update(Merge.sumText(o)).digest('hex').slice(0, 32); return JSON.stringify(o); };
  block(() => {
    const { A, B, sync } = pair();
    ok(A.styleNow() === 'system blue' && B.styleNow() === 'system blue', '(both start with Auto and Blue)');
    A.setStyle({ theme: 'dark', accent: 'green' }); NOW += 2000; A.round(); B.deliver(A);
    const plan = B.round();
    ok(B.styleNow() === 'dark green', `the theme and accent changed on the laptop: the smartboard takes them at its next round (${B.styleNow()})`);
    ok(plan && same(plan.summary.style, [{ by: A.dev, theme: 'dark', accent: 'green' }]), `and its summary says which device changed what (${plan && JSON.stringify(plan.summary.style)})`);
    sync();
    ok(A.styleNow() === 'dark green' && B.styleNow() === 'dark green' && A.canon() === B.canon(), 'both show them, and nothing changes back');
    const quiet = B.round();
    ok(quiet && same(quiet.summary.style, []), 'a round with nothing new says nothing about them');
    B.setStyle({ theme: 'system' }); NOW += 2000; sync();
    ok(A.styleNow() === 'system green' && B.styleNow() === 'system green', `then Auto chosen on the smartboard reaches the laptop, and the accent stays (${A.styleNow()})`);
    const f = fileOf(A);
    ok(f.theme === 'system' && f.accent === 'green' && f.sync.style && f.sync.style.theme[0] === B.dev && f.sync.style.accent[0] === A.dev,
      `a device file has them as any export does, and their versions in sync.style (${JSON.stringify(f.sync.style)})`);
  });
  block(() => {
    // the same version, its vector's devices in another order in another device's file (two or more devices that set
    // up one folder at once join their first versions in different orders): nobody writes again for it
    const { A, B, sync } = pair();
    A.setStyle({ accent: 'green' }); NOW += 2000; sync();
    const o = fileOf(B), v = o.sync.style.accent;
    v[1] = Object.fromEntries(Object.entries(v[1]).concat([[B.dev, 1]]).reverse());   // (B's default, joined in, first)
    B.folder.write(B.fileName(), resum(o)); A.deliver(B); A.round(); B.deliver(A); B.round();
    const v2 = clone(v); v2[1] = Object.fromEntries(Object.entries(v2[1]).reverse());
    const o2 = fileOf(B); o2.sync.style.accent = v2; B.folder.write(B.fileName(), resum(o2));
    const w1 = A.folder.revs.get(A.fileName()).length; A.deliver(B); A.round(); A.deliver(B); A.round();
    ok(A.folder.revs.get(A.fileName()).length === w1, `a version whose vector lists the devices in another order is the same version: no new write (${A.folder.revs.get(A.fileName()).length - w1} more)`);
  });
  for (const first of ['earlier', 'later']) block(() => {
    // changed on both before either has the other's: the later change, on both, whichever round runs first
    const { A, B, sync } = pair();
    A.setStyle({ theme: 'dark' }); NOW += 5000; B.setStyle({ theme: 'light' }); NOW += 1000;
    const [x, y] = first === 'earlier' ? [A, B] : [B, A];
    x.round(); y.deliver(x); y.round(); x.deliver(y); x.round(); sync();
    ok(A.styleNow() === 'light blue' && B.styleNow() === 'light blue', `the theme changed on both, the ${first} change’s round first: the later change on both (${A.styleNow()} / ${B.styleNow()})`);
  });
  block(() => {
    // made apart: one while unlinked, stamped when linked again together with a later page change; the later wins
    const { A, B, sync, folder } = pair();
    B.unlink(); NOW += 1000;
    B.setStyle({ accent: 'pink' }); NOW += 60000;
    A.setStyle({ accent: 'teal' }); NOW += 1000; A.round();
    NOW += 60000; B.addPage('After both'); NOW += 1000;   // (a change later than both, stamped with B's accent when it links again)
    B.view = new Map(folder.files); B.linkTo(folder); sync();
    ok(A.styleNow() === 'system teal' && B.styleNow() === 'system teal', `an accent chosen while unlinked, then one on the other device: the later wins on both, though the first was stamped with a later change (${A.styleNow()} / ${B.styleNow()})`);
    B.unlink(); NOW += 1000;
    A.setStyle({ accent: 'green' }); NOW += 1000; A.round(); NOW += 60000;
    B.setStyle({ accent: 'red' }); NOW += 1000;
    B.view = new Map(folder.files); B.linkTo(folder); sync();
    ok(A.styleNow() === 'system red' && B.styleNow() === 'system red', `and the other way round: the one chosen while unlinked is the later, and wins on both (${A.styleNow()} / ${B.styleNow()})`);
  });
  block(() => {
    // a device that never changed them never overwrites: its own before it joined, or a value it only received
    const { A, B, folder } = pair();
    A.setStyle({ theme: 'dark' });
    const C = new Device('cart'); C.setStyle({ theme: 'light', accent: 'pink' }); C.addPage('Mine');   // (chosen before it ever synced)
    const D = new Device('desk'); D.setStyle({ accent: 'teal' });   // (only the untouched first page: a take)
    const all = [A, B, C, D], each = () => { for (let k = 0; k < 3; k++) { for (const d of all) { if (!d.linked) continue; for (const o of all) if (o !== d && o.linked) d.deliver(o); d.round(); } NOW += MIN; } };
    each();
    C.view = new Map(folder.files); C.folder = folder; C.linkTo(folder);
    D.view = new Map(folder.files); D.folder = folder; D.linkTo(folder);
    each();
    ok(C.mode === null && D.mode === null && all.every(d => d.styleNow() === 'dark blue'), `a device joining (pages of its own) and one taking (only its first page) show the folder’s theme and accent, and change nobody’s (${all.map(d => d.styleNow()).join(', ')})`);
    ok(same(C.sums[0].style, []) && same(D.sums[0].style, []), `and say nothing about them: nobody has just changed them (${JSON.stringify([C.sums[0].style, D.sums[0].style])})`);
    ok(!!bOf(A, C.boardOf(C.ids().find(x => C.boardOf(x).name === 'Mine')).uid), '(the joining device’s own page was added)');
    for (let i = 0; i < 4; i++) { B.addPage(); NOW += 1000; each(); }
    const v = B.link.sync.style || {};
    ok(v.theme && v.theme.v[0] === A.dev && v.accent && v.accent.v[0] === A.dev && fileOf(B).sync.style.theme[0] === A.dev,
      'a device that only received them makes no version of its own, however many rounds it runs');
  });
  block(() => {
    // an empty folder: this device's go there; a device set up after it takes them
    const D = new Device('desk', { pages: false }); D.addPage('Home'); D.setStyle({ theme: 'dark', accent: 'teal' });
    const f = new Folder('Room 9'); D.folder = f; D.view = new Map(); D.linkTo(f);
    const o = fileOf(D);
    ok(o.theme === 'dark' && o.accent === 'teal' && o.sync.style.theme[0] === D.dev && o.sync.style.accent[0] === D.dev, 'an empty folder (seed): this device’s theme and accent go there');
    const E = new Device('wall', { pages: false }); E.addPage('Wall page'); E.setStyle({ theme: 'light' });
    E.view = new Map(f.files); E.folder = f; E.linkTo(f); E.round(); D.deliver(E); D.round();
    ok(E.styleNow() === 'dark teal' && D.styleNow() === 'dark teal', `and a device set up there after it takes them (${E.styleNow()})`);
  });
  for (const first of ['laptop', 'smartboard']) block(() => {
    // two devices set up one empty folder at once, neither having the other's file yet, so each sends its board there:
    // only the laptop ever chose a theme and accent (the smartboard, started a day later, has the defaults, and its
    // settings changed since the laptop chose). The chooser's win on both, and nobody is told otherwise.
    rnd = seeded(42); NOW = Date.UTC(2026, 10, 2, 13); uidN = 0; LOG = newLog(); LOG.n = 0; PHOTOS.clear();
    const f = new Folder('Room 5'), A = new Device('laptop');
    A.addWindow(A.ids()[0], W.NOTES); A.setStyle({ theme: 'dark', accent: 'green' });
    NOW += DAY;
    const B = new Device('board'); B.addPage('Smartboard page');
    const [x, y] = first === 'laptop' ? [A, B] : [B, A];
    x.linkTo(f, { atOnce: true }); NOW += 1000; y.linkTo(f, { atOnce: true });
    const each = () => { for (let k = 0; k < 3; k++) { for (const d of [A, B]) { for (const o of [A, B]) if (o !== d) d.deliver(o); d.round(); } NOW += MIN; } };
    each();
    ok(A.linkedAs === 'seed' && B.linkedAs === 'seed' && A.styleNow() === 'dark green' && B.styleNow() === 'dark green',
      `two devices set up one empty folder at once (the ${first} first), and only the laptop had chosen a theme and accent: the laptop’s on both (${A.styleNow()} / ${B.styleNow()})`);
    ok(A.sums.every(sm => !sm.style.length), `and the laptop isn’t told the smartboard changed them (${JSON.stringify(A.sums.map(sm => sm.style))})`);
    B.setStyle({ theme: 'light' }); NOW += 1000; each();
    ok(A.styleNow() === 'light green' && B.styleNow() === 'light green', `once the smartboard chooses one, it is a change like any other (${A.styleNow()} / ${B.styleNow()})`);
  });
  block(() => {
    // the same, neither having chosen one (the laptop's theme from before 2026.11.16-4, with no time it was chosen):
    // the same on both
    rnd = seeded(42); NOW = Date.UTC(2026, 10, 2, 13); uidN = 0; LOG = newLog(); LOG.n = 0; PHOTOS.clear();
    const f = new Folder('Room 6'), A = new Device('laptop'); A.patch({ set: { theme: 'dark' } }); NOW += DAY;
    const B = new Device('board'); B.addPage('Smartboard page');
    A.linkTo(f, { atOnce: true }); NOW += 1000; B.linkTo(f, { atOnce: true });
    for (let k = 0; k < 3; k++) { for (const d of [A, B]) { for (const o of [A, B]) if (o !== d) d.deliver(o); d.round(); } NOW += MIN; }
    ok(A.styleNow() === B.styleNow(), `two set up at once and neither chose one: the same on both (${A.styleNow()} / ${B.styleNow()})`);
  });
  for (const first of ['laptop', 'smartboard']) block(() => {
    // the same, the laptop coming from another folder (Change…) where it was in use for days: its counters carry on
    // from there, but its choice is as old as it is, so the smartboard's later one wins on both
    rnd = seeded(42); NOW = Date.UTC(2026, 10, 2, 13); uidN = 0; LOG = newLog(); LOG.n = 0; PHOTOS.clear();
    const X = new Folder('Room 3'), Y = new Folder('Room 4'), A = new Device('laptop'), B = new Device('board');
    A.addWindow(A.ids()[0], W.NOTES); A.setStyle({ theme: 'dark' });   // (day 0)
    A.linkTo(X);
    for (let i = 1; i <= 10; i++) { NOW += DAY; A.addPage('Day ' + i); A.round(); if (i === 5) B.setStyle({ theme: 'light' }); }
    B.addPage('Smartboard page'); NOW += 1000; A.round('send');
    const [x, y] = first === 'laptop' ? [A, B] : [B, A];
    x.linkTo(Y, { atOnce: true }); NOW += 1000; y.linkTo(Y, { atOnce: true });
    for (let k = 0; k < 3; k++) { for (const d of [A, B]) { for (const o of [A, B]) if (o !== d) d.deliver(o); d.round(); } NOW += MIN; }
    ok(A.linkedAs === 'seed' && B.linkedAs === 'seed' && A.styleNow() === 'light blue' && B.styleNow() === 'light blue' && B.sums.every(sm => !sm.style.length),
      `two set up an empty folder at once (the ${first} first), the laptop coming from another folder: the smartboard’s Light, chosen 5 days after the laptop’s Dark, on both, and the smartboard isn’t told otherwise (${A.styleNow()} / ${B.styleNow()}; the laptop’s version ${JSON.stringify(((A.link.sync.style || {}).theme || {}).v)})`);
  });
  block(() => {
    // Change… to a folder with another board: that board's theme and accent apply here, and nothing there changes
    const { A, B, sync, folder } = pair();
    A.setStyle({ theme: 'light', accent: 'red' }); sync();
    const other = new Folder('Room 14'), D = new Device('desk', { pages: false }); D.addPage('Room 14 page'); D.setStyle({ theme: 'dark', accent: 'teal' });
    D.folder = other; D.view = new Map(); D.linkTo(other); D.round();
    D.round('send'); D.view = new Map(folder.files); D.linkTo(folder); D.round();
    A.deliver(D); A.round(); B.deliver(D); B.round(); sync();
    ok([A, B, D].every(d => d.styleNow() === 'light red'), `switching to a folder with another board: its theme and accent here, and the others keep theirs (${[A, B, D].map(d => d.styleNow()).join(', ')})`);
  });
  block(() => {
    // a device file from 2026.11.16-3 (no sync.style): read without error, and nothing about the theme changes
    const { A, B, sync } = pair();
    A.setStyle({ theme: 'dark' }); sync();
    const old = fileOf(A); delete old.sync.style; old.theme = 'light'; old.accent = 'pink'; old.sync.seq += 1000;
    const text = resum(old), r = Merge.decode(JSON.parse(text), H);
    ok(r && r.peer && !r.newer && !r.skipped.length && !Object.keys(r.peer.style || {}).length, 'a 2026.11.16-3 device file (no sync.style) reads without error, with no version of the theme or accent');
    B.view.set(A.fileName(), text); B.round();
    ok(B.styleNow() === 'dark blue', `merged, it changes nothing about them, whatever its own theme and accent say (${B.styleNow()})`);
    // and both devices as 2026.11.16-3 left them: their own theme each, no versions anywhere
    const C = new Device('cart', { pages: false }), E = new Device('wall', { pages: false }), f = new Folder('Room 3');
    C.addPage('C page'); C.folder = f; C.view = new Map(); C.linkTo(f);
    E.view = new Map(f.files); E.folder = f; E.linkTo(f);
    for (const d of [C, E]) { delete d.link.sync.style; d.peers.clear(); }
    for (const [n, t] of Array.from(f.files)) { const o = JSON.parse(t); delete o.sync.style; f.write(n, resum(o)); }
    for (const d of [C, E]) d.view = new Map(f.files);
    C.patch({ set: { theme: 'light' } }); E.patch({ set: { theme: 'dark', accent: 'green' } });
    const each = () => { for (let k = 0; k < 3; k++) { for (const d of [C, E]) { for (const o of [C, E]) if (o !== d) d.deliver(o); d.round(); } NOW += MIN; } };
    each();
    ok(C.styleNow() === 'light blue' && E.styleNow() === 'dark green', `two devices that synced with 2026.11.16-3 keep their own until one is changed (${C.styleNow()} / ${E.styleNow()})`);
    C.setStyle({ accent: 'slate' }); each();
    ok(C.styleNow() === 'light slate' && E.styleNow() === 'dark slate', `then that change reaches the other, and only it (${C.styleNow()} / ${E.styleNow()})`);
  });
  block(() => {
    // a lost ledger is rebuilt from this device's file with the versions it held
    const { A, B, sync } = pair();
    B.setStyle({ accent: 'pink' }); sync();
    const rb = Merge.rebuild(Merge.decode(fileOf(A), H).peer, { now: NOW });
    ok(rb.sync.style && rb.sync.style.accent.v[0] === B.dev && rb.sync.style.accent.h === Merge.read([], { settings: { accent: 'pink' } }).style.accent.h,
      'a ledger rebuilt from a device file has the theme and accent versions in it');
    ok(Merge.includes(A.ledger(), Merge.decode(fileOf(B), H).peer) && !Merge.includes(Merge.ledger({ v: 1, dev: A.dev }, Array.from(A.link.mines.values())), Merge.decode(fileOf(B), H).peer),
      'a file is “included” only if the ledger has its theme and accent versions too');
  });
  for (const restore of [true, false]) block(() => {
    // a lost ledger rebuilt from this device's own file, written before its last merge (a write waits up to
    // LINK_GAP_MS): a theme it only received there is no choice of its own, though the settings were written back with
    // the time they were (Writer.restore), so the laptop's later choice stays, and nobody hears otherwise
    const { A, B, folder, sync } = pair();
    A.setStyle({ theme: 'dark' }); NOW += 1000; A.round();
    const before = folder.files.get(B.fileName());
    B.deliver(A); B.round();
    folder.files.set(B.fileName(), before); B.view.set(B.fileName(), before);   // (its file not written yet)
    NOW += 4000; A.setStyle({ theme: 'light' }); NOW += 1000; A.round();
    NOW += 3000; B.loseLedger();
    if (restore) B.put('settings', 'settings', B.settings, { quiet: true });   // (Writer.restore)
    const heard = A.sums.length;
    NOW += 1000; B.round(); sync();
    const said = A.sums.slice(heard).flatMap(sm => sm.style);
    ok(A.styleNow() === 'light blue' && B.styleNow() === 'light blue' && !said.length,
      `a lost ledger rebuilt from a file older than the last merge${restore ? ', the settings written back' : ''}: the laptop’s later Light stays on both, and the laptop hears nothing about the theme (${A.styleNow()} / ${B.styleNow()}; ${JSON.stringify(said)})`);
  });
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
    const why = [!r.converged && 'converged', !r.quiet && 'quiet', r.lost.length && 'lost', r.twice.length && 'twice', r.pending && 'pending', r.back.length && 'back',
      r.needless.length && 'needless', r.reverted.length && 'reverted', r.unlinked.length && 'unlinked', r.style.length && 'style'].filter(Boolean);
    for (const w of why) out.bad[w] = (out.bad[w] || 0) + 1;
    if (why.length && !out.first) out.first = `seed ${i}: ${why.join(', ')} ${JSON.stringify({ lost: r.lost.slice(0, 5), twice: r.twice.slice(0, 3), back: r.back.slice(0, 3), needless: r.needless.slice(0, 2), reverted: r.reverted.slice(0, 3), unlinked: r.unlinked.slice(0, 3), style: r.style })}`;
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
  // (and runs where two or more devices set up the folder at once, each finding it empty, atOnce being how often a
  // set-up does. Such runs found the gaps fixed in 2026.11.17-1, which 2026.11.16-3 had too: with 3 devices, seeds 952
  // (a take, then a stale tab), 635 (a deleted window back), 809 (a page deleted just before Change…) and 1041 (Change…
  // without its farewell write, in this harness); with 5, 362 (both a take and a stale tab, and a deleted window back)
  // and 180 at 0.25 (oracle 7 keyed by text, not by window). The review's cases repeat each merge fix, since 362 and 180
  // lie past the 5-device ranges run here.)
  const batches = [[2000, 3, 150], [500, 5, 300], [1200, 3, 150, { atOnce: 0.6 }], [500, 3, 150, { atOnce: 0.25 }], [300, 5, 300, { atOnce: 0.6 }], [100, 5, 300, { atOnce: 0.25 }]];
  for (const [n, nDev, steps, variant] of batches) {
    const runs = Math.round(n * scale), r = await inWorkers({ nDev, steps, variant }, runs);
    const total = Object.values(r.bad).reduce((a, b) => a + b, 0);
    ok(total === 0 && r.runs === runs, `${runs} runs × ${nDev} devices × ${steps} steps${variant ? `, two or more setting up the folder at once (${variant.atOnce})` : ''}: every oracle holds (${r.copies} copies over ${r.wins} windows)` + (total ? ` — ${JSON.stringify(r.bad)}; first: ${r.first}` : ''));
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
  if (v.atOnce) return run(seed, nDev, steps, v);
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
  review();
  styles();
  files();
  await randomized(scale);
  await bites(scale);
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
