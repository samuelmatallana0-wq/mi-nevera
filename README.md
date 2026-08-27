# 🧊 Mi Nevera — Lista de compras para la nevera (NFC + GitHub Pages + Google Sheets)

Aplicación web progresiva (PWA) para gestionar la lista de compras de tu hogar desde una
tablet o celular pegado en la nevera, con un NFC para abrirla al instante.

---

## 1. Qué hace el proyecto

- Muestra qué alimentos hacen falta en casa, organizados por categoría y prioridad.
- Permite agregar, editar, marcar como comprado y eliminar productos.
- Calcula automáticamente cuánto tiempo lleva pendiente cada producto.
- Genera un PDF listo para imprimir con la lista de compras.
- Funciona offline (PWA) y sincroniza los cambios cuando vuelve la conexión.
- Se abre automáticamente al acercar el celular a un NFC pegado en la nevera.
- Toda la información vive en una Google Sheet — sin bases de datos externas.

## 2. Arquitectura

```
NFC (etiqueta URL)
      │  acercas el celular
      ▼
GitHub Pages  (frontend estático: HTML + CSS + JS + PWA)
      │  fetch() con Content-Type: text/plain
      ▼
Google Apps Script  (Code.gs desplegado como "Aplicación web")
      │  SpreadsheetApp
      ▼
Google Sheets  (hojas: Alimentos, Categorias, Configuracion, Historial)
```

- **Frontend (GitHub Pages):** 100% estático. Nunca toca Google Sheets directamente,
  solo llama a la URL de tu Google Apps Script.
- **Backend (Google Apps Script):** actúa como API REST sencilla (`doGet` / `doPost`),
  valida datos, genera IDs, calcula estadísticas y registra el historial.
- **Base de datos (Google Sheets):** almacenamiento real de todos los productos.

---

## 3. Estructura de Google Sheets

Crea una Google Sheet nueva. El script crea automáticamente las hojas la primera vez
que lo ejecutas (función `asegurarHojas()`), pero aquí tienes la estructura de
referencia:

### Hoja `Alimentos`

| Columna | Tipo | Descripción |
|---|---|---|
| ID | texto | UUID generado automáticamente |
| Producto | texto | Nombre del alimento |
| Categoria | texto | Una de las categorías de la hoja `Categorias` |
| Cantidad | número | Cantidad |
| Unidad | texto | unidad, kg, litros, paquete, etc. |
| Prioridad | texto | Alta / Media / Baja |
| Estado | texto | Pendiente / Comprado |
| FechaAgregado | fecha/hora | Se llena automáticamente |
| FechaCompra | fecha/hora | Se llena al marcar como comprado |
| UltimaModificacion | fecha/hora | Se actualiza en cada cambio |
| FechaEstimada | fecha | Opcional, la define el usuario |
| StockMinimo | número | Opcional, para alertas de stock bajo |
| Nota | texto | Nota libre |
| Usuario | texto | Dispositivo/usuario que hizo el cambio |
| Activo | booleano | `false` cuando se "elimina" (no se borra la fila) |

### Hoja `Categorias`

| Nombre | Icono |
|---|---|
| Frutas | apple |
| Verduras | carrot |
| Lácteos | milk |
| … | … |

(Se crea automáticamente con 17 categorías por defecto; puedes editarla libremente.)

### Hoja `Configuracion`

Pares `Clave` / `Valor`: `appName`, `homeName`, `appUrl`, `webAppUrl`, `email`,
`horaRecordatorio`, `diasRecordatorio`, `diasAntiguo`.

### Hoja `Historial`

| IdAccion | FechaHora | Accion | Producto | IdProducto | Usuario | InfoAdicional |
|---|---|---|---|---|---|---|

Registra cada `Producto agregado`, `Producto comprado`, `Producto eliminado`,
`Producto modificado`, etc.

---

## 4. Estructura de archivos

