// Tests for the Calculator's math engine, widgets/calculator/calc-engine.js. Run: node tests/calc-engine.js
// (plain asserts, no dependencies; prints passed / failed counts).
'use strict';
const assert = require('assert');
const ENGINE = require('path').join(__dirname, '..', 'widgets', 'calculator', 'calc-engine.js');
const C = require(ENGINE);

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(name + '\n      ' + String(e && e.message || e).split('\n').join('\n      ')); }
}
const calc = (s, o) => C.calc(s, o);
const fresh = o => C.create(o);
const typed = (s, o) => { const c = fresh(o); c.input(s); return c; };
const sheet = (s, o) => { const c = C.createSheet(o); if (s) c.input(s); return c; };
const SP = ' ';   // Desmos's digit groups: a narrow space (1 024)
const g = s => s.replace(/_/g, SP);   // g('1_024') → '1 024'

// ---- 1. Answers: [keys, display, equation as plain text] (= is pressed at the end) ----------------------------------
const ANSWERS = [
  // order of operations
  ['2+3×4', '14', '2 + 3 × 4 = 14'],
  ['2×3+4', '10', '2 × 3 + 4 = 10'],
  ['8÷4÷2', '1', '8 ÷ 4 ÷ 2 = 1'],
  ['10−4−3', '3', '10 − 4 − 3 = 3'],
  ['2+3×4−6÷2', '11', '2 + 3 × 4 − 6 ÷ 2 = 11'],
  ['(2+3)×4', '20', '(2 + 3) × 4 = 20'],
  ['2^3^2', '512', '2^3² = 512'],
  ['(2^3)^2', '64', '(2³)² = 64'],
  ['2^3×4', '32', '2³ × 4 = 32'],
  ['2×3^2', '18', '2 × 3² = 18'],
  ['100÷10×10', '100', '100 ÷ 10 × 10 = 100'],
  ['6÷2(1+2)', '9', '6 ÷ 2(1 + 2) = 9'],
  ['((2))', '2', '((2)) = 2'],
  ['(((1+2)))×3', '9', '(((1 + 2))) × 3 = 9'],
  // minus signs and ±
  ['−3²', '−9', '−3² = −9'],
  ['3±²', '9', '(−3)² = 9'],
  ['(−3)²', '9', '(−3)² = 9'],
  ['−2^2', '−4', '−2² = −4'],
  ['2^−1', '0.5', '2^(−1) = 0.5'],
  ['2^−3^2', '0.001953125', '2^(−3²) = 0.001953125'],
  ['5−3±', '8', '5 − (−3) = 8'],
  ['4×3±', '−12', '4 × (−3) = −12'],
  ['−5+3', '−2', '−5 + 3 = −2'],
  ['−(2+3)', '−5', '−(2 + 3) = −5'],
  ['−(3±)', '3', '−(−3) = 3'],
  ['1.5±×2', '−3', '−1.5 × 2 = −3'],
  ['5×−3', '−15', '5 × (−3) = −15'],
  ['5−−3', '8', '5 − (−3) = 8'],
  ['−−3', '3', '−(−3) = 3'],
  // implicit multiplication
  ['2π', '6.283185307', '2π = 6.283185307'],
  ['π×2', '6.283185307', 'π × 2 = 6.283185307'],
  ['2(3+4)', '14', '2(3 + 4) = 14'],
  ['(1+2)(3+4)', '21', '(1 + 2)(3 + 4) = 21'],
  ['3√16', '12', '3√16 = 12'],
  ['(1+2)3', '9', '(1 + 2) × 3 = 9'],
  ['2²3', '12', '2² × 3 = 12'],
  ['π(2)', '6.283185307', 'π(2) = 6.283185307'],
  ['2^3→4', '32', '2³ × 4 = 32'],
  ['1÷2π', '1.570796327', '1 ÷ 2π = 1.570796327'],
  // exact arithmetic
  ['0.1+0.2', '0.3', '0.1 + 0.2 = 0.3'],
  ['1÷3×3', '1', '1 ÷ 3 × 3 = 1'],
  ['0.1×3', '0.3', '0.1 × 3 = 0.3'],
  ['1−0.9', '0.1', '1 − 0.9 = 0.1'],
  ['2÷3+1÷3', '1', '2 ÷ 3 + 1 ÷ 3 = 1'],
  ['1.1×1.1', '1.21', '1.1 × 1.1 = 1.21'],
  ['1÷8', '0.125', '1 ÷ 8 = 0.125'],
  ['7÷2', '3.5', '7 ÷ 2 = 3.5'],
  ['0.5²', '0.25', '0.5² = 0.25'],
  ['3^−2', '0.1111111111', '3^(−2) = 0.1111111111'],
  ['(1÷3)^2×9', '1', '(1 ÷ 3)² × 9 = 1'],
  // roots: √ is a box, as in Desmos, and → leaves it
  ['√16', '4', '√16 = 4'],
  ['√(1÷4)', '0.5', '√(1 ÷ 4) = 0.5'],
  ['√0.25', '0.5', '√0.25 = 0.5'],
  ['√(9÷16)', '0.75', '√(9 ÷ 16) = 0.75'],
  ['√2', '1.414213562', '√2 = 1.414213562'],
  ['√2→×√2', '2', '√2 × √2 = 2'],
  ['√4²', '4', '√4² = 4'],
  ['√9+16', '5', '√(9 + 16) = 5'],
  ['√9→+16', '19', '√9 + 16 = 19'],
  ['√(9+16)', '5', '√(9 + 16) = 5'],
  ['√0', '0', '√0 = 0'],
  ['√√16', '2', '√√16 = 2'],
  ['2√9', '6', '2√9 = 6'],
  ['∛27', '3', '³√27 = 3'],
  ['∛−8', '−2', '³√(−8) = −2'],
  ['ⁿ√4→16', '2', '⁴√16 = 2'],
  ['ⁿ√5→32', '2', '⁵√32 = 2'],
  // powers: the power is a box; + − × leave it, ÷ stays in (as Desmos)
  ['2^10', g('1_024'), g('2¹⁰ = 1_024')],
  ['2^3+1', '9', '2³ + 1 = 9'],
  ['2^3÷4', '1.681792831', '2^(3 ÷ 4) = 1.681792831'],
  ['2^(1+2)+1', '9', '2^(1 + 2) + 1 = 9'],
  ['2^3^2+1', g('1_024'), g('2^(3² + 1) = 1_024')],
  ['3²÷4', '2.25', '3² ÷ 4 = 2.25'],
  ['10^15', '1 × 10¹⁵', '10¹⁵ = 1 × 10¹⁵'],
  ['4^0.5', '2', '4^0.5 = 2'],
  ['8^(1÷3)', '2', '8^(1 ÷ 3) = 2'],
  ['8^(2÷3)', '4', '8^(2 ÷ 3) = 4'],
  ['(−8)^(1÷3)', '−2', '(−8)^(1 ÷ 3) = −2'],
  ['2^0.5', '1.414213562', '2^0.5 = 1.414213562'],
  ['5^0', '1', '5⁰ = 1'],
  ['0^0', '1', '0⁰ = 1'],
  ['0^5', '0', '0⁵ = 0'],
  ['1^1000', '1', g('1¹⁰⁰⁰ = 1')],
  ['(−1)^1001', '−1', '(−1)¹⁰⁰¹ = −1'],
  ['π^0', '1', 'π⁰ = 1'],
  ['2^50', '1.12589991 × 10¹⁵', '2⁵⁰ = 1.12589991 × 10¹⁵'],
  ['10^99', '1 × 10⁹⁹', '10⁹⁹ = 1 × 10⁹⁹'],
  ['10^100', '1 × 10¹⁰⁰', '10¹⁰⁰ = 1 × 10¹⁰⁰'],
  ['10^308', '1 × 10³⁰⁸', '10³⁰⁸ = 1 × 10³⁰⁸'],
  ['10^−99', '1 × 10⁻⁹⁹', '10^(−99) = 1 × 10⁻⁹⁹'],
  ['1.5²', '2.25', '1.5² = 2.25'],
  // fractions: a/b is an empty fraction (top first), ⁄ is a typed / (what came before becomes the top)
  ['1⁄2', '0.5', '1/2 = 0.5'],
  ['1+5⁄8', '1.625', '1 + 5/8 = 1.625'],
  ['1⁄2→+1⁄3', '0.8333333333', '1/2 + 1/3 = 0.8333333333'],
  ['6⁄2(1+2)', '1', '6/(2(1 + 2)) = 1'],
  ['1⁄2+3', '0.2', '1/(2 + 3) = 0.2'],
  ['2×3⁄4', '1.5', '2 × 3/4 = 1.5'],
  ['6÷3⁄4', '8', '6 ÷ (3/4) = 8'],
  ['−3⁄4', '−0.75', '−3/4 = −0.75'],
  ['(1+2)⁄3', '1', '(1 + 2)/3 = 1'],
  ['2π⁄3', '2.094395102', '(2π)/3 = 2.094395102'],
  ['1⁄2⁄3', '1.5', '1/(2/3) = 1.5'],
  ['1⁄2→⁄3', '0.1666666667', '(1/2)/3 = 0.1666666667'],
  ['a/b3↓4', '0.75', '3/4 = 0.75'],
  ['1a/b2↓3', '1.666666667', '1 2/3 = 1.666666667'],
  ['2a/b1↓2→×2', '5', '2 1/2 × 2 = 5'],
  ['−1a/b1↓2', '−1.5', '−1 1/2 = −1.5'],
  ['1.5a/b1↓2', '0.75', '1.5 × 1/2 = 0.75'],
  // percent: % types "% of", as in Desmos
  ['10%50', '5', '10% of 50 = 5'],
  ['25%80', '20', '25% of 80 = 20'],
  ['10%50+5', '10', '10% of 50 + 5 = 10'],
  ['2×10%50', '10', '2 × 10% of 50 = 10'],
  ['100÷10%50', '5', '100 ÷ 10% of 50 = 5'],
  ['10%(50+10)', '6', '10% of (50 + 10) = 6'],
  ['10%−50', '−5', '10% of (−50) = −5'],
  ['50%50%40', '10', '50% of 50% of 40 = 10'],
  ['10%50^2', '250', '10% of 50² = 250'],
  // π and rounding: 10 significant digits, as Desmos
  ['π', '3.141592654', 'π = 3.141592654'],
  ['1÷7', '0.1428571429', '1 ÷ 7 = 0.1428571429'],
  ['2÷3', '0.6666666667', '2 ÷ 3 = 0.6666666667'],
  ['22÷7', '3.142857143', '22 ÷ 7 = 3.142857143'],
  ['1÷70000', '1.42857143 × 10⁻⁵', g('1 ÷ 70_000 = 1.42857143 × 10⁻⁵')],
  ['π−π', '0', 'π − π = 0'],
  ['0×π', '0', '0 × π = 0'],
  // big and small numbers: written out from 0.001 up to 10^9, otherwise × 10ⁿ with 9 digits
  ['123456789×1', g('123_456_789'), g('123_456_789 × 1 = 123_456_789')],
  ['10^9', g('1_000_000_000'), g('10⁹ = 1_000_000_000')],
  ['1000000001×1', '1 × 10⁹', g('1_000_000_001 × 1 = 1 × 10⁹')],
  ['2^30', '1.07374182 × 10⁹', '2³⁰ = 1.07374182 × 10⁹'],
  ['123456789×1000', '1.23456789 × 10¹¹', g('123_456_789 × 1_000 = 1.23456789 × 10¹¹')],
  ['999999999999999+1', '1 × 10¹⁵', g('999_999_999_999_999 + 1 = 1 × 10¹⁵')],
  ['999999999999999×999999999999999', '1 × 10³⁰', g('999_999_999_999_999 × 999_999_999_999_999 = 1 × 10³⁰')],
  ['0.001×1', '0.001', '0.001 × 1 = 0.001'],
  ['1÷999', '0.001001001001', '1 ÷ 999 = 0.001001001001'],
  ['0.0001×1', '1 × 10⁻⁴', '0.0001 × 1 = 1 × 10⁻⁴'],
  ['1÷1024', '9.765625 × 10⁻⁴', g('1 ÷ 1_024 = 9.765625 × 10⁻⁴')],
  ['0.000000001×1', '1 × 10⁻⁹', '0.000000001 × 1 = 1 × 10⁻⁹'],
  // unbalanced parentheses and open boxes are closed by =
  ['(2+3', '5', '(2 + 3) = 5'],
  ['((2+3)×(4', '20', '((2 + 3) × (4)) = 20'],
  ['2(3+4', '14', '2(3 + 4) = 14'],
  ['√(16', '4', '√(16) = 4'],
  ['2^(1+1', '4', '2^(1 + 1) = 4']
];
for (const [keys, display, text] of ANSWERS) {
  test(`answer: ${keys}`, () => {
    const st = calc(keys);
    assert.strictEqual(st.mode, 'done', 'mode (error: ' + (st.error && st.error.code) + (st.notice ? ', notice: ' + st.notice.message : '') + ')');
    assert.strictEqual(st.display, display, 'display');
    assert.strictEqual(st.equation.text, text, 'equation');
  });
}

// ---- 2. Friendly errors (Desmos shows "undefined") -------------------------------------------------------------------
const ERRORS = [
  ['5÷0', 'divzero'], ['0÷0', 'divzero'], ['5÷(2−2)', 'divzero'], ['1÷(π−π)', 'divzero'], ['0^−1', 'divzero'], ['1⁄0', 'divzero'],
  ['√−4', 'sqrtneg'], ['√(3±)', 'sqrtneg'], ['√(1−2)', 'sqrtneg'], ['(−4)^0.5', 'sqrtneg'],
  ['(−4)^0.25', 'negroot'], ['(−2)^π', 'negroot'], ['ⁿ√4→−16', 'negroot'],
  ['10^309', 'toobig'], ['9^9^9', 'toobig'], ['10^308×10', 'toobig'], ['2^1000000', 'toobig'], ['π^1000', 'toobig'],
  ['10^−400', 'toosmall'], ['0.5^100000', 'toosmall'], ['1÷3^700', 'toosmall'], ['π^−1000', 'toosmall']
];
for (const [keys, code] of ERRORS) {
  test(`error: ${keys} → ${code}`, () => {
    const st = calc(keys);
    assert.strictEqual(st.mode, 'error');
    assert.strictEqual(st.error.code, code);
    assert.strictEqual(st.display, C.MESSAGES[code].short);
    assert.ok(!/NaN|Infinity|undefined|Error/.test(st.display + st.error.message), 'friendly words');
    assert.strictEqual(st.answer, null);
  });
}
test('errors never show NaN, Infinity or undefined anywhere in the state', () => {
  for (const [keys] of ERRORS) assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(calc(keys))), keys);
});
test('0^0 is 1, as in Desmos; it can be set to a message', () => {
  assert.strictEqual(calc('0^0').display, '1');
  const st = calc('0^0', { zeroPowerZero: 'error' });
  assert.strictEqual(st.error.code, 'zeropow');
  assert.strictEqual(calc('(1−1)^(2−2)', { zeroPowerZero: 'error' }).error.code, 'zeropow');
});
test('every message is plain words, short and kind', () => {
  for (const [code, m] of Object.entries(C.MESSAGES)) {
    assert.ok(m.short.length <= 24, code + ' short is short');
    assert.ok(/^[A-Z0-9√]/.test(m.message) && m.message.endsWith('.'), code + ' is a sentence');
    assert.ok(m.message.length <= 70, code + ' is one short sentence');
    assert.ok(!/:|—|undefined|error/i.test(m.message + m.short), code + ' no colons, dashes or "error"');
  }
});
test('an error keeps the problem, and an error is not added to the history', () => {
  const c = typed('5÷0=');
  assert.strictEqual(c.state().expression.text, '5 ÷ 0');
  assert.strictEqual(c.state().history.length, 0);
});
test('a digit after an error starts again', () => {
  const c = typed('5÷0=7');
  assert.strictEqual(c.state().mode, 'edit');
  assert.strictEqual(c.state().expression.text, '7');
});
test('an operator after an error starts from 0', () => assert.strictEqual(typed('5÷0=+2=').state().display, '2'));
test('⌫ after an error goes back to the problem to fix it', () => {
  const c = typed('5÷0=⌫');
  assert.strictEqual(c.state().mode, 'edit');
  assert.strictEqual(c.state().expression.text, '5 ÷ 0');
  c.input('⌫2=');
  assert.strictEqual(c.state().display, '2.5');
});
test('= after an error does nothing', () => assert.strictEqual(typed('5÷0=').press('='), false));

