/*
 * Name Picker style: Spinning wheel.
 * A game-show wheel with SPIN in the middle and the arrow at 3 o'clock, so the winning name reads left to right. A spin
 * takes about 4 seconds (with Quick about 1½), then the winners show in a banner over the bottom of the wheel.
 * Several winners: one spin with up to five numbered arrows over the top half of the wheel. The names are dealt again
 * while the wheel winds up, so that each arrow lands on its winner, and the banner lists them 1, 2, 3 in arrow order.
 * No repeats: names picked earlier leave the wheel as the next spin starts, so the wheel shows who is still in.
 * The host draws the winners; the wheel only lands on them. How a style plugs in: the comment at the top of index.html.
 */
(() => {
  const TAU = Math.PI * 2;
  // How long each part takes (ms): the wind-up, the spin (it slows down to a stop), the arrows moving into place and
  // the names being dealt again (during the wind-up), and the winners lighting up. About 4¼ s; with Quick about 1½ s.
  const SPEED = {
    normal: { wind: 250, spin: 3400, turns: 4, layout: 450, reveal: 550 },
    quick: { wind: 110, spin: 1060, turns: 2, layout: 220, reveal: 330 }
  };
  // The wheel's parts, as parts of its radius R. `over`: how far the arrows reach outside the wheel.
  const G = { hub: 0.25, track: 0.035, textOut: 0.86, tip: 0.91, pivot: 1.07, half: 0.064, over: 1.14 };
  const SMALLEST = 8;   // px: the smallest letters on the slices (names are shortened, or left off, rather than smaller)

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (a, m) => ((a % m) + m) % m;
  const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  // A colour (0-7) for each place on the wheel, so that no two slices side by side (the last and first too) match.
  function fixColors(cols) {
    const K = cols.length;
    const other = (a, b) => { for (let c = 0; c < 8; c++) if (c !== a && c !== b) return c; return 0; };
    for (let i = 1; i < K; i++) if (cols[i] === cols[i - 1]) cols[i] = other(cols[i - 1], cols[(i + 1) % K]);
    if (K > 1 && cols[K - 1] === cols[0]) cols[K - 1] = other(cols[K - 2], cols[0]);
    return cols;
  }
  // Where the arrows go for n winners on a wheel of K slices: whole slices back from the arrow at 3 o'clock (0, -1, …),
  // left to right, which is how they are numbered. Several arrows fan out over the top half, 9 o'clock to 3 o'clock,
  // so the banner over the bottom never hides one. With too few slices for that (the last few names of a round, or
  // fewer names than winners) they go all round the wheel, and the banner moves beside or under it (see layout()).
  // Each arrow points at the middle of a slice, so all of them can stop inside their slices at once.
  function pointerOffsets(K, n) {
    if (K < 1) return [0];
    n = clamp(n, 1, K);
    if (n === 1) return [0];
    const half = Math.floor(K / 2), out = [];
    if (half >= n - 1) for (let i = 0; i < n; i++) out.push(Math.round(i * half / (n - 1)) - half);
    else { const last = Math.round((n - 1) * K / n); for (let i = 0; i < n; i++) out.push(Math.round(i * K / n) - last); }
    return out;
  }
  const pointerAngles = (K, n) => pointerOffsets(K, n).map(e => TAU + e * TAU / Math.max(1, K));
  const allRound = (K, n) => n > 1 && Math.floor(K / 2) < Math.min(n, K) - 1;   // (pointerOffsets' second case)
  // A name as the letters a reader sees, so that shortening it never cuts an emoji or an accented letter in half.
  const SEG = (() => { try { return new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) { return null; } })();
  const letters = text => SEG ? Array.from(SEG.segment(text), x => x.segment) : Array.from(text);
  // On the wheel: everyone still in the draw, and the last winners (they leave as the next spin starts).
  const onWheel = view => view.names.map((_, i) => i).filter(i => !view.picked[i] || view.winners.includes(i));

  NamePicker.register('wheel', {
    css: `
.wheel { position: absolute; inset: 0; overflow: hidden; line-height: 1.2; --wheel-u: 2px; }
.wheel *, .wheel *::before, .wheel *::after { box-sizing: border-box; }
/* (Taps go through the wheel picture, so the window can be dragged from it; SPIN is a button on top.) */
.wheel-canvas { position: absolute; left: 0; top: 0; display: block; pointer-events: none; }
.wheel-hub { position: absolute; margin: 0; padding: 0; min-width: 0; height: auto; border-radius: 50%;
  border: max(2px, calc(var(--wheel-u) * .7)) solid var(--b21-surface); background: var(--b21-accent); color: var(--b21-on-accent);
  font-family: inherit; font-weight: 800; letter-spacing: .04em; line-height: 1; white-space: nowrap;
  display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;
  box-shadow: 0 0 0 max(1px, calc(var(--wheel-u) * .25)) var(--b21-border); transition: transform .12s ease-out; -webkit-tap-highlight-color: transparent; }
.wheel-hub:active { transform: scale(.94); }
.wheel-hub[hidden] { display: none; }
.wheel-hubsub { font-size: .6em; margin-top: .15em; letter-spacing: 0; }
.wheel-hubsub:empty { display: none; }
.wheel-again { letter-spacing: 0; }
.wheel-again .wheel-hubtxt { font-size: .62em; white-space: normal; max-width: 4.6em; text-align: center; line-height: 1.05; }
/* The winners' banner, over the bottom of the wheel; "apart" from it (under it in a tall, narrow window, or beside or
   under it when the arrows go all round) it shows, dashed, before the winners are in. */
.wheel-banner { position: absolute; display: flex; padding: .35% 3%; border-radius: calc(var(--wheel-u) * 3); background: var(--b21-bg);
  border: max(2px, calc(var(--wheel-u) * .8)) solid var(--np-win); box-shadow: 0 4px 16px rgba(0, 0, 0, .2);
  box-shadow: 0 var(--wheel-u) calc(var(--wheel-u) * 5) color-mix(in srgb, var(--b21-text) 28%, transparent);
  pointer-events: none; opacity: 0; visibility: hidden; transform: translateY(6%) scale(.97);
  transition: opacity .22s ease-out, transform .22s ease-out, visibility 0s linear .22s; }
.wheel-banner.wheel-show, .wheel-apart .wheel-banner.wheel-hinting { opacity: 1; visibility: visible; transform: none; transition: opacity .22s ease-out, transform .22s ease-out; }
.wheel-apart .wheel-banner.wheel-hinting { border-color: var(--b21-border); border-style: dashed; box-shadow: none; background: transparent; }
.wheel-banner.wheel-pop { animation: wheel-pop .5s ease-out; }
.wheel-fitbox { position: relative; flex: 1; overflow: hidden; }
.wheel-fit { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; text-align: center; }
.wheel-names { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: .08em .55em; width: 100%; }
.wheel-name { display: inline-flex; align-items: center; gap: .22em; white-space: nowrap; font-weight: 800; line-height: 1.12; color: var(--b21-text); }
.wheel-num { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.2em; height: 1.2em; border-radius: 50%;
  background: var(--np-win); color: var(--np-ink); font-size: .48em; font-weight: 800; }
/* A long full name that would be small on one line may go onto two, at a space; one too long for any line breaks
   anywhere rather than being cut off (see fitBanner()). The number stays beside its first line. */
.wheel-wrap .wheel-name { white-space: normal; align-items: flex-start; }
.wheel-wrap .wheel-num { margin-top: .57em; }
.wheel-anywhere .wheel-nm { overflow-wrap: anywhere; }
.wheel-note { margin-top: .2em; font-size: .34em; font-weight: 700; color: var(--b21-muted); white-space: nowrap; }
.wheel-hint { font-size: .42em; font-weight: 600; color: var(--b21-muted); white-space: nowrap; }
@keyframes wheel-pop { 0% { transform: scale(.8); opacity: 0; } 55% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
/* Confetti (see burst()) */
.wheel-bits { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.wheel-bit { position: absolute; border-radius: 1px; animation: wheel-bit linear both; }
@keyframes wheel-bit {
  0% { transform: translate(var(--p0)) rotate(0); opacity: 1; }
  50% { transform: translate(var(--p1)) rotate(calc(var(--r) / 2)); opacity: 1; }
  100% { transform: translate(var(--p2)) rotate(var(--r)); opacity: 0; }
}
/* A pick shown without its show (reduce motion, or picked a while ago in another copy): the winners fade in. */
.wheel-fade .wheel-canvas { animation: wheel-dim .3s ease-out both; }
.wheel-fade .wheel-banner.wheel-show { animation: wheel-in .3s ease-out both; }
@keyframes wheel-dim { from { opacity: .3; } to { opacity: 1; } }
@keyframes wheel-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .wheel-banner { transform: none !important; transition: opacity .25s, visibility 0s linear .25s; }
  .wheel-banner.wheel-show { transition: opacity .25s; }
  .wheel-hub { transition: none; transform: none !important; }
  .wheel-banner.wheel-pop { animation: none; }
}
`,
    mount(root, host) {
      const box = host.el('div', 'wheel', root);
      const canvas = host.el('canvas', 'wheel-canvas', box);
      canvas.setAttribute('aria-hidden', 'true');
      const ctx = canvas.getContext('2d');
      const banner = host.el('div', 'wheel-banner', box);
      const fitbox = host.el('div', 'wheel-fitbox', banner), fit = host.el('div', 'wheel-fit', fitbox);
      const bits = host.el('div', 'wheel-bits', box);
      // SPIN picks, as the main button does. (That button is the one for the keyboard and screen readers.)
      const hub = host.el('button', 'wheel-hub', box);
      hub.type = 'button'; hub.tabIndex = -1; hub.setAttribute('aria-hidden', 'true');
      const hubTxt = host.el('span', 'wheel-hubtxt', hub, 'SPIN'), hubSub = host.el('span', 'wheel-hubsub', hub);
      hub.addEventListener('click', () => host.pick());
      // (A key held down on SPIN, once a tap has put the focus there, picks once and not again and again.)
      hub.addEventListener('keydown', e => { if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault(); });

      let view = null;             // what the host gave last
      let slots = [];              // the wheel, in order: { idx (entry), name, w (share of the wheel), lab (label opacity), col, gone }
      let rot = 0;                 // the wheel's turn, radians clockwise
      let ptrs = [], ptrT0 = 0, ptrDur = 0;   // arrows: { a (angle), al (opacity), num, kickT, kickAmp, under }, moving for ptrDur ms
      let ring = false;            // the arrows go all round the wheel (too few slices to fan them over the top half)
      let current = [];            // the winners on show (entries), in arrow order
      let everyone = false;        // No repeats: everyone has been picked
      let hl = 0, pop = 0;         // the winners lit up (0-1), and their little bounce
      let anim = null, raf = 0, dead = false;
      let tok = null, geo = { W: 1, H: 1, dpr: 1, u: 1, pad: 4, R: 0, cx: 0, cy: 0 };
      let labels = new Map(), labelsKey = '', labelsDirty = true, labelInfo = { shown: 0, min: 0, max: 0, cut: 0 };
      let lastT = 0, lastRot = 0, lastClick = 0;

      // ---- Colours and letters, from the board's theme (read again when it changes)
      function readTokens() {
        const t = (k, d) => host.token(k) || d;
        tok = { bg: t('bg', '#fff'), stage: t('surface', '#f9fafb'), text: t('text', '#1f2937'), muted: t('muted', '#6b7280'), border: t('border', '#e5e7eb'),
          accent: t('accent', '#2563eb'), onAccent: t('on-accent', '#fff'), win: t('np-win', '#f59e0b'), ink: t('np-ink', '#111827'),
          c: [1, 2, 3, 4, 5, 6, 7, 8].map(i => t('np-c' + i, '#ddd')), font: t('font', 'system-ui, sans-serif') };
      }

      // ---- The wheel's slices
      function setSlots(idxs, cols) {
        cols = fixColors(cols || idxs.map((_, p) => p % 8));
        slots = idxs.map((idx, p) => ({ idx, name: view.names[idx], w: 1, lab: 1, col: cols[p], gone: false }));
        labelsDirty = true;
      }
      function removeGone() {
        if (!slots.some(s => s.gone)) return;
        slots = slots.filter(s => !s.gone);
        const cols = fixColors(slots.map(s => s.col));
        slots.forEach((s, i) => { s.col = cols[i]; });
        labelsDirty = true;
      }
      const isEntry = (s, v) => s.name === v.names[s.idx];
      // Each slice's start angle and size, as the wheel is turned now.
      function geoms() {
        let total = 0;
        for (const s of slots) total += s.w;
        const out = [];
        let acc = rot;
        for (const s of slots) { const sp = total > 0 ? s.w / total * TAU : 0; out.push({ s, a0: acc, sp }); acc += sp; }
        return out;
      }
      // The slice at an angle (radians, clockwise from 3 o'clock).
      function sliceAt(angle, gs) {
        const local = mod(angle - rot, TAU);
        let acc = 0;
        for (const g of gs) { acc += g.sp; if (local < acc - 1e-9) return g.s; }
        return gs.length ? gs[gs.length - 1].s : null;
      }

      // ---- Arrows. They are matched from the right, so the 3 o'clock arrow stays put when the number changes; extra
      // ones fade in (or out) where they stand.
      function aimPointers(angles, dur) {
        const live = ptrs.filter(p => p.al1 > 0), shift = live.length - angles.length, next = [];
        for (let j = 0; j < shift; j++) { const p = live[j]; p.a0 = p.a1 = p.a; p.al0 = p.al; p.al1 = 0; next.push(p); }
        angles.forEach((a, i) => {
          const j = i + shift;
          const p = j >= 0 && j < live.length ? live[j] : { a, al: 0, kickT: 0, kickAmp: 0, under: null };
          p.a0 = p.a; p.al0 = p.al; p.a1 = a; p.al1 = 1; p.num = i + 1;
          next.push(p);
        });
        ptrs = next; ptrT0 = performance.now(); ptrDur = dur;
        if (!dur) snapPointers();
      }
      function snapPointers() {
        ptrs = ptrs.filter(p => p.al1 > 0);
        ptrs.forEach(p => { p.a = p.a0 = p.a1; p.al = p.al0 = 1; p.kickAmp = 0; p.under = null; });
        ptrDur = 0;
      }
      function stepPointers(now) {
        if (!ptrDur) return;
        const t = clamp((now - ptrT0) / ptrDur, 0, 1), e = easeInOut(t);
        ptrs.forEach(p => { p.a = lerp(p.a0, p.a1, e); p.al = lerp(p.al0, p.al1, e); });
        if (t >= 1) snapPointers();
      }
      // The entries under the arrows, left to right (what the wheel has landed on).
      function underPointers() { const gs = geoms(); return ptrs.filter(p => p.al1 > 0).map(p => { const s = sliceAt(p.a, gs); return s ? s.idx : -1; }); }

      // ---- Layout: the wheel as big as the stage allows, with room above it for the arrows over the top; the banner
      // over the bottom of the wheel, never over SPIN or the arrows at 3 and 9 o'clock (in a tall, narrow window, under
      // the wheel). When the arrows go all round, there is room for them below the wheel too, and the banner goes
      // beside the wheel (or under it, if that leaves the wheel bigger), so that every arrow can be seen.
      function place(el, r) {
        el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
        el.style.width = Math.max(0, r.w) + 'px'; el.style.height = Math.max(0, r.h) + 'px';
      }
      function layout() {
        const W = box.clientWidth, H = box.clientHeight;
        if (W < 2 || H < 2) { geo.R = 0; return; }
        // (The board may draw the window bigger than its size here: more pixels then, so the names stay sharp.)
        const dpr = clamp((window.devicePixelRatio || 1) * host.zoom(), 1, 3);
        const u = Math.min(W, H) / 100, pad = clamp(u * 3, 4, 24);
        box.style.setProperty('--wheel-u', u.toFixed(2) + 'px');
        const tall = G.over + (ring ? G.over : 1 + G.track);   // the wheel's height with its arrows, in radii
        const fitR = (w, h) => Math.max(0, Math.min((w - 2 * pad) / (2 * G.over), (h - 2 * pad) / tall));
        const where = ring ? (fitR(W * 0.6, H) >= fitR(W, H * 0.73) ? 'beside' : 'under') : H >= W * 1.15 ? 'under' : 'over';
        const areaH = where === 'under' ? H * 0.73 : H;
        const R = fitR(where === 'beside' ? W * 0.6 : W, areaH), wide = 2 * G.over * R;
        // Beside: the wheel on the left, the banner on the right, the two together in the middle of the stage.
        const bannerW = where === 'beside' ? Math.min(W - wide - 3 * pad, wide * 1.5) : 0;
        const cx = where === 'beside' ? (W - wide - pad - bannerW) / 2 + wide / 2 : W / 2, cy = (areaH - tall * R) / 2 + G.over * R;
        // The picture covers the wheel and its arrows only, so a spin repaints no more than it must (slow Chromebooks).
        const side = Math.ceil(2 * G.over * R + 4), ox = Math.round(cx - side / 2), oy = Math.round(cy - side / 2);
        place(canvas, { x: ox, y: oy, w: side, h: side });
        geo = { W, H, dpr, u, pad, R, cx, cy, ox, oy, side, scale: 1, where };
        const hr = R * G.hub;
        hub.hidden = hr < 10;
        place(hub, { x: cx - hr, y: cy - hr, w: 2 * hr, h: 2 * hr });
        hub.style.fontSize = Math.max(8, hr * 0.5) + 'px';
        box.classList.toggle('wheel-apart', where !== 'over');
        if (where === 'under') place(banner, { x: pad, y: areaH, w: W - 2 * pad, h: H - areaH - pad });
        else if (where === 'beside') { const bh = Math.min(H - 2 * pad, 2 * R); place(banner, { x: cx + wide / 2 + pad, y: cy - bh / 2, w: bannerW, h: bh }); }
        else {
          const bh = H * (current.length > 1 ? 0.4 : everyone ? 0.34 : 0.3);
          const top = Math.max(H - pad - bh, cy + hr + Math.max(2, u));
          const bw = Math.min(W - 2 * pad, Math.max(H * 1.35, W * 0.7));
          place(banner, { x: (W - bw) / 2, y: top, w: bw, h: H - pad - top });
        }
        labelsDirty = true;
        fitBanner();
      }
      // The biggest letters at which the banner's names fit it (they wrap, a whole name to a line at most). If that
      // leaves them small (a long full name), a name may go onto two lines at a space, when that makes the letters
      // clearly bigger; and a name too long for any line breaks anywhere, rather than being cut off.
      function fitBanner() {
        const bw = fitbox.clientWidth, bh = fitbox.clientHeight;
        if (bw < 4 || bh < 4 || !fit.firstChild) return;
        const top = Math.max(6, Math.min(bh, geo.H * (current.length > 1 ? 0.16 : 0.2)));
        const fits = () => fit.scrollWidth <= bw + 0.5 && fit.offsetHeight <= bh + 0.5;
        const use = (wrap, px) => {
          fitbox.classList.toggle('wheel-wrap', wrap > 0); fitbox.classList.toggle('wheel-anywhere', wrap > 1);
          fitbox.style.fontSize = px + 'px';
        };
        const biggest = wrap => {
          let lo = 6, hi = top;
          for (let i = 0; i < 9; i++) {
            const mid = (lo + hi) / 2;
            use(wrap, mid);
            if (fits()) lo = mid; else hi = mid;
          }
          const px = Math.floor(lo * 10) / 10;
          use(wrap, px);
          return { wrap, px, ok: fits() };
        };
        let best = biggest(0);
        if (!best.ok || best.px < top * 0.6) { const b = biggest(1); if (b.ok && (!best.ok || b.px > best.px * 1.15)) best = b; }
        if (!best.ok) best = biggest(2);
        use(best.wrap, best.px);
      }

      // ---- The names on the slices: as big as the slices allow, all about one size. Names much longer than most, or
      // too long for the window, are shortened ("Maximil…"); with too many names for the window (slices too thin for
      // 8 px letters), the slices show colour only. The banner always shows whole names.
      function computeLabels() {
        labelsDirty = false;
        const K = slots.length, R = geo.R;
        const key = K + '|' + R.toFixed(1) + '|' + tok.font + '|' + slots.map(s => s.name).join('\n');
        if (key === labelsKey) return;
        labelsKey = key;
        labels = new Map();
        labelInfo = { shown: 0, min: 0, max: 0, cut: 0 };
        if (!K || R < 20) return;
        const s = K === 1 ? 1 : Math.sin(Math.min(Math.PI / K, Math.PI / 2));
        const rOut = R * G.textOut, rIn = R * (G.hub + 0.08);
        // Too many names for the window: halfway out, a slice is too thin for 8 px letters. Colour only.
        if (1.7 * s * (rIn + rOut) / 2 < SMALLEST) return;
        const cap = Math.max(SMALLEST, R * (K <= 2 ? 0.17 : K <= 6 ? 0.14 : 0.12));
        ctx.font = '700 100px ' + tok.font;
        const ms = slots.map(sl => ctx.measureText(sl.name).width / 100);
        // The letters fill at most 85% of the slice's width where the name starts (names end near the rim).
        const thick = m => 1.7 * rOut * s / (1 + 1.7 * m * s);
        const len = m => (rOut - rIn) / m;
        const sorted = ms.slice().sort((a, b) => a - b);
        const typical = sorted[Math.floor((sorted.length - 1) * 0.6)];
        const F = Math.max(SMALLEST, Math.min(cap, thick(typical), len(typical)));
        const floor = Math.max(SMALLEST, F * 0.62);
        slots.forEach((sl, i) => {
          let text = sl.name, m = ms[i], f = Math.min(F, thick(m), len(m));
          if (f < floor) {
            f = floor;
            // (A whole letter at a time, and never ending in a space or a joiner.)
            const parts = letters(text);
            let cut = text;
            while (parts.length > 2 && (f > thick(m) + 0.01 || f > len(m) + 0.01)) {
              do parts.pop(); while (parts.length > 1 && /^[\s\u200d\ufe0e\ufe0f]*$/.test(parts[parts.length - 1]));
              cut = parts.join('');
              m = ctx.measureText(cut + '…').width / 100;
            }
            text = cut + '…';
            labelInfo.cut++;
          }
          labels.set(sl.idx, { text, font: '700 ' + f.toFixed(2) + 'px ' + tok.font });
          labelInfo.min = labelInfo.shown ? Math.min(labelInfo.min, f) : f;
          labelInfo.max = Math.max(labelInfo.max, f);
          labelInfo.shown++;
        });
      }

      // ---- Drawing (one call draws everything: the wheel only moves while a show runs)
      function segPath(cx, cy, a0, sp, r, K) {
        ctx.beginPath();
        if (K === 1) { ctx.arc(cx, cy, r, 0, TAU); return; }
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a0, a0 + sp);
        ctx.closePath();
      }
      function drawLabel(cx, cy, R, g) {
        const lab = labels.get(g.s.idx);
        if (!lab || g.s.lab <= 0.02) return;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(g.a0 + g.sp / 2);
        ctx.font = lab.font;
        ctx.globalAlpha = g.s.lab;
        ctx.fillText(lab.text, R * G.textOut, 0);
        ctx.restore();
      }
      // While the wheel moves, its picture has at most about 1100 pixels across: sharpness can't be seen in a blur, and
      // big, sharp screens on slow graphics stay smooth. It is drawn sharp again as soon as the wheel stops.
      function sizeCanvas() {
        const side = geo.side || 1, scale = anim ? Math.min(geo.dpr, Math.max(1, 1100 / side)) : geo.dpr;
        const cs = Math.max(1, Math.round(side * scale));
        if (canvas.width !== cs || canvas.height !== cs) { canvas.width = cs; canvas.height = cs; }
        geo.scale = cs / side;
      }
      function draw(now) {
        const { R } = geo, cx = geo.cx - geo.ox, cy = geo.cy - geo.oy;
        sizeCanvas();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!view || R < 8) return;
        if (!tok) readTokens();
        ctx.setTransform(geo.scale, 0, 0, geo.scale, 0, 0);
        if (labelsDirty) computeLabels();
        const K = slots.length, lw = Math.max(1, R * 0.008);
        ctx.globalAlpha = 1;
        // The rim
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1 + G.track), 0, TAU);
        ctx.fillStyle = tok.bg; ctx.fill();
        ctx.lineWidth = lw; ctx.strokeStyle = tok.border; ctx.stroke();
        if (!K) {
          // Nobody left on the wheel: an empty, dashed wheel.
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, TAU);
          ctx.setLineDash([R * 0.04, R * 0.04]);
          ctx.lineWidth = Math.max(1.5, R * 0.012); ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const gs = geoms(), win = new Set(hl > 0 ? current : []);
          for (const g of gs) {
            if (g.sp <= 0) continue;
            segPath(cx, cy, g.a0, g.sp, R, K);
            ctx.fillStyle = tok.c[g.s.col]; ctx.fill();
          }
          if (K > 1) {
            ctx.beginPath();
            for (const g of gs) { ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(g.a0), cy + R * Math.sin(g.a0)); }
            ctx.strokeStyle = tok.stage; ctx.lineWidth = Math.max(1, R * 0.007); ctx.stroke();
          }
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = tok.ink;
          for (const g of gs) drawLabel(cx, cy, R, g);
          if (win.size) {
            // The winners: everything else dimmed, the winners' slices lifted out and ringed in gold.
            ctx.save();
            ctx.globalAlpha = 0.62 * hl;
            ctx.fillStyle = tok.stage;
            for (const g of gs) if (!win.has(g.s.idx)) { segPath(cx, cy, g.a0, g.sp, R + 0.5, K); ctx.fill(); }
            ctx.restore();
            const r = R * (1 + 0.03 * hl + 0.025 * pop);
            ctx.lineJoin = 'round';
            for (const g of gs) {
              if (!win.has(g.s.idx)) continue;
              segPath(cx, cy, g.a0, g.sp, r, K);
              ctx.fillStyle = tok.c[g.s.col]; ctx.fill();
              ctx.lineWidth = Math.max(2, R * (0.028 + 0.012 * pop)) * hl; ctx.strokeStyle = tok.win; ctx.stroke();
              ctx.fillStyle = tok.ink;
              drawLabel(cx, cy, R, g);
            }
          }
          // Pegs on the rim between the slices (what the clicker knocks against)
          if (K > 1 && K <= 72) {
            const pr = Math.max(1.5, R * 0.014), rr = R * (1 + G.track / 2);
            ctx.beginPath();
            for (const g of gs) {
              if (g.sp <= 0.0001 && g.s.gone) continue;
              const x = cx + rr * Math.cos(g.a0), y = cy + rr * Math.sin(g.a0);
              ctx.moveTo(x + pr, y); ctx.arc(x, y, pr, 0, TAU);
            }
            ctx.fillStyle = tok.muted; ctx.fill();
          }
        }
        // The ring round SPIN (SPIN itself is a button on top)
        ctx.beginPath();
        ctx.arc(cx, cy, R * G.hub * 1.1, 0, TAU);
        ctx.fillStyle = tok.bg; ctx.fill();
        ctx.lineWidth = lw; ctx.strokeStyle = tok.border; ctx.stroke();
        drawPointers(now);
      }
      const flapOf = (p, now) => p.kickAmp ? p.kickAmp * Math.exp(-(now - p.kickT) / 90) : 0;
      function drawPointers(now) {
        const { R } = geo, cx = geo.cx - geo.ox, cy = geo.cy - geo.oy;
        const many = ptrs.filter(p => p.al1 > 0).length > 1, won = hl > 0 && current.length > 0;
        for (const p of ptrs) {
          if (p.al <= 0.01) continue;
          const flap = flapOf(p, now);
          ctx.save();
          ctx.globalAlpha = p.al;
          ctx.translate(cx, cy); ctx.rotate(p.a); ctx.translate(R * G.pivot, 0); ctx.rotate(-0.5 * flap);
          const tipX = -R * (G.pivot - G.tip), h = R * G.half;
          ctx.beginPath();
          ctx.moveTo(tipX, 0); ctx.lineTo(0, -h); ctx.arc(0, 0, h, -Math.PI / 2, Math.PI / 2); ctx.closePath();
          ctx.fillStyle = won ? tok.win : tok.accent; ctx.fill();
          ctx.lineWidth = Math.max(1.5, R * 0.012); ctx.strokeStyle = tok.stage; ctx.stroke();
          if (many) {
            // The arrow's number on its pivot, kept upright: arrows 1, 2, 3 match the numbers in the banner.
            ctx.rotate(0.5 * flap - p.a);
            const br = Math.max(7, R * 0.062);
            ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU);
            ctx.fillStyle = won ? tok.win : tok.accent; ctx.fill(); ctx.stroke();
            ctx.fillStyle = won ? tok.ink : tok.onAccent;
            ctx.font = '800 ' + (br * 1.25).toFixed(1) + 'px ' + tok.font;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(p.num || 1), 0, br * 0.06);
          }
          ctx.restore();
        }
      }
      // Confetti from the arrows as the wheel stops: little pieces the browser animates by itself (CSS), so the
      // wheel's picture isn't repainted for them. They go when the show ends.
      function burst(life) {
        const { cx, cy, R } = geo, per = current.length > 2 ? 8 : 14, t = life / 1000, g = R * 2.6, frag = document.createDocumentFragment();
        for (const p of ptrs) {
          const x = cx + Math.cos(p.a) * R * G.pivot, y = cy + Math.sin(p.a) * R * G.pivot;
          for (let k = 0; k < per; k++) {
            // (Decoration only: Math.random is fine here.)
            const dir = p.a + (Math.random() - 0.5) * 1.9, sp = R * (1.4 + Math.random() * 1.8);
            const vx = Math.cos(dir) * sp, vy = Math.sin(dir) * sp - R * 0.6, s = R * (0.022 + Math.random() * 0.016);
            const at = f => (x + vx * t * f).toFixed(1) + 'px, ' + (y + vy * t * f + 0.5 * g * (t * f) * (t * f)).toFixed(1) + 'px';
            const bit = host.el('i', 'wheel-bit', frag);
            bit.style.cssText = `--p0: ${at(0)}; --p1: ${at(0.5)}; --p2: ${at(1)}; --r: ${((Math.random() - 0.5) * 14 * t).toFixed(2)}rad;`
              + ` width: ${(2 * s).toFixed(1)}px; height: ${(0.9 * s).toFixed(1)}px; left: ${(-s).toFixed(1)}px; top: ${(-0.45 * s).toFixed(1)}px;`
              + ` background: ${k % 9 === 8 ? tok.win : tok.c[k % 8]}; animation-duration: ${life}ms;`;
          }
        }
        bits.appendChild(frag);
      }

      // ---- The banner and SPIN
      function renderBanner(popIt, spinning) {
        fit.textContent = '';
        banner.classList.remove('wheel-pop');
        if (current.length) {
          const wrap = host.el('div', 'wheel-names', fit);
          current.forEach((idx, i) => {
            const chip = host.el('span', 'wheel-name', wrap);
            if (current.length > 1) host.el('span', 'wheel-num', chip, String(i + 1));
            host.el('span', 'wheel-nm', chip, view.names[idx]);
          });
          if (everyone) host.el('div', 'wheel-note', fit, 'Everyone has been picked');
          banner.classList.add('wheel-show'); banner.classList.remove('wheel-hinting');
          if (popIt) { void banner.offsetWidth; banner.classList.add('wheel-pop'); }
        } else {
          // (Only seen when the banner is apart from the wheel, under or beside it: an empty banner waiting for the winners.)
          host.el('div', 'wheel-hint', fit, spinning ? '' : view && !view.next ? 'Everyone has been picked' : 'Tap SPIN to pick');
          banner.classList.remove('wheel-show'); banner.classList.add('wheel-hinting');
        }
      }
      function renderHub() {
        const again = !!view && view.noRepeats && !view.next;
        hub.classList.toggle('wheel-again', again);
        hubTxt.textContent = again ? 'Start over' : 'SPIN';
        hubSub.textContent = !again && view && view.next > 1 ? '× ' + view.next : '';
      }

      // ---- The show
      function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }
      function stopAnim() {
        anim = null;
        if (raf) cancelAnimationFrame(raf);
        raf = 0; lastT = 0;
        if (bits.firstChild) bits.textContent = '';
      }
      function frame(now) {
        raf = 0;
        const a = anim;
        if (dead || !a) return;
        stepPointers(now);
        if (a.phase === 'spin') stepSpin(a, now);
        if (a.phase === 'reveal') stepReveal(a, now);
        if (anim !== a) return;   // (finished: drawn and handed back to the host)
        clicker(now);
        draw(now);
        raf = requestAnimationFrame(frame);
      }
      function stepSpin(a, now) {
        const T = a.T, t = now - a.t0;
        if (t < T.wind) rot = lerp(a.rot0, a.base, easeInOut(t / T.wind));
        else rot = lerp(a.base, a.end, easeOut(Math.min(1, (t - T.wind) / T.spin)));
        const L = Math.min(1, t / T.layout);
        if (a.multi) {
          // The names fade out (the ones picked before close up), are dealt again, and fade back in.
          if (L < 0.5) { const e = 1 - easeInOut(L * 2); slots.forEach(s => { s.lab = e; if (s.gone) s.w = e; }); }
          else {
            if (!a.swapped) { slots = a.finalSlots; a.swapped = true; labelsDirty = true; }
            const e = easeInOut(L * 2 - 1);
            slots.forEach(s => { s.lab = e; });
          }
        } else {
          const e = 1 - easeInOut(L);
          slots.forEach(s => { if (s.gone) { s.w = e; s.lab = e; } });
          if (L >= 1) removeGone();
        }
        if (t >= T.wind + T.spin) {
          settle(a);
          a.phase = 'reveal'; a.t1 = now; hl = 0;
          renderBanner(true);
          layout();
          host.sound('chime');
          burst(a.T.reveal);
        }
      }
      function stepReveal(a, now) {
        const T = a.T.reveal, t = now - a.t1;
        hl = easeOut(Math.min(1, t / (T * 0.55)));
        pop = Math.sin(Math.PI * Math.min(1, t / T));
        if (t < T) return;
        stopAnim();
        hl = 1; pop = 0;
        ptrs.forEach(p => { p.kickAmp = 0; });
        draw(now);
        host.done();
      }
      // The clicker: a knock each time a peg passes the arrows (not more than about 30 a second), and the arrows flick.
      function clicker(now) {
        const a = anim;
        if (!a || a.phase !== 'spin' || slots.length < 2) { lastT = 0; return; }
        const speed = lastT ? Math.abs(rot - lastRot) / Math.max(1, now - lastT) * 1000 : 0;
        lastT = now; lastRot = rot;
        if (speed < 0.05) return;
        const gs = geoms();
        let passed = false;
        for (const p of ptrs) {
          const under = sliceAt(p.a, gs);
          if (p.under && under !== p.under) { p.kickT = now; p.kickAmp = clamp(0.35 + speed * 0.03, 0, 1); passed = true; }
          p.under = under;
        }
        if (passed && now - lastClick >= 34) { lastClick = now; host.sound('click', { volume: clamp(0.45 + speed * 0.03, 0.45, 0.9) }); }
      }
      // The wheel as it ends: the new deal in place, picked names gone, turned to land on the winners.
      function settle(a) {
        if (a.finalSlots && !a.swapped) { slots = a.finalSlots; a.swapped = true; }
        slots.forEach(s => { s.w = 1; s.lab = 1; });
        removeGone();
        labelsDirty = true;
        rot = mod(a.end, TAU);
        snapPointers();
        current = a.winners.slice();
        everyone = a.view.noRepeats && !a.view.next;
        renderHub();   // (SPIN says what the next spin takes only now, so it gives nothing away)
      }

      // Deal the wheel for winners shown without a show: the winners under the arrows, everyone else in list order.
      function deal(entries, win) {
        const K = entries.length, n = win.length, arr = new Array(K).fill(-1);
        pointerOffsets(K, n).forEach((e, k) => { arr[mod(e, K)] = win[k]; });
        const w = new Set(win);
        let others = entries.filter(i => !w.has(i));
        if (n === 1) { const at = entries.indexOf(win[0]); others = entries.slice(at + 1).concat(entries.slice(0, at)); }   // (the list, turned)
        let o = 0;
        for (let p = 0; p < K; p++) if (arr[p] < 0) arr[p] = others[o++];
        setSlots(arr);
        rot = -TAU / K / 2;
      }
      // Is the wheel as it stands showing these winners under the arrows they would have?
      function landedOn(win) {
        const gs = geoms(), angles = pointerAngles(slots.length, win.length);
        return angles.every((a, k) => { const s = sliceAt(a, gs); return s && s.idx === win[k]; });
      }

      // For the tests: what is on the wheel (entries), what the arrows point at (left to right), where the arrows are
      // (angles) and how far each is from the middle of its slice (radians), where the banner is, and the names' sizes.
      root._wheel = () => {
        const gs = geoms(), live = ptrs.filter(p => p.al1 > 0);
        const aim = live.map(p => { const s = sliceAt(p.a, gs), g = gs.find(x => x.s === s); return g ? Math.abs(mod(p.a - g.a0 - g.sp / 2 + Math.PI, TAU) - Math.PI) : -1; });
        return { under: underPointers(), wheel: slots.map(s => s.idx), current: current.slice(), spinning: !!anim, raf: !!raf,
          R: geo.R, cx: geo.cx, cy: geo.cy, where: geo.where, arrows: live.map(p => p.a), aim, dpr: geo.dpr, canvasScale: geo.scale,
          labels: Object.assign({}, labelInfo), font: tok && tok.font, hub: hub.hidden ? '' : hub.textContent };
      };

      return {
        show(v, how) {
          if (dead) return;
          stopAnim();
          view = v;
          readTokens();
          const entries = onWheel(v), set = new Set(entries);
          const same = slots.length === entries.length && slots.every(s => set.has(s.idx) && isEntry(s, v));
          const win = v.winners.filter(i => set.has(i));
          if (win.length) {
            if (!(same && current.join() === win.join() && landedOn(win))) deal(entries, win);
            current = win; hl = 1;
          } else {
            if (!same) { setSlots(entries); rot = entries.length ? -TAU / entries.length / 2 : 0; }
            current = []; hl = 0;
          }
          const n = win.length || Math.max(1, Math.min(v.next || 1, slots.length));
          aimPointers(pointerAngles(slots.length, n), 0);
          ring = allRound(slots.length, n);
          everyone = v.noRepeats && !v.next && win.length > 0;
          slots.forEach(s => { s.w = 1; s.lab = 1; s.gone = false; });
          pop = 0;
          renderBanner(false);
          renderHub();
          labelsKey = '';
          layout();
          draw(performance.now());
          box.classList.remove('wheel-fade');
          if (how && how.fade) { void box.offsetWidth; box.classList.add('wheel-fade'); }
        },
        play(v) {
          if (dead) return;
          stopAnim();
          readTokens();
          box.classList.remove('wheel-fade');
          const entries = onWheel(v), set = new Set(entries), win = v.winners.slice(), n = win.length;
          // Start from the wheel on the stage. If it lacks someone in this draw (the list was changed in another copy
          // as this pick was made), it starts from the list instead.
          if (!view || !entries.every(i => slots.some(s => s.idx === i && isEntry(s, v)))) { view = v; setSlots(entries); }
          view = v;
          slots.forEach(s => { s.gone = !(set.has(s.idx) && isEntry(s, v)); });
          const keep = slots.filter(s => !s.gone), K = keep.length;
          let finalSlots = null, p0 = 0;
          if (n > 1) {
            // Deal again: the winners where the arrows will be (the 3 o'clock arrow's slice is first), the others
            // shuffled into the gaps (so the deal gives nothing away). The colours stay where they are.
            const cols = fixColors(keep.map(s => s.col)), arr = new Array(K).fill(-1);
            pointerOffsets(K, n).forEach((e, k) => { arr[mod(e, K)] = win[k]; });
            const w = new Set(win), others = entries.filter(i => !w.has(i));
            for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
            let o = 0;
            for (let p = 0; p < K; p++) if (arr[p] < 0) arr[p] = others[o++];
            finalSlots = arr.map((idx, p) => ({ idx, name: v.names[idx], w: 1, lab: 0, col: cols[p], gone: false }));
          } else p0 = keep.findIndex(s => s.idx === win[0]);
          const T = v.quick ? SPEED.quick : SPEED.normal, span = TAU / K;
          // Where in its slice the arrow stops: anywhere but right on a peg (decoration: Math.random). A wheel of one
          // name stops with it at the arrow, reading left to right.
          const delta = (Math.random() * 2 - 1) * (K > 1 ? 0.36 * span : 0.2);
          const target = -(p0 * span + span / 2) + delta;
          current = []; everyone = false; hl = 0; pop = 0;
          ring = allRound(K, n);
          renderBanner(false, true);
          layout();
          aimPointers(pointerAngles(K, n), T.layout);
          const base = rot - 0.12;
          anim = { T, view: v, t0: performance.now(), rot0: rot, base, end: base + T.turns * TAU + mod(target - base, TAU),
            multi: n > 1, finalSlots, swapped: false, winners: win, phase: 'spin' };
          lastT = 0; lastClick = 0;
          kick();
        },
        skip() {
          const a = anim;
          if (dead || !a) return;
          if (a.phase === 'spin') settle(a);
          stopAnim();
          snapPointers();
          hl = 1; pop = 0;
          renderBanner(false);
          layout();
          draw(performance.now());
        },
        resize() {
          if (dead || !view) return;
          readTokens();
          labelsKey = '';   // (the letters may have changed, or finished loading)
          layout();
          if (!anim) draw(performance.now());
        },
        theme() {
          if (dead || !view) return;
          readTokens();
          labelsKey = ''; labelsDirty = true;
          if (!anim) draw(performance.now());
        },
        destroy() { dead = true; stopAnim(); box.remove(); }
      };
    }
  });
})();
