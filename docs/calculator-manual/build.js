#!/usr/bin/env node
/*
 * Builds the Calculator's manual: dist/page.html, one page with nothing to load from anywhere.
 *
 *   node docs/calculator-manual/build.js
 *
 * It takes page-src.html and fills its placeholders from the repo, so the page always shows the Calculator as it
 * ships:
 *   <!--@WIDGET-->  widgets/calculator/index.html, its two scripts (sdk/board21.js, calc-engine.js) inlined, for the
 *                   live demo's frame (srcdoc). The page plays the board's side of the SDK for that one window.
 *   /*@ENGINE*\/     calc-engine.js again, for the page's own math examples
 *   /*@CECSS*\/      the engine's stylesheet, scoped to .cx
 *   /*@WINDOW*\/     the widget's name, version and window size, from its manifest
 *   <!--@OPENS--> <!--@SMALLEST--> <!--@HISTORY--> <!--@VERSION-->   facts from the same files and sw.js
 *   <!--@TOTAL--> <!--@SAME--> <!--@WORDS--> <!--@APART-->   the Desmos figures: tests/calc-engine.js's table of
 *                   answers read from Desmos, typed into the engine with the widget's own options
 *
 * It stops with an error on a missing file, a placeholder left over, text that would end a <script> early,
 * document tags, alert/confirm/prompt, or a new difference from Desmos that the page doesn't explain.
 */
'use strict';
const fs = require('fs'), path = require('path');
const HERE = __dirname, ROOT = path.join(HERE, '..', '..'), DIST = path.join(HERE, 'dist');

function fail(msg) { console.error('build.js: ' + msg); process.exit(1); }
function read(rel, base = ROOT) {
  const f = path.join(base, rel);
  try { return fs.readFileSync(f, 'utf8'); } catch (e) { fail('missing file ' + path.relative(ROOT, f)); }
}
const once = (text, find, what) => {
  const n = text.split(find).length - 1;
  if (n !== 1) fail(`${what}: expected one ${JSON.stringify(find)}, found ${n}`);
};

const src = read('page-src.html', HERE);
const widget = read('widgets/calculator/index.html');
const engine = read('widgets/calculator/calc-engine.js');
const sdk = read('sdk/board21.js');
const tests = read('tests/calc-engine.js');
const sw = read('sw.js');

// ---- Script text. "</script" would end the element early: inside JavaScript (a comment, a string, a regex) "<\/script"
// means the same, so it is written that way. "<!--" can start the parser's escaped state, so it stops the build.
function scriptSafe(js, what) {
  const out = js.replace(/<\/(script)/gi, '<\\/$1');
  if (/<!--|<\/script/i.test(out)) fail(what + ': its script holds "<!--"');
  return out;
}

// ---- The widget's document, its scripts inlined
const SDK_TAG = '<script src="../../sdk/board21.js"></script>', ENGINE_TAG = '<script src="calc-engine.js"></script>';
once(widget, SDK_TAG, 'widgets/calculator/index.html');
once(widget, ENGINE_TAG, 'widgets/calculator/index.html');
// (Its markup, without what its scripts say, may load nothing else.)
const markup = widget.replace(SDK_TAG, '').replace(ENGINE_TAG, '').replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
if (/<script[^>]*\ssrc=|<link\b|<iframe\b|<img\b|url\(/i.test(markup)) fail('the widget loads a file the build doesn\'t inline');
const doc = widget
  .replace(SDK_TAG, () => '<script>\n' + scriptSafe(sdk, 'sdk/board21.js') + '\n</script>')
  .replace(ENGINE_TAG, () => '<script>\n' + scriptSafe(engine, 'calc-engine.js') + '\n</script>');
// Every script of the widget's own must end where it should.
for (const m of widget.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (/<!--|<\/script/i.test(m[1])) fail('the widget\'s own script holds "<!--"');
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- Facts from the widget
let manifest;
try { manifest = JSON.parse((/<script type="application\/json" id="board21-widget">([\s\S]*?)<\/script>/.exec(widget) || [])[1]); } catch (e) { manifest = null; }
const win = manifest && manifest.window;
if (!win || !(win.width > 0 && win.height > 0 && win.minWidth > 0 && win.minHeight > 0)) fail('no window size in the widget\'s manifest');
const historySize = +((/historySize: (\d+)/.exec(widget) || [])[1]);
if (!historySize) fail('no historySize in the widget');
const version = (/^const VERSION = '([^']+)'/m.exec(sw) || [])[1];
if (!version) fail('no VERSION in sw.js');

// ---- The Desmos figures. The widget's options outside Test practice; if the widget changes them, check the
// figures and the page's "Different on purpose" against the new ones, then change both lines here.
const OPTIONS_LINE = "{ digits: 10, keys: null, toggle: true, answerAs: cfg.fractions ? 'fraction' : 'decimal', slash: cfg.advanced ? 'fraction' : 'divide', percent: cfg.percent }";
const CREATE_LINE = "E.create(Object.assign({ separators: 'faint', historySize: " + historySize + " }, engineOptions()))";
once(widget, OPTIONS_LINE, 'the widget\'s engine options');
once(widget, CREATE_LINE, 'the widget\'s engine');
const OPTIONS = { separators: 'faint', historySize, digits: 10, keys: null, toggle: true, answerAs: 'decimal', slash: 'divide', percent: 'of' };
// Where the widget differs from Desmos on purpose, each kind explained under "Different on purpose".
const ON_PURPOSE = {
  '10^−400': 'Too small to show (Desmos shows 0)',
  '×2': 'one problem at a time: an operator first works on the 0 on screen',
  '÷5': 'one problem at a time: an operator first works on the 0 on screen',
  '+5': 'one problem at a time: an operator first works on the 0 on screen',
  '1a/b2↓3': 'one problem at a time: = on a lone number shows it',
  '−1a/b1↓2': 'one problem at a time: = on a lone number shows it'
};
const table = (/\nconst DESMOS = \[\n([\s\S]*?)\n\];/.exec(tests) || [])[1];
if (!table) fail('no DESMOS table in tests/calc-engine.js');
const rows = table.split('\n').map(line => {
  try { return JSON.parse(line.replace(/\s*\/\/.*$/, '').replace(/,\s*$/, '')); } catch (e) { fail('tests/calc-engine.js: a DESMOS row isn\'t [keys, answer, fraction]: ' + line); }
});
const E = require(path.join(ROOT, 'widgets/calculator/calc-engine.js'));
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−' };
const canon = s => s == null ? null : String(s).replace(/[\s  ,]/g, '').replace(/×10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, e) => '×10^(' + Array.from(e, c => SUP[c]).join('') + ')');
const figures = { total: rows.length, same: 0, words: 0, apart: 0 };
for (const [keys, value, frac] of rows) {
  const c = E.create(OPTIONS);
  c.input(keys);
  if (c.state().mode === 'edit') c.press('equals');
  const s = c.state();
  let f = null;
  if (s.mode === 'done' && s.answer && s.answer.canToggle) { c.toggleFraction(); f = c.state().display; c.toggleFraction(); }
  const valueSame = value === null ? s.mode !== 'done' : s.mode === 'done' && canon(s.display) === canon(value);
  const fracSame = !!frac === !!f && (!frac || canon(frac) === canon(f));
  if (s.mode === 'error' && value === 'undefined') figures.words++;
  else if (valueSame && fracSame) figures.same++;
  else if (Object.prototype.hasOwnProperty.call(ON_PURPOSE, keys)) figures.apart++;
  else fail(`a new difference from Desmos: ${keys} is ${s.mode === 'done' ? s.display : s.mode}${f ? ' (⇄ ' + f + ')' : ''}, Desmos ${value}${frac ? ' (⇄ ' + frac + ')' : ''}. Explain it on the page and in ON_PURPOSE, or fix the engine.`);
}