// ---- 3. Unfinished problems at = -----------------------------------------------------------------------------------
const UNFINISHED = [
  ['5+', 'Put a number after +.'], ['5×', 'Put a number after ×.'], ['2^', 'Put a number in the power.'],
  ['√', 'Put a number under √.'], ['−', 'Put a number after −.'], ['(', 'Put a number inside the parentheses.'],
  ['2×(3+', 'Put a number after +.'], ['2^−', 'Put a number after −.'], ['a/b', 'Put a number on top of the fraction.'],
  ['3⁄', 'Put a number on the bottom of the fraction.'], ['a/b3', 'Put a number on the bottom of the fraction.'],
  ['ⁿ√', 'Put a number for the root.'], ['∛', 'Put a number under the root.'], ['5%', 'Put a number after % of.']
];
for (const [keys, msg] of UNFINISHED) {
  test(`unfinished: ${keys}`, () => {
    const c = typed(keys);
    assert.strictEqual(c.press('='), false);
    const st = c.state();
    assert.strictEqual(st.mode, 'edit', 'still editing');
    assert.strictEqual(st.notice.code, 'incomplete');
    assert.strictEqual(st.notice.message, msg);
    c.press('1');
    assert.strictEqual(c.state().notice, null, 'the notice goes at the next key');
  });
}
test('= on an empty problem does nothing', () => { const c = fresh(); assert.strictEqual(c.press('='), false); assert.strictEqual(c.state().notice, null); });

// ---- 4. Entry: iPhone where Tyler asked, Desmos everywhere else ------------------------------------------------------
test('a digit after = starts fresh', () => {
  const c = typed('2+3=7');
  assert.strictEqual(c.state().expression.text, '7');
  assert.strictEqual(c.state().display, '7');
});
test('a point after = starts 0.', () => assert.strictEqual(typed('2+3=.').state().display, '0.'));
test('an operator after = continues from the answer', () => {
  const st = typed('2+3=×4=').state();
  assert.strictEqual(st.display, '20');
  assert.strictEqual(st.equation.text, '5 × 4 = 20');
});
test('minus after = is subtraction from the answer', () => assert.strictEqual(typed('2+3=−1=').state().equation.text, '5 − 1 = 4'));
test('a² after = squares the answer', () => {
  const c = typed('2+3=²');
  assert.strictEqual(c.state().display, '25');
  c.press('=');
  assert.strictEqual(c.state().equation.text, '5² = 25');
});
test('√ after = takes the root of the answer', () => assert.strictEqual(typed('4×4=√=').state().equation.text, '√16 = 4'));
test('√ after =, then a digit, is a fresh root', () => assert.strictEqual(typed('4×4=√9=').state().equation.text, '√9 = 3'));
test('% after = is a percent of the answer', () => assert.strictEqual(typed('25×2=%10=').state().equation.text, '50% of 10 = 5'));
test('± after = changes the sign of the answer', () => {
  const c = typed('2+3=±');
  assert.strictEqual(c.state().display, '−5');
  c.input('+1=');
  assert.strictEqual(c.state().equation.text, '−5 + 1 = −4');
});
test('( and π after = start fresh', () => {
  assert.strictEqual(typed('2+3=(1').state().expression.text, '(1');
  assert.strictEqual(typed('2+3=π').state().expression.text, 'π');
});
test('× or ÷ replaces the operator waiting (iPhone)', () => {
  const c = typed('5+×');
  assert.strictEqual(c.state().pendingOp, '*');
  assert.strictEqual(c.state().expression.text, '5 ×');
  c.input('3=');
  assert.strictEqual(c.state().display, '15');
});
test('− after an operator is a minus sign (Desmos: 5 × −3 = −15)', () => {
  assert.strictEqual(typed('5×−3=').state().equation.text, '5 × (−3) = −15');
  assert.strictEqual(typed('5÷−2=').state().display, '−2.5');
});
test('+ after an operator changes nothing (Desmos reads it as a plus sign: 5 × +3 = 15)', () => {
  const c = typed('5×');
  assert.strictEqual(c.press('+'), false);
  c.input('3=');
  assert.strictEqual(c.state().display, '15');
});
test('the same operator twice changes nothing', () => { const c = typed('5×'); assert.strictEqual(c.press('×'), false); });
test('aᵇ replaces an operator waiting, and an operator replaces an empty power', () => {
  assert.strictEqual(typed('2+^3=').state().equation.text, '2³ = 8');
  assert.strictEqual(typed('2^×3=').state().equation.text, '2 × 3 = 6');
  assert.strictEqual(typed('2^−3=').state().display, '0.125');
});
test('an operator first works on the 0 shown (iPhone)', () => assert.strictEqual(typed('×5=').state().equation.text, '0 × 5 = 0'));
test('+ first works on 0', () => assert.strictEqual(typed('+5=').state().equation.text, '0 + 5 = 5'));
test('− first is a minus sign', () => assert.strictEqual(typed('−5=').state().equation.text, '−5 = −5'));
test('an operator after a minus sign in front takes its place', () => {
  assert.strictEqual(typed('−×').state().expression.text, '0 ×');
  assert.strictEqual(typed('(−+').state().expression.text, '(');
  assert.strictEqual(typed('2^−×').state().expression.text, '2 ×');
});
test('− twice in front is two minus signs: −−3 = 3 (Desmos)', () => assert.strictEqual(calc('−−3').display, '3'));
test('operators right after ( or √ are ignored (except −)', () => {
  const c = typed('(');
  assert.strictEqual(c.press('×'), false);
  assert.strictEqual(c.press('−'), true);
  assert.strictEqual(typed('√').press('+'), false);
});
test('a² and % need a number before them', () => {
  assert.strictEqual(fresh().press('x²'), false);
  assert.strictEqual(typed('5+').press('%'), false);
  assert.strictEqual(typed('(').press('²'), false);
});
test(') needs a number before it; with no ( open it wraps what came before (Desmos)', () => {
  assert.strictEqual(typed('(5+').press(')'), false);
  assert.strictEqual(typed('(').press(')'), false);
  assert.strictEqual(typed('').press(')'), false);
  assert.strictEqual(typed('5+').press(')'), false);
  assert.strictEqual(typed('(5').press(')'), true);
  const c = typed('5');
  assert.strictEqual(c.press(')'), true);
  assert.strictEqual(c.state().expression.text, '(5)');
});
test('leading zeros: 0 then 5 is 5, 0 0 is 0', () => {
  assert.strictEqual(typed('05').state().display, '5');
  const c = typed('0');
  assert.strictEqual(c.press('0'), false);
  assert.strictEqual(c.state().display, '0');
});
test('the point first shows 0.', () => assert.strictEqual(typed('.5').state().display, '0.5'));
test('a second point is ignored', () => { const c = typed('1.5'); assert.strictEqual(c.press('.'), false); assert.strictEqual(c.state().display, '1.5'); });
test('a number keeps its typed form while typing (trailing zeros, the point)', () => {
  assert.strictEqual(typed('1.50').state().display, '1.50');
  assert.strictEqual(typed('12.').state().display, '12.');
  assert.strictEqual(typed('1.50+1').state().expression.text, '1.50 + 1');
});
test('a dangling point is dropped when the number is finished', () => assert.strictEqual(typed('5.+1=').state().equation.text, '5 + 1 = 6'));
test('± on a number being typed, and again', () => {
  const c = typed('12±');
  assert.strictEqual(c.state().display, '−12');
  c.press('±');
  assert.strictEqual(c.state().display, '12');
});
test('± with nothing typed starts −0, and digits go after it', () => {
  const c = typed('5+±');
  assert.strictEqual(c.state().display, '−0');
  c.input('3=');
  assert.strictEqual(c.state().equation.text, '5 + (−3) = 2');
});
test('± after ) does nothing', () => assert.strictEqual(typed('(2)').press('±'), false));
test('15 digits at most in a number, with a notice', () => {
  const c = typed('1234567890123456');
  assert.strictEqual(c.state().display, g('123_456_789_012_345'));
  assert.strictEqual(c.state().notice.code, 'digits');
  assert.strictEqual(typed('0.12345678901234567').state().display, '0.123456789012345', 'the 0 in front of 0. does not count');
});
test('the problem has at most 100 keys', () => {
  const c = fresh();
  c.input('1' + '+1'.repeat(60));
  const st = c.state();
  assert.ok(st.notice && st.notice.code === 'long');
  assert.strictEqual(c.serialize().expr.length, 100);
  c.press('=');
  assert.strictEqual(c.state().display, '50');
});
test('parentheses and boxes at most 10 inside each other', () => {
  const c = typed('(((((((((((');
  assert.strictEqual(c.state().openParens, 10);
  assert.strictEqual(c.state().notice.code, 'deep');
  const d = typed('√√√√√(((((√');
  assert.strictEqual(d.state().notice.code, 'deep');
});
test('very long numbers multiply exactly', () => {
  const c = typed('123456789012345×1=');
  assert.strictEqual(c.state().display, '1.23456789 × 10¹⁴');
  assert.strictEqual(c.state().answer.value, '123456789012345');
});

// ---- 5. Boxes: powers, roots and fractions, as in Desmos --------------------------------------------------------------
test('+ − × leave a power box that has something in it; ÷ stays in', () => {
  assert.strictEqual(calc('2^3−1').equation.text, '2³ − 1 = 7');
  assert.strictEqual(calc('2^3×4').equation.text, '2³ × 4 = 32');
  assert.strictEqual(calc('2^3÷4').equation.text, '2^(3 ÷ 4) = 1.681792831');
  assert.strictEqual(calc('2^3(4)').equation.text, g('2^(3(4)) = 4_096'));
  assert.strictEqual(calc('2^3π').display, '687.2913351');
});
test('− right after aᵇ is a negative power, and the box keeps going', () => assert.strictEqual(calc('2^−3+1').equation.text, '2^(−3) + 1 = 1.125'));
test('+ leaves only the innermost power box', () => assert.strictEqual(calc('2^3^2+1').display, g('1_024')));
test('a² is a whole power: what comes next is outside it', () => {
  assert.strictEqual(calc('3²÷4').display, '2.25');
  assert.strictEqual(calc('3²4').equation.text, '3² × 4 = 36');
});
test('aᵇ right after a power goes back into it (Desmos joins them)', () => {
  const c = typed('2^3→^');
  assert.strictEqual(c.state().box, 'pow');
  c.input('1=');
  assert.strictEqual(c.state().equation.text, '2³¹ = 2.14748365 × 10⁹');
});
test('√ holds everything until →', () => {
  const c = typed('√9+16');
  assert.strictEqual(c.state().box, 'sqrt');
  assert.strictEqual(c.state().expression.text, '√(9 + 16)');
  c.input('→+1=');
  assert.strictEqual(c.state().equation.text, '√(9 + 16) + 1 = 6');
});
test('→ leaves the box the cursor is in, and does nothing outside one', () => {
  assert.strictEqual(typed('(2+3').press('→'), true, 'closes a parenthesis');
  assert.strictEqual(typed('2+3').press('→'), false);
  assert.strictEqual(typed('√').press('→'), false, 'not from an empty box');
  assert.strictEqual(typed('a/b2→').state().box, 'denom');
});
test(') leaves the boxes inside the parenthesis', () => assert.strictEqual(calc('(2^3+√4)×2').equation.text, '(2³ + √4) × 2 = 20'));
test('∛ and ⁿ√: the small number first, then →', () => {
  assert.strictEqual(typed('ⁿ√').state().box, 'index');
  assert.strictEqual(typed('ⁿ√3→').state().box, 'radicand');
  assert.strictEqual(typed('∛').state().box, 'radicand');
  assert.strictEqual(calc('ⁿ√3→8+1').display, '2.080083823');
});
test('a/b is an empty fraction, top first; ↓ or → goes to the bottom', () => {
  const c = typed('a/b');
  assert.strictEqual(c.state().box, 'numer');
  c.input('3↓');
  assert.strictEqual(c.state().box, 'denom');
  c.input('4→+1=');
  assert.strictEqual(c.state().equation.text, '3/4 + 1 = 1.75');
});
test('↑ goes back to the top of a fraction while the bottom is empty', () => {
  const c = typed('a/b3↓');
  assert.strictEqual(c.press('↑'), true);
  assert.strictEqual(c.state().box, 'numer');
  assert.strictEqual(typed('a/b3↓4').press('↑'), false);
});
test('a typed / takes the number before it as the top (Desmos)', () => {
  assert.strictEqual(typed('12⁄').state().expression.text, '12/');
  assert.strictEqual(typed('2+3⁄').state().expression.text, '2 + 3/');
  assert.strictEqual(typed('(1+2)⁄').state().expression.text, '(1 + 2)/');
  assert.strictEqual(typed('2^3→⁄4').state().expression.text, '2³/4');
  assert.strictEqual(typed('+⁄').state().box, 'numer', 'nothing before it: an empty fraction');
});
test('everything typed in the bottom stays there until →', () => assert.strictEqual(calc('1⁄2+3').display, '0.2'));
test('a whole number then a fraction is a mixed number; a decimal or ( ) before it multiplies', () => {
  assert.strictEqual(calc('1a/b2↓3').display, '1.666666667');
  assert.strictEqual(calc('(1)a/b2↓3').display, '0.6666666667');
  assert.strictEqual(calc('1.5a/b1↓2').display, '0.75');
  assert.strictEqual(calc('1a/b2↓3+1').display, '0.5', 'what is typed in the bottom stays there: 1 × 2/(3 + 1)');
});
test('⌫ on an empty bottom takes the fraction away and keeps its top (Desmos)', () => {
  const c = typed('3⁄');
  c.press('⌫');
  assert.strictEqual(c.state().expression.text, '3');
  assert.strictEqual(c.state().box, null);
  const d = typed('1a/b2↓');
  d.press('⌫');
  assert.strictEqual(d.state().expression.text, '12', 'the whole number and the top join, as Desmos');
  assert.strictEqual(d.state().box, null);
});
test('⌫ on an empty root takes the whole root away', () => {
  const c = typed('2+∛');
  c.press('⌫');
  assert.strictEqual(c.state().expression.text, '2 +');
});
test('⌫ after leaving a box goes back into it', () => {
  const c = typed('2^3→');
  c.press('⌫');
  assert.strictEqual(c.state().box, 'pow');
  c.press('⌫'); c.press('⌫');
  assert.strictEqual(c.state().expression.text, '2');
});
test('= closes every open box and parenthesis; ⌫ after = opens them again', () => {
  const c = typed('2×(3+√(4');
  c.press('=');
  assert.strictEqual(c.state().equation.text, '2 × (3 + √(4)) = 10');
  c.press('⌫');
  assert.strictEqual(c.state().openParens, 2);
  assert.strictEqual(c.state().box, 'paren');
});
test('the cursor is drawn where the next key goes', () => {
  assert.ok(typed('2^3').state().expression.html.includes('<sup class="ce-sup"><span class="ce-num">3</span><span class="ce-cursor"></span></sup>'));
  assert.ok(typed('2^3→').state().expression.html.endsWith('</sup></span><span class="ce-cursor"></span></span>'));
  assert.ok(typed('a/b').state().expression.html.includes('<span class="ce-numer"><span class="ce-hole"><span class="ce-cursor"></span></span></span>'));
  assert.ok(!calc('2+3').equation.html.includes('ce-cursor'), 'not after =');
});

// ---- 6. The display while typing ------------------------------------------------------------------------------------
test('after an operator the display shows the part already worked out', () => {
  assert.strictEqual(typed('2×3+').state().display, '6');
  assert.strictEqual(typed('2+3×').state().display, '3');
  assert.strictEqual(typed('2+3+').state().display, '5');
  assert.strictEqual(typed('2^3×').state().display, '8');
  assert.strictEqual(typed('2+(3×4)').state().display, '12');
  assert.strictEqual(typed('2+3²').state().display, '9');
});
test('display shows 0 after ( or √', () => {
  assert.strictEqual(typed('2+(').state().display, '0');
  assert.strictEqual(typed('√').state().display, '0');
});
test('display warns early when the finished part has no answer', () => {
  const st = typed('5÷0+').state();
  assert.strictEqual(st.displayKind, 'warning');
  assert.strictEqual(st.display, 'Can’t divide by 0');
  assert.strictEqual(st.mode, 'edit');
});
test('display kinds', () => {
  assert.strictEqual(fresh().state().displayKind, 'empty');
  assert.strictEqual(typed('5').state().displayKind, 'entry');
  assert.strictEqual(typed('5+').state().displayKind, 'running');
  assert.strictEqual(typed('5+1=').state().displayKind, 'answer');
  assert.strictEqual(typed('5÷0=').state().displayKind, 'error');
});
test('pendingOp names the operator waiting for its number', () => {
  assert.strictEqual(typed('5÷').state().pendingOp, '/');
  assert.strictEqual(typed('5^').state().pendingOp, '^');
  assert.strictEqual(typed('5%').state().pendingOp, '%');
  assert.strictEqual(typed('5÷2').state().pendingOp, null);
});
test('openParens counts the ones not closed yet; box names the innermost box', () => {
  assert.strictEqual(typed('((1+(2)').state().openParens, 2);
  assert.strictEqual(typed('(√2^').state().box, 'pow');
  assert.strictEqual(typed('2').state().box, null);
});
test('preview: the answer so far when the problem is complete (Desmos shows it live)', () => {
  assert.strictEqual(typed('2+3×4').state().preview.text, '14');
  assert.strictEqual(typed('2+3×').state().preview, null);
  assert.strictEqual(typed('5').state().preview, null);
  assert.strictEqual(typed('(2+3').state().preview.text, '5');
  assert.strictEqual(typed('√9+16').state().preview.text, '5');
  assert.strictEqual(typed('5÷0').state().preview.error.code, 'divzero');
});
test('can: which keys would do something', () => {
  const st = fresh().state();
  assert.strictEqual(st.can.backspace, false);
  assert.strictEqual(st.can.clear, false);
  assert.strictEqual(st.can.equals, false);
  assert.strictEqual(st.can.close, false);
  assert.strictEqual(st.can.right, false);
  const st2 = typed('(5').state();
  assert.strictEqual(st2.can.backspace, true);
  assert.strictEqual(st2.can.close, true);
  assert.strictEqual(st2.can.right, true);
  assert.strictEqual(st2.can.equals, true);
  assert.strictEqual(st2.can.point, true);
  assert.strictEqual(typed('5.').state().can.point, false);
  assert.strictEqual(typed('5+').state().can.equals, false);
  assert.strictEqual(typed('5+2=').state().can.equals, true, 'repeat');
  assert.strictEqual(typed('5=').state().can.equals, false, 'nothing to repeat');
  assert.strictEqual(typed('1÷4=').state().can.toggle, true);
  assert.strictEqual(typed('2+2=').state().can.toggle, false);
});
test('canPress does not change anything', () => {
  const c = typed('2+3');
  const before = JSON.stringify(c.serialize());
  for (const k of Object.keys(C.KEYS)) c.canPress(k);
  assert.strictEqual(JSON.stringify(c.serialize()), before);
});

