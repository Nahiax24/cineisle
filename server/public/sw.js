const CACHE = "cineisle-pwa-v0.4.3";
const ASSETS = ["/", "/app.css?v=0.4.3", "/app.js?v=0.4.3", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/mcp")) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match("/"))));
});
