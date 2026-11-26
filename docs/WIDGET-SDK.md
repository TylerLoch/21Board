# 21Board Widget SDK

A **widget** is a small web page in a 21Board window. 21Board loads it in an `<iframe>`, saves its data, and keeps
it in sync across every open copy of 21Board. The teacher can move and resize its window.

Widgets talk to the board through one script: `sdk/board21.js`, which defines `window.Board21`.

- [Quick start](#quick-start)
- [Rules for widgets](#rules-for-widgets)
- [API reference](#api-reference)
- [Content vs. config](#content-vs-config)
- [Multiple instances and sync](#multiple-instances-and-sync)
- [Moving windows from inside](#moving-windows-from-inside)
- [Theming](#theming)
- [Registering a widget](#registering-a-widget)
- [Testing a widget](#testing-a-widget) (the dev window, building with AI tools, the widget lab)
- [Submission checklist](#submission-checklist)

---

## Quick start

Copy `widgets/_template/` to `widgets/<your-id>/` and edit it. The essentials:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="../../sdk/board21.js"></script>   <!-- the FIRST script in <head> -->
  <script type="application/json" id="board21-widget">
    {"id": "counter", "name": "Counter", "version": "1.0.0", "window": {"width": 320, "height": 240, "minWidth": 200, "minHeight": 160}}
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Counter</title>
  <style>
    body { margin: 0; background: var(--b21-bg); color: var(--b21-text); font-family: var(--b21-font); }
  </style>
</head>
<body>
  <button id="add">0</button>
  <script>
    let state = { count: 0 };
    const render = () => { add.textContent = state.count; };

    add.onclick = () => { state.count++; Board21.save(state); render(); };

    // Changed somewhere else (another 21Board tab, an import, ...)
    Board21.on('data', data => { state = Object.assign({ count: 0 }, data); render(); });

    Board21.ready().then(ctx => { state = Object.assign(state, ctx.data); render(); });
  </script>
</body>
</html>
```

The SDK must be the **first script in `<head>`**, a plain `<script src>` with no `async`, `defer`, or
`type="module"`. Then a widget opened outside 21Board shows in a real 21Board window (see
[Testing a widget](#testing-a-widget)). The `board21-widget` block is the widget's **manifest**: its id,
name, and window size for testing. Inside 21Board, its entry in `widgets/registry.js` counts, so keep the
two the same.

---

## Rules for widgets

1. **No Internet.** No CDNs, web fonts, analytics, or APIs. Keep everything in your folder, so the widget works
   offline and student work stays on the device. The Video Player and Weather are the only exceptions.
2. **No direct storage.** Don't use IndexedDB, `localStorage`, cookies, or `sessionStorage`.
   Use `Board21.save()` / `Board21.saveConfig()`. That's what makes export/import, templates,
   reset, multi-tab sync, and multiple instances work.
3. **Keep data JSON and small.** Saved values must survive `JSON.stringify`. Aim for kilobytes,
   not megabytes. Store an image only if you must, shrunk, as a data URL.
4. **Scale with the window.** The iframe is the window's content area. Size things with `vw`, `vh`,
   `vmin`, or flexbox, and test it small and large.
5. **Touch first.** Big targets (44px+), no hover-only controls, no tiny text. Add
   `touch-action: manipulation` to avoid double-tap zoom delays.
6. **Don't steal focus on load.** Auto-focusing a text box pops up the on-screen keyboard on a
   smartboard.
7. **One folder, few files.** Prefer a single `index.html` with inline CSS/JS.
8. **Never change your `id`** after release. Saved data is keyed by it.
9. **Check what you load.** Content and config (`ctx.data`, `ctx.config`, and the `data` and `config`
   events) can come from a `.21board` file someone imported. Check types and ranges before you use
   them. Put them on the page as text (`textContent`, `setAttribute`), never as HTML (`innerHTML`).

---

## API reference

All methods are safe to call before `ready()` resolves; they wait for it.

### Lifecycle

| Call | Description |
| --- | --- |
| `Board21.ready()` | Promise that resolves with the **context** once 21Board connects. |
| `Board21.context` | The context object (or `null` before ready). |
| `Board21.embedded` | `true` inside 21Board (or the dev window), `false` in [standalone mode](#testing-a-widget). |
| `Board21.theme` | `'light'` or `'dark'`. |
| `Board21.version` | SDK version string. |

The **context**:

```js
{
  widgetId: 'timer',            // your registry id
  widgetName: 'Timer',
  widgetVersion: '1.0.0',
  instance: 2,               // this window's instance number (1, 2, 3...)
  data: { ... } | null,      // saved content for this instance
  config: { ... } | null,    // saved config for this instance
  theme: 'light' | 'dark',
  palette: { bg, text, accent, ... },   // same values as the --b21-* CSS variables
  window: { width, height, x, y, maximized, focused, zoom, corners },  // content size in CSS px; focused = selected; zoom, corners below
  locale: 'en-US',
  devMode: false,            // Developer mode is on in Settings
  boardVersion: '2026.11.12-1',  // the 21Board release's name (for display; don't compare)
  sdkProtocol: 1,
  host: 'board',             // 'board', 'dev' (the dev window's test board), or 'standalone'
  kiosk: false,              // ChromeOS kiosk mode (?kiosk=yes): links can't open new windows
  timers: [ ... ],           // the built-in Traffic Light and Clock only (see Events); [] standalone
  standalone: false
}
```

### Saving

| Call | Description |
| --- | --- |
| `Board21.save(data)` | Save this instance's **content**. Returns a Promise that resolves once it's stored. Call it whenever the state changes. 21Board batches rapid writes. `save(null)` clears it. If the device can't store it, the Promise rejects ("Not saved yet"). 21Board keeps the data, shows the teacher *Not saved*, and tries again by itself, so the widget needn't retry or show an error. |
| `Board21.load()` | Promise of the saved content (same as `context.data`). |
| `Board21.saveConfig(config)` | Save this instance's **config** (preferences). |
| `Board21.loadConfig()` | Promise of the saved config. |

### Window

Sizes are the **content area**, the iframe, without the 40px title bar.

| Call | Description |
| --- | --- |
| `Board21.window.setSize(w, h)` | Resize the window, within its minimum and maximum size, shape lock, and the board. Its top-left corner stays put where it can, and the window stays on screen and clear of other windows where it can. It takes a maximized window out of *Fill the board*. The size is saved with the board, like a teacher's resize: kept after a reload, the same in every tab. |
| `Board21.window.setAspectRatio(ratio)` | Lock the content to `width / height` (e.g. `16/9`). `null` unlocks. |
| `Board21.window.setMinSize(w, h)` | Minimum content size. `null` goes back to the registry's. A window smaller than the minimum is drawn bigger, without changing its saved size (see below). |
| `Board21.window.setMaxSize(w, h)` | Maximum content size. `null` removes the limit. |
| `Board21.window.setResizable(bool)` | Show or hide the resize grips. |
| `Board21.window.setDragFromContent(bool)` | Whether the window can be dragged from anywhere inside it right now (see [Moving windows from inside](#moving-windows-from-inside)). |
| `Board21.window.setTitle(text)` | Short status shown after the widget name in the title bar, e.g. `"Running"`. Hidden in narrow windows. |
| `Board21.window.requestAttention()` | Pulse the title bar, such as when a timer ends. |
| `Board21.window.focus()` | Select the window and bring it to the front. |
| `Board21.window.maximize()` / `restore()` | Fill the board / return to normal size. |
| `Board21.window.close()` | Close the window. Its data is kept. |
| `Board21.window.getInfo()` | Promise of `{ width, height, x, y, maximized, focused, zoom, corners }`. `zoom` is how much bigger the board draws the window than its CSS size. On the 16:9 board it is the board's Size times how much the screen enlarges the board: 0.57 at Size 80% on a 1366×768 Chromebook, 1.5 at Size 150% on a 1920×1080 panel. On the *Fill* board shape it is the Size. For sharp lines and letters, a canvas uses `devicePixelRatio × zoom` pixels per CSS px, capped at about 3. An older 21Board doesn't send `zoom`: treat a missing one as 1. `corners` is sent while the window fills the board, and to any other window the board's own buttons sit over: `{ left, right, height }`, how far ▦ and the clock beside one reach in from the window's left and right edges and up from its bottom, in its CSS px. The clock shows only in full screen by default, so `corners` changes as 21Board enters and leaves full screen. Keep buttons and text out of those corners. An older 21Board doesn't send `corners`. A 21Board before 2026.11.24-4 sends it only while the window fills the board. `corners.top` does the same for the padlocks in the top corners while the board is locked, measured down from the top of the content. Unlocked, it's all 0. A 21Board before 2026.11.18-18 doesn't send it. |

While the board is locked (*Lock* in the Widget Picker), `maximize()`, `restore()`, and `close()` do nothing. `setSize()` on a window that fills the board only sets the size it returns to when restored. Other calls work as usual.

Defaults for size, minimum size, and aspect ratio come from the [registry](#registering-a-widget),
so the window has the right shape before your page loads. Calls at run time override them
until the window is reset or reloaded. If they depend on config, call them again after `ready()`
(see `widgets/clock`).

**Room for a settings or editing view.** The teacher chooses the window's size, so a widget doesn't resize
it by itself. To make room for a view that needs more space for a while, raise the minimum while it shows:

```js
function openEditor() { Board21.window.setMinSize(520, 400); /* … show the editor … */ }
function closeEditor() { Board21.window.setMinSize(null, null); /* … back to the main view … */ }
```

A smaller window grows to that size, never past the board, and its saved size doesn't change. When the
minimum goes back, so does the teacher's size. If the teacher moves or resizes the window while it is
bigger, it keeps that. A reload shows the normal size, since calls at run time don't last. For a lasting
change the teacher asked for, such as a layout that needs another shape, use `setSize`. To undo it, keep
`getInfo()`'s size first and set it back, unless it changed since. Skip `setSize` when
`Board21.context.window.maximized`.

### Window menu

Your own items appear in the window's **⌄** menu, above *Fill the board*, *Reset*, and *Close*.

```js
Board21.menu.set([
  { id: 'analog', label: 'Analog', checked: true },          // checked: true/false shows a checkmark item
  { id: 'digital', label: 'Digital', checked: false },
  { separator: true },
  { id: 'settings', label: 'Options…', icon: '<svg viewBox="0 0 24 24">…</svg>' },
  { id: 'clear', label: 'Clear', disabled: true }
]);
Board21.on('menu', id => { /* an item was tapped */ });
Board21.menu.clear();
```

Three extras for grouping choices (see `widgets/notes` and `widgets/name-picker`):

```js
Board21.menu.set([
  { heading: true, label: 'Theme' },                               // a small section label
  { id: 'theme:plain', label: 'Plain', checked: true },
  { id: 'theme:dark', label: 'Dark', checked: false },
  { label: 'Color', swatches: [                                    // one row of color circles
    { id: 'color:yellow', label: 'Yellow', color: '#fef08a', checked: true },
    { id: 'color:blue', label: 'Blue', color: '#bfdbfe' },
    { id: 'chalk:white', label: 'White chalk', color: '#f4f7f2', background: '#2f4a3a' }  // background: shown around the color
  ] },
  { id: 'size', label: 'Size', choices: [                          // one row of short choices, drawn like swatches
    { id: 'size:1', label: '1', checked: true },
    { id: 'size:2', label: '2' }
  ] }
]);
```

A row of choices is for numbers and other short labels. A label shows up to 3 characters.

Tapping a swatch or a choice sends its `id` to `Board21.on('menu', …)` like any item. Colors must be `#hex`,
`rgb()`, or `hsl()`. A heading and the items under it, up to a separator or the next heading, are one group
for screen readers, named by the heading ("Theme, Dark, not checked"). So a short label like `'3'` is fine
under a heading that says what it is. The menu works from the keyboard too: the arrow keys, Home, and End move
between items, and Enter chooses one.

Call `menu.set()` again whenever an item's state changes. Icons must be inline `<svg>`; scripts
and links are stripped. Up to 24 items. A row of swatches or choices counts as one and holds up to 12.

### Events

`Board21.on(event, handler)` returns an unsubscribe function. `Board21.off(event, handler)` also works.

| Event | Handler arguments | When |
| --- | --- | --- |
| `data` | `(data, { reason })` | This instance's content changed outside this page: another 21Board tab, an import, or a reset. |
| `config` | `(config, { reason })` | Same, for config. |
| `theme` | `(theme, palette)` | The theme, accent color, or text style changed. The CSS variables are already updated. |
| `resize` | `(info)` | The window's content size, maximized or focused state, `zoom`, or `corners` changed. Also fires when the teacher's text style changes, and again once its font loads, so text can be fitted again. Native `resize` events fire too when the size changes. On the 16:9 board, `zoom` changes at almost every step while the browser window is resized, so keep this handler light, or wait about 150 ms for it to stop. |
| `focus` / `blur` | — | The window was selected or deselected. Selecting a window brings it to the front. **`blur` also fires when the teacher taps the empty board to deselect everything, and the window stays in front and visible.** So `blur` doesn't mean the window is covered. Don't pause a timer on blur. |
| `menu` | `(id, item)` | One of your menu items was tapped. |
| `beforeclose` | — | The window is about to close. Save anything pending *synchronously* (call `save()`). |
| `file` | `(file, { reason })` | A picture or a video link pasted or dropped on the board, for the window the board opened for it. A link comes as a `text/uri-list` file. `reason` is `'paste'` or `'drop'`. Only the built-in Picture and Video Player widgets get it. |
| `timers` | `(timers)` | The Timers and 21Timer on the page shown that are running, paused, or done, each `{ id, endsAt, remaining, warnMs }`. `endsAt` is the end while running, else `null`. `remaining` is the time left while paused, `0` when done, else `null`. `warnMs` is the warning, or `0`. Times are in ms. Fires when the list changes. `context.timers` has it from the start. Only the built-in Traffic Light and Clock get it. |

### Other

| Call | Description |
| --- | --- |
| `Board21.toast(text)` | Show a short message at the bottom of the board. |

Tapping anywhere in your widget brings its window to the front.

**Pasting and dropping files.** In a built-in widget, a paste your widget doesn't take, outside a text field, goes to
the board. So does a dropped file. A picture opens in a new Picture window, and a `.21board` file imports. A video
link opens a new Video Player. In a widget uploaded in Developer mode, they do nothing. A dropped file never opens in
place of your widget. To take them yourself, call `preventDefault()` in a `paste` or `drop` listener on the document
or an element.

**Right-click.** The SDK turns off the browser's menu in your widget, except on links, in text boxes, in Developer
mode, and in the dev window. To show a menu of your own, listen for `contextmenu` and call `preventDefault()`.

---

## Content vs. config

Each window (instance) has two separate saved values:

| | **Content** — `save()` | **Config** — `saveConfig()` |
| --- | --- | --- |
| What | The work: text, names, scores, timer state | Preferences: colors, modes, options |
| Full export (backup) | ✅ included | ✅ included |
| Template export | ❌ **left out** | ✅ included |
| Reset | cleared | cleared |

Templates are how teachers share layouts, so **anything that could identify a student must be
content, never config.** The Name Picker keeps its names in content for this reason.

---

## Multiple instances and sync

- A teacher can open the same widget several times. Each window is an **instance** with its own
  number (`context.instance`: 1, 2, 3…) and its own saved content and config. You don't need to
  do anything for this.
- Closing a window **keeps** its data. Opening the widget again reopens the lowest-numbered closed
  instance with its data. When all are open, it gets a new number.
- Several 21Board tabs or windows can be open at once, such as the smartboard and the teacher's
  laptop. They all show the same board. When one copy saves, the others get a `data` or `config`
  event with the new value. **Handle `data` by re-rendering from the value you're given.**
  If someone is typing, merge with care, as `widgets/notes` does.
- Store time-based state as wall-clock times (e.g. `endsAt: Date.now() + ms`), not ticking
  counters, so every copy shows the same thing. See `widgets/timer`.
- Saving the same value again is free: 21Board skips writes that don't change anything, so
  re-saving inside a `data` handler won't cause loops.

---

## Moving windows from inside

Teachers can move a window by its title bar or from inside it:

| Widget type | One finger or mouse inside | Two fingers inside |
| --- | --- | --- |
| **Click-only** (buttons, taps): the default, `dragFromContent: true` | moves the window | moves the window |
| **Needs drags itself** (typing or selecting text, drawing, sliders, sortable lists): `dragFromContent: false` | goes to your widget | moves the window |

A tap is always a tap. A press becomes a window drag only once it moves past the tap allowance: 6 px
with a mouse, 10 px with a pen, 16 px with a finger, as on the title bar. So a slightly sloppy tap still
presses the button. Once a press becomes a drag, your widget doesn't get the rest of it: no `pointermove`/`pointerup`, no `click`, and no
`mouseup`/`touchend` right after it, so a button the finger started on doesn't fire. A press resting
in your widget claims nothing until it moves, so someone else can still use the title bar meanwhile.

Even in click-only widgets a window drag never starts from: text fields, textareas, selects, range
sliders, `canvas`, `video`/`audio`, editable content, text styled `user-select: text`, scrolling
areas (including a page that scrolls as a whole), elements whose CSS `touch-action` is anything but
`auto`/`manipulation` (they handle touch themselves), elements with `draggable="true"`, anything
inside an element with **`data-b21-nodrag`** (also inside web components / shadow DOM), or a press
your widget already handled: `preventDefault()` on `pointerdown` or `touchstart`, or pointer capture
on another element.

A two-finger move needs both fingers within about 260 px, one hand's reach, so two people far apart are
left alone. It never starts on `canvas`, `video`, `[data-b21-nodrag]`, or `touch-action: none` elements.
When two fingers start moving a window, your widget gets a `pointercancel` for each, so it can drop
whatever those fingers started. Neither kind of move from inside works on a maximized window.

So:

- **Mostly buttons?** Do nothing. Re-render only what changes: an element replaced under a finger
  loses its press, so update a button's text and attributes instead of rebuilding it every tick.
- **Your widget needs drags everywhere** (a text editor, a drawing board)? Set `dragFromContent: false`
  in the registry.
- **One area needs drags** (a sketch pad, a slider you built from divs)? Put **`data-b21-nodrag`** on
  it. That works whatever events the widget uses. `preventDefault()` on `pointerdown` works too, but
  only for a widget written with pointer events, because it also stops the browser's `mousedown`,
  `mousemove`, and `mouseup`.
- **Images and links** move the window like everything else. In click-only widgets their built-in drag
  and drop is off. If you use HTML drag and drop, give those elements `draggable="true"` or
  `data-b21-nodrag`.
- **It depends on the view?** Call `Board21.window.setDragFromContent(false)` while a view that needs
  drags shows, and `true` otherwise. See `widgets/name-picker`: its list editor needs drags, picking doesn't.

Teachers can turn this off in Settings → Advanced → *Drag windows from inside*. Then windows move by
their title bar only.

## Theming

The SDK sets these CSS variables on your `<html>` element and keeps them updated, plus
`data-b21-theme="light|dark"` and `color-scheme`:

| Variable | Use |
| --- | --- |
| `--b21-bg` | Page background (matches the window) |
| `--b21-surface`, `--b21-surface-2` | Cards, inputs, secondary buttons |
| `--b21-text`, `--b21-muted` | Text, secondary text |
| `--b21-border` | Borders, dividers |
| `--b21-accent`, `--b21-on-accent`, `--b21-accent-soft` | Primary buttons and highlights |
| `--b21-danger`, `--b21-success`, `--b21-warning` | Status colors |
| `--b21-font`, `--b21-radius` | Font stack, corner radius |

`--b21-font` is the device's own font, unless the teacher chose an easier-to-read text style in Settings →
Appearance → *Text style*. With Board Sync, that choice is the same on all the teacher's devices. `--b21-font` then
starts with a font that comes with 21Board, which the SDK loads from the board's `fonts/` folder. A widget on
another site gets that font only if the board's site allows it (CORS). Otherwise its text stays in the device's own
font. So does a widget uploaded as a file in Developer mode, which is sealed off from the board's files.

If you fit text to the window, fit it on `resize`, the window's or `Board21.on('resize')`. One fires when the text
style changes, and again once the new font has loaded. Form controls don't take the page's font by themselves.
Give `button`, `input`, `textarea`, and `select` `font-family: inherit` (or `font: inherit`) so their text follows
the text style too.

Use `[data-b21-theme="dark"] .thing { … }` for anything else that should change in dark mode.

---

## Registering a widget

Add an entry to `widgets/registry.js`:

```js
{
  id: 'counter',                       // folder name; lowercase a-z, 0-9, dashes; never change it
  name: 'Counter',                     // shown in the Widget Picker (two lines at most there) and title bar
  description: 'Count anything.',      // shown as a tooltip, under the name
  version: '1.0.0',
  entry: 'widgets/counter/index.html',
  files: ['widgets/counter/index.html'],  // EVERY file the widget needs (images, extra scripts...) for offline use
  color: '#0ea5e9',                    // Widget Picker tile color
  icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>', // 24x24 stroke icon, drawn white
  window: {
    width: 320, height: 240,           // default CONTENT size (title bar is added)
    minWidth: 200, minHeight: 160,
    // maxWidth, maxHeight             optional
    // aspectRatio: 16 / 9             optional content aspect-ratio lock (a number, or "16:9")
    // resizable: false                optional
    // dragFromContent: false          if the widget needs drags itself (text, drawing): see "Moving windows from inside"
  },
  permissions: [],                     // e.g. ['microphone', 'camera'], added to the iframe's allow=""
  // devOnly: true                     only listed when Developer mode is on
  // single: true                      one window only: the Widget Picker brings it forward (or opens it again)
  //                                   instead of opening a second one, and "Add to this page" adds none
  // clash: 'later'                    Board Sync: see below
}
```

`clash: 'later'` is for a widget whose content is only a setting or scratch work: the Timer's time, the Stopwatch's
run and records, the Clock's set time and mark, the Dice faces, the Traffic Light's light, the Video Player's video
and History, which picture a Picture window shows, the Calculator's problem and History, and the forecast a Weather
window saved. When Board Sync finds a window's content changed on two devices at once, it keeps the later change, and
Board history keeps the other. Without `clash`, it keeps both, the other as a labeled copy beside the window. Leave it
out when the content holds anything typed, such as notes, names, or a task list, so nothing anyone typed is lost.

Then **change `VERSION` in `sw.js` and run `node tools/release.js`** so installed copies download the new
files (see README, "Deploying"). Devices save a release for offline use only as a whole. A widget file
changed without a new release never reaches them.

### The district's own apps (`external`)

21Sketch, 21Timer, and 21DocCam are separate websites, each with its own data on the device. They appear in
21Board as windows that show the live site, not as copies:

```js
{
  id: '21sketch', name: '21Sketch', description: '…',
  entry: 'https://sketchapp.ccsd21.org/',   // the app's own https address
  files: [],                                // nothing for 21Board to save for offline use
  color: '#4f46e5', icon: '<svg …>',
  window: { width: 900, height: 560, minWidth: 520, minHeight: 360, dragFromContent: false },
  permissions: [],                          // 21DocCam: ['camera']
  single: true,                             // one window: a second would show the same work
  external: true
}
```

What `external: true` changes:

- **No SDK.** The page belongs to another site, and the board never connects to it. It sends the page nothing,
  not even the theme. Nothing is saved for it on the board. The app keeps its own work on the device (IndexedDB,
  localStorage), as it does when opened on its own.
- **One message, from 21Timer.** For the Traffic Light, the board reads how much time 21Timer has left. It stores
  nothing. 21Timer sends it from its 2.0 release:
  `{ type: '21timer:status', version: 1, state, endsAt, remaining, warnMs }`. The board takes it only from the frame
  of an open 21Timer window, from 21Timer's own origin, with every number checked. It ignores everything else from
  the apps.
- **Not in 21Board's offline copy or release stamp.** `sw.js` leaves it out. Offline, the window shows the app
  only if the app keeps its own offline copy, with its own service worker. 21Board shows "Offline" beside the
  window's name and says so once in a toast. It can't tell whether the app loaded.
- **The window.** The page loads over the spinner, since the board can't see when it's drawn. The board sees no
  taps inside it, only focus moving into it, as when one of its buttons is tapped. So while another window
  overlaps it from the front, it is covered, and a tap brings it forward and goes no further. With nothing
  overlapping it, it takes every tap itself. It moves by its title bar only. Its menu has *Reload …* and
  *Open in new tab* (not in kiosk mode), and no *Reset* or *Earlier versions*. Settings says the app keeps its
  own work, and *Erase everything* and *Export* say they don't reach it.
- **Same sandbox** as every widget (scripts, its own storage, forms, alerts and printing, pop-ups, downloads),
  and the same `allow` list plus `permissions`. That is everything the three apps use. The sandbox still keeps
  the page from navigating the board away.
- The address comes from the registry only: a `.21board` file names the widget (`21sketch`), never an address.
- Only for `https` addresses in the registry. A test widget uploaded in Developer mode can't be external.

---

## Testing a widget

### The dev window

Open a widget anywhere but inside 21Board, such as its own file, a local web server, GitHub Pages, or an AI
tool's preview, and the SDK shows it in the **dev window**. It's the real 21Board, with your widget in an
ordinary window, drawn as if on a 1920 × 1080 smartboard and scaled to fit. The title bar, resize handles,
window menu, *Fill the board*, *Reset*, *Close*, the Widget Picker, and Settings are the board's own code
(`board.js`), so what works here works on the board. Open another window from the Widget Picker, and change
the theme, accent, and size of windows and menus in Settings.

| | |
| --- | --- |
| **View** | *Window* (default): follows the window and its open menu. *Board*: the whole screen. |
| **Screen** | Smartboard 1920 × 1080, laptop 1366 × 768, Chromebook 1280 × 800, tablet 1024 × 768, or the preview's own size. |
| **Theme, − / +** | Light / dark / auto, and the size of windows and menus (as in Settings). |
| **Data** | The window's saved content and config as JSON. Edit it and *Send as a change from another tab* to test your `data` and `config` handlers. Copy it or clear it. |
| **Events** | Every message between the widget and the board, and the widget's errors in red. |
| **Checks** | Common problems: the SDK not first, files loaded from the Internet, localStorage, `alert()`, menu items the board will drop (more than 24, swatches that aren't `#hex`)… Each has *Copy fix request*, a sentence to paste back to the AI tool. |
| **⋯** | Reload the widget, reset its window, open another window, switch the board shape, show the widget on its own, and *Copy for 21Board* (the HTML with its SDK path set for the `widgets/` folder, plus a `widgets/registry.js` entry). |

The footer shows the window's content size, shape lock, minimum size, and board size.

- **Its data is a test copy**, kept apart from real boards in its own database, `21Board-dev`. Where a
  preview blocks storage, it lasts until the page reloads, and the footer says so. *Data ▸ Copy* keeps it.
- **Errors** from the widget are repeated in the page's console as `[widget] …`, so an AI tool's own
  error panel sees them.
- **Just the widget:** *⋯ ▸ Show the widget on its own*, or add `#b21-bare` to the address, or
  `data-dev="off"` to the SDK's script tag. This is standalone mode: data in `localStorage`, window calls
  ignored, menu items in a small dropdown in the corner.
- If the SDK **isn't the first script** in `<head>`, the widget runs on its own with a note saying so.
- Without a manifest block, a widget in this repo's `widgets/` folder uses its `widgets/registry.js`
  entry; otherwise the window is 400 × 300.
- **Text style** (Settings → Appearance) works only in the dev window of a widget file on 21Board's own site,
  or opened from disk. In an AI tool's preview the test board isn't on 21Board's site, and the widget lab's is
  sealed off. Fonts from another site need that site's permission (CORS), so there the text style stays
  Standard, and Settings says so.

**How it works.** Before any of your code runs, the SDK keeps the rest of the page as text
(`document.write` of an unclosed `<plaintext>`), then loads `sdk/board21-dev.js`. That runs the board in a
frame, in **widget test mode**, which opens your page in a window as `srcdoc`. The board there is
`sdk/dev/board-shell.js`: `index.html`'s markup, then `board.js`. Inside 21Board none of this happens. The
board names each widget's frame before it loads, so the SDK connects at once. After changing `index.html`,
run `node tools/build-sdk.js`. The tests check it.

### Building with an AI tool

Ask Gemini Canvas, Claude, ChatGPT, or another AI tool for **one plain HTML file** whose first script is the SDK at its full address on a 21Board site
the tool's preview can reach. Use the GitHub Pages copy:

```html
<script src="https://tylerloch.github.io/21Board/sdk/board21.js"></script>
```

Some previews, such as Gemini Canvas, can't load the SDK from `boardapp.ccsd21.org`. The GitHub Pages copy
works in them, and the preview shows the widget in the dev window.

**[docs/AI-PROMPT.md](AI-PROMPT.md)** has prompts to paste before describing the widget. The full one covers
this guide's rules, the window menu, window size, dragging, theming, and the house look. The short one covers the
essentials. It also shows staff how to use them: the preview, *Checks* → *Copy fix request*, and *Upload file…*
in Developer mode.

When it works, *⋯ ▸ Copy for 21Board* gives the file and its registry entry (see
[Registering a widget](#registering-a-widget)).

Tested in Chrome and Firefox against stand-ins for how these tools show a preview: the page written into a
frame on another origin with `document.write`, or opened as a `blob:` address, with and without storage. Each
real tool still needs a quick check.

### The widget lab

Open `sdk/lab.html` on a 21Board site, such as `https://boardapp.ccsd21.org/sdk/lab.html`. Paste a widget's
HTML or open or drop its file, and tap **Try it**. It's the same dev window, for tools whose previews can't load
the SDK and for a final check before adding a widget. The pasted code runs in a sandbox with its own empty
storage, so it can't read this site's real boards. *Edit code* goes back to the code.

### Inside 21Board

- **Without registering.** In Settings → Advanced, turn on **Developer mode**. Under **Test a widget**, tap
  **Upload file…** and pick the widget's `.html` file. This works on Chromebooks, Chrome on Windows and Mac,
  and iPad Safari. Inside 21Board it's the only way to try a widget that isn't in the registry, since the board
  never takes a widget by its address. It opens in a window named after its manifest block, such as
  *My Widget (test)*, sized from its `window`. Its id is `dev-` plus the manifest's `id`, or its name. To see
  an edit, upload the file again. It replaces the one kept, and its open windows restart with it. **Remove**
  in the list deletes it.
  - **Sealed off.** The file runs in a sandbox with an origin of its own. It can't reach the board's page, its
    saved boards, Board history, the Google Drive folder, localStorage, or cookies. It sees only what the
    board sends its own window. It has no storage of its own either, since localStorage throws, so save with
    `Board21.save`. A Content Security Policy goes first in its page, so it can't fetch or load anything
    from the network: no CDN scripts, web fonts, or images by address. 21Board's own page doesn't let its
    window go to another site. If its page leaves anyway, to another page of this site or by reloading
    itself, the board stops talking to it and the window says *This test widget left its page*. Upload the
    file again to start it. Like any page, it can still open a link in a new tab when tapped, and
    the link's address can carry anything the widget holds: what it shows and its window's saved content.
  - **Kept on this device only.** The file's text is stored on this device, apart from boards, so the
    window comes back after a reload, offline, and in other tabs. It is never in an export, full or
    template, nor in Board history or the Google Drive folder. Those carry the window and its content only,
    and another device shows *Widget not installed* for it. Importing a `.21board` file never brings code that
    runs. **Erase everything** deletes it.
  - **Works offline.** 21Board puts its own copy of the SDK into the page in place of your SDK tag, or first
    if the file has none, so the tag's address doesn't matter.
  - **If it freezes 21Board.** Some browsers, iPad Safari among them, run the widget in the board's own
    process, so an endless loop in it freezes the whole board. The next start leaves it stopped, and its
    window says *This test widget wasn't started*. Fix it, then upload it again. If it froze the board after
    running for a while, add `?nodev` to 21Board's address, as in `https://boardapp.ccsd21.org/?nodev`. No
    test widget starts, and you can remove it in Settings.
  - **Limits.** One self-contained file of at most 5 MB. Images, CSS, and fonts beside it don't come along,
    since relative addresses don't resolve, so put them inline or as `data:` URLs. Its page has to stay put:
    reloading itself, or `document.write` after it has loaded, counts as leaving it. Window menu items show
    without their icons. Dragging inside the widget doesn't move its window; use its title bar. Its colors
    may flash as it opens, until the board sends the theme. Not available in kiosk mode or in a copy of
    21Board opened from a file.
  - **Older boards.** Earlier versions of 21Board could also add a test widget by its path on the site. Not
    anymore. A board that still lists one opens without it, and Settings shows its window as *Widget not
    installed*, where you can delete it.
- **Changing a registered widget:** 21Board runs from its offline copy, which only changes as a whole
  release. To see your change inside 21Board, run `node tools/release.js`, reload, and tap *Update* when
  it's offered a few seconds later. Ctrl+Shift+R shows the page from the server at once, but an open widget
  window still comes from the saved copy. Reload once more, or close and open the widget.
- **SDK Playground:** with Developer mode on, open *SDK Playground* from the Widget Picker. Run any call
  with your own values and copy its code. Watch the window's state, the palette, and every event.
- **Sync:** open 21Board in two tabs side by side and use your widget in one.

---

## Submission checklist

- [ ] Folder `widgets/<id>/` with `index.html`; `id` is lowercase and unique
- [ ] Includes `<script src="../../sdk/board21.js"></script>` as the first script in `<head>`
- [ ] If it has a manifest block (`board21-widget`), it matches its registry entry
- [ ] No external URLs (fonts, CDNs, images, APIs)
- [ ] No IndexedDB, localStorage, sessionStorage, or cookies; only `Board21.save` and `saveConfig`
- [ ] Student-identifying data is **content**, not config
- [ ] Handles `data` events (test with two tabs)
- [ ] Looks right in light and dark mode
- [ ] Usable from the registry's `minWidth`×`minHeight` up to *Fill the board*
- [ ] Drags: if any part of the widget needs dragging (text selection, drawing, custom sliders), it sets
      `dragFromContent: false`, or marks that area `data-b21-nodrag`
- [ ] Every file listed in `files`
- [ ] Works offline (load once, go offline, reload)
