const CACHE_NAME = 'grabb-green-v2.0';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css?v=2.0',
  '/app.js?v=2.0',
  '/manifest.json'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  // Force activate immediately on update
  self.skipWaiting();
});

// Activate Service Worker - claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch Assets (Offline Support)
self.addEventListener('fetch', (event) => {
  // Network-first strategy: always try network first, then cache
  // This ensures iOS gets fresh content when online
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache the fresh response
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});