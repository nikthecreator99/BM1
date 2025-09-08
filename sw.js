/* Блокнот Машиниста · SW — офлайн/кэш + кнопка «Обновить» */
const SW_VERSION = '2025.29A';
const CACHE_NAME = `bm-lite-${SW_VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js',
  // иконки (если их нет — просто убери строки)
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png?v=202529A',
  './apple-touch-icon-180x180.png?v=202529A',
  './apple-touch-icon-167x167.png?v=202529A',
  './apple-touch-icon-152x152.png?v=202529A'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

/* Стратегии:
 * - Навигация (HTML): Network-First → Cache (офлайн)
 * - Остальное: Cache-First (stale-while-revalidate light)
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Только GET кэшируем
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === location.origin;

  // Навигация (SPA/страницы)
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        // фоновое обновление кэша index
        const cache = await caches.open(CACHE_NAME);
        cache.put('./', fresh.clone());
        return fresh;
      } catch {
        // офлайн — пробуем кэш
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('./') || await cache.match('/index.html') || await cache.match('index.html');
        return cached || new Response('<h1>Оффлайн</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Остальные запросы (иконки/манифест/локальные файлы)
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        // SWR: обновим в фоне
        fetch(request).then(resp => { if (resp && resp.ok) cache.put(request, resp.clone()); }).catch(()=>{});
        return cached;
      }
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline cache miss' });
      }
    })());
  }
});

// Обработка команды «Обновиться» от страницы
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
