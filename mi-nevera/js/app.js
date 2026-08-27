/* =========================================================
   APP.JS
   Orquestador principal: estado en memoria, filtros,
   búsqueda, eventos de la interfaz y sincronización con
   Google Apps Script (con cola offline).
   ========================================================= */

const Estado = {
  productos: [],       // snapshot completo (pendientes + comprados) tal como vino del servidor / caché
  categorias: [],
  filtroActivo: "pendientes",
  categoriaActiva: "todas",
  busqueda: "",
  ultimaSincronizacion: null,
  sincronizando: false,
  idParaEliminar: null,
  intervaloSyncId: null,
  intervaloRelojId: null
};

/* =========================================================
   INICIALIZACIÓN
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  iniciarApp();
});

async function iniciarApp() {
  const config = ConfigUsuario.cargar();
  document.getElementById("nombre-app").textContent = config.appName || CONFIG.APP_NAME;
  document.getElementById("nombre-hogar").textContent = config.homeName || CONFIG.HOME_NAME;
  document.title = `${config.appName || CONFIG.APP_NAME} · Lista de Compras`;
  if (config.modoOscuro) document.body.classList.add("oscuro");

  // Espera a que lucide esté disponible antes de crear iconos
  await esperarLucide();
  UI.refrescarIconos();

  mostrarSaludoSiCorresponde();

  UI.actualizarRelojEncabezado();
  Estado.intervaloRelojId = setInterval(() => UI.actualizarRelojEncabezado(), 30000);

  registrarEventos();
  registrarServiceWorker();

  // Categorías por defecto mientras llega la respuesta del servidor
  Estado.categorias = CONFIG.CATEGORIAS_DEFECTO.map(c => c.nombre);
  UI.renderizarChipsCategorias(Estado.categorias, Estado.categoriaActiva);
  llenarSelectorCategorias(Estado.categorias);

  UI.mostrarSkeletons();
  UI.textoCarga("Cargando tu nevera…");

  await cargarDatosIniciales();

  UI.ocultarPantallaCarga();

  // Sincronización periódica
  const segundos = Number(config.intervaloSync) || (CONFIG.INTERVALO_SYNC_MS / 1000);
  Estado.intervaloSyncId = setInterval(() => sincronizar({ silencioso: true }), segundos * 1000);

  window.addEventListener("online", alRecuperarConexion);
  window.addEventListener("offline", () => UI.estadoSync("error", "Sin conexión"));
}

function esperarLucide() {
  return new Promise(resolve => {
    if (window.lucide) return resolve();
    let intentos = 0;
    const id = setInterval(() => {
      intentos++;
      if (window.lucide || intentos > 40) {
        clearInterval(id);
        resolve();
      }
    }, 50);
  });
}

function mostrarSaludoSiCorresponde() {
  const bloque = document.getElementById("bloque-saludo");
  const texto = document.getElementById("saludo-texto");
  const hora = new Date().getHours();
  let saludo = "Buenas noches 👋";
  if (hora >= 5 && hora < 12) saludo = "Buenos días 👋";
  else if (hora >= 12 && hora < 19) saludo = "Buenas tardes 👋";

  // Solo se muestra el bloque de bienvenida si venimos de un acceso
  // "directo" (NFC, marcador o PWA instalada), no en cada recarga manual.
  const esEntradaDirecta =
    new URLSearchParams(location.search).has("origen") ||
    window.matchMedia("(display-mode: standalone)").matches ||
    !document.referrer;

  if (esEntradaDirecta) {
    texto.textContent = saludo;
    bloque.classList.remove("oculto");
    setTimeout(() => bloque.classList.add("oculto"), 6000);
  }
}

/* =========================================================
   CARGA Y SINCRONIZACIÓN DE DATOS
   ========================================================= */

