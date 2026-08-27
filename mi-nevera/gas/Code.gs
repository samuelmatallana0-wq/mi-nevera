/**
 * ==========================================================
 * MI NEVERA — BACKEND (Google Apps Script)
 * ==========================================================
 * Este script debe ir ENLAZADO a tu Google Sheet:
 * Extensiones > Apps Script (dentro de la hoja de cálculo).
 *
 * Expone una API muy sencilla:
 *   GET  ?tipo=todo|pendientes|comprados|categorias|estadisticas|configuracion
 *   POST { accion: "...", ... }  (Content-Type: text/plain, cuerpo JSON)
 *
 * No requiere ninguna librería externa. Ver README.md para las
 * instrucciones completas de despliegue.
 * ==========================================================
 */

// ---------------------------------------------------------
// CONFIGURACIÓN GENERAL
// ---------------------------------------------------------

const ZONA_HORARIA = "America/Bogota";

const HOJA_ALIMENTOS = "Alimentos";
const HOJA_CATEGORIAS = "Categorias";
const HOJA_CONFIGURACION = "Configuracion";
const HOJA_HISTORIAL = "Historial";

const COLUMNAS_ALIMENTOS = [
  "ID", "Producto", "Categoria", "Cantidad", "Unidad", "Prioridad",
  "Estado", "FechaAgregado", "FechaCompra", "UltimaModificacion",
  "FechaEstimada", "StockMinimo", "Nota", "Usuario", "Activo"
];

const COLUMNAS_HISTORIAL = [
  "IdAccion", "FechaHora", "Accion", "Producto", "IdProducto", "Usuario", "InfoAdicional"
];

const COLUMNAS_CATEGORIAS = ["Nombre", "Icono"];

const CATEGORIAS_DEFECTO = [
  ["Frutas", "apple"], ["Verduras", "carrot"], ["Lácteos", "milk"],
  ["Carnes", "beef"], ["Pollo", "drumstick"], ["Pescado", "fish"],
  ["Huevos", "egg"], ["Granos", "wheat"], ["Cereales", "wheat"],
  ["Panadería", "croissant"], ["Bebidas", "cup-soda"], ["Congelados", "snowflake"],
  ["Snacks", "cookie"], ["Condimentos", "flask-conical"], ["Limpieza", "spray-can"],
  ["Aseo personal", "shower-head"], ["Otros", "package"]
];

const CONFIGURACION_DEFECTO = {
  appName: "Mi Nevera",
  homeName: "Mi Hogar",
  appUrl: "",
  webAppUrl: "",
  email: "",
  horaRecordatorio: "09:00",
  diasRecordatorio: "Sabado",
  diasAntiguo: "5"
};

// ---------------------------------------------------------
// PUNTOS DE ENTRADA HTTP
// ---------------------------------------------------------

function doGet(e) {
  try {
    asegurarHojas();
    const tipo = (e.parameter.tipo || "todo").toLowerCase();
    let data;

    switch (tipo) {
      case "pendientes":
        data = { productos: obtenerProductos({ soloPendientes: true }) };
        break;
      case "comprados":
        data = { productos: obtenerProductos({ soloComprados: true }) };
        break;
      case "categorias":
        data = { categorias: obtenerCategorias() };
        break;
      case "estadisticas":
        data = obtenerEstadisticas();
        break;
      case "configuracion":
        data = obtenerConfiguracion();
        break;
      case "todo":
      default:
        data = {
          productos: obtenerProductos({}),
          categorias: obtenerCategorias(),
          configuracion: obtenerConfiguracion()
        };
        break;
    }

    return respuestaExito("Datos obtenidos correctamente", data);
  } catch (error) {
    return respuestaError("No fue posible obtener la información.", error);
  }
}

