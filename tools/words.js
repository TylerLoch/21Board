#!/usr/bin/env node
/*
 * Checks every words table, lays them out, and moves words to and from the review Sheet.
 *
 *   node tools/words.js                       checks every table: each problem, then a summary (exit 1 on any problem)
 *   node tools/words.js --format [file…]      lays out the words files (all of them without a list) and the SDK's
 *                                             Common words, and rewrites each file's list of the common words it uses
 *   node tools/words.js --list <id>           every row of one table (common: the common words)
 *   node tools/words.js --glossary <id>       each row beside the docs/GLOSSARY.md entries its English uses
 *   node tools/words.js --sheet <id>          one Sheet tab as TSV
 *   node tools/words.js --apply <file.tsv>    brings Sheet edits back into the files, then checks
 *
 * A table is a widget's words.js (or an inline <script> that is one Board21.words(…) call in its page), the common
 * words in sdk/board21.js, and the starter's (widgets/_template/index.html, inline). A widget with a table lists its
 * languages in the registry (the starter, in its manifest). The rules: docs/WIDGET-SDK.md, "Languages", and
 * docs/TRANSLATING.md.
 * It reads the SDK's own "// #region Words" (as tests/words.js does), so the two never disagree.
 * Required as a module (tests/words.js), it writes nothing. No dependencies.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SDK = 'sdk/board21.js';
const HINTS = { one: '1. Russian and Ukrainian: 1, 21, 31.', few: '2-4, 22-24', many: '0, 5-20, 25-30. Spanish: 1000000.', other: 'Every other count. Russian and Ukrainian: 1.5.' };
const COLUMNS = ['Key', 'Form', 'Hint', 'Section', 'Note', 'Max', 'English', 'Español', 'Русский', 'Українська', 'OK es', 'OK ru', 'OK uk', 'Comment', 'Hash'];
const META = ['note', 'max', 'fill', 'to'];
const SECTIONS = ['window', 'board', 'dynamic'];
const FORM_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];
const LIST = /,\s+[^,]*?[^,\s]\s+(and|or|nor)\s/i;   // (tests/suites/board.js, the Oxford comma)
const HTML_ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
// Words we never use, by stem, in their own language. es tonto means dumb. The rest carry a sexual sense in
// children's text (docs/GLOSSARY.md).
const NEVER = { es: ['tont', 'atont', 'excitad'], ru: ['возбужд'], uk: ['збудж'] };
const DATA_T = /\bdata-t(-aria-label|-title|-placeholder|-alt|-aria-description)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// ---- Files, with changes held in memory (opts.files: { 'path': text, or null for none }).
function reader(opts = {}) {
  const root = opts.root || ROOT, over = opts.files || {};
  const has = rel => (Object.prototype.hasOwnProperty.call(over, rel) ? over[rel] != null : fs.existsSync(path.join(root, rel)));
  const read = rel => (Object.prototype.hasOwnProperty.call(over, rel) ? over[rel] : fs.readFileSync(path.join(root, rel), 'utf8'));
  return { root, has, read };
}
const lineAt = (text, i) => text.slice(0, i).split('\n').length;

// ---- The SDK's Words region.
function loadRegion(src) {
  const start = src.indexOf('// #region Words'), end = src.indexOf('// #endregion Words', start);
  if (start < 0 || end < 0) throw new Error('Its // #region Words markers are missing.');
  return vm.compileFunction(src.slice(start, end) + '\nreturn Words;', [], { filename: 'board21.js#words' })();
}
const sentence = s => (/[.!?]$/.test(s) ? s : s + '.');
// The Words region, or one message that names the SDK's file once.
function sdkWords(src) {
  try { return loadRegion(src); } catch (e) { throw new Error(`${SDK}: the Words region can’t be read. ${sentence(String(e && e.message || e))}`); }
}
// A text in quotes that ends a sentence: no second period after one that ends in its own.
const endQuote = s => '“' + s + '”' + (/[.!?…]$/.test(s) ? '' : '.');

// ---- A small reader for words files: tokens, then the one call's object literal, with each key's line.
function lex(text) {
  const toks = [];
  let i = 0, line = 1;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const j = text.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; line += (text.slice(i, e).match(/\n/g) || []).length; i = e; continue; }
    const s = i, l = line;
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1, out = '';
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') {
          const d = text[j + 1];
          const SIMPLE = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
          if (d === 'u' && text[j + 2] === '{') { const k = text.indexOf('}', j); out += String.fromCodePoint(parseInt(text.slice(j + 3, k), 16)); j = k + 1; continue; }
          if (d === 'u') { out += String.fromCharCode(parseInt(text.slice(j + 2, j + 6), 16)); j += 6; continue; }
          if (d === 'x') { out += String.fromCharCode(parseInt(text.slice(j + 2, j + 4), 16)); j += 4; continue; }
          if (d === '\n') { line++; j += 2; continue; }
          out += Object.prototype.hasOwnProperty.call(SIMPLE, d) ? SIMPLE[d] : d; j += 2; continue;
        }
        if (text[j] === '\n') line++;
        out += text[j]; j++;
      }
      toks.push({ t: c === '`' ? 'tpl' : 'str', v: out, s, e: j + 1, line: l });
      i = j + 1; continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(text.slice(i, i + 200));
    if (id) { toks.push({ t: 'id', v: id[0], s, e: i + id[0].length, line: l }); i += id[0].length; continue; }
    const num = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)/.exec(text.slice(i, i + 60));
    if (num) { toks.push({ t: 'num', v: Number(num[0]), s, e: i + num[0].length, line: l }); i += num[0].length; continue; }
    toks.push({ t: 'p', v: c, s, e: i + 1, line: l }); i++;
  }
  return toks;
}
function parseValue(toks, k) {
  const tok = toks[k.i];
  if (!tok) throw new Error('end');
  if (tok.t === 'p' && tok.v === '{') {
    k.i++;
    const node = { type: 'obj', entries: [], s: tok.s, line: tok.line };
    for (;;) {
      const t = toks[k.i];
      if (!t) throw new Error('end');
      if (t.t === 'p' && t.v === '}') { node.e = t.e; k.i++; return node; }
      if (!(t.t === 'str' || t.t === 'id' || t.t === 'num')) throw new Error('key');
      k.i++;
      if (!(toks[k.i] && toks[k.i].t === 'p' && toks[k.i].v === ':')) throw new Error('colon');
      k.i++;
      const child = parseValue(toks, k);
      node.entries.push({ key: String(t.v), keyTok: t, node: child, line: t.line, s: t.s, e: child.e });
      const sep = toks[k.i];
      if (sep && sep.t === 'p' && sep.v === ',') { k.i++; continue; }
      if (sep && sep.t === 'p' && sep.v === '}') continue;
      throw new Error('separator');
    }
  }
  if (tok.t === 'p' && tok.v === '[') {
    k.i++;
    const node = { type: 'arr', items: [], s: tok.s, line: tok.line };
    for (;;) {
      const t = toks[k.i];
      if (!t) throw new Error('end');
      if (t.t === 'p' && t.v === ']') { node.e = t.e; k.i++; return node; }
      node.items.push(parseValue(toks, k));
      const sep = toks[k.i];
      if (sep && sep.t === 'p' && sep.v === ',') { k.i++; continue; }
      if (sep && sep.t === 'p' && sep.v === ']') continue;
      throw new Error('separator');
    }
  }
  if (tok.t === 'p' && tok.v === '-' && toks[k.i + 1] && toks[k.i + 1].t === 'num') { k.i += 2; return { type: 'val', value: -toks[k.i - 1].v, s: tok.s, e: toks[k.i - 1].e, line: tok.line }; }
  if (tok.t === 'str' || tok.t === 'num') { k.i++; return { type: 'val', value: tok.v, s: tok.s, e: tok.e, line: tok.line }; }
  if (tok.t === 'id' && /^(true|false|null)$/.test(tok.v)) { k.i++; return { type: 'val', value: JSON.parse(tok.v), s: tok.s, e: tok.e, line: tok.line }; }
  throw new Error('value');
}
function valueOf(node) {
  if (node.type === 'val') return node.value;
  if (node.type === 'arr') return node.items.map(valueOf);
  const o = {};
  for (const en of node.entries) if (en.key !== '__proto__') o[en.key] = valueOf(en.node);
  return o;
}
const blankBetween = (text, a, b) => /\n[ \t]*\n/.test(text.slice(a, b));

// A table's model, from its object literal: its sections and rows in order, each with its lines.
function modelOf(text, root) {
  const sections = [];
  for (const en of root.entries) {
    const sec = { name: en.key, line: en.line };
    if (en.node.type === 'obj' && en.key !== 'dynamic') {
      let prevEnd = null;
      sec.rows = en.node.entries.map((r, i) => {
        const row = { key: r.key, line: r.line, blank: i > 0 && blankBetween(text, prevEnd, r.s), value: valueOf(r.node), lines: {}, isObj: r.node.type === 'obj' };
        prevEnd = r.e;
        if (r.node.type === 'obj') for (const f of r.node.entries) row.lines[f.key] = f.line;
        return row;
      });
    } else if (en.node.type === 'arr') sec.items = en.node.items.map(it => ({ value: valueOf(it), line: it.line }));
    else sec.value = valueOf(en.node);
    sections.push(sec);
  }
  return { sections };
}

// Reads a words file (or inline table): one Board21.words(…) call of plain text, numbers, lists, and braces, and
// comments. The file never runs. It is only compiled, which runs nothing, to find the line a JavaScript error is on;
// then the tokens prove it holds nothing else. Returns { model, header, trailer } or { problem }.
function readTable(rel, text, offset = 0) {
  const at = n => `${rel} line ${n + offset}`;
  try { new vm.Script(text, { filename: rel }); } catch (e) {
    if (e && e.name === 'SyntaxError') {
      const m = /:(\d+)\n/.exec(String(e.stack || '')), n = m ? +m[1] : 1;
      const src = (text.split('\n')[n - 1] || '').replace(/\/\/.*$/, '');
      const quotes = (src.replace(/\\./g, '').match(/'/g) || []).length;
      // A ' inside the text: a word's apostrophe, or a third quote on the line. A single one is a text never closed.
      return { problem: /\p{L}'\p{L}/u.test(src) || (quotes % 2 && quotes > 1) ? `${at(n)}: a ' ends the text early. Type ’ instead.` : `${at(n)}: this line can’t be read. Check its quotes, commas, and braces.` };
    }
    return { problem: `${rel}: a words file holds one Board21.words(…) call and comments. Nothing else.` };
  }
  const toks = lex(text), k = { i: 0 };
  const isTok = (t, type, v) => t && t.t === type && t.v === v;
  let root = null;
  try {
    if (!isTok(toks[0], 'id', 'Board21') || !isTok(toks[1], 'p', '.') || !isTok(toks[2], 'id', 'words') || !isTok(toks[3], 'p', '(')) throw new Error('shape');
    k.i = 4;
    root = parseValue(toks, k);
    if (root.type !== 'obj' || !isTok(toks[k.i], 'p', ')')) throw new Error('shape');
    k.i++;
    if (isTok(toks[k.i], 'p', ';')) k.i++;
    if (k.i !== toks.length) throw new Error('shape');
  } catch (e) { return { problem: `${rel}: a words file holds one Board21.words(…) call and comments. Nothing else.` }; }
  const close = toks[k.i - 1];
  return { model: modelOf(text, root), header: text.slice(0, toks[0].s), trailer: text.slice(close.e), offset };
}

// A words file's table as the SDK gets it, { window, board, dynamic }, read without running it.
function parse(rel, text) {
  const t = readTable(rel, text);
  if (t.problem) throw new Error(t.problem);
  const out = {};
  for (const s of t.model.sections) out[s.name] = s.rows ? Object.fromEntries(s.rows.map(r => [r.key, r.value])) : s.items ? s.items.map(x => x.value) : s.value;
  return out;
}

// The common words: `var COMMON_WORDS = {…};` inside // #region Common words in the SDK.
function commonRegion(src) {
  const start = src.indexOf('// #region Common words'), endMark = src.indexOf('// #endregion Common words', start);
  if (start < 0 || endMark < 0) return null;
  const s = src.lastIndexOf('\n', start) + 1, e = src.indexOf('\n', endMark);
  return { s, e: e < 0 ? src.length : e, text: src.slice(s, e < 0 ? src.length : e), line: lineAt(src, s) };
}
function readCommon(src) {
  const reg = commonRegion(src);
  if (!reg) return { problem: `${SDK}: the Common words region is missing.` };
  const toks = lex(reg.text), k = { i: 0 };
  const v = toks.findIndex((t, i) => t.t === 'id' && t.v === 'var' && toks[i + 1] && toks[i + 1].v === 'COMMON_WORDS');
  try {
    if (v < 0 || toks[v + 2].v !== '=') throw new Error('shape');
    k.i = v + 3;
    const root = parseValue(toks, k);
    if (root.type !== 'obj' || !(toks[k.i] && toks[k.i].v === ';')) throw new Error('shape');
    const varLine = reg.text.lastIndexOf('\n', toks[v].s) + 1;
    return { model: modelOf(reg.text, root), region: reg, indent: reg.text.slice(varLine, toks[v].s), head: reg.text.slice(0, varLine), tail: reg.text.slice(toks[k.i].e), offset: reg.line - 1 };
  } catch (e) { return { problem: `${SDK}: Common words holds one var COMMON_WORDS = { window: { … } }; and comments.` }; }
}

// ---- Layout (source spec §1.2): note, max, fill, and to on a row's first line, then en, es, ru, and uk each on its own
// line; rows with only English on one line; a blank line between groups, as the file had.
const IDENT = /^[A-Za-z_$][\w$]*$/;
const q = s => "'" + String(s).replace(/[\\'\n\r\t\u2028\u2029]/g, c => ({ '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t', '\u2028': '\\u2028', '\u2029': '\\u2029' })[c]) + "'";
const keyText = k => (IDENT.test(k) ? k : q(k));
function lit(v, forms) {
  if (typeof v === 'string') return q(v);
  if (v === null || typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return '[' + v.map(x => lit(x)).join(', ') + ']';
  let keys = Object.keys(v);
  if (forms) keys = FORM_ORDER.filter(f => keys.includes(f)).concat(keys.filter(f => !FORM_ORDER.includes(f)));
  return keys.length ? '{ ' + keys.map(k => keyText(k) + ': ' + lit(v[k], false)).join(', ') + ' }' : '{}';
}
function rowText(row, ind, LANGS) {
  const v = row.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ind + keyText(row.key) + ': ' + lit(v);
  const keys = Object.keys(v);
  const meta = META.filter(f => keys.includes(f)).concat(keys.filter(f => !META.includes(f) && !LANGS.includes(f)));
  const langs = LANGS.filter(l => keys.includes(l));
  const field = f => keyText(f) + ': ' + lit(v[f], LANGS.includes(f));
  if (!langs.length || (langs.length === 1 && langs[0] === 'en')) {
    const all = meta.concat(langs).map(field);
    return ind + keyText(row.key) + ': ' + (all.length ? '{ ' + all.join(', ') + ' }' : '{}');
  }
  const first = ind + keyText(row.key) + ': {' + (meta.length ? ' ' + meta.map(field).join(', ') + ',' : '');
  return first + '\n' + langs.map(l => ind + '  ' + field(l)).join(',\n') + ' }';
}
function tableText(model, ind, LANGS) {
  const order = SECTIONS.filter(n => model.sections.some(s => s.name === n)).map(n => model.sections.find(s => s.name === n))
    .concat(model.sections.filter(s => !SECTIONS.includes(s.name)));
  const out = order.map(sec => {
    if (sec.rows) {
      if (!sec.rows.length) return ind + '  ' + keyText(sec.name) + ': {}';
      return ind + '  ' + keyText(sec.name) + ': {\n' + sec.rows.map((r, i) => (i && r.blank ? '\n' : '') + rowText(r, ind + '    ', LANGS)).join(',\n') + '\n' + ind + '  }';
    }
    return ind + '  ' + keyText(sec.name) + ': ' + lit(sec.items ? sec.items.map(x => x.value) : sec.value);
  });
  return '{\n' + out.join(',\n') + '\n' + ind + '}';
}
const tidyLines = text => text.split('\n').map(l => l.replace(/[ \t]+$/, ''));
function fileText(t, Words, used) {
  const head = tidyLines(t.header);
  while (head.length && !head[head.length - 1]) head.pop();
  const tail = tidyLines(t.trailer.replace(/^\s*;?/, ''));
  const keep = [];
  for (let i = 0; i < tail.length; i++) {
    if (/^\/\/ Common words used here/.test(tail[i])) { while (i + 1 < tail.length && /^\/\/\s*b21\./.test(tail[i + 1])) i++; continue; }
    if (tail[i]) keep.push(tail[i]);
  }
  const common = Words.COMMON_WORDS.window, keys = Object.keys(common).filter(k => used.includes(k));
  const width = Math.max(0, ...keys.map(k => k.length)) + 2;
  const show = v => (typeof v === 'string' ? v : v && typeof v === 'object' ? v.other || '' : '');
  const list = keys.length ? ['// Common words used here (edit them in sdk/board21.js):'].concat(keys.map(k => '// ' + k.padEnd(width) + ['en', 'es', 'ru', 'uk'].map(l => show(common[k][l])).join(' | '))) : [];
  return (head.length ? head.join('\n') + '\n' : '') + 'Board21.words(' + tableText(t.model, '', Words.LANGS) + ');\n' + keep.concat(list).map(l => l + '\n').join('');
}
function commonText(src, c, Words) {
  const head = tidyLines(c.head).join('\n');
  const region = head + c.indent + 'var COMMON_WORDS = ' + tableText(c.model, c.indent, Words.LANGS) + ';\n' + c.indent + '// #endregion Common words';
  return src.slice(0, c.region.s) + region + src.slice(c.region.e);
}

// ---- The widgets and their tables.
function registry(r) {
  const box = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext('var self = this;', box);
  vm.runInContext(r.read('widgets/registry.js'), box, { filename: 'widgets/registry.js', timeout: 1000 });
  return Array.from(box.BOARD21_WIDGETS || []).filter(w => w && !w.external);
}
// Every table: { id, file, files (the widget's own, with its table taken out), text, offset, langs (the languages it
// lists), read: readTable's result }. Last, the starter's (id _template), with its manifest's languages.
const TEMPLATE = 'widgets/_template/index.html';
function inlineTable(r, id, entry, files, langs) {
  const html = r.read(entry);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    if (!/^\s*Board21\.words\(/.test(m[1])) continue;
    const s = m.index + '<script>'.length;
    return { id, file: entry, inline: true, files, text: m[1], offset: lineAt(html, s) - 1, cut: [s, s + m[1].length], langs };
  }
  return null;
}
function tables(r) {
  const out = [];
  for (const w of registry(r)) {
    const dir = path.posix.dirname(w.entry), file = dir + '/words.js';
    const files = (w.files && w.files.length ? w.files : [w.entry]).filter(f => f !== file && r.has(f));
    if (r.has(file)) { out.push({ id: w.id, file, files, text: r.read(file), offset: 0, langs: w.languages }); continue; }
    if (!r.has(w.entry)) continue;
    const t = inlineTable(r, w.id, w.entry, files, w.languages);
    if (t) out.push(t);
  }
  if (r.has(TEMPLATE)) {
    let langs;
    try { const m = /<script type="application\/json" id="board21-widget">([\s\S]*?)<\/script>/.exec(r.read(TEMPLATE)); langs = m ? JSON.parse(m[1]).languages : undefined; } catch (e) { langs = undefined; }
    const t = inlineTable(r, '_template', TEMPLATE, [TEMPLATE], langs);
    if (t) out.push(Object.assign(t, { template: true }));
  }
  return out;
}

// ---- What the widget's files name: keys in t(…), ui(…), and data-t*; and every quoted string.
function scanCode(text) {
  const named = [], quoted = new Set();
  const call = /(?:^|[^\w$.])(?:Board21\.)?(t|ui)\(/g;
  let m;
  while ((m = call.exec(text))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < text.length && depth) {
      const c = text[i];
      if (c === "'" || c === '"' || c === '`') {
        let j = i + 1;
        while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
        const s = text.slice(i + 1, j);
        if (/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/.test(s)) named.push({ key: s, how: m[1], line: lineAt(text, i) });
        i = j + 1; continue;
      }
      if (c === '(') depth++;
      if (c === ')') depth--;
      i++;
    }
  }
  for (const d of text.matchAll(DATA_T)) named.push({ key: d[2] != null ? d[2] : d[3], how: 'data-t', line: lineAt(text, d.index) });
  for (const s of text.matchAll(/(['"`])([^'"`\n]*)\1/g)) quoted.add(s[2]);
  return { named, quoted };
}
// HTML outside <title>, <script>, <style>, and translate="no": its text and labels with a letter in them.
function scanHtml(text) {
  const out = [], stack = [{ tag: '', attrs: {}, off: false }];
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
  const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[e.toLowerCase()] ||
    String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
  const re = /<!--[\s\S]*?-->|<!(?:[^>]*)>|<(script|style|title)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/([A-Za-z][\w-]*)\s*>|<([A-Za-z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[3]) {
      const attrs = {};
      for (const a of m[4].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : '');
      const el = { tag: m[3].toLowerCase(), attrs, off: top.off || attrs.translate === 'no', line: lineAt(text, m.index) };
      if (!el.off) for (const a of HTML_ATTRS) if (attrs[a] != null && /\p{L}/u.test(attrs[a])) out.push({ kind: a, text: attrs[a].replace(/\s+/g, ' ').trim(), el, line: el.line });
      if (!m[5] && !VOID.test(el.tag)) stack.push(el);
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
    } else if (!/^</.test(m[0])) {
      const s = decode(m[0]).replace(/\s+/g, ' ').trim();
      if (s && /\p{L}/u.test(s) && !top.off && top.tag) out.push({ kind: 'text', text: s, el: top, line: lineAt(text, m.index + m[0].search(/\S/)) });
    }
  }
  return out;
}

// ---- The check.
function check(opts = {}) {
  const r = reader(opts), problems = [], list = [];
  let Words;
  const sdkText = r.read(SDK);
  try { Words = sdkWords(sdkText); } catch (e) { return { tables: [], rows: 0, problems: [e.message] }; }
  const LANGS = Words.LANGS, NAME = Words.IN_ENGLISH, common = Words.COMMON_WORDS.window;
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
  const graphemes = s => (seg ? [...seg.segment(s)].length : [...s].length);
  const names = set => (set.length ? Words.andList(set.map(p => '{' + p + '}')) : 'none');
  const strings = v => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.keys(v).map(f => v[f]).filter(x => typeof x === 'string') : []);
  const sentences = s => s.split(/\n+|(?<=[.!?;:])\s+/);

  const commonRead = readCommon(sdkText);
  const all = [{ id: 'common', file: SDK, common: true, read: commonRead }].concat(tables(r).map(t => Object.assign(t, { read: readTable(t.file, t.text, t.offset) })));
  for (const t of all) {
    const rd = t.read;
    if (rd.problem) { problems.push(rd.problem); list.push({ id: t.id, file: t.file, inline: !!t.inline, rows: 0 }); continue; }
    const off = rd.offset || 0, at = n => `${t.file} line ${n + off}`;
    const secs = rd.model.sections, rowsOf = n => (secs.find(s => s.name === n && s.rows) || { rows: [] }).rows;
    let count = 0;
    for (const s of secs) if (!SECTIONS.includes(s.name)) problems.push(`${at(s.line)}: “${s.name}” isn’t a section. Use window, board, or dynamic.`);
    const seen = new Map();
    for (const sec of ['window', 'board']) {
      for (const row of rowsOf(sec)) {
        count++;
        const k = row.key, v = row.value, ln = f => at(row.lines[f] || row.line);
        if (seen.has(k)) problems.push(seen.get(k) === sec ? `${at(row.line)}: ${k} is in ${sec} twice. Keep one.` : `${at(row.line)}: ${k} is in ${seen.get(k)} and ${sec}. Keep it in one.`);
        seen.set(k, sec);
        if (!Words.KEY_RE.test(k)) problems.push(`${at(row.line)}: “${k}” isn’t a key. Use words joined by dots, such as chip.min.`);
        else if (!t.common && /^b21\./.test(k)) problems.push(`${at(row.line)}: ${k} is a common word. Use it without a row.`);
        if (!row.isObj || !v || typeof v !== 'object' || Array.isArray(v)) { problems.push(`${at(row.line)}: ${k} needs braces: ${sec === 'board' ? '{ en: … }' : '{ en: …, es: …, ru: …, uk: … }'}.`); continue; }
        for (const f of Object.keys(v)) if (!META.includes(f) && !LANGS.includes(f)) problems.push(`${at(row.line)}: ${k} has “${f}”. A row takes note, max, fill, to, and its languages.`);
        if (v.to !== undefined && v.to !== 'teacher') problems.push(`${ln('to')}: ${k}’s to can only be 'teacher'.`);
        if (v.max !== undefined && !(Number.isInteger(v.max) && v.max > 0)) problems.push(`${ln('max')}: ${k}’s max is a number of characters, such as 6.`);
        // Languages: window rows all four, board rows English only.
        const langs = sec === 'window' ? LANGS : ['en'];
        for (const l of langs) {
          if (v[l] === undefined) { problems.push(`${at(row.line)}: ${k} has no ${NAME[l]}.`); continue; }
          if (typeof v[l] !== 'string' && !(v[l] && typeof v[l] === 'object' && !Array.isArray(v[l]))) { problems.push(`${ln(l)}: ${k}’s ${NAME[l]} isn’t text in quotes.`); continue; }
          if (typeof v[l] === 'string' ? !v[l].trim() : Object.keys(v[l]).some(f => typeof v[l][f] !== 'string' || !v[l][f].trim())) problems.push(`${ln(l)}: ${k}’s ${NAME[l]} is empty.`);
        }
        if (sec === 'board') { const extra = LANGS.filter(l => l !== 'en' && v[l] !== undefined); if (extra.length) problems.push(`${ln(extra[0])}: ${k} is a menu or title bar row. It takes English only for now.`); }
        const present = langs.filter(l => v[l] && (typeof v[l] === 'string' || typeof v[l] === 'object'));
        // Plural forms, exactly as each language needs them.
        const plural = v.en && typeof v.en === 'object';
        for (const l of present) {
          const val = v[l], need = Words.FORMS[l], may = (Words.OPTIONAL_FORMS && Words.OPTIONAL_FORMS[l]) || [];
          if (typeof val === 'object') {
            const have = Object.keys(val), lack = need.filter(f => !have.includes(f)), extra = have.filter(f => !need.includes(f) && !may.includes(f));
            if (!plural && l !== 'en') problems.push(`${ln(l)}: ${k} in ${NAME[l]} has plural forms. English has none.`);
            else if (lack.length) problems.push(`${ln(l)}: ${k} in ${NAME[l]} needs ${Words.andList(need)}.`);
            else if (extra.length) problems.push(`${ln(l)}: ${k} in ${NAME[l]} has ${Words.andList(extra)}. ${NAME[l]} uses ${Words.andList(need)}.`);
          } else if (plural) problems.push(`${ln(l)}: ${k} in ${NAME[l]} needs ${Words.andList(need)}.`);
        }
        // Placeholders, the same in every language.
        const enSet = Words.placeholders(v.en);
        for (const l of present) {
          if (l === 'en') continue;
          const set = Words.placeholders(v[l]);
          if (set.join() !== enSet.join()) problems.push(`${ln(l)}: ${k} in ${NAME[l]} has ${names(set)}. English has ${names(enSet)}. Use the same ones.`);
        }
        // The most characters, with each placeholder filled from fill (else 2 characters).
        if (Number.isInteger(v.max) && v.max > 0) {
          const fill = v.fill && typeof v.fill === 'object' ? v.fill : {};
          for (const l of present) {
            let worst = null;
            for (const s of strings(v[l])) {
              const filled = Words.fill(s, fill), len = graphemes(filled.text.replace(/\{[A-Za-z0-9]+\}/g, 'xx'));
              if (len > v.max && (!worst || len > worst.len)) worst = { len, ps: Words.placeholders(s) };
            }
            if (worst) {
              const how = worst.ps.map(p => (Object.prototype.hasOwnProperty.call(fill, p) ? `{${p}} as ${fill[p]}` : `{${p}} as 2 characters`));
              problems.push(`${ln(l)}: ${k} in ${NAME[l]} is ${worst.len} characters${how.length ? ' with ' + Words.andList(how) : ''}. The most is ${v.max}.`);
            }
          }
        }
        // Letters.
        for (const l of present) {
          const s = strings(v[l]).join('\n');
          let x;
          if (l === 'uk' && (x = /[ыэъёЫЭЪЁ]/.exec(s))) problems.push(`${ln(l)}: ${k} in Ukrainian has ${x[0]}, a Russian letter.`);
          if (l === 'ru' && (x = /[іїєґІЇЄҐ]/.exec(s))) problems.push(`${ln(l)}: ${k} in Russian has ${x[0]}, a Ukrainian letter.`);
          if (l === 'es' && /[Ѐ-ӿ]/.test(s)) problems.push(`${ln(l)}: ${k} in Spanish has Cyrillic letters.`);
          if (l === 'uk' && /ʼ/.test(s)) problems.push(`${ln(l)}: ${k} in Ukrainian has ʼ. Type ’ instead.`);
          if (l === 'uk' && /'/.test(s)) problems.push(`${ln(l)}: ${k} in Ukrainian has '. Type ’ instead.`);
          const never = NEVER[l] && new RegExp(`(?<!\\p{L})(?:${NEVER[l].join('|')})\\p{L}*`, 'iu').exec(s);
          if (never) problems.push(`${ln(l)}: ${k} in ${NAME[l]} has “${never[0]}”. Never use it.`);
        }
        // English voice: the Oxford comma.
        let c;
        for (const s of strings(v.en)) for (const sn of sentences(s)) if ((c = LIST.exec(sn))) { problems.push(`${ln('en')}: ${k} in English needs a comma before “${c[1].toLowerCase()}”.`); break; }
        if (typeof v.note === 'string') for (const sn of sentences(v.note)) if ((c = LIST.exec(sn))) { problems.push(`${ln('note')}: ${k}’s note needs a comma before “${c[1].toLowerCase()}”.`); break; }
      }
    }
    // dynamic: key prefixes the code builds.
    const dyn = secs.find(s => s.name === 'dynamic');
    const allKeys = rowsOf('window').concat(rowsOf('board')).map(x => x.key);
    const prefixes = [];
    if (dyn) {
      for (const it of dyn.items || [{ value: dyn.value, line: dyn.line }]) {
        const p = it.value;
        if (typeof p !== 'string' || !p.endsWith('.')) problems.push(`${at(it.line)}: dynamic “${p}” needs a dot at the end.`);
        else if (!allKeys.some(key => key.startsWith(p))) problems.push(`${at(it.line)}: dynamic “${p}” covers no row.`);
        else prefixes.push(p);
      }
    }
    list.push({ id: t.id, file: t.file, inline: !!t.inline, rows: count });
    if (t.common) {
      if (commonText(sdkText, rd, Words) !== sdkText) problems.push(`${SDK}’s Common words aren’t laid out. Run node tools/words.js --format.`);
      continue;
    }
    // The widget's files: every key named has a row, every row is used, no English left in its pages, numbers and dates.
    const rowSec = new Map();
    for (const sec of ['window', 'board']) for (const x of rowsOf(sec)) rowSec.set(x.key, sec);
    const quoted = new Set();
    for (const f of t.files) {
      let text = r.read(f);
      if (t.inline && f === t.file) text = text.slice(0, t.cut[0]) + text.slice(t.cut[0], t.cut[1]).replace(/[^\n]/g, ' ') + text.slice(t.cut[1]);
      const sc = scanCode(text);
      sc.quoted.forEach(x => quoted.add(x));
      for (const u of sc.named) {
        quoted.add(u.key);
        const sec = /^b21\./.test(u.key) && Object.prototype.hasOwnProperty.call(common, u.key) ? 'window' : rowSec.get(u.key);
        if (!sec) problems.push(`${f} line ${u.line}: no row for ${u.key}.`);
        else if (sec === 'board' && u.how !== 'ui') problems.push(`${f} line ${u.line}: ${u.key} is a board row. Show it with Board21.ui().`);
      }
      if (/\.html?$/.test(f)) {
        for (const h of scanHtml(text)) {
          const attr = h.kind === 'text' ? 'data-t' : 'data-t-' + h.kind, key = h.el.attrs[attr];
          if (key == null) { problems.push(`${f} line ${h.line}: “${h.text}” isn’t in the words table. Add ${attr} with its key.`); continue; }
          const row = Object.prototype.hasOwnProperty.call(common, key) ? common[key] : (rowsOf('window').concat(rowsOf('board')).find(x => x.key === key) || {}).value;
          if (row && typeof row.en === 'string' && row.en !== h.text) problems.push(`${f} line ${h.line}: “${h.text}” doesn’t match ${key} in English, ${endQuote(row.en)}`);
        }
      }
      for (const n of text.matchAll(/\b(toLocaleString|toLocaleDateString|toLocaleTimeString|Intl\.NumberFormat|Intl\.DateTimeFormat)\(/g)) {
        let i = n.index + n[0].length, depth = 1;
        while (i < text.length && depth) { if (text[i] === '(') depth++; if (text[i] === ')') depth--; i++; }
        const args = text.slice(n.index + n[0].length, i), number = /^(toLocaleString|Intl\.NumberFormat)$/.test(n[1]);
        if (number && !/['"]en-US['"]/.test(args)) problems.push(`${f} line ${lineAt(text, n.index)}: ${n[1]}( needs 'en-US'. Numbers always use English rules.`);
        if (!number && !/Board21\.(locale|uiLocale)\b|['"]en-US['"]/.test(args)) problems.push(`${f} line ${lineAt(text, n.index)}: ${n[1]}( needs Board21.locale, or use Board21.format.date.`);
      }
    }
    for (const sec of ['window', 'board']) for (const x of rowsOf(sec)) {
      if (!quoted.has(x.key) && !prefixes.some(p => x.key.startsWith(p)) && !/^b21\./.test(x.key)) problems.push(`${at(x.line)}: ${x.key} isn’t used. Remove it, or add its prefix to dynamic.`);
    }
    if (!t.inline) {
      const used = [...quoted].filter(x => /^b21\./.test(x));
      if (fileText(rd, Words, used) !== t.text) problems.push(`${t.file} isn’t laid out. Run node tools/words.js --format.`);
    }
  }
  // The languages a widget lists go with its table: one whose table has window rows lists all four, English first (its
  // registry entry, or the starter's manifest), and one that lists them has a table. (Its files aren't checked here:
  // the Offline suite does that.)
  const FOUR = JSON.stringify(LANGS);
  for (const t of all) {
    if (t.common || !t.read || t.read.problem) continue;
    const win = ((t.read.model.sections.find(x => x.name === 'window' && x.rows) || { rows: [] }).rows.length > 0);
    const listed = t.langs === undefined ? undefined : JSON.stringify(Array.from(t.langs || []));
    if (t.template) {
      if (listed === undefined) { if (win) problems.push(`${t.file}: the manifest has no languages. Add "languages": ["en", "es", "ru", "uk"].`); }
      else if (listed !== FOUR) problems.push(`${t.file}: the manifest’s languages must be ["en", "es", "ru", "uk"].`);
    } else if (listed === undefined) { if (win) problems.push(`widgets/registry.js: ${t.id} has a words table but no languages. Add languages: ['en', 'es', 'ru', 'uk'].`); }
    else if (listed !== FOUR) problems.push(`widgets/registry.js: ${t.id}’s languages must be ['en', 'es', 'ru', 'uk'].`);
  }
  const withTable = new Set(all.map(t => t.id));
  for (const w of registry(r)) if (w.languages !== undefined && !withTable.has(w.id)) problems.push(`widgets/registry.js: ${w.id} lists languages but has no words table.`);
  return { tables: list, rows: list.reduce((a, x) => a + x.rows, 0), problems };
}
function summary(res) {
  const n = res.problems.length;
  return `Words: ${res.tables.length} tables, ${res.rows} rows. ${n ? `${n} problem${n === 1 ? '' : 's'}.` : 'No problems.'}`;
}

// ---- Layout of one file: a words file, or sdk/board21.js (its Common words). Returns the text laid out.
function usedCommon(r, rel) {
  const t = tables(r).find(x => x.file === rel);
  const used = new Set();
  if (t) for (const f of t.files) { const sc = scanCode(r.read(f)); sc.quoted.forEach(x => used.add(x)); sc.named.forEach(u => used.add(u.key)); }
  return [...used].filter(x => /^b21\./.test(x));
}
function layout(rel, text, opts = {}) {
  const r = reader(opts);
  if (rel === SDK) {
    const Words = sdkWords(text), c = readCommon(text);
    if (c.problem) throw new Error(c.problem);
    return commonText(text, c, Words);
  }
  const Words = sdkWords(r.read(SDK)), t = readTable(rel, text);
  if (t.problem) throw new Error(t.problem);
  return fileText(t, Words, usedCommon(r, rel));
}

// ---- One table by id, for --list, --glossary, --sheet, and --apply.
function table(id, r) {
  const sdkText = r.read(SDK), Words = sdkWords(sdkText);
  if (id === 'common') {
    const c = readCommon(sdkText);
    if (c.problem) throw new Error(c.problem);
    return { id, file: SDK, model: c.model, Words, write: () => commonText(r.read(SDK), c, Words), read: c };
  }
  const t = tables(r).find(x => x.id === id);
  if (!t) throw new Error(`No words table for “${id}”.`);
  if (t.inline) throw new Error(`${t.file}: its table is inline. Edit it there.`);
  const rd = readTable(t.file, t.text);
  if (rd.problem) throw new Error(rd.problem);
  return { id, file: t.file, model: rd.model, Words, write: () => fileText(rd, Words, usedCommon(r, t.file)), read: rd };
}
const rowsIn = model => model.sections.filter(s => s.rows && (s.name === 'window' || s.name === 'board')).flatMap(s => s.rows.map(row => ({ section: s.name, row })));
const cell = (v, form) => (form ? (v && typeof v === 'object' && typeof v[form] === 'string' ? v[form] : '') : typeof v === 'string' ? v : '');
const hash = (key, form, cells) => crypto.createHash('sha256').update(JSON.stringify([key, form].concat(cells))).digest('hex').slice(0, 12);
// A cell holds a tab, a new line, or a backslash as \t, \n, or \\, so a Sheet tab keeps one line per row. The Hash is
// taken from the words themselves.
const toCell = s => String(s).replace(/[\\\t\n\r]/g, c => ({ '\\': '\\\\', '\t': '\\t', '\n': '\\n', '\r': '\\r' })[c]);
const fromCell = s => String(s).replace(/\\([\\tnr])/g, (m, c) => ({ '\\': '\\', t: '\t', n: '\n', r: '\r' })[c]);
const formsOf = v => { const set = new Set(); for (const l of ['en', 'es', 'ru', 'uk']) if (v[l] && typeof v[l] === 'object') Object.keys(v[l]).forEach(f => set.add(f)); return FORM_ORDER.filter(f => set.has(f)); };

function list(id, opts = {}) {
  const tb = table(id, reader(opts)), out = [];
  for (const { section, row } of rowsIn(tb.model)) {
    out.push(row.key + '  (' + section + ')');
    for (const l of ['en', 'es', 'ru', 'uk']) {
      const v = row.value[l];
      if (v === undefined) continue;
      out.push('  ' + l + '  ' + (v && typeof v === 'object' ? Object.keys(v).map(f => f + ': ' + v[f]).join(' | ') : v));
    }
  }
  return out.join('\n') + '\n';
}
function glossary(id, opts = {}) {
  const r = reader(opts), tb = table(id, r);
  let entries = [];
  try { entries = JSON.parse(r.read('tools/glossary.json')); } catch (e) { /* (no glossary: rows only) */ }
  const terms = entries.map(g => ({ g, terms: String(g.en).replace(/\([^)]*\)/g, ' ').split(/\s*[;/]\s*/).map(s => s.trim().toLowerCase()).filter(Boolean) }));
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const show = v => (v && typeof v === 'object' ? Object.values(v).join(' / ') : v || '');
  const out = [];
  for (const { row } of rowsIn(tb.model)) {
    const v = row.value, en = show(v.en).toLowerCase();
    out.push(row.key, '  ' + ['en', 'es', 'ru', 'uk'].map(l => show(v[l]) || '—').join(' | '));
    for (const { g, terms: ts } of terms) if (ts.some(t => new RegExp('(^|[^a-z])' + esc(t) + '([^a-z]|$)').test(en))) out.push('  glossary, ' + g.en + ': ' + [g.es, g.ru, g.uk].join(' | '));
  }
  return out.join('\n') + '\n';
}
function sheet(id, opts = {}) {
  const tb = table(id, reader(opts)), lines = [COLUMNS];
  for (const { section, row } of rowsIn(tb.model)) {
    const v = row.value || {}, forms = formsOf(v);
    for (const form of forms.length ? forms : ['']) {
      const cells = ['en', 'es', 'ru', 'uk'].map(l => cell(v[l], form));
      lines.push([row.key, form, form ? HINTS[form] || '' : '', section, v.note || '', v.max != null ? String(v.max) : ''].concat(cells, ['', '', '', '', hash(row.key, form, cells)]));
    }
  }
  return lines.map(l => l.map(toCell).join('\t')).join('\n') + '\n';
}
// Sheet edits back into a file: Spanish, Russian, and Ukrainian cells. A line's Hash is of its words when the Sheet was
// made. Each cell then had the Sheet's word or the file's, so the one mix of the two that matches the Hash shows which
// side changed each cell: the Sheet's change comes in where the file kept the old word. When no mix matches, a word
// changed in both places, and the line's differing cells are named and left alone.
function apply(tsv, opts = {}) {
  const r = reader(opts), messages = [], writes = {};
  const rows = tsv.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'));
  const head = rows.shift() || [], col = name => head.indexOf(name);
  if (COLUMNS.some(c => col(c) < 0)) return { writes, messages: ['That file isn’t a Sheet tab from --sheet. Its first line names the columns.'], changes: 0, conflicts: 0 };
  const keys = [...new Set(rows.map(x => fromCell(x[col('Key')] || '')))];
  const ids = ['common'].concat(tables(r).filter(t => !t.inline).map(t => t.id));
  let tb = null;
  for (const id of ids) { try { const x = table(id, r); if (keys.every(k => rowsIn(x.model).some(y => y.row.key === k))) { tb = x; break; } } catch (e) { /* (a table that can't be read is checked on its own) */ } }
  if (!tb) return { writes, messages: ['No words table has every key in that file.'], changes: 0, conflicts: 0 };
  const LANG_COLS = { en: 'English', es: 'Español', ru: 'Русский', uk: 'Українська' }, LANGS = ['en', 'es', 'ru', 'uk'];
  let changes = 0, conflicts = 0;
  const english = new Set();
  for (const line of rows) {
    const key = fromCell(line[col('Key')] || ''), form = fromCell(line[col('Form')] || ''), found = rowsIn(tb.model).find(y => y.row.key === key);
    const v = found.row.value, sheetCells = LANGS.map(l => fromCell(line[col(LANG_COLS[l])] || '')), fileCells = LANGS.map(l => cell(v[l], form));
    const was = line[col('Hash')];
    if (hash(key, form, sheetCells) === was) continue;   // (nobody changed this line in the Sheet)
    let made = null;
    for (let mix = 0; mix < 16 && !made; mix++) {
      const cells = LANGS.map((l, i) => (mix & (1 << i) ? fileCells[i] : sheetCells[i]));
      if (hash(key, form, cells) === was) made = cells;
    }
    if (!made) {
      const differ = LANGS.slice(1).map((l, i) => [l, fileCells[i + 1], sheetCells[i + 1]]).filter(([, f, s]) => s && s !== f);
      if (differ.length) {
        conflicts++;
        messages.push(`Conflict: ${key} changed in the file and in the Sheet. ` + differ.map(([l, f, s]) => `${tb.Words.IN_ENGLISH[l]}: file “${f}”, Sheet ${endQuote(s)}`).join(' ') + ' Pick one by hand.');
      } else if (sheetCells[0] !== fileCells[0]) english.add(key);   // (only the English changed in both)
      continue;
    }
    if (sheetCells[0] !== made[0]) english.add(key);
    LANGS.forEach((l, i) => {
      const s = sheetCells[i];
      if (!i || !s || s === made[i] || s === fileCells[i]) return;   // (English, an emptied cell, or no edit)
      if (form) { if (!v[l] || typeof v[l] !== 'object') v[l] = {}; v[l][form] = s; } else v[l] = s;
      changes++;
    });
  }
  for (const k of english) messages.push(`${k}: English changes come from the code, not the Sheet. Skipped.`);
  if (changes) {
    writes[tb.file] = tb.write();
    messages.push(`${tb.file}: ${changes} change${changes === 1 ? '' : 's'}.`);
  }
  return { writes, messages, changes, conflicts };
}