async function cargarDatosIniciales() {
  // 1. Pintar de inmediato lo que haya en caché (si existe) para
  //    que la app se sienta instantánea, incluso sin red.
  const cache = Storage.obtenerProductos();
  if (cache && cache.productos && cache.productos.length) {
    Estado.productos = cache.productos;
    Estado.ultimaSincronizacion = new Date(cache.actualizado);
    aplicarFiltrosYRenderizar();
  }

  await sincronizar({ silencioso: !!cache });
}

async function sincronizar({ silencioso = false } = {}) {
  if (Estado.sincronizando) return;
  Estado.sincronizando = true;
  if (!silencioso) UI.mostrarSkeletons();
  UI.estadoSync("cargando", "Sincronizando…");

  try {
    // Primero, si hay cambios offline pendientes, se envían.
    await procesarColaOffline();

    if (!Api.urlConfigurada()) {
      UI.estadoSync("error", "Configura la URL de Apps Script");
      if (!Estado.productos.length) {
        UI.toast("Falta configurar la URL de Google Apps Script en Configuración.", "error");
      }
      Estado.sincronizando = false;
      return;
    }

    const datos = await Api.obtenerTodo();
    Estado.productos = datos.productos || [];
    Estado.categorias = (datos.categorias && datos.categorias.length)
      ? datos.categorias
      : CONFIG.CATEGORIAS_DEFECTO.map(c => c.nombre);

    Storage.guardarProductos(Estado.productos);
    Estado.ultimaSincronizacion = new Date();

    UI.renderizarChipsCategorias(Estado.categorias, Estado.categoriaActiva);
    llenarSelectorCategorias(Estado.categorias);
    aplicarFiltrosYRenderizar();

    UI.estadoSync("ok", `Sincronizado hace un momento`);
    actualizarTextoSyncPeriodicamente();

    if (!silencioso) UI.toast("Lista sincronizada", "exito");
  } catch (e) {
    console.error(e);
    UI.estadoSync("error", "Sin conexión");
    if (!silencioso) {
      UI.toast(e instanceof ApiError ? e.message : "No fue posible conectar con Google Sheets.", "error");
    }
    // Si no hay nada en pantalla, al menos mostrar el estado vacío.
    if (!Estado.productos.length) {
      UI.renderizarListado([]);
    }
  } finally {
    Estado.sincronizando = false;
  }
}

let _intervaloTextoSync = null;
function actualizarTextoSyncPeriodicamente() {
  if (_intervaloTextoSync) clearInterval(_intervaloTextoSync);
  _intervaloTextoSync = setInterval(() => {
    if (!Estado.ultimaSincronizacion) return;
    const el = document.getElementById("estado-sync-texto");
    const estadoEl = document.getElementById("estado-sync");
    if (!el || !estadoEl.classList.contains("ok")) return;
    el.textContent = `Actualizado ${UI.tiempoRelativo(Estado.ultimaSincronizacion.toISOString())}`;
  }, 5000);
}

async function alRecuperarConexion() {
  UI.toast("Conexión restaurada", "info");
  await sincronizar({ silencioso: true });
}

/* ---------------- Cola offline ---------------- */

async function procesarColaOffline() {
  if (!navigator.onLine || !Api.urlConfigurada()) return;
  const cola = Storage.obtenerCola();
  if (!cola.length) return;

  const restantes = [];
  for (const accion of cola) {
    try {
      await ejecutarAccionRemota(accion);
    } catch (e) {
      console.error("No se pudo sincronizar una acción pendiente:", accion, e);
      restantes.push(accion);
    }
  }
  Storage.guardarCola(restantes);
  if (restantes.length === 0 && cola.length > 0) {
    UI.toast("Cambios pendientes sincronizados", "exito");
  }
}

async function ejecutarAccionRemota(accion) {
  switch (accion.tipo) {
    case "agregar": return Api.agregarProducto(accion.payload);
    case "actualizar": return Api.actualizarProducto(accion.payload.id, accion.payload.cambios);
    case "comprar": return Api.marcarComprado(accion.payload.id);
    case "restaurar": return Api.marcarPendiente(accion.payload.id);
    case "eliminar": return Api.eliminarProducto(accion.payload.id);
    default: return Promise.resolve();
  }
}

