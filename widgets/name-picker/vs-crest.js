// Crest: an arena badge split red and blue by a bolt, with a gold rim, a star, and chrome slab-italic VS letters.
// A look for the Name Picker's Versus, one of five (see style-versus.js). It registers itself as 'crest' with
// NamePicker.look(). The emblem's API: the comment at the top of index.html.
(() => {
  const f = v => Math.round(v * 10) / 10;
  const R = Math.PI / 180, K = Math.tan(12 * R), KY = 1.1;
  const d = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
  // Place a glyph: scale it, stretch it a little taller, move it, then lean it like italics.
  const place = (pts, s, tx, ty) => pts.map(([x, y]) => { const Y = y * s * KY + ty; return [x * s + tx - Y * K, Y]; });
  // Shrink a polygon by t on every side.
  const inset = (pts, t) => {
    const m = pts.length, cx = pts.reduce((a, p) => a + p[0], 0) / m, cy = pts.reduce((a, p) => a + p[1], 0) / m;
    const L = pts.map((a, i) => {
      const b = pts[(i + 1) % m], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      let nx = -dy / l, ny = dx / l; if (nx * (cx - a[0]) + ny * (cy - a[1]) < 0) { nx = -nx; ny = -ny; }
      return [a[0] + nx * t, a[1] + ny * t, dx, dy];
    });
    return pts.map((_, i) => {
      const p = L[(i - 1 + m) % m], q = L[i], c = p[2] * q[3] - p[3] * q[2];
      const u = ((q[0] - p[0]) * q[3] - (q[1] - p[1]) * q[2]) / c;
      return [p[0] + p[2] * u, p[1] + p[3] * u];
    });
  };
  const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];

  // Slab V with flared serifs, and a slab S with short barbs and open mouths.
  const V = [[-58, -50], [-17, -50], [0, 0], [17, -50], [58, -50], [49, -38], [46, -38], [12, 50], [-12, 50], [-46, -38], [-49, -38]];
  const S = [[-32, -50], [46, -50], [46, -27], [36, -32], [-20, -32], [-20, -9], [32, -9], [46, 5], [46, 36], [32, 50], [-46, 50], [-46, 27], [-36, 32], [20, 32], [20, 9], [-32, 9], [-46, -5], [-46, -36]];
  // A tall shield that narrows toward the letters, so they break out past both edges.
  const SH = [[-84, -80], [-60, -102], [-22, -102], [0, -114], [22, -102], [60, -102], [84, -80], [80, 22], [0, 118], [-80, 22]];
  const shield = d(SH), bevel = d(inset(SH, 2.5)), rim = d(inset(SH, 10)), panel = d(inset(SH, 12.5));
  const glyphs = s => [d(place(V, s, -49, -2)), d(place(S, s, 44, -2))];
  const BIG = glyphs(.9), SMALL = glyphs(1.04);
  // The chrome runs top to bottom of the big letters, and its dark seam sits just below the middle.
  const G0 = -2 - 45 * KY, G1 = -2 + 45 * KY, SY = f(G0 + (G1 - G0) * .69);
  // The split between the sides: a bolt that zigs once above the letters and once below.
  const Z = [[62, -200], [32, -120], [10, -76], [22, -73], [2, -20], [8, -18], [-12, 64], [-1, 67], [-28, 122], [-60, 200]];
  const left = d([[-200, -200], ...Z, [-200, 200]]), right = d([[200, -200], [200, 200], ...Z.slice().reverse()]);
  const bolt = 'M' + Z.map(p => p.join(' ')).join('L');
  const seam = `M-140 ${SY}H140V${f(SY + 4)}H-140Z`;
  const star = d(Array.from({ length: 10 }, (_, i) => polar((i * 36 - 90) * R, i % 2 ? 7.6 : 18)).map(([x, y]) => [x, y - 106]));
  // A plus-shaped glint: four long points on the axes.
  // The shock rings are the shield's outline, open at the sides, so they fly up and down and never pass behind a name.
  const arcs = 'M-82.6 -45' + SH.slice(0, 7).map(p => 'L' + p.join(' ')).join('') + 'L82.6 -45M56.7 50L0 118L-56.7 50';
  const twinkle = d(Array.from({ length: 8 }, (_, i) => polar(i * 45 * R, i % 2 ? 3.6 : 22)));
  // The burst, drawn at its full spread in crest units. Rays and sparks fly up and down, away from the names.
  const BX = 210, BY = 310;
  const rays = Array.from({ length: 16 }, (_, i) => (i * 22.5 + 6) * R).filter(b => Math.abs(Math.sin(b)) >= .36)
    .map((b, i) => { const r2 = Math.min(i % 2 ? 230 : 290, 196 / Math.abs(Math.cos(b))), w = 3 * R; return d([polar(b, 40), polar(b - w, r2), polar(b + w, r2)]); }).join('');
  const sparks = [-140, -117, -94, -70, -46, 44, 68, 92, 115, 138].map((g, i) => {
    const b = g * R, r = 196 + (i % 3) * 20, l = 24 + (i % 2) * 14, [c, s] = polar(b, 1);
    return d([[c * r, s * r], [c * (r + l / 2) - s * 5, s * (r + l / 2) + c * 5], [c * (r + l), s * (r + l)], [c * (r + l / 2) + s * 5, s * (r + l / 2) - c * 5]]);
  }).join('');

  const PAL = {
    final: { ink: '#111827', red: ['#f45a4a', '#d9302a', '#a3181b'], blue: ['#4c93ff', '#2563eb', '#1a3fb0'], deep: ['#8e1b1b', '#1e3a8a'],
      rim: ['#fffbe8', '#fcd34d', '#e08a0b', '#7c2d12', '#fbbf24', '#fff4c2', '#b45309'],
      chrome: ['#ffffff', '#eef5fc', '#aebdd0', '#27354a', '#7d8da5', '#f4f7fb'], bolt: '#facc15', core: '#fff', star: '#fde047' },
    waiting: { ink: '#4b5563', red: ['#ecd0c2', '#c9a08f', '#9a7465'], blue: ['#c9dcf0', '#93afcf', '#647e9f'], deep: ['#86685c', '#56698a'],
      rim: ['#ffffff', '#eceef1', '#c9ced6', '#6b7280', '#d1d5db', '#f8fafc', '#9ca3af'],
      chrome: ['#ffffff', '#f8fafc', '#e2e5ea', '#9ca3af', '#cfd4db', '#f8fafc'], bolt: '#d6dae0', core: '#f3f4f6', star: '#e5e7eb' }
  };
  const stops = (c, o, a = []) => c.map((s, i) => `<stop offset="${o[i]}" stop-color="${s}"${a[i] == null ? '' : ` stop-opacity="${a[i]}"`}/>`).join('');
  const grad = (id, c, o, x1, y1, x2, y2) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">${stops(c, o)}</linearGradient>`;
  const uid = () => 'cr' + Math.random().toString(36).slice(2, 8) + '_';

  // The chrome letters: a side-colored extrusion, the ink outline, and the chrome face with its seam.
  const letters = (p, i, small) => {
    const [gv, gs] = small ? SMALL : BIG, w = small ? 6 : 4, u = s => `url(#${i}${s})`;
    const ex = small ? '' : `<g transform="translate(4.5 4)"><path d="${gv + gs}" fill="${p.ink}" stroke="${p.ink}" stroke-width="${2 * w + 3}" stroke-linejoin="round"/>
<path d="${gv}" fill="${p.deep[0]}" stroke="${p.deep[0]}" stroke-width="${2 * w - 1.5}" stroke-linejoin="round"/><path d="${gs}" fill="${p.deep[1]}" stroke="${p.deep[1]}" stroke-width="${2 * w - 1.5}" stroke-linejoin="round"/></g>`;
    return `<defs>${grad(i + 'c', p.chrome, [0, .3, .66, .715, .82, 1], 0, f(G0), 0, f(G1))}<clipPath id="${i}k"><path clip-rule="evenodd" d="M-200 -200H200V200H-200Z${seam}"/></clipPath></defs>
${ex}<path d="${gv + gs}" fill="${p.ink}" stroke="${p.ink}" stroke-width="${2 * w}" stroke-linejoin="round"/>
<path d="${gv + gs}" fill="${u('c')}" clip-path="${u('k')}"/>`;
  };

  const SIZE = .62, ASPECT = 250 / 256;
  // Two timelines in ms: the full slam and the quick one. H is the moment of impact.
  const FULL = { T: 880, H: 200 }, QUICK = { T: 480, H: 110 };
  const run = (el, T, frames) => el.animate(frames.map(([t, k]) => Object.assign({ offset: Math.min(1, Math.max(0, t / T)) }, k)), { duration: T, fill: 'both' });
  // When an animation ends, it lets go of what it held. Listeners, so a caller's own onfinish can't undo this.
  const after = (a, fn) => { a.addEventListener('finish', fn); a.addEventListener('cancel', fn); };
  const release = a => after(a, () => a.effect.updateTiming({ fill: 'none' }));
  const svg = (vb, body, extra = '') => `<svg viewBox="${vb}" width="100%" height="100%" style="display:block;overflow:visible" ${extra}>${body}</svg>`;
  // A layer that lives only during the slam: removed when its animation ends or is cancelled.
  const layer = (out, parent, before, T, css, html, frames) => {
    const e = document.createElement('div'); e.style.cssText = 'position:absolute;pointer-events:none;' + css; e.innerHTML = html || '';
    before && before.parentNode === parent ? parent.insertBefore(e, before) : parent.appendChild(e);
    const a = run(e, T, frames); after(a, () => e.remove()); out.push(a);
  };

  NamePicker.look('crest', {
    size: SIZE,
    aspect: ASPECT,
    // At rest its art reaches past the bottom of the box by 0.01 of its height (measured, light and dark).
    reach: 0.01,
    hit: { normal: FULL.H, quick: QUICK.H },
    markup(state, { dark, h } = {}) {
      const p = PAL[state === 'waiting' ? 'waiting' : 'final'], i = uid(), u = s => `url(#${i}${s})`;
      const small = h && h < 90;
      // The keyline matches the board's slash: white on light boards, ink on dark ones.
      const key = state === 'waiting' ? '#f8fafc' : dark ? '#111827' : '#fff';
      return `<svg class="cr-svg${dark && state !== 'waiting' ? ' cr-dark' : ''}" viewBox="-125 -128 250 256" width="100%" height="100%" overflow="visible" aria-hidden="true" style="display:block" xmlns="http://www.w3.org/2000/svg"><defs>
${grad(i + 'r', p.red, [0, .5, 1], 0, -100, 0, 110)}${grad(i + 'b', p.blue, [0, .5, 1], 0, -100, 0, 110)}
${grad(i + 'g', p.rim, [0, .2, .44, .5, .56, .8, 1], -50, -112, 50, 118)}
<clipPath id="${i}p"><path d="${panel}"/></clipPath>
</defs>
<path d="${shield}" transform="translate(4 7)" fill="#000" opacity=".2" stroke="#000" stroke-width="17" stroke-linejoin="round"/>
<path d="${shield}" fill="${key}" stroke="${key}" stroke-width="17" stroke-linejoin="round"/>
<path d="${shield}" fill="${p.ink}" stroke="${p.ink}" stroke-width="10" stroke-linejoin="round"/>
<path d="${shield}" fill="${u('g')}"/>
${small ? '' : `<path d="${bevel}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>`}
<path d="${rim}" fill="${p.ink}"/>
<g clip-path="${u('p')}"><path d="${left}" fill="${u('r')}"/><path d="${right}" fill="${u('b')}"/>
${small ? '' : '<path d="M-200 -200H200V-46L-200 -14Z" fill="#fff" opacity=".12"/>'}
${small ? '' : `<path d="${bolt}" fill="none" stroke="${p.bolt}" stroke-width="6.5" stroke-linejoin="miter"/><path d="${bolt}" fill="none" stroke="${p.core}" stroke-width="2.2" stroke-linejoin="miter"/>`}</g>
${small ? '' : `<path d="${star}" fill="${p.star}" stroke="${p.ink}" stroke-width="4.5" stroke-linejoin="round" paint-order="stroke"/>`}
${letters(p, i, small)}
</svg>`;
    },
    // The crest drops onto the board from above, tilted, with its shadow far below it. It lands flat at H and rattles.
    slam(box, { quick } = {}) {
      const { T, H } = quick ? QUICK : FULL, out = [];
      const bh = box.offsetHeight || 100, bw = box.offsetWidth || bh, y0 = -((box.offsetTop || bh) + bh * .7);
      const tf = (y, r, sx, sy = sx) => ({ transform: `translate(-50%,-50%) translate(0px,${f(y)}px) rotate(${r}deg) scale(${sx},${sy})` });
      // Squash with the bottom planted on the board, then jolt up and down by a share of the crest's height.
      const sq = (sx, sy, r = 0, y = 0) => tf((1 - sy) * bh / 2 + y * bh, r, sx, sy);
      const fall = { easing: 'cubic-bezier(.45,.05,.85,.45)' };
      // It starts just above the board, waits a beat, then comes down in one fast drop.
      const t0 = quick ? 10 : 50, t1 = t0 + 1;
      const fx = run(box, T, quick
        ? [[0, { ...tf(y0, -9, 1.26), opacity: 0 }], [t0, { ...tf(y0, -9, 1.26), opacity: 0 }], [t1, { ...tf(y0, -9, 1.26), opacity: 1, ...fall }], [H, { ...sq(1, 1), opacity: 1 }],
          [H + 28, sq(1.02, .92, .8, .015)], [H + 62, sq(.995, 1.02, -.5, -.02)], [H + 100, sq(1.004, .99, .3, .008)], [H + 150, sq(1, 1.004, 0, -.003)], [H + 200, sq(1, 1)], [T, sq(1, 1)]]
        : [[0, { ...tf(y0, -13, 1.3), opacity: 0 }], [t0, { ...tf(y0, -13, 1.3), opacity: 0 }], [t1, { ...tf(y0, -13, 1.3), opacity: 1, ...fall }], [H, { ...sq(1, 1), opacity: 1 }],
          [H + 35, sq(1.02, .91, 1, .02)], [H + 75, sq(.995, 1.025, -.6, -.03)], [H + 115, sq(1.006, .99, .4, .014)], [H + 160, sq(.999, 1.006, -.2, -.007)], [H + 215, sq(1.002, .998, 0, .002)], [H + 290, sq(1, 1)], [T, sq(1, 1)]]);
      // Once it lands for good, the box holds no animated transform.
      release(fx); out.push(fx);
      // Its own shadow rides under it, faint and far off while it's high, darker and tucked in as it lands.
      const g = uid(), sh = (x, y, s) => ({ transform: `translate(${f(x * bw / 250)}px,${f(y * bh / 256)}px) scale(${s})` });
      layer(out, box, box.firstChild, T, 'inset:0;z-index:-1', svg('-125 -128 250 256', `<path d="${shield}" fill="#000" stroke="#000" stroke-width="17" stroke-linejoin="round"/>`),
        [[0, { opacity: 0, ...sh(30, 46, 1.06) }], [t0, { opacity: 0, ...sh(30, 46, 1.06), ...fall }], [H, { opacity: .24, ...sh(4, 7, 1) }], [H + 1, { opacity: 0, ...sh(4, 7, 1) }], [T, { opacity: 0, ...sh(4, 7, 1) }]]);
      // On contact the rim rings white-hot, then rings once more. The star keeps its ink, and the letters stay in front.
      // On a dark board the dark keyline stays, so the fading rim never turns grey.
      const kw = box.querySelector('.cr-dark') ? 10 : 17;
      if (bh >= 90) layer(out, box, null, T, 'inset:0', svg('-125 -128 250 256', `<path d="${shield + panel}" fill="#fff" fill-rule="evenodd"/><path d="${shield}" fill="none" stroke="#fff" stroke-width="${kw}" stroke-linejoin="round"/><path d="${star}" fill="#fff7cc" stroke="#111827" stroke-width="4.5" stroke-linejoin="round" paint-order="stroke"/>${letters(PAL.final, g, false)}`),
        [[0, { opacity: 0 }], [H - 1, { opacity: 0 }], [H, { opacity: 1 }], [H + (quick ? 45 : 70), { opacity: 0 }], [H + (quick ? 80 : 120), { opacity: .6 }], [H + (quick ? 170 : 250), { opacity: 0 }], [T, { opacity: 0 }]]);
      // Glints pop on the V and the S together, then on the star.
      const tw = quick ? [[-66, -42, 60], [62, 30, 60], [0, -106, 150]] : [[-66, -42, 240], [62, 30, 240], [0, -106, 370]], L = quick ? 180 : 240;
      for (const [x, y, t] of tw) {
        layer(out, box, null, T, `left:${f((x + 125) / 2.5 - 10)}%;top:${f((y + 128) / 2.56 - 9.77)}%;width:20%;height:19.53%`, svg('-25 -25 50 50', `<path d="${twinkle}" fill="#fff"/>`),
          [[0, { opacity: 0, transform: 'rotate(-45deg) scale(0)' }], [H + t, { opacity: 0, transform: 'rotate(-45deg) scale(0)', easing: 'cubic-bezier(.2,.8,.4,1)' }],
            [H + t + L * .4, { opacity: 1, transform: 'rotate(0deg) scale(1.1)', easing: 'cubic-bezier(.5,0,.8,.4)' }], [H + t + L, { opacity: 1, transform: 'rotate(45deg) scale(0)' }], [T, { opacity: 0, transform: 'rotate(45deg) scale(0)' }]]);
      }
      return out;
    },
    // Each side of the board flares its own color, red then blue. A burst of rays, shock rings, and sparks spreads from the crest.
    impact(stage, { quick } = {}) {
      const { T, H } = quick ? QUICK : FULL, out = [];
      const W = stage.clientWidth || 1, Ht = stage.clientHeight || 1, m = Math.min(W, Ht);
      const em = stage.querySelector('.cr-svg'), bx = em && em.parentElement && em.parentElement.parentElement === stage ? em.parentElement : null;
      const cx = bx ? bx.offsetLeft : W / 2, cy = bx ? bx.offsetTop : Ht / 2, u = ((bx && bx.offsetWidth) || m * SIZE * ASPECT) / 250;
      // The board's own slash, read from its clip-path.
      let xt = .57 * W, xb = .43 * W;
      const cut = stage.querySelector('.vs-cut'), cp = cut && getComputedStyle(cut).clipPath, mt = cp && /polygon\(([^)]*)\)/.exec(cp);
      if (mt) {
        const P = mt[1].split(',').map(s => s.trim().split(/\s+/).map((v, i) => parseFloat(v) * (/%$/.test(v) ? (i ? Ht : W) / 100 : 1)));
        const tp = P.filter(p => p[1] < Ht / 2), bt = P.filter(p => p[1] >= Ht / 2), av = a => a.reduce((s, p) => s + p[0], 0) / a.length;
        if (tp.length && bt.length && P.every(p => p.length === 2 && p.every(isFinite))) { xt = av(tp); xb = av(bt); }
      }
      // Everything goes under the slash, the names, and the crest.
      // With no slash, they go under the first child that holds text, which is a name.
      const at = (cut && cut.parentNode === stage ? cut : [...stage.children].find(c => c.textContent.trim()) || bx) || stage.firstChild;
      const add = (css, html, frames) => layer(out, stage, at, T, css, html, frames);
      const px = v => f(v) + 'px';
      // Each side flares its own color, cut to its side's shape and lit from the crest, with a warm or ice glow at its heart.
      // It fades out before the board's far edges, which keeps it cheap to draw.
      const B = m * .72, sides = [[[[0, 0], [xt, 0], [xb, Ht], [0, Ht]], ['#fff3c4', '#ffc83a', '#ff8a1a', '#ff5a1a', '#ff6a2a']],
        [[[xt, 0], [W, 0], [W, Ht], [xb, Ht]], ['#e6fbff', '#5ee0f5', '#0ab4d6', '#0284c7', '#2b7de9']]];
      const flare = (parts, t0, len) => {
        const xs = parts.flatMap(([poly]) => poly.map(p => p[0])), x0 = Math.max(Math.min(...xs), cx - B), x1 = Math.min(Math.max(...xs), cx + B), g = uid();
        const grads = parts.map(([, cs], k) => `<radialGradient id="${g + k}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(B)}">${stops(cs, [0, .16, .36, .62, 1], [1, 1, 1, .9, 0])}</radialGradient>`).join('');
        add(`overflow:hidden;left:${px(x0)};top:0;width:${px(x1 - x0)};height:${px(Ht)}`, svg(`${f(x0)} 0 ${f(x1 - x0)} ${f(Ht)}`,
          `<defs>${grads}</defs>` + parts.map(([poly], k) => `<polygon points="${poly.map(p => p.map(f).join(',')).join(' ')}" fill="url(#${g + k})"/>`).join(''), 'preserveAspectRatio="none"'),
          [[0, { opacity: 0 }], [t0 - 1, { opacity: 0 }], [t0, { opacity: .7, easing: 'cubic-bezier(.3,.6,.5,1)' }], [t0 + len, { opacity: 0 }], [T, { opacity: 0 }]]);
      };
      // Red flares first, then blue. Quick mode lights both at once, in one layer.
      if (quick) flare(sides, H, 170); else { flare([sides[0]], H, 200); flare([sides[1]], H + 60, 200); }
      // One burst layer: rays, two shock rings, and sparks, all spreading together. Warm on the red side and ice on the blue, split along the slash.
      const g = uid(), sl = Math.hypot(Ht, xb - xt), nx = Ht / sl * 14, ny = (xt - xb) / sl * 14, ox = (xt + (xb - xt) * cy / Ht - cx) / u;
      const side = (id, a, b) => `<linearGradient id="${g + id}" gradientUnits="userSpaceOnUse" x1="${f(ox - nx)}" y1="${f(-ny)}" x2="${f(ox + nx)}" y2="${f(ny)}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
      add(`left:${px(cx - BX * u)};top:${px(cy - BY * u)};width:${px(2 * BX * u)};height:${px(2 * BY * u)}`, svg(`${-BX} ${-BY} ${2 * BX} ${2 * BY}`,
        `<defs>${side('a', '#ffe7a3', '#c9f6ff')}${side('b', '#ffd84d', '#a5ecff')}</defs>
<path d="${rays}" fill="url(#${g}a)" opacity=".6"/><g fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="${arcs}" transform="scale(2.02)" stroke="url(#${g}b)" stroke-width="9"/><path d="${arcs}" transform="scale(1.66)" stroke="url(#${g}a)" stroke-width="5"/></g>
<path d="${sparks}" fill="#fff3a6" stroke="#ff9d1c" stroke-width="2.5"/>`),
        [[0, { opacity: 0, transform: 'scale(.5)' }], [H - 1, { opacity: 0, transform: 'scale(.5)' }], [H, { opacity: 1, transform: 'scale(.5)', easing: 'cubic-bezier(.15,.75,.35,1)' }],
          [H + (quick ? 150 : 200), { opacity: .85, transform: 'scale(.88)', easing: 'linear' }], [H + (quick ? 270 : 380), { opacity: 0, transform: 'scale(1)' }], [T, { opacity: 0, transform: 'scale(1)' }]]);
      return out;
    }
  });
})();