// ---- 7. Display formatting, as Desmos -------------------------------------------------------------------------------
test('digit groups: a narrow space, as Desmos (commas or none as options)', () => {
  assert.strictEqual(typed('1234567').state().display, g('1_234_567'));
  assert.strictEqual(calc('1000×1000', { separators: 'comma' }).display, '1,000,000');
  assert.strictEqual(calc('1000×1000', { separators: 'none' }).display, '1000000');
  assert.strictEqual(calc('1000×1000', { separators: false }).display, '1000000');
  assert.strictEqual(calc('1234.5678×1').display, g('1_234.5678'), 'only the whole part');
});
test('a real minus sign (U+2212)', () => assert.strictEqual(calc('2−5').display, '−3'));
test('no trailing zeros in answers', () => {
  assert.strictEqual(calc('1.50+1.50').display, '3');
  assert.strictEqual(calc('2.5×2').display, '5');
});
test('10 significant digits and no float noise', () => {
  assert.strictEqual(calc('1÷3').display, '0.3333333333');
  assert.strictEqual(calc('0.1×0.1').display, '0.01');
  assert.strictEqual(calc('√2→×√2').display, '2');
  assert.strictEqual(calc('1.1+2.2').display, '3.3');
  assert.strictEqual(calc('123456789.123×1').display, g('123_456_789.1'));
});
test('rounding is school rounding (5 rounds up)', () => {
  assert.strictEqual(calc('2÷3').display, '0.6666666667');
  assert.strictEqual(calc('5÷9').display, '0.5555555556');
});
test('written out from 0.001 up to 10^9, as Desmos', () => {
  assert.strictEqual(calc('999999999.5×1').display, g('999_999_999.5'));
  assert.strictEqual(calc('0.0010000001×1').display, '0.0010000001');
  assert.strictEqual(calc('0.000999×1').display, '9.99 × 10⁻⁴');
  assert.strictEqual(calc('1500000000×1').display, '1.5 × 10⁹');
});
test('scientific notation with 9 digits, as Desmos', () => {
  assert.strictEqual(calc('2^60').display, '1.1529215 × 10¹⁸');
  assert.strictEqual(calc('(2±)^61').display, '−2.30584301 × 10¹⁸');
  assert.strictEqual(calc('2^32').display, '4.2949673 × 10⁹');
  assert.strictEqual(calc('2^1000').display, '1.07150861 × 10³⁰¹');
});
test('scientific notation for tiny numbers', () => {
  assert.strictEqual(calc('1÷3^30').display, '4.85693575 × 10⁻¹⁵');
  assert.strictEqual(calc('1÷(2^40)').display, '9.09494702 × 10⁻¹³');
  assert.strictEqual(calc('1÷3000').display, '3.33333333 × 10⁻⁴');
});
test('digits: 7 is Desmos Four-Function (7 digits, written out below 10^7)', () => {
  const F = { digits: 7 };
  assert.strictEqual(calc('2÷3', F).display, '0.6666667');
  assert.strictEqual(calc('22÷7', F).display, '3.142857');
  assert.strictEqual(calc('9999999×1', F).display, g('9_999_999'));
  assert.strictEqual(calc('10000000×1', F).display, '1 × 10⁷');
  assert.strictEqual(calc('12345678×1', F).display, '1.23457 × 10⁷');
  assert.strictEqual(calc('1÷3000', F).display, '3.33333 × 10⁻⁴');
  assert.strictEqual(calc('1234.56789×1', F).display, g('1_234.568'));
});
test('the stylized equation writes 10 with a superscript power', () => {
  const st = calc('10^20');
  assert.ok(st.equation.html.includes('10<sup class="ce-sup">20</sup>'));
  assert.ok(calc('10^−20').equation.html.includes('10<sup class="ce-sup">−20</sup>'));
});
test('fraction answers: improper and mixed (answerAs)', () => {
  assert.strictEqual(calc('7÷2', { answerAs: 'fraction' }).display, '7/2');
  assert.strictEqual(calc('7÷2', { answerAs: 'mixed' }).display, '3 1/2');
  assert.strictEqual(calc('7÷2±', { answerAs: 'mixed' }).display, '−3 1/2');
  assert.strictEqual(calc('1÷2', { answerAs: 'mixed' }).display, '1/2');
  assert.strictEqual(calc('0.1+0.2', { answerAs: 'fraction' }).display, '3/10');
  assert.strictEqual(calc('6÷3', { answerAs: 'fraction' }).display, '2');
});
test('fraction mode leaves irrational answers as decimals', () => assert.strictEqual(calc('√2', { answerAs: 'fraction' }).display, '1.414213562'));
test('fractions of more than 10 digits stay decimals', () => {
  assert.strictEqual(calc('1÷1234567', { answerAs: 'fraction' }).display, g('1/1_234_567'));
  assert.strictEqual(calc('1÷3^25', { answerAs: 'fraction' }).display, '1.18023539 × 10⁻¹²');
  assert.strictEqual(calc('123456789.123×1').answer.canToggle, false, 'as Desmos');
});
test('fraction answers are drawn stacked', () => {
  const st = calc('1÷3', { answerAs: 'fraction' });
  assert.ok(st.equation.html.includes('<span class="ce-frac ce-value"><span class="ce-numer"><span class="ce-num">1</span></span><span class="ce-denom"><span class="ce-num">3</span></span></span>'));
  assert.strictEqual(st.equation.text, '1 ÷ 3 = 1/3');
  assert.ok(st.equation.mathml.includes('<mfrac><mn>1</mn><mn>3</mn></mfrac>'));
});
test('answer forms: decimal, fraction and mixed', () => {
  const a = calc('7÷2').answer;
  assert.strictEqual(a.forms.decimal.text, '3.5');
  assert.strictEqual(a.forms.fraction.text, '7/2');
  assert.strictEqual(a.forms.mixed.text, '3 1/2');
  assert.strictEqual(calc('√2').answer.forms.fraction, null);
  assert.strictEqual(calc('1÷3').answer.value, '1/3');
  assert.strictEqual(calc('1÷3').answer.exact, true);
  assert.strictEqual(calc('1÷3').answer.rounded, true);
  assert.strictEqual(calc('√2').answer.exact, false);
});
test('= even when the answer shown is rounded (Desmos); ≈ as an option', () => {
  assert.ok(calc('1÷3').equation.text.includes(' = '));
  assert.ok(calc('1÷3', { approxSign: true }).equation.text.includes(' ≈ '));
  assert.ok(calc('1÷4', { approxSign: true }).equation.text.includes(' = '));
});
test('repeating bar (option): 1 ÷ 6 = 0.16̅', () => {
  const st = calc('1÷6', { repeatingBar: true });
  assert.ok(st.equation.html.includes('0.1<span class="ce-rep">6</span>'));
  assert.ok(st.equation.html.includes('<span class="ce-eq"> = </span>'), 'exact, so =');
  assert.strictEqual(st.equation.text, '1 ÷ 6 = 0.1666666667', 'plain text keeps the rounded digits');
  assert.ok(st.equation.mathml.includes('<mn>0.1</mn><mn class="ce-rep">6</mn>'));
  assert.ok(C.CSS.includes('math .ce-rep'));
  assert.ok(calc('1÷7', { repeatingBar: true }).equation.html.includes('0.<span class="ce-rep">142857</span>'));
  assert.ok(calc('1÷17', { repeatingBar: true }).equation.html.includes('0.05882352941'), 'too long to show: rounded');
});

// ---- 8. The fraction ↔ decimal toggle (Desmos) ------------------------------------------------------------------------
test('toggle: an exact answer that isn\'t whole shows as a fraction, and back', () => {
  const c = typed('1+5⁄8=');
  assert.strictEqual(c.state().answer.canToggle, true);
  assert.strictEqual(c.press('⇄'), true);
  const st = c.state();
  assert.strictEqual(st.display, '13/8');
  assert.strictEqual(st.answer.asFraction, true);
  assert.strictEqual(st.equation.text, '1 + 5/8 = 13/8');
  c.toggleFraction();
  assert.strictEqual(c.state().display, '1.625');
});
test('toggle: never for whole numbers, π or √2 (as Desmos)', () => {
  assert.strictEqual(typed('4.35×100=').press('⇄'), false);
  assert.strictEqual(typed('π=').press('⇄'), false);
  assert.strictEqual(typed('√2=').press('⇄'), false);
});
test('toggle: negative answers keep their sign in front', () => assert.strictEqual(typed('5÷−2=⇄').state().display, '−5/2'));
test('toggle: a new problem starts as a decimal again', () => assert.strictEqual(typed('1÷4=⇄ 1÷8=').state().display, '0.125'));
test('toggle can be turned off (Desmos Four-Function and many state tests)', () => {
  const c = typed('1÷4=', { toggle: false });
  assert.strictEqual(c.press('⇄'), false);
  assert.strictEqual(c.state().answer.canToggle, false);
});

// ---- 9. Percent ------------------------------------------------------------------------------------------------------
test('% of: the % key types "% of" and needs a number after it (Desmos)', () => {
  assert.strictEqual(typed('50%').state().expression.text, '50% of');
  assert.strictEqual(calc('10%50').speech === undefined, true);
  assert.strictEqual(calc('10%50').equation.speech, '10 percent of 50 equals 5');
});
test('% of sits between + − and × ÷ (as Desmos)', () => {
  assert.strictEqual(calc('2×10%50').display, '10');
  assert.strictEqual(calc('100÷10%50').display, '5');
  assert.strictEqual(calc('10%50+5').display, '10');
});
test('% of: the steps say it in words', () => {
  const st = calc('10%50+5');
  assert.strictEqual(st.steps[0].work.text, '10% of 50 = 5');
  assert.strictEqual(st.steps[0].op, 'percent');
});
const SIMPLE = { percent: 'simple' }, APPLE = { percent: 'apple' };
const PERCENT_APPLE = [
  ['50+10%', '55'], ['50−10%', '45'], ['50×10%', '5'], ['50÷10%', '500'], ['10%', '0.1'], ['10%×50', '5'],
  ['2×50+10%', '110'], ['2+3×10%', '2.3'], ['50+10%×2', '60'], ['50+10%+10%', '60.5'], ['(50+10%)×2', '110'], ['200−25%', '150']
];
for (const [keys, display] of PERCENT_APPLE) test(`percent apple: ${keys}`, () => assert.strictEqual(calc(keys, APPLE).display, display));
test('percent simple: % is always ÷ 100', () => {
  assert.strictEqual(calc('50+10%', SIMPLE).display, '50.1');
  assert.strictEqual(calc('50−10%', SIMPLE).display, '49.9');
  assert.strictEqual(calc('2×50+10%', SIMPLE).display, '100.1');
  assert.strictEqual(calc('10%', SIMPLE).equation.text, '10% = 0.1');
  assert.strictEqual(calc('10%5', SIMPLE).equation.text, '10% × 5 = 0.5');
});
test('Apple percent shows "10% of 50" in the steps', () => {
  const st = calc('50+10%', APPLE);
  assert.strictEqual(st.steps[0].work.text, '10% of 50 = 5');
  assert.strictEqual(st.steps[1].text, '50 + 5');
});
test('the running display shows the percent as Apple does', () => assert.strictEqual(typed('50+10%', APPLE).state().display, '5'));
test('the percent mode in force at = stays with that problem', () => {
  const c = typed('50+10%=', APPLE);
  c.setOptions({ percent: 'simple' });
  assert.strictEqual(c.state().display, '55');
  assert.strictEqual(c.state().history[0].equation.text, '50 + 10% = 55');
});

// ---- 10. Repeated = (one display, iPhone) ----------------------------------------------------------------------------
test('5 + 2 = = gives 9', () => assert.strictEqual(typed('5+2==').state().display, '9'));
test('skip counting: 5 + 5 = = = =', () => {
  const c = typed('5+5=');
  const seen = [c.state().display];
  for (let i = 0; i < 3; i++) { c.press('='); seen.push(c.state().display); }
  assert.deepStrictEqual(seen, ['10', '15', '20', '25']);
});
test('doubling: 2 × 2 = = =', () => assert.strictEqual(typed('2×2===').state().display, '16'));
test('repeat takes the last + or − with everything after it', () => {
  const c = typed('2+3×4==');
  assert.strictEqual(c.state().equation.text, '14 + 3 × 4 = 26');
});
test('repeat with only × and ÷ takes the last one', () => assert.strictEqual(typed('100÷2÷5==').state().equation.text, '10 ÷ 5 = 2'));
test('repeat with a power', () => assert.strictEqual(typed('3^2==').state().equation.text, '9² = 81'));
test('repeat ignores operators inside parentheses and boxes', () => {
  assert.strictEqual(typed('(1+2)×2==').state().equation.text, '6 × 2 = 12');
  assert.strictEqual(typed('√(1+3)==').state().can.equals, false);
});
test('repeat with nothing to repeat does nothing', () => { const c = typed('(5)='); assert.strictEqual(c.press('='), false); });
test('each repeat goes into the history', () => {
  const st = typed('5+2===').state();
  assert.deepStrictEqual(st.history.map(h => h.equation.text), ['9 + 2 = 11', '7 + 2 = 9', '5 + 2 = 7']);
});
test('repeated = can be turned off', () => {
  const c = typed('5+2=', { repeatEquals: false });
  assert.strictEqual(c.press('='), false);
  assert.strictEqual(c.state().display, '7');
});

// ---- 11. History (one display) ---------------------------------------------------------------------------------------
test('history: newest first, with equation, answer and plain text', () => {
  const st = typed('2+3= AC 4×5=').state();
  assert.strictEqual(st.history.length, 2);
  assert.strictEqual(st.history[0].equation.text, '4 × 5 = 20');
  assert.strictEqual(st.history[0].answer.text, '20');
  assert.ok(st.history[1].equation.html.includes('ce-ans'));
});
test('history keeps 10 by default', () => {
  const c = fresh();
  for (let i = 1; i <= 12; i++) c.input(`${i}+1=`);
  const h = c.state().history;
  assert.strictEqual(h.length, 10);
  assert.strictEqual(h[0].equation.text, '12 + 1 = 13');
});
test('history size is an option (and 0 turns it off)', () => {
  const c = fresh({ historySize: 2 });
  c.input('1+1= 2+2= 3+3=');
  assert.strictEqual(c.state().history.length, 2);
  assert.strictEqual(fresh({ historySize: 0 }).state().history.length, 0);
  const d = fresh({ historySize: 0 }); d.input('1+1=');
  assert.strictEqual(d.state().history.length, 0);
});
test('just a number is not added to the history', () => {
  assert.strictEqual(typed('5=').state().history.length, 0);
  assert.strictEqual(typed('5±=').state().history.length, 0);
  assert.strictEqual(typed('1a/b2↓3=').state().history.length, 0, 'a mixed number is a number');
  assert.strictEqual(typed('1⁄2=').state().history.length, 1, 'a fraction is worked out (Desmos shows 0.5)');
});
test('reuse an answer from the history', () => {
  const c = typed('2+3= 10×4=');
  c.press('AC');
  assert.strictEqual(c.useAnswer(1), true);
  c.input('×2=');
  assert.strictEqual(c.state().equation.text, '5 × 2 = 10');
});
test('reuse an answer in the middle of a problem', () => {
  const c = typed('2+3= AC 1+');
  c.useAnswer(0);
  c.press('=');
  assert.strictEqual(c.state().equation.text, '1 + 5 = 6');
});
test('a reused answer next to a number multiplies, as Desmos (7ans, ans9)', () => {
  const c = typed('2+3= AC 1+7');
  c.useAnswer(0);
  assert.strictEqual(c.state().expression.text, '1 + 7 × 5');
  c.press('9');
  assert.strictEqual(c.state().expression.text, '1 + 7 × 5 × 9');
  c.press('=');
  assert.strictEqual(c.state().display, '316');
});
test('a reused answer after ) multiplies', () => {
  const c = typed('2+3= AC (2)');
  c.useAnswer(0); c.press('=');
  assert.strictEqual(c.state().equation.text, '(2) × 5 = 10');
});
test('a rounded answer reused keeps all its digits', () => {
  const c = typed('1÷3= AC');
  c.useAnswer(0);
  c.input('×3=');
  assert.strictEqual(c.state().display, '1');
  assert.strictEqual(c.state().equation.text, '0.3333333333… × 3 = 1');
});
test('a reused answer is drawn as Desmos draws ans: in a box marked "ans"', () => {
  const c = typed('2+3= ans×2');
  assert.ok(c.state().expression.html.includes('<span class="ce-ansref"><span class="ce-num">5</span><span class="ce-anslabel">ans</span></span>'));
});
test('reuse a whole problem from the history to change it', () => {
  const c = typed('2+3×4= AC');
  assert.strictEqual(c.useExpression(0), true);
  const st = c.state();
  assert.strictEqual(st.mode, 'edit');
  assert.strictEqual(st.expression.text, '2 + 3 × 4');
  c.input('⌫5=');
  assert.strictEqual(c.state().display, '17');
});
test('ans key: the answer on screen, else the latest in the history', () => {
  assert.strictEqual(typed('2+3=+ ans =').state().equation.text, '5 + 5 = 10');
  assert.strictEqual(typed('2+3= AC ans ×2=').state().equation.text, '5 × 2 = 10');
  assert.strictEqual(fresh().press('ans'), false);
});
test('history entries can be removed or cleared', () => {
  const c = typed('1+1= 2+2=');
  assert.strictEqual(c.removeHistory(0), true);
  assert.strictEqual(c.state().history[0].equation.text, '1 + 1 = 2');
  assert.strictEqual(c.removeHistory(5), false);
  assert.strictEqual(c.clearHistory(), true);
  assert.strictEqual(c.state().history.length, 0);
  assert.strictEqual(c.useAnswer(0), false);
});