// ---- The engine's stylesheet, every selector under .cx (the page's examples)
const scoped = E.CSS.trim().split('\n').map(line => {
  const m = line.match(/^([^@{][^{]*)\{(.*)$/);
  if (!m) {
    const media = line.match(/^(@media[^{]*\{\s*)([^{]+)\{(.*)$/);   // @media (…) { .ce-cursor { … } }
    if (media) return media[1] + media[2].split(',').map(s => '.cx ' + s.trim()).join(', ') + ' {' + media[3];
    return line;
  }
  return m[1].split(',').map(s => '.cx ' + s.trim()).join(', ') + ' {' + m[2];
}).join('\n');

// ---- The page
const fill = {
  '<!--@WIDGET-->': attr(doc),
  '/*@ENGINE*/': scriptSafe(engine.trim(), 'calc-engine.js'),
  '/*@CECSS*/': scoped,
  '/*@WINDOW*/': JSON.stringify({ id: manifest.id, name: manifest.name, version: manifest.version, width: win.width, height: win.height, minWidth: win.minWidth, minHeight: win.minHeight }),
  '<!--@OPENS-->': `${win.width} × ${win.height}`,
  '<!--@SMALLEST-->': `${win.minWidth} × ${win.minHeight}`,
  '<!--@HISTORY-->': String(historySize),
  '<!--@VERSION-->': version,
  '<!--@TOTAL-->': String(figures.total),
  '<!--@SAME-->': String(figures.same),
  '<!--@WORDS-->': String(figures.words),
  '<!--@APART-->': String(figures.apart)
};
let out = src;
for (const [k, v] of Object.entries(fill)) {
  if (!out.includes(k)) fail('page-src.html has no ' + k);
  out = out.split(k).join(v);
}
const left = /\/\*@[A-Z]+\*\/|<!--@[A-Z]+-->/.exec(out);
if (left) fail('a placeholder is left: ' + left[0]);
if (!out.startsWith('<title>21Board Calculator</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>')) fail('the page must start with its <title>, the viewport-fit meta, then <style>');
const tag = /<(!doctype|html|head|body)[\s>]/i.exec(out);
if (tag) fail('document tag <' + tag[1] + '>: the page is wrapped in one when published');
const api = /\b(alert|confirm|prompt)\s*\(|window\.print\b/.exec(out);
if (api) fail(api[0] + ' does nothing in the viewer');
for (const m of out.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (/<!--|<\/script/i.test(m[1])) fail('a script on the page holds "<!--"');
if (/<script[^>]*\ssrc=|<link\b|<iframe[^>]*\ssrc=|<img\b|url\(/i.test(out.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>').replace(/ data-doc="[^"]*"/, ''))) fail('the page loads a file');
if (out.length > 16 * 1024 * 1024) fail('the page is over 16 MB');

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'page.html'), out);
console.log(`dist/page.html, ${(out.length / 1024).toFixed(0)} KB. Desmos: ${figures.same} of ${figures.total} the same, ${figures.words} in words, ${figures.apart} on purpose.`);
console.log('Publish ' + path.join(DIST, 'page.html') + ' to https://claude.ai/artifact/8p3dg4r8xSduSD2DmNVjXB. It has no other files.');
