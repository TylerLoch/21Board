# Release spec: Languages, Phase 1b (the board: Language row, Default widget language, Board Sync, rules)

| | |
| --- | --- |
| Repo | /home/user/21Board |
| Base | main's tip, `claude/focused-curie-9oovoy` (now 6dbd9cd, "Merge lang-1a": release 2026.11.27-1, Phase 1a as built, with its review fixes). Its code is 307b4a4's; only tests/timings.json differs (GitHub's measured seconds). |
| Branch and worktree | `lang-1b`, at /tmp/claude-0/-home-user/3abf7383-5faa-519e-81df-c65df20cfbd1/scratchpad/r-l10n/p1b/wt (`git worktree add -b lang-1b <that path> claude/focused-curie-9oovoy`, as docs/RELEASING.md says) |
| VERSION | `'2026.11.27-2'` |
| Spec folder | /tmp/claude-0/-home-user/3abf7383-5faa-519e-81df-c65df20cfbd1/scratchpad/r-l10n/p1b/ |
| Source spec | /tmp/claude-0/-home-user/3abf7383-5faa-519e-81df-c65df20cfbd1/scratchpad/r-l10n/spec.md (§ numbers marked "src" point there) |
| Tyler's answers | /tmp/claude-0/-home-user/3abf7383-5faa-519e-81df-c65df20cfbd1/scratchpad/r-l10n/answers.md |
| Approved mockups | /tmp/claude-0/-home-user/3abf7383-5faa-519e-81df-c65df20cfbd1/scratchpad/r-l10n/p1b-mock/ (index.html; shots/menu.png, menu-edge.png, settings.png, windows.png, menu-dark.png, settings-dark.png; work/build.js and work/lang.css hold the exact markup and CSS) |
| Phase 1a spec | /tmp/claude-0/-home-user/3abf7383-5faa-519e-81df-c65df20cfbd1/scratchpad/r-l10n/p1a/spec.md |

Every file:line below is as of 307b4a4, the same at 6dbd9cd. board.js lines equal 6436160's (1a changed only its two
stamp lines).
tests/lib.js lines are 10 more than the source spec says (1a added `wordsOf`). Line numbers drift as you edit: find the
code by what it says.

## 0. What ships

Teachers see languages for the first time. The Timer and the Traffic Light declare English, Spanish, Russian, and
Ukrainian. Their window menu gets a **Language** row with a globe, which opens the four languages in a flyout beside
the menu. A choice is saved with that window and reloads it in the new language. **Settings › Classroom › Default
widget language** sets the language new windows start in. Both sync with Board Sync, and older releases lose nothing.
Every path that makes a window carries its language: the Widget Picker, export and import, templates, Board history,
Put back, Duplicate this page, uploads, and the dev window. The board's own text that holds teacher or student words
gets `translate="no"`. The rules for every future widget go into CLAUDE.md, AI-PROMPT.md, WIDGET-SDK.md, README,
RELEASING, DATA-FORMAT, and tools/release-workflow.js. The Teacher Guide gets a Four languages card and new screenshots.

After 1b, a Timer or Traffic Light switches language from its menu, and new windows take the default. Title bars and
menus stay English (Q1). Every other widget is unchanged: no row, and the default never applies to it.

## 1. Decisions

### Tyler's decisions that apply (src §0, answers.md, the mockups)
| Topic | Decision | Here |
| --- | --- | --- |
| Window menu | A `Language` row with a globe in the board's part of every window menu, opening English, Español, Русский, Українська | §3.4 |
| Storage | The choice is stored with the window | `inst.language`, §3.3 |
| Default | Settings › **Default widget language**, English by default; new windows inherit it | §3.6 |
| Spanish | US Spanish, Mexican words | the 1a words, unchanged |
| Q1 title bar | Stays English, the widget's name and every `setTitle` status | no title bar change (src §3.8) |
| Q2 | The board's own words go into tables last (Phase 5) | not here |
| Q3 | Words files are the source, a Sheet mirrors them | not touched here (§2) |
| Q4 submenu | A flyout beside the menu. Tap opens it. It flips sides near an edge. | §3.4 |
| Mockups | Approved as they are. **Keep the small English names under the Settings cards** (Spanish, Russian, Ukrainian; English has none). | §3.6, §4 |
| Rules | "You should write this into our rules, and also in AI-PROMPT.md." Tyler authorized the CLAUDE.md and AI-PROMPT.md text. | §6 |
| Services | No translation service. The board's user text gets `translate="no"`. | §3.10 |
| Tests | No big growth in test time | §5.8, about 55 suite seconds, CI +4 s |
| Font | Inter for all four is pending Tyler's yes | nothing here; the 1a font hook stays as it is |

### Made here (flag any you disagree with)
1. **The frame name and `context.language` always agree.** `Win.createFrame` decides the window's language once,
   `w.frameLang`, and puts it in the frame's name. `hello` sends exactly `w.frameLang` as `context.language`, never a
   value worked out again from the inst. Any change to the window's language reloads the frame (src §2.6). So the
   words a widget built with `t()` as its page loaded never mix with words `data-t` put in later. (Left by 1a's fix
   agent. 1a's SDK switches its language when `context.language` differs, and then the Timer's chips stay in the old
   one.)
2. **The Timer's `#go` gets no name in its markup.** Today it is `aria-label="Start" data-t-aria-label="b21.start"`,
   so a running Timer that reloads, which every language switch does, is named Start until its first render. The
   button gets its name and icon together at that first render, once the Timer knows whether it runs. (Left by 1a.)
3. **Choosing the window's current language does nothing.** The flyout closes, and the window doesn't reload.
4. **An English window's row shows `English`** muted on its right, like the mockups' `Español` and `Українська`.
5. **The flyout lists only the languages the widget declares**, always in the order English, Español, Русский,
   Українська. For the Timer and the Traffic Light that is all four.
6. **The default applies to new windows only.** A window reopened from the Widget Picker or from Settings › This
   page › Windows keeps its own language (src §3.5). The Teacher Guide says so.
7. **No SDK change.** 1a's SDK already reads the frame name, confirms with `context.language`, and handles `qps`.
   `SDK_VERSION` stays `'1.6.0'`. If the build finds an SDK change it truly needs, it goes in, with its reason in
   `decisions`.
8. **tools/words.js still doesn't check registry `files`.** 1a's decision 7 holds (the 'Offline' suite fails on a
   missing file). Src §5.1 check 1 asks for it; the 1a code wins. 1b adds the `languages` checks only (§3.13).
9. **tests/merge.js tests the older release with the real thing.** Src §5.4 swaps `WIN_PARTS` in today's region to
   stand in for 2026.11.26-11. Instead, the region as 307b4a4 has it goes into `tests/fixtures/merge-2026.11.27-1.js`,
   as `merge-2026.11.18-12.js` does for that release, and `Merge4` and `Merge6` are made from that fixture. Then no
   rule in the new region has to stay switchable for the stand-ins' sake (§5.4).
10. **The window part's end-to-end proof** is tests/merge.js (the whole region: read, merge, write, device file out
    and in) plus a second tab in the Languages suite (`reconcileWin`). The default widget language joins the existing
    Board Sync style suite, which already runs two devices (§5.3). No new two-device suite.
11. **tools/words.js also checks `widgets/_template/index.html`'s inline table**, so the starter every author copies
    always passes. Its manifest's `languages` stands in for a registry entry.
12. **The lab sample becomes the template's Counter**: the count, an `Add one` button, and a `Back to 0` menu row.
    Same id, name, and window as today's sample (tests/suites/sdk.js:760 reads `counter` at 320 px wide).
13. **DATA-FORMAT gets the "save keys, never words" rule with today's two exceptions** (First/Then, Weather). The
    full First/Then section src §4 asks for waits for Phase 3, which changes how First/Then draws.
14. **A language switch alone saves a Board history version with no change listed** (Board history's chips don't know
    languages). Going back restores it. Left for later (§8).
15. **Settings' Default widget language is hidden in the dev window and lab** (LAB), where the dev window's Language
    select does the job (src §3.6).
16. **The pseudo language `qps` is never offered on the board.** Only the dev window's select and, in Developer mode,
    the test hook `__board21.pseudo(ikey, on)` give it. It is never saved.
17. **A window's language never brings back a deleted window or page**, as moving a page never does (`PAGE_BACK`,
    board.js:9147). A device on 2026.11.27-1 can't cover a `language` version it never reads, so its tombstones would
    otherwise bring the page back on every updated device (§3.8, Rule 2). A language chosen on a page someone else
    deleted is lost with it.
18. **The Settings cards are `.lang-opt`, not `.letter-opt`.** They share the Text style cards' CSS by selector
    (§3.5), so they look exactly as the mockups drew them, and the Text style and Board Sync tests that count
    `.letter-opt` cards and ticks stay as they are.

### Where the source spec and the 1a code disagree, or the source missed something
- tests/lib.js frame lookups are at :709 (`sendFiles`) and :999 (`WXT.F`), not :699 and :989.
- Src §3.6 lists the places that handle `letters` but misses four, which `widgetLanguage` needs too: the three
  `delete exp.theme; delete exp.accent; delete exp.letters` in Board history (board.js:8504, :8580, :8697), and
  Settings' in-place look update, `noLook` and `putLook` (:4942-4951, :4980-4994).
- Src §5.5 misses existing tests the new first Classroom row and the dev window's new ⋯ item break (§5.6 lists them):
  tests/suites/lock-and-kiosk.js:594-596, tests/suites/board-history.js:82-85, tests/suites/settings.js:428, :469,
  :473, and tests/suites/board.js:1127-1128. Also tests/words.js's fixture registry and its real-tables list.
- Src §5.3 uses the SDK Playground as "a widget that declares none". It is Developer-mode only. The Languages suite
  uses Notes instead.
- Src §5.1 check 2 puts `NOT_YET` in tests/words.js. It stays there, as a test, not a tools/words.js rule, so
  `node tools/words.js` never fails on a widget that simply hasn't converted yet (§3.13, §5.2).
