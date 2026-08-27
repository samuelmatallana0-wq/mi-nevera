/* =========================================================
   SERVICE-WORKER.JS
   Cachea el "app shell" para que la aplicación cargue incluso
   sin conexión. Los datos de productos NO se cachean aquí:
   eso lo maneja js/storage.js con localStorage, porque
   necesitamos leer/actualizar esos datos como JSON desde la
   propia app, no solo servirlos como respuesta de red.
   ========================================================= */

const CACHE_VERSION = "mi-nevera-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./js/config.js",
  "./js/storage.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/pdf.js",
  "./js/notifications.js",
  "./js/app.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(nombres =>
      Promise.all(
        nombres
          .filter(nombre => nombre !== CACHE_VERSION)
          .map(nombre => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Nunca interceptar llamadas al backend (Google Apps Script) ni a
  // dominios externos (fuentes, iconos, jsPDF): deben ir siempre a la red
  // para no servir datos ni librerías desactualizadas o incorrectas.
  if (
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("googleusercontent.com") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Estrategia "network first, cache fallback" para el app shell:
  // así, con conexión, siempre se sirve la versión más reciente;
  // sin conexión, se usa lo que haya en caché.
  event.respondWith(
    fetch(event.request)
      .then(respuesta => {
        const copia = respuesta.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request).then(res => res || caches.match("./index.html")))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("./index.html");
      }
    })
  );
});