/** Ejecuta una acción contra el servidor; si falla por conexión, la encola para más tarde. */
async function ejecutarConRespaldoOffline(tipo, payload, accionLocal) {
  // Aplicar cambio local optimista de inmediato
  accionLocal();
  aplicarFiltrosYRenderizar();
  Storage.guardarProductos(Estado.productos);

  if (!navigator.onLine || !Api.urlConfigurada()) {
    Storage.agregarACola({ tipo, payload });
    UI.toast("Sin conexión: se guardó localmente y se sincronizará luego.", "info");
    UI.estadoSync("error", "Sin conexión");
    return;
  }

  try {
    await ejecutarAccionRemota({ tipo, payload });
  } catch (e) {
    console.error(e);
    Storage.agregarACola({ tipo, payload });
    UI.toast("No se pudo guardar en Google Sheets ahora. Se reintentará automáticamente.", "error");
  }
}

/* =========================================================
   FILTROS, BÚSQUEDA Y RENDERIZADO
   ========================================================= */

function aplicarFiltrosYRenderizar() {
  let lista = [...Estado.productos];

  // Filtro por categoría
  if (Estado.categoriaActiva !== "todas") {
    lista = lista.filter(p => p.categoria === Estado.categoriaActiva);
  }

  // Filtro principal
  switch (Estado.filtroActivo) {
    case "pendientes":
      lista = lista.filter(p => p.estado === "Pendiente");
      break;
    case "comprados":
      lista = lista.filter(p => p.estado === "Comprado");
      break;
    case "alta":
      lista = lista.filter(p => p.estado === "Pendiente" && p.prioridad === "Alta");
      break;
    case "antiguos": {
      const dias = ConfigUsuario.cargar().diasAntiguo || CONFIG.DIAS_ANTIGUO;
      lista = lista.filter(p => p.estado === "Pendiente" && UI.diasPendiente(p.fechaAgregado) >= dias);
      break;
    }
    case "recientes":
      lista = lista.filter(p => p.estado === "Pendiente");
      lista.sort((a, b) => new Date(b.fechaAgregado) - new Date(a.fechaAgregado));
      break;
    case "todos":
    default:
      break;
  }

  // Búsqueda
  if (Estado.busqueda.trim()) {
    const q = Estado.busqueda.trim().toLowerCase();
    lista = lista.filter(p =>
      (p.producto || "").toLowerCase().includes(q) ||
      (p.categoria || "").toLowerCase().includes(q) ||
      (p.nota || "").toLowerCase().includes(q)
    );
  }

  // Orden: prioridad (Alta > Media > Baja) y luego antigüedad, salvo en "recientes"
  if (Estado.filtroActivo !== "recientes") {
    const orden = { Alta: 0, Media: 1, Baja: 2 };
    lista.sort((a, b) => {
      const diffPrioridad = (orden[a.prioridad] ?? 1) - (orden[b.prioridad] ?? 1);
      if (diffPrioridad !== 0) return diffPrioridad;
      return new Date(a.fechaAgregado) - new Date(b.fechaAgregado);
    });
  }

  UI.renderizarListado(lista);
  UI.actualizarResumen(Estado.productos);
  UI.actualizarSugerencias(Estado.productos);
}

function llenarSelectorCategorias(categorias) {
  const select = document.getElementById("campo-categoria");
  select.innerHTML = categorias.map(c => {
    const nombre = typeof c === "string" ? c : c.nombre;
    return `<option value="${nombre}">${nombre}</option>`;
  }).join("");
}

/* =========================================================
   EVENTOS DE LA INTERFAZ
   ========================================================= */

