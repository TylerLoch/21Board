/*
 * 21Board service worker — makes the whole board work offline, one complete version at a time.
 *
 * On install it downloads the board shell plus every file listed by every widget in
 * widgets/registry.js, and checks each one against the fingerprint tools/release.js wrote below.
 * The offline copy is saved only if every file is right. After that, this version answers with
 * its own saved files and nothing else: they are never replaced one by one, so a board never runs
 * part old and part new. A new version arrives as a whole new copy and waits; teachers see
 * "Update" in 21Board, and it takes over by itself the next time 21Board starts.
 *
 * >>> Before you deploy: bump VERSION, then run `node tools/release.js`. <<<   (README, "Deploying")
 * If files change without that, the tests fail, and devices keep the version they have.
 */
const VERSION = '2026.11.12-40';
// Written by tools/release.js, never by hand. BUILD: one fingerprint for this file and everything in FILES.
// FILES: every file of the offline copy, with its own fingerprint.
const BUILD = '7c8c73f7';
const FILES = {
  './': '4ed10ee7721df9f3',
  'index.html': '4ed10ee7721df9f3',
  'board.js': '935e170ce1864456',
  'sdk/board21.js': '3ec0b3970329642d',
  'sdk/board21-dev.js': '492a193221911878',
  'sdk/dev/board-shell.js': '35f765af7f36514a',
  'sdk/lab.html': '21cda27716334794',
  'widgets/registry.js': '62fbc7a4c8e2c8e2',
  'manifest.webmanifest': '3fddd4aac05d7279',
  'icons/icon.svg': '7b5cfc68d4259303',
  'icons/icon-192.png': 'cd8df22014016f08',
  'icons/icon-512.png': 'f36bcfa6f75f9518',
  'icons/icon-maskable-512.png': 'f657800c74fa000f',
  'icons/apple-touch-icon.png': '40c6305b7794812a',
  'widgets/timer/index.html': '519a447651242d8e',
  'widgets/task-timer/index.html': 'c3ffc89c8475cf71',
  'widgets/calendar/index.html': '7b3d6a2ac35e8999',
  'widgets/clock/index.html': '21a98aa1d345b489',
  'widgets/notes/index.html': 'c906b2da71b6f6d4',
  'widgets/notes/fonts/CrayonLibre-21Board.woff2': '7456bd198b414e6c',
  'widgets/notes/fonts/CrayonLibre-LICENSE.txt': 'f4e7f373b9b99695',
  'widgets/notes/fonts/Excalifont-Regular.woff2': 'ee41ec4c06bfa072',
  'widgets/notes/fonts/Excalifont-OFL.txt': '862c615026e6b939',
  'widgets/name-picker/index.html': '87f7e6f273c95a4e',
  'widgets/first-then-board/index.html': '2b6556486bf889bd',
  'widgets/dice/index.html': '868bf3c637359718',
  'widgets/traffic-light/index.html': 'ef3aaa87ecd1bdc1',
  'widgets/sdk-playground/index.html': '9d5615e8b0f6f313'
};
const CACHE_PREFIX = '21board-';
const CACHE = CACHE_PREFIX + VERSION + '-' + BUILD;

importScripts('widgets/registry.js');

