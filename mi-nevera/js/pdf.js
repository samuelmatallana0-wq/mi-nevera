/* =========================================================
   PDF.JS
   Genera un PDF de la lista de compras usando jsPDF
   (cargado desde CDN, ver index.html / carga diferida abajo).
   ========================================================= */

const PdfGenerador = {

  _libCargada: false,

  async _asegurarLibreria() {
    if (this._libCargada || (window.jspdf && window.jspdf.jsPDF)) {
      this._libCargada = true;
      return;
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("No fue posible cargar el generador de PDF. Comprueba tu conexión a Internet."));
      document.head.appendChild(script);
    });
    this._libCargada = true;
  },

  async generar(productosPendientes, nombreHogar) {
    await this._asegurarLibreria();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const margenX = 48;
    let y = 56;
    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();

    const azul = [59, 130, 246];
    const gris = [71, 85, 105];
    const grisClaro = [148, 163, 184];

    // ---------- Encabezado ----------
    doc.setFillColor(...azul);
    doc.rect(0, 0, anchoPagina, 90, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("LISTA DE COMPRAS", margenX, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(nombreHogar || "Mi Hogar", margenX, 60);

    const ahora = new Date();
    const fechaTexto = ahora.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota" });
    const horaTexto = ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
    doc.setFontSize(10);
    doc.text(`Generado el ${fechaTexto} a las ${horaTexto}`, margenX, 76);

    y = 118;

    // ---------- Resumen ----------
    const total = productosPendientes.length;
    const alta = productosPendientes.filter(p => p.prioridad === "Alta").length;
    const media = productosPendientes.filter(p => p.prioridad === "Media").length;
    const baja = productosPendientes.filter(p => p.prioridad === "Baja").length;

    doc.setTextColor(...gris);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Total de productos: ${total}`, margenX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...grisClaro);
    doc.text(`Alta prioridad: ${alta}      Media prioridad: ${media}      Baja prioridad: ${baja}`, margenX, y + 16);
    y += 40;

    // ---------- Agrupar por categoría ----------
    const porCategoria = {};
    productosPendientes.forEach(p => {
      const cat = p.categoria || "Otros";
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(p);
    });

    const categoriasOrdenadas = Object.keys(porCategoria).sort();

    const alturaLinea = 22;
    const alturaTituloCategoria = 26;

    categoriasOrdenadas.forEach(categoria => {
      // Salto de página si no hay espacio
      if (y > altoPagina - 100) {
        doc.addPage();
        y = 56;
      }

      doc.setFillColor(219, 234, 254);
      doc.roundedRect(margenX, y - 16, anchoPagina - margenX * 2, alturaTituloCategoria, 4, 4, "F");
      doc.setTextColor(30, 64, 175);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(categoria.toUpperCase(), margenX + 10, y);
      y += alturaTituloCategoria + 4;

      // Orden por prioridad dentro de la categoría
      const orden = { Alta: 0, Media: 1, Baja: 2 };
      const items = porCategoria[categoria].sort((a, b) => (orden[a.prioridad] ?? 1) - (orden[b.prioridad] ?? 1));

      items.forEach(p => {
        if (y > altoPagina - 60) {
          doc.addPage();
          y = 56;
        }
        // Casilla
        doc.setDrawColor(...grisClaro);
        doc.setLineWidth(1.2);
        doc.rect(margenX + 6, y - 10, 12, 12);

        // Prioridad (color de punto)
        const colorPrioridad = p.prioridad === "Alta" ? [239, 68, 68] : p.prioridad === "Baja" ? [34, 197, 94] : [245, 158, 11];
        doc.setFillColor(...colorPrioridad);
        doc.circle(margenX + 32, y - 4, 3, "F");

        doc.setTextColor(30, 41, 59);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const textoProducto = `${p.producto} — ${p.cantidad} ${p.unidad || ""}`.trim();
        doc.text(textoProducto, margenX + 42, y);

        if (p.nota) {
          doc.setFontSize(9);
          doc.setTextColor(...grisClaro);
          const notaCorta = p.nota.length > 60 ? p.nota.slice(0, 57) + "..." : p.nota;
          doc.text(`(${notaCorta})`, margenX + 42, y + 12);
          y += 12;
        }

        y += alturaLinea;
      });

      y += 6;
    });

    // ---------- Pie de página en todas las páginas ----------
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(...grisClaro);
      doc.text(`${CONFIG.APP_NAME} · Página ${i} de ${totalPaginas}`, margenX, altoPagina - 24);
    }

    const nombreArchivo = `Lista_de_compras_${ahora.toISOString().slice(0, 10)}.pdf`;
    doc.save(nombreArchivo);
    return nombreArchivo;
  }
};
