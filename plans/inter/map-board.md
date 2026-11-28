# Inter release: board-side map

Line numbers are main at 6dbd9cd (/home/user/21Board) unless marked **1b**, which means the 1b worktree
(`.../r-l10n/p1b/wt`, uncommitted, not final). Plan against main + 1b's spec; 1b shifts board.js by about +140 lines
near 4000, +170 near 5600, and +180 to +210 in the merge region.

---

## 1. Settings › Appearance › Text style (board.js)

| What | Where (main) | Where (1b) | Notes |
| --- | --- | --- | --- |
| `DEFAULT_SETTINGS.letters: 'standard'` and its comment line "The whole board's, like the theme and accent…" | 120-121 | 123-124 | 1b adds `widgetLanguage: 'en'` right after it and relies on that comment line (1b spec §3.6). Reword the comment when `letters` goes. |
| `paletteFor` puts `font: letterFont()` in the palette widgets get as `--b21-font` | 188-189 | 192-193 | The board→widget font contract. |
| `applySettings`: `themeSig = theme + '|' + accentNow() + '|' + letterKey()` posts `theme` to every window when it changes | 1304 | — | Drop `letterKey()`; the font no longer changes at run time. |
| `applySettings` calls `applyClassroom()` ("lock, screen, clock, text style") | 1316 | — | |
| Settings sheet map comment: "Appearance   Theme, Background ▸, Accent color, Text style ▸, Board shape" | 4009 | — | |
| Section 12b header "Classroom features: lock, stay awake, clock in the corner, text style", and "the text style is the whole board's" | 4018-4026 | — | |
| `applyClassroom()` → `applyLetters()` "(before the clock, which measures its text)" | 4029-4034 (4033) | 4174 | Whatever replaces it must still run before `applyClock()`. |
| `allDevices` / `labelled` comment names text style | 4035-4041 | — | `labelled` stays (Theme, Accent color). |
| `classroomAct` → `letterAct` | 4047-4049 | 4190-4191 | 1b puts `languageAct` first in the same chain. |
| Section "---- Text style (easier-to-read fonts)" with the long comment | 4650-4666 | 4815-4831 | |
| `LETTERS` table (Standard, Easier to read, Early readers; names, hints, families, files) | 4667-4673 | 4832-4838 | Also read by `parseBoardFile` (5734) and `MergeUI.style` (10674): removing `LETTERS` breaks both unless they change. |
| `LETTER_SAMPLE = 'Il1 0 ag'` | 4676 | — | |
| `FONT_BASE` (folder board.js came from) | 4678 | 4843 | Keep for Inter. |
| `LETTERS_HERE` (fonts load only on 21Board's own site or file:, never in an AI preview or the sealed lab) | 4679-4684 | 4849 | Keep the idea for Inter (rename). |
| `letterKey()` | 4685 | 4850 | |
| `letterFont()` = chosen family + `PALETTES.light.font` | 4686-4687 | 4852 | |
| `applyLetters()`: injects `<style id="letter-faces">` once with `@font-face` per file (`font-weight: 400`/`700`, `font-display: swap`), sets `document.body.style.fontFamily` | 4689-4700 | 4855-4865 | The pattern to reuse for Inter (one face, `font-weight: 100 900`). |
| `letterSettings()`: LAB row "Easier-to-read fonts can’t load in this test board. Try them in 21Board itself."; the three `.letter-opt` cards; `settingsGroup('letters', 'Text style', …, { sub: allDevices() })` | 4702-4715 | 4867-4880 | Goes. |
| `letterAct()` | 4717-4721 | 4882-4886 | Goes. |
| Called from `Settings.render` Appearance block: `${letterSettings()}` between `accentSettings()` and `shapeSettingsRow(seg)` | 5229-5234 (5233) | 5404 | Appearance becomes Theme, Background ▸, Accent color, Board shape. |
| `noLook`: three `.replace`s for `letter-opt` class/aria, the tick after `.sample`, and the group's `.v` | 4939-4950 (4948-4950) | 5114-5116 | 1b adds three `lang-opt` replaces right after (5117-5119): keep those. |
| `putLook`: `[data-act="letters"]` in the selector list, tick comment, the `letters` group `.v` copy | 4983, 4987, 4992-4993 | 5152, 5161 | 1b adds `[data-act="widget-language"]` and its own `.v` line. |
| `Settings.init` click comment "Text style and Size change the page before Settings is drawn again" | 5034 | — | Size still does. |
| Settings.act → `classroomAct` first | 5356 | — | |
| Picker re-measures on `document.fonts` `loadingdone` ("A font for the text style…") | 3168-3169 | — | Keep the listener (Inter loads after first paint, `swap`); reword the comment. |
| CornerClock re-measures on `loadingdone` | 4459-4460 | — | Keep; reword. |
| About comment "(see LETTERS_HERE)" | 4836 | 5001 | |
| `ABOUT_FONTS`: Atkinson Hyperlegible (Braille Institute, OFL), Andika (SIL, OFL), Excalifont, Crayon Libre, then the two Weather data sources | 4839-4842 | 5005 | Replace the first two with Inter (see §6). Rendered at 4855. |
| `MergeUI.style`: `text = LETTERS[x.letters].name`, clause "the text style to “…”" | 10668-10677 (10674-10675) | 10876-10881 | Drop the clause and the `LETTERS` read; keep theme, accent (and 1b's language) clauses. A summary entry holding only `letters` then returns `''`, and `MergeUI.shown` skips empty text (10647: `if (t) this.say(t)`), so no empty toast. |

**Kiosk:** nothing kiosk-specific. `KIOSK` (board.js:56) never hides Text style; the group shows as anywhere. Nothing to
change beyond the group going.

**Widget dev window and lab (LAB):** `letterSettings()` shows the LAB row above when `!LETTERS_HERE`. The dev window's
board page is `sdk/dev/board-shell.js` (built by tools/build-sdk.js:21-40 from index.html's `<style>` and `<body>`
only, not `<head>`), loaded as `srcdoc` (sdk/board21-dev.js:288-298), sandboxed in the lab (sdk/board21-dev.js:291,
527; sdk/lab.html:59). The dev window's and the lab's own chrome use their own `system-ui` stacks
(sdk/board21-dev.js:43, 81, 89, 103; sdk/lab.html:15, 21): developer tools, not board chrome.

**"Updated to …" note:** `updatedNote` (board.js:11132-11157) says only `Updated to ${BOARD_VERSION}.` once per build,
via `localStorage["21board-last-release"]`. Nothing about Text style today. No change needed (see Q8).

---

## 2. index.html CSS

- Text style cards (main 809-819): `.letter-opts`, `.letter-opt`, `.txt`, `b` 16px/700, `small` 12.5px, `.sample` 26px,
  `.on`, `.on b`, `.tick`, `.tick svg`. Comment "Text style: Settings → Appearance, one card per choice…" (809).
- **1b shares these rules by selector** (1b index.html 815-827): `.letter-opts, .lang-opts { … }`,
  `.letter-opt, .lang-opt { … }`, `.letter-opt .txt, .lang-opt .txt`, `b`, `small`, `.on`, `.on b`, `.tick`,
  `.tick svg`; `.letter-opt .sample` is letter-only. Removing the letter rules wholesale would unstyle 1b's Default
  widget language cards. Rewrite each to the `.lang-opt` half alone, drop `.sample`, and reword the comment
  (1b 815-817 names both).
- Then `node tools/build-sdk.js` (sdk/dev/board-shell.js is a copy; tests/suites/sdk.js checks it).

---

## 3. The `letters` value: stored, exported, imported, history, Board Sync

### 3a. Stored
- `settings` record: `letters` and `lettersAt` (DATA-FORMAT.md:93-100). `lettersAt` is set by `updateSettings` for
  every key in `Merge.STYLE_PARTS` (board.js:1265-1277, the loop at 1270). Never set by Board Sync (it patches `letters`
  only, 10288-10302).
- Stored settings are always read as `Object.assign({}, DEFAULT_SETTINGS, stored)` (1022, 1125, 1158, 3642, 6814,
  7085). Settings are written only as patches (`Writer.patch`, `Merge.patchSettings` 9350-9373) except Import ›
  Replace, which writes `Object.assign({}, S.settings, look)` (5952). A key the release stops naming survives in the
  record untouched. `OLD_SETTINGS = ['devWidgets', 'awakeFrom', 'awakeTo']` (1264) is the drop list for retired keys.
- The Writer copies `boards, deletedBoards, deletedAt, lastBoard` plus `Merge.STYLE_PARTS` from the stored record
  into the tab (883); the round's stale check compares `STYLE_PARTS` and their `…At` (7231-7234).

### 3b. Export and import
| Place | Line (main / 1b) | Today |
| --- | --- | --- |
| `buildExport` top level `letters: S.settings.letters` | 5610 / 5781 | every export, template, Board history snapshot, and Duplicate carries it |
| `parseBoardFile`: `letters: hasOwn(LETTERS, j.letters) ? j.letters : null` | 5734 / 5907 | needs `LETTERS` |
| Import dialog `look0` (`letters: S.settings.letters`) and `looks` clause "text style" | 5787-5789 / 5961-5963 | "So is the text style." |
| Import › Replace Undo: `for k of Merge.STYLE_PARTS if (replace && S.settings[k] !== look0[k]) back[k] = look0[k]` → `updateSettings(back)` | 5813-5814 | **hazard, see 3f** |
| `applyImport` Replace: `for k of Merge.STYLE_PARTS if (q[k]) look[k] = q[k], look[k+'At'] = rev` | 5948-5952 | takes a file's `letters` as a choice made here |
| `Pages.addFrom` passes `letters: null` (Open as a new page, Duplicate, all-pages imports) | 3778 / 3921 | |
| `importPages` / `openAsPages` | 5825-5866 | no style handling of their own (through `addFrom`) |

### 3c. Board history
- `delete exp.theme; delete exp.accent; delete exp.letters` in `bringBack` (8504), `restore` (8580), and the folder
  copy writer (8697) (1b: 8678, 8754, 8872, each also `delete exp.widgetLanguage`). Keep them: versions saved before
  the release still hold `letters`.
- `boardSig` (305-309) and `sigOf` (8145) never included `letters`. Nothing to change.

### 3d. Board Sync merge region (`// #region Board Sync merge`, board.js 9144-10614)
- **STYLE_PARTS** `['theme', 'accent', 'letters', 'accentColor']`, `LETTER_KEYS = ['standard', 'legible', 'early']`,
  `STYLE_DEF.letters = 'standard'`, `styleOk` (9149-9157). 1b: `STYLE_PARTS` gains `'widgetLanguage'` and
  `styleOk` gets an explicit `k === 'letters' ? LETTER_KEYS.includes(v)` branch (1b 9337-9340).
- **read** (9397-9404): `local.style[k] = { val, h, at, chosen: t !== null }` where `t = settings[k + 'At']`. A
  value with no `lettersAt` is never "chosen".
- **stamp** step 3 (9641-9663): a style part gets a new version only if `lp.chosen` (or on `seed`) and its hash
  differs from the ledger entry. A value only received has `E.h === lp.h` and is skipped.
- **viewsOf** (9828-9835): joins the peers' `style[k]` versions with the ledger's (`lww`).
- **plan** (10281-10302): another device's later version is written as `sp.set[k] = val` (no `…At`), said in
  `sum.style`; then `L.sync.style = style` rebuilt **from `STYLE_PARTS` only** (10302).
- **encode** (10375-10390): top-level `obj[k]` for every `STYLE_PARTS` key, `sync.style[k]` version when the value is
  the stamped one, and `partsH` hashes `STYLE_PARTS.map(k => obj[k]).concat([style])` (10390).
- **decode** (10485-10495): for each `STYLE_PARTS` key, `if (!sv[k]) continue;` (a file with no version says
  nothing); a version whose value fails `styleOk` is `skipped.push(k)` (only logged: 6662).
- **Tombstones and Rules 1 and 2:** style parts are not window or page parts. They are not in `keepH`/`winH`
  (9343-9345), the covers, `shown()` (9840-9856), or `includes()` (10532-10566). Rule 2 (a part never brings back a
  deleted window or page) holds for `letters` already. The Rule 1 analogue for style parts is the `chosen` test in
  read/stamp: a version is stamped only for a value chosen here (`…At` set).
- tests/merge.js: the region is the single switch. `PARTS_NOW = "STYLE_PARTS = ['theme', 'accent', 'letters', 'accentColor']"`
  and `Merge4`/`Merge6` stand-ins are made by rewriting it (main tests/merge.js:51-57; 1b 59-67 against
  `tests/fixtures/merge-2026.11.27-1.js`). Text style blocks: main 1639-1720; fuzz: `styleBase` 133, `setStyle`
  287-292, `chooseText` 636, 647-649, oracle 9 at 702, 748-780.

### 3e. A device on this release meets one on an older release that still has Text style
What the older release does with what it receives (it runs the same region as main/1b):
- If the new release's file **keeps** `letters` + `sync.style.letters`: exactly as today. Nothing changes for it.
- If the new release's file **drops** them: decode skips the missing part (10489-10490, `if (!sv[k]) continue`), viewsOf
  joins only the versions it still has (its own ledger entry, other old peers) (9828-9835), so it keeps its text
  style and keeps syncing it with other old devices. This path is already tested: `Merge4` is "a release that doesn't
  know the text style" (tests/merge.js:51-57; DATA-FORMAT.md:300-302). Its fingerprint of the new device's file
  simply changes once.
- Exports: an older release reading a file without `letters` gets `null` (5734) and Import › Replace skips it
  (5951 `if (q[k])`): "A file without `letters` leaves the text style as it is" (DATA-FORMAT.md:117).

So older releases lose nothing and do not break either way. The choice is about this release's own behaviour and cost.

### 3f. What this release should do with `letters` (recommendation)
**Keep it untouched and inert. Never show it, apply it, change it, or stamp it.**
1. **Merge region: no change.** Keep `'letters'` in `STYLE_PARTS`, `LETTER_KEYS`, `STYLE_DEF`, and 1b's `styleOk`
   branch. Device files keep writing `letters` and its version exactly as 1b does, so: no `partsH` change and no
   one-time rewrite of every device's file (10390), no tests/merge.js rework (the fuzz and the Text style blocks test
   the region, which is unchanged), and older devices see the same files as from 1b. The new device still takes an
   older device's later choice into `settings.letters` (10288-10302): harmless, never shown, and `MergeUI.style`
   says nothing once its clause goes (3a above). It never stamps one: nothing sets `lettersAt` any more, `read`
   marks the value unchosen unless `lettersAt` came from before the update (9401-9404), and a value it only received
   is skipped by hash (9655-9658). A choice made on this device before the update and not yet synced (made while
   unlinked) still goes out once at its old time, as the older release would have sent it.
2. **Stored record: leave `letters` and `lettersAt` as they are.** Do not add them to `OLD_SETTINGS` (1264): the merge
   still reads them (9401-9404), and a tab still on the older release during the update reads the same record.
3. **`DEFAULT_SETTINGS.letters`: remove** (120-121). `STYLE_DEF` covers a missing value in the merge (9156, 9402).
   Reword the comment line 1b leaves above `widgetLanguage`.
4. **Exports stop writing `letters`** (5610). **Imports ignore it**: `parseBoardFile` returns `letters: null` or
   omits it (5734), so `applyImport`'s loop skips it (5951). Drop the dialog's "text style" clause (5789).
5. **Keep `letters` in `look0` (5787).** If `look0` loses the key while `letters` stays a style part, the Undo loop
   (5813) finds `S.settings.letters !== undefined`, sets `back.letters = undefined`, and `updateSettings` stamps
   `letters: undefined` with a fresh `lettersAt` (1270). `read` turns that into a *chosen* `'standard'` (9402), stamp
   versions it, and every older device switches to Standard with "The laptop changed the text style to
   “Standard”." This is the Rule 1 trap. Alternatively make the loop skip `letters`.
6. **Board history deletes stay** (8504, 8580, 8697).
7. `MergeUI.style`: drop the `text` clause (10674-10675) and update its comment (10668).
8. Comments in the region (9149-9154, 9397-9399, 9641-9646, 10281-10286, 10485-10486) get one line: "This release never
   shows or changes the text style. It keeps carrying it for releases before 2026.11.xx, which still show it."
   A later release can drop `'letters'` from `STYLE_PARTS` when no device runs an older one (one rewrite per device).

The other option, dropping `'letters'` from `STYLE_PARTS`, is safe for older devices (3e) but costs a one-time rewrite
of every linked device's file, a rework of tests/merge.js's text style blocks and fuzz oracle 9 against a frozen
fixture, and changes the region the fuzz protects. Nothing in it helps a teacher.

---

## 4. Board chrome fonts

### 4a. Font stacks
- index.html:78 `body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }`. Everything inherits:
  `input, textarea, select { font: inherit }` (89), `button { font: inherit }` (97).
- board.js `PALETTES.light.font` / `PALETTES.dark.font` (84, 90): the same stack; `--b21-font` for widgets and the tail
  of `letterFont()`. tests/words.js:433 has this string as `plain`.
- board.js sets `document.body.style.fontFamily` only for a chosen text style (4699).
- Other stacks: `<noscript>` `font:18px system-ui` (index.html:888); `DevFiles.note` `font:15px system-ui` (board.js:456,
  a sealed widget frame whose CSP is `font-src data: blob:`, 441-442: Inter can't load there); sw.js `offlinePage`
  `font:16px system-ui` (sw.js:192-194, shown in widget windows offline). These can stay system-ui.
- The boot failure screen (board.js:11677-11698) inherits `body`.

### 4b. Weights used in board chrome
- index.html, by value: **400** at 195, 488, 521, 532, 633; **500** at 330, 404, 487, 492, 543, 576, 611, 656;
  **600** at 199, 299, 373, 416, 475, 515, 523, 567, 586, 614, 620, 644, 678, 685, 688, 769, 806; **650** at 435
  (`.menu-choice`); **700** at 148, 192, 193, 348, 374, 381, 382, 386, 578, 645, 648, 654, 712, 804, 805, 813;
  **800** at 351 (`.widget-tile .devtag`).
- Implicit: `body` normal (400); UA bold (700) for `.sheet-head h2` (471) and `.sheet h3` (478); `<b>`/`<strong>` are
  `bolder` (from 350-549 → 700, from 550-749 → 900).
- board.js inline: 600 (lock tip, 4153; bare corner note, 10898); SVG `<text font-weight="700">` in Board history
  minimaps (8931, inline SVG, inherits the page font).
- 1b adds `.menu-item .value { font-weight: 400 }` (1b spec §3.5).
- Today Atkinson and Early Readers have only 400 and 700 faces (4695); "Weights 600 to 800 come out in the Bold face,
  500 in the Regular one" (4662). With Inter's weight axis (100-900) 500, 600, 650, 800, and 900 become real.

### 4c. `font-variant-numeric`
- index.html:688 `.stepper output` (Size of windows %), index.html:798 `.corner-clock`. Both `tabular-nums`. None in
  board.js. The recipe keeps `tnum` and `pnum`.

### 4d. Text the board fits or measures
- Widget Picker: `fitRow` (3246-3256, scrollWidth of the controls row vs the other ▦), `fitNames` (3259-3265, two-line
  clamp, index.html:343-345), `fitCols` (3233-3242, five vs six columns); `tileName` keeps short hyphenated names on
  one line (423). Re-measured on `document.fonts` `loadingdone` (3169).
- Window menu choices: `fitChoices` sets `--fit` when a label is wider than 78% of its circle (3452-3463,
  index.html:432-436).
- Clock in the corner: `CornerClock.place`/`fitNote` measures itself and what fits (4514-4567); re-measured on
  `loadingdone` (4460); `applyLetters` must run before `applyClock` (4033).
- Title bars: CSS only (`.win-label .name` ellipsis, `.sub` shrinks first: index.html:192-199); `renderTitle`
  (2081-2091) measures nothing.
- Page indicator `.page-ind` (index.html:372-375, `b` nowrap) and `#page-flash` (384-391); Settings' folder name
  ellipsis (`.link-name`); none measured in JS.
- Line height: Inter's `normal` is 1.21 em (hhea 1984/-494/0 at 2048 upm). Segoe UI is about 1.33, Roboto about 1.17.
- CI and this machine use Inter 4.0 static (`fonts-inter`, apt) as `system-ui` (.github/workflows/tests.yml:39-44,
  .github/fonts/56-prefer-inter.conf; README.md:823-824). Test baselines are already Inter widths; the bundled cut
  differs by weight (≈490 regular) and ss04's I and l.

---

## 5. Files

| File | Line | Today | For Inter |
| --- | --- | --- | --- |
| `fonts/` | | AtkinsonHyperlegible-Regular/Bold.woff2 (18.7/19.1 KB), -OFL.txt; EarlyReaders-Regular/Bold.woff2 (23.4/23.7 KB), -OFL.txt | Inter roman (about 65 KB with Cyrillic and Greek) and `Inter-OFL.txt` (copy of `dl/inter/OFL.txt`) |
| sw.js `SHELL_FILES` | 98-104 | six font files, comment "Settings → Text style (board.js section 12b): loaded only when chosen…" | Inter files; new comment |
| sw.js `FILES`, `BUILD` | 17-80 | written by tools/release.js | regenerated; bump `VERSION` (14) |
| sw.js install/activate | 149-165 | new cache per VERSION+BUILD; activate deletes every older copy | Atkinson and Early Readers leave devices with the old copy. No cache-name rule beyond VERSION. |
| sw.js fetch | 196-220 (206) | `cache.match(req, { ignoreSearch: true })` | a `?v=` on the font URL is fine |
| widgets/registry.js `files` | 51-301 | board fonts are not here; Notes lists its fonts (114) | the Calculator italic goes here if it lives in `widgets/calculator/` (Q6) |
| tools/release.js | 1-110 | derives the list from sw.js `PRECACHE`; names no font | no change |
| tools/build-sdk.js | 21-40 | copies index.html `<style>`/`<body>` | no font; a static `@font-face` with a relative URL in index.html would be copied into the dev window and 404 there |
| tools/build-letter-fonts.py | 1-134 | `src...` (Atkinson and Andika TTFs), `--out DIR` (default fonts/), `--flavor woff2|ttf`; Basic Latin, Latin-1, Ext-A, Ș ș Ț ț, 19 symbols; keeps tnum/pnum, hinting, kerning, all names; renames Andika to "21Board Early Readers" and tightens its line height; refuses italics (113-114) | replace with an Inter build (port of r-fonts/page-work/build_fonts.py: instancer `opsz=14`, drop calt arrow lookups, freeze ss04 in cmap, subset with tnum/pnum, plus Greek, the weight remap if Q5, and the italic cut for the Calculator); keep `--out` and `--flavor` |
| tools/build-chalk-font.py | | Notes' Crayon Libre | no change |
| board.js `ABOUT_FONTS` | 4839-4842 | see §1 | `['Inter', 'by Rasmus Andersson and the Inter Project Authors', OFL]`, then Excalifont, Crayon Libre, weather |
| board.js `ABOUT_LICENSES` | 4838 | LICENSE, LICENSE-DOCS | no change. Tyler uploads LICENSE and LICENSE-DOCS himself: never touch them |
| NOTICE | 12-16 | "Fonts, each under its own license:" Atkinson, Andika as "21Board Early Readers", Excalifont, Crayon Libre | replace the first two with "- Inter, by Rasmus Andersson and the Inter Project Authors. SIL Open Font License 1.1." (font page's NOTICE line) |
| docs/teacher-guide/build.js | 15-16 | inlines `fonts/AtkinsonHyperlegible-Regular/Bold.woff2` as base64 (`__ATK_REG__`, `__ATK_BOLD__`) | **breaks when Atkinson leaves fonts/**. Inline Inter instead |
| docs/teacher-guide/page-src.html | 6-7, 15, 427 | its own text in Atkinson (`--font`); card "Letters made for young readers" | Inter; drop the card |
| docs/teacher-guide/work/scenes.js | 440, 516-527 | settings-appearance shot lists Text style; `textstyle.jpg` scene (Early readers) | drop the scene and shot; retake |
| docs/calculator-manual/page-src.html | 169, 189 | `.kp i` and `.rules i` in Georgia | Inter Italic (widget map); its check.js CSP is `font-src data:` (24): embed as a data URI |

---

## 6. README and DATA-FORMAT lines

README.md
- 46: upload list "`fonts/` with its `-OFL.txt` licenses".
- 150-154: Settings › Appearance › **Text style ▸** paragraph (Standard, Easier to read, Early readers, Notes keeps its
  lettering, Board Sync, "Before 2026.11.17-2 it was called *Letters*").
- 195: layout "fonts/  Text style fonts (Settings → Appearance), saved offline, loaded only once chosen".
- 355-373: Board Sync set-up modes name "theme, accent color, and text style" (355, 358, 360, 362, 365, 373).
- 408-423: "Theme, accent color, and text style belong to the board", "Choose Early readers on the laptop…", the
  "changed the text style to “Early readers”" message, the 2026.11.16-4 paragraph (418-420), "On all your devices."
  beside Text style (422).
- 644: district apps "theme, accent color, text style, and size don't reach these apps".
- 758: Board history "Going back never changes the theme, accent color, or text style."
- 823-824: CI installs Inter as the system font.
- 856-865: Third-party files: Atkinson and Andika entries, `build-letter-fonts.py`, "The four fonts add about 83 KB…".
- 875: "**Fonts** keep their own licenses."
- tests/suites/board.js:1110 fails unless README contains "Choose Early readers on the laptop, and the smartboard":
  it breaks when 408-412 change. Update that copy test with the README.

docs/DATA-FORMAT.md
- 93-96: `themeAt`/`accentAt`/`lettersAt` comment. 100: `letters` field ("standard" | "legible" | "early").
- 112-117: exports carry `letters`; "A file without `letters` leaves the text style as it is."
- 233: ledger `style: { …, letters: { h, v }, … }`.
- 270-293: Board Sync style parts prose (`settings.letters`, `lettersAt`, "a text style a newer 21Board added").
- 300-302: "A device on 2026.11.16-4 doesn't know the text style…" (the model for "this release no longer shows it").
- 356: device file `sync.style.letters`.
- 642, 650: Board history never changes the text style; folder copies are without it.
- 761: `.21board` example `"letters": "standard"`.
- 858, 862-867, 881: import modes name the text style.

---

## 7. Interfaces to the widget side (for the widget map)
- `--b21-font` comes from `paletteFor` (board.js:188-189). The SDK adds `@font-face` only for families it knows:
  `LETTER_FACES` (sdk/board21.js:116-147), `fontBase` = `…/fonts/` next to the SDK (130). `FACE_SCRIPTS`
  (sdk/board21.js:286-287: "Neither has Cyrillic letters") drops a Latin-only leading family for ru/uk windows
  (`fontFor`, 290-294). Inter needs an entry with latin, cyrillic, and greek, and `font-weight: 100 900`.
- SDK Playground shows a "Text style" context row derived from the font (widgets/sdk-playground/index.html:506-551).
- docs/WIDGET-SDK.md:234-235, 369-381, 616-618 and docs/AI-PROMPT.md:319-322 describe Text style.

---

## 8. Tests that drive Text style (rewrite volume)
`openSettings(page, ['letters'])` (tests/lib.js:40) and `data-act="letters"` taps appear in: settings.js (56 lines:
1-416 Appearance list, 668-671 About credits, 780-812 tidy "in every text style", 976-1010, 1420-1690 three Text style
suites incl. "no font file is fetched while Standard" 1449, the offline-copy font check 1514-1526, the dev window
1648-1685), board-sync.js (48: 392, 1875-1900 hints, 2223-2341 the Board Sync text style suite incl. Import),
widget-picker.js (12: 10-298 "every Text style" loops), sdk.js (13: 476-607), clock-and-calendar.js (635-653),
widgets.js (682-698), board-history.js (72-97), name-picker.js (41), calculator.js (8), weather.js (13),
video-player.js (9), zones-check-in.js (4), timers.js, picture.js, board.js (1110), tests/words.js:433. 1b keeps
settings.js:1452 and board-sync.js:2265 counting `.letter-opt` (1b decision 18). Loops "in every text style" shrink
to one font: test time goes down.

---

## 9. Open questions, with recommended answers

1. **Keep `letters` in the merge, or drop it?** Keep it, inert (§3f). The merge region, device files, and
   tests/merge.js stay as 1b leaves them; older devices see no change at all. Drop it in a later release.
2. **Exports and imports?** Stop writing `letters` in exports; ignore it in imports; drop the dialog clause; keep
   `look0.letters` (or skip `letters` in the Undo loop) so Undo never stamps it.
3. **The stored value?** Leave `letters` and `lettersAt` untouched. Remove `letters` from `DEFAULT_SETTINGS` only.
4. **Where does the board's `@font-face` live?** In board.js, injected once at boot from `FONT_BASE`, only where fonts
   can load (today's `LETTERS_HERE` test, renamed). Not in index.html: build-sdk.js copies its `<style>` into the dev
   window, where a relative `url()` would 404 and log errors in AI previews. Body stack becomes `"Inter", ` + the
   system stack, set by board.js as today (4699) or in index.html; either falls back cleanly. Keep `font-display:
   swap` and the two `loadingdone` re-measures. In LAB with no fonts, say nothing (no setting to explain).
5. **How to get "about 490 where the board uses 400"?** Recommend in the font: remap the weight axis at build time
   (avar) so CSS 400 draws about 490 while 600, 700, and 800 stay where they are, with 500 between. Board CSS,
   widgets' CSS, and `bolder` stay as they are, and every widget on `--b21-font` gets it. The alternative is CSS:
   `body { font-weight: 490 }` plus the five explicit 400s (index.html:195, 488, 521, 532, 633, and 1b's
   `.menu-item .value`), which leaves widgets at 400 unless each changes.
6. **Where do the Calculator's Inter Italic letters live?** With the Calculator, as Notes does
   (`widgets/calculator/fonts/`, listed in registry.js `files`), with its own family name so a missing glyph falls back
   cleanly. The roman and `Inter-OFL.txt` go in `fonts/`. (Widget map to confirm.)
7. **Teacher Guide?** Switch its own font to Inter in build.js and page-src.html, drop the "Letters made for young
   readers" card and `textstyle.jpg`, and retake every shot: each shows board text, which changes weight and I and l.
8. **"Updated to …" note?** No change. No extra message for teachers who had Easier to read or Early readers.
9. **About and NOTICE?** One Inter line in each, as in §5. LICENSE and LICENSE-DOCS untouched.
10. **tools/build-letter-fonts.py?** Replace it with one Inter build script (roman and the Calculator italic), keep
    `--out` and `--flavor`, and delete the old script with the old fonts.

## Top risks
1. The Import Undo trap (§3f item 5): `letters` kept as a style part but dropped from `look0` stamps
   `letters: undefined` and resets every older device to Standard, with a toast.
2. `LETTERS` is read outside section 12b (`parseBoardFile` 5734, `MergeUI.style` 10674): deleting it alone throws.
3. 1b's `.lang-opt` cards share the `.letter-opt` CSS rules by selector: delete the letter half only.
4. docs/teacher-guide/build.js inlines `fonts/AtkinsonHyperlegible-*.woff2`: the guide build fails once they go.
5. A static `@font-face` in index.html leaks into sdk/dev/board-shell.js and 404s in the dev window.
6. About 200 test lines across about 15 suites tap Text style or check its fonts and credits.
