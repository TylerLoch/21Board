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
const VERSION = '2026.11.10-30';
// Written by tools/release.js, never by hand. BUILD: one fingerprint for this file and everything in FILES.
// FILES: every file of the offline copy, with its own fingerprint.
const BUILD = 'e162f0be';
const FILES = {
  './': 'c4d3c8fd6f083156',
  'index.html': 'c4d3c8fd6f083156',
  'board.js': '17326b2d6aa3d5df',
  'sdk/board21.js': '3ec0b3970329642d',
  'sdk/board21-dev.js': '492a193221911878',
  'sdk/dev/board-shell.js': '9488037c455e2836',
  'sdk/lab.html': '21cda27716334794',
  'widgets/registry.js': '21973030f0746579',
  'manifest.webmanifest': '3fddd4aac05d7279',
  'icons/icon.svg': '7b5cfc68d4259303',
  'icons/icon-192.png': 'cd8df22014016f08',
  'icons/icon-512.png': 'f36bcfa6f75f9518',
  'icons/icon-maskable-512.png': 'f657800c74fa000f',
  'icons/apple-touch-icon.png': '40c6305b7794812a',
  'widgets/timer/index.html': '964893c44ba4c60b',
  'widgets/calendar/index.html': '56e1d403a0c343e0',
  'widgets/clock/index.html': 'abb749c6c6d67c3c',
  'widgets/notes/index.html': '4e164b401637ecd5',
  'widgets/notes/fonts/CrayonLibre-21Board.woff2': '7456bd198b414e6c',
  'widgets/notes/fonts/CrayonLibre-LICENSE.txt': 'f4e7f373b9b99695',
  'widgets/notes/fonts/Excalifont-Regular.woff2': 'ee41ec4c06bfa072',
  'widgets/notes/fonts/Excalifont-OFL.txt': '862c615026e6b939',
  'widgets/name-picker/index.html': '5655767818633849',
  'widgets/dice/index.html': '34939aea1f6c7f45',
  'widgets/traffic-light/index.html': '5fcf0d01a1519cef',
  'widgets/sdk-playground/index.html': 'b2f632fc184c3324'
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

const WIDGET_FILES = (self.BOARD21_WIDGETS || []).flatMap(widget => (Array.isArray(widget.files) && widget.files.length ? widget.files : [widget.entry]));
const PRECACHE = Array.from(new Set(SHELL_FILES.concat(WIDGET_FILES)));

const fingerprint = async buf => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Every file is downloaded and checked before any of it is saved. A file that isn't the one this version
    // was released with (the server has a newer or half-uploaded one, or the network answered with a sign-in
    // page) fails the install: the version in use stays, and the browser tries again at its next check.
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
    // No skipWaiting() here. A first install has nothing to wait for; an update waits until "Update" is
    // tapped (SKIP_WAITING below) or every 21Board tab has closed.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // The copies of earlier versions go. (Not while a still newer version is downloading: its copy would go
    // with them. It tidies up when it takes over.)
    if (self.registration.installing) return;
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE).map(n => caches.delete(n)));
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
  if (msg.type === 'CLAIM') event.waitUntil(self.clients.claim().catch(() => {}));
  if (msg.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION, build: BUILD, files: PRECACHE.length });
});

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<body style="margin:0;height:100vh;display:grid;place-items:center;font:16px system-ui;color:#6b7280;background:transparent;text-align:center;padding:16px">
<div><b style="color:#1f2937">Not available offline yet</b><br>Connect to the internet once so 21Board can save this for offline use.</div></body>`;

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
      return board || new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  })());
});
