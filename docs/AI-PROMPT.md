# Building a widget with an AI tool

You can make your own 21Board widget by describing it to an AI tool such as Gemini (Canvas), ChatGPT or
Claude. Paste one of the prompts below, then describe your widget. The tool writes one HTML file that runs
as a 21Board widget, and its preview shows the widget in a real 21Board window, the **dev window**.

- [How to use the prompt](#how-to-use-the-prompt)
- [Describing your widget](#describing-your-widget)
- [The full prompt](#the-full-prompt) (best results)
- [The short prompt](#the-short-prompt) (for a quick idea)

---

## How to use the prompt

1. **Start a new chat** in your AI tool, in its mode that shows a preview of a web page (in Gemini,
   *Canvas*).
2. **Paste the prompt**, then, below it, **describe your widget** (see the next section) and send it.
   Use the copy button at the top right of the prompt's box.
3. **Look at the preview.** It shows the widget in the dev window: the real 21Board window with its title
   bar, resize handles and window menu (⌄). Try it the way a class would:
   - drag a corner to make the window as small as it goes, then *Fill the board* from the window menu;
   - switch *Light* to *Dark* in the dev window's toolbar, and try **−** / **+** (the size of windows and
     menus);
   - use the window menu's items, and open a second copy (⋯ ▸ *Open another copy*);
   - *Data*: change the saved content and *Send as a change from another tab*, to check that the widget
     keeps up when the board is open on the smartboard and a laptop at once.
4. **Fix problems.** Open *Checks* in the dev window's toolbar. Each problem has **Copy fix request**: paste
   it into the chat as your next message. Errors from the widget show in red under *Events*; copy them into
   the chat too. Ask for changes in plain words ("make the names bigger", "add a menu item to hide the
   score"), one or two at a time. The prompt asks the tool to give the whole file back each time.
5. **Put it on your board.** Save the file as `something.html` (most tools have a download or copy
   button). In 21Board: **Settings → Advanced → Developer mode**, then under **Test a widget** tap
   **Upload file…** and pick the file (Chromebooks, Chrome on Windows and Mac, iPad Safari). It opens in a
   window named *Your Widget (test)*. To see a new version, upload the file again.
   - An uploaded widget stays **on that device only**: it isn't in exports, templates, board history or the
     Google Drive folder, and another device shows *Widget not installed* for it.
   - To share a widget with everyone, send it to the 21Board maintainers: in the dev window, ⋯ ▸
     **Copy for 21Board** copies the file and the entry they need.

**If the preview shows nothing**, or says `Board21 is not defined`: the tool's preview may not load the
21Board SDK. Copy the HTML into the **widget lab** (`sdk/lab.html` on a 21Board site, e.g.
<https://tylerloch.github.io/21Board/sdk/lab.html>) and tap **Try it**: the same dev window, with the same
Checks.

**The SDK address.** The prompts load the SDK from the 21Board test copy on GitHub Pages, which previews can
reach from anywhere. Inside 21Board the address doesn't matter: *Upload file…* puts in the board's own copy,
and *Copy for 21Board* points it at the `widgets/` folder.

---

## Describing your widget

Say, in a few sentences:

- **Who uses it and how**: students tapping it at the smartboard, the teacher at a laptop, or both.
- **The main thing on screen** and **the one main button** ("a big name in the middle and a *Pick a name*
  button").
- **What the teacher sets up**, and where ("the teacher types the list of jobs in an edit view").
- **What it should remember**, and whether anything is about students (names, scores: kept out of shared
  templates).
- **Options for the window menu** ("Sound on/off", "Show the score", "Start over").
- **Grade level and words**: "for kindergarten: pictures and very few words".

For example:

> A "Classroom Jobs" widget. The teacher types the jobs and the students' names in an edit view. On the
> board, each job shows as a big card with the student's name. One button, *Rotate*, moves everyone to
> the next job. Window menu: *Edit jobs and names…*, *Show pictures* (on/off). Names are about students.

---

## The full prompt

Covers the whole widget kit: saving, the window menu, window size (including making room for a settings
view), dragging, light and dark, and how 21Board's own widgets look and behave. It ends with a check list the
tool goes through before answering.

````markdown
# Build a 21Board widget

Write a **21Board widget**: one small web page that runs in a window on a classroom smartboard (K–8
teachers and students; also Chromebooks and iPads). 21Board gives it a window the teacher can move,
resize and close, saves its data on the device and keeps every open copy of the board in sync. Build
the widget I describe after this prompt. If I haven't described one, ask me what it should do.

## Hard rules

- We need **one plain HTML file** (no React, JSX, TypeScript, libraries or build step). `<!DOCTYPE html>`
  is the very first line, then `<html lang="en">`.
- In `<head>`, right after `<meta charset="utf-8">`, the first script must be exactly
  `<script src="https://tylerloch.github.io/21Board/sdk/board21.js"></script>` (no async, defer or type=module).
- The next line is a manifest:
  `<script type="application/json" id="board21-widget">{"id":"my-widget","name":"My Widget","version":"1.0.0","window":{"width":400,"height":300,"minWidth":240,"minHeight":180}}</script>`.
  Replace "my-widget" and "My Widget" with the name the user chose for the widget.
  - The id is lowercase letters, digits and dashes. Strict JSON: no comments, no trailing commas.
  - You may add `"description"` (one short sentence for teachers) and `"color"` (a `#hex` for its tile),
    and change the `window` sizes and keys to suit the widget (see *Window size*).
- Then `<meta name="viewport" content="width=device-width, initial-scale=1">`, a `<title>` with the
  widget's name, one `<style>`, the markup, and one `<script>` at the end of `<body>`.
- **No network at all**: no Tailwind or other CDNs, no web fonts, no external images, no `fetch`. Draw
  pictures with inline SVG, CSS or emoji. Write no `http://` or `https://` address anywhere in your own
  script code, not even the SVG namespace (inline `<svg>` markup doesn't need `xmlns`; for
  `createElementNS` take it from an `<svg>` in the page: `svgEl.namespaceURI`).
- **No storage of your own**: never use localStorage, sessionStorage, IndexedDB or cookies, and don't
  name them in comments either (the checks look for the words). Save only with `Board21.save` /
  `Board21.saveConfig`.
- No `alert()`, `confirm()` or `prompt()` (nor functions of your own with those names): show messages and
  "Are you sure?" inside the widget. No `autofocus` and no `.focus()` on load (it pops up the on-screen
  keyboard); focus a text box only after the tap that opened it.

## Skeleton (follow its shape)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<script src="https://tylerloch.github.io/21Board/sdk/board21.js"></script>
<script type="application/json" id="board21-widget">{"id":"my-widget","name":"My Widget","version":"1.0.0","window":{"width":400,"height":300,"minWidth":240,"minHeight":180}}</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Widget</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body { background: var(--b21-bg); color: var(--b21-text); font-family: var(--b21-font);
         touch-action: manipulation; user-select: none; -webkit-user-select: none; }
  input, textarea { user-select: text; -webkit-user-select: text; font: inherit; }  /* iPad types only in selectable boxes */
  .view { position: absolute; inset: 0; display: none; flex-direction: column; box-sizing: border-box;
          gap: clamp(6px, 2vmin, 14px); padding: clamp(8px, 3vmin, 20px); }
  .view.on { display: flex; }
  .stage { flex: 1; min-height: 0; display: grid; place-items: center; text-align: center;
           border-radius: 16px; background: var(--b21-surface); box-shadow: inset 0 0 0 1px var(--b21-border); }
  .big { font-size: min(13vw, 24vh); font-weight: 800; line-height: 1.05; }
  button { font: inherit; font-weight: 650; min-height: 48px; padding: 0 clamp(12px, 4vmin, 28px); border: 0;
           border-radius: 999px; background: var(--b21-surface-2); color: var(--b21-text); cursor: pointer; }
  button.primary { background: var(--b21-accent); color: var(--b21-on-accent); }
</style>
</head>
<body>
  <section class="view" id="use"> … the stage and ONE big primary button … </section>
  <section class="view" id="edit"> … the editor … <button class="primary" id="done">Done</button></section>
<script>
  let state = { items: [] };    // content (the work)   -> Board21.save
  let config = { big: false };  // preferences          -> Board21.saveConfig
  // Saved values can come from an imported file: check every field, fall back to defaults.
  const readState = d => ({ items: Array.isArray(d && d.items) ? d.items.filter(x => typeof x === 'string').slice(0, 200) : [] });
  const readConfig = c => ({ big: !!(c && c.big === true) });

  function render() { /* set textContent / attributes / classes; never innerHTML with saved text */ }
  function setMenu() {
    Board21.menu.set([{ id: 'edit', label: 'Edit…' }, { id: 'big', label: 'Big text', checked: config.big }]);
  }
  Board21.on('menu', id => { /* change state or config, save it, render(), setMenu() */ });
  Board21.on('data', d => { state = readState(d); render(); });
  Board21.on('config', c => { config = readConfig(c); render(); setMenu(); });

  async function start() {
    const ctx = await Board21.ready();
    state = readState(ctx.data);
    config = readConfig(ctx.config);
    render(); setMenu();
  }
  start();
</script>
</body>
</html>
```

## Saving: content and config

- Start with `const ctx = await Board21.ready()` and draw from `ctx.data` and `ctx.config` (both `null`
  the first time).
- **Content**, `Board21.save(state)`: the work (names, lists, scores, answers, text, timer state).
  **Config**, `Board21.saveConfig(cfg)`: preferences (mode, colors, options). Teachers share boards as
  templates, which keep config and leave content out, so **anything about students is content, never
  config.** The window menu's Reset clears both.
- Save the whole small JSON object whenever it changes (no need to await; 21Board batches writes, skips
  unchanged ones and retries by itself). Keep it to kilobytes.
- Handle `Board21.on('data', d => …)` and `Board21.on('config', c => …)` by re-rendering from the value
  given: the board can be open in several tabs (smartboard and teacher laptop), and an import or an earlier
  version can replace it. If a text box is being typed in, update it only if the text differs, and keep
  the cursor.
- **Check what you load**: `ctx.data`, `ctx.config` and both events can come from a file someone
  imported. Check every field's type and range. Show text with `textContent` (or `setAttribute`),
  never `innerHTML`.
- **Times**: save wall-clock times (`endsAt: Date.now() + ms`), not ticking counters, and don't save on
  every tick. Every copy then shows the same countdown, even after a reload.
- A teacher can open the widget several times: each window has its own content and config
  (`ctx.instance` is 1, 2, 3…). Nothing to do for this.

## Window menu

Settings and rarely used commands go in the window's menu (the ⌄ beside the widget's name), above the
board's own *Fill the board*, *Reset* and *Close*. Set it with `Board21.menu.set([...])`, react in
`Board21.on('menu', id => …)`.

- `{ id: 'edit', label: 'Edit names…' }`: a command.
- `{ id: 'norepeat', label: 'No repeats', checked: true }`: a checkmark item (`checked: false` shows it
  unchecked). Use one per option, or a group of them for pick-one choices.
- `{ id: 'clear', label: 'Clear', disabled: true }`, `{ separator: true }`, `{ heading: true, label: 'Size' }`.
- `{ label: 'Color', swatches: [{ id: 'color:blue', label: 'Blue', color: '#bfdbfe', checked: true }, …] }`:
  a row of up to 12 color circles; tapping one sends its id. Colors `#rgb` or `#rrggbb` only.
- At most **24 items** (a swatch row counts as one). Every command and checkmark item has its own id.
  Short labels. Icons are optional (an inline `<svg …>` string only).
- **Call `menu.set()` again whenever a checkmark, label or disabled state changes** (not on every tick).

## Window size

Sizes are the window's content area (without its 40px title bar), in the same px as `ctx.window` and
`await Board21.window.getInfo()`: `{ width, height, x, y, maximized, focused }`.

- **Manifest `window`**: `width`, `height` (the size it opens at), `minWidth`, `minHeight` (the smallest
  it can be: the widget must still work there), and optionally `maxWidth`, `maxHeight`, `aspectRatio`
  (a number or `"16:9"`: a fixed shape, e.g. `1` for a dial), `"resizable": false`,
  `"dragFromContent": false` (see *Dragging*).
- **The teacher owns the size.** Never resize on load or by yourself. Change it only after a tap.
- **A bigger view for a while** (settings, an editor): when it opens, `Board21.window.setMinSize(520, 400)`
  (whatever it needs); when it closes, `Board21.window.setMinSize(null, null)`. The window grows to at
  least that size (never beyond the board) without changing its saved size, then goes back to the
  manifest's minimum and the teacher's own size by itself. If the teacher moves or resizes it while it
  is bigger, it keeps that. A reload shows the normal size again.
- **A lasting change of size** (the teacher picks a layout that needs another shape):
  `Board21.window.setSize(w, h)`. It is fitted to the min/max sizes, shape and the board, keeps its
  top-left corner where it can (it may move to stay on the board and out of other windows' way), takes
  the window out of *Fill the board*, and is saved with the board (kept after a reload, the same in every
  tab). So skip it when `Board21.context.window.maximized`. To undo it later, first keep
  `await Board21.window.getInfo()` and set that `width`/`height` back, unless the size has changed since
  (the teacher resized it).
- `Board21.window.setAspectRatio(16 / 9)` (or `null`) changes the shape lock, e.g. per mode;
  `setMaxSize(w, h)` (`null` removes it); `setResizable(false)` hides the resize grips.
- `setMinSize`, `setMaxSize`, `setAspectRatio`, `setResizable`, `setDragFromContent`, `setTitle` and
  the menu last until the widget reloads: set them again in `start()` from config and state.
- `Board21.window.maximize()` / `restore()`: *Fill the board* and back (the menu already offers it; use
  it only for a widget's own "Present" kind of button). `focus()` and `close()` also exist.
- Lay out with CSS so a resize needs no code. `Board21.on('resize', info => …)` is for redrawing a
  `<canvas>` or switching to a compact layout. `Board21.context.window` always holds the current size.

## Status, attention, messages, events

- `Board21.window.setTitle('Running')`: a word or two after the widget's name in the title bar (`''`
  clears it; hidden in narrow windows).
- `Board21.window.requestAttention()`: pulses the title bar, e.g. when a timer ends.
- `Board21.toast('Copied!')`: a short message at the bottom of the board. Use rarely.
- `Board21.on('theme', (theme, palette) => …)`: the CSS variables are already updated; redraw only
  canvases (take colors from `palette` or `getComputedStyle`).
- `Board21.on('focus' | 'blur', …)`: the window was selected or deselected. **`blur` also fires when the
  teacher taps the empty board while the window stays in view**: never pause, hide or stop on blur.
- `Board21.on('beforeclose', () => …)`: save anything not yet saved, right away (no awaiting).
- Context worth using: `ctx.instance`; `ctx.window`; `ctx.theme` (`'light'`/`'dark'`); `ctx.palette`
  (the variables' colors, for canvas); `ctx.locale` (for dates and numbers:
  `toLocaleDateString(ctx.locale, …)`); `ctx.kiosk` (a locked-down Chromebook: links can't open new
  windows, so hide them); `ctx.devMode` (Developer mode is on: extra details may show).

## Dragging

The teacher can move the window by dragging anywhere inside it; a tap is still a tap.

- The widget needs drags or typing everywhere (drawing, a text editor, sorting by dragging): set
  `"dragFromContent": false` in the manifest's `window`.
- One area needs drags (a sketch pad, a slider made of divs): put `data-b21-nodrag` on it. Text boxes,
  selects, range sliders and `<canvas>` never move the window anyway.
- It depends on the view: `Board21.window.setDragFromContent(false)` while the editor shows, `true` when
  it closes.
- Update buttons in place (text, attributes, classes); don't rebuild them with `innerHTML` on every
  change: a button replaced under a finger loses the tap.

## Look and feel

- **Readable from the back of the classroom**: the main thing is big and bold and grows with the window
  (`min(13vw, 24vh)`, `clamp(…, …vmin, …)`). Secondary text in `var(--b21-muted)`. No tiny text.
- **One obvious main action**: a big accent button. Other buttons are quieter (`--b21-surface-2`).
- **Settings and rarely used commands in the window menu; editing in its own view** with a clear *Done*
  button, so the main view stays clean for students. Save edits as they're typed.
- **An empty state that says what to do**, with the button that does it ("Add names to get started").
- **Works from the minimum size to Fill the board** without scrolling or cut-off text: flex/grid with
  `min-height: 0`, %, `vmin`, `clamp()`; hide extras in tiny windows (`@media (max-height: 220px)`);
  shrink long words to fit rather than cut them.
- **Calm colors from the variables**, so light and dark mode and the teacher's accent color just work:
  `--b21-bg`, `--b21-surface`, `--b21-surface-2`, `--b21-text`, `--b21-muted`, `--b21-border`,
  `--b21-accent`, `--b21-on-accent`, `--b21-accent-soft`, `--b21-danger`, `--b21-success`,
  `--b21-warning`, `--b21-font`, `--b21-radius`. Any color of your own gets a dark version under
  `[data-b21-theme="dark"]`. Strong colors only for meaning (done, warning) or a theme the teacher picks.
- **Touch first**: tap targets at least 48px, no hover-only controls, `touch-action: manipulation`, no
  double-tap or long-press-only actions.
- **Motion**: short and purposeful; none under `@media (prefers-reduced-motion: reduce)`.
- **Sound only when the teacher turns it on** (a checkmark menu item saved in config). Make it with the
  Web Audio API (no sound files), and create the `AudioContext` on a tap: browsers block sound before one.
- Plain, short, friendly words a K–8 student or busy teacher understands. No jargon.

## Before you answer, check

- [ ] `<!DOCTYPE html>` first; the SDK tag exactly as given, the first script, right after `<meta charset="utf-8">`; the manifest next, valid JSON, its id and name replaced.
- [ ] No address, CDN, font, image or fetch from the internet; no `http(s)://` in your own script code; no localStorage, sessionStorage, IndexedDB or cookies (not even in comments); no alert/confirm/prompt; no autofocus; no React.
- [ ] `const ctx = await Board21.ready()`; draws from `ctx.data` / `ctx.config`; `data` and `config` handlers re-render.
- [ ] Student information saved with `save()`, preferences with `saveConfig()`; loaded values checked; saved text shown with `textContent`.
- [ ] Menu: at most 24 items, each with its own id, swatches `#hex` (at most 12 per row); `menu.set()` called again when state changes.
- [ ] Works and reads well at `minWidth` × `minHeight` and at Fill the board, in light and dark, without scrolling; 48px tap targets.
- [ ] Typing, drawing or dragging areas: `dragFromContent: false`, `data-b21-nodrag` or `setDragFromContent`.
- [ ] A bigger editor uses `setMinSize(…)` and `setMinSize(null, null)`; `setSize` only after a tap and never when maximized.

## Your answer

Output the **whole file in one code block** (marked `html`): nothing left out, no "…" or "rest unchanged". After
it, at most three short lines on how to use the widget. When I ask for a change, output the whole file
again.
````

---

## The short prompt

The essentials only, for trying out an idea. For a widget you will keep, use the full prompt.

````markdown
Build the widget I describe below as a 21Board widget (a window on a K–8 classroom smartboard). We need **one plain HTML file** (no React, no build step), starting with `<!DOCTYPE html>`. In `<head>`, right after `<meta charset="utf-8">`, the first script must be exactly `<script src="https://tylerloch.github.io/21Board/sdk/board21.js"></script>` (no async, defer or type=module).

The next line is a manifest:
`<script type="application/json" id="board21-widget">{"id":"my-widget","name":"My Widget","version":"1.0.0","window":{"width":400,"height":300,"minWidth":240,"minHeight":180}}</script>`.
Replace "my-widget" and "My Widget" with the name the user chose for the widget. Add `"dragFromContent":false` to `window` if the widget needs typing, drawing or dragging.

Start with `const ctx = await Board21.ready()` and draw from `ctx.data`. Save content with `Board21.save(state)` and preferences with `Board21.saveConfig(cfg)`; anything about students (names, scores) is content, never config. Handle `Board21.on('data', …)` and `Board21.on('config', …)` by re-rendering from the value given. Check the type of every loaded field and show text with `textContent`, never `innerHTML`. Save timers as wall-clock times (`endsAt`). Never use localStorage, sessionStorage, IndexedDB or cookies (don't even name them in comments).

Put settings and rarely used commands in the window menu with `Board21.menu.set([...])` (at most 24 items, each with an id; `checked: true/false` for options; `#hex` colors only; call it again when state changes) and react in `Board21.on('menu', id => …)`. Do editing in a separate view with a Done button: while it shows, call `Board21.window.setMinSize(w, h)` for room and `setDragFromContent(false)`; when done, `setMinSize(null, null)` and `setDragFromContent(true)`. Never resize the window on load. Use `Board21.window.setTitle('…')` for status and `requestAttention()` when a timer ends. Don't pause anything on `blur`.

Style with plain CSS using `var(--b21-bg)`, `--b21-surface`, `--b21-surface-2`, `--b21-text`, `--b21-muted`, `--b21-border`, `--b21-accent`, `--b21-on-accent`, `--b21-font` (they switch for dark mode). Big, bold, kid-readable text that grows with the window (`min(13vw, 24vh)`), one obvious main button, and an empty state that says what to do.
Make NO network requests: no Tailwind or other CDNs, no web fonts, no external images, no `http(s)://` in scripts. Fill the window (`html, body {margin:0; height:100%; overflow:hidden}`) with flex/grid and %/vmin so it works at every size without scrolling. Tap targets at least 48px. No alert/confirm/prompt or autofocus.
Output the whole file in one code block.
````
