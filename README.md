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

## Running it

Any static web server works. From the repository folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. (Offline support needs `https://` or `localhost`.)

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
| **Move a window** | Drag its title bar. Windows snap next to each other and resist overlapping — keep pushing to overlap anyway. Two people can drag two windows at once. |
| **Resize** | Drag the grips at the corners and the middle of each side. Some apps keep a fixed shape. |
| **Bring to front** | Tap anywhere on the window. |
| **Window menu** | Tap the app's name (⌄) in the title bar: the app's own options, **Fill the board**, **Reset**, **Close**. Double-tap the title bar to fill/restore. |
| **Closing** | Closing a window keeps its content. Open the app again to pick up where you left off. If you have several of the same app, they come back in order (1, 2, 3…). |
| **Export** | *Full backup* (everything, including closed windows) or *Blank template* (layout and app settings, no content — safe to share with colleagues). Saves a `.21board` file. |
| **Import** | Pick a `.21board` file (or drop it on the board). Choose *Replace my board* or *Add to my board*. |
| **Multiple tabs** | If 21Board is open in several tabs/windows on the same computer, they stay in sync automatically. |

### Settings

- **Appearance:** Light / Dark / Auto theme, board background color (or match theme), background
  pattern (dots, grid, lines).
- **Windows:** snap & avoid overlap on/off, how hard you must push to overlap, close all windows.
- **App Picker:** show the controls in both corners, or only left/right.
- **Board:** board name (used for export file names), list of every saved app window with
  open/delete.
- **Storage & offline:** offline readiness, storage used, ask the browser to protect the data.
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
| **Timer** | Wall-clock state that stays in sync across tabs, `requestAttention`, checkable menu items |
| **Clock** | Aspect-ratio lock that changes at runtime (analog 1:1, digital 2.2:1), config-only app |
| **Notes** | Live text sync without losing the cursor, theme-aware colors |
| **Name Picker** | Student names kept as *content* so templates never include them |
| **Dice** | Responsive SVG sizing |
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

The browser can clear site storage when a device runs low on space. 21Board asks for persistent
storage automatically (and offers a *Protect my data* button), but **regular exports are the real
backup.**

---

## Tests

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/run.js            # all suites
node tests/run.js offline    # just one suite (matches the suite title)
```

## Browser support

Built for current **Chrome** (and Chromium-based Edge). Kept compatible with **Safari 16+**
(iPadOS/macOS) and current Firefox. Fullscreen is hidden where the browser doesn't support it.
