// Comic: a red V and a blue S, chunky 3D block letters, punch through a yellow comic panel.
// They fall from the sky on speed lines, the panel flashes to ink on the hit, then pops to color.
// A look for the Name Picker's Versus, one of five (see style-versus.js). It registers itself as 'comic' with
// NamePicker.look(). The emblem's API: the comment at the top of index.html.
(() => {
  const P = 'vc' + Math.random().toString(36).slice(2, 6);
  let n = 0;
  const HIT = { normal: 280, quick: 120 };
  const r1 = v => Math.round(v * 10) / 10;
  const xy = p => r1(p[0]) + ' ' + r1(p[1]);
  const D = a => ('M' + a.map(xy).join(' ') + 'Z').replace(/ -/g, '-');
  const area = a => a.reduce((s, p, i) => { const q = a[(i + 1) % a.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const DX = [4, 10];

  // The visible side faces of polygon P pushed back along DX, in a lit and a shadow tone,
  // plus the creases where two side faces meet at a corner.
  function sides(P) {
    const N = P.length, s = Math.sign(area(P));
    const E = P.map((p, i) => {
      const q = P[(i + 1) % N], ex = q[0] - p[0], ey = q[1] - p[1], L = Math.hypot(ex, ey) || 1;
      const nx = s * ey / L, ny = -s * ex / L, f = nx * DX[0] + ny * DX[1] > 1e-3;
      return { f, b: f ? (ny > 0.6 ? 1 : 0) : -1, nx, ny };
    });
    const st = E.findIndex(e => !e.f), bands = [[], []], creases = [];
    let run = null;
    for (let k = 0; k <= N; k++) {
      const i = (st + k) % N, e = E[i];
      if (run && (k === N || e.b !== run.b)) {
        const v = run.v.concat([P[i]]);
        const band = v.concat(v.slice().reverse().map(p => [p[0] + DX[0], p[1] + DX[1]]));
        if (Math.sign(area(band)) !== s) band.reverse();
        bands[run.b].push(band);
        run = null;
      }
      if (k === N) break;
      if (e.f) { if (!run) run = { b: e.b, v: [] }; run.v.push(P[i]); }
    }
    E.forEach((e, i) => { const p = E[(i + N - 1) % N]; if (e.f && p.f && e.nx * p.nx + e.ny * p.ny < 0.85) creases.push(P[i]); });
    return { bands, creases };
  }

  // Letters, 120 units tall around 0,0. The V's arms keep one width down to a deep notch.
  // The S is a thick stroke around rounded corners; its ends are cut square.
  const V = [[-48, -60], [-17, -60], [0, 16], [17, -60], [48, -60], [21, 60], [-21, 60]];
  const S = (() => {
    const A = 30, B = 22.5, R = 20, T = 15, E = 18, L = [], Rt = [];
    // corner center, start and end angle, turn (+1 left, -1 right); each end runs straight on for E units
    [[A - R, -2 * B + R, -90, -90, 1], [-A + R, -2 * B + R, -90, -180, 1], [-A + R, -R, 180, 90, 1],
     [A - R, R, -90, 0, -1], [A - R, 2 * B - R, 0, 90, -1], [-A + R, 2 * B - R, 90, 90, -1]].forEach(([cx, cy, a0, a1, t], j) => {
      [[L, R - T * t], [Rt, R + T * t]].forEach(([out, r]) => {
        const m = a0 === a1 ? 0 : Math.max(1, Math.round(Math.abs(a1 - a0) * r / 200));
        if (j === 0) out.push([cx + E, cy - r]);
        for (let k = 0; k <= m; k++) { const a = (a0 + (a1 - a0) * k / (m || 1)) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        if (j === 5) out.push([cx - E, cy + r]);
      });
    });
    return L.concat(Rt.reverse());
  })();
  // Italic lean and a touch of perspective, then place. V high and S low, so they punch out of the panel's top and bottom.
  const K = 0.98, VX = -47, VY = -22, SX = 38, SY = 20;
  const place = (P, x, y) => P.map(([px, py]) => [r1(x + K * (px * (1 + py / 900) - py * 0.16)), r1(y + K * py)]);
  const VP = place(V, VX, VY), SP = place(S, SX, SY);
  // One hard-edged comic shine per letter: a tapered hook of light around its top-left corner.
  const hook = (cx, cy, a0, a1, ro, w) => {
    const o = [], i = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, a = (a0 + (a1 - a0) * t) * Math.PI / 180, ri = ro - w * Math.pow(Math.sin(Math.PI * t), 0.6);
      o.push([cx + ro * Math.cos(a), cy + ro * Math.sin(a)]); i.unshift([cx + ri * Math.cos(a), cy + ri * Math.sin(a)]);
    }
    return o.concat(i);
  };
  const xo = y => -48 + 0.225 * (y + 60);
  const SHINE = {
    v: D(place([[-27, -54], [xo(-54) + 6, -54], [xo(-23) + 6.8, -23], [xo(-33) + 9.8, -33], [xo(-50) + 10.6, -50], [-30, -50.2]], VX, VY)),
    s: D(place(hook(-10, -25, 184, 262, 30, 5), SX, SY))
  };

  // The panel: a frame leaning with the board's slash.
  const PH = 60, PW = 90, PS = 0.36;
  const PAN = D([[-PW + PS * PH, -PH], [PW + PS * PH, -PH], [PW - PS * PH, PH], [-PW - PS * PH, PH]]);
  // Focus lines inside the panel, rushing out from the middle.
  const FOCUS = (() => {
    let d = '';
    for (let i = 0; i < 26; i++) {
      const a = (i + (i % 3) * 0.3) / 26 * 2 * Math.PI, w = 0.03 + (i % 4) * 0.008, r0 = 26 + (i * 7) % 16;
      const p = (r, b) => r1(Math.cos(b) * r) + ' ' + r1(Math.sin(b) * r * 0.8);
      d += `M${p(r0, a)}L${p(150, a - w)} ${p(150, a + w)}Z`;
    }
    return d.replace(/ -/g, '-');
  })();
  // Speed lines above each falling letter: tapered wedges that start at the letter's top and fade upward.
  const topAt = (Pts, x) => {
    let y = Infinity;
    Pts.forEach((p, i) => { const q = Pts[(i + 1) % Pts.length]; if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) y = Math.min(y, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])); });
    return y;
  };
  const TRAIL = (Pts, xs, flat) => xs.map(([x, w, l]) => {
    const b = flat ? Math.min(...Pts.map(p => p[1])) - 0.5 : topAt(Pts, x) + 1, t = b - l;
    return D([[x - w / 2, b], [x - 0.8, t], [x + 0.8, t], [x + w / 2, b]]);
  }).join('');
  const TV = TRAIL(VP, [[-40, 11, 120], [-27, 13, 165], [-13, 10, 100], [0, 14, 150], [13, 11, 115], [27, 13, 160], [40, 10, 95]].map(([x, w, l]) => [VX + 9 + x * 0.93, w, l]), true);
  const TS = TRAIL(SP, [[-32, 10, 95], [-19, 13, 150], [-5, 11, 115], [8, 14, 165], [21, 10, 120], [33, 12, 140]].map(([x, w, l]) => [SX + 9 + x * 0.93, w, l]));

  const COL = {
    final: { ink: '#111827', rim: '#fff', pan: ['#ffe866', '#ffc800', '#ff9800'], dot: '#f25c00', line: '#fff',
      v: ['#ffb35c', '#ff7b2e', '#f23a2b', '#c8102e'], vx: ['#b0122f', '#5f0d21'], vd: '#8f0a26', vt: '#ffd23a',
      s: ['#a5f3ff', '#3ec4ff', '#2b80ff', '#1d4fdb'], sx: ['#1f47c4', '#14286e'], sd: '#14309a', st: '#a5f3fc' },
    waiting: { ink: '#3b4556', rim: '#f8fafc', pan: ['#e4e8ee', '#d3d9e2', '#c3cbd6'], dot: '', line: '',
      v: ['#f6f8fb', '#dfe4ea', '#c9d0da', '#b0b9c5'], vx: ['#8b96a6', '#657082'],
      s: ['#f6f8fb', '#dfe4ea', '#c9d0da', '#b0b9c5'], sx: ['#8b96a6', '#657082'] },
    ink: { ink: '#111827', rim: '#fff', pan: ['#111827', '#111827', '#111827'], dot: '', line: '#fff',
      v: ['#fff', '#fff', '#fff', '#fff'], vx: ['#111827', '#111827'],
      s: ['#fff', '#fff', '#fff', '#fff'], sx: ['#111827', '#111827'] }
  };
  const grad = (id, s) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s[0]}"/><stop offset=".5" stop-color="${s[1]}"/><stop offset=".5" stop-color="${s[2]}"/><stop offset="1" stop-color="${s[3]}"/></linearGradient>`;
  const fade = (id, c, y1, y2, o) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`;

  // One letter: ink around the face and its sides, the two side tones, creases, the face, then halftone below its cel line.
  // Its geometry is worked out once.
  const geo = (Pts, y) => { const { bands, creases } = sides(Pts); return { f: D(Pts), a: bands[0].map(D).join(''), b: bands[1].map(D).join(''), k: creases.map(p => `M${xy(p)}l${DX[0]} ${DX[1]}`).join(''), y }; };
  const GV = geo(VP, VY), GS = geo(SP, SY);
  function letter(id, g, face, ext, c, big, dots) {
    const u = (s, at) => `<use href="#${id}${s}" ${at || ''}/>`;
    return {
      defs: `<path id="${id}f" d="${g.f}"/><path id="${id}a" d="${g.a}"/><path id="${id}b" d="${g.b}"/>` +
        (dots ? `<clipPath id="${id}c">${u('f')}</clipPath><pattern id="${id}h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="3.5" cy="3.5" r="1.9" fill="${dots}"/></pattern>` : ''),
      rim: `<g fill="${c.rim}" stroke="${c.rim}" stroke-width="17" stroke-linejoin="round">${u('f') + u('a') + u('b')}</g>`,
      body: `<g fill="${c.ink}" stroke="${c.ink}" stroke-width="${big ? 10 : 12}" stroke-linejoin="round">${u('f') + u('a') + u('b')}</g>` +
        u('a', `fill="${ext[0]}"`) + u('b', `fill="${ext[1]}"`) +
        (big ? `<path d="${g.k}" stroke="${c.ink}" stroke-width="2.5" stroke-linecap="round"/>` : '') +
        u('f', `fill="url(#${face})" stroke="${c.ink}" stroke-width="4" stroke-linejoin="round"`) +
        (dots ? `<path d="M-120 ${g.y + 1}H120V100H-120Z" fill="url(#${id}h)" opacity=".6" clip-path="url(#${id}c)"/>` : '')
    };
  }

  // The whole emblem as SVG. state: final, waiting, or ink (the flash on the hit).
  // only: 'v' or 's' draws that letter alone, with its speed lines (the falling layers).
  function art(state, { dark, h = 200, only } = {}) {
    const c = COL[state] || COL.final, id = P + (n++), big = h >= 90, full = !only, tone = big && full && state === 'final';
    const gut = dark ? '#111827' : c.rim;
    const v = letter(id + 'V', GV, id + 'v', c.vx, c, big, tone && c.vd), s = letter(id + 'S', GS, id + 's', c.sx, c, big, tone && c.sd);
    const pan = `<use href="#${id}p"`;
    let out = `<svg class="vsx-comic" viewBox="-120 -100 240 200" overflow="visible" aria-hidden="true"${dark ? ' data-dark=""' : ''}><defs>` +
      grad(id + 'v', c.v) + grad(id + 's', c.s) + v.defs + s.defs + `<path id="${id}p" d="${PAN}"/>`;
    if (full) {
      out += `<radialGradient id="${id}g" cx="0" cy="0" r="120" gradientUnits="userSpaceOnUse"><stop offset=".2" stop-color="${c.pan[0]}"/><stop offset=".6" stop-color="${c.pan[1]}"/><stop offset="1" stop-color="${c.pan[2]}"/></radialGradient>`;
      if (big && c.dot) out += `<pattern id="${id}h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="2.6" fill="${c.dot}"/></pattern>`;
      if (big && c.line) out += `<clipPath id="${id}c">${pan}/></clipPath>`;
    } else {
      const y = (only === 'v' ? VY : SY) - 59;
      out += fade(id + 't', only === 'v' ? c.vt : c.st, y, y - 165, 1) + fade(id + 'k', c.ink, y, y - 165, 0.9);
    }
    out += '</defs>';
    if (full) {
      out += `<g>${pan} fill="${c.ink}" opacity=".3" stroke="${c.ink}" stroke-width="7" stroke-linejoin="round" transform="translate(2 8)"/>` +
        `${pan} fill="${gut}" stroke="${gut}" stroke-width="13" stroke-linejoin="round"/>${pan} fill="url(#${id}g)"/>` +
        (big && c.dot ? `<path d="M-200-200H200V200H-200ZM-92 0a92 70 0 1 0 184 0a92 70 0 1 0-184 0Z" fill="url(#${id}h)" opacity=".55" clip-path="url(#${id}c)"/>` : '') +
        (big && c.line ? `<path d="${FOCUS}" fill="${c.line}" opacity=".8" clip-path="url(#${id}c)"/>` : '') +
        `${pan} fill="none" stroke="${c.ink}" stroke-width="${big ? 7 : 9}" stroke-linejoin="round"/></g>`;
    } else {
      out += `<path d="${only === 'v' ? TV : TS}" fill="url(#${id}t)" stroke="url(#${id}k)" stroke-width="2" stroke-linejoin="round"/>`;
    }
    if (only !== 's') out += v.rim;
    if (only !== 'v') out += s.rim;
    if (only !== 's') out += v.body;
    if (only !== 'v') out += s.body;
    if (big && state === 'final') out += `<path d="${only === 's' ? SHINE.s : only === 'v' ? SHINE.v : SHINE.v + SHINE.s}" fill="#fff"/>`;
    return out + '</svg>';
  }

  // Where the stage's slash runs, from .vs-cut's clip-path, or 57% / 43%.
  const slash = stage => {
    const W = stage.clientWidth, H = stage.clientHeight, cut = stage.querySelector('.vs-cut');
    const cp = cut && getComputedStyle(cut).clipPath, mt = cp && cp.match(/polygon\((.*)\)/);
    if (mt) {
      const pts = mt[1].replace(/^\s*(evenodd|nonzero)\s*,/, '').split(',').map(v => v.trim().split(/\s+/).map((x, i) => parseFloat(x) * (/%$/.test(x) ? (i ? H : W) / 100 : 1)));
      const tp = pts.filter(p => p[1] < H / 2), bt = pts.filter(p => p[1] >= H / 2), av = a => a.reduce((t, p) => t + p[0], 0) / a.length;
      if (tp.length && bt.length && pts.every(p => p.length === 2 && p.every(isFinite))) return { W, H, x1: av(tp), x2: av(bt) };
    }
    return { W, H, x1: 0.57 * W, x2: 0.43 * W };
  };

  NamePicker.look('comic', {
    size: 0.5,
    aspect: 1.2,
    hit: HIT,
    css: '',
    markup(state, { dark, h } = {}) { return art(state === 'waiting' ? 'waiting' : 'final', { dark, h }); },

    slam(box, { quick, stage } = {}) {
      const A = [], svg = box && box.querySelector('svg.vsx-comic');
      if (!svg) return A;
      const hit = HIT[quick ? 'quick' : 'normal'], end = quick ? 330 : 540, dark = svg.hasAttribute('data-dark');
      const bw = box.offsetWidth || 240, bh = box.offsetHeight || 200, sh = stage ? stage.clientHeight : bh * 2.2;
      const an = (el, kf, dur) => { const x = el.animate(kf, { duration: dur, fill: 'both' }); A.push(x); return x; };
      // The emblem's own two animations let go once they finish, so it rests exactly as markup('final') draws it.
      const rel = x => x.finished.then(() => x.effect.updateTiming({ fill: 'none' }), () => {});
      const layer = html => {
        const t = box.ownerDocument.createElement('div');
        t.innerHTML = html;
        const e = t.firstElementChild;
        e.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none';
        return box.appendChild(e);
      };
      const gone = (e, x) => x.finished.then(() => e.remove(), () => e.remove());
      const o = t => Math.min(1, t / end);
      // The emblem itself shows on the hit.
      rel(an(svg, [{ opacity: 0 }, { opacity: 0, offset: o(hit) }, { opacity: 1, offset: o(hit) + 0.001 }, { opacity: 1 }], end));
      // Each letter falls in its own column on speed lines, stretched tall, from fully above the stage.
      const u = bh / 200, drop = sh / 2 + bh * 0.65;
      [['v', 0, VX], ['s', quick ? 15 : 40, SX]].forEach(([c, t0, x]) => {
        const e = layer(art('final', { h: bh, only: c }));
        e.style.transformOrigin = `${r1(bw / 2 + x * u)}px ${r1(bh / 2 + 60 * u)}px`;
        const fall = `translateY(${r1(-drop)}px) scale(.9,1.25)`;
        gone(e, an(e, [
          { transform: fall, opacity: 1, offset: 0 }, { transform: fall, offset: o(t0), easing: quick ? 'cubic-bezier(.45,0,.95,.6)' : 'cubic-bezier(.4,.05,.9,.6)' },
          { transform: 'scale(.94,1.12)', opacity: 1, offset: o(hit) }, { transform: 'none', opacity: 0, offset: o(hit) + 0.001 }, { transform: 'none', opacity: 0 }], end));
      });
      // The hit: for a moment the panel turns to ink and the letters burn white, then the color pops in.
      const ink = layer(art('ink', { dark, h: bh }));
      ink.style.transformOrigin = '50% 50%';
      const hold = quick ? 50 : 70;
      gone(ink, an(ink, [{ opacity: 0, transform: 'scale(1,1.14)' }, { opacity: 0, transform: 'scale(1,1.14)', offset: o(hit) },
        { opacity: 1, transform: 'scale(1,1.14)', offset: o(hit) + 0.001, easing: 'cubic-bezier(.2,.8,.3,1)' }, { opacity: 1, transform: 'none', offset: o(hit + hold) },
        { opacity: 0, transform: 'none', offset: o(hit + hold) + 0.001 }, { opacity: 0, transform: 'none' }], end));
      // The landing: it squashes short on its floor and thuds down and up, rebounds, and settles. No sideways jolt, so the names keep their room.
      const j = Math.max(2, Math.round((stage ? Math.min(stage.clientWidth, sh) : bh * 2) * 0.012));
      const f = 'translate(-50%,-50%) ', q = (sx, sy, y = 0) => f + `translate(0px,${r1(y * j + (1 - sy) * bh * 0.45)}px) scale(${sx},${sy})`;
      rel(an(box, [{ transform: f + 'scale(1)', offset: 0 }, { transform: f + 'scale(1)', offset: o(hit) },
        { transform: q(1, 0.86, 0.8), offset: o(hit) + 0.001 }, { transform: q(1, 0.86, -0.6), offset: o(hit + 25) },
        { transform: q(1, 0.9, 0.4), offset: o(hit + 50), easing: 'ease-in-out' },
        { transform: q(0.99, 1.05), offset: o(hit + (quick ? 100 : 130)), easing: 'ease-in-out' }, { transform: f + 'scale(1)', offset: 1 }], end));
      return A;
    },

    impact(stage, { quick } = {}) {
      const A = [];
      if (!stage) return A;
      const doc = stage.ownerDocument, hit = HIT[quick ? 'quick' : 'normal'];
      const { W, H, x1, x2 } = slash(stage), m = Math.min(W, H) || 1;
      // Effects go under the slash and the names, so the names stay crisp. They burst from the emblem's center.
      const top = el => { while (el && el.parentNode !== stage) el = el.parentNode; return el; };
      const mine = top(stage.querySelector('svg.vsx-comic'));
      let cx = W / 2, cy = H / 2;
      if (mine) {
        const sr = stage.getBoundingClientRect(), br = mine.getBoundingClientRect(), k = sr.width ? W / sr.width : 1;
        if (br.width) { cx = (br.left + br.width / 2 - sr.left) * k; cy = (br.top + br.height / 2 - sr.top) * k; }
      }
      const ref = top(stage.querySelector('.vs-cut')) || [...stage.children].find(c => c !== mine && c.textContent.trim()) || mine;
      const add = (css, html) => {
        const e = doc.createElement('div'); e.style.cssText = 'position:absolute;pointer-events:none;' + css; e.innerHTML = html;
        return stage.insertBefore(e, ref || null);
      };
      const an = (e, kf, dur, easing = 'linear') => {
        const x = e.animate(kf, { duration: dur, delay: hit, easing, fill: 'both' }); A.push(x);
        // Overlays leave the stage when done, or when cancelled.
        x.finished.then(() => e.remove(), () => e.remove());
        return x;
      };
      // Focus lines cut in across the board, above and below the names: yellow on the red side, white on the blue.
      const R = Math.hypot(W, H) * 0.62, id = P + 'f' + (n++);
      let d = '';
      for (let i = 0; i < 30; i++) {
        const a = (i + (i % 3) * 0.31) / 30 * 2 * Math.PI, w = 0.022 + (i % 4) * 0.007, r0 = m * (0.3 + ((i * 7) % 5) * 0.03);
        if (Math.abs(Math.sin(a)) < 0.34) continue; // leave the names' rows clear
        const p = (r, b) => r1(cx + Math.cos(b) * r) + ' ' + r1(cy + Math.sin(b) * r);
        d += `M${p(r0, a)}L${p(R, a - w)} ${p(R, a + w)}Z`;
      }
      const fl = add(`left:0;top:0;width:${W}px;height:${H}px`,
        `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible"><defs><clipPath id="${id}"><path d="M${-W} ${-H}H${r1(2 * x1 - x2)}L${r1(2 * x2 - x1)} ${2 * H}H${-W}Z"/></clipPath></defs>` +
        `<path d="${d}" fill="#fff"/><path d="${d}" fill="#ffe14d" clip-path="url(#${id})"/></svg>`);
      // They hold still, then fade out smoothly; only their opacity changes, so the board never redraws them.
      an(fl, [{ opacity: 0 }, { opacity: 1, offset: 0.001 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], quick ? 170 : 240);
      // Comic stars and dots fly out from behind the panel, into the open board above and below it, clear of the names.
      const star = 'M0-10Q0 0 10 0Q0 0 0 10Q0 0-10 0Q0 0 0-10Z', dot = 'M-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z';
      [[-0.36, -0.36, 1, '#fff'], [-0.03, -0.42, 1, '#ffe14d'], [0.44, -0.3, 1, '#fff'], [-0.44, 0.3, 1, '#ffe14d'], [0.03, 0.42, 1, '#fff'], [0.36, 0.36, 1, '#5eead4'],
       [-0.18, -0.42, 0, '#fff'], [0.26, -0.4, 0, '#ffe14d'], [0.18, 0.42, 0, '#ffe14d'], [-0.26, 0.4, 0, '#5eead4']].forEach(([fx, fy, s, col], i) => {
        const sz = m * (s ? 0.11 : 0.07), x = fx * m, y = fy * m;
        const e = add(`left:${r1(cx - sz / 2)}px;top:${r1(cy - sz / 2)}px;width:${r1(sz)}px;height:${r1(sz)}px`,
          `<svg viewBox="-12 -12 24 24" width="100%" height="100%" style="display:block;overflow:visible"><path d="${s ? star : dot}" fill="${col}" stroke="#111827" stroke-width="2.6" stroke-linejoin="round"/></svg>`);
        const tf = (k, rot, sc) => `translate(${r1(x * k)}px,${r1(y * k)}px) rotate(${rot}deg) scale(${sc})`, spin = i % 2 ? -1 : 1;
        an(e, [{ opacity: 0, transform: tf(0.3, 0, 0.5) }, { opacity: 1, transform: tf(0.3, 0, 0.5), offset: 0.001, easing: 'cubic-bezier(.2,.8,.3,1)' },
          { opacity: 1, transform: tf(1, 140 * spin, 1.1), offset: 0.6, easing: 'ease-in' }, { opacity: 0, transform: tf(1.1, 200 * spin, 0.4) }], quick ? 260 : 380);
      });
      return A;
    }
  });
})();
