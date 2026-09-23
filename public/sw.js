// PobreMusic Service Worker - Background Audio & PWA Support
const CACHE_NAME = 'pobremusic-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  // Let network handle audio streams and dynamic requests directly
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('audius.co') ||
    event.request.url.includes('googlevideo.com') ||
    event.request.url.includes('spotify.com')
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
