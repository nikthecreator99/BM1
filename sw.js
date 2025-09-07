/* Блокнот машиниста — безопасный Service Worker (network-first для HTML) */
const SW_VERSION = '28B';                         // Меняй при каждом релизе
const STATIC_CACHE = `bm-static-${SW_VERSION}`;
const HTML_CACHE   = `bm-html-${SW_VERSION}`;
const APP_SCOPE = (self.registration.scope || '/');

const STATIC_ASSETS = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'manifest.webmanifest'
].map(p => new URL(p, APP_SCOPE).toString());

// Установка: кэш статики + первичный index.html как fallback
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const sc = await caches.open(STATIC_CACHE);
    await sc.addAll(STATIC_ASSETS);
    try {
      const idx = new URL('index.html', APP_SCOPE).toString();
      const res = await fetch(idx, { cache: 'no-store' });
      const hc = await caches.open(HTML_CACHE);
      await hc.put(idx, res.clone());
    } catch(_) {}
    await self.skipWaiting();
  })());
});

// Активация: чистим старые кэши
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== STATIC_CACHE && k !== HTML_CACHE && (/^bm-(static|html)-/.test(k))) {
        return caches.delete(k);
      }
    }));
    await self.clients.claim();
  })());
});

// Сообщения от страницы
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'CLEAR_ALL') {
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
    })();
  }
});

// Fetch: HTML — network-first (таймаут 3с), статика — cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (!url.href.startsWith(APP_SCOPE)) return;

  // HTML / навигация
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirstHtml(url));
    return;
  }

  // Статика
  if (/\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

async function networkFirstHtml(url) {
  const htmlUrl = new URL('index.html', APP_SCOPE).toString();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  try {
    const fresh = await fetch(url.href, { cache: 'no-store', signal: controller.signal });
    clearTimeout(t);
    if (fresh.ok) {
      const hc = await caches.open(HTML_CACHE);
      await hc.put(htmlUrl, fresh.clone());
    }
    return fresh;
  } catch (_) {
    clearTimeout(t);
    const hc = await caches.open(HTML_CACHE);
    const fallback = await hc.match(htmlUrl);
    return fallback || new Response('<!doctype html><title>Offline</title><h1>Нет сети</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const net = await fetch(req);
    const sc = await caches.open(STATIC_CACHE);
    sc.put(req, net.clone());
    return net;
  } catch (_) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}
