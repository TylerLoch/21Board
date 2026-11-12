/*
 * Name Picker style: Spotlight (the Hopping light).
 * The whole class is on the stage as a grid of name tiles, in list order, so every student can find their own name.
 * On Pick the class dims and a yellow light hops from tile to tile, quick at first and slowing like a game-show board,
 * and lands on the winner, whose tile grows into a big name card. Several winners: the one light collects them in
 * turn and numbers them 1, 2, 3; later stops are shorter, so five take about 6 seconds (one takes about 4).
 * No repeats: tiles never move, so a name stays in the same place all lesson. Students picked earlier in the round
 * get a tick and a line through, and the light never lands on them (they aren't in the draw).
 * The host draws the winners; this file only puts on the show that lands on them. How a style plugs in: the comment
 * at the top of index.html.
 */
NamePicker.register('spotlight', {
  css: `
.spotlight-box { position: absolute; inset: 0; overflow: hidden; isolation: isolate; line-height: 1.15; }
.spotlight-box *, .spotlight-box *::before, .spotlight-box *::after { box-sizing: border-box; }

/* The class: one tile per name. (Sizes come from the script: tile height sets --spotlight-bd and --spotlight-tk.) */
.spotlight-grid { position: absolute; inset: 0; z-index: 1; }
.spotlight-tile {
  position: absolute; display: flex; align-items: center; justify-content: center;
  background: var(--b21-bg); border: 1px solid var(--b21-border); color: var(--b21-text);
  font-weight: 700; line-height: 1; white-space: nowrap;
  transform: scale(calc(1 + var(--spotlight-h, 0) * var(--spotlight-lift, 0.07)));
  transition: opacity .3s, background-color .3s, border-color .3s, color .15s, transform .38s cubic-bezier(.3, 1.4, .5, 1);
}
[data-b21-theme="dark"] .spotlight-tile { background: var(--b21-surface-2); }
/* The light itself: a gold wash whose strength is the tile's heat (squared, so the trail fades softly). */
.spotlight-glow {
  position: absolute; inset: -1px; border-radius: inherit; pointer-events: none;
  background: var(--np-win); opacity: calc(var(--spotlight-h, 0) * var(--spotlight-h, 0));
  box-shadow: 0 0 calc(var(--spotlight-bd, 20px) * .6) calc(var(--spotlight-bd, 20px) * .08) var(--np-win);
}
.spotlight-nm { position: relative; max-width: 100%; overflow: hidden; text-overflow: ellipsis; padding: .12em 0; }
.spotlight-hot, .spotlight-locked { z-index: 2; color: var(--np-ink); border-color: var(--np-win); }
.spotlight-locked { z-index: 3; }
.spotlight-tile.spotlight-pulse { animation: spotlight-lock .5s ease-out; }
/* While the light hops, the class is dimmed, like a stage with the house lights down: one layer over the grid (cheaper
   on a Chromebook than dimming every tile), with the light and its fading trail above it. The light is drawn frame by
   frame, so the tiles have no transitions then (they would start again on every frame). */
.spotlight-dimmer { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: var(--b21-surface); opacity: 0; transition: opacity .3s ease-out; }
.spotlight-live .spotlight-dimmer { opacity: .5; }
.spotlight-live .spotlight-tile { transition: none; }
.spotlight-warm { z-index: 2; opacity: calc(.5 + .5 * var(--spotlight-h, 0)); }

/* Several winners: a numbered badge on the tile's top-left corner, in pick order. */
.spotlight-badge {
  position: absolute; z-index: 2; display: none; align-items: center; justify-content: center;
  top: calc(var(--spotlight-bd, 20px) * -.32); left: calc(var(--spotlight-bd, 20px) * -.32);
  width: var(--spotlight-bd, 20px); height: var(--spotlight-bd, 20px); border-radius: 50%;
  background: var(--np-ink); color: var(--np-win); box-shadow: 0 0 0 2px var(--np-win);
  font-size: calc(var(--spotlight-bd, 20px) * .58); font-weight: 800; line-height: 1;
}
.spotlight-badge:not(:empty) { display: flex; }

/* No repeats: picked earlier in the round = dashed, faded, crossed out, with a tick (and dimmed with the class during a show). */
.spotlight-done { background: transparent !important; border-style: dashed; border-color: var(--b21-muted); color: var(--b21-muted); }
.spotlight-done .spotlight-nm { opacity: .8; text-decoration: line-through; text-decoration-thickness: .09em; }
.spotlight-tick {
  position: absolute; display: none; align-items: center; justify-content: center;
  top: calc(var(--spotlight-tk, 14px) * -.3); right: calc(var(--spotlight-tk, 14px) * -.3);
  width: var(--spotlight-tk, 14px); height: var(--spotlight-tk, 14px); border-radius: 50%;
  background: var(--b21-muted); color: var(--b21-bg);
}
.spotlight-tick svg { width: 78%; height: 78%; display: block; }
.spotlight-done .spotlight-tick { display: flex; }

/* The result: the winners' tiles grow into big name cards over the dimmed class. */
.spotlight-scrim { position: absolute; inset: 0; z-index: 2; pointer-events: none; background: var(--b21-surface); opacity: 0; transition: opacity .35s ease-out; }
.spotlight-shown .spotlight-scrim { opacity: .8; }
/* Under the cards the winners' tiles keep a faint glow: the card is where the light went. */
.spotlight-shown .spotlight-locked .spotlight-glow { opacity: .35; box-shadow: none; }
.spotlight-cards { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.spotlight-card {
  position: absolute; transform-origin: 0 0; display: flex; align-items: center; justify-content: center; gap: .3em; padding: 0 .3em; overflow: hidden;
  background: var(--np-win); color: var(--np-ink); font-weight: 800; line-height: 1; white-space: nowrap;
}
.spotlight-card.spotlight-up { box-shadow: 0 .06em .3em rgba(0, 0, 0, .28), 0 0 0 max(2px, .04em) var(--np-win); }
.spotlight-card.spotlight-back { box-shadow: none; }
.spotlight-cname { min-width: 0; overflow: hidden; padding: .06em 0; }
.spotlight-cnum {
  flex: none; display: flex; align-items: center; justify-content: center;
  width: 1.6em; height: 1.6em; border-radius: 50%; font-size: .5em; background: var(--np-ink); color: var(--np-win);
}
.spotlight-fade { animation: spotlight-fade .3s ease-out both; }

@keyframes spotlight-lock {
  0% { transform: scale(calc(1 + var(--spotlight-lift, .07))); }
  35% { transform: scale(calc(1 + 2.6 * var(--spotlight-lift, .07))); }
  100% { transform: scale(calc(1 + var(--spotlight-lift, .07))); }
}
@keyframes spotlight-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .spotlight-tile { transform: none !important; transition: opacity .25s, background-color .25s, border-color .25s; }
  .spotlight-tile.spotlight-pulse { animation: none; }
}
`,
  mount(root, host) {
    const P = 'spotlight-';
    const MIN_FS = 10;   // px: a tile name smaller than this is shortened instead ("Anne-S.", "Maximil…")
    const TRAIL = 140;   // ms: how quickly the light's trail fades
    // How long each part of the show takes (ms), by the number of winners (1 to 5). The light's first run, each
    // further run (shorter: later winners are collected more quickly), and its rest on each winner. Then the cards grow.
    const NORMAL = { first: [3000, 2400, 2000, 1800, 1700], next: [0, 800, 700, 560, 480], rest: [420, 280, 260, 240, 220],
      gap1: 120, gapN: 105, hops: 4, start: 60, grow: 560, stagger: 90, back: 260 };   // about 4 s for one, 5 s for three, 6 s for five
    const QUICK = { first: [800, 600, 500, 420, 360], next: [0, 170, 130, 110, 100], rest: [120, 70, 60, 50, 40],
      gap1: 90, gapN: 70, hops: 2, start: 40, grow: 320, stagger: 30, back: 160 };      // about 1½ s for any number
    const SVG = 'http://www.w3.org/2000/svg';
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const px = v => (Math.round(v * 10) / 10) + 'px';

    const box = host.el('div', P + 'box', root);
    const grid = host.el('div', P + 'grid', box);
    grid.setAttribute('role', 'list');
    grid.setAttribute('aria-label', 'The class');
    const dimmer = host.el('div', P + 'dimmer', grid);
    host.el('div', P + 'scrim', box);
    const layer = host.el('div', P + 'cards', box);
    layer.setAttribute('aria-hidden', 'true');   // (the host tells screen readers who was picked)

    let names = [];      // the names the tiles were made for
    let tiles = [];      // one for each name: { i, el, nm, badge, h (heat: 1 = the light is on it), lock, done, fs, rect }
    let cards = [];      // the big name cards: { id, el, nm, mode: 'grow' | 'still' | 'back', t0, dur, anim, from, to, toFs }
    let round = null;    // the show running
    let lit = -1;        // the tile the light is on
    let raf = 0, lastT = 0, dead = false;
    let L = null;        // the layout: the stage's size and the grid
    let result = '';     // the pick on the stage (pickId and winners), so a repeated show() leaves the cards alone

    // ---- Measuring names, in the board's letters (Settings → Letters), on a canvas that is never shown.
    const measure = document.createElement('canvas').getContext('2d');
    const widths = new Map();
    let fam = '';
    function em(text, weight) {   // width of text at 1px, in this weight
      const key = weight + '|' + text;
      let v = widths.get(key);
      if (v === undefined) { measure.font = weight + ' 100px ' + fam; v = measure.measureText(text).width / 100; widths.set(key, v); }
      return v;
    }
    // A name that fits `room` px at `fs` px: whole if it can be, else "Anne-S.", else "Maximil…".
    function shorten(name, fs, room) {
      const fits = s => em(s, 700) * fs <= room;
      if (fits(name)) return name;
      const parts = name.split(/([\s\-‐–]+)/);
      if (parts.length >= 3) { const s = parts[0] + parts[1] + Array.from(parts[2])[0] + '.'; if (fits(s)) return s; }
      const ch = Array.from(name);
      for (let n = ch.length - 1; n >= 2; n--) {
        const s = ch.slice(0, n).join('').replace(/[\s\-‐–.]+$/, '') + '…';
        if (fits(s)) return s;
      }
      return ch[0] + '.';
    }

    // ---- The tiles
    function tick() {
      const s = document.createElementNS(SVG, 'svg'), p = document.createElementNS(SVG, 'path');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
      p.setAttribute('d', 'M5.5 12.5l4.2 4.2L18.5 7.8');
      for (const [k, v] of [['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '3.4'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) p.setAttribute(k, v);
      s.appendChild(p);
      return s;
    }
    function build(list) {
      dropCards();
      grid.replaceChildren(dimmer);
      names = list.slice();
      tiles = names.map((name, i) => {
        const el = host.el('div', P + 'tile', grid);
        el.setAttribute('role', 'listitem');
        el.setAttribute('aria-label', name);
        host.el('span', P + 'glow', el);
        const nm = host.el('span', P + 'nm', el, name);
        const badge = host.el('span', P + 'badge', el);
        host.el('span', P + 'tick', el).appendChild(tick());
        for (const e of el.children) e.setAttribute('aria-hidden', 'true');
        return { i, el, nm, badge, h: 0, hr: 0, lock: false, done: false, fs: 12, rect: { x: 0, y: 0, w: 10, h: 10 } };
      });
      L = null;
      result = '';
    }
    const sameNames = list => list.length === names.length && list.every((n, i) => n === names[i]);
    function setDone(t, on) {
      if (t.done === on) return;
      t.done = on;
      t.el.classList.toggle(P + 'done', on);
      t.el.setAttribute('aria-label', names[t.i] + (on ? ', picked' : ''));
    }
    function setLock(t, on, order, k) {
      t.lock = on;
      t.el.classList.toggle(P + 'locked', on);
      t.el.classList.remove(P + 'pulse');
      const b = on && k > 1 ? String(order) : '';
      if (t.badge.textContent !== b) t.badge.textContent = b;
    }
    // The light's heat on a tile, as a CSS variable (only written when it changes).
    function paintHeat(t) {
      const h = t.h;
      if (h === t.hr || (h > 0 && Math.abs(h - t.hr) < 0.01)) return;
      t.hr = h;
      if (h > 0) t.el.style.setProperty('--spotlight-h', h.toFixed(3)); else t.el.style.removeProperty('--spotlight-h');
      t.el.classList.toggle(P + 'hot', h > 0.7 && !t.lock);   // ("hot": the light passing; a winner it stopped on is "locked")
      t.el.classList.toggle(P + 'warm', h > 0 && !t.lock);    // (lit, or in the trail: above the dimmed class)
    }

    // ---- Layout. The grid tries every number of columns and keeps the one whose names come out biggest. Most names
    // share one size (the 5th-longest in 24 sets it); the few longest shrink a little more on their own.
    function gridLayout(S) {
      const N = names.length, ws = names.map(n => em(n, 700));
      const g = clamp(Math.min(S.w, S.h) * 0.016, 3, 14);
      let best = null;
      for (let c = 1; c <= N; c++) {
        const r = Math.ceil(N / c);
        if (c > 1 && Math.ceil(N / (c - 1)) === r) continue;   // (the same rows with fewer columns is better)
        let tw = (S.w - (c - 1) * g) / c, th = (S.h - (r - 1) * g) / r;
        if ((tw < 8 || th < 6) && best) continue;
        tw = Math.max(4, tw); th = Math.max(4, th);
        th = Math.min(th, tw * 0.62);
        tw = Math.min(tw, th * 6);
        const padX = Math.min(th * 0.28, tw * 0.08) + 2;
        const room = (tw - 2 * padX) * 0.94 - 1;   // (a little slack, so a name never just tips into an ellipsis)
        const cap = Math.min(th * 0.5, S.h * 0.2);
        const fits = ws.map(w => Math.min(cap, room / w)).sort((a, b) => a - b);
        const most = fits[Math.min(fits.length - 1, Math.floor((fits.length - 1) * 0.2))];
        const score = most + 0.5 * fits[0];
        if (!best || score > best.score) best = { c, r, tw, th, g, padX, room, most, score, ws };
      }
      return best;
    }
    function relayout() {
      const W = box.clientWidth, H = box.clientHeight;
      if (!W || !H || !names.length) return false;
      const f = host.token('font') || 'system-ui, sans-serif';
      if (f !== fam) { fam = f; widths.clear(); }
      // A lit tile grows a little (by `lift`), and a winner's number sits on its tile's corner: the edge of the stage
      // keeps room for both, so a tile in a corner isn't cut off.
      const lift = G => Math.min(0.07, 12 / G.tw), badge = G => clamp(G.th * 0.5, 14, 46);
      const edge = clamp(Math.min(W, H) * 0.03, 5, 20);
      let pad = edge, S, G;
      for (let pass = 0; pass < 2; pass++) {
        S = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
        G = gridLayout(S);
        const need = lift(G) * Math.max(G.tw, G.th) / 2 + 0.32 * badge(G) + 2;
        if (need <= pad + 0.5) break;
        pad = need;
      }
      const N = names.length;
      L = { W, H, S, G, C: { x: edge, y: edge, w: W - 2 * edge, h: H - 2 * edge } };   // (C: where the cards go)
      const gridH = G.r * G.th + (G.r - 1) * G.g, y0 = S.y + (S.h - gridH) / 2;
      box.style.setProperty('--spotlight-bd', px(badge(G)));
      box.style.setProperty('--spotlight-tk', px(clamp(G.th * 0.36, 11, 34)));
      box.style.setProperty('--spotlight-lift', lift(G).toFixed(4));
      const radius = px(clamp(G.th * 0.2, 4, 22)), padding = '0 ' + px(G.padX - 1);
      for (let i = 0; i < N; i++) {
        const row = Math.floor(i / G.c), col = i % G.c;
        const inRow = row === G.r - 1 ? N - row * G.c : G.c;
        const rowW = inRow * G.tw + (inRow - 1) * G.g;
        const t = tiles[i];
        t.rect = { x: S.x + (S.w - rowW) / 2 + col * (G.tw + G.g), y: y0 + row * (G.th + G.g), w: G.tw, h: G.th };
        const st = t.el.style;
        st.left = px(t.rect.x); st.top = px(t.rect.y); st.width = px(G.tw); st.height = px(G.th);
        st.borderRadius = radius; st.padding = padding;
        let fs = Math.min(G.most, G.room / G.ws[i]), text = names[i];
        if (fs < MIN_FS) {   // too small to read whole: a size that can be read, and a shortened name
          fs = Math.max(7, Math.min(MIN_FS, G.th * 0.62));
          text = shorten(names[i], fs, G.room);
        }
        t.fs = fs;
        st.fontSize = px(fs);
        if (t.nm.textContent !== text) t.nm.textContent = text;
      }
      placeCards();
      return true;
    }

    // ---- The big name cards. Their layout tries 1 to k rows and keeps the one with the biggest names; the card
    // always shows the whole name.
    function cardLayout(ids) {
      const S = L.C, k = ids.length;
      const aw = S.w * 0.92, ah = S.h * 0.9, ax = S.x + (S.w - aw) / 2, ay = S.y + (S.h - ah) / 2;
      const cg = clamp(Math.min(aw, ah) * 0.045, 5, 22);
      const extra = k > 1 ? 1.1 : 0;   // the number, in em
      const wmax = Math.max(...ids.map(id => em(names[id], 800)));
      let best = null;
      for (let rows = 1; rows <= k; rows++) {
        const cols = Math.ceil(k / rows);
        const cw = (aw - (cols - 1) * cg) / cols;
        const ch = Math.min((ah - (rows - 1) * cg) / rows, cw * 0.62);
        const fs = Math.min(ch * 0.52, S.h * 0.3, cw / (wmax + extra + 1.1));   // (1.1 em: the card's padding)
        if (!best || fs > best.fs) best = { rows, cols, cw, ch, fs };
      }
      const fs = best.fs;
      const w = Math.min(best.cw, Math.max(fs * (wmax + extra + 1.1), fs * 3.4)), h = Math.min(best.ch, fs * 1.75);
      const y0 = ay + (ah - (best.rows * h + (best.rows - 1) * cg)) / 2;
      return { fs, rects: ids.map((id, j) => {
        const row = Math.floor(j / best.cols), col = j % best.cols;
        const inRow = row === best.rows - 1 ? k - row * best.cols : best.cols;
        return { x: ax + (aw - (inRow * w + (inRow - 1) * cg)) / 2 + col * (w + cg), y: y0 + row * (h + cg), w, h };
      }) };
    }
    // Each card is laid out once, at its full size; growing out of its tile and shrinking back into it are done by
    // moving and scaling it (on the graphics chip, so the slowest Chromebook stays smooth, and the name lands sharp).
    function placeCards() {
      const live = cards.filter(c => c.mode !== 'back');
      if (!L || !live.length) return;
      const lay = cardLayout(live.map(c => c.id));
      live.forEach((c, j) => {
        const r = c.to = lay.rects[j], st = c.el.style;
        c.toFs = lay.fs; c.from = tiles[c.id].rect;
        st.left = px(r.x); st.top = px(r.y); st.width = px(Math.max(4, r.w)); st.height = px(Math.max(4, r.h));
        st.fontSize = px(Math.max(4, c.toFs)); st.borderRadius = px(Math.min(r.h * 0.24, 30));
      });
      // A last check in the page itself, in case a font measured differently: the whole name shows.
      for (const c of live) {
        const sw = c.nm.scrollWidth, cw = c.nm.clientWidth;
        if (sw > cw + 0.5 && cw > 0) { c.toFs = c.toFs * cw / sw * 0.97; c.el.style.fontSize = px(c.toFs); }
      }
    }
    // The card at the size of tile rect r (as big as fits in it, in its middle) and back, or the other way round.
    function zoom(c, r, back, delay, dur) {
      if (!c.el.animate || !c.to || !r) return null;   // (no animations here: the card is simply there, or gone)
      const s = Math.min(r.w / c.to.w, r.h / c.to.h), small = { transform: `translate(${px(r.x + r.w / 2 - s * c.to.w / 2 - c.to.x)}, ${px(r.y + r.h / 2 - s * c.to.h / 2 - c.to.y)}) scale(${s.toFixed(4)})` };
      try {
        return back ? c.el.animate([{ transform: 'none', opacity: 1 }, Object.assign({ opacity: 0.15 }, small)], { duration: dur, easing: 'ease-in-out', fill: 'forwards' })
          : c.el.animate([small, { transform: 'none' }], { duration: dur, delay, easing: 'cubic-bezier(.3, 1.4, .5, 1)', fill: 'backwards' });
      } catch (e) { return null; }
    }
    function makeCard(id, j, k) {
      const el = host.el('div', P + 'card ' + P + 'up', layer);
      if (k > 1) host.el('span', P + 'cnum', el, String(j + 1));
      return { id, el, nm: host.el('span', P + 'cname', el, names[id]), mode: 'still', t0: 0, dur: 0, anim: null, from: null, to: null, toFs: 0 };
    }
    function settle(c) {   // a card's animation, ended: at its place (or gone, if it was going back)
      if (c.anim) { try { c.anim.cancel(); } catch (e) { /* already gone */ } c.anim = null; }
      if (c.mode === 'back') { c.el.remove(); c.gone = true; } else c.mode = 'still';
    }
    function dropCards() {
      for (const c of cards) { c.mode = 'back'; settle(c); }
      cards = [];
      box.classList.remove(P + 'shown');
    }

    // ---- The show. Every step is planned when it starts: events at set times, played by the animation frames.
    // The winners come from the host; Math.random only chooses which tiles the light visits on the way.
    function plan(r, src, start) {
      const { ev, k, T } = r, kk = k - 1, locked = [];
      let t = start, cur = -1, prev = -1;
      r.ids.forEach((win, j) => {
        const elig = src.filter(i => !locked.includes(i));
        const leg = j === 0 ? T.first[kk] : T.next[kk];
        if (elig.length > 1) {
          const M = Math.max(T.hops, Math.round(leg / (j === 0 ? T.gap1 : T.gapN)));
          for (let h = 1; h <= M; h++) {
            let id = win;
            if (h < M) {   // anywhere but where it just was, and not on the winner just before landing there
              let opts = elig.filter(i => i !== cur && (elig.length < 3 || i !== prev) && (h !== M - 1 || i !== win));
              if (!opts.length) opts = elig.filter(i => i !== win);
              if (!opts.length) opts = elig;
              id = opts[Math.floor(Math.random() * opts.length)];
            }
            const at = t + leg * (1 - Math.sqrt(1 - h / M));   // the hops get further apart: it slows down
            ev.push({ t: at, fn: s => hopTo(id, s) });
            prev = cur; cur = id;
          }
          t += leg;
        } else {   // only the winner left to land on
          t += Math.min(260, leg || 260);
          ev.push({ t, fn: s => hopTo(win, s) });
        }
        ev.push({ t: t + 30, fn: s => lockOn(win, j + 1, k, s) });
        locked.push(win);
        cur = win; prev = -1;
        t += T.rest[kk];
      });
      ev.push({ t: t + 80, fn: grow });
      ev.sort((a, b) => a.t - b.t);
    }
    function hopTo(id, skipping) {
      if (skipping) return;
      if (lit >= 0 && tiles[lit] && !tiles[lit].lock) tiles[lit].h = 0.65;   // (the trail: a soft tint that fades)
      lit = id;
      tiles[id].h = 1;
      host.sound('tick', { volume: 0.7 });
    }
    // The light stops on a winner: it stays lit (numbered when there are several). The last one gets the chime.
    function lockOn(id, order, k, skipping) {
      const t = tiles[id];
      setLock(t, true, order, k);
      t.h = 1;
      if (lit === id) lit = -1;
      if (skipping) return;
      void t.el.offsetWidth;   // (restarts the pulse)
      t.el.classList.add(P + 'pulse');
      if (order === k) host.sound('chime'); else host.sound('pop', { pitch: 1 + 0.12 * (order - 1) });
    }
    // The winners' tiles grow into the big cards.
    function grow(skipping) {
      const r = round;
      if (!r || r.growing) return;
      r.growing = true;
      box.classList.remove(P + 'live');
      lit = -1;
      for (const t of tiles) if (!t.lock) t.h = 0;
      dropCards();
      cards = r.ids.map((id, j) => makeCard(id, j, r.k));
      placeCards();
      box.classList.add(P + 'shown');
      if (skipping) return;
      const now = performance.now();
      cards.forEach((c, j) => { c.mode = 'grow'; c.t0 = now; c.dur = j * r.T.stagger + r.T.grow; c.anim = zoom(c, c.from, false, j * r.T.stagger, r.T.grow); });
    }
    function runEvents(skipping) {
      const r = round;
      while (r && round === r && r.ei < r.ev.length && (skipping || r.ev[r.ei].t <= r.t)) r.ev[r.ei++].fn(skipping);
    }
    function endRound(skipping) {
      round = null;
      box.classList.remove(P + 'live');
      if (!skipping) host.done();
    }
    // The rest of the show at once, silently: every winner lit and numbered, the cards in their places, nothing running.
    function finish() {
      if (!round) return;
      runEvents(true);
      cards.forEach(settle);
      cards = cards.filter(c => !c.gone);
      placeCards();
      lit = -1;
      for (const t of tiles) { t.h = t.lock ? 1 : 0; paintHeat(t); }
      endRound(true);
      stop();
    }

    // ---- The animation frames: they run only while something moves, and stop by themselves.
    function kick() { if (!raf && !dead) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function frame(now) {
      raf = 0;
      if (dead) return;
      const dt = clamp(now - lastT, 0, 64);
      lastT = now;
      let busy = false;
      if (round) { round.t = now - round.t0; runEvents(false); busy = true; }
      for (const t of tiles) {
        if (t.lock || t.i === lit) t.h = 1;
        else if (t.h > 0) { t.h *= Math.exp(-dt / TRAIL); if (t.h < 0.03) t.h = 0; else busy = true; }
        paintHeat(t);
      }
      for (const c of cards) if (c.mode !== 'still') { busy = true; if (now >= c.t0 + c.dur) settle(c); }
      cards = cards.filter(c => !c.gone);
      if (round && round.growing && cards.every(c => c.mode === 'still')) endRound(false);
      if (busy && !dead) raf = requestAnimationFrame(frame);
    }

    // ---- What the host calls
    // The tiles for these names, laid out for the stage as it is now.
    function ready(view) {
      if (!sameNames(view.names)) build(view.names);
      if (!L || L.W !== box.clientWidth || L.H !== box.clientHeight) relayout();
    }
    function show(view, how) {
      if (dead) return;
      const fade = !!(how && how.fade);
      if (round) finish();   // (the host ends a show first; this is only in case)
      ready(view);
      const k = view.winners.length, key = (view.pickId || '') + '|' + view.winners.join(',');
      box.classList.remove(P + 'live');
      tiles.forEach(t => {
        const w = view.winners.indexOf(t.i);
        setDone(t, !!view.picked[t.i] && w < 0);
        setLock(t, w >= 0, w + 1, k);
      });
      lit = -1;
      for (const t of tiles) { t.h = t.lock ? 1 : 0; paintHeat(t); }
      // The same pick as on the stage already: its cards stay as they are.
      if (fade || key !== result || cards.length !== k || cards.some(c => c.mode !== 'still')) {
        dropCards();
        cards = view.winners.map((id, j) => makeCard(id, j, k));
        if (fade) for (const c of cards) c.el.classList.add(P + 'fade');
      }
      placeCards();
      result = key;
      box.classList.toggle(P + 'shown', k > 0);
      stop();
    }
    function play(view) {
      if (dead) return;
      if (round) finish();
      ready(view);
      const k = view.winners.length;
      if (!k) { show(view); host.done(); return; }
      const T = view.quick ? QUICK : NORMAL, now = performance.now();
      // The last pick's cards shrink back into their tiles, and with No repeats everyone picked before is crossed out.
      const had = cards.length > 0;
      for (const c of cards) {
        c.el.classList.remove(P + 'fade', P + 'up');
        c.el.classList.add(P + 'back');
        c.anim = zoom(c, tiles[c.id] && tiles[c.id].rect, true, 0, T.back);
        c.mode = 'back'; c.t0 = now; c.dur = T.back;
        if (!c.anim) settle(c);
      }
      cards = cards.filter(c => !c.gone);
      box.classList.remove(P + 'shown');
      tiles.forEach(t => { setLock(t, false, 0, 0); t.h = 0; setDone(t, !!view.picked[t.i] && !view.winners.includes(t.i)); });
      lit = -1;
      result = (view.pickId || '') + '|' + view.winners.join(',');
      // The names in the draw: the ones not picked earlier in this round (the winners among them).
      const src = tiles.filter(t => !t.done).map(t => t.i);
      round = { t0: now, t: 0, ids: view.winners.slice(), k, ev: [], ei: 0, growing: false, T };
      plan(round, src, had ? T.back * 0.6 : T.start);
      box.classList.add(P + 'live');
      kick();
    }
    return {
      show,
      play,
      skip: finish,
      resize() {
        if (dead) return;
        fam = ''; widths.clear();   // (the letters may have changed, or a font finished loading: measure again)
        relayout();
      },
      destroy() { dead = true; stop(); round = null; dropCards(); box.remove(); }
    };
  }
});
