/* =========================================================
   CONFIG.JS
   Configuración global de "Mi Nevera".
   -> IMPORTANTE: pega aquí la URL de tu Google Apps Script
      (Web App) después de desplegarlo. Ver README.md, sección
      "Configurar Google Apps Script" y "Configurar frontend".
   ========================================================= */

const CONFIG = {
  // Pega aquí la URL que te da Apps Script al hacer
  // "Implementar" > "Nueva implementación" > "Aplicación web".
  // Ejemplo: "https://script.google.com/macros/s/AKfycb.../exec"
  API_URL: "https://script.google.com/macros/s/AKfycbyYHORiZZImJtkpbmEJBJebriR1c4mgRLnMXECOSoJW3-OANGRVpDncQAnNU9dQODhl3w/exec",

  APP_NAME: "Mi Nevera",
  HOME_NAME: "Mi Hogar",

  // Cada cuánto se sincroniza automáticamente con Google Sheets (ms).
  INTERVALO_SYNC_MS: 60000,

  // Días para marcar un producto como "pendiente antiguo".
  DIAS_ANTIGUO: 5,

  // Nombre de la clave usada en localStorage.
  STORAGE_KEY: "mi-nevera-datos-v1",
  STORAGE_CONFIG_KEY: "mi-nevera-config-v1",
  STORAGE_COLA_KEY: "mi-nevera-cola-sync-v1",

  // Categorías por defecto (se sincronizan con la hoja "Categorias").
  CATEGORIAS_DEFECTO: [
    { nombre: "Frutas", icono: "apple" },
    { nombre: "Verduras", icono: "carrot" },
    { nombre: "Lácteos", icono: "milk" },
    { nombre: "Carnes", icono: "beef" },
    { nombre: "Pollo", icono: "drumstick" },
    { nombre: "Pescado", icono: "fish" },
    { nombre: "Huevos", icono: "egg" },
    { nombre: "Granos", icono: "wheat" },
    { nombre: "Cereales", icono: "wheat" },
    { nombre: "Panadería", icono: "croissant" },
    { nombre: "Bebidas", icono: "cup-soda" },
    { nombre: "Congelados", icono: "snowflake" },
    { nombre: "Snacks", icono: "cookie" },
    { nombre: "Condimentos", icono: "flask-conical" },
    { nombre: "Limpieza", icono: "spray-can" },
    { nombre: "Aseo personal", icono: "shower-head" },
    { nombre: "Otros", icono: "package" }
  ]
};

// Config editable por el usuario (se guarda en localStorage y,
// cuando aplica, también en la hoja "Configuracion").
const ConfigUsuario = {
  cargar() {
    try {
      const guardado = localStorage.getItem(CONFIG.STORAGE_CONFIG_KEY);
      const base = {
        apiUrl: CONFIG.API_URL,
        appName: CONFIG.APP_NAME,
        homeName: CONFIG.HOME_NAME,
        modoOscuro: false,
        diasAntiguo: CONFIG.DIAS_ANTIGUO,
        intervaloSync: CONFIG.INTERVALO_SYNC_MS / 1000,
        email: "",
        horaRecordatorio: "09:00"
      };
      return guardado ? { ...base, ...JSON.parse(guardado) } : base;
    } catch (e) {
      console.error("Error leyendo configuración local:", e);
      return {
        apiUrl: CONFIG.API_URL,
        appName: CONFIG.APP_NAME,
        homeName: CONFIG.HOME_NAME,
        modoOscuro: false,
        diasAntiguo: CONFIG.DIAS_ANTIGUO,
        intervaloSync: CONFIG.INTERVALO_SYNC_MS / 1000,
        email: "",
        horaRecordatorio: "09:00"
      };
    }
  },
  guardar(datos) {
    localStorage.setItem(CONFIG.STORAGE_CONFIG_KEY, JSON.stringify(datos));
  }
};