// ---- 12. The stylized equation ----------------------------------------------------------------------------------------
const html = s => calc(s).equation.html;
test('HTML: × ÷ − with thin spaces', () => {
  const h = html('6÷2−1×3');
  assert.ok(h.includes('<span class="ce-op"> ÷ </span>'));
  assert.ok(h.includes('<span class="ce-op"> − </span>'));
  assert.ok(h.includes('<span class="ce-op"> × </span>'));
  assert.ok(!/[*/·]/.test(h.replace(/<\/?[a-z][^>]*>/g, '')), 'no *, / or ·');
});
test('HTML: superscript powers, nested for 2^3^2', () => {
  assert.ok(html('2^3^2').includes('<sup class="ce-sup"><span class="ce-pow"><span class="ce-num">3</span><sup class="ce-sup"><span class="ce-num">2</span></sup></span></sup>'));
  assert.ok(html('5²').includes('<sup class="ce-sup"><span class="ce-num">2</span></sup>'));
});
test('HTML: a radical with a bar over everything under it', () => {
  assert.ok(html('√9+16').includes('<span class="ce-sqrt"><span class="ce-radic">√</span><span class="ce-radicand"><span class="ce-num">9</span><span class="ce-op"> + </span><span class="ce-num">16</span></span></span>'));
  assert.ok(html('√4²').includes('<span class="ce-radicand"><span class="ce-pow"><span class="ce-num">4</span><sup class="ce-sup"><span class="ce-num">2</span></sup></span></span>'));
});
test('HTML: a root with its small number', () => assert.ok(html('∛8').includes('<span class="ce-root"><span class="ce-index"><span class="ce-num">3</span></span><span class="ce-sqrt">')));
test('HTML: a fraction is stacked', () => {
  assert.ok(html('3⁄4').includes('<span class="ce-frac"><span class="ce-numer"><span class="ce-num">3</span></span><span class="ce-denom"><span class="ce-num">4</span></span></span>'));
  assert.ok(html('1a/b2↓3').includes('<span class="ce-mixed"><span class="ce-num">1</span><span class="ce-frac ce-value">'));
});
test('HTML: π, % of, parentheses and the answer', () => {
  const h = html('2π+10%50');
  assert.ok(h.includes('<span class="ce-pi">π</span>'));
  assert.ok(h.includes('<span class="ce-pct">%</span><span class="ce-word"> of </span>'));
  assert.ok(h.includes('<span class="ce-ans">'));
  assert.ok(html('(1+2)').includes('<span class="ce-paren">)</span>'));
});
test('HTML: negative powers stay as superscripts without parentheses', () => {
  const h = html('2^−1');
  assert.ok(h.includes('<sup class="ce-sup"><span class="ce-sign">−</span><span class="ce-num">1</span></sup>'));
  assert.ok(!h.includes('ce-paren'));
});
test('HTML: (−3)² gets its parentheses', () => {
  const h = html('3±²');
  assert.ok(h.includes('<span class="ce-paren">(</span><span class="ce-num">−3</span><span class="ce-paren">)</span><sup'));
});
test('HTML: while typing, unclosed parentheses show faded; after an operator only the cursor shows (HOLE-1)', () => {
  const h = typed('2×(3+').state().expression.html;
  assert.ok(!h.includes('ce-hole'), 'no dashed box after +, as Desmos');
  assert.ok(h.includes('<span class="ce-op">\u2009+\u2009</span><span class="ce-cursor"></span>'), h);
  assert.ok(h.includes('<span class="ce-paren ce-ghost">)</span>'));
  assert.ok(typed('27+').state().expression.html.endsWith('<span class="ce-cursor"></span></span>'));
  assert.ok(!typed('27+').state().expression.mathml.includes('ce-hole'));
});
test('HTML: an empty box slot shows a dashed box with the cursor (HOLE-1)', () => {
  assert.ok(typed('2^').state().expression.html.includes('<span class="ce-hole"><span class="ce-cursor"></span></span>'));
  assert.ok(typed('√').state().expression.html.includes('<span class="ce-hole"><span class="ce-cursor"></span></span>'));
  assert.ok(typed('a/b').state().expression.html.includes('ce-hole'));
});
test('HTML: carries the spoken version as its aria-label', () => {
  assert.ok(html('2+3×4').startsWith('<span class="ce-math" role="math" aria-label="2 plus 3 times 4 equals 14">'));
});
test('HTML: stacked division (option)', () => {
  const st = calc('(1+2)÷(3+4)', { stackedDivision: true, answerAs: 'fraction' });
  assert.ok(st.equation.html.includes('<span class="ce-frac"><span class="ce-numer"><span class="ce-num">1</span><span class="ce-op"> + </span><span class="ce-num">2</span></span><span class="ce-denom">'), 'the bar groups: no parentheses');
  assert.strictEqual(st.equation.text, '(1 + 2) ÷ (3 + 4) = 3/7', 'plain text keeps ÷');
  assert.ok(st.equation.mathml.includes('<mfrac>'));
});
test('stacked division shows the 6 ÷ 2(1 + 2) convention', () => {
  const h = calc('6÷2(1+2)', { stackedDivision: true }).equation.html;
  assert.ok(h.includes('<span class="ce-frac"><span class="ce-numer"><span class="ce-num">6</span></span><span class="ce-denom"><span class="ce-num">2</span></span></span><span class="ce-paren">(</span>'));
});
test('HTML is escaped and built only from the engine\'s own tokens', () => {
  const c = fresh();
  assert.strictEqual(c.press('<img src=x onerror=alert(1)>'), false);
  assert.throws(() => c.input('<script>'), /Not a calculator key/);
  const all = JSON.stringify(calc('(1+2)×3÷4−5^2→+√9→+π+10%50', { stackedDivision: true }));
  assert.ok(!/<script|onerror|javascript:/i.test(all));
});
test('MathML: numbers, operators, powers, roots, fractions, π and invisible times', () => {
  const m = calc('2π+√9→+3²+∛8→+1⁄2').equation.mathml;
  assert.ok(m.startsWith('<math class="ce-mathml" display="inline">'));
  assert.ok(m.includes('<mn>2</mn><mo>&#x2062;</mo><mi>π</mi>'));
  assert.ok(m.includes('<msqrt><mn>9</mn></msqrt>'));
  assert.ok(m.includes('<msup><mrow><mn>3</mn></mrow><mrow><mn>2</mn></mrow></msup>'));
  assert.ok(m.includes('<mroot><mrow><mn>8</mn></mrow><mrow><mn>3</mn></mrow></mroot>'));
  assert.ok(m.includes('<mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac>'));
});
test('MathML: scientific notation', () => assert.ok(calc('10^20').equation.mathml.includes('<msup><mn>10</mn><mn>20</mn></msup>')));
test('speech: words for a screen reader', () => {
  assert.strictEqual(calc('−3²+√16').equation.speech, 'negative 3 squared plus the square root of 16 equals negative 5');
  assert.strictEqual(calc('2^3').equation.speech, '2 cubed equals 8');
  assert.strictEqual(calc('2^4').equation.speech, '2 to the power of 4 equals 16');
  assert.strictEqual(calc('1÷3').equation.speech, '1 divided by 3 equals 0.3333333333');
  assert.strictEqual(calc('∛8').equation.speech, 'the cube root of 8 equals 2');
  assert.strictEqual(calc('3⁄4').equation.speech, '3 over 4 equals 0.75');
  assert.strictEqual(calc('1024×1').equation.speech, '1,024 times 1 equals 1,024', 'commas, so it is read as a number');
});
test('the expression so far, before =', () => {
  const st = typed('2+3×').state();
  assert.strictEqual(st.expression.text, '2 + 3 ×');
  assert.strictEqual(st.equation.text, '2 + 3 ×');
});
test('CSS is provided for the ce- classes and uses the board\'s accent', () => {
  for (const cls of ['.ce-sup', '.ce-radicand', '.ce-index', '.ce-frac', '.ce-numer', '.ce-rep', '.ce-ghost', '.ce-hole', '.ce-mark', '.ce-cursor', '.ce-ansref']) assert.ok(C.CSS.includes(cls), cls);
  assert.ok(C.CSS.includes('var(--b21-accent'));
  assert.ok(C.CSS.includes('prefers-reduced-motion'), 'the cursor stops blinking when motion is reduced');
});

// ---- 13. Steps -------------------------------------------------------------------------------------------------------
const stepTexts = (s, o) => calc(s, o).steps.map(x => x.text);
test('steps: 2 + 3 × 4 → 2 + 12 → 14', () => assert.deepStrictEqual(stepTexts('2+3×4'), ['2 + 3 × 4', '2 + 12', '14']));
test('steps: the part worked out next is marked', () => {
  const st = calc('2+3×4');
  assert.ok(st.steps[0].html.includes('<span class="ce-mark"><span class="ce-num">3</span><span class="ce-op"> × </span><span class="ce-num">4</span></span>'));
  assert.ok(st.steps[1].html.includes('<span class="ce-mark"><span class="ce-num">2</span>'));
  assert.ok(!st.steps[2].html.includes('ce-mark'));
  assert.ok(st.steps[0].mathml.includes('<mrow class="ce-mark">'));
});
test('steps: rule, operation and the small sum worked out', () => {
  const s = calc('2+3×4').steps;
  assert.strictEqual(s[0].rule, 'MD'); assert.strictEqual(s[0].op, 'multiply'); assert.strictEqual(s[0].work.text, '3 × 4 = 12');
  assert.strictEqual(s[1].rule, 'AS'); assert.strictEqual(s[1].op, 'add');
  assert.strictEqual(s[2].final, true);
  assert.strictEqual(C.RULES.MD, 'Multiply and divide, left to right');
});
test('steps: × and ÷ left to right, then + and − left to right', () => {
  assert.deepStrictEqual(stepTexts('2+3×4−6÷2'), ['2 + 3 × 4 − 6 ÷ 2', '2 + 12 − 6 ÷ 2', '2 + 12 − 3', '14 − 3', '11']);
  assert.deepStrictEqual(stepTexts('8÷4÷2'), ['8 ÷ 4 ÷ 2', '2 ÷ 2', '1']);
});
test('steps: parentheses first, innermost first', () => {
  assert.deepStrictEqual(stepTexts('2×(3+(4−1))'), ['2 × (3 + (4 − 1))', '2 × (3 + 3)', '2 × 6', '12']);
  const s = calc('2×(3+(4−1))').steps;
  assert.strictEqual(s[0].inParens, true);
  assert.strictEqual(s[2].inParens, false);
});
test('steps: what is in a box goes first, like parentheses', () => {
  assert.deepStrictEqual(stepTexts('2×3+2^(1+1'), ['2 × 3 + 2^(1 + 1)', '2 × 3 + 2²', '2 × 3 + 4', '6 + 4', '10']);
  assert.deepStrictEqual(stepTexts('√9+16'), ['√(9 + 16)', '√25', '5']);
  assert.deepStrictEqual(stepTexts('6⁄2(1+2)'), ['6/(2(1 + 2))', '6/(2 × 3)', '6/6', '1']);
});
test('steps: exponents before × and ÷', () => assert.deepStrictEqual(stepTexts('2×3²'), ['2 × 3²', '2 × 9', '18']));
test('steps: 2^3^2 works out the top power first', () => assert.deepStrictEqual(stepTexts('2^3^2'), ['2^3²', '2⁹', '512']));
test('steps: 6 ÷ 2(1 + 2) shows the convention', () => assert.deepStrictEqual(stepTexts('6÷2(1+2)'), ['6 ÷ 2(1 + 2)', '6 ÷ 2 × 3', '3 × 3', '9']));
test('steps: negative results get parentheses where needed', () => assert.deepStrictEqual(stepTexts('(2−5)²'), ['(2 − 5)²', '(−3)²', '9']));
test('steps: −3² keeps the minus outside', () => assert.deepStrictEqual(stepTexts('−3²'), ['−3²', '−9']));
test('steps: parentheses around a single number go as a step', () => {
  assert.deepStrictEqual(stepTexts('((2))'), ['((2))', '2']);
  assert.strictEqual(calc('((2))').steps[0].rule, 'P');
});
test('steps: fractions as typed are numbers', () => {
  assert.deepStrictEqual(stepTexts('1⁄2→+1⁄3'), ['1/2 + 1/3', '0.8333333333']);
  assert.deepStrictEqual(stepTexts('1⁄2→+1⁄3', { answerAs: 'fraction' }), ['1/2 + 1/3', '5/6']);
  assert.deepStrictEqual(stepTexts('3⁄4'), ['3/4', '0.75'], 'a fraction alone is worked out');
});
test('steps: rounded numbers on the way show …', () => assert.deepStrictEqual(stepTexts('1÷3×3'), ['1 ÷ 3 × 3', '0.3333333333… × 3', '1']));
test('steps: in fraction mode the numbers on the way are fractions', () => assert.deepStrictEqual(stepTexts('1÷3×3', { answerAs: 'fraction' }), ['1 ÷ 3 × 3', '1/3 × 3', '1']));
test('steps: roots and π', () => assert.deepStrictEqual(stepTexts('√16→+2π'), ['√16 + 2π', '4 + 2π', '4 + 6.283185307…', '10.28318531']));
test('steps stop where an error happens, marked, with the message', () => {
  const s = calc('5+3÷(2−2)').steps;
  assert.deepStrictEqual(s.map(x => x.text), ['5 + 3 ÷ (2 − 2)', '5 + 3 ÷ 0']);
  assert.strictEqual(s[1].error.code, 'divzero');
  assert.ok(s[1].html.includes('<span class="ce-mark"><span class="ce-num">3</span><span class="ce-op"> ÷ </span><span class="ce-num">0</span></span>'));
});
test('steps: the last line is always the answer', () => {
  for (const s of ['2+3×4', '1÷7', '(1+2)(3+4)', '√2→×√2', '10%50', '2^−1', '1a/b2↓3', '∛27']) {
    const st = calc(s);
    assert.strictEqual(st.steps[st.steps.length - 1].text, st.answer.text, s);
  }
});
test('steps: just a number is one line', () => assert.deepStrictEqual(stepTexts('5'), ['5']));
test('steps are empty while typing', () => assert.deepStrictEqual(typed('2+3').state().steps, []));

