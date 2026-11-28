# Release spec: Inter for everything (one bundled font for the board, every widget, and all four languages)

| | |
| --- | --- |
| Repo | /home/user/21Board |
| Base | `origin/lang-1b` at `53a2c4f`, Languages 1b, finished and not yet merged into main. Its sw.js still reads `2026.11.27-2`; it ships as `2026.11.28-1`. |
| Branch and worktree | `inter`, at /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/wt, made with `git worktree add -b inter /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/wt origin/lang-1b` (done). Push `inter` only: never main (`claude/focused-curie-9oovoy`) or `lang-1b`. No pull request. |
| VERSION | `'2026.11.28-2'`. The session that merges 1b and this release renumbers both if it must. "Releases up to 2026.11.28-1" below means 1b and earlier: if 1b ships under another number, that session changes these words too. |
| Spec folder | /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/ |
| Approved look | The font page, /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/r-fonts/page/index.html, section "Inter, built for 21Board" (and "Four languages", "What changes for teachers"). Its board picture: /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/r-fonts/page/img/near-inter.jpg. The Calculator's letters: /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/calculator-letters-corrected.png, middle column "Inter italic". |
| The page's build recipe | /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/r-fonts/page-work/build_fonts.py (the Inter part, lines 51-90) |
| Font sources | /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/r-fonts/dl/inter/Inter[opsz,wght].ttf (876,576 bytes, SHA-256 `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`, "Version 4.001;git-66647c0bb"); /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/r-fonts/dl/inter-italic/Inter-Italic[opsz,wght].ttf (906,596 bytes, SHA-256 `acd98e64795781b2058f07b18475e0ecee2a0fe2b42a49e2f9e37d0d6bf66ce6`); /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/r-fonts/dl/inter/OFL.txt (SHA-256 `5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57`). Inter 4, SIL OFL 1.1, no Reserved Font Name. |
| Surveys | /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/map-board.md, /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/map-sdk-widgets.md, /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/map-tests-docs.md (the reasons behind most choices below) |
| Reviews | Data and look: review-findings.json. Tests: review-tests.json. Every finding is folded in below. |
| Languages 1b spec | /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/lang-1b-spec.md |

Line numbers below are checked against origin/lang-1b at 53a2c4f. Line numbers drift as you edit: find the code by
what it says. The planning session's surveys (map-*.md) are older: trust the code.

**Another session is fixing Board Sync** on main. This release leaves the Board Sync merge region
(`// #region Board Sync merge` … `// #endregion` in board.js) and tests/merge.js exactly as they are: not one line,
not one comment.

## 0. What ships

21Board gets one font for everything: Inter, built for 21Board. The board's own text, every built-in widget, the
widget dev window on 21Board's site, standalone widget pages on its site, uploaded widget files, the Teacher Guide,
and the Calculator manual all draw in it. It is cut down to the letters 21Board shows, in English, Spanish, Russian,
Ukrainian, and Greek, with opsz pinned at 14 and the weight axis kept. Its I has bars, its l a tail, `->` stays `->`,
and its a stays two-story. Its regular draws at about 490 wherever CSS asks for 400, for the back of the room. Bold
stays 700. The Calculator's letters that stand for numbers, and the word "of", switch from Georgia italic to Inter
Italic, cut down to those letters.

Settings › Appearance › Text style goes away, with the Atkinson Hyperlegible and Early Readers fonts and their build
tool. Saved and synced text style values stay where they are, unshown: older releases lose nothing, and nothing breaks.
Notes keeps its Chalkboard and Whiteboard lettering. The SDK goes to 1.7.0.

Teachers see the board's text a little bolder and clearer, one less row in Settings › Appearance, and Russian,
Ukrainian, and Greek in the same letters as English.

## 1. Decisions

### Tyler's decisions (final)
| # | Decision | Built in |
| --- | --- | --- |
| 1 | One bundled font for everything: Inter, built for 21Board as the font page describes (opsz pinned at 14, weight axis kept, ss04 frozen so I gets bars and l gets a tail, calt arrow ligatures dropped so `->` stays `->`). "One font should work for everything." | §3.1 font build, §3.3 board, §3.5 SDK, §3.6 widgets, §7 and §8 guides |
| 2 | Settings › Appearance › Text style goes away, with Atkinson Hyperlegible and Early Readers | §3.3 (Settings, section 12b), §3.2 (files), §3.7 (stored values) |
| 3 | One font for English, Spanish, Russian, and Ukrainian: Cyrillic included, with Ґ ґ Є є І і Ї ї | §3.1 coverage list |
| 4 | Add modern Greek (about +8 KB), not Vietnamese. Greek also gives π, Σ, Δ, θ, μ in Inter. | §3.1 coverage list |
| 5 | A slightly heavier regular: about 490 where the board uses 400 | §3.1 step 5 (in the font), decision 2 below |
| 6 | Keep the two-story a. Never turn on cv11. | §3.1 (no cv11: the subset keeps no cvNN feature) |
| 7 | The Calculator's letters (`.key i`, `.rules i` in widgets/calculator/index.html; `.kp i`, `.rules i` in docs/calculator-manual/page-src.html) become Inter Italic, cut down to the letters used. Its one-story a is expected. | §3.1 italic cut, §3.6 Calculator, §8 manual |
| 8 | Notes keeps its own theme lettering: Crayon Libre for Chalkboard, Excalifont for Whiteboard | §3.6 Notes (unchanged lettering) |
| — | The font page is the approved mockup for the look | lensLook, §10 |

### Made here (each with its reason)
1. **Two files, both variable on weight.** `fonts/Inter-21Board.woff2`, the roman, and
   `widgets/calculator/fonts/InterItalic-21Board.woff2`, the Calculator's letters. One variable file covers every
   weight the board and widgets use (300 to 900, map-sdk-widgets §4.1) for about the size of two static ones, so 500,
   600, 650, 750, and 800 are real weights and nothing is synthesized bold. The `-21Board` suffix marks our cut, as
   Notes' `CrayonLibre-21Board.woff2` does. Each folder gets `Inter-OFL.txt`, a copy of the upstream OFL.txt.
2. **The regular is made heavier inside the font, not in CSS.** The build moves fvar's wght default and composes a new
   avar, so CSS 400 draws the original 490, 500 draws 560, 600 draws 630, and 300 and below, 700 and above draw as
   before (map-sdk-widgets §4.2, way E). Reasons: every widget, canvas text, the guides, and
   the manual get it with no CSS edit; computed styles still read 400, so no test that reads `fontWeight` moves; bold
   stays 700 and `<b>` stays `bolder`; it costs 0.2 KB. The default outlines stay the original 400's, so a renderer
   that applied no variations would draw plain Inter, and one that ignored avar about 455. The builder proves it in a
   real browser once (§3.1 step 9).
3. **Text style values are kept, inert.** `letters` stays one of `Merge.STYLE_PARTS`, so the Board Sync merge region,
   device files, and tests/merge.js are unchanged, to the byte. This release never shows, applies, changes, or stamps it: nothing
   sets `lettersAt` any more. Stored `letters` and `lettersAt` stay in the settings record. Exports stop writing
   `letters`, and imports ignore it. Older releases lose nothing: a device still on 2026.11.28-1 or before keeps its
   text style, and keeps syncing it with other such devices through this one (map-board §3e, §3f). One edge: a text
   style chosen here before the update and never synced reads as chosen, so it goes out once, at its old time
   (map-board §3f item 1). A later release drops `letters` from `STYLE_PARTS` once no device needs it (one rewrite of
   each device file).
4. **The board's `@font-face` is added by board.js at boot**, once, from the folder board.js came from, and only where
   fonts can load: 21Board's own site or disk, never an AI tool's preview or the sealed lab (today's `LETTERS_HERE`,
   renamed `FONT_HERE`). Not in index.html: tools/build-sdk.js copies its `<style>` into the dev window's shell, where
   a relative `url()` would 404. No `<link rel="preload">`: the face is fetched at boot from the offline copy anyway,
   and preload warnings would reach test consoles.
5. **SDK 1.7.0.** `--b21-font` now always leads with Inter inside the board, the `theme` event no longer fires for a
   text style, fonts load at once, and every font that loads refits the window. No new API. `Board21.version` lets a
   widget tell.
6. **Uploaded widget files get Inter too.** Their sealed page's CSP allows `font-src data:`, so the board puts a data:
   `@font-face` for Inter into the sealed page beside the inlined SDK, read once per session from the offline copy.
   If that read fails, the page goes without it and its text falls back to the device's font.
