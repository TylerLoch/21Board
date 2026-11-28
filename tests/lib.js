/*
 * What every suite shares: ok(), the page helpers, the fixtures, and the stand-in sites.
 * tests/run.js loads it, and each file in tests/suites/ takes the names it uses.
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'output') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.21board': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

let fails = 0, passes = 0, SUITE = '';
// On GitHub, each failure is also an annotation, so it shows on the run's page.
const ghEscape = (x, prop) => {
  const s = String(x).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return prop ? s.replace(/:/g, '%3A').replace(/,/g, '%2C') : s;
};
// Only failures print, unless --verbose: a suite's checks pass by the hundred, and someone has to read the output.
const VERBOSE = process.argv.includes('--verbose');
const ok = (cond, msg) => {
  if (cond) passes++; else fails++;
  if (!cond || VERBOSE) console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + msg);
  if (!cond && process.env.GITHUB_ACTIONS) console.log(`::error title=${ghEscape(SUITE, true)}::${ghEscape(msg)}`);
};
let BASE;

// Most suites test window behavior on a board that is simply the screen at 100% (Settings →
// Board shape: Fill, size 100%), so window px are screen px. The 16:9 board has its own suite.
async function freeBoard(page) {
  await page.evaluate(() => { window.__board21.setBoardShape('free'); window.__board21.setBoardScale(1); });
  await page.waitForTimeout(100);
}

// Settings, opened from the ▦ in that corner (left or right), with the groups named open: Settings starts with every
// group closed, and a control inside one can't be tapped until it is open. The groups: 'saved' (This page → Windows),
// 'letters' and 'bg' (Appearance → Text style, Background) and 'advanced'. Settings already open on that side
// stays open (its open groups too).
async function openSettings(p, groups = [], side = 'left') {
  if (!await p.locator(`#settings.open.${side}`).count()) {
    if (!await p.locator(`#panel.open.${side}`).count()) await p.click(`.picker-btn.${side}`);
    await p.click('.panel.open [data-ctl="settings"]');
    await p.waitForSelector('#settings.open');
  }
  for (const g of [].concat(groups)) {
    const b = p.locator(`#settings [data-act="group"][data-val="${g}"]`);
    if (await b.getAttribute('aria-expanded') !== 'true') await b.click();
  }
  await p.waitForTimeout(250);
}

// Settings › Appearance › Theme ('light', 'dark' or 'system'), chosen as a teacher does, and Settings closed again.
async function setTheme(p, theme) {
  await openSettings(p);
  await p.click(`#settings [data-act="theme"][data-val="${theme}"]`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
}

// Lock, as a teacher does: Lock in the Widget Picker, then 'all' (Lock everything) or 'widgets' (Widgets still work).
async function lockBoard(p, mode = 'widgets', side = 'left') {
  if (!await p.locator(`#panel.open.${side}`).count()) await p.click(`.picker-btn.${side}`);
  await p.click('#panel.open [data-ctl="lock"]');
  await p.locator('#modal.open .btn', { hasText: mode === 'all' ? 'Lock everything' : 'Widgets still work' }).click();
  await p.waitForTimeout(300);
}
// Unlock from the keyboard: Enter on a padlock, then Unlock. (Holding one for 2 seconds is the Lock suites'.)
async function unlockBoard(p) {
  await p.locator('.lock-pad:not([hidden])').first().focus(); await p.keyboard.press('Enter');
  await p.locator('#modal.open .btn', { hasText: /^Unlock$/ }).click(); await p.waitForTimeout(300);
}

// Settings → Advanced → Clock in the corner, chosen as a teacher does ('on', 'off' or 'auto'), and Settings closed again.
// Auto, the default, shows the clock only in full screen: a test of what sits beside or under the clock turns it On.
async function setCornerClock(p, mode = 'on', side = 'left') {
  await openSettings(p, ['advanced'], side);
  await p.click(`#settings [data-act="clock"][data-val="${mode}"]`); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
}

// Renames the page shown, as a teacher does (‹ Page › → Rename this page…: Settings has no name field).
async function renamePage(p, name) {
  await p.evaluate(() => { window.__board21.pages.rename(); });
  await p.waitForSelector('#modal.open input'); await p.fill('#modal.open input', name);
  await p.click('#modal.open .btn.primary'); await p.waitForTimeout(250);
}

// Notes shows its text (with tappable links) until tapped; tap it, then type.
async function fillNote(f, text) { const v = f.locator('#view'); if (await v.isVisible()) await v.click(); await f.locator('#t').fill(text); }

// Pages for the widget dev window tests: a widget as an AI tool would make it, and stand-ins for how AI previews
// show it (fetch the code, then document.write it or open it as a blob: URL) on another origin than the page.
const DEV_WIDGET = sdk => `<!DOCTYPE html><html lang="en"><head><script src="${sdk}"></script>
<script type="application/json" id="board21-widget">{"id":"counter","name":"Counter","version":"1.0.0","window":{"width":320,"height":240,"minWidth":200,"minHeight":150,"aspectRatio":"4:3"}}</script>
<meta charset="utf-8"><title>Counter</title><style>html,body{margin:0;height:100%}body{display:grid;place-items:center;font:700 30vmin/1 system-ui;background:var(--b21-bg);color:var(--b21-text)}</style></head>
<body><div id="n">0</div><script>
window.__runs = (window.__runs || 0) + 1;
let st = { count: 0 };
Board21.ready().then(ctx => { st = Object.assign(st, ctx.data); document.getElementById('n').textContent = st.count;
  Board21.menu.set([{ id: 'add', label: 'Add one' }, { separator: true }, { label: 'Color', swatches: [{ id: 'red', label: 'Red', color: '#dc2626' }, { id: 'bad', label: 'Bad', color: 'red' }] }]); });
Board21.on('data', d => { st = Object.assign({ count: 0 }, d); document.getElementById('n').textContent = st.count; });
Board21.on('menu', id => { if (id === 'add') { st.count++; document.getElementById('n').textContent = st.count; Board21.save(st); } });
setTimeout(() => { throw new Error('boom from the widget'); }, 400);
</script></body></html>`;
// Every visit to /__dev/away.html: a page an uploaded widget tries to take its window to (on another site).
const AWAY = [];
const DEV_ROUTES = {
  '/__dev/away.html': q => { AWAY.push(q.toString()); return `<!doctype html><body>away<script>parent.postMessage({ b21: 1, type: 'hello' }, '*');</script>`; },
  '/__dev/widget.html': () => DEV_WIDGET(BASE + 'sdk/board21.js'),
  '/__dev/late.html': () => DEV_WIDGET(BASE + 'sdk/board21.js').replace(/<script src="[^"]*board21\.js"><\/script>/, '').replace('<body>', `<body><script src="${BASE}sdk/board21.js"></script>`),
  '/__dev/quirks.html': () => DEV_WIDGET(BASE + 'sdk/board21.js').replace('<!DOCTYPE html>', ''),
  '/__dev/console.html': () => `<!DOCTYPE html><html><head><script src="${BASE}sdk/board21.js"></script><script>window.__seen = []; const o = console.error; console.error = function () { window.__seen.push(Array.from(arguments).join(' ')); return o.apply(console, arguments); }; Board21.ready().then(() => setTimeout(() => console.error('after ready'), 50));</script></head><body>console</body></html>`,
  '/__dev/shim-write.html': () => `<!doctype html><script>fetch('widget.html').then(r => r.text()).then(h => { document.open(); document.write(h); document.close(); });</script>`,
  '/__dev/shim-blob.html': () => `<!doctype html><script>fetch('widget.html').then(r => r.text()).then(h => location.replace(URL.createObjectURL(new Blob([h], { type: 'text/html' }))));</script>`,
  // The page around the preview, on another origin (localhost vs 127.0.0.1), like gemini.google.com around its preview.
  '/__dev/top.html': q => `<!doctype html><body style="margin:0"><iframe src="${BASE.replace('127.0.0.1', 'localhost')}__dev/${q.get('s')}" sandbox="allow-scripts${q.get('opaque') ? '' : ' allow-same-origin'}" style="width:760px;height:560px;border:0"></iframe>`
};

// Board Sync tests (a shared Google Drive folder). Each "device" is its own browser profile; the folder each one picks is a
// folder in that browser's private file system, and deliver() brings chosen files from one device's folder to another's,
// as Google Drive would, leaving everything else there alone. (Wrapped in a plain object: this headless browser closes
// the page when it reads a saved folder handle back from IndexedDB, so the stand-in can't be saved and stays linked
// until the page closes. Real Chrome keeps the handle. After a reload, a test links the folder again.)
// A test can make the folder misbehave through window.__drive: {perm: 'prompt' | 'denied' (what Chrome answers
// when asked whether the folder may be used; asking for it from a tap then gives `grant`, if set), gone: true (the
// folder can't be found), readOnly: true (files can't be written), full: true (writing fails: no room), unreadable:
// [names of files that are listed but can't be read yet], noContent: {name: ms} (files whose size and date can be
// read, the date that long ago, but whose content can't yet), hang: [names] (reading them never settles), stamp:
// {name: {size, lastModified}} (the size and date a file shows, whatever its content: see deliver's sameStamp), slow:
// ms (the folder takes that long to list), failWrite: [names] (writing one fails once, as when the device sleeps),
// badDirs: [names] (folders that can't be opened or listed just now)}. window.__writes: the name of each file 21Board
// writes, in order; window.__wrote: {name, bytes} for each, the bytes it wrote.
// The picker gives the folder named by window.__drive.pick: a path in the private file system, 'My Drive' or
// 'My Drive/21Board' (made if it isn't there; '21Board' when not set). pickFails: the name of the error the picker
// throws instead ('AbortError': the teacher cancelled). readOnly also stops new folders being made in it.
// window.__picks: for each time the picker opened, whether it was from a tap (Chrome opens it only then).
const DRIVE_PICK = () => {
  const F = () => window.__drive || {};
  window.showDirectoryPicker = async () => {
    window.__picks = (window.__picks || []).concat([!!(navigator.userActivation && navigator.userActivation.isActive)]);
    if (F().pickFails) throw new DOMException('The user aborted a request.', F().pickFails);
    let real = await navigator.storage.getDirectory();
    for (const n of (F().pick || '21Board').split('/')) real = await real.getDirectoryHandle(n, { create: true });
    const gone = () => { if (F().gone) throw new DOMException('A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError'); };
    const unread = () => { throw new DOMException('The requested file could not be read.', 'NotReadableError'); };
    const file = fh => ({ kind: 'file', name: fh.name,
      getFile: async () => {
        if ((F().hang || []).includes(fh.name)) return new Promise(() => {});
        if ((F().unreadable || []).includes(fh.name)) unread();
        const f = await fh.getFile(), age = (F().noContent || {})[fh.name], st = (F().stamp || {})[fh.name];
        if (st) return { size: st.size, lastModified: st.lastModified, text: () => f.text(), arrayBuffer: () => f.arrayBuffer(), slice: (a, b) => f.slice(a, b) };
        return age === undefined ? f : { size: f.size, lastModified: f.lastModified - age, text: async () => unread(), slice: () => ({ text: async () => unread() }) };
      },
      createWritable: async () => {
        if (F().readOnly) throw new DOMException('An attempt was made to modify an object where modifications are not allowed.', 'NoModificationAllowedError');
        if (F().full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        if ((F().failWrite || []).includes(fh.name)) { window.__drive.failWrite = F().failWrite.filter(n => n !== fh.name); throw new DOMException('The device went to sleep.', 'AbortError'); }
        (window.__writes || (window.__writes = [])).push(fh.name);
        const w = await fh.createWritable(), e = { name: fh.name, bytes: 0 }, write = w.write.bind(w);
        (window.__wrote || (window.__wrote = [])).push(e);
        w.write = d => { e.bytes += typeof d === 'string' ? new TextEncoder().encode(d).length : d instanceof Blob ? d.size : (d && d.byteLength) || 0; return write(d); };
        return w;
      } });
    const bad = n => { if ((F().badDirs || []).includes(n)) throw new DOMException('The folder couldn’t be read just now.', 'NotReadableError'); };
    const dir = d => ({
      kind: 'directory', name: d.name, __d: d,
      isSameEntry: async o => !!(o && o.__d) && d.isSameEntry(o.__d),
      queryPermission: async () => F().perm || 'granted',
      requestPermission: async () => { if (F().perm && F().grant) window.__drive.perm = F().grant; return F().perm || 'granted'; },
      getFileHandle: async (n, o) => { gone(); return file(await d.getFileHandle(n, o)); },
      getDirectoryHandle: async (n, o) => {
        gone(); bad(n);
        if (o && o.create && F().readOnly) { try { return dir(await d.getDirectoryHandle(n)); } catch (e) { throw new DOMException('An attempt was made to modify an object where modifications are not allowed.', 'NoModificationAllowedError'); } }
        return dir(await d.getDirectoryHandle(n, o));
      },
      removeEntry: (n, o) => d.removeEntry(n, o),
      entries: async function* () { gone(); bad(d.name); if (F().slow) await new Promise(r => setTimeout(r, F().slow)); for await (const [n, h] of d.entries()) yield [n, h.kind === 'file' ? file(h) : dir(h)]; }
    });
    return dir(real);
  };
};
// Each device's own clock: Date.now() and new Date() shifted by localStorage 'test-clock' (ms), which a test changes
// with setClock, also during a test (a clock changed mid-session, or days passing for a device away).
const CLOCK = () => {
  const real = Date.now.bind(Date), D = Date;
  const off = () => { try { return +localStorage.getItem('test-clock') || 0; } catch (e) { return 0; } };
  window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(real() + off()); } static now() { return real() + off(); } };
};
const setClock = (p, ms) => p.evaluate(ms => localStorage.setItem('test-clock', String(ms)), ms);
async function driveDevice(browser) { const c = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await c.addInitScript(DRIVE_PICK); await c.addInitScript(CLOCK); const p = await c.newPage(); return { c, p }; }
// (A file the page is writing just then can't be read for a moment: read again. One removed meanwhile is left out.)
const readFolder = p => p.evaluate(async () => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true }), out = {};
  for await (const [n, h] of d.entries()) {
    if (h.kind !== 'file') continue;
    for (let i = 0; ; i++) {
      try { out[n] = await (await h.getFile()).text(); break; } catch (e) { if (e.name === 'NotFoundError') break; if (i > 8) throw e; await new Promise(r => setTimeout(r, 100)); }
    }
  }
  return out;
});
// One file's text in a device's folder (null: not there), and a file written there (an older revision arriving, say).
const fileText = async (p, name) => (await readFolder(p))[name] ?? null;
const putText = (p, name, text) => p.evaluate(async ([name, text]) => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true });
  if (text === null) { try { await d.removeEntry(name); } catch (e) { /* not there */ } return; }
  const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
}, [name, text]);
// The "Photos" subfolder of the shared folder (or "Photos (1)"…): {name: its bytes, in base64} (null: there is none).
const readPhotos = (p, sub = 'Photos') => p.evaluate(async sub => {
  let d;
  try { d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board')).getDirectoryHandle(sub); } catch (e) { return null; }
  const out = {};
  for await (const [n, h] of d.entries()) {
    if (h.kind !== 'file') continue;
    const b = new Uint8Array(await (await h.getFile()).arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    out[n] = btoa(s);
  }
  return out;
}, sub);
// Photos added to the other device's Photos (files it has stay; files that differ are written).
const addPhotos = (p, files, sub = 'Photos') => p.evaluate(async ([files, sub]) => {
  const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true })).getDirectoryHandle(sub, { create: true });
  for (const [n, b64] of Object.entries(files)) { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); await w.close(); }
}, [files || {}, sub]);
// The name of a device's own file in the folder (link:sync.file), and its device key.
const ownFile = p => p.evaluate(() => (window.__board21.link.sync || {}).file || null);
// Google Drive bringing files from one device's folder to another's: by default from's own device file (and its photos),
// anything else in to's folder left alone. Order is up to the test (out-of-order delivery is just another order).
// files: these names instead. as: under another name (a conflict copy, "… (1).21board"). cut: only that share of the
// bytes (half-delivered). mix: the first half of the new file with the second half of the one there. photos: false: not
// yet. removed: names removed in from's folder, removed in to's too. sameStamp: new content, with the size and date the
// file there had.
const deliver = async (from, to, opts = {}) => {
  const src = await readFolder(from), names = opts.files || [await ownFile(from)].filter(Boolean);
  for (const name of names) {
    let text = src[name];
    if (text === undefined) continue;
    const target = opts.as || name, old = await fileText(to, target);
    if (opts.cut) text = text.slice(0, Math.floor(text.length * opts.cut));
    if (opts.mix) { const half = Math.floor(text.length / 2); text = text.slice(0, half) + (old || '').slice(half); }
    const seen = opts.sameStamp && old !== null ? await to.evaluate(async n => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board')).getFileHandle(n)).getFile(); return { size: f.size, lastModified: f.lastModified }; }, target) : null;
    await putText(to, target, text);
    if (seen) await to.evaluate(([n, st]) => { window.__drive = Object.assign({}, window.__drive, { stamp: Object.assign({}, (window.__drive || {}).stamp, { [n]: st }) }); }, [target, seen]);
  }
  for (const n of opts.removed || []) await putText(to, n, null);
  if (opts.photos !== false) { const ph = await readPhotos(from); if (ph) await addPhotos(to, ph); }
};
// A second "Photos (1)" folder beside "Photos", with the photos moved into it (Google Drive made it on a device that
// made "Photos" before the other device's arrived). to: another folder to move them to.
const dupFolder = (p, name = 'Photos', to = name + ' (1)') => p.evaluate(async ([name, to]) => {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true });
  const a = await root.getDirectoryHandle(name, { create: true }), b = await root.getDirectoryHandle(to, { create: true });
  for await (const [n, h] of a.entries()) { if (h.kind !== 'file') continue; const w = await (await b.getFileHandle(n, { create: true })).createWritable(); await w.write(await (await h.getFile()).arrayBuffer()); await w.close(); await a.removeEntry(n); }
}, [name, to]);
// Puts files and folders in a folder of the private file system (a path, as __drive.pick has it): {name: text},
// or {name: {}} for a folder (its own {name: …} inside it). Returns every name in the folder afterwards.
const seedFolder = (p, at, items = {}) => p.evaluate(async ([at, items]) => {
  let d = await navigator.storage.getDirectory();
  for (const n of at.split('/')) d = await d.getDirectoryHandle(n, { create: true });
  const put = async (d, items) => {
    for (const [n, v] of Object.entries(items)) {
      if (typeof v === 'string') { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(v); await w.close(); }
      else await put(await d.getDirectoryHandle(n, { create: true }), v);
    }
  };
  await put(d, items);
  const names = [];
  for await (const [n] of d.entries()) names.push(n);
  return names.sort();
}, [at, items]);
// Board Sync, from Settings (open): Set up…, then Choose folder… (the folder __drive.pick names), then Done.
const setUpSync = async p => {
  await p.click('#settings [data-act="link-setup"]');
  await p.locator('#modal.open .btn', { hasText: 'Choose folder…' }).click();
  await p.locator('#modal.open', { hasText: 'Board Sync is set up' }).waitFor({ timeout: 20000 });
  await p.locator('#modal.open .btn', { hasText: 'Done' }).click();
  await p.waitForTimeout(300);
};
// Short waits for Board Sync (Link.waits), and a device named label, linked to its folder without the dialogs (as
// Settings › Board Sync › Set up… does once the folder is picked). Resolves once the first round is done.
const SHORT = { quiet: 300, max: 1500, gap: 600, retry: 1500, idle: 2500, arrive: 2500, hold: 2500, reread: 600, read: 3000, round: 8000, toast: 1000, busy: 800, focus: 2000 };
const syncWaits = (p, w = {}) => p.evaluate(w => Object.assign(window.__board21.link.waits, w), Object.assign({}, SHORT, w));
const nameDevice = (p, label) => p.evaluate(label => { const l = window.__board21.link; l.saveState({ device: Object.assign({}, l.device(), { label }) }); }, label);
const linkFolder = async (p, label, w) => {
  if (label) await nameDevice(p, label);
  await syncWaits(p, w);
  return p.evaluate(async () => {
    const l = window.__board21.link, got = await l.choose();
    // (Until the first round is done: a take shows the folder's board first, then the next round removes this device's first page.)
    for (let i = 0; i < 300 && (l.running || l.timers.full || window.__board21.pages.busy || (l.sync && l.sync.mode && l.sync.mode !== 'wait')); i++) await new Promise(r => setTimeout(r, 50));
    return got;
  });
};
// Runs a full round now (a look at the folder that found something), and waits for it.
const syncNow = p => p.evaluate(async () => { const l = window.__board21.link; await l.round('full'); for (let i = 0; i < 300 && (l.running || l.timers.full || l.timers.send); i++) await new Promise(r => setTimeout(r, 50)); });
// The board a device shows, to compare devices: pages by uid (not deleted), each with its name, look, size and photo, and
// its windows by wid (stored, or widgetId@createdAt) with their place (at scale 1, rounded), open, content and settings.
// Never the device's own page ids, window numbers or stacking.
const shownBoard = p => p.evaluate(async () => {
  const recs = await window.__board21.store.getAll(), by = new Map(recs.map(r => [r.key, r])), st = (by.get('settings') || {}).value || {};
  const gone = new Set((st.deletedBoards || []).map(Number)), out = {};
  for (const r of recs) {
    const m = /^board:(\d+)$/.exec(r.key);
    if (!m || gone.has(+m[1]) || !r.value) continue;
    const b = +m[1], v = r.value, sc = v.scale || 0.8, bg = (by.get(`media:${b}:background`) || {}).value;
    const page = out[v.uid] = { name: v.name, color: (v.background || {}).color || null, scale: sc, shape: v.shape || '16:9', photo: bg ? `${bg.addedAt}-${bg.bytes}` : null, wins: {} };
    for (const x of recs) {
      const k = /^inst:(\d+):([^:]+):(\d+)$/.exec(x.key);
      if (!k || +k[1] !== b || !x.value) continue;
      const i = x.value, wid = i.wid || `${k[2]}@${i.createdAt}`, R = i.rect || {}, d = (by.get(`data:${b}:${k[2]}:${k[3]}`) || {}).value, c = (by.get(`conf:${b}:${k[2]}:${k[3]}`) || {}).value;
      page.wins[wid] = { widgetId: k[2], open: !!i.open, rect: [R.x * sc, R.y * sc, R.w * sc].map(Math.round).join(','), data: d === undefined ? null : d, conf: c === undefined ? null : c };
    }
  }
  return out;
});
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
const sameBoards = async (...ps) => { const all = (await Promise.all(ps.map(shownBoard))).map(b => JSON.stringify(sorted(b))); return all.every(b => b === all[0]); };
// Every text typed (in Notes) is in some window of the board.
const notesText = async p => Object.values(await shownBoard(p)).flatMap(pg => Object.values(pg.wins).map(w => (w.data && w.data.text) || '')).join('\n');
// The ledger lost (the database thrown away under an open board; Erase does it on purpose).
const loseLedger = p => p.evaluate(() => window.__board21.store.tx('readwrite', s => { s.delete(IDBKeyRange.bound('link:mine-', 'link:mine-￿')); s.delete('link:sync'); }));
// Types in a Notes window (by its ikey), as a teacher does, then leaves it and waits until it is no longer busy (Link.waits.busy). (A
// round landing between the tap and the typing can show the note's text again: tried again then.)
const typeNote = async (p, ik, text) => {
  const f = p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
  // (a teacher starts typing a moment after a merge changed the note, not within Link.waits.race: a save that soon
  // counts as one made without the merge, see scenario 48)
  await p.evaluate(async ik => { const W = window.__board21, r = W.raced.recent.get(`data:${W.state.boardId}:${ik}`); if (r && r.until > performance.now()) await new Promise(res => setTimeout(res, r.until - performance.now() + 50)); }, ik);
  for (let i = 0; ; i++) {
    try { if (await f.locator('#view').isVisible()) await f.locator('#view').click({ timeout: 3000 }); await f.locator('#t').fill(text, { timeout: 3000 }); break; }
    catch (e) { if (i > 3) throw e; await p.waitForTimeout(400); }
  }
  await p.evaluate(() => { const a = document.activeElement; if (a && a.tagName === 'IFRAME') a.blur(); });   // (a window with the keyboard stays busy longer: Link.waits.focus)
  await p.waitForTimeout(1000);
};
// A Notes window with this text on the page shown (returns its ikey).
const addNote = async (p, text) => {
  const ik = await p.evaluate(async () => { const before = new Set(window.__board21.state.insts.keys()); window.__board21.openWidget('notes'); await new Promise(r => setTimeout(r, 900)); return Array.from(window.__board21.state.insts.keys()).find(k => !before.has(k)); });
  if (text !== undefined) await fillNote(p.frameLocator(`.win[data-ikey="${ik}"] iframe`), text);
  await p.waitForTimeout(300);
  return ik;
};
const noteOf = (p, ik) => p.frameLocator(`.win[data-ikey="${ik}"] iframe`).locator('#t').inputValue();
// A window of this widget on the page shown (returns its ikey).
const addWin = (p, id) => p.evaluate(async id => { const before = new Set(window.__board21.state.insts.keys()); window.__board21.openWidget(id); await new Promise(r => setTimeout(r, 900)); return Array.from(window.__board21.state.insts.keys()).find(k => !before.has(k)); }, id);
// The windows a device has (on pages not deleted), from its records: {uid, b, wid, ikey, widgetId, open, z, copyOf, data, rect}.
const winList = p => p.evaluate(async () => {
  const recs = await window.__board21.store.getAll(), by = new Map(recs.map(r => [r.key, r])), st = (by.get('settings') || {}).value || {};
  const gone = new Set((st.deletedBoards || []).map(Number)), out = [];
  for (const r of recs) {
    const k = /^inst:(\d+):([^:]+):(\d+)$/.exec(r.key), bd = k && by.get('board:' + k[1]);
    if (!k || gone.has(+k[1]) || !r.value || !bd) continue;
    const d = by.get(`data:${k[1]}:${k[2]}:${k[3]}`);
    out.push({ uid: bd.value.uid, b: +k[1], wid: r.value.wid, ikey: `${k[2]}:${k[3]}`, widgetId: k[2], open: !!r.value.open, z: r.value.z, copyOf: r.value.copyOf || null, data: d ? d.value : null, rect: r.value.rect });
  }
  return out;
});
const copiesOf = async p => (await winList(p)).filter(x => x.copyOf);
// The window with this wid on the page shown: its ikey there (window numbers differ between devices).
const ikOf = (p, wid) => p.evaluate(wid => { for (const [k, i] of window.__board21.state.insts) if (i.wid === wid) return k; return null; }, wid);
// Content saved for a window on the page shown, as its widget saves it (Writer); then it is no longer busy.
const saveData = async (p, ik, value) => { await p.evaluate(([ik, v]) => { const B = window.__board21; return B.writer.put(`data:${B.state.boardId}:${ik}`, 'data', v); }, [ik, value]); await p.waitForTimeout(1000); };
// A device for the Board Sync suites: its own browser profile, named label, with short waits; page errors go to errors.
const syncDev = async (browser, label, errors, w) => { const d = await driveDevice(browser); d.p.on('pageerror', e => errors.push(label + ': ' + e.message)); await d.p.goto(BASE); await boardUp(d.p); await nameDevice(d.p, label); await syncWaits(d.p, w); return d; };
// Every device's file to every other device, with a round on each, twice (so everything has gone both ways).
const exchange = async (...ds) => { for (let k = 0; k < 2; k++) for (const a of ds) { for (const b of ds) if (a !== b) await deliver(b.p, a.p); await syncNow(a.p); } };
// The device file of a device (its sync block, parsed), as it is in its own folder.
const ownJSON = async p => { const n = await ownFile(p); const t = n && await fileText(p, n); return t ? JSON.parse(t) : null; };
// Every toast text a device shows from now on, also those updated in place or gone again (heard() reads them).
const hear = p => p.evaluate(() => { window.__heard = []; const t = document.getElementById('toasts'); new MutationObserver(() => { for (const s of t.querySelectorAll('.toast span')) if (window.__heard[window.__heard.length - 1] !== s.textContent && !window.__heard.includes(s.textContent)) window.__heard.push(s.textContent); }).observe(t, { childList: true, subtree: true, characterData: true }); });
const heard = p => p.evaluate(() => window.__heard || []);
// Waits (up to ms) until fn, run here, answers true; false if it never does.
const eventually = async (fn, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 150))) if (await fn().catch(() => false)) return true; return false; };
// The "Board history" subfolder of the shared folder.
const readHistory = p => p.evaluate(async () => { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true })).getDirectoryHandle('Board history', { create: true }); const out = {}; for await (const [n, h] of d.entries()) if (h.kind === 'file') out[n] = await (await h.getFile()).text(); return out; });
const writeHistory = (p, files) => p.evaluate(async files => {
  const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('21Board', { create: true })).getDirectoryHandle('Board history', { create: true });
  for (const [n, t] of Object.entries(files)) { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(t); await w.close(); }
}, files);
// The notes about the files as 2026.11.18-12 wrote them: "About this folder.txt", and "About these files.txt" in "Board history".
const OLD_NOTE = ['21Board keeps your board here for Board Sync. Your devices share it through Google Drive.', '',
  'Each device keeps its own copy of the whole board here, named after the device, such as', '"21Board (laptop) [k3j9].21board". 21Board combines them, so every device shows the same',
  'board. Each file is a full backup. Open one with Import in 21Board.', '',
  '- To add a device, open 21Board on it, go to Settings > Board Sync > Set up and pick this', '  folder. Everyone who uses this folder shares one board.',
  '- To work on a board with a co-teacher, share this folder with them as an Editor. They add a', '  shortcut to it in their My Drive, then pick it when they set up Board Sync.',
  '- Don’t edit, rename or move these files. 21Board deletes an unlinked device’s file two', '  months later.',
  '- The "Photos" folder holds the background photos, one copy of each. The board files only', '  name them. To give someone a board, use Export in 21Board.',
  '- The "Board history" folder holds earlier versions of your pages, about one an hour. Open one', '  from 21Board > Settings > Board history, or with Import.',
  '- These files can include student names and class photos. Share this folder only with people', '  who should see them.', ''].join('\r\n');
