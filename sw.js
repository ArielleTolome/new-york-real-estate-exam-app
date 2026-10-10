// Offline-first app shell: everything is precached on install. Pages and data are network-first so fixes land at once,
// but a slow trail-side connection never stalls the app: after 3 s the cached copy is served while the fetch finishes
// in the background. Narrated MP3s live in their own cache ('nyre-audio', filled by views/listen.js on request) and
// are served from it with HTTP Range support, which audio elements need for seeking.
const CACHE = 'nyre-v8'; // bump to evict old precaches on activate
const AUDIO = 'nyre-audio'; // never evicted by a deploy; managed from the app
const ASSETS = [
  './', 'index.html', 'app.css', 'app.js', 'questions.json', 'guides.json', 'manifest.json', 'favicon.ico', 'audio/audio.json',
  'views/home.js', 'views/build.js', 'views/quiz.js', 'views/results.js', 'views/history.js', 'views/mistakes.js', 'views/more.js', 'views/study.js',
  'views/cards.js', 'views/search.js', 'views/listen.js', 'views/examday.js',
  'styles/home.css', 'styles/build.css', 'styles/quiz.css', 'styles/stats.css', 'styles/bank.css', 'styles/study.css',
  'styles/cards.css', 'styles/search.css', 'styles/listen.css', 'styles/examday.css',
  'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'icons/apple-touch-icon-152.png', 'icons/apple-touch-icon-167.png',
];
const SLOW_MS = 3000;

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser HTTP cache so a new deploy never precaches stale files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Saved audio, sliced to the requested byte range; anything not saved goes to the network untouched (never cached here,
// so a half-streamed file can't masquerade as a saved one).
async function audio(req) {
  const hit = await (await caches.open(AUDIO)).match(req.url);
  if (!hit) return fetch(req);
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (!range) return hit;
  const blob = await hit.blob();
  const size = blob.size;
  let start = range[1] === '' ? size - +range[2] : +range[1];
  let end = range[1] !== '' && range[2] !== '' ? +range[2] : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' },
  });
}

function shell(e) {
  const req = e.request;
  const cached = () => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./') : undefined));
  let put = Promise.resolve();
  const net = fetch(req).then((res) => {
    if (res.ok && res.status === 200) {
      const copy = res.clone();
      put = caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(net.then(() => put).catch(() => {})); // registered now, so the refresh may finish after we answer from cache
  const slow = new Promise((resolve) => setTimeout(resolve, SLOW_MS));
  return Promise.race([net, slow])
    .then((res) => res || cached().then((c) => c || net)) // slow network: cached copy now, fresh copy lands in the cache later
    .catch(() => cached());
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(url.pathname.endsWith('.mp3') ? audio(e.request) : shell(e));
});
