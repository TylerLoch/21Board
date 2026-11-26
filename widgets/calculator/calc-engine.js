/*
 * 21Board Calculator: the math engine (calc-engine.js)
 * ======================================================
 * Shared by every calculator layout, and the seed of the real widget. It models what a person presses (not a typed
 * string): a problem is a list of tokens (numbers, operators, parentheses, and Desmos-style boxes for powers, roots and
 * fractions), and it is worked out in the order of operations, with exact fractions (BigInt numerator / denominator)
 * wherever the answer can be exact.
 *
 * Two models share it: create() is one problem on one display, like iPhone (=, repeated =, a history); createSheet()
 * is Desmos: a list of lines, each with its live answer, where ans is the line above.
 *
 * Results and conventions follow Desmos (checked against desmos.com, November 2026: the answers are in
 * tests/calc-engine.js), except where Tyler asked otherwise (÷ and × keys, iPhone-style entry) and where Desmos says
 * "undefined": the engine says what went wrong in words a child can read.
 *
 * Plain JavaScript, no dependencies, no eval or Function. Load it with <script src="calc-engine.js"> (it defines
 * window.CalcEngine) or require() it from Node (module.exports). tests/calc-engine.js checks every rule
 * (node tests/calc-engine.js).
 *
 * Sections:  limits and messages · numbers (exact and approximate) · number formatting · tokens, boxes and the parser ·
 *            evaluation · drawing (HTML, MathML, text, speech) · steps · key presses · one display (create) ·
 *            lines (createSheet) · saving · keyboard · stylesheet
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.CalcEngine = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '0.3.0';

  // ---- Limits ------------------------------------------------------------------------------------------------------
  const LIMITS = Object.freeze({
    digits: 15,       // digits in one typed number (the 0 in front of "0." doesn't count)
    tokens: 100,      // keys in one problem or line (a whole number counts as one)
    depth: 10,        // parentheses, roots, powers and fractions inside each other
    maxExp: 308,      // answers up to about 1.8 × 10^308, the largest number Desmos shows
    minExp: -324,     // and as small as 10^-324
    bits: 4000,       // the size of exact numbers worked with on the way (about 1,200 digits)
    history: 50,      // the most history entries kept (one display)
    lines: 100,       // the most lines (sheet)
    undo: 100,        // undo steps kept (sheet)
    fracDigits: 10    // fractions (the toggle, and answers as fractions): a top and a bottom of up to 10 digits each
  });
  // How answers are written, as Desmos writes them (measured on desmos.com). digits 10 is the Scientific calculator:
  // 10 significant digits, written out from 0.001 up to 10^9, otherwise 9 digits × 10ⁿ. digits 7 is the
  // Four-Function calculator: 7 significant digits, written out from 0.001 up to (not including) 10^7, otherwise 6.
  const DIGITS = Object.freeze({
    10: Object.freeze({ sig: 10, sciSig: 9, small: -3, big: 9, bigInclusive: true }),
    7: Object.freeze({ sig: 7, sciSig: 6, small: -3, big: 7, bigInclusive: false })
  });

  // Errors (no answer) and notices (a key was ignored, or = came too early). Desmos shows "undefined" for every error;
  // these say what happened, in a child's words.
  const MESSAGES = {
    divzero: { short: 'Can’t divide by 0', message: 'Dividing by 0 has no answer.' },
    sqrtneg: { short: 'No √ of a negative', message: 'No number times itself makes a negative.' },
    negroot: { short: 'No real answer', message: 'A negative number has no answer for this root or power.' },
    zeropow: { short: '0⁰ has no answer', message: '0 to the power of 0 has no agreed answer.' },
    toobig: { short: 'Too big to show', message: 'The answer is too big for this calculator.' },
    toosmall: { short: 'Too small to show', message: 'The answer is too close to 0 to show.' },
    noans: { short: 'No answer above', message: 'Put an answer on the line above to use ans.' },
    incomplete: { short: 'Not finished yet', message: 'Finish the problem first.' },
    digits: { short: 'That’s the most digits', message: 'A number can have up to 15 digits.' },
    long: { short: 'The problem is full', message: 'Press = to work it out.' },
    lines: { short: 'The page is full', message: 'Clear a line to add another.' },
    deep: { short: 'Too many inside', message: 'Up to 10 can go inside each other.' },
    zeroroot: { short: 'No 0th root', message: 'Use a number other than 0 for the root.' },
    adjacent: { short: 'Put × between them', message: 'Two numbers side by side need a × to multiply.' }
  };
  class CalcError extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  const info = (code, message) => ({ code, short: MESSAGES[code].short, message: message || MESSAGES[code].message });

  // ---- Numbers -----------------------------------------------------------------------------------------------------
  // A value is exact, { e: true, n, d } (BigInt numerator and denominator, d > 0, in lowest terms), or approximate,
  // { e: false, x } (a JavaScript number), once something irrational (√2, π, a fractional power) is involved.
  const ZERO = { e: true, n: 0n, d: 1n }, ONE = { e: true, n: 1n, d: 1n }, HUNDRED = { e: true, n: 100n, d: 1n };
  const PI = { e: false, x: Math.PI };
  const absB = n => n < 0n ? -n : n;
  const bitLen = n => n === 0n ? 0 : absB(n).toString(2).length;
  function gcd(a, b) {
    a = absB(a); b = absB(b);
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }
  function Q(n, d = 1n) {
    if (d === 0n) throw new CalcError('divzero');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d);
    return g > 1n ? { e: true, n: n / g, d: d / g } : { e: true, n, d };
  }
  const sign = v => v.e ? (v.n > 0n ? 1 : v.n < 0n ? -1 : 0) : Math.sign(v.x);
  const isZero = v => sign(v) === 0;
  const negate = v => v.e ? { e: true, n: -v.n, d: v.d } : { e: false, x: -v.x || 0 };

  // An exact value as a JavaScript number (both parts cut to about 64 bits first, so huge ones don't become Infinity).
  function toNumber(v) {
    if (!v.e) return v.x;
    const an = absB(v.n);
    const sn = Math.max(0, bitLen(an) - 64), sd = Math.max(0, bitLen(v.d) - 64);
    let x = Number(an >> BigInt(sn)) / Number(v.d >> BigInt(sd)), s = sn - sd;
    while (s > 0) { const k = Math.min(s, 1000); x *= 2 ** k; s -= k; }
    while (s < 0) { const k = Math.min(-s, 1000); x /= 2 ** k; s += k; }
    return v.n < 0n ? -x : x;
  }
  // A JavaScript number, exactly, as a fraction (every float is a whole number over a power of 2).
  function floatParts(x) {
    let k = 0;
    while (!Number.isInteger(x)) { x *= 2; k++; }
    return [BigInt(x), 1n << BigInt(k)];
  }
  // Exact results that grow past LIMITS.bits go on as decimals (1.01^1000 is an ordinary 20 959.15564). inRange()
  // still judges the final answer, and approx() catches anything past what a decimal can hold.
  function fit(v) {
    const limit = LIMITS.bits;
    if (bitLen(v.n) > limit || bitLen(v.d) > limit) return approx(toNumber(v), true);
    return v;
  }
  // log2 of a positive BigInt, for size estimates.
  const log2B = n => { const s = Math.max(0, bitLen(n) - 60); return s + Math.log2(Number(n >> BigInt(s))); };
  // An approximate result. `under`: the operands weren't 0, so a 0 here means the answer was too small to hold.
  function approx(x, under) {
    if (Number.isNaN(x)) throw new CalcError('negroot');
    if (!Number.isFinite(x)) throw new CalcError('toobig');
    if (x === 0 && under) throw new CalcError('toosmall');
    return { e: false, x: x || 0 };
  }

  function add(a, b) { return a.e && b.e ? fit(Q(a.n * b.d + b.n * a.d, a.d * b.d)) : approx(toNumber(a) + toNumber(b)); }
  function subtract(a, b) { return add(a, negate(b)); }
  function multiply(a, b) {
    if ((a.e && a.n === 0n) || (b.e && b.n === 0n)) return ZERO;   // 0 × π is exactly 0
    return a.e && b.e ? fit(Q(a.n * b.n, a.d * b.d)) : approx(toNumber(a) * toNumber(b), !isZero(a) && !isZero(b));
  }
  function divide(a, b) {
    if (isZero(b)) throw new CalcError('divzero');
    if (a.e && a.n === 0n) return ZERO;
    return a.e && b.e ? fit(Q(a.n * b.d, a.d * b.n)) : approx(toNumber(a) / toNumber(b), !isZero(a));
  }
  // Whole-number roots of BigInts (Newton's method from above): floor(n^(1/k)).
  function iroot(n, k) {
    if (n < 2n) return n;
    let x = 1n << BigInt(Math.ceil(bitLen(n) / Number(k)));
    for (;;) {
      const y = ((k - 1n) * x + n / x ** (k - 1n)) / k;
      if (y >= x) return x;
      x = y;
    }
  }
  function squareRoot(a) {
    const s = sign(a);
    if (s < 0) throw new CalcError('sqrtneg');
    if (s === 0) return ZERO;
    if (a.e) {   // √ of a perfect square (or a fraction of two) stays exact: √(9/4) = 3/2
      const rn = iroot(a.n, 2n), rd = iroot(a.d, 2n);
      if (rn * rn === a.n && rd * rd === a.d) return Q(rn, rd);
    }
    return approx(Math.sqrt(toNumber(a)));
  }
  // a to a whole-number power k.
  function powInt(a, k, o) {
    if (k === 0n) {
      if (!isZero(a)) return ONE;
      if (o.zeroPowerZero === 'one') return ONE;
      throw new CalcError('zeropow');
    }
    if (isZero(a)) { if (k < 0n) throw new CalcError('divzero'); return ZERO; }
    if (!a.e) return approx(Math.pow(a.x, Number(k)), true);
    const ak = absB(k), an = absB(a.n);
    if (an === a.d) return a.n < 0n && ak % 2n === 1n ? Q(-1n) : ONE;   // 1 and −1
    // Check the size first: 9^9^9 must not be worked out digit by digit. A power too long to work out exactly but of
    // an ordinary size (1.01^1000, monthly interest for 30 years) is worked out as a decimal.
    if (ak * BigInt(Math.max(bitLen(an), bitLen(a.d)) - 1) > BigInt(LIMITS.bits)) {
      const est = Number(k) * (log2B(an) - log2B(a.d));   // log2 of the answer
      if (est > 1100) throw new CalcError('toobig');
      if (est < -1100) throw new CalcError('toosmall');
      return powApprox(a, k);
    }
    const n = a.n ** ak, d = a.d ** ak;
    return fit(k > 0n ? Q(n, d) : Q(d, n));
  }
  // a^k as a decimal, for an exact a: the decimal nearest a, to the power k, corrected for the tiny gap between that
  // decimal and a (which k would otherwise magnify).
  function powApprox(a, k) {
    const fa = toNumber(a), K = Number(k);
    let x = Math.pow(fa, K);
    if (fa !== 0 && Number.isFinite(fa)) {
      const [fn, fd] = floatParts(Math.abs(fa)), fq = Q(fa < 0 ? -fn : fn, fd);
      const gap = toNumber(Q(a.n * fq.d - fq.n * a.d, a.d * fq.d)) / fa;   // (a − fa) / fa
      if (gap) x *= Math.exp(K * Math.log1p(gap));
    }
    return approx(x, true);
  }
  function power(a, b, o) {
    if (b.e && b.d === 1n) return powInt(a, b.n, o);
    if (isZero(b)) return powInt(a, 0n, o);
    if (isZero(a)) { if (sign(b) < 0) throw new CalcError('divzero'); return ZERO; }
    const negBase = sign(a) < 0, abs = negBase ? negate(a) : a;
    if (b.e) {
      // A fraction power p/q is the q-th root, to the power p. A negative number has an odd root (∛−8 = −2) but no even one.
      const p = b.n, q = b.d;
      if (negBase && q % 2n === 0n) throw new CalcError(q === 2n ? 'sqrtneg' : 'negroot');
      if (abs.e && q <= 64n) {   // 8^(2/3) = 4 and (1/4)^0.5 = 1/2 stay exact
        const rn = iroot(abs.n, q), rd = iroot(abs.d, q);
        if (rn ** q === abs.n && rd ** q === abs.d) return powInt(negBase ? Q(-rn, rd) : Q(rn, rd), p, o);
      }
      const x = Math.pow(toNumber(abs), toNumber(b));
      return approx(negBase && p % 2n !== 0n ? -x : x, true);
    }
    if (negBase) throw new CalcError('negroot');
    return approx(Math.pow(toNumber(a), b.x), true);
  }
  // ⁿ√x is x to the power 1/n: ∛−8 = −2, ⁴√16 = 2, ⁴√−16 has no answer.
  function nthRoot(x, n, o) {
    if (isZero(n)) throw new CalcError('zeroroot');
    return power(x, divide(ONE, n), o);
  }
  // Percent: n% = n ÷ 100, or "of" a base (Apple's 50 + 10%: 10% of 50).
  function percent(a, base) {
    const p = divide(a, HUNDRED);
    return base ? multiply(base, p) : p;
  }
  function binary(op, a, b, o) {
    switch (op) {
      case '+': return add(a, b);
      case '-': return subtract(a, b);
      case '*': case 'imp': return multiply(a, b);
      case '/': return divide(a, b);
      case '^': return power(a, b, o);
    }
    throw new Error('Unknown operator ' + op);
  }
  // floor(log10(n/d)) for positive BigInts.
  function log10Floor(n, d) {
    let e = n.toString().length - d.toString().length;
    if (e >= 0 ? n < d * 10n ** BigInt(e) : n * 10n ** BigInt(-e) < d) e--;
    return e;
  }
  function magnitude(v) {   // floor(log10|v|), v ≠ 0
    const [n, d] = v.e ? [absB(v.n), v.d] : floatParts(Math.abs(v.x));
    return log10Floor(n, d);
  }
  const MAX_B = BigInt(Number.MAX_VALUE);
  // A final answer must fit the range Desmos can show (beyond it Desmos says "undefined", or 0 for tiny ones).
  function inRange(v) {
    if (isZero(v)) return v;
    const e = magnitude(v);
    if (e > LIMITS.maxExp || (v.e && absB(v.n) > MAX_B * v.d)) throw new CalcError('toobig');
    if (e < LIMITS.minExp) throw new CalcError('toosmall');
    return v;
  }

  // ---- Number formatting -------------------------------------------------------------------------------------------
  // formatValue answers a "piece": how to write a number, which each drawing (HTML, MathML, text, speech) renders.
  //   { kind: 'fixed', neg, int, dec, point }   1 234.5
  //   { kind: 'sci', neg, mant, exp }           1.2 × 10¹⁵
  //   { kind: 'frac', neg, num, den }           7/2         { kind: 'mixed', neg, whole, num, den }   3 1/2
  //   { kind: 'rep', neg, int, pre, rep, fallback }   0.1 6̅ (a bar over the repeating digits; `fallback` is rounded)
  //   { kind: 'rem', neg, q, r }                     3 R 2 (answerAs 'remainder': see remainderOf)
  // and `rounded`: true when what's shown isn't exactly the value (the equation can then say ≈).
  const fixed = (neg, int, dec, rounded) => ({ kind: 'fixed', neg, int, dec, point: dec.length > 0, rounded });
  const roundHalfUp = (n, d) => (2n * n + d) / (2n * d);   // school rounding: 5 or more rounds up (n ≥ 0)
  const scaledRound = (n, d, k) => k >= 0 ? roundHalfUp(n * 10n ** BigInt(k), d) : roundHalfUp(n, d * 10n ** BigInt(-k));
  const pow10 = k => 10n ** BigInt(k);
  function terminatingPlaces(d) {   // a fraction ends (0.375) when its denominator is made of 2s and 5s: how many places
    let k2 = 0, k5 = 0;
    while (d % 2n === 0n) { d /= 2n; k2++; }
    while (d % 5n === 0n) { d /= 5n; k5++; }
    return d === 1n ? Math.max(k2, k5) : -1;
  }
  function formatValue(v, f) {
    let n, d;
    if (v.e) { n = v.n; d = v.d; } else [n, d] = floatParts(v.x);
    const neg = n < 0n;
    n = absB(n);
    if (n === 0n) return fixed(false, '0', '', false);
    if (v.e && d !== 1n && (f.answerAs === 'fraction' || f.answerAs === 'mixed')) {
      const p = fractionPiece(neg, n, d, f.answerAs === 'mixed');
      if (p) return p;
    }
    if (v.e && d !== 1n && f.repeatingBar && terminatingPlaces(d) < 0) {
      const r = repeatingPiece(neg, n, d, f.digits);
      if (r) return r;
    }
    return roundedPiece(neg, n, d, v.e, f.digits);
  }
  // As Desmos writes it: rounded to 10 significant digits (7 on the Four-Function calculator), written out between
  // 0.001 and 10^9 (10^7), otherwise in scientific notation with one digit fewer.
  function roundedPiece(neg, n, d, exact, digits) {
    const D = DIGITS[digits] || DIGITS[10];
    let e = log10Floor(n, d), k = D.sig - 1 - e, m = scaledRound(n, d, k);
    const e0 = e;   // the true size, before rounding
    if (m >= pow10(D.sig)) { e++; k--; m = scaledRound(n, d, k); }   // 9.99… rounded up to 10
    // Desmos decides from the true value at 0.001 (0.000999999999999 is 1 × 10⁻³) and at Scientific's 10⁹
    // (1 000 000 000.4 is 1 × 10⁹), but from the rounded one at Four-Function's 10⁷ (9 999 999.5 is 1 × 10⁷).
    const plain = e0 >= D.small && (D.bigInclusive ? e0 < D.big || (e0 === D.big && n === pow10(D.big) * d) : e < D.big);
    if (plain) {
      const s = k > 0 ? m.toString().padStart(k + 1, '0') : (m * pow10(-k)).toString();
      const int = k > 0 ? s.slice(0, s.length - k) : s, dec = k > 0 ? s.slice(s.length - k).replace(/0+$/, '') : '';
      const shown = k >= 0 ? m * d === n * pow10(k) : m * pow10(-k) * d === n;
      return fixed(neg, int, dec, !exact || !shown);
    }
    let ks = D.sciSig - 1 - e, ms = scaledRound(n, d, ks);
    if (ms >= pow10(D.sciSig)) { e++; ks--; ms = scaledRound(n, d, ks); }
    const s = ms.toString(), rest = s.slice(1).replace(/0+$/, '');
    const shown = ks >= 0 ? ms * d === n * pow10(ks) : ms * d * pow10(-ks) === n;
    return { kind: 'sci', neg, mant: s[0] + (rest ? '.' + rest : ''), exp: e, rounded: !exact || !shown };
  }
  function fractionPiece(neg, n, d, mixed) {
    if (d.toString().length > LIMITS.fracDigits) return null;
    if (mixed && n > d) {
      const whole = (n / d).toString();
      return whole.length > LIMITS.digits ? null : { kind: 'mixed', neg, whole, num: (n % d).toString(), den: d.toString(), rounded: false };
    }
    return n.toString().length > LIMITS.fracDigits ? null : { kind: 'frac', neg, num: n.toString(), den: d.toString(), rounded: false };
  }
  // Remainders (answerAs 'remainder'): 17 ÷ 5 = 3 R 2. An answer has one when the last step of its problem is a whole
  // number ÷ a whole number, neither negative, that doesn't divide evenly: rem { q, r } (BigInts). 17.0 ÷ 5 counts, and
  // so does (20 + 3) ÷ 5. Only for that answer: a negative side, a fraction typed with a/b, or another step after it,
  // and the answer is a decimal. a, b: the step's two values; v: the answer.
  function remainderOf(a, b, v) {
    if (!a || !b || !v || !a.e || !b.e || !v.e || a.d !== 1n || b.d !== 1n || a.n < 0n || b.n <= 0n) return null;
    if (v.n * b.n !== a.n * v.d) return null;   // (the answer is a ÷ b itself, not made negative after it)
    const r = a.n % b.n;
    return r === 0n ? null : { q: a.n / b.n, r };
  }
  // 3 R 2, with the digit rules of other answers: a quotient or a remainder that would be rounded or in × 10ⁿ makes it
  // a decimal instead (null).
  function remainderPiece(rem, f) {
    const whole = n => { if (n === 0n) return '0'; const p = roundedPiece(false, n, 1n, true, f.digits); return p.kind === 'fixed' && !p.rounded ? p.int : null; };
    const q = rem && whole(rem.q), r = rem && whole(rem.r);
    return q && r ? { kind: 'rem', neg: false, q, r, rounded: false } : null;
  }
  // An answer's piece: its remainder (answerAs 'remainder', when it has one), otherwise formatValue.
  const answerPiece = (v, f, rem) => (f.answerAs === 'remainder' && remainderPiece(rem, f)) || formatValue(v, f);
  // Going on from an answer shown with a remainder, 17 ÷ 5 = 3 R 2, the ans box shows its exact value as As fractions
  // shows it, 17/5, so a class doesn't meet a decimal it never saw: 17/5 × 5 = 17. A box from any other answer is drawn
  // as before (2 + 17 ÷ 5 = 5.4 gives 5.4), and so is every box with As decimals or As fractions. f.remBoxes: With
  // remainders is on (⇄ doesn't change it). A value with no fraction that fits shows its decimal.
  const boxOpts = (f, node) => node.rem && f.remBoxes ? Object.assign({}, f, { answerAs: 'fraction' }) : f;
  // 1/6 = 0.1666… → int '0', pre '1', rep '6'. Null when the repeating part doesn't fit in 15 digits.
  function repeatingPiece(neg, n, d, digits) {
    const int = (n / d).toString(), room = LIMITS.digits - int.length, seen = new Map();
    let r = n % d, s = '';
    while (!seen.has(r)) {
      if (s.length >= room) return null;
      seen.set(r, s.length);
      r *= 10n;
      s += (r / d).toString();
      r %= d;
    }
    const at = seen.get(r);
    return { kind: 'rep', neg, int, pre: s.slice(0, at), rep: s.slice(at), rounded: false, fallback: roundedPiece(neg, n, d, true, digits) };
  }
  // A number as it is being typed: kept as typed ("12." and "0.50" stay).
  function typedPiece(tok) {
    const i = tok.s.indexOf('.');
    return i < 0 ? fixed(tok.neg, tok.s, '', false) : { kind: 'fixed', neg: tok.neg, int: tok.s.slice(0, i), dec: tok.s.slice(i + 1), point: true, rounded: false };
  }
  // Digit groups: Desmos puts a thin space between groups of three (1 234 567); 'comma' writes 1,234,567.
  // 'faint' (the 21Board widget's) is a comma too, drawn in the HTML as its own element, <span class="ce-sep">,</span>, that
  // the stylesheet colors softly. Plain text (the display, speech, aria-labels, MathML) keeps an ordinary comma.
  const SEP = { space: ' ', comma: ',', faint: ',', none: '' };
  const GROUPS = /\B(?=(\d{3})+(?!\d))/g;
  const group3 = (digits, sep) => SEP[sep] ? digits.replace(GROUPS, SEP[sep]) : digits;
  const group3H = (digits, sep) => sep === 'faint' ? esc(digits).replace(GROUPS, '<span class="ce-sep">,</span>') : esc(group3(digits, sep));
  const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '−': '⁻' };
  const superscript = s => Array.from(s, c => SUPER[c] || c).join('');
  const MINUS = '−';   // U+2212, the real minus sign
  const expText = e => (e < 0 ? MINUS : '') + Math.abs(e);
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  // ---- Tokens, boxes and the parser --------------------------------------------------------------------------------
  // Tokens: { t: 'num', s: '12.5', neg } (typed; neg = made negative with ±) · { t: 'ans', v, rem } (an earlier answer;
  // rem: it was shown with a remainder, so its box shows a fraction: see boxOpts) ·
  // { t: 'prev' } (sheet: ans, the answer of the line above, kept up to date) · { t: 'pi' } ·
  // { t: 'op', v: '+' | '-' | '*' | '/' } · { t: 'neg' } (a minus sign in front) · { t: 'pct' } (n%, Simple and Apple
  // percent) · { t: 'of' } (Desmos's "% of") · { t: 'open' } · { t: 'close' } ·
  // boxes, as in Desmos: { t: 'pow' } x^□ · { t: 'sqrt' } √□ · { t: 'root' } ⁿ√□: the small n first, then what's under ·
  // { t: 'frac' } □/□: the top first, then the bottom · { t: 'sep' } (on to the second box) · { t: 'end' } (out of the box).
  // Tokens are never changed in place. The cursor is always at the end, in the innermost box still open.
  const OPERAND_END = { num: 1, ans: 1, prev: 1, pi: 1, close: 1, end: 1, pct: 1 };
  const IMPLICIT_START = { num: 1, ans: 1, prev: 1, pi: 1, open: 1, sqrt: 1, root: 1, frac: 1 };   // after an operand: ×
  const OPERAND_START = Object.assign({ neg: 1 }, IMPLICIT_START);
  const AFTER_OPERAND = { op: 1, close: 1, pow: 1, pct: 1, of: 1, end: 1, sep: 1 };
  const NUMBERISH = { num: 1, ans: 1, prev: 1 };
  // Which token may follow which: the key-press rules keep to this, and load() checks saved problems with it.
  function canFollow(prev, tok) {
    if (!prev) return !!OPERAND_START[tok.t];
    if (OPERAND_END[prev.t]) {
      if (AFTER_OPERAND[tok.t]) return true;
      if (tok.t === 'num') return prev.t !== 'num';   // (digits join the number; ans2 is ans × 2, as Desmos)
      return !!IMPLICIT_START[tok.t];
    }
    return !!OPERAND_START[tok.t];   // after an operator, a sign, (, or the start of a box: − is a minus sign (5 × −3)
  }
  // The boxes still open at the end, innermost last: 'paren' | 'pow' | 'sqrt' | 'index' | 'radicand' | 'numer' | 'denom'.
  // null when the tokens don't nest properly.
  const CLOSED_BY_END = { pow: 1, sqrt: 1, radicand: 1, denom: 1 };
  function openBoxes(tokens) {
    const st = [];
    for (const t of tokens) {
      switch (t.t) {
        case 'open': st.push('paren'); break;
        case 'pow': st.push('pow'); break;
        case 'sqrt': st.push('sqrt'); break;
        case 'root': st.push('index'); break;
        case 'frac': st.push('numer'); break;
        case 'sep': {
          const top = st.pop();
          if (top === 'index') st.push('radicand'); else if (top === 'numer') st.push('denom'); else return null;
          break;
        }
        case 'end': if (!CLOSED_BY_END[st.pop()]) return null; break;
        case 'close': if (st.pop() !== 'paren') return null; break;
      }
    }
    return st;
  }
  const BOX_OPENER = { open: 1, pow: 1, sqrt: 1, root: 1, frac: 1 };
  // The key that opened the box the cursor is in ('power', 'sqrt', 'root', 'cbrt', 'fraction', 'open'), or null: a
  // layout rings that key while the cursor is inside.
  function boxKeyOf(tokens) {
    const st = [];
    for (const t of tokens) {
      if (BOX_OPENER[t.t]) st.push(t.t === 'pow' ? 'power' : t.t === 'frac' ? 'fraction' : t.t === 'root' && t.cube ? 'cbrt' : t.t);
      else if (t.t === 'close' || t.t === 'end') st.pop();
    }
    return st.length ? st[st.length - 1] : null;
  }
  const deepest = tokens => {
    let d = 0, max = 0;
    for (const t of tokens) { if (BOX_OPENER[t.t]) max = Math.max(max, ++d); else if (t.t === 'close' || t.t === 'end') d--; }
    return max;
  };
  function numValue(tok) {
    const [int, dec = ''] = tok.s.split('.');
    const v = Q(BigInt((int || '0') + dec), 10n ** BigInt(dec.length));
    return tok.neg ? negate(v) : v;
  }

  // Tokens → tree. Grammar (lowest to highest precedence):
  //   expr    := pterm (('+' | '−') pterm)*
  //   pterm   := term ('% of' term)*                           Desmos: 2 × 10% of 50 + 5 = (2 × 10)% of 50 + 5
  //   term    := factor (('×' | '÷' | implicit) factor)*       implicit: 2π, 2(3 + 4), (1 + 2)(3 + 4), 3√16, 2³4
  //   factor  := '−' factor | primary ('^' box | '%')*        so −3² = −(3²); the power box holds a whole expression:
  //                                                            2^(3+1); % is Simple and Apple percent
  //   primary := number [fraction] | ans | π | '(' expr ')'? | '√' box | 'ⁿ√' box box | fraction
  //   fraction:= box '/' box                                   a whole number then a fraction is a mixed number: 1⅔
  // Unfinished problems parse too: a missing operand is a { k: 'hole' }; an unclosed parenthesis has closed: false; a
  // box still open has open: 'a' or 'b' (the child the cursor is in). A { t: 'cursor' } token at the end marks the cursor.
  // Nodes: num {tok} · val {v, ans, live} · pi · hole · noans · mixed {tok, num, den} · group {a, closed} · neg {a} ·
  //        sqrt {a} · root {a: under, b: index} · frac {a: top, b: bottom} · pct {a, base} · of {a, b} ·
  //        bin {op, a, b} (op '^': b is the power box) · cur {a} (the cursor after a)
  function parse(tokens, pctMode, prev) {
    let i = 0;
    const at = () => tokens[i];
    const isOp = (t, a, b) => t && t.t === 'op' && (t.v === a || t.v === b);
    function expr() {
      let left = pterm(null);
      while (isOp(at(), '+', '-')) {
        const node = { k: 'bin', op: tokens[i++].v, a: left, b: null };
        node.b = pterm(pctMode === 'apple' ? node : null);
        left = node;
      }
      if (at() && at().t === 'cursor') { i++; left = { k: 'cur', a: left }; }
      return left;
    }
    function pterm(base) {
      let left = term(base);
      while (at() && at().t === 'of') { i++; left = { k: 'of', a: left, b: term(null) }; }
      return left;
    }
    function term(base) {
      let left = factor(base);
      for (;;) {
        const t = at();
        if (isOp(t, '*', '/')) { i++; left = { k: 'bin', op: t.v, a: left, b: factor(null) }; }
        else if (t && IMPLICIT_START[t.t]) left = { k: 'bin', op: 'imp', a: left, b: factor(null) };
        else return left;
      }
    }
    function factor(base) {
      if (at() && at().t === 'neg') { i++; return { k: 'neg', a: factor(null) }; }
      let node = primary();
      for (;;) {
        const t = at();
        if (t && t.t === 'pow') { i++; const s = box(); node = { k: 'bin', op: '^', a: node, b: s.node, open: s.closed ? null : 'b' }; }
        else if (t && t.t === 'pct') { i++; node = { k: 'pct', a: node, base }; }
        else return node;
      }
    }
    function box() {   // an expression in a box, closed by end (or sep, on to the second box)
      const node = expr(), t = at();
      if (t && (t.t === 'end' || t.t === 'sep')) { i++; return { node, closed: true }; }
      return { node, closed: false };
    }
    // a whole number, then a fraction of two whole numbers: a mixed number (as Desmos reads 1⅔), also while the bottom
    // is still being typed
    const whole = t => t && t.t === 'num' && !t.neg && /^[0-9]+$/.test(t.s);
    const mixedAt = j => tokens[j] && tokens[j].t === 'frac' && whole(tokens[j + 1]) && tokens[j + 2] && tokens[j + 2].t === 'sep' &&
      whole(tokens[j + 3]) && (!tokens[j + 4] || tokens[j + 4].t === 'end' || tokens[j + 4].t === 'cursor');
    function primary() {
      const t = at();
      if (!t) return { k: 'hole' };
      switch (t.t) {
        case 'cursor': i++; return { k: 'hole', cursor: true };
        case 'num':
          i++;
          if (/^[0-9]+$/.test(t.s) && mixedAt(i)) {
            const m = { k: 'mixed', tok: t, num: tokens[i + 1], den: tokens[i + 3] };
            i += tokens[i + 4] && tokens[i + 4].t === 'end' ? 5 : 4;
            return m;
          }
          return { k: 'num', tok: t };
        case 'ans': i++; return t.rem ? { k: 'val', v: t.v, ans: true, rem: true } : { k: 'val', v: t.v, ans: true };
        case 'prev': i++; return prev ? { k: 'val', v: prev, ans: true, live: true } : { k: 'noans' };
        case 'pi': i++; return { k: 'pi' };
        case 'open': {
          i++;
          const a = expr();
          if (at() && at().t === 'close') { i++; return { k: 'group', a, closed: true }; }
          return { k: 'group', a, closed: false };
        }
        case 'sqrt': { i++; const s = box(); return { k: 'sqrt', a: s.node, open: s.closed ? null : 'a' }; }
        case 'root': case 'frac': {
          i++;
          const first = box(), second = first.closed ? box() : { node: { k: 'hole' }, closed: false };
          if (t.t === 'root') return { k: 'root', a: second.node, b: first.node, open: !first.closed ? 'b' : !second.closed ? 'a' : null };
          return { k: 'frac', a: first.node, b: second.node, open: !first.closed ? 'a' : !second.closed ? 'b' : null };
        }
      }
      return { k: 'hole' };
    }
    const tree = expr();
    if (i < tokens.length) throw new Error('Unexpected token ' + tokens[i].t);   // (the key rules never allow this)
    return tree;
  }
  const plainNum = n => n && n.k === 'num' && !n.tok.neg && /^[0-9]+$/.test(n.tok.s);
  const plainFrac = n => n.k === 'frac' && !n.open && plainNum(n.a) && plainNum(n.b);   // ¾: a number, as typed
  const isLeaf = n => n.k === 'num' || n.k === 'val' || n.k === 'pi' || n.k === 'mixed' || n.k === 'noans' || plainFrac(n);
  const kids = n => isLeaf(n) || n.k === 'hole' ? [] : [n.a, n.b].filter(Boolean);
  function findHole(node, parent, side) {
    if (node.k === 'hole') return { parent, side };
    if (isLeaf(node)) return null;
    for (const s of node.k === 'root' ? ['b', 'a'] : ['a', 'b']) {   // (in the order they are typed)
      const c = node[s], h = c && findHole(c, node.k === 'cur' ? parent : node, node.k === 'cur' ? side : s);
      if (h) return h;
    }
    return null;
  }
  const hasOpen = n => !isLeaf(n) && n.k !== 'hole' && ((n.k === 'group' && !n.closed) || !!n.open || kids(n).some(hasOpen));
  const complete = n => !findHole(n, null) && !hasOpen(n);
  // Just a number (5, −5, 1⅔, an earlier answer): = shows it, but it doesn't go into the history, and a line of the
  // sheet shows no answer for it (as Desmos). ans on a line of its own does show its answer (as Desmos).
  function trivial(n) {
    if (n.k === 'cur') n = n.a;
    if (n.k === 'neg') n = n.a;
    return n.k === 'num' || n.k === 'mixed' || (n.k === 'val' && !n.live);
  }

  // ---- Evaluation --------------------------------------------------------------------------------------------------
  function leafValue(n) {
    switch (n.k) {
      case 'num': return numValue(n.tok);
      case 'val': return n.v;
      case 'pi': return PI;
      case 'noans': throw new CalcError('noans');
      case 'mixed': {
        const den = BigInt(n.den.s);
        if (den === 0n) throw new CalcError('divzero');
        const v = Q(BigInt(n.tok.s) * den + BigInt(n.num.s), den);
        return n.tok.neg ? negate(v) : v;
      }
      case 'frac': return divide(numValue(n.a.tok), numValue(n.b.tok));
    }
    throw new Error('Not a number');
  }
  // The whole tree at once (the display while typing, the preview, a line's live answer). `memo` keeps Apple-percent
  // bases from being worked out again and again.
  function evaluate(node, o, memo = new Map()) {
    if (memo.has(node)) return memo.get(node);
    const ev = n => evaluate(n, o, memo);
    let v;
    if (isLeaf(node)) v = leafValue(node);
    else {
      switch (node.k) {
        case 'hole': throw new CalcError('incomplete');
        case 'cur': case 'group': v = ev(node.a); break;
        case 'neg': v = negate(ev(node.a)); break;
        case 'sqrt': v = squareRoot(ev(node.a)); break;
        case 'root': { const under = ev(node.a); v = nthRoot(under, ev(node.b), o); break; }
        case 'frac': { const top = ev(node.a); v = divide(top, ev(node.b)); break; }
        case 'pct': v = percent(ev(node.a), node.base ? ev(node.base.a) : null); break;
        case 'of': { const p = percent(ev(node.a), null); v = multiply(p, ev(node.b)); break; }
        case 'bin': { const a = ev(node.a); v = binary(node.op, a, ev(node.b), o); break; }
      }
    }
    memo.set(node, v);
    return v;
  }

  // ---- Drawing -----------------------------------------------------------------------------------------------------
  // One walk of the tree, four "backends": HTML (the stylized equation), MathML, plain text and speech (for screen
  // readers). Everything drawn comes from the engine's own tokens and numbers, and every string is escaped anyway.
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SYM = { '+': '+', '-': MINUS, '*': '×', '/': '÷' };
  const SPOKEN = { '+': 'plus', [MINUS]: 'minus', '×': 'times', '÷': 'divided by' };
  const T = '\u2009';   // thin space, around operators in the stylized equation
  const CURSOR = '<span class="ce-cursor"></span>';
  // The √ is drawn, not typed: each font's √ meets the bar over the number in its own way, often with a gap or a step.
  // One picture draws the bar and the sign, so they always join. The sign stretches to the radical's height, and its
  // last stroke runs into the bar. The √ itself stays, unseen, for copying and screen readers.
  const RADIC = '<span class="ce-radic"><span class="ce-surd">√</span><svg class="ce-surd-mark" aria-hidden="true">' +
    '<line x1=".6em" x2="100%" y1=".035em" y2=".035em"/>' +
    '<svg x="0" y=".035em" width=".62em" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">' +
    '<path d="M2 58L24 47L50 95L90 0L104 0"/></svg></svg></span>';

  function backends(f) {
    const sep = f.separators;
    const pick = (B, p) => (B.linear && p.kind === 'rep') ? p.fallback : p;
    const H = {
      linear: false,
      number(p) {
        const sg = p.neg ? MINUS : '', more = p.more ? '…' : '';
        switch (p.kind) {
          case 'fixed': return `<span class="ce-num">${sg}${group3H(p.int, sep)}${p.point ? '.' + esc(p.dec) : ''}${more}</span>`;
          case 'rep': return `<span class="ce-num">${sg}${group3H(p.int, sep)}.${esc(p.pre)}<span class="ce-rep">${esc(p.rep)}</span></span>`;
          case 'sci': return `<span class="ce-sci"><span class="ce-num">${sg}${esc(p.mant)}${more}</span><span class="ce-op">${T}×${T}</span><span class="ce-num">10<sup class="ce-sup">${esc(expText(p.exp))}</sup></span></span>`;
          case 'frac': return (sg ? `<span class="ce-num">${sg}</span>` : '') + this.fracOf(p.num, p.den);
          case 'mixed': return `<span class="ce-mixed"><span class="ce-num">${sg}${group3H(p.whole, sep)}</span>${this.fracOf(p.num, p.den)}</span>`;
          case 'rem': return `<span class="ce-rem"><span class="ce-num">${group3H(p.q, sep)}</span><span class="ce-r">${T}R${T}</span><span class="ce-num">${group3H(p.r, sep)}</span></span>`;
        }
        return '';
      },
      fracOf(n, d) { return `<span class="ce-frac ce-value"><span class="ce-numer"><span class="ce-num">${group3H(n, sep)}</span></span><span class="ce-denom"><span class="ce-num">${group3H(d, sep)}</span></span></span>`; },
      op: s => `<span class="ce-op">${T}${esc(s)}${T}</span>`,
      imp: () => '',
      minus: () => `<span class="ce-sign">${MINUS}</span>`,
      open: () => '<span class="ce-paren">(</span>',
      close: () => '<span class="ce-paren">)</span>',
      ghost: () => '<span class="ce-paren ce-ghost">)</span>',
      autoOpen: () => '<span class="ce-paren">(</span>',
      autoClose: () => '<span class="ce-paren">)</span>',
      saidParens: x => x,
      sup: (b, x) => `<span class="ce-pow">${b}<sup class="ce-sup">${x}</sup></span>`,
      sqrt: x => `<span class="ce-sqrt">${RADIC}<span class="ce-radicand">${x}</span></span>`,
      root: (n, x) => `<span class="ce-root"><span class="ce-index">${n}</span><span class="ce-sqrt">${RADIC}<span class="ce-radicand">${x}</span></span></span>`,
      frac: (n, d) => `<span class="ce-frac"><span class="ce-numer">${n}</span><span class="ce-denom">${d}</span></span>`,
      over: (n, d) => `<span class="ce-frac"><span class="ce-numer">${n}</span><span class="ce-denom">${d}</span></span>`,
      pi: () => '<span class="ce-pi">π</span>',
      pct: () => '<span class="ce-pct">%</span>',
      hole: (cursor, slot) => slot ? `<span class="ce-hole">${cursor ? CURSOR : ''}</span>` : cursor ? CURSOR : '',
      cursor: () => CURSOR,
      chip: x => `<span class="ce-ansref">${x}<span class="ce-anslabel">ans</span></span>`,
      mark: x => `<span class="ce-mark">${x}</span>`,
      eq: approx => `<span class="ce-eq">${T}${approx ? '≈' : '='}${T}</span>`,
      answer: x => `<span class="ce-ans">${x}</span>`,
      word: w => `<span class="ce-word">${T}${esc(w)}${T}</span>`,
      wrap: (x, speech) => x ? `<span class="ce-math" role="math" aria-label="${esc(speech)}">${x}</span>` : ''
    };
    const M = {
      linear: false,
      number(p) {
        const sg = s => p.neg ? `<mrow><mo>${MINUS}</mo>${s}</mrow>` : s, more = p.more ? '…' : '';
        switch (p.kind) {
          case 'fixed': return sg(`<mn>${esc(group3(p.int, sep))}${p.point ? '.' + esc(p.dec) : ''}${more}</mn>`);
          // (a CSS overline: Chromebooks have no math font that can stretch a ‾ accent over several digits)
          case 'rep': return sg(`<mrow><mn>${esc(group3(p.int, sep))}.${esc(p.pre)}</mn><mn class="ce-rep">${esc(p.rep)}</mn></mrow>`);
          case 'sci': return sg(`<mrow><mn>${esc(p.mant)}${more}</mn><mo>×</mo><msup><mn>10</mn>${p.exp < 0 ? `<mrow><mo>${MINUS}</mo><mn>${-p.exp}</mn></mrow>` : `<mn>${p.exp}</mn>`}</msup></mrow>`);
          case 'frac': return sg(`<mfrac><mn>${esc(group3(p.num, sep))}</mn><mn>${esc(group3(p.den, sep))}</mn></mfrac>`);
          case 'mixed': return sg(`<mrow><mn>${esc(group3(p.whole, sep))}</mn><mfrac><mn>${esc(group3(p.num, sep))}</mn><mn>${esc(group3(p.den, sep))}</mn></mfrac></mrow>`);
          case 'rem': return `<mrow><mn>${esc(group3(p.q, sep))}</mn><mtext> R </mtext><mn>${esc(group3(p.r, sep))}</mn></mrow>`;
        }
        return '';
      },
      op: s => `<mo>${esc(s)}</mo>`,
      imp: () => '<mo>&#x2062;</mo>',   // invisible times
      minus: () => `<mo>${MINUS}</mo>`,
      open: () => '<mo>(</mo>',
      close: () => '<mo>)</mo>',
      ghost: () => '<mo class="ce-ghost">)</mo>',
      autoOpen: () => '<mo>(</mo>',
      autoClose: () => '<mo>)</mo>',
      saidParens: x => x,
      sup: (b, x) => `<msup><mrow>${b}</mrow><mrow>${x}</mrow></msup>`,
      sqrt: x => `<msqrt>${x}</msqrt>`,
      root: (n, x) => `<mroot><mrow>${x}</mrow><mrow>${n}</mrow></mroot>`,
      frac: (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`,
      over: (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`,
      pi: () => '<mi>π</mi>',
      pct: () => '<mo>%</mo>',
      hole: (cursor, slot) => slot ? '<mi class="ce-hole">□</mi>' : '',
      cursor: () => '',
      chip: x => x || '<mi>ans</mi>',
      mark: x => `<mrow class="ce-mark">${x}</mrow>`,
      eq: approx => `<mo>${approx ? '≈' : '='}</mo>`,
      answer: x => `<mrow class="ce-ans">${x}</mrow>`,
      word: w => `<mtext> ${esc(w)} </mtext>`,
      wrap: x => x ? `<math class="ce-mathml" display="inline"><mrow>${x}</mrow></math>` : ''
    };
    const wrapIf = (x, yes) => yes ? `(${x})` : x;
    const Tx = {
      linear: true,
      number(p) {
        p = pick(this, p);
        const sg = p.neg ? MINUS : '', more = p.more ? '…' : '';
        switch (p.kind) {
          case 'fixed': return `${sg}${group3(p.int, sep)}${p.point ? '.' + p.dec : ''}${more}`;
          case 'sci': return `${sg}${p.mant}${more} × 10${superscript(expText(p.exp))}`;
          case 'frac': return `${sg}${group3(p.num, sep)}/${group3(p.den, sep)}`;
          case 'mixed': return `${sg}${group3(p.whole, sep)} ${group3(p.num, sep)}/${group3(p.den, sep)}`;
          case 'rem': return `${group3(p.q, sep)} R ${group3(p.r, sep)}`;
        }
        return '';
      },
      op: s => ` ${s} `,
      imp: () => '',
      minus: () => MINUS,
      open: () => '(',
      close: () => ')',
      ghost: () => '',
      autoOpen: () => '(',
      autoClose: () => ')',
      saidParens: x => x,
      // 2³ when the power is a plain whole number (and the base doesn't already end in one), otherwise 2^x or 2^(…)
      sup: (b, x, wrap) => wrap ? `${b}^(${x})` : /^−?[0-9][0-9, ]*$/.test(x) && !/[⁰¹²³⁴⁵⁶⁷⁸⁹]$/.test(b) ? b + superscript(x.replace(/[, ]/g, '')) : `${b}^${x}`,
      sqrt: (x, wrap) => '√' + wrapIf(x, wrap),
      root: (n, x, wrapN, wrapX) => (/^[0-9]+$/.test(n) ? superscript(n) : `(${n})`) + '√' + wrapIf(x, wrapX),
      frac: (n, d) => `${n} ÷ ${d}`,
      over: (n, d, wrapN, wrapD) => `${wrapIf(n, wrapN)}/${wrapIf(d, wrapD)}`,
      pi: () => 'π',
      pct: () => '%',
      hole: () => '',
      cursor: () => '',
      chip: x => x,
      mark: x => x,
      eq: approx => approx ? ' ≈ ' : ' = ',
      answer: x => x,
      word: w => ` ${w} `,
      wrap: x => x.replace(/ {2,}/g, ' ').trim()
    };
    const S = {
      linear: false,
      number(p) {
        const sg = p.neg ? 'negative ' : '', g = s => group3(s, 'comma');   // (commas, so screen readers say "one thousand")
        switch (p.kind) {
          case 'fixed': return `${sg}${g(p.int)}${p.point ? '.' + p.dec : ''}`;
          case 'rep': return `${sg}${g(p.int)}.${p.pre}${p.rep} with ${p.rep} repeating`;
          case 'sci': return `${sg}${p.mant} times 10 to the power of ${p.exp < 0 ? 'negative ' : ''}${Math.abs(p.exp)}`;
          case 'frac': return `${sg}${g(p.num)} over ${g(p.den)}`;
          case 'mixed': return `${sg}${g(p.whole)} and ${g(p.num)} over ${g(p.den)}`;
          case 'rem': return `${g(p.q)} remainder ${g(p.r)}`;
        }
        return '';
      },
      op: s => ` ${SPOKEN[s] || s} `,
      imp: () => ' times ',
      minus: () => 'negative ',
      open: () => ' open parenthesis ',
      close: () => ' close parenthesis ',
      ghost: () => '',
      autoOpen: () => '',
      autoClose: () => '',
      saidParens: x => ` open parenthesis ${x} close parenthesis `,   // (around a negative base: see saysParens)
      sup: (b, x) => x === '2' ? `${b} squared` : x === '3' ? `${b} cubed` : `${b} to the power of ${x}`,
      sqrt: x => `the square root of ${x}`,
      root: (n, x, wn, wx, k) => k === 3 ? `the cube root of ${x}` : k ? `the ${ordinal(k)} root of ${x}` : `the root ${n} of ${x}`,
      frac: (n, d) => `${n} divided by ${d}`,
      over: (n, d) => ` ${n} over ${d} `,
      pi: () => 'pi',
      pct: () => ' percent',
      hole: () => '',
      cursor: () => '',
      chip: x => x || 'ans',
      mark: x => x,
      eq: approx => approx ? ' is about ' : ' equals ',
      answer: x => x,
      word: w => ` ${w} `,
      wrap: x => x.replace(/\s+/g, ' ').trim()
    };
    return { H, M, T: Tx, S, pick };
  }
  // Something drawn four ways: { text, html, mathml, speech }. (The HTML carries the speech as its aria-label.)
  function rendered(Bs, fn) {
    const speech = Bs.S.wrap(fn(Bs.S));
    return { text: Bs.T.wrap(fn(Bs.T)), html: Bs.H.wrap(fn(Bs.H), speech), mathml: Bs.M.wrap(fn(Bs.M)), speech };
  }

  // Where a negative number (or a minus sign in front) needs parentheses: after an operator (5 − (−3), 2(−3)), as the
  // base of a power ((−3)²), after a minus sign (−(−3)); in plain text also as a power or under √ (2^(−1), √(−4)).
  const NEG_CTX = { right: 1, divisor: 1, base: 1, afterNeg: 1 };
  // In plain text a fraction gets parentheses where a / could be misread: 6 ÷ (3/4), (1/2)³, 2^(1/2), √(1/2).
  const FRAC_CTX = { divisor: 1, base: 1, exp: 1, radicand: 1, index: 1 };
  const needsParens = (B, ctx) => !!NEG_CTX[ctx] || (B.linear && (ctx === 'exp' || ctx === 'radicand' || ctx === 'index'));
  function pieceNeedsParens(B, p, ctx) {
    const q = B.linear && p.kind === 'rep' ? p.fallback : p;
    if (q.kind === 'sci' && (NEG_CTX[ctx] || ctx === 'exp' || ctx === 'radicand')) return true;
    if ((q.kind === 'frac' || q.kind === 'mixed') && (ctx === 'base' || (B.linear && FRAC_CTX[ctx]))) return true;
    return q.neg && needsParens(B, ctx);
  }
  // A negative base of a power says its parentheses too, as typed ones do, so (−3)² isn't heard as −3². That holds for
  // an ans box as well, which the stylized equation draws without them. (Only the speech backend says them.)
  const saysParens = (B, ctx, neg, x) => neg && ctx === 'base' ? B.saidParens(x) : x;
  // A fraction is negative when its top or its bottom, not both, is a negative number: (−3/2)², (3/−2)².
  const startsNeg = (n, R) => n.k === 'cur' ? startsNeg(n.a, R) :
    n.k === 'neg' || ((n.k === 'num' || n.k === 'mixed') && !!n.tok.neg) || (n.k === 'val' && !!formatValue(n.v, R.f).neg);
  // In plain text, a power, root or fraction part that is more than one number gets parentheses: 2^(3 + 1), √(9 + 16).
  const NO_WRAP = { num: 1, val: 1, pi: 1, group: 1, sqrt: 1, root: 1, pct: 1, neg: 1, hole: 1, noans: 1 };
  function wrapText(n) {
    if (n.k === 'cur') n = n.a;
    return !(NO_WRAP[n.k] || (n.k === 'bin' && n.op === '^'));
  }
  const startsWith = (n, kinds) => { while (n.k === 'bin' || n.k === 'pct' || n.k === 'of' || n.k === 'cur') n = n.a; return !!kinds[n.k]; };
  const STARTS_NUMBER = { num: 1, val: 1, mixed: 1 };
  const STARTS_FRAC = { frac: 1, mixed: 1 };
  const endsWithPct = n => { while (n.k === 'bin' || n.k === 'of') n = n.b; return n.k === 'pct'; };
  const indexNumber = n => plainNum(n) && n.tok.s.length < 4 ? Number(n.tok.s) : 0;
  // Where an empty spot is a box to fill (a power, a root, a fraction's top or bottom): drawn as a dashed box.
  const SLOT_CTX = { exp: 1, radicand: 1, index: 1, frac: 1 };
  // A part ends in a number (1.5, ans): then a fraction right after it shows its ×, so 1 × ½ isn't read as 1½.
  const endsWithNumber = n => { while ((n.k === 'bin' && n.op !== '^') || n.k === 'of' || n.k === 'cur') n = n.b; return n.k === 'num' || n.k === 'val' || n.k === 'mixed'; };

  // Draws a tree. ctx: where this node sits ('start', 'left', 'right', 'divisor', 'base', 'exp', 'radicand', 'index',
  // 'afterNeg', 'group', 'frac'). R: { f (display options), mark (the node to mark), more (… after rounded numbers),
  // cursor (draw the cursor) }.
  function draw(node, B, ctx, R) {
    let s = '';
    const paren = (x, yes) => yes ? B.autoOpen() + x + B.autoClose() : x;
    switch (node.k) {
      case 'hole': s = B.hole(node.cursor && R.cursor, !!SLOT_CTX[ctx]); break;
      case 'cur': s = draw(node.a, B, ctx, R) + (R.cursor ? B.cursor() : ''); break;
      case 'num': { const p = typedPiece(node.tok); s = saysParens(B, ctx, p.neg, paren(B.number(p), pieceNeedsParens(B, p, ctx))); break; }
      case 'val': s = drawValue(node.v, B, ctx, boxOpts(R.f, node), R.more, node.ans); break;
      case 'noans': s = B.chip(B.linear ? 'ans' : ''); break;
      case 'pi': s = B.pi(); break;
      case 'mixed': {
        const p = { kind: 'mixed', neg: node.tok.neg, whole: node.tok.s, num: node.num.s, den: node.den.s, rounded: false };
        s = saysParens(B, ctx, p.neg, paren(B.number(p), pieceNeedsParens(B, p, ctx)));
        break;
      }
      case 'group': s = B.open() + draw(node.a, B, 'group', R) + (node.closed ? B.close() : B.ghost()); break;
      case 'neg': s = saysParens(B, ctx, true, paren(B.minus() + draw(node.a, B, 'afterNeg', R), needsParens(B, ctx))); break;
      case 'sqrt': s = B.sqrt(draw(node.a, B, 'radicand', R), wrapText(node.a)); break;
      case 'root': s = B.root(draw(node.b, B, 'index', R), draw(node.a, B, 'radicand', R), wrapText(node.b), wrapText(node.a), indexNumber(node.b)); break;
      case 'frac': {
        const x = B.over(draw(node.a, B, 'frac', R), draw(node.b, B, 'frac', R), wrapText(node.a), wrapText(node.b));
        s = saysParens(B, ctx, startsNeg(node.a, R) !== startsNeg(node.b, R), paren(x, B.linear ? ctx === 'divisor' || ctx === 'base' || ctx === 'index' : ctx === 'base'));
        break;
      }
      case 'pct': s = draw(node.a, B, ctx, R) + B.pct(); break;
      case 'of': {
        const lc = ctx === 'right' || ctx === 'divisor' || ctx === 'afterNeg' ? 'right' : ctx === 'exp' || ctx === 'radicand' ? ctx : 'left';
        s = draw(node.a, B, lc, R) + B.pct() + B.word('of') + draw(node.b, B, 'right', R);
        break;
      }
      case 'bin':
        if (node.op === '^') {
          const base = draw(node.a, B, 'base', R);
          s = B.sup(paren(base, node.a.k === 'bin' && node.a.op === '^'), draw(node.b, B, 'exp', R), wrapText(node.b));
        } else if (node.op === '/' && R.f.stackedDivision && !B.linear) {
          const un = n => n.k === 'group' && n.closed && n !== R.mark ? n.a : n;   // the fraction bar groups
          s = B.frac(draw(un(node.a), B, 'frac', R), draw(un(node.b), B, 'frac', R));
        } else {
          const lc = ctx === 'right' || ctx === 'divisor' || ctx === 'afterNeg' ? 'right' : ctx === 'exp' || ctx === 'radicand' ? ctx : 'left';
          // 2π, 2(3 + 4), 3√16 have no sign; a number after ) or π or % shows its × ((1 + 2) × 3), and so does a
          // fraction after a number in plain text (1.5 × 1/2)
          const sym = node.op === 'imp'
            ? (startsWith(node.b, STARTS_NUMBER) || endsWithPct(node.a) || (B.linear && startsWith(node.b, STARTS_FRAC)) ||
               (startsWith(node.b, { frac: 1 }) && endsWithNumber(node.a)) ? '×' : null)
            : SYM[node.op];
          s = draw(node.a, B, lc, R) + (sym ? B.op(sym) : B.imp()) + draw(node.b, B, node.op === '/' ? 'divisor' : 'right', R);
        }
        break;
    }
    return node === R.mark ? B.mark(s) : s;
  }
  function drawValue(v, B, ctx, f, more, chip) {
    const p = formatValue(v, f);
    if (more) { p.more = p.rounded; if (p.fallback) p.fallback.more = true; }
    if (chip && !B.linear) return saysParens(B, ctx, p.neg, B.chip(B.number(p)));   // ans, as Desmos shows it: the number in a box marked "ans"
    return saysParens(B, ctx, p.neg, pieceNeedsParens(B, p, ctx) ? B.autoOpen() + B.number(p) + B.autoClose() : B.number(p));
  }
  // "= answer" (or ≈ when the answer shown is rounded and the option is on).
  function drawAnswer(Bs, B, p, f) {
    const q = Bs.pick(B, p);
    return B.eq(f.approxSign && q.rounded) + B.answer(B.number(p));
  }

  // ---- Steps -------------------------------------------------------------------------------------------------------
  // Works a problem out one operation at a time, in the order of operations, and draws each line with the part worked
  // out next marked: 2 + [3 × 4] → [2 + 12] → 14. Next is always the deepest inside parentheses or a box (a power, a
  // root, a fraction's top or bottom); at the same depth, exponents and roots first, then × ÷ and "of", then + and −;
  // left to right among equals. The answer of = comes from here too, so the steps and the answer always agree.
  const STEP = {
    '^': [3, 'power', 'E'], '*': [2, 'multiply', 'MD'], imp: [2, 'multiply', 'MD'], '/': [2, 'divide', 'MD'], frac: [2, 'divide', 'MD'],
    '+': [1, 'add', 'AS'], '-': [1, 'subtract', 'AS'], of: [2, 'percent', 'MD'], mixed: [2, 'divide', 'MD'],
    sqrt: [3, 'root', 'E'], root: [3, 'root', 'E'], pct: [3, 'percent', 'MD'], neg: [3, 'sign', 'O'], group: [4, 'parens', 'P']
  };
  // The words for each step's rule. On the canvas, P E MD AS light the rule cells ( ), xⁿ √, × ÷, and + −. O (the
  // opposite of a number, −(−3) = 3) lights none. G (inside a root, a power or a fraction) shows the operation's cell
  // softly.
  const RULES = {
    P: 'Parentheses first',
    G: 'Inside first',
    E: 'Exponents and roots',
    MD: 'Multiply and divide, left to right',
    AS: 'Add and subtract, left to right',
    O: 'The opposite'
  };
  const inBox = (n, side) => n.k === 'sqrt' || n.k === 'root' || n.k === 'frac' || (n.k === 'bin' && n.op === '^' && side === 'b');
  function setParents(node, parent) {
    node.p = parent;
    for (const c of kids(node)) setParents(c, node);
  }
  function replaceNode(old, next) {
    const p = old.p;
    next.p = p;
    if (p.a === old) p.a = next; else p.b = next;
  }
  // Where a node sits, as draw() sees it (to know whether a negative number gets parentheses there).
  function ctxOf(node) {
    const p = node.p;
    switch (p.k) {
      case 'root': return node === p.a ? 'radicand' : 'index';
      case 'group': return 'group';
      case 'neg': return 'afterNeg';
      case 'sqrt': return 'radicand';
      case 'frac': return 'frac';
      case 'pct': return ctxOf(p);
      case 'bin': case 'of': {
        if (p.k === 'bin' && p.op === '^') return node === p.a ? 'base' : 'exp';
        if (node === p.b) return p.op === '/' ? 'divisor' : 'right';
        const c = ctxOf(p);
        return c === 'right' || c === 'divisor' || c === 'afterNeg' ? 'right' : c === 'exp' || c === 'radicand' ? c : 'left';
      }
    }
    return 'start';
  }
  // Changes nobody can see are made without a step: a minus sign in front of a number becomes a negative number, and
  // parentheses around a negative number that would get parentheses anyway go.
  function tidy(root, f, H) {
    let changed = true;
    const walk = n => {
      for (const c of kids(n)) walk(c);
      if (n.k === 'neg' && n.a.k === 'num' && !n.a.tok.neg) { replaceNode(n, { k: 'num', tok: { t: 'num', s: n.a.tok.s, neg: true } }); changed = true; }
      else if (n.k === 'neg' && n.a.k === 'mixed' && !n.a.tok.neg) { replaceNode(n, Object.assign({}, n.a, { tok: { t: 'num', s: n.a.tok.s, neg: true } })); changed = true; }
      else if (n.k === 'neg' && n.a.k === 'val' && sign(n.a.v) > 0) { replaceNode(n, Object.assign({ k: 'val', v: negate(n.a.v) }, n.a.rem ? { rem: true } : null)); changed = true; }
      else if (n.k === 'group' && n.closed && (n.a.k === 'num' || n.a.k === 'val')) {
        const p = n.a.k === 'num' ? typedPiece(n.a.tok) : formatValue(n.a.v, boxOpts(f, n.a));
        if (pieceNeedsParens(H, p, ctxOf(n))) { replaceNode(n, n.a); changed = true; }
      }
    };
    while (changed) { changed = false; walk(root.a); }
  }
  // (3) around a lone number goes with the step that uses it: 2(3)(4) is 2(3) = 6, then 6(4) = 24.
  const loneGroup = n => n.k === 'group' && n.closed && isLeaf(n.a);
  const leafish = n => isLeaf(n) || loneGroup(n);
  function candidates(node, depth, out, top, inside) {
    if (isLeaf(node) && !(top && (node.k === 'mixed' || node.k === 'frac'))) return;   // a fraction alone is worked out
    if (!top && loneGroup(node)) return;
    const ks = kids(node);
    const leaf = ks.every(leafish) && (node.k !== 'pct' || !node.base || leafish(node.base.a));
    if (leaf) {
      const [rank, op, rule] = STEP[node.k === 'bin' ? node.op : node.k];
      out.push({ node, depth: node.k === 'group' ? depth + 1 : depth, rank, op, rule, inside: node.k === 'group' ? 'parens' : inside || null });
      return;
    }
    const inner = node.k === 'group' ? depth + 1 : depth, kind = node.k === 'group' ? 'parens' : inside;
    if (node.a) candidates(node.a, inner + (inBox(node, 'a') ? 1 : 0), out, false, inBox(node, 'a') ? 'box' : kind);
    if (node.b) candidates(node.b, inner + (inBox(node, 'b') ? 1 : 0), out, false, inBox(node, 'b') ? 'box' : kind);
  }
  function reduce(node, o) {
    const L = n => leafValue(loneGroup(n) ? n.a : n);
    switch (node.k) {
      case 'group': return L(node.a);
      case 'neg': return negate(L(node.a));
      case 'sqrt': return squareRoot(L(node.a));
      case 'root': return nthRoot(L(node.a), L(node.b), o);
      case 'frac': return divide(L(node.a), L(node.b));
      case 'mixed': return L(node);
      case 'pct': return percent(L(node.a), node.base ? L(node.base.a) : null);
      case 'of': return multiply(percent(L(node.a), null), L(node.b));
      case 'bin': return binary(node.op, L(node.a), L(node.b), o);
    }
    throw new Error('Nothing to work out');
  }
  // tokens must be complete (no holes, every box closed). prev: the value ans stands for (sheet). Answers
  // { value, error (a code), rem (the answer's remainder, remainderOf) } and, with Bs, steps (each drawn four ways).
  function solve(tokens, pctMode, o, f, Bs, prev) {
    const root = { k: 'top', a: parse(tokens, pctMode, prev) };
    setParents(root.a, root);
    const steps = [], R = { f, mark: null, more: true, cursor: false };
    const line = mark => { R.mark = mark; const r = rendered(Bs, B => draw(root.a, B, 'start', R)); R.mark = null; return r; };
    const H = Bs ? Bs.H : backends(f).H;
    let error = null, last = null;   // last: the last step, { c, region, v, a, b } (a and b: its two values, for a ÷)
    const L = n => leafValue(loneGroup(n) ? n.a : n);
    // A step's work: what it worked out, = its value (or the answer's piece, for the last step).
    const workOf = (c, region, p) => rendered(Bs, B => {
      const lhs = c.op === 'percent' && c.node.base
        ? draw(c.node, B, 'start', R) + B.word('of') + draw(c.node.base.a, B, 'start', R)
        : draw(c.node.k === 'group' ? region : c.node, B, 'start', R);
      return lhs + B.eq(f.approxSign && Bs.pick(B, p).rounded) + B.number(p);
    });
    tidy(root, f, H);
    for (let guard = 0; guard < 1000; guard++) {
      const list = [];
      candidates(root.a, 0, list, true);
      if (!list.length) break;
      let c = null;
      for (const x of list) if (!c || x.depth > c.depth || (x.depth === c.depth && x.rank > c.rank)) c = x;
      let region = c.node;   // the value replaces the parentheses around it too
      while (region.p.k === 'group') region = region.p;
      let v;
      try { v = reduce(c.node, o); } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        error = e.code;
        if (Bs) steps.push(Object.assign(line(region), { rule: c.rule, op: c.op, inParens: c.depth > 0, inside: c.inside, work: null, error: info(error) }));
        break;
      }
      const div = c.node.k === 'bin' && c.node.op === '/';
      last = { c, region, v, a: div ? L(c.node.a) : null, b: div ? L(c.node.b) : null };
      if (Bs) steps.push(Object.assign(line(region), { rule: c.rule, op: c.op, inParens: c.depth > 0 && c.op !== 'parens', inside: c.op === 'parens' ? null : c.inside, work: workOf(c, region, formatValue(v, f)), error: null }));
      replaceNode(region, { k: 'val', v });
      tidy(root, f, H);
    }
    let value = null, rem = null;
    if (!error) {
      try { value = inRange(leafValue(root.a)); } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        error = e.code; value = null;
      }
      rem = value && last ? remainderOf(last.a, last.b, value) : null;
      if (Bs) {
        const p = value ? answerPiece(value, f, rem) : null;
        // The last step's work shows the answer as the answer shows: 17 ÷ 5 = 3 R 2.
        if (p && p.kind === 'rem') steps[steps.length - 1].work = workOf(last.c, last.region, p);
        steps.push(Object.assign(p ? rendered(Bs, B => B.answer(B.number(p))) : line(null),
          { rule: null, op: null, inParens: false, inside: null, work: null, error: error ? info(error) : null, final: true }));
      }
    }
    return { value, error, steps, rem };
  }

  // ---- Options -----------------------------------------------------------------------------------------------------
  const DEFAULTS = Object.freeze({
    percent: 'of',            // 'of': % types "% of", as in Desmos (10% of 50 = 5) · 'simple': % is ÷ 100 ·
                              // 'apple': 50 + 10% = 55 (iPhone and Mac)
    digits: 10,               // 10: as Desmos Scientific · 7: as Desmos Four-Function
    separators: 'space',      // 'space' (1 234, as Desmos) · 'comma' (1,234) · 'faint' (1,234, the commas drawn
                              // softly: the 21Board widget's) · 'none'
    approxSign: false,        // true: the equation says ≈ when the answer shown is rounded (Desmos always says =)
    zeroPowerZero: 'one',     // 0⁰: 'one' (as Desmos) or 'error' (a friendly message)
    answerAs: 'decimal',      // 'decimal' | 'fraction' (7/2) | 'mixed' (3 1/2) | 'remainder' (17 ÷ 5 = 3 R 2, other
                              // answers as decimals; one display only, a sheet shows decimals): how answers show at first
    stackedDivision: false,   // the stylized equation shows ÷ as a fraction bar
    repeatingBar: false,      // the stylized equation shows 1 ÷ 3 = 0.3̅ (a bar over the repeating digits)
    slash: 'divide',          // the / key on a keyboard: 'divide' (÷, as Desmos Four-Function) or 'fraction' (a stacked
                              // fraction, as Desmos Scientific)
    toggle: true,             // the fraction ↔ decimal toggle (Desmos Scientific has it; Four-Function and many state
                              // tests turn it off)
    keys: null,               // null, or the names of the keys this calculator has ('digits' for 0 to 9): others are
                              // ignored, typed or not (= AC C ⌫ → ↑ ↓ undo redo work always)
    repeatEquals: true,       // one display: = again repeats the last operation: 5 + 2 = = gives 9
    historySize: 10           // one display: 0 to 50
  });
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  // Options come from saved settings (maybe an imported file): only known values are taken.
  function readOptions(o) {
    const r = Object.assign({}, DEFAULTS);
    if (!isObj(o)) return r;
    const choose = (k, allowed) => { if (own(o, k) && allowed.includes(o[k])) r[k] = o[k]; };
    choose('percent', ['of', 'simple', 'apple']);
    choose('answerAs', ['decimal', 'fraction', 'mixed', 'remainder']);
    choose('zeroPowerZero', ['error', 'one']);
    choose('digits', [10, 7]);
    choose('separators', ['space', 'comma', 'faint', 'none']);
    choose('slash', ['divide', 'fraction']);
    if (own(o, 'separators') && o.separators === false) r.separators = 'none';
    for (const k of ['repeatEquals', 'stackedDivision', 'approxSign', 'repeatingBar', 'toggle']) if (own(o, k) && typeof o[k] === 'boolean') r[k] = o[k];
    if (own(o, 'keys') && Array.isArray(o.keys) && o.keys.length <= 64) r.keys = Object.freeze(o.keys.filter(k => typeof k === 'string' && (own(KEYS, k) || k === 'digits')));
    if (own(o, 'historySize') && Number.isInteger(o.historySize) && o.historySize >= 0 && o.historySize <= LIMITS.history) r.historySize = o.historySize;
    return r;
  }
  const displayOpts = (o, answerAs) => ({ answerAs: answerAs || o.answerAs, stackedDivision: o.stackedDivision, approxSign: o.approxSign,
    repeatingBar: o.repeatingBar, separators: o.separators, digits: o.digits, remBoxes: o.answerAs === 'remainder' });
  // The answer was shown with its remainder (or would be, before ⇄): an ans box made from it gets rem (see boxOpts).
  const shownWithRem = (o, rem) => o.answerAs === 'remainder' && !!remainderPiece(rem, displayOpts(o));

  // ---- Keys --------------------------------------------------------------------------------------------------------
  // Canonical names, with labels (Desmos's where Desmos has the key) and spoken names. press() also takes the aliases.
  const KEYS = Object.freeze(Object.assign({}, ...'0123456789'.split('').map((d, i) => ({ [d]: { label: d, name: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][i] } })), {
    point: { label: '.', name: 'point' },
    add: { label: '+', name: 'plus' },
    subtract: { label: MINUS, name: 'minus' },
    multiply: { label: '×', name: 'multiply' },
    divide: { label: '÷', name: 'divide' },
    equals: { label: '=', name: 'equals' },
    clear: { label: 'AC', name: 'all clear' },
    clearEntry: { label: 'C', name: 'clear entry' },
    backspace: { label: '⌫', name: 'delete' },
    negate: { label: '±', name: 'opposite' },
    percent: { label: '%', name: 'percent of' },
    open: { label: '(', name: 'open parenthesis' },
    close: { label: ')', name: 'close parenthesis' },
    sqrt: { label: '√', name: 'square root' },
    cbrt: { label: '∛', name: 'cube root' },
    root: { label: 'ⁿ√', name: 'nth root' },
    square: { label: 'a²', name: 'squared' },
    power: { label: 'aᵇ', name: 'power' },
    pi: { label: 'π', name: 'pi' },
    ans: { label: 'ans', name: 'answer' },
    fraction: { label: 'a/b', name: 'fraction' },
    over: { label: '⁄', name: 'over' },
    right: { label: '→', name: 'move right' },
    up: { label: '↑', name: 'up' },
    down: { label: '↓', name: 'down' },
    toggle: { label: '⇄', name: 'fraction or decimal' },
    undo: { label: '↶', name: 'undo' },
    redo: { label: '↷', name: 'redo' }
  }));
  const ALIASES = {
    '.': 'point', ',': 'point', '+': 'add', '-': 'subtract', [MINUS]: 'subtract', '*': 'multiply', '×': 'multiply', x: 'multiply',
    '/': 'divide', '÷': 'divide', '=': 'equals', AC: 'clear', C: 'clearEntry', '⌫': 'backspace', back: 'backspace',
    '±': 'negate', '+/-': 'negate', neg: 'negate', '%': 'percent', '(': 'open', ')': 'close', '√': 'sqrt', sqrt: 'sqrt',
    '∛': 'cbrt', 'ⁿ√': 'root', nthroot: 'root', '²': 'square', 'x²': 'square', 'a²': 'square', sq: 'square', '^': 'power',
    'xʸ': 'power', 'aᵇ': 'power', 'π': 'pi', Ans: 'ans', 'a/b': 'fraction', frac: 'fraction', '⁄': 'over', '→': 'right',
    '↑': 'up', '↓': 'down', '⇄': 'toggle', '↶': 'undo', '↷': 'redo'
  };
  const keyName = k => typeof k !== 'string' ? null : own(KEYS, k) ? k : own(ALIASES, k) ? ALIASES[k] : null;
  const ALWAYS = { equals: 1, clear: 1, clearEntry: 1, backspace: 1, right: 1, up: 1, down: 1, undo: 1, redo: 1 };
  const allowed = (o, k) => !o.keys || !!ALWAYS[k] || o.keys.includes(k) || (/^[0-9]$/.test(k) && o.keys.includes('digits'));
  const OPS = { add: '+', subtract: '-', multiply: '*', divide: '/' };
  const RANK = { '+': 1, '-': 1, of: 1.5, '*': 2, '/': 2 };

  // ---- Key presses -------------------------------------------------------------------------------------------------
  // What one problem needs, as a plain object, so a press can be tried on a copy (canPress).
  const blank = () => ({ tokens: [], mode: 'edit', result: null, rem: null, error: null, notice: null, closed: 0, pct: 'of', frac: false, history: [] });
  const digitCount = s => s.replace('.', '').length - (s.startsWith('0.') ? 1 : 0);
  const zero = () => ({ t: 'num', s: '0', neg: false });
  // A number is finished when something else is pressed: "5." becomes "5", and a 0 keeps no sign, since 0 is its own
  // opposite ("−0" typed after ±, or left by ⌫, becomes 0). null when it stays as it is.
  function finished(t) {
    if (!t || t.t !== 'num') return null;
    const dot = t.s.endsWith('.'), neg = !!t.neg && /[1-9]/.test(t.s);
    return dot || neg !== !!t.neg ? { t: 'num', s: dot ? t.s.slice(0, -1) || '0' : t.s, neg } : null;
  }
  // The tokens that = adds to close every box still open (null when a fraction's top or a root's index is still open).
  function closers(tokens) {
    const boxes = openBoxes(tokens) || [];
    if (boxes.some(b => b === 'numer' || b === 'index')) return null;
    return boxes.reverse().map(b => (b === 'paren' ? { t: 'close' } : { t: 'end' }));
  }
  // The numerator a typed / takes (Desmos): the operand just before it, back to an operator, a sign or a box edge:
  // 6 then / makes 6/□, 2 × 3 / makes 2 × 3/□, 2π / makes 2π/□, (1 + 2) / keeps its parentheses.
  function numeratorStart(tokens) {
    let j = tokens.length, d = 0;
    while (j > 0) {
      const t = tokens[j - 1];
      if (t.t === 'close' || t.t === 'end') d++;
      else if (BOX_OPENER[t.t]) { if (d === 0) break; d--; }
      else if (d === 0 && (t.t === 'op' || t.t === 'neg' || t.t === 'of' || t.t === 'sep')) break;
      j--;
    }
    return j;
  }

  // Where the box the cursor is in starts (just after its opener, or the start of the problem): a ) with no ( open
  // wraps from here.
  function boxStart(tokens) {
    const st = [];
    tokens.forEach((t, i) => {
      if (BOX_OPENER[t.t]) st.push(i + 1);
      else if (t.t === 'sep') { st.pop(); st.push(i + 1); }
      else if (t.t === 'close' || t.t === 'end') st.pop();
    });
    return st.length ? st[st.length - 1] : 0;
  }
  // The tokens end with a mixed number, 1⅔ (a whole number, then a fraction of whole numbers, closed).
  function endsMixed(tokens) {
    const n = tokens.length, w = t => t && t.t === 'num' && !t.neg && /^[0-9]+$/.test(t.s);
    return n >= 6 && tokens[n - 1].t === 'end' && w(tokens[n - 2]) && tokens[n - 3].t === 'sep' && w(tokens[n - 4]) &&
      tokens[n - 5].t === 'frac' && w(tokens[n - 6]);
  }
  // Two numbers that now sit side by side (at i − 1 and i) become one, as Desmos joins them: 1 and 24 make 124. Null
  // when they can't (two points, a sign, too many digits).
  function joinDigits(tokens, i) {
    const a = tokens[i - 1], b = tokens[i];
    if (!a || !b || a.t !== 'num' || b.t !== 'num') return tokens;
    if (b.neg || (a.s.includes('.') && b.s.includes('.'))) return null;
    const s = (a.s === '0' && !b.s.startsWith('.') ? '' : a.s) + b.s;
    if (digitCount(s) > LIMITS.digits) return null;
    return tokens.slice(0, i - 1).concat([{ t: 'num', s: s.startsWith('.') ? '0' + s : s, neg: a.neg }], tokens.slice(i + 1));
  }

  // One key press on state S. Answers true when the problem changed. o: options; solveFn works = out (one display);
  // sheet: a line of the sheet (ans is the line above, and the sheet handles =, AC, undo and moving between lines).
  // A key that does nothing leaves everything as it was (a dimmed ) doesn't turn "7." into "7").
  function pressOn(S, key, o, solveFn, sheet) {
    const kept = { tokens: S.tokens, mode: S.mode, result: S.result, rem: S.rem, error: S.error, closed: S.closed, frac: S.frac };
    const changed = pressKey(S, key, o, solveFn, sheet);
    if (!changed) Object.assign(S, kept);
    return changed;
  }
  function pressKey(S, key, o, solveFn, sheet) {
    S.notice = null;
    const last = () => S.tokens[S.tokens.length - 1];
    const fresh = () => { S.tokens = []; S.mode = 'edit'; S.result = null; S.error = null; S.closed = 0; S.frac = false; };
    const tryTokens = next => {   // the problem becomes `next`, if it is a problem the keys could make
      if (next.length > LIMITS.tokens) { S.notice = info('long'); return false; }
      const boxes = openBoxes(next);
      if (!boxes) return false;
      for (let j = 0; j < next.length; j++) if (!canFollow(next[j - 1], next[j])) return false;
      if (deepest(next) > LIMITS.depth) { S.notice = info('deep'); return false; }
      S.tokens = next;
      return true;
    };
    const push = (...toks) => tryTokens(S.tokens.concat(toks));
    const setLast = tok => tryTokens(S.tokens.slice(0, -1).concat([tok]));
    const pop = () => { S.tokens = S.tokens.slice(0, -1); return true; };
    // auto: the answer = left on screen (iPhone: a digit typed right after it starts a new number in its place). rem: it
    // was shown with a remainder (shownWithRem).
    const ans = (v, auto, rem) => Object.assign({ t: 'ans', v }, auto ? { auto: true } : null, rem ? { rem: true } : null);
    const remShown = () => S.mode === 'done' && shownWithRem(o, S.rem);
    const fromAnswer = (...after) => { S.tokens = [ans(S.result, true, remShown())].concat(after); S.mode = 'edit'; S.result = null; S.closed = 0; S.frac = false; return true; };
    const finish = () => { const f = finished(last()); if (f) S.tokens = S.tokens.slice(0, -1).concat([f]); };
    const top = () => { const b = openBoxes(S.tokens) || []; return b[b.length - 1] || null; };
    const lastEndsPower = () => last() && last().t === 'end' && (openBoxes(S.tokens.slice(0, -1)) || []).pop() === 'pow';
    const ended = () => last() && OPERAND_END[last().t];
    const done = S.mode === 'done', failed = S.mode === 'error';

    if (/^[0-9]$/.test(key)) {
      if (done || failed) fresh();
      const t = last();
      if (t && t.t === 'num') {
        if (t.s === '0') return key === '0' ? false : setLast({ t: 'num', s: key, neg: t.neg });
        if (digitCount(t.s) >= LIMITS.digits) { S.notice = info('digits'); return false; }
        return setLast({ t: 'num', s: t.s + key, neg: t.neg });
      }
      if (t && t.t === 'neg' && t.pm) return setLast({ t: 'num', s: key, neg: true });   // after ±: the number itself is negative, so ± 3 a² is (−3)²
      if (t && t.t === 'ans' && t.auto) return setLast({ t: 'num', s: key, neg: false });   // right after =, √ or ±
      if (endsMixed(S.tokens)) { S.notice = info('adjacent'); return false; }   // 1⅔ then 4 (Desmos refuses it too)
      return push({ t: 'num', s: key, neg: false });   // after ans it multiplies: ans2 (as Desmos)
    }
    switch (key) {
      case 'point': {
        if (done || failed) fresh();
        const t = last();
        if (t && t.t === 'num') {
          if (t.s.includes('.')) return false;
          if (digitCount(t.s) >= LIMITS.digits) { S.notice = info('digits'); return false; }
          return setLast({ t: 'num', s: t.s + '.', neg: t.neg });
        }
        if (t && t.t === 'neg' && t.pm) return setLast({ t: 'num', s: '0.', neg: true });
        if (t && t.t === 'ans' && t.auto) return setLast({ t: 'num', s: '0.', neg: false });
        if (endsMixed(S.tokens)) { S.notice = info('adjacent'); return false; }
        return push({ t: 'num', s: '0.', neg: false });   // ans.5 is ans × 0.5 (as Desmos)
      }
      case 'add': case 'subtract': case 'multiply': case 'divide': {
        const v = OPS[key];
        if (failed) { fresh(); S.tokens = sheet ? [] : [zero()]; }
        else if (done) fromAnswer();
        finish();
        // Desmos: + − × leave a power box that has something in it: 2^3 + 1 is 2³ + 1 (÷ stays in: 2^(3 ÷ 4))
        if (v !== '/' && top() === 'pow' && ended()) S.tokens = S.tokens.concat([{ t: 'end' }]);
        const t = last();
        if (!t) {
          if (v === '-') return push({ t: 'neg' });
          return sheet ? false : push(zero(), { t: 'op', v });   // the 0 on the display (iPhone)
        }
        if (t.t === 'op' || t.t === 'of' || t.t === 'pow') {
          if (v === '-') return push({ t: 'neg' });             // 5 × −3, 5 − −3, 2^−1 (as Desmos)
          if (t.t !== 'pow' && v === '+') return false;         // + after an operator changes nothing (Desmos: 5 × +3 = 15)
          if (t.t === 'of') { S.notice = info('incomplete', incompleteMessage({ parent: { k: 'of' } })); return false; }   // keep the %
          if (t.v === v) return false;
          return setLast({ t: 'op', v });                       // × ÷ replace the operator waiting (iPhone)
        }
        if (t.t === 'neg') {   // a minus sign in front, then another operator
          if (v === '-') return push({ t: 'neg' });             // −−3 = 3 (as Desmos)
          pop();
          if (!last() && !sheet) S.tokens = [zero()];
          if (last() && !OPERAND_END[last().t]) return pressKey(S, key, o, solveFn, sheet) || true;
          return (last() ? push({ t: 'op', v }) : false) || true;
        }
        if (!OPERAND_END[t.t]) return v === '-' ? push({ t: 'neg' }) : false;   // after (, √, a box: only a minus sign
        return push({ t: 'op', v });
      }
      case 'power': {
        if (failed) { if (sheet) return false; fresh(); S.tokens = [zero()]; }
        else if (done) fromAnswer();
        finish();
        if (lastEndsPower()) return pop();   // back into the power just left (Desmos joins them)
        const t = last();
        if (t && t.t === 'of') { S.notice = info('incomplete', incompleteMessage({ parent: { k: 'of' } })); return false; }   // keep the %
        if (t && t.t === 'op') return setLast({ t: 'pow' }) || false;   // replaces the operator waiting
        if (!t) return sheet ? false : push(zero(), { t: 'pow' });
        return ended() ? push({ t: 'pow' }) : false;
      }
      case 'square': {   // a² is a whole power box: 3² (and 3² × 4 needs nothing more)
        if (done) return fromAnswer({ t: 'pow' }, { t: 'num', s: '2', neg: false }, { t: 'end' });
        if (failed) return false;
        finish();
        return ended() ? push({ t: 'pow' }, { t: 'num', s: '2', neg: false }, { t: 'end' }) : false;
      }
      case 'percent': {
        const tok = o.percent === 'of' ? { t: 'of' } : { t: 'pct' };
        if (done) return fromAnswer(tok);
        if (failed) return false;
        finish();
        return ended() ? push(tok) : false;
      }
      case 'sqrt': case 'cbrt': {
        const box = key === 'sqrt' ? [{ t: 'sqrt' }] : [{ t: 'root', cube: true }, { t: 'num', s: '3', neg: false }, { t: 'sep' }];
        if (done) { S.tokens = box.concat([ans(S.result, true, remShown())]); S.mode = 'edit'; S.result = null; S.closed = 0; S.frac = false; return true; }   // √ of the answer
        if (failed) fresh();
        finish();
        return push(...box);
      }
      case 'root': case 'fraction': case 'pi': case 'open': {
        if (done || failed) fresh();
        finish();
        return push({ t: { root: 'root', fraction: 'frac', pi: 'pi', open: 'open' }[key] });
      }
      case 'over': {   // a typed /: what was just typed becomes the top of a fraction (Desmos Scientific)
        if (failed) fresh();
        else if (done) fromAnswer();
        finish();
        if (!ended()) return push({ t: 'frac' });
        const j = numeratorStart(S.tokens);
        return tryTokens(S.tokens.slice(0, j).concat([{ t: 'frac' }], S.tokens.slice(j), [{ t: 'sep' }]));
      }
      case 'close': {
        if (done || failed) return false;
        finish();
        const boxes = openBoxes(S.tokens) || [];
        const p = boxes.lastIndexOf('paren');
        if (!ended()) return false;   // ) right after an operator or at the start (Desmos: "Parentheses cannot be empty")
        if (p < 0) {   // no ( open: everything typed in this box goes inside (2 + 3) (as Desmos)
          const j = boxStart(S.tokens);
          return tryTokens(S.tokens.slice(0, j).concat([{ t: 'open' }], S.tokens.slice(j), [{ t: 'close' }]));
        }
        const out = [];
        for (let j = boxes.length - 1; j > p; j--) { if (!CLOSED_BY_END[boxes[j]]) return false; out.push({ t: 'end' }); }
        return push(...out, { t: 'close' });
      }
      case 'right': case 'down': case 'up': {   // → out of the box the cursor is in (Desmos's arrow keys)
        if (done || failed) return false;
        finish();
        const b = top();
        if (key === 'up') return b === 'denom' && last().t === 'sep' ? pop() : false;   // back to the top of the fraction
        if (key === 'down' && b !== 'numer' && b !== 'index') return false;
        if (!b || !ended()) return false;
        return push(b === 'paren' ? { t: 'close' } : b === 'numer' || b === 'index' ? { t: 'sep' } : { t: 'end' });
      }
      case 'negate': {   // the opposite. 0 is its own opposite, so ± leaves a 0 alone (6.NS.C.6a).
        if (done) {
          if (isZero(S.result)) return false;
          S.tokens = [ans(negate(S.result), true, remShown())]; S.mode = 'edit'; S.result = null; S.closed = 0; S.frac = false; return true;
        }
        if (failed) fresh();
        const t = last();
        if (t && t.t === 'num') {
          if (!/[1-9]/.test(t.s)) return t.neg && setLast({ t: 'num', s: t.s, neg: false });   // 0, 0., 0.00 (a − that ⌫ left comes off)
          return setLast({ t: 'num', s: t.s, neg: !t.neg });
        }
        if (t && t.t === 'ans') return !isZero(t.v) && setLast(ans(negate(t.v), t.auto, t.rem));
        if (t && t.t === 'prev') {   // −ans (sheet): a minus sign in front, or off again
          const b = S.tokens[S.tokens.length - 2];
          if (b && b.t === 'neg') return tryTokens(S.tokens.slice(0, -2).concat([t]));
          return tryTokens(S.tokens.slice(0, -1).concat([{ t: 'neg' }, t]));
        }
        if (t && t.t === 'neg') return pop();   // a lone − goes again
        // Nothing typed yet (the display's 0), or after ), π, a box, %: nothing to change. After an operator, (, √, or
        // a box opening, a lone −, as − starts there. pm: the digits typed next make a negative number, as ± after
        // them would, so 5 + ± 3 is 5 + (−3). It saves as − does.
        if (!t || OPERAND_END[t.t]) return false;
        return push({ t: 'neg', pm: true });
      }
      case 'ans': {
        if (sheet) return useValue(S, { t: 'prev' });
        if (S.mode === 'done') return useValue(S, ans(S.result, false, remShown()));
        const h = S.history[0];
        return h ? useValue(S, ans(h.value, false, shownWithRem(o, h.rem))) : false;
      }
      case 'backspace': {
        if (done || failed) {   // back to the problem, to fix it (the boxes = closed open again)
          S.tokens = S.tokens.slice(0, S.tokens.length - S.closed);
          S.mode = 'edit'; S.result = null; S.error = null; S.closed = 0; S.frac = false;
          return true;
        }
        const t = last();
        if (!t) return false;
        if (t.t === 'num' && t.s.length > 1) return setLast({ t: 'num', s: t.s.slice(0, -1), neg: t.neg });
        if (t.t === 'sep') {   // an empty bottom: the fraction goes and its top stays (Desmos); an empty root goes
          const before = S.tokens.slice(0, -1), boxes = openBoxes(before);
          let j = before.length, d = 0;
          while (j > 0) { const u = before[j - 1]; if (u.t === 'close' || u.t === 'end') d++; else if (BOX_OPENER[u.t]) { if (d === 0) break; d--; } j--; }
          const opener = before[j - 1];
          if (opener && opener.t === 'root' && boxes && (opener.cube || before.length === j)) { S.tokens = before.slice(0, j - 1); return true; }   // ∛ goes whole
          if (opener && (opener.t === 'frac' || opener.t === 'root') && before.length > j) {   // the top (or the root's small number) stays (Desmos)
            const kept = S.tokens, next = joinDigits(before.slice(0, j - 1).concat(before.slice(j)), j - 1);
            if (next && tryTokens(next)) return true;
            S.tokens = kept;
          }
        }
        return pop();
      }
      case 'clear': {
        const had = S.tokens.length > 0 || S.mode !== 'edit';
        fresh();
        return had;
      }
      case 'clearEntry': {
        if (done || failed) { fresh(); return true; }
        const t = last();
        return t && (t.t === 'num' || t.t === 'ans' || t.t === 'prev') ? pop() : false;
      }
      case 'equals': {
        if (sheet || failed) return false;
        if (done) {
          if (!o.repeatEquals) return false;
          const tail = repeatTail(S.tokens);
          if (!tail || tail.length >= LIMITS.tokens) return false;
          S.tokens = [ans(S.result, false, remShown())].concat(tail);
          S.closed = 0;
          return solveFn(S);
        }
        if (!S.tokens.length) return false;
        finish();
        const hole = findHole(parse(S.tokens, o.percent, null), null);
        if (hole) { S.notice = info('incomplete', incompleteMessage(hole)); return false; }
        const add = closers(S.tokens) || [];
        S.tokens = S.tokens.concat(add);
        S.closed = add.length;
        return solveFn(S);
      }
    }
    return false;
  }
  function incompleteMessage(h) {
    const p = h && h.parent;
    if (!p) return 'Put in a number first.';
    switch (p.k) {
      case 'bin': return p.op === '^' ? 'Put a number in the power.' : `Put a number after ${SYM[p.op] || '×'}.`;
      case 'sqrt': return 'Put a number under √.';
      case 'root': return h.side === 'b' ? 'Put a number for the root.' : 'Put a number under the root.';
      case 'frac': return h.side === 'a' ? 'Put a number on top of the fraction.' : 'Put a number on the bottom of the fraction.';
      case 'neg': return `Put a number after ${MINUS}.`;
      case 'group': return 'Put a number inside the parentheses.';
      case 'of': return 'Put a number after % of.';
    }
    return MESSAGES.incomplete.message;
  }
  // Repeated =: the last + or − at the top level (outside parentheses and boxes) with everything after it; if there's
  // none, the last % of, then × or ÷; if none, the last power. 5 + 2 = 7, = 9, = 11 · 2 + 3 × 4 = 14, = 26 · 3² = 9, = 81.
  function repeatTail(tokens) {
    let depth = 0, best = -1, bestRank = 9, lastPow = -1;
    tokens.forEach((t, i) => {
      if (BOX_OPENER[t.t]) { if (depth === 0 && t.t === 'pow') lastPow = i; depth++; }
      else if (t.t === 'close' || t.t === 'end') depth--;
      else if (depth === 0 && (t.t === 'op' || t.t === 'of') && RANK[t.t === 'of' ? 'of' : t.v] <= bestRank) { bestRank = RANK[t.t === 'of' ? 'of' : t.v]; best = i; }
    });
    if (best < 0) best = lastPow;
    if (best < 0) return null;
    let d = 0, end = tokens.length;   // a power: just its box
    if (tokens[best].t === 'pow') for (let i = best; i < tokens.length; i++) { if (BOX_OPENER[tokens[i].t]) d++; else if (tokens[i].t === 'close' || tokens[i].t === 'end') { d--; if (d === 0) { end = i + 1; break; } } }
    return tokens.slice(best, end);
  }
  // An answer put into the problem: after = (or on an empty problem) it starts one; elsewhere it goes in like a number
  // would, and next to a number, ), π, a box or % it multiplies (2ans, as Desmos).
  function useValue(S, tok) {
    if (S.mode !== 'edit' || !S.tokens.length) {
      S.tokens = [tok]; S.mode = 'edit'; S.result = null; S.error = null; S.closed = 0; S.notice = null; S.frac = false;
      return true;
    }
    const t = S.tokens[S.tokens.length - 1];
    const f = finished(t);
    if (f) S.tokens = S.tokens.slice(0, -1).concat([f]);
    if (S.tokens.length >= LIMITS.tokens) { S.notice = info('long'); return false; }
    if (!canFollow(t, tok)) return false;
    S.tokens = S.tokens.concat([tok]);
    return true;
  }

  // ---- Saving: tokens as plain JSON ---------------------------------------------------------------------------------
  // Numbers { n: '12.5' } or { n: '12.5', neg: true } · answers { ans: '7/2' } (exact) or { ans: 1.4142135623730951 },
  // with rem: true when shown with a remainder (its box shows 17/5; releases before 2026.11.23-4 skip it) ·
  // everything else a string: '+' '-' '*' '/' '(' ')' 'neg' '%' '%of' 'pi' 'ans' (sheet: the line above), and the
  // boxes '^' 'sqrt' 'root' 'frac' 'sep' 'end'.
  const TOKEN_OUT = { open: '(', close: ')', neg: 'neg', pct: '%', of: '%of', pi: 'pi', prev: 'ans', pow: '^', sqrt: 'sqrt', root: 'root', frac: 'frac', sep: 'sep', end: 'end' };
  const TOKEN_IN = { '(': { t: 'open' }, ')': { t: 'close' }, neg: { t: 'neg' }, '%': { t: 'pct' }, '%of': { t: 'of' }, pi: { t: 'pi' },
    ans: { t: 'prev' }, '^': { t: 'pow' }, sqrt: { t: 'sqrt' }, root: { t: 'root' }, frac: { t: 'frac' }, sep: { t: 'sep' }, end: { t: 'end' },
    '+': { t: 'op', v: '+' }, '-': { t: 'op', v: '-' }, '*': { t: 'op', v: '*' }, '/': { t: 'op', v: '/' } };
  const valueOut = v => v.e ? (v.d === 1n ? v.n.toString() : v.n + '/' + v.d) : v.x;
  function tokenOut(t) {
    if (t.t === 'num') return t.neg ? { n: t.s, neg: true } : { n: t.s };
    if (t.t === 'ans') return t.rem ? { ans: valueOut(t.v), rem: true } : { ans: valueOut(t.v) };
    if (t.t === 'op') return t.v;
    return TOKEN_OUT[t.t];
  }
  const NUM_RE = /^(0|[1-9][0-9]*)(\.[0-9]*)?$/;
  const VALUE_RE = /^-?(0|[1-9][0-9]{0,1299})(\/[1-9][0-9]{0,1299})?$/;
  // A saved value: exact "n" or "n/d" (in range, a sensible size), or a finite number.
  function valueIn(x) {
    let v;
    if (typeof x === 'number') { if (!Number.isFinite(x)) return null; v = { e: false, x: x || 0 }; }
    else if (typeof x === 'string' && VALUE_RE.test(x)) {
      const [n, d = '1'] = x.split('/');
      v = Q(BigInt(n), BigInt(d));
      if (bitLen(v.n) > LIMITS.bits || bitLen(v.d) > LIMITS.bits) return null;
    } else return null;
    try { inRange(v); } catch (e) { return null; }
    return v;
  }
  function tokenIn(x, allowPrev) {
    if (typeof x === 'string') {
      if (!own(TOKEN_IN, x) || (x === 'ans' && !allowPrev)) return null;
      return Object.assign({}, TOKEN_IN[x]);
    }
    if (!isObj(x)) return null;
    if (own(x, 'n')) {
      if (typeof x.n !== 'string' || !NUM_RE.test(x.n) || digitCount(x.n) > LIMITS.digits) return null;
      if (own(x, 'neg') && x.neg !== true && x.neg !== false) return null;
      return { t: 'num', s: x.n, neg: x.neg === true };
    }
    if (own(x, 'ans')) {
      if (own(x, 'rem') && x.rem !== true && x.rem !== false) return null;
      const v = valueIn(x.ans);
      return !v ? null : x.rem === true ? { t: 'ans', v, rem: true } : { t: 'ans', v };
    }
    return null;
  }
  // A whole saved problem: every token known, in an order the keys could have made, within the limits.
  function tokensIn(arr, complete, allowPrev) {
    if (!Array.isArray(arr) || arr.length > LIMITS.tokens) return null;
    const out = [];
    for (const x of arr) {
      const t = tokenIn(x, allowPrev);
      if (!t || !canFollow(out[out.length - 1], t)) return null;
      out.push(t);
    }
    const boxes = openBoxes(out);
    if (!boxes || deepest(out) > LIMITS.depth) return null;
    if (complete && (boxes.length || !out.length || findHole(parse(out, 'of', null), null))) return null;
    return out;
  }

  // ---- One display (create) ----------------------------------------------------------------------------------------
  function create(initialOptions) {
    let o = readOptions(initialOptions);
    let S = blank();
    const cache = new WeakMap();   // a problem's worked-out steps (keyed by its token list), drawn with the current options
    let drawKey = '', Bs = backends(displayOpts(o));
    // ⇄'s other form, while the toggle is on: with it off (Test practice), the answer is in the form answerAs asks for.
    // remShown: the answer on screen is shown with its remainder (or would be, before ⇄).
    const remShown = () => S.mode === 'done' && shownWithRem(o, S.rem);
    const other = () => S.frac && o.toggle ? otherForm(o.answerAs, remShown()) : null;
    const fopts = () => displayOpts(o, other());
    const toggleable = () => S.mode === 'done' && (!!fractionForm(S.result) || remShown());

    // = : works the problem out and keeps the answer (and adds it to the history).
    function solveState(Tt) {
      const r = solve(Tt.tokens, o.percent, o, displayOpts(o), null, null);
      Tt.pct = o.percent;
      Tt.frac = false;
      if (r.error) { Tt.mode = 'error'; Tt.error = info(r.error); Tt.result = null; Tt.rem = null; return true; }
      Tt.mode = 'done'; Tt.result = r.value; Tt.rem = r.rem; Tt.error = null;
      if (!trivial(parse(Tt.tokens, o.percent, null)) && o.historySize > 0) {
        Tt.history = [{ tokens: Tt.tokens, value: r.value, pct: o.percent, rem: r.rem }].concat(Tt.history).slice(0, o.historySize);
      }
      return true;
    }
    function press(key) {
      const k = keyName(key);
      if (!k || !allowed(o, k)) return false;
      if (k === 'toggle') return toggleFraction();
      return pressOn(S, k, o, solveState, false);
    }
    function canPress(key) {
      const k = keyName(key);
      if (!k || !allowed(o, k)) return false;
      if (k === 'toggle') return o.toggle && toggleable();
      if (k === 'equals') {
        if (S.mode === 'error' || (!S.tokens.length && S.mode === 'edit')) return false;
        if (S.mode === 'done') return o.repeatEquals && !!repeatTail(S.tokens);
        return !findHole(parse(S.tokens, o.percent, null), null);
      }
      const Tt = Object.assign({}, S);
      return pressOn(Tt, k, o, () => true, false);
    }
    function toggleFraction() {
      if (!o.toggle || !toggleable()) return false;
      S.frac = !S.frac;
      return true;
    }

    // The worked-out problem (steps and answer) for the current tokens, drawn with the current options; kept until
    // the problem or the options change.
    function worked(tokens, pct) {
      const key = drawKey + pct;
      let c = cache.get(tokens);
      if (!c || c.key !== key) {
        c = { key, r: solve(tokens, pct, o, fopts(), Bs, null) };
        cache.set(tokens, c);
      }
      return c.r;
    }
    function refreshDraw() {
      const k = JSON.stringify(fopts());
      if (k !== drawKey) { drawKey = k; Bs = backends(fopts()); }
    }
    function equationOf(tokens, pct, value, cursor, rem) {
      const f = fopts(), R = { f, mark: null, more: true, cursor };
      const tree = parse(cursor ? tokens.concat([{ t: 'cursor' }]) : tokens, pct, null);
      const expr = rendered(Bs, B => draw(tree, B, 'start', R));
      if (!value) return { expression: expr, equation: expr };
      R.cursor = false;
      const p = answerPiece(value, f, rem);
      return { expression: expr, equation: rendered(Bs, B => draw(tree, B, 'start', R) + drawAnswer(Bs, B, p, f)) };
    }

    function state() {
      refreshDraw();
      const f = fopts(), tokens = S.tokens;
      const last = tokens[tokens.length - 1];
      const boxes = S.mode === 'edit' ? openBoxes(tokens) || [] : [];
      const out = {
        mode: S.mode, display: '0', displayHtml: Bs.H.number(fixed(false, '0', '', false)), displayKind: 'empty',
        expression: null, equation: null, answer: null, preview: null,
        pendingOp: last && last.t === 'op' ? last.v : last && last.t === 'pow' ? '^' : last && last.t === 'of' ? '%' : null,
        openParens: boxes.filter(b => b === 'paren').length, box: boxes[boxes.length - 1] || null,
        boxKey: S.mode === 'edit' ? boxKeyOf(tokens) : null,
        error: S.error, notice: S.notice, steps: [], history: [], can: {}, options: Object.assign({}, o)
      };
      const showValue = (v, kind, rem) => {
        const p = answerPiece(v, f, rem);
        out.display = Bs.T.number(p); out.displayHtml = Bs.H.number(p); out.displayKind = kind;
      };
      if (S.mode === 'edit') {
        const tree = parse(tokens, o.percent, null);
        Object.assign(out, equationOf(tokens, o.percent, null, true));
        if (last && last.t === 'num') {
          const p = typedPiece(last);
          out.display = Bs.T.number(p); out.displayHtml = Bs.H.number(p); out.displayKind = 'entry';
        } else if (last) {
          const n = shownNode(tree);
          if (n) {
            // (An ans box, alone or made negative, shows as the box shows it: 17/5 after 3 R 2.)
            let b = n;
            while ((b.k === 'neg' || b.k === 'group') && b.a) b = b.a;
            const fb = b.k === 'val' ? boxOpts(f, b) : f;
            try { const p = formatValue(evaluate(n, o), fb); out.display = Bs.T.number(p); out.displayHtml = Bs.H.number(p); out.displayKind = 'running'; } catch (e) {
              if (!(e instanceof CalcError)) throw e;
              out.display = info(e.code).short; out.displayHtml = esc(out.display); out.displayKind = 'warning';
            }
          } else out.displayKind = 'running';
        }
        if (tokens.length && !findHole(tree, null) && !trivial(tree)) {
          try {
            const v = inRange(evaluate(tree, o));
            // (With remainders, the answer as = will show it: worked out step by step, its boxes closed, for the last step.)
            const add = o.answerAs === 'remainder' && closers(tokens), rem = add ? solve(tokens.concat(add), o.percent, o, displayOpts(o), null, null).rem : null;
            out.preview = Object.assign(answerOf(Bs, displayOpts(o), v, false, o.toggle, rem), { error: null });
          }
          catch (e) { if (!(e instanceof CalcError)) throw e; out.preview = { text: '', html: '', mathml: '', speech: '', error: info(e.code) }; }
        }
      } else {
        const r = worked(S.tokens, S.pct);
        out.steps = r.steps;
        if (S.mode === 'done') {
          out.answer = answerOf(Bs, displayOpts(o), S.result, other(), o.toggle, S.rem);
          Object.assign(out, equationOf(tokens, S.pct, S.result, false, S.rem));
          showValue(S.result, 'answer', S.rem);
        } else {
          Object.assign(out, equationOf(tokens, S.pct, null, false));
          out.display = S.error.short; out.displayHtml = esc(S.error.short); out.displayKind = 'error';
        }
      }
      out.history = S.history.map(h => {
        const eq = equationOf(h.tokens, h.pct, h.value, false, h.rem);
        return { equation: eq.equation, expression: eq.expression, answer: answerOf(Bs, displayOpts(o), h.value, false, o.toggle, h.rem) };
      });
      for (const k of ['backspace', 'clear', 'clearEntry', 'equals', 'point', 'close', 'open', 'negate', 'square', 'percent', 'sqrt', 'cbrt',
        'root', 'pi', 'power', 'add', 'subtract', 'multiply', 'divide', 'fraction', 'over', 'right', '0', 'ans', 'toggle']) out.can[k] = canPress(k);
      return out;
    }
    // While typing, the display shows the number being typed, or (iPhone-style) the value of the last finished part:
    // after "2 × 3 +" it shows 6, after "2 + 3 ×" it shows 3 (× hasn't got its number yet).
    function shownNode(node) {
      for (;;) {
        if (node.open) { node = node[node.open]; continue; }
        if (isLeaf(node)) return node;
        switch (node.k) {
          case 'hole': return null;
          case 'cur': node = node.a; continue;
          case 'pct': case 'sqrt': case 'root': case 'frac': return node;
          case 'group': if (node.closed) return node; node = node.a; continue;
          case 'neg': if (complete(node)) return node; node = node.a; continue;
          case 'bin': case 'of':
            if (node.op === '^') return node;   // a power whose box is closed: its value
            if (node.b.k === 'hole') return node.a;
            node = node.b; continue;
        }
        return null;
      }
    }

    function serialize() {
      const out = { v: 2, expr: S.tokens.map(tokenOut), mode: S.mode };
      if (S.mode !== 'edit') { out.pct = S.pct; out.closed = S.closed; }
      if (S.mode === 'done' && S.frac) out.frac = true;
      out.history = S.history.map(h => ({ expr: h.tokens.map(tokenOut), pct: h.pct }));
      return out;
    }
    // Saved content can come from an imported file: everything is checked, and answers are worked out again from the
    // saved problems rather than trusted. Answers true when all of it was good (anything bad is left out).
    function load(data) {
      try { return loadData(data); } catch (e) { S = blank(); return false; }   // (a getter that throws, say)
    }
    function loadData(data) {
      S = blank();
      if (data === null || data === undefined) return true;
      if (!isObj(data) || data.v !== 2) return false;
      let ok = true;
      const pctIn = x => ['of', 'simple', 'apple'].includes(x) ? x : null;
      const hist = Array.isArray(data.history) ? data.history.slice(0, LIMITS.history) : [];
      if (own(data, 'history') && (!Array.isArray(data.history) || data.history.length > LIMITS.history)) ok = false;
      for (const h of hist) {
        const tokens = isObj(h) ? tokensIn(h.expr, true, false) : null, pct = isObj(h) ? pctIn(h.pct) : null;
        let r = null;
        if (tokens && pct) { try { r = solve(tokens, pct, o, displayOpts(o), null, null); } catch (e) { r = null; } }
        if (!r || r.error || trivial(parse(tokens, pct, null))) { ok = false; continue; }
        S.history.push({ tokens, value: r.value, pct, rem: r.rem });
      }
      S.history = S.history.slice(0, o.historySize);
      const mode = ['edit', 'done', 'error'].includes(data.mode) ? data.mode : null;
      const tokens = tokensIn(data.expr, mode !== 'edit', false);
      if (!mode || !tokens) return false;
      if (mode === 'edit') { S.tokens = tokens; return ok; }
      const pct = pctIn(data.pct), closed = data.closed;
      if (!pct || !Number.isInteger(closed) || closed < 0 || closed > LIMITS.depth || closed > tokens.length ||
          !tokens.slice(tokens.length - closed).every(t => t.t === 'close' || t.t === 'end')) return false;
      const r = solve(tokens, pct, o, displayOpts(o), null, null);
      Object.assign(S, { tokens, closed, pct, mode: r.error ? 'error' : 'done', result: r.value, rem: r.rem, error: r.error ? info(r.error) : null });
      if (data.frac === true && toggleable()) S.frac = true;
      return ok && (r.error ? 'error' : 'done') === mode;
    }

    const keys = keyHandler(press, () => o);
    return {
      press,
      canPress,
      input: str => inputKeys(press, str),
      handleKey: keys,
      state,
      options: () => Object.assign({}, o),
      setOptions(partial) {
        const was = o.answerAs;
        o = readOptions(Object.assign({}, o, isObj(partial) ? partial : {}));
        S.history = S.history.slice(0, o.historySize);
        if (o.answerAs !== was) S.frac = false;   // the answer on screen shows in the new form at once, and ⇄ starts over
        return Object.assign({}, o);
      },
      toggleFraction,
      useAnswer(i) {
        const h = S.history[i === undefined ? 0 : i];
        return h ? useValue(S, Object.assign({ t: 'ans', v: h.value }, shownWithRem(o, h.rem) ? { rem: true } : null)) : false;
      },
      useExpression(i) {
        const h = S.history[i === undefined ? 0 : i];
        if (!h) return false;
        S.tokens = h.tokens.slice(); S.mode = 'edit'; S.result = null; S.error = null; S.notice = null; S.closed = 0; S.frac = false;
        return true;
      },
      removeHistory(i) {
        if (!Number.isInteger(i) || i < 0 || i >= S.history.length) return false;
        S.history = S.history.filter((_, j) => j !== i);
        return true;
      },
      clearHistory() { const had = S.history.length > 0; S.history = []; return had; },
      serialize,
      load
    };
  }
  // The fraction form of an answer, for the toggle: exact, not a whole number, a top and a bottom of up to 10 digits.
  // (Desmos shows the toggle when it finds a good fraction, and never for π or √2.)
  function fractionForm(v) {
    return v && v.e && v.d !== 1n ? fractionPiece(v.n < 0n, absB(v.n), v.d, false) : null;
  }
  // The toggle shows the other form: a fraction when answers start as decimals, a decimal when they start as fractions.
  // With remainders: a decimal for an answer shown with its remainder (remShown), otherwise a fraction.
  const otherForm = (as, remShown) => as === 'decimal' || (as === 'remainder' && !remShown) ? 'fraction' : 'decimal';
  // An answer, drawn, with everything a layout needs to show it and its toggle. as: the form to show ('decimal',
  // 'fraction', 'mixed'), or null for the form answers start in (f.answerAs). rem: its remainder (remainderOf), if any.
  // form: the form shown ('decimal', 'fraction', or 'remainder'); toggleTo: the one ⇄ shows next, or null.
  function answerOf(Bs, f, v, as, toggle, rem) {
    const p = answerPiece(v, Object.assign({}, f, { answerAs: as || f.answerAs }), rem);
    const fr = p.kind === 'frac' || p.kind === 'mixed';
    const r = rendered(Bs, B => B.number(p));
    const forms = {};
    for (const as of ['decimal', 'fraction', 'mixed']) {
      const q = formatValue(v, Object.assign({}, f, { answerAs: as }));
      forms[as] = (as === 'decimal' || q.kind === 'frac' || q.kind === 'mixed') ? { text: Bs.T.number(q), html: Bs.H.wrap(Bs.H.number(q), Bs.S.number(q)) } : null;
    }
    const rp = f.answerAs === 'remainder' ? remainderPiece(rem, f) : null;
    forms.remainder = rp ? { text: Bs.T.number(rp), html: Bs.H.wrap(Bs.H.number(rp), Bs.S.number(rp)) } : null;
    const form = p.kind === 'rem' ? 'remainder' : fr ? 'fraction' : 'decimal', canToggle = toggle !== false && (!!fractionForm(v) || !!rp);
    return Object.assign(r, { exact: v.e, rounded: Bs.pick(Bs.T, p).rounded, value: valueOut(v), forms, canToggle, asFraction: !!fr, form,
      toggleTo: !canToggle ? null : form !== 'decimal' ? 'decimal' : rp ? 'remainder' : 'fraction' });
  }

  // ---- Lines (createSheet) -----------------------------------------------------------------------------------------
  // Desmos's model: a list of lines, each with its answer shown live as it is typed. ans is the answer of the line
  // above, and it follows when an earlier line is changed. = (Enter) starts a new line below; ⌫ on an empty line
  // removes it; ↑ ↓ move between lines; a line is tapped to change it (focus); undo and redo as in Desmos.
  function createSheet(initialOptions) {
    let o = readOptions(initialOptions);
    let L = [{ tokens: [], frac: false }], focus = 0, notice = null;
    let undos = [], redos = [];
    let Bs = backends(displayOpts(o)), drawKey = '';
    const snap = () => ({ L: L.map(l => ({ tokens: l.tokens, frac: l.frac })), focus });
    const restore = s => { L = s.L.map(l => ({ tokens: l.tokens, frac: l.frac })); focus = s.focus; };
    // Runs fn; when it changed something, the state before can be undone.
    function change(fn) {
      const before = snap();
      if (!fn()) return false;
      undos.push(before);
      if (undos.length > LIMITS.undo) undos.shift();
      redos = [];
      return true;
    }
    const lineState = i => ({ tokens: L[i].tokens, mode: 'edit', result: null, error: null, notice: null, closed: 0, pct: o.percent, frac: false, history: [] });
    function pressLine(k) {
      const S = lineState(focus);
      const changed = pressOn(S, k, o, null, true);
      notice = S.notice;
      if (changed) L[focus] = { tokens: S.tokens, frac: L[focus].frac };
      return changed;
    }
    function press(key) {
      const k = keyName(key);
      if (!k || !allowed(o, k)) return false;
      notice = null;
      switch (k) {
        case 'equals': return change(() => {
          if (!L[focus].tokens.length) return false;
          if (L.length >= LIMITS.lines) { notice = info('lines'); return false; }
          L.splice(focus + 1, 0, { tokens: [], frac: false });
          focus++;
          return true;
        });
        case 'up': if (change(() => pressLine('up'))) return true; return focusLine(focus - 1);
        case 'down': if (change(() => pressLine('down'))) return true; return focusLine(focus + 1);
        case 'clear': return clearAll();
        case 'clearEntry': return change(() => { if (!L[focus].tokens.length) return false; L[focus] = { tokens: [], frac: false }; return true; });
        case 'backspace': return L[focus].tokens.length ? change(() => pressLine('backspace')) : removeLine(focus);
        case 'undo': return undo();
        case 'redo': return redo();
        case 'toggle': return toggleFraction(focus);
      }
      return change(() => pressLine(k));
    }
    function canPress(key) {
      const k = keyName(key);
      if (!k || !allowed(o, k)) return false;
      switch (k) {
        case 'equals': return L[focus].tokens.length > 0 && L.length < LIMITS.lines;
        case 'clear': return L.length > 1 || L[0].tokens.length > 0;
        case 'clearEntry': return L[focus].tokens.length > 0;
        case 'backspace': return L[focus].tokens.length > 0 || L.length > 1;
        case 'undo': return undos.length > 0;
        case 'redo': return redos.length > 0;
        case 'toggle': return !!lineValue(focus).canToggle;
        case 'up': if (pressOn(lineState(focus), 'up', o, null, true)) return true; return focus > 0;
        case 'down': if (pressOn(lineState(focus), 'down', o, null, true)) return true; return focus < L.length - 1;
      }
      return pressOn(lineState(focus), k, o, null, true);
    }
    function focusLine(i) {
      if (!Number.isInteger(i) || i < 0 || i >= L.length || i === focus) return false;
      focus = i; notice = null;
      return true;
    }
    function removeLine(i) {
      if (!Number.isInteger(i) || i < 0 || i >= L.length) return false;
      return change(() => {
        if (L.length === 1) { if (!L[0].tokens.length) return false; L[0] = { tokens: [], frac: false }; return true; }
        L.splice(i, 1);
        if (focus > i || focus >= L.length) focus = Math.max(0, focus - 1);
        return true;
      });
    }
    function clearAll() {
      return change(() => {
        if (L.length === 1 && !L[0].tokens.length) return false;
        L = [{ tokens: [], frac: false }]; focus = 0;
        return true;
      });
    }
    function toggleFraction(i) {
      if (!Number.isInteger(i) || i < 0 || i >= L.length || !lineValue(i).canToggle) return false;
      return change(() => { L[i] = { tokens: L[i].tokens, frac: !L[i].frac }; return true; });
    }
    function undo() { if (!undos.length) return false; redos.push(snap()); restore(undos.pop()); notice = null; return true; }
    function redo() { if (!redos.length) return false; undos.push(snap()); restore(redos.pop()); notice = null; return true; }

    // Each line worked out in order (each one's ans is the answer above it).
    function values() {
      let prev = null;
      return L.map(line => {
        const tree = parse(line.tokens, o.percent, prev);
        let r;
        if (!line.tokens.length) r = { kind: 'empty', value: null };
        else {
          const hole = findHole(tree, null);
          if (hole) r = { kind: 'unfinished', value: null, notice: info('incomplete', incompleteMessage(hole)) };
          else {
            try { r = { kind: trivial(tree) ? 'number' : 'answer', value: inRange(evaluate(tree, o)) }; }
            catch (e) { if (!(e instanceof CalcError)) throw e; r = { kind: 'error', value: null, error: info(e.code) }; }
          }
        }
        r.prev = prev;
        r.canToggle = !!(o.toggle && r.value && fractionForm(r.value));
        prev = r.value;
        return r;
      });
    }
    const lineValue = i => values()[i];
    function refreshDraw() {
      const k = JSON.stringify(displayOpts(o));
      if (k !== drawKey) { drawKey = k; Bs = backends(displayOpts(o)); }
    }
    function state() {
      refreshDraw();
      const vs = values();
      const lines = L.map((line, i) => {
        const v = vs[i], cursor = i === focus;
        // the toggle shows the other form; a line that is just a number shows its fraction (as Desmos)
        const as = line.frac && v.canToggle ? (v.kind === 'answer' ? otherForm(o.answerAs) : 'fraction') : null;
        const f = displayOpts(o, as);
        const B4 = Bs;
        const tree = parse(cursor ? line.tokens.concat([{ t: 'cursor' }]) : line.tokens, o.percent, v.prev);
        const R = { f, mark: null, more: true, cursor };
        const expression = rendered(B4, B => draw(tree, B, 'start', R));
        // as Desmos: no answer for just a number, unless it is toggled to its fraction
        const result = v.value && (v.kind === 'answer' || as) ? answerOf(B4, displayOpts(o), v.value, as, o.toggle) : null;
        const asFraction = !!(result && result.asFraction);
        R.cursor = false;
        const p = result ? formatValue(v.value, f) : null;
        const equation = p ? rendered(B4, B => draw(tree, B, 'start', R) + drawAnswer(B4, B, p, f)) : rendered(B4, B => draw(tree, B, 'start', R));
        const boxes = openBoxes(line.tokens) || [];
        return { kind: v.kind, expression, equation, result, error: v.error || null, notice: v.notice || null, canToggle: v.canToggle,
          asFraction, box: boxes[boxes.length - 1] || null, boxKey: boxKeyOf(line.tokens) };
      });
      const can = {};
      for (const k of ['backspace', 'clear', 'clearEntry', 'equals', 'point', 'close', 'open', 'percent', 'sqrt', 'cbrt', 'root', 'pi', 'power',
        'square', 'add', 'subtract', 'multiply', 'divide', 'fraction', 'over', 'right', 'up', 'down', '0', 'ans', 'negate', 'toggle', 'undo', 'redo']) can[k] = canPress(k);
      return { lines, focus, notice, can, options: Object.assign({}, o) };
    }
    // The steps of line i (its boxes closed), for the side view: as create()'s steps.
    function steps(i) {
      if (!Number.isInteger(i) || i < 0 || i >= L.length) return [];
      const v = values()[i];
      if (!v.value && v.kind !== 'error') return [];
      const add = closers(L[i].tokens);
      if (!add) return [];
      refreshDraw();
      const f = displayOpts(o, L[i].frac && v.canToggle ? (v.kind === 'answer' ? otherForm(o.answerAs) : 'fraction') : null);
      return solve(L[i].tokens.concat(add), o.percent, o, f, backends(f), v.prev).steps;
    }
    function serialize() {
      return { v: 2, sheet: true, focus, lines: L.map(l => (l.frac ? { expr: l.tokens.map(tokenOut), frac: true } : { expr: l.tokens.map(tokenOut) })) };
    }
    function load(data) {
      try { return loadData(data); } catch (e) { L = [{ tokens: [], frac: false }]; focus = 0; return false; }
    }
    function loadData(data) {
      L = [{ tokens: [], frac: false }]; focus = 0; undos = []; redos = []; notice = null;
      if (data === null || data === undefined) return true;
      if (!isObj(data) || data.v !== 2 || data.sheet !== true || !Array.isArray(data.lines)) return false;
      let ok = data.lines.length <= LIMITS.lines && data.lines.length > 0;
      const out = [];
      for (const x of data.lines.slice(0, LIMITS.lines)) {
        const tokens = isObj(x) ? tokensIn(x.expr, false, true) : null;
        if (!tokens || (own(x, 'frac') && typeof x.frac !== 'boolean')) { ok = false; continue; }
        out.push({ tokens, frac: x.frac === true });
      }
      if (out.length) L = out;
      if (Number.isInteger(data.focus) && data.focus >= 0 && data.focus < L.length) focus = data.focus;
      else if (own(data, 'focus')) ok = false;
      return ok;
    }

    const keys = keyHandler(press, () => o);
    return {
      press, canPress,
      input: str => inputKeys(press, str),
      handleKey: keys,
      state, steps,
      focus: focusLine, removeLine, clearAll, toggleFraction, undo, redo,
      options: () => Object.assign({}, o),
      setOptions(partial) { o = readOptions(Object.assign({}, o, isObj(partial) ? partial : {})); return Object.assign({}, o); },
      serialize, load
    };
  }

  // Presses keys from a string, for demos and tests: each key's name or symbol, longest first ("12+3×4=",
  // "sqrt9→+16", "1 a/b 2 → 3", "AC", "ans"). Spaces are ignored. Answers how many keys did something; throws on a
  // character that isn't a key.
  function inputKeys(press, str) {
    let n = 0;
    for (const word of String(str).split(/\s+/).filter(Boolean)) {
      for (let i = 0; i < word.length;) {
        let len = Math.min(8, word.length - i);
        while (len > 0 && !keyName(word.substr(i, len))) len--;
        if (!len) throw new Error('Not a calculator key: ' + word[i]);
        if (press(word.substr(i, len))) n++;
        i += len;
      }
    }
    return n;
  }

  // ---- Keyboard ----------------------------------------------------------------------------------------------------
  // As Desmos: digits, + - * / ^ % ( ) . , Enter or =, Backspace, the arrow keys, and words typed as letters: sqrt,
  // cbrt, nthroot, pi, ans, frac. Ctrl+Z / Ctrl+Shift+Z (⌘ on a Mac) undo and redo, Ctrl+Shift+L clears all,
  // Alt+Shift+A (⌘+Shift+A) shows the answer as a fraction or a decimal. Also x for ×, @ for √ (Windows Calculator),
  // F9 for ±, Escape and Delete for AC. Other keys with Ctrl or ⌘ are left to the browser; a held-down = or
  // Escape counts once. / is ÷, or a fraction with the option slash: 'fraction'.
  function keyFromEvent(e, options) {
    if (!e || typeof e.key !== 'string' || e.isComposing) return null;
    const k = e.key;
    if (e.metaKey || (e.ctrlKey && !e.altKey)) {
      const l = k.toLowerCase();
      if (l === 'z') return e.shiftKey ? 'redo' : 'undo';
      if (l === 'y' && e.ctrlKey) return 'redo';
      if (l === 'l' && e.shiftKey) return 'clear';
      if ((l === 'a' || e.code === 'KeyA') && e.shiftKey && e.metaKey) return 'toggle';
      return null;
    }
    if (e.altKey && e.shiftKey && (k === 'a' || k === 'A' || e.code === 'KeyA')) return 'toggle';
    if (/^[0-9]$/.test(k)) return k;
    const slash = options && options.slash === 'fraction' ? 'over' : 'divide';
    // Where a comma groups the digits (1,500), a typed one is left out, so 1,500 is 1500 as drawn. Elsewhere it is the point.
    const comma = options && (options.separators === 'comma' || options.separators === 'faint') ? null : 'point';
    const map = {
      '.': 'point', ',': comma, Decimal: 'point', '+': 'add', '-': 'subtract', [MINUS]: 'subtract', Subtract: 'subtract',
      '*': 'multiply', x: 'multiply', X: 'multiply', '×': 'multiply', Multiply: 'multiply', '/': slash, '÷': 'divide', Divide: slash,
      '^': 'power', '%': 'percent', '(': 'open', ')': 'close', Enter: 'equals', '=': 'equals', Backspace: 'backspace',
      Escape: 'clear', Delete: 'clear', Clear: 'clear', '√': 'sqrt', '@': 'sqrt', 'π': 'pi', '²': 'square', '±': 'negate', F9: 'negate',
      ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'
    };
    const name = own(map, k) ? map[k] : null;
    if (name && e.repeat && (name === 'equals' || name === 'clear')) return null;
    return name;
  }
  const WORDS = { sqrt: 'sqrt', cbrt: 'cbrt', nthroot: 'root', pi: 'pi', ans: 'ans', frac: 'fraction' };
  // A keydown handler: presses the key an event means, and the words typed as letters. Answers true when the event was
  // the calculator's (then call event.preventDefault(), so / doesn't open the browser's find bar).
  function keyHandler(press, opts) {
    let word = '';
    return function handleKey(e) {
      const k = keyFromEvent(e, opts());
      if (k) { word = ''; press(k); return true; }
      if (!e || typeof e.key !== 'string' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || !/^[a-zA-Z]$/.test(e.key)) { word = ''; return false; }
      const w = (word + e.key.toLowerCase()).slice(-7);
      for (const [name, key] of Object.entries(WORDS)) if (w.endsWith(name)) { word = ''; press(key); return true; }
      for (let n = w.length; n > 0; n--) {   // keep the letters while they can still become a word
        const tail = w.slice(-n);
        if (Object.keys(WORDS).some(x => x.startsWith(tail))) { word = tail; return true; }
      }
      word = '';
      return false;
    };
  }

  // ---- Stylesheet --------------------------------------------------------------------------------------------------
  // For the stylized equation (class names ce-*). Colors come from the board's theme variables, with fallbacks.
  const CSS = `
.ce-math { white-space: nowrap; font-variant-numeric: lining-nums; line-height: 1.25; }
.ce-sup { font-size: .62em; vertical-align: super; line-height: 0; }
.ce-sup .ce-sup { font-size: .8em; }
.ce-sqrt, .ce-root { white-space: nowrap; }
.ce-sqrt { display: inline-flex; position: relative; padding-left: .62em; }
.ce-radic { position: absolute; inset: 0; }
.ce-surd { position: absolute; opacity: 0; }
.ce-surd-mark { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.ce-surd-mark svg { overflow: visible; }
.ce-surd-mark path, .ce-surd-mark line { fill: none; stroke: currentColor; stroke-width: .07em; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; vector-effect: non-scaling-stroke; }
.ce-radicand { padding: .15em .08em 0 .08em; }
.ce-index { font-size: .55em; vertical-align: .95em; margin-right: -.45em; line-height: 0; }
.ce-frac { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-size: .8em; margin: 0 .12em; line-height: 1.15; }
.ce-numer { border-bottom: .09em solid currentColor; padding: 0 .18em .06em; }
.ce-denom { padding: .06em .18em 0; }
.ce-rep { text-decoration: overline; text-decoration-thickness: .07em; }
.ce-ghost { opacity: .35; }
.ce-sep { color: var(--b21-muted, #6b7280); opacity: .6; }
.ce-r { color: var(--b21-muted, #6b7280); }
.ce-hole { display: inline-block; min-width: .55em; height: .8em; margin: 0 .06em; vertical-align: -.06em; border: .07em dashed currentColor; border-radius: .12em; opacity: .45; }
.ce-cursor { display: inline-block; width: 0; height: 1.05em; margin: 0 .03em; vertical-align: -.15em; border-left: .08em solid var(--b21-accent, #2563eb); animation: ce-blink 1.1s steps(1) infinite; }
.ce-hole .ce-cursor { height: .7em; vertical-align: top; }
@keyframes ce-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ce-cursor { animation: none; } }
.ce-ansref { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; line-height: 1; padding: .1em .22em .04em; margin: 0 .08em; border: .06em solid var(--b21-accent, #2563eb); border-radius: .22em; color: var(--b21-accent, #2563eb); }
.ce-anslabel { font-size: .45em; margin-top: .1em; }
.ce-mark { color: var(--b21-accent, #2563eb); background: var(--b21-accent-soft, #eff6ff); border-radius: .25em; box-shadow: 0 0 0 .12em var(--b21-accent-soft, #eff6ff); }
.ce-ans { font-weight: 700; }
.ce-word { font-style: italic; }
math .ce-mark { color: var(--b21-accent, #2563eb); background: var(--b21-accent-soft, #eff6ff); }
math .ce-ghost { opacity: .35; }
math .ce-rep { text-decoration: overline; text-decoration-thickness: .07em; }
`;

  // One problem from start to finish, for quick checks: CalcEngine.calc('2+3×4') → the state after pressing it and =.
  function calc(str, options) {
    const c = create(options);
    c.input(str);
    if (c.state().mode === 'edit') c.press('equals');
    return c.state();
  }

  return Object.freeze({
    version: VERSION, create, createSheet, calc, keyFromEvent, readOptions, DEFAULTS, LIMITS, DIGITS, KEYS, RULES, CSS,
    MESSAGES: JSON.parse(JSON.stringify(MESSAGES))
  });
}));