module.exports = { ROOT, HINTS, COLUMNS, loadRegion, parse, check, summary, layout, list, glossary, sheet, apply };

// ---- The command line.
if (require.main === module) {
  const args = process.argv.slice(2), cmd = args[0];
  const USAGE = 'Usage: node tools/words.js [--format [file…] | --list <id> | --glossary <id> | --sheet <id> | --apply <file.tsv>]';
  const run = () => { const res = check(); res.problems.forEach(p => console.log(p)); console.log(summary(res)); return res.problems.length ? 1 : 0; };
  try {
    if (!cmd) process.exitCode = run();
    else if (cmd === '--format') {
      const r = reader();
      const files = args.length > 1 ? args.slice(1).map(f => path.relative(ROOT, path.resolve(f)).split(path.sep).join('/')) : tables(r).filter(t => !t.inline).map(t => t.file).concat([SDK]);
      for (const f of files) {
        if (!r.has(f)) { console.log(`${f} isn’t there.`); process.exitCode = 1; continue; }
        const text = r.read(f), out = layout(f, text);
        if (out !== text) { fs.writeFileSync(path.join(ROOT, f), out); console.log(`${f}: laid out.`); }
      }
    } else if ((cmd === '--list' || cmd === '--glossary' || cmd === '--sheet') && args[1]) process.stdout.write({ '--list': list, '--glossary': glossary, '--sheet': sheet }[cmd](args[1]));
    else if (cmd === '--apply' && args[1] && !fs.existsSync(args[1])) { console.log(`${args[1]} isn’t there.`); process.exitCode = 1; }
    else if (cmd === '--apply' && args[1]) {
      const res = apply(fs.readFileSync(args[1], 'utf8'));
      res.messages.forEach(m => console.log(m));
      for (const [f, text] of Object.entries(res.writes)) fs.writeFileSync(path.join(ROOT, f), text);
      process.exitCode = run() || (res.conflicts ? 1 : 0);
    } else { console.log(USAGE); process.exitCode = 2; }
  } catch (e) { console.log(e.message); process.exitCode = 1; }
}
