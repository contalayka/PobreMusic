// PobreMusic service worker.
// Keep the worker minimal: Pages already handles asset caching, while audio/API
// requests must remain network-first and should not be intercepted here.
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
