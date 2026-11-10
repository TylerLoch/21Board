/*
 * 21Board service worker — makes the whole board work offline.
 *
 * On install it downloads the board shell plus every file listed by every
 * sub-app in apps/registry.js, so all sub-apps work with no network.
 * After that, files are served from the cache immediately and refreshed in
 * the background when online (stale-while-revalidate).
 *
 * >>> Bump VERSION whenever you deploy changes. <<<
 * That forces a clean download of everything and shows teachers an
 * "Update" prompt inside 21Board.
 */
const VERSION = '2026.11.10-3';
const CACHE_PREFIX = '21board-';
const CACHE = CACHE_PREFIX + VERSION;

importScripts('apps/registry.js');

const SHELL_FILES = [
  './',
  'index.html',
  'board.js',
  'sdk/board21.js',
  'apps/registry.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

const APP_FILES = (self.BOARD21_APPS || []).flatMap(app => (Array.isArray(app.files) && app.files.length ? app.files : [app.entry]));
const PRECACHE = Array.from(new Set(SHELL_FILES.concat(APP_FILES)));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the HTTP cache so a new VERSION really gets new files.
    await cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })));
    // First install: take over right away. Updates wait for the teacher to tap "Update".
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION, files: PRECACHE.length });
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
    const isTopLevelNav = req.mode === 'navigate' && req.destination === 'document';
    // Any page navigation inside the board's scope that isn't a cached file gets the board itself.
    let cached = await cache.match(req, { ignoreSearch: true });
    if (!cached && isTopLevelNav) cached = await cache.match('index.html');

    const network = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    });

    if (cached) {
      event.waitUntil(network.catch(() => {})); // refresh in the background
      return cached;
    }
    try {
      return await network;
    } catch (err) {
      if (req.mode === 'navigate') return new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
