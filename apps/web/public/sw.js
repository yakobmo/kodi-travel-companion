const CACHE_NAME = "kodi-travel-companion-v2";
const APP_SHELL = ["/manifest.webmanifest", "/kodi-icon.svg", "/icons/kodi-192.png", "/icons/kodi-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response("Kodi needs a network connection to load the latest app.", {
            headers: { "content-type": "text/plain; charset=utf-8" },
            status: 503
          })
      )
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          request.url.startsWith(self.location.origin) &&
          !request.url.includes("/api/") &&
          !request.headers.get("accept")?.includes("text/html")
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }

        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
