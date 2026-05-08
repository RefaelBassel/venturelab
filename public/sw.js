// VentureLab service worker
//
// Minimal implementation. The fetch listener is required for Chrome to offer
// the install prompt. We do NOT cache anything — every request goes to the
// network. If you later want offline support, add caching here.

const SW_VERSION = 'venturelab-sw-v1';

self.addEventListener('install', () => {
  // Replace any older waiting SW immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of open pages right away
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Pass-through: do not call event.respondWith().
  // The browser will fall through to the network for every request.
  // Required-by-Chrome side effect: the presence of this listener
  // makes the page eligible for the PWA install banner.
});