const OLD_HIST_NOTE = ['Earlier versions of your 21Board boards, to go back to after a big change or a device reset.', '',
  '- To go back, open 21Board > Settings > Board history and look under "In your Google Drive', '  folder" at the bottom. Or open a file with Import.',
  '- 21Board keeps about one copy an hour, then one a day, then one a week, and removes the rest.', '  Files whose names end in "saved" are ones you saved. 21Board never removes them.',
  '- These copies leave out the background photo.', '- They can include student names. Share this folder only with people who should see them.', ''].join('\r\n');

// Storage failures, for the "When storage fails" suite. The ones that must be in place before board.js starts
// are switched on through localStorage: {open: n (the first n tries fail) | 'blocked' | 'hang', read: n | 'all',
// readKey: a record that can't be read, or a list of them}. Saves fail while window.__failPut is 'quota', 'disk' or 'unnamed', or
// for one record only ('key:<record key>'); reads fail in one tab only while its window.__failRead is set.
const STORAGE_FAULTS = () => {
  const cfg = () => { try { return JSON.parse(localStorage.getItem('test-faults') || '{}'); } catch (e) { return {}; } };
  const F = IDBFactory.prototype, O = IDBObjectStore.prototype;
  const raw = window.__idbRaw = { open: F.open, getAll: O.getAll, getAllKeys: O.getAllKeys, get: O.get, put: O.put };
  let opens = 0, reads = 0;
  F.open = function (name) {
    const c = cfg();
    if (name === '21Board' && c.open) {
      if (c.open === 'blocked') throw new DOMException('The user denied permission to access the database.', 'UnknownError');
      if (c.open === 'hang') return {};   // a request that never answers
      if (++opens <= c.open) throw new DOMException('Internal error opening backing store for indexedDB.open.', 'UnknownError');
    }
    return raw.open.apply(this, arguments);
  };
  const reading = s => s.name === 'records' && s.transaction.mode === 'readonly';   // (the page reading its board)
  O.getAll = function () { const r = raw.getAll.apply(this, arguments), c = cfg(); if (reading(this) && (c.read === 'all' || window.__failRead || c.readKey || reads++ < c.read)) this.transaction.abort(); return r; };
  O.getAllKeys = function () { const r = raw.getAllKeys.apply(this, arguments); if (reading(this) && (cfg().read === 'all' || window.__failRead)) this.transaction.abort(); return r; };
  O.get = function (key) { const r = raw.get.apply(this, arguments), c = cfg(); if (reading(this) && (c.read === 'all' || window.__failRead || [].concat(c.readKey).includes(key))) this.transaction.abort(); return r; };
  O.put = function (rec) {
    const f = this.name === 'records' && window.__failPut;
    if (f && f.startsWith('key:') && rec.key !== f.slice(4)) return raw.put.apply(this, arguments);
    if (f === 'quota') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    if (f === 'disk') throw new DOMException('Failed to write blobs (IOError)', 'DataError');
    if (f) throw new Error('');
    return raw.put.apply(this, arguments);
  };
};
// Every stored record of the board, read straight from IndexedDB (past the faults and the page's own code).
const storedRecords = page => page.evaluate(() => new Promise((res, rej) => {
  const o = window.__idbRaw.open.call(indexedDB, '21Board');
  o.onerror = () => rej(o.error);
  o.onsuccess = () => { const q = window.__idbRaw.getAll.call(o.result.transaction('records').objectStore('records')); q.onsuccess = () => { o.result.close(); res(Object.fromEntries(q.result.map(r => [r.key, r.value]))); }; q.onerror = () => rej(q.error); };
}));

