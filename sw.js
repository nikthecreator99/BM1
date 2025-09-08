// Simple SW with versioned cache and skipWaiting handshake
const CACHE = 'bm-cache-v2025.31';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([
      './',
      './index.html',
      './manifest.webmanifest'
      // иконки добавишь при желании
    ]).catch(()=>{}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k===CACHE?null:caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // network-first для index.html, иначе — cache-first
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r=>{
        const cp = r.clone();
        caches.open(CACHE).then(c=>c.put('./', cp)).catch(()=>{});
        return r;
      }).catch(()=>caches.match('./'))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(cached=>{
      return cached || fetch(req).then(r=>{
        const cp = r.clone();
        caches.open(CACHE).then(c=>c.put(req, cp)).catch(()=>{});
        return r;
      }).catch(()=>cached);
    })
  );
});
