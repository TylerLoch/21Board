# Inter release: tests, docs, and guides map

Line numbers are main at 6dbd9cd (`/home/user/21Board`). 1b (`.../r-l10n/p1b/wt`, uncommitted) leaves almost every
test line cited here where it is. Where it moves or changes one, the note says **1b**. Board-side code (board.js,
index.html, sw.js, sdk) is in the sibling map, `r-inter/map-board.md`. This map does not repeat it.

Scratch files made for this map, all in `r-inter/det/`:
- `woff2-cmap.js`, a working 50-line Node reader for a WOFF2 file's cmap.
- `probe.py` and `probe2.py`, the determinism probes, with their logs.

---

## 0. Facts that shape everything below

- **CI already measures text in Inter.** `.github/workflows/tests.yml:39-45` installs `fonts-inter`, which is
  Debian/Ubuntu 4.0 static OTFs. `.github/fonts/56-prefer-inter.conf` maps `system-ui`, `sans-serif`, Segoe UI,
  and the rest to Inter. This machine is the same: `fc-match system-ui` gives `Inter-Regular.otf`, `fonts-inter
  4.0+ds-1`.
  - So every test using "Standard" today renders stock Inter 4.0 at opsz 14, weight 400, with `calt` arrows on and
    stock `I` and `l`.
  - The bundled build changes three things only:
    - weight 400 draws about 490, which is wider;
    - ss04 is frozen in, so `I` goes from 0.269 em to 0.441 em (+64%) and `l` from 0.242 to 0.275 em (+14%);
    - `->` stays two glyphs.
  - Measured from `dl/inter/Inter[opsz,wght].ttf`, hmtx at default weight, with the ss04 GSUB mapping.
- **Measurements will match teachers' devices.** On a Chromebook, iPad, or Windows panel, today's Standard shows
  Roboto, SF, or Segoe. With the font bundled, CI and classrooms measure the same letters. Fit thresholds tuned to
  CI's Inter now hold everywhere.
- **The two old fonts are wider than Inter.** Atkinson Hyperlegible and Andika are both wider, and every fit check
  "in every text style" passed in them. Checks that only say text fits its box should keep passing at 490. The real
  risk is lower bounds tuned to stock Inter at 400 (§1c).

---

## 1. Tests

### 1a. Checks that break or go dead when Text style goes

Times are from `tests/timings.json`, the seconds of the whole suite on CI.

