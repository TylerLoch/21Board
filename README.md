# 21Board

**21Board helps teachers curate their own suite of smartboard sub-apps so they can orchestrate
their unique classroom with ease.**

21Board is a small "operating system" for the classroom smartboard: an App Picker in both bottom
corners, a windowing system for sub-apps, and on-device storage with export/import. Sub-apps are
built independently and dropped in.

- Pure HTML, CSS, JavaScript and SVG — **no libraries, no build step, no server code**
- Installable PWA that **works entirely offline**
- All data stays **on the device** (IndexedDB); nothing is sent anywhere
- Production: <https://boardapp.ccsd21.org>

---

## Trying it out

You don't need a server to try 21Board:

| Option | Setup | Works | Doesn't work |
| --- | --- | --- | --- |
| **Open `index.html` from disk** | Download the repo (Code → Download ZIP), unzip, open `index.html` in Chrome | Picker, windows, all sub-apps, saving, export/import, multiple tabs | Offline mode / installing as an app (needs `https://`) |
| **GitHub Pages** | Repo Settings → Pages → *Deploy from a branch* → pick the branch, `/ (root)` | Everything, including offline and install. A real URL you can open on a smartboard | — (private repos need a paid GitHub plan for Pages; the site itself is public) |
| **Local web server** | `python3 -m http.server 8000` in the folder, open <http://localhost:8000> | Everything | — |

21Board uses only relative paths, so it also works from a subfolder (e.g.
`https://example.org/21Board/`).

> **Keep test copies on a different host than production.** Browser storage is per site, so a
> test copy at `boardapp.ccsd21.org/preview/` would share teachers' real saved boards. Use a
> separate (sub)domain for staging.

### Deploying

Copy the repository's files (everything except `tests/` and `docs/`, which are harmless to
include) to the static host. Then:

1. **Bump `VERSION` in `sw.js` on every deploy.** Open copies of 21Board will show a
   "new version is ready — Update" message and download the new files.
2. Serve `manifest.webmanifest` as `application/manifest+json` (most servers already do).
3. Recommended: serve `sw.js` with `Cache-Control: no-cache`.

---

## Using 21Board

| | |
| --- | --- |
| **App Picker** | The ▦ button in **either** bottom corner (so you can reach it from either side of the board). Tap an app to open it. Tap ▦ again (or anywhere else) to close. |
| **System controls** | Next to ▦ in the panel: Export, Import, Dark mode, Fullscreen, Settings. |
| **Move a window** | Drag its title bar, or drag anywhere inside apps that don't involve typing (Clock, Timer, Calendar, Dice…). In apps with typing (Notes), drag inside with two fingers. Windows snap next to each other and resist overlapping — keep pushing to overlap anyway. Two people can drag two windows at once. |
| **Resize** | Tap a window to select it, then drag the handles at its corners and the middle of each side. Edges snap to line up with nearby windows and to match their width or height. Some apps keep a fixed shape. |
| **Select / bring to front** | Tap anywhere on a window. The selected window gets a blue outline and resize handles. Tap the empty board to deselect everything. |
| **Window menu** | Tap the app's name (⌄) in the title bar: the app's own options, **Fill the board**, **Reset**, **Close**. Double-tap the title bar to fill/restore. |
| **Closing** | Closing a window keeps its content. Open the app again to pick up where you left off. If you have several of the same app, they come back in order (1, 2, 3…). |
| **Export** | *Full backup* (everything, including closed windows) or *Blank template* (layout and app settings, no content — safe to share with colleagues). Saves a `.21board` file (in Chrome/Edge on computers and Chromebooks you choose where, e.g. Google Drive). |
| **Import** | Pick a `.21board` file (or drop it on the board). Choose *Replace my board* or *Add to my board*. |
| **Different screens** | The board scales like a picture to fit the screen, so moving from a big monitor to a laptop keeps your arrangement (just smaller) instead of piling windows up. Settings can turn this off or make the current screen the new full size. |
| **Multiple tabs** | If 21Board is open in several tabs/windows on the same computer, they stay in sync automatically. |

### Settings

- **Appearance:** Light / Dark / Auto theme, accent color (8 choices; also passed to sub-apps),
  board background color (or match theme), background pattern (dots, grid, lines).
- **Windows:** snap & avoid overlap on/off, drag windows from inside on/off, how hard you must push to overlap, scale the board to fit the screen (on by default) and "use this screen's size", close all windows.
- **App Picker:** show the controls in both corners, or only left/right.
- **Board:** board name (used for export file names), list of every saved app window with
  open/delete.
- **Storage & offline:** offline readiness, whether the browser has agreed to protect 21Board's data (with an *Install app* button when that would help), last backup and *Back up now*, storage used.
- **Advanced:** Developer mode (SDK Playground, test unregistered sub-apps), erase everything.

---

## Project layout