function registrarEventos() {
  // Chips de filtro
  document.getElementById("chips-filtros").addEventListener("click", e => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    document.querySelectorAll("#chips-filtros .chip").forEach(c => c.classList.remove("activo"));
    btn.classList.add("activo");
    Estado.filtroActivo = btn.dataset.filtro;
    aplicarFiltrosYRenderizar();
  });

  // Chips de categoría
  document.getElementById("chips-categorias").addEventListener("click", e => {
    const btn = e.target.closest(".chip-cat");
    if (!btn) return;
    document.querySelectorAll("#chips-categorias .chip-cat").forEach(c => c.classList.remove("activo"));
    btn.classList.add("activo");
    Estado.categoriaActiva = btn.dataset.cat;
    aplicarFiltrosYRenderizar();
  });

  // Buscador
  let debounceBusqueda;
  document.getElementById("buscador").addEventListener("input", e => {
    clearTimeout(debounceBusqueda);
    debounceBusqueda = setTimeout(() => {
      Estado.busqueda = e.target.value;
      aplicarFiltrosYRenderizar();
    }, 150);
  });

  // Botón "Ver lista de compras"
  document.getElementById("btn-lista-compras").addEventListener("click", () => {
    document.querySelectorAll("#chips-filtros .chip").forEach(c => c.classList.remove("activo"));
    document.querySelector('#chips-filtros [data-filtro="pendientes"]').classList.add("activo");
    Estado.filtroActivo = "pendientes";
    Estado.categoriaActiva = "todas";
    document.querySelectorAll("#chips-categorias .chip-cat").forEach(c => c.classList.remove("activo"));
    document.querySelector('#chips-categorias [data-cat="todas"]').classList.add("activo");
    aplicarFiltrosYRenderizar();
    document.getElementById("listado").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Botón sincronizar
  document.getElementById("btn-sincronizar").addEventListener("click", async e => {
    e.currentTarget.classList.add("girando");
    await sincronizar();
    setTimeout(() => e.currentTarget.classList.remove("girando"), 800);
  });

  // Modo nevera
  document.getElementById("btn-modo-nevera").addEventListener("click", () => {
    document.body.classList.toggle("modo-nevera");
    const activo = document.body.classList.contains("modo-nevera");
    UI.toast(activo ? "Modo Nevera activado" : "Modo Nevera desactivado", "info");
  });

  // PDF
  document.getElementById("btn-pdf").addEventListener("click", generarPdf);

  // FAB agregar
  document.getElementById("btn-agregar-flotante").addEventListener("click", () => abrirModalAgregar());

  // Delegación de acciones sobre tarjetas
  document.getElementById("listado").addEventListener("click", e => {
    const btn = e.target.closest(".accion-btn");
    if (!btn) return;
    const id = btn.dataset.id;
    const accion = btn.dataset.accion;
    if (accion === "comprar") marcarComoComprado(id);
    if (accion === "restaurar") marcarComoPendiente(id);
    if (accion === "editar") abrirModalEditar(id);
    if (accion === "eliminar") pedirConfirmacionEliminar(id, btn.dataset.nombre);
  });

  // Modal producto
  document.getElementById("btn-cerrar-modal-producto").addEventListener("click", () => UI.cerrarModal("modal-producto"));
  document.getElementById("btn-cancelar-producto").addEventListener("click", () => UI.cerrarModal("modal-producto"));
  document.getElementById("modal-producto").addEventListener("click", e => {
    if (e.target.id === "modal-producto") UI.cerrarModal("modal-producto");
  });
  document.getElementById("form-producto").addEventListener("submit", guardarProducto);

  document.getElementById("selector-prioridad").addEventListener("click", e => {
    const btn = e.target.closest(".prioridad-btn");
    if (!btn) return;
    document.querySelectorAll(".prioridad-btn").forEach(b => b.classList.remove("activo"));
    btn.classList.add("activo");
    document.getElementById("campo-prioridad").value = btn.dataset.valor;
  });

  // Modal confirmar
  document.getElementById("btn-cancelar-confirmar").addEventListener("click", () => UI.cerrarModal("modal-confirmar"));
  document.getElementById("btn-aceptar-confirmar").addEventListener("click", confirmarEliminar);
  document.getElementById("modal-confirmar").addEventListener("click", e => {
    if (e.target.id === "modal-confirmar") UI.cerrarModal("modal-confirmar");
  });

  // Modal configuración
  document.getElementById("btn-config").addEventListener("click", abrirModalConfiguracion);
  document.getElementById("btn-cerrar-config").addEventListener("click", () => UI.cerrarModal("modal-config"));
  document.getElementById("modal-config").addEventListener("click", e => {
    if (e.target.id === "modal-config") UI.cerrarModal("modal-config");
  });
  document.querySelectorAll(".config-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".config-tab").forEach(t => t.classList.remove("activo"));
      document.querySelectorAll(".config-panel").forEach(p => p.classList.remove("activo"));
      tab.classList.add("activo");
      document.querySelector(`.config-panel[data-panel="${tab.dataset.tab}"]`).classList.add("activo");
    });
  });
  document.getElementById("btn-guardar-config").addEventListener("click", guardarConfiguracionGeneral);
  document.getElementById("btn-guardar-api-url").addEventListener("click", guardarUrlApi);
  document.getElementById("btn-limpiar-cache").addEventListener("click", limpiarCacheLocal);
  document.getElementById("btn-pedir-permiso-notif").addEventListener("click", () => Notificaciones.pedirPermiso());

  // Atajo por parámetro de URL (accesos rápidos de la PWA)
  const params = new URLSearchParams(location.search);
  if (params.get("accion") === "agregar") {
    setTimeout(() => abrirModalAgregar(), 400);
  }

  // Tecla Escape cierra modales
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    ["modal-producto", "modal-confirmar", "modal-config"].forEach(id => {
      if (!document.getElementById(id).classList.contains("oculto")) UI.cerrarModal(id);
    });
  });
}

