// Flame: a VS on fire. The V burns red-orange for the left player and the S burns blue for the right.
// Flame tongues grow out of the letters' own tops. It falls white-hot like a meteor with its fire streaming up,
// hits the board, and cools into its colors as the flames flare.
// A look for the Name Picker's Versus, one of five (see style-versus.js). It registers itself as 'flame' with
// NamePicker.look(). The emblem's API: the comment at the top of index.html.
(() => {
  const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  // Letters are drawn upright, 128 tall around y = 0, then leaned forward by K.
  const K = .2, DX = 4, P = (x, y) => r1(x - K * y + DX) + ' ' + r1(y);
  // Flame tongues along a top edge, from the current point: base, tip [x, y, curl], valley, tip, ..., base.
  const tongues = p => {
    let d = '';
    for (let i = 1; i < p.length; i += 2) {
      const A = p[i - 1], T = p[i], B = p[i + 1], c = T[2], h1 = A[1] - T[1], h2 = B[1] - T[1];
      const a = i === 1 ? 0 : .06 * h1, b = i === p.length - 2 ? 0 : -.06 * h2;
      const q = c >= 0
        ? [[A[0] + a, A[1] - .45 * h1], [T[0] - c - .05 * h1, T[1] + .25 * h1], [T[0] - .2 * c, T[1] + .35 * h2], [B[0] + b, B[1] - .35 * h2]]
        : [[A[0] + a, A[1] - .35 * h1], [T[0] - .2 * c, T[1] + .35 * h1], [T[0] - c + .05 * h2, T[1] + .25 * h2], [B[0] + b, B[1] - .45 * h2]];
      d += 'C' + P(...q[0]) + ' ' + P(...q[1]) + ' ' + P(T[0], T[1]) + 'C' + P(...q[2]) + ' ' + P(...q[3]) + ' ' + P(B[0], B[1]);
    }
    return d;
  };
  // Tongues over the V's left arm, the V's right arm, and the S's top. The letters' top edge is y = -64.
  const VL = [[-107, -64], [-114, -95, -7], [-99.5, -85], [-93.8, -128, -11.6], [-72.1, -64]];
  const VR = [[-28.9, -64], [-22.2, -130, -10], [-5.3, -90], [4.1, -108, 10], [6, -64]];
  const ST = [[9.1, -64], [17, -127, -11], [46, -77], [74, -113, 12], [86, -64]];
  const L = a => a.map(p => 'L' + P(...p)).join('');
  // The rest of each outline: the V's notch and right side, and the S from its top-right corner around to its top-left.
  const VB0 = [[-50.5, -6], [-28.9, -64]], VB1 = [[-42, 64]], SB0 = [[86, -24], [59.1, -24], [59.1, -38], [24.5, -38], [16.8, -30], [16.8, -13], [64.8, -13], [86, 9], [86, 42],
    [64.8, 64], [-14, 64], [-14, 24], [12.9, 24], [12.9, 38], [47.5, 38], [55.2, 30], [55.2, 13], [7.2, 13], [-14, -9]];
  // Each letter burning: its outline runs up into its own tongues, so ink, bands, and fire are one shape.
  const BURN = [
    'M' + P(-59, 64) + L([[-107, -64]]) + tongues(VL) + L(VB0) + tongues(VR) + L(VB1) + 'Z',
    'M' + P(-14, -40) + L([[9.1, -64]]) + tongues(ST) + L(SB0) + 'Z'
  ];
  // Inner tongues: smaller copies of each set, rising out of the letter's white-hot body.
  const inner = (t, sx, sy) => { const cx = (t[0][0] + t[t.length - 1][0]) / 2, q = t.map(p => [cx + (p[0] - cx) * sx, -64 + (p[1] + 64) * sy, (p[2] || 0) * sx]);
    return 'M' + P(q[0][0], -40) + 'L' + P(...q[0]) + tongues(q) + 'L' + P(q[q.length - 1][0], -40) + 'Z'; };
  // Each letter with a flat top: the white-hot body, and the cold steel letters while waiting.
  const BODY = ['M' + P(-59, 64) + L([[-107, -64], [-72.1, -64]]) + L(VB0) + L([[6, -64]]) + L(VB1) + 'Z', 'M' + P(-14, -40) + L([[9.1, -64], [86, -64]]) + L(SB0) + 'Z'];
  // For each letter: the yellow inner tongues, and the white-hot body with its smallest tongues. The S keeps a narrower
  // white core, so its flames read as blue fire.
  const CS = [[.8, .78, .5, .48], [.72, .72, .4, .38]];
  const CORE = [[VL, VR], [ST]].map((sets, i) => [sets.map(t => inner(t, CS[i][0], CS[i][1])).join(''), BODY[i] + sets.map(t => inner(t, CS[i][2], CS[i][3])).join('')]);
  // Per letter: rim, mid, and inner bands (r, o, y); the flame body (c); the yellow tongues (i); the white-hot core (w);
  // the slam's white-hot fill (hot); its shadow (sh); its embers (e); and its glow on dark boards (g). The ink matches the names' outline.
  const INK = '#111827';
  // While waiting, the ink softens to slate, as in the other looks.
  const SLATE = '#3b4556';
  const FIRE = {
    v: { r: ['#c81e10', '#d9361a'], o: ['#ff6a14', '#ff8f1c'], y: ['#ffb424', '#ffd75a'],
      c: [[0, '#d42a12'], [.14, '#f04a14'], [.3, '#ff8a1c'], [1, '#ffa424']], i: [[0, '#ffb424'], [.3, '#ffd04a'], [1, '#ffe27a']], w: [[0, '#ffe9a0'], [.3, '#fff3c4'], [.42, '#fff8e0'], [1, '#fffdf6']],
      hot: '#fff4d2', sh: '#3a0a05', e: ['#ffd75a', '#c81e10'], g: '#ff5a1f' },
    s: { r: ['#1e40af', '#1d4ed8'], o: ['#0b72e0', '#0b8fe8'], y: ['#16a8f0', '#3fd2f6'],
      c: [[0, '#1e3fae'], [.14, '#1f5fe0'], [.3, '#1294ea'], [1, '#17aef0']], i: [[0, '#22b8f0'], [.3, '#4fd4f7'], [1, '#86e6fb']], w: [[0, '#7fe3fb'], [.36, '#bdf3fe'], [.5, '#e8fbff'], [1, '#fbffff']],
      hot: '#e8fbff', sh: '#071538', e: ['#a8f0fc', '#1d4ed8'], g: '#38bdf8' }
  };
  const STEEL = {
    v: { r: ['#78716c', '#86807b'], o: ['#97918c', '#a39e99'], y: ['#b5b1ad', '#c4c0bc'], c: ['#d0cdca', '#dcdad8', '#e9e8e6', '#f5f5f4'], sh: '#1f2937' },
    s: { r: ['#64748b', '#788699'], o: ['#8794a6', '#96a2b2'], y: ['#a8b3c1', '#bac3cf'], c: ['#c6cdd7', '#d5dbe3', '#e5e9ee', '#f2f4f7'], sh: '#1f2937' }
  };
  const TOP = -132, BOT = 64, VB = [-130, -134, 260, 236];
  // A band: clear in the flames, then its color from the letter's top down.
  const band = (id, cs) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="-84" x2="0" y2="${BOT}"><stop offset="0" stop-color="${cs[0]}" stop-opacity="0"/>` +
    `<stop offset=".14" stop-color="${cs[0]}"/><stop offset="1" stop-color="${cs[1]}"/></linearGradient>`;
  const grad = (id, cs) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${TOP}" x2="0" y2="${BOT}">` +
    cs.map((c, i) => `<stop offset="${Array.isArray(c) ? c[0] : r1(i / (cs.length - 1) * 100) / 100}" stop-color="${Array.isArray(c) ? c[1] : c}"/>`).join('') + '</linearGradient>';
  const uid = () => 'vf' + Math.random().toString(36).slice(2, 8);
  // One letter: a wide ink outline, the core, then rim, mid, and inner bands as strokes clipped inside it, and a crisp front line.
  const letter = (k, id, core, ink = INK) => {
    const u = a => `<use href="#${k}${id}" ${a}/>`;
    return u(`fill="${ink}" stroke="${ink}" stroke-width="10" stroke-linejoin="round"`) + u(`fill="url(#${k}${id}c)"`) +
      `<g clip-path="url(#${k}${id}k)" fill="none">` + (core ? `<path d="${core[0]}" fill="url(#${k}${id}i)"/><path d="${core[1]}" fill="url(#${k}${id}w)"/>` : '') + u(`stroke="url(#${k}${id}y)" stroke-width="23"`) + u(`stroke="url(#${k}${id}o)" stroke-width="17"`) +
      u(`stroke="url(#${k}${id}r)" stroke-width="11"`) + '</g>' + u(`fill="none" stroke="${ink}" stroke-width="4" stroke-linejoin="round"`);
  };
  const defs = (k, ds, pals, ids = ['v', 's']) => ids.map(id => [id, id === 'v' ? 0 : 1]).map(([id, i]) => `<path id="${k}${id}" d="${ds[i]}"/><clipPath id="${k}${id}k"><use href="#${k}${id}"/></clipPath>` +
    ['r', 'o', 'y'].map(b => band(k + id + b, pals[id][b])).join('') + ['c', 'i', 'w'].filter(b => pals[id][b]).map(b => grad(k + id + b, pals[id][b])).join('')).join('');
  const shadow = (k, id, pal) => `<use href="#${k}${id}" fill="${pal[id].sh}" stroke="${pal[id].sh}" stroke-width="12" stroke-linejoin="round"/>`;
  // On dark boards, a soft glow in each letter's own color rings the ink.
  const halo = (k, id) => `<use href="#${k}${id}" fill="none" stroke="${FIRE[id].g}" stroke-width="17" stroke-linejoin="round" opacity=".3"/>`;
  // Embers above the flames: warm over the V, cool over the S.
  const EMBERS = [[-84, -116, 3.4, 'v'], [-46, -124, 2.8, 'v'], [80, -124, 3.2, 's'], [113, -98, 2.6, 's']];
  const ember = ([x, y, e, w]) => `<path d="M${x} ${r1(y - 1.8 * e)}l${e} ${r1(1.8 * e)}l${-e} ${r1(1.4 * e)}l${-e} ${r1(-1.4 * e)}z" fill="${FIRE[w].e[0]}" stroke="${FIRE[w].e[1]}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const T = 'translate(-50%,-50%) ', HIT = Object.freeze({ normal: 270, quick: 130 });
  // How far the letters' base sits below the box's center, as a share of its height. Squashes pivot there.
  const BASE = (BOT + 5 - (VB[1] + VB[3] / 2)) / VB[3];

  // Where the stage's slash runs: x = a + b * y in stage px, from .vs-cut's computed clip-path, or 57% to 43%.
  const slash = (stage, W, H) => {
    let a = .57 * W, b = -.14 * W / H;
    const cut = stage.querySelector('.vs-cut'), cp = cut ? getComputedStyle(cut).clipPath || '' : '', i = cp.indexOf('polygon(');
    if (i < 0) return [a, b];
    // The points inside polygon( ), split on commas and spaces outside any nested parentheses, such as calc().
    const pts = [];
    let d = 0, term = '', pt = [];
    const end = () => { if (term) pt.push(term); term = ''; }, next = () => { end(); if (pt.length === 2) pts.push(pt); pt = []; };
    for (const ch of cp.slice(i + 8)) {
      if (ch === ')' && !d) break;
      if (ch === '(') d++; else if (ch === ')') d--;
      if (!d && ch === ',') next(); else if (!d && /\s/.test(ch)) end(); else term += ch;
    }
    next();
    // A coordinate in the slash's own box: % and px directly, anything else measured with a probe.
    const cw = cut.offsetWidth || W, ch = cut.offsetHeight || H, ox = cut.offsetLeft || 0, oy = cut.offsetTop || 0;
    const v = (t, n, x) => {
      if (/^-?[\d.]+%$/.test(t)) return parseFloat(t) / 100 * n;
      if (/^-?[\d.]+(px)?$/.test(t)) return parseFloat(t);
      const p = document.createElement('div');
      p.style.cssText = `position:absolute;width:0;height:0;${x ? 'left' : 'top'}:${t}`;
      cut.appendChild(p); const r = x ? p.offsetLeft : p.offsetTop; p.remove(); return r;
    };
    const q = pts.map(([x, y]) => [v(x, cw, 1) + ox, v(y, ch, 0) + oy]).filter(z => isFinite(z[0]) && isFinite(z[1]));
    const up = q.filter(z => z[1] < H / 2), dn = q.filter(z => z[1] >= H / 2), avg = (s, j) => s.reduce((t, z) => t + z[j], 0) / s.length;
    if (up.length && dn.length && avg(dn, 1) > avg(up, 1)) { b = (avg(dn, 0) - avg(up, 0)) / (avg(dn, 1) - avg(up, 1)); a = avg(up, 0) - b * avg(up, 1); }
    return [a, b];
  };

  const E = {
    size: 0.57,
    aspect: VB[2] / VB[3],
    // In dark theme its glow reaches past the top of the box by 0.02 of its height (measured).
    reach: 0.02,
    hit: HIT,
    markup(state, { dark, h } = {}) {
      const k = uid(), cold = state === 'waiting', pal = cold ? STEEL : FIRE, ds = cold ? BODY : BURN, small = h && h < 90;
      return `<svg class="vsx-flame" data-s="${cold ? 'waiting' : 'final'}"${dark ? ' data-dark=""' : ''} viewBox="${VB.join(' ')}" xmlns="http://www.w3.org/2000/svg"><defs>` + defs(k, ds, pal) + '</defs>' +
        (dark && !cold ? halo(k, 'v') + halo(k, 's') : '') +
        `<g transform="translate(4 6)" opacity=".35">${shadow(k, 's', pal)}${shadow(k, 'v', pal)}</g>` +
        letter(k, 's', !cold && CORE[1], cold ? SLATE : INK) + letter(k, 'v', !cold && CORE[0], cold ? SLATE : INK) +
        (small || cold ? '' : EMBERS.map(ember).join('')) + '</svg>';
    },
    // Falls white-hot from above the board, its fire streaming up, then hits, squashes, and cools as the flames flare.
    slam(box, { quick, stage } = {}) {
      if (!box) return [];
      // Clear anything a cancelled slam left in this box.
      box.querySelectorAll('[data-vsx]').forEach(e => e.remove());
      const svg = box.querySelector('svg.vsx-flame'), st = stage || box.parentElement, o = { fill: 'both' };
      const H = (st && st.clientHeight) || 400, bw = box.offsetWidth || 220, bh = box.offsetHeight || 200;
      const hit = quick ? HIT.quick : HIT.normal, D = hit + (quick ? 250 : 340), at = ms => r3((hit + ms) / D);
      // A transform of the box: dy px down, then scaled with the letters' base held still.
      const tf = (dy, sx, sy) => T + `translateY(${r1(dy + (1 - sy) * BASE * bh)}px) scale(${sx},${sy})`;
      // It starts with its lowest point just above the board's top edge and falls faster and faster. On the hit it
      // squashes short, never wider, and thuds down and back, so the names keep their room.
      const j = bh * (quick ? .025 : .032), fall = quick ? bh * .75 : H / 2 + bh * .4;
      const out = [box.animate([
        { transform: tf(-fall, 1, quick ? 1.04 : 1.08), easing: quick ? 'cubic-bezier(.35,0,.9,.6)' : 'cubic-bezier(.4,0,.9,.55)' },
        { transform: tf(0, 1, quick ? 1.04 : 1.08), offset: at(0), easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: tf(j, 1, .86), offset: at(quick ? 22 : 34), easing: 'ease-out' },
        { transform: tf(j * .7, 1, .88), offset: at(quick ? 45 : 70), easing: 'cubic-bezier(.3,0,.4,1)' },
        { transform: tf(-j * .4, .99, 1.05), offset: at(quick ? 110 : 160), easing: 'ease-in-out' },
        { transform: tf(j * .15, 1, .985), offset: at(quick ? 180 : 250), easing: 'ease-in-out' },
        { transform: tf(0, 1, 1) }], { ...o, duration: D })];
      // Quick mode starts on the board, so it fades in over its first frames.
      if (quick) out.push(box.animate([{ opacity: 0 }, { opacity: 1 }], { ...o, duration: 40 }));
      if (!svg || svg.getAttribute('data-s') === 'waiting') return out;

      // While the slam runs, layers draw the fire: each letter's flames behind it, its white-hot body on top, and
      // speed streaks above it. The emblem's own flames are clipped away until the layers leave, so the fire is drawn once.
      const dark = svg.hasAttribute('data-dark'), small = bh < 90, token = uid();
      const sc = Math.min(bw / VB[2], bh / VB[3]), ox = (bw - VB[2] * sc) / 2, oy = (bh - VB[3] * sc) / 2;
      const px = (x, y) => [ox + (x - VB[0]) * sc, oy + (y - VB[1]) * sc], u3 = v => Math.round(v * 1000) / 1000;
      const layers = [];
      // A layer over the units x0..x1, y0..y1, placed on whole pixels of the box so it lines up exactly with the emblem.
      // style(oy) gets the px offset of y = -64, the flames' base line, inside the layer.
      const add = (x0, y0, x1, y1, style, body) => {
        const [l, t] = px(x0, y0), L = Math.round(l), Tp = Math.round(t), w = Math.round((x1 - x0) * sc), h = Math.round((y1 - y0) * sc);
        const vx = x0 - (l - L) / sc, vy = y0 - (t - Tp) / sc;
        box.insertAdjacentHTML('beforeend', `<svg data-vsx="" viewBox="${u3(vx)} ${u3(vy)} ${u3(w / sc)} ${u3(h / sc)}" preserveAspectRatio="none" style="position:absolute;left:${L}px;top:${Tp}px;` +
          `width:${w}px;height:${h}px;overflow:visible;pointer-events:none;${style(r1((-64 - vy) * sc))}">${body}</svg>`);
        layers.push(box.lastElementChild); return box.lastElementChild;
      };
      svg.setAttribute('data-vsx-slam', token);
      svg.style.clipPath = `inset(${r1(px(0, -64)[1])}px -100% -100% -100%)`;
      const anims = [], flames = [];
      const unclip = () => { if (svg.getAttribute('data-vsx-slam') === token) { svg.style.clipPath = ''; svg.removeAttribute('data-vsx-slam'); if (!svg.getAttribute('style')) svg.removeAttribute('style'); } };
      const done = () => { layers.forEach(e => e.remove()); unclip(); };
      // Each layer leaves as soon as its part is over. Cancelling any of them clears them all.
      const own = (el, a) => { a.addEventListener('finish', () => el.remove()); a.addEventListener('cancel', done); anims.push(a); return a; };

      // Flames: each letter's tongues, from just inside its top up. They stretch up as it falls, flatten on the hit, flare,
      // wobble, and settle. They only stretch and lean from their base line, so they always meet their letter. Each layer
      // carries its own shadow, glow, and embers; the V's shadow and glow stay off the S, as in the emblem.
      const F = quick
        ? [[0, 1.5, 0], [hit * .5, 1.75, 3], [hit, 1.9, 0], [hit + 25, .5, 0], [hit + 90, 1.5, 5], [hit + 160, .88, -3], [hit + 220, 1.06, 1], [hit + 260, 1, 0]]
        : [[0, 1.8, 0], [hit * .35, 2.05, 4], [hit * .7, 2.2, -3], [hit, 2.3, 0], [hit + 40, .5, 0], [hit + 130, 1.7, 6], [hit + 220, .86, -3], [hit + 300, 1.1, 1.5], [hit + 380, 1, 0]];
      const FD = F[F.length - 1][0], LT = -142, LB = -58;
      // The S's layer goes first, so the V's flames overlap it as in the emblem.
      [['s', 1, 0, 125, 1], ['v', 0, -125, 45, -1]].forEach(([id, i, x0, x1, side]) => {
        const k = uid(), pal = FIRE;
        const el = add(x0, LT, x1, LB, y => `z-index:-1;transform-origin:50% ${y}px`,
          `<defs>${defs(k, BURN, pal, [id])}<clipPath id="${k}t"><path d="M-300-300H300V-61H-300Z"/></clipPath><clipPath id="${k}u"><path d="M-300-300H300V-64H-300Z"/></clipPath>` +
          (i ? '' : `<clipPath id="${k}x"><path clip-rule="evenodd" d="M-300-300H300V300H-300Z${BURN[1]}"/></clipPath>`) + '</defs>' +
          `<g clip-path="url(#${k}u)"><g${i ? '' : ` clip-path="url(#${k}x)"`}>${dark ? halo(k, id) : ''}<g transform="translate(4 6)" opacity=".35">${shadow(k, id, pal)}</g></g></g>` +
          `<g clip-path="url(#${k}t)">${letter(k, id, CORE[i])}</g>` + (small ? '' : EMBERS.filter(e => e[3] === id).map(ember).join('')));
        // A lean of a degrees: + leans the tips toward the middle of the emblem, away from the names.
        const a = el.animate(F.map(([t, sy, lean], n) => ({ transform: `skewX(${r1(lean * side)}deg) scaleY(${sy})`, offset: r3(t / FD),
          easing: n === (quick ? 2 : 3) ? 'cubic-bezier(.2,.8,.4,1)' : 'ease-in-out' })), { ...o, duration: FD });
        a.addEventListener('cancel', done); anims.push(a); flames.push([el, a]);
      });
      // Both flame layers and the clip leave in the same moment, so the emblem's own flames take over without a flicker.
      let lit = flames.length;
      flames.forEach(([, a]) => a.addEventListener('finish', () => { if (--lit <= 0) { flames.forEach(([el]) => el.remove()); unclip(); } }));

      // The white-hot body: everything inside the rim, fading in from the letter's top so it meets its flames softly.
      const hk = uid();
      const hot = add(VB[0], -66, VB[0] + VB[2], 72, () => 'opacity:0', `<defs>` + ['v', 's'].map((id, i) => `<path id="${hk}${id}" d="${BURN[i]}"/><clipPath id="${hk}${id}k"><use href="#${hk}${id}"/></clipPath>` +
        band(hk + id + 'r', FIRE[id].r) + `<linearGradient id="${hk}${id}h" gradientUnits="userSpaceOnUse" x1="0" y1="-64" x2="0" y2="-50"><stop offset="0" stop-color="${FIRE[id].hot}" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="${FIRE[id].hot}"/></linearGradient>`).join('') + `<clipPath id="${hk}b"><path d="M-300-64H300V300H-300Z"/></clipPath></defs><g clip-path="url(#${hk}b)">` +
        ['s', 'v'].map(id => { const u = a => `<use href="#${hk}${id}" ${a}/>`; return u(`fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round"`) + u(`fill="url(#${hk}${id}h)"`) +
          u(`fill="none" stroke="url(#${hk}${id}r)" stroke-width="11" clip-path="url(#${hk}${id}k)"`) + u(`fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`); }).join('') + '</g>');
      const cool = quick ? 70 : 120;
      own(hot, hot.animate([{ opacity: 1 }, { opacity: 1, offset: r3(hit / (hit + cool)), easing: 'cubic-bezier(.3,0,.6,1)' }, { opacity: 0 }], { ...o, duration: hit + cool }));

      // Speed streaks trailing above it, inside its own column, so they never cross a name. They vanish on the hit.
      const SK = [[-97, -96, 150, 'v'], [-34, -82, 170, 'v'], [70, -98, 150, 's'], [104, -84, 130, 's']];
      const streak = ([x, y, len, id]) => `<path d="M${x} ${y - len}Q${x + 3.6} ${y - len * .4} ${x + 3.4} ${y}A3.4 3.4 0 0 1 ${x - 3.4} ${y}Q${x - 3.6} ${y - len * .4} ${x} ${y - len}Z" ` +
        `fill="${FIRE[id].hot}" stroke="${FIRE[id].e[1]}" stroke-width="2" opacity=".9"/>`;
      const sk = add(-112, -280, 112, -60, () => 'opacity:0', SK.map(streak).join(''));
      own(sk, sk.animate([{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 1, offset: r3((hit - 10) / (hit + 10)) }, { opacity: 0 }], { ...o, duration: hit + 10 }));
      return out.concat(anims);
    },
    // Under the names: a bloom of each side's color, a ring of fire, and ember sparks, bursting out from behind the emblem.
    impact(stage, { quick } = {}) {
      if (!stage) return [];
      stage.querySelectorAll('[data-vsx-fx]').forEach(e => e.remove());
      const W = stage.clientWidth || 1, H = stage.clientHeight || 1, m = Math.min(W, H), hit = quick ? HIT.quick : HIT.normal;
      const svg = stage.querySelector('svg.vsx-flame'), bx = svg && svg.parentElement;
      if (svg && svg.getAttribute('data-s') === 'waiting') return [];
      const cx = bx && bx.offsetParent === stage ? bx.offsetLeft : W / 2, cy = bx && bx.offsetParent === stage ? bx.offsetTop : H / 2;
      const [a, b] = slash(stage, W, H);
      // Under the names and the box: just before the slash. Without one, just after the last child that covers the whole stage.
      let ref = stage.querySelector('.vs-cut');
      if (!ref) {
        const sr = stage.getBoundingClientRect(), full = c => { const r = c.getBoundingClientRect(); return r.width * r.height >= sr.width * sr.height * .9; };
        const bg = [...stage.children].filter(full).pop();
        ref = bg ? bg.nextSibling : stage.firstChild;
      }
      const R = m * .5, w = R * 2, x0 = cx - R, y0 = cy - R, id = uid(), f = r1;
      // Which side of the slash a point of the burst is on.
      const warm = (x, y) => x0 + x < a + b * (y0 + y), sx = y => a + b * (y0 + y) - x0;
      const lp = `M-9 -9H${f(sx(-9))}L${f(sx(w + 9))} ${f(w + 9)}H-9Z`, rp = `M${f(sx(-9))} -9H${f(w + 9)}V${f(w + 9)}H${f(sx(w + 9))}Z`;
      const pt = (r, t) => f(R + r * Math.cos(t)) + ' ' + f(R + r * Math.sin(t));
      // The ring: a band of fire whose outer edge breaks into short tongues, all curling the same way.
      const r0 = m * .345, r2 = m * .425, ri = m * .29, N = 20;
      let ring = '';
      for (let n = 0; n < N; n++) {
        const t0 = n / N * Math.PI * 2 + .1, t1 = (n + 1) / N * Math.PI * 2 + .1, s = t1 - t0, rt = r0 + (r2 - r0) * (n % 2 ? .62 : 1);
        ring += (n ? '' : 'M' + pt(r0, t0)) + 'Q' + pt(r0 + (rt - r0) * .55, t0 + s * .1) + ' ' + pt(rt, t0 + s * .78) + 'Q' + pt(r0 + (rt - r0) * .35, t0 + s * .72) + ' ' + pt(r0, t1);
      }
      ring += `ZM${f(R + ri)} ${f(R)}A${f(ri)} ${f(ri)} 0 1 0 ${f(R - ri)} ${f(R)}A${f(ri)} ${f(ri)} 0 1 0 ${f(R + ri)} ${f(R)}Z`;
      const rg = (k, c) => `<radialGradient id="${id}${k}" gradientUnits="userSpaceOnUse" cx="${f(R)}" cy="${f(R)}" r="${f(r2)}"><stop offset="${r3(ri / r2)}" stop-color="${c[0]}"/>` +
        `<stop offset="${r3((r0 + m * .02) / r2)}" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`;
      // The bloom: each side glows in its own strong color, brightest behind the emblem, so neither side turns pale.
      const bloom = (k, c) => `<radialGradient id="${id}${k}"><stop offset="0" stop-color="${c[0]}" stop-opacity=".7"/><stop offset=".55" stop-color="${c[1]}" stop-opacity=".35"/>` +
        `<stop offset="1" stop-color="${c[1]}" stop-opacity="0"/></radialGradient>`;
      // Sparks: chunky embers with the names' ink and white-hot cores, flying out past the ring.
      let sparks = '';
      for (let n = 0; n < 10; n++) {
        const t = (n + .5) / 10 * Math.PI * 2 + (n % 2 ? .12 : -.1), r = m * (n % 2 ? .41 : .455), L = m * (n % 2 ? .085 : .1), wd = m * (n % 2 ? .025 : .029);
        const c = Math.cos(t), s = Math.sin(t), x = R + c * r, y = R + s * r, hot = warm(x, y);
        const drop = (k, l) => `M${f(x - c * L * l)} ${f(y - s * L * l)}Q${f(x - s * wd * k)} ${f(y + c * wd * k)} ${f(x + c * wd * k)} ${f(y + s * wd * k)}Q${f(x + s * wd * k)} ${f(y - c * wd * k)} ${f(x - c * L * l)} ${f(y - s * L * l)}Z`;
        sparks += `<path d="${drop(1, 1)}" fill="${hot ? '#ff9a1f' : '#22b8f0'}" stroke="${INK}" stroke-width="${f(m * .006)}" stroke-linejoin="round"/><path d="${drop(.45, .55)}" fill="${hot ? '#fff4d2' : '#e8fbff'}"/>`;
      }
      const host = document.createElement('div');
      host.setAttribute('data-vsx-fx', '');
      host.style.cssText = `position:absolute;left:${f(x0)}px;top:${f(y0)}px;width:${f(w)}px;height:${f(w)}px;pointer-events:none;opacity:0`;
      host.innerHTML = `<svg width="${f(w)}" height="${f(w)}" viewBox="0 0 ${f(w)} ${f(w)}" style="display:block;overflow:visible"><defs><clipPath id="${id}l"><path d="${lp}"/></clipPath><clipPath id="${id}r"><path d="${rp}"/></clipPath>` +
        bloom('a', ['#ffc23d', '#ff8a1a']) + bloom('b', ['#6fe6ff', '#22b8f0']) + rg('c', ['#ffc93a', '#ff9418', '#ff5a14']) + rg('d', ['#7fe6ff', '#22b8f0', '#1d6ff0']) + '</defs>' +
        ['l', 'r'].map((s, n) => `<g clip-path="url(#${id}${s})"><ellipse cx="${f(R)}" cy="${f(R)}" rx="${f(m * .43)}" ry="${f(m * .37)}" fill="url(#${id}${n ? 'b' : 'a'})"/>` +
          `<path d="${ring}" fill="url(#${id}${n ? 'd' : 'c'})" fill-rule="evenodd" stroke="${INK}" stroke-width="${f(m * .006)}" stroke-linejoin="round"/></g>`).join('') + sparks + '</svg>';
      (ref && ref.parentNode || stage).insertBefore(host, ref || null);
      // Hidden until the hit, then it bursts out from behind the emblem and fades.
      const dur = quick ? 200 : 310, q = quick ? .65 : 1;
      const T0 = hit + dur, k = ms => r3((hit + ms * q) / T0);
      const burst = host.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(.4)', opacity: 0, offset: r3(hit / T0), easing: 'linear' },
        { transform: 'scale(.62)', opacity: 1, offset: k(24), easing: 'cubic-bezier(.2,.6,.4,1)' },
        { transform: 'scale(.86)', opacity: 1, offset: k(100), easing: 'cubic-bezier(.3,.5,.5,1)' }, { transform: 'scale(1)', opacity: 0 }], { fill: 'both', duration: T0 });
      const rm = () => host.remove();
      burst.addEventListener('finish', rm); burst.addEventListener('cancel', rm);
      return [burst];
    }
  };
  NamePicker.look('flame', E);
})();
