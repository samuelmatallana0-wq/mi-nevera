/* =========================================================
   NOTIFICATIONS.JS
   Notificaciones del navegador (Web Notifications API).

   LIMITACIÓN REAL E IMPORTANTE:
   Un sitio estático en GitHub Pages puede pedir permiso y
   mostrar notificaciones LOCALES (mientras la pestaña/PWA
   está abierta o, en algunos sistemas operativos, mientras el
   Service Worker sigue vivo poco tiempo después). NO puede
   enviar "push" verdaderos con la app cerrada, porque eso
   requiere un servidor push (VAPID) que este proyecto no
   incluye, ya que no hay backend propio (solo Apps Script).

   Para recordatorios reales con la app cerrada, la única vía
   fiable en esta arquitectura es el correo electrónico enviado
   por triggers de Google Apps Script (ver Code.gs y README).
   ========================================================= */

const Notificaciones = {

  soportado() {
    return "Notification" in window;
  },

  permisoConcedido() {
    return this.soportado() && Notification.permission === "granted";
  },

  async pedirPermiso() {
    if (!this.soportado()) {
      UI.toast("Este navegador no soporta notificaciones.", "error");
      return false;
    }
    if (Notification.permission === "granted") {
      UI.toast("Las notificaciones ya estaban activadas.", "info");
      return true;
    }
    if (Notification.permission === "denied") {
      UI.toast("Bloqueaste las notificaciones para este sitio. Actívalas desde los ajustes del navegador.", "error");
      return false;
    }
    const resultado = await Notification.requestPermission();
    if (resultado === "granted") {
      UI.toast("Notificaciones activadas.", "exito");
      this.mostrar("🛒 Mi Nevera", "Así se verán tus notificaciones.");
      return true;
    }
    UI.toast("No se activaron las notificaciones.", "info");
    return false;
  },

  mostrar(titulo, cuerpo, opciones = {}) {
    if (!this.permisoConcedido()) return;
    try {
      new Notification(titulo, {
        body: cuerpo,
        icon: "assets/icons/icon-192.png",
        badge: "assets/icons/icon-192.png",
        ...opciones
      });
    } catch (e) {
      // Algunos navegadores móviles solo permiten notificaciones
      // disparadas por el Service Worker.
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(titulo, {
            body: cuerpo,
            icon: "assets/icons/icon-192.png",
            ...opciones
          });
        });
      }
    }
  },

  notificarResumenLocal(pendientes, altaPrioridad) {
    if (pendientes === 0) return;
    const texto = altaPrioridad > 0
      ? `Tienes ${pendientes} producto${pendientes !== 1 ? "s" : ""} pendiente${pendientes !== 1 ? "s" : ""}. 🔴 ${altaPrioridad} de alta prioridad.`
      : `Tienes ${pendientes} producto${pendientes !== 1 ? "s" : ""} pendiente${pendientes !== 1 ? "s" : ""}.`;
    this.mostrar("🛒 Recordatorio de compras", texto);
  }
};