// Releases of 21Board at their own addresses (BASE + '__site/<name>/'), for the update tests: the repo's files
// with some of them changed, stamped by tools/release.js as a real release is. deploy() under the same name
// again is the next release on that server. Options: version (VERSION in sw.js); change {file: text => text};
// stamp: false (the changed files go up over the release that is there, with no new stamp: the mistake the
// stamp is there to catch); sw (another sw.js altogether: the one from before builds). Each site also has
// asked (every file requested) and fault {file: res => ...}: answer it and return true, or wait and return
// nothing (the file is then served as usual).
const release = require(path.join(ROOT, 'tools', 'release.js'));
// The words a built-in widget shows in a window's language, from its words.js through the SDK's own engine:
// wordsOf('timer', 'ru').t('minus'), and .table, the file's table. A check compares a page with these, so it holds no
// words of its own and a reviewer's edit to a words file never breaks it.
const wordsTool = require(path.join(ROOT, 'tools', 'words.js'));
const wordsOf = (id, lang) => {
  const file = `widgets/${id}/words.js`, read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const w = wordsTool.loadRegion(read('sdk/board21.js')).create({ lang: () => lang }), table = wordsTool.parse(file, read(file));
  w.add(table);
  return Object.assign(w, { table });
};
// Does the release stamp in sw.js, board.js and index.html match the files? (A device saves its offline copy only if it does.)
const stamped = () => { try { require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'tools', 'release.js'), '--check'], { stdio: 'pipe' }); return true; } catch (e) { return false; } };
const STAMPED = 'the release stamp matches the files (after changing a file the app ships: node tools/release.js)';
const SITES = {};
function deploy(name, { version, change = {}, stamp = true, sw } = {}) {
  const was = SITES[name] || { files: {}, asked: [], fault: {} };
  const read = f => {
    let t = (!stamp && was.files[f]) || fs.readFileSync(path.join(ROOT, f));
    if (f === 'sw.js' && version) t = Buffer.from(String(t).replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`));
    return change[f] ? Buffer.from(change[f](String(t))) : t;
  };
  const files = stamp ? {} : Object.assign({}, was.files);
  for (const f of Object.keys(change)) files[f] = read(f);
  let build = was.build;
  if (stamp) { const r = release.stamp(read); for (const f in r.out) files[f] = Buffer.from(r.out[f]); build = r.build; }
  if (sw) files['sw.js'] = Buffer.from(sw);
  return (SITES[name] = { files, build, asked: was.asked, fault: was.fault });
}
// A release that can be told apart: its board.js, page, Dice widget and SDK each carry its name.
const marked = v => ({
  'board.js': t => `window.__rel = '${v}';\n` + t.replace(/^window\.__rel = '[^']*';\n/, ''),
  'index.html': t => t.replace(/<body[^>]*>/, `<body data-rel="${v}">`),
  'widgets/dice/index.html': t => t.replace(/<head>(<meta name="rel"[^>]*>)?/, `<head><meta name="rel" content="${v}">`),
  'sdk/board21.js': t => t.replace(/\nwindow\.__sdkRel = '[^']*';\n$/, '') + `\nwindow.__sdkRel = '${v}';\n`
});
// Which release each part of a tab is from: "script page widget sdk" (the last two from its open Dice window).
const parts = async page => {
  const top = await page.evaluate(() => [window.__rel, document.body.dataset.rel]);
  const dice = page.frameLocator('.win[data-ikey="dice:1"] iframe').locator('html');
  const inside = await page.locator('.win[data-ikey="dice:1"]').count() ? await dice.evaluate(() => [(document.querySelector('meta[name="rel"]') || {}).content, window.__sdkRel]) : [];
  return top.concat(inside).join(' ');
};
const updateCheck = page => page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()).then(() => true, () => false));
const boardUp = page => page.waitForFunction(() => window.__board21 && window.__board21.store.loaded && !document.getElementById('startup'), null, { timeout: 20000 });

// The Video Player suites never reach YouTube, Google Drive or Vimeo: their sites answer with a stand-in page
// (stubVideos) that notes each address asked for (yt.hits) and keeps the Referer the site would see (window.__ref in its
// frame). YouTube's oEmbed and Vimeo's, where the widget asks for a video's title, answer as theirs do (JSON, the asking
// site allowed), from yt.titles (YouTube's, by id) and yt.vimeo (Vimeo's, by its number, or "number/hash" for an
// unlisted video): a video's title, or { status } (404: a private or removed video), { abort: true } (no connection to
// it, as when a school's filter blocks it), { hang: true } (no answer), { json } or { body } (an answer of another
// shape); any video not in it gets 404. Each request is noted in yt.asked: { source, id, url, cookie, origin, referer }.
const VID = 'dQw4w9WgXcQ', VID2 = 'aqz-KE-bpKQ';
const YT_TITLES = { [VID]: 'Rick Astley - Never Gonna Give You Up (Official Music Video)', [VID2]: 'Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film',
  'M7lc1UVf-VE': 'YouTube Developers Live: Embedded Web Player Customization',
  // (a teacher's week of videos, for the History of five)
  'w4tErCyc1e0': 'The Water Cycle for Kids: Evaporation, Condensation and Precipitation', 'mU1t1pl1c8n': 'Multiplication Song: The 3 Times Table',
  'pLaNtsGr0w5': 'How Do Plants Grow? | Science for Kids', 'S0larSyst3m': 'The Solar System Song | Planets for Kids', 'r3adAl0udPd': 'Read Aloud: A Rainy Day at the Pond',
  'fR4ct10nsK1': 'Fractions for Kids | Halves, Thirds and Quarters' };
// Their labels in the History (a long title shortened at a word, with …; a start time after it).
const YT_LABEL = { [VID]: 'Rick Astley - Never Gonna Give You Up…', [VID2]: 'Big Buck Bunny 60fps 4K - Official Blender…', 'M7lc1UVf-VE': 'YouTube Developers Live: Embedded Web Player…',
  'w4tErCyc1e0': 'The Water Cycle for Kids: Evaporation…', 'mU1t1pl1c8n': 'Multiplication Song: The 3 Times Table', 'pLaNtsGr0w5': 'How Do Plants Grow? | Science for Kids',
  'S0larSyst3m': 'The Solar System Song | Planets for Kids', 'r3adAl0udPd': 'Read Aloud: A Rainy Day at the Pond', 'fR4ct10nsK1': 'Fractions for Kids | Halves, Thirds and Quarters' };
const OEMBED = id => `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`;
const EMBED = (id, more = '') => `https://www.youtube.com/embed/${id}?rel=0&iv_load_policy=3&playsinline=1${more}`;
// What YouTube's Share › Embed gives for a video, and for a playlist ("videoseries" is no video's id).
const EMBED_CODE = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${VID}?si=AbCdEf123" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
const PLAYLIST_EMBED = 'https://www.youtube.com/embed/videoseries?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
// Google Drive and Vimeo: files and videos for the Video Player suites (made-up ids of the right shapes: a Drive file's
// 33 characters today and 28 for an older one, with a resource key; Vimeo's numbers, and an unlisted video's hash).
const D1 = '1Fq7nZ0yXc9vB8mN2lK3jH4gF5dS6aP7o', D2 = '0B9xY8wV7uT6sR5qP4oN3mL2kJ1i', RK = '0-AbCdEfGhIjKlMnOpQrStUv';
const V1 = '76979871', V2 = '1084537', VH = '8272103f6e';
const VIMEO_TITLES = { [V1]: 'The New Vimeo Player (You Know, For Videos)', [`${V2}/${VH}`]: 'Big Buck Bunny, Our Class Copy',
  '148751763': 'Volcanoes 101 | National Geographic Education', '22439234': 'The Mountain' };
const DRIVE_EMBED = (id, key) => `https://drive.google.com/file/d/${id}/preview${key ? '?resourcekey=' + key : ''}`;
const VIMEO_EMBED = (id, hash, start) => `https://player.vimeo.com/video/${id}?${hash ? 'h=' + hash + '&' : ''}dnt=1&title=0&byline=0&portrait=0${start ? '#t=' + start + 's' : ''}`;
const VIMEO_OEMBED = (id, hash) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent('https://vimeo.com/' + id + (hash ? '/' + hash : ''))}`;
// Where Open in Google Drive and Open in Vimeo go.
const DRIVE_OPEN = (id, key) => `https://drive.google.com/file/d/${id}/view${key ? '?resourcekey=' + key : ''}`;
const VIMEO_OPEN = (id, hash, start) => `https://vimeo.com/${id}${hash ? '/' + hash : ''}${start ? '#t=' + start + 's' : ''}`;
// A Drive file's label in the History (Drive gives no title without signing in): "Google Drive video" and its id's end.
const DRIVE_LABEL = id => `Google Drive video ${id.slice(-6)}`;
// What the link box says to text that isn't a video's link.
const VMSG = { empty: 'Paste a link first.', none: 'Paste a YouTube, Google Drive, or Vimeo link.', folder: 'That’s a folder. Paste a link to one video.', list: 'That’s a list of videos. Paste a link to one.',
  doc: 'That’s a document. Paste a link to a video.', sheet: 'That’s a spreadsheet. Paste a link to a video.', slides: 'That’s a presentation. Paste a link to a video.' };
// The tab's live player frames from any of the three sites.
const vidFrames = p => p.frames().filter(f => /^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|drive\.google\.com\/file\/d\/|player\.vimeo\.com\/video\/)/.test(f.url()));
// What Drive's "Embed item…" and Vimeo's Share › Embed give.
const DRIVE_CODE = `<iframe src="https://drive.google.com/file/d/${D1}/preview" width="640" height="480" allow="autoplay"></iframe>`;
const VIMEO_CODE = `<div style="padding:56.25% 0 0 0;position:relative;"><iframe src="https://player.vimeo.com/video/${V2}?h=${VH}&amp;badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share" referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="Big Buck Bunny"></iframe></div><script src="https://player.vimeo.com/api/player.js"></script>`;
async function stubVideos(ctx) {
  const yt = { hits: [], asked: [], titles: Object.assign({}, YT_TITLES), vimeo: Object.assign({}, VIMEO_TITLES), embeds: () => yt.hits.filter(u => /\/embed\//.test(u)).length,
    oembeds: id => yt.asked.filter(a => !id || a.id === id).length, loads: re => yt.hits.filter(u => re.test(u)).length };
  const standIn = name => `<!doctype html><title>${name} stand-in</title><body style="margin:0;background:#000;color:#fff;font:16px system-ui">${name} stand-in<script>window.__ref = document.referrer;</script></body>`;
  // A title from yt.titles or yt.vimeo, answered as oEmbed does.
  const answer = async (r, source, id, t) => {
    const h = await r.request().allHeaders(), url = r.request().url();
    yt.asked.push({ source, id, url, cookie: h.cookie || '', origin: h.origin || '', referer: h.referer || '' });
    const cors = { 'access-control-allow-origin': h.origin || '*', vary: 'Origin' };
    if (t && t.hang) return;   // (no answer: the widget stops waiting by itself)
    if (t && t.abort) return r.abort('connectionrefused').catch(() => {});
    if (t && t.delay) await new Promise(res => setTimeout(res, t.delay));
    const json = typeof t === 'string' ? (source === 'vimeo' ? { type: 'video', version: '1.0', provider_name: 'Vimeo', provider_url: 'https://vimeo.com/', title: t, author_name: 'A teacher', video_id: +id.split('/')[0], width: 640, height: 360 }
      : { title: t, author_name: 'A channel', type: 'video', version: '1.0', provider_name: 'YouTube', provider_url: 'https://www.youtube.com/', height: 113, width: 200 }) : t && 'json' in t ? t.json : undefined;
    if (json !== undefined) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(json) }).catch(() => {});
    return r.fulfill({ status: t && t.status || (t && t.body ? 200 : 404), headers: cors, contentType: 'text/html', body: t && t.body || 'Not Found' }).catch(() => {});
  };
  await ctx.route(/^https?:\/\/([^/?#]*\.)?(youtube(-nocookie)?\.com|youtu\.be|ytimg\.com|googlevideo\.com)(:\d+)?([/?#]|$)/i, async r => {
    const url = r.request().url();
    yt.hits.push(url);
    const o = /^https:\/\/www\.youtube\.com\/oembed\?(.*)$/.exec(url);
    if (o) { const w = /[?&]v=([^&#]*)/.exec(new URLSearchParams(o[1]).get('url') || ''), id = w ? w[1] : ''; return answer(r, 'youtube', id, yt.titles[id]); }
    return r.fulfill({ status: 200, contentType: 'text/html', body: standIn('YouTube') });
  });
  await ctx.route(/^https?:\/\/([^/?#]*\.)?(drive|docs)\.google\.com(:\d+)?([/?#]|$)/i, async r => {
    yt.hits.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'text/html', body: standIn('Google Drive') });
  });
  await ctx.route(/^https?:\/\/([^/?#]*\.)?(vimeo\.com|vimeocdn\.com)(:\d+)?([/?#]|$)/i, async r => {
    const url = r.request().url();
    yt.hits.push(url);
    const o = /^https:\/\/vimeo\.com\/api\/oembed\.json\?(.*)$/.exec(url);
    if (o) { const w = /^https:\/\/vimeo\.com\/(\d+)(?:\/([0-9a-f]+))?$/.exec(new URLSearchParams(o[1]).get('url') || ''), id = w ? w[1] + (w[2] ? '/' + w[2] : '') : ''; return answer(r, 'vimeo', id, yt.vimeo[id]); }
    return r.fulfill({ status: 200, contentType: 'text/html', body: standIn('Vimeo') });
  });
  return yt;
}
const ytWin = (p, ik = 'youtube-player:1') => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
// What a Video Player window shows: the link box, the player (its frame's src), the offline message, the link typed,
// the error under it, Cancel.
const ytLook = (p, ik = 'youtube-player:1') => ytWin(p, ik).locator('html').evaluate(() => {
  const $ = id => document.getElementById(id), f = document.querySelector('iframe');
  return { ask: !$('ask').hidden, player: !$('player').hidden, offline: !$('offline').hidden, src: f ? f.src : null, frames: document.querySelectorAll('iframe').length,
    link: $('link').value, err: $('err').hidden ? '' : $('err').textContent, cancel: !$('cancel').hidden, text: $('offline').hidden ? '' : $('offline').innerText.replace(/\s+/g, ' ').trim() };
});
// The tab's live YouTube frames (one removed from its page is gone from this list).
const ytFrames = p => p.frames().filter(f => /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(f.url()));
const ytMenu = (p, ik = 'youtube-player:1') => p.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return w ? w.menuItems.map(i => i.separator ? '—' : i.label).join(' | ') : null; }, ik);
const ytData = (p, ik = 'youtube-player:1') => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
// A widget item in the window menu, chosen as a teacher does; a link typed in the link box and shown.
const ytChoose = async (p, label, ik = 'youtube-player:1') => { await p.click(`.win[data-ikey="${ik}"] .win-label`); await p.locator('#menu [data-act="widget"]', { hasText: label }).click(); await p.waitForTimeout(400); };
const ytShow = async (p, text, ik) => { const f = ytWin(p, ik); await f.locator('#link').fill(text); await f.locator('#go').click(); await p.waitForTimeout(500); };
// The window menu's History: its labels, newest first, the checked one marked "✓ " (null: no History in the menu).
const ytHistory = (p, ik = 'youtube-player:1') => p.evaluate(ik => {
  const w = window.__board21.state.wins.get(ik), i = w ? w.menuItems.findIndex(x => x.heading && x.label === 'History') : -1;
  return i < 0 ? null : w.menuItems.slice(i + 1).map(x => (x.checked ? '✓ ' : '') + x.label);
}, ik);
// A History item tapped as a teacher does, by its label (false, and the menu closed again, if there is none).
const ytPick = async (p, label, ik = 'youtube-player:1') => {
  await p.click(`.win[data-ikey="${ik}"] .win-label`);
  const b = p.locator('#menu').getByRole('menuitemcheckbox', { name: label, exact: true });
  if (!await b.count()) { await p.click(`.win[data-ikey="${ik}"] .win-label`); return false; }
  await b.click(); await p.waitForTimeout(400); return true;
};
// The Picture widget (widgets/image, id 'image'): its window's frame, what it shows (the empty window with its title,
// Open… and Paste and a message; or the picture, where it is drawn in the window, and the colors behind and around it),
// its saved content and settings, its window menu ("✓ " before a checked item), and a file opened in it as a teacher
// does (Open…'s file input), waiting until the window has taken it or said why not.
const picWin = (p, ik = 'image:1') => p.frameLocator(`.win[data-ikey="${ik}"] iframe`);
const picLook = (p, ik = 'image:1') => picWin(p, ik).locator('html').evaluate(() => {
  const $ = id => document.getElementById(id), shown = id => !!$(id) && !$(id).hidden && getComputedStyle($(id)).display !== 'none';
  const img = $('img'), r = img ? img.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 }, h1 = document.querySelector('#ask h1');
  return { ask: shown('ask'), pic: shown('pic'), err: shown('err') ? $('err').textContent : '', paste: shown('paste'),
    title: h1 ? h1.textContent : '', open: $('open') ? $('open').textContent : '', pasteLabel: $('paste') ? $('paste').textContent : '',
    src: img ? img.getAttribute('src') || '' : '', alt: img ? img.alt : '', nw: img ? img.naturalWidth : 0, nh: img ? img.naturalHeight : 0,
    box: { x: r.x, y: r.y, w: r.width, h: r.height }, vw: innerWidth, vh: innerHeight,
    behind: img ? getComputedStyle(img).backgroundColor : '', around: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.body).fontFamily, buttonFont: $('open') ? getComputedStyle($('open')).fontFamily : '' };
}).catch(() => ({}));
const picData = (p, ik = 'image:1') => p.evaluate(ik => window.__board21.state.data.get(ik) || null, ik);
const picConf = (p, ik = 'image:1') => p.evaluate(ik => window.__board21.state.conf.get(ik) || null, ik);
const picMenu = (p, ik = 'image:1') => p.evaluate(ik => { const w = window.__board21.state.wins.get(ik); return w ? w.menuItems.map(i => i.separator ? '—' : (i.checked ? '✓ ' : '') + i.label).join(' | ') : null; }, ik);
const picOpen = async (p, file, ik = 'image:1', want) => {
  const before = JSON.stringify(await picData(p, ik));
  await picWin(p, ik).locator('#file').setInputFiles(file);
  await eventually(async () => { const l = await picLook(p, ik); return want ? l.err === want : l.err || (JSON.stringify(await picData(p, ik)) !== before && l.pic && l.nw > 0); }, 10000);
  await p.waitForTimeout(300);
};
// A file for setInputFiles (or, with dropFiles and pasteFiles, for a drop or a paste made in the page).
const picFile = (name, buffer, mimeType = '') => ({ name, mimeType, buffer });
const FIXTURE = n => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n));
// The Picture windows on the page shown: { ik, open } in order.
const picWins = p => p.evaluate(() => Array.from(window.__board21.state.insts.entries()).filter(([k]) => k.startsWith('image:')).map(([k, i]) => ({ ik: k, open: !!i.open })).sort((a, b) => +a.ik.split(':')[1] - +b.ik.split(':')[1]));
// A picture drawn in the page with a canvas: w × h, as type, returned as a Buffer. noise: random bits in each color (so
// it doesn't compress); alpha: its top-left quarter transparent; round: its corners rounded, clear outside, by this
// radius; margin: a clear border this wide; q: the encoder's quality.
const drawPic = async (p, w, h, type = 'image/png', o = {}) => Buffer.from(await p.evaluate(async ([w, h, type, o]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: !!o.noise }), grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#2563eb'); grad.addColorStop(0.5, '#fde68a'); grad.addColorStop(1, '#f97316');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = '#111827'; g.font = `${Math.max(8, Math.round(h / 5))}px sans-serif`; g.fillText('21Board', w / 10, h / 2);
  if (o.noise) {
    const d = g.getImageData(0, 0, w, h), a = d.data;
    let s = 12345;
    for (let i = 0; i < a.length; i += 4) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; a[i] ^= s & o.noise; a[i + 1] ^= (s >>> 8) & o.noise; a[i + 2] ^= (s >>> 16) & o.noise; }
    g.putImageData(d, 0, 0);
  }
  if (o.alpha) g.clearRect(0, 0, w / 2, h / 2);
  if (o.round || o.margin) {
    g.globalCompositeOperation = 'destination-in'; g.beginPath();
    if (o.round) g.roundRect(0, 0, w, h, o.round); else g.rect(o.margin, o.margin, w - 2 * o.margin, h - 2 * o.margin);
    g.fill(); g.globalCompositeOperation = 'source-over';
  }
  const blob = await new Promise(r => c.toBlob(r, type, o.q));
  const b = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}, [w, h, type, o]), 'base64');
