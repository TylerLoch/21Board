// Lightning: the board's own slash cracks into a bolt, then an electric gold V and an electric cyan S slam down around it.
// A look for the Name Picker's Versus, one of five (see style-versus.js). It registers itself as 'lightning' with
// NamePicker.look(). The emblem's API: the comment at the top of index.html.
(() => {
  const P = 'vs' + Math.random().toString(36).slice(2, 7), uid = () => P + Math.random().toString(36).slice(2, 8);
  const KB = Math.tan(12 * Math.PI / 180), NS = 'http://www.w3.org/2000/svg', INK = '#111827';
  const r1 = v => +v.toFixed(1);
  const d = a => 'M' + a.map(p => p.map(r1).join(' ')).join('L') + 'Z';
  const T = -88, B = 80;
  // V: the right arm runs parallel to the channel the bolt sits in.
  const vl = -92, vr = -6, aL = 28, aR = 26, bx = vr - 5 - 34, sL = (bx - vl) / (B - T), sR = -5 / (B - T);
  const ty = (vr - aR - vl - aL) / (sL - sR);
  const V = d([[vl, T], [vl + aL, T], [vl + aL + sL * ty, T + ty], [vr - aR, T], [vr, T], [vr - 5, B], [bx, B]]);
  const a = 6, b = 78;
  const S = d([[a + 22, T], [b, T - 3], [b, -52], [b - 26, -60], [a + 26, -60], [a + 26, -18], [b - 18, -18], [b, 0], [b, B - 22], [b - 22, B],
    [a, B + 3], [a, 44], [a + 26, 52], [b - 26, 52], [b - 26, 10], [a + 18, 10], [a, -8], [a, T + 22]]);
  const BO = d([[8, -124], [-12.5, -28], [-1.8, -28], [-13.5, 42], [-1.6, 42], [-8, 122], [12.5, 28], [1.8, 28], [13.5, -42], [1.6, -42]]);
  // The bolt's real lean from tip to tip, once skewed: about 0.27, or 0.276 when shrunk for tiny boxes.
  const LB = tiny => KB + 0.057 * (tiny ? 0.85 / 0.76 : 1);
  // The white tops of both letters end on one sideways bolt.
  const ZZ = d([[-140, -200], [140, -200], [140, 10], [54, -8], [60, 10], [-24, -14], [-18, 4], [-60, -16], [-54, 2], [-140, -20]]);
  const VB = [-110, -100, 220, 200];
  // Splits on a separator outside parentheses, so calc() survives.
  const split = (s, re) => { const o = []; let dp = 0, c = ''; for (const ch of s) { dp += ch === '(' ? 1 : ch === ')' ? -1 : 0; if (!dp && re.test(ch)) { c.trim() && o.push(c.trim()); c = ''; } else c += ch; } c.trim() && o.push(c.trim()); return o; };
  // The stage's slash, read from the .vs-cut clip-path: x1 at the top, x2 at the bottom. Falls back to 57% and 43%.
  const slash = stage => {
    const W = stage ? stage.clientWidth : 0, H = stage ? stage.clientHeight : 0, fb = { W, H, x1: 0.57 * W, x2: 0.43 * W, sw: 0.006 * W };
    const cut = stage && stage.querySelector('.vs-cut'), cp = cut && getComputedStyle(cut).clipPath, mt = cp && cp.match(/polygon\((.*)\)\s*$/);
    if (!mt) return fb;
    const pr = split(mt[1], /,/);
    if (/^(evenodd|nonzero)$/.test(pr[0])) pr.shift();
    let probe;
    const len = (v, i) => {
      const m = v.match(/^(-?[\d.]+)(px|%)?$/);
      if (m) return parseFloat(m[1]) * (m[2] === '%' ? (i ? H : W) / 100 : 1);
      if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden'; stage.appendChild(probe); }
      probe.style.left = i ? '0' : v; probe.style.top = i ? v : '0';
      return i ? probe.offsetTop : probe.offsetLeft;
    };
    const pts = pr.map(p => split(p, /\s/).map(len));
    if (probe) probe.remove();
    const tp = pts.filter(p => p[1] < H / 2), bt = pts.filter(p => p[1] >= H / 2), av = a => a.reduce((t, p) => t + p[0], 0) / a.length;
    const hw = a => (Math.max(...a.map(p => p[0])) - Math.min(...a.map(p => p[0]))) / 2;
    return tp.length && bt.length && pts.every(p => p.length === 2 && p.every(isFinite)) ? { W, H, x1: av(tp), x2: av(bt), sw: (hw(tp) + hw(bt)) / 2 } : fb;
  };

  NamePicker.look('lightning', {
    // Sized to sit with the other four looks. The box is a little wider than the art (1.1), so the names keep 10 px or more.
    size: 0.47,
    aspect: 1.14,
    // At rest the bolt's tips reach past the box, above and below, by 0.145 of its height (measured, light and dark).
    reach: 0.15,
    // The moment of impact, in ms from the start of the animations (anims[0].ready), not from the call.
    hit: { normal: 300, quick: 120 },
    markup(state, { dark, h = 200 } = {}) {
      const w = state === 'waiting', k = uid(), tiny = h < 90;
      const ink = w ? '#334155' : INK, rim = w ? '#e2e8f0' : '#fff';
      const ex = tiny ? 'translate(1 4)' : 'translate(2 8)', ex2 = tiny ? 'translate(.5 2)' : 'translate(1 4)';
      const iw = tiny ? 10 : 12, rw = tiny ? 15 : 20;
      const sk = `transform="skewX(-13)"`, u = (c, at = '') => `<use href="#${c}${k}" ${at}/>`;
      // Per letter: body stops, white-top stops, and the extrusion in its side's color.
      const col = w ? { v: [[-88, 80, '#eef2f6', .45, '#c3cad5', 1, '#97a1b0'], [-88, 12, '#ffffff', 1, '#e2e8f0'], '#64748b'] } : {
        v: [[-88, 80, '#fff3a0', .4, '#ffd21a', 1, '#ffb000'], [-88, 12, '#ffffff', 1, '#fff4b8'], '#7f1d1d'],
        s: [[-88, 80, '#e0fbff', .4, '#67e8f9', 1, '#22b8f0'], [-88, 12, '#ffffff', 1, '#e6fcff'], '#1e3a8a'],
      };
      if (w) col.s = col.v;
      const lg = (id, [y1, y2, c0, ...cs]) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}"><stop offset="0" stop-color="${c0}"/>${cs.map((c, i) => i % 2 ? `<stop offset="${cs[i - 1]}" stop-color="${c}"/>` : '').join('')}</linearGradient>`;
      const grads = ['v', 's'].map(c => lg('f' + c + k, col[c][0]) + lg('t' + c + k, col[c][1])).join('');
      // Each letter: a rim group (drawn under both letters) and a body group.
      const rimG = c => `<g data-vsx="r${c}"><g ${sk} fill="${rim}" stroke="${rim}" stroke-width="${rw}" stroke-linejoin="round">${u(c, `transform="${ex}"`)}${u(c)}</g></g>`;
      const body = c => `<g data-vsx="${c}"><g ${sk} stroke-linejoin="round"><g fill="${ink}" stroke="${ink}" stroke-width="${iw}">${u(c, `transform="${ex}"`)}${u(c)}</g>`
        + `<g fill="${col[c][2]}">${u(c, `transform="${ex}"`)}${u(c, `transform="${ex2}"`)}</g>`
        + u(c, `fill="url(#f${c}${k})" stroke="${ink}" stroke-width="3"`) + u(c, `fill="url(#t${c}${k})" clip-path="url(#z${k})"`)
        + u(c, `data-vsx="h${c}" fill="#fff" opacity="0"`) + '</g></g>';
      // The bolt is the board's own slash: white on light boards, the dark slash color on dark ones.
      const bf = dark ? ink : w ? '#cbd5e1' : '#fff', bs = dark ? '#fff' : ink;
      return `<svg data-vsx-e="" viewBox="${VB.join(' ')}" overflow="visible"><defs><path id="v${k}" d="${V}"/><path id="s${k}" d="${S}"/><path id="b${k}" d="${BO}"/>${grads}`
        + `<clipPath id="z${k}"><path d="${ZZ}"/></clipPath><clipPath id="g${k}" ${sk}>${u('v')}${u('s')}</clipPath></defs>`
        + rimG('v') + rimG('s') + body('v') + body('s')
        + `<g clip-path="url(#g${k})"><path data-vsx="gl" d="M-150-120h16l-40 240h-16z" fill="#fff" opacity="0"/></g>`
        + `<g data-vsx="b"><g transform="skewX(-12)${tiny ? ' scale(.85 .76)' : ''}" stroke-linejoin="round">${u('b', `fill="${bf}" stroke="${bs}" stroke-width="${tiny ? 5 : 9}" paint-order="stroke"`)}</g></g></svg>`;
    },

    // The slash cracks into a bolt at 20 ms and shrinks into the emblem by 210. The V drops from 180 and the S from 200; both land at 300.
    slam(box, { quick, stage } = {}) {
      const A = [];
      // Clear copies a cancelled slam may have left, and find the emblem itself.
      box.querySelectorAll(':scope > [data-vsx-copy]').forEach(c => c.remove());
      const svg = [...box.children].find(c => c.tagName.toLowerCase() === 'svg' && !c.hasAttribute('data-vsx-copy'));
      if (!svg) return A;
      const an = (el, k, dur, dl = 0, e = 'linear') => { const x = el.animate(k, { duration: dur, delay: dl, easing: e, fill: 'both' }); A.push(x); return x; };
      const bw = box.offsetWidth || 100, bh = box.offsetHeight || 100, sc = Math.min(bw / VB[2], bh / VB[3]), tiny = bh < 90;
      const at = (X, Y) => `${r1((bw - VB[2] * sc) / 2 + (X - VB[0]) * sc)}px ${r1((bh - VB[3] * sc) / 2 + (Y - VB[1]) * sc)}px`;
      const sl = slash(stage), sh = sl.H || bh * 2.4, m = Math.min(sl.W || sh, sh);
      const j = Math.max(2, Math.round(m * 0.01)), L = quick ? 120 : 300, end = L + (quick ? 200 : 240), o = t => t / end, H2 = quick ? 40 : 70, E = L + 1, oe = t => t / E;
      // Where the box sits on the stage, and where the slash crosses its middle, measured before any layer is added.
      let dx = 0, cy = sh / 2;
      if (stage) {
        const sr = stage.getBoundingClientRect(), br = box.getBoundingClientRect(), f = sr.width / (sl.W || 1) || 1;
        cy = (br.top + br.height / 2 - sr.top) / f;
        dx = r1(sl.x1 + (sl.x2 - sl.x1) * cy / sh - (br.left + br.width / 2 - sr.left) / f);
      }
      // Landing: the emblem squashes short on its floor and thuds down and up, then rebounds tall and settles.
      const tr = (sx, sy = sx, x = 0, y = 0) => `translate(-50%,-50%) translate(${r1(x)}px,${r1(y + (1 - sy) * bh * 0.44)}px) scale(${sx},${sy})`, sq = [1.008, 0.85];
      an(box, [{ transform: tr(1), offset: 0 }, { transform: tr(1), offset: o(L) }, { transform: tr(...sq, 0, j), offset: o(L) }, { transform: tr(...sq, 0, -j * 0.6), offset: o(L + 20) },
        { transform: tr(...sq, 0, j * 0.4), offset: o(L + 40) }, { transform: tr(...sq), offset: o(L + H2), easing: 'ease-out' }, { transform: tr(1, 1.05), offset: o(L + H2 + 70), easing: 'ease-in-out' }, { transform: tr(1), offset: 1 }], end);
      // Before the landing, the moving parts are copies of the emblem's layers in sibling SVGs, so the browser moves them without repainting.
      // They draw from the emblem's own defs. The emblem itself appears on the landing frame, exactly under them, as they vanish.
      an(svg, [{ opacity: 0 }, { opacity: 0, offset: o(L - 0.1) }, { opacity: 1, offset: o(L - 0.1) }, { opacity: 1 }], end);
      const copy = (keep, fix) => {
        const c = document.createElementNS(NS, 'svg');
        c.setAttribute('viewBox', VB.join(' ')); c.setAttribute('overflow', 'visible'); c.setAttribute('data-vsx-copy', '');
        keep.forEach(x => { const g = svg.querySelector(`:scope > [data-vsx="${x}"]`); g && c.appendChild(g.cloneNode(true)); });
        if (fix) fix(c);
        c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none';
        return box.appendChild(c);
      };
      const gone = (c, x) => x.finished.then(() => c.remove(), () => c.remove());
      const shown = (t0, t1, t2) => [{ opacity: 0 }, { opacity: 0, offset: oe(t0) }, { opacity: 1, offset: oe(t0) }, { opacity: 1, offset: oe(t1) }, { opacity: 0, offset: oe(t2) }, { opacity: 0 }];
      // Each letter falls straight down its own column, stretched tall with speed, and lands as the emblem squashes.
      [['v', quick ? 20 : 180, -46], ['s', quick ? 35 : 200, 24]].forEach(([c, t0, cx]) => {
        const fall = `translateY(${r1(-(cy + bh * 0.5 + 14 * sc))}px) scale(1.12,1.5)`, ease = quick ? 'cubic-bezier(.4,0,.9,.6)' : 'cubic-bezier(.45,0,.9,.5)';
        const el = copy(['r' + c, c]);
        el.style.transformOrigin = at(cx, 80);
        gone(el, an(el, [{ transform: fall }, { transform: fall, offset: oe(t0), easing: ease }, { transform: 'none', offset: oe(L) }, { transform: 'none' }], E));
        an(el, shown(t0, L, L), E);
      });
      const big = `translateX(${dx}px) scale(${r1(Math.max(1.6, 2 * Math.max(cy, sh - cy) * 1.1 / (246 * (tiny ? 0.76 : 1) * sc)))}) skewX(${r1(Math.atan(LB(tiny) - (sl.x1 - sl.x2) / (sh || 1)) * 180 / Math.PI)}deg)`;
      // The bolt: the board's slash cracks into it, full height, in three steps a frame apart (one step in quick mode).
      // Then the whole bolt flickers off for a frame and shrinks into the emblem. The skew turns the bolt's lean into the slash's.
      (quick ? [[0, 0]] : [[-35, 20], [35, 37], [0, 54]]).forEach(([part, t1]) => {
        const bolt = copy(['b'], g => {
          const s = g.querySelector('use'); s.setAttribute('fill', '#fff'); s.setAttribute('stroke', INK); s.setAttribute('stroke-width', 9);
          if (!part) return;
          const cp = document.createElementNS(NS, 'clipPath'), rc = document.createElementNS(NS, 'rect'), id = uid();
          cp.id = id; [['x', -400], ['y', -400], ['width', 800], ['height', 400 + part]].forEach(([k, v]) => rc.setAttribute(k, v));
          cp.appendChild(rc); g.appendChild(cp); g.firstChild.setAttribute('clip-path', `url(#${id})`);
        });
        bolt.style.transformOrigin = at(0, 0);
        const bk = part ? [[0, 0], [t1, 0], [t1, 1], [54, 1], [55, 0]].map(([t, v]) => ({ transform: big, opacity: v, offset: oe(t) })).concat({ transform: big, opacity: 0 })
          : (quick ? [[0, 1], [40, 1]] : [[0, 0], [54, 0], [54, 1], [86, 1], [86, 0], [100, 0], [100, 1], [125, 1]]).map(([t, v]) => ({ transform: big, opacity: v, offset: oe(t) }))
            .concat({ transform: 'none', opacity: 1, offset: oe(quick ? 90 : 210) }, { transform: 'none', opacity: 1, offset: oe(L) }, { transform: 'none', opacity: 0, offset: oe(L) }, { transform: 'none', opacity: 0 });
        if (!part) bk[quick ? 1 : 7].easing = 'cubic-bezier(.5,0,.2,1)';
        gone(bolt, an(bolt, bk, E));
      });
      // An electric flash on the hit: the letters go white for 40 ms and snap back. The bolt rides on top so it stays whole.
      const hot = copy(['v', 's', 'b'], g => {
        g.querySelectorAll('[data-vsx="v"] > g > :not([data-vsx]), [data-vsx="s"] > g > :not([data-vsx])').forEach(e => e.remove());
        g.querySelectorAll('[data-vsx^="h"]').forEach(e => e.setAttribute('opacity', 1));
      });
      gone(hot, an(hot, [{ opacity: 0 }, { opacity: 0, offset: o(L) }, { opacity: 1, offset: o(L) }, { opacity: 1, offset: o(L + 40), easing: 'ease-in' }, { opacity: 0, offset: o(L + 56) }, { opacity: 0 }], end));
      // A glint sweeps across both letters once they settle.
      const gl = svg.querySelector('[data-vsx="gl"]');
      if (gl && !quick) an(gl, [{ transform: 'none', opacity: 0.85 }, { transform: 'translateX(330px)', opacity: 0.85 }], 220, end - 20, 'ease-in-out');
      // Once the show ends, let go of the held end states. They equal the static markup, and the emblem drops its extra layers.
      A.forEach(x => x.finished.then(() => x.effect && x.effect.updateTiming({ fill: 'none' }), () => {}));
      return A;
    },

    impact(stage, { quick } = {}) {
      const A = [], W = stage.clientWidth, H = stage.clientHeight, m = Math.min(W, H) || 1, L = quick ? 120 : 300;
      stage.querySelectorAll(':scope > [data-vsx-fx]').forEach(e => e.remove());
      // Effects go under the names. The crackle and the sparks sit just above the slash, the pulse just under it.
      const top = el => { while (el && el.parentNode !== stage) el = el.parentNode; return el; };
      const cut = top(stage.querySelector('.vs-cut')), em = top(stage.querySelector('svg[data-vsx-e]')), ref = cut || em;
      const add = (css, html, after, tag = '') => {
        const e = document.createElement('div'); e.setAttribute('data-vsx-fx', tag); e.style.cssText = 'position:absolute;pointer-events:none;' + css; e.innerHTML = html;
        stage.insertBefore(e, after && cut ? cut.nextSibling : ref || null); return e;
      };
      const an = (el, k, dur, dl, e = 'linear') => { const x = el.animate(k, { duration: dur, delay: dl, easing: e, fill: 'both' }); x.finished.then(() => el.remove(), () => el.remove()); A.push(x); };
      const { x1, x2, sw } = slash(stage), sx = y => x1 + (x2 - x1) * y / (H || 1);
      // The emblem's center on the stage.
      let cx = W / 2, cy = H / 2;
      if (em) { const sr = stage.getBoundingClientRect(), br = em.getBoundingClientRect(), f = sr.width / W || 1; cx = (br.left + br.width / 2 - sr.left) / f; cy = (br.top + br.height / 2 - sr.top) / f; }
      // One pulse of each side's own color, centered on the emblem, on the same frame. Drawn at half size and scaled up, which is cheaper to fill.
      const R = 0.62 * m, lw = Math.min(W, 2 * R), lx = Math.max(0, Math.min(W - lw, cx - lw / 2)), id = uid();
      const rg = (c, cs) => `<radialGradient id="${id}${c}" gradientUnits="userSpaceOnUse" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R)}">${cs.map(([o, s, a = 1]) => `<stop offset="${o}" stop-color="${s}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;
      an(add(`left:${r1(lx)}px;top:0;width:${r1(lw / 2)}px;height:${r1(H / 2)}px;transform-origin:0 0;transform:scale(2)`, `<svg width="100%" height="100%" viewBox="${r1(lx)} 0 ${r1(lw)} ${H}" preserveAspectRatio="none"><defs>`
        + rg('w', [[0, '#ffd000'], [0.3, '#ff8a00'], [0.62, '#ff3b1a'], [1, '#ff3b1a', 0]]) + rg('c', [[0, '#22d3ee'], [0.3, '#1d9bf0'], [0.62, '#2563eb'], [1, '#2563eb', 0]])
        + `</defs><polygon points="0,0 ${r1(x1)},0 ${r1(x2)},${H} 0,${H}" fill="url(#${id}w)"/><polygon points="${r1(x1)},0 ${W},0 ${W},${H} ${r1(x2)},${H}" fill="url(#${id}c)"/></svg>`),
        [{ opacity: 0 }, { opacity: 0.7, offset: 0.001 }, { opacity: 0.7, offset: 0.25, easing: 'ease-out' }, { opacity: 0 }], quick ? 180 : 280, L);
      // On the hit the slash crackles: a jagged bolt along its full length, behind the emblem, for 40 ms.
      // Each band leans a little past the slash and steps back at a ledge, so its center stays on the slash. Its ends run past the stage's edges.
      const HH = Math.max(H, 1), e = 0.04 * HH, dj = 0.0068 * m, hw = Math.max(0.012 * m, sw + dj + 1 - 0.008 * m), uy = [0, 0.1, 0.21, 0.33, 0.5, 0.67, 0.79, 0.9, 1].map(f => -e + f * (HH + 2 * e)), n = uy.length - 1;
      const cc = (i, y) => { const ya = uy[i], yb = uy[i + 1], t = (y - ya) / (yb - ya); return sx(ya) + dj + (sx(yb) - dj - sx(ya) - dj) * t; }, hj = (uy[1] - uy[0]) * 0.12;
      const lf = [[cc(0, uy[0]) - hw, uy[0]]], rt = [[cc(0, uy[0]) + hw, uy[0]]];
      for (let i = 1; i < n; i++) {
        lf.push([cc(i - 1, uy[i] + hj) - hw, uy[i] + hj], [cc(i, uy[i] + hj) - hw, uy[i] + hj]);
        rt.unshift([cc(i, uy[i] - hj) + hw, uy[i] - hj], [cc(i - 1, uy[i] - hj) + hw, uy[i] - hj]);
      }
      lf.push([cc(n - 1, uy[n]) - hw, uy[n]]); rt.unshift([cc(n - 1, uy[n]) + hw, uy[n]]);
      const zx = Math.min(x1, x2) - 0.06 * m, zw = Math.abs(x1 - x2) + 0.12 * m;
      an(add(`left:${r1(zx)}px;top:0;width:${r1(zw)}px;height:${H}px`, `<svg width="100%" height="100%" viewBox="${r1(zx)} 0 ${r1(zw)} ${H}" overflow="visible">`
        + `<path d="${d(lf.concat(rt))}" fill="#fff" stroke="${INK}" stroke-width="${r1(0.016 * m)}" stroke-linejoin="round" paint-order="stroke"/></svg>`, true, 'z'),
        [{ opacity: 0 }, { opacity: 0, offset: L / (L + 60) }, { opacity: 1, offset: L / (L + 60) }, { opacity: 1, offset: (L + 40) / (L + 60), easing: 'ease-in' }, { opacity: 0 }], L + 60, 0);
      // Ten chunky sparks fly up and down, away from the names. Each is its own small layer, far cheaper to move than one stage-sized layer.
      const sz = m / 220, tp = [];
      [-140, -115, -92, -68, -42, 40, 66, 90, 114, 140].forEach((g, i) => {
        const r0 = (48 + (i % 3) * 5) * sz, ln = 30 + (i % 2) * 8, w = (ln + 6) * sz, h = 20 * sz;
        const el = tp[i % 2] ? stage.insertBefore(tp[i % 2].cloneNode(true), tp[i % 2]) : (tp[i % 2] = add(`left:${r1(cx)}px;top:${r1(cy)}px;width:${r1(w)}px;height:${r1(h)}px;margin-top:${r1(-h / 2)}px;transform-origin:0 50%`,
          `<svg width="100%" height="100%" viewBox="-3 -10 ${ln + 6} 20"><path d="M0 0L10 7 ${ln} 0 10-7Z" fill="${i % 2 ? '#fff' : '#ffd21a'}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`, true));
        const t = (r, k) => `rotate(${g}deg) translateX(${r1(r0 * r)}px) scale(${k})`;
        an(el, [{ transform: t(0.5, 0.6), opacity: 0 }, { transform: t(0.5, 0.6), opacity: 1, offset: 0.001, easing: 'cubic-bezier(.2,.8,.3,1)' }, { transform: t(1.25, 1), opacity: 1, offset: 0.4, easing: 'cubic-bezier(.5,0,1,1)' },
          { transform: t(2.2, 1.3), opacity: 1, offset: 0.85 }, { transform: t(2.5, 1.4), opacity: 0 }], quick ? 220 : 300, L);
      });
      return A;
    },
  });
})();
