// 서비스워커: 오프라인 캐시 지원
// 캐시 버전과 파일 목록은 아래 상수에서 쉽게 수정하세요.
// (파일을 수정한 뒤에는 CACHE_NAME 버전을 v2, v3 ... 으로 올려야 새 내용이 반영됩니다.)
const CACHE_NAME = "travel-planner-v6";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// 설치 시 파일 캐시
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

// 오래된 캐시 정리
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// fetch 핸들러: 캐시 우선, 없으면 네트워크, 오프라인 시 index.html
// (지도 등 외부 도메인 요청은 캐시하지 않고 네트워크로 그대로 통과)
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // 외부 지도/검색은 통과
  e.respondWith(
    caches.match(e.request).then((res) =>
      res || fetch(e.request).catch(() => caches.match("./index.html"))
    )
  );
});
