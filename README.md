# 21Board

**Build your own suite of smartboard widgets**

21Board is a small operating system for the classroom smartboard. Open widgets from the Widget Picker in either
bottom corner and arrange them in windows. Your work is saved on the device, and you can export it to a file.
Widgets are built on their own and dropped in.

- Plain HTML, CSS, JavaScript, and SVG. **No libraries, build step, or server code.**
- Installable PWA that **works offline**
- **Private.** Your work is stored only on your device, and in your school Google Drive if you turn on Board Sync.
  21Board has no servers and no accounts.
- **Online only when needed.** For updates, district apps, videos, and the weather.
- Production: <https://boardapp.ccsd21.org>

---

## Try it

You don't need a server to try 21Board:

| Option | Setup | Works | Doesn't work |
| --- | --- | --- | --- |
| **Open `index.html` from disk** | Code → Download ZIP. Unzip it and open `index.html` in Chrome. | The Widget Picker, windows, every widget, saving, export and import, several tabs | Offline use and installing as an app. Both need `https://`. |
| **GitHub Pages** | Repo Settings → Pages → *Deploy from a branch* → the branch and `/ (root)` | Everything, offline and install too. An address the smartboard can open. | Nothing. Pages on a private repo needs a paid GitHub plan, and the site is public. |
| **Local web server** | `python3 -m http.server 8000` in the folder, open <http://localhost:8000> | Everything | — |

21Board uses only relative paths, so it works from a subfolder too, such as `https://example.org/21Board/`.

> **Keep test copies off the production host.** Browser storage is per site, so a test copy at
> `boardapp.ccsd21.org/preview/` would share teachers' real boards. Give staging a domain or subdomain of its own.

### Deploying

A release is a complete set of files with one name and one fingerprint. Before each upload:

1. **Change `VERSION` in `sw.js`.** It names the release with the date and a counter, such as `2026.11.12-1`.
2. **Run `node tools/release.js`.** It stamps `sw.js`, `board.js`, and `index.html` with the name and the *build*, a
   fingerprint of every file. Run it again after any change.
3. **Run the tests** with `node tests/run.js`. They fail if a file changed after the stamp.
4. **Upload every file together** to the static host.
   - **Leave out** `.git/`, `.claude/`, `.gitattributes`, `.gitignore`, `README.md`, `docs/`, `tests/`, `tools/`,
     `widgets/_template/`, and anything git ignores, such as `node_modules/` and `.DS_Store`. Never serve `.git/`:
     anyone could download the whole history.
   - **Upload everything else:** `index.html`, `board.js`, `sw.js`, `manifest.webmanifest`, `icons/`, `LICENSE`,
     `LICENSE-DOCS`, `fonts/` with its `-OFL.txt` licenses, `sdk/` with the lab and the dev window,
     `widgets/registry.js`, and every other folder in `widgets/`. These are the files `sw.js` lists. A device saves
     its offline copy only when every one arrives, so one missing file keeps every device from working offline.

On the host, serve `manifest.webmanifest` as `application/manifest+json`. Most servers already do. Serve `sw.js`
with `Cache-Control: no-cache` if you can. Serve every file exactly as it is in the repository, with no minifying or
rewriting.

What devices do with a release:

- A device keeps **one complete release** for offline use and runs only that. The page, `board.js`, the SDK, and the
  widgets always match. The device saves a release only when every file matches the stamp, so a half-finished
  upload, a dropped connection, or a Wi-Fi sign-in page can't leave it with part of one. Until then it keeps the
  release it has, and tries again every hour and each time 21Board starts.
- Once a new release is saved, open boards say **“A new version of 21Board is ready.”** with *Update* and *Later*.
  *Update* takes a second or two and restarts every open 21Board tab on the new release. The board and its content
  stay. With *Later*, or no answer, the new release takes over the next time 21Board starts, after every tab or the
  app has closed. In a kiosk, that's after Quit or a restart. Until then a dot stays on the ▦ buttons and the
  Settings gear, and Settings opens with *A new version is ready* and *Update now* at the top. After an update, the
  board says **“Updated to …”** once.
- **Settings → About** shows the release the device is running, by name and build, such as `21Board 2026.11.12-1
  (3fa9c1d2)`. Exported files carry the same text. Ask for it when you need to know which version someone has.
- **Uploaded without a new stamp?** If step 2 was skipped, devices that have 21Board keep their whole release.
  Devices new to it run from the network with no offline copy, and Settings says *Offline copy unavailable*. Nothing
  breaks, and the tests in step 3 catch it first. Skipping only step 1 is harmless. The build still changes, so
  devices update under the old name.
- A browser can drop a device's offline copy. 21Board saves it again the next time it starts online. Until then,
  Settings says *Saving an offline copy…* or *Offline copy unavailable* instead of *Ready to work offline*.
- **The exception:** a tab with no offline copy yet, such as a first visit whose copy couldn't be saved, loads each
  file from the server as it needs it. If a release goes up while that tab is open, widgets opened afterwards are
  the new ones. The tab offers *Update* once the device has saved the new release.

On a local server, the offline copy keeps serving the release it saved. To see a change, run `node
tools/release.js`, reload, and tap *Update* when it appears a few seconds later. Ctrl+Shift+R loads the page from
the server at once, but open widget windows still come from the saved copy. Reload again, or close and reopen the
widget.

---

## Using 21Board

