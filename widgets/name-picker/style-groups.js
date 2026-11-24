/*
 * Name Picker style: Groups.
 * The names go into 2 to 6 random groups, one card for each. Before the first draw every name waits on the stage as a
 * tile. On a draw the names gather into a stack, then deal out one at a time, Group 1, Group 2, … and round again, each
 * flying from the stack to its place, with a pop as it lands and a chime after the last: about 3 seconds for any class
 * (with Quick about 1½). Every name on the cards is one size, as large as the stage allows.
 * The host draws and saves the groups; this file only lays them out and puts on the show. How a style plugs in: the
 * comment at the top of index.html.
 */
NamePicker.register('groups', {
  css: `
.groups { position: absolute; inset: 0; overflow: hidden; line-height: 1; }
.groups *, .groups *::before, .groups *::after { box-sizing: border-box; }
/* A name on its own: waiting on the stage before the first draw, in the stack, or flying to its card. */
.groups-tile, .groups-stack i, .groups-top, .groups-fly {
  position: absolute; display: flex; align-items: center; justify-content: center; white-space: nowrap; font-weight: 700;
  background: var(--b21-bg); border: 1px solid var(--b21-border); color: var(--b21-text);
}
[data-b21-theme="dark"] .groups-tile, [data-b21-theme="dark"] .groups-stack i, [data-b21-theme="dark"] .groups-top, [data-b21-theme="dark"] .groups-fly,
[data-b21-theme="dark"] .groups-card { background: var(--b21-surface-2); }
.groups-card { position: absolute; overflow: hidden; background: var(--b21-bg); box-shadow: 0 0 0 1px var(--b21-border), 0 1px 3px rgba(0, 0, 0, .06); }
.groups-head { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; justify-content: center; overflow: hidden;
  white-space: nowrap; font-weight: 750; letter-spacing: .01em; color: var(--np-ink); }
.groups-name { position: absolute; text-align: center; white-space: nowrap; font-weight: 700; line-height: 1.22; color: var(--b21-text); }
.groups-wait { visibility: hidden; }
.groups-land { animation: groups-land .3s ease-out; }
.groups-fade { animation: groups-fade .3s ease-out both; }
.groups-stack, .groups-ghost { position: absolute; z-index: 2; pointer-events: none; }
.groups-top { z-index: 1; }
.groups-ghost { white-space: nowrap; font-weight: 700; line-height: 1.22; color: var(--b21-text); text-align: center; }
.groups-ghost.groups-tile { position: absolute; }
.groups-fly { z-index: 3; pointer-events: none; border: 2px solid var(--b21-accent); box-shadow: 0 10px 24px rgba(0, 0, 0, .18); }
@keyframes groups-land { 0% { transform: scale(.8); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes groups-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .groups-land { animation: none; } }
`,
  mount(root, host) {
    const P = 'groups-';
    // The heading colors, Group 1 to Group 6: red, orange, yellow, green, blue, and purple.
    const COLORS = ['--np-c1', '--np-c2', '--np-c3', '--np-c4', '--np-c6', '--np-c7'];
    // How long the show takes (ms): the names gather into the stack, then each flies to its card. The last one lands
    // at about `all`, whatever the number of names.
    const NORMAL = { all: 2900, gather: 300, fly: 450 }, QUICK = { all: 1400, gather: 150, fly: 260 };
    // A card, in parts of the names' size (em): the heading, the space above and below the names, a line, the space
    // between two columns of names, and the space at each side.
    const C = { head: 1.05, minHead: 19, top: 0.3, bottom: 0.4, line: 1.22, colGap: 1.1, side: 0.5 };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const px = v => (Math.round(v * 10) / 10) + 'px';

    const box = host.el('div', P.slice(0, -1), root);
    let names = [];       // view.names
    let groups = [];      // view.groups: the entries in each group, in deal order
    let key = '';         // what the stage shows: the names and the groups
    let cards = [];       // one for each group: { el, head, names: [name elements] }
    let tiles = [];       // before the first draw: one for each name
    let L = null;         // the layout: { W, H, fs, cards: [{ x, y, w, h, hh, hf, at: [{ x, y, w, h }] }], stack }
    let run = null;       // the show running: { t0, ev, ei, anims, extra (elements to remove), deck }
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

    // ---- Layout. Cards: every grid of cards (1 to k across) and 1 to 3 columns of names in a card is tried, and the one
    // with the largest names wins. Every name is that size. Cards are as tall as their names need, in the middle.
    function cardLayout() {
      const W = box.clientWidth, H = box.clientHeight, k = groups.length;
      if (!W || !H || !k) return null;
      const m = Math.min(W, H), pad = clamp(m * 0.03, 5, 20), gap = clamp(m * 0.025, 4, 16);
      const most = Math.max(1, ...groups.map(g => g.length));
      const longest = Math.max(0.5, ...groups.flat().map(i => em(names[i], 700)));
      const headW = em('Group ' + k, 750);
      const max = clamp(H * 0.2, 12, 80);
      let best = null;
      for (let across = 1; across <= k; across++) {
        const down = Math.ceil(k / across);
        if (across > 1 && Math.ceil(k / (across - 1)) === down) continue;   // (the same rows with fewer across is wider)
        const cw = (W - 2 * pad - gap * (across - 1)) / across, chMax = (H - 2 * pad - gap * (down - 1)) / down;
        if (cw <= 2 || chMax <= 2) continue;
        for (let ic = 1; ic <= 3; ic++) {
          const per = Math.ceil(most / ic);
          if (ic > 1 && Math.ceil(most / (ic - 1)) === per) continue;
          const body = C.top + per * C.line + C.bottom;
          const byW = cw / (ic * longest + (ic - 1) * C.colGap + 2 * C.side);
          const byH = Math.min(chMax / (C.head + body), (chMax - C.minHead) / body);
          const fs = Math.min(byW, Math.max(byH, chMax / (C.head + body) * 0.5), max);
          if (fs > 0 && (!best || fs > best.fs + 0.01)) best = { across, down, cw, chMax, ic, per, fs };
        }
      }
      if (!best) return null;
      const { across, down, cw, per, fs } = best;
      // The heading: about 0.6 of the names' size, at least 11 px where the card has room, never wider than the card.
      const hf = Math.min(Math.max(fs * 0.62, 11), (cw - 8) / headW), hh = Math.min(Math.max(hf * 1.7, fs * C.head), best.chMax * 0.4);
      const ch = Math.min(best.chMax, hh + (C.top + per * C.line + C.bottom) * fs);
      const y0 = (H - (down * ch + (down - 1) * gap)) / 2;
      const colW = longest * fs + 2, gx = C.colGap * fs;
      const out = groups.map((g, i) => {
        const r = Math.floor(i / across), inRow = r === down - 1 ? k - r * across : across, c = i % across;
        const x = (W - (inRow * cw + (inRow - 1) * gap)) / 2 + c * (cw + gap), y = y0 + r * (ch + gap);
        // (Each card's names sit in the middle of it: a smaller group may fill fewer columns than the largest.)
        const own = Math.max(1, Math.ceil(g.length / per)), x0 = (cw - (own * colW + (own - 1) * gx)) / 2;
        return { x, y, w: cw, h: ch, hh, hf, at: g.map((_, j) => ({ x: x0 + Math.floor(j / per) * (colW + gx), y: hh + C.top * fs + (j % per) * C.line * fs, w: colW, h: C.line * fs })) };
      });
      // The stack waits under the cards where there's room, else in the middle of the stage.
      const sw = clamp(longest * fs + 1.4 * fs, 3.6 * fs, W * 0.6), sh = 1.7 * fs, bottom = y0 + down * ch + (down - 1) * gap;
      const sy = H - bottom > sh * 1.8 ? (bottom + H) / 2 : H / 2;
      return { W, H, fs, cards: out, stack: { x: W / 2 - sw / 2, y: sy - sh / 2, w: sw, h: sh } };
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

    // ---- Drawing the stage as it is (no show).
    function clear() { box.replaceChildren(); cards = []; tiles = []; }
    function build() {
      clear();
      if (groups.length) {
        cards = groups.map((g, i) => {
          const el = host.el('div', P + 'card', box);
          const head = host.el('div', P + 'head', el, 'Group ' + (i + 1));
          head.style.background = `var(${COLORS[i % COLORS.length]})`;
          return { el, head, names: g.map(id => host.el('div', P + 'name', el, names[id])) };
        });
      } else tiles = names.map(n => host.el('div', P + 'tile', box, n));
    }
    function relayout() {
      letters();
      if (!groups.length) {
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
        const lay = cardLayout();
        L = lay;
        if (!lay) return;
        if (run && run.deck) place(run.deck, lay.stack);   // (a show running: the names still to come deal from here)
        cards.forEach((c, i) => {
          const r = lay.cards[i];
          place(c.el, r);
          c.el.style.borderRadius = px(clamp(lay.fs * 0.35, 6, 16));
          c.head.style.height = px(r.hh); c.head.style.fontSize = px(r.hf);
          c.names.forEach((n, j) => { place(n, r.at[j]); n.style.fontSize = px(lay.fs); });
        });
        // (The same check for the names on the cards: if one is wider than its place, every name gets smaller.)
        const over = Math.max(1, ...cards.flatMap(c => c.names.map(n => n.scrollWidth / Math.max(1, n.clientWidth))));
        if (over <= 1.001) return;
        widths.forEach((v, k) => widths.set(k, v * over * 1.02));
      }
    }
    const keyOf = v => v.names.join('\n') + '|' + JSON.stringify(v.groups);

    // ---- The show. Events at set times, played by animation frames; the flights are the browser's own animations.
    function schedule(T) {
      const order = [];   // deal order: Group 1, Group 2, … and round again
      const per = Math.max(0, ...cards.map(c => c.names.length));
      for (let s = 0; s < per; s++) cards.forEach((c, g) => { if (c.names[s]) order.push([g, s]); });
      const n = order.length, step = n > 1 ? (T.all - T.gather - T.fly) / (n - 1) : 0;
      const ev = order.map(([g, s], j) => ({ t: T.gather + j * step, fn: () => fly(g, s, j, n) }));
      ev.push({ t: T.gather - 1, fn: () => nextUp(0) });
      return { ev: ev.sort((a, b) => a.t - b.t), order };
    }
    function anim(el, frames, opts) {
      if (!el.animate) return null;
      try { const a = el.animate(frames, opts); run.anims.push(a); return a; } catch (e) { return null; }
    }
    // The names on the stage now gather into the stack.
    function gather(from, T) {
      const s = L.stack, cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      for (const f of from) {
        const g = host.el('div', P + 'ghost' + (f.tile ? ' ' + P + 'tile' : ''), box, f.text);
        g.setAttribute('aria-hidden', 'true');
        place(g, f.r); g.style.fontSize = px(f.fs); if (f.radius) g.style.borderRadius = px(f.radius);
        run.extra.push(g);
        const dx = cx - (f.r.x + f.r.w / 2), dy = cy - (f.r.y + f.r.h / 2);
        const a = anim(g, [{ transform: 'none', opacity: 1 }, { transform: `translate(${px(dx)}, ${px(dy)}) scale(.6)`, opacity: 0 }], { duration: T.gather, easing: 'ease-in', fill: 'forwards' });
        if (!a) g.remove();
      }
    }
    function tile(cls, r, text) {
      const e = host.el('div', P + cls, null, text);
      place(e, r); e.style.fontSize = px(L.fs); e.style.borderRadius = px(clamp(L.fs * 0.35, 4, 14));
      return e;
    }
    // The stack the names gather into, and deal out from: a few cards, the next name on top.
    function openStack() {
      const s = L.stack, deck = host.el('div', P + 'stack', box);
      deck.setAttribute('aria-hidden', 'true');
      place(deck, s);
      for (let d = 3; d >= 1; d--) { const i = host.el('i', null, deck); place(i, { x: d * 3, y: d * 3, w: s.w, h: s.h }); i.style.borderRadius = px(clamp(L.fs * 0.35, 4, 14)); }
      run.top = tile('top', { x: 0, y: 0, w: s.w, h: s.h }, '');
      deck.appendChild(run.top);
      run.deck = deck; run.extra.push(deck);
    }
    function nextUp(j) {
      if (!run || !run.top) return;
      const o = run.order[j];
      if (!o) { run.deck.remove(); run.deck = run.top = null; return; }
      run.top.textContent = names[groups[o[0]][o[1]]];
    }
    // One name flies from the stack to its place, and lands with a pop. The last one lands with the chime.
    function fly(g, s, j, n) {
      const T = run.T, c = cards[g], el = c.names[s], r = L.cards[g], at = r.at[s], st = L.stack;
      nextUp(j + 1);
      const f = tile('fly', st, el.textContent);
      f.setAttribute('aria-hidden', 'true');
      box.appendChild(f); run.extra.push(f);
      const dx = r.x + at.x + at.w / 2 - (st.x + st.w / 2), dy = r.y + at.y + at.h / 2 - (st.y + st.h / 2);
      const land = () => {
        f.remove();
        if (!run || dead) return;
        el.classList.remove(P + 'wait'); el.classList.add(P + 'land');
        run.landed++;
        // (No more than about 30 pops a second, for a big class with Quick.)
        const now = performance.now();
        if (now - run.popAt >= 34 || run.landed === n) { run.popAt = now; host.sound('pop', { pitch: 0.9 + 0.25 * (g / Math.max(1, cards.length - 1)) }); }
        if (run.landed === n) { host.sound('chime'); end(false); }
      };
      const a = anim(f, [{ transform: 'none', opacity: 1 }, { transform: `translate(${px(dx)}, ${px(dy)}) scale(.92)`, opacity: 1, offset: 0.85 }, { transform: `translate(${px(dx)}, ${px(dy)}) scale(.92)`, opacity: 0 }],
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
    // The show ends: by itself (the last name has landed), or at once (skip): everything in its place, nothing running.
    function end(skipping) {
      const r = run;
      if (!r) return;
      run = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const a of r.anims) { a.onfinish = null; try { a.cancel(); } catch (e) { /* gone */ } }
      for (const e of r.extra) e.remove();
      for (const c of cards) for (const n of c.names) { n.classList.remove(P + 'wait'); if (skipping) n.classList.remove(P + 'land'); }
      if (!skipping) host.done();
    }

    // ---- What the host calls
    function show(view, how) {
      if (dead) return;
      if (run) end(true);
      const k = keyOf(view), fade = !!(how && how.fade);
      names = view.names.slice();
      groups = view.groups.map(g => g.slice());
      if (k !== key || fade || (groups.length ? !cards.length : !tiles.length)) { key = k; build(); }
      relayout();
      if (fade) for (const c of cards) { c.el.classList.remove(P + 'fade'); void c.el.offsetWidth; c.el.classList.add(P + 'fade'); }
    }
    function play(view) {
      if (dead) return;
      if (run) end(true);
      // Where every name on the stage is now: they gather into the stack from there.
      const from = [];
      const rel = e => { const b = box.getBoundingClientRect(), r = e.getBoundingClientRect(); return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height }; };
      for (const t of tiles) from.push({ text: t.textContent, r: rel(t), fs: parseFloat(t.style.fontSize) || 12, radius: parseFloat(t.style.borderRadius) || 0, tile: true });
      for (const c of cards) for (const n of c.names) from.push({ text: n.textContent, r: rel(n), fs: parseFloat(n.style.fontSize) || 12 });
      names = view.names.slice();
      groups = view.groups.map(g => g.slice());
      key = keyOf(view);
      build();
      relayout();
      if (!groups.length || !L || !L.stack || !box.animate) { host.done(); return; }
      for (const c of cards) for (const n of c.names) n.classList.add(P + 'wait');
      const T = view.quick ? QUICK : NORMAL, plan = schedule(T);
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
        relayout();
      },
      destroy() { dead = true; end(true); box.remove(); }
    };
  }
});
