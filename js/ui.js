/* =========================================================
   UI.JS
   Renderizado de la interfaz: tarjetas de producto, chips,
   toasts, modales, resumen y estado de sincronización.
   ========================================================= */

const UI = {

  /* ---------------- Iconos ---------------- */
  ICONOS_CATEGORIA: {
    "Frutas": "apple", "Verduras": "carrot", "Lácteos": "milk",
    "Carnes": "beef", "Pollo": "drumstick", "Pescado": "fish",
    "Huevos": "egg", "Granos": "wheat", "Cereales": "wheat",
    "Panadería": "croissant", "Bebidas": "cup-soda",
    "Congelados": "snowflake", "Snacks": "cookie",
    "Condimentos": "flask-conical", "Limpieza": "spray-can",
    "Aseo personal": "shower-head", "Otros": "package"
  },

  refrescarIconos() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  /* ---------------- Fecha y hora ---------------- */
  actualizarRelojEncabezado() {
    const ahora = new Date();
    const fechaEl = document.getElementById("fecha-actual");
    const horaEl = document.getElementById("hora-actual");
    if (fechaEl) {
      fechaEl.textContent = ahora.toLocaleDateString("es-CO", {
        weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota"
      });
    }
    if (horaEl) {
      horaEl.textContent = ahora.toLocaleTimeString("es-CO", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota"
      });
    }
  },

  /** Convierte una fecha ISO en un texto relativo tipo "Hace 2 días". */
  tiempoRelativo(fechaISO) {
    if (!fechaISO) return "";
    const entonces = new Date(fechaISO);
    if (isNaN(entonces.getTime())) return "";
    const ahora = new Date();
    const segundos = Math.max(0, Math.floor((ahora - entonces) / 1000));

    if (segundos < 60) return "Hace un momento";
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `Hace ${minutos} minuto${minutos !== 1 ? "s" : ""}`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Hace ${horas} hora${horas !== 1 ? "s" : ""}`;
    const dias = Math.floor(horas / 24);
    if (dias < 7) return `Hace ${dias} día${dias !== 1 ? "s" : ""}`;
    const semanas = Math.floor(dias / 7);
    if (semanas < 5) return `Hace ${semanas} semana${semanas !== 1 ? "s" : ""}`;
    const meses = Math.floor(dias / 30);
    return `Hace ${meses} mes${meses !== 1 ? "es" : ""}`;
  },

  diasPendiente(fechaISO) {
    if (!fechaISO) return 0;
    const entonces = new Date(fechaISO);
    if (isNaN(entonces.getTime())) return 0;
    const ms = new Date() - entonces;
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  },

  /* ---------------- Toasts ---------------- */
  toast(mensaje, tipo = "info") {
    const contenedor = document.getElementById("toast-contenedor");
    if (!contenedor) return;
    const iconos = { exito: "check-circle-2", error: "alert-triangle", info: "info" };
    const el = document.createElement("div");
    el.className = `toast ${tipo}`;
    el.innerHTML = `<i data-lucide="${iconos[tipo] || "info"}"></i><span>${mensaje}</span>`;
    contenedor.appendChild(el);
    this.refrescarIconos();
    setTimeout(() => {
      el.classList.add("saliendo");
      setTimeout(() => el.remove(), 280);
    }, 3200);
  },

  /* ---------------- Estado de sincronización ---------------- */
  estadoSync(estado, texto) {
    const el = document.getElementById("estado-sync");
    const txt = document.getElementById("estado-sync-texto");
    if (!el || !txt) return;
    el.classList.remove("ok", "cargando", "error");
    el.classList.add(estado);
    const iconos = { ok: "check-circle-2", cargando: "loader", error: "wifi-off" };
    el.querySelector("i").setAttribute("data-lucide", iconos[estado] || "check-circle-2");
    txt.textContent = texto;
    this.refrescarIconos();
  },

  /* ---------------- Resumen ---------------- */
  actualizarResumen(productos) {
    const pendientes = productos.filter(p => p.estado === "Pendiente");
    const comprados = productos.filter(p => p.estado === "Comprado");
    const alta = pendientes.filter(p => p.prioridad === "Alta");
    const media = pendientes.filter(p => p.prioridad === "Media");
    const antiguos = pendientes.filter(p => this.diasPendiente(p.fechaAgregado) >= (ConfigUsuario.cargar().diasAntiguo || CONFIG.DIAS_ANTIGUO));

    document.getElementById("num-pendientes").textContent = pendientes.length;
    document.getElementById("num-alta").textContent = alta.length;
    document.getElementById("num-media").textContent = media.length;
    document.getElementById("num-comprados").textContent = comprados.length;
    document.getElementById("num-antiguos").textContent = antiguos.length;
  },

  /* ---------------- Chips de categorías ---------------- */
  renderizarChipsCategorias(categorias, categoriaActiva) {
    const contenedor = document.getElementById("chips-categorias");
    const botonTodas = contenedor.querySelector('[data-cat="todas"]');
    contenedor.innerHTML = "";
    contenedor.appendChild(botonTodas);

    categorias.forEach(cat => {
      const nombre = typeof cat === "string" ? cat : cat.nombre;
      const icono = this.ICONOS_CATEGORIA[nombre] || "package";
      const btn = document.createElement("button");
      btn.className = "chip chip-cat";
      btn.dataset.cat = nombre;
      btn.innerHTML = `<i data-lucide="${icono}"></i> ${nombre}`;
      contenedor.appendChild(btn);
    });

    contenedor.querySelectorAll(".chip-cat").forEach(btn => {
      btn.classList.toggle("activo", btn.dataset.cat === categoriaActiva);
    });
    this.refrescarIconos();
  },

  /* ---------------- Datalist de nombres (autocompletado) ---------------- */
  actualizarSugerencias(productos) {
    const datalist = document.getElementById("lista-sugerencias");
    const nombres = [...new Set(productos.map(p => p.producto))];
    datalist.innerHTML = nombres.map(n => `<option value="${this._escapar(n)}">`).join("");
  },

  /* ---------------- Listado principal ---------------- */
  mostrarSkeletons(cantidad = 4) {
    const listado = document.getElementById("listado");
    listado.innerHTML = "";
    for (let i = 0; i < cantidad; i++) {
      const div = document.createElement("div");
      div.className = "skeleton-tarjeta";
      listado.appendChild(div);
    }
    document.getElementById("estado-vacio").classList.add("oculto");
  },

  renderizarListado(productos) {
    const listado = document.getElementById("listado");
    const vacio = document.getElementById("estado-vacio");
    listado.innerHTML = "";

    if (productos.length === 0) {
      vacio.classList.remove("oculto");
      return;
    }
    vacio.classList.add("oculto");

    const diasAntiguo = ConfigUsuario.cargar().diasAntiguo || CONFIG.DIAS_ANTIGUO;

    productos.forEach(p => {
      listado.appendChild(this._crearTarjeta(p, diasAntiguo));
    });
    this.refrescarIconos();
  },

  _crearTarjeta(p, diasAntiguo) {
    const div = document.createElement("div");
    const comprado = p.estado === "Comprado";
    div.className = `tarjeta-producto glass${comprado ? " comprada" : ""}`;
    div.dataset.id = p.id;
    div.dataset.prioridad = p.prioridad || "Media";

    const icono = this.ICONOS_CATEGORIA[p.categoria] || "package";
    const dias = this.diasPendiente(p.fechaAgregado);
    const esAntiguo = !comprado && dias >= diasAntiguo;

    const metaTiempo = comprado
      ? `<span><i data-lucide="calendar-check"></i> Comprado ${this.tiempoRelativo(p.fechaCompra)}</span>`
      : `<span class="${esAntiguo ? "aviso-antiguo" : ""}"><i data-lucide="clock"></i> ${this.tiempoRelativo(p.fechaAgregado)}</span>`;

    const avisoAntiguo = esAntiguo
      ? `<span class="aviso-antiguo"><i data-lucide="alert-triangle"></i> Lleva ${dias} día${dias !== 1 ? "s" : ""} pendiente</span>`
      : "";

    const stockBajo = (p.stockMinimo && Number(p.cantidad) < Number(p.stockMinimo))
      ? `<span class="producto-stock-bajo"><i data-lucide="alert-triangle"></i> Stock bajo</span>`
      : "";

    const nota = p.nota ? `<p class="producto-nota">"${this._escapar(p.nota)}"</p>` : "";

    const acciones = comprado
      ? `
        <button class="accion-btn accion-restaurar" data-accion="restaurar" data-id="${p.id}">
          <i data-lucide="undo-2"></i> Mover a pendientes
        </button>
        <button class="accion-btn accion-eliminar" data-accion="eliminar" data-id="${p.id}" data-nombre="${this._escapar(p.producto)}">
          <i data-lucide="trash-2"></i> Eliminar
        </button>`
      : `
        <button class="accion-btn accion-comprar" data-accion="comprar" data-id="${p.id}">
          <i data-lucide="check"></i> Comprado
        </button>
        <button class="accion-btn accion-editar" data-accion="editar" data-id="${p.id}">
          <i data-lucide="pencil"></i> Editar
        </button>
        <button class="accion-btn accion-eliminar" data-accion="eliminar" data-id="${p.id}" data-nombre="${this._escapar(p.producto)}">
          <i data-lucide="trash-2"></i> Eliminar
        </button>`;

    div.innerHTML = `
      <div class="producto-icono"><i data-lucide="${icono}"></i></div>
      <div class="producto-info">
        <div class="producto-cabecera">
          <h3 class="producto-nombre">${this._escapar(p.producto)}</h3>
          <span class="badge-prioridad ${p.prioridad}">${this._emojiPrioridad(p.prioridad)} ${p.prioridad}</span>
        </div>
        <div class="producto-meta">
          <span><i data-lucide="package"></i> ${p.cantidad} ${this._escapar(p.unidad || "")}</span>
          <span><i data-lucide="tag"></i> ${this._escapar(p.categoria || "Otros")}</span>
          ${metaTiempo}
          ${avisoAntiguo}
        </div>
        ${nota}
        ${stockBajo}
        <div class="producto-acciones">${acciones}</div>
      </div>
    `;
    return div;
  },

  _emojiPrioridad(p) {
    return { Alta: "🔴", Media: "🟡", Baja: "🟢" }[p] || "🟡";
  },

  _escapar(texto) {
    if (texto === undefined || texto === null) return "";
    const div = document.createElement("div");
    div.textContent = String(texto);
    return div.innerHTML;
  },

  /* ---------------- Modales ---------------- */
  abrirModal(id) {
    document.getElementById(id).classList.remove("oculto");
    document.body.style.overflow = "hidden";
  },
  cerrarModal(id) {
    document.getElementById(id).classList.add("oculto");
    document.body.style.overflow = "";
  },

  /* ---------------- Pantalla de carga ---------------- */
  ocultarPantallaCarga() {
    const pantalla = document.getElementById("pantalla-carga");
    pantalla.style.opacity = "0";
    setTimeout(() => pantalla.classList.add("oculto"), 320);
    document.getElementById("app").classList.remove("oculto");
  },

  textoCarga(texto) {
    const el = document.getElementById("texto-carga");
    if (el) el.textContent = texto;
  }
};
