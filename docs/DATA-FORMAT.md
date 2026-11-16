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
  theme: "system",         // "light" | "dark" | "system" (Auto, the default for a new device; a device keeps what it has,
                           //   and one from before 2026.11.16-1 with no settings record yet keeps "light": its settings
                           //   are saved when 21Board starts and finds none)
  snapping: true,          // snap windows together and resist overlap
  resistance: "normal",    // "gentle" | "normal" | "strong" — how hard you push to overlap
                           //   (Settings → Advanced → Windows stop at each other's edges: Off = snapping false;
                           //   Light / Medium / Firm = snapping true with "gentle" / "normal" / "strong")
  pickerCorners: "both",   // Settings → Advanced → Widget Picker: "both" | "left" | "right"
  accent: "blue",          // "blue" | "purple" | "pink" | "red" | "orange" | "green" | "teal" | "slate"
  locked: false,           // Settings → Classroom → Lock windows in place
  awake: "off",            // Settings → Classroom → Stay awake: "off" | "on" (the screen is kept on while 21Board is showing)
  clock: "date",           // Settings → Appearance → Clock in the corner: "off" | "time" | "date" (time and date, the default)
  letters: "standard",     // Settings → Appearance → Letters: "standard" (the device's own font) | "legible" (Atkinson Hyperlegible) | "early" (Andika, as "21Board Early Readers")
  lastBackupAt: null,      // ms of the last full backup export, for backup reminders
  devMode: false,          // Settings → Advanced → Developer mode
  activeBoard: 1,          // the page shown, in every tab (start-up falls back to the first page if it is gone)
  boards: [1, 3, 2],       // the pages in order (board ids)
  deletedBoards: [],       // pages deleted while their Undo is offered
  deletedAt: {},           // when each of those was deleted (ms), e.g. { "2": 1794460416170 }
  lastBoard: 3             // the highest page id used so far (never used again)
}
```

Only `theme` and `accent` go into exported files (and so into the Google Drive folder). `locked`, `awake`,
`clock` and `letters` belong to this device: never in exports, Board history or the Google Drive folder, and an
import or Load leaves them as they are.

Older versions had a third choice for `awake`, `"hours"` (school hours, Monday to Friday, from `awakeFrom` to
`awakeTo`, `"HH:MM"`). 21Board reads `"hours"` as `"on"` (the teacher wanted the screen on in class) and drops
`awakeFrom` and `awakeTo` when it reads the record, so the next save of the settings leaves them out.

Older versions also kept `devWidgets` here: test widgets added in Developer mode by their path on the site
(`[{ id, name, entry }]`). That way of testing a widget is gone, so 21Board ignores `devWidgets`, whatever it
holds, and drops it when it reads the record (the next save of the settings leaves it out). Windows of those
widgets are kept like any window whose widget isn't installed: not shown, and listed in Settings as *Widget not
installed*. Test widgets are now uploaded as a file: see [`devfile:<widgetId>`](#devfilewidgetid-this-device-only).

### `board:<b>`

```js
{
  id: 1, name: "My Board",       // id: the board's slot on this device
  uid: "7c1e…",                  // a unique id, made once: files sent from other devices are matched by it
  background: { color: "#1f3a2c" | null, pattern: "none" | "dots" | "grid" | "lines" | "handwriting" | "graph" },
  scale: 0.8,                    // size of windows and menus (0.5–2), as on a 1920 × 1080 screen; see "Layout space"
  shape: "16:9",                 // "16:9" (Widescreen, the default) | "free" (Fill: fills any window)
  layout: { w: 2400, h: 1350 },  // the 16:9 board in layout px: 1920/scale × 1080/scale (kept for older readers)
  pos: 2                         // the page's place among the pages: they are in (pos, uid) order
}
```

`uid` is which page this is on every device (Board Sync merges pages by it), and in Board history; two pages on one
device never share one. `pos` orders the pages: a new or moved page gets a `pos` between its neighbours' (when the
gap gets below 1e-6, every page is numbered 1, 2, 3… again). `settings.boards` is this device's copy of that order,
rebuilt from `pos` when they disagree, never the other way round. A page without `pos` (from before it existed) gets
its place in `settings.boards` plus 1 the first time Board Sync looks at the board.

`color: null` means "match the light/dark theme". Settings offers White `#ffffff`, Paper `#f3ede1`, Sky `#e0f2fe`,
Mint `#dcfce7`, Blush `#fce7f3`, Lavender `#ede9fe`, Slate `#334155`, Chalkboard `#1f3a2c`, Navy `#1e293b`, Black
`#0a0a0a`, or any color (Custom…). Older versions had a lighter Paper `#faf7f0` and a Sand `#fef3c7`: a board or file
with either reads as the new Paper `#f3ede1` (21Board writes that back the next time it saves the board).

