// Forged: two heavy steel plates, chamfered and beveled, rim lit hot from the red side and cold from the blue side.
// The V swings in from the red side and the S from the blue side, leaning into each other. They land like a hammer on
// an anvil: white-hot steel, a hard stop, a knock between the plates, a jolt, and a fountain of sparks.
// A look for the Name Picker's Versus, one of five (see style-versus.js). It registers itself as 'forged' with
// NamePicker.look(). The emblem's API: the comment at the top of index.html.
(() => {
  const SK = Math.tan(12 * Math.PI / 180);
  const f = v => Math.round(v * 10) / 10, g = v => Math.round(v * 1000) / 1000, clamp = v => Math.min(1, Math.max(0, v));
  const D = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
  const at = (a, i) => a[(i + a.length) % a.length];
  // Cut each corner by c units along both edges.
  const chamfer = (pts, cuts) => pts.flatMap((p, i) => {
    const c = cuts[i]; if (!c) return [p];
    const to = q => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); return [p[0] + dx / L * c, p[1] + dy / L * c]; };
    return [to(at(pts, i - 1)), to(at(pts, i + 1))];
  });
  const unit = (x, y) => { const L = Math.hypot(x, y); return [x / L, y / L]; };
  // Inset a clockwise (y down) polygon by d, mitered.
  const inset = (pts, d) => pts.map((p, i) => {
    const a = at(pts, i - 1), b = at(pts, i + 1);
    const n1 = unit(a[1] - p[1], p[0] - a[0]), n2 = unit(p[1] - b[1], b[0] - p[0]);
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
  // Lean forward like the names, then place.
  const move = (pts, dx, dy) => pts.map(([x, y]) => [x - y * SK + dx, y + dy]);

  // The letters, 150 units tall, in a 264 x 200 box centered on 0,0.
  const VX = -58, VY = -5, SX = 48, SY = 5;
  const V = move(chamfer([[-52, -75], [-14, -75], [0, -20], [14, -75], [52, -75], [13, 75], [-13, 75]], [10, 5, 0, 5, 10, 6, 6]), VX, VY);
  // A squared S: hooked ends, big cuts on its top left and bottom right, and slanted shoulders on its spine.
  // It stands clear of the V, so its top left cut always shows and it can only read as an S.
  const S = move(chamfer([[-44, -75], [44, -75], [44, -39], [26, -47], [-14, -47], [-14, -14], [44, -14],
    [44, 75], [-44, 75], [-44, 39], [-26, 47], [14, 47], [14, 14], [-44, 14]],
  [30, 10, 0, 0, 6, 0, 24, 30, 10, 0, 0, 6, 0, 24]), SX, SY);
  const BEV = 8;
  const cen = P => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
  const CV = cen(V), CS = cen(S);
  const BOT = P => Math.max(...P.map(p => p[1]));
  const GL = [f(S[2][0] - 4), f(S[2][1] + 3)]; // the glint, on the S's top right corner
  // Each plate's own part of the box, in units, with room for its rim and its lean.
  const CROP = { v: [-118, 140], s: [-30, 154] };

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  // Facet colors by facing: right, down-right, down, down-left, left, up-left, up, up-right.
  const PAL = {
    final: ['#4cc6ff', '#1d4ed8', '#273349', '#c2410c', '#ff8a1e', '#ffd9a8', '#ffffff', '#d6f1ff'].map(hex),
    waiting: ['#b7c2cf', '#6b7686', '#3b4250', '#7a716d', '#c9bfba', '#ece8e5', '#fbfbfc', '#e6eaef'].map(hex),
    hot: ['#ffb347', '#ff7a14', '#c2410c', '#ff7a14', '#ffb347', '#fff3c4', '#ffffff', '#fff3c4'].map(hex)
  };
  const shade = (pal, nx, ny) => {
    // A sharp blend between neighbors, so no facet lands on a muddy half-and-half of copper and shadow.
    const a = ((Math.atan2(ny, nx) * 180 / Math.PI) + 360) % 360 / 45, lo = Math.floor(a), t = clamp((a - lo - .42) / .16);
    const c0 = pal[lo % 8], c1 = pal[(lo + 1) % 8];
    return '#' + c0.map((v, i) => Math.round(v + (c1[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const facets = (O, pal) => {
    const I = inset(O, BEV);
    return O.map((p, i) => {
      const q = at(O, i + 1), nn = unit(q[1] - p[1], p[0] - q[0]);
      return `<path d="${D([p, q, at(I, i + 1), I[i]])}" fill="${shade(pal, nn[0], nn[1])}"/>`;
    }).join('');
  };
  const stops = s => s.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  const INK = '#111827';
  // The white-hot face: white on top, an orange horizon, and gold below.
  const GH = [[0, '#ffffff'], [.34, '#fffaf0'], [.49, '#ffeeb8'], [.5, '#ff8a1e'], [.57, '#ffa940'], [.82, '#ffd884'], [1, '#fff3d0']];

  // One emblem, or one part of it for the slam: a plate ('v', 's'), its white-hot facets and face ('hv', 'hs'),
  // or the glint ('g'). vb crops a part to its own corner of the box.
  const build = (state, dark, h, part, vb) => {
    const w = state === 'waiting', big = h >= 90, id = 'vsfg' + Math.random().toString(36).slice(2, 8) + '-';
    const pal = PAL[w ? 'waiting' : 'final'];
    const rimV = w ? '#c3cad3' : '#ffb347', rimS = w ? '#c3cad3' : '#79d9ff';
    const depth = w ? '#4b5260' : dark ? '#3a4458' : INK, ink = w ? '#4b5260' : INK;
    const gV = w ? [[0, '#fbfbfc'], [.49, '#d5d9df'], [.5, '#8b929c'], [.8, '#d4d8de'], [1, '#eef0f2']]
      : [[0, '#ffffff'], [.34, '#edf1f6'], [.49, '#bcc5d1'], [.5, '#4d5566'], [.57, '#c2703a'], [.82, '#ffc890'], [1, '#fff3e4']];
    const gS = w ? gV : [[0, '#ffffff'], [.34, '#edf1f6'], [.49, '#bcc5d1'], [.5, '#4d5566'], [.57, '#3f72b8'], [.82, '#a6dcff'], [1, '#eefaff']];
    const grad = (k, gr) => `<linearGradient id="${id}${k}" gradientUnits="userSpaceOnUse" x1="0" y1="-85" x2="0" y2="85">${stops(gr)}</linearGradient>`;
    const all = !part, want = k => all || part === k;
    let defs = '', body = '';
    // A steel plate: its rim light, dark edge and thickness, bevel facets (big sizes only), and the polished face.
    const plate = (k, O, rim) => {
      defs += grad(k + 'g', k === 'v' ? gV : gS) + `<path id="${id}${k}" d="${D(O)}"/>`;
      const th = big ? `<use href="#${id}${k}" transform="translate(3.5 5.5)"/>` : '';
      return `<g stroke-linejoin="round"><g fill="${rim}" stroke="${rim}" stroke-width="${big ? 15 : 14}">${th}<use href="#${id}${k}"/></g>`
        + `<g fill="${depth}" stroke="${ink}" stroke-width="${big ? 10 : 11}">${th}</g><use href="#${id}${k}" fill="${ink}" stroke="${ink}" stroke-width="${big ? 10 : 11}"/></g>`
        + (big ? `${facets(O, pal)}<path d="${D(inset(O, BEV))}" fill="url(#${id}${k}g)"/>` : `<path d="${D(inset(O, 2))}" fill="url(#${id}${k}g)"/>`);
    };
    if (want('s')) body += plate('s', S, rimS);
    if (want('v')) body += plate('v', V, rimV);
    // The same facets and face, white hot. The rim and the ink edge stay, so every bevel line still shows.
    const O = { hv: V, hs: S }[part];
    if (O) { defs += grad('k', GH); body = (big ? facets(O, PAL.hot) : '') + `<path d="${D(inset(O, big ? BEV : 2))}" fill="url(#${id}k)"/>`; }
    if (big && !w && want('g')) {
      defs += `<radialGradient id="${id}h"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fff6d8" stop-opacity=".8"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>`;
      body += `<g transform="translate(${GL[0]} ${GL[1]})"><circle r="17" fill="url(#${id}h)"/><path d="M0-30L2.6-2.6L30 0L2.6 2.6L0 30L-2.6 2.6L-30 0L-2.6-2.6Z" fill="#fff"/></g>`;
    }
    return `<svg class="vsfg${part ? '-p' : ''}" data-s="${w ? 'waiting' : 'final'}" data-d="${dark ? 1 : 0}" data-h="${f(h)}" viewBox="${vb || '-132 -100 264 200'}"><defs>${defs}</defs>${body}</svg>`;
  };
  // Where the box sits in its stage, in the stage's own pixels, even if the board is scaled.
  const place = (stage, box) => {
    const W = stage.clientWidth, H = stage.clientHeight, sr = stage.getBoundingClientRect();
    const k = W && sr.width ? sr.width / W : 1, r = box && box.getBoundingClientRect();
    if (!r || !r.width) return { W, H, cx: W / 2, cy: H / 2, bw: Math.min(W, H) * .66, bh: Math.min(W, H) * .5 };
    return { W, H, cx: (r.left + r.width / 2 - sr.left) / k, cy: (r.top + r.height / 2 - sr.top) / k, bw: r.width / k, bh: r.height / k };
  };

  NamePicker.look('forged', {
    size: 0.5,
    aspect: 1.32,
    hit: { normal: 260, quick: 140 },
    css: '',
    markup(state, { dark, h } = {}) { return build(state, dark, h || 200); },

    // The V falls in from the red side and the S from the blue side, leaning into each other. They snap upright as they
    // land, knock together, and settle.
    slam(box, { quick, stage } = {}) {
      const svg = box && box.querySelector('svg.vsfg');
      if (!svg) return [];
      // T: when the moving copies hand back to the finished emblem, once the glint has popped.
      const T = quick ? 450 : 700, hit = quick ? 140 : 260, ms = quick ? .7 : 1, out = [];
      const st = svg.getAttribute('data-s'), dark = svg.getAttribute('data-d') === '1';
      // The copies use the same detail as the markup they hand back to.
      const bh = box.offsetHeight || 200, dh = +svg.getAttribute('data-h') || bh;
      const host = stage || box.parentElement, P = host ? place(host, box) : {};
      const H = P.H || bh * 2, cy = P.H ? P.cy : H / 2, bw = P.bw || bh * 1.32;
      const added = [];
      const clean = () => { added.forEach(d => d.remove()); added.length = 0; };
      // The finished emblem hides while its moving copies play, and shows again on the last frame.
      const hide = svg.animate([{ opacity: 0 }, { offset: (T - 1) / T, opacity: 0 }, { offset: 1, opacity: 1 }], { duration: T, fill: 'both' });
      hide.finished.then(() => { clean(); hide.effect.updateTiming({ fill: 'none' }); }, clean);
      out.push(hide);
      const play = (e, k, dur = T, done) => {
        const a = e.animate(k, { duration: dur, fill: 'both' });
        a.addEventListener('cancel', () => { clean(); hide.cancel(); });
        if (done) a.finished.then(done, () => {});
        out.push(a); return a;
      };
      // A layer holding some parts, cropped to its own corner of the box (units ux..ux+uw, uy..uy+uh), turning around
      // ox, oy. The crop starts on a whole pixel of the box, so the copies sit on the same pixel grid as the emblem.
      const cs = getComputedStyle(box), BW = parseFloat(cs.width) || bw, BH = parseFloat(cs.height) || bh;
      const pu = Math.min(BW / 264, BH / 200) || 1, kx = (BW - 264 * pu) / 2, ky = (BH - 200 * pu) / 2, n4 = v => Math.round(v * 1e4) / 1e4;
      const layer = (parts, [ux, uw], [uy, uh], [ox, oy]) => {
        const L = Math.floor(kx + (ux + 132) * pu), Tp = Math.floor(ky + (uy + 100) * pu);
        const x0 = (L - kx) / pu - 132, y0 = (Tp - ky) / pu - 100, PW = Math.ceil((uw + ux - x0) * pu), PH = Math.ceil((uh + uy - y0) * pu), wu = PW / pu, hu = PH / pu;
        const d = document.createElement('div');
        d.style.cssText = `position:absolute;left:${L}px;top:${Tp}px;width:${PW}px;height:${PH}px;pointer-events:none;`
          + `transform-origin:${n4((ox - x0) * pu)}px ${n4((oy - y0) * pu)}px`;
        d.innerHTML = parts.map(p => build(st, dark, dh, p, `${n4(x0)} ${n4(y0)} ${n4(wu)} ${n4(hu)}`)).join('');
        [...d.children].forEach(s => s.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible');
        box.appendChild(d); added.push(d); return d;
      };
      const tr = (x, y, r, sx, sy) => `translate(${f(x)}px,${f(y)}px) rotate(${f(r)}deg) scale(${g(sx)},${g(sy)})`;
      // Start fully above the board and fall faster and faster. The side offset lasts only while the plate's bottom is
      // above the names. The lean holds until 30 ms before the hit.
      const drop = -(cy + bh * .75), clear = .3 * H - (cy + bh * .47) - 4;
      const lean = quick ? 9 : 12, lat = bw * (quick ? .18 : .28), snap = hit - 30 * ms;
      const ts = [0, .2, .3, .38, .46, .53, .6, .66, .72, .78, .84, snap / hit, .94, 1];
      [['s', S, CS, 1], ['v', V, CV, -1]].forEach(([k, O, c, d]) => {
        const L = layer(st === 'waiting' ? [k] : [k, 'h' + k], CROP[k], [-100, 200], [c[0], BOT(O)]), hot = L.children[1];
        // d is -1 for the V (left) and 1 for the S (right). Inward means the V turns clockwise and the S counterclockwise.
        const inward = a => -d * a;
        const keys = ts.map(p => {
          const t = hit * p, y = drop * (1 - Math.pow(p, 1.8)), u = Math.pow(clamp((clear - y) / (clear - drop)), .8);
          const r = t <= snap ? lean : lean * (hit - t) / (hit - snap);
          return { offset: t / T, transform: tr(d * lat * u, y, inward(r), 1, 1) };
        });
        // The hard stop: squash straight down, knock tops together, rock once, and settle. Nothing grows sideways.
        play(L, keys.concat([
          { offset: (hit + 30 * ms) / T, transform: tr(0, 0, inward(1.5), 1, .88) },
          { offset: (hit + 80 * ms) / T, transform: tr(0, 0, inward(3), 1, .97) },
          { offset: (hit + 135 * ms) / T, transform: tr(0, 0, inward(-.4), 1, 1.02) },
          { offset: (hit + 185 * ms) / T, transform: tr(0, 0, inward(.7), 1, 1) },
          { offset: (hit + 235 * ms) / T, transform: tr(0, 0, 0, 1, 1) },
          { offset: (T - 1) / T, transform: tr(0, 0, 0, 1, 1), opacity: 1 },
          { offset: 1, transform: tr(0, 0, 0, 1, 1), opacity: 0 }]));
        // White hot on impact, then it cools back to steel. It goes away when it is done.
        if (hot) {
          const HT = hit + 230 * ms;
          play(hot, [{ opacity: 0 }, { offset: (hit - 1) / HT, opacity: 0 }, { offset: hit / HT, opacity: 1 },
            { offset: (hit + 40 * ms) / HT, opacity: 1, easing: 'cubic-bezier(.4,0,.7,1)' }, { offset: 1, opacity: 0 }], HT, () => hot.remove());
        }
      });
      // The glint pops once the plates have cooled.
      if (dh >= 90 && st !== 'waiting') {
        const gl = layer(['g'], [GL[0] - 54, 108], [GL[1] - 54, 108], GL), g0 = quick ? T - 125 : T - 200, gp = quick ? 55 : 80, gs = quick ? 100 : 150;
        play(gl, [{ transform: 'scale(0) rotate(-90deg)', opacity: 0 }, { offset: g0 / T, transform: 'scale(0) rotate(-90deg)', opacity: 0, easing: 'ease-out' },
          { offset: (g0 + gp) / T, transform: 'scale(1.7) rotate(0deg)', opacity: 1, easing: 'ease-in-out' }, { offset: (g0 + gs) / T, transform: 'scale(1) rotate(0deg)', opacity: 1 },
          { offset: (T - 1) / T, transform: 'scale(1) rotate(0deg)', opacity: 1 }, { offset: 1, transform: 'scale(1) rotate(0deg)', opacity: 0 }]);
      }
      return out;
    },

    // The clang: the board jolts down, heat flares along the floor in two colors, and sparks fountain up from the anvil.
    impact(stage, { quick } = {}) {
      if (!stage) return [];
      const svg = stage.querySelector('svg.vsfg'), box = svg && svg.parentElement;
      // A board that is not laid out yet still gets the full set of animations, at a nominal size.
      const P = place(stage, box), W = P.W || 300, H = P.H || 200, cx = P.W ? P.cx : 150, cy = P.H ? P.cy : 100, bw = P.bw || 132, bh = P.bh || 100;
      const hit = quick ? 140 : 260, ms = quick ? .7 : 1, out = [], m = Math.min(W, H);
      // Every effect goes under the board's slash, so the slash, the names, and the emblem stay on top.
      const cut = stage.querySelector('.vs-cut');
      const host = cut ? cut.parentNode : stage, ref = cut || [...stage.children].find(c => c === box || c.textContent.trim()) || null;
      const uid = 'vsfgx' + Math.random().toString(36).slice(2, 8);
      const add = (l, t, w, h, vb, inner, origin) => {
        const e = document.createElement('div');
        e.style.cssText = `position:absolute;pointer-events:none;opacity:0;left:${f(l)}px;top:${f(t)}px;width:${f(w)}px;height:${f(h)}px;transform-origin:${origin}`;
        e.innerHTML = `<svg width="100%" height="100%" viewBox="${vb}" style="display:block;overflow:visible">${inner}</svg>`;
        host.insertBefore(e, ref); return e;
      };
      // Each effect runs only as long as it shows, then leaves the board.
      const fx = (e, k, dur) => { const a = e.animate(k, { duration: dur, fill: 'both' }), rm = () => e.remove(); a.finished.then(rm, rm); out.push(a); return a; };
      // Keys inside a window [s, s + len] of an effect that runs dur ms; hidden before and after.
      const win = (dur, s, len, keys) => {
        const t0 = keys[0].transform || 'none', t1 = keys[keys.length - 1].transform || 'none';
        return [{ offset: 0, opacity: 0, transform: t0 }, { offset: clamp((s - 1) / dur), opacity: 0, transform: t0 }]
          .concat(keys.map(({ p, ...k }) => Object.assign({ offset: clamp((s + p * len) / dur) }, k)), [{ offset: 1, opacity: 0, transform: t1 }]);
      };

      // The jolt: the whole board drops on impact and bounces back, scaled just enough to hide its edges. A big board
      // (a full panel) moves only the emblem: a lurch of the whole panel is too much, and it costs smooth frames.
      const big = m > 700, tgt = big ? box : stage;
      if (tgt) {
        const pre = big ? ((t => t && t !== 'none' ? t + ' ' : '')(getComputedStyle(box).transform)) : '';
        const J = m * (big ? .012 : quick ? .016 : .02), sc = dy => dy && !big ? g(1 + 2 * Math.abs(dy) / H + .002) : 1;
        const jolt = [[0, 1, 0], [36, -.4, .3], [74, .15, -.15], [112, 0, 0]], JT = hit + 112 * ms, rest = pre + 'translate(0px,0px) scale(1)';
        const cam = tgt.animate([{ offset: 0, transform: rest }, { offset: (hit - 1) / JT, transform: rest }]
          .concat(jolt.map(([t, k, x]) => ({ offset: (hit + t * ms) / JT, transform: `${pre}translate(${f(x * J * .35)}px,${f(k * J)}px) scale(${sc(k * J)})`, easing: 'ease-out' }))),
        { duration: JT, fill: 'both' });
        cam.finished.then(() => cam.effect.updateTiming({ fill: 'none' }), () => {}); out.push(cam);
      }
      // Cold plates in the grey waiting state land with the jolt alone: no heat and no sparks.
      if (svg && svg.getAttribute('data-s') === 'waiting') return out;

      // The slash, read from the board: the middle of its top points and of its bottom points, in % or px.
      let sx0 = .57, sx1 = .43;
      const mt = cut && /polygon\(([^)]*)\)/.exec(getComputedStyle(cut).clipPath);
      if (mt) {
        const cw = cut.clientWidth || W, ch = cut.clientHeight || H;
        const pts = mt[1].split(',').map(s => s.trim()).filter(s => !/^(nonzero|evenodd)$/.test(s))
          .map(s => s.split(/\s+/).map((v, i) => parseFloat(v) / (/%$/.test(v) ? 100 : (i ? ch : cw))));
        const top = pts.filter(p => p[1] < .5), bot = pts.filter(p => p[1] >= .5), av = a => a.reduce((s, p) => s + p[0], 0) / a.length;
        if (top.length && bot.length && pts.every(p => p.length === 2 && p.every(isFinite))) { sx0 = av(top); sx1 = av(bot); }
      }

      // The strike, one layer, split along the slash: gold on the red side and ice on the blue side. Heat glows behind the
      // plates, a bloom flares at their feet, and a white-hot line shoots along the floor. It grows from the slash's foot,
      // so the split stays on the slash.
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const base = cy + bh * .39, gc = cy - base, gx = bw * .74, gy = bh * .68, lx = bw * .86, ly = bh * .05;
      const X = y => (sx0 + (sx1 - sx0) * (base + y) / H) * W - cx; // the slash, in the strike's own coordinates
      const sl = Math.max(-cx, -Math.max(gx, lx)), sr = Math.min(W - cx, Math.max(gx, lx)), su = Math.max(-base, gc - gy), sd = Math.min(H - base, Math.max(gc + gy, bh * .22));
      const rg = (k, c) => `<radialGradient id="${uid}${k}"><stop offset="0" stop-color="${c[0]}"/>`
        + `<stop offset=".3" stop-color="${c[1]}" stop-opacity=".92"/><stop offset=".65" stop-color="${c[2]}" stop-opacity=".5"/><stop offset="1" stop-color="${c[2]}" stop-opacity="0"/></radialGradient>`;
      const lens = (rx, ry, fill) => `<path d="M${f(-rx)} 0Q0 ${f(-2 * ry)} ${f(rx)} 0Q0 ${f(2 * ry)} ${f(-rx)} 0Z" fill="${fill}"/>`;
      const half = (k, pts, line, hot) => `<clipPath id="${uid}${k}c"><path d="M${pts}Z"/></clipPath><g clip-path="url(#${uid}${k}c)">`
        + `<ellipse cy="${f(gc)}" rx="${f(gx)}" ry="${f(gy)}" fill="url(#${uid}${k})"/><ellipse rx="${f(bw * .62)}" ry="${f(bh * .2)}" fill="url(#${uid}${k}b)"/>`
        + lens(lx, ly, line) + lens(lx * .8, ly * .42, hot) + '</g>';
      const tx = f(X(su)), bx = f(X(sd)), fx0 = X(0);
      const ST = hit + 160 * ms;
      fx(add(cx + sl, base + su, sr - sl, sd - su, `${f(sl)} ${f(su)} ${f(sr - sl)} ${f(sd - su)}`,
        `<defs>${rg('w', ['#fff6d8', '#ffd36a', '#ff8a1e'])}${rg('c', ['#effcff', '#a8ecff', '#38c8ff'])}`
        + `${rg('wb', ['#ffffff', '#ffe08a', '#ff9a1f'])}${rg('cb', ['#ffffff', '#d8f6ff', '#38c8ff'])}</defs>`
        + half('w', `${f(sl)} ${f(su)}L${tx} ${f(su)}L${bx} ${f(sd)}L${f(sl)} ${f(sd)}`, '#ffd36a', '#fff8dc') + half('c', `${tx} ${f(su)}L${f(sr)} ${f(su)}L${f(sr)} ${f(sd)}L${bx} ${f(sd)}`, '#a8ecff', '#f2fdff'),
        `${f(fx0 - sl)}px ${f(-su)}px`),
      win(ST, hit, 150 * ms, [{ p: 0, opacity: 1, transform: 'scale(.45)', easing: 'cubic-bezier(.2,.8,.3,1)' }, { p: .3, opacity: 1, transform: 'scale(1)', easing: 'cubic-bezier(.4,0,.8,.6)' },
        { p: 1, opacity: 0, transform: 'scale(1.08)' }]), ST);

      // Anvil sparks: one SVG of tapered streaks, each with an orange tail, a gold body, and a white-hot tip.
      // The whole layer fountains up from the floor, slows, falls, and dims, so dozens of sparks cost one moving layer.
      let tail = '', body = '', core = '', bx0 = 0, bx1 = 0, by0 = 0, by1 = 0;
      const burst = (ox, oy, n, Rx, Ru, Rd, a0, a1, wid, lenK) => {
        for (let i = 0; i < n; i++) {
          const u = (i + rnd() * .9) / n, ang = (a0 + (a1 - a0) * u) * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
          const R = 1 / Math.sqrt(c * c / (Rx * Rx) + s * s / ((s < 0 ? Ru : Rd) ** 2)), r1 = R * (.42 + rnd() * .58), len = r1 * lenK * (.7 + rnd() * .6);
          const w = wid * (.7 + rnd() * .6), px = -s * w, py = c * w;
          const Pt = (r, k) => { const x = ox + c * r + px * k, y = oy + s * r + py * k;
            bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); return `${f(x)} ${f(y)}`; };
          tail += `M${Pt(r1 - len, 0)}L${Pt(r1 - len * .3, .55)}L${Pt(r1, .8)}L${Pt(r1 + w * 1.3, 0)}L${Pt(r1, -.8)}L${Pt(r1 - len * .3, -.55)}Z`;
          body += `M${Pt(r1 - len * .55, 0)}L${Pt(r1 - len * .12, .45)}L${Pt(r1, .6)}L${Pt(r1 + w * 1.1, 0)}L${Pt(r1, -.6)}L${Pt(r1 - len * .12, -.45)}Z`;
          core += `M${Pt(r1 - len * .25, 0)}L${Pt(r1, .32)}L${Pt(r1 + w * .9, 0)}L${Pt(r1, -.32)}Z`;
        }
      };
      // A fountain from the floor, a spray up out of the seam between the plates, and a short skid along the floor.
      // Small boards get fewer, thinner sparks so the names stay clear.
      const nk = Math.min(1, Math.max(.5, m / 460)), n = k => Math.round(k * nk);
      const up = base - 2, dn = H - base + 2, sw0 = Math.max(2, m * .0135), mid = (cy + bh * .05) - base, Rx = Math.min(cx, W - cx) - sw0;
      burst(0, 0, n(quick ? 34 : 44), Rx, up, dn, -154, -26, sw0, quick ? .26 : .24);
      burst(0, mid, n(quick ? 10 : 14), Rx * .45, up + mid, dn, -124, -56, sw0 * .85, .3);
      burst(0, 0, n(quick ? 5 : 7), Rx * .5, up * .3, dn * .45, -4, 14, sw0 * .8, .3);
      burst(0, 0, n(quick ? 5 : 7), Rx * .5, up * .3, dn * .45, 166, 184, sw0 * .8, .3);
      // The layer holds just the sparks, and never more than the board.
      const pad = sw0 * 2, kl = Math.max(-cx, bx0 - pad), kr = Math.min(W - cx, bx1 + pad), ku = Math.max(-base, by0 - pad), kd = Math.min(H - base, by1 + pad);
      const life = quick ? 300 : 540, grav = m * (quick ? .2 : .3), KT = hit + life;
      const e = add(cx + kl, base + ku, kr - kl, kd - ku, `${f(kl)} ${f(ku)} ${f(kr - kl)} ${f(kd - ku)}`,
        `<path d="${tail}" fill="#ff7a14"/><path d="${body}" fill="#ffd34d"/><path d="${core}" fill="#fff"/>`, `${f(-kl)}px ${f(-ku)}px`);
      const ks = [[0, .08, 0, 1], [.1, .6, .02, 1], [.25, .84, .08, 1], [.5, .95, .27, .8], [.7, .99, .5, .32], [.88, 1, .68, .07], [1, 1, .8, 0]];
      fx(e, win(KT, hit, life, ks.map(([p, s, gy2, op]) => ({ p, opacity: op, transform: `translate(0px,${f(grav * gy2)}px) scale(${s})`, easing: p < .3 ? 'cubic-bezier(.2,.6,.4,1)' : 'linear' }))), KT);
      return out;
    }
  });
})();
