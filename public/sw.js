// Service worker minimal CalSnap — rend l'app installable et utilisable hors-ligne (coquille).
const CACHE = "calsnap-cache-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // on ne met jamais en cache les POST (ex. analyse photo)

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // on laisse passer les API externes (OFF, Gemini, Supabase)

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fallback = await caches.match("/");
        return fallback || Response.error();
      }
    })(),
  );
});