```
mi-nevera/
│
├── index.html
├── style.css
├── manifest.json
├── service-worker.js
├── README.md
│
├── js/
│   ├── config.js          ← AQUÍ pegas la URL de tu Apps Script
│   ├── storage.js         ← caché local / cola offline
│   ├── api.js              ← llamadas a Google Apps Script
│   ├── ui.js                ← renderizado de la interfaz
│   ├── pdf.js               ← generación del PDF
│   ├── notifications.js     ← notificaciones del navegador
│   └── app.js                ← estado y orquestación general
│
├── assets/
│   └── icons/               ← iconos de la PWA (192/512, normal y maskable)
│
└── gas/
    └── Code.gs               ← código completo para Google Apps Script
```

---

## 5. Configurar Google Sheets y Google Apps Script

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja de cálculo
   nueva. Nómbrala, por ejemplo, **"Mi Nevera - Base de datos"**.
2. Abre **Extensiones → Apps Script**. Se abrirá el editor con un archivo
   `Código.gs` vacío.
3. Borra el contenido de `Código.gs` y pega **todo** el contenido de
   [`gas/Code.gs`](gas/Code.gs) de este proyecto.
4. Guarda el proyecto (icono de disquete o `Ctrl+S`). Dale un nombre, por ejemplo
   **"Mi Nevera API"**.
5. En el editor, selecciona en el desplegable de funciones `asegurarHojas` y pulsa
   **Ejecutar** una vez. La primera vez te pedirá autorizar permisos:
   - Pulsa **Revisar permisos** → elige tu cuenta → **Avanzado** →
     **Ir a "Mi Nevera API" (no seguro)** → **Permitir**.
   - Esto es normal: el aviso aparece porque el script es tuyo y no está verificado
     por Google, no porque sea inseguro.
6. Verifica en tu Google Sheet que se crearon las hojas `Alimentos`, `Categorias`,
   `Configuracion` e `Historial`.

### Desplegar como Web App

1. En el editor de Apps Script, pulsa **Implementar → Nueva implementación**.
2. En "Selecciona el tipo", elige **Aplicación web**.
3. Configura:
   - **Descripción:** "API Mi Nevera v1"
   - **Ejecutar como:** *Yo (tu cuenta)*
   - **Quién tiene acceso:** *Cualquier usuario* (necesario para que GitHub Pages
     pueda llamarla sin iniciar sesión).
4. Pulsa **Implementar**. Copia la **URL de la aplicación web** que te entrega,
   algo como:
   `https://script.google.com/macros/s/AKfycb.../exec`
5. Guarda esa URL, la necesitas en el siguiente paso.

> **Importante:** cada vez que modifiques `Code.gs`, debes crear una **nueva
> implementación** (o editar la existente con "Gestionar implementaciones" →
> lápiz de edición → "Nueva versión") para que los cambios se reflejen en la URL.

---

## 6. Configurar el frontend

Abre `js/config.js` y reemplaza la URL:

```javascript
const CONFIG = {
  API_URL: "PEGAR_AQUI_URL_DE_GOOGLE_APPS_SCRIPT", // 👈 pega aquí tu URL
  APP_NAME: "Mi Nevera",
  HOME_NAME: "Mi Hogar",
  ...
};
```

Alternativamente, puedes dejarlo así y pegar la URL desde la propia app, en
**⚙ Configuración → Avanzado → URL de Google Apps Script** (se guarda en el
navegador). Es útil si compartes el mismo `index.html` para varios hogares.

---

## 7. Subir a GitHub

```bash
cd mi-nevera
git init
git add .
git commit -m "Mi Nevera: primera versión"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mi-nevera.git
git push -u origin main
```

## 8. Activar GitHub Pages

1. En tu repositorio de GitHub, ve a **Settings → Pages**.
2. En "Build and deployment", elige **Deploy from a branch**.
3. Selecciona la rama `main` y la carpeta `/ (root)`.
4. Guarda. En unos minutos tu app estará en:
   `https://TU_USUARIO.github.io/mi-nevera/`

---

## 9. Configurar la PWA

Ya está lista para instalarse tal cual (`manifest.json` + `service-worker.js`).

