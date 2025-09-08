const SW_VERSION = "2025.32";   // ↑ каждый релиз поднимаем версию

const APP_STATIC_CACHE = "bm-cache-" + SW_VERSION;

const APP_STATIC_RESOURCES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./apple-touch-icon.png?v=202532",
  "./apple-touch-icon-180x180.png?v=202532",
  "./apple-touch-icon-167x167.png?v=202532",
  "./apple-touch-icon-152x152.png?v=202532"
];

// Установка
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_STATIC_CACHE).then(cache => cache.addAll(APP_STATIC_RESOURCES))
  );
  self.skipWaiting();
});

// Активация
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith("bm-cache-") && k !== APP_STATIC_CACHE)
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Сеть с кэшем
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then(res => {
        const resClone = res.clone();
        caches.open(APP_STATIC_CACHE).then(cache => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// Быстрое обновление
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