- Src §3.11's Rule 2 guards only `keepH` (a page deleted elsewhere and held here). It misses tombstones the older
  release writes: their covers have no `language` key, and `shown()` (:9846, :9851) lets any uncovered window part
  bring a deleted window or page back. Decision 17 and §3.8 close it.

## 2. Not in this release
- No other widget converts. Notes, Dice, and the rest get no row (Phase 2 onward).
- No change to any words file's rows: widgets/timer/words.js, widgets/traffic-light/words.js, and the Common words
  region stay byte for byte. The only new words are the template's and the lab sample's (§3.11).
- The board's own words stay English and out of tables (Phase 5).
- No Inter font, no font change.
- The Google Sheet is not created or written by the builder, reviewers, or fixer.
- The Calculator manual: no change, no rebuild, no publish. (Its check.js finds `b21-board:calculator:1`, an English
  window's name, which doesn't change.)
- tests/timings.json is not edited by hand. The session saves it after the first CI run.
- The Teacher Guide's menu.jpg stays: it shows the Notes menu, which has no Language row yet (Phase 2 retakes it).

## 3. What to build, file by file

### 3.1 widgets/registry.js (src §3.9)
- Timer (registry.js:46-57) and Traffic Light (:174-186) gain `languages: ['en', 'es', 'ru', 'uk'],` after `files`.
- The header comment (:14-41) documents the field, after `files`:
  `languages    The languages the widget's words table has, English first: ['en', 'es', 'ru', 'uk']. Gives its windows`
  `             the Language row. Leave it out until the table has every language.`
- No other entry changes. District apps and `sdk-playground` never get it.

### 3.2 board.js: the catalog (src §3.9)
- Language constants, outside the merge region, near `ICONS` (:250):
  `LANG_NAMES = { en: 'English', es: 'Español', ru: 'Русский', uk: 'Українська' }`,
  `LANG_IN_ENGLISH = { es: 'Spanish', ru: 'Russian', uk: 'Ukrainian' }`,
  `LANG_LOCALES = { en: 'en-US', es: 'es-US', ru: 'ru-RU', uk: 'uk-UA', qps: 'ru-RU' }`.
  `LANGS` and `normLang` live in the merge region (§3.8) and are used from `Merge`.
- `normalizeWidget` (:356-389): `languages: normLangs(a.languages)`. `normLangs` keeps known codes, drops repeats,
  puts them in the order en, es, ru, uk, and always includes `en`. Missing or junk gives `['en']`.
- Uploads:
  - `DevFiles.add` (:531): `rec.languages = Array.isArray(m.languages) ? m.languages.slice(0, 8).map(String) : null`.
  - `rebuildCatalog` (:415): pass `languages: f.languages` to `normalizeWidget`, which filters it.
- `winLang(w)` (new): `w.widget.languages.includes(w.inst.language) ? w.inst.language : 'en'`.

### 3.3 board.js: the window's language (src §3.4, §3.5, §2.6)
`inst.language` is `'es'`, `'ru'`, or `'uk'`. Absent means English. `'en'` is never stored: choosing English deletes
the field, as `copyOf` is only present when set.