function doPost(e) {
  try {
    asegurarHojas();
    const cuerpo = JSON.parse(e.postData.contents);
    const accion = cuerpo.accion;

    switch (accion) {
      case "agregarProducto":
        return respuestaExito("Producto agregado correctamente", agregarProducto(cuerpo.producto));
      case "actualizarProducto":
        return respuestaExito("Producto actualizado correctamente", actualizarProducto(cuerpo.id, cuerpo.cambios));
      case "marcarComprado":
        return respuestaExito("Producto marcado como comprado", marcarComprado(cuerpo.id));
      case "marcarPendiente":
        return respuestaExito("Producto movido a pendientes", marcarPendiente(cuerpo.id));
      case "eliminarProducto":
        return respuestaExito("Producto eliminado correctamente", eliminarProducto(cuerpo.id));
      case "guardarConfiguracion":
        return respuestaExito("Configuración guardada correctamente", guardarConfiguracion(cuerpo.config));
      default:
        return respuestaError("Acción no reconocida: " + accion);
    }
  } catch (error) {
    return respuestaError("No fue posible procesar la solicitud.", error);
  }
}

// ---------------------------------------------------------
// RESPUESTAS JSON
// ---------------------------------------------------------

function respuestaExito(mensaje, data) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: mensaje,
    data: data || {}
  })).setMimeType(ContentService.MimeType.JSON);
}

function respuestaError(mensaje, error) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    message: mensaje,
    error: error ? String(error) : ""
  })).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------
// INICIALIZACIÓN DE HOJAS (se ejecuta automáticamente)
// ---------------------------------------------------------

function asegurarHojas() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();

  let hojaAlimentos = libro.getSheetByName(HOJA_ALIMENTOS);
  if (!hojaAlimentos) {
    hojaAlimentos = libro.insertSheet(HOJA_ALIMENTOS);
    hojaAlimentos.appendRow(COLUMNAS_ALIMENTOS);
    hojaAlimentos.setFrozenRows(1);
  }

  let hojaCategorias = libro.getSheetByName(HOJA_CATEGORIAS);
  if (!hojaCategorias) {
    hojaCategorias = libro.insertSheet(HOJA_CATEGORIAS);
    hojaCategorias.appendRow(COLUMNAS_CATEGORIAS);
    hojaCategorias.setFrozenRows(1);
    CATEGORIAS_DEFECTO.forEach(fila => hojaCategorias.appendRow(fila));
  }

  let hojaConfig = libro.getSheetByName(HOJA_CONFIGURACION);
  if (!hojaConfig) {
    hojaConfig = libro.insertSheet(HOJA_CONFIGURACION);
    hojaConfig.appendRow(["Clave", "Valor"]);
    hojaConfig.setFrozenRows(1);
    Object.keys(CONFIGURACION_DEFECTO).forEach(clave => {
      hojaConfig.appendRow([clave, CONFIGURACION_DEFECTO[clave]]);
    });
  }

  let hojaHistorial = libro.getSheetByName(HOJA_HISTORIAL);
  if (!hojaHistorial) {
    hojaHistorial = libro.insertSheet(HOJA_HISTORIAL);
    hojaHistorial.appendRow(COLUMNAS_HISTORIAL);
    hojaHistorial.setFrozenRows(1);
  }
}

// ---------------------------------------------------------
// UTILIDADES DE HOJA / FECHA
// ---------------------------------------------------------

function obtenerHoja(nombre) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
}

function ahoraISO() {
  return Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd'T'HH:mm:ss");
}

function generarId() {
  return Utilities.getUuid();
}

