/* BM Lite SW v2025.30 — безопасная стратегия
   - HTML (navigate) -> сеть сперва, при офлайне — кешированный index.html
   - Остальные GET -> stale-while-revalidate
   - Чистка старых кешей, SKIP_WAITING поддержан
*/
const CACHE_VER = 'bm-lite-2025.30-v1';
const STATIC_CACHE = `static-${CACHE_VER}`;

const PRECACHE_URLS = [
  './',                 // навигация
  'index.html',         // для офлайн-фолбэка
  'manifest.webmanifest',
  'apple-touch-icon.png?v=202530',
  'apple-touch-icon-180x180.png?v=202530',
  'apple-touch-icon-167x167.png?v=202530',
  'apple-touch-icon-152x152.png?v=202530'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS);
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Навигационное предусиление (если доступно)
    try { if ('navigationPreload' in self.registration) await self.registration.navigationPreload.enable(); } catch(_){}
    // Чистим старые кеши
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Утилита: запрос с таймаутом
async function fetchWithTimeout(req, ms = 6000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(req, { signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Навигация/HTML — network-first с фолбэком на кешированный index.html
  const isNavigate = req.mode === 'navigate' || (req.destination === 'document') ||
                     (req.headers.get('accept') || '').includes('text/html');

  if (isNavigate) {
    event.respondWith((async () => {
      try {
        // попробуем то, что предзагрузил браузер (если включено)
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const net = await fetchWithTimeout(req, 8000);
        // Если ок — подменим кеш для офлайна
        const cache = await caches.open(STATIC_CACHE);
        cache.put('index.html', net.clone());
        return net;
      } catch (_) {
        // офлайн — отдаём кешированный index.html
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match('index.html');
        if (cached) return cached;
        // как крайний случай — просто пытаемся из кеша по URL
        const any = await caches.match(req);
        return any || new Response('<h1>Офлайн</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' }});
      }
    })());
    return;
  }

  // 2) Остальные GET (картинки/манифест/иконки) — stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || fetchPromise || new Response('', { status: 504 });
  })());
});
