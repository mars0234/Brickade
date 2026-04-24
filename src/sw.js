// Service Worker: network-first + offline fallback.
// 線上永遠最新版、離線時 PWA 仍能載入（單人模式可玩；對戰需要網路）。

const CACHE_NAME = 'jft-v12';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/game.js',
  '/ai_worker.js',
  '/tetris_ai.js',
  '/tetris_ai.wasm',
  '/changelog.js',
  '/images/favicon.ico',
  '/images/apple-touch-icon.png',
  '/images/android-chrome-192x192.png',
  '/images/android-chrome-512x512.png',
  '/images/site.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 跨域請求（Firebase / Google / 其他 CDN）一律放行，不介入
  if (url.origin !== self.location.origin) return;

  // 🎵 音訊檔不要 SW 攔截：iOS Safari 對 SW 回應的 audio 不支援 Range request，
  //    會導致 HTMLAudioElement 播到一半中斷、loop 失敗、reseek 失敗
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(url.pathname)) return;

  // Range request（影片 / 音訊串流）也直接交給瀏覽器處理
  if (req.headers.has('range')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => {
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('/index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      }))
  );
});

// 接收主頁 postMessage('SKIP_WAITING') 以便手動觸發更新
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
