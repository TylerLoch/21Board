// Would the spec's 11a pass on today's words tables (main after 1b) with the trial font?
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = '/home/user/21Board', W = require('./woff2.js');
const WT = require(path.join(ROOT, 'tools', 'words.js'));
const Words = WT.loadRegion(fs.readFileSync(path.join(ROOT, 'sdk/board21.js'), 'utf8'));
const r = { has: f => fs.existsSync(path.join(ROOT, f)), read: f => fs.readFileSync(path.join(ROOT, f), 'utf8') };
const font = W(fs.readFileSync(process.argv[2]));
const CH = JSON.parse(fs.readFileSync('inter-chars.json', 'utf8'));
const fallback = new Set(CH.fallback.map(h => parseInt(h, 16)));
const tabs = [];
for (const t of require(path.join(ROOT, 'tools', 'words.js')).__proto__ ? [] : []) {}
// every table: run it with a fake Board21
const box = { tables: [] };
const run = (text, name) => { const ctx = vm.createContext({ Board21: { words: o => box.tables.push([name, o]) } }); vm.runInContext(text, ctx); };
for (const f of fs.readdirSync(path.join(ROOT, 'widgets'))) { const p = path.join(ROOT, 'widgets', f, 'words.js'); if (fs.existsSync(p)) run(fs.readFileSync(p, 'utf8'), 'widgets/' + f + '/words.js'); }
box.tables.push(['common words', { window: Words.COMMON_WORDS.window, board: Words.COMMON_WORDS.board || {} }]);
const strings = [];
const walk = (v, where) => { if (typeof v === 'string') strings.push([v, where]); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'note' && k !== 'max' && k !== 'fill') walk(x, where); };
for (const [name, t] of box.tables) for (const sec of ['window', 'board']) for (const [key, row] of Object.entries(t[sec] || {})) {
  for (const l of ['en', 'es', 'ru', 'uk']) walk(row[l], name + ' ' + key + ' ' + l);
  try { walk(Words.pseudo(row), name + ' ' + key + ' qps'); } catch (e) { console.log('pseudo failed', key, e.message); }
}
const RE = /[\p{L}\p{M}\p{N}\p{P}\p{Zs}]/u, miss = new Map();
for (const [s, where] of strings) for (const ch of s) { const cp = ch.codePointAt(0); if (RE.test(ch) && !font.cmap.has(cp) && !fallback.has(cp)) miss.set(cp, where); }
console.log(box.tables.length, 'tables,', strings.length, 'strings; missing:', [...miss].map(([c, w]) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0') + ' ' + String.fromCodePoint(c) + ' (' + w + ')').join(', ') || 'none');
// and the list itself
const listed = []; for (const rngs of Object.values(CH.roman)) for (const x of rngs) { const [a, b] = x.split('-'); for (let c = parseInt(a, 16); c <= parseInt(b || a, 16); c++) listed.push(c); }
console.log('listed but not in the font:', listed.filter(c => !font.cmap.has(c)).map(c => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')).join(' ') || 'none');
console.log('fallback that the font has:', [...fallback].filter(c => font.cmap.has(c)).map(c => c.toString(16)).join(' ') || 'none');
