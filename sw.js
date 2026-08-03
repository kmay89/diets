/**
 * sw.js — service worker. Precaches the whole app so it runs with no signal.
 *
 * Strategy:
 *   - app shell and data files: cache-first, revalidated in the background
 *   - navigations: network-first with a cached index.html fallback, so a new
 *     release is picked up quickly but a dead connection still opens the app
 *   - anything cross-origin: never cached, never intercepted
 *
 * ERRERLabs — MIT licensed.
 */

const VERSION = 'v2.2.0';
const CACHE = `errerlabs-diets-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/data.js',
  './js/store.js',
  './js/roll.js',
  './js/shopping.js',
  './js/nutrition.js',
  './js/views/member-card.js',
  './js/views/onboarding.js',
  './js/views/roll.js',
  './js/views/plan.js',
  './js/views/recipe.js',
  './js/views/pantry.js',
  './js/views/list.js',
  './js/views/garden.js',
  './js/views/settings.js',
  './js/views/why.js',
  './js/citations.js',
  './js/feedback.js',
  './js/occasions.js',
  './data/citations.json',
  './data/claims.json',
  './data/occasions.json',
  './js/share-page.js',
  './data/ingredients.json',
  './data/recipes.dinners.json',
  './data/recipes.daily.json',
  './data/recipes.occasions.json',
  './data/aisles.json',
  './data/garden.json',
  './data/graph.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './404.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if any single file 404s, so add
    // individually and let one missing optional asset go by.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch (err) {
        console.warn('[sw] could not precache', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // store links, nothing else

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) {
    // Refresh in the background; the next load gets the new copy.
    fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); }).catch(() => {});
    return hit;
  }
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('Offline and not cached.', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;

    // A shared recipe link opened with no signal: the static /r/<slug>/ page is
    // not precached (44 pages is a lot to carry for something only crawlers and
    // first-time visitors read), but the app itself is. Bounce into the app's
    // route for that recipe rather than dumping the visitor on the home screen.
    const slug = new URL(req.url).pathname.match(/^\/r\/([^/]+)\/?$/)?.[1];
    if (slug) {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Opening…</title>` +
        `<meta http-equiv="refresh" content="0; url=/#/recipe/rec.${slug}">` +
        `<link rel="canonical" href="/#/recipe/rec.${slug}">` +
        `<p>Opening this recipe… <a href="/#/recipe/rec.${slug}">continue</a></p>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    return (await cache.match('./index.html'))
      || new Response('Offline.', { status: 503 });
  }
}