const SHELL_FILES = [
  './',
  'index.html',
  'board.js',
  'sdk/board21.js',
  'sdk/board21-dev.js',        // the widget dev window and lab (for widget developers; small)
  'sdk/dev/board-shell.js',
  'sdk/lab.html',
  'widgets/registry.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

// (Not the district's own apps, `external`: they come from their own sites, which keep their own offline copies.
// Another site's page can't be part of this copy, and a window couldn't be given it from here anyway.)
const WIDGET_FILES = (self.BOARD21_WIDGETS || []).filter(widget => !widget.external)
  .flatMap(widget => (Array.isArray(widget.files) && widget.files.length ? widget.files : [widget.entry]));
const PRECACHE = Array.from(new Set(SHELL_FILES.concat(WIDGET_FILES)));

const fingerprint = async buf => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

// Downloads this version's offline copy: every file, each one checked, and only then saved. (One download at a time.)
let saving = null;
const saveCopy = () => saving || (saving = (async () => {
  // A file that isn't the one this version was released with (the server has a newer or half-uploaded one, or
  // the network answered with a sign-in page) means no copy: when a new version is being installed, the
  // version in use stays, and the browser tries again at its next check.
  const wrong = why => { why = `21Board ${VERSION} (${BUILD}) wasn’t saved for offline use: ${why}`; console.error(why); throw new Error(why); };
  // (The list itself comes from widgets/registry.js as the server has it now.)
  if (PRECACHE.length !== Object.keys(FILES).length) wrong('the list of files on the server is not the one this version was released with');
  const files = await Promise.all(PRECACHE.map(async url => {
    const res = await fetch(new Request(url, { cache: 'reload' }));   // 'reload' skips the HTTP cache
    const body = res.ok ? await res.arrayBuffer() : null;
    if (!body) wrong(`${url} on the server answered ${res.status}`);
    if (await fingerprint(body) !== FILES[url]) wrong(`${url} on the server is not the file this version was released with`);
    // A fresh Response (one that followed a redirect can't answer a page load), without the headers that
    // described the download: the body is saved unpacked, and this copy answers whatever the request says.
    const headers = new Headers(res.headers);
    ['Content-Encoding', 'Content-Length', 'Vary'].forEach(h => headers.delete(h));
    return [url, new Response(body, { headers })];
  }));
  const cache = await caches.open(CACHE);
  await Promise.all(files.map(([url, res]) => cache.put(url, res)));
})().finally(() => { saving = null; }));

// Is every file of the copy there? A copy can go missing after it was saved: release 2026.11.10-30 deletes
// every copy but its own when it takes over, and a browser can drop one. GET_VERSION (below) then saves it again.
const address = file => new URL(file, self.location.href).href;
const copyWhole = async () => {
  const have = new Set((await (await caches.open(CACHE)).keys()).map(req => req.url));
  return PRECACHE.every(file => have.has(address(file)));
};

self.addEventListener('install', event => {
  // No skipWaiting() here. A first install has nothing to wait for; an update waits until "Update" is
  // tapped (SKIP_WAITING below) or every 21Board tab has closed.
  event.waitUntil(saveCopy());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // The copies of earlier versions go: the ones made before this version's (the browser lists copies in the
    // order they were made). Never a later one: a still newer version may have finished downloading while
    // this one was taking over, and it needs its copy when its turn comes.
    const names = (await caches.keys()).filter(n => n.startsWith(CACHE_PREFIX));
    await Promise.all(names.slice(0, Math.max(0, names.indexOf(CACHE))).map(n => caches.delete(n)));
    // No clients.claim() and no reloading of tabs here. Tabs that ran the previous version are handed to this
    // one by the browser and reload themselves (board.js, section 15). A tab that was opened before there was
    // any copy asks to be taken over (CLAIM) once it knows it is the same build.
  })());
});

self.addEventListener('message', event => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') {
    // "Update" was tapped. If this version is in charge already, the tab that asks was left on the old one
    // (a tab from before tabs restarted themselves, release 2026.11.10-30): start it again.
    const waiting = !!self.registration.waiting, tab = event.source;
    self.skipWaiting();
    if (!waiting && tab && tab.navigate) event.waitUntil(tab.navigate(tab.url).catch(() => {}));
  }
  // (CLAIM takes every 21Board tab that has no copy yet, not only the one that asks. One that runs another
  // build offers "Update" as soon as it sees this: board.js, section 15.)
  if (msg.type === 'CLAIM') event.waitUntil(self.clients.claim().catch(() => {}));
  if (msg.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    // copy: are this version's files all saved? If not, they are saved again now, and a second answer says
    // whether that worked (until then, board.js doesn't say "Ready to work offline").
    const port = event.ports[0], answer = copy => port.postMessage({ version: VERSION, build: BUILD, files: PRECACHE.length, copy });
    event.waitUntil((async () => {
      const copy = await copyWhole().catch(() => false);
      answer(copy);
      if (!copy) answer(await saveCopy().then(() => true, () => false));
    })());
  }
});

const offlinePage = (title, text) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<body style="margin:0;height:100vh;display:grid;place-items:center;font:16px system-ui;color:#6b7280;background:transparent;text-align:center;padding:16px">
<div><b style="color:#1f2937">${title}</b><br>${text}</div></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // This version's own files always come from its saved copy, never from the network: what the server has
    // now may be a newer version. ("?kiosk=yes" and the like are the same file.)
    const saved = await cache.match(req, { ignoreSearch: true });
    if (saved) return saved;
    // Anything else (a widget under test in Developer mode, a page that isn't part of 21Board) comes from the
    // network and isn't kept.
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode !== 'navigate') return new Response('', { status: 504, statusText: 'Offline' });
      // Offline: a page address inside the board's scope gets the board itself; a widget window says why it is empty.
      const board = req.destination === 'document' && await cache.match('index.html');
      if (board) return board;
      // One of this version's own files, or the board: the copy isn't there. Anything else in a window is a
      // widget that was never part of it (one under test in Developer mode).
      return req.destination === 'document' || PRECACHE.some(file => address(file) === url.origin + url.pathname) ? offlinePage('Not available offline yet', 'Connect to the internet once so 21Board can save this for offline use.')
        : offlinePage('This widget needs a connection', 'Only the widgets in 21Board’s own list are kept for offline use.');
    }
  })());
});
