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
  devMode: false,
  devApps: [               // test sub-apps added in Developer mode
    { id: "dev-apps-my-app", name: "My-app (test)", entry: "apps/my-app/index.html" }
  ],
  activeBoard: 1
}
```

### `board:<b>`

```js
{ id: 1, name: "My Board", background: { color: "#1f3a2c" | null, pattern: "none" | "dots" | "grid" | "lines" } }
```

`color: null` means "match the light/dark theme".

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

`rect` is where the teacher *put* the window. If the screen is smaller (another device, a
resized browser), 21Board shrinks and moves the window to fit **when displaying it**, but doesn't
overwrite `rect` unless the teacher moves the window. Making the screen bigger again restores
the original layout.

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
  "viewport": { "width": 1920, "height": 1080 },   // screen size when exported
  "theme": "light",
  "board": {
    "name": "Room 12",
    "background": { "color": null, "pattern": "dots" }
  },
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

Importing offers two choices:

- **Replace my board** — removes this board's current windows and content, then loads the file
  (including its board name, background and theme).
- **Add to my board** — keeps everything and adds the file's windows. Instance numbers are
  renumbered to the next free number per app, and windows are nudged into free space.

If the file's `viewport` differs from the current screen by more than 5%, window rectangles are
scaled to fit the new screen.