| File:lines | Suite (timings key, abbreviated) · s | What it does with Text style or fonts | Fate |
| --- | --- | --- | --- |
| tests/lib.js:38-41 | (helper comment) | `openSettings` groups list names `'letters'` (Appearance → Text style) | Edit the comment |
| tests/lib.js:489 | (`boardUp`) | Waits for the store and startup only, never for fonts | See Q4: wait for `document.fonts.ready` |
| settings.js:1 | file header | "Settings: text style, accent color, …" | Edit |
| settings.js:412-416 | Settings: sections and groups… · 27 | Appearance rows `Theme,Background,Accent color,Text style,Board shape` | Breaks: drop Text style |
| settings.js:428, 469, 473 | same | groups list includes `letters hidden` (**1b** prefixes `widget-language hidden,`) | Breaks: drop `letters hidden` |
| settings.js:668, 671-673 | Settings: About… · 30 | MARKS and CREDITS name Atkinson Hyperlegible (Braille Institute) and Andika (SIL) | Breaks: one Inter credit line |
| settings.js:780-812 | same | Tidy at 1920 × 1080 200% "in every text style": three passes (802-810) | Dead loop: one pass |
| settings.js:988, 1009-1010 | Settings keeps a control still… · 17 | Opens `letters`; taps a Text style card, then Standard | Breaks. **1b's `lang-opt` card is the same layout**: tap it instead |
| settings.js:1420-1512 | Text style (Letters): Settings, 21Board's text and widgets'… · 8 | Standard by default; `system-ui` body; no `/fonts/` fetch while Standard (1449); three `.letter-opt` cards with sample `Il1 0 ag` (1452-1457); `document.fonts` reports family loaded `400,700` (1463); every part of board chrome and every word in five widgets in the family (1464-1485); another tab follows; export carries `letters` (1495); reload keeps it; no request leaves the site; fonts come from `fonts/*.woff2` (1510) | Rewrite as the board's font suite (Q3). Keep: Inter in chrome and in every widget word, loaded in frames, another tab, nothing off-site, fonts from `fonts/`. Invert 1449: the font is fetched. A variable face reports one weight range, not `400,700` |
| settings.js:1514-1646 | Text style (Letters): text fitted to its window still fits; the fonts are in the offline copy · 17 | `shipped.length === 6` (1523); `board.js` and SDK name 4 identical woff2 files (1526); offline Atkinson loads (1532-1543); Clock, Timer, Calendar, note, and Name Picker fit after each switch (1593-1624); Task Timer pie redrawn in the font after `loadingdone` (1585-1622); Board21 `resize` fires after the font arrives, with woff2 delayed 0.7 s (1629-1645) | Keep the ideas. Compare sets, not counts (RELEASING:29). Fit once in Inter. The late-font resize and pie redraw now happen at first load, with a slow woff2 route, not on a switch |
| settings.js:1648-1690 | Text style (Letters): the widget dev window… · 13 | On 21Board's site, three cards and loading works (1672-1679). In an AI preview and the lab: 0 cards, a Settings line "Easier-to-read fonts can't load…" (1685), `system-ui` body and no `#letter-faces` (1686), no font fetch or error (1691) | Keep: Inter loads in the dev window on site. Keep: nothing fetched or logged in preview or lab. Drop the Settings line and card counts |
| board-sync.js:391-392 | Board Sync: setting up (scenarios 1–4…) · 38 | `On all your devices.` count `=== 3` (Theme, Accent, Text style). **1b** makes it 4 | Becomes 3 |
| board-sync.js:1875-1900 | Board Sync: theme and accent color on every device (… the hints) · 13 | `hints().text` reads the `letters` group's hint (1885, 1893, 1899) | Drop `text` |
| board-sync.js:2223-2343 | Board Sync: theme and accent color, and the text style (Early readers …) · 12, and **1b** adds about 4 s | `FAM` table (2227); Early readers, Easier to read, and Standard switches; messages "changed the text style to …"; Settings ticks under `.letter-opt` (2265-2269); file `letters` and `sync.style.letters`; Import Replace "So is the text style." (2305-2341) | Text style steps go. Theme, accent, and 1b's default widget language stay. Title changes, so the timings key changes |
| board-history.js:72-74, 95-97 | Board history · 95 | The wreck picks Early readers; going back leaves `letters === 'early'` | Drop the letters half; keep the theme |
| board.js:1108 | Copy: words no other suite checks… · 10 | Requires `use system fonts, and draw` in `sdk/board21-dev.js:191` | Breaks only if that fix text changes (Q9) |
| board.js:1110 | same | **Fails if README.md loses** "Choose Early readers on the laptop, and the smartboard" (README:410) | Breaks. Delete the entry: RELEASING:25 says don't check docs' words |
| board.js:1463 | Pages (multiple boards) · 69 | Export keys `…,accent,letters,board,…`; **1b** adds `widgetLanguage` | Only if exports stop writing `letters` (map-board Q2) |
| widget-picker.js:10, 122-145, 198-205 | Widget Picker: icons in line… (every Text style, …) · 39 | Loops `standard, legible, early`, waiting for two loaded faces (126-127) | One pass; title changes |
| widget-picker.js:225, 234, 264-298 | Widget Picker: Paste (… in every Text style and Size …) · 63 | Two style loops; the second is 12 Sizes × 2 corners × 3 styles | One style; title changes |
| name-picker.js:248-299 | (`fitTools.letters`) | Helper that picks a Text style | Delete |
| name-picker.js:1243, 1290-1303 | Name Picker: Groups · 108 | Early readers and Easier to read refit at 360 × 270 | Dead: drop, or one "names in Inter" check |
| name-picker.js:1976, 2025-2033 | Name Picker: Bracket · 120 | The same, 24 names at 540 × 400 | Dead |
| name-picker.js:2384-2440 | Name Picker: Versus from a file, and long names fitting in every Text style · 222 | Three styles × sizes × 10 pickers of ink-gap screenshots; Standard alone has 14 sizes, and the others 5 each (2411-2434) | One style. About 100 of 240 picker shots go. Title changes |
| name-picker.js:2526-2542 | Name Picker: Versus names as windows resize, in dark theme, and the docs · 159 | "Early readers in dark theme is the tightest fit", 20 windows | Dead |
| name-picker.js:2948-2964 | Name Picker: Spinning wheel · 142 | Easier to read reaches the slices after `loadingdone`, and the banner and SPIN | Port: Inter reaches the wheel, redrawn once loaded |
| name-picker.js:3335-3363 | Name Picker: Spotlight · 100 | Easier to read reaches tiles and cards, measured again | Port to one check, or drop |
| name-picker.js:3859-3874 | Name Picker: Lotto · 147 | Easier to read: names fitted again, `fs !== w0.fs` | The "again" goes. Keep "in Inter" |
| sdk.js:249 (title), 474-476, 512-516 | SDK Playground… · 50 | Context row `text-style` = `Standard`; palette `--b21-font` follows Atkinson; State says "Easier to read" | Breaks. Depends on whether the Playground's Text style row goes (widget map) |
| sdk.js:579-607 | same | P7: 320 × 260 "in every text style", font must include the family | One pass |
| clock-and-calendar.js:635-659 | Clock in the corner (Auto by default …) · 58 | Opens in legible and early, then switches; `--clock-room` equals reach, with woff2 delayed 0.7 s | Port: open with Inter delayed, then check it measures again on arrival |
| widgets.js:682-698 | Standards picks: rule cells, ± and 0, school Drive, and grade labels · 61 | Rule cells fit in three styles at the narrowest canvas | One pass |
| widgets.js:631, 644 | same | `.rules i`: `fontStyle === 'italic'` only, not the family | Still passes; add a family check (§1e) |
| calculator.js:101-102 | Calculator: the Widget Picker and a new window… · 80 | **Exact** `files` list `["widgets/calculator/index.html","widgets/calculator/calc-engine.js"]` | Breaks if the italic font joins the Calculator's registry `files` (map-board Q6) |
| calculator.js:399-406 | same | Keys and canvas in the style's font, three styles | One check |
| calculator.js:1746-1791 | Calculator: the √ sign meets its bar in every text style · 5 | Pixel check of the √ join in Standard and Early readers | Standard (Inter) only; title changes. The √ is an SVG (calc-engine.js:615-622), so only the radicand's metrics vary |
| weather.js:368-391 | Weather: every size, light and dark… · 264 | Part 7 "Text style": every word in Atkinson, then Andika; Atkinson layouts at 6 sizes × 4 Show sets | One "every word in Inter" walk. Drop the 24 layouts, since the suite's own size parts now run in Inter |
| weather.js:1016-1032 | Weather: Location, On a date, and Simple words · 38 | Simple words in Small, in Early readers | Drop the Early pass |
| video-player.js:336-364 | Video Player: light and dark, at least 200 × 200… · 45 | Smallest link box × 7 messages × 3 styles; `fitted.length === texts.length * 3` | One style; `* 1` |
| zones-check-in.js:433-452 | Zones Check-In: the registry, and its layout… · 32 | Tile wraps "Zones / Check-In" in every style | One check in Inter |
| tests/words.js:430-436 (**1b** 499) | Languages: the Node check of every words table · 0 | `fontFor` drops Atkinson and Early Readers for ru, uk, and qps | Breaks: Inter has Cyrillic, so ru, uk, and qps keep it |
| tests/merge.js:7-26, 50-57, 133, 287-300, 495, 552, 568-576, 630-702, 744-781, 1380-1902, 2225 | Board Sync merge: the Node test of the merge · 318 | About 131 lines drive `letters` as a style part, including the 2026.11.16-4 interplay | **No change if `letters` stays an inert style part** (map-board Q1). Dropping it means rewriting the longest suite |