/** Convierte todas las filas de la hoja Alimentos en objetos JS con claves camelCase. */
function leerFilasAlimentos() {
  const hoja = obtenerHoja(HOJA_ALIMENTOS);
  const valores = hoja.getDataRange().getValues();
  const encabezados = valores.shift();
  const idxCol = {};
  encabezados.forEach((nombre, i) => idxCol[nombre] = i);

  return valores
    .map((fila, indiceFila) => ({
      _fila: indiceFila + 2, // +2 porque quitamos encabezado y las hojas son base 1
      id: fila[idxCol["ID"]],
      producto: fila[idxCol["Producto"]],
      categoria: fila[idxCol["Categoria"]],
      cantidad: fila[idxCol["Cantidad"]],
      unidad: fila[idxCol["Unidad"]],
      prioridad: fila[idxCol["Prioridad"]],
      estado: fila[idxCol["Estado"]],
      fechaAgregado: formatearFechaSalida(fila[idxCol["FechaAgregado"]]),
      fechaCompra: formatearFechaSalida(fila[idxCol["FechaCompra"]]),
      ultimaModificacion: formatearFechaSalida(fila[idxCol["UltimaModificacion"]]),
      fechaEstimada: formatearFechaSalida(fila[idxCol["FechaEstimada"]], true),
      stockMinimo: fila[idxCol["StockMinimo"]],
      nota: fila[idxCol["Nota"]],
      usuario: fila[idxCol["Usuario"]],
      activo: fila[idxCol["Activo"]]
    }))
    .filter(p => p.activo !== false && p.activo !== "FALSE" && p.id);
}

function formatearFechaSalida(valor, soloFecha) {
  if (!valor) return "";
  if (valor instanceof Date) {
    return soloFecha
      ? Utilities.formatDate(valor, ZONA_HORARIA, "yyyy-MM-dd")
      : Utilities.formatDate(valor, ZONA_HORARIA, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return String(valor);
}

// ---------------------------------------------------------
// CRUD DE PRODUCTOS
// ---------------------------------------------------------

function obtenerProductos(opciones) {
  let productos = leerFilasAlimentos();

  if (opciones.soloPendientes) productos = productos.filter(p => p.estado === "Pendiente");
  if (opciones.soloComprados) productos = productos.filter(p => p.estado === "Comprado");

  productos.forEach(p => delete p._fila);
  return productos;
}

function agregarProducto(producto) {
  if (!producto || !producto.producto) {
    throw new Error("El producto debe tener un nombre.");
  }
  const hoja = obtenerHoja(HOJA_ALIMENTOS);
  const id = generarId();
  const ahora = ahoraISO();

  hoja.appendRow([
    id,
    producto.producto,
    producto.categoria || "Otros",
    producto.cantidad || 1,
    producto.unidad || "unidad",
    producto.prioridad || "Media",
    "Pendiente",
    ahora,
    "",
    ahora,
    producto.fechaEstimada || "",
    producto.stockMinimo || "",
    producto.nota || "",
    producto.usuario || "app-web",
    true
  ]);

  registrarHistorial("Producto agregado", producto.producto, id);
  return { id: id };
}

function actualizarProducto(id, cambios) {
  const fila = buscarFilaPorId(id);
  if (!fila) throw new Error("No se encontró el producto con ID " + id);

  const hoja = obtenerHoja(HOJA_ALIMENTOS);
  const mapaColumnas = {
    producto: "Producto", categoria: "Categoria", cantidad: "Cantidad",
    unidad: "Unidad", prioridad: "Prioridad", fechaEstimada: "FechaEstimada",
    stockMinimo: "StockMinimo", nota: "Nota"
  };

  Object.keys(cambios || {}).forEach(clave => {
    const nombreColumna = mapaColumnas[clave];
    if (!nombreColumna) return;
    const col = COLUMNAS_ALIMENTOS.indexOf(nombreColumna) + 1;
    hoja.getRange(fila, col).setValue(cambios[clave]);
  });

  const colModificacion = COLUMNAS_ALIMENTOS.indexOf("UltimaModificacion") + 1;
  hoja.getRange(fila, colModificacion).setValue(ahoraISO());

  registrarHistorial("Producto modificado", cambios.producto || "", id, JSON.stringify(cambios));
  return { id: id };
}

function marcarComprado(id) {
  const fila = buscarFilaPorId(id);
  if (!fila) throw new Error("No se encontró el producto con ID " + id);

  const hoja = obtenerHoja(HOJA_ALIMENTOS);
  hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("Estado") + 1).setValue("Comprado");
  hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("FechaCompra") + 1).setValue(ahoraISO());
  hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("UltimaModificacion") + 1).setValue(ahoraISO());

  const nombre = hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("Producto") + 1).getValue();
  registrarHistorial("Producto comprado", nombre, id);
  return { id: id };
}