```
index.html              Board shell: markup + all CSS
board.js                Board shell logic (storage, sync, windows, picker, settings, export/import)
sw.js                   Service worker (offline cache, updates)  ← bump VERSION on deploy
manifest.webmanifest    PWA manifest (also lets the installed app open .21board files in Chrome)
icons/                  App icons
sdk/board21.js          The SDK every sub-app includes (window.Board21)
apps/registry.js        THE list of sub-apps (used by the picker AND the offline cache)
apps/<id>/index.html    One folder per sub-app
apps/_template/         Starter for new sub-apps (not registered)
docs/SUBAPP-SDK.md      How to build a sub-app; SDK reference; submission checklist
docs/DATA-FORMAT.md     IndexedDB layout, sync protocol, .21board file format
tests/run.js            Optional automated browser tests
```

### Included sub-apps

| App | Shows off |
| --- | --- |
| **Timer** | Wall-clock state that stays in sync across tabs, `requestAttention`, checkable menu items; six alarm sounds made with Web Audio (no sound files) |
| **Calendar** | Month view with today highlighted; week can start on Sunday or Monday |
| **Clock** | Analog, digital or date-only; aspect-ratio lock that changes at runtime (analog 1:1, digital/date 2.2:1), config-only app |
| **Notes** | Text grows to fill the note, tappable web links, colors incl. a Chalkboard theme (bundled font), live text sync without losing the cursor |
| **Name Picker** | Student names kept as *content* so templates never include them |
| **Dice** | Responsive SVG sizing; blank dice tumble in 3D and land on the saved values in every open copy |
| **Traffic Light** | Tall fixed-shape window, title status text |
| **SDK Playground** | Developer mode only: every SDK call and event |

---

## Adding a sub-app

1. Copy `apps/_template/` to `apps/<id>/` and build it (see **[docs/SUBAPP-SDK.md](docs/SUBAPP-SDK.md)**).
2. Add an entry to `apps/registry.js` listing every file it needs.
3. Bump `VERSION` in `sw.js`.

To try a sub-app before registering it: Settings → Advanced → Developer mode → *Test a sub-app*.

---

## How data is kept

See **[docs/DATA-FORMAT.md](docs/DATA-FORMAT.md)**. In short: one IndexedDB object store of small
JSON records — settings, board, and for every app window an instance record (position, size,
open/closed), its content, and its config. Each window of the same app has its own sequential
instance number and separate data. Other open copies of 21Board are notified of every change and
re-read just what changed.

The browser can clear site storage when a device runs low on space unless it grants the site
*persistent storage*. No web page can force that: 21Board requests it automatically every time it
starts and again later, and the browser decides. Chrome and Edge decide from signals such as the
app being **installed**, so installing 21Board (or force-installing it for managed devices) is the
most reliable way to get it. Safari may delete data for sites that haven't been visited in 7 days
unless they're added to the Home Screen/Dock. While storage isn't protected, 21Board shows the
status in Settings and reminds teachers (at most every 3 days) to save a backup, and
**regular exports remain the real backup.**

---

## Board scaling: trying it, switching it off, taking it out

Board scaling (the board zooms to fit each screen, keeping the arrangement) is new and may be
reworked, so it's built to be easy to back out:

| To… | Do this |
| --- | --- |
| **Current status** | **Off by default.** Windows keep their size and are pushed inside the edges on a smaller screen, as before. |
| Try it | Open 21Board with `?scaling=on` at the end of the address (e.g. `…/21Board/?scaling=on`). Only that page load uses it; nothing changes for anyone else. |
| Turn it on for everyone | In `board.js`, make `SCALING_FEATURE` true (section **6a. Board scaling**), bump `VERSION` in `sw.js`, deploy. |
| Let a teacher turn it off (when it's on) | Settings → Windows → *Scale the board to fit the screen*. |
| Take it out entirely | Delete section 6a in `board.js` and follow the checklist at the top of it (a handful of one-line replacements). |

Saved boards work in every case. Turning scaling off, or going back to a build without it, keeps
all windows, positions and content (it was tested both ways). Boards made with scaling on just
carry one extra field (`layout`) that older builds ignore.

## Tests

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/run.js            # all suites
node tests/run.js offline    # just one suite (matches the suite title)
```

## Browser support

Built for current **Chrome** (and Chromium-based Edge). Kept compatible with **Safari 16+**
(iPadOS/macOS) and current Firefox. Fullscreen is hidden where the browser doesn't support it.

## Third-party files

- `apps/notes/fonts/CrayonLibre-21Board.woff2`: *Crayon Libre* 1.05 by GGBotNet, released under CC0 1.0
  (public domain, `apps/notes/fonts/CrayonLibre-LICENSE.txt`). It gives the Notes Chalkboard theme
  hand-drawn chalk lettering on every device, Chromebooks included. `tools/build-chalk-font.py` makes
  this file from the original: a two-dot colon (the original's looked like a semicolon), a capital I
  with bars (so I, l and 1 differ), no pictograph emoji, WOFF2 (60 KB).
