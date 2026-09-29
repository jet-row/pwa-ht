// Halin-TecQ Service Worker
// Bump CACHE_NAME whenever the app shell changes to force a cache refresh.
const CACHE_NAME = 'halin-tecq-v1';

// The single HTML shell to pre-cache on install.
const SHELL = './halintecq_pwa_v02.html';

// CDN hosts whose assets are cached aggressively (content-addressed / versioned URLs).
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── Install ───────────────────────────────────────────────────────────────────
// Pre-cache the app shell so the app loads even with no network.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
// Delete caches from old versions so stale assets don't linger.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // CDN assets (fonts, icon webfont): cache-first.
  // These URLs are either versioned or immutable, so stale content is fine.
  if (CDN_HOSTS.some(h => url.hostname === h)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Same-origin requests (the app shell): stale-while-revalidate.
  // Serve the cached version instantly, then update the cache in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // All other cross-origin requests (Supabase API, etc.): let the browser
  // handle them normally — never cache live API responses.
});

// ── Strategies ───────────────────────────────────────────────────────────────

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Kick off a background network fetch to keep the cache fresh.
  const networkFetch = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  // Serve cached copy immediately; fall through to network if nothing cached yet.
  return cached ?? await networkFetch;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}