| | |
| --- | --- |
| **Widget Picker** | The ▦ button in **either** bottom corner, so you can reach it from both sides of the board. Tap a widget to open it. Tap ▦ or anywhere else to close. |
| **Buttons** | The Widget Picker's bottom row: Paste, Export, Import, Lock, Full screen, and Settings. |
| **Pages** | A page for each lesson or part of the day, with its own windows, content, background, and name. The Widget Picker's bottom row ends with **‹ Page 2 of 3 ›**. ‹ and › go to the page before and after, and on the last page › is **+** for a new page. Tap *Page* for the Pages menu. Tap a page there to go to it, or choose **New page**, **Duplicate this page**, **Rename this page…**, **Move left / right**, or **Delete this page…**, which has Undo. A new page takes this page's size, shape, and background color. Every tab on the device shows the same page, and 21Board opens on the page it last showed. With Board Sync, every device has the same pages in the same order, and each shows its own page. Widgets on other pages don't run. A Timer shows the right time when you come back, but its alarm won't ring on another page. |
| **Move a window** | Drag its title bar. In widgets without typing, such as Timer, Calendar, and Dice, drag anywhere inside. In widgets with typing, such as Notes, drag inside with two fingers. The Video Player's video takes every tap, so move or bring forward its window by the title bar. Windows snap next to each other and resist overlapping. Keep pushing to overlap anyway. Two people can drag two windows at once. |
| **Resize** | Tap a window to select it, then drag the handles at its corners and the middle of each side. Edges snap to line up with nearby windows and to match their width or height. Some widgets keep a fixed shape. |
| **Select a window** | Tap anywhere on it. It comes forward and gets an outline in the accent color, a stronger title bar tint, and resize handles. Tap the empty board to deselect. |
| **Window menu** | Tap the widget's name ⌄ in the title bar for its own options, **Zoom to fill**, **Reset…**, and **Close**. 21Sketch, 21Timer, and 21DocCam swap **Reset…** for **Refresh** and **Open in new tab**. Double-tap the title bar to fill the board or restore the window. A tap that slides a little still counts as a tap. On a keyboard, Enter on the window's name opens the menu, the arrow keys move, Enter chooses, and Escape closes. |
| **Close a window** | Its content is kept. Open the widget again to pick up where you left off. Several of one widget come back in order: 1, 2, 3. |
| **Export** | *Full backup* saves everything, closed windows too. *Blank template* saves the layout and widget settings with no content, so it's safe to share with colleagues. With several pages, choose *All pages*, *This page*, or *This page as a blank template*. You get a `.21board` file. In Chrome and Edge on computers and Chromebooks, you choose where it goes, such as Google Drive. *Back up now* in Settings and the backup reminders always save every page. |
| **Import** | Pick a `.21board` file, or drop it on the board. The suggested choice is *Open as a new page*. The others are *Replace this page* and *Add to this page*. For a file of several pages, choose *Add these pages* or *Replace all pages*, which has Undo. *Replace this page* keeps the page itself and takes the file's theme, accent color, and text style, and says so when they differ. With Board Sync, the new windows, content, theme, accent color, and text style reach your other devices too. Its Undo puts back the page, theme, accent color, and text style it replaced. The other choices leave the theme, accent color, and text style alone. A Board Sync device file opens as a backup of every page. |
| **Paste** | Ctrl+V or ⌘V opens a copied picture in a new Picture window. A copied video link opens in a new Video Player. Dropping either on the board does the same. On a touch screen, tap *Paste* in the Widget Picker. An animation copied from a web page pastes as a still. Open or drop its file to keep it moving. |
| **Different screens** | The board is 16:9 and scales like a picture to fit any screen, so your layout looks the same on a laptop and the smartboard. In Settings, *Fill* lets the board take any window's shape, and you can change the size of windows and menus. |
| **Board history** | Undo a big change, or recover from a curious student. Settings → Classroom → **Board history…** lists earlier versions in a column beside Settings. Tap one to see it in a third column, with a small preview and what changed. *Go back* restores the whole board, and can be undone. *Put back* brings back one window. Undo also appears after Reset, Delete, Close all, and Import. An empty board offers *Go back to an earlier version*. Each window's menu has *Go back…*, for that window's earlier versions. |
| **Lock** | Tap **Lock** in the Widget Picker, then choose. *Lock everything*: nothing on the board responds. Timers and videos keep going. *Widgets still work*: windows can't move, resize, or close, and widgets can still be used. Either way ▦ stays put and won't open. A tap says “The board is locked.” A 🔒 sits in the top corner above each ▦. To unlock, hold 🔒 for 2 seconds. A quick tap shows *Hold to unlock*. On a keyboard, press Enter on 🔒, then *Unlock*. Every tab on this device locks and unlocks together. Messages show without their buttons. Under *Widgets still work*, a file dropped on the board asks to unlock first. *Lock everything* refuses it. |
| **Kiosk mode** | For a ChromeOS kiosk with no sign-in, add `?kiosk=yes` to the address. Full screen and Board Sync go away, and a red ✕ Quit follows the Settings gear. See [Kiosk mode](#kiosk-mode). |
| **Several tabs** | 21Board tabs and windows on one computer stay in sync. |
| **Updates** | When a new version is ready, a message offers *Update* or *Later*. *Update* takes a second or two, and the board and its content stay as they are. Otherwise the new version takes over the next time 21Board starts. Until then, a dot shows on ▦ and the Settings gear, and *Update now* is at the top of Settings. After an update, the board says “Updated to …” once. Settings → About shows the version in use. |

A right-click or a long press shows no browser menu, except on links and in text boxes. Developer mode brings it
back. District apps and videos keep their own.

**For IT:** *Paste* asks once to see the clipboard. The Chrome policy `ClipboardAllowedForUrls` with
`https://boardapp.ccsd21.org` allows it ahead of time. Ctrl+V never asks.

### Settings

The gear in either Widget Picker opens Settings on that side. Rows marked ▸ are groups. Each shows what it's set to,
such as a small preview, "Standard", or "3 windows". It opens below its row, which stays put. Groups start closed each
time Settings opens.

- **At the top, when needed:** a save problem with *Back up now*, or *A new version is ready* with *Update now*.
- **Board Sync**, in Chrome and Edge: one board on all your devices, the smartboard too, through a folder in your
  school Google Drive. *Set up…* shows how to make the folder, then you pick it. Once linked, it has three rows: the
  folder and how syncing is going, with *Change…* and *Unlink*; this device's name; and *Keep history copies in the
  folder*. When the board can't sync, it says what's wrong. Not in kiosk mode, the dev window, or browsers without it.
  See [Board Sync](#board-sync).
- **Classroom**
  - **Go back to an earlier version:** *Board history…* opens beside Settings, which stays open. Tap it again to
    close it. A line here says when history is paused or short of space. See
    [Board history](#board-history).
  - **Close all windows** on this page. Their content is kept.
  - **Stay awake:** a switch that keeps the Chromebook, iPad, or panel from dimming and sleeping while 21Board is on
    screen. It uses the browser's screen wake lock. A screen that never sleeps never locks, so while it's on,
    Settings warns *This makes your account less secure.* Kiosks skip the warning, since no one is signed in. A line
    says when it can't work: in an older browser, when 21Board isn't served over https, or on a device that doesn't
    allow it. IT can turn it off by policy. It needs Chrome 84 or later, or Safari 16.4 or later. As a Home Screen
    app, it needs Safari 18.4 or later. This device only. An old *School hours* setting reads as on.
- **This page ▸ Windows:** how many windows this page has, open or closed. Open the group to see each one, with Open
  and Delete. To rename the page, use ‹ Page › → *Rename this page…*.
- **Appearance**
  - **Theme:** Light, Dark, or Auto, the default, which follows the device's light or dark setting. With Board Sync,
    on all your devices.
  - **Background ▸** for this page. Match the theme, or pick a color. Light: White, Paper, Sky, Mint, Blush, and
    Lavender. Dark: Slate, Chalkboard, Navy, and Black. *Custom…* picks any color, and *Photo…* adds a photo. Once
    added, *Photo* is a choice with a tiny picture. Picking a color hides the photo and keeps it, and picking
    *Photo* shows it again. While it shows, tap its picture to choose what stays in view, and choose *Fill the
    board* or *Whole photo*, the fade, *Change…*, or *Remove*. The device and full backups keep the photo. Templates
    don't.
  - **Accent color:** Blue, Purple, Rose, Orange, Green, Slate, or *Custom…* for any color. A custom color adjusts to
    stay readable in Light and Dark. The accent colors widgets and tints every title bar. With Board Sync, on all
    your devices. A board that had Pink or Teal is now Blue.
  - **Text style ▸** for 21Board and its widgets. *Standard* uses the device's own font. *Easier to read* uses
    Atkinson Hyperlegible, made for low vision, where I, l, and 1 all differ and 0 has a line through it. *Early
    readers* uses Andika by SIL, with a and g the way children learn to write them. They're for easier reading.
    Neither is a dyslexia font. Notes' Chalkboard and Whiteboard keep their own lettering. With Board Sync, on all
    your devices. Before 2026.11.17-2 it was called *Letters* and stayed on each device.
  - **Board shape** for this page: *Widescreen*, the default, is 16:9 and the same on every screen. *Fill* uses the
    whole window. See [Board shape and size](#board-shape-and-size).
- **Advanced ▸** shows an amber dot when a backup is overdue: none for a week, or none yet after a week with windows
  on any page. *Back up every page* inside has the dot too. *Back up now* clears it, and so does Board Sync writing
  this device's file. Whether the browser will keep 21Board's data shows inside, under *Protected storage*, not as
  a dot.
  - **Widget Picker:** both corners, or only left or right.
  - **Clock in the corner:** *On*, *Off*, or *Auto*, the default. It shows the time and date beside the bottom right
    ▦, or beside the only ▦ when the Widget Picker is in one corner. *Auto* shows it only in full screen, where the
    device's own clock is hidden. That's ⛶ Full screen, F11, the Chromebook's full screen key, and kiosk mode.
    Taps go through it. It hides while that corner's Widget Picker is open. In a narrow window it shows only the
    time, or nothing. This device only. Before 2026.11.18-1 it was in Appearance. *Time and date*, the old default,
    now reads as *Auto*, and *Time* as *On*.
  - **Size of windows and menus** for this page. The default is 80%.
  - **Moving windows:** *Windows stop at each other's edges* and *Drag windows from inside*. The first sets how hard
    you push to overlap windows: Off, Light, Medium, or Firm.
  - **Board history:** *Save a version automatically*, set to every 10 minutes while the board changes, every hour,
    once a day, or off. Below it, *Delete all versions*.
  - **Backups and storage:** *Back up every page*, with *Back up now* and when you last backed up. Whether 21Board
    works offline. *Protected storage*, which says whether the browser will keep 21Board's data, with *Install app*
    when that would help. Storage used, kiosk mode, and *Erase everything* for every page.
  - **Developer:** Developer mode adds the SDK Playground and *Test a widget*, which runs an unregistered widget
    from a file you upload.
- **About ▸** shows the version on its row. Inside: the 21 gear, who made 21Board, the version, where your work is
  stored, the licenses in full, credits, and the goat. The dev window shows only the version and where your
  work is stored.

Background patterns, from Dots to Graph paper, are off for now. Each page keeps its choice. To bring them back,
uncomment the parts marked "Patterns" in `board.js` and `index.html`.

---

## Project layout

```
index.html              Board shell: markup + all CSS
board.js                Board shell logic (storage, sync, windows, picker, settings, export/import)
sw.js                   Service worker (offline copy, updates)  ← bump VERSION, run tools/release.js
manifest.webmanifest    PWA manifest; lets the installed app open .21board files in Chrome
icons/                  App icons (192 and 512 px), the 21 gear, and the goat (Settings → About)
fonts/                  Text style fonts (Settings → Appearance), saved offline, loaded only once chosen
sdk/board21.js          The SDK every widget includes (window.Board21)
sdk/board21-dev.js      The dev window: a widget opened outside 21Board runs in the real board
sdk/dev/board-shell.js  index.html's markup for the dev window (made by tools/build-sdk.js)
sdk/lab.html            Widget lab: paste a widget's HTML and try it in a real window
widgets/registry.js     The list of widgets, for the Widget Picker and the offline copy
widgets/<id>/index.html One folder per widget
widgets/_template/      Starter for new widgets, not registered
docs/WIDGET-SDK.md      How to build a widget; SDK reference; submission checklist
docs/AI-PROMPT.md       A prompt for staff building a widget with an AI tool such as Gemini, ChatGPT, or Claude
docs/DATA-FORMAT.md     IndexedDB layout, sync protocol, .21board file format
docs/ROADMAP.md         Big changes saved for later: shared widget storage, telling copies of a widget apart, other languages
docs/RELEASING.md       The steps for every release
LICENSE                 Apache License 2.0 (the code)
LICENSE-DOCS            CC BY 4.0 (the documentation)
NOTICE                  Copyright and credits that copies keep
tools/release.js        Stamps a release with its name and build. See Deploying.
tools/test-halves.js    Runs tests/run.js as two halves at once. See Tests.
tools/ci-wait.js        Waits for GitHub to test a push and prints the failures. See Tests.
tools/release-workflow.js  Builds, reviews, and fixes a release with Claude Code. See docs/RELEASING.md.
tests/run.js            Runs the browser tests. See Tests.
tests/suites/<area>.js  The browser tests, one file per area, such as calculator.js or board-sync.js
tests/lib.js            What the suites share: ok(), page helpers, fixtures, and stand-in sites
tests/timings.json      How long each suite takes, to split the tests evenly
.github/workflows/tests.yml  Runs the tests on GitHub for every push. See Tests.
```

### Included widgets

| Widget | Shows off |
| --- | --- |
| **Timer** | Wall-clock state that stays in sync across tabs, `requestAttention`, checkable menu items; six alarm sounds made with Web Audio, with no sound files. It turns amber near the end, 1 minute by default. The warning is worked out on every render and never saved |
| **Stopwatch** | Wall-clock time and laps kept in step across tabs. Start, Stop, and Lap act when the finger lands and never move the window. A Start held 2 seconds stops the run when the finger lifts. No setting moves Lap or Stop. Lap list grows a small window with `setMinSize` and scrolls by touch. Beat the record keeps the earlier records, so Bring back never loses one. A run races the best time chosen at Start. Records are content, so templates never carry them |
| **Task Timer** | A schedule of activities as a pie with a countdown kept in step across tabs; a repeating alarm set ahead on the sound's own clock, rung by one copy of the board |
| **Calendar** | Month view with today highlighted; week can start on Sunday or Monday |
| **Clock** | Simple, Old, and Teaching faces, and an LCD look that glows as LED look in dark theme. Style has Analog, Digital, and Date, in any mix. The clock face items and Mark a time show only with Analog. Analog and digital sit side by side when wide and stacked when tall. The date goes beside or under them, as a stack or one line, whichever keeps the clocks biggest. Two or three views have no shape lock. Alone, the lock changes at runtime: 1:1 for analog and 2.2:1 for digital or the date, each taller with Time written out as words. With Choose the time, drag geared hands or tap ▲ and ▼. The set time is saved as content. Mark a time shades the face to the teacher's mark, or to the end of the running timer that ends soonest, from the board's `timers` event. Quiz hides the digital time until it's tapped, and never saves that. Time written out as words puts the time under the clock |
| **Notes** | Text that grows to fill the note, tappable web links, colors and the Chalkboard and Whiteboard themes with bundled hand-drawn fonts, live text sync that keeps the cursor |
| **Name Picker** | Student names kept as *content*, so templates never include them. Seven styles, each in its own file: Big name, Spinning wheel, Spotlight, Lotto, Versus, Groups, and Bracket. One to six names at a time, set in the window menu and kept by templates. Versus picks two students to face off, with a drumroll and one of five VS looks. Groups puts the class into 2 to 6 random groups. Bracket draws the class into a tournament, and a tap moves each winner on. The pick, the groups, and the bracket are drawn and saved before the show, so every open copy lands on the same names |
| **First/Then Board** | Picture-card schedule for students: a card picker with search, done marks, seasonal themes, a chime made with Web Audio |
| **Zones Check-In** | Check-ins kept as *content*, so templates never carry them. A tap counts when the finger lifts, so two students tapping at once both count. "−" and Undo, the last 20 changes. Clear each day, by the device's date. A face beside each feeling word, and an Ideas view with a breathing circle. The four zones sit in one row once the window is about 830 px wide and wider than it is tall, and always when it fills a board at least 850 × 480 px. The cards keep clear of the board's own buttons |
| **Dice** | Responsive SVG sizing; blank dice tumble in 3D and land on the saved values in every open copy |
| **Traffic Light** | Turns sideways in a window wider than tall, and keeps its shape in any window. Follow timers shows the color of the Timer or 21Timer closest to ending, from the board's `timers` event. That color is worked out in every tab and never saved. Title status text |
| **Video Player** | A YouTube, Google Drive, or Vimeo video from its link. A link pasted or dropped on the board opens one too. The board reads it with the widget's own `video-links.js`. YouTube, Google Drive, and Vimeo see what they would on their own sites: the video, the device, and any account signed in. YouTube and Vimeo also see the board's address. Controls in the window menu, since nothing may cover the player. A History of the last 5 videos, kept in the content and titled by YouTube's and Vimeo's oEmbed without cookies. Clear of the board's corner buttons when it fills the board (`corners`). Never under 200 × 200 px on screen (`zoom`). A message when offline |
| **Picture** | A picture opened, pasted, or dropped on the board. PNG, JPEG, GIF, WebP, or AVIF, animations too. An SVG is drawn as a picture, so nothing in it runs. Kept in the window's content. A still over 1 MB or 3840 px is redrawn as a WebP, 2560 px at most. An animation is kept as it is, up to 5 MB. The window takes the picture's shape. *Whole picture* or *Crop to fill* in its menu. Board history keeps each picture once |
| **Calculator** | Its math in one engine, `calc-engine.js`, with its own Node tests. Every menu setting kept in the window's config. The window widens for History, grows for Advanced keys, and gives the room back (`setSize`). The canvas sits beside the keys or above them, and History beside them or across the top, whichever makes the keys bigger. See [Calculator](#calculator) |
| **Weather** | Forecast and air quality from Open-Meteo, and the weather right now, watches, and warnings from the National Weather Service, with plain `fetch()`. They see the place, the device's Internet address, and the board's address. No cookies. Each part asks on its own clock, only while the window shows, and never on a timer from 8 PM to 6 AM. Sun, moon, and school days worked out on the device. Four layouts by the window's size. Every menu setting and the place kept in the window's config. The 7 days and what to wear from the last forecast kept as content, saved only when they'd look different, and shown offline (`clash: 'later'`). See [Weather](#weather) |
| **21Sketch** | The district's drawing app, live from sketchapp.ccsd21.org: a window that points to another site (`external`), one window only (`single`). See [District apps](#district-apps) |
| **21Timer** | The district's classroom timer, live from timerapp.ccsd21.org, with its own themes and sounds |
| **21DocCam** | The district's document camera, live from doccamapp.ccsd21.org: the one window allowed the camera |
| **SDK Playground** | Developer mode only. Run any SDK call with your own values and copy its code. Watch the window's state, the palette, and every event |

---

## Adding a widget

1. Copy `widgets/_template/` to `widgets/<id>/` and build it (see **[docs/WIDGET-SDK.md](docs/WIDGET-SDK.md)**).
2. Add an entry to `widgets/registry.js` listing every file it needs.
3. Change `VERSION` in `sw.js` and run `node tools/release.js`. See [Deploying](#deploying).

To try a widget, open its file in a browser. It appears in the **dev window**: a real 21Board window with its title
bar, resize handles, menu, and Settings, plus panels for its saved data, its messages, and common problems. This works
in AI tools' previews too, such as Gemini Canvas, and in `sdk/lab.html`, where you paste the HTML. To have an AI
tool write a widget, start with the prompt in [docs/AI-PROMPT.md](docs/AI-PROMPT.md). See
[docs/WIDGET-SDK.md, "Testing a widget"](docs/WIDGET-SDK.md#testing-a-widget).

To try a widget file in your own board, go to Settings → Advanced → Developer mode → *Test a widget* → **Upload
file…**. A test widget can't reach your boards' data. It stays on this device only, never in exports, Board
history, or the Google Drive folder, and it works offline. Upload it again to see an edit. If one freezes 21Board,
add `?nodev` to the end of 21Board's address. No test widget starts, and you can remove it in Settings. See
[docs/WIDGET-SDK.md, "Inside 21Board"](docs/WIDGET-SDK.md#inside-21board).

---

## How your work is stored

See **[docs/DATA-FORMAT.md](docs/DATA-FORMAT.md)**. In short, one IndexedDB object store holds small JSON records:
the settings, the board, and for every widget window an instance record with its position, size, and whether it's
open, plus its content and its config. Each window of a widget has its own instance number and data. Other open
copies of 21Board hear of every change and re-read only what changed.

When a device runs low on space, the browser can clear a site's storage unless it has granted *persistent storage*.
No page can force that. 21Board asks each time it starts and again later, and the browser decides. Chrome and Edge
weigh signals such as whether the app is **installed**, so installing 21Board, or force-installing it on managed
devices, is the surest way to get it. Safari may delete data from sites not visited in 7 days unless they're on the
Home Screen or Dock. While storage isn't protected, Settings says so and 21Board reminds teachers to back up, at
most every 3 days. **Regular exports are still the real backup.**

### The installed app

Installed, 21Board opens in its own window and **opens maximized**. The window fills the screen as 21Board starts.
On a Chromebook with Chrome 155 or later, the first tap then maximizes it for real. Other computers get this in a
later Chrome. The first time, Chrome asks whether boardapp.ccsd21.org may *Manage windows on all your displays*, and
remembers the answer. With *Block*, or an older Chrome, the window still fills the screen. This happens each time
21Board starts, not when it updates or reloads. A window you resize or move stays as you left it. Not in a browser
tab or kiosk mode.

**For IT:** the Chrome policy `WindowManagementAllowedForUrls` with `https://boardapp.ccsd21.org` grants the
permission ahead of time, so Chrome never asks. Where it's blocked (`DefaultWindowManagementSetting` set to 2, or
`WindowManagementBlockedForUrls`), or Chrome doesn't offer it yet, the window just fills the screen.

### If the board can't be opened or saved

- **The board can't be opened.** If the device's storage doesn't answer or can't be read, or 21Board fails to start,
  21Board says so and offers *Try again*. It never shows an empty board instead. Nothing is saved until the stored
  board is read, so an empty board never replaces one that failed to open. *Use 21Board without saving* gives an
  empty board for the lesson, kept until 21Board closes. Board history still works there, so you can bring back an
  earlier version and export it, and *Erase* only empties the board on screen. If one record can't be read, usually
  a big one such as the background photo, the rest of the board opens and a message says what's missing.
- **A save fails,** such as when the device is full. The change stays on the board, and 21Board tries again with the
  next change, after 5 seconds, then every 30. Until everything is saved, a **Not saved** note stays above the ▦
  buttons. Tap it for the reason, *Try again now*, and *Export a backup*. Settings says the same at the top. When the
  device is out of space, 21Board first makes a little room in [Board history](#board-history) and tries
  again. A record that doesn't fit, such as a very long note or the photo, doesn't hold back the other changes.
  *Export a backup* works from what's on screen, so it doesn't need the device's storage.
- **The device loses what was saved while 21Board is open.** Chrome can throw storage away after the disk fills up.
  21Board notices and writes the whole board back. Until that works, **Not saved** stays on. If it happens while
  21Board is closed, the board starts empty. Board history's copies in the Google Drive folder, and exported
  backups, bring it back.
- **The browser blocks storage,** as some private windows do, or with site data turned off. The board works for that
  session, **Not saved** stays on, and Export still saves a backup file.

---

## Board Sync

Build the board on your laptop and show it on the smartboard. Every page stays the same on every device, by itself.
Board Sync never talks to Google itself. ChromeOS already keeps **Google Drive › My Drive** the same on every
Chromebook you sign in to, and 21Board keeps its files in a folder there that you choose.

**Set it up once on each device,** laptop and smartboard: Settings → **Board Sync** → *Set up…*. A dialog shows what
Board Sync does and how to make its folder, with a picture. *Choose folder…* opens Chrome's folder picker:

1. Go to **Google Drive › My Drive**.
2. The first time, tap *New folder* and name it **21Board**. On your other device, pick this same folder. To share a
   board with a co-teacher, share the folder with them as an Editor. They add a shortcut to it in their My Drive,
   then pick it.
3. Open the folder, then tap *Select* or *Open*, and *Allow*.

21Board catches the usual slips. Pick My Drive itself, and it offers to make a 21Board folder or use the one there.
Pick the *Board history* or *Photos* folder inside, and it points to the folder around it. Pick a folder holding two
21Board folders, such as `21Board` and `21Board (1)` made by two devices at once, and it asks which.

**The last step** says what linking did, then asks for **This device’s name**. 21Board fills in a guess: *the
smartboard* on a large touch screen, otherwise *a Chromebook* or *a computer*. Tap *Laptop*, *Smartboard*, or
*Desktop* for *the laptop*, *the smartboard*, or *the desktop*, or type your own, such as "Room 14 smartboard". The
button that matches the name is selected. Your other devices use the name, as in "Updated from the laptop." If
another device in the folder already has that name, the step says so. *Done*, Enter, Escape, or a tap outside all
keep the name in the field. An empty field keeps the old name. This device's file in the folder takes the new name
the next time it's written. On a touch screen, tap the field to bring up the keyboard. You can change the name later
in Settings → Board Sync.

**What happens when you link a folder.** The last step says which of these happened, and ends with "Changes on any
of your devices show up on the others, usually within a minute."

- **An empty folder:** this device's board goes there at once, with its theme, accent color, and text style. A device
  with only its untouched first page, "Page 1", writes nothing yet, and takes the board from your other device. If
  two or three devices set up the same folder before Google Drive has carried one's file to the others, a theme,
  accent color, or text style chosen on any of them wins on all. The defaults never replace a choice.
- **A folder with a board, on a device that has never synced:** this device shows the board, in its theme, accent
  color, and text style. This device's own pages go after the board's: "This device’s 2 pages were added at the end."
  A page both have, from the same import, keeps the folder's values, and this device's different content stays
  beside it as a copy. This device's own theme, accent color, and text style don't count as a change, so they never
  replace the board's.
- **A folder with another board,** after *Change…* to another class's folder, or after *Unlink* and linking a
  different folder: this device switches to that board, and to its theme, accent color, and text style. Its own pages
  stay in the other folder, and under Board history › Deleted pages for 30 days. Two boards are never combined.
  Before it leaves, *Change…* writes this device's file once more, with the work done here since its last write and
  a note that it left, as *Unlink* does. So the devices still on that folder get the work and stop listing this one.
  When both folders have the same name, the last step says "…the “21Board” folder this device used before".
  Switching back within 20 seconds, while Undo for the pages it left is still offered, waits until that Undo is
  gone, so those pages come back with the work this device's file there holds.
- **The same folder again,** after *Unlink*, or after the folder was renamed or moved: it carries on. Changes made
  here while unlinked join the board, a theme, accent color, or text style too. If another device chose one since,
  the later choice wins. Nothing is deleted anywhere because of how this device looked while it wasn't syncing.
- **Google Drive still bringing the folder or its files:** it links anyway. Nothing is merged or written until the
  files can be read, up to 10 minutes, so a slow Drive can never combine two boards. A theme, accent color, or text
  style chosen here meanwhile is replaced by the board's when it arrives, as on any device that hasn't synced with
  the folder yet. Choose it again once the board is here.

**Then it just syncs.** This device writes its file a few seconds after you change something, at most every 20
seconds while changes keep coming, and at once when 21Board is hidden or the lid closes. While 21Board is in front,
it looks for the other devices' files every 5 seconds and merges what changed. A look that finds nothing new does
nothing more. Nothing is read, written, or redrawn until a file changes, or something held back, such as a window
being typed in, is due again.

- **Part by part:** a page's name, background, size, place, and photo merge separately, and so do each window's
  place, whether it's open, its content, and its settings. A window moved on the laptop and typed in on the
  smartboard keeps both changes. Changes to different windows never clash.
- **The same content changed on both,** such as two edits to one note: both are kept. The later one stays in the
  window, and the other appears beside it as a labeled copy, "Copy · 9:41 AM". For the Timer, Stopwatch, Clock, Dice,
  Traffic Light, Video Player, Picture, Calculator, and Weather, the later one wins. For the Video Player that includes
  its History, so a video added on the other device meanwhile drops out, and Board history keeps it. Anything else
  changed on both, such as a window moved on both, takes the later change, and Board history keeps a version from
  before it.
- **Deleting** a page or window on any device deletes it everywhere, with Undo and Board history. An edit on a
  device that hadn't seen the deletion yet brings it back, so no one's work disappears unseen. A page brought back
  on one device, by its Undo or Board history › Deleted pages › *Bring back*, comes back on the others, which say
  so: "“Math” was brought back on the smartboard."
- **Never under your hands:** nothing moves while you drag, while a menu or dialog is open, or in a window being
  typed in. The change lands a moment later. A window menu left open for a minute closes.
- **The page shown** says "Updated from the laptop." with Undo. A new message comes at most once a minute, and the
  one showing updates in place. Other pages change quietly, and say so once when you next go to them, with when they
  changed there. **Undo** puts the page back on every device. While the board is locked, merges still apply, since
  Lock is for hands on this screen and your own changes from another device still count. They come without Undo, and
  locking takes away an Undo already shown. A clash where your text stayed in the window says so without Undo,
  because the other device kept its own version as the copy. Several pages deleted at once on another device make
  one message, "3 pages were deleted on the laptop.", with one Undo that leaves you on the page you're on.
- **Theme, accent color, and text style belong to the board.** The latest choice, made on any device, shows on all of
  them at once, in every tab, even while the board is locked. Set the laptop to Dark and the smartboard turns dark.
  Choose Early readers on the laptop, and the smartboard's text and widgets change too. If Settings is open, it shows
  the new choice in place without being redrawn. The device that shows the change says who made it, in one message:
  "The laptop changed the theme to Dark and the accent color to Green.", "The laptop changed the text style to “Early
  readers”.", or "The laptop changed the accent color to a custom one." There's no Undo, since changing it back in
  Settings is one tap, and syncs. Auto stays Auto everywhere, so each device follows its own light or dark setting.
  A device that only ever had the defaults, or the folder's, never replaces another's choice. A choice made while
  unlinked counts when the same folder is linked again, and of two made apart, the later wins on every device. Board
  history never changes them, and neither does Undo on an "Updated from…" message. A device still on 2026.11.16-4
  doesn't know the text style. It keeps its own, and changes nobody's, until it updates. Then each device keeps its
  text style until one is chosen on any of your devices, or takes one already chosen on another updated device. A
  device on a release before 2026.11.18-2 shows Blue for a custom accent color until it updates. The page shown,
  Lock, Stay awake, the clock, and the Widget Picker's corners stay on each device. Settings says "On all your
  devices." beside Theme, Accent color, and Text style, "This device only." beside Stay awake and the clock,
  and "This page, on all your devices." beside the page's own settings.

**Settings → Board Sync** has three rows:

- **Synced through “21Board”** says how syncing is going, with *Change…* and *Unlink*. For example: "Up to date.
  This device’s latest changes went to your folder at 9:42 AM. Shared with the smartboard. Last change at 9:40 AM."
  It says "Not synced. …" while changes made here can't be written. Once the only other device has left the folder,
  it says which one, and when.
- **This device’s name** shows on your other devices and in this device's file name.
- **Keep history copies in the folder.**

"Syncing…" shows after the folder's name while changes made here are on their way. It also shows for a moment after
a change from another device arrives, while this device rewrites its own file, which holds the whole board. It sits
on the title line, never the line below, so the rows under Board Sync stay put as changes come and go. Its space is
kept while it's hidden, and a long folder name ends in "…". Only a new day moves the rows, once: times from the day
before read "on Nov 16 at 3:00 PM" until the day's first change. The status line and "Syncing…" update in place, so
Settings isn't redrawn under a screen reader or a name being typed, and "Syncing…" isn't announced each time.
Settings also isn't redrawn for changes it doesn't show, such as a deleted page gone for good or a Board history
copy written to the folder.

**What's in the folder:**

- **One file per device**, named after it: `21Board (laptop) [k3j9].21board`. Each holds the whole board as that
  device has it. Import opens it, with its pictures from Photos. No file ever has two writers, so Google Drive can't
  drop one of two saves made seconds apart. A laptop closed overnight still brings the evening's work to the
  smartboard in the morning.
- **Photos:** one copy of each background photo and each picture in a window, named by its content. Device files
  and Board history copies only name them. Each picture uploads once. A picture can arrive after the board. Until it
  does, the page keeps its photo and the window keeps what it shows. A new window waits for its picture. After 10
  minutes, Settings says the picture is still arriving. Pictures no file names any more are deleted after about a
  week. 21Board also reads a second `Photos (1)` or `Board history (1)` folder if Google Drive makes one.
- **Board history:** copies of this device's own changes, about one an hour.
- **About this folder.txt** explains what's in the folder.
- A file that is half-delivered, mixes old and new bytes, or is older than one already merged is never merged. The
  status says when one has been arriving for a while. When a file in the folder comes from a newer 21Board, this
  device shows **Update 21Board** on the board, with an Update button once the update has downloaded. It merges
  nothing from that file until it updates. A folder holding only such a file doesn't get this device's board
  meanwhile, so two boards are never combined. A device on 2026.11.18-14 or earlier shows **Update 21Board** once a
  device in the folder has 2026.11.18-15.

**Unlink**, in Settings → Board Sync, writes this device's file once more to say it left, then stops. The board
stays here, and linking the same folder again carries on. The other devices delete an unlinked device's file two
months later, so a laptop put away for the summer still has its file in September. **Erase everything** leaves the
same note in its file, and this device forgets the folder.

A page deleted just before *Change…*, *Unlink*, or *Erase everything*, while its Undo is still offered, is deleted on
the devices still on that folder too. What its Undo does afterwards:

- **After *Change…*,** it brings the page back into the new folder's board. Tapped while *Change…* is still
  switching, it waits until that board is here.
- **After *Unlink*,** it brings the page back here only. The other devices get it back once this device links the
  folder again: "“Math” was brought back on the laptop." If this device sets up another folder that has a board
  instead, it switches to that board, and the last step says that “Math” was deleted in the folder it left.
- **After *Erase everything*,** it can't be undone. Board history › Deleted pages on the other devices has it.

**If the board can't sync,** a small note stays above the ▦ button until it can:

- *Reconnect folder*: Chrome wants permission again. One tap.
- *Folder unavailable*: the folder can't be found. 21Board keeps looking.
- *Not synced*: this device's changes can't be written, because there's no room or the board is too big. Tap it to
  see what to do. 21Board keeps trying.
- *Update 21Board*.

A folder you can only view still shows your other devices' changes. *Not synced* appears only once you change
something here.

Board Sync works in Chrome and Edge. Safari and Firefox keep Export and Import. Drive needs the Internet to carry
the files, which usually takes seconds to a minute. Chrome remembers the folder permission for an installed 21Board.
In a plain tab it may ask again after a restart, unless you choose *Allow on every visit*. The files can include
student names and class photos, so share the folder only with people who should see them. Every device must run a
release with this Board Sync, since an older one can't read the device files.

**For IT:** nothing to set up in the Google Admin console. Leave these as they are:

- Google Drive on for teachers, with `DriveDisabled` not set.
- Chrome's file-access policies, `DefaultFileSystemReadGuardSetting` and `DefaultFileSystemWriteGuardSetting`, not
  set to *Block*. Or add the 21Board site to `FileSystemReadAskForUrls` and `FileSystemWriteAskForUrls`. No policy
  can grant the permission ahead of time, so each teacher taps Allow once per device.

Smartboards signed in with a room or shared account need the folder shared with that account, or a shared drive.
Force-installing 21Board keeps the permission across restarts. Optional: mark the folder *Available offline* on
smartboards.

**Before rollout, try it on a few real laptops and smartboards.** Check how quickly files arrive, that the folder
stays allowed after a reboot, how a file shows up before Drive has brought its content, and how DriveFS records a
file written again. If it records a deleted file plus a new one, instead of a new revision, each write leaves a
board in Drive's trash.

## Kiosk mode

For a ChromeOS kiosk app, where no one signs in, open 21Board with **`?kiosk=yes`**, such as
`https://boardapp.ccsd21.org/?kiosk=yes`.

- The Widget Picker has no Full screen, since a kiosk is always full screen. It ends with **Quit**, a red ✕ after
  the Settings gear. Quit asks first, waits until everything is saved, then closes the app with `window.close()`, as
  21Sketch does. On ChromeOS that ends the kiosk session. An auto-launched kiosk starts 21Board again, and one
  started from **Apps** goes back to the sign-in screen. A page can close itself only if it hasn't navigated. If it
  can't, Quit says so.
- Left out: Board Sync, since a kiosk has no Google account; the install prompt; Developer mode; and backup
  reminders. No one is signed in to act on a reminder, and IT decides whether a kiosk keeps its data, in step 3
  below. Settings says it's in kiosk mode.
- **Import and Export** stay. ChromeOS shows its Files dialog in kiosk sessions too, so files can be saved to and
  opened from the kiosk's own storage or a USB drive. Export always uses the Save dialog, since a plain download
  would land unseen in the kiosk's Downloads. Settings keeps **Back up now**, and *Erase everything* offers *Export
  a backup first*, as everywhere else. A backup on a USB drive is the only copy off the kiosk.
- Links in Notes show as plain text, since a kiosk can't open new windows. For the same reason, the window menus of
  the [district apps](#district-apps) have no *Open in new tab*, the Video Player's has no *Open in …*, and
  Weather's has no *Forecast from Open-Meteo*.
- No one is signed in, so a Google Drive video plays only if it's shared with *Anyone with the link*.
- Everything else works as usual: widgets, saving on the device, Board history, and Undo. Widgets can check
  `Board21.context.kiosk`. Without the parameter, or with `?kiosk=no`, nothing changes.
- Updates arrive as everywhere else. The board offers *Update* or *Later*, and the new version takes over by itself
  the next time the kiosk starts. See [Deploying](#deploying).

**Admin console setup.** It follows Google's documentation and Chromium's source, so try it on one device first.

1. Devices → Chrome → Apps & extensions → **Kiosks** → choose the organizational unit → Add → **Add by URL** →
   `https://boardapp.ccsd21.org/?kiosk=yes`, exactly, with no redirects. **Never change this URL.** The kiosk's
   saved boards belong to it and are deleted with it.
2. Optional: set **Auto-launch app** to 21Board. Otherwise it's started from **Apps** at the bottom left of the
   sign-in screen. Changes apply after the device restarts.
3. To keep the boards between sessions, this OU's Device settings → *User data* must not be "Erase all local user
   data", unless the kiosk account itself is set to keep its data.
4. Launch it the first time while online and leave it open for a minute, so its offline copy is complete. Leave the
   kiosk web app offline setting on, its default.
5. Keep **Kiosk troubleshooting tools** off, since an open developer tools window keeps the session going after
   Quit. Leave *new windows in kiosk* off too. Optional: turn off pinch-to-zoom for touch panels.
6. For Import, Export, or a Picture window's *Open…*, don't block USB drives, downloads, or file-system access for
   this OU.

Then check on a real device: Quit, both auto-launched and from Apps; Import and Export to the device and to USB;
typing on a touch-only panel; and that the board is still there after airplane mode and a restart.

## Calculator

A calculator for the front of the room. The problem fills a big canvas, as a textbook writes it. Its steps play one at
a time. The keys sit beside it, with ÷ × − + = down the right. In a tall or narrow window, the canvas moves above them.

**Desmos's math.** Teachers use Desmos, so the Calculator works problems out the same way. % means "% of", so 10% of
50 = 5. Where Desmos says "undefined", the Calculator says what went wrong, such as "Can't divide by 0". Another =
repeats the last step, so 5 + 5 = = = counts by 5s. A faint comma groups the digits, as in 1,234,567.

**The window menu.** Each window keeps its own settings.

- **Canvas:** the big problem and its steps. Off, a small display sits above the keys, as on a phone.
- **History:** your problems, one to a line, the newest at the bottom. Tap a line to change it, or its answer to use
  it.
- **Steps:** Next step, Back, and Show all, with each step's rule lit. A clicker's Page Down works too.
- **In words:** "2 plus 3 times 4 equals 14" under the problem.
- **Swap sides:** the panels change sides, for a teacher on the left of a flat panel.
- **Answers:** as decimals, as fractions, or with remainders. Decimals to start. With remainders, 17 ÷ 5 = 3 R 2, and
  any other answer is a decimal. ⇄ beside an answer switches that one.
- **Advanced keys:** a² aᵇ ⁿ√ ∛ π % a/b →. Off to start.
- **Desmos %:** under Advanced keys, while they're on. On, % means "% of", as in Desmos. Off, 50 + 10% = 55, as on
  iPhone. On to start.
- **Hide the answer:** the class predicts, then taps to see.
- **Clear history:** empties History.

Turning on History or the canvas widens the window, where the board has room. In a tall window, the canvas goes above
the keys, and History across the top. Advanced keys make the window taller. Turning them off gives the room back.

Keyboards work too. Type digits, + - * / ^ % ( ), and the point, then Enter or =. Type sqrt, pi, or ans as letters.

The manual, with the real Calculator to try, is in [docs/calculator-manual/](docs/calculator-manual/).

## Weather

The weather outside, for the front of the room. It opens on Wheeling, Illinois, with a sky that matches the weather.
The forecast and air quality come from Open-Meteo. The temperature right now comes from the National Weather
Service's nearest station, Chicago Executive Airport for Wheeling.

**What it shows.** The weather right now, the hourly forecast, the 7-day forecast, what to wear, sunrise and sunset,
the moon, wind, air quality, and watches and warnings. A small window shows only the weather right now. A bigger one
shows more. Tap a part to fill the window with it.

**What to wear** goes by what the temperature feels like from 8 AM to 3:30 PM. Before 2 PM on a school day it opens
on today. Otherwise it opens on the next school day. School days come from the district calendar, built in.

**The window menu.** Each window keeps its own place and settings, and so do templates.

- **Show:** Hourly forecast, 7-day forecast, What to wear, Sunrise and sunset, Moon, Wind, Air quality, and
  Watches. Hidden parts leave no gap. Warnings always show.
- **On a date…:** the weather on any day from Jan 1, 1940 to yesterday, compared with today.
- **Location…:** search for a town. Weather never asks where the device is.
- **Simple words:** one picture, one sentence, and the clothes, for K–2.
- **No motion:** a still sky. It's still too when the device asks for less motion.
- **Units:** °F and mph, or °C and km/h.
- **Forecast from Open-Meteo:** opens Open-Meteo's site. Not in kiosk mode.

**How often it asks.** Only while the window shows. The weather right now every 30 minutes, the forecast every hour,
air quality every 4 hours, and watches and warnings every 5 minutes. Nothing on a timer from 8 PM to 6 AM.

**Offline.** It tries for new weather first. If none comes, it says so and shows the 7 days and what to wear from the
last forecast it saved.

## District apps

21Sketch, 21Timer, and 21DocCam are the district's own apps, each its own website. They open from the Widget Picker
in a window like any widget, and the window shows the live site, such as `https://sketchapp.ccsd21.org/`. 21Board
doesn't copy the apps or their work.

**For teachers**

- **Each app keeps its own work on the device:** the drawing in 21Sketch, 21Timer's settings and running timer,
  21DocCam's camera choice. 21Board keeps only where the window is and whether it's open. Closing or deleting the
  window doesn't touch the app's work, and neither does *Erase everything* in 21Board's Settings, which says so.
  Whether the window shares work with the app opened on its own depends on the browser. See *Production and the test
  site* below.
- **One window per app.** Choosing it again in the Widget Picker brings its window forward, or opens it again. *Add
  to this page* doesn't add a second one from a file. A second 21Sketch window would only show the same drawing, and
  a second 21DocCam would start the camera again.
- **A window partly behind another: tap it once** to bring it forward. That first tap doesn't draw or press
  anything, because 21Board can't see taps inside another site's page. A window nothing covers takes every tap
  straight away, so two people can draw in 21Sketch and use another window at once. The outline may then stay on the
  other window. Move the window by its title bar.
- **The window menu** has *Refresh 21Sketch*, to load the app again, such as after the connection comes back, and
  *Open in new tab*. It has no *Reset…* or *Go back…*, because the app's work isn't
  21Board's to reset or bring back.
- **Backups, templates, the Google Drive folder, and Board history** keep the window's place and whether it's open,
  never the app's work. A board opened on another device opens that device's 21Sketch, with whatever is saved there.
  To move a drawing, use 21Sketch's own project file, a `.json`.
- 21Board's theme, accent color, text style, and size don't reach these apps. They have their own settings.

**Production and the test site.** At `boardapp.ccsd21.org`, 21Board and the apps share one site, ccsd21.org. So
Chrome, on Chromebooks and the smartboards, treats the app in the window as the same app as on its own, with the
same saved work and offline copy. A line drawn in one appears in the other. On the GitHub test site,
`tylerloch.github.io/21Board`, the apps are another site, so Chrome keeps their storage apart inside 21Board:
separate work from the app opened on its own, and a separate offline copy. **On iPads, even at
`boardapp.ccsd21.org`, the window keeps its work apart from the app opened on its own.** Safari keeps a framed app's
storage apart whenever the page around it has another address, even on the same site. The window also needs its own
first visit online inside 21Board before it can work offline.

**Offline.** 21Board saves its own offline copy, but it can't save another site's pages. An app's window works
offline only once **that app saves its own offline copy** with a service worker of its own, and the device has
opened it online since. **None of the three has one yet.** 21Board won't need to change when they do. Tested with a
copy of 21Sketch and a test worker. Offline, the window opened 21Sketch with the same drawing.

- Offline, the window's title says **Offline**, and a message says once that you're offline and the app works only
  if it's saved on this device. 21Board can't see into another site's page, so it can't tell whether the app
  loaded, and covers nothing. An app with its own offline copy works as usual. One without shows the browser's "no
  connection" page. When the connection is back, choose *Refresh 21Sketch*, *Refresh 21Timer*, or *Refresh 21DocCam* in
  the window's menu. The same goes for a window that opened while the site was out of reach, such as before Wi-Fi
  was up, at a sign-in page, or with the server down. 21Board can't tell, so it doesn't reload the window by itself.
  *Ready to work offline* in Settings is about 21Board itself.
- 21Board never checks on the sites by itself. It sends them nothing beyond opening the window.

**For IT**

- **Framing.** The three sites send no `X-Frame-Options` and no `Content-Security-Policy` today, so 21Board can show
  them. If they ever do, they must allow 21Board with `Content-Security-Policy: frame-ancestors 'self'
  https://boardapp.ccsd21.org`, plus `https://tylerloch.github.io` for the test site. They must not send
  `X-Frame-Options`, which can't name another site. If 21Board's own host ever sends a CSP, it needs `frame-src
  https://sketchapp.ccsd21.org https://timerapp.ccsd21.org https://doccamapp.ccsd21.org`.
- **Video Player.** A CSP for its page, `widgets/youtube-player/index.html`, needs `frame-src
  https://www.youtube.com https://drive.google.com https://player.vimeo.com`, plus `connect-src
  https://www.youtube.com https://vimeo.com` for titles. Drive plays what the signed-in account can open. In a
  kiosk, or with third-party cookies blocked, only files shared with *Anyone with the link* play. YouTube's player
  also contacts Google's ad servers.
- **Weather.** A CSP for its page, `widgets/weather/index.html`, needs `connect-src https://api.open-meteo.com
  https://air-quality-api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com
  https://api.weather.gov`. A web filter must allow those five sites too. No cookies, sign-in, or key. Open-Meteo
  allows 10,000 calls a day from each Internet address. A window showing all day uses about 18. Past that, Weather
  uses the National Weather Service's forecast.
- **Camera (21DocCam).** Chrome asks for the camera on behalf of the page in the address bar, `boardapp.ccsd21.org`.
  Its prompt names that site and remembers the answer for it. On managed devices, allow the camera for
  `https://boardapp.ccsd21.org`, and for `https://doccamapp.ccsd21.org` so the app works on its own too. In the
  Admin console that's *Video input allowed URLs*, policy `VideoCaptureAllowedUrls`. Only the 21DocCam window gets
  the camera.
- **What the windows allow:** the same sandbox as every widget, which allows scripts, the app's own storage, forms,
  alerts and printing, pop-ups, and downloads. They also allow full screen, the clipboard, sound, and the camera
  for 21DocCam. Tested with copies of the apps, all of this works: saving PNG and project files, full screen,
  copying a picture, the camera, sound, alerts, printing, and the app's own offline copy. The sandbox stops an app
  from sending 21Board's tab elsewhere. 21Board sends the apps nothing. For the Traffic Light, it reads how much time
  21Timer has left. It stores nothing. 21Timer sends this from its 2.0 release.
- **Kiosk.** The apps work in a kiosk like any widget, without *Open in new tab*, since a kiosk can't open tabs.
  An app saves its offline copy only when its page loads, and in a kiosk that happens only in its window. For a
  kiosk to use the apps offline, launch it online once **with each app's window open**, after that app's offline
  worker is deployed. The camera policy above applies to the kiosk's organizational unit too.
- The addresses live only in `widgets/registry.js`, marked `external: true`. See docs/WIDGET-SDK.md, "The district's
  own apps". A `.21board` file names the app, never an address. The apps aren't part of 21Board's offline copy or
  its release stamp.

## Board history

21Board keeps earlier versions of the board on the device, in a database apart from the board itself. It saves one:

- while the board changes, at most every 10 minutes, once it has settled for a minute;
- when 21Board opens;
- when a widget's content is suddenly emptied, such as a note cleared;
- before every risky action: Reset, Delete, Close all, changing or removing the photo, Import, going back, and Erase
  everything.

With Board Sync, it also saves a page before changes from your other devices change it. That's at most about once an
hour while nothing changes on that page here, and always before a merge deletes something or settles a clash. Pages
deleted on any device stay 30 days under *Deleted pages*, with *Bring back* and the time they were deleted, by the
clock of the device that deleted them. They're listed at once, while their Undo is still offered too. Identical
content is never saved twice. A Picture window's picture is kept once, however many versions show it. *Save
this version now* keeps a named version until you delete it.

**Columns.** Opened from Settings → Classroom → *Board history…*, Board history is a column beside Settings, on the
side away from the screen edge. Settings stays open and usable. Tap a version to open it in a third column, and it
stays marked in the list. That column shows the version's time, a preview with each window, what changed after it,
and how it differs from now, then *Go back to …*, then each window of that version with *Put back* where it differs.
Tap the version again, or its ✕, to close the column. The Undo strip, the suggestion *Before the last big change*,
*Deleted pages*, *Save this version now*, what's kept, and the copies in the Google Drive folder stay in the list's
column.

Opened from a window's *Go back…*, a message, or the empty board, Board history opens alone at the screen
edge, and a version is the second column. Each column is as wide as Settings at the chosen size of windows and
menus. On a 1366 × 768 Chromebook all three fit side by side at the usual size. Where one doesn't fit, such as on an
iPad or at a large size, it covers the column before it, with *‹ Settings* or *‹ Board history* to go back. Escape
closes the outermost column first. Closing Settings closes Board history too, and moving the Widget Picker to the
other side in Settings → Advanced takes the columns with it. The keyboard moves into Settings and each column as it
opens, and back to what opened it as it closes. *Go back*, *Put back*, *Undo*, *Bring back*, and a folder copy close
every column, Settings too, so you see the board.

**Off**, in Settings → Advanced → *Save a version automatically*, stops the first three. Nothing is saved while you
work, when 21Board opens, or when a note is cleared. A version is still saved before each risky action, so Undo keeps
working, and when you tap *Save this version now*. Versions already saved stay until you delete them.

**What's kept:**

- the newest 20 versions;
- one an hour for 48 hours;
- the first and last of each day for 30 days;
- one a week for 12 weeks;
- safety versions for a week;
- the version before a big change for a month.

Only hours, days, and weeks the board was used count, so a summer break doesn't empty it. Board history lists the
first four the same way, a line each: *The 20 most recent versions*, *Hourly versions for the past 2 days*, *Daily
versions for the past 30 days*, *Weekly versions for the past 12 weeks*. When Board history needs more room, because
it has used its share of the device's storage or the device is full, the oldest versions go first. Versions you save
are never deleted to make room. Photos are stored once.

**Going back never changes the theme, accent color, or text style.** A running timer comes back paused, and a running
stopwatch comes back stopped. If going back can't finish, 21Board says why and the board stays as it was. *Erase
everything* keeps Board history, so it can be undone. If the board as it is can't be kept first, 21Board asks before
erasing. *Erase, including Board history* erases it too.

**When the device runs out of space** and the browser refuses a save, Board history gives up a little at a time, and
the save is tried again after each step, a few times at most. First go the photos kept with older versions, then the
10 oldest versions. It never gives up the newest versions, the first and last of each of the last 7 days the board
was used, the versions you saved, the safety versions, or the one before a big change. A message says so once, and
Settings → Classroom → *Go back to an earlier version* says *Space is low on this device*. Chrome doesn't tell a
page how much space is left, so 21Board goes by refused saves.

**In the Google Drive folder.** When Board Sync is set up and *Keep history copies in the folder* is on in Settings
→ Board Sync, about one copy an hour, and every version you save, goes to “Board history” inside the folder. Copies
leave out the background photo. A copy names its pictures in Photos. Copies are named like
`Room 12 2026-11-10 09.45 (smartboard) [7c1e9a-k3j9].21board`.
They hold only this device's own changes. Work merged from another device is in that device's copies. Each device
thins only its own copies, and files ending in “saved” stay. Another device, even one that was reset, can bring a
board back from them in Board history → *In your Google Drive folder*. They can include student names.

Board history isn't a backup. If the browser clears 21Board's data, history goes too. The code is section **13c** of
`board.js`, and the records are in docs/DATA-FORMAT.md, "Board history".

## Board shape and size

| | |
| --- | --- |
| **Widescreen (default)** | The board is 16:9, as large as fits the window and centered, with the rest of the window lightly shaded. Every screen shows the same layout, so a board planned on a laptop looks the same on the smartboard. Windows can't go in the shaded margin. |
| **Fill** | Settings → Appearance → *Board shape* → *Fill*. The board fills the whole window at the chosen size. On a smaller screen, windows move to fit. |
| **Size of windows and menus** | Settings → Advanced, − and +, from 50% to 200%. The default is **80%**. It sets how big title bars, menus, the Widget Picker, Settings, and widget contents are, as on a 1920 × 1080 screen. Windows keep their place and footprint when it changes. Menus, the Widget Picker, Settings, and messages never grow past the screen, since a size picked on a smartboard can reach a tablet in a backup. |
| **Tip** | When the 16:9 board leaves much of a very wide, tall, or narrow window unused, a small tip in the shaded margin offers *Fill the window*, which switches to Fill. *Hide* keeps it away for the session. There's no tip when the margin is too small for it. |

Both settings are saved with the board and in exports. Boards saved before they existed are converted once when
opened, and keep their layout as it looks on that screen. The code is section **6a. Board shape and scale** of
`board.js`. See also docs/DATA-FORMAT.md, "Layout space".

## Tests

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/run.js            # all suites
node tests/run.js offline    # only the suites whose title contains "offline"
node tests/run.js offline --verbose   # every check, not only the failures
```

Each suite prints its failures and how many checks passed. The suites are in `tests/suites/`, one file per area,
and `tests/run.js` runs every file there. A new suite goes in its area's file. A new area gets a file of its own.

The *District apps* suite uses stand-ins for 21Sketch, 21Timer, and 21DocCam. The *Traffic Light sideways* suite has
its own stand-ins for 21Timer and 21Sketch. The *Video Player* suites use stand-ins for YouTube, Google Drive, and
Vimeo. The *Weather* suites answer for Open-Meteo and the National Weather Service with saved answers from
`tests/fixtures/weather/`. The tests never reach the real sites.

The second *Opens maximized* suite installs 21Board as an app in a real Chrome window, on an Xvfb screen of its own,
and in Chrome's headless mode. It needs Xvfb, the package with `xvfb-run`, and the full Chromium that `npx
playwright install chromium` brings. If either is missing, it says *skipped* and goes on.

The *Board Sync* suites play two or three devices sharing a Google Drive folder, in scenarios numbered 1 to 61. Each
device is a browser profile of its own. The tests bring files from one device's folder to another's as Google Drive
would: late, cut short, out of order, or twice, with clocks that disagree. `node tests/merge.js` tests the merge
itself, `board.js` section 13d, in Node with no browser: the rules, reading device files, and a randomized run of
devices changing and merging one board. It takes a couple of minutes, and `tests/run.js` runs it as a suite too.
`node tools/test-halves.js` runs the whole of `tests/run.js` as two halves at once, in about 40 minutes, and adds up
the results. It takes a filter too. It won't start while another test run is going.

GitHub runs the whole of `tests/run.js` for every push, in 15 parts at once, in about 9 minutes. It installs the
fonts the tests are written with, so text measures the same. `.github/fonts/` makes Inter the system font.
`node tools/ci-wait.js` waits for the pushed commit's run, then prints each part and every failure. It prints nothing
while it waits. It needs the GitHub CLI, `gh`. Add `--save-timings` to save how long each suite took to
`tests/timings.json`. `PART=k/n` uses those times to give each part about the same work.

`node tests/calc-engine.js` tests the Calculator's math in Node, with the answers Desmos gave. It runs as a suite too.

The tests check that the release stamp matches the files, with `node tools/release.js --check`. If that fails, run
`node tools/release.js`. The *Updating* suites serve one release, then a changed one. They check the prompt,
*Update* in every open tab, that a device never runs part of each, and that a clean-up never loses an offline copy,
or saves it again if it does.

## Browser support

Built for current **Chrome** and Chromium-based Edge. Works with **Safari 16+** on iPadOS and macOS, and current
Firefox. Full screen is hidden where the browser doesn't support it.

## Third-party files

- `widgets/notes/fonts/CrayonLibre-21Board.woff2`: *Crayon Libre* 1.05 by GGBotNet, released under CC0 1.0, public
  domain (`widgets/notes/fonts/CrayonLibre-LICENSE.txt`). It gives the Notes Chalkboard theme hand-drawn chalk
  lettering on every device, Chromebooks included. `tools/build-chalk-font.py` makes this file from the original,
  reusing the font's own chalk strokes. It gives it a print, non-cursive lowercase l whose bottom trails off like
  chalk as the hand lifts, a flag on the 1 and bars on the capital I so l, 1, and I differ, a Q with a plain straight
  tail, and a two-dot colon, since the original's looked like a semicolon. It drops the pictograph emoji. WOFF2,
  about 60 KB.
- `widgets/notes/fonts/Excalifont-Regular.woff2`: *Excalifont* by Excalidraw (based on Virgil by Ellinor
  Rapp), used unmodified under the SIL Open Font License 1.1 (`widgets/notes/fonts/Excalifont-OFL.txt`),
  for the Notes Whiteboard theme.
- `fonts/AtkinsonHyperlegible-Regular.woff2` and `-Bold.woff2`: *Atkinson Hyperlegible* 1.006 by the Braille
  Institute, under the SIL Open Font License 1.1 (`fonts/AtkinsonHyperlegible-OFL.txt`), for Settings → Appearance →
  Text style → *Easier to read*. `tools/build-letter-fonts.py` makes them from the originals in the google/fonts
  repository. It cuts them down to Latin letters (Basic Latin, Latin-1, Latin Extended-A) and the punctuation
  21Board uses, as WOFF2.
- `fonts/EarlyReaders-Regular.woff2` and `-Bold.woff2`: *Andika* 6.101 by SIL International, under the SIL Open Font
  License 1.1 (`fonts/EarlyReaders-OFL.txt`), for *Early readers*. Made the same way, and renamed “21Board Early
  Readers”, since Andika is a Reserved Font Name that a cut-down copy may not use. Its line height comes down from
  1.61 to 1.36 em, room for these letters' accents only. The four fonts add about 83 KB to the offline copy, or 92
  KB with the licenses. Every device saves them, and 21Board uses one only once it's chosen.

## License

Copyright 2026 Community Consolidated School District 21. These licenses cover every version of 21Board,
including those published before they were added.

- **Code:** [Apache License 2.0](LICENSE). Copy it, change it, share it. Keep the [notice](NOTICE).
- **Documentation:** [CC BY 4.0](LICENSE-DOCS). Share it with credit.
- **The 21 gear, the goat, and the CCSD21 name** belong to the district. Neither license covers them.
- **Fonts** keep their own licenses. See [Third-party files](#third-party-files).