/* =========================================================
   ACCIONES SOBRE PRODUCTOS
   ========================================================= */

function abrirModalAgregar() {
  document.getElementById("modal-producto-titulo").textContent = "Agregar producto";
  document.getElementById("btn-guardar-producto").textContent = "Agregar a la lista";
  document.getElementById("form-producto").reset();
  document.getElementById("campo-id").value = "";
  document.querySelectorAll(".prioridad-btn").forEach(b => b.classList.remove("activo"));
  document.querySelector('.prioridad-btn[data-valor="Media"]').classList.add("activo");
  document.getElementById("campo-prioridad").value = "Media";
  document.getElementById("campo-cantidad").value = 1;
  UI.abrirModal("modal-producto");
  UI.refrescarIconos();
  setTimeout(() => document.getElementById("campo-nombre").focus(), 150);
}

function abrirModalEditar(id) {
  const producto = Estado.productos.find(p => String(p.id) === String(id));
  if (!producto) return;

  document.getElementById("modal-producto-titulo").textContent = "Editar producto";
  document.getElementById("btn-guardar-producto").textContent = "Guardar cambios";
  document.getElementById("campo-id").value = producto.id;
  document.getElementById("campo-nombre").value = producto.producto;
  document.getElementById("campo-categoria").value = producto.categoria;
  document.getElementById("campo-cantidad").value = producto.cantidad;
  document.getElementById("campo-unidad").value = producto.unidad || "unidad";
  document.getElementById("campo-fecha-estimada").value = producto.fechaEstimada || "";
  document.getElementById("campo-stock-minimo").value = producto.stockMinimo || "";
  document.getElementById("campo-nota").value = producto.nota || "";
  document.getElementById("campo-prioridad").value = producto.prioridad || "Media";
  document.querySelectorAll(".prioridad-btn").forEach(b => b.classList.toggle("activo", b.dataset.valor === producto.prioridad));

  UI.abrirModal("modal-producto");
  UI.refrescarIconos();
}