// ---- 14. Lines (createSheet): the Desmos model -------------------------------------------------------------------------
test('sheet: each line shows its answer live, as it is typed', () => {
  const s = sheet('2+3');
  const l = s.state().lines[0];
  assert.strictEqual(l.kind, 'answer');
  assert.strictEqual(l.result.text, '5');
  assert.strictEqual(l.equation.text, '2 + 3 = 5');
  s.press('×');
  assert.strictEqual(s.state().lines[0].kind, 'unfinished');
  assert.strictEqual(s.state().lines[0].result, null);
  assert.strictEqual(s.state().lines[0].notice.message, 'Put a number after ×.');
});
test('sheet: just a number shows no answer (as Desmos)', () => {
  assert.strictEqual(sheet('7').state().lines[0].kind, 'number');
  assert.strictEqual(sheet('7').state().lines[0].result, null);
});
test('sheet: = starts a new line below', () => {
  const s = sheet('2+3=4×5');
  const st = s.state();
  assert.strictEqual(st.lines.length, 2);
  assert.strictEqual(st.focus, 1);
  assert.deepStrictEqual(st.lines.map(l => l.result.text), ['5', '20']);
  assert.strictEqual(sheet('').press('='), false, 'not from an empty line');
});
test('sheet: ans is the answer of the line above, drawn in a box', () => {
  const s = sheet('2+3= ans×2');
  const l = s.state().lines[1];
  assert.strictEqual(l.result.text, '10');
  assert.strictEqual(l.expression.text, '5 × 2');
  assert.ok(l.expression.html.includes('<span class="ce-anslabel">ans</span>'));
});
test('sheet: changing an earlier line changes the lines that use ans', () => {
  const s = sheet('2+3= ans+1= ans+1');
  assert.deepStrictEqual(s.state().lines.map(l => l.result.text), ['5', '6', '7']);
  s.focus(0);
  s.input('⌫7');
  assert.deepStrictEqual(s.state().lines.map(l => l.result.text), ['9', '10', '11']);
});
test('sheet: ans alone shows its answer; a number line still gives ans', () => {
  assert.strictEqual(sheet('4×5= ans').state().lines[1].result.text, '20');
  assert.strictEqual(sheet('2+3= 7= ans×1').state().lines[2].result.text, '7');
});
test('sheet: ans with no answer above says so', () => {
  const l = sheet('ans+1').state().lines[0];
  assert.strictEqual(l.kind, 'error');
  assert.strictEqual(l.error.code, 'noans');
  const m = sheet('1÷0= ans+1').state().lines[1];
  assert.strictEqual(m.error.code, 'noans');
});
test('sheet: a rounded answer used by ans keeps all its digits', () => assert.strictEqual(sheet('1⁄3= ans×3').state().lines[1].result.text, '1'));
test('sheet: + × ÷ at the start of a line do nothing; − is a minus sign', () => {
  const s = sheet('2+3=');
  assert.strictEqual(s.press('+'), false);
  assert.strictEqual(s.press('×'), false);
  assert.strictEqual(s.press('−'), true);
});
test('sheet: errors say what happened', () => {
  const l = sheet('1÷0').state().lines[0];
  assert.strictEqual(l.kind, 'error');
  assert.strictEqual(l.error.short, 'Can’t divide by 0');
});
test('sheet: ⌫ on an empty line removes it, and ↑ ↓ move between lines', () => {
  const s = sheet('1+1=2+2=');
  assert.strictEqual(s.state().lines.length, 3);
  s.press('⌫');
  assert.strictEqual(s.state().lines.length, 2);
  assert.strictEqual(s.state().focus, 1);
  s.press('↑');
  assert.strictEqual(s.state().focus, 0);
  s.press('↓');
  assert.strictEqual(s.state().focus, 1);
  assert.strictEqual(s.press('↓'), false);
});
test('sheet: ↓ in the top of a fraction goes to its bottom, not the next line', () => {
  const s = sheet('1= a/b3');
  s.focus(0); s.focus(1);
  s.press('↓');
  assert.strictEqual(s.state().lines[1].box, 'denom');
  assert.strictEqual(s.state().focus, 1);
});
test('sheet: the cursor is drawn on the line being typed only', () => {
  const st = sheet('1+1=2+2').state();
  assert.ok(!st.lines[0].expression.html.includes('ce-cursor'));
  assert.ok(st.lines[1].expression.html.includes('ce-cursor'));
});
test('sheet: the fraction toggle, line by line', () => {
  const s = sheet('1+5⁄8= 2÷4');
  assert.strictEqual(s.toggleFraction(0), true);
  const st = s.state();
  assert.strictEqual(st.lines[0].result.text, '13/8');
  assert.strictEqual(st.lines[0].asFraction, true);
  assert.strictEqual(st.lines[1].result.text, '0.5');
  assert.strictEqual(s.press('⇄'), true, 'the line being typed');
  assert.strictEqual(s.state().lines[1].result.text, '1/2');
  assert.strictEqual(s.toggleFraction(5), false);
});
test('sheet: a mixed number shows nothing, until it is shown as a fraction (as Desmos)', () => {
  const s = sheet('1a/b2↓3');
  assert.strictEqual(s.state().lines[0].result, null);
  assert.strictEqual(s.state().lines[0].canToggle, true);
  s.toggleFraction(0);
  assert.strictEqual(s.state().lines[0].result.text, '5/3');
});
test('sheet: AC clears all the lines; C clears the line', () => {
  const s = sheet('1+1=2+2');
  s.press('C');
  assert.strictEqual(s.state().lines[1].kind, 'empty');
  s.press('AC');
  assert.strictEqual(s.state().lines.length, 1);
  assert.strictEqual(s.press('AC'), false);
});
test('sheet: undo and redo, as Desmos', () => {
  const s = sheet('1+1=2+2');
  s.press('AC');
  assert.strictEqual(s.undo(), true);
  assert.strictEqual(s.state().lines.length, 2);
  assert.strictEqual(s.state().lines[1].result.text, '4');
  assert.strictEqual(s.redo(), true);
  assert.strictEqual(s.state().lines.length, 1);
  assert.strictEqual(s.state().can.undo, true);
  s.input('5');
  assert.strictEqual(s.state().can.redo, false, 'a new change ends redo');
});
test('sheet: steps for a line, for the side view', () => {
  const s = sheet('2+3×4= ans÷2');
  assert.deepStrictEqual(s.steps(0).map(x => x.text), ['2 + 3 × 4', '2 + 12', '14']);
  assert.deepStrictEqual(s.steps(1).map(x => x.text), ['14 ÷ 2', '7']);
  assert.deepStrictEqual(s.steps(9), []);
});
test('sheet: at most 100 lines', () => {
  const s = C.createSheet();
  for (let i = 0; i < 101; i++) s.input('1=');
  assert.strictEqual(s.state().lines.length, 100);
  assert.strictEqual(s.state().notice.code, 'lines');
});
test('sheet: save and load, checked like a problem', () => {
  const s = sheet('1+5⁄8= ans×8= √(2');
  s.toggleFraction(0);
  const data = JSON.parse(JSON.stringify(s.serialize()));
  assert.strictEqual(data.v, 2);
  assert.strictEqual(data.sheet, true);
  const t = C.createSheet();
  assert.strictEqual(t.load(data), true);
  assert.deepStrictEqual(t.state().lines.map(l => l.expression.text), s.state().lines.map(l => l.expression.text));
  assert.strictEqual(t.state().lines[0].result.text, '13/8');
  assert.strictEqual(t.state().lines[1].result.text, '13');
  assert.strictEqual(t.state().focus, 2);
});
const SHEET_HOSTILE = [
  ['not a sheet', { v: 2, expr: [] }], ['old version', { v: 1, sheet: true, lines: [] }], ['no lines', { v: 2, sheet: true, lines: [] }],
  ['lines not an array', { v: 2, sheet: true, lines: 'x' }], ['a bad token', { v: 2, sheet: true, lines: [{ expr: ['<b>'] }] }],
  ['boxes that don\'t nest', { v: 2, sheet: true, lines: [{ expr: ['frac', { n: '1' }, 'end'] }] }],
  ['frac not a boolean', { v: 2, sheet: true, lines: [{ expr: [{ n: '1' }], frac: 'yes' }] }],
  ['focus out of range', { v: 2, sheet: true, lines: [{ expr: [] }], focus: 7 }],
  ['too many lines', { v: 2, sheet: true, lines: Array(101).fill({ expr: [] }) }]
];
for (const [name, data] of SHEET_HOSTILE) {
  test(`sheet load rejects: ${name}`, () => {
    const s = C.createSheet();
    assert.strictEqual(s.load(data), false);
    const st = s.state();
    assert.ok(st.lines.length >= 1 && st.focus < st.lines.length);
    assert.ok(!/<b>|NaN|Infinity/.test(JSON.stringify(st)));
  });
}

// ---- 15. Options -----------------------------------------------------------------------------------------------------
test('options: defaults follow Desmos', () => {
  assert.deepStrictEqual(fresh().options(), Object.assign({}, C.DEFAULTS));
  assert.strictEqual(C.DEFAULTS.percent, 'of');
  assert.strictEqual(C.DEFAULTS.digits, 10);
  assert.strictEqual(C.DEFAULTS.separators, 'space');
  assert.strictEqual(C.DEFAULTS.approxSign, false);
  assert.strictEqual(C.DEFAULTS.zeroPowerZero, 'one');
  assert.strictEqual(C.DEFAULTS.toggle, true);
});
test('options: unknown or bad values are ignored', () => {
  const o = C.readOptions({ percent: 'banana', historySize: 1e9, repeatEquals: 'yes', answerAs: 'fraction', digits: 12, keys: ['add', 'nope', 7], __proto__: { polluted: 1 } });
  assert.strictEqual(o.percent, 'of');
  assert.strictEqual(o.historySize, 10);
  assert.strictEqual(o.repeatEquals, true);
  assert.strictEqual(o.answerAs, 'fraction');
  assert.strictEqual(o.digits, 10);
  assert.deepStrictEqual(Array.from(o.keys), ['add']);
  assert.strictEqual(C.readOptions('nope').percent, 'of');
  assert.strictEqual(({}).polluted, undefined);
});
test('options: setOptions merges and validates', () => {
  const c = fresh();
  assert.strictEqual(c.setOptions({ answerAs: 'mixed' }).answerAs, 'mixed');
  assert.strictEqual(c.setOptions({ percent: 'apple' }).answerAs, 'mixed');
  assert.strictEqual(c.setOptions(null).percent, 'apple');
});
test('changing display options redraws the answer and steps', () => {
  const c = typed('7÷2=');
  assert.strictEqual(c.state().display, '3.5');
  c.setOptions({ answerAs: 'fraction' });
  assert.strictEqual(c.state().display, '7/2');
  assert.strictEqual(c.state().steps[0].text, '7 ÷ 2');
  assert.strictEqual(c.state().history[0].equation.text, '7 ÷ 2 = 7/2');
});
test('options: keys limits a calculator to its own keys (a test version, say)', () => {
  const FF = { keys: ['digits', 'point', 'add', 'subtract', 'multiply', 'divide', 'sqrt', 'percent'] };
  const c = typed('2^3+1=', FF);
  assert.strictEqual(c.state().equation.text, '23 + 1 = 24', 'aᵇ is not a key here');
  assert.strictEqual(typed('(2+3', FF).state().expression.text, '2 + 3');
  assert.strictEqual(fresh(FF).canPress('π'), false);
  assert.strictEqual(fresh(FF).canPress('7'), true);
  assert.strictEqual(typed('5', FF).canPress('⌫'), true, '⌫ always works');
});

// ---- 16. Save and load (one display) ---------------------------------------------------------------------------------
const roundTrip = c => { const d = fresh(); assert.strictEqual(d.load(JSON.parse(JSON.stringify(c.serialize()))), true); return d; };
test('serialize is plain JSON', () => {
  const data = typed('1÷3= √2= 2+(3').serialize();
  assert.doesNotThrow(() => JSON.stringify(data));
  assert.strictEqual(data.v, 2);
});
test('round trip while typing', () => {
  const d = roundTrip(typed('12.50+(3±'));
  assert.strictEqual(d.state().expression.text, '12.50 + (−3');
  assert.strictEqual(d.state().openParens, 1);
});
test('round trip with boxes open', () => {
  const d = roundTrip(typed('2^(1+a/b3↓4'));
  assert.strictEqual(d.state().box, 'denom');
  d.press('=');
  assert.strictEqual(d.state().equation.text, '2^(1 + 3/4) = 3.363585661');
});
test('round trip after =, including boxes closed by =', () => {
  const d = roundTrip(typed('2×(3+√4='));
  assert.strictEqual(d.state().equation.text, '2 × (3 + √4) = 10');
  d.press('⌫');
  assert.strictEqual(d.state().expression.text, '2 × (3 + √4');
  assert.strictEqual(d.state().box, 'sqrt');
});
test('round trip of an error', () => {
  const d = roundTrip(typed('5÷0='));
  assert.strictEqual(d.state().error.code, 'divzero');
});
test('round trip of the toggle', () => assert.strictEqual(roundTrip(typed('1÷4=⇄')).state().display, '1/4'));
test('round trip of history with exact and approximate answers', () => {
  const c = typed('1÷3= √2= 50+10%=', APPLE);
  const d = roundTrip(c);
  assert.deepStrictEqual(d.state().history.map(h => h.equation.text), c.state().history.map(h => h.equation.text));
});
test('round trip of reused answers', () => {
  const c = typed('1÷3=×3');
  const d = roundTrip(c);
  d.press('=');
  assert.strictEqual(d.state().display, '1');
});
test('load(null) starts empty', () => {
  const c = typed('2+3=');
  assert.strictEqual(c.load(null), true);
  assert.strictEqual(c.state().expression.text, '');
  assert.strictEqual(c.state().history.length, 0);
});
const HOSTILE = [
  ['a string', 'hello'], ['a number', 42], ['an array', []], ['no version', { expr: [] }], ['an older version', { v: 1, expr: [], mode: 'edit' }],
  ['a later version', { v: 3, expr: [] }],
  ['expr not an array', { v: 2, expr: 'oops', mode: 'edit' }],
  ['unknown token', { v: 2, expr: ['?'], mode: 'edit' }],
  ['HTML in a token', { v: 2, expr: ['<img src=x onerror=alert(1)>'], mode: 'edit' }],
  ['HTML in a number', { v: 2, expr: [{ n: '1<b>' }], mode: 'edit' }],
  ['a number written with e', { v: 2, expr: [{ n: '1e5' }], mode: 'edit' }],
  ['leading zeros', { v: 2, expr: [{ n: '007' }], mode: 'edit' }],
  ['too many digits', { v: 2, expr: [{ n: '1234567890123456' }], mode: 'edit' }],
  ['neg not a boolean', { v: 2, expr: [{ n: '1', neg: 'yes' }], mode: 'edit' }],
  ['a number object without n', { v: 2, expr: [{ x: '1' }], mode: 'edit' }],
  ['answer divided by zero', { v: 2, expr: [{ ans: '1/0' }], mode: 'edit' }],
  ['answer too big', { v: 2, expr: [{ ans: '1' + '0'.repeat(400) }], mode: 'edit' }],
  ['answer far too long', { v: 2, expr: [{ ans: '9'.repeat(100000) }], mode: 'edit' }],
  ['answer Infinity', { v: 2, expr: [{ ans: Infinity }], mode: 'edit' }],
  ['answer NaN', { v: 2, expr: [{ ans: NaN }], mode: 'edit' }],
  ['answer an object', { v: 2, expr: [{ ans: { n: 1 } }], mode: 'edit' }],
  ['ans of a line above, in one display', { v: 2, expr: ['ans'], mode: 'edit' }],
  ['operator first', { v: 2, expr: ['+', { n: '1' }], mode: 'edit' }],
  ['two numbers in a row', { v: 2, expr: [{ n: '1' }, { n: '2' }], mode: 'edit' }],
  [') before (', { v: 2, expr: [')', '(', { n: '1' }], mode: 'edit' }],
  ['empty parentheses', { v: 2, expr: ['(', ')'], mode: 'edit' }],
  ['two operators', { v: 2, expr: [{ n: '1' }, '+', '*', { n: '2' }], mode: 'edit' }],
  ['end without a box', { v: 2, expr: [{ n: '1' }, 'end'], mode: 'edit' }],
  ['sep in a power', { v: 2, expr: [{ n: '1' }, '^', { n: '2' }, 'sep'], mode: 'edit' }],
  [') closing a box', { v: 2, expr: ['(', { n: '1' }, '^', { n: '2' }, ')'], mode: 'edit' }],
  ['too many tokens', { v: 2, expr: Array.from({ length: 101 }, (_, i) => i % 2 ? '+' : { n: '1' }), mode: 'edit' }],
  ['too deep', { v: 2, expr: Array(11).fill('('), mode: 'edit' }],
  ['too deep in boxes', { v: 2, expr: Array(11).fill('sqrt'), mode: 'edit' }],
  ['unknown mode', { v: 2, expr: [{ n: '1' }], mode: 'party' }],
  ['done but unfinished', { v: 2, expr: [{ n: '1' }, '+'], mode: 'done', pct: 'of', closed: 0 }],
  ['done but parentheses open', { v: 2, expr: ['(', { n: '1' }], mode: 'done', pct: 'of', closed: 0 }],
  ['done but a box open', { v: 2, expr: ['sqrt', { n: '1' }], mode: 'done', pct: 'of', closed: 0 }],
  ['done with a bad percent mode', { v: 2, expr: [{ n: '1' }, '+', { n: '1' }], mode: 'done', pct: 'weird', closed: 0 }],
  ['done with a bad closed count', { v: 2, expr: [{ n: '1' }, '+', { n: '1' }], mode: 'done', pct: 'of', closed: 2 }],
  ['closed count not on ) or end', { v: 2, expr: ['(', { n: '1' }, ')', '+', { n: '1' }], mode: 'done', pct: 'of', closed: 1 }],
  ['done but the answer is an error', { v: 2, expr: [{ n: '1' }, '/', { n: '0' }], mode: 'done', pct: 'of', closed: 0 }],
  ['history not an array', { v: 2, expr: [], mode: 'edit', history: 'x' }],
  ['history too long', { v: 2, expr: [], mode: 'edit', history: Array(51).fill({ expr: [{ n: '1' }, '+', { n: '1' }], pct: 'of' }) }],
  ['history entry unfinished', { v: 2, expr: [], mode: 'edit', history: [{ expr: [{ n: '1' }, '+'], pct: 'of' }] }],
  ['history entry with an error', { v: 2, expr: [], mode: 'edit', history: [{ expr: [{ n: '1' }, '/', { n: '0' }], pct: 'of' }] }],
  ['history entry just a number', { v: 2, expr: [], mode: 'edit', history: [{ expr: [{ n: '1' }], pct: 'of' }] }],
  ['history entry without pct', { v: 2, expr: [], mode: 'edit', history: [{ expr: [{ n: '1' }, '+', { n: '1' }] }] }],
  ['history entry not an object', { v: 2, expr: [], mode: 'edit', history: [7] }],
  ['huge power in the history', { v: 2, expr: [], mode: 'edit', history: [{ expr: [{ n: '9' }, '^', { n: '9' }, '^', { n: '9' }, 'end', 'end'], pct: 'of' }] }]
];
for (const [name, data] of HOSTILE) {
  test(`load rejects: ${name}`, () => {
    const c = fresh();
    assert.strictEqual(c.load(data), false);
    const st = c.state();
    assert.ok(!/<img|<b>|onerror|NaN|Infinity/.test(JSON.stringify(st)));
    assert.ok(['edit', 'done', 'error'].includes(st.mode));
  });
}
test('load keeps the good history entries and drops the bad ones', () => {
  const c = fresh();
  const ok = c.load({ v: 2, expr: [], mode: 'edit', history: [{ expr: [{ n: '2' }, '+', { n: '2' }], pct: 'of' }, 7, { expr: ['?'], pct: 'of' }, { expr: [{ n: '3' }, '*', { n: '3' }], pct: 'of' }] });
  assert.strictEqual(ok, false);
  assert.deepStrictEqual(c.state().history.map(h => h.equation.text), ['2 + 2 = 4', '3 × 3 = 9']);
});
test('load works the answers out again rather than trusting them', () => {
  const c = fresh();
  c.load({ v: 2, expr: [{ n: '2' }, '+', { n: '2' }], mode: 'done', pct: 'of', closed: 0, result: '5', history: [{ expr: [{ n: '2' }, '+', { n: '2' }], pct: 'of', value: '5' }] });
  assert.strictEqual(c.state().display, '4');
  assert.strictEqual(c.state().history[0].answer.text, '4');
});
test('load of __proto__ keys pollutes nothing', () => {
  const c = fresh();
  c.load(JSON.parse('{"v":2,"expr":[{"n":"1","__proto__":{"polluted":true}}],"mode":"edit","__proto__":{"polluted":true}}'));
  assert.strictEqual(({}).polluted, undefined);
  assert.strictEqual(c.state().expression.text, '1');
});
test('load survives an object that throws', () => {
  const c = fresh();
  const evil = { v: 2, mode: 'edit', get expr() { throw new Error('boom'); } };
  assert.strictEqual(c.load(evil), false);
  assert.strictEqual(c.state().expression.text, '');
});
test('load trims the history to the history size', () => {
  const c = fresh({ historySize: 3 });
  const many = Array.from({ length: 8 }, (_, i) => ({ expr: [{ n: String(i + 1) }, '+', { n: '1' }], pct: 'of' }));
  c.load({ v: 2, expr: [], mode: 'edit', history: many });
  assert.strictEqual(c.state().history.length, 3);
});