// The Picture widget's messages, word for word.
const PMSG = {
  type: 'Can’t show that file. Choose a PNG, JPEG, GIF, WebP, AVIF, or SVG.',
  svgBroken: 'That SVG couldn’t be drawn. Save it as a PNG first.',
  svgBig: 'That SVG is over 5 MB. Save it as a PNG first.',
  heic: 'Can’t show a HEIC photo. Save it as a JPEG first.',
  big: 'That file is over 25 MB. Choose a smaller one.',
  pixels: 'That picture is too large. Choose a smaller one.',
  anim: 'That animation is over 5 MB. Choose a smaller one.',
  broken: 'Couldn’t open that picture. Try another one.',
  empty: 'No picture to paste. Copy one first.',
  blocked: 'Pasting is blocked. Allow the clipboard for 21Board.'
};
// A GIF or WebP made bigger with filler that browsers skip (a GIF comment; a WebP chunk of its own): the same pictures,
// in a file as big as wanted.
const padGif = (buf, n) => {
  const parts = [buf.subarray(0, buf.length - 1), Buffer.from([0x21, 0xfe])];
  for (let left = n; left > 0; left -= 255) { const k = Math.min(255, left); parts.push(Buffer.from([k]), Buffer.alloc(k, 0x41)); }
  parts.push(Buffer.from([0, 0x3b]));
  return Buffer.concat(parts);
};
const padWebp = (buf, n) => {
  n += n & 1;
  const h = Buffer.alloc(8); h.write('JUNK', 0, 'ascii'); h.writeUInt32LE(n, 4);
  const out = Buffer.concat([buf, h, Buffer.alloc(n)]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
};
// A PNG that says it is w × h (its header), with almost nothing in it.
const pngChunk = (type, data) => { const zlib = require('zlib'), len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, 'ascii'), data]); len.writeUInt32BE(data.length); crc.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([len, td, crc]); };
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngHeader = (w, h) => {
  const zlib = require('zlib');
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(Buffer.alloc(64))), pngChunk('IEND', Buffer.alloc(0))]);
};
// An animated PNG (APNG) of two frames, w × h, gray then noise (noise in the first too: a file that doesn't compress).
const apng = (w, h, noise) => {
  const zlib = require('zlib');
  let s = 99;
  const frame = rnd => { const rows = []; for (let y = 0; y < h; y++) { const r = Buffer.alloc(1 + w * 3, 0x80); r[0] = 0; if (rnd) for (let i = 1; i < r.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; r[i] = s >>> 24; } rows.push(r); } return zlib.deflateSync(Buffer.concat(rows), { level: 1 }); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const actl = Buffer.alloc(8); actl.writeUInt32BE(2, 0);
  const fctl = seq => { const b = Buffer.alloc(26); b.writeUInt32BE(seq, 0); b.writeUInt32BE(w, 4); b.writeUInt32BE(h, 8); b.writeUInt16BE(1, 20); b.writeUInt16BE(2, 22); return b; };
  const seq2 = Buffer.alloc(4); seq2.writeUInt32BE(2);
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('acTL', actl), pngChunk('fcTL', fctl(0)), pngChunk('IDAT', frame(noise)), pngChunk('fcTL', fctl(1)), pngChunk('fdAT', Buffer.concat([seq2, frame(true)])), pngChunk('IEND', Buffer.alloc(0))]);
};
// The alpha of one pixel (x, y) of a picture given as a data: URL, decoded in page p.
const alphaAt = (p, src, x, y) => p.evaluate(async ([src, x, y]) => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(x, y, 1, 1).data[3]; }, [src, x, y]);
// A window's frame on page p, by its name: 'b21-board:<ikey>', or 'b21-board:<ikey>;<language>' in another language.
const frameNamed = (p, ikey) => p.frames().find(f => { const n = f.name(); return n === 'b21-board:' + ikey || n.startsWith('b21-board:' + ikey + ';'); }) || null;
// A paste or a drop made in a page or a window's frame (where: a Page, or a window's ikey on page p): a DataTransfer
// holding these files (and text), sent as a ClipboardEvent to the element with focus, or as a DragEvent (dragover,
// then drop) to the element at x, y. Returns whether the page's own code took it (preventDefault).
const sendFiles = async (p, where, kind, files, o = {}) => {
  const target = typeof where === 'string' ? frameNamed(p, where) : p;
  return target.evaluate(([kind, files, o]) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.name, { type: f.type }));
    if (o.text) dt.setData('text/plain', o.text);
    if (kind === 'paste') {
      const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      (document.activeElement || document.body).dispatchEvent(e);
      return e.defaultPrevented;
    }
    const at = document.elementFromPoint(o.x || 1, o.y || 1) || document.body;
    at.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: o.x || 1, clientY: o.y || 1 }));
    const e = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: o.x || 1, clientY: o.y || 1 });
    at.dispatchEvent(e);
    return e.defaultPrevented;
  }, [kind, files.map(f => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') })), o]);
};
// A picture, or text, put on the clipboard as Chrome's Copy image (and Copy) does. (The context grants the clipboard.)
const copyPic = (p, buf) => p.evaluate(async b64 => { const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' }); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); }, buf.toString('base64'));
const copyText = (p, t) => p.evaluate(t => navigator.clipboard.writeText(t), t);
// The content area of a window, from its saved place: { w, h, max }.
const contentOf = (p, ik) => p.evaluate(ik => { const i = window.__board21.state.insts.get(ik), r = i.rect; return { w: r.w, h: r.h - 40, max: !!i.maximized }; }, ik);
// Contrast ratio of two CSS colors ('rgb(…)'), as WCAG counts it.
const contrast = (a, b) => {
  const lum = c => { const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
// Colors for the accent tests: '#rrggbb' to 'rgb(…)' and back, two mixed as board.js mixes them (t: the share of b),
// and a color's HSL hue (degrees), saturation and lightness (0 to 1).
const rgbOf = hex => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const hexOf = c => (/^#/.test(c) ? c.trim().toLowerCase() : '#' + c.match(/[\d.]+/g).slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join(''));
const mixOf = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); return '#' + [16, 8, 0].map(sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t).toString(16).padStart(2, '0')).join(''); };
const hslOf = hex => {
  const n = parseInt(hexOf(hex).slice(1), 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const h = !d ? 0 : 60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return { h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
};
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

// The Zones Check-In's windows (2026.11.20-1): the frame, what it shows, what the board saved, its menu, and an item
// chosen from it as a teacher does.
const ZC = {
  K: 'zones-check-in:1',
  zf: (p, k = ZC.K) => p.frameLocator(`.win[data-ikey="${k}"] iframe`),
  connected: (p, k = ZC.K, ms) => eventually(() => p.evaluate(k => { const w = window.__board21.state.wins.get(k); return !!(w && w.connected); }, k), ms),
  saved: (p, k = ZC.K) => p.evaluate(k => window.__board21.state.data.get(k) || null, k),
  conf: (p, k = ZC.K) => p.evaluate(k => window.__board21.state.conf.get(k) || null, k),
  look: async (p, k = ZC.K) => {
    const x = await ZC.zf(p, k).locator('html').evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const Z = ['blue', 'green', 'yellow', 'red'], card = z => document.querySelector(`.zone[data-z="${z}"]`);
      return {
        view: ['main', 'ideas', 'edit'].find(v => document.getElementById(v).classList.contains('on')) || '',
        counts: Z.map(z => +card(z).querySelector('.count').textContent),
        shown: Z.map(z => vis(card(z).querySelector('.count'))),
        minus: Z.map(z => { const m = card(z).querySelector('.minus'); return { disabled: m.disabled, shown: vis(m) }; }),
        status: document.getElementById('status').textContent,
        bar: { zones: Z.map(z => parseFloat(document.querySelector(`#bar i[data-z="${z}"]`).style.width) || 0), all: parseFloat(document.querySelector('#bar i.all').style.width) || 0 },
        undoButton: [...document.querySelectorAll('button, [role="button"]')].filter(b => /undo/i.test([b.textContent, b.getAttribute('aria-label'), b.title, b.id, b.className].join(' '))).map(b => b.outerHTML.slice(0, 80)).join(' ')
      };
    });
    x.title = await p.evaluate(k => { const w = window.__board21.state.wins.get(k); return w ? w.subtitle : null; }, k);
    return x;
  },
  menuOf: (p, k = ZC.K) => p.evaluate(k => { const w = window.__board21.state.wins.get(k); return w ? w.menuItems.map(i => i.separator ? '—' : i.heading ? `[${i.label}]` : (i.checked === true ? '✓ ' : i.checked === false ? '☐ ' : '') + i.label + (i.disabled ? ' (off)' : '')).join(' | ') : ''; }, k),
  choose: async (p, label, k = ZC.K) => {
    await p.click(`.win[data-ikey="${k}"] .win-label`);
    await p.locator('#menu [data-act="widget"]').filter({ hasText: new RegExp('^\\s*' + label + '\\s*$') }).first().click();
    await p.waitForTimeout(450);
  },
  // What is wrong with a Zones Check-In as drawn now: text under 14 px, a zone’s name or a feeling cut off, a count or
  // face over the colored top or the feelings, and (corners: filling the board) anything under the board’s corner buttons
  // or padlocks.
  problems: async (page, where, corners, K = ZC.K) => {
    const f = await ZC.zf(page, K).locator('html').evaluate(() => {
      const out = [], vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        const e = n.parentElement;
        if (!n.textContent.trim() || !e || e.closest('.sr, template, .float') || !e.closest('.view.on') || !vis(e)) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < 13.95) out.push(`“${n.textContent.trim().slice(0, 16)}” at ${fs.toFixed(1)} px`);
      }
      for (const z of document.querySelectorAll('.zone')) {
        const id = z.dataset.z, tap = z.querySelector('.tap').getBoundingClientRect(), head = z.querySelector('.head').getBoundingClientRect(), name = z.querySelector('.name');
        // (To the fraction of a pixel: a name a quarter of a pixel too long already ends in “…”.)
        const nr = document.createRange(); nr.selectNodeContents(name); const nb = nr.getBoundingClientRect();
        if (nb.width > name.getBoundingClientRect().width + 0.01) out.push(`${id}: its name is cut`);
        const tools =[...z.querySelectorAll('.tools .chip, .tools .pill')].filter(vis).map(e => e.getBoundingClientRect());
        if (tools.some(t => t.left < nb.right - 0.5 && t.right > nb.left + 0.5)) out.push(`${id}: its name runs under “−” or Ideas`);
        if (nb.right > tap.right + 0.5 || nb.left < tap.left - 0.5) out.push(`${id}: its name runs out of the card`);
        const fl = z.querySelector('.feelings'), flOn = vis(fl), flr = fl.getBoundingClientRect();
        if (flOn) for (const c of fl.querySelectorAll('.feel')) {
          if (!vis(c)) continue;
          const r = c.getBoundingClientRect();
          if (r.top < flr.top - 0.5 || r.bottom > flr.bottom + 0.5 || r.left < Math.max(flr.left, tap.left) - 0.5 || r.right > Math.min(flr.right, tap.right) + 0.5) out.push(`${id}: “${c.textContent}” is cut off`);
        }
        const below = flOn ? flr.top : tap.bottom;
        const cnt = z.querySelector('.count'), face = z.querySelector('.face');
        for (const [what, e, k] of [['count', cnt, 0.12], ['face', face, 0.02]]) {
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect(), slack = parseFloat(getComputedStyle(e).fontSize) * k;
          if (r.top + slack < head.bottom - 0.5) out.push(`${id}: its ${what} is over the colored top`);
          if (r.bottom - slack > below + 0.5) out.push(`${id}: its ${what} is over the feelings`);
          if (r.left < tap.left - 0.5 || r.right > tap.right + 0.5) out.push(`${id}: its ${what} runs out of the card`);
        }
      }
      // What the board's buttons must not cover: the cards, their buttons, the status line and the bar.
      const parts = [...document.querySelectorAll('.view.on .tap, .view.on .tools .chip, .view.on .tools .pill, .view.on #status, .view.on .bar')].filter(vis)
        .map(e => { const r = e.getBoundingClientRect(); return { name: e.id || e.className.split(' ')[0] + (e.closest('.zone') ? ' ' + e.closest('.zone').dataset.z : ''), x: r.left, y: r.top, w: r.width, h: r.height }; });
      return { out, parts, iw: innerWidth, ih: innerHeight, theme: document.documentElement.getAttribute('data-b21-theme') };
    });
    const top = await page.evaluate(k => {
      const vis = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0; };
      const r = document.querySelector(`.win[data-ikey="${k}"] iframe`).getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, marks: [...document.querySelectorAll('.picker-btn, .corner-clock, .lock-pad')].filter(vis).map(e => { const b = e.getBoundingClientRect(); return { name: e.className.split(' ').slice(0, 2).join('.'), x: b.left, y: b.top, w: b.width, h: b.height }; }) };
    }, K);
    const sx = top.w / f.iw, sy = top.h / f.ih;
    const under = [];
    for (const m of corners ? top.marks : []) for (const q of f.parts) {
      const x = top.x + q.x * sx, y = top.y + q.y * sy, w = q.w * sx, h = q.h * sy;
      if (Math.min(m.x + m.w, x + w) - Math.max(m.x, x) > 0.5 && Math.min(m.y + m.h, y + h) - Math.max(m.y, y) > 0.5) under.push(`${q.name} under ${m.name}`);
    }
    return { where, list: f.out.concat(under), marks: top.marks.length, theme: f.theme, size: `${f.iw} × ${f.ih}` };
  },
  // How the four cards sit (2026.11.20-3): 'row' (side by side, Blue to Red, their tops and bottoms matching), '2x2',
  // 'column' or 'other'. old: what the rules before one row give for the zones' size (a row only when very wide, or
  // wide and short; a column when very tall; else two by two). For each card, where its face, count and feelings are.
  // shows: how many "−", Ideas and feeling words show (ideasWord: the word "Ideas" itself, not just the bulb). w and h:
  // the size the board gives the window's content.
  // The check-in line and its bar (2026.11.23-3): summary (the part of the view that holds them), status (the line), words
  // (the line's text itself) and bar, each as drawn, or null when hidden. iw and ih: the window's content in its own px.
  // filled and corners: whether it fills the board, and the corners the board tells it of. marks: the board's ▦, clock
  // and padlocks over the screen, in the window's own px, and whether each is over the window's content (over).
  // (2026.11.24-4) oneRow: the one-row class. rule, area, fine and want: below.
  arrange: async (page, K = ZC.K) => {
    const x = await ZC.zf(page, K).locator('html').evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const shown = e => e && vis(e) ? box(e) : null;
      const near = (a, b) => Math.abs(a - b) <= 1;
      const cards = ['blue', 'green', 'yellow', 'red'].map(z => {
        const n = document.querySelector(`.zone[data-z="${z}"]`), q = s => n.querySelector(s), fs = e => parseFloat(getComputedStyle(e).fontSize);
        return { z, card: box(q('.tap')), face: box(q('.face')), faceFs: fs(q('.face')), count: vis(q('.count')) ? box(q('.count')) : null, countFs: fs(q('.count')),
          feel: [...n.querySelectorAll('.feel')].filter(vis).map(box) };
      });
      const c = cards.map(k => k.card);
      const shape = c.every(k => near(k.t, c[0].t) && near(k.b, c[0].b)) && c.every((k, i) => !i || k.l >= c[i - 1].r - 1) ? 'row'
        : near(c[0].t, c[1].t) && near(c[2].t, c[3].t) && c[2].t >= c[0].b - 1 && near(c[0].l, c[2].l) && near(c[1].l, c[3].l) && c[1].l >= c[0].r - 1 ? '2x2'
        : c.every(k => near(k.l, c[0].l)) && c.every((k, i) => !i || k.t >= c[i - 1].b - 1) ? 'column' : 'other';
      const zs = document.querySelector('#main .zones'), zr = zs.getBoundingClientRect(), a = zr.width / zr.height;
      const old = a > 3.2 || (a > 2.2 && zr.width >= 800 && zr.height < 310) ? 'row' : a < 0.7 ? 'column' : '2x2';
      // (2026.11.24-4) A row whenever each card can be at least 190 px wide and the cards' area is at least as wide as it
      // is tall: rule. area: the cards' area, in whole px.
      // (Review fix) rule reads the area to the fraction of a pixel, as the cards are drawn (fine). A window that doesn't
      // fill the board gets its layout from its size, not from where it sits: its area as if the board's buttons in its
      // bottom corners weren't over it (their strip, less the pad it has anyway).
      const gap = parseFloat(getComputedStyle(document.getElementById('grid')).columnGap) || 0, area = { w: zs.clientWidth, h: zs.clientHeight }, fine = { w: zr.width, h: zr.height };
      const cw = (window.Board21 && Board21.context && Board21.context.window) || {}, cc = !cw.maximized && cw.corners, low = cc && (cc.left || cc.right) ? cc.height : 0;
      const shows = Object.fromEntries([['minus', '.tools .minus'], ['ideas', '.tools .idea-btn'], ['words', '.feel b'], ['ideasWord', '.pill b']].map(([n, s]) => [n, [...document.querySelectorAll('#main ' + s)].filter(vis).length]));
      return { shape, old, reach: document.body.classList.contains('reach'), oneRow: document.body.classList.contains('one-row'), area, fine,
        rule: (fine.w - 3 * gap) / 4 >= 190 && fine.w >= fine.h + Math.max(0, low - gap),
        cards, shows, gap: parseFloat(getComputedStyle(document.getElementById('grid')).rowGap),
        summary: shown(document.querySelector('#main .summary')), status: shown(document.getElementById('status')), bar: shown(document.getElementById('bar')), iw: innerWidth, ih: innerHeight,
        words: (() => { const e = document.getElementById('status'); if (!vis(e) || !e.textContent.trim()) return null; const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; })() };
    });
    Object.assign(x, await page.evaluate(([k, iw, ih]) => {
      const w = window.__board21.state.wins.get(k), i = w ? w.info() : {};
      const f = document.querySelector(`.win[data-ikey="${k}"] iframe`).getBoundingClientRect(), sx = f.width / iw, sy = f.height / ih;
      const vis = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0; };
      const marks = [...document.querySelectorAll('.picker-btn, .corner-clock, .lock-pad')].filter(vis).map(e => {
        const b = e.getBoundingClientRect();
        return { name: e.classList[0], l: (b.left - f.left) / sx, t: (b.top - f.top) / sy, r: (b.right - f.left) / sx, b: (b.bottom - f.top) / sy,
          over: b.left < f.right && b.right > f.left && b.top < f.bottom && b.bottom > f.top };   // (over the window's content)
      });
      return { w: i.width || 0, h: i.height || 0, filled: !!i.maximized, corners: i.corners || null, marks };
    }, [K, x.iw, x.ih]));
    // want: the layout wanted (2026.11.24-4). A row where the rule says, or filling the board at least 850 × 480 px. Else
    // the rules before: a row when very wide, or wide and short, a column when very tall, else two by two.
    x.want = x.rule || (x.filled && x.w >= 850 && x.h >= 480) ? 'row' : x.old;
    return x;
  },
  // Where the check-in line and its bar sit (2026.11.23-3), from arrange: what is wrong. Above the cards, the line, then
  // the bar, then the cards one gap below them, the line's text and the bar centered over the cards. A window 300 px tall
  // or less hides the bar, and one 229 px tall or less the line too. Under the padlocks of a locked board, filling it or
  // (2026.11.24-4) not, the line and the bar sit between them, under neither, and the cards start one gap below the
  // padlocks too (corners.top).
  atTop: x => {
    const out = [], px = n => Math.round(n * 10) / 10, c = x.cards.map(k => k.card);
    const top = Math.min(...c.map(k => k.t)), mid = (Math.min(...c.map(k => k.l)) + Math.max(...c.map(k => k.r))) / 2;
    const line = x.ih > 229, bar = x.ih > 300;
    if (!!x.status !== line) out.push(line ? 'no line' : `the line shows at ${x.ih} px tall`);
    if (!!x.bar !== bar) out.push(bar ? 'no bar' : `the bar shows at ${x.ih} px tall`);
    if (x.status && x.bar && x.status.b > x.bar.t + 0.5) out.push(`the line (${px(x.status.t)} to ${px(x.status.b)}) isn’t above the bar (${px(x.bar.t)} to ${px(x.bar.b)})`);
    const last = x.bar || x.status, name = x.bar ? 'bar' : 'line';
    if (last && last.b > top + 0.5) out.push(`the ${name} (${px(last.t)} to ${px(last.b)}) isn’t above the cards (from ${px(top)})`);
    const ct = (x.corners && x.corners.top) || {}, lock = ct.left || ct.right ? ct.height : 0;
    const want = Math.max(last ? last.b : 0, lock) + x.gap;
    if (Math.abs(top - want) > 1) out.push(`the cards start at ${px(top)} px, not one gap below the ${lock > (last ? last.b : 0) ? 'padlocks' : last ? name : 'top'} (${px(want)})`);
    for (const [n, b] of [['line', x.status], ['line’s text', x.words], ['bar', x.bar]]) if (b && Math.abs((b.l + b.r) / 2 - mid) > 1) out.push(`the ${n} isn’t centered over the cards (${px((b.l + b.r) / 2)}, not ${px(mid)})`);
    const pads = x.marks.filter(m => m.name === 'lock-pad' && m.over);
    if (pads.length) {
      const padB = Math.max(...pads.map(p => p.b)), side = p => (p.l + p.r) / 2 < x.iw / 2;
      const from = Math.max(0, ...pads.filter(side).map(p => p.r)), to = Math.min(x.iw, ...pads.filter(p => !side(p)).map(p => p.l));
      for (const [n, b] of [['line', x.status], ['bar', x.bar]]) if (b && (b.l < from - 0.5 || b.r > to + 0.5)) out.push(`the ${n} (${px(b.l)} to ${px(b.r)}) isn’t between the padlocks (${px(from)} to ${px(to)})`);
      if (x.status && x.status.t >= padB) out.push(`the line (from ${px(x.status.t)}) is below the padlocks (to ${px(padB)})`);
      if (top < padB - 0.5) out.push(`the cards (from ${px(top)}) start under the padlocks (to ${px(padB)})`);
    }
    return out;
  },
  // Where the cards end (2026.11.23-3), from arrange: what is wrong. One gap above the window's bottom. Under the board's
  // buttons in its bottom corners, filling it or (2026.11.24-4) not, just above them (the view's bottom less
  // corners.height), and under none of them.
  ends: x => {
    const out = [], px = n => Math.round(n * 10) / 10, c = x.cards.map(k => k.card), bottom = Math.max(...c.map(k => k.b));
    const ct = x.corners || {}, low = ct.left || ct.right ? ct.height : 0, want = x.ih - Math.max(x.gap, low);
    if (Math.abs(bottom - want) > 1) out.push(`the cards end at ${px(bottom)} px, not ${low > x.gap ? 'just above the board’s buttons' : 'one gap above the bottom'} (${px(want)})`);
    for (const m of x.marks.filter(m => m.name !== 'lock-pad' && m.over)) for (const [i, k] of c.entries())
      if (Math.min(m.r, k.r) - Math.max(m.l, k.l) > 0.5 && k.b > m.t + 0.5) out.push(`${x.cards[i].z} ends under ${m.name} (${px(k.b)}, below ${px(m.t)})`);
    return out;
  }
};

