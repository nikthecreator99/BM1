/* Блокнот Машиниста · Lite — SW v2025.32 */
const SW_VERSION = '2025.32.0';
const CACHE_NAME = `bm-lite-cache-${SW_VERSION}`;

/* Список ключевых файлов (формируем от scope, чтобы работало на GitHub Pages / подпапке) */
const toURL = (p) => new URL(p, self.registration.scope).toString();
const CORE_ASSETS = [
  toURL('index.html'),
  toURL('manifest.webmanifest'),
  toURL('sw.js'),
  // иконки из манифеста/HTML
  toURL('apple-touch-icon.png?v=202532'),
  toURL('apple-touch-icon-180x180.png?v=202532'),
  toURL('apple-touch-icon-167x167.png?v=202532'),
  toURL('apple-touch-icon-152x152.png?v=202532'),
  toURL('icon-192.png?v=202532'),
  toURL('icon-512.png?v=202532'),
  toURL('maskable-512.png?v=202532')
];

/* install: кешируем базу */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* activate: чистим старые кеши */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

/* message: поддерживаем SKIP_WAITING из appUpdate() */
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* fetch:
   - навигация: network-first (если оффлайн — из кеша)
   - остальное: stale-while-revalidate (отдаём из кеша, параллельно обновляем) */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Игнорим другие домены
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    // запасной вариант: отдать index.html (SPA fallback)
    const fallback = await cache.match(toURL('index.html'));
    return fallback || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((resp) => {
      cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => null);

  return cached || network || Response.error();
}
