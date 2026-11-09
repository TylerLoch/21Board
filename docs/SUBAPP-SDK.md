# 21Board Sub-app SDK

A **sub-app** is a small web page that runs inside a 21Board window. 21Board loads it in an
`<iframe>`, gives it a window the teacher can move and resize, saves its data, and keeps it in
sync across every open copy of 21Board.

Sub-apps talk to the board through one script: `sdk/board21.js`, which defines `window.Board21`.

- [Quick start](#quick-start)
- [Rules for sub-apps](#rules-for-sub-apps)
- [API reference](#api-reference)
- [Content vs. config](#content-vs-config)
- [Multiple instances and sync](#multiple-instances-and-sync)
- [Theming](#theming)
- [Registering a sub-app](#registering-a-sub-app)
- [Testing](#testing)
- [Submission checklist](#submission-checklist)

---

## Quick start

Copy `apps/_template/` to `apps/<your-id>/` and edit it. The essentials:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Counter</title>
  <script src="../../sdk/board21.js"></script>
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

---

## Rules for sub-apps

1. **No external requests.** No CDNs, web fonts, analytics or APIs. Everything must be in your
   folder so the app works offline and no student data leaves the device.
2. **No direct storage.** Don't use IndexedDB, `localStorage`, cookies or `sessionStorage`.
   Use `Board21.save()` / `Board21.saveConfig()`. That's what makes export/import, templates,
   reset, multi-tab sync and multiple instances work.
3. **Keep data JSON and small.** Saved values must survive `JSON.stringify`. Aim for kilobytes,
   not megabytes. (Images: downscale and store as a data URL only if you must.)
4. **Scale with the window.** The iframe *is* the window's content area, so size things with
   `vw` / `vh` / `vmin` or flexbox and test small and large sizes.
5. **Touch first.** Big targets (44px+), no hover-only controls, no tiny text. Add
   `touch-action: manipulation` to avoid double-tap zoom delays.
6. **Don't steal focus on load.** Auto-focusing a text box pops up the on-screen keyboard on a
   smartboard.
7. **One folder, few files.** Prefer a single `index.html` with inline CSS/JS.
8. **Never change your `id`** after release; saved data is keyed by it.

---

## API reference

All methods are safe to call before `ready()` resolves; they wait for it.

### Lifecycle

| Call | Description |
| --- | --- |
| `Board21.ready()` | Promise that resolves with the **context** once 21Board has introduced itself. |
| `Board21.context` | The context object (or `null` before ready). |
| `Board21.embedded` | `true` inside 21Board, `false` in [standalone mode](#testing). |
| `Board21.theme` | `'light'` or `'dark'`. |
| `Board21.version` | SDK version string. |

The **context**:

```js
{
  appId: 'timer',            // your registry id
  appName: 'Timer',
  appVersion: '1.0.0',
  instance: 2,               // this window's instance number (1, 2, 3...)
  data: { ... } | null,      // saved content for this instance
  config: { ... } | null,    // saved config for this instance
  theme: 'light' | 'dark',
  palette: { bg, text, accent, ... },   // same values as the --b21-* CSS variables
  window: { width, height, x, y, maximized, focused },  // content size in CSS px
  locale: 'en-US',
  devMode: false,            // Developer mode is on in Settings
  boardVersion: '1.0.0',
  sdkProtocol: 1,
  standalone: false
}
```

### Saving

| Call | Description |
| --- | --- |
| `Board21.save(data)` | Save this instance's **content**. Returns a Promise that resolves once it's stored. Call it whenever the state changes; 21Board batches rapid writes. `save(null)` clears it. |
| `Board21.load()` | Promise of the saved content (same as `context.data`). |
| `Board21.saveConfig(config)` | Save this instance's **config** (preferences). |
| `Board21.loadConfig()` | Promise of the saved config. |

### Window

Sizes are the **content area** (the iframe), not including the 40px title bar.

| Call | Description |
| --- | --- |
| `Board21.window.setSize(w, h)` | Resize the window. It stays on screen and avoids other windows where it can. |
| `Board21.window.setAspectRatio(ratio)` | Lock the content to `width / height` (e.g. `16/9`). `null` unlocks. |
| `Board21.window.setMinSize(w, h)` | Minimum content size. |
| `Board21.window.setMaxSize(w, h)` | Maximum content size. `null` removes the limit. |
| `Board21.window.setResizable(bool)` | Show or hide the resize grips. |
| `Board21.window.setTitle(text)` | Short status shown after the app name in the title bar, e.g. `"Running"`. Hidden in narrow windows. |
| `Board21.window.requestAttention()` | Pulse the title bar (e.g. a timer finished). |
| `Board21.window.focus()` | Bring the window to the front. |
| `Board21.window.maximize()` / `restore()` | Fill the board / return to normal size. |
| `Board21.window.close()` | Close the window. Its data is kept. |
| `Board21.window.getInfo()` | Promise of `{ width, height, x, y, maximized, focused }`. |

Defaults for size, minimum size and aspect ratio come from the [registry](#registering-a-sub-app),
so the window is the right shape before your page even loads. Runtime calls override them
until the window is reset or reloaded; call them again in `ready()` if they depend on config
(see `apps/clock`).

### Window menu

Your own items appear in the window's **⌄** menu, above Fill the board / Reset / Close.

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

Call `menu.set()` again whenever an item's state changes. Icons must be inline `<svg>` (scripts
and links are stripped). Up to 20 items.

### Events

`Board21.on(event, handler)` returns an unsubscribe function. `Board21.off(event, handler)` also works.

| Event | Handler arguments | When |
| --- | --- | --- |
| `data` | `(data, { reason })` | This instance's content changed outside this page: another 21Board tab, an import, or a reset. |
| `config` | `(config, { reason })` | Same, for config. |
| `theme` | `(theme, palette)` | Light/dark changed. CSS variables are already updated. |
| `resize` | `(info)` | The window's content size, maximized or focused state changed. (Native `resize` events also fire.) |
| `focus` / `blur` | — | The window became / stopped being the front window. |
| `menu` | `(id, item)` | One of your menu items was tapped. |
| `beforeclose` | — | The window is about to close. Save anything pending *synchronously* (call `save()`). |

### Other

| Call | Description |
| --- | --- |
| `Board21.toast(text)` | Show a short message at the bottom of the board. |

Tapping anywhere inside your app brings its window to the front automatically.

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
content, never config.** (Name Picker keeps its name list in content for exactly this reason.)

---

## Multiple instances and sync

- A teacher can open the same sub-app several times. Each window is an **instance** with its own
  number (`context.instance`: 1, 2, 3…) and its own saved content and config. You don't need to
  do anything for this.
- Closing a window **keeps** its data. Opening the app again reopens the lowest-numbered closed
  instance with its data; when all are open, a new number is created.
- Several 21Board tabs/windows can be open at once (e.g. the smartboard and the teacher's laptop).
  They all show the same board. When one copy saves, the others receive a `data` (or `config`)
  event with the new value. **Handle `data` by re-rendering from the value you're given.**
  If you're mid-edit (e.g. the user is typing), merge gracefully — see `apps/notes`.
- Store time-based state as wall-clock times (e.g. `endsAt: Date.now() + ms`), not ticking
  counters, so every copy shows the same thing. See `apps/timer`.
- Saving the same value again is free: 21Board skips writes that don't change anything, so
  re-saving inside a `data` handler won't cause loops.

---

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

Use `[data-b21-theme="dark"] .thing { … }` for anything else that should change in dark mode.

---

## Registering a sub-app

Add an entry to `apps/registry.js`:

```js
{
  id: 'counter',                       // folder name; lowercase a-z, 0-9, dashes; never change it
  name: 'Counter',                     // shown in the App Picker and title bar
  description: 'Count anything.',      // shown as a tooltip
  version: '1.0.0',
  entry: 'apps/counter/index.html',
  files: ['apps/counter/index.html'],  // EVERY file the app needs (images, extra scripts...) for offline use
  color: '#0ea5e9',                    // App Picker tile color
  icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>', // 24x24 stroke icon, drawn white
  window: {
    width: 320, height: 240,           // default CONTENT size (title bar is added)
    minWidth: 200, minHeight: 160,
    // maxWidth, maxHeight             optional
    // aspectRatio: 16 / 9             optional content aspect-ratio lock
    // resizable: false                optional
  },
  permissions: [],                     // e.g. ['microphone', 'camera'] — added to the iframe's allow=""
  // devOnly: true                     only listed when Developer mode is on
}
```

Then **bump `VERSION` in `sw.js`** so installed copies download the new files.

---

## Testing

- **Standalone:** open `apps/<id>/index.html` directly in a browser (through any local web
  server). The SDK notices it isn't inside 21Board, saves to `localStorage`, follows the system
  light/dark setting, and shows a small dropdown in the corner for your menu items.
- **Inside 21Board without registering:** Settings → Advanced → turn on **Developer mode**, then
  enter the path (e.g. `apps/my-app/index.html`) under **Test a sub-app**.
- **SDK Playground:** with Developer mode on, open *SDK Playground* from the App Picker to try
  every call and watch events.
- **Sync:** open 21Board in two tabs side by side and use your app in one.

---

## Submission checklist

- [ ] Folder `apps/<id>/` with `index.html`; `id` is lowercase and unique
- [ ] Includes `<script src="../../sdk/board21.js"></script>` before your own scripts
- [ ] No external URLs (fonts, CDNs, images, APIs)
- [ ] No IndexedDB / localStorage / cookies — only `Board21.save` / `saveConfig`
- [ ] Student-identifying data is **content**, not config
- [ ] Handles `data` events (test with two tabs)
- [ ] Looks right in light and dark mode
- [ ] Usable from the registry's `minWidth`×`minHeight` up to full screen
- [ ] Every file listed in `files`
- [ ] Works offline (load once, go offline, reload)
