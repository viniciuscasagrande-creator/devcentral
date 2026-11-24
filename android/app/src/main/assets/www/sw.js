const CACHE_NAME = "devcentral-shell-v14";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/devcentral-192.png",
  "/devcentral-512.png",
  "/icon-192.png",
  "/icon-512.png",
  "/telemetria",
  "/relatorios",
  "/assistente",
  "/operacoes"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Segurança: não armazenar APIs ou respostas autenticadas em cache público.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("authorization")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // Navegação de páginas HTML: Network-first com fallback para cache offline mobile
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req))
    );
  }
});
