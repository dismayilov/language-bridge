// MyNextLanguage — Service Worker
// Strategy:
//   • App shell (index.html)        → network-first, fallback to cache
//   • TopoJSON world atlas           → cache-first (large static asset, rarely changes)
//   • Other CDN scripts/styles       → cache-first with background revalidation
//   • Everything else                → network-only (pass-through)

// IMPORTANT: bump this string whenever you ship JS/CSS/JSON changes so
// returning visitors get a fresh cache. The activate handler deletes any
// cache whose key !== CACHE_VERSION.
const CACHE_VERSION = 'mnl-v18-d3-full-bundle';

// Assets to pre-fetch during install so the map works immediately on next open
const CDN_PRECACHE = [
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js',
];

// CDN hostnames that get cache-first treatment (versioned / content-addressed)
const CACHE_FIRST_HOSTS = [
  'cdn.jsdelivr.net',
  'cdn.tailwindcss.com',
  'unpkg.com',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  // Do NOT call skipWaiting() automatically — the page will send a
  // SKIP_WAITING message when the user clicks "Update now" in the banner.
  // This lets the update banner detect reg.waiting and prompt the user.

  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      // Cache the app shell — must succeed, block install if it fails
      await cache.add('/');

      // Best-effort pre-cache of CDN assets (don't fail install if offline)
      await Promise.allSettled(
        CDN_PRECACHE.map(url =>
          fetch(new Request(url, { mode: 'cors', credentials: 'omit' }))
            .then(res => {
              if (res.ok) cache.put(url, res);
            })
            .catch(() => { /* offline during install — will be cached on first use */ })
        )
      );
    })
  );
});

// ── Message: page requests skip-waiting (triggered by the update banner) ────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())  // take over all open tabs immediately
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests and browser-extension / chrome-extension requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ── Cache-first for versioned CDN assets ──────────────────────────────────
  if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ── Network-first for the app shell (same origin) ─────────────────────────
  // Serves fresh HTML when online; falls back to the cached version offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── Pass-through for everything else ─────────────────────────────────────
  // (analytics, newsletter endpoint, external links — don't cache these)
});