// The Name Picker's ways to pick, as its window menu lists them under Pick with: [config.style, label].
const NP_STYLES = [['name', 'Big name'], ['wheel', 'Spinning wheel'], ['spotlight', 'Spotlight'], ['lotto', 'Lotto'], ['versus', 'Versus'], ['groups', 'Groups'], ['bracket', 'Bracket']];

// ---- Weather (2026.11.24-3). Its five sites never answer for real: every context aborts them (the browser.newContext
// wrapper at the end), and a Weather suite answers them with stubWeather, from tests/fixtures/weather/: real answers from
// Mon Nov 23 2026, about 11:50 AM Central (Open-Meteo's times as unix seconds, as the widget asks for them).
const WX_HOSTS = /^https:\/\/((api|air-quality-api|archive-api|geocoding-api)\.open-meteo\.com|api\.weather\.gov)\//;
const WX_AT = '2026-11-23T11:50:00-06:00';
const WX_FIX = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'weather', n), 'utf8'));
// A fixture moved s seconds later: Open-Meteo's unix times (each "time"), and the Weather Service's times with an offset.
function wxShift(v, s, key) {
  if (!s) return v;
  if (Array.isArray(v)) return v.map(x => wxShift(x, s, key));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wxShift(x, s, k)]));
  if (key === 'time' && typeof v === 'number') return v + s;
  if (typeof v === 'string') return v.replace(/(\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?)([+-]\d\d:\d\d)/g, (m, t, z) => {
    const off = (z[0] === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(4, 6)), at = Date.parse(t + z) + s * 1000;
    return new Date(at + off * 6e4).toISOString().slice(0, t.length) + z;
  });
  return v;
}
// wx.asked: each request, { host, path, url, query, cookie, referer, origin }. wx.answers, by "host/path" (the longest
// that starts the request's wins): a fixture's file name, a function of the URL giving one of these, { json }, { status,
// headers, body }, { abort: true } (no connection, as when a school's filter blocks it), or { hang: true } (no answer).
// wx.shift moves every fixture's times that many seconds later; wx.later[key] moves one answer's times further.
async function stubWeather(ctx, more = {}) {
  const wx = { asked: [], shift: 0, later: {}, answers: Object.assign({
      'api.open-meteo.com/v1/forecast': u => +u.searchParams.get('latitude') < 30 ? 'om-forecast-honolulu.json' : 'om-forecast-wheeling.json',
      'air-quality-api.open-meteo.com/v1/air-quality': 'om-airquality-wheeling.json',
      'archive-api.open-meteo.com/v1/archive': 'om-archive-2019-01-30.json',
      'geocoding-api.open-meteo.com/v1/search': u => /^wheel/i.test(u.searchParams.get('name')) ? 'om-geocode-wheeling.json' : /^honol/i.test(u.searchParams.get('name')) ? 'om-geocode-honolulu.json' : { json: { generationtime_ms: 0.2 } },
      'api.weather.gov/points/42.1392,-87.929': 'nws-points-wheeling.json',
      'api.weather.gov/points/21.3069,-157.8583': 'nws-points-honolulu.json',
      'api.weather.gov/gridpoints/LOT/65,84/stations': 'nws-stations-LOT-65-84.json',
      'api.weather.gov/gridpoints/LOT/65,84/forecast': 'nws-forecast-LOT-65-84.json',
      'api.weather.gov/gridpoints/LOT/65,84/forecast/hourly': 'nws-forecast-hourly-LOT-65-84.json',
      'api.weather.gov/gridpoints/HFO/154,145/stations': 'nws-stations-HFO-154-145.json',
      'api.weather.gov/gridpoints/HFO/154,145/forecast': 'nws-forecast-HFO-154-145.json',
      'api.weather.gov/stations/KPWK/observations': 'nws-observations-KPWK.json',
      'api.weather.gov/stations/PHNL/observations': 'nws-observations-PHNL.json',
      'api.weather.gov/alerts/active': 'nws-alerts-wheeling-empty.json' }, more),
    count: re => wx.asked.filter(a => !re || re.test(a.url)).length,
    hosts: () => [...new Set(wx.asked.map(a => a.host))].sort() };
  await ctx.route(WX_HOSTS, async r => {
    const req = r.request(), u = new URL(req.url()), h = await req.allHeaders().catch(() => ({})), at = u.host + decodeURIComponent(u.pathname);
    wx.asked.push({ host: u.host, path: u.pathname, url: u.href, query: Object.fromEntries(u.searchParams), origin: h.origin || '', cookie: h.cookie || '', referer: h.referer || '' });
    const key = Object.keys(wx.answers).filter(k => at === k || at.startsWith(k + '/') || at.startsWith(k + '?') || (k.endsWith('/') && at.startsWith(k))).sort((a, b) => b.length - a.length)[0];
    let t = key ? wx.answers[key] : { status: 404 };
    if (typeof t === 'function') t = t(u);
    if (t && t.delay) await new Promise(res => setTimeout(res, t.delay));
    if (t && t.hang) return;
    if (t && t.abort) return r.abort('internetdisconnected').catch(() => {});
    const s = wx.shift + ((key && wx.later[key]) || 0);
    const body = typeof t === 'string' ? JSON.stringify(wxShift(WX_FIX(t), s)) : t && 'json' in t ? JSON.stringify(t.json) : (t && t.body) || '';
    return r.fulfill({ status: (t && t.status) || 200, headers: Object.assign({ 'access-control-allow-origin': '*' }, (t && t.headers) || {}),
      contentType: u.host === 'api.weather.gov' ? 'application/geo+json' : 'application/json', body }).catch(() => {});
  });
  return wx;
}
// A Weather window, from the board: WXT.F runs fn in its page, WXT.text is what it shows (no-break spaces as spaces).
const WXT = {
  K: 'weather:1',
  wf: (p, k = WXT.K) => p.frameLocator(`.win[data-ikey="${k}"] iframe`),
  // (Its frame by name, so fn gets arg as its first parameter, as page.evaluate gives it.)
  F: async (p, fn, arg, k = WXT.K) => {
    let f = null;
    for (let i = 0; i < 50 && !(f = frameNamed(p, k)); i++) await p.waitForTimeout(100);
    if (!f) throw new Error(`no frame for ${k}`);
    return f.evaluate(fn, arg);
  },
  text: (p, k = WXT.K) => WXT.F(p, () => (document.getElementById('app') || document.body).innerText.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' '), null, k),
  connected: (p, k = WXT.K) => eventually(() => p.evaluate(k => { const w = window.__board21.state.wins.get(k); return !!w && w.connected; }, k)),
  // Until the window shows the weather (or ms pass).
  drawn: (p, k = WXT.K, ms = 8000) => eventually(() => WXT.F(p, () => !!document.querySelector('#app .wx') && !document.querySelector('#app .loading'), null, k), ms),
  menuOf: (p, k = WXT.K) => p.evaluate(k => { const w = window.__board21.state.wins.get(k); return w ? w.menuItems.map(i => i.separator ? '—' : i.heading ? `[${i.label}]` : (i.checked === true ? '✓ ' : i.checked === false ? '☐ ' : '') + i.label + (i.disabled ? ' (off)' : '')).join(' | ') : ''; }, k),
  choose: async (p, id, k = WXT.K) => {
    await p.click(`.win[data-ikey="${k}"] .win-label`); await p.waitForTimeout(200);
    const it = p.locator(`#menu [data-act="widget"][data-id="${id}"]`);
    if (!await it.count() || await it.isDisabled()) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); return false; }
    await it.click(); await p.waitForTimeout(400); return true;
  },
  conf: (p, k = WXT.K) => p.evaluate(k => window.__board21.state.conf.get(k) || null, k),
  data: (p, k = WXT.K) => p.evaluate(k => window.__board21.state.data.get(k) || null, k),
  // Content size w × h (the title bar is added), out of Fill the board.
  size: (p, w, h, k = WXT.K) => p.evaluate(([k, w, h]) => { const b = window.__board21; b.setMaximized(k, false); b.setRect(k, { x: 20, y: 20, w, h: h + 40 }); }, [k, w, h]).then(() => p.waitForTimeout(500)),
  // Content or config arriving from another tab or device.
  put: (p, kind, v, k = WXT.K) => p.evaluate(async ([k, kind, v]) => {
    const w = window.__board21.state.wins.get(k), B = w.iframe.contentWindow.Board21;
    if (kind === 'data') { await B.save(v); w.post('data', { data: v, reason: 'remote' }); } else { await B.saveConfig(v); w.post('config', { config: v, reason: 'remote' }); }
  }, [k, kind, v]),
  // A board in Chicago at the fixtures' moment (at: null keeps the real time; clock: 'install' lets it run), with the
  // weather sites stubbed. Its page errors go to errors.
  board: async (browser, errors, { at = WX_AT, clock = 'fixed', opts = {}, query = '', more = {} } = {}) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 768 }, timezoneId: 'America/Chicago', locale: 'en-US' }, opts));
    const wx = await stubWeather(ctx, more);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (at && clock === 'fixed') await page.clock.setFixedTime(at);
    if (at && clock === 'install') await page.clock.install({ time: at });
    await page.goto(BASE + query); await boardUp(page); await freeBoard(page);
    return { ctx, page, wx };
  },
  // Runs an installed clock on by min minutes, a minute at a time, letting each minute's answers arrive. (Jumping
  // further at once would fire each request's 10-second wait before its stubbed answer could come.)
  later: async (p, min) => { for (let i = 0; i < min; i++) { await p.clock.fastForward(60e3); await p.waitForTimeout(25); } await p.waitForTimeout(300); },
  open: async (p, k = WXT.K) => { await p.evaluate(() => window.__board21.openWidget('weather', { fresh: true })); await WXT.connected(p, k); await WXT.drawn(p, k); await p.waitForTimeout(300); },
  // What is wrong with the window as drawn now: it scrolls, text under 14 px, text cut off or running out of its card or
  // the window, text over text, and (corners: it fills the board) a part or a line of Now under the board's corner
  // buttons or padlocks.
  problems: async (p, corners, k = WXT.K) => {
    const f = await WXT.F(p, () => {
      const out = [], de = document.documentElement, words = [];
      const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      if (de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1) out.push(`it scrolls (${de.scrollWidth} × ${de.scrollHeight})`);
      const walk = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        const e = n.parentElement, t = n.textContent.trim();
        if (!t || !e || e.closest('.sr, svg') || !vis(e)) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < 13.95) out.push(`“${t.slice(0, 18)}” at ${fs.toFixed(1)} px`);
        const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
        const sc = e.closest('.scroll'), sb = sc && sc.getBoundingClientRect();
        if (sc && (b.top < sb.top - 0.5 || b.bottom > sb.bottom + 0.5)) continue;   // (scrolled out of view, in a view that scrolls)
        if (b.left < -0.5 || b.top < -0.5 || b.right > innerWidth + 0.5 || b.bottom > innerHeight + 0.5) out.push(`“${t.slice(0, 18)}” runs out of the window`);
        // (Its ink, line by line: the box less the room above capitals and below the line.)
        for (const q of r.getClientRects()) if (q.width > 1 && q.height > 1) words.push({ e, t, l: q.left + 0.5, r: q.right - 0.5, top: q.top + 0.22 * fs, bot: q.bottom - 0.2 * fs });
        const box = e.closest('.card, .band, .tg b, .rb, .chip, .aqpill');
        if (box) { const c = box.getBoundingClientRect(); if (b.left < c.left - 0.5 || b.right > c.right + 0.5 || b.top < c.top - 0.5 || b.bottom > c.bottom + 0.5) out.push(`“${t.slice(0, 18)}” runs out of its ${box.className.split(' ')[0]}`); }
        const s = getComputedStyle(e);
        if ((s.textOverflow === 'ellipsis' || s.overflow === 'hidden') && e.scrollWidth > e.clientWidth + 1) out.push(`“${t.slice(0, 18)}” is cut off`);
      }
      // Text over text: two words, neither inside the other, whose ink meets.
      const over = new Set();
      for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
        const A = words[i], B = words[j];
        if (A.e === B.e || A.e.contains(B.e) || B.e.contains(A.e)) continue;
        if (Math.min(A.r, B.r) - Math.max(A.l, B.l) > 1 && Math.min(A.bot, B.bot) - Math.max(A.top, B.top) > 1) over.add(`“${A.t.slice(0, 18)}” runs over “${B.t.slice(0, 18)}”`);
      }
      out.push(...over);
      // Words in a picture (the compass's N, E, S, and W): their size as drawn, the picture's scale included.
      for (const t of document.querySelectorAll('#app svg text')) {
        if (!vis(t) || t.closest('.sr')) continue;
        const m = t.getScreenCTM(), px = parseFloat(getComputedStyle(t).fontSize) * (m ? Math.hypot(m.a, m.b) : 1);
        if (px < 13.95) out.push(`“${t.textContent.trim().slice(0, 18)}” at ${px.toFixed(1)} px in a picture`);
      }
      // A part's own box inside the window, and inside its card.
      for (const c of document.querySelectorAll('#app .in > *, #app .smalls > *')) {
        if (!vis(c)) continue;
        const r = c.getBoundingClientRect();
        if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) out.push(`${c.className.split(' ').slice(0, 2).join('.')} runs out of the window`);
        if (c.matches('.card') && c.scrollHeight > c.clientHeight + 2) out.push(`${c.className.split(' ').slice(0, 2).join('.')} overflows its card (${c.scrollHeight} > ${c.clientHeight})`);
      }
      const parts = [...document.querySelectorAll('#app .card, #app .hero, #app .hero > *, #app .band, #app .rb')].filter(vis).map(e => { const r = e.getBoundingClientRect(); return { name: e.className.split(' ').slice(0, 2).join('.'), x: r.left, y: r.top, w: r.width, h: r.height }; });
      return { out, parts, iw: innerWidth, ih: innerHeight, layout: ((document.querySelector('#app .wx') || {}).className || '').split(' ').find(c => /^L-/.test(c)) || '' };
    }, null, k);
    const top = await p.evaluate(k => {
      const vis = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0; };
      const r = document.querySelector(`.win[data-ikey="${k}"] iframe`).getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, marks: [...document.querySelectorAll('.picker-btn, .corner-clock, .lock-pad')].filter(vis).map(e => { const b = e.getBoundingClientRect(); return { name: e.className.split(' ').slice(0, 2).join('.'), x: b.left, y: b.top, w: b.width, h: b.height }; }) };
    }, k);
    const sx = top.w / f.iw, sy = top.h / f.ih;
    for (const m of corners ? top.marks : []) for (const q of f.parts) {
      const x = top.x + q.x * sx, y = top.y + q.y * sy, w = q.w * sx, h = q.h * sy;
      if (Math.min(m.x + m.w, x + w) - Math.max(m.x, x) > 0.5 && Math.min(m.y + m.h, y + h) - Math.max(m.y, y) > 0.5) f.out.push(`${q.name} under ${m.name}`);
    }
    return { list: f.out, marks: top.marks.length, size: `${f.iw} × ${f.ih}`, layout: f.layout };
  },
  // The window's parts as drawn: which cards show, the grid's empty tracks (a gap a hidden part left), and the layout.
  parts: (p, k = WXT.K) => WXT.F(p, () => {
    const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const wx = document.querySelector('#app .wx'), inn = wx && wx.querySelector(':scope > .in');
    if (!inn) return null;
    const has = sel => [...wx.querySelectorAll(sel)].some(vis);
    const kids = [...inn.children].filter(vis).map(e => e.getBoundingClientRect()), cs = getComputedStyle(inn), b = inn.getBoundingClientRect();
    // Each grid row and column must hold part of a child: an empty track is a gap.
    const gaps = [];
    for (const [dir, list, start, gap] of [['row', cs.gridTemplateRows, b.top + parseFloat(cs.paddingTop), parseFloat(cs.rowGap) || 0], ['column', cs.gridTemplateColumns, b.left + parseFloat(cs.paddingLeft), parseFloat(cs.columnGap) || 0]]) {
      if (!list || list === 'none') continue;
      let at = start;
      for (const t of list.split(' ').map(parseFloat)) {
        const from = at, to = at + t;
        if (t > 1 && !kids.some(r => (dir === 'row' ? Math.min(r.bottom, to) - Math.max(r.top, from) : Math.min(r.right, to) - Math.max(r.left, from)) > 0.5)) gaps.push(`an empty ${dir} (${Math.round(from)} to ${Math.round(to)})`);
        at = to + gap;
      }
    }
    return { layout: (wx.className.split(' ').find(c => /^L-/.test(c)) || '').slice(2), hero: has('.hero'), hourly: has('.hourly'), days: has('.daysc') ? 7 : has('.week') ? wx.querySelectorAll('.week .col').length : 0,
      wear: has('.wear') ? 'card' : has('.wl') ? 'line' : '', sun: has('.sun'), moon: has('.moon'), moonline: has('.moonline'), wind: has('.windc'), air: has('.air'),
      windLine: /Wind \d/.test((wx.querySelector('.hero') || {}).textContent || ''), airLine: /Air quality \d/.test((wx.querySelector('.hero') || {}).textContent || ''),
      feels: /Feels like/.test((wx.querySelector('.hero') || {}).textContent || ''), gaps, units: [...wx.querySelectorAll('.unit')].filter(vis).map(u => u.textContent + ':' + (u.closest('.temp') ? 'temp' : 'elsewhere')) };
  }, null, k)
};

