/* =========================================================
   STORAGE.JS
   Manejo de caché local (localStorage) para modo offline.
   Google Sheets sigue siendo la única base de datos "real";
   esto solo mejora la experiencia sin conexión.
   ========================================================= */

const Storage = {

  /** Guarda el último snapshot de productos recibido del servidor. */
  guardarProductos(productos) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
        productos,
        actualizado: new Date().toISOString()
      }));
    } catch (e) {
      console.error("No se pudo guardar caché local:", e);
    }
  },

  /** Recupera el último snapshot guardado (o null si no hay). */
  obtenerProductos() {
    try {
      const crudo = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!crudo) return null;
      return JSON.parse(crudo);
    } catch (e) {
      console.error("No se pudo leer caché local:", e);
      return null;
    }
  },

  limpiarTodo() {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    localStorage.removeItem(CONFIG.STORAGE_COLA_KEY);
  },

  /* ---------------- Cola de sincronización (modo offline) ---------------- */
  // Cada elemento: { id, tipo: 'agregar'|'actualizar'|'comprar'|'eliminar'|'restaurar', payload, creado }

  obtenerCola() {
    try {
      const crudo = localStorage.getItem(CONFIG.STORAGE_COLA_KEY);
      return crudo ? JSON.parse(crudo) : [];
    } catch (e) {
      return [];
    }
  },

  guardarCola(cola) {
    localStorage.setItem(CONFIG.STORAGE_COLA_KEY, JSON.stringify(cola));
  },

  agregarACola(accion) {
    const cola = this.obtenerCola();
    cola.push({ ...accion, creado: new Date().toISOString() });
    this.guardarCola(cola);
  },

  vaciarCola() {
    this.guardarCola([]);
  },

  tamanoCola() {
    return this.obtenerCola().length;
  }
};
