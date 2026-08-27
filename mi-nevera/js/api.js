/* =========================================================
   API.JS
   Toda la comunicación con el backend (Google Apps Script)
   pasa por aquí. El frontend NUNCA habla directo con
   Google Sheets.
   ========================================================= */

const Api = {

  urlBase() {
    const config = ConfigUsuario.cargar();
    return config.apiUrl || CONFIG.API_URL;
  },

  urlConfigurada() {
    const url = this.urlBase();
    return !!url && url.startsWith("http");
  },

  /**
   * Apps Script Web Apps no soportan bien preflight CORS con
   * cabeceras JSON personalizadas, así que usamos
   * "text/plain" como Content-Type en el POST (Apps Script lo
   * parsea igual con JSON.parse(e.postData.contents)), lo que
   * evita el preflight y funciona de forma confiable desde
   * GitHub Pages.
   */
  async _post(accion, datos = {}) {
    if (!this.urlConfigurada()) {
      throw new ApiError("La URL de Google Apps Script no está configurada. Ve a Configuración > Avanzado.");
    }
    const cuerpo = JSON.stringify({ accion, ...datos });
    let respuesta;
    try {
      respuesta = await fetch(this.urlBase(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: cuerpo,
        redirect: "follow"
      });
    } catch (e) {
      throw new ApiError("No fue posible conectar con Google Sheets. Comprueba tu conexión a Internet.");
    }
    return this._procesarRespuesta(respuesta);
  },

  async _get(parametros = {}) {
    if (!this.urlConfigurada()) {
      throw new ApiError("La URL de Google Apps Script no está configurada. Ve a Configuración > Avanzado.");
    }
    const params = new URLSearchParams(parametros);
    let respuesta;
    try {
      respuesta = await fetch(`${this.urlBase()}?${params.toString()}`, {
        method: "GET",
        redirect: "follow"
      });
    } catch (e) {
      throw new ApiError("No fue posible conectar con Google Sheets. Comprueba tu conexión a Internet.");
    }
    return this._procesarRespuesta(respuesta);
  },

  async _procesarRespuesta(respuesta) {
    if (!respuesta.ok) {
      throw new ApiError(`El servidor respondió con un error (${respuesta.status}).`);
    }
    let json;
    try {
      json = await respuesta.json();
    } catch (e) {
      throw new ApiError("La respuesta del servidor no tiene un formato válido.");
    }
    if (!json.success) {
      throw new ApiError(json.message || "Ocurrió un error desconocido.", json.error);
    }
    return json.data;
  },

  /* ---------------- Endpoints ---------------- */

  obtenerTodo() {
    return this._get({ tipo: "todo" });
  },

  obtenerPendientes() {
    return this._get({ tipo: "pendientes" });
  },

  obtenerComprados() {
    return this._get({ tipo: "comprados" });
  },

  obtenerCategorias() {
    return this._get({ tipo: "categorias" });
  },

  obtenerEstadisticas() {
    return this._get({ tipo: "estadisticas" });
  },

  obtenerConfiguracion() {
    return this._get({ tipo: "configuracion" });
  },

  agregarProducto(producto) {
    return this._post("agregarProducto", { producto });
  },

  actualizarProducto(id, cambios) {
    return this._post("actualizarProducto", { id, cambios });
  },

  marcarComprado(id) {
    return this._post("marcarComprado", { id });
  },

  marcarPendiente(id) {
    return this._post("marcarPendiente", { id });
  },

  eliminarProducto(id) {
    return this._post("eliminarProducto", { id });
  },

  guardarConfiguracion(config) {
    return this._post("guardarConfiguracion", { config });
  }
};

class ApiError extends Error {
  constructor(mensaje, detalle) {
    super(mensaje);
    this.name = "ApiError";
    this.detalle = detalle;
  }
}
