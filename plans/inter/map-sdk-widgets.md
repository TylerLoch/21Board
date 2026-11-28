# Inter release: map of the SDK and the widgets

Planned against main at 6dbd9cd plus Languages 1b's spec (r-l10n/p1b/spec.md). 1b changes no line of
sdk/board21.js (spec decision 7, SDK_VERSION stays '1.6.0') and touches only widgets/_template/index.html,
widgets/timer/index.html (#go loses its aria-label), widgets/registry.js (languages), sdk/lab.html, and
sdk/board21-dev.js among the files below. Line numbers are main's. Where 1b moves them, it says so.

Paths are repo-relative. "Remap" means the planned regular of about 490 for CSS 400 (decision 5).

---

## 1. The SDK, sdk/board21.js

### 1.1 The font token, --b21-font
- `PALETTES.light.font` and `PALETTES.dark.font` = `'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'`
  at :65 and :71. These are used only when the SDK runs without a board: standalone (`startStandalone` :553-582,
  `context.palette = PALETTES[theme]` :564) and the theme flip at :570-574.
- `applyTheme(theme, palette)` :105-113 writes every palette key as `--b21-<key>` on `<html>`. For `font` it
  first runs `Words.fontFor(palette.font, language)` :108 (the 1a hook, §1.6), then `applyLetters(font)` :112.
- Inside 21Board the font comes from the board: `paletteFor(theme)` board.js:188-195 sets
  `font: letterFont()` (board.js:4687: the chosen family, then `PALETTES.light.font`). It reaches the frame
  three ways: the same-origin peek at `window.parent.__board21Host` (board21.js:822-826, set at board.js:1303),
  `init`'s `context.palette` (board21.js:629-637; board.js:2209), and every `theme` message (board21.js:653-657).
  The board resends `theme` when the text style changes because `themeSig` includes `letterKey()` (board.js:1304).
- No `Board21.context` field names the text style. The only carrier is `context.palette.font` and
  `--b21-font`. docs/WIDGET-SDK.md:234 says the `theme` event fires when "the theme, accent color, or text style
  changed". docs/WIDGET-SDK.md:369 lists `--b21-font` as "Font stack".
- The SDK's own chrome stays in system-ui on purpose: the standalone menu `<select>` (:602, `data-b21-chrome`)
  and the dev note bar (:804, :811 weight 600). Leave them.

### 1.2 LETTER_FACES and the @font-face rules
- Comment :115-124 describes Settings → Appearance → Text style, the fonts/ folder, CORS, and the refit.
- `LETTER_FACES` :125-128: `'Atkinson Hyperlegible'` and `'21Board Early Readers'`, two static files each.
- `sdkFile` :129 and `fontBase` :130: `…/fonts/` next to the folder that holds `sdk/board21.js` (or `.min.js`),
  from the script's own `src`. An inlined SDK has no `src`, so `fontBase` is `''` and no faces are added.
- `applyLetters(font)` :132-146: takes the first quoted family of the stack (:134). Only if it is a key of
  `LETTER_FACES`, `fontBase` is set, and it isn't added yet, it appends `<style data-b21-letters="…">` with one
  `@font-face` per file: `font-weight: (i ? 700 : 400)` and `font-display: swap` (:139-141). The comment at :139
  says "the UI's weights 600–800 come out in the Bold one".
- What must change for Inter: one entry (`'Inter': ['<file>.woff2']`), and the rule must say
  `font-weight: 100 900; font-style: normal` (a variable face). With today's `i ? 700 : 400` template a single
  file would be declared as 400 only, and every 500 to 900 would match it with no variation applied or with
  synthetic bold.

### 1.3 How the faces reach each kind of frame
| Where the widget runs | role | fontBase | Faces added? | Notes |
| --- | --- | --- | --- | --- |
| Built-in widget on the board | `board` (frame name `b21-board:…`, :46-51) | the board's `fonts/` | yes, at the host peek (:822-826), before the widget's own scripts | same origin, from the offline copy |
| Widget from another site, SDK loaded from the board's site | `board` | the board's `fonts/` (cross-origin) | yes | loads only with CORS. tylerloch.github.io (README:673, WIDGET-SDK:634) is GitHub Pages |
| Widget with its own copy of the SDK | `board` | its own `fonts/`, usually missing | rule added, file 404s | text falls to system-ui |
| Dev window (sdk/board21-dev.js), page on 21Board's site or disk | widget frame is `board` | from the widget's SDK tag | only if the dev board's palette names the family | board.js `LETTERS_HERE` :4684 decides: on another site or in the lab the board sends the system stack, so nothing is fetched (tests/suites/settings.js:1648-… checks "no font errors, nothing fetched") |
| Widget lab (sdk/lab.html) | srcdoc, sandboxed (board21-dev.js:291, :298) | none | no | system font |
| Standalone, `#b21-bare` or `data-dev="off"` (:51, :553) | `bare` | from the SDK tag | yes, if the SDK's own PALETTES put Inter first | from file:// it works in Chrome today (WIDGET-SDK:616). In an AI tool's preview it would fetch cross-origin (see Q4) |
| Uploaded widget file (Developer mode) | `board`, sealed (board.js:441-471) | `''`, SDK inlined at board.js:463 | no | CSP `font-src data: blob:` (board.js:441-442) allows a data: face (Q5) |
| Calculator manual's live demo | srcdoc with the SDK inlined (docs/calculator-manual/build.js:60) | `''` | no | the page plays the board with its own PALETTES copy, page-src.html:650-651 (§7.3) |

### 1.4 font-display
- `font-display: swap` in the SDK (:140) and in board.js (:4695). Notes' faces also swap (widgets/notes/index.html:12, :14).
- Today a frame that uses Atkinson draws in the device font until the file arrives, then refits. With Inter in
  every frame, every window open or reload goes through that swap. From the offline copy the file is in memory or
  disk cache, so the swap is usually within the first frames, but canvas text drawn before it is wrong (§1.5).

### 1.5 Telling widgets to refit
- `applyLetters` calls `refit()` when the stack changes (:144). `refit()` :147-157 dispatches a window `resize`
  and, inside the board, `emit('resize', context.window)` 30 ms later.
- `document.fonts` `loadingdone` :158-160 calls `refit()` only if `lettersAdded` has an entry. With Inter always
  added this becomes "every font load refits", including Notes' Crayon Libre and the Calculator's italic letters.
  Fine. But where the SDK adds no face (inlined SDK: sealed uploads, the manual), a host-injected Inter never
  triggers a refit (Q5, Q8).
- Widgets that rely on it are listed in §3, column "Refits after font load".

### 1.6 The 1a font hook (inside `#region Words` :162-414, loaded by tests/words.js and tools/words.js)
- `LANG_FONT = { en: null, es: null, ru: null, uk: null }` :285, "Empty, and planned to stay so: one font for all four."
- `FACE_SCRIPTS = { 'Atkinson Hyperlegible': ['latin'], '21Board Early Readers': ['latin'] }` :287, "Neither has Cyrillic letters."
- `LANG_SCRIPT` :288 (qps counts as Cyrillic).
- `fontFor(stack, lang)` :291-295 drops a leading bundled family that lacks the window's script.
- Exported in `Words` :408 and :411. Comment at :108, "(a Russian or Ukrainian window skips the bundled Latin fonts)".
- Tested at tests/words.js:434-435 (legible and early dropped for ru, uk, and qps; kept for en and es).
- For Inter: `FACE_SCRIPTS = { Inter: ['latin', 'cyrillic', 'greek'] }` keeps `fontFor` a no-op for all four
  languages and keeps the hook for later. Or remove the hook and its tests. Q3.

### 1.7 SDK_VERSION, and what an SDK change requires
- `SDK_VERSION = '1.6.0'` :36. Exposed as `Board21.version` (:873, docs/WIDGET-SDK.md:101), `context.sdkVersion`
  standalone (:561), and the `hello` message (:828). tests/suites/board.js:730 checks `>= 1.5.0`.
- History: 1.1.0 dev window (2f2cf08), 1.2.0 (2a159af), 1.3.0 (4708a89), 1.4.0 (f78da64), 1.5.0 (d97e4cc),
  1.6.0 words (ada5e64). The Letters release (5cde86d) changed LETTER_FACES and fonts with no bump.
- An SDK change needs, in the same commit:
  - docs/WIDGET-SDK.md: :38 (quick start CSS), :68 (no web fonts), :101, :234 (`theme` event), :235 (`resize`
    "also fires when the teacher's text style changes"), :369-381 (Theming: text style, CORS, "A Russian or
    Ukrainian window skips those fonts"), :485 (What the SDK sets), :616-619 (dev window: Text style), :672, :689,
    :713 (checklist). 1b edits the Languages section around :387-494 and adds nothing about fonts (spec :781-783).
  - docs/AI-PROMPT.md: :107 (no web fonts), :131, :139 (`.big` 800), :141 (buttons 650), :319-324 ("The teacher's
    text style … Settings → Appearance → Text style"), :369 ("so they use the text style the teacher picked too").
    1b rewrites :89-116, :118-183, :283-284, :330-343, and :354-372, so these move.
  - `node tools/build-sdk.js` (tools/build-sdk.js:1-54) only when index.html's `<style>` or `<body>` changes. It
    regenerates sdk/dev/board-shell.js; tests/suites/sdk.js:776-778 run `--check`. Removing Text style changes
    index.html, so it applies. After 1b, index.html:810-819 names `.letter-opts, .lang-opts` and
    `.letter-opt, .lang-opt` together (1b spec decision 18, :271-277). Deleting Text style must keep the
    `.lang-opt` half of every rule.
  - Stamp: docs/RELEASING.md:69-73, `node tools/build-sdk.js && node tools/release.js` and their `--check`.
  - sdk/board21-dev.js:191: the hint "use system fonts, and draw images with inline SVG" is pinned by
    tests/suites/board.js:1108. sdk/lab.html:76's sample (template Counter after 1b) uses `var(--b21-font)`. The
    lab is sealed, so it shows the system font either way.
  - The SDK is also inlined into sealed uploads (board.js:447-471) and the Calculator manual (build.js:60).

## 2. The 1a note that Russian and Ukrainian use the device font
- sdk/board21.js:108 (comment), :116-124 (comment), :283-295 (hook), :408 and :411 (exports).
- docs/WIDGET-SDK.md:375-376 ("A Russian or Ukrainian window skips those fonts, which have no Cyrillic letters,
  and keeps the device's own.") and :485 (What the SDK sets).
- tests/words.js:434-435.
- board.js:4686 comment: "the device's own for anything it doesn't have (▦, ✓, emoji, Cyrillic…)".
- docs/TRANSLATING.md and docs/AI-PROMPT.md: nothing about fonts or Cyrillic.
- 1b adds a rule to CLAUDE.md's new Languages section (worktree CLAUDE.md:43): "Every font a widget uses needs
  Latin and Cyrillic letters." Notes' Crayon Libre has no Cyrillic (§3, Notes).

## 3. The widgets

Weights below are CSS values. "Remap" effect assumes Q1's recommendation (CSS 400 draws as 490, 500 as 560,
600 as 630, 700 stays 700, 300 stays 300).

| Widget | Font families it sets | Weights | Numeric features | Italic or `<i>`/`<b>` | Fits text? Refits after a font loads? |
| --- | --- | --- | --- | --- | --- |
| Timer widgets/timer | body `var(--b21-font)` :12; buttons `font: inherit` :26 | #time 700 :21; buttons 600 :28 | #time tabular-nums :21 | none | `fitChips()` :286-289 (words → bare number). Runs at ready :291 and on window `resize` :292, which the SDK's refit fires. Yes |
| Clock widgets/clock | body :11; `--serif: Tinos, "Times New Roman", Times, "Liberation Serif", "Noto Serif", Georgia, serif` :12; `#analog text` :41; `.ro-num` `font: 400 18px var(--serif)` :69 (Old face only); `.ind` `font: 700 15px var(--b21-font)` :119; #badge, #now :151 | Simple numerals 600 :57; Teaching minutes 700 :83, hours 700 :84, a.m. 700 :86; #time 700 :105; .pd-ap 600 :106; #q 700 :113; #words 600 :132; weekday 800 :135; month-day 700 :136; year 600 :137; line 600 :138; #badge 700 :153; #now 700 :154 | #time tabular-nums :105 | none | `layout` on window resize :980; Board21 resize only when corners change :983; `fonts.ready.then(layout)` :1361. Digit size from `scrollWidth / fontSize` :681-684 (live). Date: `longestLine()` :1019-1026 is cached by `fontFamily + dayKey` (:689-690). The family string doesn't change when Inter finishes loading, so a "longest day" picked in the fallback font stays (Q9) |
| Clock faces | Simple (b21-font, 600), Old (`--serif`, 400 numerals, Roman I–XII :287, "Upright numerals" and "IV for four" :620), Teaching (b21-font, 700). Menu :616-621, `FACES_IDS` :223 | | | | |
| Stopwatch widgets/stopwatch | body :13; inputs `font: inherit` :16; canvas `ctx.font = wt + ' ' + R + 'px ' + fam` :687 and `'600 '…` :696 with `fam = getComputedStyle(body).fontFamily` :680 | digits 500 :39 and probe 500 :682; .note .lbl 500 :91; .val 600 :92; :105 600; :116 500; .rec b 650 :123; .best .lbl 650 :126; :169 600; :203 600; .n 600 :216; .lt 500 :217; .tag 650 :218; .tot 650 :219; .fast 600 :220; #probe 600 :236; `<b>` :1279, :1289 | :40 `tabular-nums lining-nums` + `font-feature-settings: "tnum" 1, "lnum" 1`; :88, :116, :197, :237 tabular-nums | `<i>` digit slots :254-259 with `.slot > i { font-style: normal }` :44. No italic | `metrics()` :678-700 caches by family string; cleared by Board21 `resize` 200 ms later (:1557-1563) and at `fonts.ready` (:1579). Yes |
| Task Timer widgets/task-timer | body `var(--b21-font, …), "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif` :32; `.digital-clock-time { font-family: monospace }` :110; inputs inherit :151, :320; canvas: emoji `-apple-system, "Segoe UI Emoji", …` :1521, names `700 …px ${textFont()}` :1526, :1548-1584, empty state `bold 16px` :1760 and `13px` :1762, ➕ `22px -apple-system, sans-serif` :1764; `textFont()` reads `--b21-font` :1782-1784 | :100 700; .digital-clock-time 800 :109; :153 600; :197 bold; :268 700; :286 600; inline 700 :657; `<strong>` ×2 | none. The running countdown (#clock-task-time :629, set :1726) is monospace; "Total left: mm:ss" (#clock-total-left, :1732) has no tabular-nums | none | `handleResize()` :1335 on window resize :1115 redraws the pie. Yes. Canvas text needs Inter loaded before the first draw or a refit after (§1.5) |
| First/Then widgets/first-then-board | body `var(--b21-font, system-ui, -apple-system, "Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive, sans-serif)` :21; buttons inherit :34, :593 | 900 at :114, :270, :310, :354, :400, :452, :483, :571, :601; 800 at :223, :410, :460, :637, :692 | none | none | no text fitting in JS; `keepClear` on Board21 resize :1399-1405 |
| Name Picker widgets/name-picker | body `var(--b21-font)` :201; `--np-font-body`, `--np-font-display` = `var(--b21-font)` :192; canvas via `host.token('font')` (:100-101, :129) | index: :212 600, :222 650, :225 600, :234 700. style-wheel: .label 800 :66, :88 800, :90 800, :96 700, :97 600; canvas `'700 100px '` :304, labels `'700 …px '` :328, `'800 …'` :458. style-spotlight 700 :22, 800 :51, :75; canvas `weight + ' 100px ' + fam` :136. style-lotto 800 :32, :34, :52; 700 :44. style-groups 700 :16, :24, :30; 750 :23; canvas :67. style-bracket 700 :20, :46; canvas :90. style-bigname 800 :9; canvas `'800 100px '` :50. style-versus 900 + italic :22; canvas `${s.fontStyle} ${s.fontWeight} 100px ${s.fontFamily}` :93 | none | `.versus-name` italic 900 + `skewX(-9deg)` (style-versus.js:22). No Inter italic is loaded there, so it becomes synthetic oblique Inter Black (today: system italic, real on most devices) | `host.fitText` index:446; refit on window resize :999, ResizeObserver :1004, Board21 resize when zoom changes :1000-1003. Every style clears its width cache in `resize()`: wheel :708-713, spotlight :523-525, groups :312-314, versus :323-325, bracket :452-454, lotto :634. Caches are keyed by the family string (spotlight :239, groups :70, bracket :93, versus :89), so only `resize()` clears them after a load. Yes |
| Calculator widgets/calculator | body :23, controls `font: inherit` :28; `.rules i` Georgia italic :115; `.key i` Georgia italic :237; engine `.ce-word { font-style: italic }` calc-engine.js:2113 | .where 600 :54; #rule 500 :56; #hide 600 :59; .ce-ans and #eq 700 :70; #note.tip 600 :78; .fin 700 :98; .work.bad 600 :103; .rules b 700 :112; .btn 600 :117; #big .ce-num 400 :131; errors 600 :132; .reveal 700 :145; .hans 600 :159; .heq 400 :160; .key 500 :219; test clear .w 400 :227; .key.op 400 :228; .key .w 600 :236; engine .ce-ans 700 calc-engine.js:2112 | engine `lining-nums` calc-engine.js:2085. No tabular figures anywhere | §7 | ResizeObserver on #app :1138 and Board21 resize :1139 ("also when the text style changes"). Yes |
| Notes widgets/notes | `@font-face` Crayon Libre :12 and Excalifont :14 (swap); body `var(--note-font, var(--b21-font))` :17; layers `font: inherit` :24; #undo `font: 500 … var(--b21-font)` :59; `CHALK_FONT` :81, `MARKER_FONT` :82; themes :108-111 | #undo 500 :59; Undo button 700 :64 | none | none | binary-search `fit()` :187-198 on #sizer; `fonts.load` of the theme font :213; window resize :312; `fonts.ready` :313. Yes. Sticky note and its Plain paper (`PAPERS.plain` :90) use `--b21-font`, so they become Inter |
| Notes, scripts | Crayon Libre has no Cyrillic or Greek (0 of each). Excalifont has full Cyrillic, Ukrainian Ґ Є І Ї included, and 73 Greek | | | | Cyrillic in a Chalkboard note falls past "Chalkboard SE", "Comic Sans MS", and "Comic Neue" to system-ui (Q6) |
| Zones widgets/zones-check-in | body :30; controls inherit :32 | 800 :79, :83, :99, :145, :162, :163; 700 :118, :148, :165, :176, :179, :182; 650 :90, :138; inherit :95; `<b>` once | tabular-nums :83, :163, :182 | `.feel i { font-style: normal }` :94 (emoji in `<i>`) | `fitHeads()` :386-393 via ResizeObserver :397 and window resize :398; `fitCorners`/`fitRow` :665-691 on Board21 and window resize. Yes |
| Weather widgets/weather | `.wx` `font: 400 … var(--b21-font, system-ui, …)` :19; #sheet `font: 400 16px/1.25 var(--b21-font, …)` :464; controls inherit :12, :260; compass SVG `font-family="inherit" font-weight="700"` :1305 | 300 :75 (.temp), :277 (.dair .big); 400 :161, :313; 500 ×12 (:77 … :278); 600 ×21; 650 :138; 700 ×10 + SVG :1305; 800 :117; `<b>` ×19 (UA `bolder`) | lining-nums :75; tabular-nums :80, :126, :127, :149, :195, :305 | decorative empty `<i>` :1150-1158, :1204, :1244, :1445 | `fit()` :1537-1560 and `wraps` :1529 on Board21 resize :1693 and window resize :1694. Yes |
| Calendar widgets/calendar | body :11; buttons inherit :19 | #title 800 :17; buttons 700 :21; .dow 700 :31; .day 600 :32; .today 800 :35 | .day tabular-nums :32 | none | `fitTitle()` :86-91 on window resize :93. Yes |
| Dice widgets/dice | body :10; button `font: inherit` :42 | 700 :42, :43 | none (#total :43 changes on every roll) | none | `size()` :70 sizes dice, not text |
| Picture widgets/image | body :14; controls inherit :30 | h1 700 :25; #err 600 :26; buttons 700 :30 | none | none | `place()` :347 on resize :354 (pictures only) |
| Video Player widgets/youtube-player | body :15; inputs and buttons inherit :28, :37 | h1 700 :23; #err 600 :33; buttons 700 :37; offline 700 :54 | none | none | `keepClear`/`keepMinimum` on Board21 resize :424. Comment :44 "(one line at 200 px in every text style)" |
| Traffic Light widgets/traffic-light | none, no visible text (:10-11) | | | | |
| SDK Playground widgets/sdk-playground | body `font: 14px/1.4 var(--b21-font)` :11; controls inherit :16; code `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` :18; token swatch `fontFamily = var(--b21-font)` :576 | 600 :23, :65; 700 :47, :90, :107; 400 :88 | none | none | Derived context row "Text style" from the leading family: `CONTEXT_KEYS` :505, `textStyle()` :509-513, row label :523, value :551 ('Standard', 'Easier to read', 'Early readers'). Tests: tests/suites/sdk.js:249, :476, :478-514, :579-607 |
| Template widgets/_template | body :28; button inherit :34 | #count 800 :33 | none | none | 1b adds a words table and `data-t` (spec §3.11) |
| District apps (21Sketch, 21Timer, 21DocCam) | registry.js:254-293, `external: true`, no SDK (registry.js:39-42) | | | | Untouched. They keep their own fonts |

Comments in widgets that name the text style and need new words: zones :383-384; stopwatch :676, :1561;
sdk-playground :509; first-then :20, :32; task-timer :31, :151, :1780-1781; clock :1360; calculator :1139;
name-picker index :50, :994, style-lotto :9, style-spotlight :129, :525, style-groups :60, :314, style-versus
:325, :330, style-bracket :83, :454, style-wheel :711; weather :1527; youtube-player :44; timer :291-292.

## 4. The 400 to 490 regular

### 4.1 What the widgets ask for
Every weight from 300 to 900 is in use: 300 (Weather temperatures), 400 explicit (Clock Old numerals, Calculator
display digits and operator keys, Weather, SDK Playground) and implicit (all body text, canvas strings with no
weight such as Task Timer :1762), 500 (Stopwatch digits, Calculator keys, Notes undo, Weather ×12), 600, 650, 700
(the common bold, plus UA `bolder` for `<b>`/`<strong>`), 750 (Groups), 800, and 900 (First/Then ×9, Versus).
Canvas text in Stopwatch, Task Timer, and five Name Picker styles names its weight in a string.

### 4.2 Ways to make CSS 400 draw at about 490
| Way | Chrome (ChromeOS) | Safari (iPadOS) | Canvas text | Computed styles | Side effects |
| --- | --- | --- | --- | --- | --- |
| A. CSS: `body { font-weight: 490 }` and edit every explicit 400 | yes | yes | no, every canvas string with no weight stays 400 | change to "490"; tests/suites/calculator.js:933-934 read `fontWeight` | dozens of edits, misses canvas, 500 then sits 10 units above regular |
| B. `@font-face { font-weight: 490 900 }` | yes: the requested weight is clamped to the descriptor range and applied to wght (CSS Fonts 4) | yes, same rule | yes, canvas goes through the same face | unchanged | 300 becomes 490 (Weather's light temperature is lost); 500 draws at 500, about the same as the new regular |
| C. `@font-face { font-variation-settings: "wght" … }` | descriptor not supported | inconsistent | | | not usable |
| D. In the file, re-default with fontTools L4 (`wght: (100, 490, 900)`) plus avar | yes | yes | yes | unchanged | measured +12.4 KB (63.5 to 75.9 KB for Latin, Cyrillic, and Greek): the gvar deltas split at the new default |
| E. In the file, move only fvar's default and compose avar (recommended) | yes, Chrome applies font-weight to wght and FreeType/Skia honor avar v1 | yes, CoreText honors avar v1 | yes | unchanged | +0.2 KB. Every weight keeps its order and steps |

Proof for E (scratchpad r-inter/wtest/inter-shift-test.ttf): fvar wght default set to 310 (user), avar rebuilt as
the old avar composed with 100→100, 300→300, 400→490, 700→700, 900→900. Advance of "n" with fontTools'
instancer: new 400 = 1229 = old 490; new 500 = 1245 = old 560; new 600 = 1260 = old 630; new 700 = 1275 = old
700; new 300 = 1205 = old 300. Size 50.1 KB before and 50.3 KB after for Latin plus Cyrillic. gvar, HVAR,
MVAR, and GSUB FeatureVariations work in post-avar coordinates, so their visual weights are unchanged. If a
browser ignored avar, CSS 400 would still draw at about 455. If it set no wght at all, the default outlines are
today's 400. Each failure leaves plain Inter. Apply the same edit to the italic cut so italic letters match.

## 5. Italic and synthetic styles once the font is Inter
- Real italic needed: the Calculator's letters (§7).
- Synthetic oblique (Inter has no italic face in that frame):
  - Name Picker Versus names, `font-style: italic` at 900 (style-versus.js:22), measured on canvas with the
    same style (:93).
  - Calculator `.ce-word` (calc-engine.js:2113), the word "of" in percent problems (calc-engine.js:663, :858,
    :1005), shown in the widget's HTML (index.html:573-678 use `.html`).
- Synthetic bold: none, once the face is declared `font-weight: 100 900`.
- `<i>` reset to normal: Stopwatch :44, Zones :94, sdk/lab.html:19, sdk/board21-dev.js:50. Weather's `<i>` hold no text.
- No `<em>`, `<cite>`, `<var>`, `<dfn>`, or `font-synthesis` anywhere in widgets/.
- Inter Italic must never be declared by the SDK for the whole frame. Its cut has only a few letters, and an
  italic request for any other letter would skip to the next family (system-ui italic). That mixes fonts in
  Versus names and "of".

## 6. Characters beyond ASCII
Scanned: every widgets/**/*.html and *.js (words.js files included) and sdk/board21.js (Common words :178-202,
the pseudo language :250-281). Planned cut: Basic Latin, Latin-1, Latin Ext-A, Ș ș Ț ț, the recipe's
punctuation and SYMBOLS (build_fonts.py:11-14), Cyrillic U+0400-045F, Ґ ґ, №, and modern Greek.

Covered: every letter, digit, and Cyrillic word in the tables (Старт, Пауза, Сбросить, Скинути, the Timer and
Traffic Light rows), ° ± ² ³ ¹ ¼ ½ ¾ × ÷ π Σ – — ‘ ’ “ ” • … ‹ ⁄ ⁰ ⁴-⁹ ⁻ ⁿ ⅔ ↑ → ↓ − √ ≈ ≠ ≥, and the pseudo
language's Latin-1 and Ext-A accents.

Shown on screen and missing from the plan. Inter has each, so add them:
| Char | Where | Why |
| --- | --- | --- |
| U+2009 thin space | calculator/index.html:573, :577 (`.ce-eq` " = ") | every answer line |
| U+202F narrow no-break space | calc-engine.js:367 (`SEP.space`, the space digit grouping), :731 | digit groups |
| U+02BC ʼ | Ukrainian dates from `toLocaleDateString`/`Intl.DateTimeFormat` ("пʼятниця"): clock :997, :1003; calendar :59, :65, :77, :82. `Board21.format` already swaps it for ’ (board21.js:310) | Clock and Calendar in Ukrainian, phase 2 onward |
| U+1D47 ᵇ | manual prose page-src.html:400, :600 ("aᵇ"); calc-engine.js:1115 label in the Test practice message (index.html:466) | |
| U+21BA ↺ | first-then :1171; task-timer :641 | button labels |
| U+2713 ✓ | weather :1621; zones :374 | check marks |
| U+25B6 ▶ | task-timer :638, :1185 ("▶ Start") | optional: matches the button's words |
| U+200B zero-width space | notes :192 (sizer) | no glyph drawn. Harmless to add |

Measured: plan with the remap 50.3 KB (Latin plus Cyrillic). Latin, Cyrillic, and Greek: 63.5 KB, plus 0.7 KB for
the rows above. The 12 pseudo-language letters Inter has (ƀ ƒ ɱ ʠ ṽ ẋ Ɓ Ƒ Ṁ Ǫ Ṽ Ẋ, board21.js:255-257) add
1.2 KB more (Q7).

Not in Inter, so they fall back to the device as today: ⇄ ↶ ↷ (calc-engine.js:1123-1125, shown only in the Test
practice message), ⏸ ⏱ ⏮ ⏭ ⌛ ⏳ ⏰ (Task Timer, First/Then), ✔ ✕ ➔ ⭐, ▦ (comments), ［ ］ (pseudo language,
dev only), ∛ (in the recipe's SYMBOLS but not in Inter; the keypad draws ³√ instead, index.html:352), and about
190 emoji in Task Timer, First/Then, Zones, and Name Picker.

Only in comments or regexes, so no glyph is needed: ‐ ― (style-lotto.js:102, :109; style-spotlight.js:147, :151),
U+0305 (calc-engine.js:262, :1061), ‾ :672, ↔ :1064, ⌘ :2031-2033, □ (:383-384, MathML only :697), ʸ (:1132
alias), ▲ ▼ (clock comments :1053, :1122), ɏ (regex :280).

Frozen ss04 (build_fonts.py:72-85) also bars Cyrillic І and Ї, Greek Ι and its accented forms, and changes ß.
The Ukrainian reviewer should see І and Ї.

## 7. The Calculator's letters

### 7.1 widgets/calculator/index.html
- CSS: `.rules i { font-family: Georgia, "Times New Roman", serif; font-style: italic; }` :115;
  `.key i { … }` :237. Context weights: `.rules b` 700 :112, `.key` 500 :219, `.key.adv` `--ks: .84` :223.
  Sups: `.rules sup` :116, `.key sup` :238, `.key .ri` :239, `.key .fk` and its first `i` :240-241 (the a/b key).
- Letters in markup:
  - :278 the rule strip: `<i>x</i><sup><i>n</i></sup> √` (cell E). This is the strip's xⁿ. It is markup, not the
    U+207F character.
  - :351 `square` `<i>a</i><sup>2</sup>`; `power` `<i>a</i><sup><i>b</i></sup>`.
  - :352 `root` `<sup class="ri"><i>n</i></sup>√`; `cbrt` `<sup class="ri">3</sup>√` (no letter).
  - :353 `fraction` `<span class="fk"><i>a</i><i>b</i></span>`.
  - Letters used: a, b, n, x. Add o and f if `.ce-word` "of" (calc-engine.js:2113) uses the italic too (Q10).
- Comments only: :655 "E xⁿ √"; calc-engine.js:904.

### 7.2 docs/calculator-manual/page-src.html
- CSS: `.kp i { font-family: Georgia, "Times New Roman", serif; }` :169. No `font-style`, the UA makes `<i>`
  italic. `.rules i { …; font-style: italic; }` :189. Weights: `.kp span` 500 :164, `.rules b` 700 :186.
- Letters: :431 `<i>a</i><sup>2</sup>`, `<i>a</i><sup><i>b</i></sup>`, `<sup><i>n</i></sup>√`; :432
  `<i>a</i>/<i>b</i>`; :948 the strip `CELLS` `<i>x</i><sup><i>n</i></sup> √`. Same four letters.
- Prose with ᵇ and ⁿ in the page font: :400 "a² aᵇ ⁿ√ ∛ π % a/b", :600 "aᵇ", :608 "√ ∛ ⁿ√".
- Page font: `--font: system-ui, …` :11, used at :36, :78, :122, :192, :195, :215. The demo's board palette is
  copied from the SDK with `'font': 'system-ui, …'` :650-651.

### 7.3 Getting fonts into the manual
- build.js:58 fails on `url(` anywhere in the widget's markup, `<style>` included. build.js:177 fails on
  `url(` in the page. So a `url("fonts/…")` face in the Calculator breaks the manual's build, and so would a
  `url(data:…)` until both checks allow `data:`.
- check.js:24's CSP allows `font-src data:`, and the page may be up to 16 MB (build.js:178).
- The live demo is a srcdoc with the SDK inlined, so the SDK adds no face (§1.3). The build must put the Inter
  and italic-letter faces into the srcdoc too, and the page's `PALETTES` font must name Inter.
- The manual README says the page "has no other files". Base64 adds about a third: about 85 KB for Inter and 4 to 5 KB
  for the italic letters.

### 7.4 Calculator tests that read fonts
tests/suites/calculator.js:400-406 (every text style: keys and canvas in the style's font), :933-934 (computed
`fontWeight`), :1746-1791 ("the √ sign meets its bar in every text style"). CI already renders system-ui as Inter
(.github/fonts/56-prefer-inter.conf, workflows/tests.yml:39-44), so the √ join is tuned for Inter at 400 today.
The remap thickens the stroke by about 490/400.

## 8. Other tests that exercise widget fonts (pointers only)
Uses of the text style setting per suite: name-picker 18 (:248-299, :1243-1292, :2384), settings 24 (:780,
:1421, :1514, :1648), board-sync 10 (:2224), widget-picker 8 (:10, :225), sdk 5 (:139, :249-607), calculator 4,
video-player 4 (:336-362), board-history 3, weather 3, clock-and-calendar 2, zones 2, widgets 1. tests/words.js:434-435
covers `fontFor`. tests/suites/sdk.js:717 checks Notes' Crayon Libre still loads.

## 9. Open questions, with recommendations

Q1. How to make the regular about 490?
Recommend E (§4.2): bake it into the file by moving fvar's wght default and composing avar, so CSS 400, 500,
600, and 700 draw at about 490, 560, 630, and 700, and 300 stays 300. No CSS edits. Canvas and DOM agree.
Computed styles stay "400", so tests that read weights don't move. +0.2 KB. Check on a Chromebook and an iPad
that CSS 400 matches stock Inter at 490. Fallback if a device disagrees: B (`font-weight: 490 900`), which costs
the 300 light weight and the 400/500 step.

Q2. Does the Clock keep its serif Old face?
Recommend yes. `--serif` (clock :12) draws only the Old face's Roman numerals (:69, :287). It's a clock design,
not a text style, like Notes' theme lettering (decision 8). Tinos ships with ChromeOS and Times with iPadOS, so
nothing is bundled, and the numerals are only I, V, and X. Ask Tyler in one line, since "one font for everything"
could be read to cover it.

Q3. The 1a hook (`LANG_FONT`, `FACE_SCRIPTS`, `fontFor`)?
Recommend keeping it with `FACE_SCRIPTS = { Inter: ['latin', 'cyrillic', 'greek'] }`, so `fontFor` never drops
Inter. Rewrite tests/words.js:434-435 to prove Inter stays first for en, es, ru, uk, and qps. Delete the comment
at :108 and docs/WIDGET-SDK.md:375-376 and :485.

Q4. Standalone and AI-tool previews.
Recommend the SDK put Inter first in its own `PALETTES` (:65, :71) only when `fontBase` is the page's origin or
file:, mirroring board.js `LETTERS_HERE` (:4684). Otherwise use the system stack, so a preview's console shows no
CORS or CSP font errors. Inside the board, follow the board's palette as today.

Q5. Uploaded widget files, sealed with the SDK inlined.
Recommend the board add a data: `@font-face` for Inter next to the inlined SDK (board.js:463-471). The CSP
already allows `font-src data:`. It costs about 85 KB in each uploaded window's page, and keeps "one font"
true. If deferred, say in WIDGET-SDK that uploaded files use the device font.

Q6. Notes' Chalkboard and Russian or Ukrainian.
Recommend `CHALK_FONT = '"Crayon Libre", "Excalifont", …, "Inter", system-ui, …'` (notes :81) and `"Inter"`
before system-ui in `MARKER_FONT` (:82). Cyrillic and Greek chalk notes then stay hand-drawn, and the 1b rule
"Every font a widget uses needs Latin and Cyrillic letters" holds. If Tyler wants Notes' lettering untouched,
record Crayon Libre as the rule's one exception.

Q7. Add the pseudo language's 12 letters (+1.2 KB)?
Recommend yes. The pseudo check (`audit()`, board21.js:466-490) measures overflow, and fallback letters measure
differently from Inter. ［ ］ stay on the device font.

Q8. Load timing and font-display.
Recommend the SDK create the face with the FontFace API (`new FontFace('Inter', 'url(…)', { weight: '100 900',
display: 'swap' })`, `document.fonts.add`, `.load()`) as soon as it knows the family (host peek, init, or
standalone). Then canvas-only text and the first layout don't wait for DOM text to trigger the load. Keep `swap`,
today's tested behavior. Make the `loadingdone` refit (:158-160) also run when the document has any Inter face,
so host-injected data: faces (manual, sealed uploads) refit too.

Q9. Caches keyed by the family string.
The Clock's `refKey` (clock :689-690) never sees a font finish loading. Recommend resetting `refKey` in the
`fonts.ready` handler (:1361) or on the SDK's refit, so `longestLine()` (:1019) runs in Inter. Name Picker and
Stopwatch already clear theirs on resize.

Q10. The Calculator's italic letters.
Recommend:
- One woff2 at widgets/calculator/fonts/, cut from Inter-Italic[opsz,wght] at opsz 14, weight axis kept, the
  same fvar and avar edit as the upright.
- Letters a, b, n, and x. Measured 3.0 KB with the remap. Add o and f (3.7 KB) if "of" turns real italic.
- Declared in the Calculator's own `<style>` under its own family name, for example `"Inter Letters"`,
  `font-style: italic; font-weight: 100 900`. `.key i, .rules i { font-family: "Inter Letters", var(--b21-font); font-style: italic }`.
- A separate family keeps every other italic request in the frame on synthetic Inter, never on system-ui.
- List the file in registry.js:227 `files` and in sw.js.
- build.js swaps the `url()` for a data: URI and both `url(` checks (:58, :177) allow `data:`.
- The manual's `.kp i` (:169) and `.rules i` (:189) use the same family from a data: face.
- Inter Italic's a is one-story, as decided.
- `.ce-word` "of": recommend the same family with o and f, so "of" is real Inter Italic. The other choice is to
  set "of" upright.

Q11. Name Picker Versus italic.
Recommend leaving it: synthetic oblique Inter Black plus the existing `skewX(-9deg)` (style-versus.js:22),
measured the same way on canvas (:93). Check the look in a screenshot. If it slants too far, drop
`font-style: italic` and raise the skew.

Q12. Tabular figures.
Inter's default digits are proportional (advances 833 to 1323 units; tnum 1328). Roboto, today's system-ui on
Chromebooks, has tabular digits by default. Ticking numbers without tabular-nums will now shift:
- Task Timer "Total left" (:1732), and the countdown if it leaves `monospace`.
- Dice #total (:43).
Recommend:
- Task Timer `.digital-clock-time` (:107-112): `font-family: inherit; font-variant-numeric: tabular-nums` in
  place of `monospace`, so it is Inter too. Same tabular-nums on #clock-total-left.
- Don't freeze tnum in the file. The subset keeps `tnum` (build_fonts.py:26).

Q13. SDK_VERSION.
Recommend '1.7.0'. `--b21-font` now always leads with a bundled font in every language, and the `theme` event no
longer fires for a text style. Board21.version lets a widget tell. No new API.
