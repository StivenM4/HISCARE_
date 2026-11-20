// public/js/orden_impresion.js — Lógica de cliente para la vista de impresión de orden médica con código de barras (C.8)

(function (global) {
  'use strict';

  /**
   * Generador de código de barras CODE-128 nativo en SVG como mecanismo de respaldo
   * en caso de que la librería externa JsBarcode tarde en cargar o falle su CDN/bundle.
   */
  function generarCodigoBarrasFallback(svgElement, codigo) {
    if (!svgElement || !codigo) return false;

    // Patrones estándar Code 128 (B)
    const patterns = [
      '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
      '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
      '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
      '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
      '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
      '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
      '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
      '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
      '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
      '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
      '114131','311141','411131','211412','211214','211232','2331112'
    ];

    let sum = 104; // START B
    const sequence = [104];
    for (let i = 0; i < codigo.length; i++) {
      const charCode = codigo.charCodeAt(i) - 32;
      sequence.push(charCode);
      sum += charCode * (i + 1);
    }
    const checkDigit = sum % 103;
    sequence.push(checkDigit);
    sequence.push(106); // STOP

    let barString = '';
    sequence.forEach(idx => {
      barString += patterns[idx] || '';
    });

    const barWidth = 2;
    const height = 45;
    let x = 0;
    let svgContent = '';

    for (let i = 0; i < barString.length; i++) {
      const width = parseInt(barString[i], 10) * barWidth;
      if (i % 2 === 0) {
        svgContent += `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000000" />`;
      }
      x += width;
    }

    svgElement.setAttribute('viewBox', `0 0 ${x} ${height}`);
    svgElement.innerHTML = svgContent;
    return true;
  }

  /**
   * Inicializa la barra de código con JsBarcode (CODE128)
   */
  function inicializarCodigoBarras() {
    const svg = document.getElementById('barcode');
    if (!svg) return;

    const codigo = svg.getAttribute('data-codigo') ||
                   (svg.dataset && svg.dataset.codigo) ||
                   (document.getElementById('barcodeText') && document.getElementById('barcodeText').textContent.trim()) ||
                   'ORD-89001';

    if (typeof global.JsBarcode === 'function') {
      try {
        global.JsBarcode('#barcode', codigo, {
          format: 'CODE128',
          displayValue: false,
          height: 45,
          width: 2,
          margin: 0
        });
        return;
      } catch (err) {
        console.warn('JsBarcode arrojó error, aplicando fallback nativo:', err);
      }
    }

    // Si JsBarcode no está disponible o falló, usar fallback nativo
    generarCodigoBarrasFallback(svg, codigo);
  }

  /**
   * Configura eventos de la barra de acciones (Imprimir, Volver, Atajos)
   */
  function inicializarAcciones() {
    // Botón Imprimir
    const btnImprimir = document.getElementById('btnImprimir') || document.querySelector('[data-action="imprimir"]');
    if (btnImprimir) {
      btnImprimir.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        window.print();
      });
    }

    // Botón Volver
    const btnVolver = document.getElementById('btnVolver') || document.querySelector('[data-action="volver"]');
    if (btnVolver) {
      btnVolver.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (window.history && window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = '/ordenes';
        }
      });
    }

    // Atajos de teclado: Escape vuelve atrás
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (btnVolver) {
          btnVolver.click();
        } else if (window.history && window.history.length > 1) {
          window.history.back();
        }
      }
    });

    // Auto-impresión si se pasa ?autoprint=1 o ?print=true en la URL
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autoprint') === '1' || params.get('print') === 'true') {
        setTimeout(function () {
          window.print();
        }, 300);
      }
    }
  }

  function init() {
    inicializarCodigoBarras();
    inicializarAcciones();
  }

  // Ejecución automática al cargar DOM
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Exportar utilidades para entorno de pruebas Node / ES / CJS
  const modulo = {
    inicializarCodigoBarras,
    inicializarAcciones,
    generarCodigoBarrasFallback,
    init
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = modulo;
  } else {
    global.OrdenImpresion = modulo;
  }
})(typeof window !== 'undefined' ? window : globalThis);
