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
| `inst:<b>:<appId>:<n>` | `inst` | One window/instance: geometry, open/closed, stacking |
| `data:<b>:<appId>:<n>` | `data` | That instance's **content** — whatever the sub-app passed to `Board21.save()` |
| `conf:<b>:<appId>:<n>` | `conf` | That instance's **config** — whatever it passed to `Board21.saveConfig()` |
| `media:<b>:background` | `media` | The board's **background photo** (see below). Kept apart from `board:<b>` because it's big |

App ids are limited to `a-z 0-9 -`, so keys can be split on `:`.

The board id is in every key so that **multiple boards** (a planned feature) can be added
without changing the format: `settings.activeBoard` will choose which board is shown.

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
  lastBackupAt: null,      // ms of the last full backup export, for backup reminders
  devMode: false,
  devApps: [               // test sub-apps added in Developer mode
    { id: "dev-apps-my-app", name: "My-app (test)", entry: "apps/my-app/index.html" }
  ],
  activeBoard: 1
}
```

### `board:<b>`

```js
{
  id: 1, name: "My Board",
  background: {
    color: "#1f3a2c" | null, pattern: "none" | "dots" | "grid" | "lines",
    image: null | { on: true, fit: "fill" | "whole", focus: { x: 0.5, y: 0.5 }, fade: 0 }   // how the photo is shown
  },
  scale: 0.8,                    // size of windows and menus (0.5–2), as on a 1920 × 1080 screen; see "Layout space"
  shape: "16:9",                 // "16:9" (default) | "free" (fills any window)
  layout: { w: 2400, h: 1350 }   // the 16:9 board in layout px: 1920/scale × 1080/scale (kept for older readers)
}
```

`color: null` means "match the light/dark theme".

`background.image` only says how the photo is shown: `fill` covers the board (cropped), `whole` fits all
of it with `color` around it; `focus` (0–1 from the top-left) is the part that stays in view when
cropped (it's the CSS `background-position`); `fade` (0–0.7) blends it toward the board color. The
picture itself is in `media:<b>:background`; if that record is missing on a device, the board simply
shows its color.

### `media:<b>:background`

```js
{ data: "data:image/jpeg;base64,…", w: 2560, h: 1707, bytes: 412345, name: "class.jpg", addedAt: 1762713600000 }
```

Chosen in Settings → Appearance → Background photo, then shrunk on the device to at most 2560 px on
the long side and saved as a JPEG (usually 0.2–0.9 MB). It covers the 16:9 board (not the shaded
margins), or the whole window when the board shape is unlocked.

Media records are kept apart from the small records on purpose: anything that copies boards between
devices with tight size limits (for example a sync through a browser extension) can skip `media:*`
and let each device set its own photo; the board still works without it.

### `inst:<b>:<appId>:<n>`

```js
{
  appId: "timer",
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

Window rects are in **layout px**: the CSS px the window's app sees. They are drawn on screen with one
zoom factor, so the board looks the same everywhere:

- **16:9 board** (`shape: "16:9"`, the default): the board is `1920/scale × 1080/scale` layout px
  (2400 × 1350 at the default 80%). It is drawn as large as fits the window (zoom
  `min(screenW / boardW, screenH / boardH)`), centered left-to-right and top-aligned; the rest of the
  window is lightly shaded. Windows are kept inside the board, so every screen shows the same
  arrangement. Pointer movement is divided by the zoom, so drags follow the finger.
- **Any shape** (`shape: "free"`): the board is the whole window at zoom = `scale`. Windows that don't
  fit a smaller window are moved inside when drawn (their saved rect is kept).
- **Scale** (`scale`): how big windows, title bars and menus are, as on a 1920 × 1080 screen (at 1.0, a
  window's CSS px are screen px there). Changing it multiplies every rect by `old/new`, so windows keep
  their footprint on the board and their contents are drawn bigger or smaller. Board chrome (menus,
  the App Picker, Settings, toasts, dialogs) is drawn at this scale too.
- Resize handles and the focus ring stay at the board's scale even when the board is drawn smaller
  (up to 2.5×); snap reach and push-to-overlap are measured in screen px.

A board saved before `scale` existed (its rects are screen px, or px of the earlier optional
`layout`) is converted once on load: that space (grown to contain every window) is fitted into the
16:9 board with one uniform factor, centered, so the arrangement looks the same on that screen.
Exports write the board's `scale` and `shape`, and the space the rects are in as `viewport`.

### `data:…` and `conf:…`

Any JSON value the sub-app saved. The format is up to each sub-app; document it at the top of the
sub-app's script. Missing record = nothing saved (`null` in the SDK).

---

## Instances: numbering, closing, reopening

- Opening an app when **no closed instance exists** creates the lowest unused number
  (`timer:1`, then `timer:2`, …).
- **Closing** a window only sets `open: false`. Its `data`/`conf` stay.
- Opening the app again reopens the **lowest-numbered closed instance**, restoring its position,
  size and content. With `timer:1` and `timer:2` both closed: first open → `timer:1`,
  second → `timer:2`, third → new `timer:3`.
- **Reset** (window menu) deletes that instance's `data` and `conf` and restores the default size.
- **Delete** (Settings → Saved app windows) removes the `inst`, `data` and `conf` records.
- Records for an app that isn't installed are kept (and exported) but not shown.

---

## Keeping several open copies in sync

Several tabs or windows of 21Board can be open on one device. All show the same board.

1. Every change is written to IndexedDB first. Rapid changes are coalesced into one transaction,
   and each record's `rev` is read and incremented **inside** that transaction.
2. When the transaction commits, the tab posts `{ tab, keys: [...] }` on the
   `BroadcastChannel("21board-sync")` (or, in older browsers, writes it to
   `localStorage["21board-sync"]` to fire a `storage` event — the same trick 21Sketch uses).
3. Other tabs re-read just those keys and apply any record whose `rev` is newer than the one they
   last saw. Windows move, open or close; sub-apps get `data` / `config` events.
4. While someone is dragging or resizing, incoming changes are held and applied when the gesture
   ends, so a window never jumps out from under a finger.
5. When a tab becomes visible again (or is restored from the back/forward cache), it re-reads
   everything, in case it missed messages while frozen.
6. Import and Erase post `{ op: "reload" }`; other tabs rebuild from IndexedDB.
   Reset posts `{ op: "reset", board, ikey }`; other tabs reload that window.

Two copies editing the *same* record at the *same* moment: the later write wins, and both copies
then show it.

---

## The .21board file

**Export** (App Picker → ⤓) downloads a UTF-8 JSON file with the `.21board` extension.
**Import** (App Picker → ⤒, dropping a file on the board, or opening one with the installed app
on Chrome) reads it.

```js
{
  "format": "21board",            // required
  "formatVersion": 1,             // files from a newer version are refused with a message
  "kind": "full",                 // "full" = backup, "template" = layout only
  "exportedAt": "2026-11-09T18:30:00.000Z",
  "generator": "21Board 1.0.0",
  "viewport": { "width": 2400, "height": 1350 },   // the space the rects are in (the 16:9 board, grown to fit every window)
  "theme": "light",
  "accent": "blue",
  "board": {
    "name": "Room 12",
    "background": { "color": null, "pattern": "dots" },
    "scale": 0.8,
    "shape": "16:9"
  },
  "media": { "background": { "data": "data:image/jpeg;base64,…", "w": 2560, "h": 1707 } },   // full backups only
  "instances": [
    {
      "appId": "timer",
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

Importing offers two choices:

- **Replace my board** — removes this board's current windows and content, then loads the file
  (including its board name, background, theme and accent color).
- **Add to my board** — keeps everything and adds the file's windows. Instance numbers are
  renumbered to the next free number per app, and windows are nudged into free space.

*Replace* takes the file's `scale` and `shape`, so the board looks exactly as it did (zoomed to fit
this screen); a file from before board sizes existed is fitted into the 16:9 board. *Add* fits the
file's whole board into this one with one uniform factor, keeping shapes and spacing.
