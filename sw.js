/* Bloknot Mashinista — SW v2025.30A */
const VERSION = 'v2025.30A';
const CACHE_NAME = `bm-cache-${VERSION}`;

/* Укажи здесь список «ядра» (app shell) — минимум index.html и манифест/иконки */
const CORE_ASSETS = [
  '/BM1-new/',
  '/BM1-new/index.html',
  '/BM1-new/manifest.webmanifest',
  '/BM1-new/apple-touch-icon.png?v=202530',
  '/BM1-new/apple-touch-icon-180x180.png?v=202530',
  '/BM1-new/apple-touch-icon-167x167.png?v=202530',
  '/BM1-new/apple-touch-icon-152x152.png?v=202530',
  '/BM1-new/icon-512.png?v=202530',
  '/BM1-new/icon-192.png?v=202530'
];

/* Ускоренный апдейт по сообщению из страницы */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* Установка: кладём «ядро» в кэш */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* Активация: чистим старые кэши и берём страницы под контроль */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k.startsWith('bm-cache-') && k !== CACHE_NAME) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

/* Навигации: network-first с фоллбеком на кешированный index.html (для оффлайна) */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Только GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Для навигации (страницы) — network first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        // Обновим кеш фоном
        const cache = await caches.open(CACHE_NAME);
        cache.put('/BM1-new/index.html', fresh.clone());
        return fresh;
      } catch (e) {
        // оффлайн: отдаём index.html из кэша как fallback
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('/BM1-new/index.html');
        return cached || new Response('Оффлайн: index.html не найден в кэше', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Для статических ресурсов из нашего origin — stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const netFetch = fetch(req).then(res => {
        // только успешные ответы кешируем
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      // Если есть кэш — отдаём сразу, сеть обновит его фоном
      return cached || netFetch || new Response('Оффлайн и нет кэша', { status: 503 });
    })());
    return;
  }

  // Внешние домены: просто пробуем сеть, без кэша (чтобы не ловить CORS-головную боль)
  event.respondWith(fetch(req).catch(() => new Response('Оффлайн', { status: 503 })));
});