Not affected:
- widgets.js:82-137, Notes: fit, links, chalkboard (16 s). Crayon Libre and Excalifont stay (decision 8).
- sdk.js:717, Widget dev window, the Crayon check.
- picture.js:49 compares the buttons' font to the body's, generic. picture.js:296 is an SVG's own font.
- timers.js:758 (Stopwatch) and clock-and-calendar.js:1378 measure with the computed font, generic.
- tests/fixtures/*: no font files or `fonts/` URLs.
- tests/calc-engine.js: no font.

### 1b. Fit and size checks Inter at 490 could move

All of these already run in Inter. They see wider text from the heavier weight and the barred `I`.

| File:lines | Check | Slack |
| --- | --- | --- |
| name-picker.js:2436-2440 | Versus names `>= 14` px at 400 × 400 and 420 × 420, `>= 20` at 300 × 520 and 640; 400 × 500 at least 0.85 × 360 × 480 | **Lower bounds on fitted px: tightest** |
| name-picker.js:2415-2434 | Ink gap of 8 px or more beside the emblem, 10 above and below | Heavier strokes take a little of it |
| weather.js:307-311 | Now view at 480 × 360: compass 95 px or more, temperature 56 px or more | Lower bounds |
| weather.js:313-320 | W and E stay 0.5 px clear of the compass ticks at 14 px | Wider `W` at 490 |
| video-player.js:357-361 | Link box title on one line at 200 × 200 | Passed in wider fonts |
| zones-check-in.js:452 | "Zones / Check-In" wraps after Zones | Passed in wider fonts |
| widget-picker.js:10-205 | Two-line names, `…` cut, no clipped ink | Passed in wider fonts |
| calculator.js:409-416 | Menu fits 1366 × 768 without scrolling | Heights only. Inter keeps today's line metrics |
| board.js:544-568 | Window menus never scroll | Heights only |
| settings.js:780-812 | About doesn't stick out at 200% | Passed in wider fonts |
| timers.js:752-760 | "Let go to stop" box measured with canvas | Generic |
| clock-and-calendar.js:1372-1390 | Face numerals inside the dial, measured by canvas | Generic, if Inter is loaded in the frame first |
| **1b** languages.js Suite B | Pseudo language: nothing cut off | The pseudo letters ƀ ƒ ɱ ʠ ṽ ẋ Ɓ Ƒ Ṁ Ǫ Ṽ Ẋ aren't in the planned subset and fall back (Q7) |
| text with capital I | Any tight label with `I`: "Image", "Import", "In words", "Illegal", and names such as "Isabella" | 0.17 em wider each |

### 1c. Load timing: a new kind of flake

Today Standard loads no font, and the other two styles load only when chosen. With Inter always on, a test can
measure before the font arrives (`font-display: swap`). On CI the fallback is stock Inter 400, so the reflow is
small but real: 490 against 400, and the `I` width. Widget frames load their own `@font-face` (sdk/board21.js:122-145
today). `addWin` (lib.js:350) waits 900 ms, and the SDK's resize after `loadingdone` refits. `boardUp` (lib.js:489)
waits for nothing font-related.

### 1d. Timings for the suites this release touches

From tests/timings.json: 154 suites, 7553 s in all, 49 s on average. A new suite counts as 49 s in the CI split
(run.js:26-41) until timings are saved after the first CI run.

| Suite | s | Change | Estimated s saved |
| --- | --- | --- | --- |
| Name Picker: Versus from a file, … in every Text style | 222 | 1 style, not 3 | about 80-100 |
| Weather: every size, light and dark, … | 264 | part 7 shrinks | about 25-40 |
| Widget Picker: Paste (… every Text style and Size …) | 63 | 1 style | about 30 |
| Widget Picker: icons in line … (every Text style, …) | 39 | 1 style | about 15 |
| Name Picker: Versus names as windows resize, in dark theme, … | 159 | Early pass goes | about 12 |
| Video Player: light and dark, at least 200 × 200 … | 45 | 1 style | about 10 |
| Name Picker: Groups / Bracket / Spotlight / Lotto / Spinning wheel | 108 / 120 / 100 / 147 / 142 | the style switch goes | about 3-8 each |
| SDK Playground: … | 50 | 1 style | about 5 |
| Settings: About … | 30 | 1 tidy pass | about 3 |
| Clock in the corner (Auto …) | 58 | ported | about 0-3 |
| Standards picks: … | 61 | 1 style | about 3 |
| Calculator: the Widget Picker and a new window … | 80 | 1 check | about 2 |
| Calculator: the √ sign meets its bar in every text style | 5 | 1 style | about 2 |
| Weather: Location, On a date, and Simple words | 38 | Early pass goes | about 3 |
| Zones Check-In: the registry, and its layout (…) | 32 | 1 check | about 2 |
| Board Sync: theme and accent color, and the text style (…) | 12, plus about 4 from 1b | text style steps go | about 5 |
| Board Sync: theme and accent color on every device (…) | 13 | one field | 0 |
| Board Sync: setting up (scenarios 1–4 …) | 38 | one number | 0 |
| Board history | 95 | one click | about 1 |
| Settings: sections and groups … | 27 | lists | 0 |
| Settings keeps a control still … | 17 | swap the tapped card | 0 |
| Pages (multiple boards) | 69 | export keys, maybe | 0 |
| Copy: words no other suite checks … | 10 | one entry | 0 |
| Text style (Letters): × 3 | 8 + 17 + 13 = 38 | rewritten as the board's font | about 5-10 |
| Board Sync merge: the Node test (tests/merge.js) | 318 | none, if `letters` stays inert | 0 |
| Languages: the Node check of every words table (tests/words.js) | 0 | font tests rewritten and added | +0.1 |

In all, about 2080 suite-seconds touch fonts. Removing the style loops saves roughly 200-250 s. The checks in §1e
add under 5 s. CI wall time falls slightly.

### 1e. Checks to add, cheaply, with no new dependencies

1. **Coverage, in Node** (tests/words.js, which runs as `Languages: the Node check…`, under 0.1 s). Read
   `fonts/Inter*.woff2` the way `r-inter/det/woff2-cmap.js` does. That reader is tried on today's two fonts, the
   page's Inter cuts, and the italic test cut.
   - How it works: the WOFF2 table directory has a flags byte, a known-tag index or a 4-byte tag, and UIntBase128
     lengths. `transformLength` is present only for glyf/loca at version 0 and for other tables at version ≠ 0. Then
     `zlib.brotliDecompressSync` on the one compressed stream gives the tables back to back with no padding. cmap is
     never transformed, so formats 4 and 12 are read directly.
   - It checks:
     - every character in every words table, in all four languages, plus the common words;
     - the board's symbol list from the build tool. Leave out `∛`, which Inter lacks, so it falls back;
     - modern Greek;
     - `fvar` has only `wght`, so opsz is pinned;
     - if the weight is remapped in the font, `avar` maps 400 to about 490;
     - the Calculator italic file has every letter inside `<i>` in `widgets/calculator/index.html` and
       `docs/calculator-manual/page-src.html`. Today that is a, b, n, and x.
   - The same test replaces test 11 (the `fontFor` cases).
2. **Shapes, in the browser.** Add to the board's font suite, about 1 s.
   - Canvas `measureText` in the board's font: `I` at least 1.4 × `l`. ss04 gives 1.60; stock Inter gives 1.11.
   - `->` is as wide as `-` plus `>`, so the arrow ligature is gone.
   - `getComputedStyle` of `.key i` and `.rules i` names the italic family.
3. **Offline list** (offline-and-updates.js:10-26, 'Offline'). Today it follows `<script|img|link|source>` only.
   Add CSS `url(...)` in a widget's `<style>`, so a font left out of registry `files` fails. Node, 0 s.
4. **Two-story a.** A grep check that no CSS turns on `cv11` (decision 6), in an existing Copy suite.

### 1f. What docs/RELEASING.md says about choosing filters and writing tests

- **There is no section on filters**, in main or in 1b. What exists:
  - RELEASING:13: "Run the suites the change touches."
  - RELEASING:93-94: rerun a failure alone with `node tests/run.js "<suite title>"`.
  - `tools/release-workflow.js:48`: the builder runs "the spec's suites". The CPU rule at :27 allows one test
    process at a time and says to rerun a failure alone.
- **How a filter works** (tests/run.js:83-87): one filter per run, the first argument that isn't a flag, matched as
  a case-insensitive substring of the suite title. To run several groups, run several times.
- **1b's spec §5.9 is the precedent.** It lists filters, warns that a bare `"Settings"` or `"Text style"` also runs
  the Clock's and the Name Picker's long suites, and leaves the rest to CI. Measured today:
  - "Text style" matches 10 suites, 446 s;
  - "Board history" matches 12 suites, 390 s;
  - "Name Picker" matches 11 suites, 1348 s;
  - "Offline" matches 10 suites, 300 s;
  - "Kiosk" matches 16 suites, 577 s.
- **Writing tests**, RELEASING:18-29:
  - the fewest checks that prove the change;
  - each rule once, at two or three sizes;
  - the area's own helpers;
  - what teachers see and what's saved, with no exact pixel positions unless the spec sets them;
  - never the docs' words;
  - change an old test only when its behavior changed;
  - add to the feature's suite, and start a new suite only for a new feature;
  - name a suite for what it tests;
  - never tie a check to the release, such as a recorded layout or a version.
  - **1b** adds at line 31: "Set a window's language through the board, never the browser's locale."
  - Two existing checks break these rules: board.js:1110, a doc's words, and settings.js:1523 and 1526, counts that
    are true only for one release's files.

---

## 2. Teacher Guide (docs/teacher-guide/)

- **README.md:5-14, the steps:**
  1. edit `page-src.html`;
  2. retake the changed shots with `node docs/teacher-guide/work/shoot.js <scene> …` (no scene takes them all);
  3. `node docs/teacher-guide/build.js`;
  4. `node docs/teacher-guide/check.js`;
  5. publish `dist/page.html` with `dist/files.json` to the link.

  README:16-23, For IT: shots come from this checkout. The district apps are fetched with curl. Weather uses
  fixtures.
- **build.js:15-17 inlines `fonts/AtkinsonHyperlegible-Regular.woff2` and `-Bold.woff2` as base64**
  (`__ATK_REG__`, `__ATK_BOLD__`), plus Notes' chalk font. build.js:41-42 fails on any placeholder left over.
  **The build fails as soon as the Atkinson files leave `fonts/`.**
- **page-src.html, the guide's own type:**
  - 6-7: `@font-face` Atkinson at 400 and 700;
  - 15: `--font: "Atkinson Hyperlegible", system-ui, …`;
  - 8 and 16: Crayon Libre for the chalk headings, which stays.
- **page-src.html cards:**
  - 427: card "Letters made for young readers": Settings › Appearance › Text style, Early readers, Easier to read,
    and the shot `textstyle.jpg`. It goes.
  - 423: the section lede "pick the look your students read best" may need a word change.
  - 272: Notes K–2 idea about chalk letters, a print l and a flagged 1. It stays.
  - **1b** adds a "Four languages" card after 427, plus Timer and Traffic Light lines.
- **check.js:18:** CSP `font-src data:`, so any new font must be inlined as a data URI. It fails on console errors,
  sideways scroll, broken shots, missing alt text, dead links, and uneven tiles, at 3 sizes in light and dark: 6
  Chromium contexts.
- **Shots used by page-src.html: 32 today.** After this release: 32, minus `textstyle.jpg`, plus 1b's
  `language.jpg`.
  - hero-board, picker, menu, pages, history, appearance, lock, and empty;
  - 23 widget shots: w-timer, w-stopwatch, w-task-timer, w-calendar, w-notes, w-name-picker, w-name-picker-groups,
    w-name-picker-versus, w-name-picker-bracket, w-first-then-board, w-zones-check-in, w-dice, w-youtube-player,
    w-image, w-calculator, w-traffic-light, w-clock, w-clock-faces, w-clock-led, w-weather, w-21sketch, w-21timer,
    and w-21doccam;
  - **every one shows 21Board text**, title bars at least, so all are retaken. In w-21sketch, w-21timer, and
    w-21doccam only the title bar changes. Their scenes need the network to reach *.ccsd21.org.
  - `shots/hero-board-dark.jpg` is in the folder but no page uses it.
- **How shots are taken** (work/shoot.js:1-195):
  - one Chromium at 1366 × 768, deviceScaleFactor 2, JPEG quality 82, service workers blocked;
  - the clock is fixed to Fri Nov 20, 8:20 Central;
  - each scene starts a fresh board with `newBoard`, which waits for the store, then 800 ms;
  - **nothing waits for fonts.** A scene for Inter should await `document.fonts.ready` before `shot()`.
  - Scenes are in work/scenes.js. `SCENES.textstyle` (516-529) opens the `letters` group and picks Early readers.
    `SCENES.settingsLook` (440-447) opens `['letters', 'bg']`. **Both fail once Text style goes.**
  - Unused by the page: `heroDark`, `settings`, `settingsLook`, `kiosk`, and the by-product `history-empty.jpg` from
    `SCENES.history`. A bare `shoot.js` writes those five files into shots/.
  - **1b** adds `SCENES.language`, scenes.js +20 lines.
- **Time.** run.log keeps no timings. The scripted waits add up to about 2 minutes, plus a fresh board per scene.
  Estimate 5 to 8 minutes for the 32 scenes, not measured. Build is under 1 s. check.js runs 6 contexts, about 1
  minute.
- **Tests that read the guide** check words and CSS rules, never fonts:
  - widgets.js:781, 813-831; weather.js:127-130; zones-check-in.js:1506; calculator.js:840-861, 1094;
  - clock-and-calendar.js:1051; name-picker.js:2039 (`text-wrap: pretty`); board.js:1037 (tiles.json).

## 3. Calculator manual (docs/calculator-manual/)

- **README.md:1-5:** build with `node docs/calculator-manual/build.js`, check with `check.js`, then publish
  `dist/page.html` to its link. It has no other files.
- **build.js:**
  - 37-42 reads `widgets/calculator/index.html`, `calc-engine.js`, `sdk/board21.js`, `tests/calc-engine.js`, and
    `sw.js`;
  - 53-62 inlines both scripts into the live demo's srcdoc;
  - **build.js:57-58 fails if the widget's markup has `url(`, `<link>`, `<img>`, `<iframe>`, or `<script src>`.**
    An `@font-face { src: url(…) }` for Inter Italic in the widget's `<style>` stops the manual build. It must be
    swapped for a data URI there, or the build taught to inline it.
- **page-src.html:**
  - 11: `--font: system-ui, …`, so the manual's own text is the device font;
  - **169: `.kp i { font-family: Georgia, "Times New Roman", serif; }`**;
  - **189: `.rules i { font-family: Georgia, "Times New Roman", serif; font-style: italic; }`**;
  - 662-667: `palette()` sends colors only, with no `font`. So the demo Calculator's `--b21-font` is the SDK default,
    the device font, not the board's.
- **check.js:24:** CSP `font-src data:`, so fonts must be inlined. A blocked font URL logs a console error, and
  check.js fails on console errors. check.js:153 and 175 write screenshots to `dist/shots/`, which `.gitignore`
  covers. **The manual has no committed screenshots to retake.**
- **Tests that read the manual** check words and the four rule cells, never its fonts:
  - calculator.js:576, 850, 1085-1090, 1406, 1738;
  - widgets.js:830-831;
  - board.js:1782, the Oxford comma scan, which strips `<style>`.
- Size today: dist/page.html is 433 KB. Inlining the italic adds about 3 KB. Inlining roman Inter too adds about
  85 KB.

## 4. Docs: every line about fonts or Text style

**docs/WIDGET-SDK.md** (**1b** moves these about +8 lines: 242, 243, 377-389, 501, 637-640):
- 234: `theme` event "The theme, accent color, or text style changed." Drop text style.
- 235: `resize` "Also fires when the teacher's text style changes, and again once its font loads". Keep the load
  part.
- 369: `--b21-font` row, "Font stack". It stays.
- 371-376: `--b21-font` is the device's own font unless a text style is chosen.
  - It names the board's `fonts/`, CORS for other sites, and sealed uploaded widgets.
  - "A Russian or Ukrainian window skips those fonts, which have no Cyrillic letters." Rewrite: Inter, all four
    languages, falls back where CORS blocks it.
- 378-381: fit on resize, which fires when the style changes and once the font loads. Form controls need
  `font: inherit`. Keep both, minus "text style".
- 485: "A Russian or Ukrainian window skips the easier-to-read fonts, which have no Cyrillic letters." Goes.
- 490-492: pseudo language "with accents and a Cyrillic letter". It stays.
- 616-619: dev window, "Text style … works only … on 21Board's own site … stays Standard, and Settings says so."
  Rewrite: the board's font loads only on 21Board's site.
- 68, 672, 689, 713: "no web fonts", meaning a widget's own. They stay.

**docs/AI-PROMPT.md** (**1b** shifts these about +21 lines):
- 107 and 370: "no web fonts". They stay.
- 131-144: skeleton `font-family: var(--b21-font)` and `font: inherit`. They stay.
- 319: token list. It stays.
- **321-324: "The teacher's text style: `--b21-font` can change while the widget is open (… Text style)".**
  Rewrite: keep `font: inherit`, and fit on resize, which fires once the font loads.

**docs/TRANSLATING.md:** no font lines in main or 1b. 72 is about Ukrainian words.

**docs/ROADMAP.md:** no font or Text style lines in main or 1b.

**docs/RELEASING.md:** none.

**CLAUDE.md:**
- None in main.
- **1b adds line 43** in its new Languages section: "Every font a widget uses needs Latin and Cyrillic letters."
  - Inter meets it. Notes' Crayon Libre has no Cyrillic at all: every а-я and А-Я is missing, as are ґ є і ї.
    Excalifont has full Russian and Ukrainian. Checked with `woff2-cmap.js`.
- Copy tests pin CLAUDE.md lines: board.js:1796-1797 (the Labels and Oxford comma pair) and 2023-2032 ("Build it,
  check it, then publish it" exactly twice). Leave those alone.

**README.md:** about 30 lines. The Text style ones are listed in map-board §6; the font ones are:
- 46: `fonts/` with its `-OFL.txt` licenses. It stays.
- 150-154: Text style ▸ paragraph. It goes.
- 195: layout line "Text style fonts …, loaded only once chosen". Rewrite.
- 355-373, 408-422, 644, 758: theme, accent color, and text style. Drop text style.
  - **410 is pinned by board.js:1110.**
- 823-824: "`.github/fonts/` makes Inter the system font". Still true, now for fallback text only.
- 856-865: Atkinson and Andika entries, `tools/build-letter-fonts.py`, and "The four fonts add about 83 KB …".
  Rewrite for Inter and the new tool.
- 875: "Fonts keep their own licenses". It stays.

**docs/DATA-FORMAT.md:**
- 93-100, 112-117, 233, 270-302, 356, 642, 650, 761, 858-881, as map-board §6 lists.
- The 100 comment names "Atkinson Hyperlegible" and Andika in `letters` values.

**Code text that reads as docs:**
- `sdk/board21-dev.js:191`: "use system fonts, and draw images with inline SVG", pinned by board.js:1108 (Q9).
- `widgets/sdk-playground/index.html:509-551`: the Text style context row.
- `sdk/board21.js:115-147` and `284-294`: comments.
- tests.yml:39-40: the comment "so text measures the same".

**docs/GLOSSARY.md** and **tools/glossary.json**: only "letters" in the sense of an alphabet. Nothing to change.

---

## 5. Building Inter: method, reproducibility, and the source files

### 5a. How the font page measured

From `r-fonts/lab/README.md` and `r-fonts/page-work/build_fonts.py`.
- **Tools:** fontTools 4.68, analyze.py run with `python3 -I`, Playwright 1.63, one Chromium.
- **Metrics:**
  - x-height and cap height from the tops of x and H;
  - width as the a-z average advance, at weight 400 with other axes at their defaults;
  - coverage counted from the cmap;
  - tabular digits checked through `tnum`;
  - `calt` effects in `tmp/calt.json`.
- **Distance:** a 1920 px board shot reduced to 630 px (20/20) or 315 px (20/40) with a box filter, then enlarged
  (BRIEF.md "Distance simulation").
- **Page recipe** (build_fonts.py:51-83):
  - `instancer.instantiateVariableFont(src, {'opsz': 14}, updateFontNames=False)`;
  - drop the `calt` lookups whose ligatures make `*rrow*` or `uni27F*` glyphs. That finds lookups 47 and 51;
  - freeze ss04 by pointing cmap entries at the ss04 glyphs: 46 glyphs, 92 cmap entries over two subtables;
  - subset with the default layout features plus `tnum` and `pnum`, every name ID and language, and a `.notdef`
    outline, dropping DSIG;
  - WOFF2.
- **Characters** (11-22):
  - Basic Latin, Latin-1, Latin Extended-A, and Ș ș Ț ț;
  - 19 punctuation marks;
  - SYMBOLS `§©°±²³·¹½¾×÷π–—‘’“”•…‹›⁄⁰⁴⁵⁶⁷⁸⁹⁻ⁿ⅔↑→↓−√∛≈≠≤≥Σ←`;
  - Cyrillic U+0400-045F, plus Ґ ґ and №;
  - Greek and Vietnamese were measured only.
- **Sizes:**
  - from build-seed0.log: Latin 46,184 bytes; with Cyrillic 55,832 (54.5 KB); with Greek and Vietnamese 72,232;
  - **measured here: with modern Greek (U+037E, U+0384-03CE, no reserved points), 63,244 bytes, so +7.2 KB.**

### 5b. Same bytes on every rebuild: what is needed

Tested here with nice'd Python, one process at a time.
- **The timestamp is the only variable.** build-seed0..3.log show four different sizes: 55,832, 56,000, 55,868, and
  55,884. With `TTFont(..., recalcTimestamp=False)` on every open and reload, the full recipe gives **identical
  tables and an identical WOFF2** under `PYTHONHASHSEED` 0, 1, and 3, with or without Greek: 55,832 bytes, SHA-1
  prefix 7c746d0270. With the timestamp recalculated, only `head` differs, yet the WOFF2 grows to 55,948 bytes,
  because brotli compresses everything as one stream. `tools/build-letter-fonts.py:102` already passes
  `recalcTimestamp=False`. The page's `reload()` does not.
- **A tool that anyone can rerun needs:**
  1. the same source bytes, checked by SHA-256 before building:
     - `Inter[opsz,wght].ttf` `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`, 876,576 bytes,
       "Version 4.001;git-66647c0bb";
     - `Inter-Italic[opsz,wght].ttf` `acd98e64795781b2058f07b18475e0ecee2a0fe2b42a49e2f9e37d0d6bf66ce6`, 906,596
       bytes;
     - `OFL.txt` `5b9321a4…`;
     - google/fonts `main` still serves the roman with that SHA-256 today. Checked with curl.
  2. `recalcTimestamp=False` everywhere. Re-exec with `PYTHONHASHSEED=0` as cheap insurance, though it made no
     difference here.
  3. Pinned tool versions, printed and checked: fontTools 4.68.0 and brotli 1.2.1 on this machine, Python 3.13. A
     different brotli can change WOFF2 bytes even from identical tables.
  4. Asserts that fail loudly when upstream changes: exactly 2 `calt` arrow lookups found, and exactly 46 ss04 glyphs.
  5. Everything the page recipe leaves out:
     - Greek in the shipped cut;
     - the weight change, decision 5, applied the same way each time, for example an `avar` remap (see
       `r-inter/wtest/`);
     - the Calculator italic cut;
     - output names;
     - `--out` and `--flavor`, as today's tool has;
     - optionally the pseudo-language letters (Q7);
     - a version string such as "…; 21Board subset" in name ID 5, as build-letter-fonts.py:70 does.
  6. A `--check` mode that rebuilds into a temp folder and compares bytes with the shipped files, like
     `tools/build-sdk.js --check`. It can't run in CI tests, which have no Python and no fontTools, so it is a manual
     step in the tool's README notes.

### 5c. Commit the upstream TTFs, or download them?

| | In the repo (`tools/fonts-src/`) | Downloaded by the tool |
| --- | --- | --- |
| Size | 1.78 MB raw, about 0.96 MB gzip-9, against a 9.8 MiB pack: about +10%, in history for good | 0 |
| License | OFL allows it; OFL.txt goes alongside | OFL.txt still ships in `fonts/` |
| Offline rebuild | Works offline | Needs the network once, or local paths, as today's tool takes (`build-letter-fonts.py:27-28`) |
| Hosting | `tools/` is never uploaded (README:42-43) | — |
| Same bytes | Guaranteed | Guaranteed only with the SHA-256 check and a pinned URL. `main` can move, so pin a google/fonts commit, which wasn't reachable from here. rsms/inter v4.1 is a 33.7 MB zip with different files (`InterVariable*.ttf`), so different output |

### 5d. Checking the shipped WOFF2 in tests, with Node alone

Yes, with `zlib.brotliDecompressSync` and about 50 lines (`r-inter/det/woff2-cmap.js`). It reads the table
directory, decompresses, slices the tables (no padding between them), and reads cmap formats 4 and 12. Results:

| File | Code points | Missing from a 33-character probe |
| --- | --- | --- |
| page `inter.woff2` | 459 | Δ θ μ (no Greek yet) |
| page `inter-more.woff2` | 627 | none |
| `r-inter/italic2/inter-italic.woff2` | 4: a, b, n, x | — |
| today's Atkinson | 294 | — |

Inter lacks `∛`, and so does every font the lab tested. `fvar`, `avar`, and untransformed `hmtx` can be read the same
way. fontTools' WOFF2 transforms only glyf and loca by default.

---

## 6. Open questions, with recommended answers

1. **Rename the three "Text style (Letters)" suites?** Yes. Fold them into one or two suites named for what they
   test, such as "The board's font: Inter in 21Board and every widget, another tab, the offline copy, and nothing
   from another site" and "The board's font: the widget dev window and the lab". Keep each port in §1a. Use the new
   titles as the spec's filters. Each old timings key falls back to the 49 s average until timings are saved.
2. **Suites whose titles say "every Text style"?** Retitle them: Name Picker Versus from a file, both Widget Picker
   suites, the √ suite, SDK Playground, and the 1b Board Sync style suite. Accept the new timing keys.
3. **Where does the coverage check live?** tests/words.js, beside test 11. It's Node, free, and already runs as
   "Languages: the Node check …". Read the needed characters from the words tables and from one list the build tool
   also reads, such as `tools/inter-chars.json`. Then the tool and the test can't drift. Never hardcode a count of
   files or code points.
4. **Guard against measuring before Inter arrives?**
   - Make `boardUp` (lib.js:489) also await `document.fonts.ready`. One line covers every suite.
   - Suites that route woff2 slowly on purpose keep their own waits.
   - Guide scenes do the same before each `shot()`.
5. **Which suites does the builder run locally?** About 10 minutes in all; leave the rest, about 25 minutes, to CI.
   One filter per run:
   - "the board's font" (new);
   - "Languages: the Node check";
   - "Settings: sections", "Settings: About", "Settings keeps a control";
   - "Board Sync: theme" (37 s), "Board Sync: setting up" (50 s);
   - "Copy: words no other";
   - "Widget Picker: icons", "Widget Picker: Paste";
   - "Calculator: the √", "Standards picks", "Calculator: the Widget Picker";
   - "Zones Check-In: the registry", "Video Player: light", "Clock in the corner (Auto", "SDK Playground".

   Avoid bare "Name Picker" (1348 s), "Board history" (390 s), "Kiosk" (577 s), and "Text style". Run "Name Picker:
   Versus from" (about 130 s after the change) once, since it holds the tightest lower bounds.
6. **Teacher Guide's own font?** Inter. build.js inlines the shipped roman WOFF2 as one variable face at
   `font-weight: 100 900`, in place of `__ATK_REG__` and `__ATK_BOLD__`. That's about 83 KB of base64, so the page
   goes from 199 KB to about 230 KB. Then the guide reads like the board in its pictures. The chalk headings stay.
7. **Add the pseudo language's letters to the subset?** Yes. ƀ ƒ ɱ ʠ ṽ ẋ Ɓ Ƒ Ṁ Ǫ Ṽ Ẋ are in full Inter and cost well
   under 1 KB. Then 1b's "nothing cut off" check measures Inter, not a fallback mix. ［ ］ still fall back.
8. **Retake which guide shots, and how?**
   - All 32 the page uses, with an explicit scene list: hero, picker, the 23 `w-*`, menu, pages, history,
     appearance, lock, empty, and language.
   - Delete `SCENES.textstyle`, drop `'letters'` from `settingsLook`, and remove the `history-empty.jpg`
     by-product.
   - The three district-app scenes need the network. If it's down, keep their old shots and say so: only the title
     bar differs.
9. **`sdk/board21-dev.js:191`, "use system fonts"?** Keep it. It tells an author to drop web fonts, and `--b21-font`
   is still the way to get the board's. If the spec changes the words, update board.js:1108 in the same change.
10. **Calculator manual fonts?**
    - Inline the italic cut as a data URI for `.kp i`, `.rules i`, and the demo frame. build.js:57-58 must swap the
      widget's `url()` for it.
    - Also inline roman Inter and add `font` to the manual's `palette()`, so the live Calculator looks as on the
      board. That's about +85 KB.
    - The manual's own text may stay system-ui, or switch to Inter at no extra cost once it's inlined. Recommend
      Inter.
11. **Upstream TTFs: repo or download?**
    - Download. The tool takes local paths, as today's does, or `--download`.
    - `--download` fetches from a google/fonts URL pinned to a commit (to find), checks both SHA-256s, refuses
      anything else, and caches outside the repo.
    - The tool's header and README record the URLs, hashes, sizes, and fontTools and brotli versions.
    - Ship `fonts/Inter-OFL.txt` from the same upstream folder.
12. **Replace or extend `tools/build-letter-fonts.py`?** Replace it with one tool for the roman and the Calculator
    italic, keeping `--out` and `--flavor`. Delete the old script with the old fonts. Its Andika renaming and line
    height code has no use left.
13. **tests/merge.js?** Don't touch it. Keep `letters` an inert style part (map-board Q1).
14. **Notes in Russian and Ukrainian (out of scope)?** Crayon Libre has no Cyrillic, which conflicts with 1b's
    CLAUDE.md rule. Leave it for Notes' phase-2 translation. Note it in the spec's open items.

## Top risks

1. The Teacher Guide's build.js inlines `fonts/AtkinsonHyperlegible-*.woff2`, and the manual's build.js rejects
   `url(` in the Calculator. Both builds break on the first commit that removes Atkinson or adds an italic
   `@font-face`.
2. Measuring before the font loads. Inter now loads on every page and frame, but no helper or guide scene waits for
   fonts. That means flaky width checks and wrong-weight screenshots.
3. Lower bounds tuned to stock Inter 400 and a narrow `I`: Name Picker Versus px floors (name-picker.js:2436-2440),
   Weather compass and temperature (weather.js:307-320), and the one-line link box title. 490 weight plus ss04 makes
   text about 2-3% wider, and `I` 64% wider.
4. Byte-reproducibility: the page recipe recalculates `head.modified`, which alone changes WOFF2 bytes. A different
   brotli or fontTools changes them too. Pin and check both, plus the source SHA-256s.
5. calculator.js:102 pins the Calculator's registry `files` exactly, and board.js:1110 pins a README sentence about
   Early readers. Both fail on routine edits.
