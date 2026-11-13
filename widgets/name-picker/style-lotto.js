/*
 * Name Picker style: Lotto (the ball drum).
 * A glass drum holds a ball for every student, marked with their initials. On Pick the balls tumble, then the winners'
 * balls roll down a chute one at a time, about a second apart, and each name pops up large in the Picked tray, in
 * turn order. Before they come out, the tray shows one "?" socket for each name to come. With No repeats on, drawn
 * balls leave the drum, so the class can watch it empty.
 * The host has already drawn and saved the winners: the tumbling is only decoration, and the balls that come out are
 * always the host's winners. Drawn with page elements and an SVG picture (no canvas), so the text stays sharp at any
 * size, uses the board's letters, and the theme's colours apply without a redraw.
 * How a style plugs in: the comment at the top of index.html.
 */
NamePicker.register('lotto', {
  css: `
.lotto { position: absolute; inset: 0; overflow: hidden; color: var(--b21-text); font-family: var(--b21-font); }
.lotto [hidden] { display: none !important; }

/* The picture: chute, stand and the glass drum (color-mix where the browser has it, a plain token where it hasn't). */
.lotto-art { position: absolute; left: 0; top: 0; z-index: 0; pointer-events: none; overflow: visible; }
.lotto-chute-o, .lotto-stand { fill: none; stroke: var(--b21-muted); stroke: color-mix(in srgb, var(--b21-accent) 30%, var(--b21-muted)); stroke-linecap: round; stroke-linejoin: round; }
.lotto-chute-i { fill: none; stroke: var(--b21-bg); stroke: color-mix(in srgb, var(--b21-accent) 7%, var(--b21-bg)); stroke-linecap: round; }
.lotto-stand { opacity: .55; }
.lotto-globe { fill: var(--b21-bg); fill: color-mix(in srgb, var(--b21-accent) 7%, var(--b21-bg)); stroke: var(--b21-muted); stroke: color-mix(in srgb, var(--b21-accent) 30%, var(--b21-muted)); }
.lotto-rib { fill: none; stroke: var(--b21-border); stroke: color-mix(in srgb, var(--b21-accent) 22%, var(--b21-border)); }
.lotto-shine { fill: none; stroke: var(--b21-muted); stroke-linecap: round; opacity: .5; mix-blend-mode: plus-lighter; }

/* The Picked tray: a socket and a name for each winner. */
.lotto-tray { position: absolute; z-index: 1; box-sizing: border-box; background: var(--b21-bg); border: 1px solid var(--b21-border); }
.lotto-row { position: absolute; z-index: 1; box-sizing: border-box; opacity: 0; background: var(--b21-surface);
  background: color-mix(in srgb, var(--np-win) 16%, transparent); box-shadow: inset 0 0 0 2px var(--np-win); transition: opacity .35s ease-out; }
.lotto-row.lotto-on { opacity: 1; }
.lotto-sock { position: absolute; z-index: 1; box-sizing: border-box; border-radius: 50%; border: 2px dashed var(--b21-border); background: var(--b21-surface);
  display: flex; align-items: center; justify-content: center; color: var(--b21-muted); font: 800 var(--lotto-qs, 16px)/1 var(--b21-font); }
.lotto-sock.lotto-full { border-style: solid; color: transparent; }
.lotto-name { position: absolute; z-index: 1; display: flex; align-items: center; white-space: nowrap; font-family: var(--b21-font); font-weight: 800; line-height: 1; color: var(--b21-text); }
.lotto-name.lotto-mid { justify-content: center; text-align: center; }
.lotto-text { flex: none; display: inline-block; white-space: nowrap; transform-origin: 0 50%; }
.lotto-mid .lotto-text { transform-origin: 50% 50%; }
.lotto-two { line-height: 1.15; }
.lotto-two > span { display: block; }
/* (A name popping up grows a little past its size for a moment, but only as far as its place has room: --lotto-pop.) */
.lotto-name.lotto-pop .lotto-text { animation: lotto-pop .55s cubic-bezier(.2, .9, .3, 1) both; }
.lotto-name.lotto-fade .lotto-text { animation: lotto-fade .3s ease-out both; }
.lotto-bar { display: block; border-radius: 999px; background: var(--b21-border); }
.lotto-head { position: absolute; z-index: 1; white-space: nowrap; line-height: 1.15; color: var(--b21-muted); font-family: var(--b21-font); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }

/* The balls: a colour for each student, their initials on it. */
.lotto-balls { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
/* (A ball is a plain box that moves, with its face inside: moving it every frame then doesn't work out its colours,
   letters and shading again.) */
.lotto-ball { position: absolute; left: 0; top: 0; width: var(--lotto-d, 20px); height: var(--lotto-d, 20px); will-change: transform; }
.lotto-face { box-sizing: border-box; width: 100%; height: 100%; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: var(--np-ink); font: 800 calc(var(--lotto-d, 20px) * .44)/1 var(--b21-font);
  letter-spacing: -.02em; white-space: nowrap; background: var(--lotto-f);
  background: radial-gradient(circle at 36% 30%, var(--lotto-f) 0 42%, color-mix(in srgb, var(--lotto-f) 74%, var(--np-ink)) 100%);
  box-shadow: inset 0 0 0 max(1px, calc(var(--lotto-d, 20px) * .035)) rgba(17, 24, 39, .3); }
.lotto-ball.lotto-top { z-index: 3; }
.lotto-ball.lotto-land .lotto-face { animation: lotto-ring .8s ease-out; }
.lotto-ball.lotto-fadein { animation: lotto-fade .3s ease-out both; }

@keyframes lotto-pop { 0% { opacity: 0; transform: scale(.55); } 60% { opacity: 1; transform: scale(var(--lotto-pop, 1)); } 100% { opacity: 1; transform: scale(1); } }
@keyframes lotto-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes lotto-ring {
  0% { box-shadow: inset 0 0 0 max(1px, calc(var(--lotto-d, 20px) * .035)) rgba(17, 24, 39, .3), 0 0 0 0 var(--np-win); }
  100% { box-shadow: inset 0 0 0 max(1px, calc(var(--lotto-d, 20px) * .035)) rgba(17, 24, 39, .3), 0 0 0 calc(var(--lotto-d, 20px) * .45) transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .lotto-name.lotto-pop .lotto-text { animation: lotto-fade .3s ease-out both; }
  .lotto-ball.lotto-land .lotto-face { animation: none; }
}
`,
  mount(root, host) {
    const SVGNS = 'http://www.w3.org/2000/svg';
    const STEP = 1 / 120;   // s: one step of the drum's physics
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const easeIn = t => t * t;
    const easeOut = t => 1 - (1 - t) * (1 - t);
    const easeOutBack = t => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    const fmt = v => String(Math.round(v * 10) / 10);

    // How long each part takes (seconds). A ball rolls to the drum's exit, down the chute, then hops into its socket.
    // Normal: the balls tumble for a while, then come out about a second apart (one name about 3½ s, five about 6 s).
    // Quick: about 1½ s in all, however many names.
    function timeline(k, quick) {
      const T = quick ? { exit: 0.14, chute: 0.2, drop: 0.3 } : { exit: 0.3, chute: 0.42, drop: 0.5 };
      T.fly = T.exit + T.chute + T.drop;
      const mix = quick ? (k === 1 ? 0.68 : 0.35) : (k === 1 ? 1.9 : 1.35);
      const gap = quick ? Math.min(0.35, 0.45 / Math.max(1, k - 1)) : (k <= 2 ? 1.05 : k === 3 ? 0.9 : 0.78);
      const ats = [];
      for (let j = 0; j < k; j++) ats.push(mix + j * gap);
      const last = ats[k - 1];
      return { T, ats, jetsUntil: last + (quick ? 0.08 : 0.2), end: last + T.fly + (quick ? 0.12 : 0.25) };
    }
    // The characters of a name as a reader sees them: an emoji with a skin tone, a flag, or a letter with its accent
    // is one character, though it is made of several codes (where the browser can tell; otherwise one code each).
    const seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const chars = s => (seg ? Array.from(seg.segment(s), x => x.segment) : Array.from(s));
    // The letters on a ball: the first letter of the first two parts of the name ("Anne-Sophie" AS, "Leo" L).
    function initials(name) {
      const first = s => (chars(s.normalize('NFC'))[0] || '?').toUpperCase();
      const parts = name.split(/[\s\-‐-―.]+/).filter(Boolean);
      return parts.length > 1 ? first(parts[0]) + first(parts[1]) : first(name);
    }
    // Where a long name can go onto two lines: just after the space or hyphen nearest its middle (0: neither).
    function splitAt(text) {
      let best = 0, most = Infinity;
      for (let i = 1; i < text.length - 1; i++) {
        if (!/[\s\-‐-―]/.test(text[i])) continue;
        const m = Math.max(i + 1, text.length - i - 1);
        if (m < most) { most = m; best = i + 1; }
      }
      return best;
    }
    // The middle of a name, between two whole characters (for a long name with no space or hyphen).
    const middle = text => { const c = chars(text); return c.slice(0, Math.ceil(c.length / 2)).join('').length; };

    // ---------- the stage ----------
    const box = host.el('div', 'lotto', root);
    const svg = (tag, cls, parent) => { const e = document.createElementNS(SVGNS, tag); e.setAttribute('class', cls); parent.appendChild(e); return e; };
    const art = svg('svg', 'lotto-art', box);
    art.setAttribute('aria-hidden', 'true');
    const stand = svg('path', 'lotto-stand', art);
    const chuteO = svg('path', 'lotto-chute-o', art);
    const chuteI = svg('path', 'lotto-chute-i', art);
    const globe = svg('circle', 'lotto-globe', art);
    const lats = [svg('ellipse', 'lotto-rib', art), svg('ellipse', 'lotto-rib', art)];
    const shine = svg('path', 'lotto-shine', art);
    // The drum's turning lines have a picture of their own, just the size of the drum: they change in every frame of
    // the show, and only this small picture is drawn again then (not the whole stage's).
    const spinArt = svg('svg', 'lotto-art lotto-spin', box);
    spinArt.setAttribute('aria-hidden', 'true');
    const ribs = [0, 1, 2, 3].map(() => svg('ellipse', 'lotto-rib', spinArt));
    const tray = host.el('div', 'lotto-tray', box);
    const head = host.el('div', 'lotto-head', box, 'Picked');
    const ballLayer = host.el('div', 'lotto-balls', box);
    ballLayer.setAttribute('aria-hidden', 'true');
    let slotEls = [];

    let names = [], namesKey = null;   // the list the balls were made for
    let balls = [];                    // one for each entry: { i, el, x, y, vx, vy, rot, where: 'drum' | 'fly' | 'tray' | 'out', slot, cap, d }
    let RN = 0.19;                     // a ball's radius, as a part of the drum's
    let shown = [];                    // the entries whose names are in the tray, in pick order
    let sockets = 1;                   // sockets in the tray when no show is running
    let run = null;                    // the show running
    let raf = 0, lastT = 0, dead = false, phase = 0.25, spin = 0, L = null, sizeKey = '';   // (phase: the drum's turn, for its lines)
    let inDrum = [];
    const listDrum = () => { inDrum = balls.filter(b => b.where === 'drum'); };

    // ---------- the balls: one for each entry in the list (two Emmas are two balls) ----------
    function makeBalls(list) {
      for (const b of balls) b.el.remove();
      names = list.slice();
      namesKey = list.join('\n');
      // Balls shrink as the class grows, so the drum is about 40% full.
      RN = clamp(Math.sqrt(0.38 / Math.max(names.length, 1)), 0.07, 0.19);
      balls = names.map((name, i) => {
        const el = host.el('div', 'lotto-ball', ballLayer);
        host.el('div', 'lotto-face', el, initials(name)).style.setProperty('--lotto-f', `var(--np-c${(i % 8) + 1})`);
        return { i, el, x: 0, y: 0, vx: 0, vy: 0, rot: 0, where: 'drum', slot: -1, cap: null, d: -1 };
      });
    }
    // The balls in the drum lie in a pile at the bottom, at once (no movement): the first draw, reduce motion, a skip.
    function pile() {
      listDrum();
      const list = inDrum.slice().sort(() => Math.random() - 0.5), lim = 1 - RN, dy = Math.sqrt(3) * RN;
      let n = 0;
      for (let y = lim, row = 0; n < list.length && y > -lim; y -= dy, row++) {
        const hw = Math.sqrt(Math.max(0, lim * lim - y * y));
        for (let x = -hw + (row % 2 ? RN : 0); x <= hw + 1e-6 && n < list.length; x += 2 * RN) {
          const b = list[n++];
          b.x = x + (Math.random() - 0.5) * RN * 0.3; b.y = y; b.vx = 0; b.vy = 0; b.rot = (Math.random() - 0.5) * 1.2;
        }
      }
      for (; n < list.length; n++) { list[n].x = (Math.random() - 0.5) * 0.4; list[n].y = 0; }   // (a class too big to pile)
      rest(30);
    }
    // A few calm physics steps, then nothing moves: overlaps are pushed apart and the pile settles.
    function rest(steps, g = 3) {
      listDrum();
      for (let s = 0; s < steps; s++) physicsStep(STEP, false, 6, g, 0.3);
      for (const b of inDrum) { b.vx = 0; b.vy = 0; }
    }
    function dropIn(b) {
      b.where = 'drum'; b.slot = -1; b.cap = null; b.el.hidden = false;
      b.el.classList.remove('lotto-land', 'lotto-fadein', 'lotto-top');
      b.x = (Math.random() - 0.5) * 0.9; b.y = -0.75 + Math.random() * 0.3;
      b.vx = (Math.random() - 0.5) * 1.2; b.vy = Math.random() * 0.8;
    }

    // ---------- layout ----------
    const slotCount = () => (run ? run.ids.length : sockets);

    function computeLayout(W, H) {
      const m = Math.min(W, H);
      const pad = clamp(m * 0.045, 6, 24), gap = clamp(m * 0.035, 5, 20);
      const k = slotCount();
      let drumBox, trayBox, type;
      if (W >= H * 1.05) {
        // Side by side: the drum on its stand on the left, its chute running into the tray on the right. The drum is
        // only as wide as its height needs, so a wide window gives the names the room; a small one too (the balls
        // are only decoration there, the names are what the class needs to read).
        const ih = H - 2 * pad, colW = Math.min(W * lerp(0.32, 0.42, clamp((W - 260) / 300, 0, 1)), ih * 0.95);
        drumBox = { x: pad, y: pad, w: colW, h: ih };
        const tx = pad + colW + gap * 1.6;
        trayBox = { x: tx, y: pad, w: W - pad - tx, h: ih };
        type = 'side';
      } else {
        // Tall: the drum on top, the chute dropping into the tray underneath.
        const avail = H - 2 * pad, dh = avail * 0.44;
        drumBox = { x: pad, y: pad, w: W - 2 * pad, h: dh };
        const ty = pad + dh + gap * 1.6;
        trayBox = { x: pad, y: ty, w: W - 2 * pad, h: H - pad - ty };
        type = 'down';
      }
      let R, cx, cy;
      if (type === 'side') { R = Math.min(drumBox.w * 0.45, drumBox.h / 2.36); cx = drumBox.x + drumBox.w / 2; cy = drumBox.y + (drumBox.h - 2.36 * R) / 2 + R; }
      else { R = Math.min(drumBox.w * 0.45, drumBox.h * 0.47); cx = drumBox.x + drumBox.w / 2; cy = drumBox.y + drumBox.h / 2; }
      R = Math.max(R, 12);
      const th = type === 'side' ? 0.6 : Math.PI / 2;
      const ux = Math.cos(th), uy = Math.sin(th);
      const bd = 2 * RN * R;
      const E = { x: cx + ux * R, y: cy + uy * R };
      const Ein = { x: cx + ux * R * (1 - RN), y: cy + uy * R * (1 - RN) };
      const slots = computeSlots(trayBox, k);
      // (A ball coming into the tray stays below the heading.)
      const below = slots.head.h ? slots.head.y + slots.head.h : trayBox.y;
      let M, C;
      if (type === 'side') {
        M = { x: trayBox.x + 4, y: clamp(E.y + R * 0.32, below + bd, trayBox.y + trayBox.h - bd) };
        C = { x: lerp(E.x, M.x, 0.3), y: lerp(E.y, M.y, 0.92) };
      } else {
        // The chute ends over the column of balls, and a ball drops down that column: never across a name. (It ends
        // high enough that a ball arriving along it doesn't touch the heading's letters.)
        M = { x: slots.list[0].bx, y: slots.head.h ? Math.min(trayBox.y + 4, slots.head.y - bd / 2) : trayBox.y + 4 };
        C = { x: cx, y: (E.y + M.y) / 2 };
      }
      // The chute's length, so a ball rolls down it a whole number of turns and comes out with its letters upright.
      let chuteLen = 0;
      for (let i = 1, px = Ein.x, py = Ein.y; i <= 16; i++) {
        const u = i / 16, v = 1 - u;
        const qx = v * v * Ein.x + 2 * v * u * C.x + u * u * M.x, qy = v * v * Ein.y + 2 * v * u * C.y + u * u * M.y;
        chuteLen += Math.hypot(qx - px, qy - py); px = qx; py = qy;
      }
      const turns = Math.max(1, Math.round(chuteLen / (Math.PI * bd)));
      return { W, H, k, type, R, cx, cy, bd, E, Ein, M, C, turns, trayBox, slots, below };
    }

    // The sockets in the tray. One name: the ball beside it in a wide tray, above it in a tall one. Several: rows.
    function computeSlots(tb, k) {
      const ip = clamp(Math.min(tb.w, tb.h) * 0.06, 5, 22);
      const headH = tb.h >= 230 && tb.w >= 180 ? clamp(tb.h * 0.055, 13, 26) : 0;
      const top = tb.y + ip + (headH ? headH + ip * 0.5 : 0);
      const bottom = tb.y + tb.h - ip;
      const ah = Math.max(10, bottom - top), aw = Math.max(10, tb.w - 2 * ip);
      const list = [];
      if (k === 1) {
        if (aw > ah * 1.5) {
          const d = Math.min(ah * 0.8, aw * 0.28);
          list.push({ bx: tb.x + ip + d / 2, by: top + ah / 2, d, cap: 0.6, mid: false,
            name: { x: tb.x + ip + d + ip, y: top, w: aw - d - ip, h: ah },
            row: { x: tb.x + ip * 0.4, y: top - ip * 0.3, w: tb.w - ip * 0.8, h: ah + ip * 0.3 } });
        } else {
          const d = Math.min(ah * 0.4, aw * 0.5);
          list.push({ bx: tb.x + tb.w / 2, by: top + d / 2 + ip * 0.2, d, cap: 0.62, mid: true,
            name: { x: tb.x + ip, y: top + d + ip * 0.4, w: aw, h: ah - d - ip * 0.4 },
            row: { x: tb.x + ip * 0.4, y: top - ip * 0.4, w: tb.w - ip * 0.8, h: ah + ip * 0.4 } });
        }
      } else {
        const rh = ah / k, d = Math.min(rh * 0.8, aw * 0.21), gx = Math.max(5, ip * 0.7);
        for (let s = 0; s < k; s++) {
          const y = top + rh * s;
          list.push({ bx: tb.x + ip + d / 2, by: y + rh / 2, d, cap: 0.6, mid: false,
            name: { x: tb.x + ip + d + gx, y: y + rh * 0.08, w: aw - d - gx, h: rh * 0.84 },
            row: { x: tb.x + ip * 0.35, y: y + rh * 0.06, w: tb.w - ip * 0.7, h: rh * 0.88 } });
        }
      }
      // The heading sits over the names (or over the tray, for one name under its ball), not over the column of balls
      // the winners' balls come in by.
      const hx = list[0].mid ? tb.x + ip : list[0].name.x;
      return { ip, list, head: { x: hx, y: tb.y + ip, w: tb.x + tb.w - ip - hx, h: headH } };
    }

    const place = (e, b) => { e.style.left = fmt(b.x) + 'px'; e.style.top = fmt(b.y) + 'px'; e.style.width = fmt(Math.max(0, b.w)) + 'px'; e.style.height = fmt(Math.max(0, b.h)) + 'px'; };

    function ensureSlots(k) {
      while (slotEls.length > k) { const s = slotEls.pop(); s.row.remove(); s.sock.remove(); s.name.remove(); }
      while (slotEls.length < k) {
        const row = host.el('div', 'lotto-row'), sock = host.el('div', 'lotto-sock', null, '?'), name = host.el('div', 'lotto-name');
        sock.setAttribute('aria-hidden', 'true');   // (screen readers hear the winners from the host)
        box.insertBefore(row, ballLayer); box.insertBefore(sock, ballLayer); box.insertBefore(name, ballLayer);
        slotEls.push({ row, sock, name, id: -2 });
      }
    }

    function applyLayout() {
      const l = L;
      art.setAttribute('width', l.W); art.setAttribute('height', l.H);
      art.setAttribute('viewBox', `0 0 ${l.W} ${l.H}`);
      const rim = Math.max(2, l.R * 0.045), cw = Math.max(8, l.bd * 1.25);
      const d = `M${fmt(l.Ein.x)} ${fmt(l.Ein.y)} Q${fmt(l.C.x)} ${fmt(l.C.y)} ${fmt(l.M.x)} ${fmt(l.M.y)}`;
      chuteO.setAttribute('d', d); chuteO.style.strokeWidth = fmt(cw + 2 * Math.max(2, rim * 0.8));
      chuteI.setAttribute('d', d); chuteI.style.strokeWidth = fmt(cw);
      if (l.type === 'side') {
        const { cx, cy, R } = l, y0 = cy + R * 0.86, y1 = cy + R * 1.3;
        stand.setAttribute('d', `M${fmt(cx - R * 0.45)} ${fmt(y0)} L${fmt(cx - R * 0.62)} ${fmt(y1)} M${fmt(cx + R * 0.45)} ${fmt(y0)} L${fmt(cx + R * 0.62)} ${fmt(y1)} M${fmt(cx - R * 0.8)} ${fmt(y1)} L${fmt(cx + R * 0.8)} ${fmt(y1)}`);
        stand.style.strokeWidth = fmt(Math.max(3, R * 0.07));
      } else stand.setAttribute('d', '');
      globe.setAttribute('cx', fmt(l.cx)); globe.setAttribute('cy', fmt(l.cy)); globe.setAttribute('r', fmt(l.R + rim / 2));
      globe.style.strokeWidth = fmt(rim);
      const ribW = fmt(Math.max(1, l.R * 0.012)), sz = fmt(2 * l.R);
      place(spinArt, { x: l.cx - l.R, y: l.cy - l.R, w: 2 * l.R, h: 2 * l.R });
      spinArt.setAttribute('width', sz); spinArt.setAttribute('height', sz); spinArt.setAttribute('viewBox', `0 0 ${sz} ${sz}`);
      for (const e of ribs) { e.setAttribute('cx', fmt(l.R)); e.setAttribute('cy', fmt(l.R)); e.setAttribute('ry', fmt(l.R * 0.985)); e.style.strokeWidth = ribW; }
      lats.forEach((e, j) => {
        e.setAttribute('cx', fmt(l.cx)); e.setAttribute('cy', fmt(l.cy + (j ? 1 : -1) * l.R * 0.5));
        e.setAttribute('rx', fmt(l.R * 0.866)); e.setAttribute('ry', fmt(l.R * 0.1)); e.style.strokeWidth = ribW;
      });
      // A glint on the glass, upper left.
      const a0 = Math.PI * 1.08, a1 = Math.PI * 1.36, sr = l.R * 0.8;
      shine.setAttribute('d', `M${fmt(l.cx + Math.cos(a0) * sr)} ${fmt(l.cy + Math.sin(a0) * sr)} A${fmt(sr)} ${fmt(sr)} 0 0 1 ${fmt(l.cx + Math.cos(a1) * sr)} ${fmt(l.cy + Math.sin(a1) * sr)}`);
      shine.style.strokeWidth = fmt(Math.max(2, l.R * 0.07));
      drawRibs();

      place(tray, l.trayBox);
      tray.style.borderRadius = fmt(clamp(Math.min(l.trayBox.w, l.trayBox.h) * 0.07, 8, 22)) + 'px';
      const S = l.slots;
      head.hidden = !S.head.h;
      if (S.head.h) { place(head, S.head); head.style.fontSize = fmt(S.head.h * 0.85) + 'px'; }
      ensureSlots(S.list.length);
      S.list.forEach((s, j) => {
        const se = slotEls[j];
        place(se.row, s.row);
        se.row.style.borderRadius = fmt(Math.min(s.row.h * 0.3, 18)) + 'px';
        const sd = s.d * 1.1;
        place(se.sock, { x: s.bx - sd / 2, y: s.by - sd / 2, w: sd, h: sd });
        se.sock.style.setProperty('--lotto-qs', fmt(s.d * 0.42) + 'px');
        se.sock.style.borderWidth = fmt(clamp(s.d * 0.04, 1.5, 4)) + 'px';
        place(se.name, s.name);
        se.name.classList.toggle('lotto-mid', s.mid);
        se.id = -2;   // (the name is fitted again below)
      });
      refreshSlots();
    }

    // Lays the stage out again if its size or the number of sockets changed (or always, with force).
    function relayout(force) {
      if (dead) return;
      const W = box.clientWidth, H = box.clientHeight;
      if (!W || !H) return;
      const key = W + 'x' + H + '|' + slotCount() + '|' + RN;
      if (!force && key === sizeKey && L) return;
      sizeKey = key;
      L = computeLayout(W, H);
      applyLayout();
      drawAll();
    }

    // ---------- the names in the tray ----------
    // The entry whose name is in socket j (-1: none yet).
    function slotId(j) {
      if (run) { const c = run.caps[j]; return c && c.landed ? c.id : -1; }
      return shown[j] !== undefined ? shown[j] : -1;
    }
    function refreshSlots() {
      if (!L) return;
      L.slots.list.forEach((s, j) => { if (slotEls[j] && slotEls[j].id !== slotId(j)) renderSlot(j, ''); });
    }
    // A name as large as its place allows, on one line; a long name goes onto two lines, at a space or a hyphen, when
    // that makes it clearly larger (in a small window, "Maximiliano Rodriguez" reads better on two lines than tiny on
    // one). A name that can't fit on one line even in the smallest letters always goes onto two: at a space or hyphen
    // if that fits, otherwise in the middle of the word. A name too long even for that gets smaller letters still. It
    // is never cut off at the edge.
    function fitName(where, text, max) {
      // (at: where the second line starts, 0 for one line; min: the smallest letters allowed)
      const put = (at, min) => {
        where.replaceChildren();
        const e = host.el('span', at ? 'lotto-text lotto-two' : 'lotto-text', where, at ? null : text);
        if (at) { host.el('span', '', e, text.slice(0, at)); host.el('span', '', e, text.slice(at)); }
        return host.fitText(e, where, max, min);
      };
      const fits = () => { const e = where.firstChild; return e.offsetWidth <= where.clientWidth + 0.5 && e.offsetHeight <= where.clientHeight + 0.5; };
      const fs1 = put(0, 6), at = splitAt(text);
      if (fs1 >= max * 0.98) return;
      if (fits()) { if (at && put(at, 6) < fs1 * 1.15) put(0, 6); return; }
      if (at) { put(at, 6); if (fits()) return; }
      // (Smaller than the smallest letters either way: the break at a space or hyphen, unless it is much smaller.)
      const mid = middle(text), fsMid = put(mid, 1);
      if (at && fsMid < 6 && put(at, 1) < fsMid * 0.9) put(mid, 1);
    }
    // Socket j: the winner's name (never cut off), or an empty "?" socket with a grey bar for the name to come.
    function renderSlot(j, anim) {
      const s = L && L.slots.list[j], se = slotEls[j];
      if (!s || !se) return;
      const id = slotId(j);
      se.sock.classList.toggle('lotto-full', id >= 0);
      se.row.classList.toggle('lotto-on', id >= 0);
      se.id = id;
      se.name.replaceChildren();
      se.name.classList.remove('lotto-pop', 'lotto-fade');
      if (id >= 0) {
        fitName(se.name, names[id], s.name.h * s.cap);
        if (anim === 'pop') {
          // (How far the pop may grow the name: up to 8%, as far as its place has room.)
          const r = se.name.getBoundingClientRect(), tr = se.name.firstChild.getBoundingClientRect();
          se.name.style.setProperty('--lotto-pop', String(clamp(Math.floor((Math.min(r.width / tr.width, r.height / tr.height) || 1) * 1000) / 1000, 1, 1.08)));
        }
        if (anim) { void se.name.offsetWidth; se.name.classList.add('lotto-' + anim); }
      } else {
        const bar = host.el('span', 'lotto-bar', se.name);
        bar.style.width = fmt(s.name.w * (s.mid ? 0.6 : 0.7)) + 'px';
        bar.style.height = fmt(clamp(s.name.h * 0.14, 4, 14)) + 'px';
        if (s.mid) bar.style.margin = '0 auto';
      }
    }

    // ---------- drawing the balls ----------
    function setBall(b, x, y, d, rot) {
      if (Math.abs(d - b.d) > 0.05) { b.el.style.setProperty('--lotto-d', fmt(d) + 'px'); b.d = d; }
      b.el.style.transform = `translate(${fmt(x - d / 2)}px,${fmt(y - d / 2)}px) rotate(${(rot % 6.2832).toFixed(3)}rad)`;
    }
    // Where a ball on its way to the tray is, t seconds after it left the pile.
    function flyPos(b, t) {
      const l = L, T = run ? run.T : { exit: 1, chute: 1, drop: 1 }, s = l.slots.list[b.slot] || l.slots.list[l.slots.list.length - 1];
      if (t < T.exit) {
        const u = easeInOut(t / T.exit), x0 = l.cx + b.cap.x0 * l.R, y0 = l.cy + b.cap.y0 * l.R;
        return { x: lerp(x0, l.Ein.x, u), y: lerp(y0, l.Ein.y, u), d: l.bd * (1 + 0.25 * Math.sin(Math.PI * u)), rot: b.cap.rot0 * (1 - u * 0.5) };
      }
      if (t < T.exit + T.chute) {
        const u = easeIn((t - T.exit) / T.chute), v = 1 - u;
        return { x: v * v * l.Ein.x + 2 * v * u * l.C.x + u * u * l.M.x, y: v * v * l.Ein.y + 2 * v * u * l.C.y + u * u * l.M.y, d: l.bd, rot: lerp(b.cap.rot0 * 0.5, l.turns * 6.2832, u) };
      }
      const u = clamp((t - T.exit - T.chute) / T.drop, 0, 1), e = easeOutBack(u), d = lerp(l.bd, s.d, easeOut(u));
      const hop = Math.min(Math.hypot(s.bx - l.M.x, s.by - l.M.y) * 0.3, l.R * 0.6) * Math.sin(Math.PI * Math.min(1, u * 1.1));
      // (The hop stays inside the tray: not over the heading or the tray's top edge, nor back up the chute.)
      const top = l.type === 'side' ? l.below + d / 2 + 2 : l.M.y;
      return { x: lerp(l.M.x, s.bx, e), y: Math.max(top, lerp(l.M.y, s.by, e) - hop), d, rot: 0 };
    }
    function drawRibs() {
      if (!L) return;
      for (let j = 0; j < ribs.length; j++) ribs[j].setAttribute('rx', fmt(Math.abs(Math.cos(phase + (j * Math.PI) / ribs.length)) * L.R * 0.985));
    }
    function drawAll() {
      if (!L) return;
      for (const b of balls) {
        if (b.where === 'out') continue;
        if (b.where === 'drum') setBall(b, L.cx + b.x * L.R, L.cy + b.y * L.R, L.bd, b.rot);
        else if (b.where === 'tray') { const s = L.slots.list[b.slot]; if (s) setBall(b, s.bx, s.by, s.d, 0); }
        else { const p = flyPos(b, run ? run.t - b.cap.t0 : 99); setBall(b, p.x, p.y, p.d, p.rot); }
      }
    }

    // ---------- the drum's physics (decoration: the winners are the host's) ----------
    // h: seconds; damp: how fast the balls slow down; g: gravity; bounce: 1 lively, 0 dead (they settle).
    function physicsStep(h, jets, damp, g, bounce = 1) {
      const lim = 1 - RN, minD = 2 * RN, minD2 = minD * minD, list = inDrum, eb = 1 + 0.85 * bounce, ew = 1 + 0.75 * bounce;
      const fr = Math.max(0, 1 - damp * h);
      for (const b of list) {
        b.vy += g * h;
        if (jets) {
          // An air blower at the bottom and a swirl, like a lottery machine.
          b.vy -= 15 * Math.max(0, b.y + 0.35) * (0.5 + Math.random()) * h;
          b.vx += (Math.random() - 0.5) * 16 * h;
          b.vx += -b.y * 2.4 * h; b.vy += b.x * 2.4 * h;
        }
        b.vx *= fr; b.vy *= fr;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 3.4) { b.vx *= 3.4 / sp; b.vy *= 3.4 / sp; }
        b.x += b.vx * h; b.y += b.vy * h;
        b.rot += (b.vx * h) / RN * 0.5;
      }
      for (let a = 0; a < list.length; a++) {
        const p = list[a];
        for (let c = a + 1; c < list.length; c++) {
          const q = list[c];
          let dx = q.x - p.x, dy = q.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD2) continue;
          let dd = Math.sqrt(d2);
          if (dd < 1e-6) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dd = Math.hypot(dx, dy); }
          const nx = dx / dd, ny = dy / dd, over = (minD - dd) / 2;
          p.x -= nx * over; p.y -= ny * over; q.x += nx * over; q.y += ny * over;
          const vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
          if (vn < 0) { const j = (-eb * vn) / 2; p.vx -= j * nx; p.vy -= j * ny; q.vx += j * nx; q.vy += j * ny; }
        }
      }
      for (const b of list) {
        const dd = Math.hypot(b.x, b.y);
        if (dd > lim) {
          const nx = b.x / dd, ny = b.y / dd;
          b.x = nx * lim; b.y = ny * lim;
          const vn = b.vx * nx + b.vy * ny;
          if (vn > 0) { b.vx -= ew * vn * nx; b.vy -= ew * vn * ny; }
        }
      }
    }

    // ---------- the show: runs only from play() until the last name is in the tray ----------
    function frame(now) {
      raf = 0;
      if (dead || !run) return;
      const dt = clamp((now - lastT) / 1000, 0, 0.05);
      lastT = now;
      // (The show keeps to the clock, so a slow computer drops frames rather than making the show longer.)
      const t = run.t = (now - run.start) / 1000;
      for (const c of run.caps) {
        if (!c.started && t >= c.at) startCapture(c);
        if (c.started && !c.landed && t >= c.at + run.T.fly) {
          land(c, 'pop');
          host.sound('pop', { pitch: 1.25 });
          if (run.caps.every(x => x.landed)) host.sound('chime');
        }
      }
      const jets = t < run.jetsUntil;
      spin += ((jets ? 4.2 : 0) - spin) * Math.min(1, dt * (jets ? 3 : 2.5));
      phase += spin * dt;
      // While the blower runs the balls fly about. Then they drop fast and stop bouncing, so they all lie in the pile
      // well before the end; in the last fifth gravity fades away and they slow to a stop by themselves.
      const calm = jets ? 0 : clamp((t - run.jetsUntil) / Math.max(0.3, run.end - run.jetsUntil), 0, 1);
      const n = Math.min(6, Math.max(1, Math.ceil(dt / STEP)));
      const g = jets ? 3 : (run.quick ? 18 : 10) * clamp((1 - calm) / 0.2, 0, 1);
      const damp = jets ? 0.15 : calm < 0.8 ? 1.5 + 3 * calm : 3.9 + 80 * (calm - 0.8);
      for (let s = 0; s < n; s++) physicsStep(dt / n, jets, damp, g, jets ? 1 : Math.max(0, 0.5 - 2 * calm));
      if (jets && inDrum.length > 1 && t >= run.clack) {
        host.sound('clack', { volume: 0.25 + Math.random() * 0.4, pitch: 0.8 + Math.random() * 0.5 });
        run.clack = t + 0.06 + Math.random() * 0.09;
      }
      drawRibs();
      drawAll();
      if (t >= run.end) { finish(); host.done(); return; }
      raf = requestAnimationFrame(frame);
    }
    function startCapture(c) {
      const b = balls[c.id];
      c.started = true;
      let r0 = b.rot % 6.2832; if (r0 > Math.PI) r0 -= 6.2832; if (r0 < -Math.PI) r0 += 6.2832;
      b.where = 'fly'; b.slot = c.slot; b.cap = { t0: c.at, x0: b.x, y0: b.y, rot0: r0 };
      b.el.classList.add('lotto-top');
      listDrum();
      if (run && !run.skipping) host.sound('pop', { volume: 0.7, pitch: 0.8 });
    }
    function land(c, anim) {
      const b = balls[c.id];
      c.landed = true;
      b.where = 'tray'; b.cap = null; b.rot = 0;
      if (anim === 'pop') { b.el.classList.remove('lotto-land'); void b.el.offsetWidth; b.el.classList.add('lotto-land'); }
      renderSlot(c.slot, anim);
    }
    // The end of the show: every winner in the tray, the drum still, nothing left running.
    function finish() {
      const r = run;
      if (!r) return;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      r.skipping = true;
      for (const c of r.caps) { if (!c.started) startCapture(c); if (!c.landed) land(c, ''); }
      run = null;
      shown = r.ids.slice();
      sockets = shown.length;
      for (const id of shown) balls[id].el.classList.remove('lotto-top');
      // Whatever still moves comes to rest at once (after a full show, almost nothing; after a skip, the pile).
      if (r.t < r.end) rest(240); else rest(4, 0);
      spin = 0;
      drawRibs();
      drawAll();
    }

    // ---------- what the host calls ----------
    // Puts the balls where the view says: the winners in the tray, the ones picked earlier in the round out of the
    // drum (No repeats), everyone else in the drum. Moves nothing that is already in its place.
    function arrange(view, how) {
      if (view.names.join('\n') !== namesKey) makeBalls(view.names);
      const inTray = new Map(view.winners.map((i, j) => [i, j]));
      let drumChanged = false;
      for (const b of balls) {
        const j = inTray.get(b.i);
        if (j !== undefined) {
          if (b.where !== 'tray' || b.slot !== j) {
            if (b.where === 'drum') drumChanged = true;
            b.where = 'tray'; b.slot = j; b.cap = null; b.rot = 0; b.el.hidden = false;
            b.el.classList.remove('lotto-land', 'lotto-top', 'lotto-fadein');
            if (how && how.fade) { void b.el.offsetWidth; b.el.classList.add('lotto-fadein'); }
          }
        } else if (view.picked[b.i]) {
          if (b.where !== 'out') { if (b.where === 'drum') drumChanged = true; b.where = 'out'; b.el.hidden = true; }
        } else if (b.where !== 'drum') { dropIn(b); drumChanged = true; }
      }
      if (drumChanged || !balls.some(b => b.where === 'drum' && (b.x || b.y))) pile();
      listDrum();
    }

    function show(view, how) {
      if (run) finish();
      const fresh = view.names.join('\n') !== namesKey;
      arrange(view, how);
      shown = view.winners.slice();
      sockets = shown.length || clamp(view.next || view.count || 1, 1, 5);
      if (fresh) sizeKey = '';
      relayout(false);
      // A new pick shown without its show (reduce motion, or picked in another copy a while ago) fades in.
      if (how && how.fade) shown.forEach((_, j) => renderSlot(j, 'fade'));
      else refreshSlots();
      drawAll();
    }

    function play(view) {
      if (run) finish();
      if (!view.winners.length) { show(view); host.done(); return; }
      if (view.names.join('\n') !== namesKey) arrange(view);
      // The last pick's balls leave the tray: out of the round (No repeats), or back into the drum, where every winner
      // is drawn from.
      const win = new Set(view.winners);
      for (const b of balls) {
        if (view.picked[b.i] && !win.has(b.i)) {
          if (b.where !== 'out') { b.where = 'out'; b.el.hidden = true; b.el.classList.remove('lotto-land', 'lotto-top', 'lotto-fadein'); }
        } else if (b.where !== 'drum') dropIn(b);
      }
      listDrum();
      shown = [];
      const tl = timeline(view.winners.length, view.quick);
      run = { t: 0, start: performance.now(), ids: view.winners.slice(), T: tl.T, end: tl.end, jetsUntil: tl.jetsUntil, clack: 0.05, quick: !!view.quick,
        caps: view.winners.map((id, j) => ({ id, slot: j, at: tl.ats[j], started: false, landed: false })) };
      // A shove for the resting pile, so the first frames already look lively.
      for (const b of inDrum) { b.vx += (Math.random() - 0.5) * 1.5; b.vy -= Math.random() * 1.5; }
      relayout(true);
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }

    return {
      show,
      play,
      skip() { if (run) finish(); },
      resize() { sizeKey = ''; relayout(true); },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; run = null; box.remove(); }
    };
  }
});