`pattern` is kept but not shown: Settings no longer offers patterns, and the board draws none. It is still read,
checked, saved, exported and imported as before, so an older 21Board (which shows them) and a later one that brings
them back keep each board's choice. `"handwriting"` (rows for young writers: solid top and base lines, a dashed
midline) and `"graph"` (graph paper: fine squares, a stronger line every 5) were added later; an older 21Board shows
no pattern for them, and an import there turns them into `"none"`. Any other value reads as `"none"`.

### `devfile:<widgetId>` (this device only)

A test widget uploaded under Settings → Advanced → Developer mode → *Test a widget* → *Upload file…* (see
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

Board Sync's link to a shared Google Drive folder (see README, "Board Sync"). Never
exported. `link:folder` holds the folder handle Chrome gives 21Board (stored as is, not as JSON).
`link:state`:

```js
{
  device: { id: "…", label: "my laptop" },   // label: what other devices show ("updated on …")
  auto: false,                               // "Send automatically" (a switch, on from the end of setting up): a few seconds after the changes stop
  photo: true,                               // include the background photo in sent files
  boards: { "<board uid>": {
    file: "Room 12.21board",       // the board's file in the folder, as this device last wrote or loaded it
    also: ["Room 12 (2).21board"], // files it used for the board before that are still there (removed at its next send)
    seen: ["<version id>", …],     // versions sent or loaded here (newest 40): anything else is new to this device
    headId, headMine,              // the version this board was built on, and whether this device sent it
    sentAt, sentSig, loadedSentAt, loadedFrom, loadedSig,
    setupSig,                      // the board as it was when Board Sync was set up here (see below)
    photo: true,                   // what the version last sent or loaded here said about the photo: true (it had one), false ("background": null), absent (nothing)
    want: { ref: { file, w, h, bytes, name, addedAt }, look, keep: "<addedAt>-<bytes>-<w>x<h>" | "", since } | null } },
                                   // the photo the version loaded here names, not here yet (see below)
  late: { "room 12.21board": { size, lastModified } },  // files that couldn't be read and were waited for in full (not waited for again while they stay as they are)
  tidy: { at, seen: { "<photo file>": <when first found unused> } }   // the last tidying of Photos (see below)
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
before the last send still counts as changed. `setupSig` is the same fingerprint of each page as it was when
Board Sync was set up on this device (which turns *Send automatically* on): *Send automatically* doesn't send a
board that is still as it was then, so setting up sends nothing by itself (and a board never sent from here isn't
sent for a tap that brings a window to the front). Sending or loading clears it. (A state saved with
`calm: true`, the old *When left alone*, reads as `auto` alone.)

In the folder, 21Board writes one `<board name>.21board` per board (a full backup with `board.uid` and a
`sent` block, below, that names its photo instead of holding it), renames it when the board is renamed (the
files this device used for the board before are removed once it has seen the versions in them), keeps the
photos in `Photos/` (below), and adds `About this folder.txt`. Other files are left alone.

**`Photos/`**: each background photo once, as the picture file itself (JPEG, PNG or WebP bytes, not base64),
named `<the first 32 hex digits of the SHA-256 of its bytes>.jpg` (or `.png`, `.webp`). Boards with the same
photo share the file. A send writes the photo there first if it isn't there whole (and again if it is over a
day old, so tidying can't take it), then the board file; if writing the photo fails, the send fails and no
board file names it. The fingerprint is worked out once per photo (kept in memory, by the photo's data URL).
A device that loads a board file reads the photo only if it hasn't that photo already. The file is checked as
an imported photo is: a plain fingerprint name (no paths), JPEG, PNG or WebP by its first bytes, its bytes'
SHA-256 matching its name (so half a file still arriving isn't used), under 16e6 characters as a data URL,
about 6.5 MP at most, and it must open. One that isn't is not read again until its size or date changes.

`want`: Google Drive often brings the board file before the photo. The board is then loaded with the photo this
device had (`keep`: which one), and the photo it names (`ref`, `look`) is looked for at each check (once a
minute after `LINK_ARRIVE_MS` from `since`) and put on when it is there; the board's `sentSig`/`loadedSig`
follows, so that isn't a change to send. While it waits, a send from this device names `ref` (the board's photo),
not the photo it kept, shown as `look` (a change to how the photo is shown, made here meanwhile, goes into `look`).
A photo put on or removed here meanwhile (no longer `keep`) is this device's own: `want` is dropped. So it is
when the board's content is replaced otherwise (Undo, going back in Board history, Import), when the folder is
unlinked or another is chosen, and a week after `since`. Once `ref` has had `LINK_ARRIVE_MS` and isn't in
`Photos/` at all (deleted, or the board file came from another folder), a send names this device's own photo
instead (or nothing, without one) and `want` is dropped. Only Load waits for a photo: a sent file opened with
Import that names a photo this device can't find is taken as saying nothing about it (`photo` absent).
Undo after Load (or after Import of a sent file) puts the board's record back as it was before, without the
version loaded in `seen`, so that version is offered again and nothing is sent over it.

`tidy`: a photo that no `.21board` file in the folder names (Google Drive's own copies, `<fingerprint> (1).jpg`,
never are) is deleted when its date is over 7 days old and this device has found it so on two looks at least an
hour apart (`seen`; a note over 2 days old is taken afresh). A look happens at most once in 20 hours (`at`), after
a good check of the folder, not while any board file in the folder can't be read or none was found, and not in
the first `LINK_ARRIVE_MS` (10 minutes) after 21Board opens, the device wakes or the folder comes back (Google
Drive may still be bringing board files that name the photo). Other files in `Photos/` are left alone.

### `media:<b>:background` and `media:<b>:background-look`

```js
// media:<b>:background — the picture
{ data: "data:image/jpeg;base64,…", w: 2560, h: 1707, bytes: 412345, name: "class.jpg", addedAt: 1762713600000 }
// media:<b>:background-look — how it's shown
{ on: true, fit: "fill" | "whole", focus: { x: 0.5, y: 0.5 }, fade: 0 }
```

`on: false` keeps the photo but doesn't show it: Settings → Appearance → Background treats the photo as one of its
choices, so picking a color hides the photo and picking *Photo* shows it again (over the color picked last).
`fill` covers the board (cropped), `whole` fits all of it with the board color around it; `focus` (0–1 from
the top-left) is the part that stays in view when cropped (the CSS `background-position`); `fade` (0–0.7)
blends it toward the board color. Everything about the photo is in these two records, none of it in
`board:<b>`: the photo belongs to the device, and without these records the board shows its color.

Chosen in Settings → Appearance → Background → *Add photo…*, then shrunk on the device (long side at most 2560 px,
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
  createdAt: 1762713600000,
  wid: "timer@1762713600000",               // which window this is, on every device (Board Sync)
  copyOf: null                              // or, on a copy kept from a clash: { wid, from, name, at } (below)
}
```

`wid` (`^[\w.@~-]{1,120}$`) is the window's identity across devices: `<widgetId>@<createdAt>` when it is made, with
`.2`, `.3`… if that is taken on the page. Reopening a closed window, going back in Board history, *Put back* and
Import › *Replace* keep it; Import › *Add* gives each window a new one (and a `createdAt` of its own). A window
without one (from before) gets its default the first time Board Sync looks at the board; of two windows with the
same `wid`, the higher instance number gets a new one. `z` is this device's own: Board Sync never takes another
device's.

`copyOf` marks a copy that Board Sync kept when the same window's content was changed on two devices at once: `wid`
is the original window's, `from` the device whose version this is (its Board Sync id), `name` that device's name,
`at` when that version was made. Its title bar shows "Copy · 9:41 AM". It goes (`null`) once the copy is moved,
resized or changed: the copy is then an ordinary window.

`rect` is where the teacher *put* the window, in **layout space** (below). It only changes when
the window is moved or resized, never because the screen changed.

#### Layout space

Window rects are in **layout px**: the CSS px the window's widget sees. They are drawn on screen with one
zoom factor, so the board looks the same everywhere:

- **Widescreen, a 16:9 board** (`shape: "16:9"`, the default): the board is `1920/scale × 1080/scale` layout px
  (2400 × 1350 at the default 80%). It is drawn as large as fits the window (zoom
  `min(screenW / boardW, screenH / boardH)`), centered left-to-right and top-aligned; the rest of the
  window is lightly shaded. Windows are kept inside the board, so every screen shows the same
  arrangement. Pointer movement is divided by the zoom, so drags follow the finger.
- **Fill** (`shape: "free"`; Settings → Appearance → Board shape): the board is the whole window at zoom = `scale`. Windows that don't
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
  reason: null | "reset" | "delete" | "close-all" | "emptied" | "photo" | "import" | "add" | "load" | "restore" | "window" | "erase"
        | "merge" | "undo" | "join" | "take",
  label, sig, uid, name, bytes, photo: "<key>" | null | "gone",
  thumb: { bg, pattern, shape, vw, vh, wins: [[ikey, x, y, w, h], …] },              // open windows, back to front
  wins: { "<ikey>": [open, createdAt, dataHash, confHash, dataLength, excerpt] },
  beforeBig, link: "sent" | "loaded" | null, keepUntil, manual, manualLabel, folder, tab,
  deletedAt }                                                                         // the page was deleted then (ms)
