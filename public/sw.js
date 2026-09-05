/*
 * Service worker de Platinoob.
 *
 * Alcance deliberadamente chico. La app es toda contenido privado detrás de
 * sesión (biblioteca, trofeos, diario), así que este SW NO cachea HTML ni
 * respuestas de API: servir una página de otro usuario desde caché sería un
 * agujero de privacidad, y servir HTML viejo daría una app desactualizada sin
 * forma de darse cuenta.
 *
 * Lo único que cachea es `/_next/static/`, que tiene hash en el nombre y por
 * lo tanto es inmutable: nunca puede quedar "viejo", y hace que la app
 * instalada arranque rápido. Más una pantalla de offline para cuando el
 * celular se queda sin señal.
 *
 * Por eso este archivo casi no cambia entre deploys: la actualización de la
 * app la maneja `components/pwa/PwaRuntime.tsx` comparando el build id contra
 * `/api/version`, no una versión nueva del service worker.
 */

const CACHE = "platinoob-static-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload` para no guardar en caché lo que ya haya en la caché HTTP.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      // Sin esto, el SW nuevo espera a que se cierren todas las pestañas.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/**
 * El botón "Actualizar" de la app pide vaciar todo antes de recargar, para no
 * quedar con una mezcla de assets de dos versiones.
 *
 * Después de vaciar hay que volver a guardar la pantalla de offline: el
 * `install` no se vuelve a ejecutar (el service worker es el mismo), así que
 * sin esto la app se quedaba sin fallback para siempre después del primer
 * "Actualizar".
 */
self.addEventListener("message", (event) => {
  if (event.data !== "platinoob:clear-caches") return;
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      const cache = await caches.open(CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
    })(),
  );
});

function isImmutableAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Sólo GET: un POST es una Server Action o un login, nunca se toca.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Assets con hash: cache-first, son inmutables por definición.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navegaciones: siempre a la red (contenido privado y cambiante). Si no hay
  // conexión, la pantalla de offline en vez del dinosaurio del browser.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? Response.error();
      }),
    );
  }

  // Todo lo demás (API, imágenes de CDNs externas, Supabase) pasa derecho.
});
