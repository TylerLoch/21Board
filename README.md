# 21Board

**21Board helps teachers curate their own suite of smartboard widgets so they can orchestrate
their unique classroom with ease.**

21Board is a small "operating system" for the classroom smartboard: an Widget Picker in both bottom
corners, a windowing system for widgets, and on-device storage with export/import. Widgets are
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
| **Open `index.html` from disk** | Download the repo (Code → Download ZIP), unzip, open `index.html` in Chrome | Picker, windows, all widgets, saving, export/import, multiple tabs | Offline mode / installing as an app (needs `https://`) |
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
| **Widget Picker** | The ▦ button in **either** bottom corner (so you can reach it from either side of the board). Tap a widget to open it. Tap ▦ again (or anywhere else) to close. |
| **System controls** | Next to ▦ in the panel: Export, Import, Dark mode, Fullscreen, Settings. |
| **Move a window** | Drag its title bar, or drag anywhere inside widgets that don't involve typing (Clock, Timer, Calendar, Dice…). In widgets with typing (Notes), drag inside with two fingers. Windows snap next to each other and resist overlapping — keep pushing to overlap anyway. Two people can drag two windows at once. |
| **Resize** | Tap a window to select it, then drag the handles at its corners and the middle of each side. Edges snap to line up with nearby windows and to match their width or height. Some widgets keep a fixed shape. |
| **Select / bring to front** | Tap anywhere on a window. The selected window gets a blue outline and resize handles. Tap the empty board to deselect everything. |
| **Window menu** | Tap the widget's name (⌄) in the title bar: the widget's own options, **Fill the board**, **Reset**, **Close**. Double-tap the title bar to fill/restore. |
| **Closing** | Closing a window keeps its content. Open the widget again to pick up where you left off. If you have several of the same widget, they come back in order (1, 2, 3…). |
| **Export** | *Full backup* (everything, including closed windows) or *Blank template* (layout and widget settings, no content — safe to share with colleagues). Saves a `.21board` file (in Chrome/Edge on computers and Chromebooks you choose where, e.g. Google Drive). |
| **Import** | Pick a `.21board` file (or drop it on the board). Choose *Replace my board* or *Add to my board*. |
| **Different screens** | The board is 16:9 and scales like a picture to fit any screen, so moving between a laptop and the smartboard keeps your arrangement. Settings can unlock the shape (fill any window) and change the size of windows and menus. |
| **Board history** | Undo a big change, or recover after a “disaster” (a curious student): Settings → **Board history…** shows earlier versions of the board with a small preview and what changed. *Go back* restores the whole board (and can itself be undone); *Put back* brings back one window. Undo also appears after Reset, Delete, Close all, Import and Load. With every window closed, the empty board offers *Go back to an earlier version*; each window's menu has *Earlier versions…*. |
| **Kiosk mode** | Add `?kiosk=yes` to the address for a ChromeOS kiosk (no sign-in): no Export, Import or Fullscreen, and a red ✕ Quit after the Settings gear. See [Kiosk mode](#kiosk-mode-chromeos-kiosk-no-sign-in). |
| **Multiple tabs** | If 21Board is open in several tabs/windows on the same computer, they stay in sync automatically. |

### Settings

- **Board history:** open it, how often a version is saved (every 10 minutes while the board changes,
  every hour, once a day, off), copies in the Google Drive folder, delete board history.
- **Appearance:** Light / Dark / Auto theme, accent color (8 choices; also passed to widgets),
  board background color (or match theme), background pattern (dots, grid, lines), background photo
  (fill the board or show the whole photo, tap to choose what stays in view, fade; kept on the device and
  in full backups, not in templates).
- **Windows:** snap & avoid overlap on/off, drag windows from inside on/off, how hard you must push to overlap, size of windows and menus (default 80%), board shape (16:9 or any shape), close all windows.
- **Widget Picker:** show the controls in both corners, or only left/right.
- **Board:** board name (used for export file names), list of every saved widget window with
  open/delete.
- **Google Drive folder:** share boards with your other devices (the smartboard) through a folder in Google
  Drive: choose the folder, Send, send automatically, include the photo, this device's name, other boards in
  the folder. See [Sharing a board with the smartboard](#sharing-a-board-with-the-smartboard-google-drive-folder).
- **Storage & offline:** offline readiness, whether the browser has agreed to protect 21Board's data (with an *Install app* button when that would help), last backup and *Back up now*, storage used.
- **Advanced:** Developer mode (SDK Playground, test unregistered widgets), erase everything.

---

## Project layout

```
index.html              Board shell: markup + all CSS
board.js                Board shell logic (storage, sync, windows, picker, settings, export/import)
sw.js                   Service worker (offline cache, updates)  ← bump VERSION on deploy
manifest.webmanifest    PWA manifest (also lets the installed app open .21board files in Chrome)
icons/                  Widget icons
sdk/board21.js          The SDK every widget includes (window.Board21)
sdk/board21-dev.js      The widget dev window: a widget opened outside 21Board runs in the real board
sdk/dev/board-shell.js  index.html's markup for the dev window (made by tools/build-sdk.js)
sdk/lab.html            Widget lab: paste a widget's HTML and try it in a real window
widgets/registry.js        THE list of widgets (used by the picker AND the offline cache)
widgets/<id>/index.html    One folder per widget
widgets/_template/         Starter for new widgets (not registered)
docs/WIDGET-SDK.md      How to build a widget; SDK reference; submission checklist
docs/DATA-FORMAT.md     IndexedDB layout, sync protocol, .21board file format
tests/run.js            Optional automated browser tests
```

### Included widgets

| Widget | Shows off |
| --- | --- |
| **Timer** | Wall-clock state that stays in sync across tabs, `requestAttention`, checkable menu items; six alarm sounds made with Web Audio (no sound files) |
| **Calendar** | Month view with today highlighted; week can start on Sunday or Monday |
| **Clock** | Analog, digital or date-only; aspect-ratio lock that changes at runtime (analog 1:1, digital/date 2.2:1), config-only widget |
| **Notes** | Text grows to fill the note, tappable web links, colors incl. Chalkboard and Whiteboard themes (bundled hand-drawn fonts), live text sync without losing the cursor |
| **Name Picker** | Student names kept as *content* so templates never include them |
| **Dice** | Responsive SVG sizing; blank dice tumble in 3D and land on the saved values in every open copy |
| **Traffic Light** | Tall fixed-shape window, title status text |
| **SDK Playground** | Developer mode only: every SDK call and event |

---

## Adding a widget

1. Copy `widgets/_template/` to `widgets/<id>/` and build it (see **[docs/WIDGET-SDK.md](docs/WIDGET-SDK.md)**).
2. Add an entry to `widgets/registry.js` listing every file it needs.
3. Bump `VERSION` in `sw.js`.

To try a widget, open its file in a browser: it appears in the **dev window**, a real 21Board window with
its title bar, resize handles, menu and Settings, plus panels for its saved data, its messages and common
problems. This also works in AI tools' previews (Gemini Canvas and others) and in `sdk/lab.html` (paste
the HTML). See [docs/WIDGET-SDK.md, "Testing a widget"](docs/WIDGET-SDK.md#testing-a-widget). Inside
21Board: Settings → Advanced → Developer mode → *Test a widget*.

---

## How data is kept

See **[docs/DATA-FORMAT.md](docs/DATA-FORMAT.md)**. In short: one IndexedDB object store of small
JSON records — settings, board, and for every widget window an instance record (position, size,
open/closed), its content, and its config. Each window of the same widget has its own sequential
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

## Sharing a board with the smartboard (Google Drive folder)

Build a board on your laptop, show it on the smartboard. 21Board never talks to Google itself: ChromeOS
already keeps **Google Drive › My Drive** the same on every Chromebook you sign in to, and 21Board just
keeps a file per board in one folder there that you choose.

**Once on each device** (laptop and smartboard): Settings → **Google Drive folder** → *Choose folder…* →
Google Drive › My Drive › **21Board** (make the folder first) → *Select* → *Allow*. Chrome then lets 21Board
read and write in that one folder only; it can't see anything else.

**Then:**

- **Laptop:** Settings → Google Drive folder → **Send**, or turn on *Send automatically* (a few seconds
  after each change).
- **Smartboard:** within a minute or two (when 21Board opens, when it comes back to the front, and every
  2 minutes) it says **“Room 12” was updated on my laptop at 7:42 · Load / Not now**. Nothing changes until
  you tap Load. The first time, pick the board under *Other boards in the folder* in Settings.
- **Changed on both?** Load says so first and offers *Keep a copy of mine, then load* (the copy goes in the
  folder as its own board). A version this device hasn't loaded is never overwritten: *Send automatically*
  waits until it's loaded, and Send asks (*Load theirs* or *Send mine*, keeping the other as a copy).
- It works both ways: Send from the smartboard and the laptop offers it.

**21Board keeps the folder in order:** one file per board, named after it (“Room 12.21board”, or
“Room 12 (2).21board” if another board has that name); renaming a board renames its file on the next
send; each board has a hidden id, so files are matched to the right board whatever they're called;
an *About this folder.txt* explains the files; anything else in the folder is left alone. Each file is a
full backup (it counts as one), including the background photo unless *Include the background photo* is
off (then each device keeps its own). *This device's name* is what the other devices show (“updated on …”).

**Good to know:** Chrome and Edge only (Safari and Firefox keep Export/Import). Drive needs the internet
to carry the file, usually within seconds to a minute. Chrome remembers the folder permission for an
installed 21Board; in a plain tab it may ask again after a restart (*Allow on every visit* avoids that).
The files can include student names and class photos: share the folder only with people who should see them.

**For IT (Google Admin console):** nothing to set up beyond leaving these as they are:
Google Drive on for teachers (`DriveDisabled` not set); Chrome's file-access policies
(`DefaultFileSystemReadGuardSetting` / `DefaultFileSystemWriteGuardSetting`) not set to *Block* (or add the
21Board site to `FileSystemReadAskForUrls` / `FileSystemWriteAskForUrls`; no policy can grant the permission
ahead of time, so each teacher taps Allow once per device). Smartboards signed in with a room or shared
account need the folder shared with that account (or a shared drive). Force-installing 21Board keeps the
permission across restarts. Optional: mark the folder *Available offline* on boards. **Before rollout, try it
on a few real laptops and boards** (how quickly files arrive, and that the folder stays allowed after a reboot).

## Kiosk mode (ChromeOS kiosk, no sign-in)

Open 21Board with **`?kiosk=yes`** (for example `https://boardapp.ccsd21.org/?kiosk=yes`) for a ChromeOS kiosk
app, where no one signs in:

- The Widget Picker leaves out Export, Import and Fullscreen (a kiosk is already full screen) and ends with
  **Quit**, a red ✕ after the Settings gear.
  Quit asks first, waits until everything is saved, then closes the app (`window.close()`, as 21Sketch does). On
  ChromeOS this ends the kiosk session; an auto-launched kiosk app starts again. If the browser won't let the page
  close (a normal tab), it says so.
- Left out: Export, Import (including dropping or opening `.21board` files), the Google Drive folder, the install
  prompt, backup reminders and Developer mode. Settings says it's in kiosk mode.
- Everything else works as usual: widgets, saving on the device, board history and Undo.
- Without the parameter (or with `?kiosk=no`), nothing changes.

**Admin console:** Devices → Chrome → Apps & extensions → Kiosks → add the app by URL with `?kiosk=yes`, and
choose whether it launches automatically. The offline cache (service worker) serves the board with the parameter too.

## Board history (going back)

21Board keeps earlier versions of the board on the device, in a separate database from the board itself:
while the board changes (at most every 10 minutes, once it has settled for a minute), when 21Board opens,
and before every risky action (Reset, Delete, Close all, changing or removing the photo, Import, Load, going
back, Erase everything, and a widget's content suddenly being emptied, e.g. a note cleared). Identical content
is never saved twice. *Save this version now* keeps a named version until you delete it. Turning automatic
versions off still keeps one before each risky action, so Undo keeps working.

**What's kept:** the newest 20, one an hour for 2 days, the first and last of each day for a month, one a week
for 3 months (counting only days the board was used, so a summer break doesn't empty it), safety versions for a
week, and the version before a big change for a month. Photos are stored once, and history stays within a share
of the device's storage (less when space is low). **Going back never changes this device's settings** (theme,
accent) and a running timer comes back paused. *Erase everything* keeps board history (so it can be undone);
*Erase, including board history* doesn't.

**In the Google Drive folder** (when linked): about one copy an hour (and every version you save) goes to
“Board history” inside the folder, without the background photo, named like
`Room 12 2026-11-10 09.45 (smartboard) [7c1e9a-k3j9].21board`. Each device thins only its own copies; files
ending in “saved” stay. Another device, even one that was reset, can bring a board back from them (Board
history → *In your Google Drive folder*). They can include student names.

Board history isn't a backup: if the browser clears 21Board's data, it goes too. The code is section **13c**
in `board.js`; the records are in docs/DATA-FORMAT.md, "Board history".

## Board shape and size

| | |
| --- | --- |
| **16:9 (default)** | The board is a 16:9 canvas drawn as large as fits the window, centered, with the rest of the window lightly shaded. Every screen (laptop, monitor, smartboard) shows the same arrangement, so a board planned on a laptop looks the same on the board. Windows can't be put in the shaded margin. |
| **Any shape** | Settings → Windows → *Board shape → Any shape*: the board fills the whole window at the chosen size. On a smaller screen, windows are moved to fit (as in early builds). |
| **Size of windows and menus** | Settings → Windows, − / + (50%–200%, default **80%**): how big title bars, menus, the Widget Picker, Settings and widget contents are, as on a 1920 × 1080 screen. Windows keep their place and footprint when it changes. Menus, the Widget Picker, Settings and messages never get bigger than fits the screen (a size picked on a smartboard can arrive on a tablet in a backup). |
| **Tip** | When the 16:9 board leaves much of the window unused (a very wide, tall or narrow window), a small tip in the shaded margin offers *Use the whole window* (switches to Any shape). *Hide* keeps it away for the session. It's left out when the margin is too small to hold it. |

Both settings are saved with the board (and in exports). Boards saved before this existed are
converted once when opened, keeping their arrangement as it looks on that screen. The code is
section **6a. Board shape and scale** in `board.js`; see also docs/DATA-FORMAT.md, "Layout space".

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

- `widgets/notes/fonts/CrayonLibre-21Board.woff2`: *Crayon Libre* 1.05 by GGBotNet, released under CC0 1.0
  (public domain, `widgets/notes/fonts/CrayonLibre-LICENSE.txt`). It gives the Notes Chalkboard theme
  hand-drawn chalk lettering on every device, Chromebooks included. `tools/build-chalk-font.py` makes
  this file from the original, reusing the font's own chalk strokes: a print (non-cursive) lowercase l
  whose bottom trails off like chalk as the hand lifts,
  a flag on the 1 and bars on the capital I (so l, 1 and I differ), a Q with a plain straight tail, a
  two-dot colon (the original's looked like a semicolon), no pictograph emoji, WOFF2 (about 60 KB).
- `widgets/notes/fonts/Excalifont-Regular.woff2`: *Excalifont* by Excalidraw (based on Virgil by Ellinor
  Rapp), used unmodified under the SIL Open Font License 1.1 (`widgets/notes/fonts/Excalifont-OFL.txt`),
  for the Notes Whiteboard theme.
