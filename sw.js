// sw.js — PWA cache, v2025.32
const V = 'v2025.32';
const CACHE_STATIC = `static-${V}`;
const CORE_ASSETS = [
  '/',                    // навигации на GitHub Pages
  '/index.html',          // сам файл
  '/sw.js',
  '/manifest.webmanifest',
  // иконки PWA (как в твоём index.html)
  '/apple-touch-icon.png?v=202532',
  '/apple-touch-icon-180x180.png?v=202532',
  '/apple-touch-icon-167x167.png?v=202532',
  '/apple-touch-icon-152x152.png?v=202532',
];

// Быстрый апдейт по сообщению из страницы
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Установка: прогреваем базовые файлы
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Активация: чистим старые версии и сразу берём контроль
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => ![CACHE_STATIC].includes(k))
        .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Стратегии:
// 1) Навигации и index.html — network-first (с офлайн-резервом из кэша)
// 2) Статика (css/js/png/webmanifest и т.п.) — cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Обрабатываем только этот же источник (GitHub Pages твоего репо)
  if (url.origin !== self.location.origin) return;

  // Навигации (SPA переходы) и index.html -> network-first
  const isNavigation = req.mode === 'navigate';
  const isIndex = url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (isNavigation || isIndex) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/') || caches.match('/index.html'))
    );
    return;
  }

  // Остальная статика -> cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Кэшируем только успешные GET
        if (req.method === 'GET' && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