| Place | Change |
| --- | --- |
| `normalizeInst` :1235-1251 | `const lang = Merge.normLang(v.language); if (lang) out.language = lang;` |
| `openWidget` new branch :2595-2601 | after the record is made: `const d = S.settings.widgetLanguage; if (d && d !== 'en' && widget.languages.includes(d)) inst.language = d;` |
| `openWidget` closed branch :2584-2593 | nothing: `Object.assign({}, closed, …)` keeps it |
| `Win.createFrame` :2024-2047 | before naming the frame: `this.pseudo = this.pseudo \|\| labPseudo; this.frameLang = this.pseudo ? 'qps' : winLang(this)`. At :2036: `f.name = 'b21-board:' + this.ikey + (this.frameLang === 'en' ? '' : ';' + this.frameLang)`. An English window keeps today's exact name. Sealed uploads get the same name. |
| `handle('hello')` context :2205-2213 | add `language: this.frameLang`, `uiLanguage: 'en'`, `uiLocale: 'en-US'`. `locale`: `LANG_LOCALES[this.frameLang]` when `this.widget.languages.length > 1`, else `navigator.language \|\| 'en-US'` as today (:2210). Never compute the language here again (decision 1). |
| `Lang.apply(w)` (new) | the window's language changed: `const want = () => w.pseudo ? 'qps' : winLang(w); if (w.frameLang === want()) return; if (w.connected) { w.post('beforeclose'); await sleep(80); } if (S.wins.get(w.ikey) !== w \|\| w.frameLang === want()) return; w.reload();` (as `closeWin`, :2623). The second test skips a window closed meanwhile, or one already reloaded with the right name (Put back's reload, say). |
| `reconcileWin` :1486-1499 | for an existing window, after `w.layout()`: `if (w.frameLang !== (w.pseudo ? 'qps' : winLang(w))) Lang.apply(w)`. Another tab, a merge, an import, or Put back changed it. |
| `resetWin` :2654 | nothing: it keeps the inst's fields and reloads |
| `putBackNow` :8644 | the saved inst gains `language: Merge.normLang(src.language)`, left out when null. (`src` is raw `exp.instances`, and `saveInst` doesn't normalize.) |
| `Menu.act('lang-set', code)` | §3.4 |
| test hook `window.__board21` :11808 | add `pseudo(ikey, on)`: only in Developer mode or LAB, else it does nothing. Sets `w.pseudo = !!on` (never saved; a reload keeps it, since it's on the Win) and calls `Lang.apply(w)`. Add `winLang: ikey => …` for tests. |
| `LabBridge.run` :11414-11443 | new command `language` with `{ value }` (`en`, `es`, `ru`, `uk`, or `qps`): for `qps`, `labPseudo = true` (a LAB-only flag, `let labPseudo = false` declared next to `LAB` at :45 so `createFrame` can read it at boot; never saved, so windows opened afterwards are pseudo too) and every window gets `w.pseudo = true`; else `labPseudo = false`, every window's `w.pseudo = false`, `S.settings.widgetLanguage` is set to the value (so Open another window follows), and every window whose widget declares it gets that `inst.language` (deleted for `en`). Each changed window goes through `Lang.apply`. New command `every-language`: §3.12. |
| `LabBridge.start` :11350-11359 | the lab page's JSON carries the starting language (`{ widget, src, language }`, §3.12). Before its first `openWidget` or `focusWin`, `start` applies it as the `language` command does, so the first window opens in it and the first `state` message reports it. |
| `LabBridge.sendState` :11399-11407 | add `language`: `'qps'` if `labPseudo`, else `S.settings.widgetLanguage \|\| 'en'`; and each instance's `language` (`winLang`, or `'qps'`) |
| `LabBridge.view` :11373-11382 | `menu` is the box around both `#menu.open` and `#menu-sub.open` (their union), so the dev window's Window view keeps an open flyout in sight. place() and maybeFollow() (sdk/board21-dev.js:310-338) need no change. |

Every path that makes a window (src §3.5), and what this release does for it:
| Path | Language |
| --- | --- |
| Widget Picker tile → `openWidget` | the default, if the widget declares it |
| Developer upload → `DevFiles.add` → `openWidget` | the default, if its manifest declares it |
| Dev window boot, lab `open` (:11358, :11439) | the lab's default (set by the dev window's select) |
| Picture or video pasted or dropped on the board | the default, if declared (Picture and Video Player don't declare in 1b) |
| Reopen a closed window (Widget Picker, Settings › This page › Windows) | its own |
| Duplicate this page (:3783-3797) | each window's, through export, parse, and import |
| Import › Replace, Open as a new page, all pages, Add | the file's (absent: English) |
| Board history: Go back, Undo of Reset, Delete, Close all, Import | the version's |
| Board history: Put back | the version's |
| Board Sync: a window made or changed on another device | the peer's part (§3.8) |
| Board Sync: a copy kept from a clash | the original window's |
| Another tab (`applyRecord` :1190 → `normalizeInst` → `reconcileWin`) | the record's |
Existing windows get nothing written. No migration.

### 3.4 board.js: the Language row and its flyout (src §3.1-3.3, Q4, the mockups)
**The globe** in `ICONS` (:250-281), after `reload`, exactly as the mockups drew it:
`globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18z"/>',   // a globe: Language`

**The row**, in `Menu.render` (:3390-3449), right after the Zoom line (:3436), before `if (w.widget.external)`:
`if (!locked && w.widget.languages.length > 1) html += langRow(w);`. Markup, as p1b-mock/work/build.js has it:
```html
<button class="menu-item" role="menuitem" aria-haspopup="menu" aria-expanded="false" aria-controls="menu-sub" data-act="lang"><span class="icon-slot">{globe}</span><span class="label">Language</span><span class="value" lang="es">Español</span>{chevRight with class "more"}</button>
```
`aria-expanded` is `"true"` while the flyout is open. The value is the window's language (`winLang`, or `English`
for a pseudo window), its endonym, with its `lang`.

Order for an unlocked built-in: the widget's rows · line · Zoom to fill · **Language** · Go back… (when Board history
has the window) · Reset… · Delete this copy (a clash copy) · Close. A district app and a widget that declares no
languages show no row, so tests/suites/widgets.js:457 (21Sketch's exact menu) stays green.

**The flyout**: `<div id="menu-sub" class="menu" role="menu" aria-label="Language"></div>` in index.html, right after
`#menu` (:864), a sibling, never a child (`.menu` clips and its `backdrop-filter` traps fixed children). Its items:
```html
<button class="menu-item" role="menuitemradio" aria-checked="true" lang="es" data-act="lang-set" data-id="es"><span class="label">Español</span>{svg('check', 'check')}</button>
```
One per declared language, in the order en, es, ru, uk, each in its own language, the current one checked with the
check icon as `const check` (:3429) draws it. No icon slot, as in the mockups.

State and drawing:
- `Menu.sub = 'lang' | null`. `open()` sets it to null next to `confirming` (:3374). `close()` (:3383-3388) sets it to
  null and removes `open` from `#menu-sub`.
- `render()` draws `#menu-sub` when `Menu.sub === 'lang'` and the row is in the menu. When locked, when Reset asks
  first (`confirming`), or when the row is gone, it sets `Menu.sub = null` and hides `#menu-sub`. A widget sending its
  items again while the flyout is open (`handle('menu')`, :2254) leaves it open, and a focused choice keeps the
  keyboard (matched by `data-id`, as `had` does for `#menu`).
- `position()` (:3465-3523) places the flyout after the menu, with the menu's `compact` and `tight` classes copied to
  it. In screen px, with `ui = Zoom.ui`, `m` the menu's box, `r` the row's box, `f` the flyout's size:
  x = `m.right + 6` if `m.right + 6 + f.w <= vw - 8`, else `m.left - 6 - f.w`; then clamped to `[8, vw - f.w - 8]`.
  y = `clamp(r.top - 6 * ui, 8, vh - f.h - 8)`. Anchored to the whole menu box, not the row, so a menu in two columns
  (`.cols`, index.html:452) works. With no room on either side, the clamp lets it overlap the menu's far side. Its
  height is about 4 × 46 + 12 = 196 px at ui 1, so it never needs columns. A layout change (:2707) places both again.
  The mockups: menu at x 245 w 202 → flyout x 453; near the right edge, menu at x 1050 → flyout x 868 (ui 0.8).

Acts (`Menu.act`, :3525-3546):
- The lock guard at :3528 gains `lang|lang-set`.
- `lang`: toggles `Menu.sub`, renders, places.
- `lang-set` with a code: close the menu (and the flyout). If the code is `winLang(w)`, stop (decision 3). Else
  `saveInst(w.ikey, …)` with `language` set, or deleted for `en`, then `Lang.apply(w)`.
`Menu.act(act, id)` gets no event, so the keyboard focus moves in the click handlers, which know
`keys = e.detail === 0` (:3349).

Handlers. `#menu`'s listeners are on `#menu` only (:3346-3366), so `#menu-sub` gets its own:
- `#menu-sub` click → `Menu.act('lang-set', id)`; then, when `keys` and the window is still there, focus
  `w.labelEl`, as other closing acts do (:3356).
- `#menu-sub` keydown: ArrowDown, ArrowUp, Home, and End move through its choices as :3359-3366 does. ArrowLeft
  closes the flyout and focuses the row.
- `#menu` click handler: when the act is `lang` and `keys`, focus the checked `#menu-sub` choice once it is drawn, and
  skip the refocus at :3355. Also skip :3355 when focus is in `#menu-sub`. Otherwise Enter on the row opens the flyout
  and :3355 pulls focus straight back to the menu's first item.
- `#menu` keydown: ArrowRight on the row opens the flyout and focuses the checked choice. Enter and Space on the row
  do the same through the click.
- Touch: a tap on the row toggles the flyout. No hover open.

Closing:
- The outside-tap test (:11586) also lets taps in `#menu-sub` through:
  `if (Menu.win && !t.closest('#menu') && !t.closest('#menu-sub') && !t.closest('.win-label')) Menu.close();`.
  Otherwise the first tap on a choice closes everything before its click lands.
- Escape (:11609): with the flyout open, it closes only the flyout and focuses the row. The next Escape closes the
  menu as today.
- Blur into a widget's frame (:11596-11602) and `closePopups()` close both: fine.
- The shield `body:has(#menu.open)` (index.html:215) already covers district apps while the flyout is open.
- Locking closes the menu and the flyout (`closePopups()` in `applyLock`, :4286). A menu opened while locked has no
  row. Unlocking with a menu open re-renders it (:4298): the row comes back, with the flyout closed.

### 3.5 index.html
- `#menu-sub` after `#menu` (:864), §3.4.
- `translate="no"` on `#page-flash` (§3.10).
- The mockups' CSS (p1b-mock/work/lang.css), after the `.menu-item` rules (:402-412):
  ```css
  .menu-item .value { flex: 0 1 auto; min-width: 0; color: var(--muted); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .menu-item svg.more { width: 18px; height: 18px; margin-left: -6px; color: var(--muted); }
  .menu-item[aria-expanded="true"] { background: var(--active-bg); }
  .menu-item[aria-expanded="true"] svg.more { color: var(--primary); }
  ```
  `#menu-sub` is a plain `.menu`: no other new rules.
- The Settings cards are `.lang-opt` in a `.lang-opts` group (decision 18). They take the Text style cards' look by
  selector: each rule at index.html:810-819 that names `.letter-opts` or `.letter-opt` also names `.lang-opts` or
  `.lang-opt` (`.letter-opts, .lang-opts { … }`, `.letter-opt, .lang-opt { … }`, `.letter-opt b, .lang-opt b { … }`,
  and so on, `.sample` excepted). No rule changes value, so Text style looks as before and the cards look as the
  mockups drew them. The comment above them names both.
- Then `node tools/build-sdk.js`, which copies index.html's `<style>` and `<body>` into sdk/dev/board-shell.js
  (tests/suites/sdk.js:776-778 checks it).

### 3.6 board.js: Settings › Classroom › Default widget language (src §3.6, the mockups)
- `DEFAULT_SETTINGS` (:94-122) gains, after `letters`:
  `widgetLanguage: 'en'   // Default widget language: 'en' | 'es' | 'ru' | 'uk', for windows opened from now on`.
  The comment line above `letters` ("The whole board's, like the theme and accent…") covers it too.
- `languageSettings()` (new), built like `letterSettings` (:4703-4715), returned first by `classroomSettings`
  (:4042-4045), before `historyOpenRow()`. Not in LAB (decision 15).
  ```js
  settingsGroup('widget-language', 'Default widget language', `<span lang="${cur}">${LANG_NAMES[cur]}</span>`,
    `<div class="hint">New windows start in this language.</div><div class="lang-opts" role="radiogroup" aria-label="Default widget language">${cards}</div>`,
    { sub: allDevices() })
  ```
  `cur` is `S.settings.widgetLanguage` when it is one of the four, else `en`. Each card (the mockups' markup, with
  `lang-opt` alone as its class, decision 18):
  ```html
  <button class="lang-opt[ on]" role="radio" aria-checked="true|false" data-act="widget-language" data-val="es"><span class="txt"><b lang="es">Español</b><small>Spanish</small></span>[<span class="tick" aria-hidden="true">{check}</span>]</button>
  ```
  English has no `<small>`. Español, Русский, and Українська have `Spanish`, `Russian`, `Ukrainian` (Tyler: keep
  them). No `.sample`, no `font-family` style.
- `languageAct(act, val)`, like `letterAct` (:4717-4721), added first in `classroomAct` (:4047-4049):
  `if (act !== 'widget-language') return false; if (Merge.LANGS.includes(val)) updateSettings({ widgetLanguage: val }); return true;`.
  `updateSettings` stamps `widgetLanguageAt` by itself (:1270 loops over STYLE_PARTS).
- In-place update when the default changes on another device or tab (as Text style's, "Settings stays still"):
  - `noLook` (:4942-4951): strip the cards' `class`/`aria-checked` (`<button class="lang-opt[^"]*" role="radio"
    aria-checked="\w+" data-act="widget-language"`), each card's tick (it follows the card's `.txt` span, as these
    cards have no `.sample`), and the inner HTML of the group's `.v`, as it does for `data-act="letters"`.
  - `putLook` (:4980-4994): the selector list gains `[data-act="widget-language"]`. For the group's `.v`, replace its
    inner HTML when it differs (it holds a `<span lang>`), as the `letters` `.v` line does with text.
- Open windows keep their languages. Only windows opened afterwards take the default.

### 3.7 board.js: backups, templates, history, Duplicate, import, kiosk, lock (src §3.7)
| Area | Code | Change |
| --- | --- | --- |
| Export | `buildExport` instances :5590-5597 | add `language` when set, for full exports and templates alike (a display choice, like `config`), beside `copyOf` (:5595) |
| Export | top level :5610 | `widgetLanguage: S.settings.widgetLanguage \|\| 'en',   // the default widget language` after `letters` |
| Parse | `parseBoardFile` instances :5715-5728 | `language: Merge.normLang(i.language)` |
| Parse | top level :5734 | `widgetLanguage: Merge.LANGS.includes(j.widgetLanguage) ? j.widgetLanguage : null` (a file from before has none) |
| Import | `applyImport` inst record :5934 | carry `language` in every mode, Add included, when set |
| Import › Replace | :5949-5951 | nothing: its STYLE_PARTS loop takes `widgetLanguage` once it is a style part |
| Import dialog | `look0` and `looks` :5787-5790 | `look0.widgetLanguage`; `looks` adds `parsed.widgetLanguage && parsed.widgetLanguage !== look0.widgetLanguage && 'default widget language'`. Replace's sub then ends "So is the default widget language." or "So are the theme and default widget language." Its Undo puts back the default it replaced, as for the text style. |
| New pages from a file | `Pages.addFrom` :3778 | `{ theme: null, accent: null, letters: null, widgetLanguage: null }` |
| Board history | :8504, :8580, :8697 | each `delete exp.theme; delete exp.accent; delete exp.letters;` also deletes `exp.widgetLanguage`: going back never changes it |
| Put back | `putBackNow` :8644 | §3.3 |
| Duplicate this page | :3783-3797 | free, through export, parse, and import |
| History fingerprint | `boardSig` :305 | unchanged: an English window has no field, so no spurious version |
| Format | `FORMAT_VERSION` :39-40 | no bump: older readers ignore an optional field |
| Kiosk | `KIOSK` | nothing new: the row and the Settings group show as anywhere |
| Lock | :3528, :4298 | §3.4 |
| Merge message | `MergeUI.style` :10671-10676 | `const lang = Merge.LANGS.includes(x.widgetLanguage) ? LANG_NAMES[x.widgetLanguage] : null;` and the list gains `lang && \`the default widget language to ${lang}\`` last. "The laptop changed the default widget language to Español." |

### 3.8 board.js: the Board Sync merge region (src §3.11, Rules 1 and 2)
Inside `// #region Board Sync merge` (:9144-10614):
- `LANGS = ['en', 'es', 'ru', 'uk']` and `normLang = v => (v === 'es' || v === 'ru' || v === 'uk' ? v : null)`, next
  to `normLabel` (:9229). Both exported in the return list (:10611).
- **The style part.** `STYLE_PARTS` (:9155) becomes `['theme', 'accent', 'letters', 'accentColor', 'widgetLanguage']`;
  `STYLE_DEF.widgetLanguage = 'en'`; `styleOk` gets a `widgetLanguage` branch, `LANGS.includes(v)` (today its last
  branch catches every other key as a letter key: give `letters` its own branch). The comment above (:9149-9154) adds
  the default widget language. A device that updates has no `widgetLanguageAt`, so its value counts as never chosen
  (:9401-9404): the same path the text style took. Device files read and write it through STYLE_PARTS (:10379-10390,
  :10288-10302, :10485-10491).
- **The window part.** `WIN_PARTS` (:9148) becomes `['rect', 'open', 'data', 'conf', 'label', 'language']`. Last
  writer wins, like `label`.
- **The parts that bring a deleted window back.** Next to it, with a comment like `PAGE_BACK`'s:
  `const WIN_BACK = WIN_PARTS.filter(k => k !== 'language');   // an unseen edit to one brings a deleted window or page back (its language doesn't)`.

| Place | Change |
| --- | --- |
| read local, after :9438 | `const lang = normLang(iv.language); W.parts.language = lp(W.keys.inst, lang, lang ? hOf(ir, 'language', () => hj(lang)) : NULL_H, ir);` |
| `part()` :9508-9541 | **Rule 1**, before the `!E \|\| !E.v` branch (:9515): when `P.part === 'language'`, `P.val` is null, and there is no entry or the entry has no version, `set({ h: NULL_H, rev: P.rev })` with no version and return. A version is stamped only for a real language, or for English chosen after one (the entry then has a version). |
| `keepH`, `winH` :9344-9345 | **Rule 2**: both map `WIN_BACK`, not `WIN_PARTS`. Every window hashes exactly as on 2026.11.27-1, whatever its language, and a language chosen on a page held here never brings it back. |
| `shown()` :9846, :9851 | **Rule 2**: both `WIN_PARTS.some(k => out(…))` checks become `WIN_BACK.some(…)`. A tombstone from 2026.11.27-1 has no `language` key in its cover (:9578, :9636), and `covered(v, undefined)` is always false, so without this every updated device brings back a window or page that release deleted after another device set its language. |
| `includes()` :10548-10566 | **Rule 2**: under a tombstone, the loops over `pw.parts` skip `k === 'language'`: in the page tombstone's branch (`M.gone`, :10551-10555) and in the window tombstone's (`T = M.wgone[wid]` on a live page, :10563-10565). A peer's file with such a version can still be collected. |
| `restore` :9545-9557 | `k === 'inst' && P.part === 'language'`: set `language`, or delete it for null |
| merged window write :10185-10191 | `ch('language')` joins the test at :10186; the inst takes `language: t.language` (deleted when null); `revs.language = instRev` |
| clash copy :10232-10253 | the copy takes the original window's `t.language` in its inst; its ledger gets a `language` entry like its `label`'s only when the language is set (none for English: Rule 1) |
| device file out :10344, canon :10370-10371 | `if (W.parts.language.val) i.language = W.parts.language.val;` the versions loop is generic. **Rule 2** in the canon: `WIN_PARTS.filter(k => k !== 'language' \|\| i.v.language)` before mapping, so an English window adds nothing |
| peer file in :10449 | `vals.language = normLang(i.language)` |

Why both rules (src §3.11): without Rule 1, a device that updates late stamps English with a higher counter and wipes
a language chosen elsewhere. Without Rule 2, a sixth part changes every page's `keepH` at the update, so a page
deleted on another device but held here would come back; and a page or window deleted on a device still on
2026.11.27-1 would come back on every updated device, then on the deleting one once it updates, with the false toast
that it was changed elsewhere (MergeUI.back). Rule 2 in one line: a window's language never brings back a deleted
window or page (decision 17). With both rules, English windows cost no device-file rewrite.
Unversioned entries are safe elsewhere: `viewsOf` and the covers skip them (:9706-9710, :9578, :9636), the merge
write keeps them when no device has a version (:10200), and `encode` writes a part's version only when there is one.
Older peers ignore the unknown part: their decode loops over their own `WIN_PARTS` (:10452). No `sync.v` bump.

One-time cost: the new style part changes `partsH` (:10390), so each linked device writes its file once after it
updates. No data change. The commit message says so.

### 3.9 board.js: the title bar
No change (src §3.8, Q1). `renderTitle`, the window's aria-label, and the frame's title stay English.

### 3.10 board.js: board text kept from browser translation (src §3.12)
No `translate` attribute exists in index.html or board.js today. Mark with `translate="no"`:
- the title bar's `.sub` and `.copy-label` (the `build()` template, :2007): a widget's status can be a student's name,
  and the copy label names a device;
- each page name in `#pages-menu` (Pages menu, :3911 onward), and the page name in Settings wherever it shows;
- `#page-flash`, the page's name shown mid-board for a moment (`Pages.flash()`, :3715-3719): `translate="no"` in its
  index.html markup;
- the Board history columns, `#history` and `#history-detail`: their rows quote page names, notes, and names;
- device names wherever Settings › Board Sync lists them;
- toasts that carry a page, device, or folder name: `toast(text, opts)` (:10841) gains `opts.noTranslate`, which sets
  `translate="no"` on the toast. Pass it from `MergeUI.say` and `MergeUI.merge`, the "is ready" toasts of Pages
  (:3762, :3792), the "is back" toasts (:8517, :9098, :9105), the folder toasts (:6291, :6312, :6349), and the export
  toast that names pages (:5694).
The rest of the board stays translatable, so a teacher can still translate the English interface. Blocking the whole
page waits until the board has its own languages.

### 3.11 widgets/timer, widgets/_template, sdk/lab.html
**widgets/timer/index.html** :57 (decision 2): `<button id="go" class="primary" aria-label="Start" data-t-aria-label="b21.start"></button>`
becomes `<button id="go" class="primary"></button>`. `render()` (:110-112) already names it and draws its icon
whenever either is missing. widgets/timer/words.js doesn't change: `b21.start` is still used through `t()`.

**widgets/_template/index.html** (src §1.3, §6.4):
- The manifest (:19-21) gains `"languages": ["en", "es", "ru", "uk"]` after `"version": "1.0.0"`.
- Right after the manifest:
  ```html
  <script>
  Board21.words({
    window: {
      add: { note: 'The main button. Adds one to the count.',
        en: 'Add one',
        es: 'Sumar uno',
        ru: 'Прибавить один',
        uk: 'Додати один' }
    },
    board: {
      zero: { note: 'Menu row. Sets the count back to 0.', en: 'Back to 0' }
    }
  });
  </script>
  ```
- `<button id="add">Add one</button>` (:40) becomes `<button id="add" data-t="add">Add one</button>`.
- A menu: `Board21.menu.set([{ id: 'zero', label: Board21.ui('zero') }])` in `ready()`, and
  `Board21.on('menu', id => { if (id === 'zero') { state.count = 0; Board21.save(state); render(); } })`.
- The starter's notes (the comment at :2-13, above the table) gain, as step 4 of the numbered list:
  `4. Keep every word in the words table below, in English, Spanish, Russian, and Ukrainian. Run node tools/words.js`
  `to check it. See docs/WIDGET-SDK.md, Languages.` Every comment keeps its Oxford commas
  (tests/suites/board.js:1784-1785 reads them).

**sdk/lab.html** sample (:73-81, decision 12): the template's Counter, as one string: the manifest
`{"id": "counter", "name": "Counter", "version": "1.0.0", "languages": ["en", "es", "ru", "uk"], "window": {"width": 320, "height": 240, "minWidth": 200, "minHeight": 150, "aspectRatio": "4:3"}}`,
the same inline table as the template, the template's count `<div id="count">0</div>`,
`<button id="add" data-t="add">Add one</button>`, the template's two CSS rules for `#count` and `button`, and the
menu row `Back to 0` through `Board21.ui('zero')`. (tests/suites/sdk.js:760 reads only the id `counter` and the
320 px width.)

### 3.12 sdk/board21-dev.js (src §6.4)
- `widgetInfo().fallback` (:128-142): `languages: m.languages || (r && r.languages) || undefined`, and
  `inRepo: !!path` (the page's address is under `widgets/<id>/`, the `path` regex it already runs).
- A Language select right after Theme (:255):
  `<select data-k="lang" aria-label="Language" title="Language"><option value="en">English</option><option value="es">Español</option><option value="ru">Русский</option><option value="uk">Українська</option><option value="qps">Pseudo</option></select>`.
  Its change sends `language` (§3.3). The `state` message (:350-354) sets it from `m.language`. It starts in the
  language of `#b21-lang=…` in the page's address when there is one (1a's spec said the dev window would get this in
  1b), else English. `labPage` (:284-290) passes that starting language in the lab page's JSON,
  `{ widget, src, language }`, so the test board's first window opens in it and the first `state` message agrees
  (§3.3, `LabBridge.start`). The toolbar's existing fit checks must stay green: tests/suites/sdk.js "the toolbar fits
  the pane" at 1366 and 600 px, and the lab's at 800 px. If it doesn't fit there, the select goes right after the row
  break (`.brk`), first on the second row of a narrow pane.
- ⋯ gains `<button data-act="every">Open in every language</button>` after `Open another window` (:270). It sends
  `every-language`: LabBridge makes sure the widget has four windows, sets them to English, Español, Русский, and
  Українська, lays them out two by two on the board, and the dev window switches to the Board view.
- The Window view keeps an open flyout in sight: `LabBridge.view()` sends the box around the menu and the flyout as
  `menu` (§3.3).
- Checks (`lint`, :169-221). Each title has no end period, since Copy fix request builds
  `'Please fix this in my 21Board widget: ' + title + '. ' + fix` (:552).
  - `err`, title `No "languages" for this widget`, detail `Without it, the window has no Language row and stays English.`,
    fix `Add "languages": ["en", "es", "ru", "uk"] to the manifest block and to its registry entry.` Raised only when
    the page has an inline `Board21.words(` table with `window` rows (lint sees only the page's HTML) and
    `info.widget.languages` is empty. `info.widget.languages` is the effective list, from the manifest or, with no
    manifest, the registry entry.
  - `warn`, title `words.js won’t load in an uploaded file`, detail `A widget you upload is one file. It can’t load others.`,
    fix `Put the words table in the page, right after the manifest: <script>Board21.words({ … });</script>`. Raised
    only when the page loads `words.js` and `info.widget.inRepo` is false (the lab, an AI tool's preview). The Timer
    and the Traffic Light, opened from `widgets/<id>/index.html`, get no warning.
  - The SDK's own words warnings and errors (console lines starting `21Board: no words for`, `rows need more
    languages`, `row needs more languages`, `has no Spanish`, `has no Russian`, `has no Ukrainian`, `has no … form`)
    also show in Checks, `err` for a missing key and `warn` for the rest. Title: the SDK's sentence without
    `21Board: `, up to its first `. ` or `, so `, first letter capitalized, no end period: `No words for "go"`,
    `"go" has no Spanish`, `"chip.min" in Russian has no few form`, `2 rows need more languages`. Detail: the rest of
    the sentence, capitalized, without a leading `so ` and without `Add it to the words table.`: `It shows in
    English.`, `go: Spanish and Russian. stop: Ukrainian.`, or none. Fix:
    `Add the missing words to the words table, in English, Spanish, Russian, and Ukrainian.` Copied, it reads
    `Please fix this in my 21Board widget: "go" has no Spanish. Add the missing words to the words table, in English,
    Spanish, Russian, and Ukrainian.`
- Copy for 21Board (:552-556): the registry entry gains `languages` when the widget has them.
- Help (:485-494) gains a paragraph after "Just the widget": `<p><b>Languages:</b> Language in the toolbar shows every
  window in English, Spanish, Russian, or Ukrainian. Pseudo puts every word from your table in brackets. English
  outside them isn’t in your table yet. ⋯ ▸ Open in every language opens a window in each.</p>`.

### 3.13 tools/words.js (src §5.1)
New rules, in `check()` and so in the CLI:
1. A registered SDK widget whose table has `window` rows must have `languages: ['en', 'es', 'ru', 'uk']` in the
   registry: `widgets/registry.js: timer has a words table but no languages. Add languages: ['en', 'es', 'ru', 'uk'].`
2. A registered widget that lists `languages` must have a words table:
   `widgets/registry.js: dice lists languages but has no words table.`
3. `languages`, when listed, is exactly those four, English first:
   `widgets/registry.js: timer’s languages must be ['en', 'es', 'ru', 'uk'].`
4. `widgets/_template/index.html`'s inline table is checked like a widget's (id `_template`), with its manifest's
   `languages` checked by rules 1 and 3 (message names the file: `widgets/_template/index.html: the manifest has no
   languages. Add "languages": ["en", "es", "ru", "uk"].`).
The registry is read as today (in the bare vm, :287-292). `files` is not checked (decision 8).

### 3.14 Stamp
VERSION `'2026.11.27-2'` in sw.js. `node tools/build-sdk.js`, then `node tools/release.js`, then both with
`--check`. No new file joins the offline copy (words.js files joined in 1a); the registry's fingerprint changes.

## 4. Every word a person sees that changes

### 4.1 Teachers (the board, English)
| Where | Old | New |
| --- | --- | --- |
| Window menu, Timer and Traffic Light | (no row) | `Language`, then the window's language muted: `English`, `Español`, `Русский`, or `Українська` |
| Flyout (screen reader name `Language`) | (none) | `English`, `Español`, `Русский`, `Українська`, the current one checked |
| Settings › Classroom, first row | (none) | `Default widget language`, value `English` (or the chosen endonym); with Board Sync linked, the grey line `On all your devices.` (existing words) |
| Its drawer | (none) | hint `New windows start in this language.`; cards `English`; `Español` / `Spanish`; `Русский` / `Russian`; `Українська` / `Ukrainian`; radio group name `Default widget language` |
| Import › Replace this page, its sub | `… So is the theme.`, `… So are the theme and text style.` and so on | the list can also hold `default widget language`: `So is the default widget language.`, `So are the theme and default widget language.`, `So are the theme, text style, and default widget language.` |
| Board Sync message | `The laptop changed the theme to Dark and the text style to “Easier to read”.` | adds `the default widget language to Español` last, with the board's `andList`: `The laptop changed the default widget language to Español.`, `The laptop changed the theme to Dark and the default widget language to Русский.` |

### 4.2 Students (inside a window)
| Where | Old | New |
| --- | --- | --- |
| Timer and Traffic Light | always English | the window's language, from the 1a words (no row changes) |
| Timer `#go`, before its first render | screen reader name `Start` (or its translation) | no name until the first render, which names it `Start` or `Pause` with its icon |
| Title bars | English | English (unchanged, Q1) |

### 4.3 Developers
| Where | Old | New |
| --- | --- | --- |
| Dev window toolbar | (none) | select `Language`: `English`, `Español`, `Русский`, `Українська`, `Pseudo` |
| Dev window ⋯ | `Reload the widget \| Reset size and data \| Open another window \| Switch board shape \| Show the widget on its own \| Copy for 21Board \| How this works` | `Open in every language` after `Open another window` |
| Dev window Checks | (none) | the three checks in §3.12, exactly |
| Dev window help | (none) | the Languages paragraph in §3.12 |
| tools/words.js | (none) | the four messages in §3.13, exactly |
| Template and lab sample | `Add one`; the sample's menu `Add one`, `Back to 0` | `Add one` button (in four languages) and the menu row `Back to 0` |

### 4.4 Docs and the Teacher Guide
§6 and §7. Every line follows CLAUDE.md's Voice.

## 5. Tests

Write them first and show they fail at 307b4a4. Keep the log next to this spec (`fail-first.log`). Follow
docs/RELEASING.md, "Writing tests". Read every word a check compares from the words files with `wordsOf` (tests/lib.js),
never typed into the test, so a reviewer's edit never breaks a check.

### 5.1 tests/suites/languages.js (the Languages area file; src §5.3)
The file's header comment says it now has browser suites too. Shared helper in tests/lib.js:
`frameNamed(p, ikey)`: the frame named `b21-board:<ikey>` or `b21-board:<ikey>;<code>`.

**Suite A**: `Languages: the Language row and its flyout, saved with the window, the default for new windows, two tabs,
export and import, Lock, and the keyboard` (one 1366 × 768 context; about 33 s). In order:
1. Open a Timer. Its menu's board part reads `Zoom to fill | Language | Reset… | Close`. The row has the globe, the
   label `Language`, the value `English` with `lang="en"`, `aria-haspopup="menu"`, and `aria-expanded="false"`.
2. Tap the row: `#menu-sub` opens to the right of the menu (its left ≥ the menu's right), with four
   `menuitemradio` items `English`, `Español`, `Русский`, `Українська`, each with its `lang`; English checked, with the
   check icon; the row's `aria-expanded="true"`.
3. Start the Timer, then choose `Español`: the menu and flyout close; `inst.language === 'es'`; the frame is new and
   named `b21-board:timer:1;es`; inside it `Board21.language`, `Board21.context.language`, and the name agree; `<html
   lang="es-US">`; the chips read `wordsOf('timer','es').t('chip.min', { n })`; `#go` is named the es `b21.pause` and
   the Timer is still running with the same `endsAt`. The title bar still reads `Timer` (English).
4. Choose `Español` again: nothing reloads (the same frame element).
5. A second Timer opens English: no `language` in its inst, frame name `b21-board:timer:2`.
6. A second tab of the board: choose `Українська` on Timer 1 there; in the first tab its frame becomes
   `b21-board:timer:1;uk` within a moment. Close the second tab.
7. Reload the page: Timer 1 is still `uk` (frame name), Timer 2 English. Reset Timer 1 (`Reset…`, then the
   confirm), then tap the toast's Undo, which goes through Put back and builds the inst again (:8644): its frame is
   named `b21-board:timer:1;uk` and `inst.language` is `'uk'`.
8. Settings › Classroom: the first row is `Default widget language` with value `English`. Open it: the hint `New
   windows start in this language.`, four cards, the `<small>` names `Spanish`, `Russian`, `Ukrainian` under the last
   three and none under English. Choose `Русский`: `settings.widgetLanguage === 'ru'` and the row's value reads
   `Русский`.
9. Open a Traffic Light: its inst has `language: 'ru'`, its red lamp is named the ru `red`. Tap red: the title bar
   says `Red` (English). Open Notes (declares none): no `language`, no Language row, a plain frame name.
10. Close Timer 2 (English), then tap Timer in the Widget Picker: it reopens English.
11. `translate="no"` is on the Traffic Light's title bar `.sub` and on the page names in `#pages-menu`.
12. Export a full backup and a blank template (the default is `ru`): the export has `language: 'uk'` on Timer 1,
    `'ru'` on the Traffic Light, none on English windows, and `widgetLanguage: 'ru'`; the template keeps the window
    languages. Set the default to English. Open Import with the full backup: Replace's sub says
    `So is the default widget language.` Choose Add: the added windows open in the file's languages, and the default
    stays English.
13. With Timer 1's flyout open, lock (Widgets still work) from a second tab (▦ would close the menu first): `#menu`
    and `#menu-sub` lose `.open`. Open Timer 1's menu: no Language row. With it open, unlock from the second tab: the
    row is back and the flyout is still closed (a stale `Menu.sub` would draw it again).
14. Keyboard on Timer 1: Enter on its name opens the menu; move to `Language`; Enter opens the flyout with focus on
    the checked choice; ArrowDown moves; ArrowLeft closes the flyout with focus on the row; ArrowRight opens it again;
    Escape closes only the flyout (the menu stays, focus on the row); Escape closes the menu (focus on the name).
    Enter on `English` switches it back, with focus on the window's name, and its inst has no `language`.
15. Near the right edge: Timer 1 moved to the board's right edge; the flyout opens to the left (its right ≤ the
    menu's left), fully on screen.
16. No page errors, and no `__words()` missing or fallback in any window.

**Suite B**: `Languages: every converted widget in the pseudo language, inside the board: no English left, nothing cut
off` (Developer mode on; about 4 s). For the Timer and the Traffic Light: open, `__board21.pseudo(ikey, true)`, the
frame is named `…;qps`, `<html lang="en-XA">`, and `Board21.__audit()` has no `missed` and no `cut` at the registry's
default size and at minWidth × minHeight. `__words()` has no missing or fallback. No console errors.
`__board21.pseudo` does nothing with Developer mode off.

### 5.2 tests/words.js (Node)
- Each new rule of §3.13 bites once, on the fixture in memory, with its message exactly.
- The real tables: `want` adds `_template`.
- `NOT_YET` (src §5.1 check 2), a test: every registered widget that isn't external, isn't `sdk-playground`, and isn't
  in `NOT_YET` lists all four languages and has a table; every widget in `NOT_YET` lists none.
  `NOT_YET = ['stopwatch', 'task-timer', 'calendar', 'clock', 'notes', 'name-picker', 'first-then-board',
  'zones-check-in', 'dice', 'youtube-player', 'image', 'calculator', 'weather']`. It shrinks each phase and is empty
  after Phase 4b.

### 5.3 Board Sync: the default widget language
In the existing suite 'Board Sync: theme and accent color, and the text style (Early readers from the laptop, all
three at once, Settings open, locked, another tab, kiosk, Import)' (tests/suites/board-sync.js:2224; about +4 s): the
laptop chooses `Español` as the default with Settings open on the smartboard at that group. After a round the
smartboard's `settings.widgetLanguage` is `es`, its card is ticked and its row reads `Español` in place (not drawn
again), it says `The laptop changed the default widget language to Español.` with no Undo, the laptop's device file
has `widgetLanguage: 'es'` and its version in `sync.style`, and a Timer opened on the smartboard opens in Spanish.
The suite's title adds `, and the default widget language` after `the text style`. (Its timing key changes; the
session saves timings after CI.)

### 5.4 tests/merge.js (inside the existing 364 s suite; src §5.4)
- `tests/fixtures/merge-2026.11.27-1.js` (new): the region between `// #region Board Sync merge` and `// #endregion`
  of board.js at 307b4a4, byte for byte, under a header like merge-2026.11.18-12.js's ("as release 2026.11.27-1
  shipped it, unchanged since 2026.11.26-11: no `language` window part and no `widgetLanguage`").
  `const Merge27 = region(…)`.
- `PARTS_NOW` (:55) and `older()` (:56) now work on the fixture's text, so `Merge4` and `Merge6` are that release
  without the text style or accentColor, as before. The check at :1766 names the fixture.
- New cases:
  1. The `language` part: A sets `es`, B later sets `ru`: `ru` on both. A clash copy keeps the original's language.
  2. Rule 1: A (this release) sets `es`; B on `Merge27` moves the window later; B updates (`asRel(B, null)`); after
     rounds, `es` on both. And the other order: B (this release) sets `ru`, A updates later; A's first round doesn't
     stamp English over it.
  3. Rule 2, held here: a page deleted on another device and held here (the page shown) across the update stays
     deleted, and so do its windows in `keepW`. Choosing a language for one of its windows here doesn't bring it back.
  4. Fingerprints, through what both regions already give (neither exports `keepH` or `winH`): for the same board,
     with a page deleted elsewhere and held here, the ledger's `keep` and `keepW` that this region writes equal
     `Merge27`'s, with English windows and with a window in Español alike. And `encode()`'s `obj` from both regions is
     equal once `widgetLanguage` and `sync.style.widgetLanguage` are taken out: the device file of an English board
     differs only by the new style part.
  5. `widgetLanguage`: the later choice wins; an updated device's unchosen `en` doesn't beat a choice made elsewhere.
  6. Rule 2, deleted on the older release: B (this release) sets a window to `es`; A on `Merge27` merges it, then
     deletes that window (Delete this copy, or This page › Windows). After rounds it stays deleted on both, with no
     "changed on … before the deletion reached it" (MergeUI.back), and still does after `asRel(A, null)` and more
     rounds. The same again with the whole page deleted on A. A's tombstone has no `language` in its cover; B's file
     is still collected (`includes()`).
- The randomized run: a small share of edits set a window's language (`es`, `ru`, `uk`, or English), and some devices
  run `Merge27` and update mid-run. The oracle's nothing-lost rule covers the language part. It hashes and versions
  every window part each round, so a sixth part costs time: measure. Over +15 s, lower the share of language edits.

### 5.5 The Timer's `#go`, and the dev window
In Suite A item 3 (a running Timer that reloads is named Pause). Also, in the SDK standalone checks
(tests/suites/sdk.js, 'SDK, developer mode, standalone'), nothing changes: they read `#go` after its first render.

In the existing 'Widget dev window' suite (tests/suites/sdk.js:645; about +5 s), one pass on the Timer's page
(`widgets/timer/index.html`):
- Checks has no `words.js` warning and no `"languages"` error (§3.12: a widget in the repo, languages from the
  registry).
- Choose `Español` in the Language select: the window's frame name ends `;es`.
- ⋯ ▸ Open in every language: four Timer frames, named for `en` (no suffix), `es`, `ru`, and `uk`.
- Back in the Window view, open a Timer's menu and tap Language: `#menu-sub` is inside the stage.

### 5.6 Existing tests that change, and why
| Test | Change | Why |
| --- | --- | --- |
| tests/suites/lock-and-kiosk.js:594-596 | Classroom has no Lock row, and `hist-open`, `close-all`, and `awake` in that order, whatever else is there (it no longer says "only") | a new first row in Classroom (approved mockup). Fix round (TEST-2): no longer lists the language group's markup |
| tests/suites/board-history.js:82-85 | "Go back to an earlier version" is in Classroom (no longer "the first row") | same. Fix round (TEST-2): no index, no row before it |
| tests/suites/settings.js:428, :469, :473 | the groups list starts `widget-language hidden,` (closed in each) | a new group |
| tests/suites/board.js:1127-1128 | the ⋯ list adds `Open in every language` after `Open another window` | a new dev window item |
| tests/words.js fixture registry (:121) | the fixture entry gains `languages: ['en', 'es', 'ru', 'uk']`; `fixture()` passes `'widgets/_template/index.html': null` so the fixture runs leave the real template out | the new rules |
| tests/words.js real tables (:133-142) | `want` adds `_template` | the template is checked now |
| tests/merge.js:52-57 | stand-ins from the fixture, `Merge27` | the window part (§5.4) |
| tests/lib.js:709 (`sendFiles`) and :999 (`WXT.F`) | find the frame with `frameNamed`, so a name with `;<code>` matches | a frame name can carry a language now |
| 'Board Sync: theme and accent color, and the text style …' | §5.3: one more step, and its title | the default is a new style part |
| tests/suites/board.js:1463 | a This page export's keys add `widgetLanguage` after `letters` | the export has a new top-level key |
| tests/suites/board-sync.js:391 | the linked "On all your devices." hints go from 3 to 4 | the new Settings row has one |
| tests/suites/sdk.js:913 | the toolbar's shown controls add Language | a new toolbar select |
| tests/suites/sdk.js:948, :1020 | ⋯ has 8 items, not 7 | Open in every language |
| tests/suites/board-sync-merge.js:616, :624 | message text only: "Classroom’s Board history row stays put", not "Classroom’s first row" | the measured row is no longer Classroom's first; the check is unchanged |
| tests/words.js:315 ('--format leaves every real table as it is') | leaves out inline tables | the starter's inline table is now one of check()'s tables, and --format lays out only words.js files |
Lookups by name that stay as they are (English windows): tests/suites/board.js:1681, :1816, sdk.js:1311,
picture.js:470, :560, video-player.js:1199, docs/calculator-manual/check.js:385.

### 5.7 Existing tests that must pass unchanged
tests/suites/widgets.js:457 (21Sketch's exact menu), board-history.js:116 (Notes' menu ends `Zoom to fill | Go back… |
Reset… | Close`), 'Traffic Light sideways, Follow timers, and the Timer's warning', 'Timer sounds', 'Export /
import', 'Pages (multiple boards)' (Duplicate), 'Board history' and its siblings, 'Kiosk mode (?kiosk=yes)', 'Lock: …'
suites, 'Settings keeps a control still…', 'Settings stays still when a section opens', 'Text style (Letters)…'
(settings.js:1452 still finds exactly three `.letter-opt` cards, and board-sync.js:2265 the ticks under
`.letter-opt`: decision 18), the Copy suites (tests/suites/board.js: Oxford commas, glossary words, CLAUDE.md lines :1796-1797 and :2023-2032,
AI-PROMPT :745-746 and :1798-1799, "**Right-click.**" :2036, `use system fonts, and draw` :1107), 'Widget dev window'
and its siblings (the toolbar fit at 1366, 600, and the lab's 800 px), 'Developer mode: upload a widget file', 'SDK,
developer mode, standalone', 'SDK Playground…', 'Offline', 'Updating…', 'District apps…', 'Right-click…', and the Node
suites for merge.js, calc-engine.js, and words.js.

### 5.8 Time
| Suite | Adds |
| --- | --- |
| Languages A, new | about 33 s |
| Languages B, new | about 4 s |
| Board Sync: theme, accent, text style, and the default widget language | about 4 s |
| Board Sync merge (tests/merge.js) | 5 to 15 s, measured |
| Widget dev window: the Timer's Checks, Language select, Open in every language, and flyout (§5.5) | about 5 s |
| tests/words.js | under 1 s |
| In all | about 55 s, at most 65 s; CI wall-clock about +4 s across 15 parts |
New suites count as the average (about 49 s) in the split until timings are saved after the first CI run.

Measured in the fix round, each alone: tests/merge.js at full scale took 294.5 s at 6dbd9cd and 302.1 s on lang-1b
(+7.6 s). The builder's version took about +52 s: the sixth window part costs every round, so lowering the share of
language edits couldn't help. The fix trims the randomized run's first five batches by about an eighth (2000, 500,
1200, 500, and 300 runs became 1750, 440, 1050, 440, and 260), keeping the 600-run batch whose seeds the notes name.
The Languages suites took about 35 s together.

### 5.9 The builder's runs
tests/words.js; `node tests/merge.js` through its suite; then `node tests/run.js` with `"Languages"`, `"Board Sync:
theme"`, `"Settings: "` (sections, and About), `"Settings stays still"`, `"Settings keeps a control"`, `"Text style
(Letters)"`, `"Lock: Lock in the Widget Picker"`, `"Board history"`, `"Export / import"`, `"Pages"`, `"Widget dev
window"`, `"Developer mode"`, `"SDK"`, `"Timer"`, `"Traffic Light"`, `"Copy"`, `"District apps"`, `"Right-click"`,
`"Offline"`, `"Updating"`, `"Kiosk"`. Each filter is one case-insensitive substring of a suite's title
(tests/run.js:83-87). A bare `"Settings"` or `"Text style"` would also run the Clock's and the Name Picker's long
suites (130 s and 208 s), which this change doesn't touch. One test process at a time. CI runs the rest after the
push.

## 6. Rules and docs

### 6.1 CLAUDE.md (Tyler authorized it; src §6.1)
Insert after `## Voice: every label and every line of prose` and its Before/After example, before `## Releasing`.
Leave the `- Labels:` line and the Oxford comma line after it as they are (tests/suites/board.js:1796-1797), and don't
add the phrase "Build it, check it, then publish it" (:2032 counts it).
```markdown
## Languages

Widgets come in English, Spanish, Russian, and Ukrainian. Each window shows the language the teacher picks. A new
widget ships all four. The rest get them one at a time, as docs/ROADMAP.md lists.

- Every word a window shows lives in its widget's words table, all four languages side by side. Never in code.
- Show them through the SDK, with `Board21.t()`, `Board21.ui()`, or `data-t`.
- A new or changed word gets all four languages in the same change. Run `node tools/words.js` before you commit.
- Spanish is US Spanish with Mexican words. Ukrainian is Ukrainian, never Russian in Ukrainian letters.
- docs/GLOSSARY.md has the words CCSD21 uses. Use them first.
- Write for students. Short, plain, and warm, at their reading level.
- Math always follows English rules, with a point for decimals and a comma for thousands.
- Dates follow the window's language. Weeks start on Sunday. Clocks show 12 hours unless the teacher picks 24.
- A widget's menu rows and title bar words stay English for now. They still go in its words table.
- Every font a widget uses needs Latin and Cyrillic letters.
- Save keys in data and config, never the words shown.
- No translation services, on the device or online.
- Draft each translation, then have a second agent check it. Our reviewers check it later in the Sheet.
- Lists in Spanish, Russian, and Ukrainian take no Oxford comma.
```

### 6.2 docs/AI-PROMPT.md (Tyler authorized it; src §6.2)
Hard rules (:89-116):
- First bullet (:91-92), append: `The SDK sets `lang` to the window's language as it runs.`
- The manifest (:100) gains `"languages":["en","es","ru","uk"]` after `"version":"1.0.0"`.
- Rewrite the "Then `<meta name="viewport"…`" bullet (:105-106) as:
  ```markdown
  - Then the words table (see **Four languages**), `<meta name="viewport" content="width=device-width,
    initial-scale=1">`, a `<title>` with the widget's name, one `<style>`, the markup, and one `<script>` at the
    end of `<body>`.
  ```
- After "No storage of your own" (:111-113), two bullets:
  ```markdown
  - **Four languages.** Every word the widget shows goes in one words table, right after the manifest:
    `<script>Board21.words({ window: { … }, board: { … } });</script>`. Each `window` row has `en`, `es`
    (US Spanish, Mexican words), `ru`, and `uk` side by side. `board` rows are for menu rows and the title bar,
    and need only `en`. Show words with `Board21.t('key')` in the window and `Board21.ui('key')` in the menu
    and title bar. Keep `"languages"` in the manifest, or the window gets no Language row. Never use a
    translation service. Never build a sentence from pieces in code: give each sentence its own row, with
    `{name}` for what goes in it.
  - **Numbers in English form** in every language, with a point for decimals. Show dates and times with
    `Board21.format.date(date, options)`, never with the device's language.
  ```
Skeleton (:118-183): the manifest (:126) gains `"languages":["en","es","ru","uk"]`, and after it:
```html
<script>
Board21.words({
  window: {
    done: { note: 'Closes the editor.', en: 'Done', es: 'Listo', ru: 'Готово', uk: 'Готово' }
  },
  board: {
    edit: { note: 'Menu row. Opens the editor.', en: 'Edit…' },
    big: { note: 'Menu row. Bigger text.', en: 'Big text' }
  }
});
</script>
```
`<button class="primary" id="done">Done</button>` becomes `<button class="primary" id="done" data-t="done">Done</button>`,
and `setMenu()`'s labels become `Board21.ui('edit')` and `Board21.ui('big')`.
Useful context (:283-284): replace the `ctx.locale` clause with `ctx.language` (`'en'`, `'es'`, `'ru'`, or `'uk'`: the
window's language); dates with `Board21.format.date(d, { weekday: 'long' })`; numbers always in English form.
Look and feel (:330-331): the last sentence becomes `English lists of three or more take the Oxford comma. Spanish,
Russian, and Ukrainian lists don't.` (keeps "Oxford comma" for :1798-1799).
Before you answer (:333-343): the first item adds "`languages` lists all four" after "its id and name replaced"; a new
row after the Menu row (keep the Menu row exactly, :745-746):
`- [ ] Words: every word in the table, `window` rows in `en`, `es`, `ru`, and `uk`, `board` rows in `en`; shown with `Board21.t`, `Board21.ui`, or `data-t`; every plural form; no words saved in content or config.`
Short prompt (:354-372): the manifest (:362) gains `"languages":["en","es","ru","uk"]`; after the manifest paragraph:
```markdown
Put every word the widget shows in `Board21.words({ window: {…}, board: {…} })` right after the manifest. Write each
window row in English, Spanish (US, Mexican words), Russian, and Ukrainian, and show it with `Board21.t('key')`. Menu
rows and the title bar use `Board21.ui('key')`, English only. Keep `"languages"` in the manifest.
```

### 6.3 docs/WIDGET-SDK.md (src §6.3)
| Where | Change |
| --- | --- |
| Quick start (:22-61) | The Quick start's counter shows only a number, so its manifest stays without `"languages"` (tools/words.js rule 2 rejects languages with no words table). After its closing paragraph, one line: `The template also has a words table, so its window comes in four languages. See [Languages](#languages).` |
| Rules for widgets (:66-86) | `10. **Four languages.** Every word a window shows comes from your words table, in English, Spanish, Russian, and Ukrainian. Menu rows and title bar words are English for now. Numbers always use English rules. Save keys in data and config, never the words shown. Never use a translation service.` |
| Lifecycle context (:92-122) | `language: 'en',  // this window's language: 'en', 'es', 'ru', or 'uk'` (drop "English inside 21Board for now"); `locale` (:115): `// the window's locale for dates, such as 'es-US', when your widget lists languages; else the device's` |
| Lifecycle, after the context block | `**A language change reloads the window.** The board sends `beforeclose`, then starts your page again in the new language. So build your words once, as the page loads, and save anything you need on `beforeclose`.` |
| Languages intro (:387-391) | `A window shows its words in English, Spanish, Russian, or Ukrainian. The teacher picks each window's language from its menu. New windows start in the one chosen in Settings → Classroom → Default widget language. Your widget gets the Language row once it lists its languages.` |
| Words tables (:393-430) | a new paragraph: `A widget that is one file, such as an uploaded or AI-built one, keeps its table in the page, right after the manifest: <script>Board21.words({ … });</script>. An uploaded file can't load words.js.`; and a new `### Listing your languages`: `Add "languages": ["en", "es", "ru", "uk"] to your manifest and your registry entry. Without it, the window has no Language row and stays English.` |
| What the SDK sets (:480-485) | `The board names the window's frame with its language before your page loads, so `Board21.t()` is right from your first line.` |
| Trying a language (:487-494) | the board's Language row; the dev window's Language select, Pseudo, and ⋯ ▸ Open in every language; standalone `#b21-lang` stays |
| Registering a widget (:500-524) | `languages: ['en', 'es', 'ru', 'uk'],  // the languages your words table has; gives windows the Language row` |
| Testing a widget, the dev window table (:589-597) | a **Language** row: `English, Español, Русский, Українська, or Pseudo, for every window. ⋯ ▸ Open in every language opens one window in each.`; Checks names the words checks |
| Submission checklist (:708-723) | `- [ ] Words table complete: en, es, ru, and uk. Manifest and registry list all four. node tools/words.js passes.` |
Keep "**Right-click.**" (:2036 checks it) and every word the glossary checks (tests/suites/board.js:1103-1113).
WIDGET-SDK writes Settings paths with → (as at :353, :371, :616, and :661), so every new one does too. Theming
(:371-376) and What the SDK sets (:483) already say Russian and Ukrainian windows skip the easier-to-read fonts (1a):
add nothing more about fonts.

### 6.4 README.md (src §6.4)
- Using 21Board: a new row after **Window menu**:
  `| **Languages** | The Timer and Traffic Light come in English, Spanish, Russian, and Ukrainian. Tap the window's name ⌄, then **Language**, and pick one. Only that window changes. **Settings → Classroom → Default widget language** sets the language new windows start in. Title bars and menus stay English. A window that switches starts again and keeps what it saved. Nothing goes online to translate. |`
- **Window menu** row: `…for its own options, **Zoom to fill**, **Language** where the widget has it, **Reset…**, and **Close**.`
- **Import** row: "theme, accent color, and text style" becomes "theme, accent color, text style, and default widget
  language" in each of its four places.
- Settings › Classroom, a first bullet: `**Default widget language:** English, Spanish, Russian, or Ukrainian, for
  windows opened from now on. Open windows keep theirs. With Board Sync, on all your devices.`
- Adding a widget (:254-273): the words table and `languages`.
- Board Sync: a window's language syncs, the later change winning; the default widget language syncs like the theme.
  (The one-time rewrite of each device's file goes in DATA-FORMAT and the commit message, not here.) The three
  linking bullets (:355-365) that say "theme, accent color, and text style" say "theme, accent color, text style, and
  default widget language", since the default goes with them.
- Tests (:794-838): the Languages suite now also opens windows on the board, and the pseudo pass.
- Project layout: `tests/fixtures/merge-2026.11.27-1.js` if the layout lists fixtures.

### 6.5 docs/DATA-FORMAT.md (src §4)
DATA-FORMAT writes Settings paths with → (as at :85-103), so the new lines do too.

| Section | Add |
| --- | --- |
| `settings` (:76-140) | `widgetLanguage: "en"` with `widgetLanguageAt`: Settings → Classroom → Default widget language, `"en" \| "es" \| "ru" \| "uk"`, the language new windows start in. Syncs board-wide like `theme`. Exported. Going back never changes it. |
| `inst` (:437-466) | `language: "es"` (optional): `"es" \| "ru" \| "uk"`. Absent means English; `"en"` is never written. Reset keeps it. Templates keep it. Board Sync part `language`, the later change winning; a window never given one has no version. A window's language never brings back a deleted window or page. |
| `data` / `conf` (:493-600) | the rule: save keys in data and config, never the words shown. Two exceptions kept for older releases: First/Then saves `label` and `category` in English and draws from `id`; Weather saves `advice` and `label` in English and draws from the tier. |
| `.21board` instance example (:776-786) | `"language": "es"`, and top level `"widgetLanguage": "en"` after `"letters"` |
| Board Sync device file (:198-400) | the window part `language` (in `i.language` and `i.v.language`); the style part `widgetLanguage` (top level and `sync.style.widgetLanguage`); the two rules in a sentence each (Rule 2's: `A window's language never brings back a deleted window or page.`); the one-time rewrite |

### 6.6 docs/RELEASING.md (src §6.4)
- Small changes, step 3: `Update the docs and guides where they say otherwise. A word a window shows changes in all
  four languages, and node tools/words.js passes. Stamp the next free version, as in step 3.`
- Writing tests, a bullet: `- Set a window's language through the board, never the browser's locale.`

### 6.7 tools/release-workflow.js (src §6.4)
- `VOICE` (:28) ends with: ` Every word a window shows goes in its widget's words table in English, Spanish, Russian, and Ukrainian (CLAUDE.md, "Languages"), and node tools/words.js passes.`
- `TESTS` (:29) adds: ` Set a window's language through the board (its menu's Language, or inst.language), never the browser's locale.`
- The build prompt's "every user-visible string added or changed exactly (old and new)" (:50) becomes "every
  user-visible string added or changed exactly (old and new), in every language it has". The fix prompt's "strings =
  every user-visible string added or changed by the whole branch (old and new), exactly" (:86) becomes "strings = every
  user-visible string added or changed by the whole branch (old and new), in every language it has, exactly".
- The review prompt's "Also check every new or changed string against CLAUDE.md ("Voice")" adds
  ` and ("Languages"): window words in all four languages, docs/GLOSSARY.md's words first`.

### 6.8 docs/TRANSLATING.md and docs/ROADMAP.md
- TRANSLATING "Check your work" step 2 adds: `On the board, tap the window's name ⌄, then Language.`
- ROADMAP "21Board in other languages": "A Language row in each window's menu, and a default for new windows in
  Settings." leaves Next. Done gains: `The Timer and Traffic Light switch from their window menu. Settings sets the
  language new windows start in.`

## 7. The Teacher Guide (docs/teacher-guide; its README has the steps)
Words in page-src.html:
- "Make it yours" (:422-432): a new wide card after "Letters made for young readers":
  ```html
  <div class="card wide"><div class="txt"><h3>Four languages</h3><p>The Timer and Traffic Light come in English, Spanish, Russian, and Ukrainian. More widgets are coming.</p><ul><li>Tap the name ⌄, then Language. Only that window changes.</li><li>Settings › Classroom › Default widget language sets the language new windows start in.</li><li>A window you open again keeps its own language.</li><li>Title bars and menus stay in English. Nothing goes online to translate.</li></ul></div><img src="shots/language.jpg" width="…" height="…" loading="lazy" alt="A Timer in Spanish with its window menu open. Language is open beside it, with English, Español, Русский, and Українська."></div>
  ```
- Timer's Good to know (:221) adds `<li>In Timer ⌄, Language puts its words in Spanish, Russian, or Ukrainian.</li>`.
- Traffic Light's Good to know (:338) adds `<li>In Traffic Light ⌄, Language changes what a screen reader says.</li>`.
Screenshots:
- New scene `language` in work/scenes.js → shots/language.jpg: a Timer in Español (set through its menu) at the default
  size with room on its right, its menu open and Language tapped, cropped to the window, the menu, and the flyout
  (as the `menu` scene crops, :412-425).
- Retake every shot that shows Settings' Classroom section, which gains its first row: history.jpg and textstyle.jpg
  for sure; appearance.jpg if it shows Classroom.
- menu.jpg stays (Notes has no row yet).
Then `node docs/teacher-guide/build.js` and `node docs/teacher-guide/check.js`. Don't publish: the session publishes it
to https://claude.ai/artifact/2vXnMT4JJAkm5y6dnjC8YG after the merge.

## 8. Known, and left for later
- **An un-updated tab on the same device** drops `inst.language` on its next write of that window, and Board Sync
  then spreads English. Rare: tabs restart when a new copy takes over (board.js:11018-11019). Accepted (src §9).
- **An older release importing a newer file** drops the languages, as with `copyOf`. Accepted.
- **A switch reloads the window**: a ringing alarm stops, and a Video Player's playback restarts (once it converts).
  Saved work is kept (src §2.6). (Fix round, BEH-1: a Traffic Light following timers keeps a tapped color through the
  reload. It saves the tap on `beforeclose`, as `over`, and drops it when it starts again.)
- **A copy kept from a clash by a device still on 2026.11.27-1 opens in English**, and stays English after that device
  updates, while the original keeps its language (fix round, SYNC-1: accepted, in DATA-FORMAT). Making it match would
  take a new merge rule for a short, rare window during the update.
- **A switch alone saves a Board history version with no change listed** (decision 14).
- **English chosen on a device that then loses its ledger and its own file**, before any other device has it, gives
  way to the folder's language. With no entry it is no version (Rule 1), as on a first set-up. tests/merge.js's oracle
  11 lets such a window go (`langLost`), as oracle 3 lets go a deletion lost the same way (deep test, round 1). In
  DATA-FORMAT.
- **A device still on 2026.11.27-1 that loses its ledger and its own file, then deletes a labelled copy**, can see the
  copy come back from an older file. Its deletion can't cover the copy's making. From 2026.11.27-2 a deletion of a copy
  always does (deep test, round 1). In DATA-FORMAT.
- **A window or page deleted on two devices, both deletions merged first on 2026.11.27-1**: an edit only one of them
  saw can still bring it back there, and that spreads, as before. Merged first on 2026.11.27-2, it stays deleted
  everywhere (deep test, round 1). In DATA-FORMAT.
- **Every linked device writes its file once** after updating (the new style part).
- **The Timer's chips run past a narrow, tall window's edges in English** (1a's §8). Not caused or fixed here.
- The full First/Then section of DATA-FORMAT waits for Phase 3 (decision 13).
- Inter for all four languages is Tyler's call. Until then Russian and Ukrainian use the device's font.
- Phase 2 retakes the guide's menu.jpg once Notes has its row.
- **Open, for the session or Tyler, not the builder:** check Russian and Ukrainian on one district Chromebook before
  the merge. 1b is the first release where teachers can pick them, and whether every school Chromebook's own font has
  Cyrillic letters is unconfirmed (src §9). Inter would settle it.

## 9. Final screenshots for Tyler
deviceScaleFactor 2, at 1366 × 768, into final-shots/, cropped to what matters:
| File | What |
| --- | --- |
| menu.png | A Timer in Español, its menu open with Language lit and the flyout beside it, Español checked (compare p1b-mock/shots/menu.png) |
| menu-edge.png | A Timer in Українська at the board's right edge: the flyout opens on the left (compare menu-edge.png) |
| menu-cols.png | The same Timer menu at Size 200% on 1366 × 768, compact or in two columns, with the flyout placed beside or over it |
| settings.png | Settings › Classroom › Default widget language open, English chosen, the small English names under the other three (compare settings.png) |
| windows.png | A Timer in Русский running (chips `1 мин` to `15 мин`) and a Traffic Light in Español on red, title bars `Timer · Running` and `Traffic Light · Red` in English, with a caption strip below the shot listing the lamps' screen reader names read from the frame (`Rojo`, `Amarillo`, `Verde`) (compare windows.png) |
| menu-dark.png, settings-dark.png | The first and fourth in the dark theme (compare menu-dark.png, settings-dark.png) |
| guide-languages.png | The built Teacher Guide's new Four languages card |
| guide-history.png | The guide's retaken history.jpg, as the guide shows it |

## 10. Commit trailers
Every commit in this release ends with these two lines, exactly:

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016h6FE3zxBXGFPaABAUFsSL
