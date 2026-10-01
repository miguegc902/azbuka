/* Азбука: guarda la app en el teléfono para que funcione sin conexión.
   Si cambias algún archivo, sube también este con VERSION aumentada (v2, v3...). */
const VERSION = "azbuka-v1";
const FONT_CACHE = "azbuka-fuentes-v1";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isFont(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fonts: from the phone first, from the internet only the first time
  if (isFont(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // The app itself: open instantly from the phone, refresh the copy in the background
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    const network = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (hit) {
      try { event.waitUntil(network); } catch (err) {}
      return hit;
    }
    const res = await network;
    if (res) return res;
    if (req.mode === "navigate") {
      const page = await cache.match("./index.html");
      if (page) return page;
    }
    return Response.error();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache-urls" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(FONT_CACHE).then((cache) =>
      Promise.all(
        data.urls
          .filter((u) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u))
          .map(async (u) => {
            try {
              if (await cache.match(u, { ignoreVary: true })) return;
              const res = await fetch(u, { mode: "cors", credentials: "omit" });
              if (res.ok) await cache.put(u, res);
            } catch (err) {}
          })
      )
    )
  );
});
