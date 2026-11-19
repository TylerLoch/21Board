# 21Board data format

21Board stores everything **on the device**, in the browser's IndexedDB. With Board Sync, the board is also in
the teacher's Google Drive folder. 21Board has no servers.

- [IndexedDB layout](#indexeddb-layout)
- [Record types](#record-types)
- [Board history](#board-history)
- [Instances: numbering, closing, reopening](#instances-numbering-closing-reopening)
- [Keeping several open copies in sync](#keeping-several-open-copies-in-sync)
- [The .21board file](#the-21board-file)

---

## IndexedDB layout

| | |
| --- | --- |
| Database | `21Board` (version 1) |
| Object store | `records`, `keyPath: "key"` |

The dev window's test board uses the same layout in its own database, `21Board-dev`, or in memory where
storage is blocked, with its own sync channel, `21board-dev-sync`. It never touches `21Board`.

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

Keys (`<b>` = board id, one per page; `<n>` = instance number):

| Key | `type` | `value` |
| --- | --- | --- |
| `settings` | `settings` | Board-wide preferences (below) |
| `board:<b>` | `board` | Board name and background |
| `inst:<b>:<widgetId>:<n>` | `inst` | One window/instance: geometry, open/closed, stacking |
| `data:<b>:<widgetId>:<n>` | `data` | That instance's **content**: whatever the widget passed to `Board21.save()` |
| `conf:<b>:<widgetId>:<n>` | `conf` | That instance's **config**: whatever it passed to `Board21.saveConfig()` |
| `media:<b>:background` | `media` | The board's **background photo** on this device (see below). Kept apart from `board:<b>` |
| `media:<b>:background-look` | `media` | How that photo is shown on this device |
| `devfile:<widgetId>` | `devfile` | A test widget uploaded as a file in Developer mode (below). This device only |

Widget ids are limited to `a-z 0-9 -`, so keys can be split on `:`.

The board id is in every key. Each **page** is a board of its own (`board:<b>`, `inst:<b>:…` and so on).
`settings.activeBoard` is the page every tab on the device shows, and `settings.boards` is the pages' order.
Page ids are never reused. `settings.lastBoard` is the highest one used, and a new page also skips any id that
still has records or Board history. A deleted page waits in `settings.deletedBoards`, records and all, while its
Undo is offered; `settings.deletedAt` says when it was deleted. Then its records and its Board history are
deleted. If 21Board closed before the Undo ended, the page is cleared the next time 21Board opens, once a little
over 20 seconds have passed since it was deleted. A tab opened meanwhile never clears a page whose Undo another tab
still offers. A record of a page missing from `settings.boards`, and not deleted, shows as a page at the end,
never hidden. Two pages never share a `board.uid` (see Import below). *Erase everything* keeps the id of the page
shown, so its Board history ("Before erasing everything") stays that page's. The other pages' Board history goes.

While 21Board is open, each tab also holds the other pages' records in memory. If the browser throws the
database away under an open board, every page is written back, not just the one shown. A backup made when
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
  accent: "blue",          // the accent every release reads: "blue" | "purple" | "red" (shown as Rose) | "orange" | "green" | "slate".
                           //   "blue" for a custom color. "pink" and "teal", from before 2026.11.18-2, show as Blue.
  accentColor: "#8040c0",  // from 2026.11.18-2: the accent chosen, one of the six or a custom "#rrggbb" (lowercase);
                           //   "" before any. It shows while accent goes with it: itself, or "blue" for a custom color.
                           //   Otherwise a release before 2026.11.18-2 chose accent since, and accent shows.
  themeAt: 1794460416170,  // when the theme, the accent and the text style were last chosen on this device (ms; set by
  accentAt: 1794460410000, //   a change made here, never by Board Sync): of two choices made apart, the later wins on
  lettersAt: 1794460420000,//   every device (lettersAt from 2026.11.17-2, accentColorAt from 2026.11.18-2)
  accentColorAt: 1794460410000,
  locked: false,           // Settings → Classroom → Lock windows in place
  awake: "off",            // Settings → Classroom → Stay awake: "off" | "on" (the screen is kept on while 21Board is showing)
  clock: "auto",           // Settings → Advanced → Clock in the corner: "on" | "off" | "auto" (the default: only in full screen)
  letters: "standard",     // Settings → Appearance → Text style (called Letters before 2026.11.17-2): "standard" (the device's own font) | "legible" (Atkinson Hyperlegible) | "early" (Andika, as "21Board Early Readers")
  lastBackupAt: null,      // ms of the last full backup (an export of every page, or Board Sync writing this device's
                           //   file), for backup reminders and the amber dot on Settings → Advanced (only when overdue)
  devMode: false,          // Settings → Advanced → Developer mode
  activeBoard: 1,          // the page shown, in every tab (start-up falls back to the first page if it is gone)
  boards: [1, 3, 2],       // the pages in order (board ids)
  deletedBoards: [],       // pages deleted while their Undo is offered
  deletedAt: {},           // when each of those was deleted (ms), e.g. { "2": 1794460416170 }
  lastBoard: 3             // the highest page id used so far (never used again)
}
```

Only `theme`, the accent and `letters`, the text style, go into exported files, and so into the device files in the
Google Drive folder. Before 2026.11.17-2, `letters` stayed on the device. An export's `accent` is the accent shown:
one of the six, or a custom color. A device file has `accent` and `accentColor` as they are stored. With Board Sync
they are the board's, on every device linked to the folder, and the later choice wins, as for a page's name (see
`link:sync.style` below). *Import › Replace this page* takes the file's values as a choice made here, so they sync.
A file without `letters` leaves the text style as it is. Its Undo puts back the values it replaced, again as a
choice made here, so that syncs too. The other ways to import, and going back in Board history, never change them.
`locked`, `awake` and `clock` belong to this device. They are never in exports, Board history or the Google Drive
folder, and an import leaves them as they are.

Older versions had a third choice for `awake`, `"hours"` (school hours, Monday to Friday, from `awakeFrom` to
`awakeTo`, `"HH:MM"`). 21Board reads `"hours"` as `"on"`, since the teacher wanted the screen on in class. It drops
`awakeFrom` and `awakeTo` when it reads the record, so the next save of the settings leaves them out.

Before 2026.11.18-1, `clock` was in Settings → Appearance: `"off"`, `"time"` or `"date"`, the default. 21Board
reads `"date"` as `"auto"`, because most devices saved it without anyone choosing it. It reads `"time"` as `"on"`,
and any value it doesn't know as `"auto"`. The record keeps its old value until someone changes Clock in the corner.
An older release reads `"on"` and `"auto"` as its own default, Time and date.

Older versions also kept `devWidgets` here: test widgets added in Developer mode by their path on the site
(`[{ id, name, entry }]`). That way of testing a widget is gone. 21Board ignores `devWidgets`, whatever it
holds, and drops it when it reads the record, so the next save of the settings leaves it out. Windows of those
widgets are kept like any window whose widget isn't installed: hidden, and listed in Settings as *Widget not
installed*. Test widgets are now uploaded as a file. See [`devfile:<widgetId>`](#devfilewidgetid-this-device-only).

### `board:<b>`

```js
{
  id: 1, name: "Page 1",         // id: the board's slot on this device
  uid: "7c1e…",                  // a unique id, made once: the same page on every device (Board Sync)
  background: { color: "#1f3a2c" | null, pattern: "none" | "dots" | "grid" | "lines" | "handwriting" | "graph" },
  scale: 0.8,                    // size of windows and menus (0.5–2), as on a 1920 × 1080 screen; see "Layout space"
  shape: "16:9",                 // "16:9" (Widescreen, the default) | "free" (Fill: fills any window)
  layout: { w: 2400, h: 1350 },  // the 16:9 board in layout px: 1920/scale × 1080/scale (kept for older readers)
  pos: 2                         // the page's place among the pages: they are in (pos, uid) order
}
```

A new device's first page is "Page 1". On devices set up before 2026.11.18-10 it's "My Board". Saved pages keep
their names. Board Sync never sends an untouched first page by either name. That empty page would otherwise be added
to every board that joins.

`uid` is which page this is, on every device and in Board history. Board Sync merges pages by it. Two pages on one
device never share one. `pos` orders the pages. A new or moved page gets a `pos` between its neighbors'. When the
gap gets below 1e-6, every page is numbered 1, 2, 3… again. `settings.boards` is this device's copy of that order,
rebuilt from `pos` when they disagree, never the other way round. A page from before `pos` existed gets its place
in `settings.boards` plus 1 the first time Board Sync looks at the board.

`color: null` follows the light or dark theme. Settings offers White `#ffffff`, Paper `#f3ede1`, Sky `#e0f2fe`,
Mint `#dcfce7`, Blush `#fce7f3`, Lavender `#ede9fe`, Slate `#334155`, Chalkboard `#1f3a2c`, Navy `#1e293b`, Black
`#0a0a0a`, or any color (Custom…). Older versions had a lighter Paper `#faf7f0` and a Sand `#fef3c7`: a board or file
with either reads as the new Paper `#f3ede1`, which 21Board writes back the next time it saves the board.

`pattern` is kept but not shown. Settings no longer offers patterns, and the board draws none. It is still read,
checked, saved, exported and imported as before, so each board keeps its choice for an older 21Board, which shows
patterns, and for a later one that brings them back. `"handwriting"` (rows for young writers: solid top and base lines, a dashed
midline) and `"graph"` (graph paper: fine squares, a stronger line every 5) were added later; an older 21Board shows
no pattern for them, and an import there turns them into `"none"`. Any other value reads as `"none"`.

### `devfile:<widgetId>` (this device only)

A test widget uploaded under Settings → Advanced → Developer mode → *Test a widget* → *Upload file…* (see
[docs/WIDGET-SDK.md, "Inside 21Board"](WIDGET-SDK.md#inside-21board)). `widgetId` is `dev-` plus the id in the
file's manifest block, or its name. Never exported, and never written by an import, so a `.21board` file
can't bring code that runs. *Erase everything* deletes it. While one starts, `localStorage["21board-devfile-starts"]`
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

### `link:folder`, `link:state`, `link:sync` and `link:mine-<uid>` (this device only)

Board Sync's link to a shared Google Drive folder, and its bookkeeping (see README, "Board Sync"). Never exported,
never in Board history. `link:folder` holds the folder handle Chrome gives 21Board (stored as is, not as JSON).
`link:state`:

```js
{
  device: { id: "…", label: "the laptop" },   // label: "This device's name", shown on the other devices and in this device's file name
  tidy: { at, seen: { "Photos/<photo file>": <when first found unused> } },   // the last tidying of Photos (see below)
  shown: { "<page uid>": <when last shown here> }   // for the note on a page changed while it wasn't shown
}
```

`link:sync` (the ledger's head) and `link:mine-<page uid>` (one per page, deleted pages too) are written only by
the tab that holds the Web Lock `21board-link`, in the transaction of a round, never through the Writer. They hold
fingerprints and versions of the board's parts, never the board's values:

```js
// link:sync
{ v: 1, dev: "k3j9a1b2c3d4",                       // this device's key: its id without dashes, 12 characters
  folder: "f7q2m9x0c1d4", folderName: "21Board",   // the folder's id (made by the first device, taken by the others: the smaller wins), and its name
  dir: <FileSystemDirectoryHandle>,                // where the browser can store one (linking the same folder again carries on)
  mode: null, first: false, linkAt,                // a folder just linked: 'wait' until the first look decides 'seed' | 'join' | 'take' | 'carry'; first: that round deletes nothing anywhere
  other, switched, goneThere, keptThere,           // a take from another folder, for set-up's last step: that folder's name, and the pages shown here that it has as deleted (and how many others)
  dropHere: null | ["<page uid>"],                 // after a take's round: this device's own page that was shown then, removed here (only) once another page is shown
  ctr, maxSeen,                                    // the last counter given out; the highest merged from other devices (at most a day ahead of this clock)
  seq, writes: ["q7c2m0x1", …], wseqs: [ … ],      // the last write's sequence number (never goes back), the last 20 write ids and their seqs, noted before each write
  file, sum, partsH, wroteAt, refs: { "<page uid>": { file, w, h, bytes, name, addedAt, key } },   // the last file written, its checksum, a fingerprint of its parts, when, and the photos it names
  localAt,                                         // when a change made here was last found (for "Not synced" in a folder that can only be viewed)
  peers: { "<dev>": { seq, seen, changedAt, name, file, at, left, missingSince, folder } },   // every device seen in the folder; changedAt and missingSince are this device's clock
  last: { dev, name, at }, gcAt, left: null,       // the last merge that changed something here; Unlink or Erase's last write
  dropped: { "<page uid>" | "<page uid> <wid>": { vv, at } },   // deletions collected here (gc) in the last 30 days
  style: { theme: { h, v: [by, {dev: n}, t] }, accent: { h, v }, letters: { h, v }, accentColor: { h, v } } }   // the board's theme, accent and text style: their parts (below)

// link:mine-<page uid>: the page's parts and its windows' parts, each { h: fingerprint, v: [by, {dev: n}, t], rev }
{ uid, b, p: { exists, name, look, size, pos, photo, photoLook }, w: { "<wid>": { ikey, p: { exists, rect, open, data, conf, label } } },
  hist: { at, local }, quiet: { from: ["<dev>"], at, t } | null, gone: null | { exists, cover, seq, seen }, wgone: { "<wid>": { exists, cover, seq, seen } } }
// (quiet.at: when a merge changed the page here, for "shown since"; t: when the newest of those changes was made, which the note says)
```

A part's entry may also hold:

- `pending`: content versions kept beside the main one, with their values, until a copy is made.
- `applied`, `prevH`, `prevV` and `val`: what a merge wrote to it, the fingerprint and version it had before, and
  the value written. They are kept until a change based on that write is written, and kept by a later merge that
  writes another part of the same record (see "Keeping several open copies in sync").
- `prevHs`: when merges wrote the part again before any change here was based on them, the fingerprints it had in
  between, all of them old values. `prevH`/`prevV` stay the first.
- `prevSc`: for a place a merge converted to a new page scale, the scale it was at, so the old place written back
  by a tab that hadn't seen it is known by its fingerprint there.
- `lh`: a place written at this page's scale from another's, or rescaled here. Not a move.
- `s1`: a place's version at scale 1, unrounded. A place rescaled here that rounds to another whole pixel is the
  same place if it is within half a pixel of it.
- For the photo, `ref` and `put` (its file in `Photos/`) or `hold` (a photo not here yet).

`keep` (on a page) is a fingerprint of the page as shown here when it was deleted elsewhere while shown here and
this device had no entry of its own for it. Only an edit made here brings it back. Beside it, `keepW` (`{ "<wid>": fingerprint }`) holds each window on that page that was
deleted elsewhere too, as shown here then: an edit here that brings the page back leaves such a window deleted
unless it was changed here as well. A round that deletes a page here notes `keepW` the same way (it stays while the
page is deleted), so that the page's Undo or Bring back doesn't bring back a window deleted elsewhere before it, and
a window tombstone that `keepW` names is kept as long as the page's. Neither is ever written to a file. A
tombstone's `seq` is the first write of this device's file that carried it, and `seen` when this device first held
it.

The parts, versions and rules belong to the merge (`board.js` section 13d, the region `Board Sync merge`). A lost
ledger (the browser threw the database away) is rebuilt from this device's own file in the folder; with no file
there, the folder's board is joined as on a first set-up.

**The theme, accent and text style** (`settings.theme`, `settings.accent` and `settings.accentColor`,
`settings.letters`) are four more parts, of the board as a whole, in `link:sync.style` (the text style from
2026.11.17-2, `accentColor` from 2026.11.18-2): `h` is the fingerprint of the value this device has, `v` its version.
They take the later change, as a page's name does, with no copy and no Board history version. A change made here is a
version whose counter is when it was chosen (`themeAt`, `accentAt`, `lettersAt`, `accentColorAt`), not the newest
change stamped with it, so that two made apart (one while unlinked, say) resolve to the later on every device. An
entry with no `v` is a value this device had before it synced with this folder: joining it or switching to it (the
folder's then applies), or a ledger from before 2026.11.16-4, or from before 2026.11.17-2 for the text style (each
device keeps its own until one is chosen on any device, and takes the folder's if one was). It is no change, and
never replaces another device's. Nor is a value never chosen here (no `themeAt`, `accentAt` or `lettersAt`: the
default, a value from before 2026.11.16-4 or a text style from before 2026.11.17-2) that differs from its entry: one
only received, which a ledger rebuilt from this device's file, written before its last merge, doesn't have yet. A
ledger from before then, which has no entry for it at all, takes a value chosen here since (on the newer release,
before its first round: while Chrome asks to reconnect the folder after the update, say) as a change, at its time.
Linking an empty folder (`seed`) makes this device's a version: one chosen here at its `themeAt`, `accentAt` or
`lettersAt` (not at the counters this device brings from another folder, which say nothing about when it was chosen),
one never chosen here at the lowest counter there is, 1, with `t` 0, so that when two or more devices set up the same
folder at once, before any has another's file, a choice made on one of them wins on all (of two, the later; none
having chosen: the tie goes by device id). A version with `t` 0 is nobody's change: a device that takes it says
nothing, and one whose own value has no version (an entry with no `v`) keeps its own, unless it is joining or
switching to the folder. Linking the same folder again (`carry`) keeps the entries, so a choice made while unlinked
counts. A choice made after linking while Google Drive is still bringing the folder (`wait`) is this device's own
when the files arrive: joining or switching to the folder, the folder's applies. A value this release doesn't know (a
text style a newer 21Board added, say) is skipped in a file, as any part is.

A device on a release before 2026.11.18-2 doesn't know `accentColor`. It reads and writes `accent` alone, always a
value it knows. So it shows Blue for a custom color, and never takes the accent for a change of its own, even in a tab
beside a newer one. Its files have no `accentColor`, which says nothing about it. An accent chosen there shows on every
device: `accentColor` gives way once `accent` no longer goes with it.

A device on 2026.11.16-4 doesn't know the text style: its files have no `letters` and no `sync.style.letters`, which
says nothing about it (never a change, never a reset back to Standard), and it reads past both in a newer device's
file, so the text style chosen on a newer device never reaches it and its rounds stay as quiet as before.

A vector is written with its devices in sorted order, in files and in the ledger, so that the same version joined
from the same devices in another order (two or more devices setting up one folder at once) is the same text and
causes no write.

Comparing versions: one is older than another when the other's vector includes it, or when the other includes a
later change to that part by the device that made it (a device's changes to a part follow one another, each made on
what it showed then; one that lost was kept as a copy by that device at once). So a version that joined other
devices' vectors in (made when a copy was kept, content emptied on one side, or equal values met) is replaced by
its device's next change, which is no clash with that device's own older value; its vector joins that change's.
A deletion covers a version the same way (its device's change at that counter, or a later one, was seen). Its
cover also holds the deleting device's own counter at the deletion, so it covers every earlier change that device
made: its own older version of the page or window, still in another device's file after the page came back with
another device's version, say, never brings it back (the same format, read the same way by earlier releases). A
labeled copy's versions are the copy's own: made by `cp<hash of the copy's wid>` (14 characters, so no device's,
which has 12), with the copied version's counter and time, the same on every device that makes it. In a first
round (linking again, a rebuilt ledger), a page or window missing here is taken from the other devices' files,
not from this device's own, whose older version of it mustn't come back as a clash.

**Deletions are forgotten** (`gc`, at most once a day, when every device file in the folder could be read): a
tombstone goes once this device has held it 30 days and every device it has seen in the folder shows it (its file
has the same deletion, or doesn't have the page or window and has merged this device's write that first carried
it, or the device was erased and its file is gone, or its file has been missing for a year). It is then noted in
`link:sync.dropped` for 30 days more, so the files that still hold it don't bring it back here, and it counts as in
this device's board when deciding whether an old device file can go.

**The folder** holds:

- one file per device, `21Board (<this device's name>) [<4 id characters>].21board`, written only by that device.
  It has 8 id characters when another device's file has that name. Google Drive's copies, `… (1).21board`, are
  read too;
- `Photos/`;
- `Board history/`;
- `About this folder.txt`.

Other files are left alone. A renamed device (set-up's last step, or Settings → Board Sync) writes its file under
the new name at its next write, then deletes the old one.

**A device file** is an all-pages backup (see "The .21board file": Import opens it) with, for each page's `board`
and each instance, `v`: the version of each part; instances also carry `wid` (and `copyOf` on a labeled copy),
boards `pos`; content clash versions not yet settled go in an instance's `pending`; and a top-level `sync` block:

```js
"sync": { "v": 1, "dev": "k3j9a1b2c3d4", "folder": "f7q2m9x0c1d4", "name": "the laptop",
          "seq": 1794460416170, "write": "q7c2m0x1", "at": 1794460416170,      // seq orders this device's writes; at is its clock, shown to people only
          "merged": { "<dev>": <seq> },                                        // the newest seq of each other device this file includes
          "gone": { "pages": [{ "uid", "exists", "cover" }], "windows": [{ "page", "wid", "exists", "cover" }] },   // deletions
          "left": null | { "at": … } | { "at": …, "erased": true },              // Unlink, Erase everything
          "style": { "theme": [by, {dev: n}, t], "accent": [ … ], "letters": [ … ], "accentColor": [ … ] },   // the versions of the top-level theme, accent and text style (one with none says nothing about it)
          "sum": "9be0c3…" }                                                   // the first 32 hex digits of SHA-256 of the file with "sum": ""
```

A device file is merged only if:

- it parses;
- `sync.v` is 1 (a newer one shows *Update 21Board*);
- its parts have the expected shapes (a malformed page or window is skipped, never taken for a deletion);
- its checksum matches (a file cut short, or mixing old and new bytes, can still parse);
- its `seq` isn't older than the one merged from that device.

One that fails is read again 30 seconds later even if its size and date stay the same. A device's file is
written only when its parts changed (never for bookkeeping alone), at most every 20 seconds, at once when 21Board
is hidden; its photos are put in `Photos/` first. A file with this device's key that this device didn't write (a
copied profile) is merged, and both installs take new ids. Another device's file is deleted only once it says it
left, 60 days after, and everything in it is merged here, and only as it was read: one whose size or date changed
since (a device that linked again, say) is read again first. The last write before *Change…* (to the folder it
leaves), *Unlink* or *Erase everything*, the one with `left`, also carries the pages deleted here whose Undo is
still offered, as deletions: otherwise the folder left would never hear of them (*Change…* starts a new ledger for
the next folder, *Erase everything* clears it), or only once this device links it again (*Unlink*).

**`Photos/`**: each background photo once, as the picture file itself (JPEG, PNG or WebP bytes, not base64),
named `<the first 32 hex digits of the SHA-256 of its bytes>.jpg` (or `.png`, `.webp`). Pages with the same photo
share the file. A write puts the photo there first if it isn't there whole (and again if it is over 3 days old and
this device has just started naming it, so tidying can't take it); if that fails, the write fails and no file
names it. The fingerprint is worked out once per photo. A device reads a photo another device's file names when
that photo wins, from `Photos/` or a `Photos (n)` beside it; the file is checked as an imported photo is: a plain
fingerprint name (no paths), JPEG, PNG or WebP by its first bytes, its bytes' SHA-256 matching its name (so half a
file still arriving isn't used), under 16e6 characters as a data URL, about 6.5 MP at most, and it must open.
Until it can be used the page keeps its photo; one that isn't good is read again 30 seconds later, or once its
size or date changes.

`tidy`: a photo that no device file in the folder names (Google Drive's own copies, `<fingerprint> (1).jpg`, never
are) is deleted when its date is over 7 days old and this device has found it so on two looks at least an hour
apart (`seen`; a note over 2 days old is taken afresh). A look happens at most once in 20 hours (`at`), after a
full round, not while any device file in the folder can't be read or none was found, and not in the first
`LINK_ARRIVE_MS` (10 minutes) after 21Board opens, the device wakes or the folder comes back. A photo this device's
pages name that is missing from `Photos/` is put again at the next write. Other files in `Photos/` are left alone.

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
`board:<b>`; without these records the board shows its color. With Board Sync the photo is part of the page, like
its color: putting one on, changing how it is shown or removing it reaches the other devices (the picture itself
goes through the folder's `Photos/`).

Chosen in Settings → Appearance → Background → *Photo…*, then shrunk on the device (long side at most 2560 px,
short side kept at 1440 px or more so panoramas stay sharp, about 6.5 MP at most) and saved as a JPEG
(usually 0.2–0.9 MB), or as WebP/PNG if it has transparency (a logo), so the board color shows through. It covers the 16:9 board, not the shaded
margins, or the whole window on the *Fill* board shape.

Media records are kept apart from the small records on purpose. Anything that copies boards between
devices with tight size limits, such as a sync through a browser extension, can skip `media:*`
and let each device set its own photo. The board still works without it.

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
`at` when that version was made. Its title bar shows "Copy · 9:41 AM". It becomes `null` once the copy is moved,
resized or changed, and the copy is then an ordinary window.

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

Any JSON value the widget saved. Each widget sets its own format; document it at the top of the
widget's script. No record means nothing saved (`null` in the SDK).

The Picture widget (`image`) saves `{ src, w, h, name, bytes }`. `src` is a PNG, JPEG, GIF, WebP or AVIF `data:`
URL, its type checked by its bytes. `w` and `h` are its size in pixels, `name` the file's name, `""` when pasted, and
`bytes` its size. `{ src: null }` is no picture, after *Remove picture*. Its config is `{ fit: "whole" | "fill" }`.

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
| `photo` | `key` = `<addedAt>-<bytes>-<w>x<h>`, or `pic-<hash>-<length>` for a window's picture | each background photo once: `{ key, data, w, h, bytes, name, addedAt, thumb, lastUsed }`. Also each picture in a window's content once (below) |

```js
// meta
{ v: 1, id, b, at, kind: "auto" | "open" | "manual" | "before" | "restored",
  reason: null | "reset" | "delete" | "close-all" | "emptied" | "photo" | "import" | "add" | "load" | "restore" | "window" | "erase"
        | "merge" | "undo" | "join" | "take",
  label, sig, uid, name, bytes, photo: "<key>" | null | "gone", pics: ["pic-…"],     // only with pictures
  thumb: { bg, pattern, shape, vw, vh, wins: [[ikey, x, y, w, h], …] },              // open windows, back to front
  wins: { "<ikey>": [open, createdAt, dataHash, confHash, dataLength, excerpt] },
  beforeBig, keepUntil, manual, manualLabel, folder, tab,
  deletedAt }                                                                         // the page was deleted then (ms)
```

Versions before Board Sync merges (`reason: "merge"`, "Before changes from the laptop") may be of a page that isn't
shown: `uid` and `name` are that page's. A risky merge (deleting or bringing back, emptying content, a clash, a photo
replaced) always saves one first; otherwise a page nothing was changed on here gets at most one an hour. "Before
undoing the changes from …" (`undo`) comes before the Undo of a merge. When a deleted page's records go, once its Undo is
over, its versions stay for 30 days, marked with `deletedAt`. Board history › *Deleted pages* lists them, and *Bring
back* adds the page again from its newest version, under its old `uid`. Then they go.

**Pictures in windows' content** are kept once, not in every version. A `data:` URL over 32 KB in a top-level field
of an instance's `data` goes into `photo` as `{ key: "pic-<hash>-<length>", data, pic: true, bytes, lastUsed }`, and
the body holds `{ "b21pic": "<key>" }` in its place. `pics` lists the keys. Reading a version puts the pictures back.
A picture stays while any version names it. A version of a page with pictures costs what the page costs without
them, usually a few KB. Copies in the Google Drive folder hold their pictures, as exports do.

`sig` is the content fingerprint, so identical versions aren't saved twice. Window stacking order doesn't count,
nor do the theme, accent and text style, which going back never changes. Versions saved before Board Sync merged
boards may have `reason: "load"` and `link: "sent" | "loaded"`; `link` is ignored now. While the board is linked to
a folder, versions saved when 21Board opens aren't copied to it unless saved by hand. They may hold only work merged
from other devices, which those devices copy themselves. Retention is in README, "Board history". Settings for this
device only: `historyEvery` (minutes, 0 = off; default 10) and `historyFolder` (default true).

**Folder copies:** `<shared folder>/Board history/<board name> <YYYY-MM-DD> <HH.MM>[ saved] (<device>) [<uid6>-<dev4>].21board`
(local time; `uid6` and `dev4` are the first characters of the board's uid and the device id). A valid `.21board`
file: the version's body plus `history: {at, kind, label, by, from}`, without theme, accent, text style or the photo.
Each device thins only files with its own `dev4` (by name only); files ending in ` saved` are never removed.

## Instances: numbering, closing, reopening

- Opening a widget when **no closed instance exists** creates the lowest unused number
  (`timer:1`, then `timer:2`, …).
- **Closing** a window only sets `open: false`. Its `data`/`conf` stay.
- Opening the widget again reopens the **lowest-numbered closed instance**, restoring its position,
  size and content. With `timer:1` and `timer:2` both closed: first open → `timer:1`,
  second → `timer:2`, third → new `timer:3`.
- **Reset** (window menu) deletes that instance's `data` and `conf` and restores the default size.
- **Delete** (Settings → This page → Windows) removes the `inst`, `data` and `conf` records.
- Records for a widget that isn't installed are kept (and exported) but not shown.
- A widget marked `single` in the registry, as the district apps are, has one window. Opening it while it is
  open brings that window forward instead of creating a second instance. *Add to this page* leaves out the
  file's instances of it when the page has one, open or closed. *Replace this page* with a file that has more
  than one shows them all.

---

## Keeping several open copies in sync

Several tabs or windows of 21Board can be open on one device. All show the same board.

1. Every change is written to IndexedDB first. Rapid changes are coalesced into one transaction,
   and each record's `rev` is read and incremented **inside** that transaction. A transaction that
   fails stays queued and is tried again (see "When storage fails" below).
2. When the transaction commits, the tab posts `{ tab, keys: [...] }` on the
   `BroadcastChannel("21board-sync")` (or, in older browsers, writes it to
   `localStorage["21board-sync"]` to fire a `storage` event, as 21Sketch does).
3. Other tabs re-read just those keys and apply any record whose `rev` is newer than the one they
   last saw. Windows move, open or close; widgets get `data` / `config` events.
4. While someone is dragging or resizing, incoming changes are held and applied when the gesture
   ends, so a window never jumps out from under a finger.
5. When a tab becomes visible again (or is restored from the back/forward cache), it re-reads
   everything, in case it missed messages while frozen.
6. Import and Erase post `{ op: "reload" }` once their transaction is stored (a failed one changed
   nothing and posts nothing); other tabs rebuild from IndexedDB. With `replaced: true` (the board was
   replaced: Import ▸ Replace, going back) or `erased: true`, they first drop any change of their
   own that wasn't saved yet, so it can't land on the new board.
   Reset posts `{ op: "reset", board, ikey }`; other tabs reload that window.

When two copies edit the *same* record at the *same* moment, the later write wins, and both copies
then show it. A tab that takes over another tab's newer record drops its own change to that record
if it was still waiting to be saved (see below), so the older change is never written over the newer.

**Board Sync's writes** (section 13d) are the exception: a record a merge wrote has `m: 1`, and a tab with a change
to that record still waiting neither drops it nor shows the merged record; the change is written, and the next look
at the board finds both and keeps both. Each record a tab writes also says what it was based on:

| Field | Meaning |
| --- | --- |
| `base` | the record's `rev` this tab knew when the change was queued (the earliest, when several coalesce). Missing: written around the queue (Import, a deleted page's purge), not tracked. Within 1.5 s of showing a merged write of a record it already had (timed on a clock that never goes back), a widget's save gets the revision before the merge; a tab that didn't show one (it had a change waiting) gives every save of that record that revision until it shows a merged write of it. Either way the save counts as made without the merge. A record made again after this tab saw it deleted (a Reset, then typing) is based on the revision deleted, not on "absent", which would look like a save made without a merge. A record a merge deleted is based on the revision before that too when it is made again: its Undo (`u`), and any change made more than 10 seconds after the merge (Board history's Put back, say), count as made after seeing the deletion. |
| `m` | `1`: written by a Board Sync merge, never by a tab's own change. |
| `u` | `1`: written by the Undo of a merge, so that other devices can say "The laptop undid …". |

`settings` is written as a **patch**: only the keys a change gave are put over the stored record, inside the
transaction (and the keys an older 21Board used, `devWidgets`, `awakeFrom` and `awakeTo`, are dropped), and
`deletedBoards`/`deletedAt` change only by adding or removing a page, so a tab with an old copy of the settings can't
write its old lists (or `boards`) over newer ones. For the same reason a settings patch still waiting in a tab is
never dropped when another tab's settings arrive: the tab shows them with its patch over them, then writes it.

The ledger (`link:mine-<uid>`, below) remembers what a merge wrote to a part (`applied`) until a change based on it
is written, so a change another tab made without the merge is found to be one whenever it is written: it becomes a
clash, both kept, never an overwrite.

### When storage fails

- **Nothing is written before the stored board has been read.** At start-up the database is opened (tried up
  to three times, 10 seconds at most each) and every record is read (tried twice; then one by one, so a single
  unreadable `media`, `data` or `conf` record is left out, and left as it is, instead of hiding the board).
  If that fails, or start-up throws, the tab shows a message with *Try again* and stays read-only.
- **A failed write is kept.** The changes stay queued in the tab (a newer change to the same record wins) and
  are tried again with the next change, after 5 seconds, then every 30. Meanwhile the board shows *Not saved*,
  and Export includes the queued changes. An error that means "out of space" (`QuotaExceededError`, or a
  message about quota, no space or a failed blob write) first makes room in Board history, a little at a
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
  "accent": "blue",               // the accent shown: one of the six, or a custom color "#rrggbb"
  "letters": "standard",          // the text style (from 2026.11.17-2; a file without it leaves the text style as it is)
  "board": {
    "name": "Room 12",
    "background": { "color": null, "pattern": "dots" },
    "scale": 0.8,
    "shape": "16:9",
    "uid": "7c1e…"                // full backups only: which board this is
  },
  "media": { "background": { "data": "data:image/jpeg;base64,…", "w": 2560, "h": 1707 }, "look": { "on": true, "fit": "fill", "focus": { "x": 0.5, "y": 0.5 }, "fade": 0 } },   // full backups only; a device file names the photo instead (below)
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

**A device file** (Board Sync, see `link:sync` above) names each page's photo in the folder's `Photos/` instead of
holding it, so it stays small (a page with no photo has no `media`):

```js
"media": {
  "background": { "file": "3fa9c1d2e4b5a6f70123456789abcdef.jpg", "w": 2560, "h": 1707, "bytes": 412345, "name": "class.jpg", "addedAt": 1762713600000 },
  "look": { "on": true, "fit": "fill", "focus": { "x": 0.5, "y": 0.5 }, "fade": 0 }
}
```

`file` must be exactly 32 lowercase hex digits and `.jpg`, `.png` or `.webp`; anything else (a path, `..`, another
name) is read as saying nothing about the photo, and the device keeps its own. Opened with Import, such a file
gets the photo from `Photos/` in the folder this device is linked to, or from this device if it has it.
Otherwise the device keeps its own. To give a board to someone, use Export, since the board files in the folder
don't hold their photos. Exports, backups and Board history work as before, with the photo inside or left out.

Optional, ignored by older readers: `instances[].createdAt` (which window is which, kept by Board history),
`history: {at, kind, label, by, from}` (a Board history copy), `media.ref` (a photo kept in Board history) and
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
Only an all-pages export, or any export from a device with one page, counts as a backup for the reminders. If
storage can't be read, the other pages come from what the open tab holds. If part of a page still can't be had,
the file is made anyway, the teacher is told which pages are incomplete, and it doesn't count as a backup.
*Export → This page* writes the one-page file exactly as before.

Importing a one-page file offers three choices:

- **Open as a new page**, the suggested choice. The file becomes a new page right after the page shown, with the
  file's name, background, photo, size and shape, but not its theme, accent color or text style. It keeps the file's `board.uid`
  unless a page on this device already has it (then it gets a new one), so the same file opened on two linked
  devices is one page. Undo takes the page away again.
- **Replace this page** removes this page's windows and content, then loads the file, with its board name,
  background, theme, accent color and text style. The page keeps its `board.uid`, whatever board the file was.
  With Board Sync, the new content reaches the same page on the other devices as edits. The theme, accent color and
  text style count as a choice made on this device, so they reach the other devices too. The dialog says so when
  they differ from this board's. Its Undo goes back to the version saved before, and chooses again the theme,
  accent color and text style it replaced.
- **Add to this page** keeps everything here, including the theme, accent color and text style, and adds the
  file's windows. Each gets the next free instance number for its widget, and windows are nudged into free
  space. Each added window gets a new `wid` and a `createdAt` of its own; *Replace this page* keeps the file's
  `wid`s (or makes the default from their `createdAt`), so a restored backup of a page is the same windows on every
  device.

Importing an all-pages file offers two choices:

- **Add these pages**: each becomes a new page, after this device's pages, as with *Open as a new page*.
- **Replace all pages**, asked again: the file's pages are added, then this device's pages are deleted, with Undo
  for 20 seconds, which brings them back and takes the new ones away. The file's pages keep their `board.uid` even
  though the pages they replace have it, so a restored backup is the same boards in the Google Drive folder.

Either way it is all or nothing. If a page can't be added, those that were go again and this device's pages stay.
The theme, accent color and text style stay as they are.

*Replace this page* keeps this page's background photo unless the file brings one. It takes the file's `scale` and
`shape`, so the board looks exactly as it did, zoomed to fit this screen. A file from before board sizes existed is
fitted into the 16:9 board. *Add to this page* fits the file's whole board into this one with one uniform factor,
keeping shapes and spacing.
