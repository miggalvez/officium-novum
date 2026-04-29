/* Officium Novum demo service worker.
 * Strategy: app shell precache + stale-while-revalidate for /api/v1.
 */

const APP_SHELL_VERSION = 'v1';
const APP_SHELL_CACHE = `app-shell-${APP_SHELL_VERSION}`;
const API_CACHE = 'api-runtime-v1';

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith('app-shell-') && key !== APP_SHELL_CACHE) ||
              (key.startsWith('api-runtime-') && key !== API_CACHE)
          )
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/v1/')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstAppShell(request));
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache-week') {
    return;
  }
  const urls = Array.isArray(data.urls) ? data.urls.filter((u) => typeof u === 'string') : [];
  event.waitUntil(prefetch(urls));
});

async function prefetch(urls) {
  const cache = await caches.open(API_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch {
        // ignore failures; offline / network issues are expected
      }
    })
  );
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || network;
}

async function networkFirstAppShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch (err) {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    const indexFallback = await cache.match('/index.html');
    if (indexFallback) {
      return indexFallback;
    }
    throw err;
  }
}