// ---- 17. Keyboard (as Desmos) -----------------------------------------------------------------------------------------
const ev = (key, more) => Object.assign({ key, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false }, more);
const KEYMAP = [
  ['7', '7'], ['.', 'point'], [',', 'point'], ['+', 'add'], ['-', 'subtract'], ['*', 'multiply'], ['x', 'multiply'], ['X', 'multiply'],
  ['/', 'divide'], ['^', 'power'], ['%', 'percent'], ['(', 'open'], [')', 'close'], ['Enter', 'equals'], ['=', 'equals'],
  ['Backspace', 'backspace'], ['Escape', 'clear'], ['Delete', 'clear'], ['@', 'sqrt'], ['F9', 'negate'], ['ArrowRight', 'right'],
  ['ArrowUp', 'up'], ['ArrowDown', 'down'], ['r', null], ['p', null], ['b', null], ['Tab', null], ['Shift', null]
];
for (const [key, name] of KEYMAP) test(`key ${key} → ${name}`, () => assert.strictEqual(C.keyFromEvent(ev(key)), name));
test('/ is a fraction with the option slash: fraction (Desmos Scientific)', () => assert.strictEqual(C.keyFromEvent(ev('/'), { slash: 'fraction' }), 'over'));
test('Ctrl and ⌘ shortcuts, as Desmos', () => {
  assert.strictEqual(C.keyFromEvent(ev('z', { ctrlKey: true })), 'undo');
  assert.strictEqual(C.keyFromEvent(ev('Z', { ctrlKey: true, shiftKey: true })), 'redo');
  assert.strictEqual(C.keyFromEvent(ev('z', { metaKey: true })), 'undo');
  assert.strictEqual(C.keyFromEvent(ev('L', { ctrlKey: true, shiftKey: true })), 'clear');
  assert.strictEqual(C.keyFromEvent(ev('A', { altKey: true, shiftKey: true, code: 'KeyA' })), 'toggle');
  assert.strictEqual(C.keyFromEvent(ev('a', { metaKey: true, shiftKey: true, code: 'KeyA' })), 'toggle');
});
test('other keys with Ctrl or ⌘ are left to the browser', () => {
  assert.strictEqual(C.keyFromEvent(ev('c', { ctrlKey: true })), null);
  assert.strictEqual(C.keyFromEvent(ev('v', { metaKey: true })), null);
  assert.strictEqual(C.keyFromEvent(ev('7', { ctrlKey: true, altKey: true })), '7', 'AltGr');
});
test('a held-down Enter counts once; held-down digits and Backspace repeat', () => {
  assert.strictEqual(C.keyFromEvent(ev('Enter', { repeat: true })), null);
  assert.strictEqual(C.keyFromEvent(ev('Backspace', { repeat: true })), 'backspace');
  assert.strictEqual(C.keyFromEvent(ev('5', { repeat: true })), '5');
});
test('keys typed while composing text are ignored', () => assert.strictEqual(C.keyFromEvent(ev('5', { isComposing: true })), null));
const typeKeys = (c, s) => { for (const k of s) c.handleKey(ev(k)); };
test('words typed as letters, as Desmos: sqrt, cbrt, nthroot, pi, ans, frac', () => {
  const c = fresh();
  typeKeys(c, 'sqrt16');
  c.handleKey(ev('Enter'));
  assert.strictEqual(c.state().equation.text, '√16 = 4');
  const d = fresh();
  typeKeys(d, '2pi');
  assert.strictEqual(d.state().expression.text, '2π');
  const e = fresh();
  typeKeys(e, 'cbrt27');
  e.handleKey(ev('Enter'));
  assert.strictEqual(e.state().display, '3');
  const f = fresh();
  typeKeys(f, 'nthroot4');
  f.handleKey(ev('ArrowRight'));
  typeKeys(f, '16');
  f.handleKey(ev('Enter'));
  assert.strictEqual(f.state().equation.text, '⁴√16 = 2');
});
test('letters that can\'t become a word are left alone', () => {
  const c = fresh();
  assert.strictEqual(c.handleKey(ev('q')), false);
  assert.strictEqual(c.handleKey(ev('s')), true, 's could be sqrt');
});
test('handleKey: typing 2^-1 Enter on a keyboard', () => {
  const c = fresh();
  for (const k of ['2', '^', '-', '1', 'Enter']) assert.strictEqual(c.handleKey(ev(k)), true);
  assert.strictEqual(c.state().display, '0.5');
  assert.strictEqual(c.handleKey(ev('b')), false);
});
test('handleKey: 6/2*(1+2) Enter is 9 (/ is ÷, as Desmos Four-Function)', () => {
  const c = fresh();
  for (const k of '6/2*(1+2)') c.handleKey(ev(k));
  c.handleKey(ev('Enter'));
  assert.strictEqual(c.state().equation.text, '6 ÷ 2 × (1 + 2) = 9');
});
test('handleKey: 6/2(1+2) Enter is 1 with slash: fraction (as Desmos Scientific)', () => {
  const c = fresh({ slash: 'fraction' });
  for (const k of '6/2(1+2)') c.handleKey(ev(k));
  c.handleKey(ev('Enter'));
  assert.strictEqual(c.state().equation.text, '6/(2(1 + 2)) = 1');
});
test('handleKey: Escape clears', () => {
  const c = typed('2+3');
  c.handleKey(ev('Escape'));
  assert.strictEqual(c.state().expression.text, '');
});
test('handleKey on a sheet: Enter, arrows and undo', () => {
  const s = C.createSheet();
  typeKeys(s, '2+3');
  s.handleKey(ev('Enter'));
  typeKeys(s, 'ans*2');
  assert.strictEqual(s.state().lines[1].result.text, '10');
  s.handleKey(ev('ArrowUp'));
  assert.strictEqual(s.state().focus, 0);
  s.handleKey(ev('z', { ctrlKey: true }));
  assert.ok(s.state().lines[1].kind !== 'answer' || s.state().lines.length === 2);
});

// ---- 18. Keys and aliases ---------------------------------------------------------------------------------------------
test('every key has a label and a spoken name; ÷ × − on the keys (Tyler), a² aᵇ ans as Desmos', () => {
  for (const [k, v] of Object.entries(C.KEYS)) assert.ok(v.label && v.name, k);
  assert.strictEqual(C.KEYS.multiply.label, '×');
  assert.strictEqual(C.KEYS.divide.label, '÷');
  assert.strictEqual(C.KEYS.subtract.label, '−');
  assert.strictEqual(C.KEYS.square.label, 'a²');
  assert.strictEqual(C.KEYS.power.label, 'aᵇ');
  assert.strictEqual(C.KEYS.ans.label, 'ans');
});
test('press takes names and symbols', () => {
  const c = fresh();
  for (const k of ['2', 'add', '3', 'multiply', '4', 'equals']) c.press(k);
  assert.strictEqual(c.state().display, '14');
  const d = fresh();
  for (const k of ['2', '+', '3', '×', '4', '=']) d.press(k);
  assert.strictEqual(d.state().display, '14');
});
test('press of an unknown key does nothing', () => {
  const c = typed('2');
  for (const k of ['banana', '', null, undefined, 7, {}, 'constructor', '__proto__', 'toString']) assert.strictEqual(c.press(k), false, String(k));
  assert.strictEqual(c.state().expression.text, '2');
});

