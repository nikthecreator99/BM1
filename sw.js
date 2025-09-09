/* sw.js — Блокнот Машиниста · Lite
   Версия кэша меняй при каждом релизе, чтобы обновления прилетали корректно.
*/
const SW_VERSION = 'v2025.33';
const CACHE_NAME = `bm-cache-${SW_VERSION}`;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',

  // Иконки PWA (подставь, если у тебя другие имена)
  './icon-192.png?v=202533',
  './icon-256.png?v=202533',
  './icon-384.png?v=202533',
  './icon-512.png?v=202533',

  // iOS touch-иконки (если лежат рядом — кэшируем тоже)
  './apple-touch-icon.png?v=202532',
  './apple-touch-icon-180x180.png?v=202532',
  './apple-touch-icon-167x167.png?v=202532',
  './apple-touch-icon-152x152.png?v=202532'
];

// Удобный помощник: пробуем получить index.html из сети, иначе — из кэша
async function networkFirstHtml(request) {
  try {
    const fresh = await fetch(request, { credentials: 'same-origin' });
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('./index.html') || await cache.match('./');
    if (cached) return cached;
    // если совсем пусто — возвращаем простой оффлайн-ответ
    return new Response('<h1>Оффлайн</h1><p>Страница не закеширована.</p>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 200
    });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    // сразу активируем новый SW
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // чистим старые кэши
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('bm-cache-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    // берём контроль над клиентами не дожидаясь перезагрузки
    await self.clients.claim();
  })());
});

// Сообщение от страницы — для кнопки «Обновить»
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Навигации (SPA): network-first с откатом на index.html из кэша
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Не трогаем методы кроме GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Навигационные запросы — это переходы между «страницами» SPA
  const isNavigation = req.mode === 'navigate' || (req.destination === 'document');

  if (isNavigation) {
    event.respondWith(networkFirstHtml('./index.html'));
    return;
  }

  // Только same-origin ресурсы кэшируем; сторонние — напрямую из сети
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) {
    // Можно добавить кэширование CDN при желании
    return;
  }

  // Примитивный stale-while-revalidate для статики (иконки/манифест и т.п.)
  if (STATIC_ASSETS.some(path => url.pathname.endsWith(path.replace('./', '/')))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then(resp => {
        cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || networkPromise || fetch(req);
    })());
    return;
  }

  // Остальные same-origin GET — cache-first с подкачкой
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) {
      // тихо обновим в фоне
      fetch(req).then(resp => cache.put(req, resp.clone())).catch(() => {});
      return cached;
    }
    try {
      const resp = await fetch(req);
      cache.put(req, resp.clone());
      return resp;
    } catch (e) {
      // если ничего нет — отдаём index.html, чтобы SPA жила оффлайн
      const fallback = await cache.match('./index.html') || await cache.match('./');
      return fallback || new Response('Offline', { status: 200 });
    }
  })());
});
