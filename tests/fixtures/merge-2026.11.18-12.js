// The Board Sync merge region of board.js as release 2026.11.18-12 shipped it (between its #region and #endregion lines),
// for tests/merge.js: a device still on that release, which reads a device file only if its sync.v is 1, and keeps
// window pictures inside its own file. Not loaded by 21Board.
// #region Board Sync merge
  const Merge = (() => {
    const PAGE_PARTS = ['name', 'look', 'size', 'pos', 'photo', 'photoLook'];
    const PAGE_BACK = ['name', 'look', 'size', 'photo', 'photoLook'];   // an unseen edit to one brings a deleted page back (moving it doesn't)
    const WIN_PARTS = ['rect', 'open', 'data', 'conf', 'label'];
    // The board's theme, accent color and text style (settings.theme, settings.accent and settings.accentColor,
    // settings.letters): on every device linked to the folder, the later change winning, as for a page's name. (The
    // device's other settings, and the page shown, stay its own.) Everything below that handles them goes through
    // STYLE_PARTS (tests/merge.js leaves 'accentColor' out of it to stand in for 2026.11.17-6, and 'letters' too for
    // 2026.11.16-4: the releases before them). accentColor: the accent chosen from 2026.11.18-2 ('' before any), see
    // accentShown.
    const STYLE_PARTS = ['theme', 'accent', 'letters', 'accentColor'], THEMES = ['light', 'dark', 'system'], LETTER_KEYS = ['standard', 'legible', 'early'];
    const STYLE_DEF = { theme: 'system', accent: 'blue', letters: 'standard', accentColor: '' };
    const styleOk = (k, v, H) => (k === 'theme' ? THEMES.includes(v) : k === 'accent' ? H.accentOk(v) : k === 'accentColor' ? v === '' || H.accentColorOk(v) : LETTER_KEYS.includes(v));
    const WID_RE = /^[\w.@~-]{1,120}$/, DEV_RE = /^[0-9a-z]{12}$/, KEY_RE = /^[0-9a-z]{1,40}$/, WIDGET_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
    const DAY = 864e5;
    // (remadeMs: a record a merge deleted, made again this long after it, is a change made after seeing that, see stamp)
    const DEF = { goneMs: 30 * DAY, peerGoneMs: 365 * DAY, aheadMs: DAY, undoMs: 20000, scale: 0.8, remadeMs: 10000 };
    const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    const vscale = v => (typeof v === 'number' && v >= 0.5 && v <= 2 ? v : null);
    const hj = v => hash53(JSON.stringify(v === undefined ? null : v));
    const NULL_H = hj(null), TRUE_H = hj(true), FALSE_H = hj(false);
    const sortBy = (list, key) => list.slice().sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
    const r2 = v => Math.round(v * 100) / 100;

    // ---- versions: [by, vv, t] (+ 'u': made by the Undo of a merge); inside, objects that also carry their part's
    // fingerprint h, the value (val, has) where it is known, and where the value is (src: 'local', 'pending' or a device)
    const leq = (a, b) => { for (const k in a) if (a[k] > (b[k] || 0)) return false; return true; };
    const vjoin = (a, b) => { const o = Object.assign({}, a); for (const k in b) if (!(o[k] >= b[k])) o[k] = b[k]; return o; };
    const nOf = v => v.vv[v.by] || 0;
    // v is older than w: w includes it, or w includes a later change to this part by v's device. (A device's changes to
    // a part follow one another, each made on what that device showed then; one that lost was kept as a copy by that
    // device at once. A version that joined others' vectors in, made by a device that kept a copy, emptied content or
    // found equal values, still names the device whose value it holds: a later change by that device replaces it, and
    // is no clash with that device's own older value.)
    const superseded = (v, w) => (leq(v.vv, w.vv) && !leq(w.vv, v.vv)) || (w.vv[v.by] || 0) > nOf(v);
    // v is within what a deletion's cover had seen: the vector, or that device's change at v's counter or a later one.
    const covered = (v, C) => leq(v.vv, C || {}) || ((C || {})[v.by] || 0) >= nOf(v);
    // (the vector's devices in one order: a version joined from the same ones in another order is the same version,
    // and its file and ledger mustn't change with it)
    const sortVV = vv => { const o = {}; for (const k of Object.keys(vv).sort()) o[k] = vv[k]; return o; };
    const arr = v => (v.u ? [v.by, sortVV(v.vv), v.t, 'u'] : [v.by, sortVV(v.vv), v.t]);
    const ver = (a, x) => Object.assign({ by: a[0], vv: a[1], t: a[2], u: a[3] === 'u' }, x);
    // 1 a version, 2 one this release doesn't know (a newer 21Board), 0 not one
    function okV(a) {
      if (!Array.isArray(a)) return 0;
      if (a.length > 4 || (a.length === 4 && a[3] !== 'u')) return typeof a[0] === 'string' && a[1] && typeof a[1] === 'object' ? 2 : 0;
      if (a.length < 3 || typeof a[0] !== 'string' || !KEY_RE.test(a[0]) || !a[1] || typeof a[1] !== 'object' || Array.isArray(a[1]) || typeof a[2] !== 'number' || !isFinite(a[2])) return 0;
      const ks = Object.keys(a[1]);
      if (!ks.length || ks.length > 500) return 0;
      for (const k of ks) if (!KEY_RE.test(k) || typeof a[1][k] !== 'number' || !isFinite(a[1][k]) || a[1][k] < 0) return 0;
      return a[1][a[0]] > 0 ? 1 : 0;
    }
    // Which of two concurrent versions is the later: the larger (n, by), then h. It decides where things go, never
    // whether something is kept. rank (set up only for Link's 'join' mode) puts this device's own versions first.
    const later = (a, b, rank) => (rank ? rank(a) - rank(b) : 0) || (nOf(a) - nOf(b)) || (a.by < b.by ? -1 : a.by > b.by ? 1 : 0) || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0);

    // The helpers the board passes in (tests/merge.js passes its own): a rect at another scale, a color, a photo's look.
    function helpers(o = {}) {
      return {
        scaleRect: o.scaleRect || ((r, k) => ({ x: r2(r.x * k), y: r2(r.y * k), w: r2(r.w * k), h: r2(Math.max(10, r.h - 40) * k + 40) })),
        bgColor: o.bgColor || (c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null)),
        look: o.normalizePhotoSettings || (v => (v && typeof v === 'object' ? v : null)),
        photoKeyOf: o.photoKeyOf || (m => (m ? `${m.addedAt}-${m.bytes}-${m.w}x${m.h}` : null)),
        canvasFor: o.canvasFor || (sc => ({ w: Math.round(1920 / sc), h: Math.round(1080 / sc) })),
        scale: o.defaultScale || DEF.scale,
        accentOk: o.accentOk || (k => typeof k === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(k)),   // (the board passes its own: a key of ACCENTS, 'pink' or 'teal')
        accentColorOk: o.accentColorOk || (k => typeof k === 'string' && /^(?:[a-z][a-z0-9-]{0,23}|#[0-9a-f]{6})$/.test(k)),   // (the board's: a key of ACCENTS or '#rrggbb')
        UID_RE: o.UID_RE || /^[A-Za-z0-9-]{8,64}$/, PHOTO_FILE_RE: o.PHOTO_FILE_RE || /^[0-9a-f]{32}\.(jpg|png|webp)$/
      };
    }
    // A part's fingerprint. A rect counts at scale 1, in whole px: rescaling a page doesn't move its windows.
    function partH(part, val, scale, H) {
      if (part === 'exists') return val ? '1' : '0';
      if (part === 'photo') return val || '-';
      if (part === 'rect') { const r = H.scaleRect(val.rect, scale); return hj([Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h), val.maximized ? 1 : 0]); }
      return hj(val);
    }
    // A place at scale 1, unrounded (the ledger keeps it beside a place's version, s1): rescaling a page converts every
    // place with rounding, so one in a hundred or so lands on another whole px. Within NEAR_PX of the version's, it is
    // the same place.
    const NEAR_PX = 0.5;
    const s1Of = (val, scale, H) => { const r = H.scaleRect(val.rect, scale); return [r.x, r.y, r.w, r.h, val.maximized ? 1 : 0]; };
    const nearS1 = (a, b) => Array.isArray(a) && a.length === 5 && a[4] === b[4] && [0, 1, 2, 3].every(i => Math.abs(a[i] - b[i]) < NEAR_PX);
    const normRect = r => { r = r && typeof r === 'object' ? r : {}; return { x: fin(r.x, 40), y: fin(r.y, 40), w: Math.max(20, fin(r.w, 400)), h: Math.max(50, fin(r.h, 340)) }; };
    const normLabel = c => (c && typeof c === 'object' && typeof c.wid === 'string' && WID_RE.test(c.wid) ? { wid: c.wid, from: String(c.from || '').slice(0, 40), name: String(c.name || '').slice(0, 60), at: fin(c.at, 0) } : null);
    function pageVals(v, H) {
      const bg = (v && v.background) || {}, scale = vscale(v && v.scale) || H.scale;
      return {
        name: v && typeof v.name === 'string' ? v.name.slice(0, 60) : 'Page 1',
        look: { color: H.bgColor(bg.color), pattern: typeof bg.pattern === 'string' && /^[a-z-]{1,24}$/.test(bg.pattern) ? bg.pattern : 'none' },
        size: { scale, shape: v && v.shape === 'free' ? 'free' : '16:9' },
        pos: fin(v && v.pos, null)
      };
    }
    const rootOf = wid => wid.split('~')[0].slice(0, 113);
    const sameLabel = (lb, wid, v) => !!lb && lb.wid === wid && lb.from === v.by && lb.at === v.t;
    const copyWid = (wid, v) => `${rootOf(wid)}~${hash53(`${wid}:${v.by}:${nOf(v)}`).slice(0, 6)}`;
    // A window's identity on its page: <widget>@<createdAt>, then .2, .3... if that is taken.
    function newWid(widgetId, createdAt, taken) {
      const base = `${widgetId}@${fin(createdAt, 0)}`.slice(0, 110);
      let w = base;
      for (let k = 2; taken && taken.has(w); k++) w = `${base}.${k}`;
      return w;
    }
    // A running Task Timer kept as a copy is paused, the same way on every device, so a copy never rings a second alarm.
    const pauseTask = (v, t) => (v && typeof v === 'object' && v.running && typeof v.endsAt === 'number' ? Object.assign({}, v, { running: false, secondsLeft: Math.max(0, Math.ceil((v.endsAt - t) / 1000)), endsAt: null, alarm: false }) : v);

    // ---- the ledger in memory: { sync: link:sync's value, mine: { uid: link:mine-<uid>'s value } }. A change copies the
    // page's record (base: as it was stored), so records() can tell what to write.
    function ledger(sync, mines) {
      const mine = {};
      for (const m of mines || []) if (m && typeof m.uid === 'string') mine[m.uid] = m;
      return { sync: Object.assign({ v: 1 }, sync || {}), mine, base: Object.assign({}, mine) };
    }
    const own = l => ({ sync: Object.assign({}, l.sync), mine: Object.assign({}, l.mine), base: l.base || Object.assign({}, l.mine) });
    function records(l) {
      const put = [], del = [];
      for (const [uid, m] of Object.entries(l.mine)) if (m !== l.base[uid]) put.push({ key: `link:mine-${uid}`, value: m });
      for (const uid of Object.keys(l.base)) if (!l.mine[uid]) del.push(`link:mine-${uid}`);
      return { put, del };
    }
    const newMine = (uid, b) => ({ uid, b, p: {}, w: {}, hist: { at: 0, local: false }, quiet: null, gone: null, wgone: {} });
    // A page's fingerprint: whether it changed here since.
    const keepH = P => hash53(JSON.stringify([PAGE_PARTS.map(k => P.parts[k].h), sortBy(Array.from(P.wins.values()), W => W.wid).map(W => [W.wid].concat(WIN_PARTS.map(k => W.parts[k].h)))]));
    const winH = W => hash53(JSON.stringify(WIN_PARTS.map(k => W.parts[k].h)));
    const cloneMine = m => Object.assign({}, m, { p: Object.assign({}, m.p), w: Object.assign({}, m.w), wgone: Object.assign({}, m.wgone || {}), hist: Object.assign({}, m.hist || { at: 0, local: false }) });

    // settings, changed as set operations, so a tab with an old copy can't write its old lists over a merge's.
    // patch: { set: {key: value}, drop: [key], gone: [['add', b, at] | ['remove', b]], order: { b: [pos, uid] }, lastBoard }
    function patchSettings(stored, patch) {
      const s = Object.assign({}, stored || {});
      if (!patch) return s;
      if (patch.set) Object.assign(s, patch.set);
      for (const k of patch.drop || []) delete s[k];
      if (patch.gone && patch.gone.length) {
        const gone = (Array.isArray(s.deletedBoards) ? s.deletedBoards : []).map(Number), at = Object.assign({}, s.deletedAt);
        for (const [op, b, t] of patch.gone) {
          if (op === 'add') { if (!gone.includes(b)) gone.push(b); at[b] = t; } else { const i = gone.indexOf(b); if (i >= 0) gone.splice(i, 1); }
        }
        for (const k of Object.keys(at)) if (!gone.includes(+k)) delete at[k];
        s.deletedBoards = gone; s.deletedAt = at;
      }
      if (patch.order) {
        // the pages in board order, (pos, uid), with any this patch doesn't know (another tab's new page) after them
        const gone = new Set((Array.isArray(s.deletedBoards) ? s.deletedBoards : []).map(Number));
        const known = Object.keys(patch.order).map(Number).filter(b => !gone.has(b));
        const rest = (Array.isArray(s.boards) ? s.boards : []).map(Number).filter(b => !gone.has(b) && !(b in patch.order));
        s.boards = known.sort((a, b) => { const x = patch.order[a], y = patch.order[b]; return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : a - b); }).concat(rest);
      } else if (patch.gone && patch.gone.length && Array.isArray(s.boards)) {
        const gone = new Set(s.deletedBoards);
        s.boards = s.boards.filter(b => !gone.has(+b));
      }
      if (patch.lastBoard) s.lastBoard = Math.max(fin(+s.lastBoard, 1), patch.lastBoard);
      return s;
    }
    // Two patches waiting together (Writer): the later's keys win, set operations run in order.
    const joinPatches = (a, b) => ({ set: Object.assign({}, a && a.set, b && b.set), drop: Array.from(new Set(((a && a.drop) || []).concat((b && b.drop) || []))), gone: ((a && a.gone) || []).concat((b && b.gone) || []),
      order: (b && b.order) || (a && a.order) || undefined, lastBoard: Math.max((a && a.lastBoard) || 0, (b && b.lastBoard) || 0) || undefined });

    // ---- read: the records of this device (with rev, updatedAt, base, m, u) → its board as parts, by page uid and wid
    function read(recs, o = {}) {
      const H = helpers(o), st = o.settings || {}, now = fin(o.now, 0), undoMs = fin(o.undoMs, DEF.undoMs);
      const goneB = new Set((Array.isArray(st.deletedBoards) ? st.deletedBoards : []).map(Number)), at = st.deletedAt || {};
      const skipped = new Set(o.skipped || []), holdB = new Set(Array.from(o.holdPages || [], String));   // (page ids: a list or a Set)
      const boards = new Map(), revs = new Map(), byKey = new Map();
      const slot = b => { if (!boards.has(b)) boards.set(b, { rec: null, inst: new Map(), data: new Map(), conf: new Map(), media: {} }); return boards.get(b); };
      for (const r of recs || []) {
        if (!r || typeof r.key !== 'string') continue;
        revs.set(r.key, fin(r.rev, 0)); byKey.set(r.key, r);
        const p = r.key.split(':'), b = +p[1];
        if (!(b > 0)) continue;
        if (p[0] === 'board' && p.length === 2) slot(b).rec = r;
        else if (p[0] === 'media' && p.length === 3) slot(b).media[p[2]] = r;
        else if ((p[0] === 'inst' || p[0] === 'data' || p[0] === 'conf') && p.length === 4) slot(b)[p[0]].set(`${p[2]}:${p[3]}`, r);
      }
      const local = { H, pages: new Map(), byB: new Map(), nouid: [], settings: st, revs, recs: byKey, skipped, now, fixes: [], style: {} };
      // The theme, accent and text style, and when each was chosen here (themeAt, accentAt, lettersAt: see
      // updateSettings; for one chosen before it synced, the settings record's own time). chosen: someone picked it on
      // this device (not only the default, or a value from before 2026.11.16-4, or a text style from before 2026.11.17-2)
      const sr = byKey.get('settings'), sAt = sr ? fin(sr.updatedAt, now) : now;
      for (const k of STYLE_PARTS) {
        const val = styleOk(k, st[k], H) ? st[k] : STYLE_DEF[k], t = fin(st[k + 'At'], null);
        local.style[k] = { val, h: hj(val), at: t === null ? sAt : t, chosen: t !== null };
      }
      const lp = (key, val, h, rec, x) => Object.assign({ key, val, h, rev: rec ? fin(rec.rev, 0) : 0, at: rec ? fin(rec.updatedAt, null) : null,
        base: rec && typeof rec.base === 'number' ? rec.base : undefined, u: !!(rec && rec.u), m: !!(rec && rec.m), skipped: skipped.has(key) }, x);
      // (o.hcache, a Map the caller keeps between rounds: a record's fingerprints are worked out again only when its revision changes)
      const cache = o.hcache instanceof Map ? o.hcache : null, seen = cache ? new Set() : null;
      const hOf = (rec, tag, f) => {
        if (!cache || !rec) return f();
        const k = `${rec.key}#${tag}`, c = cache.get(k);
        seen.add(k);
        if (c && c.rev === rec.rev) return c.h;
        const h = f();
        cache.set(k, { rev: rec.rev, h });
        return h;
      };
      for (const b of Array.from(boards.keys()).sort((x, y) => x - y)) {
        const x = boards.get(b);
        if (!x.rec) continue;
        const v = x.rec.value && typeof x.rec.value === 'object' ? x.rec.value : {}, pv = pageVals(v, H);
        const age = now - fin(+at[b], 0), held = holdB.has(String(b)) || (goneB.has(b) && age >= 0 && age < undoMs);   // (a clock set back: not held for hours)
        const P = { uid: typeof v.uid === 'string' && H.UID_RE.test(v.uid) ? v.uid : null, b, key: `board:${b}`, rec: x.rec, value: v, scale: pv.size.scale,
          held, gone: goneB.has(b) && !held, parts: {}, wins: new Map(), all: [] };
        for (const k of ['name', 'look', 'size', 'pos']) P.parts[k] = lp(P.key, pv[k], hOf(x.rec, k, () => hj(pv[k])), x.rec);
        const ph = x.media.background, pl = x.media['background-look'];
        const media = ph && ph.value && typeof ph.value === 'object' && ph.value.w > 0 ? ph.value : null, pkey = media ? H.photoKeyOf(media) : null;
        P.parts.photo = lp(`media:${b}:background`, pkey, pkey || '-', ph, { media });
        const look = pl ? H.look(pl.value) : null;
        P.parts.photoLook = lp(`media:${b}:background-look`, look, pl ? hOf(pl, 'look', () => hj(look)) : NULL_H, pl);
        for (const [ik, ir] of Array.from(x.inst).sort((a, c) => (a[0] < c[0] ? -1 : 1))) {
          const iv = ir.value && typeof ir.value === 'object' ? ir.value : {}, [widgetId, nStr] = ik.split(':');
          const W = { wid: typeof iv.wid === 'string' && WID_RE.test(iv.wid) ? iv.wid : null, ikey: ik, widgetId, n: +nStr, createdAt: fin(iv.createdAt, fin(ir.updatedAt, 0)),
            z: fin(iv.z, 1), inst: iv, keys: { inst: `inst:${b}:${ik}`, data: `data:${b}:${ik}`, conf: `conf:${b}:${ik}` }, parts: {} };
          const rv = { rect: normRect(iv.rect), maximized: !!iv.maximized }, label = normLabel(iv.copyOf);
          W.parts.rect = lp(W.keys.inst, rv, hOf(ir, `rect@${P.scale}`, () => partH('rect', rv, P.scale, H)), ir);
          W.parts.open = lp(W.keys.inst, !!iv.open, iv.open ? TRUE_H : FALSE_H, ir);
          W.parts.label = lp(W.keys.inst, label, label ? hOf(ir, 'label', () => hj(label)) : NULL_H, ir);
          for (const kind of ['data', 'conf']) {
            const r = x[kind].get(ik), val = r && r.value !== undefined ? r.value : null;
            W.parts[kind] = lp(W.keys[kind], val, val === null ? NULL_H : hOf(r, kind, () => hj(val)), r);
          }
          P.all.push(W);
        }
        // The untouched first page of a new or erased device: never synced (it would be added to every board that joins).
        // "Page 1", or "My Board" on a device set up before 2026.11.18-12.
        P.placeholder = (pv.name === 'Page 1' || pv.name === 'My Board') && pv.look.color === null && pv.look.pattern === 'none' && pv.size.scale === H.scale && pv.size.shape === '16:9' && !pkey &&
          !P.all.some(W => W.parts.open.val || W.parts.data.val !== null || W.parts.conf.val !== null || W.parts.data.skipped || W.parts.conf.skipped);
        const taken = new Set();
        for (const W of P.all) if (W.wid && !taken.has(W.wid)) { taken.add(W.wid); P.wins.set(W.wid, W); }
        // (Import › Replace all pages puts new pages in place of the old ones with their uids, and the old ones wait for
        // their Undo: the page shown is the one that stands for its uid)
        const was = P.uid && local.pages.get(P.uid);
        if (!P.uid) local.nouid.push(P);
        else if (!was || ((was.held || was.gone) && !P.held && !P.gone)) local.pages.set(P.uid, P);
        local.byB.set(b, P);
      }
      if (cache) for (const k of Array.from(cache.keys())) if (!seen.has(k)) cache.delete(k);
      return local;
    }

    // ---- stamp: local changes since the ledger (from any tab, any code path) become versions. Mutates local with
    // its fixes (ids, places), which are written in the round's transaction (fixes; plan's writes include them).
    function stamp(ledger0, local, o = {}) {
      const L = own(ledger0), H = local.H, dev = o.dev, now = fin(o.now, 0), first = !!o.first;
      const fix = new Map();   // record key -> its new value (null: deleted)
      const fixVal = key => (fix.has(key) ? fix.get(key) : (local.recs.get(key) ? clone(local.recs.get(key).value) : null));
      const fixRev = key => Math.max((local.revs.get(key) || 0) + 1, now);
      let sp = null;
      // 1. fixes: a page without uid or pos, a window without wid or with another's
      for (const P of local.nouid) {
        P.uid = `${dev}-${P.b}-${fin(P.rec.rev, 0).toString(36)}`.slice(0, 64);
        fix.set(P.key, Object.assign(fixVal(P.key) || {}, { uid: P.uid }));
        if (!local.pages.has(P.uid)) local.pages.set(P.uid, P);
      }
      local.nouid = [];
      const live = Array.from(local.pages.values()).filter(P => !P.gone && !P.held);
      const order = (Array.isArray(local.settings.boards) ? local.settings.boards : []).map(Number).filter(b => live.some(P => P.b === b));
      live.filter(P => !order.includes(P.b)).forEach(P => order.push(P.b));
      for (const P of live) {
        if (P.parts.pos.val !== null) continue;
        const pos = order.indexOf(P.b) + 1;
        fix.set(P.key, Object.assign(fixVal(P.key) || {}, { pos }));
        Object.assign(P.parts.pos, { val: pos, h: hj(pos) });
      }
      for (const P of local.pages.values()) {
        const taken = new Set(P.wins.keys());
        for (const W of P.all) {
          if (W.wid && P.wins.get(W.wid) === W) continue;
          W.wid = newWid(W.widgetId, W.createdAt, taken);
          taken.add(W.wid); P.wins.set(W.wid, W);
          fix.set(W.keys.inst, Object.assign(fixVal(W.keys.inst) || {}, { wid: W.wid }));
        }
      }
      // the order's safety net: settings.boards is only a cache of (pos, uid)
      const byPos = sortBy(live, P => P.parts.pos.val).sort((a, c) => a.parts.pos.val - c.parts.pos.val || (a.uid < c.uid ? -1 : a.uid > c.uid ? 1 : 0)).map(P => P.b);
      if (!sameJSON(order, byPos)) { sp = { order: {} }; for (const P of live) sp.order[P.b] = [P.parts.pos.val, P.uid]; }

      // 2. what changed, found first (n is the newest edit time among them), then made into versions
      const items = [];
      let maxAt = 0;
      const note = at => { if (typeof at === 'number' && at > maxAt) maxAt = at; };
      const nv = (base, at, u) => n => arr({ by: dev, vv: vjoin(base || {}, { [dev]: n }), t: fin(at, now), u: !!u });
      const cloned = new Set();
      const mineOf = (uid, b) => { const m = cloned.has(uid) ? L.mine[uid] : L.mine[uid] ? cloneMine(L.mine[uid]) : newMine(uid, b); L.mine[uid] = m; cloned.add(uid); return m; };
      const touched = new Set();
      // A part: its ledger entry E (or none) against the record's P. set(E') puts the new entry.
      const part = (M, E, P, cover, set) => {
        if (!P || P.skipped) return;
        if (E && E.hold) {   // waiting for a photo that hasn't arrived: only a change made here counts
          if (P.h === E.h) return;
          note(P.at); items.push(n => { set({ h: P.h, v: nv(E.seen ? E.seen[1] : {}, P.at, P.u)(n), rev: P.rev }); touched.add(M); });
          return;
        }
        if (!E || !E.v) { note(P.at); items.push(n => { set(withS1({ h: P.h, v: nv(cover, P.at, P.u)(n), rev: P.rev }, P)); touched.add(M); }); return; }
        // (a place within NEAR_PX of the version's, at scale 1: the same place, rounded another way after a rescale here)
        const near = P.part === 'rect' && E.s1 && E.h !== P.h && E.lh !== P.h && nearS1(E.s1, s1Of(P.val, P.page.scale, H));
        if (E.h === P.h || (E.lh && E.lh === P.h) || near) {   // (lh: the same place, written at this page's scale by a merge, or rescaled here)
          const E1 = near ? Object.assign({}, E, { lh: P.h }) : E;
          // (still as the merge wrote it, or written again with its value by a tab that hadn't seen it, or by a later merge
          // that wrote another part of the record: what the merge noted stays, so a change another tab queued before the
          // merge, written only now, is still found to be one that never saw it)
          if (E.applied && (P.rev === E.applied || (typeof P.base === 'number' && P.base < E.applied) || (P.m && typeof P.base !== 'number'))) { if (E1.rev !== P.rev || E1 !== E) set(Object.assign({}, E1, { rev: P.rev })); return; }
          if (E1.rev !== P.rev || E.applied || E1 !== E) { const e = Object.assign({}, E1, { rev: P.rev }); for (const k of ['applied', 'prevH', 'prevHs', 'prevV', 'prevSc', 'val']) delete e[k]; set(e); }
          return;
        }
        // (not the Undo of a merge, nor a record a merge deleted (rev 0) made again well after that: Board history's Put
        // back, say. Each is based on the revision before the deletion (Known after MergeUI.undo's applyRecord, or
        // Raced.gone), as a stale tab's save is, but was made after seeing it)
        if (E.applied && typeof P.base === 'number' && P.base < E.applied && P.rev !== E.applied && !P.u && !(!E.rev && P.rev - E.applied > DEF.remadeMs)) {
          // written by a tab that hadn't seen the merge's write (§3.4)
          // (only an old value carried along: the merged one is put back, by a merge write of its own, so that this tab's
          // next save, based on its own write, is still found to be one that never saw the merge)
          const ph = P.part === 'rect' && E.prevSc ? partH('rect', P.val, E.prevSc, H) : P.h;
          if ([P.h, ph].some(h => h === E.prevH || (E.prevHs || []).includes(h)) && 'val' in E) { restore(P, E.val, E.h); set(Object.assign({}, E, { rev: fixRev(P.key), applied: fixRev(P.key) })); return; }
          note(P.at);
          items.push(n => { set(withS1(clean({ h: P.h, v: nv(E.prevV ? E.prevV[1] : {}, P.at, P.u)(n), rev: P.rev, pending: (E.pending || []).concat('val' in E ? [{ v: E.v, val: E.val, h: E.h }] : []) }), P)); touched.add(M); });
          return;
        }
        note(P.at); items.push(n => { set(withS1(clean({ h: P.h, v: nv(E.v[1], P.at, P.u)(n), rev: P.rev, pending: E.pending }), P)); touched.add(M); });
      };
      const withS1 = (e, P) => (P.part === 'rect' ? Object.assign(e, { s1: s1Of(P.val, P.page.scale, H) }) : e);
      const clean = e => { if (!e.pending || !e.pending.length) delete e.pending; return e; };
      // A part's merged value put back in its record (a write that only carried the old one).
      const restore = (P, val, h) => {
        const v = fix.has(P.key) || local.recs.get(P.key) ? fixVal(P.key) : null, k = P.key.split(':')[0];
        let out = v;
        if (P === P.page.parts.name) out = Object.assign(v || {}, { name: val });
        else if (P === P.page.parts.look) out = Object.assign(v || {}, { background: clone(val) });
        else if (P === P.page.parts.size) out = Object.assign(v || {}, { scale: val.scale, shape: val.shape });
        else if (P === P.page.parts.pos) out = Object.assign(v || {}, { pos: val });
        else if (k === 'inst' && P.part === 'rect') out = Object.assign(v || {}, { rect: clone(val.rect), maximized: !!val.maximized });
        else if (k === 'inst' && P.part === 'open') out = Object.assign(v || {}, { open: !!val });
        else if (k === 'inst' && P.part === 'label') out = Object.assign(v || {}, { copyOf: clone(val) });
        else out = clone(val);
        fix.set(P.key, out);
        P.val = clone(val); P.h = h; P.rev = fixRev(P.key);
      };
      for (const P of local.pages.values()) {
        for (const k of PAGE_PARTS) P.parts[k].page = P;
        for (const W of P.all) for (const k of WIN_PARTS) { W.parts[k].page = P; W.parts[k].part = k; }
      }
      const seenPages = new Set();
      // (what a first round found deleted here: the folder's version is taken, from the other devices' files only; this
      // device's own file, merged in a first round, has its own older version of it, which mustn't come back as a clash)
      const dropped1 = new Set();
      // Windows in the ledger that are gone from their page: deleted here (a window tombstone, apart from the page's).
      const winsGone = (M, P) => {
        for (const wid of Object.keys(M.w)) {
          if (P.wins.has(wid)) continue;
          const mw = M.w[wid];
          if (first) { delete M.w[wid]; dropped1.add(`${P.uid} ${wid}`); continue; }   // (a first round deletes nothing: the folder's version is taken)
          note(now);
          items.push(n => {
            const cover = {};
            // (and every change this device made to it before: one its entry no longer names, after the page came back
            // with another device's version, say, was still seen here)
            for (const k of WIN_PARTS) if (mw.p[k] && mw.p[k].v) cover[k] = vjoin(mw.p[k].v[1], { [dev]: n });
            M.wgone[wid] = { exists: nv(mw.p.exists ? mw.p.exists.v[1] : {}, now)(n), cover, seq: null, seen: now };
            delete M.w[wid]; touched.add(M);
          });
        }
      };
      for (const P of Array.from(local.pages.values()).sort((a, c) => a.b - c.b)) {
        // A page deleted here (its Undo still offered, or its records not cleared yet): nothing is stamped but the
        // windows deleted from it before it was, so that if it comes back (an edit made elsewhere), they don't.
        if (P.held || P.gone) {
          const M0 = L.mine[P.uid];
          if (M0 && !M0.gone && o.mode !== 'take' && Object.keys(M0.w).some(wid => !P.wins.has(wid))) winsGone(mineOf(P.uid, P.b), P);
          continue;
        }
        const uid = P.uid;
        // never synced; (take: the folder's board replaces this one; dropHere: this device's own pages a take still has to
        // remove here, once another page is shown)
        if ((!L.mine[uid] && P.placeholder) || o.mode === 'take' || (!L.mine[uid] && o.dropHere && o.dropHere.has(uid))) continue;
        if (L.mine[uid] && L.mine[uid].keep && L.mine[uid].keep === keepH(P)) continue;   // deleted elsewhere, still shown here, and not edited since
        seenPages.add(uid);
        const M = mineOf(uid, P.b);
        M.b = P.b;
        const back = M.gone;   // back here after a deletion (Undo, Bring back, re-created): built on the tombstone
        const pc = back ? M.gone.cover || {} : null;
        if (back) {
          note(now);
          items.push(n => { M.p = { exists: { h: '1', v: nv(back.exists[1], now)(n), rev: P.rev } }; M.gone = null; delete M.keep; delete M.keepW; touched.add(M); });
        } else if (!M.p.exists) { note(P.parts.name.at); items.push(n => { M.p.exists = { h: '1', v: nv({}, P.parts.name.at)(n), rev: P.rev }; touched.add(M); }); }
        else if (M.p.exists.rev !== P.rev) M.p.exists = Object.assign({}, M.p.exists, { rev: P.rev });
        for (const k of PAGE_PARTS) part(M, back ? null : M.p[k], P.parts[k], pc ? pc[k] : null, e => { M.p[k] = e; });
        for (const W of Array.from(P.wins.values())) {
          // (the page kept shown here although deleted elsewhere, and brought back by an edit made here: a window on it
          // that was deleted elsewhere too, and is as it was then, stays deleted)
          if (back && M.keepW && M.keepW[W.wid] === winH(W) && M.wgone[W.wid]) continue;
          const mw0 = back ? null : M.w[W.wid], tomb = !mw0 && M.wgone[W.wid];
          const mw = M.w[W.wid] = mw0 ? Object.assign({}, mw0, { ikey: W.ikey, p: Object.assign({}, mw0.p) }) : { ikey: W.ikey, p: {} };
          const cov = k => (back ? pc[`${W.wid}/${k}`] : tomb ? (tomb.cover || {})[k] : null);
          if (!mw0) {
            note(tomb ? now : W.parts.rect.at);
            items.push(n => { mw.p.exists = { h: '1', v: nv(tomb ? tomb.exists[1] : back ? pc[`${W.wid}/exists`] : {}, tomb ? now : W.parts.rect.at)(n), rev: W.parts.rect.rev }; delete M.wgone[W.wid]; touched.add(M); });
          } else if (mw.p.exists && mw.p.exists.rev !== W.parts.rect.rev) mw.p.exists = Object.assign({}, mw.p.exists, { rev: W.parts.rect.rev });
          for (const k of WIN_PARTS) part(M, mw0 ? mw0.p[k] : null, W.parts[k], cov(k), e => { mw.p[k] = e; });
        }
        // windows in the ledger that aren't here now: deleted here
        if (!back) winsGone(M, P);
      }
      // pages in the ledger that aren't here now (deleted here, past their Undo)
      for (const uid of Object.keys(L.mine)) {
        if (seenPages.has(uid)) continue;
        const P = local.pages.get(uid), M0 = L.mine[uid];
        if (M0.gone || (P && P.held) || o.mode === 'take') continue;
        if (P && !P.gone) continue;   // (here, but not stamped: a placeholder the ledger has, say)
        if (first) { delete L.mine[uid]; dropped1.add(uid); continue; }
        const M = mineOf(uid, M0.b);
        note(now);
        items.push(n => {
          const cover = {};
          for (const k of PAGE_PARTS) if (M.p[k] && M.p[k].v) cover[k] = vjoin(M.p[k].v[1], { [dev]: n });
          for (const [wid, mw] of Object.entries(M.w)) for (const k of WIN_PARTS.concat('exists')) if (mw.p[k] && mw.p[k].v) cover[`${wid}/${k}`] = vjoin(mw.p[k].v[1], { [dev]: n });
          M.gone = { exists: nv(M.p.exists ? M.p.exists.v[1] : {}, now)(n), cover, seq: null, seen: now };
          M.p = {}; M.w = {}; touched.add(M);
        });
      }
      // 3. the theme, accent and text style. A change made here is a version whose counter is when it was made (themeAt,
      // accentAt, lettersAt), not the newest change stamped with it, so that two made apart (one while unlinked, say)
      // resolve to the later on every device. A value this device had before it synced with this folder (joining it or
      // switching to it) is no change: only its fingerprint is noted, and the folder's applies. Nor is one never chosen
      // here: a value from before 2026.11.16-4 (2026.11.17-2 for the text style), or one only received, which a ledger
      // rebuilt from an own file older than the last merge doesn't have. A ledger of this folder from before then has no
      // entry for it: one chosen here since (on this release, before its first round: Chrome asking to Reconnect the
      // folder after the update, say) is a change, as old as the choice. An empty folder (seed) gets this device's, as
      // old as the choice (the counters it brings from another folder say nothing about when that was; ctr is still
      // raised to it, so later stamps stay above it); one never chosen here (the default) as the oldest version there
      // can be, so that a choice made on another device that set up the same folder at once, before either had the
      // other's file, wins on both. (Neither chose one: the tie goes by device id, the same on every device.)
      const style = Object.assign({}, L.sync.style), fresh = o.mode === 'join' || o.mode === 'take';
      let sn = 0, styled = 0;
      for (const k of STYLE_PARTS) {
        const lp = local.style && local.style[k], E = style[k];
        if (!lp || (E && E.h === lp.h)) continue;
        if (o.mode !== 'seed' && (!lp.chosen || (!E && fresh))) { style[k] = { h: lp.h }; continue; }
        const low = !E && !lp.chosen, n = low ? 1 : !E ? Math.max(1, fin(lp.at, now)) : Math.max(fin(lp.at, now), fin(o.ctr, 0) + 1, fin(o.maxSeen, 0) + 1);
        style[k] = { h: lp.h, v: arr({ by: dev, vv: vjoin(E && E.v ? E.v[1] : {}, { [dev]: n }), t: low ? 0 : fin(lp.at, now), u: false }) };
        sn = Math.max(sn, n); styled++;
      }
      if (!sameJSON(style, L.sync.style || {})) L.sync = Object.assign({}, L.sync, { style });
      let ctr = fin(o.ctr, 0);
      if (items.length) { ctr = Math.max(maxAt, ctr + 1, fin(o.maxSeen, 0) + 1); for (const f of items) f(ctr); }
      ctr = Math.max(ctr, sn);
      for (const M of touched) M.hist = Object.assign({}, M.hist, { local: true });
      for (const uid of cloned) if (L.mine[uid] && ledger0.mine[uid] && sameJSON(L.mine[uid], ledger0.mine[uid])) L.mine[uid] = ledger0.mine[uid];   // (unchanged: not written again)
      L.sync.ctr = ctr;
      const fixes = [];
      for (const [key, value] of fix) {
        const type = key.split(':')[0];
        fixes.push(value === null ? { key, del: true } : { key, type, value, rev: fixRev(key) });
      }
      local.fixes = fixes;
      for (const f of fixes) { const r = local.recs.get(f.key); if (r && !f.del) local.recs.set(f.key, Object.assign({}, r, { value: f.value, rev: f.rev })); }
      const rr = records(L);
      if (dropped1.size) L.dropped1 = dropped1;
      return { ledger: L, ctr, fixes, settings: sp, stamped: items.length + styled, partsChanged: items.length > 0 || fixes.length > 0 || styled > 0, put: rr.put, del: rr.del };
    }

    // ---- join: the ledger and the peers' files → for each part, the versions no other includes (the later main, and
    // for content the concurrent ones pending), and where each value is.
    function viewsOf(ledger, peers, dev) {
      const pages = new Map(), dropped = (ledger.sync && ledger.sync.dropped) || {};
      // (a deletion this device has collected (gc): the other devices' files may still hold it for a while, and it isn't
      // taken back from them)
      const collected = (k, T) => !!dropped[k] && leq(T.vv, dropped[k].vv);
      const pv = uid => { if (!pages.has(uid)) pages.set(uid, { exists: [], parts: {}, wins: new Map(), inPeers: false, ident: null }); return pages.get(uid); };
      const wv = (p, wid) => { if (!p.wins.has(wid)) p.wins.set(wid, { exists: [], parts: {}, ident: null }); return p.wins.get(wid); };
      const add = (o, k, v) => { (o[k] || (o[k] = [])).push(v); };
      for (const [uid, M] of Object.entries(ledger.mine)) {
        const p = pv(uid);
        if (M.gone) p.exists.push(ver(M.gone.exists, { h: '0', val: false, has: true, src: 'local', cover: M.gone.cover || {} }));
        else if (M.p && M.p.exists && M.p.exists.v) p.exists.push(ver(M.p.exists.v, { h: '1', val: true, has: true, src: 'local' }));
        for (const k of PAGE_PARTS) {
          const E = M.p && M.p[k];
          if (!E || !E.v) continue;
          add(p.parts, k, ver(E.v, { h: E.h, src: 'local', ref: E.ref }));
          for (const q of E.pending || []) add(p.parts, k, ver(q.v, { h: q.h, val: q.val, has: true, src: 'pending' }));
        }
        for (const [wid, mw] of Object.entries(M.w || {})) {
          const w = wv(p, wid), [widgetId, nStr] = String(mw.ikey || '').split(':');
          w.ident = w.ident || { widgetId, n: +nStr || 1 };
          if (mw.p.exists && mw.p.exists.v) w.exists.push(ver(mw.p.exists.v, { h: '1', val: true, has: true, src: 'local' }));
          for (const k of WIN_PARTS) {
            const E = mw.p[k];
            if (!E || !E.v) continue;
            add(w.parts, k, ver(E.v, { h: E.h, src: 'local' }));
            for (const q of E.pending || []) add(w.parts, k, ver(q.v, { h: q.h, val: q.val, has: true, src: 'pending' }));
          }
        }
        for (const [wid, T] of Object.entries(M.wgone || {})) wv(p, wid).exists.push(ver(T.exists, { h: '0', val: false, has: true, src: 'local', cover: T.cover || {} }));
      }
      const drop1 = ledger.dropped1 || new Set();
      for (const peer of peers) {
        for (const [uid, pp] of peer.pages) {
          if (peer.dev === dev && drop1.has(uid)) continue;
          const p = pv(uid);
          if (peer.dev !== dev) p.inPeers = true;
          p.exists.push(pp.exists);
          for (const k of PAGE_PARTS) if (pp.parts[k]) add(p.parts, k, pp.parts[k]);
          for (const [wid, pw] of pp.wins) {
            if (peer.dev === dev && drop1.has(`${uid} ${wid}`)) continue;
            const w = wv(p, wid);
            w.ident = w.ident || pw.ident;
            w.exists.push(pw.exists);
            for (const k of WIN_PARTS) if (pw.parts[k]) add(w.parts, k, pw.parts[k]);
            for (const q of pw.pending) add(w.parts, 'data', q);
          }
        }
        for (const [uid, T] of peer.gone.pages) { if (collected(uid, T)) continue; const p = pv(uid); if (peer.dev !== dev) p.inPeers = true; p.exists.push(T); }
        for (const T of peer.gone.wins.values()) if (!collected(`${T.page} ${T.wid}`, T.exists)) wv(pv(T.page), T.wid).exists.push(T.exists);
      }
      return pages;
    }
    // One part's versions → { main, pending }: dominated versions go, equal values become one (vectors joined), the later
    // is main. kind 'data': the others stay pending (both kept), and an emptied (null) one gives way to content;
    // 'lww': the later wins and its vector joins the others'.
    function joinVers(list, kind, dev, rank) {
      let vs = list.filter(Boolean);
      if (!vs.length) return null;
      const covers = vs.filter(v => v.cover);
      const merge = (g, v) => {
        const top = later(v, g, rank) > 0 ? v : g, other = top === v ? g : v;
        const out = Object.assign({}, top, { vv: vjoin(g.vv, v.vv) });
        if (other.src === 'local' && top.src !== 'local') { out.src = 'local'; out.has = other.has; out.val = other.val; out.scale = other.scale; out.ref = other.ref || top.ref; }
        else if (!top.has && other.has && top.src !== 'local') { out.has = true; out.val = other.val; out.src = other.src; out.scale = other.scale; }
        if (g.cover || v.cover) out.cover = vjoin(g.cover || {}, v.cover || {});
        if (!out.ref) out.ref = other.ref;
        return out;
      };
      for (let guard = 0; guard < 50; guard++) {
        const keep = [];
        for (const v0 of vs) {
          if (vs.some(w => w !== v0 && superseded(v0, w))) continue;
          // (what a version it replaces only by its device's later change had settled stays settled: its vector joins in)
          let v = v0;
          for (const u of vs) if (u !== v0 && !leq(u.vv, v.vv) && superseded(u, v0)) v = Object.assign({}, v, { vv: vjoin(v.vv, u.vv) });
          const i = keep.findIndex(w => w.h === v.h);
          if (i >= 0) keep[i] = merge(keep[i], v); else keep.push(v);
        }
        const same = keep.length === vs.length;
        vs = keep;
        if (same) break;
      }
      vs.sort((a, b) => later(b, a, rank));
      const J = { main: null, pending: [], clash: vs.length > 1, mine: vs.some(v => v.by === dev), devs: vs.map(v => v.by) };
      if (kind === 'data') {
        const content = vs.filter(v => v.h !== NULL_H), empty = vs.filter(v => v.h === NULL_H);
        if (content.length && empty.length) {
          J.main = Object.assign({}, content[0], { vv: empty.reduce((a, v) => vjoin(a, v.vv), content[0].vv) });
          J.pending = content.slice(1);
        } else { J.main = vs[0]; J.pending = vs.slice(1); }
      } else J.main = Object.assign({}, vs[0], { vv: vs.reduce((a, v) => vjoin(a, v.vv), {}) });
      if (covers.length) J.cover = covers.reduce((a, v) => { for (const k in v.cover) a[k] = vjoin(a[k] || {}, v.cover[k]); return a; }, {});
      return J;
    }
    function join(ledger0, peers, o = {}) {
      const dev = o.dev, now = fin(o.now, 0), mode = o.mode || null, isLater = o.isLater || (() => false);
      const views = viewsOf(ledger0, peers || [], dev);
      const state = { pages: new Map(), dev, mode, maxSeen: fin(ledger0.sync && ledger0.sync.maxSeen, 0), peers: [] };
      for (const peer of peers || []) {
        if (peer.dev === dev) continue;
        state.peers.push({ dev: peer.dev, seq: peer.seq, name: peer.name, at: peer.at, left: peer.left, folder: peer.folder });
        let m = 0;
        const see = v => { if (v && v.by !== dev) { const n = nOf(v); if (n > m) m = n; } };
        for (const pp of peer.pages.values()) { see(pp.exists); for (const k in pp.parts) see(pp.parts[k]); for (const pw of pp.wins.values()) { see(pw.exists); for (const k in pw.parts) see(pw.parts[k]); pw.pending.forEach(see); } }
        for (const T of peer.gone.pages.values()) see(T);
        for (const k in peer.style || {}) see(peer.style[k]);
        state.maxSeen = Math.max(state.maxSeen, Math.min(m, now + fin(o.aheadMax, DEF.aheadMs)));
      }
      for (const [uid, p] of views) {
        // 'join' (a device that never synced, joining a folder with a board): for pages both have, the folder's values stay
        const rank = mode === 'join' && p.inPeers ? v => (v.by === dev && (v.src === 'local' || v.src === 'pending') ? 0 : 1) : null;
        const S = { uid, exists: joinVers(p.exists, 'lww', dev, rank), parts: {}, wins: new Map(), inPeers: p.inPeers };
        if (!S.exists) continue;
        S.cover = S.exists.cover || null;
        // (and where the folder deleted the page or a window on it, this device's versions of it are its old copy, not
        // edits made since: the deletion covers them, and the Board history version saved before joining keeps them)
        const mineOf = list => (list || []).filter(v => v.by === dev && (v.src === 'local' || v.src === 'pending'));
        const coverMine = (C, key, list) => { for (const v of mineOf(list)) C[key] = vjoin(C[key] || {}, v.vv); };
        if (rank && S.exists.main.h === '0' && S.cover) {
          S.cover = Object.assign({}, S.cover);
          for (const k of PAGE_PARTS) coverMine(S.cover, k, p.parts[k]);
          for (const [wid, w] of p.wins) { coverMine(S.cover, `${wid}/exists`, w.exists); for (const k of WIN_PARTS) coverMine(S.cover, `${wid}/${k}`, w.parts[k]); }
        }
        for (const k of PAGE_PARTS) if (p.parts[k]) S.parts[k] = joinVers(p.parts[k], 'lww', dev, rank);
        for (const [wid, w] of p.wins) {
          const ex = joinVers(w.exists, 'lww', dev, rank);
          if (!ex) continue;
          const SW = { wid, ident: w.ident || { widgetId: wid.split('@')[0], n: 1 }, exists: ex, cover: ex.cover || null, parts: {} };
          if (rank && ex.main.h === '0' && SW.cover) { SW.cover = Object.assign({}, SW.cover); for (const k of WIN_PARTS) coverMine(SW.cover, k, w.parts[k]); }
          for (const k of WIN_PARTS) if (w.parts[k]) SW.parts[k] = joinVers(w.parts[k], k === 'data' && !isLater(SW.ident.widgetId) ? 'data' : 'lww', dev, rank);
          // (content a deletion of the window or its page had seen, still pending: it was deleted on purpose, and isn't
          // kept as a copy if an edit the deletion hadn't seen brings the window back. It joins the window's own version,
          // so that it stays settled once the deletion is no longer in any file.)
          const dc = [SW.cover && SW.cover.data, S.cover && S.cover[`${wid}/data`]].filter(Boolean), J = SW.parts.data;
          const gone = J && dc.length ? J.pending.filter(v => dc.some(C => covered(v, C))) : [];
          if (gone.length) SW.parts.data = Object.assign({}, J, { main: Object.assign({}, J.main, { vv: gone.reduce((a, v) => vjoin(a, v.vv), J.main.vv) }), pending: J.pending.filter(v => !gone.includes(v)) });
          const d = SW.parts.data;
          // the copy of a losing version is made by its author, or by anyone once the author is idle or gone (§4.2)
          if (d && d.pending.length) d.copy = d.pending.filter(v => v.by === dev || (o.idle && o.idle(v.by)) || (o.left && o.left(v.by)));
          S.wins.set(wid, SW);
        }
        state.pages.set(uid, S);
      }
      // the theme, accent and text style: the later change ('join': the folder's before this device's)
      state.style = {};
      for (const k of STYLE_PARTS) {
        const E = ((ledger0.sync || {}).style || {})[k], list = (peers || []).map(p => p.style && p.style[k]).filter(Boolean);
        if (E && E.v) list.push(ver(E.v, { h: E.h, src: 'local' }));
        const J = joinVers(list, 'lww', dev, mode === 'join' ? v => (v.by === dev && v.src === 'local' ? 0 : 1) : null);
        if (J) state.style[k] = J;
      }
      return state;
    }
    // Which pages and windows show, from the joined state alone (every device agrees): a deleted one shows again
    // if some version of a part that brings it back isn't covered by what its deleter had seen.
    function shown(state) {
      const pages = new Set(), wins = new Map();
      const out = (J, cover, open) => !!J && [J.main].concat(J.pending).some(v => (!open || v.h === TRUE_H) && !covered(v, cover));
      for (const [uid, S] of state.pages) {
        const alive = new Set();
        for (const [wid, W] of S.wins) {
          if (W.exists.main.h === '1' || (W.cover && WIN_PARTS.some(k => out(W.parts[k], W.cover[k], k === 'open')))) alive.add(wid);
        }
        let on = S.exists.main.h === '1';
        if (!on && S.cover) {
          on = PAGE_BACK.some(k => out(S.parts[k], S.cover[k])) ||
            Array.from(alive).some(wid => { const W = S.wins.get(wid); return !covered(W.exists.main, S.cover[`${wid}/exists`]) || WIN_PARTS.some(k => out(W.parts[k], S.cover[`${wid}/${k}`], k === 'open')); });
        }
        if (on) { pages.add(uid); wins.set(uid, alive); }
      }
      return { pages, wins };
    }
    // The pages whose winning photo is another device's: their pictures, read from Photos, go to plan as opts.photos.
    function photosWanted(state, local) {
      const out = [], sh = shown(state);
      for (const [uid, S] of state.pages) {
        const J = S.parts.photo, P = local.pages.get(uid);
        if (!sh.pages.has(uid) || !J || J.main.src === 'local' || J.main.h === '-' || (P && P.parts.photo.h === J.main.h)) continue;
        out.push({ uid, key: J.main.val, ref: J.main.ref || null });
      }
      return out;
    }

    // ---- plan: the writes, ledger and settings that make this device show the joined state, honoring holds; copies
    // made here; the summary for messages and Board history. Pass the same now as to stamp.
    function plan(state, local, ledger0, o = {}) {
      const H = local.H, dev = o.dev, now = fin(o.now, 0), mode = o.mode || state.mode || null;
      const L = own(ledger0), sh = shown(state);
      // (a counter for the versions the plan makes: o.n only if it hasn't been given out yet, never the stamp's, which a
      // version already published may have)
      let n = fin(o.n, 0) > fin(L.sync.ctr, 0) ? fin(o.n, 0) : 0;
      const N = () => n || (n = Math.max(fin(L.sync.ctr, 0) + 1, fin(state.maxSeen, 0) + 1, now));
      const nv = (base, t) => ({ by: dev, vv: vjoin(base || {}, { [dev]: N() }), t: fin(t, now), u: false });
      const W = new Map(), ifRev = {};
      const revOf = key => local.revs.get(key) || 0;
      const put = (key, type, value) => { ifRev[key] = revOf(key); const rev = Math.max(revOf(key) + 1, now); W.set(key, { key, type, value, rev }); return rev; };
      const del = key => { if (local.revs.has(key) || W.has(key)) { ifRev[key] = revOf(key); W.set(key, { key, del: true }); } return -1; };   // (-1: written, as no record)
      for (const f of local.fixes || []) { ifRev[f.key] = revOf(f.key); W.set(f.key, f.del ? { key: f.key, del: true } : Object.assign({}, f, { rev: Math.max(revOf(f.key) + 1, now) })); }
      // (switching to another folder's board isn't held back by a busy window: what it showed is in the Board history
      // version saved before switching, §3.5)
      const holdP = new Set(o.holds && o.holds.pages || []), holdW = new Set(mode === 'take' ? [] : o.holds && o.holds.wins || []), histFailed = new Set(o.histFailed || []);
      const dropHere = new Set(o.dropHere || []);   // (this device's own pages that an earlier take still has to remove here)
      const photos = o.photos || {}, isLater = o.isLater || (() => false), isSingle = o.isSingle || (() => false);
      const nameOf = d => (typeof o.names === 'function' ? o.names(d) : o.names && o.names[d]) || '';
      // (new page ids: o.freeIds.board() from the board, which also knows the ids Board history still uses; or a list, or the first free id)
      const free = Array.isArray(o.freeIds) ? o.freeIds.slice() : [];
      let nextB = typeof o.freeIds === 'number' ? o.freeIds : Math.max(0, fin(+local.settings.lastBoard, 0), ...Array.from(local.byB.keys())) + 1;
      const newB = () => (o.freeIds && typeof o.freeIds.board === 'function' ? o.freeIds.board() : free.length ? free.shift() : nextB++);
      const sum = { from: [], pages: {}, leave: null, placeholder: false, dropHere: [], held: 0, style: [] }, from = new Set();
      const undo = { swaps: [], skip: [] };
      const sp = { gone: [], order: {}, lastBoard: 0 };
      const ps = (uid, b) => sum.pages[uid] || (sum.pages[uid] = { b, name: '', changed: false, added: false, deleted: false, back: false, here: false, placeholder: false,
        renamed: null, risky: false, undone: null, mineUndone: null, clashes: [], quiet: false, from: [] });
      const valOf = (V, lp) => (V.src === 'local' ? (lp ? lp.val : null) : V.val);
      const anyShown = sh.pages.size > 0;
      const posOf = S2 => { const J = S2.parts.pos; if (!J) return 0; return fin(J.main.src === 'local' ? (local.pages.get(S2.uid) || { parts: { pos: {} } }).parts.pos.val : J.main.val, 0); };
      let joinTop = null;
      const joinOrder = [];
      if (mode === 'join') {
        for (const S2 of state.pages.values()) if (sh.pages.has(S2.uid)) { if (S2.inPeers) joinTop = Math.max(joinTop === null ? -Infinity : joinTop, posOf(S2)); else joinOrder.push(S2); }
        joinOrder.sort((a, c) => posOf(a) - posOf(c) || (a.uid < c.uid ? -1 : 1));
        joinOrder.splice(0, joinOrder.length, ...joinOrder.map(S2 => S2.uid));
      }
      const setMine = (uid, m) => { if (!L.mine[uid] || !sameJSON(L.mine[uid], m)) L.mine[uid] = m; };
      const tomb = (J, cover, T0) => ({ exists: arr(J.main), cover: cover || {}, seq: T0 ? T0.seq : null, seen: T0 ? T0.seen : now });
      // The value a part's entry carries in the ledger, and the entry itself.
      const pendOf = (J, lp) => J.pending.map(p => ({ v: arr(p), val: p.src === 'local' ? (lp ? lp.val : null) : p.val, h: p.h }));
      const entry = (J, lp, oldE, wrote, val, extra) => {
        const e = { h: J.main.h, v: arr(J.main), rev: wrote === -1 ? 0 : wrote || (lp ? lp.rev : 0) };
        if (J.pending.length) e.pending = pendOf(J, lp);
        if (wrote && (!oldE || oldE.h !== J.main.h)) {
          e.applied = wrote === -1 ? now : wrote;
          // (an earlier merge of this part that no write here has been based on yet: what was before it, and what it
          // wrote, count as old values too, see stamp; a change made without seeing either is concurrent with both)
          if (oldE && oldE.applied && (oldE.prevV || oldE.prevH)) Object.assign(e, { prevH: oldE.prevH, prevHs: Array.from(new Set((oldE.prevHs || []).concat(oldE.h))).slice(-8) }, oldE.prevV ? { prevV: oldE.prevV } : {});
          else if (oldE && oldE.v) { e.prevH = oldE.h; e.prevV = oldE.v; }
          // (no entry yet: a take, or a page shown here that the ledger had no part of. What this record held is still
          // the old value a tab that hadn't seen this write may save)
          else if (!oldE && lp && !lp.skipped) e.prevH = lp.h;
          if (val !== undefined) e.val = clone(val === undefined ? null : val);
        } else if (!wrote && oldE && oldE.applied && oldE.h === J.main.h) for (const k of ['applied', 'prevH', 'prevHs', 'prevV', 'prevSc', 'val']) if (k in oldE) e[k] = oldE[k];   // (kept until a write based on it: see stamp)
        return Object.assign(e, extra);
      };
      const uids = sortBy(Array.from(new Set(Array.from(state.pages.keys()).concat(Array.from(local.pages.keys())))), x => x);
      for (const uid of uids) {
        const S0 = state.pages.get(uid), LP = local.pages.get(uid), M = L.mine[uid];
        const S = S0 && Object.assign({}, S0, { parts: Object.assign({}, S0.parts) });
        if ((LP && LP.held) || holdP.has(uid)) { if (LP && !LP.gone) sp.order[LP.b] = [LP.parts.pos.val, uid]; continue; }
        if (!S) {
          // not in the ledger or the folder: an untouched placeholder (it goes once the folder has a board), or, when
          // switching to another folder's board, this device's own pages (deleted here only, and kept in Board history)
          if (!LP || LP.gone) continue;
          if ((LP.placeholder && anyShown) || mode === 'take' || dropHere.has(uid)) {
            if (uid === o.pageShown) { sum.leave = uid; sum.placeholder = !!LP.placeholder; sp.order[LP.b] = [LP.parts.pos.val, uid]; if (!LP.placeholder) sum.dropHere.push(uid); continue; }
            sp.gone.push(['add', LP.b, now]);
            Object.assign(ps(uid, LP.b), { deleted: true, here: true, placeholder: LP.placeholder, risky: !LP.placeholder, name: LP.parts.name.val });
          } else sp.order[LP.b] = [LP.parts.pos.val, uid];
          continue;
        }
        const show = sh.pages.has(uid);
        if (!show) {
          const wgone = {};
          for (const [wid, SW] of S.wins) if (SW.exists.main.h === '0') wgone[wid] = tomb(SW.exists, SW.cover, M && M.wgone && M.wgone[wid]);
          if (LP && !LP.gone) {
            if (histFailed.has(uid) || uid === o.pageShown) {
              if (uid === o.pageShown && !histFailed.has(uid)) sum.leave = uid; else sum.held++;
              sp.order[LP.b] = [LP.parts.pos.val, uid];
              // (no entry of its own, as in a new ledger, or joining, where this device's versions of it count as covered
              // by the deletion only in this round: the deletion, with what the page holds now, so that only an edit made
              // here brings it back)
              // (and of each window on it that was deleted elsewhere too, as it is here now: see stamp)
              const keepW = {};
              for (const wid of Object.keys(wgone)) if (LP.wins.has(wid)) keepW[wid] = winH(LP.wins.get(wid));
              if (!M || (!M.gone && (mode === 'join' || !M.p || !M.p.exists))) setMine(uid, Object.assign(newMine(uid, LP.b), { hist: (M && M.hist) || { at: 0, local: false }, gone: tomb(S.exists, S.cover, null), wgone, keep: keepH(LP) }, Object.keys(keepW).length ? { keepW } : {}));
              continue;
            }
            sp.gone.push(['add', LP.b, now]);
            Object.assign(ps(uid, LP.b), { deleted: true, changed: true, risky: true, name: LP.parts.name.val, from: [S.exists.main.by], at: fin(S.exists.main.t, now) });
            from.add(S.exists.main.by);
          }
          // (deleted here now: each window on it that was deleted elsewhere too, as it is here, so that the page's Undo
          // or Bring back doesn't bring that window back, see stamp. Kept while the page stays deleted)
          const kw = {};
          if (LP && !LP.gone) for (const wid of Object.keys(wgone)) if (LP.wins.has(wid)) kw[wid] = winH(LP.wins.get(wid));
          const keepW = Object.keys(kw).length ? kw : M && M.gone && M.keepW;
          setMine(uid, Object.assign({ uid, b: LP ? LP.b : M ? M.b : 0, p: {}, w: {}, hist: (M && M.hist) || { at: 0, local: false }, quiet: null,
            gone: tomb(S.exists, S.cover, M && M.gone), wgone }, keepW ? { keepW } : {}));
          continue;
        }
        // ---- a page that shows
        let b = LP ? LP.b : 0;
        const acc = { applied: [], replaced: [] };   // versions taken from other devices, and the entries they replaced
        const sumP = ps(uid, b);
        // back: 'returned' (brought back on another device: its Undo, Bring back, made again) or 'edit' (below)
        if (!LP) { b = newB(); sumP.b = b; if (M && M.gone) sumP.back = 'returned'; else sumP.added = true; sp.lastBoard = Math.max(sp.lastBoard, b); }
        else if (LP.gone) { sp.gone.push(['remove', b]); sumP.back = 'returned'; }
        const nm = { uid, b, p: {}, w: {}, hist: (M && M.hist) || { at: 0, local: false }, quiet: (M && M.quiet) || null, gone: null, wgone: {} };
        let pageChanged = !LP || LP.gone;
        // shown although deleted (an edit its deleter hadn't seen): the deletion's own version, as shown. Every device
        // does the same, and in a file a shown version beats the deletion with the same vector (§4.1: the larger h).
        const ex = S.exists.main;
        if (S.exists.main.h !== '1') sumP.back = 'edit';
        const tv = {}, held = {};
        // (a new size rescales every window on the page: it waits while one of them is busy)
        const busyHere = !!LP && !LP.gone && !(M && M.gone) && Array.from(LP.wins.values()).some(W2 => holdW.has(`${b}:${W2.ikey}`));
        for (const k of PAGE_PARTS) {
          const J = S.parts[k], lp = LP && LP.parts[k];
          if (!J) { tv[k] = lp ? lp.val : undefined; continue; }
          if (histFailed.has(uid) && J.clash && J.main.src !== 'local') held[k] = true;
          if (k === 'size' && busyHere && lp && lp.h !== J.main.h) held[k] = true;
          if (k === 'photo' && J.main.src !== 'local' && J.main.h !== '-' && (!lp || lp.h !== J.main.h) && !photos[uid]) held[k] = true;
          if (held[k]) sum.held++;
          tv[k] = held[k] ? (lp ? lp.val : k === 'photo' ? null : undefined) : valOf(J.main, lp);
          if (!held[k] && (!lp || lp.h !== J.main.h)) { if (J.main.src !== 'local') { acc.applied.push(J.main); if (M && M.p[k]) acc.replaced.push(M.p[k].v); } pageChanged = true; }
        }
        // join mode: this device's own pages go after the folder's
        if (mode === 'join' && !S.inPeers && S.parts.pos) {
          const at = joinOrder.indexOf(uid);
          if (at >= 0 && joinTop !== null) {
            tv.pos = joinTop + 1 + at;
            S.parts.pos = { main: Object.assign(nv(S.parts.pos.main.vv, now), { h: hj(tv.pos), src: 'plan' }), pending: [], clash: false };
            pageChanged = true;
          }
        }
        const size = tv.size || { scale: H.scale, shape: '16:9' };
        // the board record
        let boardRev = 0;
        const oldName = LP ? LP.parts.name.val : null;
        if (!LP || LP.gone || ['name', 'look', 'size', 'pos'].some(k => S.parts[k] && !held[k] && (!LP.parts[k] || LP.parts[k].h !== S.parts[k].main.h))) {
          const base = LP ? clone(LP.value) || {} : {};
          boardRev = put(`board:${b}`, 'board', Object.assign(base, { id: b, uid, name: typeof tv.name === 'string' ? tv.name : 'Page 1', background: clone(tv.look) || { color: null, pattern: 'none' },
            scale: size.scale, shape: size.shape, layout: H.canvasFor(size.scale), pos: fin(tv.pos, 0) }));
        }
        nm.p.exists = { h: '1', v: arr(ex), rev: boardRev || (LP ? LP.rec.rev || 0 : 0) };
        for (const k of ['name', 'look', 'size', 'pos']) {
          const J = S.parts[k], lp = LP && LP.parts[k];
          if (!J) { if (M && M.p[k]) nm.p[k] = M.p[k]; continue; }
          if (held[k]) { if (M && M.p[k]) nm.p[k] = M.p[k]; continue; }
          // (only the parts this write changed are noted as written by it: another part of the record keeps what an earlier
          // merge noted, see stamp)
          const chg = !!boardRev && (!lp || lp.h !== J.main.h);
          nm.p[k] = entry(J, lp, M && M.p[k], chg ? boardRev : 0, tv[k]);
          if (boardRev && !chg) nm.p[k].rev = boardRev;
        }
        // the photo and its look
        {
          const J = S.parts.photo, lp = LP && LP.parts.photo;
          if (J && held.photo) nm.p.photo = M && M.p.photo ? M.p.photo : { hold: 1, h: lp ? lp.h : '-', seen: arr(J.main) };
          else if (J) {
            let rev = 0;
            if (!lp || lp.h !== J.main.h) rev = J.main.h === '-' ? del(`media:${b}:background`) : put(`media:${b}:background`, 'media', clone(photos[uid]));
            const ref = J.main.src === 'local' ? (M && M.p.photo && M.p.photo.h === J.main.h ? M.p.photo.ref : undefined) : J.main.ref;
            const keep = M && M.p.photo && M.p.photo.h === J.main.h && M.p.photo.put ? { put: M.p.photo.put } : {};
            nm.p.photo = entry(J, lp, M && M.p.photo, rev, undefined, Object.assign(ref ? { ref } : {}, keep));
          } else if (M && M.p.photo) nm.p.photo = M.p.photo;
          const JL = S.parts.photoLook, ll = LP && LP.parts.photoLook;
          if (JL && !held.photoLook) {
            let rev = 0;
            if (!ll || ll.h !== JL.main.h) rev = JL.main.h === NULL_H ? del(`media:${b}:background-look`) : put(`media:${b}:background-look`, 'media', clone(tv.photoLook));
            nm.p.photoLook = entry(JL, ll, M && M.p.photoLook, rev, tv.photoLook);
          } else if (M && M.p.photoLook) nm.p.photoLook = M.p.photoLook;
        }
        // ---- its windows
        const tScale = size.scale, lScale = LP ? LP.scale : tScale;
        const wins = sortBy(Array.from(new Set(Array.from(S.wins.keys()).concat(LP ? Array.from(LP.wins.keys()) : []))), x => x);
        const shownW = sh.wins.get(uid) || new Set();
        const used = new Map(), useN = (wg, n2) => { if (!used.has(wg)) used.set(wg, new Set()); used.get(wg).add(n2); };
        const freeN = (wg, want) => { const s = used.get(wg) || new Set(); let k = want && !s.has(want) ? want : 1; while (s.has(k)) k++; useN(wg, k); return k; };
        const zBase = o.zTop ? o.zTop(uid) : 1;
        let zk = 0;
        const targets = [];
        for (const wid of wins) {
          const SW = S.wins.get(wid), LW = LP && LP.wins.get(wid), mw0 = M && M.w[wid];
          const busy = !!LW && !LP.gone && !(M && M.gone) && holdW.has(`${b}:${LW.ikey}`);   // (a page coming back isn't shown: nothing in it is busy)
          if (busy) {   // all its parts keep this device's version (and the round is owed, if the merge would change it)
            useN(LW.widgetId, LW.n); if (mw0) nm.w[wid] = mw0;
            if (!SW || !shownW.has(wid) || WIN_PARTS.some(k => SW.parts[k] && (SW.parts[k].main.src !== 'local' || SW.parts[k].pending.length))) sum.held++;
            continue;
          }
          if (!SW) {
            if (LW && !LP.gone && mode !== 'take' && !(M && M.gone)) { useN(LW.widgetId, LW.n); if (mw0) nm.w[wid] = mw0; continue; }
            if (LW) { for (const k of ['inst', 'data', 'conf']) del(LW.keys[k]); pageChanged = true; }   // (here only: the folder never had it)
            continue;
          }
          if (!shownW.has(wid)) {
            if (LW && histFailed.has(uid) && !LP.gone) { useN(LW.widgetId, LW.n); if (mw0) nm.w[wid] = mw0; sum.held++; continue; }   // waits for a Board history version
            if (LW) {
              for (const k of ['inst', 'data', 'conf']) del(LW.keys[k]);
              pageChanged = true; sumP.risky = true;
              if (!LP.gone) { acc.applied.push(SW.exists.main); if (mw0 && mw0.p.exists) acc.replaced.push(mw0.p.exists.v); }
            }
            if (SW.exists.main.h === '0' || LW || mw0) nm.wgone[wid] = tomb(SW.exists, SW.cover, M && M.wgone && M.wgone[wid]);
            continue;
          }
          if (LW) useN(LW.widgetId, LW.n);
          targets.push({ wid, SW: Object.assign({}, SW, { parts: Object.assign({}, SW.parts) }), LW, mw0 });
        }
        // the windows that show: their values, at this page's scale
        for (const T of targets) {
          const { SW, LW } = T, t = T.t = {}, wg = SW.ident.widgetId;
          T.widgetId = LW ? LW.widgetId : wg;
          T.n = LW ? LW.n : freeN(wg, SW.ident.n);
          T.ikey = `${T.widgetId}:${T.n}`;
          for (const k of WIN_PARTS) {
            const J = SW.parts[k], lp = LW && LW.parts[k];
            if (!J) { t[k] = lp ? lp.val : k === 'rect' ? { rect: normRect(null), maximized: false } : k === 'open' ? false : null; continue; }
            if (histFailed.has(uid) && J.clash && J.main.src !== 'local') { (T.held || (T.held = {}))[k] = true; t[k] = lp ? lp.val : null; sum.held++; continue; }
            if (k === 'data' && isLater(T.widgetId) && J.pending.length) {   // Timer, Dice, Traffic light: the later state wins
              SW.parts.data = Object.assign({}, J, { main: Object.assign({}, J.main, { vv: J.pending.reduce((a, v) => vjoin(a, v.vv), J.main.vv) }), pending: [], copy: [] });
            }
            const J2 = SW.parts[k];
            t[k] = valOf(J2.main, lp);
            if (k === 'rect') {
              const sc = J2.main.src === 'local' || J2.main.src === 'pending' ? lScale : fin(J2.main.scale, tScale);
              const v = t.rect || { rect: normRect(null), maximized: false };
              t.rect = Math.abs(sc - tScale) < 1e-9 ? { rect: normRect(v.rect), maximized: !!v.maximized } : { rect: H.scaleRect(normRect(v.rect), sc / tScale), maximized: !!v.maximized };
            }
          }
          T.exists = SW.exists.main;
          if (SW.exists.main.h !== '1') sumP.risky = true;
        }
        // copies: a version that lost, kept beside its window (made by its author, or by anyone once the author is idle or gone)
        const copies = [];
        for (const T of targets) {
          const J0 = T.SW.parts.data;
          if (!J0 || !J0.copy || !J0.copy.length || isLater(T.widgetId) || (T.held && T.held.data)) continue;
          const J = T.SW.parts.data = Object.assign({}, J0);
          for (const Pv of sortBy(J0.copy || [], v => `${v.by}:${nOf(v)}`)) {
            const cw = copyWid(T.wid, Pv);
            // (its copy is there now: the version joins the window's own, so no device finds that clash again)
            J.main = Object.assign({}, J.main, { vv: vjoin(J.main.vv, Pv.vv) });
            J.pending = J.pending.filter(x => x !== Pv);
            // already made (here or elsewhere), or the same edit under another counter (a device that lost its ledger
            // stamped it again): already kept
            const same = W2 => { const lb = W2.parts.label, lw = LP && LP.wins.get(W2.wid); return lb && sameLabel(valOf(lb.main, lw && lw.parts.label), T.wid, Pv); };
            if (S.wins.has(cw) || copies.some(c => c.wid === cw || (c.T.wid === T.wid && c.P.by === Pv.by && c.P.t === Pv.t)) || Array.from(S.wins.values()).some(same)) continue;
            const val0 = Pv.src === 'local' ? (T.LW ? T.LW.parts.data.val : null) : Pv.val, val = T.widgetId === 'task-timer' ? pauseTask(val0, Pv.t) : val0;
            copies.push({ wid: cw, T, P: Pv, val });
            sumP.clashes.push({ wid: T.wid, widgetId: T.widgetId, mine: Pv.by === dev || J.main.by === dev, devs: [J.main.by, Pv.by] });
            sumP.risky = true;
            if (Pv.by === dev) undo.swaps.push({ page: uid, wid: T.wid, copyWid: cw, t: J.main.t });   // (t: the other device's version's time, for the copy's label after a swap)
          }
          delete J.copy;
        }
        // (a version whose copy waits for its author, or for its author to be idle: the round is owed)
        for (const T of targets) if (T.SW.parts.data && T.SW.parts.data.pending.length && !isLater(T.widgetId)) sum.held++;
        // one window only (21Sketch...): the earliest stays open
        const singles = new Map();
        for (const T of targets) if (T.t.open && isSingle(T.widgetId)) { if (!singles.has(T.widgetId)) singles.set(T.widgetId, []); singles.get(T.widgetId).push(T); }
        for (const list of singles.values()) {
          if (list.length < 2) continue;
          list.sort((a, c) => fin(a.SW.ident.createdAt != null ? a.SW.ident.createdAt : a.LW && a.LW.createdAt, 0) - fin(c.SW.ident.createdAt != null ? c.SW.ident.createdAt : c.LW && c.LW.createdAt, 0) || (a.wid < c.wid ? -1 : 1));
          for (const T of list.slice(1)) {
            T.t.open = false;
            const J = T.SW.parts.open;
            T.SW.parts.open = { main: Object.assign(nv(J ? J.main.vv : {}, now), { h: hj(false), src: 'plan' }), pending: [], clash: false };
          }
        }
        // write them
        for (const T of targets) {
          const { SW, LW, mw0, t } = T, mw = { ikey: T.ikey, p: {} };
          const created = !LW;
          const ident = SW.ident || {};
          const ch = k => SW.parts[k] && !(T.held && T.held[k]) && (!LW || !sameJSON(LW.parts[k].val, t[k]));
          const movedThere = SW.parts.rect && SW.parts.rect.main.src !== 'local' && LW && LW.parts.rect.h !== SW.parts.rect.main.h;
          const reopened = LW && t.open && !LW.parts.open.val;
          let z = LW ? LW.z : zBase + zk++;
          if (LW && (movedThere || reopened)) z = zBase + zk++;
          let instRev = 0;
          if (created || ch('rect') || ch('open') || ch('label') || z !== (LW && LW.z)) {
            const iv = Object.assign(LW ? clone(LW.inst) || {} : {}, { widgetId: T.widgetId, n: T.n, open: !!t.open, rect: t.rect.rect, z, maximized: !!t.rect.maximized,
              createdAt: LW ? LW.createdAt : fin(ident.createdAt, now), wid: T.wid, copyOf: t.label || null });
            instRev = put(`inst:${b}:${T.ikey}`, 'inst', iv);
          }
          const keys = { data: `data:${b}:${T.ikey}`, conf: `conf:${b}:${T.ikey}` };
          const revs = { rect: instRev, open: instRev, label: instRev };
          for (const k of ['data', 'conf']) {
            const J = SW.parts[k], lp = LW && LW.parts[k];
            if (!J || (T.held && T.held[k]) || (lp && lp.h === J.main.h) || (!lp && J.main.h === NULL_H)) continue;
            if (lp && lp.skipped && J.main.src === 'local') continue;
            revs[k] = J.main.h === NULL_H ? del(keys[k]) : put(keys[k], k, clone(t[k]));
          }
          for (const k of WIN_PARTS) {
            const J = SW.parts[k];
            if (!J) { if (mw0 && mw0.p[k]) mw.p[k] = mw0.p[k]; continue; }
            if (T.held && T.held[k]) { mw.p[k] = mw0.p[k]; continue; }
            const lp = LW && LW.parts[k], changedHere = !lp || lp.h !== J.main.h;
            if (changedHere && J.main.src !== 'local' && J.main.src !== 'plan') { acc.applied.push(J.main); if (mw0 && mw0.p[k]) acc.replaced.push(mw0.p[k].v); }
            if (changedHere || (k === 'rect' && ch('rect'))) pageChanged = true;
            const wrote = changedHere || (k === 'rect' && ch('rect')) ? revs[k] || 0 : 0;
            mw.p[k] = entry(J, lp, mw0 && mw0.p[k], wrote, t[k]);
            if (!wrote) mw.p[k].rev = revs[k] > 0 ? revs[k] : lp ? lp.rev : 0;
            if (k === 'rect') {   // a place converted to this page's scale may round to another fingerprint: noted, so it isn't taken for a move
              const lh = wrote ? partH('rect', t.rect, tScale, H) : lp && lp.h !== J.main.h ? lp.h : mw0 && mw0.p.rect && mw0.p.rect.lh;
              if (lh && lh !== J.main.h) mw.p.rect.lh = lh;
              const s1 = wrote ? s1Of(t.rect, tScale, H) : mw0 && mw0.p.rect && mw0.p.rect.s1 && mw0.p.rect.h === J.main.h ? mw0.p.rect.s1 : lp ? s1Of(lp.val, lScale, H) : null;
              if (s1) mw.p.rect.s1 = s1;
              // (the page's scale changed here: the place was written at the new one. A tab that hadn't seen it, writing back
              // the place it showed, in the old scale's coordinates, is found by its fingerprint at the old scale: prevSc)
              if (wrote && lp && Math.abs(lScale - tScale) > 1e-9) Object.assign(mw.p.rect, { applied: wrote, prevSc: lScale, val: clone(t.rect) }, mw.p.rect.prevH ? {} : { prevH: lp.h, prevV: (mw0 && mw0.p.rect && mw0.p.rect.v) || mw.p.rect.v });
            }
          }
          mw.p.exists = { h: '1', v: arr(T.exists), rev: instRev || (LW ? LW.parts.rect.rev : 0) };
          nm.w[T.wid] = mw;
          if (created) {
            pageChanged = true;
            if (SW.exists.main.src !== 'local') { acc.applied.push(SW.exists.main); sumP.risky = sumP.risky || !!(M && M.wgone && M.wgone[T.wid]); }
            if (t.label && t.label.from !== dev) {
              const orig = S.wins.get(t.label.wid), od = orig && orig.parts.data;
              sumP.clashes.push({ wid: t.label.wid, widgetId: T.widgetId, mine: !!(od && od.main.by === dev), devs: [od ? od.main.by : '', t.label.from], arrived: true });
              undo.skip.push(`inst:${b}:${T.ikey}`, keys.data, keys.conf);
            }
          }
        }
        for (const c of copies) {
          const T = c.T, n2 = freeN(T.widgetId), ik = `${T.widgetId}:${n2}`, near = T.t.rect.rect;
          let rect = o.place ? o.place(uid, clone(near), clone(near)) : { x: near.x + 32, y: near.y + 32, w: near.w, h: near.h };
          rect = normRect(rect);
          const over = Math.min(rect.x + rect.w, near.x + near.w) - Math.max(rect.x, near.x) > 0.5 && Math.min(rect.y + rect.h, near.y + near.h) - Math.max(rect.y, near.y) > 0.5;
          const origZ = T.LW ? T.LW.z : zBase;
          const label = { wid: T.wid, from: c.P.by, name: nameOf(c.P.by), at: c.P.t };
          const iv = { widgetId: T.widgetId, n: n2, open: true, rect, z: over ? Math.max(0, origZ - 1) : zBase + zk++, maximized: false, createdAt: fin(c.P.t, now), wid: c.wid, copyOf: label };
          const instRev = put(`inst:${b}:${ik}`, 'inst', iv);
          const conf = T.t.conf, dataH = hj(c.val);
          const dataRev = c.val === null ? 0 : put(`data:${b}:${ik}`, 'data', clone(c.val));
          const confRev = conf === null || conf === undefined ? 0 : put(`conf:${b}:${ik}`, 'conf', clone(conf));
          // (its parts' versions are the copy's own: made by "the copy", a key from its wid that no device has (14
          // characters, a device's are 12), with the copied version's counter and time. So a copy made by the author and
          // one made by a fallback device are one, whatever else each had joined into that version, and no change that
          // never saw the copy, even its author's, is taken to include it or to come after it)
          const cby = ('cp' + hash53(c.wid)).padEnd(14, '0').slice(0, 14);
          const cv = arr({ by: cby, vv: { [cby]: Math.max(1, nOf(c.P)) }, t: c.P.t, u: false });
          const mk = (h, val, rev) => Object.assign({ h, v: cv, rev }, rev > 0 ? { applied: rev, val: clone(val === undefined ? null : val) } : {});
          nm.w[c.wid] = { ikey: ik, p: {
            exists: mk('1', true, instRev), rect: Object.assign(mk(partH('rect', { rect, maximized: false }, tScale, H), null, instRev), { s1: s1Of({ rect, maximized: false }, tScale, H) }), open: mk(TRUE_H, true, instRev),
            label: mk(hj(label), label, instRev), conf: mk(hj(conf === undefined ? null : conf), conf, confRev), data: mk(dataH, c.val, dataRev) } };
          pageChanged = true;
        }
        for (const [wid, T0] of Object.entries((M && M.wgone) || {})) if (!nm.w[wid] && !nm.wgone[wid] && !S.wins.has(wid)) nm.wgone[wid] = T0;
        // (a copy's versions are by "the copy", no device: they are credited to the device whose file brought them)
        const devsHere = Array.from(new Set(acc.applied.map(v => (DEV_RE.test(v.by) ? v.by : v.src)).filter(d => d !== dev && DEV_RE.test(d || ''))));
        // (at: when it was merged here, for "shown since"; t: when the newest of those changes was made, to say)
        if (pageChanged && uid !== o.pageShown && LP && !LP.gone && devsHere.length) {
          const t = Math.max(fin(nm.quiet && nm.quiet.t, 0), ...acc.applied.filter(v => v.by !== dev).map(v => fin(v.t, 0)));
          nm.quiet = { from: Array.from(new Set(((nm.quiet && nm.quiet.from) || []).concat(devsHere))), at: now, t: t || now }; sumP.quiet = true;
        }
        setMine(uid, nm);
        sp.order[b] = [fin(tv.pos, 0), uid];
        // the summary of this page
        sumP.name = typeof tv.name === 'string' ? tv.name : 'Page 1';
        sumP.changed = sumP.changed || pageChanged;
        devsHere.forEach(d => from.add(d));
        sumP.from = devsHere;
        if (acc.applied.length) { sumP.undone = acc.applied.every(v => v.u); sumP.mineUndone = acc.replaced.length > 0 && acc.replaced.every(v => v[0] === dev); }
        const NJ = S.parts.name;
        if (NJ && NJ.clash && NJ.mine && NJ.main.src !== 'local' && !held.name && oldName !== tv.name) sumP.renamed = { name: tv.name, by: NJ.main.by };
        if ((S.parts.photo && !held.photo && LP && LP.parts.photo.h !== '-' && LP.parts.photo.h !== S.parts.photo.main.h) ||
          ['name', 'look', 'size', 'pos', 'photoLook'].some(k => S.parts[k] && S.parts[k].clash && S.parts[k].main.src !== 'local' && !held[k]) ||
          targets.some(T => WIN_PARTS.some(k => T.SW.parts[k] && T.SW.parts[k].clash && T.SW.parts[k].main.src !== 'local')) ||
          targets.some(T => T.LW && T.LW.parts.data.val !== null && T.t.data === null)) sumP.risky = true;
        if (!sumP.changed && !sumP.deleted) delete sum.pages[uid];
      }
      sum.from = Array.from(from);
      // the theme, accent and text style: another device's change is written to settings (a patch of those keys only),
      // and said (sum.style: [{by, theme, accent, letters, accentColor}], by device; not when joining or switching to the
      // folder's board, which nobody has just changed). With no version anywhere, this device's own is only noted. A
      // version nobody chose (t 0: a default an empty folder was set up with) is nobody's change: it is never said, and it
      // never replaces a value this device had before it synced that part (no version here: a smartboard that joined on
      // 2026.11.16-4 keeps its own text style until one is chosen on any device).
      const style = {};
      for (const k of STYLE_PARTS) {
        const J = state.style && state.style[k], lp = local.style && local.style[k], E = (L.sync.style || {})[k];
        if (!J || !lp) { if (E || lp) style[k] = E || { h: lp.h }; continue; }
        if (J.main.src !== 'local' && J.main.h !== lp.h && J.main.has) {
          const none = !fin(J.main.t, 0);
          if (none && !(E && E.v) && mode !== 'join' && mode !== 'take') { style[k] = { h: lp.h }; continue; }
          (sp.set || (sp.set = {}))[k] = J.main.val;
          if (mode === 'join' || mode === 'take' || none) { style[k] = { h: J.main.h, v: arr(J.main) }; continue; }
          let said = sum.style.find(x => x.by === J.main.by);
          if (!said) sum.style.push(said = { by: J.main.by });
          said[k] = J.main.val;
        }
        style[k] = { h: J.main.h, v: arr(J.main) };
      }
      L.sync.style = style;
      const peers = Object.assign({}, L.sync.peers);
      for (const p of state.peers) {
        const was = peers[p.dev] || {};
        peers[p.dev] = Object.assign({}, was, { seq: Math.max(fin(was.seq, 0), fin(p.seq, 0)), name: p.name, at: p.at, left: p.left || null, missingSince: 0,
          changedAt: fin(p.seq, 0) > fin(was.seq, 0) ? now : fin(was.changedAt, now) });
      }
      const changedAny = Object.values(sum.pages).some(x => x.changed || x.deleted) && sum.from.length;
      L.sync = Object.assign(L.sync, { ctr: Math.max(fin(L.sync.ctr, 0), n), maxSeen: Math.max(fin(L.sync.maxSeen, 0), fin(state.maxSeen, 0)), peers,
        last: changedAny ? { dev: sum.from[0], name: nameOf(sum.from[0]), at: now } : L.sync.last || null, mode: null, first: false });
      const rr = records(L);
      return { writes: Array.from(W.values()), ifRev, settings: stored => patchSettings(stored, sp), settingsPatch: sp,
        ledger: { put: rr.put, del: rr.del }, sync: L.sync, next: L, summary: sum, undo };
    }

    // ---- the device file: this device's whole board as an all-pages backup (Import opens it), with each part's version
    function encode(ledger0, local, m = {}) {
      const H = local.H, pages = [], goneP = [], goneW = [], canon = [];
      for (const uid of Object.keys(ledger0.mine).sort()) {
        const M = ledger0.mine[uid];
        if (M.gone) goneP.push({ uid, exists: M.gone.exists, cover: M.gone.cover || {} });
        for (const wid of Object.keys(M.wgone || {}).sort()) goneW.push({ page: uid, wid, exists: M.wgone[wid].exists, cover: M.wgone[wid].cover || {} });
        const P = local.pages.get(uid);
        if (M.gone || !P || !M.p.exists || !M.p.exists.v) continue;
        const v = {}, has = k => M.p[k] && M.p[k].v && !(P.parts[k] && P.parts[k].skipped);
        v.exists = M.p.exists.v;
        for (const k of PAGE_PARTS) if (has(k)) v[k] = M.p[k].v;
        const size = P.parts.size.val, board = { name: P.parts.name.val, background: P.parts.look.val, scale: size.scale, shape: size.shape, uid, pos: P.parts.pos.val };
        let media;
        const key = P.parts.photo.val, ref = key ? (m.refs && m.refs[key]) || (M.p.photo && M.p.photo.h === key && M.p.photo.ref) : null;
        if (v.photo && key && !ref) delete v.photo;   // (a photo not in Photos yet: no version of it in the file)
        if (v.photo && key) media = { background: clone(ref) };
        if (v.photoLook && P.parts.photoLook.val) media = Object.assign(media || {}, { look: clone(P.parts.photoLook.val) });
        const instances = [];
        for (const wid of Array.from(P.wins.keys()).sort()) {
          const W = P.wins.get(wid), mw = M.w[wid];
          if (!mw || !mw.p.exists || !mw.p.exists.v) continue;
          const iv = { exists: mw.p.exists.v }, i = { widgetId: W.widgetId, instance: W.n, wid, open: W.parts.open.val, maximized: W.parts.rect.val.maximized, z: W.z,
            rect: W.parts.rect.val.rect, createdAt: W.createdAt };
          if (W.parts.label.val) i.copyOf = W.parts.label.val;
          for (const k of WIN_PARTS) if (mw.p[k] && mw.p[k].v && !W.parts[k].skipped) iv[k] = mw.p[k].v;
          if (mw.p.rect && mw.p.rect.lh && W.parts.rect.h === mw.p.rect.lh) i.vh = { rect: mw.p.rect.h };   // (the place converted from another scale: still that version)
          if (iv.conf) i.config = W.parts.conf.val;
          if (iv.data) i.data = W.parts.data.val;
          i.v = iv;
          const pend = mw.p.data && mw.p.data.pending;
          if (iv.data && pend && pend.length) i.pending = { data: pend.map(q => ({ v: q.v, val: q.val })) };
          instances.push(i);
        }
        const C = H.canvasFor(size.scale);
        let vw = C.w, vh = C.h;
        if (size.shape === 'free') for (const i of instances) { vw = Math.max(vw, Math.ceil(i.rect.x + i.rect.w)); vh = Math.max(vh, Math.ceil(i.rect.y + i.rect.h)); }
        board.v = v;
        pages.push(Object.assign({ viewport: { width: vw, height: vh }, board }, media ? { media } : {}, { instances }));
        // (what the parts fingerprint covers: each part's fingerprint and version, not its value again)
        canon.push([uid, PAGE_PARTS.map(k => (v[k] ? P.parts[k].h : 0)), v, media ? [media.background || null, media.look ? P.parts.photoLook.h : 0] : 0,
          instances.map(i => { const W2 = P.wins.get(i.wid); return [i.wid, i.widgetId, i.instance, i.createdAt, WIN_PARTS.map(k => (i.v[k] ? W2.parts[k].h : 0)), i.v, i.vh || 0, i.pending ? i.pending.data.map(q => [q.v, hj(q.val)]) : 0]; })]);
      }
      pages.sort((a, c) => a.board.pos - c.board.pos || (a.board.uid < c.board.uid ? -1 : 1));
      const main = pages[0] || { viewport: { width: 2400, height: 1350 }, board: null, instances: [] };
      // the theme, accent and text style, as any export has them, and their versions (sync.style) while the values are
      // the ones stamped
      const ls = local.style || {}, val = k => (ls[k] ? ls[k].val : m[k] || null), style = {};
      for (const k of STYLE_PARTS) { const E = ((ledger0.sync || {}).style || {})[k]; if (E && E.v && ls[k] && E.h === ls[k].h) style[k] = E.v; }
      const obj = { format: '21board', formatVersion: 1, kind: 'full', exportedAt: new Date(fin(m.at, 0)).toISOString(), generator: m.generator || '21Board',
        viewport: main.viewport };
      for (const k of STYLE_PARTS) obj[k] = val(k);
      obj.board = main.board;
      if (main.media) obj.media = main.media;
      obj.instances = main.instances;
      if (pages.length > 1) obj.pages = pages.map((p, i) => (i === 0 ? { main: true } : p));
      obj.sync = { v: 1, dev: m.dev, folder: m.folder || null, name: m.name || '', seq: m.seq || 0, write: m.write || '', at: fin(m.at, 0), merged: m.merged || {},
        gone: { pages: goneP, windows: goneW }, style, left: m.left || null, sum: '' };
      // Bookkeeping (seq, write, at, merged) and z never make a write: only the parts do.
      const partsH = hash53(JSON.stringify([m.name || '', m.folder || null, m.left || null, goneP, goneW, canon, STYLE_PARTS.map(k => obj[k]).concat([style])]));
      return { obj, partsH };
    }
    // The text a file's checksum is taken over: the file with its sum left empty (as its writer had it).
    function sumText(obj) {
      const o = Object.assign({}, obj);
      o.sync = Object.assign({}, obj.sync, { sum: '' });
      return JSON.stringify(o);
    }
    // A device file (parsed, checksum checked) → a peer, leaving out units that aren't well formed (a missing unit is
    // never a deletion), or null if it isn't one. newer: made by a newer 21Board (not merged).
    function decode(obj, o = {}) {
      const H = helpers(o);
      if (!obj || typeof obj !== 'object' || obj.format !== '21board' || !obj.sync || typeof obj.sync !== 'object') return null;
      const s = obj.sync;
      if (s.v !== 1) return typeof s.v === 'number' && s.v > 1 ? { peer: null, skipped: [], newer: true } : null;
      if (!DEV_RE.test(s.dev || '')) return null;
      const skipped = [];
      let newer = false;
      const peer = { dev: s.dev, folder: typeof s.folder === 'string' ? s.folder.slice(0, 40) : null, name: typeof s.name === 'string' ? s.name.slice(0, 60) : '',
        seq: fin(s.seq, 0), write: typeof s.write === 'string' ? s.write.slice(0, 40) : '', at: fin(s.at, 0), left: s.left && typeof s.left === 'object' ? { at: fin(s.left.at, 0), erased: !!s.left.erased } : null,
        merged: {}, pages: new Map(), gone: { pages: new Map(), wins: new Map() } };
      if (s.merged && typeof s.merged === 'object') for (const [k, v] of Object.entries(s.merged)) if (DEV_RE.test(k) && typeof v === 'number') peer.merged[k] = v;
      const V = (a, x) => { const ok = okV(a); if (ok === 2) newer = true; return ok === 1 ? ver(a, Object.assign({ src: s.dev, has: true }, x)) : null; };
      const vvOk = v => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 500 && Object.entries(v).every(([k, n]) => KEY_RE.test(k) && typeof n === 'number' && isFinite(n) && n >= 0);
      const cover = c => { const out = {}; if (c && typeof c === 'object') for (const [k, v] of Object.entries(c)) if (/^[\w.@~/-]{1,140}$/.test(k) && vvOk(v)) out[k] = v; return out; };
      const pageOf = e => {
        const bd = e && e.board, v = bd && bd.v;
        if (!bd || typeof bd !== 'object' || !H.UID_RE.test(bd.uid || '') || !v || typeof v !== 'object') throw new Error('page');
        const exists = V(v.exists, { h: '1', val: true });
        if (!exists) throw new Error('page');
        const pv = pageVals(bd, H), sc = pv.size.scale, pp = { uid: bd.uid, scale: sc, exists, parts: {}, wins: new Map() };
        for (const k of ['name', 'look', 'size', 'pos']) {
          if (!v[k] || (k === 'name' && typeof bd.name !== 'string') || (k === 'pos' && pv.pos === null)) continue;
          const x = V(v[k], { h: hj(pv[k]), val: pv[k] });
          if (x) pp.parts[k] = x;
        }
        const media = e.media && typeof e.media === 'object' ? e.media : {}, bg = media.background;
        if (v.photo) {
          let key = null, ref = null;
          if (bg && typeof bg === 'object') {
            if (!H.PHOTO_FILE_RE.test(bg.file || '') || !(bg.w > 0) || !(bg.h > 0)) key = undefined;
            else { ref = { file: bg.file, w: +bg.w, h: +bg.h, bytes: fin(bg.bytes, 0), name: String(bg.name || 'Photo').slice(0, 80), addedAt: fin(bg.addedAt, 0) }; key = H.photoKeyOf(ref); }
          }
          const x = key === undefined ? null : V(v.photo, { h: key || '-', val: key, ref });
          if (x) pp.parts.photo = x;
        }
        if (v.photoLook) { const look = media.look ? H.look(media.look) : null, x = V(v.photoLook, { h: hj(look), val: look }); if (x) pp.parts.photoLook = x; }
        for (const i of Array.isArray(e.instances) ? e.instances : []) {
          try {
            const iv = i && i.v;
            if (!i || !WIDGET_RE.test(i.widgetId || '') || !Number.isInteger(i.instance) || i.instance < 1 || !WID_RE.test(i.wid || '') || !iv || typeof iv !== 'object' || pp.wins.has(i.wid)) throw new Error('window');
            const ex = V(iv.exists, { h: '1', val: true });
            if (!ex) throw new Error('window');
            const pw = { wid: i.wid, ident: { widgetId: i.widgetId, n: i.instance, createdAt: fin(i.createdAt, null), z: fin(i.z, 1) }, exists: ex, parts: {}, pending: [] };
            const rv = { rect: normRect(i.rect), maximized: !!i.maximized }, label = normLabel(i.copyOf);
            const vals = { rect: rv, open: !!i.open, label, data: i.data === undefined ? null : i.data, conf: i.config === undefined ? null : i.config };
            for (const k of WIN_PARTS) {
              if (!iv[k]) continue;
              const fh = k === 'rect' && i.vh && typeof i.vh.rect === 'string' && /^[0-9a-z]{1,16}$/.test(i.vh.rect) ? i.vh.rect : null;
              const x = V(iv[k], { h: fh || partH(k, vals[k], sc, H), val: vals[k], scale: sc });
              if (x) pw.parts[k] = x;
            }
            const pend = i.pending && Array.isArray(i.pending.data) ? i.pending.data : [];
            for (const q of pend.slice(0, 50)) { const x = q && V(q.v, { h: hj(q.val === undefined ? null : q.val), val: q.val === undefined ? null : q.val }); if (x) pw.pending.push(x); }
            pp.wins.set(i.wid, pw);
          } catch (err) { skipped.push(`window ${i && i.wid}`); }
        }
        return pp;
      };
      const list = [obj].concat(Array.isArray(obj.pages) ? obj.pages.filter(e => e && !e.main) : []);
      for (const e of list) {
        if (e === obj && !obj.board) continue;
        try { const pp = pageOf(e); if (!peer.pages.has(pp.uid)) peer.pages.set(pp.uid, pp); } catch (err) { skipped.push(`page ${e && e.board && e.board.uid}`); }
      }
      const g = s.gone && typeof s.gone === 'object' ? s.gone : {};
      for (const t of Array.isArray(g.pages) ? g.pages : []) {
        const x = t && H.UID_RE.test(t.uid || '') && !peer.pages.has(t.uid) ? V(t.exists, { h: '0', val: false, cover: cover(t.cover) }) : null;
        if (x) peer.gone.pages.set(t.uid, x); else skipped.push('deleted page');
      }
      for (const t of Array.isArray(g.windows) ? g.windows : []) {
        const x = t && H.UID_RE.test(t.page || '') && WID_RE.test(t.wid || '') ? V(t.exists, { h: '0', val: false, cover: cover(t.cover) }) : null;
        if (x && !(peer.pages.get(t.page) && peer.pages.get(t.page).wins.has(t.wid))) peer.gone.wins.set(`${t.page} ${t.wid}`, { page: t.page, wid: t.wid, exists: x }); else skipped.push('deleted window');
      }
      // the theme, accent and text style: a version in sync.style, with a value this release knows (a file from before
      // 2026.11.16-4 has none, and one from 2026.11.16-4 none of the text style: it says nothing about them)
      peer.style = {};
      const sv = s.style && typeof s.style === 'object' ? s.style : {};
      for (const k of STYLE_PARTS) {
        if (!sv[k]) continue;
        const val = obj[k], x = styleOk(k, val, H) ? V(sv[k], { h: hj(val), val }) : null;
        if (x) peer.style[k] = x; else skipped.push(k);
      }
      if (newer) return { peer: null, skipped, newer: true };
      return { peer, skipped, newer: false };
    }

    // ---- tidying: a tombstone goes once this device has held it LINK_GONE_MS and every device shows it (§3.5). It is
    // noted in sync.dropped for LINK_GONE_MS more, so that the files that still hold it don't bring it back (join).
    function gc(ledger0, peers, files, o = {}) {
      const L = own(ledger0), now = fin(o.now, 0), dev = o.dev, goneMs = fin(o.goneMs, DEF.goneMs), peerGone = fin(o.peerGoneMs, DEF.peerGoneMs);
      const dropped = {};
      for (const [k, x] of Object.entries(L.sync.dropped || {})) if (x && now - fin(x.at, 0) < goneMs) dropped[k] = x;
      const drop = (k, T) => { dropped[k] = { vv: T.exists[1], at: now }; };
      const have = files instanceof Set ? files : new Set(files ? Object.keys(files) : []);
      const byDev = new Map((peers || []).map(p => [p.dev, p]));
      const shows = (T, unitOf) => Object.entries(L.sync.peers || {}).every(([d, info]) => {
        if (d === dev) return true;
        const f = byDev.get(d);
        if (!have.has(d) || !f) return (info.left && info.left.erased && !have.has(d)) || now - fin(info.missingSince || now, now) >= peerGone;
        const u = unitOf(f);
        if (u === 'alive') return false;
        if (u) return leq(T.exists[1], u.vv);
        return fin(f.merged[dev], 0) >= fin(T.seq, Infinity);
      });
      for (const [uid, M] of Object.entries(L.mine)) {
        const ripe = T => T && T.seq != null && now - fin(T.seen, now) >= goneMs;
        let M2 = M;
        if (M.gone && !M.keep && ripe(M.gone) && shows(M.gone, f => (f.pages.has(uid) ? 'alive' : f.gone.pages.get(uid) || null))) { drop(uid, M.gone); delete L.mine[uid]; continue; }
        for (const [wid, T] of Object.entries(M.wgone || {})) {
          if (!ripe(T) || (M.keepW && M.keepW[wid])) continue;   // (kept for keepW, as the page's is for keep)
          if (!shows(T, f => { const p = f.pages.get(uid); if (p && p.wins.has(wid)) return 'alive'; const g = f.gone.wins.get(`${uid} ${wid}`); return g ? g.exists : null; })) continue;
          if (M2 === M) { M2 = cloneMine(M); L.mine[uid] = M2; }
          drop(`${uid} ${wid}`, T);
          delete M2.wgone[wid];
        }
      }
      if (Object.keys(dropped).length || L.sync.dropped) L.sync = Object.assign({}, L.sync, { dropped });
      return L;
    }
    // Does this ledger hold everything in that file (so the file can go)?
    function includes(ledger0, peer) {
      const inV = (v, E) => !!E && !!E.v && [E.v].concat((E.pending || []).map(q => q.v)).some(a => leq(v.vv, a[1]) || superseded(v, ver(a)));
      // (a version nobody chose (t 0) is nothing this device lacks while it keeps its own value instead, with no version:
      // plan never lets one replace it, see there)
      for (const k in peer.style || {}) {
        const v = peer.style[k], E = ((ledger0.sync || {}).style || {})[k];
        if (!fin(v.t, 0) && E && !E.v) continue;
        if (!inV(v, E)) return false;
      }
      const dropped = (ledger0.sync && ledger0.sync.dropped) || {}, collected = (k, vv) => !!dropped[k] && leq(vv, dropped[k].vv);   // (deletions collected here, see gc)
      for (const [uid, pp] of peer.pages) {
        const M = ledger0.mine[uid];
        if (!M) return false;
        if (M.gone) {
          // (every version of the page and its windows, pending ones too, within what the deletion covered, or within a
          // window's own deletion: otherwise merging the file would bring the page back, see shown)
          const C = M.gone.cover || {};
          if (!leq(pp.exists.vv, M.gone.exists[1])) return false;
          for (const k in pp.parts) if (!leq(pp.parts[k].vv, C[k] || {})) return false;
          for (const [wid, pw] of pp.wins) {
            const T = (M.wgone || {})[wid], under = (vv, k) => leq(vv, C[`${wid}/${k}`] || {}) || (!!T && leq(vv, (k === 'exists' ? T.exists[1] : (T.cover || {})[k]) || {}));
            if (!under(pw.exists.vv, 'exists')) return false;
            for (const k in pw.parts) if (!under(pw.parts[k].vv, k)) return false;
            for (const q of pw.pending) if (!under(q.vv, 'data')) return false;
          }
          continue;
        }
        if (!inV(pp.exists, M.p.exists)) return false;
        for (const k in pp.parts) if (!inV(pp.parts[k], M.p[k])) return false;
        for (const [wid, pw] of pp.wins) {
          const mw = M.w[wid], T = M.wgone && M.wgone[wid];
          if (T) {
            if (!leq(pw.exists.vv, T.exists[1])) return false;
            for (const k in pw.parts) if (!leq(pw.parts[k].vv, (T.cover || {})[k] || {})) return false;
            for (const q of pw.pending) if (!leq(q.vv, (T.cover || {}).data || {})) return false;
            continue;
          }
          if (!mw || !inV(pw.exists, mw.p.exists)) return false;
          for (const k in pw.parts) if (!inV(pw.parts[k], mw.p[k])) return false;
          for (const q of pw.pending) if (!inV(q, mw.p.data)) return false;
        }
      }
      for (const [uid, T] of peer.gone.pages) { const M = ledger0.mine[uid]; if (M && !M.gone && !(M.p.exists && leq(T.vv, M.p.exists.v[1]))) return false; if (M && M.gone && !leq(T.vv, M.gone.exists[1])) return false; }
      for (const T of peer.gone.wins.values()) {
        if (collected(`${T.page} ${T.wid}`, T.exists.vv) || dropped[T.page]) continue;
        const M = ledger0.mine[T.page];
        if (!M) return false;
        if (M.gone) continue;
        const mw = M.w[T.wid], G = M.wgone && M.wgone[T.wid];
        if (G ? !leq(T.exists.vv, G.exists[1]) : !(mw && mw.p.exists && leq(T.exists.vv, mw.p.exists.v[1]))) return false;
      }
      return true;
    }
    // A lost ledger, rebuilt from this device's own file (its versions; fingerprints from its values).
    function rebuild(peer, o = {}) {
      const L = ledger({ dev: peer.dev, folder: peer.folder, seq: peer.seq, write: peer.write, peers: {}, ctr: 0, maxSeen: 0 }, []);
      let ctr = 0;
      const E = v => { ctr = Math.max(ctr, v.vv[peer.dev] || 0); return { h: v.h, v: arr(v), rev: 0 }; };
      for (const [uid, pp] of peer.pages) {
        const M = newMine(uid, 0);
        M.p.exists = E(pp.exists);
        for (const k in pp.parts) M.p[k] = Object.assign(E(pp.parts[k]), k === 'photo' && pp.parts[k].ref ? { ref: pp.parts[k].ref } : {});
        for (const [wid, pw] of pp.wins) {
          const mw = { ikey: `${pw.ident.widgetId}:${pw.ident.n}`, p: { exists: E(pw.exists) } };
          for (const k in pw.parts) mw.p[k] = E(pw.parts[k]);
          if (pw.pending.length && mw.p.data) mw.p.data.pending = pw.pending.map(q => ({ v: arr(q), val: q.val, h: q.h }));
          M.w[wid] = mw;
        }
        L.mine[uid] = M;
      }
      for (const [uid, T] of peer.gone.pages) { const M = newMine(uid, 0); M.gone = { exists: arr(T), cover: T.cover || {}, seq: peer.seq, seen: fin(o.now, 0) }; L.mine[uid] = M; ctr = Math.max(ctr, T.vv[peer.dev] || 0); }
      for (const T of peer.gone.wins.values()) { const M = L.mine[T.page] || (L.mine[T.page] = newMine(T.page, 0)); M.wgone[T.wid] = { exists: arr(T.exists), cover: T.exists.cover || {}, seq: peer.seq, seen: fin(o.now, 0) }; }
      for (const k in peer.style || {}) { const v = peer.style[k]; L.sync.style = Object.assign({}, L.sync.style, { [k]: { h: v.h, v: arr(v) } }); ctr = Math.max(ctr, v.vv[peer.dev] || 0); }
      L.sync.ctr = ctr;
      L.sync.merged = Object.assign({}, peer.merged);
      L.base = {};
      return L;
    }

    return { read, stamp, decode, sumText, join, shown, plan, encode, gc, includes, rebuild, photosWanted, ledger, records, patchSettings, joinPatches, newWid, copyWid,
      partH, okV, leq, vjoin, PAGE_PARTS, WIN_PARTS, STYLE_PARTS, WID_RE, DEV_RE };
  })();
  