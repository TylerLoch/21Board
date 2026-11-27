/*
 * 21Board — Node test of every words table and the SDK's words engine, no browser:  node tests/words.js
 *
 * Loads the "// #region Words" region of sdk/board21.js into a vm, as tests/merge.js loads board.js's merge region,
 * and requires tools/words.js. Then checks:
 *   1. the real tables pass: Timer, Traffic Light, and the common words, with no problems;
 *   2. each rule of tools/words.js bites once, on one small broken copy each, with its file and line;
 *   3. the layout: --format leaves every real table as it is, and lays out a scrambled copy;
 *   4. the Sheet: --sheet's columns, plural lines and hints, and --apply's changes, conflicts, and English edits;
 *   5-12. the engine: lookup, plurals, placeholders, numbers and dates, frame names and addresses, the pseudo
 *      language, fonts, and the common words.
 * It writes no file: every broken copy and round trip stays in memory.
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

// A table as the SDK gets it: the file run with a stub for Board21.words.
const tableOf = file => { let t = null; vm.runInNewContext(read(file), { Board21: { words: x => { t = x; } } }); return t; };
// The engine for one window's language, with what it says to the console.
const engine = (lang, ...tables) => {
  const said = [];
  const w = Words.create({ lang: () => lang, say: (level, text) => said.push([level, text]) });
  tables.forEach(t => w.add(t));
  return Object.assign(w, { said });
};
const sp = s => String(s).replace(/[  ]/g, ' ');

// ---- 1. The real tables pass.
test('the real tables: Timer, Traffic Light, and the common words, 27 rows, no problems', () => {
  need();
  const r = W.check();
  eq(r.tables.map(t => t.id).sort(), ['common', 'timer', 'traffic-light'], 'tables');
  eq(r.rows, 27, 'rows');
  eq(r.problems, [], 'problems');
  eq(W.summary(r), 'Words: 3 tables, 27 rows. No problems.', 'summary');
});
test('node tools/words.js exits 0 and ends “No problems.”', () => {
  const p = child.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'words.js')], { encoding: 'utf8', timeout: 30e3 });
  yes(p.status === 0 && /No problems\.\s*$/.test(p.stdout), `exit ${p.status}: ${(p.stdout + p.stderr).trim().split('\n').slice(-3).join(' | ')}`);
});

// ---- 2. Each rule bites once, on a broken copy in memory, with its file and line.
const TIMER = 'widgets/timer/words.js', PAGE = 'widgets/timer/index.html', SDK = 'sdk/board21.js';
const lineOf = (text, s, from = 0) => { const i = text.indexOf(s, from); if (i < 0) throw new Error(`not found: ${s}`); return text.slice(0, i).split('\n').length; };
const swap = (text, a, b) => { if (!text.includes(a)) throw new Error(`not found: ${a}`); return text.replace(a, b); };
// [name, file, change(text), expected problem(text before the change, text after)]
const BITES = [
  ['a stray straight quote', TIMER, t => swap(t, "es: 'Restar un minuto',", "es: 'Restar l'un minuto',"), (o, t) => `${TIMER} line ${lineOf(t, "Restar l'un")}: a ' ends the text early. Type ’ instead.`],
  ['a line that can’t be read', TIMER, t => swap(t, "es: 'Restar un minuto',", "es: 'Restar un minuto',,"), (o, t) => `${TIMER} line ${lineOf(t, ",,")}: this line can’t be read. Check its quotes, commas, and braces.`],
  ['two calls', TIMER, t => t + 'Board21.words({});\n', () => `${TIMER}: a words file holds one Board21.words(…) call and comments. Nothing else.`],
  ['code in a words file', TIMER, t => 'var x = 1;\n' + t, () => `${TIMER}: a words file holds one Board21.words(…) call and comments. Nothing else.`],
  ['a section that isn’t one', TIMER, t => swap(t, '  window: {', '  windows: {'), (o, t) => `${TIMER} line ${lineOf(t, 'windows:')}: “windows” isn’t a section. Use window, board, or dynamic.`],
  ['a field a row doesn’t take', TIMER, t => swap(t, 'max: 6,', 'mx: 6,'), (o, t) => `${TIMER} line ${lineOf(t, "'chip.min'")}: chip.min has “mx”. A row takes note, max, fill, to, and its languages.`],
  ['a missing language', TIMER, t => swap(t, "      ru: '{n} мин',\n", ''), (o, t) => `${TIMER} line ${lineOf(t, "'chip.min'")}: chip.min has no Russian.`],
  ['an empty language', TIMER, t => swap(t, "es: '{n} min',", "es: '',"), (o, t) => `${TIMER} line ${lineOf(t, "es: '',")}: chip.min’s Spanish is empty.`],
  ['a board row with Russian', TIMER, t => swap(t, "en: 'Done!' }", "en: 'Done!', ru: 'Готово!' }"), (o, t) => `${TIMER} line ${lineOf(t, "'title.done'")}: title.done is a menu or title bar row. It takes English only for now.`],
  ['plural forms missing', TIMER, t => swap(t, "ru: { one: '{n} минута', few: '{n} минуты', ", "ru: { one: '{n} минута', "), (o, t) => `${TIMER} line ${lineOf(t, "ru: { one: '{n} минута'")}: chip.label in Russian needs one, few, many, and other.`],
  ['a plural form too many', TIMER, t => swap(t, "en: { one: '{n} minute', other: '{n} minutes' },\n      es", "en: { one: '{n} minute', few: '{n} minutes', other: '{n} minutes' },\n      es"), (o, t) => `${TIMER} line ${lineOf(t, "few: '{n} minutes'")}: chip.label in English has few. English uses one and other.`],
  ['mismatched placeholders', TIMER, t => swap(t, "es: '{n} min',", "es: '{x} min',"), (o, t) => `${TIMER} line ${lineOf(t, "'{x} min'")}: chip.min in Spanish has {x}. English has {n}. Use the same ones.`],
  ['max broken with fill', TIMER, t => swap(t, "ru: '{n} мин',", "ru: '{n} мину',"), (o, t) => `${TIMER} line ${lineOf(t, "'{n} мину'")}: chip.min in Russian is 7 characters with {n} as 15. The most is 6.`],
  ['a bad key', TIMER, t => swap(t, "'chip.min': {", "'chip_min': {"), (o, t) => `${TIMER} line ${lineOf(t, "'chip_min'")}: “chip_min” isn’t a key. Use words joined by dots, such as chip.min.`],
  ['a common word in a widget', TIMER, t => swap(t, '    plus: {', "    'b21.start': { en: 'Start', es: 'Iniciar', ru: 'Старт', uk: 'Старт' },\n    plus: {"), (o, t) => `${TIMER} line ${lineOf(t, "'b21.start'")}: b21.start is a common word. Use it without a row.`],
  ['a key in both sections', TIMER, t => swap(t, '    plus: {', "    warn: { en: 'Warning', es: 'Aviso', ru: 'Внимание', uk: 'Увага' },\n    plus: {"), (o, t) => `${TIMER} line ${lineOf(t, '    warn: {', t.indexOf('  board: {'))}: warn is in window and board. Keep it in one.`],
  ['dynamic without a dot', TIMER, t => swap(t, "dynamic: ['sound.']", "dynamic: ['sound']"), (o, t) => `${TIMER} line ${lineOf(t, 'dynamic:')}: dynamic “sound” needs a dot at the end.`],
  ['dynamic that covers no row', TIMER, t => swap(t, "dynamic: ['sound.']", "dynamic: ['sound.', 'snd.']"), (o, t) => `${TIMER} line ${lineOf(t, 'dynamic:')}: dynamic “snd.” covers no row.`],
  ['a row that isn’t used', TIMER, t => swap(t, '    plus: {', "    'chip.extra': { en: 'More', es: 'Más', ru: 'Ещё', uk: 'Ще' },\n    plus: {"), (o, t) => `${TIMER} line ${lineOf(t, "'chip.extra'")}: chip.extra isn’t used. Remove it, or add its prefix to dynamic.`],
  ['each Ukrainian letter rule: a Russian letter', TIMER, t => swap(t, "uk: '{n} хв' }", "uk: '{n} хы' }"), (o, t) => `${TIMER} line ${lineOf(t, "'{n} хы'")}: chip.min in Ukrainian has ы, a Russian letter.`],
  ['a Ukrainian letter in Russian', TIMER, t => swap(t, "ru: '{n} мин',", "ru: '{n} мін',"), (o, t) => `${TIMER} line ${lineOf(t, "'{n} мін'")}: chip.min in Russian has і, a Ukrainian letter.`],
  ['Cyrillic in Spanish', TIMER, t => swap(t, "es: '{n} min',", "es: '{n} мин',"), (o, t) => `${TIMER} line ${lineOf(t, "es: '{n} мин'")}: chip.min in Spanish has Cyrillic letters.`],
  ['ʼ in Ukrainian', TIMER, t => swap(t, "uk: 'Відняти хвилину'", "uk: 'Відняти пʼять хвилин'"), (o, t) => `${TIMER} line ${lineOf(t, 'пʼять')}: minus in Ukrainian has ʼ. Type ’ instead.`],
  ['a straight apostrophe in Ukrainian', TIMER, t => swap(t, "uk: 'Відняти хвилину'", "uk: 'Відняти п\\'ять хвилин'"), (o, t) => `${TIMER} line ${lineOf(t, "п\\'ять")}: minus in Ukrainian has '. Type ’ instead.`],
  ['a missing Oxford comma in English', TIMER, t => swap(t, "en: 'Add one minute',", "en: 'Add one, two and three minutes',"), (o, t) => `${TIMER} line ${lineOf(t, 'two and three')}: plus in English needs a comma before “and”.`],
  ['a missing Oxford comma in a note', TIMER, t => swap(t, '10m, and 15m', '10m and 15m'), (o, t) => `${TIMER} line ${lineOf(t, "'chip.min'")}: chip.min’s note needs a comma before “and”.`],
  ['a file not laid out', TIMER, t => swap(t, "      en: '{n}m',", "      en:  '{n}m',"), () => `${TIMER} isn’t laid out. Run node tools/words.js --format.`],
  ['the common words not laid out', SDK, t => swap(t, "      en: 'Pause',", "      en:   'Pause',"), () => `${SDK}’s Common words aren’t laid out. Run node tools/words.js --format.`],
  ['a key with no row', PAGE, t => swap(t, "'b21.pause'", "'b21.paus'"), (o, t) => `${PAGE} line ${lineOf(t, "'b21.paus'")}: no row for b21.paus.`],
  ['t() on a board row', PAGE, t => swap(t, "Board21.ui('title.done')", "Board21.t('title.done')"), (o, t) => `${PAGE} line ${lineOf(t, "Board21.t('title.done')")}: title.done is a board row. Show it with Board21.ui().`],
  ['static English with no data-t', PAGE, t => swap(t, '<div class="row chips" id="chips"></div>', '<div class="row chips" id="chips"></div>\n    <p>Ready</p>'), (o, t) => `${PAGE} line ${lineOf(t, '<p>Ready')}: “Ready” isn’t in the words table. Add data-t with its key.`],
  ['a static label with no data-t-aria-label', PAGE, t => swap(t, ' data-t-aria-label="minus"', ''), (o, t) => `${PAGE} line ${lineOf(t, 'id="minus"')}: “Subtract one minute” isn’t in the words table. Add data-t-aria-label with its key.`],
  ['English beside data-t that differs from its row', PAGE, t => swap(t, 'aria-label="Subtract one minute"', 'aria-label="Subtract a minute"'), (o, t) => `${PAGE} line ${lineOf(t, 'Subtract a minute')}: “Subtract a minute” doesn’t match minus in English, “Subtract one minute”.`],
  ['a bare toLocaleString(', PAGE, t => swap(t, '  const PRESETS', '  const BIG = (1234).toLocaleString();\n  const PRESETS'), (o, t) => `${PAGE} line ${lineOf(t, 'toLocaleString(')}: toLocaleString( needs 'en-US'. Numbers always use English rules.`],
  ['a bare toLocaleDateString(', PAGE, t => swap(t, '  const PRESETS', '  const DAY1 = new Date().toLocaleDateString();\n  const PRESETS'), (o, t) => `${PAGE} line ${lineOf(t, 'toLocaleDateString(')}: toLocaleDateString( needs Board21.locale, or use Board21.format.date.`]
];
for (const [name, file, change, want] of BITES) {
  test(`each rule bites: ${name}`, () => {
    need();
    const before = read(file), after = change(before), expect = want(before, after);
    const r = W.check({ files: { [file]: after } });
    yes(r.problems.includes(expect), `want “${expect}” in:\n${r.problems.join('\n') || '(no problems)'}`);
  });
}
test('a broken table is counted in the summary', () => {
  need();
  const r = W.check({ files: { [TIMER]: swap(read(TIMER), "es: '{n} min',", "es: '',") } });
  yes(/^Words: 3 tables, 27 rows\. [1-9]\d* problems?\.$/.test(W.summary(r)), W.summary(r));
});

// ---- 3. Layout.
test('--format leaves every real table as it is', () => {
  need();
  for (const f of [TIMER, 'widgets/traffic-light/words.js', SDK]) eq(W.layout(f, read(f)) === read(f), true, f);
});
test('--format lays out a scrambled copy, and a second run changes nothing', () => {
  need();
  const real = read(TIMER);
  const scrambled = real
    .replace("minus: { note: 'Screen reader name of the −1:00 button.',\n      en: 'Subtract one minute',", "minus: { en: 'Subtract one minute', note: 'Screen reader name of the −1:00 button.',")
    .replace("'chip.min': { note:", '"chip.min":{note:')
    .replace(/\n      (en|es|ru|uk): /g, ' $1:')
    .replace('\n\n    minus', '\n\n\n\n    minus')
    .replace(/\n\/\/ Common words used here[\s\S]*$/, '\n');
  yes(scrambled !== real, 'scrambled');
  const once = W.layout(TIMER, scrambled);
  eq(once === real, true, 'laid out as the real file:\n' + once);
  eq(W.layout(TIMER, once) === once, true, 'twice');
  const sdk = read(SDK), sdk2 = sdk.replace(/\n {8}(en|es|ru|uk): /g, ' $1: ');
  yes(sdk2 !== sdk && W.layout(SDK, sdk2) === sdk, 'the common words region, laid out again');
});

// ---- 4. The Sheet.
const tsv = text => text.trim().split('\n').map(l => l.split('\t'));
test('--sheet timer: the 15 columns, chip.label as four lines, and the hints', () => {
  need();
  const rows = tsv(W.sheet('timer'));
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
test('--apply: a Russian edit changes only that line; a stale line is a conflict; English is skipped', () => {
  need();
  const text = W.sheet('timer'), rows = tsv(text);
  const edit = (key, col, value, form = '') => rows.map(r => r[0] === key && r[1] === form ? Object.assign(r.slice(), { [col]: value }) : r).map(r => r.join('\t')).join('\n') + '\n';
  let r = W.apply(edit('minus', 8, 'Отнять минуту'));
  const after = r.writes[TIMER] || '', before = read(TIMER);
  const diff = before.split('\n').map((l, i) => [l, after.split('\n')[i]]).filter(([a, b]) => a !== b);
  eq(diff, [["      ru: 'Убавить минуту',", "      ru: 'Отнять минуту',"]], 'only minus’s ru line changes');
  yes(r.messages.includes(`${TIMER}: 1 change.`), r.messages.join(' | '));
  // The file changed since the Sheet was made: the Sheet's edit to that line is a conflict, and nothing changes.
  const stale = edit('chip.min', 8, '{n} мин.');
  r = W.apply(stale, { files: { [TIMER]: swap(read(TIMER), "ru: '{n} мин',", "ru: '{n} м',") } });
  eq(Object.keys(r.writes), [], 'nothing written');
  yes(r.messages.includes('Conflict: chip.min in Russian changed in the file since the Sheet was made. File “{n} м”, Sheet “{n} мин.”. Pick one by hand.'), r.messages.join(' | '));
  r = W.apply(edit('plus', 6, 'Add a minute'));
  eq(Object.keys(r.writes), [], 'an English edit writes nothing');
  yes(r.messages.includes('plus: English changes come from the code, not the Sheet. Skipped.'), r.messages.join(' | '));
  r = W.apply(edit('chip.label', 9, '{n} хвилинки', 'few'));
  yes((r.writes[TIMER] || '').includes("uk: { one: '{n} хвилина', few: '{n} хвилинки', many: '{n} хвилин', other: '{n} хвилини' } },"), 'a plural line folds back into its row');
});
test('--list timer and --glossary timer name every Timer key', () => {
  need();
  const keys = Object.keys(Object.assign({}, tableOf(TIMER).window, tableOf(TIMER).board));
  for (const [what, text] of [['list', W.list('timer')], ['glossary', W.glossary('timer')]]) {
    const lost = keys.filter(k => !new RegExp(`(^|\\s)${k.replace(/\./g, '\\.')}(\\s|$)`, 'm').test(text));
    yes(keys.length === 19 && !lost.length, `${what}: missing ${lost.join(', ')}`);
  }
  yes(/Restar un minuto/.test(W.list('timer')) && /one: \{n\} минута/.test(W.list('timer')), 'list shows the languages and the forms by name');
  yes(/glossary, minute \/ minutes: minuto; minutos \| минута; минуты; минут \| хвилина; хвилини; хвилин/.test(W.glossary('timer')), 'glossary shows the entries a row’s English uses');
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
  eq([bad.t('b21.start'), bad.said], ['Iniciar', [['error', '21Board: words() takes a table: { window, board }.'], ['warn', '21Board: "b21.start" is a common word. Use it without a row.']]], 'not a table, and a widget row for a common word');
  const two = engine('en', { window: { 'chip.min': { en: 'a', es: 'b', uk: 'c' }, plus: { en: 'a', ru: 'b' }, z: { en: 'a' } } });
  eq(two.said[0], ['warn', '21Board: 3 rows need more languages. chip.min: Russian. plus: Spanish and Ukrainian. z: Spanish, Russian, and Ukrainian.'], 'rows missing languages, in one warning');
});

// ---- 6. Plurals.
test('plurals: chip.label at 0, 1, 2, 5, 11, 21, 22, 25, and 1.5 in each language', () => {
  need();
  const timer = tableOf(TIMER), N = [0, 1, 2, 5, 11, 21, 22, 25, 1.5];
  const WANT = {
    en: ['0 minutes', '1 minute', '2 minutes', '5 minutes', '11 minutes', '21 minutes', '22 minutes', '25 minutes', '1.5 minutes'],
    es: ['0 minutos', '1 minuto', '2 minutos', '5 minutos', '11 minutos', '21 minutos', '22 minutos', '25 minutos', '1.5 minutos'],
    ru: ['0 минут', '1 минута', '2 минуты', '5 минут', '11 минут', '21 минута', '22 минуты', '25 минут', '1.5 минуты'],
    uk: ['0 хвилин', '1 хвилина', '2 хвилини', '5 хвилин', '11 хвилин', '21 хвилина', '22 хвилини', '25 хвилин', '1.5 хвилини']
  };
  for (const [lang, want] of Object.entries(WANT)) {
    const w = engine(lang, timer);
    eq(N.map(n => w.t('chip.label', { n })), want, lang);
    eq(w.report().fallback, [], lang + ': no fallback');
  }
  const es = engine('es', timer);
  eq([es.t('chip.label', { n: 1000000 }), es.report(), es.said], ['1000000 minutos', { missing: [], fallback: [] }, []], 'es 1000000: many, then other, with no fallback');
  const few = engine('ru', { window: { k: { en: { one: '{n} cat', other: '{n} cats' }, es: { one: '{n} gato', other: '{n} gatos' }, ru: { one: '{n} кот', many: '{n} котов', other: '{n} кота' }, uk: { one: '{n} кіт', few: '{n} коти', many: '{n} котів', other: '{n} кота' } } } });
  eq([few.t('k', { n: 3 }), few.report().fallback, few.said.slice(-1)], ['3 кота', ['k'], [['warn', '21Board: "k" in Russian has no few form, so it shows the other form.']]], 'a ru row missing few uses other and counts a fallback');
  eq(engine('en', timer).t('chip.label'), '{n} minutes', 'no n: other');
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
test('the language from a frame’s name, from the address, and the board’s', () => {
  need();
  const N = { 'b21-board:timer:1;es': 'es', 'b21-board:dev-my-widget:2;uk': 'uk', 'b21-board:timer:1;qps': 'qps', 'b21-board:timer:1': 'en', 'b21-board:timer:1;fr': 'en', 'b21-board:timer:1;ES': 'en', 'b21-board:timer:1;': 'en', 'b21-board:timer:1;es;ru': 'en', 'b21-bare': 'en', '': 'en' };
  eq(Object.keys(N).map(Words.langFromName), Object.values(N), 'names');
  const H = { '#b21-bare&b21-lang=ru': 'ru', '#b21-lang=ru&b21-bare': 'ru', '#x&b21-lang=es': 'es', '#b21-lang=xx': 'en', '#b21-language=es': 'en', '': 'en' };
  eq(Object.keys(H).map(Words.langFromHash), Object.values(H), 'addresses');
  eq([Words.confirm('es', 'en'), Words.confirm('fr', 'ru'), Words.confirm(undefined, 'ru')], ['es', 'ru', 'ru'], 'confirm');
});

// ---- 10. The pseudo language.
test('pseudo: brackets, no English letters, one Cyrillic letter, {n} kept, as long as the longest, ru plural rules', () => {
  need();
  const timer = tableOf(TIMER);
  const look = (s, longest, what) => {
    const inner = s.slice(1, -1), bare = inner.replace(/\{[A-Za-z0-9]+\}/g, '');
    yes(s[0] === '［' && s[s.length - 1] === '］', `${what}: brackets (${s})`);
    yes(!/[A-Za-z]/.test(bare) && (bare.match(/[Ѐ-ӿ]/g) || []).length === 1, `${what}: no ASCII letters, one Cyrillic letter (${s})`);
    yes(inner.length >= longest, `${what}: ${inner.length} long, at least ${longest} (${s})`);
  };
  const minus = Words.pseudo(timer.window.minus);
  look(minus, Math.max(...['es', 'ru', 'uk'].map(l => timer.window.minus[l].length)), 'minus');
  const chip = Words.pseudo(timer.window['chip.min']);
  look(chip, 7, 'chip.min'); yes(chip.includes('{n}'), 'chip.min keeps {n}');
  const label = Words.pseudo(timer.window['chip.label']);
  eq(Object.keys(label), ['one', 'few', 'many', 'other'], 'ru forms');
  for (const f of Object.keys(label)) look(label[f], Math.max(...['es', 'ru', 'uk'].map(l => (timer.window['chip.label'][l][f] || '').length)), 'chip.label ' + f);
  const w = engine('qps', timer);
  yes(w.t('chip.label', { n: 2 }) === label.few.replace('{n}', '2') && w.t('chip.label', { n: 21 }) === label.one.replace('{n}', '21'), 'qps counts by Russian rules');
  eq([w.ui('minus'), w.t('title.done')], ['Subtract one minute', 'Done!'], 'ui() and board rows stay English');
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
  for (const k of ['b21.start', 'b21.pause', 'b21.reset']) yes(['en', 'es', 'ru', 'uk'].every(l => typeof Words.COMMON_WORDS.window[k][l] === 'string' && Words.COMMON_WORDS.window[k][l]), k);
  eq(['en', 'es', 'ru', 'uk'].map(l => engine(l, tableOf('widgets/traffic-light/words.js')).t('b21.reset')), ['Reset', 'Restablecer', 'Сбросить', 'Скинути'], 'found from any widget');
  eq(Words.LANGS, ['en', 'es', 'ru', 'uk'], 'LANGS');
});

// ---- Results ----------------------------------------------------------------------------------------------------------
for (const f of failures) console.log('FAIL ' + f);
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
