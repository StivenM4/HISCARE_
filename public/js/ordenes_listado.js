// public/js/ordenes_listado.js — Controlador de cliente para Pantalla C.10 (Gestión de órdenes médicas)
(function () {
  'use strict';

  // Elementos DOM
  const form = document.getElementById('formFiltrosOrdenes');
  const inputDesde = document.getElementById('inputDesde');
  const inputHasta = document.getElementById('inputHasta');
  const selectTipo = document.getElementById('selectTipo');
  const selectEstado = document.getElementById('selectEstado');
  const filtroPage = document.getElementById('filtroPage');

  const alertaValidacion = document.getElementById('alertaValidacionFechas');
  const textoAlerta = document.getElementById('textoAlertaValidacion');
  const btnCerrarAlerta = document.getElementById('btnCerrarAlerta');

  const contadorTotal = document.getElementById('contadorTotal');
  const contadorPendientes = document.getElementById('contadorPendientes');
  const contadorEnProceso = document.getElementById('contadorEnProceso');
  const contadorCompletadas = document.getElementById('contadorCompletadas');
  const cintaItems = document.querySelectorAll('.cinta-item');

  const contenedorTabla = document.getElementById('contenedorTablaOrdenes');
  const tablaBody = document.getElementById('tablaOrdenesBody');
  const estadoVacio = document.getElementById('estadoVacio');
  const contenedorPaginacion = document.getElementById('contenedorPaginacion');
  const listaPaginacion = document.getElementById('listaPaginacion');
  const indicadorCargando = document.getElementById('indicadorCargando');

  const LIMITE_POR_PAGINA = 20;
  const MAX_DIAS_RANGO = 92;

  /**
   * Escapa caracteres HTML para prevenir XSS.
   */
  function escaparHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * Muestra mensaje de alerta amigable de validación de formulario.
   */
  function mostrarAlerta(mensaje) {
    if (textoAlerta && alertaValidacion) {
      textoAlerta.textContent = mensaje;
      alertaValidacion.classList.remove('d-none');
    } else if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.mostrarMensaje === 'function') {
      window.HIS.mostrarMensaje('warning', mensaje);
    } else if (typeof alert === 'function') {
      alert(mensaje);
    }
  }

  /**
   * Oculta la alerta de validación si está visible.
   */
  function ocultarAlerta() {
    if (alertaValidacion) {
      alertaValidacion.classList.add('d-none');
    }
  }

  if (btnCerrarAlerta) {
    btnCerrarAlerta.addEventListener('click', ocultarAlerta);
  }

  /**
   * Valida en cliente el rango de fechas:
   * - desde <= hasta
   * - diferencia máxima de 92 días
   */
  function validarRangoFechas() {
    ocultarAlerta();
    if (!inputDesde || !inputHasta) return true;

    const valDesde = inputDesde.value;
    const valHasta = inputHasta.value;

    if (!valDesde || !valHasta) {
      mostrarAlerta('Debe especificar ambas fechas (desde y hasta) para la búsqueda.');
      return false;
    }

    const fechaDesde = new Date(valDesde + 'T00:00:00');
    const fechaHasta = new Date(valHasta + 'T00:00:00');

    if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
      mostrarAlerta('Las fechas ingresadas tienen un formato inválido.');
      return false;
    }

    if (fechaDesde > fechaHasta) {
      mostrarAlerta('La fecha inicial (desde) no puede ser posterior a la fecha final (hasta).');
      inputDesde.focus();
      return false;
    }

    const diffMs = fechaHasta.getTime() - fechaDesde.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias > MAX_DIAS_RANGO) {
      mostrarAlerta(`El rango de fechas no puede exceder ${MAX_DIAS_RANGO} días (aproximadamente 3 meses). Actualmente abarca ${diffDias} días.`);
      inputHasta.focus();
      return false;
    }

    return true;
  }

  /**
   * Actualiza el estilo activo de los ítems de la cinta según el estado seleccionado.
   */
  function actualizarEstiloCinta(estadoActivo) {
    cintaItems.forEach(item => {
      const estadoItem = item.getAttribute('data-filtro-estado') || '';
      item.classList.remove(
        'border-primary', 'bg-primary', 'bg-opacity-10', 'shadow-sm',
        'border-secondary', 'bg-secondary',
        'border-warning', 'bg-warning',
        'border-success', 'bg-success'
      );
      item.classList.add('bg-light');

      if (estadoItem === estadoActivo) {
        item.classList.remove('bg-light');
        if (estadoItem === 'PENDIENTE') {
          item.classList.add('border-secondary', 'bg-secondary', 'bg-opacity-10', 'shadow-sm');
        } else if (estadoItem === 'EN_PROCESO') {
          item.classList.add('border-primary', 'bg-primary', 'bg-opacity-10', 'shadow-sm');
        } else if (estadoItem === 'COMPLETADA') {
          item.classList.add('border-success', 'bg-success', 'bg-opacity-10', 'shadow-sm');
        } else {
          item.classList.add('border-primary', 'bg-primary', 'bg-opacity-10', 'shadow-sm');
        }
      }
    });
  }

  /**
   * Helper para formatear fechas a DD/MM/YYYY.
   */
  function formatFecha(fechaRaw) {
    if (!fechaRaw) return '—';
    if (typeof fechaRaw === 'string' && fechaRaw.includes('/') && fechaRaw.length >= 10) {
      return fechaRaw.split(' ')[0];
    }
    const d = new Date(fechaRaw);
    if (isNaN(d.getTime())) return String(fechaRaw);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()}`;
  }

  /**
   * Capitaliza texto de tipo (Laboratorio / Radiología).
   */
  function formatTipo(tipoRaw) {
    if (!tipoRaw) return '—';
    const s = String(tipoRaw).toUpperCase();
    if (s === 'LABORATORIO') return 'Laboratorio';
    if (s === 'RADIOLOGIA') return 'Radiología';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  /**
   * Renderiza el badge para el estado de la orden diagnóstica [10.36, 10.39].
   */
  function renderBadgeEstadoOrden(estado) {
    const e = String(estado || '').toUpperCase();
    if (e === 'PENDIENTE') {
      return `<span class="badge bg-secondary text-white px-2 py-1" data-trace="C10-39">PENDIENTE</span>`;
    }
    if (e === 'EN_PROCESO') {
      return `<span class="badge bg-primary text-white px-2 py-1" data-trace="C10-39">EN_PROCESO</span>`;
    }
    if (e === 'COMPLETADA') {
      return `<span class="badge bg-success text-white px-2 py-1" data-trace="C10-39">COMPLETADA</span>`;
    }
    if (e === 'CANCELADA') {
      return `<span class="badge bg-danger text-white px-2 py-1" data-trace="C10-39">CANCELADA</span>`;
    }
    return `<span class="badge bg-secondary text-white px-2 py-1" data-trace="C10-39">${escaparHtml(estado || '—')}</span>`;
  }

  /**
   * Renderiza el badge para el estado del resultado clínico realizado del paciente [10.37, 10.40].
   */
  function renderBadgeEstadoEnvio(ordenIdOrObj, estadoEnvio, estadoParam, resultadoIdParam) {
    let estado = estadoParam;
    let resultadoId = resultadoIdParam;

    if (typeof ordenIdOrObj === 'object' && ordenIdOrObj !== null) {
      estado = ordenIdOrObj.estado;
      resultadoId = ordenIdOrObj.resultado_id;
    }

    const est = String(estado || '').toUpperCase();
    if (resultadoId || est === 'COMPLETADA') {
      return '<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" data-trace="C10-40">REALIZADO</span>';
    }
    if (est === 'EN_PROCESO') {
      return '<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1" data-trace="C10-40">EN TOMA / PROCESO</span>';
    }
    if (est === 'PENDIENTE') {
      return '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1" data-trace="C10-40">PENDIENTE</span>';
    }
    if (est === 'CANCELADA') {
      return '<span class="text-muted" data-trace="C10-40">—</span>';
    }
    return '<span class="text-muted" data-trace="C10-40">—</span>';
  }

  /**
   * Renderiza la acción [10.38, 10.41]: "Ver resultado" si tiene resultado_id,
   * o "Cargar resultado" si está pendiente/en proceso sin resultado, botón "Imprimir" y "Ver atención".
   */
  function renderAccion(o) {
    const resultadoId = o.resultado_id || null;
    const ordenId = o.id;
    const codigoOrden = o.codigo || '';
    const estado = o.estado;

    let html = '<div class="d-inline-flex align-items-center gap-1">';

    if (resultadoId) {
      html += `<a href="/resultados/${encodeURIComponent(resultadoId)}"
                 class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 shadow-sm"
                 data-trace="C10-41"
                 title="Ver resultado de examen">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                  <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
                </svg>
                <span>Ver resultado</span>
              </a>`;
    } else if (!resultadoId && (estado === 'PENDIENTE' || estado === 'EN_PROCESO')) {
      html += `<a href="/resultados/carga?orden=${encodeURIComponent(codigoOrden)}"
                 class="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1 shadow-sm"
                 data-trace="C10-41-DESPACHO"
                 title="Cargar resultado de examen">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                  <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
                </svg>
                <span>Cargar resultado</span>
              </a>`;
    }

    // Botón Imprimir
    html += `<a href="/ordenes/${encodeURIComponent(ordenId)}/imprimir"
               target="_blank"
               class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1 shadow-sm"
               data-trace="C7-LISTA-BTN-IMPRIMIR"
               title="Imprimir volante oficial">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/>
                <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/>
              </svg>
              <span>Imprimir</span>
            </a>`;

    // Botón Ver atención si tiene atencion_id
    if (o.atencion_id) {
      html += `<a href="/atenciones/${encodeURIComponent(o.atencion_id)}/ordenes"
                 class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 shadow-sm"
                 data-trace="C7-LISTA-BTN-VER-ATENCION"
                 title="Ver en la atención clínica">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 1 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
                </svg>
                <span>Ver atención</span>
              </a>`;
    }

    html += '</div>';
    return html;
  }

  /**
   * Renderiza el conjunto de filas en la tabla.
   */
  function renderTablaFilas(filas) {
    if (!tablaBody) return;

    const tieneDataTable = Boolean(
      typeof window !== 'undefined' &&
      window.jQuery &&
      window.jQuery.fn &&
      window.jQuery.fn.DataTable &&
      window.jQuery.fn.DataTable.isDataTable('#tablaOrdenes')
    );

    if (!Array.isArray(filas) || filas.length === 0) {
      if (tieneDataTable) {
        window.jQuery('#tablaOrdenes').DataTable().clear().draw();
      } else {
        tablaBody.innerHTML = '';
      }
      if (contenedorTabla) contenedorTabla.classList.add('d-none');
      if (estadoVacio) estadoVacio.classList.remove('d-none');
      return;
    }

    if (contenedorTabla) contenedorTabla.classList.remove('d-none');
    if (estadoVacio) estadoVacio.classList.add('d-none');

    let html = '';
    filas.forEach(o => {
      const nombrePaciente = o.paciente || o.paciente_nombre || '—';
      const documentoTexto = (o.tipo_documento && o.numero_documento)
        ? `${o.tipo_documento} ${o.numero_documento}`
        : (o.documento || '');
      const tipoTexto = formatTipo(o.tipo);
      const isLab = String(o.tipo).toUpperCase() === 'LABORATORIO';
      const badgeTipoClass = isLab
        ? 'badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1'
        : 'badge bg-info-subtle text-info-emphasis border border-info-subtle px-2 py-1';

      // Resumen CUPS si viene en el objeto (o.cups_resumen o procedimientos/items)
      let cupsHtml = '';
      if (o.cups_resumen) {
        cupsHtml = `<div class="small text-muted mt-1 text-truncate" data-trace="C7-LISTA-CUPS" style="max-width: 220px;">${escaparHtml(o.cups_resumen)}</div>`;
      } else {
        const procs = (Array.isArray(o.procedimientos) && o.procedimientos.length > 0)
          ? o.procedimientos
          : ((Array.isArray(o.items) && o.items.length > 0) ? o.items : []);
        if (procs.length > 0) {
          const procsTexto = procs.map(p => (p.codigo ? `${p.codigo} - ` : '') + (p.descripcion || '')).slice(0, 2).join(', ');
          cupsHtml = `<div class="small text-muted mt-1 text-truncate" data-trace="C7-LISTA-CUPS" style="max-width: 220px;">${escaparHtml(procsTexto)}</div>`;
        }
      }

      html += `<tr>
        <td class="ps-4 py-3 text-nowrap">
          <a href="/ordenes/${encodeURIComponent(o.id)}/imprimir"
             target="_blank"
             class="fw-bold font-monospace text-primary text-decoration-none"
             data-trace="C7-LISTA-CODIGO"
             title="Imprimir volante oficial ${escaparHtml(o.codigo || '')}">
            ${escaparHtml(o.codigo || '')}
          </a>
        </td>
        <td class="py-3" data-trace="C7-LISTA-PACIENTE">
          <span class="fw-semibold text-dark">${escaparHtml(nombrePaciente)}</span>
          ${documentoTexto ? `<div class="small text-muted">${escaparHtml(documentoTexto)}</div>` : ''}
        </td>
        <td class="py-3 text-nowrap" data-trace="C7-LISTA-FECHA">
          <span class="text-secondary">${escaparHtml(o.fecha_formateada || formatFecha(o.fecha))}</span>
        </td>
        <td class="py-3 text-nowrap" data-trace="C7-LISTA-TIPO">
          <span class="${badgeTipoClass}">${escaparHtml(tipoTexto)}</span>
          ${cupsHtml}
        </td>
        <td class="py-3 text-nowrap">
          ${renderBadgeEstadoOrden(o.estado)}
        </td>
        <td class="py-3 text-nowrap">
          ${renderBadgeEstadoEnvio(o)}
        </td>
        <td class="pe-4 py-3 text-end text-nowrap">
          ${renderAccion(o)}
        </td>
      </tr>`;
    });

    if (tieneDataTable) {
      const dt = window.jQuery('#tablaOrdenes').DataTable();
      dt.clear();
      const tempTbody = document.createElement('tbody');
      tempTbody.innerHTML = html;
      const nuevasFilas = Array.from(tempTbody.children);
      dt.rows.add(nuevasFilas).draw(false);
    } else {
      tablaBody.innerHTML = html;
      if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
        window.HIS.inicializarDataTable('#tablaOrdenes', { paging: false, info: false, searching: true, ordering: true });
      }
    }
  }

  /**
   * Renderiza los controles de paginación.
   */
  function renderPaginacion(totalRegistros, paginaActual) {
    if (!contenedorPaginacion || !listaPaginacion) return;

    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / LIMITE_POR_PAGINA));

    if (totalPaginas <= 1) {
      contenedorPaginacion.classList.add('d-none');
      listaPaginacion.innerHTML = '';
      return;
    }

    contenedorPaginacion.classList.remove('d-none');

    let html = '';

    // Botón Anterior
    const prevDisabled = (paginaActual <= 1) ? 'disabled' : '';
    html += `<li class="page-item ${prevDisabled}" id="paginacionPrev">
      <a class="page-link" href="#" data-page="${paginaActual - 1}" aria-label="Anterior">&laquo; Anterior</a>
    </li>`;

    // Números de página
    for (let p = 1; p <= totalPaginas; p++) {
      const activeClass = (p === paginaActual) ? 'active' : '';
      html += `<li class="page-item ${activeClass}" data-page-item="${p}">
        <a class="page-link" href="#" data-page="${p}">${p}</a>
      </li>`;
    }

    // Botón Siguiente
    const nextDisabled = (paginaActual >= totalPaginas) ? 'disabled' : '';
    html += `<li class="page-item ${nextDisabled}" id="paginacionNext">
      <a class="page-link" href="#" data-page="${paginaActual + 1}" aria-label="Siguiente">Siguiente &raquo;</a>
    </li>`;

    listaPaginacion.innerHTML = html;
  }

  /**
   * Realiza la consulta asíncrona a /api/ordenes y actualiza totales, tabla y paginación.
   */
  async function consultarOrdenesAjax(pagina) {
    if (!validarRangoFechas()) return;

    const pag = pagina || parseInt(filtroPage ? filtroPage.value : '1', 10) || 1;
    if (filtroPage) filtroPage.value = String(pag);

    const params = new URLSearchParams();
    if (inputDesde && inputDesde.value) params.set('desde', inputDesde.value);
    if (inputHasta && inputHasta.value) params.set('hasta', inputHasta.value);
    if (selectTipo && selectTipo.value) params.set('tipo', selectTipo.value);
    if (selectEstado && selectEstado.value) params.set('estado', selectEstado.value);
    params.set('page', String(pag));

    // Indicador de carga
    if (indicadorCargando) indicadorCargando.classList.remove('d-none');
    if (contenedorTabla) contenedorTabla.style.opacity = '0.5';

    try {
      const url = `/api/ordenes?${params.toString()}`;
      const respuesta = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!respuesta.ok) {
        throw new Error(`Respuesta HTTP ${respuesta.status}`);
      }

      const json = await respuesta.json();

      // Desempaquetado flexible según la respuesta del backend
      let resumen = {};
      let filas = [];
      let total = 0;
      let pageActualRes = pag;

      if (json && json.resumen) {
        resumen = json.resumen || {};
        filas = Array.isArray(json.filas) ? json.filas : [];
        total = json.total != null ? json.total : filas.length;
        pageActualRes = json.page || pag;
      } else if (json && json.ok && json.data) {
        if (json.data.resumen) {
          resumen = json.data.resumen || {};
          filas = Array.isArray(json.data.filas) ? json.data.filas : [];
          total = json.data.total != null ? json.data.total : filas.length;
          pageActualRes = json.data.page || pag;
        } else if (Array.isArray(json.data)) {
          filas = json.data;
          total = filas.length;
          resumen = {
            PENDIENTE: filas.filter(o => o.estado === 'PENDIENTE').length,
            EN_PROCESO: filas.filter(o => o.estado === 'EN_PROCESO').length,
            COMPLETADA: filas.filter(o => o.estado === 'COMPLETADA').length,
            CANCELADA: filas.filter(o => o.estado === 'CANCELADA').length
          };
        }
      } else if (Array.isArray(json)) {
        filas = json;
        total = filas.length;
      }

      // Actualizar contadores de la cinta
      const cPendientes = resumen.PENDIENTE != null ? Number(resumen.PENDIENTE) : 0;
      const cEnProceso = resumen.EN_PROCESO != null ? Number(resumen.EN_PROCESO) : 0;
      const cCompletadas = resumen.COMPLETADA != null ? Number(resumen.COMPLETADA) : 0;
      const cCanceladas = resumen.CANCELADA != null ? Number(resumen.CANCELADA) : 0;
      const cTotal = (total != null && total > 0) ? total : (cPendientes + cEnProceso + cCompletadas + cCanceladas);

      if (contadorTotal) contadorTotal.textContent = String(cTotal);
      if (contadorPendientes) contadorPendientes.textContent = String(cPendientes);
      if (contadorEnProceso) contadorEnProceso.textContent = String(cEnProceso);
      if (contadorCompletadas) contadorCompletadas.textContent = String(cCompletadas);

      // Actualizar estilo activo en la cinta
      const estadoActual = selectEstado ? selectEstado.value : '';
      actualizarEstiloCinta(estadoActual);

      // Actualizar filas de la tabla y paginación
      renderTablaFilas(filas);
      renderPaginacion(total, pageActualRes);
      window.HIS?.anunciarCambio?.(`Listado de órdenes actualizado: ${filas.length} resultados mostrados de ${total} en total.`);

      // Reflejar parámetros en la barra de URL del navegador sin recargar
      if (window.history && window.history.pushState) {
        const nuevaUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.pushState(null, '', nuevaUrl);
      }
    } catch (err) {
      // Fallback transparente al envío de formulario por navegador
      if (form) {
        form.submit();
      }
    } finally {
      if (indicadorCargando) indicadorCargando.classList.add('d-none');
      if (contenedorTabla) contenedorTabla.style.opacity = '1';
    }
  }

  // Evento de envío del formulario de filtros
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (filtroPage) filtroPage.value = '1';
      consultarOrdenesAjax(1);
    });
  }

  // Evento clic en los contadores de la cinta [10.16–10.24]
  cintaItems.forEach(item => {
    item.addEventListener('click', function () {
      const estadoFiltro = this.getAttribute('data-filtro-estado') || '';
      if (selectEstado) {
        selectEstado.value = estadoFiltro;
      }
      if (filtroPage) {
        filtroPage.value = '1';
      }
      actualizarEstiloCinta(estadoFiltro);
      consultarOrdenesAjax(1);
    });

    item.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
      }
    });
  });

  // Delegación de eventos para la paginación interactiva
  document.addEventListener('click', function (e) {
    const enlacePagina = e.target.closest('.page-link');
    if (!enlacePagina) return;

    const parentLi = enlacePagina.closest('.page-item');
    if (parentLi && parentLi.classList.contains('disabled')) {
      e.preventDefault();
      return;
    }

    const pageAttr = enlacePagina.getAttribute('data-page');
    if (pageAttr) {
      e.preventDefault();
      const numPag = parseInt(pageAttr, 10);
      if (!isNaN(numPag) && numPag >= 1) {
        consultarOrdenesAjax(numPag);
      }
    }
  });

  // Sincronizar estilo inicial de la cinta con el select y filtrar automáticamente al cambiar
  if (selectEstado) {
    actualizarEstiloCinta(selectEstado.value);
    selectEstado.addEventListener('change', function () {
      actualizarEstiloCinta(this.value);
      if (filtroPage) filtroPage.value = '1';
      consultarOrdenesAjax(1);
    });
  }

  if (selectTipo) {
    selectTipo.addEventListener('change', function () {
      if (filtroPage) filtroPage.value = '1';
      consultarOrdenesAjax(1);
    });
  }

  // Inicializar DataTables en modo servidor si ya hay filas renderizadas
  if (typeof window !== 'undefined' && window.HIS && typeof window.HIS.inicializarDataTable === 'function') {
    const t = document.getElementById('tablaOrdenes');
    if (t) window.HIS.inicializarDataTable(t, { paging: false, info: false, searching: true, ordering: true });
  }
})();