- **Android (Chrome):** al abrir la URL aparecerá un banner o el menú ⋮ →
  "Instalar aplicación" / "Agregar a pantalla de inicio".
- **iPhone/iPad (Safari):** botón compartir → "Agregar a pantalla de inicio"
  (iOS no muestra el banner automático de instalación, pero funciona igual).
- **Computador (Chrome/Edge):** icono de instalación en la barra de direcciones.

---

## 10. Configurar el NFC

El NFC solo necesita guardar la **URL pública** de tu GitHub Pages, por ejemplo:

```
https://TU_USUARIO.github.io/mi-nevera/
```

Pasos con una app de escritura NFC (por ejemplo, "NFC Tools" en Android/iOS):

1. Instala una app de lectura/escritura NFC.
2. Elige "Escribir" → "Añadir un registro" → **URL / URI**.
3. Pega la URL de tu GitHub Pages.
4. Acerca el celular al NFC físico para grabarlo.
5. Pega el NFC en un lugar accesible de la nevera.

Al acercar cualquier celular con NFC activado, el sistema operativo abrirá la URL
en el navegador (o directamente en la PWA si ya está instalada).

Opcional: agrega `?origen=nfc` al final de la URL grabada en el NFC
(`https://TU_USUARIO.github.io/mi-nevera/?origen=nfc`) para que la app sepa que
viene de un acceso directo y muestre el saludo de bienvenida ("Buenos días 👋").

---

## 11. Configurar notificaciones

Hay dos mecanismos, con límites reales que es importante entender:

### A. Notificaciones del navegador (Web Notifications API)

- Se activan desde **⚙ Configuración → Notificaciones → "Activar notificaciones
  del navegador"**.
- Solo funcionan **mientras la pestaña o la PWA instalada sigue abierta** (o poco
  tiempo después, según el sistema operativo).
- GitHub Pages es un sitio 100% estático: **no puede enviar push real con la app
  cerrada**, porque eso requiere un servidor push propio (protocolo Web Push con
  claves VAPID), que este proyecto no incluye a propósito para mantenerlo simple
  y sin servidor.

### B. Recordatorios por correo (Google Apps Script — sí funcionan con la app cerrada)

1. En la app, ve a **⚙ Configuración → Notificaciones** y guarda tu correo.
2. En el editor de Apps Script, abre la función `crearTriggers` y ejecútala **una
   sola vez** (menú "Ejecutar"). Esto programa:
   - Un trigger **diario** (`revisarPendientesAntiguos`, 8:00 a.m.) que avisa si
     hay productos con muchos días pendientes.
   - Un trigger **semanal** (`enviarResumenSemanal`, sábados 9:00 a.m.) con el
     resumen de la semana.
3. Puedes revisar o eliminar los triggers desde el editor de Apps Script, menú
   del reloj ⏰ ("Disparadores").

---

## 12. Generar el PDF

