const STATIC_CACHE = "mp3-static-v2";
const RUNTIME_CACHE = "mp3-runtime-v2";
const SHARE_CACHE = "mp3-share-target-v1";
const SHARE_KEY = "/__share-target-stash__";
const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || Response.error();
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("audio");
    if (file && typeof file.arrayBuffer === "function") {
      const cache = await caches.open(SHARE_CACHE);
      const headers = new Headers({
        "Content-Type": file.type || "application/octet-stream",
        "X-Shared-File-Name": encodeURIComponent(file.name || "partage.mp3"),
      });
      await cache.put(SHARE_KEY, new Response(file, { headers }));
    }
  } catch {
    // ignore malformed share payloads
  }
  return Response.redirect("/share-target?shared=1", 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method === "POST") {
    const postUrl = new URL(request.url);
    if (postUrl.origin === self.location.origin && postUrl.pathname === "/share-target") {
      event.respondWith(handleShareTarget(request));
    }
    return;
  }

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  if (path.startsWith("/_next/")) return;
  if (path.startsWith("/api/")) return;

  const isAudioOrCover =
    path.startsWith("/Audio/") ||
    path.startsWith("/audio/") ||
    path.startsWith("/Cover/") ||
    path.startsWith("/cover/") ||
    path.startsWith("/Covers/") ||
    path.startsWith("/covers/");

  if (isAudioOrCover) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match("/")) || Response.error();
        })
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;

  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((cache) =>
      Promise.all(
        data.urls.map(async (url) => {
          try {
            const existing = await cache.match(url);
            if (existing) return;
            const response = await fetch(url);
            if (response && response.status === 200) {
              await cache.put(url, response);
            }
          } catch {
            // ignore individual failures (offline, missing file, etc.)
          }
        })
      )
    )
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || ".mp3";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return null;
    })
  );
});
