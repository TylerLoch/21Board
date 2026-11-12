# 21Board data format

Everything 21Board stores lives **on the device**, in the browser's IndexedDB. The server only
serves static files and never sees any data.

- [IndexedDB layout](#indexeddb-layout)
- [Record types](#record-types)
- [Instances: numbering, closing, reopening](#instances-numbering-closing-reopening)
- [Keeping several open copies in sync](#keeping-several-open-copies-in-sync)
- [The .21board file](#the-21board-file)

---

## IndexedDB layout

| | |
| --- | --- |
| Database | `21Board` (version 1) |
| Object store | `records`, `keyPath: "key"` |

(The widget dev window's test board uses the same layout in a separate database, `21Board-dev`, or in
memory where storage is blocked, and its own sync channel, `21board-dev-sync`. It never touches `21Board`.)

Every record is a JSON envelope:

```js
{
  key: "data:1:timer:2",     // see keys below
  type: "data",              // "settings" | "board" | "inst" | "data" | "conf"
  rev: 14,                   // increases by 1 on every write (used for sync)
  updatedAt: 1762713600000,  // ms since epoch
  by: "k3j9x0aa",            // id of the tab that wrote it
  value: { ... }             // the actual JSON
}
```

Keys (`<b>` = board id, currently always `1`; `<n>` = instance number):

| Key | `type` | `value` |
| --- | --- | --- |
| `settings` | `settings` | Board-wide preferences (below) |
| `board:<b>` | `board` | Board name and background |
| `inst:<b>:<widgetId>:<n>` | `inst` | One window/instance: geometry, open/closed, stacking |
| `data:<b>:<widgetId>:<n>` | `data` | That instance's **content** — whatever the widget passed to `Board21.save()` |
| `conf:<b>:<widgetId>:<n>` | `conf` | That instance's **config** — whatever it passed to `Board21.saveConfig()` |
| `media:<b>:background` | `media` | The board's **background photo** on this device (see below). Kept apart from `board:<b>` |
| `media:<b>:background-look` | `media` | How that photo is shown on this device |
| `devfile:<widgetId>` | `devfile` | A test widget uploaded as a file in Developer mode (below). This device only |

Widget ids are limited to `a-z 0-9 -`, so keys can be split on `:`.

The board id is in every key: each **page** is a board of its own (`board:<b>`, `inst:<b>:…` and so on).
`settings.activeBoard` is the page every tab on the device shows, and `settings.boards` their order.
Page ids are never used again: `settings.lastBoard` is the highest one used, and a new page also skips any id
that still has records or Board history. A deleted page waits in `settings.deletedBoards` while its Undo is
offered (its records stay until then; `settings.deletedAt` says when it was deleted); then its records and its
Board history are deleted. One left there (21Board was closed before the Undo ended) is cleared the next time
21Board opens, once 20 seconds (and a little more) have passed since it was deleted: a tab opened meanwhile never
clears a page whose Undo another tab still offers. A record of a page that is missing from `settings.boards`
(and not deleted) is shown as a page at the end, never hidden. Two pages never share a `board.uid` (see Load and
Import below). *Erase everything* keeps the id of the page shown, so that its Board history ("Before erasing
everything") is still that page's; the other pages' Board history goes.

While 21Board is open, each tab also holds the other pages' records in memory: if the browser throws the
database away under an open board, every page is written back, not just the one shown, and a backup made when
storage can't be read still has every page.

---

## Record types

### `settings`

```js
{
  theme: "light",          // "light" | "dark" | "system"
  snapping: true,          // snap windows together and resist overlap
  resistance: "normal",    // "gentle" | "normal" | "strong" — how hard you push to overlap
  pickerCorners: "both",   // "both" | "left" | "right"
  accent: "blue",          // "blue" | "purple" | "pink" | "red" | "orange" | "green" | "teal" | "slate"
  locked: false,           // Settings → Classroom → Lock windows in place
  awake: "off",            // Settings → Classroom → Keep the screen on: "off" | "on" (while 21Board is showing) | "hours" (school hours, Mon–Fri)
  awakeFrom: "07:30",      //   school hours, "HH:MM" by this device's clock (not kept on while awakeTo isn't later)
  awakeTo: "15:30",
  clock: "date",           // Settings → Appearance → Clock in the corner: "off" | "time" | "date" (time and date, the default)
  letters: "standard",     // Settings → Appearance → Letters: "standard" (the device's own font) | "legible" (Atkinson Hyperlegible) | "early" (Andika, as "21Board Early Readers")
  lastBackupAt: null,      // ms of the last full backup export, for backup reminders
  devMode: false,
  devWidgets: [               // test widgets added in Developer mode
    { id: "dev-widgets-my-widget", name: "My-widget (test)", entry: "widgets/my-widget/index.html" }
  ],
  activeBoard: 1,          // the page shown, in every tab (start-up falls back to the first page if it is gone)
  boards: [1, 3, 2],       // the pages in order (board ids)
  deletedBoards: [],       // pages deleted while their Undo is offered
  deletedAt: {},           // when each of those was deleted (ms), e.g. { "2": 1794460416170 }
  lastBoard: 3             // the highest page id used so far (never used again)
}
```

Only `theme` and `accent` go into exported files (and so into the Google Drive folder). `locked`, `awake`,
`awakeFrom`, `awakeTo`, `clock` and `letters` belong to this device: never in exports, Board history or the Google
Drive folder, and an import or Load leaves them as they are.

### `board:<b>`

```js
{
  id: 1, name: "My Board",       // id: the board's slot on this device
  uid: "7c1e…",                  // a unique id, made once: files sent from other devices are matched by it
  background: { color: "#1f3a2c" | null, pattern: "none" | "dots" | "grid" | "lines" | "handwriting" | "graph" },
  scale: 0.8,                    // size of windows and menus (0.5–2), as on a 1920 × 1080 screen; see "Layout space"
  shape: "16:9",                 // "16:9" (default) | "free" (fills any window)
  layout: { w: 2400, h: 1350 }   // the 16:9 board in layout px: 1920/scale × 1080/scale (kept for older readers)
}
```

`color: null` means "match the light/dark theme". `"handwriting"` (rows for young writers: solid top and base
lines, a dashed midline) and `"graph"` (graph paper: fine squares, a stronger line every 5) were added later; an older
21Board shows no pattern for them, and an import there turns them into `"none"`.

### `devfile:<widgetId>` (this device only)

A test widget uploaded under Settings → Developer mode → *Test a widget* → *Upload file…* (see
[docs/WIDGET-SDK.md, "Inside 21Board"](WIDGET-SDK.md#inside-21board)). `widgetId` is `dev-` and the id in the
file's manifest block (or its name). Never exported, and never written by an import, so a `.21board` file
can't bring code that runs; *Erase everything* deletes it. While one starts, `localStorage["21board-devfile-starts"]`
notes it for a few seconds (`{"<tab>:<widgetId>": time}`), so a widget that froze the board isn't started again
by itself.

```js
{
  id: "dev-my-widget",
  name: "My Widget (test)",      // from the manifest block (or the page's title, or the file name)
  file: "index.html",            // the file's name, as picked
  size: 18234,                   // bytes
  src: "<!DOCTYPE html>…",       // the file's text (at most 5 MB)
  version: "1.0.0",              // from the manifest block
  window: { width: 320, height: 240, … },   // from the manifest block, or null
  at: 1762713600000              // when it was uploaded
}
```

### `link:folder` and `link:state` (this device only)

The link to a shared Google Drive folder (see README, "Sharing a board with the smartboard"). Never
exported. `link:folder` holds the folder handle Chrome gives 21Board (stored as is, not as JSON).
`link:state`:

```js
{
  device: { id: "…", label: "my laptop" },   // label: what other devices show ("updated on …")
  auto: false,                               // "Send automatically": once the board has been left alone…
  calm: false,                               // …for 10 minutes ("When left alone") instead of a few seconds ("After each change")
  photo: true,                               // include the background photo in sent files
  boards: { "<board uid>": {
    file: "Room 12.21board",       // the board's file in the folder, as this device last wrote or loaded it
    also: ["Room 12 (2).21board"], // files it used for the board before that are still there (removed at its next send)
    seen: ["<version id>", …],     // versions sent or loaded here (newest 40): anything else is new to this device
    headId, headMine,              // the version this board was built on, and whether this device sent it
    sentAt, sentSig, loadedSentAt, loadedFrom, loadedSig,
    photo: true } },               // what the version last sent or loaded here said about the photo: true (it had one), false ("background": null), absent (nothing)
  late: { "room 12.21board": { size, lastModified } }   // files that couldn't be read and were waited for in full (not waited for again while they stay as they are)
}
```

Versions are compared by id, never by time (two devices' clocks can disagree). A version this device
hasn't seen is offered and never overwritten: an automatic send waits; Send asks first. Every file in the
folder with the board's `uid` counts (Drive can leave two), and a file that is listed but can't be read yet
isn't taken for no file: a send waits for one that may be this board's. A version whose `sent.by` is this
device is its own, even if it didn't get to note it.

`sentSig` / `loadedSig` fingerprint the board's content when it was last sent or loaded here, to tell
whether it was changed on this device since (window stacking order doesn't count). Only the later of the two
is kept (sending clears `loadedSig`, loading clears `sentSig`), so a board changed back to what was loaded
before the last send still counts as changed.

In the folder, 21Board writes one `<board name>.21board` per board (a full backup with `board.uid` and a
`sent` block, below), renames it when the board is renamed (the files this device used for the board before
are removed once it has seen the versions in them), and adds `About this folder.txt`. Other files are left alone.

### `media:<b>:background` and `media:<b>:background-look`

```js
// media:<b>:background — the picture
{ data: "data:image/jpeg;base64,…", w: 2560, h: 1707, bytes: 412345, name: "class.jpg", addedAt: 1762713600000 }
// media:<b>:background-look — how it's shown
{ on: true, fit: "fill" | "whole", focus: { x: 0.5, y: 0.5 }, fade: 0 }
```

`fill` covers the board (cropped), `whole` fits all of it with the board color around it; `focus` (0–1 from
the top-left) is the part that stays in view when cropped (the CSS `background-position`); `fade` (0–0.7)
blends it toward the board color. Everything about the photo is in these two records, none of it in
`board:<b>`: the photo belongs to the device, and without these records the board shows its color.

Chosen in Settings → Appearance → Background photo, then shrunk on the device (long side at most 2560 px,
short side kept at 1440 px or more so panoramas stay sharp, about 6.5 MP at most) and saved as a JPEG
(usually 0.2–0.9 MB), or as WebP/PNG if it has transparency (a logo), so the board color shows through. It covers the 16:9 board (not the shaded
margins), or the whole window when the board shape is unlocked.

Media records are kept apart from the small records on purpose: anything that copies boards between
devices with tight size limits (for example a sync through a browser extension) can skip `media:*`
and let each device set its own photo; the board still works without it.

### `inst:<b>:<widgetId>:<n>`

```js
{
  widgetId: "timer",
  n: 2,
  open: true,                               // false = window closed, data kept
  rect: { x: 40, y: 60, w: 380, h: 300 },   // OUTER window rect in CSS px, incl. the 40px title bar
  z: 7,                                     // stacking order; highest = front
  maximized: false,
  createdAt: 1762713600000
}
```

`rect` is where the teacher *put* the window, in **layout space** (below). It only changes when
the window is moved or resized, never because the screen changed.

#### Layout space

Window rects are in **layout px**: the CSS px the window's widget sees. They are drawn on screen with one
zoom factor, so the board looks the same everywhere:

- **16:9 board** (`shape: "16:9"`, the default): the board is `1920/scale × 1080/scale` layout px
  (2400 × 1350 at the default 80%). It is drawn as large as fits the window (zoom
  `min(screenW / boardW, screenH / boardH)`), centered left-to-right and top-aligned; the rest of the
  window is lightly shaded. Windows are kept inside the board, so every screen shows the same
  arrangement. Pointer movement is divided by the zoom, so drags follow the finger.
- **Any shape** (`shape: "free"`): the board is the whole window at zoom = `scale`. Windows that don't
  fit a smaller window are moved inside when drawn (their saved rect is kept).
- **Scale** (`scale`): how big windows, title bars and menus are, as on a 1920 × 1080 screen (at 1.0, a
  window's CSS px are screen px there). Changing it multiplies every rect's position, width and content
  height by `old/new` (the title bar stays 40 px), so windows keep their place and content area on the
  board, their contents are drawn bigger or smaller, and fixed-shape widgets keep their exact shape. Board chrome (menus,
  the Widget Picker, Settings, toasts, dialogs) is drawn at this scale too.
- Resize handles and the focus ring stay at the board's scale even when the board is drawn smaller
  (up to 2.5×); snap reach and push-to-overlap are measured in screen px.

A board saved before `scale` existed (its rects are screen px, or px of the earlier optional
`layout`) is converted once on load: that space (grown to contain every window) is fitted into the
16:9 board with one uniform factor, centered, so the arrangement looks the same on that screen.
Exports write the board's `scale` and `shape`, and the space the rects are in as `viewport`.

### `data:…` and `conf:…`

Any JSON value the widget saved. The format is up to each widget; document it at the top of the
widget's script. Missing record = nothing saved (`null` in the SDK).

The district apps (`external` in the registry: `21sketch`, `21timer`, `21doccam`) never have these: they keep
their own work in their own site's storage on the device. Their windows have an `inst` record like any other,
and exports and Board history carry that (with `data` and `config` null), never an address.

---

## Board history

Earlier versions of each board, in their own IndexedDB database, `21Board-history` (version 1), never mixed
with the board's records and never exported. Three object stores:

| Store | Key | Value |
| --- | --- | --- |
| `meta` | `id` = `<b>:<at, 13 digits>:<tab id>` | what a version looks like (below), for lists, previews and comparisons |
| `body` | `id` | `{ id, exp }`: a full export of the board (as in a `.21board` file) with `instances[].createdAt`, `snapshot: {at, kind, label}`, and `media: {ref, look}` instead of the photo |
| `photo` | `key` = `<addedAt>-<bytes>-<w>x<h>` | each background photo once: `{ key, data, w, h, bytes, name, addedAt, thumb, lastUsed }` |

```js
// meta
{ v: 1, id, b, at, kind: "auto" | "open" | "manual" | "before" | "restored",
  reason: null | "reset" | "delete" | "close-all" | "emptied" | "photo" | "import" | "add" | "load" | "restore" | "window" | "erase",
  label, sig, uid, name, bytes, photo: "<key>" | null | "gone",
  thumb: { bg, pattern, shape, vw, vh, wins: [[ikey, x, y, w, h], …] },              // open windows, back to front
  wins: { "<ikey>": [open, createdAt, dataHash, confHash, dataLength, excerpt] },
  beforeBig, link: "sent" | "loaded" | null, keepUntil, manual, manualLabel, folder, tab }
```

`sig` is the same content fingerprint as the shared folder uses (window stacking order doesn't count), so
identical versions aren't saved twice. Retention is in README, "Board history". Settings (device only):
`historyEvery` (minutes, 0 = off; default 10) and `historyFolder` (default true).

**Folder copies:** `<shared folder>/Board history/<board name> <YYYY-MM-DD> <HH.MM>[ saved] (<device>) [<uid6>-<dev4>].21board`
(local time; `uid6` and `dev4` are the first characters of the board's uid and the device id). A valid `.21board`
file: the version's body plus `history: {at, kind, label, by, from}`, without theme, accent, `sent` or the photo.
Each device thins only files with its own `dev4` (by name only); files ending in ` saved` are never removed.

## Instances: numbering, closing, reopening

- Opening a widget when **no closed instance exists** creates the lowest unused number
  (`timer:1`, then `timer:2`, …).
- **Closing** a window only sets `open: false`. Its `data`/`conf` stay.
- Opening the widget again reopens the **lowest-numbered closed instance**, restoring its position,
  size and content. With `timer:1` and `timer:2` both closed: first open → `timer:1`,
  second → `timer:2`, third → new `timer:3`.
- **Reset** (window menu) deletes that instance's `data` and `conf` and restores the default size.
- **Delete** (Settings → Saved widget windows) removes the `inst`, `data` and `conf` records.
- Records for a widget that isn't installed are kept (and exported) but not shown.
- A widget marked `single` in the registry (the district apps) has one window: opening it while it is open
  brings that window forward instead of creating a second instance, and *Add to my board* leaves out the
  file's instances of it when the board has one (open or closed). (*Replace my board* with a file that has more
  than one shows them all.)

---

## Keeping several open copies in sync

Several tabs or windows of 21Board can be open on one device. All show the same board.

1. Every change is written to IndexedDB first. Rapid changes are coalesced into one transaction,
   and each record's `rev` is read and incremented **inside** that transaction. A transaction that
   fails stays queued and is tried again (see "When storage fails" below).
2. When the transaction commits, the tab posts `{ tab, keys: [...] }` on the
   `BroadcastChannel("21board-sync")` (or, in older browsers, writes it to
   `localStorage["21board-sync"]` to fire a `storage` event — the same trick 21Sketch uses).
3. Other tabs re-read just those keys and apply any record whose `rev` is newer than the one they
   last saw. Windows move, open or close; widgets get `data` / `config` events.
4. While someone is dragging or resizing, incoming changes are held and applied when the gesture
   ends, so a window never jumps out from under a finger.
5. When a tab becomes visible again (or is restored from the back/forward cache), it re-reads
   everything, in case it missed messages while frozen.
6. Import and Erase post `{ op: "reload" }` once their transaction is stored (a failed one changed
   nothing and posts nothing); other tabs rebuild from IndexedDB. With `replaced: true` (the board was
   replaced: Import ▸ Replace, Load, going back) or `erased: true`, they first drop any change of their
   own that wasn't saved yet, so it can't land on the new board.
   Reset posts `{ op: "reset", board, ikey }`; other tabs reload that window.

Two copies editing the *same* record at the *same* moment: the later write wins, and both copies
then show it. A tab that takes over another tab's newer record drops its own change to that record
if it was still waiting to be saved (see below), so the older change is never written over the newer.

### When storage fails

- **Nothing is written before the stored board has been read.** At start-up the database is opened (tried up
  to three times, 10 seconds at most each) and every record is read (tried twice; then one by one, so a single
  unreadable `media`, `data` or `conf` record is left out, and left as it is, instead of hiding the board).
  If that fails, or start-up throws, the tab shows a message with *Try again* and stays read-only.
- **A failed write is kept.** The changes stay queued in the tab (a newer change to the same record wins) and
  are tried again with the next change, after 5 seconds, then every 30. Meanwhile the board shows *Not saved*,
  and Export includes the queued changes. An error that means "out of space" (`QuotaExceededError`, or a
  message about quota, no space or a failed blob write) first makes room in board history, a little at a
  time (the photos kept with older versions, then the 10 oldest versions; see README, "Board history"), and
  retries after each step, up to 4 times. If the transaction still fails, its records are written one at a
  time, so only the ones that can't be stored stay queued.
- **Export doesn't need the database.** It reads the stored records, but what the tab holds stands in for
  any record that can't be read, and for all of them if the read fails or takes longer than 8 seconds.
- **A database that is gone under an open board is written back.** If reopening the database creates it
  anew (`upgradeneeded`) after the board was read, the browser has thrown the old one away. The tab queues
  every record it knows of, with the value it holds, to be written where the record is missing (never over
  a record another tab has written since), ignores what it reads until that is done, and shows *Not saved*
  for as long as it can't be done. Board history is in the same browser storage and may be gone too.
- **Where the browser blocks IndexedDB**, or the teacher chooses *Use 21Board without saving* after a failed
  start, the same records are kept in memory for that session and nothing is announced to other tabs.
  After a failed start, Board history (its own database) still works: earlier versions can be gone back to
  on that unsaved board, and versions of it are saved as usual.

---

## The .21board file

**Export** (Widget Picker → ⤓) downloads a UTF-8 JSON file with the `.21board` extension.
**Import** (Widget Picker → ⤒, dropping a file on the board, or opening one with the installed app
on Chrome) reads it.

```js
{
  "format": "21board",            // required
  "formatVersion": 1,             // files from a newer version are refused with a message
  "kind": "full",                 // "full" = backup, "template" = layout only
  "exportedAt": "2026-11-09T18:30:00.000Z",
  "generator": "21Board 2026.11.12-1 (3fa9c1d2)",   // the release that wrote the file: name and build (for people; never read back)
  "viewport": { "width": 2400, "height": 1350 },   // the space the rects are in (the 16:9 board, grown to fit every window)
  "theme": "light",
  "accent": "blue",
  "board": {
    "name": "Room 12",
    "background": { "color": null, "pattern": "dots" },
    "scale": 0.8,
    "shape": "16:9",
    "uid": "7c1e…"                // full backups only: which board this is
  },
  "sent": { "id": "<version id>", "base": "<the version it was built on>", "at": 1762800000000, "by": "<device id>", "from": "my laptop" },   // only in files sent to a shared folder
  "media": { "background": { "data": "data:image/jpeg;base64,…", "w": 2560, "h": 1707 }, "look": { "on": true, "fit": "fill", "focus": { "x": 0.5, "y": 0.5 }, "fade": 0 } },   // full backups only; in a sent file, "background": null says the board's photo was taken off
  "instances": [
    {
      "widgetId": "timer",
      "instance": 1,
      "open": true,
      "maximized": false,
      "z": 3,
      "rect": { "x": 40, "y": 40, "w": 380, "h": 300 },
      "config": { "sound": true },
      "data": { "duration": 300000, "remaining": 300000, "endsAt": null }
    }
  ]
}
```

| | `kind: "full"` | `kind: "template"` |
| --- | --- | --- |
| Open windows | ✅ | ✅ |
| Closed windows | ✅ | ❌ |
| `config` | ✅ | ✅ |
| `data` (content) | ✅ | ❌ always `null` |
| `media.background` (photo) | ✅ | ❌ (a template is for sharing; a photo may show the class) |

Optional, ignored by older readers: `instances[].createdAt` (which window is which, kept by board history),
`history: {at, kind, label, by, from}` (a Board history copy), `media.ref` (a photo kept in board history) and
`pages` (below).

### Every page in one file

*Export → All pages*, *Back up now* and the backup reminders save every page. With one page that is exactly the
file above. With more, it is **still `formatVersion: 1`**: the file is the page that was shown, as above, plus
`pages`, every page in order, with `{ "main": true }` in that page's place:

```js
{
  "format": "21board", "formatVersion": 1, "kind": "full", "viewport": …, "board": { "name": "Math", … }, "media": …, "instances": [ … ],
  "pages": [
    { "viewport": …, "board": { "name": "Morning meeting", "uid": "…", … }, "media": …, "instances": [ … ] },
    { "main": true },
    { "viewport": …, "board": { "name": "Reading groups", … }, "instances": [ … ] }
  ]
}
```

A copy of 21Board from before pages ignores `pages` and opens the file as one board (the page that was shown).
Only an all-pages export (or one of a device with a single page) counts as a backup for the reminders. If
storage can't be read, the other pages come from what the open tab holds; if part of a page still can't be had,
the file is made anyway, the teacher is told which pages are incomplete, and it doesn't count as a backup.
*Export → This page* writes the one-page file exactly as before.

Importing a one-page file offers three choices:

- **Open as a new page** (suggested) — the file becomes a new page right after the page shown, with the file's
  name, background, photo, size and shape (not its theme or accent color). It keeps the file's `board.uid`
  unless a page on this device already has it (then it gets a new one). Undo takes the page away again.
  (*Replace this page* and Load in the Google Drive folder also give a new `uid` when the file's is another page's
  on this device; the folder lists such a file with **Go to page** instead of Load.)
- **Replace this page** — removes this page's current windows and content, then loads the file
  (including its board name, background, theme and accent color). Which board it is from then on
  (`board.uid`): the same board, if the file is its own backup (the same `uid`) or says nothing (no `uid`: a
  template, an old backup) and keeps the board's name; the file's board, if the file was sent to a shared
  folder (it has a `sent` block), as with Load; otherwise a new board with a new `uid`, so that sending it
  never touches the file of the board it replaced.
- **Add to this page** — keeps everything and adds the file's windows. Instance numbers are
  renumbered to the next free number per widget, and windows are nudged into free space.

Importing an all-pages file offers **Add these pages** (each becomes a new page, after this device's pages,
as with *Open as a new page*) or **Replace all pages** (asked again; the file's pages are added, then this
device's pages are deleted, with Undo for 20 seconds, which brings them back and takes the new ones away). With
*Replace all pages* the file's pages keep their `board.uid` even though the pages they replace have it, so a
restored backup is the same boards in the Google Drive folder. Either way it is all or nothing: if a page can't
be added, those that were go again and this device's pages stay.

*Replace* keeps this device's background photo unless the file brings one (or is a sent file that says the board's photo was taken off: `"media": { "background": null }`, written only by a device whose last sent or loaded version of the board said something about a photo; a device that has already loaded or sent "taken off" keeps a photo put on there since), and takes the file's `scale` and `shape`, so the board looks exactly as it did (zoomed to fit
this screen); a file from before board sizes existed is fitted into the 16:9 board. *Add* fits the
file's whole board into this one with one uniform factor, keeping shapes and spacing.