```

Versions before Board Sync merges (`reason: "merge"`, "Before changes from the laptop") may be of a page that isn't
shown: `uid` and `name` are that page's. A risky merge (deleting or bringing back, emptying content, a clash, a photo
replaced) always saves one first; otherwise a page nothing was changed on here gets at most one an hour. "Before
undoing the changes from …" (`undo`) comes before the Undo of a merge. When a deleted page's records go (its Undo is
over), its versions stay, marked with `deletedAt`, for 30 days: Board history › *Deleted pages* lists them, and *Bring
back* adds the page again from its newest version, under its old `uid`. Then they go.

`sig` is the content fingerprint the shared folder uses (window stacking order doesn't count), without this
device's theme and accent (going back never changes them), so identical versions aren't saved twice. `link`:
the board was, when the version was saved, as this device last sent it to the shared folder (`"sent"`) or loaded
it from there (`"loaded"`, compared with the folder's own fingerprints). A `"loaded"` version is another device's,
and isn't copied to the folder (that device keeps the copies) unless it was saved by hand. Retention is in
README, "Board history". Settings (device only): `historyEvery` (minutes, 0 = off; default 10) and
`historyFolder` (default true).

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
- **Delete** (Settings → This page → Saved widgets) removes the `inst`, `data` and `conf` records.
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

**Board Sync's writes** (section 13d) are the exception: a record a merge wrote has `m: 1`, and a tab with a change
to that record still waiting neither drops it nor shows the merged record; the change is written, and the next look
at the board finds both and keeps both. Each record a tab writes also says what it was based on:

| Field | Meaning |
| --- | --- |
| `base` | the record's `rev` this tab knew when the change was queued (the earliest, when several coalesce). Missing: written around the queue (Import, a deleted page's purge), not tracked. Within 1.5 s of showing a merged write, a widget's save gets the revision before the merge; a tab that didn't show one (it had a change waiting) gives every save of that record that revision until it shows a merged write of it. Either way the save counts as made without the merge. |
| `m` | `1`: written by a Board Sync merge, never by a tab's own change. |
| `u` | `1`: written by the Undo of a merge, so that other devices can say "The laptop undid …". |

`settings` is written as a **patch**: only the keys a change gave are put over the stored record, inside the
transaction (and the keys an older 21Board used, `devWidgets`, `awakeFrom` and `awakeTo`, are dropped), and
`deletedBoards`/`deletedAt` change only by adding or removing a page, so a tab with an old copy of the settings can't
write its old lists (or `boards`) over newer ones.

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
  "media": { "background": { "data": "data:image/jpeg;base64,…", "w": 2560, "h": 1707 }, "look": { "on": true, "fit": "fill", "focus": { "x": 0.5, "y": 0.5 }, "fade": 0 } },   // full backups only; a sent file names the photo instead (below), and "background": null says the board's photo was taken off
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

**A file sent to a shared folder** (Board Sync) names its photo in the folder's `Photos/` instead of holding it,
so it stays a few KB:

```js
"media": {
  "background": { "file": "3fa9c1d2e4b5a6f70123456789abcdef.jpg", "w": 2560, "h": 1707, "bytes": 412345, "name": "class.jpg", "addedAt": 1762713600000 },
  "look": { "on": true, "fit": "fill", "focus": { "x": 0.5, "y": 0.5 }, "fade": 0 }
}
```

`file` must be exactly 32 lowercase hex digits and `.jpg`, `.png` or `.webp`; anything else (a path, `..`, another
name) is read as saying nothing about the photo, and the device keeps its own. Opened with Import, such a file
gets the photo from `Photos/` of the folder this device is linked to, if it is there (or the device has it);
otherwise the device keeps its own. (To give a board to someone, use Export: the board files in the folder don't
hold their photos.)
Exports, backups and Board history keep doing as before (the photo inside, or left out).

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
  renumbered to the next free number per widget, and windows are nudged into free space. Each added window gets a
  new `wid` and a `createdAt` of its own; *Replace this page* keeps the file's `wid`s (or makes the default from
  their `createdAt`), so a restored backup of a page is the same windows on every device.

Importing an all-pages file offers **Add these pages** (each becomes a new page, after this device's pages,
as with *Open as a new page*) or **Replace all pages** (asked again; the file's pages are added, then this
device's pages are deleted, with Undo for 20 seconds, which brings them back and takes the new ones away). With
*Replace all pages* the file's pages keep their `board.uid` even though the pages they replace have it, so a
restored backup is the same boards in the Google Drive folder. Either way it is all or nothing: if a page can't
be added, those that were go again and this device's pages stay.

*Replace* keeps this device's background photo unless the file brings one (or is a sent file that says the board's photo was taken off: `"media": { "background": null }`, written only by a device whose last sent or loaded version of the board said something about a photo; a device that has already loaded or sent "taken off" keeps a photo put on there since), and takes the file's `scale` and `shape`, so the board looks exactly as it did (zoomed to fit
this screen); a file from before board sizes existed is fitted into the 16:9 board. *Add* fits the
file's whole board into this one with one uniform factor, keeping shapes and spacing.