// ---- 19. Desmos parity: answers typed into desmos.com/scientific (November 2026) ------------------------------------
// [keys, the answer Desmos showed (null: none), the fraction its toggle showed]. Where Desmos says "undefined" the
// engine says what went wrong; 10^−400 is "Too small to show" (Desmos shows 0).
const DESMOS = [
  ["2+3×4", "14", null],   // 2+3\cdot4
  ["2×3+4", "10", null],   // 2\cdot3+4
  ["8÷4÷2", "1", null],   // 8\div4\div2
  ["10−4−3", "3", null],   // 10-4-3
  ["2+3×4−6÷2", "11", null],   // 2+3\cdot4-6\div2
  ["(2+3)×4", "20", null],   // \left(2+3\right)\cdot4
  ["2^3^2", "512", null],   // 2^{3^{2}}
  ["(2^3→)^2", "64", null],   // \left(2^{3}\right)^{2}
  ["2^3×4", "32", null],   // 2^{3}\cdot4
  ["2×3^2", "18", null],   // 2\cdot3^{2}
  ["100÷10×10", "100", null],   // 100\div10\cdot10
  ["6÷2(1+2)", "9", null],   // 6\div2\left(1+2\right)
  ["((2))×1", "2", null],   // \left(\left(2\right)\right)\cdot1
  ["(((1+2)))×3", "9", null],   // \left(\left(\left(1+2\right)\right)\right)\cdot3
  ["12÷3÷2", "2", null],   // 12\div3\div2
  ["7−(2−5)", "10", null],   // 7-\left(2-5\right)
  ["3+4×2÷(1−5)^2", "3.5", "7/2"],   // 3+4\cdot2\div\left(1-5\right)^{2}
  ["1+2×3^2", "19", null],   // 1+2\cdot3^{2}
  ["2×(3+4)×5", "70", null],   // 2\cdot\left(3+4\right)\cdot5
  ["9−3÷3+1", "9", null],   // 9-3\div3+1
  ["−3^2", "−9", null],   // -3^{2}
  ["(−3)^2", "9", null],   // \left(-3\right)^{2}
  ["−2^2", "−4", null],   // -2^{2}
  ["2^−1", "0.5", "1/2"],   // 2^{-1}
  ["2^−3^2", "0.001953125", "1/512"],   // 2^{-3^{2}}
  ["5−(−3)", "8", null],   // 5-\left(-3\right)
  ["4×−3", "−12", null],   // 4\cdot-3
  ["−5+3", "−2", null],   // -5+3
  ["−(2+3)", "−5", null],   // -\left(2+3\right)
  ["−(−3)", "3", null],   // -\left(-3\right)
  ["5−−3", "8", null],   // 5--3
  ["5×−3", "−15", null],   // 5\cdot-3
  ["5÷−2", "−2.5", "−5/2"],   // 5\div-2
  ["−1.5×2", "−3", null],   // -1.5\cdot2
  ["−−3", "3", null],   // --3
  ["3−2^2", "−1", null],   // 3-2^{2}
  ["−2^3", "−8", null],   // -2^{3}
  ["(−2)^3", "−8", null],   // \left(-2\right)^{3}
  ["2−−2^2", "6", null],   // 2--2^{2}
  ["−(4)^2", "−16", null],   // -\left(4\right)^{2}
  ["2π", "6.283185307", null],   // 2\pi
  ["π×2", "6.283185307", null],   // \pi\cdot2
  ["2(3+4)", "14", null],   // 2\left(3+4\right)
  ["(1+2)(3+4)", "21", null],   // \left(1+2\right)\left(3+4\right)
  ["3√16", "12", null],   // 3\sqrt{16}
  ["(1+2)3", "9", null],   // \left(1+2\right)3
  ["π(2)", "6.283185307", null],   // \pi\left(2\right)
  ["4(2)^2", "16", null],   // 4\left(2\right)^{2}
  ["2(3)^2", "18", null],   // 2\left(3\right)^{2}
  ["2π^2", "19.7392088", null],   // 2\pi^{2}
  ["2^3→4", "32", null],   // 2^{3}4
  ["1⁄2→3", "1.5", "3/2"],   // \frac{1}{2}3
  ["3(1⁄2→)", "1.5", "3/2"],   // 3\left(\frac{1}{2}\right)
  ["2√9→√4", "12", null],   // 2\sqrt{9}\sqrt{4}
  ["6÷3(2)", "4", null],   // 6\div3\left(2\right)
  ["8÷2(2+2)", "16", null],   // 8\div2\left(2+2\right)
  ["1÷2π", "1.570796327", null],   // 1\div2\pi
  ["0.1+0.2", "0.3", "3/10"],   // 0.1+0.2
  ["1÷3×3", "1", null],   // 1\div3\cdot3
  ["0.1×3", "0.3", "3/10"],   // 0.1\cdot3
  ["1−0.9", "0.1", "1/10"],   // 1-0.9
  ["2÷3+1÷3", "1", null],   // 2\div3+1\div3
  ["1.1×1.1", "1.21", "121/100"],   // 1.1\cdot1.1
  ["1÷8", "0.125", "1/8"],   // 1\div8
  ["7÷2", "3.5", "7/2"],   // 7\div2
  ["0.5^2", "0.25", "1/4"],   // 0.5^{2}
  ["3^−2", "0.1111111111", "1/9"],   // 3^{-2}
  ["(1÷3)^2×9", "1", null],   // \left(1\div3\right)^{2}\cdot9
  ["1÷3", "0.3333333333", "1/3"],   // 1\div3
  ["2÷3", "0.6666666667", "2/3"],   // 2\div3
  ["1÷7", "0.1428571429", "1/7"],   // 1\div7
  ["10÷3", "3.333333333", "10/3"],   // 10\div3
  ["100000÷3", "33333.33333", "100000/3"],   // 100000\div3
  ["22÷7", "3.142857143", "22/7"],   // 22\div7
  ["1÷6", "0.1666666667", "1/6"],   // 1\div6
  ["5÷9", "0.5555555556", "5/9"],   // 5\div9
  ["1234.5678×1", "1234.5678", "6172839/5000"],   // 1234.5678\cdot1
  ["123456.789×1", "123456.789", "123456789/1000"],   // 123456.789\cdot1
  ["0.1+0.7", "0.8", "4/5"],   // 0.1+0.7
  ["4.35×100", "435", null],   // 4.35\cdot100
  ["1.005×1000", "1005", null],   // 1.005\cdot1000
  ["0.3−0.1", "0.2", "1/5"],   // 0.3-0.1
  ["√16", "4", null],   // \sqrt{16}
  ["√(1÷4)", "0.5", "1/2"],   // \sqrt{\left(1\div4\right)}
  ["√0.25", "0.5", "1/2"],   // \sqrt{0.25}
  ["√(9÷16)", "0.75", "3/4"],   // \sqrt{\left(9\div16\right)}
  ["√2", "1.414213562", null],   // \sqrt{2}
  ["√2→×√2", "2", null],   // \sqrt{2}\cdot\sqrt{2}
  ["√4^2", "4", null],   // \sqrt{4^{2}}
  ["√9→+16", "19", null],   // \sqrt{9}+16
  ["√9+16", "5", null],   // \sqrt{9+16}
  ["√0", "0", null],   // \sqrt{0}
  ["√√16", "2", null],   // \sqrt{\sqrt{16}}
  ["2√9", "6", null],   // 2\sqrt{9}
  ["∛27", "3", null],   // \sqrt[3]{27}
  ["∛−8", "−2", null],   // \sqrt[3]{-8}
  ["ⁿ√4→16", "2", null],   // \sqrt[4]{16}
  ["ⁿ√4→−16", "undefined", null],   // \sqrt[4]{-16}
  ["ⁿ√5→32", "2", null],   // \sqrt[5]{32}
  ["√−4", "undefined", null],   // \sqrt{-4}
  ["8^(1÷3)", "2", null],   // 8^{\left(1\div3\right)}
  ["8^(2÷3)", "4", null],   // 8^{\left(2\div3\right)}
  ["(−8)^(1⁄3", "−2", null],   // \left(-8\right)^{\left(\frac{1}{3}\right)}
  ["(−8)^(1÷3)", "−2", null],   // \left(-8\right)^{\left(1\div3\right)}
  ["√50", "7.071067812", null],   // \sqrt{50}
  ["√(2)^2", "2", null],   // \sqrt{\left(2\right)^{2}}
  ["√9+16", "5", null],   // \sqrt{9+16}
  ["2^10", "1024", null],   // 2^{10}
  ["10^15", "1×10^(15)", null],   // 10^{15}
  ["2^0.5", "1.414213562", null],   // 2^{0.5}
  ["0^0", "1", null],   // 0^{0}
  ["0^−1", "undefined", null],   // 0^{-1}
  ["1^1000", "1", null],   // 1^{1000}
  ["(−1)^1001", "−1", null],   // \left(-1\right)^{1001}
  ["2^−2", "0.25", "1/4"],   // 2^{-2}
  ["(1⁄2→)^3", "0.125", "1/8"],   // \left(\frac{1}{2}\right)^{3}
  ["10^−2", "0.01", "1/100"],   // 10^{-2}
  ["1.5^2", "2.25", "9/4"],   // 1.5^{2}
  ["(−2)^0.5", "undefined", null],   // \left(-2\right)^{0.5}
  ["9^0.5", "3", null],   // 9^{0.5}
  ["4^−0.5", "0.5", "1/2"],   // 4^{-0.5}
  ["2^1000", "1.07150861×10^(301)", null],   // 2^{1000}
  ["10^308", "1×10^(308)", null],   // 10^{308}
  ["10^309", "undefined", null],   // 10^{309}
  ["9^9^9", "undefined", null],   // 9^{9^{9}}
  ["10^−300", "1×10^(−300)", null],   // 10^{-300}
  ["10^−400", "0", null],   // 10^{-400}
  ["2^−1074", "4.94065646×10^(−324)", null],   // 2^{-1074}
  ["3a²+1", "10", null],   // 3^{2}+1
  ["0.5^−3", "8", null],   // 0.5^{-3}
  ["1⁄2", "0.5", "1/2"],   // \frac{1}{2}
  ["3⁄4", "0.75", "3/4"],   // \frac{3}{4}
  ["1⁄3", "0.3333333333", "1/3"],   // \frac{1}{3}
  ["2⁄4", "0.5", "1/2"],   // \frac{2}{4}
  ["1+5⁄8", "1.625", "13/8"],   // 1+\frac{5}{8}
  ["1⁄2→+1⁄3", "0.8333333333", "5/6"],   // \frac{1}{2}+\frac{1}{3}
  ["6⁄2(1+2)", "1", null],   // \frac{6}{2\left(1+2\right)}
  ["1⁄2+3", "0.2", "1/5"],   // \frac{1}{2+3}
  ["2×3⁄4", "1.5", "3/2"],   // 2\cdot\frac{3}{4}
  ["−3⁄4", "−0.75", "−3/4"],   // -\frac{3}{4}
  ["(1+2)⁄3", "1", null],   // \frac{\left(1+2\right)}{3}
  ["2π⁄3", "2.094395102", null],   // \frac{2\pi}{3}
  ["1⁄0", "undefined", null],   // \frac{1}{0}
  ["0⁄0", "undefined", null],   // \frac{0}{0}
  ["1⁄3→×3", "1", null],   // \frac{1}{3}\cdot3
  ["22⁄7", "3.142857143", "22/7"],   // \frac{22}{7}
  ["1.25×4", "5", null],   // 1.25\cdot4
  ["1÷8", "0.125", "1/8"],   // 1\div8
  ["1⁄1000", "0.001", "1/1000"],   // \frac{1}{1000}
  ["1⁄12345", "8.10044552×10^(−5)", "1/12345"],   // \frac{1}{12345}
  ["355⁄113", "3.14159292", "355/113"],   // \frac{355}{113}
  ["1⁄3→+1⁄3", "0.6666666667", "2/3"],   // \frac{1}{3}+\frac{1}{3}
  ["0.75×1", "0.75", "3/4"],   // 0.75\cdot1
  ["0.3×1", "0.3", "3/10"],   // 0.3\cdot1
  ["1a/b2↓3", null, "5/3"],   // 1\frac{2}{3}
  ["2a/b1↓2→×2", "5", null],   // 2\frac{1}{2}\cdot2
  ["−1a/b1↓2", null, "−3/2"],   // -1\frac{1}{2}
  ["1.5a/b1↓2", "0.75", "3/4"],   // 1.5\frac{1}{2}
  ["(1)a/b2↓3", "0.6666666667", "2/3"],   // \left(1\right)\frac{2}{3}
  ["a/b2↓3→+1", "1.666666667", "5/3"],   // \frac{2}{3}+1
  ["1⁄2⁄3", "1.5", "3/2"],   // \frac{1}{\frac{2}{3}}
  ["1⁄2→⁄3", "0.1666666667", "1/6"],   // \frac{\frac{1}{2}}{3}
  ["0.1+0.2", "0.3", "3/10"],   // 0.1+0.2
  ["2⁄3", "0.6666666667", "2/3"],   // \frac{2}{3}
  ["1⁄7", "0.1428571429", "1/7"],   // \frac{1}{7}
  ["1⁄999", "0.001001001001", "1/999"],   // \frac{1}{999}
  ["1⁄1024", "9.765625×10^(−4)", "1/1024"],   // \frac{1}{1024}
  ["5⁄1", "5", null],   // \frac{5}{1}
  ["7⁄2×2", "1.75", "7/4"],   // \frac{7}{2\cdot2}
  ["3.5×1", "3.5", "7/2"],   // 3.5\cdot1
  ["10%50", "5", null],   // 10\%\operatorname{of}50
  ["25%80", "20", null],   // 25\%\operatorname{of}80
  ["200%10", "20", null],   // 200\%\operatorname{of}10
  ["10%50+5", "10", null],   // 10\%\operatorname{of}50+5
  ["2×10%50", "10", null],   // 2\cdot10\%\operatorname{of}50
  ["10%50×2", "10", null],   // 10\%\operatorname{of}50\cdot2
  ["10%(50+10)", "6", null],   // 10\%\operatorname{of}\left(50+10\right)
  ["1.5%200", "3", null],   // 1.5\%\operatorname{of}200
  ["100%1", "1", null],   // 100\%\operatorname{of}1
  ["−10%50", "−5", null],   // -10\%\operatorname{of}50
  ["10%−50", "−5", null],   // 10\%\operatorname{of}-50
  ["50%50%40", "10", null],   // 50\%\operatorname{of}50\%\operatorname{of}40
  ["10%50^2", "250", null],   // 10\%\operatorname{of}50^{2}
  ["10%2×3", "0.6", "3/5"],   // 10\%\operatorname{of}2\cdot3
  ["50%", null, null],   // 50\%\operatorname{of}
  ["99999999×1", "99999999", null],   // 99999999\cdot1
  ["123456789×1", "123456789", null],   // 123456789\cdot1
  ["999999999+1", "1000000000", null],   // 999999999+1
  ["2^30", "1.07374182×10^(9)", null],   // 2^{30}
  ["2^32", "4.2949673×10^(9)", null],   // 2^{32}
  ["12345678901−0", "1.23456789×10^(10)", null],   // 12345678901-0
  ["10^9", "1000000000", null],   // 10^{9}
  ["10^10", "1×10^(10)", null],   // 10^{10}
  ["10^11", "1×10^(11)", null],   // 10^{11}
  ["10^12", "1×10^(12)", null],   // 10^{12}
  ["10^20", "1×10^(20)", null],   // 10^{20}
  ["10^100", "1×10^(100)", null],   // 10^{100}
  ["1.5×10^9", "1.5×10^(9)", null],   // 1.5\cdot10^{9}
  ["0.001×1", "0.001", "1/1000"],   // 0.001\cdot1
  ["0.0001×1", "1×10^(−4)", "1/10000"],   // 0.0001\cdot1
  ["0.00001×1", "1×10^(−5)", "1/100000"],   // 0.00001\cdot1
  ["1÷3000", "3.33333333×10^(−4)", "1/3000"],   // 1\div3000
  ["1÷30000", "3.33333333×10^(−5)", "1/30000"],   // 1\div30000
  ["1÷300000", "3.33333333×10^(−6)", "1/300000"],   // 1\div300000
  ["1÷3000000", "3.33333333×10^(−7)", "1/3000000"],   // 1\div3000000
  ["10^−5", "1×10^(−5)", "1/100000"],   // 10^{-5}
  ["10^−6", "1×10^(−6)", "1/1000000"],   // 10^{-6}
  ["10^−7", "1×10^(−7)", "1/10000000"],   // 10^{-7}
  ["1.5×10^−7", "1.5×10^(−7)", "3/20000000"],   // 1.5\cdot10^{-7}
  ["9999999999×1", "1×10^(10)", null],   // 9999999999\cdot1
  ["1÷998001", "1.002003×10^(−6)", "1/998001"],   // 1\div998001
  ["123456×1000", "123456000", null],   // 123456\cdot1000
  ["1234567×1000", "1.234567×10^(9)", null],   // 1234567\cdot1000
  ["0.000123×1", "1.23×10^(−4)", "123/1000000"],   // 0.000123\cdot1
  ["1÷1024", "9.765625×10^(−4)", "1/1024"],   // 1\div1024
  ["1÷0", "undefined", null],   // 1\div0
  ["0÷0", "undefined", null],   // 0\div0
  ["2+", null, null],   // 2+
  ["2×", null, null],   // 2\cdot
  ["×2", null, null],   // \cdot2
  ["÷5", null, null],   // \div5
  ["(2+3", "5", null],   // \left(2+3\right)
  ["5÷(3−3)", "undefined", null],   // 5\div\left(3-3\right)
  ["√(−1)", "undefined", null],   // \sqrt{\left(-1\right)}
  ["(−4)^0.25", "undefined", null],   // \left(-4\right)^{0.25}
  ["2^", null, null],   // 2^{ }
  ["√", null, null],   // \sqrt{ }
  ["1⁄", null, null],   // \frac{1}{ }
  ["+5", null, null],   // +5
];
const SUPERS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−' };
const canon = s => s === null ? null : s.replace(/[\s ]/g, '').replace(/×10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, e) => '×10^(' + Array.from(e, c => SUPERS[c]).join('') + ')');
const KNOWN = { '10^−400': 'toosmall' };
for (const [keys, value, frac] of DESMOS) {
  test(`Desmos: ${keys} → ${value}${frac ? ' (' + frac + ')' : ''}`, () => {
    const l = sheet(keys).state().lines[0];
    if (KNOWN[keys]) return assert.strictEqual(l.error.code, KNOWN[keys]);
    if (value === 'undefined') return assert.strictEqual(l.kind, 'error');
    if (value === null) return assert.ok(['number', 'unfinished'].includes(l.kind), l.kind);
    assert.strictEqual(canon(l.result && l.result.text), canon(value));
    assert.strictEqual(l.canToggle, !!frac, 'toggle');
    if (frac) {
      const s = sheet(keys); s.toggleFraction(0);
      assert.strictEqual(canon(s.state().lines[0].result.text), canon(frac));
    }
  });
}

