// Service worker только для установки PWA (без оффлайн-кеша).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Пустой fetch-обработчик: SW считается валидным, но запросы идут в сеть как обычно.
self.addEventListener("fetch", () => {});