El botón **"📄 Descargar PDF"** usa la librería [jsPDF](https://github.com/parallax/jsPDF)
cargada desde un CDN, directamente en el navegador (no requiere backend). Genera
un PDF agrupado por categoría, con casillas para marcar, prioridad y un resumen
total, y lo descarga como `Lista_de_compras_AAAA-MM-DD.pdf`.

---

## 13. Modo offline

- El *Service Worker* cachea el "app shell" (HTML, CSS, JS, iconos) para que la
  app cargue incluso sin conexión.
- Los productos se guardan en `localStorage` como caché de lectura, y los
  cambios hechos sin conexión (agregar, editar, comprar, eliminar) se guardan en
  una **cola de sincronización** y se envían automáticamente a Google Sheets en
  cuanto vuelve la conexión.
- El indicador superior muestra `✓ Sincronizado`, `⚠ Sin conexión` o
  `✓ Conexión restaurada` según corresponda.

---

## 14. Modo Nevera

El botón ❄ en el encabezado activa una interfaz con textos y botones más
grandes, pensada para una tablet montada en la puerta de la nevera.

---

## 15. Pruebas a realizar

1. **Conexión:** abre la app con la URL de GitHub Pages y confirma que aparece
   `✓ Sincronizado` (si aparece `⚠ Configura la URL de Apps Script`, revisa el
   paso 6).
2. **Agregar producto:** pulsa "Falta algo", llena el formulario y guarda.
   Verifica que aparece en la Google Sheet, hoja `Alimentos`.
3. **Editar:** cambia cantidad o nota de un producto y confirma que se actualiza
   en la hoja (columna `UltimaModificacion` debe cambiar).
4. **Marcar como comprado:** confirma que pasa a la sección "Comprados" y que se
   llena `FechaCompra` en la hoja.
5. **Restaurar:** desde "Comprados", muévelo de nuevo a pendientes.
6. **Eliminar:** confirma el diálogo y revisa que en la hoja la fila queda con
   `Activo = FALSE` (no se borra el historial).
7. **Buscador y filtros:** prueba buscar por nombre, categoría y nota; prueba
   cada chip de filtro y de categoría.
8. **PDF:** pulsa "Descargar PDF" y confirma que se descarga un PDF agrupado por
   categoría con el resumen correcto.
9. **Offline:** activa el modo avión, agrega o edita un producto (debe guardarse
   localmente con aviso "Sin conexión: se guardó localmente…"), luego desactiva
   el modo avión y confirma el mensaje "Cambios pendientes sincronizados".
10. **PWA:** instala la app desde el navegador y confirma que abre en modo
    standalone (sin barra de direcciones).
11. **NFC:** graba la URL en un tag NFC y acércalo con el celular; confirma que
    abre la app y muestra el saludo de bienvenida.
12. **Notificaciones del navegador:** actívalas desde Configuración y confirma
    que llega la notificación de prueba.
13. **Notificaciones por correo:** ejecuta manualmente `revisarPendientesAntiguos`
    o `enviarResumenSemanal` desde el editor de Apps Script y confirma que llega
    el correo.

---

## 16. Solución de errores frecuentes

| Problema | Causa probable | Solución |
|---|---|---|
| `⚠ Configura la URL de Apps Script` | No pegaste la URL en `config.js` ni en Configuración | Revisa el paso 6 |
| `No fue posible conectar con Google Sheets` | Sin internet, o la implementación de Apps Script no es pública | En Apps Script, revisa que "Quién tiene acceso" sea "Cualquier usuario" |
| Los cambios no llegan a la hoja | Editaste `Code.gs` pero no creaste una nueva implementación | "Implementar → Gestionar implementaciones → editar → Nueva versión" |
| El PDF no se genera | Sin conexión (jsPDF se carga desde un CDN) | Conéctate a internet e inténtalo de nuevo |
| Las notificaciones del navegador no llegan | Permiso bloqueado o app cerrada/en segundo plano | Revisa los permisos del sitio; recuerda que solo funcionan con la app abierta |
| El NFC no abre la app | El tag no se grabó como registro URL, o el NFC del celular está apagado | Revisa la configuración de NFC del celular y vuelve a grabar el tag |
| La app no se ve bien / faltan iconos | Bloqueador de contenido bloqueando la CDN de Lucide Icons o Google Fonts | Permite esos dominios o revisa la consola del navegador |

---

## 17. Evolución futura

La estructura de columnas de `Alimentos` (cantidad actual, stock mínimo, fecha
estimada, etc.) y la separación de la API en Apps Script están pensadas para
poder crecer hacia un inventario completo, recetas, planificación semanal,
presupuesto, códigos de barras o múltiples usuarios, sin tener que rehacer la
base de datos.

---

## 18. Seguridad

- El frontend nunca contiene contraseñas ni credenciales: solo la URL pública
  de tu Web App de Apps Script (que ya tiene sus propios permisos de Google).
- La hoja de cálculo nunca se expone directamente; todo pasa por las funciones
  validadas de `Code.gs`.
- No subas a GitHub ninguna clave de API de terceros si en el futuro agregas
  integraciones adicionales.
