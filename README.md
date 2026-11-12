# 21Board

**21Board helps teachers curate their own suite of smartboard widgets so they can orchestrate
their unique classroom with ease.**

21Board is a small "operating system" for the classroom smartboard: an Widget Picker in both bottom
corners, a windowing system for widgets, and on-device storage with export/import. Widgets are
built independently and dropped in.

- Pure HTML, CSS, JavaScript and SVG — **no libraries, no build step, no server code**
- Installable PWA that **works entirely offline** (the district apps' windows: see
  [District apps](#district-apps-21sketch-21timer-21doccam))
- All data stays **on the device** (IndexedDB); 21Board sends nothing anywhere (the district apps' windows
  load those apps from their own sites)
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

A release is a complete set of files with one name and one fingerprint. Every time, before the files go to
the host:

1. **Change `VERSION` in `sw.js`** (the release's name: the date and a counter, e.g. `2026.11.12-1`).
2. **Run `node tools/release.js`.** It stamps the release: the name and a fingerprint of all the files (the
   *build*) go into `sw.js`, `board.js` and `index.html`. Run it again after any later change.
3. **Run the tests** (`node tests/run.js`). They fail if a file changed after the stamp was made.
4. Copy the repository's files (everything except `tests/` and `docs/`, which are harmless to include) to
   the static host, all of them together.

On the host: serve `manifest.webmanifest` as `application/manifest+json` (most servers already do), and
preferably `sw.js` with `Cache-Control: no-cache`. The host must serve the files exactly as they are in the
repository (no minifying or rewriting on the way).

What devices do with a release:

- A device keeps **one complete release** for offline use and runs only that: the page, `board.js`, the SDK
  and the widgets always belong together. The copy is saved only if every file downloaded matches the stamp,
  so a half-finished upload, a dropped connection or a Wi-Fi sign-in page can't leave a device with part of
  a release. It keeps the release it has and tries again later (hourly, and each time 21Board starts).
- When a new release has been saved, open boards show **“A new version of 21Board is ready.”** with *Update*
  and *Later*. *Update* takes a second or two and restarts every open 21Board tab on the new release; the
  board and its content stay. *Later*, or no answer, is fine: the new release takes over by itself the next
  time 21Board starts (after every tab or the app was closed; in a kiosk, after Quit or a restart). Until
  then a dot stays on the ▦ buttons and on the Settings gear, and Settings opens with the same line and
  *Update now* at the top.
- **Settings → About** shows the release the device is really running, name and build, e.g.
  `21Board 2026.11.12-1 (3fa9c1d2)`. Exported files carry the same text. That is the answer to “which version
  are you on?”.
- If files are uploaded **without a new stamp** (step 2 forgotten), devices that already have 21Board keep
  the release they have, whole, and devices new to it run from the network without an offline copy
  (Settings says *Offline copy unavailable*). Nothing breaks, and the tests in step 3 catch it first.
  Forgetting only step 1 is harmless: the build still changes, so devices update, under the old name.
- If a device's offline copy goes missing (a browser can drop it), the release saves it again the next
  time 21Board starts with a connection. Until that has worked, Settings says *Saving an offline copy…* or
  *Offline copy unavailable* instead of *Ready to work offline*.
- The one exception to “one complete release”: a tab that has no offline copy yet (a first visit whose copy
  couldn't be saved) takes each file from the server when it needs it. If a release is published while such
  a tab is open, a widget opened afterwards is the new one. The tab offers *Update* once the new release has
  been saved on the device.

While working on the files on a local server, the offline copy keeps serving the release it saved. To see a
change: run `node tools/release.js`, reload, and tap *Update* when it is offered a few seconds later.
(Reloading with Shift held, Ctrl+Shift+R, shows the page from the server at once, but widget windows that
are open still come from the saved copy: reload once more, or close and open the widget.)

---

## Using 21Board

| | |
| --- | --- |
| **Widget Picker** | The ▦ button in **either** bottom corner (so you can reach it from either side of the board). Tap a widget to open it. Tap ▦ again (or anywhere else) to close. |
| **System controls** | Next to ▦ in the panel: Export, Import, Dark mode, Fullscreen, Settings. |
| **Pages** | Each page is a board of its own (its own windows, content, background and name), for lessons or parts of the day. At the far end of the Widget Picker's bottom row: **‹ Page 2 of 3 ›**. ‹ and › go to the page before and after; on the last page › is **+** (a new page). Tap *Page* for the Pages menu: every page by name (tap one to go there), **New page**, **Duplicate this page**, **Rename this page…**, **Move left / right** and **Delete this page…** (with Undo). A new page takes this page's size, shape, color and pattern. Every tab on the device shows the same page, and 21Board opens on the page it was showing. Widgets on other pages don't run while their page isn't shown: a Timer shows the right time when you come back, but its alarm doesn't ring on another page. |
| **Move a window** | Drag its title bar, or drag anywhere inside widgets that don't involve typing (Clock, Timer, Calendar, Dice…). In widgets with typing (Notes), drag inside with two fingers. Windows snap next to each other and resist overlapping — keep pushing to overlap anyway. Two people can drag two windows at once. |
| **Resize** | Tap a window to select it, then drag the handles at its corners and the middle of each side. Edges snap to line up with nearby windows and to match their width or height. Some widgets keep a fixed shape. |
| **Select / bring to front** | Tap anywhere on a window. The selected window gets a blue outline and resize handles. Tap the empty board to deselect everything. |
| **Window menu** | Tap the widget's name (⌄) in the title bar: the widget's own options, **Fill the board**, **Reset**, **Close** (21Sketch, 21Timer and 21DocCam: **Reload** and **Open … on its own** instead of Reset). Double-tap the title bar to fill/restore. A tap that slides a little under a finger still counts as a tap. |
| **Closing** | Closing a window keeps its content. Open the widget again to pick up where you left off. If you have several of the same widget, they come back in order (1, 2, 3…). |
| **Export** | *Full backup* (everything, including closed windows) or *Blank template* (layout and widget settings, no content — safe to share with colleagues). With several pages: *All pages* (a backup of every page in one file), *This page*, or *This page as a blank template*. Saves a `.21board` file (in Chrome/Edge on computers and Chromebooks you choose where, e.g. Google Drive). *Back up now* (Settings) and the backup reminders always save every page. |
| **Import** | Pick a `.21board` file (or drop it on the board). Choose *Open as a new page* (suggested), *Replace this page* or *Add to this page*. A file of several pages: *Add these pages* or *Replace all pages* (with Undo). A backup of another board opened with *Replace this page* is another board from then on: in a shared Google Drive folder it gets its own file, and the board it replaced stays there. |
| **Different screens** | The board is 16:9 and scales like a picture to fit any screen, so moving between a laptop and the smartboard keeps your arrangement. Settings can unlock the shape (fill any window) and change the size of windows and menus. |
| **Board history** | Undo a big change, or recover after a “disaster” (a curious student): Settings → **Board history…** shows earlier versions of the board with a small preview and what changed. *Go back* restores the whole board (and can itself be undone); *Put back* brings back one window. Undo also appears after Reset, Delete, Close all, Import and Load. With every window closed, the empty board offers *Go back to an earlier version*; each window's menu has *Earlier versions…*. |
| **Kiosk mode** | Add `?kiosk=yes` to the address for a ChromeOS kiosk (no sign-in): no Fullscreen or Google Drive folder, and a red ✕ Quit after the Settings gear. See [Kiosk mode](#kiosk-mode-chromeos-kiosk-no-sign-in). |
| **Multiple tabs** | If 21Board is open in several tabs/windows on the same computer, they stay in sync automatically. |
| **Updates** | When a new version of 21Board is ready, a message offers *Update* (a second or two; the board and its content stay as they are) or *Later*. Left alone, the new version takes over by itself the next time 21Board starts; until then, *Update now* is at the top of Settings (a dot on ▦ and on the Settings gear shows it). Settings → About shows the version in use. |

### Settings

- **At the top, when it applies:** *A new version of 21Board is ready* with *Update now*.
- **Board history:** open it, how often a version is saved (every 10 minutes while the board changes,
  every hour, once a day, off), copies in the Google Drive folder, delete board history.
- **Appearance:** Light / Dark / Auto theme, accent color (8 choices; also passed to widgets),
  letters for 21Board and its widgets (*Standard*: the device's own font; *Easier to read*: Atkinson Hyperlegible,
  made for low vision, with I, l and 1 all different; *Early readers*: Andika by SIL, with a and g the way children
  learn to write them; easier reading, not a dyslexia font; this device only; Notes' Chalkboard and Whiteboard
  keep their own lettering),
  board background (with a preview of the board): color in a Light and a Dark row (or match the theme), pattern
  (dots, grid, lines, handwriting rows, graph paper; not shown under a photo, and Settings says so), background photo
  (fill the board or show the whole photo, tap to choose what stays in view, fade; kept on the device and
  in full backups, not in templates).
- **Appearance → Clock in the corner:** *Off*, *Time* (the default) or *Time and date*. A small clock beside the ▦
  button in the bottom right corner (beside the only ▦ when the controls are in one corner), on every page and in
  kiosk mode, as tall as ▦. Taps go through it to the windows under it. It hides while that corner's Widget Picker
  is open, and where the window is too narrow for it (*Time and date* shows only the time first). This device only.
- **Classroom → Lock windows in place:** widgets still work, but windows can't be moved, resized, closed or added from the board and the Widget Picker (Close all is off too), in every tab on this device. Unlock by holding ▦ for 2 seconds, or with the switch.
- **Classroom → Keep the screen on:** *Off* (the default), *While 21Board is showing*, or *School hours* (From and
  To, Monday to Friday, by the device's clock). Stops the Chromebook, iPad or panel from dimming and sleeping while
  21Board is on screen (the browser's screen wake lock). A line says whether it is working right now, or why not:
  outside school hours, a browser that can't (Chrome 84+, Safari 16.4+ in a tab, 18.4+ as a Home Screen app),
  a 21Board not served over https, or a device that doesn't allow it (IT can turn it off by policy). This device only.
- **Windows:** snap & avoid overlap on/off, drag windows from inside on/off, how hard you must push to overlap, size of windows and menus (default 80%), board shape (16:9 or any shape), close all windows.
- **Widget Picker:** show the controls in both corners, or only left/right.
- **This page:** a word about pages, the page's name (used for export file names and in the Google Drive
  folder), list of every saved widget window on this page with open/delete.
- **Google Drive folder:** share boards with your other devices (the smartboard) through a folder in Google
  Drive: choose the folder, Send, send automatically (off, after each change, or when left alone), include
  the photo, this device's name, other boards in the folder; and what is wrong when the folder can't be used.
  See [Sharing a board with the smartboard](#sharing-a-board-with-the-smartboard-google-drive-folder).
- **Storage & offline:** offline readiness, whether the browser has agreed to protect 21Board's data (with an *Install app* button when that would help), last backup and *Back up now*, storage used.
- **Advanced:** Developer mode (SDK Playground, test unregistered widgets by their path or by uploading the file), erase everything (every page).
- **About:** the version this device is running (release name and build), to read out to IT.

---

## Project layout

```
index.html              Board shell: markup + all CSS
board.js                Board shell logic (storage, sync, windows, picker, settings, export/import)
sw.js                   Service worker (offline copy, updates)  ← bump VERSION, run tools/release.js
manifest.webmanifest    PWA manifest (also lets the installed app open .21board files in Chrome)
icons/                  Widget icons
fonts/                  Easier-to-read letters (Settings → Appearance → Letters), loaded only once chosen
sdk/board21.js          The SDK every widget includes (window.Board21)
sdk/board21-dev.js      The widget dev window: a widget opened outside 21Board runs in the real board
sdk/dev/board-shell.js  index.html's markup for the dev window (made by tools/build-sdk.js)
sdk/lab.html            Widget lab: paste a widget's HTML and try it in a real window
widgets/registry.js        THE list of widgets (used by the picker AND the offline cache)
widgets/<id>/index.html    One folder per widget
widgets/_template/         Starter for new widgets (not registered)
docs/WIDGET-SDK.md      How to build a widget; SDK reference; submission checklist
docs/AI-PROMPT.md       For staff: a prompt to build a widget with an AI tool (Gemini, ChatGPT, Claude)
docs/DATA-FORMAT.md     IndexedDB layout, sync protocol, .21board file format
tools/release.js        Stamps a release: its name and a fingerprint of the files (see Deploying)
tests/run.js            Optional automated browser tests
```

### Included widgets

| Widget | Shows off |
| --- | --- |
| **Timer** | Wall-clock state that stays in sync across tabs, `requestAttention`, checkable menu items; six alarm sounds made with Web Audio (no sound files) |
| **Task Timer** | A schedule of activities as a pie with a countdown kept in step across tabs; a repeating alarm set ahead on the sound's own clock, rung by one copy of the board |
| **Calendar** | Month view with today highlighted; week can start on Sunday or Monday |
| **Clock** | Analog, digital or date-only; aspect-ratio lock that changes at runtime (analog 1:1, digital/date 2.2:1), config-only widget |
| **Notes** | Text grows to fill the note, tappable web links, colors incl. Chalkboard and Whiteboard themes (bundled hand-drawn fonts), live text sync without losing the cursor |
| **Name Picker** | Student names kept as *content* so templates never include them; four ways to pick (Big name, Spinning wheel, Spotlight, Lotto), each in its own file, and one to five winners at a time, chosen in the window menu and kept by templates; the pick is drawn and saved before the show, so every open copy lands on the same names |
| **First/Then Board** | Picture-card schedule for students: a card picker with search, done marks, seasonal themes, a chime made with Web Audio |
| **Dice** | Responsive SVG sizing; blank dice tumble in 3D and land on the saved values in every open copy |
| **Traffic Light** | Tall fixed-shape window, title status text |
| **21Sketch** | The district's drawing app, live from sketchapp.ccsd21.org: a window that points to another site (`external`), one window only (`single`). See [District apps](#district-apps-21sketch-21timer-21doccam) |
| **21Timer** | The district's classroom timer, live from timerapp.ccsd21.org, with its own themes and sounds |
| **21DocCam** | The district's document camera, live from doccamapp.ccsd21.org: the one window allowed the camera |
| **SDK Playground** | Developer mode only: every SDK call and event |

---

## Adding a widget

1. Copy `widgets/_template/` to `widgets/<id>/` and build it (see **[docs/WIDGET-SDK.md](docs/WIDGET-SDK.md)**).
2. Add an entry to `widgets/registry.js` listing every file it needs.
3. Bump `VERSION` in `sw.js` and run `node tools/release.js` (see [Deploying](#deploying)).

To try a widget, open its file in a browser: it appears in the **dev window**, a real 21Board window with
its title bar, resize handles, menu and Settings, plus panels for its saved data, its messages and common
problems. This also works in AI tools' previews (Gemini Canvas and others) and in `sdk/lab.html` (paste
the HTML). To have an AI tool write one, start with the prompt in [docs/AI-PROMPT.md](docs/AI-PROMPT.md).
See [docs/WIDGET-SDK.md, "Testing a widget"](docs/WIDGET-SDK.md#testing-a-widget). Inside
21Board: Settings → Advanced → Developer mode → *Test a widget*: enter its path, or **Upload file…** to try
the `.html` file on your computer in your own board. An uploaded file runs sealed off from your boards (it
can't reach their data), is kept on this device only (never in exports, board history or the Google Drive
folder) and works offline; upload it again to see an edit. If one freezes 21Board, open it with `?nodev` at
the end of its address: no test widget starts, and you can remove it in Settings. See
[docs/WIDGET-SDK.md, "Inside 21Board"](docs/WIDGET-SDK.md#inside-21board).

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

### If the board can't be opened or saved

- **The board can't be opened** (the device's storage doesn't answer or can't be read, or 21Board fails to
  start): 21Board says so, with *Try again*, instead of showing an empty board. Nothing is saved until the
  stored board has been read, so a board that failed to open is never replaced by an empty one. *Use 21Board
  without saving* gives an empty board for the lesson, kept only until 21Board closes; Board history still
  works there, so an earlier version can be brought back and exported, and *Erase* only empties the board on
  screen. If just one record is unreadable (in practice a big one, the background photo), the rest of the
  board opens and a message says what is missing.
- **A save fails** (the device is full, for example): the change stays on the board and 21Board keeps trying
  (with the next change, after 5 seconds, then every 30). Until everything is saved, a **Not saved** note stays
  above the ▦ buttons; tap it for the reason, *Try again now* and *Export a backup*. Settings says the same
  at the top. When the device is out of space, 21Board first makes a little room in board history (see
  [Board history](#board-history-going-back)) and tries again. One
  record that doesn't fit (a very long note, the photo) doesn't hold back the rest: the other changes are
  still saved. *Export a backup* doesn't depend on the device's storage: it works from what is on screen.
- **The device loses what was saved while 21Board is open** (Chrome can throw its storage away after the disk
  filled up): 21Board notices, and writes the whole board back from what it holds. If that doesn't work at
  once, **Not saved** stays on until it does. It can't notice while it is closed: then the board starts empty,
  and Board history's copies in the Google Drive folder and exported backups are what bring it back.
- **The browser blocks storage** (some private windows, site data turned off): the board works for that
  session, the **Not saved** note stays on, and Export still gives a backup file.

---

## Sharing a board with the smartboard (Google Drive folder)

Build a board on your laptop, show it on the smartboard. 21Board never talks to Google itself: ChromeOS
already keeps **Google Drive › My Drive** the same on every Chromebook you sign in to, and 21Board just
keeps a file per board in one folder there that you choose.

**Once on each device** (laptop and smartboard): Settings → **Google Drive folder** → *Choose folder…* →
Google Drive › My Drive › **21Board** (make the folder first) → *Select* → *Allow*. Chrome then lets 21Board
read and write in that one folder only; it can't see anything else.

**Then:**

- **Laptop:** Settings → Google Drive folder → **Send**, or set *Send automatically* to *After each change*
  (a few seconds after the last change).
- **Smartboard:** within a minute or two (when 21Board opens, when it comes back to the front, and every
  2 minutes) it says **“Room 12” was updated on my laptop at 7:42 · Load / Not now**. Nothing changes until
  you tap Load. The first time, pick the board under *Other boards in the folder* in Settings. (A board that
  is already one of this device's pages shows *Go to page* there instead of Load.)
- **Changed on both?** Load says so first and offers *Keep a copy of mine, then load* (the copy goes in the
  folder as its own board). A version this device hasn't loaded is never overwritten: *Send automatically*
  waits until it's loaded, and Send asks (*Load theirs* or *Send mine*, keeping the other as a copy).
- It works both ways: Send from the smartboard and the laptop offers it.

**Send automatically, and which device should do it.** A board is shared whole, and a version one device
hasn't loaded holds up that device's own automatic sends (they would replace it). So:

- *After each change* is for the device where you prepare boards (the laptop).
- On the smartboard, leave it *Off* (tap Send after class if you want the board's work back on the laptop),
  or choose *When left alone*: the board is sent once it hasn't changed for 10 minutes. Dice rolls, timers
  and windows opened in class then don't each become a version that the laptop has to load before it can
  send again. With *After each change* on the smartboard they do.
- Either way, a change that wasn't sent before 21Board was closed (or while the folder couldn't be used) goes
  out after 21Board opens again. Not at once: Google Drive first gets two minutes (ten with *When left
  alone*) to bring anything your other device sent in the meantime, so that its version is offered here
  instead of being replaced. The same wait follows waking the device up or coming back online. A change you
  make once 21Board is open again is sent as usual, and takes the earlier one with it.

**If the folder can't be used,** a small note stays above the ▦ button until it works again, so sharing is
never off for a whole day unnoticed: *Reconnect folder* (Chrome wants to be asked again: one tap on the note
and *Allow*), *Folder unavailable* (it can't be found: 21Board keeps looking, and a tap says what to do) or
*Not sent* (an automatic send failed, for example because the folder is shared with you for viewing only: a
tap says why; the note goes once the send works or nothing is left to send). Settings → Google Drive folder
says the same, and when the folder was last checked.

**21Board keeps the folder in order:** one file per board, named after it (“Room 12.21board”, or
“Room 12 (2).21board” if another board has that name); renaming a board renames its file on the next
send; each board has a hidden id, so files are matched to the right board whatever they're called;
an *About this folder.txt* explains the files; anything else in the folder is left alone. Each file is a
full backup (it counts as one). *This device's name* is what the other devices show (“updated on …”).

- **The background photo** goes with the board while *Include the background photo* is on, and so does
  removing it: once a board has been sent or loaded with its photo, taking the photo off on one device takes
  it off the others when they load the next version. A photo that only the smartboard has stays there when
  it loads the laptop's boards: a board that never had a photo says nothing about one, and a photo put on at
  the smartboard after the old one was taken off is its own. Off: this device puts no photo in the folder
  (not in copies either), and a device that loads its boards keeps its own photo.
- **Opening another board** (Import → *Replace my board*, or a `.21board` file opened from the Files app)
  never renames, removes or replaces the file of the board that was showing: the board that was opened gets
  its own file. Only a file that was itself sent to the folder (or a backup of the very board that is
  showing) carries on as that board. A blank template keeps the board it is applied to if it has the
  board's name (a new board is called “My Board” until you rename it). Import says which it is under
  *Replace my board*: “Math” stays in your Google Drive folder, or its copy there is replaced the next time
  the board is sent.
- **A file that is still arriving** (listed in the folder, but Google Drive hasn't brought its content yet)
  isn't taken for no file: a send waits for it (an automatic one for up to 10 minutes from when this device
  finds it so, or wakes up, however old the file is), and if Drive leaves two files for one board, the
  version in each is offered before anything replaces it.

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
on a few real laptops and boards**: how quickly files arrive, that the folder stays allowed after a reboot,
how a file shows up before Drive has brought its content, and what Drive keeps if two devices send the same
board before either has received the other's version (21Board waits to avoid that, but can't rule it out).

## Kiosk mode (ChromeOS kiosk, no sign-in)

Open 21Board with **`?kiosk=yes`** (for example `https://boardapp.ccsd21.org/?kiosk=yes`) for a ChromeOS kiosk
app, where no one signs in:

- The Widget Picker leaves out Fullscreen (a kiosk is always full screen) and ends with **Quit**, a red ✕ after
  the Settings gear. Quit asks first, waits until everything is saved, then closes the app
  (`window.close()`, as 21Sketch does). On ChromeOS that ends the kiosk session: an auto-launched kiosk starts
  21Board again; one started from **Apps** on the sign-in screen goes back to the sign-in screen. If the page
  isn't allowed to close (it only can while it hasn't navigated), it says so.
- Left out: the Google Drive folder (a kiosk has no Google account), the install prompt, Developer mode and
  backup reminders (no one is signed in to act on one, and whether a kiosk keeps its data is set up by IT: step
  3 below). Settings says it's in kiosk mode.
- **Import and Export** stay: ChromeOS shows its Files dialog in kiosk sessions too, so files can be saved to and
  opened from the kiosk's own storage or a USB drive. Export uses only the Save dialog (a plain download would
  land unseen in the kiosk's Downloads). Settings keeps **Back up now**, and *Erase everything* offers *Export a
  backup first*, as everywhere else. A backup on a USB drive is the only copy that isn't on the kiosk itself.
  **Not yet tried on a real kiosk device: test before relying on it.**
- Links in Notes show as plain text: a kiosk can't open new windows. For the same reason the district apps'
  window menu has no *Open … on its own* ([District apps](#district-apps-21sketch-21timer-21doccam)).
- Everything else works as usual: widgets, saving on the device, board history and Undo. Widgets can check
  `Board21.context.kiosk`. Without the parameter (or with `?kiosk=no`), nothing changes.
- A new version of 21Board arrives as everywhere else: the board offers *Update* / *Later*, and the new
  version takes over by itself the next time the kiosk starts (see [Deploying](#deploying)).

**Admin console setup** (from Google's documentation and Chromium's source; try it on one device first):

1. Devices → Chrome → Apps & extensions → **Kiosks** → choose the organizational unit → Add → **Add by URL** →
   `https://boardapp.ccsd21.org/?kiosk=yes` (the exact address, no redirects). **Don't change the URL later:**
   the kiosk's saved boards belong to that exact URL and are deleted with it.
2. Optional: set **Auto-launch app** to 21Board. Otherwise it's started from **Apps** at the bottom left of the
   sign-in screen. Changes apply after the device restarts.
3. Keep the boards between sessions: for this OU, Device settings → *User data* must not be "Erase all local
   user data" (unless the kiosk account itself is set to keep its data).
4. Launch it the first time while online and leave it open for a minute, so its offline copy is complete. Leave
   the kiosk web-app offline setting at its default (on).
5. Keep **Kiosk troubleshooting tools** off (an open developer tools window keeps the session going after Quit)
   and leave *new windows in kiosk* off. Optional: turn off pinch-to-zoom for touch panels.
6. If Import and Export will be used: don't block USB drives, downloads, or file-system access for this OU.

Check on a real device: Quit (auto-launched and from Apps), Import/Export to the device and to USB, typing on a
touch-only panel, and that the board is still there after airplane mode and a restart.

## District apps (21Sketch, 21Timer, 21DocCam)

21Sketch, 21Timer and 21DocCam are the district's own apps, each a separate website. In the Widget Picker they
open in a window like any widget, but the window shows the live site (`https://sketchapp.ccsd21.org/` and so
on): 21Board doesn't copy the apps or their work.

**For teachers**

- **Each app keeps its own work on the device**: the drawing in 21Sketch, 21Timer's settings and running
  timer, 21DocCam's camera choice. 21Board keeps only where the window is and whether it's open. Closing or
  deleting the window doesn't touch the app's work, and neither does *Erase everything* in 21Board's Settings
  (it says so). Whether it's the same work as in the app opened on its own depends on the browser: see
  *Production and the test site* below.
- **One window per app.** Choosing it again in the Widget Picker brings its window forward (or opens it again),
  and *Add to my board* doesn't add a second one from a file. A second 21Sketch window would only show the same
  drawing, and a second 21DocCam would start the camera again.
- **A window partly behind another: tap it once** to bring it forward. That first tap doesn't draw or press
  anything (21Board can't see taps inside another site's page). A window that nothing covers takes every tap
  straight away, so two people can draw in 21Sketch and use another window at once; its blue outline may then
  stay on the other window. Move the window by its title bar.
- **The window menu** has *Reload 21Sketch* (loads the app again, e.g. after the connection came back), *Open
  21Sketch on its own* (a new tab) and no *Reset* or *Earlier versions*: the app's work isn't 21Board's to reset
  or bring back.
- **Backups, templates, the Google Drive folder and Board history** keep the window (where it is, open or
  closed), never the app's work. A board opened on another device opens that device's 21Sketch, with whatever
  is saved there. To move a drawing, use 21Sketch's own project file (`.json`).
- 21Board's theme, accent color and size don't reach these apps; they have their own settings.

**Production and the test site.** At `boardapp.ccsd21.org`, 21Board and the apps are the same site
(ccsd21.org), so Chrome (Chromebooks, the smartboards) treats the app in the window as the same app as on its
own: the same saved work, the same offline copy, and the two stay in step (a line drawn in one appears in the
other). On the GitHub test site (`tylerloch.github.io/21Board`) the apps are another site, so Chrome keeps their
storage apart inside 21Board: separate work from the app opened on its own, and a separate offline copy.
**On iPads (Safari), even at `boardapp.ccsd21.org`, the window keeps its work apart from the app opened on its
own** (Safari keeps a framed app's storage apart whenever the page around it has another address, even on the
same site), and it needs its own first visit online inside 21Board before it can work offline.

**Offline.** 21Board saves its own offline copy, but it can't save another site's pages, so an app's window
works offline only once **that app saves its own offline copy** (a service worker of its own) and the device
has opened it online since. Today none of the three does: **21Sketch's offline worker is ready in its
repository (`sw.js`) but not yet on its server; 21Timer and 21DocCam need one deployed too.** Nothing in
21Board needs to change when they are. (Tried with a copy of 21Sketch and its worker: offline, the window opens
21Sketch with the same drawing.)

- Offline, the window's title says **Offline**, and a message says once that the app needs a connection unless
  it's saved on this device for offline use. 21Board can't tell whether the app loaded (another site's page
  is closed to it), so it covers nothing: an app with its own offline copy works as usual; one without shows
  the browser's "no connection" page. When the connection is back, choose *Reload 21Sketch* (or 21Timer,
  21DocCam) in the window's menu. The same goes for a window that opened while the site couldn't be reached
  (Wi-Fi not up yet, a sign-in page, the server down): 21Board can't tell, and doesn't load it again by itself.
  *Ready to work offline* in Settings is about 21Board itself.
- 21Board never checks on the sites by itself: nothing is sent to them but opening the window.

**For IT**

- **Framing.** Today the three sites send no `X-Frame-Options` and no `Content-Security-Policy`, so 21Board can
  show them. If they ever do, they must allow 21Board: `Content-Security-Policy: frame-ancestors 'self'
  https://boardapp.ccsd21.org` (add `https://tylerloch.github.io` for the test site), and no `X-Frame-Options`
  (it can't name another site). If 21Board's own host ever sends a CSP, it needs `frame-src
  https://sketchapp.ccsd21.org https://timerapp.ccsd21.org https://doccamapp.ccsd21.org`.
- **Camera (21DocCam).** Chrome asks for the camera on behalf of the page in the address bar,
  `boardapp.ccsd21.org`: its prompt names that site and remembers the answer for it. On managed devices, allow
  the camera for `https://boardapp.ccsd21.org` (Admin console: *Video input allowed URLs*, policy
  `VideoCaptureAllowedUrls`) as well as for `https://doccamapp.ccsd21.org` (the app on its own). Only the
  21DocCam window is given the camera.
- **What the windows allow:** the same sandbox as every widget (scripts, the app's own storage, forms, alerts
  and printing, pop-ups, downloads) plus fullscreen, the clipboard and sound, and the camera for 21DocCam.
  Tried with copies of the apps: saving PNG and project files, fullscreen, copying a picture, the camera, sound,
  alerts, printing and the app's own offline copy all work. The sandbox stops an app from taking 21Board's tab
  elsewhere; 21Board takes no messages from them and sends them none.
- **Kiosk.** They work in a kiosk 21Board like any widget, without *Open … on its own* (a kiosk can't open
  tabs). An app saves its offline copy only when its page loads, which in a kiosk happens only in its window:
  for a kiosk to use them offline, launch it online once **with each app's window open**, after that app's
  offline worker is deployed. The camera policy above applies to the kiosk's organizational unit too.
- The addresses are in `widgets/registry.js` (`external: true`; docs/WIDGET-SDK.md, "The district's own apps").
  They come only from there: a `.21board` file names the app, never an address. They aren't part of 21Board's
  offline copy or its release stamp.

## Board history (going back)

21Board keeps earlier versions of the board on the device, in a separate database from the board itself:
while the board changes (at most every 10 minutes, once it has settled for a minute), when 21Board opens,
when a widget's content is suddenly emptied (e.g. a note cleared), and before every risky action (Reset,
Delete, Close all, changing or removing the photo, Import, Load, going back, Erase everything). Identical
content is never saved twice. *Save this version now* keeps a named version until you delete it.

**Off** (Settings → *Save a version automatically*) stops the first three: nothing is saved while you work,
when 21Board opens or when a note is cleared. One is still saved before each risky action, so Undo keeps
working, and when you tap *Save this version now*. Versions already saved stay until you delete them.

**What's kept:** the newest 20, one an hour for 2 days, the first and last of each day for a month, one a week
for 3 months (counting only days the board was used, so a summer break doesn't empty it), safety versions for a
week, and the version before a big change for a month. Photos are stored once, and history stays within a share
of the device's storage. **Going back never changes this device's settings** (theme, accent) and a running
timer comes back paused. If going back can't finish, 21Board says why and the board stays as it was.
*Erase everything* keeps board history (so it can be undone; if the board as it is can't be kept first,
21Board asks before erasing); *Erase, including board history* doesn't.

**When the device runs out of space** (the browser refuses a save), history gives up a little at a time and
the save is tried again after each step, a few times at most: first the photos kept with older versions, then
the 10 oldest versions. The newest versions, the first and last of each of the last 7 days the board was used,
the versions you saved, the safety versions and the one before a big change are never given up for this. A
message says so once, and Settings → Board history shows *Space is low on this device*. (Chrome doesn't tell
a page how much space is left, so a refused save is the sign 21Board goes by.)

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

The *District apps* suite uses stand-ins for 21Sketch, 21Timer and 21DocCam; the tests never reach their real sites.

The tests check that the release stamp matches the files (`node tools/release.js --check`); if that fails,
run `node tools/release.js`. The *Updating* suites serve one release, then a changed one, and check the
prompt, *Update* in every open tab, that a device never runs part of each, and that an offline copy is
never lost to a clean-up (or is saved again if it is).

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
- `fonts/AtkinsonHyperlegible-Regular.woff2` and `-Bold.woff2`: *Atkinson Hyperlegible* 1.006 by the Braille
  Institute, under the SIL Open Font License 1.1 (`fonts/AtkinsonHyperlegible-OFL.txt`), for Settings → Letters →
  *Easier to read*. `tools/build-letter-fonts.py` makes them from the originals in the google/fonts repository:
  cut down to Latin letters (Basic Latin, Latin-1, Latin Extended-A) and the punctuation 21Board uses, WOFF2.
- `fonts/EarlyReaders-Regular.woff2` and `-Bold.woff2`: *Andika* 6.101 by SIL International, under the SIL Open
  Font License 1.1 (`fonts/EarlyReaders-OFL.txt`), for *Early readers*. Made the same way, and renamed
  “21Board Early Readers”: Andika is a Reserved Font Name, which a cut-down copy may not use. Its line height is
  brought down from 1.61 to 1.36 em (room for these letters' accents only). The four fonts add about 83 KB
  (92 KB with the licences) to the offline copy; a device fetches one only once it is chosen.