// ---- 20. Robustness ---------------------------------------------------------------------------------------------------
test('random key mashing never throws and never shows NaN', () => {
  const keys = Object.keys(C.KEYS);
  let seed = 21;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let round = 0; round < 150; round++) {
    const c = fresh(round % 3 === 1 ? APPLE : round % 3 === 2 ? SIMPLE : { answerAs: 'mixed', stackedDivision: true, repeatingBar: true });
    for (let i = 0; i < 40; i++) {
      c.press(keys[Math.floor(rnd() * keys.length)]);
      const st = c.state();
      assert.ok(!/NaN|Infinity|undefined/.test(st.display + st.equation.text + (st.preview ? st.preview.text : '')), 'clean');
    }
    const d = fresh(); assert.strictEqual(d.load(JSON.parse(JSON.stringify(c.serialize()))), true, 'its own save loads');
  }
});
test('random key mashing on a sheet never throws, and its save loads', () => {
  const keys = Object.keys(C.KEYS);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let round = 0; round < 60; round++) {
    const s = C.createSheet(round % 2 ? { digits: 7, toggle: false } : {});
    for (let i = 0; i < 60; i++) {
      s.press(keys[Math.floor(rnd() * keys.length)]);
      if (i % 10 === 0) s.focus(Math.floor(rnd() * 4));
    }
    const st = s.state();
    assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(st.lines.map(l => [l.expression.text, l.result && l.result.text]))), 'clean');
    const t = C.createSheet(); assert.strictEqual(t.load(JSON.parse(JSON.stringify(s.serialize()))), true, 'its own save loads');
  }
});
test('steps and the direct answer agree', () => {
  for (const s of ['2+3×4', '(1+2)^2→÷3', '√(2)×π', '1÷7+2÷7', '2^0.5^2', '10−2×3^2→+4÷8', '1⁄2→+1⁄3', '10%50+5', '∛8→+1a/b1↓2']) {
    const c = typed(s);
    const preview = c.state().preview.text;
    c.press('=');
    assert.strictEqual(c.state().display, preview, s);
  }
});
test('works the same through the browser global (no module)', () => {
  const fs = require('fs'), vm = require('vm');
  const sandbox = { self: {} };
  vm.runInNewContext(fs.readFileSync(ENGINE, 'utf8'), sandbox);
  assert.strictEqual(sandbox.self.CalcEngine.calc('2+3×4').display, '14');
});
test('no eval, Function or network in the engine', () => {
  const src = require('fs').readFileSync(ENGINE, 'utf8');
  assert.ok(!/\beval\s*\(|new Function|\bFunction\s*\(|fetch\(|XMLHttpRequest|import\(/.test(src));
});

// ---- 21. More paths -------------------------------------------------------------------------------------------------
test('Apple percent repeats with =: 50 + 10% = = (compound growth)', () => assert.strictEqual(typed('50+10%==', APPLE).state().display, '60.5'));
test('Apple percent steps work the base out first', () => {
  assert.deepStrictEqual(stepTexts('2×50+10%', APPLE), ['2 × 50 + 10%', '100 + 10%', '100 + 10', '110']);
  assert.strictEqual(calc('2×50+10%', APPLE).steps[1].work.text, '10% of 100 = 10');
});
test('± after a power\'s number makes it negative: 2 aᵇ 1 ± = 0.5', () => assert.strictEqual(typed('2^1±=').state().equation.text, '2^(−1) = 0.5'));
test('C after = clears everything', () => assert.strictEqual(typed('2+3= C').state().expression.text, ''));
test('a point after a reused answer starts 0.', () => { const c = typed('2+3= AC'); c.useAnswer(0); c.press('.'); assert.strictEqual(c.state().display, '0.'); });
test('± on a reused answer', () => { const c = typed('2+3= AC'); c.useAnswer(0); c.press('±'); assert.strictEqual(c.state().display, '−5'); });
test('the display after = then an operator shows the answer', () => assert.strictEqual(typed('2+3=×').state().display, '5'));
test('history entries carry answer forms', () => assert.strictEqual(typed('7÷2=').state().history[0].answer.forms.mixed.text, '3 1/2'));
test('speech for fraction and mixed answers', () => {
  assert.strictEqual(calc('7÷2', { answerAs: 'mixed' }).answer.speech, '3 and 1 over 2');
  assert.strictEqual(calc('1÷6', { repeatingBar: true }).answer.speech, '0.16 with 6 repeating');
});
test('state() stays fast on the longest problems', () => {
  const c = fresh({ stackedDivision: true, repeatingBar: true });
  c.input('(((((1÷7+2^0.5→)×3−(4÷9)^2→)÷π+√2→)×5−6)+7' + '×8+9÷3'.repeat(6));
  assert.strictEqual(c.state().notice, null, 'fits in 100 keys');
  let t0 = Date.now();
  for (let i = 0; i < 20; i++) c.state();
  const typing = (Date.now() - t0) / 20;
  c.press('=');
  t0 = Date.now();
  c.setOptions({ answerAs: 'fraction' });   // (redraws the steps)
  c.state();
  const solved = Date.now() - t0;
  assert.ok(typing < 40, 'state() while typing: ' + typing + ' ms');
  assert.ok(solved < 250, 'state() after = with steps: ' + solved + ' ms');
  assert.ok(c.state().steps.length > 10);
});
test('a sheet of 100 lines stays fast', () => {
  const s = C.createSheet();
  for (let i = 0; i < 99; i++) s.input('ans+1⁄3=');
  const t0 = Date.now();
  s.state();
  assert.ok(Date.now() - t0 < 400, 'state() of a long sheet: ' + (Date.now() - t0) + ' ms');
});

// ---- 22. Review fixes (MATH-1 to MATH-13) ----------------------------------------------------------------------------
// Desmos values read on desmos.com/scientific.
test('MATH-1: long exact powers of an ordinary size are worked out as decimals', () => {
  assert.strictEqual(calc('1.01^1000').display, g('20_959.15564'));
  assert.strictEqual(calc('(1+0.065÷12)^(12×30)').display, '6.991797974');
  assert.strictEqual(calc('1.001^1000').display, '2.716923932');
  assert.strictEqual(calc('0.99^1000').display, '4.31712474 × 10⁻⁵');
  assert.strictEqual(calc('0.9^5000').display, '1.63135019 × 10⁻²²⁹');
  assert.strictEqual(calc('(1.0001^100→)^100').display, '2.718145927');
  assert.strictEqual(calc('(10÷9)^5000').mode, 'done');
});
test('MATH-1: huge powers are still caught, and exact ones stay exact', () => {
  assert.strictEqual(calc('9^9^9').error.code, 'toobig');
  assert.strictEqual(calc('0.5^99999').error.code, 'toosmall');
  assert.strictEqual(calc('2^1024').error.code, 'toobig');
  assert.strictEqual(calc('3^2000→÷3^1999').display, '3');
  assert.strictEqual(calc('1.1^2').answer.exact, true);
  assert.strictEqual(calc('1.01^1000').answer.exact, false);
});
test('MATH-2: an operator after "% of" keeps the % and says what is missing', () => {
  for (const op of ['+', '×', '÷', '^']) {
    const c = typed('10%');
    c.press(op);
    assert.strictEqual(c.state().expression.text, '10% of', op);
    if (op !== '+') assert.strictEqual(c.state().notice.message, 'Put a number after % of.', op);
  }
  assert.strictEqual(calc('10%+5').equation.text, '10% of 5 = 0.5', '+ changes nothing, as Desmos (10% of +5)');
  assert.strictEqual(calc('10%−5').equation.text, '10% of (−5) = −0.5');
});
test('MATH-3: ) with no ( open wraps what came before, as Desmos', () => {
  assert.strictEqual(calc('2+3)×4').equation.text, '(2 + 3) × 4 = 20');
  assert.strictEqual(calc('2×3+4)×5').equation.text, '(2 × 3 + 4) × 5 = 50');
  assert.strictEqual(typed('5)').state().expression.text, '(5)');
  assert.strictEqual(calc('√9+16)').equation.text, '√(9 + 16) = 5', 'inside a box, from the start of the box');
  assert.strictEqual(typed('2×').canPress(')'), false, 'not right after an operator');
  assert.strictEqual(typed('5').canPress(')'), true);
  const s = sheet('2+3)×4');
  assert.strictEqual(s.state().lines[0].result.text, '20');
});
test('MATH-4: ans next to a number multiplies, as Desmos', () => {
  const s = sheet('2+3=ans2');
  assert.strictEqual(s.state().lines[1].result.text, '10');
  const t = sheet('2+3=2ans');
  assert.strictEqual(t.state().lines[1].result.text, '10');
  const u = sheet('2+3=ans.5');
  assert.strictEqual(u.state().lines[1].result.text, '2.5');
  assert.strictEqual(calc('2+3=2ans').display, '10');
});
test('MATH-4: right after =, a digit still starts a new number (iPhone)', () => {
  assert.strictEqual(typed('4×4=√9=').state().equation.text, '√9 = 3');
  assert.strictEqual(typed('2+3=±7=').state().display, '7');
  assert.strictEqual(typed('2+3=7').state().display, '7');
});
test('MATH-5: with answers as fractions, the toggle shows the decimal and back', () => {
  const c = typed('1÷4=', { answerAs: 'fraction' });
  assert.strictEqual(c.state().display, '1/4');
  assert.strictEqual(c.state().answer.asFraction, true);
  assert.strictEqual(c.toggleFraction(), true);
  assert.strictEqual(c.state().display, '0.25');
  assert.strictEqual(c.state().answer.text, '0.25');
  assert.strictEqual(c.state().answer.asFraction, false);
  assert.strictEqual(c.state().equation.text, '1 ÷ 4 = 0.25');
  c.toggleFraction();
  assert.strictEqual(c.state().display, '1/4');
  const d = fresh();
  d.input('1÷4=');
  d.setOptions({ answerAs: 'fraction' });
  assert.strictEqual(d.state().display, '1/4');
  d.toggleFraction();
  assert.strictEqual(d.state().display, '0.25', 'switching the option after = and then toggling works too');
  const s = sheet('1+5⁄8', { answerAs: 'fraction' });
  assert.strictEqual(s.state().lines[0].result.text, '13/8');
  s.toggleFraction(0);
  assert.strictEqual(s.state().lines[0].result.text, '1.625');
  assert.strictEqual(s.state().lines[0].asFraction, false);
});
test('MATH-6: a number right before a fraction that isn\'t a mixed number shows its ×', () => {
  const h = calc('1a/b2↓3+4').equation.html;
  assert.ok(h.includes('<span class="ce-num">1</span><span class="ce-op">\u2009×\u2009</span><span class="ce-frac">'), h);
  assert.ok(calc('1.5a/b1↓2').equation.html.includes('<span class="ce-num">1.5</span><span class="ce-op">\u2009×\u2009</span>'));
  assert.ok(!typed('1a/b2↓3').state().expression.html.includes('×'), 'a mixed number has no ×');
  assert.ok(calc('1a/b2↓3+4').equation.mathml.includes('<mo>×</mo>'));
});
test('MATH-7: a digit right after a mixed number is refused, as Desmos', () => {
  const c = typed('1a/b2↓3→');
  assert.strictEqual(c.press('4'), false);
  assert.strictEqual(c.state().notice.code, 'adjacent');
  assert.strictEqual(c.state().notice.short, 'Put × between them');
  assert.strictEqual(c.press('.'), false);
  assert.strictEqual(calc('1a/b2↓3→×4').display, g('6.666666667'));
  assert.strictEqual(calc('a/b1↓2→3').display, '1.5', '½ then 3 still multiplies');
});
test('MATH-8: ⌫ on an empty bottom or root joins the digits, as Desmos', () => {
  const c = typed('1a/b2↓3');
  c.input('⌫⌫4');
  assert.strictEqual(c.state().expression.text, '124');
  const d = typed('ⁿ√3→8');
  d.input('⌫⌫5');
  assert.strictEqual(d.state().expression.text, '35', 'the root\'s small number stays');
  const e = typed('2+∛');
  e.press('⌫');
  assert.strictEqual(e.state().expression.text, '2 +', '∛ still goes whole');
});
test('MATH-9: plain or × 10ⁿ is decided from the true value at the edges, as Desmos', () => {
  assert.strictEqual(calc('0.000999999999999×1').display, '1 × 10⁻³');
  assert.strictEqual(calc('0.00099999999996×1').display, '1 × 10⁻³');
  assert.strictEqual(calc('0.000999999999995×1').display, '1 × 10⁻³');
  assert.strictEqual(calc('1000000000.4×1').display, '1 × 10⁹');
  assert.strictEqual(calc('1000000000.1×1').display, '1 × 10⁹');
  assert.strictEqual(calc('999999999.95×1').display, g('1_000_000_000'));
  assert.strictEqual(calc('1000000000×1').display, g('1_000_000_000'));
  assert.strictEqual(calc('0.00099999996×1', { digits: 7 }).display, '1 × 10⁻³');
  assert.strictEqual(calc('9999999.5×1', { digits: 7 }).display, '1 × 10⁷');
  assert.strictEqual(calc('0.001×1').display, '0.001');
});
test('MATH-10: step labels teach the right rule', () => {
  const neg = calc('−(−3)').steps;
  assert.strictEqual(neg[0].rule, 'O');
  assert.strictEqual(C.RULES.O, 'The opposite');
  const root = calc('√9+16').steps;
  assert.strictEqual(root[0].rule, 'AS');
  assert.strictEqual(root[0].inside, 'box');
  assert.strictEqual(C.RULES.G, 'Inside first');
  const par = calc('(2+3)×4').steps;
  assert.strictEqual(par[0].inside, 'parens');
  const lone = calc('2(3)(4)').steps.map(x => x.text);
  assert.deepStrictEqual(lone, ['2(3)(4)', '6(4)', '24']);
  assert.strictEqual(calc('2(3)(4)').steps[0].work.text, '2(3) = 6');
  assert.strictEqual(calc('(3)').steps.length, 2, 'a lone (3) still works out');
  assert.strictEqual(calc('√(4)').display, '2');
});
test('MATH-11: a line that is just a mixed number can toggle to its fraction', () => {
  const s = sheet('1a/b2↓3');
  assert.strictEqual(s.state().lines[0].kind, 'number');
  assert.strictEqual(s.state().lines[0].canToggle, true);
  assert.strictEqual(s.state().lines[0].result, null);
  s.toggleFraction(0);
  assert.strictEqual(s.state().lines[0].result.text, '5/3');
});
test('MATH-12: a 0th root says so', () => {
  const r = calc('ⁿ√0→5');
  assert.strictEqual(r.error.code, 'zeroroot');
  assert.strictEqual(r.display, 'No 0th root');
});
test('MATH-13: ± right after ans on a sheet makes it negative, and back', () => {
  const s = sheet('2+3=ans±');
  assert.strictEqual(s.state().lines[1].result.text, '−5');
  s.press('±');
  assert.strictEqual(s.state().lines[1].result.text, '5');
});
test('BOX-1: state().boxKey names the key whose box holds the cursor', () => {
  assert.strictEqual(typed('√9+16').state().boxKey, 'sqrt');
  assert.strictEqual(typed('∛8').state().boxKey, 'cbrt');
  assert.strictEqual(typed('ⁿ√3').state().boxKey, 'root');
  assert.strictEqual(typed('2^3').state().boxKey, 'power');
  assert.strictEqual(typed('a/b1↓').state().boxKey, 'fraction');
  assert.strictEqual(typed('(2+').state().boxKey, 'open');
  assert.strictEqual(typed('2²').state().boxKey, null);
  assert.strictEqual(typed('√9→').state().boxKey, null);
  assert.strictEqual(sheet('√9').state().lines[0].boxKey, 'sqrt');
});
test('NAMES-1: one spoken name per key', () => {
  assert.strictEqual(C.KEYS.percent.name, 'percent of');
  assert.strictEqual(C.KEYS.root.name, 'nth root');
  assert.strictEqual(C.KEYS.right.name, 'move right');
});

// ---- 23. Faint digit groups (the 21Board widget's): 1,234,567 with each comma its own quiet element ---------------------
// separators: 'faint' writes a comma between groups of three, as textbooks do, drawn in HTML as <span class="ce-sep">,</span>
// so the widget can color it softly. Plain text (text, display, speech, aria-labels, MathML) keeps an ordinary comma.
const FAINT = { separators: 'faint' };
const SEP_HTML = '<span class="ce-sep">,</span>';
const seps = html => (html.match(/<span class="ce-sep">,<\/span>/g) || []).length;
const untag = html => html.replace(/<[^>]*>/g, '').replace(/ /g, ' ');
test('faint: the display string and the text keep a plain comma', () => {
  const c = typed('1234567', FAINT);
  assert.strictEqual(c.state().display, '1,234,567');
  assert.strictEqual(calc('1234567×1', FAINT).display, '1,234,567');
  assert.strictEqual(calc('1234567.89+1', FAINT).equation.text, '1,234,567.89 + 1 = 1,234,568.89');
});
test('faint: each comma in the HTML is a separate ce-sep element, the digits around it unchanged', () => {
  const s = typed('1234567', FAINT).state();
  assert.strictEqual(seps(s.displayHtml), 2);
  assert.strictEqual(untag(s.displayHtml), '1,234,567');
  assert.ok(s.displayHtml.includes('1' + SEP_HTML + '234' + SEP_HTML + '567'), s.displayHtml);
  assert.strictEqual(seps(s.expression.html), 2);
});
test('faint: only the whole part is grouped', () => {
  const s = typed('1234567.891=', FAINT).state();
  assert.strictEqual(s.display, '1,234,567.891');
  assert.strictEqual(seps(s.displayHtml), 2);
  assert.ok(!/891<span class="ce-sep">/.test(s.equation.html) && /\.891/.test(s.equation.html), s.equation.html);
  assert.strictEqual(seps(typed('999', FAINT).state().displayHtml), 0);
  assert.strictEqual(seps(typed('1000', FAINT).state().displayHtml), 1);
});
test('faint: aria-labels and speech say a plain comma', () => {
  const s = typed('1234567.89+1=', FAINT).state();
  assert.ok(s.equation.html.includes('aria-label="1,234,567.89 plus 1 equals 1,234,568.89"'), s.equation.html.slice(0, 160));
  assert.strictEqual(s.equation.speech, '1,234,567.89 plus 1 equals 1,234,568.89');
  assert.ok(!/aria-label="[^"]*ce-sep/.test(s.equation.html));
});
test('faint: MathML keeps a plain comma (no spans inside <mn>)', () => {
  const m = typed('1234567+1=', FAINT).state().equation.mathml;
  assert.ok(m.includes('<mn>1,234,567</mn>') && m.includes('<mn>1,234,568</mn>') && !m.includes('ce-sep'), m);
});
test('faint: answers, fractions, mixed numbers, steps, history and lines are grouped the same way', () => {
  const c = typed('1000×1000=', FAINT), s = c.state();
  assert.strictEqual(seps(s.answer.html), 2);
  assert.strictEqual(seps(s.history[0].equation.html), 4);
  assert.strictEqual(s.history[0].equation.text, '1,000 × 1,000 = 1,000,000');
  const f = calc('1÷1234567', Object.assign({ answerAs: 'fraction' }, FAINT));
  assert.strictEqual(f.display, '1/1,234,567');
  assert.strictEqual(seps(f.answer.html), 2);
  const m = calc('2000a/b1↓3', Object.assign({ answerAs: 'mixed' }, FAINT));
  assert.ok(seps(m.answer.html) >= 1, m.answer.html);
  const st = calc('1000+2000×3', FAINT).steps;
  assert.ok(seps(st[0].html) >= 2 && seps(st[0].work.html) >= 1 && seps(st[st.length - 1].html) === 1, st.map(x => x.html).join(' | '));
  const sh = sheet('1234×1000', FAINT).state();
  assert.strictEqual(sh.lines[0].result.text, '1,234,000');
  assert.strictEqual(seps(sh.lines[0].result.html), 2);
});
test('faint: scientific notation and small numbers have no groups', () => {
  const s = calc('2^40', FAINT);
  assert.strictEqual(s.display, '1.09951163 × 10¹²');
  assert.strictEqual(seps(s.answer.html), 0);
  assert.strictEqual(seps(calc('0.0012345×1', FAINT).answer.html), 0);
});
test('faint: a choice readOptions keeps; the other modes still work and draw no ce-sep', () => {
  assert.strictEqual(C.readOptions({ separators: 'faint' }).separators, 'faint');
  assert.strictEqual(C.DEFAULTS.separators, 'space');
  assert.strictEqual(fresh(FAINT).options().separators, 'faint');
  const c = fresh(FAINT); c.setOptions({ separators: 'comma' }); c.input('1234567');
  assert.strictEqual(c.state().display, '1,234,567');
  assert.strictEqual(seps(c.state().displayHtml), 0);
  for (const [sep, want] of [['space', g('1_234_567')], ['comma', '1,234,567'], ['none', '1234567']]) {
    const s = typed('1234567', { separators: sep }).state();
    assert.strictEqual(s.display, want, sep);
    assert.strictEqual(seps(s.displayHtml), 0, sep);
    assert.strictEqual(untag(s.displayHtml), want, sep);
  }
});
test('faint: the stylesheet colors ce-sep with the board’s muted color, softened', () => {
  const rule = (/\.ce-sep\s*\{([^}]*)\}/.exec(C.CSS) || [])[1] || '';
  assert.ok(/color:\s*var\(--b21-muted/.test(rule) && /opacity:\s*0?\.\d+/.test(rule), rule);
});
test('faint: powers keep their small digits (2¹⁰⁰⁰ and a grouped exponent)', () => {
  assert.strictEqual(calc('2^10', FAINT).equation.text, '2¹⁰ = 1,024');
  assert.strictEqual(calc('1^1000', FAINT).equation.text, '1¹⁰⁰⁰ = 1');
});

// ---- Results ----------------------------------------------------------------------------------------------------------
for (const f of failures) console.log('FAIL ' + f);
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
