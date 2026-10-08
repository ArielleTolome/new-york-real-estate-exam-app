// Precache the whole app; network-first so question fixes land immediately, cache when offline.
const CACHE = 'nyre-v6'; // bump to evict old precaches on activate
const ASSETS = [
  './', 'index.html', 'app.css', 'app.js', 'questions.json', 'guides.json', 'manifest.json', 'favicon.ico',
  'views/home.js', 'views/build.js', 'views/quiz.js', 'views/results.js', 'views/history.js', 'views/mistakes.js', 'views/more.js', 'views/study.js',
  'styles/home.css', 'styles/build.css', 'styles/quiz.css', 'styles/stats.css', 'styles/bank.css', 'styles/study.css',
  'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'icons/apple-touch-icon-152.png', 'icons/apple-touch-icon-167.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser HTTP cache so a new deploy never precaches stale files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
