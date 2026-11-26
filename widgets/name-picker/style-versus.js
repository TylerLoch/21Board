/*
 * Name Picker style: Versus.
 * Two students face off. The stage splits on a diagonal, red-orange on the left and blue-cyan on the right, with a thin
 * slash between them. On a pick the names clear and the stage builds up: the lights go down, a drum rolls faster and
 * faster, each side lights up in turn with it, and the emblem trembles, still grey. Then the VS emblem slams down, and
 * both names land with its thud. Then the challenge sound: about 2½ seconds in all (with Quick about 1).
 * Before the first pick, and after Start over, a "?" waits on each grey side, with an emblem in its waiting state.
 * The emblem comes in five looks, one file each (vs-<look>.js, registered in NamePicker.looks). Each pick plays the look
 * the host dealt it (view.versusLook); the waiting stage takes one at random each time it appears.
 * The host draws and saves the pair and its look; this file only lays them out and puts on the show. How a style plugs
 * in, and what a look is: the comment at the top of index.html.
 */
NamePicker.register('versus', {
  css: `
.versus { position: absolute; inset: 0; overflow: hidden; }
.versus-side { position: absolute; inset: 0; }
.versus-l { background: linear-gradient(135deg, #fb923c, #dc2626 55%, #991b1b); clip-path: polygon(0 0, 57% 0, 43% 100%, 0 100%); }
.versus-r { background: linear-gradient(315deg, #22d3ee, #2563eb 55%, #1e3a8a); clip-path: polygon(57% 0, 100% 0, 100% 100%, 43% 100%); }
.versus-cut { position: absolute; inset: 0; background: #fff; clip-path: polygon(56.4% 0, 57.6% 0, 43.6% 100%, 42.4% 100%); }
[data-b21-theme="dark"] .versus-cut { background: #111827; }
.versus-waiting .versus-l, .versus-waiting .versus-r { filter: saturate(.25) brightness(1.08); opacity: .75; }
.versus-name { position: absolute; transform: translate(-50%, -50%) skewX(-9deg); color: #fff; font-weight: 900; font-style: italic; white-space: nowrap;
  line-height: 1; -webkit-text-stroke: .07em #111827; paint-order: stroke fill; text-shadow: .04em .07em 0 rgba(0, 0, 0, .45); }
/* Above and below the emblem, the names are in front of it: the looks' slams come down through them. */
.versus-tall .versus-name { z-index: 1; }
.versus-probe { left: 0; top: 0; transform: none; font-size: 100px; visibility: hidden; }
.versus-box, .versus-ghost { position: absolute; transform: translate(-50%, -50%); }
.versus-box > svg, .versus-shake > svg { display: block; width: 100%; height: 100%; overflow: visible; }
/* The build-up: the lights go down, and each side lights up in turn with the drum. Only their opacity changes. The grey
   emblem trembles in .versus-shake, and fades out as .versus-ghost when the slam comes. */
.versus-dim { position: absolute; inset: 0; background: #111827; opacity: 0; pointer-events: none; }
.versus .versus-glow { opacity: 0; pointer-events: none; }
.versus .versus-glow.versus-l { background: #ffe2b8; }
.versus .versus-glow.versus-r { background: #d2f4ff; }
.versus-shake { position: absolute; inset: 0; transform-origin: 50% 60%; }
.versus-fade { animation: versus-fade .3s ease-out; }
@keyframes versus-fade { from { opacity: 0; } to { opacity: 1; } }
`,
  mount(root, host) {
    const LOOKS = NamePicker.looks, has = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(LOOKS, id);
    // The show (ms from its start). The stage builds up for `build`, with no names on it. A drum rolls: its first beats
    // `first` apart, closer each time, `last` apart by the end, and it keeps rolling until the slam lands. Each beat lights
    // up one side, left and right in turn. Then the emblem slams down, and both names land on its impact, with its thud.
    // The challenge sound comes once its slam is over (or after `most` at the latest). `fade`: the grey emblem going as
    // the slam comes. `stamp`: the names landing.
    const NORMAL = { build: 1600, first: 170, last: 42, most: 1300, fade: 140, stamp: 220 };
    const QUICK = { build: 650, first: 110, last: 40, most: 750, fade: 90, stamp: 150 };
    const NAME = 'translate(-50%, -50%) skewX(-9deg)';   // (as .versus-name)
    const BAR = 40;   // the window's title bar, in px, above this page (docs/WIDGET-SDK.md)
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const px = v => (Math.round(v * 10) / 10) + 'px';
    const any = list => list[Math.floor(Math.random() * list.length)];
    const dark = () => document.documentElement.getAttribute('data-b21-theme') === 'dark';

    let stage = null;     // .versus: the sides, the slash, the two names, and the emblem's box (the looks' `stage`)
    let names = [], box = null;
    let now = null;       // what the stage shows: { pair: [left, right] (null: waiting), look, pickId }
    let run = null;       // the show running: { T, quick, pair, look, g, t0, ev, ei, up, layers, anims, stamp, raf, last, slammed, landed, … }
    let dead = false;

    // A fresh stage. Whatever a show added to the old one goes with it.
    function build(look, waiting) {
      if (stage) stage.remove();
      stage = host.el('div', 'versus' + (waiting ? ' versus-waiting' : ''), root);
      stage.dataset.look = look || '';
      host.el('div', 'versus-side versus-l', stage);
      host.el('div', 'versus-side versus-r', stage);
      host.el('div', 'versus-cut vs-cut', stage);   // (.vs-cut: the looks find the slash by it)
      names = [host.el('div', 'versus-name', stage), host.el('div', 'versus-name', stage)];
      box = host.el('div', 'versus-box', stage);
      box.setAttribute('aria-hidden', 'true');
    }

    // ---- Layout. The emblem's box sits in the middle, its look's own size. Both names are one size, as large as fits
    // each side while clear of the box, up to 22% of the stage's height. The left one sits a little above the middle and
    // the right one a little below. Beside the names the box takes at most 38% of the stage's width, so a narrow window
    // leaves them room.
    // The names may go above and below the box instead. The left one goes at the top on the left, and the right one at
    // the bottom on the right. A tall window puts them there when that makes them larger. A window is tall when it's at
    // least as tall as wide, title bar and all, as the teacher sees it. A wide window keeps them beside the box unless
    // above and below makes them twice as large. Small names need less. At 15 px beside the box they need 1.5 times, and
    // at 10 px any gain at all. These px are the window's own, so a board keeps its layout on every screen. A change of
    // Size can still switch it. Size gives the page more or fewer px, and the title bar keeps its 40 px.
    const widths = new Map(), pen = document.createElement('canvas').getContext('2d');
    let fam = '';
    // A name's width at 1 px in the stage's letters, and how far its letters reach above or below its middle.
    function em(text) {
      const f = getComputedStyle(stage).fontFamily;
      if (f !== fam) { fam = f; widths.clear(); }
      let m = widths.get(text);
      if (m === undefined) {
        const p = host.el('span', 'versus-name versus-probe', stage, text), s = getComputedStyle(p);
        pen.font = `${s.fontStyle} ${s.fontWeight} 100px ${s.fontFamily}`;
        // (The middle sits above the baseline by half the font's ascent less its descent. 4 and 8 add the outline, and
        // the shadow below it.)
        const k = pen.measureText(text), mid = (k.fontBoundingBoxAscent - k.fontBoundingBoxDescent) / 2;
        m = { w: p.offsetWidth / 100, h: Math.max(k.actualBoundingBoxAscent - mid + 4, k.actualBoundingBoxDescent + mid + 8) / 100 || 0 };
        p.remove(); widths.set(text, m);
      }
      return m;
    }
    function geo(look, pair) {
      const W = stage.clientWidth, H = stage.clientHeight, E = LOOKS[look] || {}, asp = clamp(E.aspect || 1, 0.6, 2), edge = W * 0.04;
      const h0 = Math.min(W, H) * clamp(E.size || 0.5, 0.3, 0.7), bh = Math.min(h0, W * 0.38 / asp), bw = bh * asp;
      // (Each name's room ends a little inside the box: the looks are narrower there. A few px more keeps a long name 8 px
      // clear of the emblem through its slam, more in a small window.)
      const g = { W, H, bw, bh, edge, tall: false, top: H * 0.22, aw: W / 2 - bw * 0.42 - edge - Math.max(2, 12 - 0.06 * bw) };
      // (Above and below: the box its look's own size, and each name across the stage in the middle of its band. Its
      // letters stay 10 px clear of the stage's edge and of the emblem's art, which may reach past its box.)
      const band = (H - h0 * (1 + 2 * clamp(E.reach || 0, 0, 0.5))) / 2, t = { W, H, bw: h0 * asp, bh: h0, edge, tall: true, band, top: H * 0.22, aw: W - 2 * edge };
      // (The window is this page and the title bar above it.)
      const win = document.documentElement, beside = size(g, pair);
      return size(t, pair) > beside * (win.clientHeight + BAR >= win.clientWidth ? 1 : clamp(beside / 10, 1, 2)) ? t : g;
    }
    // (1.12: room for the letters' lean and outline. Above and below, 0.625 is room for most names' letters on each side
    // of their middle.)
    const fit = (g, text) => {
      const m = em(text), top = g.tall ? Math.min(g.top, (g.band / 2 - 10) / Math.max(0.625, m.h)) : g.top;
      return Math.max(1, Math.min(top, g.aw / (Math.max(0.3, m.w) * 1.12)));
    };
    const size = (g, pair) => Math.min(fit(g, pair[0]), fit(g, pair[1]));
    function place(look, pair) {
      const g = geo(look, pair);
      if (!(g.W > 0 && g.H > 0 && g.aw > 0)) return g;
      g.fs = size(g, pair);
      stage.classList.toggle('versus-tall', g.tall);
      pair.forEach((text, i) => put(g, i, text, g.fs));
      Object.assign(box.style, { left: px(g.W / 2), top: px(g.H / 2), width: px(g.bw), height: px(g.bh) });
      return g;
    }
    // A name, i: 0 the left one, 1 the right one, at fs px. Above and below the box, it starts at the left edge or ends
    // at the right one.
    function put(g, i, text, fs) {
      let x = i ? g.W - g.edge - g.aw / 2 : g.edge + g.aw / 2, y = g.H * (i ? 0.58 : 0.42);
      if (g.tall) { const w = Math.min(g.aw, em(text).w * fs * 1.12); x = i ? g.W - g.edge - w / 2 : g.edge + w / 2; y = i ? g.H - g.band / 2 : g.band / 2; }
      Object.assign(names[i].style, { left: px(x), top: px(y), fontSize: px(fs) });
    }
    // The look's emblem in its box (or in el), drawn fresh.
    function emblem(look, state, g, el = box) {
      el.replaceChildren();
      if (!has(look) || !(g.bw > 0 && g.bh > 0)) return;
      try { el.innerHTML = LOOKS[look].markup(state, { dark: dark(), w: g.bw, h: g.bh }); } catch (e) { console.error(`Name Picker: the ${look} look couldn’t be drawn`, e); }
    }
    // The stage as it is, with no show: the pair (or "?" and "?" while waiting) and the emblem at rest.
    function draw(pair, look, pickId, fade) {
      now = { pair, look, pickId };
      build(look, !pair);
      names[0].textContent = pair ? pair[0] : '?';
      names[1].textContent = pair ? pair[1] : '?';
      relayout();
      if (fade) for (const e of names.concat(box)) e.classList.add('versus-fade');
    }
    function relayout() {
      const g = place(now.look, now.pair || ['?', '?']);
      Object.assign(now, { W: g.W, H: g.H });
      emblem(now.look, now.pair ? 'final' : 'waiting', g);   // (an emblem's detail depends on its size)
    }
    // The look for this view: the pick's own. A pick with none we have gets one at random, once, and so does the waiting
    // stage each time it appears.
    function lookFor(view, pair) {
      if (pair && has(view.versusLook)) return view.versusLook;
      if (now && has(now.look) && (pair ? now.pair && now.pickId === view.pickId : !now.pair)) return now.look;
      return any(Object.keys(LOOKS));
    }
    const pairOf = view => view.winners.length === 2 ? view.winners.map(i => view.names[i]) : null;

    // ---- The show. Events at set times, played by animation frames; the build-up's light and the slam are animations.
    // The drum's beats: closer each time, from `first` apart to `last`, so the last of the build-up's lands just before
    // its end. Then it rolls on, `last` apart, until the slam lands.
    function schedule(T) {
      const ev = [], beats = [], k = (T.build - T.first) / (T.build - T.last);
      for (let t = 0, dt = T.first; t < T.build + T.most; t += dt, dt = Math.max(T.last, dt * k)) {
        if (t < T.build) beats.push({ t, dt });
        ev.push({ t, fn: () => beat(t) });
      }
      ev.push({ t: T.build, fn: slam });
      return { ev: ev.sort((a, b) => a.t - b.t), beats };
    }
    function frame(ts) {
      const r = run;
      if (!r || dead) return;
      r.raf = 0;
      const t = performance.now() - r.t0;
      while (run === r && r.ei < r.ev.length && r.ev[r.ei].t <= t) r.ev[r.ei++].fn();
      // The impact: the first frame that draws the look's animations at its hit, on their own clock.
      if (run === r && r.slammed && !r.landed) {
        const s = r.hitBy ? r.hitBy.startTime : r.slamAt;
        if (s != null && (ts == null ? performance.now() : ts) >= s + r.hit) land();
      }
      if (run === r && !r.landed) r.raf = requestAnimationFrame(frame);
    }
    // A beat of the drum, louder and a little higher as the build-up goes on.
    function beat(t) {
      if (run.landed) return;
      const p = Math.min(1, t / run.T.build);
      host.sound('drum', { volume: 0.55 + 0.45 * p * p, pitch: 1 + 0.15 * p });
    }
    // The build-up, on an empty stage. The lights go down and come back up by the slam. Each beat lights up one side, left
    // and right in turn, less as the beats close in, while both sides glow more and more. The waiting emblem trembles,
    // harder and harder. Every change of light is small and soft, so nothing flashes.
    function buildUp() {
      const r = run, T = r.T, B = T.build, cut = stage.querySelector('.vs-cut');
      const layer = cls => { const e = host.el('div', cls); e.setAttribute('aria-hidden', 'true'); stage.insertBefore(e, cut); r.layers.push(e); return e; };
      const an = (e, k, o) => { if (!e.animate) return null; const a = e.animate(k, Object.assign({ duration: B, fill: 'both' }, o)); r.up.push(a); r.anims.push(a); return a; };
      an(layer('versus-dim'), [{ opacity: 0.5 }, { opacity: 0 }], { easing: 'ease-in' });
      const glow = p => 0.1 * p * p, at = t => Math.min(1, Math.max(0, t / B));
      [layer('versus-side versus-l versus-glow'), layer('versus-side versus-r versus-glow')].forEach((e, side) => {
        const k = [{ offset: 0, opacity: 0 }];
        r.beats.forEach(({ t, dt }, i) => {
          if (i % 2 !== side) return;
          const fall = Math.min(t + 1.6 * dt, B);
          k.push({ offset: at(t - 1), opacity: glow(at(t - 1)) }, { offset: at(t), opacity: glow(at(t)) + 0.2 * Math.min(1, dt / NORMAL.first), easing: 'cubic-bezier(.2,.7,.4,1)' },
            { offset: at(fall), opacity: glow(at(fall)) });
        });
        k.push({ offset: 1, opacity: glow(1) });
        an(e, k);
      });
      // (The emblem's own detail depends on its size: it trembles in a layer of the box, drawn again on a resize.)
      const shake = r.shake = host.el('div', 'versus-shake', box);
      emblem(r.look, 'waiting', r.g, shake);
      const A = clamp(r.g.bh * 0.025, 1.5, 9), step = r.quick ? 30 : 40, k = [];
      for (let t = 0; t <= B; t += step) {
        const p = at(t), a = A * (0.1 + 0.9 * p * p), rnd = () => Math.random() * 2 - 1;
        k.push({ offset: p, transform: `translate(${px(rnd() * a)}, ${px(rnd() * a * 0.6)}) rotate(${(rnd() * 2.4 * p * p).toFixed(2)}deg) scale(${(1 + 0.05 * p).toFixed(3)})` });
      }
      if (k.length > 1) an(shake, k, { fill: 'none' });
    }
    // The look's slam and impact, as designed. The grey emblem lets go as the slam comes down: it swells and fades over
    // the box, gone before the emblem lands. The impact is timed from the slam's own clock: its animations start a frame
    // or more after this call, as setting them up can take 25 to 80 ms on a slow Chromebook.
    function slam() {
      const r = run, E = LOOKS[r.look];
      r.slammed = true;
      if (r.shake && r.shake.parentNode === box) {
        // (After the box, so the looks find their own emblem first.)
        const ghost = host.el('div', 'versus-ghost', stage);
        ghost.setAttribute('aria-hidden', 'true');
        Object.assign(ghost.style, { left: box.style.left, top: box.style.top, width: box.style.width, height: box.style.height });
        ghost.appendChild(r.shake);
        if (ghost.animate) {
          const a = ghost.animate([{ opacity: 1, transform: 'translate(-50%, -50%)' }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.15)' }], { duration: r.T.fade, easing: 'ease-in', fill: 'both' });
          const gone = () => ghost.remove();
          a.finished.then(gone, gone); r.anims.push(a);
        } else ghost.remove();
      }
      emblem(r.look, 'final', r.g);
      let anims = [];
      if (E) {
        try { anims = [].concat(E.slam ? E.slam(box, { quick: r.quick, stage }) || [] : [], E.impact ? E.impact(stage, { quick: r.quick }) || [] : []).filter(a => a && a.finished); }
        catch (e) { console.error(`Name Picker: the ${r.look} look’s slam failed`, e); }
      }
      r.anims.push(...anims);
      r.hit = (E && E.hit && Number(r.quick ? E.hit.quick : E.hit.normal)) || 0;
      r.hitBy = anims[0] || null; r.slamAt = performance.now();
      if (!anims.length) land();   // (a look with no slam: the names land at once)
      // (Once the slam is over and the names have landed.)
      Promise.all(anims.map(a => a.finished)).then(() => Promise.all(r.stamp.map(a => a.finished))).then(() => { if (run === r) finish(); }, () => {});
      r.last = setTimeout(() => { if (run === r) finish(); }, r.T.most);
    }
    // The impact: both names land at once, in their places and at their size, with the thud, as the build-up's light goes.
    function land() {
      const r = run;
      r.landed = true;
      for (const a of r.up) { try { a.cancel(); } catch (e) { /* gone */ } }
      for (const e of r.layers) e.remove();
      names.forEach((n, i) => {
        n.textContent = r.pair[i];
        if (n.animate) r.stamp.push(n.animate([{ transform: NAME + ' translateY(-.06em) scale(1, 1.12)' }, { transform: NAME + ' translateY(.03em) scale(1, .95)', offset: 0.45 }, { transform: NAME }],
          { duration: r.T.stamp, easing: 'ease-out' }));
      });
      r.anims.push(...r.stamp);
      host.sound('slam');
    }
    // The show is over: the stage drawn fresh with the pair and its emblem at rest, the challenge sound, and the host told.
    function finish() {
      end();
      host.sound('challenge');
      host.done();
    }
    // Everything the show started is cancelled, and (unless the style is going) the stage is drawn fresh, as it ends.
    function end(redraw = true) {
      const r = run;
      if (!r) return;
      run = null;
      if (r.raf) cancelAnimationFrame(r.raf);
      clearTimeout(r.last);
      const all = new Set(r.anims.concat(stage && stage.getAnimations ? stage.getAnimations({ subtree: true }) : []));
      for (const a of all) { try { a.cancel(); } catch (e) { /* gone */ } }
      if (redraw) draw(r.pair, r.look, r.pickId);
    }

    // ---- What the host calls
    function show(view, how) {
      if (dead) return;
      if (run) end(false);
      const pair = pairOf(view), look = lookFor(view, pair), fade = !!(how && how.fade);
      if (stage && now && !fade && now.look === look && now.pickId === view.pickId && JSON.stringify(now.pair) === JSON.stringify(pair)) {
        if (stage.clientWidth !== now.W || stage.clientHeight !== now.H) relayout();   // (it changed size while hidden)
        return;
      }
      draw(pair, look, view.pickId, fade && !!pair);
    }
    function play(view) {
      if (dead) return;
      if (run) end(false);
      const pair = pairOf(view);
      if (!pair) { show(view); host.done(); return; }
      const look = lookFor(view, pair), T = view.quick ? QUICK : NORMAL;
      now = { pair, look, pickId: view.pickId };
      // A fresh stage, with no names on it: a pair on screen before goes with the old one. The names land with the slam.
      build(look, false);
      const g = place(look, pair), { ev, beats } = schedule(T);
      run = { T, quick: !!view.quick, pair, look, pickId: view.pickId, g, t0: performance.now(), ev, beats, ei: 0, up: [], layers: [], anims: [], stamp: [],
        shake: null, raf: 0, last: 0, slammed: false, landed: false, hit: 0, hitBy: null, slamAt: 0 };
      if (!(g.fs > 0)) { finish(); return; }   // (no room to show it)
      buildUp();
      frame();
    }
    return {
      show,
      play,
      skip() { end(); },
      resize() {
        if (dead || !stage) return;
        fam = ''; widths.clear();   // (the letters may have changed, or a font finished loading: measure again)
        if (run) {
          // The show is laid out for the stage it began on. A new size ends it at once, as a skip does. It ends on the
          // challenge sound only once the names have landed.
          if (stage.clientWidth !== run.g.W || stage.clientHeight !== run.g.H) { if (run.landed) finish(); else { end(); host.done(); } return; }
          // The letters changed. In the build-up, the names take their new places, and the grey emblem is drawn again.
          if (!run.slammed) { run.g = place(run.look, run.pair); if (run.shake) emblem(run.look, 'waiting', run.g, run.shake); }
          return;
        }
        if (now) relayout();
      },
      theme() {
        if (dead || !stage || !now) return;
        if (!run) emblem(now.look, now.pair ? 'final' : 'waiting', geo(now.look, now.pair || ['?', '?']));
        else if (!run.slammed && run.shake) emblem(run.look, 'waiting', run.g, run.shake);
      },
      destroy() { dead = true; end(false); if (stage) stage.remove(); }
    };
  }
});
