# Translating 21Board

For translators and reviewers. Each widget's words are in its `words.js`, with all four languages side by side. The
common words, such as Start and Reset, are in `sdk/board21.js`.

Use the words in [GLOSSARY.md](GLOSSARY.md). They're the ones CCSD21 uses.

## What to change

Change only the text in quotes for your language. Never change a key, `{n}`, a `note`, or the English.

```js
    minus: { note: 'Screen reader name of the −1:00 button.',
      en: 'Subtract one minute',
      es: 'Restar un minuto',
      ru: 'Убавить минуту',
      uk: 'Відняти хвилину' },
```

Type ’ for an apostrophe. A straight `'` ends the text early.

## Plurals

A row with a count has a form for each kind of number. 21Board writes decimals the English way, with a point.

| | one: 1 | few: 2 | many: 5 | one: 21 | other: 1.5 |
| --- | --- | --- | --- | --- | --- |
| Russian | 1 минута | 2 минуты | 5 минут | 21 минута | 1.5 минуты |
| Ukrainian | 1 хвилина | 2 хвилини | 5 хвилин | 21 хвилина | 1.5 хвилини |

Spanish and English have `one` and `other`: 1 minuto, 2 minutos, 21 minutos, and 1.5 minutos. Spanish may add `many`,
for exact millions.

The Sheet's Hint column says which counts take each form:

| Form | Counts |
| --- | --- |
| one | 1. Russian and Ukrainian: 1, 21, 31. |
| few | 2-4, 22-24 |
| many | 0, 5-20, 25-30. Spanish: 1000000. |
| other | Every other count. Russian and Ukrainian: 1.5. |

## Placeholders

Words in braces, such as `{n}` and `{name}`, are filled in when the words show. Keep each one as it is. Move it
where your language needs it.

## Who reads it

| Who reads | Spanish | Russian | Ukrainian |
| --- | --- | --- | --- |
| One student | tú | ты | ти |
| The whole class | ustedes | вы | ви |
| The teacher only, `to: 'teacher'` | tú, with buttons in the infinitive | вы, or no "you" at all | ви, or no "you" at all |

## Spanish

- US Spanish with Mexican words: computadora, celular, pizarrón, jugo, el clima, and maestro.
- Buttons in the infinitive: Iniciar, Pausar, and Restablecer.
- Sentence case, never Title Case.
- Open questions with ¿ and exclamations with ¡.
- Never "excitado". Use "emocionado".

## Russian

- Write ё in children's text: жёлтый, зелёный, and всё.
- No past tense with a student's name. Use the present tense or a colon: Побеждает {name}, Выбрано: {names}.
- The time of day in words: утра, дня, вечера, and ночи.

## Ukrainian

- Ukrainian words, never Russian ones in Ukrainian letters: зараз, тиждень, хвилина, and Скинути.
- No ы, э, ъ, or ё.
- The apostrophe is ’, as in п’ятниця.
- Never call a child by a typed name. Ukrainian would change the name's ending.
- The time of day in words: ранку, дня, вечора, and ночі.

## Length

- `max` is the most characters a spot holds, in every language.
- Choose short words a K-2 student can read aloud.
- Never cut a word to fit. The layout makes room for it.

## Check your work

1. Run `node tools/words.js`. It names each problem with its file and line.
2. Open the Timer in Russian at <https://tylerloch.github.io/21Board/widgets/timer/index.html#b21-bare&b21-lang=ru>.
   For another widget, change `timer` to its folder. For another language, change `ru` to `es` or `uk`. Read every
   word at the window's smallest size.

## The Sheet

Reviewers who don't edit files use the Google Sheet "21Board words", with a tab for each widget. Edit your
language's cell, tick OK, and add a comment if you like. The words files stay the source. Edits come back to them
on request.

**For IT.** `node tools/words.js --sheet timer` prints the Timer's tab. `node tools/words.js --apply edits.tsv`
brings a tab's edits back, and names any word changed in both places.