function marcarPendiente(id) {
  const fila = buscarFilaPorId(id);
  if (!fila) throw new Error("No se encontró el producto con ID " + id);

  const hoja = obtenerHoja(HOJA_ALIMENTOS);
  hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("Estado") + 1).setValue("Pendiente");
  hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("FechaCompra") + 1).setValue("");
  hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("UltimaModificacion") + 1).setValue(ahoraISO());

  const nombre = hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("Producto") + 1).getValue();
  registrarHistorial("Producto movido a pendientes", nombre, id);
  return { id: id };
}

function eliminarProducto(id) {
  const fila = buscarFilaPorId(id);
  if (!fila) throw new Error("No se encontró el producto con ID " + id);

  const hoja = obtenerHoja(HOJA_ALIMENTOS);
  const nombre = hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("Producto") + 1).getValue();

  // No se borra físicamente la fila: se marca Activo = false para
  // conservar el historial completo en Google Sheets (sección 12 del
  // encargo: "No eliminar automáticamente los registros históricos").
  hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("Activo") + 1).setValue(false);
  hoja.getRange(fila, COLUMNAS_ALIMENTOS.indexOf("UltimaModificacion") + 1).setValue(ahoraISO());

  registrarHistorial("Producto eliminado", nombre, id);
  return { id: id };
}

function buscarFilaPorId(id) {
  const hoja = obtenerHoja(HOJA_ALIMENTOS);
  const ids = hoja.getRange(2, 1, Math.max(hoja.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return null;
}

// ---------------------------------------------------------
// CATEGORÍAS
// ---------------------------------------------------------

function obtenerCategorias() {
  const hoja = obtenerHoja(HOJA_CATEGORIAS);
  const valores = hoja.getDataRange().getValues();
  valores.shift();
  return valores.filter(f => f[0]).map(f => ({ nombre: f[0], icono: f[1] || "package" }));
}

// ---------------------------------------------------------
// CONFIGURACIÓN
// ---------------------------------------------------------

function obtenerConfiguracion() {
  const hoja = obtenerHoja(HOJA_CONFIGURACION);
  const valores = hoja.getDataRange().getValues();
  valores.shift();
  const config = {};
  valores.forEach(fila => {
    if (fila[0]) config[fila[0]] = fila[1];
  });
  return config;
}

function guardarConfiguracion(config) {
  if (!config) return {};
  const hoja = obtenerHoja(HOJA_CONFIGURACION);
  const valores = hoja.getDataRange().getValues();
  const claves = valores.map(f => f[0]);

  Object.keys(config).forEach(clave => {
    const fila = claves.indexOf(clave);
    if (fila > 0) {
      hoja.getRange(fila + 1, 2).setValue(config[clave]);
    } else {
      hoja.appendRow([clave, config[clave]]);
    }
  });
  return obtenerConfiguracion();
}

// ---------------------------------------------------------
// ESTADÍSTICAS
// ---------------------------------------------------------

function obtenerEstadisticas() {
  const productos = leerFilasAlimentos();
  const pendientes = productos.filter(p => p.estado === "Pendiente");
  const comprados = productos.filter(p => p.estado === "Comprado");

  const haceUnaSemana = new Date();
  haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);

  const compradosSemana = comprados.filter(p => p.fechaCompra && new Date(p.fechaCompra) >= haceUnaSemana);
  const agregadosSemana = productos.filter(p => p.fechaAgregado && new Date(p.fechaAgregado) >= haceUnaSemana);

  const conteoCategorias = {};
  pendientes.forEach(p => {
    conteoCategorias[p.categoria] = (conteoCategorias[p.categoria] || 0) + 1;
  });
  let categoriaTop = "";
  let maxCategoria = 0;
  Object.keys(conteoCategorias).forEach(cat => {
    if (conteoCategorias[cat] > maxCategoria) {
      maxCategoria = conteoCategorias[cat];
      categoriaTop = cat;
    }
  });

  let sumaDias = 0;
  pendientes.forEach(p => {
    if (p.fechaAgregado) {
      sumaDias += (new Date() - new Date(p.fechaAgregado)) / (1000 * 60 * 60 * 24);
    }
  });
  const promedioDiasPendiente = pendientes.length ? Math.round(sumaDias / pendientes.length) : 0;

  return {
    totalPendientes: pendientes.length,
    totalComprados: comprados.length,
    compradosEstaSemana: compradosSemana.length,
    agregadosEstaSemana: agregadosSemana.length,
    categoriaConMasProductos: categoriaTop,
    prioridadAlta: pendientes.filter(p => p.prioridad === "Alta").length,
    promedioDiasPendiente: promedioDiasPendiente
  };
}

// ---------------------------------------------------------
// HISTORIAL
// ---------------------------------------------------------

function registrarHistorial(accion, producto, idProducto, infoAdicional) {
  const hoja = obtenerHoja(HOJA_HISTORIAL);
  hoja.appendRow([
    generarId(),
    ahoraISO(),
    accion,
    producto || "",
    idProducto || "",
    "app-web",
    infoAdicional || ""
  ]);
}

// ---------------------------------------------------------
// AUTOMATIZACIONES (TRIGGERS)
// ---------------------------------------------------------
// Ejecuta UNA VEZ la función crearTriggers() manualmente desde el editor
// de Apps Script (menú "Ejecutar") para programar los triggers diario y
// semanal. Ver README.md, sección "Configurar notificaciones".

function crearTriggers() {
  // Elimina triggers previos creados por esta función para no duplicarlos.
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "revisarPendientesAntiguos" || t.getHandlerFunction() === "enviarResumenSemanal") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Trigger diario: revisa productos con muchos días pendientes.
  ScriptApp.newTrigger("revisarPendientesAntiguos")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .inTimezone(ZONA_HORARIA)
    .create();

  // Trigger semanal: resumen de la semana, los sábados a las 9am.
  ScriptApp.newTrigger("enviarResumenSemanal")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(9)
    .inTimezone(ZONA_HORARIA)
    .create();
}

