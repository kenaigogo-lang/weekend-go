const CACHE = "weekend-go-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./icon.svg",
  "./manifest.json",
  "./data/routes.json",
  "./data/events.json",
  "./data/venues.json",
  "./data/shows.json",
  "./data/night.json",
  "./data/visited.json",
  "./data/skipped.json",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first：有網路一律拿最新資料，地下停車場或山區沒訊號時才退回快取
self.addEventListener("fetch", (ev) => {
  if (ev.request.method !== "GET") return;
  const url = new URL(ev.request.url);
  if (url.origin !== self.location.origin) return;
  ev.respondWith(
    fetch(ev.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(ev.request, { ignoreSearch: true }))
  );
});
