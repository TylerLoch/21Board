/*
 * Name Picker style: Versus.
 * Two students face off. The stage splits on a diagonal, red-orange on the left and blue-cyan on the right, with a thin
 * slash between them. On a pick the names flicker on each side and slow down, the left one locks in with a pop, then the
 * right one, and a VS emblem slams down between them with a thud. Then the chime: about 3 seconds (with Quick about 1½).
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
.versus-blur { filter: blur(1.5px); opacity: .85; }
/* Above and below the emblem, the names are in front of it: the looks' slams come down through them. */
.versus-tall .versus-name { z-index: 1; }
.versus-probe { left: 0; top: 0; transform: none; font-size: 100px; visibility: hidden; }
.versus-box { position: absolute; transform: translate(-50%, -50%); }
.versus-box > svg { display: block; width: 100%; height: 100%; overflow: visible; }
.versus-fade { animation: versus-fade .3s ease-out; }
@keyframes versus-fade { from { opacity: 0; } to { opacity: 1; } }
`,
  mount(root, host) {
    const LOOKS = NamePicker.looks, has = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(LOOKS, id);
    // The show (ms from its start): the names flicker, each flicker `grow` times longer than the last, until the left one
    // locks in, then the right one. The emblem slams down at `slam`, and the chime comes once its slam is over (or after
    // `most` at the latest). `pop`: a name locking in.
    const NORMAL = { step: 55, grow: 1.09, left: 1400, right: 1800, slam: 1950, most: 1300, pop: 300 };
    const QUICK = { step: 40, grow: 1.1, left: 650, right: 850, slam: 950, most: 750, pop: 200 };
    const NAME = 'translate(-50%, -50%) skewX(-9deg)';   // (as .versus-name)
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const px = v => (Math.round(v * 10) / 10) + 'px';
    const any = list => list[Math.floor(Math.random() * list.length)];
    const dark = () => document.documentElement.getAttribute('data-b21-theme') === 'dark';

    let stage = null;     // .versus: the sides, the slash, the two names, and the emblem's box (the looks' `stage`)
    let names = [], box = null;
    let now = null;       // what the stage shows: { pair: [left, right] (null: waiting), look, pickId }
    let run = null;       // the show running: { T, quick, pair, look, deck, g, t0, ev, ei, locked, anims, raf, thud, last, slammed }
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
    // each side while clear of the box, up to 22% of the stage's height: the left one a little above the middle, the
    // right one a little below. Beside the names the box takes at most 38% of the stage's width, so a narrow window
    // leaves them room. The names go above and below the box instead, the left one at the top on the left, the right
    // one at the bottom on the right, when that makes them larger by more than 1.1 times the stage's width over its
    // height: 1.1 times larger in a square stage, twice in one 1.8 times as wide as tall, and just larger in a tall
    // one. Short names in a wide window stay beside the emblem. When a resize moves the names, their size changes by
    // just that much.
    const widths = new Map();
    let fam = '';
    function em(text) {   // a name's width at 1 px, in the stage's letters
      const f = getComputedStyle(stage).fontFamily;
      if (f !== fam) { fam = f; widths.clear(); }
      let w = widths.get(text);
      if (w === undefined) { const p = host.el('span', 'versus-name versus-probe', stage, text); w = p.offsetWidth / 100; p.remove(); widths.set(text, w); }
      return w;
    }
    function geo(look, pair) {
      const W = stage.clientWidth, H = stage.clientHeight, E = LOOKS[look] || {}, asp = clamp(E.aspect || 1, 0.6, 2), edge = W * 0.04;
      const h0 = Math.min(W, H) * clamp(E.size || 0.5, 0.3, 0.7), bh = Math.min(h0, W * 0.38 / asp), bw = bh * asp;
      // (Each name's room ends a little inside the box: the looks are narrower there. A few px more keeps a long name 8 px
      // clear of the emblem through its slam, more in a small window.)
      const g = { W, H, bw, bh, edge, tall: false, top: H * 0.22, aw: W / 2 - bw * 0.42 - edge - Math.max(2, 12 - 0.06 * bw) };
      // (Above and below: the box its look's own size, and each name across the stage, in the middle of its band, at
      // least 10 px clear of the emblem's art, which may reach past its box.)
      const band = (H - h0 * (1 + 2 * clamp(E.reach || 0, 0, 0.5))) / 2, t = { W, H, bw: h0 * asp, bh: h0, edge, tall: true, band, top: Math.min(H * 0.22, (band - 20) / 1.25), aw: W - 2 * edge };
      return size(t, pair) > size(g, pair) * Math.max(1, 1.1 * W / H) ? t : g;
    }
    // (1.12: room for the letters' lean and outline.)
    const fit = (g, text) => Math.max(1, Math.min(g.top, g.aw / (Math.max(0.3, em(text)) * 1.12)));
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
      if (g.tall) { const w = Math.min(g.aw, em(text) * fs * 1.12); x = i ? g.W - g.edge - w / 2 : g.edge + w / 2; y = i ? g.H - g.band / 2 : g.band / 2; }
      Object.assign(names[i].style, { left: px(x), top: px(y), fontSize: px(fs) });
    }
    // The look's emblem in its box, drawn fresh.
    function emblem(look, state, g) {
      box.replaceChildren();
      if (!has(look) || !(g.bw > 0 && g.bh > 0)) return;
      try { box.innerHTML = LOOKS[look].markup(state, { dark: dark(), w: g.bw, h: g.bh }); } catch (e) { console.error(`Name Picker: the ${look} look couldn’t be drawn`, e); }
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

    // ---- The show. Events at set times, played by animation frames; the slam is the look's own animations.
    function schedule(T) {
      const ev = [];
      for (let t = 0, dt = T.step; t < T.right - 20; t += dt, dt *= T.grow) ev.push({ t, fn: flicker });
      ev.push({ t: T.left, fn: () => lock(0) }, { t: T.right, fn: () => lock(1) }, { t: T.slam, fn: slam });
      return ev.sort((a, b) => a.t - b.t);
    }
    function frame() {
      const r = run;
      if (!r || dead) return;
      r.raf = 0;
      const t = performance.now() - r.t0;
      while (run === r && r.ei < r.ev.length && r.ev[r.ei].t <= t) r.ev[r.ei++].fn();
      if (run === r && r.ei < r.ev.length) r.raf = requestAnimationFrame(frame);
    }
    // A new name on each side still flickering (not the one it had, nor the other side's), and a soft tick.
    function flicker() {
      const r = run;
      for (let i = 0; i < 2; i++) {
        if (r.locked[i]) continue;
        let t, n = 0;
        do t = any(r.deck); while (++n < 8 && r.deck.length > 2 && (t === names[i].textContent || t === names[1 - i].textContent));
        names[i].textContent = t;
        put(r.g, i, t, Math.min(r.g.fs, fit(r.g, t)));
      }
      host.sound('tick', { volume: 0.6 });
    }
    // A side locks in on its name, with a pop.
    function lock(i) {
      const r = run, n = names[i];
      r.locked[i] = true;
      n.textContent = r.pair[i];
      put(r.g, i, r.pair[i], r.g.fs);
      n.classList.remove('versus-blur');
      n.removeAttribute('aria-hidden');
      if (n.animate) r.anims.push(n.animate([{ transform: NAME + ' scale(.8)' }, { transform: NAME + ' scale(1.12)', offset: 0.6 }, { transform: NAME }], { duration: r.T.pop, easing: 'ease-out' }));
      host.sound('pop');
    }
    // The look's slam and impact, as designed, and the thud at its moment of impact (its `hit`). That moment is timed
    // from the slam's own clock: its animations start a frame or more after this call, as setting them up can take 25 to
    // 80 ms on a slow Chromebook.
    function slam() {
      const r = run, E = LOOKS[r.look];
      r.slammed = true;
      emblem(r.look, 'final', r.g);
      let anims = [];
      if (E) {
        try { anims = [].concat(E.slam ? E.slam(box, { quick: r.quick, stage }) || [] : [], E.impact ? E.impact(stage, { quick: r.quick }) || [] : []).filter(a => a && a.finished); }
        catch (e) { console.error(`Name Picker: the ${r.look} look’s slam failed`, e); }
      }
      r.anims.push(...anims);
      const hit = (E && E.hit && Number(r.quick ? E.hit.quick : E.hit.normal)) || 0;
      const thud = start => { if (run === r) r.thud = setTimeout(() => { if (run === r) host.sound('slam'); }, Math.max(0, start + hit - performance.now())); };
      if (anims.length) anims[0].ready.then(a => thud(a.startTime == null ? performance.now() : a.startTime), () => {}); else thud(performance.now());
      Promise.all(anims.map(a => a.finished)).then(() => { if (run === r) finish(); }, () => {});
      r.last = setTimeout(() => { if (run === r) finish(); }, r.T.most);
    }
    // The show is over: the stage drawn fresh with the pair and its emblem at rest, the chime, and the host told.
    function finish() {
      end();
      host.sound('chime');
      host.done();
    }
    // Everything the show started is cancelled, and (unless the style is going) the stage is drawn fresh, as it ends.
    function end(redraw = true) {
      const r = run;
      if (!r) return;
      run = null;
      if (r.raf) cancelAnimationFrame(r.raf);
      clearTimeout(r.thud); clearTimeout(r.last);
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
      // The names that flicker: the ones that were in the draw (or everyone, when that's too few to flicker).
      const inDraw = view.names.filter((n, i) => !view.picked[i] || view.winners.includes(i));
      now = { pair, look, pickId: view.pickId };
      build(look, false);
      const g = place(look, pair);
      for (const n of names) { n.classList.add('versus-blur'); n.setAttribute('aria-hidden', 'true'); }   // (the flicker isn't the pair)
      run = { T, quick: !!view.quick, pair, look, pickId: view.pickId, deck: inDraw.length >= 3 ? inDraw : view.names, g, t0: performance.now(), ev: schedule(T), ei: 0,
        locked: [false, false], anims: [], raf: 0, thud: 0, last: 0, slammed: false };
      if (!(g.fs > 0)) { finish(); return; }   // (no room to show it)
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
          // The slam is laid out for the stage it began on: if that changes, the show ends there.
          if (run.slammed) { if (stage.clientWidth !== run.g.W || stage.clientHeight !== run.g.H) finish(); return; }
          run.g = place(run.look, run.pair);
          for (let i = 0; i < 2; i++) if (!run.locked[i] && run.g.fs > 0) put(run.g, i, names[i].textContent, Math.min(run.g.fs, fit(run.g, names[i].textContent)));
          return;
        }
        if (now) relayout();
      },
      theme() { if (!dead && stage && now && !run) emblem(now.look, now.pair ? 'final' : 'waiting', geo(now.look, now.pair || ['?', '?'])); },
      destroy() { dead = true; end(false); if (stage) stage.remove(); }
    };
  }
});
