self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => caches.delete(key)));
        })
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(fetch(e.request));
});