7. **The Clock's Old face keeps its serif Roman numerals** (`--serif`, widgets/clock/index.html:12, :69). It is a clock
   face's design, like Notes' theme lettering (Tyler's decision 8), it draws only I, V, and X, and nothing is bundled
   for it. Every other Clock text is Inter.
8. **Notes' two stacks put Inter before the device's font**: `CHALK_FONT` and `MARKER_FONT`
   (widgets/notes/index.html:81-82) gain `"Inter", ` right before `system-ui`. Crayon Libre has no Cyrillic or Greek, so
   those letters in a Chalkboard note now draw in Inter (or Comic Sans MS, the stack's Windows look-alike, as before)
   rather than in the device's font. Latin chalk and marker lettering is unchanged.
9. **The Calculator's letters get their own family, "Inter Letters"**: a, b, f, n, o, and x, declared italic in the
   Calculator's own `<style>`. `.key i`, `.rules i`, and `.ce-word` use `"Inter Letters", var(--b21-font)`. A
   separate family means any other italic in the frame stays synthetic Inter, never the device's italic. "of"
   (`B.word('of')`, calc-engine.js:858, :1005) is italic today, so it becomes real Inter Italic too (+0.7 KB), and its
   slant matches the letters beside it.
10. **Name Picker's Versus names stay as they are**: `font-style: italic` at 900 plus `skewX(-9deg)`
    (style-versus.js:22). Inter has no Black Italic here, so the browser slants Inter Black itself (12° to 14°), plus the
    9° skew. That is close to today's lean on Chromebooks (Roboto Black Italic, about 12°, plus 9°). Checked in a final
    shot.
11. **Ticking numbers get tabular digits.** Inter's default digits are proportional. Task Timer's countdown
    (`.digital-clock-time`, widgets/task-timer/index.html:107-112) leaves `monospace` for
    `font-family: inherit; font-variant-numeric: tabular-nums`, so it is Inter too, and "Total left"
    (`#clock-total-left`, :632) gets `tabular-nums`. Every other ticking number already has them. The font keeps `tnum`
    and `pnum` and freezes neither.
12. **The 1a font hook goes.** `LANG_FONT`, `FACE_SCRIPTS`, `LANG_SCRIPT`, and `fontFor` (sdk/board21.js:284-295, their
    exports :408, :411, and the call :108) existed only to drop a Latin-only font in Russian and Ukrainian windows. One
    font draws all four now, so nothing is left to drop.
13. **The pseudo language's 12 letters are in the font** (ƀ ƒ ɱ ʠ ṽ ẋ Ɓ Ƒ Ṁ Ǫ Ṽ Ẋ, +1.2 KB), so 1b's "nothing cut off"
    audit measures Inter, not a mix. ［ ］ stay on the device's font.
14. **Inter keeps its own line height** (1.21 em). CI already measures every test in stock Inter 4.0 at opsz 14
    (.github/fonts/56-prefer-inter.conf), which has the same vertical metrics.
15. **Developer chrome and pages shown without the board stay in the device's font**: the dev window's toolbar
    (sdk/board21-dev.js), the lab's own chrome (sdk/lab.html), the SDK's standalone menu (`data-b21-chrome`), the
    `<noscript>` line, and `DevFiles.note`. They run on other sites or when 21Board's files can't be reached. sw.js's
    offline page is a window's words, so it gets Inter from the offline copy (§3.2), falling back silently.
16. **No new "Updated to" message.** The change shows for itself. The Teacher Guide and README say it.
17. **The SDK Playground loses its "Text style" context row** (widgets/sdk-playground/index.html:506-551).
18. **Tests wait for fonts before measuring.** `boardUp` and `addWin` (tests/lib.js) also wait for
    `document.fonts.ready`, in the board and in the new window's frame. The guide's `shot()` does the same.
19. **One coverage list for the tool and the tests**: `tools/inter-chars.json`. The build reads it; tests/words.js
    checks the shipped font against it and against every words table.
20. **The upstream TTFs are not committed.** The tool takes their paths, checks their SHA-256s, and refuses others.
    README's For IT and the tool's header give the URLs and hashes.
21. **CLAUDE.md doesn't change.** Its Languages rule "Every font a widget uses needs Latin and Cyrillic letters." holds
    for Inter. Notes' chalk lettering is Tyler's exception (decision 8), with Inter behind it.
22. **CI keeps installing Inter as the system font.** Text the board's font doesn't draw (dev chrome, previews, emoji's
    neighbors) still measures the same. Only the comment and README line change.

## 2. Not in this release
- No change at all to the Board Sync merge region (`// #region Board Sync merge` … `// #endregion`), not even a
  comment, and none to tests/merge.js or its fixtures. Another session is changing them. `letters` stays a style part
  (decision 3).
- No change to any words table, the Common words, or tools/words.js.
- No change to the Notes fonts or their build tool (tools/build-chalk-font.py).
- No Vietnamese, no Inter Display, no other weight axis work, no cv11.
- No change to the district apps (21Sketch, 21Timer, 21DocCam): they keep their own fonts.
- LICENSE and LICENSE-DOCS are never touched. Tyler uploads them himself.
- CLAUDE.md, docs/RELEASING.md, tools/release-workflow.js, and tests/timings.json are not edited.
- Nothing is published: not the Teacher Guide, not the Calculator manual. The session publishes them after the merge.

## 3. What to build, file by file

### 3.1 tools/build-inter.py (new) and tools/inter-chars.json (new); tools/build-letter-fonts.py deleted
A port of the page recipe (build_fonts.py:51-90) with everything it left out. Python 3, fontTools and brotli only.

**Header** (the docstring): what it builds, the two outputs, the sources with their google/fonts paths
(`ofl/inter/Inter[opsz,wght].ttf`, `ofl/inter/Inter-Italic[opsz,wght].ttf`, `ofl/inter/OFL.txt`), sizes, SHA-256s,
"Version 4.001;git-66647c0bb", the tested tool versions (fontTools 4.68.0, brotli 1.2.1, Python 3.13), what is done
to the font (the steps below), and how to run it:
`python3 tools/build-inter.py path/to/Inter[opsz,wght].ttf path/to/Inter-Italic[opsz,wght].ttf`.
Options: `--out DIR` (default: the repository; writes `fonts/Inter-21Board.woff2` and
`widgets/calculator/fonts/InterItalic-21Board.woff2` under it), `--flavor woff2|ttf` (ttf, to look at the result),
`--check` (builds into a temporary folder and compares bytes with the shipped files; exit 1 and the differing file if
not equal). It does not copy OFL.txt: the README says to.

**Steps, the roman:**
1. Check the source's SHA-256; refuse any other file. Print the fontTools and brotli versions; with any other than
   4.68.0 and 1.2.1, warn that the bytes may differ (and `--check` says so first).
2. Re-run itself with `PYTHONHASHSEED=0` if it isn't set. Open every font and reload with `recalcTimestamp=False`
   (map-tests-docs §5b: the timestamp alone changes the WOFF2's bytes).
3. `instancer.instantiateVariableFont(font, {'opsz': 14}, updateFontNames=False)`: opsz pinned, wght 100-900 kept.
4. Drop the `calt` lookups that make `*rrow*` or `uni27F*` glyphs, directly or through the lookups they call (47, 48,
   and 51 in 4.001; 49 and 50 are called only by 48, which turns `<-` into ←). The recipe found only 47 and 51.
   Assert exactly 3 are dropped.
5. Make CSS 400 draw the original 490 (decision 2). The user-space remap is piecewise linear through
   100→100, 300→300, 400→490, 700→700, 900→900 (so 500→560, 600→630). Compose it with the font's own avar into a new
   avar `wght` segment map, and move fvar's wght default to the user weight that maps to the original default (400),
   so the default outlines stay the original 400's. Assert: with `instancer`, the advances of n, o, H, Ж, and π at new
   400, 500, 600, 700, and 300 equal the source's at 490, 560, 630, 700, and 300, within 1 unit.
6. Freeze ss04 by pointing every cmap entry at its ss04 glyph, as the recipe does. Assert exactly 46 glyphs.
7. Subset to `tools/inter-chars.json` `roman`. First stop with an error naming every listed code point the source's
   cmap lacks (an upstream change is caught here, not in CI). Options as the recipe: default layout features plus
   `tnum` and `pnum` (never cv11 or any other ss), every name ID and language, a `.notdef` outline. Keep STAT, HVAR,
   and MVAR: WebKit treats a variable font with no STAT as old TrueType GX and skips the remap on iPad. Drop only
   DSIG.
8. Name ID 5 gets `; 21Board subset` after the version. Family names stay "Inter" (no Reserved Font Name).
   Save as WOFF2 (or TTF with `--flavor ttf`) with `recalcTimestamp=False`. Print the size.
9. **Once, in the build (not a repo test): the browser proof.** In one Chromium, load the built woff2 and the source
   TTF as two FontFaces on a scratch page; measure canvas widths of `nnnn oooo HHHH Жжж πππ` at CSS 400, 500, 600, and
   700 in the built font against 490, 560, 630, and 700 in the source: equal within 0.5%. Also a picture of one line,
   `Il1 0Oo rn m ag Готово Ґґ Єє Іі Її πΣΔθμ`, at 24 and 48 px, stock Inter 400 above, built Inter 400 below. Save
   both in the spec folder as `weight-proof/weight-proof.log` and `weight-proof/weight.png`.

**The italic:** steps 1-3 and 5 on Inter-Italic (same remap, so `.key`'s 500 matches the roman keys), no calt or ss04
work, subset to `tools/inter-chars.json` `italic` (a b f n o x). Same options and naming.

**tools/inter-chars.json** (new), exactly:
```json
{
  "note": "The characters tools/build-inter.py keeps, as code points in hex. tests/words.js checks the shipped fonts against this list and every words table. 'fallback' lists characters 21Board shows that Inter doesn't have: the device's font draws them.",
  "roman": {
    "Basic Latin": ["0020-007E"],
    "Latin-1 Supplement": ["00A0-00AC", "00AE-00FF"],
    "Latin Extended-A, for names": ["0100-0148", "014A-017F"],
    "Romanian": ["0218-021B"],
    "The pseudo language": ["0180-0181", "0191-0192", "01EA", "0271", "02A0", "1E40", "1E7C-1E7D", "1E8A-1E8B"],
    "Ukrainian apostrophe": ["02BC"],
    "Greek": ["037E", "0384-038A", "038C", "038E-03A1", "03A3-03CE"],
    "Cyrillic": ["0400-045F", "0490-0491"],
    "Calculator": ["1D47"],
    "Spaces": ["2009", "200B", "202F"],
    "Punctuation": ["2013-2014", "2018-201A", "201C-201E", "2022", "2026", "2032-2033", "2039-203A", "2044"],
    "Superscripts": ["2070", "2074-2079", "207B", "207F"],
    "Signs": ["20AC", "2116", "2122", "2154"],
    "Arrows": ["2190-2193", "21BA"],
    "Math": ["2212", "221A", "2248", "2260", "2264-2265"],
    "Symbols": ["21B5", "2304", "2318", "232B", "25B2", "25B6", "25BC", "2713"]
  },
  "italic": "abfnox",
  "fallback": ["21B6", "21B7", "21C4", "221B", "FF3B", "FF3D"]
}
```
Notes on the list:
- It holds every character of the page recipe (BUILD, SYMBOLS, Cyrillic), modern Greek with no reserved points
  (π Σ Δ θ μ included), and every character the surveys found shown on screen: U+2009 (the Calculator's " = "),
  U+202F (its digit groups), U+02BC (Ukrainian dates from `Intl`), U+1D47 ᵇ, U+21BA ↺ (First/Then, Task Timer),
  U+2713 ✓ (Weather, Zones), U+25B6 ▶ (Task Timer's "▶ Start"), U+200B (Notes' sizer), and U+2304 ⌄, which the
  Teacher Guide's prose uses 24 times. ↵ ⌘ ⌫ ▲ ▼ are in the guides' prose (page-src.html of each), a few hundred
  bytes. Inter has no soft hyphen (U+00AD) or ŉ (U+0149), so the ranges skip them.
- ∛ is in the recipe's SYMBOLS but not in Inter: it moves to `fallback` (the keypad draws ³√).
- ⇄ ↶ ↷ (the Calculator's Test practice message), ［ ］ (pseudo), ▦, ⏸ ⏱ ⏮ ⏭ ⌛ ⏳ ⏰, ✔ ✕ ➔ ⭐, and emoji stay on the
  device's font, as today. Only the first five are listed, because a check could otherwise meet them.
- Expected sizes, printed by the tool: the roman about 66 KB (Latin 47.9, Cyrillic +9.3, Greek +7.9, the rest about
  +1.5); the italic about 4 KB. Today's four font files take 83 KB.

**Delete** tools/build-letter-fonts.py. Its Andika renaming and line-height code has no use left.

### 3.2 fonts/, widgets/calculator/fonts/, sw.js, widgets/registry.js
- `fonts/`: delete `AtkinsonHyperlegible-Regular.woff2`, `-Bold.woff2`, `-OFL.txt`, `EarlyReaders-Regular.woff2`,
  `-Bold.woff2`, `-OFL.txt`. Add `Inter-21Board.woff2` (the tool's output) and `Inter-OFL.txt` (the upstream OFL.txt,
  byte for byte).
- `widgets/calculator/fonts/` (new): `InterItalic-21Board.woff2` and `Inter-OFL.txt` (the same OFL.txt).
- sw.js `SHELL_FILES` (:100-106): the six font lines and their comment become
  ```js
  // The board's font, Inter (board.js, "The board's font"), and its license
  'fonts/Inter-21Board.woff2',
  'fonts/Inter-OFL.txt'
  ```
  sw.js's `offlinePage` (:192) gets `font:16px "Inter",system-ui` and
  `<style>@font-face{font-family:"Inter";src:url("${new URL('fonts/Inter-21Board.woff2', self.registration.scope)}") format("woff2");font-weight:100 900}</style>`.
  The cache serves the file; with no copy, the page falls back silently.
  `FILES` and `BUILD` come from tools/release.js. VERSION is bumped by the stamp. sw.js's activate step already deletes
  every older copy, so Atkinson and Early Readers leave each device with the old copy.
- widgets/registry.js, the Calculator (:230-231): `files: ['widgets/calculator/index.html', 'widgets/calculator/calc-engine.js', 'widgets/calculator/fonts/InterItalic-21Board.woff2', 'widgets/calculator/fonts/Inter-OFL.txt']`.

### 3.3 board.js
**The board's font** replaces "---- Text style (easier-to-read fonts)" (:4824-4895) in section 12b:
```js
// ---- The board's font
// Inter, built for 21Board (tools/build-inter.py): one font for 21Board and every widget, in English, Spanish, Russian,
// Ukrainian, and Greek. Its regular is a little heavier, its I has bars and its l a tail, and -> stays ->. It is part of
// the offline copy (sw.js). Widgets get it first in their palette (--b21-font, paletteFor), and the SDK adds the same
// face in their frames. Anything it doesn't have (▦, emoji…) comes from the device's own font, next in the stack.
```
- Keep `FONT_BASE` (:4852). Rename `LETTERS_HERE` (:4858) to `FONT_HERE`, same test, and reword its comment: on
  21Board's own site or disk the font loads; in an AI tool's preview or the sealed lab the board uses the device's font
  and fetches nothing, so the preview's console shows only the widget's own errors.
- `const BOARD_FONT = (FONT_HERE ? '"Inter", ' : '') + PALETTES.light.font;`
- `applyFont()` (once, at boot, before Settings, the Widget Picker, and the clock in the corner first draw; keep the
  "before the clock, which measures its text" note): when `FONT_HERE`, add
  `<style id="board-font">@font-face { font-family: "Inter"; src: url("${FONT_BASE}fonts/Inter-21Board.woff2") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }</style>`
  to `<head>`, set `document.body.style.fontFamily = BOARD_FONT`, and start the load with
  `document.fonts.load('16px "Inter"').catch(() => {})`.
- Delete `LETTERS`, `LETTER_SAMPLE`, `letterKey`, `letterFont`, `applyLetters`, `letterSettings`, and `letterAct`.
- `DEFAULT_SETTINGS` (:124): remove `letters`. Reword the comment line 1b left above `widgetLanguage` so it names the
  theme, accent color, and default widget language. Do not add `letters` to `OLD_SETTINGS`: the merge still reads it.
- `paletteFor` (:193): `font: BOARD_FONT`.
- `applySettings` (:1326): `themeSig` drops `letterKey()` and its comment.
- `applyClassroom` (:4180-4185): drop `applyLetters()`. Section 12b's header comments (:4176-4178, and the map at
  :4160-4166) drop "text style" and "Text style ▸".
- `classroomAct` (:4200): drop `|| letterAct(act, val)`.
- `Settings.render` Appearance (:5413): drop `${letterSettings()}`. Appearance is Theme, Background ▸, Accent color,
  Board shape, in the dev window and lab too.
- `noLook` (:5123-5125): drop the three `letters` replaces; keep 1b's `lang-opt` ones. `putLook` (:5161, :5170): drop
  `[data-act="letters"]` and the `letters` `.v` copy. `Settings.init`'s comment (search "Text style and Size") becomes
  "Size changes the page…".
- The Widget Picker (:3220) and the clock in the corner (:4634) keep their `loadingdone` re-measures. Reword their
  comments: Inter can arrive after the first paint.
- About (:5010-5016): the comment's "(see LETTERS_HERE)" becomes "(see FONT_HERE)". `ABOUT_FONTS` becomes
  `[['Inter', 'by Rasmus Andersson and the Inter Project Authors', OFL], ['Excalifont', 'by Excalidraw', OFL], ['Crayon Libre', 'by GGBotNet', 'CC0 1.0'], …the two Weather lines as they are]`.
- Sealed uploads (`DevFiles`, :455-475): next to `sdk()`, a cached `font()` that fetches `fonts/Inter-21Board.woff2`
  from the offline copy once and makes a `data:font/woff2;base64,…` URL. The sealed page gets
  `<style>@font-face { font-family: "Inter"; src: url(data:…) format("woff2"); font-weight: 100 900; font-display: swap; }</style>`
  once, right after the CSP `<meta>` (`top + meta + fontStyle + …`), outside the file's own markup, so an HTML comment
  in the file can't swallow it and it isn't repeated per SDK tag. On a failed fetch it goes without (decision 6).
  `DevFiles.note` stays `system-ui`.

**The text style, kept inert** (decision 3):
- Outside the merge region, a list of the style parts this release shows and changes. `Merge` is declared further down
  the file, so a top-level `const` before it would throw: make it a function. Put it beside the Import code
  (`parseBoardFile`), not next to the region's markers, so it can't conflict with the other session's edits:
  `const lookParts = () => Merge.STYLE_PARTS.filter(k => k !== 'letters');   // 'letters', the text style, is chosen only by releases up to 2026.11.28-1. Board Sync carries it for them.`
- `buildExport` (:5790): drop `letters`. Templates, Board history versions, Duplicate this page, and folder copies
  stop carrying it (they go through `buildExport`).
- `parseBoardFile` (:5916): drop the `letters` line, so a file's `letters` is ignored.
- Import dialog (:5970-5972): `look0` keeps only `lookParts()` keys, and the `looks` list drops its `'text style'`
  clause. The Undo loop (:5996) and `applyImport`'s Replace loop (:6134) loop over `lookParts()`. So Replace and its Undo
  never write `letters` or stamp `lettersAt` (map-board §3f item 5: an Undo that stamped it would reset every older
  device to Standard).
- `Pages.addFrom` (:3929): drop `letters: null`.
- Board history (:8687, :8763, :8881): keep `delete exp.letters`, since versions saved before this release hold it.
  The comment at :8763 drops "text style".
- `MergeUI.style` (:10885-10891): drop the `text` clause and the `LETTERS` read; its comment drops `letters`. An entry
  holding only `letters` gives `''`, and `MergeUI.shown` already says nothing for empty text.
- The merge region keeps every line and every comment. lookParts' comment, outside it, says why `letters` is still
  a style part.

**Everything else that names the text style or the old fonts in board.js** (comments at :4825-4861, :4832, :5010, and
any other match for `text style`, `Text style`, `letters`, `Atkinson`, `Andika`, or `Early readers`) is reworded or
removed, except inside the merge region (untouched), `delete exp.letters`, and lookParts.

### 3.4 index.html
- The Text style cards' CSS (:815-827): each rule keeps only its `.lang-opts` or `.lang-opt` half (1b decision 18), and
  `.letter-opt .sample` (:823) goes. The comment (:815-817) names only the Default widget language's cards. The rules'
  values don't change, so 1b's cards look exactly as before.
- `body`'s stack (:78) stays the system stack: board.js sets Inter (§3.3), and the `<noscript>` line keeps `system-ui`.
- Then `node tools/build-sdk.js` (sdk/dev/board-shell.js is a copy).

### 3.5 sdk/board21.js (SDK 1.7.0)
- `SDK_VERSION = '1.7.0'` (:36).
- The text style block (:115-160) becomes "the board's font":
  - Comment: `--b21-font` starts with Inter inside 21Board. Its face is added here, pointing at the board's `fonts/`
    next to this script, and loads at once. A widget on another site that loads this script from the board gets it
    only if the board's site allows it (CORS). One with its own copy of the SDK gets it only if a `fonts/` folder is
    next to it. Text a widget fits to its window is fitted again once any font has loaded.
  - `var BOARD_FACES = { 'Inter': 'Inter-21Board.woff2' };`
  - `applyFace(font)` (renamed from `applyLetters`): when the stack's first family is a key of `BOARD_FACES`, `fontBase`
    is set, and it isn't added yet, append `<style data-b21-font="Inter">@font-face { font-family: "Inter"; src: url("<fontBase>Inter-21Board.woff2") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }</style>`,
    then `document.fonts.load('16px "Inter"')` (caught). Keep the refit when the stack changes.
  - `document.fonts` `loadingdone` (:158-160) calls `refit()` always: Inter, Notes' fonts, and the Calculator's
    letters all refit the window once loaded, and so do faces a host put in (sealed uploads, the manual).
- `applyTheme` (:105-113): use `palette.font` as is. Drop the `Words.fontFor` call and its comment.
- `#region Words`, "---- Fonts" (:283-295): delete `LANG_FONT`, `FACE_SCRIPTS`, `LANG_SCRIPT`, and `fontFor`, and their
  names in the exports (:408, :411). Keep the region's markers.
- Standalone (`startStandalone`, :553-582): `PALETTES` stays as it is. When `fontBase` is on the page's own origin, or
  both are `file:`, the palette it uses gets `font: '"Inter", ' + PALETTES[t].font`; otherwise the system stack, so an
  AI tool's preview fetches nothing. Same for the theme flip (:570-574).
- The SDK's own chrome (the standalone `<select>`, the dev note bar) stays `system-ui`.

### 3.6 Widgets
| Widget | Change |
| --- | --- |
| Calculator, widgets/calculator/index.html | In its `<style>`: `@font-face { font-family: "Inter Letters"; src: url("fonts/InterItalic-21Board.woff2") format("woff2"); font-style: italic; font-weight: 100 900; font-display: swap; }`. `.rules i` (:115) and `.key i` (:237) become one rule with `.ce-word`: `.key i, .rules i, .ce-word { font-family: "Inter Letters", var(--b21-font); font-style: italic; }`. calc-engine.js's `.ce-word { font-style: italic; }` (:2113) stays. The comment at :1139 drops "also when the text style changes". |
| Task Timer | `.digital-clock-time` (:107-112): `font-family: inherit; font-variant-numeric: tabular-nums` in place of `monospace`. `#clock-total-left`: `font-variant-numeric: tabular-nums`. Comments :31, :151, :1780-1781 reworded. |
| Clock | Its date's longest-line cache (`refKey`, :665, :690) is reset when a font finishes loading: `document.fonts` `loadingdone` sets `refKey = null` and lays out (beside `fonts.ready.then(layout)`, :1361), so the longest day is measured in Inter. `--serif` stays (decision 7). Comment :1360 reworded. |
| Notes | `CHALK_FONT` and `MARKER_FONT` (:81-82): `"Inter", ` before `system-ui` (decision 8). Nothing else. |
| SDK Playground | Remove the `text-style` context key (:506), `textStyle()` (:510-513), its row label (:523), and its value (:551). Comment :509 goes. |
| Name Picker | No code change (decision 10). Comments that name the text style reworded: index :50, :994; style-lotto :9; style-spotlight :129, :525; style-groups :60, :314; style-versus :325, :330; style-bracket :83, :454; style-wheel :711. |
| Others | Comments only: zones :383-384; stopwatch :676, :1561; first-then :20, :32; weather :1527; youtube-player :44; timer :291-292. |

### 3.7 Stored, synced, and exported values (what older releases see)
| Where | This release | An older release reading it |
| --- | --- | --- |
| Settings record | `letters` and `lettersAt` left as they were; never written | the same record, unchanged |
| Device file (Board Sync) | still writes `letters` and its `sync.style.letters` version, exactly as 1b does, from the stored value. Never stamps a new choice, but a choice made here before the update and never synced goes out once, at its old time | sees the same files as from 1b: keeps its text style, and syncs it with other older devices through this one |
| A newer version from an older device | taken into `settings.letters` silently, passed on in this device's file | gets it, as today |
| Exports, templates, history versions, Duplicate | no `letters` key | reads `null`, and Import › Replace leaves its text style as it is (DATA-FORMAT) |
| Imports of older files with `letters` | ignored; Replace and its Undo never stamp `lettersAt` | — |
| `FORMAT_VERSION`, `sync.v` | unchanged | — |
Nothing is migrated, and no device file is rewritten because of this release.

### 3.8 NOTICE, About, and licenses
- NOTICE: the Atkinson and Andika lines become one line, first in the fonts list:
  `- Inter, by Rasmus Andersson and the Inter Project Authors. SIL Open Font License 1.1.`
- About: §3.3. The OFL texts ship as `fonts/Inter-OFL.txt` and `widgets/calculator/fonts/Inter-OFL.txt`.
- LICENSE and LICENSE-DOCS: never touched.

### 3.9 Stamp
VERSION `'2026.11.28-2'` (or the next free number at launch) in sw.js. `node tools/build-sdk.js`, then
`node tools/release.js`, then both with `--check`. The offline copy loses six files and gains four.

## 4. Every word a person sees that changes

### 4.1 Teachers
| Where | Old | New |
| --- | --- | --- |
| Settings › Appearance | `Text style` row (value `Standard`, `Easier to read`, or `Early readers`; `On all your devices.` when linked), its cards and hints, the sample `Il1 0 ag` | (gone). Appearance: Theme, Background, Accent color, Board shape |
| Settings in the dev window and lab | `Text style` / `Easier-to-read fonts can’t load in this test board. Try them in 21Board itself.` | (gone) |
| Board Sync message | `The laptop changed the theme to Dark and the text style to “Easier to read”.` | never names the text style. A text style from an older device says nothing. |
| Import › Replace this page, its sub | `… So is the text style.`, `… So are the theme, accent color, and text style.` | the list never names the text style: `So is the theme.`, `So are the theme, accent color, and default widget language.` |
| Settings › About › Credits | `Atkinson Hyperlegible by the Braille Institute`, `Andika by SIL International` (each `SIL Open Font License 1.1`) | `Inter by Rasmus Andersson and the Inter Project Authors` / `SIL Open Font License 1.1`, first |
| Everywhere | system font, or the text style | Inter, a little heavier; Calculator letters in Inter Italic |

### 4.2 Students
No words change. Every window's words are in Inter, in all four languages.

### 4.3 Developers
| Where | Old | New |
| --- | --- | --- |
| SDK Playground › Context | row `Text style` | (gone) |
| `Board21.version` | `1.6.0` | `1.7.0` |

### 4.4 Docs and the Teacher Guide
§6 and §7. The Teacher Guide gets one new FAQ (§7). Every line follows CLAUDE.md's Voice.

## 5. Tests

Write them first and show they fail on the base (origin/lang-1b at 53a2c4f). Keep the log next to this spec (`fail-first.log`).
Follow docs/RELEASING.md, "Writing tests": each rule once, at two or three sizes; no exact pixel positions; no check
tied to this release (no file counts, no sizes, no version). Never `require()` tests/run.js.

### 5.1 tests/words.js (Node, no new dependency; runs as "Languages: the Node check of every words table")
- New helper `tests/woff2.js` (about 70 lines, written from the WOFF2 spec; /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/try/woff2.js is a planning
  sketch): reads the table directory (flags byte, tag index or 4-byte tag, UIntBase128 origLength, and transformLength
  only when the table is transformed: glyf or loca with transform version 0, any other table with version 1-3), runs
  `zlib.brotliDecompressSync` on the one stream, and slices tables in directory order. It returns the table tags,
  `cmap` (formats 4 and 12), `fvar` axes, and `avar` segment maps. No other module. The build keeps fontTools'
  default, which transforms only glyf and loca.
- Test 11 (fonts: `fontFor` cases, :498-504) is replaced by three:
  - **11a** `fonts: the board's font has every letter in every words table, and the list` — every code point in
    `tools/inter-chars.json` `roman` is in `fonts/Inter-21Board.woff2`'s cmap; and every letter, mark, number,
    punctuation, symbol, and space (`\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}`, leaving out `\p{Extended_Pictographic}`) in every words table, all four languages, the Common words,
    and the pseudo language's form of every row is in it or in `fallback`. A failure names the character as U+ and
    its table. `fallback` holds none of `roman`'s.
  - **11b** `fonts: one weight axis and a heavier regular` — `fvar` has only `wght`, 100 to 900;
    its default is under 400; `avar` maps CSS 400 above the default (normalized > 0), keeping 400 < 500 < 600 < 700.
    (I with bars is F1 item 2's, in the browser.) Both shipped fonts have STAT, fvar, avar, gvar, and HVAR tables (from the WOFF2 table
    directory).
  - **11c** `fonts: the Calculator's letters` — `widgets/calculator/fonts/InterItalic-21Board.woff2` has every letter
    inside `<i>…</i>` in widgets/calculator/index.html and docs/calculator-manual/page-src.html, and every letter of the
    words calc-engine.js passes to `.word('…')`; `fvar` is `wght` alone.
- The header comment's list (item "5-12") says fonts as above. `plain` (:501) goes with test 11.

### 5.2 tests/suites/settings.js: the board's font
The three "Text style (Letters)" suites (:1421, :1514, :1648; 38 s) become two, named for what they test. Keep each
port the map lists (map-tests-docs §1a).

**Suite F1** `Board font: Inter in 21Board and every widget, its shapes, late and offline, and nothing from another site` (about 25 s):
1. A fresh board: `document.fonts` has a face `Inter` with weight `100 900`, style `normal`, status `loaded`; the body's computed font-family starts with `Inter`.
2. Shapes: on a canvas in the board's font at 100 px, `I` is at least 1.4 × as wide as `l`. And `->`, `<-`, and `=>`,
   each in two spans at 48 px, one plain and one with `font-feature-settings: "calt" 0`, give the same pictures
   (element screenshots equal): no arrow ligature is left. Stock Inter fails both.
3. Every visible text of the board's own (page, title bars, Widget Picker, Settings, page label, menus, messages, shape
   tip, dialogs) computes to a stack that starts with `Inter` (port of the walk at :1464-1468).
4. Clock, Timer, Notes (Sticky), Task Timer, and First/Then: every word, on buttons and in boxes too, computes to
   Inter, Task Timer's countdown included; each frame's `document.fonts` has `Inter` loaded. A Timer set to Русский
   through `inst.language`: its chips compute to Inter. A Chalkboard note keeps `Crayon Libre` first, with `Inter`
   before `system-ui`. Task Timer's countdown and Total left keep their width as the digits change: the countdown with
   11:11 is as wide as with 00:00.
5. No request leaves the site. Every font file requested is on the board's site and in the offline copy's list (sw.js's own list, or a widget's registry `files`), such as `fonts/`, `widgets/calculator/fonts/`, and Notes' `widgets/notes/fonts/`. No page errors.
6. The offline copy: every file in `fonts/` and `widgets/calculator/fonts/` on disk is in sw.js's list (compare sets,
   never counts). A stamped release offline: Inter loads
   in the board and in a widget.
7. Late font: hold every `.woff2` request behind a gate the test opens (`ctx.route(/\.woff2$/, async r => { await gate;
   await r.continue(); })`, no timer). Record draws and font arrival in every frame from the start with
   `ctx.addInitScript` (wrap `CanvasRenderingContext2D.prototype.fillText` into `window.__drawn`, note `loadingdone`
   times, and listen for the window's `resize`). Open the board with `boardUp(page, { fonts: false })` and each widget
   with `addWin(page, id, { fonts: false })`, and open the Widget Picker. Then open the gate. Once Inter arrives, the
   Clock, Timer, Calendar, a note, Name Picker, and the Spinning wheel fit their windows (nothing sticks out, shrunk text fills its room again), Task
   Timer draws its pie in Inter after `loadingdone`, and a widget's `Board21.on('resize')` fires after the font
   arrives. The Widget Picker shows each name as a fresh Widget Picker does afterwards (the same names cut with …,
   nothing past its tile). (Ports of :1593-1645, run once, not per style.)

**Suite F2** `Board font: the widget dev window (on 21Board's site, in an AI tool's preview, in the widget lab)` (about 12 s):
on 21Board's site the test board and its widget load Inter; in an AI tool's preview and in the lab the test board's
body starts with `system-ui`, there's no `Inter` face in `document.fonts`, nothing is fetched and no font error is logged, and
Settings › Appearance has no font row.

Wherever a check in §5.2 or §5.3 reads a face's status, read it with `eventually`: a slow runner can still be loading.
`document.fonts.check('16px Inter')` proves nothing here, since Inter is installed.

### 5.3 Other new checks, in the feature's own suite
| Suite | Check | Fail-first on the base |
| --- | --- | --- |
| Board Sync: theme and accent color, and the default widget language (tests/suites/board-sync.js:2224, retitled) | An older release's choice: on the laptop, write `letters: 'legible'` and a new `lettersAt` straight into its settings record with `__board21.store`, as an older release's Settings does, reload the laptop, then a round. The smartboard's `settings.letters` is `legible`, it says nothing (no `heard` line names the text style), its body still starts with Inter, and its own device file carries `letters: 'legible'` with the laptop's version. | says "The laptop changed the text style…" and switches fonts |
| same, its Import part | Import › Replace a file holding `letters: 'early'`: the sub names no text style, and `settings.letters` and `lettersAt` are what they were, after Replace and after its Undo | the sub says "So is the text style." and `letters` becomes `early` |
| Calculator: the Widget Picker and a new window (calculator.js:399-406, the text style loop) | with Advanced keys on and an answer showing "of" (percent set to "of", then 50 % 8 =), `.key i`, `.rules i`, and the `.ce-word` compute to `"Inter Letters"` first, italic, and the frame's `document.fonts` has `Inter Letters` loaded; the keys and canvas are in Inter | Georgia |
| Developer mode: upload a widget file (sdk.js:1040) | an uploaded widget's text computes to Inter, and its sealed frame's `document.fonts` has a loaded `Inter` face; and in a fresh tab with `fonts/Inter-21Board.woff2` answered 404, an uploaded widget still starts (no note), with no `Inter` face in its frame | no Inter face |
| SDK, developer mode, standalone (sdk.js:78-82) | the Timer at `widgets/timer/index.html#b21-bare` has a loaded `Inter` face and `--b21-font` starting with Inter; `BASE.replace('127.0.0.1', 'localhost') + '__dev/widget.html#b21-bare'` (SDK from the other origin) has no Inter face, requests nothing under `/fonts/`, and logs no CORS or font error | the first fails (no Inter face) |
| Offline (offline-and-updates.js:10-26) | the file list also follows `url(…)` inside each `<style>` block only, skipping `data:`, `#…`, another site, and anything holding `${`, so a font missing from its registry `files` fails | passes on the base (nothing to follow): show it bites by running it after adding the Calculator's `@font-face` and before its registry line |
| Offline, the offline page | with the copy saved and the network off, a window opening a widget not kept offline shows "This widget needs a connection" with a loaded `Inter` face in its frame | no face, system-ui |
| Pages (multiple boards) (board.js:1463) | export keys: `…,theme,accent,widgetLanguage,board,instances` | has `letters` |
| Settings: sections (settings.js:412-416) | Appearance rows: `Theme,Background,Accent color,Board shape` | has Text style |
| Settings: About (settings.js:668-673) | MARKS (:668) and CREDITS (:671-673): Inter first, by Rasmus Andersson and the Inter Project Authors, OFL; no Atkinson or Andika | Atkinson |
| SDK Playground (sdk.js:249) | no `Text style` row in Context; `--b21-font` in the palette starts with Inter | row present |

### 5.4 Existing tests that change, and why (the Text style setting is gone, or the font changed)
| Test | Change |
| --- | --- |
| tests/lib.js:38-41 | `openSettings`'s comment drops `'letters'`. |
| tests/lib.js `boardUp` (:489), `addWin` (:350) | also wait for `document.fonts.ready`, in the board and in the new window's frame when it is same-origin, at most 2 s (decision 18). Wait in Node with `page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 2000, polling: 100 }).catch(() => {})` (and the same for the frame's document), never an in-page timer, which stops under `page.clock`. `boardUp(page, { fonts: false })` and `addWin(p, id, { fonts: false })` skip it, for F1 item 7 |
| settings.js:1 | header drops "text style" |
| settings.js:428, :469, :473 | groups list drops `letters hidden` |
| settings.js:780-812 | About's tidy at 1920 × 1080 200%: one pass, not one per style |
| settings.js:988, :1009-1010 | "Settings keeps a control still": open `widget-language` in place of `letters`, and tap a Default widget language card (`lang-opt`, the same layout) in place of a Text style card; the title ends `…Size, Default widget language)`; then English again |
| settings.js:1421-1690 | the three suites become F1 and F2 (§5.2) |
| board-sync.js:391-392 | `On all your devices.` count 4 → 3 |
| board-sync.js:1875-1900 | `hints()` drops `text` |
| board-sync.js:2223-2365 | the Text style steps go (Early readers, Easier to read, the ticks under `.letter-opt`, "changed the text style", the file's `letters` version, Import's text style lines); theme, accent, and 1b's default widget language stay; §5.3's two checks join. Title: `Board Sync: theme and accent color, and the default widget language (Español from the laptop, all three at once, Settings open, locked, another tab, kiosk, Import, and a text style from an older release)` |
| board-history.js:72-74, :95-97 | the wreck no longer picks Early readers; the theme half stays |
| board.js:1110 (Copy) | delete the README sentence check (RELEASING: don't check the docs' words) |
| widget-picker.js:10, :122-145, :198-205 | one pass in Inter; title drops `every Text style, ` |
| widget-picker.js:225, :234, :264-298 | one style; title `… at 1366 × 768 in every Size, …` |
| name-picker.js:248-299 | `fitTools.letters` deleted |
| name-picker.js:1243, :1290-1303 (Groups); :1976, :2025-2033 (Bracket) | the text style refits go |
| name-picker.js:2384-2440 | one style; title `Name Picker: Versus from a file, and long names fitting` |
| name-picker.js:2451-2454, :2526-2542 | drop `letters` from the fitTools destructuring and the `letters('standard')` call at :2454; the Early readers dark pass goes |
| name-picker.js:2948-2964 (Spinning wheel) | port: the names on the slices, the banner, and SPIN are drawn in Inter (fillText's font and the computed fonts start with `"Inter"`). The redraw once a late font arrives is F1 item 7's |
| name-picker.js:3335-3363 (Spotlight), :3859-3874 (Lotto) | the "again in Easier to read" steps go; names measured in Inter stay |
| sdk.js:249 title, :474-516, :579-607 | no text style row; one pass for P7; title drops `, text style` and `in every text style` |
| clock-and-calendar.js:635-659 | port: with every `.woff2` held 0.7 s, the board's `Inter` face is still `loading` when the corner clock first draws (recorded from an init script at the clock's first draw), and `loaded` when `--clock-room` is read; then `--clock-room` equals how far it reaches. On the base there is no Inter face, so it fails |
| widgets.js:682-698 (Standards picks) | rule cells fit at the narrowest canvas, one pass |
| calculator.js:101-102 | the Calculator's exact `files` list gains the two font files |
| calculator.js:1746-1791 | the √ join in Inter only; title `Calculator: the √ sign meets its bar` |
| weather.js:368-391 | part 7 becomes one walk: every word in Inter; the 24 Atkinson layouts go |
| weather.js:1016-1032 | the Early readers pass goes |
| video-player.js:336-364 | one style: `fitted.length === texts.length` |
| zones-check-in.js:433-452 | the tile wraps "Zones / Check-In" after Zones, once, in Inter |
| tests/words.js test 11 | §5.1 |

Fit checks with lower bounds tuned to stock Inter at 400 (name-picker.js:2436-2440, weather.js:307-320,
video-player.js:357-361, sdk.js:96-98's standalone Timer chips, and languages.js's pseudo language "nothing cut off") now see text about 2 to 3% wider and a wider I. If one fails, look at its screenshot first. A
real cut or overlap is a bug: fix the widget. A bound that only measured the narrower letters may move by the measured
difference, listed in `tests_changed` with before and after.

### 5.5 Must pass unchanged
tests/merge.js (the region is unchanged); tests/calc-engine.js; widgets.js:82-137 (Notes); sdk.js:717 (Notes' Crayon
Libre); picture.js:49, :296; timers.js:752-760; clock-and-calendar.js:1372-1390; calculator.js:933-934 (computed
`fontWeight`, still 400 and 500); board.js:1108 (`use system fonts, and draw` in sdk/board21-dev.js:191, which stays);
the Copy suites; 'Languages' A and B; 'Widget dev window'.

### 5.6 Time
| Change | Suite seconds |
| --- | --- |
| New checks: Node 11a-c, F1 items 1-2, §5.3 rows | about +5 |
| F1 and F2 in place of the three Text style suites (38 s) | about −1 |
| Style loops gone: Versus from a file (222), Weather every size (264), Widget Picker Paste (63) and icons (39), Versus resize, Video Player, SDK Playground, Name Picker's five, and the rest (map-tests-docs §1d) | about −200 |
| In all | about −195 suite seconds; CI wall clock about −10 s across 15 parts |
New and retitled suites count as the average (about 49 s) in the split until the session saves timings after the first
CI run.

### 5.7 The builder's runs
One test process at a time. Each filter is one case-insensitive substring of a suite title (tests/run.js:83-87). A
filter that prints 0 passed ran nothing: check every count.
0. `grep -nE 'data-act="letters"|Text style|text style|Atkinson|Early readers|Easier to read|letter-opt|21Board Early' tests/`
   lists only the Board Sync check of an older release's text style.
1. `node tests/words.js`
2. `node tests/run.js "Board font:"` (F1 and F2)
3. `"Settings: sections"`, `"Settings: About"`, `"Settings keeps a control"`
4. `"Board Sync: theme"`, `"Board Sync: setting up (scenarios"`
5. `"Copy: "` (two suites), `"Pages (multiple boards)"`
6. `"Widget Picker: icons"`, `"Widget Picker: Paste"`
7. `"Calculator: the √"`, `"Calculator: the Widget Picker"`, `"Standards picks"`
8. `"Zones Check-In: the registry"`, `"Video Player: light"`, `"Clock in the corner (Auto"`, `"SDK Playground"`,
   `"Developer mode: upload"`, `"SDK, developer mode"`, `"Task Timer: schedule"`
9. `"Name Picker: Versus from"` (the tightest lower bounds), `"Name Picker: Versus names"`, `"Weather: every size"`, `"Weather: Location"`
10. `"Offline"` (matches about 10 suites, about 300 s; it holds the new CSS `url()` rule), and `"Opened from disk"`
    (the board now loads its font from disk there)
11. `"Languages"`
Leave `"Board history"` (12 suites, about 390 s, a one-line change), bare `"Name Picker"` (about 1350 s), and
`"Kiosk"` to CI. Never a bare `"Settings"` or `"Text style"`.

## 6. Docs

### 6.1 README.md
| Where | Change |
| --- | --- |
| :99, Import | drop "text style, " from all four lists: "…takes the file's theme, accent color, and default widget language… the new windows, content, theme, accent color, and default widget language reach your other devices too. Its Undo puts back the page, theme, accent color, and default widget language it replaced. The other choices leave the theme, accent color, and default widget language alone." |
| :153-157, Settings › Appearance | delete the **Text style ▸** bullet |
| :198, layout | `fonts/                  Inter, the board's font, and its license, saved offline` |
| :361, :364, :367, :369, :372 (linking) | "theme, accent color, text style, and default widget language" → "theme, accent color, and default widget language"; :364 "a theme, accent color, text style, or default widget language" → "a theme, accent color, or default widget language" |
| :380 | "a theme, accent color, or text style too" → "a theme, accent color, or default widget language too" |
| :416-432, Board Sync | the bullet starts `**Theme, accent color, and default widget language belong to the board.**`; drop "Choose Early readers on the laptop, and the smartboard's text and widgets change too." and the "changed the text style to “Early readers”." example; replace everything from "A device still on 2026.11.16-4 doesn't know the text style." through "…another updated device." with: `A device on 2026.11.28-1 or earlier keeps its own text style. It shares it only with your other devices on those releases.` "beside Theme, Accent color, Text style, and Default widget language" → "beside Theme, Accent color, and Default widget language" |
| :653 | "21Board's theme, accent color, and size don't reach these apps." |
| :767 | "**Going back never changes the theme, accent color, or default widget language.**" |
| :833 | "`.github/fonts/` makes Inter the system font too, for text the board's own font doesn't draw." |
| :866-875, Third-party files | the Atkinson and Early Readers entries become one: `- fonts/Inter-21Board.woff2: *Inter* 4.001 by Rasmus Andersson and the Inter Project Authors, under the SIL Open Font License 1.1 (fonts/Inter-OFL.txt). It's the font of 21Board and every widget. tools/build-inter.py makes it from the original in the google/fonts repository: opsz pinned at 14, the weight axis kept with its regular a little heavier, I with bars and l with a tail, -> kept as two characters, and cut down to the letters 21Board shows in English, Spanish, Russian, Ukrainian, and Greek. About 66 KB.` and `- widgets/calculator/fonts/InterItalic-21Board.woff2: *Inter* Italic, the same, cut down to the Calculator's letters a, b, n, and x, and the word "of". About 4 KB.` Under them a **For IT** line: `The tool checks each original's SHA-256 before it builds. tools/build-inter.py --check rebuilds and compares the bytes.` Code paths in backticks as the section does. |
| :875 | "**Fonts** keep their own licenses." stays |

**Last, a sweep:** `grep -rniE "text style|Atkinson|Andika|Early readers|Easier to read|letter-opt|LETTERS_HERE|build-letter-fonts"`
over README.md, NOTICE, docs/, sdk/, widgets/, index.html, sw.js, and board.js. It finds only the merge region,
`delete exp.letters`, lookParts' comment, DATA-FORMAT's Board Sync and device-file lines, and README's Board Sync line
above. Line numbers in §6 are where to look, not a full list.

### 6.2 docs/DATA-FORMAT.md
| Where | Change |
| --- | --- |
| :93-96 | the comment names the theme, the accent, and the default widget language; `lettersAt` stays, with `// the text style's, kept for releases up to 2026.11.28-1` |
| :101 | `letters: "standard",     // the text style, shown and chosen only by releases up to 2026.11.28-1: "standard" \| "legible" \| "early". Later releases never choose one. They keep it, and take a later one from an older device through Board Sync.` |
| :114-120, exports | `theme`, the accent, and `widgetLanguage` go into exported files. Files from 2026.11.17-2 to 2026.11.28-1 also hold `letters`, the text style. Later releases ignore it. Device files still carry it (Board Sync, below). |
| :281-314, style parts | keep the prose as the region still works, and add: `21Board no longer shows the text style. It stays a style part, so devices that haven't updated keep syncing it. An updated device never chooses one, so it never stamps a version. It takes a later one from another device into settings.letters without a word, and writes it on in its own file.` |
| :670, :678 | drop "text style" from the lists of what going back never changes; :678 (what a version holds) adds `Versions saved by earlier releases may also hold letters, the text style. Going back drops it.` |
| :790, `.21board` example | drop the `"letters"` line |
| :889-912, import modes | drop "text style" from each list |

### 6.3 docs/WIDGET-SDK.md
| Where | Change |
| --- | --- |
| :242, `theme` event | `The theme or accent color changed. The CSS variables are already updated.` |
| :243, `resize` event | `… Also fires again once the board's font has loaded, so text can be fitted again. …` (drop the text style clause) |
| :379-389, Theming | `--b21-font` starts with Inter, 21Board's font, which has every letter in English, Spanish, Russian, Ukrainian, and Greek. The SDK loads it from the board's `fonts/` folder. A widget on another site gets it only if the board's site allows it (CORS). A widget uploaded as a file in Developer mode gets it from the board. Anything Inter doesn't have, such as emoji, comes from the device's own font. / If you fit text to the window, fit it on `resize`, the window's or `Board21.on('resize')`. One fires again once the font has loaded. Form controls don't take the page's font by themselves. Give `button`, `input`, `textarea`, and `select` `font-family: inherit` (or `font: inherit`). / Its regular is a little heavier, for the back of the room. Keep writing `font-weight: 400`. Its digits are proportional, so give numbers that tick `font-variant-numeric: tabular-nums`. |
| :501, What the SDK sets | delete the Russian and Ukrainian line |
| :630, "Just the widget" | add: `On its own, a widget shows Inter only on 21Board's site or opened from disk. Elsewhere it uses the device's font.` |
| :637-640, the dev window | `- **The board's font** loads in the dev window of a widget file on 21Board's own site, or opened from disk. In an AI tool's preview the test board isn't on 21Board's site, and the widget lab's is sealed off, so there your widget shows the device's own font.` |
| :70, :693 (no web fonts) | stay |

### 6.4 docs/AI-PROMPT.md
- :343-346, "The teacher's text style" becomes: `- **The board's font**: `--b21-font` starts with Inter, which comes with 21Board and has every letter in all four languages. Give `button`, `input`, `textarea`, and `select` `font: inherit`, as the skeleton does. A resize event comes once the font has loaded, so the skeleton's `fitAll()` fits text again by itself. Give numbers that tick `font-variant-numeric: tabular-nums`.`
- :396, the short prompt: "so they use the text style the teacher picked too" → "so they use the board's font too".
- "no web fonts" (:108, :397) stays.

### 6.5 docs/ROADMAP.md
"21Board in other languages", Done gains: `- One font, Inter, draws all four languages.`

### 6.6 Code text that reads as docs
- sdk/board21.js comments (§3.5), board.js comments (§3.3), widget comments (§3.6).
- .github/workflows/tests.yml:39-40, the comment: Inter as the system font measures text the board's own font doesn't
  draw the same everywhere. The conf file stays.
- tools/build-sdk.js, tools/release.js: no change.

## 7. The Teacher Guide (docs/teacher-guide; its README has the steps)
Words in page-src.html:
- "Make it yours" lede (:424): `Arrange windows the way your room works, give each subject its own page, and pick your colors.`
- Delete the card "Letters made for young readers" (:428).
- FAQ, after "Everything looks small on the big panel.":
  `<details><summary>Can I change the font?</summary><p>No. Every board uses one font, Inter. It’s a little bolder, so the back row can read it. I, l, and 1 each look different. Notes’ Chalkboard and Whiteboard keep their own letters.</p></details>`
  (match the FAQ's markup as it stands.)
- The guide's own type (:6-7, :15): one face,
  `@font-face { font-family: "Inter"; font-weight: 100 900; font-display: swap; src: url(data:font/woff2;base64,__INTER__) format("woff2"); }`,
  and `--font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`. Crayon Libre stays (:8, :16).
- build.js (:15-17): `__ATK_REG__` and `__ATK_BOLD__` become `__INTER__`, from `fonts/Inter-21Board.woff2`. Its
  leftover-placeholder check stays.
Screenshots:
- work/scenes.js: delete `SCENES.textstyle` (:538-551); `settingsLook` (:462) drops `'letters'`, and its comment
  (:461) lists Theme, Background, Accent color, and Board shape.
- work/shoot.js `shot()`: await `document.fonts.ready` in the board and in each window's frame before the picture.
- Retake every shot the page uses, all of which show board text: `node docs/teacher-guide/work/shoot.js hero picker menu language pages history appearance lock empty`, the 23 `w-…` scenes (w-timer, w-stopwatch, w-task-timer, w-calendar, w-notes, w-name-picker, w-name-picker-groups, w-name-picker-versus, w-name-picker-bracket, w-first-then-board, w-zones-check-in, w-dice, w-youtube-player, w-image, w-calculator, w-traffic-light, w-clock, w-clock-faces, w-clock-led, w-weather, w-21sketch, w-21timer, w-21doccam), and `heroDark` so `hero-board-dark.jpg` isn't left in the old font. Use each scene's own name as scenes.js has it. Delete `shots/textstyle.jpg`. If *.ccsd21.org can't be reached, keep the three district apps' old shots and say so in `open_issues` (only their title bars differ).
- check.js also fails unless, after `document.fonts.ready`, `document.fonts` has a face `Inter` with status `loaded`.
- Then `node docs/teacher-guide/build.js` and `node docs/teacher-guide/check.js`. Don't publish: the session publishes it
  to https://claude.ai/artifact/2vXnMT4JJAkm5y6dnjC8YG after the merge.

## 8. The Calculator manual (docs/calculator-manual)
- page-src.html: two faces at the top of its `<style>`,
  `@font-face { font-family: "Inter"; font-weight: 100 900; font-display: swap; src: url(data:font/woff2;base64,/*@INTER*/) format("woff2"); }`
  and `@font-face { font-family: "Inter Letters"; font-style: italic; font-weight: 100 900; font-display: swap; src: url(data:font/woff2;base64,/*@INTER_LETTERS*/) format("woff2"); }`.
  `--font` (:11) becomes `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. `.kp i` (:169) and
  `.rules i` (:189) become `.kp i, .rules i, .ce-word { font-family: "Inter Letters", var(--font); font-style: italic; }`.
- The demo's palette: `PALETTES` (:649-652) stays a copy of the SDK's. `palette(t)` (:663-667) adds
  `font: '"Inter", ' + PALETTES[t].font`, as the board's `paletteFor` does.
- build.js: `/*@INTER*/` and `/*@INTER_LETTERS*/` are `fill` entries, from the two shipped files, in the manual's own
  placeholder form, so its "page-src.html has no …" check and its leftover regex (:164) cover them. In the widget's
  document, swap `url("fonts/InterItalic-21Board.woff2")` for the data URL with `once(widget, …)` before `markup` is
  computed (:57), and put the Inter face into the demo's `<head>` before the inlined SDK. Both `url(` checks (:58,
  :177) stay strict on anything that isn't `url(data:font/woff2;base64,`.
- check.js also fails unless faces `Inter` and `Inter Letters` are `loaded`, in the page and in the demo's frame.
- `node docs/calculator-manual/build.js` and `node docs/calculator-manual/check.js` (its CSP allows `font-src data:`).
  check.js's pictures in dist/shots are taken again by that run. The README's "It has no other files." stays true.
- Don't publish: the session publishes it to https://claude.ai/artifact/8p3dg4r8xSduSD2DmNVjXB after the merge.

## 9. Known, and left for later
- **`letters` stays a style part** in the merge, carried for devices on 2026.11.28-1 or before. A later release drops
  it from `STYLE_PARTS` once none is left (one rewrite of each device file, and tests/merge.js's text style cases).
- **Stored `letters` and `lettersAt`** stay in settings records, unused.
- **Notes' Chalkboard lettering has no Cyrillic or Greek.** Those letters draw in Inter now (or Comic Sans MS on
  Windows). Notes' own translation (Phase 2) decides more.
- **Symbols Inter doesn't have** stay on the device's font: ∛ (unused), ⇄ ↶ ↷ (the Calculator's Test practice message),
  ⏸ ⏱ ⏮ ⏭ ⌛ ⏳ ⏰, ✔ ✕ ➔ ⭐, ▦, ［ ］, and emoji.
- **The Calculator's "of" is in the italic cut in English only.** When the Calculator gets its words, add each
  language's word to `italic` in tools/inter-chars.json, and have 11c read that words table's entry for the key passed
  to `.word`.
- **Windows panels:** Inter's line height is 1.21 em, Segoe UI's about 1.33, so text boxes sized by `line-height:
  normal` get a little shorter there. CI already measures Inter's.
- **For the session, not the builder:** look at the board on one district Chromebook and one iPad. CSS 400 should draw
  as `weight-proof.log` says, and Russian, Ukrainian, and Greek should show in Inter.
- **The dev window's toolbar and the lab's chrome** stay in the device's font (decision 15).

## 10. Final screenshots for Tyler
deviceScaleFactor 2, at 1366 × 768 unless it says otherwise, into final-shots/, cropped to what matters. Before each
one, await `document.fonts.ready` in the board and in each window's frame, and check that each frame's Inter face is
loaded: system-ui here is stock Inter, so a missed face looks right in a picture.
| File | What |
| --- | --- |
| board-light.png | The board in the light theme: a Clock, a running Timer, a note, a Name Picker, and the Widget Picker open. Every word in Inter, the heavier regular, I with bars in the Widget Picker's names (compare /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/r-fonts/page/img/near-inter.jpg, which is the build at 400 before the remap: this should look heavier) |
| board-dark.png | The same board in the dark theme |
| settings-appearance.png | Settings › Appearance: Theme, Background, Accent color, and Board shape, and no Text style |
| languages.png | A Timer in Русский, running, and a Traffic Light in Español, side by side, with a note below reading `Ґ ґ Є є І і Ї ї · π Σ Δ θ μ · Dvořák`: chips, buttons, lamps' labels, and the note all in Inter |
| calculator-letters.png | The Calculator's Advanced keys a², aᵇ, ⁿ√, and a/b, the rule strip's xⁿ, and an answer line with "of", in Inter Italic, light and dark (compare /tmp/claude-0/-home-user-21Board/80abfb5d-dedb-5e63-a9c1-d0d55541337d/scratchpad/inter/calculator-letters-corrected.png, middle column) |
| name-picker-long.png | Name Picker's Versus with two long names, `Maximiliano Dvořák` and `Іванна Ґонтаренко`, at 640 × 400: fitted, nothing cut, the slant as decision 10 says |
| clock.png | A Clock showing 10:08 (tabular digits), its stacked date (weekday 800, month and day 700, year 600, each step still visible), and the Old face beside it with its serif Roman numerals |
| settings-language.png | Settings › Classroom › Default widget language open with Русский chosen: the four cards look as in 1b's final shot (size, padding, tick, bold name, small English name) |
| notes-scripts.png | A Chalkboard note and a Whiteboard note, each reading `Ready! Готово! Ґ Ї · Γεια · Dvořák`: Latin in chalk or marker lettering, the Chalkboard note's Cyrillic and Greek in Inter at matching size, Whiteboard in Excalifont where it has the letters |
| menu-80.png | A Timer's window menu at Size 80%: labels and the Language row's value in Inter, nothing cut |
| weight.png | From the build's proof: one line in stock Inter 400 above and the shipped Inter at CSS 400 below, at 24 and 48 px |
| guide.png | The built Teacher Guide: its top and the Make it yours section, in Inter, with no Letters card |
| manual.png | The built Calculator manual: the keypad picture and rule strip in Inter Italic, and its live Calculator in Inter |

## 11. Commit trailers
Every commit in this release ends with these two lines, exactly:

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016h6FE85E2dZRo6pt3hG8SE

No model name appears anywhere else in the repo.