async function guardarProducto(e) {
  e.preventDefault();
  const id = document.getElementById("campo-id").value;
  const datos = {
    producto: document.getElementById("campo-nombre").value.trim(),
    categoria: document.getElementById("campo-categoria").value,
    cantidad: Number(document.getElementById("campo-cantidad").value) || 1,
    unidad: document.getElementById("campo-unidad").value,
    prioridad: document.getElementById("campo-prioridad").value,
    fechaEstimada: document.getElementById("campo-fecha-estimada").value || "",
    stockMinimo: document.getElementById("campo-stock-minimo").value || "",
    nota: document.getElementById("campo-nota").value.trim()
  };

  if (!datos.producto) {
    UI.toast("Escribe el nombre del producto.", "error");
    return;
  }

  const btnGuardar = document.getElementById("btn-guardar-producto");
  btnGuardar.disabled = true;

  try {
    if (id) {
      await ejecutarConRespaldoOffline("actualizar", { id, cambios: datos }, () => {
        const idx = Estado.productos.findIndex(p => String(p.id) === String(id));
        if (idx !== -1) Estado.productos[idx] = { ...Estado.productos[idx], ...datos };
      });
      UI.toast(`✓ ${datos.producto} actualizado`, "exito");
    } else {
      const idTemporal = "temp-" + Date.now();
      const nuevo = {
        id: idTemporal,
        ...datos,
        estado: "Pendiente",
        fechaAgregado: new Date().toISOString(),
        fechaCompra: "",
        ultimaModificacion: new Date().toISOString()
      };
      await ejecutarConRespaldoOffline("agregar", datos, () => {
        Estado.productos.unshift(nuevo);
      });
      UI.toast(`✓ ${datos.producto} agregado`, "exito");
    }

    UI.cerrarModal("modal-producto");
    // Si se agregó/editó offline, al reconectar se hará un refresh completo,
    // pero además intentamos una sincronización silenciosa por si ya hay red.
    if (navigator.onLine) sincronizar({ silencioso: true });
  } catch (err) {
    console.error(err);
    UI.toast("El producto no pudo guardarse.", "error");
  } finally {
    btnGuardar.disabled = false;
  }
}

async function marcarComoComprado(id) {
  const producto = Estado.productos.find(p => String(p.id) === String(id));
  if (!producto) return;

  const tarjeta = document.querySelector(`.tarjeta-producto[data-id="${id}"]`);
  if (tarjeta) tarjeta.classList.add("comprada");

  await ejecutarConRespaldoOffline("comprar", { id }, () => {
    producto.estado = "Comprado";
    producto.fechaCompra = new Date().toISOString();
  });

  UI.toast(`✓ ${producto.producto} marcada como comprada`, "exito");
  if (navigator.onLine) sincronizar({ silencioso: true });
}

async function marcarComoPendiente(id) {
  const producto = Estado.productos.find(p => String(p.id) === String(id));
  if (!producto) return;

  await ejecutarConRespaldoOffline("restaurar", { id }, () => {
    producto.estado = "Pendiente";
    producto.fechaCompra = "";
  });

  UI.toast(`${producto.producto} movido a pendientes`, "info");
  if (navigator.onLine) sincronizar({ silencioso: true });
}

function pedirConfirmacionEliminar(id, nombre) {
  Estado.idParaEliminar = id;
  document.getElementById("texto-confirmar").textContent = `¿Eliminar "${nombre}" de la lista?`;
  UI.abrirModal("modal-confirmar");
}

async function confirmarEliminar() {
  const id = Estado.idParaEliminar;
  if (!id) return;
  UI.cerrarModal("modal-confirmar");

  const tarjeta = document.querySelector(`.tarjeta-producto[data-id="${id}"]`);
  if (tarjeta) tarjeta.classList.add("saliendo");

  const producto = Estado.productos.find(p => String(p.id) === String(id));

  await new Promise(resolve => setTimeout(resolve, tarjeta ? 260 : 0));

  await ejecutarConRespaldoOffline("eliminar", { id }, () => {
    Estado.productos = Estado.productos.filter(p => String(p.id) !== String(id));
  });

  UI.toast(producto ? `Eliminado "${producto.producto}"` : "Producto eliminado", "info");
  Estado.idParaEliminar = null;
  if (navigator.onLine) sincronizar({ silencioso: true });
}

/* =========================================================
   PDF
   ========================================================= */

