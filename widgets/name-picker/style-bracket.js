/*
 * Name Picker style: Bracket.
 * Everyone goes into a tournament bracket, drawn at random, and the teacher taps the winner of each match. Before the
 * first draw every name waits on the stage as a tile, as in Groups. The bracket's two halves meet at a trophy in the
 * middle, seed 1's half on the left, one column for each round. A student with a bye sits in round 2, and each half
 * takes one row for each student in it. On a draw the names gather into a stack, then deal out one at a time into their
 * first spots, with a pop as each lands and a zap with the last: about 3 seconds for any class (with Quick about
 * 1½). A tap on a name in a ready match slides it on to its next spot. Every name is one size, as large as fits.
 * The host draws and saves the bracket and each tap (host.tap); this file only lays it out and puts on the shows. How a
 * style plugs in, and how the spots are numbered: the comment at the top of index.html.
 */
NamePicker.register('bracket', {
  css: `
/* --bracket-line: the lines, the dashed spots, and the grey trophy, at 3:1 on the stage. --bracket-halo: around a ready spot. */
.bracket { position: absolute; inset: 0; overflow: hidden; line-height: 1; --bracket-line: #7c8a9e; --bracket-halo: color-mix(in srgb, var(--b21-accent) 18%, transparent); }
[data-b21-theme="dark"] .bracket { --bracket-line: #6b7280; --bracket-halo: color-mix(in srgb, var(--b21-accent) 25%, transparent); }
.bracket *, .bracket *::before, .bracket *::after { box-sizing: border-box; }
/* A name: waiting on the stage before the first draw, in a spot of the bracket, in the stack, or on its way. */
.bracket-tile, .bracket-spot, .bracket-stack i, .bracket-top, .bracket-fly {
  position: absolute; display: flex; align-items: center; justify-content: center; white-space: nowrap; font-weight: 700;
  background: var(--b21-bg); border: 1px solid var(--b21-border); color: var(--b21-text);
}
[data-b21-theme="dark"] .bracket-tile, [data-b21-theme="dark"] .bracket-spot, [data-b21-theme="dark"] .bracket-stack i,
[data-b21-theme="dark"] .bracket-top, [data-b21-theme="dark"] .bracket-fly { background: var(--b21-surface-2); }
.bracket-spot { overflow: hidden; transition: opacity .2s; }
.bracket-spot.bracket-empty { background: transparent; border: 1.5px dashed var(--bracket-line); }
.bracket-spot.bracket-ready { border: 2px solid var(--b21-accent); box-shadow: 0 0 0 var(--bracket-halo-w, 3px) var(--bracket-halo); cursor: pointer; }
/* A student who lost: dimmed by its color, which stays readable (4.5:1). */
.bracket-spot.bracket-out { color: var(--b21-muted); background: transparent; }
.bracket-spot.bracket-champ { border-width: 2px; }
.bracket-spot.bracket-champ:not(.bracket-empty):not(.bracket-wait) { background: var(--np-win); color: var(--np-ink); border: 0; box-shadow: 0 6px 18px rgba(245, 158, 11, .35); }
/* A spot a name is on its way to: empty until it lands. */
.bracket-spot.bracket-wait { background: transparent; border: 1.5px dashed var(--bracket-line); box-shadow: none; color: transparent; }
.bracket-spot.bracket-champ.bracket-wait { border-width: 2px; }
.bracket-spot.bracket-hide { color: transparent; }
.bracket-spot:focus { outline: none; }
.bracket-spot:focus-visible { outline: 3px solid var(--b21-accent); outline-offset: 3px; }
.bracket-lines { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.bracket-lines path { fill: none; stroke: var(--bracket-line); stroke-width: 2; stroke-linejoin: round; }
.bracket-lines path.bracket-won { stroke: var(--b21-accent); stroke-width: 3; }
.bracket-trophy { position: absolute; color: var(--bracket-line); pointer-events: none; }
.bracket-trophy.bracket-gold { color: var(--np-win); }
.bracket-trophy svg { display: block; width: 100%; height: 100%; fill: currentColor; }
.bracket-stack, .bracket-ghost, .bracket-fly { position: absolute; z-index: 2; pointer-events: none; }
.bracket-top { z-index: 1; }
.bracket-ghost { white-space: nowrap; font-weight: 700; color: var(--b21-text); display: flex; align-items: center; justify-content: center; }
.bracket-fly { z-index: 3; border: 2px solid var(--b21-accent); box-shadow: 0 10px 24px rgba(0, 0, 0, .18); }
.bracket-land { animation: bracket-land var(--bracket-pop, .3s) ease-out; }
.bracket-fade { animation: bracket-fade .3s ease-out; }
@keyframes bracket-land { 0% { transform: scale(.8); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes bracket-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .bracket-land { animation: none; } .bracket-spot { transition: none; } }
`,
  mount(root, host) {
    const P_ = 'bracket-';
    // How long the draw takes (ms): the names gather into the stack, then each flies to its first spot. The last one lands
    // at about `all`, whatever the number of names. A tap's slide: `move`.
    const NORMAL = { all: 2900, gather: 300, fly: 450, move: 300 }, QUICK = { all: 1400, gather: 150, fly: 260, move: 150 };
    // The middle column, for the champion and the trophy, is this many columns wide. A spot takes `spotW` of its column
    // (the rest is for the lines), and the champion's spot `champW` columns.
    const MID = 1.6, spotW = 0.86, champW = 1.35;
    const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4.2 4A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.2 12 4 4 0 0 1 4 8V5h3zm0 4H6v1a2 2 0 0 0 1.3 1.9A5 5 0 0 1 7 8zm10 0v1a5 5 0 0 1-.3 1.9A2 2 0 0 0 18 8V7z"/></svg>';
    const SVG = 'http://www.w3.org/2000/svg';
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const px = v => (Math.round(v * 10) / 10) + 'px';
    const depth = s => 31 - Math.clz32(s);

    const box = host.el('div', P_.slice(0, -1), root);
    let names = [];       // view.names
    let B = null;         // view.bracket
    let key = '';         // what the stage shows: the names, or the bracket's seeds
    let tiles = [];       // before the first draw: one for each name
    let spots = [];       // the bracket's spots, in reading order: { s, el, half (0 left, 1 right, 2 the champion), L (its column), u (its row) }
    let at = new Map();   // spot number → its entry in spots
    let lines = [];       // { from, to, el }
    let svg = null, trophy = null;
    let geo = null;       // the bracket's shape: { D (rounds before the champion), most (rows in the taller half) }
    let L = null;         // the layout: { W, H, fs, cfs, sw, sh, cw, ch, x(s), y(s) } or, before the first draw, { tiles, fs, radius }
    let run = null;       // the draw running: { t0, T, ev, ei, anims, extra, deck, top, order, landed, popAt }
    let slid = null;      // a tap's slide running: { anims, extra, done }
    let raf = 0, dead = false;

    // ---- Measuring names in the board's letters (Settings → Text style), on a canvas that is never shown.
    const measure = document.createElement('canvas').getContext('2d');
    const widths = new Map();
    let fam = '';
    function em(text, weight) {
      const k = weight + '|' + text;
      let v = widths.get(k);
      if (v === undefined) { measure.font = weight + ' 100px ' + fam; v = measure.measureText(text).width / 100; widths.set(k, v); }
      return v;
    }
    function letters() { const f = host.token('font') || 'system-ui, sans-serif'; if (f !== fam) { fam = f; widths.clear(); } }
    const nameAt = s => B && B.at[s] >= 0 ? B.seeds[B.at[s]] : '';

    // ---- The bracket's shape, in columns and rows, worked out once for each bracket. A spot drawn with nothing feeding it
    // (a first-round spot, or a bye's student in round 2) takes one row; any other sits halfway between the two that
    // feed it. Byes make a half shorter, not emptier. The halves line up on their last spots (2 and 3), so the lines into
    // the champion's spot run straight across.
    function shape() {
      const P = B.P, D = depth(P), rows = new Map();
      const lone = s => s >= P || !B.shown[2 * s];
      const units = s => lone(s) ? 1 : units(2 * s) + units(2 * s + 1);
      const place = (s, top) => {
        if (lone(s)) { rows.set(s, top + 0.5); return; }
        place(2 * s, top); place(2 * s + 1, top + units(2 * s));
        rows.set(s, (rows.get(2 * s) + rows.get(2 * s + 1)) / 2);
      };
      place(2, 0); place(3, 0);
      const R = Math.max(rows.get(2), rows.get(3)), down = [R - rows.get(2), R - rows.get(3)];
      if (down[0] || down[1]) { rows.clear(); place(2, down[0]); place(3, down[1]); }
      const most = Math.max(down[0] + units(2), down[1] + units(3));
      const out = [];
      for (let s = 2; s < 2 * P; s++) if (B.shown[s]) out.push({ s, half: s >> (depth(s) - 1) === 2 ? 0 : 1, L: D - depth(s), u: rows.get(s) });
      // Reading order: the left half top to bottom, then the right half (and the champion's spot last).
      out.sort((a, b) => a.half - b.half || a.u - b.u || (a.half ? b.L - a.L : a.L - b.L));
      out.push({ s: 1, half: 2, L: D, u: (rows.get(2) + rows.get(3)) / 2 });
      return { D, most, spots: out };
    }

    // ---- Drawing the stage as it is (no show).
    function clear() { box.replaceChildren(); tiles = []; spots = []; at = new Map(); lines = []; svg = trophy = geo = null; }
    function build() {
      clear();
      if (!B) { tiles = names.map(n => host.el('div', P_ + 'tile', box, n)); return; }
      const sh = shape();
      svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('class', P_ + 'lines'); svg.setAttribute('aria-hidden', 'true');
      box.appendChild(svg);
      trophy = host.el('div', P_ + 'trophy', box);
      trophy.innerHTML = TROPHY;
      for (const sp of sh.spots) {
        const e = host.el('div', P_ + 'spot', box);
        e.dataset.spot = sp.s; e.dataset.round = sh.D - depth(sp.s) + 1; e.dataset.half = ['L', 'R', 'C'][sp.half];
        if (sp.s === 1) e.classList.add(P_ + 'champ');
        if (sp.s < B.P && sp.s >= B.P / 2 && !B.shown[2 * sp.s]) e.setAttribute('data-bye', '');
        const o = Object.assign({ el: e }, sp);
        spots.push(o); at.set(sp.s, o);
        if (sp.s > 1) { const l = document.createElementNS(SVG, 'path'); l.dataset.from = sp.s; l.dataset.to = sp.s >> 1; svg.appendChild(l); lines.push({ from: sp.s, to: sp.s >> 1, el: l }); }
      }
      L = null;
      geo = { D: sh.D, most: sh.most };
    }
    // Who is in each spot, and how it looks: ready to tap (a button for the keyboard and screen readers), out, or empty.
    // The winners' lines in the accent color, drawn over the others; the trophy gold once there is a champion.
    function update() {
      if (!B) return;
      const ready = new Set(B.ready), won = new Set(B.picks), out = new Set(B.picks.map(s => s ^ 1));
      for (const sp of spots) {
        const e = sp.el, name = nameAt(sp.s);
        if (e.textContent !== name) e.textContent = name;
        e.classList.toggle(P_ + 'empty', !name);
        e.classList.toggle(P_ + 'ready', ready.has(sp.s));
        e.classList.toggle(P_ + 'out', out.has(sp.s));
        if (ready.has(sp.s)) { e.tabIndex = 0; e.setAttribute('role', 'button'); e.setAttribute('aria-label', `Move ${name} on`); }
        else { e.removeAttribute('tabindex'); e.removeAttribute('role'); e.removeAttribute('aria-label'); }
      }
      for (const l of lines) l.el.classList.toggle(P_ + 'won', won.has(l.from));
      svg.append(...lines.filter(l => !won.has(l.from)).map(l => l.el), ...lines.filter(l => won.has(l.from)).map(l => l.el));
      trophy.classList.toggle(P_ + 'gold', B.at[1] >= 0);
    }

    // ---- Layout. The bracket: columns of one width (the middle one wider), rows of one height, and every name one size,
    // the largest at which the longest name fits its spot.
    function bracketLayout() {
      const W = box.clientWidth, H = box.clientHeight;
      if (!W || !H || !geo) return null;
      const { D, most } = geo;
      const padX = clamp(W * 0.015, 3, 16), padY = clamp(H * 0.04, 3, 20);
      const colW = (W - 2 * padX) / (2 * D + MID), rowH = (H - 2 * padY) / most;
      const longest = Math.max(1.5, ...B.seeds.map(n => em(n, 700)));
      // (A name's letters reach about 1.2 of its size from top to bottom: they stay inside the spot's border.)
      const sw = colW * spotW, sh = Math.min(rowH * 0.84, colW * 0.42, H * 0.16);
      const fs = Math.max(1, Math.min(sh * 0.6, (sh - 3) / 1.2, (sw * 0.88 - 6) / longest));
      // The champion's spot: a little larger than the others, and never tiny, as the middle column has the room.
      const cw = colW * champW, ch = Math.min(H * 0.3, Math.max(sh * 1.4, Math.min(cw * 0.32, H * 0.09)));
      const cfs = Math.max(1, Math.min(Math.max(fs * 1.3, ch * 0.45), ch * 0.56, (ch - 4) / 1.25, (cw * 0.88 - 6) / longest));
      const x = sp => sp.half === 2 ? W / 2 : sp.half === 0 ? padX + sp.L * colW + colW / 2 : W - padX - sp.L * colW - colW / 2;
      const y0 = sp => padY + sp.u * rowH;
      // The trophy above the champion's spot, as large as the middle column and the room above allow.
      const champ = spots[spots.length - 1], cy = y0(champ), gap = Math.max(3, sh * 0.3);
      const ts = Math.max(0, Math.min(colW * 0.9, Math.max(sh * 2.4, ch * 1.3), cy - ch / 2 - gap - padY * 0.5));
      // With room to spare below (a small class), the bracket and its trophy sit in the middle of the stage together.
      const top = cy - ch / 2 - gap - ts, bottom = Math.max(...spots.map(sp => y0(sp) + (sp.s === 1 ? ch : sh) / 2));
      const dy = Math.max(0, (H - bottom - top) / 2);
      return { W, H, colW, rowH, sw, sh, cw, ch, fs, cfs, x, y: sp => y0(sp) + dy, padY, trophy: { x: W / 2 - ts / 2, y: top + dy, w: ts, h: ts } };
    }
    // Tiles, before the first draw: every grid is tried, and the one with the largest names wins. Every name one size.
    function tileLayout() {
      const W = box.clientWidth, H = box.clientHeight, N = names.length;
      if (!W || !H || !N) return null;
      const m = Math.min(W, H), pad = clamp(m * 0.035, 5, 20), g = clamp(m * 0.018, 3, 12);
      const longest = Math.max(0.5, ...names.map(n => em(n, 700)));
      let best = null;
      for (let c = 1; c <= N; c++) {
        const r = Math.ceil(N / c);
        if (c > 1 && Math.ceil(N / (c - 1)) === r) continue;
        const tw = (W - 2 * pad - (c - 1) * g) / c, th = Math.min((H - 2 * pad - (r - 1) * g) / r, tw * 0.62);
        if (tw <= 2 || th <= 2) continue;
        const fs = Math.min(th * 0.5, (tw * 0.86 - 4) / longest, H * 0.2);
        if (fs > 0 && (!best || fs > best.fs)) best = { c, r, tw, th, fs };
      }
      if (!best) return null;
      const { c, r, tw, th, fs } = best, y0 = (H - (r * th + (r - 1) * g)) / 2;
      return { W, H, fs, tiles: names.map((_, i) => {
        const row = Math.floor(i / c), inRow = row === r - 1 ? N - row * c : c, col = i % c;
        return { x: (W - (inRow * tw + (inRow - 1) * g)) / 2 + col * (tw + g), y: y0 + row * (th + g), w: tw, h: th };
      }), radius: clamp(th * 0.2, 4, 14) };
    }
    const place = (e, r) => { const s = e.style; s.left = px(r.x); s.top = px(r.y); s.width = px(Math.max(0, r.w)); s.height = px(Math.max(0, r.h)); };
    // Where a spot is, and its size: { x, y, w, h } (x, y its top left corner).
    function rectOf(sp) {
      const c = sp.s === 1, w = c ? L.cw : L.sw, h = c ? L.ch : L.sh;
      return { x: L.x(sp) - w / 2, y: L.y(sp) - h / 2, w, h };
    }
    function relayout() {
      letters();
      if (!B) {
        const T = tileLayout();
        L = T;
        if (!T) return;
        tiles.forEach((t, i) => { place(t, T.tiles[i]); t.style.fontSize = px(T.fs); t.style.borderRadius = px(T.radius); });
        // A last check in the page itself, in case the letters measured differently: every name whole.
        const over = Math.max(1, ...tiles.map(t => t.scrollWidth / Math.max(1, t.clientWidth - 4)));
        if (over > 1) { T.fs = T.fs / over * 0.97; for (const t of tiles) t.style.fontSize = px(T.fs); }
        return;
      }
      for (let pass = 0; pass < 2; pass++) {
        L = bracketLayout();
        if (!L) return;
        box.style.setProperty('--bracket-halo-w', px(clamp((L.rowH - L.sh) / 2 - 0.5, 0, 3)));   // (halos never meet)
        const radius = px(clamp(L.sh * 0.3, 3, 10));
        for (const sp of spots) {
          place(sp.el, rectOf(sp));
          sp.el.style.fontSize = px(sp.s === 1 ? L.cfs : L.fs);
          sp.el.style.borderRadius = sp.s === 1 ? px(clamp(L.ch * 0.3, 4, 14)) : radius;
        }
        // The lines: from a spot's outer edge across to the middle of the gap, then up or down, then into the spot its
        // winner goes to.
        for (const l of lines) {
          const a = at.get(l.from), b = at.get(l.to), dir = a.half === 0 ? 1 : -1, ra = rectOf(a), rb = rectOf(b);
          const x0 = dir > 0 ? ra.x + ra.w : ra.x, y0 = ra.y + ra.h / 2, mid = L.x(a) + dir * L.colW / 2, x1 = dir > 0 ? rb.x : rb.x + rb.w, y1 = rb.y + rb.h / 2;
          const r = n => Math.round(n * 10) / 10;
          l.el.setAttribute('d', `M${r(x0)},${r(y0)} H${r(mid)} V${r(y1)} H${r(x1)}`);
        }
        place(trophy, L.trophy);
        // (The same check for the spots: if a name is wider than its spot, every name gets smaller.)
        const over = Math.max(1, ...spots.map(sp => sp.el.textContent ? sp.el.scrollWidth / Math.max(1, sp.el.clientWidth) : 1));
        if (over <= 1.001) return;
        widths.forEach((v, k) => widths.set(k, v * over * 1.03));
      }
    }
    const keyOf = v => v.bracket ? 'b|' + v.bracket.seeds.join('\n') : 't|' + v.names.join('\n');
    function take(view) {
      names = view.names.slice(); B = view.bracket || null;
      box.style.setProperty('--bracket-pop', view.quick ? '.15s' : '.3s');   // (the pop as a name lands: shorter with Quick)
    }

    // ---- The keyboard. A spot that had the focus and can't be tapped any more passes it on to the next ready spot in
    // reading order (round again from the top), or lets it go when none is left (the host then puts it on the main button).
    function focused() { const a = document.activeElement; return a && box.contains(a) && a.dataset.spot ? +a.dataset.spot : 0; }
    function keepFocus(was) {
      if (!was || !B) return;
      const cur = at.get(was);
      if (cur && document.activeElement === cur.el && B.ready.includes(was)) return;
      const order = spots.map(sp => sp.s), i = order.indexOf(was), ready = order.filter(s => B.ready.includes(s));
      const next = ready.find(s => order.indexOf(s) > i) || ready[0];
      if (next) at.get(next).el.focus({ preventScroll: true });
      else if (box.contains(document.activeElement)) document.activeElement.blur();
    }
    box.addEventListener('click', e => { const t = e.target.closest && e.target.closest('.' + P_ + 'spot'); if (t && box.contains(t)) host.tap(+t.dataset.spot); });
    box.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest && e.target.closest('.' + P_ + 'spot');
      if (!t || !box.contains(t)) return;
      e.preventDefault();
      if (!e.repeat) host.tap(+t.dataset.spot);
    });

    // ---- A tap's slide: the name goes from its spot on to the next (or, for Undo, back), and the spot it lands in shows it
    // with a pop. The last tap lands in the champion's spot, with the champion's zap.
    function anim(list, el, frames, opts) {
      if (!el.animate) return null;
      try { const a = el.animate(frames, opts); list.push(a); return a; } catch (e) { return null; }
    }
    function landed(to, on) {
      const e = at.get(to).el;
      e.classList.remove(P_ + 'wait', P_ + 'hide');
      if (!on) return;
      e.classList.remove(P_ + 'land'); void e.offsetWidth; e.classList.add(P_ + 'land');
      e.addEventListener('animationend', () => e.classList.remove(P_ + 'land'), { once: true });
      if (to === 1) trophy.classList.add(P_ + 'gold');
      host.sound('pop');
      if (to === 1) host.sound('champion');
    }
    function slide(s, on, view) {
      const from = at.get(on ? s : s >> 1), to = at.get(on ? s >> 1 : s);
      if (!from || !to) return;
      if (!L || view.reduced || !box.animate) { landed(to.s, on); return; }   // (at once: no stage to slide on, or less motion)
      const T = view.quick ? QUICK : NORMAL, a = rectOf(from), b = rectOf(to);
      to.el.classList.add(on ? P_ + 'wait' : P_ + 'hide');
      if (on && to.s === 1) trophy.classList.remove(P_ + 'gold');
      const f = host.el('div', P_ + 'fly', box, nameAt(to.s));
      f.setAttribute('aria-hidden', 'true');
      place(f, { x: a.x + a.w / 2 - L.sw / 2, y: a.y + a.h / 2 - L.sh / 2, w: L.sw, h: L.sh }); f.style.fontSize = px(L.fs); f.style.borderRadius = at.get(2).el.style.borderRadius;
      const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
      const run = slid = { anims: [], extra: [f], to: to.s, on };
      const done = () => { if (slid !== run) return; endSlide(); landed(to.s, on); };
      const m = anim(run.anims, f, [{ transform: 'none' }, { transform: `translate(${px(dx)}, ${px(dy)})` }], { duration: T.move, easing: 'cubic-bezier(.3, .7, .4, 1)', fill: 'forwards' });
      if (m) m.onfinish = done; else done();
    }
    // The slide ends at once: the name in the spot it was going to, nothing left on the stage, nothing running.
    function endSlide() {
      const r = slid;
      if (!r) return;
      slid = null;
      for (const a of r.anims) { a.onfinish = null; try { a.cancel(); } catch (e) { /* gone */ } }
      for (const e of r.extra) e.remove();
      const t = at.get(r.to);
      if (t) t.el.classList.remove(P_ + 'wait', P_ + 'hide');
      if (r.on && r.to === 1 && B && B.at[1] >= 0 && trophy) trophy.classList.add(P_ + 'gold');
    }

    // ---- The draw. Events at set times, played by animation frames; the flights are the browser's own animations.
    // The names deal out to the two halves in turn, top to bottom.
    function schedule(T) {
      const first = spots.filter(sp => sp.s >= B.P || sp.el.hasAttribute('data-bye'));
      const sides = [first.filter(sp => sp.half === 0), first.filter(sp => sp.half === 1)], order = [];
      for (let i = 0; i < Math.max(sides[0].length, sides[1].length); i++) for (const side of sides) if (side[i]) order.push(side[i].s);
      const n = order.length, step = n > 1 ? (T.all - T.gather - T.fly) / (n - 1) : 0;
      const ev = order.map((s, j) => ({ t: T.gather + j * step, fn: () => fly(s, j, n) }));
      ev.push({ t: T.gather - 1, fn: () => nextUp(0) });
      return { ev: ev.sort((a, b) => a.t - b.t), order };
    }
    // The stack waits on the champion's spot: a few cards, the next name on top.
    function stackRect() { const c = rectOf(at.get(1)); return { x: c.x + c.w / 2 - L.sw / 2, y: c.y + c.h / 2 - L.sh / 2, w: L.sw, h: L.sh }; }
    function openStack() {
      const s = stackRect(), deck = host.el('div', P_ + 'stack', box), radius = at.get(2).el.style.borderRadius;
      deck.setAttribute('aria-hidden', 'true');
      place(deck, s);
      for (let d = 3; d >= 1; d--) { const i = host.el('i', null, deck); place(i, { x: d * 2, y: d * 2, w: s.w, h: s.h }); i.style.borderRadius = radius; }
      run.top = host.el('div', P_ + 'top', deck, '');
      place(run.top, { x: 0, y: 0, w: s.w, h: s.h }); run.top.style.fontSize = px(L.fs); run.top.style.borderRadius = radius;
      run.deck = deck; run.extra.push(deck);
    }
    function nextUp(j) {
      if (!run || !run.top) return;
      const s = run.order[j];
      if (s === undefined) { run.deck.remove(); run.deck = run.top = null; return; }
      run.top.textContent = nameAt(s);
    }
    // The names on the stage now gather into the stack.
    function gather(from, T) {
      const s = stackRect(), cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      for (const f of from) {
        const g = host.el('div', P_ + 'ghost' + (f.tile ? ' ' + P_ + 'tile' : ''), box, f.text);
        g.setAttribute('aria-hidden', 'true');
        place(g, f.r); g.style.fontSize = px(f.fs); if (f.radius) g.style.borderRadius = px(f.radius);
        run.extra.push(g);
        const dx = cx - (f.r.x + f.r.w / 2), dy = cy - (f.r.y + f.r.h / 2);
        const a = anim(run.anims, g, [{ transform: 'none', opacity: 1 }, { transform: `translate(${px(dx)}, ${px(dy)}) scale(.6)`, opacity: 0 }], { duration: T.gather, easing: 'ease-in', fill: 'forwards' });
        if (!a) g.remove();
      }
    }
    // One name flies from the stack to its first spot, and lands with a pop. The last one lands with the zap.
    function fly(s, j, n) {
      const T = run.T, sp = at.get(s), st = stackRect(), r = rectOf(sp);
      nextUp(j + 1);
      const f = host.el('div', P_ + 'fly', box, nameAt(s));
      f.setAttribute('aria-hidden', 'true');
      place(f, st); f.style.fontSize = px(L.fs); f.style.borderRadius = sp.el.style.borderRadius;
      run.extra.push(f);
      const dx = r.x + r.w / 2 - (st.x + st.w / 2), dy = r.y + r.h / 2 - (st.y + st.h / 2);
      const land = () => {
        f.remove();
        if (!run || dead) return;
        sp.el.classList.remove(P_ + 'wait'); sp.el.classList.add(P_ + 'land');
        sp.el.addEventListener('animationend', () => sp.el.classList.remove(P_ + 'land'), { once: true });
        run.landed++;
        // (No more than about 30 pops a second, for a big class with Quick.)
        const now = performance.now();
        if (now - run.popAt >= 34 || run.landed === n) { run.popAt = now; host.sound('pop', { pitch: 0.9 + 0.25 * (j / Math.max(1, n - 1)) }); }
        if (run.landed === n) { host.sound('zap'); end(false); }
      };
      const a = anim(run.anims, f, [{ transform: 'none', opacity: 1 }, { transform: `translate(${px(dx)}, ${px(dy)})`, opacity: 1, offset: 0.85 }, { transform: `translate(${px(dx)}, ${px(dy)})`, opacity: 0 }],
        { duration: T.fly, easing: 'cubic-bezier(.3, .7, .4, 1)', fill: 'forwards' });
      if (a) a.onfinish = land; else land();
    }
    function frame(now) {
      raf = 0;
      if (dead || !run) return;
      const t = now - run.t0;
      while (run && run.ei < run.ev.length && run.ev[run.ei].t <= t) run.ev[run.ei++].fn();
      if (run && run.ei < run.ev.length) raf = requestAnimationFrame(frame);
    }
    // The draw ends: by itself (the last name has landed), or at once (skip): every name in its spot, nothing running.
    function end(skipping) {
      const r = run;
      if (!r) return;
      run = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const a of r.anims) { a.onfinish = null; try { a.cancel(); } catch (e) { /* gone */ } }
      for (const e of r.extra) e.remove();
      for (const sp of spots) { sp.el.classList.remove(P_ + 'wait'); if (skipping) sp.el.classList.remove(P_ + 'land'); }
      box.inert = false;
      if (!skipping) host.done();
    }

    // ---- What the host calls
    function show(view, how) {
      if (dead) return;
      const was = focused();
      end(true); endSlide();
      const k = keyOf(view), fade = !!(how && how.fade);
      take(view);
      if (k !== key || fade || (B ? !spots.length : !tiles.length)) { key = k; build(); }
      relayout();
      update();
      if (fade) { box.classList.remove(P_ + 'fade'); void box.offsetWidth; box.classList.add(P_ + 'fade'); }
      if (B && how && how.moved) slide(how.moved, true, view);
      else if (B && how && how.back) slide(how.back, false, view);
      keepFocus(was);
    }
    function play(view) {
      if (dead) return;
      end(true); endSlide();
      // Where every name on the stage is now: they gather into the stack from there.
      const from = [];
      const rel = e => { const b = box.getBoundingClientRect(), r = e.getBoundingClientRect(); return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height }; };
      for (const t of tiles) from.push({ text: t.textContent, r: rel(t), fs: parseFloat(t.style.fontSize) || 12, radius: parseFloat(t.style.borderRadius) || 0, tile: true });
      for (const sp of spots) if (sp.el.textContent) from.push({ text: sp.el.textContent, r: rel(sp.el), fs: parseFloat(sp.el.style.fontSize) || 12 });
      take(view);
      key = keyOf(view);
      box.classList.remove(P_ + 'fade');
      build();
      relayout();
      update();
      if (!B || !L || !box.animate) { host.done(); return; }
      const T = view.quick ? QUICK : NORMAL, plan = schedule(T);
      for (const s of plan.order) at.get(s).el.classList.add(P_ + 'wait');
      box.inert = true;   // (no spot can be tabbed to or tapped until the names have landed)
      run = { t0: performance.now(), T, ev: plan.ev, order: plan.order, ei: 0, anims: [], extra: [], landed: 0, popAt: -1e9, deck: null, top: null };
      openStack();
      gather(from, T);
      raf = requestAnimationFrame(frame);
    }
    return {
      show,
      play,
      skip() { end(true); },
      resize() {
        if (dead) return;
        fam = ''; widths.clear();   // (the letters may have changed, or a font finished loading: measure again)
        endSlide();
        relayout();
        if (run && run.deck) place(run.deck, stackRect());   // (a draw running: the names still to come deal from here)
      },
      destroy() { dead = true; end(true); endSlide(); box.remove(); }
    };
  }
});
