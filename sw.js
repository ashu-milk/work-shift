/*
 * sw.js
 * シフトカレンダー作成アプリのService Worker。
 * ・Androidスマホ/タブレットのChromeで「アプリをインストール」できるようにする（PWA化）
 * ・アプリの全ファイルをあらかじめキャッシュし、オフラインでも起動できるようにする
 *
 * キャッシュの中身を更新したいときは CACHE_NAME のバージョン番号を上げてください。
 * （古いキャッシュは activate 時に自動で削除されます）
 */

const CACHE_NAME = "shift-calendar-app-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/templates.js",
  "./js/app.js",
  "./js/vendor/html2canvas.min.js",
  "./fonts/fonts.css",
  "./fonts/files/caveat-latin-400-normal.woff2",
  "./fonts/files/caveat-latin-600-normal.woff2",
  "./fonts/files/caveat-latin-700-normal.woff2",
  "./fonts/files/zen-maru-gothic-japanese-400-normal.woff2",
  "./fonts/files/zen-maru-gothic-japanese-500-normal.woff2",
  "./fonts/files/zen-maru-gothic-japanese-700-normal.woff2",
  "./fonts/files/zen-maru-gothic-japanese-900-normal.woff2",
  "./fonts/files/zen-maru-gothic-latin-400-normal.woff2",
  "./fonts/files/zen-maru-gothic-latin-500-normal.woff2",
  "./fonts/files/zen-maru-gothic-latin-700-normal.woff2",
  "./fonts/files/zen-maru-gothic-latin-900-normal.woff2",
  "./manifest.json",
  "./favicon.ico",
  "./icons/favicon-16.png",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先 → なければネットワーク → だめならindex.html（オフライン起動用）
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