async function generarPdf() {
  const pendientes = Estado.productos.filter(p => p.estado === "Pendiente");
  if (!pendientes.length) {
    UI.toast("No hay productos pendientes para incluir en el PDF.", "info");
    return;
  }
  const btn = document.getElementById("btn-pdf");
  const textoOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader"></i> Generando…`;
  UI.refrescarIconos();

  try {
    const config = ConfigUsuario.cargar();
    await PdfGenerador.generar(pendientes, config.homeName);
    UI.toast("PDF descargado", "exito");
  } catch (e) {
    console.error(e);
    UI.toast(e.message || "No fue posible generar el PDF.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = textoOriginal;
    UI.refrescarIconos();
  }
}

/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

function abrirModalConfiguracion() {
  const config = ConfigUsuario.cargar();
  document.getElementById("config-nombre-hogar").value = config.homeName || "";
  document.getElementById("config-nombre-app").value = config.appName || "";
  document.getElementById("config-modo-oscuro").checked = !!config.modoOscuro;
  document.getElementById("config-dias-antiguo").value = config.diasAntiguo || CONFIG.DIAS_ANTIGUO;
  document.getElementById("config-email").value = config.email || "";
  document.getElementById("config-hora-recordatorio").value = config.horaRecordatorio || "09:00";
  document.getElementById("config-api-url").value = config.apiUrl || "";
  document.getElementById("config-intervalo-sync").value = config.intervaloSync || 60;
  UI.abrirModal("modal-config");
  UI.refrescarIconos();
}

function guardarConfiguracionGeneral() {
  const config = ConfigUsuario.cargar();
  config.homeName = document.getElementById("config-nombre-hogar").value.trim() || CONFIG.HOME_NAME;
  config.appName = document.getElementById("config-nombre-app").value.trim() || CONFIG.APP_NAME;
  config.modoOscuro = document.getElementById("config-modo-oscuro").checked;
  config.diasAntiguo = Number(document.getElementById("config-dias-antiguo").value) || CONFIG.DIAS_ANTIGUO;
  config.email = document.getElementById("config-email").value.trim();
  config.horaRecordatorio = document.getElementById("config-hora-recordatorio").value;
  config.intervaloSync = Number(document.getElementById("config-intervalo-sync").value) || 60;
  ConfigUsuario.guardar(config);

  document.body.classList.toggle("oscuro", config.modoOscuro);
  document.getElementById("nombre-app").textContent = config.appName;
  document.getElementById("nombre-hogar").textContent = config.homeName;
  document.title = `${config.appName} · Lista de Compras`;

  // Intenta persistir también en la hoja "Configuracion" (si hay conexión).
  if (navigator.onLine && Api.urlConfigurada()) {
    Api.guardarConfiguracion(config).catch(err => console.warn("No se pudo guardar la configuración remota:", err));
  }

  aplicarFiltrosYRenderizar();
  UI.cerrarModal("modal-config");
  UI.toast("Configuración guardada", "exito");

  // Reinicia el intervalo de sincronización con el nuevo valor
  if (Estado.intervaloSyncId) clearInterval(Estado.intervaloSyncId);
  Estado.intervaloSyncId = setInterval(() => sincronizar({ silencioso: true }), config.intervaloSync * 1000);
}

function guardarUrlApi() {
  const url = document.getElementById("config-api-url").value.trim();
  if (!url.startsWith("http")) {
    UI.toast("Ingresa una URL válida de Google Apps Script.", "error");
    return;
  }
  const config = ConfigUsuario.cargar();
  config.apiUrl = url;
  ConfigUsuario.guardar(config);
  UI.toast("URL guardada. Sincronizando…", "exito");
  sincronizar();
}

function limpiarCacheLocal() {
  Storage.limpiarTodo();
  UI.toast("Datos locales en caché eliminados.", "info");
}

/* =========================================================
   SERVICE WORKER
   ========================================================= */

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(err => {
      console.warn("No se pudo registrar el Service Worker:", err);
    });
  });
}
