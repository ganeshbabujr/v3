/* ROI Visual Monitor - service worker (fixed)
 * Same-origin page/assets: network-first, cached copy used when offline.
 * Cross-origin CDN assets (Tailwind, Google Fonts): cache-first, checked BEFORE
 * the network because an opaque cross-origin response reports ok === false and
 * would therefore never be cached by a network-first path.
 * Never resolves with Response.error(): navigations get the cached shell instead.
 */
const CACHE_VERSION = 'roi-monitor-v3';
const NAV_FALLBACK = 'index.html';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function offlineResponse(request, cache) {
  if (request.mode === 'navigate') {
    return cache.match(NAV_FALLBACK, { ignoreSearch: true }).then(hit => hit || plainText(503, 'Offline - no cached copy available.'));
  }
  return plainText(503, 'Offline');
}

function plainText(status, body) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

function cacheIfStorable(request, response) {
  if (response && (response.ok || response.type === 'opaque')) {
    return caches.open(CACHE_VERSION).then(c => c.put(request, response.clone())).catch(() => {});
  }
  return Promise.resolve();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    if (!sameOrigin) {
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(request);
        cacheIfStorable(request, res);
        return res;
      } catch (_) {
        return offlineResponse(request, cache);
      }
    }

    try {
      const res = await fetch(request, { cache: 'no-store' });
      if (res && res.ok) cacheIfStorable(request, res);
      return res;
    } catch (_) {
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit && hit.status !== 206) return hit;
      return offlineResponse(request, cache);
    }
  })());
});
