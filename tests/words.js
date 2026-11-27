/*
 * 21Board — Node test of every words table and the SDK's words engine, no browser:  node tests/words.js
 *
 * Loads the "// #region Words" region of sdk/board21.js into a vm, as tests/merge.js loads board.js's merge region,
 * and requires tools/words.js. Then checks:
 *   1. the real tables pass: every widget with a words.js, and the common words, with no problems;
 *   2. each rule of tools/words.js bites once, on one small broken copy each, with its file and line;
 *   3. the layout: --format leaves every real table as it is, and lays out a scrambled copy;
 *   4. the Sheet: --sheet's columns, plural lines and hints, and --apply's changes, conflicts, and English edits;
 *   5-12. the engine: lookup, plurals, placeholders, numbers and dates, frame names and addresses, the pseudo
 *      language, fonts, and the common words.
 * The rule checks, the Sheet, and the engine's plurals run on a widget of the tests' own (FIXTURE below), so a
 * reviewer's edit to a real widget's words never breaks them. It writes no file: every broken copy and round trip
 * stays in memory.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), child = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push(name + '\n      ' + String(e && e.message || e).split('\n').join('\n      ')); }
}
const eq = (got, want, what) => { if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const yes = (cond, what) => { if (!cond) throw new Error(what); };

// ---- The SDK's Words region, by its markers.
let Words = null, W = null, loadError = '';
try {
  const SRC = read('sdk/board21.js');
  const start = SRC.indexOf('// #region Words'), end = SRC.indexOf('// #endregion Words', start);
  if (start < 0 || end < 0) throw new Error('sdk/board21.js: the "Words" region is missing');
  Words = vm.compileFunction(SRC.slice(start, end) + '\nreturn Words;', [], { filename: 'board21.js#words' })();
} catch (e) { loadError = e.message; }
try { W = require(path.join(ROOT, 'tools', 'words.js')); } catch (e) { loadError = loadError || e.message; }
const need = () => { if (!Words || !W) throw new Error(loadError || 'not loaded'); };

// The engine for one window's language, with what it says to the console.
const engine = (lang, ...tables) => {
  const said = [];
  const w = Words.create({ lang: () => lang, say: (level, text) => said.push([level, text]) });
  tables.forEach(t => w.add(t));
  return Object.assign(w, { said });
};
const sp = s => String(s).replace(/[  ]/g, ' ');

// ---- The fixture: a widget of the tests' own, in memory, as tools/words.js lays it out. Its registry entry, its
// words.js (the common words it uses listed at the end, from the SDK), and its page.
const SDK = 'sdk/board21.js', FIX = 'widgets/fixture/words.js', FIX_PAGE = 'widgets/fixture/index.html';
const FIX_TABLE = `// Fixture: a widget of the tests' own.
Board21.words({
  window: {
    'chip.min': { note: 'Preset buttons 1m, 5m, and 10m. The m means minutes.', max: 6, fill: { n: '15' },
      en: '{n}m',
      es: '{n} min',
      ru: '{n} мин',
      uk: '{n} хв' },
    'chip.label': { note: 'Screen reader name of a preset button.',
      en: { one: '{n} minute', other: '{n} minutes' },
      es: { one: '{n} minuto', other: '{n} minutos' },
      ru: { one: '{n} минута', few: '{n} минуты', many: '{n} минут', other: '{n} минуты' },
      uk: { one: '{n} хвилина', few: '{n} хвилини', many: '{n} хвилин', other: '{n} хвилини' } },

    minus: { note: 'Screen reader name of the −1:00 button.',
      en: 'Subtract one minute',
      es: 'Restar un minuto',
      ru: 'Убавить минуту',
      uk: 'Відняти хвилину' }
  },
  board: {
    'title.done': { note: 'Title bar when the time is up.', en: 'Done!' },

    'sound.beep': { en: 'Beep' },
    'sound.chime': { en: 'Chime' },
    warn: { note: 'Menu heading over the warning choices.', en: 'Warning' }
  },
  dynamic: ['sound.']
});
`;
const FIX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fixture</title>
<script src="../../sdk/board21.js"></script>
<script src="words.js"></script>
</head>
<body>
  <div id="chips"></div>
  <button id="minus" aria-label="Subtract one minute" data-t-aria-label="minus">−1:00</button>
  <button id="go" aria-label="Start" data-t-aria-label="b21.start"></button>
<script>
  const PRESETS = [1, 5, 10];
  let running = false;
  for (const m of PRESETS) {
    const b = document.createElement('button');
    b.textContent = Board21.t('chip.min', { n: m });
    b.setAttribute('aria-label', Board21.t('chip.label', { n: m }));
    document.getElementById('chips').append(b);
  }
  function render(done) {
    document.getElementById('go').setAttribute('aria-label', Board21.t(running ? 'b21.pause' : 'b21.start'));
    Board21.window.setTitle(done ? Board21.ui('title.done') : '');
  }
  Board21.menu.set([
    ...['beep', 'chime'].map(k => ({ id: 'sound:' + k, label: Board21.ui('sound.' + k) })),
    { heading: true, label: Board21.ui('warn') }
  ]);
</script>
</body>
</html>
`;
// The list of the common words the fixture's page uses, as --format writes it: each key padded to the longest plus two.
const trailer = used => {
  const common = Words.COMMON_WORDS.window, width = Math.max(...used.map(k => k.length)) + 2;
  return '// Common words used here (edit them in sdk/board21.js):\n' + used.map(k => '// ' + k.padEnd(width) + ['en', 'es', 'ru', 'uk'].map(l => common[k][l]).join(' | ') + '\n').join('');
};
let FIXTURE = {};
try {
  FIXTURE = {
    'widgets/registry.js': `self.BOARD21_WIDGETS = [{ id: 'fixture', name: 'Fixture', entry: '${FIX_PAGE}', files: ['${FIX_PAGE}', '${FIX}'] }];\n`,
    [FIX]: FIX_TABLE + trailer(['b21.start', 'b21.pause']),
    [FIX_PAGE]: FIX_HTML
  };
} catch (e) { loadError = loadError || e.message; }
const fixture = (changes = {}) => Object.assign({}, FIXTURE, changes);
const fixTable = () => W.parse(FIX, FIXTURE[FIX]);

// ---- 1. The real tables pass.
test('the real tables: every widget with a words.js, and the common words, with no problems', () => {
  need();
  const box = { self: {} };
  vm.runInNewContext(read('widgets/registry.js'), box);
  const want = box.self.BOARD21_WIDGETS.filter(w => !w.external && fs.existsSync(path.join(ROOT, path.dirname(w.entry), 'words.js'))).map(w => w.id).concat('common');
  const r = W.check();
  eq(r.tables.map(t => t.id).sort(), want.sort(), 'tables');
  eq(r.problems, [], 'problems');
  yes(r.rows > 0 && W.summary(r) === `Words: ${want.length} tables, ${r.rows} rows. No problems.`, W.summary(r));
});
test('node tools/words.js exits 0 and ends “No problems.”', () => {
  const p = child.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'words.js')], { encoding: 'utf8', timeout: 30e3 });
  yes(p.status === 0 && /No problems\.\s*$/.test(p.stdout), `exit ${p.status}: ${(p.stdout + p.stderr).trim().split('\n').slice(-3).join(' | ')}`);
});

// ---- 2. Each rule bites once, on a broken copy of the fixture in memory, with its file and line.
test('the fixture alone has no problems', () => {
  need();
  const r = W.check({ files: fixture() });
  eq([r.tables.map(t => t.id), r.problems], [['common', 'fixture'], []], 'tables and problems');
});
const lineOf = (text, s, from = 0) => { const i = text.indexOf(s, from); if (i < 0) throw new Error(`not found: ${s}`); return text.slice(0, i).split('\n').length; };
const swap = (text, a, b) => { if (!text.includes(a)) throw new Error(`not found: ${a}`); return text.replace(a, b); };
const SHAPE = `${FIX}: a words file holds one Board21.words(…) call and comments. Nothing else.`;
// [name, file, change(text), expected problem(text after the change)]
const BITES = [
  ['a stray straight quote', FIX, t => swap(t, "es: 'Restar un minuto',", "es: 'Restar l'un minuto',"), t => `${FIX} line ${lineOf(t, "Restar l'un")}: a ' ends the text early. Type ’ instead.`],
  ['a straight quote at a word’s end', FIX, t => swap(t, "es: 'Restar un minuto',", "es: 'Restar los' minutos',"), t => `${FIX} line ${lineOf(t, "los'")}: a ' ends the text early. Type ’ instead.`],
  ['a line that can’t be read', FIX, t => swap(t, "es: 'Restar un minuto',", "es: 'Restar un minuto',,"), t => `${FIX} line ${lineOf(t, ',,')}: this line can’t be read. Check its quotes, commas, and braces.`],
  ['a quote that never closes', FIX, t => swap(t, "es: 'Restar un minuto',", "es: 'Restar un minuto,"), t => `${FIX} line ${lineOf(t, "'Restar un minuto,")}: this line can’t be read. Check its quotes, commas, and braces.`],
  ['two calls', FIX, t => t + 'Board21.words({});\n', () => SHAPE],
  ['code in a words file', FIX, t => 'var x = 1;\n' + t, () => SHAPE],
  ['a section that isn’t one', FIX, t => swap(t, '  window: {', '  windows: {'), t => `${FIX} line ${lineOf(t, 'windows:')}: “windows” isn’t a section. Use window, board, or dynamic.`],
  ['a field a row doesn’t take', FIX, t => swap(t, 'max: 6,', 'mx: 6,'), t => `${FIX} line ${lineOf(t, "'chip.min'")}: chip.min has “mx”. A row takes note, max, fill, to, and its languages.`],
  ['a missing language', FIX, t => swap(t, "      ru: '{n} мин',\n", ''), t => `${FIX} line ${lineOf(t, "'chip.min'")}: chip.min has no Russian.`],
  ['an empty language', FIX, t => swap(t, "es: '{n} min',", "es: '',"), t => `${FIX} line ${lineOf(t, "es: '',")}: chip.min’s Spanish is empty.`],
  ['a board row with Russian', FIX, t => swap(t, "en: 'Done!' }", "en: 'Done!', ru: 'Готово!' }"), t => `${FIX} line ${lineOf(t, "'title.done'")}: title.done is a menu or title bar row. It takes English only for now.`],
  ['a board row without braces', FIX, t => swap(t, "'sound.chime': { en: 'Chime' }", "'sound.chime': 'Chime'"), t => `${FIX} line ${lineOf(t, "'sound.chime'")}: sound.chime needs braces: { en: … }.`],
  ['a window row without braces', FIX, t => swap(t, '    minus: {', "    'chip.more': 'More',\n    minus: {"), t => `${FIX} line ${lineOf(t, "'chip.more'")}: chip.more needs braces: { en: …, es: …, ru: …, uk: … }.`],
  ['plural forms missing', FIX, t => swap(t, "ru: { one: '{n} минута', few: '{n} минуты', ", "ru: { one: '{n} минута', "), t => `${FIX} line ${lineOf(t, "ru: { one: '{n} минута'")}: chip.label in Russian needs one, few, many, and other.`],
  ['a plural form too many', FIX, t => swap(t, "en: { one: '{n} minute', other", "en: { one: '{n} minute', few: '{n} minutes', other"), t => `${FIX} line ${lineOf(t, "few: '{n} minutes'")}: chip.label in English has few. English uses one and other.`],
  ['mismatched placeholders', FIX, t => swap(t, "es: '{n} min',", "es: '{x} min',"), t => `${FIX} line ${lineOf(t, "'{x} min'")}: chip.min in Spanish has {x}. English has {n}. Use the same ones.`],
  ['max broken with fill', FIX, t => swap(t, "ru: '{n} мин',", "ru: '{n} мину',"), t => `${FIX} line ${lineOf(t, "'{n} мину'")}: chip.min in Russian is 7 characters with {n} as 15. The most is 6.`],
  ['a bad key', FIX, t => swap(t, "'chip.min': {", "'chip_min': {"), t => `${FIX} line ${lineOf(t, "'chip_min'")}: “chip_min” isn’t a key. Use words joined by dots, such as chip.min.`],
  ['a common word in a widget', FIX, t => swap(t, '    minus: {', "    'b21.start': { en: 'Start', es: 'Iniciar', ru: 'Старт', uk: 'Старт' },\n    minus: {"), t => `${FIX} line ${lineOf(t, "'b21.start'")}: b21.start is a common word. Use it without a row.`],
  ['a key in both sections', FIX, t => swap(t, '    minus: {', "    warn: { en: 'Warning', es: 'Aviso', ru: 'Внимание', uk: 'Увага' },\n    minus: {"), t => `${FIX} line ${lineOf(t, '    warn: {', t.indexOf('  board: {'))}: warn is in window and board. Keep it in one.`],
  ['a key twice in one section', FIX, t => swap(t, '    minus: {', "    minus: { en: 'Take one away', es: 'Quitar uno', ru: 'Убрать один', uk: 'Прибрати один' },\n    minus: {"), t => `${FIX} line ${lineOf(t, '    minus: {', t.indexOf('Прибрати один'))}: minus is in window twice. Keep one.`],
  ['dynamic without a dot', FIX, t => swap(t, "dynamic: ['sound.']", "dynamic: ['sound']"), t => `${FIX} line ${lineOf(t, 'dynamic:')}: dynamic “sound” needs a dot at the end.`],
  ['dynamic that covers no row', FIX, t => swap(t, "dynamic: ['sound.']", "dynamic: ['sound.', 'snd.']"), t => `${FIX} line ${lineOf(t, 'dynamic:')}: dynamic “snd.” covers no row.`],
  ['a row that isn’t used', FIX, t => swap(t, '    minus: {', "    'chip.extra': { en: 'More', es: 'Más', ru: 'Ещё', uk: 'Ще' },\n    minus: {"), t => `${FIX} line ${lineOf(t, "'chip.extra'")}: chip.extra isn’t used. Remove it, or add its prefix to dynamic.`],
  ['a Russian letter in Ukrainian', FIX, t => swap(t, "uk: '{n} хв' }", "uk: '{n} хы' }"), t => `${FIX} line ${lineOf(t, "'{n} хы'")}: chip.min in Ukrainian has ы, a Russian letter.`],
  ['a Ukrainian letter in Russian', FIX, t => swap(t, "ru: '{n} мин',", "ru: '{n} мін',"), t => `${FIX} line ${lineOf(t, "'{n} мін'")}: chip.min in Russian has і, a Ukrainian letter.`],
  ['Cyrillic in Spanish', FIX, t => swap(t, "es: '{n} min',", "es: '{n} мин',"), t => `${FIX} line ${lineOf(t, "es: '{n} мин'")}: chip.min in Spanish has Cyrillic letters.`],
  ['ʼ in Ukrainian', FIX, t => swap(t, "uk: 'Відняти хвилину'", "uk: 'Відняти пʼять хвилин'"), t => `${FIX} line ${lineOf(t, 'пʼять')}: minus in Ukrainian has ʼ. Type ’ instead.`],
  ['a straight apostrophe in Ukrainian', FIX, t => swap(t, "uk: 'Відняти хвилину'", "uk: 'Відняти п\\'ять хвилин'"), t => `${FIX} line ${lineOf(t, "п\\'ять")}: minus in Ukrainian has '. Type ’ instead.`],
  ['a missing Oxford comma in English', FIX, t => swap(t, "en: 'Subtract one minute',", "en: 'Subtract one, two and three minutes',"), t => `${FIX} line ${lineOf(t, 'two and three')}: minus in English needs a comma before “and”.`],
  ['a missing Oxford comma in a note', FIX, t => swap(t, '5m, and 10m', '5m and 10m'), t => `${FIX} line ${lineOf(t, "'chip.min'")}: chip.min’s note needs a comma before “and”.`],
  ['a file not laid out', FIX, t => swap(t, "      en: '{n}m',", "      en:  '{n}m',"), () => `${FIX} isn’t laid out. Run node tools/words.js --format.`],
  ['the common words not laid out', SDK, t => { const a = t.indexOf('// #region Common words'), i = t.indexOf(' en: ', a); return t.slice(0, i) + ' en:   ' + t.slice(i + 5); }, () => `${SDK}’s Common words aren’t laid out. Run node tools/words.js --format.`],
  ['a key with no row', FIX_PAGE, t => swap(t, "'b21.pause'", "'b21.paus'"), t => `${FIX_PAGE} line ${lineOf(t, "'b21.paus'")}: no row for b21.paus.`],
  ['a key with no row, named like an object’s own member', FIX_PAGE, t => swap(t, "Board21.ui('warn')", "Board21.ui('warn'), Board21.t('constructor')"), t => `${FIX_PAGE} line ${lineOf(t, "'constructor'")}: no row for constructor.`],
  ['t() on a board row', FIX_PAGE, t => swap(t, "Board21.ui('title.done')", "Board21.t('title.done')"), t => `${FIX_PAGE} line ${lineOf(t, "Board21.t('title.done')")}: title.done is a board row. Show it with Board21.ui().`],
  ['static English with no data-t', FIX_PAGE, t => swap(t, '<div id="chips"></div>', '<div id="chips"></div>\n  <p>Ready</p>'), t => `${FIX_PAGE} line ${lineOf(t, '<p>Ready')}: “Ready” isn’t in the words table. Add data-t with its key.`],
  ['a static label with no data-t-aria-label', FIX_PAGE, t => swap(t, ' data-t-aria-label="minus"', ''), t => `${FIX_PAGE} line ${lineOf(t, 'id="minus"')}: “Subtract one minute” isn’t in the words table. Add data-t-aria-label with its key.`],
  ['English beside data-t that differs from its row', FIX_PAGE, t => swap(t, 'aria-label="Subtract one minute"', 'aria-label="Subtract a minute"'), t => `${FIX_PAGE} line ${lineOf(t, 'Subtract a minute')}: “Subtract a minute” doesn’t match minus in English, “Subtract one minute”.`],
  ['a bare toLocaleString(', FIX_PAGE, t => swap(t, '  const PRESETS', '  const BIG = (1234).toLocaleString();\n  const PRESETS'), t => `${FIX_PAGE} line ${lineOf(t, 'toLocaleString(')}: toLocaleString( needs 'en-US'. Numbers always use English rules.`],
  ['a bare toLocaleDateString(', FIX_PAGE, t => swap(t, '  const PRESETS', '  const DAY1 = new Date().toLocaleDateString();\n  const PRESETS'), t => `${FIX_PAGE} line ${lineOf(t, 'toLocaleDateString(')}: toLocaleDateString( needs Board21.locale, or use Board21.format.date.`]
];
for (const [name, file, change, want] of BITES) {
  test(`each rule bites: ${name}`, () => {
    need();
    const after = change(file === SDK ? read(SDK) : FIXTURE[file]), expect = want(after);
    const r = W.check({ files: fixture({ [file]: after }) });
    yes(r.problems.includes(expect), `want “${expect}” in:\n${r.problems.join('\n') || '(no problems)'}`);
  });
}
test('each problem reads right: a row named like an object’s own member, and English that ends a sentence', () => {
  need();
  const t = swap(FIXTURE[FIX], '    minus: {', "    constructor: {\n      en: 'Build',\n      es: 'Construir',\n      ru: 'Строить',\n      uk: 'Будувати' },\n    minus: {");
  let r = W.check({ files: fixture({ [FIX]: t }) });
  eq(r.problems, [`${FIX} line ${lineOf(t, 'constructor:')}: constructor isn’t used. Remove it, or add its prefix to dynamic.`], 'a row named constructor');
  r = W.check({ files: fixture({ [FIX]: swap(FIXTURE[FIX], "en: 'Subtract one minute',", "en: 'Take one away.',") }) });
  eq(r.problems.filter(p => /doesn’t match/.test(p)), [`${FIX_PAGE} line ${lineOf(FIX_HTML, 'id="minus"')}: “Subtract one minute” doesn’t match minus in English, “Take one away.”`], 'no period after a quote that ends a sentence');
});
test('a broken table is counted in the summary', () => {
  need();
  const r = W.check({ files: fixture({ [FIX]: swap(FIXTURE[FIX], "es: '{n} min',", "es: '',") }) });
  const rows = Object.keys(Words.COMMON_WORDS.window).length + Object.keys(fixTable().window).length + Object.keys(fixTable().board).length;
  eq(W.summary(r), `Words: 2 tables, ${rows} rows. 1 problem.`, 'summary');
});
test('a words file never runs: code that reaches for Node’s process is turned away untouched', () => {
  need();
  for (const code of ["Board21.words.constructor('return process')().__b21Ran = 1;\n", "this.constructor.constructor('return process')().__b21Ran = 2;\n"]) {
    delete process.__b21Ran;
    const r = W.check({ files: fixture({ [FIX]: code + FIXTURE[FIX] }) });
    let thrown = '';
    try { W.layout(FIX, code + FIXTURE[FIX], { files: fixture() }); } catch (e) { thrown = e.message; }
    yes(process.__b21Ran === undefined, `it ran: ${code.trim()}`);
    yes(r.problems.includes(SHAPE) && thrown === SHAPE, `${code.trim()}: ${r.problems.join(' | ')} | ${thrown}`);
  }
});
test('the SDK’s Words region missing: one message', () => {
  need();
  const r = W.check({ files: { [SDK]: read(SDK).replace(/#(end)?region Words\n/g, '#$1region Wordz\n') } });
  eq(r.problems, [`${SDK}: the Words region can’t be read. Its // #region Words markers are missing.`], 'problems');
});
test('node tools/words.js --format with a file that isn’t there', () => {
  const p = child.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'words.js'), '--format', 'widgets/nope/words.js'], { cwd: ROOT, encoding: 'utf8', timeout: 30e3 });
  yes(p.status === 1 && p.stdout === 'widgets/nope/words.js isn’t there.\n', `exit ${p.status}: ${p.stdout}${p.stderr}`);
});

// ---- 3. Layout.
test('--format leaves every real table as it is', () => {
  need();
  const real = W.check().tables.map(t => t.file);
  yes(real.includes(SDK) && real.length > 1, real.join());
  for (const f of real) eq(W.layout(f, read(f)) === read(f), true, f);
});
test('--format lays out a scrambled copy, lists the common words the page uses, and a second run changes nothing', () => {
  need();
  const real = FIXTURE[FIX];
  const scrambled = real
    .replace("minus: { note: 'Screen reader name of the −1:00 button.',\n      en: 'Subtract one minute',", "minus: { en: 'Subtract one minute', note: 'Screen reader name of the −1:00 button.',")
    .replace("'chip.min': { note:", '"chip.min":{note:')
    .replace(/\n      (en|es|ru|uk): /g, ' $1:')
    .replace('\n\n    minus', '\n\n\n\n    minus')
    .replace(/\n\/\/ Common words used here[\s\S]*$/, '\n');
  yes(scrambled !== real && !scrambled.includes('Common words'), 'scrambled');
  const once = W.layout(FIX, scrambled, { files: fixture() });
  eq(once === real, true, 'laid out as the fixture:\n' + once);
  eq(W.layout(FIX, once, { files: fixture() }) === once, true, 'twice');
  const sdk = read(SDK), sdk2 = sdk.replace(/\n {8}(en|es|ru|uk): /g, ' $1: ');
  yes(sdk2 !== sdk && W.layout(SDK, sdk2) === sdk, 'the common words region, laid out again');
});

// ---- 4. The Sheet.
const tsv = text => text.trim().split('\n').map(l => l.split('\t'));
const edit = (text, key, col, value, form = '') => tsv(text).map(r => (r[0] === key && r[1] === form ? Object.assign(r.slice(), { [col]: value }) : r)).map(r => r.join('\t')).join('\n') + '\n';
const diffLines = (a, b) => a.split('\n').map((l, i) => [l, b.split('\n')[i]]).filter(([x, y]) => x !== y);
test('--sheet: the 15 columns, a plural row as four lines, and the hints', () => {
  need();
  const rows = tsv(W.sheet('fixture', { files: fixture() }));
  eq(rows[0], ['Key', 'Form', 'Hint', 'Section', 'Note', 'Max', 'English', 'Español', 'Русский', 'Українська', 'OK es', 'OK ru', 'OK uk', 'Comment', 'Hash'], 'columns');
  yes(rows.every(r => r.length === 15), 'every line has 15 cells');
  const label = rows.filter(r => r[0] === 'chip.label');
  eq(label.map(r => r[1]), ['one', 'few', 'many', 'other'], 'chip.label forms');
  eq(label.map(r => r[6]), ['{n} minute', '', '', '{n} minutes'], 'English blank for few and many');
  eq(label.map(r => r[8]), ['{n} минута', '{n} минуты', '{n} минут', '{n} минуты'], 'Russian');
  eq(label.map(r => r[2]), ['1. Russian and Ukrainian: 1, 21, 31.', '2-4, 22-24', '0, 5-20, 25-30. Spanish: 1000000.', 'Every other count. Russian and Ukrainian: 1.5.'], 'hints');
  const minus = rows.find(r => r[0] === 'minus');
  eq([minus[1], minus[2], minus[3], minus[6], minus[10], minus[13], /^[0-9a-f]{12}$/.test(minus[14])], ['', '', 'window', 'Subtract one minute', '', '', true], 'a plain row');
  eq(rows.find(r => r[0] === 'chip.min')[5], '6', 'Max');
});
test('--apply: an edit changes only its line; a word changed in both places is a conflict; English is skipped', () => {
  need();
  const files = fixture(), text = W.sheet('fixture', { files });
  let r = W.apply(edit(text, 'minus', 8, 'Отнять минуту'), { files });
  eq(diffLines(FIXTURE[FIX], r.writes[FIX] || ''), [["      ru: 'Убавить минуту',", "      ru: 'Отнять минуту',"]], 'only minus’s ru line changes');
  yes(r.messages.includes(`${FIX}: 1 change.`), r.messages.join(' | '));
  // The file's Russian changed since the Sheet was made, and a reviewer changed the Spanish: the Spanish comes in, and
  // the file's Russian stays.
  const ruLater = fixture({ [FIX]: swap(FIXTURE[FIX], "ru: 'Убавить минуту',", "ru: 'Отнять минуту',") });
  r = W.apply(edit(text, 'minus', 7, 'Quitar un minuto'), { files: ruLater });
  eq([diffLines(ruLater[FIX], r.writes[FIX] || ''), r.messages], [[["      es: 'Restar un minuto',", "      es: 'Quitar un minuto',"]], [`${FIX}: 1 change.`]], 'a word changed in one place only comes in');
  // The same word changed in both: a conflict, and nothing changes.
  r = W.apply(edit(text, 'minus', 8, 'Снять минуту.'), { files: ruLater });
  eq([Object.keys(r.writes), r.messages], [[], ['Conflict: minus changed in the file and in the Sheet. Russian: file “Отнять минуту”, Sheet “Снять минуту.” Pick one by hand.']], 'a word changed in both places');
  r = W.apply(edit(text, 'minus', 6, 'Take a minute away'), { files });
  eq([Object.keys(r.writes), r.messages], [[], ['minus: English changes come from the code, not the Sheet. Skipped.']], 'an English edit');
  r = W.apply(edit(text, 'chip.label', 9, '{n} хвилинки', 'few'), { files });
  yes((r.writes[FIX] || '').includes("uk: { one: '{n} хвилина', few: '{n} хвилинки', many: '{n} хвилин', other: '{n} хвилини' } },"), 'a plural line folds back into its row');
});
test('--sheet and --apply keep a tab or a new line in a word', () => {
  need();
  const files = fixture({ [FIX]: swap(swap(FIXTURE[FIX], "es: 'Restar un minuto',", "es: 'Restar\\tun minuto',"), "ru: 'Убавить минуту',", "ru: 'Убавить\\nминуту',") });
  const text = W.sheet('fixture', { files }), minus = tsv(text).find(r => r[0] === 'minus');
  eq([minus.length, minus[7], minus[8]], [15, 'Restar\\tun minuto', 'Убавить\\nминуту'], 'escaped in the Sheet');
  let r = W.apply(text, { files });
  eq([Object.keys(r.writes), r.messages], [[], []], 'unedited: nothing changes');
  r = W.apply(edit(text, 'minus', 9, 'Відняти\\nхвилину'), { files });
  eq(diffLines(files[FIX], r.writes[FIX] || ''), [["      uk: 'Відняти хвилину' }", "      uk: 'Відняти\\nхвилину' }"]], 'an edit with \\n comes back as a new line');
});
test('--list and --glossary name every key of a table', () => {
  need();
  const t = fixTable(), keys = Object.keys(t.window).concat(Object.keys(t.board));
  const files = fixture({ 'tools/glossary.json': JSON.stringify([{ en: 'minute / minutes', es: 'minuto; minutos', ru: 'минута; минуты; минут', uk: 'хвилина; хвилини; хвилин' }]) });
  const list = W.list('fixture', { files }), gloss = W.glossary('fixture', { files });
  for (const [what, text] of [['list', list], ['glossary', gloss]]) {
    const lost = keys.filter(k => !new RegExp(`(^|\\s)${k.replace(/\./g, '\\.')}(\\s|$)`, 'm').test(text));
    yes(keys.length > 5 && !lost.length, `${what}: missing ${lost.join(', ')}`);
  }
  yes(list.includes(`  es  ${t.window.minus.es}`) && list.includes(`one: ${t.window['chip.label'].ru.one}`), 'list shows the languages and the forms by name');
  yes(gloss.includes('glossary, minute / minutes: minuto; minutos | минута; минуты; минут | хвилина; хвилини; хвилин'), 'glossary shows the entries a row’s English uses');
});

// ---- 5. Lookup.
test('lookup: the window’s language, then English, then the key; board rows and ui() in English', () => {
  need();
  const table = { window: { a: { en: 'Apple', es: 'Manzana', ru: 'Яблоко', uk: 'Яблуко' }, b: { en: 'Bee', es: 'Abeja' } }, board: { 'menu.x': { en: 'Menu X' } } };
  const w = engine('ru', table);
  eq([w.t('a'), w.t('b'), w.t('zz'), w.t('menu.x'), w.ui('a'), w.ui('menu.x')], ['Яблоко', 'Bee', 'zz', 'Menu X', 'Apple', 'Menu X'], 'texts');
  w.t('b'); w.t('zz');
  eq(w.report(), { missing: ['zz'], fallback: ['b'] }, 'each key counted once');
  eq(w.said, [
    ['warn', '21Board: 1 row needs more languages. b: Russian and Ukrainian.'],
    ['warn', '21Board: "b" has no Russian, so it shows in English.'],
    ['error', '21Board: no words for "zz". Add it to the words table.']
  ], 'what the console says, once each');
  eq(engine('en').t('a'), 'a', 'no table at all: the key');
  const bad = engine('es');
  bad.add('nope'); bad.add({ window: { 'b21.start': { en: 'Go', es: 'Ir', ru: 'Иди', uk: 'Іди' } } });
  eq([bad.t('b21.start'), bad.said], [Words.COMMON_WORDS.window['b21.start'].es, [['error', '21Board: words() takes a table: { window, board }.'], ['warn', '21Board: "b21.start" is a common word. Use it without a row.']]], 'not a table, and a widget row for a common word');
  const two = engine('en', { window: { 'chip.min': { en: 'a', es: 'b', uk: 'c' }, plus: { en: 'a', ru: 'b' }, z: { en: 'a' } } });
  eq(two.said[0], ['warn', '21Board: 3 rows need more languages. chip.min: Russian. plus: Spanish and Ukrainian. z: Spanish, Russian, and Ukrainian.'], 'rows missing languages, in one warning');
});

// ---- 6. Plurals.
test('plurals: chip.label at 0, 1, 2, 5, 11, 21, 22, 25, and 1.5 in each language', () => {
  need();
  const table = fixTable(), N = [0, 1, 2, 5, 11, 21, 22, 25, 1.5];
  const WANT = {
    en: ['0 minutes', '1 minute', '2 minutes', '5 minutes', '11 minutes', '21 minutes', '22 minutes', '25 minutes', '1.5 minutes'],
    es: ['0 minutos', '1 minuto', '2 minutos', '5 minutos', '11 minutos', '21 minutos', '22 minutos', '25 minutos', '1.5 minutos'],
    ru: ['0 минут', '1 минута', '2 минуты', '5 минут', '11 минут', '21 минута', '22 минуты', '25 минут', '1.5 минуты'],
    uk: ['0 хвилин', '1 хвилина', '2 хвилини', '5 хвилин', '11 хвилин', '21 хвилина', '22 хвилини', '25 хвилин', '1.5 хвилини']
  };
  for (const [lang, want] of Object.entries(WANT)) {
    const w = engine(lang, table);
    eq(N.map(n => w.t('chip.label', { n })), want, lang);
    eq(w.report().fallback, [], lang + ': no fallback');
  }
  const es = engine('es', table);
  eq([es.t('chip.label', { n: 1000000 }), es.report(), es.said], ['1000000 minutos', { missing: [], fallback: [] }, []], 'es 1000000: many, then other, with no fallback');
  const few = engine('ru', { window: { k: { en: { one: '{n} cat', other: '{n} cats' }, es: { one: '{n} gato', other: '{n} gatos' }, ru: { one: '{n} кот', many: '{n} котов', other: '{n} кота' }, uk: { one: '{n} кіт', few: '{n} коти', many: '{n} котів', other: '{n} кота' } } } });
  eq([few.t('k', { n: 3 }), few.report().fallback, few.said.slice(-1)], ['3 кота', ['k'], [['warn', '21Board: "k" in Russian has no few form, so it shows the other form.']]], 'a ru row missing few uses other and counts a fallback');
  eq(engine('en', table).t('chip.label'), '{n} minutes', 'no n: other');
});

// ---- 7. Placeholders.
test('placeholders: numbers as String(n), text as plain text, a missing value left as it is', () => {
  need();
  const w = engine('en', { window: { 'say.picked': { en: 'Picked: {names}', es: 'Elegidos: {names}', ru: 'Выбрано: {names}', uk: 'Вибрано: {names}' }, n: { en: '{n} and {n}', es: '{n} y {n}', ru: '{n} и {n}', uk: '{n} і {n}' } } });
  eq([w.t('n', { n: 1234.5 }), w.t('n', { n: 2026 }), w.t('say.picked', { names: '<b>Ana</b>' }), w.t('say.picked'), w.t('say.picked', {})], ['1234.5 and 1234.5', '2026 and 2026', 'Picked: <b>Ana</b>', 'Picked: {names}', 'Picked: {names}'], 'filled');
  eq(w.said, [['error', '21Board: "say.picked" needs a value for {names}.']], 'one console error for the missing value');
});

// ---- 8. Numbers and dates.
test('format: numbers in English form, the time of day in words, weekdays, lists, plurals, and capitals', () => {
  need();
  const F = Words.format;
  for (const loc of Object.values(Words.LOCALES)) eq([F.number(1234.5), F.number(1234.5, { minimumFractionDigits: 2 })], ['1,234.5', '1,234.50'], `number in a ${loc} window`);
  const at = (h, m) => new Date(2026, 10, 27, h, m), T = { hour: 'numeric', minute: '2-digit' };
  const WANT = { 'en-US': ['9:05 AM', '3:05 PM', '8:05 PM', '12:00 PM'], 'es-US': ['9:05 a.m.', '3:05 p.m.', '8:05 p.m.', '12:00 p.m.'], 'ru-RU': ['9:05 утра', '3:05 дня', '8:05 вечера', '12:00 дня'], 'uk-UA': ['9:05 ранку', '3:05 дня', '8:05 вечора', '12:00 дня'] };
  for (const [loc, want] of Object.entries(WANT)) eq([at(9, 5), at(15, 5), at(20, 5), at(12, 0)].map(d => sp(F.date(d, T, loc))), want, loc);
  eq([sp(F.date(at(15, 5), Object.assign({ hourCycle: 'h23' }, T), 'en-US')), sp(F.date(at(15, 5), Object.assign({ hourCycle: 'h23' }, T), 'ru-RU'))], ['15:05', '15:05'], '24-hour');
  eq(F.date(at(9, 0), { weekday: 'long' }, 'uk-UA'), 'п’ятниця', 'uk weekday with ’');
  eq([F.list(['red', 'yellow', 'green'], 'and', 'en-US'), F.list(['rojo', 'amarillo', 'verde'], 'and', 'es-US'), F.list(['español', 'inglés'], 'and', 'es-US'), F.list(['siete', 'ocho'], 'or', 'es-US')],
    ['red, yellow, and green', 'rojo, amarillo y verde', 'español e inglés', 'siete u ocho'], 'lists');
  eq([F.plural(21, 'ru-RU'), F.plural(1000000, 'es-US'), F.plural(1.5, 'uk-UA'), F.capital('noviembre de 2026', 'es-US')], ['one', 'many', 'other', 'Noviembre de 2026'], 'plural and capital');
});

// ---- 9. Frame names and addresses.
test('the language from a frame’s name, from the address, and the board’s, and the board’s locale', () => {
  need();
  const N = { 'b21-board:timer:1;es': 'es', 'b21-board:dev-my-widget:2;uk': 'uk', 'b21-board:timer:1;qps': 'qps', 'b21-board:timer:1': 'en', 'b21-board:timer:1;fr': 'en', 'b21-board:timer:1;ES': 'en', 'b21-board:timer:1;': 'en', 'b21-board:timer:1;es;ru': 'en', 'b21-bare': 'en', '': 'en' };
  eq(Object.keys(N).map(Words.langFromName), Object.values(N), 'names');
  const H = { '#b21-bare&b21-lang=ru': 'ru', '#b21-lang=ru&b21-bare': 'ru', '#x&b21-lang=es': 'es', '#b21-lang=xx': 'en', '#b21-language=es': 'en', '': 'en' };
  eq(Object.keys(H).map(Words.langFromHash), Object.values(H), 'addresses');
  eq([Words.confirm('es', 'en'), Words.confirm('fr', 'ru'), Words.confirm(undefined, 'ru')], ['es', 'ru', 'ru'], 'confirm');
  const L = [['ru-RU', 'ru'], ['fr-FR', 'ru'], ['es-MX', 'es'], ['en-GB', 'en'], ['ru-RU', 'qps'], ['en-US', 'qps'], [undefined, 'es']];
  eq(L.map(([sent, lang]) => typeof Words.localeFrom === 'function' ? Words.localeFrom(sent, lang) : 'none'), ['ru-RU', null, 'es-MX', 'en-GB', 'ru-RU', null, null], 'the board’s locale, only when it suits the window’s language');
});

// ---- 10. The pseudo language.
test('pseudo: brackets, no English letters, one Cyrillic letter, {n} kept, as long as the longest, ru plural rules', () => {
  need();
  const table = fixTable();
  const look = (s, longest, what) => {
    const inner = s.slice(1, -1), bare = inner.replace(/\{[A-Za-z0-9]+\}/g, '');
    yes(s[0] === '［' && s[s.length - 1] === '］', `${what}: brackets (${s})`);
    yes(!/[A-Za-z]/.test(bare) && (bare.match(/[Ѐ-ӿ]/g) || []).length === 1, `${what}: no ASCII letters, one Cyrillic letter (${s})`);
    yes(inner.length >= longest, `${what}: ${inner.length} long, at least ${longest} (${s})`);
  };
  const longest = (row, f) => Math.max(...['es', 'ru', 'uk'].map(l => (f ? row[l][f] || '' : row[l]).length));
  const minus = Words.pseudo(table.window.minus);
  look(minus, longest(table.window.minus), 'minus');
  const chip = Words.pseudo(table.window['chip.min']);
  look(chip, longest(table.window['chip.min']), 'chip.min'); yes(chip.includes('{n}'), 'chip.min keeps {n}');
  const label = Words.pseudo(table.window['chip.label']);
  eq(Object.keys(label), ['one', 'few', 'many', 'other'], 'ru forms');
  for (const f of Object.keys(label)) look(label[f], longest(table.window['chip.label'], f), 'chip.label ' + f);
  const w = engine('qps', table);
  yes(w.t('chip.label', { n: 2 }) === label.few.replace('{n}', '2') && w.t('chip.label', { n: 21 }) === label.one.replace('{n}', '21'), 'qps counts by Russian rules');
  eq([w.ui('minus'), w.t('title.done')], [table.window.minus.en, table.board['title.done'].en], 'ui() and board rows stay English');
  eq(['Start', 'OK ［…］', '［Ŝţàŕţ］', '15', 'a'].map(s => Words.auditText(s).length > 0), [true, true, false, false, false], 'auditText');
});

// ---- 11. Fonts.
test('fonts: Russian, Ukrainian, and the pseudo language skip the bundled Latin fonts', () => {
  need();
  const legible = '"Atkinson Hyperlegible", system-ui, sans-serif', early = '"21Board Early Readers", system-ui, sans-serif', plain = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  for (const lang of ['ru', 'uk', 'qps']) eq([Words.fontFor(legible, lang), Words.fontFor(early, lang), Words.fontFor(plain, lang)], ['system-ui, sans-serif', 'system-ui, sans-serif', plain], lang);
  for (const lang of ['en', 'es']) eq([Words.fontFor(legible, lang), Words.fontFor(early, lang), Words.fontFor(plain, lang)], [legible, early, plain], lang);
});

// ---- 12. The common words.
test('the common words: b21.start, b21.pause, and b21.reset in all four languages, in any widget', () => {
  need();
  const common = Words.COMMON_WORDS.window;
  for (const k of ['b21.start', 'b21.pause', 'b21.reset']) yes(['en', 'es', 'ru', 'uk'].every(l => typeof common[k][l] === 'string' && common[k][l]), k);
  eq(['en', 'es', 'ru', 'uk'].map(l => engine(l, fixTable()).t('b21.reset')), ['en', 'es', 'ru', 'uk'].map(l => common['b21.reset'][l]), 'found from any widget');
  eq(Words.LANGS, ['en', 'es', 'ru', 'uk'], 'LANGS');
});

// ---- Results ----------------------------------------------------------------------------------------------------------
for (const f of failures) console.log('FAIL ' + f);
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
