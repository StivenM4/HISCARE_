// public/js/diagnosticos.js — Lógica de cliente para Pantalla C.20 (Codificación CIE-10 y Procedimientos CUPS)
// Requisitos: HIS-F-17, HIS-F-18, HIS-F-19, HIS-NF-11, HIS-D-06, HIS-E-11 · EDT: DIA-01, DIA-02, DIA-03, DIA-04, DIA-08
(function (global) {
  'use strict';

  // Helpers comunes o fallback
  var HIS = global.HIS || {};
  var escapeHtml = (HIS.escapeHtml || (global.HISCARE && global.HISCARE.escapeHtml)) || function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  function mostrarMensaje(tipo, texto) {
    if (typeof document === 'undefined') return;
    if (HIS.mostrarMensaje) {
      return HIS.mostrarMensaje(tipo, texto);
    }
    var cont = document.getElementById('contenedorAlertasCodificacion') || document.getElementById('alertas');
    if (!cont) return;
    var div = document.createElement('div');
    div.className = 'alert alert-' + tipo + ' alert-dismissible fade show shadow-sm';
    div.role = 'alert';
    var span = document.createElement('span');
    span.textContent = texto == null ? '' : String(texto);
    var btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'btn-close';
    btnClose.setAttribute('data-bs-dismiss', 'alert');
    btnClose.setAttribute('aria-label', 'Cerrar');
    div.appendChild(span);
    div.appendChild(btnClose);
    cont.replaceChildren(div);
  }

  /**
   * Sanitiza mensajes de error previniendo fugas técnicas (HIS-E-12).
   */
  function sanitizarMensajeError(mensaje) {
    if (!mensaje) return 'Ocurrió un error inesperado al procesar la solicitud.';
    var str = String(mensaje);
    if (/cerrad/i.test(str) || /bloqueo/i.test(str)) {
      return 'La atención clínica se encuentra cerrada y no permite modificaciones.';
    }
    if (/ux_diag_principal/i.test(str) || /dos principales/i.test(str)) {
      return 'No es posible asignar más de un diagnóstico principal para la misma atención.';
    }
    if (/sin principal/i.test(str) || /exactamente un diagn/i.test(str)) {
      return 'Debe registrar exactamente un diagnóstico PRINCIPAL.';
    }
    if (/trg_|trigger|insert\s+into|select\s+|update\s+|delete\s+|pq:|pg_|relation\s+|constraint\s+|syntax error|check/i.test(str)) {
      return 'No fue posible completar la operación debido a una restricción de validación en el servidor.';
    }
    return str;
  }

  /**
   * Valida la estructura de codificación antes del envío al servidor.
   * Reglas:
   * - Al menos un diagnóstico
   * - Exactamente 1 diagnóstico PRINCIPAL
   * - Máximo 10 diagnósticos SECUNDARIOS
   *
   * @param {Array} diags - Lista de diagnósticos
   * @param {Array} procs - Lista de procedimientos
   * @returns {Object} { valido: boolean, error: string|null }
   */
  function validarCodificacion(diags, procs) {
    if (!diags || diags.length === 0) {
      return { valido: false, error: 'Debe registrar al menos un diagnóstico principal para la atención.' };
    }

    var principales = diags.filter(function (d) { return d.tipo === 'PRINCIPAL'; });
    if (principales.length === 0) {
      return { valido: false, error: 'Debe existir exactamente un diagnóstico PRINCIPAL. Seleccione uno de la lista.' };
    }
    if (principales.length > 1) {
      return { valido: false, error: 'Solo puede haber un diagnóstico PRINCIPAL seleccionado a la vez.' };
    }

    var secundarios = diags.filter(function (d) { return d.tipo === 'SECUNDARIO'; });
    if (secundarios.length > 10) {
      return { valido: false, error: 'No se permiten más de 10 diagnósticos secundarios (actualmente tiene ' + secundarios.length + ').' };
    }

    return { valido: true, error: null };
  }

  /**
   * Obtiene la fecha actual en formato YYYY-MM-DD.
   */
  function obtenerFechaHoy() {
    var d = new Date();
    var anio = d.getFullYear();
    var mes = String(d.getMonth() + 1).padStart(2, '0');
    var dia = String(d.getDate()).padStart(2, '0');
    return anio + '-' + mes + '-' + dia;
  }

  /**
   * Estado reactivo en memoria
   */
  var diagnosticos = [];
  var procedimientos = [];
  var diagnosticosOriginales = [];
  var procedimientosOriginales = [];
  var autocompletarCie10 = null;
  var autocompletarCups = null;

  /**
   * Inicializa la vista y sus controladores reactivos.
   */
  function initCodificacion() {
    if (typeof document === 'undefined') return;

    var contenedor = document.getElementById('contenedorCodificacion') || document.getElementById('moduloCodificacion');
    if (!contenedor) return;

    var atencionId = contenedor.getAttribute('data-atencion-id') || (location.pathname.split('/')[2] || '');
    var esSoloLectura = contenedor.getAttribute('data-solo-lectura') === 'true';

    // Leer datos iniciales inyectados en la plantilla
    var scriptDatos = document.getElementById('datosInicialesCodificacion') || document.getElementById('diagnosticosInicialesData');
    if (scriptDatos && scriptDatos.textContent) {
      try {
        var parsed = JSON.parse(scriptDatos.textContent || '{}');
        if (Array.isArray(parsed)) {
          diagnosticos = parsed.map(function (d) {
            return {
              id: d.id || null,
              cie10_id: d.cie10_id || d.id,
              codigo: String(d.codigo || '').trim().toUpperCase(),
              descripcion: String(d.descripcion || '').trim(),
              tipo: (d.tipo === 'PRINCIPAL') ? 'PRINCIPAL' : 'SECUNDARIO'
            };
          });
        } else if (parsed && Array.isArray(parsed.diagnosticos)) {
          diagnosticos = parsed.diagnosticos.map(function (d) {
            return {
              id: d.id || null,
              cie10_id: d.cie10_id || d.id,
              codigo: String(d.codigo || '').trim().toUpperCase(),
              descripcion: String(d.descripcion || '').trim(),
              tipo: (d.tipo === 'PRINCIPAL') ? 'PRINCIPAL' : 'SECUNDARIO'
            };
          });
        }
      } catch (e) {
        console.warn('Error al parsear diagnósticos iniciales:', e);
      }
    }

    var scriptProc = document.getElementById('procedimientosInicialesData') || document.getElementById('datosInicialesCodificacion');
    if (scriptProc && scriptProc.textContent) {
      try {
        var parsedProc = JSON.parse(scriptProc.textContent || '{}');
        if (Array.isArray(parsedProc)) {
          procedimientos = parsedProc.map(function (p) {
            return {
              id: p.id || null,
              cups_id: p.cups_id || p.id,
              codigo: String(p.codigo || '').trim().toUpperCase(),
              descripcion: String(p.descripcion || '').trim(),
              fecha: p.fecha ? (typeof p.fecha === 'string' ? p.fecha.slice(0, 10) : new Date(p.fecha).toISOString().slice(0, 10)) : obtenerFechaHoy()
            };
          });
        } else if (parsedProc && Array.isArray(parsedProc.procedimientos)) {
          procedimientos = parsedProc.procedimientos.map(function (p) {
            return {
              id: p.id || null,
              cups_id: p.cups_id || p.id,
              codigo: String(p.codigo || '').trim().toUpperCase(),
              descripcion: String(p.descripcion || '').trim(),
              fecha: p.fecha ? (typeof p.fecha === 'string' ? p.fecha.slice(0, 10) : new Date(p.fecha).toISOString().slice(0, 10)) : obtenerFechaHoy()
            };
          });
        }
      } catch (e) {
        console.warn('Error al parsear procedimientos iniciales:', e);
      }
    }

    // Clonar estado inicial para descartar
    diagnosticosOriginales = JSON.parse(JSON.stringify(diagnosticos));
    procedimientosOriginales = JSON.parse(JSON.stringify(procedimientos));

    // Elementos del DOM
    var inputCie10 = document.getElementById('inputBuscarCie10') || document.getElementById('buscarCie10Input');
    var alertaCie10Invalido = document.getElementById('alertaCie10Invalido') || document.getElementById('sugerenciasCie10Mensaje');
    var textoCie10Invalido = document.getElementById('textoCie10Invalido');
    var contenedorSugerenciasInvalidas = document.getElementById('contenedorSugerenciasInvalidas');
    var btnCerrarAlertaInvalido = document.getElementById('btnCerrarAlertaInvalido');

    var inputCups = document.getElementById('inputBuscarCups') || document.getElementById('buscarCupsInput');
    var btnDescartar = document.getElementById('btnDescartar') || document.getElementById('btnDescartarCodificacion');
    var btnGuardar = document.getElementById('btnGuardarCodificacion');
    var spinnerGuardar = document.getElementById('spinnerGuardar');
    var textoBotonGuardar = document.getElementById('textoBotonGuardar') || document.getElementById('textoGuardar');

    // Inicializar autocompletado CIE-10 [20.28 - 20.34]
    if (inputCie10 && !esSoloLectura && global.Autocompletar) {
      autocompletarCie10 = new global.Autocompletar(inputCie10, {
        endpoint: '/api/cie10/buscar',
        minCaracteres: 2,
        debounceMs: 300,
        paramQuery: 'q',
        dataTraceDropdown: 'C20-29',
        dataTraceItem: function (item, idx) {
          return 'C20-' + Math.min(34, 29 + idx);
        },
        renderItem: function (item) {
          var codigo = escapeHtml(item && item.codigo ? item.codigo : '');
          var descripcion = escapeHtml(item && (item.descripcion || item.nombre) ? (item.descripcion || item.nombre) : '');
          return '<div class="d-flex align-items-center justify-content-between w-100">' +
            '<div class="d-flex align-items-center gap-2 text-truncate">' +
              '<span class="badge bg-primary text-white font-monospace px-2 py-1">' +
                codigo +
              '</span>' +
              '<span class="text-dark small fw-medium text-truncate">' +
                descripcion +
              '</span>' +
            '</div>' +
            '<span class="badge bg-light text-secondary border small">CIE-10</span>' +
          '</div>';
        },
        onSeleccionar: function (item) {
          agregarDiagnostico(item);
          ocultarAlertaInvalido();
        },
        onTextoInvalido: function (texto, sugerencias) {
          mostrarAlertaInvalido(texto, sugerencias);
        }
      });
    }

    // Inicializar autocompletado CUPS [20.42]
    if (inputCups && !esSoloLectura && global.Autocompletar) {
      autocompletarCups = new global.Autocompletar(inputCups, {
        endpoint: '/api/cups/buscar',
        minCaracteres: 2,
        debounceMs: 300,
        paramQuery: 'q',
        renderItem: function (item) {
          var codigo = escapeHtml(item && item.codigo ? item.codigo : '');
          var descripcion = escapeHtml(item && (item.descripcion || item.nombre) ? (item.descripcion || item.nombre) : '');
          return '<div class="d-flex align-items-center justify-content-between w-100">' +
            '<div class="d-flex align-items-center gap-2 text-truncate">' +
              '<span class="badge bg-secondary-subtle text-secondary font-monospace px-2 py-1 border">' +
                codigo +
              '</span>' +
              '<span class="text-dark small fw-medium text-truncate">' +
                descripcion +
              '</span>' +
            '</div>' +
            '<span class="badge bg-light text-secondary border small">CUPS</span>' +
          '</div>';
        },
        onSeleccionar: function (item) {
          agregarProcedimiento(item);
        }
      });
    }

    // Cerrar alerta de código inválido
    if (btnCerrarAlertaInvalido) {
      btnCerrarAlertaInvalido.addEventListener('click', function () {
        ocultarAlertaInvalido();
      });
    }

    /**
     * Muestra la alerta de código CIE-10 inválido con sugerencias clickeables [20.40]
     */
    function mostrarAlertaInvalido(texto, sugerencias) {
      if (!alertaCie10Invalido) return;
      if (textoCie10Invalido) {
        textoCie10Invalido.textContent = '"' + texto + '" no es un código CIE-10 vigente. Seleccione una sugerencia del catálogo';
      }

      if (contenedorSugerenciasInvalidas) {
        contenedorSugerenciasInvalidas.innerHTML = '';
        if (Array.isArray(sugerencias) && sugerencias.length > 0) {
          var sugerenciasHtml = document.createElement('div');
          sugerenciasHtml.className = 'd-flex flex-wrap gap-2 mt-2';

          sugerencias.slice(0, 5).forEach(function (sug) {
            var btnSug = document.createElement('button');
            btnSug.type = 'button';
            btnSug.className = 'btn btn-sm btn-outline-warning bg-white text-dark border-warning-subtle d-inline-flex align-items-center gap-1 shadow-sm';
            btnSug.innerHTML = '<span class="font-monospace fw-bold">' + escapeHtml(sug.codigo || '') + '</span> <span>' + escapeHtml(sug.descripcion || '') + '</span>';
            btnSug.addEventListener('click', function () {
              agregarDiagnostico(sug);
              ocultarAlertaInvalido();
            });
            sugerenciasHtml.appendChild(btnSug);
          });
          contenedorSugerenciasInvalidas.appendChild(sugerenciasHtml);
        }
      }

      alertaCie10Invalido.classList.remove('d-none');
    }

    function ocultarAlertaInvalido() {
      if (alertaCie10Invalido) {
        alertaCie10Invalido.classList.add('d-none');
      }
    }

    /**
     * Agrega un diagnóstico al estado reactivo.
     * Si es el primero, se marca automáticamente como PRINCIPAL.
     */
    function agregarDiagnostico(item) {
      if (esSoloLectura) return;

      var cie10Id = item.cie10_id || item.id;
      var codigo = String(item.codigo || '').trim().toUpperCase();

      // Verificar si ya está en la lista
      var yaExiste = diagnosticos.some(function (d) {
        return (d.cie10_id && d.cie10_id === cie10Id) || (d.codigo && d.codigo === codigo);
      });

      if (yaExiste) {
        mostrarMensaje('warning', 'El diagnóstico ' + codigo + ' ya se encuentra agregado en esta atención.');
        return;
      }

      // Validar máximo 10 secundarios
      var secundariosActuales = diagnosticos.filter(function (d) { return d.tipo === 'SECUNDARIO'; }).length;
      if (diagnosticos.length > 0 && secundariosActuales >= 10) {
        mostrarMensaje('warning', 'Ha alcanzado el límite máximo permitido de 10 diagnósticos secundarios.');
        return;
      }

      var esPrimerDiagnostico = (diagnosticos.length === 0);
      var nuevoTipo = esPrimerDiagnostico ? 'PRINCIPAL' : 'SECUNDARIO';

      diagnosticos.push({
        id: null,
        cie10_id: cie10Id,
        codigo: codigo,
        descripcion: String(item.descripcion || '').trim(),
        tipo: nuevoTipo
      });

      renderTablaDiagnosticos();
      global.HIS?.marcarFormularioSucio?.();
      global.HIS?.anunciarCambio?.('Diagnóstico ' + codigo + ' agregado a la tabla.');
    }

    /**
     * Cambia el diagnóstico seleccionado a PRINCIPAL y los demás a SECUNDARIO.
     */
    function establecerPrincipal(indice) {
      if (esSoloLectura) return;
      if (indice < 0 || indice >= diagnosticos.length) return;

      diagnosticos.forEach(function (d, i) {
        d.tipo = (i === indice) ? 'PRINCIPAL' : 'SECUNDARIO';
      });

      renderTablaDiagnosticos();
      global.HIS?.marcarFormularioSucio?.();
      global.HIS?.anunciarCambio?.('Diagnóstico principal actualizado.');
    }

    /**
     * Remueve un diagnóstico del estado reactivo.
     * Si se remueve el PRINCIPAL y quedan otros, promueve el primero a PRINCIPAL.
     */
    function removerDiagnostico(indice) {
      if (esSoloLectura) return;
      if (indice < 0 || indice >= diagnosticos.length) return;

      var removido = diagnosticos[indice];
      diagnosticos.splice(indice, 1);

      if (removido.tipo === 'PRINCIPAL' && diagnosticos.length > 0) {
        // Promover el primer diagnóstico restante a PRINCIPAL
        diagnosticos[0].tipo = 'PRINCIPAL';
        mostrarMensaje('info', 'Se promovió ' + diagnosticos[0].codigo + ' como diagnóstico PRINCIPAL.');
      }

      renderTablaDiagnosticos();
      global.HIS?.marcarFormularioSucio?.();
      global.HIS?.anunciarCambio?.('Diagnóstico ' + (removido.codigo || '') + ' removido de la tabla.');
    }

    /**
     * Renderiza las filas de la tabla de diagnósticos [20.35 - 20.39].
     */
    function renderTablaDiagnosticos() {
      var tbody = document.getElementById('tbodyDiagnosticos') || document.getElementById('cuerpoTablaDiagnosticos');
      if (!tbody) return;

      tbody.innerHTML = '';

      if (diagnosticos.length === 0) {
        var trVacio = document.createElement('tr');
        trVacio.id = 'filaSinDiagnosticos';
        trVacio.innerHTML = '<td colspan="4" class="text-center text-muted py-4">' +
          '<div class="d-flex flex-column align-items-center gap-1">' +
            '<span class="fw-medium">No se han registrado diagnósticos para esta atención.</span>' +
            '<span class="small text-secondary">Utilice el buscador superior para agregar diagnósticos CIE-10 oficiales.</span>' +
          '</div>' +
        '</td>';
        tbody.appendChild(trVacio);
        return;
      }

      diagnosticos.forEach(function (diag, index) {
        var tr = document.createElement('tr');
        tr.className = 'fila-diagnostico align-middle';
        tr.setAttribute('data-cie10-id', diag.cie10_id || '');
        tr.setAttribute('data-codigo', diag.codigo || '');

        // Columna Código [20.36]
        var tdCodigo = document.createElement('td');
        tdCodigo.className = 'font-monospace fw-bold text-nowrap';
        tdCodigo.innerHTML = '<span class="badge bg-light text-dark border px-2 py-1 font-monospace">' +
          escapeHtml(diag.codigo || '') +
          '</span>';
        tr.appendChild(tdCodigo);

        // Columna Descripción
        var tdDesc = document.createElement('td');
        tdDesc.className = 'text-dark small fw-medium';
        tdDesc.textContent = diag.descripcion;
        tr.appendChild(tdDesc);

        // Columna Tipo [20.37, 20.39]
        var tdTipo = document.createElement('td');
        tdTipo.className = 'text-center text-nowrap';

        var esPrincipal = (diag.tipo === 'PRINCIPAL');
        var btnPill = document.createElement('button');
        btnPill.type = 'button';
        btnPill.className = 'btn btn-sm badge px-3 py-2 btn-tipo-diag ' + (esPrincipal ? 'btn-diag-principal shadow-sm' : 'btn-diag-secundario');
        btnPill.setAttribute('data-trace', 'C20-39');
        btnPill.setAttribute('role', 'radio');
        btnPill.setAttribute('aria-checked', esPrincipal ? 'true' : 'false');
        btnPill.setAttribute('aria-label', esPrincipal ? 'Diagnóstico Principal' : 'Diagnóstico Secundario (clic para hacer Principal)');

        if (esPrincipal) {
          btnPill.textContent = 'PRINCIPAL';
          btnPill.disabled = esSoloLectura;
        } else {
          btnPill.textContent = 'SECUNDARIO';
          if (esSoloLectura) {
            btnPill.disabled = true;
          } else {
            btnPill.style.cursor = 'pointer';
            btnPill.title = 'Haga clic para establecer como diagnóstico PRINCIPAL';
            btnPill.addEventListener('click', function () {
              establecerPrincipal(index);
            });
          }
        }
        tdTipo.appendChild(btnPill);
        tr.appendChild(tdTipo);

        // Columna Acciones / Eliminar [20.38]
        var tdAccion = document.createElement('td');
        tdAccion.className = 'text-center text-nowrap';
        if (!esSoloLectura) {
          var btnEliminar = document.createElement('button');
          btnEliminar.type = 'button';
          btnEliminar.className = 'btn btn-sm btn-link text-danger text-decoration-none fw-bold p-0 btn-eliminar-diag';
          btnEliminar.setAttribute('data-trace', 'C20-38');
          btnEliminar.setAttribute('title', 'Remover diagnóstico');
          btnEliminar.setAttribute('aria-label', 'Remover ' + diag.codigo);
          btnEliminar.textContent = '✕';
          btnEliminar.addEventListener('click', function () {
            removerDiagnostico(index);
          });
          tdAccion.appendChild(btnEliminar);
        } else {
          tdAccion.innerHTML = '<span class="text-muted small">—</span>';
        }
        tr.appendChild(tdAccion);

        tbody.appendChild(tr);
      });
    }

    /**
     * Agrega un procedimiento CUPS al estado reactivo.
     */
    function agregarProcedimiento(item) {
      if (esSoloLectura) return;

      var cupsId = item.cups_id || item.id;
      var codigo = String(item.codigo || '').trim().toUpperCase();

      procedimientos.push({
        id: null,
        cups_id: cupsId,
        codigo: codigo,
        descripcion: String(item.descripcion || '').trim(),
        fecha: obtenerFechaHoy()
      });

      renderTablaProcedimientos();
      global.HIS?.marcarFormularioSucio?.();
      global.HIS?.anunciarCambio?.('Procedimiento ' + codigo + ' agregado a la tabla.');
    }

    /**
     * Remueve un procedimiento del estado reactivo.
     */
    function removerProcedimiento(indice) {
      if (esSoloLectura) return;
      if (indice < 0 || indice >= procedimientos.length) return;

      var removido = procedimientos[indice];
      procedimientos.splice(indice, 1);
      renderTablaProcedimientos();
      global.HIS?.marcarFormularioSucio?.();
      global.HIS?.anunciarCambio?.('Procedimiento ' + (removido && removido.codigo ? removido.codigo : '') + ' removido de la tabla.');
    }

    /**
     * Actualiza la fecha de un procedimiento.
     */
    function cambiarFechaProcedimiento(indice, nuevaFecha) {
      if (esSoloLectura) return;
      if (indice < 0 || indice >= procedimientos.length) return;
      procedimientos[indice].fecha = nuevaFecha;
      global.HIS?.marcarFormularioSucio?.();
    }

    /**
     * Renderiza las filas de la tabla de procedimientos [20.43 - 20.46].
     */
    function renderTablaProcedimientos() {
      var tbody = document.getElementById('tbodyProcedimientos') || document.getElementById('cuerpoTablaProcedimientos');
      if (!tbody) return;

      tbody.innerHTML = '';

      if (procedimientos.length === 0) {
        var trVacio = document.createElement('tr');
        trVacio.id = 'filaSinProcedimientos';
        trVacio.innerHTML = '<td colspan="4" class="text-center text-muted py-4">' +
          '<div class="d-flex flex-column align-items-center gap-1">' +
            '<span class="fw-medium">No se han registrado procedimientos CUPS para esta atención.</span>' +
            '<span class="small text-secondary">Utilice el buscador superior para agregar procedimientos realizados.</span>' +
          '</div>' +
        '</td>';
        tbody.appendChild(trVacio);
        return;
      }

      procedimientos.forEach(function (proc, index) {
        var tr = document.createElement('tr');
        tr.className = 'fila-procedimiento align-middle';
        tr.setAttribute('data-cups-id', proc.cups_id || '');
        tr.setAttribute('data-codigo', proc.codigo || '');

        // Columna Código [20.44]
        var tdCodigo = document.createElement('td');
        tdCodigo.className = 'font-monospace fw-bold text-nowrap';
        tdCodigo.innerHTML = '<span class="badge bg-light text-secondary border px-2 py-1 font-monospace">' +
          escapeHtml(proc.codigo || '') +
          '</span>';
        tr.appendChild(tdCodigo);

        // Columna Procedimiento (Descripción) [20.45]
        var tdDesc = document.createElement('td');
        tdDesc.className = 'text-dark small fw-medium';
        tdDesc.textContent = proc.descripcion;
        tr.appendChild(tdDesc);

        // Columna Fecha [20.46]
        var tdFecha = document.createElement('td');
        tdFecha.className = 'text-nowrap';
        var inputFecha = document.createElement('input');
        inputFecha.type = 'date';
        inputFecha.className = 'form-control form-control-sm fecha-proc shadow-none';
        inputFecha.style.maxWidth = '145px';
        inputFecha.setAttribute('data-trace', 'C20-46');
        inputFecha.value = proc.fecha || obtenerFechaHoy();
        inputFecha.max = obtenerFechaHoy();
        if (esSoloLectura) {
          inputFecha.disabled = true;
        } else {
          inputFecha.addEventListener('change', function () {
            cambiarFechaProcedimiento(index, inputFecha.value);
          });
        }
        tdFecha.appendChild(inputFecha);
        tr.appendChild(tdFecha);

        // Columna Acciones / Eliminar
        var tdAccion = document.createElement('td');
        tdAccion.className = 'text-center text-nowrap';
        if (!esSoloLectura) {
          var btnEliminar = document.createElement('button');
          btnEliminar.type = 'button';
          btnEliminar.className = 'btn btn-sm btn-link text-danger text-decoration-none fw-bold p-0 btn-eliminar-proc';
          btnEliminar.setAttribute('title', 'Remover procedimiento');
          btnEliminar.setAttribute('aria-label', 'Remover ' + proc.codigo);
          btnEliminar.textContent = '✕';
          btnEliminar.addEventListener('click', function () {
            removerProcedimiento(index);
          });
          tdAccion.appendChild(btnEliminar);
        } else {
          tdAccion.innerHTML = '<span class="text-muted small">—</span>';
        }
        tr.appendChild(tdAccion);

        tbody.appendChild(tr);
      });
    }

    /**
     * Botón Descartar [20.48]: Restaura los valores originales
     */
    if (btnDescartar && !esSoloLectura) {
      btnDescartar.addEventListener('click', function () {
        diagnosticos = JSON.parse(JSON.stringify(diagnosticosOriginales));
        procedimientos = JSON.parse(JSON.stringify(procedimientosOriginales));
        ocultarAlertaInvalido();
        if (inputCie10) inputCie10.value = '';
        if (inputCups) inputCups.value = '';
        renderTablaDiagnosticos();
        renderTablaProcedimientos();
        global.HIS?.marcarFormularioLimpio?.();
        global.HIS?.anunciarCambio?.('Codificación restaurada a los valores guardados.');
        mostrarMensaje('info', 'Se restauraron los datos originales de la codificación.');
      });
    }

    /**
     * Botón Guardar codificación [20.49]
     */
    if (btnGuardar && !esSoloLectura) {
      btnGuardar.addEventListener('click', function () {
        var validacion = validarCodificacion(diagnosticos, procedimientos);
        if (!validacion.valido) {
          mostrarMensaje('warning', validacion.error);
          return;
        }

        // Preparar payload normalizado según contrato del backend
        var payload = {
          diagnosticos: diagnosticos.map(function (d) {
            return {
              cie10_id: d.cie10_id,
              tipo: d.tipo
            };
          }),
          procedimientos: procedimientos.map(function (p) {
            return {
              cups_id: p.cups_id,
              fecha: p.fecha || obtenerFechaHoy()
            };
          })
        };

        // Mostrar estado cargando en el botón
        btnGuardar.disabled = true;
        if (btnDescartar) btnDescartar.disabled = true;
        if (spinnerGuardar) spinnerGuardar.classList.remove('d-none');
        if (textoBotonGuardar) textoBotonGuardar.textContent = 'Guardando...';

        fetch('/api/atenciones/' + encodeURIComponent(atencionId) + '/codificacion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(payload),
          credentials: 'same-origin'
        })
          .then(function (res) {
            return res.json().then(function (datos) {
              return { status: res.status, ok: res.ok, datos: datos };
            }).catch(function () {
              return { status: res.status, ok: res.ok, datos: {} };
            });
          })
          .then(function (resultado) {
            if (resultado.ok || resultado.status === 200) {
              global.HIS?.marcarFormularioLimpio?.();
              global.HIS?.anunciarCambio?.('Codificación de diagnósticos y procedimientos guardada.');
              mostrarMensaje('success', 'Codificación de diagnósticos y procedimientos guardada exitosamente.');
              diagnosticosOriginales = JSON.parse(JSON.stringify(diagnosticos));
              procedimientosOriginales = JSON.parse(JSON.stringify(procedimientos));
            } else if (resultado.status === 409) {
              var msg409 = sanitizarMensajeError(
                (resultado.datos && resultado.datos.error && resultado.datos.error.mensaje) ||
                'Conflicto: Ya existe un diagnóstico principal o la atención fue cerrada.'
              );
              mostrarMensaje('danger', msg409);
            } else if (resultado.status === 422) {
              var msg422 = sanitizarMensajeError(
                (resultado.datos && resultado.datos.error && resultado.datos.error.mensaje) ||
                'Error de validación: Verifique los diagnósticos y procedimientos ingresados.'
              );
              mostrarMensaje('warning', msg422);
            } else {
              var msgErr = sanitizarMensajeError(
                resultado.datos && resultado.datos.error && resultado.datos.error.mensaje
              );
              mostrarMensaje('danger', msgErr);
            }
          })
          .catch(function (err) {
            mostrarMensaje('danger', 'Error de conexión al guardar la codificación. Intente nuevamente.');
          })
          .finally(function () {
            btnGuardar.disabled = false;
            if (btnDescartar) btnDescartar.disabled = false;
            if (spinnerGuardar) spinnerGuardar.classList.add('d-none');
            if (textoBotonGuardar) textoBotonGuardar.textContent = 'Guardar diagnósticos y procedimientos';
          });
      });
    }

    if (!esSoloLectura) {
      [inputCie10, inputCups].filter(Boolean).forEach(function (inp) {
        inp.addEventListener('input', function () {
          global.HIS?.marcarFormularioSucio?.();
        });
        inp.addEventListener('change', function () {
          global.HIS?.marcarFormularioSucio?.();
        });
      });
    }

    // Renderizado inicial
    renderTablaDiagnosticos();
    renderTablaProcedimientos();
  }

  // Ejecución en carga del DOM
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCodificacion);
    } else {
      initCodificacion();
    }
  }

  // Exportar utilidades para pruebas unitarias en Node.js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      validarCodificacion: validarCodificacion,
      sanitizarMensajeError: sanitizarMensajeError,
      obtenerFechaHoy: obtenerFechaHoy,
      initCodificacion: initCodificacion
    };
  }

})(typeof window !== 'undefined' ? window : globalThis);
