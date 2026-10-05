const CACHE = 'home-anchor-v1';

const SKIP_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseio.com',
  'api.emailjs.com',
  'api.anthropic.com',
];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (SKIP_HOSTS.some(h => url.hostname.includes(h))) return;

  // SPA navigation: network-first, offline fallback to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images): cache-first
  const isStatic = /\.(js|css|woff2?|ttf|svg|png|jpg|webp|ico)(\?.*)?$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE).then(c => c.put(request, response.clone()));
          }
          return response;
        });
      })
    );
  }
});
