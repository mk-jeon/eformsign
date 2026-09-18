// eformsign 서명 가이드 PWA service worker — 앱 셸 + 스크린샷 캐시 (오프라인 열람 가능)
const CACHE = "eformsign-guide-v3";
const SHELL = ["./", "./index.html", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  "./assets/s01.jpg","./assets/s02.jpg","./assets/s03.jpg","./assets/s04.jpg","./assets/s05.jpg","./assets/s06.jpg","./assets/s07.jpg","./assets/s08.jpg",
  "./assets/s09.jpg","./assets/s10.jpg","./assets/s12.jpg","./assets/s13.jpg","./assets/s14.jpg","./assets/s15.jpg","./assets/s16.jpg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // 앱 셸(HTML/JS)은 네트워크 우선 → 배포 갱신 즉시 반영, 실패 시 캐시
  if (url.origin === location.origin && (url.pathname.endsWith("/") || url.pathname.endsWith(".html"))) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok && url.origin === location.origin) { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return res; })));
});