// The folder this file is in, for a suite's fixtures: path.join(TESTS_DIR, 'fixtures', …).
const TESTS_DIR = __dirname;
// For tests/run.js: the board's address once its server is up, the suite running, and the counts so far.
const setBase = b => { BASE = b; };
const setSuite = t => { SUITE = t; };
const counts = () => ({ passes, fails });

module.exports = {
  chromium, http, fs, path, ROOT, OUT, TYPES, ghEscape, VERBOSE, ok, freeBoard, openSettings, setTheme, lockBoard,
  unlockBoard, setCornerClock, renamePage, fillNote, DEV_WIDGET, AWAY, DEV_ROUTES, DRIVE_PICK, CLOCK, setClock,
  driveDevice, readFolder, fileText, putText, readPhotos, addPhotos, ownFile, deliver, dupFolder, seedFolder,
  setUpSync, SHORT, syncWaits, nameDevice, linkFolder, syncNow, shownBoard, sorted, sameBoards, notesText,
  loseLedger, typeNote, addNote, noteOf, addWin, winList, copiesOf, ikOf, saveData, syncDev, exchange, ownJSON, hear,
  heard, eventually, readHistory, writeHistory, OLD_NOTE, OLD_HIST_NOTE, STORAGE_FAULTS, storedRecords, release, wordsOf,
  stamped, STAMPED, SITES, deploy, marked, parts, updateCheck, boardUp, VID, VID2, YT_TITLES, YT_LABEL, OEMBED,
  EMBED, EMBED_CODE, PLAYLIST_EMBED, D1, D2, RK, V1, V2, VH, VIMEO_TITLES, DRIVE_EMBED, VIMEO_EMBED, VIMEO_OEMBED,
  DRIVE_OPEN, VIMEO_OPEN, DRIVE_LABEL, VMSG, vidFrames, DRIVE_CODE, VIMEO_CODE, stubVideos, ytWin, ytLook, ytFrames,
  ytMenu, ytData, ytChoose, ytShow, ytHistory, ytPick, picWin, picLook, picData, picConf, picMenu, picOpen, picFile,
  FIXTURE, picWins, drawPic, PMSG, padGif, padWebp, pngChunk, PNG_SIG, pngHeader, apng, alphaAt, frameNamed, sendFiles, copyPic,
  copyText, contentOf, contrast, rgbOf, hexOf, mixOf, hslOf, hueGap, ZC, NP_STYLES, WX_HOSTS, WX_AT, WX_FIX, wxShift,
  stubWeather, WXT, TESTS_DIR, setBase, setSuite, counts
};