function revisarPendientesAntiguos() {
  const config = obtenerConfiguracion();
  if (!config.email) return;

  const diasAntiguo = Number(config.diasAntiguo) || 5;
  const pendientes = leerFilasAlimentos().filter(p => p.estado === "Pendiente");
  const antiguos = pendientes.filter(p => {
    if (!p.fechaAgregado) return false;
    const dias = (new Date() - new Date(p.fechaAgregado)) / (1000 * 60 * 60 * 24);
    return dias >= diasAntiguo;
  });

  if (antiguos.length === 0) return;

  const cuerpo =
    "⚠ Tienes productos pendientes\n\n" +
    "Hay " + antiguos.length + " producto(s) que llevan más de " + diasAntiguo + " días en la lista:\n\n" +
    antiguos.map(p => "- " + p.producto + " (" + p.categoria + ")").join("\n");

  MailApp.sendEmail(config.email, "⚠ Tienes productos pendientes en " + (config.homeName || "Mi Nevera"), cuerpo);
}

function enviarResumenSemanal() {
  const config = obtenerConfiguracion();
  if (!config.email) return;

  const stats = obtenerEstadisticas();
  const pendientes = leerFilasAlimentos().filter(p => p.estado === "Pendiente");
  const altaPrioridad = pendientes.filter(p => p.prioridad === "Alta");

  const cuerpo =
    "🛒 Resumen semanal de compras — " + (config.homeName || "Mi Nevera") + "\n\n" +
    "Productos comprados esta semana: " + stats.compradosEstaSemana + "\n" +
    "Productos agregados esta semana: " + stats.agregadosEstaSemana + "\n" +
    "Productos pendientes actualmente: " + stats.totalPendientes + "\n" +
    "🔴 Productos de alta prioridad: " + altaPrioridad.length + "\n\n" +
    (altaPrioridad.length
      ? "Alta prioridad:\n" + altaPrioridad.map(p => "- " + p.producto).join("\n")
      : "");

  MailApp.sendEmail(config.email, "🛒 Resumen semanal de compras", cuerpo);
}
